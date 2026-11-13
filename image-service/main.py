"""SPHEREx cutout service backed by the public IRSA SIA2 archive."""

from __future__ import annotations

import hashlib
import io
import json
import math
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import numpy as np
import requests
from astropy.io import fits
from astropy.io.votable import parse as parse_votable
from astropy.time import Time
from astropy.wcs import WCS
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image


SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = (
    "spherex_dr1",
    "spherex_dr1_deep",
    "spherex_qr3",
    "spherex_qr3_deep",
)
CACHE_ROOT = Path(os.environ.get("SPHEREX_CACHE_DIR", Path(__file__).parent / "cache"))
QUERY_CACHE_TTL_SECONDS = int(os.environ.get("SPHEREX_CACHE_TTL", "21600"))
# Each frame requires a separate archive cutout and FITS render. Keep the
# synchronous response bounded so the .NET API can return a frame list promptly.
MAX_FRAMES = int(os.environ.get("SPHEREX_MAX_FRAMES", "6"))
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("SPHEREX_REQUEST_TIMEOUT", "60"))
SAFE_ID = re.compile(r"^spherex-[0-9a-f]{20}$")

app = FastAPI(title="Skytime SPHEREx Image Service", version="1.0.0")


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _column(row, name: str, default=None):
    try:
        value = row[name]
    except (KeyError, IndexError):
        return default
    if value is None or np.ma.is_masked(value):
        return default
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if isinstance(value, np.generic):
        value = value.item()
    return value


def _query_sia(ra: float, dec: float, size: float) -> list[dict]:
    params = [
        ("COLLECTION", collection) for collection in COLLECTIONS
    ] + [
        ("POS", f"CIRCLE {ra:.8f} {dec:.8f} {size / 2:.6f}"),
        ("DPTYPE", "image"),
        ("CALIB", "2"),
        ("FORMAT", "image/fits"),
        # Keep archive responses bounded: the SPHEREx epoch/band products can
        # otherwise make a single cone search produce multi-megabyte tables.
        ("MAXREC", "50"),
        ("RESPONSEFORMAT", "VOTABLE"),
    ]
    try:
        response = requests.get(SIA_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        # IRSA includes both FIELD name and ID attributes. Astropy otherwise
        # prefers the generic IDs (col_0, col_1, ...) over the SIA column names.
        table = parse_votable(io.BytesIO(response.content)).get_first_table().to_table(
            use_names_over_ids=True
        )
    except requests.Timeout as exc:
        raise _error(504, "IMAGE_SERVICE_TIMEOUT", "IRSA timed out while searching for SPHEREx images.") from exc
    except requests.RequestException as exc:
        raise _error(502, "UPSTREAM_ERROR", "IRSA could not complete the SPHEREx image search.") from exc
    except Exception as exc:
        raise _error(502, "UPSTREAM_ERROR", "IRSA returned an unreadable SPHEREx search response.") from exc

    results: list[dict] = []
    seen: set[str] = set()
    for row in table:
        access_url = str(_column(row, "access_url", "")).strip()
        if not access_url.startswith("https://irsa.ipac.caltech.edu/"):
            continue
        obs_id = str(_column(row, "obs_publisher_did", _column(row, "obs_id", access_url))).strip()
        if not obs_id or obs_id in seen:
            continue
        seen.add(obs_id)
        try:
            mjd = float(_column(row, "t_min"))
            if not math.isfinite(mjd):
                continue
        except (TypeError, ValueError):
            continue
        collection = str(_column(row, "obs_collection", ""))
        results.append({
            "key": obs_id,
            "accessUrl": access_url,
            "mjd": mjd,
            "collection": collection,
            "emMin": _optional_float(_column(row, "em_min")),
            "emMax": _optional_float(_column(row, "em_max")),
            "obsId": str(_column(row, "obs_id", obs_id)),
        })

    # Prefer the consolidated DR1 product if the same pointing is also present in QR3.
    results.sort(key=lambda item: (item["mjd"], 0 if "dr1" in item["collection"] else 1, item["key"]))
    return results[:MAX_FRAMES]


def _optional_float(value) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _cutout_url(access_url: str, ra: float, dec: float, size: float) -> str:
    parts = urlsplit(access_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.update({"center": f"{ra:.8f},{dec:.8f}", "size": f"{size:.5f}"})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _orient_north_up_east_left(data: np.ndarray, header) -> np.ndarray:
    image = np.asarray(data, dtype=np.float64)
    if image.ndim > 2:
        image = np.squeeze(image)
    if image.ndim != 2:
        raise ValueError("The FITS IMAGE extension is not a two-dimensional image.")

    try:
        key = "A" if "CTYPE1A" in header else " "
        wcs = WCS(header, key=key)
        height, width = image.shape
        left = wcs.pixel_to_world(0, (height - 1) / 2)
        right = wcs.pixel_to_world(width - 1, (height - 1) / 2)
        bottom = wcs.pixel_to_world((width - 1) / 2, 0)
        top = wcs.pixel_to_world((width - 1) / 2, height - 1)
        delta_ra = ((float(right.ra.deg) - float(left.ra.deg) + 180) % 360) - 180
        if delta_ra > 0:
            image = np.fliplr(image)
        if float(top.dec.deg) < float(bottom.dec.deg):
            image = np.flipud(image)
    except Exception:
        # Some older FITS products omit a usable WCS; keep their native orientation.
        pass
    return image


def _render_png(fits_bytes: bytes) -> tuple[bytes, int, int, list[str]]:
    try:
        with fits.open(io.BytesIO(fits_bytes), memmap=False) as hdul:
            try:
                science = hdul["IMAGE"]
            except (KeyError, IndexError):
                science = next(hdu for hdu in hdul if getattr(hdu, "data", None) is not None)
            image = _orient_north_up_east_left(science.data, science.header)
            flags: list[str] = []
            try:
                flag_data = np.asarray(hdul["FLAGS"].data)
                if np.any(flag_data != 0):
                    flags.append("quality_flags_present")
            except (KeyError, IndexError, TypeError):
                pass
    except Exception as exc:
        raise ValueError("IRSA returned an unreadable FITS cutout.") from exc

    finite = image[np.isfinite(image)]
    if finite.size == 0:
        raise ValueError("FITS cutout contains no finite science pixels.")
    low, high = np.nanpercentile(finite, (1.0, 99.5))
    if not high > low:
        high = low + 1.0
    scaled = np.clip((image - low) / (high - low), 0.0, 1.0)
    scaled = np.nan_to_num(scaled, nan=0.0, posinf=1.0, neginf=0.0)
    pixels = np.asarray(np.round(scaled * 255), dtype=np.uint8)
    height, width = pixels.shape
    output = io.BytesIO()
    Image.fromarray(pixels, mode="L").save(output, format="PNG", optimize=True)
    return output.getvalue(), width, height, flags


def _query_key(ra: float, dec: float, size: float) -> str:
    return hashlib.sha256(f"{ra:.4f}|{dec:.4f}|{size:.3f}".encode()).hexdigest()[:24]


def _cache_dirs() -> tuple[Path, Path]:
    images = CACHE_ROOT / "images"
    queries = CACHE_ROOT / "queries"
    images.mkdir(parents=True, exist_ok=True)
    queries.mkdir(parents=True, exist_ok=True)
    return images, queries


def _cached_query(query_key: str, now: float) -> dict | None:
    _, query_dir = _cache_dirs()
    cache_path = query_dir / f"{query_key}.json"
    try:
        if now - cache_path.stat().st_mtime <= QUERY_CACHE_TTL_SECONDS:
            return json.loads(cache_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return None


DOWNLOAD_ATTEMPTS = int(os.environ.get("SPHEREX_DOWNLOAD_ATTEMPTS", "3"))


def _fetch_and_render(url: str) -> tuple[bytes, int, int, list[str]]:
    """Download an IRSA cutout and render it, tolerating dropped connections.

    IRSA cutouts are ~4 MB FITS files, but nearly all of that is the trailing
    EPSF PSF table, which is never rendered. IRSA often resets the connection
    mid-transfer, so a partial body that still holds the IMAGE extension is
    accepted. If a partial body cannot be rendered, retry from scratch.
    """
    last_error: Exception | None = None
    for _ in range(max(1, DOWNLOAD_ATTEMPTS)):
        body = bytearray()
        download_error: requests.RequestException | None = None
        try:
            with requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS, stream=True) as response:
                response.raise_for_status()
                for chunk in response.iter_content(chunk_size=65536):
                    body.extend(chunk)
        except requests.Timeout as exc:
            if not body:
                last_error = exc
                continue
            download_error = exc
        except requests.RequestException as exc:
            if isinstance(exc, requests.HTTPError):
                raise
            download_error = exc

        if body:
            try:
                return _render_png(bytes(body))
            except ValueError as exc:
                last_error = download_error or exc
                continue
        last_error = download_error or ValueError("IRSA returned an empty cutout.")

    if last_error is None:
        raise ValueError("IRSA could not provide a SPHEREx cutout.")
    raise last_error


def _download_and_cache(item: dict, ra: float, dec: float, size: float) -> tuple[str, int, int, list[str]]:
    image_dir, _ = _cache_dirs()
    image_id = "spherex-" + hashlib.sha256(item["key"].encode()).hexdigest()[:20]
    output_path = image_dir / f"{image_id}.png"
    if output_path.exists():
        try:
            with Image.open(output_path) as image:
                return image_id, image.width, image.height, []
        except OSError:
            output_path.unlink(missing_ok=True)

    try:
        png_bytes, width, height, flags = _fetch_and_render(_cutout_url(item["accessUrl"], ra, dec, size))
    except requests.Timeout as exc:
        raise _error(504, "IMAGE_SERVICE_TIMEOUT", "IRSA timed out while creating a SPHEREx cutout.") from exc
    except requests.RequestException as exc:
        raise _error(502, "UPSTREAM_ERROR", "IRSA could not download a SPHEREx cutout.") from exc
    except ValueError as exc:
        raise _error(502, "UPSTREAM_ERROR", str(exc)) from exc

    temp_path = output_path.with_suffix(".tmp")
    temp_path.write_bytes(png_bytes)
    temp_path.replace(output_path)
    return image_id, width, height, flags


def _image_manifest_path(image_id: str) -> Path:
    _, query_dir = _cache_dirs()
    return query_dir / f"{image_id}.image.json"


def _date_from_mjd(mjd: float) -> str:
    return str(Time(mjd, format="mjd", scale="utc").to_value("iso", subfmt="date"))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/cutout")
def cutout(
    ra: float | None = Query(default=None),
    dec: float | None = Query(default=None),
    size: float | None = Query(default=None),
) -> dict:
    if ra is None or not 0 <= ra <= 360:
        raise _error(400, "INVALID_RA", "RA must be between 0 and 360.")
    if dec is None or not -90 <= dec <= 90:
        raise _error(400, "INVALID_DEC", "Dec must be between -90 and 90.")
    if size is None or not 0.01 <= size <= 0.5:
        raise _error(400, "INVALID_FOV", "Size must be between 0.01 and 0.5 degrees.")

    query_key = _query_key(ra, dec, size)
    cached = _cached_query(query_key, time.time())
    if cached is not None:
        return cached

    candidates = _query_sia(ra, dec, size)
    if not candidates:
        raise _error(404, "NO_DATA", "IRSA returned no SPHEREx images covering this position.")

    frames = []
    _, query_dir = _cache_dirs()
    for item in candidates:
        image_id = "spherex-" + hashlib.sha256(item["key"].encode()).hexdigest()[:20]
        manifest = {"item": item, "ra": ra, "dec": dec, "size": size}
        manifest_path = _image_manifest_path(image_id)
        manifest_temp = manifest_path.with_suffix(".tmp")
        manifest_temp.write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
        manifest_temp.replace(manifest_path)
        detector_match = re.search(r"D([1-6])_spx", item["accessUrl"], re.IGNORECASE)
        detector = int(detector_match.group(1)) if detector_match else 1
        em_min = item["emMin"]
        em_max = item["emMax"]
        # SPHEREx pixels are about 6.2 arcsec; actual dimensions arrive with the PNG.
        approximate_pixels = max(1, int(round(size * 3600 / 6.2)))
        frames.append({
            "id": image_id,
            "mjd": item["mjd"],
            "date": _date_from_mjd(item["mjd"]),
            "detector": detector,
            "wavelengthMin": em_min * 1_000_000 if em_min is not None else 0.75,
            "wavelengthMax": em_max * 1_000_000 if em_max is not None else 5.0,
            "width": approximate_pixels,
            "height": approximate_pixels,
            "flags": [],
        })
    frames.sort(key=lambda frame: (frame["mjd"], frame["detector"], frame["id"]))
    result = {"ra": ra, "dec": dec, "fov": size, "count": len(frames), "frames": frames}

    cache_path = query_dir / f"{query_key}.json"
    temp_path = cache_path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    temp_path.replace(cache_path)
    return result


@app.get("/image/{image_id}")
def image(image_id: str):
    if not SAFE_ID.fullmatch(image_id):
        raise _error(404, "FRAME_NOT_FOUND", "Frame image not found.")
    image_dir, _ = _cache_dirs()
    path = image_dir / f"{image_id}.png"
    if not path.is_file():
        manifest_path = _image_manifest_path(image_id)
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            _download_and_cache(
                manifest["item"],
                float(manifest["ra"]),
                float(manifest["dec"]),
                float(manifest["size"]),
            )
        except FileNotFoundError as exc:
            raise _error(404, "FRAME_NOT_FOUND", "Frame image not found.") from exc
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            raise _error(404, "FRAME_NOT_FOUND", "Frame image not found.") from exc
    return FileResponse(path, media_type="image/png", filename=f"{image_id}.png")


@app.exception_handler(HTTPException)
async def http_error_handler(request, exc: HTTPException):
    detail = exc.detail
    if not isinstance(detail, dict):
        detail = {"code": "INTERNAL_ERROR", "message": str(detail)}
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": detail.get("code", "INTERNAL_ERROR"), "message": detail.get("message", "Request failed.")}},
    )



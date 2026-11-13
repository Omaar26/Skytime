# API Contract: SPHEREx Sky Viewer

**Version:** 1.0 (hackathon)
**Rule #1:** This file is the single source of truth. If you want to change something, tell everyone in the team chat first, then edit this file and commit it. Never change a field name silently.

## 0. Big picture

```
Frontend (React, :5173)  ──►  Backend (.NET, :5012)  ──►  Image service (Python, :8000)  ──►  NASA IRSA
        Contract A                    Contract B
```

- **Contract A** is public: frontend ↔ backend.
- **Contract B** is internal: backend ↔ image service. The frontend never calls the image service directly.

**Agreed ports** (so nobody has to guess):

| Service | Port | How to start |
|---|---|---|
| Backend (.NET) | 5012 | `dotnet run` (checked-in launch profile) |
| Image service (Python) | 8000 | `uvicorn main:app --port 8000` |
| Frontend | 5173 | `npm run dev` (Vite default) |

## 1. Conventions (apply everywhere)

| Thing | Rule |
|---|---|
| Coordinates | **Decimal degrees**, ICRS/J2000. `ra` is 0 to 360, `dec` is -90 to 90. |
| Field of view (`fov`) | **Degrees**, the width of the square cutout. Default `0.1`, min `0.01`, max `0.5`. |
| Wavelengths | **Micrometers (µm)**. |
| Dates | `mjd` is a number (Modified Julian Date). `date` is `yyyy-MM-dd` (UTC). |
| JSON keys | **camelCase**. |
| Order of frames | Always sorted by `mjd`, **oldest first**. |
| Detector | Integer **1 to 6**. |
| IDs | URL-safe strings (letters, digits, `_`, `-`). Stable: the same image always gets the same id. |

## 2. Contract A: Frontend ↔ Backend

Base URL: `http://localhost:5012`

### A1. `GET /api/frames`: list the frames for a patch of sky

**Query parameters**

| Name | Required | Type | Default | Notes |
|---|---|---|---|---|
| `ra` | yes | number | | 0 to 360 |
| `dec` | yes | number | | -90 to 90 |
| `fov` | no | number | 0.1 | 0.01 to 0.5 |

**Example:** `GET /api/frames?ra=133.7951&dec=-7.2452&fov=0.1`

**200 OK response**

```json
{
  "ra": 133.7951,
  "dec": -7.2452,
  "fov": 0.1,
  "count": 3,
  "frames": [
    {
      "id": "mock-wise-0855-0",
      "mjd": 60800.0,
      "date": "2026-11-13",
      "detector": 1,
      "wavelengthMin": 0.75,
      "wavelengthMax": 1.1,
      "width": 200,
      "height": 200,
      "flags": ["simulated"],
      "imageUrl": "/api/frames/mock-wise-0855-0/image"
    }
  ]
}
```

**Frame fields**

| Field | Type | Notes |
|---|---|---|
| `id` | string | Used to build the image address. |
| `mjd` | number | For sorting and for the time display. |
| `date` | string | Human-readable date, `yyyy-MM-dd`. |
| `detector` | int | 1 to 6. |
| `wavelengthMin`, `wavelengthMax` | number | µm. |
| `width`, `height` | int | Image size in pixels. |
| `flags` | string[] | Warnings such as `"contaminated"`. **Empty array** if none, never `null`. |
| `imageUrl` | string | **Relative** to the backend base URL. The frontend prepends `http://localhost:5012`. |

`frames` is an empty array (not an error) if the request was valid but there are no images. `count` equals `frames.length`.

### A2. `GET /api/frames/{id}/image`: the picture

- Returns image bytes with `Content-Type: image/svg+xml` for the simulated sample frames. The SVG includes a `SIMULATED` label. Catalog sample observations continue to return PNGs.
- **Image rules, which the animation depends on:**
  1. All frames from one query have the **same width and height**.
  2. All frames are **centered on the requested `ra`/`dec`**, so a fixed star stays at the same pixel and a moving object visibly shifts.
  3. **North is up, east is left**, in every frame.

### A3. `GET /api/targets`: preset buttons

Returns the test targets from the challenge so the frontend doesn't hardcode them.

```json
[
  { "name": "Barnard's Star", "ra": 269.452077, "dec": 4.693365, "fov": 0.1 },
  { "name": "Epsilon Indi B (Ba/Bb)", "ra": 331.0656, "dec": -56.7901, "fov": 0.1 },
  { "name": "WISE 0855", "ra": 133.795129, "dec": -7.245147, "fov": 0.1 },
  { "name": "RW Aurigae", "ra": 76.956526, "dec": 30.401438, "fov": 0.1 },
  { "name": "R Draconis", "ra": 248.167611, "dec": 66.754979, "fov": 0.1 }
]
```

Coordinates are J2000 sample target coordinates in `data/targets.json`. Each preset resolves to eight generated frames with target-specific IDs. Their `simulated` flag and image label are intentional: these are UI/demo frames, not observed SPHEREx data. Coordinates are from [SIMBAD for Barnard's Star](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Barnard%27s+Star), [SIMBAD for RW Aurigae](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=RW+Aur), and [SIMBAD for R Draconis](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=V%2A+R+Dra); WISE 0855 is from the challenge text; Epsilon Indi B uses the [SIMPLE Brown Dwarf Archive entry](https://simple-bd-archive.org/load_solo/epsilon%20IndiB).

### A4. Errors (all endpoints)

Every error uses the same shape:

```json
{ "error": { "code": "INVALID_RA", "message": "RA must be between 0 and 360." } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `INVALID_RA`, `INVALID_DEC`, `INVALID_FOV` | Bad or missing input. |
| 404 | `FRAME_NOT_FOUND` | Unknown image id. |
| 502 | `IMAGE_SERVICE_ERROR` | The image service failed or returned garbage. |
| 504 | `IMAGE_SERVICE_TIMEOUT` | NASA or the image service took too long. |

The frontend should show `error.message` to the user and show a loading state while waiting. The first request for a new patch can take many seconds, and repeats are fast because of caching.

### A5. Frontend page URL (so the tool can be embedded)

`http://localhost:5173/?ra=133.7951&dec=-7.2452&fov=0.1`

The page reads `ra`, `dec`, and `fov` from the address on load and starts automatically if `ra` and `dec` are present. The page updates the address when the user submits a new search.

## 3. Contract B: Backend ↔ Image service

Base URL: `http://localhost:8000`. Internal only.

### B1. `GET /health`

Returns `200 {"status":"ok"}`. Used by the backend to check the service is alive.

### B2. `GET /cutout?ra=&dec=&size=`

`size` is the field of view in degrees (same as `fov`). Returns the **same JSON shape as A1**, except `imageUrl` is omitted, because the backend builds it from the `id`.

```json
{
  "ra": 133.7951, "dec": -7.2452, "fov": 0.1,
  "frames": [
    { "id": "d3_60800_a1b2c3", "mjd": 60800.5, "date": "2026-11-13", "detector": 3,
      "wavelengthMin": 1.2, "wavelengthMax": 1.5, "width": 128, "height": 128, "flags": [] }
  ]
}
```

- The service searches SPHEREx DR1 and QR3 products at IRSA and returns frame metadata without downloading every image. It saves each image's cutout details; `/image/{id}` downloads, renders, and caches that PNG on first request.
- Error responses use `{"error":{"code":"...","message":"..."}}` with these codes: `NO_DATA` (HTTP 404), `UPSTREAM_ERROR` (HTTP 502). The backend maps `NO_DATA` to a successful response with an empty `frames` array and maps upstream failures to its A4 error codes.

### B3. `GET /image/{id}`

Returns `image/png` bytes for a frame id previously returned by `/cutout`. `404` if unknown.

## 4. Backend behavior (for the backend team)

- Cache key: `ra` and `dec` rounded to 4 decimals, plus `fov` rounded to 3 decimals.
- `DataMode` in `appsettings.json` selects `mock` or `spherex`. The default is `spherex`, which needs the Python service running. Set `DataMode=mock` to use generated frames without it. **The mock must always keep working**, so the frontend is never blocked.
- Mock frames follow this contract. The five presets return distinct IDs and generated SVGs with a dot that moves between frames. Custom coordinates retain a generic simulated fallback.
- CORS: allow any origin during the hackathon.

## 5. Reserved for later (do NOT build until the MVP works)

Do not implement these now. The names are reserved so we don't clash later.

- `GET /api/frames?detector=3`: filter by detector.
- `GET /api/frames?mode=sum|diff`: co-added or subtracted images.
- `GET /api/spectrum?ra=&dec=`: spectrum at a position.

## 6. Checklists

**Backend:** A1, A2, A3, and A4 work with mock data. Then connect B2 and B3.
**Image team:** `/health`, `/cutout`, and `/image/{id}` match section 3. First test target: WISE 0855.
**Frontend:** Build against the mock backend. Read `ra`, `dec`, and `fov` from the address. Handle the empty `frames` array and the error shape.

## 7. Change log

| Date | Change | By |
|---|---|---|
| (start) | v1.0 created | |
| 2026-11-13 | Added five sample target presets with explicitly simulated frame sets | |
| 2026-11-13 | `DataMode` now defaults to `spherex`; `mock` is opt-in | |

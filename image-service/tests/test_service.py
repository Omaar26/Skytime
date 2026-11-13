import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from astropy.io import fits
from astropy.table import Table
from fastapi import HTTPException

import main


def make_test_cutout() -> bytes:
    science = np.arange(64, dtype=np.float32).reshape((8, 8))
    flags = np.zeros((8, 8), dtype=np.uint16)
    primary = fits.PrimaryHDU()
    image = fits.ImageHDU(science, name="IMAGE")
    image.header["CTYPE1A"] = "RA---TAN"
    image.header["CTYPE2A"] = "DEC--TAN"
    image.header["CRPIX1A"] = 4.5
    image.header["CRPIX2A"] = 4.5
    image.header["CRVAL1A"] = 133.7
    image.header["CRVAL2A"] = -7.2
    image.header["CDELT1A"] = -0.001
    image.header["CDELT2A"] = 0.001
    flag_hdu = fits.ImageHDU(flags, name="FLAGS")
    output = io.BytesIO()
    fits.HDUList([primary, image, flag_hdu]).writeto(output)
    return output.getvalue()


class FakeResponse:
    content = make_test_cutout()

    @staticmethod
    def raise_for_status():
        return None

    def iter_content(self, chunk_size=65536):
        content = self.content
        for start in range(0, len(content), chunk_size):
            yield content[start:start + chunk_size]

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


class DroppedResponse(FakeResponse):
    """Delivers the first `keep` bytes, then resets the connection like IRSA does."""

    def __init__(self, keep=None):
        self.keep = keep

    def iter_content(self, chunk_size=65536):
        content = self.content if self.keep is None else self.content[:self.keep]
        for start in range(0, len(content), chunk_size):
            yield content[start:start + chunk_size]
        raise main.requests.exceptions.ChunkedEncodingError("Connection reset by peer")


class ImageServiceTests(unittest.TestCase):
    def setUp(self):
        main.CACHE_ROOT = Path(tempfile.mkdtemp())

    def test_health(self):
        self.assertEqual(main.health(), {"status": "ok"})

    @patch("main.requests.get")
    def test_sia_parser_uses_votable_field_names_not_generic_ids(self, get):
        votable = io.BytesIO()
        Table({
            "access_url": ["https://irsa.ipac.caltech.edu/ibe/data/spherex/test_D3_spx.fits"],
            "obs_publisher_did": ["ivo://irsa/test-observation"],
            "obs_id": ["test-observation"],
            "t_min": [60000.0],
            "obs_collection": ["spherex_dr1"],
            "em_min": [1.2e-6],
            "em_max": [1.3e-6],
        }).write(votable, format="votable")
        get.return_value = FakeResponse()
        get.return_value.content = votable.getvalue()

        results = main._query_sia(133.7, -7.2, 0.1)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["key"], "ivo://irsa/test-observation")
        self.assertEqual(results[0]["collection"], "spherex_dr1")

    @patch("main._query_sia", return_value=[])
    def test_no_results_returns_the_internal_no_data_error(self, query):
        with self.assertRaises(HTTPException) as raised:
            main.cutout(133.7, -7.2, 0.1)
        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail["code"], "NO_DATA")
        query.assert_called_once()

    @patch("main.requests.get", return_value=FakeResponse())
    @patch("main._query_sia")
    def test_cutout_returns_metadata_and_cached_png(self, query, download):
        query.return_value = [{
            "key": "ivo://irsa/test-observation",
            "accessUrl": "https://irsa.ipac.caltech.edu/ibe/data/spherex/test_D3_spx.fits",
            "mjd": 60000.0,
            "collection": "spherex_dr1",
            "emMin": 1.2e-6,
            "emMax": 1.3e-6,
            "obsId": "test-observation",
        }]
        body = main.cutout(133.7, -7.2, 0.1)
        self.assertEqual(body["count"], 1)
        frame = body["frames"][0]
        self.assertEqual(frame["detector"], 3)
        self.assertEqual(frame["date"], "2023-02-25")
        self.assertAlmostEqual(frame["wavelengthMin"], 1.2)
        self.assertNotIn("imageUrl", frame)
        download.assert_not_called()

        image_response = main.image(frame["id"])
        self.assertEqual(image_response.media_type, "image/png")
        self.assertTrue(Path(image_response.path).read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))
        download.assert_called_once()

    def test_dropped_connection_after_image_extension_still_renders(self):
        with patch("main.requests.get", return_value=DroppedResponse()) as get:
            png, width, height, _ = main._fetch_and_render("https://example.test/cutout.fits")
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual((width, height), (8, 8))
        get.assert_called_once()

    def test_unusable_partial_download_is_retried(self):
        responses = [DroppedResponse(keep=100), FakeResponse()]
        with patch("main.requests.get", side_effect=responses) as get:
            png, _, _, _ = main._fetch_and_render("https://example.test/cutout.fits")
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual(get.call_count, 2)

    def test_persistent_download_failure_uses_contract_error_shape(self):
        item = {"key": "ivo://irsa/test-observation", "accessUrl": "https://example.test/a.fits"}
        with patch("main.requests.get", side_effect=lambda *a, **k: DroppedResponse(keep=100)):
            with self.assertRaises(HTTPException) as raised:
                main._download_and_cache(item, 133.7, -7.2, 0.1)
        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail["code"], "UPSTREAM_ERROR")

    def test_invalid_input_uses_contract_error_shape(self):
        with self.assertRaises(HTTPException) as raised:
            main.cutout(500, 0, 0.1)
        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail["code"], "INVALID_RA")

    def test_unknown_image_uses_contract_error_shape(self):
        with self.assertRaises(HTTPException) as raised:
            main.image("not-a-frame")
        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail["code"], "FRAME_NOT_FOUND")


if __name__ == "__main__":
    unittest.main(verbosity=2)

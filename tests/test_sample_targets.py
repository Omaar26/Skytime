"""Live integration checks for the five sample target routes.

Start the .NET API first, then run: python3 tests/test_sample_targets.py
Override the API address with SKYTIME_BASE_URL if needed.
"""

import json
import os
import unittest
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen


BASE_URL = os.environ.get("SKYTIME_BASE_URL", "http://localhost:5012").rstrip("/")


def get(path: str):
    with urlopen(f"{BASE_URL}{path}", timeout=5) as response:
        return response.status, response.headers, response.read()


def get_json(path: str):
    status, _, body = get(path)
    return status, json.loads(body)


class SampleTargetIntegrationTests(unittest.TestCase):
    def test_all_five_presets_have_distinct_simulated_frame_sets(self):
        status, targets = get_json("/api/targets")
        self.assertEqual(status, 200)
        self.assertEqual(len(targets), 5)

        all_ids = set()
        for target in targets:
            query = urlencode({"ra": target["ra"], "dec": target["dec"], "fov": target["fov"]})
            status, result = get_json(f"/api/frames?{query}")
            self.assertEqual(status, 200, target["name"])
            self.assertEqual(result["count"], 8, target["name"])
            self.assertEqual(len(result["frames"]), 8, target["name"])
            self.assertTrue(result["frames"][0]["id"].startswith("mock-"))
            self.assertTrue(all("simulated" in frame["flags"] for frame in result["frames"]))

            frame_ids = {frame["id"] for frame in result["frames"]}
            self.assertEqual(len(frame_ids), 8)
            self.assertFalse(all_ids.intersection(frame_ids), "Different presets must not reuse frame IDs.")
            all_ids.update(frame_ids)

            status, headers, image = get(result["frames"][0]["imageUrl"])
            self.assertEqual(status, 200, target["name"])
            self.assertEqual(headers.get_content_type(), "image/svg+xml")
            self.assertIn(b"SIMULATED", image)

    def test_custom_coordinates_and_legacy_mock_image_still_work(self):
        status, result = get_json("/api/frames?ra=12.5&dec=12.5&fov=0.1")
        self.assertEqual(status, 200)
        self.assertEqual(result["frames"][0]["id"], "mock-custom-0")

        status, headers, image = get("/api/frames/mock5/image")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get_content_type(), "image/svg+xml")
        self.assertIn(b"SIMULATED", image)

    def test_unknown_frame_returns_contract_error(self):
        with self.assertRaises(HTTPError) as raised:
            get("/api/frames/not-a-frame/image")
        self.assertEqual(raised.exception.code, 404)
        try:
            error = json.loads(raised.exception.read())
        finally:
            raised.exception.close()
        self.assertEqual(error["error"]["code"], "FRAME_NOT_FOUND")


if __name__ == "__main__":
    unittest.main(verbosity=2)

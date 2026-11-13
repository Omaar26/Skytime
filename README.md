# Skytime backend

This .NET 10 app combines the Skytime mock frames API with the catalog and image endpoints from the team handoff. The five challenge targets resolve to their own generated demo frame IDs and labeled simulated images.

## Run

```sh
dotnet run
```

The API listens on `http://localhost:5012` when started with the checked-in launch profile.

The real SPHEREx path is implemented in `image-service/`. The app remains in mock mode by default. See [the image service guide](image-service/README.md) to install and run it, then enable `DataMode=spherex` to search IRSA.

## Routes

- `GET /api/frames?ra=...&dec=...&fov=...` — mock frames by default; real IRSA results when `DataMode=spherex`.
- `GET /api/frames/{id}/image` — mock SVG, catalog sample PNG, or SPHEREx PNG cutout.
- `GET /api/targets` — preset sky coordinates.
- `GET /api/catalog/targets` — sample observation catalog.
- `GET /api/catalog/targets/{id}/observations` — observations for a catalog target.
- `GET /images/{targetId}/{filename}` — catalog image files.

The five target definitions are in `data/targets.json`. Their frame sequences and SVG images are generated for the demo and are not observed SPHEREx data. The separate catalog records and PNG fixtures under `data/catalog.json` and `images/` are also sample fixtures, not verified observations.

## Catalog validation

The validator uses only Python's standard library:

```sh
python tools/catalog/validate_catalog.py
```

It intentionally reports errors while the sample catalog contains placeholder values.

## API checks

With the app running, run `python3 tests/test_sample_targets.py` to check all five preset frame sets and images. Set `SKYTIME_BASE_URL` to override the default API address. `tests/catalog-api.ps1` remains the PowerShell smoke check for the handoff catalog routes, CORS, and error responses.

The API contract for the frames and target endpoints is documented in [API_CONTRACT.md](API_CONTRACT.md).

# SPHEREx image service

This FastAPI service implements the backend's internal image-service contract. It searches the public IRSA SIA2 service for SPHEREx DR1 and QR3 images and returns metadata promptly. It requests and renders each IRSA cutout to PNG only when `/image/{id}` is requested, then caches it locally.

## Run

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

Run these commands from `image-service/`. The API is available at `http://localhost:8000`; `/docs` shows the interactive service schema. `SPHEREX_CACHE_DIR` can point the image cache to another writable directory.

## Connect the .NET backend

The .NET backend defaults to `DataMode=spherex`. Start this service, then run Skytime (the variables below are only needed to override the defaults, e.g. `DataMode=mock`):

```sh
DataMode=spherex ImageService__BaseUrl=http://localhost:8000 dotnet run
```

In PowerShell, use `$env:DataMode = "spherex"` and `$env:ImageService__BaseUrl = "http://localhost:8000"`, then run `dotnet run`.

## Routes

- `GET /health`
- `GET /cutout?ra=...&dec=...&size=...`
- `GET /image/{id}`

The service returns an empty frame list when IRSA has no covering SPHEREx products. It does not substitute the two `data/raw` FITS fixtures: one is DSS optical data and one is MSX data, neither is SPHEREx.

## Tests

```sh
python -m unittest discover -s tests -v
```

The tests use synthetic FITS bytes and mocked SIA responses. They do not contact IRSA.

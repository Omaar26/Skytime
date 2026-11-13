# Skytime Frontend

React + Vite frontend for the SPHEREx Sky Viewer (`API_CONTRACT.md`).

## Run locally

1. Start the Python image service on `http://localhost:8000` (from `../image-service`):
   ```sh
   .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
   ```
2. Start the .NET backend on `http://localhost:5012` (from the repo root `..`):
   ```sh
   dotnet run
   ```
   (Set `DataMode=mock dotnet run` to use simulated demo frames without the Python image service.)
3. Start the Vite dev server on `http://localhost:5173` (from `nasa-front/`):
   ```sh
   pnpm install   # or npm ci
   pnpm dev       # or npm run dev
   ```

Vite proxies `/api` and `/images` requests to `http://localhost:5012` by default (override with `VITE_BACKEND_URL`).
To build for production, run `pnpm build` (or `npm run build`); output goes to `dist/`.

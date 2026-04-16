# Backend

The backend is a FastAPI service for uploading web access logs, parsing them into structured events, running rule-based detections, and generating an Ollama-backed AI summary with graceful fallback behavior.

## Backend structure

```text
backend/
  alembic/
  app/
    core/
    db/
    routes/
    services/
    models/
  tests/
  requirements.txt
  README.md
```

## Virtual environment

Use only the repo-root virtual environment. Do not install packages globally.

Windows PowerShell from the repo root:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Linux or macOS from the repo root:

```bash
python -m venv venv
./venv/bin/python -m pip install -r backend/requirements.txt
```

## Environment variables

Copy `.env.example` to `.env` and keep secrets or environment-specific values there:

- `OLLAMA_URL`: primary Ollama base URL, defaults to `http://localhost:11434`
- `OLLAMA_BASE_URL`: optional backward-compatible legacy name
- `OLLAMA_MODEL`: defaults to `mistral`
- `OLLAMA_TIMEOUT_SECONDS`: defaults to `120`
- `ALLOWED_ORIGINS`: comma-separated list of allowed frontend origins
- `DATABASE_URL`: required PostgreSQL URL (example in `.env.example`)
- `GEOIP_ENABLED`: toggles GeoIP lookups (default `true`)
- `GEOIP_PROVIDER_URL`: GeoIP provider base URL
- `GEOIP_CACHE_TTL_SECONDS`: cache TTL in seconds
- `RULES_FILE_PATH`: rules config file path
- `WEBSOCKET_FLUSH_LINE_COUNT`: live stream batch size
- `WEBSOCKET_FLUSH_INTERVAL_SECONDS`: live stream flush interval seconds

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Run the API

From `backend/` on Windows PowerShell:

```powershell
..\venv\Scripts\python.exe -m alembic upgrade head
..\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

From `backend/` on Linux or macOS:

```bash
../venv/bin/python -m uvicorn app.main:app --reload
```

Production-style start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 10000
```

## Database migrations

Run Alembic migrations any time the schema changes:

```powershell
..\venv\Scripts\python.exe -m alembic upgrade head
```

## API endpoints

- `POST /upload-log`
  Accepts `.log` and `.txt` files, validates the upload, parses Apache or Nginx access logs, runs detections, and returns the full analysis snapshot including timeline, campaigns, and risk scoring. Supports optional `case_id`.
- `GET /health`
  Returns backend and Ollama readiness details, including whether the configured model is installed.
- `POST /cases`, `GET /cases`, `GET /cases/{id}`, `POST /cases/{id}/upload`
  Case management endpoints for persistent investigations.
- `GET /rules`, `PUT /rules`
  Rules configuration endpoints for detector thresholds.
- `WS /ws/log-stream`
  WebSocket streaming ingestion for live mode.
- `POST /export-report`
  Returns a PDF incident report for a provided analysis snapshot.

## Ollama behavior

The AI layer sends a compact detections summary to `POST /api/generate` instead of full raw log payloads. If Ollama times out, is unreachable, or returns invalid output, the backend returns a fallback summary and keeps the API successful.

This is important for hosted deployments: if your environment cannot reach Ollama, expect `source: "fallback"` unless you point `OLLAMA_URL` to an external reachable Ollama-compatible endpoint.

## Tests

From `backend/` on Windows PowerShell:

```powershell
$env:PYTHONPATH = (Resolve-Path .).Path
..\venv\Scripts\python.exe -m pytest tests -p no:cacheprovider
```

From `backend/` on Linux or macOS:

```bash
PYTHONPATH=$(pwd) ../venv/bin/python -m pytest tests -p no:cacheprovider
```

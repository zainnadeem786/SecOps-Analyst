# Backend

The backend is a FastAPI service for uploading web access logs, parsing them into structured events, running rule-based detections, and generating an Ollama-backed AI summary with graceful fallback behavior.

## Backend structure

```text
backend/
  app/
    main.py
    core/
      config.py
      logging.py
    routes/
      upload.py
    services/
      parser.py
      detector.py
      ai_explainer.py
    models/
      log_model.py
      schemas.py
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

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Run the API

From `backend/` on Windows PowerShell:

```powershell
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

## API endpoints

- `POST /upload-log`
  Accepts `.log` and `.txt` files, validates the upload, parses Apache or Nginx access logs, runs detections, and returns `events`, `detections`, and `ai_analysis`.
- `GET /health`
  Returns backend and Ollama readiness details, including whether the configured model is installed.

## Ollama behavior

The AI layer sends a compact detections summary to `POST /api/generate` instead of full raw log payloads. If Ollama times out, is unreachable, or returns invalid output, the backend returns a fallback summary and keeps the API successful.

This is important for Render deployments: Render will not run Ollama on the free tier, so hosted deployments should expect `source: "fallback"` unless you point `OLLAMA_URL` to an external reachable Ollama-compatible endpoint.

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

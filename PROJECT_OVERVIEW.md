# Project Overview

Last updated: April 9, 2026

## Project Summary

AI Log Analyzer (SecOps Assistant) is a monorepo with:

- a FastAPI backend for log upload, parsing, detection, and AI-ready analysis
- a Next.js frontend for uploading logs and visualizing results
- a repo-root Python virtual environment (`venv`) for backend dependency isolation

The backend is the most complete part of the project and has already been verified with automated tests and a live upload smoke test. The frontend scaffold and dashboard are also present and build successfully, but the most recent scoped work focused on the backend realignment.

## Current Status

### Backend

Status: implemented and verified

What exists today:

- `POST /upload-log`
  - accepts `.log` and `.txt`
  - validates empty files, unsupported types, oversized files, and unparsable content
  - parses Apache/Nginx-style access logs
  - runs rule-based detections
  - returns:
    - `events`
    - `detections`
    - `ai_analysis`
- `GET /health`
  - reports backend and Ollama readiness
- parser service
  - extracts `ip`, `endpoint`, `status_code`, `timestamp`
  - normalizes paths and handles UTF-8 BOM input
- detector service
  - brute-force detection
  - 404 scanning detection
  - multi-endpoint probe detection
- AI explainer service
  - structured Ollama-ready prompt generation
  - graceful fallback when Ollama is unavailable or returns invalid data
- configuration and logging layer
  - environment-backed settings
  - request-safe error responses
  - application logging
- backend tests
  - parser coverage
  - detector coverage
  - API coverage

### Frontend

Status: scaffolded and verified, but not the latest focus

What exists today:

- Next.js App Router app
- Tailwind-based dashboard UI
- upload panel
- parsed events table
- detection cards
- AI analysis panel
- typed API client in `frontend/services`

### Environment

Status: set up

- repo-root `venv` exists and has backend dependencies installed
- frontend dependencies are installed in `frontend/node_modules`
- frontend production build output exists in `frontend/.next`

## Recent Backend Realignment

The latest backend-focused changes already completed are:

- introduced `backend/app/models/log_model.py` as the canonical model module
- updated backend imports to use `app.models.log_model`
- kept `backend/app/models/schemas.py` as a compatibility shim
- refreshed `backend/README.md` to reflect the backend-only structure and current behavior
- updated `.gitignore` to ignore `pytest-cache-files-*`
- preserved the richer analyzed upload contract instead of downgrading to raw file echo behavior

## Current Backend Structure

```text
backend/
  app/
    main.py
    core/
      config.py
      logging.py
    models/
      log_model.py
      schemas.py
    routes/
      upload.py
    services/
      parser.py
      detector.py
      ai_explainer.py
  tests/
    fixtures/
      sample_access.log
    test_api.py
    test_detector.py
    test_parser.py
  .env.example
  README.md
  requirements.txt
```

## Backend API Contract

### `POST /upload-log`

Returns a JSON payload shaped like:

```json
{
  "events": [
    {
      "ip": "203.0.113.10",
      "endpoint": "/login",
      "status_code": 401,
      "timestamp": "2026-04-09T09:00:01+00:00"
    }
  ],
  "detections": [
    {
      "type": "brute_force",
      "severity": "High",
      "description": "Source IP 203.0.113.10 generated 5 failed authentication attempts against login-related endpoints.",
      "source_ip": "203.0.113.10",
      "count": 5,
      "evidence": [
        "2026-04-09T09:00:01+00:00 | /login | 401"
      ]
    }
  ],
  "ai_analysis": {
    "explanation": "Rule-based analysis identified suspicious patterns.",
    "risk_level": "High",
    "recommended_action": "Investigate the flagged source IPs and harden exposed endpoints.",
    "source": "fallback",
    "warning": "Ollama was unavailable, timed out, or returned invalid JSON."
  }
}
```

### `GET /health`

Returns readiness information for:

- backend status
- Ollama availability
- configured Ollama model
- whether the configured model appears present

## Verification Completed

### Backend verification

Completed successfully:

- Python compile check on backend app and tests
- backend automated tests
  - latest passing result: `17 passed`
- live Windows-style smoke test
  - started Uvicorn with repo-root `venv`
  - uploaded `backend/tests/fixtures/sample_access.log`
  - received `200 OK`
  - parsed `23` events
  - produced `4` detections
  - returned fallback AI analysis when Ollama did not provide a usable response

### Frontend verification

Completed successfully:

- `npm.cmd run lint`
- `npm.cmd run build`

## Known Limitations / Notes

- Ollama is not fully verified end-to-end in this workspace because the backend fell back to heuristic AI output during smoke testing.
- Some old `backend/pytest-cache-files-*` directories created by the local/sandbox environment have restrictive ACLs and could not be removed from this session, but they are now ignored going forward.
- The frontend is present and working, but it was intentionally left untouched during the backend-only realignment.
- `schemas.py` still exists only as a transition shim; new backend imports should use `log_model.py`.

## Recommended Next Steps

### If continuing backend work

- wire Ollama against a confirmed local model/runtime and validate a real non-fallback AI response
- decide whether to keep or trim `multi_endpoint_probe` if the backend should match a narrower initial detection scope
- optionally remove the `schemas.py` shim after all imports and external references are fully migrated

### If resuming frontend work

- connect the current dashboard to the finalized backend contract only
- add user-facing states for Ollama fallback versus true AI output
- decide whether to add frontend tests or keep build/lint verification only

## Key Files

- `backend/app/main.py`
- `backend/app/routes/upload.py`
- `backend/app/services/parser.py`
- `backend/app/services/detector.py`
- `backend/app/services/ai_explainer.py`
- `backend/app/models/log_model.py`
- `backend/tests/test_api.py`
- `frontend/components/Dashboard.tsx`
- `frontend/services/api.ts`


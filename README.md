# AI Log Analyzer (SecOps Assistant)

AI Log Analyzer is a full-stack SecOps helper that ingests web access logs, parses them into structured events, applies rule-based detection logic, and enriches the result with a live Ollama summary or a safe fallback analysis.

## Monorepo layout

```text
.
|-- backend
|   |-- app
|   |-- tests
|   |-- requirements.txt
|   `-- README.md
|-- frontend
|   |-- app
|   |-- components
|   |-- lib
|   |-- package.json
|   `-- README.md
|-- render.yaml
|-- netlify.toml
`-- venv
```

## Local setup

### 1. Create the Python virtual environment

Use only the repo-root `venv`. Do not install backend dependencies globally.

Windows PowerShell:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Linux or macOS:

```bash
python -m venv venv
./venv/bin/python -m pip install -r backend/requirements.txt
```

### 2. Configure environment files

Backend:

```powershell
Copy-Item backend\.env.example backend\.env
```

Frontend:

```powershell
Copy-Item frontend\.env.local.example frontend\.env.local
```

Store sensitive or deployment-specific values in `.env` and `.env.local`, not in committed files.

### 3. Prepare Ollama for local AI

```bash
ollama pull mistral
```

If `ollama serve` reports that port `11434` is already in use, Ollama is probably already running.

### 4. Run the backend

```powershell
cd backend
..\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

### 5. Run the frontend

Windows PowerShell:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Other shells:

```bash
cd frontend
npm install
npm run dev
```

## What you get

- FastAPI backend with log parsing, detections, Ollama integration, health checks, and fallback AI behavior
- Next.js App Router frontend with stage-based analysis UX and a cleaner SOC-style layout
- Local `.env` support plus checked-in Render and Netlify config
- Deployment-safe behavior when Ollama is unavailable in hosted environments

See the backend and frontend READMEs for subsystem-specific details.

# Frontend

The frontend is a Next.js App Router dashboard for uploading logs, reviewing parsed events, inspecting detections, and reading live or fallback AI analysis from the backend.

## Prerequisites

- Node.js 20+
- Backend API running locally or deployed

## Install dependencies

This PowerShell environment blocks `npm.ps1`, so prefer `npm.cmd` on Windows.

Windows PowerShell:

```powershell
npm.cmd install
```

Other shells:

```bash
npm install
```

## Environment variables

Copy `.env.local.example` to `.env.local` and keep environment-specific values there:

- `NEXT_PUBLIC_API_BASE_URL`: backend base URL, defaults to `http://localhost:8000`

Windows PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

## Run the app

Windows PowerShell:

```powershell
npm.cmd run dev
```

Other shells:

```bash
npm run dev
```

The dashboard is available at `http://localhost:3000` by default.

## Production checks

Windows PowerShell:

```powershell
npm.cmd run lint
npm.cmd run build
```

Other shells:

```bash
npm run lint
npm run build
```

## Deployment notes

- `netlify.toml` is checked in for Netlify deployment.
- Set `NEXT_PUBLIC_API_BASE_URL` in Netlify to your deployed backend URL.
- The UI clearly marks `AI Analysis (Live)` versus `Fallback Analysis`, so hosted environments remain usable even when Ollama is unavailable.

# Project Overview

Last updated: April 16, 2026

## Project Summary

AI Log Analyzer (SecOps Assistant) is now a multi-user analyst-grade SOC investigation platform built as a monorepo with:

- a FastAPI backend for upload analysis, detections, campaign correlation, risk scoring, case persistence, rules configuration, GeoIP enrichment, WebSocket live ingestion, authentication, case sharing, executive reporting, and PDF export
- a Next.js frontend for guest and authenticated investigation workflows, staged analysis progress, live mode, case management, search, sharing, and investigator-focused result visualization
- a repo-root Python virtual environment (`venv`) for backend dependency isolation
- PostgreSQL persistence for cases, sessions, GeoIP cache, users, guest usage, and shared links

The project is implemented end-to-end for the current scope. It now supports limited guest usage, authenticated multi-session case ownership, secure shared views, SOC-style search, executive metrics, API-key ingestion, advanced web attack detections, time-split campaigns, alerting, AI-generated next steps, and upgraded investigator UX on top of the existing correlation, risk, timeline, GeoIP, and PDF investigation workflow.

## Current Status

### Backend

Status: implemented and verified

What exists today:

- `POST /upload-log`
  - accepts `.log` and `.txt`
  - validates empty files, unsupported types, oversized files, and unparsable content
  - parses Apache/Nginx-style access logs
  - runs rule-based detections
  - supports guest, cookie-authenticated, and API-key ingest access
  - builds a chronological suspicious-activity timeline
  - correlates suspicious detections into attack campaigns
  - calculates a canonical incident risk score
  - triggers alerting for high-risk or critical incidents
  - returns:
    - `events`
    - `detections`
    - `ai_analysis`
    - `timeline`
    - `risk_assessment`
    - `attack_campaigns`
- `POST /export-report`
  - accepts the analyzed snapshot already returned by `/upload-log`
  - returns a styled PDF incident report
  - includes executive summary, risk score, campaigns, timeline, AI analysis, and detections
- `POST /cases`, `GET /cases`, `GET /cases/{id}`, `POST /cases/{id}/upload`
  - persists investigations as cases
  - stores each upload as a session with the full analysis snapshot
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
  - provides JWT cookie auth
  - hashes passwords with bcrypt
  - automatically claims guest-owned cases after login or registration
- `POST /auth/api-keys`, `GET /auth/api-keys`, `DELETE /auth/api-keys/{id}`
  - creates and revokes scoped API keys
  - stores only hashed key material
  - supports `read` and `ingest` scopes
- guest mode
  - uses `X-Guest-ID`
  - allows up to 3 successful analyses
  - returns `AUTH_REQUIRED` on the 4th analysis attempt
- `GET /search`
  - supports case-scoped SOC queries such as `ip:203.0.113.10 status:401 endpoint:/login`
- `POST /cases/{id}/share`, `GET /share/{token}`
  - creates secure read-only case links
  - serves sanitized shared snapshots without authentication
- `GET /executive/summary`
  - returns authenticated user-scoped incident totals, average risk, attacker countries, and trend data
- `GET /rules`, `PUT /rules`
  - returns and updates detection thresholds from `rules.json`
- `WS /ws/log-stream`
  - accepts real-time log streaming
  - emits incremental analysis updates
  - supports ingest API keys
  - persists final live snapshots with `source_type = live_stream`
- `GET /health`
  - reports backend and Ollama readiness
- parser service
  - extracts `ip`, `endpoint`, `status_code`, `timestamp`
  - normalizes paths and handles UTF-8 BOM input
  - keeps an internal inspection record with request target, query string, method, user agent, and raw line data
- detector service
  - brute-force detection
  - 404 scanning detection
  - multi-endpoint probe detection
  - path traversal detection
  - SQL injection detection
  - command injection detection
  - suspicious user-agent detection
  - failed-login followed by success correlation via `account_compromise_suspected`
  - suppresses redundant multi-endpoint probe findings for IPs already covered by scanning detections
- timeline service
  - maps detections to compact chronological suspicious steps
  - resolves timestamps from related events
  - generates timeline titles and compact descriptions
- correlation engine
  - splits campaigns per suspicious IP by configurable time gap windows
  - maps detections into phases such as reconnaissance, scanning, credential attacks, exploitation, lateral movement hints, and impact
  - attaches campaign-local timelines and evidence summaries
- risk engine
  - produces canonical 0-100 risk scoring
  - maps score to `Low`, `Medium`, or `High`
  - supports both incident-level and campaign-level scoring
- AI explainer service
  - generates Ollama prompts using detections, campaigns, and risk context
  - aligns returned AI risk with the canonical risk engine
  - returns `next_steps` for analyst follow-up
  - gracefully falls back when Ollama is unavailable or returns unusable output
  - tolerates list-like model risk outputs and normalizes them safely
- PDF report export service
  - uses ReportLab
  - renders a professional multi-section PDF report with risk-aware colors, gauges, summary blocks, and a centered transparent watermark treatment
- GeoIP enrichment service
  - resolves suspicious IPs with a cached GeoIP lookup
  - never fails the analysis pipeline on GeoIP errors
- rule configuration service
  - loads and validates `rules.json`
  - applies dynamic thresholds and signature lists to detection logic
- alerting service
  - logs alerts locally
  - supports optional webhook delivery
  - supports stub-friendly optional email delivery
- configuration and logging layer
  - environment-backed settings
  - request-safe error responses
  - application logging
- backend tests
  - parser coverage
  - detector coverage
  - API coverage
  - auth, guest-limit, search, and sharing coverage
  - AI explainer coverage
  - attack timeline coverage
  - correlation engine coverage
  - risk engine coverage

### Frontend

Status: implemented and verified

What exists today:

- Next.js App Router app
- analyst-grade dark enterprise workspace shell
- left sidebar navigation for `Overview`, `Investigations`, `Cases`, `Live Monitor`, `Executive`, `Rules`, and `Settings`
- top command bar with case switcher, URL-driven global search, quick actions, and auth-aware user controls
- `/` overview route for workspace entry points and access context
- `/investigations` as the primary upload and triage workspace
- `/live-monitor` as a dedicated streaming and replay workspace
- `/settings` for API key management and local workspace defaults
- login and register pages
- guest usage banner and auth-required modal
- upload panel with staged workflow messaging
- backward-compatible typed API client
- UTC timestamp rendering in investigation views
- split-panel investigation layout with a persistent desktop context drawer and mobile slide-over
- compact top summary strip for risk, campaigns, high-severity findings, suspicious IPs, and primary action
- tabbed investigation workspace: `Summary`, `Detections`, `Campaigns`, `Timeline`, `Events`, `Map`, and `Report`
- dense detections and events tables with expandable evidence previews
- AI analysis panel and next-step context drawer content
- canonical risk summary strip
- grouped campaign analysis panel
- structured attack timeline panel
- attack map panel with zoom-based threat clustering, animated attack paths, and defended-asset targeting
- cases list and case detail workspace
- secure shared case viewer
- protected rules and executive routes
- case-scoped investigation search with shared filter bar state
- authenticated executive dashboard
- live mode controls with WebSocket streaming
- investigation actions panel with copy-ready containment commands and AI next steps
- grouped rules workspace
- case session history labels for upload vs live-stream sources
- incident report download button
- empty and loading states across the investigation workflow

### Environment

Status: set up

- repo-root `venv` exists and has backend dependencies installed
- frontend dependencies are installed in `frontend/node_modules`
- backend PDF export dependency is available through `reportlab`
- frontend build artifacts are generated in `frontend/.next` during local builds
- backend requires a reachable PostgreSQL instance via `DATABASE_URL`

## Recent Completed Work

The latest completed changes already in the workspace are:

- added `backend/app/services/correlation_engine.py` for campaign-based attacker storyline grouping
- added `backend/app/services/risk_engine.py` for canonical 0-100 risk scoring
- extended `UploadResponse` with `risk_assessment` and `attack_campaigns`
- extended `AIAnalysis` with `risk_score`
- wired `/upload-log` to return `events`, `detections`, `ai_analysis`, `timeline`, `risk_assessment`, and `attack_campaigns`
- added PostgreSQL-backed persistence with Alembic migrations for cases, upload sessions, and GeoIP cache
- added case management routes for creating and listing investigations
- added rules configuration endpoints and dynamic threshold loading
- added GeoIP enrichment service with cached lookups
- added WebSocket log streaming for live mode updates
- added cookie-based auth, guest usage tracking, and tenant ownership for cases and sessions
- added search, sharing, and executive summary endpoints
- added internal parser inspection records to support expert-grade request analysis
- extended the detector with traversal, SQL injection, command injection, suspicious user-agent, and compromise-correlation detections
- upgraded campaign correlation to split by configurable time windows and represent exploitation and impact phases
- added alerting with console, webhook, and stub-friendly email channels
- added API-key storage, scoped auth, and ingest support for uploads and live streams
- added persisted session `source_type` metadata for uploads versus live streams
- added `POST /export-report` and implemented backend PDF generation with ReportLab
- upgraded the PDF export to a more professional SOC-style design with executive summary sections, risk visuals, campaign cards, timeline tables, and a centered transparent page watermark
- added `frontend/components/InvestigatorLayout.tsx` and reorganized the dashboard into an investigator-focused workspace
- added frontend campaign and risk summary surfaces and preserved the existing timeline and evidence views
- added `AttackMap` with GeoIP markers, cases pages, rules editor, and live streaming controls
- upgraded the top navigation with a case switcher and URL-driven global investigation search
- replaced the old single-page dashboard flow with an app shell that separates `Overview`, `Investigations`, `Live Monitor`, `Cases`, `Executive`, `Rules`, and `Settings`
- added `frontend/components/AppShell.tsx`, `SidebarNav.tsx`, and `CommandBar.tsx` for the reusable workspace shell
- added `frontend/components/OverviewPage.tsx` and changed `/` into an overview route instead of the primary upload canvas
- added `/live-monitor` and `/settings` routes
- rebuilt the investigation workspace into a tabbed analyst surface with a summary strip, structured filter bar, dense tables, and a persistent context drawer
- replaced the plain risk number with a gauge-style risk summary
- replaced the vertical attack timeline with a phased analyst flow view
- added an investigation actions panel for copyable commands and AI next steps
- enhanced the map with zoom-based clustering, animated attack paths, richer hover stats, and defended-asset targeting
- added login/register pages, protected route gating, guest-limit UX, and read-only shared case views
- normalized frontend API responses so older backends missing `timeline`, `risk_assessment`, or `attack_campaigns` still resolve safely
- improved Ollama prompting and parsing so canonical risk remains stable even when model output is low quality
- added AI `next_steps` to both live and fallback analysis paths
- added `backend/tests/fixtures/sample_access_demo.log`, a 589-line professional SOC demo fixture with realistic benign traffic and multi-stage attacker activity across Germany, India, France, Singapore, the United States, China, Russia, and Pakistan
- fixed duplicate React key handling in `frontend/components/AttackCampaigns.tsx` by deduplicating repeated campaign preview events and strengthening rendered keys
- updated `.gitignore` to ignore local Next.js build cache directories such as `frontend/.next-*`

## Current Backend Structure

```text
backend/
  alembic/
  alembic.ini
  app/
    main.py
    core/
      auth.py
      config.py
      logging.py
      security.py
    db/
      base.py
      deps.py
      models.py
      repositories.py
      session.py
    models/
      log_model.py
      schemas.py
    routes/
      auth.py
      cases.py
      executive.py
      rules.py
      search.py
      share.py
      stream.py
      upload.py
    services/
      alerting_service.py
      ai_explainer.py
      analysis_helpers.py
      correlation_engine.py
      detector.py
      executive_service.py
      geoip_service.py
      investigation_service.py
      parser.py
      query_parser.py
      report_export.py
      risk_engine.py
      rules_service.py
      search_service.py
      timeline.py
  scripts/
    benchmark.py
  tests/
    fixtures/
      sample_access.log
      sample_access_demo.log
    test_alerting_service.py
    test_ai_explainer.py
    test_api.py
    test_auth_platform.py
    test_config.py
    test_correlation_engine.py
    test_detector.py
    test_parser.py
    test_query_parser.py
    test_risk_engine.py
    test_timeline.py
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
    "explanation": "The upload contains a mix of reconnaissance and authentication abuse indicators.",
    "risk_level": "High",
    "risk_score": 100,
    "recommended_action": "Investigate the flagged IPs and harden exposed login surfaces.",
    "next_steps": [
      "Block suspicious IPs at the edge.",
      "Review successful authentication events.",
      "Harden exposed login endpoints."
    ],
    "source": "ollama",
    "warning": null
  },
  "timeline": [
    {
      "timestamp": "2026-04-09T09:00:01+00:00",
      "title": "Multiple failed login attempts",
      "description": "5 failed login attempts detected from IP 203.0.113.10. Targeted endpoint: /login.",
      "severity": "High",
      "type": "brute_force",
      "ip": "203.0.113.10"
    }
  ],
  "risk_assessment": {
    "risk_score": 100,
    "risk_level": "High"
  },
  "attack_campaigns": [
    {
      "attacker_ip": "203.0.113.10",
      "campaign_name": "Credential Attack Campaign",
      "phases": [
        {
          "phase": "Credential Attacks",
          "events": [
            {
              "timestamp": "2026-04-09T09:00:01+00:00",
              "title": "Failed login attempt",
              "description": "Authentication attempt against /login failed with status 401.",
              "endpoint": "/login",
              "status_code": 401,
              "detection_type": "brute_force"
            }
          ]
        }
      ],
      "severity": "High",
      "risk_score": 55,
      "risk_level": "Medium",
      "timeline": [
        {
          "timestamp": "2026-04-09T09:00:01+00:00",
          "title": "Multiple failed login attempts",
          "description": "5 failed login attempts detected from IP 203.0.113.10. Targeted endpoint: /login.",
          "severity": "High",
          "type": "brute_force",
          "ip": "203.0.113.10"
        }
      ]
    }
  ],
  "case": {
    "id": "uuid",
    "name": "Investigation Apr 14, 2026 00:00 UTC",
    "created_at": "2026-04-14T07:00:00+00:00"
  },
  "session": {
    "id": "uuid",
    "filename": "sample_access_demo.log",
    "uploaded_at": "2026-04-14T07:00:03+00:00"
  }
}
```

Notes:

- `timeline` is detection-driven and chronological
- `risk_assessment` is the canonical top-level incident score
- `attack_campaigns` groups suspicious behavior by attacker IP
- `case` and `session` metadata are present when persistence is enabled
- `ai_analysis` now includes `next_steps`
- timestamps remain ISO-8601 in the API
- the frontend currently displays timestamps in UTC
- the frontend normalizes missing `timeline`, `risk_assessment`, and `attack_campaigns` values from older backend responses

### Additional public endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /search?q=...&case_id=...&session_id=...`
- `POST /cases/{id}/share`
- `GET /share/{token}`
- `GET /executive/summary`

### `POST /export-report`

Accepts the analyzed snapshot returned by `/upload-log` and returns:

- `application/pdf`
- an incident report containing:
  - executive summary
  - risk assessment
  - attack campaigns
  - attack timeline
  - AI analysis
  - detections

### `GET /health`

Returns readiness information for:

- backend status
- Ollama availability
- configured Ollama model
- whether the configured model appears present

## Frontend Behavior

What the current dashboard does:

- uses `/` as an overview and command-center route
- uses `/investigations` as the primary upload and triage workspace
- uses `/live-monitor` as the dedicated WebSocket streaming workspace
- enforces login after 3 successful guest analyses
- restores the active guest case inside the investigation workspace
- provides authenticated access to cases, rules, and executive pages
- uploads supported log files with staged progress states
- renders AI analysis with live versus fallback labeling
- shows AI-recommended `next_steps`
- shows a compact top summary strip with current incident state
- shows attack campaigns, attack timeline, parsed events, and map views inside a tabbed analyst workspace
- supports case-scoped search queries and shared filter-bar state
- opens detection, event, campaign, timeline, and GeoIP detail in a persistent context drawer
- shows investigation-ready evidence previews from dense tables instead of long card stacks
- downloads a styled PDF incident report using the current analyzed snapshot
- creates and opens read-only share links for cases
- shows UTC timestamps in the timeline and parsed events table
- handles empty states and loading states without crashing when optional data is absent

## Test Fixtures

Current backend fixtures available for manual and automated testing:

- `backend/tests/fixtures/sample_access.log`
  - compact 23-line baseline suspicious fixture used by automated API and auth tests
  - covers brute-force, scanning/fuzzing, and multi-endpoint probing without the larger analyst demo volume
- `backend/tests/fixtures/sample_access_demo.log`
  - professional 589-line SOC demo fixture
  - mixes realistic benign browsing, API traffic, health checks, scanners, brute-force activity, and multi-stage attacker behavior across 8 countries
  - useful for attack campaigns, timeline, search, executive metrics, GeoIP map enrichment, and PDF export demos

## Verification Completed

### Backend verification

Completed successfully:

- backend automated tests
  - latest passing result: `57 passed`
- Alembic migrations applied to local PostgreSQL database `secops_analyst`
- benchmark validation
  - `..\venv\Scripts\python.exe scripts/benchmark.py --line-counts 100000`
  - latest measured result on `sample_access_demo.log` amplification:
    - `100000` lines
    - parse: `77451.23 ms`
    - detect: `14550.05 ms`
    - correlate: `209896.96 ms`
    - peak memory: `227.665 MB`

### Frontend verification

Completed successfully:

- `npm.cmd run lint`
- production build passed with a dist-dir override:
  - `$env:NEXT_DIST_DIR='.next-redesign-verify'; node .\node_modules\next\dist\bin\next build --webpack`

Latest note:

- the default `frontend/.next` directory was locked by the local Windows environment during verification, so the successful build used an alternate dist directory through `NEXT_DIST_DIR`

## How To Test

### Backend (PostgreSQL required)

1. Ensure Postgres is running and `DATABASE_URL` in `backend/.env` points to a valid database.
2. Run migrations:

```powershell
cd backend
..\venv\Scripts\alembic.exe upgrade head
```

3. Run automated tests:

```powershell
..\venv\Scripts\python.exe -m pytest tests -p no:cacheprovider
```

4. Run the API locally:

```powershell
..\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

### Frontend

```powershell
cd frontend
npm.cmd install
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

If Windows keeps the default `.next` directory locked in your local environment, use:

```powershell
$env:NEXT_DIST_DIR='.next-redesign-verify'; node .\node_modules\next\dist\bin\next build --webpack
```

### Manual SOC workflow smoke checks

1. Upload `backend/tests/fixtures/sample_access_demo.log` in the dashboard.
2. Verify campaigns, timeline, detections, and risk score populate.
3. Click `Download Incident Report` to confirm PDF export.
4. Repeat guest uploads until the platform asks for login on the 4th successful analysis.
5. Register or login and verify the guest-created case is still available.
6. Navigate to `Cases`, open the most recent case, and confirm sessions render.
7. Use a search query such as `ip:203.0.113.10 status:401 endpoint:/login`.
8. Create a share link from a case and open `/share/[token]` in a logged-out browser.
9. Open `Rules`, change a threshold, save, and re-upload to see changed detections.
10. Open `Executive` and verify total incidents, average risk, and trend data render.
11. Toggle Live Mode and stream a few lines to confirm real-time updates.

## Known Limitations / Notes

- Ollama output is still model-dependent. The backend now handles more malformed responses than before, but it can still fall back when the model response is unusable.
- `schemas.py` still exists only as a transition shim; new backend imports should use `log_model.py`.
- Frontend verification currently relies on lint/build plus backend API coverage rather than a dedicated frontend test runner.
- On Windows, Next.js production builds may require an alternate `NEXT_DIST_DIR` because the local environment can intermittently lock default build files during verification.
- The attack campaign highlights panel now deduplicates repeated preview events so React key-collision warnings do not appear during multi-phase investigations.
- The benchmark script supports both `100k` and `1M` line targets. Local verification in this workspace has been completed at `100k`; the `1M` run remains optional because it is substantially longer on local hardware.

## Recommended Next Steps

### If continuing backend work

- expand the rule set with additional web attack patterns such as traversal, injection, or bot heuristics
- make campaigns smarter about splitting one attacker IP into separate incident windows when time gaps are large
- enrich the PDF with incident identifiers, tenant branding, or analyst sign-off blocks if you want more executive-style exports

### If continuing frontend work

- add filters and pivot controls across campaigns, detections, and timeline
- add investigator controls for timezone switching if analysts need local time instead of UTC
- introduce frontend component tests if the UI surface continues to grow

## Key Files

- `backend/app/core/auth.py`
- `backend/app/core/security.py`
- `backend/app/routes/auth.py`
- `backend/app/routes/search.py`
- `backend/app/routes/share.py`
- `backend/app/routes/executive.py`
- `backend/app/routes/upload.py`
- `backend/app/services/ai_explainer.py`
- `backend/app/services/correlation_engine.py`
- `backend/app/services/executive_service.py`
- `backend/app/services/query_parser.py`
- `backend/app/services/report_export.py`
- `backend/app/services/risk_engine.py`
- `backend/app/services/search_service.py`
- `backend/app/services/timeline.py`
- `backend/app/models/log_model.py`
- `backend/tests/test_api.py`
- `backend/tests/test_auth_platform.py`
- `backend/tests/test_correlation_engine.py`
- `backend/tests/test_query_parser.py`
- `backend/tests/test_risk_engine.py`
- `frontend/app/page.tsx`
- `frontend/app/investigations/page.tsx`
- `frontend/app/live-monitor/page.tsx`
- `frontend/app/settings/page.tsx`
- `frontend/app/cases/[id]/page.tsx`
- `frontend/app/share/[token]/page.tsx`
- `frontend/app/login/page.tsx`
- `frontend/app/register/page.tsx`
- `frontend/app/executive/page.tsx`
- `frontend/components/AppShell.tsx`
- `frontend/components/SidebarNav.tsx`
- `frontend/components/CommandBar.tsx`
- `frontend/components/OverviewPage.tsx`
- `frontend/components/AnalystWorkspace.tsx`
- `frontend/components/ContextDrawer.tsx`
- `frontend/components/InvestigationFilterBar.tsx`
- `frontend/components/AuthProvider.tsx`
- `frontend/components/RequireAuth.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/platform-api.ts`
- `frontend/lib/http.ts`
- `frontend/lib/guest.ts`
- `frontend/lib/types.ts`
- `frontend/next.config.ts`
- `backend/tests/fixtures/sample_access_demo.log`


# Virasya — Cultural Heritage Archival Platform

Virasya is a cultural legacy and oral storytelling preservation platform. It pairs a cinematic React 19 frontend with a Python transcription backend powered by Gnani.ai's Prisma STT v2.5 engine and Supabase cloud infrastructure (Auth, Private Storage, and Edge Functions).

---

## Architecture Overview

```text
┌─────────────────────────────────┐
│        React 19 Frontend        │ ── Deployed on Vercel (SPA)
│  (Vite, Three.js, TailwindCSS)  │    URL: https://virasya-ai-gnani.vercel.app
└───────────────┬─────────────────┘
                │
                ├─────────────────────────────────────────┐
                ▼                                         ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│     Python Backend Container    │     │      Supabase Cloud Platform    │
│  (ThreadingHTTPServer, Gnani)   │     │   (Auth, Postgres, Edge Fns,    │
│  Mounted: /api/upload, /api/... │     │    Private Storage Bucket)      │
└───────────────┬─────────────────┘     └─────────────────────────────────┘
                │                                         ▲
                ▼                                         │
┌─────────────────────────────────┐                       │
│    Gnani.ai Prisma STT REST     │                       │
│  Endpoint: api.vachana.ai       │                       │
│  Header: X-API-Key-ID           │                       │
│  Max Duration: 60s, Max: 5 MiB  │                       │
└─────────────────────────────────┘                       │
                │                                         │
                └─────────────────────────────────────────┘
```

### Core Components

1. **Frontend (`frontend/`)**
   - React 19, TypeScript, Vite, Tailwind CSS, Three.js 3D manuscript hero, and interactive 36-region SVG India map.
   - 6-step preservation workflow: Voice Recording & Upload → Dual ASR Transcription → Human Review & Editorial Correction → Cultural Vocabulary Annotation → Truthful Punctuation & Provenance Review → Final Archival Sealing.
   - Hosted on Vercel with direct client-side routing (`vercel.json` SPA rewrites).
   - **Production API Guard:** In production builds, `VITE_API_BASE_URL` is required to route requests to the hosted Python backend. If missing, the app displays a clear configuration alert (`Backend Not Configured`) rather than silently sending requests to Vercel's relative `/api` path. In local development (`npm run dev`), relative `/api` paths are proxied to `http://127.0.0.1:5000`.

2. **Backend API (`virasya-ai/`)**
   - Python `>=3.11` service powered by standard library `http.server.ThreadingHTTPServer` (`virasya_ai.web.server:main`).
   - Concurrency limiter (`_TRANSCRIPTION_SEMAPHORE`) prevents CPU/memory exhaustion under load.
   - Authenticated audio upload (`/api/upload`) with strict per-user scratch directory isolation (`data/input/<user_id>/<filename>`).
   - Gnani.ai Prisma speech-to-text integration (`/api/transcribe`) supporting Indic languages (`hi-IN`, `bn-IN`, `kn-IN`, `ta-IN`, `te-IN`, `mr-IN`, `gu-IN`, `pa-IN`, `ml-IN`, `or-IN` fallback).
   - Healthcheck endpoint (`/api/health`) returning operational status and audio limits.

3. **Supabase Cloud (`supabase/`)**
   - **Authentication:** Passwordless email magic link authentication with PKCE exchange.
   - **Private Storage:** `story-recordings-private` bucket (5 MiB strict upload limit, RLS enabled).
   - **Edge Functions:**
     - `preserve-story`: Validates story metadata, downloads exact private audio object from Supabase Storage, decodes container frames (<= 60.0s), and seals record into `public.stories`.
     - `get-story-audio`: Issues short-lived authorized playback tickets for public and author-owned private recordings.

---

## Authentication: Passwordless Magic-Link Flow

Virasya uses passwordless Supabase email magic links for streamlined, secure archivist onboarding:

1. **Requesting Access:** The user inputs their email in the authentication dialog. Virasya invokes `supabase.auth.signInWithOtp` configured with an origin-aware redirect URL (`window.location.origin` in production or `VITE_SITE_URL`).
2. **Confirmation Screen:** The frontend immediately transitions to the **Check your email** confirmation screen:
   - Displays the target email address where the link was dispatched.
   - Eliminates OTP 6-digit code entry boxes.
   - Provides a 60-second cooldown timer on the **Resend sign-in link** button to prevent mail provider rate limits.
   - Provides a **← Use a different email** option to correct typos.
   - Preserves **Continue as Guest** mode so users can explore and test preservation without signing in.
3. **Magic-Link Handling & PKCE Exchange:**
   - Clicking the link in the email returns the user to Virasya.
   - `AuthContext.ts` intercepts the query string or URL fragment.
   - If an error is returned (e.g., expired or invalid token), a friendly notice is shown: `"Your sign-in link is invalid or has expired. Please request a new link below."`
   - If an authorization code is present (`?code=...`), `supabase.auth.exchangeCodeForSession(code)` authenticates the user and restores the session.
   - The browser URL is sanitized via `window.history.replaceState` only after session exchange completes (or on error), preventing premature token deletion.

---

## Backend Container Hosting & Runtime Configuration

The Python backend is packaged via [`virasya-ai/Dockerfile`](file:///D:/Codes/gnani.ai/virasya-ai/Dockerfile) for container hosting (e.g. Render, Railway, Fly.io, AWS ECS, or GCP Cloud Run).

### Container Specification & Runtime Details
- **Base Image:** `python:3.11-slim`
- **System Packages:** `ffmpeg`, `libsndfile1`, `ca-certificates`, `curl`
- **Python Dependencies:** `numpy>=1.24`, `soundfile>=0.12`, `soxr>=0.3`, `requests>=2.32` (`pyproject.toml`)
- **Server Entry Point:** `python -m virasya_ai.web.server` (running `ThreadingHTTPServer`)
- **Health Check Command:** `curl -f "http://localhost:${PORT:-5000}/api/health" || exit 1`
- **Default Port:** `5000` (overridden automatically by `PORT` env var on container platforms)
- **Local Docker Testing Note:** Docker CLI is not installed on this local Windows development workstation; container definitions are verified statically from `Dockerfile` and `pyproject.toml`.

### Environment Variables Actually Read by Server

| Variable | Required In | Description | Example / Production Value |
|---|---|---|---|
| `GNANI_API_KEY` | Production / Backend | Secret API key for Gnani.ai Prisma STT v2.5 | `gnani_live_...` |
| `SUPABASE_URL` | Production / Backend | Production Supabase endpoint URL (required when auth is enabled) | `https://ahjmjgiyljjkxvwoubdr.supabase.co` |
| `VIRASYA_REQUIRE_AUTH` | Production / Backend | Enforces Supabase Bearer token verification (`true` or `false`) | `true` |
| `VIRASYA_ALLOWED_ORIGINS` | Production / Backend | Comma-separated allowed origins for CORS (or `*` for open dev) | `https://virasya-ai-gnani.vercel.app,http://localhost:5173` |
| `PORT` | Container Host | Port for HTTP server (defaults to `5000` or `VIRASYA_WEB_PORT`) | `5000` |
| `VIRASYA_WEB_HOST` | Container Host | Binding address (defaults to `0.0.0.0` when `PORT` is set, else `127.0.0.1`) | `0.0.0.0` |
| `VIRASYA_DATA_DIR` | Optional / Backend | Directory for audio scratch data (defaults to `/app/data` in Docker) | `/app/data` |
| `VITE_API_BASE_URL` | Production / Frontend | Public base URL of deployed Python backend | `https://api.yourdomain.com` |
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL | `https://ahjmjgiyljjkxvwoubdr.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | Supabase anonymous / publishable key | `eyJhbGciOi...` |

---

## Supabase Dashboard Configuration Checklist

Before going live with the frontend and backend, verify these settings in the Supabase Dashboard (`ahjmjgiyljjkxvwoubdr`):

1. **Authentication Redirect Allowlist:**
   - Navigate to: **Authentication → URL Configuration → Redirect URLs**
   - Add:
     - `https://virasya-ai-gnani.vercel.app/**`
     - `https://virasya-ai-gnani.vercel.app/`
     - `http://localhost:5173/**`
     - `http://localhost:5173/`
2. **Site URL:**
   - Set to `https://virasya-ai-gnani.vercel.app`
3. **Email Templates:**
   - Navigate to: **Authentication → Email Templates → Magic Link**
   - Confirm the template uses `{{ .ConfirmationURL }}` to trigger the PKCE redirect flow.
   - Confirm Email provider signup / confirmation is enabled.
4. **Storage Bucket Limit & Privacy:**
   - Navigate to: **Storage → Buckets**
   - Ensure `story-recordings-private` is marked **Private**.
   - Verify upload file size limit is set to **5242880 bytes (5 MiB)**.
   - Verify allowed MIME types: `audio/wav, audio/ogg, audio/mpeg, audio/mp4, audio/x-m4a, audio/webm, audio/flac`.
5. **Edge Functions Secrets:**
   - Navigate to: **Project Settings → Edge Functions / Secrets**
   - Verify `GNANI_API_KEY` is configured in production secrets.

---

## Test Suites & Quality Assurance

### Frontend Verification (12 Test Suites)
```bash
cd frontend
npm test
```
- `check-india-projection.cjs`: 36-region India map SVG projection.
- `check-preservation-step-definitions.cjs`: 6-step preservation workflow definitions.
- `test-preview-flow-simulation.cjs`: Demo & preview simulation.
- `test-frontend-preview-readiness.cjs`: Production SPA routing and Vercel readiness.
- `test-environment-separation.cjs`: Environment separation & storage boundaries.
- `test-header-navigation-alignment.cjs`: Adaptive navigation and layout.
- `test-auth-modal-branding.cjs`: Heritage branding and OTP elimination.
- `test-storyteller-banner.cjs`: Display name banner and profile attribution.
- `test-provenance-and-punctuation-truthfulness.cjs`: Provenance constraints.
- `test-audio-limits-and-storage.cjs`: 16 behavioral security tests (5 MiB & 60s boundaries).
- `test-magic-link-auth.cjs`: 13 magic-link & callback checks.
- `test-production-api-routing.cjs`: Production API routing and missing VITE_API_BASE_URL guard.

### Frontend Production Build
```bash
cd frontend
npm run build
```

### Python Backend Verification (73 Tests)
```bash
cd virasya-ai
.venv/Scripts/pytest -v tests
```

---

## Security Invariants

- **No client-supplied duration trust:** Story sealing decodes actual audio frames/clusters on the server before accepting audio duration <= 60.0s.
- **Fail-closed authentication:** Backend strictly enforces Bearer token validation against Supabase when `VIRASYA_REQUIRE_AUTH=true`.
- **Scratch isolation:** Every authenticated user writes and reads audio exclusively within their dedicated `data/input/<user_id>/` partition.
- **No plaintext secrets in frontend:** `GNANI_API_KEY` and Supabase service-role keys are never exposed in browser bundles or client requests.

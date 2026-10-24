# Virasya — Cultural Heritage Archival Platform

Virasya is a cultural legacy and oral storytelling preservation platform. It pairs a cinematic React 19 frontend with a high-performance Python transcription backend powered by Gnani.ai's Prisma STT v2.5 engine and Supabase cloud infrastructure (Auth, Private Storage, and Edge Functions).

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
│  (Flask / Gunicorn, Gnani STT)  │     │   (Auth, Postgres, Edge Fns,    │
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

2. **Backend API (`virasya-ai/`)**
   - Flask application served via Gunicorn WSGI in production (`Dockerfile`).
   - Authenticated audio upload (`/api/upload`) with strict per-user scratch directory isolation (`data/input/<user_id>/<filename>`).
   - Gnani.ai Prisma speech-to-text integration (`/api/transcribe`) with concurrency limits and MIME detection (`wav`, `ogg`, `mp3`, `flac`, `m4a`, `webm`).
   - Healthcheck endpoint (`/api/health`) returning operational status and audio limits.

3. **Supabase Cloud (`supabase/`)**
   - **Authentication:** Passwordless email magic link authentication with PKCE exchange.
   - **Private Storage:** `story-recordings-private` bucket (5 MiB strict upload limit, RLS enabled).
   - **Edge Functions:**
     - `preserve-story`: Validates story metadata, downloads exact private audio object from Supabase Storage, decodes and enforces container duration (<= 60.0s), and seals record into `public.stories`.
     - `get-story-audio`: Issues short-lived authorized playback tickets for public and author-owned private recordings.

---

## Authentication: Passwordless Magic-Link Flow

Virasya uses passwordless Supabase email magic links for streamlined, secure archivist onboarding:

1. **Requesting Access:** The user inputs their email in the authentication dialog. Virasya invokes `supabase.auth.signInWithOtp` configured with an origin-aware redirect URL (`window.location.origin` in production or `VITE_SITE_URL`).
2. **Confirmation Screen:** The frontend immediately transitions to the **Check your email** confirmation screen:
   - Displays the target email address where the link was dispatched.
   - Prohibits confusion by eliminating OTP 6-digit code entry boxes.
   - Provides a 60-second cooldown timer on the **Resend sign-in link** button to prevent mail provider rate limits.
   - Provides a **← Use a different email** option to correct typos.
   - Preserves **Continue as Guest** mode so users can explore and test preservation without signing in.
3. **Magic-Link Handling & PKCE Exchange:**
   - Clicking the link in the email returns the user to Virasya.
   - `AuthContext.ts` intercepts the query string or URL fragment.
   - If an error is returned (e.g., expired or invalid token), a friendly notice is shown: `"Your sign-in link is invalid or has expired. Please request a new link below."`
   - If an authorization code is present (`?code=...`), `supabase.auth.exchangeCodeForSession(code)` authenticates the user and restores the session.
   - The browser URL is sanitized via `window.history.replaceState` to strip sensitive tokens and query strings.

---

## Backend Container Hosting & Deployment

The Python backend is packaged for container hosting (e.g. Fly.io, Railway, Render, AWS ECS, or GCP Cloud Run).

### Container Build and Run

```bash
cd virasya-ai

# Build container image
docker build -t virasya-backend:latest .

# Run container locally with environment variables
docker run -d \
  -p 5000:5000 \
  -e GNANI_API_KEY="<your-gnani-api-key>" \
  -e SUPABASE_URL="https://ahjmjgiyljjkxvwoubdr.supabase.co" \
  -e VIRASYA_REQUIRE_AUTH="true" \
  -e VIRASYA_CORS_ORIGIN="https://virasya-ai-gnani.vercel.app,http://localhost:5173" \
  virasya-backend:latest
```

### Environment Variables Matrix

| Variable | Required In | Description | Example / Production Value |
|---|---|---|---|
| `GNANI_API_KEY` | Production / Backend | Secret API key for Gnani.ai Prisma STT v2.5 | `gnani_live_...` |
| `SUPABASE_URL` | Production / Backend | Production Supabase endpoint URL | `https://ahjmjgiyljjkxvwoubdr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional / Backend | Service role key for administrative backend tasks | `sb_secret_...` |
| `VIRASYA_REQUIRE_AUTH` | Production / Backend | Enforces Supabase Bearer token verification | `true` |
| `VIRASYA_CORS_ORIGIN` | Production / Backend | Allowed CORS origins for frontend requests | `https://virasya-ai-gnani.vercel.app,http://localhost:5173` |
| `PORT` | Container Host | Port for Gunicorn WSGI server | `5000` |
| `HOST` | Container Host | Binding address for HTTP server | `0.0.0.0` |
| `VITE_API_BASE_URL` | Production / Frontend | Base URL of deployed Python backend | `https://api.yourdomain.com` |
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
2. **Storage Bucket Limit & Privacy:**
   - Navigate to: **Storage → Buckets**
   - Ensure `story-recordings-private` is marked **Private** (Public bucket = Disabled).
   - Verify upload file size limit is set to **5242880 bytes (5 MiB)**.
   - Verify allowed MIME types: `audio/wav, audio/ogg, audio/mpeg, audio/mp4, audio/x-m4a, audio/webm, audio/flac`.
3. **Edge Functions Secrets:**
   - Navigate to: **Project Settings → Edge Functions / Secrets**
   - Verify `GNANI_API_KEY` is configured in production secrets.

---

## Test Suites & Quality Assurance

### Frontend Verification (11 Test Suites)
```bash
cd frontend
npm test
```
- Validates 36-region India map SVG projection.
- Validates 6-step preservation workflow definitions and Punctuation Review integrity.
- Validates preview mode simulation and guest access.
- Validates production SPA routing and Vercel readiness.
- Validates heritage branding and typography.
- Validates audio limits (5 MiB, 60s) and container duration boundaries.
- Validates magic-link login, "Check your email" confirmation screen, and error callbacks.

### Frontend Production Build
```bash
cd frontend
npm run build
```
- Compiles TypeScript (`tsc -b`) and bundles client assets via Vite.

### Python Backend Verification (73 Tests)
```bash
cd virasya-ai
.venv/Scripts/pytest -v tests
```
- Validates audio container duration decoders (WAV, OGG, MP3, FLAC, M4A, WebM).
- Validates adversarial duration bypass prevention (Xing forgery, WebM cluster spoofing, unallocated payloads).
- Validates Supabase token authentication and user isolation.
- Validates Gnani REST API payload construction and language code mapping.
- Validates scratch storage cleanup and isolated user workspaces.

---

## Security Invariants

- **No client-supplied duration trust:** Story sealing decodes actual audio frames/clusters on the server before accepting audio duration <= 60.0s.
- **Fail-closed authentication:** Backend strictly enforces Bearer token validation against Supabase when `VIRASYA_REQUIRE_AUTH=true`.
- **Scratch isolation:** Every authenticated user writes and reads audio exclusively within their dedicated `data/input/<user_id>/` partition.
- **No plaintext secrets in frontend:** `GNANI_API_KEY` and Supabase service-role keys are never exposed in browser bundles or client requests.

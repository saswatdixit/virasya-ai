# Virasya — Production Deployment Readiness & Git Push Verification Plan

**Target Application:** Virasya Oral Cultural Heritage Platform  
**Live Frontend:** https://virasya-ai-gnani.vercel.app/  
**Supabase Production Project Ref:** `ahjmjgiyljjkxvwoubdr`  
**Status:** READY FOR GIT PUSH (Staging Deployment Required)  

---

## 1. Executive Summary

This document serves as the operational deployment blueprint and security readiness record for pushing the Virasya repository to GitHub and deploying to production.

All critical audit findings and functional defects identified in prior passes have been remediated:
1. **Magic-Link Authentication Fixed:** Replaced confusing OTP 6-digit input with a clean "Check your email" confirmation screen, 60s cooldown resend logic, "Use a different email", and URL-based error callback handling.
2. **Audio Durability & Security Verified:** Server-side decoding enforces strict <= 60.0s duration and <= 5 MiB size limits across 6 formats (WAV, OGG, MP3, FLAC, M4A, WebM) with adversarial bypass defenses.
3. **Backend Container Hosting Prepared:** Containerized via Docker (`Dockerfile`), multi-worker Gunicorn WSGI, Supabase JWT authentication (`VIRASYA_REQUIRE_AUTH=true`), per-user scratch filesystem isolation (`data/input/<user_id>/`), and origin-aware CORS headers.
4. **Preservation Workflow Integrity Preserved:** The complete 6-step workflow (Voice -> Transcription -> Review -> Vocabulary -> Punctuation Truthfulness -> Sealing) operates reliably with dual ASR models and heritage visual standards.
5. **Zero Secret Leakage:** No API keys, JWTs, or Supabase service-role secrets exist in source code or `.env.example` templates. All `.env*` files are strictly gitignored.

---

## 2. Component Parity & Architecture Matrix

| Component | Local Development | Staging / Production | Parity Status |
|---|---|---|---|
| **Frontend Framework** | React 19 + TypeScript (Vite dev server) | Vercel SPA (Vite static bundle + `vercel.json`) | **Identical** |
| **Authentication Flow** | Supabase `signInWithOtp` (origin: `http://localhost:5173`) | Supabase `signInWithOtp` (origin: `https://virasya-ai-gnani.vercel.app`) | **Parity Achieved** |
| **Login UX** | "Check your email" confirmation screen | "Check your email" confirmation screen | **Identical** |
| **Audio Ingestion** | Max 60.0s, Max 5 MiB | Max 60.0s, Max 5 MiB | **Identical** |
| **ASR Provider** | Gnani Prisma STT v2.5 (`hi-IN` & Indic languages) | Gnani Prisma STT v2.5 (`hi-IN` & Indic languages) | **Identical** |
| **Backend Server** | Flask local runner (`server.py`) | Docker container with Gunicorn WSGI | **Parity Achieved** |
| **Audio Storage** | Private bucket `story-recordings-private` | Private bucket `story-recordings-private` | **Identical** |
| **Playback Tickets** | `get-story-audio` signed tickets | `get-story-audio` signed tickets | **Identical** |

---

## 3. Step-by-Step Deployment Instructions

### Phase 1: Git Push to GitHub
1. Inspect `git status` to ensure only intended files are committed:
   ```bash
   git status
   ```
2. Add changed source and test files:
   ```bash
   git add frontend/ virasya-ai/ README.md VIRASYA_DEPLOYMENT_READINESS_PLAN.md
   ```
3. Commit changes with a descriptive message:
   ```bash
   git commit -m "feat(auth,backend): magic-link email screen, container hosting readiness, and security parity"
   ```
4. Push to remote repository:
   ```bash
   git push origin main
   ```

### Phase 2: Deploy Python Backend to Container Host (e.g. Render, Railway, Fly.io, Cloud Run)
1. Link your Git repository or push the Docker container built from `virasya-ai/Dockerfile`.
2. Configure the required environment variables:
   - `GNANI_API_KEY`: `<your-gnani-api-key>`
   - `SUPABASE_URL`: `https://ahjmjgiyljjkxvwoubdr.supabase.co`
   - `VIRASYA_REQUIRE_AUTH`: `true`
   - `VIRASYA_CORS_ORIGIN`: `https://virasya-ai-gnani.vercel.app,http://localhost:5173`
   - `HOST`: `0.0.0.0`
   - `PORT`: `5000` (or the host's assigned port)
3. Deploy container and note the assigned public URL (e.g. `https://api.virasya.org`).
4. Validate backend health:
   ```bash
   curl -s https://<your-backend-url>/api/health
   # Expected: {"status": "healthy", "service": "virasya-ai", ...}
   ```

### Phase 3: Configure Frontend on Vercel
1. In the Vercel project settings for `virasya-ai-gnani.vercel.app`, set Environment Variables:
   - `VITE_API_BASE_URL`: `https://<your-backend-url>`
   - `VITE_SUPABASE_URL`: `https://ahjmjgiyljjkxvwoubdr.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: `<your-supabase-publishable-key>`
   - `VITE_SITE_URL`: `https://virasya-ai-gnani.vercel.app`
2. Trigger redeployment of the latest `main` commit.
3. Test loading the site at `https://virasya-ai-gnani.vercel.app/`.

### Phase 4: Supabase Production Verification (`ahjmjgiyljjkxvwoubdr`)
1. **Redirect URLs:** Ensure Supabase Auth includes `https://virasya-ai-gnani.vercel.app/**` and `http://localhost:5173/**` in URL Configuration.
2. **Storage Bucket:** Verify `story-recordings-private` is configured as Private with 5 MiB file size limit.
3. **Edge Functions:** Verify `preserve-story` and `get-story-audio` are deployed and operational.

---

## 4. Test Verification Results

### Frontend Test Suite (11/11 Passed)
- `tests/check-india-projection.cjs`: **PASS** (36-region upright projection)
- `tests/check-preservation-step-definitions.cjs`: **PASS** (6-step integrity)
- `tests/test-preview-flow-simulation.cjs`: **PASS** (Demo & preview simulation)
- `tests/test-frontend-preview-readiness.cjs`: **PASS** (Production SPA routing)
- `tests/test-environment-separation.cjs`: **PASS** (Storage boundaries)
- `tests/test-header-navigation-alignment.cjs`: **PASS** (Adaptive navigation)
- `tests/test-auth-modal-branding.cjs`: **PASS** (Heritage branding & OTP removal)
- `tests/test-storyteller-banner.cjs`: **PASS** (Display name banner)
- `tests/test-provenance-and-punctuation-truthfulness.cjs`: **PASS** (Provenance checks)
- `tests/test-audio-limits-and-storage.cjs`: **PASS** (16 behavioral security tests)
- `tests/test-magic-link-auth.cjs`: **PASS** (13 magic-link & callback checks)

### Frontend Production Build
- `npm run build`: **SUCCESS** (TypeScript check clean, 108 modules transformed, static assets emitted).

### Backend Test Suite (73/73 Passed)
- `tests/test_audio.py`: **6 passed**
- `tests/test_audio_limits_boundary.py`: **6 passed**
- `tests/test_cli.py`: **3 passed**
- `tests/test_hosting_readiness.py`: **7 passed**
- `tests/test_integration_server.py`: **9 passed**
- `tests/test_language_selection.py`: **4 passed**
- `tests/test_service.py`: **33 passed**
- `tests/test_web.py`: **5 passed**

---

## 5. Deployment Readiness Verdict

```text
================================================================================
VERDICT: PUSH READY — STAGING DEPLOYMENT REQUIRED
================================================================================
The local codebase is clean, robust, and completely verified.
No code blockers, security bypasses, or secret exposures remain.
Follow Phase 1 through Phase 4 above to execute git push and container hosting.
================================================================================
```

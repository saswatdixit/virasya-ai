# Virasya — Cultural Heritage & Oral Storytelling Preservation Platform

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-success?logo=vercel)](https://virasya-ai-gnani.vercel.app/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20Storage%20%7C%20Postgres-3ECF8E?logo=supabase)](https://supabase.com)
[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-3776AB?logo=python)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

Virasya is an indigenous oral storytelling and cultural preservation platform. It pairs a cinematic React 19 web application hosted on Vercel with a sovereign serverless backend on Supabase (Auth, Private Storage, Postgres, and Edge Functions) and Gnani.ai's Prisma STT v3 REST API.

---

## Canonical Documentation Links

* 📄 [**Product Requirements Document (PRD.md)**](Documentations/PRD.md) — Product vision, target users, implemented scope vs. future work, and acceptance criteria.
* 🏛️ [**Architecture Overview (ARCHITECTURE.md)**](Documentations/ARCHITECTURE.md) — Technical topologies, sequence diagrams, Edge Function boundaries, and data pipelines.
* 🔌 [**API Reference (API_REFERENCE.md)**](Documentations/API_REFERENCE.md) — Complete endpoint catalog for Python CLI, Python Studio Server, and Supabase Edge Functions.
* 🤝 [**Contributing Guide (CONTRIBUTING.md)**](Documentations/CONTRIBUTING.md) — Local development setup, testing standards, security invariants, and pre-push checklist.

---

## Core Features (Implemented Scope)

1. **Cinematic 6-Step Preservation Workflow:**
   * Step 1: Cultural Story Overview & Narrative Carrier Metadata.
   * Step 2: Voice Recording & Upload with Dual Output Style selection (**Verbatim** vs. **Transcribe**).
   * Step 3: Human-in-the-Loop Editorial Review cockpit.
   * Step 4: Cultural Vocabulary & Dialect Glossary Extraction.
   * Step 5: Truthful Punctuation & Provenance Verification.
   * Step 6: Final Cryptographic Archival Sealing with SHA-256 provenance identifiers (`VIR-{hash[:12]}`).
2. **Explore Archive Feed & Reader Drawer:**
   * Public browsing of preserved oral narratives filtered by 36 Indian regions and cultural categories.
   * Reader drawer with full cultural glossaries and consent-gated audio streaming.
3. **Passwordless Magic-Link Authentication:**
   * Supabase Auth email magic links with PKCE code exchange.
   * Origin-aware deep-linking with zero-block guest mode for anonymous storytellers.
4. **Serverless Archival Backend (Supabase):**
   * Private audio storage (`story-recordings-private`, 5 MiB strict limit).
   * PostgreSQL Row Level Security (RLS) with anti-tampering immutability triggers.
   * Public `explore_stories` security barrier view stripping PII (email, user ID, raw cloud paths).
   * Atomic transcription rate limiting (10 STT calls / 10 minutes) with transactional advisory locks.
5. **Python CLI & Local Studio Workbench:**
   * Terminal command `virasya <audio_path>` for scriptable Hindi audio transcription.
   * Standard library Python HTTP server (`virasya-web`) running at `http://127.0.0.1:5000` for offline testing.

---

## Supported Languages (Verified in Code)

Virasya supports 10 primary Indic languages through Gnani.ai's Prisma STT API:

| Language | Language Code | Primary Dialects / Accents Supported |
| :--- | :---: | :--- |
| **Hindi** | `hi-IN` | Standard Hindi, Khariboli, Awadhi, Bhojpuri idioms |
| **Bengali** | `bn-IN` | Standard Bengali, Rarhi, Varendri |
| **Gujarati** | `gu-IN` | Standard Gujarati, Kathiawari, Surati |
| **Kannada** | `kn-IN` | Standard Kannada, Mysore, Dharwad |
| **Malayalam** | `ml-IN` | Standard Malayalam, Malabar, Travancore |
| **Marathi** | `mr-IN` | Standard Marathi, Deshi, Varhadi |
| **Punjabi** | `pa-IN` | Eastern Punjabi, Majhi, Doabi |
| **Tamil** | `ta-IN` | Standard Tamil, Kongu, Madurai |
| **Telugu** | `te-IN` | Standard Telugu, Coastal Andhra, Rayalaseema, Telangana |
| **English (India)** | `en-IN` | Indian English accents with native code-switching |

*(In the frontend preservation flow, cultural metadata tags also support regional heritage categories including Odia, Sambalpuri, and Koshali).*

---

## Quickstart & Installation

### Prerequisites
* **Node.js:** `>=20.x` and `npm >=10.x`
* **Python:** `>=3.11` (Python 3.11 or 3.12)
* **FFmpeg:** System binary required for local audio decoding (WAV, MP3, OGG, M4A, FLAC, AAC, WebM)

### Setup Instructions

```bash
# 1. Clone repository
git clone https://github.com/virasya/virasya-ai.git
cd virasya-ai

# 2. Setup Frontend
cd frontend
npm install

# 3. Setup Python Workbench & CLI
cd ../virasya-ai
python -m venv .venv
source .venv/bin/activate    # On Windows: .\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -e ".[dev]"
```

---

## Configuration & Environment Variables

Copy the template from the repository root:
```bash
cp .env.example frontend/.env.local
cp .env.example virasya-ai/.env
```

| Variable | Target Environment | Purpose |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Frontend (`.env.local`) | Hosted Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend (`.env.local`) | Anonymous client public key (RLS-protected) |
| `GNANI_API_KEY` | Supabase Secrets / CLI | Secret key for Gnani.ai Prisma STT REST API |
| `PORT` | Python Backend | Local server port (Default: `5000`) |
| `VIRASYA_ALLOWED_ORIGINS` | Python Backend | Allowed CORS origins (e.g. `http://localhost:5173`) |

---

## Python CLI Usage & Examples

The `virasya` CLI enables terminal-driven transcription:

```bash
# Transcribe a Hindi audio file to stdout (uses Gnani Prisma STT v2.5)
virasya speech.wav

# Transcribe and save transcript directly to a UTF-8 text file
virasya speech.wav --output transcript.txt
# Or using short flag:
virasya speech.wav -o transcript.txt
```

### Starting the Local Studio Server
```bash
virasya-web
# Serves local studio UI at http://127.0.0.1:5000
```

---

## Test & Verification Suites

### 1. Frontend Test Suite (17 Automated Suites)
```bash
cd frontend
npm test
```
*Runs all 17 automated suites: 36-region map projection, 6-step flow definitions, preview simulations, magic links, audio boundaries (5 MiB & 60s), adversarial security regressions, and staging preflight checks.*

### 2. Frontend Production Build & Linter
```bash
cd frontend
npm run build   # tsc -b && vite build
npm run lint    # oxlint
```

### 3. Python Backend Test Suite (73 Tests)
```bash
cd virasya-ai
pytest tests -q
```
*73 unit and integration tests passing in ~4 seconds with mocked provider responses (0 live paid API calls).*

---

## Security Invariants

* **Server-Side Audio Duration Verification:** Client-supplied duration is never trusted; Edge Functions and Python ingestion decode container headers and fail closed if duration > 60.0s.
* **Preserved Immutability:** Once preserved, story narratives, audio files, and cryptographic provenance IDs (`VIR-*`) cannot be modified or demoted to draft.
* **Explore Data Minimization:** Anonymous queries to `explore_stories` view never expose author email addresses, private user IDs, or cloud storage keys.
* **Secret Protection:** `GNANI_API_KEY` and Supabase service-role keys are never exposed in browser bundles or client requests.

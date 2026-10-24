# Contributing to Virasya

**Document:** Developer Guide & Contribution Standards  
**Canonical Path:** [`Documentations/CONTRIBUTING.md`](file:///D:/Codes/gnani.ai/Documentations/CONTRIBUTING.md)  

Thank you for contributing to Virasya. This guide explains how to set up your local development environment, run test suites, adhere to security conventions, and verify changes before pushing.

---

## 1. Development Environment Prerequisites

* **Node.js:** `>=20.x` (LTS recommended) and `npm >=10.x`
* **Python:** `>=3.11` (Python 3.11 or 3.12)
* **FFmpeg:** System binary required for local acoustic decoding of MP3/M4A/WebM containers
* **Supabase CLI:** `v2.x` (available via `npx supabase`)

---

## 2. Local Setup & Installation

### 2.1 Repository Setup
```bash
git clone https://github.com/virasya/virasya-ai.git
cd virasya-ai
```

### 2.2 Frontend Installation
```bash
cd frontend
npm install
```

### 2.3 Python Workbench & CLI Installation
```bash
cd virasya-ai
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate
# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1

pip install --upgrade pip
pip install -e ".[dev]"
```

---

## 3. Running Verification & Quality Checks

Before submitting any code change, verify all test suites and linters pass cleanly:

### 3.1 Frontend Automated Test Suite (17 Suites)
```bash
cd frontend
npm test
```
*Executes all 17 automated test suites including AST migration checks, audio boundaries, navigation integrity, and security preflights.*

### 3.2 Frontend Production Build & Linter
```bash
cd frontend
npm run build   # tsc -b && vite build
npm run lint    # oxlint
```
*Ensures 0 TypeScript compile errors, 0 linter errors, and successful bundle production.*

### 3.3 Python Backend Test Suite (73 Tests)
```bash
cd virasya-ai
pytest tests -q
```
*Executes all 73 pytest tests covering audio validation, CLI commands, mock service handling, and server routes.*

---

## 4. Security & Credential Rules

1. **NEVER commit `.env` or real API credentials.**
   - All environment files (`.env`, `.env.local`) are strictly ignored by `.gitignore`.
   - Never add raw keys into sample audio transcripts, test fixtures, or Markdown files.
2. **Mock Outbound AI Calls in Tests:**
   - Unit tests must use mock provider responses. Never call the live Gnani STT API or consume paid provider units in automated test suites.
3. **Strict Production Separation:**
   - Production project reference `ahjmjgiyljjkxvwoubdr` is strictly protected.
   - Never run `supabase db push` against production without explicit operator authorization.
4. **Preserve Migration Immutability:**
   - Historical migrations (`20261017000000`, `20261023000000`) must remain immutable.
   - Any database adjustments must be authored as forward-only migrations and mirrored identically in both `supabase/migrations/` and `frontend/supabase/migrations/`.

---

## 5. Adding New Tests

* **Frontend / Security Tests:** Add `.cjs` test scripts into `frontend/tests/` and link into `frontend/package.json` `scripts.test`.
* **Python Tests:** Add `test_*.py` files into `virasya-ai/tests/`. Use `unittest.mock` or pytest fixtures for audio buffers and HTTP responses.

---

## 6. Pre-Push Checklist

Before opening a pull request or pushing to GitHub:
- [ ] `npm test` passes all 17 test suites (100% pass rate).
- [ ] `npm run build` compiles with 0 errors.
- [ ] `npm run lint` reports 0 errors.
- [ ] `pytest tests` passes all 73 Python tests.
- [ ] `git status` confirms no untracked secrets, `.env` files, or build artifacts.
- [ ] Migration directories (`supabase/migrations/` and `frontend/supabase/migrations/`) maintain identical SHA-256 hashes.

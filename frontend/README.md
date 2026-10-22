# Virasya — Heritage & Cultural Legacy Platform

An interactive, cinematic web platform that transforms heritage and cultural memories into lasting legacy. Built with modern React 19, TypeScript, Vite, and Three.js.

---

## Architecture & Overview

The application is structured as a production-grade React application featuring a custom procedural 3D manuscript object, dynamic scroll interactions, and an interactive 36-region SVG map of India.

### Homepage Flow

1. **Header (`src/components/layout/Header.tsx`)**
   - Fixed, adaptive navigation with two states:
     - Hero view: Crisp ivory-white emblem (`/virasya-emblem-white.png`) and 52px bold white lowercase `virasya` wordmark on terracotta background.
     - Scrolled view: Dark walnut emblem (`/virasya-emblem-dark.png`) and dark walnut wordmark on translucent glass pill.
   - Navigation links: *Explore*, *Culture Hosts*, *Private Vault*, search icon, CTA button (*Preserve Your Story*), and profile icon.
2. **Hero (`src/sections/Hero/Hero.tsx`)**
   - Procedural 3D manuscript rendered with Three.js (`src/three/main.js`).
   - Floating gold and warm-white geometric decor elements (spheres, rings, cubes).
   - Interactive orbit controls, explode/inspect mode, and reset controls.
   - Scroll-driven camera sequence transitioning seamlessly into the cinematic chapter portal: *"03 / A LEGACY IN THE MAKING. Your Story Begins Here. Its Legacy Lives On."*
3. **Integrations — Interactive India Map (`src/sections/Integrations/`)**
   - Mounted immediately following the Hero portal reveal.
   - High-fidelity interactive SVG map of India (`IndiaMap.tsx`) rendering all 36 administrative states and union territories (including Ladakh and Jammu & Kashmir).
   - Region selector tabs (North, West, South, East, Central, Northeast) and individual state selection with cultural data.
4. **Trust (`src/sections/Trust/Trust.tsx`)**
   - Heritage preservation standards, archival security, and community validation.
5. **FAQ (`src/sections/Faq/Faq.tsx`)**
   - Interactive accordion answering common preservation, privacy, and vault queries.
6. **Closing (`src/sections/Closing/Closing.tsx`)**
   - Cinematic closing section, footer branding, and global links.
7. **Dialogs (`src/components/shared/Dialogs.tsx`)**
   - Accessible modal dialogues for workspace onboarding preview and privacy info.

---

## Directory Structure

```text
├── index.html                   # HTML entry point with fonts & metadata
├── package.json                 # Project configuration & npm scripts
├── public/                      # Static assets served by Vite
│   ├── virasya-emblem-dark.png  # High-res walnut emblem
│   ├── virasya-emblem-white.png # High-res ivory-white emblem
│   ├── virasya-logo.png         # Manuscript texture & brand asset
│   └── maps/
│       └── india-states.geo.json # 36-region GeoJSON consumed at runtime
├── src/
│   ├── app/
│   │   └── App.tsx              # Root component & page layout
│   ├── branding.ts              # Dynamic favicon & metadata manager
│   ├── components/
│   │   ├── layout/
│   │   │   └── Header.tsx       # Main header & navigation bar
│   │   └── shared/
│   │       └── Dialogs.tsx      # Modal preview & about dialogs
│   ├── main.tsx                 # React entry point
│   ├── sections/
│   │   ├── Closing/Closing.tsx
│   │   ├── Faq/Faq.tsx
│   │   ├── Hero/Hero.tsx
│   │   ├── Integrations/
│   │   │   ├── Integrations.tsx
│   │   │   ├── IndiaMap.tsx     # 36-region SVG map component
│   │   │   ├── indiaRegions.ts  # Regional metadata & data structures
│   │   │   └── india-map.css    # Scoped styling for India map
│   │   └── Trust/Trust.tsx
│   ├── styles/
│   │   └── globals.css          # Design system variables, typography & layout
│   └── three/
│       └── main.js              # Three.js 3D manuscript scene & scroll animations
├── tests/
│   ├── check-india-projection.cjs # Automated regression test for India map geometry
│   └── capture-screenshots.cjs    # Automated CDP visual verification script
├── tools/
    └── maps/                    # GIS generation scripts & raw source data
        ├── convert-india-outline.py
        ├── geoBoundaries-IND-ADM1.geojson
        ├── geoBoundaries-IND-ADM1-simplified.geojson
        └── README.md
```

---

## Available Scripts

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `node tools/dev-runner.js` | **Unified start**: Concurrently launches Flask AI backend (port 5000) and Vite frontend (port 5173) with health monitoring |
| `npm run backend` | `virasya-ai/.venv/Scripts/python ...` | Starts only the local Flask AI workbench service (port 5000) |
| `npm run vite` | `vite` | Starts only the Vite frontend dev server (port 5173) |
| `npm run build` | `tsc -b && vite build` | Type-checks and bundles production build |
| `npm test` | `node tests/...` | Runs regression tests for map geometry and 6-step workflow definitions |
| `npm run lint` | `oxlint` | Runs fast Oxlint code analysis |
| `npm run preview` | `vite preview` | Previews production build locally |

---

## Preservation Workflow (6 Steps)

Virasya's oral history preservation workflow is structured into 6 clear, sovereign stages:

1. **Step 1 — Your Story (`/preserve-your-story`):** Core metadata, narrative context, storyteller lineage, and place of origin.
2. **Step 2 — Your Voice (`/preserve-your-story/voice`):** Microphone recording or audio file upload (MP3, WAV, OGG, M4A, FLAC, WebM up to 50 MB) stored locally in `virasya-ai/data/input/`.
3. **Step 3 — Transcript Review (`/preserve-your-story/review`):** Real dual-model ASR transcription using Vaani (FastConformer) and IndicConformer ONNX pipelines with side-by-side comparison.
4. **Step 4 — Cultural Vocabulary (`/preserve-your-story/vocabulary`):** Curate and preserve dialect terms, heritage vocabulary, and oral phrases.
5. **Step 5 — Punctuation Review (`/preserve-your-story/punctuation`):** Honest manual editorial cadence review. Includes an Odia punctuation palette (`।`, `॥`, `,`, `?`, `“ ”`, `!`, `—`) to protect authentic oral phrasing from hallucinated AI punctuation.
6. **Step 6 — Final Review & Preservation (`/preserve-your-story/final-review`):** Authoritative narrative confirmation, archive visibility selection (Public, Community, Family), cryptographic provenance hashing, and catalog publication to the Explore archive.

---

## Backend Diagnostics & Health Monitoring

- **Unified Runner:** `npm run dev` monitors both services. If Flask or Vite terminates unexpectedly, the runner cleanly kills the child process tree and logs the exit reason.
- **Backend Health Check:** `GET http://127.0.0.1:5000/api/health` returns service status and model readiness for Vaani and IndicConformer.
- **Vite Proxy:** All `/api/*` routes are proxied to `http://127.0.0.1:5000`. If Flask is unreachable, the proxy returns structured JSON (`BACKEND_UNAVAILABLE`) and the UI renders a `<BackendStatusBanner />` with a retry trigger.
- **Pytest Suite:** Run `virasya-ai/.venv/Scripts/python -m pytest virasya-ai/tests/workbench/ -v` to verify all 25 backend workbench tests.

---

## Design System & Theme

- **Walnut Ink**: `#30221d` (primary dark tone)
- **Ivory Cream**: `#f4ebdd` (warm background)
- **Terracotta Burnt**: `#b85d32` (hero background & accent)
- **Antique Gold**: `#b9965b` (highlights & floating decor)
- **Paper**: `#f9f2e8` (card & container surfaces)
- **Typography**: Manrope, Arial, sans-serif

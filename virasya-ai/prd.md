# Product Requirements Document (PRD) — Virasya AI Subproject

> [!NOTE]
> **Canonical Platform PRD:** For the comprehensive platform requirements covering the React 19 frontend, Supabase serverless backend, and Python workbench, see [**`PRD.md`**](../Documentations/PRD.md).

---

## Subproject Scope: Python CLI & Studio Workbench (`virasya-ai`)

This subproject provides the Python-based speech-to-text transcription engine, command-line interface, and local review workspace.

### Core Implemented Capabilities
1. **CLI Audio Transcription (`virasya`):** Command-line tool accepting audio files (WAV, MP3, OGG, FLAC, AAC, M4A, WebM; ≤ 60 seconds, ≤ 5 MiB) and communicating with the Gnani.ai Prisma STT REST API (`https://api.vachana.ai/stt/v3`).
2. **Local Studio HTTP Server (`virasya-web`):** Standard library `ThreadingHTTPServer` (`http.server`) serving a local review workspace and API endpoints at `http://127.0.0.1:5000`.
3. **Audio Ingestion & Container Decoding:** Decodes audio headers and validates actual audio duration on disk via `soundfile` and `ffmpeg` fallback before dispatching to provider.
4. **Local Transcript Persistence:** Appends raw and reviewed transcripts to `data/output/transcriptions.json`.
5. **Human-in-the-Loop Editorial Separation:** Raw ASR output is strictly preserved alongside user-reviewed corrections.

For full architectural diagrams, API schemas, and platform requirements, refer to the canonical platform documentation:
* [Platform PRD](../Documentations/PRD.md)
* [Architecture Overview](../Documentations/ARCHITECTURE.md)
* [API Reference](../Documentations/API_REFERENCE.md)

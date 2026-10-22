# Product Requirements Document (PRD)

## Purpose
Virasya AI provides a lightweight, **Python‑based** speech‑to‑text transcription workflow for Indian languages using the **Gnani.ai Prisma STT REST API**. The goal is to let users transcribe short audio clips locally, review and correct the output, and store the results for later reference.

## Target Users
- Developers and data‑annotators who need a quick, scriptable way to obtain transcripts for Hindi and other supported Indian languages.
- Researchers prototyping NLP pipelines that require accurate, human‑reviewed transcripts.
- Teams preparing training data for downstream language models.

## Core Use Cases
1. **CLI transcription** – Run `virasya <audio_file>` to get a raw transcript printed to stdout or saved to a text file.
2. **Local web workspace** – Open `http://127.0.0.1:5000` to upload an audio file, select a language, view the raw transcript, edit a *reviewed* version, and save both.
3. **Batch processing** – Scripted use of the CLI in loops or CI pipelines (e.g., generate transcripts for a dataset).

## Supported Languages (as of today)
| Language | Code |
|----------|------|
| Hindi | `hi-IN` |
| Bengali | `bn-IN` |
| Gujarati | `gu-IN` |
| Kannada | `kn-IN` |
| Malayalam | `ml-IN` |
| Marathi | `mr-IN` |
| Punjabi | `pa-IN` |
| Tamil | `ta-IN` |
| English (India) | `en-IN` |
| Telugu | `te-IN` |

> **Note**: Availability depends on the Gnani account permissions; the UI will surface provider errors if a language is not enabled.

## Functional Requirements
- **API key handling** – Load `GNANI_API_KEY` from the environment *or* a local `.env` file; never commit the key.
- **Audio validation** – Ensure the file is one of the supported formats (wav, mp3, ogg, flac, aac, m4a) and ≤ 60 seconds long; reject otherwise.
- **Transcription request** – POST to `https://api.vachana.ai/stt/v3` with `audio_file`, `language_code`, `verbatim` flag.
- **Error handling** – Gracefully surface provider‑side errors (auth, rate‑limit, unsupported language) and client‑side validation problems.
- **Persistence** – Save raw and reviewed transcripts in `data/output/transcriptions.json` (JSON array of records with timestamps, IDs, file name, language, etc.).
- **CLI entry points** – `virasya` (CLI) and `virasya‑web` (Flask server) installed via `pyproject.toml` console scripts.

## Current Limitations (Planned Work)
- No support for audio longer than 60 seconds; would require chunking or a local model.
- No multi‑user authentication or database backend – data lives in a local JSON file.
- No fallback to a secondary provider (e.g., OmniRush Astra) – integration is *planned* but not implemented.
- No automatic language detection – user must select a language explicitly.

## Acceptance Criteria
- All unit tests (`pytest -q`) pass.
- CLI returns exit code 0 on success and non‑zero on any error.
- Web UI does not send a request until the **Transcribe audio** button is clicked.
- No API key or other secrets appear in the repository history or any generated files.

---
*Document created by Antigravity (agy) as part of the repository cleanup.*
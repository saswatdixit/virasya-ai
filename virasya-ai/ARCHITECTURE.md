# Architecture Overview

## High‑Level Diagram
```mermaid
flowchart TD
    subgraph LocalDev[Local Development Environment]
        CLI[CLI (`virasya`)] --> Service[GnaniTranscriptionService]
        Web[Flask Web Workspace (`virasya-web`)] --> Service
        Service --> Provider[Gnani Prisma STT API]
    end
    subgraph Runtime[Runtime Artifacts]
        Data[data/output/transcriptions.json]
        Env[.env (API key)]
    end
    Service --> Data
    Service --> Env
```

## Components
| Component | Language / Tech | Role |
|-----------|----------------|------|
| **CLI (`src/virasya_ai/cli.py`)** | Python | Parses arguments, validates audio, calls the transcription service, optionally writes a text file. |
| **Web Server (`src/virasya_ai/web/server.py`)** | Flask (Python) | Serves HTML/JS UI, handles file upload, invokes the same transcription service, persists results. |
| **Transcription Service (`src/virasya_ai/transcription/service.py`)** | Python (`requests`) | Thin HTTP client for the Gnani Prisma STT endpoint; builds request payload, parses JSON response into a `TranscriptionResult`. |
| **Audio Validation (`src/virasya_ai/transcription/ingestion/audio.py`)** | Python (`ffmpeg` invoked via subprocess) | Checks format, duration (≤ 60 s), and size; raises `AudioError` on failure. |
| **Configuration (`src/virasya_ai/config.py`)** | Python | Loads environment variables, reads `.env` (via `dotenv`), defines constants such as `DEFAULT_LANGUAGE`. |
| **Storage (`src/virasya_ai/transcription/storage.py`)** | Python (JSON) | Persists transcript records to `data/output/transcriptions.json`; provides atomic write to avoid corruption. |
| **Language Mapping (`src/virasya_ai/web/languages.py`)** | Python dict | Supplies the dropdown options displayed in the web UI; maps human‑readable names to provider language codes. |
| **Tests (`tests/` folder)** | pytest | Unit tests for audio validation, service request/response handling (mocked), CLI end‑to‑end flow, and the Flask routes. |
| **Makefile** | Make | Simple shortcut (`make test`) that runs `pytest`. |

## Data Flow (CLI & Web)
1. **Input** – User supplies a local audio file and selects a language.
2. **Validation** – `validate_audio_file` ensures the file meets format & duration constraints.
3. **Service Call** – `GnaniTranscriptionService.transcribe` builds a `multipart/form-data` POST request with the audio file, language code, and `verbatim=true`.
4. **Provider Response** – JSON containing the transcript text (and optional confidence) is returned.
5. **Result Handling** – The service returns a `TranscriptionResult` object containing `text` and metadata.
6. **Persistence** – `storage.save_record` appends a new entry to `data/output/transcriptions.json`.
7. **Output** – CLI prints the transcript or writes it to a file; the web UI displays the raw text, allows editing, and saves the reviewed version.

## Build & Install
- The project uses **PEP 517/518** build metadata (`pyproject.toml`).
- `setuptools` creates console scripts `virasya` and `virasya-web` during `pip install .`.
- Dependencies are locked in `requirements.lock`; `requirements.txt` is a minimal list for quick installs.

## Deployment Considerations
- **Secrets** – `GNANI_API_KEY` must never be committed; it is read from the environment or a local `.env` file (ignored by Git).
- **Scalability** – The Flask server runs on `localhost` by default; for production you would run behind a WSGI server (Gunicorn) and add TLS.
- **Extensibility** – Adding a new provider only requires implementing a new `TranscriptionService` subclass and updating `web/languages.py` if new language codes are needed.

---
*Document created by Antigravity (agy) as part of the repository cleanup.*
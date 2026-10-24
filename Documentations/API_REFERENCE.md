# Virasya — API Reference & Interface Documentation

**Document:** Canonical API Reference  
**Canonical Path:** [`Documentations/API_REFERENCE.md`](file:///D:/Codes/gnani.ai/Documentations/API_REFERENCE.md)  
**Covers:** Python CLI (`virasya`), Python Studio Server (`virasya-web`), and Supabase Edge Functions

---

## 1. Python Command-Line Interface (`virasya`)

The `virasya` CLI provides scriptable, offline-testable audio transcription through the Gnani.ai Prisma STT REST API boundary.

### 1.1 Usage
```bash
virasya <audio_path> [--output <output_path>]
```
Or via module execution:
```bash
python -m virasya_ai.cli <audio_path> [-o <output_path>]
```

### 1.2 Arguments & Options
| Argument / Flag | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `audio_path` | Positional | *Required* | Path to local audio recording (WAV, MP3, OGG, FLAC, AAC, M4A, WebM; ≤ 60s duration, ≤ 5 MiB size). |
| `--output`, `-o` | Option | `None` | Optional file path where the transcript is written (UTF-8). If omitted, prints directly to `stdout`. |
| `-h`, `--help` | Flag | — | Shows the command-line usage manual and exits. |

### 1.3 Configuration & Environment
The CLI loads configuration automatically from environment variables or a local `.env` file via `virasya_ai.config`:
* **`GNANI_API_KEY`**: Required API key for `https://api.vachana.ai/stt/v3`. If missing, execution halts with exit code 1 (`Transcription unavailable: GNANI_API_KEY is not set`).
* **`GNANI_TIMEOUT_SECONDS`**: Outbound request timeout in seconds (float between 1.0 and 300.0; default: `30.0`).
* **Language**: CLI transcribes in Hindi (`DEFAULT_LANGUAGE = "hi"`). Multi-language selection is provided in the web studio (`virasya-web`) and Supabase Edge Functions.

### 1.4 Exit Codes
* `0`: Success (audio validated, transcribed, and printed or written).
* `1`: Audio validation error (`AudioError`: missing file, unsupported container, duration > 60.0s, empty audio), provider network/HTTP error (`TranscriptionProviderError`), missing API key (`MissingApiKeyError`), or file write failure (`OSError`).
* `2`: Invalid CLI syntax or missing required `audio_path` positional argument.

---

## 2. Python Studio Server HTTP Endpoints (`virasya-web`)

The Python backend is implemented with Python's standard library `http.server.ThreadingHTTPServer` (`virasya_ai.web.server`). It serves a local review workspace and provides a development bridge for the React frontend at `http://127.0.0.1:5000`.

### 2.1 Invocation & Configuration
```bash
virasya-web
# Or:
python -m virasya_ai.web.server
```
Configured via environment variables:
* `PORT` or `VIRASYA_WEB_PORT`: Server TCP port (default: `5000`).
* `VIRASYA_WEB_HOST`: Binding host interface (default: `127.0.0.1`, or `0.0.0.0` if `PORT` is set).
* `VIRASYA_DATA_DIR`: Directory for local JSON data persistence (default: `data/output`).
* `VIRASYA_MAX_CONCURRENT_TRANSCRIBES`: Maximum simultaneous transcription workers (default: `3`).
* `VIRASYA_ALLOWED_ORIGINS`: Comma-separated CORS allowed origins (default: `*`).
* `VIRASYA_REQUIRE_AUTH`: Set to `true` to require Supabase JWT Bearer tokens on protected routes.
* `SUPABASE_URL` / `VITE_SUPABASE_URL`: Supabase project URL used for token verification when `VIRASYA_REQUIRE_AUTH=true`.

### 2.2 Complete Endpoint Catalog (18 Handled Routes)

| Method | Endpoint Path | Description | Request Format | Success Response | Error Responses |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | Serves embedded Studio HTML. | None | `200 text/html` | – |
| `GET` | `/static/app.js` | Serves embedded Studio JavaScript. | None | `200 text/javascript` | `404 Not Found` |
| `GET` | `/static/styles.css` | Serves embedded Studio CSS. | None | `200 text/css` | `404 Not Found` |
| `GET` | `/api/health` | Backend health & key status. | None | `200` `{"status": "healthy", "models": {...}}` | – |
| `GET` | `/api/models/status` | Model availability bridge. | None | `200` `{"gnani": {"status": "online"}, ...}` | – |
| `GET` | `/api/languages` | Supported Indic languages. | None | `200` `{"languages": [...]}` (10 languages) | – |
| `GET` | `/api/audio/<filename>`| Streams local audio recording. | None (supports `Range` header) | `200 audio/*` | `401 Unauthorized`, `404 Not Found` |
| `GET` | `/api/explore` | Preserved public stories feed. | Query: `?category=...&search=...` | `200` `{"status": "success", "stories": [...]}` | – |
| `GET` | `/api/explore/<id>` | Retrieves specific preserved story detail. | None | `200` Story JSON | `404 Not Found` |
| `GET` | `/api/stories` | Lists all local story drafts. | None | `200` Story array | – |
| `GET` | `/api/stories/<id>` | Retrieves specific story draft. | None | `200` Story JSON | `404 Not Found` |
| `GET` | `/api/vocabulary` | Lists all cultural vocabulary terms. | None | `200` Vocabulary JSON array | – |
| `POST`| `/api/upload` | Uploads scratch recording (≤ 5 MiB). | Multipart: `file` or `audio_file` | `200` `{"status": "success", "filename": "..."}` | `400` `AUDIO_TOO_LONG`, `INVALID_AUDIO` |
| `POST`| `/api/transcribe` | Transcribes audio via Gnani API. | JSON: `{"audio_filename": "...", "language": "..."}` | `200` `{"text": "...", "language": "...", ...}` | `400` Invalid audio, `502` Provider Error, `503` Missing Key |
| `POST`| `/api/save` | Legacy transcript persistence. | JSON: `{"audio_filename": "...", "reviewed_text": "..."}` | `200` `{"status": "saved", "record_id": "..."}` | `400` Missing fields |
| `POST`| `/api/stories` | Saves or updates story draft. | JSON story payload | `200` `{"status": "success", "story": {...}}` | `400` Invalid JSON |
| `POST`| `/api/stories/<id>/preserve` | Cryptographically seals story to preserved. | JSON: `{"visibility": "public", "confirmed": true}` | `200` `{"status": "preserved", "provenance_id": "..."}` | `400` Unconfirmed |
| `POST`| `/api/vocabulary` | Upserts cultural glossary terms. | JSON array of vocabulary entries | `200` `{"status": "success", "count": N}` | `400` Invalid format |
| `POST`| `/api/punctuate` | Restores truthful cultural punctuation. | JSON: `{"text": "...", "language": "..."}` | `200` `{"status": "success", "punctuated_text": "..."}` | `400` Empty text |
| `OPTIONS`| `/*` | CORS preflight handler. | Preflight headers | `204 No Content` | – |

---

## 3. Supabase Cloud Serverless Edge Functions

In production, cloud requests execute against Supabase Edge Functions deployed to Deno runtime.

### 3.1 `POST /functions/v1/transcribe-audio`
Enforces atomic rate limiting, downloads audio from private storage, verifies container duration, and securely proxies to Gnani.ai.

* **Headers:**
  * `Authorization: Bearer <supabase_user_jwt>` (Required)
  * `apikey: <supabase_anon_key>` (Required)
  * `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "storage_path": "<user_id>/recording_1792772926859.wav",
    "language_code": "hi-IN",
    "format": "verbatim"
  }
  ```
* **Success Response (`HTTP 200 OK`):**
  ```json
  {
    "text": "नमस्ते दुनिया",
    "language": "hi-IN",
    "format": "verbatim",
    "tokens": [],
    "confidence": 0.95,
    "provider": "gnani-prisma-v2.5"
  }
  ```
* **Error Responses:**
  * `HTTP 401 Unauthorized`: Missing, malformed, or expired Bearer JWT.
  * `HTTP 403 Forbidden`: `storage_path` does not belong to the calling user (`Cross-tenant access prohibited`).
  * `HTTP 429 Too Many Requests`: Exceeded 10 requests / 10 minutes quota.
  * `HTTP 500 Internal Server Error`: Quota verification failed or provider exception (strictly fail-closed).

---

### 3.2 `POST /functions/v1/preserve-story`
Performs atomic archival sealing, validates audio duration directly from container frames, computes SHA-256 provenance hash, and permanently locks the story record.

* **Headers:**
  * `Authorization: Bearer <supabase_user_jwt>` (Required)
  * `apikey: <supabase_anon_key>` (Required)
  * `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "story_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "confirmed": true,
    "visibility": "public",
    "audio_public_playback": true
  }
  ```
* **Success Response (`HTTP 200 OK`):**
  ```json
  {
    "status": "success",
    "story_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "provenance_id": "VIR-a1b2c3d4e5f6",
    "provenance_hash": "a1b2c3d4e5f6...",
    "preserved_at": "2026-10-24T10:00:00.000Z"
  }
  ```
* **Error Responses:**
  * `HTTP 400 Bad Request`: Audio duration exceeds 60.0s (`AUDIO_TOO_LONG`), empty audio, or missing confirmation.
  * `HTTP 401 Unauthorized`: Calling user does not own the story record.
  * `HTTP 409 Conflict`: Story has already been sealed to `'preserved'`.

---

### 3.3 `GET /functions/v1/get-story-audio?story_id=<id>`
Issues time-limited, authorized signed playback URLs for private audio recordings after verifying consent flags.

* **Query Parameters:**
  * `story_id`: UUID of the requested story.
* **Consent & Access Logic:**
  * **Public Story with `audio_public_playback = true`:** Anyone (including anonymous visitors) receives a 1-hour signed URL.
  * **Public Story with `audio_public_playback = false`:** Audio is withheld (`HTTP 403 Forbidden: Storyteller has not granted audio playback consent`).
  * **Private Story:** Only the authentic author (verified via JWT) can stream the audio.
* **Success Response (`HTTP 200 OK`):**
  ```json
  {
    "audio_url": "https://<ref>.supabase.co/storage/v1/object/sign/story-recordings-private/...",
    "expires_at": 1792812000
  }
  ```

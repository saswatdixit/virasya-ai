# API Reference (Backend)

The backend consists of a **Flask** application exposing a small set of HTTP endpoints used by the local web workspace. All endpoints run on `localhost` by default (`http://127.0.0.1:5000`).

| Method | Path | Description | Request Fields | Success Response | Error Responses |
|--------|------|-------------|----------------|------------------|-----------------|
| `GET` | `/` | Serves the main HTML page (`index.html`). | – | HTML page (200). | – |
| `GET` | `/static/<path>` | Serves static assets (JS, CSS, images). | – | File content (200). | 404 if not found. |
| `POST` | `/api/transcribe` | Accepts an audio file, validates it, forwards to the Gnani Prisma STT API, and returns the raw transcript. | - `audio_file` (multipart file) – binary audio.<br>- `language_code` (string) – one of the supported codes (e.g., `hi-IN`).<br>- `verbatim` (bool, optional, default `true`). | `{ "text": "<transcript>", "language": "hi-IN" }` (200). | - **400 Bad Request** – missing fields, unsupported format, duration > 60 s.<br>- **401 Unauthorized** – missing/invalid `X-API-Key-ID` (handled by provider).<br>- **429 Too Many Requests** – provider rate limit.<br>- **502 Bad Gateway** – provider network error.<br>- **500 Internal Server Error** – unexpected server failure. |
| `POST` | `/api/save` | Persists a transcript record (raw + optional reviewed text) to `data/output/transcriptions.json`. | - `audio_filename` (string) – original file name.<br>- `language_code` (string).<br>- `raw_text` (string).<br>- `reviewed_text` (string, optional). | `{ "status": "saved", "record_id": "<uuid>" }` (200). | - **400 Bad Request** – validation failure (missing required fields).<br>- **500 Internal Server Error** – I/O error while writing the JSON file. |
| `GET` | `/api/records` | Returns all saved transcription records. | – | JSON array of records (200). | – |

## Request Example (Transcribe)
```http
POST /api/transcribe HTTP/1.1
Host: localhost:5000
Content-Type: multipart/form-data; boundary=---XYZ

---XYZ
Content-Disposition: form-data; name="audio_file"; filename="sample.wav"
Content-Type: audio/wav

<binary data>
---XYZ
Content-Disposition: form-data; name="language_code"

hi-IN
---XYZ--
```

## Response Example (Success)
```json
{
  "text": "नमस्ते दुनिया",
  "language": "hi-IN"
}
```

## Error Handling in the Frontend
The web UI checks the HTTP status code:
- **2xx** → display the transcript.
- **4xx** → show a user‑friendly message (e.g., *"Audio too long"* or *"Unsupported language"*).
- **5xx** → show a generic *"Service unavailable, try again later"* prompt.

All error messages are derived from the JSON payload returned by the Flask error handlers, e.g.:
```json
{ "error": "Audio duration exceeds 60 seconds" }
```

## Planned Endpoints (Not Implemented Yet)
- **`POST /api/transcribe_async`** – Queue a transcription job for longer audio files and poll for completion.
- **`GET /api/health`** – Simple health‑check endpoint for container orchestration.
- **`POST /api/auth`** – Future authentication layer for multi‑user deployments.

---
*Document created by Antigravity (agy) as part of the repository cleanup.*
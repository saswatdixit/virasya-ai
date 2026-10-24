# API Reference — Virasya AI Subproject

> [!NOTE]
> **Canonical Platform API Reference:** For full documentation covering the Python CLI, all 18 Python Studio endpoints, and Supabase Edge Functions, see [**`API_REFERENCE.md`**](../Documentations/API_REFERENCE.md).

---

## Python Subproject Public Interfaces

### 1. Command-Line Interface (`virasya`)
```bash
virasya <audio_path> [--output <output_path>]
# Or:
python -m virasya_ai.cli <audio_path> [-o <output_path>]
```

### 2. Local Studio HTTP Endpoints (`http://127.0.0.1:5000`)
The local Python server is implemented using Python standard library `ThreadingHTTPServer` (`virasya_ai.web.server`):

* `GET /`: Serves embedded Studio HTML.
* `GET /static/app.js`: Serves Studio JavaScript.
* `GET /static/styles.css`: Serves Studio CSS.
* `GET /api/health`: Health status and API key readiness check.
* `GET /api/models/status`: ASR engine status bridge.
* `GET /api/languages`: Returns supported Indic languages.
* `GET /api/explore`: Preserved stories feed for local testing.
* `GET /api/explore/<id>`: Returns specific preserved story detail.
* `GET /api/stories`: Lists local story records.
* `GET /api/stories/<id>`: Returns specific local story.
* `GET /api/vocabulary`: Lists local cultural vocabulary terms.
* `GET /api/audio/<filename>`: Audio streaming endpoint.
* `POST /api/upload`: Uploads scratch audio file (≤ 5 MiB, ≤ 60s).
* `POST /api/transcribe`: Invokes Gnani STT API.
* `POST /api/save`: Persists raw & reviewed transcript record.
* `POST /api/stories`: Saves story draft.
* `POST /api/stories/<id>/preserve`: Preserves story draft.
* `POST /api/vocabulary`: Upserts cultural terms.
* `POST /api/punctuate`: Punctuation restoration helper.

For exact payload schemas, HTTP status codes, and Edge Function endpoints, refer to [**`API_REFERENCE.md`**](../Documentations/API_REFERENCE.md).

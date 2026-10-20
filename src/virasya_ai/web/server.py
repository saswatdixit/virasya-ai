"""Dependency-free local HTTP server for Virasya Transcription Studio."""
from __future__ import annotations

import cgi
import io
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from virasya_ai.exceptions import (
    AudioError,
    MissingApiKeyError,
    StorageError,
    TranscriptionProviderError,
    UnsupportedLanguageError,
    UploadError,
    VirasyaError,
)
from virasya_ai.transcription.storage import TranscriptStore
from virasya_ai.web.languages import get_language, language_options_payload
from virasya_ai.web.workflow import MAX_UPLOAD_BYTES, transcribe_uploaded_audio

STATIC_DIR = Path(__file__).with_name("static")
MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024


class StudioHandler(BaseHTTPRequestHandler):
    server_version = "VirasyaStudio/1.0"

    def log_message(self, format: str, *args: object) -> None:
        # Keep provider credentials and request bodies out of logs.
        return

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/":
            self._send_static("index.html", "text/html; charset=utf-8")
        elif path == "/static/app.js":
            self._send_static("app.js", "text/javascript; charset=utf-8")
        elif path == "/static/styles.css":
            self._send_static("styles.css", "text/css; charset=utf-8")
        elif path == "/api/languages":
            self._send_json({"languages": language_options_payload()})
        else:
            self._send_json({"error": "Not found."}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path == "/api/transcribe":
                self._transcribe()
            elif path == "/api/save":
                self._save()
            else:
                self._send_json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
        except UnsupportedLanguageError as exc:
            self._send_json({"error": str(exc), "code": "unsupported_language"}, HTTPStatus.UNPROCESSABLE_ENTITY)
        except (UploadError, AudioError, ValueError) as exc:
            self._send_json({"error": str(exc), "code": "invalid_request"}, HTTPStatus.BAD_REQUEST)
        except MissingApiKeyError as exc:
            self._send_json({"error": str(exc), "code": "missing_api_key"}, HTTPStatus.SERVICE_UNAVAILABLE)
        except TranscriptionProviderError as exc:
            self._send_json({"error": str(exc), "code": "provider_error"}, HTTPStatus.BAD_GATEWAY)
        except StorageError as exc:
            self._send_json({"error": str(exc), "code": "storage_error"}, HTTPStatus.INTERNAL_SERVER_ERROR)
        except VirasyaError as exc:
            self._send_json({"error": str(exc), "code": "application_error"}, HTTPStatus.BAD_REQUEST)
        except Exception:
            self._send_json(
                {"error": "The local application could not complete the request.", "code": "internal_error"},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _transcribe(self) -> None:
        fields = self._multipart_fields()
        language_code = fields.getvalue("language_code", "")
        audio_field = fields["audio_file"] if "audio_file" in fields else None
        if audio_field is None or not getattr(audio_field, "filename", None):
            raise UploadError("Choose an audio file before transcribing.")
        filename = Path(audio_field.filename).name
        audio_bytes = audio_field.file.read(MAX_UPLOAD_BYTES + 1)
        result = transcribe_uploaded_audio(audio_bytes, filename, language_code)
        self._send_json(
            {
                "audio_filename": filename,
                "language": language_code,
                "raw_text": result.text,
                "provider": result.provider,
            }
        )

    def _save(self) -> None:
        payload = self._json_body()
        required = ("audio_filename", "language", "raw_text", "reviewed_text")
        if any(not isinstance(payload.get(key), str) for key in required):
            raise ValueError("Audio filename, language, raw text, and reviewed text are required.")
        if not payload["raw_text"].strip() or not payload["reviewed_text"].strip():
            raise ValueError("Raw and reviewed transcript text cannot be empty.")
        if get_language(payload["language"]) is None:
            raise ValueError("The selected language is not recognized.")
        filename = Path(payload["audio_filename"]).name
        if filename != payload["audio_filename"] or filename in {"", ".", ".."}:
            raise ValueError("Invalid audio filename.")
        record = TranscriptStore().append(
            audio_filename=filename,
            language=payload["language"],
            raw_text=payload["raw_text"],
            reviewed_text=payload["reviewed_text"],
        )
        self._send_json({"saved": True, "record": record}, HTTPStatus.CREATED)

    def _multipart_fields(self) -> cgi.FieldStorage:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("multipart/form-data"):
            raise UploadError("Transcription requires a multipart audio upload.")
        length = self._content_length()
        if length > MAX_REQUEST_BYTES:
            raise UploadError("The upload is too large.")
        body = self.rfile.read(length)
        return cgi.FieldStorage(
            fp=io.BytesIO(body),
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
                "CONTENT_LENGTH": str(length),
            },
            keep_blank_values=True,
        )

    def _json_body(self) -> dict[str, object]:
        if "application/json" not in self.headers.get("Content-Type", "").lower():
            raise ValueError("Expected a JSON request.")
        length = self._content_length()
        if length > 1024 * 1024:
            raise ValueError("The save request is too large.")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("The save request is not valid JSON.") from exc
        if not isinstance(payload, dict):
            raise ValueError("The save request must be a JSON object.")
        return payload

    def _content_length(self) -> int:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise UploadError("The request length is invalid.") from exc
        if length < 0:
            raise UploadError("The request length is invalid.")
        return length

    def _send_static(self, filename: str, content_type: str) -> None:
        path = STATIC_DIR / filename
        try:
            body = path.read_bytes()
        except OSError:
            self._send_json({"error": "Static asset not found."}, HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def create_server(host: str = "127.0.0.1", port: int = 5000) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), StudioHandler)


def main() -> None:
    host = os.getenv("VIRASYA_WEB_HOST", "127.0.0.1")
    try:
        port = int(os.getenv("VIRASYA_WEB_PORT", "5000"))
    except ValueError as exc:
        raise SystemExit("VIRASYA_WEB_PORT must be an integer.") from exc
    server = create_server(host, port)
    print(f"Virasya Transcription Studio: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

"""Atomic local persistence for reviewed transcript records."""
from __future__ import annotations

import json
import os
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from virasya_ai.exceptions import StorageError

_STORE_LOCK = threading.Lock()


def default_store_path() -> Path:
    return Path(__file__).resolve().parents[3] / "data" / "output" / "transcriptions.json"


class TranscriptStore:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path) if path else default_store_path()

    def append(
        self,
        *,
        audio_filename: str,
        language: str,
        raw_text: str,
        reviewed_text: str,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "id": uuid.uuid4().hex,
            "audio_filename": audio_filename,
            "language": language,
            "raw_text": raw_text,
            "reviewed_text": reviewed_text,
            "created_at": now,
            "updated_at": now,
        }
        with _STORE_LOCK:
            payload = self._read()
            payload["transcriptions"].append(record)
            self._write(payload)
        return record

    def _read(self) -> dict[str, list[dict[str, Any]]]:
        if not self.path.exists():
            return {"transcriptions": []}
        try:
            text = self.path.read_text(encoding="utf-8").strip()
            payload = json.loads(text) if text else {"transcriptions": []}
        except (OSError, json.JSONDecodeError) as exc:
            raise StorageError(f"Could not read transcript records: {exc}") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("transcriptions"), list):
            raise StorageError("Transcript records file has an invalid JSON structure.")
        return payload

    def _write(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.path.parent,
                prefix=f".{self.path.name}.",
                suffix=".tmp",
                delete=False,
            ) as handle:
                temporary_path = handle.name
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_path, self.path)
        except OSError as exc:
            if temporary_path:
                Path(temporary_path).unlink(missing_ok=True)
            raise StorageError(f"Could not save transcript records: {exc}") from exc

"""Shared local web workflow functions with injectable provider boundaries."""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Callable

from virasya_ai.exceptions import UnsupportedLanguageError, UploadError
from virasya_ai.transcription.base import TranscriptResult
from virasya_ai.transcription.ingestion.audio import SUPPORTED_SUFFIXES, validate_audio_file
from virasya_ai.transcription.service import GnaniTranscriptionService
from virasya_ai.web.languages import get_language

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def transcribe_uploaded_audio(
    audio_bytes: bytes,
    filename: str,
    language_code: str,
    *,
    service: GnaniTranscriptionService | None = None,
    service_factory: Callable[[], GnaniTranscriptionService] = GnaniTranscriptionService,
) -> TranscriptResult:
    """Validate an in-memory upload, then call the provider exactly once."""
    if len(audio_bytes) > MAX_UPLOAD_BYTES:
        raise UploadError("The audio file exceeds the 25 MB upload limit.")
    language = get_language(language_code)
    if language is None or not language.provider_configured:
        raise UnsupportedLanguageError(
            f"{language_code or 'That language'} is not configured for transcription "
            "in the current provider setup."
        )
    suffix = Path(filename or "").suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise UploadError(
            "Unsupported audio format. Use WAV, MP3, OGG, FLAC, AAC, or M4A."
        )
    if not audio_bytes:
        raise UploadError("The selected audio file is empty.")

    owned_service = service is None
    active_service = service or service_factory()
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(audio_bytes)
            temporary_path = handle.name
        path = validate_audio_file(temporary_path)
        return active_service.transcribe(path, language_code=language.code)
    finally:
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)
        if owned_service:
            active_service.close()

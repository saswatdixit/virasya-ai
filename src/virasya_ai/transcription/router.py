"""Language routing for the single future transcription service."""
from __future__ import annotations

from virasya_ai.config import DEFAULT_LANGUAGE
from virasya_ai.transcription.service import GnaniTranscriptionService

LANGUAGE_SERVICES = {DEFAULT_LANGUAGE: GnaniTranscriptionService}
LANGUAGE_NAMES = {DEFAULT_LANGUAGE: "Hindi"}


def supported_languages() -> str:
    return "\n".join(
        f"  {code} -> {LANGUAGE_NAMES.get(code, code)}"
        for code in LANGUAGE_SERVICES
    )


def get_service_for_language(language: str) -> GnaniTranscriptionService:
    if language not in LANGUAGE_SERVICES:
        raise ValueError(
            f"Unsupported language: {language}\n\nSupported languages:\n{supported_languages()}"
        )
    return LANGUAGE_SERVICES[language]()

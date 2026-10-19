"""Boundary for the future Gnani.ai transcription integration.

This module intentionally contains no HTTP client, endpoint, payload, model
identifier, or response parser.  Those details must come from official
provider documentation before implementation.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from virasya_ai.config import DEFAULT_LANGUAGE
from virasya_ai.exceptions import TranscriptionProviderError
from virasya_ai.transcription.base import TranscriptResult


class GnaniTranscriptionService:
    """Non-operational Phase 0 service boundary for OmniRush Astra."""

    provider_name = "gnani"
    language = DEFAULT_LANGUAGE

    def transcribe(
        self,
        audio_path: str | Path,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> TranscriptResult:
        del audio_path, metadata
        raise TranscriptionProviderError(
            "Gnani.ai transcription is not configured yet. "
            "Phase 0 removed local ASR; implement the documented OmniRush Astra "
            "API contract before enabling transcription."
        )

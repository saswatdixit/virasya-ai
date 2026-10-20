"""Small provider-neutral result type for the future API client."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TranscriptResult:
    """Normalized text returned by a transcription service."""

    text: str = ""
    language: str = "hi"
    provider: str | None = None
    provider_metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "language": self.language,
            "provider": self.provider,
            "provider_metadata": self.provider_metadata,
        }

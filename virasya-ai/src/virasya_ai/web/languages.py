"""Local language configuration exposed to the browser."""
from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class LanguageOption:
    name: str
    code: str
    provider_configured: bool = False

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


LANGUAGE_OPTIONS = (
    LanguageOption("Hindi", "hi-IN", True),
    LanguageOption("Bengali", "bn-IN", True),
    LanguageOption("Gujarati", "gu-IN", True),
    LanguageOption("Kannada", "kn-IN", True),
    LanguageOption("Malayalam", "ml-IN", True),
    LanguageOption("Marathi", "mr-IN", True),
    LanguageOption("Punjabi", "pa-IN", True),
    LanguageOption("Tamil", "ta-IN", True),
    LanguageOption("English (India)", "en-IN", True),
    LanguageOption("Telugu", "te-IN", True),
)

LANGUAGE_BY_CODE = {option.code: option for option in LANGUAGE_OPTIONS}


def language_options_payload() -> list[dict[str, object]]:
    return [option.to_dict() for option in LANGUAGE_OPTIONS]


def get_language(code: str) -> LanguageOption | None:
    return LANGUAGE_BY_CODE.get(code)

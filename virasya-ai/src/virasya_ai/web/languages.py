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


def resolve_language_option(query: str | None) -> LanguageOption | None:
    """Resolves a language code, prefix, or name to a configured LanguageOption."""
    if not query or not isinstance(query, str) or not query.strip():
        return None
    normalized = query.strip().lower().replace("_", "-")
    for opt in LANGUAGE_OPTIONS:
        if opt.code.lower() == normalized:
            return opt
    for opt in LANGUAGE_OPTIONS:
        if opt.name.lower() == normalized:
            return opt
    for opt in LANGUAGE_OPTIONS:
        if opt.code.split("-")[0].lower() == normalized:
            return opt
    if normalized in ("english", "en"):
        return get_language("en-IN")
    return None

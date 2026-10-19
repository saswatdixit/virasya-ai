"""Runtime configuration shared across the Hindi-first application."""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

DEFAULT_SAMPLE_RATE = 16000
DEFAULT_LANGUAGE = "hi"
GNANI_API_KEY_ENV = "GNANI_API_KEY"


def get_gnani_api_key() -> str | None:
    """Return the backend-only API key, if configured.

    Configuration is deliberately optional at import time.  Phase 0 does not
    know the provider endpoint or request contract yet, so startup must remain
    usable without credentials and must never print or expose this value.
    """
    value = os.getenv(GNANI_API_KEY_ENV)
    return value.strip() if value and value.strip() else None

"""Environment-backed configuration for the standalone CLI."""
from __future__ import annotations

import os
import re
from pathlib import Path

DEFAULT_LANGUAGE = "hi"
DEFAULT_SAMPLE_RATE = 16000
GNANI_API_KEY_ENV = "GNANI_API_KEY"
GNANI_TIMEOUT_ENV = "GNANI_TIMEOUT_SECONDS"
DEFAULT_GNANI_TIMEOUT_SECONDS = 30.0
_ENV_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_environment_file(path: str | Path | None = None) -> None:
    """Load non-empty values from a local .env without overriding os.environ."""
    env_path = Path(path) if path is not None else project_root() / ".env"
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        if not _ENV_KEY.fullmatch(key) or key in os.environ or not value:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if value:
            os.environ[key] = value


load_environment_file()


def get_gnani_api_key() -> str | None:
    """Return the configured API key without logging or exposing its value."""
    value = os.getenv(GNANI_API_KEY_ENV)
    return value.strip() if value and value.strip() else None


def get_gnani_timeout() -> float:
    """Return a finite request timeout, allowing safe local configuration."""
    value = os.getenv(GNANI_TIMEOUT_ENV)
    if not value:
        return DEFAULT_GNANI_TIMEOUT_SECONDS
    try:
        timeout = float(value)
    except ValueError:
        return DEFAULT_GNANI_TIMEOUT_SECONDS
    return timeout if 0 < timeout <= 300 else DEFAULT_GNANI_TIMEOUT_SECONDS

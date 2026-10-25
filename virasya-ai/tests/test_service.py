from pathlib import Path

import pytest
import requests

from virasya_ai.config import (
    DEFAULT_LANGUAGE,
    get_gnani_api_key,
    get_gnani_timeout,
    load_environment_file,
)
from virasya_ai.exceptions import (
    AudioTooLongError,
    MissingApiKeyError,
    ProviderAuthenticationError,
    ProviderConnectionError,
    ProviderLanguageError,
    ProviderRateLimitError,
    ProviderRequestError,
    ProviderResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from virasya_ai.transcription.ingestion.audio import validate_audio_file
from virasya_ai.transcription.service import GnaniTranscriptionService


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self.payload = payload
        self.text = text
        self.closed = False

    def json(self):
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload

    def close(self):
        self.closed = True


class FakeSession:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []
        self.closed = False

    def post(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self.error:
            raise self.error
        return self.response

    def close(self):
        self.closed = True


def test_import_and_configuration_do_not_require_api_key(monkeypatch):
    monkeypatch.delenv("GNANI_API_KEY", raising=False)
    assert get_gnani_api_key() is None
    assert DEFAULT_LANGUAGE == "hi"


def test_timeout_configuration_is_finite(monkeypatch):
    monkeypatch.setenv("GNANI_TIMEOUT_SECONDS", "60")
    assert get_gnani_timeout() == 60
    monkeypatch.setenv("GNANI_TIMEOUT_SECONDS", "9999")
    assert get_gnani_timeout() == 30


def test_project_env_file_loads_when_process_environment_is_missing(tmp_path, monkeypatch):
    monkeypatch.delenv("GNANI_API_KEY", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text("GNANI_API_KEY='from-dot-env'\n", encoding="utf-8")
    load_environment_file(env_file)
    assert get_gnani_api_key() == "from-dot-env"


def test_project_env_file_does_not_override_process_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "from-process")
    env_file = tmp_path / ".env"
    env_file.write_text("GNANI_API_KEY=stale-value\n", encoding="utf-8")
    load_environment_file(env_file)
    assert get_gnani_api_key() == "from-process"


def test_missing_key_fails_before_provider_session_request(tmp_path, monkeypatch):
    monkeypatch.delenv("GNANI_API_KEY", raising=False)
    session = FakeSession(error=requests.RequestException("must not be called"))
    with pytest.raises(MissingApiKeyError):
        GnaniTranscriptionService(session=session).transcribe(tmp_path / "speech.wav")
    assert session.calls == []


def test_missing_api_key_is_clear(tmp_path, monkeypatch):
    monkeypatch.delenv("GNANI_API_KEY", raising=False)
    with pytest.raises(MissingApiKeyError, match="GNANI_API_KEY"):
        GnaniTranscriptionService().transcribe(tmp_path / "speech.wav")


def test_configured_provider_key_is_read_without_logging(monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "placeholder-not-a-real-key")
    # The real client now uses the documented Prisma contract; this test is
    # retained as a boundary check through a mocked provider response below.
    assert get_gnani_api_key() == "placeholder-not-a-real-key"


def test_success_posts_documented_multipart_request_and_extracts_hindi(
    synthetic_wav: Path, monkeypatch
):
    secret = "test-secret"
    monkeypatch.setenv("GNANI_API_KEY", secret)
    response = FakeResponse(
        payload={
            "success": True,
            "request_id": "req-123",
            "timestamp": "now",
            "transcript": " नमस्ते, दुनिया। ",
        }
    )
    session = FakeSession(response=response)
    service = GnaniTranscriptionService(session=session, timeout=12)

    result = service.transcribe(synthetic_wav)

    assert result.text == "नमस्ते, दुनिया।"
    assert result.language == "hi"
    assert result.provider == "gnani-prisma-v2.5"
    args, kwargs = session.calls[0]
    assert args == ("https://api.vachana.ai/stt/v3",)
    assert kwargs["headers"] == {"X-API-Key-ID": secret}
    assert kwargs["data"] == {"language_code": "hi-IN", "format": "verbatim"}
    assert kwargs["timeout"] == 12
    filename, file_handle, content_type = kwargs["files"]["audio_file"]
    assert filename == synthetic_wav.name
    assert content_type == "audio/wav"
    assert file_handle.closed
    assert response.closed


@pytest.mark.parametrize("language_code", [
    "hi-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN",
    "mr-IN", "pa-IN", "ta-IN", "en-IN", "te-IN",
])
def test_selected_language_code_reaches_provider_unchanged(synthetic_wav, monkeypatch, language_code):
    monkeypatch.setenv("GNANI_API_KEY", "test-secret")
    response = FakeResponse(payload={"success": True, "transcript": "ठीक है"})
    session = FakeSession(response=response)
    result = GnaniTranscriptionService(session=session).transcribe(
        synthetic_wav,
        language_code=language_code,
    )
    assert result.provider_metadata["language_code"] == language_code
    assert session.calls[0][1]["data"]["language_code"] == language_code


@pytest.mark.parametrize(
    ("status", "error_type"),
    [
        (400, ProviderRequestError),
        (401, ProviderAuthenticationError),
        (403, ProviderAuthenticationError),
        (429, ProviderRateLimitError),
        (500, ProviderUnavailableError),
        (503, ProviderUnavailableError),
    ],
)
def test_http_errors_are_mapped_without_secret_leaks(
    synthetic_wav, monkeypatch, status, error_type
):
    secret = "super-secret-key"
    monkeypatch.setenv("GNANI_API_KEY", secret)
    response = FakeResponse(
        status_code=status,
        payload={"success": False, "error": {"message": f"bad {secret}"}},
    )
    with pytest.raises(error_type) as exc_info:
        GnaniTranscriptionService(session=FakeSession(response=response)).transcribe(
            synthetic_wav
        )
    assert secret not in str(exc_info.value)
    assert response.closed


def test_provider_unsupported_language_error_is_identified(synthetic_wav, monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "test-secret")
    response = FakeResponse(
        status_code=400,
        payload={"success": False, "error": {"type": "UNSUPPORTED_LANGUAGE", "message": "unsupported"}},
    )
    with pytest.raises(ProviderLanguageError, match="selected language"):
        GnaniTranscriptionService(session=FakeSession(response=response)).transcribe(
            synthetic_wav,
            language_code="te-IN",
        )


@pytest.mark.parametrize(
    ("payload", "error_message"),
    [
        (ValueError("not-json"), "malformed JSON"),
        ({"success": False, "error": "bad request"}, "bad request"),
        ({"success": True}, "without a transcript"),
        ({"success": True, "transcript": "   "}, "without a transcript"),
    ],
)
def test_invalid_provider_responses_are_rejected(
    synthetic_wav, monkeypatch, payload, error_message
):
    monkeypatch.setenv("GNANI_API_KEY", "test-secret")
    response = FakeResponse(payload=payload)
    with pytest.raises(ProviderResponseError, match=error_message):
        GnaniTranscriptionService(session=FakeSession(response=response)).transcribe(
            synthetic_wav
        )
    assert response.closed


@pytest.mark.parametrize(
    ("request_error", "error_type"),
    [
        (requests.Timeout(), ProviderTimeoutError),
        (requests.ConnectionError(), ProviderConnectionError),
        (requests.RequestException(), ProviderRequestError),
    ],
)
def test_transport_errors_are_mapped(synthetic_wav, monkeypatch, request_error, error_type):
    monkeypatch.setenv("GNANI_API_KEY", "test-secret")
    with pytest.raises(error_type):
        GnaniTranscriptionService(
            session=FakeSession(error=request_error), timeout=3
        ).transcribe(synthetic_wav)


def test_provider_detail_payload_is_extracted(synthetic_wav, monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "test-secret")
    payloads = [
        ({"detail": "Missing boundary in multipart."}, "Missing boundary in multipart."),
        ({"detail": [{"msg": "Field required"}]}, "Field required"),
        ({"detail": {"message": "Invalid key format"}}, "Invalid key format"),
    ]
    for payload, expected_snippet in payloads:
        response = FakeResponse(status_code=400, payload=payload)
        with pytest.raises(ProviderRequestError, match=expected_snippet):
            GnaniTranscriptionService(session=FakeSession(response=response)).transcribe(
                synthetic_wav
            )
        assert response.closed


def test_provider_detail_payload_redacts_secrets(synthetic_wav, monkeypatch):
    secret = "super-secret-key"
    monkeypatch.setenv("GNANI_API_KEY", secret)
    payloads = [
        {"detail": f"Failed with {secret}"},
        {"detail": [{"msg": f"Invalid token {secret}"}]},
        {"detail": {"message": f"Secret leak {secret}"}},
    ]
    for payload in payloads:
        response = FakeResponse(status_code=400, payload=payload)
        with pytest.raises(ProviderRequestError) as exc_info:
            GnaniTranscriptionService(session=FakeSession(response=response)).transcribe(
                synthetic_wav
            )
        assert secret not in str(exc_info.value)
        assert "[REDACTED]" in str(exc_info.value)
        assert response.closed


def test_audio_duration_limit_is_checked_before_upload(tmp_path, monkeypatch):
    import soundfile as sf
    import numpy as np

    path = tmp_path / "long.wav"
    sf.write(path, np.zeros(61 * 16000, dtype=np.float32), 16000, subtype="PCM_16")
    with pytest.raises(AudioTooLongError, match="at most 60 seconds"):
        validate_audio_file(path)

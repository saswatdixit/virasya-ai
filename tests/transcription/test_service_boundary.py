import pytest

from virasya_ai.config import DEFAULT_LANGUAGE, get_gnani_api_key
from virasya_ai.exceptions import TranscriptionProviderError
from virasya_ai.transcription.service import GnaniTranscriptionService


def test_configuration_is_optional(monkeypatch):
    monkeypatch.delenv("GNANI_API_KEY", raising=False)
    assert get_gnani_api_key() is None
    assert DEFAULT_LANGUAGE == "hi"


def test_provider_boundary_does_not_fallback_to_local_models(tmp_path):
    audio = tmp_path / "sample.wav"
    audio.write_bytes(b"placeholder")
    with pytest.raises(TranscriptionProviderError, match="not configured yet"):
        GnaniTranscriptionService().transcribe(audio)

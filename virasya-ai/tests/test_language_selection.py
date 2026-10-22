from http import HTTPStatus
from pathlib import Path
from unittest.mock import patch

from virasya_ai.transcription.base import TranscriptResult
from virasya_ai.web.server import INPUT_AUDIO_DIR
from tests.test_integration_server import http_post_json


def test_transcribe_missing_language_rejected(live_server: str, synthetic_wav: Path):
    dest = INPUT_AUDIO_DIR / synthetic_wav.name
    dest.write_bytes(synthetic_wav.read_bytes())

    status, res = http_post_json(
        f"{live_server}/api/transcribe",
        {"filename": synthetic_wav.name}
    )
    assert status == HTTPStatus.BAD_REQUEST
    assert res["code"] == "missing_language"
    assert "Audio language is required" in res["error"]


def test_transcribe_unsupported_language_rejected(live_server: str, synthetic_wav: Path):
    dest = INPUT_AUDIO_DIR / synthetic_wav.name
    dest.write_bytes(synthetic_wav.read_bytes())

    for unsupported in ["or", "odia", "bn-IN", "english", "ta"]:
        status, res = http_post_json(
            f"{live_server}/api/transcribe",
            {"filename": synthetic_wav.name, "language": unsupported}
        )
        assert status == HTTPStatus.UNPROCESSABLE_ENTITY
        assert res["code"] == "unsupported_language"
        assert f"Unsupported language '{unsupported}'" in res["error"]


def test_transcribe_hindi_language_accepted_and_forwarded(live_server: str, synthetic_wav: Path):
    dest = INPUT_AUDIO_DIR / synthetic_wav.name
    dest.write_bytes(synthetic_wav.read_bytes())

    mock_result = TranscriptResult(
        text="यह एक परीक्षण प्रतिलेख है।",
        language="hi",
        provider="gnani-prisma-v2.5",
        provider_metadata={
            "request_id": "req-12345",
            "language_code": "hi-IN",
        }
    )

    for valid_input in ["hi-IN", "hi", "Hindi", "HI"]:
        with patch("virasya_ai.web.server.GnaniTranscriptionService") as MockService:
            instance = MockService.return_value.__enter__.return_value
            instance.transcribe.return_value = mock_result

            status, res = http_post_json(
                f"{live_server}/api/transcribe",
                {"filename": synthetic_wav.name, "language": valid_input}
            )

            assert status == HTTPStatus.OK
            assert res["status"] == "success"
            assert res["filename"] == synthetic_wav.name
            assert res["language"] == "hi-IN"
            assert res["requested_language"] == "Hindi"
            assert res["provider_language"] == "hi"
            assert res["provider"] == "gnani-prisma-v2.5"
            assert res["transcript"] == "यह एक परीक्षण प्रतिलेख है।"
            assert res["results"]["gnani"]["status"] == "done"
            assert res["results"]["gnani"]["language"] == "hi-IN"
            assert res["results"]["gnani"]["requested_language"] == "Hindi"
            instance.transcribe.assert_called_once_with(dest, language_code="hi-IN")

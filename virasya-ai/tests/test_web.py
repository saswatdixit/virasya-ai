import json
from pathlib import Path

from virasya_ai.transcription.storage import TranscriptStore
from virasya_ai.web.languages import LANGUAGE_OPTIONS, get_language
from virasya_ai.web.workflow import transcribe_uploaded_audio


class StubService:
    def __init__(self):
        self.calls = []

    def transcribe(self, audio_path, *, language_code, metadata=None):
        self.calls.append((Path(audio_path), language_code))
        from virasya_ai.transcription.base import TranscriptResult

        return TranscriptResult(text="नमस्ते दुनिया", language=language_code, provider="stub")


def test_language_catalog_contains_requested_options_and_marks_provider_scope():
    assert [option.code for option in LANGUAGE_OPTIONS] == [
        "hi-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "ta-IN", "en-IN", "te-IN"
    ]
    assert all(get_language(code).provider_configured for code in [option.code for option in LANGUAGE_OPTIONS])
    assert get_language("xx-IN") is None


def test_upload_workflow_validates_locally_then_uses_injected_provider(synthetic_wav):
    service = StubService()
    result = transcribe_uploaded_audio(
        synthetic_wav.read_bytes(),
        synthetic_wav.name,
        "hi-IN",
        service=service,
    )
    assert result.text == "नमस्ते दुनिया"
    assert service.calls[0][1] == "hi-IN"
    assert not service.calls[0][0].exists()


def test_unlisted_language_never_reaches_provider(synthetic_wav):
    service = StubService()
    try:
        transcribe_uploaded_audio(synthetic_wav.read_bytes(), synthetic_wav.name, "xx-IN", service=service)
    except Exception as exc:
        assert "not configured" in str(exc)
    else:
        raise AssertionError("expected unconfigured language to be rejected")
    assert service.calls == []


def test_transcript_store_creates_and_appends_unicode_records(tmp_path):
    store = TranscriptStore(tmp_path / "nested" / "transcriptions.json")
    first = store.append(
        audio_filename="hindi_sample.wav",
        language="hi-IN",
        raw_text="नमस्ते",
        reviewed_text="नमस्ते!",
    )
    second = store.append(
        audio_filename="second.wav",
        language="hi-IN",
        raw_text="दूसरा",
        reviewed_text="दूसरा पाठ",
    )
    payload = json.loads(store.path.read_text(encoding="utf-8"))
    assert [item["id"] for item in payload["transcriptions"]] == [first["id"], second["id"]]
    assert payload["transcriptions"][0]["raw_text"] == "नमस्ते"
    assert payload["transcriptions"][0]["reviewed_text"] == "नमस्ते!"


def test_frontend_has_three_pages_and_one_explicit_transcription_trigger():
    app_js = Path("src/virasya_ai/web/static/app.js").read_text(encoding="utf-8")
    index = Path("src/virasya_ai/web/static/index.html").read_text(encoding="utf-8")
    assert index.count('data-page="') == 3
    assert app_js.count('fetch("/api/transcribe"') == 1
    assert "chooseFile" in app_js and "startTranscription" in app_js
    assert "state.rawText" in app_js and "state.editedText" in app_js
    assert "state.saved && !state.dirty" in app_js
    assert "Your edits are still here" in app_js
    assert "showPage(button.dataset.back)" in app_js

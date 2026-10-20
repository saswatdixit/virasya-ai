from pathlib import Path

import pytest

from virasya_ai.cli import main, transcribe_file
from virasya_ai.transcription.base import TranscriptResult


class StubService:
    def transcribe(self, audio_path, *, language_code="hi-IN", metadata=None):
        assert Path(audio_path).exists()
        assert language_code == "hi-IN"
        assert metadata == {"language": "hi"}
        return TranscriptResult(text="यह एक परीक्षण है।", language="hi-IN", provider="stub")


def test_transcribe_file_returns_and_saves_transcript(synthetic_wav, tmp_path):
    output = tmp_path / "transcript.txt"
    text = transcribe_file(synthetic_wav, output_path=output, service=StubService())
    assert text == "यह एक परीक्षण है।"
    assert output.read_text(encoding="utf-8") == "यह एक परीक्षण है।\n"


def test_cli_requires_an_audio_argument(capsys):
    with pytest.raises(SystemExit) as exc_info:
        main([])
    assert exc_info.value.code == 2
    assert "audio_path" in capsys.readouterr().err


def test_cli_reports_missing_api_key_without_network_call(synthetic_wav, monkeypatch, capsys):
    monkeypatch.delenv("GNANI_API_KEY", raising=False)
    assert main([str(synthetic_wav)]) == 1
    error = capsys.readouterr().err
    assert "GNANI_API_KEY" in error

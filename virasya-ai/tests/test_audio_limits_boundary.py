"""Test audio size and duration limits at server and transcription boundaries."""
import io
from pathlib import Path
import pytest

from virasya_ai.exceptions import AudioTooLongError, UploadError
from virasya_ai.web.workflow import MAX_UPLOAD_BYTES, transcribe_uploaded_audio


def test_max_upload_bytes_configured_to_5_mib():
    """Verify that MAX_UPLOAD_BYTES is exactly 5 MiB (5 * 1024 * 1024 bytes)."""
    assert MAX_UPLOAD_BYTES == 5 * 1024 * 1024
    assert MAX_UPLOAD_BYTES == 5242880


def test_transcribe_rejects_oversized_audio():
    """Verify that audio exceeding 5 MiB is rejected before processing."""
    oversized_bytes = b"0" * (MAX_UPLOAD_BYTES + 1)
    with pytest.raises(UploadError) as exc_info:
        transcribe_uploaded_audio(oversized_bytes, "test.wav", "or-IN")
    assert "5 MiB" in str(exc_info.value) or "upload limit" in str(exc_info.value)


def test_transcribe_rejects_empty_audio():
    """Verify that 0-byte audio is rejected."""
    with pytest.raises(UploadError) as exc_info:
        transcribe_uploaded_audio(b"", "test.wav", "hi-IN")
    assert "empty" in str(exc_info.value)


def test_transcribe_rejects_unsupported_suffix():
    """Verify that unsupported extensions are rejected."""
    with pytest.raises(UploadError) as exc_info:
        transcribe_uploaded_audio(b"some audio data", "test.exe", "hi-IN")
    assert "Unsupported audio format" in str(exc_info.value)


def test_supported_suffixes_includes_webm():
    """Verify that .webm recorded by browser MediaRecorder is in supported suffixes."""
    from virasya_ai.transcription.ingestion.audio import SUPPORTED_SUFFIXES, _FFMPEG_FALLBACK_SUFFIXES
    assert ".webm" in SUPPORTED_SUFFIXES
    assert ".webm" in _FFMPEG_FALLBACK_SUFFIXES


def test_duration_verification_rejects_malformed_audio(tmp_path):
    """Verify that CorruptAudioError is raised for unparsable/corrupt audio data (fail-closed)."""
    from virasya_ai.transcription.ingestion.audio import audio_duration_seconds
    from virasya_ai.exceptions import CorruptAudioError

    fake_file = tmp_path / "corrupt.wav"
    fake_file.write_bytes(b"not a valid wav file data")
    with pytest.raises(CorruptAudioError):
        audio_duration_seconds(fake_file)

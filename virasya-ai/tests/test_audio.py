from pathlib import Path
import subprocess

import numpy as np
import pytest

from virasya_ai.exceptions import (
    AudioTooLongError,
    CorruptAudioError,
    EmptyAudioError,
    MissingAudioError,
    UnsupportedFormatError,
)
from virasya_ai.transcription.ingestion.audio import (
    DecodedAudio,
    format_duration,
    load_audio,
    validate_audio_file,
)


def test_validate_audio_file_returns_existing_path(synthetic_wav: Path):
    assert validate_audio_file(synthetic_wav) == synthetic_wav


def test_load_audio_is_mono_float32_and_resampled(synthetic_wav_stereo: Path):
    decoded = load_audio(synthetic_wav_stereo)
    assert isinstance(decoded, DecodedAudio)
    assert decoded.channels == 2
    assert decoded.sample_rate == 16000
    assert decoded.samples.ndim == 1
    assert decoded.samples.dtype == np.float32
    assert decoded.samples.flags["C_CONTIGUOUS"]


def test_missing_audio_is_rejected(tmp_path: Path):
    with pytest.raises(MissingAudioError):
        validate_audio_file(tmp_path / "missing.wav")


def test_empty_audio_is_rejected(empty_wav: Path):
    with pytest.raises(EmptyAudioError):
        validate_audio_file(empty_wav)


def test_unknown_format_is_rejected(tmp_path: Path):
    path = tmp_path / "speech.txt"
    path.write_text("not audio", encoding="utf-8")
    with pytest.raises(UnsupportedFormatError):
        validate_audio_file(path)


def test_duration_formatting():
    assert format_duration(45) == "00:45"
    assert format_duration(3661) == "01:01:01"


def test_ffmpeg_timeout_raises_corrupt_audio_error(tmp_path: Path, monkeypatch):
    """Verify that a 30s ffmpeg timeout raises CorruptAudioError with 'timed out'."""
    fake_audio = tmp_path / "recording.webm"
    fake_audio.write_bytes(b"\x1a\x45\xdf\xa3" + b"\x00" * 100)

    def mock_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args[0], timeout=30.0)

    monkeypatch.setattr(subprocess, "run", mock_run)

    with pytest.raises(CorruptAudioError, match="timed out"):
        load_audio(fake_audio)


def test_ffmpeg_exceeding_25mib_raises_audio_too_long_error(tmp_path: Path, monkeypatch):
    """Verify that decoded audio exceeding the 25 MiB cap raises AudioTooLongError."""
    fake_audio = tmp_path / "recording.webm"
    fake_audio.write_bytes(b"\x1a\x45\xdf\xa3" + b"\x00" * 100)

    oversized_stdout = b"\x00" * (25 * 1024 * 1024 + 1)
    mock_proc = subprocess.CompletedProcess(
        args=["ffmpeg"],
        returncode=0,
        stdout=oversized_stdout,
        stderr=b"",
    )

    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: mock_proc)

    with pytest.raises(AudioTooLongError, match="exceeds the maximum allowed size"):
        load_audio(fake_audio)


def test_ffmpeg_webm_decodes_successfully_mocked(tmp_path: Path, synthetic_wav: Path, monkeypatch):
    """Verify that .webm audio is recognized and decoded via ffmpeg fallback."""
    fake_webm = tmp_path / "recording.webm"
    fake_webm.write_bytes(b"\x1a\x45\xdf\xa3" + b"\x00" * 50)

    wav_bytes = synthetic_wav.read_bytes()
    mock_proc = subprocess.CompletedProcess(
        args=["ffmpeg"],
        returncode=0,
        stdout=wav_bytes,
        stderr=b"",
    )

    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: mock_proc)

    decoded = load_audio(fake_webm)
    assert isinstance(decoded, DecodedAudio)
    assert decoded.sample_rate == 16000


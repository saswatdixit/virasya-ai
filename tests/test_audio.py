from pathlib import Path

import numpy as np
import pytest

from virasya_ai.exceptions import EmptyAudioError, MissingAudioError, UnsupportedFormatError
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

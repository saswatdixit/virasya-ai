"""Unit tests for virasya_ai.audio.ingest."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from virasya_ai.transcription.ingestion.audio import DecodedAudio, format_duration, load_audio
from virasya_ai.exceptions import EmptyAudioError, MissingAudioError, UnsupportedFormatError


class TestFormatDuration:
    def test_seconds_only(self):
        assert format_duration(45) == "00:45"

    def test_minutes_and_seconds(self):
        assert format_duration(125) == "02:05"

    def test_hours(self):
        assert format_duration(3661) == "01:01:01"

    def test_zero(self):
        assert format_duration(0) == "00:00"


class TestLoadAudio:
    def test_mono_16k(self, synthetic_wav: Path):
        info = load_audio(synthetic_wav)
        assert isinstance(info, DecodedAudio)
        assert info.duration_sec > 0.5
        assert info.original_sample_rate == 16000
        assert info.channels == 1
        assert info.sample_rate == 16000

    def test_stereo_is_downmixed_and_resampled(self, synthetic_wav_stereo: Path):
        info = load_audio(synthetic_wav_stereo)
        assert info.original_sample_rate == 44100
        assert info.channels == 2
        assert info.sample_rate == 16000
        assert info.samples.ndim == 1  # mono
        # 0.5s of 44.1 kHz stereo -> 0.5s of 16 kHz mono
        assert info.samples.shape[0] == pytest.approx(8000, abs=50)

    def test_samples_are_contiguous_float32(self, synthetic_wav_stereo: Path):
        """ONNX Runtime and sherpa-onnx both require this exact buffer layout."""
        info = load_audio(synthetic_wav_stereo)
        assert info.samples.dtype == np.float32
        assert info.samples.flags["C_CONTIGUOUS"]

    def test_duration_matches_sample_count(self, synthetic_wav: Path):
        info = load_audio(synthetic_wav)
        assert info.duration_sec == pytest.approx(len(info.samples) / info.sample_rate)

    def test_nothing_is_written_to_disk(self, synthetic_wav: Path):
        """Decoding must stay in memory - providers may read from read-only dirs."""
        before = set(synthetic_wav.parent.iterdir())
        load_audio(synthetic_wav)
        assert set(synthetic_wav.parent.iterdir()) == before

    def test_custom_target_sample_rate(self, synthetic_wav: Path):
        info = load_audio(synthetic_wav, target_sr=8000)
        assert info.sample_rate == 8000
        assert info.original_sample_rate == 16000
        assert len(info.samples) == pytest.approx(8000, abs=50)

    def test_missing_file(self, tmp_path: Path):
        with pytest.raises(MissingAudioError):
            load_audio(tmp_path / "nonexistent.wav")

    def test_directory_is_not_a_file(self, tmp_path: Path):
        with pytest.raises(MissingAudioError):
            load_audio(tmp_path)

    def test_empty_file(self, empty_wav: Path):
        with pytest.raises(EmptyAudioError):
            load_audio(empty_wav)

    def test_unsupported_format(self, tmp_path: Path):
        bad = tmp_path / "test.xyz"
        bad.write_bytes(b"not audio")
        with pytest.raises(UnsupportedFormatError):
            load_audio(bad)

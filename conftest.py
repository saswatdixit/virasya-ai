"""Shared fixtures for VIRASYA test suite."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

SAMPLE_RATE = 16000


@pytest.fixture
def synthetic_wav(tmp_path: Path) -> Path:
    """Create a short synthetic 16 kHz mono WAV (440 Hz sine, 1 second)."""
    import soundfile as sf

    duration = 1.0
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False, dtype=np.float32)
    samples = 0.5 * np.sin(2 * np.pi * 440 * t)
    path = tmp_path / "test_sine.wav"
    sf.write(str(path), samples, SAMPLE_RATE, subtype="PCM_16")
    return path


@pytest.fixture
def synthetic_wav_stereo(tmp_path: Path) -> Path:
    """Create a short synthetic 44.1 kHz stereo WAV."""
    import soundfile as sf

    sr = 44100
    duration = 0.5
    t = np.linspace(0, duration, int(sr * duration), endpoint=False, dtype=np.float32)
    left = 0.5 * np.sin(2 * np.pi * 440 * t)
    right = 0.3 * np.sin(2 * np.pi * 880 * t)
    stereo = np.column_stack([left, right])
    path = tmp_path / "test_stereo.wav"
    sf.write(str(path), stereo, sr, subtype="PCM_16")
    return path


@pytest.fixture
def empty_wav(tmp_path: Path) -> Path:
    """Create a zero-byte file pretending to be a WAV."""
    path = tmp_path / "empty.wav"
    path.write_bytes(b"")
    return path

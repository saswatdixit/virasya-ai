from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf


@pytest.fixture
def synthetic_wav(tmp_path: Path) -> Path:
    sample_rate = 16000
    samples = np.zeros(sample_rate, dtype=np.float32)
    path = tmp_path / "speech.wav"
    sf.write(path, samples, sample_rate, subtype="PCM_16")
    return path


@pytest.fixture
def synthetic_wav_stereo(tmp_path: Path) -> Path:
    sample_rate = 44100
    samples = np.zeros((sample_rate // 2, 2), dtype=np.float32)
    path = tmp_path / "stereo.wav"
    sf.write(path, samples, sample_rate, subtype="PCM_16")
    return path


@pytest.fixture
def empty_wav(tmp_path: Path) -> Path:
    path = tmp_path / "empty.wav"
    path.write_bytes(b"")
    return path

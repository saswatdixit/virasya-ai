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


@pytest.fixture(scope="module")
def live_server():
    """Start the test server on an ephemeral port."""
    import threading
    from virasya_ai.web.server import create_server

    server = create_server("127.0.0.1", 0)
    host, port = server.server_address
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    base_url = f"http://{host}:{port}"
    yield base_url
    server.shutdown()
    server.server_close()


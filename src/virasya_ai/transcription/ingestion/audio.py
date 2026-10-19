from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
import soxr

from virasya_ai.config import DEFAULT_SAMPLE_RATE
from virasya_ai.exceptions import (
    CorruptAudioError,
    EmptyAudioError,
    MissingAudioError,
    UnsupportedFormatError,
)
from virasya_ai.logging_utils import get_logger

SUPPORTED_SUFFIXES = {".wav", ".flac", ".ogg", ".mp3", ".m4a", ".aac", ".wma", ".opus"}

# Formats libsndfile often cannot decode on its own; retried through ffmpeg.
_FFMPEG_FALLBACK_SUFFIXES = {".mp3", ".m4a", ".aac", ".wma", ".opus"}


@dataclass
class DecodedAudio:
    """Audio decoded into the mono float32 buffer every ASR provider expects."""

    samples: np.ndarray
    path: str
    duration_sec: float
    original_sample_rate: int
    channels: int
    sample_rate: int = DEFAULT_SAMPLE_RATE


def _read_audio(path: Path) -> tuple[np.ndarray, int]:
    # LibsndfileError subclasses RuntimeError, so one clause covers both.
    try:
        data, rate = sf.read(str(path), always_2d=True, dtype="float32")
        return data, int(rate)
    except RuntimeError as exc:
        # MP3/M4A often need libsndfile with mpg123 or an ffmpeg fallback.
        if path.suffix.lower() in _FFMPEG_FALLBACK_SUFFIXES:
            return _ffmpeg_decode(path)
        raise CorruptAudioError(f"Could not decode audio file: {path.name} ({exc})") from exc


def _ffmpeg_decode(path: Path) -> tuple[np.ndarray, int]:
    try:
        import subprocess

        cmd = [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-f",
            "wav",
            "-acodec",
            "pcm_s16le",
            "pipe:1",
        ]
        proc = subprocess.run(cmd, check=False, capture_output=True)
        if proc.returncode != 0:
            raise UnsupportedFormatError(
                f"Unsupported or unreadable format {path.suffix}. "
                f"Install ffmpeg or provide WAV/FLAC. ffmpeg: {proc.stderr.decode(errors='ignore')[:200]}"
            )
        data, rate = sf.read(io.BytesIO(proc.stdout), always_2d=True, dtype="float32")
        return data, int(rate)
    except FileNotFoundError as exc:
        raise UnsupportedFormatError(
            f"Cannot read {path.suffix} without ffmpeg. Convert to WAV/FLAC or install ffmpeg."
        ) from exc


def load_audio(
    audio_path: str | Path,
    *,
    target_sr: int = DEFAULT_SAMPLE_RATE,
) -> DecodedAudio:
    """Decode any supported file to mono float32 at `target_sr`, entirely in memory.

    This is the single decoding path for every ASR provider, so all models see
    bit-identical input and no provider touches the filesystem to preprocess.
    """
    logger = get_logger()
    path = Path(audio_path)
    logger.info("Loading audio...")
    if not path.exists():
        raise MissingAudioError(f"Audio file not found: {path}")
    if not path.is_file():
        raise MissingAudioError(f"Not a file: {path}")
    if path.stat().st_size == 0:
        raise EmptyAudioError(f"Audio file is empty: {path}")
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise UnsupportedFormatError(
            f"Unsupported format {path.suffix}. Use WAV, FLAC, OGG, or MP3 if ffmpeg is installed."
        )

    try:
        samples, rate = _read_audio(path)
    except (CorruptAudioError, UnsupportedFormatError, EmptyAudioError):
        raise
    except Exception as exc:
        raise CorruptAudioError(f"Could not decode audio file: {path.name} ({exc})") from exc

    if samples.size == 0:
        raise EmptyAudioError(f"Audio contains no samples: {path}")

    channels = samples.shape[1]
    mono = samples.mean(axis=1)
    if rate != target_sr:
        mono = soxr.resample(mono, rate, target_sr)
    # ONNX Runtime and sherpa-onnx both require a contiguous float32 buffer.
    mono = np.ascontiguousarray(mono, dtype=np.float32)

    duration = float(len(mono) / target_sr)
    if duration <= 0:
        raise EmptyAudioError(f"Audio duration is zero: {path}")

    logger.info("Detected duration: %s", format_duration(duration))
    return DecodedAudio(
        samples=mono,
        path=str(path.resolve()),
        duration_sec=duration,
        original_sample_rate=rate,
        channels=channels,
        sample_rate=target_sr,
    )


def format_duration(seconds: float) -> str:
    total = int(round(seconds))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

"""Reusable local audio validation and optional normalization helpers."""
from __future__ import annotations

import io
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
import soxr

from virasya_ai.config import DEFAULT_SAMPLE_RATE
from virasya_ai.exceptions import (
    AudioTooLongError,
    CorruptAudioError,
    EmptyAudioError,
    MissingAudioError,
    UnsupportedFormatError,
)

SUPPORTED_SUFFIXES = {
    ".wav",
    ".flac",
    ".ogg",
    ".mp3",
    ".m4a",
    ".aac",
    ".webm",
}
MAX_DURATION_SECONDS = 60.0
_FFMPEG_FALLBACK_SUFFIXES = {".mp3", ".m4a", ".aac", ".webm"}


@dataclass
class DecodedAudio:
    """Audio decoded to mono float32 at a requested sample rate."""

    samples: np.ndarray
    path: str
    duration_sec: float
    original_sample_rate: int
    channels: int
    sample_rate: int = DEFAULT_SAMPLE_RATE


def _check_audio_path(audio_path: str | Path) -> Path:
    path = Path(audio_path)
    if not path.exists():
        raise MissingAudioError(f"Audio file not found: {path}")
    if not path.is_file():
        raise MissingAudioError(f"Not a file: {path}")
    if path.stat().st_size == 0:
        raise EmptyAudioError(f"Audio file is empty: {path}")
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise UnsupportedFormatError(
            f"Unsupported format {path.suffix}. Supported formats: "
            f"{', '.join(sorted(SUPPORTED_SUFFIXES))}."
        )
    return path


def _ffmpeg_decode(path: Path) -> tuple[np.ndarray, int]:
    try:
        process = subprocess.run(
            [
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
            ],
            check=False,
            capture_output=True,
        )
    except FileNotFoundError as exc:
        raise UnsupportedFormatError(
            f"Cannot decode {path.suffix} without ffmpeg. Install ffmpeg or "
            "provide WAV, FLAC, or OGG audio."
        ) from exc

    if process.returncode != 0:
        detail = process.stderr.decode(errors="ignore")[:200]
        raise CorruptAudioError(
            f"Could not decode {path.name} with ffmpeg: {detail}"
        )
    try:
        data, rate = sf.read(io.BytesIO(process.stdout), always_2d=True, dtype="float32")
    except Exception as exc:
        raise CorruptAudioError(f"Could not decode audio file: {path.name}") from exc
    return data, int(rate)


def _read_audio(path: Path) -> tuple[np.ndarray, int]:
    try:
        data, rate = sf.read(str(path), always_2d=True, dtype="float32")
        return data, int(rate)
    except RuntimeError as exc:
        if path.suffix.lower() in _FFMPEG_FALLBACK_SUFFIXES:
            return _ffmpeg_decode(path)
        raise CorruptAudioError(f"Could not decode audio file: {path.name}") from exc


def audio_duration_seconds(audio_path: str | Path) -> float:
    """Return duration in seconds, using metadata without changing the file."""
    path = _check_audio_path(audio_path)
    try:
        info = sf.info(str(path))
        duration = float(info.duration)
        if duration > 0:
            return duration
    except RuntimeError:
        pass

    try:
        samples, rate = _read_audio(path)
    except (CorruptAudioError, UnsupportedFormatError):
        raise
    except Exception as exc:
        raise CorruptAudioError(f"Could not decode audio file: {path.name}") from exc
    if samples.size == 0:
        raise EmptyAudioError(f"Audio contains no samples: {path}")
    duration = float(samples.shape[0] / rate)
    if duration <= 0:
        raise EmptyAudioError(f"Audio duration is zero: {path}")
    return duration


def validate_audio_file(
    audio_path: str | Path,
    *,
    max_duration_seconds: float | None = MAX_DURATION_SECONDS,
) -> Path:
    """Validate path, format, decodability, and the provider duration limit."""
    path = _check_audio_path(audio_path)
    duration = audio_duration_seconds(path)
    if max_duration_seconds is not None and duration > max_duration_seconds:
        raise AudioTooLongError(
            f"Audio is {duration:.1f} seconds; the REST provider accepts at most "
            f"{max_duration_seconds:.0f} seconds."
        )
    return path


def load_audio(
    audio_path: str | Path,
    *,
    target_sr: int = DEFAULT_SAMPLE_RATE,
) -> DecodedAudio:
    """Decode supported audio to mono float32 at ``target_sr`` in memory."""
    path = _check_audio_path(audio_path)
    try:
        samples, rate = _read_audio(path)
    except (CorruptAudioError, UnsupportedFormatError, EmptyAudioError):
        raise
    except Exception as exc:
        raise CorruptAudioError(f"Could not decode audio file: {path.name}") from exc

    if samples.size == 0:
        raise EmptyAudioError(f"Audio contains no samples: {path}")
    channels = samples.shape[1]
    mono = samples.mean(axis=1)
    if rate != target_sr:
        mono = soxr.resample(mono, rate, target_sr)
    mono = np.ascontiguousarray(mono, dtype=np.float32)
    duration = float(len(mono) / target_sr)
    if duration <= 0:
        raise EmptyAudioError(f"Audio duration is zero: {path}")
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
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"

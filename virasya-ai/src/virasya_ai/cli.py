"""Terminal interface for Hindi audio transcription."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from virasya_ai.config import DEFAULT_LANGUAGE
from virasya_ai.exceptions import AudioError, TranscriptionProviderError, VirasyaError
from virasya_ai.transcription.service import GnaniTranscriptionService
from virasya_ai.transcription.ingestion.audio import validate_audio_file


def transcribe_file(
    audio_path: str | Path,
    *,
    output_path: str | Path | None = None,
    service: GnaniTranscriptionService | None = None,
) -> str:
    """Validate one local file, call the provider boundary, and optionally save text."""
    path = validate_audio_file(audio_path)
    owned_service = service is None
    active_service = service or GnaniTranscriptionService()
    try:
        result = active_service.transcribe(
            path,
            metadata={"language": DEFAULT_LANGUAGE},
        )
    finally:
        if owned_service:
            active_service.close()
    transcript = result.text
    if output_path is not None:
        Path(output_path).write_text(transcript + "\n", encoding="utf-8")
    return transcript


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Transcribe Hindi audio with the documented Gnani Prisma service."
    )
    parser.add_argument("audio_path", type=Path, help="Path to the Hindi audio file")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Optional text file in which to save the transcript",
    )
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)

    try:
        transcript = transcribe_file(args.audio_path, output_path=args.output)
    except AudioError as exc:
        print(f"Audio error: {exc}", file=sys.stderr)
        return 1
    except TranscriptionProviderError as exc:
        print(f"Transcription unavailable: {exc}", file=sys.stderr)
        return 1
    except VirasyaError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"Could not write transcript: {exc}", file=sys.stderr)
        return 1

    print(transcript)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

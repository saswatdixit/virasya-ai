"""Command-line entry points for the Virasya review workflow.

Local model inference was intentionally removed in Phase 0.  The transcription
command now stops with an actionable provider-pending error instead of selecting
or falling back to another ASR implementation.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from virasya_ai.config import DEFAULT_LANGUAGE
from virasya_ai.exceptions import TranscriptionProviderError


def _configure_console_encoding() -> None:
    if sys.platform == "win32":
        for stream in (sys.stdout, sys.stderr, sys.stdin):
            try:
                stream.reconfigure(encoding="utf-8")
            except Exception:
                pass


_configure_console_encoding()


def get_project_root() -> Path:
    cwd = Path.cwd()
    for path in (cwd, *cwd.parents):
        if (path / "pyproject.toml").exists() or (path / ".env").exists():
            return path
    return cwd


def _resolve_audio(audio_arg: str) -> Path:
    audio_path = Path(audio_arg)
    if not audio_path.is_absolute() and not audio_path.exists():
        candidate = get_project_root() / "data" / "input" / audio_arg
        if candidate.exists():
            return candidate
    return audio_path


def cmd_transcribe(audio_arg: str, lang_arg: str, metadata: dict | None = None) -> int:
    from virasya_ai.transcription.service import GnaniTranscriptionService

    language = lang_arg.lower()
    if language != DEFAULT_LANGUAGE:
        print(f"Error: Hindi is the only active language. Unsupported language '{lang_arg}'.")
        return 1

    audio_path = _resolve_audio(audio_arg)
    if not audio_path.exists():
        print(f"Error: Audio file not found:\n{audio_path.absolute()}")
        return 1

    try:
        print(f"Preparing Hindi audio for Gnani.ai transcription: {audio_path.name}")
        GnaniTranscriptionService().transcribe(audio_path, metadata=metadata or {})
    except TranscriptionProviderError as exc:
        print(f"Transcription unavailable: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Error during transcription: {exc}", file=sys.stderr)
        return 1
    return 0


def cmd_transcribe_batch(input_dir: str, lang_arg: str = DEFAULT_LANGUAGE) -> int:
    input_path = Path(input_dir)
    if not input_path.is_absolute():
        input_path = get_project_root() / input_path
    if not input_path.exists() or not input_path.is_dir():
        print(f"Error: Directory '{input_path}' not found.")
        return 1
    if lang_arg.lower() != DEFAULT_LANGUAGE:
        print(f"Error: Hindi is the only active language. Unsupported language '{lang_arg}'.")
        return 1

    supported_exts = {".wav", ".ogg", ".mp3", ".m4a", ".flac"}
    audio_files = sorted(
        path for path in input_path.iterdir()
        if path.is_file() and path.suffix.lower() in supported_exts
    )
    if not audio_files:
        print(f"No supported audio files found in {input_path}")
        return 0

    failed = []
    for index, audio_file in enumerate(audio_files, 1):
        print(f"[{index}/{len(audio_files)}] Processing {audio_file.name}")
        if cmd_transcribe(str(audio_file), DEFAULT_LANGUAGE) != 0:
            failed.append(audio_file.name)
    return 1 if failed else 0


def _load_task(path_arg: str) -> tuple[Path, dict] | None:
    path = Path(path_arg)
    if not path.is_absolute() and not path.exists():
        path = get_project_root() / path_arg
    if not path.exists():
        print(f"Error: Task file not found:\n{path.absolute()}")
        return None
    with path.open("r", encoding="utf-8") as handle:
        return path, json.load(handle)


def _transcript_text(data: dict) -> str:
    transcript = data.get("transcript") or {}
    if transcript.get("text"):
        return transcript["text"]
    # Read historical task files without making their retired provider names
    # part of the active workflow.
    for result in data.get("asr_results", {}).values():
        text = result.get("text", result.get("raw_text", ""))
        if text:
            return text
    return ""


def cmd_review(task_arg: str) -> int:
    loaded = _load_task(task_arg)
    if loaded is None:
        return 1
    task_path, data = loaded
    if data.get("review_status") == "verified":
        print("This task has already been verified.")
        return 0

    draft = _transcript_text(data)
    print("\n" + "=" * 50)
    print("VIRASYA HUMAN VERIFICATION")
    print("=" * 50)
    print(f"Source Evidence : {data.get('source', {}).get('filename', '')}")
    print(f"\n--- HINDI TRANSCRIPT DRAFT ---\n{draft}")
    print("\n[1] Accept draft\n[2] Edit transcript\n[3] Reject / needs further review")

    choice = input("Select [1-3]: ").strip()
    if choice == "3":
        data["review_status"] = "rejected"
    elif choice == "2":
        data["verified_transcript"] = input("Enter the corrected transcript: ").strip()
        data["review_status"] = "verified" if data["verified_transcript"] else "pending"
    elif choice == "1":
        data["verified_transcript"] = draft
        data["review_status"] = "verified" if draft else "pending"
    else:
        print("Invalid selection.")
        return 1

    data.setdefault("review", {})["method"] = "human"
    with task_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    print(f"Review state saved to {task_path.name}")
    return 0


def cmd_vocabulary(action: str, term: str | None = None) -> int:
    from virasya_ai.vocabulary.store import LocalVocabularyStore

    store = LocalVocabularyStore()
    if action == "list":
        entries = store.get_all()
        print(f"Total vocabulary entries: {len(entries)}\n")
        for entry in entries:
            print(f"- {entry.canonical_term} (Variants: {', '.join(entry.variants)})")
        return 0
    print(f"Action '{action}' is not implemented via CLI yet.")
    return 1


def cmd_punctuate(task_json_path: str) -> int:
    from virasya_ai.punctuation.core import punctuate_task

    loaded = _load_task(task_json_path)
    if loaded is None:
        return 1
    path, data = loaded
    try:
        updated = punctuate_task(data)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1
    with path.open("w", encoding="utf-8") as handle:
        json.dump(updated, handle, ensure_ascii=False, indent=2)
    print("Success. Punctuated transcript added to task.")
    return 0


def main(argv: list[str] | None = None) -> int:
    import argparse

    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        print("Usage: python run.py transcribe <audio_path> [language]")
        print("       python run.py transcribe-batch <input_directory> [language]")
        print("       python run.py review <task_json_path>")
        print("       python run.py punctuate <task_json_path>")
        print("       python run.py vocabulary list")
        return 1

    command = argv[0].lower()
    if command == "review" and len(argv) >= 2:
        return cmd_review(argv[1])
    if command == "punctuate" and len(argv) >= 2:
        return cmd_punctuate(argv[1])
    if command == "vocabulary":
        return cmd_vocabulary(argv[1] if len(argv) > 1 else "list")
    if command == "transcribe-batch" and len(argv) >= 2:
        return cmd_transcribe_batch(argv[1], argv[2] if len(argv) > 2 else DEFAULT_LANGUAGE)

    audio_arg = argv[1] if command == "transcribe" and len(argv) > 1 else argv[0]
    lang_arg = (
        argv[2] if command == "transcribe" and len(argv) > 2
        else argv[1] if command != "transcribe" and len(argv) > 1
        else DEFAULT_LANGUAGE
    )
    if not audio_arg or audio_arg.startswith("-"):
        print(f"Error: Unknown command or missing arguments: {' '.join(argv)}")
        return 1
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--notes")
    args, _ = parser.parse_known_args(argv[3:] if command == "transcribe" else argv[2:])
    metadata = {key: value for key, value in vars(args).items() if value is not None}
    return cmd_transcribe(audio_arg, lang_arg, metadata)


if __name__ == "__main__":
    raise SystemExit(main())

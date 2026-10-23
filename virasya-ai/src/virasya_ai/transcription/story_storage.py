"""Storage layer for preservation stories and vocabulary in Virasya AI."""
from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from virasya_ai.exceptions import StorageError

_STORY_LOCK = threading.Lock()
_VOCAB_LOCK = threading.Lock()


def get_data_dir() -> Path:
    env_dir = os.getenv("VIRASYA_DATA_DIR")
    if env_dir and env_dir.strip():
        p = Path(env_dir.strip())
        p.mkdir(parents=True, exist_ok=True)
        return p
    default_path = Path(__file__).resolve().parents[3] / "data"
    try:
        default_path.mkdir(parents=True, exist_ok=True)
        return default_path
    except (OSError, PermissionError):
        fallback = Path(tempfile.gettempdir()) / "virasya_data"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


def cleanup_stale_scratch_files(scratch_dir: Path, max_age_seconds: float = 3600.0) -> int:
    """Safely purge transient scratch audio files older than max_age_seconds (default 1 hour)."""
    now = datetime.now(timezone.utc).timestamp()
    removed_count = 0
    if not scratch_dir.exists():
        return 0
    try:
        # Pass 1: Remove stale files
        for item in list(scratch_dir.rglob("*")):
            if item.is_file():
                try:
                    if (now - item.stat().st_mtime) > max_age_seconds:
                        item.unlink(missing_ok=True)
                        removed_count += 1
                except OSError:
                    pass
        # Pass 2: Remove empty subdirectories
        for item in list(scratch_dir.glob("*")):
            if item.is_dir() and item != scratch_dir:
                try:
                    if not any(item.iterdir()):
                        item.rmdir()
                except OSError:
                    pass
    except OSError:
        pass
    return removed_count


def get_stories_dir() -> Path:
    stories_dir = get_data_dir() / "output" / "stories"
    stories_dir.mkdir(parents=True, exist_ok=True)
    return stories_dir


def get_vocabulary_path() -> Path:
    return get_data_dir() / "vocabulary.json"


def sanitize_filename(name: str) -> str:
    """Strip dangerous characters to prevent path traversal."""
    p = Path(name)
    safe_name = p.name
    # Remove any null bytes or path separators
    safe_name = safe_name.replace("\x00", "").replace("/", "").replace("\\", "")
    if not safe_name or safe_name in {".", ".."}:
        raise ValueError("Invalid or unsafe filename.")
    return safe_name


def save_story(story_data: dict[str, Any]) -> dict[str, Any]:
    """Persist a story dictionary atomically into data/output/stories/<id>.json."""
    story_id = story_data.get("id")
    if not story_id:
        raise ValueError("Story payload must have an 'id'.")

    safe_id = sanitize_filename(str(story_id))
    stories_dir = get_stories_dir()
    target_path = stories_dir / f"{safe_id}.json"

    now = datetime.now(timezone.utc).isoformat()
    if "created_at" not in story_data:
        story_data["created_at"] = now
    story_data["updated_at"] = now

    with _STORY_LOCK:
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=stories_dir,
                prefix=f".{safe_id}.",
                suffix=".tmp",
                delete=False,
            ) as handle:
                tmp_name = handle.name
                json.dump(story_data, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, target_path)
        except OSError as exc:
            if 'tmp_name' in locals() and Path(tmp_name).exists():
                Path(tmp_name).unlink(missing_ok=True)
            raise StorageError(f"Could not persist story {safe_id}: {exc}") from exc

    return story_data


def get_story(story_id: str) -> dict[str, Any] | None:
    """Retrieve a single story by ID."""
    try:
        safe_id = sanitize_filename(str(story_id))
    except ValueError:
        return None

    target_path = get_stories_dir() / f"{safe_id}.json"
    if not target_path.exists() or not target_path.is_file():
        return None

    try:
        content = target_path.read_text(encoding="utf-8")
        return json.loads(content)
    except (OSError, json.JSONDecodeError):
        return None


def list_stories(public_only: bool = False, preserved_only: bool = False) -> list[dict[str, Any]]:
    """List stories with optional filtering by status and visibility."""
    stories_dir = get_stories_dir()
    results = []

    with _STORY_LOCK:
        for file_path in sorted(stories_dir.glob("*.json")):
            if file_path.name.startswith("."):
                continue
            try:
                content = file_path.read_text(encoding="utf-8")
                story = json.loads(content)
                if not isinstance(story, dict):
                    continue

                # Check filters
                if preserved_only and story.get("status") != "preserved":
                    continue

                # Check visibility
                visibility = story.get("finalSettings", {}).get("visibility") or story.get("visibility")
                if public_only and visibility != "public":
                    continue

                results.append(story)
            except (OSError, json.JSONDecodeError):
                continue

    return results


def save_vocabulary_terms(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Append or update vocabulary terms in data/vocabulary.json."""
    vocab_path = get_vocabulary_path()
    vocab_path.parent.mkdir(parents=True, exist_ok=True)

    with _VOCAB_LOCK:
        existing = {}
        if vocab_path.exists():
            try:
                existing = json.loads(vocab_path.read_text(encoding="utf-8"))
                if not isinstance(existing, dict):
                    existing = {}
            except (OSError, json.JSONDecodeError):
                existing = {}

        now = datetime.now(timezone.utc).isoformat()
        saved_entries = []
        for w in words:
            term = w.get("preferred") or w.get("canonical_term") or w.get("word")
            if not term:
                continue
            term_id = w.get("id") or term.strip().lower()
            entry = {
                "id": term_id,
                "preferred": term,
                "canonical_term": term,
                "heard": w.get("heard", ""),
                "meaning": w.get("meaning", ""),
                "context": w.get("context", ""),
                "language": w.get("language", "hi"),
                "updated_at": now,
            }
            existing[term_id] = entry
            saved_entries.append(entry)

        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=vocab_path.parent,
                prefix=".vocab.",
                suffix=".tmp",
                delete=False,
            ) as handle:
                tmp_name = handle.name
                json.dump(existing, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, vocab_path)
        except OSError as exc:
            if 'tmp_name' in locals() and Path(tmp_name).exists():
                Path(tmp_name).unlink(missing_ok=True)
            raise StorageError(f"Could not persist vocabulary: {exc}") from exc

    return saved_entries


def get_all_vocabulary() -> list[dict[str, Any]]:
    """Retrieve all vocabulary entries."""
    vocab_path = get_vocabulary_path()
    if not vocab_path.exists():
        return []
    with _VOCAB_LOCK:
        try:
            data = json.loads(vocab_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return list(data.values())
            if isinstance(data, list):
                return data
            return []
        except (OSError, json.JSONDecodeError):
            return []

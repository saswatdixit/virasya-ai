"""Provider-neutral transcript comparison helpers used by human review."""
from __future__ import annotations

import difflib
import re
from typing import List, Optional, Tuple


def normalize_transcript(text: str) -> str:
    """Normalize text for comparison without changing the stored transcript."""
    if not text:
        return ""
    text = re.sub(r"[।॥.,!?]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_correction_candidates(original: str, verified: str) -> List[Tuple[str, str]]:
    if not original or not verified:
        return []

    original_words = normalize_transcript(original).split()
    verified_words = normalize_transcript(verified).split()
    candidates: list[tuple[str, str]] = []
    matcher = difflib.SequenceMatcher(None, original_words, verified_words)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "replace" and i2 - i1 <= 3 and j2 - j1 <= 3:
            candidates.append(
                (" ".join(original_words[i1:i2]), " ".join(verified_words[j1:j2]))
            )
    return candidates


def get_transcript_differences(left_text: str, right_text: str) -> List[dict]:
    """Return editable matching/differing chunks for two transcript drafts."""
    left_words = left_text.split()
    right_words = right_text.split()
    chunks = []
    matcher = difflib.SequenceMatcher(None, left_words, right_words)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            text = " ".join(left_words[i1:i2])
            if text:
                chunks.append({"type": "match", "text": text})
        else:
            chunks.append(
                {
                    "type": "diff",
                    "left": " ".join(left_words[i1:i2]),
                    "right": " ".join(right_words[j1:j2]),
                    "resolved": None,
                }
            )
    return chunks

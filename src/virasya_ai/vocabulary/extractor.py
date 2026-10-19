import re
from dataclasses import dataclass
from typing import List, Optional, Tuple
from virasya_ai.review.compare import extract_correction_candidates, normalize_transcript

HINDI_STOPWORDS = {
    "मैं", "तुम", "वह", "हम", "और", "या", "यह", "वह", "को", "से", "में",
    "का", "की", "के", "पर", "है", "था", "थे", "हैं", "नहीं", "एक", "यहाँ",
}

@dataclass
class VocabCandidate:
    term: str
    source: str
    reason: str
    original_asr: Optional[str] = None
    suggested_category: Optional[str] = None

def generate_review_queue_candidates(left_text: str, right_text: str, verified_text: str) -> List[VocabCandidate]:
    candidates = []
    seen_terms = set()
    
    def add_candidate(cand: VocabCandidate):
        # Deduplicate by term
        if cand.term not in seen_terms:
            candidates.append(cand)
            seen_terms.add(cand.term)

    # 1. Extract explicit corrections against both models
    for source_name, original in [("draft_a", left_text), ("draft_b", right_text)]:
        diffs = extract_correction_candidates(original, verified_text)
        for orig, ver in diffs:
            add_candidate(VocabCandidate(
                term=ver,
                source=f"Correction vs {source_name}",
                reason="differs between ASR models and verified transcript",
                original_asr=orig
            ))
            
    # 2. Extract potential cultural terms conservatively from the verified transcript
    words = verified_text.split()
    for word in words:
        clean_word = normalize_transcript(word)
        if not clean_word or clean_word in HINDI_STOPWORDS:
            continue
            
        # Heuristic: Extremely short words are usually particles
        if len(clean_word) < 3:
            continue
            
        # Keep extraction deliberately conservative until a language-aware
        # vocabulary policy is designed for the Hindi workflow.
        if len(clean_word) >= 5:
            add_candidate(VocabCandidate(
                term=clean_word,
                source="verified transcript",
                reason="possible cultural or rare term",
                suggested_category="cultural_term"
            ))
            
    return candidates

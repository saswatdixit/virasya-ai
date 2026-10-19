import re
from dataclasses import dataclass
from typing import List, Dict, Tuple
from virasya_ai.vocabulary.store import LocalVocabularyStore

@dataclass
class Suggestion:
    matched_text: str
    suggested_term: str
    reason: str
    action: str = "human_review"
    entry_id: str = None

    def to_dict(self):
        return {
            "matched_text": self.matched_text,
            "suggested_term": self.suggested_term,
            "reason": self.reason,
            "action": self.action,
            "entry_id": self.entry_id
        }

class VocabularyMatcher:
    def __init__(self, store: LocalVocabularyStore):
        self.store = store

    def find_matches(self, text: str) -> List[Suggestion]:
        """
        Scans text for known variants of VERIFIED vocabulary terms.
        Returns a list of Suggestions.
        """
        suggestions = []
        verified_terms = self.store.get_verified()

        for entry in verified_terms:
            # Check all known variants
            for variant in entry.variants:
                # Basic exact substring match; spacing varies across Indic text.
                if variant in text:
                    suggestions.append(Suggestion(
                        matched_text=variant,
                        suggested_term=entry.canonical_term,
                        reason="known verified vocabulary variant",
                        entry_id=entry.id
                    ))
                    
        # Remove duplicates
        unique_suggestions = {s.matched_text: s for s in suggestions}
        return list(unique_suggestions.values())

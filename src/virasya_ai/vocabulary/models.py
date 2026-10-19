from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime

@dataclass
class VocabularyEntry:
    id: str
    canonical_term: str
    language: str = "hi"
    category: str = "cultural_term"
    variants: List[str] = field(default_factory=list)
    context: Optional[str] = None
    meaning: Optional[str] = None
    pronunciation: Optional[str] = None
    dialect: Optional[str] = None
    source_artifact: Optional[dict] = None
    provenance_history: List[dict] = field(default_factory=list)
    verification_status: str = "suggested"  # suggested, verified, rejected
    verification_count: int = 0
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self):
        return {
            "id": self.id,
            "canonical_term": self.canonical_term,
            "language": self.language,
            "category": self.category,
            "variants": self.variants,
            "context": self.context,
            "meaning": self.meaning,
            "pronunciation": self.pronunciation,
            "dialect": self.dialect,
            "source_artifact": self.source_artifact,
            "provenance_history": self.provenance_history,
            "verification_status": self.verification_status,
            "verification_count": self.verification_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }
    
    @classmethod
    def from_dict(cls, data: dict):
        return cls(**data)

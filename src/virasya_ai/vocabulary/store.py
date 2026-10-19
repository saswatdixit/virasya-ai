import json
import uuid
from pathlib import Path
from typing import List, Optional, Dict
from datetime import datetime
from virasya_ai.vocabulary.models import VocabularyEntry

class LocalVocabularyStore:
    def __init__(self, storage_path: str = "data/vocabulary.json"):
        self.storage_path = Path(storage_path)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self._load()

    def _load(self):
        self.entries = {}
        if not self.storage_path.exists():
            return
            
        with open(self.storage_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            
        if not content:
            return
            
        try:
            data = json.loads(content)
            self.entries = {k: VocabularyEntry.from_dict(v) for k, v in data.items()}
        except json.JSONDecodeError as e:
            raise ValueError(f"CRITICAL ERROR: The vocabulary file ({self.storage_path}) contains invalid or corrupted JSON. "
                             f"Please repair or back up the file. Do not overwrite it automatically. "
                             f"Error details: {e}")

    def _save(self):
        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump({k: v.to_dict() for k, v in self.entries.items()}, f, ensure_ascii=False, indent=2)

    def get_all(self) -> List[VocabularyEntry]:
        return list(self.entries.values())

    def get_verified(self) -> List[VocabularyEntry]:
        return [e for e in self.entries.values() if e.verification_status == "verified"]

    def add_entry(self, entry: VocabularyEntry):
        if not entry.id:
            entry.id = str(uuid.uuid4())
        self.entries[entry.id] = entry
        self._save()

    def update_entry(self, entry: VocabularyEntry):
        entry.updated_at = datetime.utcnow().isoformat()
        self.entries[entry.id] = entry
        self._save()

    def find_by_canonical(self, term: str) -> Optional[VocabularyEntry]:
        for e in self.entries.values():
            if e.canonical_term == term:
                return e
        return None
        
    def find_by_variant(self, variant: str) -> Optional[VocabularyEntry]:
        for e in self.entries.values():
            if variant in e.variants or variant == e.canonical_term:
                return e
        return None

    def add_or_update_term(self, canonical: str, variant: str, source_artifact: dict = None):
        """
        Safely adds a verified correction to the vocabulary store.
        Prevents duplicates and intelligently increments verification counts.
        Maintains provenance_history.
        """
        if source_artifact:
            source_artifact["verified_at"] = datetime.utcnow().isoformat()

        existing = self.find_by_canonical(canonical)
        
        if existing:
            # Term exists, check if variant exists
            if variant not in existing.variants and variant != canonical:
                existing.variants.append(variant)
            # A human has explicitly confirmed this existing knowledge
            existing.verification_count += 1
            if source_artifact:
                existing.provenance_history.append(source_artifact)
            self.update_entry(existing)
            return existing
            
        # Check if the reversed relationship exists (maybe someone previously added variant as canonical)
        existing_rev = self.find_by_canonical(variant)
        if existing_rev and canonical in existing_rev.variants:
            existing_rev.verification_count += 1
            if source_artifact:
                existing_rev.provenance_history.append(source_artifact)
            self.update_entry(existing_rev)
            return existing_rev
            
        # Create entirely new verified entry
        new_entry = VocabularyEntry(
            id=str(uuid.uuid4()),
            canonical_term=canonical,
            variants=[variant] if variant != canonical else [],
            verification_status="verified",
            verification_count=1,
            source_artifact=source_artifact,
            provenance_history=[source_artifact] if source_artifact else []
        )
        self.add_entry(new_entry)
        return new_entry

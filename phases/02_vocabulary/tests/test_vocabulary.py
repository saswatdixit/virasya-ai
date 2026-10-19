import pytest
import os
import tempfile
from virasya_ai.vocabulary.models import VocabularyEntry
from virasya_ai.vocabulary.store import LocalVocabularyStore
from virasya_ai.vocabulary.matcher import VocabularyMatcher, Suggestion

def test_vocabulary_entry_creation():
    entry = VocabularyEntry(id="1", canonical_term="Term")
    assert entry.language == "hi"
    assert entry.category == "cultural_term"
    assert entry.verification_status == "suggested"

def test_local_store():
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = os.path.join(tmpdir, "test_vocab.json")
        store = LocalVocabularyStore(store_path)
        
        # Test defaults
        # assert len(store.get_all()) > 0
        
        # Add new
        entry = VocabularyEntry(id="test1", canonical_term="NewTerm", verification_status="verified")
        store.add_entry(entry)
        
        assert len(store.get_verified()) >= 1
        
        # Add variant
        store.add_or_update_term("NewTerm", "NewTerm Variant")
        loaded_entry = store.find_by_canonical("NewTerm")
        assert "NewTerm Variant" in loaded_entry.variants

def test_vocabulary_matcher():
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = os.path.join(tmpdir, "test_vocab.json")
        store = LocalVocabularyStore(store_path)
        
        # Add a test entry
        entry = VocabularyEntry(id="test2", canonical_term="Testing", verification_status="verified", variants=["TestVar"])
        store.add_entry(entry)
        
        matcher = VocabularyMatcher(store)
        
        # Find match
        suggestions = matcher.find_matches("This is a TestVar in text.")
        assert len(suggestions) == 1
        assert suggestions[0].matched_text == "TestVar"
        assert suggestions[0].suggested_term == "Testing"

def test_local_store_missing_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = os.path.join(tmpdir, "missing.json")
        store = LocalVocabularyStore(store_path)
        assert len(store.get_all()) == 0

def test_local_store_empty_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = os.path.join(tmpdir, "empty.json")
        open(store_path, 'w').write('')
        store = LocalVocabularyStore(store_path)
        assert len(store.get_all()) == 0

def test_local_store_invalid_json():
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = os.path.join(tmpdir, "corrupt.json")
        open(store_path, 'w').write('{invalid_json')
        with pytest.raises(ValueError, match="CRITICAL ERROR"):
            LocalVocabularyStore(store_path)

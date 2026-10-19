from virasya_ai.review.compare import extract_correction_candidates


def test_punctuation_only_changes_are_not_correction_candidates():
    assert extract_correction_candidates("यह पाठ।", "यह पाठ") == []

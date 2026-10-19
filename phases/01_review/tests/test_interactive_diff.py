from virasya_ai.review.compare import get_transcript_differences


def test_identical_transcript_has_one_match_chunk():
    assert get_transcript_differences("एक ही पाठ", "एक ही पाठ") == [
        {"type": "match", "text": "एक ही पाठ"}
    ]

from virasya_ai.review.compare import (
    extract_correction_candidates,
    get_transcript_differences,
    normalize_transcript,
)


def test_normalization_is_language_neutral():
    assert normalize_transcript("नमस्ते,   दुनिया।") == "नमस्ते दुनिया"


def test_correction_candidates():
    assert extract_correction_candidates("यह एक मसौदा", "यह सही मसौदा") == [("एक", "सही")]


def test_transcript_differences():
    chunks = get_transcript_differences("यह पहला पाठ", "यह दूसरा पाठ")
    assert chunks[0] == {"type": "match", "text": "यह"}
    assert chunks[1]["type"] == "diff"
    assert chunks[1]["left"] == "पहला"
    assert chunks[1]["right"] == "दूसरा"

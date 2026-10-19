from virasya_ai.punctuation.core import PunctuationRestorer, punctuate_task


def test_normalize_punctuation_is_not_odia_specific():
    restorer = PunctuationRestorer()
    assert restorer.normalize_punctuation("यह एक वाक्य.") == "यह एक वाक्य।"
    assert restorer.normalize_punctuation("3.14 example.com") == "3.14 example.com"


def test_punctuate_task_requires_verified_text():
    try:
        punctuate_task({})
    except ValueError as exc:
        assert "verified_transcript" in str(exc)
    else:
        raise AssertionError("expected missing verified transcript to fail")

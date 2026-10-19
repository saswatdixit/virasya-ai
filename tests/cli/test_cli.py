from unittest.mock import patch

from virasya_ai.cli import main


def test_no_args_errors(capsys):
    assert main([]) == 1
    assert "Usage" in capsys.readouterr().out


def test_vocabulary_subcommand(capsys, tmp_path):
    with patch("virasya_ai.vocabulary.store.LocalVocabularyStore") as store_cls:
        store_cls.return_value.get_all.return_value = []
        assert main(["vocabulary", "list"]) == 0
    assert "Total vocabulary entries" in capsys.readouterr().out


def test_hindi_is_the_default_language():
    with patch("virasya_ai.cli.cmd_transcribe", return_value=0) as transcribe:
        assert main(["sample.wav"]) == 0
    transcribe.assert_called_once_with("sample.wav", "hi", {})


def test_old_language_is_rejected(capsys):
    assert main(["sample.wav", "or"]) == 1
    assert "Hindi is the only active language" in capsys.readouterr().out

from pathlib import Path
from unittest.mock import patch

from virasya_ai.cli import cmd_transcribe_batch


def test_batch_transcribe_uses_hindi_and_reports_provider_pending(tmp_path):
    (tmp_path / "one.wav").touch()
    (tmp_path / "two.ogg").touch()
    with patch("virasya_ai.cli.cmd_transcribe", return_value=1) as transcribe:
        assert cmd_transcribe_batch(str(tmp_path)) == 1
    assert transcribe.call_count == 2
    assert all(call.args[1] == "hi" for call in transcribe.call_args_list)

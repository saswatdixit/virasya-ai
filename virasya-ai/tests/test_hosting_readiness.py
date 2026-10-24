"""Tests for backend hosting readiness: port resolution, user scratch isolation, cleanup, and CORS."""
import json
import os
import time
import urllib.request
from http import HTTPStatus
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from virasya_ai.transcription.base import TranscriptResult
from virasya_ai.transcription.story_storage import cleanup_stale_scratch_files, get_data_dir
from virasya_ai.web.server import create_server, INPUT_AUDIO_DIR


def http_post_multipart(url: str, filename: str, content: bytes, headers: dict | None = None):
    boundary = "----WebKitFormBoundaryTest123456789"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: audio/wav\r\n\r\n"
    ).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req_headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    }
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(url, data=body, headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body_resp = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(body_resp)
        except json.JSONDecodeError:
            return exc.code, {"error": body_resp}


def http_post_json(url: str, payload: dict, headers: dict | None = None):
    data = json.dumps(payload).encode("utf-8")
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(body)
        except json.JSONDecodeError:
            return exc.code, {"error": body}


def http_get(url: str, headers: dict | None = None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def test_stale_scratch_files_cleanup(tmp_path: Path):
    scratch_dir = tmp_path / "scratch"
    scratch_dir.mkdir()

    old_file = scratch_dir / "old.wav"
    old_file.write_bytes(b"old-content")
    # Set mtime to 2 hours ago
    two_hours_ago = time.time() - 7200
    os.utime(old_file, (two_hours_ago, two_hours_ago))

    new_file = scratch_dir / "new.wav"
    new_file.write_bytes(b"new-content")

    user_sub = scratch_dir / "user_abc"
    user_sub.mkdir()
    old_user_file = user_sub / "user_old.wav"
    old_user_file.write_bytes(b"user-content")
    os.utime(old_user_file, (two_hours_ago, two_hours_ago))

    # Run cleanup with 1 hour threshold
    removed = cleanup_stale_scratch_files(scratch_dir, max_age_seconds=3600.0)
    assert removed == 2
    assert not old_file.exists()
    assert not old_user_file.exists()
    assert new_file.exists()
    assert not user_sub.exists()  # Empty directory purged


def test_custom_data_dir_env(tmp_path: Path, monkeypatch):
    custom_dir = tmp_path / "custom_data"
    monkeypatch.setenv("VIRASYA_DATA_DIR", str(custom_dir))
    data_dir = get_data_dir()
    assert data_dir == custom_dir
    assert custom_dir.exists()


def test_user_isolation_on_upload_and_transcribe(live_server, synthetic_wav):
    audio_bytes = synthetic_wav.read_bytes()
    filename = "isolated_test.wav"

    user_a = {"id": "user_aaa_123", "email": "a@example.com"}
    user_b = {"id": "user_bbb_456", "email": "b@example.com"}

    def mock_verify_user(self, token: str):
        if token == "token_user_a":
            return user_a
        elif token == "token_user_b":
            return user_b
        return None

    with patch("virasya_ai.web.server.StudioHandler._verify_supabase_bearer_token", side_effect=mock_verify_user, autospec=True):
        # 1. User A uploads file
        status, res = http_post_multipart(
            f"{live_server}/api/upload",
            filename,
            audio_bytes,
            headers={"Authorization": "Bearer token_user_a"},
        )
        assert status == HTTPStatus.OK
        assert res["status"] == "success"

        # Verify file is stored in user_a directory
        user_a_file = INPUT_AUDIO_DIR / "user_aaa_123" / filename
        assert user_a_file.exists()

        # 2. User B attempts to transcribe User A's file
        status_b, res_b = http_post_json(
            f"{live_server}/api/transcribe",
            {"filename": filename, "language_code": "hi-IN"},
            headers={"Authorization": "Bearer token_user_b"},
        )
        assert status_b == HTTPStatus.BAD_REQUEST
        assert "not found" in res_b["error"].lower()

        # 3. User B attempts to fetch User A's audio file
        get_status_b, _ = http_get(
            f"{live_server}/api/audio/{filename}",
            headers={"Authorization": "Bearer token_user_b"},
        )
        assert get_status_b == HTTPStatus.NOT_FOUND

        # 4. User A successfully transcribes their own file
        mock_result = TranscriptResult(text="नमस्ते भारत", language="hi", provider="gnani")
        with patch("virasya_ai.web.server.GnaniTranscriptionService") as MockService:
            instance = MockService.return_value.__enter__.return_value
            instance.transcribe.return_value = mock_result

            status_a, res_a = http_post_json(
                f"{live_server}/api/transcribe",
                {"filename": filename, "language_code": "hi-IN"},
                headers={"Authorization": "Bearer token_user_a"},
            )
            assert status_a == HTTPStatus.OK
            assert res_a["transcript"] == "नमस्ते भारत"

        # Cleanup isolated file
        user_a_file.unlink(missing_ok=True)
        (INPUT_AUDIO_DIR / "user_aaa_123").rmdir()


def test_auth_required_mode(live_server, monkeypatch, synthetic_wav):
    monkeypatch.setenv("VIRASYA_REQUIRE_AUTH", "true")

    # Unauthenticated upload rejected
    status, res = http_post_multipart(
        f"{live_server}/api/upload",
        "sample.wav",
        synthetic_wav.read_bytes(),
    )
    assert status == HTTPStatus.UNAUTHORIZED
    assert res["code"] == "AUTH_REQUIRED"

    # Unauthenticated transcribe rejected
    status_tx, res_tx = http_post_json(
        f"{live_server}/api/transcribe",
        {"filename": "sample.wav", "language_code": "hi-IN"},
    )
    assert status_tx == HTTPStatus.UNAUTHORIZED
    assert res_tx["code"] == "AUTH_REQUIRED"

    # Unauthenticated audio download rejected
    get_status, _ = http_get(f"{live_server}/api/audio/sample.wav")
    assert get_status == HTTPStatus.UNAUTHORIZED

    # Authenticated user cannot fall back to shared unauthenticated root in production
    root_file = INPUT_AUDIO_DIR / "secret_root.wav"
    root_file.write_bytes(synthetic_wav.read_bytes())
    try:
        user_c = {"id": "user_ccc_789", "email": "c@example.com"}
        with patch("virasya_ai.web.server.StudioHandler._verify_supabase_bearer_token", return_value=user_c):
            status_c, res_c = http_post_json(
                f"{live_server}/api/transcribe",
                {"filename": "secret_root.wav", "language_code": "hi-IN"},
                headers={"Authorization": "Bearer token_user_c"},
            )
            assert status_c == HTTPStatus.BAD_REQUEST
            assert "not found" in res_c["error"].lower()

            get_status_c, _ = http_get(
                f"{live_server}/api/audio/secret_root.wav",
                headers={"Authorization": "Bearer token_user_c"},
            )
            assert get_status_c == HTTPStatus.NOT_FOUND
    finally:
        root_file.unlink(missing_ok=True)


def test_cors_headers_with_allowed_origins(live_server, monkeypatch):
    monkeypatch.setenv("VIRASYA_ALLOWED_ORIGINS", "https://virasya.ai,https://virasya.vercel.app")

    # Approved origin receives exact Access-Control-Allow-Origin header
    req = urllib.request.Request(
        f"{live_server}/api/health",
        headers={"Origin": "https://virasya.ai"},
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.headers.get("Access-Control-Allow-Origin") == "https://virasya.ai"
        assert resp.headers.get("Vary") == "Origin"

    # Disallowed origin is rejected (no Access-Control-Allow-Origin header returned)
    req2 = urllib.request.Request(
        f"{live_server}/api/health",
        headers={"Origin": "https://malicious-site.com"},
    )
    with urllib.request.urlopen(req2) as resp2:
        assert resp2.headers.get("Access-Control-Allow-Origin") is None

    # Non-browser requests (no Origin header) proceed normally without CORS headers
    req3 = urllib.request.Request(f"{live_server}/api/health")
    with urllib.request.urlopen(req3) as resp3:
        assert resp3.status == HTTPStatus.OK
        assert resp3.headers.get("Access-Control-Allow-Origin") is None


def test_path_traversal_rejection(live_server):
    # Encoded traversal attempt
    status, _ = http_get(f"{live_server}/api/audio/%2e%2e%2fetc%2fpasswd")
    assert status in (HTTPStatus.BAD_REQUEST, HTTPStatus.NOT_FOUND)


def test_production_startup_validation(monkeypatch):
    from virasya_ai.web.server import main
    monkeypatch.setenv("VIRASYA_REQUIRE_AUTH", "true")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("VITE_SUPABASE_URL", raising=False)

    with pytest.raises(SystemExit) as exc_info:
        main()
    assert "FATAL CONFIGURATION ERROR" in str(exc_info.value)



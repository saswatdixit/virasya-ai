"""Comprehensive security, authorization, route-registry, and boundary tests for Virasya Studio Backend Server."""
from __future__ import annotations

import io
import json
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request
from http import HTTPStatus
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from virasya_ai.exceptions import AudioTooLongError, CorruptAudioError, StorageError, UploadError
from virasya_ai.transcription.ingestion.audio import _ffmpeg_decode
from virasya_ai.transcription.story_storage import get_story, save_story
from virasya_ai.web.server import (
    ALLOWED_AUDIO_EXTENSIONS,
    MAX_REQUEST_BYTES,
    MultipartData,
    MultipartField,
    StudioHandler,
    _TRANSCRIPTION_SEMAPHORE,
    main,
)


def http_req(
    url: str,
    method: str = "GET",
    payload: dict | None = None,
    headers: dict | None = None,
    raw_body: bytes | None = None,
    content_type: str | None = None,
) -> tuple[int, dict]:
    req_headers = headers.copy() if headers else {}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    elif raw_body is not None:
        data = raw_body
        if content_type:
            req_headers["Content-Type"] = content_type

    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(body)
        except json.JSONDecodeError:
            return exc.code, {"error": body}


# =============================================================================
# W1: Route Registry & Auth Classification Invariant
# =============================================================================

KNOWN_ROUTES = {
    # Public routes (by design)
    ("GET", "/"): "public",
    ("GET", "/static/app.js"): "public",
    ("GET", "/static/styles.css"): "public",
    ("GET", "/api/languages"): "public",
    ("GET", "/api/health"): "public",
    ("GET", "/api/models/status"): "public",
    ("GET", "/api/explore"): "public",
    ("GET", "/api/explore/<id>"): "public_filtered",
    ("POST", "/api/punctuate"): "public",
    # Protected routes (require auth when VIRASYA_REQUIRE_AUTH is active)
    ("POST", "/api/upload"): "authenticated",
    ("POST", "/api/transcribe"): "authenticated",
    ("GET", "/api/audio/<filename>"): "authenticated_scoped",
    ("GET", "/api/stories"): "authenticated_scoped",
    ("POST", "/api/stories"): "authenticated_scoped",
    ("GET", "/api/stories/<id>"): "authenticated_scoped",
    ("POST", "/api/stories/<id>/preserve"): "authenticated_scoped",
    ("POST", "/api/save"): "authenticated",
    ("GET", "/api/vocabulary"): "authenticated",
    ("POST", "/api/vocabulary"): "authenticated",
}


def test_route_registry_completeness():
    """Fail if any route in StudioHandler is missing from the explicit security classification."""
    server_path = Path(__file__).resolve().parent.parent / "src" / "virasya_ai" / "web" / "server.py"
    content = server_path.read_text(encoding="utf-8")

    # 1. Verify every classified route is present in server.py
    for (method, route_pattern), classification in KNOWN_ROUTES.items():
        base = route_pattern.split("<")[0].rstrip("/")
        if base:
            assert base in content, f"Registered route pattern '{route_pattern}' not found in server.py"

    # 2. Extract all route paths handled in server.py do_GET and do_POST and ensure they exist in KNOWN_ROUTES
    route_matches = set()
    for line in content.splitlines():
        line_clean = line.strip()
        if line_clean.startswith(("if path ==", "elif path ==")):
            m = re.search(r'path\s*==\s*"([^"]+)"', line_clean)
            if m:
                route_matches.add(m.group(1))
        elif line_clean.startswith(("if path.startswith", "elif path.startswith")):
            m = re.search(r'path\.startswith\("([^"]+)"\)', line_clean)
            if m:
                route_matches.add(m.group(1))

    known_prefixes = {pattern.split("<")[0] for (m, pattern) in KNOWN_ROUTES.keys()}
    known_exacts = {pattern for (m, pattern) in KNOWN_ROUTES.keys() if "<" not in pattern}

    assert route_matches, "Failed to extract routes from server.py"
    for server_route in route_matches:
        is_known = (server_route in known_exacts) or any(server_route.startswith(p) for p in known_prefixes)
        assert is_known, f"Route '{server_route}' handled in server.py has no security classification in KNOWN_ROUTES"


# =============================================================================
# W1: Table-Driven Matrix Tests Across Routes, Roles, and Methods
# =============================================================================

def test_public_routes_matrix(live_server):
    """Public routes must remain accessible without credentials even when auth is strictly required."""
    with patch.dict(os.environ, {"VIRASYA_REQUIRE_AUTH": "true"}):
        public_matrix = [
            ("GET", f"{live_server}/api/health", None, HTTPStatus.OK),
            ("GET", f"{live_server}/api/models/status", None, HTTPStatus.OK),
            ("GET", f"{live_server}/api/languages", None, HTTPStatus.OK),
            ("GET", f"{live_server}/api/explore", None, HTTPStatus.OK),
            ("POST", f"{live_server}/api/punctuate", {"text": "ନମସ୍କାର"}, HTTPStatus.OK),
        ]
        for method, url, payload, expected_status in public_matrix:
            status, res = http_req(url, method=method, payload=payload)
            assert status == expected_status, f"{method} {url} expected {expected_status}, got {status}"


def test_protected_routes_matrix_unauthenticated(live_server):
    """Protected endpoints must reject anonymous and invalid tokens with 401 when auth is required."""
    with patch.dict(os.environ, {"VIRASYA_REQUIRE_AUTH": "true"}), \
         patch("virasya_ai.transcription.service.GnaniTranscriptionService") as mock_gnani:

        protected_matrix = [
            ("GET", f"{live_server}/api/stories", None),
            ("POST", f"{live_server}/api/stories", {"title": "Test"}),
            ("GET", f"{live_server}/api/stories/some_story_id", None),
            ("POST", f"{live_server}/api/stories/some_story_id/preserve", {"visibility": "public"}),
            ("POST", f"{live_server}/api/transcribe", {"filename": "test.wav", "language": "hi"}),
            ("GET", f"{live_server}/api/vocabulary", None),
            ("POST", f"{live_server}/api/vocabulary", {"words": ["word"]}),
            ("POST", f"{live_server}/api/save", {"audio_filename": "t.wav", "language": "hi", "raw_text": "x", "reviewed_text": "y"}),
        ]

        for method, url, payload in protected_matrix:
            # 1. Anonymous request (no token) -> 401 AUTH_REQUIRED
            status, res = http_req(url, method=method, payload=payload)
            assert status == HTTPStatus.UNAUTHORIZED, f"{method} {url} anonymous expected 401, got {status}"
            assert res.get("code") == "AUTH_REQUIRED"

            # 2. Invalid token -> 401 UNAUTHORIZED
            with patch("virasya_ai.web.server.StudioHandler._verify_supabase_bearer_token", return_value=None):
                status, res = http_req(url, method=method, payload=payload, headers={"Authorization": "Bearer invalid.jwt"})
                assert status == HTTPStatus.UNAUTHORIZED, f"{method} {url} invalid token expected 401, got {status}"
                assert res.get("code") == "UNAUTHORIZED"

        # Assert provider service was NEVER instantiated or invoked on any rejected call
        mock_gnani.assert_not_called()


def test_story_ownership_and_tenant_isolation(live_server):
    """Enforce strict tenant isolation: User A cannot read, edit, or preserve User B's stories."""
    user_alice = {"id": "user-alice-uuid-0001", "email": "alice@virasya.local"}
    user_bob = {"id": "user-bob-uuid-0002", "email": "bob@virasya.local"}

    def mock_auth(token: str):
        if token == "alice-token":
            return user_alice
        if token == "bob-token":
            return user_bob
        return None

    with patch.dict(os.environ, {"VIRASYA_REQUIRE_AUTH": "true"}), \
         patch("virasya_ai.web.server.StudioHandler._verify_supabase_bearer_token", side_effect=mock_auth):

        h_alice = {"Authorization": "Bearer alice-token"}
        h_bob = {"Authorization": "Bearer bob-token"}
        story_id = f"iso_story_{int(os.getpid())}"

        # 1. Alice creates a private draft
        status, res = http_req(
            f"{live_server}/api/stories",
            method="POST",
            payload={"id": story_id, "title": "Alice Secret", "status": "draft"},
            headers=h_alice,
        )
        assert status == HTTPStatus.OK
        assert res["story"]["user_id"] == user_alice["id"]

        # 2. Alice lists stories -> sees her story
        status, stories = http_req(f"{live_server}/api/stories", headers=h_alice)
        assert status == HTTPStatus.OK
        assert any(s["id"] == story_id for s in stories)

        # 3. Bob lists stories -> CANNOT see Alice's story
        status, bob_stories = http_req(f"{live_server}/api/stories", headers=h_bob)
        assert status == HTTPStatus.OK
        assert not any(s["id"] == story_id for s in bob_stories)

        # 4. Bob tries to GET Alice's private draft directly -> 403 Forbidden
        status, res = http_req(f"{live_server}/api/stories/{story_id}", headers=h_bob)
        assert status == HTTPStatus.FORBIDDEN
        assert res.get("code") == "FORBIDDEN"

        # 5. Bob tries to edit Alice's story -> 403 Forbidden
        status, res = http_req(
            f"{live_server}/api/stories",
            method="POST",
            payload={"id": story_id, "title": "Bob Tampered Title"},
            headers=h_bob,
        )
        assert status == HTTPStatus.FORBIDDEN

        # 6. Bob tries to preserve Alice's story -> 403 Forbidden
        status, res = http_req(
            f"{live_server}/api/stories/{story_id}/preserve",
            method="POST",
            payload={"visibility": "public"},
            headers=h_bob,
        )
        assert status == HTTPStatus.FORBIDDEN


def test_ownerless_legacy_stories_default_deny_under_auth(live_server):
    """Enforce default-deny: authenticated users cannot read, list, modify, or preserve legacy ownerless stories."""
    legacy_story_id = f"legacy_iso_{int(os.getpid())}_{int(time.time() * 1000)}"
    save_story({
        "id": legacy_story_id,
        "title": "Legacy Ownerless Story",
        "status": "draft",
        "user_id": None,
    })

    user_alice = {"id": "user-alice-uuid-0001", "email": "alice@virasya.local"}
    with patch.dict(os.environ, {"VIRASYA_REQUIRE_AUTH": "true"}), \
         patch("virasya_ai.web.server.StudioHandler._verify_supabase_bearer_token", return_value=user_alice):

        h_alice = {"Authorization": "Bearer alice-token"}

        # 1. Alice lists stories -> legacy ownerless story is NOT in the listing
        status, stories = http_req(f"{live_server}/api/stories", headers=h_alice)
        assert status == HTTPStatus.OK
        assert not any(s["id"] == legacy_story_id for s in stories)

        # 2. Alice tries to read the legacy ownerless draft -> 403 Forbidden
        status, res = http_req(f"{live_server}/api/stories/{legacy_story_id}", headers=h_alice)
        assert status == HTTPStatus.FORBIDDEN
        assert res.get("code") == "FORBIDDEN"

        # 3. Alice tries to modify the legacy ownerless draft -> 403 Forbidden
        status, res = http_req(
            f"{live_server}/api/stories",
            method="POST",
            payload={"id": legacy_story_id, "title": "Alice Claiming Legacy"},
            headers=h_alice,
        )
        assert status == HTTPStatus.FORBIDDEN
        assert res.get("code") == "FORBIDDEN"

        # 4. Alice tries to preserve the legacy ownerless draft -> 403 Forbidden
        status, res = http_req(
            f"{live_server}/api/stories/{legacy_story_id}/preserve",
            method="POST",
            payload={"visibility": "public"},
            headers=h_alice,
        )
        assert status == HTTPStatus.FORBIDDEN
        assert res.get("code") == "FORBIDDEN"


# =============================================================================
# W1: Concurrency Semaphore Leak Prevention
# =============================================================================

def test_transcription_semaphore_release_on_exception(live_server):
    """Ensure _TRANSCRIPTION_SEMAPHORE releases even when transcription throws an exception."""
    initial_value = _TRANSCRIPTION_SEMAPHORE._value

    with patch.dict(os.environ, {"VIRASYA_REQUIRE_AUTH": "false"}), \
         patch("virasya_ai.web.server.transcribe_uploaded_audio", side_effect=RuntimeError("Engine failure")):

        boundary = "---------------------------974767299852498929531610575"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="audio_file"; filename="test.wav"\r\n'
            f"Content-Type: audio/wav\r\n\r\n"
            f"RIFFfakeWAVEfmt \r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        status, res = http_req(
            f"{live_server}/api/transcribe",
            method="POST",
            raw_body=body,
            content_type=f"multipart/form-data; boundary={boundary}",
        )
        assert status == HTTPStatus.INTERNAL_SERVER_ERROR

    # Semaphore value must be restored to its exact initial state (no semaphore leak)
    assert _TRANSCRIPTION_SEMAPHORE._value == initial_value


# =============================================================================
# W1: Non-Loopback Host Binding Safety
# =============================================================================

def test_non_loopback_host_binding_refusal():
    """Server must refuse to bind to non-loopback host when VIRASYA_REQUIRE_AUTH is disabled without explicit override."""
    with patch.dict(os.environ, {"VIRASYA_REQUIRE_AUTH": "false", "VIRASYA_WEB_HOST": "0.0.0.0"}):
        with pytest.raises(SystemExit) as exc_info:
            main()
        assert "FATAL SECURITY ERROR" in str(exc_info.value)

    # With explicit developer override, binding is permitted
    with patch.dict(os.environ, {
        "VIRASYA_REQUIRE_AUTH": "false",
        "VIRASYA_WEB_HOST": "127.0.0.1",
        "VIRASYA_ALLOW_INSECURE_HOST": "1",
    }), patch("virasya_ai.web.server.create_server") as mock_srv:
        mock_srv.return_value.serve_forever.side_effect = KeyboardInterrupt
        main()
        mock_srv.assert_called_once()


# =============================================================================
# W2: Service-Role Sync Hardening Tests
# =============================================================================

def test_service_role_sync_refuses_anonymous():
    """Sync must refuse without verified user ID."""
    with patch.dict(os.environ, {
        "VIRASYA_ALLOW_DIRECT_SERVICE_ROLE_SYNC": "true",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "srv_key",
    }):
        handler = StudioHandler.__new__(StudioHandler)
        with pytest.raises(StorageError, match="without verified story ID and user ID"):
            handler._sync_preserved_story_to_supabase({"id": "s1"})


def test_service_role_sync_refuses_different_owner():
    """Sync must refuse when remote record belongs to a different owner."""
    with patch.dict(os.environ, {
        "VIRASYA_ALLOW_DIRECT_SERVICE_ROLE_SYNC": "true",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "srv_key",
    }):
        handler = StudioHandler.__new__(StudioHandler)

        # Mock GET returning remote record with different owner
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps([{"id": "s1", "user_id": "other_user", "status": "draft"}]).encode()
        mock_resp.__enter__.return_value = mock_resp

        with patch("urllib.request.urlopen", return_value=mock_resp):
            with pytest.raises(StorageError, match="belongs to a different user"):
                handler._sync_preserved_story_to_supabase({"id": "s1", "user_id": "my_user"})


def test_service_role_sync_refuses_already_preserved():
    """Sync must refuse when remote record is already preserved and sealed."""
    with patch.dict(os.environ, {
        "VIRASYA_ALLOW_DIRECT_SERVICE_ROLE_SYNC": "true",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "srv_key",
    }):
        handler = StudioHandler.__new__(StudioHandler)

        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps([{"id": "s1", "user_id": "my_user", "status": "preserved"}]).encode()
        mock_resp.__enter__.return_value = mock_resp

        with patch("urllib.request.urlopen", return_value=mock_resp):
            with pytest.raises(StorageError, match="already preserved and sealed"):
                handler._sync_preserved_story_to_supabase({"id": "s1", "user_id": "my_user"})


def test_service_role_sync_rejects_on_remote_pk_conflict():
    """Sync must be a plain insert that raises StorageError upon HTTP 409 conflict."""
    with patch.dict(os.environ, {
        "VIRASYA_ALLOW_DIRECT_SERVICE_ROLE_SYNC": "true",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "srv_key",
    }):
        handler = StudioHandler.__new__(StudioHandler)

        mock_preflight = MagicMock()
        mock_preflight.read.return_value = b"[]"
        mock_preflight.__enter__.return_value = mock_preflight

        conflict_err = urllib.error.HTTPError(
            url="https://example.supabase.co/rest/v1/stories",
            code=409,
            msg="Conflict",
            hdrs={},
            fp=io.BytesIO(b'{"message": "duplicate key value violates unique constraint"}'),
        )

        sent_requests = []
        def fake_urlopen(req, timeout=5):
            sent_requests.append(req)
            if len(sent_requests) == 1:
                return mock_preflight
            raise conflict_err

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            with pytest.raises(StorageError, match="409"):
                handler._sync_preserved_story_to_supabase({
                    "id": "s_conflict_123",
                    "user_id": "u_test",
                    "title": "Conflict Story",
                })

        assert len(sent_requests) == 2
        insert_req = sent_requests[1]
        assert insert_req.method == "POST"
        assert insert_req.full_url == "https://example.supabase.co/rest/v1/stories"
        assert insert_req.headers.get("Prefer") == "return=minimal"
        assert "merge-duplicates" not in insert_req.headers.get("Prefer", "")


# =============================================================================
# W7: Custom Multipart Parser Edge Cases
# =============================================================================

def test_multipart_parser_duplicate_keys_and_large_body():
    """Verify MultipartData handles duplicate keys via getlist() and binary payloads."""
    form = MultipartData()
    f1 = MultipartField(name="tag", value=b"heritage")
    f2 = MultipartField(name="tag", value=b"folklore")
    f3 = MultipartField(name="audio", value=b"\x00\x01\x02\x03", filename="sound.wav", content_type="audio/wav")

    form.add(f1)
    form.add(f2)
    form.add(f3)

    assert "tag" in form
    assert "audio" in form
    assert "nonexistent" not in form

    assert form.getvalue("tag") == "heritage"
    tags = form.getlist("tag")
    assert len(tags) == 2
    assert [t.value.decode() for t in tags] == ["heritage", "folklore"]

    audio_field = form["audio"]
    assert audio_field.filename == "sound.wav"
    assert audio_field.content_type == "audio/wav"
    assert audio_field.file.read() == b"\x00\x01\x02\x03"


def test_multipart_parser_body_size_cap_and_missing_header():
    """Verify multipart parser enforces content-type header and MAX_REQUEST_BYTES limit."""
    # 1. Non-multipart content type raises UploadError
    handler = MagicMock(spec=StudioHandler)
    handler.headers = {"Content-Type": "application/json"}
    with pytest.raises(UploadError, match="multipart audio upload"):
        StudioHandler._multipart_fields(handler)

    # 2. Oversized payload raises UploadError
    handler.headers = {"Content-Type": "multipart/form-data; boundary=bound123"}
    handler._content_length.return_value = MAX_REQUEST_BYTES + 1
    with pytest.raises(UploadError, match="upload is too large"):
        StudioHandler._multipart_fields(handler)


def test_multipart_parser_comprehensive_roundtrip_and_edge_cases():
    """Verify parsing large bodies, binary content, missing filename, duplicate fields, and malformed parts."""
    boundary = "----WebKitFormBoundaryXYZ987654321"

    # 1 MiB diverse binary payload with null bytes, 0xFF, high-order bytes
    binary_content = bytes(range(256)) * 4096

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="title"\r\n\r\n'
        f"Folklore of Sambalpur\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="audio"; filename="recording.wav"\r\n'
        f"Content-Type: audio/wav\r\n\r\n"
    ).encode("latin1") + binary_content + (
        f"\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name="category"\r\n\r\n'
        f"tribal-song\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="category"\r\n\r\n'
        f"oral-history\r\n"
        f"--{boundary}\r\n"
        f"Content-Disposition: form-data\r\n\r\n"
        f"malformed_part_without_name\r\n"
        f"--{boundary}--\r\n"
    ).encode("latin1")

    handler = MagicMock(spec=StudioHandler)
    handler.headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    handler._content_length.return_value = len(body)
    handler.rfile = io.BytesIO(body)

    result = StudioHandler._multipart_fields(handler)

    # Verify field without filename
    assert result.getvalue("title") == "Folklore of Sambalpur"
    assert result["title"].filename is None

    # Verify binary content and byte-for-byte exact equality
    audio_field = result["audio"]
    assert audio_field.filename == "recording.wav"
    assert audio_field.content_type == "audio/wav"
    assert audio_field.value == binary_content
    assert audio_field.file.read() == binary_content

    # Verify duplicate fields
    assert result.getvalue("category") == "tribal-song"
    categories = result.getlist("category")
    assert len(categories) == 2
    assert [c.value.decode("utf-8") for c in categories] == ["tribal-song", "oral-history"]

    # Verify malformed part without name is safely ignored
    assert len(result._fields) == 3


# =============================================================================
# W3: Audio Subprocess Timeout & Output Bound Tests
# =============================================================================

def test_ffmpeg_decode_timeout_and_output_cap(tmp_path):
    fake_audio = tmp_path / "hang.mp3"
    fake_audio.write_bytes(b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"\xff\xfb\x90\x00" * 100)

    # 1. TimeoutExpired must raise CorruptAudioError
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=["ffmpeg"], timeout=30.0)):
        with pytest.raises(CorruptAudioError, match="timed out"):
            _ffmpeg_decode(fake_audio)

    # 2. Decoded stdout > 25 MiB cap must raise AudioTooLongError
    huge_stdout = b"\x00" * (26 * 1024 * 1024)  # 26 MiB
    proc_mock = MagicMock(returncode=0, stdout=huge_stdout, stderr=b"")
    with patch("subprocess.run", return_value=proc_mock):
        with pytest.raises(AudioTooLongError, match="exceeds the maximum allowed size"):
            _ffmpeg_decode(fake_audio)

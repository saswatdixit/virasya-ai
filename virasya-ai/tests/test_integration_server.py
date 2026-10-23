"""Tests for the integrated Virasya Preservation Studio backend endpoints."""
import json
import threading
import time
import urllib.request
import urllib.parse
from http import HTTPStatus
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from virasya_ai.transcription.base import TranscriptResult
from virasya_ai.transcription.story_storage import (
    get_story,
    list_stories,
    save_story,
    save_vocabulary_terms,
    get_all_vocabulary,
)
from virasya_ai.web.server import create_server




def http_get(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def http_post_json(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(body)
        except json.JSONDecodeError:
            return exc.code, {"error": body}


def test_health_endpoint(live_server):
    status, data = http_get(f"{live_server}/api/health")
    assert status == HTTPStatus.OK
    assert data["status"] == "healthy"
    assert "models" in data
    assert "gnani" in data["models"]
    assert "vaani" in data["models"]


def test_model_status_endpoint(live_server):
    status, data = http_get(f"{live_server}/api/models/status")
    assert status == HTTPStatus.OK
    assert "vaani" in data
    assert data["busy"] is False


def test_story_lifecycle_and_explore_privacy(live_server, tmp_path):
    story_id = f"test_story_{int(time.time() * 1000)}"

    # 1. Save draft story
    draft_payload = {
        "id": story_id,
        "title": "Old Mango Tree Memory",
        "carrier": "Grandmother",
        "category": "Family memory",
        "place": "Sambalpur",
        "language": "Odia",
        "story": "We had a mango tree in our backyard.",
        "status": "draft",
    }
    status, res = http_post_json(f"{live_server}/api/stories", draft_payload)
    assert status == HTTPStatus.OK
    assert res["status"] == "success"
    assert res["story"]["id"] == story_id

    # 2. Verify draft does NOT appear in Explore feed
    status, feed = http_get(f"{live_server}/api/explore")
    assert status == HTTPStatus.OK
    feed_ids = [s["id"] for s in feed["stories"]]
    assert story_id not in feed_ids

    # 3. Preserve as private story
    preserve_private = {
        "visibility": "private",
        "confirmed": True,
        "permissionConfirmed": True,
        "final_text": "We had a mango tree in our backyard. It bore fruit every summer.",
    }
    status, pres_res = http_post_json(f"{live_server}/api/stories/{story_id}/preserve", preserve_private)
    assert status == HTTPStatus.OK
    assert pres_res["story"]["status"] == "preserved"

    # Verify private story does NOT appear in Explore feed
    status, feed2 = http_get(f"{live_server}/api/explore")
    feed_ids2 = [s["id"] for s in feed2["stories"]]
    assert story_id not in feed_ids2

    # 4. Update visibility to public
    preserve_public = {
        "visibility": "public",
        "confirmed": True,
        "permissionConfirmed": True,
        "final_text": "We had a mango tree in our backyard. It bore fruit every summer.",
        "vocabulary": [
            {"preferred": "ଆମ୍ବ", "meaning": "Mango", "language": "Odia"}
        ],
    }
    status, pres_pub_res = http_post_json(f"{live_server}/api/stories/{story_id}/preserve", preserve_public)
    assert status == HTTPStatus.OK
    assert pres_pub_res["story"]["finalSettings"]["visibility"] == "public"

    # Verify public preserved story NOW appears in Explore feed
    status, feed3 = http_get(f"{live_server}/api/explore")
    assert status == HTTPStatus.OK
    feed_ids3 = [s["id"] for s in feed3["stories"]]
    assert story_id in feed_ids3

    # Explore filter by category
    status, feed_cat = http_get(f"{live_server}/api/explore?category=Family+memory")
    assert any(s["id"] == story_id for s in feed_cat["stories"])

    status, feed_wrong_cat = http_get(f"{live_server}/api/explore?category=NonExistent")
    assert not any(s["id"] == story_id for s in feed_wrong_cat["stories"])


def test_vocabulary_endpoints(live_server):
    words = [
        {"preferred": "ବଉଳ", "meaning": "Mango blossoms", "language": "Odia"},
        {"preferred": "ଖଜୁରି", "meaning": "Dates", "language": "Odia"},
    ]
    status, res = http_post_json(f"{live_server}/api/vocabulary", {"words": words})
    assert status == HTTPStatus.OK
    assert res["status"] == "success"
    assert res["count"] >= 2

    status, list_res = http_get(f"{live_server}/api/vocabulary")
    assert status == HTTPStatus.OK
    terms = [item.get("preferred") for item in list_res]
    assert "ବଉଳ" in terms


def test_punctuation_endpoint(live_server):
    status, res = http_post_json(
        f"{live_server}/api/punctuate",
        {"text": "ଏହା ଏକ ପରୀକ୍ଷା"}
    )
    assert status == HTTPStatus.OK
    assert res["status"] == "success"
    assert res["punctuated_text"] == "ଏହା ଏକ ପରୀକ୍ଷା"


def test_transcription_endpoint_with_mock_gnani(live_server, synthetic_wav):
    # Ensure audio file is in data/input
    from virasya_ai.web.server import INPUT_AUDIO_DIR
    dest = INPUT_AUDIO_DIR / synthetic_wav.name
    dest.write_bytes(synthetic_wav.read_bytes())

    mock_result = TranscriptResult(
        text="ନମସ୍କାର ଭାରତ",
        language="hi",
        provider="gnani-prisma-v2.5"
    )

    with patch("virasya_ai.web.server.GnaniTranscriptionService") as MockService:
        instance = MockService.return_value.__enter__.return_value
        instance.transcribe.return_value = mock_result

        status, res = http_post_json(
            f"{live_server}/api/transcribe",
            {"filename": synthetic_wav.name, "language_code": "hi-IN"}
        )

        assert status == HTTPStatus.OK
        assert res["status"] == "success"
        assert res["filename"] == synthetic_wav.name
        assert res["vaani"] == "ନମସ୍କାର ଭାରତ"
        assert res["results"]["vaani"]["status"] == "done"
        assert res["results"]["vaani"]["text"] == "ନମସ୍କାର ଭାରତ"


def test_transcription_endpoint_missing_api_key_returns_503(live_server, synthetic_wav, monkeypatch):
    """Verify that a missing GNANI_API_KEY returns a clear 503 SERVICE_UNAVAILABLE without leaking secrets."""
    from virasya_ai.web.server import INPUT_AUDIO_DIR
    dest = INPUT_AUDIO_DIR / synthetic_wav.name
    dest.write_bytes(synthetic_wav.read_bytes())

    monkeypatch.delenv("GNANI_API_KEY", raising=False)
    status, res = http_post_json(
        f"{live_server}/api/transcribe",
        {"filename": synthetic_wav.name, "language_code": "hi-IN"}
    )
    assert status == HTTPStatus.SERVICE_UNAVAILABLE
    assert res["code"] == "missing_api_key"
    assert "GNANI_API_KEY is not set" in res["error"]


def test_transcription_endpoint_rejects_unsupported_language(live_server, synthetic_wav, monkeypatch):
    """Verify that an unsupported or unconfigured language code returns 422 UNPROCESSABLE_ENTITY."""
    from virasya_ai.web.server import INPUT_AUDIO_DIR
    dest = INPUT_AUDIO_DIR / synthetic_wav.name
    dest.write_bytes(synthetic_wav.read_bytes())

    monkeypatch.setenv("GNANI_API_KEY", "mock-placeholder-key")
    status, res = http_post_json(
        f"{live_server}/api/transcribe",
        {"filename": synthetic_wav.name, "language_code": "unsupported-lang"}
    )
    assert status == HTTPStatus.UNPROCESSABLE_ENTITY
    assert res["code"] == "unsupported_language"


def test_transcription_endpoint_rejects_missing_audio_file(live_server, monkeypatch):
    """Verify that requesting transcription for a non-existent file returns 400."""
    monkeypatch.setenv("GNANI_API_KEY", "mock-placeholder-key")
    status, res = http_post_json(
        f"{live_server}/api/transcribe",
        {"filename": "non_existent_audio.wav", "language_code": "hi-IN"}
    )
    assert status == HTTPStatus.BAD_REQUEST
    assert "not found" in res["error"]


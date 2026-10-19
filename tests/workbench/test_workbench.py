import json

from virasya_ai.transcription.base import ReviewTask
from virasya_ai.workbench.app import TASKS_DIR, app


def test_api_review_success(tmp_path):
    app.config["TESTING"] = True
    task_path = TASKS_DIR / "phase0_review_task.json"
    task_path.parent.mkdir(parents=True, exist_ok=True)
    with task_path.open("w", encoding="utf-8") as handle:
        json.dump(ReviewTask(source_filename="audio.wav", language="hi").to_dict(), handle)

    try:
        with app.test_client() as client:
            response = client.post(
                "/api/review",
                json={"task_path": task_path.name, "verified_text": "यह एक कहानी है।"},
            )
        assert response.status_code == 200
        saved = json.loads(task_path.read_text(encoding="utf-8"))
        assert saved["source"]["language"] == "hi"
        assert saved["verified_transcript"] == "यह एक कहानी है।"
        assert saved["review_status"] == "verified"
    finally:
        task_path.unlink(missing_ok=True)


def test_transcribe_route_reports_provider_pending(tmp_path):
    app.config["TESTING"] = True
    audio_path = TASKS_DIR.parent.parent / "input" / "phase0-empty.wav"
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    audio_path.write_bytes(b"not-a-valid-audio")
    try:
        with app.test_client() as client:
            response = client.post("/api/transcribe", json={"filename": audio_path.name})
        # Validation runs before the provider boundary for invalid audio.
        assert response.status_code == 400
    finally:
        audio_path.unlink(missing_ok=True)

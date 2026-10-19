import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename

def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent.parent

from virasya_ai.config import DEFAULT_LANGUAGE
from virasya_ai.exceptions import TranscriptionProviderError
from virasya_ai.transcription.base import ReviewTask
from virasya_ai.transcription.ingestion.audio import load_audio
from virasya_ai.transcription.service import GnaniTranscriptionService
from virasya_ai.vocabulary.store import LocalVocabularyStore
from datetime import datetime, timezone

app = Flask(__name__)

DATA_INPUT_DIR = get_project_root() / "data" / "input"
TASKS_DIR = get_project_root() / "data" / "output" / "tasks"

# Ensure dirs exist
DATA_INPUT_DIR.mkdir(parents=True, exist_ok=True)
TASKS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {'.wav', '.ogg', '.mp3', '.flac'}

def is_safe_path(base, path):
    # Security: Path traversal protection
    try:
        return Path(base).resolve() in Path(base / path).resolve().parents
    except Exception:
        return False

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/audio-files", methods=["GET"])
def list_audio_files():
    if not DATA_INPUT_DIR.exists():
        return jsonify([])
    files = [f.name for f in DATA_INPUT_DIR.iterdir() if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS]
    file_list = []
    for f in files:
        stat = (DATA_INPUT_DIR / f).stat()
        file_list.append({
            "name": f,
            "size": stat.st_size,
            "type": (DATA_INPUT_DIR / f).suffix.lower()
        })
    return jsonify(file_list)

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": "File type not supported"}), 400
        
    filename = secure_filename(file.filename)
    if not filename:
        return jsonify({"error": "Invalid filename"}), 400
        
    file_path = DATA_INPUT_DIR / filename
    file.save(file_path)
    
    return jsonify({"status": "success", "filename": filename})

@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    data = request.json
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400
        
    filename = data.get("filename")
    if not filename:
        return jsonify({"error": "No filename provided"}), 400
        
    # Security: path traversal check
    filename = secure_filename(filename)
    audio_path = DATA_INPUT_DIR / filename
    
    if not audio_path.exists():
        return jsonify({"error": "File not found"}), 404
        
    try:
        # Validate/decode before the provider boundary.  No remote request is
        # made in Phase 0, but this keeps the future route contract explicit.
        audio = load_audio(audio_path)
        result = GnaniTranscriptionService().transcribe(
            audio_path,
            metadata={
                "language": DEFAULT_LANGUAGE,
                "sample_rate": audio.sample_rate,
                "duration_seconds": audio.duration_sec,
            },
        )
        task = ReviewTask(
            source_filename=audio_path.name,
            language=DEFAULT_LANGUAGE,
            transcript=result,
            metadata={"audio_path": audio.path},
        )
        out_path = TASKS_DIR / f"{audio_path.stem}_task.json"
        task_dict = task.to_dict()
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(task_dict, f, ensure_ascii=False, indent=2)
        return jsonify({"task_path": out_path.name, "task": task_dict})
    except TranscriptionProviderError as exc:
        return jsonify({"error": str(exc), "code": "transcription_provider_unavailable"}), 503
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

@app.route("/api/review", methods=["POST"])
def review():
    data = request.json
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400
        
    task_path = data.get("task_path")
    verified_text = data.get("verified_text")
    if not task_path or not verified_text:
        return jsonify({"error": "Missing parameters"}), 400
        
    # Security: path traversal check
    task_path = secure_filename(task_path)
    file_path = TASKS_DIR / task_path
    
    if not file_path.exists():
        return jsonify({"error": "Task file not found"}), 404
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            task_dict = json.load(f)
            
        task = ReviewTask.from_dict(task_dict)
        task.verified_transcript = verified_text
        task.review["verified_at"] = datetime.now(timezone.utc).isoformat()
        task.review_status = "verified"
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(task.to_dict(), f, ensure_ascii=False, indent=2)
            
        return jsonify({"status": "success"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/vocabulary", methods=["POST"])
def vocabulary():
    data = request.json
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400
        
    task_path = data.get("task_path")
    words = data.get("words", [])
    if not task_path:
        return jsonify({"error": "Missing parameters"}), 400
        
    task_path = secure_filename(task_path)
    file_path = TASKS_DIR / task_path
    
    if not file_path.exists():
        return jsonify({"error": "Task file not found"}), 404
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            task_dict = json.load(f)
        task = ReviewTask.from_dict(task_dict)
        
        store = LocalVocabularyStore()
        for w in words:
            word = w.get("word")
            meaning = w.get("meaning", "")
            context = w.get("context", "")
            if word:
                entry = store.add_or_update_term(word, word, source_artifact=task_dict)
                if meaning or context:
                    entry.meaning = meaning
                    entry.context = context
                    store.update_entry(entry)
                    
        return jsonify({"status": "success"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/punctuate", methods=["POST"])
def punctuate():
    data = request.json
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400
        
    task_path = data.get("task_path")
    if not task_path:
        return jsonify({"error": "Missing task_path"}), 400
        
    task_path = secure_filename(task_path)
    file_path = TASKS_DIR / task_path
    
    if not file_path.exists():
        return jsonify({"error": "Task file not found"}), 404
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            task_dict = json.load(f)
        task = ReviewTask.from_dict(task_dict)
        
        from virasya_ai.punctuation.core import punctuate_task

        task_dict = task.to_dict()
        punctuated_task_dict = punctuate_task(task_dict)
        punctuated = punctuated_task_dict.get("punctuated_model_text")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(punctuated_task_dict, f, ensure_ascii=False, indent=2)
            
        return jsonify({"status": "success", "punctuated_text": punctuated})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/save_final", methods=["POST"])
def save_final():
    data = request.json
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400
        
    task_path = data.get("task_path")
    final_text = data.get("punctuated_final_text")
    if not task_path or final_text is None:
        return jsonify({"error": "Missing parameters"}), 400
        
    task_path = secure_filename(task_path)
    file_path = TASKS_DIR / task_path
    
    if not file_path.exists():
        return jsonify({"error": "Task file not found"}), 404
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            task_dict = json.load(f)
        
        task = ReviewTask.from_dict(task_dict)
        
        task.punctuated_final_text = final_text
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(task.to_dict(), f, ensure_ascii=False, indent=2)
            
        return jsonify({"status": "success"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.after_request
def add_header(r):
    r.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    r.headers['Pragma'] = 'no-cache'
    r.headers['Expires'] = '0'
    return r

if __name__ == '__main__':
    app.run(debug=True, port=5000)

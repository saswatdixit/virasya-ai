# Virasya AI

Virasya AI is a Hindi-first transcription review workbench. Phase 0 focuses on
reproducible audio ingestion, human review, vocabulary storage, and the Flask
workbench shell while the documented provider integration is prepared.

## Phase 0 scope and status

- Python 3.11 is the pinned runtime (`.python-version`).
- The core environment contains the audio, Flask, vocabulary, and test
  dependencies from `requirements.lock`.
- The obsolete local ASR packages `onnx-asr` and `onnxruntime` are intentionally
  excluded from the reproducibility setup.
- Punctuation support is optional for the core test command. Its separately
  locked tokenizer dependencies are in `requirements-punctuation.lock`; install
  that optional lock when running the Flask workbench locally. Actual punctuation
  model inference additionally requires a compatible PyTorch install and model
  weights, which are outside the core offline test environment.
- **Gnani.ai API integration is intentionally pending.** No endpoint, payload,
  authentication flow, or model identifier is defined by this project yet.

## Requirements

For a local Linux setup, install Python 3.11, `make`, and `ffmpeg`. Docker users
only need Docker; the `Dockerfile` installs `ffmpeg` in the image.

## Setup

From the repository root:

```bash
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install --requirement requirements.lock
```

The core setup is reproducible from the checked-in lock. It does not contact a
model service and does not install the obsolete local ASR packages. To run the
Flask workbench locally, install its optional punctuation dependencies as well:

```bash
python -m pip install --requirement requirements-punctuation.lock
```

For an offline install from a local wheel directory, use the same locks with a
wheel cache, for example:

```bash
python -m pip install --no-index --find-links /path/to/wheels \
  --requirement requirements.lock
```

To prepare the backend credential for a later integration phase, copy
`.env.example` to `.env` and set `GNANI_API_KEY` locally. Never put that value
in frontend code, task JSON, or a committed file. Phase 0 does not read the key
for a provider request yet.

## Run the Flask workbench

After the setup above (including the optional punctuation lock), run:

```bash
. .venv/bin/activate
PYTHONPATH=src python -m flask --app virasya_ai.workbench.app:app run \
  --host 127.0.0.1 --port 5000
```

Open <http://127.0.0.1:5000>. Uploads and generated review tasks are kept under
`data/`; those local artifacts are ignored by Git where configured.

The command-line entry point is also available for local, non-networked flows:

```bash
PYTHONPATH=src python run.py vocabulary list
```

Transcription requires a provider implementation and model availability; this
Phase 0 cleanup does not add an ASR service or invent a Gnani.ai API contract.

## Test

The single supported test command is:

```bash
make test
```

`make test` uses `.venv/bin/python` and runs the offline tests for audio
ingestion, review, vocabulary, CLI behavior, the provider boundary, and Flask
route behavior. It does not load punctuation model weights; no network, model
download, or API credentials are needed.

## Docker build and run

Build the reproducible workbench image:

```bash
docker build -t virasya-ai-workbench .
```

Run it on port 5000:

```bash
docker run --rm -p 5000:5000 virasya-ai-workbench
```

The image uses Python 3.11, installs `ffmpeg`, installs the checked-in core and
optional tokenizer locks into an image-local virtual environment, and starts the
Flask workbench on `0.0.0.0:5000`. Actual punctuation model inference still
requires a compatible PyTorch install and model weights.

## Deploy

Deployment is intentionally container-based for this Phase 0 layer: build the
image with `docker build`, push it to the registry used by your deployment
platform, and run the image with port `5000` exposed. The target platform,
registry, credentials, health checks, and any Gnani.ai API contract are not
specified here, so no provider-specific deployment command is invented.

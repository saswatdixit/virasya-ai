# Virasya AI — Multilingual Speech-to-Text

Virasya AI is a Python-based transcription tool and local review workspace built around Gnani.ai’s Prisma speech-to-text REST API. It lets users submit short audio clips for transcription, inspect the original AI-generated text, manually correct the transcript, and save the raw and reviewed versions locally.

The project focuses on a simple, transparent transcription workflow with explicit API usage, secure credential handling, and human review.

## Features

- **Speech-to-text:** Transcribe audio using the configured Gnani Prisma REST API.
- **CLI:** Run transcription from the terminal and optionally save the output to a UTF-8 text file.
- **Local transcription workspace:** Upload audio, select a language, review the raw transcript, edit a separate reviewed version, and save the result.
- **Human-in-the-loop review:** Keep the original transcript separate from manual corrections.
- **Local JSON storage:** Save transcript text and metadata on your machine.
- **Credential protection:** Read the API key from the environment or a local `.env` file; never expose it to the browser.
- **Explicit API usage:** The web application sends audio for transcription only after the user clicks **Transcribe audio**.
- **Offline tests:** Test the application with mocked provider responses without making live transcription requests.

## Provider integration

The current implementation uses the documented Gnani Prisma STT REST interface.

| Setting | Value |
|---|---|
| Endpoint | `https://api.vachana.ai/stt/v3` |
| HTTP method | `POST` |
| Authentication header | `X-API-Key-ID` |
| Audio field | `audio_file` |
| Language field | `language_code` |
| Output format | `verbatim` |
| Request timeout | 30 seconds by default |
| Maximum audio duration | 60 seconds |

The timeout can be configured using `GNANI_TIMEOUT_SECONDS`, with supported values from 1 to 300 seconds.

**Provider scope:** This repository does not claim compatibility with OmniRush Astra. Astra-specific endpoint, authentication, model, and response details must be verified from its official documentation before implementing that integration.

## Language support

The application exposes the following language codes:

| Language | Code |
|---|---|
| Hindi | `hi-IN` |
| Bengali | `bn-IN` |
| Gujarati | `gu-IN` |
| Kannada | `kn-IN` |
| Malayalam | `ml-IN` |
| Marathi | `mr-IN` |
| Punjabi | `pa-IN` |
| Tamil | `ta-IN` |
| English (India) | `en-IN` |
| Telugu | `te-IN` |

The selected language code is passed to the provider. Actual transcription availability depends on Gnani's current service support and the permissions associated with your API account. A language appearing in the selector does not guarantee that every account can use it.

Unsupported languages are reported as errors; the application does not silently switch to Hindi or substitute a local transcription model.

## Requirements

- Python 3.11
- A valid Gnani API key with access to the configured Prisma STT service
- Internet access when making a transcription request
- `ffmpeg` when the local audio-validation backend needs it to decode an input format

Supported input formats in the current workflow are WAV, MP3, OGG, FLAC, AAC, and M4A. Audio must be no longer than 60 seconds.

The client uploads the original audio file. It does not resample or transcode the file before sending it to the provider.

## Installation

Clone the repository and enter its root directory:

```bash
git clone <your-repository-url>
cd virasya-ai
```

Create a Python 3.11 virtual environment:

**Windows PowerShell**

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install --requirement requirements.lock
```

**Linux / macOS**

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install --requirement requirements.lock
```

If you are setting up the repository in an environment that does not contain `requirements.lock`, check the dependency files tracked in the repository and follow the project's current dependency instructions.

## Configure the API key

Never hardcode your API key in Python source code, frontend JavaScript, transcript files, or Git-tracked configuration.

### Option 1: Environment variable

Windows PowerShell:

```powershell
$env:GNANI_API_KEY = Read-Host "Enter Gnani API key"
```

Linux / macOS:

```bash
export GNANI_API_KEY="your-api-key"
```

These settings apply to the current shell session.

### Option 2: Local `.env` file

Create a `.env` file in the repository root:

```text
GNANI_API_KEY=your-api-key
```

The shared configuration layer checks the process environment first and falls back to the project-root `.env` file when the environment variable is not defined. Empty `.env` values are ignored, and a `.env` value does not override an existing process variable.

The real `.env` file must remain excluded from Git. The `.env.example` file should contain only a placeholder.

## Run the command-line interface

From the repository root, with the virtual environment activated:

Print a transcript to the terminal:

```bash
python -m virasya_ai.cli path/to/audio.wav
```

Save the transcript to a file:

```bash
python -m virasya_ai.cli path/to/audio.wav --output transcript.txt
```

If the package is installed with its console entry point, the equivalent command is:

```bash
virasya path/to/audio.wav --output transcript.txt
```

The CLI prints the transcription and can save the result as UTF-8 text. A successful result requires a valid provider response.

## Run the local web workspace

From the repository root, activate the virtual environment and run:

**Windows PowerShell**

```powershell
$env:PYTHONPATH = "$PWD\src"
python -m virasya_ai.web
```

**Linux / macOS**

```bash
export PYTHONPATH=src
python -m virasya_ai.web
```

Open the application in your browser:

[http://127.0.0.1:5000](http://127.0.0.1:5000)

The server binds to localhost by default. Local configuration can use `VIRASYA_WEB_HOST` and `VIRASYA_WEB_PORT`.

### Web workflow

1. **Choose audio:** Select an audio file and transcription language.
2. **Review transcript:** Inspect the original transcription and edit a separate reviewed version.
3. **Final review and save:** Check the final text and save both transcript versions.

Moving between pages, changing the theme, and selecting an audio file do not trigger transcription. Only an explicit click on **Transcribe audio** sends a transcription request to Gnani.

The API key stays on the server and is not sent to frontend JavaScript.

## Saved transcripts

The web workspace stores saved records locally at:

```text
data/output/transcriptions.json
```

Records include the available metadata, such as:

- Unique record ID
- Audio filename
- Selected language code
- Raw transcript
- Reviewed transcript
- Creation and update timestamps

The storage layer uses UTF-8 JSON and atomic file replacement when writing the updated records. The `data/` directory is intended for local runtime data and is excluded from Git.

**Note:** Saving a transcript does not necessarily save a copy of the original audio file. Keep your audio files separately if you need to retain them.

## Error handling

The application handles common failure cases, including:

- Missing API credentials
- Invalid, empty, corrupt, or overlong audio
- Authentication and permission failures
- Unsupported language or invalid request
- Rate limiting
- Provider timeouts and connection failures
- Provider service errors
- Malformed or empty transcription responses

The client does not retry requests automatically and does not fall back to a local model. Failed provider requests are reported as failures rather than successful transcriptions.

## Testing

Run the test suite:

```bash
python -m pytest -q
```

If the repository includes a configured Makefile target, you can also use:

```bash
make test
```

Tests should use mocked provider responses and must not require a real API key or make live transcription requests. They cover the provider request contract, error handling, audio validation, CLI behavior, and web workflow and persistence.

For a syntax check:

```bash
python -m compileall -q src tests
```

## Project scope

Virasya AI currently provides a Python CLI and a local browser-based transcription workspace. It uses a hosted speech-to-text API rather than running a local ASR model.

It does not currently claim to provide:

- A production-hosted public web application
- A cloud database or multi-user authentication system
- Local/offline speech recognition
- Automatic fallback to another transcription provider
- Verified OmniRush Astra integration

## Roadmap

Potential future improvements include:

- Verifying language availability against the provider account
- Adding a separately documented Astra integration if official access details become available
- Improving transcript comparison and review tools
- Adding persistent database storage and authenticated multi-user access
- Preparing a secure production deployment

## Security

- Keep API credentials out of Git.
- Never expose provider keys in browser code.
- Do not commit private audio or generated transcripts unless they are intentionally prepared as public demo assets.
- Use mocked responses for routine development and testing.
- Make live transcription requests only when explicitly intended.

---

**Virasya AI** — A lightweight transcription and human-review workflow powered by Gnani.ai's Prisma STT API.
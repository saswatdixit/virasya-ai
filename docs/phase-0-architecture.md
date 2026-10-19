# Virasya Hindi — Phase 0 architecture

## Scope and status

Phase 0 removes the previous local Odia ASR execution path and leaves the
application ready for a documented Gnani.ai API integration. Live transcription
is **not** implemented in this phase. The `/api/transcribe` route validates the
audio and then returns an actionable `503` while the provider contract is
pending; it never falls back to a local model.

## Current flow

```text
audio upload or existing file
        |
        v
Flask workbench / CLI
        |
        v
audio ingestion and validation (decode, mono, 16 kHz float32)
        |
        v
GnaniTranscriptionService boundary (not implemented yet)
        |
        v
TranscriptResult -> ReviewTask -> human review -> vocabulary -> punctuation
```

### Preserved modules

- `transcription/ingestion/audio.py`: reusable decoding, format validation,
  resampling, duration and metadata extraction.
- `transcription/base.py`: `ReviewTask` persistence and the new provider-neutral
  `TranscriptResult` shape. Historical `asr_results` can still be read for
  existing task files, but no active code invokes the retired providers.
- `review/`, `vocabulary/`, and `punctuation/`: human review, cultural
  vocabulary, and later text cleanup workflow concepts.
- `workbench/app.py` and its existing template: upload, review, vocabulary, and
  final-text workflow. The template now has one provider transcript rather than
  two model-specific panels.

### Removed from the active architecture

- Vaani FastConformer ONNX wrapper and model identifier.
- AI4Bharat IndicConformer ONNX wrapper and model identifier.
- The dual-provider router and model-comparison transcription path.
- `onnx-asr` and `onnxruntime` dependencies.
- Tests that only exercised the removed providers or two-model review choices.
- Hard-coded Windows Hugging Face cache mutation from the punctuation module.

The old generated JSON files under `data/output/tasks/` are retained as local
historical artifacts. They are not imported as providers and their old field
names are only handled by the narrow compatibility reader in `ReviewTask`.

## Provider boundary

`transcription/service.py` is the only intended location for the future API
client. It must eventually:

1. accept a validated audio input;
2. read `GNANI_API_KEY` only on the backend;
3. use the endpoint, headers, payload, model identifier, and response schema
   from official Gnani.ai documentation;
4. enforce timeout and provider-error handling;
5. map documented fields into `TranscriptResult` without inventing confidence,
   timestamps, speaker labels, or other metadata; and
6. keep provider-specific data in `provider_metadata`.

No endpoint or request field is guessed in this repository.

## Configuration and secret handling

`.env.example` documents the backend-only `GNANI_API_KEY` placeholder. A local
`.env` is ignored by Git. The key is not read by frontend code, not written to
task JSON, and not logged. Configuration remains optional at import time so
offline tests and the workbench can start before provider credentials exist.

## Next phases

1. Verify the official Gnani.ai API contract and supported Hindi audio limits.
2. Implement and unit-test the service boundary with mocked HTTP responses.
3. Add a provider-backed `/api/transcribe` happy path and error mapping.
4. Connect the separate Virasya frontend to the single normalized transcript
   contract.
5. Add persistence/status behavior only after the provider flow is proven.

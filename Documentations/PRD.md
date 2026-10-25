# Virasya — Product Requirements Document (PRD)

**Project:** Virasya (Cultural Heritage & Oral Storytelling Preservation Platform)  
**Status:** Implemented / Production-Ready  
**Canonical Path:** [`Documentations/PRD.md`](file:///D:/Codes/gnani.ai/Documentations/PRD.md)  
**Repository:** `https://github.com/virasya/virasya-ai`

---

## 1. Vision & Problem Statement

### 1.1 The Cultural Problem
India is home to thousands of distinct oral traditions, regional dialects, and living folklore that exist only in the memories of elders, rural storytellers, and community carriers. Many of these spoken languages (such as Sambalpuri, Koshali, and regional dialects of Odia, Hindi, and Bengali) lack standardized orthography in consumer AI systems. When translated by generic commercial LLMs, authentic cultural idioms, ritual terminology, and kinship terms are frequently flattened or lost.

### 1.2 The Virasya Solution
Virasya is a sovereign cultural preservation platform. It pairs high-fidelity Indian acoustic speech-to-text (powered by Gnani.ai's Prisma STT API) with a 6-step human-in-the-loop editorial workflow. Storytellers and archivists can record authentic spoken narratives, inspect verbatim transcripts, correct dialect vocabulary, restored cultural punctuation, and permanently seal the story into an immutable cryptographic archive.

---

## 2. Target Users & Needs

1. **Family & Community Archivists:** Individuals preserving memories, ancestral folk songs, and living oral histories from grandparents and elders without technical complexity.
2. **Linguistic Researchers & Folklorists:** Scholars documenting regional dialects who require verbatim transcription, exact phonetic glossary capture, and uncorrupted provenance.
3. **Data Annotators & Cultural Preservers:** Organizations curating verified Indic speech corpora and cultural glossaries for downstream preservation models.
4. **Developers & Terminal Users:** Engineers requiring a scriptable CLI or local studio workspace for automated batch transcription and offline audio validation.

---

## 3. Implemented vs. Planned Scope

| Feature / Capability | Scope Category | Implementation Detail |
| :--- | :---: | :--- |
| **Cinematic Web Experience** | **Implemented** | React 19, Vite, Three.js 3D manuscript hero, 36-region interactive SVG India map, Tailwind CSS. |
| **6-Step Preservation Workflow** | **Implemented** | Story Metadata → Voice Recording & Transcription → Editorial Review → Cultural Vocabulary → Punctuation Review → Archival Sealing. |
| **Output Style Selection** | **Implemented** | Choice between **Verbatim** (captures pauses, hesitations, dialect tokens) and **Transcribe** (standardized grammatical text). |
| **Speech-to-Text Integration** | **Implemented** | Gnani.ai Prisma STT v3 REST API (`https://api.vachana.ai/stt/v3`) proxying 10 Indic languages (`hi-IN`, `bn-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `pa-IN`, `ta-IN`, `te-IN`, `en-IN`). |
| **Passwordless Authentication** | **Implemented** | Supabase Auth email magic links with PKCE code exchange, modal dialogue pattern, and zero-block guest preview mode. |
| **Serverless Cloud Archival** | **Implemented** | Supabase PostgreSQL schema with RLS, private audio storage (`story-recordings-private`), and 3 TypeScript Edge Functions. |
| **Preserved Story Immutability** | **Implemented** | PostgreSQL trigger `enforce_preserved_story_immutability()` permanently freezing title, narrative text, audio, and provenance once preserved. |
| **Explore Feed & PII Minimization** | **Implemented** | Dedicated `explore_stories WITH (security_barrier = true)` view stripping author emails, private user IDs, and raw storage keys. |
| **Atomic Quota Rate Limiting** | **Implemented** | Edge Function rate limiter utilizing `pg_advisory_xact_lock` to serialize concurrent requests and enforce max 10 STT calls / 10 minutes. |
| **Python CLI & Local Studio** | **Implemented** | `virasya <audio_path>` CLI (Hindi transcription via Gnani Prisma v2.5) and standard library `ThreadingHTTPServer` (`virasya-web`) at `http://127.0.0.1:5000` for offline development. |
| **Secondary Model Fallback** | **Planned** | Automatic failover to secondary Indic ASR provider (e.g. OmniRush Astra) upon Gnani API outage. |
| **Long-Form Audio Chunking** | **Planned** | Automated client-side silence-detection chunking for recordings exceeding the 60-second provider boundary. |

---

## 4. Functional Requirements

### 4.1 Audio Ingestion & Boundary Guards
* **Allowed Audio Formats:** WAV, MP3, OGG, FLAC, AAC, M4A, WebM.
* **Duration Limit:** Maximum 60.0 seconds. Client auto-stops at 60s; server decodes actual container headers/frames and rejects any file exceeding 60.0s (`AUDIO_TOO_LONG`).
* **File Size Limit:** Maximum 5 MiB (5,242,880 bytes). Enforced at frontend file picker, Supabase Storage bucket policy, Edge Functions, and Python server.

### 4.2 Transcription Execution & Style
* Outbound multipart POST to `https://api.vachana.ai/stt/v3` containing `audio_file`, `language_code`, and `format` (`verbatim` or `transcribe`).
* Protected by strict 45-second timeout in Edge Functions and 30-second timeout in Python client.
* **Strict Fail-Closed Policy:** Quota errors, timeouts, or invalid provider responses immediately abort execution without invoking paid API endpoints.

### 4.3 Provenance & Archival Sealing
* Upon final confirmation, the server assigns a permanent SHA-256 cryptographic provenance identifier (`VIR-{hash[:12]}`) and timestamp (`preserved_at`).
* Once status is set to `'preserved'`, core narrative content (`title`, `final_text`, `written_text`, `story`, `audio`, `vocabulary`) cannot be modified or demoted by standard users (`SQLSTATE 23514`).
* Storytellers retain control over public access via mutable metadata toggles: `visibility` (`'public'` or `'private'`) and `audio_public_playback` (`true` or `false`).

### 4.4 Local Transcript Persistence & Editorial Separation
* For local Python workbench workflows, transcripts are persisted atomically to `data/output/transcriptions.json`.
* Raw ASR output is strictly preserved alongside user-reviewed corrections, ensuring authentic phonetics remain uncorrupted by downstream formatting.

---

## 5. Non-Functional Requirements & Security Invariants

1. **Zero Credential Exposure:** Neither `GNANI_API_KEY` nor Supabase `service_role` keys are ever delivered to the browser bundle, public repository, or client logs.
2. **Tenant & Storage Isolation:** Authenticated users upload audio strictly to their user-scoped storage folder: `story-recordings-private/{user_id}/{filename}`.
3. **Data Minimization:** Public Explore endpoints never expose storyteller email addresses, raw uncurated transcripts, internal user UUIDs, or cloud storage paths.
4. **Offline Capability & Preview Grace:** The application functions fully in offline preview mode with pre-bundled cultural stories (Odia, Sambalpuri, Koshali) and synthetic transcripts.

---

## 6. Measurable Acceptance Criteria

* **Quality Gate:** All 17 frontend automated test suites (`npm test`) pass 100%.
* **Python Backend:** All 73 pytest tests pass 100% with zero mock regressions.
* **Frontend Build:** `tsc -b && vite build` compiles cleanly with 0 TypeScript or bundle errors.
* **Database RLS:** Cross-tenant vocabulary insertion and preserved story tampering must return non-zero SQL errors (`42501` or `23514`).
* **Zero Production Drift:** Migration files in `supabase/migrations/` maintain strict sequential integrity and security invariants.

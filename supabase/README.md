# Virasya — Supabase Database & Backend Architecture

This directory contains the canonical Supabase schema migrations, Edge Functions, and operational runbooks for the Virasya Cultural Preservation Platform.

---

## Migrations

1. **`migrations/20261017000000_virasya_core_schema.sql`**
   - Core tables: `public.profiles`, `public.stories`, `public.vocabulary`.
   - Idempotent `auth.users` profile backfill.
   - Row Level Security (RLS) policies enforcing private story/vocabulary isolation and public explore views.
   - Private audio bucket `story-recordings-private` and signed-URL access policies.
   - Core anti-tampering triggers (`protect_story_integrity`, `protect_profile_integrity`, `protect_vocabulary_integrity`).
   - Trusted backend authority detector `is_trusted_backend()`.

2. **`migrations/20261023000000_preserve_story_atomic_immutability.sql`**
   - Atomic RPC function `seal_story_preservation(...)` with `SELECT ... FOR UPDATE` row-level exclusive locking to prevent TOCTOU concurrency race conditions.
   - Immutability trigger `enforce_preserved_story_immutability()` permanently locking `provenance_id`, `provenance_hash`, `preserved_at`, and `user_id` once preserved.
   - Least-privilege function execution grants (`postgres` and `service_role` only).

3. **`migrations/20261024000000_security_audit_remediations.sql`**
   - VIR-SEC-001: Strict content immutability trigger blocking standard client modification of title, narrative text, audio, and provenance once preserved.
   - VIR-SEC-003: Public Explore feed data minimization via `public.explore_stories WITH (security_barrier = true)` excluding author emails and private storage paths.
   - VIR-SEC-004: Atomic rate limiting table `public.transcription_usage` and RPC `check_and_consume_transcription_quota` serialized by `pg_advisory_xact_lock`.
   - VIR-SEC-005: Cross-user story ownership validation in vocabulary insert/update RLS policies.

4. **`migrations/20261024010000_reconcile_audio_bucket_limit.sql`**
   - Idempotently sets `file_size_limit = 5242880` (5 MiB) on storage bucket `story-recordings-private` to align database storage bounds with Gnani STT API and Edge Function validators.

5. **`migrations/20261024020000_fix_draft_deletion_trigger.sql`**
   - Authoritative story deletion trigger: corrects `BEFORE DELETE` to `RETURN OLD` so authentic draft deletions succeed for their owner.
   - Strictly rejects standard client attempts to delete preserved stories (`SQLSTATE 42501`), enforcing the sovereign archival invariant.

> [!CAUTION]
> **`migrations/20261024050000_allow_owner_story_deletion.sql` (REJECTED / UNAPPLIED)**
> This migration was proposed during exploratory testing and attempts to permit owner deletion of preserved stories. It violates the core archival invariant that preserved cultural heritage assets cannot be deleted by standard clients. It is maintained in the repository solely for static policy audit verification by `frontend/tests/test-story-deletion-and-heritage-vault.cjs` and **must never be applied** to staging or production databases.

---

## Edge Functions

### 1. `functions/transcribe-audio/index.ts`
- Secure server-side proxy to Gnani.ai Prisma STT v3 REST API (`https://api.vachana.ai/stt/v3`).
- Authenticates caller JWT and derives storyteller identity server-side (`user_id`).
- Enforces user-scoped storage path isolation (`story-recordings-private/${user.id}/...`).
- Validates container header, size (≤ 5 MiB), and duration (≤ 60.0s) via `validateAudioBuffer`.
- Enforces atomic rate-limiting quota via database RPC `check_and_consume_transcription_quota`.
- Retrieves `GNANI_API_KEY` from server secrets; never exposes provider credentials to the client.

### 2. `functions/preserve-story/index.ts` (with `audio-validator.ts`)
- Authenticates caller JWT and verifies draft ownership.
- Validates audio duration and container headers before archival sealing.
- Computes permanent cryptographic SHA-256 provenance hash (`VIR-{hash[:12]}`).
- Executes atomic database RPC `seal_story_preservation` with `SELECT ... FOR UPDATE` row locking.
- Adheres to a strict fail-closed policy (zero unsafe un-locked fallback writes on database errors).

### 3. `functions/get-story-audio/index.ts`
- Resolves the canonical audio storage path from verified database story records.
- Issues short-lived authorized signed playback URLs (1-hour TTL) for public preserved stories or verified story owners.
- Eliminates query-string tokens from public URLs and prevents private bucket policy loosening.

---

## Staging Validation Runbook (Summary)

1. Verify target project reference: `tdpeljbmicgjgxjwsvoc` (Staging).
2. Create schema and data dumps (`npx supabase db dump --linked` and `--data-only`).
3. Apply approved migrations to staging with operator authorization (`npx supabase db push`).
4. Verify function permissions and trigger bindings.
5. Deploy Edge Functions (`transcribe-audio`, `preserve-story`, `get-story-audio`).
6. Run automated test suites to verify quota enforcement, archival immutability, and playback ticket generation.
7. Clean up disposable test records.

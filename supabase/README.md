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

---

## Edge Functions

- **`functions/preserve-story/index.ts`**
  - Authenticates user JWT and enforces story ownership.
  - Generates cryptographic SHA-256 provenance identifiers (`VIR-{hash[:12]}`).
  - Calls atomic database RPC `seal_story_preservation`.
  - Maps database exceptions:
    - `ALREADY_PRESERVED` (`P0004`) -> `HTTP 409 Conflict`.
    - `FORBIDDEN_OWNERSHIP` (`42501`) -> `HTTP 403 Forbidden`.
    - Unexpected errors -> `HTTP 500 DB_SEAL_ERROR` (strict fail-closed policy; no unsafe fallback writes).

---

## Staging Validation Runbook (Summary)

1. Verify target project reference: `tdpeljbmicgjgxjwsvoc` (Staging).
2. Create schema and data dumps (`npx supabase db dump --linked` and `--data-only`).
3. Apply pending migrations to staging with operator authorization (`npx supabase db push`).
4. Verify function permissions and trigger bindings.
5. Deploy Edge Function `preserve-story`.
6. Run 10-worker parallel burst test on a disposable test draft to verify `HTTP 200` (1 winner) and `HTTP 409` (9 conflicts).
7. Clean up disposable test records.

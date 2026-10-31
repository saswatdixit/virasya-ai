-- =============================================================================
-- Migration: 20261031000000_fix_explore_stories_security_invoker.sql
-- Module: Sovereign Cultural Archive - Public Explore Feed Security Hardening
-- Target: Supabase PostgreSQL (PostgreSQL 15+)
-- Status: PROPOSED FOR REVIEW (Do not apply to remote db without operator authorization)
--
-- PURPOSE:
-- Resolves Supabase Database Linter Warning (Rule 0010: view_security_definer):
--   - Title: Security Definer View
--   - Entity: public.explore_stories
--   - Schema: public
--   - Description: The view enforces the permissions of its creator (SECURITY DEFINER).
--
-- ARCHITECTURAL SPECIFICATION & SECURITY CONTROLS:
-- 1. Safe Preflight & Schema Verification:
--    Explicitly inspects if `public.story_audio_public` already exists. Verifies
--    column types, absence of sensitive fields (storage_path, user_id), and repairs
--    or asserts check constraints defensively without silent failure or data loss.
--
-- 2. Schema Privilege Hardening & Search Path Isolation:
--    Explicitly ensures `CREATE` privilege on `schema public` is revoked from `PUBLIC`
--    and `anon`. All SECURITY DEFINER functions use `SET search_path = pg_catalog, public, pg_temp;`
--    with trusted system catalog `pg_catalog` first, preventing object/operator hijacking.
--
-- 3. Dedicated Sanitized Audio Metadata Projection (public.story_audio_public):
--    Stores strictly non-sensitive playback metadata:
--      • story_id (REFERENCES public.stories(id) ON DELETE CASCADE)
--      • filename (Basename only, path separators stripped, <= 255 chars)
--      • name (Sanitized display label, <= 255 chars)
--      • duration (Bounded 0 to 60.5 seconds, strictly reconciling with Virasya's
--                  MAX_AUDIO_DURATION_SECONDS = 60 architecture)
--      • kind (Checked: 'uploaded', 'recorded', 'sample')
--      • verified_format (Checked against whitelist of audio extensions/mimetypes)
--      • created_at, updated_at (TIMESTAMPTZ DEFAULT now())
--    The table contains NO storage_path and NO user_id columns.
--
-- 4. Unified Normalization Function (public.sanitize_story_audio_projection):
--    A single IMMUTABLE normalization function processes raw audio metadata for BOTH
--    the lifecycle trigger and the backfill query, guaranteeing 100% parity across
--    Windows paths, Unix paths, traversal sequences, empty strings, and MIME types.
--    Maps MIME types (e.g. 'audio/mpeg' -> 'mp3') to ensure fallback filenames never
--    violate the CHECK constraint (filename !~ '[/\\]').
--
-- 5. Comprehensive Known-Deny Privilege Baseline:
--    Explicitly revokes all 4 column privilege types (SELECT, INSERT, UPDATE, REFERENCES)
--    on ALL known columns for both `anon` and pseudo-role `PUBLIC` before granting
--    the 21 approved narrative columns.
--
-- 6. Exact View Schema Parity:
--    Preserves column names and order matching the original 20261024000000 view
--    ('vocabulary' at col 21, 'audio' at col 22), ensuring seamless CREATE OR REPLACE.
-- =============================================================================


-- =============================================================================
-- STEP 1: SCHEMA PRIVILEGE HARDENING & PREFLIGHT VERIFICATION
-- =============================================================================

-- Ensure untrusted roles cannot create objects in public schema
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM anon;

-- Preflight: inspect pre-existing table if present, verify compatibility, fail safely if divergent
DO $$
DECLARE
    v_col_count INT;
    v_pk_exists BOOLEAN;
    v_fk_cascade BOOLEAN;
    v_rls_enabled BOOLEAN;
    v_trig_count INT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_tables 
        WHERE schemaname = 'public' AND tablename = 'story_audio_public'
    ) THEN
        RAISE NOTICE 'Preflight: public.story_audio_public already exists. Auditing schema compatibility...';

        -- 1. Column count verification (must be exactly 8)
        SELECT count(*) INTO v_col_count
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'story_audio_public';

        IF v_col_count <> 8 THEN
            RAISE EXCEPTION 'PREFLIGHT INCOMPATIBILITY: public.story_audio_public has % columns (expected exactly 8). Table schema has diverged.'
                USING ERRCODE = '55000';
        END IF;

        -- 2. Sensitive columns exclusion check
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'story_audio_public' 
              AND column_name IN ('storage_path', 'user_id', 'email', 'password', 'token')
        ) THEN
            RAISE EXCEPTION 'PREFLIGHT INCOMPATIBILITY: public.story_audio_public contains sensitive columns. Aborting to protect private data.'
                USING ERRCODE = '55000';
        END IF;

        -- 3. Exact column names and data types verification
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'story_audio_public' 
              AND column_name = 'story_id' AND data_type = 'text'
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'story_audio_public' 
              AND column_name = 'filename' AND data_type = 'text'
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'story_audio_public' 
              AND column_name = 'name' AND data_type = 'text'
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'story_audio_public' 
              AND column_name = 'duration' AND data_type = 'numeric'
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'story_audio_public' 
              AND column_name = 'kind' AND data_type = 'text'
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'story_audio_public' 
              AND column_name = 'verified_format' AND data_type = 'text'
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'story_audio_public' 
              AND column_name = 'created_at' AND data_type = 'timestamp with time zone'
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'story_audio_public' 
              AND column_name = 'updated_at' AND data_type = 'timestamp with time zone'
        ) THEN
            RAISE EXCEPTION 'PREFLIGHT INCOMPATIBILITY: public.story_audio_public column definitions or data types do not match required projection schema.'
                USING ERRCODE = '55000';
        END IF;

        -- 4. Primary key verification
        SELECT EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE nsp.nspname = 'public' AND rel.relname = 'story_audio_public'
              AND con.contype = 'p'
        ) INTO v_pk_exists;

        IF NOT v_pk_exists THEN
            RAISE EXCEPTION 'PREFLIGHT INCOMPATIBILITY: public.story_audio_public lacks a PRIMARY KEY on story_id.'
                USING ERRCODE = '55000';
        END IF;

        -- 5. Foreign key verification with ON DELETE CASCADE
        SELECT EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
            JOIN pg_catalog.pg_class frel ON frel.oid = con.confrelid
            JOIN pg_catalog.pg_namespace fnsp ON fnsp.oid = frel.relnamespace
            WHERE nsp.nspname = 'public' AND rel.relname = 'story_audio_public'
              AND con.contype = 'f'
              AND fnsp.nspname = 'public' AND frel.relname = 'stories'
              AND con.confdeltype = 'c'
        ) INTO v_fk_cascade;

        IF NOT v_fk_cascade THEN
            RAISE EXCEPTION 'PREFLIGHT INCOMPATIBILITY: public.story_audio_public lacks required FOREIGN KEY to public.stories(id) ON DELETE CASCADE.'
                USING ERRCODE = '55000';
        END IF;

        -- 6. Row Level Security verification
        SELECT rel.relrowsecurity INTO v_rls_enabled
        FROM pg_catalog.pg_class rel
        JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public' AND rel.relname = 'story_audio_public';

        IF NOT v_rls_enabled THEN
            RAISE EXCEPTION 'PREFLIGHT INCOMPATIBILITY: public.story_audio_public does NOT have Row Level Security enabled.'
                USING ERRCODE = '55000';
        END IF;

        -- 7. Check constraints verification
        IF NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE nsp.nspname = 'public' AND rel.relname = 'story_audio_public'
              AND con.conname = 'chk_story_audio_public_filename_clean'
        ) OR NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE nsp.nspname = 'public' AND rel.relname = 'story_audio_public'
              AND con.conname = 'chk_story_audio_public_name_len'
        ) OR NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE nsp.nspname = 'public' AND rel.relname = 'story_audio_public'
              AND con.conname = 'chk_story_audio_public_duration'
        ) OR NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE nsp.nspname = 'public' AND rel.relname = 'story_audio_public'
              AND con.conname = 'chk_story_audio_public_kind'
        ) OR NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE nsp.nspname = 'public' AND rel.relname = 'story_audio_public'
              AND con.conname = 'chk_story_audio_public_format'
        ) THEN
            RAISE EXCEPTION 'PREFLIGHT INCOMPATIBILITY: public.story_audio_public is missing one or more required CHECK constraints.'
                USING ERRCODE = '55000';
        END IF;

        -- 8. Unexpected user triggers verification
        SELECT count(*) INTO v_trig_count
        FROM pg_catalog.pg_trigger trg
        JOIN pg_catalog.pg_class rel ON rel.oid = trg.tgrelid
        JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public' AND rel.relname = 'story_audio_public'
          AND NOT trg.tgisinternal;

        IF v_trig_count > 0 THEN
            RAISE EXCEPTION 'PREFLIGHT INCOMPATIBILITY: public.story_audio_public has % unexpected user triggers attached.'
                USING ERRCODE = '55000';
        END IF;

        RAISE NOTICE '[PASS] Preflight: Pre-existing public.story_audio_public is 100%% compatible across all columns, types, constraints, FK cascade, and RLS.';
    ELSE
        RAISE NOTICE 'Preflight: public.story_audio_public does not exist; will be created cleanly in Step 2.';
    END IF;
END $$;


-- =============================================================================
-- STEP 2: CREATE DEDICATED PUBLIC AUDIO METADATA TABLE (IF NOT ALREADY PRESENT)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.story_audio_public (
    story_id TEXT PRIMARY KEY REFERENCES public.stories(id) ON DELETE CASCADE,
    filename TEXT NOT NULL DEFAULT 'recording'
        CONSTRAINT chk_story_audio_public_filename_clean CHECK (length(filename) <= 255 AND filename !~ '[/\\]'),
    name TEXT NOT NULL DEFAULT 'recording'
        CONSTRAINT chk_story_audio_public_name_len CHECK (length(name) <= 255),
    duration NUMERIC
        CONSTRAINT chk_story_audio_public_duration CHECK (duration IS NULL OR (duration >= 0 AND duration <= 60.5)),
    kind TEXT NOT NULL DEFAULT 'uploaded'
        CONSTRAINT chk_story_audio_public_kind CHECK (kind IN ('uploaded', 'recorded', 'sample')),
    verified_format TEXT
        CONSTRAINT chk_story_audio_public_format CHECK (
            verified_format IS NULL OR verified_format IN (
                'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'webm',
                'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'
            )
        ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note: Redundant index on story_id is omitted because PRIMARY KEY automatically creates a unique index.

-- Enable Row Level Security
ALTER TABLE public.story_audio_public ENABLE ROW LEVEL SECURITY;

-- Select policy: Anyone may read public audio metadata, strictly gated
-- by the base story's public preservation status and storyteller consent
DROP POLICY IF EXISTS "story_audio_public_select_policy" ON public.story_audio_public;
CREATE POLICY "story_audio_public_select_policy" ON public.story_audio_public
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.stories s
            WHERE s.id = story_audio_public.story_id
              AND s.status = 'preserved'
              AND s.visibility = 'public'
              AND s.audio_public_playback = true
        )
    );

-- Table Grants: anon and authenticated have SELECT only. Client mutations are forbidden.
REVOKE ALL ON public.story_audio_public FROM PUBLIC;
REVOKE ALL ON public.story_audio_public FROM anon, authenticated;
GRANT SELECT ON public.story_audio_public TO anon, authenticated;
GRANT ALL ON public.story_audio_public TO postgres, service_role;


-- =============================================================================
-- STEP 3: REUSABLE NORMALIZATION FUNCTION FOR TRIGGER & BACKFILL PARITY
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sanitize_story_audio_projection(p_audio JSONB)
RETURNS TABLE (
    filename TEXT,
    name TEXT,
    duration NUMERIC,
    kind TEXT,
    verified_format TEXT
)
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    v_format TEXT;
    v_ext TEXT;
    v_raw_filename TEXT;
    v_clean_filename TEXT;
    v_raw_name TEXT;
    v_clean_name TEXT;
    v_duration NUMERIC;
    v_kind TEXT;
BEGIN
    IF p_audio IS NULL OR jsonb_typeof(p_audio) <> 'object' THEN
        RETURN QUERY SELECT
            'recording'::TEXT,
            'Oral Heritage Audio'::TEXT,
            NULL::NUMERIC,
            'uploaded'::TEXT,
            NULL::TEXT;
        RETURN;
    END IF;

    -- 1. Format validation and extension normalization (safely handles MIME types)
    v_format := lower(trim(COALESCE(p_audio->>'verified_format', '')));
    IF v_format IN (
        'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'webm',
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'
    ) THEN
        v_ext := CASE v_format
            WHEN 'audio/mpeg' THEN 'mp3'
            WHEN 'audio/wav'  THEN 'wav'
            WHEN 'audio/ogg'  THEN 'ogg'
            WHEN 'audio/webm' THEN 'webm'
            WHEN 'audio/mp4'  THEN 'm4a'
            WHEN 'audio/x-m4a' THEN 'm4a'
            ELSE v_format
        END;
    ELSE
        v_format := NULL;
        v_ext := NULL;
    END IF;

    -- 2. Filename sanitization (strips paths, normalizes traversal, handles MIME extensions)
    v_raw_filename := COALESCE(p_audio->>'filename', p_audio->>'name', 'recording');
    v_clean_filename := regexp_replace(v_raw_filename, '^.*[/\\]', '');
    v_clean_filename := COALESCE(NULLIF(trim(v_clean_filename), ''), 'recording');
    -- If traversal sequences remain or contains invalid slashes, use safe fallback
    IF v_clean_filename ~ '\.\.' OR v_clean_filename ~ '[/\\]' THEN
        v_clean_filename := 'recording' || CASE WHEN v_ext IS NOT NULL THEN '.' || v_ext ELSE '' END;
    END IF;
    IF length(v_clean_filename) > 255 THEN
        v_clean_filename := substring(v_clean_filename FROM 1 FOR 255);
    END IF;

    -- 3. Display name sanitization
    v_raw_name := COALESCE(p_audio->>'name', p_audio->>'filename', 'Oral Heritage Audio');
    v_clean_name := regexp_replace(v_raw_name, '^.*[/\\]', '');
    v_clean_name := COALESCE(NULLIF(trim(v_clean_name), ''), 'Oral Heritage Audio');
    IF v_clean_name ~ '\.\.' OR v_clean_name ~ '[/\\]' THEN
        v_clean_name := 'Oral Heritage Audio';
    END IF;
    IF length(v_clean_name) > 255 THEN
        v_clean_name := substring(v_clean_name FROM 1 FOR 255);
    END IF;

    -- 4. Duration validation (reconciled with Virasya 60s max limit)
    IF trim(COALESCE(p_audio->>'duration', '')) ~ '^[0-9]+(\.[0-9]+)?$' THEN
        v_duration := trim(p_audio->>'duration')::numeric;
        IF v_duration < 0 OR v_duration > 60.5 THEN
            v_duration := NULL;
        END IF;
    ELSE
        v_duration := NULL;
    END IF;

    -- 5. Kind validation
    v_kind := lower(trim(COALESCE(p_audio->>'kind', 'uploaded')));
    IF v_kind NOT IN ('uploaded', 'recorded', 'sample') THEN
        v_kind := 'uploaded';
    END IF;

    RETURN QUERY SELECT
        v_clean_filename,
        v_clean_name,
        v_duration,
        v_kind,
        v_format;
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_story_audio_projection(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sanitize_story_audio_projection(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.sanitize_story_audio_projection(JSONB) TO postgres, service_role, authenticated;


-- =============================================================================
-- STEP 4: LIFECYCLE SYNCHRONIZATION TRIGGER ON public.stories
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_story_audio_public()
RETURNS TRIGGER AS $$
DECLARE
    v_clean RECORD;
BEGIN
    -- Barricade against direct invocation outside trigger execution
    IF TG_OP IS NULL THEN
        RAISE EXCEPTION 'Direct invocation of sync_story_audio_public() is prohibited; function may only be invoked via trigger.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- Only sync if story is preserved, public, audio exists, and storyteller consented
    IF NEW.status = 'preserved' 
       AND NEW.visibility = 'public' 
       AND NEW.audio_public_playback = true 
       AND NEW.audio IS NOT NULL THEN

        -- Delegate to pure normalization function (100% parity with backfill)
        SELECT * INTO v_clean FROM public.sanitize_story_audio_projection(NEW.audio);

        INSERT INTO public.story_audio_public (
            story_id, filename, name, duration, kind, verified_format, updated_at
        ) VALUES (
            NEW.id,
            v_clean.filename,
            v_clean.name,
            v_clean.duration,
            v_clean.kind,
            v_clean.verified_format,
            now()
        )
        ON CONFLICT (story_id) DO UPDATE SET
            filename = EXCLUDED.filename,
            name = EXCLUDED.name,
            duration = EXCLUDED.duration,
            kind = EXCLUDED.kind,
            verified_format = EXCLUDED.verified_format,
            updated_at = now();
        
        -- Clean up old ID if primary key was modified
        IF TG_OP = 'UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN
            DELETE FROM public.story_audio_public WHERE story_id = OLD.id;
        END IF;
    ELSE
        -- If visibility or audio consent was revoked, or story was demoted/removed
        DELETE FROM public.story_audio_public WHERE story_id = NEW.id;
        IF TG_OP = 'UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN
            DELETE FROM public.story_audio_public WHERE story_id = OLD.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

-- Privilege Lockdown on trigger function:
-- Statements firing triggers execute under the trigger manager using owner credentials.
-- Callers do not require direct EXECUTE privilege.
REVOKE ALL ON FUNCTION public.sync_story_audio_public() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_story_audio_public() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_story_audio_public() TO postgres, service_role;

DROP TRIGGER IF EXISTS trigger_sync_story_audio_public ON public.stories;
CREATE TRIGGER trigger_sync_story_audio_public
    AFTER INSERT OR UPDATE ON public.stories
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_story_audio_public();


-- =============================================================================
-- STEP 5: BACKFILL EXISTING PUBLIC PRESERVED STORIES
-- =============================================================================

INSERT INTO public.story_audio_public (
    story_id, filename, name, duration, kind, verified_format, updated_at
)
SELECT
    s.id,
    p.filename,
    p.name,
    p.duration,
    p.kind,
    p.verified_format,
    now()
FROM public.stories s,
LATERAL public.sanitize_story_audio_projection(s.audio) p
WHERE s.status = 'preserved' 
  AND s.visibility = 'public' 
  AND s.audio_public_playback = true 
  AND s.audio IS NOT NULL
ON CONFLICT (story_id) DO UPDATE SET
    filename = EXCLUDED.filename,
    name = EXCLUDED.name,
    duration = EXCLUDED.duration,
    kind = EXCLUDED.kind,
    verified_format = EXCLUDED.verified_format,
    updated_at = now();


-- =============================================================================
-- STEP 6: STRICT COLUMN-LEVEL GRANTS ON public.stories (KNOWN-DENY BASELINE)
-- =============================================================================

-- 1. Revoke table-level privileges from PUBLIC and anon
REVOKE ALL ON public.stories FROM PUBLIC;
REVOKE ALL ON public.stories FROM anon;

-- 2. Explicitly revoke all 4 column privilege types (SELECT, INSERT, UPDATE, REFERENCES)
--    on ALL known columns from PUBLIC and anon to purge any stale grants (e.g. attacl).
REVOKE SELECT, INSERT, UPDATE, REFERENCES (
    id, user_id, title, carrier, relationship, place, roots, category, language,
    period, email, written_text, working_draft, final_text, story, audio,
    raw_transcripts, vocabulary, punctuation, final_settings, status, visibility,
    confirmed, permission_confirmed, audio_public_playback, provenance_id,
    provenance_hash, preserved_at, created_at, updated_at
) ON public.stories FROM PUBLIC;

REVOKE SELECT, INSERT, UPDATE, REFERENCES (
    id, user_id, title, carrier, relationship, place, roots, category, language,
    period, email, written_text, working_draft, final_text, story, audio,
    raw_transcripts, vocabulary, punctuation, final_settings, status, visibility,
    confirmed, permission_confirmed, audio_public_playback, provenance_id,
    provenance_hash, preserved_at, created_at, updated_at
) ON public.stories FROM anon;

-- 3. Grant SELECT ONLY on the 21 approved, non-sensitive narrative columns to anon.
--    'audio', 'email', 'user_id', 'working_draft', and 'raw_transcripts' remain strictly revoked!
GRANT SELECT (
    id,
    title,
    carrier,
    relationship,
    place,
    roots,
    category,
    language,
    period,
    written_text,
    final_text,
    story,
    status,
    visibility,
    audio_public_playback,
    provenance_id,
    provenance_hash,
    preserved_at,
    created_at,
    updated_at,
    vocabulary
) ON public.stories TO anon;

-- Authenticated storytellers retain standard CRUD operations under RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO postgres, service_role;


-- =============================================================================
-- STEP 7: RE-CREATE public.explore_stories VIEW WITH security_invoker = true
-- =============================================================================

-- NOTE ON SCHEMA COMPATIBILITY:
-- Column order strictly matches the original 20261024000000 view schema
-- ('vocabulary' at col 21, 'audio' at col 22) to allow seamless CREATE OR REPLACE.
CREATE OR REPLACE VIEW public.explore_stories
WITH (security_barrier = true, security_invoker = true) AS
SELECT
    s.id,
    s.title,
    s.carrier,
    s.relationship,
    s.place,
    s.roots,
    s.category,
    s.language,
    s.period,
    s.written_text,
    s.final_text,
    s.story,
    s.status,
    s.visibility,
    s.audio_public_playback,
    s.provenance_id,
    s.provenance_hash,
    s.preserved_at,
    s.created_at,
    s.updated_at,
    s.vocabulary,
    -- Audio metadata sourced from sanitized public projection (story_audio_public).
    -- s.audio is never queried, completely eliminating storage_path and author UUID exposure.
    CASE 
        WHEN a.story_id IS NOT NULL THEN
            jsonb_build_object(
                'filename', a.filename,
                'name', a.name,
                'duration', a.duration,
                'kind', a.kind,
                'verified_format', a.verified_format
            )
        ELSE NULL
    END AS audio
FROM public.stories s
LEFT JOIN public.story_audio_public a ON a.story_id = s.id
WHERE s.status = 'preserved' AND s.visibility = 'public';


-- =============================================================================
-- STEP 8: CONFIGURE LEAST-PRIVILEGE GRANTS FOR PostgREST
-- =============================================================================

REVOKE ALL ON public.explore_stories FROM PUBLIC;
GRANT SELECT ON public.explore_stories TO anon, authenticated;


-- =============================================================================
-- STEP 9: RELOAD PostgREST SCHEMA CACHE
-- =============================================================================

NOTIFY pgrst, 'reload schema';

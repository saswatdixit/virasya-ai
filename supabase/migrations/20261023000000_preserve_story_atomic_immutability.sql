-- =============================================================================
-- Virasya Cultural Preservation Platform - Atomic Story Preservation & Immutability
-- Migration: 20261023000000_preserve_story_atomic_immutability.sql
-- Purpose:
--   1. Provide an atomic, row-locking RPC function (seal_story_preservation)
--      that eliminates TOCTOU race conditions between concurrent preservation requests.
--   2. Enforce strict database-level immutability on preserved cultural stories
--      so that provenance identifiers cannot be overwritten even by privileged roles.
-- =============================================================================

-- 1. DATABASE TRIGGER: ENFORCE STRICT IMMUTABILITY ON PRESERVED STORIES
-- Ensures that once a story is cryptographically sealed (status = 'preserved' or provenance_id IS NOT NULL),
-- its provenance ID, provenance hash, preservation timestamp, and author ownership are PERMANENTLY immutable.
CREATE OR REPLACE FUNCTION public.enforce_preserved_story_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Only evaluate when the existing row is already preserved or has provenance assigned
    IF OLD.status = 'preserved' OR OLD.provenance_id IS NOT NULL THEN
        IF TG_OP = 'DELETE' THEN
            IF NOT public.is_trusted_backend() THEN
                RAISE EXCEPTION 'Preserved stories are archived cultural assets and cannot be deleted by standard clients.'
                    USING ERRCODE = '42501';
            END IF;
            RETURN OLD;
        END IF;

        IF TG_OP = 'UPDATE' THEN
            -- A. Preserved stories can NEVER be demoted back to draft
            IF NEW.status IS DISTINCT FROM 'preserved' THEN
                RAISE EXCEPTION 'Preserved stories cannot be demoted to draft status.'
                    USING ERRCODE = '23514';
            END IF;

            -- B. Cryptographic provenance identifiers are PERMANENTLY immutable
            IF OLD.provenance_id IS NOT NULL AND NEW.provenance_id IS DISTINCT FROM OLD.provenance_id THEN
                RAISE EXCEPTION 'Cryptographic provenance ID is immutable once assigned.'
                    USING ERRCODE = '23514';
            END IF;

            IF OLD.provenance_hash IS NOT NULL AND NEW.provenance_hash IS DISTINCT FROM OLD.provenance_hash THEN
                RAISE EXCEPTION 'Cryptographic provenance hash is immutable once assigned.'
                    USING ERRCODE = '23514';
            END IF;

            IF OLD.preserved_at IS NOT NULL AND NEW.preserved_at IS DISTINCT FROM OLD.preserved_at THEN
                RAISE EXCEPTION 'Preservation timestamp is immutable once assigned.'
                    USING ERRCODE = '23514';
            END IF;

            -- C. Story author ownership cannot be reassigned once preserved
            IF OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
                RAISE EXCEPTION 'Story author ownership cannot be modified once preserved.'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_enforce_preserved_story_immutability ON public.stories;
CREATE TRIGGER trigger_enforce_preserved_story_immutability
    BEFORE UPDATE OR DELETE ON public.stories
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_preserved_story_immutability();


-- 2. ATOMIC RPC FUNCTION: SEAL STORY PRESERVATION WITH EXCLUSIVE ROW LOCKING
-- Serializes concurrent preservation requests using SELECT ... FOR UPDATE.
-- Guarantees that only ONE request can transition an unpreserved story into 'preserved'.
-- Subsequent or concurrent requests for an already preserved story return a deterministic ALREADY_PRESERVED error.
CREATE OR REPLACE FUNCTION public.seal_story_preservation(
    p_story_id TEXT,
    p_user_id UUID,
    p_title TEXT DEFAULT '',
    p_carrier TEXT DEFAULT '',
    p_relationship TEXT DEFAULT '',
    p_place TEXT DEFAULT '',
    p_roots TEXT DEFAULT '',
    p_category TEXT DEFAULT '',
    p_language TEXT DEFAULT 'Odia',
    p_period TEXT DEFAULT '',
    p_email TEXT DEFAULT '',
    p_written_text TEXT DEFAULT '',
    p_working_draft TEXT DEFAULT '',
    p_final_text TEXT DEFAULT '',
    p_story TEXT DEFAULT '',
    p_audio JSONB DEFAULT NULL,
    p_raw_transcripts JSONB DEFAULT '{}'::jsonb,
    p_vocabulary JSONB DEFAULT '[]'::jsonb,
    p_punctuation JSONB DEFAULT '{}'::jsonb,
    p_final_settings JSONB DEFAULT '{}'::jsonb,
    p_visibility TEXT DEFAULT 'private',
    p_audio_public_playback BOOLEAN DEFAULT false,
    p_provenance_id TEXT DEFAULT NULL,
    p_provenance_hash TEXT DEFAULT NULL,
    p_preserved_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.stories AS $$
DECLARE
    v_existing public.stories%ROWTYPE;
    v_saved public.stories%ROWTYPE;
    v_preserved_timestamp TIMESTAMPTZ;
BEGIN
    -- Authorization Guard: only service_role or admin sessions may invoke sealing
    IF NOT public.is_trusted_backend() THEN
        RAISE EXCEPTION 'Access denied: Story preservation requires trusted preservation backend authority.'
            USING ERRCODE = '42501';
    END IF;

    -- Argument Validation
    IF p_story_id IS NULL OR btrim(p_story_id) = '' THEN
        RAISE EXCEPTION 'Story ID is required for preservation.'
            USING ERRCODE = '22023';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated user ID is required for preservation.'
            USING ERRCODE = '22023';
    END IF;

    IF p_provenance_id IS NULL OR btrim(p_provenance_id) = '' THEN
        RAISE EXCEPTION 'Cryptographic provenance ID is required for preservation.'
            USING ERRCODE = '22023';
    END IF;

    IF p_visibility NOT IN ('private', 'family', 'community', 'public') THEN
        RAISE EXCEPTION 'Invalid visibility value: %', p_visibility
            USING ERRCODE = '22023';
    END IF;

    v_preserved_timestamp := COALESCE(p_preserved_at, timezone('utc'::text, now()));

    -- Acquire an EXCLUSIVE ROW LOCK (FOR UPDATE) if the record already exists
    -- This strictly serializes concurrent requests for the same story ID
    SELECT * INTO v_existing
    FROM public.stories
    WHERE id = p_story_id
    FOR UPDATE;

    IF FOUND THEN
        -- Ownership Check: Author cannot be overwritten
        IF v_existing.user_id IS NOT NULL AND v_existing.user_id IS DISTINCT FROM p_user_id THEN
            RAISE EXCEPTION 'FORBIDDEN_OWNERSHIP: You do not have permission to modify or preserve this story.'
                USING ERRCODE = '42501';
        END IF;

        -- Status Check: Already preserved stories CANNOT be re-sealed
        IF v_existing.status = 'preserved' OR v_existing.provenance_id IS NOT NULL THEN
            RAISE EXCEPTION 'ALREADY_PRESERVED: Story % has already been permanently preserved with provenance ID %',
                p_story_id, v_existing.provenance_id
                USING ERRCODE = 'P0004';
        END IF;

        -- Transition draft to preserved
        UPDATE public.stories
        SET
            user_id = p_user_id,
            title = COALESCE(NULLIF(p_title, ''), v_existing.title),
            carrier = COALESCE(NULLIF(p_carrier, ''), v_existing.carrier),
            relationship = COALESCE(NULLIF(p_relationship, ''), v_existing.relationship),
            place = COALESCE(NULLIF(p_place, ''), v_existing.place),
            roots = COALESCE(NULLIF(p_roots, ''), v_existing.roots),
            category = COALESCE(NULLIF(p_category, ''), v_existing.category),
            language = COALESCE(NULLIF(p_language, ''), v_existing.language),
            period = COALESCE(NULLIF(p_period, ''), v_existing.period),
            email = COALESCE(NULLIF(p_email, ''), v_existing.email),
            written_text = COALESCE(NULLIF(p_written_text, ''), v_existing.written_text),
            working_draft = COALESCE(NULLIF(p_working_draft, ''), v_existing.working_draft),
            final_text = COALESCE(NULLIF(p_final_text, ''), v_existing.final_text),
            story = COALESCE(NULLIF(p_story, ''), v_existing.story),
            audio = COALESCE(p_audio, v_existing.audio),
            raw_transcripts = COALESCE(p_raw_transcripts, v_existing.raw_transcripts),
            vocabulary = COALESCE(p_vocabulary, v_existing.vocabulary),
            punctuation = COALESCE(p_punctuation, v_existing.punctuation),
            final_settings = COALESCE(p_final_settings, v_existing.final_settings),
            status = 'preserved',
            visibility = p_visibility,
            confirmed = true,
            permission_confirmed = true,
            audio_public_playback = p_audio_public_playback,
            provenance_id = p_provenance_id,
            provenance_hash = p_provenance_hash,
            preserved_at = v_preserved_timestamp,
            updated_at = v_preserved_timestamp
        WHERE id = p_story_id
        RETURNING * INTO v_saved;

        RETURN v_saved;
    ELSE
        -- Story does not exist yet. Insert atomically as preserved.
        BEGIN
            INSERT INTO public.stories (
                id, user_id, title, carrier, relationship, place, roots,
                category, language, period, email, written_text, working_draft,
                final_text, story, audio, raw_transcripts, vocabulary, punctuation,
                final_settings, status, visibility, confirmed, permission_confirmed,
                audio_public_playback, provenance_id, provenance_hash, preserved_at,
                created_at, updated_at
            ) VALUES (
                p_story_id, p_user_id, COALESCE(p_title, ''), COALESCE(p_carrier, ''),
                COALESCE(p_relationship, ''), COALESCE(p_place, ''), COALESCE(p_roots, ''),
                COALESCE(p_category, ''), COALESCE(p_language, 'Odia'), COALESCE(p_period, ''),
                COALESCE(p_email, ''), COALESCE(p_written_text, ''), COALESCE(p_working_draft, ''),
                COALESCE(p_final_text, ''), COALESCE(p_story, ''), p_audio,
                COALESCE(p_raw_transcripts, '{}'::jsonb), COALESCE(p_vocabulary, '[]'::jsonb),
                COALESCE(p_punctuation, '{}'::jsonb), COALESCE(p_final_settings, '{}'::jsonb),
                'preserved', p_visibility, true, true,
                p_audio_public_playback, p_provenance_id, p_provenance_hash,
                v_preserved_timestamp, v_preserved_timestamp, v_preserved_timestamp
            )
            RETURNING * INTO v_saved;

            RETURN v_saved;
        EXCEPTION WHEN unique_violation THEN
            -- Another concurrent request inserted this story_id during the window
            SELECT * INTO v_existing FROM public.stories WHERE id = p_story_id;
            IF v_existing.status = 'preserved' OR v_existing.provenance_id IS NOT NULL THEN
                RAISE EXCEPTION 'ALREADY_PRESERVED: Story % has already been permanently preserved with provenance ID %',
                    p_story_id, v_existing.provenance_id
                    USING ERRCODE = 'P0004';
            ELSE
                RAISE EXCEPTION 'CONCURRENT_INSERT_CONFLICT: Story % was inserted concurrently by another worker', p_story_id
                    USING ERRCODE = 'P0004';
            END IF;
        END;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp;

-- Privilege Lockdown: ONLY postgres and service_role can execute sealing RPC
REVOKE ALL ON FUNCTION public.seal_story_preservation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seal_story_preservation FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seal_story_preservation TO postgres, service_role;

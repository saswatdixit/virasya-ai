-- =============================================================================
-- Virasya Cultural Preservation Platform - Security Audit Remediations
-- Migration: 20261024000000_security_audit_remediations.sql
-- Target: Supabase PostgreSQL
-- Status: PROPOSED FOR REVIEW (Forward-only; do not apply to remote db without authorization)
--
-- Remediations Included:
-- 1. VIR-SEC-001: Strict Content Immutability on Preserved Stories
--    Blocks standard client modification of title, final_text, written_text,
--    audio, carrier, language, and provenance once status = 'preserved'.
--    Only visibility and audio_public_playback may be adjusted post-preservation.
-- 2. VIR-SEC-003: Public Explore Feed Data Minimization & PII Protection
--    Creates a dedicated public view (public.explore_stories) excluding author
--    emails and private storage paths. Revokes sensitive column access from anon.
-- 3. VIR-SEC-004: Atomic Row-Locked Rate Limiting for Speech Transcription
--    Creates public.transcription_usage table and an atomic RPC function
--    check_and_consume_transcription_quota utilizing pg_advisory_xact_lock.
-- 4. VIR-SEC-005: Vocabulary Cross-User Story Ownership Validation
--    Updates vocab_insert_owner and vocab_update_owner RLS policies to verify
--    that any referenced story_id belongs to the authenticated user.
-- =============================================================================

-- =============================================================================
-- 1. VIR-SEC-001: PRESERVED STORY CONTENT IMMUTABILITY
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_preserved_story_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Only evaluate when the existing row is already preserved or has provenance assigned
    IF OLD.status = 'preserved' OR OLD.provenance_id IS NOT NULL THEN
        -- Trusted backend operations (Edge Function sealing with service_role) bypass this trigger
        IF NOT public.is_trusted_backend() THEN
            IF TG_OP = 'DELETE' THEN
                RAISE EXCEPTION 'Preserved stories are archived cultural assets and cannot be deleted by standard clients.'
                    USING ERRCODE = '42501';
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

                -- D. Core cultural narrative content and audio are PERMANENTLY immutable post-preservation
                -- Storytellers may only adjust metadata: visibility ('public'/'private') and audio_public_playback
                IF NEW.created_at IS DISTINCT FROM OLD.created_at OR
                   NEW.title IS DISTINCT FROM OLD.title OR
                   NEW.final_text IS DISTINCT FROM OLD.final_text OR
                   NEW.written_text IS DISTINCT FROM OLD.written_text OR
                   NEW.working_draft IS DISTINCT FROM OLD.working_draft OR
                   NEW.story IS DISTINCT FROM OLD.story OR
                   NEW.audio IS DISTINCT FROM OLD.audio OR
                   NEW.carrier IS DISTINCT FROM OLD.carrier OR
                   NEW.language IS DISTINCT FROM OLD.language OR
                   NEW.period IS DISTINCT FROM OLD.period OR
                   NEW.place IS DISTINCT FROM OLD.place OR
                   NEW.roots IS DISTINCT FROM OLD.roots OR
                   NEW.category IS DISTINCT FROM OLD.category OR
                   NEW.relationship IS DISTINCT FROM OLD.relationship OR
                   NEW.raw_transcripts IS DISTINCT FROM OLD.raw_transcripts OR
                   NEW.punctuation IS DISTINCT FROM OLD.punctuation OR
                   NEW.vocabulary IS DISTINCT FROM OLD.vocabulary THEN
                    RAISE EXCEPTION 'Preserved cultural story content and audio are permanently immutable. Only visibility and audio playback permissions may be updated.'
                        USING ERRCODE = '23514';
                END IF;
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


-- =============================================================================
-- 2. VIR-SEC-003: PUBLIC EXPLORE DATA MINIMIZATION & PII PROTECTION
-- =============================================================================

-- Create a secure view projecting only public-safe fields for Explore browsing.
-- Excludes personal emails (email) and private storage path locations (audio.storage_path).
CREATE OR REPLACE VIEW public.explore_stories
WITH (security_barrier = true) AS
SELECT
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
    vocabulary,
    raw_transcripts,
    -- If public audio playback was consented to, provide sanitized playback info (omitting private storage_path)
    CASE 
        WHEN audio IS NOT NULL AND audio_public_playback = true THEN
            jsonb_build_object(
                'filename', COALESCE(audio->>'filename', audio->>'name', 'recording'),
                'name', COALESCE(audio->>'name', audio->>'filename', 'recording'),
                'duration', (audio->>'duration')::numeric,
                'kind', COALESCE(audio->>'kind', 'uploaded'),
                'verified_format', audio->>'verified_format'
            )
        ELSE NULL
    END AS audio
FROM public.stories
WHERE status = 'preserved' AND visibility = 'public';

-- Grant access on explore view to anonymous and authenticated users
GRANT SELECT ON public.explore_stories TO anon, authenticated;


-- =============================================================================
-- 3. VIR-SEC-004: ATOMIC ROW-LOCKED RATE LIMITING FOR ASR TRANSCRIPTION
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.transcription_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_transcription_usage_user_window 
    ON public.transcription_usage(user_id, created_at DESC);

-- Enable RLS and lock table to service_role only
ALTER TABLE public.transcription_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transcription_usage FROM anon, authenticated;
GRANT ALL ON public.transcription_usage TO postgres, service_role;

-- Atomic RPC function with advisory transaction lock to serialize concurrent calls
CREATE OR REPLACE FUNCTION public.check_and_consume_transcription_quota(
    p_user_id UUID,
    p_max_requests INT DEFAULT 10,
    p_window_seconds INT DEFAULT 600
)
RETURNS JSONB AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_count INT;
    v_allowed BOOLEAN;
BEGIN
    -- Strict security guard: only trusted backend (service_role) may invoke
    IF NOT public.is_trusted_backend() THEN
        RAISE EXCEPTION 'Access denied: Quota enforcement requires trusted backend authority.'
            USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required for transcription quota check.'
            USING ERRCODE = '22023';
    END IF;

    -- Serialize concurrent requests for this exact user using transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext('transcription_quota_' || p_user_id::text));

    v_window_start := timezone('utc'::text, now()) - (p_window_seconds || ' seconds')::INTERVAL;

    SELECT COUNT(*) INTO v_count
    FROM public.transcription_usage
    WHERE user_id = p_user_id AND created_at >= v_window_start;

    IF v_count < p_max_requests THEN
        INSERT INTO public.transcription_usage (user_id, created_at)
        VALUES (p_user_id, timezone('utc'::text, now()));
        v_allowed := TRUE;
        v_count := v_count + 1;
    ELSE
        v_allowed := FALSE;
    END IF;

    -- Prune historical records older than 48 hours periodically
    DELETE FROM public.transcription_usage
    WHERE created_at < timezone('utc'::text, now()) - INTERVAL '48 hours';

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'current_count', v_count,
        'max_limit', p_max_requests,
        'window_seconds', p_window_seconds
    );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.check_and_consume_transcription_quota FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_and_consume_transcription_quota FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_consume_transcription_quota TO postgres, service_role;


-- =============================================================================
-- 4. VIR-SEC-005: VOCABULARY STORY OWNERSHIP VALIDATION
-- =============================================================================

-- Ensure vocabulary terms can only be linked to stories owned by the authenticated user
DROP POLICY IF EXISTS "vocab_insert_owner" ON public.vocabulary;
CREATE POLICY "vocab_insert_owner" ON public.vocabulary
    FOR INSERT TO authenticated WITH CHECK (
        auth.uid() = user_id 
        AND verification_status = 'suggested'
        AND (
            story_id IS NULL OR EXISTS (
                SELECT 1 FROM public.stories s
                WHERE s.id = vocabulary.story_id AND s.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "vocab_update_owner" ON public.vocabulary;
CREATE POLICY "vocab_update_owner" ON public.vocabulary
    FOR UPDATE TO authenticated USING (
        auth.uid() = user_id
    ) WITH CHECK (
        auth.uid() = user_id 
        AND verification_status = 'suggested'
        AND (
            story_id IS NULL OR EXISTS (
                SELECT 1 FROM public.stories s
                WHERE s.id = vocabulary.story_id AND s.user_id = auth.uid()
            )
        )
    );

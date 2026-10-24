-- =============================================================================
-- Migration: 20261024020000_fix_draft_deletion_trigger.sql
-- Description: Fix PostgreSQL BEFORE DELETE trigger suppression for ordinary drafts
--              in public.stories table.
--
-- Security & Archival Invariants:
-- 1. Preserved stories (status = 'preserved' OR provenance_id IS NOT NULL) remain
--    strictly immutable and CANNOT be deleted by standard client requests (42501).
-- 2. Ordinary story drafts (status = 'draft' AND provenance_id IS NULL) CAN be deleted
--    by their authenticated owner (via stories_delete_owner RLS policy) or database admin.
-- 3. In PostgreSQL, BEFORE DELETE triggers must RETURN OLD (or a non-null row) to allow
--    deletion. Returning NULL (or NEW, which is NULL during DELETE) silently suppresses
--    the deletion operation, causing DELETE statements to report 0 affected rows.
-- 4. Correct UPDATE behavior returning NEW is preserved.
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

    -- For DELETE operations on unpreserved drafts, return OLD to permit PostgreSQL deletion.
    -- For UPDATE operations, return NEW to permit modifications.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
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

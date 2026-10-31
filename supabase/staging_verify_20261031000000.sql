-- =============================================================================
-- Virasya Staging Verification Script: Explore Security Invoker
-- Target: Supabase Staging PostgreSQL (PostgreSQL 15+)
-- File: supabase/staging_verify_20261031000000.sql
--
-- INSTRUCTIONS FOR OPERATOR:
-- 1. Open Supabase Dashboard -> Staging Project -> SQL Editor.
-- 2. Paste this entire script into a new query window.
-- 3. Execute the script.
-- 4. Review the NOTICE messages for explicit verification passes.
-- 5. The transaction ends with ROLLBACK by default for safe dry-run inspection.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. PRE-CHECK: Confirm Migration Objects Exist
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '=== Starting Staging Verification for Explore Security Invoker ===';
    
    -- Verify table exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'story_audio_public'
    ) THEN
        RAISE EXCEPTION 'PREREQUISITE FAILED: public.story_audio_public does not exist. Please apply the migration first.';
    END IF;

    -- Verify function exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public' AND p.proname = 'sanitize_story_audio_projection'
    ) THEN
        RAISE EXCEPTION 'PREREQUISITE FAILED: public.sanitize_story_audio_projection function does not exist.';
    END IF;

    RAISE NOTICE '[PASS] Required schema objects exist.';
END $$;


-- -----------------------------------------------------------------------------
-- 2. TEST MIME TYPE SANITIZATION & CHECK CONSTRAINT SATISFACTION
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_clean RECORD;
BEGIN
    -- Test MIME type fallback: audio/mpeg should yield mp3 extension, NO slashes!
    SELECT * INTO v_clean FROM public.sanitize_story_audio_projection(
        '{"filename": "../../bad/path/test", "verified_format": "audio/mpeg"}'::jsonb
    );
    
    IF v_clean.filename LIKE '%/%' OR v_clean.filename LIKE '%\%' THEN
        RAISE EXCEPTION 'TEST FAILED: Sanitized filename contains slashes: %', v_clean.filename;
    END IF;

    IF v_clean.filename <> 'recording.mp3' THEN
        RAISE EXCEPTION 'TEST FAILED: Expected recording.mp3 for MIME audio/mpeg, got %', v_clean.filename;
    END IF;

    RAISE NOTICE '[PASS] MIME type audio/mpeg correctly mapped to recording.mp3 without slashes.';
END $$;


-- -----------------------------------------------------------------------------
-- 3. TEST DURATION BOUNDARY ENFORCEMENT (60s Limit)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_over RECORD;
    v_valid RECORD;
    v_neg RECORD;
BEGIN
    -- Over 60.5s -> should clamp to NULL
    SELECT * INTO v_over FROM public.sanitize_story_audio_projection(
        '{"duration": 120.0}'::jsonb
    );
    IF v_over.duration IS NOT NULL THEN
        RAISE EXCEPTION 'TEST FAILED: Duration over 60.5s was not clamped to NULL, got %', v_over.duration;
    END IF;

    -- Negative -> should clamp to NULL
    SELECT * INTO v_neg FROM public.sanitize_story_audio_projection(
        '{"duration": -15.0}'::jsonb
    );
    IF v_neg.duration IS NOT NULL THEN
        RAISE EXCEPTION 'TEST FAILED: Negative duration was not clamped to NULL, got %', v_neg.duration;
    END IF;

    -- Valid 45.5s -> preserved
    SELECT * INTO v_valid FROM public.sanitize_story_audio_projection(
        '{"duration": 45.5}'::jsonb
    );
    IF v_valid.duration <> 45.5 THEN
        RAISE EXCEPTION 'TEST FAILED: Valid duration 45.5 was not preserved, got %', v_valid.duration;
    END IF;

    RAISE NOTICE '[PASS] Duration boundaries (0 <= dur <= 60.5) correctly enforced.';
END $$;


-- -----------------------------------------------------------------------------
-- 4. TEST CATALOG PERMISSIONS & PRIVILEGE BASELINE
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_count INT;
BEGIN
    -- Check that anon has NO column privileges on raw audio
    SELECT count(*) INTO v_count
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' 
      AND table_name = 'stories' 
      AND column_name = 'audio' 
      AND grantee IN ('anon', 'PUBLIC');

    IF v_count > 0 THEN
        RAISE EXCEPTION 'SECURITY AUDIT FAILED: anon or PUBLIC still holds column privileges on stories.audio!';
    END IF;

    -- Check that anon has NO column privileges on user_id
    SELECT count(*) INTO v_count
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' 
      AND table_name = 'stories' 
      AND column_name = 'user_id' 
      AND grantee IN ('anon', 'PUBLIC');

    IF v_count > 0 THEN
        RAISE EXCEPTION 'SECURITY AUDIT FAILED: anon or PUBLIC still holds column privileges on stories.user_id!';
    END IF;

    RAISE NOTICE '[PASS] Database catalog confirms zero privilege leakage for anon/PUBLIC on audio and user_id.';
END $$;


-- -----------------------------------------------------------------------------
-- 5. TEST REAL ROLE SWITCHING (anon Role Context)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- Switch session to anon
    PERFORM set_config('role', 'anon', true);

    -- Test A: Direct SELECT on stories.audio MUST FAIL with 42501
    BEGIN
        PERFORM audio FROM public.stories LIMIT 1;
        RAISE EXCEPTION 'SECURITY VIOLATION: anon was able to query public.stories.audio directly!';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE '[PASS] Role anon direct query to stories.audio correctly denied (SQLSTATE 42501).';
    END;

    -- Test B: Direct SELECT on stories.user_id MUST FAIL with 42501
    BEGIN
        PERFORM user_id FROM public.stories LIMIT 1;
        RAISE EXCEPTION 'SECURITY VIOLATION: anon was able to query public.stories.user_id directly!';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE '[PASS] Role anon direct query to stories.user_id correctly denied (SQLSTATE 42501).';
    END;

    -- Test C: Direct mutations on story_audio_public MUST FAIL with 42501
    BEGIN
        INSERT INTO public.story_audio_public (story_id, filename) VALUES ('hack', 'hack.mp3');
        RAISE EXCEPTION 'SECURITY VIOLATION: anon was able to insert into story_audio_public!';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE '[PASS] Role anon INSERT into story_audio_public correctly denied (SQLSTATE 42501).';
    END;

    -- Test D: Querying public.explore_stories MUST SUCCEED
    BEGIN
        PERFORM id, title, audio FROM public.explore_stories LIMIT 5;
        RAISE NOTICE '[PASS] Role anon successfully queried public.explore_stories view.';
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'QUERY FAILED: anon failed to query explore_stories: %', SQLERRM;
    END;

    -- Reset role
    PERFORM set_config('role', 'postgres', true);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE;
END $$;

RESET ROLE;


-- -----------------------------------------------------------------------------
-- 6. TEST TRIGGER SYNCHRONIZATION & CASCADE DELETION
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_test_id TEXT := 'staging_test_story_' || floor(random() * 100000)::text;
    v_rec RECORD;
BEGIN
    -- Insert test story as authenticated
    INSERT INTO public.stories (
        id, title, status, visibility, audio_public_playback, audio
    ) VALUES (
        v_test_id,
        'Staging Verification Story',
        'preserved',
        'public',
        true,
        jsonb_build_object(
            'filename', 'C:\\Users\\Artist\\voice.wav',
            'name', 'Oral Song',
            'duration', '42.3',
            'verified_format', 'audio/wav',
            'storage_path', 'secret/storage/path/voice.wav'
        )
    );

    -- Verify projection was automatically created by trigger
    SELECT * INTO v_rec FROM public.story_audio_public WHERE story_id = v_test_id;
    IF v_rec IS NULL THEN
        RAISE EXCEPTION 'TRIGGER FAILED: Projection row was not created in story_audio_public!';
    END IF;

    -- Verify sanitization: Windows path stripped, duration parsed, MIME format normalized
    IF v_rec.filename <> 'voice.wav' THEN
        RAISE EXCEPTION 'SANITIZATION FAILED: Expected voice.wav, got %', v_rec.filename;
    END IF;
    IF v_rec.duration <> 42.3 THEN
        RAISE EXCEPTION 'DURATION FAILED: Expected 42.3, got %', v_rec.duration;
    END IF;

    RAISE NOTICE '[PASS] Trigger correctly synchronized and sanitized test story audio.';

    -- Test ON DELETE CASCADE
    DELETE FROM public.stories WHERE id = v_test_id;
    IF EXISTS (SELECT 1 FROM public.story_audio_public WHERE story_id = v_test_id) THEN
        RAISE EXCEPTION 'CASCADE FAILED: Projection row was not deleted when base story was deleted!';
    END IF;

    RAISE NOTICE '[PASS] ON DELETE CASCADE successfully cleaned up projection row upon story deletion.';
EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.stories WHERE id = v_test_id;
    RAISE;
END $$;

RAISE NOTICE '=================================================================';
RAISE NOTICE '  ALL STAGING POSTGRESQL VERIFICATION CHECKS PASSED (100%%)      ';
RAISE NOTICE '=================================================================';

-- Safely roll back dry-run changes
ROLLBACK;

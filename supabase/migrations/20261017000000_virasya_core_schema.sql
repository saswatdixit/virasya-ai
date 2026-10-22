-- =============================================================================
-- Virasya Cultural Preservation Platform - Database Schema & Security Migration
-- Target: Supabase PostgreSQL
-- Version: 20261017000000_virasya_core_schema.sql
-- Status: PROPOSED FOR REVIEW (Do not apply without explicit user confirmation)
-- =============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 2. CORE SECURITY & HELPER FUNCTIONS
-- =============================================================================

-- Universal updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

-- Explicit backend authorization detector.
-- Executed with caller privileges (SECURITY INVOKER) so PostgreSQL does NOT
-- mask current_user or session_user with a function owner's identity.
-- Returns TRUE ONLY for:
--   1. PostgREST API requests executing with the server-side service_role key.
--   2. Direct database administrator sessions (psql, CLI db push, seeds) where
--      current_user is postgres/supabase_admin AND no client JWT claim is active.
-- Returns FALSE for ALL ordinary clients (anon, authenticated, custom, or malformed).
CREATE OR REPLACE FUNCTION public.is_trusted_backend()
RETURNS BOOLEAN AS $$
DECLARE
    jwt_role TEXT;
    jwt_claims TEXT;
    pg_role TEXT;
BEGIN
    jwt_claims := nullif(current_setting('request.jwt.claims', true), '');
    IF jwt_claims IS NOT NULL THEN
        BEGIN
            jwt_role := coalesce(jwt_claims::jsonb->>'role', '');
        EXCEPTION WHEN OTHERS THEN
            jwt_role := '';
        END;
    ELSE
        jwt_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '');
    END IF;

    pg_role := current_user;

    -- Case 1: PostgREST request with verified service_role key
    IF jwt_role = 'service_role' OR pg_role = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- Case 2: Direct database administrator (CLI migration, seed, psql) with no client JWT
    IF pg_role IN ('postgres', 'supabase_admin') AND jwt_role = '' AND jwt_claims IS NULL THEN
        RETURN TRUE;
    END IF;

    -- All other callers (anon, authenticated, or unexpected roles) are untrusted clients
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp;

-- =============================================================================
-- 3. PROFILES TABLE
-- Bridges Supabase Auth users to application profiles.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT DEFAULT '',
    display_name TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Reconcile columns if table pre-existed
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Auto-provision profile on auth.users sign up
-- Requires SECURITY DEFINER to write to public.profiles during auth creation
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(
            NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
            NULLIF(NEW.raw_user_meta_data->>'name', ''),
            NULLIF(split_part(NEW.email, '@', 1), ''),
            'Storyteller'
        )
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- Profile integrity trigger: protects id, created_at, and mirrors email from auth.users
CREATE OR REPLACE FUNCTION public.protect_profile_integrity()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.is_trusted_backend() THEN
        IF TG_OP = 'INSERT' THEN
            NEW.created_at = timezone('utc'::text, now());
            -- Force email to match authenticated user record in auth.users
            IF NEW.id IS NOT NULL THEN
                SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.id;
            END IF;
            IF NEW.email IS NULL THEN
                NEW.email := coalesce(nullif(current_setting('request.jwt.claim.email', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'), '');
            END IF;
        END IF;
        IF TG_OP = 'UPDATE' THEN
            IF NEW.id IS DISTINCT FROM OLD.id THEN
                RAISE EXCEPTION 'Profile ID is immutable.';
            END IF;
            IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
                RAISE EXCEPTION 'Profile created_at timestamp is immutable.';
            END IF;
            IF NEW.email IS DISTINCT FROM OLD.email THEN
                RAISE EXCEPTION 'Email cannot be modified directly in profiles. Use Supabase Auth email update flow.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_protect_profile_integrity ON public.profiles;
CREATE TRIGGER trigger_protect_profile_integrity
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_integrity();

-- =============================================================================
-- 4. STORIES TABLE
-- Stores cultural narratives, voice recordings, dual transcripts, and provenance.
-- Note: id is TEXT to support existing story IDs (e.g. story_1791907205601, story_3c29d77663b9)
-- user_id is NULLABLE to safely support unassigned legacy stories.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.stories (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT '',
    carrier TEXT DEFAULT '',
    relationship TEXT DEFAULT '',
    place TEXT DEFAULT '',
    roots TEXT DEFAULT '',
    category TEXT DEFAULT '',
    language TEXT NOT NULL DEFAULT 'Odia',
    period TEXT DEFAULT '',
    email TEXT DEFAULT '',
    written_text TEXT DEFAULT '',
    working_draft TEXT DEFAULT '',
    final_text TEXT DEFAULT '',
    story TEXT DEFAULT '', -- Backward compatibility alias
    audio JSONB DEFAULT NULL,
    raw_transcripts JSONB NOT NULL DEFAULT '{}'::jsonb,
    vocabulary JSONB NOT NULL DEFAULT '[]'::jsonb,
    punctuation JSONB NOT NULL DEFAULT '{}'::jsonb,
    final_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    visibility TEXT NOT NULL DEFAULT 'private',
    confirmed BOOLEAN NOT NULL DEFAULT false,
    permission_confirmed BOOLEAN NOT NULL DEFAULT false,
    audio_public_playback BOOLEAN NOT NULL DEFAULT false,
    provenance_id TEXT DEFAULT NULL,
    provenance_hash TEXT DEFAULT NULL,
    preserved_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Reconcile columns if table pre-existed
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS carrier TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS relationship TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS place TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS roots TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'Odia';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS period TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS written_text TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS working_draft TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS final_text TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS story TEXT DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS audio JSONB DEFAULT NULL;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS raw_transcripts JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS vocabulary JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS punctuation JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS final_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS permission_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS audio_public_playback BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS provenance_id TEXT DEFAULT NULL;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS provenance_hash TEXT DEFAULT NULL;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS preserved_at TIMESTAMPTZ DEFAULT NULL;

-- Reconcile constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_status_check') THEN
        ALTER TABLE public.stories ADD CONSTRAINT stories_status_check CHECK (status IN ('draft', 'preserved'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_visibility_check') THEN
        ALTER TABLE public.stories ADD CONSTRAINT stories_visibility_check CHECK (visibility IN ('private', 'family', 'community', 'public'));
    END IF;
END $$;

-- Performance & Query Indexes
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON public.stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_status_visibility ON public.stories(status, visibility);
CREATE INDEX IF NOT EXISTS idx_stories_language ON public.stories(language);
CREATE INDEX IF NOT EXISTS idx_stories_category ON public.stories(category);
CREATE INDEX IF NOT EXISTS idx_stories_preserved_at ON public.stories(preserved_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_stories_provenance_id ON public.stories(provenance_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trigger_stories_updated_at ON public.stories;
CREATE TRIGGER trigger_stories_updated_at
    BEFORE UPDATE ON public.stories
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Story Integrity & Anti-Tampering Trigger
CREATE OR REPLACE FUNCTION public.protect_story_integrity()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.is_trusted_backend() THEN
        IF TG_OP = 'DELETE' THEN
            IF OLD.status = 'preserved' THEN
                RAISE EXCEPTION 'Preserved stories are archived cultural assets and cannot be directly deleted by client requests. Contact preservation administrators.';
            END IF;
            RETURN OLD;
        END IF;

        IF TG_OP = 'INSERT' THEN
            IF NEW.status = 'preserved' THEN
                RAISE EXCEPTION 'Direct insertion of preserved stories is forbidden. Stories must be sealed via the Virasya AI preservation backend.';
            END IF;
            IF NEW.provenance_id IS NOT NULL OR NEW.provenance_hash IS NOT NULL OR NEW.preserved_at IS NOT NULL THEN
                RAISE EXCEPTION 'Cryptographic provenance identifiers cannot be generated by client requests.';
            END IF;
        END IF;

        IF TG_OP = 'UPDATE' THEN
            IF OLD.status = 'draft' AND NEW.status = 'preserved' THEN
                RAISE EXCEPTION 'Story preservation requires cryptographic sealing via the Virasya AI backend.';
            END IF;
            IF OLD.status = 'preserved' AND NEW.status = 'draft' THEN
                RAISE EXCEPTION 'Preserved stories cannot be demoted to draft by client requests.';
            END IF;
            IF NEW.provenance_id IS DISTINCT FROM OLD.provenance_id OR
               NEW.provenance_hash IS DISTINCT FROM OLD.provenance_hash OR
               NEW.preserved_at IS DISTINCT FROM OLD.preserved_at THEN
                RAISE EXCEPTION 'Cryptographic provenance fields are immutable once assigned.';
            END IF;
            IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
                RAISE EXCEPTION 'Story ownership cannot be modified.';
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_protect_story_integrity ON public.stories;
CREATE TRIGGER trigger_protect_story_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.stories
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_story_integrity();

-- =============================================================================
-- 5. VOCABULARY TABLE
-- Cultural lexicon store supporting dialect words, phonetic variants, and provenance.
-- Note: id is TEXT to support both UUIDs and custom string keys (e.g. sample-vocab-1).
-- user_id is NULLABLE to support system/legacy terminology safely.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.vocabulary (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    story_id TEXT REFERENCES public.stories(id) ON DELETE SET NULL,
    canonical_term TEXT NOT NULL,
    heard_term TEXT DEFAULT '',
    language TEXT NOT NULL DEFAULT 'or',
    category TEXT DEFAULT 'cultural_term',
    variants JSONB NOT NULL DEFAULT '[]'::jsonb,
    context TEXT DEFAULT '',
    meaning TEXT DEFAULT '',
    pronunciation TEXT DEFAULT '',
    dialect TEXT DEFAULT '',
    verification_status TEXT NOT NULL DEFAULT 'suggested',
    verification_count INTEGER NOT NULL DEFAULT 1 CHECK (verification_count >= 0),
    source_artifact JSONB NOT NULL DEFAULT '{}'::jsonb,
    provenance_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_sample BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Reconcile columns if table pre-existed
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS story_id TEXT REFERENCES public.stories(id) ON DELETE SET NULL;
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS canonical_term TEXT NOT NULL DEFAULT '';
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS heard_term TEXT DEFAULT '';
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'or';
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'cultural_term';
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS context TEXT DEFAULT '';
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS meaning TEXT DEFAULT '';
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS pronunciation TEXT DEFAULT '';
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS dialect TEXT DEFAULT '';
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'suggested';
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS verification_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS source_artifact JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS provenance_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.vocabulary ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT false;

-- Reconcile constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vocab_verification_status_check') THEN
        ALTER TABLE public.vocabulary ADD CONSTRAINT vocab_verification_status_check CHECK (verification_status IN ('suggested', 'verified', 'rejected'));
    END IF;
END $$;

-- Vocabulary Indexes
CREATE INDEX IF NOT EXISTS idx_vocab_canonical ON public.vocabulary(canonical_term);
CREATE INDEX IF NOT EXISTS idx_vocab_status ON public.vocabulary(verification_status);
CREATE INDEX IF NOT EXISTS idx_vocab_user_id ON public.vocabulary(user_id);
CREATE INDEX IF NOT EXISTS idx_vocab_story_id ON public.vocabulary(story_id);
CREATE INDEX IF NOT EXISTS idx_vocab_language ON public.vocabulary(language);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trigger_vocabulary_updated_at ON public.vocabulary;
CREATE TRIGGER trigger_vocabulary_updated_at
    BEFORE UPDATE ON public.vocabulary
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Vocabulary Integrity Trigger
CREATE OR REPLACE FUNCTION public.protect_vocabulary_integrity()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.is_trusted_backend() THEN
        IF TG_OP = 'DELETE' THEN
            IF OLD.verification_status = 'verified' OR OLD.is_sample = true THEN
                RAISE EXCEPTION 'Verified or sample vocabulary entries cannot be deleted by standard users.';
            END IF;
            RETURN OLD;
        END IF;

        IF NEW.verification_status IS DISTINCT FROM 'suggested' THEN
            RAISE EXCEPTION 'User-submitted vocabulary entries must have verification_status = "suggested".';
        END IF;
        IF NEW.is_sample = true AND (TG_OP = 'INSERT' OR OLD.is_sample = false) THEN
            RAISE EXCEPTION 'Sample vocabulary entries can only be designated by system administrators.';
        END IF;
        IF NEW.is_sample = true AND NEW.story_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.stories s
                WHERE s.id = NEW.story_id AND s.status = 'preserved' AND s.visibility = 'public'
            ) THEN
                RAISE EXCEPTION 'Sample vocabulary entries must either be standalone (story_id IS NULL) or reference a public preserved story.';
            END IF;
        END IF;
        IF TG_OP = 'INSERT' THEN
            NEW.verification_count := 1;
        END IF;
        IF TG_OP = 'UPDATE' THEN
            IF OLD.verification_status = 'verified' THEN
                RAISE EXCEPTION 'Verified vocabulary entries are canonical and cannot be modified by standard users.';
            END IF;
            IF NEW.verification_count IS DISTINCT FROM OLD.verification_count THEN
                NEW.verification_count := OLD.verification_count;
            END IF;
            IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
                RAISE EXCEPTION 'Vocabulary ownership cannot be modified.';
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_protect_vocabulary_integrity ON public.vocabulary;
CREATE TRIGGER trigger_protect_vocabulary_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.vocabulary
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_vocabulary_integrity();

-- =============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict least-privilege access model with explicit purge of legacy/template policies.
-- =============================================================================

-- 6.1 Enable RLS on all application tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;

-- 6.2 PROFILES POLICIES
-- Explicitly purge default Supabase starter template policies if present
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 6.3 STORIES POLICIES
-- Explicitly purge permissive legacy policies if present
DROP POLICY IF EXISTS "Enable read access for all users" ON public.stories;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.stories;
DROP POLICY IF EXISTS "stories_read_all" ON public.stories;
DROP POLICY IF EXISTS "stories_select_all" ON public.stories;

-- A. Public Explore View: ANYONE can view preserved public stories
DROP POLICY IF EXISTS "stories_select_public_preserved" ON public.stories;
CREATE POLICY "stories_select_public_preserved" ON public.stories
    FOR SELECT USING (
        status = 'preserved' AND visibility = 'public'
    );

-- B. Story Owner View: Authenticated users can view their own stories
DROP POLICY IF EXISTS "stories_select_owner" ON public.stories;
CREATE POLICY "stories_select_owner" ON public.stories
    FOR SELECT TO authenticated USING (
        auth.uid() = user_id
    );

-- C. Story Creation: Authenticated users can insert drafts where user_id = auth.uid()
DROP POLICY IF EXISTS "stories_insert_owner" ON public.stories;
CREATE POLICY "stories_insert_owner" ON public.stories
    FOR INSERT TO authenticated WITH CHECK (
        auth.uid() = user_id AND status = 'draft'
    );

-- D. Story Update: Authenticated users can update ONLY their own stories
DROP POLICY IF EXISTS "stories_update_owner" ON public.stories;
CREATE POLICY "stories_update_owner" ON public.stories
    FOR UPDATE TO authenticated USING (
        auth.uid() = user_id
    ) WITH CHECK (
        auth.uid() = user_id
    );

-- E. Story Deletion: Authenticated users can delete ONLY their own stories
DROP POLICY IF EXISTS "stories_delete_owner" ON public.stories;
CREATE POLICY "stories_delete_owner" ON public.stories
    FOR DELETE TO authenticated USING (
        auth.uid() = user_id
    );

-- 6.4 VOCABULARY POLICIES
-- Explicitly purge permissive legacy policies if present
DROP POLICY IF EXISTS "Enable read access for all users" ON public.vocabulary;
DROP POLICY IF EXISTS "vocab_select_all" ON public.vocabulary;

-- A. Public & Verified View: Any user can read sample terms, standalone verified terms, or terms from preserved public stories
-- Protects terms linked to private/family stories from being exposed even if verified
-- Excludes rejected vocabulary entries from public search and viewing
DROP POLICY IF EXISTS "vocab_select_verified_or_public" ON public.vocabulary;
CREATE POLICY "vocab_select_verified_or_public" ON public.vocabulary
    FOR SELECT USING (
        verification_status != 'rejected'
        AND (
            (is_sample = true AND (
                story_id IS NULL OR EXISTS (
                    SELECT 1 FROM public.stories s
                    WHERE s.id = vocabulary.story_id
                      AND s.status = 'preserved'
                      AND s.visibility = 'public'
                )
            ))
            OR (
                verification_status = 'verified'
                AND (
                    story_id IS NULL
                    OR EXISTS (
                        SELECT 1 FROM public.stories s
                        WHERE s.id = vocabulary.story_id
                          AND s.status = 'preserved'
                          AND s.visibility = 'public'
                    )
                )
            )
            OR (
                story_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.stories s
                    WHERE s.id = vocabulary.story_id
                      AND s.status = 'preserved'
                      AND s.visibility = 'public'
                )
            )
        )
    );

-- B. Owner View: Authenticated users can read their own vocabulary terms or terms linked to their own stories
DROP POLICY IF EXISTS "vocab_select_owner" ON public.vocabulary;
CREATE POLICY "vocab_select_owner" ON public.vocabulary
    FOR SELECT TO authenticated USING (
        auth.uid() = user_id
        OR (
            story_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.stories s
                WHERE s.id = vocabulary.story_id
                  AND s.user_id = auth.uid()
            )
        )
    );

-- C. Owner Insert: Authenticated users can insert their own terms (must be suggested)
DROP POLICY IF EXISTS "vocab_insert_owner" ON public.vocabulary;
CREATE POLICY "vocab_insert_owner" ON public.vocabulary
    FOR INSERT TO authenticated WITH CHECK (
        auth.uid() = user_id AND verification_status = 'suggested'
    );

-- D. Owner Update: Authenticated users can update only their own terms
DROP POLICY IF EXISTS "vocab_update_owner" ON public.vocabulary;
CREATE POLICY "vocab_update_owner" ON public.vocabulary
    FOR UPDATE TO authenticated USING (
        auth.uid() = user_id
    ) WITH CHECK (
        auth.uid() = user_id AND verification_status = 'suggested'
    );

-- E. Owner Delete: Authenticated users can delete only their own terms
DROP POLICY IF EXISTS "vocab_delete_owner" ON public.vocabulary;
CREATE POLICY "vocab_delete_owner" ON public.vocabulary
    FOR DELETE TO authenticated USING (
        auth.uid() = user_id
    );

-- =============================================================================
-- 7. STORAGE BUCKET & POLICIES
-- story-recordings-private: Single private bucket for all audio recordings.
-- No public audio bucket is created. Public stories DO NOT grant public audio read.
-- Playback requires server-authorized signed URLs with short TTL.
-- Explicitly purges any legacy public storage policies.
-- =============================================================================

-- Purge any legacy public audio policies that may have existed in earlier drafts or templates
DROP POLICY IF EXISTS "public_audio_select_all" ON storage.objects;
DROP POLICY IF EXISTS "public_audio_select_preserved" ON storage.objects;
DROP POLICY IF EXISTS "Allow public access to recordings" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- Create or update the private storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'story-recordings-private',
    'story-recordings-private',
    false,
    52428800, -- 50 MB
    ARRAY['audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/webm', 'audio/flac', 'audio/aac', 'audio/mp4', 'audio/x-m4a']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Note: Row Level Security on storage.objects is enabled by default in Supabase Storage.
-- Enabling RLS via ALTER TABLE on storage.objects is intentionally omitted here because
-- the table is managed and owned by supabase_storage_admin rather than the postgres role.

-- Private Storage Policies (Folder structure: {user_id}/{filename})
DROP POLICY IF EXISTS "private_audio_upload_owner" ON storage.objects;
CREATE POLICY "private_audio_upload_owner" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'story-recordings-private'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "private_audio_select_owner" ON storage.objects;
CREATE POLICY "private_audio_select_owner" ON storage.objects
    FOR SELECT TO authenticated USING (
        bucket_id = 'story-recordings-private'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "private_audio_update_owner" ON storage.objects;
CREATE POLICY "private_audio_update_owner" ON storage.objects
    FOR UPDATE TO authenticated USING (
        bucket_id = 'story-recordings-private'
        AND (storage.foldername(name))[1] = auth.uid()::text
    ) WITH CHECK (
        bucket_id = 'story-recordings-private'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "private_audio_delete_owner" ON storage.objects;
CREATE POLICY "private_audio_delete_owner" ON storage.objects
    FOR DELETE TO authenticated USING (
        bucket_id = 'story-recordings-private'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- =============================================================================
-- 8. LEAST-PRIVILEGE TABLE & COLUMN GRANTS
-- Enforces explicit privilege boundaries for anon, authenticated, and service_role.
-- =============================================================================

-- Ensure service_role and postgres retain full management privileges
GRANT ALL ON public.profiles TO postgres, service_role;
GRANT ALL ON public.stories TO postgres, service_role;
GRANT ALL ON public.vocabulary TO postgres, service_role;

-- Revoke all table-level privileges from anonymous visitors
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.stories FROM anon;
REVOKE ALL ON public.vocabulary FROM anon;

-- Anonymous visitors only require read access to public preserved stories and vocabulary
GRANT SELECT ON public.stories TO anon;
GRANT SELECT ON public.vocabulary TO anon;

-- Authenticated users: explicit least-privilege grants
-- Profiles: revoke all; grant select and controlled column mutations
REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (id, full_name, display_name, avatar_url) ON public.profiles TO authenticated;
GRANT UPDATE (full_name, display_name, avatar_url) ON public.profiles TO authenticated;

-- Stories: allow standard CRUD under RLS
REVOKE ALL ON public.stories FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;

-- Vocabulary: allow standard CRUD under RLS
REVOKE ALL ON public.vocabulary FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vocabulary TO authenticated;

-- =============================================================================
-- Virasya Cultural Preservation Platform - Security Audit Remediation VIR-SEC-004
-- Migration: 20261024060000_transcription_usage_quota.sql
-- Target: Supabase PostgreSQL
-- Status: PROPOSED FOR REVIEW (Standalone; do not apply without authorization)
--
-- Remediation:
-- VIR-SEC-004: Atomic Row-Locked Rate Limiting for Speech Transcription
-- Creates public.transcription_usage table and atomic RPC function
-- check_and_consume_transcription_quota utilizing pg_advisory_xact_lock.
--
-- Invariants:
-- 1. Strict Service Role Boundary: Table and RPC execution are granted exclusively
--    to postgres and service_role. Anon and authenticated clients cannot call
--    the RPC directly or access the usage table.
-- 2. Trusted Backend Enforcement: Enforces is_trusted_backend() inside the RPC body.
-- 3. Canonical TIMESTAMPTZ Handling: Uses standard now() for UTC timestamp storage
--    and rolling-window calculations, avoiding timezone() text-casting skew.
-- 4. Parameter Validation: Enforces positive integer validation for limits/windows
--    and non-null user UUID with standard SQLSTATE 22023 exceptions.
-- 5. Isolated Scoped Pruning: Cleanup of historical records (>48h) is scoped to
--    user_id = p_user_id within the advisory transaction lock, preventing table-wide
--    locks and cross-user lock contention.
-- 6. Atomic Per-User Serialization: pg_advisory_xact_lock serializes concurrent calls
--    for the exact user ID, preventing double-spend race conditions.
-- 7. Fail-Closed Integration: Downstream Edge Function halts with HTTP 500 if the
--    quota RPC cannot be verified.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.transcription_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcription_usage_user_window
    ON public.transcription_usage(user_id, created_at DESC);

-- Enable RLS and lock table to service_role and postgres only
ALTER TABLE public.transcription_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transcription_usage FROM anon, authenticated;
GRANT ALL ON public.transcription_usage TO postgres, service_role;

-- Explicitly lock down the underlying BIGSERIAL sequence
REVOKE ALL ON SEQUENCE public.transcription_usage_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.transcription_usage_id_seq TO postgres, service_role;

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
    -- Strict security guard: only trusted backend (service_role / postgres) may invoke
    IF NOT public.is_trusted_backend() THEN
        RAISE EXCEPTION 'Access denied: Quota enforcement requires trusted backend authority.'
            USING ERRCODE = '42501';
    END IF;

    -- Strict parameter validation
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required for transcription quota check.'
            USING ERRCODE = '22023';
    END IF;

    IF p_max_requests IS NULL OR p_max_requests <= 0 THEN
        RAISE EXCEPTION 'Max requests must be a positive integer.'
            USING ERRCODE = '22023';
    END IF;

    IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
        RAISE EXCEPTION 'Window seconds must be a positive integer.'
            USING ERRCODE = '22023';
    END IF;

    -- Serialize concurrent requests for this exact user using transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext('transcription_quota_' || p_user_id::text));

    v_window_start := now() - (p_window_seconds * INTERVAL '1 second');

    SELECT COUNT(*) INTO v_count
    FROM public.transcription_usage
    WHERE user_id = p_user_id AND created_at >= v_window_start;

    IF v_count < p_max_requests THEN
        INSERT INTO public.transcription_usage (user_id, created_at)
        VALUES (p_user_id, now());
        v_allowed := TRUE;
        v_count := v_count + 1;
    ELSE
        v_allowed := FALSE;
    END IF;

    -- Prune historical records older than 48 hours scoped strictly to this user
    -- to prevent table-wide scan contention and cross-user lock conflicts
    DELETE FROM public.transcription_usage
    WHERE user_id = p_user_id AND created_at < now() - INTERVAL '48 hours';

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

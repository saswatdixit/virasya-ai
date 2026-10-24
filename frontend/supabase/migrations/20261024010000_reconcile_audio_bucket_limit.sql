-- =============================================================================
-- Virasya Cultural Preservation Platform - Forward Security Migration
-- Migration: 20261024010000_reconcile_audio_bucket_limit.sql
-- Target: Supabase PostgreSQL
-- Status: FORWARD MIGRATION (Idempotent update to reconcile storage limit)
--
-- Reconciles the private audio storage bucket file size limit to 5 MiB
-- (5,242,880 bytes) per audio recording object, matching GNANI STT API boundaries
-- and server-side Edge Function audio-validator limits.
-- =============================================================================

UPDATE storage.buckets
SET file_size_limit = 5242880 -- 5 MiB (5,242,880 bytes)
WHERE id = 'story-recordings-private';

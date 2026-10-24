/**
 * Virasya Supabase Database Schema Types
 *
 * Source of Truth: supabase/migrations/20261017000000_virasya_core_schema.sql
 *
 * Reflects the exact database schema deployed to the staging Supabase project (tdpeljbmicgjgxjwsvoc):
 * - public.profiles
 * - public.stories
 * - public.vocabulary
 *
 * All column names, nullable states, defaults, and CHECK constraints strictly match PostgreSQL definitions.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Valid values for stories.status enforced by PostgreSQL check constraint:
 * CHECK (status IN ('draft', 'preserved'))
 */
export type StoryStatus = "draft" | "preserved";

/**
 * Valid values for stories.visibility enforced by PostgreSQL check constraint:
 * CHECK (visibility IN ('private', 'family', 'community', 'public'))
 */
export type StoryVisibility = "private" | "family" | "community" | "public";

/**
 * Valid values for vocabulary.verification_status enforced by PostgreSQL check constraint:
 * CHECK (verification_status IN ('suggested', 'verified', 'rejected'))
 */
export type VocabularyVerificationStatus = "suggested" | "verified" | "rejected";

/**
 * Storage JSON structure for stories.audio column.
 */
export interface DbAudioMetadata {
  filename: string;
  storage_path?: string;
  bucket?: string;
  size?: number | null;
  duration?: number | null;
  mime_type?: string;
  kind?: string;
  url?: string;
  [key: string]: Json | undefined;
}

/**
 * Storage JSON structure for stories.raw_transcripts column.
 */
export interface DbRawTranscripts {
  vaani?: Json;
  indicconformer?: Json;
  [key: string]: Json | undefined;
}

/**
 * Storage JSON structure for stories.final_settings column.
 */
export interface DbFinalSettings {
  visibility?: string;
  confirmed?: boolean;
  permissionConfirmed?: boolean;
  audioPublicConsent?: boolean;
  [key: string]: Json | undefined;
}

// =============================================================================
// 1. PROFILES TABLE
// =============================================================================

export interface ProfileRow {
  id: string; // UUID primary key, references auth.users(id) ON DELETE CASCADE
  email: string | null;
  full_name: string;
  display_name: string;
  avatar_url: string;
  created_at: string; // ISO 8601 TIMESTAMPTZ
  updated_at: string; // ISO 8601 TIMESTAMPTZ
}

export interface ProfileInsert {
  id: string;
  email?: string | null;
  full_name?: string;
  display_name?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileUpdate {
  email?: string | null;
  full_name?: string;
  display_name?: string;
  avatar_url?: string;
  updated_at?: string;
  // id and created_at are protected/immutable in PostgreSQL trigger
}

// =============================================================================
// 2. STORIES TABLE
// =============================================================================

export interface StoryRow {
  id: string; // TEXT PRIMARY KEY (e.g. story_1791993188342)
  user_id: string | null; // UUID REFERENCES auth.users(id) ON DELETE SET NULL
  title: string;
  carrier: string;
  relationship: string;
  place: string;
  roots: string;
  category: string;
  language: string;
  period: string;
  email: string;
  written_text: string;
  working_draft: string;
  final_text: string;
  story: string; // Backward compatibility alias
  audio: DbAudioMetadata | null;
  raw_transcripts: DbRawTranscripts;
  vocabulary: Json;
  punctuation: Json;
  final_settings: DbFinalSettings;
  status: StoryStatus;
  visibility: StoryVisibility;
  confirmed: boolean;
  permission_confirmed: boolean;
  audio_public_playback: boolean;
  provenance_id: string | null;
  provenance_hash: string | null;
  preserved_at: string | null; // ISO 8601 TIMESTAMPTZ
  created_at: string; // ISO 8601 TIMESTAMPTZ
  updated_at: string; // ISO 8601 TIMESTAMPTZ
}

export interface StoryInsert {
  id: string;
  user_id?: string | null;
  title?: string;
  carrier?: string;
  relationship?: string;
  place?: string;
  roots?: string;
  category?: string;
  language?: string;
  period?: string;
  email?: string;
  written_text?: string;
  working_draft?: string;
  final_text?: string;
  story?: string;
  audio?: DbAudioMetadata | null;
  raw_transcripts?: DbRawTranscripts;
  vocabulary?: Json;
  punctuation?: Json;
  final_settings?: DbFinalSettings;
  status?: StoryStatus;
  visibility?: StoryVisibility;
  confirmed?: boolean;
  permission_confirmed?: boolean;
  audio_public_playback?: boolean;
  provenance_id?: string | null;
  provenance_hash?: string | null;
  preserved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StoryUpdate {
  user_id?: string | null;
  title?: string;
  carrier?: string;
  relationship?: string;
  place?: string;
  roots?: string;
  category?: string;
  language?: string;
  period?: string;
  email?: string;
  written_text?: string;
  working_draft?: string;
  final_text?: string;
  story?: string;
  audio?: DbAudioMetadata | null;
  raw_transcripts?: DbRawTranscripts;
  vocabulary?: Json;
  punctuation?: Json;
  final_settings?: DbFinalSettings;
  status?: StoryStatus;
  visibility?: StoryVisibility;
  confirmed?: boolean;
  permission_confirmed?: boolean;
  audio_public_playback?: boolean;
  provenance_id?: string | null;
  provenance_hash?: string | null;
  preserved_at?: string | null;
  updated_at?: string;
}

// =============================================================================
// 3. VOCABULARY TABLE
// =============================================================================

export interface VocabularyRow {
  id: string; // TEXT PRIMARY KEY (UUID string or custom key e.g. sample-vocab-1)
  user_id: string | null; // UUID REFERENCES auth.users(id) ON DELETE SET NULL
  story_id: string | null; // TEXT REFERENCES public.stories(id) ON DELETE SET NULL
  canonical_term: string;
  heard_term: string;
  language: string;
  category: string;
  variants: Json;
  context: string;
  meaning: string;
  pronunciation: string;
  dialect: string;
  verification_status: VocabularyVerificationStatus;
  verification_count: number;
  source_artifact: Json;
  provenance_history: Json;
  is_sample: boolean;
  created_at: string; // ISO 8601 TIMESTAMPTZ
  updated_at: string; // ISO 8601 TIMESTAMPTZ
}

export interface VocabularyInsert {
  id: string;
  user_id?: string | null;
  story_id?: string | null;
  canonical_term: string;
  heard_term?: string;
  language?: string;
  category?: string;
  variants?: Json;
  context?: string;
  meaning?: string;
  pronunciation?: string;
  dialect?: string;
  verification_status?: VocabularyVerificationStatus;
  verification_count?: number;
  source_artifact?: Json;
  provenance_history?: Json;
  is_sample?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface VocabularyUpdate {
  user_id?: string | null;
  story_id?: string | null;
  canonical_term?: string;
  heard_term?: string;
  language?: string;
  category?: string;
  variants?: Json;
  context?: string;
  meaning?: string;
  pronunciation?: string;
  dialect?: string;
  verification_status?: VocabularyVerificationStatus;
  verification_count?: number;
  source_artifact?: Json;
  provenance_history?: Json;
  is_sample?: boolean;
  updated_at?: string;
}

// =============================================================================
// 4. SUPABASE DATABASE GENERIC INTERFACE
// =============================================================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      stories: {
        Row: StoryRow;
        Insert: StoryInsert;
        Update: StoryUpdate;
      };
      vocabulary: {
        Row: VocabularyRow;
        Insert: VocabularyInsert;
        Update: VocabularyUpdate;
      };
    };
    Views: {
      explore_stories: {
        Row: {
          id: string;
          title: string;
          carrier: string;
          relationship: string;
          place: string;
          roots: string;
          category: string;
          language: string;
          period: string;
          written_text: string;
          final_text: string;
          story: string;
          status: StoryStatus;
          visibility: StoryVisibility;
          audio_public_playback: boolean;
          provenance_id: string | null;
          provenance_hash: string | null;
          preserved_at: string | null;
          created_at: string;
          updated_at: string;
          vocabulary: Json;
          audio: DbAudioMetadata | null;
        };
      };
    };
  };
}

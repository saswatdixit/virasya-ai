/**
 * Virasya Supabase Private Audio Storage Module
 *
 * Implements authorized audio upload, retrieval, and deletion against the
 * private `story-recordings-private` bucket on Supabase Storage.
 *
 * Security Invariants:
 * 1. Bucket is strictly private (public = false).
 * 2. Objects are namespaced per user: {user_id}/{filename}.
 * 3. Playback uses time-limited signed URLs (default TTL: 3600s / 1 hour).
 * 4. Never leaks service credentials or bypasses Row Level Security.
 */

import { getSupabase, isSupabaseConfigured } from "./client";

export const AUDIO_STORAGE_BUCKET = "story-recordings-private";

export interface AudioUploadResult {
  path: string;
  signedUrl: string | null;
  error: Error | null;
}

/**
 * Uploads an audio file to the private user directory: {userId}/{fileName}
 * Generates a short-lived signed URL for immediate playback in the browser.
 */
export async function uploadAudioToPrivateBucket(
  file: File | Blob,
  fileName: string,
  userId: string
): Promise<AudioUploadResult> {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured()) {
    return {
      path: "",
      signedUrl: null,
      error: new Error("Supabase is not configured in this environment."),
    };
  }

  if (!userId) {
    return {
      path: "",
      signedUrl: null,
      error: new Error("User must be authenticated to upload to private cloud storage."),
    };
  }

  // Sanitize filename to alphanumeric, dots, dashes, and underscores
  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${userId}/${cleanName}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .upload(storagePath, file, {
        upsert: true,
        contentType: file.type || "audio/wav",
      });

    if (uploadError) {
      return {
        path: storagePath,
        signedUrl: null,
        error: new Error(`Audio upload failed: ${uploadError.message}`),
      };
    }

    // Generate short-lived signed URL for playback (TTL: 1 hour)
    const { data: signedData, error: signError } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 3600);

    return {
      path: storagePath,
      signedUrl: signedData?.signedUrl || null,
      error: signError ? new Error(signError.message) : null,
    };
  } catch (err: any) {
    return {
      path: storagePath,
      signedUrl: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Generates a short-lived signed playback URL for a private recording.
 */
export async function getSignedAudioPlaybackUrl(
  storagePath: string,
  ttlSeconds: number = 3600
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured() || !storagePath) {
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .createSignedUrl(storagePath, ttlSeconds);

    if (error || !data?.signedUrl) {
      console.warn("[Storage] Could not create signed URL:", error?.message);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.warn("[Storage] Error generating signed URL:", err);
    return null;
  }
}

/**
 * Deletes an audio file from the private bucket.
 */
export async function deleteAudioFromPrivateBucket(
  storagePath: string
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured() || !storagePath) {
    return false;
  }

  try {
    const { error } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .remove([storagePath]);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Resolves an authorized, short-lived playback URL for a story's audio recording.
 * Invokes the trusted Edge Function `get-story-audio` to verify access permissions,
 * and falls back safely to direct user signed URLs or provided fallback URLs.
 */
export async function getStoryAudioPlaybackUrl(
  storyId: string,
  options?: { fallbackUrl?: string | null; storagePath?: string | null }
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured() || !storyId) {
    return options?.fallbackUrl || null;
  }

  // 1. Invoke trusted server-side Edge Function for authorized playback
  try {
    const { data, error } = await supabase.functions.invoke("get-story-audio", {
      body: { story_id: storyId },
    });

    if (error) {
      let detail = error.message;
      if ((error as any).context && typeof (error as any).context.json === "function") {
        try {
          const errJson = await (error as any).context.json();
          if (errJson?.error) detail = errJson.error;
        } catch {}
      }
      console.warn("[Storage] get-story-audio notice:", detail);
      if (!options?.storagePath && !options?.fallbackUrl) {
        throw new Error(detail);
      }
    } else if (data?.signed_url) {
      return data.signed_url;
    }
  } catch (invokeErr: any) {
    if (!options?.storagePath && !options?.fallbackUrl) {
      throw invokeErr;
    }
    console.warn("[Storage] get-story-audio invocation notice:", invokeErr);
  }

  // 2. Fallback to client-side signed URL if caller has access to the storage path
  if (options?.storagePath) {
    try {
      const directUrl = await getSignedAudioPlaybackUrl(options.storagePath, 3600);
      if (directUrl) return directUrl;
    } catch {}
  }

  // 3. Fallback to provided fallback URL (e.g. local backend or demo audio)
  return options?.fallbackUrl || null;
}

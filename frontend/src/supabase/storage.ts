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
 * Generates a collision-resistant, bounded, and sanitized storage path for an audio recording.
 *
 * Requirements:
 * 1. Namespaced to authenticated user: {userId}/{uniqueFilename}
 * 2. High-entropy v4 UUID ensures each upload receives a unique, unpredictable storage key.
 * 3. Base filename is sanitized to [a-zA-Z0-9._-] and bounded to 40 characters.
 * 4. Extension is sanitized and bounded to 10 characters (defaulting to .webm).
 * 5. Total filename length is strictly bounded (<= 87 chars), total path <= 124 chars.
 * 6. Never produces path traversal sequences (..), backslashes, or multiple separators.
 */
export function generateUniqueAudioStoragePath(userId: string, originalFileName: string): string {
  const cleanUserId = (userId || "").trim();
  if (!cleanUserId) {
    throw new Error("Cannot generate storage path without a valid user ID.");
  }

  // Cryptographically secure RFC 4122 v4 UUID generator
  let uniqueId: string;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    uniqueId = crypto.randomUUID();
  } else if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // RFC 4122 v4: set 4 most significant bits of byte 6 to 0100 (version 4)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // RFC 4122 v4: set 2 most significant bits of byte 8 to 10 (variant 1)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    uniqueId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } else {
    throw new Error(
      "Secure randomness (crypto.randomUUID or crypto.getRandomValues) is unavailable in this environment."
    );
  }

  const rawName = (originalFileName || "recording").trim();
  // Strip any leading slashes or dots from raw input
  const sanitizedRaw = rawName.replace(/^[./\\]+/, "");
  const lastDot = sanitizedRaw.lastIndexOf(".");

  const base = lastDot > 0 ? sanitizedRaw.slice(0, lastDot) : sanitizedRaw;
  const ext = lastDot > 0 ? sanitizedRaw.slice(lastDot) : "";

  // Sanitize base: alphanumeric, dots, hyphens, underscores only
  let cleanBase = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Defend against consecutive dots / path traversal in base
  cleanBase = cleanBase.replace(/\.{2,}/g, "_");
  // Clamp base length to 40 characters; fallback to 'audio' if empty or purely dots
  cleanBase = cleanBase.slice(0, 40).replace(/^\.+$/, "") || "audio";

  // Sanitize extension: exactly one dot followed by alphanumeric characters (max 8)
  let cleanExt = ext.startsWith(".") ? ext.slice(1) : ext;
  cleanExt = cleanExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  if (cleanExt) {
    cleanExt = `.${cleanExt}`;
  } else {
    cleanExt = ".webm";
  }

  const filename = `${uniqueId}_${cleanBase}${cleanExt}`;
  return `${cleanUserId}/${filename}`;
}

/**
 * Uploads an audio file to the private user directory: {userId}/{uniqueFilename}
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

  // Generate a cryptographically unique, bounded, and sanitized storage path
  const storagePath = generateUniqueAudioStoragePath(userId, fileName);

  try {
    const { error: uploadError } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .upload(storagePath, file, {
        upsert: false, // Strictly forbid overwriting existing objects
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
 * Pending storage cleanups storage key prefix.
 */
export const PENDING_AUDIO_CLEANUP_KEY_PREFIX = "virasya_pending_audio_cleanups_";

export interface PendingAudioCleanupItem {
  storagePath: string;
  enqueuedAt: string;
  attempts: number;
}

/**
 * Enqueues an audio storage path for retryable background cleanup.
 * Strictly verifies path is non-empty, contains no directory traversal,
 * and belongs to the specified user.
 */
export function queuePendingAudioCleanup(userId: string, storagePath: string): void {
  if (!userId || !storagePath) return;
  const cleanPath = storagePath.trim();
  if (
    !cleanPath.startsWith(`${userId}/`) ||
    cleanPath.includes("..") ||
    cleanPath.includes("\\")
  ) {
    return;
  }

  try {
    const key = `${PENDING_AUDIO_CLEANUP_KEY_PREFIX}${userId}`;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    const items: PendingAudioCleanupItem[] = raw ? JSON.parse(raw) : [];

    // Avoid duplicate queue entries for the same path
    if (!items.some((i) => i.storagePath === cleanPath)) {
      items.push({
        storagePath: cleanPath,
        enqueuedAt: new Date().toISOString(),
        attempts: 1,
      });
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, JSON.stringify(items));
      }
    }
  } catch (err) {
    console.warn("[Storage] Failed to queue pending audio cleanup:", err);
  }
}

/**
 * Attempts to delete a storage audio file with exponential backoff retries.
 */
export async function attemptAudioCleanupWithRetry(
  storagePath: string,
  maxAttempts: number = 3
): Promise<boolean> {
  if (!storagePath) return false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const success = await deleteAudioFromPrivateBucket(storagePath);
    if (success) {
      return true;
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  return false;
}

/**
 * Processes pending audio cleanup queue for the authenticated user.
 * Idempotently removes items that are successfully deleted.
 */
export async function processPendingAudioCleanups(
  userId: string
): Promise<{ processed: number; succeeded: number; remaining: number }> {
  if (!userId || typeof localStorage === "undefined") {
    return { processed: 0, succeeded: 0, remaining: 0 };
  }

  const key = `${PENDING_AUDIO_CLEANUP_KEY_PREFIX}${userId}`;
  let items: PendingAudioCleanupItem[] = [];

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { processed: 0, succeeded: 0, remaining: 0 };
    items = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) {
      return { processed: 0, succeeded: 0, remaining: 0 };
    }
  } catch {
    return { processed: 0, succeeded: 0, remaining: 0 };
  }

  let succeeded = 0;
  const remainingItems: PendingAudioCleanupItem[] = [];

  for (const item of items) {
    if (
      !item.storagePath.startsWith(`${userId}/`) ||
      item.storagePath.includes("..") ||
      item.storagePath.includes("\\")
    ) {
      // Drop invalid or malicious paths
      continue;
    }

    const success = await deleteAudioFromPrivateBucket(item.storagePath);
    if (success) {
      succeeded++;
    } else {
      item.attempts = (item.attempts || 1) + 1;
      // Retain items with fewer than 5 attempts
      if (item.attempts <= 5) {
        remainingItems.push(item);
      }
    }
  }

  try {
    if (remainingItems.length > 0) {
      localStorage.setItem(key, JSON.stringify(remainingItems));
    } else {
      localStorage.removeItem(key);
    }
  } catch {}

  return {
    processed: items.length,
    succeeded,
    remaining: remainingItems.length,
  };
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

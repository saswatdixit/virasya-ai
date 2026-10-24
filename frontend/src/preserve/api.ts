/**
 * Virasya Preservation Workbench API Client
 * Connects frontend to the Virasya AI backend or operates in preview mode.
 */

import { SAMPLE_EXPLORE_STORIES } from "../explore/sampleStories";
import {
  getSupabase,
  isSupabaseConfigured,
  fetchExploreStoriesFromSupabase,
  fetchExploreStoryDetailFromSupabase,
} from "../supabase";

export interface StoryPayload {
  id?: string;
  title?: string;
  carrier?: string;
  relationship?: string;
  roots?: string;
  place?: string;
  category?: string;
  language?: string;
  period?: string;
  email?: string;
  writtenText?: string;
  final_text?: string;
  story?: string;
  provenance_id?: string;
  provenance_hash?: string;
  preserved_at?: string;
  audio?: {
    filename: string;
    url?: string;
    size?: number | null;
    duration?: number | null;
    kind: string;
    storage_path?: string;
    bucket?: string;
  } | null;
  workingDraft?: string;
  vocabulary?: Array<{
    id?: string;
    preferred: string;
    heard?: string;
    meaning?: string;
    context?: string;
    language?: string;
    kind?: string;
  }>;
  punctuation?: {
    finalText?: string;
    marksCount?: number;
    wordIntegrityPassed?: boolean;
  };
  finalSettings?: {
    visibility?: string;
    confirmed?: boolean;
    permissionConfirmed?: boolean;
    provenance_id?: string;
    provenance_hash?: string;
    preserved_at?: string;
    [key: string]: any;
  };
  status?: "draft" | "preserved";
  updated_at?: string;
  created_at?: string;
}

export interface PreserveResponse {
  status: "success";
  story: StoryPayload;
  preserved_at: string;
  provenance_id: string;
  provenance_hash: string;
}

export interface AudioUploadResponse {
  status: "success";
  filename: string;
  url: string;
  size: number;
}

export interface VocabularyWordItem {
  preferred: string;
  heard?: string;
  meaning?: string;
  context?: string;
  language?: string;
  kind?: string;
}

// Configurable API Base URL from Vite environment variables
const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");

function isLocalhostUrl(url: string): boolean {
  if (!url) return false;
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url);
}

export function isLocalDev(): boolean {
  return Boolean(import.meta.env.DEV);
}

/**
 * Indicates whether a backend endpoint is explicitly configured or available via local dev proxy.
 * - In local development (npm run dev): always true (uses Vite proxy /api -> http://127.0.0.1:5000).
 * - In production: true ONLY if VITE_API_BASE_URL is explicitly set to a valid non-localhost remote URL.
 * In production preview mode without a remote backend, this strictly evaluates to false.
 */
export function isBackendConfigured(): boolean {
  if (isLocalDev()) {
    return true;
  }
  // In production, reject empty or localhost/127.0.0.1 URLs
  if (RAW_API_BASE.length > 0 && !isLocalhostUrl(RAW_API_BASE)) {
    return true;
  }
  return false;
}

export function getApiBase(): string {
  if (isLocalDev()) {
    return RAW_API_BASE || "";
  }
  // In production, never return a localhost URL
  if (RAW_API_BASE.length > 0 && !isLocalhostUrl(RAW_API_BASE)) {
    return RAW_API_BASE;
  }
  return "";
}

/**
 * Resolves an API endpoint against the configured backend base URL.
 * In production, throws a clear Configuration Error if VITE_API_BASE_URL is missing,
 * preventing silent fallback to relative /api on Vercel.
 * In local development, returns relative /api path (proxied by Vite dev server to 127.0.0.1:5000).
 */
export function resolveApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (isLocalDev()) {
    return `${RAW_API_BASE || ""}${cleanPath}`;
  }
  if (!isBackendConfigured()) {
    throw new Error(
      `Configuration Error: Cannot route '${cleanPath}'. VITE_API_BASE_URL is missing in this production deployment. Set VITE_API_BASE_URL in your hosting environment settings.`
    );
  }
  return `${getApiBase()}${cleanPath}`;
}

/**
 * Safely retrieves current Supabase session access token for protected ASR backend calls.
 * Never throws, never logs tokens, and handles missing or expired sessions gracefully.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = getSupabase();
    if (!supabase) return {};
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) return {};
    return {
      Authorization: `Bearer ${data.session.access_token}`,
    };
  } catch {
    return {};
  }
}

/**
 * Fetches an authenticated audio file using the user's Bearer token and returns an ephemeral Blob URL.
 * Automatically eliminates query-string tokens from media URLs and prevents browser history leaks.
 */
export async function fetchAuthenticatedAudioBlob(audioUrl: string): Promise<string> {
  if (!audioUrl) throw new Error("No audio URL provided");
  if (audioUrl.startsWith("blob:") || audioUrl.startsWith("data:")) {
    return audioUrl;
  }

  if (!audioUrl.startsWith("http://") && !audioUrl.startsWith("https://")) {
    if (!isBackendConfigured()) {
      throw new Error(
        "Configuration Error: VITE_API_BASE_URL is missing in this production environment. Cannot fetch audio recording from relative path."
      );
    }
  }

  const base = getApiBase();
  const targetUrl = audioUrl.startsWith("http://") || audioUrl.startsWith("https://")
    ? audioUrl
    : `${base}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;

  const authHeaders = await getAuthHeaders();
  const res = await fetch(targetUrl, {
    method: "GET",
    headers: { ...authHeaders },
  });

  if (res.status === 401) {
    throw new Error("Authentication required to access this recording.");
  }
  if (res.status === 404) {
    throw new Error("Audio recording not found or unauthorized.");
  }
  if (!res.ok) {
    throw new Error(`Failed to load audio (${res.status})`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function saveStoryToBackend(story: StoryPayload): Promise<{ status: string; story: StoryPayload }> {
  if (!isBackendConfigured()) {
    return { status: "preview_local", story };
  }

  const base = getApiBase();
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${base}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(story),
  });
  if (res.status === 401) {
    throw new Error("Authentication required. Please sign in to save your story.");
  }
  if (!res.ok) {
    throw new Error(`Failed to save story: ${res.statusText}`);
  }
  return res.json();
}

export async function getStoryFromBackend(storyId: string): Promise<StoryPayload> {
  if (!isBackendConfigured()) {
    throw new Error(
      isLocalDev()
        ? "Backend not configured. Story cannot be retrieved from remote server."
        : "Configuration Error: VITE_API_BASE_URL is missing in this production environment. Cannot retrieve story from remote server."
    );
  }
  const base = getApiBase();
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${base}/api/stories/${encodeURIComponent(storyId)}`, {
    headers: { ...authHeaders },
  });
  if (res.status === 401) {
    throw new Error("Authentication required. Please sign in to view this story.");
  }
  if (!res.ok) {
    throw new Error(`Failed to get story: ${res.statusText}`);
  }
  return res.json();
}

export async function listStoriesFromBackend(): Promise<StoryPayload[]> {
  if (!isBackendConfigured()) {
    return [];
  }
  const base = getApiBase();
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${base}/api/stories`, {
    headers: { ...authHeaders },
  });
  if (res.status === 401) {
    throw new Error("Authentication required. Please sign in to list your stories.");
  }
  if (!res.ok) {
    throw new Error(`Failed to list stories: ${res.statusText}`);
  }
  return res.json();
}

export async function preserveStoryOnBackend(storyId: string, payload: Partial<StoryPayload>): Promise<PreserveResponse> {
  if (!isBackendConfigured()) {
    throw new Error(
      isLocalDev()
        ? "Permanent sovereign preservation requires the Virasya AI backend server. Running in preview mode."
        : "Configuration Error: VITE_API_BASE_URL is missing in this production environment. Sovereign preservation cannot be routed to relative /api."
    );
  }
  const base = getApiBase();
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${base}/api/stories/${encodeURIComponent(storyId)}/preserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    throw new Error("Authentication required. Please sign in to preserve this story.");
  }
  if (!res.ok) {
    throw new Error(`Failed to preserve story: ${res.statusText}`);
  }
  return res.json();
}

export async function uploadAudioToBackend(file: File): Promise<AudioUploadResponse> {
  if (!isBackendConfigured()) {
    throw new Error(
      isLocalDev()
        ? "Backend audio storage is not connected in this frontend preview. Audio can still be recorded or played back locally in your browser."
        : "Configuration Error: VITE_API_BASE_URL is missing in this production environment. Audio upload cannot be routed to relative /api."
    );
  }

  const base = getApiBase();
  const authHeaders = await getAuthHeaders();
  const formData = new FormData();
  formData.append("file", file, file.name);

  let res: Response;
  try {
    res = await fetch(`${base}/api/upload`, {
      method: "POST",
      headers: { ...authHeaders },
      body: formData,
    });
  } catch (networkErr: any) {
    console.error("Network error during audio upload:", networkErr);
    throw new Error(
      "Unable to connect to the Virasya AI backend. Please verify your backend server is active."
    );
  }

  if (res.status === 401) {
    throw new Error("Authentication required. Please sign in to upload audio recordings.");
  }

  if (!res.ok) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch {
      // Body wasn't JSON
    }

    if (errorData.error) {
      throw new Error(errorData.error);
    }

    if (res.status === 413) {
      throw new Error("File is too large. The maximum supported audio file size is 50 MB.");
    }
    if (res.status === 400) {
      throw new Error("Invalid audio file or empty file received. Please provide a valid audio recording.");
    }
    if (res.status === 502 || res.status === 504) {
      throw new Error(
        `Backend service unavailable (HTTP ${res.status}). Please check that the Virasya AI backend is running.`
      );
    }
    if (res.status === 500) {
      throw new Error("A server error occurred while saving the audio file. Please try again.");
    }

    throw new Error(`Upload failed with status ${res.status}: ${res.statusText || "Unknown error"}`);
  }

  return res.json();
}

export async function saveVocabularyToBackend(words: VocabularyWordItem[]): Promise<{ status: string; count: number; entries: any[] }> {
  if (!isBackendConfigured()) {
    return { status: "preview_local", count: words.length, entries: words };
  }
  const base = getApiBase();
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${base}/api/vocabulary`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ words }),
  });
  if (res.status === 401) {
    throw new Error("Authentication required. Please sign in to update vocabulary.");
  }
  if (!res.ok) {
    throw new Error(`Failed to save vocabulary: ${res.statusText}`);
  }
  return res.json();
}

export async function getVocabularyFromBackend(): Promise<any[]> {
  if (!isBackendConfigured()) {
    return [];
  }
  const base = getApiBase();
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${base}/api/vocabulary`, {
    headers: { ...authHeaders },
  });
  if (res.status === 401) {
    throw new Error("Authentication required. Please sign in to view vocabulary.");
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch vocabulary: ${res.statusText}`);
  }
  return res.json();
}

export interface TranscribeResultItem {
  status: "done" | "error";
  text: string;
  model: string;
  provider: string;
  inference_seconds?: number;
  duration_seconds?: number;
  error?: string | null;
}

export interface TranscribeResponse {
  status: "success";
  filename: string;
  provider?: string;
  model?: string;
  transcript?: string;
  raw_text?: string;
  inference_seconds?: number;
  language?: string;
  language_code?: string;
  requested_language?: string;
  provider_language?: string;
  metadata?: Record<string, any>;
  results: {
    gnani?: TranscribeResultItem;
    vaani?: TranscribeResultItem;
    indicconformer?: TranscribeResultItem;
  };
  gnani?: string;
  vaani?: string;
  indic?: string;
  gnani_info?: TranscribeResultItem;
  vaani_info?: TranscribeResultItem;
  indic_info?: TranscribeResultItem;
}

export async function fetchModelStatus(): Promise<{
  gnani?: { status: string; error?: string | null; model: string };
  vaani: { status: string; error?: string | null; model: string };
  indicconformer: { status: string; error?: string | null; model: string };
  busy: boolean;
}> {
  if (!isBackendConfigured()) {
    return {
      gnani: { status: "preview", error: null, model: "Gnani Prisma STT v2.5 (Preview)" },
      vaani: { status: "preview", error: null, model: "Gnani Prisma STT v2.5 (Preview)" },
      indicconformer: { status: "offline", error: null, model: "AI4Bharat IndicConformer (Offline)" },
      busy: false,
    };
  }

  const base = getApiBase();
  const res = await fetch(`${base}/api/models/status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch model status: ${res.statusText}`);
  }
  return res.json();
}

export interface BackendHealthResponse {
  status: "healthy";
  service: string;
  timestamp: string;
  models: {
    gnani?: { status: string; error?: string | null; model: string };
    vaani: { status: string; error?: string | null; model: string };
    indicconformer: { status: string; error?: string | null; model: string };
    busy: boolean;
  };
}

export async function checkBackendHealth(): Promise<{
  online: boolean;
  configured: boolean;
  data?: BackendHealthResponse;
  error?: string;
}> {
  if (!isBackendConfigured()) {
    return {
      online: false,
      configured: false,
      error: isLocalDev()
        ? "Frontend preview mode: Local backend AI models are not connected."
        : "Configuration Error: VITE_API_BASE_URL is missing in this production deployment. Python backend API requests cannot be routed to relative /api.",
    };
  }

  const base = getApiBase();
  try {
    const res = await fetch(`${base}/api/health`, { method: "GET" });
    if (!res.ok) {
      return { online: false, configured: true, error: `Backend responded with HTTP ${res.status}` };
    }
    const data = await res.json();
    return { online: true, configured: true, data };
  } catch (err: any) {
    return { online: false, configured: true, error: err.message || "Failed to reach backend" };
  }
}

export interface PunctuateResponse {
  status: "success" | "error" | "manual_only";
  supported: boolean;
  model?: string;
  original_text?: string;
  punctuated_text: string;
  error?: string;
  message?: string;
}

export async function punctuateTextOnBackend(text: string, taskPath?: string): Promise<PunctuateResponse> {
  if (!isBackendConfigured()) {
    return {
      status: "manual_only",
      supported: false,
      punctuated_text: text,
      message:
        "The mmBERT punctuation model requires the Virasya AI backend. In preview mode, use the quick-insert marks to punctuate your text manually.",
    };
  }

  const base = getApiBase();
  const authHeaders = await getAuthHeaders();
  try {
    const res = await fetch(`${base}/api/punctuate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ text, task_path: taskPath }),
    });
    if (res.status === 401) {
      return {
        status: "error",
        supported: false,
        error: "Authentication required to use the punctuation restoration service.",
        punctuated_text: text,
      };
    }
    if (!res.ok) {
      return {
        status: "error",
        supported: false,
        error: `Punctuation service returned HTTP ${res.status}`,
        punctuated_text: text,
      };
    }
    return res.json();
  } catch (err: any) {
    return {
      status: "error",
      supported: false,
      error: err.message || "Punctuation backend unreachable",
      punctuated_text: text,
    };
  }
}

export async function checkPunctuationCapability(text?: string): Promise<{
  status: "manual_only" | "supported" | "success" | "error";
  supported: boolean;
  message?: string;
  punctuated_text?: string;
}> {
  return punctuateTextOnBackend(text || "");
}

export async function transcribeAudioOnBackend(
  filename: string,
  language: string = "hi-IN",
  storyId?: string,
  signal?: AbortSignal
): Promise<TranscribeResponse> {
  if (!isBackendConfigured()) {
    throw new Error(
      isLocalDev()
        ? "Speech-to-text transcription with Gnani Prisma requires the Virasya AI backend. You can load a sample transcript to preview the review workflow."
        : "Configuration Error: VITE_API_BASE_URL is missing in this production deployment. Speech-to-text transcription cannot be routed to relative /api."
    );
  }

  const base = getApiBase();
  const authHeaders = await getAuthHeaders();
  let res: Response;
  try {
    res = await fetch(`${base}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        filename,
        language,
        language_code: language,
        story_id: storyId,
      }),
      signal,
    });
  } catch (networkErr: any) {
    if (networkErr.name === "AbortError") throw networkErr;
    console.error("Network error during transcription:", networkErr);
    throw new Error(
      "Unable to connect to the local Virasya AI backend. Please ensure the backend server is running on port 5000."
    );
  }

  if (res.status === 401) {
    throw new Error("Authentication required. Please sign in to perform speech transcription.");
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    if (errorData.error) throw new Error(errorData.error);
    if (res.status === 422) {
      throw new Error(errorData.error || "The selected language is not supported by Gnani Prisma STT.");
    }
    if (res.status === 502 || res.status === 504) {
      throw new Error(`Backend service unavailable (HTTP ${res.status}). Please ensure the local backend is running.`);
    }
    throw new Error(`Transcription failed with status ${res.status}`);
  }
  return res.json();
}

export interface ExploreStoryCard {
  id: string;
  title: string;
  carrier: string;
  category: string;
  place: string;
  roots?: string;
  language: string;
  period: string;
  relationship: string;
  excerpt: string;
  word_count: number;
  preserved_at: string;
  provenance_id: string;
  vocabulary_count: number;
  has_audio?: boolean;
  is_preview?: boolean;
  vocabulary: Array<{
    preferred: string;
    heard?: string;
    meaning: string;
    language: string;
    context: string;
    pronunciation?: string;
  }>;
}

export interface ExploreDetailStory extends ExploreStoryCard {
  final_text: string;
  audio?: {
    filename: string;
    url?: string;
    duration?: number | null;
    size?: number | null;
    kind?: string;
    storage_path?: string;
    bucket?: string;
  } | null;
  raw_transcripts?: {
    vaani?: {
      text?: string;
      model?: string;
      status?: string;
    };
    indicconformer?: {
      text?: string;
      model?: string;
      status?: string;
    };
  };
}

export interface ExploreFeedResponse {
  status: "success";
  count: number;
  stories: ExploreStoryCard[];
}

export async function fetchExploreFeed(filters?: {
  search?: string;
  q?: string;
  category?: string;
  language?: string;
  place?: string;
}): Promise<ExploreFeedResponse> {
  // The public explore feed queries ONLY preserved public stories from Supabase.
  // It never falls back to local backend JSON drafts or test fixture files.
  if (!isSupabaseConfigured()) {
    return {
      status: "success",
      count: 0,
      stories: [],
    };
  }

  try {
    const supabaseResult = await fetchExploreStoriesFromSupabase(filters);
    return {
      status: "success",
      count: supabaseResult.count,
      stories: supabaseResult.stories,
    };
  } catch (supabaseErr: any) {
    console.error("[Explore] Supabase query failed:", supabaseErr?.message);
    throw new Error(
      `Failed to load stories from archive: ${supabaseErr?.message || "Remote database error"}`
    );
  }
}

export async function fetchExploreStoryDetail(storyId: string): Promise<{ status: "success"; story: ExploreDetailStory }> {
  // Check authorized sample preview stories first (for offline preview demo)
  const sample = SAMPLE_EXPLORE_STORIES.find((s) => s.id === storyId);
  if (sample) {
    return { status: "success", story: sample };
  }

  // Check Supabase public stories
  if (isSupabaseConfigured()) {
    try {
      const supabaseDetail = await fetchExploreStoryDetailFromSupabase(storyId);
      if (supabaseDetail) {
        return { status: "success", story: supabaseDetail };
      }
    } catch (err: any) {
      console.warn("[Explore] Supabase story detail error:", err?.message);
    }
  }

  throw new Error("Story record is not available in the public archive.");
}

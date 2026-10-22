/**
 * Virasya Preservation Workbench API Client
 * Connects frontend to the Virasya AI backend or operates in preview mode.
 */

import { SAMPLE_EXPLORE_STORIES } from "../explore/sampleStories";

export interface StoryPayload {
  id?: string;
  title?: string;
  carrier?: string;
  relationship?: string;
  roots?: string;
  category?: string;
  language?: string;
  period?: string;
  email?: string;
  writtenText?: string;
  audio?: {
    filename: string;
    url?: string;
    size?: number | null;
    duration?: number | null;
    kind: string;
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

export async function saveStoryToBackend(story: StoryPayload): Promise<{ status: string; story: StoryPayload }> {
  if (!isBackendConfigured()) {
    return { status: "preview_local", story };
  }

  const base = getApiBase();
  const res = await fetch(`${base}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(story),
  });
  if (!res.ok) {
    throw new Error(`Failed to save story: ${res.statusText}`);
  }
  return res.json();
}

export async function getStoryFromBackend(storyId: string): Promise<StoryPayload> {
  if (!isBackendConfigured()) {
    throw new Error("Backend not configured. Story cannot be retrieved from remote server.");
  }
  const base = getApiBase();
  const res = await fetch(`${base}/api/stories/${encodeURIComponent(storyId)}`);
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
  const res = await fetch(`${base}/api/stories`);
  if (!res.ok) {
    throw new Error(`Failed to list stories: ${res.statusText}`);
  }
  return res.json();
}

export async function preserveStoryOnBackend(storyId: string, payload: Partial<StoryPayload>): Promise<PreserveResponse> {
  if (!isBackendConfigured()) {
    throw new Error("Permanent sovereign preservation requires the Virasya AI backend server. Running in preview mode.");
  }
  const base = getApiBase();
  const res = await fetch(`${base}/api/stories/${encodeURIComponent(storyId)}/preserve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to preserve story: ${res.statusText}`);
  }
  return res.json();
}

export async function uploadAudioToBackend(file: File): Promise<AudioUploadResponse> {
  if (!isBackendConfigured()) {
    throw new Error(
      "Backend audio storage is not connected in this frontend preview. Audio can still be recorded or played back locally in your browser."
    );
  }

  const base = getApiBase();
  const formData = new FormData();
  formData.append("file", file, file.name);

  let res: Response;
  try {
    res = await fetch(`${base}/api/upload`, {
      method: "POST",
      body: formData,
    });
  } catch (networkErr: any) {
    console.error("Network error during audio upload:", networkErr);
    throw new Error(
      "Unable to connect to the Virasya AI backend. Please verify your backend server is active."
    );
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
  const res = await fetch(`${base}/api/vocabulary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words }),
  });
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
  const res = await fetch(`${base}/api/vocabulary`);
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
  results: {
    vaani?: TranscribeResultItem;
    indicconformer?: TranscribeResultItem;
  };
  vaani?: string;
  indic?: string;
  vaani_info?: TranscribeResultItem;
  indic_info?: TranscribeResultItem;
}

export async function fetchModelStatus(): Promise<{
  vaani: { status: string; error?: string | null; model: string };
  indicconformer: { status: string; error?: string | null; model: string };
  busy: boolean;
}> {
  if (!isBackendConfigured()) {
    return {
      vaani: { status: "preview", error: null, model: "Vaani FastConformer (Local AI)" },
      indicconformer: { status: "preview", error: null, model: "AI4Bharat IndicConformer (Local AI)" },
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
      error: "Frontend preview mode: Backend AI models are not connected.",
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
  try {
    const res = await fetch(`${base}/api/punctuate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, task_path: taskPath }),
    });
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
  model: "both" | "vaani" | "indicconformer" = "both",
  storyId?: string,
  signal?: AbortSignal
): Promise<TranscribeResponse> {
  if (!isBackendConfigured()) {
    throw new Error(
      "Speech-to-text models (Vaani & IndicConformer) require the Virasya AI backend. You can load a sample Odia transcript to preview the review workflow."
    );
  }

  const base = getApiBase();
  let res: Response;
  try {
    res = await fetch(`${base}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, model, story_id: storyId }),
      signal,
    });
  } catch (networkErr: any) {
    if (networkErr.name === "AbortError") throw networkErr;
    console.error("Network error during transcription:", networkErr);
    throw new Error(
      "Unable to connect to the local Virasya AI backend. Please ensure the backend server is running on port 5000."
    );
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    if (errorData.error) throw new Error(errorData.error);
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
    duration?: number;
    size?: number;
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
  if (!isBackendConfigured()) {
    // Return honest count of 0 public stories preserved when backend is unconfigured
    return {
      status: "success",
      count: 0,
      stories: [],
    };
  }

  const base = getApiBase();
  const params = new URLSearchParams();
  const searchTerm = filters?.search || filters?.q;
  if (searchTerm) params.set("search", searchTerm);
  if (filters?.category && filters.category !== "All") params.set("category", filters.category);
  if (filters?.language && filters.language !== "All") params.set("language", filters.language);
  if (filters?.place) params.set("place", filters.place);

  const query = params.toString() ? `?${params.toString()}` : "";
  try {
    const res = await fetch(`${base}/api/explore${query}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch explore feed: ${res.statusText}`);
    }
    return res.json();
  } catch (err: any) {
    console.warn("Backend explore feed unreachable:", err.message);
    return {
      status: "success",
      count: 0,
      stories: [],
    };
  }
}

export async function fetchExploreStoryDetail(storyId: string): Promise<{ status: "success"; story: ExploreDetailStory }> {
  // Check authorized sample preview stories first
  const sample = SAMPLE_EXPLORE_STORIES.find((s) => s.id === storyId);
  if (sample) {
    return { status: "success", story: sample };
  }

  if (!isBackendConfigured()) {
    throw new Error("Story record is not available in offline preview mode.");
  }

  const base = getApiBase();
  const res = await fetch(`${base}/api/explore/${encodeURIComponent(storyId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Story not available: ${res.statusText}`);
  }
  return res.json();
}

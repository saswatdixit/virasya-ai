/**
 * Virasya Server-Side Audio Transcription Edge Function
 *
 * Secure proxy to Gnani.ai Prisma STT v2.5 REST API (https://api.vachana.ai/stt/v3).
 *
 * Security & Archival Invariants:
 * 1. Strict JWT Authentication: Requires a valid Bearer token from an authenticated user.
 * 2. Identity Derivation: Storyteller `user_id` is derived server-side via Supabase Auth;
 *    any client-supplied user ID is ignored.
 * 3. Canonical Storage Path: Accepts only storage paths within `story-recordings-private`.
 * 4. Ownership Verification: Enforces that `storage_path` strictly begins with `${user.id}/`,
 *    preventing cross-user access or directory traversal attacks.
 * 5. Audio Container & Duration Validation: Downloads the audio buffer and validates format,
 *    size (<= 5 MiB), and duration (<= 60.0s) at the server boundary using `validateAudioBuffer`.
 * 6. Secret Protection: `GNANI_API_KEY` is retrieved from server-side environment secrets.
 *    Secrets, tokens, and raw audio are never exposed in error responses or logs.
 * 7. Native Fetch & FormData: Native Web API `FormData` is used without manual boundary headers.
 * 8. Standardized Output: Returns a stable TranscribeResponse compatible with the Virasya frontend.
 */

// Setup type definitions for Supabase Edge Runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validateAudioBuffer } from "../preserve-story/audio-validator.ts";

const STORAGE_BUCKET = "story-recordings-private";
const GNANI_STT_ENDPOINT = "https://api.vachana.ai/stt/v3";
const GNANI_TIMEOUT_MS = 45000; // 45 seconds timeout

const ALLOWED_ORIGINS = [
  "https://virasya-ai-gnani.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

interface TranscribeRequestBody {
  storage_path?: string;
  storagePath?: string;
  filename?: string;
  language?: string;
  language_code?: string;
  story_id?: string;
  storyId?: string;
  format?: string;
  transcription_style?: string;
  transcriptionStyle?: string;
}

// Supported Indic languages for Gnani Prisma STT
const SUPPORTED_LANGUAGE_CODES: Record<string, string> = {
  "hi-in": "hi-IN",
  "hindi": "hi-IN",
  "bn-in": "bn-IN",
  "bengali": "bn-IN",
  "gu-in": "gu-IN",
  "gujarati": "gu-IN",
  "kn-in": "kn-IN",
  "kannada": "kn-IN",
  "ml-in": "ml-IN",
  "malayalam": "ml-IN",
  "mr-in": "mr-IN",
  "marathi": "mr-IN",
  "pa-in": "pa-IN",
  "punjabi": "pa-IN",
  "ta-in": "ta-IN",
  "tamil": "ta-IN",
  "te-in": "te-IN",
  "telugu": "te-IN",
  "en-in": "en-IN",
  "english": "en-IN",
  "or-in": "hi-IN", // Odia mapped to Indic model fallback
  "odia": "hi-IN",
};

function normalizeLanguageCode(raw?: string): string {
  if (!raw || typeof raw !== "string") return "hi-IN";
  const clean = raw.trim().toLowerCase();
  return SUPPORTED_LANGUAGE_CODES[clean] || "hi-IN";
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // 1. Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: `Method ${req.method} not allowed. Transcription requires POST.` }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error("Missing Supabase Edge Function environment variables.");
      return new Response(
        JSON.stringify({ error: "Server configuration error: missing archival platform credentials." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Strict Authentication: Verify Supabase JWT access token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({
          error: "Authentication required. Please sign in to transcribe audio recordings.",
          code: "AUTH_REQUIRED",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "Invalid or expired session. Please sign in again.",
          code: "UNAUTHORIZED",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse JSON request body
    let body: TranscribeRequestBody = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body.", code: "INVALID_JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawPath = String(body.storage_path || body.storagePath || "").trim();
    if (!rawPath) {
      return new Response(
        JSON.stringify({
          error: "storage_path is required. Audio must be uploaded to private storage before transcribing.",
          code: "MISSING_STORAGE_PATH",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Validate canonical storage path and enforce ownership
    const cleanPath = rawPath.replace(/^[/\\]+/, "");
    if (cleanPath.includes("..") || cleanPath.includes("\\")) {
      return new Response(
        JSON.stringify({ error: "Invalid or unsafe storage path.", code: "INVALID_PATH" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pathSegments = cleanPath.split("/");
    if (pathSegments.length < 2 || pathSegments[0] !== user.id) {
      return new Response(
        JSON.stringify({
          error: "Access denied. You can only transcribe audio recordings stored in your own archive vault.",
          code: "FORBIDDEN",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const filename = pathSegments[pathSegments.length - 1];

    // 5. Download audio recording using service_role
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: audioBlob, error: downloadError } = await adminClient.storage
      .from(STORAGE_BUCKET)
      .download(cleanPath);

    if (downloadError || !audioBlob) {
      return new Response(
        JSON.stringify({
          error: "Audio recording not found in private storage archive.",
          code: "AUDIO_NOT_FOUND",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Server-Side Audio Format and Duration Validation
    const audioBuffer = new Uint8Array(await audioBlob.arrayBuffer());
    const ext = "." + (filename.split(".").pop()?.toLowerCase() || "wav");
    const validation = validateAudioBuffer(audioBuffer, ext);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          error: validation.error || "Audio validation failed at server boundary.",
          code: validation.code || "AUDIO_VALIDATION_FAILED",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Atomic Rate Limiting & Quota Consumption (VIR-SEC-004)
    // Enforces maximum 10 transcription requests per 10 minutes per authenticated user.
    // Serialized with PostgreSQL transactional advisory lock to prevent race conditions.
    const maxRequests = 10;
    const windowSeconds = 600;
    try {
      const { data: quotaResult, error: quotaError } = await adminClient.rpc(
        "check_and_consume_transcription_quota",
        {
          p_user_id: user.id,
          p_max_requests: maxRequests,
          p_window_seconds: windowSeconds,
        }
      );

      if (quotaError) {
        console.warn("[Quota] Rate limit check notice:", quotaError.message);
      } else if (quotaResult && quotaResult.allowed === false) {
        return new Response(
          JSON.stringify({
            error: `Transcription rate limit exceeded. You have reached the limit of ${maxRequests} requests per ${windowSeconds / 60} minutes. Please try again later.`,
            code: "RATE_LIMIT_EXCEEDED",
            current_count: quotaResult.current_count,
            max_limit: quotaResult.max_limit,
            retry_after: windowSeconds,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(windowSeconds),
            },
          }
        );
      }
    } catch (quotaErr) {
      console.warn("[Quota] Rate limit RPC exception:", quotaErr);
    }

    // 8. Verify GNANI_API_KEY secret
    const gnaniApiKey = Deno.env.get("GNANI_API_KEY");
    if (!gnaniApiKey) {
      return new Response(
        JSON.stringify({
          error: "Speech-to-text service is not configured. Missing GNANI_API_KEY secret.",
          code: "PROVIDER_KEY_MISSING",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Build native FormData for Gnani Prisma STT v2.5
    const targetLanguageCode = normalizeLanguageCode(body.language_code || body.language);
    const requestedFormat = (body.format || body.transcription_style || body.transcriptionStyle)?.toLowerCase() === "transcribe"
      ? "transcribe"
      : "verbatim";
    const formData = new FormData();
    formData.append("language_code", targetLanguageCode);
    formData.append("format", requestedFormat);

    let mimeType = "audio/wav";
    if (validation.format === "webm") mimeType = "audio/webm";
    else if (validation.format === "ogg") mimeType = "audio/ogg";
    else if (validation.format === "mp3") mimeType = "audio/mpeg";
    else if (validation.format === "flac") mimeType = "audio/flac";
    else if (validation.format === "m4a") mimeType = "audio/mp4";

    const filePayload = new Blob([audioBuffer], { type: mimeType });
    formData.append("audio_file", filePayload, filename);

    // 9. Forward audio to Gnani with timeout guard
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GNANI_TIMEOUT_MS);

    const t0 = performance.now();
    let gnaniRes: Response;
    try {
      gnaniRes = await fetch(GNANI_STT_ENDPOINT, {
        method: "POST",
        headers: {
          "X-API-Key-ID": gnaniApiKey,
          // NOTE: Do NOT set Content-Type header; fetch automatically calculates the boundary
        },
        body: formData,
        signal: controller.signal,
      });
    } catch (networkErr: any) {
      if (networkErr.name === "AbortError") {
        return new Response(
          JSON.stringify({
            error: "Gnani transcription request timed out after 45 seconds.",
            code: "PROVIDER_TIMEOUT",
          }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          error: "Unable to reach Gnani speech-to-text provider.",
          code: "PROVIDER_UNREACHABLE",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const elapsedSeconds = Math.round((performance.now() - t0) / 10) / 100;

    // 10. Parse and validate Gnani response
    if (!gnaniRes.ok) {
      let providerErr = "";
      try {
        const errJson = await gnaniRes.json();
        providerErr = errJson.message || errJson.error || "";
      } catch {
        providerErr = await gnaniRes.text().catch(() => "");
      }
      return new Response(
        JSON.stringify({
          error: providerErr || `Gnani STT returned HTTP ${gnaniRes.status}`,
          code: "PROVIDER_ERROR",
          status: gnaniRes.status,
        }),
        {
          status: gnaniRes.status >= 500 ? 502 : 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let providerData: any = {};
    try {
      providerData = await gnaniRes.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: "Invalid JSON response received from speech recognition provider.",
          code: "INVALID_PROVIDER_JSON",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!providerData || providerData.success !== true) {
      const msg = providerData?.message || providerData?.error || "Speech recognition did not succeed.";
      return new Response(
        JSON.stringify({ error: msg, code: "TRANSCRIPTION_FAILED" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 11. Extract transcript text safely
    const transcriptText = String(
      providerData.result?.transcript ||
        providerData.transcript ||
        providerData.text ||
        ""
    ).trim();

    // 12. Structure response matching TranscribeResponse expected by Virasya frontend
    const modelTranscriptItem = {
      status: "done",
      text: transcriptText,
      model: "Gnani Prisma STT v2.5",
      provider: "gnani-prisma-v2.5",
      inference_seconds: elapsedSeconds,
      duration_seconds: validation.durationSeconds,
      error: null,
    };

    const requestedLangName = body.language || (targetLanguageCode.startsWith("hi") ? "Hindi" : targetLanguageCode);

    return new Response(
      JSON.stringify({
        status: "success",
        filename,
        provider: "gnani-prisma-v2.5",
        model: "Gnani Prisma STT v2.5",
        format: requestedFormat,
        transcription_style: requestedFormat,
        transcript: transcriptText,
        raw_text: transcriptText,
        inference_seconds: elapsedSeconds,
        duration_seconds: validation.durationSeconds,
        language: requestedLangName,
        language_code: targetLanguageCode,
        requested_language: requestedLangName,
        provider_language: targetLanguageCode,
        results: {
          gnani: modelTranscriptItem,
          vaani: modelTranscriptItem,
        },
        gnani: transcriptText,
        vaani: transcriptText,
        gnani_info: modelTranscriptItem,
        vaani_info: modelTranscriptItem,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Unhandled error in transcribe-audio Edge Function:", err?.message);
    return new Response(
      JSON.stringify({
        error: "An unexpected server error occurred during audio transcription.",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

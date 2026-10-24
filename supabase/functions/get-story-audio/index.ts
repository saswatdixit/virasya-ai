/**
 * Virasya Server-Side Story Audio Playback Edge Function
 *
 * Provides authorized, short-lived signed playback URLs for cultural story recordings.
 *
 * Security & Access Control Invariants:
 * 1. Story Association: Resolves the canonical object path directly from the verified database record.
 *    Clients cannot pass arbitrary storage paths to be signed.
 * 2. Public Preserved Stories: Preserved public stories are eligible for authorized playback
 *    without exposing the private bucket or relaxing Row Level Security.
 * 3. Private Stories: Private or family stories require an authenticated caller matching the story author.
 * 4. Token TTL: Generates short-lived signed URLs (default 3600 seconds / 1 hour).
 * 5. Legacy Fallback: Safely parses older story records that stored full signed URLs into canonical paths.
 * 6. Never exposes service_role credentials to the client.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_STORAGE_BUCKET = "story-recordings-private";

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

interface AudioPlaybackRequest {
  story_id?: string;
  storyId?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // 1. Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: `Method ${req.method} not allowed. Playback ticket requires POST.` }),
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
        JSON.stringify({ error: "Server configuration error: missing archival database credentials." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request body
    let body: AudioPlaybackRequest = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body.", code: "INVALID_JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const storyId = String(body.story_id || body.storyId || "").trim();
    if (!storyId) {
      return new Response(
        JSON.stringify({ error: "story_id is required for audio playback.", code: "MISSING_STORY_ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Admin client to lookup story record
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: story, error: storyError } = await adminClient
      .from("stories")
      .select("id, user_id, status, visibility, audio, audio_public_playback")
      .eq("id", storyId)
      .maybeSingle();

    if (storyError) {
      console.error("Database lookup error:", storyError);
      return new Response(
        JSON.stringify({ error: `Database error: ${storyError.message}`, code: "DB_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!story) {
      return new Response(
        JSON.stringify({ error: `Story '${storyId}' not found in archive.`, code: "STORY_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Access Authorization Check
    // A story recording is eligible for public unauthenticated playback ONLY if:
    // 1. status is 'preserved'
    // 2. visibility is 'public'
    // 3. audio_public_playback is explicitly true (VIR-SEC-002)
    const isPublicPreserved =
      story.status === "preserved" && story.visibility === "public";
    const isPublicAudio =
      isPublicPreserved && Boolean(story.audio_public_playback);

    if (!isPublicAudio) {
      // For non-public recordings or when public audio consent is false,
      // caller must be the authenticated author of the story
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
        return new Response(
          JSON.stringify({
            error: "Authentication required to play private audio recordings.",
            code: "UNAUTHORIZED_PRIVATE_AUDIO",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });

      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({
            error: "Invalid or expired session token for private audio playback.",
            code: "INVALID_SESSION",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!story.user_id || story.user_id !== user.id) {
        return new Response(
          JSON.stringify({
            error: "Forbidden: You are not authorized to play this private recording.",
            code: "FORBIDDEN_AUDIO_ACCESS",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 5. Inspect and validate audio metadata
    const audio = story.audio;
    if (!audio || typeof audio !== "object") {
      return new Response(
        JSON.stringify({ error: `Story '${storyId}' does not contain an audio recording.`, code: "NO_AUDIO" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let storagePath = typeof audio.storage_path === "string" ? audio.storage_path.trim() : null;
    // Strict bucket restriction: playback tickets can only be generated for story-recordings-private
    const bucket = ALLOWED_STORAGE_BUCKET;
    if (audio.bucket && audio.bucket !== ALLOWED_STORAGE_BUCKET) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized storage bucket specified in recording metadata.",
          code: "INVALID_BUCKET",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Backward compatibility: If storage_path is not stored directly, extract from legacy signed URL
    if (!storagePath && audio.url && typeof audio.url === "string") {
      const match = audio.url.match(/story-recordings-private\/([^?]+)/);
      if (match) {
        storagePath = decodeURIComponent(match[1]);
      }
    }

    if (!storagePath) {
      return new Response(
        JSON.stringify({
          error: "Canonical storage path is unavailable for this recording.",
          code: "CANONICAL_PATH_MISSING",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Security path validation
    if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) {
      return new Response(
        JSON.stringify({ error: "Malformed storage path detected.", code: "MALFORMED_STORAGE_PATH" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ownership verification: Storage path must match verified story author ID
    if (!story.user_id || !storagePath.startsWith(`${story.user_id}/`)) {
      return new Response(
        JSON.stringify({
          error: "Storage path does not correspond to a verified story author.",
          code: "MISMATCHED_STORAGE_OWNER",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Generate fresh signed URL with 3600-second TTL
    const ttlSeconds = 3600;
    const { data: signData, error: signError } = await adminClient.storage
      .from(bucket)
      .createSignedUrl(storagePath, ttlSeconds);

    if (signError || !signData?.signedUrl) {
      console.error("Storage createSignedUrl failed:", signError);
      return new Response(
        JSON.stringify({
          error: `Failed to generate playback URL: ${signError?.message || "Object not found"}`,
          code: "SIGNING_FAILED",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Return authorized playback ticket (scrub internal storage_path and bucket to minimize data exposure)
    return new Response(
      JSON.stringify({
        status: "success",
        signed_url: signData.signedUrl,
        filename: audio.filename || "recording",
        expires_in: ttlSeconds,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Unexpected error in get-story-audio:", err);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${err.message || String(err)}`, code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

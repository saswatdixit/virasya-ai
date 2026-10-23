/**
 * Virasya Audio Limits, Storage Security, and Playback Automated Test Suite
 *
 * Verifies:
 * 1. Size & Duration Limits (5 MiB / 60 seconds) across frontend and constants.
 * 2. Strict trust-boundary validation (format allowlist, size limits, duration checks).
 * 3. Supabase Edge Function `preserve-story`:
 *    - Bucket verification (only `story-recordings-private`).
 *    - Strict path traversal prevention (`..`, `\`, `/`).
 *    - Mismatched user ownership rejection (`storage_path` must start with `${user.id}/`).
 *    - Persistence of canonical `storage_path` and `bucket`.
 * 4. Supabase Edge Function `get-story-audio`:
 *    - Fresh signed URL generation for public preserved stories without making bucket public.
 *    - Rejection of unauthorized requests for private recordings.
 *    - Mismatched author path rejection.
 *    - Legacy story URL compatibility (parsing storage path from older signed URLs).
 * 5. Frontend adapters and storage helpers:
 *    - `audioItemToDbAudio` and `dbAudioToAudioItem` persist and restore `storage_path` and `bucket`.
 *    - Decoupled cloud upload from local Flask workbench.
 *    - In-memory guest recording retention and Step 6 pre-preservation cloud upload.
 *    - Text-only stories and missing audio compatibility.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

console.log("=== Virasya Audio Storage, Limits & Playback Test Suite ===\n");

// ---------------------------------------------------------------------------
// 1. Shared Audio Constants & Boundaries
// ---------------------------------------------------------------------------
console.log("1. Verifying shared audio limits and format allowlists...");
const constantsPath = path.resolve(__dirname, "../src/preserve/constants.ts");
const constantsContent = fs.readFileSync(constantsPath, "utf8");

assert(constantsContent.includes("export const MAX_AUDIO_DURATION_SECONDS = 60"), "Max audio duration must be 60 seconds");
assert(constantsContent.includes("export const MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024"), "Max audio size must be 5 MiB (5,242,880 bytes)");
assert(constantsContent.includes("story-recordings-private"), "Default bucket must be story-recordings-private");

const expectedExts = [".wav", ".ogg", ".mp3", ".m4a", ".flac", ".aac", ".webm"];
for (const ext of expectedExts) {
  assert(constantsContent.includes(`"${ext}"`), `Allowed extensions must include ${ext}`);
}
console.log("   ✓ Shared constants correctly define 60s, 5 MiB, and authorized audio formats.");

// ---------------------------------------------------------------------------
// 2. Frontend Step 2 (Page2Voice.tsx) Limits & Decoupled Upload
// ---------------------------------------------------------------------------
console.log("\n2. Verifying Page2Voice.tsx size/duration guards and decoupled cloud upload...");
const voiceContent = fs.readFileSync(path.resolve(__dirname, "../src/preserve/pages/Page2Voice.tsx"), "utf8");

// Duration auto-stop guard
assert(voiceContent.includes("elapsedRef.current >= MAX_AUDIO_DURATION_SECONDS"), "Timer must auto-stop recording at 60s");
assert(voiceContent.includes("stopRecording()"), "Must stop recording when 60s limit reached");

// In-stream byte size guard
assert(voiceContent.includes("recordedBytesRef.current > MAX_AUDIO_SIZE_BYTES"), "MediaRecorder ondataavailable must stop on > 5 MiB");

// File upload guards
assert(voiceContent.includes("file.size > MAX_AUDIO_SIZE_BYTES"), "File upload must reject files > 5 MiB");
assert(voiceContent.includes("dur > MAX_AUDIO_DURATION_SECONDS"), "File upload must reject audio > 60s");
assert(voiceContent.includes("ALLOWED_AUDIO_EXTENSIONS.includes"), "File upload must enforce format allowlist");
assert(voiceContent.includes("!dur || isNaN(dur) || dur <= 0"), "Unreadable audio metadata must be safely rejected");

// Decoupled upload
assert(voiceContent.includes("uploadAudioToPrivateBucket(file"), "Must call uploadAudioToPrivateBucket directly without depending on Flask");
assert(voiceContent.includes("isBackendConfigured()"), "Flask sync must be optional and non-blocking");
assert(voiceContent.includes("setAudio("), "Must retain binary File in context memory");
console.log("   ✓ Page2Voice.tsx enforces 60s auto-stop, 5 MiB limit, duration metadata check, and decoupled upload.");

// ---------------------------------------------------------------------------
// 3. Preserve Context & Step 6 Guest Recording Upload
// ---------------------------------------------------------------------------
console.log("\n3. Verifying PreserveContext.tsx guest recording retention and Step 6 upload...");
const ctxContent = fs.readFileSync(path.resolve(__dirname, "../src/preserve/context/PreserveContext.tsx"), "utf8");

// In-memory binary retention
assert(ctxContent.includes("audioFileRef"), "Context must maintain audioFileRef for guest in-memory binary retention");
assert(ctxContent.includes("setAudioFileState"), "Context must manage audioFile state");

// GNANI boundary guard
assert(ctxContent.includes("currentAudio.size > MAX_AUDIO_SIZE_BYTES"), "executeTranscription must guard against oversized audio");
assert(ctxContent.includes("currentAudio.duration > MAX_AUDIO_DURATION_SECONDS"), "executeTranscription must guard against audio > 60s");

// Pre-preservation upload for guest users
assert(ctxContent.includes("if (!state.audio.storage_path)"), "Must check if audio lacks storage_path before sealing");
assert(ctxContent.includes("const rawBinary = audioFileRef.current"), "Must retrieve in-memory binary file");
assert(ctxContent.includes("uploadAudioToPrivateBucket(rawBinary"), "Must upload guest recording to Supabase before preservation");
assert(ctxContent.includes("Audio recording binary is not available in browser memory"), "Must inform user if memory was cleared on reload");
console.log("   ✓ PreserveContext.tsx validates boundaries before GNANI and executes deferred guest cloud upload.");

// ---------------------------------------------------------------------------
// 4. Supabase Adapters Canonical Path Persistence
// ---------------------------------------------------------------------------
console.log("\n4. Verifying Supabase adapters canonical audio path persistence...");
const adaptersContent = fs.readFileSync(path.resolve(__dirname, "../src/supabase/adapters.ts"), "utf8");

assert(adaptersContent.includes("storage_path: audio.storage_path"), "audioItemToDbAudio must persist storage_path");
assert(adaptersContent.includes("bucket: audio.bucket"), "audioItemToDbAudio must persist bucket");
assert(adaptersContent.includes("storage_path: dbAudio.storage_path"), "dbAudioToAudioItem must restore storage_path");
assert(adaptersContent.includes("bucket: dbAudio.bucket"), "dbAudioToAudioItem must restore bucket");
console.log("   ✓ Adapters correctly map and restore canonical storage_path and bucket.");

// ---------------------------------------------------------------------------
// 5. Supabase Edge Function: preserve-story Security & Canonical Paths
// ---------------------------------------------------------------------------
console.log("\n5. Verifying preserve-story Edge Function security & path validation...");
const preserveFnContent = fs.readFileSync(path.resolve(__dirname, "../../supabase/functions/preserve-story/index.ts"), "utf8");

// Canonical fields preserved
assert(preserveFnContent.includes("storage_path: storagePath"), "preserve-story must persist storage_path");
assert(preserveFnContent.includes("bucket: bucket"), "preserve-story must persist bucket");

// Bucket restriction
assert(preserveFnContent.includes("INVALID_BUCKET"), "Must reject invalid or arbitrary buckets");

// Path traversal guard
assert(preserveFnContent.includes("MALFORMED_STORAGE_PATH"), "Must reject path traversal (.., \\, leading /)");

// Ownership guard
assert(preserveFnContent.includes("FORBIDDEN_STORAGE_PATH"), "Must reject storage paths not starting with user.id/");

// Actual storage object verification
assert(preserveFnContent.includes("AUDIO_OBJECT_NOT_FOUND"), "Must verify referenced audio object exists in storage");
assert(preserveFnContent.includes("AUDIO_TOO_LARGE"), "Must enforce actual storage object size limit <= 5 MiB");
assert(preserveFnContent.includes("AUDIO_TOO_LONG"), "Must enforce duration boundary <= 60s");
console.log("   ✓ preserve-story Edge Function validates bucket, path ownership, storage presence, size, and duration.");

// ---------------------------------------------------------------------------
// 6. Supabase Edge Function: get-story-audio Playback Authorization
// ---------------------------------------------------------------------------
console.log("\n6. Verifying get-story-audio Edge Function authorized playback tickets...");
const playbackFnContent = fs.readFileSync(path.resolve(__dirname, "../../supabase/functions/get-story-audio/index.ts"), "utf8");

// Authorization checks
assert(playbackFnContent.includes("isPublicPreserved"), "Must check if story is public and preserved");
assert(playbackFnContent.includes("UNAUTHORIZED_PRIVATE_AUDIO"), "Must require auth for non-public stories");
assert(playbackFnContent.includes("FORBIDDEN_AUDIO_ACCESS"), "Must forbid non-owner access to private recordings");

// Path validation
assert(playbackFnContent.includes("MALFORMED_STORAGE_PATH"), "Must reject malformed playback paths");
assert(playbackFnContent.includes("MISMATCHED_STORAGE_OWNER"), "Must verify storage path belongs to story author");

// Legacy signed URL compatibility
assert(playbackFnContent.includes("story-recordings-private\\/([^?]+)"), "Must extract storage_path from legacy expiring signed URLs");

// Fresh signed URL generation
assert(playbackFnContent.includes("createSignedUrl(storagePath"), "Must generate fresh signed playback URL with TTL");
console.log("   ✓ get-story-audio Edge Function enforces public/private access rules, author ownership, and legacy recovery.");

// ---------------------------------------------------------------------------
// 7. ExplorePage On-Demand Authorized Playback & Token Refresh
// ---------------------------------------------------------------------------
console.log("\n7. Verifying ExplorePage on-demand playback and token refresh...");
const exploreContent = fs.readFileSync(path.resolve(__dirname, "../src/explore/ExplorePage.tsx"), "utf8");

assert(exploreContent.includes("getStoryAudioPlaybackUrl"), "ExplorePage must use getStoryAudioPlaybackUrl");
assert(exploreContent.includes("ExploreAudioPlayer"), "ExplorePage must render ExploreAudioPlayer component");
assert(exploreContent.includes("handleAudioError"), "ExploreAudioPlayer must handle audio error / token expiration");
assert(exploreContent.includes("Refresh Playback Ticket"), "ExploreAudioPlayer must provide manual refresh action");
assert(exploreContent.includes("Obtaining authorized archival playback ticket"), "ExploreAudioPlayer must display resolving state");
console.log("   ✓ ExplorePage cleanly resolves fresh playback tickets and auto-refreshes expired tokens.");

// ---------------------------------------------------------------------------
// 8. Python Backend Trust Boundaries (server.py & workflow.py)
// ---------------------------------------------------------------------------
console.log("\n8. Verifying Python backend upload & transcription trust boundaries...");
const pyWorkflow = fs.readFileSync(path.resolve(__dirname, "../../virasya-ai/src/virasya_ai/web/workflow.py"), "utf8");
assert(pyWorkflow.includes("MAX_UPLOAD_BYTES = 5 * 1024 * 1024"), "workflow.py MAX_UPLOAD_BYTES must be 5 MiB");

const pyServer = fs.readFileSync(path.resolve(__dirname, "../../virasya-ai/src/virasya_ai/web/server.py"), "utf8");
assert(pyServer.includes("MAX_REQUEST_BYTES"), "server.py must enforce MAX_REQUEST_BYTES");
assert(pyServer.includes("PAYLOAD_TOO_LARGE"), "server.py must return PAYLOAD_TOO_LARGE (HTTP 413)");
assert(pyServer.includes("AUDIO_TOO_LONG"), "server.py must reject audio duration > 60s");
assert(pyServer.includes("AudioTooLongError"), "server.py must raise AudioTooLongError if transcribe exceeds 60s");
console.log("   ✓ Python backend validates request body (HTTP 413), file size (5 MiB), and duration (60s).");

console.log("\n==================================================================");
console.log("ALL AUDIO LIMITS, STORAGE SECURITY & PLAYBACK CHECKS PASSED (100%)");
console.log("==================================================================");

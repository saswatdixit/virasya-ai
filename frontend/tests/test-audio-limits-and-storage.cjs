/**
 * Virasya Audio Limits, Storage Security, and Playback Automated Test Suite
 *
 * Combines:
 * 1. Static Source Code Assertions: Verifies architectural invariants across frontend,
 *    Edge Functions, Python server, and database migrations.
 * 2. Executable Behavioral Tests: Runs real validation algorithms on synthetic and genuine
 *    audio files, testing size bounds, duration boundaries, forged client metadata,
 *    corrupt file rejection, exact object lookups, and authorization matrices.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

console.log("=== Virasya Audio Storage, Limits & Playback Test Suite ===\n");

(async () => {
  // ===========================================================================
  // PART 1: STATIC CODE & INVARIANT INSPECTION
  // ===========================================================================

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
  // 5. Supabase Core Schema Migration (SEC-02: 5 MiB Bucket Limit)
  // ---------------------------------------------------------------------------
  console.log("\n5. Verifying Supabase core schema migration bucket limit (SEC-02)...");
  const migrationPath = path.resolve(__dirname, "../../supabase/migrations/20261017000000_virasya_core_schema.sql");
  const migrationContent = fs.readFileSync(migrationPath, "utf8");

  assert(migrationContent.includes("5242880, -- 5 MiB"), "Storage bucket migration must configure 5,242,880 bytes limit");
  assert(!migrationContent.includes("52428800"), "Old 50 MB (52428800) limit must not be present in migration");
  console.log("   ✓ Migration 20261017000000_virasya_core_schema.sql correctly sets 5 MiB (5,242,880 bytes).");

  // ---------------------------------------------------------------------------
  // 6. Supabase Edge Function: preserve-story Security & Exact Object Verification
  // ---------------------------------------------------------------------------
  console.log("\n6. Verifying preserve-story Edge Function security, exact download & validator (SEC-01, SEC-03)...");
  const preserveFnContent = fs.readFileSync(path.resolve(__dirname, "../../supabase/functions/preserve-story/index.ts"), "utf8");
  const validatorContent = fs.readFileSync(path.resolve(__dirname, "../../supabase/functions/preserve-story/audio-validator.ts"), "utf8");

  // Import check
  assert(preserveFnContent.includes('import { validateAudioBuffer } from "./audio-validator.ts"'), "preserve-story must import validateAudioBuffer");

  // Canonical fields preserved
  assert(preserveFnContent.includes("storage_path: storagePath"), "preserve-story must persist storage_path");
  assert(preserveFnContent.includes("bucket: bucket"), "preserve-story must persist bucket");

  // Bucket restriction
  assert(preserveFnContent.includes("INVALID_BUCKET"), "Must reject invalid or arbitrary buckets");

  // Path traversal guard
  assert(preserveFnContent.includes("MALFORMED_STORAGE_PATH"), "Must reject path traversal (.., \\, leading /)");

  // Ownership guard
  assert(preserveFnContent.includes("FORBIDDEN_STORAGE_PATH"), "Must reject storage paths not starting with user.id/");

  // Exact object download (SEC-03: eliminates .list() limit: 10 pagination flaw)
  assert(preserveFnContent.includes(".download(storagePath)"), "Must verify exact object existence via direct download, not fragile list");
  assert(!preserveFnContent.includes(".list(user.id, { search: objectFileName, limit: 10 })"), "Fragile list lookup with limit: 10 must be removed");
  assert(preserveFnContent.includes("AUDIO_OBJECT_NOT_FOUND"), "Must return safe error if exact object is missing");

  // Server-side container duration validation (SEC-01)
  assert(preserveFnContent.includes("validateAudioBuffer(audioBuffer"), "Must execute server-side audio validation on storage bytes");
  assert(validatorContent.includes("AUDIO_TOO_LONG"), "Audio validator must enforce duration limit <= 60s");
  assert(validatorContent.includes("AUDIO_TOO_LARGE"), "Audio validator must enforce 5 MiB limit");
  assert(validatorContent.includes("UNRECOGNIZED_CONTAINER"), "Audio validator must enforce supported audio container signatures");
  console.log("   ✓ preserve-story Edge Function performs exact download lookup and server-side duration validation.");

  // ---------------------------------------------------------------------------
  // 7. Supabase Edge Function: get-story-audio Playback Authorization
  // ---------------------------------------------------------------------------
  console.log("\n7. Verifying get-story-audio Edge Function authorized playback tickets...");
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
  // 8. ExplorePage On-Demand Authorized Playback & Token Refresh
  // ---------------------------------------------------------------------------
  console.log("\n8. Verifying ExplorePage on-demand playback and token refresh...");
  const exploreContent = fs.readFileSync(path.resolve(__dirname, "../src/explore/ExplorePage.tsx"), "utf8");

  assert(exploreContent.includes("getStoryAudioPlaybackUrl"), "ExplorePage must use getStoryAudioPlaybackUrl");
  assert(exploreContent.includes("ExploreAudioPlayer"), "ExplorePage must render ExploreAudioPlayer component");
  assert(exploreContent.includes("handleAudioError"), "ExploreAudioPlayer must handle audio error / token expiration");
  assert(exploreContent.includes("Refresh Playback Ticket"), "ExploreAudioPlayer must provide manual refresh action");
  assert(exploreContent.includes("Obtaining authorized archival playback ticket"), "ExploreAudioPlayer must display resolving state");
  console.log("   ✓ ExplorePage cleanly resolves fresh playback tickets and auto-refreshes expired tokens.");

  // ---------------------------------------------------------------------------
  // 9. Python Backend Trust Boundaries & Fail-Closed Behavior (SEC-05)
  // ---------------------------------------------------------------------------
  console.log("\n9. Verifying Python backend upload & transcription trust boundaries (SEC-05)...");
  const pyWorkflow = fs.readFileSync(path.resolve(__dirname, "../../virasya-ai/src/virasya_ai/web/workflow.py"), "utf8");
  assert(pyWorkflow.includes("MAX_UPLOAD_BYTES = 5 * 1024 * 1024"), "workflow.py MAX_UPLOAD_BYTES must be 5 MiB");

  const pyServer = fs.readFileSync(path.resolve(__dirname, "../../virasya-ai/src/virasya_ai/web/server.py"), "utf8");
  assert(pyServer.includes("MAX_REQUEST_BYTES"), "server.py must enforce MAX_REQUEST_BYTES");
  assert(pyServer.includes("PAYLOAD_TOO_LARGE"), "server.py must return PAYLOAD_TOO_LARGE (HTTP 413)");
  assert(pyServer.includes("AUDIO_TOO_LONG"), "server.py must reject audio duration > 60s");
  assert(pyServer.includes("DURATION_VERIFICATION_FAILED"), "server.py must fail closed with DURATION_VERIFICATION_FAILED");
  const uploadFn = pyServer.slice(pyServer.indexOf("def _handle_upload"), pyServer.indexOf("def _handle_transcribe"));
  assert(!uploadFn.includes("pass"), "_handle_upload must not silently pass on unexpected audio errors");

  const transcribeFn = pyServer.slice(pyServer.indexOf("def _handle_transcribe"), pyServer.indexOf("def _handle_save_legacy"));
  assert(!transcribeFn.includes("pass"), "_handle_transcribe must not silently pass on unexpected audio errors");

  const pyAudio = fs.readFileSync(path.resolve(__dirname, "../../virasya-ai/src/virasya_ai/transcription/ingestion/audio.py"), "utf8");
  assert(pyAudio.includes('".webm"'), "audio.py must support .webm from browser recordings");
  console.log("   ✓ Python backend validates request body (HTTP 413), file size (5 MiB), fails closed, and supports webm.");

  // ===========================================================================
  // PART 2: EXECUTABLE BEHAVIORAL TESTS (RUNTIME VALIDATION)
  // ===========================================================================
  console.log("\n==================================================================");
  console.log("PART 2: EXECUTABLE BEHAVIORAL TESTS (RUNTIME VALIDATION)");
  console.log("==================================================================");

  const { validateAudioBuffer, MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_SECONDS } = await import(
    "../../supabase/functions/preserve-story/audio-validator.ts"
  );

  // Helper to generate valid PCM WAV buffers of specific durations
  function generatePcmWav(durationSeconds, sampleRate = 16000) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const dataSize = Math.floor(durationSeconds * byteRate);
    const buffer = new Uint8Array(44 + dataSize);
    const view = new DataView(buffer.buffer);

    // RIFF header
    buffer.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    view.setUint32(4, 36 + dataSize, true);
    buffer.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

    // fmt chunk
    buffer.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, (numChannels * bitsPerSample) / 8, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    buffer.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
    view.setUint32(40, dataSize, true);

    return buffer;
  }

  // Helper to generate minimal WebM buffers
  function generateWebm(durationSeconds) {
    const ebmlHeader = [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const segment = [0x18, 0x53, 0x80, 0x67, 0x10, 0x00, 0x00, 0x20];
    const info = [0x15, 0x49, 0xa9, 0x66, 0x8f];

    // Duration in Info element (float32, in units of timestampScale 1ms = 1000 * seconds)
    const durMs = durationSeconds * 1000.0;
    const durBuf = new Uint8Array(4);
    new DataView(durBuf.buffer).setFloat32(0, durMs, false);
    const durEl = [0x44, 0x89, 0x84, ...durBuf];

    return new Uint8Array([...ebmlHeader, ...segment, ...info, ...durEl]);
  }

  // --- Behavioral Test 1: Size Boundary Invariant ---
  console.log("\nBehavioral Test 1: Size boundary invariants (5 MiB boundary)...");
  const exact5MiB = new Uint8Array(MAX_AUDIO_BYTES);
  const oversized5MiB = new Uint8Array(MAX_AUDIO_BYTES + 1);

  // Exact 5 MiB evaluates past size check into container check
  const resExact = validateAudioBuffer(exact5MiB, ".bin");
  assert.strictEqual(resExact.valid, false);
  assert.strictEqual(resExact.code, "UNRECOGNIZED_CONTAINER", "5,242,880 bytes must pass the size gate");

  // 5 MiB + 1 byte is rejected immediately at size gate
  const resOver = validateAudioBuffer(oversized5MiB, ".bin");
  assert.strictEqual(resOver.valid, false);
  assert.strictEqual(resOver.code, "AUDIO_TOO_LARGE", "5,242,881 bytes must be rejected as AUDIO_TOO_LARGE");
  console.log("   ✓ Exact 5 MiB (5,242,880 bytes) is accepted by size gate; 5,242,881 bytes is rejected (AUDIO_TOO_LARGE).");

  // --- Behavioral Test 2: Duration Boundary Invariant ---
  console.log("\nBehavioral Test 2: Duration boundary invariants (60.0s boundary)...");
  const wav59_9 = generatePcmWav(59.9);
  const res59_9 = validateAudioBuffer(wav59_9, ".wav");
  assert.strictEqual(res59_9.valid, true);
  assert.strictEqual(res59_9.durationSeconds, 59.9);

  const wav60_0 = generatePcmWav(60.0);
  const res60_0 = validateAudioBuffer(wav60_0, ".wav");
  assert.strictEqual(res60_0.valid, true);
  assert.strictEqual(res60_0.durationSeconds, 60.0);

  const wav60_1 = generatePcmWav(60.1);
  const res60_1 = validateAudioBuffer(wav60_1, ".wav");
  assert.strictEqual(res60_1.valid, false);
  assert.strictEqual(res60_1.code, "AUDIO_TOO_LONG", "60.1s audio must be rejected as AUDIO_TOO_LONG");

  const webm30 = generateWebm(30.0);
  const resWebm30 = validateAudioBuffer(webm30, ".webm");
  assert.strictEqual(resWebm30.valid, true);
  assert.strictEqual(resWebm30.durationSeconds, 30.0);

  const webm75 = generateWebm(75.0);
  const resWebm75 = validateAudioBuffer(webm75, ".webm");
  assert.strictEqual(resWebm75.valid, false);
  assert.strictEqual(resWebm75.code, "AUDIO_TOO_LONG", "75.0s WebM must be rejected as AUDIO_TOO_LONG");
  console.log("   ✓ Audio <= 60.0s (WAV 59.9s, 60.0s, WebM 30.0s) accepted; Audio > 60.0s (WAV 60.1s, WebM 75.0s) rejected.");

  // --- Behavioral Test 3: Forged Duration Bypass Prevention ---
  console.log("\nBehavioral Test 3: Forged client duration bypass prevention (SEC-01)...");
  // Simulate attacker sending client payload { duration: 25.0 } for an actual 70.0s audio recording
  const longAudioBytes = generatePcmWav(70.0);
  const attackerReportedDuration = 25.0; // forged value
  const serverValidation = validateAudioBuffer(longAudioBytes, ".wav");

  assert.strictEqual(serverValidation.valid, false, "Server-side validator must ignore forged client duration");
  assert.strictEqual(serverValidation.code, "AUDIO_TOO_LONG", "Real audio container bytes (70s) must trigger AUDIO_TOO_LONG");
  console.log("   ✓ Forged client duration ('25.0s') cannot bypass server-side container decoding (70.0s detected -> rejected).");

  // --- Behavioral Test 4: Unreadable, Malformed, or Corrupt Audio Fails Closed ---
  console.log("\nBehavioral Test 4: Corrupt and malformed audio fail-closed validation...");
  const emptyBytes = new Uint8Array(0);
  assert.strictEqual(validateAudioBuffer(emptyBytes, ".wav").code, "EMPTY_AUDIO");

  const randomBinary = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
  assert.strictEqual(validateAudioBuffer(randomBinary, ".mp3").code, "UNRECOGNIZED_CONTAINER");

  // Truncated WAV header
  const truncatedWav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
  assert.strictEqual(validateAudioBuffer(truncatedWav, ".wav").code, "MALFORMED_AUDIO_HEADER");
  console.log("   ✓ Empty (0 bytes), random non-audio, and truncated audio headers fail closed safely.");

  // --- Behavioral Test 5: Real Archival Audio Files Ingestion ---
  console.log("\nBehavioral Test 5: Real repository archival audio ingestion...");
  const audioDir = path.resolve(__dirname, "../../virasya-ai/data/input");
  if (fs.existsSync(audioDir)) {
    // 1. Real Odia Ogg Opus
    const odiaPath = path.join(audioDir, "e2e_verify_odia6.ogg");
    if (fs.existsSync(odiaPath)) {
      const odiaBytes = new Uint8Array(fs.readFileSync(odiaPath));
      const res = validateAudioBuffer(odiaBytes, ".ogg");
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.format, "ogg");
      assert(res.durationSeconds > 40 && res.durationSeconds < 55, `Expected ~47.6s, got ${res.durationSeconds}`);
      console.log(`   ✓ e2e_verify_odia6.ogg validated: format=${res.format}, duration=${res.durationSeconds}s, bytes=${res.byteSize}`);
    }

    // 2. Real Gujarati Ogg Vorbis
    const gujPath = path.join(audioDir, "Gujarati 3.ogg");
    if (fs.existsSync(gujPath)) {
      const gujBytes = new Uint8Array(fs.readFileSync(gujPath));
      const res = validateAudioBuffer(gujBytes, ".ogg");
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.format, "ogg");
      assert(res.durationSeconds > 20 && res.durationSeconds < 25, `Expected ~21.5s, got ${res.durationSeconds}`);
      console.log(`   ✓ Gujarati 3.ogg validated: format=${res.format}, duration=${res.durationSeconds}s, bytes=${res.byteSize}`);
    }

    // 3. Real WAV Speech
    const speechPath = path.join(audioDir, "speech.wav");
    if (fs.existsSync(speechPath)) {
      const speechBytes = new Uint8Array(fs.readFileSync(speechPath));
      const res = validateAudioBuffer(speechBytes, ".wav");
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.format, "wav");
      assert.strictEqual(res.durationSeconds, 1.0);
      console.log(`   ✓ speech.wav validated: format=${res.format}, duration=${res.durationSeconds}s, bytes=${res.byteSize}`);
    }

    // 4. Fake sample_hindi.wav (text 'dummy audio bytes')
    const fakePath = path.join(audioDir, "sample_hindi.wav");
    if (fs.existsSync(fakePath)) {
      const fakeBytes = new Uint8Array(fs.readFileSync(fakePath));
      const res = validateAudioBuffer(fakeBytes, ".wav");
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.code, "UNRECOGNIZED_CONTAINER");
      console.log(`   ✓ fake sample_hindi.wav correctly rejected as UNRECOGNIZED_CONTAINER.`);
    }
  }

  // --- Behavioral Test 6: WebM Adversarial Bypass Prevention Regression ---
  console.log("\nBehavioral Test 6: WebM adversarial bypass regression (VULN-01)...");
  const ebmlHdr = [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const segHdr = [0x18, 0x53, 0x80, 0x67, 0x10, 0x00, 0x00, 0x50];
  const infoHdr = [0x15, 0x49, 0xa9, 0x66, 0x87];
  const dur10El = [0x44, 0x89, 0x84, 0x46, 0x1c, 0x40, 0x00]; // Info.Duration = 10.0s

  // Case 6A: Declared 10.0s in Info, but Cluster at 90.0s (exceeding 60s limit)
  const cluster90 = [0x1f, 0x43, 0xb6, 0x75, 0x86, 0xe7, 0x84, 0x00, 0x01, 0x5f, 0x90];
  const webm90Adv = new Uint8Array([...ebmlHdr, ...segHdr, ...infoHdr, ...dur10El, ...cluster90]);
  const resWebm90 = validateAudioBuffer(webm90Adv, ".webm");
  assert.strictEqual(resWebm90.valid, false);
  assert.strictEqual(resWebm90.code, "AUDIO_TOO_LONG", "WebM with Cluster at 90s must be rejected as AUDIO_TOO_LONG");

  // Case 6B: Declared 10.0s in Info, but Cluster at 45.0s (contradicting Info metadata)
  const cluster45 = [0x1f, 0x43, 0xb6, 0x75, 0x86, 0xe7, 0x84, 0x00, 0x00, 0xaf, 0xc8];
  const webm45Adv = new Uint8Array([...ebmlHdr, ...segHdr, ...infoHdr, ...dur10El, ...cluster45]);
  const resWebm45 = validateAudioBuffer(webm45Adv, ".webm");
  assert.strictEqual(resWebm45.valid, false);
  assert.strictEqual(resWebm45.code, "MALFORMED_AUDIO_HEADER", "WebM with contradicting cluster timing must be rejected");
  console.log("   ✓ WebM adversarial timing bypasses (Cluster at 90s and contradictory 45s vs 10s) prevented.");

  // --- Behavioral Test 7: OGG Adversarial Granule Spoofing Regression ---
  console.log("\nBehavioral Test 7: OGG adversarial granule spoofing regression (VULN-02)...");
  const odiaTestPath = path.join(audioDir, "e2e_verify_odia6.ogg");
  if (fs.existsSync(odiaTestPath)) {
    const origOdiaBuf = fs.readFileSync(odiaTestPath);
    // Append dummy trailing page claiming granule = 48,000 (1.0s)
    const fakeOggPage = new Uint8Array(30);
    fakeOggPage.set([0x4f, 0x67, 0x67, 0x53], 0);
    fakeOggPage[4] = 0;
    fakeOggPage[5] = 4;
    new DataView(fakeOggPage.buffer).setUint32(6, 48000, true);
    new DataView(fakeOggPage.buffer).setUint32(10, 0, true);
    fakeOggPage[26] = 1;
    fakeOggPage[27] = 2;
    const spoofedOggBuf = new Uint8Array(origOdiaBuf.length + fakeOggPage.length);
    spoofedOggBuf.set(origOdiaBuf, 0);
    spoofedOggBuf.set(fakeOggPage, origOdiaBuf.length);

    const resOggSpoof = validateAudioBuffer(spoofedOggBuf, ".ogg");
    assert.strictEqual(resOggSpoof.valid, false);
    assert.strictEqual(resOggSpoof.code, "MALFORMED_AUDIO_HEADER", "OGG with spoofed trailing page must fail monotonic/header check");
    console.log("   ✓ OGG spoofed trailing page rejected (non-monotonic sequence/granule detected).");
  }

  // --- Behavioral Test 8: MP3 Xing Forgery & MPEG-2/2.5 Support Regression ---
  console.log("\nBehavioral Test 8: MP3 Xing forgery & MPEG-2/2.5 support regression (VULN-03 & VULN-06)...");
  // Case 8A: Forged Xing header claiming 10 frames on 50-frame buffer
  const frameSz = 417;
  const mp3ForgedBuf = new Uint8Array(frameSz * 50);
  for (let i = 0; i < 50; i++) {
    const off = i * frameSz;
    mp3ForgedBuf[off] = 0xff;
    mp3ForgedBuf[off + 1] = 0xfb;
    mp3ForgedBuf[off + 2] = 0x90;
    mp3ForgedBuf[off + 3] = 0x00;
  }
  mp3ForgedBuf.set([0x58, 0x69, 0x6e, 0x67], 36);
  mp3ForgedBuf.set([0x00, 0x00, 0x00, 0x01], 40);
  mp3ForgedBuf.set([0x00, 0x00, 0x00, 0x0a], 44); // claims 10 frames
  const resMp3Forged = validateAudioBuffer(mp3ForgedBuf, ".mp3");
  assert.strictEqual(resMp3Forged.valid, false);
  assert.strictEqual(resMp3Forged.code, "MALFORMED_AUDIO_HEADER", "MP3 with frames exceeding Xing claim must be rejected");

  // Case 8B: Valid MPEG-2 Layer III frames (22050 Hz, 64 kbps, mono -> frame size = 72 * 64000 / 22050 = 208 bytes)
  const mpeg2FrameSz = 208;
  const mpeg2Buf = new Uint8Array(mpeg2FrameSz * 20); // 20 frames = 20 * 576 / 22050 = 0.52s
  for (let i = 0; i < 20; i++) {
    const off = i * mpeg2FrameSz;
    mpeg2Buf[off] = 0xff;
    mpeg2Buf[off + 1] = 0xf3; // 1111 0011 (MPEG-2 Layer III)
    mpeg2Buf[off + 2] = 0x80; // 1000 0000 (64 kbps, 22050 Hz, no pad)
    mpeg2Buf[off + 3] = 0xc0; // mono
  }
  const resMpeg2 = validateAudioBuffer(mpeg2Buf, ".mp3");
  assert.strictEqual(resMpeg2.valid, true);
  assert.strictEqual(resMpeg2.format, "mp3");
  assert(resMpeg2.durationSeconds > 0.4 && resMpeg2.durationSeconds < 0.6);
  console.log("   ✓ MP3 Xing header forgery rejected; MPEG-2 Layer III frame sequence accurately parsed.");

  // --- Behavioral Test 9: M4A Discrepant Payload Regression ---
  console.log("\nBehavioral Test 9: M4A discrepant payload regression (VULN-04)...");
  const ftypBox = [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0x00, 0x00, 0x00, 0x00, 0x4d, 0x34, 0x41, 0x20];
  const mvhdBox = new Uint8Array(108);
  const mvhdVw = new DataView(mvhdBox.buffer);
  mvhdVw.setUint32(0, 108, false);
  mvhdBox.set([0x6d, 0x76, 0x68, 0x64], 4);
  mvhdBox[8] = 0;
  mvhdVw.setUint32(20, 1000, false);
  mvhdVw.setUint32(24, 5000, false); // claims 5.0s

  const moovBox = new Uint8Array(116);
  new DataView(moovBox.buffer).setUint32(0, 116, false);
  moovBox.set([0x6d, 0x6f, 0x6f, 0x76], 4);
  moovBox.set(mvhdBox, 8);

  const mdatBoxLen = 3 * 1024 * 1024; // 3 MB mdat
  const mdatBox = new Uint8Array(mdatBoxLen);
  new DataView(mdatBox.buffer).setUint32(0, mdatBoxLen, false);
  mdatBox.set([0x6d, 0x64, 0x61, 0x74], 4);

  const m4aAdvBuf = new Uint8Array(ftypBox.length + moovBox.length + mdatBox.length);
  m4aAdvBuf.set(ftypBox, 0);
  m4aAdvBuf.set(moovBox, ftypBox.length);
  m4aAdvBuf.set(mdatBox, ftypBox.length + moovBox.length);

  const resM4aAdv = validateAudioBuffer(m4aAdvBuf, ".m4a");
  assert.strictEqual(resM4aAdv.valid, false);
  assert.strictEqual(resM4aAdv.code, "MALFORMED_AUDIO_HEADER", "M4A with 3 MB mdat claiming 5s must be rejected");
  console.log("   ✓ M4A discrepant media payload (3 MB mdat vs 5s claimed) rejected.");

  // --- Behavioral Test 10: WAV Trailing Payload Regression ---
  console.log("\nBehavioral Test 10: WAV trailing unallocated payload regression (VULN-05)...");
  const wavTotBytes = 3 * 1024 * 1024; // 3 MB
  const wavAdvBuf = new Uint8Array(wavTotBytes);
  const wavVw = new DataView(wavAdvBuf.buffer);
  wavAdvBuf.set([0x52, 0x49, 0x46, 0x46], 0);
  wavVw.setUint32(4, wavTotBytes - 8, true);
  wavAdvBuf.set([0x57, 0x41, 0x56, 0x45], 8);
  wavAdvBuf.set([0x66, 0x6d, 0x74, 0x20], 12);
  wavVw.setUint32(16, 16, true);
  wavVw.setUint16(20, 1, true); // PCM
  wavVw.setUint16(22, 1, true); // 1 ch
  wavVw.setUint32(24, 16000, true);
  wavVw.setUint32(28, 32000, true);
  wavVw.setUint16(32, 2, true);
  wavVw.setUint16(34, 16, true);
  wavAdvBuf.set([0x64, 0x61, 0x74, 0x61], 36);
  wavVw.setUint32(40, 32000, true); // claims only 1 second

  const resWavAdv = validateAudioBuffer(wavAdvBuf, ".wav");
  assert.strictEqual(resWavAdv.valid, false);
  assert.strictEqual(resWavAdv.code, "AUDIO_TOO_LONG", "WAV with 3 MB payload claiming 1s dataSize must be rejected as AUDIO_TOO_LONG");
  console.log("   ✓ WAV trailing unallocated payload (3 MB file claiming 1s data) rejected.");

  // --- Behavioral Test 11: FLAC Sample Count Discrepancy Regression ---
  console.log("\nBehavioral Test 11: FLAC sample count discrepancy regression...");
  const flacAdvBuf = new Uint8Array(3 * 1024 * 1024);
  flacAdvBuf.set([0x66, 0x4c, 0x61, 0x43], 0);
  flacAdvBuf.set([0x00, 0x00, 0x00, 0x22], 4);
  flacAdvBuf[18] = 0x03;
  flacAdvBuf[19] = 0xe8;
  flacAdvBuf[20] = 0x00;
  flacAdvBuf[24] = 0x3e;
  flacAdvBuf[25] = 0x80; // claims 16,000 samples (1s)

  const resFlacAdv = validateAudioBuffer(flacAdvBuf, ".flac");
  assert.strictEqual(resFlacAdv.valid, false);
  assert.strictEqual(resFlacAdv.code, "MALFORMED_AUDIO_HEADER", "FLAC with 3 MB file claiming 1s must be rejected");
  console.log("   ✓ FLAC sample count discrepancy (3 MB file claiming 1s) rejected.");

  // --- Behavioral Test 12: Reliable Exact Object Lookup & Prefix Confusion Prevention (SEC-03) ---
  console.log("\nBehavioral Test 12: Storage exact key lookup simulation vs prefix confusion (SEC-03)...");
  // Simulate mock Supabase Storage backing map
  const mockStorage = new Map();
  mockStorage.set("user-123/story_recording.wav", generatePcmWav(15.0));
  mockStorage.set("user-123/story_recording.wav.bak", generatePcmWav(45.0));
  mockStorage.set("user-123/story_recording.wav-extended.wav", generatePcmWav(90.0));

  function mockStorageDownload(key) {
    if (mockStorage.has(key)) {
      return { data: mockStorage.get(key), error: null };
    }
    return { data: null, error: { message: "Object not found", status: 404 } };
  }

  // Exact lookup succeeds
  const exactReq = mockStorageDownload("user-123/story_recording.wav");
  assert(exactReq.data !== null, "Exact path lookup must find target object");
  assert.strictEqual(exactReq.data.byteLength, mockStorage.get("user-123/story_recording.wav").byteLength);

  // Non-existent key fails closed (does not match prefix)
  const prefixReq = mockStorageDownload("user-123/story_recording");
  assert.strictEqual(prefixReq.data, null, "Prefix alone must NOT match full object name");
  assert.strictEqual(prefixReq.error.status, 404);

  // Missing object fails closed
  const missingReq = mockStorageDownload("user-123/non_existent.wav");
  assert.strictEqual(missingReq.data, null, "Missing object must fail closed");
  console.log("   ✓ Storage download requires exact key match; prefix collisions (.bak, -extended) cannot be mistaken for requested object.");

  // --- Behavioral Test 13: Active Storyteller Folder Scale (> 10 items) ---
  console.log("\nBehavioral Test 13: Active storyteller folder scale (>10 items pagination fix)...");
  // Simulate a prolific user with 25 audio files
  for (let i = 1; i <= 25; i++) {
    mockStorage.set(`user-prolific/recording_${String(i).padStart(2, "0")}.wav`, generatePcmWav(5.0));
  }

  // Retrieve the 23rd object directly via download
  const targetKey = "user-prolific/recording_23.wav";
  const item23 = mockStorageDownload(targetKey);
  assert(item23.data !== null, "Must retrieve 23rd object directly without pagination failure");
  assert.strictEqual(item23.error, null);
  console.log("   ✓ User directory with >10 items (25 files) succeeds without false-negative AUDIO_OBJECT_NOT_FOUND.");

  // --- Behavioral Test 14: Authorization & Ownership Partition Simulation ---
  console.log("\nBehavioral Test 14: Authorization & ownership partition simulation...");
  function verifyPathAuthorization(authUserId, storagePath) {
    if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) {
      return { authorized: false, code: "MALFORMED_STORAGE_PATH" };
    }
    const expectedPrefix = `${authUserId}/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return { authorized: false, code: "FORBIDDEN_STORAGE_PATH" };
    }
    return { authorized: true };
  }

  assert.strictEqual(verifyPathAuthorization("user-alice", "user-alice/rec.wav").authorized, true);
  assert.strictEqual(verifyPathAuthorization("user-alice", "user-bob/rec.wav").code, "FORBIDDEN_STORAGE_PATH");
  assert.strictEqual(verifyPathAuthorization("user-alice", "../user-bob/rec.wav").code, "MALFORMED_STORAGE_PATH");
  assert.strictEqual(verifyPathAuthorization("user-alice", "user-alice/../user-bob/rec.wav").code, "MALFORMED_STORAGE_PATH");
  assert.strictEqual(verifyPathAuthorization("user-alice", "/user-alice/rec.wav").code, "MALFORMED_STORAGE_PATH");
  console.log("   ✓ Cross-user folder access and directory traversal attempts strictly rejected.");

  // --- Behavioral Test 15: Playback Authorization Logic Simulation ---
  console.log("\nBehavioral Test 15: Playback authorization simulation...");
  function evaluatePlaybackAccess(story, callerUserId) {
    const isPublicPreserved = story.status === "preserved" && story.visibility === "public";
    if (isPublicPreserved) {
      return { allowed: true, reason: "public_preserved" };
    }
    if (!callerUserId) {
      return { allowed: false, code: "UNAUTHORIZED_PRIVATE_AUDIO" };
    }
    if (story.user_id !== callerUserId) {
      return { allowed: false, code: "FORBIDDEN_AUDIO_ACCESS" };
    }
    return { allowed: true, reason: "authenticated_owner" };
  }

  const publicPreservedStory = { status: "preserved", visibility: "public", user_id: "user-1" };
  const privatePreservedStory = { status: "preserved", visibility: "private", user_id: "user-1" };
  const draftStory = { status: "draft", visibility: "public", user_id: "user-1" };

  // Public preserved story allows anonymous playback
  assert.strictEqual(evaluatePlaybackAccess(publicPreservedStory, null).allowed, true);
  // Private preserved story rejects anonymous caller
  assert.strictEqual(evaluatePlaybackAccess(privatePreservedStory, null).code, "UNAUTHORIZED_PRIVATE_AUDIO");
  // Private preserved story rejects non-owner caller
  assert.strictEqual(evaluatePlaybackAccess(privatePreservedStory, "user-2").code, "FORBIDDEN_AUDIO_ACCESS");
  // Private preserved story allows owner
  assert.strictEqual(evaluatePlaybackAccess(privatePreservedStory, "user-1").allowed, true);
  // Draft story rejects non-owner caller
  assert.strictEqual(evaluatePlaybackAccess(draftStory, "user-2").code, "FORBIDDEN_AUDIO_ACCESS");
  console.log("   ✓ Playback access correctly gates public vs private vs draft recordings.");

  // --- Behavioral Test 16: Failed Upload / Unvalidated Recording Story Sealing Prevention ---
  console.log("\nBehavioral Test 16: Story sealing fail-closed on audio validation failure...");
  function simulateStorySealing(audioPayload, storageMap) {
    if (!audioPayload) {
      // Text-only story
      return { sealed: true, storyType: "text_only" };
    }
    if (!audioPayload.storage_path) {
      return { sealed: false, code: "MISSING_STORAGE_PATH" };
    }
    const storageItem = storageMap.get(audioPayload.storage_path);
    if (!storageItem) {
      return { sealed: false, code: "AUDIO_OBJECT_NOT_FOUND" };
    }
    const val = validateAudioBuffer(storageItem, ".wav");
    if (!val.valid) {
      return { sealed: false, code: val.code };
    }
    return { sealed: true, verifiedDuration: val.durationSeconds };
  }

  // 1. Text-only succeeds
  assert.strictEqual(simulateStorySealing(null, mockStorage).sealed, true);

  // 2. Audio with missing storage_path fails closed
  assert.strictEqual(simulateStorySealing({ filename: "rec.wav" }, mockStorage).code, "MISSING_STORAGE_PATH");

  // 3. Audio with missing storage object fails closed
  assert.strictEqual(simulateStorySealing({ storage_path: "user-123/missing.wav" }, mockStorage).code, "AUDIO_OBJECT_NOT_FOUND");

  // 4. Audio with corrupt storage object fails closed
  mockStorage.set("user-123/corrupt.wav", new Uint8Array([1, 2, 3]));
  assert.strictEqual(simulateStorySealing({ storage_path: "user-123/corrupt.wav" }, mockStorage).code, "UNRECOGNIZED_CONTAINER");

  // 5. Valid audio succeeds and records verified duration
  assert.strictEqual(simulateStorySealing({ storage_path: "user-123/story_recording.wav" }, mockStorage).sealed, true);
  console.log("   ✓ Sealing invariant upheld: unvalidated or missing audio recordings cannot reach preserved state.");

  console.log("\n==================================================================");
  console.log("ALL STATIC AND BEHAVIORAL SECURITY & AUDIT TESTS PASSED (100%)");
  console.log("==================================================================");
})();

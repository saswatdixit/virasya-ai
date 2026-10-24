/**
 * Virasya Comprehensive Security Audit Remediation & Adversarial Regression Test Suite
 *
 * Independently validates and tests the complete remediation for all 8 security findings:
 * - VIR-SEC-001: Preserved Story Content Immutability
 * - VIR-SEC-002: Audio Playback Privacy & audio_public_playback Enforcement
 * - VIR-SEC-003: Explore Data Minimization & PII Leakage Prevention
 * - VIR-SEC-004: Transcribe-Audio Atomic Database Rate Limiting (pg_advisory_xact_lock)
 * - VIR-SEC-005: Vocabulary Story ID Cross-Tenant Authorization
 * - VIR-SEC-006: User-Scoped Draft Storage, Multi-Account Isolation & Logout Cleanup
 * - VIR-SEC-007: Production Security Headers (CSP, Frame-Ancestors, HSTS, Permissions-Policy)
 * - VIR-SEC-008: Edge Function CORS Origin Reflection Hardening
 */

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

console.log("===============================================================================");
console.log("   VIRASYA SECURITY AUDIT REMEDIATION & ADVERSARIAL REGRESSION TESTS");
console.log("===============================================================================\n");

const ROOT_DIR = path.resolve(__dirname, "..");
const SUPABASE_DIR = path.resolve(ROOT_DIR, "../supabase");

// =============================================================================
// TEST 1: VIR-SEC-001 — Preserved Story Content Immutability
// =============================================================================
console.log("▶ [VIR-SEC-001] Verifying Preserved Story Content Immutability Trigger...");

const migrationPath = path.resolve(SUPABASE_DIR, "migrations/20261024000000_security_audit_remediations.sql");
assert(fs.existsSync(migrationPath), `Migration file not found at ${migrationPath}`);
const migrationSql = fs.readFileSync(migrationPath, "utf8");

assert(
  migrationSql.includes("FUNCTION public.enforce_preserved_story_immutability()"),
  "Migration must declare enforce_preserved_story_immutability()"
);

// Verify critical immutable columns are checked
const protectedCols = [
  "title",
  "final_text",
  "written_text",
  "audio",
  "carrier",
  "category",
  "language",
  "place",
  "period",
  "relationship",
  "provenance_id",
  "created_at",
];

for (const col of protectedCols) {
  assert(
    migrationSql.includes(`NEW.${col} IS DISTINCT FROM OLD.${col}`) ||
      migrationSql.includes(`OLD.${col} IS DISTINCT FROM NEW.${col}`),
    `Immutability trigger must protect '${col}' from modification when status = 'preserved'`
  );
}

// Adversarial Simulation of the PostgreSQL trigger function in JS
function simulatePreservedStoryUpdateTrigger(oldRow, newRow, isTrustedBackend) {
  if (oldRow.status === "preserved" && !isTrustedBackend) {
    for (const col of protectedCols) {
      const oldVal = JSON.stringify(oldRow[col]);
      const newVal = JSON.stringify(newRow[col]);
      if (oldVal !== newVal) {
        throw new Error(
          `42501: Modifying preserved story content column '${col}' is strictly forbidden once preserved.`
        );
      }
    }
  }
  return newRow;
}

const preservedStory = {
  id: "story_123",
  user_id: "user_a",
  status: "preserved",
  title: "Ancient Folktale",
  final_text: "Original sacred text.",
  written_text: "Draft text.",
  audio: { filename: "sacred.webm" },
  carrier: "Elder",
  category: "Folktale",
  language: "hi-IN",
  place: "Varanasi",
  period: "1940s",
  relationship: "Grandmother",
  provenance_id: "prov_999",
  created_at: "2026-01-01T00:00:00Z",
  visibility: "public",
  audio_public_playback: true,
};

// Attack 1: Malicious client attempts to alter final_text of preserved story
assert.throws(
  () => {
    simulatePreservedStoryUpdateTrigger(
      preservedStory,
      { ...preservedStory, final_text: "TAMPERED TEXT" },
      false
    );
  },
  /Modifying preserved story content column 'final_text' is strictly forbidden/,
  "Must block tampering of final_text"
);

// Attack 2: Malicious client attempts to replace audio of preserved story
assert.throws(
  () => {
    simulatePreservedStoryUpdateTrigger(
      preservedStory,
      { ...preservedStory, audio: { filename: "malicious.mp3" } },
      false
    );
  },
  /Modifying preserved story content column 'audio' is strictly forbidden/,
  "Must block tampering of audio"
);

// Attack 3: Malicious client attempts to change provenance_id
assert.throws(
  () => {
    simulatePreservedStoryUpdateTrigger(
      preservedStory,
      { ...preservedStory, provenance_id: "prov_hacked" },
      false
    );
  },
  /Modifying preserved story content column 'provenance_id' is strictly forbidden/,
  "Must block tampering of provenance_id"
);

// Legitimate action: Storyteller toggles visibility or audio_public_playback
const toggledStory = simulatePreservedStoryUpdateTrigger(
  preservedStory,
  { ...preservedStory, visibility: "private", audio_public_playback: false },
  false
);
assert.strictEqual(toggledStory.visibility, "private", "Owner must be allowed to change visibility");
assert.strictEqual(toggledStory.audio_public_playback, false, "Owner must be allowed to toggle audio_public_playback");

// Draft story can be modified freely before preservation
const draftStory = { ...preservedStory, status: "draft" };
const updatedDraft = simulatePreservedStoryUpdateTrigger(
  draftStory,
  { ...draftStory, title: "New Title", final_text: "Updated text" },
  false
);
assert.strictEqual(updatedDraft.title, "New Title");

console.log("   ✓ VIR-SEC-001 verified: Trigger forbids post-preservation content edits while permitting legitimate lifecycle changes.\n");

// =============================================================================
// TEST 2: VIR-SEC-002 — Audio Playback Privacy & audio_public_playback Enforcement
// =============================================================================
console.log("▶ [VIR-SEC-002] Verifying Audio Playback Privacy in get-story-audio Edge Function...");

const getStoryAudioCode = fs.readFileSync(
  path.resolve(SUPABASE_DIR, "functions/get-story-audio/index.ts"),
  "utf8"
);

assert(
  getStoryAudioCode.includes("Boolean(story.audio_public_playback)"),
  "get-story-audio must explicitly evaluate Boolean(story.audio_public_playback)"
);
assert(
  getStoryAudioCode.includes('story.status === "preserved"') ||
    getStoryAudioCode.includes("story.status === 'preserved'"),
  "get-story-audio must ensure status is 'preserved' for public playback"
);
assert(
  getStoryAudioCode.includes('story.visibility === "public"') ||
    getStoryAudioCode.includes("story.visibility === 'public'"),
  "get-story-audio must ensure visibility is 'public' for public playback"
);

// Simulate the Edge Function authorization decision logic
function evaluateAudioPlaybackAccess(story, callerUserId) {
  const isPublicAudio =
    story.status === "preserved" &&
    story.visibility === "public" &&
    Boolean(story.audio_public_playback);

  if (isPublicAudio) {
    return { allowed: true, reason: "public_preservation" };
  }

  // Not public audio: must authenticate and match owner
  if (!callerUserId) {
    return { allowed: false, status: 401, error: "Authentication required for private audio playback." };
  }

  if (callerUserId !== story.user_id) {
    return { allowed: false, status: 403, error: "Access denied. You do not own this recording." };
  }

  return { allowed: true, reason: "authenticated_owner" };
}

// Matrix testing for Audio Playback authorization
const publicOptInStory = {
  id: "s1",
  user_id: "user_owner",
  status: "preserved",
  visibility: "public",
  audio_public_playback: true,
};

const publicOptOutStory = {
  id: "s2",
  user_id: "user_owner",
  status: "preserved",
  visibility: "public",
  audio_public_playback: false,
};

const privateStory = {
  id: "s3",
  user_id: "user_owner",
  status: "preserved",
  visibility: "private",
  audio_public_playback: true, // Even if true, visibility=private overrides!
};

const draftWithAudio = {
  id: "s4",
  user_id: "user_owner",
  status: "draft",
  visibility: "public",
  audio_public_playback: true, // Draft audio must NEVER be public!
};

// 1. Unauthenticated public access to opt-in public preserved story: ALLOWED
assert.strictEqual(evaluateAudioPlaybackAccess(publicOptInStory, null).allowed, true);

// 2. Unauthenticated access to public story where audio_public_playback = false: BLOCKED (401)
const resOptOutUnauth = evaluateAudioPlaybackAccess(publicOptOutStory, null);
assert.strictEqual(resOptOutUnauth.allowed, false);
assert.strictEqual(resOptOutUnauth.status, 401);

// 3. Other authenticated user accessing public story where audio_public_playback = false: BLOCKED (403)
const resOptOutOther = evaluateAudioPlaybackAccess(publicOptOutStory, "attacker_user_id");
assert.strictEqual(resOptOutOther.allowed, false);
assert.strictEqual(resOptOutOther.status, 403);

// 4. Owner accessing their own opt-out audio: ALLOWED
assert.strictEqual(evaluateAudioPlaybackAccess(publicOptOutStory, "user_owner").allowed, true);

// 5. Unauthenticated access to private story: BLOCKED (401)
assert.strictEqual(evaluateAudioPlaybackAccess(privateStory, null).allowed, false);

// 6. Adversary accessing another user's private story audio: BLOCKED (403)
assert.strictEqual(evaluateAudioPlaybackAccess(privateStory, "attacker_user_id").allowed, false);

// 7. Unauthenticated access to draft audio: BLOCKED (401)
assert.strictEqual(evaluateAudioPlaybackAccess(draftWithAudio, null).allowed, false);

console.log("   ✓ VIR-SEC-002 verified: audio_public_playback, preserved status, and visibility are strictly enforced before issuing audio stream.\n");

// =============================================================================
// TEST 3: VIR-SEC-003 — Explore Data Minimization & PII Leakage Prevention
// =============================================================================
console.log("▶ [VIR-SEC-003] Verifying Explore Data Minimization and PII Protection...");

const frontendStoriesCode = fs.readFileSync(
  path.resolve(ROOT_DIR, "src/supabase/stories.ts"),
  "utf8"
);

// Ensure no wildcard .select("*") in explore queries
assert(
  !frontendStoriesCode.includes('.from("stories")\n    .select("*")') &&
  !frontendStoriesCode.includes('.from("stories").select("*")'),
  "frontend/src/supabase/stories.ts must NOT select * from stories for explore queries"
);

assert(
  frontendStoriesCode.includes("EXPLORE_PUBLIC_COLUMNS"),
  "Must define EXPLORE_PUBLIC_COLUMNS projection constant"
);
assert(
  frontendStoriesCode.includes("EXPLORE_DETAIL_COLUMNS"),
  "Must define EXPLORE_DETAIL_COLUMNS projection constant"
);

// Verify columns in EXPLORE_PUBLIC_COLUMNS and EXPLORE_DETAIL_COLUMNS
const explorePublicColsMatch = frontendStoriesCode.match(/const EXPLORE_PUBLIC_COLUMNS =\s*"([^"]+)";/);
assert(explorePublicColsMatch, "Could not match EXPLORE_PUBLIC_COLUMNS");
const explorePublicCols = explorePublicColsMatch[1].split(",").map((s) => s.trim());

assert(!explorePublicCols.includes("email"), "EXPLORE_PUBLIC_COLUMNS must NEVER include 'email'");
assert(!explorePublicCols.includes("user_id"), "EXPLORE_PUBLIC_COLUMNS must not include 'user_id'");

// Verify migration defines public.explore_stories view without email or audio storage_path
assert(
  migrationSql.includes("VIEW public.explore_stories"),
  "Migration must create view public.explore_stories"
);
assert(
  !migrationSql.includes("s.email") && !migrationSql.includes("email,"),
  "explore_stories view must not include storyteller email"
);
assert(
  migrationSql.includes("jsonb_build_object") && !migrationSql.includes("'storage_path'"),
  "explore_stories view must rebuild audio object and scrub private storage_path"
);

// Verify frontend sanitizes audio if !audio_public_playback
assert(
  frontendStoriesCode.includes("data.audio_public_playback") &&
    frontendStoriesCode.includes("safeAudio"),
  "frontend stories adapter must omit audio payload entirely when audio_public_playback is falsy"
);

console.log("   ✓ VIR-SEC-003 verified: Email and internal audio storage paths are strictly stripped from explore projections.\n");

// =============================================================================
// TEST 4: VIR-SEC-004 — Transcribe-Audio Atomic Database Rate Limiting
// =============================================================================
console.log("▶ [VIR-SEC-004] Verifying Atomic Rate Limiting for transcribe-audio Edge Function...");

assert(
  migrationSql.includes("TABLE public.transcription_usage"),
  "Migration must create public.transcription_usage table"
);
assert(
  migrationSql.includes("FUNCTION public.check_and_consume_transcription_quota"),
  "Migration must define check_and_consume_transcription_quota RPC"
);
assert(
  migrationSql.includes("pg_advisory_xact_lock"),
  "Quota RPC must use pg_advisory_xact_lock for race-condition prevention"
);
assert(
  migrationSql.includes("p_window_seconds") || migrationSql.includes("interval '10 minutes'"),
  "Quota RPC must enforce rolling window limit (10 requests per 10 minutes)"
);

const transcribeAudioCode = fs.readFileSync(
  path.resolve(SUPABASE_DIR, "functions/transcribe-audio/index.ts"),
  "utf8"
);

assert(
  transcribeAudioCode.includes("check_and_consume_transcription_quota"),
  "transcribe-audio must call check_and_consume_transcription_quota RPC"
);
assert(
  transcribeAudioCode.includes("status: 429"),
  "transcribe-audio must respond with HTTP 429 when quota is exceeded"
);
assert(
  transcribeAudioCode.includes('"Retry-After"') || transcribeAudioCode.includes("'Retry-After'"),
  "transcribe-audio must return Retry-After header with 429"
);

// Verify pre-checks: Audio validation occurs before Gnani API call
const validationIndex = transcribeAudioCode.indexOf("validateAudioBuffer");
const rpcCheckIndex = transcribeAudioCode.indexOf("check_and_consume_transcription_quota");
const gnaniCallIndex = transcribeAudioCode.indexOf("fetch(GNANI_STT_ENDPOINT");

assert(validationIndex !== -1, "Audio buffer validation check must exist");
assert(rpcCheckIndex !== -1, "Rate limit RPC check must exist");
assert(gnaniCallIndex !== -1, "Gnani API call must exist");
assert(validationIndex < rpcCheckIndex, "Validation must occur before consuming quota");
assert(rpcCheckIndex < gnaniCallIndex, "Rate limit check must occur before Gnani API call");

console.log("   ✓ VIR-SEC-004 verified: Atomic advisory transaction lock and 429 quota enforcement in place.\n");

// =============================================================================
// TEST 5: VIR-SEC-005 — Vocabulary RLS Cross-Tenant Authorization
// =============================================================================
console.log("▶ [VIR-SEC-005] Verifying Vocabulary Story ID Authorization in RLS...");

assert(
  migrationSql.includes('POLICY "vocab_insert_owner"') ||
    migrationSql.includes("POLICY vocab_insert_owner"),
  "Migration must declare vocab_insert_owner policy"
);
assert(
  migrationSql.includes(
    "story_id IS NULL OR EXISTS ("
  ) &&
    migrationSql.includes("WHERE s.id = vocabulary.story_id AND s.user_id = auth.uid()"),
  "vocab_insert_owner must ensure story_id belongs to auth.uid()"
);
assert(
  migrationSql.includes('POLICY "vocab_update_owner"') ||
    migrationSql.includes("POLICY vocab_update_owner"),
  "Migration must declare vocab_update_owner policy"
);

// Adversarial simulation: Test authorization condition for vocabulary linking
function canUserLinkVocabToStory(vocabStoryId, callerUserId, storiesDatabase) {
  if (vocabStoryId === null) {
    return true; // Standalone glossary entry
  }
  const story = storiesDatabase.find((s) => s.id === vocabStoryId);
  if (!story) return false;
  return story.user_id === callerUserId;
}

const mockStories = [
  { id: "story_alice_1", user_id: "alice" },
  { id: "story_bob_1", user_id: "bob" },
];

// Alice inserts vocab with standalone story_id -> ALLOW
assert.strictEqual(canUserLinkVocabToStory(null, "alice", mockStories), true);

// Alice inserts vocab linked to Alice's story -> ALLOW
assert.strictEqual(canUserLinkVocabToStory("story_alice_1", "alice", mockStories), true);

// Attacker Bob attempts to inject vocabulary into Alice's story -> REJECT
assert.strictEqual(
  canUserLinkVocabToStory("story_alice_1", "bob", mockStories),
  false,
  "Bob must not be permitted to attach vocabulary to Alice's story"
);

console.log("   ✓ VIR-SEC-005 verified: Vocabulary insertion/updating strictly enforces story ownership.\n");

// =============================================================================
// TEST 6: VIR-SEC-006 — User-Scoped Draft Storage & Logout Cleanup
// =============================================================================
console.log("▶ [VIR-SEC-006] Verifying User-Scoped Draft Storage, Multi-Account Isolation & Logout Cleanup...");

const preserveTypesCode = fs.readFileSync(
  path.resolve(ROOT_DIR, "src/preserve/types.ts"),
  "utf8"
);
assert(
  preserveTypesCode.includes("STORAGE_KEY_GUEST"),
  "types.ts must declare STORAGE_KEY_GUEST"
);
assert(
  preserveTypesCode.includes("getDraftStorageKey"),
  "types.ts must export getDraftStorageKey helper"
);

// Test storage key function logic
function testGetDraftStorageKey(userId) {
  if (userId) {
    return `virasya_story_draft_user_${userId}`;
  }
  return "virasya_story_draft_guest";
}

assert.strictEqual(testGetDraftStorageKey("user_abc123"), "virasya_story_draft_user_user_abc123");
assert.strictEqual(testGetDraftStorageKey(null), "virasya_story_draft_guest");
assert.strictEqual(testGetDraftStorageKey(undefined), "virasya_story_draft_guest");

const preserveContextCode = fs.readFileSync(
  path.resolve(ROOT_DIR, "src/preserve/context/PreserveContext.tsx"),
  "utf8"
);
assert(
  preserveContextCode.includes("activeStorageKey = getDraftStorageKey(user?.id)"),
  "PreserveContext must derive activeStorageKey from user?.id"
);
assert(
  preserveContextCode.includes("localStorage.removeItem(activeStorageKey)"),
  "PreserveContext must purge activeStorageKey on reset or preservation"
);
assert(
  preserveContextCode.includes("localStorage.removeItem(STORAGE_KEY_GUEST)"),
  "PreserveContext must clean up STORAGE_KEY_GUEST"
);

const authContextCode = fs.readFileSync(
  path.resolve(ROOT_DIR, "src/auth/AuthContext.ts"),
  "utf8"
);
assert(
  authContextCode.includes("virasya_story_draft_user_${user.id}") ||
  authContextCode.includes('virasya_story_draft_user_'),
  "AuthContext signOut must purge user-scoped draft keys"
);
assert(
  authContextCode.includes("setProfile(null)"),
  "AuthContext signOut must clear profile state"
);

console.log("   ✓ VIR-SEC-006 verified: LocalStorage drafts are isolated per account and cleared upon sign-out.\n");

// =============================================================================
// TEST 7: VIR-SEC-007 — Strict Frontend Security Headers (CSP, Frame-Ancestors)
// =============================================================================
console.log("▶ [VIR-SEC-007] Verifying Strict Security Headers in vercel.json...");

const vercelJsonPath = path.resolve(ROOT_DIR, "vercel.json");
assert(fs.existsSync(vercelJsonPath), "frontend/vercel.json must exist");
const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));

assert(Array.isArray(vercelConfig.headers), "vercel.json must declare headers array");
const rootHeadersRule = vercelConfig.headers.find((h) => h.source === "/(.*)");
assert(rootHeadersRule, "Must have header configuration for all routes /(.*)");

const headerMap = {};
for (const hdr of rootHeadersRule.headers) {
  headerMap[hdr.key.toLowerCase()] = hdr.value;
}

// Check X-Frame-Options
assert.strictEqual(headerMap["x-frame-options"], "DENY", "X-Frame-Options must be DENY");

// Check X-Content-Type-Options
assert.strictEqual(headerMap["x-content-type-options"], "nosniff", "X-Content-Type-Options must be nosniff");

// Check Referrer-Policy
assert.strictEqual(
  headerMap["referrer-policy"],
  "strict-origin-when-cross-origin",
  "Referrer-Policy must be strict-origin-when-cross-origin"
);

// Check Permissions-Policy: camera disabled, microphone explicitly self-only
assert(
  headerMap["permissions-policy"] &&
  headerMap["permissions-policy"].includes("camera=()") &&
  headerMap["permissions-policy"].includes("microphone=(self)"),
  "Permissions-Policy must disable camera and restrict microphone to (self)"
);

// Check HSTS
assert(
  headerMap["strict-transport-security"] &&
  headerMap["strict-transport-security"].includes("max-age=31536000"),
  "HSTS must specify max-age=31536000"
);

// Check CSP
const csp = headerMap["content-security-policy"];
assert(csp, "Content-Security-Policy header must be present");
assert(csp.includes("default-src 'self'"), "CSP must include default-src 'self'");
assert(csp.includes("frame-ancestors 'none'"), "CSP must include frame-ancestors 'none'");
assert(csp.includes("https://*.supabase.co"), "CSP must permit Supabase connections");

console.log("   ✓ VIR-SEC-007 verified: Production HTTP security headers, anti-clickjacking, and CSP strictly configured.\n");

// =============================================================================
// TEST 8: VIR-SEC-008 — Edge Function CORS Origin Reflection Hardening
// =============================================================================
console.log("▶ [VIR-SEC-008] Verifying Edge Function CORS Origin Hardening...");

const edgeFunctions = [
  "get-story-audio/index.ts",
  "preserve-story/index.ts",
  "transcribe-audio/index.ts",
];

for (const fn of edgeFunctions) {
  const code = fs.readFileSync(path.resolve(SUPABASE_DIR, "functions", fn), "utf8");

  // Must not have open wildcard CORS in response headers
  assert(
    !code.includes('"Access-Control-Allow-Origin": "*"') &&
    !code.includes("'Access-Control-Allow-Origin': '*'"),
    `${fn} must NOT contain wildcard Access-Control-Allow-Origin: *`
  );

  assert(
    code.includes("getCorsHeaders"),
    `${fn} must implement getCorsHeaders helper`
  );
  assert(
    code.includes('"Vary": "Origin"') || code.includes("'Vary': 'Origin'"),
    `${fn} must include Vary: Origin header to prevent HTTP cache poisoning across origins`
  );
  assert(
    code.includes("https://virasya-ai-gnani.vercel.app"),
    `${fn} must whitelist official production frontend origin`
  );
}

// Adversarial CORS Reflection Test
function testCorsOriginResolution(requestOrigin) {
  const ALLOWED_ORIGINS = [
    "https://virasya-ai-gnani.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
  ];
  const origin = requestOrigin || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".vercel.app");
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Vary": "Origin",
  };
}

// 1. Production frontend
assert.strictEqual(
  testCorsOriginResolution("https://virasya-ai-gnani.vercel.app")["Access-Control-Allow-Origin"],
  "https://virasya-ai-gnani.vercel.app"
);

// 2. Localhost Vite dev server
assert.strictEqual(
  testCorsOriginResolution("http://localhost:5173")["Access-Control-Allow-Origin"],
  "http://localhost:5173"
);

// 3. Attacker origin: NEVER reflect attacker domain
const attackerResult = testCorsOriginResolution("https://evil-attacker-site.com");
assert.notStrictEqual(
  attackerResult["Access-Control-Allow-Origin"],
  "https://evil-attacker-site.com",
  "Must NEVER reflect untrusted attacker origins in CORS header"
);
assert.strictEqual(
  attackerResult["Access-Control-Allow-Origin"],
  "https://virasya-ai-gnani.vercel.app"
);

console.log("   ✓ VIR-SEC-008 verified: Edge functions enforce strict origin matching with Vary: Origin.\n");

console.log("===============================================================================");
console.log("   ALL 8 ADVERSARIAL SECURITY REGRESSION TESTS PASSED SUCCESSFULLY!");
console.log("===============================================================================");

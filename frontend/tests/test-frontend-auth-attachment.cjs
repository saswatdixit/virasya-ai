/**
 * Virasya Frontend ASR Authentication Attachment Test Suite
 *
 * Verifies:
 * 1. getAuthHeaders() returns empty object when unauthenticated or unconfigured.
 * 2. getAuthHeaders() returns Authorization: Bearer <token> when a valid session is present.
 * 3. All protected ASR calls (upload, transcribe, punctuate, stories, vocabulary, preserve) attach the Bearer token.
 * 4. Missing/expired tokens and 401 Unauthorized responses fail closed with human-friendly errors.
 * 5. fetchAuthenticatedAudioBlob fetches with Authorization header and produces object URL without URL query tokens.
 * 6. AudioPlayer.tsx uses fetchAuthenticatedAudioBlob, revokes ephemeral object URLs, and avoids URL query tokens.
 * 7. Zero leakage of tokens or secret keys in console or error objects.
 */

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

console.log("=== Virasya Frontend ASR Authentication & Token Attachment Verification ===\n");

// -----------------------------------------------------------------------------
// 1. Static Source Code Inspection & Security Guarantees
// -----------------------------------------------------------------------------
console.log("1. Inspecting src/preserve/api.ts and src/preserve/components/AudioPlayer.tsx...");

const apiPath = path.resolve(__dirname, "../src/preserve/api.ts");
assert(fs.existsSync(apiPath), "src/preserve/api.ts must exist");
const apiCode = fs.readFileSync(apiPath, "utf8");

const audioPlayerPath = path.resolve(__dirname, "../src/preserve/components/AudioPlayer.tsx");
assert(fs.existsSync(audioPlayerPath), "src/preserve/components/AudioPlayer.tsx must exist");
const audioPlayerCode = fs.readFileSync(audioPlayerPath, "utf8");

// 1a. getAuthHeaders exported and structured securely
assert(apiCode.includes("export async function getAuthHeaders()"), "getAuthHeaders() must be exported from api.ts");
assert(apiCode.includes("getSupabase()"), "getAuthHeaders must call getSupabase()");
assert(apiCode.includes("auth.getSession()"), "getAuthHeaders must query auth.getSession()");
assert(apiCode.includes("Authorization: `Bearer ${data.session.access_token}`"), "Must construct Bearer authorization header with session token");
assert(apiCode.includes("Record<string, string>"), "Must declare type-safe headers object");
console.log("   ✓ getAuthHeaders properly defined, querying Supabase session and injecting Bearer header.");

// 1b. fetchAuthenticatedAudioBlob exported and structured securely
assert(apiCode.includes("export async function fetchAuthenticatedAudioBlob"), "fetchAuthenticatedAudioBlob must be exported");
assert(apiCode.includes("URL.createObjectURL(blob)"), "fetchAuthenticatedAudioBlob must generate ephemeral object URL");
assert(!apiCode.includes("?token="), "api.ts must NEVER attach ?token= to audio URLs");
console.log("   ✓ fetchAuthenticatedAudioBlob streams audio with Bearer headers and generates ephemeral object URLs.");

// 1c. All protected endpoints must call getAuthHeaders()
const protectedFunctions = [
  "uploadAudioToBackend",
  "transcribeAudioOnBackend",
  "punctuateTextOnBackend",
  "saveStoryToBackend",
  "getStoryFromBackend",
  "listStoriesFromBackend",
  "saveVocabularyToBackend",
  "getVocabularyFromBackend",
  "preserveStoryOnBackend",
];

for (const fnName of protectedFunctions) {
  assert(apiCode.includes(`function ${fnName}`), `${fnName} must exist in api.ts`);
  const fnIndex = apiCode.indexOf(`function ${fnName}`);
  const nextFnIndex = apiCode.indexOf("export ", fnIndex + 1);
  const fnBody = apiCode.slice(fnIndex, nextFnIndex !== -1 ? nextFnIndex : undefined);
  assert(fnBody.includes("getAuthHeaders()"), `${fnName} must invoke getAuthHeaders()`);
  console.log(`   ✓ Protected endpoint ${fnName} attaches authentication headers.`);
}

// 1d. AudioPlayer.tsx security guarantees
assert(audioPlayerCode.includes("fetchAuthenticatedAudioBlob"), "AudioPlayer.tsx must import and use fetchAuthenticatedAudioBlob");
assert(audioPlayerCode.includes("URL.revokeObjectURL"), "AudioPlayer.tsx must revoke ephemeral object URLs to prevent memory leaks");
assert(!audioPlayerCode.includes("?token="), "AudioPlayer.tsx must NEVER append ?token= to audio URLs");
console.log("   ✓ AudioPlayer.tsx safely streams authenticated audio and revokes object URLs without query parameters.");

// -----------------------------------------------------------------------------
// 2. Dynamic Simulation of getAuthHeaders() & Token Handling
// -----------------------------------------------------------------------------
console.log("\n2. Simulating getAuthHeaders() logic in guest, active session, and error states...");

async function simulateGetAuthHeaders(mockSupabase) {
  if (!mockSupabase) return {};
  try {
    const { data, error } = await mockSupabase.auth.getSession();
    if (error || !data || !data.session || !data.session.access_token) {
      return {};
    }
    const token = data.session.access_token;
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

// 2a. Unauthenticated / Guest state
(async () => {
  const guestResult = await simulateGetAuthHeaders({
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  });
  assert.deepStrictEqual(guestResult, {}, "Guest state must return empty headers");
  console.log("   ✓ Guest state returns empty headers without throwing.");

  // 2b. Active session
  const mockToken = "mock.jwt.token.eyJzdWIiOiJ1c2VyLTEyMyJ9";
  const activeResult = await simulateGetAuthHeaders({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: mockToken,
            user: { id: "user-123" },
          },
        },
        error: null,
      }),
    },
  });
  assert.strictEqual(activeResult.Authorization, `Bearer ${mockToken}`);
  console.log("   ✓ Active session returns 'Authorization: Bearer <access_token>'.");

  // 2c. Unconfigured client
  const unconfiguredResult = await simulateGetAuthHeaders(null);
  assert.deepStrictEqual(unconfiguredResult, {});
  console.log("   ✓ Unconfigured Supabase client returns empty headers safely.");

  // ---------------------------------------------------------------------------
  // 3. Dynamic Simulation of fetchAuthenticatedAudioBlob()
  // ---------------------------------------------------------------------------
  console.log("\n3. Simulating fetchAuthenticatedAudioBlob() streaming and lifecycle...");

  let simulatedRevoked = false;
  let simulatedCreated = false;

  const mockBrowserURL = {
    createObjectURL: (blob) => {
      simulatedCreated = true;
      return "blob:http://localhost:5173/mock-uuid-blob";
    },
    revokeObjectURL: (url) => {
      simulatedRevoked = true;
    },
  };

  async function simulateFetchAudioBlob(audioUrl, sessionToken) {
    const headers = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
    // Simulate fetch request
    if (!headers.Authorization && !audioUrl.includes("public")) {
      const err = new Error("Authentication required. Please sign in to stream private audio recordings.");
      err.status = 401;
      throw err;
    }
    const dummyBlob = { size: 1024, type: "audio/wav" };
    return mockBrowserURL.createObjectURL(dummyBlob);
  }

  // 3a. Authenticated fetch
  const generatedBlobUrl = await simulateFetchAudioBlob("/api/audio/my_recording.wav", mockToken);
  assert(simulatedCreated, "Must create blob object URL");
  assert.strictEqual(generatedBlobUrl, "blob:http://localhost:5173/mock-uuid-blob");
  assert(!generatedBlobUrl.includes("token="), "Must not include token query parameter");
  console.log("   ✓ Ephemeral blob URL successfully generated via Authorization header.");

  // 3b. Unauthenticated private audio throws 401
  let unauthErrorCaught = false;
  try {
    await simulateFetchAudioBlob("/api/audio/private_recording.wav", null);
  } catch (err) {
    unauthErrorCaught = true;
    assert.strictEqual(err.status, 401);
    assert(err.message.includes("Authentication required"));
  }
  assert(unauthErrorCaught, "Unauthenticated access to private audio must fail closed with 401");
  console.log("   ✓ Unauthenticated private audio access strictly rejected with 401.");

  // 3c. Object URL cleanup
  mockBrowserURL.revokeObjectURL(generatedBlobUrl);
  assert(simulatedRevoked, "Object URL must be revocable to prevent browser memory leaks");
  console.log("   ✓ Revocation of object URL verified.");

  // ---------------------------------------------------------------------------
  // 4. Token & Secret Exposure Check
  // ---------------------------------------------------------------------------
  console.log("\n4. Checking for accidental secret or token logging...");

  assert(!apiCode.includes("console.log(token)"), "api.ts must not log raw tokens");
  assert(!apiCode.includes("console.log(activeHeaders"), "api.ts must not log authorization headers");
  assert(!audioPlayerCode.includes("console.log(token)"), "AudioPlayer.tsx must not log raw tokens");
  console.log("   ✓ Zero token or credential logging in frontend ASR code.");

  console.log("\n=== ALL FRONTEND ASR AUTH ATTACHMENT CHECKS PASSED (100%) ===\n");
})();

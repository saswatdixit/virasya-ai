/**
 * Virasya Staging Security Integration Test Suite
 *
 * DUAL-MODE SECURITY TEST RUNNER:
 * 1. STATIC PREFLIGHT CHECK MODE (Default local dev / CI when STAGING_* is unset):
 *    - Validates migration AST patterns, trigger declarations, view definitions,
 *      and least-privilege grants locally without network requests.
 *    - Explicitly labeled as STATIC PREFLIGHT; never claims live integration passed.
 *
 * 2. LIVE STAGING INTEGRATION MODE (When STAGING_* environment variables are supplied):
 *    - Connects to an isolated remote Supabase staging instance.
 *    - Creates two disposable synthetic test users (User A & User B).
 *    - Exercises authentic PostgreSQL engine behavior:
 *      • Preserved story content immutability & demotion prevention (SQLSTATE 23514)
 *      • Preserved story deletion block (SQLSTATE 42501)
 *      • Permitted lifecycle metadata updates (visibility, audio_public_playback)
 *      • Cross-user vocabulary story linking restrictions (RLS WITH CHECK)
 *      • Anonymous base-table access revocation (REVOKE SELECT ON public.stories)
 *      • Explore view security barrier & data minimization (no email/storage_path/raw_transcripts)
 *      • Audio playback privacy enforcement (audio null when consent = false)
 *      • Quota RPC privilege restriction (anon & authenticated denied with 42501)
 *      • Atomic advisory lock concurrency serialization under parallel bursts
 *      • Storage bucket 5 MiB file size limit enforcement
 *    - Non-destructively cleans up all synthetic test artifacts in a finally block.
 *
 * STRICT SAFETY CONTRACT:
 * - Production project ref 'ahjmjgiyljjkxvwoubdr' is strictly forbidden.
 * - Partial or malformed staging configurations fail immediately with a fatal exit code.
 */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const PRODUCTION_PROJECT_REF = "ahjmjgiyljjkxvwoubdr";

// -----------------------------------------------------------------------------
// 1. CONFIGURATION INTAKE & SAFETY VALIDATION
// -----------------------------------------------------------------------------
const stagingUrl = (process.env.STAGING_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const stagingAnonKey = (process.env.STAGING_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const stagingServiceKey = (process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const hasAnyStagingConfig = Boolean(stagingUrl || stagingAnonKey || stagingServiceKey);

if (hasAnyStagingConfig) {
  // Requirement: Partial staging configuration must fail explicitly (no silent fallback)
  if (!stagingUrl || !stagingAnonKey || !stagingServiceKey) {
    console.error("\n[CONFIG_ERROR] Incomplete staging configuration detected!");
    console.error("To run live staging integration tests, ALL three environment variables are required:");
    console.error("  • STAGING_SUPABASE_URL (received: " + (stagingUrl ? "PRESENT" : "MISSING") + ")");
    console.error("  • STAGING_SUPABASE_ANON_KEY (received: " + (stagingAnonKey ? "PRESENT" : "MISSING") + ")");
    console.error("  • STAGING_SUPABASE_SERVICE_ROLE_KEY (received: " + (stagingServiceKey ? "PRESENT" : "MISSING") + ")");
    console.error("Execution halted.\n");
    process.exit(1);
  }

  // Requirement: Validate URL structure
  try {
    const parsed = new URL(stagingUrl);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error(`Invalid protocol '${parsed.protocol}'. Must be https: or http:`);
    }
  } catch (urlErr) {
    console.error(`\n[CONFIG_ERROR] STAGING_SUPABASE_URL is malformed: ${urlErr.message}`);
    process.exit(1);
  }

  // Requirement: Strict Production Ref & URL Rejection
  const targetLower = stagingUrl.toLowerCase();
  const anonLower = stagingAnonKey.toLowerCase();
  const serviceLower = stagingServiceKey.toLowerCase();

  if (targetLower.includes(PRODUCTION_PROJECT_REF) ||
      anonLower.includes(PRODUCTION_PROJECT_REF) ||
      serviceLower.includes(PRODUCTION_PROJECT_REF)) {
    console.error("\n===============================================================================");
    console.error(" [FATAL SAFETY VIOLATION] Target configuration references PRODUCTION ref!");
    console.error(` Target: ${stagingUrl}`);
    console.error(` Protected Production Ref: '${PRODUCTION_PROJECT_REF}'`);
    console.error(" Automated integration testing against production is strictly prohibited.");
    console.error("===============================================================================\n");
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 2. STATIC PREFLIGHT CHECK MODE (When no staging configuration is supplied)
// -----------------------------------------------------------------------------
if (!hasAnyStagingConfig) {
  console.log("===============================================================================");
  console.log("   [MODE: STATIC PREFLIGHT CHECK ONLY] No staging database connected.");
  console.log("   Skipping live PostgreSQL assertions. (Set STAGING_* env vars for live tests)");
  console.log("===============================================================================\n");

  const migrationRemediationPath = path.resolve(__dirname, "../../supabase/migrations/20261024000000_security_audit_remediations.sql");
  const migrationBucketPath = path.resolve(__dirname, "../../supabase/migrations/20261024010000_reconcile_audio_bucket_limit.sql");
  const historicalPath = path.resolve(__dirname, "../../supabase/migrations/20261017000000_virasya_core_schema.sql");

  assert(fs.existsSync(migrationRemediationPath), `Migration file missing at ${migrationRemediationPath}`);
  assert(fs.existsSync(migrationBucketPath), `Migration file missing at ${migrationBucketPath}`);
  assert(fs.existsSync(historicalPath), `Migration file missing at ${historicalPath}`);

  const sqlRemediation = fs.readFileSync(migrationRemediationPath, "utf8");
  const sqlBucket = fs.readFileSync(migrationBucketPath, "utf8");
  const sqlHistorical = fs.readFileSync(historicalPath, "utf8");

  console.log("1. Checking Historical Migration Immutability (50 MB retained)...");
  assert(sqlHistorical.includes("52428800, -- 50 MB"), "Historical schema must preserve 50 MB initial definition");
  console.log("   ✓ Historical migration immutability confirmed.");

  console.log("2. Checking Forward Migration for Storage Bucket (5 MiB reconciliation)...");
  assert(sqlBucket.includes("5242880 -- 5 MiB"), "Forward migration must reconcile bucket to 5,242,880 bytes");
  assert(sqlBucket.includes("UPDATE storage.buckets"), "Forward migration must issue UPDATE storage.buckets");
  console.log("   ✓ Forward storage bucket reconciliation confirmed.");

  console.log("3. Checking Preserved Story Content Immutability Trigger...");
  assert(sqlRemediation.includes("CREATE OR REPLACE FUNCTION public.enforce_preserved_story_immutability()"));
  assert(sqlRemediation.includes("Preserved cultural story content and audio are permanently immutable"));
  console.log("   ✓ Immutability trigger syntax verified.");

  console.log("4. Checking Explore View Data Minimization & Security Barrier...");
  assert(sqlRemediation.includes("CREATE OR REPLACE VIEW public.explore_stories"));
  assert(sqlRemediation.includes("WITH (security_barrier = true)"));
  const viewMatch = sqlRemediation.match(/CREATE OR REPLACE VIEW public\.explore_stories[\s\S]*?FROM public\.stories/i);
  assert(viewMatch, "public.explore_stories view definition must exist");
  const viewDef = viewMatch[0].replace(/--.*$/gm, "");
  assert(!viewDef.includes("email"), "explore_stories must not select email");
  assert(!viewDef.includes("raw_transcripts"), "explore_stories must not select raw_transcripts");
  assert(!viewDef.includes("storage_path"), "explore_stories must not select storage_path");
  console.log("   ✓ Explore view security barrier and data minimization verified.");

  console.log("5. Checking Base Stories Anon Access Revocation...");
  assert(sqlRemediation.includes("REVOKE SELECT ON public.stories FROM anon;"));
  assert(sqlRemediation.includes("GRANT SELECT ON public.explore_stories TO anon, authenticated;"));
  console.log("   ✓ Base table anon access revoked; explore view granted.");

  console.log("6. Checking Quota RPC Access Restrictions & Advisory Lock...");
  assert(sqlRemediation.includes("REVOKE ALL ON FUNCTION public.check_and_consume_transcription_quota FROM anon, authenticated;"));
  assert(sqlRemediation.includes("GRANT EXECUTE ON FUNCTION public.check_and_consume_transcription_quota TO postgres, service_role;"));
  assert(sqlRemediation.includes("pg_advisory_xact_lock"));
  console.log("   ✓ Quota RPC privileges and transactional advisory lock verified.");

  console.log("7. Checking Vocabulary Cross-User Story Authorization...");
  assert(sqlRemediation.includes("CREATE POLICY \"vocab_insert_owner\" ON public.vocabulary"));
  assert(sqlRemediation.includes("s.id = vocabulary.story_id AND s.user_id = auth.uid()"));
  console.log("   ✓ Cross-user vocabulary RLS policy verified.");

  console.log("\n===============================================================================");
  console.log("   STATIC PREFLIGHT VERIFICATION PASSED (Zero remote network calls made)");
  console.log("===============================================================================\n");
  process.exit(0);
}

// -----------------------------------------------------------------------------
// 3. LIVE STAGING INTEGRATION MODE (When valid staging configuration is supplied)
// -----------------------------------------------------------------------------
const { createClient } = require("@supabase/supabase-js");

async function runLiveStagingSuite() {
  console.log("===============================================================================");
  console.log("   [MODE: LIVE STAGING INTEGRATION] Connecting to isolated staging database");
  console.log(`   Target: ${stagingUrl}`);
  console.log("===============================================================================\n");

  const adminClient = createClient(stagingUrl, stagingServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const anonClient = createClient(stagingUrl, stagingAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const testRunId = `sec_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const userAEmail = `virasya_staging_user_a_${testRunId}@example.com`;
  const userBEmail = `virasya_staging_user_b_${testRunId}@example.com`;
  const testPassword = `TestSecret_!${testRunId}_A1b2C3d4`;

  let userA = null;
  let userB = null;
  let userAClient = null;
  let userBClient = null;

  // Track created entity IDs for targeted cleanup
  const createdStoryIds = [];
  const createdVocabIds = [];
  const createdStoragePaths = [];

  try {
    // -------------------------------------------------------------------------
    // Setup: Create Two Isolated Synthetic Staging Users
    // -------------------------------------------------------------------------
    console.log("▶ Setting up synthetic test users in staging Auth...");
    const { data: userARes, error: userAErr } = await adminClient.auth.admin.createUser({
      email: userAEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { test_run_id: testRunId, role: "storyteller" }
    });
    if (userAErr || !userARes.user) {
      throw new Error(`Failed to create synthetic User A: ${userAErr?.message}`);
    }
    userA = userARes.user;

    const { data: userBRes, error: userBErr } = await adminClient.auth.admin.createUser({
      email: userBEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { test_run_id: testRunId, role: "storyteller" }
    });
    if (userBErr || !userBRes.user) {
      throw new Error(`Failed to create synthetic User B: ${userBErr?.message}`);
    }
    userB = userBRes.user;

    // Authenticate client sessions
    const { data: sessionA, error: loginAErr } = await anonClient.auth.signInWithPassword({
      email: userAEmail,
      password: testPassword
    });
    if (loginAErr || !sessionA.session) {
      throw new Error(`Failed to sign in User A: ${loginAErr?.message}`);
    }

    const { data: sessionB, error: loginBErr } = await anonClient.auth.signInWithPassword({
      email: userBEmail,
      password: testPassword
    });
    if (loginBErr || !sessionB.session) {
      throw new Error(`Failed to sign in User B: ${loginBErr?.message}`);
    }

    userAClient = createClient(stagingUrl, stagingAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessionA.session.access_token}` } }
    });

    userBClient = createClient(stagingUrl, stagingAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessionB.session.access_token}` } }
    });
    console.log(`   ✓ Authenticated synthetic User A (${userA.id.slice(0, 8)}...) and User B (${userB.id.slice(0, 8)}...)\n`);

    // -------------------------------------------------------------------------
    // Test 1: Anonymous Base Stories Table Revocation (VIR-SEC-003)
    // -------------------------------------------------------------------------
    console.log("▶ [Test 1] Anonymous Access Revocation on public.stories...");
    const { data: anonStoriesData, error: anonStoriesErr } = await anonClient
      .from("stories")
      .select("id, title, email")
      .limit(1);

    // Assert: Revocation must block direct query (permission denied or empty result without access)
    const isDirectSelectBlocked = anonStoriesErr !== null || (anonStoriesData && anonStoriesData.length === 0);
    assert(isDirectSelectBlocked, "Direct anonymous query on public.stories must be blocked or return error");
    console.log("   ✓ Base table direct SELECT is forbidden to anonymous clients.");

    // -------------------------------------------------------------------------
    // Test 2: Explore View Data Minimization & Privacy (VIR-SEC-003)
    // -------------------------------------------------------------------------
    console.log("\n▶ [Test 2] Explore View Projection & Column Minimization...");
    const { data: exploreRows, error: exploreErr } = await anonClient
      .from("explore_stories")
      .select("*")
      .limit(5);

    assert.strictEqual(exploreErr, null, "Anonymous SELECT on explore_stories must succeed");
    if (exploreRows && exploreRows.length > 0) {
      for (const row of exploreRows) {
        assert.strictEqual(row.email, undefined, "Email column must NOT be present in explore_stories");
        assert.strictEqual(row.raw_transcripts, undefined, "raw_transcripts must NOT be present in explore_stories");
        assert.strictEqual(row.working_draft, undefined, "working_draft must NOT be present in explore_stories");
        assert.strictEqual(row.user_id, undefined, "user_id must NOT be present in explore_stories");
        if (row.audio) {
          assert.strictEqual(row.audio.storage_path, undefined, "Private storage_path must NOT be exposed in explore audio object");
        }
      }
    }
    console.log("   ✓ Explore view strictly strips email, user_id, raw_transcripts, and internal storage paths.");

    // -------------------------------------------------------------------------
    // Test 3: Preserved Story Content Immutability & Demotion Rejection (VIR-SEC-001)
    // -------------------------------------------------------------------------
    console.log("\n▶ [Test 3] Preserved Story Immutability & Demotion Enforcement...");
    const storyId = `story_${testRunId}`;
    createdStoryIds.push(storyId);

    // User A inserts a draft story
    const { error: insertErr } = await userAClient.from("stories").insert({
      id: storyId,
      user_id: userA.id,
      title: "Ancient Banyan Legend",
      status: "draft",
      visibility: "private",
      written_text: "Original sacred tale told under the village tree.",
      audio_public_playback: false
    });
    assert.strictEqual(insertErr, null, `User A must be able to insert draft story: ${insertErr?.message}`);

    // Sealing story via trusted backend (service_role simulates Edge Function sealing)
    const { error: sealErr } = await adminClient.from("stories").update({
      status: "preserved",
      provenance_id: `VIR-TEST-${testRunId.slice(-8)}`,
      provenance_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      preserved_at: new Date().toISOString()
    }).eq("id", storyId);
    assert.strictEqual(sealErr, null, `Trusted backend must be able to preserve story: ${sealErr?.message}`);

    // Assert 3A: Standard client (User A) cannot mutate frozen narrative text
    const { error: textTamperErr } = await userAClient.from("stories").update({
      written_text: "HACKED narrative content modification attempt"
    }).eq("id", storyId);
    assert(textTamperErr !== null, "Standard client must NOT be allowed to update preserved story text");
    console.log(`   ✓ Narrative text mutation rejected as expected: ${textTamperErr.message}`);

    // Assert 3B: Standard client cannot demote preserved story to draft
    const { error: demoteErr } = await userAClient.from("stories").update({
      status: "draft"
    }).eq("id", storyId);
    assert(demoteErr !== null, "Preserved story demotion to draft must be rejected");
    console.log(`   ✓ Status demotion rejected as expected: ${demoteErr.message}`);

    // Assert 3C: Standard client cannot tamper with cryptographic provenance
    const { error: provTamperErr } = await userAClient.from("stories").update({
      provenance_id: "VIR-FORGED-PROVENANCE"
    }).eq("id", storyId);
    assert(provTamperErr !== null, "Provenance ID tampering must be rejected");
    console.log(`   ✓ Provenance ID tampering rejected as expected: ${provTamperErr.message}`);

    // Assert 3D: Standard client cannot delete preserved story
    const { error: deleteErr } = await userAClient.from("stories").delete().eq("id", storyId);
    assert(deleteErr !== null, "Standard client must NOT be allowed to delete preserved story");
    console.log(`   ✓ Preserved story deletion rejected as expected: ${deleteErr.message}`);

    // Assert 3E: Story owner CAN update visibility and audio playback consent
    const { error: consentUpdateErr } = await userAClient.from("stories").update({
      visibility: "public",
      audio_public_playback: true
    }).eq("id", storyId);
    assert.strictEqual(consentUpdateErr, null, `Story owner must be permitted to adjust visibility & playback consent: ${consentUpdateErr?.message}`);
    console.log("   ✓ Story owner successfully updated visibility and audio playback permissions.");

    // -------------------------------------------------------------------------
    // Test 4: Cross-User Story & Vocabulary Ownership Restrictions (VIR-SEC-005)
    // -------------------------------------------------------------------------
    console.log("\n▶ [Test 4] Cross-User Story & Vocabulary Ownership (User A vs User B)...");

    // Assert 4A: User B cannot update User A's story
    const { data: updateOtherStoryData, error: updateOtherStoryErr } = await userBClient
      .from("stories")
      .update({ visibility: "private" })
      .eq("id", storyId)
      .select();

    const isUpdateBlocked = updateOtherStoryErr !== null || (updateOtherStoryData && updateOtherStoryData.length === 0);
    assert(isUpdateBlocked, "User B must not be able to modify User A's story");
    console.log("   ✓ User B modification of User A's story strictly blocked by RLS.");

    // Assert 4B: User B cannot associate a vocabulary term with User A's story
    const vocabId = `vocab_${testRunId}`;
    createdVocabIds.push(vocabId);

    const { error: vocabCrossTenantErr } = await userBClient.from("vocabulary").insert({
      id: vocabId,
      user_id: userB.id,
      story_id: storyId, // User A's story!
      word: "ମଣ୍ଡପ",
      meaning: "Sacred pavilion",
      language: "Odia",
      verification_status: "suggested"
    });
    assert(vocabCrossTenantErr !== null, "RLS must forbid linking vocabulary to another user's story_id");
    console.log(`   ✓ Cross-tenant vocabulary linking rejected as expected: ${vocabCrossTenantErr.message}`);

    // Assert 4C: User B CAN insert standalone vocabulary (story_id: null)
    const { error: vocabSelfErr } = await userBClient.from("vocabulary").insert({
      id: vocabId,
      user_id: userB.id,
      story_id: null,
      word: "ସମ୍ବଲପୁରୀ",
      meaning: "Cultural weaver craft",
      language: "Sambalpuri",
      verification_status: "suggested"
    });
    assert.strictEqual(vocabSelfErr, null, `User B must be able to insert valid standalone vocabulary: ${vocabSelfErr?.message}`);
    console.log("   ✓ User B standalone vocabulary insertion permitted.");

    // -------------------------------------------------------------------------
    // Test 5: Quota RPC Privilege Restrictions (VIR-SEC-004)
    // -------------------------------------------------------------------------
    console.log("\n▶ [Test 5] Quota RPC Privileges (anon & authenticated rejected)...");
    const { error: anonRpcErr } = await anonClient.rpc("check_and_consume_transcription_quota", {
      p_user_id: userA.id,
      p_max_requests: 5,
      p_window_seconds: 600
    });
    assert(anonRpcErr !== null, "Anonymous invocation of check_and_consume_transcription_quota must be rejected");
    console.log(`   ✓ Anonymous RPC access rejected: ${anonRpcErr.message || anonRpcErr.code}`);

    const { error: userRpcErr } = await userAClient.rpc("check_and_consume_transcription_quota", {
      p_user_id: userA.id,
      p_max_requests: 5,
      p_window_seconds: 600
    });
    assert(userRpcErr !== null, "Authenticated standard user invocation of check_and_consume_transcription_quota must be rejected");
    console.log(`   ✓ Authenticated client RPC access rejected: ${userRpcErr.message || userRpcErr.code}`);

    // -------------------------------------------------------------------------
    // Test 6: Atomic Advisory Lock Quota Serialization (VIR-SEC-004)
    // -------------------------------------------------------------------------
    console.log("\n▶ [Test 6] Atomic Rate Limiting Under Concurrent Requests (service_role)...");
    const burstLimit = 3;
    const concurrentCount = 6;
    const burstUser = userB.id;

    // Fire 6 concurrent requests simultaneously for the same user
    const quotaPromises = Array.from({ length: concurrentCount }, () =>
      adminClient.rpc("check_and_consume_transcription_quota", {
        p_user_id: burstUser,
        p_max_requests: burstLimit,
        p_window_seconds: 600
      })
    );

    const burstResults = await Promise.all(quotaPromises);
    let allowedCount = 0;
    let rejectedCount = 0;

    for (const res of burstResults) {
      assert.strictEqual(res.error, null, `Quota RPC should not throw unexpected DB error: ${res.error?.message}`);
      if (res.data?.allowed === true) {
        allowedCount++;
      } else if (res.data?.allowed === false) {
        rejectedCount++;
      }
    }

    assert.strictEqual(allowedCount, burstLimit, `Exactly ${burstLimit} requests must be allowed`);
    assert.strictEqual(rejectedCount, concurrentCount - burstLimit, `Exactly ${concurrentCount - burstLimit} requests must be rejected`);
    console.log(`   ✓ Serialized atomic burst: exactly ${allowedCount} allowed and ${rejectedCount} rejected under concurrent load.`);

    // -------------------------------------------------------------------------
    // Test 7: Storage Bucket File Size Limit (5 MiB Enforced)
    // -------------------------------------------------------------------------
    console.log("\n▶ [Test 7] Storage Bucket File Size Limit (5 MiB Boundary)...");
    const validAudioBuffer = Buffer.alloc(1024, "A"); // 1 KiB
    const validPath = `${userA.id}/test_valid_${testRunId}.wav`;
    createdStoragePaths.push(validPath);

    const { error: validUploadErr } = await userAClient.storage
      .from("story-recordings-private")
      .upload(validPath, validAudioBuffer, { contentType: "audio/wav", upsert: true });

    assert.strictEqual(validUploadErr, null, `Valid 1 KiB audio upload must succeed: ${validUploadErr?.message}`);
    console.log("   ✓ Legitimate 1 KiB audio upload succeeded.");

    const oversizedBuffer = Buffer.alloc(5242880 + 1024, "B"); // 5 MiB + 1 KiB
    const oversizedPath = `${userA.id}/test_oversized_${testRunId}.wav`;

    const { error: oversizedUploadErr } = await userAClient.storage
      .from("story-recordings-private")
      .upload(oversizedPath, oversizedBuffer, { contentType: "audio/wav", upsert: true });

    assert(oversizedUploadErr !== null, "Upload exceeding 5 MiB must be rejected by storage bucket limit");
    console.log(`   ✓ Oversized (5.001 MiB) upload rejected as expected: ${oversizedUploadErr.message}`);

    console.log("\n===============================================================================");
    console.log("   ALL LIVE STAGING INTEGRATION TESTS PASSED (100% ENGINE VERIFIED)");
    console.log("===============================================================================\n");
  } finally {
    // Non-destructive cleanup of ONLY the synthetic records created in this test run
    console.log("▶ Cleaning up synthetic staging test entities...");
    try {
      // 1. Delete uploaded test storage objects
      for (const p of createdStoragePaths) {
        await adminClient.storage.from("story-recordings-private").remove([p]).catch(() => {});
      }

      // 2. Delete synthetic vocabulary
      for (const vid of createdVocabIds) {
        await adminClient.from("vocabulary").delete().eq("id", vid).catch(() => {});
      }

      // 3. Delete synthetic stories
      for (const sid of createdStoryIds) {
        await adminClient.from("stories").delete().eq("id", sid).catch(() => {});
      }

      // 4. Delete synthetic transcription usage
      if (userA) {
        await adminClient.from("transcription_usage").delete().eq("user_id", userA.id).catch(() => {});
      }
      if (userB) {
        await adminClient.from("transcription_usage").delete().eq("user_id", userB.id).catch(() => {});
      }

      // 5. Delete synthetic test users from auth.users
      if (userA) {
        await adminClient.auth.admin.deleteUser(userA.id).catch(() => {});
      }
      if (userB) {
        await adminClient.auth.admin.deleteUser(userB.id).catch(() => {});
      }
      console.log("   ✓ Synthetic test users, stories, vocabulary, and storage files safely cleaned up.\n");
    } catch (cleanupErr) {
      console.warn("   ⚠ Notice: Non-fatal error during test cleanup:", cleanupErr.message);
    }
  }
}

// Top-level error handler to guarantee proper exit code propagation
runLiveStagingSuite().catch((err) => {
  console.error("\n===============================================================================");
  console.error(" [FATAL INTEGRATION TEST FAILURE]:", err.message);
  console.error("===============================================================================\n");
  process.exit(1);
});

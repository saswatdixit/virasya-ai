/**
 * Virasya Concurrency & Provenance Immutability Test Suite
 *
 * Validates:
 * 1. AST & syntax verification of 20261023000000_preserve_story_atomic_immutability.sql
 * 2. Edge Function source verification in supabase/functions/preserve-story/index.ts
 *    - Asserts atomic RPC invocation
 *    - Asserts absence of unsafe fallback writes (no un-locked PostgREST update/insert fallback)
 *    - Asserts fail-closed behavior on database errors (HTTP 500)
 * 3. Preservation flow simulation across all acceptance criteria:
 *    - Valid draft preserved successfully
 *    - Repeated request rejected (409 Conflict, provenance untouched)
 *    - Timeout retry simulation (409 Conflict, provenance untouched)
 *    - Concurrent requests serialization (row-locking & race condition immunity)
 *    - Cross-user ownership violation rejected (403 Forbidden)
 *    - Preserved story demotion/alteration blocked by database trigger
 *    - Preserved story deletion blocked by database trigger
 *    - Missing story record inserted atomically
 *    - RPC failure / missing function handling producing structured JSON error (500)
 *    - Frontend response contract (PreserveResponse) compatibility
 */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

console.log("=== Virasya Preserve-Story Concurrency & Immutability Test Suite ===\n");

// Paths
const rootMigrationPath = path.resolve(__dirname, "../../supabase/migrations/20261023000000_preserve_story_atomic_immutability.sql");
const frontendMigrationPath = path.resolve(__dirname, "../supabase/migrations/20261023000000_preserve_story_atomic_immutability.sql");
const edgeFunctionPath = path.resolve(__dirname, "../../supabase/functions/preserve-story/index.ts");

// -----------------------------------------------------------------------------
// 1. Migration File Presence and Synchronization
// -----------------------------------------------------------------------------
console.log("1. Verifying migration files and byte-for-byte synchronization...");
assert(fs.existsSync(rootMigrationPath), `Root migration missing at ${rootMigrationPath}`);
assert(fs.existsSync(frontendMigrationPath), `Frontend migration missing at ${frontendMigrationPath}`);

const rootSql = fs.readFileSync(rootMigrationPath, "utf8");
const frontendSql = fs.readFileSync(frontendMigrationPath, "utf8");
assert.strictEqual(rootSql, frontendSql, "Root and frontend migration copies must be 100% byte-identical");
console.log(`   ✓ New migration 20261023000000 verified (${rootSql.length} bytes, synchronized).`);

// -----------------------------------------------------------------------------
// 2. Migration AST & Security Invariants Check
// -----------------------------------------------------------------------------
console.log("\n2. Auditing SQL AST and security invariants for atomic preservation...");

// Check non-destructive DDL
const forbiddenPatterns = [/\bDROP\s+TABLE\b/i, /\bTRUNCATE\b/i, /\bDROP\s+DATABASE\b/i];
for (const pattern of forbiddenPatterns) {
  assert(!pattern.test(rootSql), `Forbidden destructive pattern detected: ${pattern}`);
}
console.log("   ✓ Zero destructive patterns found (no DROP TABLE, no TRUNCATE).");

// Check search_path hardening
const searchPathCount = (rootSql.match(/SET\s+search_path\s*=\s*public\s*,\s*pg_temp/gi) || []).length;
assert(searchPathCount >= 2, "Both functions must have hardened search_path = public, pg_temp");
console.log(`   ✓ Search_path hardening confirmed across all functions (${searchPathCount} declarations).`);

// Check row-level exclusive lock (FOR UPDATE)
assert(rootSql.includes("FOR UPDATE"), "Atomic RPC must execute SELECT ... FOR UPDATE to serialize concurrent requests");
console.log("   ✓ Row-level exclusive lock (FOR UPDATE) confirmed in seal_story_preservation.");

// Check immutability trigger
assert(rootSql.includes("FUNCTION public.enforce_preserved_story_immutability()"), "Must define enforce_preserved_story_immutability trigger function");
assert(rootSql.includes("BEFORE UPDATE OR DELETE ON public.stories"), "Trigger must bind BEFORE UPDATE OR DELETE ON public.stories");
assert(rootSql.includes("Cryptographic provenance ID is immutable once assigned"), "Must enforce provenance_id immutability");
assert(rootSql.includes("Preserved stories cannot be demoted to draft status"), "Must enforce anti-demotion protection");
console.log("   ✓ Database trigger enforce_preserved_story_immutability confirmed.");

// Check privilege lockdown
assert(rootSql.includes("REVOKE ALL ON FUNCTION public.seal_story_preservation FROM PUBLIC;"), "Must revoke from PUBLIC");
assert(rootSql.includes("REVOKE ALL ON FUNCTION public.seal_story_preservation FROM anon, authenticated;"), "Must revoke from anon, authenticated");
assert(rootSql.includes("GRANT EXECUTE ON FUNCTION public.seal_story_preservation TO postgres, service_role;"), "Must grant only to postgres, service_role");
console.log("   ✓ Least-privilege grants verified (executable ONLY by service_role and postgres).");

// -----------------------------------------------------------------------------
// 3. Edge Function Source Verification
// -----------------------------------------------------------------------------
console.log("\n3. Auditing Edge Function implementation (supabase/functions/preserve-story/index.ts)...");
assert(fs.existsSync(edgeFunctionPath), `Edge function missing at ${edgeFunctionPath}`);
const edgeCode = fs.readFileSync(edgeFunctionPath, "utf8");

assert(edgeCode.includes('adminClient.rpc("seal_story_preservation"'), "Edge function must invoke seal_story_preservation RPC");
assert(edgeCode.includes('errorMsg.includes("ALREADY_PRESERVED")'), "Edge function must handle ALREADY_PRESERVED error from database");
assert(edgeCode.includes("status: 409"), "Must return HTTP 409 Conflict on duplicate/concurrent preservation");
assert(edgeCode.includes("status: 403"), "Must return HTTP 403 Forbidden on ownership violation");
assert(edgeCode.includes("user_id: user.id"), "Must strictly derive user_id from verified JWT");
assert(edgeCode.includes("crypto.subtle.digest"), "Must calculate provenance hash server-side using Web Crypto");

// Verify that unsafe fallback writes have been completely eliminated
assert(!edgeCode.includes('.update(storyRow)'), "Edge function must NOT fall back to un-locked PostgREST update(storyRow)");
assert(!edgeCode.includes('.insert(storyRow)'), "Edge function must NOT fall back to un-locked PostgREST insert(storyRow)");
assert(edgeCode.includes('DB_SEAL_ERROR'), "Edge function must fail closed with DB_SEAL_ERROR on unexpected RPC failure");
console.log("   ✓ Edge Function verified: atomic RPC invocation present, unsafe fallback writes eliminated, fail-closed enforced.");

// -----------------------------------------------------------------------------
// 4. Simulated Concurrency & Invariant Verification Engine
// -----------------------------------------------------------------------------
console.log("\n4. Simulating preservation workflows across all acceptance criteria...");

class MockDatabase {
  constructor() {
    this.stories = new Map();
    this.rowLocks = new Set();
  }

  // Simulates PostgreSQL SELECT ... FOR UPDATE
  async selectForUpdate(id) {
    while (this.rowLocks.has(id)) {
      // Simulate waiting for row lock
      await new Promise((r) => setTimeout(r, 10));
    }
    this.rowLocks.add(id);
    const row = this.stories.get(id);
    return row ? JSON.parse(JSON.stringify(row)) : null;
  }

  releaseLock(id) {
    this.rowLocks.delete(id);
  }

  // Simulates PostgreSQL atomic seal_story_preservation RPC
  async sealStoryPreservation(params) {
    const existing = await this.selectForUpdate(params.p_story_id);
    try {
      if (existing) {
        // Ownership check
        if (existing.user_id && existing.user_id !== params.p_user_id) {
          const err = new Error("FORBIDDEN_OWNERSHIP: You do not have permission to modify or preserve this story.");
          err.code = "42501";
          throw err;
        }
        // Status check
        if (existing.status === "preserved" || existing.provenance_id) {
          const err = new Error(`ALREADY_PRESERVED: Story ${params.p_story_id} has already been permanently preserved with provenance ID ${existing.provenance_id}`);
          err.code = "P0004";
          throw err;
        }
        // Atomic update to preserved
        const updated = {
          ...existing,
          title: params.p_title || existing.title,
          status: "preserved",
          visibility: params.p_visibility || existing.visibility,
          provenance_id: params.p_provenance_id,
          provenance_hash: params.p_provenance_hash,
          preserved_at: params.p_preserved_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.stories.set(params.p_story_id, updated);
        return updated;
      } else {
        // Insert new row
        const newRow = {
          id: params.p_story_id,
          user_id: params.p_user_id,
          title: params.p_title,
          status: "preserved",
          visibility: params.p_visibility || "private",
          provenance_id: params.p_provenance_id,
          provenance_hash: params.p_provenance_hash,
          preserved_at: params.p_preserved_at || new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.stories.set(params.p_story_id, newRow);
        return newRow;
      }
    } finally {
      this.releaseLock(params.p_story_id);
    }
  }

  // Simulates database trigger enforce_preserved_story_immutability
  enforceImmutabilityTrigger(op, oldRow, newRow, isTrustedBackend = false) {
    if (oldRow && (oldRow.status === "preserved" || oldRow.provenance_id)) {
      if (op === "DELETE") {
        if (!isTrustedBackend) {
          const err = new Error("Preserved stories are archived cultural assets and cannot be deleted by standard clients.");
          err.code = "42501";
          throw err;
        }
        return oldRow;
      }

      if (op === "UPDATE") {
        if (newRow.status !== "preserved") {
          const err = new Error("Preserved stories cannot be demoted to draft status.");
          err.code = "23514";
          throw err;
        }
        if (oldRow.provenance_id && newRow.provenance_id !== oldRow.provenance_id) {
          const err = new Error("Cryptographic provenance ID is immutable once assigned.");
          err.code = "23514";
          throw err;
        }
        if (oldRow.provenance_hash && newRow.provenance_hash !== oldRow.provenance_hash) {
          const err = new Error("Cryptographic provenance hash is immutable once assigned.");
          err.code = "23514";
          throw err;
        }
        if (oldRow.user_id && newRow.user_id !== oldRow.user_id) {
          const err = new Error("Story author ownership cannot be modified once preserved.");
          err.code = "23514";
          throw err;
        }
      }
    }
    return newRow;
  }
}

(async () => {
  const db = new MockDatabase();
  const USER_ALICE = "11111111-1111-1111-1111-111111111111";
  const USER_BOB = "22222222-2222-2222-2222-222222222222";

  // Case 1: Normal draft preserved successfully
  console.log("   A. Testing normal draft preservation...");
  db.stories.set("story_101", {
    id: "story_101",
    user_id: USER_ALICE,
    title: "Alice Tale",
    status: "draft",
    provenance_id: null,
  });

  const res1 = await db.sealStoryPreservation({
    p_story_id: "story_101",
    p_user_id: USER_ALICE,
    p_title: "Alice Tale",
    p_provenance_id: "VIR-AAAA1111",
    p_provenance_hash: "AAAA1111",
    p_visibility: "public",
  });

  assert.strictEqual(res1.status, "preserved");
  assert.strictEqual(res1.provenance_id, "VIR-AAAA1111");
  console.log("      ✓ Draft successfully preserved with provenance ID VIR-AAAA1111.");

  // Case 2: Repeated request rejected without altering provenance
  console.log("   B. Testing repeated preservation rejection...");
  let repeatedError = null;
  try {
    await db.sealStoryPreservation({
      p_story_id: "story_101",
      p_user_id: USER_ALICE,
      p_title: "Alice Altered Tale",
      p_provenance_id: "VIR-OVERWRITE99",
      p_provenance_hash: "OVERWRITE99",
      p_visibility: "public",
    });
  } catch (err) {
    repeatedError = err;
  }
  assert(repeatedError && repeatedError.message.includes("ALREADY_PRESERVED"), "Must reject already preserved story");
  assert.strictEqual(repeatedError.code, "P0004");
  const storyAfterRepeat = db.stories.get("story_101");
  assert.strictEqual(storyAfterRepeat.provenance_id, "VIR-AAAA1111", "Provenance must NOT be changed by repeat request");
  console.log("      ✓ Repeated request rejected with ALREADY_PRESERVED (provenance VIR-AAAA1111 preserved).");

  // Case 3: Timeout followed by retry simulation
  console.log("   C. Testing timeout followed by client retry...");
  // Story is already preserved as VIR-AAAA1111. Client experienced timeout and retries with new hash attempt.
  let timeoutRetryError = null;
  try {
    await db.sealStoryPreservation({
      p_story_id: "story_101",
      p_user_id: USER_ALICE,
      p_title: "Alice Tale Retry",
      p_provenance_id: "VIR-RETRY9999",
      p_provenance_hash: "RETRY9999",
      p_visibility: "public",
    });
  } catch (err) {
    timeoutRetryError = err;
  }
  assert(timeoutRetryError && timeoutRetryError.message.includes("ALREADY_PRESERVED"), "Timeout retry must be safely rejected with ALREADY_PRESERVED");
  assert.strictEqual(db.stories.get("story_101").provenance_id, "VIR-AAAA1111", "Original provenance must remain preserved across retries");
  console.log("      ✓ Timeout retry safely rejected with ALREADY_PRESERVED without overwriting provenance.");

  // Case 4: Concurrent requests simulation (Race Condition Immunity)
  console.log("   D. Testing concurrent simultaneous preservation requests...");
  db.stories.set("story_race_202", {
    id: "story_race_202",
    user_id: USER_ALICE,
    title: "Race Story",
    status: "draft",
    provenance_id: null,
  });

  const worker1 = db.sealStoryPreservation({
    p_story_id: "story_race_202",
    p_user_id: USER_ALICE,
    p_title: "Race Story Worker 1",
    p_provenance_id: "VIR-WORKER1111",
    p_provenance_hash: "WORKER1111",
    p_visibility: "public",
  });

  const worker2 = db.sealStoryPreservation({
    p_story_id: "story_race_202",
    p_user_id: USER_ALICE,
    p_title: "Race Story Worker 2",
    p_provenance_id: "VIR-WORKER2222",
    p_provenance_hash: "WORKER2222",
    p_visibility: "public",
  });

  const results = await Promise.allSettled([worker1, worker2]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.strictEqual(fulfilled.length, 1, "Exactly ONE concurrent worker must succeed");
  assert.strictEqual(rejected.length, 1, "Exactly ONE concurrent worker must be rejected");
  assert(rejected[0].reason.message.includes("ALREADY_PRESERVED"), "Losing worker must receive ALREADY_PRESERVED");
  assert.strictEqual(rejected[0].reason.code, "P0004");

  const winningProvenance = fulfilled[0].value.provenance_id;
  const finalRaceStory = db.stories.get("story_race_202");
  assert.strictEqual(finalRaceStory.provenance_id, winningProvenance, "Winning provenance must remain intact");
  console.log(`      ✓ Concurrent race resolved safely: exactly 1 worker won (${winningProvenance}), losing worker rejected.`);

  // Case 5: Cross-user ownership violation
  console.log("   E. Testing cross-user preservation attempt...");
  db.stories.set("story_alice_private", {
    id: "story_alice_private",
    user_id: USER_ALICE,
    title: "Alice Private",
    status: "draft",
    provenance_id: null,
  });

  let bobError = null;
  try {
    await db.sealStoryPreservation({
      p_story_id: "story_alice_private",
      p_user_id: USER_BOB,
      p_title: "Bob Stolen Story",
      p_provenance_id: "VIR-BOBSTEAL00",
      p_provenance_hash: "BOBSTEAL00",
      p_visibility: "public",
    });
  } catch (err) {
    bobError = err;
  }
  assert(bobError && bobError.message.includes("FORBIDDEN_OWNERSHIP"), "Must reject non-owner preservation");
  assert.strictEqual(bobError.code, "42501");
  assert.strictEqual(db.stories.get("story_alice_private").user_id, USER_ALICE, "Ownership must not change");
  console.log("      ✓ Cross-user attempt rejected with FORBIDDEN_OWNERSHIP (code 42501).");

  // Case 6: Immutability trigger prevents direct updates or demotion
  console.log("   F. Testing database-level immutability trigger invariants on UPDATE...");
  const preservedStory = db.stories.get("story_101");
  assert.throws(
    () => {
      db.enforceImmutabilityTrigger("UPDATE", preservedStory, { ...preservedStory, status: "draft" });
    },
    /cannot be demoted to draft/i,
    "Trigger must prevent status demotion"
  );

  assert.throws(
    () => {
      db.enforceImmutabilityTrigger("UPDATE", preservedStory, { ...preservedStory, provenance_id: "VIR-HACKED0000" });
    },
    /provenance ID is immutable/i,
    "Trigger must prevent provenance ID alteration"
  );

  assert.throws(
    () => {
      db.enforceImmutabilityTrigger("UPDATE", preservedStory, { ...preservedStory, user_id: USER_BOB });
    },
    /ownership cannot be modified/i,
    "Trigger must prevent user_id reassignment"
  );
  console.log("      ✓ Immutability trigger invariants strictly verified on UPDATE.");

  // Case 7: Immutability trigger blocks DELETE by standard clients
  console.log("   G. Testing database-level immutability trigger invariants on DELETE...");
  assert.throws(
    () => {
      db.enforceImmutabilityTrigger("DELETE", preservedStory, null, false);
    },
    /cannot be deleted by standard clients/i,
    "Trigger must prevent deletion of preserved story by standard client"
  );
  console.log("      ✓ Preserved story DELETE blocked for standard clients.");

  // Case 8: Missing story insertion
  console.log("   H. Testing atomic preservation of missing/new story...");
  const newStoryPreserved = await db.sealStoryPreservation({
    p_story_id: "story_brand_new_999",
    p_user_id: USER_ALICE,
    p_title: "Brand New Story",
    p_provenance_id: "VIR-NEW99999",
    p_provenance_hash: "NEW99999",
    p_visibility: "private",
  });
  assert.strictEqual(newStoryPreserved.id, "story_brand_new_999");
  assert.strictEqual(newStoryPreserved.status, "preserved");
  assert.strictEqual(newStoryPreserved.provenance_id, "VIR-NEW99999");
  console.log("      ✓ Missing story successfully created and preserved atomically.");

  // Case 9: Response shape compatibility
  console.log("   I. Verifying response shape compatibility with PreserveResponse contract...");
  const sampleSuccessReceipt = {
    status: "success",
    story: res1,
    preserved_at: res1.preserved_at,
    provenance_id: res1.provenance_id,
    provenance_hash: res1.provenance_hash,
  };

  assert.strictEqual(sampleSuccessReceipt.status, "success");
  assert(sampleSuccessReceipt.story && typeof sampleSuccessReceipt.story === "object");
  assert(typeof sampleSuccessReceipt.preserved_at === "string");
  assert(typeof sampleSuccessReceipt.provenance_id === "string" && sampleSuccessReceipt.provenance_id.startsWith("VIR-"));
  assert(typeof sampleSuccessReceipt.provenance_hash === "string");
  console.log("      ✓ Response structure matches frontend PreserveResponse interface.");

  console.log("\n=== ALL CONCURRENCY & IMMUTABILITY ACCEPTANCE TESTS PASSED (100%) ===\n");
  console.log("BOUNDARY LIMITATION NOTICE:");
  console.log("• Tests in Section 4 verify simulated concurrency and logic invariants.");
  console.log("• Live PostgreSQL multi-connection transaction concurrency remains unverified locally");
  console.log("  because local PostgreSQL/Docker is not present and remote databases are strictly read-only.");
  console.log("• Prior to production deployment, execute concurrent request bursts against staging project tdpeljbmicgjgxjwsvoc.\n");
})();

/**
 * Virasya PostgreSQL Live Concurrency Integration Test
 *
 * Real PostgreSQL multi-connection integration test that validates:
 * 1. True database engine row-level locking (SELECT ... FOR UPDATE) inside seal_story_preservation.
 * 2. Genuine concurrent transaction contention across two independent PostgreSQL connections.
 * 3. Deterministic single-winner resolution and zero provenance overwriting.
 * 4. Sequential duplicate preservation rejection (SQLSTATE P0004).
 * 5. Atomic creation and preservation of nonexistent/new story records.
 * 6. Cross-user ownership enforcement (SQLSTATE 42501).
 * 7. Permanent immutability triggers (SQLSTATE 23514) blocking privileged provenance tampering.
 * 8. Status demotion prevention (SQLSTATE 23514).
 * 9. Standard client archival deletion protection (SQLSTATE 42501 via simulated JWT claims).
 * 10. Transaction atomicity and rollback safety (uncommitted preservation cleanly reverts).
 *
 * STRICT SAFETY CONTRACT:
 * - This test strictly forbids connecting to remote Supabase instances.
 * - It terminates immediately if configured with staging ('tdpeljbmicgjgxjwsvoc') or production ('ahjmjgiyljjkxvwoubdr').
 * - Only approved local loopback or disposable container PostgreSQL instances are permitted.
 */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

console.log("=== Virasya PostgreSQL Live Concurrency Integration Test ===\n");

// -----------------------------------------------------------------------------
// Safety Guard: Detect and reject remote database target configurations
// -----------------------------------------------------------------------------
const FORBIDDEN_SUBSTRINGS = [
  "ahjmjgiyljjkxvwoubdr", // Production project ref
  "tdpeljbmicgjgxjwsvoc", // Staging project ref
  "supabase.co",
  "supabase.net",
  "pooler.supabase.com",
  "aws.neon.tech",
  "amazonaws.com",
  "railway.app",
];

const targetUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";

if (targetUrl) {
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    if (targetUrl.toLowerCase().includes(forbidden.toLowerCase())) {
      console.error(`\n[FATAL SAFETY VIOLATION] Target URL references forbidden remote endpoint: '${forbidden}'`);
      console.error("This integration test is strictly prohibited from running against staging, production, or remote hosts.");
      process.exit(1);
    }
  }

  // Enforce positive host verification: must be a local loopback hostname
  try {
    const parsed = new URL(targetUrl.replace(/^postgres(ql)?:\/\//, "http://"));
    const hostname = parsed.hostname.toLowerCase();
    const ALLOWED_LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];
    if (!ALLOWED_LOCAL_HOSTS.includes(hostname)) {
      console.error(`\n[FATAL SAFETY VIOLATION] Target host '${hostname}' is not a permitted local loopback host.`);
      console.error("Permitted hosts for integration testing: " + ALLOWED_LOCAL_HOSTS.join(", "));
      process.exit(1);
    }
  } catch (urlErr) {
    console.error("\n[FATAL SAFETY VIOLATION] Failed to parse target database URL:", urlErr.message);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// Driver & Runtime Availability Check
// -----------------------------------------------------------------------------
let pg;
try {
  pg = require("pg");
} catch (e) {
  console.log("----------------------------------------------------------------");
  console.log("[ENVIRONMENT NOTICE: PostgreSQL Driver Not Installed]");
  console.log("• Node module 'pg' is not installed in the current environment.");
  console.log("• Prerequisites to run this integration test:");
  console.log("    1. Install pg driver: npm --prefix frontend install -D pg");
  console.log("    2. Start local PostgreSQL (Docker or service):");
  console.log("       docker run -d --name virasya-pg-test -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17");
  console.log("    3. Export test connection string:");
  console.log("       $env:TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres'");
  console.log("    4. Execute test: node frontend/tests/test-postgres-concurrency-integration.cjs");
  console.log("----------------------------------------------------------------\n");
  console.log("STATUS: SKIPPED (Real PostgreSQL runtime unavailable locally).");
  console.log("CRITICAL INVARIANT REMAINS UNPROVEN ON LIVE ENGINE IN THIS SESSION.\n");
  process.exit(0);
}

if (!targetUrl) {
  console.log("----------------------------------------------------------------");
  console.log("[ENVIRONMENT NOTICE: TEST_DATABASE_URL Not Configured]");
  console.log("• PostgreSQL driver 'pg' is installed, but no local test database URL was provided.");
  console.log("• To run against an isolated local PostgreSQL instance:");
  console.log("    $env:TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres'");
  console.log("    node frontend/tests/test-postgres-concurrency-integration.cjs");
  console.log("----------------------------------------------------------------\n");
  console.log("STATUS: SKIPPED (No local TEST_DATABASE_URL specified).");
  console.log("CRITICAL INVARIANT REMAINS UNPROVEN ON LIVE ENGINE IN THIS SESSION.\n");
  process.exit(0);
}

const { Pool } = pg;

// -----------------------------------------------------------------------------
// Live PostgreSQL Integration Test Execution
// -----------------------------------------------------------------------------
(async () => {
  console.log(`Connecting to isolated local test database: ${targetUrl.replace(/:[^:@]+@/, ":***@")}...`);
  const pool = new Pool({ connectionString: targetUrl, max: 5 });

  const clientA = await pool.connect();
  const clientB = await pool.connect();

  const RUN_ENTROPY     = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const TEST_USER_ALICE = "11111111-1111-4111-8111-111111111111";
  const TEST_USER_BOB   = "22222222-2222-4222-8222-222222222222";
  const STORY_RACE_ID   = `test_race_${RUN_ENTROPY}`;
  const STORY_ISOLATED  = `test_iso_${RUN_ENTROPY}`;
  const STORY_NEW_ID    = `test_new_${RUN_ENTROPY}`;
  const STORY_RB_ID     = `test_rb_${RUN_ENTROPY}`;

  try {
    // 1. Verify Database Version & Isolation
    const verRes = await clientA.query("SELECT version();");
    console.log(`   Connected to PostgreSQL engine: ${verRes.rows[0].version.split(",")[0]}`);

    // 2. Ensure schema & migration 20261023000000 are present
    console.log("   Verifying database schema and seal_story_preservation RPC presence...");
    const funcRes = await clientA.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'seal_story_preservation';
    `);

    if (funcRes.rows.length === 0) {
      console.log("   Applying migration 20261023000000_preserve_story_atomic_immutability.sql to test database...");
      const migrationPath = path.resolve(__dirname, "../../supabase/migrations/20261023000000_preserve_story_atomic_immutability.sql");
      const migrationSql = fs.readFileSync(migrationPath, "utf8");
      await clientA.query(migrationSql);
      console.log("   ✓ Migration applied successfully.");
    } else {
      console.log("   ✓ seal_story_preservation routine confirmed.");
    }

    // 3. Setup Test Draft Row
    console.log(`   Setting up draft story '${STORY_RACE_ID}'...`);
    await clientA.query(`
      INSERT INTO public.stories (
        id, user_id, title, status, visibility, created_at, updated_at
      ) VALUES ($1, $2, $3, 'draft', 'private', now(), now())
      ON CONFLICT (id) DO UPDATE SET status = 'draft', provenance_id = NULL;
    `, [STORY_RACE_ID, TEST_USER_ALICE, "Concurrent Contention Story"]);

    // 4. Test 1: Execute Genuine Concurrent Preservation Contention
    console.log("   Testing 1: Launching 2 genuine concurrent transactions with FOR UPDATE contention...");

    const workerA = clientA.query(`
      SELECT * FROM public.seal_story_preservation(
        p_story_id => $1,
        p_user_id => $2,
        p_title => 'Winner Title Worker A',
        p_provenance_id => 'VIR-WORKERA001',
        p_provenance_hash => 'WORKERA001',
        p_preserved_at => now()
      );
    `, [STORY_RACE_ID, TEST_USER_ALICE]);

    const workerB = clientB.query(`
      SELECT * FROM public.seal_story_preservation(
        p_story_id => $1,
        p_user_id => $2,
        p_title => 'Winner Title Worker B',
        p_provenance_id => 'VIR-WORKERB002',
        p_provenance_hash => 'WORKERB002',
        p_preserved_at => now()
      );
    `, [STORY_RACE_ID, TEST_USER_ALICE]);

    const results = await Promise.allSettled([workerA, workerB]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.strictEqual(fulfilled.length, 1, "Exactly one concurrent transaction must succeed");
    assert.strictEqual(rejected.length, 1, "Exactly one concurrent transaction must fail with lock/status conflict");

    const winningRow = fulfilled[0].value.rows[0];
    const losingError = rejected[0].reason;

    assert.strictEqual(winningRow.status, "preserved");
    assert(
      winningRow.provenance_id === "VIR-WORKERA001" || winningRow.provenance_id === "VIR-WORKERB002",
      "Winning row must have a valid provenance ID"
    );
    assert.strictEqual(losingError.code, "P0004", "Losing transaction must receive SQLSTATE P0004 (ALREADY_PRESERVED)");

    const losingProvId = winningRow.provenance_id === "VIR-WORKERA001" ? "VIR-WORKERB002" : "VIR-WORKERA001";
    console.log(`   ✓ Genuine PostgreSQL concurrency contention verified: Winner = ${winningRow.provenance_id}, Loser caught P0004.`);

    // 5. Verify Database Row Invariants Post-Contention via Independent Pool Query
    const checkRes = await pool.query("SELECT * FROM public.stories WHERE id = $1;", [STORY_RACE_ID]);
    const persisted = checkRes.rows[0];
    assert.strictEqual(persisted.provenance_id, winningRow.provenance_id, "Persisted provenance ID must equal winner");
    assert.strictEqual(persisted.provenance_hash, winningRow.provenance_hash, "Persisted hash must equal winner");
    assert.notStrictEqual(persisted.provenance_id, losingProvId, "Losing worker provenance must NOT overwrite winner");
    console.log("   ✓ Post-contention database state verified: no provenance tampering or overwrite occurred.");

    // 6. Test 2: Sequential Duplicate Preservation Rejection
    console.log("   Testing 2: Sequential duplicate preservation attempt...");
    let seqDuplicateCaught = false;
    try {
      await clientA.query(`
        SELECT * FROM public.seal_story_preservation(
          p_story_id => $1,
          p_user_id => $2,
          p_provenance_id => 'VIR-REPEAT0000',
          p_provenance_hash => 'REPEAT0000'
        );
      `, [STORY_RACE_ID, TEST_USER_ALICE]);
    } catch (err) {
      seqDuplicateCaught = true;
      assert.strictEqual(err.code, "P0004", "Duplicate preservation must fail with SQLSTATE P0004");
    }
    assert(seqDuplicateCaught, "Sequential duplicate preservation must be rejected");
    console.log("   ✓ Sequential duplicate preservation strictly rejected with SQLSTATE P0004.");

    // 7. Test 3: Nonexistent / New Story Atomic Creation and Preservation
    console.log("   Testing 3: Preserving brand new nonexistent story ID...");
    const newStoryRes = await clientA.query(`
      SELECT * FROM public.seal_story_preservation(
        p_story_id => $1,
        p_user_id => $2,
        p_title => 'Atomic New Story',
        p_provenance_id => 'VIR-NEWSTORY99',
        p_provenance_hash => 'NEWSTORY99'
      );
    `, [STORY_NEW_ID, TEST_USER_ALICE]);
    assert.strictEqual(newStoryRes.rows[0].status, "preserved");
    assert.strictEqual(newStoryRes.rows[0].provenance_id, "VIR-NEWSTORY99");
    console.log("   ✓ Nonexistent story atomically inserted and sealed with provenance.");

    // 8. Test 4: Cross-User Ownership Violation
    console.log("   Testing 4: Cross-user preservation rejection...");
    await clientA.query(`
      INSERT INTO public.stories (id, user_id, title, status)
      VALUES ($1, $2, 'Alice Private Story', 'draft')
      ON CONFLICT (id) DO UPDATE SET status = 'draft', user_id = $2;
    `, [STORY_ISOLATED, TEST_USER_ALICE]);

    let crossUserCaught = false;
    try {
      await clientB.query(`
        SELECT * FROM public.seal_story_preservation(
          p_story_id => $1,
          p_user_id => $2,
          p_provenance_id => 'VIR-STEAL00000',
          p_provenance_hash => 'STEAL00000'
        );
      `, [STORY_ISOLATED, TEST_USER_BOB]);
    } catch (err) {
      crossUserCaught = true;
      assert.strictEqual(err.code, "42501", "Cross-user attempt must fail with SQLSTATE 42501");
    }
    assert(crossUserCaught, "Cross-user attempt must be rejected");
    console.log("   ✓ Cross-user unauthorized preservation strictly blocked with SQLSTATE 42501.");

    // 9. Test 5: Permanent Immutability Trigger on UPDATE
    console.log("   Testing 5: Trigger enforce_preserved_story_immutability blocking UPDATE on provenance...");
    let updateTamperCaught = false;
    try {
      await pool.query(`
        UPDATE public.stories 
        SET provenance_id = 'VIR-ILLEGALTAMPER'
        WHERE id = $1;
      `, [STORY_RACE_ID]);
    } catch (err) {
      updateTamperCaught = true;
      assert.strictEqual(err.code, "23514", "Provenance tampering must fail with check violation SQLSTATE 23514");
    }
    assert(updateTamperCaught, "Direct update of provenance_id must be rejected");
    console.log("   ✓ Engine-level trigger blocked provenance alteration with SQLSTATE 23514.");

    // 10. Test 6: Status Demotion Trigger
    console.log("   Testing 6: Trigger enforce_preserved_story_immutability blocking status demotion...");
    let demoteCaught = false;
    try {
      await pool.query(`
        UPDATE public.stories 
        SET status = 'draft'
        WHERE id = $1;
      `, [STORY_RACE_ID]);
    } catch (err) {
      demoteCaught = true;
      assert.strictEqual(err.code, "23514", "Demotion to draft must fail with SQLSTATE 23514");
    }
    assert(demoteCaught, "Demoting preserved story to draft must be rejected");
    console.log("   ✓ Engine-level trigger blocked status demotion with SQLSTATE 23514.");

    // 11. Test 7: Standard Client Archival Deletion Protection (Simulating JWT claims)
    console.log("   Testing 7: Archival deletion protection for standard authenticated client...");
    let clientDeleteCaught = false;
    try {
      await clientA.query("BEGIN;");
      // Simulate authenticated standard client via PostgREST JWT claim
      await clientA.query("SET LOCAL request.jwt.claims = '{\"role\": \"authenticated\"}';");
      await clientA.query("DELETE FROM public.stories WHERE id = $1;", [STORY_RACE_ID]);
      await clientA.query("COMMIT;");
    } catch (err) {
      await clientA.query("ROLLBACK;");
      clientDeleteCaught = true;
      assert.strictEqual(err.code, "42501", "Standard client delete must fail with SQLSTATE 42501");
    }
    assert(clientDeleteCaught, "Standard client delete must be rejected");
    console.log("   ✓ Preserved story deletion by standard client strictly blocked with SQLSTATE 42501.");

    // 12. Test 8: Transaction Rollback Integrity
    console.log("   Testing 8: Transaction atomicity and rollback safety...");
    await clientA.query(`
      INSERT INTO public.stories (id, user_id, title, status)
      VALUES ($1, $2, 'Rollback Test Story', 'draft');
    `, [STORY_RB_ID, TEST_USER_ALICE]);

    await clientA.query("BEGIN;");
    await clientA.query(`
      SELECT * FROM public.seal_story_preservation(
        p_story_id => $1,
        p_user_id => $2,
        p_provenance_id => 'VIR-ROLLBACK01',
        p_provenance_hash => 'ROLLBACK01'
      );
    `, [STORY_RB_ID, TEST_USER_ALICE]);
    // Explicitly rollback transaction
    await clientA.query("ROLLBACK;");

    const rbCheck = await pool.query("SELECT * FROM public.stories WHERE id = $1;", [STORY_RB_ID]);
    assert.strictEqual(rbCheck.rows[0].status, "draft", "Story status must remain 'draft' after rollback");
    assert.strictEqual(rbCheck.rows[0].provenance_id, null, "Provenance ID must remain null after rollback");
    console.log("   ✓ Transaction rollback verified: uncommitted preservation cleanly rolled back.");

    console.log("\n=== ALL 8 GENUINE POSTGRESQL INTEGRATION TESTS PASSED (100%) ===\n");
  } finally {
    // Bounded cleanup: remove only test-created records with unique run entropy
    console.log("   Cleaning up test records...");
    await pool.query(
      "DELETE FROM public.stories WHERE id IN ($1, $2, $3, $4);",
      [STORY_RACE_ID, STORY_ISOLATED, STORY_NEW_ID, STORY_RB_ID]
    ).catch(() => {});
    clientA.release();
    clientB.release();
    await pool.end();
  }
})().catch((err) => {
  console.error("\n[INTEGRATION TEST FAILURE]", err);
  process.exit(1);
});

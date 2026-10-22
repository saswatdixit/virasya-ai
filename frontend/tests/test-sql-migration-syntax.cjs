/**
 * Virasya SQL Migration Syntax & Security Rules Test
 * Non-destructive local validation of supabase/migrations/20261017000000_virasya_core_schema.sql
 */

const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(__dirname, '..', 'supabase', 'migrations', '20261017000000_virasya_core_schema.sql');

console.log('=== Virasya SQL Migration Syntax & Security Audit ===\n');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
console.log(`1. Reading migration file (${sql.length} bytes)...`);

// 1. Destructive Commands Check
const forbiddenPatterns = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bTRUNCATE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /INSERT\s+INTO\s+storage\.buckets[^\;]*'story-recordings-public'/i, // Must not insert public audio bucket
  /CREATE\s+POLICY[^\;]*'story-recordings-public'/i, // Must not create policies for public audio bucket
];

for (const pattern of forbiddenPatterns) {
  if (pattern.test(sql)) {
    console.error(`FAIL: Forbidden destructive or public storage pattern detected: ${pattern}`);
    process.exit(1);
  }
}
console.log('   ✓ Zero destructive commands found (no DROP TABLE, no TRUNCATE, no public audio bucket creation).');

// 2. RLS Enforcement Check
const requiredRlsTables = ['public.profiles', 'public.stories', 'public.vocabulary'];
for (const table of requiredRlsTables) {
  const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+${table.replace('.', '\\.')}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
  if (!rlsRegex.test(sql)) {
    console.error(`FAIL: Row Level Security is NOT enabled for ${table}`);
    process.exit(1);
  }
}
console.log('   ✓ Row Level Security explicitly enabled on profiles, stories, and vocabulary.');

// 3. Search Path Security on SECURITY DEFINER functions
const securityDefinerCount = (sql.match(/SECURITY\s+DEFINER/gi) || []).length;
const searchPathCount = (sql.match(/SET\s+search_path\s*=\s*public\s*,\s*pg_temp/gi) || []).length;
if (securityDefinerCount > searchPathCount) {
  console.error(`FAIL: Found SECURITY DEFINER function without hardened search_path declaration.`);
  process.exit(1);
}
console.log(`   ✓ All SECURITY DEFINER functions (${securityDefinerCount}) and helper functions (${searchPathCount}) are hardened with 'SET search_path = public, pg_temp'.`);

// 4. Explicit Backend Trust Detector Check (Must be SECURITY INVOKER to avoid masking current_user)
if (!sql.includes('FUNCTION public.is_trusted_backend()') || !sql.includes("jwt_role = 'service_role'") || !sql.includes("pg_role IN ('postgres', 'supabase_admin')")) {
  console.error('FAIL: Missing or incomplete is_trusted_backend() authorization function.');
  process.exit(1);
}
const isTrustedDef = sql.slice(sql.indexOf('FUNCTION public.is_trusted_backend()'), sql.indexOf('CREATE TABLE IF NOT EXISTS public.profiles'));
if (isTrustedDef.includes('SECURITY DEFINER')) {
  console.error('FAIL: is_trusted_backend() must NOT be SECURITY DEFINER, otherwise current_user is masked with the function owner.');
  process.exit(1);
}
console.log('   ✓ Explicit backend authorization detector function is_trusted_backend() confirmed (properly scoped as SECURITY INVOKER).');

// 5. Anti-Tampering Triggers Check
if (!sql.includes('protect_story_integrity') || !sql.includes('protect_vocabulary_integrity') || !sql.includes('protect_profile_integrity')) {
  console.error('FAIL: Missing anti-tampering triggers for story, vocabulary, or profile integrity.');
  process.exit(1);
}
console.log('   ✓ Anti-tampering triggers protect_story_integrity, protect_vocabulary_integrity, and protect_profile_integrity confirmed.');

// 6. Explicit Audio Permission Column Check
if (!sql.includes('audio_public_playback BOOLEAN NOT NULL DEFAULT false')) {
  console.error('FAIL: Missing explicit audio_public_playback permission column in public.stories.');
  process.exit(1);
}
console.log('   ✓ Explicit audio_public_playback column with DEFAULT false confirmed.');

// 7. Direct Storage Creation & Isolation Check
if (!sql.includes("'story-recordings-private'") || !sql.includes('storage.foldername(name)')) {
  console.error('FAIL: Missing story-recordings-private bucket or folder isolation.');
  process.exit(1);
}
if (!sql.includes('DROP POLICY IF EXISTS "public_audio_select_all" ON storage.objects')) {
  console.error('FAIL: Missing explicit purge of legacy public audio policies.');
  process.exit(1);
}
console.log('   ✓ Direct private audio bucket creation, legacy policy purge, and folder isolation confirmed.');

// 8. Template Policy Purge Check
if (!sql.includes('DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles')) {
  console.error('FAIL: Missing explicit purge of pre-existing Supabase template policies on public.profiles.');
  process.exit(1);
}
console.log('   ✓ Explicit purge of pre-existing Supabase starter template policies confirmed.');

// 9. Balanced Quotes and Block Tags Check
const dollarQuotes = (sql.match(/\$\$/g) || []).length;
if (dollarQuotes % 2 !== 0) {
  console.error(`FAIL: Unbalanced $$ dollar-quoted function blocks (${dollarQuotes} occurrences).`);
  process.exit(1);
}
console.log(`   ✓ Dollar-quoted function/DO blocks are balanced (${dollarQuotes / 2} valid blocks).`);

// 10. Preserved Story Demotion Guard Check
if (!sql.includes("OLD.status = 'preserved' AND NEW.status = 'draft'")) {
  console.error('FAIL: Missing guard preventing untrusted clients from demoting preserved stories to draft.');
  process.exit(1);
}
console.log('   ✓ Preservation status immutability guard (cannot demote preserved to draft) confirmed.');

// 11. Canonical Vocabulary Protection Check
if (!sql.includes("TG_OP = 'DELETE'") || !sql.includes("OLD.verification_status = 'verified' OR OLD.is_sample = true")) {
  console.error('FAIL: Missing guard protecting verified or sample vocabulary entries from unauthorized deletion.');
  process.exit(1);
}
if (!sql.includes("TG_OP = 'UPDATE'") || !sql.includes("OLD.verification_status = 'verified'")) {
  console.error('FAIL: Missing guard protecting verified vocabulary entries from unauthorized modification.');
  process.exit(1);
}
console.log('   ✓ Canonical vocabulary protection guards (prevent modifying or deleting verified/sample entries) confirmed.');

// 12. Storage Objects RLS Safety Check (Must NOT attempt to alter managed storage.objects table ownership/RLS)
const alterStorageObjectsRls = /^\s*ALTER\s+TABLE\s+storage\.objects\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/im;
if (alterStorageObjectsRls.test(sql)) {
  console.error('FAIL: Migration must NOT execute ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY (fails with SQLSTATE 42501 as postgres does not own storage.objects).');
  process.exit(1);
}
if (!sql.includes('CREATE POLICY "private_audio_upload_owner" ON storage.objects') ||
    !sql.includes('CREATE POLICY "private_audio_select_owner" ON storage.objects') ||
    !sql.includes('CREATE POLICY "private_audio_update_owner" ON storage.objects') ||
    !sql.includes('CREATE POLICY "private_audio_delete_owner" ON storage.objects')) {
  console.error('FAIL: Missing private storage audio policies on storage.objects.');
  process.exit(1);
}
console.log('   ✓ Storage objects RLS safety confirmed (no redundant ALTER TABLE; all 4 private owner policies present).');

// 13. Reapplication & Idempotency Structure Check
const createTableMatches = (sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.\w+/gi) || []);
const safeCreateTableMatches = (sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.\w+/gi) || []);
if (createTableMatches.length !== safeCreateTableMatches.length) {
  console.error('FAIL: Detected CREATE TABLE without IF NOT EXISTS on public tables.');
  process.exit(1);
}

const createTriggerMatches = (sql.match(/CREATE\s+TRIGGER\s+(\w+)/gi) || []);
const dropTriggerMatches = (sql.match(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+(\w+)/gi) || []);
if (createTriggerMatches.length > dropTriggerMatches.length) {
  console.error('FAIL: Detected CREATE TRIGGER without preceding DROP TRIGGER IF EXISTS.');
  process.exit(1);
}
console.log(`   ✓ Idempotency safety structures confirmed: ${safeCreateTableMatches.length} CREATE TABLE IF NOT EXISTS and ${createTriggerMatches.length} paired DROP/CREATE TRIGGER definitions.`);

// 14. Preserved Story Deletion Guard Check
if (!sql.includes("TG_OP = 'DELETE'") || !sql.includes("OLD.status = 'preserved'")) {
  console.error('FAIL: Missing guard protecting preserved stories from deletion by untrusted clients.');
  process.exit(1);
}
console.log('   ✓ Preserved story deletion guard (cannot delete archived cultural stories) confirmed.');

// 15. Profile Direct Insert Timestamp Hardening Check
if (!sql.includes("TG_OP = 'INSERT'") || !sql.includes("NEW.created_at = timezone('utc'::text, now())")) {
  console.error('FAIL: Missing guard preventing timestamp forgery on direct profile insertion.');
  process.exit(1);
}
console.log('   ✓ Profile direct insert timestamp hardening confirmed.');

// 16. Vocabulary Verification Count Anti-Inflation Check
if (!sql.includes("NEW.verification_count := 1;") || !sql.includes("NEW.verification_count := OLD.verification_count;")) {
  console.error('FAIL: Missing guard protecting vocabulary verification_count from client manipulation.');
  process.exit(1);
}
console.log('   ✓ Vocabulary verification counter anti-inflation guards confirmed.');

// 17. Trigger Event Binding Invariants Check
if (!sql.includes("BEFORE INSERT OR UPDATE OR DELETE ON public.stories")) {
  console.error('FAIL: trigger_protect_story_integrity must bind to BEFORE INSERT OR UPDATE OR DELETE.');
  process.exit(1);
}
if (!sql.includes("BEFORE INSERT OR UPDATE OR DELETE ON public.vocabulary")) {
  console.error('FAIL: trigger_protect_vocabulary_integrity must bind to BEFORE INSERT OR UPDATE OR DELETE.');
  process.exit(1);
}
if (!sql.includes("BEFORE INSERT OR UPDATE ON public.profiles")) {
  console.error('FAIL: trigger_protect_profile_integrity must bind to BEFORE INSERT OR UPDATE.');
  process.exit(1);
}
console.log('   ✓ Integrity trigger event bindings (stories: INSERT/UPDATE/DELETE, vocab: INSERT/UPDATE/DELETE, profiles: INSERT/UPDATE) confirmed.');

console.log('\n=== ALL SQL MIGRATION SECURITY CHECKS PASSED (100%) ===\n');
console.log('STATIC AUDIT BOUNDARY NOTICE:');
console.log('• These static checks verify AST patterns, trigger existence, and keyword invariants.');
console.log('• They CANNOT prove:');
console.log('  1. PostgreSQL runtime query planner RLS filtering behavior under actual user sessions.');
console.log('  2. Concurrent transaction serialization or row lock contention.');
console.log('  3. PostgREST HTTP status code translation (e.g. 200 [] vs 403 Forbidden).');
console.log('  4. Storage API HMAC token issuance and TTL expiry.');
console.log('• Verification of runtime behavior requires executing against a disposable Supabase staging project.\n');

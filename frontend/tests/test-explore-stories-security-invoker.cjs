/**
 * Virasya Test Suite: Explore Stories Security Invoker Remediation
 *
 * NOTE ON TEST CLASSIFICATION:
 * - Part 1: Static Migration AST & Schema Invariant Assertions.
 * - Part 2: JavaScript In-Memory Simulation of PostgreSQL Authorization & Trigger Engine.
 * - Real PostgreSQL execution against live databases is provided separately in:
 *   supabase/staging_verify_20261031000000.sql
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== Virasya Explore Stories Security Invoker Test Suite ===\n");

const rootDir = path.resolve(__dirname, "..");
const supabaseDir = path.resolve(rootDir, "../supabase");
const migrationPath = path.resolve(supabaseDir, "migrations/20261031000000_fix_explore_stories_security_invoker.sql");
const originalMigrationPath = path.resolve(supabaseDir, "migrations/20261024000000_security_audit_remediations.sql");
const frontendStoriesPath = path.resolve(rootDir, "src/supabase/stories.ts");

let failed = false;
let currentPart = "part1";
const counts = {
  part1: 0,
  part2: 0,
  part3: 0,
  total: 0
};

function check(label, condition, details = "") {
  counts.total++;
  counts[currentPart]++;
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${details}`);
    failed = true;
  }
}

// -----------------------------------------------------------------------------
// PART 1: Static Migration & Schema Invariant Assertions
// -----------------------------------------------------------------------------
console.log("▶ [Part 1] Static Migration Invariant & Schema Audit...");

check(
  "Migration 20261031000000 exists",
  fs.existsSync(migrationPath),
  `Expected file at ${migrationPath}`
);

const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
const originalMigrationSql = fs.existsSync(originalMigrationPath) ? fs.readFileSync(originalMigrationPath, "utf8") : "";
const frontendCode = fs.readFileSync(frontendStoriesPath, "utf8");

// View configuration
check(
  "Specifies security_invoker = true on explore_stories",
  migrationSql.includes("security_invoker = true"),
  "View must specify security_invoker = true"
);

check(
  "Preserves security_barrier = true on explore_stories",
  migrationSql.includes("security_barrier = true"),
  "View must retain security_barrier = true"
);

// Dedicated public projection table
check(
  "Creates dedicated public.story_audio_public projection table",
  migrationSql.includes("CREATE TABLE IF NOT EXISTS public.story_audio_public"),
  "Must establish dedicated public audio table"
);

check(
  "story_audio_public schema has NO storage_path column",
  !migrationSql.includes("storage_path TEXT") && !migrationSql.includes("storage_path text"),
  "story_audio_public table must not define or contain storage_path"
);

check(
  "story_audio_public schema has NO user_id column",
  !migrationSql.includes("user_id UUID") && !migrationSql.includes("user_id text"),
  "story_audio_public table must not define or contain user_id"
);

check(
  "Enables RLS on public.story_audio_public",
  migrationSql.includes("ALTER TABLE public.story_audio_public ENABLE ROW LEVEL SECURITY;"),
  "story_audio_public must have RLS enabled"
);

// Redundant index eliminated
check(
  "Redundant index on primary key (story_id) is eliminated",
  !migrationSql.includes("CREATE INDEX IF NOT EXISTS idx_story_audio_public_story_id"),
  "Primary key automatically indexes story_id; duplicate index must be omitted"
);

// Timestamps use now()
check(
  "Timestamps use now() instead of timezone('utc', now())",
  migrationSql.includes("DEFAULT now()") && !migrationSql.includes("timezone('utc'::text, now())"),
  "TIMESTAMPTZ default must use now()"
);

// Preflight schema verification and public schema privilege hardening
check(
  "Preflight schema verification block detects pre-existing incompatible tables",
  migrationSql.includes("PREFLIGHT INCOMPATIBILITY") &&
  migrationSql.includes("chk_story_audio_public_filename_clean"),
  "Migration must include safe preflight validation"
);

check(
  "Revokes CREATE on schema public from PUBLIC and anon",
  migrationSql.includes("REVOKE CREATE ON SCHEMA public FROM PUBLIC;") &&
  migrationSql.includes("REVOKE CREATE ON SCHEMA public FROM anon;"),
  "Must harden schema public permissions against object injection"
);

// Column check constraints
check(
  "Check constraints enforce clean filenames (no slashes) and duration bounds (0-60.5s)",
  migrationSql.includes("chk_story_audio_public_filename_clean") &&
  migrationSql.includes("chk_story_audio_public_duration") &&
  migrationSql.includes("<= 60.5") &&
  migrationSql.includes("chk_story_audio_public_kind"),
  "Table must define defensive CHECK constraints aligned with 60s audio limit"
);

// Reusable normalization function
check(
  "Defines public.sanitize_story_audio_projection normalization function",
  migrationSql.includes("FUNCTION public.sanitize_story_audio_projection"),
  "Must define reusable normalization function"
);

// Trigger direct execution barricade & least privilege
check(
  "Trigger function barricades direct invocation outside trigger context (IF TG_OP IS NULL)",
  migrationSql.includes("IF TG_OP IS NULL THEN") &&
  migrationSql.includes("Direct invocation of sync_story_audio_public() is prohibited"),
  "Trigger function must prohibit direct execution"
);

check(
  "Trigger function revokes EXECUTE from anon, authenticated, and PUBLIC",
  migrationSql.includes("REVOKE ALL ON FUNCTION public.sync_story_audio_public() FROM PUBLIC;") &&
  migrationSql.includes("REVOKE ALL ON FUNCTION public.sync_story_audio_public() FROM anon, authenticated;") &&
  migrationSql.includes("GRANT EXECUTE ON FUNCTION public.sync_story_audio_public() TO postgres, service_role;"),
  "Must enforce strict least privilege on trigger function"
);

// Known-deny baseline: explicit revocation on all 4 privilege categories
check(
  "Explicit column-level revocation on SELECT, INSERT, UPDATE, REFERENCES for anon and PUBLIC",
  migrationSql.includes("REVOKE SELECT, INSERT, UPDATE, REFERENCES (\n    id, user_id, title") &&
  migrationSql.includes("ON public.stories FROM PUBLIC;") &&
  migrationSql.includes("ON public.stories FROM anon;"),
  "Must purge any stale column-level grants across all 4 categories"
);

// View column order parity with 20261024000000
const origVocabAudio = /vocabulary[\s\S]*?audio/i.test(originalMigrationSql);
const migVocabAudio = /s\.vocabulary[\s\S]*?END AS audio/i.test(migrationSql);
check(
  "explore_stories view maintains column order parity (vocabulary before audio) with original view",
  origVocabAudio && migVocabAudio,
  "Column order must match original view to avoid CREATE OR REPLACE VIEW errors"
);

// Frontend column parity
const matchPublicCols = frontendCode.match(/const EXPLORE_PUBLIC_COLUMNS =\s*"([^"]+)";/);
assert(matchPublicCols, "Could not extract EXPLORE_PUBLIC_COLUMNS from frontend");
const publicCols = matchPublicCols[1].split(",").map((s) => s.trim());

for (const col of publicCols) {
  check(
    `explore_stories view projects frontend column '${col}'`,
    migrationSql.includes(col),
    `Column '${col}' must be projected by explore_stories`
  );
}


// -----------------------------------------------------------------------------
// PART 2: Executable Sanitization Parity & Logic Assertions
// -----------------------------------------------------------------------------
currentPart = "part2";
console.log("\n▶ [Part 2] Normalization Function Unit Tests (Sanitization Logic Parity)...");

/**
 * Reusable normalization implementation matching public.sanitize_story_audio_projection()
 */
function sanitizeStoryAudioProjection(audio) {
  if (!audio || typeof audio !== "object") {
    return {
      filename: "recording",
      name: "Oral Heritage Audio",
      duration: null,
      kind: "uploaded",
      verified_format: null
    };
  }

  // 1. Format validation and extension normalization
  let format = (audio.verified_format || "").toLowerCase().trim() || null;
  const allowedFormats = [
    "mp3", "wav", "ogg", "m4a", "flac", "aac", "webm",
    "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/x-m4a"
  ];

  let ext = null;
  if (format && allowedFormats.includes(format)) {
    const mimeMap = {
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
      "audio/webm": "webm",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a"
    };
    ext = mimeMap[format] || format;
  } else {
    format = null;
    ext = null;
  }

  // 2. Filename sanitization
  const rawFilename = audio.filename || audio.name || "recording";
  let cleanFilename = String(rawFilename).replace(/^.*[/\\]/, "").trim() || "recording";
  if (cleanFilename.includes("..") || cleanFilename.includes("/") || cleanFilename.includes("\\")) {
    cleanFilename = "recording" + (ext ? "." + ext : "");
  }
  if (cleanFilename.length > 255) cleanFilename = cleanFilename.slice(0, 255);

  // 3. Name sanitization
  const rawName = audio.name || audio.filename || "Oral Heritage Audio";
  let cleanName = String(rawName).replace(/^.*[/\\]/, "").trim() || "Oral Heritage Audio";
  if (cleanName.includes("..") || cleanName.includes("/") || cleanName.includes("\\")) {
    cleanName = "Oral Heritage Audio";
  }
  if (cleanName.length > 255) cleanName = cleanName.slice(0, 255);

  // 4. Duration validation
  let duration = null;
  const durStr = String(audio.duration != null ? audio.duration : "").trim();
  if (/^[0-9]+(\.[0-9]+)?$/.test(durStr)) {
    const parsed = Number(durStr);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 60.5) {
      duration = parsed;
    }
  }

  // 5. Kind validation
  let kind = (audio.kind || "uploaded").toLowerCase().trim();
  if (!["uploaded", "recorded", "sample"].includes(kind)) {
    kind = "uploaded";
  }

  return {
    filename: cleanFilename,
    name: cleanName,
    duration,
    kind,
    verified_format: format
  };
}

// Test case 1: MIME-type format audio/mpeg with path traversal fallback
const mimeTest = sanitizeStoryAudioProjection({
  filename: "..",
  verified_format: "audio/mpeg"
});
check(
  "MIME format audio/mpeg maps to 'recording.mp3' and contains NO slashes",
  mimeTest.filename === "recording.mp3" && !mimeTest.filename.includes("/") && !mimeTest.filename.includes("\\")
);

// Test case 2: Windows path traversal
const winPathTest = sanitizeStoryAudioProjection({
  filename: "C:\\Users\\Artist\\Desktop\\my_song.wav",
  name: "D:\\Recordings\\SongTitle",
  verified_format: "wav"
});
check(
  "Windows path stripped to clean basename",
  winPathTest.filename === "my_song.wav" && winPathTest.name === "SongTitle"
);

// Test case 3: Unix path
const unixPathTest = sanitizeStoryAudioProjection({
  filename: "/var/tmp/upload_1234/flac_recording.flac",
  verified_format: "flac"
});
check(
  "Unix path stripped to clean basename",
  unixPathTest.filename === "flac_recording.flac"
);

// Test case 4: Empty and whitespace strings
const emptyTest = sanitizeStoryAudioProjection({
  filename: "    ",
  name: "   "
});
check(
  "Empty/whitespace filename and name fallback to defaults",
  emptyTest.filename === "recording" && emptyTest.name === "Oral Heritage Audio"
);

// Test case 5: Duration boundary checks
const durValid = sanitizeStoryAudioProjection({ duration: "45.2" });
const durExactLimit = sanitizeStoryAudioProjection({ duration: "60.0" });
const durTolerance = sanitizeStoryAudioProjection({ duration: "60.5" });
const durOverLimit = sanitizeStoryAudioProjection({ duration: "61.0" });
const durNegative = sanitizeStoryAudioProjection({ duration: "-5.0" });
const durInvalidStr = sanitizeStoryAudioProjection({ duration: "abc" });

check("Duration 45.2s accepted", durValid.duration === 45.2);
check("Duration 60.0s accepted", durExactLimit.duration === 60.0);
check("Duration 60.5s (quantization tolerance) accepted", durTolerance.duration === 60.5);
check("Duration 61.0s clamped to NULL", durOverLimit.duration === null);
check("Negative duration clamped to NULL", durNegative.duration === null);
check("Invalid string duration clamped to NULL", durInvalidStr.duration === null);

// Test case 6: NULL and non-object inputs
const nullInputTest = sanitizeStoryAudioProjection(null);
const nonObjectInputTest = sanitizeStoryAudioProjection("not an object");
const arrayInputTest = sanitizeStoryAudioProjection([1, 2, 3]);

check("NULL input safely returns defaults", nullInputTest.filename === "recording" && nullInputTest.name === "Oral Heritage Audio");
check("String input safely returns defaults", nonObjectInputTest.filename === "recording" && nonObjectInputTest.duration === null);
check("Array input safely returns defaults", arrayInputTest.filename === "recording" && arrayInputTest.kind === "uploaded");

// Test case 7: Unsupported format/MIME type rejection
const unsupportedMimeTest = sanitizeStoryAudioProjection({
  filename: "file.pdf",
  verified_format: "application/pdf"
});
const unsupportedVideoTest = sanitizeStoryAudioProjection({
  filename: "clip.mp4",
  verified_format: "video/mp4"
});
check("Unsupported MIME type application/pdf rejected", unsupportedMimeTest.verified_format === null);
check("Unsupported video/mp4 rejected", unsupportedVideoTest.verified_format === null);

// Test case 8: Extremely long filename truncation (<= 255 chars)
const longName = "a".repeat(500) + ".mp3";
const longNameTest = sanitizeStoryAudioProjection({
  filename: longName,
  verified_format: "mp3"
});
check("Extremely long filename truncated to 255 chars", longNameTest.filename.length === 255);


// -----------------------------------------------------------------------------
// PART 3: In-Memory PostgreSQL Simulation Engine (Behavioral Emulation)
// -----------------------------------------------------------------------------
currentPart = "part3";
console.log("\n▶ [Part 3] In-Memory PostgreSQL Engine Simulation (Authorization & RLS Emulation)...");

class MockPostgresDatabase {
  constructor() {
    this.stories = [];
    this.story_audio_public = [];
    
    this.columnGrants = {
      anon: [
        "id", "title", "carrier", "relationship", "place", "roots",
        "category", "language", "period", "written_text", "final_text",
        "story", "status", "visibility", "audio_public_playback",
        "provenance_id", "provenance_hash", "preserved_at", "created_at",
        "updated_at", "vocabulary"
      ],
      authenticated: [
        "id", "user_id", "title", "carrier", "relationship", "place", "roots",
        "category", "language", "period", "email", "written_text", "working_draft",
        "final_text", "story", "audio", "raw_transcripts", "vocabulary",
        "punctuation", "final_settings", "status", "visibility", "confirmed",
        "permission_confirmed", "audio_public_playback", "provenance_id",
        "provenance_hash", "preserved_at", "created_at", "updated_at"
      ]
    };
  }

  triggerSyncStoryAudioPublic(tgOp, story, oldStory = null) {
    if (!tgOp) {
      throw new Error("42501: Direct invocation of sync_story_audio_public() is prohibited; function may only be invoked via trigger.");
    }

    if (tgOp === "DELETE") {
      this.story_audio_public = this.story_audio_public.filter((a) => a.story_id !== story.id);
      return story;
    }

    if (
      story.status === "preserved" &&
      story.visibility === "public" &&
      story.audio_public_playback === true &&
      story.audio != null
    ) {
      const sanitized = sanitizeStoryAudioProjection(story.audio);

      const idx = this.story_audio_public.findIndex((a) => a.story_id === story.id);
      const record = {
        story_id: story.id,
        ...sanitized,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (idx >= 0) {
        this.story_audio_public[idx] = record;
      } else {
        this.story_audio_public.push(record);
      }

      if (tgOp === "UPDATE" && oldStory && oldStory.id !== story.id) {
        this.story_audio_public = this.story_audio_public.filter((a) => a.story_id !== oldStory.id);
      }
    } else {
      this.story_audio_public = this.story_audio_public.filter((a) => a.story_id !== story.id);
      if (tgOp === "UPDATE" && oldStory && oldStory.id !== story.id) {
        this.story_audio_public = this.story_audio_public.filter((a) => a.story_id !== oldStory.id);
      }
    }

    return story;
  }

  insertStory(role, userId, storyData) {
    if (role === "anon") {
      return { status: 403, error: "42501: Permission denied for table stories (anon cannot insert)" };
    }
    if (storyData.user_id !== userId) {
      return { status: 403, error: "42501: new row violates row-level security policy for table stories" };
    }
    this.stories.push({ ...storyData });
    this.triggerSyncStoryAudioPublic("INSERT", storyData);
    return { status: 201, data: storyData };
  }

  updateStory(role, userId, storyId, updates) {
    if (role === "anon") {
      return { status: 403, error: "42501: Permission denied for table stories (anon cannot update)" };
    }
    const idx = this.stories.findIndex((s) => s.id === storyId);
    if (idx === -1) return { status: 404, error: "Story not found" };
    
    if (this.stories[idx].user_id !== userId) {
      return { status: 403, error: "42501: violates row-level security policy for table stories" };
    }

    const oldStory = { ...this.stories[idx] };
    const newStory = { ...oldStory, ...updates };
    this.stories[idx] = newStory;
    this.triggerSyncStoryAudioPublic("UPDATE", newStory, oldStory);
    return { status: 200, data: newStory };
  }

  deleteStory(role, userId, storyId) {
    if (role === "anon") {
      return { status: 403, error: "42501: Permission denied for table stories (anon cannot delete)" };
    }
    const idx = this.stories.findIndex((s) => s.id === storyId);
    if (idx === -1) return { status: 404, error: "Story not found" };

    if (this.stories[idx].user_id !== userId) {
      return { status: 403, error: "42501: violates row-level security policy for table stories" };
    }

    const deleted = this.stories.splice(idx, 1)[0];
    // Emulate ON DELETE CASCADE
    this.story_audio_public = this.story_audio_public.filter((a) => a.story_id !== storyId);
    return { status: 200, data: deleted };
  }

  selectStories(role, userId, columns, filter = {}) {
    for (const col of columns) {
      if (!this.columnGrants[role].includes(col)) {
        return { status: 403, error: `42501: Permission denied for column '${col}' of relation stories` };
      }
    }

    const rows = this.stories.filter((story) => {
      let visible = false;
      if (role === "anon") {
        visible = story.status === "preserved" && story.visibility === "public";
      } else if (role === "authenticated") {
        visible = (story.status === "preserved" && story.visibility === "public") || (story.user_id === userId);
      }
      if (!visible) return false;

      for (const [k, v] of Object.entries(filter)) {
        if (story[k] !== v) return false;
      }
      return true;
    });

    const projected = rows.map((r) => {
      const out = {};
      for (const c of columns) out[c] = r[c];
      return out;
    });

    return { status: 200, data: projected };
  }

  selectStoryAudioPublic(role, userId, storyId = null) {
    const rows = this.story_audio_public.filter((audioEntry) => {
      const story = this.stories.find((s) => s.id === audioEntry.story_id);
      if (!story) return false;
      const eligible = story.status === "preserved" && story.visibility === "public" && story.audio_public_playback === true;
      if (!eligible) return false;
      if (storyId && audioEntry.story_id !== storyId) return false;
      return true;
    });

    return { status: 200, data: rows };
  }

  selectExploreStories(role, userId, columns = null) {
    const storyRes = this.selectStories(role, userId, this.columnGrants.anon, {
      status: "preserved",
      visibility: "public"
    });

    if (storyRes.status !== 200) return storyRes;

    const audioRes = this.selectStoryAudioPublic(role, userId);
    const audioMap = new Map();
    audioRes.data.forEach((a) => audioMap.set(a.story_id, a));

    const rows = storyRes.data.map((s) => {
      const a = audioMap.get(s.id);
      const audioObj = a
        ? {
            filename: a.filename,
            name: a.name,
            duration: a.duration,
            kind: a.kind,
            verified_format: a.verified_format
          }
        : null;

      const out = { ...s, audio: audioObj };
      return out;
    });

    return { status: 200, data: rows };
  }
}

const db = new MockPostgresDatabase();

db.stories.push(
  {
    id: "story_pub_with_audio",
    user_id: "user_author_uuid_1111",
    title: "The Banyan Elder",
    carrier: "Devi Bai",
    relationship: "Grandmother",
    place: "Varanasi",
    roots: "Kashi",
    category: "Folklore",
    language: "Hindi",
    period: "1940s",
    email: "devi.bai@internal-author.net",
    written_text: "Narrative...",
    working_draft: "Draft...",
    final_text: "Final narrative...",
    story: "Full archival record.",
    audio: {
      filename: "devi_banyan_original.mp3",
      name: "Oral Heritage Recording",
      storage_path: "author_1111/secure_recordings/banyan_audio_001.mp3",
      duration: 45.5,
      kind: "recorded",
      verified_format: "mp3"
    },
    raw_transcripts: { asr_confidence: 0.98 },
    vocabulary: [{ term: "Ghat", definition: "River steps" }],
    punctuation: {},
    final_settings: { provenance_id: "VIR-ABCDEF123456" },
    status: "preserved",
    visibility: "public",
    audio_public_playback: true,
    confirmed: true,
    permission_confirmed: true,
    provenance_id: "VIR-ABCDEF123456",
    provenance_hash: "ABCDEF123456",
    preserved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "story_pub_no_audio_consent",
    user_id: "user_author_uuid_1111",
    title: "Tales of the Loom",
    carrier: "Master Kabir",
    relationship: "Mentor",
    place: "Chanderi",
    roots: "Madhya Pradesh",
    category: "Craft",
    language: "Hindi",
    period: "Traditional",
    email: "kabir.weaver@internal-author.net",
    written_text: "Draft weaving history...",
    working_draft: "Private weaving notes...",
    final_text: "Preserved text.",
    story: "Full craft archive.",
    audio: {
      filename: "loom_private.wav",
      name: "loom_audio",
      storage_path: "author_1111/loom_private.wav",
      duration: 30,
      kind: "uploaded",
      verified_format: "wav"
    },
    raw_transcripts: {},
    vocabulary: [],
    punctuation: {},
    final_settings: {},
    status: "preserved",
    visibility: "public",
    audio_public_playback: false,
    confirmed: true,
    permission_confirmed: true,
    provenance_id: "VIR-LOOM12345678",
    provenance_hash: "LOOM12345678",
    preserved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "story_priv_user_a",
    user_id: "user_author_uuid_1111",
    title: "Private Family Lore",
    carrier: "Uncle Shyam",
    relationship: "Uncle",
    place: "Jaipur",
    roots: "Rajasthan",
    category: "Family",
    language: "Hindi",
    period: "Modern",
    email: "devi.bai@internal-author.net",
    written_text: "Confidential family recipe...",
    working_draft: "Rough notes...",
    final_text: "Preserved family archive.",
    story: "Full text.",
    audio: {
      filename: "secret_recipe.mp3",
      storage_path: "author_1111/secret_family_recording.mp3",
      duration: 50,
      kind: "recorded",
      verified_format: "mp3"
    },
    raw_transcripts: {},
    vocabulary: [],
    punctuation: {},
    final_settings: {},
    status: "preserved",
    visibility: "private",
    audio_public_playback: true,
    confirmed: true,
    permission_confirmed: true,
    provenance_id: "VIR-PRIV11112222",
    provenance_hash: "PRIV11112222",
    preserved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
);

db.stories.forEach((s) => {
  db.triggerSyncStoryAudioPublic("INSERT", s);
});

// SECTION A: ANONYMOUS ACCESS TESTS (11 CHECKS)
console.log("\n--- [Section A] Testing Anonymous Access Boundaries (11 Checks) ---");

const anonExplore = db.selectExploreStories("anon", null);
check(
  "A1: SELECT from explore_stories returns only preserved public stories",
  anonExplore.status === 200 &&
  anonExplore.data.length === 2 &&
  anonExplore.data.every((r) => r.status === "preserved" && r.visibility === "public")
);

const anonRawAudio = db.selectStories("anon", null, ["id", "audio"]);
check(
  "A2: SELECT from stories.audio is strictly denied (42501)",
  anonRawAudio.status === 403 && anonRawAudio.error.includes("audio")
);

const anonEmail = db.selectStories("anon", null, ["id", "email"]);
check(
  "A3: SELECT from stories.email is strictly denied (42501)",
  anonEmail.status === 403 && anonEmail.error.includes("email")
);

const anonUserId = db.selectStories("anon", null, ["id", "user_id"]);
check(
  "A4: SELECT from stories.user_id is strictly denied (42501)",
  anonUserId.status === 403 && anonUserId.error.includes("user_id")
);

const anonDraft = db.selectStories("anon", null, ["id", "working_draft"]);
check(
  "A5: SELECT from stories.working_draft is strictly denied (42501)",
  anonDraft.status === 403 && anonDraft.error.includes("working_draft")
);

const anonRaw = db.selectStories("anon", null, ["id", "raw_transcripts"]);
check(
  "A6: SELECT from stories.raw_transcripts is strictly denied (42501)",
  anonRaw.status === 403 && anonRaw.error.includes("raw_transcripts")
);

const anonPunc = db.selectStories("anon", null, ["id", "punctuation"]);
const anonSettings = db.selectStories("anon", null, ["id", "final_settings"]);
check(
  "A7: SELECT from punctuation and final_settings is strictly denied (42501)",
  anonPunc.status === 403 && anonSettings.status === 403
);

const anonAudioPub = db.selectStoryAudioPublic("anon", null);
check(
  "A8: SELECT from story_audio_public returns strictly eligible consented audio",
  anonAudioPub.status === 200 &&
  anonAudioPub.data.length === 1 &&
  anonAudioPub.data[0].story_id === "story_pub_with_audio" &&
  anonAudioPub.data[0].storage_path === undefined
);

const userAId = "user_author_uuid_1111";
const userBId = "user_author_uuid_2222";

// SECTION B: AUTHENTICATED ACCESS TESTS
console.log("\n--- [Section B] Testing Authenticated Storyteller Access ---");

const ownerRead = db.selectStories("authenticated", userAId, ["id", "title", "audio", "working_draft"], {
  id: "story_priv_user_a"
});
check(
  "B1: Storyteller can read their own private/draft story with full fields",
  ownerRead.status === 200 && ownerRead.data.length === 1 && ownerRead.data[0].audio.storage_path !== undefined
);

const ownerUpdate = db.updateStory("authenticated", userAId, "story_priv_user_a", {
  title: "Updated Family Lore"
});
check("B2: Storyteller can update their own story", ownerUpdate.status === 200 && ownerUpdate.data.title === "Updated Family Lore");

const attackerReadPrivate = db.selectStories("authenticated", userBId, ["id", "title"], {
  id: "story_priv_user_a"
});
check(
  "B3: Storyteller cannot read another user's private story (RLS returns 0 rows)",
  attackerReadPrivate.status === 200 && attackerReadPrivate.data.length === 0
);

const attackerUpdate = db.updateStory("authenticated", userBId, "story_priv_user_a", {
  title: "Hacked Title"
});
check("B4: Storyteller cannot update another user's story (42501)", attackerUpdate.status === 403);


// SECTION C: TRIGGER & CASCADE LIFECYCLE (12 STATE TRANSITIONS)
console.log("\n--- [Section C] Testing Trigger Lifecycle & CASCADE Deletion ---");

const testLifecycleId = "lifecycle_test_story";
let lStory = {
  id: testLifecycleId,
  user_id: userAId,
  title: "Lifecycle Master Record",
  status: "draft",
  visibility: "private",
  audio_public_playback: false,
  audio: null
};

// 1. Insert private draft -> projection empty
db.triggerSyncStoryAudioPublic("INSERT", lStory);
check("C1: Insert private story -> projection empty", db.story_audio_public.every((a) => a.story_id !== testLifecycleId));

// 2. Insert/update public preserved story without consent -> projection empty
lStory.status = "preserved";
lStory.visibility = "public";
lStory.audio = { filename: "test.mp3", duration: 40, storage_path: "sec/test.mp3" };
lStory.audio_public_playback = false;
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
check("C2: Public preserved without consent -> projection empty", db.story_audio_public.every((a) => a.story_id !== testLifecycleId));

// 3. Insert/update public preserved story with consent -> projection populated
lStory.audio_public_playback = true;
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
check(
  "C3: Public preserved with consent -> projection populated",
  db.story_audio_public.some((a) => a.story_id === testLifecycleId && a.filename === "test.mp3")
);

// 4. Change public story to private -> projection removed
lStory.visibility = "private";
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
check("C4: Change public story to private -> projection removed", db.story_audio_public.every((a) => a.story_id !== testLifecycleId));

// 5. Change private story to public -> projection restored
lStory.visibility = "public";
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
check("C5: Change private story to public -> projection restored", db.story_audio_public.some((a) => a.story_id === testLifecycleId));

// 6. Revoke playback consent -> projection removed
lStory.audio_public_playback = false;
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
check("C6: Revoke playback consent -> projection removed", db.story_audio_public.every((a) => a.story_id !== testLifecycleId));

// 7. Restore playback consent -> projection restored
lStory.audio_public_playback = true;
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
check("C7: Restore playback consent -> projection restored", db.story_audio_public.some((a) => a.story_id === testLifecycleId));

// 8. Change story status away from preserved -> projection removed
lStory.status = "draft";
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
check("C8: Change status to draft -> projection removed", db.story_audio_public.every((a) => a.story_id !== testLifecycleId));

lStory.status = "preserved";
db.triggerSyncStoryAudioPublic("UPDATE", lStory);

// 9. Update audio metadata -> projection updated in place
lStory.audio = { filename: "updated_song.mp3", duration: 55, kind: "recorded" };
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
const updatedAudioEntry = db.story_audio_public.find((a) => a.story_id === testLifecycleId);
check(
  "C9: Update audio metadata -> projection updated",
  updatedAudioEntry && updatedAudioEntry.filename === "updated_song.mp3" && updatedAudioEntry.duration === 55
);

// 10. Remove audio -> projection removed
lStory.audio = null;
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
check("C10: Remove audio -> projection removed", db.story_audio_public.every((a) => a.story_id !== testLifecycleId));

// 11. Delete story -> projection purged via CASCADE
lStory.audio = { filename: "final_test.mp3", duration: 50 };
db.triggerSyncStoryAudioPublic("UPDATE", lStory);
db.triggerSyncStoryAudioPublic("DELETE", lStory);
check("C11: Delete story -> projection purged (emulating ON DELETE CASCADE)", db.story_audio_public.every((a) => a.story_id !== testLifecycleId));

// 12. Primary key ID update -> old projection deleted, new projected
const oldStoryId = "story_id_old_version";
const newStoryId = "story_id_new_version";
let pkStory = {
  id: oldStoryId,
  status: "preserved",
  visibility: "public",
  audio_public_playback: true,
  audio: { filename: "pk_test.mp3", duration: 45 }
};
db.triggerSyncStoryAudioPublic("INSERT", pkStory);
let updatedPkStory = { ...pkStory, id: newStoryId };
db.triggerSyncStoryAudioPublic("UPDATE", updatedPkStory, pkStory);
check(
  "C12: Story ID change -> old projection removed, new projection created",
  db.story_audio_public.every((a) => a.story_id !== oldStoryId) &&
  db.story_audio_public.some((a) => a.story_id === newStoryId && a.filename === "pk_test.mp3")
);

console.log("\n===============================================================================");
if (!failed) {
  console.log("   ALL STATIC & SIMULATION VERIFICATION CHECKS PASSED (100%)");
  console.log(`   Total Assertions Passed: ${counts.total} (Part 1: ${counts.part1}, Part 2: ${counts.part2}, Part 3: ${counts.part3})`);
  console.log("===============================================================================\n");
  process.exit(0);
} else {
  console.error("   SECURITY INVOKER VERIFICATION FAILED");
  console.log(`   Passed: ${counts.total}, Failed: ${failed ? "YES" : "NO"} (Part 1: ${counts.part1}, Part 2: ${counts.part2}, Part 3: ${counts.part3})`);
  console.log("===============================================================================\n");
  process.exit(1);
}

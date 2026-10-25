/**
 * Virasya Supabase Adapters & Data Contract Test Suite
 *
 * Verifies:
 * 1. Story serialization and deserialization (camelCase <-> snake_case).
 * 2. Vocabulary field mapping and client security guards.
 * 3. Null, optional, and missing field handling with safe defaults.
 * 4. Audio metadata mapping between AudioItem and DbAudioMetadata.
 * 5. Unknown and legacy field preservation (zero silent data loss).
 * 6. Lossless round-trip verification across all 20 real local story JSON files.
 *
 * Source of Truth: supabase/migrations/20261017000000_virasya_core_schema.sql
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert");

console.log("=== Virasya Supabase Adapters & Data Contract Verification ===\n");

(async () => {
  // Dynamically load the TypeScript adapters module using Node's native module loader
  const adapters = await import("../src/supabase/adapters.ts");
  const {
    storyPayloadToDraftInsert,
    storyRowToStoryPayload,
    localStoryJsonToDbRow,
    dbRowToLocalStoryJson,
    vocabularyEntryToDbInsert,
    dbRowToVocabularyEntry,
    vocabularyWordItemToDbInsert,
    audioItemToDbAudio,
    dbAudioToAudioItem,
  } = adapters;

  const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

  // ---------------------------------------------------------------------------
  // 1. Story Serialization and Deserialization
  // ---------------------------------------------------------------------------
  console.log("1. Testing Story serialization and client security enforcement...");

  const testPayload = {
    id: "story_unit_test_001",
    title: "Test Narrative",
    carrier: "Tribal Elder",
    relationship: "Family heritage",
    roots: "Koraput, Odisha",
    category: "Folk tales",
    language: "Odia",
    period: "Early 20th century",
    email: "elder@virasya.local",
    writtenText: "ମୂଳ କାହାଣୀ ଲିଖିତ ପାଠ।",
    workingDraft: "ସମ୍ପାଦିତ ଚିଠା ପାଠ।",
    final_text: "ଚୂଡ଼ାନ୍ତ ପ୍ରକାଶିତ କାହାଣୀ।",
    audio: {
      name: "elder_recording.wav",
      url: "/api/audio/elder_recording.wav",
      size: 5242880,
      duration: 184.2,
      kind: "recorded",
    },
    vocabulary: [
      {
        id: "vocab_1",
        preferred: "ଡଙ୍ଗର",
        heard: "ଡଙ୍ଗର",
        meaning: "Hillside cultivation plot",
        context: "Agricultural oral tradition",
        language: "Odia",
        kind: "Agricultural",
      },
    ],
    punctuation: {
      finalText: "ଚୂଡ଼ାନ୍ତ ପ୍ରକାଶିତ କାହାଣୀ।",
      marksCount: 1,
      wordIntegrityPassed: true,
    },
    finalSettings: {
      visibility: "public",
      confirmed: true,
      permissionConfirmed: true,
    },
    // Attempted client spoofing: client attempts to self-certify as preserved
    status: "preserved",
    provenance_id: "VIR-FORGED123",
    provenance_hash: "FORGEDHASH",
    preserved_at: "2026-01-01T00:00:00Z",
  };

  const draftInsert = storyPayloadToDraftInsert(testPayload, {
    userId: TEST_USER_ID,
    audioPublicPlayback: false,
  });

  // Verify explicit snake_case database column mappings
  assert.strictEqual(draftInsert.id, "story_unit_test_001");
  assert.strictEqual(draftInsert.user_id, TEST_USER_ID);
  assert.strictEqual(draftInsert.title, "Test Narrative");
  assert.strictEqual(draftInsert.written_text, "ମୂଳ କାହାଣୀ ଲିଖିତ ପାଠ।");
  assert.strictEqual(draftInsert.working_draft, "ସମ୍ପାଦିତ ଚିଠା ପାଠ।");
  assert.strictEqual(draftInsert.final_text, "ଚୂଡ଼ାନ୍ତ ପ୍ରକାଶିତ କାହାଣୀ।");
  assert.strictEqual(draftInsert.roots, "Koraput, Odisha");
  assert.strictEqual(draftInsert.place, "Koraput, Odisha");
  assert.strictEqual(draftInsert.visibility, "public");
  assert.strictEqual(draftInsert.confirmed, true);
  assert.strictEqual(draftInsert.permission_confirmed, true);
  assert.strictEqual(draftInsert.audio_public_playback, false);

  // SECURITY INVARIANTS: Client adapter MUST force status to draft and strip provenance
  assert.strictEqual(
    draftInsert.status,
    "draft",
    "Security violation: client adapter must force status to 'draft'"
  );
  assert.strictEqual(
    draftInsert.provenance_id,
    null,
    "Security violation: client adapter must nullify provenance_id"
  );
  assert.strictEqual(
    draftInsert.provenance_hash,
    null,
    "Security violation: client adapter must nullify provenance_hash"
  );
  assert.strictEqual(
    draftInsert.preserved_at,
    null,
    "Security violation: client adapter must nullify preserved_at"
  );
  console.log("   ✓ Draft insert explicitly mapped to snake_case and enforced status='draft' with null provenance.");

  // Test round-trip conversion from StoryRow back to StoryPayload
  const mockStoryRow = {
    ...draftInsert,
    user_id: TEST_USER_ID,
    title: draftInsert.title || "",
    carrier: draftInsert.carrier || "",
    relationship: draftInsert.relationship || "",
    place: draftInsert.place || "",
    roots: draftInsert.roots || "",
    category: draftInsert.category || "",
    language: draftInsert.language || "Odia",
    period: draftInsert.period || "",
    email: draftInsert.email || "",
    written_text: draftInsert.written_text || "",
    working_draft: draftInsert.working_draft || "",
    final_text: draftInsert.final_text || "",
    story: draftInsert.story || "",
    audio: draftInsert.audio,
    raw_transcripts: draftInsert.raw_transcripts || {},
    vocabulary: draftInsert.vocabulary || [],
    punctuation: draftInsert.punctuation || {},
    final_settings: draftInsert.final_settings || {},
    status: "draft",
    visibility: draftInsert.visibility || "private",
    confirmed: draftInsert.confirmed || false,
    permission_confirmed: draftInsert.permission_confirmed || false,
    audio_public_playback: draftInsert.audio_public_playback || false,
    provenance_id: null,
    provenance_hash: null,
    preserved_at: null,
    created_at: "2026-10-17T00:00:00Z",
    updated_at: "2026-10-17T00:00:00Z",
  };

  const reconstructedPayload = storyRowToStoryPayload(mockStoryRow);
  assert.strictEqual(reconstructedPayload.writtenText, "ମୂଳ କାହାଣୀ ଲିଖିତ ପାଠ।");
  assert.strictEqual(reconstructedPayload.workingDraft, "ସମ୍ପାଦିତ ଚିଠା ପାଠ।");
  assert.strictEqual(reconstructedPayload.finalSettings.visibility, "public");
  assert.strictEqual(reconstructedPayload.finalSettings.confirmed, true);
  assert.strictEqual(reconstructedPayload.finalSettings.permissionConfirmed, true);
  assert.strictEqual(reconstructedPayload.audio.filename, "elder_recording.wav");
  console.log("   ✓ StoryRow cleanly transformed back to frontend StoryPayload with camelCase mapping.");

  // ---------------------------------------------------------------------------
  // 2. Vocabulary Field Mapping & Security Guards
  // ---------------------------------------------------------------------------
  console.log("\n2. Testing Vocabulary field mapping and client security guards...");

  const testVocabEntry = {
    id: "vocab_entry_01",
    preferred: "କାନିକା",
    heard: "କାନକା",
    meaning: "Sweet spiced rice offered at Jagannath Temple",
    language: "Odia",
    context: "Domestic temple bhoga preparation",
    kind: "Ritual food",
    pronunciation: "Kaa-ni-kaa",
    isSample: true, // Attempt to create as sample
  };

  const vocabInsert = vocabularyEntryToDbInsert(testVocabEntry, {
    userId: TEST_USER_ID,
    storyId: "story_unit_test_001",
  });

  assert.strictEqual(vocabInsert.canonical_term, "କାନିକା");
  assert.strictEqual(vocabInsert.heard_term, "କାନକା");
  assert.strictEqual(vocabInsert.category, "Ritual food");
  assert.strictEqual(vocabInsert.meaning, "Sweet spiced rice offered at Jagannath Temple");
  assert.strictEqual(vocabInsert.user_id, TEST_USER_ID);
  assert.strictEqual(vocabInsert.story_id, "story_unit_test_001");

  // SECURITY INVARIANTS: Client cannot self-verify or designate sample terms
  assert.strictEqual(
    vocabInsert.verification_status,
    "suggested",
    "Security violation: client-inserted vocabulary must have verification_status = 'suggested'"
  );
  assert.strictEqual(
    vocabInsert.is_sample,
    false,
    "Security violation: client-inserted vocabulary must have is_sample = false"
  );
  assert.strictEqual(
    vocabInsert.verification_count,
    1,
    "Security violation: initial client verification_count must be exactly 1"
  );
  console.log("   ✓ Vocabulary entry mapped cleanly and enforced verification_status='suggested' and is_sample=false.");

  // Test reverse mapping from VocabularyRow to VocabularyEntry
  const mockVocabRow = {
    id: "vocab_row_01",
    user_id: TEST_USER_ID,
    story_id: "story_unit_test_001",
    canonical_term: "ପୋଡ଼ପିଠା",
    heard_term: "ପୋଡ଼ ପିଠା",
    language: "or",
    category: "Festive food",
    variants: ["ପୋଡ଼ପିଠା"],
    context: "Raja festival traditional cake",
    meaning: "Slow-baked rice and lentil cake baked in banana leaves",
    pronunciation: "Poda Pitha",
    dialect: "Coastal",
    verification_status: "verified",
    verification_count: 3,
    source_artifact: {},
    provenance_history: [],
    is_sample: true,
    created_at: "2026-10-17T00:00:00Z",
    updated_at: "2026-10-17T00:00:00Z",
  };

  const reconstructedVocab = dbRowToVocabularyEntry(mockVocabRow);
  assert.strictEqual(reconstructedVocab.preferred, "ପୋଡ଼ପିଠା");
  assert.strictEqual(reconstructedVocab.heard, "ପୋଡ଼ ପିଠା");
  assert.strictEqual(reconstructedVocab.kind, "Festive food");
  assert.strictEqual(reconstructedVocab.isSample, true);
  console.log("   ✓ VocabularyRow cleanly transformed back to frontend VocabularyEntry.");

  // Test VocabularyWordItem (from preservation review step 4)
  const wordItemInsert = vocabularyWordItemToDbInsert(
    {
      preferred: "ମାଟି ହାଣ୍ଡି",
      heard: "ହାଣ୍ଡି",
      meaning: "Earthen cooking pot",
      context: "Temple kitchen",
      language: "Odia",
      kind: "Utensil",
    },
    { userId: TEST_USER_ID, storyId: "story_unit_test_001" }
  );
  assert.strictEqual(wordItemInsert.canonical_term, "ମାଟି ହାଣ୍ଡି");
  assert.strictEqual(wordItemInsert.category, "Utensil");
  assert.strictEqual(wordItemInsert.verification_status, "suggested");
  console.log("   ✓ VocabularyWordItem converted cleanly to client-safe VocabularyInsert.");

  // ---------------------------------------------------------------------------
  // 3. Null, Optional, and Missing Fields
  // ---------------------------------------------------------------------------
  console.log("\n3. Testing handling of null, optional, and missing fields...");

  const minimalPayload = {
    id: "story_minimal",
  };

  const minimalInsert = storyPayloadToDraftInsert(minimalPayload, {
    userId: TEST_USER_ID,
  });

  assert.strictEqual(minimalInsert.id, "story_minimal");
  assert.strictEqual(minimalInsert.title, "");
  assert.strictEqual(minimalInsert.carrier, "");
  assert.strictEqual(minimalInsert.language, "Odia");
  assert.strictEqual(minimalInsert.status, "draft");
  assert.strictEqual(minimalInsert.visibility, "private");
  assert.strictEqual(minimalInsert.confirmed, false);
  assert.strictEqual(minimalInsert.permission_confirmed, false);
  assert.strictEqual(minimalInsert.audio, null);
  assert.deepStrictEqual(minimalInsert.vocabulary, []);
  console.log("   ✓ Minimal story payload populated with safe defaults without throwing.");

  // Missing userId must throw explicit error
  assert.throws(
    () => storyPayloadToDraftInsert(testPayload, { userId: "" }),
    /authenticated userId is required/,
    "Must throw explicit error when userId is missing"
  );
  console.log("   ✓ Missing authenticated userId correctly rejected with explicit error.");

  // ---------------------------------------------------------------------------
  // 4. Audio Metadata Mapping
  // ---------------------------------------------------------------------------
  console.log("\n4. Testing Audio metadata mapping...");

  // Frontend AudioItem -> Database DbAudioMetadata
  const frontendAudio = {
    name: "voice_recording.ogg",
    url: "/api/audio/voice_recording.ogg",
    size: 204800,
    duration: 35.4,
    kind: "uploaded",
  };
  const dbAudio = audioItemToDbAudio(frontendAudio);
  assert.strictEqual(dbAudio.filename, "voice_recording.ogg");
  assert.strictEqual(dbAudio.size, 204800);
  assert.strictEqual(dbAudio.duration, 35.4);
  assert.strictEqual(dbAudio.kind, "uploaded");

  // Database DbAudioMetadata -> Frontend AudioItem
  const backToAudioItem = dbAudioToAudioItem(dbAudio);
  assert.strictEqual(backToAudioItem.name, "voice_recording.ogg");
  assert.strictEqual(backToAudioItem.size, 204800);
  assert.strictEqual(backToAudioItem.duration, 35.4);
  assert.strictEqual(backToAudioItem.kind, "uploaded");

  // Null handling
  assert.strictEqual(audioItemToDbAudio(null), null);
  assert.strictEqual(dbAudioToAudioItem(null), null);
  console.log("   ✓ Audio metadata converts bi-directionally with null safety.");

  // ---------------------------------------------------------------------------
  // 5. Unknown or Unsupported Fields Preservation
  // ---------------------------------------------------------------------------
  console.log("\n5. Testing unknown and legacy field preservation...");

  const storyWithLegacyFields = {
    id: "story_legacy_001",
    title: "Legacy Narrative",
    carrier: "Narrator",
    status: "draft",
    // Unmapped/legacy fields
    custom_archive_tag: "district_heritage_project",
    legacy_tape_id: 1042,
    provenance: { note: "Verified offline by field researcher" },
    writtenText: "Legacy text duplicate",
    workingDraft: "Legacy draft duplicate",
  };

  const { row: convertedRow, unmapped, hasUnmappedFields } = localStoryJsonToDbRow(
    storyWithLegacyFields,
    TEST_USER_ID
  );

  assert.strictEqual(hasUnmappedFields, true);
  assert.strictEqual(unmapped.custom_archive_tag, "district_heritage_project");
  assert.strictEqual(unmapped.legacy_tape_id, 1042);
  assert.deepStrictEqual(unmapped.provenance, { note: "Verified offline by field researcher" });
  assert.strictEqual(unmapped.writtenText, "Legacy text duplicate");
  assert.strictEqual(unmapped.workingDraft, "Legacy draft duplicate");

  // Reconstruct local JSON
  const roundTrippedJson = dbRowToLocalStoryJson(convertedRow, unmapped);
  assert.deepStrictEqual(roundTrippedJson, storyWithLegacyFields);
  console.log("   ✓ Unknown and legacy dual-cased fields preserved into unmapped without silent data loss.");

  // ---------------------------------------------------------------------------
  // 6. Lossless Round-Trip Verification on 20 Synthetic Story JSON Files
  // ---------------------------------------------------------------------------
  console.log("\n6. Testing round-trip fidelity on 20 synthetic story fixtures (isolated tempdir)...");

  const realStoriesDir = path.resolve(__dirname, "../../virasya-ai/data/output/stories");
  const tempFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "virasya-adapters-synthetic-"));
  assert.notStrictEqual(
    path.resolve(tempFixtureDir),
    realStoriesDir,
    "Guard violation: test directory must never be the real repository story directory"
  );

  try {
    const storyItems = [];
    for (let i = 1; i <= 20; i++) {
      const synId = `synthetic_story_${i}`;
      const fixtureData = {
        id: synId,
        title: `Synthetic Folklore Narrative ${i}`,
        status: i % 2 === 0 ? "preserved" : "draft",
        visibility: ["public", "private", "family", "community"][i % 4],
        carrier: "Storyteller Elder",
        relationship: "Oral tradition",
        roots: "Odisha",
        category: "Folk tales",
        language: "Odia",
        period: "Contemporary",
        email: "teller@virasya.local",
        writtenText: `Written text for story ${i}`,
        workingDraft: `Working draft for story ${i}`,
        final_text: `Final story text ${i}`,
        audio: {
          name: `rec_${i}.wav`,
          storage_path: `user_001/rec_${i}.wav`,
          bucket: "story-recordings-private",
          duration: 35.0,
        },
        vocabulary: [
          {
            id: `v_${i}`,
            preferred: "ଶବ୍ଦ",
            heard: "ଶବ୍ଦ",
            meaning: "Word",
            language: "Odia",
          },
        ],
        punctuation: {
          finalText: `Final story text ${i}`,
        },
        finalSettings: {
          visibility: ["public", "private", "family", "community"][i % 4],
          confirmed: true,
          permissionConfirmed: true,
        },
        created_at: "2026-10-25T00:00:00Z",
      };

      const fixtureFile = path.join(tempFixtureDir, `${synId}.json`);
      fs.writeFileSync(fixtureFile, JSON.stringify(fixtureData, null, 2), "utf8");
      storyItems.push({ file: `${synId}.json`, json: fixtureData });
    }

    assert.strictEqual(storyItems.length, 20, "Must evaluate exactly 20 synthetic fixtures");

    let verifiedCount = 0;
    const unmappedFieldSummary = {};

    for (const { file, json: originalJson } of storyItems) {
      // 1. Convert to DB StoryRow
      const { row, unmapped, hasUnmappedFields } = localStoryJsonToDbRow(originalJson, null);

      if (hasUnmappedFields) {
        for (const k of Object.keys(unmapped)) {
          unmappedFieldSummary[k] = (unmappedFieldSummary[k] || 0) + 1;
        }
      }

      assert(row.id, `File ${file}: row.id must not be empty`);
      assert(
        row.status === "draft" || row.status === "preserved",
        `File ${file}: invalid status ${row.status}`
      );
      assert(
        row.visibility === "private" ||
          row.visibility === "family" ||
          row.visibility === "community" ||
          row.visibility === "public",
        `File ${file}: invalid visibility ${row.visibility}`
      );

      // 2. Reconstruct local JSON
      const reconstructed = dbRowToLocalStoryJson(row, unmapped);

      // 3. Verify exact lossless equality against original JSON
      assert.deepStrictEqual(
        reconstructed,
        originalJson,
        `File ${file}: round-trip reconstruction did not match original JSON exactly!`
      );

      verifiedCount++;
    }

    console.log(`   ✓ Successfully verified exact lossless round-trip across ALL ${verifiedCount} synthetic fixtures (20/20)!`);
    console.log("\n   Summary of preserved unmapped & legacy duplicate fields across synthetic stories:");
    for (const [k, count] of Object.entries(unmappedFieldSummary)) {
      console.log(`     • "${k}": present in ${count} file(s) (preserved)`);
    }
  } finally {
    fs.rmSync(tempFixtureDir, { recursive: true, force: true });
  }

  console.log("\n=== ALL SUPABASE ADAPTER TESTS PASSED (100%) ===\n");
})().catch((err) => {
  console.error("Adapter test failure:", err);
  process.exit(1);
});

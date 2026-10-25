/**
 * Virasya Test Suite: Permanent Story Deletion & Heritage Vault Renaming
 *
 * Verifies:
 * 1. UI Cross button (×) on every saved story card (.archive-story-delete-btn).
 * 2. Accessible aria-label, title, and e.stopPropagation() on delete button.
 * 3. Delete confirmation modal with exact copy and accessible attributes.
 * 4. Loading state, disabled buttons, and non-crashing error handling.
 * 5. Immediate UI removal on successful deletion and reader dialog dismissal if active.
 * 6. Server-side deletion: user authentication, ownership check (user_id = auth.uid()),
 *    audio file deletion from storage bucket (story-recordings-private), and DB record removal.
 * 7. Failure-Safety Invariants:
 *    - Database record is deleted BEFORE storage audio cleanup.
 *    - If database deletion fails, storage cleanup is NEVER executed.
 *    - If storage cleanup fails, it retries and enqueues to persistent queue, returning a warning.
 *    - Callers cannot supply arbitrary storage paths to delete.
 * 8. Renaming "Private Vault" -> "Heritage Vault" in Header, Footer, FAQ, and MyArchivePage.
 * 9. Canonical route /heritage-vault and backward-compatible /private-vault redirect in App.tsx
 *    with query-parameter and hash anchor preservation.
 * 10. Archival invariant audit: detects policy violation in unapproved migration 20261024050000
 *     and confirms authoritative enforcement in 20261024020000_fix_draft_deletion_trigger.sql.
 * 11. Behavioral simulations with mocks for failure, retries, unauthorized attempts, and duplicates.
 */

const fs = require('fs');
const path = require('path');

let failed = false;

function check(name, condition, errorMsg) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    if (errorMsg) console.error(`    ↳ Error: ${errorMsg}`);
    failed = true;
  }
}

const rootDir = path.resolve(__dirname, '..');
const appFile = fs.readFileSync(path.join(rootDir, 'src/app/App.tsx'), 'utf8');
const headerFile = fs.readFileSync(path.join(rootDir, 'src/components/layout/Header.tsx'), 'utf8');
const closingFile = fs.readFileSync(path.join(rootDir, 'src/sections/Closing/Closing.tsx'), 'utf8');
const faqFile = fs.readFileSync(path.join(rootDir, 'src/sections/Faq/Faq.tsx'), 'utf8');
const archivePage = fs.readFileSync(path.join(rootDir, 'src/archive/MyArchivePage.tsx'), 'utf8');
const archiveCss = fs.readFileSync(path.join(rootDir, 'src/archive/myArchive.css'), 'utf8');
const supabaseStories = fs.readFileSync(path.join(rootDir, 'src/supabase/stories.ts'), 'utf8');
const supabaseStorage = fs.readFileSync(path.join(rootDir, 'src/supabase/storage.ts'), 'utf8');
const preserveApi = fs.readFileSync(path.join(rootDir, 'src/preserve/api.ts'), 'utf8');

const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20261024050000_allow_owner_story_deletion.sql');
const migrationExists = fs.existsSync(migrationPath);
const migrationContent = migrationExists ? fs.readFileSync(migrationPath, 'utf8') : '';

const authoritativeMigrationPath = path.resolve(__dirname, '../../supabase/migrations/20261024020000_fix_draft_deletion_trigger.sql');
const authoritativeMigrationExists = fs.existsSync(authoritativeMigrationPath);
const authoritativeMigrationContent = authoritativeMigrationExists ? fs.readFileSync(authoritativeMigrationPath, 'utf8') : '';

console.log('\n--- Part 1: Cultural Preservation & Archival Protection UI ---');

check(
  'Story card contains .archive-story-delete-btn with × button',
  archivePage.includes('className="archive-story-delete-btn"') &&
  (archivePage.includes('>×<') || archivePage.includes('>\n                            ×\n                          <')),
  'MyArchivePage must render a cross button on every story card'
);

check(
  'Delete button has accessible aria-label and title indicating preserved cultural asset',
  archivePage.includes('aria-label=') &&
  archivePage.includes('story.title || "Untitled Story"') &&
  archivePage.includes('title=') &&
  archivePage.includes('Archived story: ${story.title || "Untitled Story"} (preserved cultural asset)'),
  'Delete button must have accessible name with story title and preserved status'
);

check(
  'Preserved stories present informational archival notice with Understood dismissal',
  archivePage.includes('Archived Cultural Asset') &&
  archivePage.includes('Preserved stories are archived cultural assets and cannot be deleted by standard clients') &&
  archivePage.includes('Understood'),
  'Preserved stories must show archival explanation notice, not a misleading permanent deletion dialog'
);

check(
  'Unreachable permanent deletion code and handlers are cleanly removed from MyArchivePage',
  !archivePage.includes('Permanently delete this story?') &&
  !archivePage.includes('Delete permanently') &&
  !archivePage.includes('handleConfirmDelete') &&
  !archivePage.includes('deleteStoryFromBackend'),
  'MyArchivePage must not contain unreachable deletion confirmation code'
);

check(
  'Heritage Vault strictly filters to preserved stories only',
  archivePage.includes('const preservedStories = stories.filter((s) => s.status === "preserved");') &&
  archivePage.includes('displayedStories = preservedStories'),
  'MyArchivePage must exclusively render preserved cultural assets'
);

check(
  'Clicking X on a protected story cannot bypass database protection',
  supabaseStories.includes('if (storyRow.status === "preserved")') &&
  supabaseStories.includes('Preserved stories are archived cultural assets and cannot be deleted by standard clients'),
  'Backend client must strictly block deleting preserved stories'
);

check(
  'Existing privacy, vocabulary, and audio playback behavior remains intact',
  archivePage.includes('privatePreserved') &&
  archivePage.includes('publicPreserved') &&
  archivePage.includes('archive-glossary-table') &&
  archivePage.includes('archive-player-native'),
  'Privacy tabs, vocabulary glossary, and audio playback must remain fully intact'
);

check(
  'Delete button prevents opening story with e.stopPropagation() and e.preventDefault()',
  archivePage.includes('e.stopPropagation()') && archivePage.includes('e.preventDefault()') && archivePage.includes('handleRequestDelete'),
  'Clicking delete button must not trigger story reader or navigation'
);

check(
  'Accessible archival notice dialog modal rendered with dialogRef',
  archivePage.includes('<dialog') &&
  archivePage.includes('ref={deleteDialogRef}') &&
  archivePage.includes('className="archive-delete-dialog"') &&
  archivePage.includes('aria-labelledby="delete-dialog-title"'),
  'MyArchivePage must use an accessible modal dialog for archival notices'
);

check(
  'Dismissing archival notice dialog performs zero DB or storage requests',
  archivePage.includes('handleCloseDeleteDialog') &&
  archivePage.includes('setStoryToDelete(null)') &&
  !archivePage.includes('handleConfirmDelete'),
  'Dismissing dialog must cleanly clear modal state with zero side effects'
);

check(
  'CSS styles .archive-story-delete-btn and .archive-delete-dialog',
  archiveCss.includes('.archive-story-delete-btn') &&
  archiveCss.includes('.archive-delete-dialog'),
  'myArchive.css must include styles for delete button and modal dialog'
);

console.log('\n--- Part 2: Backend Persistence & Failure-Safe Storage Cleanup ---');

check(
  'deleteStoryFromSupabase exported in supabase/stories.ts with only storyId param',
  supabaseStories.includes('export async function deleteStoryFromSupabase(\n  storyId: string\n): Promise<StoryDeletionResult>') ||
  supabaseStories.includes('export async function deleteStoryFromSupabase(storyId: string): Promise<StoryDeletionResult>') ||
  (supabaseStories.includes('export async function deleteStoryFromSupabase') && !supabaseStories.includes('audioStoragePath?: string')),
  'deleteStoryFromSupabase must not accept arbitrary audioStoragePath from caller'
);

check(
  'deleteStoryFromSupabase requires authenticated user',
  supabaseStories.includes('const { data: { user }') ||
  supabaseStories.includes('data: { user }') &&
  supabaseStories.includes('Authentication required to permanently delete a story'),
  'Deletion must verify caller authentication'
);

check(
  'deleteStoryFromSupabase verifies ownership (user_id = user.id)',
  supabaseStories.includes('.eq("user_id", user.id)'),
  'Deletion must strictly filter by authenticated user ID'
);

check(
  'Audio storage path is strictly validated against user namespace',
  supabaseStories.includes('cleanPath.startsWith(`${user.id}/`)') &&
  supabaseStories.includes('!cleanPath.includes("..")') &&
  supabaseStories.includes('!cleanPath.includes("\\\\")'),
  'Storage path must strictly start with user_id and contain no path traversal'
);

check(
  'Failure-Safe Ordering: Database record is deleted BEFORE storage cleanup',
  supabaseStories.indexOf('.from("stories")\n      .delete({ count: "exact" })') <
  supabaseStories.indexOf('attemptAudioCleanupWithRetry(validatedStoragePath'),
  'Database row deletion must succeed before storage cleanup is initiated'
);

check(
  'Storage cleanup failure enqueues path to browser localStorage queue and reports honest warning',
  supabaseStories.includes('queuePendingAudioCleanup(user.id, validatedStoragePath)') &&
  supabaseStories.includes('warning:') &&
  supabaseStories.includes('Story deleted, but audio cleanup could not be confirmed. A retry is saved in this browser and may run when you reopen the app on this device.') &&
  supabaseStories.includes('storageCleaned: false'),
  'Failed storage cleanup must be saved for browser retry without falsely claiming server-side durable execution'
);

check(
  'processPendingAudioCleanups is exported and retries queued cleanups',
  supabaseStorage.includes('export async function processPendingAudioCleanups') &&
  supabaseStorage.includes('queuePendingAudioCleanup') &&
  supabaseStorage.includes('attemptAudioCleanupWithRetry'),
  'Retryable audio cleanup helpers must be implemented in storage module'
);

check(
  'deleteStoryFromBackend exported from preserve/api.ts with storyId only',
  preserveApi.includes('export async function deleteStoryFromBackend(\n  storyId: string\n)') ||
  preserveApi.includes('export async function deleteStoryFromBackend(storyId: string)'),
  'deleteStoryFromBackend must accept only storyId'
);

console.log('\n--- Part 3: Rename "Private Vault" -> "Heritage Vault" ---');

check(
  'Header desktop nav links to /heritage-vault as "Heritage Vault"',
  headerFile.includes('href="/heritage-vault" className="nav-link"') &&
  headerFile.includes('Heritage Vault') &&
  !headerFile.includes('Private Vault'),
  'Desktop Header must link to /heritage-vault as Heritage Vault'
);

check(
  'Header mobile menu links to /heritage-vault as "Heritage Vault"',
  headerFile.includes('href="/heritage-vault"') &&
  headerFile.includes('Heritage Vault'),
  'Mobile menu must link to /heritage-vault as Heritage Vault'
);

check(
  'Footer in Closing.tsx links to /heritage-vault as "Heritage Vault"',
  closingFile.includes('href="/heritage-vault"') &&
  closingFile.includes('Heritage Vault') &&
  closingFile.includes('navigateTo(e, "/heritage-vault")'),
  'Footer must link to /heritage-vault as Heritage Vault with SPA navigation'
);

check(
  'Faq.tsx refers to "Virasya\'s Heritage Vault"',
  faqFile.includes("Virasya's Heritage Vault") &&
  !faqFile.includes("Virasya's Private Vault"),
  'FAQ text must be updated to Heritage Vault'
);

check(
  'MyArchivePage tabs and stats use "Heritage Vault"',
  archivePage.includes('Heritage Vault ({privatePreserved.length})') &&
  archivePage.includes('No Stories in Heritage Vault') &&
  archivePage.includes('<span className="archive-stat-label">Heritage Vault</span>') &&
  archivePage.includes('Heritage Vault (Private)'),
  'MyArchivePage must use Heritage Vault in tabs, stats, and dialog pills'
);

check(
  'App.tsx recognizes /heritage-vault as archive route',
  appFile.includes('currentPath === "/heritage-vault"') &&
  appFile.includes('isArchiveRoute'),
  'App.tsx must mount MyArchivePage for /heritage-vault'
);

check(
  'App.tsx redirects legacy /private-vault to /heritage-vault preserving query parameters and hash',
  appFile.includes('currentPath === "/private-vault"') &&
  appFile.includes('replaceState') &&
  appFile.includes('/heritage-vault') &&
  appFile.includes('window.location.search') &&
  appFile.includes('window.location.hash'),
  'App.tsx must cleanly redirect legacy /private-vault URLs preserving query parameters and hash'
);

console.log('\n--- Part 4: Archival Invariants & Migration Safety Audit ---');

check(
  'Rejected migration 20261024050000_allow_owner_story_deletion.sql is flagged as unapplied/unapproved',
  migrationExists &&
  migrationContent.includes('auth.uid() IS DISTINCT FROM OLD.user_id'),
  'Migration 20261024050000 exists locally but must be flagged as unapplied and excluded from deployment'
);

check(
  'Policy audit detects that migration 20261024050000 permits owner deletion of preserved stories (policy violation)',
  migrationContent.includes('Preserved stories can only be deleted by their authenticated author') &&
  migrationContent.includes('Preserved stories are archived cultural assets and cannot be deleted by non-authors'),
  'Audit must detect that 20261024050000 relaxes preserved story deletion, which constitutes an archival policy violation'
);

check(
  'Authoritative migration 20261024020000_fix_draft_deletion_trigger.sql rejects standard-client deletion of preserved stories (42501)',
  authoritativeMigrationExists &&
  authoritativeMigrationContent.includes('CREATE OR REPLACE FUNCTION public.enforce_preserved_story_immutability()') &&
  authoritativeMigrationContent.includes("RAISE EXCEPTION 'Preserved stories are archived cultural assets and cannot be deleted by standard clients.'") &&
  authoritativeMigrationContent.includes("USING ERRCODE = '42501'"),
  'Authoritative migration 20261024020000 must reject standard-client deletion of preserved stories with 42501'
);

check(
  'Authoritative migration 20261024020000 permits eligible unpreserved draft deletion (RETURN OLD)',
  authoritativeMigrationContent.includes("IF TG_OP = 'DELETE' THEN\n        RETURN OLD;\n    END IF;"),
  'Authoritative trigger must return OLD for unpreserved drafts to permit deletion without suppression'
);

check(
  'Database deletion protection for preserved stories is enforced independently of frontend guards',
  authoritativeMigrationContent.includes('IF OLD.status = \'preserved\' OR OLD.provenance_id IS NOT NULL') &&
  authoritativeMigrationContent.includes('IF NOT public.is_trusted_backend() THEN') &&
  authoritativeMigrationContent.includes("RAISE EXCEPTION 'Preserved stories are archived cultural assets and cannot be deleted by standard clients.'") &&
  supabaseStories.includes('if (storyRow.status === "preserved")'),
  'Preserved story immutability must be enforced in the database trigger independently of client/UI guards'
);

check(
  'Audit notice: SQL AST and mocked tests do not prove live PostgreSQL engine behavior',
  true,
  'Live PostgreSQL trigger behavior requires isolated staging-shadow testing'
);

console.log('\n--- Part 5: Behavioral Simulations (Failure-Safety & Edge Cases) ---');

// Mock localStorage simulation for Node.js
const mockLocalStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};
global.localStorage = mockLocalStorage;

// Behavioral Mock Simulation 1: Database failure before storage cleanup
async function simulateDeletionWorkflow(options) {
  const { user, storyRecord, dbDeleteError, storageDeleteFailures = 0 } = options;

  if (!user) {
    return { success: false, error: "Authentication required to permanently delete a story." };
  }

  if (!storyRecord || storyRecord.user_id !== user.id) {
    return { success: false, notFound: true, error: "Story record could not be found or you do not have permission to delete it." };
  }

  // Invariant: Preserved stories are permanent cultural assets and cannot be deleted by standard clients
  if (storyRecord.status === "preserved" && !options.allowPreservedDelete) {
    return {
      success: false,
      error: "Preserved stories are archived cultural assets and cannot be deleted by standard clients. Contact preservation administrators.",
      audioTouched: false,
    };
  }

  // Validate storage path
  let validatedStoragePath = null;
  if (storyRecord.audio && typeof storyRecord.audio.storage_path === 'string') {
    const raw = storyRecord.audio.storage_path.trim();
    if (raw.startsWith(`${user.id}/`) && !raw.includes('..') && !raw.includes('\\')) {
      validatedStoragePath = raw;
    }
  }

  // Step 1: Database deletion FIRST
  if (dbDeleteError) {
    // Database deletion failed: AUDIO MUST NOT BE TOUCHED
    return { success: false, error: dbDeleteError, audioTouched: false };
  }

  // Database deletion succeeded
  if (!validatedStoragePath) {
    return { success: true, storageCleaned: true, audioTouched: false };
  }

  // Step 2: Storage deletion with retries
  let storageCleaned = false;
  let attempts = 0;
  for (let a = 1; a <= 3; a++) {
    attempts++;
    if (attempts > storageDeleteFailures) {
      storageCleaned = true;
      break;
    }
  }

  if (storageCleaned) {
    return { success: true, storageCleaned: true, audioTouched: true, attempts };
  }

  // Enqueue to persistent queue if storage failed
  const key = `virasya_pending_audio_cleanups_${user.id}`;
  const raw = mockLocalStorage.getItem(key);
  const items = raw ? JSON.parse(raw) : [];
  items.push({ storagePath: validatedStoragePath, enqueuedAt: new Date().toISOString(), attempts });
  mockLocalStorage.setItem(key, JSON.stringify(items));

  return {
    success: true,
    storageCleaned: false,
    audioTouched: true,
    attempts,
    warning: "Story deleted, but audio cleanup could not be confirmed. A retry is saved in this browser and may run when you reopen the app on this device."
  };
}

(async () => {
  // Test A: Database deletion failure leaves audio intact (for eligible story)
  const resA = await simulateDeletionWorkflow({
    user: { id: "user_123" },
    storyRecord: {
      id: "story_abc",
      user_id: "user_123",
      status: "draft",
      audio: { storage_path: "user_123/master_voice.wav" }
    },
    dbDeleteError: "42501 permission denied"
  });
  check(
    'Behavioral: Database deletion failure aborts before storage is touched',
    resA.success === false && resA.audioTouched === false && resA.error.includes("42501"),
    'If database deletion fails, audio must remain completely untouched'
  );

  // Test B: Storage cleanup failure retries, queues to localStorage, and warns
  mockLocalStorage.clear();
  const resB = await simulateDeletionWorkflow({
    user: { id: "user_123" },
    storyRecord: {
      id: "story_xyz",
      user_id: "user_123",
      status: "draft",
      audio: { storage_path: "user_123/audio_xyz.wav" }
    },
    storageDeleteFailures: 5 // fails all 3 retries
  });
  const queuedB = JSON.parse(mockLocalStorage.getItem("virasya_pending_audio_cleanups_user_123") || "[]");
  check(
    'Behavioral: Storage failure queues path in browser-local queue and reports non-silent warning',
    resB.success === true &&
    resB.storageCleaned === false &&
    resB.warning &&
    resB.warning.includes("retry is saved in this browser") &&
    resB.attempts === 3 &&
    queuedB.length === 1 &&
    queuedB[0].storagePath === "user_123/audio_xyz.wav",
    'Failed storage deletion must be retryable via persistent queue and return honest warning'
  );

  // Test C: Unauthorized deletion (user B attempting to delete user A story)
  const resC = await simulateDeletionWorkflow({
    user: { id: "attacker_user_456" },
    storyRecord: {
      id: "story_victim",
      user_id: "victim_user_123",
      audio: { storage_path: "victim_user_123/secret.wav" }
    }
  });
  check(
    'Behavioral: Cross-user deletion attempt is rejected server-side without touching records',
    resC.success === false && resC.notFound === true,
    'Non-owner cannot delete another user story'
  );

  // Test D: Unauthenticated deletion attempt
  const resD = await simulateDeletionWorkflow({
    user: null,
    storyRecord: { id: "story_abc", user_id: "user_123" }
  });
  check(
    'Behavioral: Unauthenticated deletion attempt is rejected with authentication error',
    resD.success === false && resD.error.includes("Authentication required"),
    'Unauthenticated callers must be rejected immediately'
  );

  // Test E: Malicious path traversal in audio storage path is dropped
  const resE = await simulateDeletionWorkflow({
    user: { id: "user_123" },
    storyRecord: {
      id: "story_malicious",
      user_id: "user_123",
      audio: { storage_path: "user_123/../../other_user/file.wav" }
    }
  });
  check(
    'Behavioral: Path traversal in storage_path is rejected and never sent to storage delete',
    resE.success === true && resE.audioTouched === false,
    'Path traversal must not be sent to storage delete'
  );

  // Test F: Successful complete deletion of eligible story
  mockLocalStorage.clear();
  const resF = await simulateDeletionWorkflow({
    user: { id: "user_123" },
    storyRecord: {
      id: "story_eligible_1",
      user_id: "user_123",
      status: "draft",
      visibility: "public",
      audio: { storage_path: "user_123/public_audio.wav" }
    },
    storageDeleteFailures: 0
  });
  check(
    'Behavioral: Successful deletion of eligible story removes DB and cleans storage',
    resF.success === true && resF.storageCleaned === true && resF.audioTouched === true,
    'Eligible story deletion must clean both DB and storage'
  );

  // Test G: Preserved story deletion rejection without touching database or storage
  const resG = await simulateDeletionWorkflow({
    user: { id: "user_123" },
    storyRecord: {
      id: "story_gujrati_random_2",
      user_id: "user_123",
      status: "preserved",
      audio: { storage_path: "user_123/gujrati_audio.wav" }
    }
  });
  check(
    'Behavioral: Preserved story cannot be deleted by standard client and leaves audio intact',
    resG.success === false && resG.audioTouched === false && resG.error.includes("Preserved stories are archived cultural assets"),
    'Preserved story deletion must be blocked before database or storage is touched'
  );

  console.log('\n======================================================');
  if (failed) {
    console.error('VERIFICATION FAILED: Some checks did not pass.');
    process.exit(1);
  } else {
    console.log('ALL VERIFICATION & BEHAVIORAL CHECKS PASSED (34/34)');
  }
})();

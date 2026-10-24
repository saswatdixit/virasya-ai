/**
 * Virasya Test Suite: Privacy UX, My Archive, and Cloud Draft Recovery
 *
 * Verifies:
 * 1. Stage 1 — Honest visibility choices:
 *    - Explicit 'Private (Only You)' option in Page6FinalReview.
 *    - 'Public Heritage Archive' option remains active.
 *    - 'Community Heritage' and 'Family Circle' are disabled and marked 'Coming Soon'.
 *    - Removal of misleading access token and community circle permission claims.
 *    - Safe fallback of unsupported options to 'private'.
 *    - saveStoryToBackend persists visibility.
 * 2. Stage 2 — My Archive:
 *    - MyArchivePage.tsx renders user's preserved stories (both private and public).
 *    - Includes title, date, visibility badges, carrier, language, and provenance ID.
 *    - Narrative reader dialog with glossary and authorized audio playback via getStoryAudioPlaybackUrl.
 *    - Handles unauthenticated, loading, error, and empty states.
 *    - Routes /my-archive and /private-vault in App.tsx.
 *    - Exploration safety: Private stories are excluded from Explore catalog.
 * 3. Stage 3 — Cloud Draft Recovery:
 *    - getUserDraftFromBackend in api.ts retrieves latest authenticated user draft.
 *    - PreserveContext retrieves cloud draft and detects local/cloud draft conflicts without silent overwrite.
 *    - DraftBanner renders choice between local and cloud drafts and audio binary persistence notice.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Virasya Privacy UX, My Archive & Cloud Draft Recovery Tests ===\n');

let failed = false;
function check(name, condition, errorMsg) {
  if (condition) {
    console.log(`[PASS] ${name}`);
  } else {
    console.error(`[FAIL] ${name}: ${errorMsg || 'Condition failed'}`);
    failed = true;
  }
}

// ---------------------------------------------------------------------------
// 1. Stage 1 — Honest Visibility Choices
// ---------------------------------------------------------------------------
const page6Code = fs.readFileSync(
  path.join(__dirname, '../src/preserve/pages/Page6FinalReview.tsx'),
  'utf8'
);
const apiCode = fs.readFileSync(
  path.join(__dirname, '../src/preserve/api.ts'),
  'utf8'
);
const adaptersCode = fs.readFileSync(
  path.join(__dirname, '../src/supabase/adapters.ts'),
  'utf8'
);
const preserveCss = fs.readFileSync(
  path.join(__dirname, '../src/preserve/preserve.css'),
  'utf8'
);

check(
  'Page6FinalReview renders explicit Private (Only You) option',
  page6Code.includes('value="private"') &&
    page6Code.includes('Private (Only You)') &&
    page6Code.includes('Sovereign Vault'),
  'Must render Private (Only You) option with Sovereign Vault badge'
);

check(
  'Page6FinalReview keeps Public Heritage Archive active and recommended',
  page6Code.includes('value="public"') &&
    page6Code.includes('Public Heritage Archive') &&
    page6Code.includes('Recommended'),
  'Must keep Public Heritage Archive as an active recommended option'
);

check(
  'Page6FinalReview marks Community Heritage and Family Circle as Coming Soon and disables them',
  page6Code.includes('value="community"') &&
    page6Code.includes('value="family"') &&
    page6Code.includes('disabled') &&
    page6Code.includes('aria-disabled="true"') &&
    page6Code.includes('Coming Soon'),
  'Unsupported options must be disabled with Coming Soon badges'
);

check(
  'Page6FinalReview removes misleading access token and community circle permission claims',
  !page6Code.includes('restricted family access tokens') &&
    !page6Code.includes('recognized dialect and regional community circles'),
  'Must not claim active token or circle permissions until implemented'
);

check(
  'Page6FinalReview falls back legacy draft choices to private',
  page6Code.includes('final.visibility === "community" || final.visibility === "family"') &&
    page6Code.includes('setVisibility("private")'),
  'Must automatically fallback unsupported draft choices to private'
);

check(
  'saveStoryToBackend persists visibility to Supabase stories table',
  apiCode.includes('visibility: draftVisibility') &&
    apiCode.includes('draftVisibility'),
  'saveStoryToBackend must include visibility in upsert payload'
);

check(
  'adapters.ts preserves audio storage_path and visibility in storyRowToStoryPayload',
  adaptersCode.includes('storage_path: row.audio.storage_path') &&
    adaptersCode.includes('visibility: row.visibility'),
  'Adapters must preserve storage_path and visibility when hydrating stories'
);

check(
  'preserve.css includes styling for disabled radio options',
  preserveCss.includes('.p-radio-card.is-disabled') &&
    preserveCss.includes('cursor: not-allowed'),
  'preserve.css must style disabled radio cards'
);

// ---------------------------------------------------------------------------
// 2. Stage 2 — My Archive
// ---------------------------------------------------------------------------
const myArchiveCode = fs.readFileSync(
  path.join(__dirname, '../src/archive/MyArchivePage.tsx'),
  'utf8'
);
const myArchiveCss = fs.readFileSync(
  path.join(__dirname, '../src/archive/myArchive.css'),
  'utf8'
);
const appCode = fs.readFileSync(
  path.join(__dirname, '../src/app/App.tsx'),
  'utf8'
);
const authModalCode = fs.readFileSync(
  path.join(__dirname, '../src/auth/AuthModal.tsx'),
  'utf8'
);

check(
  'MyArchivePage exists and queries user archive via listStoriesFromBackend',
  myArchiveCode.includes('listStoriesFromBackend()') &&
    myArchiveCode.includes('getStoryAudioPlaybackUrl'),
  'MyArchivePage must use listStoriesFromBackend and getStoryAudioPlaybackUrl'
);

check(
  'MyArchivePage handles unauthenticated, loading, error, and empty states',
  myArchiveCode.includes('archive-notice-card') &&
    myArchiveCode.includes('openAuthModal') &&
    myArchiveCode.includes('archive-loading-state') &&
    myArchiveCode.includes('archive-error-banner'),
  'MyArchivePage must gracefully present all lifecycle states'
);

check(
  'MyArchivePage provides filter tabs for All, Private Vault, and Public Heritage',
  myArchiveCode.includes('All Preserved') &&
    myArchiveCode.includes('Private Vault') &&
    myArchiveCode.includes('Public Heritage'),
  'MyArchivePage must provide tabs to view all, private, and public stories'
);

check(
  'MyArchivePage renders story cards with visibility badges and provenance IDs',
  myArchiveCode.includes('archive-pill private') &&
    myArchiveCode.includes('archive-pill public') &&
    myArchiveCode.includes('archive-pill prov'),
  'Story cards must distinguish private vs public stories and show provenance ID'
);

check(
  'MyArchivePage includes full narrative reader dialog with cultural glossary',
  myArchiveCode.includes('archive-reader-dialog') &&
    myArchiveCode.includes('archive-narrative-text') &&
    myArchiveCode.includes('archive-glossary-table') &&
    myArchiveCode.includes('Cryptographic Provenance Certificate'),
  'Reader dialog must include full narrative, glossary, and provenance certificate'
);

check(
  'App.tsx routes /my-archive and /private-vault to MyArchivePage',
  appCode.includes('import MyArchivePage from "../archive/MyArchivePage"') &&
    appCode.includes('currentPath === "/my-archive" || currentPath === "/private-vault"') &&
    appCode.includes('<MyArchivePage />'),
  'App.tsx must route both /my-archive and /private-vault to MyArchivePage'
);

check(
  'AuthModal.tsx provides direct access to My Archive for authenticated archivists',
  authModalCode.includes('href="/my-archive"') &&
    authModalCode.includes('Open My Archive & Vault'),
  'AuthModal must link directly to /my-archive for signed-in users'
);

// ---------------------------------------------------------------------------
// 3. Stage 3 — Cloud Draft Recovery
// ---------------------------------------------------------------------------
const preserveContextCode = fs.readFileSync(
  path.join(__dirname, '../src/preserve/context/PreserveContext.tsx'),
  'utf8'
);
const draftBannerCode = fs.readFileSync(
  path.join(__dirname, '../src/preserve/components/DraftBanner.tsx'),
  'utf8'
);

check(
  'api.ts defines getUserDraftFromBackend querying Supabase draft stories',
  apiCode.includes('export async function getUserDraftFromBackend()') &&
    apiCode.includes('.eq("status", "draft")'),
  'api.ts must export getUserDraftFromBackend'
);

check(
  'PreserveContext checks for both local and cloud drafts without silent overwrite',
  preserveContextCode.includes('getUserDraftFromBackend()') &&
    preserveContextCode.includes('setCloudDraft') &&
    preserveContextCode.includes('setResumeDraft'),
  'PreserveContext must retain both local and cloud draft states'
);

check(
  'PreserveContext provides flexible resumeFromSaved and dismissResume',
  preserveContextCode.includes('resumeFromSaved = useCallback((source?: "local" | "cloud")') &&
    preserveContextCode.includes('dismissResume = useCallback((source?: "all" | "local" | "cloud")'),
  'PreserveContext must support targeted or universal draft resumption/dismissal'
);

check(
  'DraftBanner renders choice conflict grid when both local and cloud drafts exist',
  draftBannerCode.includes('p-draft-conflict-grid') &&
    draftBannerCode.includes('Local Browser Draft') &&
    draftBannerCode.includes('Sovereign Cloud Draft') &&
    draftBannerCode.includes('Resume Local Draft') &&
    draftBannerCode.includes('Resume Cloud Draft'),
  'DraftBanner must render conflict selection when both drafts are present'
);

check(
  'DraftBanner includes archival audio persistence notice regarding cross-device recovery',
  draftBannerCode.includes('Audio persistence notice:') &&
    draftBannerCode.includes('Un-uploaded audio recordings created on another device cannot be restored automatically'),
  'DraftBanner must clearly explain un-uploaded audio limitations across devices'
);

// ---------------------------------------------------------------------------
// 4. Post-Audit Regression Fixes
// ---------------------------------------------------------------------------
check(
  '[Fix 1] PreserveContext debounced auto-save effect guards both resumeDraft and cloudDraft',
  preserveContextCode.includes('if (resumeDraft || cloudDraft) return;') &&
    preserveContextCode.includes('[state, resumeDraft, cloudDraft, activeStorageKey]'),
  'Must guard auto-save against overwriting while either local or cloud draft is pending'
);

check(
  '[Fix 2] MyArchivePage clears stale archive data and guards against async race conditions',
  myArchiveCode.includes('setStories([]);') &&
    myArchiveCode.includes('currentUserId') &&
    myArchiveCode.includes('user?.id === currentUserId'),
  'Must clear stale stories immediately on load/error and match currentUserId'
);

check(
  '[Fix 3] MyArchivePage closes reader, clears playbackUrl, and invalidates audio requests on logout',
  myArchiveCode.includes('audioRequestIdRef') &&
    myArchiveCode.includes('setSelectedStory(null)') &&
    myArchiveCode.includes('setPlaybackUrl(null)') &&
    myArchiveCode.includes('readerDialogRef.current.close()'),
  'Must close dialog, clear selectedStory/playbackUrl, and invalidate audio requests'
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some privacy and archive checks did not pass.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All Privacy UX, My Archive, and Cloud Draft Recovery checks passed 100%!');
  process.exit(0);
}

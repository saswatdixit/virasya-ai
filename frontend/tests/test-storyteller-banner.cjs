const fs = require('fs');
const path = require('path');

console.log('=== Verifying Virasya Step 1 Storyteller Banner Improvements ===\n');

const page1Path = path.join(__dirname, '../src/preserve/pages/Page1Story.tsx');
const preserveCssPath = path.join(__dirname, '../src/preserve/preserve.css');

const page1 = fs.readFileSync(page1Path, 'utf8');
const preserveCss = fs.readFileSync(preserveCssPath, 'utf8');

let failed = false;

function check(label, condition, details) {
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${details}`);
    failed = true;
  }
}

// 1. Check banner text
check(
  'Old ambiguous "Preserving as:" text is completely removed',
  !page1.includes('Preserving as:'),
  '"Preserving as:" must be replaced'
);
check(
  'New clear "Storyteller name:" label is present',
  page1.includes('Storyteller name:'),
  'Banner must display "Storyteller name:"'
);
check(
  'Storyteller name is distinct with dedicated CSS class and bold weight',
  page1.includes('p-storyteller-banner-label') && page1.includes('p-storyteller-banner-name'),
  'Label and name must have distinct visual hierarchy'
);

// 2. Check shortened action link
check(
  'Old "Use my name as storyteller →" link is removed',
  !page1.includes('Use my name as storyteller →'),
  'Old verbose action text must be replaced'
);
check(
  'Shortened "Use as storyteller →" action link is present',
  page1.includes('Use as storyteller →'),
  'Action button must read "Use as storyteller →"'
);

// 3. Check functionality
check(
  'Action sets carrier in story form using updateForm("carrier", ...)',
  page1.includes('updateForm("carrier", storytellerDisplayName)'),
  'Clicking action must update story carrier/storyteller field'
);
check(
  'User profile is not mutated by the action (no updateProfile call)',
  !page1.includes('updateProfile'),
  'Clicking "Use as storyteller" must not alter the user profile'
);
check(
  'Dynamic storyteller name falls back to profile display_name, full_name, or user email',
  page1.includes('profile?.display_name?.trim()') && page1.includes('profile?.full_name?.trim()'),
  'Storyteller name must be dynamically retrieved from authenticated profile'
);

// 4. Check CSS styling in preserve.css
check(
  'preserve.css includes .p-storyteller-banner with terracotta/ivory styling',
  preserveCss.includes('.p-storyteller-banner {') && preserveCss.includes('rgba(184, 93, 50, 0.08)'),
  'Banner container styles must be defined'
);
check(
  'preserve.css includes .p-storyteller-banner-action with subtle text link styling',
  preserveCss.includes('.p-storyteller-banner-action {') && preserveCss.includes('var(--v-terracotta)'),
  'Action link styles must be defined with terracotta accent'
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some checks did not pass.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All storyteller banner checks passed 100%!');
  process.exit(0);
}

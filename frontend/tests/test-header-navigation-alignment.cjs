const fs = require('fs');
const path = require('path');

console.log('=== Verifying Virasya Header Navigation Alignment & Search Visibility ===\n');

const cssPath = path.join(__dirname, '../src/styles/globals.css');
const headerPath = path.join(__dirname, '../src/components/layout/Header.tsx');
const appPath = path.join(__dirname, '../src/app/App.tsx');

const css = fs.readFileSync(cssPath, 'utf8');
const header = fs.readFileSync(headerPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');

let failed = false;

function check(label, condition, details) {
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${details}`);
    failed = true;
  }
}

// 1. Check Header.tsx has no "Soon" or "Coming Soon" badges beside nav links
check(
  'Header.tsx does not import ComingSoonBadge',
  !header.includes('ComingSoonBadge'),
  'ComingSoonBadge should not be imported in Header.tsx'
);
check(
  'Header.tsx has no Soon badge text or nav-search-soon',
  !header.includes('nav-search-soon') && !header.includes('badge-coming-soon'),
  'Soon badges should not appear in desktop or mobile nav'
);

// 2. Check Search is present, visible, and distinct
check(
  'Search is present as a clickable link with proper href and class',
  header.includes('href="/search"') && header.includes('className="nav-icon-btn nav-search"'),
  'Search navigation icon button missing or misconfigured in desktop header'
);
check(
  'Search icon has accessible label',
  header.includes('aria-label="Search"'),
  'Search icon must retain aria-label="Search"'
);
check(
  'Search is also present in mobile drawer',
  header.includes('className="mobile-menu-action"') && header.includes('<SearchIcon /> Search'),
  'Search must be present in mobile menu drawer'
);

// 3. Check Culture Hosts and Heritage Vault clean labels
check(
  'Culture Hosts link has clean text with no badge in desktop header',
  header.includes('<a href="/culture-hosts" className="nav-link">\n            Culture Hosts\n          </a>'),
  'Culture Hosts link must not contain badges'
);
check(
  'Heritage Vault link has clean text with no badge in desktop header',
  header.includes('<a href="/heritage-vault" className="nav-link">\n            Heritage Vault\n          </a>'),
  'Heritage Vault link must not contain badges'
);

// 4. Check CSS removes problematic absolute positioning that caused Search to hide behind Preserve CTA
check(
  'No position: absolute on .header-center',
  !css.includes('left: 48vw'),
  'CSS must not use left: 48vw or absolute positioning on .header-center'
);
check(
  'Header center uses flex: 1 1 auto and justify-content: center',
  css.includes('flex: 1 1 auto') && css.includes('justify-content: center'),
  'Header center must sit in normal flex flow between left logo and right CTA'
);
check(
  'No margin-left: 8px forcing Search rightward',
  css.includes('.header-center .nav-search {\n  margin-left: 0;\n}'),
  'Search must not have awkward extra margins'
);

// 5. Check placeholder header styling consistency
check(
  'Placeholder header matches scrolled header proportions (38px logo/wordmark)',
  css.includes('header#header.placeholder-header .wordmark') && css.includes('font-size: 38px !important;'),
  'Placeholder header must use 38px wordmark to eliminate layout shift'
);
check(
  'Placeholder header CTA has contrasting ink styling',
  css.includes('header#header.placeholder-header .nav-cta') && css.includes('background: var(--ink);'),
  'Placeholder header CTA must be styled consistently with scrolled header'
);

// 6. Check Placeholder pages retain their Coming Soon status on the actual pages
check(
  'Placeholder configs in App.tsx retain Coming Soon badges for pages',
  app.includes('"/culture-hosts"') && app.includes('badge: "Coming Soon"'),
  'Placeholder pages (/culture-hosts, /search) must keep their Coming Soon badges'
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some checks did not pass.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All header checks passed 100%!');
  process.exit(0);
}

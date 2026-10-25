/**
 * Test Suite: Footer Navigation, Clean Links & Redirection Integrity
 *
 * Verifies that:
 * 1. Lander home page footer links redirect to exact targets:
 *    - /explore (Explore stories)
 *    - /culture-hosts (Culture hosts page)
 *    - /private-vault (Private vault page)
 *    - #faq (Good questions section)
 * 2. "Soon" badges and ComingSoonBadge are completely removed from Closing.tsx.
 * 3. At the extreme bottom of the lander home page:
 *    - "About this preview" button/redirect is completely removed.
 *    - "Pause motion" button/redirect is completely removed.
 *    - Clean "BACK TO TOP ↑" link remains intact.
 * 4. App.tsx provides client-side SPA navigation interception for seamless internal redirects.
 * 5. main.js safely handles motion-button without null reference exceptions.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Verifying Virasya Lander Footer Navigation & Clean Links ===\n');

const closingPath = path.join(__dirname, '../src/sections/Closing/Closing.tsx');
const appPath = path.join(__dirname, '../src/app/App.tsx');
const mainJsPath = path.join(__dirname, '../src/three/main.js');

const closing = fs.readFileSync(closingPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const mainJs = fs.readFileSync(mainJsPath, 'utf8');

let failed = false;

function check(label, condition, details) {
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${details}`);
    failed = true;
  }
}

// 1. Explore, Culture Hosts, and Private Vault navigation targets & explicit handlers
check(
  'Closing.tsx contains redirect link to /explore',
  closing.includes('href="/explore"') && closing.includes('Explore'),
  'Explore link must point to /explore'
);

check(
  'Closing.tsx contains redirect link to /culture-hosts',
  closing.includes('href="/culture-hosts"') && closing.includes('Culture Hosts'),
  'Culture Hosts link must point to /culture-hosts'
);

check(
  'Closing.tsx contains redirect link to /heritage-vault',
  closing.includes('href="/heritage-vault"') && closing.includes('Heritage Vault'),
  'Heritage Vault link must point to /heritage-vault'
);

check(
  'Closing.tsx contains redirect link to #faq',
  closing.includes('href="#faq"') && closing.includes('Good questions'),
  'Good questions link must point to #faq'
);

check(
  'Closing.tsx provides explicit navigateTo handler for SPA redirects',
  closing.includes('navigateTo(e, "/explore")') &&
  closing.includes('navigateTo(e, "/culture-hosts")') &&
  closing.includes('navigateTo(e, "/heritage-vault")'),
  'Closing.tsx must invoke navigateTo on click for instant SPA transition'
);

// 2. Removal of "Soon" badges
check(
  'Closing.tsx does not import ComingSoonBadge',
  !closing.includes('ComingSoonBadge'),
  'ComingSoonBadge import must be removed from Closing.tsx'
);

check(
  'Closing.tsx has no Soon badge text',
  !closing.includes('• SOON') && !closing.includes('text="Soon"'),
  'Soon text and badges must be removed from footer links'
);

// 3. Removal of "About this preview" and "Pause motion"
check(
  'Closing.tsx does not contain "About this preview"',
  !closing.includes('About this preview') && !closing.includes('privacy-button'),
  'About this preview button must be completely removed'
);

check(
  'Closing.tsx does not contain "Pause motion"',
  !closing.includes('Pause motion') && !closing.includes('motion-button'),
  'Pause motion button must be completely removed'
);

check(
  'Closing.tsx retains BACK TO TOP link',
  closing.includes('BACK TO TOP ↑'),
  'BACK TO TOP link must remain in footer baseline'
);

// 4. Stacking context & hover underline in globals.css
const cssPath = path.join(__dirname, '../src/styles/globals.css');
const css = fs.readFileSync(cssPath, 'utf8');

check(
  'globals.css elevates footer-top z-index above footer-brand to prevent click interception',
  css.includes('.footer-top {') &&
  css.includes('z-index: 50') &&
  css.includes('.footer-brand {') &&
  css.includes('z-index: 1'),
  'footer-top must have higher stacking context than footer-brand'
);

check(
  'globals.css enforces underline on hover for all footer links with pointer-events: auto',
  css.includes('text-decoration: underline') &&
  css.includes('text-underline-offset: 5px') &&
  css.includes('pointer-events: auto'),
  'Hover underline must apply across all footer navigation links'
);

// 4. App.tsx SPA Link Click Navigation Handler
check(
  'App.tsx contains universal internal SPA link navigation handler',
  app.includes('handleLinkClick') &&
  app.includes('targetUrl.origin === window.location.origin') &&
  app.includes('window.history.pushState'),
  'App.tsx must intercept internal link clicks for seamless SPA redirects'
);

// 5. main.js null safety for motion-button
check(
  'main.js safely guards motion-button checks',
  mainJs.includes('$("#motion-button")?.addEventListener') &&
  mainJs.includes('const motionBtn = $("#motion-button");'),
  'main.js must not throw when #motion-button is absent from DOM'
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Footer navigation checks did not pass.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All footer navigation checks passed 100%!');
  process.exit(0);
}

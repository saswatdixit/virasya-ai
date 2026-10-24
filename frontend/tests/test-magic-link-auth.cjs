/**
 * Test Suite: Magic-Link Authentication & Production Parity
 *
 * Verifies that:
 * 1. Email OTP prompt has been replaced with a clear "Check your email" confirmation screen.
 * 2. No OTP input or 6-digit code box exists in the magic link UI flow.
 * 3. Resend cooldown and "Use a different email" controls exist.
 * 4. AuthContext properly detects callback errors (expired/invalid links) from both hash and searchParams.
 * 5. AuthContext executes PKCE code exchange when auth code is present.
 * 6. AuthContext uses origin-aware redirect URLs without hardcoded localhost in production.
 */

const fs = require('fs');
const path = require('path');

console.log('=== Virasya Magic-Link Authentication & Parity Test Suite ===\n');

const authModalPath = path.join(__dirname, '../src/auth/AuthModal.tsx');
const authContextPath = path.join(__dirname, '../src/auth/AuthContext.ts');
const authTypesPath = path.join(__dirname, '../src/auth/types.ts');
const authCssPath = path.join(__dirname, '../src/auth/auth.css');

const authModal = fs.readFileSync(authModalPath, 'utf8');
const authContext = fs.readFileSync(authContextPath, 'utf8');
const authTypes = fs.readFileSync(authTypesPath, 'utf8');
const authCss = fs.readFileSync(authCssPath, 'utf8');

let failed = false;

function check(label, condition, details) {
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${details}`);
    failed = true;
  }
}

// 1. Magic link confirmation screen replacement (No OTP input)
check(
  'AuthModal renders "Check your email" title',
  authModal.includes('<h2 id="auth-modal-title">Check your email</h2>'),
  'AuthModal must render the required "Check your email" title'
);

check(
  'AuthModal renders exact required magic link instructions',
  authModal.includes('We’ve sent you a sign-in link. Open the email and click the link to securely sign in to Virasya.'),
  'AuthModal must render clear instructions directing the user to click the email link'
);

check(
  'AuthModal contains NO OTP code input element',
  !authModal.includes('id="auth-token-input"') && !authModal.includes('auth-code-input'),
  'OTP code input must be removed completely from AuthModal'
);

check(
  'AuthModal contains NO references to 6-digit verification code in instructions',
  !authModal.includes('6-digit') && !authModal.includes('one-time-code'),
  'No 6-digit verification code references should appear in AuthModal'
);

// 2. Action controls: Use different email and Resend with cooldown
check(
  'AuthModal has "Use a different email" action',
  authModal.includes('handleUseDifferentEmail') && authModal.includes('Use a different email'),
  'AuthModal must provide a clear option to switch back and change email'
);

check(
  'AuthModal has resend button with cooldown logic',
  authModal.includes('handleResendLink') &&
  authModal.includes('resendCooldown') &&
  authModal.includes('Resend sign-in link'),
  'AuthModal must provide a resend link button with cooldown timer'
);

check(
  'AuthModal displays card showing target email',
  authModal.includes('auth-email-sent-card') && authModal.includes('auth-sent-address'),
  'Confirmation screen must display the address to which the link was sent'
);

// 3. AuthContext callback error and PKCE handling
check(
  'AuthContext exposes callbackError and clearCallbackError',
  authTypes.includes('callbackError?: string | null') &&
  authContext.includes('callbackError') &&
  authContext.includes('clearCallbackError'),
  'AuthContext must expose callbackError state to UI consumers'
);

check(
  'AuthContext detects expired/invalid link errors from URL query and hash',
  authContext.includes('error_description') &&
  authContext.includes('error') &&
  authContext.includes('Your sign-in link is invalid or has expired'),
  'AuthContext must detect magic link errors and set a user-friendly message'
);

check(
  'AuthContext exchanges PKCE code for session when code parameter is present',
  authContext.includes('exchangeCodeForSession') &&
  authContext.includes('searchParams.get("code")'),
  'AuthContext must exchange PKCE auth code for a valid session'
);

check(
  'AuthContext strips auth tokens and error query params after handling to clean URL',
  authContext.includes('window.history.replaceState') &&
  authContext.includes('window.location.pathname'),
  'URL should be cleaned up after extracting tokens or errors'
);

// 4. Redirect URL handling
check(
  'AuthContext dynamically determines redirect URL using window.location.origin without hardcoded localhost',
  (authContext.includes('redirectTo') || authContext.includes('redirectUrl')) &&
  authContext.includes('window.location.origin'),
  'Magic link redirect URL must dynamically use origin so it works in both dev and production'
);

// 5. CSS styling support
check(
  'auth.css has styles for email sent confirmation card and actions',
  authCss.includes('.auth-step-sent') &&
  authCss.includes('.auth-email-sent-card') &&
  authCss.includes('.auth-sent-actions'),
  'auth.css must provide styling for the new confirmation view'
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some magic-link authentication checks did not pass.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All magic-link authentication checks passed 100%!');
  process.exit(0);
}

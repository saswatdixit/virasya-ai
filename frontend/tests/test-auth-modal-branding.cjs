const fs = require('fs');
const path = require('path');

console.log('=== Verifying Virasya Authentication Modal Branding & Layout ===\n');

const authModalPath = path.join(__dirname, '../src/auth/AuthModal.tsx');
const authCssPath = path.join(__dirname, '../src/auth/auth.css');

const authModal = fs.readFileSync(authModalPath, 'utf8');
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

// 1. Check old Otto logo removal
check(
  'AuthModal.tsx has no dialog-mark or mark element',
  !authModal.includes('dialog-mark') && !authModal.includes('className="mark'),
  'The old Otto clover logo must be completely removed from AuthModal'
);
check(
  'AuthModal.tsx has no orphaned <i> tags from the 4-leaf clover mark',
  !authModal.includes('<i></i>'),
  'Four <i> tags from the Otto mark must not remain'
);

// 2. Check layout is pulled upward
check(
  'auth.css has reduced top padding (30px vs old 42px)',
  authCss.includes('padding: 30px 34px 32px'),
  'Top padding should be reduced to bring text upward'
);
check(
  'auth.css heading margin-top is eliminated (starts immediately below eyebrow)',
  authCss.includes('margin: 0 0 8px 0'),
  'Heading margin should be tight and balanced'
);

// 3. Check Virasya heritage visual identity
check(
  'auth.css uses Virasya burnt terracotta for eyebrow',
  authCss.includes('color: var(--burnt)'),
  'Eyebrow must use Virasya terracotta'
);
check(
  'auth.css uses warm backdrop overlay instead of old Otto green (#142722a8)',
  !authCss.includes('#142722a8') && authCss.includes('rgba(48, 34, 29, 0.65)'),
  'Backdrop should match Virasya walnut overlay'
);
check(
  'auth.css uses clean charcoal-brown text color (#6d625b) instead of Otto green (#556255)',
  !authCss.includes('#556255') && authCss.includes('#6d625b'),
  'Body text must use warm charcoal-brown'
);

// 4. Check all authentication functionality preserved
check(
  'Email magic link request form preserved with email input and submit button',
  authModal.includes('id="auth-email-input"') && authModal.includes('type="email"') && authModal.includes('handleSendOtp'),
  'Email magic link input and flow must be preserved'
);
check(
  'Magic link confirmation screen properly replaces OTP code input',
  authModal.includes('Check your email') &&
  authModal.includes('Use a different email') &&
  authModal.includes('Resend sign-in link') &&
  !authModal.includes('id="auth-token-input"') &&
  !authModal.includes('auth-code-input'),
  'OTP code input must be removed and replaced with clear email confirmation screen'
);
check(
  'Connected archivist profile management preserved with display name editing and sign out',
  authModal.includes('handleUpdateDisplayName') && authModal.includes('handleSignOut') && authModal.includes('id="auth-display-name"'),
  'Account management and profile name flow must be preserved'
);
check(
  'Guest mode dismissal preserved',
  authModal.includes('Continue as Guest') && authModal.includes('closeAuthModal'),
  'Guest mode dismiss buttons must be preserved'
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some checks did not pass.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All authentication modal branding checks passed 100%!');
  process.exit(0);
}

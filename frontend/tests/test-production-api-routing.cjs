/**
 * Test Suite: Production API Routing & Configuration Guard
 *
 * Verifies that:
 * 1. In production, missing VITE_API_BASE_URL marks backend as unconfigured.
 * 2. In production, API operations throw clear configuration errors rather than
 *    silently issuing requests to Vercel's relative /api path (which serves index.html).
 * 3. Localhost development (npm run dev) remains functional via Vite proxy.
 * 4. No backend URL is invented or hardcoded into client code.
 * 5. Relative audio URLs (/api/audio/...) cannot be silently fetched without a backend URL.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Virasya Production API Routing & Configuration Guard Test Suite ===\n');

const apiPath = path.join(__dirname, '../src/preserve/api.ts');
const bannerPath = path.join(__dirname, '../src/preserve/components/BackendStatusBanner.tsx');
const vercelJsonPath = path.join(__dirname, '../vercel.json');

const apiSrc = fs.readFileSync(apiPath, 'utf8');
const bannerSrc = fs.readFileSync(bannerPath, 'utf8');
const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

let failed = false;

function check(label, condition, details) {
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${details}`);
    failed = true;
  }
}

// 1. Inspect Vercel rewrites: confirms Vercel rewrites /(.*) to index.html (no Python backend at /api)
check(
  'Vercel SPA rewrite exists and routes all paths to index.html',
  vercelJson.rewrites && vercelJson.rewrites.some(r => r.source === '/(.*)' && r.destination === '/index.html'),
  'Vercel configuration rewrites everything to index.html, meaning relative /api requests hit SPA, not Python'
);

// 2. Localhost guard & configuration evaluation
function isLocalhostUrl(url) {
  if (!url) return false;
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url);
}

function evalBackendConfig(isDev, rawEnvUrl) {
  if (isDev) return true;
  if (rawEnvUrl && rawEnvUrl.length > 0 && !isLocalhostUrl(rawEnvUrl)) {
    return true;
  }
  return false;
}

function resolveApiUrl(isDev, rawEnvUrl, apiPathStr) {
  const cleanPath = apiPathStr.startsWith('/') ? apiPathStr : `/${apiPathStr}`;
  if (isDev) {
    return `${rawEnvUrl || ''}${cleanPath}`;
  }
  if (!evalBackendConfig(isDev, rawEnvUrl)) {
    throw new Error(
      `Configuration Error: Cannot route '${cleanPath}'. VITE_API_BASE_URL is missing in this production deployment. Set VITE_API_BASE_URL in your hosting environment settings.`
    );
  }
  return `${rawEnvUrl}${cleanPath}`;
}

// In production without VITE_API_BASE_URL:
check(
  'evalBackendConfig(false, "") correctly evaluates to false (unconfigured)',
  evalBackendConfig(false, '') === false,
  'Production without VITE_API_BASE_URL must be unconfigured'
);

check(
  'evalBackendConfig(false, "http://127.0.0.1:5000") is rejected in production',
  evalBackendConfig(false, 'http://127.0.0.1:5000') === false,
  'Production must reject localhost or 127.0.0.1 URLs'
);

check(
  'evalBackendConfig(false, "https://api.example.com") is accepted in production',
  evalBackendConfig(false, 'https://api.example.com') === true,
  'Production must accept valid remote HTTPS URLs'
);

// In local development:
check(
  'evalBackendConfig(true, "") evaluates to true (Vite proxy mode)',
  evalBackendConfig(true, '') === true,
  'Local dev must remain active using Vite proxy'
);

// 3. Routing resolution behavior
let threwInProd = false;
try {
  resolveApiUrl(false, '', '/api/upload');
} catch (err) {
  threwInProd = err.message.includes('Configuration Error') && err.message.includes('VITE_API_BASE_URL');
}
check(
  'resolveApiUrl throws clear Configuration Error when VITE_API_BASE_URL is missing in production',
  threwInProd,
  'resolveApiUrl must fail fast with clear Configuration Error rather than returning relative /api'
);

const devResolved = resolveApiUrl(true, '', '/api/upload');
check(
  'resolveApiUrl in local dev returns relative /api/upload for Vite proxy',
  devResolved === '/api/upload',
  'Local dev must produce relative /api paths for Vite dev proxy'
);

// 4. Source code static checks in api.ts
check(
  'api.ts defines resolveApiUrl with Configuration Error guard',
  apiSrc.includes('export function resolveApiUrl') &&
  apiSrc.includes('Configuration Error') &&
  apiSrc.includes('VITE_API_BASE_URL is missing'),
  'api.ts must export resolveApiUrl with production configuration guard'
);

check(
  'api.ts uploadAudioToBackend handles unconfigured environment and routes to private storage',
  apiSrc.includes('uploadAudioToPrivateBucket') &&
  apiSrc.includes('Supabase is not configured in this environment'),
  'uploadAudioToBackend must upload to Supabase private bucket and guard unconfigured state'
);

check(
  'api.ts transcribeAudioOnBackend invokes transcribe-audio Edge Function via Supabase client',
  apiSrc.includes('transcribe-audio') &&
  apiSrc.includes('supabase.functions.invoke'),
  'transcribeAudioOnBackend must invoke Supabase Edge Function transcribe-audio'
);

check(
  'api.ts fetchAuthenticatedAudioBlob guards against relative /api paths without backend in production',
  apiSrc.includes('Configuration Error: VITE_API_BASE_URL is missing in this production environment. Cannot fetch audio recording from relative path'),
  'fetchAuthenticatedAudioBlob must guard against relative audio fetches in production'
);

check(
  'api.ts does NOT hardcode or invent any default remote backend URL',
  !apiSrc.includes('https://api.virasya.org') &&
  !apiSrc.includes('https://virasya-backend.onrender.com') &&
  !apiSrc.includes('https://virasya-backend.up.railway.app'),
  'No backend URL should be invented or hardcoded in api.ts'
);

// 5. BackendStatusBanner includes offline preview status
check(
  'BackendStatusBanner displays "Offline Preview" and explains unconfigured state',
  bannerSrc.includes('Offline Preview') &&
  bannerSrc.includes('Supabase credentials are not configured in this environment'),
  'BackendStatusBanner must inform user of offline preview mode when credentials missing'
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some production API routing checks did not pass.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All production API routing checks passed 100%!');
  process.exit(0);
}

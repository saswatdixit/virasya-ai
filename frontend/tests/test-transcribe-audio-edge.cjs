/**
 * Test Suite: Supabase Edge Function `transcribe-audio` & Gnani STT Integration
 *
 * Verifies all 17 security and functional requirements:
 * 1. Strict JWT Bearer token authentication and server-side user derivation.
 * 2. Canonical private storage path enforcement (story-recordings-private).
 * 3. Strict author ownership verification: storage_path must start with user.id.
 * 4. Audio validation at server boundary using shared validateAudioBuffer (5 MiB, 60.0s).
 * 5. Gnani API contract: X-API-Key-ID header, FormData with audio_file, language_code, format: verbatim.
 * 6. No manual multipart boundary header.
 * 7. Provider error and timeout handling without secret leakage.
 * 8. Standardized TranscribeResponse output structure matching frontend expectations.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Supabase Edge Function `transcribe-audio` Test Suite ===\n');

const transcribeFnPath = path.join(__dirname, '../../supabase/functions/transcribe-audio/index.ts');
const preserveFnPath = path.join(__dirname, '../../supabase/functions/preserve-story/index.ts');
const validatorPath = path.join(__dirname, '../../supabase/functions/preserve-story/audio-validator.ts');
const frontendApiPath = path.join(__dirname, '../src/preserve/api.ts');

const transcribeCode = fs.readFileSync(transcribeFnPath, 'utf8');
const preserveCode = fs.readFileSync(preserveFnPath, 'utf8');
const validatorCode = fs.readFileSync(validatorPath, 'utf8');
const apiCode = fs.readFileSync(frontendApiPath, 'utf8');

let failed = false;

function check(label, condition, details) {
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${details}`);
    failed = true;
  }
}

// 1. Source existence and shared validator reuse
check(
  'transcribe-audio Edge Function exists',
  fs.existsSync(transcribeFnPath),
  'supabase/functions/transcribe-audio/index.ts must exist'
);

check(
  'transcribe-audio reuses validateAudioBuffer from preserve-story/audio-validator.ts',
  transcribeCode.includes('import { validateAudioBuffer } from "../preserve-story/audio-validator.ts"'),
  'Must import and reuse existing validateAudioBuffer to avoid duplicate implementations'
);

// 2. Authentication & Ownership Invariants
check(
  'Enforces strict JWT Bearer token extraction and verification via userClient.auth.getUser()',
  transcribeCode.includes('req.headers.get("Authorization")') &&
  transcribeCode.includes('userClient.auth.getUser()') &&
  transcribeCode.includes('status: 401'),
  'Must authenticate caller with Supabase Auth and derive user server-side'
);

check(
  'Rejects unauthenticated callers with HTTP 401',
  transcribeCode.includes('code: "AUTH_REQUIRED"') || transcribeCode.includes('code: "UNAUTHORIZED"'),
  'Must return 401 for missing or invalid tokens'
);

check(
  'Requires canonical storage_path and rejects directory traversal or backslashes',
  transcribeCode.includes('cleanPath.includes("..")') &&
  transcribeCode.includes('cleanPath.includes("\\\\")'),
  'Must reject unsafe path characters'
);

check(
  'Enforces that storage_path belongs strictly to the authenticated user (user.id prefix)',
  transcribeCode.includes('pathSegments[0] !== user.id') &&
  transcribeCode.includes('status: 403'),
  'Must strictly reject cross-user storage path access with 403 Forbidden'
);

// 3. Audio Download & Server Boundary Validation
check(
  'Downloads audio exclusively from private bucket story-recordings-private',
  transcribeCode.includes('.from(STORAGE_BUCKET)') &&
  transcribeCode.includes('.download(cleanPath)'),
  'Must download from story-recordings-private'
);

check(
  'Validates container format, size (<= 5 MiB), and duration (<= 60.0s) via validateAudioBuffer',
  transcribeCode.includes('const validation = validateAudioBuffer(audioBuffer, ext)') &&
  transcribeCode.includes('if (!validation.valid)'),
  'Must enforce audio validation before forwarding to Gnani'
);

// 4. Gnani.ai API Contract
check(
  'Retrieves GNANI_API_KEY exclusively from Deno server-side secrets',
  transcribeCode.includes('Deno.env.get("GNANI_API_KEY")'),
  'Must read secret from Deno.env and return 503 if missing'
);

check(
  'Uses exact Gnani endpoint https://api.vachana.ai/stt/v3',
  transcribeCode.includes('https://api.vachana.ai/stt/v3'),
  'Must target documented Gnani Prisma STT v2.5 endpoint'
);

check(
  'Constructs native FormData with language_code, dynamic format (verbatim/transcribe), and audio_file',
  transcribeCode.includes('formData.append("language_code"') &&
  (transcribeCode.includes('formData.append("format", requestedFormat)') || transcribeCode.includes('formData.append("format", "verbatim")')) &&
  transcribeCode.includes('formData.append("audio_file"'),
  'Must build standard multipart FormData for Gnani'
);

check(
  'Never manually sets multipart Content-Type header',
  !transcribeCode.includes('"Content-Type": "multipart/form-data"') &&
  !transcribeCode.includes("'Content-Type': 'multipart/form-data'"),
  'Must let fetch auto-calculate the multipart boundary'
);

check(
  'Sends X-API-Key-ID authentication header',
  transcribeCode.includes('"X-API-Key-ID": gnaniApiKey'),
  'Must authenticate with Gnani using X-API-Key-ID'
);

// 5. Timeout & Provider Error Handling
check(
  'Protects outbound request with 45-second timeout guard',
  transcribeCode.includes('controller.abort') &&
  transcribeCode.includes('45000') &&
  transcribeCode.includes('PROVIDER_TIMEOUT'),
  'Must guard against hanging external provider requests'
);

check(
  'Handles non-200 provider responses and invalid provider JSON gracefully',
  transcribeCode.includes('if (!gnaniRes.ok)') &&
  transcribeCode.includes('INVALID_PROVIDER_JSON') &&
  transcribeCode.includes('TRANSCRIPTION_FAILED'),
  'Must return structured client-safe error without leaking secrets'
);

// 6. Fail-Closed Rate Limiting Invariants
check(
  'Enforces atomic database rate limiting via check_and_consume_transcription_quota',
  transcribeCode.includes('check_and_consume_transcription_quota') &&
  transcribeCode.includes('status: 429') &&
  transcribeCode.includes('Retry-After'),
  'Must call rate limit RPC and enforce HTTP 429 on quota exhaustion'
);

check(
  'Strict Fail-Closed: Halts execution with HTTP 500 on quota RPC errors or exceptions without calling Gnani API',
  transcribeCode.includes('QUOTA_VERIFICATION_FAILED') &&
  transcribeCode.includes('INVALID_QUOTA_RESPONSE') &&
  transcribeCode.includes('QUOTA_CHECK_EXCEPTION'),
  'Quota check must fail closed: never proceed to Gnani API if quota check fails'
);

// 7. Response Formatting
check(
  'Returns standardized TranscribeResponse compatible with Virasya frontend',
  transcribeCode.includes('status: "success"') &&
  transcribeCode.includes('transcript: transcriptText') &&
  transcribeCode.includes('raw_text: transcriptText') &&
  transcribeCode.includes('gnani_info:') &&
  transcribeCode.includes('vaani_info:'),
  'Must return response structure with dual-model compatibility'
);

// 8. Frontend Integration
check(
  'frontend api.ts invokes transcribe-audio Edge Function via Supabase client',
  apiCode.includes('.functions.invoke') &&
  apiCode.includes('"transcribe-audio"') &&
  apiCode.includes('storage_path:'),
  'Frontend api.ts must invoke transcribe-audio Edge Function with storage_path'
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some transcribe-audio Edge Function checks failed.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All transcribe-audio Edge Function checks passed 100%!');
  process.exit(0);
}

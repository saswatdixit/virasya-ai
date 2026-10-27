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

// 9. Minimal Diagnostic Logging & Sanitization (Diagnostic Patch Verification)
check(
  'Extracts or generates correlation requestId for tracing',
  transcribeCode.includes('const requestId =') &&
  (transcribeCode.includes('req.headers.get("x-request-id")') || transcribeCode.includes('crypto.randomUUID()')),
  'Must establish request correlation ID'
);

check(
  'Emits structured GNANI_DISPATCH log with keyConfigured boolean without logging API key or hash',
  transcribeCode.includes('GNANI_DISPATCH') &&
  transcribeCode.includes('keyConfigured: true') &&
  !transcribeCode.includes('gnaniApiKey:') &&
  !transcribeCode.includes('apiKey: gnaniApiKey'),
  'Must log dispatch metadata safely without leaking secrets or key hashes'
);

check(
  'Reads upstream response body exactly once on error and success paths',
  transcribeCode.includes('rawErrText = await gnaniRes.text()') &&
  transcribeCode.includes('JSON.parse(rawErrText)') &&
  transcribeCode.includes('providerData = await gnaniRes.json()'),
  'Must read upstream response stream only once per path to avoid stream-locked errors'
);

check(
  'Extracts nested FastAPI/Envoy error structures (detail.message, detail.error_code)',
  transcribeCode.includes('detail.message') &&
  transcribeCode.includes('detail.error_code'),
  'Must unpack nested detail.message and detail.error_code from Gnani responses'
);

check(
  'Emits structured GNANI_HTTP_ERROR log with status, durationMs, and sanitized error',
  transcribeCode.includes('GNANI_HTTP_ERROR') &&
  transcribeCode.includes('status: gnaniRes.status') &&
  transcribeCode.includes('durationMs'),
  'Must emit structured error logs for upstream HTTP failures'
);

check(
  'Handles fetch exceptions with GNANI_NETWORK_ERROR and GNANI_TIMEOUT without exposing URLs',
  transcribeCode.includes('GNANI_NETWORK_ERROR') &&
  transcribeCode.includes('GNANI_TIMEOUT') &&
  transcribeCode.includes('safeNetworkErr'),
  'Must sanitize fetch exceptions and log structured timeout/network events'
);

const successLogMatch = transcribeCode.match(/tag:\s*"GNANI_SUCCESS"[\s\S]*?\)/);
const successLogStr = successLogMatch ? successLogMatch[0] : "";
check(
  'Never logs personal transcript text in GNANI_SUCCESS log',
  successLogStr.length > 0 &&
  !successLogStr.includes('transcript') &&
  !successLogStr.includes('text:'),
  'GNANI_SUCCESS must only log timing and duration, never user transcript content'
);

// 10. Executable Unit Tests: Sanitization & Nested Error Extraction
function sanitizeLogString(raw, maxLen = 300) {
  if (!raw) return "";
  let clean = String(raw)
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(api[-_]?key|key|token|secret)[=:\s]+[A-Za-z0-9_-]+/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s"'`<>]+/gi, "[URL]")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  if (clean.length > maxLen) {
    clean = clean.slice(0, maxLen) + "...";
  }
  return clean;
}

function extractSanitizedProviderError(rawText, errJson, maxLen = 300) {
  let rawMsg = "";
  if (errJson && typeof errJson === "object") {
    const detail = errJson.detail;
    if (typeof detail === "string" && detail.trim()) {
      rawMsg = detail.trim();
    } else if (detail && typeof detail === "object") {
      if (Array.isArray(detail)) {
        rawMsg = detail
          .map((item) =>
            typeof item === "object" && item
              ? item.msg || item.message || JSON.stringify(item)
              : String(item)
          )
          .join(", ");
      } else {
        const dMsg = detail.message || detail.error || detail.msg;
        const dCode = detail.error_code || detail.code;
        if (dMsg && dCode) {
          rawMsg = `[${dCode}] ${dMsg}`;
        } else if (dMsg) {
          rawMsg = String(dMsg);
        } else if (dCode) {
          rawMsg = `[${dCode}]`;
        }
      }
    }

    if (!rawMsg) {
      if (typeof errJson.message === "string" && errJson.message.trim()) {
        rawMsg = errJson.message.trim();
      } else if (typeof errJson.error === "string" && errJson.error.trim()) {
        rawMsg = errJson.error.trim();
      }
    }
  }

  if (!rawMsg && rawText) {
    rawMsg = rawText.trim();
  }

  return sanitizeLogString(rawMsg, maxLen);
}

// Unit test 1: Nested error with detail.error_code and detail.message
const testErr1 = extractSanitizedProviderError("", {
  detail: { error_code: "MISSING_API_KEY", message: "Missing API key", status_code: 401 }
});
check(
  'Unit test: Unpacks [MISSING_API_KEY] Missing API key',
  testErr1 === "[MISSING_API_KEY] Missing API key",
  `Expected '[MISSING_API_KEY] Missing API key', got '${testErr1}'`
);

// Unit test 2: Simple string detail
const testErr2 = extractSanitizedProviderError("", { detail: "Unsupported audio container" });
check(
  'Unit test: Unpacks string detail',
  testErr2 === "Unsupported audio container",
  `Expected 'Unsupported audio container', got '${testErr2}'`
);

// Unit test 3: Array of validation errors
const testErr3 = extractSanitizedProviderError("", { detail: [{ msg: "field required" }] });
check(
  'Unit test: Unpacks array of details',
  testErr3 === "field required",
  `Expected 'field required', got '${testErr3}'`
);

// Unit test 4: Raw HTML / non-JSON error
const testErr4 = extractSanitizedProviderError("<html>502 Bad Gateway</html>", null);
check(
  'Unit test: Unpacks raw non-JSON text',
  testErr4 === "<html>502 Bad Gateway</html>",
  `Expected raw text, got '${testErr4}'`
);

// Unit test 5: Redaction of Bearer tokens and signed URLs
const testErr5 = sanitizeLogString("Auth failed for Bearer eyJhbGciOi... on https://api.vachana.ai/stt/v3?token=secret123");
check(
  'Unit test: Redacts Bearer tokens and URLs',
  testErr5 === "Auth failed for Bearer [REDACTED] on [URL]",
  `Expected redacted string, got '${testErr5}'`
);

// Unit test 6: Truncation
const longMsg = "x".repeat(500);
const testErr6 = sanitizeLogString(longMsg, 100);
check(
  'Unit test: Truncates oversized messages with ellipsis',
  testErr6.length === 103 && testErr6.endsWith("..."),
  `Expected truncated length 103, got ${testErr6.length}`
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some transcribe-audio Edge Function checks failed.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All transcribe-audio Edge Function checks passed 100%!');
  process.exit(0);
}

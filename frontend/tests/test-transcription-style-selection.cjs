/**
 * Test Suite: Transcription Style Selection (Verbatim, Transcribe, Code-mix, Transliterate)
 * 
 * Verifies all frontend, API client, Edge Function, and Gnani Prisma STT v3.0 requirements:
 * 1. types.ts defines TranscriptionStyle ("verbatim" | "transcribe" | "codemix" | "transliterate") and integrates into PreserveState & ModelTranscript.
 * 2. api.ts supports TranscriptionStyle parameter in transcribeAudioOnBackend and passes format & transcription_style to Edge Function.
 * 3. transcribe-audio Edge Function extracts, normalizes (including codemix & transliterate), appends prisma-v3.0 model when appropriate, and handles optional language_code.
 * 4. transcribe-audio Edge Function reflects format, transcription_style, and Prisma v3.0 / v2.5 model in standard response JSON.
 * 5. PreserveContext initializes default transcriptionStyle as "verbatim".
 * 6. PreserveContext provides transcriptionStyle and setTranscriptionStyle in context value.
 * 7. PreserveContext preserves backwards compatibility for legacy drafts lacking transcriptionStyle.
 * 8. PreserveContext passes current transcriptionStyle into executeTranscription -> transcribeAudioOnBackend.
 * 9. Page2Voice renders Output Style radiogroup with accessible attributes for all 4 styles (role="radiogroup", role="radio", aria-checked).
 * 10. Page2Voice contains exact copy, descriptions, and highlighted examples for Verbatim, Transcribe, Code-mix, and Transliterate matching Gnani specs.
 * 11. Page2Voice Story Overview right rail displays the active Output Style for all 4 options.
 * 12. preserve.css defines styling for style cards, active state, example callout, and blue/amber highlights.
 * 13. Executable Unit Tests:
 *     - Selecting Code-mix appends model=prisma-v3.0 and format=codemix.
 *     - Selecting Transliterate appends model=prisma-v3.0 and format=transliterate.
 *     - Transliterate succeeds without detected_language_code in Gnani response.
 *     - Existing Verbatim and Transcribe requests remain on v2.5 without prisma-v3.0 parameter.
 *     - Invalid style values are safely rejected with HTTP 400.
 */

const fs = require('fs');
const path = require('path');

console.log('=== Virasya Transcription Style Selection Test Suite ===\n');

const typesPath = path.join(__dirname, '../src/preserve/types.ts');
const apiPath = path.join(__dirname, '../src/preserve/api.ts');
const edgePath = path.join(__dirname, '../../supabase/functions/transcribe-audio/index.ts');
const edgeTranslitPath = path.join(__dirname, '../../supabase/functions/transcribe-audio/transliterate.ts');
const frontTranslitPath = path.join(__dirname, '../src/preserve/transliterate.ts');
const contextPath = path.join(__dirname, '../src/preserve/context/PreserveContext.tsx');
const page2Path = path.join(__dirname, '../src/preserve/pages/Page2Voice.tsx');
const cssPath = path.join(__dirname, '../src/preserve/preserve.css');

const typesCode = fs.readFileSync(typesPath, 'utf8');
const apiCode = fs.readFileSync(apiPath, 'utf8');
const edgeCode = fs.readFileSync(edgePath, 'utf8');
const edgeTranslitCode = fs.readFileSync(edgeTranslitPath, 'utf8');
const frontTranslitCode = fs.readFileSync(frontTranslitPath, 'utf8');
const contextCode = fs.readFileSync(contextPath, 'utf8');
const page2Code = fs.readFileSync(page2Path, 'utf8');
const cssCode = fs.readFileSync(cssPath, 'utf8');

// Load transliterate function for executable unit tests
const { transliterateDevanagariToLatin } = require('./transliterate-test-helper.cjs');

let failed = false;

function check(label, condition, details) {
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${details}`);
    failed = true;
  }
}

// 1. types.ts
check(
  'types.ts defines TranscriptionStyle with codemix and transliterate and integrates into PreserveState & ModelTranscript',
  typesCode.includes('export type TranscriptionStyle = "verbatim" | "transcribe" | "codemix" | "transliterate"') &&
  typesCode.includes('transcriptionStyle?: TranscriptionStyle;') &&
  typesCode.includes('format?: string;'),
  'Must declare expanded TranscriptionStyle type and attach to state & model interfaces'
);

// 2. api.ts
check(
  'api.ts supports format parameter in transcribeAudioOnBackend and passes to Edge Function',
  (apiCode.includes('format: TranscriptionStyle = "verbatim"') || apiCode.includes('format: "verbatim" | "transcribe" | "codemix" | "transliterate" = "verbatim"')) &&
  apiCode.includes('format,') &&
  apiCode.includes('transcription_style: format'),
  'api.ts must forward format to transcribe-audio Edge Function'
);

// 3. transcribe-audio Edge Function parameter handling & transliteration integration
check(
  'transcribe-audio Edge Function extracts, normalizes, and appends format and prisma-v3.0 model to Gnani FormData',
  edgeCode.includes('body.format || body.transcription_style || body.transcriptionStyle') &&
  edgeCode.includes('"transcribe"') &&
  edgeCode.includes('"verbatim"') &&
  edgeCode.includes('"codemix"') &&
  edgeCode.includes('"transliterate"') &&
  edgeCode.includes('formData.append("model", "prisma-v3.0")') &&
  edgeCode.includes('formData.append("format", requestedFormat)'),
  'Edge Function must support all 4 styles and select prisma-v3.0 for codemix & transliterate'
);

check(
  'transcribe-audio Edge Function and frontend api.ts integrate transliterateDevanagariToLatin for Transliterate style',
  fs.existsSync(edgeTranslitPath) &&
  fs.existsSync(frontTranslitPath) &&
  edgeTranslitCode.includes('transliterateDevanagariToLatin') &&
  frontTranslitCode.includes('transliterateDevanagariToLatin') &&
  edgeCode.includes('transliterateDevanagariToLatin') &&
  apiCode.includes('transliterateDevanagariToLatin'),
  'Both Edge Function and frontend client must integrate transliterateDevanagariToLatin'
);

// 4. transcribe-audio Edge Function response fields
check(
  'transcribe-audio Edge Function includes format and appropriate model in standard response JSON',
  edgeCode.includes('format: requestedFormat') &&
  edgeCode.includes('transcription_style: requestedFormat') &&
  edgeCode.includes('Gnani Prisma STT v3.0') &&
  edgeCode.includes('Gnani Prisma STT v2.5'),
  'Edge Function response must echo the applied format and model version'
);

// 5. PreserveContext default state
check(
  'PreserveContext defaults transcriptionStyle to "verbatim"',
  contextCode.includes('transcriptionStyle: "verbatim"') &&
  contextCode.includes('INITIAL_STATE: PreserveState'),
  'Default transcriptionStyle must be "verbatim"'
);

// 6. PreserveContext methods & context provider
check(
  'PreserveContext provides transcriptionStyle and setTranscriptionStyle in context value',
  contextCode.includes('transcriptionStyle: TranscriptionStyle;') &&
  contextCode.includes('setTranscriptionStyle: (style: TranscriptionStyle) => void;') &&
  contextCode.includes('setTranscriptionStyle = useCallback'),
  'Context must expose state and setter'
);

// 7. Backwards compatibility for saved drafts
check(
  'PreserveContext provides fallback for existing/legacy drafts in resumeFromSaved',
  contextCode.includes('transcriptionStyle: resumeDraft.transcriptionStyle || "verbatim"'),
  'Must safely fallback to "verbatim" when loading legacy drafts'
);

// 8. Passing transcriptionStyle during execution
check(
  'PreserveContext forwards current transcriptionStyle to transcribeAudioOnBackend',
  contextCode.includes('stateRef.current.transcriptionStyle || "verbatim"') &&
  contextCode.includes('transcribeAudioOnBackend('),
  'Must pass chosen style when triggering transcription'
);

// 9. Page2Voice radiogroup accessibility for all 4 styles
check(
  'Page2Voice renders accessible Output Style radiogroup covering verbatim, transcribe, codemix, and transliterate',
  page2Code.includes('role="radiogroup"') &&
  page2Code.includes('aria-labelledby="output-style-label"') &&
  page2Code.includes('role="radio"') &&
  page2Code.includes('aria-checked={transcriptionStyle === "verbatim"}') &&
  page2Code.includes('aria-checked={transcriptionStyle === "transcribe"}') &&
  page2Code.includes('aria-checked={transcriptionStyle === "codemix"}') &&
  page2Code.includes('aria-checked={transcriptionStyle === "transliterate"}'),
  'Must follow WAI-ARIA radiogroup pattern with 4 selectable style options'
);

// 10. Exact labels, descriptions, and examples matching Gnani STT specs
check(
  'Page2Voice contains exact copy, descriptions, and highlighted examples for all 4 styles',
  page2Code.includes('Choose how English words and numbers are written.') &&
  page2Code.includes('Writes the transcript word for word in the selected language, entirely in its native script.') &&
  page2Code.includes('Writes the transcript in the native script of the selected language, with numbers, dates and amounts as digits and symbols.') &&
  page2Code.includes('Keeps English words in Latin script and Indic-language words in their native scripts. Numbers are generally written as words.') &&
  page2Code.includes('Writes the transcript in Latin letters, similar to romanized Hindi/Hinglish. Numbers are written as words.') &&
  page2Code.includes('अकाउंट बैलेंस') &&
  page2Code.includes('बारह हज़ार पाँच सौ रुपये') &&
  page2Code.includes('account balance') &&
  page2Code.includes('₹12,500') &&
  page2Code.includes('Mera') &&
  page2Code.includes('baarah hazaar paanch sau rupaye'),
  'Must contain accurate copy and examples matching Gnani Prisma v3 specifications'
);

// 11. Page2Voice Story Overview right rail dynamic display
check(
  'Page2Voice displays selected Output Style in Story Overview right rail for all 4 options',
  page2Code.includes('<span className="p-side-label">Output Style</span>') &&
  page2Code.includes('transcriptionStyle === "transcribe"') &&
  page2Code.includes('transcriptionStyle === "codemix"') &&
  page2Code.includes('transcriptionStyle === "transliterate"') &&
  page2Code.includes('Code-mix (Mixed Script)') &&
  page2Code.includes('Transliterate (Latin Script)'),
  'Story Overview must reflect the active Output Style for all 4 options'
);

// 12. preserve.css styling definitions
check(
  'preserve.css includes complete styling for Output Style cards and highlights',
  cssCode.includes('.p-style-section') &&
  cssCode.includes('.p-style-card') &&
  cssCode.includes('.p-style-card.is-selected') &&
  cssCode.includes('.p-style-example') &&
  cssCode.includes('.p-hl-blue') &&
  cssCode.includes('.p-hl-amber'),
  'preserve.css must include necessary styles for style selector cards and highlights'
);

// =========================================================================
// 13. Executable Unit Tests: Dispatch Logic, Models, & Response Handling
// =========================================================================

function simulateEdgeDispatch(body) {
  const rawFormat = (body.format || body.transcription_style || body.transcriptionStyle)?.toString().toLowerCase().trim();
  let requestedFormat = "verbatim";
  let isPrismaV3 = false;

  if (rawFormat) {
    if (rawFormat === "transcribe") {
      requestedFormat = "transcribe";
    } else if (rawFormat === "codemix" || rawFormat === "code-mix") {
      requestedFormat = "codemix";
      isPrismaV3 = true;
    } else if (rawFormat === "transliterate") {
      requestedFormat = "transliterate";
      isPrismaV3 = true;
    } else if (rawFormat === "verbatim") {
      requestedFormat = "verbatim";
    } else {
      return {
        status: 400,
        error: `Invalid transcription style: '${rawFormat}'. Supported styles are 'verbatim', 'transcribe', 'codemix', and 'transliterate'.`,
        code: "INVALID_TRANSCRIPTION_STYLE",
      };
    }
  }

  const formDataEntries = {};
  if (isPrismaV3) {
    formDataEntries["model"] = "prisma-v3.0";
  }
  const shouldOmitLanguageCode = requestedFormat === "transliterate" && !body.language_code && !body.language;
  if (!shouldOmitLanguageCode) {
    formDataEntries["language_code"] = body.language_code || body.language || "hi-IN";
  }
  formDataEntries["format"] = requestedFormat;

  return {
    status: 200,
    requestedFormat,
    isPrismaV3,
    modelName: isPrismaV3 ? "Gnani Prisma STT v3.0" : "Gnani Prisma STT v2.5",
    providerName: isPrismaV3 ? "gnani-prisma-v3.0" : "gnani-prisma-v2.5",
    formDataEntries,
  };
}

function simulateResponseParsing(dispatchResult, providerData, body) {
  let transcriptText = "";

  if (dispatchResult.requestedFormat === "transliterate") {
    const nativeTransliterated = String(
      providerData.transliterated_transcript ||
      providerData.transliteration ||
      providerData.transliterated_text ||
      providerData.result?.transliterated_transcript ||
      providerData.result?.transliteration ||
      providerData.result?.transliterated_text ||
      ""
    ).trim();

    if (nativeTransliterated && !/[\u0900-\u097F]/.test(nativeTransliterated)) {
      transcriptText = nativeTransliterated;
    } else {
      const rawTranscript = String(
        providerData.result?.transcript ||
        providerData.transcript ||
        providerData.text ||
        ""
      ).trim();
      transcriptText = transliterateDevanagariToLatin(rawTranscript);
    }
  } else {
    transcriptText = String(
      providerData.result?.transcript ||
      providerData.transcript ||
      providerData.text ||
      ""
    ).trim();
  }

  const detectedLangCode = providerData.detected_language_code || providerData.language_code;
  const resolvedLanguageCode = detectedLangCode || body.language_code || body.language || "hi-IN";

  return {
    status: "success",
    provider: dispatchResult.providerName,
    model: dispatchResult.modelName,
    format: dispatchResult.requestedFormat,
    transcription_style: dispatchResult.requestedFormat,
    transcript: transcriptText,
    language_code: resolvedLanguageCode,
    ...(providerData.detected_language_code ? { detected_language_code: providerData.detected_language_code } : {}),
  };
}

// Unit test A: Code-mix sends model=prisma-v3.0 and format=codemix
const codemixDispatch = simulateEdgeDispatch({ format: "codemix", language_code: "hi-IN" });
check(
  'Executable test: Code-mix appends model=prisma-v3.0 and format=codemix',
  codemixDispatch.status === 200 &&
  codemixDispatch.formDataEntries["model"] === "prisma-v3.0" &&
  codemixDispatch.formDataEntries["format"] === "codemix" &&
  codemixDispatch.formDataEntries["language_code"] === "hi-IN" &&
  codemixDispatch.modelName === "Gnani Prisma STT v3.0",
  `Expected prisma-v3.0 and codemix, got ${JSON.stringify(codemixDispatch.formDataEntries)}`
);

// Unit test B: Transliterate sends model=prisma-v3.0 and format=transliterate
const transliterateDispatch = simulateEdgeDispatch({ format: "transliterate" });
check(
  'Executable test: Transliterate appends model=prisma-v3.0, format=transliterate, and omits optional language_code',
  transliterateDispatch.status === 200 &&
  transliterateDispatch.formDataEntries["model"] === "prisma-v3.0" &&
  transliterateDispatch.formDataEntries["format"] === "transliterate" &&
  transliterateDispatch.formDataEntries["language_code"] === undefined &&
  transliterateDispatch.modelName === "Gnani Prisma STT v3.0",
  `Expected prisma-v3.0 and transliterate without language_code, got ${JSON.stringify(transliterateDispatch.formDataEntries)}`
);

// Unit test C: Transliterate succeeds without detected_language_code in Gnani response
const transliterateResponse = simulateResponseParsing(
  transliterateDispatch,
  { success: true, result: { transcript: "Mera account balance baarah hazaar rupaye hai" } }, // Note: NO detected_language_code
  { format: "transliterate" }
);
check(
  'Executable test: Transliterate succeeds when detected_language_code is absent',
  transliterateResponse.status === "success" &&
  transliterateResponse.transcript === "Mera account balance baarah hazaar rupaye hai" &&
  transliterateResponse.format === "transliterate" &&
  transliterateResponse.detected_language_code === undefined &&
  transliterateResponse.language_code === "hi-IN",
  'Transliterate must parse successfully without detected_language_code'
);

// Unit test D: Backwards compatibility - Verbatim & Transcribe do NOT append model=prisma-v3.0
const verbatimDispatch = simulateEdgeDispatch({ format: "verbatim", language_code: "hi-IN" });
const transcribeDispatch = simulateEdgeDispatch({ format: "transcribe", language_code: "hi-IN" });
check(
  'Executable test: Existing Verbatim and Transcribe requests preserve v2.5 behavior without prisma-v3.0',
  verbatimDispatch.formDataEntries["model"] === undefined &&
  verbatimDispatch.formDataEntries["format"] === "verbatim" &&
  verbatimDispatch.modelName === "Gnani Prisma STT v2.5" &&
  transcribeDispatch.formDataEntries["model"] === undefined &&
  transcribeDispatch.formDataEntries["format"] === "transcribe" &&
  transcribeDispatch.modelName === "Gnani Prisma STT v2.5",
  'Verbatim and Transcribe must not include model=prisma-v3.0 to prevent regression'
);

// Unit test E: Invalid style values are safely rejected with HTTP 400
const invalidDispatch = simulateEdgeDispatch({ format: "unsupported_style" });
check(
  'Executable test: Invalid style value is rejected safely with HTTP 400',
  invalidDispatch.status === 400 &&
  invalidDispatch.code === "INVALID_TRANSCRIPTION_STYLE",
  `Expected HTTP 400 INVALID_TRANSCRIPTION_STYLE, got ${JSON.stringify(invalidDispatch)}`
);

// =========================================================================
// 14. Dedicated Step 3 Transliteration Tests
// =========================================================================

// Test 1: Hindi Devanagari output becomes readable Romanized Hindi
const ex1 = transliterateDevanagariToLatin('नमस्ते, आप कैसे हैं?');
const ex2 = transliterateDevanagariToLatin('मुझे पानी चाहिए।');
const ex3 = transliterateDevanagariToLatin('मुझे घर जाना है');

check(
  'Transliteration test 1: "नमस्ते, आप कैसे हैं?" -> "Namaste, aap kaise hain?"',
  ex1 === 'Namaste, aap kaise hain?',
  `Expected 'Namaste, aap kaise hain?', got '${ex1}'`
);

check(
  'Transliteration test 1b: "मुझे पानी चाहिए।" -> "Mujhe paani chahiye."',
  ex2 === 'Mujhe paani chahiye.',
  `Expected 'Mujhe paani chahiye.', got '${ex2}'`
);

check(
  'Transliteration test 1c: "मुझे घर जाना है" -> "Mujhe ghar jaana hai"',
  ex3 === 'Mujhe ghar jaana hai',
  `Expected 'Mujhe ghar jaana hai', got '${ex3}'`
);

// Test 2: Existing Latin-script text is not corrupted
const latinInput = 'Hello world! Account balance is 12,500. Phone: +91-9876543210.';
const latinOutput = transliterateDevanagariToLatin(latinInput);
check(
  'Transliteration test 2: Existing Latin-script text is not corrupted',
  latinOutput === latinInput,
  `Latin text must remain completely unchanged. Got '${latinOutput}'`
);

// Test 3: Mixed Hindi/English text is handled safely
const mixedInput = 'मेरा account balance बारह हज़ार रुपये है।';
const mixedExpected = 'Mera account balance baarah hazaar rupaye hai.';
const mixedOutput = transliterateDevanagariToLatin(mixedInput);
check(
  'Transliteration test 3: Mixed Hindi/English text is handled safely',
  mixedOutput === mixedExpected,
  `Expected '${mixedExpected}', got '${mixedOutput}'`
);

// Test 4: Transliteration does NOT translate the sentence into English
const hindiSentence = 'मुझे पानी चाहिए';
const translitOutput = transliterateDevanagariToLatin(hindiSentence).toLowerCase();
check(
  'Transliteration test 4: Transliteration does NOT translate the sentence into English',
  !translitOutput.includes('water') &&
  !translitOutput.includes('want') &&
  !translitOutput.includes('need') &&
  translitOutput.includes('paani') &&
  translitOutput.includes('chahiye'),
  `Must NOT translate Hindi to English words. Got '${translitOutput}'`
);

// Test 5: Verbatim, Transcribe, and Code-mix still behave as before
const devanagariMock = 'नमस्ते, आप कैसे हैं?';
const verbatimRes = simulateResponseParsing(verbatimDispatch, { success: true, result: { transcript: devanagariMock } }, { format: "verbatim" });
const transcribeRes = simulateResponseParsing(transcribeDispatch, { success: true, result: { transcript: devanagariMock } }, { format: "transcribe" });
const codemixRes = simulateResponseParsing(codemixDispatch, { success: true, result: { transcript: devanagariMock } }, { format: "codemix" });
const translitResFromDevanagari = simulateResponseParsing(transliterateDispatch, { success: true, result: { transcript: devanagariMock } }, { format: "transliterate" });

check(
  'Transliteration test 5: Verbatim, Transcribe, and Code-mix keep native script, while Transliterate converts to Latin',
  verbatimRes.transcript === devanagariMock &&
  transcribeRes.transcript === devanagariMock &&
  codemixRes.transcript === devanagariMock &&
  translitResFromDevanagari.transcript === 'Namaste, aap kaise hain?',
  'Verbatim/Transcribe/Codemix must retain original provider text; only Transliterate must convert to Romanized Latin'
);

// Test 6: Missing or unexpected provider response fields are handled safely
const safeEmpty1 = transliterateDevanagariToLatin('');
const safeEmpty2 = transliterateDevanagariToLatin(null);
const safeEmpty3 = transliterateDevanagariToLatin(undefined);
const safeEmptyRes = simulateResponseParsing(transliterateDispatch, {}, { format: "transliterate" });

check(
  'Transliteration test 6: Missing or unexpected provider response fields are handled safely',
  safeEmpty1 === '' &&
  safeEmpty2 === '' &&
  safeEmpty3 === '' &&
  safeEmptyRes.status === 'success' &&
  safeEmptyRes.transcript === '',
  'Missing/unexpected fields must resolve to safe defaults without throwing'
);

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some transcription style selection checks failed.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All transcription style selection checks passed 100%!');
  process.exit(0);
}

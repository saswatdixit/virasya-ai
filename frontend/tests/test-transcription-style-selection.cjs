/**
 * Test Suite: Transcription Style Selection (Verbatim vs Transcribe)
 * 
 * Verifies all 12 frontend and Edge Function requirements:
 * 1. types.ts defines TranscriptionStyle ("verbatim" | "transcribe") and attaches it to PreserveState & ModelTranscript.
 * 2. api.ts includes transcription_style in StoryPayload and forwards format to transcribe-audio Edge Function.
 * 3. transcribe-audio Edge Function normalizes requested format and appends format to Gnani multipart FormData.
 * 4. transcribe-audio Edge Function reflects format and transcription_style in response.
 * 5. PreserveContext initializes default transcriptionStyle as "verbatim".
 * 6. PreserveContext provides transcriptionStyle and setTranscriptionStyle in context value.
 * 7. PreserveContext preserves backwards compatibility for legacy drafts lacking transcriptionStyle.
 * 8. PreserveContext passes current transcriptionStyle into executeTranscription -> transcribeAudioOnBackend.
 * 9. Page2Voice renders Output Style radiogroup with accessible attributes (role="radiogroup", role="radio", aria-checked).
 * 10. Page2Voice contains exact Verbatim and Transcribe copy, descriptions, and highlighted examples matching Gnani STT specs.
 * 11. Page2Voice Story Overview right rail displays the active Output Style.
 * 12. preserve.css defines styling for style cards, active state, example callout, and blue/amber highlights.
 */

const fs = require('fs');
const path = require('path');

console.log('=== Virasya Transcription Style Selection Test Suite ===\n');

const typesPath = path.join(__dirname, '../src/preserve/types.ts');
const apiPath = path.join(__dirname, '../src/preserve/api.ts');
const edgePath = path.join(__dirname, '../../supabase/functions/transcribe-audio/index.ts');
const contextPath = path.join(__dirname, '../src/preserve/context/PreserveContext.tsx');
const page2Path = path.join(__dirname, '../src/preserve/pages/Page2Voice.tsx');
const cssPath = path.join(__dirname, '../src/preserve/preserve.css');

const typesCode = fs.readFileSync(typesPath, 'utf8');
const apiCode = fs.readFileSync(apiPath, 'utf8');
const edgeCode = fs.readFileSync(edgePath, 'utf8');
const contextCode = fs.readFileSync(contextPath, 'utf8');
const page2Code = fs.readFileSync(page2Path, 'utf8');
const cssCode = fs.readFileSync(cssPath, 'utf8');

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
  'types.ts defines TranscriptionStyle and integrates into PreserveState & ModelTranscript',
  typesCode.includes('export type TranscriptionStyle = "verbatim" | "transcribe"') &&
  typesCode.includes('transcriptionStyle?: TranscriptionStyle;') &&
  typesCode.includes('format?: string;'),
  'Must declare TranscriptionStyle type and attach to state & model interfaces'
);

// 2. api.ts
check(
  'api.ts supports format parameter in transcribeAudioOnBackend and passes to Edge Function',
  apiCode.includes('format: "verbatim" | "transcribe" = "verbatim"') &&
  apiCode.includes('format,') &&
  apiCode.includes('transcription_style: format'),
  'api.ts must forward format to transcribe-audio Edge Function'
);

// 3. transcribe-audio Edge Function parameter handling
check(
  'transcribe-audio Edge Function extracts, normalizes, and appends format to Gnani FormData',
  edgeCode.includes('body.format || body.transcription_style || body.transcriptionStyle') &&
  edgeCode.includes('"transcribe"') &&
  edgeCode.includes('"verbatim"') &&
  edgeCode.includes('formData.append("format", requestedFormat)'),
  'Edge Function must support both verbatim and transcribe formats'
);

// 4. transcribe-audio Edge Function response fields
check(
  'transcribe-audio Edge Function includes format in standard response JSON',
  edgeCode.includes('format: requestedFormat') &&
  edgeCode.includes('transcription_style: requestedFormat'),
  'Edge Function response must echo the applied format'
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

// 9. Page2Voice radiogroup accessibility
check(
  'Page2Voice renders accessible Output Style radiogroup',
  page2Code.includes('role="radiogroup"') &&
  page2Code.includes('aria-labelledby="output-style-label"') &&
  page2Code.includes('role="radio"') &&
  page2Code.includes('aria-checked={transcriptionStyle === "verbatim"}') &&
  page2Code.includes('aria-checked={transcriptionStyle === "transcribe"}'),
  'Must follow WAI-ARIA radiogroup pattern with keyboard navigation'
);

// 10. Exact labels, descriptions, and examples matching Gnani STT screenshot
check(
  'Page2Voice contains exact Verbatim and Transcribe copy and highlighted examples',
  page2Code.includes('Choose how English words and numbers are written.') &&
  page2Code.includes('Writes the transcript word for word in the selected language, entirely in its native script.') &&
  page2Code.includes('Writes the transcript in the native script of the selected language, with numbers, dates and amounts as digits and symbols.') &&
  page2Code.includes('अकाउंट बैलेंस') &&
  page2Code.includes('बारह हज़ार पाँच सौ रुपये') &&
  page2Code.includes('account balance') &&
  page2Code.includes('₹12,500'),
  'Must contain accurate copy and examples matching Gnani documentation and screenshot'
);

// 11. Page2Voice Story Overview right rail
check(
  'Page2Voice displays selected Output Style in Story Overview right rail',
  page2Code.includes('<span className="p-side-label">Output Style</span>') &&
  page2Code.includes('transcriptionStyle === "transcribe" ? "Transcribe (Digits & Symbols)" : "Verbatim (Native Script)"'),
  'Story Overview must reflect the active Output Style'
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

console.log('\n======================================================');
if (failed) {
  console.error('VERIFICATION FAILED: Some transcription style selection checks failed.');
  process.exit(1);
} else {
  console.log('VERIFICATION SUCCESSFUL: All 12 transcription style selection checks passed 100%!');
  process.exit(0);
}

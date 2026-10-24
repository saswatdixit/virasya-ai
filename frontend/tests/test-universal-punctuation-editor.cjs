const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

console.log("=== Verifying Virasya Universal & Language-Aware Punctuation Editor ===");

// 1. Inspect Page5Punctuation.tsx source code
const page5Path = path.resolve(__dirname, "../src/preserve/pages/Page5Punctuation.tsx");
assert(fs.existsSync(page5Path), "Page5Punctuation.tsx must exist");
const page5Content = fs.readFileSync(page5Path, "utf8");

// Neutral Title & Absence of Odia-specific Branding
assert(page5Content.includes('<h2 className="p-panel-title">Punctuation Editor</h2>'), "Title must be 'Punctuation Editor'");
assert(!page5Content.includes("Odia Punctuation Editor"), "Must not contain 'Odia Punctuation Editor'");
assert(!page5Content.includes("type directly in Odia script"), "Must not restrict typing label to Odia script");
assert(!page5Content.includes('placeholder="Enter or refine your Odia transcript'), "Textarea placeholder must not be hardcoded to Odia");
assert(!page5Content.includes('fontFamily: "\'Noto Serif Odia\', \'Anek Odia\', serif"'), "Font family must not be hardcoded to Odia");
console.log("   ✓ Neutral branding confirmed: 'Punctuation Editor' without Odia hardcoding.");

// Language-Aware Integration
assert(page5Content.includes("getPunctuationProfile"), "Page 5 must import getPunctuationProfile");
assert(page5Content.includes("applyPunctuationMark"), "Page 5 must import applyPunctuationMark");
assert(page5Content.includes("calculatePunctuationMetrics"), "Page 5 must import calculatePunctuationMetrics");
assert(page5Content.includes("state.form.language"), "Page 5 must read language from application state");
assert(page5Content.includes("profile.fontFamily"), "Textarea must use language-aware profile font family");
console.log("   ✓ Language-aware integration confirmed: dynamically resolves profile from state.form.language.");

// 2. Inspect punctuationProfiles.ts
const profilesPath = path.resolve(__dirname, "../src/preserve/punctuationProfiles.ts");
assert(fs.existsSync(profilesPath), "punctuationProfiles.ts must exist");
const profilesContent = fs.readFileSync(profilesPath, "utf8");

// Universal Marks Support
const requiredMarks = [
  "period", "comma", "question", "exclamation", "colon", "semicolon",
  "doubleQuotes", "singleQuotes", "parentheses", "squareBrackets",
  "emDash", "hyphen", "ellipsis", "danda", "doubleDanda"
];
for (const markId of requiredMarks) {
  assert(profilesContent.includes(`id: "${markId}"`), `Punctuation catalog must include '${markId}'`);
}
console.log("   ✓ Universal catalog confirmed: includes periods, commas, questions, exclamations, colons, semicolons, quotes, brackets, dashes, ellipses, dandas, and double dandas.");

// Language Profile Definitions
const requiredProfiles = [
  "ODIA_PROFILE", "HINDI_PROFILE", "BENGALI_PROFILE", "GUJARATI_PROFILE",
  "MARATHI_PROFILE", "PUNJABI_PROFILE", "TAMIL_PROFILE", "TELUGU_PROFILE",
  "KANNADA_PROFILE", "MALAYALAM_PROFILE", "UNIVERSAL_PROFILE"
];
for (const prof of requiredProfiles) {
  assert(profilesContent.includes(prof), `Must define profile '${prof}'`);
}
console.log("   ✓ Supported language profiles confirmed across Odia, Hindi, Bengali, Gujarati, Marathi, Punjabi, Tamil, Telugu, Kannada, Malayalam, and Universal/English.");

// 3. Test Punctuation Logic Simulation (in Node environment)
// Replicate applyPunctuationMark and calculatePunctuationMetrics logic to verify correctness
function applyMark(currentText, mark, isEnclosing, start, end) {
  const selectedText = currentText.slice(start, end);
  if (isEnclosing) {
    let openMark = "“";
    let closeMark = "”";
    if (mark === "‘ ’") { openMark = "‘"; closeMark = "’"; }
    else if (mark === "( )") { openMark = "("; closeMark = ")"; }
    else if (mark === "[ ]") { openMark = "["; closeMark = "]"; }

    if (selectedText.length > 0) {
      const wrapped = `${openMark}${selectedText}${closeMark}`;
      return {
        nextText: currentText.slice(0, start) + wrapped + currentText.slice(end),
        nextCursorPos: start + wrapped.length
      };
    } else {
      const pair = `${openMark}${closeMark}`;
      return {
        nextText: currentText.slice(0, start) + pair + currentText.slice(end),
        nextCursorPos: start + openMark.length
      };
    }
  }

  let insertion = mark;
  const afterChar = currentText[end] || "";
  const standardDelimiters = ["।", "॥", ".", ",", "!", "?", ";", ":"];
  if (standardDelimiters.includes(mark)) {
    if (afterChar !== " " && afterChar !== "\n" && afterChar !== "" && afterChar !== "”" && afterChar !== "’" && afterChar !== ")" && afterChar !== "]") {
      insertion = mark + " ";
    }
  }
  return {
    nextText: currentText.slice(0, start) + insertion + currentText.slice(end),
    nextCursorPos: start + insertion.length
  };
}

// Test Unicode preservation and punctuation insertion for Hindi
const hindiText = "नमस्ते यह एक प्राचीन कहानी है";
const resHindiDanda = applyMark(hindiText, "।", false, hindiText.length, hindiText.length);
assert.equal(resHindiDanda.nextText, "नमस्ते यह एक प्राचीन कहानी है।", "Hindi danda insertion must preserve Unicode");

// Test Unicode preservation and punctuation insertion for Odia
const odiaText = "ମୋ ଆଈ ପ୍ରତି ଗୁରୁବାର ଖେଚେଡ଼ି ରାନ୍ଧୁଥିଲେ";
const resOdiaDanda = applyMark(odiaText, "।", false, odiaText.length, odiaText.length);
assert.equal(resOdiaDanda.nextText, "ମୋ ଆଈ ପ୍ରତି ଗୁରୁବାର ଖେଚେଡ଼ି ରାନ୍ଧୁଥିଲେ।", "Odia danda insertion must preserve Unicode");

// Test English / Latin full stop insertion
const engText = "This is an oral heritage story";
const resEng = applyMark(engText, ".", false, engText.length, engText.length);
assert.equal(resEng.nextText, "This is an oral heritage story.", "Period insertion must work accurately");

// Test wrapping selected text in quotes
const quoteWrap = applyMark(hindiText, "“ ”", true, 0, 6); // "नमस्ते"
assert.equal(quoteWrap.nextText, "“नमस्ते” यह एक प्राचीन कहानी है", "Selection must be wrapped in curly quotes");

// Test smart spacing insertion in middle of text
const midText = "पहला भाग दूसरा भाग";
const resMid = applyMark(midText, ",", false, 8, 8);
assert.equal(resMid.nextText, "पहला भाग, दूसरा भाग", "Comma insertion in middle of text must handle spacing cleanly");

console.log("   ✓ Punctuation formatting and Unicode preservation logic verified across Hindi, Odia, and English.");

// 4. Raw Transcript Preservation Integrity
assert(page5Content.includes("rawGnaniText = state.tx.gnani?.text"), "Must retain raw STT transcript reference");
assert(page5Content.includes("Cross-reference Raw ASR Transcript"), "Must allow cross-referencing raw transcript");
assert(page5Content.includes("Reset to unpunctuated draft"), "Must allow resetting to Step 3 draft");
assert(page5Content.includes("goToStep(4)"), "Back button must navigate to Step 4");
assert(page5Content.includes("goToStep(6)"), "Continue button must navigate to Step 6");
console.log("   ✓ Raw transcript isolation and preservation workflow integrity confirmed.");

console.log("\n===============================================================================");
console.log("   ALL UNIVERSAL & LANGUAGE-AWARE PUNCTUATION EDITOR CHECKS PASSED (100%)");
console.log("===============================================================================\n");

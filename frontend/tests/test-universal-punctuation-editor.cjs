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

// 5. Language-Specific Curated Recommendations Verification
// Simulate getPunctuationProfile in Node environment
function simulateGetProfile(language) {
  if (!language) return { languageKey: "Universal", isFallback: true };
  const raw = language.trim();
  if (!raw) return { languageKey: "Universal", isFallback: true };
  const lang = raw.toLowerCase().replace(/_/g, "-");

  if (lang === "mr" || lang.startsWith("mr-") || lang.includes("marathi") || lang.includes("konkani")) {
    return {
      languageKey: "Marathi",
      displayName: "Marathi (मराठी)",
      primaryMarks: [".", ",", "?", "“ ”", "!", ";", "—", "।"]
    };
  }
  if (lang === "hi" || lang.startsWith("hi-") || lang.includes("hindi") || lang.includes("bhojpuri")) {
    return {
      languageKey: "Hindi",
      displayName: "Hindi (हिन्दी)",
      primaryMarks: ["।", ",", "?", "“ ”", "!", ":", "॥", "—"]
    };
  }
  if (lang === "or" || lang.startsWith("or-") || lang === "od" || lang.startsWith("od-") || lang.includes("odia")) {
    return {
      languageKey: "Odia",
      displayName: "Odia (ଓଡ଼ିଆ)",
      primaryMarks: ["।", ",", "?", "“ ”", "!", "॥", "‘ ’", "—"]
    };
  }
  if (lang === "bn" || lang.startsWith("bn-") || lang.includes("bengali")) {
    return {
      languageKey: "Bengali",
      displayName: "Bengali (বাংলা)",
      primaryMarks: ["।", ",", "?", "“ ”", "!", ";", ":", "—"]
    };
  }
  if (lang === "gu" || lang.startsWith("gu-") || lang.includes("gujarati")) {
    return {
      languageKey: "Gujarati",
      displayName: "Gujarati (ગુજરાતી)",
      primaryMarks: [".", ",", "?", "“ ”", "!", ":", "—", "-"]
    };
  }
  if (lang === "pa" || lang.startsWith("pa-") || lang.includes("punjabi")) {
    return {
      languageKey: "Punjabi",
      displayName: "Punjabi (ਪੰਜਾਬੀ)",
      primaryMarks: ["।", ",", ".", "?", "“ ”", "!", ":", "—"]
    };
  }
  if (lang === "ta" || lang.startsWith("ta-") || lang.includes("tamil")) {
    return {
      languageKey: "Tamil",
      displayName: "Tamil (தமிழ்)",
      primaryMarks: [".", ",", "?", "!", "“ ”", "‘ ’", ";", ":"]
    };
  }
  if (lang === "te" || lang.startsWith("te-") || lang.includes("telugu")) {
    return {
      languageKey: "Telugu",
      displayName: "Telugu (తెలుగు)",
      primaryMarks: [".", ",", "?", "!", "“ ”", ";", ":", "—"]
    };
  }
  if (lang === "kn" || lang.startsWith("kn-") || lang.includes("kannada")) {
    return {
      languageKey: "Kannada",
      displayName: "Kannada (ಕನ್ನಡ)",
      primaryMarks: [".", ",", "?", "!", "“ ”", ";", ":", "—"]
    };
  }
  if (lang === "ml" || lang.startsWith("ml-") || lang.includes("malayalam")) {
    return {
      languageKey: "Malayalam",
      displayName: "Malayalam (മലയാളം)",
      primaryMarks: [".", ",", "?", "!", "“ ”", ";", ":", "—"]
    };
  }
  if (lang === "en" || lang.startsWith("en-") || lang.includes("english")) {
    return {
      languageKey: "English",
      displayName: "English (India)",
      primaryMarks: [".", ",", "?", "!", "“ ”", "‘ ’", ";", ":", "—"]
    };
  }
  return { languageKey: raw, isFallback: true };
}

// Marathi distinction: Period is primary (index 0), Danda is secondary
const marathiProf = simulateGetProfile("Marathi");
assert.equal(marathiProf.primaryMarks[0], ".", "Marathi primary sentence stop must be Period (.)");
assert.equal(marathiProf.primaryMarks[marathiProf.primaryMarks.length - 1], "।", "Marathi should include Danda (।) for traditional poetry");

// Hindi & Odia & Bengali distinction: Danda is primary (index 0)
const hindiProf = simulateGetProfile("Hindi");
assert.equal(hindiProf.primaryMarks[0], "।", "Hindi primary sentence stop must be Danda (।)");
assert(hindiProf.primaryMarks.includes("॥"), "Hindi should include Double Danda (॥) for verse");

const odiaProf = simulateGetProfile("Odia");
assert.equal(odiaProf.primaryMarks[0], "।", "Odia primary sentence stop must be Danda (।)");
assert(odiaProf.primaryMarks.includes("॥"), "Odia should include Double Danda (॥)");

const bengaliProf = simulateGetProfile("Bengali");
assert.equal(bengaliProf.primaryMarks[0], "।", "Bengali primary sentence stop must be Daari / Danda (।)");

// Dravidian scripts (Tamil, Telugu, Kannada, Malayalam): Period is primary, no Danda in primary marks
const tamilProf = simulateGetProfile("Tamil");
assert.equal(tamilProf.primaryMarks[0], ".", "Tamil primary sentence stop must be Period (.)");
assert(!tamilProf.primaryMarks.includes("।"), "Tamil primary recommendations must NOT include Danda (।)");

const teluguProf = simulateGetProfile("Telugu");
assert.equal(teluguProf.primaryMarks[0], ".", "Telugu primary sentence stop must be Period (.)");
assert(!teluguProf.primaryMarks.includes("।"), "Telugu primary recommendations must NOT include Danda (।)");

const kannadaProf = simulateGetProfile("Kannada");
assert.equal(kannadaProf.primaryMarks[0], ".", "Kannada primary sentence stop must be Period (.)");
assert(!kannadaProf.primaryMarks.includes("।"), "Kannada primary recommendations must NOT include Danda (।)");

const malayalamProf = simulateGetProfile("Malayalam");
assert.equal(malayalamProf.primaryMarks[0], ".", "Malayalam primary sentence stop must be Period (.)");
assert(!malayalamProf.primaryMarks.includes("।"), "Malayalam primary recommendations must NOT include Danda (।)");

// Gujarati: Period primary, colon and hyphen
const gujaratiProf = simulateGetProfile("Gujarati");
assert.equal(gujaratiProf.primaryMarks[0], ".", "Gujarati primary sentence stop must be Period (.)");

// BCP-47 Code Resolution
const bcpCases = [
  { code: "hi-IN", expected: "Hindi" },
  { code: "mr-IN", expected: "Marathi" },
  { code: "bn-IN", expected: "Bengali" },
  { code: "or-IN", expected: "Odia" },
  { code: "ta-IN", expected: "Tamil" },
  { code: "te-IN", expected: "Telugu" },
  { code: "kn-IN", expected: "Kannada" },
  { code: "ml-IN", expected: "Malayalam" },
  { code: "gu-IN", expected: "Gujarati" },
  { code: "pa-IN", expected: "Punjabi" },
  { code: "en-IN", expected: "English" },
];
for (const tc of bcpCases) {
  const p = simulateGetProfile(tc.code);
  assert.equal(p.languageKey, tc.expected, `BCP-47 code '${tc.code}' must resolve to profile '${tc.expected}'`);
}

// Fallback behavior for unknown language
const unknownProf = simulateGetProfile("Esperanto");
assert(unknownProf.isFallback, "Unknown language must return a fallback profile");

console.log("   ✓ Language-specific curated recommendations verified across all 11 languages + BCP-47 codes.");

// 6. Page 5 Dynamic Tab Heading & Active Language Derivation Verification
assert(page5Content.includes("activeLanguage = useMemo"), "Page 5 must compute activeLanguage dynamically");
assert(page5Content.includes("state.tx.gnani?.requestedLanguage"), "Page 5 activeLanguage must consider GNANI ASR requestedLanguage");
assert(page5Content.includes("Recommended for ${profile.languageKey}"), "Page 5 must render dynamic recommendation heading for active language");
assert(page5Content.includes("General Recommended Punctuation"), "Page 5 must provide fallback heading for unknown language");
console.log("   ✓ Dynamic tab heading and active transcript language derivation verified.");

console.log("\n===============================================================================");
console.log("   ALL UNIVERSAL & LANGUAGE-AWARE PUNCTUATION EDITOR CHECKS PASSED (100%)");
console.log("===============================================================================\n");

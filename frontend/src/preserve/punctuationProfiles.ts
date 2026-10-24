/**
 * Virasya Universal & Language-Aware Punctuation Profiles
 *
 * Provides configurable punctuation profiles and smart formatting helpers
 * across all languages supported by Virasya (Odia, Hindi, Bengali, Gujarati,
 * Marathi, Punjabi, Tamil, Telugu, Kannada, Malayalam, English, and dialects).
 */

export type PunctuationCategory =
  | "sentence"
  | "pause"
  | "inquiry_emotion"
  | "quote_bracket"
  | "connector"
  | "traditional";

export interface PunctuationMarkItem {
  id: string;
  mark: string;            // The raw character or token, e.g. "।", ".", "“ ”"
  display: string;         // Visual symbol displayed on the button
  label: string;           // Short human-readable label, e.g. "danda", "period", "comma"
  title: string;           // Accessible tooltip explaining mark meaning and usage
  category: PunctuationCategory;
  isEnclosing?: boolean;   // True for pairs like "“ ”", "‘ ’", "( )", "[ ]"
  ariaLabel?: string;
  fontFamily?: string;     // Specific font override if needed for glyph rendering
}

export interface PunctuationProfile {
  languageKey: string;
  displayName: string;
  scriptName: string;
  fontFamily: string;
  primaryMarks: PunctuationMarkItem[];
  availableGroups: {
    id: PunctuationCategory;
    name: string;
    marks: PunctuationMarkItem[];
  }[];
  isFallback?: boolean;
  recommendationNotes?: string;
}

export interface PunctuationMetrics {
  words: number;
  characters: number;
  dandas: number;
  doubleDandas: number;
  periods: number;
  totalSentences: number;
  commas: number;
  questions: number;
  exclamations: number;
  semicolons: number;
  colons: number;
  quotes: number;
}

// =============================================================================
// UNIVERSAL PUNCTUATION CATALOG
// =============================================================================

export const PUNCTUATION_MARKS: Record<string, PunctuationMarkItem> = {
  // Sentence Stops
  danda: {
    id: "danda",
    mark: "।",
    display: "।",
    label: "danda",
    title: "Purna Virama (Danda) — Traditional Indic sentence stop (।)",
    category: "sentence",
    ariaLabel: "Purna Virama or Danda sentence stop",
  },
  doubleDanda: {
    id: "doubleDanda",
    mark: "॥",
    display: "॥",
    label: "double",
    title: "Deergha Virama (Double Danda) — Stanza, paragraph, or thematic conclusion (॥)",
    category: "sentence",
    ariaLabel: "Double Danda stanza conclusion",
  },
  period: {
    id: "period",
    mark: ".",
    display: ".",
    label: "period",
    title: "Period / Full Stop — Standard sentence termination (.)",
    category: "sentence",
    ariaLabel: "Period full stop",
  },

  // Pauses & Delimiters
  comma: {
    id: "comma",
    mark: ",",
    display: ",",
    label: "comma",
    title: "Comma (Alpaviram) — Brief pause or clause separation (,)",
    category: "pause",
    ariaLabel: "Comma short pause",
  },
  semicolon: {
    id: "semicolon",
    mark: ";",
    display: ";",
    label: "semicolon",
    title: "Semicolon (Ardhviram) — Intermediate pause connecting related clauses (;)",
    category: "pause",
    ariaLabel: "Semicolon intermediate pause",
  },
  colon: {
    id: "colon",
    mark: ":",
    display: ":",
    label: "colon",
    title: "Colon — Introduces dialogue, quotation, or narrative explanation (:)",
    category: "pause",
    ariaLabel: "Colon introducer",
  },
  ellipsis: {
    id: "ellipsis",
    mark: "…",
    display: "…",
    label: "ellipsis",
    title: "Ellipsis — Trail off, oral hesitation, or unspoken thought (…)",
    category: "pause",
    ariaLabel: "Ellipsis pause",
  },

  // Inquiry & Emotion
  question: {
    id: "question",
    mark: "?",
    display: "?",
    label: "question",
    title: "Question Mark (Prasnabachaka) — Direct inquiry or interrogation (?)",
    category: "inquiry_emotion",
    ariaLabel: "Question mark",
  },
  exclamation: {
    id: "exclamation",
    mark: "!",
    display: "!",
    label: "exclamation",
    title: "Exclamation Mark (Vismayabodhaka) — Surprise, emphasis, or strong emotion (!)",
    category: "inquiry_emotion",
    ariaLabel: "Exclamation mark",
  },

  // Quotes & Enclosures
  doubleQuotes: {
    id: "doubleQuotes",
    mark: "“ ”",
    display: "“ ”",
    label: "quotes",
    title: "Double Curly Quotes — Dialogue, direct speech, or quotation (“ ”)",
    category: "quote_bracket",
    isEnclosing: true,
    ariaLabel: "Double quotation marks",
  },
  singleQuotes: {
    id: "singleQuotes",
    mark: "‘ ’",
    display: "‘ ’",
    label: "single quotes",
    title: "Single Curly Quotes — Nested quote, cultural term, or title (‘ ’)",
    category: "quote_bracket",
    isEnclosing: true,
    ariaLabel: "Single quotation marks",
  },
  parentheses: {
    id: "parentheses",
    mark: "( )",
    display: "( )",
    label: "parentheses",
    title: "Parentheses — Aside, clarification, or narrator comment ( )",
    category: "quote_bracket",
    isEnclosing: true,
    ariaLabel: "Parentheses",
  },
  squareBrackets: {
    id: "squareBrackets",
    mark: "[ ]",
    display: "[ ]",
    label: "brackets",
    title: "Square Brackets — Editorial gloss, contextual note, or dialect gloss [ ]",
    category: "quote_bracket",
    isEnclosing: true,
    ariaLabel: "Square brackets",
  },

  // Connectors
  emDash: {
    id: "emDash",
    mark: "—",
    display: "—",
    label: "em dash",
    title: "Em Dash — Shift in thought, dramatic oral pause, or speaker change (—)",
    category: "connector",
    ariaLabel: "Em dash",
  },
  hyphen: {
    id: "hyphen",
    mark: "-",
    display: "-",
    label: "hyphen",
    title: "Hyphen — Compound words or joined phrases (-)",
    category: "connector",
    ariaLabel: "Hyphen connector",
  },
};

// =============================================================================
// LANGUAGE PROFILES
// =============================================================================

const ALL_CATEGORIES_ORDER: PunctuationCategory[] = [
  "sentence",
  "pause",
  "inquiry_emotion",
  "quote_bracket",
  "connector",
];

const CATEGORY_NAMES: Record<PunctuationCategory, string> = {
  sentence: "Sentence Stops",
  pause: "Pauses & Delimiters",
  inquiry_emotion: "Tone & Inquiry",
  quote_bracket: "Quotes & Brackets",
  connector: "Connectors",
  traditional: "Traditional Marks",
};

function buildCategoryGroups(): {
  id: PunctuationCategory;
  name: string;
  marks: PunctuationMarkItem[];
}[] {
  const allMarksList = Object.values(PUNCTUATION_MARKS);
  return ALL_CATEGORIES_ORDER.map((cat) => ({
    id: cat,
    name: CATEGORY_NAMES[cat],
    marks: allMarksList.filter((m) => m.category === cat),
  }));
}

/**
 * Standard Odia Punctuation Profile
 *
 * Odia orthography: Purna Virama / Danda (।) is the universal sentence terminator.
 * Double Danda (॥) is traditional for stanzas or narrative conclusions.
 * Comma (,), question mark (?), exclamation (!), quotes, and em dash are standard.
 */
export const ODIA_PROFILE: PunctuationProfile = {
  languageKey: "Odia",
  displayName: "Odia (ଓଡ଼ିଆ)",
  scriptName: "Odia script",
  fontFamily: "'Noto Serif Odia', 'Anek Odia', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.danda,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.doubleDanda,
    PUNCTUATION_MARKS.singleQuotes,
    PUNCTUATION_MARKS.emDash,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Odia orthography: Danda (।) for sentence stops; quotes and commas for oral pauses",
};

/**
 * Standard Hindi / Devanagari Punctuation Profile
 *
 * Hindi Devanagari orthography: Purna Virama (।) is the standard sentence stop.
 * Western punctuation marks (?, !, quotes, commas, colons) are standard in modern Hindi prose.
 * Double Danda (॥) is used for verses, chaupais, or section conclusions.
 */
export const HINDI_PROFILE: PunctuationProfile = {
  languageKey: "Hindi",
  displayName: "Hindi (हिन्दी)",
  scriptName: "Devanagari script",
  fontFamily: "'Noto Serif Devanagari', 'Noto Sans Devanagari', 'Mangal', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.danda,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.colon,
    PUNCTUATION_MARKS.doubleDanda,
    PUNCTUATION_MARKS.emDash,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Devanagari orthography: Purna Virama (।) for sentence stops; quotes and commas for oral pauses",
};

/**
 * Bengali Punctuation Profile
 *
 * Bengali orthography: Daari (।) is the universal sentence stop.
 * Western comma, semicolon, question mark, exclamation, quotes, and em dash are standard.
 */
export const BENGALI_PROFILE: PunctuationProfile = {
  languageKey: "Bengali",
  displayName: "Bengali (বাংলা)",
  scriptName: "Bengali script",
  fontFamily: "'Noto Serif Bengali', 'Noto Sans Bengali', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.danda,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.semicolon,
    PUNCTUATION_MARKS.colon,
    PUNCTUATION_MARKS.emDash,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Eastern Nagari orthography: Daari (।) for sentence stops; commas and semicolons for clauses",
};

/**
 * Gujarati Punctuation Profile
 *
 * Modern Gujarati prose overwhelmingly uses the Period (.) as the sentence stop.
 * Danda (।) is historic or verse-only.
 */
export const GUJARATI_PROFILE: PunctuationProfile = {
  languageKey: "Gujarati",
  displayName: "Gujarati (ગુજરાતી)",
  scriptName: "Gujarati script",
  fontFamily: "'Noto Serif Gujarati', 'Noto Sans Gujarati', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.period,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.colon,
    PUNCTUATION_MARKS.emDash,
    PUNCTUATION_MARKS.hyphen,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Modern Gujarati orthography: Period (.) for sentence stops; colons and commas for clauses",
};

/**
 * Marathi Punctuation Profile
 *
 * Modern standard Marathi prose (standardized by Maharashtra Sahitya Parishad) uses the
 * Period (.) for sentence stops. Danda (।) is reserved for poetry, Abhangas, and Sanskrit verse.
 */
export const MARATHI_PROFILE: PunctuationProfile = {
  languageKey: "Marathi",
  displayName: "Marathi (मराठी)",
  scriptName: "Devanagari script",
  fontFamily: "'Noto Serif Devanagari', 'Noto Sans Devanagari', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.period,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.semicolon,
    PUNCTUATION_MARKS.emDash,
    PUNCTUATION_MARKS.danda,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Modern Marathi orthography: Period (.) for sentence stops; Danda (।) for traditional verses",
};

/**
 * Punjabi Punctuation Profile
 *
 * Gurmukhi prose uses Danda (Dandi ।) and Period (.) as sentence stops.
 */
export const PUNJABI_PROFILE: PunctuationProfile = {
  languageKey: "Punjabi",
  displayName: "Punjabi (ਪੰਜਾਬੀ)",
  scriptName: "Gurmukhi script",
  fontFamily: "'Noto Serif Gurmukhi', 'Noto Sans Gurmukhi', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.danda,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.period,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.colon,
    PUNCTUATION_MARKS.emDash,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Gurmukhi orthography: Danda (।) and Period (.) for sentence stops",
};

/**
 * Tamil Punctuation Profile
 *
 * Standard Tamil prose uses Period (.) exclusively for sentence stops (Danda is not native to Tamil).
 */
export const TAMIL_PROFILE: PunctuationProfile = {
  languageKey: "Tamil",
  displayName: "Tamil (தமிழ்)",
  scriptName: "Tamil script",
  fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.period,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.singleQuotes,
    PUNCTUATION_MARKS.semicolon,
    PUNCTUATION_MARKS.colon,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Tamil orthography: Period (.) for sentence stops; quotes and pauses for spoken narrative",
};

/**
 * Telugu Punctuation Profile
 *
 * Standard Telugu prose uses Period (.) exclusively for sentence stops.
 */
export const TELUGU_PROFILE: PunctuationProfile = {
  languageKey: "Telugu",
  displayName: "Telugu (తెలుగు)",
  scriptName: "Telugu script",
  fontFamily: "'Noto Serif Telugu', 'Noto Sans Telugu', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.period,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.semicolon,
    PUNCTUATION_MARKS.colon,
    PUNCTUATION_MARKS.emDash,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Telugu orthography: Period (.) for sentence stops; quotes and commas for clauses",
};

/**
 * Kannada Punctuation Profile
 *
 * Standard Kannada prose uses Period (.) exclusively for sentence stops.
 */
export const KANNADA_PROFILE: PunctuationProfile = {
  languageKey: "Kannada",
  displayName: "Kannada (ಕನ್ನಡ)",
  scriptName: "Kannada script",
  fontFamily: "'Noto Serif Kannada', 'Noto Sans Kannada', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.period,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.semicolon,
    PUNCTUATION_MARKS.colon,
    PUNCTUATION_MARKS.emDash,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Kannada orthography: Period (.) for sentence stops; quotes and pauses for clauses",
};

/**
 * Malayalam Punctuation Profile
 *
 * Standard Malayalam prose uses Period (.) exclusively for sentence stops.
 */
export const MALAYALAM_PROFILE: PunctuationProfile = {
  languageKey: "Malayalam",
  displayName: "Malayalam (മലയാളം)",
  scriptName: "Malayalam script",
  fontFamily: "'Noto Serif Malayalam', 'Noto Sans Malayalam', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.period,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.semicolon,
    PUNCTUATION_MARKS.colon,
    PUNCTUATION_MARKS.emDash,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Malayalam orthography: Period (.) for sentence stops; quotes and commas for pauses",
};

/**
 * English (India) Punctuation Profile
 */
export const ENGLISH_PROFILE: PunctuationProfile = {
  languageKey: "English",
  displayName: "English (India)",
  scriptName: "Latin script",
  fontFamily: "'Noto Serif', 'Georgia', 'Times New Roman', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.period,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.singleQuotes,
    PUNCTUATION_MARKS.semicolon,
    PUNCTUATION_MARKS.colon,
    PUNCTUATION_MARKS.emDash,
  ],
  availableGroups: buildCategoryGroups(),
  recommendationNotes: "Standard English typography: Period (.) for sentence stops; quotes and dashes for dialogue",
};

/**
 * Universal & Fallback Punctuation Profile
 */
export const UNIVERSAL_PROFILE: PunctuationProfile = {
  languageKey: "Universal",
  displayName: "Universal / General",
  scriptName: "Multilingual",
  fontFamily: "'Noto Serif', 'Georgia', serif",
  primaryMarks: [
    PUNCTUATION_MARKS.period,
    PUNCTUATION_MARKS.comma,
    PUNCTUATION_MARKS.question,
    PUNCTUATION_MARKS.exclamation,
    PUNCTUATION_MARKS.doubleQuotes,
    PUNCTUATION_MARKS.danda,
    PUNCTUATION_MARKS.semicolon,
    PUNCTUATION_MARKS.emDash,
    PUNCTUATION_MARKS.parentheses,
  ],
  availableGroups: buildCategoryGroups(),
  isFallback: true,
  recommendationNotes: "Universal punctuation recommendation",
};

/**
 * Resolves the appropriate punctuation profile based on the story language.
 * Supports BCP-47 codes (e.g. "hi-IN", "mr-IN", "ta-IN", "or-IN"),
 * full language names, common dialects, and unknown language fallbacks.
 */
export function getPunctuationProfile(language?: string | null): PunctuationProfile {
  if (!language) return UNIVERSAL_PROFILE;
  const raw = language.trim();
  if (!raw) return UNIVERSAL_PROFILE;
  const lang = raw.toLowerCase().replace(/_/g, "-");

  // Marathi (Devanagari, Period primary)
  if (
    lang === "mr" ||
    lang.startsWith("mr-") ||
    lang.includes("marathi") ||
    lang.includes("konkani")
  ) {
    return MARATHI_PROFILE;
  }

  // Hindi and central/northern Devanagari dialects (Danda primary)
  if (
    lang === "hi" ||
    lang.startsWith("hi-") ||
    lang.includes("hindi") ||
    lang.includes("bhojpuri") ||
    lang.includes("maithili") ||
    lang.includes("sanskrit") ||
    lang.includes("chhattisgarhi") ||
    lang.includes("awadhi") ||
    lang.includes("braj")
  ) {
    return HINDI_PROFILE;
  }

  // Odia (Danda primary, Double Danda traditional)
  if (
    lang === "or" ||
    lang.startsWith("or-") ||
    lang === "od" ||
    lang.startsWith("od-") ||
    lang.includes("odia") ||
    lang.includes("oriya") ||
    lang.includes("sambalpuri") ||
    lang.includes("koshali")
  ) {
    return ODIA_PROFILE;
  }

  // Bengali and eastern Nagari scripts
  if (
    lang === "bn" ||
    lang.startsWith("bn-") ||
    lang.includes("bengali") ||
    lang.includes("bangla") ||
    lang.includes("assamese")
  ) {
    return BENGALI_PROFILE;
  }

  // Gujarati
  if (lang === "gu" || lang.startsWith("gu-") || lang.includes("gujarati")) {
    return GUJARATI_PROFILE;
  }

  // Punjabi (Gurmukhi)
  if (
    lang === "pa" ||
    lang.startsWith("pa-") ||
    lang.includes("punjabi") ||
    lang.includes("gurmukhi")
  ) {
    return PUNJABI_PROFILE;
  }

  // Tamil (Dravidian, Period primary, no Danda)
  if (lang === "ta" || lang.startsWith("ta-") || lang.includes("tamil")) {
    return TAMIL_PROFILE;
  }

  // Telugu
  if (lang === "te" || lang.startsWith("te-") || lang.includes("telugu")) {
    return TELUGU_PROFILE;
  }

  // Kannada
  if (lang === "kn" || lang.startsWith("kn-") || lang.includes("kannada")) {
    return KANNADA_PROFILE;
  }

  // Malayalam
  if (lang === "ml" || lang.startsWith("ml-") || lang.includes("malayalam")) {
    return MALAYALAM_PROFILE;
  }

  // English
  if (lang === "en" || lang.startsWith("en-") || lang.includes("english")) {
    return ENGLISH_PROFILE;
  }

  // Fallback for custom or unknown languages
  return {
    ...UNIVERSAL_PROFILE,
    languageKey: raw,
    displayName: `${raw} (Universal Profile)`,
    isFallback: true,
    recommendationNotes: "Universal punctuation recommendation",
  };
}

// =============================================================================
// SMART PUNCTUATION INSERTION
// =============================================================================

export interface InsertionResult {
  nextText: string;
  nextCursorPos: number;
}

/**
 * Inserts a punctuation mark or enclosing pair into text at the cursor/selection position.
 * Respects existing selection, smart spacing after sentence stops and commas,
 * and maintains cursor inside quotes/parentheses when inserting an empty pair.
 */
export function applyPunctuationMark(
  currentText: string,
  item: PunctuationMarkItem,
  selectionStart: number,
  selectionEnd: number
): InsertionResult {
  const start = Math.max(0, Math.min(selectionStart, currentText.length));
  const end = Math.max(start, Math.min(selectionEnd, currentText.length));
  const selectedText = currentText.slice(start, end);

  // 1. Handling enclosing pairs (quotes, parentheses, brackets)
  if (item.isEnclosing) {
    let openMark = "“";
    let closeMark = "”";

    if (item.id === "singleQuotes") {
      openMark = "‘";
      closeMark = "’";
    } else if (item.id === "parentheses") {
      openMark = "(";
      closeMark = ")";
    } else if (item.id === "squareBrackets") {
      openMark = "[";
      closeMark = "]";
    }

    if (selectedText.length > 0) {
      // Wrap the existing selection
      const wrapped = `${openMark}${selectedText}${closeMark}`;
      const nextText = currentText.slice(0, start) + wrapped + currentText.slice(end);
      return {
        nextText,
        nextCursorPos: start + wrapped.length,
      };
    } else {
      // Insert empty pair and position cursor inside the pair
      const pair = `${openMark}${closeMark}`;
      const nextText = currentText.slice(0, start) + pair + currentText.slice(end);
      return {
        nextText,
        nextCursorPos: start + openMark.length,
      };
    }
  }

  // 2. Handling standard punctuation marks (danda, period, comma, question, etc.)
  let insertion = item.mark;
  const afterChar = currentText[end] || "";
  const standardDelimiters = ["।", "॥", ".", ",", "!", "?", ";", ":"];

  if (standardDelimiters.includes(item.mark)) {
    // If followed by space or newline or end-of-string, do not double-space; otherwise append single space
    if (afterChar !== " " && afterChar !== "\n" && afterChar !== "" && afterChar !== "”" && afterChar !== "’" && afterChar !== ")" && afterChar !== "]") {
      insertion = item.mark + " ";
    }
  }

  const nextText = currentText.slice(0, start) + insertion + currentText.slice(end);
  return {
    nextText,
    nextCursorPos: start + insertion.length,
  };
}

// =============================================================================
// LIVE METRICS CALCULATOR
// =============================================================================

export function calculatePunctuationMetrics(text: string): PunctuationMetrics {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const characters = text.length;

  const dandas = (text.match(/।/g) || []).length;
  const doubleDandas = (text.match(/॥/g) || []).length;
  const periods = (text.match(/\./g) || []).length;
  const totalSentences = dandas + periods;

  const commas = (text.match(/,/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const semicolons = (text.match(/;/g) || []).length;
  const colons = (text.match(/:/g) || []).length;
  const quotes = (text.match(/[“"'‘]/g) || []).length;

  return {
    words,
    characters,
    dandas,
    doubleDandas,
    periods,
    totalSentences,
    commas,
    questions,
    exclamations,
    semicolons,
    colons,
    quotes,
  };
}

/**
 * Devanagari Hindi to Romanized Hindi (Latin Script) Transliteration
 *
 * Provides lightweight, high-fidelity phonetic transliteration of conversational
 * Hindi from native Devanagari script into Latin letters (Romanized Hindi / Hinglish).
 *
 * Characteristics:
 * 1. Preserves the spoken Hindi words and grammar without English translation
 *    (e.g., "मुझे पानी चाहिए" -> "Mujhe paani chahiye", NOT "I want water").
 * 2. Implements standard Hindi phonetics including schwa deletion for unvocalized final consonants.
 * 3. Supports common conjuncts (ज्ञ -> gy, क्ष -> ksh, त्र -> tr, श्र -> shr).
 * 4. Supports nukta characters (ज़ -> z, फ़ -> f, क़ -> q, ख़ -> kh, ग़ -> gh, ड़ -> r).
 * 5. Converts Devanagari punctuation (। / ॥ -> .).
 * 6. Preserves existing English / Latin words, numbers, and symbols untouched.
 * 7. Applies sentence-level initial capitalization for readable UI presentation.
 */

export const COMMON_HINDI_WORDS: Record<string, string> = {
  // Greetings & Politeness
  "नमस्ते": "namaste",
  "नमस्कार": "namaskar",
  "प्रणाम": "pranaam",
  "धन्यवाद": "dhanyavaad",
  "शुक्रिया": "shukriya",
  "कृपया": "kripya",
  "अच्छा": "achha",
  "बहुत": "bahut",
  "ठीक": "theek",

  // Pronouns
  "मैं": "main",
  "मुझे": "mujhe",
  "मुझको": "mujhko",
  "मेरा": "mera",
  "मेरी": "meri",
  "मेरे": "mere",
  "हम": "hum",
  "हमें": "humein",
  "हमारा": "hamara",
  "हमारी": "hamari",
  "हमारे": "hamare",
  "तू": "tu",
  "तुम": "tum",
  "तुम्हें": "tumhein",
  "तुम्हारा": "tumhara",
  "तुम्हारी": "tumhari",
  "तुम्हारे": "tumhare",
  "आप": "aap",
  "आपको": "aapko",
  "आपसे": "aapse",
  "आपका": "aapka",
  "आपकी": "aapki",
  "आपके": "aapke",
  "यह": "yeh",
  "वह": "woh",
  "ये": "ye",
  "वे": "woh",
  "इसे": "ise",
  "उसे": "use",
  "इन": "in",
  "उन": "un",
  "इनका": "inka",
  "उनका": "unka",

  // Question words & Negation
  "क्या": "kya",
  "क्यों": "kyun",
  "कहाँ": "kahan",
  "कब": "kab",
  "कैसे": "kaise",
  "कैसा": "kaisa",
  "कैसी": "kaisi",
  "कौन": "kaun",
  "किस": "kis",
  "किसका": "kiska",
  "कितना": "kitna",
  "कितने": "kitne",
  "कितनी": "kitni",
  "नहीं": "nahin",
  "ना": "naa",
  "मत": "mat",
  "हाँ": "haan",

  // Common Verbs & Auxiliaries
  "है": "hai",
  "हैं": "hain",
  "हो": "ho",
  "हूँ": "hoon",
  "था": "tha",
  "थी": "thi",
  "थे": "the",
  "चाहिए": "chahiye",
  "सकता": "sakta",
  "सकते": "sakte",
  "सकती": "sakti",
  "कर": "kar",
  "करना": "karna",
  "करता": "karta",
  "करते": "karte",
  "करती": "karti",
  "किया": "kiya",
  "किए": "kiye",
  "जाना": "jaana",
  "जाता": "jaata",
  "जाते": "jaate",
  "जाती": "jaati",
  "गया": "gaya",
  "गए": "gaye",
  "गई": "gayi",
  "होना": "hona",
  "होता": "hota",
  "होते": "hote",
  "होती": "hoti",
  "हुआ": "hua",
  "हुए": "hue",
  "हुई": "hui",
  "रहना": "rahna",
  "रहता": "rahta",
  "रहते": "rahte",
  "रहती": "rahti",
  "रहा": "raha",
  "रहे": "rahe",
  "रही": "rahi",
  "देना": "dena",
  "दिया": "diya",
  "लेना": "lena",
  "लिया": "liya",
  "बोलना": "bolna",
  "बोला": "bola",
  "कहना": "kahna",
  "कहा": "kaha",

  // Common Nouns & Adverbs
  "पानी": "paani",
  "घर": "ghar",
  "काम": "kaam",
  "नाम": "naam",
  "बात": "baat",
  "समय": "samay",
  "दिन": "din",
  "रात": "raat",
  "सुबह": "subah",
  "शाम": "shaam",
  "आज": "aaj",
  "कल": "kal",
  "दोस्त": "dost",
  "मित्र": "mitra",
  "लोग": "log",
  "परिवार": "parivaar",
  "किताब": "kitaab",
  "भारत": "bharat",
  "दिल्ली": "dilli",
  "मौसम": "mausam",

  // Connectives & Prepositions
  "और": "aur",
  "लेकिन": "lekin",
  "मगर": "magar",
  "परंतु": "parantu",
  "अगर": "agar",
  "तो": "toh",
  "भी": "bhi",
  "ही": "hi",
  "तक": "tak",
  "से": "se",
  "को": "ko",
  "में": "mein",
  "पर": "par",
  "के": "ke",
  "का": "ka",
  "की": "ki",

  // Numbers in words
  "एक": "ek",
  "दो": "do",
  "तीन": "teen",
  "चार": "chaar",
  "पाँच": "paanch",
  "छह": "chheh",
  "सात": "saat",
  "आठ": "aath",
  "नौ": "nau",
  "दस": "das",
  "बारह": "baarah",
  "हज़ार": "hazaar",
  "लाख": "laakh",
  "करोड़": "crore",
  "रुपये": "rupaye",
  "रुपया": "rupiya",
  "पैसा": "paisa",
  "पैसे": "paise",
};

const VOWELS: Record<string, string> = {
  "\u0905": "a",
  "\u0906": "aa",
  "\u0907": "i",
  "\u0908": "ee",
  "\u0909": "u",
  "\u090A": "oo",
  "\u090B": "ri",
  "\u090E": "e",
  "\u090F": "e",
  "\u0910": "ai",
  "\u0912": "o",
  "\u0913": "o",
  "\u0914": "au",
};

const CONSONANTS: Record<string, string> = {
  "\u0915": "k",
  "\u0916": "kh",
  "\u0917": "g",
  "\u0918": "gh",
  "\u0919": "ng",
  "\u091A": "ch",
  "\u091B": "chh",
  "\u091C": "j",
  "\u091D": "jh",
  "\u091E": "ny",
  "\u091F": "t",
  "\u0920": "th",
  "\u0921": "d",
  "\u0922": "dh",
  "\u0923": "n",
  "\u0924": "t",
  "\u0925": "th",
  "\u0926": "d",
  "\u0927": "dh",
  "\u0928": "n",
  "\u092A": "p",
  "\u092B": "ph",
  "\u092C": "b",
  "\u092D": "bh",
  "\u092E": "m",
  "\u092F": "y",
  "\u0930": "r",
  "\u0932": "l",
  "\u0933": "l",
  "\u0935": "v",
  "\u0936": "sh",
  "\u0937": "sh",
  "\u0938": "s",
  "\u0939": "h",
  // Pre-composed nukta letters
  "\u0958": "q",
  "\u0959": "kh",
  "\u095A": "gh",
  "\u095B": "z",
  "\u095C": "r",
  "\u095D": "rh",
  "\u095E": "f",
  "\u095F": "y",
};

const VIRAMA = "\u094D";
const NUKTA = "\u093C";
const ANUSVARA = "\u0902";
const CANDRABINDU = "\u0901";
const VISARGA = "\u0903";

export function isDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

function isDevanagariChar(c: string): boolean {
  if (!c) return false;
  const code = c.charCodeAt(0);
  return code >= 0x0900 && code <= 0x097F;
}

function transliterateWord(word: string): string {
  if (COMMON_HINDI_WORDS[word]) {
    return COMMON_HINDI_WORDS[word];
  }

  let result = "";
  const len = word.length;

  for (let i = 0; i < len; i++) {
    const c = word[i];
    const next = i + 1 < len ? word[i + 1] : "";
    const nextNext = i + 2 < len ? word[i + 2] : "";

    // Special Hindi conjuncts: ज्ञ (gy), क्ष (ksh), त्र (tr), श्र (shr)
    if (c === "\u091C" && next === VIRAMA && nextNext === "\u091E") {
      result += "gy";
      i += 2;
      const afterConj = i + 1 < len ? word[i + 1] : "";
      if (afterConj === VIRAMA) {
        i++;
      } else if (afterConj && "\u093E\u093F\u0940\u0941\u0942\u0943\u0947\u0948\u094B\u094C".includes(afterConj)) {
        // Matra follows in next iteration
      } else if (i + 1 < len && isDevanagariChar(afterConj)) {
        result += "a";
      }
      continue;
    }

    if (c === "\u0915" && next === VIRAMA && nextNext === "\u0937") {
      result += "ksh";
      i += 2;
      const afterConj = i + 1 < len ? word[i + 1] : "";
      if (afterConj === VIRAMA) {
        i++;
      } else if (afterConj && "\u093E\u093F\u0940\u0941\u0942\u0943\u0947\u0948\u094B\u094C".includes(afterConj)) {
        // Matra follows in next iteration
      } else if (i + 1 < len && isDevanagariChar(afterConj)) {
        result += "a";
      }
      continue;
    }

    if (c === "\u0924" && next === VIRAMA && nextNext === "\u0930") {
      result += "tr";
      i += 2;
      const afterConj = i + 1 < len ? word[i + 1] : "";
      if (afterConj === VIRAMA) {
        i++;
      } else if (afterConj && "\u093E\u093F\u0940\u0941\u0942\u0943\u0947\u0948\u094B\u094C".includes(afterConj)) {
        // Matra follows in next iteration
      } else if (i + 1 < len && isDevanagariChar(afterConj)) {
        result += "a";
      }
      continue;
    }

    if (c === "\u0936" && next === VIRAMA && nextNext === "\u0930") {
      result += "shr";
      i += 2;
      const afterConj = i + 1 < len ? word[i + 1] : "";
      if (afterConj === VIRAMA) {
        i++;
      } else if (afterConj && "\u093E\u093F\u0940\u0941\u0942\u0943\u0947\u0948\u094B\u094C".includes(afterConj)) {
        // Matra follows in next iteration
      } else if (i + 1 < len && isDevanagariChar(afterConj)) {
        result += "a";
      }
      continue;
    }

    // Handle Nukta combination (e.g. क + ़)
    if (CONSONANTS[c] && next === NUKTA) {
      let nuktaConsonant = CONSONANTS[c];
      if (c === "\u0915") nuktaConsonant = "q";
      else if (c === "\u0916") nuktaConsonant = "kh";
      else if (c === "\u0917") nuktaConsonant = "gh";
      else if (c === "\u091C") nuktaConsonant = "z";
      else if (c === "\u0921") nuktaConsonant = "r";
      else if (c === "\u0922") nuktaConsonant = "rh";
      else if (c === "\u092B") nuktaConsonant = "f";

      result += nuktaConsonant;
      i++; // skip nukta

      const afterNukta = i + 1 < len ? word[i + 1] : "";
      if (afterNukta === VIRAMA) {
        i++;
      } else if (afterNukta && "\u093E\u093F\u0940\u0941\u0942\u0943\u0947\u0948\u094B\u094C".includes(afterNukta)) {
        // Matra follows
      } else if (i + 1 < len && isDevanagariChar(afterNukta)) {
        result += "a";
      }
      continue;
    }

    if (VOWELS[c]) {
      result += VOWELS[c];
      continue;
    }

    // Dependent Matras
    if (c === "\u093E") { result += "aa"; continue; }
    if (c === "\u093F") { result += "i"; continue; }
    if (c === "\u0940") {
      result += (i === len - 1 || (i === len - 2 && (word[len - 1] === ANUSVARA || word[len - 1] === CANDRABINDU))) ? "i" : "ee";
      continue;
    }
    if (c === "\u0941") { result += "u"; continue; }
    if (c === "\u0942") { result += "oo"; continue; }
    if (c === "\u0943") { result += "ri"; continue; }
    if (c === "\u0947") { result += "e"; continue; }
    if (c === "\u0948") { result += "ai"; continue; }
    if (c === "\u094B") { result += "o"; continue; }
    if (c === "\u094C") { result += "au"; continue; }

    if (CONSONANTS[c]) {
      result += CONSONANTS[c];

      if (next === VIRAMA) {
        i++; // virama suppresses vowel
      } else if (next && "\u093E\u093F\u0940\u0941\u0942\u0943\u0947\u0948\u094B\u094C".includes(next)) {
        // Matra follows in next iteration
      } else if (next === "" || !isDevanagariChar(next)) {
        // Final consonant: drop inherent 'a' (Schwa deletion)
      } else if (CONSONANTS[next]) {
        // Non-final consonant: check if next consonant has a matra
        if (nextNext && "\u093E\u093F\u0940\u0941\u0942\u0943\u0947\u0948\u094B\u094C".includes(nextNext)) {
          if (i === 0 && len <= 3) {
            result += "a";
          }
        } else {
          result += "a";
        }
      } else {
        result += "a";
      }
      continue;
    }

    if (c === ANUSVARA || c === CANDRABINDU) {
      result += "n";
      continue;
    }

    if (c === VISARGA) {
      result += "h";
      continue;
    }

    // Numerals
    const numMap: Record<string, string> = {
      "\u0966": "0", "\u0967": "1", "\u0968": "2", "\u0969": "3", "\u096A": "4",
      "\u096B": "5", "\u096C": "6", "\u096D": "7", "\u096E": "8", "\u096F": "9",
    };
    if (numMap[c]) {
      result += numMap[c];
      continue;
    }

    if (c === "\u0964" || c === "\u0965") {
      result += ".";
      continue;
    }

    result += c;
  }

  return result;
}

/**
 * Converts Devanagari Hindi text to Romanized Latin script.
 * If text contains no Devanagari characters, returns original text untouched.
 */
export function transliterateDevanagariToLatin(text: string): string {
  if (!text || typeof text !== "string") return "";

  // Check if text contains Devanagari characters
  if (!isDevanagari(text)) {
    return text; // Pure Latin / unchanged
  }

  // Replace Devanagari danda / full stop with standard period
  const processed = text.replace(/[\u0964\u0965]/g, ".");

  const devanagariWordRegex = /[\u0900-\u097F]+/g;
  let lastIndex = 0;
  let out = "";
  let match: RegExpExecArray | null;

  while ((match = devanagariWordRegex.exec(processed)) !== null) {
    out += processed.slice(lastIndex, match.index);
    const devWord = match[0];
    const transliterated = transliterateWord(devWord);
    out += transliterated;
    lastIndex = match.index + devWord.length;
  }
  out += processed.slice(lastIndex);

  // Capitalize sentence beginnings (after . ? ! or at start of text)
  out = out.replace(/(^\s*|[.?!]\s+)([a-z])/g, (_, prefix, letter) => {
    return prefix + letter.toUpperCase();
  });

  return out;
}

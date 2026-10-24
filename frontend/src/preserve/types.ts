export * from "./constants";

export interface StoryForm {
  title: string;
  carrier: string;
  category: string;
  place: string;
  language: string;
  period: string;
  relationship: string;
  story: string;
  email: string;
}

export interface AudioItem {
  kind: 'recorded' | 'uploaded' | 'demo' | 'lost';
  name: string;
  size: number | null;
  duration: number | null;
  url: string | null;
  storage_path?: string;
  bucket?: string;
}

export type TranscriptionStyle = "verbatim" | "transcribe";

export interface ModelTranscript {
  status: 'idle' | 'processing' | 'done' | 'error';
  p: number;
  text?: string;
  model?: string;
  provider?: string;
  language?: string;
  requestedLanguage?: string;
  providerLanguage?: string;
  transcriptionStyle?: TranscriptionStyle;
  format?: string;
  inferenceSeconds?: number;
  durationSeconds?: number;
  error?: string | null;
}

export interface SuggestionChange {
  id: string;
  kind: string;
  risk: 'low' | 'judg';
  from: string;
  to?: string;
  why: string;
  note?: boolean;
}

export interface VocabularyEntry {
  id: string;
  heard: string;
  preferred: string;
  meaning: string;
  language?: string;
  context: string;
  kind?: string;
  pronunciation?: string;
  isSample?: boolean;
}

export interface PunctuationDecision {
  id: string;
  pi: number;
  type: 'paragraph' | 'sentence' | 'comma';
  ins?: string;
  label: string;
}

export interface TranscriptDraftSnapshot {
  id: string;
  label: string;
  text: string;
  at: string;
}

export interface PreserveState {
  stage: number; // 1 to 5
  storyId?: string;
  provenanceId?: string;
  completed: Record<number, boolean>;
  skipped: Record<number, boolean>;
  form: StoryForm;
  audio: AudioItem | null;
  transcriptionStyle?: TranscriptionStyle;
  tx: {
    forAudio: string;
    gnani?: ModelTranscript;
    vaani: ModelTranscript;
    conformer: ModelTranscript;
  };
  enh: {
    status: 'idle' | 'processing' | 'done';
    base: 'vaani' | 'conformer';
    decisions: Record<string, 'accepted' | 'rejected'>;
  };
  ed: {
    text: string;
    loadedFrom: 'gnani' | 'vaani' | 'conformer' | 'enhanced' | 'written' | 'draft' | null;
    baseText: string;
    drafts: TranscriptDraftSnapshot[];
    notice: string;
    undoStack: string[];
  };
  vocab: VocabularyEntry[];
  punct: {
    status: 'idle' | 'processing' | 'done' | 'error';
    decisions: Record<string, 'accepted' | 'rejected'>;
    modelSuggestion?: string | null;
    unpunctuatedDraft?: string | null;
    manual: string | null;
    isModelPunctuated?: boolean;
    error?: string | null;
    done: boolean;
  };
  final: {
    visibility: 'private' | 'family' | 'community' | 'public';
    confirmed: boolean;
    permissionConfirmed: boolean;
    isPreserved: boolean;
    isPreviewPreserved?: boolean;
  };
  isSampleTranscript?: boolean;
}

export const BASE_ODIA_TEXT =
  "ମୋ ଆଈ ପ୍ରତି ଗୁରୁବାର ଖେଚେଡ଼ି ରାନ୍ଧୁଥିଲେ ମୁଗ ଡାଲି ଆଉ ଚାଉଳ ସାଙ୍ଗରେ ଘିଅ ଆଉ ଟିକିଏ ଅଦା ପକାଉଥିଲେ ମାଟି ହାଣ୍ଡିରେ କାଠ ଚୁଲିରେ ରାନ୍ଧୁଥିବାରୁ ତା ବାସ୍ନାରେ ଘରସାରା ମହକି ଉଠୁଥିଲା ପ୍ରଥମେ ଠାକୁରଙ୍କୁ ଭୋଗ ଲଗାଇ ତା ପରେ ସମସ୍ତେ ଏକାଠି ବସି ଖାଉଥିଲୁ";

export const DEMO_TRANSCRIPTS: Record<string, string> = {
  vaani: BASE_ODIA_TEXT.replace("ହାଣ୍ଡିରେ", "ହାଣ୍ଡରେ"),
  conformer: BASE_ODIA_TEXT
    .replace("ଖେଚେଡ଼ି", "ଖିଚୁଡ଼ି")
    .replace("ମୁଗ ଡାଲି", "ମୁଗଡାଲି")
    .replace("ଟିକିଏ", "ଟିକେ")
    .replace("ବାସ୍ନାରେ", "ବାସନାରେ")
    .replace("ଠାକୁରଙ୍କୁ", "ଠାକୁର ଙ୍କୁ"),
};

export const SAMPLE_SUGGESTIONS: Record<string, SuggestionChange[]> = {
  vaani: [
    {
      id: "v1",
      kind: "Spelling",
      risk: "low",
      from: "ହାଣ୍ଡରେ",
      to: "ହାଣ୍ଡିରେ",
      why: "Looks like a missing vowel sign. “ହାଣ୍ଡିରେ” (in the pot) fits the sentence, and the other transcript has it too.",
    },
    {
      id: "v2",
      kind: "Word choice",
      risk: "judg",
      from: "ଠାକୁରଙ୍କୁ",
      to: "ଭଗବାନଙ୍କୁ",
      why: "Swaps a specific, familiar word for a more general one. Many families use “ଠାକୁର” for the deity they offer food to, so this could change what your family means.",
    },
    {
      id: "v3",
      kind: "Note",
      risk: "judg",
      note: true,
      from: "ଖେଚେଡ଼ି",
      why: "Left unchanged. The other model wrote ଖିଚୁଡ଼ି. Both spellings are in use, and which one your family says is for you to decide.",
    },
  ],
  conformer: [
    {
      id: "c1",
      kind: "Spelling",
      risk: "judg",
      from: "ଖିଚୁଡ଼ି",
      to: "ଖେଚେଡ଼ି",
      why: "Switches a food name to the other common spelling. Your family may say it this way on purpose.",
    },
    {
      id: "c2",
      kind: "Spacing",
      risk: "low",
      from: "ମୁଗଡାଲି",
      to: "ମୁଗ ଡାଲି",
      why: "Two words that were written as one.",
    },
    {
      id: "c3",
      kind: "Spelling",
      risk: "low",
      from: "ଟିକେ",
      to: "ଟିକିଏ",
      why: "Another common spelling of “a little”. Offered only for consistency.",
    },
    {
      id: "c4",
      kind: "Spelling",
      risk: "low",
      from: "ବାସନାରେ",
      to: "ବାସ୍ନାରେ",
      why: "“ବାସନା” can also read as “desire”. “ବାସ୍ନା” is the usual spelling when the meaning is smell or aroma.",
    },
    {
      id: "c5",
      kind: "Spacing",
      risk: "low",
      from: "ଠାକୁର ଙ୍କୁ",
      to: "ଠାକୁରଙ୍କୁ",
      why: "An ending that was split away from its word.",
    },
  ],
};

export const INITIAL_SAMPLE_STORY: StoryForm = {
  title: "Grandmother’s Khichdi",
  carrier: "Nirmala Devi",
  category: "Food and recipes",
  place: "Puri, Odisha",
  language: "Odia",
  period: "Passed down for three generations",
  relationship: "It was shared with me by a family member.",
  story:
    "Every Thursday my grandmother, Nirmala Devi, made khechedi in a clay handi over a wood fire. Moong dal, rice, a spoon of ghee and a little ginger — nothing more. The smell reached the whole street. We offered it to Thakura first, and only then did we sit down together to eat.",
  email: "",
};

export const STORY_CATEGORIES = [
  "Family memory",
  "Food and recipes",
  "Festivals and rituals",
  "Folk tales and oral traditions",
  "Art, craft, and traditional skills",
  "Language and expressions",
  "Music and performance",
  "Community history",
  "Nature and traditional knowledge",
  "Other",
];

export interface LanguageOptionItem {
  name: string;
  code: string;
  providerConfigured: boolean;
}

export const LANGUAGE_OPTIONS: LanguageOptionItem[] = [
  { name: "Hindi", code: "hi-IN", providerConfigured: true },
  { name: "Bengali", code: "bn-IN", providerConfigured: true },
  { name: "Gujarati", code: "gu-IN", providerConfigured: true },
  { name: "Kannada", code: "kn-IN", providerConfigured: true },
  { name: "Malayalam", code: "ml-IN", providerConfigured: true },
  { name: "Marathi", code: "mr-IN", providerConfigured: true },
  { name: "Punjabi", code: "pa-IN", providerConfigured: true },
  { name: "Tamil", code: "ta-IN", providerConfigured: true },
  { name: "English (India)", code: "en-IN", providerConfigured: true },
  { name: "Telugu", code: "te-IN", providerConfigured: true },
];

export const STORY_LANGUAGES = [
  "Hindi",
  "Bengali",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Punjabi",
  "Tamil",
  "English (India)",
  "Telugu",
  "Other",
];

export const STORY_RELATIONSHIPS = [
  "I am the storyteller.",
  "It was shared with me by a family member.",
  "It belongs to my community.",
  "I am documenting someone else’s knowledge.",
  "Other",
];

export const INITIAL_SAMPLE_VOCAB: VocabularyEntry[] = [
  {
    id: "sample-vocab-1",
    heard: "ଖେଚେଡ଼ି",
    preferred: "ଖେଚେଡ଼ି",
    meaning: "A fragrant roasted moong dal and rice preparation cooked in earthen pots",
    language: "Odia",
    kind: "Food",
    context: "Prepared at home in Puri on Thursdays; also offered at temple altars",
    pronunciation: "Khe-che-di",
    isSample: true,
  },
  {
    id: "sample-vocab-2",
    heard: "ହାଣ୍ଡିରେ",
    preferred: "ମାଟି ହାଣ୍ଡି",
    meaning: "Traditional unglazed clay cooking pot that lends an earthy flavor and retains heat",
    language: "Odia",
    kind: "Craft",
    context: "Used for temple cooking and heritage recipes across coastal Odisha",
    pronunciation: "Maa-ti Haan-di",
    isSample: true,
  },
  {
    id: "sample-vocab-3",
    heard: "ଠାକୁରଙ୍କୁ",
    preferred: "ଠାକୁର",
    meaning: "Revered household deity or Jagannatha, to whom fresh food (bhoga) is dedicated",
    language: "Odia",
    kind: "Ritual",
    context: "Used affectionately in Odia households for the domestic altar and family deity",
    pronunciation: "Thaa-ku-ra",
    isSample: true,
  },
];

export const STEP_DEFINITIONS = [
  { step: 1, route: "/preserve-your-story", label: "Your Story", num: "01", mark: "YOUR STORY" },
  { step: 2, route: "/preserve-your-story/voice", label: "Your Voice", num: "02", mark: "YOUR VOICE" },
  { step: 3, route: "/preserve-your-story/review", label: "Transcript Review", num: "03", mark: "TRANSCRIPT REVIEW" },
  { step: 4, route: "/preserve-your-story/vocabulary", label: "Cultural Vocabulary", num: "04", mark: "CULTURAL VOCABULARY" },
  { step: 5, route: "/preserve-your-story/punctuation", label: "Punctuation Review", num: "05", mark: "PUNCTUATION REVIEW" },
  { step: 6, route: "/preserve-your-story/final-review", label: "Final Review", num: "06", mark: "FINAL REVIEW" },
];

export const STORAGE_KEY = "virasya_preserve_story_draft_v2";

const assert = require("node:assert/strict");
const fs = require("node:fs");

console.log("=== Verifying GNANI AI Provenance & Manual Punctuation Truthfulness ===");

// 1. Inspect Page5Punctuation.tsx
const p5Content = fs.readFileSync("src/preserve/pages/Page5Punctuation.tsx", "utf8");

// Must display AI punctuation model coming soon status label & note
assert(p5Content.includes("AI PUNCTUATION MODEL COMING SOON"), "Page 5 must display 'AI PUNCTUATION MODEL COMING SOON' status badge");
assert(p5Content.includes("AI punctuation model coming soon"), "Page 5 note must clarify AI punctuation model is coming soon");

// Must NOT contain any fictional punctuation models or calls
assert(!p5Content.includes("Cadence"), "Page 5 must not mention Cadence");
assert(!p5Content.includes("Horizon-Labs"), "Page 5 must not mention Horizon-Labs");
assert(!p5Content.includes("runPunctuationModel"), "Page 5 must not call automated punctuation inference");
assert(!p5Content.includes("punctuateTextOnBackend"), "Page 5 must not call punctuateTextOnBackend");

// Must retain full manual punctuation tools
assert(p5Content.includes("Odia Punctuation Editor"), "Page 5 must include Odia Punctuation Editor");
assert(p5Content.includes("Purna Virama (Danda)"), "Page 5 must provide Danda mark insertion");
assert(p5Content.includes("Double Danda"), "Page 5 must provide Double Danda insertion");
assert(p5Content.includes("Reset to unpunctuated draft"), "Page 5 must support resetting to draft");
assert(p5Content.includes("GNANI AI STT Transcript"), "Page 5 raw transcript section must cite GNANI AI");

// 2. Inspect ExplorePage.tsx
const exploreContent = fs.readFileSync("src/explore/ExplorePage.tsx", "utf8");

// Must have truthful Provenance heading & description
assert(exploreContent.includes("ARCHIVAL PROVENANCE & AUTHENTICITY"), "ExplorePage must render 'ARCHIVAL PROVENANCE & AUTHENTICITY'");
assert(
  exploreContent.includes("Preserved through the GNANI AI transcription pipeline, with storyteller review and cultural context."),
  "ExplorePage must describe GNANI AI pipeline and storyteller review"
);

// Oral Preservation Pipeline must reflect GNANI AI Speech-to-Text
assert(
  exploreContent.includes('detailStory.audio ? "GNANI AI Speech-to-Text" : "Direct Script Preservation"'),
  "Oral preservation pipeline must cite GNANI AI Speech-to-Text"
);

// Punctuation & Editorial Review must reflect manual review with upcoming AI model
assert(exploreContent.includes("Punctuation & Editorial Review"), "ExplorePage must include 'Punctuation & Editorial Review' label");
assert(
  exploreContent.includes("Manual punctuation and transcript review (AI punctuation model coming soon)"),
  "ExplorePage must reflect manual punctuation with upcoming AI model"
);

// Must NOT contain stale claims
assert(!exploreContent.includes("Vaani + IndicConformer"), "ExplorePage must not claim Vaani + IndicConformer");
assert(!exploreContent.includes("Horizon-Labs"), "ExplorePage must not claim Horizon-Labs");
assert(!exploreContent.includes("dual-model verification"), "ExplorePage must not claim dual-model verification");
assert(!exploreContent.includes("Neural Odia Punctuation"), "ExplorePage must not claim Neural Odia Punctuation");
assert(!exploreContent.includes("Cadence"), "ExplorePage must not mention Cadence");

// 3. Inspect Page6FinalReview.tsx
const p6Content = fs.readFileSync("src/preserve/pages/Page6FinalReview.tsx", "utf8");
assert(
  p6Content.includes("Manual punctuation and transcript review (AI punctuation model coming soon)"),
  "Page6FinalReview must reflect manual punctuation and upcoming AI model"
);
assert(!p6Content.includes("Cadence"), "Page6 must not mention Cadence");
assert(!p6Content.includes("Horizon-Labs"), "Page6 must not mention Horizon-Labs");

console.log("PASS: Provenance and punctuation truthfulness verified across all components!");

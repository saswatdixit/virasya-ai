const assert = require("node:assert/strict");
const fs = require("node:fs");

console.log("=== Verifying Preservation Workflow Step Definitions ===");

const typesContent = fs.readFileSync("src/preserve/types.ts", "utf8");

// Verify 6-step definition sequence
assert(typesContent.includes('step: 5, route: "/preserve-your-story/punctuation", label: "Punctuation Review"'), "Step 5 must be Punctuation Review");
assert(typesContent.includes('step: 6, route: "/preserve-your-story/final-review", label: "Final Review"'), "Step 6 must be Final Review");

// Verify StepProgress has 6 steps
const stepProgressContent = fs.readFileSync("src/preserve/components/StepProgress.tsx", "utf8");
assert(stepProgressContent.includes("{currentDef.num} / 06"), "StepProgress rail must show / 06");
assert(stepProgressContent.includes('aria-label="Steps 1 through 6"'), "StepProgress group must be labeled Steps 1 through 6");

// Verify PreserveApp renders Page5Punctuation and Page6FinalReview
const appContent = fs.readFileSync("src/preserve/PreserveApp.tsx", "utf8");
assert(appContent.includes("state.stage === 5 && <Page5Punctuation />"), "PreserveApp must render Page5Punctuation on stage 5");
assert(appContent.includes("state.stage === 6 && <Page6FinalReview />"), "PreserveApp must render Page6FinalReview on stage 6");
assert(appContent.includes("<BackendStatusBanner />"), "PreserveApp must mount BackendStatusBanner");

// Verify Page4Vocabulary button links to Punctuation Review
const vocabContent = fs.readFileSync("src/preserve/pages/Page4Vocabulary.tsx", "utf8");
assert(vocabContent.includes("Continue to Punctuation Review"), "Vocabulary page must continue to Punctuation Review");

// Verify Page5Punctuation features
const punctContent = fs.readFileSync("src/preserve/pages/Page5Punctuation.tsx", "utf8");
assert(punctContent.includes("05 / PUNCTUATION REVIEW"), "Page5Punctuation must have correct eyebrow");
assert(punctContent.includes("Odia Punctuation Editor"), "Page5Punctuation must contain editor");
assert(punctContent.includes("Purna Virama (Danda)"), "Page5Punctuation must provide Danda insertion");
assert(punctContent.includes("goToStep(4)"), "Page5Punctuation must allow navigating back to Vocabulary");
assert(punctContent.includes("goToStep(6)"), "Page5Punctuation must proceed to Final Review (Step 6)");

// Verify Page6FinalReview features
const reviewContent = fs.readFileSync("src/preserve/pages/Page6FinalReview.tsx", "utf8");
assert(reviewContent.includes("06 / FINAL REVIEW & PRESERVATION"), "Page6FinalReview must have correct eyebrow");
assert(reviewContent.includes("goToStep(5)"), "Page6FinalReview back button must navigate to Punctuation Review");
assert(reviewContent.includes("punct.manual !== null"), "Page6FinalReview must display manual punctuated text");

console.log("PASS: Preservation workflow 6-step configuration and Punctuation Review integrity confirmed!");

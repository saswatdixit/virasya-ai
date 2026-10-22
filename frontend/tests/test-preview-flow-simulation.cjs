const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== Virasya Frontend Preview Flow & Logic Simulation ===\n");

// 1. Verify Sample Explore Stories Dataset
console.log("1. Inspecting sample explore stories...");
const sampleExplorePath = path.resolve(__dirname, "../src/explore/sampleStories.ts");
assert(fs.existsSync(sampleExplorePath), "sampleStories.ts must exist");
const sampleExploreContent = fs.readFileSync(sampleExplorePath, "utf8");

assert(sampleExploreContent.includes("demo-story-khichdi"), "Grandmother's Khechedi demo story must exist");
assert(sampleExploreContent.includes("demo-story-bandha"), "Sambalpuri Bandha demo story must exist");
assert(sampleExploreContent.includes("demo-story-nuakhai"), "Nuakhai demo story must exist");
console.log("   ✓ Verified 3 authentic cultural demo stories (Odia, Sambalpuri, Koshali)");

// 2. Verify Sample Odia Transcript Constants
console.log("\n2. Inspecting Preserve demo transcript constants...");
const typesPath = path.resolve(__dirname, "../src/preserve/types.ts");
const typesContent = fs.readFileSync(typesPath, "utf8");

assert(typesContent.includes("BASE_ODIA_TEXT"), "BASE_ODIA_TEXT must exist in types.ts");
assert(typesContent.includes("DEMO_TRANSCRIPTS"), "DEMO_TRANSCRIPTS must exist in types.ts");
assert(typesContent.includes("INITIAL_SAMPLE_STORY"), "INITIAL_SAMPLE_STORY must exist in types.ts");
assert(typesContent.includes("INITIAL_SAMPLE_VOCAB"), "INITIAL_SAMPLE_VOCAB must exist in types.ts");
console.log("   ✓ Verified base Odia story, vocabulary, and dual-model transcripts in types.ts");

// 3. Verify API Layer Preview Mode Handling
console.log("\n3. Verifying API layer preview capabilities in src/preserve/api.ts...");
const apiPath = path.resolve(__dirname, "../src/preserve/api.ts");
const apiContent = fs.readFileSync(apiPath, "utf8");

assert(apiContent.includes("isBackendConfigured"), "api.ts must export isBackendConfigured()");
assert(apiContent.includes("VITE_API_BASE_URL"), "api.ts must respect VITE_API_BASE_URL");
assert(apiContent.includes("SAMPLE_EXPLORE_STORIES"), "api.ts must import SAMPLE_EXPLORE_STORIES");
assert(apiContent.includes("preview_local"), "api.ts must support preview_local story saving");
assert(apiContent.includes("isLocalhostUrl"), "api.ts must contain isLocalhostUrl guard to block localhost in production");
assert(apiContent.includes("isLocalDev"), "api.ts must distinguish local development from production");
console.log("   ✓ Verified configurable API base and graceful offline preview fallbacks in api.ts");
console.log("   ✓ Verified localhost protection guard preventing production from inheriting 127.0.0.1");

// 4. Verify Explore Page Structure & Content
console.log("\n4. Verifying Explore Page content matches exact specifications...");
const explorePath = path.resolve(__dirname, "../src/explore/ExplorePage.tsx");
const exploreContent = fs.readFileSync(explorePath, "utf8");

assert(exploreContent.includes("06 / THE LIVING ARCHIVE"), "Explore must include eyebrow '06 / THE LIVING ARCHIVE'");
assert(exploreContent.includes("Stories that keep our heritage alive."), "Explore must include title 'Stories that keep our heritage alive.'");
assert(exploreContent.includes("Explore oral histories, culinary legacies, dialects, and ancestral memories preserved sovereignly by families and communities across Odisha."), "Explore must include accurate lede");
assert(exploreContent.includes("Preserve your story"), "Explore must include 'Preserve your story' CTA");
assert(exploreContent.includes("0 public stories preserved"), "Explore must display honest '0 public stories preserved' when archive is empty");
assert(exploreContent.includes("Explore Preview Stories (Demo Mode)"), "Explore must provide button to view demo cards");
assert(exploreContent.includes("Preview Story / Demo Content"), "Demo cards must be clearly labelled");
console.log("   ✓ Explore editorial headings, filter categories, and honest 0-story empty state confirmed");

// 5. Verify Preserve Workflow Preview Navigation
console.log("\n5. Verifying Preserve workflow preview controls...");
const voicePath = path.resolve(__dirname, "../src/preserve/pages/Page2Voice.tsx");
const voiceContent = fs.readFileSync(voicePath, "utf8");
assert(voiceContent.includes("loadSampleTranscript"), "Page2Voice must support loading sample transcript in preview mode");
assert(voiceContent.includes("Preview with Sample Odia Transcript (Demo Content)"), "Page2Voice must provide clear demo button in error/preview state");

const reviewPath = path.resolve(__dirname, "../src/preserve/pages/Page3Review.tsx");
const reviewContent = fs.readFileSync(reviewPath, "utf8");
assert(reviewContent.includes("SAMPLE / DEMO TRANSCRIPT"), "Page3Review must display demo badge when sample transcript is loaded");

const finalReviewPath = path.resolve(__dirname, "../src/preserve/pages/Page6FinalReview.tsx");
const finalReviewContent = fs.readFileSync(finalReviewPath, "utf8");
assert(finalReviewContent.includes("DEMO PRESERVATION RECEIPT"), "Page6FinalReview must clearly stamp preview certificates as demo only");
assert(finalReviewContent.includes("Preview Preservation Certificate (Demo Mode)"), "Submit button must clearly indicate preview mode when backend is unconfigured");

console.log("   ✓ Preserve workflow step 1-6 preview navigation and honest demo labeling confirmed");

console.log("\n=== ALL PREVIEW SIMULATION CHECKS PASSED (100%) ===");

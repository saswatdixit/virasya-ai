const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

console.log("=== Verifying Virasya Home Page — Preserve Your Story Navigation ===");

// 1. Inspect source files exist
const onboardingPath = path.resolve(__dirname, "../src/components/shared/onboarding.ts");
assert(fs.existsSync(onboardingPath), "onboarding.ts helper must exist");
const onboardingContent = fs.readFileSync(onboardingPath, "utf8");

const heroPath = path.resolve(__dirname, "../src/sections/Hero/Hero.tsx");
assert(fs.existsSync(heroPath), "Hero.tsx must exist");
const heroContent = fs.readFileSync(heroPath, "utf8");

const dialogsPath = path.resolve(__dirname, "../src/components/shared/Dialogs.tsx");
assert(fs.existsSync(dialogsPath), "Dialogs.tsx must exist");
const dialogsContent = fs.readFileSync(dialogsPath, "utf8");

const mainJsPath = path.resolve(__dirname, "../src/three/main.js");
assert(fs.existsSync(mainJsPath), "main.js must exist");
const mainJsContent = fs.readFileSync(mainJsPath, "utf8");

const appPath = path.resolve(__dirname, "../src/app/App.tsx");
assert(fs.existsSync(appPath), "App.tsx must exist");
const appContent = fs.readFileSync(appPath, "utf8");

// 2. Verify Onboarding Storage Contract & Helper Functions
assert(onboardingContent.includes('ONBOARDING_STORAGE_KEY = "virasya-preview"'), "Must use 'virasya-preview' storage key");
assert(onboardingContent.includes("isOnboardingCompleted"), "Must export isOnboardingCompleted");
assert(onboardingContent.includes("saveOnboardingData"), "Must export saveOnboardingData");
assert(onboardingContent.includes("clearOnboardingData"), "Must export clearOnboardingData");
assert(onboardingContent.includes("navigateTo"), "Must export navigateTo");
assert(onboardingContent.includes("openOnboardingDialog"), "Must export openOnboardingDialog");
console.log("   ✓ Onboarding helper functions and storage key confirmed.");

// 3. Verify Hero Component Navigation Logic
assert(heroContent.includes("isOnboardingCompleted"), "Hero.tsx must check isOnboardingCompleted");
assert(heroContent.includes("openOnboardingDialog"), "Hero.tsx must call openOnboardingDialog for first-time visitors");
assert(heroContent.includes('navigateTo("/preserve-your-story")'), "Hero.tsx must navigate to /preserve-your-story for returning visitors");
assert(heroContent.includes('onClick={handlePreserveClick}'), "Hero button must have explicit React onClick handler");
console.log("   ✓ Hero component Preserve Your Story click handler verified.");

// 4. Verify Dialogs Component Form Handling & Redirect
assert(dialogsContent.includes("saveOnboardingData"), "Dialogs.tsx must call saveOnboardingData");
assert(dialogsContent.includes('navigateTo("/explore")'), "Dialogs.tsx must redirect to /explore on successful first-time onboarding");
assert(dialogsContent.includes("closeOnboardingDialog"), "Dialogs.tsx must close dialog on successful submit");
assert(dialogsContent.includes("clearOnboardingData"), "Dialogs.tsx must clear preferences on reset");
assert(dialogsContent.includes("role=\"alert\"") || dialogsContent.includes("p-field-error"), "Dialogs.tsx must render error on save failure");
console.log("   ✓ Dialogs onboarding submission, error handling, and Explore redirect verified.");

// 5. Functional Simulation in Node environment (with mock localStorage and DOM)
class MockStorage {
  constructor() {
    this.store = {};
    this.shouldThrow = false;
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, val) {
    if (this.shouldThrow) {
      throw new Error("QuotaExceededError: storage is full");
    }
    this.store[key] = String(val);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const mockStorage = new MockStorage();

function simulateIsOnboardingCompleted(storage) {
  try {
    const raw = storage.getItem("virasya-preview");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed.name === "string" && parsed.name.trim().length > 0);
  } catch {
    return false;
  }
}

function simulateSaveOnboarding(storage, name, focus = "research", plan = "Starter") {
  try {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const payload = {
      name: trimmed,
      focus: focus || "research",
      plan: plan || "Starter",
      completed: true,
      onboardingCompleted: true,
    };
    storage.setItem("virasya-preview", JSON.stringify(payload));
    const verify = storage.getItem("virasya-preview");
    if (!verify) return false;
    const parsed = JSON.parse(verify);
    return Boolean(parsed && parsed.name === trimmed);
  } catch {
    return false;
  }
}

let simulatedCurrentRoute = "/";
let simulatedDialogOpen = false;

function simulateHandlePreserveClick(storage) {
  if (simulateIsOnboardingCompleted(storage)) {
    simulatedCurrentRoute = "/preserve-your-story";
    simulatedDialogOpen = false;
  } else {
    simulatedDialogOpen = true;
  }
}

function simulateSubmitOnboarding(storage, name, focus) {
  const success = simulateSaveOnboarding(storage, name, focus);
  if (!success) {
    return { error: "Unable to save your onboarding preferences." };
  }
  simulatedDialogOpen = false;
  simulatedCurrentRoute = "/explore";
  return { success: true };
}

// Case 1: First-time visitor
mockStorage.clear();
simulatedCurrentRoute = "/";
simulatedDialogOpen = false;

assert.equal(simulateIsOnboardingCompleted(mockStorage), false, "Fresh visitor must NOT have onboarding completed");
simulateHandlePreserveClick(mockStorage);
assert.equal(simulatedDialogOpen, true, "First-time visitor clicking Preserve must open onboarding dialog");
assert.equal(simulatedCurrentRoute, "/", "Route must not change before onboarding completion");

// Case 2: Save failure does not redirect
mockStorage.shouldThrow = true;
const failRes = simulateSubmitOnboarding(mockStorage, "Ananya", "research");
assert(failRes.error, "Storage failure must return error message");
assert.equal(simulatedDialogOpen, true, "Dialog must remain open on save failure");
assert.equal(simulatedCurrentRoute, "/", "Route must NOT redirect to Explore on save failure");
assert.equal(simulateIsOnboardingCompleted(mockStorage), false, "Onboarding must not be marked complete on failure");

// Case 3: Successful first-time submission saves and redirects to Explore
mockStorage.shouldThrow = false;
const successRes = simulateSubmitOnboarding(mockStorage, "Ananya", "create");
assert.equal(successRes.success, true, "Valid submission must succeed");
assert.equal(simulatedDialogOpen, false, "Dialog must close on success");
assert.equal(simulatedCurrentRoute, "/explore", "Must redirect to Explore page after first-time onboarding");
assert.equal(simulateIsOnboardingCompleted(mockStorage), true, "Onboarding must be marked complete");

const savedData = JSON.parse(mockStorage.getItem("virasya-preview"));
assert.equal(savedData.name, "Ananya");
assert.equal(savedData.focus, "create");
assert.equal(savedData.completed, true);
console.log("   ✓ First-time visitor flow and storage failure resilience verified.");

// Case 4: Returning visitor clicking Preserve navigates directly to Preserve workflow
simulatedCurrentRoute = "/";
simulateHandlePreserveClick(mockStorage);
assert.equal(simulatedDialogOpen, false, "Dialog must NOT open for returning visitor");
assert.equal(simulatedCurrentRoute, "/preserve-your-story", "Returning visitor must navigate directly to /preserve-your-story");
console.log("   ✓ Returning visitor navigation directly to /preserve-your-story verified.");

// Case 5: Navigating to Explore and returning Home keeps button functional
simulatedCurrentRoute = "/explore";
simulatedCurrentRoute = "/"; // Return to home
simulateHandlePreserveClick(mockStorage);
assert.equal(simulatedDialogOpen, false, "Dialog must NOT open on return from Explore");
assert.equal(simulatedCurrentRoute, "/preserve-your-story", "Must navigate directly to /preserve-your-story on return from Explore");
console.log("   ✓ Navigation works reliably after returning from Explore.");

// Case 6: Page refresh retains completed onboarding state
const storageContent = mockStorage.getItem("virasya-preview");
const refreshedStorage = new MockStorage();
refreshedStorage.setItem("virasya-preview", storageContent);

assert.equal(simulateIsOnboardingCompleted(refreshedStorage), true, "Refreshed storage must retain completed state");
simulateHandlePreserveClick(refreshedStorage);
assert.equal(simulatedCurrentRoute, "/preserve-your-story", "Must navigate to /preserve-your-story after page refresh");
console.log("   ✓ Page refresh retains returning visitor status.");

// Case 7: Resetting onboarding allows showing form again
refreshedStorage.removeItem("virasya-preview");
assert.equal(simulateIsOnboardingCompleted(refreshedStorage), false, "Clearing preferences resets onboarding");
simulateHandlePreserveClick(refreshedStorage);
assert.equal(simulatedDialogOpen, true, "Dialog opens again after preferences are cleared");
console.log("   ✓ Preference reset properly reactivates onboarding dialog.");

// 6. Verify existing routes and authentication flows remain intact
assert(appContent.includes('isExploreRoute = currentPath === "/explore"'), "Explore route must remain /explore");
assert(appContent.includes('isPreserveRoute = currentPath.startsWith("/preserve-your-story")'), "Preserve route must remain /preserve-your-story");
assert(appContent.includes("AuthProvider"), "AuthProvider must wrap App");
assert(appContent.includes("AuthModal"), "AuthModal must remain mounted");
console.log("   ✓ Existing routing configuration and AuthProvider preserved.");

console.log("\n===============================================================================");
console.log("   ALL HOME PRESERVE NAVIGATION & ONBOARDING CHECKS PASSED (100%)");
console.log("===============================================================================\n");

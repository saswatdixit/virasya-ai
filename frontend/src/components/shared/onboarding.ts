/**
 * Virasya Onboarding & Home Navigation Helpers
 *
 * Handles first-time vs returning visitor onboarding state and navigation.
 */

export const ONBOARDING_STORAGE_KEY = "virasya-preview";

export interface OnboardingData {
  name: string;
  focus: string;
  plan?: string;
  completed?: boolean;
  onboardingCompleted?: boolean;
}

/**
 * Retrieves the saved onboarding data from localStorage.
 */
export function getOnboardingData(): OnboardingData | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string" && parsed.name.trim().length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Checks whether the visitor has already completed the first-time onboarding.
 */
export function isOnboardingCompleted(): boolean {
  const data = getOnboardingData();
  return Boolean(data && data.name && data.name.trim().length > 0);
}

/**
 * Saves onboarding data to localStorage.
 * Returns true if successfully saved and verified, false otherwise.
 */
export function saveOnboardingData(
  name: string,
  focus: string = "research",
  plan: string = "Starter"
): boolean {
  try {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const payload: OnboardingData = {
      name: trimmed,
      focus: focus || "research",
      plan: plan || "Starter",
      completed: true,
      onboardingCompleted: true,
    };
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload));
    const verify = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!verify) return false;
    const parsed = JSON.parse(verify);
    return Boolean(parsed && parsed.name === trimmed);
  } catch {
    return false;
  }
}

/**
 * Clears the onboarding data from localStorage (e.g. from the About dialog).
 */
export function clearOnboardingData(): void {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {}
}

/**
 * Navigates to a path using client-side SPA routing and dispatches a popstate event.
 */
export function navigateTo(path: string): void {
  const cleanTarget = path.replace(/\/+$/, "") || "/";
  const cleanCurrent = window.location.pathname.replace(/\/+$/, "") || "/";
  if (cleanCurrent !== cleanTarget) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

/**
 * Displays the first-time onboarding setup dialog.
 */
export function openOnboardingDialog(): void {
  const dialog = document.getElementById("start-dialog") as HTMLDialogElement | null;
  if (!dialog) return;

  const setupPane = document.getElementById("setup-pane");
  const successPane = document.getElementById("success-pane");
  if (setupPane) setupPane.hidden = false;
  if (successPane) successPane.hidden = true;

  dialog.setAttribute("aria-labelledby", "dialog-title");
  document.querySelector(".mobile-menu")?.classList.remove("open");
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }
  document.body.classList.add("modal-open");
}

/**
 * Closes the onboarding setup dialog.
 */
export function closeOnboardingDialog(): void {
  const dialog = document.getElementById("start-dialog") as HTMLDialogElement | null;
  if (dialog) {
    if (typeof dialog.close === "function") {
      dialog.close();
    }
    document.body.classList.remove("modal-open");
  }
}

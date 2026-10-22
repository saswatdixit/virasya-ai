import { useEffect } from "react";
import "./preserve.css";
import { PreserveProvider, usePreserve } from "./context/PreserveContext";
import Header from "../components/layout/Header";
import StepProgress from "./components/StepProgress";
import DraftBanner from "./components/DraftBanner";
import BackendStatusBanner from "./components/BackendStatusBanner";
import Page1Story from "./pages/Page1Story";
import Page2Voice from "./pages/Page2Voice";
import Page3Review from "./pages/Page3Review";
import Page4Vocabulary from "./pages/Page4Vocabulary";
import Page5Punctuation from "./pages/Page5Punctuation";
import Page6FinalReview from "./pages/Page6FinalReview";
import { STEP_DEFINITIONS } from "./types";

function PreserveContent() {
  const { state, goToStep } = usePreserve();

  // Listen to path changes and initial path resolution
  useEffect(() => {
    const syncWithRoute = () => {
      const path = window.location.pathname.replace(/\/+$/, "") || "/preserve-your-story";
      const target = STEP_DEFINITIONS.find((s) => s.route === path);
      if (target && target.step !== state.stage) {
        goToStep(target.step);
      }
    };
    syncWithRoute();
  }, [goToStep, state.stage]);

  // Set document title dynamically
  useEffect(() => {
    const cur = STEP_DEFINITIONS.find((s) => s.step === state.stage);
    document.title = state.final.isPreserved
      ? "Virasya — Story Preserved"
      : `Virasya — Preserve Your Story · ${cur ? cur.label : "Preserve"}`;
  }, [state.stage, state.final.isPreserved]);

  return (
    <div className="preserve-experience">
      {/* Homepage Main Navigation Header */}
      <Header placeholder />

      {/* Backend connection status alert if port 5000 is down */}
      <BackendStatusBanner />

      {/* Persistent 6-Step Progress Rail directly below header */}
      {!state.final.isPreserved && <StepProgress />}

      <DraftBanner />

      <main className="preserve-main-wrap" id="main-content">
        {state.stage === 1 && <Page1Story />}
        {state.stage === 2 && <Page2Voice />}
        {state.stage === 3 && <Page3Review />}
        {state.stage === 4 && <Page4Vocabulary />}
        {state.stage === 5 && <Page5Punctuation />}
        {state.stage === 6 && <Page6FinalReview />}
      </main>
    </div>
  );
}

export default function PreserveApp() {
  return (
    <PreserveProvider>
      <PreserveContent />
    </PreserveProvider>
  );
}

import { usePreserve } from "../context/PreserveContext";

export default function DraftBanner() {
  const {
    leaveModalOpen,
    setLeaveModalOpen,
    resetAll,
  } = usePreserve();

  return (
    <>
      {/* Save Draft and Leave Modal */}
      {leaveModalOpen && (
        <div
          className="p-full-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Save draft and leave"
        >
          <div className="p-overlay-content on-terra">
            <div className="p-eyebrow" style={{ color: "var(--v-cream)" }}>
              PRESERVATION DRAFT
            </div>
            <h2 className="p-title" style={{ color: "var(--v-cream)", fontSize: "clamp(36px, 5vw, 64px)" }}>
              Your draft is safely kept.
            </h2>
            <p className="p-lede" style={{ color: "var(--v-cream)", margin: "16px 0 28px" }}>
              Your progress, entered details, transcripts, and vocabulary are stored locally in this browser. When you return to Virasya, you can continue right where you paused.
            </p>
            <div className="p-row">
              <button
                type="button"
                className="p-btn p-btn-cream"
                onClick={() => setLeaveModalOpen(false)}
              >
                Keep editing this story <span className="p-ar">↗</span>
              </button>
              <a
                href="/"
                className="p-btn p-btn-ghost"
                style={{ color: "var(--v-cream)", borderColor: "rgba(244,235,221,0.5)" }}
              >
                Return to homepage
              </a>
              <button
                type="button"
                className="p-btn p-btn-text"
                style={{ color: "var(--v-cream)", marginLeft: "auto" }}
                onClick={() => {
                  if (window.confirm("Are you sure you want to discard this draft?")) {
                    resetAll();
                  }
                }}
              >
                Discard draft
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { usePreserve } from "../context/PreserveContext";

export default function DraftBanner() {
  const {
    resumeDraft,
    cloudDraft,
    cloudDraftUpdatedAt,
    resumeFromSaved,
    dismissResume,
    dismissBanner,
    leaveModalOpen,
    setLeaveModalOpen,
    resetAll,
    isDiscardingDraft,
    discardError,
    clearDiscardError,
  } = usePreserve();

  const hasLocal = Boolean(resumeDraft);
  const hasCloud = Boolean(cloudDraft);
  const hasConflict = hasLocal && hasCloud;

  return (
    <>
      {/* 1. Unfinished Draft Recovery Banner */}
      {(hasLocal || hasCloud) && (
        <section
          className="p-draft-recovery-banner"
          role="region"
          aria-label="Unfinished draft recovery"
        >
          <div className="p-wrap">
            <div className="p-draft-banner-card">
              <div className="p-draft-banner-head">
                <div className="p-draft-badge-row">
                  <span className="p-draft-tag">
                    {hasConflict
                      ? "Draft Conflict Detected"
                      : hasCloud
                      ? "Cloud Draft Available"
                      : "Local Draft Available"}
                  </span>
                  <button
                    type="button"
                    className="p-draft-dismiss-btn"
                    disabled={isDiscardingDraft}
                    onClick={dismissBanner}
                    aria-label="Discard unfinished draft permanently"
                    title={isDiscardingDraft ? "Discarding..." : "Discard draft permanently"}
                  >
                    {isDiscardingDraft ? "…" : "×"}
                  </button>
                </div>
                <h3 className="p-draft-banner-title">
                  {hasConflict
                    ? "Choose which story draft to resume"
                    : hasCloud
                    ? "Resume your cloud story draft?"
                    : "Resume your local story draft?"}
                </h3>
                <p className="p-draft-banner-desc">
                  {hasConflict
                    ? "You have an active draft saved locally in this browser, and another draft in your sovereign cloud archive. Choose which one to continue, or discard both to start fresh."
                    : hasCloud
                    ? "We found an unfinished story draft in your sovereign cloud archive. Continue where you paused across devices."
                    : "We found an unfinished story draft saved in this browser. You can pick up right where you paused."}
                </p>
              </div>

              {/* Actionable Discard Error Alert */}
              {discardError && (
                <div
                  className="p-draft-error-msg"
                  role="alert"
                  style={{
                    marginBottom: "14px",
                    padding: "10px 14px",
                    background: "#FFEBEE",
                    border: "1px solid #FFCDD2",
                    borderRadius: "4px",
                    color: "#C62828",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}
                >
                  <span>
                    <strong>Error discarding draft:</strong> {discardError}
                  </span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="p-btn-text"
                      disabled={isDiscardingDraft}
                      style={{
                        color: "#C62828",
                        fontWeight: 700,
                        cursor: isDiscardingDraft ? "not-allowed" : "pointer",
                        opacity: isDiscardingDraft ? 0.6 : 1,
                        background: "none",
                        border: "none",
                        textDecoration: "underline",
                      }}
                      onClick={() => dismissResume("all")}
                    >
                      {isDiscardingDraft ? "Discarding..." : "Retry Discard"}
                    </button>
                    <button
                      type="button"
                      onClick={clearDiscardError}
                      aria-label="Close error"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#C62828",
                        cursor: "pointer",
                        fontSize: "14px",
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Conflict Options Grid */}
              {hasConflict ? (
                <div className="p-draft-conflict-grid">
                  {/* Local Option */}
                  <div className="p-draft-option-card">
                    <div className="p-draft-option-meta">
                      <span className="p-draft-source-pill local">Local Browser Draft</span>
                      <span className="p-draft-step-num">Step {resumeDraft?.stage} / 06</span>
                    </div>
                    <h4 className="p-draft-option-title">
                      {resumeDraft?.form.title || "Untitled Story"}
                    </h4>
                    <p className="p-draft-option-sub">
                      Storyteller: {resumeDraft?.form.carrier || "Not specified"} &middot;{" "}
                      {resumeDraft?.form.language || "Hindi"}
                    </p>
                    <div className="p-draft-option-actions">
                      <button
                        type="button"
                        className="p-btn p-btn-brass p-draft-action-btn"
                        onClick={() => resumeFromSaved("local")}
                      >
                        Resume Local Draft <span className="p-ar">→</span>
                      </button>
                      <button
                        type="button"
                        className="p-draft-discard-link"
                        disabled={isDiscardingDraft}
                        onClick={() => dismissResume("local")}
                      >
                        Discard local
                      </button>
                    </div>
                  </div>

                  {/* Cloud Option */}
                  <div className="p-draft-option-card">
                    <div className="p-draft-option-meta">
                      <span className="p-draft-source-pill cloud">Sovereign Cloud Draft</span>
                      <span className="p-draft-step-num">Step {cloudDraft?.stage} / 06</span>
                    </div>
                    <h4 className="p-draft-option-title">
                      {cloudDraft?.form.title || "Untitled Story"}
                    </h4>
                    <p className="p-draft-option-sub">
                      Storyteller: {cloudDraft?.form.carrier || "Not specified"} &middot;{" "}
                      {cloudDraft?.form.language || "Hindi"}
                      {cloudDraftUpdatedAt && (
                        <span>
                          {" "}
                          &middot; Updated {new Date(cloudDraftUpdatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                    <div className="p-draft-option-actions">
                      <button
                        type="button"
                        className="p-btn p-btn-brass p-draft-action-btn"
                        onClick={() => resumeFromSaved("cloud")}
                      >
                        Resume Cloud Draft <span className="p-ar">→</span>
                      </button>
                      <button
                        type="button"
                        className="p-draft-discard-link"
                        disabled={isDiscardingDraft}
                        onClick={() => dismissResume("cloud")}
                      >
                        {isDiscardingDraft ? "Discarding..." : "Discard cloud"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Single Draft Actions (Local or Cloud only) */
                <div className="p-draft-single-actions">
                  <div className="p-draft-single-info">
                    <strong>
                      {hasCloud
                        ? cloudDraft?.form.title || "Untitled Story"
                        : resumeDraft?.form.title || "Untitled Story"}
                    </strong>
                    <span>
                      {" "}
                      — Step {hasCloud ? cloudDraft?.stage : resumeDraft?.stage} of 06 (
                      {hasCloud
                        ? `${cloudDraft?.form.language || "Hindi"} · ${
                            cloudDraft?.form.carrier || "Storyteller"
                          }`
                        : `${resumeDraft?.form.language || "Hindi"} · ${
                            resumeDraft?.form.carrier || "Storyteller"
                          }`}
                      )
                    </span>
                  </div>
                  <div className="p-draft-btn-group">
                    <button
                      type="button"
                      className="p-btn p-btn-brass"
                      onClick={() => resumeFromSaved(hasCloud ? "cloud" : "local")}
                    >
                      {hasCloud ? "Resume Cloud Draft" : "Resume Draft"}{" "}
                      <span className="p-ar">→</span>
                    </button>
                    <button
                      type="button"
                      className="p-btn p-btn-ghost"
                      disabled={isDiscardingDraft}
                      onClick={() => dismissResume("all")}
                    >
                      {isDiscardingDraft ? "Discarding..." : "Discard & Start Fresh"}
                    </button>
                  </div>
                </div>
              )}

              {/* Archival Audio Binaries Recovery Notice */}
              <div className="p-draft-audio-disclaimer" role="note">
                <svg
                  className="p-draft-disclaimer-icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <div className="p-draft-disclaimer-text">
                  <strong>Audio persistence notice:</strong> Un-uploaded audio recordings created on another device cannot be restored automatically across browser sessions. If your recovered draft has missing audio, you can easily re-attach or re-record in Step 2.
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2. Save Draft and Leave Modal */}
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
            <h2
              className="p-title"
              style={{ color: "var(--v-cream)", fontSize: "clamp(36px, 5vw, 64px)" }}
            >
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

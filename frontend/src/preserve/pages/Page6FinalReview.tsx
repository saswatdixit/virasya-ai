import { useState, type FormEvent } from "react";
import { usePreserve } from "../context/PreserveContext";
import { wordCount } from "../utils";
import AudioPlayer from "../components/AudioPlayer";
import { isBackendConfigured } from "../api";

export default function Page6FinalReview() {
  const {
    state,
    goToStep,
    setVisibility,
    setFinalConfirmed,
    preserveStoryAction,
    resetAll,
  } = usePreserve();

  const { form, audio, ed, vocab, final, punct } = state;

  const [validationError, setValidationError] = useState("");
  const [isPreserving, setIsPreserving] = useState(false);

  // Carry forward punctuated manual text, or fall back to transcript draft or form story
  const finalText = punct.manual !== null ? punct.manual : (ed.text || form.story || "");
  const finalWordCount = wordCount(finalText);

  const handlePreserve = async (e: FormEvent) => {
    e.preventDefault();
    if (!final.confirmed) {
      setValidationError("Please check the confirmation box below to verify your story before preserving.");
      return;
    }
    setValidationError("");
    setIsPreserving(true);
    try {
      await preserveStoryAction();
    } catch (err: any) {
      setValidationError(err.message || "Failed to preserve story. Please try again.");
    } finally {
      setIsPreserving(false);
    }
  };

  // SUCCESS SCREEN
  if (final.isPreserved) {
    return (
      <div className="p-compact-step">
        <header className="p-compact-header p-success-header">
          <div className="p-wrap">
            <div className="p-header-flex">
              <div>
                <div className="p-eyebrow" style={{ color: "rgba(244, 235, 221, 0.9)" }}>
                  {final.isPreviewPreserved ? "06 / DEMO PRESERVATION RECEIPT (PREVIEW ONLY)" : "06 / PRESERVED IN PERPETUITY"}
                </div>
                <h1 className="p-compact-title" id="page-heading" style={{ color: "var(--v-cream)" }}>
                  {final.isPreviewPreserved ? "Preservation Certificate (Preview Mode)" : "This story has a place to live."}
                </h1>
                <p className="p-compact-lede" style={{ color: "var(--v-cream)" }}>
                  {final.isPreviewPreserved
                    ? "Demonstration of the Virasya provenance certificate and sovereign archival format. Permanent database persistence is not connected to this frontend preview."
                    : "Your cultural memory has been saved sovereignly to the Virasya repository with an immutable provenance record."}
                </p>
              </div>
              <div className="p-header-meta">
                <span className="p-status-pill done" style={{ background: "rgba(244,235,221,0.2)", color: "var(--v-cream)", borderColor: "rgba(244,235,221,0.4)" }}>
                  {final.isPreviewPreserved ? "DEMO RECEIPT (NOT PERSISTED)" : "IMMUTABLE RECORD"}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="p-wrap p-form-workspace">
          <div className="p-card-panel p-success-card">
            <div className="p-panel-header">
              <span className="p-panel-num">✓</span>
              <div>
                <h2 className="p-panel-title">
                  {final.isPreviewPreserved ? "Demo Preservation Certificate" : "Preservation Certificate & Provenance"}
                </h2>
                <p className="p-panel-sub">
                  {final.isPreviewPreserved ? (
                    <span>Preview demonstration &middot; No remote database connected</span>
                  ) : (
                    <>Saved locally at <strong>data/output/stories/</strong></>
                  )}
                </p>
              </div>
            </div>

            <div className="p-success-meta-grid">
              <div className="p-success-meta-item">
                <span className="p-side-label">Story Title</span>
                <strong>{form.title || "Untitled Story"}</strong>
              </div>
              <div className="p-success-meta-item">
                <span className="p-side-label">Storyteller</span>
                <span>{form.carrier || "Not specified"}</span>
              </div>
              <div className="p-success-meta-item">
                <span className="p-side-label">Place of Origin</span>
                <span>{form.place || "Not specified"}</span>
              </div>
              <div className="p-success-meta-item">
                <span className="p-side-label">Language</span>
                <span>{form.language || "Odia"}</span>
              </div>
              <div className="p-success-meta-item">
                <span className="p-side-label">Recorded Word Count</span>
                <span>{finalWordCount} words</span>
              </div>
              <div className="p-success-meta-item">
                <span className="p-side-label">Archived Glossary Terms</span>
                <span>{vocab.length} terms</span>
              </div>
              <div className="p-success-meta-item">
                <span className="p-side-label">Punctuation Review</span>
                <span>{punct.manual !== null ? "Editorial punctuation verified" : "Original oral rhythm preserved"}</span>
              </div>
              <div className="p-success-meta-item">
                <span className="p-side-label">Archive Visibility</span>
                <span style={{ textTransform: "capitalize" }}>{final.visibility}</span>
              </div>
            </div>

            <div className="p-success-excerpt">
              <h3 className="p-side-title" style={{ marginBottom: 8 }}>Preserved Odia Narrative</h3>
              <p className="p-preserved-text">{finalText}</p>
            </div>

            {audio && (
              <div style={{ marginTop: 20 }}>
                <h3 className="p-side-title" style={{ marginBottom: 8 }}>Original Master Audio</h3>
                <AudioPlayer audio={audio} />
              </div>
            )}

            <div className="p-success-actions">
              <a
                href="/explore"
                className="p-btn p-btn-brass"
              >
                View in Explore Archive <span className="p-ar">↗</span>
              </a>

              <a
                href="/"
                className="p-btn p-btn-ghost"
              >
                Return to Homepage
              </a>

              <button
                type="button"
                className="p-btn-text"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  if (window.confirm("Start another preservation? This will start a fresh story workflow.")) {
                    resetAll();
                  }
                }}
              >
                + Preserve another story
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-compact-step">
      {/* Editorial Header */}
      <header className="p-compact-header">
        <div className="p-wrap">
          <div className="p-header-flex">
            <div>
              <div className="p-eyebrow">06 / FINAL REVIEW & PRESERVATION</div>
              <h1 className="p-compact-title" id="page-heading">
                A memory, kept in your words.
              </h1>
              <p className="p-compact-lede">
                Review the storyteller details, punctuated narrative, and archive settings before final sovereign preservation.
              </p>
            </div>
            <div className="p-header-meta">
              <span className="p-status-pill done">READY TO PRESERVE</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="p-wrap p-form-workspace">
        <form onSubmit={handlePreserve}>
          <div className="p-grid-review">
            {/* Column 1: The Final Record */}
            <div className="p-card-panel">
              <div className="p-panel-header">
                <span className="p-panel-num">1</span>
                <div>
                  <h2 className="p-panel-title">The Preservation Record</h2>
                  <p className="p-panel-sub">
                    Everything captured across the 5 previous steps
                  </p>
                </div>
              </div>

              {/* Story Narrative Box */}
              <div className="p-narrative-review-box">
                <div className="p-review-narrative-top">
                  <span className="p-review-narrative-label">Authoritative Odia Narrative</span>
                  <span className="p-small">
                    {finalWordCount} words · {punct.manual !== null ? "Manually punctuated" : "Oral draft"}
                  </span>
                </div>
                <div className="p-review-text" style={{ fontFamily: "'Noto Serif Odia', serif", fontSize: "16px", lineHeight: "1.8" }}>
                  {finalText}
                </div>
              </div>

              {/* Master Audio Box */}
              {audio && (
                <div className="p-final-audio-box">
                  <div className="p-review-narrative-top">
                    <span className="p-review-narrative-label">Master Oral Recording</span>
                    <span className="p-small">Local audio repository</span>
                  </div>
                  <AudioPlayer audio={audio} />
                </div>
              )}

              {/* Preserved Vocabulary Pill List */}
              {vocab.length > 0 && (
                <div className="p-final-vocab-box">
                  <div className="p-review-narrative-top">
                    <span className="p-review-narrative-label">Cultural Glossary ({vocab.length} terms)</span>
                    <button
                      type="button"
                      className="p-btn-text p-btn-sm"
                      onClick={() => goToStep(4)}
                    >
                      Edit glossary
                    </button>
                  </div>
                  <div className="p-vocab-summary-list">
                    {vocab.map((v) => (
                      <div key={v.id} className="p-vocab-summary-item">
                        <strong>{v.preferred}</strong>
                        {v.meaning && <span className="p-small"> — {v.meaning}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Column 2: Metadata & Preservation Settings */}
            <div className="p-card-panel">
              <div className="p-panel-header">
                <span className="p-panel-num">2</span>
                <div>
                  <h2 className="p-panel-title">Archive Settings & Attestation</h2>
                  <p className="p-panel-sub">
                    Choose who can read and verify provenance
                  </p>
                </div>
              </div>

              {/* Story Details Card */}
              <div className="p-side-details-box">
                <div className="p-side-item">
                  <span className="p-side-label">Story Title</span>
                  <strong className="p-side-val">{form.title || "Untitled Story"}</strong>
                </div>
                <div className="p-side-item">
                  <span className="p-side-label">Storyteller</span>
                  <span className="p-side-val">{form.carrier || "Not specified"}</span>
                </div>
                <div className="p-side-item">
                  <span className="p-side-label">Place of Origin</span>
                  <span className="p-side-val">{form.place || "Not specified"}</span>
                </div>
                <div className="p-side-item">
                  <span className="p-side-label">Category</span>
                  <span className="p-side-val">{form.category || "General"}</span>
                </div>
                <div className="p-side-item">
                  <span className="p-side-label">Cultural Period</span>
                  <span className="p-side-val">{form.period || "Traditional"}</span>
                </div>
              </div>

              {/* Archive Visibility Selector */}
              <div className="p-field-group" style={{ marginTop: 24 }}>
                <label className="p-field-label" id="visibility-label">
                  Archive Visibility
                </label>
                <div className="p-radio-options" role="radiogroup" aria-labelledby="visibility-label">
                  <label className={`p-radio-card ${final.visibility === "public" ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="visibility"
                      value="public"
                      checked={final.visibility === "public"}
                      onChange={() => setVisibility("public")}
                      className="p-radio-input"
                    />
                    <div className="p-radio-body">
                      <div className="p-radio-head">
                        <strong className="p-radio-title">Public Heritage Archive</strong>
                        <span className="p-radio-badge">Recommended</span>
                      </div>
                      <p className="p-radio-desc">
                        Available in the Virasya Explore catalog for researchers and future generations.
                      </p>
                    </div>
                  </label>

                  <label className={`p-radio-card ${final.visibility === "community" ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="visibility"
                      value="community"
                      checked={final.visibility === "community"}
                      onChange={() => setVisibility("community")}
                      className="p-radio-input"
                    />
                    <div className="p-radio-body">
                      <strong className="p-radio-title">Community Heritage Only</strong>
                      <p className="p-radio-desc">
                        Visible only within recognized dialect and regional community circles.
                      </p>
                    </div>
                  </label>

                  <label className={`p-radio-card ${final.visibility === "family" ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="visibility"
                      value="family"
                      checked={final.visibility === "family"}
                      onChange={() => setVisibility("family")}
                      className="p-radio-input"
                    />
                    <div className="p-radio-body">
                      <strong className="p-radio-title">Family Circle</strong>
                      <p className="p-radio-desc">
                        Preserved privately with restricted family access tokens.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Confirmation Checkbox */}
              <div className="p-field-group" style={{ marginTop: 20 }}>
                <div className={`p-confirm-box ${final.confirmed ? "is-checked" : ""}`}>
                  <label className="p-confirm-label">
                    <input
                      type="checkbox"
                      checked={final.confirmed}
                      onChange={(e) => setFinalConfirmed(e.target.checked)}
                      className="p-confirm-input"
                    />
                    <span className="p-confirm-text">
                      I confirm this story has been reviewed for authenticity, accuracy of terminology, and respect for the storyteller’s voice.
                    </span>
                  </label>
                </div>

                {validationError && (
                  <p className="p-field-error" role="alert" style={{ marginTop: 10 }}>
                    {validationError}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Persistent Action Bar */}
          <div className="p-bottom-bar">
            <div className="p-bar-left">
              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => goToStep(5)}
              >
                ← Back to Punctuation Review
              </button>
            </div>
            <div className="p-bar-right">
              <button
                type="submit"
                className="p-btn p-btn-brass"
                disabled={isPreserving}
              >
                {isPreserving
                  ? isBackendConfigured()
                    ? "Securing Sovereign Record…"
                    : "Generating Demo Receipt…"
                  : isBackendConfigured()
                  ? "Confirm & Preserve Story Permanently"
                  : "Preview Preservation Certificate (Demo Mode)"}{" "}
                <span className="p-ar">→</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

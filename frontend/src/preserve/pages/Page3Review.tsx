import { useState, useMemo, useEffect } from "react";
import { usePreserve } from "../context/PreserveContext";
import { diffTokens, wordCount } from "../utils";
import AudioPlayer from "../components/AudioPlayer";

export default function Page3Review() {
  const {
    state,
    goToStep,
    retryModel,
    executeTranscription,
    loadSourceIntoEditor,
    updateWorkingText,
    undoWorkingText,
  } = usePreserve();

  const { form, audio, tx, ed } = state;

  const vaaniText = tx.vaani.text || "";
  const conformerText = tx.conformer.text || "";

  const vaaniDone = tx.vaani.status === "done";
  const conformerDone = tx.conformer.status === "done";
  const bothDone = vaaniDone && conformerDone;
  const isTranscribing = tx.vaani.status === "processing" || tx.conformer.status === "processing";

  // Default to the successful model if only one completed
  const [activeModelTab, setActiveModelTab] = useState<"vaani" | "conformer" | "diff">(() => {
    if (!vaaniDone && conformerDone) return "conformer";
    return "vaani";
  });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!vaaniDone && conformerDone && activeModelTab === "vaani") {
      setActiveModelTab("conformer");
    } else if (vaaniDone && !conformerDone && activeModelTab === "conformer") {
      setActiveModelTab("vaani");
    }
  }, [vaaniDone, conformerDone, activeModelTab]);

  // Differences calculation between real ONNX model outputs
  const diffResult = useMemo(() => {
    if (!bothDone || !vaaniText.trim() || !conformerText.trim()) return null;
    return diffTokens(vaaniText.split(/\s+/), conformerText.split(/\s+/));
  }, [bothDone, vaaniText, conformerText]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const currentWorkingText =
    ed.text ||
    (vaaniDone && vaaniText ? vaaniText : conformerDone && conformerText ? conformerText : form.story);

  return (
    <div className="p-compact-step">
      {/* Compact Editorial Header */}
      <header className="p-compact-header">
        <div className="p-wrap">
          <div className="p-header-flex">
            <div>
              <div className="p-eyebrow">03 / TRANSCRIPT REVIEW & VERIFICATION</div>
              <h1 className="p-compact-title" id="page-heading">
                Find the words that carry the memory.
              </h1>
              <p className="p-compact-lede">
                Compare local Vaani and IndicConformer speech recognition outputs and refine your authentic working draft.
              </p>
            </div>
            <div className="p-header-meta">
              <span className={`p-status-pill ${isTranscribing ? "proc" : bothDone ? "done" : "skip"}`}>
                {state.isSampleTranscript
                  ? "SAMPLE / DEMO TRANSCRIPT"
                  : isTranscribing
                  ? "INFERENCE ACTIVE (CPU)"
                  : bothDone
                  ? "REAL ASR COMPLETE"
                  : "ONNX READY"}
              </span>
              {audio && !isTranscribing && !state.isSampleTranscript && (
                <button
                  type="button"
                  className="p-btn p-btn-ghost p-btn-sm"
                  onClick={() => executeTranscription("both")}
                >
                  {bothDone ? "Re-transcribe both" : "Run transcription"}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Audio Bar If Present */}
      {audio && (
        <div className="p-wrap" style={{ marginTop: 14 }}>
          <AudioPlayer audio={audio} sticky />
        </div>
      )}

      {/* 2-Column Review Cockpit */}
      <div className="p-wrap p-form-workspace" style={{ marginTop: 16 }}>
        {state.isSampleTranscript && (
          <div
            role="note"
            style={{
              marginBottom: 14,
              padding: "10px 16px",
              background: "rgba(184, 93, 50, 0.08)",
              border: "1px dashed rgba(184, 93, 50, 0.35)",
              borderRadius: 6,
              fontSize: 13,
              color: "var(--v-ink)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 700, color: "#B85D32", textTransform: "uppercase", fontSize: 11, letterSpacing: "0.05em" }}>
              Preview Mode:
            </span>
            <span>
              This is sample Odia transcription content for previewing the comparison cockpit, cultural vocabulary extraction, and punctuation restoration.
            </span>
          </div>
        )}
        <div className="p-grid-two p-review-grid">
          {/* Column 1: Speech Recognition Model Outputs */}
          <div className="p-card-panel p-model-panel">
            <div className="p-panel-header" style={{ marginBottom: 12 }}>
              <span className="p-panel-num">1</span>
              <div>
                <h2 className="p-panel-title">Raw Model Outputs</h2>
                <p className="p-panel-sub">Local IISc Vaani & AI4Bharat IndicConformer ONNX inference</p>
              </div>
            </div>

            {/* Partial Model Completion Notice */}
            {!bothDone && (vaaniDone || conformerDone) && (
              <div
                role="status"
                style={{
                  marginBottom: 12,
                  padding: "10px 14px",
                  background: "rgba(185, 150, 91, 0.12)",
                  border: "1px solid rgba(185, 150, 91, 0.35)",
                  borderRadius: 4,
                  fontSize: 13,
                  color: "var(--v-ink)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <strong>Partial Model Completion:</strong>{" "}
                  {vaaniDone
                    ? "Vaani completed successfully; IndicConformer encountered an issue."
                    : "IndicConformer completed successfully; Vaani encountered an issue."}{" "}
                  Your successful transcript is active and preserved below.
                </div>
                <button
                  type="button"
                  className="p-btn-text p-btn-sm"
                  style={{ whiteSpace: "nowrap" }}
                  onClick={() => retryModel(vaaniDone ? "conformer" : "vaani")}
                >
                  Retry {vaaniDone ? "IndicConformer" : "Vaani"}
                </button>
              </div>
            )}

            {/* Model Tabs */}
            <div className="p-tabs-segmented" role="tablist" aria-label="Speech recognition models">
              <button
                type="button"
                role="tab"
                aria-selected={activeModelTab === "vaani"}
                className={`p-tab-seg ${activeModelTab === "vaani" ? "is-active" : ""}`}
                onClick={() => setActiveModelTab("vaani")}
              >
                <span>Vaani FastConformer</span>
                <span className={`p-tag-dot ${vaaniDone ? "is-ok" : tx.vaani.status === "processing" ? "is-proc" : tx.vaani.status === "error" ? "is-err" : ""}`} />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeModelTab === "conformer"}
                className={`p-tab-seg ${activeModelTab === "conformer" ? "is-active" : ""}`}
                onClick={() => setActiveModelTab("conformer")}
              >
                <span>IndicConformer</span>
                <span className={`p-tag-dot ${conformerDone ? "is-ok" : tx.conformer.status === "processing" ? "is-proc" : tx.conformer.status === "error" ? "is-err" : ""}`} />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeModelTab === "diff"}
                className={`p-tab-seg ${activeModelTab === "diff" ? "is-active" : ""}`}
                onClick={() => setActiveModelTab("diff")}
                disabled={!bothDone}
                title={!bothDone ? "Both models must finish to view differences" : "Model comparison differences"}
              >
                <span>Differences ({diffResult?.groups.length || 0})</span>
              </button>
            </div>

            {/* Tab 1: Vaani Output */}
            {activeModelTab === "vaani" && (
              <div className="p-model-content">
                {tx.vaani.status === "processing" ? (
                  <div className="p-model-loading">
                    <div className="p-spinner" />
                    <p>Running local Vaani FastConformer ONNX inference on CPU…</p>
                  </div>
                ) : tx.vaani.status === "error" ? (
                  <div className="p-model-error">
                    <strong>Vaani transcription error</strong>
                    <p className="p-small">{tx.vaani.error || "Model encountered an issue running audio inference."}</p>
                    <button
                      type="button"
                      className="p-btn p-btn-ghost p-btn-sm"
                      onClick={() => retryModel("vaani")}
                    >
                      Retry Vaani
                    </button>
                  </div>
                ) : tx.vaani.status === "idle" && !vaaniText ? (
                  <div className="p-model-idle">
                    <p>Vaani FastConformer model ready.</p>
                    {audio && (
                      <button
                        type="button"
                        className="p-btn p-btn-dark p-btn-sm"
                        onClick={() => retryModel("vaani")}
                      >
                        Run Vaani Speech Recognition
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-model-body">
                    <div className="p-odia-scroll-box" lang="or">
                      <p className="p-odia-text" lang="or">
                        {vaaniText || <em style={{ color: "var(--v-muted)" }}>(No speech detected)</em>}
                      </p>
                    </div>

                    <div className="p-model-footer">
                      <span className="p-small">
                        <strong>{wordCount(vaaniText)} words</strong>
                        {tx.vaani.inferenceSeconds ? ` · ${tx.vaani.inferenceSeconds.toFixed(1)}s CPU` : ""}
                      </span>
                      <div className="p-model-actions">
                        <button
                          type="button"
                          className="p-btn p-btn-ghost p-btn-sm"
                          onClick={() => copyToClipboard(vaaniText, "Vaani")}
                          disabled={!vaaniText.trim()}
                        >
                          {copied === "Vaani" ? "Copied ✓" : "Copy"}
                        </button>
                        <button
                          type="button"
                          className="p-btn p-btn-brass p-btn-sm"
                          onClick={() => loadSourceIntoEditor("vaani")}
                          disabled={!vaaniText.trim()}
                        >
                          Use as working base
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: IndicConformer Output */}
            {activeModelTab === "conformer" && (
              <div className="p-model-content">
                {tx.conformer.status === "processing" ? (
                  <div className="p-model-loading">
                    <div className="p-spinner" />
                    <p>Running local IndicConformer ONNX inference on CPU…</p>
                  </div>
                ) : tx.conformer.status === "error" ? (
                  <div className="p-model-error">
                    <strong>IndicConformer transcription error</strong>
                    <p className="p-small">{tx.conformer.error || "Model encountered an issue running audio inference."}</p>
                    <button
                      type="button"
                      className="p-btn p-btn-ghost p-btn-sm"
                      onClick={() => retryModel("conformer")}
                    >
                      Retry IndicConformer
                    </button>
                  </div>
                ) : tx.conformer.status === "idle" && !conformerText ? (
                  <div className="p-model-idle">
                    <p>IndicConformer model ready.</p>
                    {audio && (
                      <button
                        type="button"
                        className="p-btn p-btn-dark p-btn-sm"
                        onClick={() => retryModel("conformer")}
                      >
                        Run IndicConformer
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-model-body">
                    <div className="p-odia-scroll-box" lang="or">
                      <p className="p-odia-text" lang="or">
                        {conformerText || <em style={{ color: "var(--v-muted)" }}>(No speech detected)</em>}
                      </p>
                    </div>

                    <div className="p-model-footer">
                      <span className="p-small">
                        <strong>{wordCount(conformerText)} words</strong>
                        {tx.conformer.inferenceSeconds ? ` · ${tx.conformer.inferenceSeconds.toFixed(1)}s CPU` : ""}
                      </span>
                      <div className="p-model-actions">
                        <button
                          type="button"
                          className="p-btn p-btn-ghost p-btn-sm"
                          onClick={() => copyToClipboard(conformerText, "IndicConformer")}
                          disabled={!conformerText.trim()}
                        >
                          {copied === "IndicConformer" ? "Copied ✓" : "Copy"}
                        </button>
                        <button
                          type="button"
                          className="p-btn p-btn-brass p-btn-sm"
                          onClick={() => loadSourceIntoEditor("conformer")}
                          disabled={!conformerText.trim()}
                        >
                          Use as working base
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Differences View */}
            {activeModelTab === "diff" && (
              <div className="p-model-content">
                {!diffResult || diffResult.groups.length === 0 ? (
                  <div className="p-model-idle">
                    <strong>Both models produced identical transcripts.</strong>
                    <p className="p-small" style={{ marginTop: 4 }}>
                      Zero word divergences detected between Vaani and IndicConformer outputs.
                    </p>
                  </div>
                ) : (
                  <div className="p-diff-viewer">
                    <p className="p-small" style={{ marginBottom: 10 }}>
                      Found {diffResult.groups.length} points of divergence between the two models:
                    </p>
                    <div className="p-diff-list-box">
                      {diffResult.groups.map((grp) => {
                        const aWords = grp.a.map((idx) => vaaniText.split(/\s+/)[idx]).join(" ");
                        const bWords = grp.b.map((idx) => conformerText.split(/\s+/)[idx]).join(" ");
                        return (
                          <div key={grp.id} className="p-diff-row">
                            <span className="p-diff-idx">#{grp.id + 1}</span>
                            <div className="p-diff-comparison">
                              <div>
                                <span className="p-diff-model-tag">Vaani:</span>
                                <span className="p-odia-text sm" lang="or">{aWords || "(absent)"}</span>
                              </div>
                              <div>
                                <span className="p-diff-model-tag">Indic:</span>
                                <span className="p-odia-text sm" lang="or">{bWords || "(absent)"}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Column 2: Working Draft Editor */}
          <div className="p-card-panel p-editor-panel">
            <div className="p-panel-header" style={{ marginBottom: 12 }}>
              <span className="p-panel-num">2</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <h2 className="p-panel-title">Working Draft Editor</h2>
                  <span className="p-status-pill done">
                    {ed.loadedFrom ? `From ${ed.loadedFrom}` : "Human Reviewed"}
                  </span>
                </div>
                <p className="p-panel-sub">
                  Verify and edit your authentic story text with complete editorial authority
                </p>
              </div>
            </div>

            {/* Quick Source Switch Bar */}
            <div className="p-quick-sources">
              <span className="p-small" style={{ fontWeight: 600 }}>Quick load source:</span>
              {vaaniText && (
                <button
                  type="button"
                  className={`p-btn-chip ${ed.loadedFrom === "vaani" ? "is-selected" : ""}`}
                  onClick={() => loadSourceIntoEditor("vaani")}
                >
                  Vaani ({wordCount(vaaniText)}w)
                </button>
              )}
              {conformerText && (
                <button
                  type="button"
                  className={`p-btn-chip ${ed.loadedFrom === "conformer" ? "is-selected" : ""}`}
                  onClick={() => loadSourceIntoEditor("conformer")}
                >
                  IndicConformer ({wordCount(conformerText)}w)
                </button>
              )}
              {form.story.trim() && (
                <button
                  type="button"
                  className={`p-btn-chip ${ed.loadedFrom === "written" ? "is-selected" : ""}`}
                  onClick={() => loadSourceIntoEditor("written")}
                >
                  Written Story ({wordCount(form.story)}w)
                </button>
              )}
            </div>

            {/* Main Textarea */}
            <div className="p-editor-box">
              <textarea
                className="p-area p-odia-area"
                lang="or"
                value={currentWorkingText}
                onChange={(e) => updateWorkingText(e.target.value)}
                placeholder="Select a speech transcript from the left or type your story here in Odia…"
                rows={11}
              />
            </div>

            {/* Editor Toolbar */}
            <div className="p-editor-footer">
              <span className="p-small">
                <strong>{wordCount(currentWorkingText)}</strong> words · {currentWorkingText.length} chars
              </span>
              <div className="p-editor-tools">
                <button
                  type="button"
                  className="p-btn-text p-btn-sm"
                  onClick={undoWorkingText}
                  disabled={ed.undoStack.length < 2}
                  title="Undo previous edit"
                >
                  Undo
                </button>
                {ed.baseText && ed.text !== ed.baseText && (
                  <button
                    type="button"
                    className="p-btn-text p-btn-sm"
                    onClick={() => {
                      if (window.confirm("Reset back to unmodified source?")) {
                        updateWorkingText(ed.baseText);
                      }
                    }}
                  >
                    Reset to source
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Persistent Bottom Bar */}
        <div className="p-bottom-bar">
          <div className="p-bar-left">
            <button
              type="button"
              className="p-btn p-btn-ghost p-btn-sm"
              onClick={() => goToStep(2)}
            >
              ← Back to Voice
            </button>
          </div>
          <div className="p-bar-right">
            <button
              type="button"
              className="p-btn p-btn-brass"
              onClick={() => {
                if (!ed.text) updateWorkingText(currentWorkingText);
                goToStep(4);
              }}
            >
              Continue to Cultural Vocabulary <span className="p-ar">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

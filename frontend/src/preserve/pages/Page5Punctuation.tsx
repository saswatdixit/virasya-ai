import React, { useState, useRef, useEffect } from "react";
import { usePreserve } from "../context/PreserveContext";
import { punctuateTextOnBackend } from "../api";

export default function Page5Punctuation() {
  const {
    state,
    goToStep,
    setManualPunct,
  } = usePreserve();

  // Initial text: carried forward from manual punctuation, working draft, or step 1 story
  const baseWorkingText = state.ed.text || state.form.story || "";
  const currentText = state.punct.manual !== null ? state.punct.manual : baseWorkingText;

  const [text, setText] = useState<string>(() => currentText);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(state.punct.error || null);
  const [isModelPunctuated, setIsModelPunctuated] = useState<boolean>(
    state.punct.isModelPunctuated ?? false
  );
  const [modelSuggestion, setModelSuggestion] = useState<string | null>(
    state.punct.modelSuggestion ?? null
  );
  const unpunctuatedDraft = state.punct.unpunctuatedDraft || baseWorkingText;
  const [showRawTranscripts, setShowRawTranscripts] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasAutoRunRef = useRef(false);

  const runPunctuationModel = React.useCallback(async (sourceText: string) => {
    if (!sourceText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await punctuateTextOnBackend(sourceText);
      if (res.status === "success" && res.punctuated_text) {
        setText(res.punctuated_text);
        setModelSuggestion(res.punctuated_text);
        setIsModelPunctuated(true);
        setManualPunct(res.punctuated_text, {
          modelSuggestion: res.punctuated_text,
          unpunctuatedDraft: sourceText,
          isModelPunctuated: true,
        });
      } else {
        const msg = res.error || res.message || "Punctuation model was unable to restore punctuation.";
        setError(msg);
        setIsModelPunctuated(false);
        setManualPunct(sourceText, {
          modelSuggestion: null,
          unpunctuatedDraft: sourceText,
          isModelPunctuated: false,
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to contact local punctuation model backend.");
      setIsModelPunctuated(false);
    } finally {
      setLoading(false);
    }
  }, [setManualPunct]);

  // Automatic invocation on step mount if never run and draft text exists
  useEffect(() => {
    if (
      !hasAutoRunRef.current &&
      state.punct.manual === null &&
      !state.punct.isModelPunctuated &&
      baseWorkingText.trim()
    ) {
      hasAutoRunRef.current = true;
      runPunctuationModel(baseWorkingText);
    }
  }, [baseWorkingText, state.punct.manual, state.punct.isModelPunctuated, runPunctuationModel]);

  // Handle changes and persist to context
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    setManualPunct(val, {
      modelSuggestion,
      unpunctuatedDraft,
      isModelPunctuated,
    });
  };

  // Quick insertion of Odia punctuation marks at cursor position
  const insertMark = (mark: string) => {
    const el = textareaRef.current;
    if (!el) {
      const next = text + mark;
      setText(next);
      setManualPunct(next, {
        modelSuggestion,
        unpunctuatedDraft,
        isModelPunctuated,
      });
      return;
    }

    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;

    let insertion = mark;
    const afterChar = text[end] || "";
    if (mark === "।" || mark === "॥" || mark === ",") {
      insertion = afterChar === " " ? mark : mark + " ";
    }

    const next = text.slice(0, start) + insertion + text.slice(end);
    setText(next);
    setManualPunct(next, {
      modelSuggestion,
      unpunctuatedDraft,
      isModelPunctuated,
    });

    // Restore cursor position after inserted mark
    setTimeout(() => {
      el.focus();
      const newPos = start + insertion.length;
      el.setSelectionRange(newPos, newPos);
    }, 10);
  };

  const handleRerunModel = () => {
    if (text !== unpunctuatedDraft && text !== modelSuggestion) {
      if (
        !window.confirm(
          "Re-running the neural model will restore punctuation from your draft transcript and replace manual edits. Continue?"
        )
      ) {
        return;
      }
    }
    runPunctuationModel(unpunctuatedDraft || baseWorkingText);
  };

  // Reset to original unpunctuated working draft
  const handleResetToDraft = () => {
    if (window.confirm("Reset transcript to the unpunctuated draft from Step 3?")) {
      const targetText = unpunctuatedDraft || baseWorkingText;
      setText(targetText);
      setIsModelPunctuated(false);
      setManualPunct(targetText, {
        modelSuggestion,
        unpunctuatedDraft: targetText,
        isModelPunctuated: false,
      });
    }
  };

  // Restore model suggestion
  const handleRestoreSuggestion = () => {
    if (modelSuggestion) {
      setText(modelSuggestion);
      setIsModelPunctuated(true);
      setManualPunct(modelSuggestion, {
        modelSuggestion,
        unpunctuatedDraft,
        isModelPunctuated: true,
      });
    }
  };

  const handleProceed = () => {
    setManualPunct(text, {
      modelSuggestion,
      unpunctuatedDraft,
      isModelPunctuated,
    });
    goToStep(6);
  };

  // Live statistics
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const dandaCount = (text.match(/।/g) || []).length;
  const commaCount = (text.match(/,/g) || []).length;
  const questionCount = (text.match(/\?/g) || []).length;

  return (
    <div className="p-compact-step">
      {/* Editorial Header */}
      <header className="p-compact-header">
        <div className="p-wrap">
          <div className="p-header-flex">
            <div>
              <div className="p-eyebrow">05 / PUNCTUATION & CADENCE</div>
              <h1 className="p-compact-title" id="page-heading">
                Restore the breath of the spoken word.
              </h1>
              <p className="p-compact-lede">
                Review pauses, sentence stops (।), and oral cadence for authentic cultural preservation.
              </p>
            </div>
            <div className="p-header-meta">
              <span className={`p-status-pill ${loading ? "proc" : isModelPunctuated ? "done" : "skip"}`}>
                {loading
                  ? "RESTORING CADENCE…"
                  : isModelPunctuated
                  ? "MODEL RESTORED (HORIZON-LABS)"
                  : "MANUAL EDITORIAL REVIEW"}
              </span>
              {!loading && (
                <button
                  type="button"
                  className="p-btn p-btn-ghost p-btn-sm"
                  onClick={handleRerunModel}
                  title="Run neural Odia punctuation model again"
                >
                  ↻ Re-run Punctuation Model
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="p-wrap p-form-workspace">
        {/* Loading State Banner */}
        {loading && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: "rgba(184, 93, 50, 0.08)",
              border: "1px solid rgba(184, 93, 50, 0.3)",
              borderRadius: "6px",
              padding: "14px 18px",
              marginBottom: "20px",
              fontSize: "13.5px",
              color: "var(--v-ink)",
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div className="p-spinner" style={{ width: 22, height: 22, flexShrink: 0 }} />
            <div>
              <strong>Restoring Odia sentence cadence…</strong>
              <div className="p-small" style={{ color: "var(--v-text-sub)", marginTop: 2 }}>
                Running local <code>Horizon-Labs/punctuation-restoration-base</code> neural model with Odia Purna Virama (।) normalization.
              </div>
            </div>
          </div>
        )}

        {/* Error / Fallback Banner */}
        {error && !loading && (
          <div
            role="alert"
            style={{
              background: "rgba(197, 48, 48, 0.08)",
              border: "1px solid rgba(197, 48, 48, 0.35)",
              borderRadius: "6px",
              padding: "14px 18px",
              marginBottom: "20px",
              fontSize: "13.5px",
              color: "var(--v-ink)",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <span style={{ fontSize: 18, color: "var(--v-alert)" }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: "var(--v-alert)" }}>Neural punctuation model notice:</strong>
              <div style={{ margin: "4px 0 10px", fontSize: 13 }}>
                {error}. Your authentic words are completely preserved below. You can use the Odia punctuation palette to punctuate manually without blocking.
              </div>
              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => runPunctuationModel(unpunctuatedDraft || text)}
              >
                ↻ Retry Neural Punctuation
              </button>
            </div>
          </div>
        )}

        {/* Success / Model Attribution Notice */}
        {isModelPunctuated && !loading && !error && (
          <div
            role="note"
            style={{
              background: "#F4EBDD",
              border: "1px solid #E2D3BE",
              borderRadius: "6px",
              padding: "12px 18px",
              marginBottom: "20px",
              fontSize: "13px",
              color: "var(--v-ink, #2B2625)",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontSize: "18px", lineHeight: 1 }} aria-hidden="true">
              ✦
            </span>
            <div style={{ flex: 1 }}>
              <strong>Odia Cadence Restored:</strong> Punctuated via local <code>Horizon-Labs/punctuation-restoration-base</code> model with Odia Purna Virama (<code>।</code>) normalization. You maintain complete editorial control: fine-tune any pause using the palette below, or reset back to the unpunctuated draft anytime.
            </div>
          </div>
        )}

        <div className="p-grid-review">
          {/* Main Workspace: Editor and Quick Palette */}
          <div className="p-card-panel">
            <div className="p-panel-header">
              <span className="p-panel-num">1</span>
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h2 className="p-panel-title">Odia Punctuation Editor</h2>
                  <p className="p-panel-sub">
                    Click punctuation buttons or type directly in Odia script
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {modelSuggestion && text !== modelSuggestion && (
                    <button
                      type="button"
                      className="p-btn-text p-btn-sm"
                      onClick={handleRestoreSuggestion}
                      title="Restore the punctuation suggested by the neural model"
                    >
                      Restore model suggestion
                    </button>
                  )}
                  <button
                    type="button"
                    className="p-btn-text p-btn-sm"
                    onClick={handleResetToDraft}
                    title="Revert to Step 3 unpunctuated draft"
                  >
                    Reset to unpunctuated draft
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Insertion Palette */}
            <div
              className="p-punct-palette"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "8px",
                marginBottom: "14px",
                padding: "8px 12px",
                background: "#FAF6F0",
                borderRadius: "6px",
                border: "1px solid #EADCBA",
              }}
              role="toolbar"
              aria-label="Odia punctuation palette"
            >
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#8C4F00", marginRight: "4px" }}>
                Quick Insert:
              </span>

              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => insertMark("।")}
                title="Purna Virama (Danda) — Sentence stop"
                style={{ fontFamily: "'Noto Serif Odia', serif", fontSize: "16px", minWidth: "36px", padding: "4px 8px" }}
              >
                । <span style={{ fontSize: "10px", marginLeft: "2px", opacity: 0.7 }}>danda</span>
              </button>

              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => insertMark("॥")}
                title="Double Danda — Section or stanza end"
                style={{ fontFamily: "'Noto Serif Odia', serif", fontSize: "16px", minWidth: "36px", padding: "4px 8px" }}
              >
                ॥ <span style={{ fontSize: "10px", marginLeft: "2px", opacity: 0.7 }}>double</span>
              </button>

              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => insertMark(",")}
                title="Koma — Short pause"
                style={{ fontSize: "15px", minWidth: "32px", padding: "4px 8px" }}
              >
                , <span style={{ fontSize: "10px", marginLeft: "2px", opacity: 0.7 }}>pause</span>
              </button>

              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => insertMark("?")}
                title="Prasnabachaka — Question mark"
                style={{ fontSize: "14px", minWidth: "32px", padding: "4px 8px" }}
              >
                ?
              </button>

              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => insertMark("“")}
                title="Opening quote"
                style={{ fontSize: "14px", minWidth: "28px", padding: "4px 8px" }}
              >
                “
              </button>

              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => insertMark("”")}
                title="Closing quote"
                style={{ fontSize: "14px", minWidth: "28px", padding: "4px 8px" }}
              >
                ”
              </button>

              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => insertMark("!")}
                title="Exclamation mark"
                style={{ fontSize: "14px", minWidth: "28px", padding: "4px 8px" }}
              >
                !
              </button>

              <button
                type="button"
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => insertMark("—")}
                title="Em dash"
                style={{ fontSize: "14px", minWidth: "28px", padding: "4px 8px" }}
              >
                —
              </button>
            </div>

            {/* Main Textarea */}
            <div style={{ position: "relative" }}>
              <textarea
                ref={textareaRef}
                className="p-textarea-review"
                value={text}
                onChange={handleTextChange}
                placeholder="Enter or refine your Odia transcript with proper punctuation..."
                rows={10}
                style={{
                  width: "100%",
                  minHeight: "240px",
                  fontSize: "17px",
                  lineHeight: 1.8,
                  padding: "16px",
                  borderRadius: "6px",
                  border: "1px solid #D8C4A9",
                  background: "#FFFDF9",
                  fontFamily: "'Noto Serif Odia', 'Anek Odia', serif",
                  boxSizing: "border-box",
                }}
                aria-label="Punctuated transcript"
              />
            </div>

            {/* Live Metrics Row */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "16px",
                marginTop: "10px",
                fontSize: "12px",
                color: "var(--v-ink-muted, #6B625E)",
              }}
            >
              <span>Words: <strong>{wordCount}</strong></span>
              <span>Characters: <strong>{text.length}</strong></span>
              <span>Sentences (।): <strong>{dandaCount}</strong></span>
              {commaCount > 0 && <span>Pauses (,): <strong>{commaCount}</strong></span>}
              {questionCount > 0 && <span>Questions (?): <strong>{questionCount}</strong></span>}
            </div>
          </div>

          {/* Right Column: Cultural Context & Terminology Reference */}
          <div className="p-card-panel p-side-info">
            <h3 className="p-side-title">Story Overview</h3>
            <div className="p-side-item">
              <span className="p-side-label">Title</span>
              <strong className="p-side-val">{state.form.title || "Untitled story"}</strong>
            </div>
            <div className="p-side-item">
              <span className="p-side-label">Storyteller</span>
              <span className="p-side-val">{state.form.carrier || "Not specified"}</span>
            </div>
            <div className="p-side-item">
              <span className="p-side-label">Language / Dialect</span>
              <span className="p-side-val">{state.form.language || "Odia"}</span>
            </div>

            {/* Carried Vocabulary Highlights */}
            {state.vocab.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <span className="p-side-label">Carried Cultural Glossary ({state.vocab.length})</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                  {state.vocab.map((term) => (
                    <span
                      key={term.id}
                      style={{
                        background: "#EBE3D5",
                        color: "#3D342E",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                      title={term.meaning || term.preferred}
                    >
                      {term.preferred}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Raw Transcripts Accordion */}
            <div style={{ marginTop: "20px" }}>
              <button
                type="button"
                className="p-btn-text p-btn-sm"
                onClick={() => setShowRawTranscripts((prev) => !prev)}
                style={{ padding: 0, textDecoration: "underline" }}
              >
                {showRawTranscripts ? "▲ Hide Raw ASR Transcripts" : "▼ Cross-reference Raw ASR Transcripts"}
              </button>

              {showRawTranscripts && (
                <div style={{ marginTop: "10px", fontSize: "12px", lineHeight: 1.6, background: "#FAF6F0", padding: "10px", borderRadius: "6px" }}>
                  {state.tx.vaani.text && (
                    <div style={{ marginBottom: "8px" }}>
                      <strong style={{ color: "#B85D32" }}>Vaani (FastConformer):</strong>
                      <p style={{ margin: "2px 0 0", color: "#4A403A" }}>{state.tx.vaani.text}</p>
                    </div>
                  )}
                  {state.tx.conformer.text && (
                    <div>
                      <strong style={{ color: "#7A6843" }}>IndicConformer:</strong>
                      <p style={{ margin: "2px 0 0", color: "#4A403A" }}>{state.tx.conformer.text}</p>
                    </div>
                  )}
                  {!state.tx.vaani.text && !state.tx.conformer.text && (
                    <p style={{ margin: 0, color: "#888" }}>No raw model audio transcripts captured for this story.</p>
                  )}
                </div>
              )}
            </div>

            <div className="p-side-note" style={{ marginTop: "20px" }}>
              Punctuation edits here form the authoritative text preserved for future generations and the Explore catalog.
            </div>
          </div>
        </div>

        {/* Persistent Bottom Bar */}
        <div className="p-bottom-bar">
          <div className="p-bar-left">
            <button
              type="button"
              className="p-btn p-btn-ghost p-btn-sm"
              onClick={() => goToStep(4)}
            >
              ← Back to Cultural Vocabulary
            </button>
          </div>
          <div className="p-bar-right">
            <button
              type="button"
              className="p-btn p-btn-brass"
              onClick={handleProceed}
            >
              Continue to Final Review <span className="p-ar">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

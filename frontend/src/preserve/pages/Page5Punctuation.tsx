import React, { useState, useRef } from "react";
import { usePreserve } from "../context/PreserveContext";

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
  const unpunctuatedDraft = state.punct.unpunctuatedDraft || baseWorkingText;
  const [showRawTranscripts, setShowRawTranscripts] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Handle changes and persist to context
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    setManualPunct(val, {
      modelSuggestion: null,
      unpunctuatedDraft,
      isModelPunctuated: false,
    });
  };

  // Quick insertion of Odia punctuation marks at cursor position
  const insertMark = (mark: string) => {
    const el = textareaRef.current;
    if (!el) {
      const next = text + mark;
      setText(next);
      setManualPunct(next, {
        modelSuggestion: null,
        unpunctuatedDraft,
        isModelPunctuated: false,
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
      modelSuggestion: null,
      unpunctuatedDraft,
      isModelPunctuated: false,
    });

    // Restore cursor position after inserted mark
    setTimeout(() => {
      el.focus();
      const newPos = start + insertion.length;
      el.setSelectionRange(newPos, newPos);
    }, 10);
  };

  // Reset to original unpunctuated working draft
  const handleResetToDraft = () => {
    if (window.confirm("Reset transcript to the unpunctuated draft from Step 3?")) {
      const targetText = unpunctuatedDraft || baseWorkingText;
      setText(targetText);
      setManualPunct(targetText, {
        modelSuggestion: null,
        unpunctuatedDraft: targetText,
        isModelPunctuated: false,
      });
    }
  };

  const handleProceed = () => {
    setManualPunct(text, {
      modelSuggestion: null,
      unpunctuatedDraft,
      isModelPunctuated: false,
    });
    goToStep(6);
  };

  // Live statistics
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const dandaCount = (text.match(/।/g) || []).length;
  const commaCount = (text.match(/,/g) || []).length;
  const questionCount = (text.match(/\?/g) || []).length;

  const rawGnaniText = state.tx.gnani?.text || state.tx.vaani?.text || "";

  return (
    <div className="p-compact-step">
      {/* Editorial Header */}
      <header className="p-compact-header">
        <div className="p-wrap">
          <div className="p-header-flex">
            <div>
              <div className="p-eyebrow">05 / PUNCTUATION REVIEW</div>
              <h1 className="p-compact-title" id="page-heading">
                Restore the breath of the spoken word.
              </h1>
              <p className="p-compact-lede">
                Review pauses, sentence stops (।), and oral rhythm for authentic cultural preservation.
              </p>
            </div>
            <div className="p-header-meta">
              <span className="p-status-pill skip">
                AI PUNCTUATION MODEL COMING SOON
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="p-wrap p-form-workspace">
        {/* Subtle information note on manual punctuation & upcoming AI model */}
        <div
          role="note"
          style={{
            background: "rgba(184, 93, 50, 0.08)",
            border: "1px solid rgba(184, 93, 50, 0.25)",
            borderRadius: "6px",
            padding: "12px 18px",
            marginBottom: "20px",
            fontSize: "13px",
            color: "var(--v-ink, #2B2625)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }} aria-hidden="true">
            ✦
          </span>
          <div>
            <strong>Manual Punctuation Review:</strong> AI punctuation model coming soon. You have complete editorial control to refine sentence stops (।) and pauses using the Odia punctuation palette or by typing directly in the editor below.
          </div>
        </div>

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
            {rawGnaniText && (
              <div style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  className="p-btn-text p-btn-sm"
                  onClick={() => setShowRawTranscripts((prev) => !prev)}
                  style={{ padding: 0, textDecoration: "underline" }}
                >
                  {showRawTranscripts ? "▲ Hide Raw ASR Transcript" : "▼ Cross-reference Raw ASR Transcript"}
                </button>

                {showRawTranscripts && (
                  <div style={{ marginTop: "10px", fontSize: "12px", lineHeight: 1.6, background: "#FAF6F0", padding: "10px", borderRadius: "6px" }}>
                    <div>
                      <strong style={{ color: "var(--v-terracotta, #B85D32)" }}>GNANI AI STT Transcript:</strong>
                      <p style={{ margin: "2px 0 0", color: "#4A403A" }}>{rawGnaniText}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

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

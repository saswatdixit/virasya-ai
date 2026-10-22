import { useState, type FormEvent } from "react";
import { usePreserve } from "../context/PreserveContext";
import { wordCount } from "../utils";
import {
  STORY_CATEGORIES,
  STORY_LANGUAGES,
  STORY_RELATIONSHIPS,
} from "../types";

export default function Page1Story() {
  const { state, updateForm, goToStep, fillSampleStory } = usePreserve();
  const f = state.form;

  const [touched, setTouched] = useState(false);

  const errors: Record<string, string> = {};
  if (!f.title.trim()) errors.title = "Please provide a story title";
  if (!f.carrier.trim()) errors.carrier = "Please tell us who carries this story";
  if (!f.category) errors.category = "Please select a story category";

  const isValid = Object.keys(errors).length === 0;

  const handleContinue = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (isValid) {
      goToStep(2);
    } else {
      const firstErr = document.querySelector(".p-field-error");
      if (firstErr) {
        firstErr.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  return (
    <div className="p-compact-step">
      {/* Editorial Header — Compact, Culturally Grounded */}
      <header className="p-compact-header">
        <div className="p-wrap">
          <div className="p-header-flex">
            <div>
              <div className="p-eyebrow">01 / BEGIN WITH A MEMORY</div>
              <h1 className="p-compact-title" id="page-heading">
                Every story begins somewhere.
              </h1>
              <p className="p-compact-lede">
                Preserve oral traditions, culinary legacies, family memories, or sacred knowledge.
              </p>
            </div>
            <div className="p-header-meta">
              <span className="p-status-pill done">AUTO-SAVING LOCALLY</span>
              {!f.title && (
                <button
                  type="button"
                  className="p-btn p-btn-ghost p-btn-sm"
                  onClick={fillSampleStory}
                  title="Fill sample Odia heritage story"
                >
                  Load sample story
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main 2-Column Form Workspace */}
      <div className="p-wrap p-form-workspace">
        <form onSubmit={handleContinue} noValidate>
          <div className="p-grid-two">
            {/* Left Column: Identity & Category */}
            <div className="p-card-panel">
              <div className="p-panel-header">
                <span className="p-panel-num">A</span>
                <div>
                  <h2 className="p-panel-title">The Story & Teller</h2>
                  <p className="p-panel-sub">Title, carrier, and heritage classification</p>
                </div>
              </div>

              <div className="p-field-compact">
                <label className="p-lab-compact" htmlFor="f-title">
                  Story Title <span className="p-req">*</span>
                </label>
                <input
                  id="f-title"
                  className={`p-input-compact ${touched && errors.title ? "is-error" : ""}`}
                  value={f.title}
                  onChange={(e) => updateForm("title", e.target.value)}
                  placeholder="e.g., Grandmother’s Thursday Khichdi"
                  required
                  autoComplete="off"
                />
                {touched && errors.title && (
                  <p className="p-field-error" role="alert">{errors.title}</p>
                )}
              </div>

              <div className="p-field-compact">
                <label className="p-lab-compact" htmlFor="f-carrier">
                  Who carries this memory? <span className="p-req">*</span>
                </label>
                <input
                  id="f-carrier"
                  className={`p-input-compact ${touched && errors.carrier ? "is-error" : ""}`}
                  value={f.carrier}
                  onChange={(e) => updateForm("carrier", e.target.value)}
                  placeholder="e.g., Nirmala Devi"
                  required
                  autoComplete="off"
                />
                {touched && errors.carrier && (
                  <p className="p-field-error" role="alert">{errors.carrier}</p>
                )}
              </div>

              <div className="p-field-compact">
                <label className="p-lab-compact">
                  Heritage Category <span className="p-req">*</span>
                </label>
                <div className="p-chips-compact" role="radiogroup" aria-label="Story category">
                  {STORY_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      role="radio"
                      aria-checked={f.category === cat}
                      className={`p-chip-compact ${f.category === cat ? "is-active" : ""}`}
                      onClick={() => updateForm("category", cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {touched && errors.category && (
                  <p className="p-field-error" role="alert">{errors.category}</p>
                )}
              </div>
            </div>

            {/* Right Column: Roots & Context */}
            <div className="p-card-panel">
              <div className="p-panel-header">
                <span className="p-panel-num">B</span>
                <div>
                  <h2 className="p-panel-title">Roots & Generational Context</h2>
                  <p className="p-panel-sub">Geography, language, and era of origin</p>
                </div>
              </div>

              <div className="p-field-compact">
                <label className="p-lab-compact" htmlFor="f-place">
                  Where does this story come from?
                </label>
                <input
                  id="f-place"
                  className="p-input-compact"
                  value={f.place}
                  onChange={(e) => updateForm("place", e.target.value)}
                  placeholder="e.g., Puri, Odisha"
                  autoComplete="off"
                />
              </div>

              <div className="p-split-fields">
                <div className="p-field-compact">
                  <label className="p-lab-compact" htmlFor="f-lang">
                    Language
                  </label>
                  <select
                    id="f-lang"
                    className="p-select-compact"
                    value={f.language}
                    onChange={(e) => updateForm("language", e.target.value)}
                  >
                    {STORY_LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-field-compact">
                  <label className="p-lab-compact" htmlFor="f-period">
                    Approximate Period <span className="p-opt">· opt</span>
                  </label>
                  <input
                    id="f-period"
                    className="p-input-compact"
                    value={f.period}
                    onChange={(e) => updateForm("period", e.target.value)}
                    placeholder="e.g., c. 1950s"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="p-field-compact">
                <label className="p-lab-compact">
                  Your relationship to the teller <span className="p-opt">· optional</span>
                </label>
                <div className="p-chips-compact" role="radiogroup" aria-label="Relationship">
                  {STORY_RELATIONSHIPS.map((rel) => (
                    <button
                      key={rel}
                      type="button"
                      role="radio"
                      aria-checked={f.relationship === rel}
                      className={`p-chip-compact ${f.relationship === rel ? "is-active" : ""}`}
                      onClick={() =>
                        updateForm("relationship", f.relationship === rel ? "" : rel)
                      }
                    >
                      {rel}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Full-width written memory section */}
          <div className="p-card-panel p-written-panel">
            <div className="p-panel-header">
              <span className="p-panel-num">C</span>
              <div>
                <h2 className="p-panel-title">Written Memory & Notes</h2>
                <p className="p-panel-sub">
                  Capture your thoughts in your own words. You can also record spoken audio on the next step.
                </p>
              </div>
            </div>

            <div className="p-field-compact">
              <textarea
                id="f-story"
                className="p-area-compact"
                value={f.story}
                onChange={(e) => updateForm("story", e.target.value)}
                placeholder="Write what you remember about this tradition, recipe, phrase, or family memory. Speak or write naturally—authenticity matters more than perfection."
                rows={4}
              />
              <div className="p-counter-row">
                <span className="p-small">
                  <strong>{wordCount(f.story)}</strong> words · {f.story.length} chars
                </span>
                <span className="p-small p-hint">
                  Your written words remain preserved separately from spoken transcripts.
                </span>
              </div>
            </div>
          </div>

          {/* Persistent Action Bar */}
          <div className="p-bottom-bar">
            <div className="p-bar-left">
              <span className="p-small">
                Step 1 of 5 · <span style={{ color: "var(--v-ink)", fontWeight: 600 }}>Story Initiation</span>
              </span>
            </div>
            <div className="p-bar-right">
              {touched && !isValid && (
                <span className="p-small p-error-inline" role="alert">
                  Please fill in required fields above
                </span>
              )}
              <button type="submit" className="p-btn p-btn-brass">
                Continue to Voice Recording <span className="p-ar">→</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

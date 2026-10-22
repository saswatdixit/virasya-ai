import { usePreserve } from "../context/PreserveContext";
import { STEP_DEFINITIONS } from "../types";

export default function StepProgress() {
  const { state, goToStep, savedAt } = usePreserve();
  const currentStep = state.stage;
  const currentDef = STEP_DEFINITIONS.find((s) => s.step === currentStep) || STEP_DEFINITIONS[0];
  const nextDef = STEP_DEFINITIONS.find((s) => s.step === currentStep + 1);

  const getStepStatus = (stepNum: number) => {
    if (stepNum === currentStep) return "current";
    if (state.skipped[stepNum]) return "skip";
    if (state.completed[stepNum]) return "done";
    // Check if reachable (has reached before or previous step completed)
    const prevCompleted = stepNum === 1 || state.completed[stepNum - 1];
    if (prevCompleted) return "available";
    return "locked";
  };

  return (
    <nav className="p-rail" aria-label="Preservation workflow progress">
      <div className="p-rail-in">
        {/* Left: Current step label & Next hint */}
        <div className="p-rail-left">
          <span className="p-tabnum" style={{ fontWeight: 800 }}>
            {currentDef.num} / 06
          </span>
          <span>{currentDef.label}</span>
          {nextDef && (
            <span className="p-rail-next">
              · Next: {nextDef.label}
            </span>
          )}
        </div>

        {/* Center: The persistent steps with indicators */}
        <div
          className="p-rail-dashes"
          role="group"
          aria-label="Steps 1 through 6"
        >
          {STEP_DEFINITIONS.map((def) => {
            const status = getStepStatus(def.step);
            const isClickable = status === "done" || status === "available" || status === "skip" || status === "current";

            return (
              <button
                key={def.step}
                type="button"
                className={`p-rail-dash-btn is-${status}`}
                disabled={!isClickable}
                onClick={() => goToStep(def.step)}
                aria-current={status === "current" ? "step" : undefined}
                title={`${def.num} ${def.label} (${status})`}
                aria-label={`Step ${def.step}: ${def.label}, ${status}`}
              >
                <i className="p-dash-line" aria-hidden="true"></i>
                <span className="p-rail-dash-label sr-only">
                  {def.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Saved draft status */}
        <div className="p-rail-right">
          <span role="status" className="p-small">
            {savedAt ? `Draft saved ${savedAt}` : "Saved locally"}
          </span>
        </div>
      </div>
    </nav>
  );
}

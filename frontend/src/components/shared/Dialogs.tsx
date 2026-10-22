export default function Dialogs() {
  return (
    <>
      <dialog
        className="dialog"
        id="start-dialog"
        aria-labelledby="dialog-title"
      >
        <button className="dialog-close" aria-label="Close workspace preview">
          ×
        </button>
        <div id="setup-pane">
          <span className="mark dialog-mark" aria-hidden={true}>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </span>
          <p className="eyebrow" id="selected-plan">
            YOUR FIRST STEP
          </p>
          <h2 id="dialog-title">Hello, possibility.</h2>
          <p>
            Let's give your day a little more room. Make this archive preview
            yours.
          </p>
          <form id="setup-form">
            <label htmlFor="your-name">WHAT SHOULD VIRASYA CALL YOU?</label>
            <input
              id="your-name"
              name="name"
              placeholder="Your first name"
              autoComplete="given-name"
              required
              maxLength={45}
            />
            <label htmlFor="your-focus">WHAT'S ON YOUR MIND?</label>
            <select id="your-focus" name="focus">
              <option value="research">Finding clarity through research</option>
              <option value="create">Making something new</option>
              <option value="coordinate">Keeping the work moving</option>
            </select>
            <button className="btn ink" type="submit">
              Let's find your flow <span className="arrow">↗</span>
            </button>
            <p className="fine">
              A local product preview. No account, payment, or connected tools.
              Your name stays in this browser.
            </p>
          </form>
        </div>
        <div id="success-pane" className="success-pane" hidden={true}>
          <span className="mark" aria-hidden={true}>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </span>
          <h2 id="welcome-title">Room for brilliant.</h2>
          <p>
            Your archive preview is ready. Pick a starting point, run a sample
            workflow, and see how a little help feels.
          </p>
          <button className="btn ink" id="open-workspace">
            Explore your archive <span className="arrow">↗</span>
          </button>
        </div>
      </dialog>
      <dialog
        className="dialog"
        id="about-dialog"
        aria-labelledby="about-title"
      >
        <button className="dialog-close" aria-label="Close about preview">
          ×
        </button>
        <span className="mark dialog-mark" aria-hidden={true}>
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </span>
        <h2 id="about-title">A little transparency.</h2>
        <p>
          Virasya is an original interactive product concept. The archive
          workflows use sample content; they do not call a live AI service.
          Pricing and integrations illustrate the proposed product.
        </p>
        <p style={{ marginTop: "15px" }}>
          Everything on this page runs in your browser. No analytics, external
          accounts, or messages. Your optional first name and preferred workflow
          are saved only on this device.
        </p>
        <button className="btn ink" id="clear-preview">
          Clear my saved preferences <span className="arrow">↗</span>
        </button>
        <p className="fine" id="clear-status" aria-live="polite"></p>
      </dialog>
    </>
  );
}

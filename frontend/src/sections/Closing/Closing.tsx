export default function Closing() {
  return (
    <>
      <section className="closing wrap light-section" id="get-started">
        <span className="mark closing-mark" aria-hidden={true}>
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </span>
        <div className="closing-top">
          <div>
            <p className="eyebrow">BEFORE A MEMORY BECOMES A WHISPER.</p>
            <h2 className="reveal">
              Hold on to
              <br />
              what matters.
            </h2>
          </div>
          <div className="closing-copy">
            <p>
              The stories told at home. The wisdom passed down. The traditions that made us.
              <br />Give them a place to live on.
            </p>
            <a className="btn" href="/preserve-your-story">
              Preserve your story <span className="arrow">↗</span>
            </a>
          </div>
        </div>
        <footer>
          <div className="footer-top">
            <p> Made With Love & Care </p>
            <div className="footer-top-links">
              <a href="/explore">Explore</a>
              <a href="/culture-hosts">Culture Hosts</a>
              <a href="/private-vault">Private Vault</a>
              <a href="#faq">Good questions</a>
            </div>
          </div>
          <a
            href="/"
            className="footer-brand"
            aria-label="Virasya. Back to top."
          >
            <span>Virasya</span>
          </a>
          <div className="footer-baseline">
            <span>© 2026 VIRASYA. MADE FOR A LITTLE MORE.</span>
            <span>
              <button id="privacy-button">About this preview</button> &nbsp; ·
              &nbsp;{" "}
              <button id="motion-button" aria-pressed={false}>
                Pause motion
              </button>{" "}
              &nbsp; · &nbsp; <a href="/">BACK TO TOP ↑</a>
            </span>
          </div>
        </footer>
      </section>
    </>
  );
}

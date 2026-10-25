import { PreserveStoryIcon } from "../../components/shared/Icons";
import {
  isOnboardingCompleted,
  openOnboardingDialog,
  navigateTo as spaNavigate,
} from "../../components/shared/onboarding";

export default function Closing() {
  const handlePreserveClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (isOnboardingCompleted()) {
      spaNavigate("/preserve-your-story");
    } else {
      openOnboardingDialog();
    }
  };

  const navigateTo = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    spaNavigate(path);
  };

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
            <a
              className="btn"
              href="/preserve-your-story"
              onClick={handlePreserveClick}
            >
              <PreserveStoryIcon className="btn-preserve-icon" />
              <span>Preserve your story</span> <span className="arrow">↗</span>
            </a>
          </div>
        </div>
        <footer>
          <div className="footer-top">
            <p> Made With Love & Care </p>
            <div className="footer-top-links">
              <a
                href="/explore"
                className="footer-nav-link"
                onClick={(e) => navigateTo(e, "/explore")}
              >
                Explore
              </a>
              <a
                href="/culture-hosts"
                className="footer-nav-link"
                onClick={(e) => navigateTo(e, "/culture-hosts")}
              >
                Culture Hosts
              </a>
              <a
                href="/heritage-vault"
                className="footer-nav-link"
                onClick={(e) => navigateTo(e, "/heritage-vault")}
              >
                Heritage Vault
              </a>
              <a href="#faq" className="footer-nav-link">
                Good questions
              </a>
            </div>
          </div>
          <a
            href="/"
            className="footer-brand"
            aria-label="Virasya. Back to top."
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span>Virasya</span>
          </a>
          <div className="footer-baseline">
            <span>© 2026 VIRASYA. MADE FOR A LITTLE MORE.</span>
            <span>
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                BACK TO TOP ↑
              </a>
            </span>
          </div>
        </footer>
      </section>
    </>
  );
}

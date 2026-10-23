import { ComingSoonBadge } from "../../components/shared/Icons";

export default function Trust() {
  return (
    <>
      <section className="trust wrap light-section" id="trust">
        <div>
          <p className="eyebrow">CULTURE, PASSED FORWARD.</p>
          <h2>
            Wisdom shared.
            <br />
            <span>Heritage kept alive.</span>
          </h2>
        </div>
        <div className="trust-list">
          <div className="trust-row">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              aria-hidden={true}
            >
              <path d="M12 3l8 4v6c0 5-8 8-8 8s-8-3-8-8V7zM8 12l3 3 5-6" />
            </svg>
            <div>
              <h3>Learn from those who know.</h3>
              <p>
                Meet cultural practitioners, storytellers, and tradition bearers who bring their knowledge and lived experiences to you.
              </p>
            </div>
          </div>
          <div className="trust-row">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              aria-hidden={true}
            >
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 018 0v3M12 14v3" />
            </svg>
            <div>
              <h3>Gather. Learn. Experience.</h3>
              <p>
                Join online or in-person sessions exploring traditional art, crafts, folklore, rituals, and ancestral wisdom.
              </p>
            </div>
          </div>
          <div className="trust-row">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              aria-hidden={true}
            >
              <path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <div>
              <h3>Keep traditions in living hands.</h3>
              <p>
                Connect with people who carry culture forward, or become a host and share the traditions closest to your heart.
              </p>
            </div>
          </div>
          <a className="text-link trust-cta" href="/culture-hosts">
            Explore Culture Hosts{" "}
            <ComingSoonBadge text="Coming Soon" className="trust-soon-badge" />
            <span className="arrow" aria-hidden={true}>
              ↗
            </span>
          </a>
        </div>
      </section>
    </>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "../../auth";

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden={true}
  >
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

const ProfileIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden={true}
  >
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 20c.8-3.5 3-5.3 6.5-5.3s5.7 1.8 6.5 5.3" />
  </svg>
);

export default function Header({
  placeholder = false,
}: {
  placeholder?: boolean;
}) {
  const { user, profile, openAuthModal } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const displayName = profile?.display_name || (user?.email ? user.email.split("@")[0] : "");

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const headerClass = [
    "site-header",
    placeholder ? "placeholder-header" : "",
    scrolled ? "scrolled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <header
        id="header"
        className={headerClass || undefined}
      >
        <div className="header-left">
          <a href="/" className="wordmark" aria-label="Virasya home">
            <img
              className="brand-logo brand-logo-white"
              src="/virasya-emblem-white.png"
              alt=""
              width="50"
              height="50"
            />
            <img
              className="brand-logo brand-logo-dark"
              src="/virasya-emblem-dark.png"
              alt=""
              width="50"
              height="50"
            />
            <span className="brand-text">virasya</span>
          </a>
        </div>

        <nav className="header-center" aria-label="Main navigation">
          <a href="/explore" className="nav-link">
            Explore
          </a>
          <a href="/culture-hosts" className="nav-link">
            Culture Hosts
          </a>
          <a href="/private-vault" className="nav-link">
            Private Vault
          </a>
          <a
            className="nav-icon-btn nav-search"
            href="/search"
            aria-label="Search"
          >
            <SearchIcon />
          </a>
        </nav>

        <div className="header-right">
          <a className="btn nav-cta" href="/preserve-your-story">
            Preserve Your Story{" "}
            <span className="arrow" aria-hidden={true}>
              ↗
            </span>
          </a>
          <button
            type="button"
            className="nav-icon-btn nav-profile"
            onClick={openAuthModal}
            aria-label={user ? `Archivist profile (${displayName || user.email})` : "Sign in or view profile"}
            title={user ? `Signed in as ${displayName || user.email}` : "Sign in or view profile"}
          >
            <ProfileIcon />
            {user && <span className="nav-profile-active-dot" aria-hidden="true" />}
          </button>
          <button
            className="menu-button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </header>

      <div
        className={`mobile-menu ${mobileOpen ? "open" : ""}`}
        id="mobile-menu"
      >
        <a
          className="mobile-menu-action"
          href="/search"
          onClick={() => setMobileOpen(false)}
        >
          <SearchIcon /> Search
        </a>
        <a href="/explore" onClick={() => setMobileOpen(false)}>
          Explore
        </a>
        <a href="/culture-hosts" onClick={() => setMobileOpen(false)}>
          Culture Hosts
        </a>
        <a href="/private-vault" onClick={() => setMobileOpen(false)}>
          Private Vault
        </a>
        <button
          type="button"
          className="mobile-menu-action mobile-profile"
          onClick={() => {
            setMobileOpen(false);
            openAuthModal();
          }}
          aria-label={user ? `Archivist profile (${displayName || user.email})` : "Sign In"}
        >
          <ProfileIcon /> {displayName || "Profile"}
          {user && <span className="mobile-profile-active-dot" aria-hidden="true"> •</span>}
        </button>
        <a
          className="btn mobile-preserve"
          href="/preserve-your-story"
          onClick={() => setMobileOpen(false)}
        >
          Preserve Your Story{" "}
          <span className="arrow" aria-hidden={true}>
            ↗
          </span>
        </a>
      </div>
    </>
  );
}

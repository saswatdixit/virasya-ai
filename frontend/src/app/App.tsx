import { useEffect, useState, useRef } from "react";
// @ts-ignore
import { initThreeScene } from "../three/main.js";
import { setupVirasyaBranding } from "../branding";
import Header from "../components/layout/Header";
import Hero from "../sections/Hero/Hero";
import Integrations from "../sections/Integrations/Integrations";
import Trust from "../sections/Trust/Trust";
import Faq from "../sections/Faq/Faq";
import Closing from "../sections/Closing/Closing";
import Dialogs from "../components/shared/Dialogs";
import PreserveApp from "../preserve/PreserveApp";
import ExplorePage from "../explore/ExplorePage";
import { AuthProvider, AuthModal, useAuth } from "../auth";
import ErrorBoundary from "../components/shared/ErrorBoundary";

interface PlaceholderConfig {
  eyebrow?: string;
  badge?: string;
  title: string;
  desc: string;
  icon?: string;
}

const PLACEHOLDER_CONFIGS: Record<string, PlaceholderConfig> = {
  "/search": {
    eyebrow: "Sovereign Search",
    title: "Search the Living Archive",
    desc: "Search across preserved oral histories, folklore recordings, and dialect lexicons.",
    icon: "🔍",
  },
  "/culture-hosts": {
    eyebrow: "Living Heritage Custodians",
    title: "Culture Hosts & Guilds",
    desc: "Connect with native cultural custodians, storytellers, and community archives.",
    icon: "🏛",
  },
  "/private-vault": {
    badge: "Coming Soon",
    eyebrow: "Sovereign Archival Heritage",
    title: "Private Sovereign Vault",
    desc: "Coming soon — we’re working on a secure private space for your family recordings, restricted memories, and lineage archives.",
  },
};

function PlaceholderPage({ path }: { path: string }) {
  const config = PLACEHOLDER_CONFIGS[path] || {
    badge: "Coming Soon",
    eyebrow: "Archive Preservation",
    title: "Living Archive Section",
    desc: "This heritage preservation area is currently being prepared for sovereign archival storage.",
  };

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header placeholder />
      <main id="main" className="placeholder-view-section">
        <div className="placeholder-card">
          {config.badge && (
            <div className="placeholder-badge">
              <span className="placeholder-badge-dot" aria-hidden="true" />
              <span>{config.badge}</span>
            </div>
          )}
          {config.icon && <div className="placeholder-icon">{config.icon}</div>}
          {config.eyebrow && <div className="placeholder-eyebrow">{config.eyebrow}</div>}
          <h1 className="placeholder-title">{config.title}</h1>
          <p className="placeholder-desc">{config.desc}</p>
          <div className="placeholder-buttons">
            <a href="/" className="placeholder-btn-home">
              ← Back to Home
            </a>
            <a href="/explore" className="placeholder-btn-explore">
              Explore Stories
            </a>
            <a href="/preserve-your-story" className="placeholder-btn-preserve">
              Preserve a Story →
            </a>
          </div>
        </div>
      </main>
    </>
  );
}

function AppContent() {
  const [currentPath, setCurrentPath] = useState(() =>
    window.location.pathname.replace(/\/+$/, "") || "/"
  );
  const { openAuthModal, authModalOpen } = useAuth();
  const openedForRouteRef = useRef(false);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname.replace(/\/+$/, "") || "/");
    };
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  const isLoginOrProfileRoute =
    currentPath === "/login" || currentPath === "/profile" || currentPath === "/signup";

  // When /login, /profile, or /signup is loaded directly, open the authentic AuthModal
  useEffect(() => {
    if (isLoginOrProfileRoute && !openedForRouteRef.current) {
      openedForRouteRef.current = true;
      openAuthModal();
    }
  }, [isLoginOrProfileRoute, openAuthModal]);

  // Clean up URL to "/" when modal closes if opened from a login/profile/signup route
  useEffect(() => {
    if (!authModalOpen && openedForRouteRef.current) {
      openedForRouteRef.current = false;
      const path = window.location.pathname.replace(/\/+$/, "");
      if (path === "/login" || path === "/profile" || path === "/signup") {
        window.history.pushState(null, "", "/");
        setCurrentPath("/");
      }
    }
  }, [authModalOpen]);

  const isPreserveRoute = currentPath.startsWith("/preserve-your-story");
  const isExploreRoute = currentPath === "/explore";
  const isPlaceholder = currentPath in PLACEHOLDER_CONFIGS;

  const isHomeRoute =
    !isPreserveRoute &&
    !isExploreRoute &&
    !isPlaceholder;

  useEffect(() => {
    if (isHomeRoute) {
      initThreeScene();
    }
    return setupVirasyaBranding();
  }, [isHomeRoute]);

  const renderContent = () => {
    // 1. Explore Page
    if (isExploreRoute) {
      return <ExplorePage />;
    }

    // 2. Preserve Workflow (Steps 1-6)
    if (isPreserveRoute) {
      return <PreserveApp />;
    }

    // 3. Configured Placeholders (Search, Vault, Hosts)
    if (isPlaceholder) {
      return <PlaceholderPage path={currentPath} />;
    }

    // 4. Home Landing Page (also rendered behind the auth modal if navigating directly to /login or /profile)
    return (
      <>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <div className="scroll-progress" aria-hidden="true"></div>
        <Header />
        <main id="main">
          <Hero />
          <Integrations />
          <Trust />
          <Faq />
          <Closing />
        </main>
        <button className="back-top" aria-label="Back to top">
          ↑
        </button>
        <Dialogs />
      </>
    );
  };

  return <ErrorBoundary>{renderContent()}</ErrorBoundary>;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <AuthModal />
    </AuthProvider>
  );
}

import { useEffect, useState } from "react";
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

const placeholderRoutes = new Set([
  "/search",
  "/culture-hosts",
  "/private-vault",
  "/profile",
]);

function PlaceholderPage() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header placeholder />
      <main
        id="main"
        className="placeholder-page"
        aria-label="Virasya page placeholder"
      />
    </>
  );
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() =>
    window.location.pathname.replace(/\/+$/, "") || "/"
  );

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname.replace(/\/+$/, "") || "/");
    };
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  const isPreserveRoute = currentPath.startsWith("/preserve-your-story");
  const isExploreRoute = currentPath === "/explore";
  const isPlaceholder = placeholderRoutes.has(currentPath);

  useEffect(() => {
    if (!isPlaceholder && !isPreserveRoute && !isExploreRoute) {
      initThreeScene();
    }
    return setupVirasyaBranding();
  }, [isPlaceholder, isPreserveRoute, isExploreRoute]);

  // If user navigated to Explore
  if (isExploreRoute) {
    return <ExplorePage />;
  }

  // If user navigated to any of the 5 Preserve Your Story routes
  if (isPreserveRoute) {
    return <PreserveApp />;
  }

  // If placeholder route
  if (isPlaceholder) {
    return <PlaceholderPage />;
  }

  // Home Page (unchanged)
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
}

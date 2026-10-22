import { useState, useEffect } from "react";
import { checkBackendHealth } from "../api";
import { usePreserve } from "../context/PreserveContext";

export default function BackendStatusBanner() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState<boolean>(true);
  const [checking, setChecking] = useState(false);
  const { resetAll } = usePreserve();

  const verifyHealth = async () => {
    setChecking(true);
    const res = await checkBackendHealth();
    setOnline(res.online);
    setConfigured(res.configured);
    setChecking(false);
  };

  useEffect(() => {
    verifyHealth();
    const interval = setInterval(verifyHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // When online and models are ready, keep UI clean
  if (online === true || online === null) {
    return null;
  }

  // Case 1: Unconfigured / Static Vercel Preview Mode
  if (!configured) {
    return (
      <aside
        className="p-banner-offline"
        role="region"
        aria-label="Frontend preview mode status"
      >
        <div className="p-banner-offline-in">
          <div className="p-banner-offline-left">
            <span className="p-banner-badge">Frontend Preview</span>
            <div className="p-banner-text">
              <span>
                Speech models &amp; permanent database are not connected to this static preview. You can navigate the complete flow, test editing, and load sample heritage content.
              </span>
            </div>
          </div>
          <div className="p-banner-offline-actions">
            <button
              type="button"
              className="p-banner-btn-secondary"
              onClick={resetAll}
              title="Reset your current preview draft back to initial state"
            >
              Reset Preview Draft
            </button>
            <button
              type="button"
              className="p-banner-btn-primary"
              onClick={verifyHealth}
              disabled={checking}
            >
              {checking ? "Checking..." : "Check Backend"}
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Case 2: Configured endpoint (e.g. local dev or custom URL) but currently unreachable
  return (
    <aside
      className="p-banner-offline p-banner-offline-alert"
      role="alert"
      aria-live="polite"
    >
      <div className="p-banner-offline-in">
        <div className="p-banner-offline-left">
          <span aria-hidden="true" style={{ fontSize: "16px" }}>⚠️</span>
          <div className="p-banner-text">
            <strong>AI Backend Offline:</strong> Audio upload and Odia transcription require the Virasya AI service.
            <span style={{ marginLeft: "6px", opacity: 0.85 }}>
              Run <code>npm run dev</code> locally or verify your backend server.
            </span>
          </div>
        </div>
        <div className="p-banner-offline-actions">
          <button
            type="button"
            className="p-banner-btn-secondary"
            onClick={resetAll}
            title="Reset form data"
          >
            Reset Draft
          </button>
          <button
            type="button"
            className="p-banner-btn-primary"
            onClick={verifyHealth}
            disabled={checking}
          >
            {checking ? "Checking..." : "Retry Connection"}
          </button>
        </div>
      </div>
    </aside>
  );
}

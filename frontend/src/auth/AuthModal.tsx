/**
 * Virasya Supabase Authentication Modal
 *
 * Implements accessible, theme-aligned email OTP / magic-link login and session management.
 * Invariants:
 * 1. Supports guest mode: users can always dismiss and continue without signing in.
 * 2. Accessibility: Escape key, backdrop click, ARIA labels, focus management.
 * 3. Graceful offline / preview mode fallback when Supabase is not configured.
 * 4. Zero story persistence: does NOT alter or touch local story data or audio files.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";
import "./auth.css";

export default function AuthModal() {
  const {
    user,
    profile,
    loading: authLoading,
    isConfigured,
    authModalOpen,
    closeAuthModal,
    signInWithOtp,
    signOut,
    updateProfile,
    callbackError,
    clearCallbackError,
  } = useAuth();

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [step, setStep] = useState<"email" | "sent">("email");
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Sync displayName from profile
  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    } else if (user?.email) {
      setDisplayName(user.email.split("@")[0]);
    }
  }, [profile, user]);

  // Sync callback errors from magic link redirection
  useEffect(() => {
    if (callbackError) {
      setErrorMsg(callbackError);
    }
  }, [callbackError]);

  // Countdown timer for magic link resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Synchronize native HTML <dialog> lifecycle with authModalOpen
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (authModalOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      if (!callbackError) {
        setErrorMsg(null);
      }
      setInfoMsg(null);
      setTimeout(() => {
        if (!user && step === "email") {
          emailInputRef.current?.focus();
        }
      }, 50);
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [authModalOpen, user, step, callbackError]);

  // Handle native backdrop clicks
  const handleDialogClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isInDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!isInDialog) {
        closeAuthModal();
      }
    },
    [closeAuthModal]
  );

  // Send Magic Link
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    if (clearCallbackError) clearCallbackError();

    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMsg("Please enter your email address.");
      return;
    }

    setSubmitting(true);
    const { error } = await signInWithOtp(trimmed);
    setSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setStep("sent");
      setResendCooldown(60);
      setInfoMsg(null);
    }
  };

  // Resend Magic Link with cooldown
  const handleResendLink = async () => {
    if (submitting || resendCooldown > 0) return;
    setErrorMsg(null);
    setInfoMsg(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setStep("email");
      return;
    }

    setSubmitting(true);
    const { error } = await signInWithOtp(trimmed);
    setSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setResendCooldown(60);
      setInfoMsg("A fresh sign-in link has been sent to your email.");
    }
  };

  // Switch back to email step
  const handleUseDifferentEmail = () => {
    setStep("email");
    setErrorMsg(null);
    setInfoMsg(null);
    if (clearCallbackError) clearCallbackError();
    setTimeout(() => {
      emailInputRef.current?.focus();
    }, 50);
  };

  // Save profile display name
  const handleUpdateDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    const trimmed = displayName.trim();
    if (!trimmed) {
      setErrorMsg("Display name cannot be empty.");
      return;
    }
    setSavingProfile(true);
    const { error } = await updateProfile({ display_name: trimmed });
    setSavingProfile(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setInfoMsg("Display name saved to profile.");
    }
  };

  // Sign out
  const handleSignOut = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    if (clearCallbackError) clearCallbackError();
    setSubmitting(true);
    const { error } = await signOut();
    setSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setStep("email");
      setEmail("");
      setInfoMsg("You have signed out. Virasya is running in guest mode.");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog auth-dialog"
      aria-labelledby="auth-modal-title"
      aria-describedby="auth-modal-desc"
      onClick={handleDialogClick}
      onCancel={(e) => {
        e.preventDefault();
        closeAuthModal();
      }}
    >
      <button
        type="button"
        className="dialog-close"
        aria-label="Close authentication modal"
        onClick={closeAuthModal}
      >
        ×
      </button>

      {/* 1. AUTHENTICATED STATE */}
      {user ? (
        <div className="auth-signed-in">
          <p className="eyebrow">CONNECTED ARCHIVIST</p>
          <h2 id="auth-modal-title">Your Account</h2>
          <p id="auth-modal-desc">
            You are signed in to the Virasya cloud archive. Your identity enables
            cloud persistence and multi-device access in future stages.
          </p>

          <div className="auth-user-card">
            <div className="auth-user-email">{user.email}</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--v-ink)" }}>
              Story Author Name: <strong>{profile?.display_name || user.email?.split("@")[0] || "Storyteller"}</strong>
            </div>
            <div className="auth-user-meta">
              <span className="auth-user-id">ID: {user.id}</span>
              {user.last_sign_in_at && (
                <span>
                  Last active: {new Date(user.last_sign_in_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="auth-user-badge">
              <span className="auth-status-dot" aria-hidden="true" /> Connected to Cloud
            </div>
          </div>

          <form className="auth-profile-form" onSubmit={handleUpdateDisplayName}>
            <label htmlFor="auth-display-name">ARCHIVIST / STORYTELLER DISPLAY NAME</label>
            <div className="auth-profile-row">
              <input
                id="auth-display-name"
                type="text"
                className="auth-profile-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your storyteller name"
                maxLength={80}
                disabled={savingProfile}
                autoComplete="name"
              />
              <button
                type="submit"
                className="auth-profile-save-btn"
                disabled={savingProfile || !displayName.trim()}
              >
                {savingProfile ? "Saving…" : "Save Name"}
              </button>
            </div>
            <p className="auth-profile-hint">
              This name is attributed to stories you preserve in public.profiles.
            </p>
          </form>

          {infoMsg && (
            <div className="auth-notice info" role="status">
              {infoMsg}
            </div>
          )}
          {errorMsg && (
            <div className="auth-notice error" role="alert">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            className="btn ink"
            onClick={handleSignOut}
            disabled={submitting || authLoading}
          >
            {submitting ? "Signing out..." : "Sign Out"} <span className="arrow">↗</span>
          </button>

          <button
            type="button"
            className="auth-guest-btn"
            onClick={closeAuthModal}
          >
            Return to Archive
          </button>

          <p className="fine">
            Note: During Phase 2D, your local stories and recordings remain safely saved
            on your local device.
          </p>
        </div>
      ) : step === "sent" ? (
        /* 2. EMAIL SENT CONFIRMATION STEP */
        <div className="auth-step-sent">
          <p className="eyebrow">CONFIRM ACCESS</p>
          <h2 id="auth-modal-title">Check your email</h2>
          <p id="auth-modal-desc">
            We’ve sent you a sign-in link. Open the email and click the link to securely sign in to Virasya.
          </p>

          <div className="auth-email-sent-card">
            <div className="auth-email-icon" aria-hidden="true">✉</div>
            <div className="auth-sent-info">
              <span className="auth-sent-label">Sign-in link sent to</span>
              <span className="auth-sent-address">{email}</span>
            </div>
          </div>

          {infoMsg && (
            <div className="auth-notice info" role="status">
              {infoMsg}
            </div>
          )}
          {errorMsg && (
            <div className="auth-notice error" role="alert">
              {errorMsg}
            </div>
          )}

          <div className="auth-sent-actions">
            <button
              type="button"
              className="btn ink"
              onClick={handleResendLink}
              disabled={submitting || resendCooldown > 0}
            >
              {resendCooldown > 0
                ? `Resend link in ${resendCooldown}s`
                : submitting
                ? "Sending link…"
                : "Resend sign-in link"}{" "}
              <span className="arrow">↗</span>
            </button>
          </div>

          <div className="auth-alt-row">
            <button
              type="button"
              className="auth-text-link"
              onClick={handleUseDifferentEmail}
            >
              ← Use a different email
            </button>
          </div>

          <button
            type="button"
            className="auth-guest-btn"
            onClick={closeAuthModal}
          >
            Continue as Guest
          </button>

          <p className="fine">
            Guest mode remains active. You can close this anytime to continue preserving
            stories without signing in.
          </p>
        </div>
      ) : (
        /* 3. EMAIL INPUT STEP */
        <div className="auth-step-email">
          <p className="eyebrow">VIRASYA CLOUD ARCHIVE</p>
          <h2 id="auth-modal-title">Sign in to Virasya</h2>
          <p id="auth-modal-desc">
            Enter your email to receive a secure sign-in magic link.
            Or continue exploring freely as a guest.
          </p>

          {!isConfigured && (
            <div className="auth-notice info" role="status">
              <strong>Offline Preview:</strong> Supabase credentials are not configured in
              this development environment. You can test guest mode and local preservation
              without restrictions.
            </div>
          )}

          {infoMsg && (
            <div className="auth-notice success" role="status">
              {infoMsg}
            </div>
          )}
          {errorMsg && (
            <div className="auth-notice error" role="alert">
              {errorMsg}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSendOtp}>
            <label htmlFor="auth-email-input">YOUR EMAIL ADDRESS</label>
            <input
              ref={emailInputRef}
              id="auth-email-input"
              type="email"
              placeholder="archivist@domain.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />

            <button
              type="submit"
              className="btn ink"
              disabled={submitting || authLoading}
            >
              {submitting ? "Sending link…" : "Send Magic Link"}{" "}
              <span className="arrow">↗</span>
            </button>
          </form>

          <button
            type="button"
            className="auth-guest-btn"
            onClick={closeAuthModal}
          >
            Continue as Guest
          </button>

          <p className="fine">
            No password required. Virasya never shares your email or publishes your
            stories without your explicit confirmation.
          </p>
        </div>
      )}
    </dialog>
  );
}

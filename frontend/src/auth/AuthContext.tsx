/**
 * Virasya Authentication Context
 *
 * Provides application-wide authentication state and session lifecycle management.
 * Designed to cleanly interface with Supabase Auth when credentials are supplied.
 *
 * Invariants:
 * 1. Gracefully handles unconfigured / guest mode without errors or blocking UI.
 * 2. Never blocks the application from loading for guest storytellers.
 * 3. Never leaks or references the service-role key.
 * 4. Cleans up authentication subscriptions on unmount to prevent leaks.
 * 5. Does NOT route story persistence, audio, or vocabulary to Supabase in this stage.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  createElement,
  type ReactNode,
} from "react";
import type { AuthContextType, AuthUser, AuthSession, AuthError } from "./types";

const env =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : ({} as Record<string, string | undefined>);

const rawUrl = (env.VITE_SUPABASE_URL || "").trim();
const rawKey = (
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

export function isSupabaseConfigured(): boolean {
  return rawUrl.length > 0 && rawKey.length > 0;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  const isConfigured = isSupabaseConfigured();

  const openAuthModal = useCallback(() => {
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const signInWithOtp = useCallback(
    async (rawEmail: string): Promise<{ error: AuthError | Error | null }> => {
      const email = (rawEmail || "").trim().toLowerCase();
      if (!email) {
        return { error: new Error("Please enter a valid email address.") };
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return { error: new Error("Invalid email format. Please check your address.") };
      }

      if (!isConfigured) {
        return {
          error: new Error(
            "Supabase authentication is not configured in this environment. Continuing in offline preview mode."
          ),
        };
      }

      return {
        error: new Error(
          "Supabase client connection will be activated in the next phase. Running in offline preview mode."
        ),
      };
    },
    [isConfigured]
  );

  const verifyOtp = useCallback(
    async (rawEmail: string, rawToken: string): Promise<{ error: AuthError | Error | null }> => {
      const email = (rawEmail || "").trim().toLowerCase();
      const token = (rawToken || "").trim();

      if (!email || !token) {
        return { error: new Error("Email and 6-digit verification code are required.") };
      }

      if (!isConfigured) {
        return {
          error: new Error("Supabase authentication is not configured in this environment."),
        };
      }

      return {
        error: new Error("Supabase client connection will be activated in the next phase."),
      };
    },
    [isConfigured]
  );

  const signOut = useCallback(async (): Promise<{ error: AuthError | Error | null }> => {
    setUser(null);
    setSession(null);
    return { error: null };
  }, []);

  return createElement(
    AuthContext.Provider,
    {
      value: {
        user,
        session,
        loading,
        isConfigured,
        authModalOpen,
        openAuthModal,
        closeAuthModal,
        signInWithOtp,
        verifyOtp,
        signOut,
      },
    },
    children
  );
}

export const defaultAuthContext: AuthContextType = {
  user: null,
  session: null,
  loading: false,
  isConfigured: false,
  authModalOpen: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
  signInWithOtp: async () => ({ error: new Error("AuthProvider not mounted") }),
  verifyOtp: async () => ({ error: new Error("AuthProvider not mounted") }),
  signOut: async () => ({ error: null }),
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    return defaultAuthContext;
  }
  return context;
}

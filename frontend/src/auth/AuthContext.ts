/**
 * Virasya Supabase Authentication Context
 *
 * Provides application-wide authentication state and session lifecycle management.
 * Strictly uses the singleton Supabase client from src/supabase/client.ts.
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
  useEffect,
  useCallback,
  createElement,
  type ReactNode,
} from "react";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "../supabase/client.ts";
import type { AuthContextType } from "./types";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const isConfigured = isSupabaseConfigured();
  const [loading, setLoading] = useState<boolean>(() => isConfigured);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  const openAuthModal = useCallback(() => {
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !isConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Initial session restoration
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.warn("[Auth] Failed to restore initial session:", error.message);
          setSession(null);
          setUser(null);
        } else {
          setSession(data.session);
          setUser(data.session?.user ?? null);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn("[Auth] Network error during session fetch:", err);
        setLoading(false);
      });

    // 2. Subscribe to auth state changes (sign-in, token refresh, sign-out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isConfigured]);

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

      const supabase = getSupabase();
      if (!supabase || !isConfigured) {
        return {
          error: new Error(
            "Supabase authentication is not configured in this environment. Continuing in offline preview mode."
          ),
        };
      }

      try {
        const redirectTo =
          typeof window !== "undefined" && window.location && window.location.origin
            ? `${window.location.origin}/`
            : undefined;

        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectTo,
            shouldCreateUser: true,
          },
        });

        return { error };
      } catch (err: any) {
        return { error: err instanceof Error ? err : new Error(String(err)) };
      }
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

      const supabase = getSupabase();
      if (!supabase || !isConfigured) {
        return {
          error: new Error("Supabase authentication is not configured in this environment."),
        };
      }

      try {
        const { error, data } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        });

        if (!error && data.session) {
          setSession(data.session);
          setUser(data.session.user);
        }

        return { error };
      } catch (err: any) {
        return { error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    [isConfigured]
  );

  const signOut = useCallback(async (): Promise<{ error: AuthError | Error | null }> => {
    const supabase = getSupabase();
    if (!supabase || !isConfigured) {
      setUser(null);
      setSession(null);
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      return { error };
    } catch (err: any) {
      setUser(null);
      setSession(null);
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, [isConfigured]);

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

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
import type { AuthContextType, UserProfile } from "./types";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const isConfigured = isSupabaseConfigured();
  const [loading, setLoading] = useState<boolean>(() => isConfigured);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  const openAuthModal = useCallback(() => {
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const fetchProfile = useCallback(
    async (currentUser: User | null): Promise<UserProfile | null> => {
      if (!currentUser) {
        setProfile(null);
        return null;
      }

      const defaultDisplayName =
        (currentUser.user_metadata?.display_name as string) ||
        (currentUser.user_metadata?.full_name as string) ||
        (currentUser.email ? currentUser.email.split("@")[0] : "") ||
        "Storyteller";

      const fallbackProfile: UserProfile = {
        id: currentUser.id,
        email: currentUser.email,
        display_name: defaultDisplayName,
        full_name: (currentUser.user_metadata?.full_name as string) || "",
        avatar_url: (currentUser.user_metadata?.avatar_url as string) || "",
      };

      const supabase = getSupabase();
      if (!supabase || !isConfigured) {
        setProfile(fallbackProfile);
        return fallbackProfile;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (error) {
          console.warn("[Auth] Failed to load profile from database:", error.message);
          setProfile(fallbackProfile);
          return fallbackProfile;
        }

        if (data) {
          const loaded: UserProfile = {
            id: data.id,
            email: data.email || currentUser.email,
            display_name: data.display_name || defaultDisplayName,
            full_name: data.full_name || "",
            avatar_url: data.avatar_url || "",
            created_at: data.created_at,
            updated_at: data.updated_at,
          };
          setProfile(loaded);
          return loaded;
        }

        // Profile row doesn't exist yet: insert default profile record
        const { data: inserted, error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: currentUser.id,
            email: currentUser.email,
            display_name: defaultDisplayName,
            full_name: fallbackProfile.full_name,
            avatar_url: fallbackProfile.avatar_url,
          })
          .select()
          .maybeSingle();

        if (insertError) {
          console.warn("[Auth] Could not create initial profile row:", insertError.message);
          setProfile(fallbackProfile);
          return fallbackProfile;
        }

        const newProfile: UserProfile = inserted
          ? {
              id: inserted.id,
              email: inserted.email || currentUser.email,
              display_name: inserted.display_name || defaultDisplayName,
              full_name: inserted.full_name || "",
              avatar_url: inserted.avatar_url || "",
              created_at: inserted.created_at,
              updated_at: inserted.updated_at,
            }
          : fallbackProfile;

        setProfile(newProfile);
        return newProfile;
      } catch (err: any) {
        console.warn("[Auth] Profile network exception:", err?.message);
        setProfile(fallbackProfile);
        return fallbackProfile;
      }
    },
    [isConfigured]
  );

  const refreshProfile = useCallback(async () => {
    await fetchProfile(user);
  }, [fetchProfile, user]);

  const updateProfile = useCallback(
    async (updates: {
      display_name?: string;
      full_name?: string;
      avatar_url?: string;
    }): Promise<{ error: Error | null }> => {
      if (!user) {
        return { error: new Error("Authentication required to update profile.") };
      }

      const supabase = getSupabase();
      if (!supabase || !isConfigured) {
        setProfile((prev) => (prev ? { ...prev, ...updates } : null));
        return { error: null };
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .update({
            display_name: updates.display_name,
            full_name: updates.full_name,
            avatar_url: updates.avatar_url,
          })
          .eq("id", user.id)
          .select()
          .maybeSingle();

        if (error) {
          return { error: new Error(error.message) };
        }

        if (data) {
          setProfile({
            id: data.id,
            email: data.email || user.email,
            display_name: data.display_name || updates.display_name,
            full_name: data.full_name ?? updates.full_name,
            avatar_url: data.avatar_url ?? updates.avatar_url,
            created_at: data.created_at,
            updated_at: data.updated_at,
          });
        } else {
          setProfile((prev) => (prev ? { ...prev, ...updates } : null));
        }

        return { error: null };
      } catch (err: any) {
        return { error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    [user, isConfigured]
  );

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
          setProfile(null);
        } else {
          setSession(data.session);
          const u = data.session?.user ?? null;
          setUser(u);
          if (u) {
            fetchProfile(u);
          } else {
            setProfile(null);
          }
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
      const u = newSession?.user ?? null;
      setUser(u);
      if (u) {
        fetchProfile(u);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isConfigured, fetchProfile]);

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
        profile,
        loading,
        isConfigured,
        authModalOpen,
        openAuthModal,
        closeAuthModal,
        signInWithOtp,
        verifyOtp,
        signOut,
        updateProfile,
        refreshProfile,
      },
    },
    children
  );
}

export const defaultAuthContext: AuthContextType = {
  user: null,
  session: null,
  profile: null,
  loading: false,
  isConfigured: false,
  authModalOpen: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
  signInWithOtp: async () => ({ error: new Error("AuthProvider not mounted") }),
  verifyOtp: async () => ({ error: new Error("AuthProvider not mounted") }),
  signOut: async () => ({ error: null }),
  updateProfile: async () => ({ error: new Error("AuthProvider not mounted") }),
  refreshProfile: async () => {},
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    return defaultAuthContext;
  }
  return context;
}

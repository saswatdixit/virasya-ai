/**
 * Virasya Supabase Authentication Types
 *
 * Defines the contract for user identity, sessions, and authentication lifecycle.
 * Binds directly to @supabase/supabase-js types.
 */

import type { User, Session, AuthError } from "@supabase/supabase-js";

export type AuthUser = User;
export type AuthSession = Session;
export type { AuthError };

export interface UserProfile {
  id: string;
  email?: string;
  full_name?: string;
  display_name?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isConfigured: boolean;
  authModalOpen: boolean;
  callbackError?: string | null;
  clearCallbackError?: () => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signInWithOtp: (email: string) => Promise<{ error: AuthError | Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: AuthError | Error | null }>;
  signOut: () => Promise<{ error: AuthError | Error | null }>;
  updateProfile: (updates: { display_name?: string; full_name?: string; avatar_url?: string }) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

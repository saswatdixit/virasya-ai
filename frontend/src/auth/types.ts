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

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  authModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signInWithOtp: (email: string) => Promise<{ error: AuthError | Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: AuthError | Error | null }>;
  signOut: () => Promise<{ error: AuthError | Error | null }>;
}

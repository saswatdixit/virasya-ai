/**
 * Virasya Supabase Client Module
 * Provides a safe, singleton Supabase client initialized strictly from environment variables.
 * Gracefully handles unconfigured / local-preview environments without crashing or leaking secrets.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read credentials safely from Vite environment variables or Node process.env in tests
const globalProcess =
  typeof globalThis !== "undefined"
    ? (globalThis as Record<string, any>).process
    : undefined;

const env =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : globalProcess?.env
    ? (globalProcess.env as Record<string, string | undefined>)
    : ({} as Record<string, string | undefined>);

const rawUrl = (env.VITE_SUPABASE_URL || "").trim();
const rawKey = (
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

export interface SupabaseConfigStatus {
  configured: boolean;
  urlConfigured: boolean;
  keyConfigured: boolean;
  isHttps: boolean;
  isServiceRoleDetected: boolean;
  message?: string;
}

export interface SupabaseConnectionResult {
  configured: boolean;
  connected: boolean;
  latencyMs?: number;
  error?: string;
  details?: string;
}

/**
 * Checks if a JWT token payload has the 'service_role' claim.
 * Service-role keys must NEVER be exposed to the browser.
 */
function checkIsServiceRoleKey(key: string): boolean {
  if (!key || !key.includes(".")) return false;
  try {
    const parts = key.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(atob(parts[1]));
      return payload.role === "service_role";
    }
  } catch {
    // If decoding fails, continue
  }
  return false;
}

/**
 * Evaluates the configuration state of Supabase without initializing the client.
 */
export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const urlConfigured = rawUrl.length > 0;
  const keyConfigured = rawKey.length > 0;
  const isHttps = /^https:\/\//i.test(rawUrl);
  const isServiceRoleDetected = checkIsServiceRoleKey(rawKey);

  const configured = urlConfigured && keyConfigured && !isServiceRoleDetected;

  let message = "Supabase is ready.";
  if (!urlConfigured && !keyConfigured) {
    message = "Supabase credentials are not configured in environment variables.";
  } else if (!urlConfigured) {
    message = "VITE_SUPABASE_URL is missing.";
  } else if (!keyConfigured) {
    message = "VITE_SUPABASE_PUBLISHABLE_KEY is missing.";
  } else if (isServiceRoleDetected) {
    message = "SECURITY WARNING: Service role key detected. Only the anon/publishable key may be used in the frontend.";
  }

  return {
    configured,
    urlConfigured,
    keyConfigured,
    isHttps,
    isServiceRoleDetected,
    message,
  };
}

/**
 * Indicates whether Supabase is properly configured in the current environment.
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().configured;
}

// Singleton client instance
let supabaseInstance: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase client, or null if unconfigured.
 * Guaranteed not to throw if environment variables are missing.
 */
export function getSupabase(): SupabaseClient | null {
  const status = getSupabaseConfigStatus();
  if (!status.configured) {
    return null;
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseInstance;
}

/**
 * Returns the Supabase client or throws if called when unconfigured.
 * Use getSupabase() for optional/safe access.
 */
export function getRequiredSupabase(): SupabaseClient {
  const client = getSupabase();
  if (!client) {
    const status = getSupabaseConfigStatus();
    throw new Error(`Cannot initialize Supabase: ${status.message}`);
  }
  return client;
}

/**
 * Performs a minimal connectivity and configuration check against the Supabase project.
 * Does not assume any tables exist yet.
 * Never logs or exposes API keys or tokens.
 */
export async function checkSupabaseConnection(): Promise<SupabaseConnectionResult> {
  const status = getSupabaseConfigStatus();

  if (!status.configured) {
    return {
      configured: false,
      connected: false,
      details: status.message,
    };
  }

  const client = getSupabase();
  if (!client) {
    return {
      configured: false,
      connected: false,
      error: "Client instantiation failed.",
    };
  }

  const start = performance.now();
  try {
    // Lightweight auth session check — reaches the Supabase Auth server directly
    // without requiring any custom database tables or schema migrations.
    const { error } = await client.auth.getSession();
    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      return {
        configured: true,
        connected: false,
        latencyMs,
        error: error.message || "Failed to establish session with Supabase Auth endpoint.",
      };
    }

    return {
      configured: true,
      connected: true,
      latencyMs,
      details: "Successfully connected to Supabase Auth endpoint.",
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      configured: true,
      connected: false,
      latencyMs,
      error: err.message || "Network error reaching Supabase URL.",
    };
  }
}

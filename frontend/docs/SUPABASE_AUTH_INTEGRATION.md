# Virasya — Supabase Authentication Integration Guide

## 1. Executive Summary & Design Philosophy

Virasya's authentication system is designed around sovereign archival principles:
- **Zero-Block Guest Access**: Storytellers can preserve oral narratives, record audio, and explore the archive freely without being forced to create an account.
- **Modal Dialogue Pattern**: Sign-in is delivered through an accessible native modal (`<AuthModal />`), preserving the visitor's context rather than redirecting to a disjointed, standalone screen.
- **Clean Architecture Boundary**: The active frontend defines strong TypeScript boundaries (`AuthUser`, `AuthSession`, `AuthContextType`) that match Supabase's API surface without prematurely requiring npm dependencies until credentials are ready.
- **Server-Side Secret Separation**: Only the public `anon` or publishable key is ever permitted in the browser. High-privilege service-role keys and AI provider keys (`GNANI_API_KEY`) remain strictly server-side.

---

## 2. Active Frontend Implementation

The frontend at `D:\Codes\gnani.ai\frontend` contains the authentic authentication UI and architecture:

### 2.1. Files Implemented

1. **`src/auth/types.ts`**
   - Defines `AuthUser`, `AuthSession`, `AuthError`, and `AuthContextType`.
   - Matches Supabase's shape without requiring `@supabase/supabase-js` to be installed prematurely.

2. **`src/auth/AuthContext.tsx`**
   - Context provider managing `user`, `session`, `loading`, `isConfigured`, and modal state (`authModalOpen`, `openAuthModal`, `closeAuthModal`).
   - Checks `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`.
   - In offline preview mode, gracefully informs the user without throwing runtime exceptions or pretending authentication succeeded.

3. **`src/auth/AuthModal.tsx` & `src/auth/auth.css`**
   - Authentic modal UI with Virasya cream/ink styling, accessible focus handling, backdrop click dismiss, OTP input formatting, and "Continue as Guest" fallback.

4. **`src/components/layout/Header.tsx`**
   - Desktop `.nav-profile` button and mobile menu profile action call `openAuthModal()`.
   - Displays a green indicator dot (`.nav-profile-active-dot`) when the archivist is authenticated.

5. **`src/app/App.tsx`**
   - Root application wrapped in `<AuthProvider>` with `<AuthModal />` mounted globally.
   - Deep-linking support: Loading `/login`, `/profile`, or `/signup` directly renders the main layout and triggers `openAuthModal()`. When closed, URL cleanly reverts to `/`.

6. **Removed Obsolete Standalone Screens**
   - Removed `src/login/LoginPage.tsx` and `src/login/login.css` in favor of the modal dialogue.

---

## 3. Environment Variables

When configuring Supabase for production or staging, configure these variables in `.env` or Vite environment:

```env
# Supabase Project Endpoint (must use https)
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co

# Supabase Anonymous/Publishable Client Key (NEVER use service_role key here)
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> [!CAUTION]
> Never place `SUPABASE_SERVICE_ROLE_KEY` or `GNANI_API_KEY` into `frontend/.env` or Vite client-exposed variables.

---

## 4. Supabase Client & Lifecycle Integration Reference

When ready to install `@supabase/supabase-js`, use the following production-tested singleton client pattern:

```typescript
/**
 * src/supabase/client.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export interface SupabaseConfigStatus {
  configured: boolean;
  urlConfigured: boolean;
  keyConfigured: boolean;
  isHttps: boolean;
  isServiceRoleDetected: boolean;
  message?: string;
}

function checkIsServiceRoleKey(key: string): boolean {
  if (!key || !key.includes(".")) return false;
  try {
    const parts = key.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(atob(parts[1]));
      return payload.role === "service_role";
    }
  } catch {
    // ignore decoding errors
  }
  return false;
}

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
    message = "VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY is missing.";
  } else if (isServiceRoleDetected) {
    message = "SECURITY WARNING: Service role key detected. Only the anon/publishable key may be used in the frontend.";
  }

  return { configured, urlConfigured, keyConfigured, isHttps, isServiceRoleDetected, message };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().configured;
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const status = getSupabaseConfigStatus();
  if (!status.configured) return null;

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
```

---

## 5. Next Steps for Full Supabase Activation

When the user requests activating live Supabase Auth:
1. Run `npm --prefix frontend install @supabase/supabase-js`.
2. Add `src/supabase/client.ts` using the reference implementation above.
3. In `frontend/src/auth/AuthContext.tsx`, hook up `getSupabase().auth.onAuthStateChange` and live `signInWithOtp` / `verifyOtp` calls.
4. Verify email delivery or OTP codes with a live Supabase project.

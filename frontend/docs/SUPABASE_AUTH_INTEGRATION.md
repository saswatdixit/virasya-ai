# Virasya — Supabase Authentication Integration Guide

## 1. Executive Summary & Design Philosophy

Virasya's authentication system is designed around sovereign archival principles:
- **Zero-Block Guest Access**: Storytellers can preserve oral narratives, record audio, and explore the archive freely without being forced to create an account.
- **Modal Dialogue Pattern**: Sign-in is delivered through an accessible native modal (`<AuthModal />`), preserving the visitor's context rather than redirecting to a disjointed, standalone screen.
- **Clean Architecture Boundary**: The active frontend defines strong TypeScript boundaries (`AuthUser`, `AuthSession`, `AuthContextType`) that match Supabase's API surface.
- **Server-Side Secret Separation**: Only the public `anon` or publishable client key is ever permitted in the browser. High-privilege service-role keys and AI provider keys (`GNANI_API_KEY`) remain strictly server-side.

---

## 2. Active Frontend Implementation

The frontend located in the `frontend/` directory contains the authentic authentication UI and architecture:

### 2.1. Files Implemented

1. **`src/auth/types.ts`**
   - Defines `AuthUser`, `AuthSession`, `AuthError`, and `AuthContextType`.
   - Represents user profile metadata (`UserProfile`: `id`, `email`, `display_name`, `avatar_url`).

2. **`src/auth/AuthContext.ts`**
   - Application-wide context provider managing `user`, `session`, `loading`, `isConfigured`, and modal state (`authModalOpen`, `openAuthModal`, `closeAuthModal`).
   - Uses the singleton Supabase client from `src/supabase/client.ts`.
   - Subscribes to authentication lifecycle changes via `supabase.auth.onAuthStateChange` with automatic session refresh and token persistence.
   - Automatically synchronizes authenticated user profile records with the `public.profiles` database table.
   - In offline/unconfigured preview mode, gracefully informs the user without throwing runtime exceptions or pretending authentication succeeded.

3. **`src/auth/AuthModal.tsx` & `src/auth/auth.css`**
   - Authentic modal UI with Virasya cream/ink styling, accessible focus handling, backdrop click dismiss, OTP input formatting, and "Continue as Guest" fallback.

4. **`src/components/layout/Header.tsx`**
   - Desktop `.nav-profile` button and mobile menu profile action call `openAuthModal()`.
   - Displays a green indicator dot (`.nav-profile-active-dot`) when the archivist is authenticated.

5. **`src/app/App.tsx`**
   - Root application wrapped in `<AuthProvider>` with `<AuthModal />` mounted globally.
   - Deep-linking support: Loading `/login`, `/profile`, or `/signup` directly renders the main layout and triggers `openAuthModal()`. When closed, URL cleanly reverts to `/`.

---

## 3. Environment Variables

When configuring Supabase for production or staging, configure these variables in `frontend/.env.local` or hosting provider settings (Vercel):

```env
# Supabase Project Endpoint (must use https)
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co

# Supabase Anonymous/Publishable Client Key (NEVER use service_role key here)
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
# Note: VITE_SUPABASE_ANON_KEY is also accepted as a backward-compatible alias
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> [!CAUTION]
> Never place `SUPABASE_SERVICE_ROLE_KEY` or `GNANI_API_KEY` into `frontend/.env` or Vite client-exposed variables. The frontend client validates at runtime that no `service_role` key is provided.

---

## 4. Supabase Client Architecture (`src/supabase/client.ts`)

The frontend uses `@supabase/supabase-js` (`^2.118.0`) configured as a singleton with runtime safety checks:

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Validates URL format and rejects service_role keys in the browser bundle
export function getSupabaseConfigStatus(): SupabaseConfigStatus;
export function isSupabaseConfigured(): boolean;
export function getSupabase(): SupabaseClient | null;
```

---

## 5. Live Supabase Activation Checklist

To connect the application to a live Supabase project:
1. Provide valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local` or Vercel environment variables.
2. Ensure the database migrations in `supabase/migrations/` have been executed on the target instance (creates `profiles`, `stories`, `vocabulary`, RLS policies, and triggers).
3. In Supabase Dashboard > Authentication > URL Configuration, set:
   - **Site URL:** `https://your-domain.vercel.app` (or `http://localhost:5173` for local dev)
   - **Redirect URLs:** `https://your-domain.vercel.app/**`
4. In Supabase Dashboard > Authentication > Providers > Email, enable Email provider (Magic Link / OTP).

---

## 6. Python Backend Authentication Boundary (`virasya_ai.web.server`)

The Python backend studio server does **not** manage its own user accounts, database credentials, or password hashes. Instead:
- When `VIRASYA_REQUIRE_AUTH=false` (default for local development), all endpoints are accessible without authentication headers.
- When `VIRASYA_REQUIRE_AUTH=true`:
  1. Incoming requests to `/api/upload`, `/api/audio/<filename>`, `/api/save`, and `/api/stories/<id>/preserve` must supply an `Authorization: Bearer <token>` header.
  2. The Python server extracts the Bearer token and verifies it by querying Supabase Auth's user endpoint: `GET {SUPABASE_URL}/auth/v1/user`.
  3. If the token is valid, the request proceeds with the verified `user_id`; otherwise, the server returns `401 Unauthorized`.
- Requires `SUPABASE_URL` and optionally `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` configured in `virasya-ai/.env`.

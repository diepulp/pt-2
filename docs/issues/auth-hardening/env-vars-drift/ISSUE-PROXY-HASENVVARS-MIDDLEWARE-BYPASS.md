# ISSUE: Proxy Session Refresh Silently Disabled by `hasEnvVars` Mismatch

**Status:** Open
**Severity:** High
**Category:** Auth / Session Management
**Discovered:** 2026-02-17
**Blocked by:** ISSUE-ENV-EXAMPLE-VAR-NAME-DRIFT (root cause — env var name mismatch must be fixed first)
**Symptom:** Logout overlay (sidebar NavUser) disappears after hard refresh (CTRL+SHIFT+R); user is redirected to `/signin` when access token expires server-side.

---

## Summary

The `hasEnvVars` guard in `lib/utils.ts` checks for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, but the `.env` file and all Supabase client files use `NEXT_PUBLIC_SUPABASE_ANON_KEY`. This mismatch causes `hasEnvVars` to always evaluate as falsy, which makes `proxy.ts` → `updateSession()` return early on every request without calling `getClaims()`. The Supabase session is never refreshed server-side.

## Root Cause

**File:** `lib/utils.ts:11-13`

```typescript
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY; // ← not in .env
```

**File:** `lib/supabase/middleware.ts:13-15`

```typescript
if (!hasEnvVars) {
  return supabaseResponse; // ← always exits here
}
```

The `.env` file defines `NEXT_PUBLIC_SUPABASE_ANON_KEY`. All three Supabase client files (`client.ts`, `server.ts`, `middleware.ts`) reference `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The `.env.example` template uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, creating the naming drift.

## Impact

| Scenario | Behavior |
|---|---|
| Client-side navigation | Works — browser Supabase SDK handles token refresh |
| Hard refresh (token valid) | Works — server reads valid cookie, page renders |
| Hard refresh (token expired) | **Broken** — server can't refresh token, `getUser()` returns null, user redirected to `/signin` |
| Lock screen + hard refresh | **Broken** — Zustand store resets to `isLocked: false`, overlay vanishes (secondary issue) |

Default Supabase access token TTL is 1 hour. After that window, any hard refresh silently logs the user out because the proxy never calls `getClaims()` to refresh the JWT.

## Reproduction

1. Sign in to the dashboard
2. Wait >1 hour (or manually expire the access token)
3. Press CTRL+SHIFT+R
4. Observe redirect to `/signin` instead of the dashboard with the logout sidebar

## Fix

**`lib/utils.ts`** — align the env var name:

```diff
 export const hasEnvVars =
   process.env.NEXT_PUBLIC_SUPABASE_URL &&
-  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;
+  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```

**`.env.example`** — align the template (optional, for consistency):

```diff
 NEXT_PUBLIC_SUPABASE_URL=your-project-url
-NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key
+NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Secondary Issue: Lock Screen State Not Persisted

The Zustand lock store (`store/lock-store.ts`) is purely in-memory. On hard refresh, `isLocked` resets to `false`, bypassing the lock screen entirely. This is a separate concern but compounds the auth-on-refresh problem.

**Potential fix:** Add Zustand `persist` middleware with `sessionStorage` to survive hard refreshes within the same tab.

## Related Files

- `lib/utils.ts` — `hasEnvVars` definition
- `proxy.ts` — Next.js 16 proxy entry point
- `lib/supabase/middleware.ts` — `updateSession()` with `hasEnvVars` guard
- `lib/supabase/server.ts` — server client (`setAll` silently fails in Server Components)
- `app/(dashboard)/layout.tsx` — server-side `getUser()` auth gate
- `store/lock-store.ts` — in-memory lock state
- `.env.example` — template with mismatched var name

## ADR Cross-References

- ADR-030: Auth pipeline hardening
- ADR-024: Authoritative context derivation

# ISSUE: Proxy Session Refresh Silently Disabled by `hasEnvVars` Mismatch

**Status:** Fixed (b5ca17f) — but does NOT resolve the observed symptom (see Investigation Notes)
**Severity:** High
**Category:** Auth / Session Management
**Discovered:** 2026-02-17
**Blocked by:** ISSUE-ENV-EXAMPLE-VAR-NAME-DRIFT (root cause — env var name mismatch, fixed in same commit)
**Symptom:** After hard refresh (CTRL+SHIFT+R), the lock screen overlay vanishes and the user sees the protected layout underneath — bypassing the overlay entirely. The user is never redirected to `/signin`.

---

## Summary

The `hasEnvVars` guard in `lib/utils.ts` checked for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, but the `.env` file and all Supabase client files use `NEXT_PUBLIC_SUPABASE_ANON_KEY`. This mismatch caused `hasEnvVars` to always evaluate as falsy, which made `proxy.ts` → `updateSession()` return early on every request without calling `getClaims()`. The Supabase session was never refreshed server-side.

**Fixed in b5ca17f** — middleware now calls `getClaims()` correctly.

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

The `.env` file defines `NEXT_PUBLIC_SUPABASE_ANON_KEY`. All three Supabase client files (`client.ts`, `server.ts`, `middleware.ts`) reference `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The `.env.example` template used `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, creating the naming drift.

## Impact

| Scenario | Behavior |
|---|---|
| Client-side navigation | Works — browser Supabase SDK handles token refresh |
| Hard refresh (token valid) | Layout renders, but lock screen overlay vanishes (Zustand resets) |
| Hard refresh (token expired) | Same — overlay vanishes, protected layout exposed |
| Lock screen + hard refresh | **Broken** — Zustand store resets to `isLocked: false`, overlay vanishes |

## Reproduction

1. Sign in to the dashboard
2. Lock the screen (via NavUser dropdown or idle timeout)
3. Press CTRL+SHIFT+R
4. Observe the lock screen overlay vanishes and the protected dashboard layout is exposed

Note: Token expiry is irrelevant to reproduction. The overlay vanishes on ANY hard refresh while locked, regardless of token state.

## Fix (Applied)

**`lib/utils.ts`** — aligned the env var name:

```diff
 export const hasEnvVars =
   process.env.NEXT_PUBLIC_SUPABASE_URL &&
-  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;
+  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```

**`.env.example`** — aligned the template:

```diff
 NEXT_PUBLIC_SUPABASE_URL=your-project-url
-NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key
+NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Investigation Notes (2026-02-18)

### hasEnvVars is NOT the culprit for the overlay symptom

The hasEnvVars fix corrected a real middleware pipeline defect (session refresh was silently disabled). However, it has no bearing on the observed symptom — the lock screen overlay vanishing on hard refresh.

**Actual cause:** `store/lock-store.ts` is a pure in-memory Zustand store. On hard refresh, the browser destroys all JS state. The store reinitializes with `isLocked: false`. `LockScreenProvider` reads `false` and renders nothing. The overlay vanishes.

This happens on every hard refresh regardless of:
- Whether the hasEnvVars fix is applied
- Whether the access token is valid or expired
- Whether `getClaims()` runs or not

**Flow on hard refresh (with lock active):**

1. Browser destroys all client JS state (Zustand, React, TanStack cache)
2. Middleware runs → `getClaims()` refreshes session → user is authenticated
3. `(dashboard)/layout.tsx` → `getUser()` succeeds → renders layout + `<LockScreenProvider />`
4. `lock-store.ts` initializes fresh: `isLocked: false`
5. `LockScreenProvider`: `if (!isLocked) return null` → no overlay
6. User sees unprotected dashboard

**The lock screen overlay is non-functional as a security boundary.** It is defeated by a single browser refresh. The fix is in `store/lock-store.ts`, not in the auth pipeline.

See: ISSUE-LOCK-SCREEN-NOT-PERSISTED (to be filed)

## Related Files

- `lib/utils.ts` — `hasEnvVars` definition (fixed)
- `proxy.ts` — Next.js 16 proxy entry point
- `lib/supabase/middleware.ts` — `updateSession()` (fixed — hasEnvVars guard removed, fail-loud assertion added)
- `lib/supabase/server.ts` — server client (`setAll` silently fails in Server Components)
- `app/(dashboard)/layout.tsx` — server-side `getUser()` auth gate
- `store/lock-store.ts` — **in-memory lock state (PRIMARY CAUSE of overlay symptom)**
- `components/layout/lock-screen-provider.tsx` — reads `isLocked`, renders nothing when `false`
- `.env.example` — template var name (fixed)

## ADR Cross-References

- ADR-030: Auth pipeline hardening
- ADR-024: Authoritative context derivation

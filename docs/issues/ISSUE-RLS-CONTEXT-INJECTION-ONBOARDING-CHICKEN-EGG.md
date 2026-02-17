# ISSUE: RLS Context Injection Fails During Onboarding Setup Wizard

**Status:** Open
**Severity:** P1 — Blocks new user onboarding at Step 1
**Reported:** 2026-02-16
**Error:** `[RLS] context injection failed: UNAUTHORIZED: staff identity not found (correlationId=68da623a-059a-47c0-833f-4dd04164a28a)`
**Component:** Auth pipeline / Setup wizard server actions

---

## Symptom

A newly registered user completes bootstrap (`/bootstrap`) and lands on the setup wizard (`/setup`). The page renders correctly, but clicking "Next" on Step 1 (Casino Basics) fails with:

```
UNAUTHORIZED: staff identity not found
```

The error originates from `set_rls_context_from_staff()` RPC, raised at migration `20260208140547` line 173-175.

---

## Root Cause Analysis

Two distinct failures in the middleware chain depending on environment:

### Failure 1: Dev Auth Bypass — `withRLS()` Overwrites Dev Context (Confirmed)

**Call stack:**

```
updateCasinoSettingsAction(formData)                  _actions.ts:205
  └─ withServerAction(supabase, handler, {})          compositor.ts:80
       └─ withTracing()
       └─ withAuth()                                  auth.ts:30
            isDevAuthBypassEnabled() === true
            ctx.rlsContext = DEV_RLS_CONTEXT           ✓
            ctx.supabase = createServiceClient()       ✓
            return next()                              ✓
       └─ withRLS()                                   rls.ts:24
            injectRLSContext(ctx.supabase, ...)        rls-context.ts:85
              ↓ ctx.supabase is SERVICE CLIENT (no auth.uid())
              supabase.rpc('set_rls_context_from_staff')
              ↓ RPC: auth.uid() → NULL (service client)
              ↓ RPC: staff_id JWT claim → NULL (service client)
              ↓ Fallback: SELECT FROM staff WHERE user_id = NULL → no match
              ↓ v_staff_id IS NULL
              RAISE EXCEPTION 'UNAUTHORIZED: staff identity not found'  ❌
```

**Root cause:** `withRLS()` (`rls.ts:27-32`) unconditionally calls the RPC and overwrites `ctx.rlsContext`, even when `withAuth()` already set valid context via dev bypass. The service role client has no `auth.uid()`, so the RPC always fails.

**Contrast with bootstrap:** The bootstrap action (`bootstrap/_actions.ts:39`) correctly uses `skipAuth: true`, which bypasses both `withAuth()` and `withRLS()`. Setup wizard actions pass no options, so the full middleware chain runs.

### Failure 2: Production JWT Staleness (Secondary)

After bootstrap completes in production:

1. `rpc_bootstrap_casino()` atomically creates casino + casino_settings + staff record
2. `reconcileStaffClaims()` calls `syncUserRLSClaims()` → updates `raw_app_meta_data` via admin API (`auth-admin.ts:70`)
3. The cookie JWT was minted **before** these claims existed (3600s default TTL)
4. `BootstrapForm` (`bootstrap-form.tsx:52`) does NOT call `supabase.auth.refreshSession()` — the 1500ms delay does not refresh the JWT
5. User navigates to `/setup` → page renders (uses `getUser()` which hits auth API, returns updated metadata)
6. User clicks "Next" → server action creates Supabase client from cookie JWT (stale)
7. `withAuth()` → `getAuthContext()` → queries `staff` table via PostgREST with stale JWT
8. RLS policy: `casino_id = COALESCE(NULLIF(current_setting('app.casino_id'), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)` → both NULL → no match
9. Staff query returns null → throws "FORBIDDEN: User is not active staff"

| Environment | Fails At | Error | Source |
|---|---|---|---|
| Dev bypass | `withRLS()` | `UNAUTHORIZED: staff identity not found` | `rls.ts:34` → RPC |
| Production (fresh JWT) | `withAuth()` | `FORBIDDEN: User is not active staff` | `auth.ts:62` → RLS |

**Note:** In production, the RPC fallback path (`staff WHERE user_id = auth.uid()`) inside `set_rls_context_from_staff()` WOULD succeed because:
- `auth.uid()` is always present for authenticated users (reads JWT `sub` claim)
- The function is `SECURITY DEFINER` (bypasses RLS)
- But `withAuth()` fails first, so `withRLS()` never runs

---

## Affected Files

### Core middleware
- `lib/server-actions/middleware/rls.ts` — `withRLS()` unconditionally calls RPC (line 27-32)
- `lib/server-actions/middleware/auth.ts` — `withAuth()` dev bypass sets context (line 34-46)
- `lib/server-actions/middleware/compositor.ts` — Chain composition (line 114-117)
- `lib/supabase/rls-context.ts` — `injectRLSContext()` calls RPC (line 89)

### Setup wizard
- `app/(onboarding)/setup/_actions.ts` — All 8 server actions use default middleware (no `skipAuth`)
- `app/(onboarding)/setup/page.tsx` — Page-level dev bypass wired (commit `cad21c7`), but actions not covered

### Bootstrap (correct pattern for reference)
- `app/(onboarding)/bootstrap/_actions.ts` — Uses `skipAuth: true` (line 39)
- `components/onboarding/bootstrap-form.tsx` — Missing `refreshSession()` call (line 52)

### RPC
- `supabase/migrations/20260208140547_prd025_rpc_bootstrap_gap4.sql` — `set_rls_context_from_staff()` lines 152-176

---

## Proposed Fixes

### Fix 1: Make `withRLS()` respect dev bypass (Critical)

In `lib/server-actions/middleware/rls.ts`, skip RPC injection when dev bypass already populated context:

```typescript
import { isDevAuthBypassEnabled } from '@/lib/supabase/dev-context';

export function withRLS<T>(): Middleware<T> {
  return async (ctx: MiddlewareContext, next) => {
    // DEV BYPASS: Context already set by withAuth() — skip RPC injection.
    // Service client has no auth.uid(), so the RPC would always fail.
    if (ctx.rlsContext && isDevAuthBypassEnabled()) {
      return next();
    }

    try {
      const rpcContext = await injectRLSContext(ctx.supabase, ctx.correlationId);
      ctx.rlsContext = rpcContext;
      return next();
    } catch (error) {
      throw new DomainError('INTERNAL_ERROR', 'Failed to inject RLS context', {
        details: error,
      });
    }
  };
}
```

**ADR compliance:** ADR-030 INV-030-3 explicitly requires `NODE_ENV=development` AND `ENABLE_DEV_AUTH=true` for bypass. This check is already enforced by `isDevAuthBypassEnabled()`.

### Fix 2: Force JWT refresh after bootstrap (Production)

In `components/onboarding/bootstrap-form.tsx`, refresh the session before redirecting so the cookie JWT carries the new `staff_id`/`casino_id`/`staff_role` claims:

```typescript
import { createClient } from '@/lib/supabase/client'; // browser client

useEffect(() => {
  if (state?.code === 'OK') {
    const refreshAndRedirect = async () => {
      const supabase = createClient();
      await supabase.auth.refreshSession(); // Mint new JWT with updated claims
      router.push('/start');
    };
    refreshAndRedirect();
  }
}, [state, router]);
```

This eliminates the 1500ms race and ensures the JWT has claims before any RLS-gated query runs.

---

## ADR/SEC References

- **ADR-024** — `set_rls_context_from_staff()` authoritative context derivation
- **ADR-030 INV-030-1** — `ctx.rlsContext` must come from RPC return value (production)
- **ADR-030 INV-030-3** — Dev bypass requires `NODE_ENV=development` + `ENABLE_DEV_AUTH=true`
- **SEC-001** — Pattern C hybrid RLS (COALESCE with JWT fallback)

## Validation Checklist

- [ ] Fix 1 applied: `withRLS()` skips RPC when dev bypass active
- [ ] Fix 2 applied: `BootstrapForm` calls `refreshSession()` before redirect
- [ ] Dev bypass: Step 1 "Next" succeeds with `ENABLE_DEV_AUTH=true`
- [ ] Production: Fresh registration → bootstrap → setup wizard Step 1 succeeds
- [ ] Existing server actions with real auth still call RPC (no regression)
- [ ] `skipAuth` actions (bootstrap) still work unchanged

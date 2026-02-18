---
id: IMPL-PLAN-HASENVVARS-MIDDLEWARE-BYPASS
title: "Implementation Plan — Fix hasEnvVars Auth Middleware Bypass + Env Drift Hardening"
status: ready
owner: PT-2 / Auth & Middleware
created: 2026-02-17
last_updated: 2026-02-17
source: FINDINGS-HASENVVARS-MIDDLEWARE-BYPASS
checklist: FIX-PR-CHECKLIST-HASENVVARS-MIDDLEWARE-BYPASS
---

# Implementation Plan: Fix hasEnvVars Auth Middleware Bypass + Env Drift Hardening

## Context

`hasEnvVars` in `lib/utils.ts:13` checks `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` — a variable that doesn't exist. The real variable is `NEXT_PUBLIC_SUPABASE_ANON_KEY`. This makes `hasEnvVars` permanently falsy, which causes `lib/supabase/middleware.ts:13` to return early on **every request**, silently disabling the entire server-side auth pipeline: no session refresh, no token rotation, no edge-level route protection. After ~1hr token expiry, users are logged out on hard refresh.

Three parallel expert investigations confirmed: system fails closed (no data exposure), but the operational impact is HIGH — silent logouts, lock screen deadlocks, zero observability.

Source: `docs/issues/auth-hardening/FINDINGS-HASENVVARS-MIDDLEWARE-BYPASS.md`

---

## Approach: Single PR covering P0 + P1 + P2

**6 files modified. No new files. No new abstractions.**

---

### Step 1: Fix `hasEnvVars` var name (P0)

**File:** `lib/utils.ts:13`

Change `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

This restores `hasEnvVars` to truthy when env is correctly configured. Fixes both consumers:
- `lib/supabase/middleware.ts:13` — middleware proceeds to session refresh
- `app/protected/layout.tsx:25` — renders `<AuthButton />` instead of `<EnvVarWarning />`

---

### Step 2: Remove silent middleware bypass (P0)

**File:** `lib/supabase/middleware.ts`

**Remove** the `hasEnvVars` import and the `if (!hasEnvVars)` early return block (lines 4, 12-15).

**Rationale:**
- The guard was scaffolding from the Supabase starter template (comment says "can be removed, tutorial purposes")
- Silent bypass is the root architectural failure — config drift silently disabled security
- `createServerClient` on line 19-20 already uses `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!` — if these are truly missing, the SDK will error at the call site, which is the correct fail-loud behavior
- Removing the guard eliminates the entire class of "env name mismatch silently bypasses auth"

**After removal**, middleware always proceeds to `createServerClient` → `getClaims()` → route ACL. No conditional skip path exists.

---

### Step 3: Align `.env.example` (P1)

**File:** `.env.example:4`

Change `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`

Also add missing `SUPABASE_SERVICE_ROLE_KEY` (required by `lib/supabase/service.ts:30` but absent from template):
```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

### Step 4: Align `.env.test.example` (P1)

**File:** `.env.test.example:9`

Change `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-local-anon-key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key`

---

### Step 5: Align `e2e/README.md` (P2)

**File:** `e2e/README.md`

- Line 22: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-local-anon-key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key`
- Line 30: `Use 'anon key' for 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY'` → `Use 'anon key' for 'NEXT_PUBLIC_SUPABASE_ANON_KEY'`

---

### Step 6: Run verification

1. **Type check:** `npm run type-check` — confirm no TypeScript errors from removing `hasEnvVars` import in middleware.ts
2. **Lint:** `npm run lint` — confirm no lint errors
3. **Build:** `npm run build` — confirm production build succeeds with middleware changes
4. **Grep:** Search for any remaining `PUBLISHABLE_OR_ANON_KEY` references in runtime code (non-doc files) to confirm zero drift remains

---

## Files Modified (Complete List)

| File | Change |
|------|--------|
| `lib/utils.ts:13` | Fix env var name |
| `lib/supabase/middleware.ts:4,12-15` | Remove `hasEnvVars` import + silent bypass guard |
| `.env.example:4` | Fix var name + add `SUPABASE_SERVICE_ROLE_KEY` |
| `.env.test.example:9` | Fix var name |
| `e2e/README.md:22,30` | Fix var name in docs |

## Files NOT Modified (and why)

| File | Reason |
|------|--------|
| `app/protected/layout.tsx` | No change needed — fixed `hasEnvVars` from Step 1 makes it work correctly |
| `store/lock-store.ts` | Lock screen persistence is a separate issue (PR#2 per checklist) |
| `lib/supabase/server.ts` | Silent cookie catch is a pre-existing pattern, not caused by this bug |

## Out of Scope

- Centralized env validation module (P3 — needs Over-Engineering Guardrail trigger)
- Lock screen Zustand persistence (separate PR)
- E2E token-expiry regression test (separate PR)
- CI env-key-match guard (separate PR)
- Stub route handler auth (future work)

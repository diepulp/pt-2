---
id: IMPL-PLAN-HASENVVARS-MIDDLEWARE-BYPASS
title: "Implementation Plan — Fix hasEnvVars Auth Middleware Bypass + Env Drift Hardening"
status: ready
owner: PT-2 / Auth & Middleware
created: 2026-02-17
last_updated: 2026-02-17
source: FINDINGS-HASENVVARS-MIDDLEWARE-BYPASS
checklist: FIX-PR-CHECKLIST-HASENVVARS-MIDDLEWARE-BYPASS
revision: 1
revision_notes: "Folded audit/critique: fail-loud assertion, runtime acceptance tests, guard de-risking, follow-up tickets."
---

# Implementation Plan: Fix hasEnvVars Auth Middleware Bypass + Env Drift Hardening

## Context

`hasEnvVars` in `lib/utils.ts:13` checks `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` — a variable that doesn't exist. The real variable is `NEXT_PUBLIC_SUPABASE_ANON_KEY`. This makes `hasEnvVars` permanently falsy, which causes `lib/supabase/middleware.ts:13` to return early on **every request**, silently disabling the entire server-side auth pipeline: no session refresh, no token rotation, no edge-level route protection. After ~1hr token expiry, users are logged out on hard refresh.

Three parallel expert investigations confirmed: system fails closed (no data exposure), but the operational impact is HIGH — silent logouts, lock screen deadlocks, zero observability.

Source: `docs/issues/auth-hardening/FINDINGS-HASENVVARS-MIDDLEWARE-BYPASS.md`

---

## Approach: Single PR covering P0 + P1 + P2

**6 files modified. No new files. Minimal new code.**

> Audit note: “No new abstractions” stays, but we add **one tiny fail-loud assertion** so missing env fails with an actionable message (rather than relying on SDK explosions).

---

## P0 — Restore Runtime Correctness

### Step 1: Fix `hasEnvVars` var name (P0)

**File:** `lib/utils.ts:13`

Change `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

This restores `hasEnvVars` to truthy when env is correctly configured. Fixes both consumers:
- `lib/supabase/middleware.ts:13` — middleware proceeds to session refresh
- `app/protected/layout.tsx:25` — renders `<AuthButton />` instead of `<EnvVarWarning />`

> Audit note: Keeping `hasEnvVars` around is a potential future drift point. See “Guard de-risking” below.

---

### Step 2: Remove silent middleware bypass (P0)

**File:** `lib/supabase/middleware.ts`

**Remove** the `hasEnvVars` import and the `if (!hasEnvVars)` early return block (lines 4, 12-15).

**Rationale:**
- The guard was scaffolding from the Supabase starter template (comment says "can be removed, tutorial purposes")
- Silent bypass is the root architectural failure — config drift silently disabled security
- Removing the guard eliminates the entire class of "env name mismatch silently bypasses auth"

**After removal**, middleware always proceeds to `createServerClient` → `getClaims()` → route ACL. No conditional skip path exists.

---

### Step 2.1: Add a fail-loud env assertion (P0, minimal code)

**File:** `lib/supabase/middleware.ts` (same file, no new module)

Add a tiny helper near the top:

- Validate presence of:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Behavior:**
- **Dev/CI:** throw with an actionable message if missing.
- **Prod:** log fatal and fail closed (500) rather than silently bypassing.

**Why (audit):**
Relying on “the SDK will error” is late/opaque and runtime-dependent (edge vs node). The goal is a **clear** failure mode that explains what’s missing.

---

## P1 — Stop Template Drift (align new setups)

### Step 3: Align `.env.example` (P1)

**File:** `.env.example:4`

Change `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`

Also add missing `SUPABASE_SERVICE_ROLE_KEY` (required by `lib/supabase/service.ts:30` but absent from template):
```
# SERVER-ONLY: never expose via NEXT_PUBLIC_*
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> Audit note: The comment is deliberate. People will otherwise paste secrets into `NEXT_PUBLIC_*` like animals.

---

### Step 4: Align `.env.test.example` (P1)

**File:** `.env.test.example:9`

Change `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-local-anon-key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key`

---

## P2 — Doc Drift Fix (low risk)

### Step 5: Align `e2e/README.md` (P2)

**File:** `e2e/README.md`

- Line 22: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-local-anon-key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key`
- Line 30: `Use 'anon key' for 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY'` → `Use 'anon key' for 'NEXT_PUBLIC_SUPABASE_ANON_KEY'`

---

## Guard de-risking (tighten the remaining `hasEnvVars` usage)

`hasEnvVars` remains used by `app/protected/layout.tsx` to show `<EnvVarWarning />`.

Choose one of these (do now, still minimal):

- **Option A (preferred):** Rename to `hasPublicSupabaseEnv()` and ensure it checks only the canonical keys (`URL` + `ANON_KEY`). Document “UX-only; never used for security paths.”
- **Option B:** Remove the warning mechanism entirely and rely on the middleware assertion to fail-loud during dev.

> Audit note: Leaving a generic `hasEnvVars` helper around invites reintroducing “env drift disables core behavior” through a different door.

---

## Verification (expanded: runtime correctness, not just build green)

### Step 6: Run verification (build + runtime)

#### A) Build-time verification
1. **Type check:** `npm run type-check`
2. **Lint:** `npm run lint`
3. **Build:** `npm run build`
4. **Grep:** confirm **zero** runtime references to `PUBLISHABLE_OR_ANON_KEY`
   - Target: **0 occurrences** outside historical/archived docs; ideally 0 overall.

#### B) Runtime acceptance tests (do not skip)
1. **Hard refresh auth stays valid**
   - Sign in → navigate to protected route → hard refresh → user remains authenticated.
2. **Token expiry path**
   - Sign in → wait ~1hr OR force expiry (cookie delete / time travel) → hard refresh protected route → user remains authenticated.

#### C) Optional temporary instrumentation
Add temporary dev-only logs in middleware:
- entered middleware
- env assertion passed/failed
- updateSession called

Remove before merge or gate behind `NODE_ENV !== 'production'`.

---

## Files Modified (Complete List)

| File | Change |
|------|--------|
| `lib/utils.ts:13` | Fix env var name |
| `lib/supabase/middleware.ts` | Remove bypass guard; add env assertion (minimal) |
| `.env.example` | Fix var name; add `SUPABASE_SERVICE_ROLE_KEY` + comment |
| `.env.test.example` | Fix var name |
| `e2e/README.md` | Fix var name in docs |

---

## Files NOT Modified (and why)

| File | Reason |
|------|--------|
| `app/protected/layout.tsx` | No direct change required; consider guard de-risking options above |
| `store/lock-store.ts` | Lock persistence is a separate issue (PR#2 per checklist) |
| `lib/supabase/server.ts` | Silent cookie catch is pre-existing pattern, not caused by this bug |

---

## Out of Scope (explicit follow-up tickets so it doesn’t rot)

These are intentionally not in this PR, but must be tracked as follow-ups:

1. **P3: Centralized env validation module (Zod)**
   - DoD: no raw `process.env` outside env module; clear server/client split.

2. **P3: CI env-key-match guard**
   - DoD: CI fails if `.env.example` / `.env.test.example` drift from env module keys.

3. **P3: E2E regression test (token expiry + hard refresh)**
   - DoD: automated test catches this class of bug.

4. **PR#2: Lock screen refresh persistence**
   - DoD: lock state persists across refresh (sessionStorage) if that’s the intended UX/security posture.

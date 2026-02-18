---
id: FINDINGS-HASENVVARS-MIDDLEWARE-BYPASS
title: "Consolidated Findings — hasEnvVars Guard Silently Disables Auth Middleware"
status: confirmed
severity: HIGH (Availability) / MEDIUM (Security)
owner: PT-2 / Auth & Middleware
created: 2026-02-17
last_updated: 2026-02-17
related_issues:
  - ISSUE-ENV-EXAMPLE-VAR-NAME-DRIFT
  - ISSUE-PROXY-HASENVVARS-MIDDLEWARE-BYPASS
  - INVESTIGATION-GUIDE-PROXY-HASENVVARS-MIDDLEWARE-BYPASS
investigation_method: "3-agent parallel investigation (Auth Pipeline, Env Drift, Security/RLS)"
---

# Consolidated Findings: `hasEnvVars` Auth Middleware Bypass

## Executive Summary

`hasEnvVars` in `lib/utils.ts:13` checks `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` — a variable that **does not exist** in `.env`. The actual variable is `NEXT_PUBLIC_SUPABASE_ANON_KEY`. This makes `hasEnvVars` permanently falsy, causing `proxy.ts → updateSession()` to return early on **every request**. The entire server-side auth pipeline is silently disabled: no session refresh, no token rotation, no edge-level route protection.

**Overall Severity: HIGH (Availability) / MEDIUM (Security)**

The system **fails closed** — no cross-tenant data exposure occurs. However, the silent disablement of the foundational auth refresh mechanism causes session denial after ~1hr token expiry and violates multiple ADR invariants.

---

## 1. Root Cause

**File:** `lib/utils.ts:11-13`

```typescript
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` is never defined in `.env`. The canonical variable is `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Therefore `hasEnvVars` evaluates to `undefined && undefined = undefined` (falsy).

**Origin:** The old var name comes from an older Supabase Next.js starter template. A prior fix (ISSUE-001, archived) corrected this in `middleware.ts:21 createServerClient` but missed `lib/utils.ts` and the `.env.example` templates.

---

## 2. Auth Flow — What's Bypassed

```
                         BROWSER REQUEST
                              │
                              ▼
                   ┌─────────────────────┐
                   │     proxy.ts:5      │
                   │  proxy(request)     │
                   │  calls updateSession│
                   └─────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ middleware.ts:13     │
                   │ if (!hasEnvVars)     │  ◄── hasEnvVars = FALSY (always)
                   │   return response   │  ◄── EARLY EXIT: ALL CODE BELOW SKIPPED
                   └─────────────────────┘
                              │
              BYPASSED ───────┼─────── SHOULD EXECUTE
              (current)       │       (intended)
                              │
                              ▼
                   ┌─────────────────────┐
                   │ middleware.ts:19-40  │
                   │ createServerClient  │  SKIPPED: No Supabase middleware client
                   │ (cookie read/write) │
                   └─────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ middleware.ts:48     │
                   │ getClaims()         │  SKIPPED: No session validation
                   │ token rotation      │  SKIPPED: No cookie refresh
                   └─────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ middleware.ts:52-74  │
                   │ publicPaths check   │  SKIPPED: No route ACL
                   │ redirect to /signin │  SKIPPED: No auth enforcement
                   └─────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ DOWNSTREAM SSR      │
                   │ layout getUser()    │  Works but with STALE cookies
                   │ (fallback guard)    │  Cannot refresh tokens (read-only)
                   └─────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ API ROUTE HANDLERS  │
                   │ withServerAction    │  Works but with STALE cookies
                   │ withAuth → getUser  │  Will fail after token expiry
                   └─────────────────────┘
```

---

## 3. Blast Radius

### Directly Compromised

| Impact | Severity | Mechanism |
|--------|----------|-----------|
| **Session token refresh** | CRITICAL | `getClaims()` never called; tokens expire without rotation |
| **Edge-level route protection** | CRITICAL | No `publicPaths` ACL, no redirect-to-signin at edge |
| **Random logouts after ~1hr** | HIGH | SSR `getUser()` fails with expired tokens; redirects to /signin |
| **Lock screen PIN deadlock** | HIGH | After token expiry, `verifyPinAction()` / `getPinStatusAction()` server actions fail — user trapped on non-functional lock screen |
| **API calls after token expiry** | HIGH | `withAuth` → `getUser()` returns null → UNAUTHORIZED |
| **`/protected` layout** | MEDIUM | `app/protected/layout.tsx:25` always renders `<EnvVarWarning />` instead of `<AuthButton />` |
| **Lock screen F5 bypass** | MEDIUM | Zustand in-memory store resets on hard refresh (separate but compounding) |
| **New developer onboarding** | HIGH | `.env.example` propagates wrong var name |

### Delayed-Onset Failure Pattern

The bypass creates a time-dependent failure:

1. **0–60 min after login:** Everything works. Session tokens are fresh.
2. **~60 min (token expiry):** Server-side calls start failing. Client-side may still work (`autoRefreshToken`).
3. **After client refresh:** Browser has new tokens in memory, but server reads stale cookies because middleware never writes updated cookies back. **Server/client session desynchronization.**

### NOT Compromised (Fail-Closed Defenses Hold)

| Boundary | Why It Holds |
|----------|--------------|
| **RLS policies** | `auth.uid() IS NOT NULL` blocks all unauthenticated access |
| **Casino scoping** | `COALESCE(session_var, jwt_claim)` cannot produce wrong `casino_id` — either correct or NULL |
| **Write-path policies (Template 2b)** | Session-var-only — fail if `app.casino_id` unset |
| **SECURITY DEFINER RPCs** | `set_rls_context_from_staff()` validates `auth.uid()` before setting context |
| **Server actions** | `withServerAction` chain independently validates auth via `withAuth` → `getAuthContext()` |

**Multi-tenant risk: NONE.** Cross-casino data exposure is impossible. The failure mode is denial (logged out), not privilege escalation.

---

## 4. Environment Variable Drift Inventory

### Wrong Name Occurrences (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`)

| File | Line | Impact |
|------|------|--------|
| `lib/utils.ts` | 13 | **CRITICAL** — `hasEnvVars` permanently falsy |
| `.env.example` | 4 | **HIGH** — onboarding template |
| `.env.test.example` | 9 | **HIGH** — test template |
| `e2e/README.md` | 22, 30 | MEDIUM — misleading docs |
| `docs/issues/_archive/ISSUE-001-*` | 26 | COSMETIC — historical reference |
| `docs/issues/auth-hardening/ISSUE-*` | various | COSMETIC — documents the bug itself |

### Correct Name Usage (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)

All runtime Supabase client factories use the **correct** name:

| File | Line | Status |
|------|------|--------|
| `lib/supabase/client.ts` | 64 | CORRECT |
| `lib/supabase/server.ts` | 19 | CORRECT |
| `lib/supabase/middleware.ts` | 21 | CORRECT |
| `jest.setup.js` | 31-33 | CORRECT |
| `.github/workflows/ci.yml` | 38 | CORRECT |
| `README.md` | 80, 83 | CORRECT |

### Additional Drift Findings

| Finding | Files | Impact |
|---------|-------|--------|
| **Ghost vars** (`SUPABASE_TEST_URL`, `SUPABASE_TEST_KEY`) | Quality docs (QA-003, QA-004), architecture docs | MEDIUM — vars never existed in any `.env` |
| **Non-standard short names** (`SUPABASE_URL`, `SUPABASE_ANON_KEY` without `NEXT_PUBLIC_`) | `lib/server-actions/middleware/__tests__/helpers/supabase-test-client.ts:11,13,23` | LOW — have hardcoded fallbacks |
| **Missing from `.env.example`** | `SUPABASE_SERVICE_ROLE_KEY` | HIGH — required by `lib/supabase/service.ts` but absent from template |
| **40+ scattered `process.env` access points** | Across codebase | Structural — no centralized env parsing |

---

## 5. Silent Failure Amplifiers

### 5a. Cookie Write Swallowed in Server Components

`lib/supabase/server.ts:26-30`:

```typescript
setAll(cookiesToSet) {
  try {
    cookiesToSet.forEach(({ name, value, options }) => {
      cookieStore.set(name, value, options);
    });
  } catch (error) {
    // The `set` method was called from a Server Component.
    // This can be ignored if you have middleware refreshing user sessions.
  }
}
```

The comment explicitly assumes middleware is refreshing sessions. It isn't. Zero logging of the failure.

### 5b. No Middleware Logging

`lib/supabase/middleware.ts:13-15` returns early with no log, no metric, no telemetry. The original code comment in `lib/utils.ts:10` says "This check can be removed, it is just for tutorial purposes" — confirming it was scaffolding from the Supabase starter template.

### 5c. "Works in Dev" Trap

Multiple factors mask the bug in development:

1. `ENABLE_DEV_AUTH=true` bypasses the entire cookie-based auth flow
2. Short dev sessions rarely exceed 1hr token TTL
3. Client-side navigation dominance — browser SDK refreshes tokens successfully
4. No E2E tests simulating token expiry + hard refresh

---

## 6. ADR Compliance Gaps

| ADR / Invariant | Status | Gap |
|-----------------|--------|-----|
| **ADR-030** (Auth hardening) | **Violated** | Silent pipeline disablement defeats entire hardening architecture |
| **ADR-030 INV-030-6** | **Inaccessible** | JWT fallback logging never fires — monitoring data for Track B migration absent |
| **ADR-030 D1** | Functionally intact but unreachable | Context RPC is single source of truth, but `withAuth` rejects before `withRLS` executes |
| **ADR-015 Pattern C** | **Degraded** | Hybrid pattern unreachable — both session-var and JWT paths fail with expired token |
| **ADR-024 INV-3** | **Unreachable** | Staff identity binding via `auth.uid()` impossible when `auth.uid()` is NULL |
| **SEC-002 Guardrail #1** | Degraded | Casino-scoped ownership relies on functional auth pipeline |
| **SEC-002 Guardrail #5** | **Architecturally violated** | "Single source of truth for request context" — chain broken at first link |

---

## 7. Attack Surface Assessment

### Direct Exploitation: NOT POSSIBLE

The bug makes the system **more restrictive**, not less. An attacker cannot leverage the middleware bypass to gain unauthorized access. Failure mode is denial (session rejection), not privilege escalation.

### Indirect Risks

1. **Configuration-as-attack-vector:** An insider with access to `.env.example` or deployment config could introduce similar mismatches to silently disable security infrastructure.
2. **Behavioral workarounds:** Repeated logouts may cause staff to share credentials, leave sessions open, or avoid page refreshes — creating secondary security risks in a casino floor environment.
3. **Class-of-vulnerability:** The pattern "env var name mismatch silently disables security infrastructure" is the real threat. A similar mismatch on `SUPABASE_SERVICE_ROLE_KEY` could be catastrophic.

### Stub Route Handlers (Future Risk)

Six API route handlers lack `withServerAction`:

- `app/api/v1/finance/transactions/route.ts`
- `app/api/v1/casinos/[casinoId]/route.ts`
- `app/api/v1/casinos/[casinoId]/staff/route.ts`
- `app/api/v1/casinos/[casinoId]/settings/route.ts`
- `app/api/v1/loyalty/mid-session-reward/route.ts`
- `app/api/v1/loyalty/balances/route.ts`

Currently stubs (return empty data, marked TODO). Not exploitable now but represent a future risk if implemented without auth.

---

## 8. Complete Fix List

### P0 — Critical Runtime Fixes

| # | File | Line | Change | Reason |
|---|------|------|--------|--------|
| 1 | `lib/utils.ts` | 13 | `PUBLISHABLE_OR_ANON_KEY` → `ANON_KEY` | Restores entire auth middleware pipeline |
| 2 | `lib/supabase/middleware.ts` | 13-15 | Remove silent early-return or make fail-loud | Prevents silent pipeline disablement |

### P1 — Template & Config Fixes

| # | File | Line | Change | Reason |
|---|------|------|--------|--------|
| 3 | `.env.example` | 4 | Align var name to `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Onboarding template |
| 4 | `.env.test.example` | 9 | Align var name | Test template |
| 5 | `.env.example` | (add) | Add `SUPABASE_SERVICE_ROLE_KEY=your-service-role-key` | Required but missing from template |

### P2 — Documentation & Secondary Fixes

| # | File | Line | Change | Reason |
|---|------|------|--------|--------|
| 6 | `e2e/README.md` | 22, 30 | Align var name | Misleading setup instructions |
| 7 | `store/lock-store.ts` | — | Add Zustand `persist` with `sessionStorage` | Lock screen survives hard refresh |

### P3 — Code Consistency & Hardening

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 8 | Centralized env validation (`lib/env.ts` with Zod) | 2 hr | Prevents ALL env var drift |
| 9 | E2E test: token expiry + hard refresh | 4 hr | Catches this regression class |
| 10 | CI guard: `.env.example` keys match actual env usage | 2 hr | Structural prevention |
| 11 | Add `withServerAction` to stub route handlers | 2 hr | Defense in depth |
| 12 | Middleware observability: log when `updateSession()` runs/skips | 30 min | Detection of future bypasses |
| 13 | Fix ghost vars in quality docs | 30 min | Documentation accuracy |
| 14 | Fix non-standard var names in test helper | 15 min | Code consistency |

---

## 9. Files Participating in Auth Pipeline

### Primary Auth Chain (Middleware Layer)

| File | Lines | Role |
|------|-------|------|
| `proxy.ts` | 5-7 | Middleware entry point |
| `lib/supabase/middleware.ts` | 6-91 | Session refresh, token rotation, route ACL |
| `lib/utils.ts` | 11-13 | `hasEnvVars` guard (**root cause**) |

### SSR Auth Gates (Fallback Layer)

| File | Lines | Role |
|------|-------|------|
| `app/(dashboard)/layout.tsx` | 13-19 | `getUser()` + redirect to /signin |
| `app/(protected)/layout.tsx` | 19-26 | `getUser()` + redirect to /signin |
| `app/protected/layout.tsx` | 7, 25 | Uses `hasEnvVars` for UI toggle (also broken) |

### Supabase Client Factories

| File | Lines | Env Var Used | Correct? |
|------|-------|-------------|----------|
| `lib/supabase/server.ts` | 19 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `lib/supabase/client.ts` | 64 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `lib/supabase/middleware.ts` | 21 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `lib/supabase/service.ts` | 29-31 | `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `lib/utils.ts` | 13 | `PUBLISHABLE_OR_ANON_KEY` | **NO** |

### Server Action Middleware

| File | Lines | Role |
|------|-------|------|
| `lib/server-actions/middleware/compositor.ts` | 80-129 | Composes auth chain |
| `lib/server-actions/middleware/auth.ts` | 30-69 | Validates `getUser()`, staff lookup |
| `lib/server-actions/middleware/rls.ts` | 25-49 | Injects RLS context via RPC |
| `lib/supabase/rls-context.ts` | 31-66, 85-129 | `getAuthContext()` and `injectRLSContext()` |

### Lock Screen

| File | Lines | Role |
|------|-------|------|
| `store/lock-store.ts` | 24-45 | Zustand store (in-memory only) |
| `components/layout/lock-screen-provider.tsx` | 16-27 | Idle detection + lock trigger |
| `components/layout/lock-screen.tsx` | 30-238 | PIN verify/setup overlay |

---

## 10. Conclusion

This is not a typo. It is an **auth correctness dependency** on a middleware path that can be **disabled by config drift without detection**. The system fails closed (no data exposure), but the operational impact — silent logouts, lock screen deadlocks, and zero observability — makes this a HIGH-severity availability issue.

The immediate fix is a 4-file, 4-line change (P0 + P1). The structural prevention requires centralized env validation and E2E regression coverage (P3).

---

*Investigation conducted by 3 parallel domain experts: Auth & Middleware Pipeline, Environment & Configuration, Security & RLS. 2026-02-17.*

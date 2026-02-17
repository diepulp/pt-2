---
prd_id: PRD-035
title: "Onboarding Bootstrap Auth Fixes — Dev Bypass Guard + JWT Claims Refresh Barrier"
status: Draft
version: 0.1.0
created: 2026-02-16
updated: 2026-02-16
author: Claude (lead-architect)
priority: P1
category: BUGFIX/SECURITY
owner: Engineering
affects: [ADR-030 (D6, INV-030-8), ADR-024, SEC-001]
bounded_contexts:
  - AuthPipeline (Middleware)
  - CasinoService (Onboarding)
depends_on:
  - PRD-025 (Tenant Bootstrap — deployed)
  - PRD-030 (Setup Wizard — in progress)
  - ADR-030 (Auth System Hardening — D6 amendment accepted)
blocks: []
triggered_by:
  - "docs/issues/ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG.md"
  - "RLS Expert Panel (5-agent investigation, 4-1 majority: implementation bug, not architecture gap)"
tags: [auth, rls, onboarding, bootstrap, dev-bypass, jwt-refresh, P1-blocker]
---

# PRD-035: Onboarding Bootstrap Auth Fixes

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft v0.1.0
- **Summary:** After PRD-025 bootstrap, newly registered users cannot proceed through the setup wizard (PRD-030). Two implementation bugs in the auth middleware pipeline cause P1 failures: (1) `withRLS()` unconditionally calls the `set_rls_context_from_staff()` RPC even when dev bypass has already injected context via a service-role client that lacks `auth.uid()`, and (2) `bootstrap-form.tsx` uses a `setTimeout` delay instead of `refreshSession()`, leaving the cookie JWT stale with missing claims. A 5-agent RLS expert panel (4-1 majority) confirmed these are targeted implementation fixes within the existing ADR-030 framework — no new architecture required. This PRD implements the 3 fixes specified in ADR-030 Appendix A's implementation checklist.

---

## 2. Problem & Goals

### 2.1 Problem

The onboarding flow breaks at two points depending on environment:

**Dev bypass (blocks all local development):**
1. `withAuth()` detects `isDevAuthBypassEnabled()`, sets `ctx.rlsContext = DEV_RLS_CONTEXT`, swaps to service-role client (`auth.ts:34-46`).
2. `withRLS()` unconditionally calls `injectRLSContext()` → `set_rls_context_from_staff()` RPC (`rls.ts:27-32`).
3. Service-role client has no `auth.uid()` → RPC fails → `UNAUTHORIZED: staff identity not found`.

**Production (blocks real user onboarding):**
1. `rpc_bootstrap_casino()` creates staff + casino, `reconcileStaffClaims()` updates `raw_app_meta_data` server-side.
2. `bootstrap-form.tsx:52` uses `setTimeout(() => router.push('/start'), 1500)` — no JWT refresh.
3. User navigates to `/setup` with stale cookie JWT (no `casino_id`/`staff_id` claims).
4. `withAuth()` queries staff via PostgREST with stale JWT → RLS filters all rows → `FORBIDDEN: User is not active staff`.

Both failures prevent any setup wizard action from executing. The onboarding flow is broken end-to-end.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Dev bypass skips RPC injection when context already set | Setup wizard Step 1 "Next" succeeds with `ENABLE_DEV_AUTH=true` |
| **G2**: Bootstrap-to-wizard transition uses fresh JWT | First-time registration → bootstrap → `/setup` Step 1 succeeds without manual refresh |
| **G3**: Invite-accept-to-dashboard transition uses fresh JWT | Invited user accept → `/start` redirect succeeds without stale claims |
| **G4**: No regression for steady-state auth | Existing server actions with real auth still call RPC and derive context from `set_rls_context_from_staff()` |

### 2.3 Non-Goals

- No new middleware mode flags (no `mode: "bootstrap"` on `withServerAction`).
- No `bestEffort` RLS injection (the expert panel identified this as harmful — contradicts ADR-030 D4 write-path enforcement).
- No modification to `set_rls_context_from_staff()` RPC (it correctly refuses service-role calls per ADR-024).
- No new configuration surface beyond the 3-line guard and `refreshSession()` calls.
- No changes to `withAuth()` — it already correctly handles both dev bypass and production paths.

---

## 3. Users & Use Cases

- **Primary users:** New casino operators (first-time sign-up), invited staff members

**Top Jobs:**

- As a **new operator**, I need to complete bootstrap and immediately configure my casino in the setup wizard so that I can open my pit for business.
- As an **invited staff member**, I need to accept an invite and immediately access the dashboard so that I can start my shift.
- As a **developer**, I need local dev bypass to work through the full onboarding → setup → dashboard flow so that I can develop and test features.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Fix 1 — Dev Bypass Guard (INV-030-8):**
- Add early-return guard in `withRLS()` when `ctx.rlsContext` is already populated AND `isDevAuthBypassEnabled()` returns true
- Skip `set_rls_context_from_staff()` RPC call — service-role client structurally cannot call it
- ~3 lines in `lib/server-actions/middleware/rls.ts`

**Fix 2 — Claims Refresh Barrier (Bootstrap):**
- Replace `setTimeout(() => router.push('/start'), 1500)` with `await refreshSession()` + navigate in `components/onboarding/bootstrap-form.tsx`
- Update "Go to Dashboard" button handler to also refresh before navigating
- Import: `createBrowserComponentClient` from `@/lib/supabase/client`

**Fix 3 — Claims Refresh Barrier (Invite Accept):**
- Add `refreshSession()` to `onSuccess` callback in `components/onboarding/accept-invite-handler.tsx`
- Ensure refresh completes before `router.push('/start')`

### 4.2 Out of Scope

- Modifying the `set_rls_context_from_staff()` RPC
- Adding new middleware modes or flags to `withServerAction()`
- Changing `withAuth()` behavior
- Audit log entries for bootstrap events (tracked in Onboarding Gap Resolution doc)
- Rate limiting on onboarding endpoints (future hardening)

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1:** `withRLS()` MUST skip the `set_rls_context_from_staff()` RPC when dev bypass is active (`isDevAuthBypassEnabled() === true`) AND `ctx.rlsContext` is already populated by `withAuth()`. (INV-030-8)
- **FR-2:** `withRLS()` MUST still call the RPC when dev bypass is NOT active, regardless of `ctx.rlsContext` state. (INV-030-1)
- **FR-3:** After successful bootstrap (`state?.code === 'OK'`), the client MUST call `supabase.auth.refreshSession()` before any navigation to RLS-gated routes.
- **FR-4:** Both navigation exit points in `BootstrapForm` (auto-redirect `useEffect` and "Go to Dashboard" button) MUST await `refreshSession()`.
- **FR-5:** After successful invite acceptance, the client MUST call `supabase.auth.refreshSession()` before `router.push('/start')`.
- **FR-6:** The `refreshSession()` call MUST use `createBrowserComponentClient()` from `@/lib/supabase/client` (not `createClient`).

### 5.2 Non-Functional Requirements

- **NFR-1:** Dev bypass guard MUST be gated behind `NODE_ENV=development` AND `ENABLE_DEV_AUTH=true` (inherited from INV-030-3). In production, the guard is structurally unreachable.
- **NFR-2:** Context merge precedence: `DEV_RLS_CONTEXT` > RPC return > JWT fallback > empty (ADR-030 Appendix A Rule C).
- **NFR-3:** No additional latency in steady-state (production, non-bypass) path — the guard is a single `if` check.

> Architecture details: See [ADR-030 D6](../80-adrs/ADR-030-auth-system-hardening.md), [ADR-030 Appendix A](../80-adrs/ADR-030 Appendix A (Onboarding Bootstrap Algorithm)), [Onboarding Gap Resolution](../00-vision/company-onboarding/ONBOARDING-BOOTSTRAP-ADMIN-STAFF-ROLE-GAP.md)

---

## 6. UX / Flow Overview

**Flow 1: New Operator — Bootstrap → Setup Wizard (Fixed)**
1. User signs up → routes to `/start` → redirected to `/bootstrap`
2. User fills bootstrap form → `bootstrapAction` creates casino + staff + claims (server-side)
3. **NEW:** `BootstrapForm` calls `await refreshSession()` (mints new JWT with claims)
4. Navigate to `/start` → redirected to `/setup` (JWT has `casino_id`, `staff_id`, `staff_role`)
5. Setup wizard Step 1 → server action → `withAuth()` resolves staff → `withRLS()` calls RPC → success

**Flow 2: Invited Staff — Accept → Dashboard (Fixed)**
1. User clicks invite link → `/invite/accept?token=...`
2. `AcceptInviteHandler` calls `fetchAcceptInvite()` → staff record created, claims synced
3. **NEW:** `onSuccess` calls `await refreshSession()` (mints new JWT with claims)
4. Navigate to `/start` → routes to dashboard (JWT has claims)

**Flow 3: Dev Bypass — Setup Wizard (Fixed)**
1. Developer runs with `ENABLE_DEV_AUTH=true`
2. Any server action → `withAuth()` sets `ctx.rlsContext = DEV_RLS_CONTEXT`, swaps to service client
3. **NEW:** `withRLS()` sees `ctx.rlsContext` populated + dev bypass active → `return next()` (skips RPC)
4. Handler executes with dev context → success

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **ADR-030 D6 (Accepted)** — Onboarding Bootstrap Mode amendment. Already merged.
- **ADR-030 Appendix A (Accepted)** — Execution policy. Already created.
- **PRD-025 (Deployed)** — Tenant bootstrap RPC and `bootstrapAction`.
- **`isDevAuthBypassEnabled()`** — Existing function in `lib/supabase/dev-context.ts` (lines 63-68).

### 7.2 Risks & Open Questions

- **Risk: `refreshSession()` network failure** — If the refresh call fails, the user sees a stale-JWT error on the next page. Mitigation: The error is self-healing (user refreshes the page). Future enhancement: retry + fallback UI. Low probability (same-origin, same-session call).
- **Risk: Dev bypass guard false-positive** — Could skip RPC when it shouldn't. Mitigation: Guard requires BOTH `ctx.rlsContext` truthy AND `isDevAuthBypassEnabled()` (double gate). In production, `isDevAuthBypassEnabled()` always returns false.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Fix 1: `withRLS()` skips RPC when dev bypass is active and `ctx.rlsContext` is set
- [ ] Fix 2: `BootstrapForm` auto-redirect calls `refreshSession()` before navigation
- [ ] Fix 2: `BootstrapForm` "Go to Dashboard" button calls `refreshSession()` before navigation
- [ ] Fix 3: `AcceptInviteHandler` `onSuccess` calls `refreshSession()` before `router.push`

**Data & Integrity**
- [ ] No change to RPC behavior — `set_rls_context_from_staff()` is unmodified
- [ ] Context merge precedence preserved (DEV > RPC > JWT > empty)

**Security & Access**
- [ ] Dev bypass guard only reachable when `NODE_ENV=development` AND `ENABLE_DEV_AUTH=true`
- [ ] No new `skipAuth` paths introduced
- [ ] Production auth pipeline unchanged for steady-state actions

**Testing**
- [ ] Dev bypass: setup wizard Step 1 "Next" succeeds with `ENABLE_DEV_AUTH=true`
- [ ] Production: fresh registration → bootstrap → setup wizard Step 1 succeeds
- [ ] Regression: existing server actions with real auth still call RPC (no skip)
- [ ] Regression: `skipAuth` actions (bootstrap, invite accept) still work

**Operational Readiness**
- [ ] `console.warn` from `withAuth()` dev bypass continues to log when bypass is used
- [ ] No additional logging needed — existing correlation IDs trace the flow

**Documentation**
- [ ] ADR-030 D6 + Appendix A already accepted (pre-requisite, not part of this PRD)
- [ ] ISSUE doc validation checklist items marked complete

---

## 9. Related Documents

- **Issue (Trigger):** [`docs/issues/ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG.md`](../issues/ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG.md) — Root cause analysis
- **ADR (Authority):** [`ADR-030: Auth System Hardening`](../80-adrs/ADR-030-auth-system-hardening.md) — D6 (Onboarding Bootstrap Mode), INV-030-8
- **Execution Policy:** [`ADR-030 Appendix A`](../80-adrs/ADR-030 Appendix A (Onboarding Bootstrap Algorithm)) — Middleware contract rules, implementation checklist
- **Business Algorithm:** [`Onboarding Gap Resolution`](../00-vision/company-onboarding/ONBOARDING-BOOTSTRAP-ADMIN-STAFF-ROLE-GAP.md) — Bootstrap admin provisioning, JWT freshness barrier
- **Prerequisite PRDs:** [PRD-025](../_archive/PRD-025-onboarding-bootstrap-invites-v0.md) (Bootstrap), [PRD-030](PRD-030-setup-wizard-v0.md) (Setup Wizard)
- **Security:** [`SEC-001`](../30-security/SEC-001-rls-policy-matrix.md) — Pattern C hybrid RLS
- **Schema / Types:** `types/database.types.ts`

---

## Appendix A: Implementation Plan

### WS1: Dev Bypass Guard (P0)

**File:** `lib/server-actions/middleware/rls.ts`

```typescript
// Before the try block, add:
import { isDevAuthBypassEnabled } from '@/lib/supabase/dev-context';

// Inside the middleware function, before the try block:
if (ctx.rlsContext && isDevAuthBypassEnabled()) {
  return next();
}
```

- [ ] Add `isDevAuthBypassEnabled` import
- [ ] Add early-return guard before RPC call
- [ ] Verify existing RPC path unchanged for non-bypass

### WS2: Bootstrap Claims Refresh (P0)

**File:** `components/onboarding/bootstrap-form.tsx`

Replace `useEffect` auto-redirect (line 49-55):
```typescript
useEffect(() => {
  if (state?.code === 'OK') {
    const refreshAndRedirect = async () => {
      const supabase = createBrowserComponentClient();
      await supabase.auth.refreshSession();
      router.push('/start');
    };
    refreshAndRedirect();
  }
}, [state, router]);
```

Update "Go to Dashboard" button (line 67):
```typescript
<Button
  onClick={async () => {
    const supabase = createBrowserComponentClient();
    await supabase.auth.refreshSession();
    router.push('/start');
  }}
  className="w-full"
>
  Go to Dashboard
</Button>
```

- [ ] Add `createBrowserComponentClient` import from `@/lib/supabase/client`
- [ ] Replace `setTimeout` with `refreshSession()` + navigate in `useEffect`
- [ ] Update "Go to Dashboard" button to async handler with `refreshSession()`

### WS3: Invite Accept Claims Refresh (P1)

**File:** `components/onboarding/accept-invite-handler.tsx`

Update `onSuccess` callback (line 27-29):
```typescript
onSuccess: async () => {
  const supabase = createBrowserComponentClient();
  await supabase.auth.refreshSession();
  router.push('/start');
},
```

- [ ] Add `createBrowserComponentClient` import from `@/lib/supabase/client`
- [ ] Update `onSuccess` to async with `refreshSession()` before navigation

---

## Appendix B: Expert Panel Summary

A 5-agent RLS expert investigation (2026-02-16) reached a **4-1 majority verdict**:

| Expert | Angle | Verdict |
|--------|-------|---------|
| Expert 1 | Middleware chain analysis | Implementation bug — 2 point fixes |
| Expert 2 | RPC function resilience | RPC correct — middleware at fault |
| Expert 3 | Dev bypass / ADR-030 compliance | ADR-030 gap (D1/D3 interaction) — amendment sufficient |
| Expert 4 | JWT claims lifecycle | Refresh barrier needed — partial support for lightweight bootstrap |
| Expert 5 | ADR necessity assessment | Over-engineered — trips 3/6 guardrail red flags |

**Consensus:** Reject standalone ADR-XXX. Implement targeted fixes + ADR-030 D6 amendment (done).

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-02-16 | Claude (lead-architect) | Initial draft from expert panel findings + ADR-030 Appendix A |


## Invariant: Claim Mutation Requires Refresh Barrier

Any workflow that mutates `auth.users.raw_app_meta_data` / `app_metadata` claims used by RLS (e.g., `casino_id`, `staff_id`, `staff_role`) MUST perform a session refresh barrier **and verify the refreshed claims** before routing the user into any RLS-gated page.

If additional claim-mutation flows are introduced later (role changes, casino reassignment, staff activation, magic-link completion), they must follow the same barrier pattern.


### Clarification: Dev Bypass Guard Condition (must include client type)

The guard to skip calling `set_rls_context_from_staff()` in dev bypass must NOT rely solely on `ctx.rlsContext` being populated. It must also confirm that the request is running under a **service-role/dev-bypass auth mode** (i.e., a client that cannot satisfy `auth.uid()` semantics).

**Required condition (conceptual):**
- `isDevAuthBypassEnabled() == true`
- AND `ctx.authMode == "dev_bypass_service"` (or equivalent)
- AND `ctx.rlsContext.source == "DEV_BYPASS"` (or equivalent marker)

This prevents accidental skipping of context injection on real user-bound requests if `ctx.rlsContext` is set for other reasons in future refactors.


### Requirement: Refresh Barrier Must Verify Claims

After `refreshSession()` completes, the client must read back the current session and verify presence of the required claims:

- `app_metadata.casino_id`
- `app_metadata.staff_id`
- `app_metadata.staff_role`

If any are missing (or refresh returns an error), the UI must stop and present a recoverable state:
- “Finalizing your session…” with a retry action (and optionally one automatic retry)
- do NOT route into the app where `withAuth()` / RLS would fail with confusing errors


### NFR Alignment Note (Context Precedence)

If the precedence rule `DEV_RLS_CONTEXT > RPC-derived context > JWT fallback > empty` is already implemented, the PRD must cite the implementation location (file + function). If it is not implemented, either:

- remove the precedence statement from NFRs for this PRD (keep scope honest), OR
- add a micro-task to ensure `ctx.rlsContext` is not blindly overwritten.

This PRD should not introduce “policy promises” without an explicit deliverable.

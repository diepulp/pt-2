# ADR-030 Appendix A: Onboarding Bootstrap Mode

**Parent:** [ADR-030: Auth System Hardening](./ADR-030-auth-system-hardening.md) (D6)
**Status:** Accepted
**Date:** 2026-02-16
**Type:** Execution Policy (not a standalone ADR)
**Companion:** [Onboarding Gap Resolution](../00-vision/company-onboarding/ONBOARDING-BOOTSTRAP-ADMIN-STAFF-ROLE-GAP.md)
**Triggered by:** [ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG](../issues/ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG.md)

---

## Purpose

This appendix defines the **execution policy** for ADR-030 D6 (Onboarding Bootstrap Mode). It specifies how the middleware pipeline behaves during onboarding, when steady-state invariants (D1-D5) do not yet hold.

This is not a new architectural decision. All security invariants remain in ADR-030. This document provides the implementation rules, middleware contract, and end-to-end flow for the onboarding bootstrap phase.

---

## Problem Summary

During onboarding/bootstrap, the auth pipeline encounters a transitional state:

| Steady-State Assumption | Onboarding Reality |
|---|---|
| `staff` record exists for authenticated user | Staff created mid-flow by `rpc_bootstrap_casino` |
| JWT `app_metadata` contains `casino_id`, `staff_id`, `staff_role` | Claims written server-side but cookie JWT stale until `refreshSession()` |
| `withAuth()` can resolve staff via RLS-gated query | RLS requires `casino_id` which is NULL in stale JWT |
| `withRLS()` can call context RPC with `auth.uid()` | Dev bypass swaps to service-role client (no `auth.uid()`) |

Two concrete failures result:

1. **Dev bypass:** `withRLS()` unconditionally calls the RPC with a service-role client. No `auth.uid()` -> `UNAUTHORIZED: staff identity not found`.
2. **Production:** After bootstrap, cookie JWT is stale. `withAuth()` queries staff via PostgREST with stale JWT -> RLS filters all rows -> `FORBIDDEN: User is not active staff`. `withRLS()` never runs.

---

## End-to-End Onboarding Flow

### Phase 0: Sign-Up (Rudimentary)

- Create auth user via Supabase Auth.
- No staff, casino, or claims exist yet.
- Route to `/start` gateway (which redirects to `/bootstrap` if no staff found).

### Phase 1: Bootstrap (`/bootstrap`)

**Middleware:** `skipAuth: true` (bypasses both `withAuth` and `withRLS`).

**Action:** `bootstrapAction` calls `rpc_bootstrap_casino()` which atomically:
1. Creates `casino` record
2. Creates `casino_settings` record
3. Creates `staff` record (role = `admin`, status = `active`)
4. Calls `reconcileStaffClaims()` -> `syncUserRLSClaims()` -> updates `raw_app_meta_data`

**Tenant-empty guard:** `rpc_bootstrap_casino` only succeeds when no staff exists for the user. Once any staff binding exists, bootstrap is rejected.

**Output:** DB has staff + casino + claims. Cookie JWT is stale.

### Phase 2: Claims Refresh Barrier

**Before navigating away from `/bootstrap`**, the client MUST:

```typescript
const supabase = createBrowserComponentClient();
await supabase.auth.refreshSession();
router.push('/start');
```

All navigation exit points (auto-redirect, "Go to Dashboard" button) must await `refreshSession()` before navigating.

**Output:** Cookie JWT now contains `casino_id`, `staff_id`, `staff_role`.

### Phase 3: Setup Wizard (`/setup`)

**Middleware:** Standard chain (`withAuth` + `withRLS`), no `skipAuth`.

With a fresh JWT:
- `withAuth()`: `getAuthContext()` queries staff via PostgREST. JWT has `casino_id` -> RLS allows staff read -> staff found -> context set.
- `withRLS()`: Calls `set_rls_context_from_staff()`. `auth.uid()` present -> staff lookup succeeds -> session vars set -> `ctx.rlsContext` populated from RPC return (INV-030-1).

All 9 setup wizard actions require `ctx.rlsContext.staffRole === 'admin'`. They are steady-state actions operating on an established identity.

### Phase 4: Steady-State App (`/pit`)

Standard ADR-030 invariants (D1-D5) fully enforced.

---

## Middleware Contract Rules

### Rule A: Dev Bypass Skips RPC Injection (INV-030-8)

In `withRLS()`, when dev bypass is active and `ctx.rlsContext` is already populated:

```typescript
if (ctx.rlsContext && isDevAuthBypassEnabled()) {
  return next(); // Skip RPC — service client has no auth.uid()
}
```

**Rationale:** `withAuth()` sets `ctx.rlsContext = DEV_RLS_CONTEXT` and swaps to a service-role client. The RPC requires `auth.uid()` which service-role clients lack. Calling the RPC is structurally impossible and must be skipped.

**Security:** `isDevAuthBypassEnabled()` requires `NODE_ENV=development` AND `ENABLE_DEV_AUTH=true` (INV-030-3). In production, this guard is never triggered.

### Rule B: No Identity-Derived RPCs with Service-Role Clients

If an RPC depends on `auth.uid()` or JWT claims, it MUST be invoked with a **user-bound** client. Service-role clients MUST NOT call `set_rls_context_from_staff()`.

The ops-lane function `set_rls_context_internal()` exists for service-role context injection when explicit parameters are available.

### Rule C: Context Merge Precedence

`ctx.rlsContext` MUST NOT be blindly overwritten. Sources merge with precedence:

| Priority | Source | When Used |
|---|---|---|
| 1 (highest) | `DEV_RLS_CONTEXT` | Dev bypass only (INV-030-3) |
| 2 | RPC return value | Production steady-state (INV-030-1) |
| 3 | JWT `app_metadata` fallback | SELECT queries via COALESCE |
| 4 (lowest) | Empty | No context available |

### Rule D: Claims Refresh Barrier

After any operation that calls `reconcileStaffClaims()` / `syncUserRLSClaims()`, the client-side flow MUST call `refreshSession()` before navigating to RLS-gated routes. Affected flows:

| Flow | Component | Fix Required |
|---|---|---|
| Bootstrap | `components/onboarding/bootstrap-form.tsx` | Replace `setTimeout` with `await refreshSession()` + navigate. Update button handler. |
| Invite Accept | `components/onboarding/accept-invite-handler.tsx` | Add `refreshSession()` to `onSuccess` before `router.push`. |

---

## Relationship to Onboarding Gap Resolution

The [Onboarding Gap Resolution](../00-vision/company-onboarding/ONBOARDING-BOOTSTRAP-ADMIN-STAFF-ROLE-GAP.md) document defines the **business algorithm** for bootstrap admin provisioning:

- Bootstrap admin is a one-time privilege per tenant (tenant-empty guard).
- Sign-up is rudimentary (auth user only, no staff/casino).
- First operator becomes admin; subsequent operators join via invite.
- Audit logging for all bootstrap events.

This appendix defines the **middleware execution policy** that enables that algorithm to work within ADR-030's security framework.

---

## What This Appendix Does NOT Do

This is execution policy, not new architecture:

- **No new middleware mode flags** (`mode: "bootstrap"` is not added to `withServerAction`).
- **No `bestEffort` injection** (the expert panel identified this as harmful -- it creates a code path where writes succeed without tenant isolation, contradicting ADR-030 D4).
- **No new configuration surface** beyond the 3-line guard in `withRLS()` and the `refreshSession()` calls.
- **The RPC `set_rls_context_from_staff()` is NOT modified.** It correctly refuses service-role calls per ADR-024.

---

## Implementation Checklist

- [ ] **Fix 1:** Add dev-bypass guard in `withRLS()` (INV-030-8) -- ~3 lines in `lib/server-actions/middleware/rls.ts`
- [ ] **Fix 2:** Add `refreshSession()` barrier in `bootstrap-form.tsx` -- replace `setTimeout` with `await refreshSession()`, update button handler
- [ ] **Fix 3:** Add `refreshSession()` barrier in `accept-invite-handler.tsx` -- add to `onSuccess` callback
- [ ] **Fix 4:** Update ADR-030 INV-030-1 with dev bypass exception -- done (this document)
- [ ] **Fix 5:** Update ADR-030 INV-030-4 with onboarding exemption -- done (this document)
- [ ] First-time user completes onboarding without manual refresh
- [ ] Dev bypass does not trigger staff-derived RPC with service-role client
- [ ] Post-bootstrap steady-state actions succeed without "missing casino_id"
- [ ] Existing server actions with real auth still call RPC (no regression)

---

## References

- [ADR-030: Auth System Hardening](./ADR-030-auth-system-hardening.md) -- Parent ADR (D6, INV-030-8)
- [ADR-024: Authoritative Context Derivation](./ADR-024_DECISIONS.md) -- RPC contract (no spoofable params)
- [Onboarding Gap Resolution](../00-vision/company-onboarding/ONBOARDING-BOOTSTRAP-ADMIN-STAFF-ROLE-GAP.md) -- Business algorithm
- [ISSUE: RLS Context Injection](../issues/ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG.md) -- Root cause analysis
- [RLS Expert Panel Report](../issues/ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG.md) -- 5-expert investigation (4-1 majority: reject standalone ADR, amend ADR-030)

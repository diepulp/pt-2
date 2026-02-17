---
title: "Onboarding Gap Resolution: Bootstrap Admin + Staff Role Provisioning"
version: "v0.1"
date: "2026-02-16"
scope: "PT-2 Onboarding Wizard / Auth & RLS Context Injection"
related:
  - "ADR-030-auth-system-hardening.md (D6, Appendix A)"
  - "ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG.md"
---

# Onboarding Gap Resolution: Bootstrap Admin + Staff Role Provisioning

## Problem Statement

The current onboarding flow sits in a transitional state where **steady-state invariants do not yet hold**:

- `staff` may not exist yet for the signed-in user.
- `casino_id` may not exist yet (tenant not provisioned).
- JWT `app_metadata` may be updated in the DB but the **cookie JWT** used for PostgREST/RLS is **stale** until refreshed.
- Middleware (e.g., `withAuth()` / `withRLS()`) assumes staff + role + casino context exist, causing a “chicken-and-egg” deadlock.

This is the **onboarding gap**: the system tries to enforce steady-state authorization before the identity graph (user → staff → casino) is created.

## Decision Summary

1. **Do not assign `staff_role` at sign-up.** Sign-up remains rudimentary: create an auth user only.
2. **Assign staff + initial role at onboarding entry** (`/setup`) under an explicit **bootstrap mode**:
   - Create staff record for the auth user.
   - Set initial role to **admin** (bootstrap admin).
   - Provision tenant entities (company/casino) if needed.
3. **Establish a JWT freshness barrier** immediately after writing `app_metadata` so subsequent requests use updated claims.

## Principle

> The onboarding flow is not “normal app usage.” It is a privileged, transitional bootstrap phase that must be first-class in the middleware contract.

## Bootstrap Admin Policy

### Intent
The first real operator of a newly provisioned tenant needs the ability to configure:
- property settings,
- staff creation / roles,
- game templates / table setup,
- etc.

Therefore, the first operator becomes **admin** for that tenant.

### Hard Guardrail (to avoid “anyone can become admin”)
Bootstrap admin assignment is allowed **only** when the tenant is “empty”:

- no `staff` exists for the tenant key (casino/company), **or**
- no `casino` exists yet for the tenant being provisioned.

Once any admin/staff exists, onboarding must use a controlled enrollment method:
- invitation links, or
- admin-created staff accounts, or
- SSO / SCIM later (future).

## End-to-End Flow

### 0) Sign-up (rudimentary)
**Goal:** create an authenticated user identity only.

- Create user via Supabase Auth.
- Do **not** assume casino/staff exists.
- Route user to `/setup`.

**Output:** auth user exists; staff/casino not required.

### 1) Onboarding Entry: `/setup` (Bootstrap Mode)
**Goal:** create/attach staff and tenant context.

**Preconditions:**
- `requireSession = true`
- `requireStaff = false`
- `rls.inject = true` but **best-effort** (do not fail if injection not possible yet)

**Steps (idempotent):**
1. Read current user id (`auth.uid()`).
2. Determine bootstrap target:
   - If product supports creating a new casino: provision new tenant.
   - If joining an existing casino: enforce controlled enrollment (invite).
3. If *tenant empty*:
   - Create `company` (optional; depends on tenant model).
   - Create `casino`.
   - Create `staff` row linked to auth user.
   - Assign role = `admin`.
4. Write claims to user `app_metadata`:
   - `casino_id`
   - `staff_id`
   - `staff_role = admin`

**Output:** DB now contains staff/casino; user metadata updated (DB-side).

### 2) Onboarding Finalize (JWT Freshness Barrier)
**Goal:** ensure the browser/session cookie JWT includes the updated `app_metadata`.

**Why it matters:** PostgREST/RLS uses the cookie JWT; without refresh, server actions may see stale claims and fail.

**Mechanisms (choose one):**
- Client: `await supabase.auth.refreshSession()` before redirecting into the app.
- OR Server: redirect to a `/setup/finalize` route that performs refresh and sets cookies, then redirects.

**Output:** cookie JWT now contains correct `casino_id/staff_id/staff_role`.

### 3) Steady-State App
**Goal:** enforce normal authorization invariants.

- `requireSession = true`
- `requireStaff = true`
- `rls.inject = required` (not best-effort)
- Middleware can safely resolve staff, set RLS context, and proceed.

## Middleware Contract (Practical Rules)

### Rule A — Onboarding actions must declare Bootstrap Mode
Any server action used by `/setup` must run under bootstrap mode and must not require staff unless explicitly needed.

### Rule B — No identity-derived RPCs with service-role clients
If an RPC depends on `auth.uid()` or JWT claims, it must be invoked with a **user-bound** client, not service-role.
Dev bypass may still use service-role, but then it must **skip staff-derived injection** and use explicit dev context only.

### Rule C — `ctx.rlsContext` must not be blindly overwritten
Context sources should merge with precedence:
1. explicit dev context (dev only)
2. RPC-derived session vars
3. JWT fallback
4. empty

## Security & Abuse Considerations

- **Bootstrap admin is a one-time privilege** per tenant.
- `/setup` must be protected from arbitrary reuse:
  - if staff exists, require invite/admin approval to join.
- Log all bootstrap events to `audit_log`:
  - created tenant entities
  - staff assignment
  - role assignment
  - metadata updates
- Rate limit onboarding endpoints.

## Implementation Checklist

- [ ] Add `mode: "bootstrap"` flag to `withServerAction()` options.
- [ ] Update `withAuth()` to support `requireStaff=false` under bootstrap.
- [ ] Update `withRLS()` to support `bestEffort=true` and to avoid overwriting `ctx.rlsContext`.
- [ ] Add onboarding finalize step with JWT refresh barrier.
- [ ] Add “tenant empty” detection (staff count / casino exists).
- [ ] Add audit log entries for bootstrap actions.
- [ ] Add tests:
  - first-time user can complete onboarding without manual refresh
  - post-finalize steady-state actions succeed
  - bootstrap admin cannot be re-assigned once tenant has staff

## Acceptance Criteria

- A first-time signed-up user entering `/setup` becomes the initial **admin** for the newly created tenant (only when tenant is empty).
- No intermittent “missing casino_id” / “staff not found” failures after onboarding completes.
- Dev bypass does not trigger identity-derived RPCs with service-role clients.
- Audit log shows a clear, single bootstrap chain: user → staff(admin) → casino.


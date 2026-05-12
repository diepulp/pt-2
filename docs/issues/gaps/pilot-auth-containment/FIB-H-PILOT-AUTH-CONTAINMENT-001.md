# FIB-H — Pilot Authentication Containment Gate

**id:** FIB-H-PILOT-AUTH-CONTAINMENT-001  
**status:** DRAFT  
**date:** 2026-05-11  
**owner:** Product / Architecture  
**feature_type:** Pilot containment / authentication boundary  
**related_artifacts:**
- `pilot-authentication-containment-model.md`
- `preliminary-system-auth-stance.md`
- `FIB-H-INSET-INTERNAL-ADMIN-SURFACE-CONTAINMENT.md`

---

# A. Feature Identity

## Feature Name

Pilot Authentication Containment Gate

## One-Line Summary

Replace unrestricted public signup with an admin-approved, allowlist-gated magic-link flow so production pilot access is restricted to approved operators only.

## Scope Class

Pilot containment / access governance.

This is not a full SaaS identity platform, billing system, invitation platform, or enterprise IAM implementation.

---

# B. Operator Problem

The production deployment is publicly reachable under an established domain, but the product does not yet have:

- a finalized pricing model
- a public onboarding policy
- a support process
- tenant governance
- billing boundaries
- mature operational monitoring
- recovery/SLA posture

Current unrestricted signup creates a dangerous pilot-stage condition:

```text
public visitor
→ account creation
→ onboarding mutation
→ tenant/operator environment
```

That is unacceptable for a casino operations system.

The application must prevent random users from creating accounts, tenants, casinos, or operational data before pilot approval.

---

# C. Pilot Fit

This feature is required before broader pilot outreach or operator demos expand.

The current product stage is:

```text
controlled pilot validation
```

not:

```text
public self-service SaaS acquisition
```

Therefore access must be intentionally constrained.

This feature fits the pilot because it is small, defensive, and operationally necessary.

---

# D. Actor / Moment

## Primary Actor

Approved pilot operator.

## Secondary Actors

- application admin
- prospective pilot lead
- unauthenticated public visitor
- authenticated but unauthorized user

## Moment

A user reaches the production deployment and attempts to sign in, sign up, or enter onboarding.

The system must decide whether this person is allowed to receive authentication access and proceed toward onboarding.

---

# E. Containment Loop

## Desired Loop

```text
Public visitor
    ↓
Request pilot access
    ↓
Admin review
    ↓
Approved email allowlist
    ↓
Magic-link login
    ↓
Session established
    ↓
Allowlist revalidated
    ↓
First-login bootstrap / existing route progression
```

## Boundary Rule

Authentication does not imply pilot authorization.

The system must distinguish:

```text
authenticated identity
```

from:

```text
approved pilot participant
```

---

# F. Required Outcomes

## F1 — Public Signup Disabled

The existing public signup route must no longer allow arbitrary account creation.

Acceptable behavior:

- redirect to request-access form
- render request-access form in place of signup
- return closed-pilot messaging

Unacceptable behavior:

- direct call to `supabase.auth.signUp()`
- open self-service account creation
- account creation without allowlist approval

---

## F2 — Password Login Replaced With Magic Link

The login flow must use Supabase magic-link/OTP authentication.

Required method:

```ts
supabase.auth.signInWithOtp()
```

The password login path must be retired from pilot-facing UX.

---

## F3 — Allowlist Check Before OTP Issuance

Before sending a magic link, the backend must confirm the submitted email exists in the approved allowlist.

If the email is not approved:

- no OTP is sent
- no auth user is created
- no onboarding route is entered
- user receives closed-pilot/request-access messaging

---

## F4 — Allowlist Check After Session Creation

Allowlist validation must also occur after session creation before the user proceeds through `/start`.

This prevents stale or revoked approvals from retaining operational access through old sessions.

Required condition:

```text
valid auth session
AND
active allowlist entry
```

---

## F5 — Request Access Flow Exists

A public request-access path must exist.

Minimum fields:

- name
- email
- property / casino name
- role
- estimated table count
- optional message

The request creates a pending access request, not an auth user.

---

## F6 — Minimal Data Model Exists

Two minimal tables are introduced:

- `pilot_access_requests`
- `approved_email_allowlist`

These are containment infrastructure, not CRM infrastructure.

---

## F7 — Onboarding Mutation Hardening

Server actions involved in registration/bootstrap must require a real authenticated session.

The current `skipAuth: true` posture must be removed or explicitly neutralized for onboarding mutations.

Page-level guards are not sufficient.

Mutation-level protection is required.

---

## F8 — `/start` Remains Canonical Auth Router

The existing `/start` flow remains the canonical post-auth route resolver.

It should be extended with pilot authorization checks, not replaced by middleware or a new orchestration layer.

---

# G. Explicit Exclusions

This FIB explicitly excludes:

- Stripe integration
- pricing model implementation
- subscriptions
- seat licensing
- trial plans
- invite-token platform
- team invite management
- enterprise IAM
- SSO/SAML/OIDC provider integration
- RBAC redesign
- full admin user-management console
- CRM/lead pipeline
- automated approvals
- public self-service tenant provisioning
- global `middleware.ts` refactor unless required by implementation proof
- custom magic-link infrastructure
- custom auth token system
- bespoke email delivery platform

If any of these appear during implementation, they require a separate FIB.

---

# H. Adjacent Rejected Ideas

## H1 — Keep Signup Hidden But Available

Rejected.

A route that is not linked but still works is not containment.

---

## H2 — Password Login Plus Allowlist

Rejected for pilot.

Password auth introduces password reset, update-password, and credential lifecycle surfaces that are unnecessary for controlled pilot access.

---

## H3 — Global Middleware First

Rejected for this slice.

The current route progression can be hardened without introducing middleware complexity, Supabase refresh edge cases, or redirect-loop risk.

Middleware may be reconsidered later if route sprawl creates leakage.

---

## H4 — Full Invitation Platform

Rejected.

The pilot does not need resend flows, invite expiry workflows, team invites, invitation status dashboards, or seat management.

The required primitive is:

```text
email approved?
→ yes/no
```

---

## H5 — CRM-Style Access Requests

Rejected.

`pilot_access_requests` is not a sales pipeline.

It exists to support controlled access, not lead management.

---

## H6 — Generalized Internal Admin Surface

Rejected.

The internal admin review surface is pilot containment infrastructure, not a production administrative platform.

It exists only to review pilot access requests, approve or reject pilot participation, insert or remove allowlist entries, and support controlled production access during the pilot stage.

It must not become:

- a generalized admin dashboard
- a user-management console
- invitation lifecycle orchestration
- RBAC administration
- CRM tooling
- operational analytics
- customer-support tooling
- tenant-management infrastructure

The intended mental model is:

```text
temporary pilot airlock
```

not:

```text
multi-tenant administrative subsystem
```

If the review surface begins resembling a generalized SaaS administration platform, this FIB boundary has been violated and a separate FIB is required.

---

# I. Dependencies / Assumptions

## Technical Dependencies

- Supabase Auth supports OTP/magic-link login.
- Existing `/start` route can be extended with allowlist validation.
- Existing onboarding actions can be hardened to require authenticated sessions.
- Database migrations can introduce small containment tables.
- Email delivery for Supabase magic links is already operational or can be configured without custom infrastructure.

## Product Assumptions

- Pilot access is manually approved.
- Public self-service acquisition is not yet active.
- Pricing is not yet finalized.
- Operator onboarding remains controlled by the application owner/admin.
- The product is still in pilot validation mode.

---

# J. Likely Next

After this FIB, generate:

1. PRD — pilot auth containment requirements
2. EXEC-SPEC — implementation sequence
3. migration plan — `pilot_access_requests` and `approved_email_allowlist`
4. UI patch plan — login/signup/request-access surfaces
5. mutation-hardening checklist — registration/bootstrap actions

Recommended sequencing:

## Phase 1 — Immediate Containment

- disable public signup
- replace password login with magic-link login
- add allowlist check before OTP
- add request-access form

## Phase 2 — Mutation Hardening

- remove or neutralize `skipAuth: true`
- require authenticated session in onboarding server actions
- validate allowlist inside `/start`
- reject authenticated but unauthorized sessions

## Phase 3 — Minimal Admin Workflow

- approve/reject pending requests
- insert approved allowlist rows
- optionally mark allowlist entries as used/revoked
- keep the review surface intentionally utilitarian and operationally adjacent to pilot auth containment

---

# K. Expansion Trigger Rule

This feature may expand only if one of the following becomes true:

1. more than one admin must manage pilot approvals
2. multiple pilot properties require delegated invite control
3. pricing/subscription rollout begins
4. pilot access must support teams/seats
5. external customers require formal account administration
6. regulatory or security review requires deeper audit trails

Until then, keep the implementation intentionally small.

---

# L. Scope Authority Block

## In Scope

- disable public signup
- magic-link login
- allowlist pre-check before OTP
- allowlist session-time check after auth
- request-access form
- minimal request/allowlist tables
- closed-pilot messaging
- onboarding mutation hardening
- preserve `/start` as canonical post-auth router
- minimal internal pilot-access review surface

## Out of Scope

- billing
- pricing
- subscriptions
- enterprise IAM
- SSO
- team invites
- full admin console
- generalized admin platform
- user-management console
- invitation lifecycle orchestration
- RBAC administration
- operational analytics dashboard
- customer-support tooling
- CRM
- global auth platform refactor
- custom token system
- custom email infrastructure
- public tenant self-provisioning

## Acceptance Statement

This feature is complete when an unapproved public visitor cannot create an account, receive an OTP, enter onboarding, create a tenant, or reach operator surfaces, while an approved email can receive a magic link and proceed through the existing `/start` progression under explicit pilot authorization.

---

# One-Line Invariant

If authentication alone can create an operator environment, the pilot boundary is broken.

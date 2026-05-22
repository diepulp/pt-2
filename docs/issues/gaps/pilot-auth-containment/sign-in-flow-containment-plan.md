# Sign-In Flow Containment — Implementation Plan

**Status:** Implemented (PRD-083 + PRD-084)  
**Directive:** `DEMO_SIGN_IN_FLOW_CONTAINMENT_DIRECTIVE.md`  
**Date:** 2026-05-18  
**Implemented:** 2026-05-18

---

## Purpose

Extend the sign-in flow with a demo evaluation path so that approved pilot
evaluators land directly in the application on their first sign-in.

**Approval is demo enablement.** When the admin approves an access request, the
evaluator's next sign-in automatically establishes their demo access with no
further admin action required. There is one gate, one admin decision, and one
evaluator action.

Production setup surfaces are restricted to users with explicit provisioning
authority, managed by the application admin. Production workspace operational
configuration — the result of running setup — is a separate concern from demo
evaluation access.

---

## Terminology

**Demo evaluation access** — An approved evaluator's sign-in automatically
establishes a staff binding to the pre-seeded demo environment (Casino 1),
routing them directly into the application. This provides a full-featured
walkthrough without creating or modifying any production workspace state. Demo
access does not imply organizational membership or provisioning authority.

**Provisioning authority** — Explicit permission for an approved user to enter
the production workspace setup progression (`/register` → `/bootstrap`).
Expressed as `provisioning_authorized = true` on the allowlist entry. Distinct
from demo access. In the current pilot slice, only the application admin holds
this authority; no evaluator does.

**Production workspace operational configuration** — The state of a real,
customer-owned casino environment after production setup has been completed. This
is the *outcome* of the provisioning workflow, not an access control concept.
Reflected in `casino_settings.setup_status = 'ready'` for the tenant's casino.
Evaluating the demo does not create or affect production workspace state.

**Application admin** — The platform owner (not a tenant admin). Responsible for
approving evaluators (which is the full extent of demo enablement) and —
separately — authorizing production workspace setup for operational customers.

---

## Foundational Rules

### Identity ≠ Provisioning Authority

Authentication establishes identity only.

Identity alone does not establish:
- staff membership,
- tenant ownership,
- provisioning authority,
- or production workspace setup eligibility.

### Approval is Access

Approving a pilot access request is the single admin decision that grants demo
access. No secondary enablement step is required. On the evaluator's first
sign-in, the system automatically establishes their demo staff binding and routes
them into the application.

### Demo Evaluation Rule

All demo-path evaluators operate inside one pre-seeded, non-authoritative demo
environment (Casino 1).

The demo environment:
- is synthetic,
- is operationally realistic,
- is resettable,
- is not customer-owned,
- and does not represent a configured production workspace.

Demo access does not establish tenancy ownership or organizational membership.
No business-critical workflow, production data, or operator dependency may rely
on demo environment state persistence.

---

## Problem

The current authenticated path is:

```
Magic link → /start → allowlist check → [register | bootstrap | pit]
```

Demo evaluators hit `/register` or `/bootstrap` — both production workspace setup
surfaces. This violates the directive: authentication must not imply provisioning
authority.

Landing page CTAs point to `/contact`, not to the demo or pilot-request paths.

---

## Delivery Summary (PRD-084)

| Deliverable | Status | Notes |
|---|---|---|
| D1 — `provisioning_authorized` DB flag | **Deferred** | No evaluators needing provisioning exist yet. `PILOT_ADMIN_EMAILS` env var used as the admin gate instead. |
| D2 — `AllowlistGateResult` type split | **Deferred** | Service layer still returns `'approved' \| 'not_approved'`. Admin check is a separate env-var pass post-allowlist. |
| D3 — `/start` access-class routing + auto-bind | **Done** — `app/(public)/start/page.tsx` | PILOT_ADMIN_EMAILS-based admin shortcut; idempotent DEMO- binding for all approved non-admin users. |
| D4 — `/demo` defense-in-depth route | **Done** — `app/(public)/demo/page.tsx` | Read-only holding page; no DB writes under any branch. |
| D5 — Landing page CTAs | **Done** — `app/(landing)/page.tsx` | Primary → /signin, Secondary → /request-access, Bottom-close → /signin. |
| Containment guards | **Done** (added in PRD-084) — `lib/server-actions/guards/require-approved-pilot-session.ts` | `requireProvisioningAuth` option added; all 4 setup surfaces fail-closed for non-admin. |

---

## Deliverables

### 1. DB migration — `provisioning_authorized` flag

Add `provisioning_authorized boolean NOT NULL DEFAULT false` to
`approved_email_allowlist`.

This is an **access control flag**. It answers: "Is this approved user permitted
to enter the production workspace setup progression?" It says nothing about
whether setup has been completed or what state the workspace is in.

- `false` (default): evaluator is demo-only. Staff binding is auto-created at
  first sign-in; evaluator lands in the application.
- `true`: user holds explicit provisioning authority. May enter `/register` →
  `/bootstrap`.

Production workspace operational configuration is not tracked by this flag — it
is a downstream outcome expressed in `casino_settings.setup_status`.

Implementation note: `approved_email_allowlist` is retained for containment and
migration minimization. The table now functions as a pilot access registry rather
than a pure email allowlist. No rename is authorized in this slice.

---

### 2. Service layer — update `AllowlistGateResult`

`services/pilot/dtos.ts`:

```ts
// was: 'approved' | 'not_approved'
type AllowlistGateResult = 'approved_demo' | 'approved_provisioning' | 'not_approved'
```

`services/pilot/crud.ts` — `checkAllowlistGate` selects `status,
provisioning_authorized` and returns:
- `approved_demo` when `status = 'active' AND provisioning_authorized = false`
- `approved_provisioning` when `status = 'active' AND provisioning_authorized = true`
- `not_approved` otherwise

Ripple: `app/actions/auth/send-magic-link.ts` and `app/(public)/start/page.tsx`
both consume this type — both need updating.

---

### 3. `/start` gateway — route by access class

Current: approved non-admin → staff check → register / bootstrap / pit.

New:

```
not authenticated                    → /signin          (unchanged)
not approved                         → /request-access  (unchanged)
admin                                → /pilot-review    (unchanged)
approved_provisioning + staff row    → /pit
approved_provisioning + no staff row → /register or /bootstrap
approved_demo + staff row exists     → /pit
approved_demo + no staff row         → auto-create demo staff binding → /pit
```

For `approved_demo` users with no staff row, `/start` creates the Casino 1 staff
binding inline before redirecting to `/pit`. This is the mechanism that makes
approval and demo access a single gate — the binding is established automatically
on first sign-in, not as a separate admin step.

The staff binding insert uses: `casino_id = Casino 1`, `role = 'pit_boss'`,
`employee_id = 'DEMO-{random}'`, `user_id` from the authenticated session.
Creation is idempotent — subsequent sign-ins find the existing row and proceed
directly to `/pit`.

On staff binding creation error: redirect to `/signin?error=service_unavailable`
(fail closed, do not expose partial state).

---

### 4. `/demo` entry route — defense-in-depth only

New `app/(public)/demo/page.tsx` — server component, auth-gated.

The normal approved-demo flow never reaches this route — auto-binding at `/start`
routes evaluators directly to `/pit`. This route exists as a defense-in-depth
catch for edge cases: direct URL navigation, or a user whose demo access was
explicitly revoked by the admin.

The `/demo` surface must not create, mutate, or initialize any production
workspace state.

| Condition | Outcome |
|---|---|
| Not authenticated | → `/signin` |
| Not approved | → `/request-access` |
| Admin | → `/pilot-review` |
| Provisioning-authorized user | → `/start` |
| Active staff binding exists | → `/pit` |
| No staff binding (revoked or edge case) | Holding page |

**Holding page text** (edge case only):

> Interactive demo access is not yet available for your account.
> Contact us if you believe this is an error.

---

### 5. Landing page CTAs

`app/(landing)/page.tsx` — two CTA locations (hero + bottom close):

| Location | Before | After |
|---|---|---|
| Primary | "Request an operational walkthrough" → `/contact` | "Explore Interactive Demo" → `/signin` |
| Secondary | "Explore operational domains" → `#operations` | "Request Production Pilot" → `/request-access` |

---

## Files Touched

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_*.sql` | NEW — `provisioning_authorized` column |
| `types/database.types.ts` | Regenerated after migration |
| `services/pilot/dtos.ts` | Updated `AllowlistGateResult` |
| `services/pilot/crud.ts` | Updated `checkAllowlistGate` |
| `app/actions/auth/send-magic-link.ts` | Type ripple only |
| `app/(public)/start/page.tsx` | Access-class routing + auto-binding for approved_demo |
| `app/(public)/demo/page.tsx` | NEW — defense-in-depth edge case handler |
| `app/(landing)/page.tsx` | CTA text + href updates |

---

## Explicit Exclusions

Per §13 of the directive:

- Production workspace operational configuration (casino setup via `/register` →
  `/bootstrap` — separate operational concern, restricted to provisioning-authorized
  users only)
- Provisioning workflow automation
- CRM / NDA / procurement lifecycle
- Changes to the RLS model

---

## Future Scope (Non-Authoritative)

If pilot operations mature beyond manually managed demo access and provisioning,
future work may formalize:
- organization membership,
- staff invitation lifecycle,
- provisioning approval lifecycle,
- and multi-property access posture.

Those concerns are intentionally excluded from the current pilot containment slice.

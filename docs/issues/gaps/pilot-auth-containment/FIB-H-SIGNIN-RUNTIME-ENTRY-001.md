# Feature Intake Brief

## A. Feature identity

- **Feature name:** Sign-In Runtime Entry Containment
- **Feature ID / shorthand:** FIB-H-SIGNIN-RUNTIME-ENTRY-001
- **Related wedge / phase / slice:** Pilot Authentication / Runtime Entry Containment / PRD-084 successor input
- **Requester / owner:** Product / Architecture
- **Date opened:** 2026-05-18
- **Priority:** P0
- **Target decision horizon:** Pilot / pre-production public evaluation and approved-user runtime access

---

## B. Operator problem statement

The current sign-in flow allows a magic-link authenticated user to pass through a single `/start` gateway that does not adequately distinguish demo evaluation, existing operational access, admin review access, and production provisioning authority. This creates two opposing risks: public or newly approved users may be routed toward production bootstrap too early, while already registered pilot users or admins may lose a clear authenticated path back into the application if the flow is over-corrected toward demo-only routing.

---

## C. Pilot-fit / current-slice justification

This belongs in the current pilot slice because the sign-in path is now the public and approved-user entry point into the system. The product cannot safely invite operational leadership to evaluate the platform if authentication still implies provisioning authority, and it cannot safely refactor the demo path if existing staff-bound users and admins no longer have a reliable way to enter their intended runtime surfaces. The slice must correct sign-in intent resolution before any broader onboarding, seeded demo, or provisioning lifecycle work proceeds.

---

## D. Primary actor and operator moment

- **Primary actor:** Public demo evaluator / approved pilot user / existing staff-bound operator / application admin
- **When does this happen?** Immediately after magic-link authentication or when an authenticated user returns to the application
- **Primary surface:** `/signin`, `/auth/confirm`, `/start`, `/demo`, `/pit`, `/pilot-review`, `/register`, `/bootstrap`
- **Trigger event:** User attempts to sign in or follows a magic-link confirmation and needs to be routed to the correct runtime surface based on existing system state and authorization posture

---

## E. Feature Containment Loop

1. Public visitor clicks the demo CTA → system routes the user into the sign-in path while preserving demo-evaluation intent.
2. User submits email for magic-link sign-in → system checks whether the email is allowed to authenticate under the pilot gate.
3. User follows the magic link → system confirms authentication and sends the user to the runtime-entry resolver.
4. Runtime-entry resolver checks whether the user is an application admin → system routes admin users to the pilot/admin review surface.
5. Runtime-entry resolver checks whether the user already has a valid staff binding → system routes existing operational users to the operational runtime.
6. Runtime-entry resolver checks whether the user is explicitly provisioning-authorized → system routes provisioning-authorized users into the existing register/bootstrap progression only when no staff binding already exists.
7. Runtime-entry resolver checks whether the user is approved for demo evaluation only → system routes demo users to `/demo`.
8. Demo route resolves whether a seeded demo staff binding exists → system routes to the demo operational walkthrough surface or renders an honest holding page.
9. Unapproved or unauthenticated users are redirected away from protected surfaces → system preserves the closed pilot boundary and avoids implicit provisioning access.

---

## F. Required outcomes

- Authentication establishes identity only; it does not imply staff membership, tenant ownership, provisioning authority, or bootstrap eligibility.
- Existing staff-bound pilot users retain a working sign-in path into the operational runtime.
- Application admins retain a working sign-in path into the admin/pilot-review surface.
- Demo-approved users are routed to a contained demo entry surface, not `/register` or `/bootstrap`.
- Provisioning-authorized users may access the existing register/bootstrap progression only when they are not already staff-bound.
- Bootstrap is independently guarded server-side and cannot rely on `/start` routing alone as its authorization boundary.
- Landing-page demo and pilot-request CTAs align with the runtime entry model.

---

## G. Explicit exclusions

- No seeded demo tenancy creation in this slice.
- No demo reset mechanics.
- No production provisioning automation.
- No CRM, NDA, procurement, or implementation lifecycle system.
- No staff invitation redesign.
- No multi-property organization modeling.
- No billing or subscription flow.
- No enterprise identity federation.
- No RLS model redesign.
- No public signup reopening.
- No rename of `approved_email_allowlist` in this slice.
- No new top-level onboarding platform.

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Demo-only post-auth routing | Corrects premature bootstrap exposure | Breaks existing staff-bound users and admins by treating all approved users as evaluators |
| Provisioning-only approved routing | Preserves existing bootstrap behavior | Recreates the original problem where authentication implies provisioning authority |
| Full onboarding lifecycle state machine | Would model prospect, NDA, pilot approval, provisioning readiness, active tenant, and staff membership explicitly | Premature for pilot; creates a customer-lifecycle platform instead of fixing runtime entry containment |
| New organization membership system | Would solve staff, tenant, and org identity more cleanly long-term | Too broad for this slice; existing staff binding is the current runtime truth |
| Rename `approved_email_allowlist` to pilot access registry | The table now carries more than pure allowlist semantics | Rename churn is unnecessary; semantic drift should be documented but not refactored here |
| Route all demo CTA traffic directly to `/pit` | Makes the demo feel immediate | Hides the absence of seeded demo tenancy and risks turning demo into shadow production |

---

## I. Dependencies and assumptions

- PRD-083 magic-link and allowlist gate are already present or treated as parent behavior.
- `/start` currently acts as the post-auth runtime-entry resolver.
- Existing staff binding is the current system signal for operational runtime access.
- Existing admin detection and `/pilot-review` surface remain valid.
- Existing `/register` and `/bootstrap` progression remains valid only for explicitly provisioning-authorized users without staff binding.
- `approved_email_allowlist` exists and may be minimally extended or interpreted to distinguish demo approval from provisioning authorization.
- Seeded demo tenancy is not yet guaranteed; the `/demo` holding page is acceptable fallback.
- Bootstrap and register routes can be updated to enforce server-side authorization independently of `/start`.

---

## J. Out-of-scope but likely next

- Seeded demo tenancy and demo staff-profile creation.
- Production provisioning authorization UX/admin control refinement.
- Staff invitation and organization-membership lifecycle.
- Demo data reset and isolation policy.

---

## K. Expansion trigger rule

Amend this intake brief if downstream artifacts propose:

- a new user-visible onboarding surface beyond `/signin`, `/start`, `/demo`, `/register`, `/bootstrap`, `/pit`, or `/pilot-review`;
- a new actor not represented in this brief;
- a new lifecycle state machine for prospects, NDA, procurement, or implementation;
- seeded demo data creation or reset mechanics;
- staff invitation redesign;
- organization or multi-property modeling;
- RLS model redesign;
- billing, subscription, CRM, or external integration behavior;
- any route that permits bootstrap access without explicit provisioning authorization;
- any change that prevents existing staff-bound users or admins from signing in.

---

## L. Scope authority block

- **Intake version:** v0
- **Frozen for downstream design:** No
- **Downstream expansion allowed without amendment:** No
- **Open questions allowed to remain unresolved at scaffold stage:**
  - Whether the landing-page demo CTA should route to `/signin` or `/demo`
  - Exact storage location for `provisioning_authorized`
  - Whether demo staff binding uses one shared seeded profile or per-user seeded profiles
  - Exact holding-page copy for users without seeded demo access
- **Human approval / sign-off:** Pending

---

## Scope Authority Statement

This slice exists to correct the authenticated runtime-entry boundary.

The system must distinguish:

```text
identity established
≠ staff-bound operational access
≠ demo evaluation access
≠ provisioning authority
≠ admin review authority
```

The correct post-auth routing model is state-aware but not lifecycle-heavy.

The intended routing priority is:

```text
unauthenticated
→ /signin

admin/internal
→ /pilot-review

authenticated + valid staff binding
→ /pit

authenticated + provisioning authorized + no staff binding
→ existing register/bootstrap progression

authenticated + demo approved + no staff binding
→ /demo

not approved
→ /request-access
```

Operational runtime access is derived from staff binding.

Provisioning authority is only the right to begin or continue production setup when no operational binding already exists.

Demo approval is only the right to evaluate a contained, non-authoritative demo experience.

Bootstrap must remain a privileged provisioning surface and must never be reachable merely because a user authenticated.

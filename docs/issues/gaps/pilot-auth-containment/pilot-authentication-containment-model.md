# PILOT AUTHENTICATION CONTAINMENT MODEL
## Controlled Access Strategy for Cortalis Pilot Deployment

**status:** ACTIVE PROPOSAL  
**date:** 2026-05-11  
**scope:** Production pilot access governance, onboarding containment, and authentication gating  
**applies_to:** Public production deployment, Supabase auth flow, onboarding pipeline, tenant creation

---

# 1. Purpose

The current production deployment exposes unrestricted signup and onboarding flows to arbitrary users.

This creates unacceptable pilot-stage risk:

- uncontrolled tenant creation
- operational telemetry pollution
- support burden from non-pilot users
- premature exposure before pricing and operational readiness exist
- implicit trust boundary collapse between authentication and authorization

This document establishes the pilot authentication containment model.

---

# 2. Core Decision

## Public Self-Service Signup Is Disabled

The system will no longer allow arbitrary users to:

- create accounts
- create companies
- create casinos
- enter onboarding flows
- provision operational environments

without prior approval.

---

# 3. Pilot Access Model

## Canonical Flow

```text
Public Visitor
    ↓
Request Access
    ↓
Admin Review
    ↓
Approved Email Allowlist
    ↓
Magic Link Authentication
    ↓
First Login Bootstrap
    ↓
Pilot Access Granted
```

---

# 4. Publicly Accessible Surfaces

## Allowed Public Surfaces

The following remain public:

- landing page
- marketing pages
- login page
- request-access form
- privacy / legal pages

## Restricted Surfaces

The following become gated:

- tenant bootstrap
- casino creation
- company creation
- operational dashboards
- rating slips
- shift intelligence
- admin setup flows

---

# 5. Authentication Posture

## Magic-Link Authentication

Pilot access uses:

```ts
supabase.auth.signInWithOtp()
```

instead of:

```ts
supabase.auth.signUp()
```

### Rationale

Magic-link auth:

- reduces onboarding friction
- avoids password lifecycle complexity
- fits operator workflows
- is appropriate for controlled pilot access
- simplifies support burden

---

# 6. Architectural Principle

## Identity ≠ Pilot Authorization

Authentication alone is insufficient.

The system must distinguish between:

```text
Authenticated Identity
```

and:

```text
Authorized Pilot Participant
```

This distinction becomes a foundational system invariant.

---

# 7. Canonical Tables

## 7.1 `pilot_access_requests`

```sql
CREATE TABLE pilot_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email TEXT NOT NULL,
  company_name TEXT,
  casino_name TEXT,
  message TEXT,

  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected

  reviewed_by UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 7.2 `approved_email_allowlist`

```sql
CREATE TABLE approved_email_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email TEXT NOT NULL UNIQUE,

  company_id UUID NULL,
  casino_id UUID NULL,

  invited_by UUID NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  expires_at TIMESTAMPTZ NULL,
  used_at TIMESTAMPTZ NULL
);
```

---

# 8. Login Flow

## Step 1 — User Enters Email

Public login screen:

```text
Enter your approved pilot email
```

---

## Step 2 — Backend Allowlist Check

```sql
SELECT *
FROM approved_email_allowlist
WHERE email = $1;
```

---

## Step 3 — Reject Unknown Emails

If no allowlist entry exists:

```text
This email has not been approved for pilot access.
```

The system:

- does not create auth users
- does not bootstrap tenants
- does not create operator records
- does not begin onboarding

---

## Step 4 — Approved User Receives Magic Link

```ts
await supabase.auth.signInWithOtp({
  email
})
```

---

## Step 5 — First Login Bootstrap

Only after successful authenticated session:

- create staff record
- associate company
- associate casino
- initialize onboarding state
- provision pilot environment

---

# 9. Request Access Flow

## Public CTA Replacement

Replace:

```text
Start Free
```

with:

```text
Request Pilot Access
```

or:

```text
Apply for Early Access
```

---

## Request Form Suggested Fields

```text
- Name
- Email
- Property / Casino Name
- Role
- Estimated Table Count
- Optional Message
```

---

# 10. Explicit Non-Goals

The pilot access model must NOT evolve into a generalized SaaS platform.

Out of scope:

- Stripe billing
- subscription plans
- seat licensing
- invitation-management platform
- automated approvals
- RBAC expansion
- marketplace onboarding
- self-service property provisioning
- generic organization management
- enterprise IAM

This is a controlled pilot access gate.

Not a production-scale onboarding platform.

---

# 11. Operational Benefits

This containment model:

- prevents random tenant creation
- blocks telemetry pollution
- reduces support overhead
- prevents abuse/spam
- restores intentional onboarding
- stabilizes operational scope during pilot phase

Most importantly:

> It re-establishes operational trust boundaries.

---

# 12. Security Benefits

The model reduces exposure from:

- credential stuffing
- fake operator accounts
- automated signup abuse
- unauthorized property creation
- malformed pilot data generation

The system becomes:

```text
closed-access operational software
```

instead of:

```text
public experimental SaaS
```

---

# 13. Strategic Framing

The current platform does not yet possess:

- finalized pricing
- SLA posture
- operational support process
- production observability maturity
- deployment recovery guarantees
- onboarding governance
- customer support staffing

Therefore:

> unrestricted public signup is premature exposure.

The pilot phase requires containment, not growth mechanics.

---

# 14. Recommended Implementation Sequence

## Phase 1 — Immediate Containment

- disable public signup
- add allowlist check
- introduce request-access form
- enable magic-link login only

---

## Phase 2 — Minimal Admin Workflow

- internal admin review surface
- approve / reject requests
- insert allowlist entries

---

## Phase 3 — First-Login Bootstrap Alignment

- ensure onboarding only occurs after approved auth session
- separate identity creation from tenant provisioning

---

# 15. Final Directive

Do not build a SaaS onboarding platform before proving operational deployment viability.

The current objective is:

```text
controlled pilot validation
```

not:

```text
unbounded customer acquisition
```

The authentication boundary must reflect that reality.

---

# One-Line Invariant

If authentication alone can create an operator environment, the pilot boundary is broken.

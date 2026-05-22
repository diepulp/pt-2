# DEMO SIGN-IN FLOW CONTAINMENT DIRECTIVE

**Document type:** Pilot containment / authentication-boundary directive  
**Status:** Proposed  
**Applies to:** Public authentication flow, landing-page CTA routing, bootstrap gating, seeded demo tenancy access  
**Date:** 2026-05-18  
**Scope horizon:** Pilot / pre-production public evaluation posture  

---

## 1. Purpose

This directive establishes the canonical authentication and evaluation-entry posture for PT-2 / d3lt during the pilot and pre-production phase.

The current authentication flow incorrectly collapses:

- identity creation,
- product evaluation,
- casino provisioning,
- operational onboarding,
- and production tenancy initialization

into one uninterrupted path.

This creates a semantic and operational mismatch:

```text
anonymous internet user
→ authenticated user
→ production bootstrap authority
```

The system is not ready to treat public authentication as implicit authorization to initialize a production casino environment.

This directive corrects that boundary.

---

## 2. Core Decision

The default sign-in experience must route authenticated users into a contained seeded demo environment.

The casino bootstrap flow is no longer the default authenticated entry path.

Bootstrap becomes a privileged provisioning operation gated behind explicit operational approval.

---

## 3. Canonical Surface Separation

The system now distinguishes three separate surfaces:

| Surface | Purpose | Exposure |
|---|---|---|
| Landing Page | Narrative and operational positioning | Public |
| Demo Environment | Product evaluation and operational walkthrough | Public authenticated |
| Production Provisioning | Real tenant initialization | Restricted |

These surfaces must not be conflated.

---

## 4. Demo Sign-In Intent

The `/demo` flow exists to allow operational leadership to evaluate:

- floor workflows,
- operational oversight,
- accountability continuity,
- shift visibility,
- operational intelligence surfaces,
- and system ergonomics

without:

- provisioning infrastructure,
- exposing sensitive deployment workflows,
- or creating production tenants.

The user should evaluate a functioning operational system, not an empty installation wizard.

---

## 5. Demo Environment Posture

The demo environment is:

- seeded,
- operationally realistic,
- isolated,
- resettable,
- non-authoritative,
- non-production,
- and pilot-contained.

The environment should already contain:

- active tables,
- staff,
- player sessions,
- operational telemetry,
- financial activity examples,
- audit history,
- and representative workflows.

---

## 6. Authentication Boundary

Authentication establishes identity only.

Authentication does **not** imply:

- production authorization,
- tenant ownership,
- casino provisioning authority,
- bootstrap permission,
- or administrative infrastructure access.

The corrected flow is:

```text
identity established
→ authorization context resolved
→ appropriate operational surface granted
```

not:

```text
authenticated
→ bootstrap casino
```

---

## 7. Canonical Pilot Flow

### 7.1 Public evaluation flow

```text
Landing Page
→ Explore Interactive Demo
→ Magic Link Authentication
→ Seeded Demo Environment
→ Operational Walkthrough Experience
```

This is the default public path.

### 7.2 Production pilot flow

```text
Landing Page
→ Request Production Pilot
→ Human Review / Operational Discussion
→ NDA / Provisioning Review
→ Explicit Provisioning Authorization
→ Bootstrap Access Granted
```

Provisioning authorization is explicit and deliberate.

It is not the default outcome of authentication.

---

## 8. Bootstrap Reclassification

The bootstrap surface is reclassified.

It is no longer:

```text
default onboarding UX
```

It is now:

```text
privileged infrastructure provisioning workflow
```

The bootstrap process may involve:

- database provisioning,
- operational tenancy initialization,
- compliance-sensitive setup,
- infrastructure allocation,
- operational configuration,
- and deployment-bound actions.

Therefore:

- bootstrap access must remain gated,
- bootstrap must not appear to public demo users,
- bootstrap must not be routable from the default authenticated flow.

---

## 9. Minimal Runtime Authorization Model

Pilot scope intentionally avoids over-modeling commercial lifecycle states.

The system currently recognizes only the minimum required runtime distinction:

| Runtime posture | Purpose |
|---|---|
| Demo User | Access seeded evaluation environment |
| Internal/Admin | Operate demo environment and grant provisioning access |
| Provisioning Authorized | Explicitly permitted to access bootstrap flow |

The system intentionally does **not** yet formalize:

- procurement workflow,
- NDA lifecycle management,
- CRM states,
- onboarding orchestration,
- implementation project tracking,
- or multi-stage approval systems.

Those remain operational-process concerns outside pilot runtime scope.

---

## 10. Landing Page CTA Realignment

The landing page CTA posture must align with the corrected flow.

### Primary CTA

```text
Explore Interactive Demo
```

Purpose:

- immediate product evaluation,
- operational walkthrough,
- seeded workflow inspection.

Routes into:

- `/demo`,
- magic-link authentication,
- seeded tenancy access.

### Secondary CTA

```text
Request Production Pilot
```

Purpose:

- operational discussion,
- pilot qualification,
- provisioning review.

This path may involve:

- human contact,
- scheduling,
- email exchange,
- NDA handling,
- or manual approval.

This path does not automatically create runtime authorization state.

---

## 11. Demo Containment Rules

The `/demo` surface must **not**:

- expose bootstrap UX,
- create casinos,
- create production tenants,
- expose infrastructure configuration,
- expose deployment-sensitive configuration,
- expose production secrets,
- imply settlement authority,
- imply accounting authority,
- or imply production readiness.

The `/demo` surface should:

- demonstrate operational continuity,
- demonstrate workflow coherence,
- demonstrate accountability,
- demonstrate managerial visibility,
- demonstrate floor-control ergonomics,
- preserve narrative continuity from the landing page,
- and reinforce the “one operational system” posture.

---

## 12. Narrative Alignment

This directive aligns the runtime flow with the landing-page narrative architecture.

The landing page promises:

```text
operational walkthrough
```

The system must therefore deliver:

```text
operational walkthrough
```

not:

```text
production bootstrap ceremony
```

The corrected flow preserves semantic congruity between:

- public narrative,
- operational evaluation,
- and runtime behavior.

---

## 13. Explicit Exclusions

This directive explicitly excludes:

- full onboarding automation,
- CRM implementation,
- billing/subscription systems,
- production provisioning automation,
- staff invitation redesign,
- multi-property organization modeling,
- enterprise identity federation,
- procurement lifecycle tooling,
- or implementation-project orchestration.

This is a pilot containment correction, not a full customer-lifecycle platform initiative.

---

## 14. Success Criteria

The directive is considered successful when:

- authenticated public users enter the seeded demo environment by default,
- bootstrap is no longer exposed as default onboarding,
- production provisioning is explicitly gated,
- landing-page CTA posture matches runtime behavior,
- seeded operational workflows exist for evaluation,
- and the system no longer conflates authentication with provisioning authority.

---

## 15. Closing Principle

The public product experience should demonstrate operational reality before asking for operational commitment.

The system must first prove:

```text
how the operation functions
```

before exposing:

```text
how the infrastructure is provisioned
```

That distinction is now canonical.

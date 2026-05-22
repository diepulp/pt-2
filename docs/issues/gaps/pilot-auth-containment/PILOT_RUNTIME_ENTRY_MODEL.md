
# PILOT RUNTIME ENTRY MODEL
## Governance Artifact — Admin-Mediated Deployment Runtime Model

**Status:** Proposed Canonical Runtime Governance Artifact  
**Date:** 2026-05-18  
**Scope:** PT-2 / d3lt pilot deployment runtime access model  
**Audience:** Architecture, product governance, onboarding implementation, auth/runtime surfaces  
**Purpose:** Establish the canonical runtime-entry and onboarding posture for the PT-2 pilot environment while preventing accidental drift into generic self-serve SaaS multi-tenant architecture.

---

# 1. Why This Artifact Exists

Recent onboarding and runtime-entry exploration surfaced a critical architectural clarification:

The platform is **not** a generic self-serve SaaS product.

The system is:

> an admin-mediated casino operational infrastructure deployment platform
> with sandbox demo access.

Those are fundamentally different operational categories.

The distinction is load-bearing because generic SaaS onboarding patterns introduce architectural assumptions that do not match the operational reality of PT-2.

The wrong mental model produces:

- fake tenant lifecycle abstractions,
- unnecessary provisioning systems,
- premature workspace-generation UX,
- self-serve multi-tenant assumptions,
- semantic confusion between demo access and operational runtime membership.

The correct model is dramatically simpler.

---

# 2. Canonical Runtime Model

The PT-2 pilot runtime model consists of only four canonical concerns:

| Concern | Meaning |
|---|---|
| Identity | Authentication and human identity proof |
| Runtime Membership | Membership in an already-existing operational runtime |
| Demo Access | Isolated sandbox evaluation access |
| Admin Authority | Operational deployment and membership governance |

Everything else is implementation operations.

---

# 3. Core Architectural Clarification

PT-2 is not building:

- self-serve tenant creation,
- self-provisioned organizations,
- automated casino deployment creation,
- generic workspace onboarding,
- “Create Your Casino” UX,
- public tenant lifecycle orchestration.

PT-2 is building:

- manually provisioned casino operational runtimes,
- admin-controlled operational deployment,
- sandbox evaluation environments,
- runtime membership assignment,
- authenticated operational access.

Provisioning is not a runtime-domain concern.

Provisioning is implementation operations.

---

# 4. Runtime Boundary

## 4.1 Production Runtime

A production runtime is:

> a manually provisioned operational casino deployment.

Characteristics:

- created intentionally by PT-2 administrators,
- tied to a real operational casino environment,
- configured through implementation work,
- may require:
  - legacy data sanitization,
  - operational configuration,
  - compliance review,
  - infrastructure setup,
  - deployment validation.

This is not a self-service workflow.

This is operational deployment work.

---

## 4.2 Sandbox Runtime

Sandbox runtime exists for:

- evaluation,
- walkthroughs,
- demonstrations,
- operator familiarization,
- pre-sales operational review,
- pilot exploration.

Sandbox access is intentionally separated from operational runtime membership.

This follows established enterprise patterns where:

- sandbox/demo environments are isolated from production,
- evaluation access precedes deployment,
- implementation and provisioning are high-touch,
- operational environments are administrator-controlled.

---

# 5. Runtime Entry Taxonomy

## 5.1 Identity

Identity answers:

> Who is this human?

Examples:

- magic-link authentication,
- passwordless authentication,
- SSO later,
- verified email identity.

Identity alone grants nothing operationally.

Identity is not runtime access.

---

## 5.2 Runtime Membership

Runtime membership answers:

> Which operational runtime may this authenticated user enter?

Examples:

- casino-scoped staff membership,
- operational role assignment,
- runtime authorization,
- shift-manager access,
- pit-boss access,
- compliance reviewer access.

Runtime membership is the true operational boundary.

---

## 5.3 Demo Access

Demo access answers:

> May this identity enter a sandbox evaluation environment?

This is intentionally distinct from production membership.

Characteristics:

- isolated runtime,
- non-operational data,
- bounded permissions,
- revocable,
- low-risk evaluation posture,
- may be request-approved manually.

Demo access does not imply:

- production membership,
- deployment existence,
- casino provisioning,
- implementation completion.

---

## 5.4 Admin Authority

Admin authority answers:

> Who may govern runtime membership and operational deployment state?

Examples:

- approve demo requests,
- assign runtime membership,
- provision operational deployment,
- revoke access,
- manage deployment readiness,
- approve implementation cutover.

This is the real control surface.

---

# 6. Provisioning Clarification

## 6.1 Provisioning Is Not a User Journey

The system previously drifted toward a hypothetical abstraction:

```text
ProvisioningCandidate
```

This abstraction is now rejected.

Reason:

Provisioning is not something a normal runtime actor performs.

Provisioning is implementation operations performed by platform administrators.

The abstraction incorrectly implied:

```text
anonymous visitor
→ onboarding flow
→ tenant creation
→ operational runtime
```

That is not the PT-2 deployment reality.

The actual operational sequence is:

```text
evaluation interest
→ sandbox access (optional)
→ commercial / implementation process
→ manual operational deployment
→ runtime membership assignment
→ operational runtime access
```

That is materially different.

---

# 7. Runtime State Model

## 7.1 Canonical Runtime States

### Sandbox Evaluator

A user with:

- authenticated identity,
- sandbox/demo access,
- no operational runtime membership.

### Operational Member

A user with:

- authenticated identity,
- membership in a provisioned operational runtime.

### Runtime Administrator

A user with authority to:

- manage memberships,
- approve access,
- govern deployment runtime.

### Platform Administrator

A PT-2 internal operator with authority to:

- provision deployments,
- perform implementation operations,
- manage deployment lifecycle.

---

# 8. Recommended Architectural Consequences

---

## 8.1 Separate Demo Runtime From Operational Runtime

Do not conflate:

```text
demo access
```

with:

```text
runtime membership
```

Those are separate operational realities.

---

## 8.2 Runtime Membership Is The True Boundary

The real application boundary is:

```text
authenticated identity
+
runtime membership
```

not:

```text
tenant creation
```

This aligns with enterprise operational systems where runtime access is granted into pre-existing deployments.

---

## 8.3 High-Touch Deployment Is Expected

The current deployment posture is not a temporary failure of automation.

It is a normal enterprise implementation model.

Enterprise onboarding commonly includes:

- implementation review,
- operational setup,
- admin-controlled provisioning,
- manual deployment steps,
- environment validation,
- staged rollout.

This is especially true in regulated operational environments.

---

# 9. Alignment With External Enterprise Patterns

External enterprise onboarding patterns strongly align with the corrected PT-2 direction:

| Pattern | Alignment |
|---|---|
| Sandbox/demo separated from production runtime | Strong |
| Runtime membership as operational boundary | Strong |
| High-touch implementation onboarding | Strong |
| Manual provisioning for regulated environments | Strong |
| Admin-controlled deployment lifecycle | Strong |
| Self-serve tenant creation | Weak / misaligned |

Research consistently shows that enterprise onboarding differs materially from commodity self-serve SaaS onboarding, particularly in regulated or operationally sensitive domains. Enterprise onboarding often remains implementation-heavy and administrator-mediated rather than purely self-service. citeturn0search0turn0search2turn0search3turn0search28

Enterprise systems also commonly separate sandbox and production environments as distinct operational categories. citeturn0search1turn0search10turn0search12turn0search21

---

# 10. Canonical Entry Flow

## 10.1 Approved Runtime Entry Sequence

```text
Anonymous Visitor
    ↓
Authenticated Identity
    ↓
(Optional) Demo Request
    ↓
Sandbox Access Approval
    ↓
Sandbox Runtime
    ↓
Commercial / Implementation Process
    ↓
Manual Operational Deployment
    ↓
Runtime Membership Assignment
    ↓
Operational Runtime Access
```

This is now the canonical runtime-entry posture.

---

# 11. Explicit Exclusions

This runtime model explicitly excludes:

- self-serve deployment creation,
- automated casino provisioning,
- generic workspace creation UX,
- multi-tenant self-registration,
- public deployment orchestration,
- customer-created operational runtimes,
- autonomous tenant lifecycle management,
- public organization-creation flows.

Any future introduction of those concepts requires:

- explicit FIB amendment,
- explicit governance review,
- explicit deployment-governance ADR.

---

# 12. Governance Rules

## 12.1 Runtime Membership Rule

Operational runtime access requires:

```text
authenticated identity
+
approved runtime membership
```

Identity alone is insufficient.

---

## 12.2 Sandbox Isolation Rule

Sandbox environments must remain operationally isolated from production runtime membership.

No implicit escalation.

---

## 12.3 Provisioning Authority Rule

Provisioning authority belongs exclusively to platform administration and implementation operations.

Not to runtime actors.

---

## 12.4 Runtime Simplicity Rule

Do not introduce abstractions that imply:

- self-serve deployment lifecycle,
- customer-owned runtime orchestration,
- autonomous tenant provisioning,

unless the business model materially changes.

---

# 13. Architectural Closing Statement

The system does not need a generalized SaaS tenant-onboarding ontology.

It needs:

- identity,
- runtime membership,
- sandbox access,
- administrative deployment authority.

Everything else is operational implementation detail.

That simplification is not a reduction in capability.

It is the removal of a false architectural premise.

---

# 14. Supporting References

- urlAuth0 — B2B SaaS onboarding strategieshttps://auth0.com/blog/user-onboarding-strategies-b2b-saas/
- urlMicrosoft Dynamics — production vs sandbox environmentshttps://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/environment-types
- urlWorkOS — enterprise organization onboarding patternshttps://workos.com/blog/b2b-saas-onboarding-organizations-users
- urlAWS SaaS Lens — tenant onboarding patternshttps://aws.amazon.com/blogs/apn/tenant-onboarding-best-practices-in-saas-with-the-aws-well-architected-saas-lens/


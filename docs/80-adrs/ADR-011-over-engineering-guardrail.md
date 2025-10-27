# ADR-011: Over-Engineering Guardrail (OE-01 Enforcement)

**Status:** Accepted  
**Date:** 2025-10-25  
**Owner:** Architecture / Tech Leads  
**Applies to:** All infrastructure, platform, and cross-domain changes  
**Decision type:** Process + Governance

---

## Context

- `70-governance/OVER_ENGINEERING_GUARDRAIL.md` (PT-STANDARD-OE-01) documents symptoms of premature abstraction (buses, event logs, redundant idempotency layers) and defines triggers that justify added complexity (second consumer, SLO breach, compliance, horizontal scale).
- The checklist existed in docs but was not anchored to an ADR. As a result, infra-heavy changes occasionally landed without proving a trigger or drafting a Mini-ADR.

---

## Decision

1. **Trigger Proof Required:** Any work item introducing new infra/abstractions must document the OE-01 checklist and the satisfied trigger (per §6) before implementation. If no trigger exists, the work must be descoped or a Mini-ADR raised for exceptions.

2. **PR Template Hook:** PRs touching infrastructure/shared layers must answer:
   - Which OE-01 trigger applies?
   - Link to supporting evidence (incident, metric, mandate).
   - Link to Mini-ADR if >150 LOC infra change or if multiple triggers would otherwise be violated.

3. **Roadmap Gate:** During backlog grooming and Stabilization, the team reviews OE-01 compliance to ensure MVP remains lean. Deviations require sign-off from Tech Lead + Product, referencing this ADR.

---

## Rationale

- **Scope control:** Keeps MVP focused on vertical value delivery.
- **Auditability:** Explicit linkage between work and triggers makes it easy to justify complexity later.
- **Consistency:** Aligns with Balanced Architecture intake (ADR-009) and DTO/service gates to create a holistic SDLC governance stack.

---

## Alternatives Considered

- **Informal “use judgment” policy:** Already failed in Wave 2, leading to unneeded event buses. Rejected.
- **Heavy approval board:** Overkill for a small team; the guardrail + Mini-ADR approach stays lightweight.

---

## References

- `70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- ADR-009 (Balanced Architecture Intake)
- ADR-010 (DTO & Service Compliance Gate)

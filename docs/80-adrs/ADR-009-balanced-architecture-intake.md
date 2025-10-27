# ADR-009: Balanced Architecture Intake & Transport Gate

**Status:** Accepted  
**Date:** 2025-10-25  
**Owner:** Architecture / Delivery  
**Applies to:** All backlog items and SDLC phases  
**Decision type:** Process

---

## Context

- `20-architecture/BALANCED_ARCHITECTURE_QUICK.md` defines how PT-2 work is classified (Vertical slice, Horizontal layer, Hybrid orchestration, Service-only) and how transport choices (Route Handler vs Server Action) are made.
- Despite the guidance, teams were starting implementation before explicitly deciding slice type, affected bounded contexts (per SRM), and HTTP transport, leading to mismatched expectations in code review and inconsistent cache strategies.
- The SDLC roadmap references “vertical slices” broadly but lacked a concrete gate to ensure every work item follows the Balanced Architecture decision tree and the transport rule (React Query → Route Handler, forms → Server Action).

---

## Decision

1. **Intake Card Required:** Every backlog item/PRD slice must include the Balanced Architecture intake card answers _before_ entering design/implementation:
   - Scope (# of bounded contexts, per SRM)
   - User-facing vs infrastructure
   - Slice classification (Vertical / Horizontal / Hybrid / Service)
   - Transport (Route Handler vs Server Action) + rationale
   - Estimated timeline from the quick reference table

2. **Roadmap Gate:** Phase 1 (Inception/PRD) of the SDLC cannot close without intake cards for scoped MVP slices. Phase 2 (Architecture) re-validates the classification when new information emerges; any change requires updating the card + linking to this ADR.

3. **Code Review Checklist:** Reviewers confirm the implementation matches the declared classification and transport (e.g., vertical slice contains migration → service → route → hook → UI). Deviations must either update the intake card or file a Mini-ADR per OE-01 guardrail.

---

## Rationale

- **Predictable scope:** Explicit classification keeps MVP work vertical-first unless a trigger justifies horizontal/infra, reducing accidental over-engineering.
- **Transport consistency:** Applying the transport rule during intake avoids late rewrites (React Query expecting Route Handlers, forms expecting Server Actions).
- **Traceability:** Intake cards document why a decision was made, making it easy to audit later or feed into ADRs when lasting architecture changes occur.

---

## Alternatives Considered

- **Ad-hoc decisions per engineer:** Led to drift and conflicting assumptions. Rejected.
- **Automated tooling without documentation:** Hard to enforce context or transport rationale. Rejected.

---

## Implementation Notes

- Store intake card entries in the issue template / PR description using a copy of the decision tree questions.
- The SDLC roadmap now references this ADR in Phases 1–3 when describing slice planning.

---

## References

- `20-architecture/BALANCED_ARCHITECTURE_QUICK.md`
- [ADR-000 (Matrix as Schema Contract)](ADR-000-matrix-as-contract.md)
- [ADR-007 (API Surface Catalogue)](ADR-007-api-surface-catalogue.md)
- [ADR-008 (Service Layer Architecture)](ADR-008-service-layer-architecture.md)

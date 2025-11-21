# ADR-008: Service Layer Architecture Diagram & Template

**Status:** Accepted  
**Date:** 2025-10-25  
**Owner:** Platform/Services  
**Applies to:** All domain services under `services/**`  
**Decision type:** Architecture + Process

---

## Context

- `70-governance/SERVICE_TEMPLATE.md` (v2.0.1) codifies how each bounded context structures DTOs, CRUD modules, factories, and shared helpers, but this practice had not been recorded in ADR form.
- The API catalogue (ADR-007) and Balanced Architecture card both assume a consistent service layer diagram that ties Supabase schema, Route Handlers/Server Actions, and React Query hooks together.
- Without an ADR, contributors risk re-introducing ad-hoc service hierarchies, manual DTOs, or cross-context imports that break SRM guarantees.

---

## Decision

1. **Canonical Template:** The directory + interface structure described in `70-governance/SERVICE_TEMPLATE.md` is the required architecture for every domain service. Factories expose explicit interfaces, DTOs derive from generated Supabase types, and shared concerns live in `services/shared`.

2. **Diagram Requirement:** Architecture & Security phase of the SDLC must include an updated service-layer diagram (can be Mermaid) that shows Route Handler / Server Action → Service → Supabase flow per context. The roadmap references this ADR to ensure the diagram stays maintained.

3. **Compliance Gate:** Before declaring a slice “done,” teams must attest that:
   - DTOs follow the canonical patterns (ties to DTO standard).
   - Services expose the explicit interfaces defined in the template.
   - No cross-context imports exist outside published DTOs/views.

4. **Evolution via ADR:** Changes to service layering (e.g., introducing base classes, alternate factory patterns, or new shared modules) require an update to this ADR (or a successor) so the repo never drifts silently.

---

## Rationale

- **Consistency:** A uniform service layer keeps React Query hooks, Server Actions, and Supabase queries predictable and easier to review.
- **SRM Alignment:** Making architecture decisions traceable to an ADR reinforces ADR-000’s matrix-as-contract stance; services mirror schema ownership cleanly.
- **DX:** Clear directories/interfaces help tooling (lint, tests, code generation) and reduce onboarding cost.

---

## Alternatives Considered

- **Per-team freedom:** Allowing each domain to structure services differently led to manual DTOs, implicit dependencies, and harder reviews. Rejected.
- **Framework-based abstraction layers:** Adding ORMs/service frameworks was deemed overkill for the MVP scope (see Over-Engineering guardrail).

---

## Implementation Notes

- The diagram should live either alongside the service template doc or embedded in the roadmap; keep it updated when adding new domains or cross-context workflows.
- Enforce via lint/tests (e.g., forbid `ReturnType<typeof createService>` usage) as described in the template doc.

---

## References

- `70-governance/SERVICE_TEMPLATE.md`
- `25-api-data/DTO_CANONICAL_STANDARD.md`
- ADR-000 (Matrix as Schema Contract)
- ADR-007 (API Surface Catalogue)

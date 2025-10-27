# ADR-010: DTO & Service Compliance Gate

**Status:** Accepted  
**Date:** 2025-10-25  
**Owner:** Platform/Services  
**Applies to:** All domain services, DTOs, and migrations  
**Decision type:** Process + Enforcement

---

## Context

- `25-api-data/DTO_CANONICAL_STANDARD.md` and `70-governance/SERVICE_TEMPLATE.md` mandate schema-derived DTOs, explicit service interfaces, and shared infrastructure. Despite the standards (lint rules, pre-commit hook), SDLC checkpoints did not explicitly require a compliance attestation.
- During earlier waves, manual DTO interfaces and ad-hoc service factories slipped back in, creating schema drift and inconsistent TypeScript contracts even though ADR-000 requires SRM alignment.

---

## Decision

1. **Architecture Phase Gate:** Phase 2 of the SDLC must include a DTO/service audit for every affected domain:
   - DTOs derive from `Database['public']['Tables'][…]` (Insert/Row) with `type` aliases.
   - Service factories export explicit interfaces (no `ReturnType<typeof createService>`), matching the service template structure.
   - Shared helpers (operation wrapper, ServiceResult, error map) are used instead of custom per-domain equivalents.

2. **Per-Slice Definition of Done:** A slice cannot exit implementation unless:
   - Supabase types were regenerated after migrations.
   - DTO lint/pre-commit checks pass.
   - Service files follow the template layout (dto.ts, selects.ts, crud.ts, index.ts…).
   - Compliance checkbox referencing this ADR is marked in the PR template.

3. **CI Hook (Future Work):** Establish a CI step that fails when manual `interface .*DTO` definitions exist under `services/**` or when service factories export implicit types.

---

## Rationale

- **Schema safety:** Canonical DTOs track schema changes automatically, preventing silent drift.
- **Consistency:** Explicit interfaces and layout reduce code review friction and onboarding cost.
- **Traceability:** by anchoring the gate to this ADR, SDLC documents and audits can confirm compliance quickly.

---

## Alternatives Considered

- **Reliance on lint hooks alone:** Already in place but insufficient; without an SDLC gate the repo regressed.
- **Central DTO package:** Adds indirection and duplicates Supabase types; unnecessary for MVP scope.

---

## References

- `25-api-data/DTO_CANONICAL_STANDARD.md`
- `70-governance/SERVICE_TEMPLATE.md`
- ADR-000 (Matrix as Schema Contract)
- ADR-008 (Service Layer Architecture)

# ADR-007: API Surface Catalogue & OpenAPI Contract

**Status:** Accepted  
**Date:** 2025-10-25  
**Owner:** Platform/API  
**Applies to:** All HTTP edges (`app/api/**` Route Handlers + Server Actions)  
**Decision type:** Process + Contract

---

## Context

- The Service Responsibility Matrix (ADR-000) and API Surface docs (`25-api-data/API_SURFACE_MVP.md`) define which bounded context exposes which endpoints, shapes, and invariants, but this information was not captured in an ADR.
- Consumers, QA, and tooling need a stable, versioned description of the HTTP contract, including transport rules, idempotency requirements, and the latest DTO definitions.
- We maintain a machine-readable OpenAPI document (`25-api-data/api-surface.openapi.yaml`) that mirrors the written catalogue, yet the relationship between the catalogue, OpenAPI, and SDLC gates was implicit.

---

## Decision

1. **Canonical Catalogue:** `25-api-data/API_SURFACE_MVP.md` is the human-readable source of truth for all MVP endpoints (paths, methods, DTOs, error codes, RBAC, rate limits, observability). Any route change must land in this file during the same PR as the code change.

2. **OpenAPI Parity:** `25-api-data/api-surface.openapi.yaml` must remain in lockstep with the catalogue. The OpenAPI file is the contract consumed by tooling (SDK generation, tests). PRs that touch either must update/export the other before merging.

3. **Roadmap & SDLC Gate:** The SDLC roadmap references this ADR; Phase 2 (Architecture & Security) must show an updated API catalogue/OpenAPI diff before slices begin, and Stabilization cannot sign off until both documents reflect shipping routes.

4. **Link to SRM:** Endpoint ownership, DTO shapes, and idempotency keys must align with the SRM (ADR-000). Any time the SRM adds/removes capabilities, this ADR requires a matching catalogue/OpenAPI update.

---

## Rationale

- **Single place to check:** Engineers no longer wonder whether the roadmap or code has the latest contract; the catalogue + OpenAPI pair (backed by this ADR) is definitive.
- **Tooling leverage:** OpenAPI drives client generation, mocks, and contract tests; keeping it synchronized prevents stale SDKs.
- **Auditability:** Explicit ADR reference ties the HTTP surface back to the SRM and Balanced Architecture decisions, making deviations detectable.

---

## Alternatives Considered

- **Code-only comments:** Relying on inline route docs was rejected; they drifted and were not consumable by other teams.
- **OpenAPI-only:** A YAML-only contract lacked the operational narrative (RBAC, rate limits, observability). We need both prose and schema.

---

## Implementation Notes

- Add a CI check (future work) to ensure catalogue + OpenAPI timestamps update together.
- When introducing `/api/v2/**`, either extend this ADR or add a follow-up ADR detailing versioning policy updates.

---

## References

- `25-api-data/API_SURFACE_MVP.md`
- `25-api-data/api-surface.openapi.yaml`
- `70-governance/SERVICE_TEMPLATE.md`
- ADR-000 (Matrix as Schema Contract)

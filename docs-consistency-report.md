# Documentation Consistency Audit Report

**Generated**: /home/diepulp/projects/pt-2
**Source**: docs

## Executive Summary

- **Files Analyzed**: 133
- **Contradictions Found**: 2
- **Redundancy Instances**: 1
- **Broken Links**: 133
- **Outdated References**: 0

## Contradictions

### C001: Conflicting guidance on service implementation (class vs functional)

**Category**: service_implementation
**Severity**: high

**Class Based**:
- `70-governance/CANONICAL_BLUEPRINT_MVP_PRD.md:184` -   - Prohibit runtime validation in service factory functions; move validation to development-only as...
- `70-governance/CANONICAL_BLUEPRINT_MVP_PRD.md:184` -   - Prohibit runtime validation in service factory functions; move validation to development-only as...
- `70-governance/CANONICAL_BLUEPRINT_MVP_PRD.md:184` -   - Prohibit runtime validation in service factory functions; move validation to development-only as...

**Functional**:
- `70-governance/CANONICAL_BLUEPRINT_MVP_PRD.md:184` -   - Prohibit runtime validation in service factory functions; move validation to development-only as...
- `70-governance/CANONICAL_BLUEPRINT_MVP_PRD.md:184` -   - Prohibit runtime validation in service factory functions; move validation to development-only as...
- `70-governance/CANONICAL_BLUEPRINT_MVP_PRD.md:184` -   - Prohibit runtime validation in service factory functions; move validation to development-only as...

### C002: Conflicting guidance on ReturnType usage

**Category**: type_inference
**Severity**: high

**Allowed**:
- `20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:1241` - - [ ] `npm test` passes
- [ ] ESLint no manual DTO interfaces
- [ ] No `ReturnType<>` in public APIs...
- `40-quality/QA-001-service-testing-strategy.md:75` - ## Execution Guardrails

- **Typed doubles only** — Unit tests must use typed `SupabaseClient<Databa...
- `40-quality/QA-003-service-testing-patterns.md:18` - 
**Principles**
- Use the exported service interface (e.g., `PlayerService`) instead of `ReturnType`...

**Banned**:
- `INDEX.md:184` - 
**Standards**:
- Functional factories (not classes)
- Explicit interfaces (ban `ReturnType<>`)
- DT...
- `INDEX.md:185` - **Standards**:
- Functional factories (not classes)
- Explicit interfaces (ban `ReturnType<>`)
- DTO...
- `20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md:505` - }

// ❌ ANTI-PATTERNS (BANNED)
// - export class PlayerService { ... }
// - export type PlayerServic...

## Broken Links

1. `INDEX.md:30`
   - Link text: `Balanced Architecture Quick`
   - Target: `patterns/BALANCED_ARCHITECTURE_QUICK.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`

2. `INDEX.md:220`
   - Link text: `Balanced Architecture`
   - Target: `patterns/BALANCED_ARCHITECTURE_QUICK.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`

3. `INDEX.md:230`
   - Link text: `COMPLETED.md`
   - Target: `phase-0/COMPLETED.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/phase-0/COMPLETED.md`

4. `INDEX.md:231`
   - Link text: `security-skeleton.md`
   - Target: `phase-1/security-skeleton.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/phase-1/security-skeleton.md`

5. `INDEX.md:232`
   - Link text: `SESSION_HANDOFF.md`
   - Target: `phase-2/SESSION_HANDOFF.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/phase-2/SESSION_HANDOFF.md`

6. `INDEX.md:249`
   - Link text: `Balanced Architecture Quick`
   - Target: `patterns/BALANCED_ARCHITECTURE_QUICK.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`

7. `INDEX.md:257`
   - Link text: `Balanced Architecture Quick`
   - Target: `patterns/BALANCED_ARCHITECTURE_QUICK.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`

8. `INDEX.md:260`
   - Link text: `Architecture Gaps`
   - Target: `roadmap/ARCHITECTURE_GAPS.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/roadmap/ARCHITECTURE_GAPS.md`

9. `INDEX.md:357`
   - Link text: `Balanced Architecture Quick`
   - Target: `patterns/BALANCED_ARCHITECTURE_QUICK.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`

10. `INDEX.md:362`
   - Link text: `Session Handoff`
   - Target: `phase-2/SESSION_HANDOFF.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/phase-2/SESSION_HANDOFF.md`

11. `20-architecture/BALANCED_ARCHITECTURE_QUICK.md:207`
   - Link text: `Balanced Architecture v1.0`
   - Target: `docs/archive/BALANCED_ARCHITECTURE_QUICK.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/20-architecture/docs/archive/BALANCED_ARCHITECTURE_QUICK.md`

12. `70-governance/CANONICAL_BLUEPRINT_MVP_PRD.md:192`
   - Link text: `20251006234000_migrate_ratingslip_id_to_uuid.sql`
   - Target: `../../supabase/migrations/20251006234000_migrate_ratingslip_id_to_uuid.sql`
   - Resolved to: `/home/diepulp/projects/pt-2/supabase/migrations/20251006234000_migrate_ratingslip_id_to_uuid.sql`

13. `80-adrs/ADR-001-dual-database-type-strategy.md:528`
   - Link text: `Schema Drift Audit Report`
   - Target: `../audits/SCHEMA_DRIFT_AUDIT.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/audits/SCHEMA_DRIFT_AUDIT.md`

14. `80-adrs/ADR-001-dual-database-type-strategy.md:530`
   - Link text: `DATABASE_WORKFLOW.md`
   - Target: `../phase-0/DATABASE_WORKFLOW.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/phase-0/DATABASE_WORKFLOW.md`

15. `80-adrs/ADR-001-dual-database-type-strategy.md:531`
   - Link text: `CANONICAL_BLUEPRINT_MVP_PRD.md`
   - Target: `../system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`

16. `80-adrs/ADR-002-test-location-standard.md:6`
   - Link text: `TEST_LOCATION_INCONSISTENCY.md`
   - Target: `./TEST_LOCATION_INCONSISTENCY.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/80-adrs/TEST_LOCATION_INCONSISTENCY.md`

17. `80-adrs/ADR-002-test-location-standard.md:197`
   - Link text: `TEST_LOCATION_INCONSISTENCY.md`
   - Target: `./TEST_LOCATION_INCONSISTENCY.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/80-adrs/TEST_LOCATION_INCONSISTENCY.md`

18. `80-adrs/ADR-002-test-location-standard.md:198`
   - Link text: `SERVICE_TEMPLATE_QUICK.md`
   - Target: `../patterns/SERVICE_TEMPLATE_QUICK.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/patterns/SERVICE_TEMPLATE_QUICK.md`

19. `80-adrs/ADR-005-integrity-enforcement.md:273`
   - Link text: `ADR-001: Service Layer Architecture`
   - Target: `./ADR-001-service-layer-architecture.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-001-service-layer-architecture.md`

20. `80-adrs/ADR-005-integrity-enforcement.md:274`
   - Link text: `ADR-002: Bounded Context Design`
   - Target: `./ADR-002-bounded-context-design.md`
   - Resolved to: `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-002-bounded-context-design.md`

## Redundancy

1. **File Similarity**: 89.2%
   - 20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
   - 20-architecture/SERVICE_RESPONSIBILITY_MATRIX_UPDATED.md

---

*End of Audit Report*

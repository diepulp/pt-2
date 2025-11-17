# SDLC Taxonomy Extension Audit

**Audit Date**: 2025-11-14
**Scope**: SRM modularization and SDLC taxonomy gaps
**Documents Analyzed**: SRM v3.1.0, CODEX_CROSS_DOCS_FINDINGS.md, SRM_COHESION_AUDIT, DOCUMENTATION_DRIFT_REPORT, INDEX.md
**Status**: PRELIMINARY

---

## Executive Summary

The SRM has evolved into a **monolithic 2000+ line document** mixing bounded context ownership, security policies, DTO contracts, audit requirements, event systems, temporal patterns, and operational concerns. The SDLC taxonomy needs **3 new top-level categories** and **5 enhanced sub-category structures** to properly modularize these concerns.

**Goal**: Transform SRM from a monolith into a lightweight **Bounded Context Registry** that references specialized documentation.

---

## 1. New Top-Level SDLC Categories

### **35-integration/** - Service Integration & Messaging

**Rationale**: Event systems, pub/sub patterns, and inter-service communication are currently scattered across SRM (vague statements), ADR-004 (partial), and OBSERVABILITY_SPEC.

**Owner**: Integration/Platform Team
**SDLC Phase**: Design → Evolve

**Documents to Create**:
- `INT-001-event-system-architecture.md` - Technology choice (Supabase Realtime/Postgres NOTIFY), retry policies, ordering guarantees
- `INT-002-event-catalog.md` - Canonical event contracts (extends REAL_TIME_EVENTS_MAP.md)
- `INT-003-channel-naming-standard.md` - Channel hierarchy, access control patterns
- `INT-004-event-consumer-patterns.md` - Subscription lifecycle, error handling, idempotency
- `INT-005-inter-service-communication.md` - RPC patterns, DTO boundaries, service discovery

**Content Extracted From**:
- SRM lines 1348, 1358, 1773 (vague "ingestion job" statements)
- ADR-004 real-time strategy (channel patterns)
- OBSERVABILITY_SPEC event-to-cache mappings

---

### **65-migrations/** - Schema Evolution & Version Management

**Rationale**: Critical "Current vs Target State" confusion in SRM. No systematic tracking of migration status, deprecation paths, or version alignment.

**Owner**: Architecture/DBA
**SDLC Phase**: Design → Evolve

**Documents to Create**:
- `MIG-001-migration-tracking-matrix.md` - Current vs Target state for each schema change
- `MIG-002-deprecation-policy.md` - Timeline for removing deprecated fields/tables
- `MIG-003-version-alignment-checklist.md` - Ensuring docs match deployed schema
- `MIG-004-migration-testing-standard.md` - Before/after validation, RLS verification
- `MIG-005-schema-review-process.md` - When to update SRM vs trigger migration

**Content Extracted From**:
- SRM lines 568-572 (TARGET STATE warnings)
- SRM lines 620-627 (RLS policies that assume future schema)
- Cross-doc findings: "Audit table vs canonical shape" gap
- Migration naming standard (already in 60-release, should reference this category)

---

### **85-compliance/** - Regulatory & Audit Frameworks

**Rationale**: MTL service, audit logging requirements, and regulatory compliance are first-class concerns for casino operations but lack dedicated documentation.

**Owner**: Compliance/Legal + Engineering
**SDLC Phase**: All Phases

**Documents to Create**:
- `COMP-001-regulatory-framework.md` - Gaming regulations, reporting requirements
- `COMP-002-mtl-compliance-standard.md` - Master Transaction Log specifics, retention policies
- `COMP-003-audit-retention-policy.md` - How long to keep audit_log, MTL entries
- `COMP-004-compliance-testing-checklist.md` - Regulatory acceptance criteria
- `COMP-005-data-privacy-requirements.md` - PII handling, GDPR/CCPA considerations

**Content Extracted From**:
- SRM MTL section (lines ~2000+)
- OBSERVABILITY_SPEC audit logging requirements
- Scattered PII/privacy references in current docs

---

## 2. Enhanced Existing Categories

### **20-architecture/** - Add Sub-Categories

#### **20-architecture/temporal-patterns/**

**Rationale**: Gaming day computation, temporal authority, and time-based domain logic are fundamental but undocumented.

**Documents to Create**:
- `TEMP-001-gaming-day-specification.md` - Canonical algorithm, timezone handling, `compute_gaming_day()` RPC contract
- `TEMP-002-temporal-authority-pattern.md` - Who owns time? How do services consume gaming_day?
- `TEMP-003-time-based-triggers.md` - Day rollover, batch processing, scheduling patterns

**Content Extracted From**:
- SRM line 897 (CasinoService temporal authority)
- SRM lines 1939-1941 (Finance gaming_day trigger)
- SRM line 2048 (MTL gaming_day calculation)
- SEC-002 casino temporal authority references

---

#### **20-architecture/patterns/**

**Documents to Create**:
- `ARCH-PAT-001-circular-fk-resolution.md` - Visit ↔ RatingSlip relationship explanation
- `ARCH-PAT-002-soft-delete-strategy.md` - When to use deleted_at vs hard deletes
- `ARCH-PAT-003-denormalization-policy.md` - When to duplicate data for performance

**Content Extracted From**:
- Cross-doc findings: "Circular FK" gap
- SRM various relationship patterns

---

### **25-api-data/** - Clarify DTO Structure

**New/Updated Documents**:
- `DTO_CATALOG.md` - **CREATE** (referenced by EDGE_TRANSPORT_POLICY but doesn't exist)
- `DTO_CANONICAL_STANDARD.md` - **UPDATE** with file naming convention (dtos.ts plural, not dto.ts)
- `API-DATA-001-dto-derivation-patterns.md` - Contract-First vs Canonical vs Hybrid (extract from SRM)

**Content Extracted From**:
- SRM lines 49-243 (DTO Contract Policy)
- DOCUMENTATION_DRIFT_REPORT (dto.ts vs dtos.ts inconsistency)

---

### **30-security/** - Extract RLS Patterns from SRM

**New Documents**:
- `SEC-004-rls-pattern-library.md` - Reusable RLS policy templates (extract from SRM lines 620-802)
- `SEC-005-role-taxonomy.md` - Complete staff_role enum + capability matrix (close SRM_COHESION_AUDIT §2.3 gap)
- `SEC-006-tenant-isolation-standard.md` - Casino-scoping patterns, SET LOCAL app.casino_id

**Content Extracted From**:
- SRM lines 568-802 (RLS policy examples)
- SRM lines 1621, 1661 (undefined role references)
- SECURITY_TENANCY_UPGRADE.md patterns

---

### **50-ops/** - Add Runbooks

#### **50-ops/runbooks/**

**Documents to Create**:
- `RUN-001-outbox-worker-playbook.md` - loyalty_outbox, finance_outbox draining procedures
- `RUN-002-realtime-incident-response.md` - Channel subscription failures, reconnection storms
- `RUN-003-schema-migration-runbook.md` - Pre-flight checks, rollback procedures
- `RUN-004-rls-policy-verification.md` - Testing tenant isolation in production
- `RUN-005-performance-degradation-response.md` - Query optimization, connection pool exhaustion

**Content Extracted From**:
- OBSERVABILITY_SPEC lines 359-422 (placeholder references)
- Cross-doc findings: "Outbox runbooks" gap
- Vision doc responsibilities table (outbox workers)

---

### **70-governance/** - Expand Pattern Library

#### **70-governance/patterns/domain-modeling/**

**Documents to Create**:
- `GOV-PAT-001-service-factory-pattern.md` - Functional factory standard (close SRM_COHESION_AUDIT §2.4 gap)
- `GOV-PAT-002-mapper-pattern.md` - When/how to use mappers.ts (close DOCUMENTATION_DRIFT CRITICAL-003)
- `GOV-PAT-003-dto-ownership-rules.md` - Table ownership → DTO ownership (extract from SRM)
- `GOV-PAT-004-bounded-context-communication.md` - DTO imports, service boundaries, anti-patterns

**Content Extracted From**:
- SRM lines 18, 871, 953 (service factory references)
- SRM lines 120-134 (mapper pattern for Contract-First DTOs)
- DOCUMENTATION_DRIFT_REPORT (missing mapper documentation)

---

#### **70-governance/patterns/error-handling/**

**Documents to Create**:
- `GOV-ERR-001-error-taxonomy.md` - Domain errors, HTTP mapping, PG error wrapping
- `GOV-ERR-002-error-response-standard.md` - Canonical error shape for API responses
- `GOV-ERR-003-error-logging-policy.md` - What to log, PII scrubbing, correlation IDs

**Content Extracted From**:
- Cross-doc findings: "Error taxonomy" mention
- EDGE_TRANSPORT_POLICY withTracing middleware
- Scattered error handling patterns

---

#### **70-governance/tooling/**

**Documents to Create**:
- `GOV-TOOL-001-ci-validation-scripts.md` - validate-srm-ownership.js, validate-dto-fields.js implementation
- `GOV-TOOL-002-pre-commit-hooks.md` - ESLint rules, type checking, DTO compliance gates
- `GOV-TOOL-003-schema-verification-test.md` - Automated SRM ↔ schema fidelity checks

**Content Extracted From**:
- DTO_CANONICAL_STANDARD lines 310-336 (TODO tags for CI scripts)
- Cross-doc findings: "CI validation scripts" gap

---

## 3. SRM Transformation Plan

### Phase 1: Extract to New Categories (Weeks 1-2)

**Move from SRM to new homes**:

| SRM Section | Lines | New Location | Document ID |
|-------------|-------|--------------|-------------|
| Event integration vagueness | 1348, 1358, 1773 | 35-integration/INT-001 | Event System Architecture |
| Gaming day temporal authority | 897, 1939, 2048 | 20-architecture/temporal-patterns/TEMP-001 | Gaming Day Specification |
| RLS policy examples | 620-802 | 30-security/SEC-004 | RLS Pattern Library |
| DTO Contract Policy | 49-243 | 25-api-data/ (split into multiple docs) | DTO patterns |
| Audit requirements | 1573-1574 | Already in 50-ops/OBSERVABILITY_SPEC | Reference only |
| MTL compliance details | 2000+ | 85-compliance/COMP-002 | MTL Compliance Standard |
| Current vs Target state warnings | 568-572, 620-627 | 65-migrations/MIG-001 | Migration Tracking Matrix |

---

### Phase 2: Update SRM to Reference-Only (Week 3)

**Transform SRM into lightweight Bounded Context Registry**:

```markdown
## Example: Loyalty Service (Post-Modularization)

### Tables Owned
- `player_loyalty` (canonical)
- `loyalty_ledger` (canonical)
- `loyalty_outbox` (operational)

### DTOs Exported
See: [25-api-data/loyalty-dtos.md](../25-api-data/loyalty-dtos.md)

### Security Model
See: [30-security/SEC-004-rls-pattern-library.md](../30-security/SEC-004-rls-pattern-library.md#loyalty-context)

### Event Contracts
See: [35-integration/INT-002-event-catalog.md](../35-integration/INT-002-event-catalog.md#loyalty-events)

### Operational Concerns
See: [50-ops/runbooks/RUN-001-outbox-worker-playbook.md](../50-ops/runbooks/RUN-001-outbox-worker-playbook.md#loyalty-outbox)

### Compliance Requirements
See: [85-compliance/COMP-002-mtl-compliance-standard.md](../85-compliance/COMP-002-mtl-compliance-standard.md#loyalty-ledger-retention)
```

**Result**: SRM reduces from 2000+ lines to ~800 lines (pure bounded context matrix + references)

---

### Phase 3: Update INDEX.md (Week 4)

Add new categories to docs/INDEX.md taxonomy table:

```markdown
| Category | Folder | Owner | Purpose | Phase |
|----------|--------|-------|---------|-------|
| Integration & Messaging | [35-integration/](35-integration/) | Platform | Events, pub/sub, inter-service | Design → Evolve |
| Migrations & Versioning | [65-migrations/](65-migrations/) | Architecture | Schema evolution, deprecation | Design → Evolve |
| Compliance & Audit | [85-compliance/](85-compliance/) | Compliance | Regulatory, MTL, retention | All phases |
```

---

## 4. Document Creation Checklist

**Total New Documents**: 36

| Category | New Docs | Status | Priority |
|----------|----------|--------|----------|
| 35-integration/ | 5 | 🔴 Critical (resolves SRM cohesion audit §2.1) | P0 |
| 65-migrations/ | 5 | 🔴 Critical (resolves current/target confusion) | P0 |
| 85-compliance/ | 5 | 🟡 High (regulatory requirement) | P1 |
| 20-architecture/temporal-patterns/ | 3 | 🔴 Critical (gaming day authority) | P0 |
| 20-architecture/patterns/ | 3 | 🟢 Medium | P2 |
| 25-api-data/ | 2 new + 1 update | 🔴 Critical (DTO_CATALOG missing) | P0 |
| 30-security/ | 3 | 🟡 High (RLS extraction) | P1 |
| 50-ops/runbooks/ | 5 | 🟡 High (operational gaps) | P1 |
| 70-governance/patterns/domain-modeling/ | 4 | 🔴 Critical (service factory, mapper patterns) | P0 |
| 70-governance/patterns/error-handling/ | 3 | 🟢 Medium | P2 |
| 70-governance/tooling/ | 3 | 🟡 High (CI automation) | P1 |

---

## 5. Success Metrics

**Post-Modularization**:
- ✅ SRM document length: 2000+ lines → ~800 lines
- ✅ Cross-references: Inline duplication → Canonical references
- ✅ Update effort: Modify 1 monolith → Update specific spec
- ✅ Onboarding: Read 2000-line doc → Navigate by concern
- ✅ Audit drift: Multi-doc contradictions → Single source of truth per concern

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Too many new categories overwhelms developers | Prioritize P0 documents first; update INDEX.md with clear navigation |
| Existing doc references break | Create MIGRATION_MAP.md showing old SRM line → new doc mapping |
| Regulatory review delays 85-compliance/ | Create placeholder structure with TODOs; compliance team can populate |
| Team doesn't know which doc to update | Update CLAUDE.md with decision tree: "security concern → 30-security/, event contract → 35-integration/" |

---

## 7. Gap Analysis Summary

### Gaps Closed by This Extension

**From CODEX_CROSS_DOCS_FINDINGS.md**:
- ✅ Audit table vs canonical shape → 65-migrations/MIG-001
- ✅ CI validation scripts → 70-governance/tooling/GOV-TOOL-001
- ✅ Outbox runbooks → 50-ops/runbooks/RUN-001
- ✅ Circular FK clarification → 20-architecture/patterns/ARCH-PAT-001
- ✅ DTO catalog → 25-api-data/DTO_CATALOG.md

**From SRM_COHESION_AUDIT**:
- ✅ Event integration mechanism undefined → 35-integration/INT-001
- ✅ Gaming day temporal authority unclear → 20-architecture/temporal-patterns/TEMP-001
- ✅ RLS role taxonomy not defined → 30-security/SEC-005
- ✅ Service factories pattern not defined → 70-governance/patterns/domain-modeling/GOV-PAT-001
- ✅ Current vs Target state confusion → 65-migrations/MIG-001

**From DOCUMENTATION_DRIFT_REPORT**:
- ✅ DTO file naming convention drift → 25-api-data/DTO_CANONICAL_STANDARD.md (update)
- ✅ DTO derivation strategy conflict → 25-api-data/API-DATA-001
- ✅ Missing mapper pattern documentation → 70-governance/patterns/domain-modeling/GOV-PAT-002

---

## Recommendation

**Approve 3 new top-level categories + 5 enhanced sub-category structures** to decompose the SRM monolith. Prioritize P0 documents (18 docs) in Sprint 1, P1 documents (13 docs) in Sprint 2, P2 documents (5 docs) in Sprint 3.

**Next Step**: Create folder structure + README.md files for new categories, then begin extracting SRM content per Phase 1 plan.

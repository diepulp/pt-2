# SDLC Documentation Taxonomy Inventory

**Date**: 2025-11-16
**Task**: Step 1 of SRM Modularization - Inventory existing taxonomy surface
**Purpose**: Catalog what exists vs. what is proposed to inform mapping and extraction decisions

---

## Executive Summary

This inventory catalogs the PT-2 SDLC documentation taxonomy established in October 2025, capturing current state vs. proposed extensions mentioned in recent audit work (35-integration, 65-migrations, 30-security/compliance).

### Key Findings

- **11 SDLC categories** defined with clear ownership
- **3 proposed categories** partially implemented: `35-integration`, `65-migrations`, `30-security/compliance`
- **72+ documents** currently organized across taxonomy
- **Strong foundation** for modularization with clear owners, ID prefixes, and purposes

---

## SDLC Taxonomy Categories

### Current State (Established)

| # | Category | Folder | ID Prefix | Owner | Status | Doc Count | Purpose |
|---|----------|--------|-----------|-------|--------|-----------|---------|
| 1 | **Vision & Scope** | `00-vision/` | `VIS-###` | Product | ✅ Established | 2 | Problem statement, goals, non-goals, success metrics |
| 2 | **Product Requirements** | `10-prd/` | `PRD-###` | Product | ✅ Established | 2+ | User stories, acceptance criteria, release goals |
| 3 | **Architecture** | `20-architecture/` | `ARCH-###` | Architecture | ✅ Established | 9 | SRM, diagrams, bounded contexts, NFRs |
| 4 | **API & Data** | `25-api-data/` | `API-###` | Backend | ✅ Established | 9 | OpenAPI, DTOs, schema, data contracts |
| 5 | **Security & RBAC** | `30-security/` | `SEC-###` | Security | ✅ Established | 5 | RLS policies, RBAC matrix, threat model, secrets |
| 6 | **Quality & Testing** | `40-quality/` | `QA-###` | QA Lead | ✅ Established | 4 | Test strategy, coverage goals, quality gates |
| 7 | **Operations** | `50-ops/` | `OPS-###` | SRE | ✅ Established | 2 | Observability, runbooks, SLOs, incident process |
| 8 | **Release** | `60-release/` | `REL-###` | Release Mgr | ✅ Established | 2 | Versioning, release notes, rollout/rollback |
| 9 | **Governance** | `70-governance/` | `GOV-###` | Eng Lead | ✅ Established | 10 | SDLC policy, coding standards, patterns |
| 10 | **ADRs** | `80-adrs/` | `ADR-###` | Various | ✅ Established | 12 | Architecture decision records |

**Total Established**: 10 categories, 57+ core documents

---

### Proposed/Emerging Categories

| # | Category | Folder | ID Prefix | Owner | Status | Doc Count | Purpose |
|---|----------|--------|-----------|-------|--------|-----------|---------|
| 11 | **Integration** | `35-integration/` | `INT-###` | Backend/Arch | 🟡 Partial | 1 | Event catalogs, service contracts, integration patterns |
| 12 | **Migrations** | `65-migrations/` | `MIG-###` | Backend/DBA | 🟡 Partial | 1 | Migration tracking, database evolution, schema changes |

**Notes**:
- `35-integration/` folder exists with 1 document: `INT-002-event-catalog.md`
- `65-migrations/` folder exists with 1 document: `MIG-001-migration-tracking-matrix.md`
- Both mentioned in `SRM_MODULARIZATION_PRACTICAL_STEPS.md` as "minimal missing anchors"
- `30-security/` compliance subdirectory proposed but not yet created

---

## Document Inventory by Category

### 00-vision/ (Vision & Scope)

**Owner**: Product | **Status**: ✅ Established

| Document | ID | Status | Created | Purpose |
|----------|----|----|---------|---------|
| `README.md` | - | Meta | - | Category definition |
| `VIS-001-VISION-AND-SCOPE.md` | VIS-001 | Active | - | Problem/solution vision |

**Notes**: Minimal but sufficient for MVP phase

---

### 10-prd/ (Product Requirements)

**Owner**: Product | **Status**: ✅ Established

| Document | ID | Status | Location Note |
|----------|----|----|----------|
| `README.md` | - | Meta | Category definition |
| `PRD-001_Player_Management_System_Requirements.md` | PRD-001 | Active | Specific feature PRD |

**Notes**:
- INDEX.md references additional PRDs in legacy `system-prd/` folder
- May need consolidation pass

---

### 20-architecture/ (Architecture & System Patterns)

**Owner**: Architecture | **Status**: ✅ Established | **Critical**: 🔥

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `README.md` | - | Meta | Category definition with SRM/Edge/CQRS summary |
| `SERVICE_RESPONSIBILITY_MATRIX.md` | ARCH-001 | 🔥 Canonical | Bounded context contract (SRM v3.0.2) |
| `SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | ARCH-002 | Active | Visual architecture + anti-patterns |
| `BALANCED_ARCHITECTURE_QUICK.md` | ARCH-003 | Active | Horizontal vs Vertical decision framework |
| `EDGE_TRANSPORT_POLICY.md` | ARCH-004 | Active | Server Action vs Route Handler contract |
| `SRM_Addendum_TableContext_PostMVP.md` | ARCH-005 | Post-MVP | TableContext bounded context extension |
| `SRM_MAPPING_TABLE.md` | - | 🟡 Draft | Created; initial SRM → taxonomy mapping table |
| `SRM_BACKUP_NOV_16.md` | - | Archive | Backup snapshot |
| `CODEX_CROSS_DOCS_FINDINGS.md` | - | Audit | Cross-doc analysis findings |

**Notes**:
- SRM is the canonical contract, referenced by 50+ docs
- `SRM_MAPPING_TABLE.md` mentioned in git status but not yet created
- SRM modularization is the focus of current work

---

### 25-api-data/ (API & Data Contracts)

**Owner**: Backend | **Status**: ✅ Established

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `README.md` | - | Meta | Category definition |
| `API_SURFACE_MVP.md` | API-001 | Active | Canonical endpoint catalog |
| `API_SURFACE_MVP_from_SRM.md` | - | Derived | SRM-extracted version |
| `DTO_CANONICAL_STANDARD.md` | API-002 | Standard | DTO derivation rules |
| `REAL_TIME_EVENTS_MAP.md` | API-003 | Active | Supabase real-time contracts |
| `DTO_CATALOG.md` | API-004 | 🟡 New | **RECENTLY CREATED** - comprehensive DTO reference |
| `OPENAPI_QUICKSTART.md` | - | Guide | OpenAPI usage guide |
| `OPENAPI_USAGE.md` | - | Guide | OpenAPI patterns |
| `api-catalogue-task.md` | - | Task | Task tracking doc |

**Notes**:
- `DTO_CATALOG.md` recently created as target for SRM extraction
- OpenAPI specs mentioned but not yet in folder (`.yaml` files)

---

### 30-security/ (Security & RBAC)

**Owner**: Security | **Status**: ✅ Established | **Recent Updates**: 🔥

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `README.md` | - | Meta | Category definition |
| `SEC-001-rls-policy-matrix.md` | SEC-001 | Active | Row-Level Security policies |
| `SEC-002-casino-scoped-security-model.md` | SEC-002 | Active | Casino tenancy model |
| `SEC-003-rbac-matrix.md` | SEC-003 | Active | Role-based access control |
| `SEC-005-role-taxonomy.md` | SEC-005 | 🟡 New | **RECENTLY CREATED** - role definitions |
| `SECURITY_TENANCY_UPGRADE.md` | - | Analysis | Security model evolution |

**Notes**:
- `SEC-005` mentioned in modularization steps as "minimal missing anchor"
- Compliance subdirectory proposed but not yet created
- Recent audit work: `SEC-001_UPDATE_SUMMARY_2025-11-13.md`

---

### 35-integration/ (Integration Patterns)

**Owner**: Backend/Architecture | **Status**: 🟡 Partial | **Proposed**: ✅

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `INT-002-event-catalog.md` | INT-002 | 🟡 New | Event-driven integration catalog |

**Notes**:
- **Proposed category** - folder exists but minimal content
- Mentioned in `SRM_MODULARIZATION_PRACTICAL_STEPS.md` as target for extraction
- No README.md yet
- Intended for: event catalogs, service contracts, integration patterns

---

### 40-quality/ (Quality & Testing)

**Owner**: QA Lead | **Status**: ✅ Established

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `README.md` | - | Meta | Category definition |
| `QA-001-service-testing-strategy.md` | QA-001 | Active | Service layer test approach |
| `QA-002-quality-gates.md` | QA-002 | Active | CI/CD gates and criteria |
| `QA-003-service-testing-patterns.md` | QA-003 | Active | Test patterns and examples |

**Notes**: Well-established with clear test standards

---

### 50-ops/ (Operations & Reliability)

**Owner**: SRE | **Status**: ✅ Established (minimal)

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `README.md` | - | Meta | Category definition |
| `OBSERVABILITY_SPEC.md` | OPS-001 | Active | Telemetry and monitoring patterns |

**Notes**:
- Minimal but sufficient for current phase
- Runbooks, SLOs to be added as needed

---

### 60-release/ (Change & Release)

**Owner**: Release Manager | **Status**: ✅ Established

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `README.md` | - | Meta | Category definition |
| `MIGRATION_NAMING_STANDARD.md` | REL-001 | Standard | `YYYYMMDDHHMMSS_description.sql` format |

**Notes**:
- Migration naming is critical standard
- Release process docs to be added

---

### 65-migrations/ (Database Migrations)

**Owner**: Backend/DBA | **Status**: 🟡 Partial | **Proposed**: ✅

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `MIG-001-migration-tracking-matrix.md` | MIG-001 | 🟡 New | Migration history and tracking |

**Notes**:
- **Proposed category** - folder exists with 1 document
- Mentioned in `SRM_MODULARIZATION_PRACTICAL_STEPS.md` as target for extraction
- No README.md yet
- Intended for: migration tracking, schema evolution, database change management

---

### 70-governance/ (Governance & Process)

**Owner**: Engineering Lead | **Status**: ✅ Established | **Rich**: 🔥

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `README.md` | - | Meta | Category definition |
| `SERVICE_TEMPLATE.md` | GOV-001 | Standard | Service implementation template |
| `OVER_ENGINEERING_GUARDRAIL.md` | GOV-002 | Standard | Complexity management rules |
| `HOOKS_STANDARD.md` | GOV-003 | Standard | React Query v5 patterns |
| `FRONT_END_CANONICAL_STANDARD.md` | GOV-005 | Standard | UI component patterns |
| `SERVER_ACTIONS_ARCHITECTURE.md` | GOV-006 | Standard | Server action patterns v1.2 |
| `AI_NATIVE_WORKFLOW.md` | - | Guide | AI-assisted development patterns |
| `ANTI_PATTERN_CATALOG.md` | - | Reference | What NOT to do |
| `ERROR_TAXONOMY_AND_RESILIENCE.md` | - | Standard | Error handling patterns |
| `UX_DATA_FETCHING_PATTERNS.md` | - | Standard | Data loading UX patterns |

**Notes**:
- Rich category with 10 documents
- Core reference for daily development work

---

### 80-adrs/ (Architecture Decision Records)

**Owner**: Various | **Status**: ✅ Established

| Document | ID | Status | Purpose |
|----------|----|----|---------|
| `README.md` | - | Meta | Category definition |
| `ADR-000-matrix-as-contract.md` | ADR-000 | Foundational | SRM as canonical contract |
| `ADR-001-dual-database-type-strategy.md` | ADR-001 | Active | Type system approach |
| `ADR-002-test-location-standard.md` | ADR-002 | Active | Test file organization |
| `ADR-003-state-management-strategy.md` | ADR-003 | Active | React Query approach |
| `ADR-004-real-time-strategy.md` | ADR-004 | Active | Supabase real-time patterns |
| `ADR-005-integrity-enforcement.md` | ADR-005 | Active | Data integrity approach |
| `ADR-006-rating-slip-field-removal.md` | ADR-006 | Superseded | Legacy field cleanup |
| `ADR-007-api-surface-catalogue.md` | ADR-007 | Active | API documentation approach |
| `ADR-008-service-layer-architecture.md` | ADR-008 | Active | Service layer design |
| `ADR-009-balanced-architecture-intake.md` | ADR-009 | Active | Horizontal vs Vertical framework |
| `ADR-010-dto-compliance-gate.md` | ADR-010 | Active | DTO derivation enforcement |
| `ADR-011-over-engineering-guardrail.md` | ADR-011 | Active | Complexity prevention |

**Notes**:
- 12 ADRs document key architectural decisions
- `ADR-000` establishes SRM as contract foundation

---

## Supporting Folders (Outside Taxonomy)

| Folder | Purpose | Status |
|--------|---------|--------|
| `agentic-workflow/` | AI-assisted development guides | Active |
| `architecture/` | Legacy/pre-taxonomy architecture docs | Archive |
| `archive/` | Superseded documents | Archive |
| `audits/` | Documentation audit reports | Active |
| `integrity/` | Data integrity framework | Active |
| `patterns/` | Legacy patterns (being migrated) | 🔄 Transitioning |
| `workflows/` | Development workflow guides | Active |
| `srn-modularization/` | **THIS FOLDER** - SRM modularization work | 🆕 New |

**Notes**:
- `patterns/` folder still contains some canonical docs referenced by INDEX.md
- Migration from `patterns/` to taxonomy folders ongoing

---

## Owner/Intent Summary

### From INDEX.md (Quick Navigation Table)

| Category | Owner | Intent (SDLC Phases) |
|----------|-------|---------------------|
| Vision & Scope | Product | Inception, Discovery |
| Product Requirements | Product | All phases |
| Architecture | Architecture | Design, Build, Operate |
| API & Data | Backend | Design → Evolve |
| Security & RBAC | Security | Design → Evolve |
| Quality & Testing | QA | Discovery → Evolve |
| Operations | SRE | Design → Evolve |
| Release | Release Mgr | Design → Evolve |
| Governance | Eng Lead | All phases |
| ADRs | Various | All phases |

### From README.md Files

Each category README specifies:
- **ID Prefix** (e.g., `VIS-###`, `ARCH-###`)
- **Owner** (role responsible)
- **Phase** (SDLC applicability)
- **Purpose** (1-2 sentence intent)
- **What Belongs Here** (content types)
- **Document Format** (YAML front matter template)
- **Current Documents** (catalog)
- **Related Categories** (cross-references)

**Quality**: README files provide clear, actionable guidance for contributors

---

## Proposed vs. Existing: Gap Analysis

### ✅ Fully Established (10 categories)

All 10 core SDLC categories have:
- Defined folder structure
- README with owner/purpose
- ID prefix convention
- Multiple documents
- Referenced in INDEX.md

### 🟡 Partially Implemented (2 categories)

| Category | Folder | Status | Gaps |
|----------|--------|--------|------|
| **Integration** | `35-integration/` | 🟡 Partial | Missing README, minimal docs |
| **Migrations** | `65-migrations/` | 🟡 Partial | Missing README, minimal docs |

**Next Steps** (per `SRM_MODULARIZATION_PRACTICAL_STEPS.md`):
1. Add README.md to both folders
2. Extract relevant content from SRM
3. Build out document structure

### ❌ Proposed But Not Created

| Proposed | Parent | Status | Notes |
|----------|--------|--------|-------|
| **Compliance** subdirectory | `30-security/` | ❌ Not created | AML/CTR regulations |

---

## Recent Audit Work (Context)

### Relevant Audit Documents (docs/audits/)

| Document | Date | Focus |
|----------|------|-------|
| `SRM_MODULARIZATION_PRACTICAL_STEPS.md` | 2025-11-16 | **THIS TASK** - defines 4-step plan |
| `MULTI_AGENT_SRM_TAXONOMY_CONSENSUS_2025-11-14.md` | 2025-11-14 | Multi-agent taxonomy analysis |
| `AGENT5_GOVERNANCE_PATTERNS_ANALYSIS_2025-11-14.md` | 2025-11-14 | Governance pattern review |
| `SDLC_TAXONOMY_EXTENSION_AUDIT_2025-11-14.md` | 2025-11-14 | **Proposed `35-integration/`, `65-migrations/`** |
| `SRM_SCHEMA_FIDELITY_AUDIT_2025-11-14.md` | 2025-11-14 | SRM schema validation |
| `SEC-001_UPDATE_SUMMARY_2025-11-13.md` | 2025-11-13 | Security doc updates |
| `SRM_COHESION_AUDIT_2025-11-13.md` | 2025-11-13 | SRM structure analysis |
| `SRM_DRIFT_VERIFICATION_2025-11-13.md` | 2025-11-13 | SRM vs implementation drift |
| `SRM_SEC_RLS_DRIFT_RESOLUTION_2025-11-13.md` | 2025-11-13 | Security policy alignment |
| `DOCUMENTATION_DRIFT_REPORT_2025-11-13.md` | 2025-11-13 | Cross-doc consistency check |

**Key Finding**: Strong audit trail shows active documentation governance

---

## Recommendations for Next Steps

### 1. Complete Partial Categories

**Priority**: HIGH

- [ ] Add `README.md` to `35-integration/`
- [ ] Add `README.md` to `65-migrations/`
- [ ] Define ID prefix conventions for both
- [ ] Document owner and purpose

### 2. Create SRM Mapping Table

**Priority**: CRITICAL (Step 2 of modularization)

- [ ] Create `docs/20-architecture/SRM_MAPPING_TABLE.md`
- [ ] Map each SRM section to target taxonomy document
- [ ] Capture exists/missing status
- [ ] Assign priorities and owners

### 3. Build Target Documents

**Priority**: HIGH (Step 2 continues)

Ensure these exist as extraction targets:
- [x] `docs/25-api-data/DTO_CATALOG.md` ✅ Created
- [x] `docs/65-migrations/MIG-001-migration-tracking-matrix.md` ✅ Created
- [x] `docs/35-integration/INT-002-event-catalog.md` ✅ Created
- [x] `docs/30-security/SEC-005-role-taxonomy.md` ✅ Created

### 4. Update INDEX.md

**Priority**: MEDIUM

- [ ] Add `35-integration/` to taxonomy table
- [ ] Add `65-migrations/` to taxonomy table
- [ ] Update document counts
- [ ] Refresh "Where to Find" cheatsheet

### 5. Enable CI Checks

**Priority**: MEDIUM (Step 4 of modularization)

- [x] Add link validation check ✅ **COMPLETED 2025-11-17**
- [x] Fail on broken SRM→taxonomy references ✅ **COMPLETED 2025-11-17**
- [x] Add to GitHub Actions workflow ✅ **COMPLETED 2025-11-17**

**Implementation Details**:
- Script: `scripts/check-srm-links.ts` (TypeScript, tsx runner)
- NPM commands: `check:srm-links`, `check:srm-links:verbose`
- GitHub Actions: `.github/workflows/check-srm-links.yml`
- Current status: 18 references checked, 0 broken links

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **Established SDLC Categories** | 10 |
| **Partial/Proposed Categories** | 2 |
| **Total Documents (estimated)** | 72+ |
| **Categories with README** | 10/12 (83%) |
| **Categories with 5+ docs** | 4 (Architecture, API/Data, Governance, ADRs) |
| **Supporting Folders** | 8 |
| **Recent Audit Reports** | 10 (Nov 13-16) |
| **SRM Document References** | 18 (all valid) |
| **Automated Link Checks** | ✅ Active (CI/CD) |

---

## Conclusion

The PT-2 SDLC documentation taxonomy is **well-established** with clear ownership, consistent structure, and active governance. The proposed extensions (`35-integration/`, `65-migrations/`) are partially implemented and ready for completion as part of the SRM modularization effort.

**Next Task**: Create SRM Mapping Table to guide extraction and modularization.

---

## Tooling & Automation

### Link Validation (Added 2025-11-17)

**Purpose**: Ensure all SRM document references resolve to existing files

**Implementation**:
- **Script**: `scripts/check-srm-links.ts`
  - Language: TypeScript
  - Runner: tsx (installed as devDependency)
  - Patterns detected: YAML front matter, backtick paths, markdown links
  - Exit codes: 0 (success), 1 (broken links or error)

**Usage**:
```bash
# Quick check (shows summary only)
npm run check:srm-links

# Verbose output (shows all references)
npm run check:srm-links:verbose

# CI integration (automatic)
# Runs on: push to main/develop, PRs modifying docs
```

**Current Status** (2025-11-17):
- Total references checked: 18
- Valid references: 18
- Broken references: 0
- CI workflow: `.github/workflows/check-srm-links.yml` (active)

**Features**:
- Detects three reference patterns:
  - YAML front matter: `- docs/path/to/file.md`
  - Inline backticks: `` `docs/path/to/file.md` ``
  - Markdown links: `[text](docs/path/to/file.md)`
- Strips anchor fragments and query strings
- Reports line numbers for easy navigation
- Color-coded console output
- Integrates with existing CI pipeline

---

**Inventory Complete** ✅
**Created**: 2025-11-16
**Updated**: 2025-11-17 (added tooling section)
**Author**: Claude Code
**Location**: `docs/srn-modularization/SDLC_TAXONOMY_INVENTORY.md`

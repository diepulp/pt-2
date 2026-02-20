# PT-2 Documentation Index

**Last Updated**: 2026-02-19
**Taxonomy Version**: 1.4 (ADR-035 Client State Lifecycle, ADR-032 Error Boundaries, ADR-031 Financial Convention, ADR-030 Auth Hardening)
**Architecture Strategy**: Hybrid Model (HORIZONTAL + VERTICAL)
**Reference**: [SDLC_TAXONOMY_INVENTORY.md](srn-modularization/SDLC_TAXONOMY_INVENTORY.md)
**SRM Status**: v4.14.0 (ADR-035 Client State Lifecycle)
**Purpose**: Navigation hub and document registry for PT-2 architecture documentation

---

## 🚀 Quick Navigation (SDLC Taxonomy)

| Category | Folder | Owner | Purpose | Phase | Status |
|----------|--------|-------|---------|-------|--------|
| Vision & Scope | [00-vision/](00-vision/) | Product | Problem, goals, non-goals | Inception, Discovery | ✅ Established |
| Product Requirements | [10-prd/](10-prd/) | Product | User stories, acceptance criteria | All phases | ✅ Established |
| Architecture | [20-architecture/](20-architecture/) | Architecture | SRM, diagrams, NFRs | Design, Build, Operate | ✅ Established |
| API & Data | [25-api-data/](25-api-data/) | Backend | OpenAPI, DTOs, schema | Design → Evolve | ✅ Established |
| Security & RBAC | [30-security/](30-security/) | Security | RLS, RBAC, threat model | Design → Evolve | ✅ Established |
| **Integration** | [35-integration/](35-integration/) | Backend/Arch | Event catalogs, service contracts | Design → Evolve | 🟡 Emerging |
| Quality & Testing | [40-quality/](40-quality/) | QA | Test strategy, coverage | Discovery → Evolve | ✅ Established |
| Operations | [50-ops/](50-ops/) | SRE | Observability, runbooks, SLOs | Design → Evolve | ✅ Established |
| Release | [60-release/](60-release/) | Release Mgr | Release notes, rollout | Design → Evolve | ✅ Established |
| **Migrations** | [65-migrations/](65-migrations/) | Backend/DBA | Migration tracking, schema evolution | Design → Evolve | 🟡 Emerging |
| Governance | [70-governance/](70-governance/) | Eng Lead | Standards, patterns | All phases | ✅ Established |
| ADRs | [80-adrs/](80-adrs/) | Various | Decision records | All phases | ✅ Established |

---

## 📚 Quick Start by Role

### For Developers
1. **[Balanced Architecture Quick](20-architecture/BALANCED_ARCHITECTURE_QUICK.md)** ⭐ HORIZONTAL vs VERTICAL decision (10-min)
2. **[SLAD §308-350](20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)** - Service structure requirements
3. **[Hooks Standard](70-governance/HOOKS_STANDARD.md)** - React Query v5 patterns
4. **[Database Type Workflow](workflows/DATABASE_TYPE_WORKFLOW.md)** - Daily DB management

### For Architects
1. **[Service Responsibility Matrix](20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)** → SRM (compressed) - Canonical bounded contexts registry
2. **[DTO Catalog](25-api-data/DTO_CATALOG.md)** → Complete DTO specifications with field-level detail
3. **[Service Layer Architecture Diagram](20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)** → Architecture patterns + anti-patterns
4. **[API Surface MVP](25-api-data/API_SURFACE_MVP.md)** - Endpoint catalogue
5. **[ADRs](80-adrs/)** → Decision history and rationale

### For Product Managers
1. **[Vision and Scope](00-vision/VIS-001-VISION-AND-SCOPE.md)** - Project vision and goals
2. **[Product Requirements](10-prd/PRD-001_Player_Management_System_Requirements.md)** - Complete spec
3. **[Release Plans](60-release/)** → Phased delivery strategy

---

## 🗂️ Document Registry (By Category)

### 00-vision/ - Vision & Scope

| ID | Title | Status | Location |
|----|-------|--------|----------|
| VIS-001 | Vision and Scope | Active | `00-vision/VIS-001-VISION-AND-SCOPE.md` |

**Purpose**: Problem statement, goals, non-goals, success metrics

---

### 10-prd/ - Product Requirements

| ID | Title | Status | Location |
|----|-------|--------|----------|
| PRD-001 | Player Management System Requirements | Active | `10-prd/PRD-001_Player_Management_System_Requirements.md` |
| PRD-011 | Route Handler Test Coverage Initiative | Draft | `10-prd/PRD-011-route-handler-test-coverage.md` |
| PRD-022 | Player 360 Navigation Consolidation | Draft | `10-prd/PRD-022-player-360-navigation-consolidation.md` |
| PRD-023 | Player 360 Panels v0 | Draft | `10-prd/PRD-023-player-360-panels-v0.md` |
| PRD-024 | Landing Page Overhaul + Start Gateway | Draft | `10-prd/PRD-024-landing-page-start-gateway-v0.md` |
| PRD-025 | Onboarding v0.1: Tenant Bootstrap & Invites | Proposed | `10-prd/PRD-025-onboarding-bootstrap-invites-v0.md` |
| PRD-026 | Shift Dashboard v3: Three-Panel Layout | Draft | `10-prd/PRD-026-shift-dashboard-three-panel-layout-v0.md` |

**Purpose**: User stories, acceptance criteria, release goals

**Key Sections**:
- PRD §3.3: Service Layer Standards
- PRD §4: Anti-Pattern Guardrails
- PRD §3.10: Testing & CI/CD

---

### 20-architecture/ - Architecture & System Patterns

| ID | Title | Status | Location |
|----|-------|--------|----------|
| ARCH-001 | Service Responsibility Matrix (compressed) | Active | `20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| ARCH-002 | Service Layer Architecture Diagram v3.3.0 | Accepted | `20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| ARCH-003 | SRM Mapping Table | Active | `20-architecture/SRM_MAPPING_TABLE.md` |
| ARCH-004 | Balanced Architecture Quick Reference | Active | `20-architecture/BALANCED_ARCHITECTURE_QUICK.md` |
| TEMP-001 | Gaming Day Specification | Active (v1.1) | `20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md` |
| TEMP-002 | Temporal Authority Pattern | Active (v1.1) | `20-architecture/temporal-patterns/TEMP-002-temporal-authority-pattern.md` |
| TEMP-003 | Temporal Governance Enforcement | Active (v1.0) | `20-architecture/temporal-patterns/TEMP-003-temporal-governance-enforcement.md` |
| TEMP-IDX | Temporal Patterns Registry | Active | `20-architecture/temporal-patterns/INDEX.md` |

**Purpose**: Bounded contexts, system diagrams, integration contracts, NFRs

**Key Documents**:
- **SRM** (1,848 lines): Canonical bounded context registry - compressed for maintainability
- **SRM Mapping Table**: Links SRM sections to detailed taxonomy documents
- **Service Layer Diagram**: Visual patterns + anti-patterns with mermaid
- **Temporal Patterns**: Gaming day authority, edge case handling, and [governance enforcement registry](20-architecture/temporal-patterns/INDEX.md)

**Recent Changes** (2025-11-17):
- ✅ SRM compressed by 13% (279 lines saved)
- ✅ Detailed specs moved to taxonomy docs (DTO_CATALOG, INT-002, etc.)
- ✅ Link validation automated via CI

---

### 25-api-data/ - API & Data Contracts

| ID | Title | Status | Location |
|----|-------|--------|----------|
| API-001 | DTO Catalog | Active | `25-api-data/DTO_CATALOG.md` |
| API-002 | DTO Canonical Standard | Accepted | `25-api-data/DTO_CANONICAL_STANDARD.md` |
| API-003 | API Surface MVP | Accepted | `25-api-data/API_SURFACE_MVP.md` |
| API-004 | Real-time Events Map | Accepted | `25-api-data/REAL_TIME_EVENTS_MAP.md` |
| API-005 | OpenAPI Specification | Draft | `25-api-data/api-surface.openapi.yaml` |

**Purpose**: REST API contracts, DTOs, database schema, event contracts

**Key Documents**:
- **DTO Catalog** (771 lines): Complete DTO specifications with field-level detail, consumers, exposure policies
- **DTO Canonical Standard**: Derivation patterns, ESLint rules, CI enforcement
- **API Surface**: REST endpoint catalog with auth/validation requirements

**Standards**:
- DTOs derived from `Database` types using Pick/Omit/Partial
- Cross-context consumption through published DTOs only
- OpenAPI specs for all `/api/v1/**` endpoints
- Real-time event contracts for Supabase channels

---

### 30-security/ - Security & RBAC

| ID | Title | Status | Location |
|----|-------|--------|----------|
| SEC-001 | RLS Policy Matrix v1.3 | Active | `30-security/SEC-001-rls-policy-matrix.md` |
| SEC-005 | Role Taxonomy | Active | `30-security/SEC-005-role-taxonomy.md` |
| SEC-006 | RLS Strategy Audit | Complete | `30-security/SEC-006-rls-strategy-audit-2025-12-11.md` |
| COMP-002 | MTL Compliance Standard | Active | `30-security/compliance/COMP-002-mtl-compliance-standard.md` |

**Purpose**: RLS policies, RBAC matrix, threat model, secrets handling, compliance

**Key Documents**:
- **SEC-001**: RLS policy catalog per table with predicate patterns (Templates 1-6)
- **SEC-005**: Role capabilities matrix (admin, pit_boss, cashier, compliance, dealer)
- **SEC-006**: RLS audit findings (FloorLayoutService, SECURITY DEFINER hardening)
- **COMP-002**: MTL/AML compliance thresholds, retention, audit requirements

**Security Model**:
- Casino-scoped tenancy with RLS (ADR-015 Pattern C hybrid)
- SECURITY DEFINER governance (ADR-018 Template 5)
- No service keys in runtime (anon key + user context)
- WRAPPER pattern for context injection

---

### 35-integration/ - Integration & Events 🟡 EMERGING

| ID | Title | Status | Location |
|----|-------|--------|----------|
| INT-002 | Event Catalog | Active | `35-integration/INT-002-event-catalog.md` |

**Purpose**: Event catalogs, service contracts, integration patterns, channel naming

**Key Documents**:
- **INT-002**: Domain event catalog with producers, consumers, payloads, channel scopes

**Integration Patterns**:
- Event payloads mirror SRM table FKs and types
- Channel naming: `{casino_id}` for collections, `{casino_id}:{resource_id}` for details
- Realtime listeners reconcile via `invalidateByDomainEvent()`

**Status**: Emerging category - created as part of SRM modularization (2025-11-17)

---

### 40-quality/ - Quality & Testing

| ID | Title | Status | Location |
|----|-------|--------|----------|
| QA-001 | Service & Layered Testing Strategy | Draft | `40-quality/QA-001-service-testing-strategy.md` |
| QA-002 | CI/CD Quality Gates | Draft | `40-quality/QA-002-quality-gates.md` |
| QA-003 | Service Testing Patterns & Examples | Draft | `40-quality/QA-003-service-testing-patterns.md` |
| QA-004 | Test-Driven Development (TDD) Standard | Draft | `40-quality/QA-004-tdd-standard.md` |
| QA-005 | Route Handler Testing Patterns | Active | `40-quality/QA-005-route-handler-testing.md` |

**Purpose**: Test strategy, coverage goals, quality gates, performance budgets, TDD workflows

**Testing Standards**:
- TDD workflow: Red-Green-Refactor cycle with typed doubles
- Unit tests: Typed test doubles, 90% coverage for services
- Integration tests: Local Supabase with RLS enabled, 85% coverage for workflows
- E2E tests: Cypress for critical flows (10% of tests)

---

### 50-ops/ - Operations & Reliability

| ID | Title | Status | Location |
|----|-------|--------|----------|
| RUN-001 | Outbox Worker Playbook | Active | `50-ops/runbooks/RUN-001-outbox-worker-playbook.md` |
| RUN-002 | Schema Reload | Active | `50-ops/runbooks/RUN-002-schema-reload.md` |
| RUN-003 | Schema Migration Runbook | Active | `50-ops/runbooks/RUN-003-schema-migration-runbook.md` |
| RUN-004 | RLS Policy Verification | Active | `50-ops/runbooks/RUN-004-rls-policy-verification.md` |
| RUN-005 | Type Sync | Active | `50-ops/runbooks/RUN-005-type-sync.md` |

**Purpose**: Observability, runbooks, SLIs/SLOs, incident process

**Key Runbooks**:
- **RUN-001**: Outbox worker operations and troubleshooting
- **RUN-003**: Schema migration workflow (critical: `npm run db:types`)
- **RUN-004**: RLS policy verification and testing

**Patterns**:
- Audit logging (embedded in SERVER_ACTIONS_ARCHITECTURE.md)
- Error mapping (PG → domain codes)
- Outbox pattern for reliability

---

### 60-release/ - Change & Release

| ID | Title | Status | Location |
|----|-------|--------|----------|
| REL-001 | Migration Naming Standard | Accepted | `60-release/MIGRATION_NAMING_STANDARD.md` |

**Purpose**: Versioning, release notes, rollout/rollback, deprecation

**Standards**:
- Migration format: `YYYYMMDDHHMMSS_description.sql`
- Deprecation policy embedded in SRM
- Release phases in SDLC roadmap

---

### 65-migrations/ - Database Migrations 🟡 EMERGING

| ID | Title | Status | Location |
|----|-------|--------|----------|
| MIG-001 | Migration Tracking Matrix | Active | `65-migrations/MIG-001-migration-tracking-matrix.md` |

**Purpose**: Migration tracking, database evolution, schema changes, deprecation/EOL

**Key Documents**:
- **MIG-001**: Current vs target schema state per table, migration IDs, RLS deployment status, deprecation timelines

**Migration Standards**:
- File naming: `YYYYMMDDHHMMSS_description.sql`
- Critical workflow: (1) Update SRM, (2) Run migration, (3) **`npm run db:types`**, (4) Update DTOs
- CI fails if EOL item exists past target version (5 business day grace max)

**Status**: Emerging category - created as part of SRM modularization (2025-11-17)

---

### 70-governance/ - Governance & Process

| ID | Title | Status | Location |
|----|-------|--------|----------|
| GOV-001 | Over-Engineering Guardrail | Accepted | `70-governance/OVER_ENGINEERING_GUARDRAIL.md` |
| GOV-003 | Hooks Standard | Accepted | `70-governance/HOOKS_STANDARD.md` |
| GOV-004 | DTO Canonical Standard | Accepted | `70-governance/DTO_CANONICAL_STANDARD.md` |
| GOV-005 | Frontend Canonical Standard | Accepted | `70-governance/FRONT_END_CANONICAL_STANDARD.md` |
| GOV-006 | Server Actions Architecture v1.2 | Accepted | `70-governance/SERVER_ACTIONS_ARCHITECTURE.md` |
| GOV-007 | Error Handling Standard | Active | `70-governance/ERROR_HANDLING_STANDARD.md` |
| GOV-008 | Error Taxonomy & Resilience | Active | `70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` |
| GOV-PAT-001 | Service Factory Pattern | Active | `70-governance/patterns/domain-modeling/GOV-PAT-001-service-factory-pattern.md` |
| GOV-PAT-002 | Mapper Pattern | Active | `70-governance/patterns/domain-modeling/GOV-PAT-002-mapper-pattern.md` |

**Purpose**: SDLC policy, coding standards, anti-patterns, contribution guide, domain modeling patterns

**Standards**:
- Functional factories (not classes)
- Explicit interfaces (ban `ReturnType<>`)
- DTO derivation from `Database` types
- React Query v5 patterns with key factories

**Domain Modeling**:
- **GOV-PAT-001**: Service factory anti-patterns and correct implementations
- **GOV-PAT-002**: Mapper patterns for DTO transformations

---

### 80-adrs/ - Architecture Decision Records

| ID | Title | Status | Date | Supersedes |
|----|-------|--------|------|------------|
| ADR-000 | Matrix as Contract | Accepted | - | - |
| ADR-003 | State Management Strategy | Accepted | - | - |
| ADR-004 | Real-time Strategy | Accepted | - | - |
| ADR-007 | API Surface Catalogue | Accepted | - | - |
| ADR-008 | Service Layer Architecture | Accepted | - | - |
| ADR-009 | Balanced Architecture Intake | Accepted | - | - |
| ADR-010 | DTO Compliance Gate | Accepted | - | - |
| ADR-011 | Over-Engineering Guardrail | Accepted | - | - |
| ADR-014 | Ghost Gaming Visits | Implemented | 2025-11-xx | - |
| ADR-015 | RLS Connection Pooling Strategy | Implemented | 2025-12-10 | - |
| ADR-017 | Cashier Role Implementation | Implemented | 2025-12-10 | - |
| ADR-018 | SECURITY DEFINER Governance | Implemented | 2025-12-12 | - |
| ADR-020 | RLS Track A Hybrid Strategy | Implemented | 2025-12-15 | - |
| ADR-023 | Multi-Tenancy Storage Model | Accepted | 2025-12-25 | - |
| ADR-024 | Context Self-Injection Remediation | Implemented | 2025-12-29 | - |
| ADR-025 | MTL Authorization Model | Accepted | 2026-01-02 | - |
| ADR-026 | Gaming-Day-Scoped Visits | Accepted | 2026-01-16 | - |
| ADR-027 | Table Bank Mode Dual Policy | Accepted | 2026-01-16 | - |
| ADR-028 | Table Status Standardization | Proposed | 2026-01-16 | - |
| ADR-029 | Player 360° Interaction Event Taxonomy | Proposed | 2026-01-21 | - |
| ADR-030 | Auth System Hardening | Accepted | 2026-01-29 | - |
| ADR-031 | Financial Amount Convention (Cents/Dollars) | Proposed | 2026-02-02 | - |
| ADR-032 | Frontend Error Boundary Architecture | Proposed | 2026-02-02 | Extends ADR-012 |
| ADR-035 | Client State Lifecycle Across Auth Transitions | Accepted | 2026-02-18 | Extends ADR-003 §8 |

**Location**: `80-adrs/`

---

## 🔍 "Where to Find" Cheatsheet

| Question | Category | Document |
|----------|----------|----------|
| "Why did we choose X?" | ADRs | [80-adrs/](80-adrs/) |
| "How should bounded contexts talk?" | ARCH | [SRM](20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md) |
| "What DTOs can I consume?" | API/DATA | [DTO Catalog](25-api-data/DTO_CATALOG.md) |
| "What are the endpoints?" | API/DATA | [API Surface](25-api-data/API_SURFACE_MVP.md) |
| "What events are available?" | INTEGRATION | [Event Catalog](35-integration/INT-002-event-catalog.md) |
| "Who can read/write this table?" | SEC/RBAC | [RLS Policy Matrix](30-security/SEC-001-rls-policy-matrix.md) |
| "What are the roles/capabilities?" | SEC/RBAC | [Role Taxonomy](30-security/SEC-005-role-taxonomy.md) |
| "What tests must pass?" | QA | [40-quality/](40-quality/) |
| "How do I run a migration?" | MIGRATIONS | [Migration Runbook](50-ops/runbooks/RUN-003-schema-migration-runbook.md) |
| "How do we debug in prod?" | OPS | [50-ops/runbooks/](50-ops/runbooks/) |
| "How do we ship safely?" | REL | [60-release/](60-release/) |
| "What are coding standards?" | GOV | [70-governance/](70-governance/) |
| "Should this be HORIZONTAL or VERTICAL?" | ARCH | [Balanced Architecture](20-architecture/BALANCED_ARCHITECTURE_QUICK.md) |

---

## 📝 Document Maintenance

### Review Schedule
- **Weekly**: Documentation updates and taxonomy adjustments
- **Bi-weekly**: Cross-reference validation
- **Monthly**: Category ownership review
- **Quarterly**: Architecture refinements and ADR review

### Ownership (RACI)

| Category | Owner | Approvers | Consulted |
|----------|-------|-----------|-----------|
| Vision | Product | Eng Lead | Architecture, QA |
| PRD | Product | Eng Lead | Architecture, QA |
| ARCH | Architecture | Eng Lead | Security, Product |
| API/DATA | Backend | Architecture | Frontend, QA |
| SEC/RBAC | Security | Architecture | Backend |
| QA | QA Lead | Eng Lead | All teams |
| OPS | SRE | Eng Lead | Backend |
| REL | Release Mgr | Eng Lead | Product, QA |
| GOV | Eng Lead | Architecture | All teams |
| ADR | Author | Architecture | Affected teams |

---

## 🔗 External References

### Supabase
- [Local Development](https://supabase.com/docs/guides/cli/local-development)
- [Type Generation](https://supabase.com/docs/guides/api/rest/generating-types)
- [RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)

### Next.js
- [App Router](https://nextjs.org/docs/app)
- [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)

### React Query
- [TanStack Query v5](https://tanstack.com/query/latest)
- [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)

### Testing
- [Jest](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

---

## 🆘 Need Help?

### Common Questions
1. **"Should this be HORIZONTAL or VERTICAL?"** → [Balanced Architecture Quick](20-architecture/BALANCED_ARCHITECTURE_QUICK.md) ⭐
2. **"Which type file do I import?"** → [Database Workflow](workflows/DATABASE_TYPE_WORKFLOW.md)
3. **"How do I write a service?"** → [SLAD §308-350](20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
4. **"What's the anti-pattern rule?"** → [PRD §4](10-prd/PRD-001_Player_Management_System_Requirements.md) or [Over-Engineering Guardrail](70-governance/OVER_ENGINEERING_GUARDRAIL.md)

### Finding Specific Information
- **Bounded Context Rules**: [Service Responsibility Matrix](20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- **Data Flow Patterns**: [Service Layer Architecture Diagram](20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
- **Security Patterns**: [30-security/](30-security/)
- **Testing Patterns**: [40-quality/](40-quality/)

---

## Recent Changes (2026-02-19)

### ADR-035 Client State Lifecycle (2026-02-19)

**What Changed**:
- ✅ SRM updated to v4.14.0: New "Client State Lifecycle" section — store classification, session reset contract, auth integration points
- ✅ SLAD updated to v3.4.0: ADR-035 canonical reference added, client state lifecycle patterns
- ✅ ADR-035 added to ADR registry (Accepted, extends ADR-003 §8)
- ✅ ADR-003 Section 8 cross-referenced with ADR-035 session lifecycle extension
- ✅ ADR-030 Related field updated (ADR-035 is client-side counterpart)
- ✅ SEC-002 related ADRs updated with ADR-035

**Key Additions**:
- ADR-035: Session Reset Contract — Zustand store lifecycle classification (session vs app scoped), `resetSessionState()` orchestrator, defensive selection validation, browser storage PII cleanup
- Complements ADR-030 server-side auth hardening with client-side lifecycle correctness

### Previous: Canonical Docs Staleness Sync (ADR-030, ADR-031, ADR-032)

**What Changed**:
- ✅ SRM status synced from v4.4.0 to v4.11.0 (was 49 days behind)
- ✅ ADR registry updated: ADR-025 through ADR-032 added (8 missing entries)
- ✅ PRD registry updated: PRD-022 through PRD-026 added (5 missing entries)
- ✅ GOV registry updated: ERROR_HANDLING_STANDARD and ERROR_TAXONOMY added
- ✅ SLAD version reference updated from v2.1.2 to v3.3.0
- ✅ ERROR_HANDLING_STANDARD.md updated with ADR-032 React error boundary patterns
- ✅ ERROR_TAXONOMY_AND_RESILIENCE.md updated with render-layer error section
- ✅ SLAD updated to v3.3.0 with ADR-029 through ADR-032 references
- ✅ SRM source_of_truth updated with ADR-030, ADR-032 references

**Key Additions**:
- ADR-030: Auth System Hardening — TOCTOU elimination, claims lifecycle, bypass lockdown
- ADR-031: Financial Amount Convention — cents storage, dollars at boundary
- ADR-032: Frontend Error Boundary Architecture — three-tier hierarchy extending ADR-012

### Previous: SEC-006 RLS Hardening & ADR-018 Governance (2025-12-12)

**What Changed**:
- ✅ SEC-006 RLS audit complete - FloorLayoutService full RLS coverage (5 tables)
- ✅ ADR-018 created - SECURITY DEFINER function governance (Template 5)
- ✅ SRM updated to v4.4.0 with SEC-006 references

---

**Index Version**: 2.5.0 (ADR-035 Client State Lifecycle)
**Last Updated**: 2026-02-19
**Maintained By**: Development Team
**Next Review**: Weekly

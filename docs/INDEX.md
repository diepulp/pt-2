# PT-2 Documentation Index

**Last Updated**: 2025-11-17
**Taxonomy Version**: 1.1 (SDLC-Aligned + Emerging Categories)
**Architecture Strategy**: Hybrid Model (HORIZONTAL + VERTICAL)
**Reference**: [SDLC_TAXONOMY_INVENTORY.md](srn-modularization/SDLC_TAXONOMY_INVENTORY.md)
**SRM Status**: Compressed (2,127 → 1,848 lines, 13% reduction)

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
1. **[Balanced Architecture Quick](patterns/BALANCED_ARCHITECTURE_QUICK.md)** ⭐ HORIZONTAL vs VERTICAL decision (10-min)
2. **[Service Template](70-governance/)** → SERVICE_TEMPLATE.md - Implementation guide
3. **[Hooks Standard](70-governance/)** → HOOKS_STANDARD.md - React Query v5 patterns
4. **[Database Type Workflow](workflows/DATABASE_TYPE_WORKFLOW.md)** - Daily DB management

### For Architects
1. **[Service Responsibility Matrix](20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)** → SRM (compressed) - Canonical bounded contexts registry
2. **[DTO Catalog](25-api-data/DTO_CATALOG.md)** → Complete DTO specifications with field-level detail
3. **[Service Layer Diagram](20-architecture/)** → Architecture patterns + anti-patterns
4. **[API Surface](25-api-data/)** → API_SURFACE_MVP.md - Endpoint catalogue
5. **[ADRs](80-adrs/)** → Decision history and rationale

### For Product Managers
1. **[MVP Roadmap](10-prd/)** → SDLC_MVP_ROADMAP.md - 10-week delivery plan
2. **[Canonical PRD](10-prd/)** → CANONICAL_BLUEPRINT_MVP_PRD.md - Complete spec
3. **[Release Plans](60-release/)** → Phased delivery strategy

---

## 🗂️ Document Registry (By Category)

### 00-vision/ - Vision & Scope

| ID | Title | Status | Location |
|----|-------|--------|----------|
| - | *To be populated* | - | - |

**Purpose**: Problem statement, goals, non-goals, success metrics

---

### 10-prd/ - Product Requirements

| ID | Title | Status | Location |
|----|-------|--------|----------|
| PRD-001 | SDLC MVP Roadmap | Draft | `system-prd/SDLC_MVP_ROADMAP.md` |
| PRD-002 | Canonical Blueprint MVP | Accepted | `system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md` |

**Purpose**: User stories, acceptance criteria, release goals

**Key Sections**:
- PRD §3.3: Service Layer Standards
- PRD §4: Anti-Pattern Guardrails
- PRD §3.10: Testing & CI/CD

---

### 20-architecture/ - Architecture & System Patterns

| ID | Title | Status | Location |
|----|-------|--------|----------|
| ARCH-001 | Service Responsibility Matrix (compressed) | Active | `SERVICE_RESPONSIBILITY_MATRIX.md` |
| ARCH-002 | Service Layer Architecture Diagram v1.0 | Accepted | `SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| ARCH-003 | SRM Mapping Table | Active | `SRM_MAPPING_TABLE.md` |
| TEMP-001 | Gaming Day Specification | Active | `temporal-patterns/TEMP-001-gaming-day-specification.md` |
| TEMP-002 | Temporal Authority Pattern | Active | `temporal-patterns/TEMP-002-temporal-authority-pattern.md` |

**Purpose**: Bounded contexts, system diagrams, integration contracts, NFRs

**Key Documents**:
- **SRM** (1,848 lines): Canonical bounded context registry - compressed for maintainability
- **SRM Mapping Table**: Links SRM sections to detailed taxonomy documents
- **Service Layer Diagram**: Visual patterns + anti-patterns with mermaid
- **Temporal Patterns**: Gaming day authority and edge case handling

**Recent Changes** (2025-11-17):
- ✅ SRM compressed by 13% (279 lines saved)
- ✅ Detailed specs moved to taxonomy docs (DTO_CATALOG, INT-002, etc.)
- ✅ Link validation automated via CI

---

### 25-api-data/ - API & Data Contracts

| ID | Title | Status | Location |
|----|-------|--------|----------|
| API-001 | DTO Catalog | Active | `DTO_CATALOG.md` |
| API-002 | DTO Canonical Standard | Accepted | `DTO_CANONICAL_STANDARD.md` |
| API-003 | API Surface MVP | Accepted | `API_SURFACE_MVP.md` |
| API-004 | Real-time Events Map | Accepted | `REAL_TIME_EVENTS_MAP.md` |
| API-005 | OpenAPI Specification | Draft | `api-surface.openapi.yaml` |

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
| SEC-001 | RLS Policy Matrix | Active | `SEC-001-rls-policy-matrix.md` |
| SEC-005 | Role Taxonomy | Active | `SEC-005-role-taxonomy.md` |
| COMP-002 | MTL Compliance Standard | Active | `compliance/COMP-002-mtl-compliance-standard.md` |

**Purpose**: RLS policies, RBAC matrix, threat model, secrets handling, compliance

**Key Documents**:
- **SEC-001**: RLS policy catalog per table with predicate patterns
- **SEC-005**: Role capabilities matrix (admin, pit_boss, cage, compliance, dealer)
- **COMP-002**: MTL/AML compliance thresholds, retention, audit requirements

**Security Model**:
- Casino-scoped tenancy with RLS
- No service keys in runtime (anon key + user context)
- WRAPPER pattern for context injection

---

### 35-integration/ - Integration & Events 🟡 EMERGING

| ID | Title | Status | Location |
|----|-------|--------|----------|
| INT-002 | Event Catalog | Active | `INT-002-event-catalog.md` |

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
| QA-001 | Testing Setup | Accepted | `phase-0/TESTING_SETUP.md` |

**Purpose**: Test strategy, coverage goals, quality gates, performance budgets

**Testing Standards**:
- Unit tests: Typed test doubles, 80% coverage minimum
- Integration tests: Local Supabase with RLS enabled
- E2E tests: Cypress (opt-in)

---

### 50-ops/ - Operations & Reliability

| ID | Title | Status | Location |
|----|-------|--------|----------|
| RUN-001 | Outbox Worker Playbook | Active | `runbooks/RUN-001-outbox-worker-playbook.md` |
| RUN-002 | Schema Reload | Active | `runbooks/RUN-002-schema-reload.md` |
| RUN-003 | Schema Migration Runbook | Active | `runbooks/RUN-003-schema-migration-runbook.md` |
| RUN-004 | RLS Policy Verification | Active | `runbooks/RUN-004-rls-policy-verification.md` |
| RUN-005 | Type Sync | Active | `runbooks/RUN-005-type-sync.md` |

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
| REL-001 | Migration Naming Standard | Accepted | `patterns/MIGRATION_NAMING_STANDARD.md` |

**Purpose**: Versioning, release notes, rollout/rollback, deprecation

**Standards**:
- Migration format: `YYYYMMDDHHMMSS_description.sql`
- Deprecation policy embedded in SRM
- Release phases in SDLC roadmap

---

### 65-migrations/ - Database Migrations 🟡 EMERGING

| ID | Title | Status | Location |
|----|-------|--------|----------|
| MIG-001 | Migration Tracking Matrix | Active | `MIG-001-migration-tracking-matrix.md` |

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
| GOV-001 | Service Template v1.2 | Accepted | `SERVICE_TEMPLATE.md` |
| GOV-002 | Over-Engineering Guardrail | Accepted | `OVER_ENGINEERING_GUARDRAIL.md` |
| GOV-003 | Hooks Standard | Accepted | `HOOKS_STANDARD.md` |
| GOV-004 | DTO Canonical Standard | Accepted | `DTO_CANONICAL_STANDARD.md` |
| GOV-005 | Frontend Canonical Standard | Accepted | `FRONT_END_CANONICAL_STANDARD.md` |
| GOV-006 | Server Actions Architecture v1.2 | Accepted | `SERVER_ACTIONS_ARCHITECTURE.md` |
| GOV-PAT-001 | Service Factory Pattern | Active | `patterns/domain-modeling/GOV-PAT-001-service-factory-pattern.md` |
| GOV-PAT-002 | Mapper Pattern | Active | `patterns/domain-modeling/GOV-PAT-002-mapper-pattern.md` |

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

**Location**: `adr/`

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
| "Should this be HORIZONTAL or VERTICAL?" | ARCH | [Balanced Architecture](patterns/BALANCED_ARCHITECTURE_QUICK.md) |

---

## 📊 Current Project Status

### Phase Completion

| Phase | Status | Approach | Completion | Key Docs |
|-------|--------|----------|------------|----------|
| **Phase 0** | ✅ Complete | HORIZONTAL | 100% | [COMPLETED.md](phase-0/COMPLETED.md) |
| **Phase 1** | ✅ Complete | HORIZONTAL | 100% | [security-skeleton.md](phase-1/security-skeleton.md) |
| **Phase 2** | 🔄 In Progress | HORIZONTAL | 87.5% | [SESSION_HANDOFF.md](phase-2/SESSION_HANDOFF.md) |
| **Phase 3** | ⏳ Next | H → V | 0% | Week 3: State (H), Weeks 4-6: UI (V) |
| **Phase 4** | ⏳ Pending | V + HYBRID | 0% | Compliance workflows |
| **Phase 5** | ⏳ Pending | HORIZONTAL | 0% | Production hardening |

### Service Layer Status (Phase 2)
- ✅ 7/8 core services complete (87.5%)
- ✅ 98/98 tests passing
- ✅ Zero PRD violations
- ✅ Test coverage >80%
- ✅ Hybrid strategy formalized

---

## 📖 Learning Paths

### New Developer (4 hours)
1. [Balanced Architecture Quick](patterns/BALANCED_ARCHITECTURE_QUICK.md) ⭐ (10 min)
2. [Canonical PRD](10-prd/) §1-4 (30 min)
3. [Service Layer Diagram](20-architecture/) (15 min)
4. [Player Service Implementation](../services/player/) (30 min)
5. [Database Workflow](workflows/DATABASE_TYPE_WORKFLOW.md) (30 min)
6. [Build test service](70-governance/) using template (2h)

### Architect/Tech Lead (2.5 hours)
1. [Balanced Architecture Quick](patterns/BALANCED_ARCHITECTURE_QUICK.md) ⭐ (10 min)
2. [Complete PRD](10-prd/) (1h)
3. [MVP Roadmap](10-prd/) (30 min)
4. [Architecture Gaps](roadmap/ARCHITECTURE_GAPS.md) (30 min)
5. [ADRs](80-adrs/) review (30 min)
6. Optional: [CONSENSUS_SYNTHESIS.md](architecture/slicing/CONSENSUS_SYNTHESIS.md) (3h)

---

## 🔄 Reorganization Status

### ✅ Phase 1: Structure Created (2025-10-25)
- [x] Create SDLC taxonomy folder structure
- [x] Add README to each category
- [x] Update INDEX.md with taxonomy

### ✅ Phase 2: Document Migration (2025-10-25)
- [x] Move PRD documents to `10-prd/` (2 docs)
- [x] Move architecture documents to `20-architecture/` (2 docs)
- [x] Move API documents to `25-api-data/` (8 docs)
- [x] Move release docs to `60-release/` (1 doc)
- [x] Move governance docs to `70-governance/` (5 docs)
- [x] Organize ADRs in `80-adrs/` (12 ADRs)
- [x] Create MIGRATION_SUMMARY.md

**Total**: 39 documents migrated successfully
**Report**: See [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md)

### ✅ Phase 3 - Priority 1: Link Updates & Cleanup (2025-10-26)
- [x] Scan all documents for broken internal links
- [x] Update references to migrated documents (35+ files)
- [x] Validate cross-references between docs (15+ links)
- [x] Remove empty legacy folders (adr/, api-route-catalogue/, system-prd/)
- [x] Create Phase 3 report

**Total**: 17 path patterns fixed across 35+ files
**Report**: See [PHASE_3_LINK_UPDATES_REPORT.md](PHASE_3_LINK_UPDATES_REPORT.md)

### ⏳ Phase 3 - Priority 2: Front Matter (Pending)
- [ ] Add YAML front matter to all migrated documents
- [ ] Include: id, title, owner, status, created, last_review
- [ ] Add affects/references cross-links

### ⏳ Phase 4: Automation & Maintenance (Pending)
- [ ] Add docs review checkbox to PR template
- [ ] Schedule weekly docs review cadence
- [ ] Create CODEOWNERS for doc categories
- [ ] Setup automated link checking (GitHub Actions)

---

## 📝 Document Maintenance

### Review Schedule
- **Weekly**: Session handoffs, status updates
- **Phase End**: Phase summary docs
- **Monthly**: Roadmap timeline adjustments
- **Quarterly**: PRD architecture refinements

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
1. **"Should this be HORIZONTAL or VERTICAL?"** → [Balanced Architecture Quick](patterns/BALANCED_ARCHITECTURE_QUICK.md) ⭐
2. **"Which type file do I import?"** → [Database Workflow](workflows/DATABASE_TYPE_WORKFLOW.md)
3. **"How do I write a service?"** → [Service Template](70-governance/)
4. **"What's the anti-pattern rule?"** → [PRD §4](10-prd/) or [Over-Engineering Guardrail](70-governance/)
5. **"When is MVP done?"** → [MVP Roadmap](10-prd/)
6. **"Where are we now?"** → [Session Handoff](phase-2/SESSION_HANDOFF.md)

---

## 📝 Recent Changes (2025-11-17)

### SRM Compression & Taxonomy Expansion ✅

**What Changed**:
- ✅ SRM compressed: 2,127 → 1,848 lines (13% reduction, 279 lines saved)
- ✅ Detailed specs moved to taxonomy: DTO_CATALOG (771 lines), INT-002, runbooks
- ✅ Two new taxonomy categories: `35-integration/` and `65-migrations/`
- ✅ Link validation automated via CI (17/17 links valid)
- ✅ Line reference tracking tool created (85 references monitored)

**Sections Compressed**:
1. DTO Contract Policy: 270 → 20 lines (now in DTO_CATALOG.md)
2. Event/Telemetry: 30 → 7 lines (now in INT-002-event-catalog.md)
3. Deprecation Policy: 11 → 5 lines (now in MIG-001-migration-tracking-matrix.md)
4. Client Cache: 9 → 7 lines (now in ADR-003/004)

**Impact**:
- SRM remains canonical bounded context registry
- Detailed specifications now in specialized taxonomy documents
- Documentation bloat prevented
- Product development unblocked

**Reports**:
- [Compression Execution Report](srn-modularization/COMPRESSION_EXECUTION_REPORT.md)
- [Blocker Resolution Report](srn-modularization/BLOCKER_RESOLUTION_REPORT.md)
- [SRM Mapping Table](20-architecture/SRM_MAPPING_TABLE.md)

---

**Index Version**: 2.1.0 (SDLC Taxonomy + Emerging Categories)
**Last Updated**: 2025-11-17
**Maintained By**: Development Team
**Next Review**: Weekly

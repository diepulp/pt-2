# PT-2 Documentation Index

**Last Updated**: 2025-10-25
**Taxonomy Version**: 1.0 (SDLC-Aligned)
**Architecture Strategy**: Hybrid Model (HORIZONTAL + VERTICAL)
**Reference**: [SDLC_DOCS_TAXONOMY.md](patterns/SDLC_DOCS_TAXONOMY.md)

---

## 🚀 Quick Navigation (SDLC Taxonomy)

| Category | Folder | Owner | Purpose | Phase |
|----------|--------|-------|---------|-------|
| Vision & Scope | [00-vision/](00-vision/) | Product | Problem, goals, non-goals | Inception, Discovery |
| Product Requirements | [10-prd/](10-prd/) | Product | User stories, acceptance criteria | All phases |
| Architecture | [20-architecture/](20-architecture/) | Architecture | SRM, diagrams, NFRs | Design, Build, Operate |
| API & Data | [25-api-data/](25-api-data/) | Backend | OpenAPI, DTOs, schema | Design → Evolve |
| Security & RBAC | [30-security/](30-security/) | Security | RLS, RBAC, threat model | Design → Evolve |
| Quality & Testing | [40-quality/](40-quality/) | QA | Test strategy, coverage | Discovery → Evolve |
| Operations | [50-ops/](50-ops/) | SRE | Observability, runbooks, SLOs | Design → Evolve |
| Release | [60-release/](60-release/) | Release Mgr | Release notes, rollout | Design → Evolve |
| Governance | [70-governance/](70-governance/) | Eng Lead | Standards, patterns | All phases |
| ADRs | [80-adrs/](80-adrs/) | Various | Decision records | All phases |

---

## 📚 Quick Start by Role

### For Developers
1. **[Balanced Architecture Quick](patterns/BALANCED_ARCHITECTURE_QUICK.md)** ⭐ HORIZONTAL vs VERTICAL decision (10-min)
2. **[Service Template](70-governance/)** → SERVICE_TEMPLATE.md - Implementation guide
3. **[Hooks Standard](70-governance/)** → HOOKS_STANDARD.md - React Query v5 patterns
4. **[Database Type Workflow](workflows/DATABASE_TYPE_WORKFLOW.md)** - Daily DB management

### For Architects
1. **[Service Responsibility Matrix](20-architecture/)** → SRM v3.0.2 - Canonical bounded contexts
2. **[Service Layer Diagram](20-architecture/)** → Architecture patterns + anti-patterns
3. **[API Surface](25-api-data/)** → API_SURFACE_MVP.md - Endpoint catalogue
4. **[ADRs](80-adrs/)** → Decision history and rationale

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
| ARCH-001 | Service Responsibility Matrix v3.0.2 | Accepted | `patterns/SERVICE_RESPONSIBILITY_MATRIX.md` |
| ARCH-002 | Service Layer Architecture Diagram v1.0 | Accepted | `system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| ARCH-003 | Balanced Architecture Quick Reference | Accepted | `patterns/BALANCED_ARCHITECTURE_QUICK.md` |

**Purpose**: Bounded contexts, system diagrams, integration contracts, NFRs

**Key Documents**:
- **SRM**: Canonical matrix-first contract (snake_case, UUID-based)
- **Service Layer Diagram**: Visual patterns + anti-patterns with mermaid
- **Balanced Architecture**: HORIZONTAL vs VERTICAL decision framework

---

### 25-api-data/ - API & Data Contracts

| ID | Title | Status | Location |
|----|-------|--------|----------|
| API-001 | API Surface MVP | Accepted | `api-route-catalogue/API_SURFACE_MVP.md` |
| API-002 | DTO Canonical Standard | Accepted | `patterns/DTO_CANONICAL_STANDARD.md` |
| API-003 | Real-time Events Map | Accepted | `patterns/REAL_TIME_EVENTS_MAP.md` |
| API-004 | OpenAPI Specification | Draft | `api-route-catalogue/api-surface.openapi.yaml` |

**Purpose**: REST API contracts, DTOs, database schema, event contracts

**Standards**:
- DTOs derived from `Database` types using Pick/Omit/Partial
- OpenAPI specs for all `/api/v1/**` endpoints
- Real-time event contracts for Supabase channels

---

### 30-security/ - Security & RBAC

| ID | Title | Status | Location |
|----|-------|--------|----------|
| - | *To be extracted from SRM* | - | - |

**Purpose**: RLS policies, RBAC matrix, threat model, secrets handling

**Current Coverage**:
- RLS patterns embedded in SRM (casino-scoped tables)
- Casino-scoped security model (to be documented)

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
| - | *To be documented* | - | - |

**Purpose**: Observability, runbooks, SLIs/SLOs, incident process

**Patterns**:
- Audit logging (embedded in SERVER_ACTIONS_ARCHITECTURE.md)
- Error mapping (PG → domain codes)
- Telemetry patterns (to be documented)

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

### 70-governance/ - Governance & Process

| ID | Title | Status | Location |
|----|-------|--------|----------|
| GOV-001 | Service Template v1.2 | Accepted | `patterns/SERVICE_TEMPLATE.md` |
| GOV-002 | Over-Engineering Guardrail | Accepted | `patterns/OVER_ENGINEERING_GUARDRAIL.md` |
| GOV-003 | Hooks Standard | Accepted | `patterns/HOOKS_STANDARD.md` |
| GOV-004 | DTO Canonical Standard | Accepted | `patterns/DTO_CANONICAL_STANDARD.md` |
| GOV-005 | Frontend Canonical Standard | Accepted | `patterns/FRONT_END_CANONICAL_STANDARD.md` |
| GOV-006 | Server Actions Architecture v1.2 | Accepted | `patterns/SERVER_ACTIONS_ARCHITECTURE.md` |

**Purpose**: SDLC policy, coding standards, anti-patterns, contribution guide

**Standards**:
- Functional factories (not classes)
- Explicit interfaces (ban `ReturnType<>`)
- DTO derivation from `Database` types
- React Query v5 patterns with key factories

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
| "How should bounded contexts talk?" | ARCH | [SRM](patterns/SERVICE_RESPONSIBILITY_MATRIX.md) |
| "What are the endpoints?" | API/DATA | [API Surface](25-api-data/) |
| "Who can read/write this table?" | SEC/RBAC | [30-security/](30-security/) |
| "What tests must pass?" | QA | [40-quality/](40-quality/) |
| "How do we debug in prod?" | OPS | [50-ops/](50-ops/) Runbooks |
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

**Index Version**: 2.0.0 (SDLC Taxonomy)
**Last Updated**: 2025-10-25
**Maintained By**: Development Team
**Next Review**: Weekly

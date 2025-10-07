# PT-2 Documentation Index

> **Project**: Casino Tracker V2 (Clean Rebuild)
> **Status**: Phase 2 - Service Layer Foundation (50% Complete)
> **Last Updated**: 2025-10-07

---

## 🚀 Quick Start

### For Developers
- **[Database Type Workflow](workflows/DATABASE_TYPE_WORKFLOW.md)** - Daily database + type management
- **[Service Template Quick Reference](patterns/SERVICE_TEMPLATE_QUICK.md)** - 2-page implementation guide
- **[Phase 2 Session Handoff](phase-2/SESSION_HANDOFF.md)** - Current implementation status

### For Architects
- **[Canonical Blueprint MVP PRD](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md)** - Complete architecture spec
- **[Service Layer Architecture](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)** - Service patterns + anti-patterns
- **[MVP Production Roadmap](roadmap/MVP_PRODUCTION_ROADMAP.md)** - 10-week path to production

---

## 📁 Documentation Structure

### System Architecture
```
system-prd/
├── CANONICAL_BLUEPRINT_MVP_PRD.md              # Complete PRD (§1-7)
└── SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md       # Service patterns + mermaid diagrams
```

**Key Sections**:
- PRD §3.3: Service Layer Standards
- PRD §4: Anti-Pattern Guardrails
- Architecture Diagram: Proven PT-1 patterns

---

### Patterns & Templates
```
patterns/
├── SERVICE_TEMPLATE.md                         # 500+ line canonical reference
├── SERVICE_TEMPLATE_QUICK.md                   # 2-page operational guide
└── controlled-hybrid-refactor-model.md         # TDD + PT-1 mining strategy
```

**Use Cases**:
- **Implementing new service**: Start with `SERVICE_TEMPLATE_QUICK.md`
- **Understanding rationale**: Reference `SERVICE_TEMPLATE.md`
- **PT-1 migration decisions**: Follow `controlled-hybrid-refactor-model.md`

---

### Workflows
```
workflows/
└── DATABASE_TYPE_WORKFLOW.md                   # Local vs remote DB type management
```

**Daily Tasks**:
- Regenerate types after migrations
- Deploy migrations to remote
- Sync local DB with team

---

### Roadmaps
```
roadmap/
├── MVP_PRODUCTION_ROADMAP.md                   # 10-week timeline (Phases 2-5)
└── ARCHITECTURE_GAPS.md                        # Missing components analysis
```

**Planning Resources**:
- **Roadmap**: Phase-by-phase deliverables + milestones
- **Gaps**: P0 blockers + P1 critical components

---

### Architecture Decisions
```
architecture/
└── ADR-001-dual-database-type-strategy.md      # Local + remote type file rationale
```

**ADR Format**:
- Context & problem statement
- Considered options
- Decision outcome + detailed rationale
- Compliance with PRD

---

### Phase Documentation
```
phase-0/
├── COMPLETED.md                                # Phase 0 summary
├── TESTING_SETUP.md                            # Jest + Cypress setup
├── DATABASE_WORKFLOW.md                        # Migration workflow
└── PHASE_0_SUMMARY.md                          # Detailed implementation

phase-1/
└── security-skeleton.md                        # RLS + JWT + Audit setup

phase-2/
├── SESSION_HANDOFF.md                          # Current status (Week 1 complete)
├── player-vertical-slice.md                    # Player service TDD approach
└── controlled-hybrid-refactor-model.md         # → Moved to patterns/
```

**Phase Status**:
- **Phase 0**: ✅ Complete (CI/CD, Testing, Security)
- **Phase 1**: ✅ Complete (RLS, JWT, Compliance)
- **Phase 2**: 🔄 50% (4/8 services, schema consistency achieved)
- **Phase 3-5**: ⏳ Pending (UI, Compliance, Production)

---

### Audits & Analysis
```
audits/
├── SCHEMA_DRIFT_AUDIT.md                       # Local vs remote type analysis
└── SCHEMA_DRIFT_SUMMARY.md                     # Executive summary + decision
```

**Audit Types**:
- **Schema Drift**: Type file consistency validation
- **PRD Compliance**: Anti-pattern detection (future)
- **Performance**: Bundle size + Lighthouse (future)

---

## 🎯 Current Focus (Phase 2)

### ✅ Completed (Week 2)
- ✅ Schema Consistency Migration (ratingslip.id: TEXT → UUID)
- ✅ PlayerFinancialService (CRUD + comprehensive tests)
- ✅ Bounded Context Clarity ([Service Responsibility Matrix](phase-2/SERVICE_RESPONSIBILITY_MATRIX.md))

### This Week (Week 2 Remaining)
- Casino Service CRUD (2 days)
- Table Context Service CRUD (2 days)

### Next Week (Week 3)
- MTL Service CRUD (1 day)
- PT-1 pattern mining (search.ts + queries.ts)
- Apply patterns to all services
- Integration testing

### Completion (End Week 3)
- 8/8 core services complete
- Search + query capabilities across domains
- Zero PRD violations
- Test coverage >80%

---

## 📚 Key Documents by Use Case

### "I need to implement a new service"
1. **[SERVICE_TEMPLATE_QUICK.md](patterns/SERVICE_TEMPLATE_QUICK.md)** - Start here
2. **[Player Service](../services/player/)** - Reference implementation
3. **[Player Tests](../__tests__/services/player/)** - Test examples
4. **[PRD §3.3](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#33-service-layer)** - Standards

### "I need to write a migration"
1. **[DATABASE_TYPE_WORKFLOW.md](workflows/DATABASE_TYPE_WORKFLOW.md)** - Step-by-step guide
2. **[DATABASE_WORKFLOW.md](phase-0/DATABASE_WORKFLOW.md)** - Migration basics
3. **[ADR-001](architecture/ADR-001-dual-database-type-strategy.md)** - Local vs remote strategy

### "I need to understand the architecture"
1. **[CANONICAL_BLUEPRINT_MVP_PRD.md](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md)** - Complete spec
2. **[SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)** - Visual patterns
3. **[MVP_PRODUCTION_ROADMAP.md](roadmap/MVP_PRODUCTION_ROADMAP.md)** - Implementation plan

### "I need to check project status"
1. **[SESSION_HANDOFF.md](phase-2/SESSION_HANDOFF.md)** - Current implementation state
2. **[MVP_PRODUCTION_ROADMAP.md](roadmap/MVP_PRODUCTION_ROADMAP.md)** - Timeline + milestones
3. **[ARCHITECTURE_GAPS.md](roadmap/ARCHITECTURE_GAPS.md)** - Missing components

### "I need to understand a past decision"
1. **[ADR-001](architecture/ADR-001-dual-database-type-strategy.md)** - Dual type file strategy
2. **Future ADRs** - Real-time strategy, state management, etc.

---

## 🔍 Finding Information

### By Topic

| Topic | Primary Document | Supporting Docs |
|-------|-----------------|-----------------|
| **Service Layer** | [SERVICE_TEMPLATE_QUICK.md](patterns/SERVICE_TEMPLATE_QUICK.md) | [PRD §3.3](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#33-service-layer), [Architecture Diagram](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) |
| **Database Types** | [DATABASE_TYPE_WORKFLOW.md](workflows/DATABASE_TYPE_WORKFLOW.md) | [ADR-001](architecture/ADR-001-dual-database-type-strategy.md), [Schema Drift Audit](audits/SCHEMA_DRIFT_AUDIT.md) |
| **Testing** | [TESTING_SETUP.md](phase-0/TESTING_SETUP.md) | [PRD §3.10](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#310-testing--cicd) |
| **Anti-Patterns** | [PRD §4](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#4-anti-pattern-guardrails) | [Architecture Diagram](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) |
| **Roadmap** | [MVP_PRODUCTION_ROADMAP.md](roadmap/MVP_PRODUCTION_ROADMAP.md) | [ARCHITECTURE_GAPS.md](roadmap/ARCHITECTURE_GAPS.md) |
| **Migrations** | [DATABASE_WORKFLOW.md](phase-0/DATABASE_WORKFLOW.md) | [DATABASE_TYPE_WORKFLOW.md](workflows/DATABASE_TYPE_WORKFLOW.md) |

### By Phase

| Phase | Status | Key Docs |
|-------|--------|----------|
| **Phase 0** | ✅ Complete | [COMPLETED.md](phase-0/COMPLETED.md), [TESTING_SETUP.md](phase-0/TESTING_SETUP.md) |
| **Phase 1** | ✅ Complete | [security-skeleton.md](phase-1/security-skeleton.md) |
| **Phase 2** | 🔄 50% | [SESSION_HANDOFF.md](phase-2/SESSION_HANDOFF.md), [SERVICE_RESPONSIBILITY_MATRIX.md](phase-2/SERVICE_RESPONSIBILITY_MATRIX.md) |
| **Phase 3** | ⏳ Pending | [Roadmap Week 4-6](roadmap/MVP_PRODUCTION_ROADMAP.md#phase-3-ui-layer--real-time-weeks-4-6) |
| **Phase 4** | ⏳ Pending | [Roadmap Week 7-8](roadmap/MVP_PRODUCTION_ROADMAP.md#phase-4-compliance--workflows-weeks-7-8) |
| **Phase 5** | ⏳ Pending | [Roadmap Week 9-10](roadmap/MVP_PRODUCTION_ROADMAP.md#phase-5-production-hardening-weeks-9-10) |

---

## 🎓 Learning Path

### New Developer Onboarding
1. Read [CANONICAL_BLUEPRINT_MVP_PRD.md](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md) §1-4 (30 min)
2. Review [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) (15 min)
3. Study [Player Service Implementation](../services/player/) (30 min)
4. Follow [DATABASE_TYPE_WORKFLOW.md](workflows/DATABASE_TYPE_WORKFLOW.md) tutorial (30 min)
5. Implement a test service using [SERVICE_TEMPLATE_QUICK.md](patterns/SERVICE_TEMPLATE_QUICK.md) (2h)

**Total**: ~4 hours to productive contribution

### Architect/Tech Lead Onboarding
1. Read complete [PRD](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md) (1h)
2. Review [MVP Production Roadmap](roadmap/MVP_PRODUCTION_ROADMAP.md) (30 min)
3. Analyze [Architecture Gaps](roadmap/ARCHITECTURE_GAPS.md) (30 min)
4. Study [ADR-001](architecture/ADR-001-dual-database-type-strategy.md) (30 min)
5. Review current [Session Handoff](phase-2/SESSION_HANDOFF.md) (15 min)

**Total**: ~2.5 hours to architectural understanding

---

## 📊 Documentation Health

### Coverage by Category
- ✅ **Architecture**: Complete (PRD, diagrams, ADRs)
- ✅ **Patterns**: Complete (templates, hybrid model)
- ✅ **Workflows**: Partial (database types complete, others pending)
- ⚠️ **Roadmap**: Complete (needs updates as phases progress)
- ⏳ **Audits**: Started (schema drift only)
- ⏳ **Phase Docs**: Phases 0-2 documented, 3-5 pending

### Upcoming Documentation Needs
- **Phase 3**: React Query setup, real-time patterns
- **Phase 4**: Compliance workflows, MTL reporting
- **Phase 5**: Performance optimization, deployment procedures
- **ADRs**: Real-time strategy, state management, security

---

## 🔗 External References

### Supabase Documentation
- [Local Development](https://supabase.com/docs/guides/cli/local-development)
- [Type Generation](https://supabase.com/docs/guides/api/rest/generating-types)
- [RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)

### Next.js Documentation
- [App Router](https://nextjs.org/docs/app)
- [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)

### Testing Documentation
- [Jest](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Cypress](https://docs.cypress.io/guides/overview/why-cypress)

---

## 📝 Document Maintenance

### Review Schedule
- **Weekly**: [SESSION_HANDOFF.md](phase-2/SESSION_HANDOFF.md) - Updated after each session
- **Phase End**: Phase summary docs (COMPLETED.md style)
- **Monthly**: [MVP_PRODUCTION_ROADMAP.md](roadmap/MVP_PRODUCTION_ROADMAP.md) - Timeline adjustments
- **Quarterly**: [PRD](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md) - Architecture refinements

### Document Owners
- **PRD**: Tech Lead
- **Roadmap**: Product + Tech Lead
- **Templates**: Senior Developers
- **Workflows**: DevOps + Developers
- **ADRs**: Architecture Team

---

## 🆘 Need Help?

### Common Questions
1. **"Which type file do I import?"** → [DATABASE_TYPE_WORKFLOW.md](workflows/DATABASE_TYPE_WORKFLOW.md)
2. **"How do I write a service?"** → [SERVICE_TEMPLATE_QUICK.md](patterns/SERVICE_TEMPLATE_QUICK.md)
3. **"What's the anti-pattern rule?"** → [PRD §4](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#4-anti-pattern-guardrails)
4. **"When is MVP done?"** → [MVP_PRODUCTION_ROADMAP.md](roadmap/MVP_PRODUCTION_ROADMAP.md)
5. **"Where are we now?"** → [SESSION_HANDOFF.md](phase-2/SESSION_HANDOFF.md)

### Document Not Found?
Check if it's:
- In the wrong phase folder
- Renamed (check git history)
- Not yet created (see roadmap for planned docs)
- In parent project (reference-pt-1/)

---

**Index Version**: 1.1.0
**Last Updated**: 2025-10-07
**Maintained By**: Development Team

---

## 📦 Recent Updates (v1.1.0)

### Schema Consistency Achievement
- **Migration**: [20251006234000_migrate_ratingslip_id_to_uuid.sql](../supabase/migrations/20251006234000_migrate_ratingslip_id_to_uuid.sql)
- **Impact**: Unified ID semantics across all domains (UUID standard)
- **Benefits**: Type-safe joins, ORM consistency, zero casting overhead

### PlayerFinancialService
- **Implementation**: [services/player-financial/](../services/player-financial/)
- **Bounded Context**: "What money/chips moved in/out?"
- **Test Coverage**: 16 comprehensive test cases
- **Schema**: [player_financial_transaction table](../supabase/migrations/20251006234748_create_player_financial_transaction.sql)

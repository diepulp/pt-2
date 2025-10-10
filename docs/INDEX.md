# PT-2 Documentation Index

> **Project**: Casino Tracker V2 (Clean Rebuild)
> **Status**: Phase 2 - Service Layer Foundation (87.5% Complete)
> **Last Updated**: 2025-10-10
> **Architecture Strategy**: Hybrid Model (HORIZONTAL layers + VERTICAL delivery)

---

## 🚀 Quick Start

### For Developers
- **[Database Type Workflow](workflows/DATABASE_TYPE_WORKFLOW.md)** - Daily database + type management
- **[Service Template Quick Reference](patterns/SERVICE_TEMPLATE_QUICK.md)** - 2-page implementation guide
- **[Balanced Architecture Quick](patterns/BALANCED_ARCHITECTURE_QUICK.md)** - ⭐ HORIZONTAL vs VERTICAL decision framework (10-min read)
- **[Phase 2 Session Handoff](phase-2/SESSION_HANDOFF.md)** - Current implementation status

### For Architects
- **[Canonical Blueprint MVP PRD](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md)** - Complete architecture spec
- **[Service Layer Architecture](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)** - Service patterns + anti-patterns
- **[MVP Production Roadmap](roadmap/MVP_PRODUCTION_ROADMAP.md)** - 10-week path to production with hybrid strategy
- **[Architecture Gaps](roadmap/ARCHITECTURE_GAPS.md)** - Missing components with HORIZONTAL/VERTICAL labels
- **[Bounded Contexts](phase-2/SERVICE_RESPONSIBILITY_MATRIX.md)** - Service responsibility matrix
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
├── BALANCED_ARCHITECTURE_QUICK.md              # ⭐ Hybrid strategy decision framework (10-min read)
└── controlled-hybrid-refactor-model.md         # TDD + PT-1 mining strategy
```

**Use Cases**:
- **Architectural decisions**: Start with `BALANCED_ARCHITECTURE_QUICK.md` (HORIZONTAL vs VERTICAL)
- **Implementing new service**: Use `SERVICE_TEMPLATE_QUICK.md`
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
├── MVP_PRODUCTION_ROADMAP.md                   # 10-week timeline with hybrid strategy
├── ARCHITECTURE_GAPS.md                        # Missing components (HORIZONTAL/VERTICAL labeled)
└── NEXT_STEPS_REPORT.md                        # Immediate actions with pattern application
```

**Planning Resources**:
- **Roadmap**: Phase-by-phase deliverables + HORIZONTAL/VERTICAL rhythm
- **Gaps**: P0 blockers categorized by approach (HORIZONTAL/VERTICAL/HYBRID)
- **Next Steps**: Week-by-week hybrid pattern application

---

### Architecture Decisions
```
architecture/
├── ADR-001-dual-database-type-strategy.md      # Local + remote type file rationale
├── ADR-002-test-location-standardization.md    # Root-level test location standard
└── slicing/
    ├── CONSENSUS_SYNTHESIS.md                  # Hybrid strategy full analysis (3-hour read)
    ├── EVALUATION_FRAMEWORK.md                 # Decision matrices (reference only)
    └── UPDATE_SUMMARY.md                       # Roadmap alignment summary (2025-10-10)
```

**ADR Format**:
- Context & problem statement
- Considered options
- Decision outcome + detailed rationale
- Compliance with PRD

**Slicing Strategy Docs**:
- **Daily Use**: [BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md) (10-min read)
- **Deep Dive**: [CONSENSUS_SYNTHESIS.md](architecture/slicing/CONSENSUS_SYNTHESIS.md) (3-hour read)
- **Team Scaling**: [EVALUATION_FRAMEWORK.md](architecture/slicing/EVALUATION_FRAMEWORK.md) (reference)

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
- **Phase 2**: 🔄 87.5% (7/8 services, MTL complete, 98/98 tests passing)
- **Phase 3**: ⏳ Next (HORIZONTAL state mgmt → VERTICAL UI delivery)
- **Phase 4-5**: ⏳ Pending (Compliance workflows, Production hardening)

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

## 🎯 Current Focus (Phase 2 → Phase 3 Transition)

### ✅ Completed (Weeks 1-2)
- ✅ Schema Consistency Migration (ratingslip.id: TEXT → UUID)
- ✅ PlayerFinancialService (CRUD + comprehensive tests)
- ✅ Casino Service (CRUD + queries)
- ✅ Table Context Service (3-table relationships, temporal config)
- ✅ MTL Service (compliance queries, CTR aggregation)
- ✅ Bounded Context Clarity ([Service Responsibility Matrix](phase-2/SERVICE_RESPONSIBILITY_MATRIX.md))
- ✅ Hybrid Architecture Strategy Formalized ([BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md))
- ✅ Test Location Standardization (ADR-002 - root-level `__tests__/services/`)

### This Week (Week 3 - HORIZONTAL)
- Integration smoke tests
- React Query + Zustand infrastructure setup
- Server action wrapper pattern
- Loyalty Service (optional, deferred to post-MVP if time constrained)

### Next 3 Weeks (VERTICAL Feature Delivery)
- **Week 4**: Player Management UI (complete DB → UI)
- **Week 5**: Visit Tracking UI (complete DB → UI)
- **Week 6**: RatingSlip Creation UI (complete DB → UI)

### Phase 2 Completion Status
- ✅ 7/8 core services complete (87.5%)
- ✅ 98/98 tests passing
- ✅ Zero PRD violations
- ✅ Test coverage >80%
- ✅ Hybrid strategy formalized

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
1. **[BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md)** - ⭐ Decision framework (10-min read)
2. **[CANONICAL_BLUEPRINT_MVP_PRD.md](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md)** - Complete spec
3. **[SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)** - Visual patterns
4. **[MVP_PRODUCTION_ROADMAP.md](roadmap/MVP_PRODUCTION_ROADMAP.md)** - Implementation plan with hybrid strategy

### "I need to check project status"
1. **[SESSION_HANDOFF.md](phase-2/SESSION_HANDOFF.md)** - Current implementation state
2. **[MVP_PRODUCTION_ROADMAP.md](roadmap/MVP_PRODUCTION_ROADMAP.md)** - Timeline + milestones
3. **[ARCHITECTURE_GAPS.md](roadmap/ARCHITECTURE_GAPS.md)** - Missing components

### "I need to understand a past decision"
1. **[ADR-001](architecture/ADR-001-dual-database-type-strategy.md)** - Dual type file strategy
2. **[ADR-002](architecture/ADR-002-test-location-standardization.md)** - Root-level test location
3. **[CONSENSUS_SYNTHESIS.md](architecture/slicing/CONSENSUS_SYNTHESIS.md)** - Hybrid strategy rationale
4. **Future ADRs** - Real-time strategy, state management, etc.

### "I need to make an architectural decision"
1. **[BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md)** - ⭐ Start here (10-min read)
2. Use the 4-second rule: "1 domain? VERTICAL. ALL domains? HORIZONTAL."
3. Check common scenarios table for similar decisions
4. Document in ADR if non-obvious or team-impacting

---

## 🔍 Finding Information

### By Topic

| Topic | Primary Document | Supporting Docs |
|-------|-----------------|-----------------|
| **Architecture Strategy** | [BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md) ⭐ | [CONSENSUS_SYNTHESIS.md](architecture/slicing/CONSENSUS_SYNTHESIS.md), [EVALUATION_FRAMEWORK.md](architecture/slicing/EVALUATION_FRAMEWORK.md) |
| **Service Layer** | [SERVICE_TEMPLATE_QUICK.md](patterns/SERVICE_TEMPLATE_QUICK.md) | [PRD §3.3](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#33-service-layer), [Architecture Diagram](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) |
| **Database Types** | [DATABASE_TYPE_WORKFLOW.md](workflows/DATABASE_TYPE_WORKFLOW.md) | [ADR-001](architecture/ADR-001-dual-database-type-strategy.md), [Schema Drift Audit](audits/SCHEMA_DRIFT_AUDIT.md) |
| **Testing** | [TESTING_SETUP.md](phase-0/TESTING_SETUP.md) | [PRD §3.10](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#310-testing--cicd), [ADR-002](architecture/ADR-002-test-location-standardization.md) |
| **Anti-Patterns** | [PRD §4](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#4-anti-pattern-guardrails) | [Architecture Diagram](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) |
| **Roadmap** | [MVP_PRODUCTION_ROADMAP.md](roadmap/MVP_PRODUCTION_ROADMAP.md) | [ARCHITECTURE_GAPS.md](roadmap/ARCHITECTURE_GAPS.md), [NEXT_STEPS_REPORT.md](roadmap/NEXT_STEPS_REPORT.md) |
| **Migrations** | [DATABASE_WORKFLOW.md](phase-0/DATABASE_WORKFLOW.md) | [DATABASE_TYPE_WORKFLOW.md](workflows/DATABASE_TYPE_WORKFLOW.md) |

### By Phase

| Phase | Status | Approach | Key Docs |
|-------|--------|----------|----------|
| **Phase 0** | ✅ Complete | HORIZONTAL | [COMPLETED.md](phase-0/COMPLETED.md), [TESTING_SETUP.md](phase-0/TESTING_SETUP.md) |
| **Phase 1** | ✅ Complete | HORIZONTAL | [security-skeleton.md](phase-1/security-skeleton.md) |
| **Phase 2** | 🔄 87.5% | HORIZONTAL | [SESSION_HANDOFF.md](phase-2/SESSION_HANDOFF.md), [SERVICE_RESPONSIBILITY_MATRIX.md](phase-2/SERVICE_RESPONSIBILITY_MATRIX.md) |
| **Phase 3** | ⏳ Next | HORIZONTAL → VERTICAL | Week 3: State mgmt (H), Weeks 4-6: Player/Visit/RatingSlip UI (V) |
| **Phase 4** | ⏳ Pending | VERTICAL + HYBRID | [Roadmap Week 7-8](roadmap/MVP_PRODUCTION_ROADMAP.md#phase-4-compliance--workflows-weeks-7-8) |
| **Phase 5** | ⏳ Pending | HORIZONTAL | [Roadmap Week 9-10](roadmap/MVP_PRODUCTION_ROADMAP.md#phase-5-production-hardening-weeks-9-10) |

---

## 🎓 Learning Path

### New Developer Onboarding
1. Read [BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md) ⭐ (10 min)
2. Read [CANONICAL_BLUEPRINT_MVP_PRD.md](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md) §1-4 (30 min)
3. Review [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) (15 min)
4. Study [Player Service Implementation](../services/player/) (30 min)
5. Follow [DATABASE_TYPE_WORKFLOW.md](workflows/DATABASE_TYPE_WORKFLOW.md) tutorial (30 min)
6. Implement a test service using [SERVICE_TEMPLATE_QUICK.md](patterns/SERVICE_TEMPLATE_QUICK.md) (2h)

**Total**: ~4 hours to productive contribution

### Architect/Tech Lead Onboarding
1. Read [BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md) ⭐ (10 min)
2. Read complete [PRD](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md) (1h)
3. Review [MVP Production Roadmap](roadmap/MVP_PRODUCTION_ROADMAP.md) (30 min)
4. Analyze [Architecture Gaps](roadmap/ARCHITECTURE_GAPS.md) (30 min)
5. Study [ADR-001](architecture/ADR-001-dual-database-type-strategy.md) + [ADR-002](architecture/ADR-002-test-location-standardization.md) (30 min)
6. Review current [Session Handoff](phase-2/SESSION_HANDOFF.md) (15 min)
7. Optional: [CONSENSUS_SYNTHESIS.md](architecture/slicing/CONSENSUS_SYNTHESIS.md) for deep dive (3h)

**Total**: ~2.5 hours to architectural understanding (+ 3h optional deep dive)

---

## 📊 Documentation Health

### Coverage by Category
- ✅ **Architecture**: Complete (PRD, diagrams, ADRs, hybrid strategy)
- ✅ **Patterns**: Complete (templates, hybrid model, decision framework)
- ✅ **Workflows**: Partial (database types complete, others pending)
- ✅ **Roadmap**: Updated (hybrid strategy integrated, 2025-10-10)
- ⏳ **Audits**: Started (schema drift only)
- ⏳ **Phase Docs**: Phases 0-2 documented, 3-5 pending

### Recent Additions (2025-10-10)
- ✅ **[BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md)** - Hybrid strategy decision framework
- ✅ **[CONSENSUS_SYNTHESIS.md](architecture/slicing/CONSENSUS_SYNTHESIS.md)** - Full architectural analysis
- ✅ **[UPDATE_SUMMARY.md](architecture/slicing/UPDATE_SUMMARY.md)** - Roadmap alignment tracking
- ✅ All roadmap docs updated with HORIZONTAL/VERTICAL labels

### Upcoming Documentation Needs
- **Phase 3**: React Query setup guide, server action patterns, Zustand stores
- **Phase 4**: Compliance workflows, MTL reporting, real-time patterns
- **Phase 5**: Performance optimization, deployment procedures
- **ADRs**: State management strategy (Week 3), real-time strategy (Week 6), security patterns (Week 7)

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
1. **"Should this be HORIZONTAL or VERTICAL?"** → [BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md) ⭐
2. **"Which type file do I import?"** → [DATABASE_TYPE_WORKFLOW.md](workflows/DATABASE_TYPE_WORKFLOW.md)
3. **"How do I write a service?"** → [SERVICE_TEMPLATE_QUICK.md](patterns/SERVICE_TEMPLATE_QUICK.md)
4. **"What's the anti-pattern rule?"** → [PRD §4](system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#4-anti-pattern-guardrails)
5. **"When is MVP done?"** → [MVP_PRODUCTION_ROADMAP.md](roadmap/MVP_PRODUCTION_ROADMAP.md)
6. **"Where are we now?"** → [SESSION_HANDOFF.md](phase-2/SESSION_HANDOFF.md)

### Document Not Found?
Check if it's:
- In the wrong phase folder
- Renamed (check git history)
- Not yet created (see roadmap for planned docs)
- In parent project (reference-pt-1/)

---

**Index Version**: 1.2.0
**Last Updated**: 2025-10-10
**Maintained By**: Development Team
**Architecture Strategy**: Hybrid Model (HORIZONTAL + VERTICAL)

---

## 📦 Recent Updates (v1.2.0 - 2025-10-10)

### Hybrid Architecture Strategy Formalized
- **Framework**: [BALANCED_ARCHITECTURE_QUICK.md](patterns/BALANCED_ARCHITECTURE_QUICK.md) - 10-min decision guide
- **Full Analysis**: [CONSENSUS_SYNTHESIS.md](architecture/slicing/CONSENSUS_SYNTHESIS.md) - Architect perspectives
- **Roadmap Alignment**: All docs updated with HORIZONTAL/VERTICAL labels
- **Core Principle**: "Horizontal layers for technical architecture, vertical slices for feature delivery"

### MTL Service Complete (Phase 2 - 87.5%)
- **Implementation**: [services/mtl/](../services/mtl/)
- **Bounded Context**: "What cash transactions require regulatory reporting?"
- **Features**: CTR aggregation, compliance queries
- **Test Coverage**: 98/98 tests passing (100%)

### Test Location Standardization (ADR-002)
- **Decision**: Root-level `__tests__/services/{domain}/` pattern
- **Migration**: Casino, TableContext, MTL tests moved
- **Consistency**: All services now follow same pattern

### Previous Updates (v1.1.0)
- ✅ Schema Consistency (ratingslip.id: TEXT → UUID)
- ✅ PlayerFinancialService (16 test cases)
- ✅ Bounded Context Clarity (Service Responsibility Matrix)

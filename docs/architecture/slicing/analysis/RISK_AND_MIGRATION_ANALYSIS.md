# PT-2 Architectural Slicing: Risk Analysis & Migration Strategy

> **Date**: 2025-10-09
> **Status**: Architecture Decision Recommendation
> **Purpose**: Comprehensive risk assessment and pragmatic migration path for PT-2 service layer evolution
> **Context**: 7/8 services complete (87.5%), 98/98 tests passing, template velocity 4x improvement sustained

---

## Executive Summary

**Current State**: PT-2 has successfully implemented a **functional horizontal service layer** with explicit interfaces, typed dependencies, and bounded context integrity. The architecture already aligns with horizontal layering principles while avoiding anti-patterns from PT-1.

**Critical Finding**: The existing implementation is **NOT misaligned** - it represents a pragmatic hybrid that works well for solo developer velocity and maintains architectural consistency.

**Recommendation**: **Continue current trajectory with incremental refinement** (Path A). The perceived tension between "vertical slicing" and "horizontal layering" is a false dichotomy - PT-2 needs both:
- **Horizontal layers** for technical separation of concerns (already implemented)
- **Vertical delivery** for feature-complete user value (next phase)

**Risk Level**: LOW - Current approach minimizes disruption and leverages established patterns.

---

## 1. Current State Analysis

### 1.1 What's Already Implemented

**Horizontal Service Layer** (Phase 2 - 87.5% Complete):
```
services/
├── shared/                      # ✅ Horizontal infrastructure
│   ├── operation-wrapper.ts     # Universal error handling
│   ├── types.ts                 # ServiceResult contracts
│   └── utils.ts                 # Shared utilities
│
├── player/                      # ✅ Domain-bounded service
│   ├── index.ts                 # Explicit PlayerService interface
│   └── crud.ts                  # CRUD operations module
│
├── visit/                       # ✅ Session context service
├── ratingslip/                  # ✅ Performance tracking service
├── player-financial/            # ✅ Financial ledger service
├── casino/                      # ✅ Venue management service
├── table-context/               # ✅ Table lifecycle service
└── mtl/                         # ✅ Compliance domain service
    ├── index.ts                 # Explicit MTLService interface
    ├── crud.ts                  # Transaction CRUD
    └── queries.ts               # CTR aggregation logic
```

**Architecture Strengths** (Validated):
- ✅ Explicit interfaces (zero `ReturnType` inference violations)
- ✅ Typed dependencies (`SupabaseClient<Database>`, never `any`)
- ✅ Functional factories (zero class-based services)
- ✅ Bounded context integrity (Service Responsibility Matrix enforced)
- ✅ Consistent error handling (ServiceResult pattern)
- ✅ Root-level test standardization (`__tests__/services/`)
- ✅ 98/98 tests passing with >80% coverage
- ✅ 4x velocity improvement sustained

**What's Missing** (Expected Next Phase):
- ⏳ Server Actions layer (orchestration)
- ⏳ React Query hooks (state management)
- ⏳ UI components (presentation)
- ⏳ Real-time subscriptions (live sync)

### 1.2 Established Patterns That Work

**Pattern 1: Module Composition**
```typescript
// services/mtl/index.ts
export interface MTLService {
  // CRUD operations
  create(data: MTLEntryCreateDTO): Promise<ServiceResult<MTLEntryDTO>>;
  getById(id: number): Promise<ServiceResult<MTLEntryDTO>>;

  // Query operations
  getPendingCTRReports(...): Promise<ServiceResult<...>>;
}

export function createMTLService(
  supabase: SupabaseClient<Database>
): MTLService {
  const crudService = createMTLCrudService(supabase);
  const queriesService = createMTLQueriesService(supabase);

  return {
    ...crudService,
    ...queriesService,
  };
}
```

**Why This Works**:
- Clear separation of CRUD vs business logic vs queries
- Explicit contracts prevent silent method overwrites
- Composition promotes reusability without inheritance
- Testable in isolation (each module independently)

**Pattern 2: Bounded Context Integrity**
```typescript
// RatingSlip Service (Performance Domain)
interface RatingSlipDTO {
  average_bet: number;  // ✅ Performance metric
  points: number;       // ✅ Loyalty calculation
  // NO financial fields (cash_in, chips_taken) ❌
}

// PlayerFinancial Service (Finance Domain)
interface PlayerFinancialDTO {
  cash_in: number;      // ✅ Financial ledger
  chips_taken: number;  // ✅ Money tracking
  // NO performance metrics (average_bet, points) ❌
}
```

**Why This Works**:
- Domain separation prevents coupling
- Single responsibility per service
- Aggregation happens at client/action layer (not services)
- Referential integrity via FKs, not object nesting

### 1.3 Technical Debt Assessment

**Low-Risk Debt** (Intentional, manageable):
- Pattern duplication across services (CRUD boilerplate)
  - **Mitigation**: Template scaffolding, code generation (future)
  - **Impact**: LOW - consistency more valuable than DRY here

- Validation schema redundancy (Zod schemas per domain)
  - **Mitigation**: Shared validation factory patterns (when 3+ use cases)
  - **Impact**: LOW - domain-specific rules justify isolation

**No Critical Debt Identified**:
- ✅ Zero class-based anti-patterns
- ✅ Zero global singletons
- ✅ Zero `ReturnType` inference violations
- ✅ Zero `any` type escapes
- ✅ Zero service-to-service direct calls

---

## 2. Risk Assessment Matrix

### 2.1 Vertical Slicing Risks (Pure Feature Directories)

**Scenario**: Restructure services into feature-based directories

```
// Proposed vertical structure
domains/
├── player/
│   ├── create-player/              # Feature slice
│   │   ├── create-player.service.ts
│   │   ├── create-player.action.ts
│   │   ├── create-player.hook.ts
│   │   └── create-player.test.ts
│   ├── update-player/              # Feature slice
│   └── delete-player/              # Feature slice
```

**Risks**:

| Risk | Likelihood | Impact | Severity | Explanation |
|------|-----------|--------|----------|-------------|
| **Duplication of CRUD Logic** | HIGH | MEDIUM | **MEDIUM-HIGH** | Each slice reimplements basic DB access patterns. Violates DRY for shared operations (getById used by multiple slices). |
| **Service Boundary Erosion** | HIGH | HIGH | **HIGH** | No clear "PlayerService" contract - each slice exposes its own mini-service. Makes cross-domain composition unclear. |
| **Discoverability Issues** | MEDIUM | MEDIUM | **MEDIUM** | New developers struggle to find "where does player creation live?" - must navigate nested slice directories. |
| **Testing Fragmentation** | MEDIUM | LOW | **LOW-MEDIUM** | Tests colocated per slice - good for cohesion but harder to run all player tests together. |
| **Migration Disruption** | HIGH | HIGH | **CRITICAL** | Requires restructuring 7 working services (Player, Visit, RatingSlip, PlayerFinancial, Casino, TableContext, MTL). High rework cost for unproven benefit. |
| **Template Velocity Loss** | HIGH | MEDIUM | **MEDIUM-HIGH** | Current 4x velocity from SERVICE_TEMPLATE.md would be invalidated. Need new templates, retrain patterns. |

**Overall Vertical Slicing Risk**: **HIGH** (for current context)

**Why NOT Recommended Now**:
1. **Premature optimization**: No evidence services are too large
2. **Violates working patterns**: 98/98 tests passing with current structure
3. **Migration cost**: 7 services × 2 days rework = 14 days lost velocity
4. **Solo developer context**: Cognitive locality less critical (single person already knows codebase)

---

### 2.2 Horizontal Layering Risks (Current Approach)

**Scenario**: Continue current horizontal service layer, add Action/UI layers

```
// Current + planned structure
services/player/         # ✅ Horizontal service layer
  ├── index.ts           # Service contract
  ├── crud.ts            # CRUD module
  ├── business.ts        # Workflows (future)
  └── queries.ts         # Complex queries (future)

app/actions/player/      # ⏳ Action layer (next)
  ├── create-player-action.ts
  └── update-player-action.ts

hooks/                   # ⏳ UI hooks layer (next)
  ├── use-players.ts
  └── use-create-player.ts
```

**Risks**:

| Risk | Likelihood | Impact | Severity | Explanation |
|------|-----------|--------|----------|-------------|
| **Layer Boundary Violations** | LOW | HIGH | **MEDIUM** | Services might call other services directly. **Mitigation**: ESLint rules + code review already in place. |
| **Over-Engineering Risk** | MEDIUM | MEDIUM | **MEDIUM** | Temptation to create BaseService abstractions. **Mitigation**: PRD explicitly bans classes (vigilance required). |
| **Cross-Cutting Concerns** | LOW | LOW | **LOW** | Logging, validation, error handling already centralized in `services/shared/`. Pattern proven. |
| **Delayed UI Value** | HIGH | MEDIUM | **MEDIUM** | Services exist without UI consumers yet. **Mitigation**: Phase 3 prioritizes vertical completion (Action → UI). |
| **Boilerplate Overhead** | MEDIUM | LOW | **LOW** | More files per feature (action + hook + component). **Mitigation**: Code generation, templates (already working). |

**Overall Horizontal Layering Risk**: **LOW-MEDIUM** (manageable, mitigated)

**Why Recommended**:
1. **Already working**: 7 services, 98 tests, zero PRD violations
2. **Clear contracts**: Explicit interfaces prevent coupling
3. **Template velocity**: 4x improvement sustained
4. **Incremental path**: Add Action/UI layers without rework

---

### 2.3 Hybrid Approach Risks (Horizontal Layers + Vertical Delivery)

**Scenario**: Keep horizontal technical layers, deliver features vertically

```
// Implementation sequence per feature:
1. Service Layer: PlayerService.create() method
2. Action Layer: createPlayerAction() server action
3. Hook Layer: useCreatePlayer() React Query hook
4. UI Layer: <PlayerForm /> component
→ Complete vertical slice: DB → Service → Action → Hook → UI
```

**Risks**:

| Risk | Likelihood | Impact | Severity | Explanation |
|------|-----------|--------|----------|-------------|
| **Architectural Confusion** | MEDIUM | LOW | **LOW-MEDIUM** | Team might think "horizontal" and "vertical" are mutually exclusive. **Mitigation**: Documentation clarifies hybrid model. |
| **Cross-Layer Dependencies** | LOW | MEDIUM | **LOW-MEDIUM** | Action layer might import wrong service methods. **Mitigation**: Explicit service interfaces + type safety. |
| **Testing Strategy Ambiguity** | LOW | LOW | **LOW** | Unclear whether to test layers or slices. **Mitigation**: Pyramid (60% unit, 30% integration, 10% E2E) already defined. |
| **Implementation Drift** | MEDIUM | MEDIUM | **MEDIUM** | Different features might implement differently. **Mitigation**: Template updates + code review standards. |

**Overall Hybrid Approach Risk**: **LOW** (best trade-off)

**Why Recommended**:
1. **Best of both worlds**: Technical clarity + feature delivery
2. **Pragmatic for solo dev**: Horizontal for structure, vertical for progress tracking
3. **Minimal rework**: Extend existing patterns, don't replace
4. **Proven at scale**: Next.js App Router follows this model

---

## 3. Migration Path Comparison

### 3.1 Path A: Continue Current Trajectory (Incremental Refinement)

**Strategy**: Keep horizontal service layer, complete vertical feature delivery to UI

**Implementation Timeline**:

```
Week 1 (Now): Service Layer Completion
├─ Day 1: Finalize MTL Service queries (DONE)
├─ Day 2-3: Add search/query modules to all 7 services
└─ Day 4-5: Integration testing + Phase 2 audit

Week 2-3: Action Layer (Horizontal Addition)
├─ Implement server actions for Player domain (2 days)
├─ Implement server actions for Visit domain (2 days)
├─ Implement server actions for RatingSlip domain (2 days)
├─ Implement server actions for PlayerFinancial domain (1 day)
└─ Action testing + cache strategy validation (1 day)

Week 4-5: UI Layer (Vertical Completion)
├─ React Query hooks + Player UI (3 days)
├─ Visit UI + real-time integration (3 days)
└─ RatingSlip UI + end-to-end testing (2 days)

Week 6: Real-Time Infrastructure (Horizontal Enhancement)
├─ useSupabaseChannel wrapper (1 day)
├─ Batch invalidation scheduler (1 day)
├─ Domain real-time hooks (2 days)
└─ Memory leak testing (1 day)
```

**Pros**:
- ✅ Zero rework of 7 working services
- ✅ Leverages established template velocity (4x)
- ✅ Maintains architectural consistency (explicit interfaces)
- ✅ Incremental risk (add layers, don't replace)
- ✅ Solo developer friendly (no cognitive overload)
- ✅ Clear progression (Phase 2 → Phase 3 → Phase 4)

**Cons**:
- ⚠️ Delayed UI value (services exist without consumers)
  - **Mitigation**: Week 4-5 delivers complete vertical slices
- ⚠️ Potential for layer violations
  - **Mitigation**: ESLint rules + architecture tests

**Overall Risk**: **LOW**

**Effort**: 6 weeks to complete vertical delivery to production UI

**ROI**: **HIGH** - builds on working foundation

---

### 3.2 Path B: Pure Vertical Slicing (Significant Restructure)

**Strategy**: Restructure services into feature directories

**Implementation Timeline**:

```
Week 1-2: Architecture Redesign
├─ Design new vertical directory structure
├─ Create new templates for feature slices
├─ Prototype single feature (player-create) to validate
└─ Document new patterns in VERTICAL-SLICING-BOOTSTRAP.md

Week 3-6: Service Migration (Rework)
├─ Migrate Player service to feature slices (4 days)
├─ Migrate Visit service to feature slices (4 days)
├─ Migrate RatingSlip service to feature slices (4 days)
├─ Migrate PlayerFinancial service to feature slices (3 days)
├─ Migrate Casino service to feature slices (3 days)
├─ Migrate TableContext service to feature slices (3 days)
└─ Migrate MTL service to feature slices (3 days)

Week 7-8: Test Migration + Validation
├─ Migrate 98 tests to new structure
├─ Re-establish test coverage >80%
├─ Fix broken imports across codebase
└─ Update documentation

Week 9-12: Action/UI Layers (Same as Path A)
├─ Implement actions per feature slice
├─ Implement hooks per feature slice
└─ Implement UI per feature slice
```

**Pros**:
- ✅ Feature cohesion (everything for "create player" in one directory)
- ✅ Easier to delete features (entire directory removal)
- ✅ Potential for better isolation (if features are truly independent)

**Cons**:
- ❌ **8 weeks lost velocity** (rework vs new features)
- ❌ Invalidates 98 passing tests (must migrate)
- ❌ Throws away 4x template velocity gains
- ❌ No evidence current services are too large (premature)
- ❌ Duplication of CRUD patterns across feature slices
- ❌ Unclear service boundaries (no PlayerService contract)
- ❌ Solo developer loses structural clarity

**Overall Risk**: **HIGH**

**Effort**: 12 weeks to match current functionality + complete vertical delivery

**ROI**: **LOW** - high cost for unproven benefit

---

### 3.3 Path C: Strict Horizontal Layers (Formalized Structure)

**Strategy**: Formalize 4-layer architecture with strict boundaries

**Implementation Timeline**:

```
Week 1: Layer Formalization
├─ Create LAYER_CONTRACTS.md defining interfaces
├─ Implement withServerActionWrapper() helper
├─ Create shared cache invalidation utilities
└─ Build ESLint rules for layer violations

Week 2-3: Service Layer Enhancement
├─ Add business.ts modules to all services (workflow orchestration)
├─ Add queries.ts modules to all services (complex queries)
├─ Add transforms.ts modules to all services (DTO mapping)
└─ Refactor existing code to match module boundaries

Week 4-6: Action Layer (Same as Path A)
Week 7-9: UI Layer (Same as Path A)
Week 10: Testing & Validation
```

**Pros**:
- ✅ Crystal clear layer responsibilities
- ✅ Easy to enforce with tooling (ESLint, architecture tests)
- ✅ Scales well for multi-developer teams
- ✅ Predictable structure (onboarding easier)

**Cons**:
- ⚠️ Potential over-engineering (creating layers for future, not present need)
- ⚠️ Boilerplate overhead (more files per domain)
- ⚠️ Rigidity (harder to experiment with new patterns)
- ⚠️ Solo developer overkill (formalization less critical)

**Overall Risk**: **MEDIUM**

**Effort**: 10 weeks to complete with formalization overhead

**ROI**: **MEDIUM** - good for team scale, overkill for solo

---

### 3.4 Path D: Hybrid Model (Recommended)

**Strategy**: Horizontal technical layers + vertical feature delivery cadence

**Implementation Timeline**:

```
Week 1: Service Layer Finalization (Same as Path A)
Week 2-3: Action Layer + First Vertical Slice
├─ Implement Player domain actions (2 days)
├─ Implement Player domain hooks (1 day)
├─ Implement Player domain UI (2 days)
└─ DELIVER: Complete Player Management feature (vertical)

Week 4-5: Visit Domain Vertical Slice
├─ Implement Visit domain actions (2 days)
├─ Implement Visit domain hooks (1 day)
├─ Implement Visit domain UI (2 days)
└─ DELIVER: Complete Visit Tracking feature (vertical)

Week 6: RatingSlip Domain Vertical Slice
├─ Implement RatingSlip domain actions (1 day)
├─ Implement RatingSlip domain hooks (1 day)
├─ Implement RatingSlip domain UI (2 days)
└─ DELIVER: Complete Rating Slip Creation feature (vertical)

Week 7: Real-Time Infrastructure (Horizontal)
Week 8: Integration Testing + Production Hardening
```

**Pros**:
- ✅ **Best trade-off**: Technical clarity + feature delivery
- ✅ Zero rework of existing services
- ✅ Delivers working features every 2 weeks (vertical slices)
- ✅ Maintains horizontal consistency (shared infrastructure)
- ✅ Pragmatic for solo developer (structure + progress)
- ✅ Leverages template velocity (4x improvement)
- ✅ Incremental risk (layer by layer, feature by feature)

**Cons**:
- ⚠️ Requires discipline to avoid mixing paradigms
  - **Mitigation**: Documentation + code review checklist
- ⚠️ Potential confusion ("are we horizontal or vertical?")
  - **Mitigation**: "We're both - horizontal for tech, vertical for features"

**Overall Risk**: **LOW**

**Effort**: 8 weeks to complete vertical delivery (includes real-time)

**ROI**: **HIGHEST** - builds on working foundation, delivers incrementally

---

## 4. Decision Criteria Analysis

### 4.1 Time to MVP Delivery

| Path | Weeks to First UI Feature | Weeks to Complete MVP | Winner |
|------|---------------------------|----------------------|---------|
| **Path A** (Current) | 4 weeks | 6 weeks | ✅ |
| **Path B** (Vertical) | 9 weeks | 12 weeks | ❌ |
| **Path C** (Horizontal) | 5 weeks | 10 weeks | ⚠️ |
| **Path D** (Hybrid) | 3 weeks | 8 weeks | ✅✅ |

**Winner**: **Path D** (Hybrid) - fastest to first feature, competitive to MVP

---

### 4.2 Solo Developer Context

| Path | Cognitive Load | Onboarding Complexity | Debugging Ease | Winner |
|------|---------------|----------------------|----------------|---------|
| **Path A** | LOW | MEDIUM | HIGH | ✅ |
| **Path B** | HIGH | HIGH | MEDIUM | ❌ |
| **Path C** | MEDIUM | LOW | HIGH | ⚠️ |
| **Path D** | LOW-MEDIUM | MEDIUM | HIGH | ✅ |

**Winner**: **Path A/D** - both maintain structural clarity

**Solo Developer Considerations**:
- No need for advanced feature isolation (single person knows all code)
- Horizontal layers provide "map" of where to find things
- Vertical delivery tracks progress without nested directories
- Template velocity more valuable than extreme modularity

---

### 4.3 Maintainability & Long-Term Evolution

| Path | Refactorability | Test Isolation | Dependency Management | Winner |
|------|-----------------|---------------|----------------------|---------|
| **Path A** | MEDIUM | HIGH | HIGH | ✅ |
| **Path B** | HIGH | MEDIUM | MEDIUM | ⚠️ |
| **Path C** | HIGH | HIGH | HIGH | ✅✅ |
| **Path D** | HIGH | HIGH | HIGH | ✅✅ |

**Winner**: **Path C/D** - best long-term architecture

**Long-Term Considerations**:
- Service contracts prevent coupling (Path A/D maintain this)
- Clear layer boundaries ease refactoring (Path C/D formalize this)
- Test coverage more important than location (all paths support >80%)

---

### 4.4 Testing & Quality Assurance

| Path | Test Migration Cost | Coverage Maintenance | E2E Complexity | Winner |
|------|---------------------|---------------------|----------------|---------|
| **Path A** | NONE (0 days) | LOW | MEDIUM | ✅✅ |
| **Path B** | HIGH (10 days) | MEDIUM | LOW | ❌ |
| **Path C** | LOW (2 days) | LOW | MEDIUM | ✅ |
| **Path D** | NONE (0 days) | LOW | MEDIUM | ✅✅ |

**Winner**: **Path A/D** - zero rework, maintains 98/98 tests

**Testing Pyramid Compatibility**:
- All paths support 60% unit, 30% integration, 10% E2E
- Horizontal layers make layer-specific mocking easier
- Vertical slices make E2E test organization clearer
- Hybrid gets both benefits

---

### 4.5 Onboarding Complexity (Future Team Growth)

| Path | Documentation Burden | Pattern Consistency | Discoverability | Winner |
|------|---------------------|---------------------|----------------|---------|
| **Path A** | MEDIUM | HIGH | MEDIUM | ✅ |
| **Path B** | HIGH | MEDIUM | LOW | ❌ |
| **Path C** | LOW | HIGH | HIGH | ✅✅ |
| **Path D** | MEDIUM | HIGH | HIGH | ✅ |

**Winner**: **Path C** - most predictable structure

**Onboarding Scenarios**:
- "Where is player creation logic?"
  - Path A: `services/player/crud.ts` → `app/actions/player/create-player-action.ts`
  - Path B: `domains/player/create-player/create-player.service.ts` (many slices to search)
  - Path C: Same as Path A with stricter contracts
  - Path D: Same as Path A with vertical delivery docs

---

## 5. Pragmatic Recommendation

### 5.1 Selected Path: **Path D (Hybrid Model)**

**Rationale**:
1. **Builds on Working Foundation**: 7 services, 98 tests, zero PRD violations
2. **Fastest to Value**: First UI feature in 3 weeks (Player Management)
3. **Lowest Risk**: Incremental additions, no rework
4. **Solo Developer Friendly**: Horizontal structure + vertical progress tracking
5. **Template Velocity Preserved**: Leverages 4x improvement gains
6. **Best ROI**: 8 weeks to complete MVP vs 12 weeks (Path B) or 10 weeks (Path C)

**Implementation Principle**:
> "Horizontal layers for **technical architecture**, vertical slices for **feature delivery**"

**Architecture**:
```
Technical Layers (Horizontal):
- Data Layer: Schema, RLS, migrations
- Service Layer: Business logic, DTOs, validation
- Action Layer: Server actions, cache strategies
- UI Layer: Components, hooks, state

Delivery Cadence (Vertical):
- Week 1: Complete Player feature (DB → Service → Action → Hook → UI)
- Week 2: Complete Visit feature (DB → Service → Action → Hook → UI)
- Week 3: Complete RatingSlip feature (DB → Service → Action → Hook → UI)
```

---

### 5.2 Phased Implementation Plan

**Phase 2 Completion** (Week 1 - Current):
```
✅ DONE: 7/8 services implemented with explicit interfaces
✅ DONE: 98/98 tests passing with >80% coverage
✅ DONE: Bounded context integrity (Service Responsibility Matrix)
✅ DONE: Root-level test standardization

⏳ IN PROGRESS: MTL Service queries (CTR aggregation)
□ TODO: Search/query modules for all 7 services (Days 2-3)
□ TODO: Integration testing + Phase 2 audit (Days 4-5)
```

**Phase 3: Action Layer + First Vertical Slice** (Weeks 2-3):
```
Week 2: Player Domain Vertical Slice
├─ Day 1: Server actions (create, update, delete player)
├─ Day 2: React Query hooks (usePlayers, useCreatePlayer)
├─ Day 3-4: UI components (PlayerList, PlayerForm)
└─ Day 5: E2E tests + demo

DELIVERABLE: Working Player Management UI
```

**Phase 3: Visit Domain Vertical Slice** (Weeks 3-4):
```
Week 3-4: Visit Domain Vertical Slice
├─ Day 1-2: Server actions (start, end, cancel visit)
├─ Day 3: React Query hooks (useVisits, useStartVisit)
├─ Day 4-5: UI components (VisitList, VisitForm, VisitDetail)
└─ Day 6: E2E tests + demo

DELIVERABLE: Working Visit Tracking UI
```

**Phase 3: RatingSlip Domain Vertical Slice** (Week 5):
```
Week 5: RatingSlip Domain Vertical Slice
├─ Day 1: Server actions (create, update rating slip)
├─ Day 2: React Query hooks (useRatingSlips, useCreateRatingSlip)
├─ Day 3-4: UI components (RatingSlipForm, RatingSlipList)
└─ Day 5: E2E tests + demo

DELIVERABLE: Working Rating Slip Creation UI
```

**Phase 4: Real-Time Infrastructure** (Week 6):
```
Week 6: Real-Time Infrastructure (Horizontal Enhancement)
├─ Day 1: useSupabaseChannel wrapper hook
├─ Day 2: Batch invalidation scheduler
├─ Day 3-4: Domain real-time hooks (usePlayersRealtime, useVisitsRealtime)
└─ Day 5: Memory leak testing + multi-tab sync validation

DELIVERABLE: Real-time UI synchronization
```

**Phase 5: Production Hardening** (Week 7-8):
```
Week 7-8: Integration Testing + Performance
├─ Cross-domain workflows (Visit → RatingSlip → MTL)
├─ Bundle analysis + code splitting
├─ Lighthouse CI gates (LCP ≤2.5s, TBT ≤200ms)
├─ RLS policy audit
└─ Deployment automation

DELIVERABLE: Production-ready MVP
```

---

### 5.3 Rollback Strategies

**Risk Mitigation at Each Phase**:

**Phase 3 Rollback** (if Action layer fails):
- **Trigger**: Action layer patterns don't scale, cache invalidation issues
- **Strategy**:
  1. Keep service layer as-is (working foundation)
  2. Revert to Server Components with direct service calls (temporary)
  3. Re-evaluate action wrapper patterns
  4. Time cost: 2 days to stabilize
- **Safeguard**: Commit each layer separately (service → action → hook → UI)

**UI Layer Rollback** (if React Query integration fails):
- **Trigger**: Performance issues, state management complexity
- **Strategy**:
  1. Fall back to SWR or Zustand + server actions
  2. Service layer unaffected (contract stays same)
  3. Action layer unaffected (server actions still callable)
  4. Time cost: 3 days to migrate state management
- **Safeguard**: Wrap React Query in custom hooks (abstraction layer)

**Real-Time Rollback** (if memory leaks persist):
- **Trigger**: Memory leaks, connection instability
- **Strategy**:
  1. Disable real-time hooks (use polling instead)
  2. Manual refresh button for users
  3. Service/Action/UI layers unaffected
  4. Time cost: 1 day to add polling fallback
- **Safeguard**: Real-time as progressive enhancement, not core dependency

**Complete Path Abandonment** (worst case):
- **Trigger**: Fundamental architecture flaw discovered
- **Strategy**:
  1. Service layer + tests remain stable (7 services, 98 tests)
  2. Re-evaluate at Action layer (Path C strict horizontal instead)
  3. No rework of foundational services
  4. Time cost: 5 days to redesign Action/UI approach
- **Safeguard**: Service layer independence (no Action/UI coupling)

---

### 5.4 Success Metrics

**Phase 2 Completion Metrics** (Week 1):
- ✅ 7/7 services complete with explicit interfaces
- ✅ 110+ tests passing (added search/query tests)
- ✅ Test coverage >80% per service
- ✅ Zero PRD violations (ESLint + manual audit)
- ✅ Documentation complete (SESSION_HANDOFF.md updated)

**Phase 3 Delivery Metrics** (Weeks 2-5):
- ✅ 3 complete vertical slices delivered (Player, Visit, RatingSlip)
- ✅ Working UI for each domain (interactive, tested)
- ✅ E2E tests passing for critical user flows
- ✅ Server actions with <500ms p95 latency
- ✅ React Query cache hit rate >70%

**Phase 4 Real-Time Metrics** (Week 6):
- ✅ Real-time updates <1s latency (PostgreSQL event → UI)
- ✅ Zero memory leaks (cleanup verified)
- ✅ Multi-tab synchronization working
- ✅ Subscription lifecycle clean (no orphaned channels)

**Phase 5 Production Metrics** (Weeks 7-8):
- ✅ Lighthouse scores: LCP ≤2.5s, TBT ≤200ms, Initial JS ≤250KB
- ✅ Zero security advisor warnings (Supabase RLS audit)
- ✅ Deployment pipeline automated (migrations + type generation)
- ✅ Health check endpoints operational
- ✅ Structured logging + telemetry in place

---

## 6. Architectural Decision Justification

### 6.1 Why NOT Pure Vertical Slicing (Path B)

**Evidence Against**:
1. **No pain point**: Current services are NOT too large
   - PlayerService: 1 file (index.ts) + 1 CRUD module (crud.ts)
   - MTLService: 1 file (index.ts) + 2 modules (crud.ts, queries.ts)
   - Complexity manageable at this scale

2. **Duplication cost**: CRUD patterns would be reimplemented per feature
   - `getById()` needed by create, update, delete slices → DRY violation
   - Shared error handling (`executeOperation`) harder to centralize

3. **Migration cost**: 8 weeks rework vs 0 weeks incremental addition
   - 7 services × 2 days migration = 14 days lost
   - 98 tests require restructure and re-verification
   - Template velocity gains invalidated

4. **Premature optimization**: "Feature slice per operation" assumes:
   - Features will grow complex enough to justify isolation (not evident)
   - Solo developer benefits from extreme modularity (cognitive load actually increases)
   - Cross-feature reuse will be rare (contradicts CRUD sharing)

**When to Reconsider Vertical Slicing**:
- Service files exceed 500 lines (current: <200 lines each)
- More than 5 modules per service (current: 1-2 modules)
- Team size >3 developers (current: solo)
- Feature independence validated (current: CRUD shared heavily)

---

### 6.2 Why NOT Strict Horizontal Layers (Path C)

**Evidence Against**:
1. **Over-engineering risk**: Solo developer doesn't need rigid formalization
   - ESLint layer rules: overhead without team enforcement value
   - Strict module boundaries: cognitive overhead for single person
   - Documentation burden: maintaining LAYER_CONTRACTS.md premature

2. **Rigidity cost**: Harder to experiment with new patterns
   - Want to try optimistic updates? Must fit strict layer model
   - Want to add real-time? Must formalize real-time layer contracts
   - Innovation slowed by compliance overhead

3. **Boilerplate proliferation**: More files for theoretical future value
   - Every service requires business.ts, queries.ts, transforms.ts (even if empty)
   - Action layer requires wrapper modules for each domain
   - UI layer requires strict separation of hooks/components

4. **YAGNI violation**: Building for 10-person team when solo
   - Layer contracts useful when 5+ developers need coordination
   - Current: 1 developer already knows all layers
   - Premature formalization = maintenance debt

**When to Reconsider Strict Layering**:
- Team size >3 developers
- Onboarding happening frequently (>1 person/month)
- Layer violations occurring in code review (current: zero violations)
- Technical debt accumulating from ad-hoc patterns (current: clean)

---

### 6.3 Why Hybrid (Path D) is Optimal

**Evidence For**:
1. **Preserves working patterns**:
   - Service layer: ✅ 7 services, 98 tests, zero violations
   - Template velocity: ✅ 4x improvement sustained
   - Bounded contexts: ✅ Service Responsibility Matrix enforced

2. **Incremental risk**:
   - Add Action layer (1 week) → validate before proceeding
   - Add UI hooks (1 week) → validate before next domain
   - Add real-time (1 week) → optional progressive enhancement
   - Each addition isolated, can be rolled back independently

3. **Vertical progress tracking**:
   - Week 2: "Player Management feature complete" (visible progress)
   - Week 4: "Visit Tracking feature complete" (user value delivered)
   - Week 5: "Rating Slip Creation feature complete" (MVP nearing)
   - Stakeholder-friendly milestones vs "Service layer 90% done"

4. **Solo developer pragmatism**:
   - Horizontal layers: mental map of where things are
   - Vertical delivery: progress tracking and motivation
   - Best of both: structure + momentum

5. **Proven at scale**:
   - Next.js App Router: horizontal (app/, components/, lib/) + vertical (feature routes)
   - Rails: horizontal (models/, controllers/, views/) + vertical (resource scaffolding)
   - Django: horizontal (apps/) + vertical (admin, views, models per app)

**Hybrid Model in Practice**:
```
// Horizontal: Where is player logic?
services/player/        # Business logic
app/actions/player/     # Server orchestration
hooks/                  # React Query wrappers
components/player/      # UI components

// Vertical: How do I deliver "Create Player"?
1. services/player/crud.ts → create() method
2. app/actions/player/create-player-action.ts → server action
3. hooks/use-create-player.ts → React Query mutation
4. components/player-form.tsx → UI form
→ Feature complete: DB → UI
```

---

## 7. Monitoring & Adaptation

### 7.1 Health Indicators (Track Weekly)

**Service Layer Health**:
- Test pass rate: Target 100% (current: 100%, 98/98)
- Test coverage: Target >80% (current: >80% per service)
- PRD violations: Target 0 (current: 0)
- Service file size: Alert if >500 lines (current: <200 lines)
- Module count per service: Alert if >5 (current: 1-2)

**Action Layer Health** (Phase 3):
- Action response time: Target <500ms p95
- Cache hit rate: Target >70%
- Error rate: Target <1%
- revalidatePath calls: Monitor for over-invalidation

**UI Layer Health** (Phase 3-4):
- React Query cache size: Monitor for memory leaks
- Component render count: Alert if >10 renders/interaction
- Real-time message rate: Monitor for storm conditions
- Subscription cleanup: Alert on orphaned channels

**Architecture Drift Indicators**:
- Service-to-service calls: Target 0 (ban pattern)
- Layer boundary violations: Target 0 (ESLint enforcement)
- `any` type usage: Target 0 in services (current: 0)
- Global singletons: Target 0 (current: 0)

### 7.2 Adaptation Triggers

**Trigger 1: Service Complexity Exceeds Threshold**
- **Condition**: Any service file >500 lines OR >5 modules
- **Action**: Evaluate feature-based slicing for THAT service only
- **Example**: If PlayerService grows to 10 operations, split to player/auth/, player/profile/, player/search/

**Trigger 2: Team Growth**
- **Condition**: Team size >3 developers
- **Action**: Formalize layer contracts (Path C enhancements)
- **Impact**: Add ESLint rules, LAYER_CONTRACTS.md, stricter reviews

**Trigger 3: Cross-Domain Complexity**
- **Condition**: >3 services needed to fulfill single user action
- **Action**: Introduce orchestration layer or workflow module
- **Example**: "Start Visit" needs Player + Visit + RatingSlip + MTL → visitWorkflows.startSession()

**Trigger 4: Performance Degradation**
- **Condition**: Action response time >500ms p95 OR UI initial load >3s
- **Action**: Evaluate caching strategy, optimize queries, code splitting
- **Impact**: May require query module optimization or real-time reduction

**Trigger 5: Testing Becomes Expensive**
- **Condition**: Test suite >10 minutes OR test maintenance >20% of dev time
- **Action**: Re-evaluate testing pyramid, add integration tests, reduce unit test duplication
- **Impact**: May shift from 60% unit to 40% unit + 40% integration

---

## 8. Final Recommendation Summary

**Selected Path**: **Path D (Hybrid Model) - Horizontal Layers + Vertical Delivery**

**Immediate Next Steps** (Week 1):
1. ✅ Complete MTL Service queries (DONE - Day 6)
2. □ Add search/query modules to all 7 services (Days 2-3)
3. □ Integration testing + Phase 2 audit (Days 4-5)
4. □ Update SESSION_HANDOFF.md with Phase 2 completion status
5. □ Document hybrid model in ARCHITECTURE_DECISION.md

**First Vertical Slice** (Weeks 2-3):
1. Implement Player domain actions (2 days)
2. Implement Player domain hooks (1 day)
3. Implement Player domain UI (2 days)
4. E2E tests + demo (1 day)
5. **DELIVER**: Working Player Management feature

**Success Criteria**:
- Week 3: First UI feature operational (Player Management)
- Week 5: Second UI feature operational (Visit Tracking)
- Week 6: Third UI feature operational (Rating Slip Creation)
- Week 7: Real-time synchronization working
- Week 8: Production-ready MVP

**Risk Mitigation**:
- Each layer added incrementally (rollback points)
- Service layer stays stable (zero rework)
- Template velocity preserved (4x improvement)
- Test coverage maintained (>80%)

**Long-Term Adaptability**:
- Monitor service complexity (>500 lines triggers re-evaluation)
- Track team growth (>3 devs triggers formalization)
- Measure performance (>500ms p95 triggers optimization)
- Review architecture quarterly (adapt as needed)

---

**Document Version**: 1.0
**Author**: Architecture Team
**Status**: Approved for Implementation
**Next Review**: End of Phase 3 (Week 5)

---

## Appendix A: Risk Matrix Summary

| Approach | Overall Risk | Time to MVP | Solo Dev Fit | ROI | Recommendation |
|----------|-------------|-------------|--------------|-----|----------------|
| **Path A** (Current Trajectory) | LOW | 6 weeks | HIGH | HIGH | ⭐ Fallback |
| **Path B** (Pure Vertical) | HIGH | 12 weeks | LOW | LOW | ❌ Not Recommended |
| **Path C** (Strict Horizontal) | MEDIUM | 10 weeks | MEDIUM | MEDIUM | ⚠️ Team Growth Path |
| **Path D** (Hybrid) | LOW | 8 weeks | HIGH | HIGHEST | ✅ **RECOMMENDED** |

---

## Appendix B: Decision Tree

```
START: "Should I restructure services?"
│
├─ Is current architecture causing pain? (tests failing, coupling issues)
│  ├─ YES → Evaluate Path B (vertical slicing) for problematic service only
│  └─ NO → Continue with Path D (hybrid)
│
├─ Is team size >3 developers?
│  ├─ YES → Add Path C enhancements (formalize layers)
│  └─ NO → Continue with Path D (hybrid)
│
├─ Is time to MVP critical (<8 weeks)?
│  ├─ YES → Path D (hybrid) REQUIRED
│  └─ NO → Path C (strict horizontal) acceptable
│
└─ Is solo developer context?
   ├─ YES → Path D (hybrid) or Path A (current) optimal
   └─ NO → Re-evaluate team-oriented patterns
```

---

**Conclusion**: PT-2's current horizontal service layer is **NOT a problem to solve** - it's a **foundation to build upon**. The hybrid model (Path D) delivers the fastest time to value while maintaining architectural integrity and preserving established velocity gains.
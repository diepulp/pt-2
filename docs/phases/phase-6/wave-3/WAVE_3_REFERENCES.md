# Phase 6 Wave 3 - Essential Documentation Reference

**Purpose**: Quick reference guide for Wave 3 implementation team
**Status**: Ready for kickoff
**Date**: October 14, 2025

---

## 🚀 Start Here (Must Read - 30 min)

### 1. Wave 3 Kickoff Document
**File**: `docs/phases/phase-6/wave-3/WAVE_3_KICKOFF.md`
**Purpose**: Complete Wave 3 execution plan
**Contains**:
- Executive summary and objectives
- API contracts with usage examples
- Track breakdown (Integration Tests, Permission Service, MTL UI)
- 16 quality gates
- Timeline and parallel execution strategy

**Action**: Read this document first to understand Wave 3 scope and priorities

---

### 2. Wave 2 Completion Signoff
**File**: `docs/phases/phase-6/wave-2/WAVE_2_COMPLETION_SIGNOFF.md`
**Purpose**: Understand what was delivered in Wave 2
**Contains**:
- Schema hardening details (6 audit columns, 2 indexes)
- Infrastructure libraries (correlation, idempotency, rate-limiter, telemetry)
- Server actions (completeRatingSlip, recoverSlipLoyalty, manualReward)
- ADR-001: Direct service invocation rationale
- 13/13 quality gates passed
- API contracts and handoff details

**Action**: Read to understand available APIs and infrastructure

---

### 3. Wave 2 Simplified Workflow
**File**: `docs/phases/phase-6/wave-2/WAVE_2_SIMPLIFIED_WORKFLOW.md`
**Purpose**: Architecture decisions and patterns
**Contains**:
- ADR-001 justification (direct invocation vs event bus)
- Saga recovery pattern explanation
- Idempotency strategy
- Extension path to event bus (when 2nd consumer needed)

**Action**: Read §9 "When to Re-Introduce Deferred Components" if adding new features

---

## 📋 Planning & Checklists (Reference as needed)

### 4. Developer Checklist
**File**: `docs/phases/phase-6/PHASE_6_DEVELOPER_CHECKLIST.md`
**Purpose**: Detailed task breakdown with acceptance criteria
**Contains**:
- Wave 0-2 completion status (reference for context)
- Wave 3 section (lines 477-666):
  - Track 0: Integration Testing (8 tests required)
  - Track 1: RatingSlip UI
  - Track 2: MTL UI
  - Track 3: E2E Testing
- Quality gates summary (31 total gates)
- Parallel execution strategy

**Action**: Use Wave 3 section as detailed task checklist

---

### 5. Implementation Plan v3
**File**: `docs/phases/phase-6/PHASE_6_IMPLEMENTATION_PLAN_v3.md`
**Purpose**: High-level phase overview
**Contains**:
- Wave 1-2 completion summary
- Wave 3 deliverables overview
- Testing & monitoring strategy
- Definition of done

**Action**: Reference for overall Phase 6 context

---

## 🔧 Technical Reference (Keep open during implementation)

### 6. Loyalty Service API
**Files**:
- `services/loyalty/index.ts` - Service interface
- `services/loyalty/business.ts` - Calculation logic
- `services/loyalty/crud.ts` - Database operations
- `services/loyalty/queries.ts` - Read operations

**Purpose**: Understanding Loyalty service capabilities
**Contains**:
- `calculatePoints()` - Pure calculation function
- `accruePoints()` - Full workflow (calculate + write + RPC)
- `createLedgerEntry()` - Idempotent ledger writes
- Type definitions for all DTOs

**Action**: Reference when writing integration tests or UI code

---

### 7. Server Actions (Wave 2 Deliverables)
**Files**:
- `app/actions/ratingslip-actions.ts` (456 LOC)
- `app/actions/loyalty-actions.ts` (293 LOC)

**Purpose**: Available actions for Wave 3 testing/integration
**Key Functions**:
```typescript
// RatingSlip Actions
completeRatingSlip(slipId: string): Promise<ServiceResult<RatingSlipCompletionResult>>
recoverSlipLoyalty(slipId: string, correlationId: string): Promise<ServiceResult<AccruePointsResult>>

// Loyalty Actions
manualReward(input: ManualRewardInput): Promise<ServiceResult<AccruePointsResult>>
```

**Action**: Import these in integration tests and UI components

---

### 8. Infrastructure Libraries
**Files**:
- `lib/correlation.ts` (92 LOC) - Request correlation tracking
- `lib/idempotency.ts` (113 LOC) - Deterministic key generation
- `lib/rate-limiter.ts` (166 LOC) - 10 req/min enforcement
- `lib/telemetry/emit-telemetry.ts` (99 LOC) - Structured logging

**Purpose**: Reusable infrastructure for Wave 3 features
**Key Functions**:
```typescript
// Correlation
runWithCorrelation<T>(fn: () => Promise<T>): Promise<T>
getCorrelationId(): string | undefined

// Idempotency
generateIdempotencyKey(params: IdempotencyParams): string

// Rate Limiting
checkRateLimit(identifier: string, limit?: number, windowMs?: number): Promise<RateLimitResult>

// Telemetry
emitTelemetry(event: TelemetryEvent): void
```

**Action**: Use these in new server actions or features

---

### 9. Database Schema
**Files**:
- `supabase/migrations/20251013233420_wave_2_schema_hardening.sql`
- `types/database.types.ts` (auto-generated)

**Purpose**: Understanding loyalty_ledger schema
**Key Tables**:
- `loyalty_ledger` - 17 columns (11 base + 6 audit)
  - Audit: staff_id, balance_before/after, tier_before/after, correlation_id
  - Indexes: correlation, staff, session idempotency
- `player_loyalty` - Current balance + tier tracking
- `loyalty_tier` - Tier thresholds and multipliers

**Key RPC**:
```sql
increment_player_loyalty(p_player_id UUID, p_delta_points INTEGER)
  RETURNS TABLE (11 columns including before/after snapshots)
```

**Action**: Reference when writing database queries or tests

---

## 🧪 Testing Patterns (Essential for Track 0)

### 10. Existing Test Suites (Patterns to Follow)
**Files**:
- `__tests__/services/loyalty/business.test.ts` (22/22 passing)
- `__tests__/services/loyalty/crud.test.ts` (13/16 passing)
- `__tests__/services/loyalty/rpc.test.ts` (12/12 passing)
- `__tests__/lib/correlation.test.ts` (9/9 passing)
- `__tests__/lib/idempotency.test.ts` (13/13 passing)
- `__tests__/lib/rate-limiter.test.ts` (12/12 passing)
- `__tests__/actions/loyalty-actions.test.ts` (7/7 passing)

**Purpose**: Test pattern examples for Wave 3
**Test Patterns Used**:
- Mock Supabase client with jest.fn()
- ServiceResult validation
- Idempotency verification (duplicate calls)
- Error handling scenarios
- Edge case coverage

**Action**: Follow these patterns when writing integration tests

---

### 11. Phase 4-5 E2E Test Examples
**Files**:
- `__tests__/e2e/player-management-integration.test.ts` (22 tests)
- `__tests__/e2e/visit-management-integration.test.ts` (26 tests)

**Purpose**: E2E test pattern reference
**Proven Patterns**:
- Create workflow (5 tests)
- Read workflow (4-7 tests)
- Update workflow (3-4 tests)
- Delete workflow (3 tests)
- Complete lifecycle (1 test)
- Performance benchmarks (2 tests)

**Action**: Adapt these patterns for RatingSlip + Loyalty E2E tests

---

## 📐 Architecture Standards (Compliance required)

### 12. PT-2 Architecture Standards
**File**: `.claude/CLAUDE.md` (project root)
**Purpose**: Coding standards enforcement
**Critical Standards**:
- Functional factories (no classes)
- Explicit interfaces (ban `ReturnType`)
- Type `supabase` as `SupabaseClient<Database>` (never `any`)
- No global singletons
- Single source types: `types/database.types.ts`
- No `console.*` in production
- No `as any` casting

**Action**: Review before writing any code

---

### 13. Service Layer Architecture
**File**: `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
**Purpose**: Service layer design patterns
**Contains**:
- ServiceResult pattern
- Error handling conventions
- Operation wrapper pattern
- Separation of concerns (business vs CRUD vs queries)

**Action**: Follow patterns when creating new services

---

### 14. Service Responsibility Matrix
**File**: `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`
**Purpose**: Bounded context integrity
**Contains**:
- Domain ownership rules
- Cross-service communication patterns
- Data flow diagrams

**Action**: Verify MTL doesn't violate Loyalty boundaries (read-only access)

---

### 15. State Management Strategy (ADR-003)
**File**: `docs/adr/ADR-003-state-management-strategy.md`
**Purpose**: React Query and cache management
**Contains**:
- Query key patterns: `[domain, entity, identifier]`
- Cache invalidation strategies (3 proven patterns)
- Zustand usage boundaries
- Mutation patterns

**Action**: Follow when implementing MTL hooks and mutations

---

### 16. Balanced Architecture Quick Reference
**File**: `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`
**Purpose**: HORIZONTAL vs VERTICAL decision framework
**Contains**:
- When to use each approach
- Hybrid pattern guidance (used in Wave 2)
- Proven efficiency metrics

**Action**: Reference if scope changes require architectural decisions

---

## 🔐 Security & Compliance

### 17. Integrity Framework
**File**: `docs/integrity/INTEGRITY_FRAMEWORK.md`
**Purpose**: Automated guardrails and enforcement
**Contains**:
- Schema verification requirements
- Type generation workflow
- Pre-commit hooks
- Migration naming standards

**Action**: Follow when creating migrations or modifying schema

---

### 18. Migration Naming Standard
**File**: `docs/patterns/MIGRATION_NAMING_STANDARD.md`
**Purpose**: Timestamp-based migration file naming
**Standard**: `YYYYMMDDHHMMSS_description.sql`
**Command**: `date +"%Y%m%d%H%M%S"`

**Action**: Use this format if creating any Wave 3 migrations

---

## 📊 Progress Tracking

### 19. Architecture Gaps Document
**File**: `docs/roadmap/ARCHITECTURE_GAPS.md`
**Purpose**: MVP progress tracking
**Current Status**:
- 70% MVP complete
- Phase 6 Waves 1-2 complete
- Service layer: 100% complete (8/8)
- Server actions: 75% complete
- 101/101 quality gates passed

**Action**: Update after Wave 3 completion

---

### 20. MVP Production Roadmap
**File**: `docs/roadmap/MVP_PRODUCTION_ROADMAP.md`
**Purpose**: Overall MVP timeline
**Contains**:
- Phase 0-8 overview
- Remaining work estimates
- Risk assessment

**Action**: Reference for context on MVP goals

---

## 🎯 Wave 3 Quick Start (Recommended Reading Order)

### For Integration Testing (Track 0 - Start Here)
1. ✅ **WAVE_3_KICKOFF.md** - Task 3.0.1 section (8-test suite requirements)
2. ✅ **WAVE_2_COMPLETION_SIGNOFF.md** - Appendix C (API usage examples)
3. ✅ **ratingslip-actions.ts** + **loyalty-actions.ts** - Source code review
4. ✅ Existing test suites (`__tests__/services/loyalty/`, `__tests__/actions/`) - Pattern reference
5. ✅ **PHASE_6_DEVELOPER_CHECKLIST.md** - Task 3.3.1 (E2E test patterns)

### For Permission Service Integration (Track 1)
1. ✅ **WAVE_3_KICKOFF.md** - Task 3.1.1 section
2. ✅ **loyalty-actions.ts** - Current placeholder implementation
3. ✅ **SERVICE_RESPONSIBILITY_MATRIX.md** - Permission boundaries
4. ✅ Database schema - `staff_permissions` table structure

### For MTL UI Implementation (Track 2)
1. ✅ **WAVE_3_KICKOFF.md** - Tasks 3.2.1-3.2.3 sections
2. ✅ **ADR-003-state-management-strategy.md** - React Query patterns
3. ✅ **player-management-integration.test.ts** - UI test patterns (Phase 4 reference)
4. ✅ **CLAUDE.md** - Architecture standards (no classes, explicit interfaces)

---

## 🔗 File Paths Quick Reference

```
Project Root: /home/diepulp/projects/pt-2/

Wave 3 Docs:
├── docs/phases/phase-6/wave-3/
│   ├── WAVE_3_KICKOFF.md ⭐ START HERE
│   └── WAVE_3_REFERENCES.md (this document)

Wave 2 Reference:
├── docs/phases/phase-6/wave-2/
│   ├── WAVE_2_COMPLETION_SIGNOFF.md ⭐ HANDOFF
│   └── WAVE_2_SIMPLIFIED_WORKFLOW.md

Planning:
├── docs/phases/phase-6/
│   ├── PHASE_6_DEVELOPER_CHECKLIST.md
│   └── PHASE_6_IMPLEMENTATION_PLAN_v3.md

Source Code (Wave 2 Deliverables):
├── app/actions/
│   ├── ratingslip-actions.ts (456 LOC)
│   └── loyalty-actions.ts (293 LOC)
├── services/loyalty/
│   ├── index.ts
│   ├── business.ts
│   ├── crud.ts
│   └── queries.ts
├── lib/
│   ├── correlation.ts
│   ├── idempotency.ts
│   ├── rate-limiter.ts
│   └── telemetry/emit-telemetry.ts

Tests (Patterns to Follow):
├── __tests__/
│   ├── services/loyalty/ (47 tests passing)
│   ├── lib/ (34 tests passing)
│   ├── actions/ (7 tests passing)
│   └── e2e/ (Phase 4-5 examples)

Schema:
├── supabase/migrations/
│   └── 20251013233420_wave_2_schema_hardening.sql
├── types/
│   └── database.types.ts (auto-generated)

Standards:
├── .claude/CLAUDE.md (PT-2 standards)
├── docs/system-prd/
│   ├── SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md
│   └── CANONICAL_BLUEPRINT_MVP_PRD.md
├── docs/patterns/
│   ├── SERVICE_RESPONSIBILITY_MATRIX.md
│   ├── BALANCED_ARCHITECTURE_QUICK.md
│   └── MIGRATION_NAMING_STANDARD.md
├── docs/adr/
│   └── ADR-003-state-management-strategy.md
├── docs/integrity/
│   └── INTEGRITY_FRAMEWORK.md

Progress:
├── docs/roadmap/
│   ├── ARCHITECTURE_GAPS.md
│   └── MVP_PRODUCTION_ROADMAP.md
```

---

## ✅ Pre-Implementation Checklist

Before starting Wave 3 implementation:

- [ ] Read WAVE_3_KICKOFF.md (30 min)
- [ ] Read WAVE_2_COMPLETION_SIGNOFF.md (20 min)
- [ ] Review ratingslip-actions.ts source code (15 min)
- [ ] Review loyalty-actions.ts source code (15 min)
- [ ] Review existing test patterns (20 min)
- [ ] Verify local environment setup:
  - [ ] Supabase local instance running
  - [ ] Latest migrations applied: `npx supabase migration up`
  - [ ] Types generated: `npm run db:types`
  - [ ] Tests passing: `npm test`
- [ ] Create integration test file: `__tests__/integration/ratingslip-loyalty.test.ts`
- [ ] Set up parallel tracks (if multiple developers):
  - [ ] Track 0: Integration Tests (Priority: HIGH)
  - [ ] Track 1: Permission Service (Independent)
  - [ ] Track 2: MTL UI (Independent)

---

## 📞 Support Resources

### Questions About Architecture Decisions
- Review: WAVE_2_SIMPLIFIED_WORKFLOW.md §9
- Review: BALANCED_ARCHITECTURE_QUICK.md

### Questions About Loyalty Service
- Source: services/loyalty/index.ts (interface definitions)
- Tests: __tests__/services/loyalty/*.test.ts (usage examples)
- Signoff: WAVE_2_COMPLETION_SIGNOFF.md (API contracts)

### Questions About Testing Patterns
- Phase 4-5 E2E tests (proven patterns)
- Wave 2 unit tests (41/41 passing examples)
- PHASE_6_DEVELOPER_CHECKLIST.md Task 3.3.1

### Questions About Standards Compliance
- .claude/CLAUDE.md (PT-2 standards)
- SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md
- INTEGRITY_FRAMEWORK.md

---

**Document Status**: ✅ Ready for Wave 3 Kickoff
**Last Updated**: 2025-10-14
**Next Review**: After Wave 3 completion

**Ready to start Wave 3? Begin with WAVE_3_KICKOFF.md and follow the recommended reading order above! 🚀**

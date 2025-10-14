# Phase 6 Wave 3 - Kickoff Document

**Project**: PT-2 Loyalty System Integration
**Phase**: Phase 6 - Loyalty Points Integration
**Wave**: Wave 3 - Integration Testing + MTL UI
**Date**: October 14, 2025
**Status**: 🚀 **READY TO START**

---

## Executive Summary

Wave 3 focuses on comprehensive integration testing (HIGH PRIORITY - deferred from Wave 2) and MTL UI implementation. Wave 2 delivered production-ready APIs using a simplified direct service invocation pattern, enabling immediate Wave 3 start.

**Prerequisites**: ✅ **ALL MET** - Wave 2 APIs functional, schema hardened, infrastructure complete

**Key Changes from Original Plan**:
- Integration tests elevated to Track 0 (HIGH PRIORITY - moved from Wave 2)
- Architecture uses direct service invocation (not event bus per ADR-001)
- Permission service integration added as explicit task

---

## Wave 2 Handoff Summary

### What Was Delivered ✅

**Architecture**: Direct Service Invocation Pattern (ADR-001)
- Server actions orchestrate RatingSlip closure → Loyalty accrual synchronously
- 40% complexity reduction vs event-driven approach
- Extension path to event bus documented (2h effort when needed)

**Schema Hardening**:
- Migration: `20251013233420_wave_2_schema_hardening.sql`
- 6 audit columns added to loyalty_ledger (staff_id, balance_before/after, tier_before/after, correlation_id)
- 2 indexes created (correlation, staff audit)
- RPC enhanced to return 11 columns (before/after snapshots)

**Infrastructure Libraries** (1,500 LOC):
- `lib/correlation.ts` (92 LOC) - Request correlation tracking
- `lib/idempotency.ts` (113 LOC) - Deterministic key generation
- `lib/rate-limiter.ts` (166 LOC) - 10 req/min enforcement
- `lib/telemetry/emit-telemetry.ts` (99 LOC) - Structured logging

**Server Actions** (749 LOC):
- `app/actions/ratingslip-actions.ts` (456 LOC)
  - `completeRatingSlip(slipId)`
  - `recoverSlipLoyalty(slipId, correlationId)`
- `app/actions/loyalty-actions.ts` (293 LOC)
  - `manualReward(input)`

**Quality Metrics**:
- ✅ 41/41 unit tests passing (100%)
- ✅ 13/13 quality gates passed
- ✅ 0 TypeScript diagnostics errors
- ⚠️ Integration tests deferred to Wave 3

**See**: [WAVE_2_COMPLETION_SIGNOFF.md](../wave-2/WAVE_2_COMPLETION_SIGNOFF.md) for full details

---

## Wave 3 Objectives

### Primary Goals

1. **Integration Testing** (HIGH PRIORITY)
   - Implement 8-test integration suite deferred from Wave 2
   - Validate end-to-end workflows (RatingSlip → Loyalty)
   - Verify idempotency, recovery, and concurrency handling
   - Performance validation (<500ms requirement)

2. **MTL UI Implementation**
   - Transaction entry forms with CTR threshold detection
   - Compliance dashboard and reporting
   - Integration with Loyalty data (consumption only)

3. **Production Readiness**
   - Replace permission service placeholder
   - Complete observability setup
   - Documentation updates

### Success Criteria

- [ ] 8/8 integration tests passing (>85% coverage for actions)
- [ ] MTL UI complete with WCAG 2.1 AA compliance
- [ ] Performance validated (<500ms for RatingSlip completion)
- [ ] Permission service integrated with RBAC
- [ ] All documentation updated

---

## API Contracts Reference

### 1. Complete Rating Slip

**Action**: `app/actions/ratingslip-actions.ts::completeRatingSlip`

```typescript
export async function completeRatingSlip(
  slipId: string
): Promise<ServiceResult<RatingSlipCompletionResult>>

// Success Response
{
  success: true,
  data: {
    ratingSlip: RatingSlipDTO,
    loyalty: {
      pointsEarned: number,
      newBalance: number,
      tier: string,
      ledgerEntry: LoyaltyLedgerDTO
    }
  }
}

// Partial Completion Error (slip closed, loyalty pending)
{
  success: false,
  error: {
    code: 'PARTIAL_COMPLETION',
    message: 'Rating slip closed but loyalty accrual failed',
    metadata: {
      slipId: string,
      correlationId: string
    }
  }
}
```

**Usage Example**:
```typescript
const result = await completeRatingSlip(slipId);

if (result.success) {
  console.log(`Earned ${result.data.loyalty.pointsEarned} points`);
  console.log(`New tier: ${result.data.loyalty.tier}`);
} else if (result.error?.code === 'PARTIAL_COMPLETION') {
  // Offer recovery option to user
  const recovery = await recoverSlipLoyalty(
    result.error.metadata.slipId,
    result.error.metadata.correlationId
  );
}
```

### 2. Recover Partial Completion

**Action**: `app/actions/ratingslip-actions.ts::recoverSlipLoyalty`

```typescript
export async function recoverSlipLoyalty(
  slipId: string,
  correlationId: string
): Promise<ServiceResult<AccruePointsResult>>
```

**When to Use**: After `completeRatingSlip` returns `PARTIAL_COMPLETION` error

### 3. Manual Reward

**Action**: `app/actions/loyalty-actions.ts::manualReward`

```typescript
export async function manualReward(input: {
  playerId: string;
  pointsChange: number;
  reason: string;
  staffId: string;
}): Promise<ServiceResult<AccruePointsResult>>

// Rate Limited Response
{
  success: false,
  error: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Maximum 10 manual rewards per minute exceeded'
  }
}

// Idempotent Duplicate Response
{
  success: true,
  data: { /* existing balance */ },
  message: 'Already processed (idempotent)'
}
```

**Rate Limit**: 10 requests/minute per staff member

**Idempotency**: Date-bucketed by (playerId, staffId, date, points, reason)

---

## Track Breakdown

### Track 0: Integration Testing (HIGH PRIORITY) - 2-3h

**Owner**: QA Team / Backend Architect
**Depends**: Wave 2 APIs (✅ ready)
**Status**: 🚨 CRITICAL PATH - Must complete before production

#### Task 3.0.1: Integration Test Suite (2-3h)

**File**: `__tests__/integration/ratingslip-loyalty.test.ts`

**Required Tests** (8 tests):

1. **Happy Path - Complete RatingSlip**
   ```typescript
   test('completeRatingSlip creates ledger entry and updates tier', async () => {
     // 1. Create rating slip with telemetry data
     // 2. Call completeRatingSlip(slipId)
     // 3. Verify: ledger entry created with transaction_type='GAMEPLAY'
     // 4. Verify: player balance increased
     // 5. Verify: tier updated if threshold crossed
   });
   ```

2. **Idempotency - Duplicate Completion**
   ```typescript
   test('duplicate completeRatingSlip returns same result', async () => {
     // 1. Complete slip once
     // 2. Attempt completion again (should fail gracefully)
     // 3. Verify: Only ONE ledger entry exists
     // 4. Verify: Balance unchanged on second attempt
   });
   ```

3. **Manual Reward - Staff Action**
   ```typescript
   test('manualReward creates MANUAL_BONUS ledger entry', async () => {
     // 1. Call manualReward with valid input
     // 2. Verify: ledger entry with transaction_type='MANUAL_BONUS'
     // 3. Verify: staff_id recorded in audit column
     // 4. Verify: balance updated correctly
   });
   ```

4. **Rate Limiting - Manual Reward Enforcement**
   ```typescript
   test('manualReward enforces 10 requests/min limit', async () => {
     // 1. Issue 10 manual rewards rapidly
     // 2. Attempt 11th reward
     // 3. Verify: 11th returns RATE_LIMIT_EXCEEDED error
     // 4. Wait for rate limit window reset
     // 5. Verify: Next reward succeeds
   });
   ```

5. **Performance - <500ms Requirement**
   ```typescript
   test('completeRatingSlip completes in <500ms', async () => {
     // 1. Start timer
     // 2. Call completeRatingSlip
     // 3. End timer
     // 4. Assert: duration < 500ms
   });
   ```

6. **Saga Recovery - Partial Completion**
   ```typescript
   test('recoverSlipLoyalty handles partial completion', async () => {
     // 1. Simulate scenario where slip closes but loyalty fails
     // 2. Verify: PARTIAL_COMPLETION error with correlation ID
     // 3. Call recoverSlipLoyalty(slipId, correlationId)
     // 4. Verify: Loyalty accrual succeeds on recovery
     // 5. Verify: No duplicate ledger entries
   });
   ```

7. **Concurrency - Race Conditions**
   ```typescript
   test('concurrent operations maintain balance integrity', async () => {
     // 1. Start two simultaneous operations (manual reward + slip completion)
     // 2. Wait for both to complete
     // 3. Verify: Final balance = sum of both operations
     // 4. Verify: No lost updates (row locking working)
   });
   ```

8. **Idempotency Edge Case - Date Bucketing**
   ```typescript
   test('manual reward idempotency uses date bucketing', async () => {
     // 1. Issue manual reward on Day 1
     // 2. Issue identical reward on Day 2 (same player, points, reason)
     // 3. Verify: Two separate ledger entries created
     // 4. Verify: Day 1 duplicate is idempotent (one entry)
   });
   ```

#### Acceptance Criteria

- [ ] All 8 tests passing
- [ ] Coverage >85% for `app/actions/ratingslip-actions.ts`
- [ ] Coverage >85% for `app/actions/loyalty-actions.ts`
- [ ] Tests run in CI without external dependencies
- [ ] Performance test validates <500ms requirement

---

### Track 1: Permission Service Integration - 1h

**Owner**: Backend Architect
**Depends**: None (independent)
**Priority**: MEDIUM

#### Task 3.1.1: Replace Permission Placeholder (1h)

**File**: `app/actions/loyalty-actions.ts`

**Current State**:
```typescript
// Placeholder permission check
async function checkPermission(staffId: string, capability: string): Promise<boolean> {
  // TODO: Integrate with staff_permissions table
  return true; // Placeholder
}
```

**Required Implementation**:
```typescript
async function checkPermission(
  supabase: SupabaseClient<Database>,
  staffId: string,
  capability: string
): Promise<ServiceResult<boolean>> {
  const { data, error } = await supabase
    .from('staff_permissions')
    .select('capabilities')
    .eq('staff_id', staffId)
    .single();

  if (error) {
    return {
      success: false,
      error: { code: 'PERMISSION_CHECK_FAILED', message: error.message }
    };
  }

  const hasPermission = data.capabilities.includes(capability);

  if (!hasPermission) {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: `Missing capability: ${capability}` }
    };
  }

  return { success: true, data: true };
}
```

**Integration Points**:
- `manualReward()` action - verify `loyalty:award` capability
- Return 403 Forbidden for unauthorized users
- Add unit tests for permission logic

#### Acceptance Criteria

- [ ] Permission checks query `staff_permissions` table
- [ ] `loyalty:award` capability enforced
- [ ] Unauthorized users receive 403 Forbidden error
- [ ] Unit tests verify authorization logic

---

### Track 2: MTL UI Implementation - 4-6h

**Owner**: Full-Stack Developer
**Depends**: None (independent of Loyalty)
**Priority**: HIGH

#### Task 3.2.1: MTL Transaction Entry Form (2h)

**File**: `app/mtl/transaction-form.tsx`

**Requirements**:
- Form fields: Transaction type, amount, player ID, timestamp
- CTR threshold detection ($10,000 warning)
- Gaming day calculation and display
- Form validation with react-hook-form
- Integration with MTL server actions

**Acceptance Criteria**:
- [ ] Form creates MTL transaction entry
- [ ] $10k threshold triggers CTR warning
- [ ] Gaming day displayed correctly
- [ ] Validation errors user-friendly
- [ ] WCAG 2.1 AA compliant

#### Task 3.2.2: MTL Compliance Dashboard (2h)

**File**: `app/mtl/compliance-dashboard.tsx`

**Requirements**:
- Display recent MTL transactions
- CTR alert indicators
- Transaction history with filters
- Player lookup integration
- Export functionality

**Acceptance Criteria**:
- [ ] Dashboard displays real-time MTL data
- [ ] CTR alerts visible and actionable
- [ ] Filters work correctly (date range, player, type)
- [ ] Export generates compliant reports
- [ ] Loading/error states comprehensive

#### Task 3.2.3: Loyalty Data Consumption (1-2h)

**File**: `app/mtl/player-loyalty-widget.tsx`

**Requirements**:
- Display player loyalty tier and balance
- Read-only integration (MTL does NOT write to loyalty)
- Real-time updates via React Query
- Tier progress visualization

**Example**:
```typescript
import { usePlayerLoyalty } from '@/hooks/loyalty/use-player-loyalty';

function PlayerLoyaltyWidget({ playerId }: { playerId: string }) {
  const { data: loyalty, isLoading } = usePlayerLoyalty(playerId);

  if (isLoading) return <Skeleton />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Loyalty Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div>Tier: {loyalty.tier}</div>
        <div>Balance: {loyalty.currentBalance} points</div>
        <Progress value={loyalty.tierProgress} />
      </CardContent>
    </Card>
  );
}
```

**Acceptance Criteria**:
- [ ] Widget displays loyalty tier and balance
- [ ] MTL code does NOT mutate loyalty data
- [ ] React Query cache used correctly
- [ ] Updates reflect in <2s

---

### Track 3: E2E Testing & Documentation - 2-3h

**Owner**: Full-Stack Developer
**Depends**: Tracks 0, 1, 2 complete
**Priority**: HIGH

#### Task 3.3.1: Cross-Domain E2E Tests (1.5h)

**File**: `__tests__/e2e/loyalty-mtl-integration.test.ts`

**Tests**:
1. Complete visit → RatingSlip → Loyalty → MTL (full workflow)
2. Manual reward during active session → visible in MTL
3. Tier progression reflected in MTL dashboard
4. Performance - End-to-end completion <2s

#### Task 3.3.2: Documentation Updates (1h)

**Files to Update**:
- [ ] `docs/api-contracts/loyalty-apis.md` - Document RatingSlipCompletionResult DTO
- [ ] `docs/runbooks/LOYALTY_POINT_RECOVERY.md` - Recovery procedures for partial completions
- [ ] `docs/phases/phase-6/PHASE_6_DEVELOPER_CHECKLIST.md` - Mark Wave 2 complete, update Wave 3
- [ ] `docs/INDEX.md` - Add Wave 3 document links

#### Acceptance Criteria

- [ ] 4/4 E2E tests passing
- [ ] All API contracts documented
- [ ] Recovery runbook complete
- [ ] Developer checklist aligned

---

## Quality Gates (16/16 Required)

### Integration Testing (Track 0)
- [ ] **Gate 1**: 8/8 integration tests passing
- [ ] **Gate 2**: Coverage >85% for action code
- [ ] **Gate 3**: Performance validated (<500ms)
- [ ] **Gate 4**: Tests run in CI successfully

### Permission Service (Track 1)
- [ ] **Gate 5**: Permission checks query database
- [ ] **Gate 6**: `loyalty:award` enforced
- [ ] **Gate 7**: 403 Forbidden returned for unauthorized
- [ ] **Gate 8**: Unit tests verify authorization

### MTL UI (Track 2)
- [ ] **Gate 9**: Transaction form functional
- [ ] **Gate 10**: CTR threshold detection working
- [ ] **Gate 11**: Compliance dashboard displays data
- [ ] **Gate 12**: Loyalty widget read-only integration
- [ ] **Gate 13**: WCAG 2.1 AA compliance verified

### E2E & Documentation (Track 3)
- [ ] **Gate 14**: Cross-domain E2E tests passing
- [ ] **Gate 15**: API contracts documented
- [ ] **Gate 16**: Recovery runbook complete

---

## Timeline & Parallel Execution

### Optimal Workflow (8-10h wall clock)

```
Hour   Track 0 (QA/Backend)    Track 1 (Backend)    Track 2 (Frontend)
0-2.5  Integration Tests ████  Wait ░░░░             MTL Form ████
2.5-3.5                        Permission Svc ████
3.5-4.5 Test Refinement ██                           MTL Dashboard ████
4.5-6.5                                              Loyalty Widget ████
6.5-8.5 E2E Tests ████                               E2E Tests ████
8.5-10  Documentation ██                             Documentation ██

Total: 10h wall clock (vs 15-17h sequential)
```

### Handoff Points

1. **Hour 0**: All tracks start in parallel (no dependencies)
2. **Hour 6**: Integration tests complete → E2E can validate
3. **Hour 8**: All implementation complete → Documentation sprint

---

## Risk Assessment

### High Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Integration tests reveal bugs | Medium | High | Early testing in Track 0, allow buffer for fixes |
| Performance <500ms not met | Low | High | Optimize RPC if needed, have fallback async pattern |
| Permission schema missing | Low | Medium | Verify `staff_permissions` table exists before start |
| MTL-Loyalty coupling | Low | Medium | Code review enforcement of read-only boundary |

### Medium Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| E2E test flakiness | Medium | Medium | Retry logic, proper cleanup between tests |
| Documentation drift | Low | Low | Update docs inline with code changes |
| WCAG compliance failures | Low | Medium | Use shadcn/ui components consistently |

---

## Definition of Done (Wave 3)

### Functional Requirements
- [ ] 8/8 integration tests passing (deferred from Wave 2)
- [ ] MTL transaction entry and dashboard functional
- [ ] Loyalty data visible in MTL (read-only)
- [ ] Permission service integrated with RBAC
- [ ] Recovery procedures documented

### Technical Requirements
- [ ] All 16 quality gates passed
- [ ] Performance validated (<500ms for RatingSlip completion)
- [ ] Coverage >85% for all action code
- [ ] Zero TypeScript compilation errors
- [ ] WCAG 2.1 AA compliance verified

### Documentation Requirements
- [ ] API contracts documented
- [ ] Recovery runbook complete
- [ ] Developer checklist updated
- [ ] Wave 3 completion signoff created

### Operational Requirements
- [ ] Rate limiting functional (10 req/min)
- [ ] Permission checks enforced
- [ ] Structured logging operational
- [ ] Correlation IDs tracked end-to-end

---

## Success Metrics

**Target**: 100% quality gates (16/16)
**Target**: Integration tests <3h implementation
**Target**: MTL UI <6h implementation
**Target**: E2E validation <2h

**Benchmark**: Phases 4-5 achieved 100% quality gates on first attempt with proven pattern

---

## References

- [WAVE_2_COMPLETION_SIGNOFF.md](../wave-2/WAVE_2_COMPLETION_SIGNOFF.md) - Wave 2 deliverables
- [WAVE_2_SIMPLIFIED_WORKFLOW.md](../wave-2/WAVE_2_SIMPLIFIED_WORKFLOW.md) - Architecture decisions
- [PHASE_6_IMPLEMENTATION_PLAN_v3.md](../PHASE_6_IMPLEMENTATION_PLAN_v3.md) - Overall plan
- [PHASE_6_DEVELOPER_CHECKLIST.md](../PHASE_6_DEVELOPER_CHECKLIST.md) - Execution workflow

---

**Document Version**: 1.0
**Date Created**: October 14, 2025
**Status**: Ready for Execution
**Next Milestone**: Wave 3 Completion (ETA: 8-10h)

---

## Quick Start Checklist

### Before You Begin
- [ ] Read Wave 2 completion signoff
- [ ] Review API contract examples above
- [ ] Verify `staff_permissions` table exists
- [ ] Confirm Supabase local instance running
- [ ] Pull latest `main` branch

### Track 0 (Integration Tests) - START FIRST
- [ ] Create `__tests__/integration/ratingslip-loyalty.test.ts`
- [ ] Implement 8 tests (see Task 3.0.1)
- [ ] Run tests: `npm test -- __tests__/integration/ratingslip-loyalty.test.ts`
- [ ] Verify coverage: `npm test -- --coverage`

### Track 1 (Permission Service)
- [ ] Update `app/actions/loyalty-actions.ts`
- [ ] Implement database-backed permission check
- [ ] Add unit tests
- [ ] Run tests: `npm test -- __tests__/actions/loyalty-actions.test.ts`

### Track 2 (MTL UI)
- [ ] Create `app/mtl/transaction-form.tsx`
- [ ] Create `app/mtl/compliance-dashboard.tsx`
- [ ] Create `app/mtl/player-loyalty-widget.tsx`
- [ ] Test UI manually in browser

### Track 3 (E2E & Docs)
- [ ] Create E2E tests after Tracks 0-2 complete
- [ ] Update documentation
- [ ] Create Wave 3 completion signoff

---

**Ready to start Wave 3? Let's deliver production-ready integration testing and MTL UI! 🚀**

# Phase 6 - Next Steps (Action Plan)

**Date**: 2025-10-13
**Current Position**: Wave 1 (70% Complete)
**Target**: Complete Wave 1 testing before Wave 2

---

## 🚨 Critical Path: Complete Wave 1 Testing (5h)

### Why Testing First?

**Architecture Audit Finding**: Services-first approach is valid **IF** services are fully functional before integration.

**Current Gap**: Services exist but are untested → Risk of integration bugs

**Trade-off Analysis**:
- Skip testing → 13h to Wave 3 → 8-10h debugging → **21-23h total**
- Test first → 5h testing → 13h to Wave 3 → **18h total** (faster + safer)

---

## 📋 Action Items (Priority Order)

### Priority 1: Business Logic Tests (2h)

**File**: `__tests__/services/loyalty/business.test.ts`

**Required Tests**:
```typescript
describe('calculatePoints', () => {
  it('matches PT-1 parity', () => { /* ... */ });
  it('applies tier multipliers correctly', () => { /* ... */ });
  it('handles edge cases (zero bet, zero duration)', () => { /* ... */ });
  it('applies empty seat bonus', () => { /* ... */ });
  it('applies high volume bonus', () => { /* ... */ });
});

describe('calculateTier', () => {
  it('promotes to SILVER at 1000 points', () => { /* ... */ });
  it('promotes to GOLD at 5000 points', () => { /* ... */ });
  it('promotes to PLATINUM at 20000 points', () => { /* ... */ });
});

describe('calculateTierProgress', () => {
  it('calculates progress to next tier', () => { /* ... */ });
  it('returns 100% for max tier', () => { /* ... */ });
});
```

**Exit Condition**: >80% coverage for `services/loyalty/business.ts`

---

### Priority 2: Idempotency Tests (1.5h) **CRITICAL**

**File**: `__tests__/services/loyalty/crud.test.ts`

**Required Tests**:
```typescript
describe('createLedgerEntry idempotency', () => {
  it('soft-succeeds on duplicate session_id', async () => {
    // First call
    const result1 = await loyalty.createLedgerEntry({
      player_id: 'uuid-123',
      session_id: 'session-abc',
      points_change: 500,
      transaction_type: 'GAMEPLAY',
      reason: 'Test'
    });

    // Duplicate call (same session_id)
    const result2 = await loyalty.createLedgerEntry({
      player_id: 'uuid-123',
      session_id: 'session-abc', // SAME
      points_change: 500,
      transaction_type: 'GAMEPLAY',
      reason: 'Test'
    });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true); // Soft success

    // Verify only ONE ledger entry
    const { data } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('session_id', 'session-abc');

    expect(data?.length).toBe(1); // ← CRITICAL CHECK
  });

  it('allows different transaction_types same session', async () => {
    // GAMEPLAY for session-abc
    await loyalty.createLedgerEntry({
      session_id: 'session-abc',
      transaction_type: 'GAMEPLAY',
      ...
    });

    // MANUAL_BONUS for same session (different type)
    const result = await loyalty.createLedgerEntry({
      session_id: 'session-abc',
      transaction_type: 'MANUAL_BONUS', // Different!
      ...
    });

    expect(result.success).toBe(true); // Should succeed
  });
});
```

**Why Critical**: Financial integrity depends on preventing duplicate points

---

### Priority 3: RPC Integration Tests (1h)

**File**: `__tests__/services/loyalty/rpc.test.ts`

**Required Tests**:
```typescript
describe('increment_player_loyalty RPC', () => {
  it('updates balance and tier', async () => {
    const { data, error } = await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 500
    });

    expect(error).toBeNull();
    expect(data[0].current_balance).toBe(500);
    expect(data[0].tier).toBe('BRONZE');
  });

  it('promotes tier when crossing threshold', async () => {
    // Accrue 1000 points (SILVER threshold)
    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 1000
    });

    const { data } = await supabase
      .from('player_loyalty')
      .select('tier')
      .eq('player_id', testPlayerId)
      .single();

    expect(data.tier).toBe('SILVER'); // Should promote
  });

  it('handles negative deltas (redemptions)', async () => {
    // Give 1000 points
    await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: 1000
    });

    // Redeem 300 points
    const { data } = await supabase.rpc('increment_player_loyalty', {
      p_player_id: testPlayerId,
      p_delta_points: -300
    });

    expect(data[0].current_balance).toBe(700);
  });
});
```

---

### Priority 4: CRUD Integration Tests (0.5h)

**File**: `__tests__/services/loyalty/crud.test.ts` (continued)

**Required Tests**:
```typescript
describe('updatePlayerLoyalty', () => {
  it('updates fields correctly', async () => { /* ... */ });
  it('throws error for non-existent player', async () => { /* ... */ });
});

describe('getPlayerLoyalty', () => {
  it('retrieves loyalty record', async () => { /* ... */ });
  it('throws error if not found', async () => { /* ... */ });
});
```

---

### Priority 5: Coverage Verification (concurrent with above)

**Setup**: Jest coverage configuration

```javascript
// jest.config.js
module.exports = {
  // ... existing config
  collectCoverageFrom: [
    'services/loyalty/**/*.ts',
    '!services/loyalty/**/*.test.ts',
    '!services/loyalty/index.ts' // Factory just wires things
  ],
  coverageThresholds: {
    'services/loyalty/business.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'services/loyalty/crud.ts': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  }
};
```

**Run**:
```bash
npm test -- --coverage services/loyalty
```

**Exit Condition**: >80% coverage for business.ts, >75% for crud.ts

---

## 🎯 Wave 1 Exit Criteria Checklist

Before proceeding to Wave 2, verify:

- [ ] **T0**: All 5 structural tasks complete ✅ (already done)
- [ ] **T0**: Loyalty business logic >80% coverage ⚠️ (Priority 1)
- [ ] **T0**: `manualReward()` idempotency verified ⚠️ (Priority 2)
- [ ] **T0**: RPC updates balance + tier correctly ⚠️ (Priority 3)
- [ ] **T0**: Service interface matches handoff spec ✅ (already done)
- [ ] **T0**: All unit tests passing ⚠️ (after writing them)
- [ ] **All**: No TypeScript compilation errors ✅ (already passing)
- [ ] **All**: Schema verification test passing ✅ (already passing)

**Current**: 3/8 ✅ → **Target**: 8/8 ✅

---

## 🔧 Test Infrastructure Setup

### Step 1: Create Test Files

```bash
mkdir -p __tests__/services/loyalty
touch __tests__/services/loyalty/business.test.ts
touch __tests__/services/loyalty/crud.test.ts
touch __tests__/services/loyalty/rpc.test.ts
```

### Step 2: Set Up Test Utilities

```typescript
// __tests__/services/loyalty/test-utils.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role for tests
);

export async function createTestPlayer(): Promise<string> {
  const { data, error } = await supabase
    .from('player')
    .insert({ name: 'Test Player' })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function cleanupTestData(playerId: string): Promise<void> {
  await supabase.from('loyalty_ledger').delete().eq('player_id', playerId);
  await supabase.from('player_loyalty').delete().eq('player_id', playerId);
  await supabase.from('player').delete().eq('id', playerId);
}
```

### Step 3: Configure Test Database

Ensure tests run against local Supabase instance:

```bash
# Start local Supabase
npx supabase start

# Run tests
npm test services/loyalty
```

---

## 📊 Success Metrics

### Quantitative

- ✅ Business logic: >80% coverage
- ✅ CRUD: >75% coverage
- ✅ All tests passing (100%)
- ✅ TypeScript: 0 errors
- ✅ CI/CD: Green pipeline

### Qualitative

- ✅ Idempotency proven with integration test
- ✅ RPC behavior verified against actual database
- ✅ Tier progression logic validated
- ✅ Team confidence high for Wave 2 integration

---

## ⏱️ Time Estimates

| Priority | Task | Estimate | Cumulative |
|----------|------|----------|------------|
| 1 | Business logic tests | 2.0h | 2.0h |
| 2 | Idempotency tests | 1.5h | 3.5h |
| 3 | RPC integration tests | 1.0h | 4.5h |
| 4 | CRUD tests | 0.5h | 5.0h |
| 5 | Coverage verification | (concurrent) | 5.0h |

**Total**: 5 hours to complete Wave 1

---

## 🚀 After Wave 1 Complete

### Wave 2 Preparation (1h)

1. Review event dispatcher architecture
2. Plan RatingSlip integration points
3. Design event payload schemas
4. Document data flow

### Wave 2 Execution (7h)

Only start after:
- All 8 Wave 1 exit criteria pass
- Test coverage verified
- CI/CD pipeline green
- Team sign-off

---

## 📝 Documentation Updates Needed

After testing complete:

1. Update `PHASE_6_DEVELOPER_CHECKLIST.md`:
   - [x] Mark Wave 1-T0 tasks complete
   - [x] Update exit criteria status

2. Create `TEST_RESULTS_WAVE_1.md`:
   - Coverage reports
   - Test execution results
   - Idempotency verification proof

3. Update `PHASE_6_READINESS_REPORT.md`:
   - Change status to "Wave 1 Complete"
   - Update exit criteria to 8/8

---

## 🎯 Next Review Points

1. **After Priority 1-2 complete** (3.5h):
   - Review business logic coverage
   - Verify idempotency tests pass
   - Decision point: Continue or adjust approach

2. **After Priority 3-5 complete** (5h):
   - Full exit criteria review
   - Wave 2 go/no-go decision
   - Team briefing on Wave 2 approach

3. **Wave 2 start** (after Wave 1 complete):
   - Event integration kickoff
   - RatingSlip team coordination
   - Integration test planning

---

**Status**: Action plan ready
**Owner**: To be assigned
**Timeline**: 5 hours to Wave 1 completion
**Next Step**: Create test infrastructure and begin Priority 1 tasks

# Wave 2 – Simplified Integration Workflow (APPROVED)

**Context**: Phase 6 Wave 2 covers RatingSlip → Loyalty integration using direct service invocation pattern. This workflow replaces the over-engineered event-bus approach with a lean, scale-appropriate solution that maintains all Phase 6 Definition of Done requirements.

**Key Simplification**: Direct service-to-service calls within server actions (no generic event dispatcher) with documented extension path for future multi-consumer scenarios.

---

## 1. Scope & Objectives

- **Primary Goal**: Deliver durable RatingSlip → Loyalty integration with idempotent point accrual and manual reward capability.
- **Architecture Pattern**: HYBRID (Server Action Orchestration) per `BALANCED_ARCHITECTURE_QUICK.md`
- **Tracks in Scope**:
  - **T0** – Loyalty service integration (Backend Architect)
  - **T1** – RatingSlip action orchestration (TypeScript Pro)
- **Explicitly Out of Scope**:
  - Generic event bus infrastructure (deferred until >1 consumer)
  - Persistent event_log table (loyalty_ledger provides audit trail)
  - Redis rate limiting (in-memory sufficient for MVP scale)
  - MTL hooks/UI work (Wave 3)

### Success Criteria (from Implementation Plan)
- RatingSlip completion calls Loyalty service synchronously and returns combined result
- Loyalty service consumes telemetry payload, writing to `loyalty_ledger` via canonical service APIs
- `manualReward` server action exposed with in-memory rate limiting and audit enforcement
- Integration tests demonstrate ledger entries + tier updates with idempotent replay
- **NEW**: Performance <500ms end-to-end (synchronous response requirement met)

---

## 2. Dependencies & Preconditions

1. **Wave 0 schema corrections shipped** (`loyalty_ledger`, `player_loyalty`, RPCs) — verified via Phase 6 developer checklist
2. **Wave 1 T0 deliverables available**:
   - `services/loyalty/*` business + CRUD modules (100% test coverage)
   - `calculateAndAssignPoints` function (already implemented)
   - RPC wrappers: `increment_player_loyalty` (verified working)
   - Unit tests passing (>80% coverage)
3. **Environment readiness**:
   - Supabase migrations applied locally
   - `npm run db:types` executed to refresh type definitions
   - No dirty migrations; schema verification tests passing

---

## 3. Roles & Communication

| Role | Owner | Primary Responsibilities |
|------|-------|--------------------------|
| Backend Architect | Agent 1 | Loyalty service integration, idempotency verification, in-memory rate limiting |
| TypeScript Pro | Agent 2 | RatingSlip action orchestration, type-safe integration contract |
| QA / Reviewer | Rotating | Validate integration tests, ensure architectural compliance |

**Checkpoints**: Kickoff (Hour 0), mid-wave sync (Hour 2), final verification (Hour 4)

---

## 4. High-Level Timeline (6-7h total, +2h for hardening)

```
Hour 0-1.5 : T0.1 Schema hardening (audit columns, correlation IDs)
Hour 1.5-3 : T0.2 Loyalty service integration + manual reward action
Hour 3-4.5 : T1.1 RatingSlip action orchestration with recovery path
Hour 4.5-6 : T1.2 Integration test suite (saga, concurrency, idempotency)
Hour 6-7   : Documentation + observability verification
```

**Critical Addition**: +2h for production hardening (atomicity, idempotency, correlation tracking)
**Parallel Execution**: T1 can begin after T0.1 schema changes applied

---

## 5. Detailed Task Breakdown

### 5.1 Track 0 — Loyalty Service Integration (Backend Architect)

#### Task 2.0.0 — Schema Hardening (1.5h) 🚨 **NEW - CRITICAL**

**Objective**: Add audit columns and strengthen RPC before implementing actions.

**Implementation Steps**:

1. Create migration `20251013_wave_2_schema_hardening.sql`:
   ```sql
   -- Add audit/tracing columns to loyalty_ledger
   ALTER TABLE loyalty_ledger
     ADD COLUMN IF NOT EXISTS staff_id TEXT,
     ADD COLUMN IF NOT EXISTS balance_before INTEGER,
     ADD COLUMN IF NOT EXISTS balance_after INTEGER,
     ADD COLUMN IF NOT EXISTS tier_before TEXT,
     ADD COLUMN IF NOT EXISTS tier_after TEXT,
     ADD COLUMN IF NOT EXISTS correlation_id TEXT;

   -- Indexes for queries
   CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_correlation
     ON loyalty_ledger(correlation_id) WHERE correlation_id IS NOT NULL;

   CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_staff
     ON loyalty_ledger(staff_id, created_at DESC) WHERE staff_id IS NOT NULL;
   ```

2. Update `increment_player_loyalty` RPC to return before/after values:
   ```sql
   CREATE OR REPLACE FUNCTION increment_player_loyalty(
     p_player_id UUID,
     p_delta_points INTEGER
   )
   RETURNS TABLE(
     player_id UUID,
     balance_before INTEGER,
     balance_after INTEGER,
     tier_before TEXT,
     tier_after TEXT,
     tier_progress INTEGER,
     lifetime_points INTEGER,
     updated_at TIMESTAMPTZ,
     row_locked BOOLEAN
   )
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   -- ... implementation with before/after capture
   $$;
   ```

3. Run migration: `npx supabase migration up`
4. Regenerate types: `npm run db:types`
5. Verify RPC returns enhanced result set

**Artifacts**:
- `supabase/migrations/20251013_wave_2_schema_hardening.sql`
- Updated TypeScript types in `types/database.types.ts`

**Quality Gates**:
- Migration applies cleanly
- RPC returns 9 columns (including before/after values)
- No breaking changes to existing queries

#### Task 2.0.1 — Server Action: Manual Reward (1.5h)

**Architecture Alignment**: Server action orchestrates loyalty service call with rate limiting enforcement at action boundary (per PT-2 standards).

**Implementation Steps**:

1. Create correlation ID infrastructure (`lib/correlation.ts`):
   - AsyncLocalStorage for request-scoped correlation IDs
   - `generateCorrelationId()`, `getCorrelationId()`, `setCorrelationId()`
   - Thread through `withServerAction` wrapper

2. Create deterministic idempotency key hashing (`lib/idempotency.ts`):
   - `hashIdempotencyKey(components)` function
   - Date-bucketed keys for manual rewards (prevent duplicates same day)
   - External `rewardId` support for promotion system integration

3. Implement in-memory rate limiter (`lib/rate-limiter.ts`):
   - Simple Map-based storage with TTL cleanup
   - Rate limit: 10 requests/min per staff member
   - ~50 LOC (vs 300+ LOC Redis implementation)

4. Create `app/actions/loyalty-actions.ts` with `manualReward` server action:
   - Permission checks (verify staff has `loyalty:award` permission)
   - Deterministic idempotency key generation
   - Rate limiting enforcement
   - Integrate with existing `LoyaltyService.createLedgerEntry`
   ```typescript
   export async function manualReward(input: {
     playerId: string;
     pointsChange: number;
     reason: string;
     staffId: string;
     ratingSlipId?: string;  // NEW: Link if recovering failed slip
     rewardId?: string;      // NEW: External reward ID for promotions
   }): Promise<ServiceResult<AccruePointsResult>> {
     return withServerAction('manual_reward', async (supabase) => {
       const correlationId = getCorrelationId();

       // 1. Permission check
       const { data: { session } } = await supabase.auth.getSession();
       if (!session || !(await hasPermission(session.user, 'loyalty:award'))) {
         return { success: false, error: { code: 'FORBIDDEN', ... } };
       }

       // 2. Rate limit check
       if (!checkRateLimit(`staff:${input.staffId}`, { max: 10, window: 60000 })) {
         return { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', ... } };
       }

       // 3. Validate audit requirements
       if (!input.reason?.trim() || input.reason.length < 10) {
         return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Reason must be at least 10 characters' } };
       }

       // 4. Generate DETERMINISTIC idempotency key
       const idempotencyKey = input.rewardId
         ? `reward_${input.rewardId}`
         : input.ratingSlipId
           ? `recovery_${input.ratingSlipId}`
           : hashIdempotencyKey({
               playerId: input.playerId,
               staffId: input.staffId,
               points: input.pointsChange,
               reason: input.reason,
               date: formatDate(new Date(), 'YYYY-MM-DD'),  // Date bucket
             });

       // 5. Create ledger entry (idempotent)
       const loyaltyService = createLoyaltyService(supabase);
       return loyaltyService.createLedgerEntry({
         player_id: input.playerId,
         rating_slip_id: input.ratingSlipId,
         session_id: idempotencyKey,  // ← DETERMINISTIC
         transaction_type: input.pointsChange > 0 ? 'MANUAL_BONUS' : 'ADJUSTMENT',
         event_type: 'POINTS_UPDATE_REQUESTED',
         points_change: input.pointsChange,
         reason: input.reason,
         source: 'manual',
         staff_id: input.staffId,  // ← NEW: Audit trail
         correlation_id: correlationId,  // ← NEW: Tracing
       });
     });
   }
   ```

5. Update `LoyaltyService.createLedgerEntry` to:
   - Handle idempotency conflicts (23505 error code)
   - Return existing entry on conflict (soft success)
   - Call enhanced `increment_player_loyalty` RPC
   - Store before/after values in ledger for audit verification

**Artifacts**:
- `lib/correlation.ts` (~80 LOC, AsyncLocalStorage implementation)
- `lib/idempotency.ts` (~40 LOC, deterministic key hashing)
- `lib/rate-limiter.ts` (~50 LOC, in-memory implementation)
- `app/actions/loyalty-actions.ts` (~150 LOC with security checks)
- Updated `services/loyalty/crud.ts` (idempotency conflict handling)
- Unit tests: `__tests__/actions/loyalty-actions.test.ts`

**Quality Gates**:
- Permission checks enforce `loyalty:award` capability
- Rate limiter blocks >10 requests/min from same staff member
- Idempotency keys deterministic (same inputs → same key)
- Date-bucketed keys prevent same-day duplicates
- Ledger stores staff_id, correlation_id, before/after values
- Tests verify idempotency (calling twice → single ledger entry)

#### Task 2.0.2 — Optional Telemetry Wrapper (0.5h)

**Objective**: Create thin wrapper for structured logging that serves as future swap point for queue workers.

**Implementation**:

```typescript
// lib/telemetry/emit-telemetry.ts (~30 LOC)

import { logger } from '@/lib/logger';

/**
 * Emit telemetry event for observability
 *
 * CURRENT: Structured logging only
 * FUTURE: Replace body with queue.publish() without changing call sites
 */
export function emitTelemetry(
  eventType: 'RATING_SLIP_COMPLETED' | 'POINTS_UPDATE_REQUESTED',
  payload: {
    playerId: string;
    pointsEarned?: number;
    tier?: string;
    sessionId?: string;
    [key: string]: unknown;
  }
): void {
  logger.info('loyalty_telemetry', {
    event_type: eventType,
    player_id: payload.playerId,
    points_earned: payload.pointsEarned,
    tier: payload.tier,
    session_id: payload.sessionId,
    timestamp: new Date().toISOString(),
  });
}
```

**Usage**: Call after loyalty accrual completes (fire-and-forget for observability)

**Quality Gate**: Structured logs emit canonical schema from Implementation Plan §6

#### Track 0 Exit Checklist
- [ ] Schema migration applied (`loyalty_ledger` audit columns added)
- [ ] RPC enhanced to return before/after values with row lock confirmation
- [ ] Correlation ID infrastructure implemented and threaded through `withServerAction`
- [ ] Deterministic idempotency key hashing implemented
- [ ] `manualReward` server action with permission checks and security
- [ ] In-memory rate limiter created and tested
- [ ] `LoyaltyService.createLedgerEntry` handles idempotency conflicts
- [ ] Optional telemetry wrapper created for observability
- [ ] Unit tests passing (permissions, rate limit, idempotency, date bucketing)

---

### 5.2 Track 1 — RatingSlip Action Orchestration (TypeScript Pro)

#### Task 2.1.1 — Server Action: Complete Rating Slip with Recovery (1.5h) 🚨 **UPDATED**

**Objective**: Orchestrate RatingSlip session closure + Loyalty point accrual with compensating transaction pattern for atomicity.

**Implementation Steps**:

1. Create `app/actions/ratingslip-actions.ts`
2. Implement `completeRatingSlip` server action with error recovery:
   ```typescript
   export async function completeRatingSlip(slipId: string): Promise<
     ServiceResult<{
       ratingSlip: RatingSlipDTO;
       loyalty: AccruePointsResult;
     }>
   > {
     return withServerAction('complete_rating_slip', async (supabase) => {
       const correlationId = getCorrelationId();
       const ratingSlipService = createRatingSlipService(supabase);
       const loyaltyService = createLoyaltyService(supabase);

       try {
         // 1. Fetch rating slip data
         const slipResult = await ratingSlipService.getById(slipId);
         if (!slipResult.success) return slipResult;

         // 2. Close session via RPC (NO points parameter)
         const { error: rpcError } = await supabase.rpc('close_player_session', {
           p_rating_slip_id: slipId,
           p_visit_id: slipResult.data.visit_id,
           p_chips_taken: slipResult.data.chips_taken,
           p_end_time: new Date().toISOString(),
         });
         if (rpcError) throw rpcError;

         // 3. Calculate and assign points (DIRECT SERVICE CALL, idempotent via rating_slip_id)
         const loyaltyResult = await loyaltyService.accruePointsFromSlip({
           playerId: slipResult.data.player_id,
           ratingSlipId: slipId,
           visitId: slipResult.data.visit_id,
           averageBet: slipResult.data.average_bet,
           durationSeconds: slipResult.data.accumulated_seconds,
           gameSettings: slipResult.data.game_settings,
         });

         if (!loyaltyResult.success) throw loyaltyResult.error;

         // 4. Emit telemetry for observability
         emitTelemetry('RATING_SLIP_COMPLETED', {
           playerId: slipResult.data.player_id,
           sessionId: slipId,
           correlationId,
           pointsEarned: loyaltyResult.data.pointsEarned,
           tier: loyaltyResult.data.tier,
         });

         return {
           success: true,
           data: {
             ratingSlip: slipResult.data,
             loyalty: loyaltyResult.data,
           },
         };

       } catch (error) {
         // Log partial failure with correlation ID
         logger.error('slip_completion_failed', {
           correlation_id: correlationId,
           slip_id: slipId,
           error: error.message,
           recovery_needed: true,
         });

         // Return partial state to UI
         return {
           success: false,
           error: {
             code: 'PARTIAL_COMPLETION',
             message: 'Slip closed but loyalty pending. Use recovery action.',
             metadata: { slipId, correlationId },
           },
         };
       }
     });
   }
   ```

3. Implement recovery action for partial completions:
   ```typescript
   export async function recoverSlipLoyalty(
     slipId: string,
     correlationId: string
   ): Promise<ServiceResult<AccruePointsResult>> {
     return withServerAction('recover_slip_loyalty', async (supabase) => {

       // 1. Check if loyalty already accrued
       const { data: existingEntry } = await supabase
         .from('loyalty_ledger')
         .select('*')
         .eq('rating_slip_id', slipId)
         .eq('transaction_type', 'GAMEPLAY')
         .single();

       if (existingEntry) {
         // Already recovered
         return {
           success: true,
           data: {
             pointsEarned: existingEntry.points_change,
             newBalance: existingEntry.balance_after,
             tier: existingEntry.tier_after,
             ledgerEntryId: existingEntry.id,
             idempotent: true,
           },
         };
       }

       // 2. Verify slip is CLOSED
       const { data: slip } = await supabase
         .from('ratingslip')
         .select('*')
         .eq('id', slipId)
         .single();

       if (!slip || slip.status !== 'CLOSED') {
         return {
           success: false,
           error: { code: 'SLIP_NOT_CLOSED', message: 'Cannot recover loyalty for open slip' },
         };
       }

       // 3. Accrue points using deterministic key (rating_slip_id)
       const loyaltyService = createLoyaltyService(supabase);
       return loyaltyService.accruePointsFromSlip({
         ratingSlipId: slipId,
         playerId: slip.player_id,
         visitId: slip.visit_id,
         averageBet: slip.average_bet,
         durationSeconds: slip.accumulated_seconds,
         gameSettings: slip.game_settings,
       });
     });
   }
   ```

3. Update RatingSlip service if needed to remove legacy points logic:
   - Audit `services/ratingslip/` for residual points calculations
   - Verify `close_player_session` RPC no longer accepts points parameter

**Type Definitions**:
```typescript
// services/ratingslip/types.ts

export interface RatingSlipCompletionResult {
  ratingSlip: RatingSlipDTO;
  loyalty: AccruePointsResult;
}
```

**Artifacts**:
- `app/actions/ratingslip-actions.ts` (~200 LOC with recovery)
- `lib/loyalty/recovery.ts` (optional helper module)
- Updated `services/ratingslip/index.ts` (if needed)
- Integration tests: `__tests__/integration/ratingslip-loyalty.test.ts`

**Quality Gates**:
- Action returns combined `{ ratingSlip, loyalty }` payload on success
- Partial failures return `PARTIAL_COMPLETION` error with `{ slipId, correlationId }`
- Recovery action is idempotent (safe to replay)
- TypeScript type-safe (no `any` casts, explicit interfaces)
- Performance <500ms end-to-end for happy path (measured in tests)
- No residual points logic in RatingSlip service
- Correlation IDs logged for all outcomes (success, partial, failure)

#### Task 2.1.2 — Integration Test Suite (2h) 🚨 **EXPANDED**

**Objective**: Validate end-to-end RatingSlip → Loyalty flow including saga recovery, concurrency, and idempotency.

**Critical Tests (MUST HAVE):**

```typescript
// __tests__/integration/ratingslip-loyalty.test.ts

describe('RatingSlip → Loyalty Integration', () => {

  test('Happy path: Complete slip → ledger entry → tier update', async () => {
    // Arrange: Create test player, visit, rating slip
    const { player, slip } = await createTestScenario();

    // Act: Complete rating slip
    const result = await completeRatingSlip(slip.id);

    // Assert: Verify combined response
    expect(result.success).toBe(true);
    expect(result.data.loyalty.pointsEarned).toBeGreaterThan(0);
    expect(result.data.loyalty.tier).toBe('BRONZE');

    // Verify ledger entry
    const ledger = await queryLedger(player.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      rating_slip_id: slip.id,
      transaction_type: 'GAMEPLAY',
      event_type: 'RATING_SLIP_COMPLETED',
      points_change: result.data.loyalty.pointsEarned,
    });

    // Verify player balance
    const balance = await getPlayerBalance(player.id);
    expect(balance.current_balance).toBe(result.data.loyalty.newBalance);
  });

  test('Idempotency: Duplicate completion → single ledger entry', async () => {
    const { slip } = await createTestScenario();

    // Complete twice
    await completeRatingSlip(slip.id);
    await completeRatingSlip(slip.id);

    // Verify only 1 ledger entry
    const ledger = await queryLedger(slip.player_id);
    expect(ledger).toHaveLength(1);
  });

  test('Manual reward: Staff action → MANUAL_BONUS ledger entry', async () => {
    const { player } = await createTestScenario();

    const result = await manualReward({
      playerId: player.id,
      pointsChange: 500,
      reason: 'VIP welcome bonus',
      staffId: 'staff-123',
    });

    expect(result.success).toBe(true);
    expect(result.data.pointsEarned).toBe(500);

    const ledger = await queryLedger(player.id);
    expect(ledger[0]).toMatchObject({
      transaction_type: 'MANUAL_BONUS',
      source: 'manual',
      reason: 'VIP welcome bonus',
    });
  });

  test('Rate limiting: >10 manual rewards/min → 429 error', async () => {
    const { player } = await createTestScenario();

    // Exhaust rate limit
    for (let i = 0; i < 10; i++) {
      await manualReward({
        playerId: player.id,
        pointsChange: 10,
        reason: `Test ${i}`,
        staffId: 'staff-1',
      });
    }

    // 11th request should fail
    const result = await manualReward({
      playerId: player.id,
      pointsChange: 10,
      reason: 'Test 11',
      staffId: 'staff-1',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  test('Performance: Completion <500ms', async () => {
    const { slip } = await createTestScenario();

    const start = Date.now();
    await completeRatingSlip(slip.id);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
  });

  // 🚨 NEW: Saga recovery test
  test('Saga Recovery: Slip closed, loyalty fails → recovery succeeds', async () => {
    const { player, slip } = await createTestScenario();

    // Mock loyalty service failure
    const loyaltyService = createLoyaltyService(supabase);
    jest.spyOn(loyaltyService, 'accruePointsFromSlip').mockRejectedValueOnce(
      new Error('Database connection lost')
    );

    // Attempt completion (should return PARTIAL_COMPLETION)
    const result = await completeRatingSlip(slip.id);
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('PARTIAL_COMPLETION');
    expect(result.error.metadata).toHaveProperty('correlationId');

    // Verify slip is CLOSED but no ledger entry
    const { data: closedSlip } = await supabase
      .from('ratingslip')
      .select('status')
      .eq('id', slip.id)
      .single();
    expect(closedSlip.status).toBe('CLOSED');

    const { data: ledger } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('rating_slip_id', slip.id);
    expect(ledger).toHaveLength(0);

    // Run recovery (should succeed with same idempotency key)
    const recovery = await recoverSlipLoyalty(slip.id, result.error.metadata.correlationId);
    expect(recovery.success).toBe(true);
    expect(recovery.data.pointsEarned).toBeGreaterThan(0);

    // Verify ledger entry now exists
    const { data: ledgerAfter } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('rating_slip_id', slip.id);
    expect(ledgerAfter).toHaveLength(1);
    expect(ledgerAfter[0].session_id).toBe(slip.id);  // Deterministic idempotency key
  });

  // 🚨 NEW: Concurrency test
  test('Concurrency: Simultaneous manual reward + slip completion → correct final balance', async () => {
    const { player, slip } = await createTestScenario();

    // Start both operations concurrently
    const [rewardResult, completionResult] = await Promise.all([
      manualReward({
        playerId: player.id,
        pointsChange: 500,
        reason: 'VIP welcome bonus',
        staffId: 'staff-1',
        rewardId: 'reward_test_001',  // Unique ID
      }),
      completeRatingSlip(slip.id),
    ]);

    expect(rewardResult.success).toBe(true);
    expect(completionResult.success).toBe(true);

    // Verify final balance = sum of both operations
    const { data: balance } = await supabase
      .from('player_loyalty')
      .select('current_balance')
      .eq('player_id', player.id)
      .single();

    const expectedBalance = 500 + completionResult.data.loyalty.pointsEarned;
    expect(balance.current_balance).toBe(expectedBalance);

    // Verify 2 ledger entries
    const { data: ledger } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('player_id', player.id)
      .order('created_at', { ascending: true });

    expect(ledger).toHaveLength(2);
    expect(ledger.map(l => l.transaction_type)).toContain('MANUAL_BONUS');
    expect(ledger.map(l => l.transaction_type)).toContain('GAMEPLAY');
  });

  // 🚨 NEW: Idempotency edge case (manual reward date bucketing)
  test('Idempotency: Manual reward same day → single entry, next day → second entry', async () => {
    const { player } = await createTestScenario();

    const input = {
      playerId: player.id,
      pointsChange: 250,
      reason: 'Daily bonus reward',
      staffId: 'staff-1',
    };

    // Day 1: Issue reward
    await manualReward(input);

    // Same day: Try again (should be idempotent)
    await manualReward(input);

    // Verify only 1 ledger entry
    const { data: ledgerDay1 } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('player_id', player.id)
      .eq('source', 'manual');
    expect(ledgerDay1).toHaveLength(1);

    // Mock time advance to next day
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));

    // Day 2: Issue same reward (should create new entry)
    await manualReward(input);

    // Verify 2 ledger entries (different date buckets)
    const { data: ledgerDay2 } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('player_id', player.id)
      .eq('source', 'manual');
    expect(ledgerDay2).toHaveLength(2);

    jest.useRealTimers();
  });
});
```

**Test Data Fixtures**:
- `createTestScenario()` helper creates player + loyalty record + visit + rating slip
- Reuse existing `createTestPlayer`, `createTestVisit` helpers if available

**Quality Gates**:
- All 8 integration tests passing (5 original + 3 new hardening tests)
- Coverage >85% for new action code
- Saga recovery test validates partial completion handling
- Concurrency test confirms no lost updates
- Idempotency test validates date-bucketed keys
- Tests run in CI (no external Redis/queue dependencies)

#### Track 1 Exit Checklist
- [ ] `completeRatingSlip` server action with recovery path implemented
- [ ] `recoverSlipLoyalty` action for partial completion recovery
- [ ] Integration tests cover:
  - Happy path (slip completion → ledger entry)
  - Idempotency (duplicate completion → single entry)
  - Manual reward with rate limiting
  - Performance (<500ms)
  - 🚨 **NEW**: Saga recovery (partial completion → recovery succeeds)
  - 🚨 **NEW**: Concurrency (simultaneous operations → correct balance)
  - 🚨 **NEW**: Idempotency edge cases (date-bucketed manual rewards)
- [ ] No residual points logic in RatingSlip service
- [ ] Type definitions explicit (no `ReturnType` inference)
- [ ] Correlation IDs logged for all flow paths
- [ ] Structured error logs include recovery instructions

---

## 6. Quality Gates & Verification Matrix

| Gate | Owner | Timing | Evidence |
|------|-------|--------|----------|
| Manual reward action unit tests | Backend Architect | Post Task 2.0.1 | `npm test -- __tests__/actions/loyalty-actions.test.ts` |
| Rate limiter unit tests | Backend Architect | Post Task 2.0.1 | `npm test -- __tests__/lib/rate-limiter.test.ts` |
| RatingSlip action unit tests | TypeScript Pro | Post Task 2.1.1 | `npm test -- __tests__/actions/ratingslip-actions.test.ts` |
| Integration test suite | Shared | Task 2.1.2 | `npm test -- __tests__/integration/ratingslip-loyalty.test.ts` |
| Type check | Shared | Final gate | `npx tsc --noEmit` (0 errors) |
| Lint | Shared | Final gate | `npm run lint` (0 warnings) |
| Performance validation | TypeScript Pro | Integration tests | <500ms measured in test output |
| Observability logs | Backend Architect | Manual verification | Structured logs match canonical schema |

---

## 7. Risk Management & Mitigations

| Risk | Mitigation | Trigger Action |
|------|------------|----------------|
| Rate limit state lost on deployment | Acceptable for MVP (manual rewards low-frequency); document in runbook | None (expected behavior) |
| Need to add 2nd consumer later | Documented extension path in §9; thin wrapper preserves interface | Implement event wrapper when Analytics/Marketing requests telemetry |
| Loyalty service error after slip closed | Staff can use `manualReward` to backfill points using `rating_slip_id` as `session_id` | Add runbook procedure for point recovery |
| Performance >500ms | Direct service call is fastest path; profile if needed | Monitor p95 latency in production; optimize RPC if >500ms |

---

## 8. Deliverables & Documentation Updates

**Code Modules**:
- `app/actions/loyalty-actions.ts` (NEW)
- `app/actions/ratingslip-actions.ts` (NEW)
- `lib/rate-limiter.ts` (NEW)
- `lib/telemetry/emit-telemetry.ts` (NEW, optional)

**Tests**:
- `__tests__/actions/loyalty-actions.test.ts` (NEW)
- `__tests__/actions/ratingslip-actions.test.ts` (NEW)
- `__tests__/integration/ratingslip-loyalty.test.ts` (NEW)
- `__tests__/lib/rate-limiter.test.ts` (NEW)

**Documentation**:
- Update `PHASE_6_DEVELOPER_CHECKLIST.md` with revised Wave 2 tasks
- Create `WAVE_2_EXTENSION_PATH.md` documenting upgrade triggers
- Update API contract docs with `RatingSlipCompletionResult` DTO

---

## 9. Extension Path (Future Phases)

### When to Re-Introduce Deferred Components

| Component | Implement When | Observable Trigger | Estimated Effort |
|-----------|----------------|-------------------|------------------|
| **Event wrapper** | Second consumer domain needs events | Analytics OR Marketing subscribes to `RATING_SLIP_COMPLETED` | 2h |
| **Event log table** | Async replay required | Event versioning needed OR compliance mandates | 3h |
| **Redis rate limiting** | Multi-instance deployment | Horizontal scaling enabled (>2 Next.js instances) | 1h |
| **Queue workers** | Processing latency >2s | `calculateAndAssignPoints` p95 >2s | 4h |

### Migration Strategy: Direct Call → Event Bus

**Phase 1 (Current)**: Direct service invocation
```typescript
const loyaltyResult = await loyaltyService.accruePointsFromSlip(telemetry);
```

**Phase 2 (When >1 Consumer)**: Thin event wrapper
```typescript
// Replace implementation, keep signature
const loyaltyResult = await emitTelemetryAndAwait('RATING_SLIP_COMPLETED', telemetry);

// lib/telemetry/emit-telemetry.ts
export async function emitTelemetryAndAwait(type, payload) {
  // Call all registered consumers
  const [loyalty, analytics, marketing] = await Promise.all([
    loyaltyService.accruePointsFromSlip(payload),
    analyticsService.trackGameplay(payload),
    marketingService.evaluatePromotion(payload),
  ]);
  return loyalty;
}
```

**Phase 3 (When Async Required)**: Queue worker
```typescript
export async function emitTelemetryAndAwait(type, payload) {
  await queue.publish('telemetry', { type, payload });
  return pollForResult(payload.ratingSlipId, { timeout: 2000 });
}
```

**Interface Stability Contract**: `LoyaltyService.accruePointsFromSlip` signature MUST remain stable across all phases.

---

## 10. Handoff Checklist to Wave 3

- [ ] Provide `RatingSlipCompletionResult` DTO schema to UI team
- [ ] Share `manualReward` action usage guide with MTL team (including rate limit behavior)
- [ ] Confirm integration test suite included in CI pipeline
- [ ] Document structured logging schema for observability dashboard
- [ ] Archive extension path document for future infrastructure upgrades

---

## 11. Complexity & Risk Summary

### Complexity Reduction (vs Original Over-Engineered Plan)

| Metric | Original Wave 2 | Hardened Simplified | Reduction |
|--------|----------------|---------------------|-----------|
| **Estimated Time** | 7h | 6-7h | **15%** (balanced for production readiness) |
| **SQL Tables** | 2 (loyalty_ledger + event_log) | 1 (loyalty_ledger with audit columns) | **50%** |
| **Service Modules** | 5 (dispatcher, handlers, bus, ledger, business) | 3 (loyalty + actions + recovery) | **40%** |
| **Infrastructure Dependencies** | Redis + Queue | None (in-memory rate limiter) | **100%** |
| **Lines of Code** | ~800 LOC | ~500 LOC | **38%** |
| **Integration Tests** | 8 scenarios (event replay focus) | 8 scenarios (saga + concurrency focus) | **0%** (same count, better coverage) |
| **Operational Runbooks** | Event replay, Redis failover, queue monitoring | Saga recovery, correlation tracing | **50%** |

**Net Result**: 40% reduction in infrastructure complexity while **INCREASING** production reliability through hardening.

### Risk Mitigation Progress

| Risk | Before Hardening | After Hardening | Evidence |
|------|------------------|-----------------|----------|
| **Data Loss (Partial Completion)** | 🔴 HIGH | 🟢 LOW | Recovery action + correlation tracing |
| **Duplicate Manual Rewards** | 🔴 HIGH | 🟢 LOW | Deterministic keys + date bucketing + idempotency tests |
| **Concurrency Races** | 🟡 MEDIUM | 🟢 LOW | RPC FOR UPDATE + before/after audit columns + concurrency test |
| **Untraceable Failures** | 🟡 MEDIUM | 🟢 LOW | Correlation IDs + structured logs + recovery metadata |
| **Staff Abuse** | 🟡 MEDIUM | 🟢 LOW | Permission checks + rate limiter + audit trail (staff_id) |
| **Balance Drift** | 🟡 MEDIUM | 🟢 LOW | Ledger verification via before/after columns |

**Overall Risk Level**: 🔴 **HIGH** → 🟢 **LOW** with +2h investment in hardening.

---

## 12. Architecture Decision Record (ADR) Summary

**Decision**: Use direct service invocation within server actions instead of generic event bus for RatingSlip → Loyalty integration.

**Status**: APPROVED (unanimous recommendation from Backend Architect, TypeScript Pro, System Architect)

**Rationale**:
1. **Single Consumer**: Only Loyalty consumes RatingSlip telemetry in Phase 6
2. **Same Runtime**: Both services in Next.js process (no network overhead)
3. **Scale Appropriate**: ~100 concurrent sessions doesn't justify distributed event infrastructure
4. **HYBRID Pattern**: Server action orchestration aligns with `BALANCED_ARCHITECTURE_QUICK.md` for 2-domain workflows
5. **KISS/YAGNI**: Honors Canonical PRD principles (don't build what you don't need)

**Consequences**:
- **Positive**: 55% complexity reduction, faster delivery, simpler debugging, lower operational burden
- **Negative**: Requires refactoring when 2nd consumer added (mitigated by 2h extension path)
- **Neutral**: Performance identical or better than event bus (synchronous <500ms vs potential >2s)

**Alternatives Considered**:
- ❌ Generic event dispatcher: Over-engineered for current needs
- ❌ Database triggers: Loses type safety, hard to test
- ✅ Direct call with wrapper: Chosen (clean extension path documented)

---

**Status**: ✅ Ready for Execution
**Last Updated**: 2025-10-13
**Owner**: Phase 6 Working Group
**Approvers**: Backend Architect, TypeScript Pro, System Architect (unanimous approval)
**Supersedes**: `WAVE_2_EVENT_API_WORKFLOW.md` (archived as reference)

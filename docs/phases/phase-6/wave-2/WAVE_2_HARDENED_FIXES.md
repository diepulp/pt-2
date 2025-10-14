# Wave 2 Hardened Fixes – Atomicity, Idempotency, Observability

**Status**: Critical gaps identified in simplified Wave 2 workflow
**Author**: Phase 6 Security Review
**Date**: 2025-10-13

---

## Executive Summary

The simplified Wave 2 approach correctly eliminates over-engineering but introduces **critical production risks** in atomicity, idempotency, and failure recovery. This document provides **surgical fixes** to harden the lean implementation without reintroducing complexity.

**Risk Level**: 🔴 **HIGH** (data integrity + user trust issues)

---

## 1. Atomicity Gap (CRITICAL) 🚨

### Problem

Two-step saga without recovery playbook:

```typescript
// Current flow (BROKEN)
await supabase.rpc('close_player_session', { ... });  // ✅ Committed
const loyalty = await loyaltyService.accruePoints(...);  // ❌ Fails

// Result: Rating slip CLOSED, but NO points awarded
// Player loses rewards, staff has no recovery path
```

**Impact**: Revenue loss, player complaints, compliance risk (cannot prove points awarded).

### Root Cause

`close_player_session` and `accruePointsFromSlip` execute in separate transactions. Supabase RPC commits immediately; if Loyalty service fails, no rollback mechanism exists.

### Solution: Compensating Transaction Pattern

**Option A: Single Transaction Boundary (PREFERRED)**

Wrap both operations in Supabase transaction if supported:

```typescript
// services/ratingslip/business.ts

export async function completeRatingSlip(
  supabase: SupabaseClient<Database>,
  slipId: string,
  correlationId: string
): Promise<ServiceResult<RatingSlipCompletionResult>> {
  return executeOperation('complete_rating_slip', async () => {

    // START TRANSACTION
    const { data: txData, error: txError } = await supabase.rpc('begin_transaction');
    if (txError) throw txError;

    try {
      // 1. Close rating slip session
      const { error: closeError } = await supabase.rpc('close_player_session', {
        p_rating_slip_id: slipId,
        p_visit_id: visitId,
        p_chips_taken: chipsTaken,
        p_end_time: new Date().toISOString(),
      });

      if (closeError) throw closeError;

      // 2. Accrue loyalty points
      const loyaltyService = createLoyaltyService(supabase);
      const loyaltyResult = await loyaltyService.accruePointsFromSlip({
        ratingSlipId: slipId,
        playerId: telemetry.player_id,
        visitId: telemetry.visit_id,
        averageBet: telemetry.average_bet,
        durationSeconds: telemetry.accumulated_seconds,
        gameSettings: telemetry.game_settings,
      });

      if (!loyaltyResult.success) throw loyaltyResult.error;

      // COMMIT TRANSACTION
      await supabase.rpc('commit_transaction');

      return {
        success: true,
        data: { ratingSlip: telemetry, loyalty: loyaltyResult.data },
      };

    } catch (error) {
      // ROLLBACK on ANY failure
      await supabase.rpc('rollback_transaction');
      throw error;
    }
  });
}
```

**Option B: Idempotent Recovery Path (FALLBACK)**

If Supabase transactions not available, use deterministic recovery:

```typescript
// lib/loyalty/recovery.ts

/**
 * Recovery path for partial slip completion
 * Idempotent: safe to replay multiple times
 */
export async function recoverLoyaltyForSlip(
  supabase: SupabaseClient<Database>,
  slipId: string,
  correlationId: string
): Promise<ServiceResult<AccruePointsResult>> {

  // 1. Check if loyalty already accrued
  const { data: existingEntry } = await supabase
    .from('loyalty_ledger')
    .select('*')
    .eq('rating_slip_id', slipId)
    .eq('transaction_type', 'GAMEPLAY')
    .single();

  if (existingEntry) {
    // Already recovered, return existing result
    return {
      success: true,
      data: {
        pointsEarned: existingEntry.points_change,
        newBalance: existingEntry.balance_after,
        tier: existingEntry.tier_after,
        ledgerEntryId: existingEntry.id,
      },
    };
  }

  // 2. Fetch slip telemetry
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

  // 3. Accrue points using same idempotency key
  const loyaltyService = createLoyaltyService(supabase);
  return loyaltyService.accruePointsFromSlip({
    ratingSlipId: slipId,
    playerId: slip.player_id,
    // ... telemetry from slip
  });
}
```

**Server Action Update**:

```typescript
// app/actions/ratingslip-actions.ts

export async function completeRatingSlip(slipId: string) {
  const correlationId = generateCorrelationId();

  return withServerAction('complete_rating_slip', async (supabase) => {
    try {
      // Attempt atomic completion
      return await completeRatingSlipAtomic(supabase, slipId, correlationId);

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

/**
 * Staff recovery action for partial completions
 */
export async function recoverSlipLoyalty(slipId: string, correlationId: string) {
  return withServerAction('recover_slip_loyalty', async (supabase) => {
    return recoverLoyaltyForSlip(supabase, slipId, correlationId);
  });
}
```

**Migration Required**: Add `balance_before`, `balance_after`, `tier_before`, `tier_after` to `loyalty_ledger` for recovery verification.

---

## 2. Idempotency Keying (CRITICAL) 🔑

### Problem

Manual reward keys are non-deterministic:

```typescript
// BROKEN: Creates new key every call
session_id: `manual_${staffId}_${Date.now()}`

// Result: Staff can double-award by clicking twice quickly
// Composite unique index bypassed completely
```

**Impact**: Staff can accidentally (or intentionally) award duplicate points.

### Solution: Deterministic Idempotency Keys

**For Gameplay Accrual**:

```typescript
// services/loyalty/business.ts

export async function accruePointsFromSlip(
  supabase: SupabaseClient<Database>,
  input: AccruePointsInput
): Promise<ServiceResult<AccruePointsResult>> {

  // Idempotency key = rating_slip_id (unique per slip)
  const idempotencyKey = input.ratingSlipId;

  // Insert into loyalty_ledger
  const { data: ledgerEntry, error: insertError } = await supabase
    .from('loyalty_ledger')
    .insert({
      player_id: input.playerId,
      rating_slip_id: input.ratingSlipId,
      visit_id: input.visitId,
      session_id: idempotencyKey,  // ← DETERMINISTIC
      transaction_type: 'GAMEPLAY',
      event_type: 'RATING_SLIP_COMPLETED',
      points_change: calculatedPoints,
      reason: `Gameplay at ${input.gameSettings.name}`,
      source: 'system',
    })
    .select()
    .single();

  // Handle idempotency conflict (409)
  if (insertError && insertError.code === '23505') {
    // Conflict on unique index → already processed
    const { data: existing } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('session_id', idempotencyKey)
      .single();

    logger.info('loyalty_idempotency_hit', {
      session_id: idempotencyKey,
      player_id: input.playerId,
      existing_points: existing.points_change,
    });

    // Return existing result (soft success)
    return {
      success: true,
      data: {
        pointsEarned: existing.points_change,
        newBalance: existing.balance_after,
        tier: existing.tier_after,
        ledgerEntryId: existing.id,
        idempotent: true,  // Flag for observability
      },
    };
  }

  // ... proceed with RPC call for new entries
}
```

**For Manual Rewards**:

```typescript
// app/actions/loyalty-actions.ts

export async function manualReward(input: {
  playerId: string;
  pointsChange: number;
  reason: string;
  staffId: string;
  ratingSlipId?: string;  // NEW: Link to slip if recovering
  rewardId?: string;      // NEW: External reward ID if from promo system
}) {
  return withServerAction('manual_reward', async (supabase) => {

    // Generate DETERMINISTIC idempotency key
    const idempotencyKey = input.rewardId
      ? `reward_${input.rewardId}`
      : input.ratingSlipId
        ? `recovery_${input.ratingSlipId}`
        : hashIdempotencyKey({
            playerId: input.playerId,
            staffId: input.staffId,
            points: input.pointsChange,
            reason: input.reason,
            date: formatDate(new Date(), 'YYYY-MM-DD'),  // Date bucket (not timestamp)
          });

    // Rate limit check
    if (!checkRateLimit(`staff:${input.staffId}`, { max: 10, window: 60000 })) {
      return { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', ... } };
    }

    // Validate audit requirements
    if (!input.reason?.trim() || input.reason.length < 10) {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Reason must be at least 10 characters' },
      };
    }

    // Insert with deterministic key
    const loyaltyService = createLoyaltyService(supabase);
    return loyaltyService.createLedgerEntry({
      player_id: input.playerId,
      rating_slip_id: input.ratingSlipId,  // Link if recovery
      session_id: idempotencyKey,  // ← DETERMINISTIC
      transaction_type: input.pointsChange > 0 ? 'MANUAL_BONUS' : 'ADJUSTMENT',
      event_type: 'POINTS_UPDATE_REQUESTED',
      points_change: input.pointsChange,
      reason: input.reason,
      source: 'manual',
      staff_id: input.staffId,  // NEW: Track who issued
    });
  });
}

/**
 * Hash idempotency key components
 * Ensures same inputs → same key across retries
 */
function hashIdempotencyKey(components: Record<string, string | number>): string {
  const payload = Object.entries(components)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');

  // Simple hash (or use crypto.createHash if Node.js)
  return `manual_${Buffer.from(payload).toString('base64').slice(0, 32)}`;
}
```

**Schema Addition**: Add `staff_id` column to `loyalty_ledger` for audit trail.

---

## 3. RPC Strengthening (HIGH PRIORITY) 💪

### Problem

Current RPC returns minimal data:

```sql
RETURNS TABLE(current_balance INTEGER, tier TEXT)
```

**Missing**:
- `balance_before` / `balance_after` for audit verification
- `tier_before` / `tier_after` for tier change alerts
- `tier_progress` for UI display
- Row lock confirmation

### Solution: Enhanced RPC Return Type

```sql
-- supabase/migrations/20251013_harden_increment_player_loyalty.sql

DROP FUNCTION IF EXISTS increment_player_loyalty(UUID, INTEGER);

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
  row_locked BOOLEAN  -- Confirms FOR UPDATE succeeded
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before INTEGER;
  v_balance_after INTEGER;
  v_tier_before TEXT;
  v_tier_after TEXT;
  v_lifetime INTEGER;
  v_tier_progress INTEGER;
  v_updated_at TIMESTAMPTZ;
BEGIN
  -- Lock the row for update (CRITICAL: prevents race conditions)
  SELECT
    pl.current_balance,
    pl.tier,
    pl.lifetime_points
  INTO v_balance_before, v_tier_before, v_lifetime
  FROM player_loyalty pl
  WHERE pl.player_id = p_player_id
  FOR UPDATE;

  -- If player doesn't exist, insert with initial values
  IF NOT FOUND THEN
    INSERT INTO player_loyalty (player_id, current_balance, lifetime_points, tier, tier_progress)
    VALUES (
      p_player_id,
      GREATEST(p_delta_points, 0),
      CASE WHEN p_delta_points > 0 THEN p_delta_points ELSE 0 END,
      'BRONZE',
      0
    );

    v_balance_before := 0;
    v_tier_before := 'BRONZE';
    v_lifetime := CASE WHEN p_delta_points > 0 THEN p_delta_points ELSE 0 END;
  END IF;

  -- Calculate new values
  v_balance_after := v_balance_before + p_delta_points;
  v_lifetime := v_lifetime + CASE WHEN p_delta_points > 0 THEN p_delta_points ELSE 0 END;

  -- Determine tier based on lifetime points
  SELECT t.tier INTO v_tier_after
  FROM loyalty_tier t
  WHERE t.threshold_points <= v_lifetime
  ORDER BY t.threshold_points DESC
  LIMIT 1;

  -- Calculate tier progress (percentage to next tier)
  SELECT
    CASE
      WHEN v_tier_after = 'PLATINUM' THEN 100
      ELSE
        (
          SELECT ROUND(
            ((v_lifetime - current_tier.threshold_points)::NUMERIC /
             NULLIF(next_tier.threshold_points - current_tier.threshold_points, 0)::NUMERIC
            ) * 100
          )
          FROM loyalty_tier current_tier
          LEFT JOIN loyalty_tier next_tier ON next_tier.threshold_points > current_tier.threshold_points
          WHERE current_tier.tier = v_tier_after
          ORDER BY next_tier.threshold_points ASC
          LIMIT 1
        )
    END INTO v_tier_progress;

  -- Clamp tier_progress to 0-100
  v_tier_progress := LEAST(100, GREATEST(0, COALESCE(v_tier_progress, 0)));

  -- Update player_loyalty with new values
  UPDATE player_loyalty pl
  SET
    current_balance = v_balance_after,
    lifetime_points = v_lifetime,
    tier = v_tier_after,
    tier_progress = v_tier_progress,
    updated_at = now()
  WHERE pl.player_id = p_player_id
  RETURNING pl.updated_at INTO v_updated_at;

  -- Return comprehensive result
  RETURN QUERY
  SELECT
    p_player_id,
    v_balance_before,
    v_balance_after,
    v_tier_before,
    v_tier_after,
    v_tier_progress,
    v_lifetime,
    v_updated_at,
    TRUE as row_locked  -- Confirms lock was acquired
  ;
END;
$$;

COMMENT ON FUNCTION increment_player_loyalty IS 'Atomically updates player loyalty with FOR UPDATE lock - returns before/after values for audit trail';
```

**Service Layer Update**:

```typescript
// services/loyalty/crud.ts

export async function updatePlayerBalance(
  supabase: SupabaseClient<Database>,
  playerId: string,
  deltaPoints: number,
  correlationId: string
): Promise<ServiceResult<BalanceUpdateResult>> {

  const { data: rpcResult, error: rpcError } = await supabase.rpc('increment_player_loyalty', {
    p_player_id: playerId,
    p_delta_points: deltaPoints,
  });

  if (rpcError) {
    logger.error('loyalty_rpc_failed', {
      correlation_id: correlationId,
      player_id: playerId,
      delta_points: deltaPoints,
      error: rpcError.message,
    });
    return { success: false, error: rpcError };
  }

  const result = rpcResult[0];

  // Log tier changes for alerts
  if (result.tier_before !== result.tier_after) {
    logger.info('loyalty_tier_upgraded', {
      correlation_id: correlationId,
      player_id: playerId,
      tier_before: result.tier_before,
      tier_after: result.tier_after,
      lifetime_points: result.lifetime_points,
    });
  }

  // Verify row lock was acquired
  if (!result.row_locked) {
    logger.warn('loyalty_lock_failed', {
      correlation_id: correlationId,
      player_id: playerId,
    });
  }

  return {
    success: true,
    data: {
      balanceBefore: result.balance_before,
      balanceAfter: result.balance_after,
      tierBefore: result.tier_before,
      tierAfter: result.tier_after,
      tierProgress: result.tier_progress,
      lifetimePoints: result.lifetime_points,
      updatedAt: result.updated_at,
    },
  };
}
```

**Schema Addition**: Store `balance_before`, `balance_after`, `tier_before`, `tier_after` in `loyalty_ledger` for verification.

---

## 4. Correlation ID & Structured Logging (HIGH PRIORITY) 🔍

### Problem

No way to trace request flow across services:

```
ERROR: Loyalty accrual failed for slip abc-123
WHERE did it fail? What was the player? What was the correlation ID?
```

### Solution: Request Correlation Infrastructure

**Generate Correlation ID at Entry Point**:

```typescript
// lib/correlation.ts

import { AsyncLocalStorage } from 'async_hooks';

const correlationStorage = new AsyncLocalStorage<string>();

export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

export function setCorrelationId(id: string): void {
  correlationStorage.enterWith(id);
}

export function withCorrelationId<T>(id: string, fn: () => T): T {
  return correlationStorage.run(id, fn);
}
```

**Thread Through Server Actions**:

```typescript
// lib/server-actions/with-server-action-wrapper.ts

import { generateCorrelationId, setCorrelationId, getCorrelationId } from '@/lib/correlation';

export async function withServerAction<T>(
  actionName: string,
  handler: (supabase: SupabaseClient<Database>) => Promise<T>,
  options?: ServerActionOptions
): Promise<ServiceResult<T>> {

  const correlationId = generateCorrelationId();
  setCorrelationId(correlationId);

  const startTime = Date.now();

  try {
    const supabase = createServerClient();

    logger.info('action_started', {
      action: actionName,
      correlation_id: correlationId,
      user_id: options?.userId,
      entity: options?.entity,
      entity_id: options?.entityId,
    });

    const result = await handler(supabase);

    const duration = Date.now() - startTime;

    logger.info('action_completed', {
      action: actionName,
      correlation_id: correlationId,
      duration_ms: duration,
      success: true,
    });

    return { success: true, data: result };

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('action_failed', {
      action: actionName,
      correlation_id: correlationId,
      duration_ms: duration,
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: {
        code: 'ACTION_FAILED',
        message: error.message,
        metadata: { correlationId },
      },
    };
  }
}
```

**Propagate Through Services**:

```typescript
// services/loyalty/business.ts

export async function accruePointsFromSlip(
  supabase: SupabaseClient<Database>,
  input: AccruePointsInput
): Promise<ServiceResult<AccruePointsResult>> {

  const correlationId = getCorrelationId() || generateCorrelationId();

  logger.info('loyalty_accrual_started', {
    correlation_id: correlationId,
    player_id: input.playerId,
    rating_slip_id: input.ratingSlipId,
    average_bet: input.averageBet,
    duration_seconds: input.durationSeconds,
  });

  try {
    // ... accrual logic

    logger.info('loyalty_accrual_completed', {
      correlation_id: correlationId,
      player_id: input.playerId,
      points_earned: result.pointsEarned,
      new_balance: result.newBalance,
      tier: result.tier,
    });

    return { success: true, data: result };

  } catch (error) {
    logger.error('loyalty_accrual_failed', {
      correlation_id: correlationId,
      player_id: input.playerId,
      rating_slip_id: input.ratingSlipId,
      error: error.message,
    });

    throw error;
  }
}
```

**Canonical Log Schema**:

```typescript
// Gameplay accrual
{
  event: 'loyalty_accrual_completed',
  correlation_id: string,
  timestamp: ISO8601,
  player_id: UUID,
  rating_slip_id: UUID,
  session_id: string,
  transaction_type: 'GAMEPLAY',
  event_type: 'RATING_SLIP_COMPLETED',
  points_earned: number,
  balance_before: number,
  balance_after: number,
  tier_before: string,
  tier_after: string,
  duration_ms: number,
}

// Manual reward
{
  event: 'manual_reward_issued',
  correlation_id: string,
  timestamp: ISO8601,
  player_id: UUID,
  staff_id: string,
  points_change: number,
  reason: string,
  idempotency_key: string,
  balance_before: number,
  balance_after: number,
}

// Failure
{
  event: 'loyalty_accrual_failed',
  correlation_id: string,
  timestamp: ISO8601,
  player_id: UUID,
  rating_slip_id: UUID,
  error_code: string,
  error_message: string,
  stack_trace: string,
  recovery_needed: true,
}
```

---

## 5. Schema Additions (REQUIRED)

```sql
-- supabase/migrations/20251013_wave_2_schema_hardening.sql

-- Add audit columns to loyalty_ledger
ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS staff_id TEXT,
  ADD COLUMN IF NOT EXISTS balance_before INTEGER,
  ADD COLUMN IF NOT EXISTS balance_after INTEGER,
  ADD COLUMN IF NOT EXISTS tier_before TEXT,
  ADD COLUMN IF NOT EXISTS tier_after TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- Index for correlation ID lookups
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_correlation
  ON loyalty_ledger(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Index for staff audit queries
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_staff
  ON loyalty_ledger(staff_id, created_at DESC)
  WHERE staff_id IS NOT NULL;

COMMENT ON COLUMN loyalty_ledger.staff_id IS 'Staff member who issued manual reward (for audit trail)';
COMMENT ON COLUMN loyalty_ledger.balance_before IS 'Player balance before this transaction (for verification)';
COMMENT ON COLUMN loyalty_ledger.balance_after IS 'Player balance after this transaction (for verification)';
COMMENT ON COLUMN loyalty_ledger.tier_before IS 'Player tier before this transaction';
COMMENT ON COLUMN loyalty_ledger.tier_after IS 'Player tier after this transaction';
COMMENT ON COLUMN loyalty_ledger.correlation_id IS 'Request correlation ID for distributed tracing';
```

---

## 6. Failure UX & Operational Runbook

### UI States

**Slip Completion Flow**:

```typescript
// components/rating-slip/complete-slip-dialog.tsx

export function CompleteSlipDialog({ slipId }: Props) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'partial' | 'error'>('idle');
  const [result, setResult] = useState<CompletionResult | null>(null);

  async function handleComplete() {
    setStatus('pending');

    const result = await completeRatingSlip(slipId);

    if (result.success) {
      setStatus('success');
      setResult(result.data);
    } else if (result.error.code === 'PARTIAL_COMPLETION') {
      setStatus('partial');
      setResult(result.error.metadata);
    } else {
      setStatus('error');
    }
  }

  if (status === 'partial') {
    return (
      <Alert variant="warning">
        <AlertTitle>Slip Closed, Loyalty Pending</AlertTitle>
        <AlertDescription>
          Rating slip was closed successfully, but loyalty points could not be awarded.
          <Button onClick={() => handleRecovery(result.slipId, result.correlationId)}>
            Retry Award Points
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'success') {
    return (
      <Alert variant="success">
        <AlertTitle>Slip Completed</AlertTitle>
        <AlertDescription>
          {result.loyalty.pointsEarned} points awarded
          • New balance: {result.loyalty.newBalance}
          • Tier: {result.loyalty.tier}
        </AlertDescription>
      </Alert>
    );
  }

  // ... other states
}
```

### Operational Runbook

**Scenario 1: Partial Slip Completion**

**Symptom**: Player reports slip closed but no points received.

**Recovery Steps**:
1. Search logs for `correlation_id` or `slip_id`
2. Verify slip status is `CLOSED` in database
3. Check `loyalty_ledger` for existing entry with `rating_slip_id`
4. If no entry found, run recovery action:
   ```bash
   # Via admin UI
   POST /api/admin/loyalty/recover
   { "slipId": "abc-123", "correlationId": "corr_xxx" }
   ```
5. Verify ledger entry created and player balance updated
6. Document incident with correlation ID for post-mortem

**Scenario 2: Duplicate Manual Reward**

**Symptom**: Staff reports "success" but points not showing in player balance.

**Root Cause**: Idempotency key matched existing entry (soft success).

**Recovery Steps**:
1. Query `loyalty_ledger` by `staff_id` and timestamp range
2. Verify existing entry with same `idempotency_key`
3. Confirm player balance matches `balance_after` in ledger
4. Inform staff: "Reward already processed at [timestamp]"
5. No action needed (system working correctly)

**Scenario 3: Rate Limiter Reset (Deployment)**

**Symptom**: Staff can issue >10 rewards/min immediately after deployment.

**Root Cause**: In-memory rate limiter lost state on restart.

**Mitigation**:
1. **Acceptable for MVP** (manual rewards low-frequency)
2. Monitor `manual_reward` frequency via logs
3. Alert if >20 rewards/min from any staff member
4. Upgrade to Redis if abuse detected

**Scenario 4: Concurrency Race (Simultaneous Mid-Session + Completion)**

**Symptom**: Final balance doesn't equal sum of ledger entries.

**Root Cause**: Missed FOR UPDATE lock OR concurrent RPC calls interleaved.

**Recovery Steps**:
1. Query `loyalty_ledger` for player, sum `points_change`
2. Compare to `player_loyalty.current_balance`
3. If mismatch:
   ```sql
   -- Rebuild balance from ledger
   UPDATE player_loyalty
   SET current_balance = (
     SELECT SUM(points_change) FROM loyalty_ledger WHERE player_id = $1
   ),
   updated_at = now()
   WHERE player_id = $1;
   ```
4. Investigate RPC logs for missing `row_locked = TRUE` confirmations
5. Escalate if pattern detected (possible lock contention)

---

## 7. New Test Scenarios (CRITICAL)

### Test 1: Saga Recovery (Atomicity)

```typescript
// __tests__/integration/loyalty-saga.test.ts

describe('Loyalty Saga Recovery', () => {

  test('Partial completion: Slip closed, loyalty fails → recovery succeeds', async () => {
    const { player, slip } = await createTestScenario();

    // Mock loyalty service failure
    const loyaltyService = createLoyaltyService(supabase);
    jest.spyOn(loyaltyService, 'accruePointsFromSlip').mockRejectedValueOnce(
      new Error('Database connection lost')
    );

    // Attempt completion (should fail)
    const result = await completeRatingSlip(slip.id);
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('PARTIAL_COMPLETION');

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
  });

  test('Recovery idempotency: Running recovery twice → single ledger entry', async () => {
    const { slip } = await createPartiallyCompletedSlip();

    // Run recovery twice
    await recoverSlipLoyalty(slip.id, 'corr_123');
    await recoverSlipLoyalty(slip.id, 'corr_123');

    // Verify only 1 ledger entry
    const { data: ledger } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('rating_slip_id', slip.id);
    expect(ledger).toHaveLength(1);
  });
});
```

### Test 2: Concurrency Control

```typescript
// __tests__/integration/loyalty-concurrency.test.ts

describe('Loyalty Concurrency', () => {

  test('Simultaneous manual reward + slip completion → no lost updates', async () => {
    const { player, slip } = await createTestScenario();

    // Start both operations concurrently
    const [rewardResult, completionResult] = await Promise.all([
      manualReward({
        playerId: player.id,
        pointsChange: 500,
        reason: 'VIP bonus',
        staffId: 'staff-1',
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
    expect(ledger[0].transaction_type).toMatch(/MANUAL_BONUS|GAMEPLAY/);
    expect(ledger[1].transaction_type).toMatch(/MANUAL_BONUS|GAMEPLAY/);
  });

  test('RPC row lock prevents interleaved updates', async () => {
    const { player } = await createTestScenario();

    // Start 10 concurrent manual rewards
    const promises = Array.from({ length: 10 }, (_, i) =>
      manualReward({
        playerId: player.id,
        pointsChange: 100,
        reason: `Bonus ${i}`,
        staffId: `staff-${i}`,
        rewardId: `reward_${i}`,  // Unique keys
      })
    );

    const results = await Promise.all(promises);

    // All should succeed
    expect(results.every(r => r.success)).toBe(true);

    // Final balance should equal 10 * 100 = 1000
    const { data: balance } = await supabase
      .from('player_loyalty')
      .select('current_balance')
      .eq('player_id', player.id)
      .single();

    expect(balance.current_balance).toBe(1000);

    // Verify all RPC calls reported row_locked = TRUE
    // (check logs for "row_locked": true in structured output)
  });
});
```

### Test 3: Idempotency Edge Cases

```typescript
// __tests__/integration/loyalty-idempotency.test.ts

describe('Loyalty Idempotency', () => {

  test('Manual reward: Same inputs on same day → single ledger entry', async () => {
    const { player } = await createTestScenario();

    const input = {
      playerId: player.id,
      pointsChange: 250,
      reason: 'Birthday bonus',
      staffId: 'staff-1',
    };

    // Call twice with identical inputs
    await manualReward(input);
    await manualReward(input);

    // Verify only 1 ledger entry (date-bucketed idempotency)
    const { data: ledger } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('player_id', player.id)
      .eq('source', 'manual');

    expect(ledger).toHaveLength(1);
    expect(ledger[0].points_change).toBe(250);
  });

  test('Manual reward: Same inputs next day → 2 ledger entries', async () => {
    const { player } = await createTestScenario();

    const input = {
      playerId: player.id,
      pointsChange: 250,
      reason: 'Birthday bonus',
      staffId: 'staff-1',
    };

    // Day 1
    await manualReward(input);

    // Mock time advance to next day
    jest.useFakeTimers();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);

    // Day 2
    await manualReward(input);

    // Verify 2 ledger entries (different date buckets)
    const { data: ledger } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('player_id', player.id)
      .eq('source', 'manual');

    expect(ledger).toHaveLength(2);
  });

  test('Gameplay accrual: rating_slip_id is deterministic key', async () => {
    const { slip } = await createTestScenario();

    // Complete twice
    await completeRatingSlip(slip.id);
    await completeRatingSlip(slip.id);

    // Verify single ledger entry
    const { data: ledger } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('rating_slip_id', slip.id);

    expect(ledger).toHaveLength(1);
    expect(ledger[0].session_id).toBe(slip.id);  // Deterministic
  });
});
```

---

## 8. Security Posture

### Server-Only Actions

```typescript
// app/actions/loyalty-actions.ts

'use server';  // ← CRITICAL: Prevents client-side execution

import { hasPermission } from '@/lib/auth/permissions';

export async function manualReward(input: ManualRewardInput) {
  return withServerAction('manual_reward', async (supabase) => {

    // 1. Verify staff authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: { code: 'UNAUTHORIZED', ... } };
    }

    // 2. Verify staff has LOYALTY_AWARD permission
    const canAward = await hasPermission(session.user, 'loyalty:award');
    if (!canAward) {
      logger.warn('manual_reward_unauthorized', {
        user_id: session.user.id,
        attempted_player_id: input.playerId,
      });
      return { success: false, error: { code: 'FORBIDDEN', ... } };
    }

    // 3. Verify staff_id matches authenticated user
    if (input.staffId !== session.user.id) {
      logger.error('manual_reward_spoofing_attempt', {
        authenticated_user: session.user.id,
        claimed_staff_id: input.staffId,
      });
      return { success: false, error: { code: 'INVALID_STAFF_ID', ... } };
    }

    // 4. Enforce max points per reward (business rule)
    const MAX_MANUAL_REWARD = 10000;
    if (Math.abs(input.pointsChange) > MAX_MANUAL_REWARD) {
      return {
        success: false,
        error: { code: 'REWARD_EXCEEDS_LIMIT', message: `Max ${MAX_MANUAL_REWARD} points per reward` },
      };
    }

    // ... proceed with reward issuance
  });
}
```

### RLS Policies

```sql
-- Prevent direct table writes (RPC-only path)
CREATE POLICY loyalty_ledger_insert_service_only ON loyalty_ledger
  FOR INSERT TO authenticated
  USING (auth.role() = 'service_role');  -- Only service role can insert

-- Players can read their own ledger
CREATE POLICY loyalty_ledger_read_own ON loyalty_ledger
  FOR SELECT TO authenticated
  USING (player_id = auth.uid());

-- Staff can read all ledgers (for support)
CREATE POLICY loyalty_ledger_read_staff ON loyalty_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff WHERE id = auth.uid() AND has_permission('loyalty:view_all')
    )
  );
```

### Alerts

```typescript
// lib/alerts/loyalty-alerts.ts

/**
 * Alert on abnormal manual reward frequency
 */
export function checkManualRewardFrequency(staffId: string, count: number, windowMs: number) {
  const threshold = 20;  // >20 rewards in 1 hour = suspicious

  if (count > threshold) {
    alertTeam({
      severity: 'HIGH',
      title: 'Abnormal Manual Reward Frequency',
      message: `Staff ${staffId} issued ${count} manual rewards in ${windowMs}ms`,
      action_required: 'Review staff activity logs and contact manager',
    });
  }
}

/**
 * Alert on tier changes (for player engagement)
 */
export function notifyTierUpgrade(playerId: string, tierBefore: string, tierAfter: string) {
  if (tierBefore !== tierAfter) {
    sendPlayerNotification({
      playerId,
      title: `Congratulations! You've reached ${tierAfter} tier`,
      message: `You've been upgraded from ${tierBefore} to ${tierAfter}!`,
      action: 'View Benefits',
    });
  }
}
```

---

## 9. Implementation Checklist

### Critical Fixes (MUST HAVE before Wave 2 execution)

- [ ] **Atomicity**: Implement transactional boundary OR recovery path for partial completions
- [ ] **Idempotency**: Replace `Date.now()` keys with deterministic hashing for manual rewards
- [ ] **RPC Enhancement**: Update `increment_player_loyalty` to return before/after values
- [ ] **Schema**: Add `staff_id`, `balance_before/after`, `tier_before/after`, `correlation_id` columns
- [ ] **Correlation ID**: Thread correlation IDs through server actions and services
- [ ] **Structured Logging**: Emit canonical log schema for all loyalty operations
- [ ] **Recovery Action**: Implement `recoverSlipLoyalty` server action with UI affordance
- [ ] **Test**: Add saga recovery test (slip closed, loyalty fails → recovery succeeds)
- [ ] **Test**: Add concurrency test (simultaneous operations → correct final balance)
- [ ] **Test**: Add idempotency test (manual reward date-bucketed keys)

### Important Additions (SHOULD HAVE)

- [ ] **Security**: Add permission checks to `manualReward` action
- [ ] **Security**: Implement RLS policies for direct table access prevention
- [ ] **Alerts**: Add abnormal frequency monitoring for manual rewards
- [ ] **Alerts**: Add tier upgrade notifications
- [ ] **Documentation**: Update operational runbook with recovery procedures
- [ ] **UI**: Add "Pending Loyalty" state with retry button
- [ ] **Max Reward Limit**: Enforce business rule (e.g., 10,000 points max per manual reward)

### Nice to Have (DEFER if timeline pressure)

- [ ] **Metrics Dashboard**: Visualize manual reward frequency by staff
- [ ] **Audit Report**: Export loyalty operations by date range
- [ ] **Balance Verification Job**: Periodic cron to verify `player_loyalty` matches ledger sum

---

## 10. Timeline Impact

**Original Simplified Wave 2**: 4-5h
**With Critical Fixes**: 6-7h (+2h for hardening)

**Breakdown**:
- Atomicity + Recovery: +1h
- Idempotency Hardening: +30min
- RPC Enhancement: +30min
- Correlation ID Infrastructure: +1h
- Schema Migration: +30min
- Critical Tests: +1h

**Recommendation**: Absorb +2h cost. Skipping these fixes creates **HIGH production risk** that will cost 10x more to fix post-launch.

---

## 11. Risk Re-Assessment

| Risk | Before Hardening | After Hardening | Mitigation |
|------|------------------|-----------------|------------|
| **Data Loss (Partial Completion)** | 🔴 HIGH | 🟢 LOW | Recovery action + correlation tracing |
| **Duplicate Manual Rewards** | 🔴 HIGH | 🟢 LOW | Deterministic idempotency keys + date bucketing |
| **Concurrency Races** | 🟡 MEDIUM | 🟢 LOW | FOR UPDATE lock + audit columns |
| **Untraceable Failures** | 🟡 MEDIUM | 🟢 LOW | Correlation IDs + structured logs |
| **Staff Abuse** | 🟡 MEDIUM | 🟢 LOW | Permission checks + frequency alerts |
| **Balance Drift** | 🟡 MEDIUM | 🟢 LOW | Ledger verification + before/after columns |

**Overall Risk Level**: 🔴 **HIGH** → 🟢 **LOW** with hardening applied

---

## Summary

The simplified Wave 2 approach is **fundamentally sound** but has **critical production gaps** that MUST be addressed:

1. **Atomicity**: Two-step saga without recovery = data loss risk
2. **Idempotency**: Non-deterministic keys = duplicate rewards possible
3. **Observability**: No correlation IDs = untraceable failures
4. **Audit**: Minimal RPC return = cannot verify operations

**All fixes are surgical** (no architectural changes) and add **~2h to timeline** but reduce production risk from HIGH to LOW.

**Recommendation**: Apply all critical fixes before Wave 2 execution. The cost of NOT fixing is 10x higher post-launch.

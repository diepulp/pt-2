---
id: PRD-004-IDEMPOTENCY-DRIFT
title: LoyaltyService Idempotency & Balance Drift Detection Contract
owner: Architecture
status: Proposed
created: 2025-12-13
relates_to: [PRD-004, ADR-019, EXECUTION-SPEC-PRD-004]
---

# LoyaltyService Idempotency & Balance Drift Detection Contract

## Purpose

This document defines **exact idempotency constraints** and **drift detection mechanisms** for the LoyaltyService ledger system (PRD-004). It fills gaps in EXECUTION-SPEC-PRD-004 by specifying:

1. **Idempotency indexes** - Which columns form the uniqueness constraint per operation type
2. **Idempotency key format** - How to construct deterministic keys per reason code
3. **Drift detection strategy** - Lightweight approach to verify `current_balance = SUM(points_delta)`
4. **Test assertions** - SQL-based acceptance criteria for test suite

This is a **greenfield schema** with no legacy data. All constraints are designed for Pattern A (Contract-First) services with append-only ledger semantics.

---

## Gap 1: Idempotency Constraints

### 1.1 Critical Insight: Two-Tier Idempotency

The loyalty ledger requires **two complementary uniqueness mechanisms**:

| Mechanism | Scope | Purpose |
|-----------|-------|---------|
| **General Idempotency** | All mutations | Prevents duplicate processing of same request (network retry, client bug) |
| **Business Uniqueness** | Domain-specific | Prevents semantic duplicates (e.g., double base accrual per slip) |

### 1.2 General Idempotency (Cross-Operation)

**Constraint:**
```sql
-- Casino-scoped idempotency for all mutations
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_idempotency_uq
  ON loyalty_ledger (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

**Rationale:**
- Multi-tenant safe (casino_id prefix)
- Partial index (excludes NULL keys for optional idempotency)
- Allows different operations with different keys in same casino

**Key Format:** `{operation}-{source_id}-{timestamp_or_nonce}`

Examples:
```typescript
// Base accrual
`base_accrual-${rating_slip_id}-${slip_closed_at}`

// Redeem
`redeem-${player_id}-${issued_by_staff_id}-${Date.now()}`

// Manual credit
`manual_credit-${player_id}-${awarded_by_staff_id}-${Date.now()}`

// Promotion
`promotion-${campaign_id}-${rating_slip_id}`
```

### 1.3 Business Uniqueness Constraints (Per Reason Code)

#### 1.3.1 Base Accrual (MOST CRITICAL)

**Constraint:**
```sql
-- One base accrual per rating slip per casino
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_base_accrual_unique
  ON loyalty_ledger (casino_id, rating_slip_id)
  WHERE reason = 'base_accrual' AND rating_slip_id IS NOT NULL;
```

**Rationale:**
- Prevents double-minting if idempotency_key is reused or lost
- Semantic constraint: "one base accrual reward per slip lifecycle"
- Partial index with predicate for performance (only indexes base_accrual rows)

**Alternative (source-based):**
```sql
-- If source_kind/source_id columns exist
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_base_accrual_source_unique
  ON loyalty_ledger (casino_id, source_kind, source_id, reason)
  WHERE reason = 'base_accrual';
```

**RECOMMENDATION:** Use `rating_slip_id` variant (simpler, leverages existing FK).

#### 1.3.2 Redeem (Comp Issuance)

**Constraint:**
```sql
-- Redemptions rely on general idempotency only
-- No business uniqueness (same player can redeem multiple times)
-- Idempotency key format ensures request-level deduplication
```

**Rationale:**
- A player may redeem multiple comps in quick succession (legitimate)
- Idempotency protects against retry storms, not business logic
- `idempotency_key` must be client-generated or RPC-assigned deterministically

**Key Format:**
```typescript
// Client-generated (recommended)
`redeem-${player_id}-${ulid()}` // ULID for sortable uniqueness

// Or RPC-assigned deterministic (if inputs are unique)
`redeem-${player_id}-${reward_id}-${issued_by_staff_id}-${timestamp}`
```

#### 1.3.3 Promotion

**Constraint:**
```sql
-- One promotion credit per campaign per source entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_promotion_unique
  ON loyalty_ledger (casino_id, source_kind, source_id, metadata->>'campaign_id')
  WHERE reason = 'promotion'
    AND source_kind IS NOT NULL
    AND source_id IS NOT NULL
    AND metadata ? 'campaign_id';
```

**Rationale:**
- Prevents duplicate promotion awards (e.g., "New Player Bonus" applied twice)
- Uses JSONB expression index on `metadata->>'campaign_id'`
- Allows same campaign on different slips (source_id differs)

**Alternative (simpler, if campaign_id column exists):**
```sql
ALTER TABLE loyalty_ledger ADD COLUMN campaign_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_promotion_unique
  ON loyalty_ledger (casino_id, campaign_id, rating_slip_id)
  WHERE reason = 'promotion' AND campaign_id IS NOT NULL;
```

**RECOMMENDATION:** Add `campaign_id` column for WS1 (cleaner schema, easier queries).

#### 1.3.4 Manual Reward, Adjustment, Reversal

**Constraint:**
```sql
-- Manual operations rely on general idempotency only
-- Staff may issue multiple credits to same player (legitimate)
-- Idempotency key prevents accidental double-click
```

**Rationale:**
- No semantic uniqueness constraint (pit boss can award 500 pts twice for different reasons)
- Idempotency key must be UI-generated or RPC-assigned per request

**Key Format:**
```typescript
// UI-generated (on button click)
`manual_reward-${player_id}-${ulid()}`

// Or form-based deterministic (if form has unique ID)
`manual_reward-${player_id}-${form_instance_id}`
```

### 1.4 Summary Table

| Reason Code | Idempotency Index | Business Uniqueness Index | Notes |
|-------------|-------------------|---------------------------|-------|
| `base_accrual` | ✅ General | ✅ `(casino_id, rating_slip_id)` | **Critical**: Prevents double-mint |
| `promotion` | ✅ General | ✅ `(casino_id, campaign_id, rating_slip_id)` | Requires `campaign_id` column |
| `redeem` | ✅ General | ❌ None | Multiple redemptions allowed |
| `manual_reward` | ✅ General | ❌ None | Multiple awards allowed |
| `adjustment` | ✅ General | ❌ None | Admin corrections |
| `reversal` | ✅ General | ❌ None | May reference original ledger_id |

---

## Gap 2: Balance Drift Detection

### 2.1 Invariant

**Ledger Integrity Rule:**
```
FOR ALL (player_id, casino_id):
  player_loyalty.current_balance = SUM(loyalty_ledger.points_delta)
```

### 2.2 Detection Strategy (Recommended: Materialized View + Alert)

**Rationale (per Over-Engineering Guardrail):**
- Greenfield schema → no legacy drift to clean up
- Append-only + row locking → drift should never occur
- Detection is **insurance**, not a primary safeguard
- Avoid pg_cron/scheduler complexity for MVP (no second consumer)

**Approach:**
1. **Materialized View** - Pre-computed ledger sum per player
2. **On-demand Reconciliation** - Manual SQL check for QA/test
3. **Alert Trigger** - Automated drift detection (optional, post-MVP)

### 2.3 SQL Implementation

#### 2.3.1 Materialized View (Ledger Sum)

```sql
-- Materialized view: aggregate ledger sum per player
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_loyalty_balance_reconciliation AS
SELECT
  casino_id,
  player_id,
  SUM(points_delta) AS ledger_balance,
  COUNT(*) AS entry_count,
  MAX(created_at) AS last_entry_at
FROM loyalty_ledger
GROUP BY casino_id, player_id;

-- Index for fast join
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_loyalty_balance_pk
  ON mv_loyalty_balance_reconciliation (casino_id, player_id);

-- Refresh policy: on-demand for MVP, cron for production
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_loyalty_balance_reconciliation;
```

#### 2.3.2 Drift Detection Query

```sql
-- Detect drift: cached balance != ledger sum
SELECT
  pl.casino_id,
  pl.player_id,
  pl.current_balance AS cached_balance,
  COALESCE(mv.ledger_balance, 0) AS ledger_balance,
  (pl.current_balance - COALESCE(mv.ledger_balance, 0)) AS drift,
  mv.entry_count,
  mv.last_entry_at,
  pl.updated_at AS balance_updated_at
FROM player_loyalty pl
LEFT JOIN mv_loyalty_balance_reconciliation mv
  ON pl.casino_id = mv.casino_id
  AND pl.player_id = mv.player_id
WHERE pl.current_balance != COALESCE(mv.ledger_balance, 0);
```

**Expected Result (greenfield):** Zero rows.

**If drift detected:**
1. Log incident with correlation_id
2. Trigger manual reconciliation RPC
3. Review RPC transaction boundaries (likely bug in balance update logic)

#### 2.3.3 Real-Time Drift Detection (Optional, Post-MVP)

```sql
-- Trigger-based shadow counter (NOT recommended for MVP)
-- Only add if §6 trigger met (second consumer, SLO breach, compliance)

CREATE OR REPLACE FUNCTION fn_detect_loyalty_drift()
RETURNS TRIGGER AS $$
DECLARE
  v_ledger_sum INT;
  v_cached_balance INT;
BEGIN
  -- Compute sum from ledger
  SELECT COALESCE(SUM(points_delta), 0)
  INTO v_ledger_sum
  FROM loyalty_ledger
  WHERE casino_id = NEW.casino_id
    AND player_id = NEW.player_id;

  -- Get cached balance
  SELECT current_balance
  INTO v_cached_balance
  FROM player_loyalty
  WHERE casino_id = NEW.casino_id
    AND player_id = NEW.player_id;

  -- Alert if drift detected
  IF v_cached_balance != v_ledger_sum THEN
    RAISE WARNING 'LOYALTY_DRIFT: player=% casino=% cached=% ledger=%',
      NEW.player_id, NEW.casino_id, v_cached_balance, v_ledger_sum;

    -- Optional: insert into drift_alerts table
    -- INSERT INTO loyalty_drift_alerts (...) VALUES (...);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger (AFTER INSERT on ledger)
-- CREATE TRIGGER trg_loyalty_drift_check
--   AFTER INSERT ON loyalty_ledger
--   FOR EACH ROW
--   EXECUTE FUNCTION fn_detect_loyalty_drift();
```

**DO NOT implement for WS1/WS2** unless ADR-019 explicitly requires (over-engineering).

### 2.4 Reconciliation RPC (Manual Correction)

```sql
-- Admin-only RPC to force balance recalculation
CREATE OR REPLACE FUNCTION rpc_reconcile_loyalty_balance(
  p_player_id UUID,
  p_casino_id UUID
)
RETURNS TABLE (
  old_balance INT,
  new_balance INT,
  drift_detected BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_old_balance INT;
  v_new_balance INT;
BEGIN
  -- Lock player_loyalty row
  SELECT current_balance INTO v_old_balance
  FROM player_loyalty
  WHERE player_id = p_player_id
    AND casino_id = p_casino_id
  FOR UPDATE;

  -- Compute correct balance from ledger
  SELECT COALESCE(SUM(points_delta), 0) INTO v_new_balance
  FROM loyalty_ledger
  WHERE player_id = p_player_id
    AND casino_id = p_casino_id;

  -- Update if drift detected
  IF v_old_balance != v_new_balance THEN
    UPDATE player_loyalty
    SET current_balance = v_new_balance,
        updated_at = NOW()
    WHERE player_id = p_player_id
      AND casino_id = p_casino_id;

    RETURN QUERY SELECT v_old_balance, v_new_balance, TRUE;
  ELSE
    RETURN QUERY SELECT v_old_balance, v_new_balance, FALSE;
  END IF;
END;
$$;
```

**Access Control:**
- Role gate: `admin` only (via RLS or RPC check)
- Use case: QA smoke test, incident response

---

## 3. Test Acceptance Criteria

### 3.1 Idempotency Tests (Integration)

```typescript
describe('LoyaltyService Idempotency', () => {
  test('base_accrual: duplicate call returns existing entry', async () => {
    const slipId = 'test-slip-1';
    const idempotencyKey = `base_accrual-${slipId}-${Date.now()}`;

    // First call
    const result1 = await rpc_accrue_on_close({
      p_rating_slip_id: slipId,
      p_idempotency_key: idempotencyKey,
    });

    // Second call (duplicate)
    const result2 = await rpc_accrue_on_close({
      p_rating_slip_id: slipId,
      p_idempotency_key: idempotencyKey,
    });

    expect(result1.ledger_id).toEqual(result2.ledger_id);
    expect(result2.is_existing).toBe(true);

    // Verify only one ledger entry
    const count = await countLedgerEntries({
      casino_id: testCasinoId,
      rating_slip_id: slipId,
      reason: 'base_accrual',
    });
    expect(count).toBe(1);
  });

  test('base_accrual: business uniqueness prevents double-mint even with different idempotency_key', async () => {
    const slipId = 'test-slip-2';

    // First call
    await rpc_accrue_on_close({
      p_rating_slip_id: slipId,
      p_idempotency_key: `key-1-${Date.now()}`,
    });

    // Second call with DIFFERENT idempotency key (should fail)
    await expect(
      rpc_accrue_on_close({
        p_rating_slip_id: slipId,
        p_idempotency_key: `key-2-${Date.now()}`,
      })
    ).rejects.toThrow(/duplicate key value violates unique constraint.*base_accrual/);
  });

  test('redeem: idempotent with same key, allows multiple redemptions with different keys', async () => {
    const playerId = 'test-player-1';
    const key1 = `redeem-${playerId}-${ulid()}`;
    const key2 = `redeem-${playerId}-${ulid()}`;

    // First redemption
    const result1 = await rpc_redeem({
      p_player_id: playerId,
      p_casino_id: testCasinoId,
      p_points: 500,
      p_issued_by_staff_id: testStaffId,
      p_note: 'Meal comp',
      p_idempotency_key: key1,
    });

    // Retry same redemption (same key)
    const result1Retry = await rpc_redeem({
      p_player_id: playerId,
      p_casino_id: testCasinoId,
      p_points: 500,
      p_issued_by_staff_id: testStaffId,
      p_note: 'Meal comp',
      p_idempotency_key: key1,
    });

    expect(result1.ledger_id).toEqual(result1Retry.ledger_id);

    // Second redemption (different key, legitimate)
    const result2 = await rpc_redeem({
      p_player_id: playerId,
      p_casino_id: testCasinoId,
      p_points: 300,
      p_issued_by_staff_id: testStaffId,
      p_note: 'Show ticket',
      p_idempotency_key: key2,
    });

    expect(result2.ledger_id).not.toEqual(result1.ledger_id);

    // Verify two redemptions in ledger
    const count = await countLedgerEntries({
      casino_id: testCasinoId,
      player_id: playerId,
      reason: 'redeem',
    });
    expect(count).toBe(2);
  });

  test('promotion: business uniqueness prevents duplicate campaign award per slip', async () => {
    const slipId = 'test-slip-3';
    const campaignId = 'welcome-bonus';

    // First award
    await rpc_apply_promotion({
      p_rating_slip_id: slipId,
      p_campaign_id: campaignId,
      p_bonus_points: 1000,
      p_idempotency_key: `promo-1-${Date.now()}`,
    });

    // Duplicate award (should fail due to business uniqueness)
    await expect(
      rpc_apply_promotion({
        p_rating_slip_id: slipId,
        p_campaign_id: campaignId,
        p_bonus_points: 1000,
        p_idempotency_key: `promo-2-${Date.now()}`,
      })
    ).rejects.toThrow(/duplicate key value violates unique constraint.*promotion/);
  });
});
```

### 3.2 Drift Detection Tests (SQL Assertions)

```sql
-- Test Suite SQL: No drift after transaction sequences
-- Run after each integration test

-- Assertion 1: All balances match ledger sum
DO $$
DECLARE
  v_drift_count INT;
BEGIN
  -- Refresh materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_loyalty_balance_reconciliation;

  -- Count drift cases
  SELECT COUNT(*)
  INTO v_drift_count
  FROM player_loyalty pl
  LEFT JOIN mv_loyalty_balance_reconciliation mv
    ON pl.casino_id = mv.casino_id
    AND pl.player_id = mv.player_id
  WHERE pl.current_balance != COALESCE(mv.ledger_balance, 0);

  IF v_drift_count > 0 THEN
    RAISE EXCEPTION 'DRIFT_DETECTED: % player(s) have mismatched balances', v_drift_count;
  END IF;

  RAISE NOTICE 'DRIFT_CHECK_PASSED: All balances match ledger sum';
END $$;
```

```typescript
describe('Balance Integrity', () => {
  test('SUM(points_delta) equals current_balance after 100 random operations', async () => {
    const playerId = 'drift-test-player';

    // Seed random operations (accrual, redeem, manual credits)
    for (let i = 0; i < 100; i++) {
      const op = randomOperation();
      await executeOperation(playerId, op);
    }

    // Verify integrity
    const { current_balance } = await getPlayerLoyalty(playerId, testCasinoId);
    const { ledger_sum } = await computeLedgerSum(playerId, testCasinoId);

    expect(current_balance).toEqual(ledger_sum);
  });

  test('Concurrent redemptions maintain balance integrity', async () => {
    const playerId = 'concurrency-test-player';

    // Seed 10000 points
    await rpc_manual_credit({
      p_player_id: playerId,
      p_casino_id: testCasinoId,
      p_points: 10000,
      p_awarded_by_staff_id: testStaffId,
      p_note: 'Test seed',
      p_idempotency_key: ulid(),
    });

    // Fire 10 concurrent redemptions (500 pts each)
    const redemptions = Array.from({ length: 10 }, (_, i) =>
      rpc_redeem({
        p_player_id: playerId,
        p_casino_id: testCasinoId,
        p_points: 500,
        p_issued_by_staff_id: testStaffId,
        p_note: `Concurrent redeem ${i}`,
        p_idempotency_key: ulid(),
      })
    );

    await Promise.all(redemptions);

    // Verify final balance
    const { current_balance } = await getPlayerLoyalty(playerId, testCasinoId);
    const { ledger_sum } = await computeLedgerSum(playerId, testCasinoId);

    expect(current_balance).toEqual(5000); // 10000 - (10 * 500)
    expect(ledger_sum).toEqual(5000);
  });
});
```

---

## 4. Implementation Checklist

### WS1: Database Schema (Migration)

- [ ] Add `idempotency_key` column to `loyalty_ledger` (UUID, nullable)
- [ ] Add `campaign_id` column to `loyalty_ledger` (TEXT, nullable)
- [ ] Create general idempotency index: `(casino_id, idempotency_key)`
- [ ] Create base accrual uniqueness index: `(casino_id, rating_slip_id)`
- [ ] Create promotion uniqueness index: `(casino_id, campaign_id, rating_slip_id)`
- [ ] Add new enum values to `loyalty_reason`:
  - `base_accrual`, `promotion`, `redeem`, `manual_reward`, `adjustment`, `reversal`
- [ ] Create materialized view `mv_loyalty_balance_reconciliation`
- [ ] Create index on materialized view: `(casino_id, player_id)`
- [ ] Run drift detection query (expect 0 rows on greenfield)

### WS2: Database RPCs

- [ ] `rpc_accrue_on_close`: Accept `idempotency_key`, handle unique constraint gracefully
- [ ] `rpc_redeem`: Accept `idempotency_key`, return `is_existing` flag on conflict
- [ ] `rpc_manual_credit`: Accept `idempotency_key`
- [ ] `rpc_apply_promotion`: Accept `campaign_id`, handle business uniqueness
- [ ] `rpc_reconcile_loyalty_balance`: Admin-only balance recalculation
- [ ] All RPCs: Wrap `INSERT INTO loyalty_ledger` in `ON CONFLICT DO NOTHING` + `RETURNING *`
- [ ] All RPCs: Return `is_existing: boolean` to signal idempotent hit

### WS3-WS6: Service Layer

- [ ] DTOs include `idempotency_key: string` field
- [ ] Mutation inputs require `idempotencyKey` parameter (Zod schema validation)
- [ ] HTTP fetchers generate idempotency keys if not provided (ULID or deterministic)
- [ ] Error mapper: Translate Postgres `23505` (unique violation) to `LOYALTY_IDEMPOTENCY_CONFLICT`

### WS7: Tests

- [ ] Integration test: Base accrual idempotency (duplicate call)
- [ ] Integration test: Base accrual business uniqueness (different key, same slip)
- [ ] Integration test: Redeem idempotency (same key) vs multiple redemptions (different keys)
- [ ] Integration test: Promotion business uniqueness (same campaign, same slip)
- [ ] SQL assertion: No drift after 100 random operations
- [ ] SQL assertion: No drift after 10 concurrent redemptions
- [ ] Golden fixture: Drift detection query returns 0 rows

---

## 5. Decision Rationale

### Why Two-Tier Idempotency?

**General Idempotency** (casino_id, idempotency_key):
- Protects against network retries, client bugs, infrastructure failures
- Works across all operation types
- Client or RPC must generate unique keys

**Business Uniqueness** (domain-specific):
- Encodes domain rules ("one base accrual per slip")
- Prevents semantic errors even if idempotency_key is lost/reused
- Schema-enforced (no application logic required)

**Example Scenario:**
```
Scenario: Slip close triggers base accrual twice (bug in event handler)
1st call: idempotency_key = "base_accrual-slip123-2025-12-13T10:00:00Z"
2nd call: idempotency_key = "base_accrual-slip123-2025-12-13T10:00:01Z" (1 second later)

General idempotency: PASSES (different keys)
Business uniqueness: FAILS (same slip, same reason)

Result: Double-mint prevented by business constraint
```

### Why Materialized View (Not Trigger)?

**Per Over-Engineering Guardrail (OE-01):**
- ✅ **Greenfield schema**: No legacy drift to clean up
- ✅ **Append-only + row locking**: Drift should never occur in correct implementation
- ✅ **Single consumer**: No second system depending on real-time drift alerts
- ❌ **No SLO breach**: p95 latency < 200ms without real-time checks
- ❌ **No compliance mandate**: Audit trail via ledger + logs (no real-time alert required)

**Materialized view approach:**
- On-demand refresh (dev/QA: manual; prod: cron if needed later)
- Zero runtime overhead (no trigger on hot path)
- Fast reconciliation queries (indexed join)
- Promotes to trigger if §6 trigger met (SLO breach, second consumer)

**Exit criteria for trigger upgrade:**
- Measured drift incident (p95 > 500ms recovery time)
- Second consumer requiring real-time balance consistency
- Compliance mandate for instant drift alerts

---

## 6. Schema DDL (Reference)

```sql
-- ============================================================================
-- IDEMPOTENCY & UNIQUENESS CONSTRAINTS
-- ============================================================================

-- 1. Add idempotency_key column
ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- 2. Add campaign_id column (for promotion uniqueness)
ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS campaign_id TEXT;

-- 3. General idempotency index (all operations)
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_idempotency_uq
  ON loyalty_ledger (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 4. Base accrual business uniqueness (one per slip)
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_base_accrual_unique
  ON loyalty_ledger (casino_id, rating_slip_id)
  WHERE reason = 'base_accrual' AND rating_slip_id IS NOT NULL;

-- 5. Promotion business uniqueness (one campaign per slip)
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_promotion_unique
  ON loyalty_ledger (casino_id, campaign_id, rating_slip_id)
  WHERE reason = 'promotion'
    AND campaign_id IS NOT NULL
    AND rating_slip_id IS NOT NULL;

-- ============================================================================
-- DRIFT DETECTION INFRASTRUCTURE
-- ============================================================================

-- 6. Materialized view: ledger sum per player
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_loyalty_balance_reconciliation AS
SELECT
  casino_id,
  player_id,
  SUM(points_delta) AS ledger_balance,
  COUNT(*) AS entry_count,
  MAX(created_at) AS last_entry_at
FROM loyalty_ledger
GROUP BY casino_id, player_id;

-- 7. Index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_loyalty_balance_pk
  ON mv_loyalty_balance_reconciliation (casino_id, player_id);

-- 8. Refresh policy (on-demand for MVP)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_loyalty_balance_reconciliation;

-- ============================================================================
-- ENUM UPDATES (Strategy B: Additive)
-- ============================================================================

-- 9. Add new canonical reason codes
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'base_accrual';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'promotion';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'redeem';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'manual_reward';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'adjustment';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'reversal';

-- Legacy values (mid_session, session_end, manual_adjustment, correction) remain readable
-- RPCs MUST validate and reject legacy values on INSERT
```

---

## 7. Appendix: Error Taxonomy

| Code | HTTP | Description | Mitigation |
|------|------|-------------|------------|
| `LOYALTY_IDEMPOTENCY_CONFLICT` | 409 | Idempotency key already used for different operation | Return existing entry, set `is_existing: true` |
| `LOYALTY_BASE_ACCRUAL_DUPLICATE` | 409 | Base accrual already exists for this slip | Return existing entry, set `is_existing: true` |
| `LOYALTY_PROMOTION_DUPLICATE` | 409 | Campaign already awarded for this slip | Return existing entry or reject (per product rules) |
| `LOYALTY_DRIFT_DETECTED` | 500 | Balance != ledger sum (integrity violation) | Trigger incident, run `rpc_reconcile_loyalty_balance` |

---

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-13 | Architecture | Initial contract: idempotency constraints + drift detection strategy |

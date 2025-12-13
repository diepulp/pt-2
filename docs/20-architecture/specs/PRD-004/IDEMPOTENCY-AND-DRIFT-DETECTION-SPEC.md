---
id: PRD-004-GAP-CLOSURE
title: Idempotency Constraints & Balance Drift Detection Specification
owner: Backend Architect
status: Proposed
relates_to: [PRD-004, ADR-019, EXECUTION-SPEC-PRD-004]
created: 2025-12-13
---

# Idempotency Constraints & Balance Drift Detection Specification

## Overview

This specification closes two critical gaps in PRD-004 LoyaltyService:

1. **Gap 1: Idempotency/Uniqueness Constraints** - Exact column combinations and index definitions to prevent duplicate operations
2. **Gap 2: Balance Drift Detection** - Mechanisms to ensure `current_balance = SUM(points_delta)` invariant holds

**Schema Context**: Greenfield append-only ledger, no legacy data to migrate.

---

## Gap 1: Idempotency & Uniqueness Constraints

### 1.1 Problem Statement

The loyalty ledger must prevent:
- **Double-minting**: One base accrual per rating slip (most critical - financial integrity)
- **Duplicate operations**: Retry-safe idempotency for all mutations
- **Race conditions**: Multiple staff issuing same comp simultaneously

### 1.2 Solution Architecture

**Two-tier idempotency strategy:**

1. **Tier 1: Operation-specific natural keys** (business logic constraints)
2. **Tier 2: Universal idempotency keys** (retry safety for all mutations)

### 1.3 Concrete Index Definitions

#### Index 1: Base Accrual Uniqueness (Critical - Prevents Double-Minting)

```sql
-- CRITICAL: One base accrual per rating slip per casino
-- Composite natural key: (casino_id, source_kind, source_id, reason)
-- Uses partial index with WHERE clause for performance
CREATE UNIQUE INDEX ux_loyalty_ledger_base_accrual_unique
  ON loyalty_ledger (casino_id, source_kind, source_id, reason)
  WHERE reason = 'base_accrual';
```

**Rationale:**
- `casino_id`: Multi-tenant isolation (every constraint must be casino-scoped)
- `source_kind`: Always `'rating_slip'` for base accrual
- `source_id`: The `rating_slip.id` reference
- `reason`: Discriminator for partial index (`'base_accrual'` only)

**Protection:**
- Duplicate `rpc_accrue_on_close()` calls return existing entry without re-execution
- SQL unique constraint prevents double-mint at database level (not just application)
- Idempotent even across different client processes/retries

#### Index 2: Promotion Uniqueness (Prevents Duplicate Campaign Credits)

```sql
-- One promotion per campaign per source (slip/visit/player context)
-- Example: "Weekend 2x" promo applied once per slip
CREATE UNIQUE INDEX ux_loyalty_ledger_promotion_unique
  ON loyalty_ledger (casino_id, source_kind, source_id, metadata->>'campaign_id')
  WHERE reason = 'promotion'
    AND metadata->>'campaign_id' IS NOT NULL;
```

**Rationale:**
- `metadata->>'campaign_id'`: Campaign identifier from promotional system
- Prevents same campaign applying multiple times to same slip/context
- Allows multiple different campaigns on same slip (additive)

**Alternative (if campaign_id is dedicated column):**
```sql
-- If schema adds campaign_id column later
CREATE UNIQUE INDEX ux_loyalty_ledger_promotion_unique
  ON loyalty_ledger (casino_id, source_kind, source_id, campaign_id)
  WHERE reason = 'promotion' AND campaign_id IS NOT NULL;
```

#### Index 3: Universal Idempotency Key (Retry Safety for All Mutations)

```sql
-- EXISTING: Already defined in 20251109214028_finance_loyalty_idempotency_outbox.sql
-- Included here for completeness
CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_ledger_idempotency
  ON loyalty_ledger (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

**Rationale:**
- Caller-supplied UUID for request deduplication
- Required parameter for all mutating RPCs per ADR-019
- Catches duplicate requests across all operation types
- Supports HTTP `Idempotency-Key` header pattern

**Usage Pattern:**
- Client generates UUID: `idempotency_key = uuidv4()`
- Passes to RPC: `rpc_redeem(..., p_idempotency_key => '...')`
- RPC attempts INSERT
- On conflict: SELECT existing ledger_id and return `is_existing: true`

### 1.4 Operation-Specific Idempotency Strategy

| Operation | Natural Key Index | Idempotency Key | Notes |
|-----------|------------------|----------------|-------|
| `base_accrual` | ✅ **Index 1** (casino, source, reason) | ✅ Required | Double protection: natural key + idem key |
| `promotion` | ✅ **Index 2** (casino, source, campaign) | ✅ Required | Prevents duplicate campaign credits |
| `redeem` | ❌ No natural key | ✅ **Required** | Relies solely on idempotency_key (multiple redemptions allowed) |
| `manual_reward` | ❌ No natural key | ✅ **Required** | Relies solely on idempotency_key (manual ops can repeat) |
| `adjustment` | ❌ No natural key | ✅ **Required** | Admin corrections, idempotency prevents double-apply |
| `reversal` | ⚠️ Optional | ✅ **Required** | Could add `(casino_id, reversed_ledger_id)` unique if "one reversal per entry" desired |

**Reversal Consideration:**
```sql
-- OPTIONAL: If business rule is "one reversal per ledger entry max"
CREATE UNIQUE INDEX ux_loyalty_ledger_reversal_unique
  ON loyalty_ledger (casino_id, metadata->>'reversed_ledger_id')
  WHERE reason = 'reversal'
    AND metadata->>'reversed_ledger_id' IS NOT NULL;
```

This prevents multiple reversals of the same entry. **Recommendation:** Include this for financial correctness.

### 1.5 Schema Additions Required

```sql
-- Add missing columns to loyalty_ledger if not present
ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS points_delta int;  -- Replaces points_earned semantically

-- Update semantics: points_delta allows negatives (debits)
-- Migration: UPDATE loyalty_ledger SET points_delta = points_earned WHERE points_delta IS NULL;
-- Then: ALTER TABLE loyalty_ledger ALTER COLUMN points_delta SET NOT NULL;

-- Add check constraint for base accrual (cannot mint negative)
ALTER TABLE loyalty_ledger
  ADD CONSTRAINT chk_base_accrual_non_negative
  CHECK (reason != 'base_accrual' OR points_delta >= 0);
```

### 1.6 RPC Implementation Pattern (Idempotency)

**Template for all mutating RPCs:**

```sql
CREATE OR REPLACE FUNCTION rpc_accrue_on_close(
  p_rating_slip_id uuid,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- ADR-019: All loyalty RPCs are SECURITY INVOKER
AS $$
DECLARE
  v_ledger_id uuid;
  v_existing record;
  v_result jsonb;
BEGIN
  -- Step 1: Check for existing entry (natural key or idempotency_key)
  SELECT id, points_delta, metadata
    INTO v_existing
    FROM loyalty_ledger
   WHERE casino_id = auth.casino_id()  -- RLS context
     AND ((source_kind = 'rating_slip'
           AND source_id = p_rating_slip_id
           AND reason = 'base_accrual')
          OR (idempotency_key = p_idempotency_key))
   LIMIT 1;

  IF FOUND THEN
    -- Idempotent return: existing entry
    RETURN jsonb_build_object(
      'ledger_id', v_existing.id,
      'points_delta', v_existing.points_delta,
      'is_existing', true
    );
  END IF;

  -- Step 2: Compute theo and points from policy_snapshot.loyalty
  -- [... business logic ...]

  -- Step 3: INSERT with idempotency_key
  INSERT INTO loyalty_ledger (
    casino_id, player_id, rating_slip_id,
    points_delta, reason,
    source_kind, source_id,
    idempotency_key, metadata
  ) VALUES (
    auth.casino_id(), p_player_id, p_rating_slip_id,
    v_points_delta, 'base_accrual',
    'rating_slip', p_rating_slip_id,
    p_idempotency_key, v_metadata
  )
  ON CONFLICT (casino_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_ledger_id;

  -- Step 4: Handle conflict (idempotency_key collision)
  IF v_ledger_id IS NULL THEN
    -- Fetch the existing entry that caused the conflict
    SELECT id, points_delta INTO v_existing
      FROM loyalty_ledger
     WHERE casino_id = auth.casino_id()
       AND idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object(
      'ledger_id', v_existing.id,
      'points_delta', v_existing.points_delta,
      'is_existing', true
    );
  END IF;

  -- Step 5: Update player_loyalty balance
  -- [... balance update with row locking ...]

  RETURN jsonb_build_object(
    'ledger_id', v_ledger_id,
    'points_delta', v_points_delta,
    'is_existing', false
  );
END;
$$;
```

**Key Pattern Elements:**
1. Check for existing entry (natural key OR idempotency_key)
2. Return existing if found (`is_existing: true`)
3. INSERT with `ON CONFLICT DO NOTHING`
4. Handle conflict by fetching existing entry
5. All queries scoped to `auth.casino_id()` for RLS

---

## Gap 2: Balance Drift Detection

### 2.1 Problem Statement

**Invariant:** `player_loyalty.current_balance = SUM(loyalty_ledger.points_delta)` at all times.

**Drift sources:**
- Failed transaction rollback (balance updated but ledger insert failed)
- Manual database edits (ops mistake)
- RPC bugs that update balance incorrectly
- Race conditions in concurrent updates

**Goal:** Detect drift early, alert operators, provide reconciliation path.

### 2.2 Solution Architecture (Lightweight, Guardrails-Compliant)

**Three-tier approach:**

1. **Tier 1: Prevention** - Transactional integrity in RPCs
2. **Tier 2: Detection** - Periodic reconciliation check (PostgreSQL function + cron)
3. **Tier 3: Alerting** - Log drift events for operational review

**Anti-patterns avoided (per project guardrails):**
- ❌ Trigger-based shadow counters (adds write amplification)
- ❌ Materialized views with complex refresh logic
- ❌ Real-time streaming processors (over-engineered)
- ❌ Event sourcing frameworks (not needed for append-only ledger)

### 2.3 Tier 1: Prevention (Transactional Integrity)

**All balance-updating RPCs must:**

1. Use database transactions (implicit in PLPGSQL function)
2. Row-lock `player_loyalty` with `SELECT ... FOR UPDATE`
3. Compute `balance_before` from locked row
4. INSERT ledger entry
5. UPDATE `player_loyalty.current_balance = balance_before + points_delta`
6. Return `balance_before`, `balance_after` for client verification

**Template:**

```sql
BEGIN;  -- Implicit in PLPGSQL function

  -- Step 1: Lock player_loyalty row
  SELECT current_balance INTO v_balance_before
    FROM player_loyalty
   WHERE player_id = p_player_id
     AND casino_id = auth.casino_id()
   FOR UPDATE;

  -- Step 2: Compute new balance
  v_balance_after := v_balance_before + p_points_delta;

  -- Step 3: Insert ledger entry
  INSERT INTO loyalty_ledger (...) VALUES (...) RETURNING id INTO v_ledger_id;

  -- Step 4: Update balance (same transaction)
  UPDATE player_loyalty
     SET current_balance = v_balance_after,
         updated_at = now()
   WHERE player_id = p_player_id
     AND casino_id = auth.casino_id();

  RETURN jsonb_build_object(
    'ledger_id', v_ledger_id,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after
  );

COMMIT;  -- Implicit
```

**Why this prevents drift:**
- Single atomic transaction: both ledger and balance update succeed or both fail
- Row lock prevents concurrent updates to same player balance
- No partial writes possible

### 2.4 Tier 2: Detection (Reconciliation Check Function)

**PostgreSQL function for drift detection:**

```sql
-- Reconciliation check: detect players with drifted balances
CREATE OR REPLACE FUNCTION public.check_loyalty_balance_drift(
  p_casino_id uuid DEFAULT NULL,
  p_drift_threshold int DEFAULT 0  -- Allow small rounding drift if needed
) RETURNS TABLE (
  casino_id uuid,
  player_id uuid,
  current_balance int,
  computed_balance bigint,  -- SUM can exceed int range temporarily
  drift int,
  ledger_entry_count bigint,
  last_ledger_update timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ledger_sums AS (
    SELECT
      ll.casino_id,
      ll.player_id,
      SUM(ll.points_delta) AS computed_balance,
      COUNT(*) AS entry_count,
      MAX(ll.created_at) AS last_update
    FROM loyalty_ledger ll
    WHERE ll.casino_id = COALESCE(p_casino_id, ll.casino_id)
    GROUP BY ll.casino_id, ll.player_id
  )
  SELECT
    pl.casino_id,
    pl.player_id,
    pl.current_balance,
    COALESCE(ls.computed_balance, 0) AS computed_balance,
    (pl.current_balance - COALESCE(ls.computed_balance, 0)) AS drift,
    COALESCE(ls.entry_count, 0) AS ledger_entry_count,
    ls.last_update AS last_ledger_update
  FROM player_loyalty pl
  LEFT JOIN ledger_sums ls
    ON pl.casino_id = ls.casino_id
   AND pl.player_id = ls.player_id
  WHERE ABS(pl.current_balance - COALESCE(ls.computed_balance, 0)) > p_drift_threshold
    AND pl.casino_id = COALESCE(p_casino_id, pl.casino_id)
  ORDER BY ABS(pl.current_balance - COALESCE(ls.computed_balance, 0)) DESC;
$$;

COMMENT ON FUNCTION check_loyalty_balance_drift IS
  'Detects players with loyalty balance drift (current_balance != SUM(points_delta)).
   Returns players with drift exceeding threshold, ordered by drift magnitude.
   Use p_casino_id to scope to single casino, omit for all casinos.';
```

**Usage:**

```sql
-- Check all casinos for any drift
SELECT * FROM check_loyalty_balance_drift();

-- Check specific casino with 10-point tolerance (rounding)
SELECT * FROM check_loyalty_balance_drift('casino-uuid-here', 10);

-- Check for critical drift (>100 points)
SELECT *
  FROM check_loyalty_balance_drift()
 WHERE ABS(drift) > 100;
```

### 2.5 Tier 3: Scheduled Monitoring (pg_cron)

**Daily reconciliation job:**

```sql
-- Create pg_cron extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily drift check at 3 AM UTC
SELECT cron.schedule(
  'loyalty-balance-drift-check',
  '0 3 * * *',  -- 3 AM daily
  $$
    INSERT INTO audit_log (domain, action, details)
    SELECT
      'loyalty' AS domain,
      'balance_drift_detected' AS action,
      jsonb_build_object(
        'casino_id', casino_id,
        'player_id', player_id,
        'current_balance', current_balance,
        'computed_balance', computed_balance,
        'drift', drift,
        'entry_count', ledger_entry_count
      ) AS details
    FROM check_loyalty_balance_drift()
    WHERE ABS(drift) > 0;  -- Log all drift, even small
  $$
);
```

**Alternative (if pg_cron not available):**

Create a serverless function endpoint:

```typescript
// app/api/admin/loyalty/reconcile/route.ts
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .rpc('check_loyalty_balance_drift', { p_drift_threshold: 0 });

  if (error) throw error;

  // Log drift events
  if (data.length > 0) {
    await supabase.from('audit_log').insert(
      data.map(d => ({
        domain: 'loyalty',
        action: 'balance_drift_detected',
        details: d,
      }))
    );
  }

  return Response.json({
    drift_count: data.length,
    max_drift: Math.max(...data.map(d => Math.abs(d.drift)), 0)
  });
}
```

Schedule via Vercel Cron or similar:

```json
// vercel.json
{
  "crons": [{
    "path": "/api/admin/loyalty/reconcile",
    "schedule": "0 3 * * *"
  }]
}
```

### 2.6 Reconciliation Procedure (Manual Fix)

**When drift is detected:**

```sql
-- Step 1: Identify drifted players
SELECT * FROM check_loyalty_balance_drift('casino-uuid') ORDER BY ABS(drift) DESC;

-- Step 2: For each drifted player, compute correct balance
WITH correct_balance AS (
  SELECT
    casino_id,
    player_id,
    SUM(points_delta) AS correct_balance
  FROM loyalty_ledger
  WHERE casino_id = 'casino-uuid'
    AND player_id = 'player-uuid'
  GROUP BY casino_id, player_id
)
-- Step 3: Update player_loyalty with correct balance
UPDATE player_loyalty pl
   SET current_balance = cb.correct_balance,
       updated_at = now()
  FROM correct_balance cb
 WHERE pl.casino_id = cb.casino_id
   AND pl.player_id = cb.player_id;

-- Step 4: Log reconciliation
INSERT INTO audit_log (domain, action, details)
VALUES (
  'loyalty',
  'balance_reconciled',
  jsonb_build_object(
    'casino_id', 'casino-uuid',
    'player_id', 'player-uuid',
    'old_balance', 1000,  -- from drift check
    'new_balance', 950,   -- computed
    'drift', 50,
    'reconciled_by', 'admin-staff-uuid'
  )
);
```

**Automated reconciliation (use with caution):**

```sql
-- WARNING: Only run if drift source is identified and fixed
-- This will auto-correct all drifted balances
WITH correct_balances AS (
  SELECT
    ll.casino_id,
    ll.player_id,
    SUM(ll.points_delta) AS correct_balance
  FROM loyalty_ledger ll
  GROUP BY ll.casino_id, ll.player_id
)
UPDATE player_loyalty pl
   SET current_balance = cb.correct_balance,
       updated_at = now()
  FROM correct_balances cb
 WHERE pl.casino_id = cb.casino_id
   AND pl.player_id = cb.player_id
   AND pl.current_balance != cb.correct_balance;  -- Only update drifted

-- Log bulk reconciliation
INSERT INTO audit_log (domain, action, details)
VALUES (
  'loyalty',
  'bulk_balance_reconciliation',
  jsonb_build_object(
    'affected_players', (SELECT COUNT(*) FROM check_loyalty_balance_drift()),
    'reconciled_by', auth.staff_id(),
    'timestamp', now()
  )
);
```

### 2.7 Test Acceptance Criteria (SQL Assertions)

**Test suite should include:**

```sql
-- Test 1: Balance equals sum after single accrual
DO $$
DECLARE
  v_player_id uuid := 'test-player-uuid';
  v_casino_id uuid := 'test-casino-uuid';
  v_balance int;
  v_sum bigint;
BEGIN
  -- Accrue 1000 points
  PERFORM rpc_accrue_on_close('slip-uuid', gen_random_uuid());

  -- Check balance
  SELECT current_balance INTO v_balance
    FROM player_loyalty
   WHERE player_id = v_player_id AND casino_id = v_casino_id;

  -- Check sum
  SELECT SUM(points_delta) INTO v_sum
    FROM loyalty_ledger
   WHERE player_id = v_player_id AND casino_id = v_casino_id;

  ASSERT v_balance = v_sum, format('Balance drift: %s != %s', v_balance, v_sum);
END;
$$;

-- Test 2: Balance equals sum after redeem
DO $$
DECLARE
  v_drift record;
BEGIN
  -- Setup: accrue 1000 points
  PERFORM rpc_accrue_on_close('slip-uuid', gen_random_uuid());

  -- Redeem 500 points
  PERFORM rpc_redeem('player-uuid', 'casino-uuid', 500, 'staff-uuid', 'test', gen_random_uuid());

  -- Check for drift
  SELECT * INTO v_drift FROM check_loyalty_balance_drift('casino-uuid');

  ASSERT NOT FOUND, format('Drift detected after redeem: %s', v_drift);
END;
$$;

-- Test 3: Concurrent redemptions maintain balance integrity
DO $$
DECLARE
  v_drift record;
BEGIN
  -- Parallel redemptions (simulate with multiple function calls)
  -- This tests row locking prevents race conditions
  PERFORM rpc_redeem('player-uuid', 'casino-uuid', 100, 'staff-1-uuid', 'concurrent-1', gen_random_uuid());
  PERFORM rpc_redeem('player-uuid', 'casino-uuid', 200, 'staff-2-uuid', 'concurrent-2', gen_random_uuid());

  -- Check for drift
  SELECT * INTO v_drift FROM check_loyalty_balance_drift('casino-uuid');

  ASSERT NOT FOUND, format('Drift detected after concurrent redemptions: %s', v_drift);
END;
$$;
```

### 2.8 Operational Alerting

**Recommended alert thresholds:**

| Severity | Condition | Action |
|----------|-----------|--------|
| **Critical** | `ABS(drift) > 1000` for any player | Page on-call engineer |
| **Warning** | `ABS(drift) > 100` for any player | Notify ops team |
| **Info** | Any drift detected | Log for analysis |
| **Critical** | Drift affects >5% of players | System-wide investigation |

**Alert payload example:**

```json
{
  "alert": "loyalty_balance_drift",
  "severity": "critical",
  "casino_id": "uuid",
  "player_id": "uuid",
  "current_balance": 10000,
  "computed_balance": 8500,
  "drift": 1500,
  "drift_percentage": 15,
  "ledger_entry_count": 42,
  "last_ledger_update": "2025-12-13T03:00:00Z",
  "detected_at": "2025-12-13T03:05:12Z"
}
```

---

## Summary & Recommendations

### Gap 1 Solution: Idempotency Constraints

**Required Indexes (3):**

1. **Base Accrual Uniqueness** - `(casino_id, source_kind, source_id, reason)` WHERE `reason = 'base_accrual'`
2. **Promotion Uniqueness** - `(casino_id, source_kind, source_id, campaign_id)` WHERE `reason = 'promotion'`
3. **Universal Idempotency** - `(casino_id, idempotency_key)` WHERE `idempotency_key IS NOT NULL` (already exists)

**Optional Index (recommended):**

4. **Reversal Uniqueness** - `(casino_id, reversed_ledger_id)` WHERE `reason = 'reversal'` - Prevents double-reversal

### Gap 2 Solution: Balance Drift Detection

**Recommended Approach: Option A - Scheduled Background Check**

**Why:**
- ✅ Simple (one SQL function + cron job)
- ✅ No write amplification (read-only check)
- ✅ Catches all drift sources (not just race conditions)
- ✅ Compliant with project guardrails (no over-engineering)
- ✅ Easy to test and reason about

**Components:**
1. `check_loyalty_balance_drift()` SQL function (detection)
2. Daily pg_cron job OR serverless cron endpoint (scheduling)
3. Audit log inserts (alerting)
4. Manual reconciliation SQL procedure (fixing)

**Why NOT Option B (trigger-based) or Option C (materialized view):**
- Triggers add write amplification (every ledger insert triggers balance check)
- Materialized views require refresh logic and add complexity
- Both are over-engineered for greenfield append-only ledger with transactional integrity

### Implementation Checklist

**Phase 1: Schema (WS1)**
- [ ] Add `source_kind`, `source_id`, `metadata`, `note`, `points_delta` columns
- [ ] Create Index 1: Base accrual uniqueness
- [ ] Create Index 2: Promotion uniqueness
- [ ] Create Index 3: Reversal uniqueness (optional but recommended)
- [ ] Verify Index 3 exists (universal idempotency)
- [ ] Add check constraint: `base_accrual` cannot be negative

**Phase 2: RPCs (WS2)**
- [ ] Update all RPCs to use idempotency pattern (check existing, INSERT with ON CONFLICT)
- [ ] Ensure all balance-updating RPCs use row locking (`FOR UPDATE`)
- [ ] Return `is_existing: boolean` in all mutating RPC outputs

**Phase 3: Drift Detection (WS2)**
- [ ] Create `check_loyalty_balance_drift()` function
- [ ] Set up pg_cron job OR serverless cron endpoint
- [ ] Configure audit_log inserts for drift events
- [ ] Document manual reconciliation procedure

**Phase 4: Testing (WS7)**
- [ ] Unit tests: Idempotency (duplicate calls return existing entry)
- [ ] Integration tests: Concurrent operations maintain balance integrity
- [ ] Drift tests: SQL assertions for balance = SUM(points_delta)
- [ ] Reconciliation test: Manual fix procedure works

---

## Related Documents

- **PRD-004**: `docs/10-prd/PRD-004-loyalty-service.md`
- **ADR-019 v2**: `docs/80-adrs/ADR-019-loyalty-points-policy_v2.md`
- **Execution Spec**: `docs/20-architecture/specs/PRD-004/EXECUTION-SPEC-PRD-004.md`
- **Migration Strategy**: `docs/20-architecture/specs/PRD-004/MIGRATION-STRATEGY-PRD-004.md`
- **Policy Document**: `docs/00-vision/LoyaltyService_Points_Policy_PT-2.md`

---

## Appendix A: Alternative Approaches Considered

### A.1 Idempotency: Why Not Application-Level Only?

**Rejected approach:**
```typescript
// Application-level check before RPC call
const existing = await supabase
  .from('loyalty_ledger')
  .select('id')
  .eq('casino_id', casinoId)
  .eq('rating_slip_id', slipId)
  .eq('reason', 'base_accrual')
  .single();

if (existing) return existing.id;

await supabase.rpc('rpc_accrue_on_close', { ... });
```

**Why rejected:**
- ❌ Race condition: Two processes can both check, both see null, both insert
- ❌ Violates database integrity (data layer should enforce constraints)
- ❌ Not idempotent across different clients/languages
- ✅ Database unique index is authoritative and race-safe

### A.2 Drift Detection: Why Not Triggers?

**Rejected approach:**
```sql
CREATE TRIGGER trg_loyalty_balance_check
AFTER INSERT ON loyalty_ledger
FOR EACH ROW
EXECUTE FUNCTION check_balance_after_insert();
```

**Why rejected:**
- ❌ Write amplification (every insert triggers check query)
- ❌ Slows down critical path (insert latency increases)
- ❌ Doesn't catch drift from manual DB edits or failed transactions
- ✅ Scheduled check is sufficient for detection (not prevention)

### A.3 Drift Detection: Why Not Materialized View?

**Rejected approach:**
```sql
CREATE MATERIALIZED VIEW loyalty_balance_snapshot AS
SELECT player_id, casino_id, SUM(points_delta) AS computed_balance
FROM loyalty_ledger
GROUP BY player_id, casino_id;

REFRESH MATERIALIZED VIEW CONCURRENTLY loyalty_balance_snapshot;
```

**Why rejected:**
- ❌ Adds complexity (refresh scheduling, concurrency handling)
- ❌ Stale data between refreshes
- ❌ Overkill for simple SUM query (PostgreSQL aggregates are fast)
- ✅ Direct query in scheduled check is simpler and always current

---

## Appendix B: Idempotency Key Generation Best Practices

**Client-side (TypeScript):**

```typescript
import { v4 as uuidv4 } from 'uuid';

// Generate idempotency key for request
const idempotencyKey = uuidv4();

// Store in request metadata for retry
const response = await fetch('/api/v1/loyalty/accrue', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,  // Also pass in header for middleware
  },
  body: JSON.stringify({
    rating_slip_id: slipId,
    idempotency_key: idempotencyKey,
  }),
});

// On retry (network failure, timeout), reuse same key
if (needsRetry) {
  await fetch('/api/v1/loyalty/accrue', {
    // ... same idempotencyKey ...
  });
}
```

**Server-side extraction (withServerAction middleware):**

```typescript
// Middleware extracts Idempotency-Key header
const idempotencyKey =
  request.headers.get('Idempotency-Key') ||
  body.idempotency_key ||
  uuidv4();  // Fallback: generate server-side

// Pass to service layer
await loyaltyService.accrueOnClose({
  rating_slip_id: body.rating_slip_id,
  idempotency_key: idempotencyKey,
});
```

**Key properties:**
- UUID v4 (random, 128-bit collision resistance)
- Client-generated (allows client-side retry logic)
- Header + body redundancy (HTTP semantics + DB semantics)
- Server fallback prevents null (defense in depth)

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-13 | Backend Architect | Initial specification for PRD-004 gap closure |

---
id: PRD-004-QUICK-REF
title: Idempotency & Drift Detection - Quick Reference
owner: Backend Architect
status: Proposed
relates_to: [PRD-004, IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC]
created: 2025-12-13
---

# Quick Reference: Idempotency & Drift Detection

**One-page implementation guide for PRD-004 LoyaltyService**

---

## Idempotency: 4 Required Indexes

```sql
-- 1. CRITICAL: Base accrual uniqueness (prevents double-minting)
CREATE UNIQUE INDEX ux_loyalty_ledger_base_accrual_unique
  ON loyalty_ledger (casino_id, source_kind, source_id, reason)
  WHERE reason = 'base_accrual';

-- 2. Promotion uniqueness (prevents duplicate campaigns)
CREATE UNIQUE INDEX ux_loyalty_ledger_promotion_unique
  ON loyalty_ledger (casino_id, source_kind, source_id, metadata->>'campaign_id')
  WHERE reason = 'promotion' AND metadata->>'campaign_id' IS NOT NULL;

-- 3. Universal idempotency (retry safety for all operations)
-- EXISTING: Already in 20251109214028_finance_loyalty_idempotency_outbox.sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_ledger_idempotency
  ON loyalty_ledger (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 4. OPTIONAL: Reversal uniqueness (prevents double-reversal)
CREATE UNIQUE INDEX ux_loyalty_ledger_reversal_unique
  ON loyalty_ledger (casino_id, metadata->>'reversed_ledger_id')
  WHERE reason = 'reversal' AND metadata->>'reversed_ledger_id' IS NOT NULL;
```

---

## Idempotency: RPC Pattern

```sql
CREATE OR REPLACE FUNCTION rpc_example(
  p_input uuid,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_existing record;
  v_ledger_id uuid;
BEGIN
  -- 1. Check existing (natural key OR idempotency_key)
  SELECT id, points_delta INTO v_existing
    FROM loyalty_ledger
   WHERE casino_id = auth.casino_id()
     AND (/* natural key match */ OR idempotency_key = p_idempotency_key)
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('ledger_id', v_existing.id, 'is_existing', true);
  END IF;

  -- 2. INSERT with idempotency_key
  INSERT INTO loyalty_ledger (/* ... */, idempotency_key)
  VALUES (/* ... */, p_idempotency_key)
  ON CONFLICT (casino_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_ledger_id;

  -- 3. Handle conflict
  IF v_ledger_id IS NULL THEN
    SELECT id, points_delta INTO v_existing
      FROM loyalty_ledger
     WHERE casino_id = auth.casino_id() AND idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ledger_id', v_existing.id, 'is_existing', true);
  END IF;

  -- 4. Update balance (in same transaction)
  UPDATE player_loyalty SET current_balance = current_balance + p_points_delta;

  RETURN jsonb_build_object('ledger_id', v_ledger_id, 'is_existing', false);
END;
$$;
```

---

## Drift Detection: Single SQL Function

```sql
CREATE OR REPLACE FUNCTION public.check_loyalty_balance_drift(
  p_casino_id uuid DEFAULT NULL,
  p_drift_threshold int DEFAULT 0
) RETURNS TABLE (
  casino_id uuid,
  player_id uuid,
  current_balance int,
  computed_balance bigint,
  drift int,
  ledger_entry_count bigint,
  last_ledger_update timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH ledger_sums AS (
    SELECT
      ll.casino_id, ll.player_id,
      SUM(ll.points_delta) AS computed_balance,
      COUNT(*) AS entry_count,
      MAX(ll.created_at) AS last_update
    FROM loyalty_ledger ll
    WHERE ll.casino_id = COALESCE(p_casino_id, ll.casino_id)
    GROUP BY ll.casino_id, ll.player_id
  )
  SELECT
    pl.casino_id, pl.player_id,
    pl.current_balance,
    COALESCE(ls.computed_balance, 0) AS computed_balance,
    (pl.current_balance - COALESCE(ls.computed_balance, 0)) AS drift,
    COALESCE(ls.entry_count, 0) AS ledger_entry_count,
    ls.last_update
  FROM player_loyalty pl
  LEFT JOIN ledger_sums ls ON pl.casino_id = ls.casino_id AND pl.player_id = ls.player_id
  WHERE ABS(pl.current_balance - COALESCE(ls.computed_balance, 0)) > p_drift_threshold
    AND pl.casino_id = COALESCE(p_casino_id, pl.casino_id)
  ORDER BY ABS(drift) DESC;
$$;
```

**Usage:**

```sql
-- Check all casinos
SELECT * FROM check_loyalty_balance_drift();

-- Check specific casino with tolerance
SELECT * FROM check_loyalty_balance_drift('casino-uuid', 10);
```

---

## Drift Detection: Scheduled Monitoring

**Option A: pg_cron (if available)**

```sql
SELECT cron.schedule(
  'loyalty-balance-drift-check',
  '0 3 * * *',  -- 3 AM daily
  $$
    INSERT INTO audit_log (domain, action, details)
    SELECT 'loyalty', 'balance_drift_detected',
      jsonb_build_object('casino_id', casino_id, 'drift', drift, /* ... */)
    FROM check_loyalty_balance_drift()
    WHERE ABS(drift) > 0;
  $$
);
```

**Option B: Vercel Cron (serverless)**

```typescript
// app/api/admin/loyalty/reconcile/route.ts
export async function POST() {
  const { data } = await supabase.rpc('check_loyalty_balance_drift', { p_drift_threshold: 0 });

  if (data.length > 0) {
    await supabase.from('audit_log').insert(
      data.map(d => ({ domain: 'loyalty', action: 'balance_drift_detected', details: d }))
    );
  }

  return Response.json({ drift_count: data.length });
}
```

```json
// vercel.json
{ "crons": [{ "path": "/api/admin/loyalty/reconcile", "schedule": "0 3 * * *" }] }
```

---

## Drift Reconciliation: Manual Fix

```sql
-- Fix single player
WITH correct_balance AS (
  SELECT SUM(points_delta) AS balance
  FROM loyalty_ledger
  WHERE casino_id = 'casino-uuid' AND player_id = 'player-uuid'
)
UPDATE player_loyalty
   SET current_balance = (SELECT balance FROM correct_balance),
       updated_at = now()
 WHERE casino_id = 'casino-uuid' AND player_id = 'player-uuid';

-- Bulk fix all drifted players (use with caution)
WITH correct_balances AS (
  SELECT casino_id, player_id, SUM(points_delta) AS correct_balance
  FROM loyalty_ledger
  GROUP BY casino_id, player_id
)
UPDATE player_loyalty pl
   SET current_balance = cb.correct_balance, updated_at = now()
  FROM correct_balances cb
 WHERE pl.casino_id = cb.casino_id
   AND pl.player_id = cb.player_id
   AND pl.current_balance != cb.correct_balance;
```

---

## Balance Update Pattern (Prevents Drift)

**All RPCs that update balance MUST:**

```sql
BEGIN;  -- Implicit in PLPGSQL

  -- 1. Lock row
  SELECT current_balance INTO v_before
    FROM player_loyalty
   WHERE player_id = p_player_id AND casino_id = auth.casino_id()
   FOR UPDATE;

  -- 2. Compute new balance
  v_after := v_before + p_points_delta;

  -- 3. Insert ledger (in same transaction)
  INSERT INTO loyalty_ledger (...) VALUES (...) RETURNING id INTO v_ledger_id;

  -- 4. Update balance (in same transaction)
  UPDATE player_loyalty
     SET current_balance = v_after
   WHERE player_id = p_player_id AND casino_id = auth.casino_id();

  RETURN jsonb_build_object('balance_before', v_before, 'balance_after', v_after);

COMMIT;  -- Implicit
```

---

## Test Assertions

```sql
-- Test: Balance equals sum after operation
DO $$ BEGIN
  ASSERT (
    SELECT current_balance FROM player_loyalty WHERE player_id = 'test-uuid'
  ) = (
    SELECT SUM(points_delta) FROM loyalty_ledger WHERE player_id = 'test-uuid'
  ), 'Balance drift detected';
END $$;

-- Test: Idempotency (duplicate call returns existing)
DO $$
DECLARE
  v_first jsonb;
  v_second jsonb;
BEGIN
  v_first := rpc_accrue_on_close('slip-uuid', 'idem-key-uuid');
  v_second := rpc_accrue_on_close('slip-uuid', 'idem-key-uuid');

  ASSERT v_first->>'ledger_id' = v_second->>'ledger_id', 'Idempotency failed';
  ASSERT (v_second->>'is_existing')::boolean, 'Second call should return existing';
END $$;
```

---

## Implementation Checklist

**Phase 1: Schema**
- [ ] Add columns: `source_kind`, `source_id`, `metadata`, `note`, `points_delta`
- [ ] Create 4 unique indexes (base_accrual, promotion, idempotency, reversal)
- [ ] Add check constraint: `base_accrual` cannot be negative

**Phase 2: RPCs**
- [ ] Implement idempotency pattern in all mutating RPCs
- [ ] Use row locking (`FOR UPDATE`) for balance updates
- [ ] Return `is_existing: boolean` in outputs

**Phase 3: Drift Detection**
- [ ] Create `check_loyalty_balance_drift()` function
- [ ] Set up scheduled job (pg_cron or serverless)
- [ ] Configure audit logging

**Phase 4: Testing**
- [ ] Unit: Idempotency tests
- [ ] Integration: Concurrent operations
- [ ] Assertions: Balance = SUM(points_delta)

---

## Alert Thresholds

| Severity | Condition | Action |
|----------|-----------|--------|
| **Critical** | `ABS(drift) > 1000` | Page on-call |
| **Warning** | `ABS(drift) > 100` | Notify ops |
| **Info** | Any drift | Log |

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Unique indexes over app-level checks** | Database is authoritative, prevents race conditions |
| **Scheduled drift check over triggers** | No write amplification, simpler, guardrails-compliant |
| **Row locking over optimistic concurrency** | Prevents race conditions in balance updates |
| **Idempotency key required for all mutations** | Retry safety, HTTP semantics, ADR-019 compliance |

---

**Full Specification**: `/home/diepulp/projects/pt-2/docs/20-architecture/specs/PRD-004/IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md`

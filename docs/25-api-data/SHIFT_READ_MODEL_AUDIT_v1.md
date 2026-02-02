---
title: "Shift Read-Model Audit v1"
doc_kind: api-data-contract
version: v1.0
status: active
created: 2026-02-02
applies_to: services/table-context/shift-metrics/
related:
  - SHIFT_SNAPSHOT_RULES_v1.md
  - SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md
---

# Shift Read-Model Audit v1

Defines the reconciliation rules and audit harness for validating that table -> pit -> casino rollups are mathematically correct, direction filters are enforced, and coverage-aware fields behave consistently.

---

## 1. Reconciliation Rules

### 1.1 Table -> Pit Reconciliation

For every pit `P` in the shift window, the following MUST hold:

```
pit[P].fills_total_cents = SUM(table.fills_total_cents WHERE table.pit_id = P)
pit[P].credits_total_cents = SUM(table.credits_total_cents WHERE table.pit_id = P)
pit[P].estimated_drop_buyins_total_cents = SUM(table.estimated_drop_buyins_cents WHERE table.pit_id = P)
pit[P].estimated_drop_rated_total_cents = SUM(table.estimated_drop_rated_cents WHERE table.pit_id = P)
pit[P].estimated_drop_grind_total_cents = SUM(table.estimated_drop_grind_cents WHERE table.pit_id = P)
```

**Superset invariant**: `buyins_total = rated_total + grind_total` holds because `RATED_ADJUSTMENT` telemetry rows (which may be negative) are included in `rated_total`. Adjustments modify the rated component, keeping the superset identity valid.

### 1.2 Win/Loss Reconciliation (NULL-aware)

```
pit[P].win_loss_inventory_total_cents = SUM(
  table.win_loss_inventory_cents
  WHERE table.pit_id = P
  AND table.win_loss_inventory_cents IS NOT NULL
)

pit[P].win_loss_estimated_total_cents = SUM(
  table.win_loss_estimated_cents
  WHERE table.pit_id = P
  AND table.win_loss_estimated_cents IS NOT NULL
)
```

**Invariant**: NULL values are excluded from SUM, not treated as zero.

### 1.3 Pit -> Casino Reconciliation

```
casino.fills_total_cents = SUM(pit.fills_total_cents for all pits)
casino.credits_total_cents = SUM(pit.credits_total_cents for all pits)
casino.estimated_drop_buyins_total_cents = SUM(pit.estimated_drop_buyins_total_cents for all pits)
casino.win_loss_inventory_total_cents = SUM(pit.win_loss_inventory_total_cents for all pits)
casino.win_loss_estimated_total_cents = SUM(pit.win_loss_estimated_total_cents for all pits)
```

### 1.4 Count Reconciliation

```
casino.tables_count = SUM(pit.tables_count for all pits) + tables_without_pit
casino.tables_with_opening_snapshot = SUM(pit.tables_with_opening_snapshot) + unassigned_with_opening
casino.tables_with_closing_snapshot = SUM(pit.tables_with_closing_snapshot) + unassigned_with_closing
```

Note: Tables with `pit_id = NULL` are included in casino totals but not in any pit rollup.

---

## 2. Fields to Reconcile

| Field | Nullable | Aggregation Rule |
|-------|----------|------------------|
| `fills_total_cents` | No | Standard SUM |
| `credits_total_cents` | No | Standard SUM |
| `estimated_drop_buyins_total_cents` | No | Standard SUM |
| `estimated_drop_rated_total_cents` | No | Standard SUM |
| `estimated_drop_grind_total_cents` | No | Standard SUM |
| `win_loss_inventory_total_cents` | Yes (table-level) | NULL-aware SUM |
| `win_loss_estimated_total_cents` | Yes (table-level) | NULL-aware SUM |
| `tables_count` | No | COUNT |
| `tables_with_opening_snapshot` | No | COUNT |
| `tables_with_closing_snapshot` | No | COUNT |
| `tables_with_telemetry_count` | No | COUNT |
| `tables_good_coverage_count` | No | COUNT |

---

## 3. Direction Filter Enforcement

### 3.1 Cash Observation Direction Rules

Cash observation rollups MUST only include `cash_out` direction observations for MVP:

```sql
-- Audit query: verify no cash_in observations leak into rollups
SELECT COUNT(*) AS violation_count
FROM cash_observation
WHERE direction != 'cash_out'
  AND created_at >= $window_start
  AND created_at < $window_end
  AND id IN (
    -- IDs referenced by rollup RPCs
    SELECT observation_id FROM shift_cash_obs_rollup_source
  )
```

If `violation_count > 0`, the audit FAILS.

### 3.2 Alert Direction Filter

All alerts returned by `rpc_shift_cash_obs_alerts` MUST have `alert_type = 'cash_out_observed_spike_telemetry'`. Any other alert type is a filter violation.

---

## 4. Coverage-Aware Field Rules

### 4.1 NULL Preservation

When `missing_opening_snapshot = true` OR `missing_closing_snapshot = true`:
- `win_loss_inventory_cents` MUST be `NULL`
- It MUST NOT be `0`

### 4.2 Aggregation Integrity

The rollup MUST NOT treat NULL as zero:

```
-- CORRECT:
SUM(win_loss_inventory_cents) FILTER (WHERE win_loss_inventory_cents IS NOT NULL)

-- WRONG:
SUM(COALESCE(win_loss_inventory_cents, 0))  -- This masks missing data
```

### 4.3 Coverage-Aware Display

Fields computed from partial data MUST NOT masquerade as authoritative:
- Pit-level `win_loss_inventory_total_cents` with `coverage_ratio < 1.0` represents a partial sum
- The UI MUST display a coverage indicator alongside the value

---

## 5. Audit SQL Approach

### 5.1 Structure

The audit harness consists of a single SQL script that:

1. Fetches table-level metrics for a shift window
2. Computes expected pit-level aggregates from table data
3. Compares expected vs actual pit-level values
4. Computes expected casino-level aggregates from pit data
5. Compares expected vs actual casino-level values
6. Reports any discrepancies

### 5.2 Query Pattern

```sql
-- Step 1: Table metrics (source of truth)
WITH table_metrics AS (
  SELECT * FROM rpc_shift_table_metrics($window_start, $window_end)
),

-- Step 2: Expected pit rollups
expected_pits AS (
  SELECT
    pit_id,
    COUNT(*) AS tables_count,
    SUM(fills_total_cents) AS fills_total_cents,
    SUM(credits_total_cents) AS credits_total_cents,
    SUM(estimated_drop_buyins_cents) AS estimated_drop_buyins_total_cents,
    SUM(win_loss_inventory_cents) FILTER (WHERE win_loss_inventory_cents IS NOT NULL) AS win_loss_inventory_total_cents,
    SUM(win_loss_estimated_cents) FILTER (WHERE win_loss_estimated_cents IS NOT NULL) AS win_loss_estimated_total_cents
  FROM table_metrics
  WHERE pit_id IS NOT NULL
  GROUP BY pit_id
),

-- Step 3: Actual pit metrics (from RPC or client-side)
-- Compare expected_pits vs actual_pits

-- Step 4: Expected casino rollup
expected_casino AS (
  SELECT
    SUM(fills_total_cents) AS fills_total_cents,
    SUM(credits_total_cents) AS credits_total_cents,
    ...
  FROM expected_pits
)

-- Step 5: Compare expected_casino vs actual_casino
-- Step 6: Report discrepancies as rows with (level, field, expected, actual, delta)
```

### 5.3 Output Format

```
level  | entity_id | field                          | expected | actual | delta | status
-------+-----------+--------------------------------+----------+--------+-------+-------
pit    | uuid-1    | fills_total_cents              | 150000   | 150000 | 0     | PASS
pit    | uuid-1    | win_loss_inventory_total_cents  | 50000    | 50000  | 0     | PASS
casino | -         | fills_total_cents              | 450000   | 450000 | 0     | PASS
casino | -         | tables_count                   | 12       | 12     | 0     | PASS
```

---

## 6. Audit Failure Handling

### 6.1 Failures Are Blockers

Any reconciliation discrepancy (`delta != 0`) is a **blocker**, not a warning.

### 6.2 Failure Response

When the audit fails:
1. Log the discrepancy details (level, field, expected vs actual, delta)
2. Block further UI integration work until the math is fixed
3. Investigation starts at the table level (source of truth) and works upward

---

## 7. Implementation Mapping

| Component | File | Responsibility |
|-----------|------|----------------|
| Audit SQL | `scripts/audit/shift-read-model-audit.sql` | Full reconciliation query |
| Audit test wrapper | `services/table-context/__tests__/shift-read-model-audit.test.ts` | Jest test that validates reconciliation logic using mock data |
| Direction filter test | `services/table-context/__tests__/shift-read-model-audit.test.ts` | Verify cash_out-only filter enforcement |
| NULL preservation test | `services/table-context/__tests__/shift-read-model-audit.test.ts` | Verify NULL is not coerced to zero |

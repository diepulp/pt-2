# ISSUE: Shift Dashboard Telemetry Pipeline — Stale Data, 100x Inflation, Adjustment Blackout

**ID**: ISSUE-SHIFT-DASH-STALE-ADJ
**Severity**: Critical (shift dashboard displays 100x inflated drop; adjustments invisible)
**Status**: Open — Ready for Implementation
**Created**: 2026-02-02
**Updated**: 2026-02-02
**Category**: Data Pipeline Gap + Data Corruption
**Related Components**: Rating Slip, PlayerFinancial, ShiftDashboardV3, Telemetry Bridge
**Tags:** shift-dashboard, buy-in, adjustment, telemetry, stale-data, invalidation, finance-bridge, 100x-inflation, ADR-031

---

## 1. Executive Summary

Three independent bugs compound in the shift dashboard's telemetry pipeline:

1. **100x amount inflation** — The bridge trigger multiplies `player_financial_transaction.amount`
   by 100, but the column already stores cents. Every bridged telemetry row is 100x too large.
   A $200 buy-in displays as $20,000 on the shift dashboard.

2. **Adjustment blackout** — Five compounding gaps prevent buy-in adjustments from reaching the
   telemetry table. The shift dashboard never reflects corrections.

3. **Grind correction gap** — No RPC exists to adjust or void grind buy-in observations once
   logged to telemetry.

The double-count display bug (rated + grind + total = 2x) was fixed in `cbb8c5a` for v3.
The 100x inflation and adjustment blackout remain open.

---

## 2. Bug 1: 100x Amount Inflation (Critical)

### Root Cause

**Location**: `supabase/migrations/20260117180000_fix_telemetry_bridge_on_conflict.sql:64`

```sql
COALESCE(NEW.amount, 0) * 100, -- Convert dollars to cents
```

The comment says "dollars to cents" but `player_financial_transaction.amount` stores **cents**
(ADR-031, confirmed by COMMENT ON COLUMN in migration `20260202011751`). The frontend converts
dollars to cents before writing:

```typescript
// hooks/rating-slip-modal/use-save-with-buyin.ts:121
amount: newBuyIn * 100, // Convert dollars to cents
```

The bridge applies a second ×100, producing values 100x too large in `table_buyin_telemetry`.

### Production Evidence

Queried `player_financial_transaction` joined to `table_buyin_telemetry` via idempotency key:

| pft.amount (cents) | telemetry.amount_cents | Ratio | Actual buy-in |
|---|---|---|---|
| 10,000 | 1,000,000 | 100x | $100 |
| 20,000 | 2,000,000 | 100x | $200 |
| 50,000 | 5,000,000 | 100x | $500 |
| 60,000 | 6,000,000 | 100x | $600 |
| 310,000 | 31,000,000 | 100x | $3,100 |

**Every bridged row shows ratio = 100.0.** Aggregate: 57,850,000 telemetry cents total; dashboard
displays $578,500 via `formatCents()` — actual value should be ~$5,785.

### How It Happened

| Date | Event | Effect |
|---|---|---|
| Jan 15-17 | Bridge trigger written with `NEW.amount * 100` | Assumed `pft.amount` was dollars |
| Jan 19 | ISSUE-FB8EB717 standardized amounts to cents | `pft.amount` became cents; bridge not updated |
| Feb 2 | ADR-031 added COMMENT ON COLUMN declaring cents | Metadata-only pass; bridge not audited |

### Cross-Check: MTL Bridge Is Correct

The MTL bridge (`fn_derive_mtl_from_finance`, migration `20260119162505:139`) passes
`NEW.amount` directly without conversion, treating both sides as cents. This confirms the
source column stores cents and the telemetry bridge is the outlier.

---

## 3. Bug 2: Adjustment Blackout (5 Compounding Gaps)

### Working Path (Normal Buy-in)

```
Rating Slip UI
  -> useSaveWithBuyIn() -> amount: newBuyIn * 100
    -> createFinancialTransaction({ amount: cents, rating_slip_id: uuid })
      -> INSERT player_financial_transaction (direction='in', txn_kind='original')
        -> TRIGGER bridge_rated_buyin_to_telemetry() FIRES
          -> INSERT table_buyin_telemetry (telemetry_kind='RATED_BUYIN')
            -> rpc_shift_table_metrics reads telemetry
              -> ShiftDashboardV3 displays drop (inflated 100x, but present)
```

### Broken Path (Buy-in Adjustment)

```
Rating Slip Modal
  -> useCreateFinancialAdjustment() -> delta_amount: deltaAmount * 100
    -> supabase.rpc('rpc_create_financial_adjustment')
      -> INSERT player_financial_transaction
         (direction='in', rating_slip_id=NULL, txn_kind='adjustment', amount=-50000)
        -> TRIGGER DOES NOT FIRE (rating_slip_id IS NULL)
        -> NO telemetry row created
        -> Frontend does NOT invalidate shiftDashboardKeys
        -> Shift dashboard stale — never sees the adjustment
```

### Gap 1: Bridge Trigger Guards Block Adjustments (Database)

**Location**: `supabase/migrations/20260117180000_fix_telemetry_bridge_on_conflict.sql:22-29`

```sql
IF NEW.direction IS NULL OR NEW.direction != 'in' THEN RETURN NEW; END IF;
IF NEW.rating_slip_id IS NULL THEN RETURN NEW; END IF;
```

Adjustments have `rating_slip_id = NULL`, so the trigger returns early.

### Gap 2: Adjustment RPC Omits `rating_slip_id` (Database)

**Location**: `supabase/migrations/20260116150149_add_financial_adjustment_support.sql:233-268`

`rpc_create_financial_adjustment` INSERT omits `rating_slip_id`. Even if the trigger were
relaxed, the bridge function cannot resolve `table_id` (requires `rating_slip.table_id` lookup
via `NEW.rating_slip_id`).

### Gap 3: Telemetry Constraints Block Negative Amounts (Database)

**Location**: `supabase/migrations/20260114003530_table_buyin_telemetry.sql:58-59`

```sql
CONSTRAINT chk_amount_positive CHECK (amount_cents > 0),
CONSTRAINT chk_telemetry_kind CHECK (telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN'))
```

- `chk_amount_positive` rejects negative adjustment amounts.
- `chk_telemetry_kind` has no `'RATED_ADJUSTMENT'` kind.

### Gap 4: Missing TanStack Query Invalidation (Frontend)

**Location**: `hooks/player-financial/use-financial-mutations.ts:119-161`

`useCreateFinancialAdjustment` onSuccess invalidates `playerFinancialKeys.*` and
`ratingSlipModalKeys.scope` but **not** `shiftDashboardKeys.*`. The shift dashboard uses a
separate query key hierarchy (`['shift-dashboard', ...]`) with no cross-context invalidation.

### Gap 5: No Realtime Subscription on ShiftDashboardV3 (Frontend)

**Location**: `components/shift-dashboard-v3/shift-dashboard-v3.tsx`

Polling-only: `staleTime: 60_000`, `refetchOnWindowFocus: true`. No Supabase realtime
subscription on `player_financial_transaction` or `table_buyin_telemetry`. The pit dashboard's
`useDashboardRealtime` listens to `gaming_table` and `rating_slip` only — not financial tables.

---

## 4. Bug 3: Grind Buy-in Corrections Not Possible (Medium)

Grind buy-ins are logged directly to `table_buyin_telemetry` via `rpc_log_table_buyin_telemetry`
with no corresponding `player_financial_transaction` record. There is no RPC to adjust or void
a grind observation. Once logged, a grind entry is permanent.

**Deferral note**: This is a design gap, not a regression. Recommend tracking separately as a
feature request for a `rpc_void_telemetry_entry` RPC with appropriate authorization.

---

## 5. Impact

| Scenario | Current Behavior | Expected Behavior |
|---|---|---|
| $200 rated buy-in | Dashboard shows **$20,000** (100x) | Dashboard shows $200 |
| $500 buy-in adjusted -$100 | Dashboard shows **$50,000**, no change | Dashboard shows $400 |
| Pit boss corrects wrong amount | Rating slip shows corrected; dashboard shows stale | Both consistent |
| End-of-shift drop audit | Drop figures 100x inflated | Accurate drop for compliance |

---

## 6. Remediation Plan

### Workstream 1: Fix 100x Bridge Inflation (Database Migration)

**Priority**: P0 — all telemetry data is corrupted while this persists.

#### WS1-A: Fix bridge function

```sql
CREATE OR REPLACE FUNCTION bridge_rated_buyin_to_telemetry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
-- ... (existing logic unchanged until INSERT VALUES) ...
  ) VALUES (
    NEW.casino_id,
    v_table_id,
    'RATED_BUYIN',
    COALESCE(NEW.amount, 0)::bigint,  -- amount is already cents per ADR-031
    -- ... rest unchanged ...
  )
$$;
```

Remove the `* 100` multiplication. Cast to `bigint` for type compatibility.

#### WS1-B: Repair existing telemetry data

```sql
UPDATE table_buyin_telemetry
SET amount_cents = amount_cents / 100
WHERE source = 'finance_bridge'
  AND idempotency_key LIKE 'pft:%';
```

Only affects bridge-created rows. Manual entries via `rpc_log_table_buyin_telemetry` (which
accepts `p_amount_cents` directly) and seed data are unaffected.

#### WS1-C: Add invariant comment to bridge function

```sql
COMMENT ON FUNCTION bridge_rated_buyin_to_telemetry() IS
  'ADR-031: player_financial_transaction.amount is in CENTS. No conversion needed.';
```

### Workstream 2: Enable Adjustment Telemetry Flow (Database Migration)

**Priority**: P1 — adjustments invisible to shift dashboard.

#### WS2-A: Relax telemetry constraints

```sql
ALTER TABLE table_buyin_telemetry
  DROP CONSTRAINT chk_amount_positive,
  ADD CONSTRAINT chk_amount_nonzero CHECK (amount_cents <> 0);

ALTER TABLE table_buyin_telemetry
  DROP CONSTRAINT chk_telemetry_kind,
  ADD CONSTRAINT chk_telemetry_kind CHECK (
    telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN', 'RATED_ADJUSTMENT')
  );
```

#### WS2-B: Adjustment RPC — inherit `rating_slip_id` from original transaction

Inside `rpc_create_financial_adjustment`, before the INSERT:

```sql
SELECT pft.rating_slip_id INTO v_rating_slip_id
FROM player_financial_transaction pft
WHERE pft.id = p_original_txn_id;
```

Include `v_rating_slip_id` in the INSERT column list. This allows the bridge trigger to
resolve `table_id` via the rating slip lookup.

#### WS2-C: Bridge trigger — handle adjustment transactions

Extend the bridge function to emit `RATED_ADJUSTMENT` telemetry:

```sql
-- After existing guards, add adjustment path:
IF NEW.txn_kind = 'adjustment' AND NEW.rating_slip_id IS NOT NULL THEN
  v_telemetry_kind := 'RATED_ADJUSTMENT';
ELSIF NEW.direction = 'in' AND NEW.rating_slip_id IS NOT NULL THEN
  v_telemetry_kind := 'RATED_BUYIN';
ELSE
  RETURN NEW;
END IF;
```

Use `v_telemetry_kind` in the INSERT. Amount passes through as-is (already cents, can be
negative for adjustments).

#### WS2-D: Shift metrics RPC — include adjustments in drop aggregation

```sql
COALESCE(SUM(tbt.amount_cents) FILTER (
  WHERE tbt.telemetry_kind IN ('RATED_BUYIN', 'RATED_ADJUSTMENT')
), 0)::bigint AS estimated_drop_rated_cents,
```

The `RATED_ADJUSTMENT` rows have negative `amount_cents`, so SUM naturally reduces the total.

**Stat model contract update**: Update `SHIFT_METRICS_CONTRACT_v1.md` §2 to note that
`estimated_drop_rated_cents` includes `RATED_ADJUSTMENT` rows (negative amounts that reduce
the total). Update `SHIFT_READ_MODEL_AUDIT_v1.md` to note the superset invariant
`buyins = rated + grind` holds because adjustments roll into `rated`.

### Workstream 3: Frontend Cache Invalidation (TypeScript)

**Priority**: P1 — ensures dashboard refreshes immediately after adjustment.

#### WS3-A: Add shift dashboard invalidation to adjustment mutation

In `hooks/player-financial/use-financial-mutations.ts`, `useCreateFinancialAdjustment` onSuccess:

```typescript
import { shiftDashboardKeys } from '@/hooks/shift-dashboard/keys';

// After existing invalidations:
queryClient.invalidateQueries({
  queryKey: shiftDashboardKeys.summary.scope,
});
queryClient.invalidateQueries({
  queryKey: shiftDashboardKeys.cashObsSummary.scope,
});
```

### Workstream 4: Test Data Consistency (TypeScript)

**Priority**: P2 — prevents regression.

#### WS4-A: Fix test mock invariant

In `components/shift-dashboard-v3/__tests__/win-loss-trend-chart.test.tsx:49-51`:

```typescript
estimated_drop_rated_total_cents: 200000,
estimated_drop_grind_total_cents: 50000,
estimated_drop_buyins_total_cents: 250000, // Must equal rated + grind
```

---

## 7. Sequencing and Dependencies

```
WS1-A (fix bridge * 100)
  ↓
WS1-B (repair existing data)   ← must run AFTER WS1-A is deployed
  ↓
WS2-A (relax constraints)
  ↓
WS2-B (RPC inherit rating_slip_id)
  ↓
WS2-C (bridge adjustment path)  ← depends on WS2-A + WS2-B
  ↓
WS2-D (metrics RPC filter)      ← depends on WS2-C
  ↓
WS3-A (frontend invalidation)   ← independent, can parallel with WS2
  ↓
WS4-A (test data fix)           ← independent, can parallel with all
```

**Minimum viable fix**: WS1-A + WS1-B fixes the 100x inflation for all current buy-ins.
WS3-A can ship in parallel for immediate UX improvement (forces refetch after adjustment,
even though adjustment data won't appear in telemetry until WS2 ships).

---

## 8. Files Affected

| File | Workstream | Change |
|------|-----------|--------|
| `supabase/migrations/20260117180000_fix_telemetry_bridge_on_conflict.sql` | WS1-A, WS2-C | Remove `* 100`; add adjustment path |
| `supabase/migrations/20260114003530_table_buyin_telemetry.sql` | WS2-A | Relax CHECK constraints |
| `supabase/migrations/20260116150149_add_financial_adjustment_support.sql` | WS2-B | Inherit `rating_slip_id` in RPC |
| `supabase/migrations/20260114004336_rpc_shift_table_metrics.sql` | WS2-D | Include `RATED_ADJUSTMENT` in filter |
| `hooks/player-financial/use-financial-mutations.ts` | WS3-A | Add `shiftDashboardKeys` invalidation |
| `components/shift-dashboard-v3/__tests__/win-loss-trend-chart.test.tsx` | WS4-A | Fix mock data invariant |
| `services/table-context/shift-metrics/service.ts` | — | No changes needed (pass-through) |

All changes are new forward migrations; no existing migration files are modified.

---

## 9. Validation Criteria

| Check | Method |
|---|---|
| Bridge writes correct cents | `SELECT pft.amount, tbt.amount_cents FROM ... WHERE ratio != 1` returns 0 rows |
| Existing data repaired | `SELECT COUNT(*) FROM table_buyin_telemetry WHERE source='finance_bridge' AND amount_cents > 50000000` returns 0 |
| Adjustment creates telemetry row | Insert adjustment via RPC, query telemetry for `telemetry_kind='RATED_ADJUSTMENT'` |
| Shift metrics include adjustments | `rpc_shift_table_metrics` returns reduced `estimated_drop_rated_cents` after negative adjustment |
| Dashboard refreshes after adjustment | Create adjustment in UI, observe shift dashboard update without manual refresh |
| `npm run type-check` passes | No TypeScript errors from new imports |
| `npm run test` passes | All existing + updated tests green |
| Win/loss estimated is plausible after WS1 | `win_loss_estimated_cents` from `rpc_shift_table_metrics` returns values in same order of magnitude as `win_loss_inventory_cents` (stat model formula uses `estimated_drop_buyins_cents` which was 100x inflated) |

---

## 10. ADR-031 Addendum

This issue exposed a gap in ADR-031's implementation process. The Phase 2 "SQL Column Comments"
pass was metadata-only and did not audit consumers of annotated columns. The bridge trigger's
`* 100` directly contradicts the COMMENT ON COLUMN it sits next to.

**Recommended process addition**: Any migration that documents a column's unit via COMMENT ON
COLUMN must also verify all triggers, functions, and RPCs that read or write that column use
consistent unit assumptions. Add this as Rule 6 to the ADR-031 convention.

---

## 11. Out of Scope (Tracked Separately)

| Item | Reason | Tracking |
|---|---|---|
| Grind buy-in correction RPC | New feature, not a regression | Separate feature request |
| Realtime subscription for ShiftDashboardV3 | Enhancement, polling is adequate with invalidation fix | Backlog |
| Cash-out adjustment telemetry | Cash-outs not tracked in telemetry by design | Future PRD if needed |
| Player timeline adjustment events | Phase 2 of ADR-029 | Existing backlog item |

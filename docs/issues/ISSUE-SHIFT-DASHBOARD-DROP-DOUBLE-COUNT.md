# ISSUE: Shift Dashboard Estimated Drop Double-Counting

**ID**: ISSUE-SHIFT-DASH-DROP-2X
**Severity**: High (financial KPI displays 2x actual value)
**Status**: Open
**Created**: 2026-02-02
**Category**: Data Display / Aggregation Bug
**Related Components**: ShiftDashboardV3, SecondaryKpiStack
**Blocked By**: ADR-031 (Financial Amount Convention — Cents Storage, Dollars at Service Boundary)
**Tags:** shift-dashboard, estimated-drop, double-count, telemetry, KPI, ADR-031

---

## 0. Implementation Dependency: ADR-031

**This issue's fix MUST NOT land until ADR-031 is accepted and its Phase 1 deliverables are merged.**

ADR-031 (`docs/80-adrs/ADR-031-financial-amount-convention.md`) standardizes the cents-to-dollars
conversion boundary system-wide. This issue is a direct symptom of the problems ADR-031 addresses:

| ADR-031 Rule | Relevance to This Issue |
|---|---|
| **Rule 2** — Service layer is the single conversion boundary | The fix must ensure cents-to-dollars conversion happens in the service/mapper, not the component. The corrected `estDropTotal` (in cents) must be passed through `formatCents()` at display time. |
| **Rule 3** — Named formatting functions (`formatDollars` / `formatCents`) | The fixed component should use `formatCents(estDropTotal)` instead of the current ad-hoc `formatCurrency()` call, making the input unit unambiguous. |
| **Rule 4** — DTO field naming convention with unit suffix | The misleading field name `estimated_drop_buyins_total_cents` (which sounds like a third category alongside rated/grind but is the superset total) should be renamed to `estimated_drop_total_cents` as part of the ADR-031 DTO annotation sweep. This prevents the same confusion from recurring. |

**Sequencing:**
1. ADR-031 Phase 1 lands `formatDollars()` / `formatCents()` in `lib/format.ts`
2. ADR-031 Phase 3 annotates shift metrics DTOs with explicit unit documentation
3. This issue's fix applies using the ADR-031 formatting functions and renamed DTO fields
4. If ADR-031 Phase 3 renames `buyins_total_cents` → `total_cents`, the fix naturally eliminates the naming ambiguity that caused the bug

Fixing the arithmetic without ADR-031 would correct the immediate 2x display error but leave the
naming ambiguity and formatting fragmentation that caused the bug in the first place.

---

## 1. Executive Summary

The shift dashboard displays an estimated drop of ~$320,000 when the actual value is ~$160,000.
The root cause is a UI-layer arithmetic error that sums three overlapping aggregation fields,
producing exactly 2x the correct value. The same bug exists in both the v2 and v3 dashboard
implementations.

---

## 2. Root Cause

`SecondaryKpiStack` sums `rated + grind + buyins`, but `buyins` is already the total of
`rated + grind`. The result is always `2 * actual_drop`.

### Primary Bug Location (v3)

`components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx:58-61`

```typescript
const estDropTotal =
  (data?.estimated_drop_rated_total_cents ?? 0) +   // rated subset
  (data?.estimated_drop_grind_total_cents ?? 0) +   // grind subset
  (data?.estimated_drop_buyins_total_cents ?? 0);   // rated + grind (superset total)
```

### Same Bug in v2

`app/review/shift-dashboard-v2/components/secondary-kpis-row.tsx:25-28`

```typescript
const estDropTotal =
  (data?.estimated_drop_rated_total_cents ?? 0) +
  (data?.estimated_drop_grind_total_cents ?? 0) +
  (data?.estimated_drop_buyins_total_cents ?? 0);
```

---

## 3. Proof of Double-Count (SQL/RPC Trace)

The three fields originate from `rpc_shift_table_metrics` (`supabase/migrations/20260114004336_rpc_shift_table_metrics.sql:202-214`):

```sql
-- telemetry_agg CTE:
SUM(amount_cents) FILTER (WHERE telemetry_kind = 'RATED_BUYIN')  AS rated_cents,
SUM(amount_cents) FILTER (WHERE telemetry_kind = 'GRIND_BUYIN')  AS grind_cents,
SUM(amount_cents)                                                 AS total_cents,
```

The `table_buyin_telemetry` CHECK constraint (`20260114003530_table_buyin_telemetry.sql:59`)
enforces `telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')`. With exactly two kinds:

```
total_cents = rated_cents + grind_cents   (always, by identity)
```

Therefore the UI computes:

```
rated + grind + buyins
= rated + grind + (rated + grind)
= 2 * (rated + grind)
= 2 * actual_drop
```

---

## 4. Data Flow (Full Path)

```
table_buyin_telemetry
  -> rpc_shift_table_metrics (SQL aggregation: rated, grind, total)
    -> getShiftDashboardSummary() service (services/table-context/shift-metrics/service.ts:207)
      -> client-side reduce rolls per-table into casino-level totals (lines 270-314)
        -> GET /api/v1/shift-dashboards/summary
          -> useShiftDashboardSummary() hook
            -> SecondaryKpiStack component  <-- BUG: sums all three
```

---

## 5. Impact

- **All shift dashboard users** see estimated drop inflated by exactly 2x.
- Financial reporting derived from this display will be incorrect.
- The v2 subtitle label "Rated + Grind + Cash" (line 54 of `secondary-kpis-row.tsx`) reveals the
  developer's mental model was three disjoint categories, when `buyins` is the superset.

---

## 6. Additional Observations

- `casino-summary-card.tsx` (components/shift-dashboard/casino-summary-card.tsx:256-276)
  is NOT affected — it displays each field as a separate KPI card.
- BJ-01 has two active `table_session` rows for the same gaming_day — separate data integrity
  concern, but NOT the cause of the 2x bug.
- The naming `estimated_drop_buyins_cents` is misleading; it sounds like a third category but is
  the unfiltered total. Renaming to `estimated_drop_total_cents` would prevent future confusion.

---

## 7. Recommended Fix (Post-ADR-031)

**Prerequisite:** ADR-031 Phase 1 merged (`formatDollars` / `formatCents` available in `lib/format.ts`).

### Step 1: Fix the arithmetic

Use only `estimated_drop_buyins_total_cents` (which is the total), OR `rated + grind`, never all three:

```typescript
// Option A (preferred): use the pre-computed total
const estDropTotal = data?.estimated_drop_buyins_total_cents ?? 0;

// Option B: sum the components
const estDropTotal =
  (data?.estimated_drop_rated_total_cents ?? 0) +
  (data?.estimated_drop_grind_total_cents ?? 0);
```

### Step 2: Use ADR-031 formatting functions

Replace any `formatCurrency(estDropTotal)` call with the ADR-031 named function:

```typescript
// Before (ambiguous — caller must know the unit)
formatCurrency(estDropTotal)

// After (ADR-031 Rule 3 — function name declares the unit)
formatCents(estDropTotal)
```

### Step 3: Rename DTO field (coordinate with ADR-031 Phase 3)

Rename `estimated_drop_buyins_total_cents` → `estimated_drop_total_cents` across the DTO,
RPC return columns, and service aggregation. This eliminates the naming ambiguity that caused
the original developer to treat it as a third disjoint category.

### Apply to both:
- `components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx`
- `app/review/shift-dashboard-v2/components/secondary-kpis-row.tsx`

---

## 8. Files Affected

| File | Lines | Role |
|------|-------|------|
| `components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx` | 58-61 | v3 bug location |
| `app/review/shift-dashboard-v2/components/secondary-kpis-row.tsx` | 25-28 | v2 bug location |
| `supabase/migrations/20260114004336_rpc_shift_table_metrics.sql` | 202-214, 242-244 | RPC field definitions |
| `supabase/migrations/20260114003530_table_buyin_telemetry.sql` | 58-59 | CHECK constraints proving identity |
| `services/table-context/shift-metrics/service.ts` | 207, 270-314 | Aggregation pass-through |

# ISSUE-B8B516AF: Shift Dashboard Win/Loss Shows $0 After Inventory Count

**Date:** 2026-02-19
**Status:** Open
**Severity:** High
**Category:** Bug
**Bounded Context:** TableContextService
**Related PRD:** PRD-007 (TableContext Service)
**Related ADRs:** ADR-027 (Table Bank Mode), ADR-024 (Context Derivation)
**Parent Gap Doc:** `GAP-TABLE-INVENTORY-LIFECYCLE.md`

---

## Trigger

New casino enrolled, BJ-01 table active, inventory count performed mid-shift. Shift dashboard win/loss displays "$0" instead of expected $1,000.

## Investigation

Three-agent parallel investigation (RLS, Backend Service, Architecture) on 2026-02-19. This issue was discovered alongside — but is distinct from — the dual telemetry bridge trigger bug (100x inflation, fixed in migration `20260218233652`). After that fix was applied, buy-in telemetry amounts are correct, but win/loss remains $0.

---

## Root Cause: Opening Snapshot Timing Gate

`rpc_shift_table_metrics` (authoritative version in `20260219002247_enable_adjustment_telemetry.sql`, lines 401-423) computes win/loss as:

```
win_loss = (closing_bankroll - opening_bankroll) + fills - credits [+ estimated_drop]
```

Both win/loss fields are gated by:

```sql
CASE
  WHEN os.snapshot_id IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN
    (cs.bankroll_total_cents - os.bankroll_total_cents) + fills - credits
  ELSE NULL
END
```

The opening snapshot CTE requires a snapshot **before** `window_start`:

```sql
-- Opening snapshot: latest snapshot created_at <= window_start
opening_snapshots AS (
  SELECT DISTINCT ON (tis.table_id)
    tis.table_id, tis.id AS snapshot_id,
    tis.created_at AS snapshot_at,
    chipset_total_cents(tis.chipset) AS bankroll_total_cents
  FROM public.table_inventory_snapshot tis
  WHERE tis.casino_id = v_context_casino_id
    AND tis.created_at <= p_window_start    -- must exist BEFORE shift starts
  ORDER BY tis.table_id, tis.created_at DESC
),
```

For a newly enrolled casino performing their first-ever inventory count mid-shift:

- No snapshot exists before `window_start` (casino was just created)
- `opening_snapshots` CTE returns zero rows for BJ-01
- `missing_opening_snapshot = TRUE`
- `win_loss_inventory_cents = NULL`, `win_loss_estimated_cents = NULL`

Even if the operator counts chips during the shift, that only satisfies the **closing** snapshot. There is no **opening** snapshot before the shift window began.

---

## Secondary Issue: NULL Renders as "$0"

The UI cannot distinguish "no data" (NULL) from "computed zero" (breakeven):

| Layer | File | Behavior |
|-------|------|----------|
| RPC | `migrations/20260219002247_enable_adjustment_telemetry.sql:517-532` | Returns SQL NULL when snapshots missing |
| Service mapper | `services/table-context/shift-metrics/service.ts:402-409` | Preserves SQL NULL as TypeScript `null` (correct) |
| Casino aggregation | Same file, lines 359-366 | `null ?? 0` in reduce — coalesces to 0 (lossy) |
| Format function | `lib/format.ts:45-48` | `formatCents(null)` returns `"$0"` |
| Hero display | `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx:34` | `winLossCents ?? 0` → "$0" |
| Metrics table | `components/shift-dashboard-v3/center/metrics-table.tsx:93` | `formatCents(table.win_loss_estimated_cents)` — null → "$0" |

Provenance metadata (`null_reasons: ['missing_opening', 'missing_closing']`) is computed correctly in `services/table-context/shift-metrics/provenance.ts` but is not surfaced in the UI.

---

## Additional Gaps Found (Same Investigation)

| # | Gap | Description | Affects Shift Dashboard? |
|---|-----|-------------|------------------------|
| 1 | `total_cents` never populated | `rpc_log_table_inventory_snapshot` INSERT omits `total_cents` column. No trigger computes it. Column added in `20260117153430_adr027_table_bank_mode_schema.sql` but RPC never updated. | No — shift RPC uses `chipset_total_cents(tis.chipset)` directly |
| 2 | `rpc_compute_table_rundown` buggy JSON fallback | Expects `{"1": {"count": 10}}` but actual chipset format is `{"1": 10}`. Falls back when `total_cents` is NULL (always). File: `20260117153727_adr027_rpc_rundown.sql:116-124`. | No — session-level rundown only |
| 3 | `session_id` never linked to snapshots | `rpc_log_table_inventory_snapshot` does not accept/set `session_id`. Rundown RPC lookup by `session_id` returns zero rows. | No — shift RPC uses time-window approach |
| 4 | Legacy chip custody RPCs violate ADR-024 | `rpc_log_table_inventory_snapshot`, `rpc_request_table_fill`, `rpc_request_table_credit`, `rpc_log_table_drop` accept spoofable `p_casino_id`, no `set_rls_context_from_staff()`, SECURITY DEFINER with no auth. File: `20251108195341_table_context_chip_custody.sql:139-278`. | No — security gap, not data gap |

---

## Fix Options

### Option A — Synthesize opening snapshot from par (recommended for MVP)

When `rpc_open_table_session` runs, auto-create a `table_inventory_snapshot` row with `snapshot_type = 'open'` using the table's `par_total_cents` as the opening bankroll. This is the "imprest-to-par" assumption: the table starts at its target.

**Rationale:** Matches the existing pattern where `need_total_cents` is already snapshotted from `gaming_table.par_total_cents` during session open. The par value is set during onboarding (Step 4 of setup wizard).

**Trade-off:** Assumes opening bankroll equals par. For INVENTORY_COUNT mode casinos, the actual bankroll may differ. However, it provides a reasonable baseline for the first shift.

### Option B — Relax the window constraint

If no pre-window snapshot exists, use the earliest snapshot within the window as the opening. Change the CTE to fall back:

```sql
opening_snapshots AS (
  SELECT DISTINCT ON (tis.table_id)
    ...
  WHERE tis.casino_id = v_context_casino_id
    AND tis.created_at <= p_window_start
  ORDER BY tis.table_id, tis.created_at DESC

  UNION ALL

  -- Fallback: earliest snapshot in the window if no pre-window snapshot
  SELECT DISTINCT ON (tis.table_id)
    ...
  WHERE tis.casino_id = v_context_casino_id
    AND tis.created_at > p_window_start
    AND tis.created_at <= p_window_end
  ORDER BY tis.table_id, tis.created_at ASC
),
```

**Trade-off:** The "opening" bankroll would be from mid-shift, not shift start. Win/loss calculation would only cover the partial window.

### Option C — UX differentiation (minimum fix)

Update `formatCents(null)` to return `"--"` or `"N/A"` instead of `"$0"`. Show "Opening count required" as an actionable CTA in the shift dashboard.

**Trade-off:** Does not fix the underlying data gap — just makes it visible. Operator must still perform a pre-shift opening count for win/loss to work.

---

## Relationship to GAP-TABLE-INVENTORY-LIFECYCLE

- **Phase 0 (Pre-shift Setup):** Par IS persisted during onboarding (`gaming_table.par_total_cents`). Option A leverages this.
- **Phase 1 (Open Table):** The chip count dialog works. The gap is the timing constraint in the shift metrics RPC — mid-shift counts are invisible to win/loss.
- **Phase 6 (Compute Rundown):** The `rpc_compute_table_rundown` JSON fallback bug (Gap #2 above) should be fixed alongside any rundown persistence work.

---

## Affected Files

| Category | File |
|----------|------|
| RPC (shift metrics) | `supabase/migrations/20260219002247_enable_adjustment_telemetry.sql` |
| RPC (shift metrics, original) | `supabase/migrations/20260114004336_rpc_shift_table_metrics.sql` |
| RPC (inventory snapshot) | `supabase/migrations/20251108195341_table_context_chip_custody.sql` |
| RPC (rundown) | `supabase/migrations/20260117153727_adr027_rpc_rundown.sql` |
| RPC (session open) | `supabase/migrations/20260117153726_adr027_rpc_session_mode_binding.sql` |
| Schema (par column) | `supabase/migrations/20260117153430_adr027_table_bank_mode_schema.sql` |
| Service layer | `services/table-context/shift-metrics/service.ts` |
| Provenance | `services/table-context/shift-metrics/provenance.ts` |
| Format util | `lib/format.ts` |
| UI (metrics table) | `components/shift-dashboard-v3/center/metrics-table.tsx` |
| UI (hero win/loss) | `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` |
| UI (chip count) | `components/table/chip-count-capture-dialog.tsx` |
| Onboarding (par) | `app/(onboarding)/setup/_actions.ts` |

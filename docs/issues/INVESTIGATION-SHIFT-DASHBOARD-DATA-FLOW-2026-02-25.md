---
title: "Investigation: Shift Dashboard Shows N/A and 0 After Need/Par Setup + Inventory Count"
doc_id: "INV-SHIFT-DASH-DATAFLOW-2026-02-25"
severity: P0
status: findings-complete
date: 2026-02-25
scope: table-context/shift-metrics end-to-end data flow
related:
  - "ISSUE-B8B516AF (original $0 win/loss issue)"
  - "PRD-036 (opening baseline cascade)"
  - "20260219235613_sec_h1_h2_h3_shift_metrics_service_role_gate.sql"
  - "20260219164631_prd036_shift_metrics_opening_baseline.sql"
---

# Shift Dashboard Data Flow Investigation

## Symptom

After setting up need/par targets and running the first inventory count, the shift dashboard shows **"N/A"** for win/loss and **"0" across the board** for all operational metrics (opening bankroll, fills, credits, estimated drop).

## Root Cause (P0): Security Remediation Destroyed PRD-036 Opening Baseline Cascade

The security remediation migration **`20260219235613`** completely reverted the PRD-036 opening baseline logic. It drops and recreates `rpc_shift_table_metrics` with pre-PRD-036 logic that has:

- **No par target fallback** (Source C)
- **No in-window fallback** (Source D)
- **No provenance columns** (`opening_source`, `opening_bankroll_cents`, `opening_at`, `coverage_type`)
- **Wrong sign convention** (`+ fills - credits` instead of `- fills + credits`)

### Migration Overwrite Chain

| Timestamp | Migration | Effect |
|-----------|-----------|--------|
| `20260114004336` | `rpc_shift_table_metrics.sql` | Original: simple pre-window snapshot only |
| **`20260219164631`** | **`prd036_shift_metrics_opening_baseline.sql`** | **PRD-036: ranked cascade + provenance + correct sign convention** |
| **`20260219235613`** | **`sec_h1_h2_h3_shift_metrics_service_role_gate.sql`** | **Drops PRD-036, recreates with pre-PRD-036 logic + service_role gate** |

The security migration (line 40) executes `DROP FUNCTION IF EXISTS public.rpc_shift_table_metrics(timestamptz, timestamptz, uuid)` then recreates without the cascade.

---

## Finding Details

### F1: Opening Baseline Cascade Destroyed (P0)

**What PRD-036 had** (`20260219164631`, lines 142-204):
```sql
COALESCE(
  pre.bankroll_total_cents,        -- Source A/B: prior snapshot
  t.tbl_par_total_cents::bigint,   -- Source C: par target
  inw.bankroll_total_cents          -- Source D: earliest in-window
) AS opening_bankroll_cents,
```

**What exists now** (`20260219235613`, lines 160-170):
```sql
opening_snapshots AS (
  SELECT DISTINCT ON (tis.table_id)
    tis.table_id, tis.id AS snapshot_id,
    tis.created_at AS snapshot_at,
    chipset_total_cents(tis.chipset) AS bankroll_total_cents
  FROM public.table_inventory_snapshot tis
  WHERE tis.casino_id = v_context_casino_id
    AND tis.created_at <= p_window_start   -- pre-window ONLY
  ORDER BY tis.table_id, tis.created_at DESC
),
```

For a newly set-up casino with no prior counts, this returns NULL for every table.

### F2: `gaming_table.par_total_cents` Exists But Is Never Read (P0)

**Write path works**: `updateTableParAction` correctly writes `par_total_cents` to `gaming_table`.

**Read path broken**: The current RPC's `tables` CTE does NOT select `par_total_cents`:
```sql
tables AS (
  SELECT gt.id AS tbl_id, gt.label AS tbl_label, gt.pit AS tbl_pit
  FROM public.gaming_table gt                     -- NO par_total_cents!
  WHERE gt.casino_id = v_context_casino_id AND gt.status = 'active'
),
```

The PRD-036 version selected `gt.par_total_cents AS tbl_par_total_cents`.

### F3: Provenance Columns Missing From RPC Return (P1)

The current RPC returns 22 columns. PRD-036 returned 26 (adding `opening_source`, `opening_bankroll_cents`, `opening_at`, `coverage_type`).

The TypeScript mapper (`service.ts:374-383`) still reads these fields but gets `undefined` -> `null`:
```typescript
opening_source: (r.opening_source as OpeningSource) ?? null,       // always null
opening_bankroll_cents: r.opening_bankroll_cents != null ? ... : null, // always null
opening_at: (r.opening_at as string) ?? null,                     // always null
coverage_type: (r.coverage_type as CoverageType) ?? null,         // always null
```

### F4: Sign Convention Regression (P1)

**PRD-036 (correct casino accounting)**:
```sql
(closing - opening) - fills + credits
```

**Current (reverted, incorrect)**:
```sql
(closing - opening) + fills - credits
```

Even when snapshots exist, win/loss has the wrong sign.

### F5: NULL Propagation Chain to "N/A" (P0)

1. RPC: `opening_snapshots` finds nothing pre-window -> `os.snapshot_id IS NULL`
2. RPC: Win/loss `CASE WHEN os.snapshot_id IS NOT NULL AND cs.snapshot_id IS NOT NULL THEN ... ELSE NULL END` -> NULL
3. Mapper: Preserves null for win/loss fields
4. `nullAwareSum`: All tables null -> casino total null
5. `HeroWinLossCompact`: `winLossCents == null` -> renders "N/A"

### F6: NULL-to-0 Coercion for Opening Bankroll (P2)

Mapper (`service.ts:347`):
```typescript
opening_bankroll_total_cents: Number(r.opening_bankroll_total_cents ?? 0),
```

NULL from RPC becomes `0`, displayed as "$0" in the metrics table. This is misleading — it suggests the opening bankroll was counted at $0 rather than "no data."

### F7: Stale Time Window on Dashboard (P2)

`ShiftDashboardV3` (`shift-dashboard-v3.tsx:66-73`) sets `window_end` once at component mount. If the user:
1. Loads dashboard (window captured at 10:00 AM)
2. Records inventory count at 10:15 AM
3. Returns to dashboard

The count at 10:15 has `created_at > window_end`, so it's invisible. The 30s `refetchInterval` re-fetches with the SAME stale window. Only clicking "Refresh" on the TimeWindowSelector fixes this.

### F8: Missing Cache Invalidation After Inventory Count (P2)

`useLogInventorySnapshot` (`use-inventory-snapshots.ts:91-95`) only invalidates `tableContextKeys.inventoryHistory`. It does NOT invalidate `shiftDashboardKeys`, so the dashboard data is stale for up to 30 seconds.

### F9: Unpassed Provenance Props in Orchestrator (P2)

`ShiftDashboardV3` (`shift-dashboard-v3.tsx:179-183`) never passes `tablesMissingBaselineCount` or `tablesCount` to `HeroWinLossCompact`, so the "X of Y tables missing baseline" warning never appears.

### F10: Zero Values for Fills/Credits/Drop Are Correct (Informational)

For a fresh setup with no fills, credits, or telemetry, `$0` is the correct value. The telemetry pipeline (buy-in bridge) is not yet implemented, so estimated drop will always be 0.

---

## Vision Doc vs Implementation Reality

| Concept | Vision Doc | Reality | Gap? |
|---------|-----------|---------|------|
| `gaming_table.par_total_cents` | Exists | Exists, written correctly | No |
| `table_par_policy` (append-only history) | need-par-dual-policy.md | Does NOT exist | Yes — par is a mutable column |
| `table_inventory_snapshot` | Exists | Exists, `chipset` JSONB works | No |
| `table_inventory_session` (10-state machine) | table-inventory-rundown-lifecycle.md | Does NOT exist; `table_session` has 4 states | Yes — simplified |
| Opening baseline cascade (A/B/C/D/E) | POLICY-SHIFT-WINLOSS-OPENING-BASELINE.md | **Destroyed by sec remediation** | **Critical** |
| Provenance fields on RPC output | Same doc | **Missing from current RPC** | **Critical** |
| `table_buyin_telemetry` | GAP_ANALYSIS doc | Table exists; no ingestion pipeline | Yes — telemetry always 0 |
| `soft_count_table_result` | GAP_ANALYSIS doc | Does NOT exist | Yes — deferred |
| `reconciliation_exception` | GAP_ANALYSIS doc | Does NOT exist | Yes — deferred |

---

## Fix Strategy

### WS1 — RPC Restoration (P0, blocking)

Create a new migration that merges the security remediation (service_role gate) WITH the PRD-036 cascade logic:

1. DROP both current overloads (2-param and 3-param)
2. Recreate 3-param with:
   - `tables` CTE reads `par_total_cents`, `par_updated_at` from `gaming_table`
   - `opening_baseline` CTE with LATERAL join cascade (prior snapshot -> par -> in-window -> none)
   - Return provenance columns: `opening_source`, `opening_bankroll_cents`, `opening_at`, `coverage_type`
   - Correct sign convention: `(closing - opening) - fills + credits`
   - Service_role gate from `20260219235613`
3. Recreate 2-param wrapper delegating to 3-param
4. Regenerate types: `npm run db:types-local`

### WS2 — Service Layer Alignment (P1, follows WS1)

- Verify mapper reads new provenance columns correctly (should already work if columns come back)
- Fix NULL-to-0 coercion on `opening_bankroll_total_cents` (use null preservation)

### WS3 — UI Wiring (P2)

- Pass `tablesMissingBaselineCount` and `tablesCount` to `HeroWinLossCompact`
- Add shift dashboard cache invalidation to `useLogInventorySnapshot.onSuccess`
- Consider advancing `window_end` on refetch cycles

### WS4 — Tests

- Regression tests for the cascade: snapshot, par-only, in-window, none
- Provenance column verification
- Sign convention verification

---

## Files Involved

| File | Lines | Issue |
|------|-------|-------|
| `supabase/migrations/20260219235613_sec_h1_h2_h3_shift_metrics_service_role_gate.sql` | 40-307 | **Active RPC without cascade/provenance** |
| `supabase/migrations/20260219164631_prd036_shift_metrics_opening_baseline.sql` | 121-352 | **Dead code (dropped by later migration)** |
| `services/table-context/shift-metrics/service.ts` | 347, 374-383 | NULL coercion + silent undefined reads |
| `components/shift-dashboard-v3/shift-dashboard-v3.tsx` | 66-73, 179-183 | Stale window + unpassed props |
| `hooks/table-context/use-inventory-snapshots.ts` | 91-95 | Missing cache invalidation |
| `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` | 51, 66 | N/A rendering + misleading CTA |
| `types/database.types.ts` | (generated) | Matches 22-col security version |

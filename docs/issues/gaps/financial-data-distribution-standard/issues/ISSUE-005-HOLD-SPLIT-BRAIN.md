
---

## Hold % Posture Report

### The gap: two separate computation pipelines, only one surfaces it

Hold percent lives in **two completely decoupled paths**:

**Path 1 — Shift Intelligence (where it IS computed)**
- `rpc_compute_rolling_baseline()` — batch/on-demand, computes historical hold % baselines with `(win_loss_inventory_cents / estimated_drop_buyins_cents) * 100`
- `rpc_get_anomaly_alerts()` — re-derives the live value to compare against baseline median+MAD
- Result: hold % appears only as an **alert trigger** — the `AnomalyAlertCard` renders it when an anomaly fires, and the admin alerts page lists it

**Path 2 — Live Shift Metrics (where it is ABSENT)**
- `rpc_shift_table_metrics` — returns `win_loss_inventory_cents` and `estimated_drop_buyins_cents` but never divides them
- `rpc_shift_pit_metrics` / `rpc_shift_casino_metrics` — same, rollups carry the raw totals only
- `ShiftTableMetricsDTO` / `ShiftPitMetricsDTO` / `ShiftCasinoMetricsDTO` — no `hold_percent` field in any of these
- `SecondaryKpiStack` — displays Fills, Credits, Est. Drop; Hold % is absent
- `MetricsTable` — columns are Win/Loss, Fills, Credits, Telemetry Quality, Grade; no Hold %
- `RundownReportCard` / `RundownSummaryPanel` — Win/Loss, Fills, Credits, Drop; no Hold %

### Why it's absent

The `rpc_shift_table_metrics` SQL (migration `20260114004336`) was written before the shift-intelligence baseline system existed. It returns both inputs (`win_loss_inventory_cents:bigint`, `estimated_drop_buyins_cents:bigint`) but no derived ratio. The TypeScript mapper `toShiftTableMetrics` faithfully maps those columns and never derives a ratio.

The shift-intelligence RPCs (migration `20260323165908`) were added later, and they compute hold % independently for the purpose of anomaly detection — not for display.

### The formula is safe and available

The inputs are already in every live metrics DTO. The derivation is one division — same as in SQL: `win_loss_inventory_cents / estimated_drop_buyins_cents * 100`, with a null guard for zero-drop (FR-16). The DEF-NEVER invariant (confirmed by tests) says hold % must remain a **bare `number | null`**, never a `FinancialValue` envelope.

### Two viable fix paths

|                 | Option A — Client-side derivation                            | Option B — RPC column                                 |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| **Where**       | `toShiftTableMetrics` mapper + rollup aggregations           | New migration amending the three shift metrics RPCs   |
| **Migration**   | None                                                         | Required                                              |
| **DTO changes** | Add `hold_percent: number \| null` to all three metric DTOs  | Same, but driven from RPC result                      |
| **Rollup**      | `pit/casino = total_win_loss / total_drop * 100`, null-aware | Same, inside SQL                                      |
| **Risk**        | None — formula is trivial, inputs are already present        | Low migration risk; RPCs follow established pattern   |
| **Preferred**   | Yes — no schema coupling, faster to ship                     | Better long-term if hold % enters baseline comparison |

**Recommendation**: Option A first — add `hold_percent: number | null` as a derived field in the TypeScript mapper for all three DTO levels, then surface it in `SecondaryKpiStack` (as a 4th compact KPI card) and as a column in `MetricsTable`. No migration, no RPC changes, the formula is already battle-tested in two other places in the same codebase.

If you want to proceed, the work is entirely self-contained: `services/table-context/shift-metrics/dtos.ts` (add field), `services/table-context/shift-metrics/service.ts` (derive in mapper + rollup), `components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx` (add KPI), and `components/shift-dashboard-v3/center/metrics-table.tsx` (add column).
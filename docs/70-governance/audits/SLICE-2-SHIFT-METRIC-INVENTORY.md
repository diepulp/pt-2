# Shift Dashboard V3 — Metric Inventory

**Surface:** Shift Dashboard V3 (`components/shift-dashboard-v3/`)
**Slice:** Hardening Slice 2
**Date:** 2026-03-09
**Auditor:** Lead Architect (WS1 of PRD-047 / EXEC-047)
**Commit:** `324de01e33c2e805dd16fc2cd7d96cd35cfec5c7`
**Branch:** `hardening-slice-2`

---

## 1. Audit Scope

Every truth-bearing value rendered by `ShiftDashboardV3` (`components/shift-dashboard-v3/shift-dashboard-v3.tsx`) was traced from UI component through the full derivation chain:

**Component → Hook → HTTP Fetcher → API Route → Service Function → RPC → Database Table(s)**

Three independent data queries power the dashboard:

| Query | Hook | API Route | Service |
|-------|------|-----------|---------|
| **Shift Metrics Summary** | `useShiftDashboardSummary` | `GET /api/v1/shift-dashboards/summary` | `getShiftDashboardSummary()` |
| **Cash Observations Summary** | `useCashObsSummary` | `GET /api/v1/shift-dashboards/cash-observations/summary` | `getShiftCashObsSummary()` |
| **Active Visitors Summary** | `useActiveVisitorsSummary` | `GET /api/v1/shift-dashboards/visitors-summary` | `rpc_shift_active_visitors_summary` (inline in route) |

---

## 2. Metric Inventory

### 2.1 MEAS-005: Shift Win/Loss (Estimated)

| Field | Value |
|-------|-------|
| **Value Name** | Win/Loss (estimated, casino-level) |
| **Component** | `left-rail/hero-win-loss-compact.tsx` — `HeroWinLossCompact` |
| **Props Consumed** | `winLossCents` ← `summary.casino.win_loss_estimated_total_cents` |
| **Hook** | `useShiftDashboardSummary` (`hooks/shift-dashboard/use-shift-dashboard-summary.ts`) |
| **HTTP Fetcher** | `fetchShiftDashboardSummary()` → `GET /api/v1/shift-dashboards/summary` |
| **API Route** | `app/api/v1/shift-dashboards/summary/route.ts` |
| **Service Function** | `getShiftDashboardSummary()` → `getShiftTableMetrics()` → client-side `aggregateCasinoMetrics()` |
| **RPC** | `rpc_shift_table_metrics` (SECURITY INVOKER) |
| **Database Tables** | `gaming_table`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event`, `table_buyin_telemetry` |
| **Formula** | Per table: `win_loss_estimated = win_loss_inventory + estimated_drop_buyins`. Casino: null-aware SUM across tables. |
| **Preliminary Truth Class** | Derived Operational |
| **Freshness** | Request-time (staleTime: 30s, refetchInterval: 30s) |
| **Preliminary MEAS-ID** | MEAS-005 |

**Also displayed at pit/table level in:**
- `center/metrics-table.tsx` → `TableRow` renders per-table `win_loss_estimated_cents`
- `charts/win-loss-trend-chart.tsx` → `WinLossTrendChart` renders per-pit `win_loss_estimated_total_cents`
- `center/pit-table.tsx` → `PitTable` renders per-pit `win_loss_estimated_total_cents`

**Notes:** The hero card displays the casino-level estimated win/loss. The same data appears at different aggregation levels (pit, table) through the same derivation path. The `metric_grade` badge (`MetricGradeBadge`) is a trust indicator for this value, not a separate truth-bearing metric (see MEAS-009).

---

### 2.2 MEAS-006: Shift Win/Loss (Inventory)

| Field | Value |
|-------|-------|
| **Value Name** | Win/Loss (inventory method, per-table) |
| **Component** | `center/metrics-table.tsx` — table view (not displayed as hero; table-level only) |
| **Props Consumed** | `win_loss_inventory_cents` from `ShiftTableMetricsDTO` |
| **Hook** | `useShiftDashboardSummary` |
| **HTTP Fetcher** | `fetchShiftDashboardSummary()` → `GET /api/v1/shift-dashboards/summary` |
| **API Route** | `app/api/v1/shift-dashboards/summary/route.ts` |
| **Service Function** | `getShiftDashboardSummary()` → `getShiftTableMetrics()` |
| **RPC** | `rpc_shift_table_metrics` (SECURITY INVOKER) |
| **Database Tables** | `gaming_table`, `table_inventory_snapshot`, `table_fill`, `table_credit` |
| **Formula** | `win_loss_inventory = (closing_bankroll - opening_bankroll) + fills - credits` (null if missing snapshots) |
| **Preliminary Truth Class** | Derived Operational |
| **Freshness** | Request-time (staleTime: 30s) |
| **Preliminary MEAS-ID** | MEAS-006 |

**Separate row rationale:** Different source inputs than MEAS-005 (no telemetry/drop component). Different null semantics (null when snapshots are missing, while estimated can still compute from telemetry). Different grade semantics (inventory is the authoritative path when available; estimated is the fallback).

**Aggregation:** `win_loss_inventory_total_cents` is available at pit and casino level via `nullAwareSum()` in `aggregatePitMetrics()` / `aggregateCasinoMetrics()`. Rendered in `pit-table.tsx` and accessible in `metrics-table.tsx` casino view.

---

### 2.3 MEAS-007: Shift Estimated Drop

| Field | Value |
|-------|-------|
| **Value Name** | Estimated Drop (buyins total = rated + grind) |
| **Component** | `left-rail/secondary-kpi-stack.tsx` — `CompactKpi` ("Est. Drop") |
| **Props Consumed** | `estimated_drop_buyins_total_cents` from `ShiftCasinoMetricsDTO` |
| **Hook** | `useShiftDashboardSummary` |
| **HTTP Fetcher** | `fetchShiftDashboardSummary()` → `GET /api/v1/shift-dashboards/summary` |
| **API Route** | `app/api/v1/shift-dashboards/summary/route.ts` |
| **Service Function** | `getShiftDashboardSummary()` → `getShiftTableMetrics()` → `aggregateCasinoMetrics()` |
| **RPC** | `rpc_shift_table_metrics` (SECURITY INVOKER) |
| **Database Tables** | `table_buyin_telemetry` (aggregated by `telemetry_agg` CTE in RPC) |
| **Formula** | Casino: SUM of per-table `estimated_drop_buyins_cents`. Per-table: `rated_cents + grind_cents` from `table_buyin_telemetry` |
| **Preliminary Truth Class** | Derived Operational |
| **Freshness** | Request-time (staleTime: 30s) |
| **Preliminary MEAS-ID** | MEAS-007 |

**Sub-values:** The component displays only the total (`buyins_total_cents`). The rated/grind breakdown (`estimated_drop_rated_total_cents`, `estimated_drop_grind_total_cents`) is available in the DTO but not separately rendered in the left-rail. These are included within the same MEAS row because they share identical source, freshness, and derivation — differing only by a telemetry_kind filter.

**Note:** The "Est. Drop" card always shows `metricGrade="ESTIMATE"` (hardcoded in component), consistent with its telemetry-only source.

---

### 2.4 MEAS-008: Shift Fills & Credits

| Field | Value |
|-------|-------|
| **Value Name** | Fills Total, Credits Total |
| **Component** | `left-rail/secondary-kpi-stack.tsx` — two `CompactKpi` cards ("Fills", "Credits") |
| **Props Consumed** | `fills_total_cents`, `credits_total_cents` from `ShiftCasinoMetricsDTO` |
| **Hook** | `useShiftDashboardSummary` |
| **HTTP Fetcher** | `fetchShiftDashboardSummary()` → `GET /api/v1/shift-dashboards/summary` |
| **API Route** | `app/api/v1/shift-dashboards/summary/route.ts` |
| **Service Function** | `getShiftDashboardSummary()` → `getShiftTableMetrics()` → `aggregateCasinoMetrics()` |
| **RPC** | `rpc_shift_table_metrics` (SECURITY INVOKER) |
| **Database Tables** | `table_fill` (fills), `table_credit` (credits) |
| **Formula** | Fills: `SUM(amount_cents)` from `table_fill` within window. Credits: `SUM(amount_cents)` from `table_credit` within window. |
| **Preliminary Truth Class** | Raw Record (aggregated) |
| **Freshness** | Request-time (staleTime: 30s) |
| **Preliminary MEAS-ID** | MEAS-008 |

**Grouped row rationale:** Fills and credits share identical provenance characteristics: same RPC (`rpc_shift_table_metrics`), same freshness, same computation layer (direct SUM aggregation), and same service function. They differ only in source table (`table_fill` vs `table_credit`).

**Also displayed at:** Per-table level in `center/metrics-table.tsx` (fills/credits columns). Per-pit level in `center/pit-table.tsx`. Per-pit level in `charts/win-loss-trend-chart.tsx` (optional fills/credits series toggle).

---

### 2.5 MEAS-009: Snapshot Coverage & Metric Grade

| Field | Value |
|-------|-------|
| **Value Name** | Snapshot coverage ratio, coverage tier, metric grade, quality tier counts |
| **Components** | `trust/coverage-bar.tsx` — `CoverageBar` (header bar), `left-rail/quality-summary-card.tsx` — `QualitySummaryCard`, `trust/metric-grade-badge.tsx` — `MetricGradeBadge`, `trust/telemetry-quality-indicator.tsx` — `TelemetryQualityIndicator`, `right-rail/quality-detail-card.tsx` — `QualityDetailCard` |
| **Props Consumed** | `snapshot_coverage_ratio`, `coverage_tier`, `tables_with_opening_snapshot`, `tables_with_closing_snapshot`, `tables_count`, `provenance.grade`, `provenance.quality` from `ShiftCasinoMetricsDTO`; per-table `telemetry_quality` from `ShiftTableMetricsDTO[]` |
| **Hook** | `useShiftDashboardSummary` |
| **HTTP Fetcher** | `fetchShiftDashboardSummary()` → `GET /api/v1/shift-dashboards/summary` |
| **API Route** | `app/api/v1/shift-dashboards/summary/route.ts` |
| **Service Function** | `getShiftDashboardSummary()` → `getShiftTableMetrics()` → `deriveTableProvenance()`, `rollupCasinoProvenance()`, `computeAggregatedCoverageRatio()`, `getCoverageTier()` |
| **RPC** | `rpc_shift_table_metrics` (SECURITY INVOKER) |
| **Database Tables** | `table_inventory_snapshot` (snapshot presence check), `table_buyin_telemetry` (telemetry quality) |
| **Formula** | Coverage ratio: `min(withOpening, withClosing) / totalTables`. Tier: HIGH ≥80%, MEDIUM ≥50%, LOW >0%, NONE =0%. Grade: worst-of across tables (ESTIMATE if any table is ESTIMATE). Quality counts: component-side `computeQualityCounts()` counting GOOD/LOW/NONE telemetry quality per table. |
| **Preliminary Truth Class** | Derived Operational |
| **Freshness** | Request-time (staleTime: 30s) |
| **Preliminary MEAS-ID** | MEAS-009 |

**Grouped row rationale:** Coverage ratio, coverage tier, metric grade, quality tier, and quality counts are all derived from the same source data (snapshot presence flags + telemetry quality) through the same provenance derivation functions (`provenance.ts`, `snapshot-rules.ts`). They represent different facets of the same trust assessment. Coverage and grade are tightly coupled — grade is the worst-of rollup of underlying table coverage.

**Key derivation functions:** `deriveTableProvenance()`, `rollupPitProvenance()`, `rollupCasinoProvenance()` in `services/table-context/shift-metrics/provenance.ts`. `computeAggregatedCoverageRatio()`, `getCoverageTier()` in `services/table-context/shift-metrics/snapshot-rules.ts`. `computeQualityCounts()` in `shift-dashboard-v3.tsx` (UI-side counting — displays but does not recompute trust).

---

### 2.6 MEAS-010: Cash Observation Rollups

| Field | Value |
|-------|-------|
| **Value Name** | Cash-out observed estimate total, confirmed total, observation count (at casino/pit/table levels) |
| **Components** | `right-rail/telemetry-rail-panel.tsx` — `TelemetryRailPanel` |
| **Props Consumed** | `casinoData` (`CashObsCasinoRollupDTO`), `pitsData` (`CashObsPitRollupDTO[]`), `tablesData` (`CashObsTableRollupDTO[]`) |
| **Hook** | `useCashObsSummary` (`hooks/shift-dashboard/use-cash-obs-summary.ts`) |
| **HTTP Fetcher** | `fetchCashObsSummary()` → `GET /api/v1/shift-dashboards/cash-observations/summary` |
| **API Route** | `app/api/v1/shift-dashboards/cash-observations/summary/route.ts` |
| **Service Function** | `getShiftCashObsSummary()` — parallel calls to `getShiftCashObsCasino()`, `getShiftCashObsPit()`, `getShiftCashObsTable()`, `getShiftCashObsAlerts()` |
| **RPCs** | `rpc_shift_cash_obs_casino`, `rpc_shift_cash_obs_pit`, `rpc_shift_cash_obs_table` (all SECURITY INVOKER) |
| **Database Tables** | `pit_cash_observation` (via join: `pit_cash_observation → rating_slip → gaming_table`) |
| **Formula** | `SUM(amount) WHERE direction='out' AND amount_kind='estimate'` (estimated), `SUM(amount) WHERE direction='out' AND amount_kind='cage_confirmed'` (confirmed), `COUNT(*) WHERE direction='out'` (count) |
| **Preliminary Truth Class** | Derived Operational (telemetry-only: observational, not authoritative) |
| **Freshness** | Request-time (staleTime: 30s, refetchInterval: 30s) |
| **Preliminary MEAS-ID** | MEAS-010 |

**Telemetry classification:** All cash observation values are explicitly labeled `TELEMETRY-ONLY` in codebase comments, component UI (amber `TELEMETRY` badge), and service docstrings. They are observational estimates, not authoritative custody metrics. Truth class may warrant a specific telemetry sub-classification — see §4 governance note.

**Rendered values:** Casino totals (estimated + confirmed amounts, observation count). Pit-level breakdown (estimated amount per pit). Top 5 tables by observation count.

---

### 2.7 MEAS-011: Cash Observation Spike Alerts

| Field | Value |
|-------|-------|
| **Value Name** | Spike alerts (severity, entity, observed value, threshold, downgrade tracking) |
| **Components** | `center/alerts-strip.tsx` — `AlertsStrip` |
| **Props Consumed** | `cashObs?.alerts` (`CashObsSpikeAlertDTO[]`) |
| **Hook** | `useCashObsSummary` (`hooks/shift-dashboard/use-cash-obs-summary.ts`) |
| **HTTP Fetcher** | `fetchCashObsSummary()` → `GET /api/v1/shift-dashboards/cash-observations/summary` |
| **API Route** | `app/api/v1/shift-dashboards/cash-observations/summary/route.ts` |
| **Service Function** | `getShiftCashObsSummary()` → `getShiftCashObsAlerts()` + severity guardrail enrichment via `computeAlertSeverity()`, `isAllowedAlertKind()`, `getWorstQuality()` |
| **RPC** | `rpc_shift_cash_obs_alerts` (SECURITY INVOKER) |
| **Database Tables** | `pit_cash_observation` (via join to `gaming_table`), `casino_settings` (alert thresholds) |
| **Formula** | Threshold comparison: `observed_value > threshold` triggers alert. Severity computed by RPC. Post-RPC enrichment: `computeAlertSeverity()` downgrades severity based on telemetry quality (no-false-critical invariant). |
| **Preliminary Truth Class** | Derived Operational (telemetry-only) |
| **Freshness** | Request-time (staleTime: 30s, refetchInterval: 60s for alerts hook — but served via cash obs summary at 30s) |
| **Preliminary MEAS-ID** | MEAS-011 |

**Separate row rationale from MEAS-010:** Different derivation path (threshold comparison + severity guardrail enrichment vs. direct rollup aggregation). Additional source table (`casino_settings` for thresholds). Severity guardrails (`computeAlertSeverity()` in `shift-cash-obs/severity.ts`) constitute a materially different transformation from simple SUM/COUNT.

---

### 2.8 MEAS-012: Active Visitors Summary

| Field | Value |
|-------|-------|
| **Value Name** | Rated count, unrated count, total count, rated percentage |
| **Components** | `charts/floor-activity-radar.tsx` — `FloorActivityRadar` |
| **Props Consumed** | `visitorsSummary?.rated_count`, `visitorsSummary?.unrated_count`, `visitorsSummary?.rated_percentage` |
| **Hook** | `useActiveVisitorsSummary` (`hooks/shift-dashboard/use-active-visitors-summary.ts`) |
| **HTTP Fetcher** | `fetchActiveVisitorsSummary()` → `GET /api/v1/shift-dashboards/visitors-summary` |
| **API Route** | `app/api/v1/shift-dashboards/visitors-summary/route.ts` |
| **Service Function** | Inline in route handler — direct `supabase.rpc('rpc_shift_active_visitors_summary')` call |
| **RPC** | `rpc_shift_active_visitors_summary` (SECURITY INVOKER) |
| **Database Tables** | `rating_slip`, `visit` (via join: `rating_slip.visit_id → visit.id`) |
| **Formula** | `rated_count = COUNT(*) WHERE visit_kind = 'gaming_identified_rated' AND status IN ('open', 'paused')`. `unrated_count = COUNT(*) WHERE visit_kind = 'gaming_ghost_unrated'`. `rated_percentage = rated / total * 100`. |
| **Preliminary Truth Class** | Derived Operational |
| **Freshness** | Request-time (staleTime: 30s, refetchInterval: 30s) |
| **Preliminary MEAS-ID** | MEAS-012 |

**Inclusion rationale:** Active Visitors is a truth-bearing governed fact, not contextual chrome. It counts active rating slips joined to visits — the count directly represents business activity (how many rated vs. unrated players are currently generating value). It has its own independent derivation chain (separate hook, separate API route, separate RPC, different source tables from shift metrics). The `rated_percentage` is displayed as a key insight callout ("XX% of floor generating value").

**Cross-context read:** Source table `visit` is owned by VisitService. The RPC joins `rating_slip` (TableContextService-owned) to `visit` (VisitService-owned). This is a cross-context read, not a cross-context write — acceptable per SRM cross-context consumption rules.

---

## 3. Hybrid Granularity Decisions

### Split decisions (separate MEAS rows):

| Split | Reason |
|-------|--------|
| MEAS-005 (Win/Loss Estimated) vs MEAS-006 (Win/Loss Inventory) | Different source inputs (inventory uses snapshots only; estimated adds telemetry-derived drop). Different null semantics (inventory is null when snapshots are missing). Different grade implications (inventory is the authoritative path). |
| MEAS-007 (Estimated Drop) vs MEAS-005 (Win/Loss Estimated) | Despite both using telemetry data, estimated drop is a standalone metric (sum of buy-in telemetry) while win/loss estimated is a derived computation that includes inventory components. Different formula and business meaning. |
| MEAS-010 (Cash Obs Rollups) vs MEAS-011 (Cash Obs Alerts) | Different derivation path: rollups are simple aggregation (SUM/COUNT), alerts involve threshold comparison + severity guardrail enrichment. Additional source table (`casino_settings`). Different transformation logic (`computeAlertSeverity()`). |
| MEAS-012 (Active Visitors) vs all others | Different source tables (`rating_slip`, `visit`), different RPC, different API route, different hook, different bounded context (VisitService cross-context read). |

### Group decisions (merged into single MEAS row):

| Group | Reason |
|-------|--------|
| MEAS-008: Fills + Credits | Same RPC, same freshness, same computation (direct SUM aggregation), same service path. Differ only in source table (`table_fill` vs `table_credit`). |
| MEAS-009: Coverage + Grade + Quality | All derived from same source data (snapshot presence + telemetry quality flags). Computed by the same provenance derivation functions. Coverage ratio determines grade which determines quality tier — they are facets of one trust assessment. |
| MEAS-010: Casino + Pit + Table cash obs | Same source table (`pit_cash_observation`), same formula (SUM/COUNT with direction/kind filter), same freshness, same RPCs (parallel execution). Differ only in grouping level. |

---

## 4. Discoveries vs. Preliminary Plan

| Preliminary ID | Final ID | Change | Reason |
|---------------|----------|--------|--------|
| MEAS-005 (Win/Loss Inventory) | MEAS-006 | **Renumbered** | The hero card displays estimated W/L, making that the primary metric. Inventory W/L is secondary. Swapped numbering to put the primary display metric first. |
| MEAS-006 (Win/Loss Estimated) | MEAS-005 | **Renumbered** | See above — estimated is the hero metric, gets the lower MEAS ID. |
| MEAS-011 (Active Visitors) | MEAS-012 | **Renumbered + Included** | Active Visitors is included as a governed fact (not chrome). Renumbered because MEAS-011 is assigned to Cash Obs Alerts, which was split from the preliminary MEAS-010. |
| (not in plan) | MEAS-011 | **New row** | Cash Observation Alerts split from MEAS-010 (Cash Obs Rollups) due to materially different derivation path (threshold comparison + severity guardrail enrichment vs. simple aggregation). |

**Final row count: 8 rows (MEAS-005 through MEAS-012)** — within the 12-row cap, no human review escalation required.

---

## 5. Governance Notes

### 5.1 Telemetry Truth Class

MEAS-010 (Cash Obs Rollups) and MEAS-011 (Cash Obs Alerts) are explicitly labeled `TELEMETRY-ONLY` throughout the codebase. The preliminary truth class assignment is "Derived Operational" but the existing codebase distinction between authoritative metrics and telemetry-only observations may warrant a sub-classification. This is a governance note for WS2 to resolve when populating the 12-column matrix — it does not block row creation.

### 5.2 Active Visitors Cross-Context Read

MEAS-012 involves a cross-context read: `rating_slip` (TableContextService) joined to `visit` (VisitService). The SRM should document this cross-context dependency in the Governance Cross-References update (WS5).

### 5.3 UI-Side computeQualityCounts()

The `computeQualityCounts()` function in `shift-dashboard-v3.tsx` counts GOOD/LOW/NONE telemetry quality tiers from table data. This is a display-only computation (counting pre-derived quality flags, not recomputing trust). It does not violate the "no ungoverned UI derivation" check — components display trust metadata, they do not recompute it.

### 5.4 Estimated Drop Sub-Values

The DTO contains `estimated_drop_rated_total_cents` and `estimated_drop_grind_total_cents` separately, but the UI only displays their sum (`estimated_drop_buyins_total_cents`). The sub-values are included within MEAS-007 since they share identical provenance — the only difference is a `telemetry_kind` filter in the SQL aggregation.

---

## 6. Source Table Verification

All source tables verified against actual RPC SQL:

| Table Name | Verified In | SRM Owner |
|------------|-------------|-----------|
| `gaming_table` | `rpc_shift_table_metrics` (tables CTE) | TableContextService |
| `table_inventory_snapshot` | `rpc_shift_table_metrics` (opening/closing CTEs) | TableContextService |
| `table_fill` | `rpc_shift_table_metrics` (fills_agg CTE) | TableContextService |
| `table_credit` | `rpc_shift_table_metrics` (credits_agg CTE) | TableContextService |
| `table_drop_event` | `rpc_shift_table_metrics` (drop_custody CTE) | TableContextService |
| `table_buyin_telemetry` | `rpc_shift_table_metrics` (telemetry_agg CTE) | TableContextService |
| `pit_cash_observation` | `rpc_shift_cash_obs_*` RPCs | TableContextService |
| `rating_slip` | `rpc_shift_cash_obs_*` (join path), `rpc_shift_active_visitors_summary` | TableContextService |
| `visit` | `rpc_shift_active_visitors_summary` (join) | VisitService |
| `casino_settings` | `rpc_shift_cash_obs_alerts` (threshold lookup) | CasinoService |

**Note:** The preliminary plan referenced `pit_cash_observation` as the source for estimated drop (MEAS-007). This was incorrect — estimated drop is sourced from `table_buyin_telemetry`, not `pit_cash_observation`. Cash observation rollups (MEAS-010) use `pit_cash_observation`. This discrepancy in the PRD/RFC is corrected in this inventory.

---

## 7. Summary

| MEAS-ID | Metric | Truth Class | Source Tables | Owner |
|---------|--------|-------------|---------------|-------|
| MEAS-005 | Shift Win/Loss (Estimated) | Derived Operational | `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_buyin_telemetry` | TableContextService |
| MEAS-006 | Shift Win/Loss (Inventory) | Derived Operational | `table_inventory_snapshot`, `table_fill`, `table_credit` | TableContextService |
| MEAS-007 | Shift Estimated Drop | Derived Operational | `table_buyin_telemetry` | TableContextService |
| MEAS-008 | Shift Fills & Credits | Raw Record (aggregated) | `table_fill`, `table_credit` | TableContextService |
| MEAS-009 | Snapshot Coverage & Metric Grade | Derived Operational | `table_inventory_snapshot`, `table_buyin_telemetry` | TableContextService |
| MEAS-010 | Cash Observation Rollups | Derived Operational (telemetry-only) | `pit_cash_observation`, `rating_slip`, `gaming_table` | TableContextService |
| MEAS-011 | Cash Observation Alerts | Derived Operational (telemetry-only) | `pit_cash_observation`, `rating_slip`, `gaming_table`, `casino_settings` | TableContextService |
| MEAS-012 | Active Visitors Summary | Derived Operational | `rating_slip`, `visit` | VisitService (cross-context read) |

**Total: 8 MEAS rows (MEAS-005 through MEAS-012)**

---

## References

| Document | Path |
|----------|------|
| PRD-047 | `docs/10-prd/PRD-047-shift-provenance-alignment-v0.md` |
| RFC-002 | `docs/02-design/RFC-002-shift-provenance-alignment.md` |
| EXEC-047 | `docs/21-exec-spec/EXEC-047-shift-provenance-alignment.md` |
| Shift Metrics Contract v1 | `docs/25-api-data/SHIFT_METRICS_CONTRACT_v1.md` |
| Shift Provenance Rollup Algo v1 | `docs/25-api-data/SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md` |
| Shift Snapshot Rules v1 | `docs/25-api-data/SHIFT_SNAPSHOT_RULES_v1.md` |
| SRM v4.18.0 | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| Metric Provenance Matrix | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |

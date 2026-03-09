# ADR-039 Metric Provenance Matrix

**Status:** Accepted
**Version:** 2.0.0
**Date:** 2026-03-09
**Owner:** Platform/Governance + Measurement Layer
**Implements:** ADR-041 D3 (Pragmatic Column Subset)

---

## 1. Purpose & Scope

This matrix declares the truth semantics for ADR-039's four measurement artifacts. It is the authoritative source for truth class, freshness, computation constraints, and reconciliation paths for each metric that surfaces display.

**Scope:** ADR-039 measurement artifacts (4 rows, MEAS-001–004) plus Slice 2 shift dashboard metrics (8 rows, MEAS-005–012). 12 total rows. Slices 3+ add their own rows through the expansion protocol (§5).

**What this matrix governs:**
- Truth class classification for each metric
- Freshness and invalidation constraints
- Source table provenance (SRM-registered)
- Reconciliation paths for verification
- Computation layer categories (not specific implementations)

**What this matrix does NOT govern:**
- Service shapes, RPC signatures, or API contracts (those are implementation decisions for EXEC-SPECs)
- Runtime enforcement or monitoring (document-time governance only)
- UI layout or component structure

**Provenance disclaimer:** Named sources referenced in the matrix rows (e.g., `measurement_audit_event_correlation_v`, `loyalty_liability_snapshot`) are descriptive links to already-ratified ADR-039 measurement artifacts. This document does not introduce new storage, view, or RPC commitments.

---

## 2. Column Definitions

12 pragmatic columns per ADR-041 D3. The remaining 10 columns from the Cross-Surface Provenance framework are deferred (see §5 Expansion Protocol).

| # | Column | Description | Example Values |
|---|--------|-------------|----------------|
| 1 | **Truth ID** | Stable identifier for the metric | `MEAS-001`, `MEAS-002` |
| 2 | **Truth Class** | Classification of truth semantics | Raw Record, Derived Operational, Compliance-Interpreted, Snapshot-Historical |
| 3 | **Metric Name** | Human-readable name | Theo Discrepancy, Rating Coverage |
| 4 | **Business Meaning** | What decision this value supports | Gap detection, compliance tracing |
| 5 | **Surface(s)** | Which UI surfaces consume this metric | `/admin/reports`, shift dashboard |
| 6 | **Formula / Rule** | Computation logic, units, filters, time windows | SQL expression, aggregation function |
| 7 | **Source Tables** | Authoritative tables/views/RPCs (SRM-registered) | `rating_slip`, `measurement_rating_coverage_v` |
| 8 | **Computation Layer** | Category of computation mechanism | SQL view, RPC, service mapper, materialized view, snapshot job |
| 9 | **Freshness Category** | How current the data must be | Live, Near-real-time, Request-time, Cached, Periodic, Snapshot |
| 10 | **Invalidation Trigger** | What state change requires refresh | Slip close, source table INSERT |
| 11 | **Reconciliation Path** | How the value is verified against source truth | Row-count parity, recalculation comparison |
| 12 | **Owner** | Service or domain responsible for correctness | TheoService, Measurement Layer, LoyaltyService |

### Truth Class Definitions

| Truth Class | Definition | Governance Implication |
|-------------|------------|----------------------|
| **Raw Record** | Direct database column value, no transformation | Source table is single source of truth; reconciliation is identity check |
| **Derived Operational** | Computed from raw records via deterministic formula | Formula must be reproducible; reconciliation compares materialized vs. recalculated |
| **Compliance-Interpreted** | Derived value with regulatory or compliance significance | May require additional governance columns in future (see §4); reconciliation must prove chain of custody |
| **Snapshot-Historical** | Point-in-time capture, not live | Freshness is periodic; reconciliation compares snapshot against live source at capture time |

### Freshness Category Definitions

| Category | Definition | Typical Use |
|----------|------------|-------------|
| **Live** | Reflects current database state at query time | Real-time displays |
| **Near-real-time** | Updated within seconds of source change | Event-driven refresh |
| **Request-time** | Computed fresh on each request via view or query | Operational dashboards |
| **Cached** | Computed and cached with explicit TTL | High-frequency reads |
| **Periodic** | Refreshed on a schedule (daily, hourly) | Snapshots, reports |
| **Snapshot** | Captured once, immutable after capture | Historical audits |

---

## 3. Matrix Table

### MEAS-001: Theo Discrepancy

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-001 |
| **Truth Class** | Derived Operational |
| **Metric Name** | Theo Discrepancy |
| **Business Meaning** | Surfaces gap between legacy-reported and PT-2 computed theo per rating slip. Enables operators to detect and investigate discrepancies in theoretical win calculations. |
| **Surface(s)** | `/admin/reports` |
| **Formula / Rule** | `ABS(computed_theo_cents - legacy_theo_cents) / NULLIF(legacy_theo_cents, 0)` |
| **Source Tables** | `rating_slip` (columns: `legacy_theo_cents`, `computed_theo_cents`) |
| **Computation Layer** | SQL query on indexed columns (implementation chooses layer) |
| **Freshness Category** | Request-time |
| **Invalidation Trigger** | Slip close (theo materialization on close is ratified — ADR-039 D3) |
| **Reconciliation Path** | Compare materialized theo against `theo.ts` recalculation from slip inputs |
| **Owner** | TheoService / RatingSlipService |

### MEAS-002: Audit Event Correlation

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-002 |
| **Truth Class** | Compliance-Interpreted |
| **Metric Name** | Audit Event Correlation |
| **Business Meaning** | End-to-end financial lineage: rating slip → player financial transaction → MTL entry → loyalty ledger. Enables compliance tracing of the complete financial chain for regulatory audit. |
| **Surface(s)** | `/admin/reports` |
| **Formula / Rule** | 4-table JOIN: `rating_slip → player_financial_transaction → mtl_entry → loyalty_ledger` |
| **Source Tables** | `measurement_audit_event_correlation_v` (ratified SECURITY INVOKER view — ADR-039 D4) |
| **Computation Layer** | SQL view (live, caller's RLS applies) |
| **Freshness Category** | Request-time |
| **Invalidation Trigger** | Any source table INSERT (PFT creation, MTL trigger, loyalty accrual) |
| **Reconciliation Path** | Row-count parity: each slip → expected PFT count → expected MTL count → expected ledger entries |
| **Owner** | Measurement Layer (cross-cutting) |

### MEAS-003: Rating Coverage

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-003 |
| **Truth Class** | Derived Operational |
| **Metric Name** | Rating Coverage |
| **Business Meaning** | Percentage of table-session time with active rating slips. Quantifies untracked gaps where players were at tables but not being rated. |
| **Surface(s)** | `/admin/reports`, pit dashboard, shift dashboard (future) |
| **Formula / Rule** | `rated_seconds / open_seconds` per table session; aggregate as `AVG(rated_ratio)` |
| **Source Tables** | `measurement_rating_coverage_v` (ratified SECURITY INVOKER view — ADR-039 D4) |
| **Computation Layer** | SQL view (live, caller's RLS applies) |
| **Freshness Category** | Request-time |
| **Invalidation Trigger** | Slip open/close, table session open/close |
| **Reconciliation Path** | `rated_seconds + untracked_seconds ≈ open_seconds` (time accounting identity) |
| **Owner** | Measurement Layer (cross-cutting) |

### MEAS-004: Loyalty Liability

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-004 |
| **Truth Class** | Snapshot-Historical |
| **Metric Name** | Loyalty Liability |
| **Business Meaning** | Daily snapshot of outstanding loyalty points and estimated dollar value per casino. Supports financial reporting and liability tracking. |
| **Surface(s)** | `/admin/reports` |
| **Formula / Rule** | `SUM(current_balance)` across active players × versioned valuation policy |
| **Source Tables** | `loyalty_liability_snapshot`, `loyalty_valuation_policy` (ratified tables — ADR-039 D5) |
| **Computation Layer** | Snapshot mechanism (existing RPC is one option; EXEC-SPEC decides invocation shape) |
| **Freshness Category** | Periodic (daily) |
| **Invalidation Trigger** | Loyalty accrual/redemption; valuation policy update |
| **Reconciliation Path** | `total_points` vs `SUM(player_loyalty.current_balance)` for snapshot date |
| **Owner** | LoyaltyService |

### Slice 2 — Shift Dashboard Metrics

> Added by PRD-047 / EXEC-047 (Hardening Slice 2). 8 rows (MEAS-005–012) via §5.1 expansion protocol.
> Audit source: `docs/70-governance/audits/SLICE-2-SHIFT-METRIC-INVENTORY.md`

### MEAS-005: Shift Win/Loss (Estimated)

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-005 |
| **Truth Class** | Derived Operational |
| **Metric Name** | Shift Win/Loss (Estimated) |
| **Business Meaning** | Casino-level estimated win/loss combining inventory snapshot deltas with telemetry-derived drop. The hero metric of the shift dashboard — enables pit bosses to assess shift-level financial performance in near-real-time, even when snapshot coverage is incomplete. |
| **Surface(s)** | Shift Dashboard V3 (hero card, metrics table, pit table, trend chart) |
| **Formula / Rule** | Per-table: `win_loss_estimated = win_loss_inventory + estimated_drop_buyins`. Casino/pit: null-aware `SUM()` across tables (PRD-036 null-aware aggregation). |
| **Source Tables** | `table_inventory_snapshot` (opening/closing bankroll), `table_fill`, `table_credit`, `table_buyin_telemetry` (estimated drop), `gaming_table` (table identity) |
| **Computation Layer** | RPC (`rpc_shift_table_metrics`, SECURITY INVOKER) + service-side aggregation (`aggregatePitMetrics()`, `aggregateCasinoMetrics()`) |
| **Freshness Category** | Cached (staleTime: 30s, refetchInterval: 30s via `useShiftDashboardSummary`) |
| **Invalidation Trigger** | Snapshot insert/update, fill/credit insert, buyin telemetry insert |
| **Reconciliation Path** | Recalculate per-table: verify `win_loss_estimated = win_loss_inventory + estimated_drop_buyins`. Verify casino total = `nullAwareSum(table.win_loss_estimated)`. |
| **Owner** | TableContextService |

### MEAS-006: Shift Win/Loss (Inventory)

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-006 |
| **Truth Class** | Derived Operational |
| **Metric Name** | Shift Win/Loss (Inventory) |
| **Business Meaning** | Per-table win/loss calculated purely from inventory snapshot deltas plus fills and credits. The authoritative win/loss path when both opening and closing snapshots exist. Null when snapshots are missing — separate row from MEAS-005 due to different source inputs and null semantics. |
| **Surface(s)** | Shift Dashboard V3 (metrics table, pit table) |
| **Formula / Rule** | `win_loss_inventory = (closing_bankroll - opening_bankroll) + fills - credits`. Null if opening or closing snapshot is missing. |
| **Source Tables** | `table_inventory_snapshot` (opening/closing bankroll), `table_fill`, `table_credit`, `gaming_table` |
| **Computation Layer** | RPC (`rpc_shift_table_metrics`, SECURITY INVOKER) + service-side aggregation (`nullAwareSum()`) |
| **Freshness Category** | Cached (staleTime: 30s, refetchInterval: 30s) |
| **Invalidation Trigger** | Snapshot insert/update, fill/credit insert |
| **Reconciliation Path** | Recalculate per-table: verify `(closing - opening) + fills - credits = win_loss_inventory`. Verify null when either snapshot is missing. |
| **Owner** | TableContextService |

### MEAS-007: Shift Estimated Drop

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-007 |
| **Truth Class** | Derived Operational |
| **Metric Name** | Shift Estimated Drop |
| **Business Meaning** | Total estimated table drop from buy-in telemetry (rated + grind). Enables revenue estimation when cash counting is incomplete or unavailable. Explicitly tagged as ESTIMATE grade in the UI. |
| **Surface(s)** | Shift Dashboard V3 (secondary KPI stack: "Est. Drop") |
| **Formula / Rule** | Per-table: `SUM(amount_cents) FROM table_buyin_telemetry` filtered by telemetry_kind (rated + grind). Casino/pit: `SUM()` across tables. Sub-values (rated, grind) share identical provenance, differing only by `telemetry_kind` filter. |
| **Source Tables** | `table_buyin_telemetry` (via `telemetry_agg` CTE in RPC), `gaming_table` |
| **Computation Layer** | RPC (`rpc_shift_table_metrics`, SECURITY INVOKER) + service-side aggregation |
| **Freshness Category** | Cached (staleTime: 30s, refetchInterval: 30s) |
| **Invalidation Trigger** | Buyin telemetry insert |
| **Reconciliation Path** | Recalculate: `SUM(amount_cents) FROM table_buyin_telemetry` for shift window = reported total. Verify rated + grind = buyins_total. |
| **Owner** | TableContextService |

### MEAS-008: Shift Fills & Credits

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-008 |
| **Truth Class** | Raw Record (aggregated) |
| **Metric Name** | Shift Fills & Credits |
| **Business Meaning** | Total fills (chips added to table) and credits (chips removed from table) during shift. Direct financial record of chip movement — serves as input to win/loss calculations and as standalone KPI for floor activity. Grouped because fills and credits share identical provenance. |
| **Surface(s)** | Shift Dashboard V3 (secondary KPI stack: "Fills", "Credits"; metrics table; pit table) |
| **Formula / Rule** | Fills: `SUM(amount_cents) FROM table_fill` within shift window. Credits: `SUM(amount_cents) FROM table_credit` within shift window. |
| **Source Tables** | `table_fill`, `table_credit`, `gaming_table` |
| **Computation Layer** | RPC (`rpc_shift_table_metrics`, SECURITY INVOKER; fills_agg/credits_agg CTEs) + service-side aggregation |
| **Freshness Category** | Cached (staleTime: 30s, refetchInterval: 30s) |
| **Invalidation Trigger** | Fill insert, credit insert |
| **Reconciliation Path** | Recalculate: `SUM(amount_cents) FROM table_fill/table_credit` for shift window = reported totals. Verify casino total = SUM(table totals). |
| **Owner** | TableContextService |

### MEAS-009: Snapshot Coverage & Metric Grade

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-009 |
| **Truth Class** | Derived Operational |
| **Metric Name** | Snapshot Coverage & Metric Grade |
| **Business Meaning** | Trust assessment for shift metrics. Coverage ratio measures what fraction of tables have opening+closing inventory snapshots. Metric grade (AUTHORITATIVE/ESTIMATE) is the worst-of across tables. Quality tier (GOOD/LOW/NONE) classifies telemetry quality. Together these signal how much confidence operators should place in reported win/loss values. |
| **Surface(s)** | Shift Dashboard V3 (coverage bar, metric grade badge, quality summary card, telemetry quality indicator, quality detail card) |
| **Formula / Rule** | Coverage ratio: `min(withOpening, withClosing) / totalTables`. Tier thresholds: HIGH ≥80%, MEDIUM ≥50%, LOW >0%, NONE =0%. Grade: worst-of across tables via `rollupCasinoProvenance()`. Quality counts: component-side `computeQualityCounts()` (display-only counting, not trust recomputation). |
| **Source Tables** | `table_inventory_snapshot` (snapshot presence), `table_buyin_telemetry` (telemetry quality), `gaming_table` |
| **Computation Layer** | RPC (`rpc_shift_table_metrics`, SECURITY INVOKER) + service-side derivation (`deriveTableProvenance()`, `rollupPitProvenance()`, `rollupCasinoProvenance()`, `computeAggregatedCoverageRatio()`, `getCoverageTier()`) |
| **Freshness Category** | Cached (staleTime: 30s, refetchInterval: 30s) |
| **Invalidation Trigger** | Snapshot insert/update, buyin telemetry insert |
| **Reconciliation Path** | Recalculate coverage ratio from snapshot presence flags. Verify grade = worst-of(table grades). Verify quality counts = count per tier from table quality flags. |
| **Owner** | TableContextService |

### MEAS-010: Cash Observation Rollups

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-010 |
| **Truth Class** | Derived Operational (telemetry-only) |
| **Metric Name** | Cash Observation Rollups |
| **Business Meaning** | Aggregated cash-out observations at casino, pit, and table levels. Estimated and confirmed totals plus observation counts. Telemetry-only — observational estimates of chip movement, not authoritative custody records. Displayed with TELEMETRY badge in UI. |
| **Surface(s)** | Shift Dashboard V3 (telemetry rail panel) |
| **Formula / Rule** | Estimated: `SUM(amount) WHERE direction='out' AND amount_kind='estimate'`. Confirmed: `SUM(amount) WHERE direction='out' AND amount_kind='cage_confirmed'`. Count: `COUNT(*) WHERE direction='out'`. Grouped at casino/pit/table level. |
| **Source Tables** | `pit_cash_observation` (via join: `pit_cash_observation → rating_slip → gaming_table`) |
| **Computation Layer** | RPCs (`rpc_shift_cash_obs_casino`, `rpc_shift_cash_obs_pit`, `rpc_shift_cash_obs_table` — all SECURITY INVOKER, parallel execution) |
| **Freshness Category** | Cached (staleTime: 30s, refetchInterval: 30s via `useCashObsSummary`) |
| **Invalidation Trigger** | Cash observation insert, rating slip status change |
| **Reconciliation Path** | Recalculate: `SUM(amount)` with direction/kind filters from `pit_cash_observation` for shift window. Verify casino total = SUM(pit totals) = SUM(table totals). |
| **Owner** | TableContextService |

### MEAS-011: Cash Observation Alerts

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-011 |
| **Truth Class** | Derived Operational (telemetry-only) |
| **Metric Name** | Cash Observation Alerts |
| **Business Meaning** | Spike alerts triggered when cash observation totals exceed configurable thresholds. Severity is computed by RPC then enriched with guardrails: critical severity is downgraded when telemetry quality is insufficient (no-false-critical invariant). Telemetry-only — observational, not authoritative. |
| **Surface(s)** | Shift Dashboard V3 (alerts strip) |
| **Formula / Rule** | Threshold comparison: `observed_value > threshold` triggers alert. Severity from RPC. Post-RPC enrichment: `computeAlertSeverity()` applies no-false-critical invariant (critical requires GOOD_COVERAGE). Allowed kinds filtered by `isAllowedAlertKind()`. |
| **Source Tables** | `pit_cash_observation` (via join to `gaming_table`), `casino_settings` (alert thresholds) |
| **Computation Layer** | RPC (`rpc_shift_cash_obs_alerts`, SECURITY INVOKER) + service-side severity guardrail enrichment (`computeAlertSeverity()`, `isAllowedAlertKind()`, `getWorstQuality()`) |
| **Freshness Category** | Cached (staleTime: 30s, refetchInterval: 30s via `useCashObsSummary`) |
| **Invalidation Trigger** | Cash observation insert, casino settings threshold update |
| **Reconciliation Path** | Verify each alert: `observed_value > threshold` from source data. Verify severity: if telemetry quality < GOOD_COVERAGE, severity must not be CRITICAL. Verify allowed kinds list matches `isAllowedAlertKind()` filter. |
| **Owner** | TableContextService |

### MEAS-012: Active Visitors Summary

| Column | Value |
|--------|-------|
| **Truth ID** | MEAS-012 |
| **Truth Class** | Derived Operational |
| **Metric Name** | Active Visitors Summary |
| **Business Meaning** | Count of active visitors on the gaming floor: rated (identified players with open rating slips) vs. unrated (ghost/walk-up). Rated percentage indicates what share of floor activity is generating tracked value. Cross-context read from VisitService. |
| **Surface(s)** | Shift Dashboard V3 (floor activity radar) |
| **Formula / Rule** | `rated_count = COUNT(*) WHERE visit_kind='gaming_identified_rated' AND status IN ('open','paused')`. `unrated_count = COUNT(*) WHERE visit_kind='gaming_ghost_unrated' AND status IN ('open','paused')`. `rated_percentage = rated / total * 100`. |
| **Source Tables** | `rating_slip` (TableContextService), `visit` (VisitService — cross-context read) |
| **Computation Layer** | RPC (`rpc_shift_active_visitors_summary`, SECURITY INVOKER) — inline call in API route handler |
| **Freshness Category** | Cached (staleTime: 30s, refetchInterval: 30s via `useActiveVisitorsSummary`) |
| **Invalidation Trigger** | Rating slip open/close/pause, visit status change |
| **Reconciliation Path** | Recalculate: `COUNT(*)` with visit_kind/status filters from `rating_slip` JOIN `visit` for shift window. Verify total = rated + unrated. Verify percentage = rated/total * 100. |
| **Owner** | VisitService (cross-context read via TableContextService) |

### Summary View

| Truth ID | Truth Class | Metric | Freshness | Owner |
|----------|-------------|--------|-----------|-------|
| MEAS-001 | Derived Operational | Theo Discrepancy | Request-time | TheoService / RatingSlipService |
| MEAS-002 | Compliance-Interpreted | Audit Event Correlation | Request-time | Measurement Layer |
| MEAS-003 | Derived Operational | Rating Coverage | Request-time | Measurement Layer |
| MEAS-004 | Snapshot-Historical | Loyalty Liability | Periodic (daily) | LoyaltyService |
| MEAS-005 | Derived Operational | Shift Win/Loss (Estimated) | Cached (30s) | TableContextService |
| MEAS-006 | Derived Operational | Shift Win/Loss (Inventory) | Cached (30s) | TableContextService |
| MEAS-007 | Derived Operational | Shift Estimated Drop | Cached (30s) | TableContextService |
| MEAS-008 | Raw Record (aggregated) | Shift Fills & Credits | Cached (30s) | TableContextService |
| MEAS-009 | Derived Operational | Snapshot Coverage & Metric Grade | Cached (30s) | TableContextService |
| MEAS-010 | Derived Operational (telemetry-only) | Cash Observation Rollups | Cached (30s) | TableContextService |
| MEAS-011 | Derived Operational (telemetry-only) | Cash Observation Alerts | Cached (30s) | TableContextService |
| MEAS-012 | Derived Operational | Active Visitors Summary | Cached (30s) | VisitService (cross-context) |

---

## 4. Compliance-Class Expansion Note (MEAS-002)

MEAS-002 is classified **Compliance-Interpreted**, which is the most governance-sensitive truth class in this matrix. The Compliance-Interpreted class brushes against dimensions that the full Cross-Surface Provenance framework captures but this 12-column subset intentionally defers.

**Current assessment:** The 12-column subset is correct for Slice 0. These 4 rows do not yet require Interpretation Basis, Late Data Handling, or Consumer Tolerance columns.

**Trigger for expansion:** If Slice 1 implementation reveals that compliance review workflows around MEAS-002 need any of the following dimensions, they are added to MEAS-002's row through governed matrix expansion:

- **Interpretation Basis** — what regulatory framework or policy drives the compliance interpretation
- **Late Data Handling** — how the metric handles retroactive corrections or late-arriving transactions
- **Consumer Tolerance** — acceptable staleness or error margin for compliance consumers

**Expansion mechanism:** Amend this document + update SRM cross-reference. Do NOT improvise these semantics locally in the EXEC-SPEC.

**Design intent:** The lean 12-column shape is intentional, not metaphysically complete. The risk that MEAS-002 may need additional columns is acknowledged and mitigated by the governed expansion protocol — not by pre-populating columns with speculative "n/a" values.

---

## 5. Expansion Protocol

### 5.1 Adding Rows (Slices 2-3)

When future slices introduce new measurement artifacts:

1. Assign a new Truth ID following the `MEAS-XXX` pattern (next available: MEAS-013)
2. Populate all 12 columns per the definitions in §2
3. Validate source tables against SRM §Measurement Layer registered artifacts
4. Submit as a governed amendment to this document via PR
5. Update SRM cross-reference if new source tables are introduced

**Scope discipline:** Only add rows for metrics that have ratified database infrastructure (ADR-approved views, tables, or RPCs). Do not add rows for speculative or planned-but-unbuilt metrics.

### 5.2 Adding Columns

When a concrete metric requires dimensions beyond the current 12 columns:

1. Identify the specific row(s) that need the additional column
2. Reference the deferred column from the Cross-Surface Provenance framework (§5.3)
3. Submit as a governed amendment to this document
4. Update SRM cross-reference
5. Update the column count in §2

**Trigger rule (ADR-041 D3):** Columns are added per-row through governed matrix amendment when a concrete metric requires them. Expansion is triggered by implementation experience, not by speculative completeness.

### 5.3 Deferred Columns

The following 10 columns from the Cross-Surface Provenance framework are deferred from this initial matrix. They may be added per-row as needed:

| # | Deferred Column | When to Add |
|---|----------------|-------------|
| 13 | Consumer Class | When metric has distinct consumer categories with different access patterns |
| 14 | Consumer Tolerance | When staleness or error margin must be declared for compliance |
| 15 | Late Data Handling | When retroactive corrections affect metric accuracy |
| 16 | Interpretation Basis | When regulatory framework drives compliance interpretation |
| 17 | Required Filters/Scope | When metric requires mandatory filtering (e.g., date range, casino scope) |
| 18 | Historical Semantics | When point-in-time vs. current-state distinction matters |
| 19 | Audit/Reconciliation Path (detail) | When reconciliation path needs sub-steps documented |
| 20 | Known Risks | When specific risks to metric accuracy are identified |
| 21 | Notes | When additional context is needed |
| 22 | Status | When metrics have lifecycle states (draft, active, deprecated) |

---

## 6. SRM Cross-Reference

Source tables referenced in this matrix are validated against SRM §Measurement Layer (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`, line 837):

| Source Table / View | SRM Registration | Security Mode | MEAS Rows |
|--------------------|-----------------|---------------|-----------|
| `rating_slip` | RatingSlipService owned table | Row-level (RLS) | MEAS-002, MEAS-010, MEAS-011, MEAS-012 |
| `measurement_audit_event_correlation_v` | Measurement Layer registered view | SECURITY INVOKER | MEAS-002 |
| `measurement_rating_coverage_v` | Measurement Layer registered view | SECURITY INVOKER | MEAS-003 |
| `loyalty_liability_snapshot` | LoyaltyService owned table | Row-level (RLS) | MEAS-004 |
| `loyalty_valuation_policy` | LoyaltyService owned table | Row-level (RLS) | MEAS-004 |
| `gaming_table` | TableContextService owned table | Row-level (RLS) | MEAS-005–012 |
| `table_inventory_snapshot` | TableContextService owned table | Row-level (RLS) | MEAS-005, MEAS-006, MEAS-009 |
| `table_fill` | TableContextService owned table | Row-level (RLS) | MEAS-005, MEAS-006, MEAS-008 |
| `table_credit` | TableContextService owned table | Row-level (RLS) | MEAS-005, MEAS-006, MEAS-008 |
| `table_drop_event` | TableContextService owned table | Row-level (RLS) | MEAS-005 |
| `table_buyin_telemetry` | TableContextService owned table | Row-level (RLS) | MEAS-005, MEAS-007, MEAS-009 |
| `pit_cash_observation` | TableContextService owned table | Row-level (RLS) | MEAS-010, MEAS-011 |
| `visit` | VisitService owned table | Row-level (RLS) | MEAS-012 |
| `casino_settings` | CasinoService owned table | Row-level (RLS) | MEAS-011 |

All source tables are registered in the SRM as owned artifacts. Slice 0 SECURITY INVOKER views apply caller's RLS — no privilege escalation. The `loyalty_liability_snapshot` RPC uses SECURITY DEFINER, governed by ADR-018. All Slice 2 shift RPCs (`rpc_shift_table_metrics`, `rpc_shift_cash_obs_*`, `rpc_shift_active_visitors_summary`) are SECURITY INVOKER with `set_rls_context_from_staff()` per ADR-024.

---

## 7. References

| Document | Path |
|----------|------|
| ADR-039 (Measurement Layer) | `docs/80-adrs/ADR-039-measurement-layer.md` |
| ADR-041 (Surface Governance Standard) | `docs/80-adrs/ADR-041-surface-governance-standard.md` |
| RFC-001 (Standards Foundation Design) | `docs/02-design/RFC-001-standards-foundation.md` |
| Cross-Surface Provenance Plan | `docs/00-vision/strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md` |
| Surface Classification Standard | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` |
| SRM §Measurement Layer | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (line 837) |
| Over-Engineering Guardrail | `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` |
| ADR-039 Precis | `docs/00-vision/strategic-hardening/ADR-039 Measurement Layer — Overview Précis.md` |
| PRD-047 (Slice 2) | `docs/10-prd/PRD-047-shift-provenance-alignment-v0.md` |
| RFC-002 (Slice 2 Design Brief) | `docs/02-design/RFC-002-shift-provenance-alignment.md` |
| Slice 2 Metric Inventory | `docs/70-governance/audits/SLICE-2-SHIFT-METRIC-INVENTORY.md` |
| Shift Metrics Contract v1 | `docs/25-api-data/SHIFT_METRICS_CONTRACT_v1.md` |
| Shift Provenance Rollup Algo v1 | `docs/25-api-data/SHIFT_PROVENANCE_ROLLUP_ALGO_v1.md` |

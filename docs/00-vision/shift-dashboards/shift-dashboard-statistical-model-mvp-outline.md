---
title: "Shift Dashboard Statistical Model (MVP) — High-Level Areas of Development"
status: draft
created: 2026-01-22
scope: "Shift-manager 360° performance dashboard: statistical model + data products + MVP boundaries"
related:
  - SHIFT_DASHBOARD_DATA_PIPELINE_STATUS.md
  - SHIFT_METRICS_CATALOG_v0 (referenced by status doc)
---

# Shift Dashboard Statistical Model (MVP)

## 0. Purpose

Build an **MVP-scoped “shift CRM” dashboard** that gives shift managers a 360° view of casino performance and operational context by:
- consolidating multiple streams into a **single source of truth** for shift KPIs and drilldowns,
- separating **authoritative** vs **telemetry** metrics (and grading them),
- enabling cross-dashboard sharing (shift → player views → reports) without inventing a second database.

This document mirrors the “Player 360” approach: define **what the dashboard is allowed to claim**, how it computes claims, and how it communicates uncertainty (quality + grade).

---

## 1. Baseline: What Exists Today (Implemented)

The current implemented pipeline is already a solid backbone:
- **UI**: CasinoSummaryCard, PitMetricsTable, TableMetricsTable, CashObservationsPanel (telemetry-only), AlertsPanel (spike alerts)
- **BFF**: `useShiftDashboardSummary()` (3→1 HTTP calls) and `useCashObsSummary()` (4→1 HTTP calls)
- **API**: `/api/v1/shift-dashboards/*`
- **RPCs**: `rpc_shift_table_metrics`, `rpc_shift_pit_metrics`, `rpc_shift_casino_metrics`, `rpc_shift_cash_obs_*`
- **Metric policy**:
  - Authoritative (inventory-based): opening/closing bankroll snapshots + fills/credits → win/loss inventory
  - Telemetry (observational): rated/grind estimated drop + cash-out observations (estimate vs cage confirmed)
  - Per-table **telemetry quality** (`GOOD_COVERAGE`, `LOW_COVERAGE`, `NONE`) and per-table **grade** (`ESTIMATE`, `AUTHORITATIVE` deferred)

This means the MVP model should **not** start from scratch; it should formalize and extend what’s already there.

---

## 2. The Statistical Model: What It Must Answer

A shift manager needs answers at 3 levels:

### 2.1 Casino level (executive summary)
- “How is the property doing this shift?”
- “Where is the money (or risk) concentrated?”
- “What changed since last shift / last comparable window?”

### 2.2 Pit level (operational triage)
- “Which pit is outperforming/underperforming relative to normal?”
- “Which pit has weak data quality (coverage gaps)?”
- “Where do I look first?”

### 2.3 Table level (actionable drilldown)
- “Which table is hot/cold and *why*?”
- “Is this an estimate, or something we can treat as authoritative?”
- “Is this a real spike or a data artifact?”

---

## 3. High-Level Areas of Development (Top-Down)

### Area A — Metric Contract & Semantics (the “truth table”)
Define and standardize:
- **Metric definitions** (formula + domain meaning)
- **Units** (cents vs dollars, minutes vs seconds)
- **Time windows** (shift window, gaming day boundaries, “as-of” time)
- **Grades** (ESTIMATE vs AUTHORITATIVE) and **quality flags** (coverage)
- **Null policy** (what does missing mean: unknown vs zero vs not-applicable)

Deliverable (MVP): a versioned **Shift Metrics Contract** that every RPC and dashboard component obeys.

---

### Area B — Data Sources & Stream Separation
Lock in a clean split:

1) **Authoritative inventory-based streams**
- opening/closing bankroll snapshots
- fills and credits
- derived inventory win/loss (and rollups)

2) **Telemetry streams**
- estimated drop (rated/grind)
- cash observations (estimate vs cage-confirmed, direction-aware)
- alerts computed over telemetry

Deliverable (MVP): “source-to-metric” mapping table (what table/RPC produces what metric) + provenance metadata.

---

### Area C — Aggregation Architecture (read-model pattern)
Keep the pattern consistent with ADR-029’s dashboard aggregator philosophy:
- **read-only** aggregation RPCs are allowed to read across tables/services,
- but **ownership stays clear** (one service owns the read-model surface area),
- avoid write-side coupling.

Deliverable (MVP): a small set of “dashboard read-model” RPCs with stable DTOs.

---

### Area D — Data Quality, Grading, and Trust UI
This is the difference between a dashboard and a lie.

- Telemetry quality labels (already present): `GOOD_COVERAGE`, `LOW_COVERAGE`, `NONE`
- Metric grade (already present): `ESTIMATE` now; `AUTHORITATIVE` later
- UI must display **confidence cues** (badge + tooltip + “what’s missing”)

Deliverable (MVP): a “Trust Layer” spec:
- minimum fields every row must carry: `grade`, `quality`, and `provenance`
- UI rules: when to show inventory vs estimate, when to warn, when to hide comparisons.

---

### Area E — Utilization & Activity Model (status timeline)
Right now, several high-value KPIs are blocked by missing “table is open” truth.

Add a minimal **table status timeline** stream:
- table transitions: `inactive → active → inactive/closed`
- compute: `open_minutes`, `idle_minutes` (optional), and per-hour rates.

Deliverable (MVP+): status event table + basic open_minutes calculation in `rpc_shift_table_metrics`.

---

### Area F — Trending & Baselines (variance, not vibes)
Static thresholds are fine for MVP, but the statistical model roadmap requires:
- 7-day and 30-day rolling mean/stddev
- z-score / standardized deltas
- “top movers” ranking
- simple shift-over-shift comparisons

Deliverable (Post-MVP first slice): baseline materialized view(s) + z-score fields added to alert RPC(s).

---

### Area G — Anomaly Detection & Alerts (operationally useful)
Current state: basic threshold-based spike alerts.

Enhancements (later, in order):
1) **Guardrails**: ensure direction filters and amount-kind filters are correct.
2) **Statistical alerts**: z-score-based anomalies (table/pit/casino).
3) **Pattern alerts**: repeated near-threshold behavior, trending breaks.

Deliverable (MVP): keep basic spike alerts, but standardize severity mapping and alert payload shape.

---

### Area H — Theoretical / Expected Value (theo) layer
Theo requires configuration and is explicitly blocked today **needs review**:
- decisions per hour by game type
- house advantage by game type
- effective-dated table limits (table settings)

Deliverable (Post-MVP): theo_amount, handle_est_amount, win_minus_theo.

---

### Area I — Forecasting & Comparative Views
Not required for MVP, but should be designed-in as “future slots”:
- expected win/loss based on historical patterns
- day-part analysis
- forecast ranges (not point forecasts)

Deliverable (Future): simple priors (historical median + IQR) before any fancy modeling.

---

### Area J — UX Composition (ergonomics for shift managers)
Design the dashboard like an operations console:
- **Top bar**: shift window + gaming day + refresh state + coverage badge
- **Casino KPI strip**: 6–10 KPIs with clear grade/quality cues
- **Two-pane drilldown**:
  - left: pit/table ranking + alerts
  - right: details panel (table/pit) with provenance + recent events
- **“Shareable snapshots”**: copy/paste summaries into shift reports (structured text)

Deliverable (MVP): prioritize *triage speed* over “analytics theatre.”

**Note** Refer to player dashboard UI for developing shift dashboard layout. 

---

## 4. MVP Feature Boundary (what NOT to build yet)

Defer:
- count room authoritative drop (`table_drop_event`, `drop_posted_at`) and hold%,
- full utilization + occupancy modeling (needs status events + rating intervals),
- theo + handle models,
- forecasting,
- sophisticated anomaly detection beyond thresholds.

---

## 5. Sequencing Recommendation (phased, no scope creep)

1) **Phase 0 (done):** RPC rollups + BFF consolidation + core UI components.
2) **Phase 1 (MVP hardening):** metric contract + trust UI + provenance + correctness audits.
3) **Phase 2:** table status events → open_minutes + per-hour metrics.
4) **Phase 3:** baselines + z-scores + top movers.
5) **Phase 4:** count room integration → authoritative drop + hold%.
6) **Phase 5:** theo + expected value + variance vs theo.

---

## 6. “What success looks like” (MVP)

A shift manager can:
- see casino performance with clear **inventory vs estimate** separation,
- identify top 3 pits/tables driving outcomes,
- trust the numbers because quality/grade/provenance are visible,
- share a consistent summary across shift reports and player views,
- avoid being misled by missing telemetry or partial coverage.

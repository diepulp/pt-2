# Reporting Layer — Gap Analysis

**Date:** 2026-04-15
**Branch:** `reporting-layer`
**Input docs:** GREENFIELD.md, pt2-reporting-layer-so-what-brief.md (main branch)

## Purpose

Verify GREENFIELD.md data source claims against the live codebase and identify omissions relative to the "So What" brief's five-question framework.

## GREENFIELD.md — Data Source Audit

All 9 claimed data sources are **confirmed present**:

| # | Claimed Source | Status | Location | Notes |
|---|---------------|--------|----------|-------|
| 1 | `rpc_shift_table_metrics` | CONFIRMED | `services/table-context/shift-metrics/service.ts:44` | Per-table financials: drop, fills, credits, win/loss, hold %, provenance |
| 2 | Closed sessions count | CONFIRMED | `app/api/v1/shift-dashboards/visitors-summary/route.ts` | `rpc_shift_active_visitors_summary` — rated/unrated/total counts |
| 3 | `mtl_gaming_day_summary` view | CONFIRMED | `services/mtl/crud.ts`, 6 migrations | MTL/CTR trigger counts by patron, gaming day |
| 4 | `rpc_get_alert_quality` | CONFIRMED | `services/shift-intelligence/alerts.ts:162` | Alert quality telemetry (date range) |
| 5 | `rpc_get_anomaly_alerts` | CONFIRMED | `services/shift-intelligence/anomaly.ts:18` | Live anomaly alerts with baseline coverage |
| 6 | `measurement_rating_coverage_v` | CONFIRMED | `services/measurement/queries.ts:189` | Per-table rating coverage, gaming day filterable |
| 7 | `measurement_audit_event_correlation_v` | CONFIRMED | `services/measurement/queries.ts:135` | Audit chain correlation (Cartesian — needs COUNT DISTINCT) |
| 8 | `loyalty_liability_snapshot` | CONFIRMED | `services/measurement/queries.ts:238` | Latest snapshot + valuation policy |
| 9 | `opening_source` / baseline provenance | CONFIRMED | `services/table-context/shift-metrics/service.ts:382` | Per-table `opening_source` field in `ShiftTableMetricsDTO` |

## Existing BFF Infrastructure

A partial aggregation endpoint already exists:

- `GET /api/v1/shift-dashboards/summary` — BFF returning casino + pits + tables metrics in a single call via `getShiftDashboardSummary()`. Covers proposed Section 1 (Financial Summary) and Section 5 (Baseline Quality).

## Missing Data Sources

Sources the "So What" brief requires but GREENFIELD.md does not mention:

| # | Missing Source | Service Exists? | Location | Report Section |
|---|--------------|-----------------|----------|----------------|
| 1 | Cash observation rollups | YES | `services/table-context/shift-cash-obs.ts` | Section 1 — Financial Summary |
| 2 | Player financial transactions | YES | `services/player-financial/` | Section 4 — Who Acted? |
| 3 | Promo coupon activity | YES | `services/loyalty/promo/` | Section 6 — Loyalty Liability |
| 4 | Player exclusion status | YES | `services/player/exclusion*.ts` | Section 3 — Compliance |
| 5 | Shift checkpoints / deltas | YES | `services/table-context/shift-checkpoint/crud.ts` | Section 1 — point-in-time comparison |
| 6 | Cross-property recognition | YES | `services/recognition/` | Section 6 — multi-property loyalty |
| 7 | Theo discrepancy | YES | `services/measurement/queries.ts:92` | Section 2 — Rating quality trust signal |
| 8 | Staff attribution / audit log | **NO** | `alert_acknowledgment` table has staff joins, no general query service | Section 4 — Accountability signals |

### Detail: Cash Observations (Gap #1)

Full service at `services/table-context/shift-cash-obs.ts` with RPCs:
- `rpc_shift_cash_obs_table` — per-table observation rollups
- `rpc_shift_cash_obs_pit` — pit-level aggregation
- `rpc_shift_cash_obs_casino` — casino-level aggregation
- Spike alert detection with severity computation

Already has 5 API routes under `/api/v1/shift-dashboards/cash-observations/`. These are telemetry-grade drop/fill/credit observations — a parallel data stream to inventory-based metrics. Must be included in the financial summary.

### Detail: Staff Attribution (Gap #8)

The hardest gap. The "So What" brief explicitly requires "Who acted?" signals:
- Staff attribution for actions
- Acknowledgments with actor identity
- Exception notes authorship
- Action chain visibility

Today: `alert_acknowledgment` joins to `staff` for name resolution. No general staff-action query surface exists. Building this requires either:
- A new database view aggregating staff actions across tables (fills, credits, alert acks, session opens/closes)
- Or a lightweight RPC that unions action types with `actor_id` attribution

### Detail: Closed Sessions Conflation (Gap in accuracy)

GREENFIELD.md says "existing query in closed sessions panel" for closed session counts. The actual RPC is `rpc_shift_active_visitors_summary`, which returns **active** visitor counts (rated/unrated/total), not closed sessions. Closed session count needs either:
- A filtered query via `services/visit/crud.ts` with status = 'closed'
- Or a new lightweight aggregation query

## Section-by-Section Completeness

Mapping GREENFIELD's 6 sections against the "So What" brief's 5 questions:

| GREENFIELD Section | "So What" Question | Data Sources Complete? | Gaps |
|-------------------|-------------------|----------------------|------|
| 1 — Financial Summary | Q1: What did the floor produce? | **Partial** | Missing cash observation rollups, shift checkpoint deltas |
| 2 — Rating Activity | Q2: How trustworthy? | **Partial** | Missing theo discrepancy as trust signal |
| 3 — Compliance | Q3: What requires attention? | **Partial** | Missing player exclusion activity |
| 4 — Anomalies & Exceptions | Q3: What requires attention? | **Complete** | Alerts + quality telemetry confirmed |
| 5 — Baseline Quality | Q2: How trustworthy? | **Complete** | Provenance data confirmed |
| 6 — Loyalty Liability | (No direct mapping) | **Partial** | Missing promo exposure, cross-property context |
| *Not in GREENFIELD* | Q4: Who acted? | **Missing** | No staff attribution service layer |
| *Not in GREENFIELD* | Q5: Can this be defended? | **Implicit** | Audit correlation exists but no "proof package" assembly |

## Effort Estimate Revision

GREENFIELD estimates 3-5 days. Adjusted assessment:

| Layer | GREENFIELD Est. | Revised Est. | Delta |
|-------|----------------|-------------|-------|
| Report Data Aggregation API | 1-2 days | 2-3 days | +1 day for cash obs, theo, exclusions, promo |
| Staff Attribution Query (new) | Not estimated | 1-1.5 days | New view/RPC + service method |
| Closed Sessions Query (fix) | Not estimated | 0.5 day | Separate from active visitors |
| Report Rendering & Export | 2-3 days | 2-3 days | Unchanged |
| **Total** | **3-5 days** | **5.5-8 days** | +2.5-3 days |

## Recommendations

1. **Update GREENFIELD.md** to incorporate the 8 missing data sources before writing a PRD
2. **Prioritize the staff attribution gap** — this is the only missing service layer; everything else is assembly
3. **Correct the closed-sessions conflation** — active visitors ≠ closed sessions
4. **Include cash observations** in Section 1 — they are already API-served, just not mentioned
5. **Scope decision needed**: Should the MVP report include all 5 "So What" questions, or ship Sections 1-3-4-5-6 first and defer Section 4 ("Who acted?")?

---
id: SCAFFOLD-004
title: "Feature Scaffold: Shift Baseline Service (Rolling Median+MAD)"
owner: engineering
status: Draft
date: 2026-03-23
---

# Feature Scaffold: Shift Baseline Service (Rolling Median+MAD)

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** Shift Baseline Service
**Owner / driver:** Engineering
**Stakeholders (reviewers):** Product, Operations
**Status:** Draft
**Last updated:** 2026-03-23

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss reviewing the shift dashboard, I need anomaly alerts based on statistical baselines (not just static thresholds) so I can detect unusual drop, hold, and cash observation patterns relative to a table's recent history.
- **Primary actor:** Pit Boss — floor supervisor monitoring shift operational metrics
- **Success looks like:** Anomaly alerts for drop/hold/cash observations fire when a table's current-shift value deviates beyond `N * MAD` from its rolling 7-day median, replacing the current static-threshold-only detection. False positive rate is manageable (not every table, every shift).

## 2) Constraints (hard walls)

- **Security / tenancy:** Casino-scoped via RLS context (ADR-024). Baselines must not leak across casinos. RPC must call `set_rls_context_from_staff()`.
- **Domain:** Rolling window uses **gaming days** (per `casino_settings.gaming_day_start_time` + `timezone`), not calendar days. A "7-day window" means 7 prior gaming days with at least `min_history_days` (default 3) of data.
- **Operational:** Baseline computation must complete within 2s for a single table, 10s for an entire casino floor (~50 tables). Must handle sparse data gracefully (new tables, low-activity days).
- **Configuration:** Must consume existing `casino_settings.alert_thresholds.baseline` config (`window_days`, `method`, `min_history_days`) — already deployed, currently unread.
- **Statistical:** MAD = `median(|Xi - median(X)|) * 1.4826` (consistency constant for normal distribution equivalence). Fallback to percentage-based threshold when MAD = 0 (constant-value series).

## 3) Non-goals (what we refuse to do in this iteration)

1. **Alert persistence / state machine** — alerts remain ephemeral (computed per RPC call). Persistent `shift_alerts` table is Phase C-2 scope.
2. **Alert deduplication / throttling** — same alert may fire on every dashboard refetch. Cooldown windows are Phase C-2 scope.
3. **External notifications** (Slack, email, webhook) — alerts visible only on admin dashboard. Notification routing is Phase C-3 scope.
4. **Real-time streaming computation** — baselines are computed on-demand or batch-materialized, not via event stream / change data capture.
5. **ML-based anomaly detection** — median+MAD is the chosen statistical method. No regression models, no clustering, no seasonal decomposition.
6. **Historical baseline trend analysis UI** — no UI for viewing how baselines evolved over time. Dashboard shows current alerts only.
7. **Per-table baseline overrides** — all tables in a casino use the same `window_days` / `method` / `min_history_days`. Per-table tuning is a future refinement.
8. **Cross-property (company-scoped) baselines** — baselines are strictly casino-scoped. No portfolio-level anomaly detection.

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Shift time window (`p_window_start`, `p_window_end`)
  - Metric type(s): `drop_total`, `hold_percent`, `cash_obs_total`, `promo_issuance_total`
  - Configuration from `casino_settings.alert_thresholds.baseline`
  - Historical metric values from prior gaming days (via existing shift RPCs or direct table reads)

- **Outputs:**
  - Per-table baseline record: `{ table_id, metric_type, median, mad, sample_count, gaming_day }`
  - Anomaly flags: `{ table_id, metric_type, observed_value, baseline_median, baseline_mad, z_score, is_anomaly, severity }`

- **Canonical contract(s):**
  - `BaselineDTO` — computed baseline for a table/metric pair
  - `AnomalyAlertDTO` — anomaly detection result with baseline context

## 5) Options (2-4 max; force tradeoffs)

### Option A: RPC-Computed Baselines (On-Demand, No Storage)

- **Pros:** No new table. No stale data risk. Always fresh. Simpler schema.
- **Cons / risks:** Repeated computation on every dashboard load (~50 tables x 4 metrics x 7-day lookback). Performance risk if shift RPCs are slow for historical windows. N+1 query pattern.
- **Cost / complexity:** Low schema complexity, high runtime cost.
- **Security posture impact:** No new write surface. RPC uses caller's RLS context.
- **Exit ramp:** Can add materialization layer later without changing the RPC interface.

### Option B: Stored Baselines (Materialized Table)

- **Pros:** Single computation per gaming day. Fast reads for dashboard. Enables baseline trend queries later. Predictable performance.
- **Cons / risks:** New `table_metric_baseline` table (write surface). Requires a recomputation trigger (end-of-day, on-demand, or both). Staleness risk if recomputation fails.
- **Cost / complexity:** Medium — new table, RLS policies, recomputation RPC. But dashboard reads become simple SELECTs.
- **Security posture impact:** New table requires RLS policies. Write RPC needs SECURITY DEFINER governance (ADR-018).
- **Exit ramp:** Table can be dropped and replaced with on-demand computation if materialization proves unnecessary.

### Option C: Hybrid (Compute + Cache)

- **Pros:** First call computes and stores; subsequent calls read cached. Best of both: fresh when needed, fast when available.
- **Cons / risks:** Cache invalidation complexity. Race conditions on concurrent recomputation. Partial-cache states.
- **Cost / complexity:** Highest — needs table, cache invalidation logic, TTL/staleness detection.
- **Security posture impact:** Same as Option B plus cache mutation surface.
- **Exit ramp:** Can simplify to A or B by removing cache layer.

## 6) Decision to make (explicit)

- **Decision:** Should baselines be computed on-demand (A), stored/materialized (B), or hybrid-cached (C)?
- **Decision drivers:**
  - Dashboard load performance for ~50 tables is the primary constraint
  - Existing shift RPCs (`rpc_shift_table_metrics`) already compute per-shift aggregates but not historical rolling windows
  - The `casino_settings.alert_thresholds.baseline.method` is `"median_mad"` — a computation that requires sorting (O(n log n)), making repeated computation non-trivial
  - Stored baselines enable future Phase C-2 (alert persistence) to reference the exact baseline that triggered an alert
- **Decision deadline:** Before RFC (Phase 2)

## 7) Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `rpc_shift_table_metrics` | Required — source of per-shift drop/hold data | Implemented |
| `rpc_shift_cash_obs_table` | Required — source of per-shift cash obs data | Implemented |
| `casino_settings.alert_thresholds.baseline` | Required — configuration | Implemented (unread) |
| `casino_settings.gaming_day_start_time` | Required — gaming day boundary | Implemented |
| Admin threshold config UI (`/admin/settings/thresholds`) | Optional — baseline config panel writes params | Implemented |
| `rpc_shift_cash_obs_alerts` (existing) | Affected — will be enhanced or superseded by baseline-aware alerting | Implemented |

## 8) Risks / Open questions

| Risk / Question | Impact | Mitigation / Learning Plan |
|-----------------|--------|---------------------------|
| Gaming day boundary computation across timezone changes (DST) | Medium | Use `casino_settings.timezone` + PostgreSQL `AT TIME ZONE` for correct boundaries. Test with DST transition dates. |
| Sparse data for new tables (<3 gaming days of history) | Medium | Fallback to static threshold from `alert_thresholds` config when `sample_count < min_history_days`. Explicit `insufficient_data` flag in response. |
| MAD = 0 (constant-value series, e.g., table with identical drop every day) | Low | When MAD = 0, fall back to percentage-based deviation from median (use `fallback_percent` from threshold config). |
| Performance of rolling window query across 7 gaming days x 50 tables | High | Benchmark early. If on-demand (Option A) exceeds 10s SLO, escalate to stored baselines (Option B). |
| Existing `rpc_shift_cash_obs_alerts` uses static thresholds — transition path | Medium | Enhance existing RPC to optionally use baselines when available, or create parallel `rpc_shift_anomaly_alerts` that supersedes it. |

## 9) Definition of Done (thin)

- [ ] Decision recorded in ADR (storage strategy: on-demand vs. materialized)
- [ ] Acceptance criteria agreed (baseline accuracy, performance SLO, edge cases)
- [ ] Implementation plan delegated (PRD → build-pipeline)

## Links

- Feature Boundary: `docs/20-architecture/specs/shift-baseline-service/FEATURE_BOUNDARY.md`
- Hardening Report: `docs/00-vision/strategic-hardening/HARDENING_REPORT_2026-03-23.md` (Phase C-1)
- Design Brief/RFC: (pending Phase 2)
- ADR(s): (pending Phase 4)
- PRD: (pending Phase 5)

# PRD-055 Post-Implementation Precis — Shift Baseline Service

**Date:** 2026-03-23 | **Branch:** `wedge-c` | **Phase:** C-1 (Wedge C — Shift Intelligence)
**Spec:** PRD-055, EXEC-055, ADR-046 | **SRM:** v4.21.0

---

## What Was Achieved

PRD-055 delivered the **P0 blocker** for Wedge C: a rolling 7-day statistical baseline engine that computes per-table median + MAD (Median Absolute Deviation) for four operational metrics and fires anomaly alerts when current-shift values deviate beyond configured thresholds.

This was the single largest remaining gap in the strategic hardening effort. Before this build, the only anomaly detection available was static cash observation spike alerts (`rpc_shift_cash_obs_alerts`). Drop, hold, and win/loss anomalies were entirely blocked — they require relative deviation from a table's own history, not absolute thresholds.

### Wedge C Scorecard Impact

| Metric | Before | After | Movement |
|--------|--------|-------|----------|
| Wedge C rating | AMBER (60%) | **AMBER (80%)** | +20pp |
| Anomaly families covered | 1/4 (cash obs only) | **3/4** (drop, hold, win/loss) | +2 families |
| Baseline config consumed | Written but unread | **Consumed** by compute RPC | Gap closed |
| Per-table adaptive thresholds | None | **Operational** | New capability |

---

## What Exists Now

### Database Layer

| Artifact | Description |
|----------|-------------|
| `table_metric_baseline` | Stores rolling baselines — median, scaled MAD (x1.4826), sample count, min/max per (casino, table, metric, gaming_day). UPSERT-keyed, casino-scoped RLS (Pattern C), DELETE denied. |
| `rpc_compute_rolling_baseline()` | SECURITY DEFINER. Reads `casino_settings.alert_thresholds.baseline` config (window_days, min_history_days). Loops over N prior gaming days, calls source RPCs (`rpc_shift_table_metrics`, `rpc_shift_cash_obs_table`), computes median + MAD, UPSERTs results. Role-gated to pit_boss/admin. |
| `rpc_get_anomaly_alerts()` | SECURITY INVOKER. Reads stored baselines + live shift data. Evaluates per-metric anomaly rules. Returns readiness state, deviation score, severity, direction, and baseline context for every (table, metric) pair. |

### Service Layer — `services/shift-intelligence/`

| File | Purpose |
|------|---------|
| `dtos.ts` | `BaselineDTO`, `AnomalyAlertDTO`, `BaselineComputeResultDTO`, `AnomalyAlertsResponseDTO` + enums (`MetricType`, `ReadinessState`, `AlertSeverity`, `DeviationDirection`) |
| `schemas.ts` | Zod validation: `computeBaselineInputSchema`, `anomalyAlertsQuerySchema` |
| `keys.ts` | React Query key factory with `.scope` invalidation support |
| `mappers.ts` | RPC row -> camelCase DTO mappers |
| `baseline.ts` | `computeBaselines()` — calls compute RPC |
| `anomaly.ts` | `getAnomalyAlerts()` — calls alert RPC, computes coverage summary |
| `http.ts` | Client-side fetchers for route handlers |
| `index.ts` | `createShiftIntelligenceService()` factory, re-exports |

### API Routes

| Method | Path | Role Gate | Description |
|--------|------|-----------|-------------|
| POST | `/api/v1/shift-intelligence/compute-baselines` | pit_boss, admin | Triggers baseline recomputation |
| GET | `/api/v1/shift-intelligence/anomaly-alerts` | pit_boss, admin | Returns anomaly alerts with readiness states |

### Dashboard Components

| Component | Purpose |
|-----------|---------|
| `anomaly-alert-card.tsx` | Renders anomaly alert with severity badge, deviation score, direction, baseline context. Handles all 4 readiness states (ready, stale, missing, insufficient_data). |
| `baseline-coverage-banner.tsx` | Degraded-coverage indicator: "12/15 tables have baselines." Only visible when gaps exist. |
| `recompute-baselines-button.tsx` | Triggers computation, shows loading + result summary. |
| `use-anomaly-alerts.ts` | React Query hook, 30s refetch interval |
| `use-compute-baselines.ts` | Mutation hook, invalidates alert cache on success |

### Governance

- **SRM v4.21.0** — ShiftIntelligenceService registered under Operational category
- **ADR-046** — Stored baseline computation strategy (frozen)
- **ADR-024 INV-8** compliance — no spoofable casino_id/actor_id parameters; all context derived from JWT

---

## Per-Metric Anomaly Evaluation (As Built)

| Metric | Method | Threshold Source | Authority |
|--------|--------|-----------------|-----------|
| `drop_total` | Median + MAD multiplier | `alert_thresholds.drop_anomaly.mad_multiplier` (3) | **Baseline-aware** |
| `hold_percent` | Range-bound (extreme_low/high, deviation_pp) | `alert_thresholds.hold_deviation` (-5/40/10) | **Baseline-aware** |
| `win_loss_cents` | Median + MAD multiplier | `alert_thresholds.promo_issuance_spike.mad_multiplier` (3) | **Baseline-aware** |
| `cash_obs_total` | Baselines stored; no anomaly eval | Static threshold (`rpc_shift_cash_obs_alerts`) | **Static** (coexists) |

### Readiness States (ADR-046 SS8)

| State | Condition | Anomaly Evaluation |
|-------|-----------|-------------------|
| `ready` | Current-day baseline, sample_count >= min_history_days | YES |
| `stale` | No current-day baseline, older exists | NO (fail-closed) |
| `missing` | No baseline ever computed | NO (fail-closed) |
| `insufficient_data` | Baseline exists, sample_count < min_history_days | NO (flag only) |

### Edge Cases Handled

- **MAD = 0** (constant series): Falls back to `fallback_percent` from config (50% for drop, 100% for win/loss)
- **Zero drop days**: Excluded from `hold_percent` baseline window (division-by-zero guard)
- **Current gaming day**: Excluded from baseline computation (only completed prior days contribute)
- **Telemetry-deficient days**: Excluded when `telemetry_quality = 'NONE'`
- **INVOKER-under-DEFINER**: Source RPCs called from DEFINER context; casino isolation via WHERE clauses, not RLS

---

## Test Coverage

| Suite | Type | Tests | Covers |
|-------|------|-------|--------|
| `mappers.test.ts` | Unit | 10 | Row -> DTO mapping, null handling, enum preservation |
| `baseline-computation.test.ts` | Unit | 20 | Median (odd/even/single/unsorted), MAD scaling, MAD=0 fallback, hold zero-drop exclusion, sparse data |
| `anomaly-evaluation.test.ts` | Unit | 19 | Severity thresholds (2/3/4 MAD), direction, hold range-bound, cash_obs skip, readiness state model |
| `http-contract.test.ts` | Contract | 5 | Route export verification, HTTP method enforcement |
| **Total** | | **54** | |

---

## Known Limitations (Documented, Intentional)

1. **Manual recomputation only** — No scheduler. Admin must trigger `POST /compute-baselines`. Automatic scheduling deferred to Phase C-3 (pg_cron).
2. **`compute_failed` deferred** — 4-state readiness model in MVP. The 5th state (`compute_failed`) requires an error persistence column. Deferred to Phase C-2.
3. **`win_loss_cents` uses interim threshold** — `promo_issuance_spike.mad_multiplier` as default. Dedicated `win_loss` config category deferred.
4. **Alerts are ephemeral** — Computed on each RPC call. No persistence, no acknowledgment history.
5. **No deduplication/throttling** — Same alert fires on every 30s dashboard refetch.

---

## Next Steps

### Phase C-2: Alert Persistence (P1)

| Deliverable | Effort | Impact |
|-------------|--------|--------|
| `shift_alerts` table with state machine (open -> acknowledged -> resolved) | 3-4 days | Persistent cross-session alert history |
| `rpc_acknowledge_alert()` RPC | 1 day | Pit boss can dismiss alerts with notes |
| `compute_failed` readiness state (error persistence column on `table_metric_baseline`) | 1 day | Distinguish "never computed" from "computation failed" |
| Alert deduplication / cooldown windows per (table_id, alert_type) | 2-3 days | Eliminates 30s refetch alert fatigue |
| **Expected outcome:** AMBER (80%) -> **GREEN (85%)** | | |

### Phase C-3: Alert Quality (P2)

| Deliverable | Effort | Impact |
|-------------|--------|--------|
| Context enrichment (activity breakdown, recommended actions) | 2-3 days | Reduces investigation time |
| Alert quality telemetry (false-positive rate, acknowledge latency) | 1 day | Validates alert quality before any external notification channel |
| **Expected outcome:** GREEN (85%) -> **GREEN (92%+)** | | |

### Deferred (Pilot Containment Protocol)

| Deliverable | Reason |
|-------------|--------|
| pg_cron baseline scheduler | Manual workaround exists (admin clicks button each morning) |
| External notifications (Slack, email) | Separate post-C3 effort; not part of Wedge C completion claim |
| Cash obs baseline cutover | Static thresholds are functional; new config flag adds axis of variability |

### Integration Points Ready for Wiring

| Surface | How | Status |
|---------|-----|--------|
| Shift dashboard | Import `useAnomalyAlerts` hook + `AnomalyAlertCard` component | Components ready, wire to existing shift dashboard page |
| `/admin/alerts` page | Add `AnomalyAlertCard` alongside existing static-threshold alerts | Component ready |
| `/admin/settings` | Add `RecomputeBaselinesButton` | Component ready |

### Strategic Position

With Phase C-1 delivered, Wedge C has cleared its P0 blocker. The baseline computation engine is operational and consuming the previously-unread `casino_settings.alert_thresholds.baseline` config. Three of four anomaly families now have adaptive detection. The remaining Phase C-2 and C-3 work is incremental — alert persistence, quality improvements, and automation — not foundational capability gaps.

**All four wedges can now credibly claim operational coverage.** Wedge C is the last to cross from "infrastructure ready" to "detection operational." The path from AMBER (80%) to GREEN (92%+) is well-defined and estimable: ~3 weeks of focused delivery across Phases C-2 and C-3.

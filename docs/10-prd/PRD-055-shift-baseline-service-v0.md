---
id: PRD-055
title: Shift Baseline Service — Rolling Median+MAD Anomaly Detection
owner: Engineering
status: Draft
affects: [ADR-046, ADR-018, ADR-024, ADR-039, SEC-NOTE-shift-baseline-service]
created: 2026-03-23
last_review: 2026-03-23
phase: Phase C-1 (Wedge C — Shift Intelligence)
pattern: A
http_boundary: true
scaffold_ref: docs/01-scaffolds/SCAFFOLD-004-shift-baseline-service.md
adr_refs: [ADR-046]
---

# PRD-055 — Shift Baseline Service (Rolling Median+MAD Anomaly Detection)

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** The Shift Baseline Service computes rolling 7-day statistical baselines (median + MAD) for per-table operational metrics (drop, hold%, cash observations, win/loss) and uses them to detect anomalies relative to a table's recent history. This supplements the current static-threshold detection (`rpc_shift_cash_obs_alerts`) with adaptive, table-specific anomaly thresholds. It is the P0 blocker for Wedge C (Shift Intelligence). This slice delivers baseline-aware anomaly detection for **drop and hold** metrics; cash observation baselines are precomputed for validation but authority remains with the static-threshold system; promotional issuance anomaly detection is deferred pending a source RPC (see §4.1 Alert Family Authority).

---

## 2. Problem & Goals

### 2.1 Problem

PT-2's shift intelligence system currently detects cash observation spikes via `rpc_shift_cash_obs_alerts`, comparing current-shift totals against static dollar thresholds configured in `casino_settings.alert_thresholds`. A $6,000 cash-out triggers the same alert at a high-limit table as at a $5-minimum table.

Without statistical baselines, the system cannot distinguish "normal for this table" from "anomalous." Drop anomaly detection and hold deviation detection are entirely blocked — they require relative deviation from a table's own history, not absolute thresholds. Promotional issuance spike detection also requires baselines but is deferred in this slice because its source RPC does not yet exist.

The baseline config (`casino_settings.alert_thresholds.baseline`) is already deployed and admin-configurable (`window_days: 7`, `method: "median_mad"`, `min_history_days: 3`) but **nothing reads it**.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Anomaly alerts fire on per-table statistical deviation | Alert fires when current-shift metric deviates beyond `mad_multiplier * MAD` from rolling median |
| **G2**: Dashboard alert reads stay within SLO | Anomaly alert read path completes in <200ms (baselines are pre-computed) |
| **G3**: Existing baseline config is consumed | `casino_settings.alert_thresholds.baseline.window_days`, `method`, `min_history_days` control computation parameters |
| **G4**: Sparse data does not produce false alerts | Tables with <`min_history_days` data return `insufficient_data` flag instead of anomaly alerts |

### 2.3 Non-Goals

- Alert persistence / state machine (Phase C-2 — `shift_alerts` table)
- Alert deduplication / throttling / cooldown windows (Phase C-2)
- External notifications — Slack, email, webhook (Phase C-3)
- Real-time streaming computation — baselines are batch/on-demand
- ML-based anomaly detection — median+MAD statistical method only
- Historical baseline trend analysis UI — no baseline evolution display
- Per-table baseline overrides — casino-wide config only
- Cross-property (company-scoped) baselines — casino-scoped only

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Admin

**Top Jobs:**

- As a **Pit Boss**, I need to see which tables have anomalous drop or hold values compared to their recent history so that I can investigate potential cash handling issues or gaming irregularities.
- As a **Pit Boss**, I need to see anomaly alerts that are relative to each table's own baseline so that high-limit tables don't trigger the same alerts as low-limit tables.
- As an **Admin**, I need to trigger baseline recomputation and configure sensitivity parameters (window days, MAD multiplier) so that anomaly detection adapts to my casino's operational patterns.

**Unhappy Paths:**

- As a **Pit Boss**, when a table has been operating for fewer than 3 days, I need to see a clear "insufficient data" indicator instead of a false anomaly alert so that I don't waste time investigating statistical noise.
- As a **Pit Boss**, when a table has had identical drop values every day (MAD = 0), I need the system to fall back to a percentage-based threshold so that anomaly detection still functions.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Database:**
- Create `table_metric_baseline` table with casino-scoped RLS (Pattern C)
- UNIQUE constraint on `(casino_id, table_id, metric_type, gaming_day)` for UPSERT
- DELETE denial policy (no business reason for deletes)
- `computed_by` derived from `app.actor_id` session context (ADR-024 INV-8)

**Computation RPC:**
- `rpc_compute_rolling_baseline(p_gaming_day date DEFAULT NULL, p_table_id uuid DEFAULT NULL)` — SECURITY DEFINER
- Computes 7-day rolling median + MAD for 4 metric types: `drop_total`, `hold_percent`, `cash_obs_total`, `win_loss_cents`
- Reads `casino_settings.alert_thresholds.baseline` for `window_days`, `min_history_days`
- Uses `compute_gaming_day()` (TEMP-001) for gaming day boundary derivation
- UPSERT results into `table_metric_baseline`
- Returns computation summary: `tables_processed`, `metrics_computed`, `gaming_day`

**Anomaly Alert RPC:**
- `rpc_get_anomaly_alerts(p_window_start timestamptz, p_window_end timestamptz)` — SECURITY INVOKER
- Reads stored baselines + calls live shift metrics RPCs
- Compares: `observed_value` vs `baseline_median +/- (mad_multiplier * baseline_mad)`
- Returns: alert type, severity, deviation score, direction (above/below), `readiness_state` enum, baseline context
- Severity mapping: deviation > 2 MAD = info, > 3 MAD = warn, > 4 MAD = critical

**Service Layer:**
- `services/shift-intelligence/` with: `dtos.ts`, `schemas.ts`, `keys.ts`, `mappers.ts`, `baseline.ts`, `anomaly.ts`, `http.ts`, `index.ts`
- `BaselineDTO` and `AnomalyAlertDTO` as published contracts
- Zod schemas for API input validation

**API Routes:**
- `POST /api/shift-intelligence/compute-baselines` — triggers baseline computation (pit_boss/admin)
- `GET /api/shift-intelligence/anomaly-alerts?window_start=...&window_end=...` — returns anomaly alerts (pit_boss/admin)

**Edge Cases:**
- Sparse data: `sample_count < min_history_days` → `readiness_state: 'insufficient_data'`, no anomaly evaluation
- MAD = 0 (constant series): fallback to `fallback_percent` from `casino_settings.alert_thresholds.{category}.fallback_percent`
- No baseline for current gaming day: return `readiness_state: 'stale'` (if older baseline exists) or `'missing'` (if none). Adaptive anomaly evaluation does NOT run. Dashboard surfaces degraded-coverage indicator. Per ADR-046 §9 fail-closed semantics — no silent substitution.
- Optional `p_table_id` filter on compute RPC for targeted testing

**Baseline Readiness States (ADR-046 §8):**

Each table/metric pair in the anomaly alert response includes a `readiness_state` enum. Anomaly evaluation runs only for `ready` baselines. All other states surface the reason anomaly detection is unavailable.

| State | Trigger Condition | Anomaly Evaluation | Dashboard Indicator |
|-------|-------------------|-------------------|---------------------|
| `ready` | Current-day baseline exists, `sample_count >= min_history_days` | YES — full adaptive detection | Normal alert display |
| `stale` | No current-day baseline, but older baseline exists | NO — fail-closed | "Baseline stale (last: {date})" |
| `missing` | No baseline has ever been computed for this table/metric | NO — fail-closed | "No baseline available" |
| `insufficient_data` | Baseline exists but `sample_count < min_history_days` | NO — flag only | "Baseline building ({n}/{min} days)" |
| ~~`compute_failed`~~ | ~~Computation attempted but errored~~ | ~~NO~~ | **Deferred to Phase C-2** — requires error persistence column. In MVP, failed computations surface as `missing` (no baseline row written on failure). |

`compute_failed` is a distinct operational state, not collapsible into `missing`. A table that has never been computed (`missing`) is different from one where computation was attempted and failed (`compute_failed`). The distinction matters for troubleshooting: `missing` means "run the computation," `compute_failed` means "investigate why computation broke." The compute RPC records per-table/metric error flags in its response summary; the read path surfaces this as `compute_failed` for any table/metric where the most recent computation attempt errored and no prior successful baseline exists.

**Alert Family Authority (MVP — ADR-046):**

During Phase C-1, both alert systems coexist with explicit authority boundaries:

| Alert Family | Authoritative System | Rationale |
|-------------|---------------------|-----------|
| Drop anomaly | **Baseline-aware** (`rpc_get_anomaly_alerts`) | Relative deviation required |
| Hold deviation | **Baseline-aware** (`rpc_get_anomaly_alerts`) | Relative deviation required |
| Cash observation spike | **Static threshold** (`rpc_shift_cash_obs_alerts`) | Existing, functional, authoritative. Baselines are precomputed and stored for validation and future cutover, but no baseline-aware anomaly evaluation runs for this family during MVP. |
| Promotional issuance spike | **Deferred** | Source RPC not yet available; `win_loss_cents` substituted for this metric type (see Appendix A) |

The existing `rpc_shift_cash_obs_alerts` is not modified. When baseline coverage for cash observations is established and validated, the static-threshold RPC can be deprecated in a future phase.

### 4.2 Out of Scope

- Alert persistence / state machine table (Phase C-2)
- Alert deduplication or cooldown windows (Phase C-2)
- Slack / email / webhook notifications (Phase C-3)
- Automatic scheduled recomputation (pg_cron — Phase C-3)
- New top-level UI surfaces or pages (limited augmentation of existing `/admin/alerts` and `/admin/settings` pages IS in scope — see §6 UX flows for readiness state indicators, degraded-coverage display, and recompute trigger)
- Per-table baseline configuration overrides
- ML/regression anomaly models
- Company-scoped or cross-property baselines

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1:** `rpc_compute_rolling_baseline()` computes median and scaled MAD (x1.4826) for each (table, metric) pair over the most recent N gaming days (configured by `window_days`)
- **FR-2:** Computation respects gaming day boundaries (TEMP-001) using `compute_gaming_day()`, not calendar days
- **FR-3:** Baselines are UPSERT'd: recomputing the same gaming day replaces the prior baseline
- **FR-4:** `rpc_get_anomaly_alerts()` compares current-shift observed values against stored baselines and returns anomaly flags with deviation scores
- **FR-5:** Alerts include severity classification: info (>2 MAD), warn (>3 MAD), critical (>4 MAD)
- **FR-6:** Alerts include direction (`above` or `below` baseline) and raw baseline context (median, MAD, sample count)
- **FR-7:** Each table/metric pair in the alert response includes `readiness_state` enum (`ready` | `stale` | `missing` | `insufficient_data`). When `sample_count < min_history_days`, state is `insufficient_data`. When no current-day baseline exists, state is `stale` (older exists) or `missing` (none exists). (`compute_failed` deferred to Phase C-2 — requires error persistence column. In MVP, failed computations surface as `missing`.)
- **FR-8:** When MAD = 0, fall back to percentage-based deviation using `fallback_percent` from threshold config
- **FR-9:** `casino_settings.alert_thresholds.baseline` config (`window_days`, `method`, `min_history_days`) is consumed and controls computation
- **FR-10:** Create new RPC `rpc_get_anomaly_alerts()` — do NOT modify existing `rpc_shift_cash_obs_alerts()` (coexist)
- **FR-11:** Adaptive anomaly evaluation runs ONLY for baselines with `readiness_state = 'ready'`. All other states (`stale`, `missing`, `insufficient_data`) return the readiness indicator without anomaly flags (fail-closed per ADR-046 §9)
- **FR-12:** Alert family authority per ADR-046: drop and hold anomalies use baseline-aware detection; cash observation spikes remain under static-threshold authority (`rpc_shift_cash_obs_alerts`); promotional issuance deferred
- **FR-13:** Current gaming day is excluded from the historical baseline window. Only completed prior gaming days contribute to the rolling median (ADR-046 Canonical Metric Contracts)
- **FR-14:** Gaming days with no table session or `telemetry_quality = 'NONE'` are excluded from the baseline computation window. They do not count toward `sample_count` (ADR-046 Canonical Metric Contracts)
- **FR-15:** Per-metric-type anomaly evaluation rules:
  - `drop_total`: Median+MAD method. Anomaly when `|observed - median| > mad_multiplier * scaled_mad`. Threshold from `alert_thresholds.drop_anomaly.mad_multiplier` (deployed: `3`). Severity per Appendix B.
  - `hold_percent`: **Range-bound method, not MAD.** Baselines (median, MAD) are computed and stored, but anomaly evaluation uses the deployed `hold_deviation` policy: anomaly when `observed < extreme_low` OR `observed > extreme_high` OR `|observed - median| > deviation_pp` percentage points. Threshold from `alert_thresholds.hold_deviation` (`deviation_pp: 10`, `extreme_low: -5`, `extreme_high: 40`). Severity: `extreme_low`/`extreme_high` breach = `critical`; `deviation_pp` breach = `warn`.
  - `cash_obs_total`: Baselines precomputed and stored for validation and future cutover. Anomaly authority remains with static-threshold `rpc_shift_cash_obs_alerts` during MVP. No baseline-aware anomaly evaluation runs for this metric type.
  - `win_loss_cents`: Median+MAD method. Same formula as `drop_total`. Threshold from `alert_thresholds.promo_issuance_spike.mad_multiplier` (deployed: `3`) as interim default.
- **FR-16:** `rpc_compute_rolling_baseline()` excludes rows where `hold_percent` would require division by zero (`estimated_drop_buyins_cents = 0`). Such days are excluded from the hold_percent baseline window.

### 5.2 Non-Functional Requirements

- **NFR-1:** Anomaly alert read path completes within 200ms (pre-computed baselines, single SELECT + one live RPC)
- **NFR-2:** Baseline computation for entire casino floor (~50 tables x 4 metrics) completes within 10 seconds
- **NFR-3:** `table_metric_baseline` RLS enforces casino isolation (Pattern C hybrid — ADR-015/020)
- **NFR-4:** `rpc_compute_rolling_baseline()` is SECURITY DEFINER with `set_rls_context_from_staff()` and explicit `WHERE casino_id` on all cross-context reads (SEC Note T5/C4)
- **NFR-5:** Both RPCs have REVOKE PUBLIC; GRANT to `authenticated` and `service_role` only
- **NFR-6:** `computed_by` derived from `app.actor_id` session context — no spoofable parameter (ADR-024 INV-8)

> Architecture details: See RFC-004, ADR-046, SRM (ShiftIntelligenceService registration pending)

---

## 6. UX / Flow Overview

**Flow 1: Admin Triggers Baseline Computation**
1. Admin navigates to shift dashboard or admin settings
2. Admin clicks "Recompute Baselines" (or computation triggers automatically at shift start — future)
3. System calls `POST /api/shift-intelligence/compute-baselines`
4. RPC computes median+MAD for all tables across 7 prior gaming days
5. Results stored in `table_metric_baseline` via UPSERT
6. Response shows: tables processed, metrics computed, gaming day

**Flow 2: Pit Boss Views Anomaly Alerts**
1. Shift dashboard loads (or refetches every 30s)
2. Dashboard calls `GET /api/shift-intelligence/anomaly-alerts?window_start=...&window_end=...`
3. RPC reads stored baselines + live shift metrics
4. RPC returns anomaly alerts with severity, deviation score, direction, baseline context
5. Dashboard renders alerts alongside existing static-threshold alerts
6. Tables with insufficient baseline data show "Insufficient data" indicator

**Flow 3: Sparse Data / New Table (Unhappy Path)**
1. New table opened 2 days ago (< `min_history_days` = 3)
2. Baseline computation runs — stores baseline with `sample_count: 2`
3. Anomaly alert RPC checks `sample_count < min_history_days` → returns `readiness_state: 'insufficient_data'`
4. Dashboard shows "Baseline building (2/3 days)" instead of anomaly alert

**Flow 4: Stale/Missing Baseline (Unhappy Path — Fail-Closed)**
1. Admin has not triggered baseline recomputation for current gaming day
2. Dashboard calls anomaly alerts RPC
3. RPC finds no current-day baseline for Table 7 → returns `readiness_state: 'stale'` (older baseline exists) with `baseline_gaming_day` showing last computation date
4. Dashboard shows "Baseline stale (last: Mar 21)" — no anomaly evaluation runs
5. For Table 12 (never computed) → returns `readiness_state: 'missing'` → "No baseline available"
6. Operator sees degraded coverage count in `baseline_coverage` response field

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **`rpc_shift_table_metrics`** — Source of per-shift drop/hold/win-loss data (implemented)
- **`rpc_shift_cash_obs_table`** — Source of per-shift cash observation aggregates (implemented)
- **`casino_settings.alert_thresholds.baseline`** — Baseline configuration (implemented, unread)
- **`compute_gaming_day()`** — Gaming day boundary function (implemented, TEMP-001)
- **`casino_settings.gaming_day_start_time` + `timezone`** — Gaming day parameters (implemented)
- **SRM update** — Register ShiftIntelligenceService as new bounded context (required, not yet done)

### 7.2 Risks & Open Questions

- **DST timezone transitions** — Gaming day boundary may shift during DST. Mitigation: `compute_gaming_day()` handles this via `AT TIME ZONE` + `casino_settings.timezone`. Test with DST transition dates.
- **Stale baselines** — If admin doesn't trigger recomputation, baselines become stale. Mitigation: Alert response includes `readiness_state: 'stale'` and `baseline_gaming_day` so consumers see explicit degradation. Anomaly evaluation does NOT run for stale baselines (fail-closed per ADR-046 §9). Automatic scheduling is Phase C-3.
- **Performance of historical aggregation** — 7-day lookback across ~50 tables queries substantial data. Mitigation: Benchmark early; index `(casino_id, gaming_day DESC)` on `table_metric_baseline` covers read pattern.
- **Existing `rpc_shift_cash_obs_alerts` transition** — Both alert systems coexist with explicit authority boundaries (see §4.1 Alert Family Authority). Cash observation spike authority stays with static thresholds during MVP. New endpoint is additive; existing RPC unchanged.
- **Phase C-2 forward-compatibility** — UPSERT key `(casino_id, table_id, metric_type, gaming_day)` and RPC interface are designed to accommodate Phase C-2 evolution to immutable baselines (versioned rows or `baseline_run` parent table) per ADR-046 §3. No constraints in this MVP that would require destructive schema changes for Phase C-2.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `rpc_compute_rolling_baseline()` computes median+MAD for all 4 metric types across configurable gaming day window
- [ ] `rpc_get_anomaly_alerts()` returns anomaly flags with severity, deviation score, direction, and baseline context
- [ ] Readiness state model: `ready` baselines produce anomaly evaluation; `stale`, `missing`, `insufficient_data` do not (fail-closed)
- [ ] MAD = 0 falls back to percentage-based deviation
- [ ] `casino_settings.alert_thresholds.baseline` config is consumed and controls computation
- [ ] Current gaming day excluded from baseline computation window (only completed prior days)
- [ ] Partial/telemetry-deficient gaming days excluded from baseline window
- [ ] Alert family authority respected: cash obs uses static threshold, drop/hold/win_loss use baseline-aware, promo deferred
- [ ] Hold anomaly evaluation uses range-bound formula (`deviation_pp` / `extreme_low` / `extreme_high`), not MAD multiplier

**Data & Integrity**
- [ ] `table_metric_baseline` UPSERT is idempotent: recomputing the same gaming day replaces prior row
- [ ] No orphaned baselines (casino_id + table_id FK constraints enforced)
- [ ] `computed_by` + `computed_at` correctly recorded on every computation

**Security & Access**
- [ ] `table_metric_baseline` RLS enforces casino isolation (Pattern C hybrid)
- [ ] `rpc_compute_rolling_baseline()` is SECURITY DEFINER with `set_rls_context_from_staff()` and manual `WHERE casino_id` on all cross-context reads
- [ ] Both RPCs have REVOKE PUBLIC
- [ ] No spoofable `p_actor_id` or `p_casino_id` parameters (ADR-024 INV-8)
- [ ] DELETE denial policy on `table_metric_baseline`

**Testing**
- [ ] Unit tests for median+MAD computation (including MAD=0 edge case)
- [ ] Unit test: hold_percent excludes days with zero drop (division-by-zero guard)
- [ ] Integration test: two-casino isolation (Casino A cannot read Casino B baselines)
- [ ] Integration test: readiness state model — test all 4 states (`ready`, `stale`, `missing`, `insufficient_data`)
- [ ] Integration test: current-day exclusion — baseline for today's gaming day does not include today's data
- [ ] Integration test: UPSERT idempotency — recomputing same gaming day produces identical result
- [ ] Contract test: `rpc_compute_rolling_baseline()` returns expected summary shape
- [ ] Contract test: `rpc_get_anomaly_alerts()` returns expected alert shape with `readiness_state`
- [ ] Route handler test: role gate denies cashier/dealer access
- [ ] Route handler test: negative deviation direction (below baseline) correctly flagged

**Operational Readiness**
- [ ] Computation RPC returns execution summary (tables_processed, metrics_computed)
- [ ] Alert response includes `baseline_coverage` (tables with/without baseline)
- [ ] Rollback: table can be dropped without affecting existing `rpc_shift_cash_obs_alerts`

**Configuration**
- [ ] All config key paths in Appendix A verified against deployed `casino_settings.alert_thresholds` default JSON
- [ ] Per-metric threshold source resolves to non-null value for all 4 metric types

**Documentation**
- [ ] SRM updated: ShiftIntelligenceService registered under Operational category
- [ ] Known limitation: manual recomputation only (no scheduler for MVP)

---

## 9. Related Documents

- **Vision / Strategy**: `docs/00-vision/strategic-hardening/HARDENING_REPORT_2026-03-23.md` (Phase C-1)
- **Feature Boundary**: `docs/20-architecture/specs/shift-baseline-service/FEATURE_BOUNDARY.md`
- **Feature Scaffold**: `docs/01-scaffolds/SCAFFOLD-004-shift-baseline-service.md`
- **Design Brief / RFC**: `docs/02-design/RFC-004-shift-baseline-service.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (update pending)
- **ADR**: `docs/80-adrs/ADR-046-shift-baseline-stored-computation.md`
- **Security / SEC Note**: `docs/20-architecture/specs/shift-baseline-service/SEC_NOTE.md`
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Temporal**: `docs/20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md`
- **Schema / Types**: `types/database.types.ts`
- **Existing Alerts RPC**: `supabase/migrations/20260107020746_shift_cash_obs_alerts.sql`
- **Existing Threshold Config**: `supabase/migrations/20260106235906_alert_thresholds_settings.sql`

---

## Appendix A: Metric Types

| `metric_type` | Source RPC | Derivation | Threshold Source |
|---------------|-----------|------------|------------------|
| `drop_total` | `rpc_shift_table_metrics` | `estimated_drop_buyins_cents` per shift window | `alert_thresholds.drop_anomaly.mad_multiplier` (deployed: `3`) |
| `hold_percent` | `rpc_shift_table_metrics` | `win_loss_inventory_cents / estimated_drop_buyins_cents * 100` (excludes days with zero drop) | `alert_thresholds.hold_deviation.deviation_pp` / `extreme_low` / `extreme_high` (deployed: `10` / `-5` / `40`) |
| `cash_obs_total` | `rpc_shift_cash_obs_table` | `cash_out_observed_estimate_total` per shift | Baseline computed and stored; anomaly authority remains with static threshold (`rpc_shift_cash_obs_alerts`) during MVP. Uses `alert_thresholds.drop_anomaly.mad_multiplier` as default for future baseline-aware evaluation. |
| `win_loss_cents` | `rpc_shift_table_metrics` | `win_loss_inventory_cents` (direct) | `alert_thresholds.promo_issuance_spike.mad_multiplier` as default (deployed: `3`). Dedicated `win_loss` config category deferred. |

> **Metric type evolution note:** SCAFFOLD-004 listed `promo_issuance_total` as a candidate metric. During RFC-004 design, this was replaced with `win_loss_cents` because the promotional issuance source RPC (`rpc_shift_promo_issuance_table`) does not yet exist. `promo_issuance_total` is deferred until the source RPC is available. ADR-046 Alert Family Authority table marks promotional issuance spike as "Deferred" accordingly.

## Appendix B: Anomaly Evaluation Methods

### Method 1: Median+MAD (used by `drop_total`, `win_loss_cents`)

**Median:** Middle value of sorted series. Robust to outliers (unlike mean).

**MAD (Median Absolute Deviation):** `median(|Xi - median(X)|)`

**Scaled MAD:** `MAD * 1.4826` — consistency constant for normal distribution equivalence. Stored pre-scaled in `mad_value`.

**Anomaly threshold:** `observed > median + (mad_multiplier * scaled_mad)` OR `observed < median - (mad_multiplier * scaled_mad)`

**Severity mapping:**

| Deviation | Severity |
|-----------|----------|
| > 2 MAD | `info` |
| > 3 MAD | `warn` |
| > 4 MAD | `critical` |

### Method 2: Range-Bound (used by `hold_percent`)

Hold percentage uses a policy-bound evaluation model, not the MAD multiplier formula. Baselines (median, MAD) are still computed and stored for context, but anomaly flags use the deployed `hold_deviation` config:

**Anomaly rules (evaluated in order):**
1. `observed < extreme_low` → `critical` (deployed: `-5`)
2. `observed > extreme_high` → `critical` (deployed: `40`)
3. `|observed - median| > deviation_pp` → `warn` (deployed: `10` percentage points)
4. None of the above → no anomaly

**Rationale:** Hold percentage has natural policy boundaries (negative hold is always suspect; hold above 40% is extreme). These are domain-specific invariants that MAD-based deviation cannot model well — a table with consistently 2% hold has a tiny MAD, and a 4% hold day would trigger a MAD-based alert despite being operationally normal.

### Method 3: No Evaluation (used by `cash_obs_total` during MVP)

Baselines are computed and stored for validation and future cutover. No baseline-aware anomaly evaluation runs. Authority remains with static-threshold `rpc_shift_cash_obs_alerts`.

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-03-23 | Engineering | Initial draft from feature pipeline Phase 5 |
| 0.2.0 | 2026-03-23 | Engineering | DA review patch: align with ADR-046 post-patch (readiness states, fail-closed semantics, alert family authority, current-day exclusion, partial-day exclusion, metric type reconciliation, threshold source mapping, Phase C-2 forward-compat, expanded DoD) |
| 0.2.1 | 2026-03-23 | Engineering | DA re-review gate fixes: correct Appendix A config key paths to match deployed schema, add config verification DoD gate, align ADR-046 authority table (promo→Deferred, cash_obs→authoritative) |
| 0.3.0 | 2026-03-23 | Engineering | Human review corrections: (1) restore compute_failed as explicit readiness state, (2) admit minimal UI augmentation in scope, (3) remove promo issuance overclaim from overview/problem, (4) freeze hold anomaly formula as range-bound (not MAD), (5) clarify cash_obs precomputation framing |
| 0.4.0 | 2026-03-23 | Engineering | EXEC-055 approval gate amendment: (1) compute_failed deferred to Phase C-2 — 4-state readiness model for MVP (ready/stale/missing/insufficient_data), ADR-046 §8 amended accordingly, (2) FR-7/FR-11/DoD scrubbed to remove all 5-state references |

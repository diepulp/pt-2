---
id: RFC-004
title: "Design Brief: Shift Baseline Service (Rolling Median+MAD)"
owner: engineering
status: Draft
date: 2026-03-23
affects: [TableContextService, RatingSlipService, CasinoService, ShiftIntelligenceService]
---

# Design Brief / RFC: Shift Baseline Service (Rolling Median+MAD)

> Purpose: propose direction and alternatives with tradeoffs before anyone writes a PRD.
> Structure: funnel style (context -> scope -> overview -> details -> cross-cutting -> alternatives).

## 1) Context

### Problem

PT-2's shift intelligence system detects cash observation spikes via `rpc_shift_cash_obs_alerts`, which compares current-shift totals against **static thresholds** stored in `casino_settings.alert_thresholds`. This produces coarse alerts: a $6,000 cash-out at a high-limit table fires the same alert as $6,000 at a $5-minimum table.

Without statistical baselines, the system cannot distinguish between "normal for this table" and "anomalous." Drop, hold, and promotional issuance anomalies are entirely blocked — they require relative deviation detection, not absolute thresholds.

### Forces / Constraints

- The `casino_settings.alert_thresholds.baseline` config (`window_days: 7`, `method: "median_mad"`, `min_history_days: 3`) is already deployed and admin-configurable, but **nothing reads it**.
- Existing RPCs (`rpc_shift_table_metrics`, `rpc_shift_cash_obs_table`) compute per-shift aggregates but provide no rolling historical context.
- The shift dashboard refetches every 30 seconds. Baseline computation must not degrade dashboard latency.
- Gaming day boundaries (TEMP-001) use `compute_gaming_day()` — a deployed, canonical function.

### Prior Art

- `rpc_shift_cash_obs_alerts` — static threshold comparison pattern (the thing we're improving)
- `measurement_rating_coverage_v`, `measurement_audit_event_correlation_v` — cross-context read models (ADR-039 pattern). Baselines follow a similar cross-context read pattern but with writes.
- `loyalty_valuation_policy` / `loyalty_liability_snapshot` — precedent for a casino-scoped computed table with periodic recomputation (similar lifecycle to baselines).

## 2) Scope & Goals

- **In scope:**
  - `table_metric_baseline` table (new) — stores per-table, per-metric, per-gaming-day baselines
  - `rpc_compute_rolling_baseline()` — computes and stores baselines for a casino's tables
  - `rpc_get_anomaly_alerts()` — reads current shift metrics + stored baselines, returns anomaly flags
  - Service layer: `services/shift-intelligence/` with DTOs, mappers, schemas
  - API route: `/api/shift-intelligence/anomaly-alerts` for dashboard consumption
  - RLS policies on `table_metric_baseline` (casino-scoped Pattern C)
  - Integration: wire drop anomaly detection to baselines + configurable `mad_multiplier`

- **Out of scope:**
  - Alert persistence (Phase C-2)
  - Alert deduplication/throttling (Phase C-2)
  - External notifications (Phase C-3)
  - UI changes (existing `/admin/alerts` page already renders alert RPCs)
  - Per-table baseline overrides
  - ML-based anomaly detection

- **Success criteria:**
  - Anomaly alerts fire when a table's current-shift metric deviates beyond `mad_multiplier * MAD` from its rolling median
  - Dashboard load with baseline-aware alerts completes within 200ms (read path only — baselines pre-computed)
  - Sparse data produces `insufficient_data` flag instead of false alerts
  - `casino_settings.alert_thresholds.baseline` config is consumed and controls computation parameters

## 3) Proposed Direction (overview)

**Option B: Stored Baselines.** Baselines are computed once per gaming day (on demand or at shift close) and stored in `table_metric_baseline`. The anomaly alert RPC reads pre-computed baselines and compares against current-shift values. This separates the expensive computation (median+MAD over 7 gaming days of data) from the latency-sensitive read path (dashboard refetch).

The computation RPC (`rpc_compute_rolling_baseline`) is SECURITY DEFINER — it reads cross-context tables (drops, cash obs, rating slips) under `service_role` after validating actor context via `set_rls_context_from_staff()`. The read RPC (`rpc_get_anomaly_alerts`) is SECURITY INVOKER — it reads `table_metric_baseline` under the caller's RLS context.

## 4) Detailed Design

### 4.1 Data Model Changes

#### New Table: `table_metric_baseline`

```
table_metric_baseline
├── id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
├── casino_id       uuid NOT NULL REFERENCES casino(id)
├── table_id        uuid NOT NULL REFERENCES gaming_table(id)
├── metric_type     text NOT NULL  -- 'drop_total' | 'hold_percent' | 'cash_obs_total' | 'win_loss_cents'
├── gaming_day      date NOT NULL  -- the day this baseline was computed FOR (i.e., "baseline as of this day")
├── window_days     int NOT NULL   -- config at time of computation (audit trail)
├── median_value    numeric NOT NULL
├── mad_value       numeric NOT NULL  -- MAD * 1.4826 (scaled)
├── sample_count    int NOT NULL      -- number of gaming days with data in the window
├── min_value       numeric           -- min observed in window (context)
├── max_value       numeric           -- max observed in window (context)
├── computed_at     timestamptz NOT NULL DEFAULT now()
├── computed_by     uuid REFERENCES staff(id) -- actor who triggered computation
├── UNIQUE (casino_id, table_id, metric_type, gaming_day)
└── INDEX idx_baseline_casino_day (casino_id, gaming_day DESC)
```

**Key invariants:**
- One baseline row per (casino, table, metric, gaming_day) — UPSERT on recomputation
- `window_days` recorded at computation time for reproducibility
- `mad_value` stores the **scaled** MAD (multiplied by 1.4826) so consumers don't need to re-scale
- `sample_count` enables consumers to assess data sufficiency without re-querying

#### Metric Types (enum candidates)

| `metric_type` | Source | Derivation |
|---------------|--------|------------|
| `drop_total` | `rpc_shift_table_metrics.estimated_drop_buyins_cents` | Sum of estimated drop per shift window |
| `hold_percent` | Computed: `win_loss_inventory_cents / estimated_drop_buyins_cents * 100` | Requires both values non-null |
| `cash_obs_total` | `rpc_shift_cash_obs_table.cash_out_observed_estimate_total` | Sum of observed cash-outs per shift |
| `win_loss_cents` | `rpc_shift_table_metrics.win_loss_inventory_cents` | Direct from inventory computation |

### 4.2 Service Layer

New bounded context: `services/shift-intelligence/`

```
services/shift-intelligence/
├── dtos.ts          # BaselineDTO, AnomalyAlertDTO, BaselineComputeResultDTO
├── schemas.ts       # Zod: anomalyAlertsQuerySchema, computeBaselineInputSchema
├── keys.ts          # React Query key factory: shiftIntelligenceKeys
├── mappers.ts       # Row → BaselineDTO, anomaly computation logic
├── baseline.ts      # Baseline CRUD: getBaselines(), computeBaselines()
├── anomaly.ts       # Anomaly detection: detectAnomalies()
├── http.ts          # ServiceHttpResult wrappers
└── index.ts         # createShiftIntelligenceService() factory
```

**DTO contracts:**

```typescript
// BaselineDTO — published contract for dashboard consumption
interface BaselineDTO {
  tableId: string;
  tableLabel: string;
  metricType: 'drop_total' | 'hold_percent' | 'cash_obs_total' | 'win_loss_cents';
  gamingDay: string;         // ISO date
  medianValue: number;
  madValue: number;          // scaled MAD
  sampleCount: number;
  minValue: number | null;
  maxValue: number | null;
  computedAt: string;        // ISO timestamp
}

// AnomalyAlertDTO — anomaly detection result
interface AnomalyAlertDTO {
  tableId: string;
  tableLabel: string;
  metricType: string;
  observedValue: number;
  baselineMedian: number;
  baselineMad: number;
  deviationScore: number;    // (observed - median) / mad
  isAnomaly: boolean;
  severity: 'info' | 'warn' | 'critical';
  direction: 'above' | 'below';
  readinessState: 'ready' | 'stale' | 'missing' | 'insufficient_data' | 'compute_failed'; // ADR-046 §8
  threshold: number;         // mad_multiplier from config (for context)
  message: string;
}
```

### 4.3 API Surface

#### `POST /api/shift-intelligence/compute-baselines`

Triggers baseline computation for the caller's casino. Role-gated: `pit_boss` or `admin`.

```typescript
// Input
{ gaming_day?: string }  // defaults to current gaming day

// Output (ServiceHttpResult)
{
  data: {
    computed_count: number;
    gaming_day: string;
    tables_processed: number;
    metrics_per_table: number;
  }
}
```

#### `GET /api/shift-intelligence/anomaly-alerts?window_start=...&window_end=...`

Returns anomaly alerts for the current shift window, comparing live metrics against stored baselines. Role-gated: `pit_boss` or `admin`.

```typescript
// Output (ServiceHttpResult)
{
  data: {
    alerts: AnomalyAlertDTO[];
    baseline_gaming_day: string;       // which baseline was used
    baseline_coverage: {
      tables_with_baseline: number;
      tables_without_baseline: number; // insufficient data
    };
  }
}
```

### 4.4 UI/UX Flow

No new UI surfaces. The existing `/admin/alerts` page calls the alerts RPC. The transition plan:

1. New `rpc_get_anomaly_alerts` returns baseline-aware alerts
2. Existing `rpc_shift_cash_obs_alerts` remains operational (static thresholds)
3. Dashboard integrates the new endpoint alongside or replacing the existing one
4. UI already renders `alert_type`, `severity`, `message`, `observed_value`, `threshold` — the new RPC returns the same shape with richer context

### 4.5 Security Considerations

- **RLS**: `table_metric_baseline` gets Pattern C hybrid RLS (casino-scoped, `COALESCE(current_setting('app.casino_id'), jwt.app_metadata.casino_id)`)
- **Compute RPC**: SECURITY DEFINER per ADR-018. Calls `set_rls_context_from_staff()` for actor/casino derivation. Reads cross-context tables under elevated privilege, writes only to owned `table_metric_baseline`.
- **Read RPC**: SECURITY INVOKER. Caller's Pattern C RLS restricts to their casino.
- **RBAC**: Both RPCs require `pit_boss` or `admin` role. Floor operators can view alerts via the dashboard but cannot trigger recomputation.
- **Audit**: `computed_by` column on `table_metric_baseline` records who triggered the computation. No `audit_log` entry needed (baselines are derived, not business-critical mutations).
- **REVOKE PUBLIC**: Both new RPCs. Grant to `authenticated` and `service_role` only.

## 5) Cross-Cutting Concerns

### Performance

- **Write path (computation):** Queries 7 gaming days of shift metrics for ~50 tables. Expected: 1-5s per casino. Runs once per gaming day, not on every dashboard load.
- **Read path (alerts):** Single SELECT from `table_metric_baseline` + one call to live shift metrics RPC. Expected: <200ms.
- **Indexes:** `(casino_id, gaming_day DESC)` covers the read pattern. `UNIQUE (casino_id, table_id, metric_type, gaming_day)` supports UPSERT.

### Migration Strategy

1. Create `table_metric_baseline` table with RLS policies
2. Create `rpc_compute_rolling_baseline()` SECURITY DEFINER
3. Create `rpc_get_anomaly_alerts()` SECURITY INVOKER
4. Wire `/api/shift-intelligence/anomaly-alerts` route handler
5. No data migration — table starts empty, baselines accumulate from first computation

### Observability

- Computation RPC logs: `tables_processed`, `metrics_computed`, `execution_time_ms` to structured log
- Anomaly alerts include `baseline_coverage` stats so operators know how many tables have sufficient data
- `insufficient_data` flag on individual alerts prevents false confidence

### Rollback Plan

- Table `table_metric_baseline` can be dropped without affecting any existing functionality
- Existing `rpc_shift_cash_obs_alerts` remains operational throughout — no destructive changes to existing RPCs
- Feature can be toggled off by simply not calling the new endpoints

## 6) Alternatives Considered

### Alternative A: On-Demand Computation (No Storage)

- **Description:** Compute median+MAD on every alert RPC call. No `table_metric_baseline` table.
- **Tradeoffs:** Simpler schema (no new table, no RLS policies). But median computation requires sorting 7 days of data per table per metric — O(n log n) per metric. For 50 tables x 4 metrics = 200 sorts per dashboard load. Combined with 30-second refetch interval, this is 400+ sorts per minute.
- **Why not chosen:** Performance risk is too high. Dashboard SLO is 200ms for alert reads. On-demand computation would require 1-5s (the same time as the batch computation), turning every dashboard refetch into a multi-second operation. Also blocks Phase C-2: alert persistence needs a stable baseline reference, which on-demand computation cannot provide (the baseline changes with every call as the window slides).

### Alternative B: Hybrid (Compute + Cache with TTL)

- **Description:** First dashboard load computes and stores baselines with a TTL. Subsequent loads read cached baselines until TTL expires.
- **Tradeoffs:** Fresh-on-first-access is appealing, but introduces cache invalidation complexity, race conditions on concurrent first-access, and partial-cache states where some tables have baselines and others don't.
- **Why not chosen:** Over-engineered for the use case. Gaming day boundaries provide a natural recomputation cadence — baselines should be recomputed once per gaming day, not on arbitrary TTL expiry. The materialized approach (chosen) achieves the same outcome with simpler invariants.

### Alternative C: PostgreSQL Materialized View

- **Description:** Use `CREATE MATERIALIZED VIEW` with `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
- **Tradeoffs:** PostgreSQL-native, no custom table management. But materialized views can't store per-computation metadata (`computed_by`, `window_days` at time of computation). `REFRESH CONCURRENTLY` requires a unique index and takes a full table lock during refresh. No UPSERT semantics — full recomputation every time.
- **Why not chosen:** Lacks audit metadata (`computed_by`), can't do incremental updates (always full refresh), and the lock behavior is problematic for concurrent dashboard reads during refresh.

## 7) Decisions Required

1. **Decision:** Baseline storage strategy
   **Options:** On-demand (A) | Stored/materialized (B) | Hybrid cache (C) | Materialized view (D)
   **Recommendation:** **Option B — Stored baselines in `table_metric_baseline`**
   **Rationale:** Separates expensive computation from latency-sensitive reads. Natural recomputation at gaming day boundaries. Enables Phase C-2 alert persistence to reference exact baselines. Simplest cache invalidation model (date-based, not TTL).
   **ADR-worthy:** Yes — this is a durable architectural decision about how PT-2 handles statistical computation. → **ADR-046**

2. **Decision:** New RPC vs. extending existing `rpc_shift_cash_obs_alerts`
   **Options:** Extend existing | Create parallel `rpc_get_anomaly_alerts`
   **Recommendation:** **Create new `rpc_get_anomaly_alerts`** — the existing RPC has a narrow contract (cash obs only, static thresholds). The new RPC covers all metric types with baseline context. The old RPC remains as a fallback.
   **ADR-worthy:** No — this is an implementation detail, not a durable decision. Document in PRD.

3. **Decision:** Recomputation trigger mechanism
   **Options:** Manual (RPC call) | Automatic (pg_cron / external scheduler) | On table-session close
   **Recommendation:** **Manual via RPC for MVP.** Automatic scheduling is Phase C-3 scope. The RPC can be called by the admin UI or by a future scheduler without changing the interface.
   **ADR-worthy:** No — manual-first is the default PT-2 pattern. Scheduler is additive.

## 8) Open Questions

- **Q1:** Should `rpc_compute_rolling_baseline` compute baselines for ALL tables in a casino, or accept an optional `p_table_id` filter for single-table recomputation? **Recommendation:** All tables (casino-wide), with optional `p_table_id` for targeted recomputation during testing.
- **Q2:** Should the anomaly alert response include the raw baseline data (median, MAD, sample count) alongside the alert, or should baseline data be a separate endpoint? **Recommendation:** Include in alert response — the dashboard needs context to display meaningful alerts.
- **Q3:** When a table has data for fewer than `min_history_days` days, should the system fall back to the static thresholds from `alert_thresholds` config, or simply return `insufficient_data` with no alert? **Recommendation:** Return `insufficient_data` flag. Let the dashboard decide whether to show static-threshold alerts as a fallback.

## Links

- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-004-shift-baseline-service.md`
- Feature Boundary: `docs/20-architecture/specs/shift-baseline-service/FEATURE_BOUNDARY.md`
- Hardening Report: `docs/00-vision/strategic-hardening/HARDENING_REPORT_2026-03-23.md`
- ADR(s): ADR-046 (pending — baseline storage strategy)
- PRD: (pending Phase 5)

## References

- TEMP-001: Gaming Day Specification (`docs/20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md`)
- ADR-018: SECURITY DEFINER Governance (`docs/80-adrs/ADR-018-security-definer-governance.md`)
- ADR-024: Authoritative Context Derivation (`docs/80-adrs/ADR-024-authoritative-context-derivation.md`)
- ADR-039: Measurement Layer (`docs/80-adrs/ADR-039-measurement-layer.md`)
- Existing: `rpc_shift_cash_obs_alerts` (migration `20260107020746`)
- Existing: `rpc_shift_table_metrics` (migration `20260114004336`)
- Existing: `casino_settings.alert_thresholds` (migration `20260106235906`)

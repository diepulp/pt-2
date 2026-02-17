---
title: "PRD - Shift Dashboards & Shift Reports (v0.2)"
status: draft
owner: CasinoService / TableContext (SRM-aligned)
stakeholders:
  - pit_supervisor
  - pit_boss
  - shift_manager
  - compliance_officer
  - finance_controller
  - executive_summary_consumer
created: 2026-01-02
---

## 0.1 Related artifacts (canonical)

- (SHIFT_METRICS_CATALOG_v0_PATH_B)[`docs/00-vision/loyalty-service-extension/SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md`] — canonical metric definitions, grains, formulas, required fact model, and SP contracts.
- (SHIFT DASHBOARDS ALERT THRESHOLDS)[`docs/00-vision/loyalty-service-extension/SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md`] - Operational alerts for PT-2 Shift Dashboards
  - This PRD references the catalog; **when they conflict, the catalog wins**.


## 1. Problem statement

Shift reporting in table-game operations is typically a mix of:
- deterministic facts (drop, win, hold, theo, opens/closes, fills/credits, occupancy, pace)
- exceptions (variance, idle tables, missed rotations, late closes, threshold crossings)
- narrative context (why a number moved, what actions were taken, what needs follow-up)

PT‑2 needs a **shift dashboard** (live/near-real-time) and **shift report** (generated on demand) that expose authoritative operational facts via **SQL + stored procedures (SPs)**, so stakeholders can access them ad‑hoc and so downstream automation (incl. future LLM enrichment) has a clean, reliable payload.

## 2. Goals

### Primary goals
1. Provide **authoritative shift metrics** for tables/pits/casino with deterministic formulas and transparent provenance.
2. Provide **rule-based alerts** (thresholds + operational misses) with explicit logic and rationale.
3. Provide **trend baselines** (simple time-series baselines) to enable “what changed?” insights without AI.
4. Provide a **single queryable shift payload** suitable for dashboards, exports, and future enrichment.

### Success criteria (v0)
- A supervisor can answer in <30 seconds:
  - “Which tables drove win/theo?”
  - “Which tables were underutilized or idle too long?”
  - “Did we miss rotations / have late closes?”
  - “Any compliance thresholds crossed?”
- Shift report is **consistent, reproducible**, and can be regenerated and match prior outputs for the same time window.

## 3. Non-goals (v0)

- Predictive models, personalization, marketing segmentation, or automated comps.
- Freeform “chat” interface.
- Complex anomaly detection beyond simple baselines (moving average + z-score) and rule alerts.
- Cross-property enterprise reporting.

## 4. Users & stakeholders

- **Pit Supervisor / Pit Boss:** operational control, staffing, table opens, pace, occupancy, exceptions.
- **Finance Controller:** drop/win/hold, fills/credits reconciliation, variances.
- **Compliance / Title 31:** threshold monitoring and auditability (reporting triggers, cash-in/out aggregation rules).
- **Executives:** concise top-level KPIs and exceptions.

## 5. Scope

### In scope
- Shift dashboards (table/pit/casino lens)
- Shift reports (structured sections + drilldowns)
- Stored procedures that produce **typed rollups** + **alert rows**
- Basic baselines (per table and per pit)
- Exportable data payload (JSON or tabular)

### Out of scope
- ML/LLM generation
- “Action execution” (system remains advisory)

## 6. Domain definitions (operational semantics)

These definitions align with common casino analytics terminology:
- **Drop**: cash-equivalent buy-in value (cash/marker/etc.) exchanged for chips at the table; excludes promotional instruments (match play / promo chips), which are tracked as promo exposure.
- **Win**: casino win for the table over the window (accounting-derived; supports hold and comparisons).
- **Hold %**: `Win / Drop` (table games hold differs conceptually from house edge). 
- **Handle**: total wagers; for table games often estimated from rating: `Avg Bet × Decisions/Hour × Hours` (or captured where available). 
- **Theoretical Win (Theo)**: expected win derived from `Avg Bet × Decisions/Hour × Hours × House Advantage`. 
- **Game Pace / Decisions per Hour**: pace KPI used in table yield management. citeturn1search12turn1search8
- **Table Open Hours** + **Occupancy**: core operational KPIs; occupancy interacts with open-hours and limits. 
- **Title 31 CTR threshold**: casinos must file CTRs for currency transactions > $10,000; cash-in/out aggregation rules apply. 

## 7. Data required (what must be modelled)

### 7.1 Time window inputs
All rollups must be parameterized by:
- `casino_id`
- `start_ts`, `end_ts`
- `gaming_day` (if your system uses a non-midnight gaming day start)
- Optional: `pit`, `table_id`, `shift_id`

### 7.2 Dimensions (already in PT‑2)
- `gaming_table` (table identity, pit, game type)
- `gaming_table_settings` (effective-dated min/max bet and rotation interval)

### 7.3 Required fact/event model (Path B)
Path B (compliance-ready) requires **authoritative event facts**. Without these, drop/win/hold cannot be computed honestly.

- **Table status timeline**: `gaming_table_status_event` (OPEN/CLOSED transitions w/ timestamps)
- **Drop events**: `table_drop_event` (amount, tender_type (tender_type is cash-equivalent only; promotional instruments are not represented as drop events and do not affect drop/win/hold calculations in v0.), timestamp, actor)
- **Fill events**: `table_fill_event` (amount, timestamp, actor)
- **Credit events**: `table_credit_event` (amount, timestamp, actor)
- **Inventory snapshots**: `table_inventory_snapshot` (open/close/midshift chip inventory value)
- **Dealer rotations**: existing `dealer_rotation` (or `dealer_rotation_event` if missing)

### 7.4 Supporting telemetry (existing / recommended)
- `rating_slip` telemetry (avg bet, duration, pause intervals) for theo/handle and activity windows
- `player_financial_transaction` and/or `mtl_entry` for **informational** compliance signals in reports
- `pit_cash_observation` telemetry (non-authoritative) for observed cash-in/out estimates and operational review
  - **Guardrail:** must **not** be used as an input to Drop/Win/Hold; label explicitly as *telemetry* (`amount_kind = estimate | cage_confirmed`)


## 8. Metrics catalog (v0)

The **canonical** metrics catalog for this feature is:
- **SHIFT_METRICS_CATALOG_v0_PATH_B.md** (Path B: compliance-ready drop/win/hold + ops + baselines)

This PRD keeps only the product-level intent. Metric definitions (formulas, grains, inputs, null handling, baselines) live in the catalog.

### 8.1 Cash observations telemetry (pilot)
The shift dashboard/report **may** surface `pit_cash_observation` as *telemetry* only. These fields are intentionally named to avoid confusion with accounting truth.

Minimum rollups (per table/pit/casino, for the selected window):
- `cash_out_observed_estimate_total`: `SUM(amount)` where `direction = 'out'` and `amount_kind = 'estimate'`
- `cash_out_observed_confirmed_total`: `SUM(amount)` where `direction = 'out'` and `amount_kind = 'cage_confirmed'`
- `cash_out_observation_count`: `COUNT(*)` (optionally filtered to `direction='out'`)
- `cash_out_last_observed_at`: `MAX(observed_at)`

**Explicit non-goal:** these telemetry fields do **not** produce or replace Drop/Win/Hold and must be displayed under a separate “Cash Observations (Telemetry)” section.


At a high level, v0 must expose:
- **Statistical**: Drop, Win, Hold% by table → pit → casino
- **Operational**: open minutes, idle minutes, occupancy proxy, rotation compliance
- **Telemetry-derived**: Theo, handle estimate, win vs theo
- **Baselines**: 7/30-day rolling mean/stddev + z-score ranking


## 9. Alert catalog (v0)

### 9.1 Deterministic rule alerts
- **Drop variance**: table drop deviates from baseline by threshold (e.g., z-score > 2)
- **Win variance**: win deviates materially from theo (beyond expected variance bands)
- **Idle table**: open but idle > X minutes
- **Late close**: table closed after shift end + grace, or rating slips open beyond max duration
- **Dealer rotation missed**: missing expected rotation event, or rotation interval exceeds threshold
- **Fills spike**: fills per hour above baseline
- **Cash-out observed spike (telemetry)**: `cash_out_observed_estimate_total` exceeds threshold for window (table/pit), flagged as *telemetry* (not drop)
- **Drop without corresponding count** (if you model count events): reconciliation gap

### 9.2 Compliance-trigger alerts (v0 informational)
- **CTR threshold reached**: currency transaction(s) > $10,000; cash-in/out must be aggregated separately. 
- **Structuring risk signal** (optional): repeated transactions near threshold (rule-only; no ML)

## 10. Baselines (simple but effective)

### 10.1 Moving averages
- Per table: 7-day and 30-day baselines for drop/hour, win/hour, theo/hour, occupancy, pace

### 10.2 Z-scores (anomaly flags)
- z-score computed from rolling mean/stddev for the KPI (table/pit)
- Use for “variance > threshold” alerts

### 10.3 Yield-management style KPIs (optional v0.5)
- Under-capacity hours, under-priced hours, under-spread hours, tied to utilization and pricing strategy. citeturn1search12turn1search16

## 11. Stored procedure design (authoritative payloads)

### 11.1 Core SPs (minimum)
1. `rpc_shift_table_metrics(casino_id, start_ts, end_ts, pit null)`
   - one row per table
   - includes **evidence fields** (opening/closing snapshot ids, fills/credits/drops counts)
   - includes **telemetry fields** (if enabled): `cash_out_*` rollups from `pit_cash_observation` (clearly labeled as telemetry)
2. `rpc_shift_pit_metrics(casino_id, start_ts, end_ts)`
   - one row per pit
   - includes optional `cash_out_*` telemetry rollups (same semantics as table)
3. `rpc_shift_casino_metrics(casino_id, start_ts, end_ts)`
   - one summary row
   - includes optional `cash_out_*` telemetry rollups (same semantics as table)
4. `rpc_shift_alerts(casino_id, start_ts, end_ts, pit null, table_id null)`
   - alert rows with explicit rule + observed value + baseline (where applicable)
5. `rpc_shift_report_payload(casino_id, start_ts, end_ts)`
   - versioned JSON payload for report generation and exports

### 11.2 Output stability requirements
- Deterministic ordering
- Versioned payload schema (e.g., `payload_version: "v0"`)
- Recomputable for the same window with identical results

### 11.3 Performance stance (v0)
- Prefer SPs + supporting indexes.
- If dashboard latency regresses, graduate hottest aggregates into materialized views / rollup tables refreshed on schedule.


## 11.3 Minimal data-driven pipeline (v0)

This feature is **data-driven**: shift dashboards and reports are generated from a repeatable pipeline that transforms **fact events** (drop/fill/credit/inventory snapshots, table status events, rotations, rating slips) into **queryable read outputs** (rollups + alerts + report payload). The pipeline is intentionally minimal for a small casino footprint.

### Pipeline shape (v0)

**Sources (facts)**
- `gaming_table_status_event`
- `table_drop_event`, `table_fill_event`, `table_credit_event`
- `table_inventory_snapshot`
- `dealer_rotation_event` (or `dealer_rotation`)
- `rating_slip` (telemetry: avg bet, duration)

**Transforms (SQL/SP layer)**
- Stored procedures (RPC): `rpc_shift_*`
- Optional (recommended for speed): materialized views / rollup tables for the hot paths, refreshed on a schedule. Postgres materialized views persist query results in a table-like form and are refreshed via `REFRESH MATERIALIZED VIEW`.citeturn0search4turn0search0

**Scheduler**
- `pg_cron` is used to run SQL jobs in-database on a cron schedule.citeturn0search23turn0search6
- If/when an external handler is needed (e.g., to invoke an Edge Function), use `pg_net` + `pg_cron` (Supabase-supported pattern).citeturn0search1turn0search5

**Serving**
- UI reads from the RPCs (and/or rollup/materialized views) and renders dashboards/reports.

### Scheduled jobs (minimum)

**Job A — Near-real-time shift rollups (every 5–15 minutes)**
- Purpose: keep dashboard KPIs and alert ranking fresh during an active shift window.
- Implementation options:
  1) refresh materialized views that power table/pit/casino rollups (`REFRESH MATERIALIZED VIEW`), 
  2) upsert into rollup tables (INSERT…ON CONFLICT) keyed by `(casino_id, window_id, table_id)`.

**Job B — Baselines updater (daily)**
- Purpose: recompute rolling 7/30-day mean & stddev used for z-score variance flags.
- Implementation: refresh baseline materialized view(s) or recompute baseline tables via scheduled SQL (`pg_cron`).

**Job C — Shift finalization (end-of-shift, on demand or scheduled)**
- Purpose: produce a stable, reproducible report payload for the closed shift window.
- Implementation: write a `shift_report_snapshot` row (or equivalent) containing the `rpc_shift_report_payload` output and a payload hash for audit reproducibility.

### Monitoring / observability (v0)
- Track cron/job outcomes (success/failure) and duration via a small `shift_pipeline_job_run` table or existing `audit_log`.
- For materialized views, ensure refresh cadence is visible and alert on stale refresh.


## 12. Dashboard UX requirements (v0)

### 12.1 Views
- **Casino view**: top KPIs + alerts + pits leaderboard
- **Pit view**: tables list + occupancy + pace + alerts
- **Table view**: time series + event timeline (fills/credits/drops/rotations) + rating summary

### 12.2 Widgets
- KPI cards: Win, Drop, Hold, Theo, Open hours, Occupancy
- Top movers: biggest win/theo delta, biggest drop/hour delta
- Alerts panel: grouped by severity
- Table grid: per-table KPIs and status

### 12.3 Ad-hoc access
- Filter by time window, pit, table, game type
- Export shift report payload (JSON + CSV)

## 13. Shift report format (v0)

Sections (all derived from SP payload):
1. Executive summary (casino-level KPIs)
2. Pit summaries (ranked by theo/win)
3. Table exceptions (alerts + top deltas)
4. Operational notes (late closes, missed rotations, idle tables)
5. Compliance summary (informational thresholds crossed)

## 14. Security & access control

- RLS must scope results by `casino_id` using your existing claims/context pattern.
- Role-based visibility:
  - supervisors: operational + table-level
  - compliance: compliance + finance signals
  - executives: aggregated + redacted operational

## 15. Performance requirements

- Casino/pit view loads in <2 seconds for a “small casino” footprint.
- Table view can be slower (<5 seconds) due to event timeline joins.
- SPs must have supporting indexes and be explain-plan reviewed.

## 16. Telemetry & audit (v0)

- Log dashboard/report requests in `audit_log` (who, what window, what export)
- For alerts: store “why” (rule + threshold + observed value + baseline)

## 17. Definition of Done (v0)

- SPs implemented and covered by integration tests:
  - deterministic KPI correctness on fixture data
  - alert rule correctness
- Dashboard views implemented with filters and drilldowns
- Shift report exportable payload
- Performance validated on representative dataset

## 18. Pilot decisions and remaining questions

### 18.1 Decisions for v0 pilot (unblocks build)
- **Shift window**: dashboards operate on an **ad-hoc time window** (`start_ts`, `end_ts`). Preset scheduled shifts may be added later, but are not required for v0.
- **Inventory snapshot policy**: not required to ship the *cash observations telemetry* slice. (Authoritative Drop/Win/Hold still depends on the Path B fact model.)
- **Markers / pit credit**: out of scope for v0.
- **Promotional chips / match play**: out of scope for v0 (treat separately).
- **OPEN minutes mapping**: utilization can be computed only if `table_status` intervals are already reliable; otherwise omit utilization KPIs for v0 rather than inventing heuristics.
- **Occupancy in v0**: accept **rating-slip concurrency** as a proxy and label it as proxy.

### 18.2 Remaining questions (post-pilot / Path B completion)
- Do we need a scheduled-shift model (fixed times vs rostered vs ad-hoc) once exports/reproducibility requirements tighten?
- What is the authoritative opening/closing inventory snapshot cadence and enforcement mechanism?
- Do we model markers/pit credit and how does it interact with drop tender types?
- How are promotional instruments represented in shift reporting (separate ledger vs separate events)?
- Do we introduce periodic seat snapshots, or keep slip proxy as “good enough”?

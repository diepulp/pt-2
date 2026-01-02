---
title: "PRD-0xx — Shift Dashboards & Shift Reports (v0)"
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
- **Drop**: cash/marker/other buy-in value exchanged for chips at the table (activity indicator). citeturn0search4
- **Win**: casino win for the table over the window (accounting-derived; supports hold and comparisons).
- **Hold %**: `Win / Drop` (table games hold differs conceptually from house edge). citeturn1search8turn0search0
- **Handle**: total wagers; for table games often estimated from rating: `Avg Bet × Decisions/Hour × Hours` (or captured where available). citeturn1search8turn0search0
- **Theoretical Win (Theo)**: expected win derived from `Avg Bet × Decisions/Hour × Hours × House Advantage`. citeturn1search8turn0search0
- **Game Pace / Decisions per Hour**: pace KPI used in table yield management. citeturn1search12turn1search8
- **Table Open Hours** + **Occupancy**: core operational KPIs; occupancy interacts with open-hours and limits. 
- **Title 31 CTR threshold**: casinos must file CTRs for currency transactions > $10,000; cash-in/out aggregation rules apply. citeturn0search2turn0search18

## 7. Data required (what must be modelled)

### 7.1 Time window inputs
All rollups must be parameterized by:
- `casino_id`
- `start_ts`, `end_ts`
- `gaming_day` (if your system uses a non-midnight gaming day start)
- Optional: `pit_id`, `table_id`, `shift_id`

### 7.2 Minimum source data (existing PT-2 domains)
(Names refer to your SRM domains; actual tables may vary by PT-2 schema. v0 can be built from what you already store.)
- Table identity + status changes: `gaming_table`, open/close events, status transitions
- Rating telemetry: `rating_slip` (avg bet, game type, start/end times, player/table/visit)
- Chip movement events: fills/credits/drops (fill slips, drop events, inventory slips) if present
- Dealer rotation: `dealer_rotation` or equivalent
- Compliance/finance signals: `mtl_entry`, `player_financial_transaction` (for cash in/out where in scope)

### 7.3 Recommended additions (if missing)
If you lack these, dashboards become “approximate”:
- **Table status timeline** (open/closed timestamps per table)
- **Drop/Count events** (per table, per time window)
- **Fill/Credit** events (per table, per time window)
- **Seat occupancy snapshots** (simple periodic samples) *or* inferred occupancy from active ratings

## 8. Metrics catalog (v0)

### 8.1 Casino-level shift KPIs
- Gross Win (sum table win)
- Total Drop (sum table drop)
- Hold % (total win / total drop) 
- Total Theo (sum table theo) 
- Total Open Table Hours
- Average Occupancy (weighted by open hours) 
- Under-capacity hours (time open while occupancy below target) citeturn1search12
- Exceptions count (alerts fired)

### 8.2 Pit-level KPIs
Same as casino-level, grouped by pit:
- Win / Drop / Hold%
- Theo
- Open hours
- Occupancy
- Under-capacity hours
- Pace (avg decisions/hour where available)

### 8.3 Table-level KPIs (core)
**Financial**
- Drop
- Win
- Hold % = Win/Drop citeturn0search0turn0search4
- Theo = AvgBet × Hours × DecisionsPerHour × HouseAdvantage citeturn1search8
- Handle estimate = AvgBet × Hours × DecisionsPerHour citeturn1search8turn0search0
- Win vs Theo delta (% and absolute)

**Operational**
- Open hours (table open duration within window) 
- Idle minutes (open but no action/ratings)
- Occupancy avg and occupancy distribution (e.g., % time 0/1/2/3+ players) citeturn1search1turn1search12
- Pace (decisions/hour) citeturn1search12turn1search8
- Table minimum (avg/min/max during window, if tracked) 
- Fills count/amount; Credits count/amount; Drops count/amount
- Dealer rotations: expected vs actual, missed/late rotations

### 8.4 Player/host rollups (optional in v0, but high value)
- Theo contribution by player (per visit / per shift)
- Time played
- Avg bet distribution
- “High value presence” (top N theo players seen this shift)

**Note:** This is not marketing; it’s operational awareness.

## 9. Alert catalog (v0)

### 9.1 Deterministic rule alerts
- **Drop variance**: table drop deviates from baseline by threshold (e.g., z-score > 2)
- **Win variance**: win deviates materially from theo (beyond expected variance bands)
- **Idle table**: open but idle > X minutes
- **Late close**: table closed after shift end + grace, or rating slips open beyond max duration
- **Dealer rotation missed**: missing expected rotation event, or rotation interval exceeds threshold
- **Fills spike**: fills per hour above baseline
- **Drop without corresponding count** (if you model count events): reconciliation gap

### 9.2 Compliance-trigger alerts (v0 informational)
- **CTR threshold reached**: currency transaction(s) > $10,000; cash-in/out must be aggregated separately. citeturn0search2turn0search18
- **Structuring risk signal** (optional): repeated transactions near threshold (rule-only; no ML)

## 10. Baselines (simple but effective)

### 10.1 Moving averages
- Per table: 7-day and 30-day baselines for drop/hour, win/hour, theo/hour, occupancy, pace

### 10.2 Z-scores (anomaly flags)
- z-score computed from rolling mean/stddev for the KPI (table/pit)
- Use for “variance > threshold” alerts

### 10.3 Yield-management style KPIs (optional v0.5)
- Under-capacity hours, under-priced hours, under-spread hours, tied to utilization and pricing strategy. 

## 11. Stored procedure design (authoritative payloads)

### 11.1 Core SPs (minimum)
1. `rpc_shift_table_metrics(casino_id, start_ts, end_ts, pit_id null)`
   - returns one row per table with the KPIs in §8.3
2. `rpc_shift_pit_metrics(casino_id, start_ts, end_ts)`
   - returns one row per pit
3. `rpc_shift_casino_metrics(casino_id, start_ts, end_ts)`
   - returns one row summary
4. `rpc_shift_alerts(casino_id, start_ts, end_ts, pit_id null, table_id null)`
   - returns alert rows (type, severity, rationale, links)
5. `rpc_shift_report_payload(casino_id, start_ts, end_ts)`
   - returns a JSON payload containing:
     - summaries + top movers + exceptions + drilldowns

### 11.2 Output stability requirements
- Deterministic ordering (for UI and exports)
- Versioned payload schema (e.g., `payload_version: "v0"`)
- Recomputable for the same window with identical results

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

## 18. Open questions (to close before build)
- What is the authoritative definition of **shift** (fixed times, scheduled, or derived from gaming day + rotation schedule)?
- Do we have **drop/count** data modeled today, or do we need to add minimal drop events?
- How do we define **occupancy** in v0: seat snapshots vs inferred from active rating slips?
- For **pace**: do we store decisions/hour by game type, or compute using assumed HPH tables?

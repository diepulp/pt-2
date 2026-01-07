---
title: "SHIFT_METRICS_CATALOG_v0 — Path B (Compliance-Ready: Drop/Win/Hold + Ops + Baselines)"
status: draft
scope: "Shift Dashboards + Shift Reports authoritative facts (SQL/SPs)"
created: 2026-01-02
owners:
  - TableContext (table identity + status timeline + rotation)
  - Finance (drop/win inputs + reconciliations)
  - RatingSlip (telemetry: avg bet, duration)
  - MTL (threshold signals; informational in report)
principles:
  - "Facts first: deterministic, reproducible, explainable"
  - "Shift outputs must support internal controls: drop/win/hold by shift"
  - "One payload: same truth for dashboard + report + exports"
---

## 0) Why Path B exists (compliance-ready baseline)

Industry internal control procedures commonly require a **table games statistical analysis report** that reflects **drop, win, and win-to-drop hold%** by table and game type and is maintained **by shift** (plus day/MTD/YTD). (See NVGCB Table Games ICP/MICS style requirements; NIGC MICS similarly requires shift hold records.)

This catalog defines **authoritative shift facts** and the **minimum event model** required to compute them in PT‑2.

## 1) Shift time semantics

### 1.1 Canonical window contract
All metrics are parameterized by:
- `casino_id`
- `start_ts`, `end_ts`
- optional: `gaming_day` (computed from casino settings)
- optional: `pit` (string), `table_id`

### 1.2 “Shift” definition
A “shift” is a named or implicit interval (e.g., 8 hours, 24 hours, or other division) defined by casino policy.
v0 requirement: the system must support **arbitrary time windows** and optionally map those windows to shift labels (configurable later).

## 2) Required data model (facts vs dimensions)

### 2.1 Dimensions (already present)
- `gaming_table` (id, label, pit, game_type, status current)
- `gaming_table_settings` (effective-dated min/max bet, rotation interval)

### 2.2 Fact/event tables (required for Path B)

> If these event tables do not exist yet, Path B cannot be implemented honestly.
> Build these first, then the SPs become straightforward.

#### A) Table status timeline (for open hours, idle, utilization)
**New:** `gaming_table_status_event`
- `id uuid`
- `casino_id uuid`
- `table_id uuid`
- `event_ts timestamptz`
- `from_status table_status`
- `to_status table_status`
- `actor_id uuid`
- `reason text null`

#### B) Table drop / buy-in events (for drop + activity)
**New:** `table_drop_event`
- `id uuid`
- `casino_id uuid`
- `table_id uuid`
- `event_ts timestamptz`
- `amount numeric`
- `tender_type text` (cash, marker, front_money, etc.)
- `source text` (manual, import, audit_adjustment)
- `actor_id uuid`
- `external_ref text null`

#### C) Fill and credit events (inventory movement / reconciliation)
**New:** `table_fill_event`
- `id uuid`, `casino_id`, `table_id`, `event_ts`, `amount`, `actor_id`, `reason`
**New:** `table_credit_event`
- same fields

#### D) Table count / inventory snapshots (for win computation)
**New:** `table_inventory_snapshot`
- `id uuid`
- `casino_id uuid`
- `table_id uuid`
- `snapshot_ts timestamptz`
- `snapshot_type text` (open, close, midshift, audit)
- `chips_total_value numeric`
- `notes text null`
- `actor_id uuid`

#### E) Dealer rotation events (for missed rotation alerts)
Use existing `dealer_rotation` if it exists; otherwise:
**New:** `dealer_rotation_event`
- `id uuid`
- `casino_id uuid`
- `table_id uuid`
- `dealer_id uuid`
- `start_ts timestamptz`
- `end_ts timestamptz null` (or record handoff events)

#### F) (Optional) Player cash-in/out aggregation (for CTR signals)
Use existing `player_financial_transaction` and/or `mtl_entry`.
Path B treats compliance signals as informational in shift report v0 (no automation).

#### G) (Telemetry, optional) Pit cash observations (non-authoritative)
Use existing `pit_cash_observation` (Ops telemetry) **only** to surface observed cash-in/out estimates in dashboards.
- **Guardrail:** these rows are *not* drop events and must **not** be used to compute `stat_drop_amount`, `stat_win_amount`, or `hold_pct`.
- **Use cases (pilot):** operational awareness, exception review, and rule-only telemetry alerts.

## 3) Metric catalog (v0)

### 3.1 Naming & grains
Metric IDs follow: `shift.<grain>.<metric>`
- grain: `casino`, `pit`, `table`, `player`
- Most metrics are defined at `table` and roll up to pit/casino via SUM / weighted averages.

### 3.2 Table-level metrics (authoritative)

#### A) Statistical Drop (shift.table.stat_drop_amount)
- **Definition:** Total drop for the table during window.
- **Inputs:** `table_drop_event`
- **Formula:** `SUM(amount)` filtered by window & table.

> Note: Some MICS frameworks define “statistical drop” with adjustments for pit credit issues/payments; if markers/credit are added later, extend drop inputs rather than redefining the metric.

#### B) Statistical Win (shift.table.stat_win_amount)
- **Definition:** Table gross revenue over window (inventory-based).
- **Inputs:** `table_inventory_snapshot`, `table_fill_event`, `table_credit_event`
- **Minimum viable formula (inventory method):**
  - Let:
    - `opening = chips_total_value @ snapshot_type=open (nearest <= start_ts)`
    - `closing = chips_total_value @ snapshot_type=close (nearest <= end_ts)`
    - `fills = SUM(fill.amount)` within window
    - `credits = SUM(credit.amount)` within window
    - `drop = SUM(drop.amount)` within window
  - Then (common control-style relationship):
    - `stat_win = drop - (closing - opening) - credits + fills`
- **Notes:**
  - This assumes drops are removed from table inventory (standard drop box flow).
  - If your local procedure treats fills/credits differently, adjust the formula but keep it explicit.

#### C) Hold % (shift.table.hold_pct)
- **Definition:** `win / drop`
- **Formula:** `stat_win_amount / NULLIF(stat_drop_amount, 0)`

#### D) Drop per hour (shift.table.drop_per_hour)
- **Inputs:** `gaming_table_status_event` (open minutes), `table_drop_event`
- **Formula:** `stat_drop_amount / NULLIF(open_hours, 0)`

#### E) Win per hour (shift.table.win_per_hour)
- **Formula:** `stat_win_amount / NULLIF(open_hours, 0)`

#### F) Open minutes (shift.table.open_minutes)
- **Inputs:** `gaming_table_status_event` (or `gaming_table.status` current snapshot)
- **Definition:** minutes within window where table status is `active`
- **Status mapping** (canonical `table_status` enum):
  | Status | Maps to | Rationale |
  |--------|---------|-----------|
  | `active` | OPEN | Table accepting play, dealers assigned, rating slips allowed |
  | `inactive` | NOT OPEN | Table exists but not operating (break, low demand) |
  | `closed` | NOT OPEN | Terminal state, table decommissioned |
- **Formula:** sum of `active` intervals ∩ [start_ts, end_ts]
- **Note:** State machine enforces `inactive → active → inactive/closed`; `closed` is terminal

#### G) Idle minutes (shift.table.idle_minutes)
- **Definition:** OPEN minutes with no “activity” signal
- **Activity signals (choose v0):**
  1) any rating slip active on the table
  2) any drop/fill/credit event on the table
- **Formula:** `open_minutes - active_minutes` where `active_minutes` is union of activity intervals

#### H) Occupancy (proxy) (shift.table.occupancy_avg)
- **v0 proxy:** average concurrent active rating slips on table
- **Inputs:** `rating_slip` intervals
- **Alternative (better):** periodic seat snapshots (future)

#### I) Theo (shift.table.theo_amount)
- **Definition:** Expected win from rated play
- **Inputs:** `rating_slip.avg_bet`, slip duration, `game_settings` for decisions/hour and house advantage
- **Formula:** `SUM(avg_bet * hours_played * decisions_per_hour * house_advantage)` per slip

#### J) Handle estimate (shift.table.handle_est_amount)
- **Formula:** `SUM(avg_bet * hours_played * decisions_per_hour)`

#### K) Win vs Theo (shift.table.win_minus_theo)
- **Formula:** `stat_win_amount - theo_amount`
- **Also compute:** `% = (stat_win_amount - theo_amount) / NULLIF(theo_amount, 0)`

#### L) Min/Max bet configuration (effective in window)
- **Inputs:** `gaming_table_settings`
- **Metrics:**
  - `min_bet_effective`, `max_bet_effective`
  - used to interpret pace/yield and detect “under-priced” time (v0.5)

#### M) Rotation compliance (shift.table.rotation_missed_count)
- **Inputs:** `dealer_rotation_event` and `gaming_table_settings.rotation_interval_minutes`
- **Definition:** number of intervals exceeding expected rotation interval + grace

### 3.3 Pit-level rollups (derived)
For each pit:
- `shift.pit.stat_drop_amount = SUM(table.stat_drop_amount)`
- `shift.pit.stat_win_amount = SUM(table.stat_win_amount)`
- `shift.pit.hold_pct = pit_win / NULLIF(pit_drop, 0)`
- `shift.pit.theo_amount = SUM(table.theo_amount)`
- `shift.pit.open_hours = SUM(table.open_minutes)/60`
- `shift.pit.occupancy_avg = weighted avg by open minutes`
- `shift.pit.alert_count = count(alerts where pit=...)`

### 3.4 Casino-level rollups (derived)
Same as pit-level but aggregated across casino:
- `shift.casino.stat_drop_amount`
- `shift.casino.stat_win_amount`
- `shift.casino.hold_pct`
- `shift.casino.theo_amount`
- `shift.casino.open_hours`
- `shift.casino.occupancy_avg`
- `shift.casino.alert_count`

### 3.5 Compliance signals (informational in v0)
- `shift.casino.ctr_hits_count`
- `shift.player.currency_in_out_aggregate`
- **Inputs:** `player_financial_transaction`, `mtl_entry`
- **Definition:** flag windows where currency transactions exceed threshold per jurisdictional rules.
- **Output:** always include links to the underlying entries for auditability.

### 3.6 Promotional instrument metrics (promo lens)

> **Separation principle:** Promotional chips/coupons are tracked separately from cash/fiat by default.
> Reporting definitions and tax/duty treatment can diverge when the casino did not receive cash for the instrument.
> The data split supports both jurisdictions that include promo in AGR and those that exclude it.
>
> **Reference:** [`LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.md`](../loyalty-service-extension/LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.md)

#### A) Promo coupon count (shift.table.promo_coupon_count)
- **Inputs:** `promo_redemption_event`
- **Definition:** count of promotional instruments redeemed at table during window

#### B) Promo face value (shift.table.promo_face_value_amount)
- **Inputs:** `promo_redemption_event.promo_face_value_amount`
- **Definition:** total face value of redeemed coupons (what the casino "contributed")

#### C) Promo at-risk amount (shift.table.promo_at_risk_amount)
- **Inputs:** `promo_redemption_event.patron_match_amount`
- **Definition:** patron's matching wager amount (actual patron risk for match play)

#### D) Promo type breakdown (shift.table.promo_type_breakdown)
- **Inputs:** `promo_redemption_event` joined to `promo_coupon.promo_type`
- **Definition:** JSONB breakdown by promo type (`match_play`, `nonnegotiable`, `free_bet`, etc.)

#### E) Cash drop amount (shift.table.cash_drop_amount)
- **Definition:** `stat_drop_amount` excluding promotional instruments
- **Formula:** `stat_drop_amount` (promo redemptions are NOT included in drop events)

#### F) Presented drop amount (shift.table.presented_drop_amount)
- **Definition:** Configuration-driven total for display/reporting
- **Formula:** `cash_drop_amount + (promo_face_value_amount IF casino_settings.promo_included_in_presented_drop)`
- **Note:** Jurisdictional policy determines whether coupon face value participates in AGR/drop

#### Rollup fields (pit/casino level)
- `shift.pit.promo_coupon_count = SUM(table.promo_coupon_count)`
- `shift.pit.promo_face_value_amount = SUM(table.promo_face_value_amount)`
- `shift.pit.promo_at_risk_amount = SUM(table.promo_at_risk_amount)`
- `shift.pit.promo_tables_active_count = COUNT(DISTINCT table_id WHERE promo_coupon_count > 0)`
- `shift.casino.*` = same pattern

### 3.7 Cash observations telemetry (pilot, non-authoritative)
These metrics are **telemetry-only** rollups derived from `pit_cash_observation`. They exist to support the pilot shift dashboard slice and must be displayed under a distinct “Cash Observations (Telemetry)” section.

Table-level:
- `shift.table.cash_out_observed_estimate_total`
  - `SUM(amount)` where `direction='out'` and `amount_kind='estimate'`
- `shift.table.cash_out_observed_confirmed_total`
  - `SUM(amount)` where `direction='out'` and `amount_kind='cage_confirmed'`
- `shift.table.cash_out_observation_count`
  - `COUNT(*)` (optionally filtered to `direction='out'`)
- `shift.table.cash_out_last_observed_at`
  - `MAX(observed_at)`

Pit-level (derived):
- `shift.pit.cash_out_observed_estimate_total = SUM(table.cash_out_observed_estimate_total)`
- `shift.pit.cash_out_observed_confirmed_total = SUM(table.cash_out_observed_confirmed_total)`
- `shift.pit.cash_out_observation_count = SUM(table.cash_out_observation_count)`
- `shift.pit.cash_out_last_observed_at = MAX(table.cash_out_last_observed_at)`

Casino-level (derived): same pattern as pit-level.

## 4) Alert catalog (v0) — rule-based, explainable

### 4.1 Operational alerts
- `cash_out_observed_spike_telemetry`: `shift.*.cash_out_observed_estimate_total >= X` for the window (table/pit), flagged as **telemetry** (not drop)
- `idle_table`: `idle_minutes >= X`
- `late_close`: table closed after shift end + grace (requires status events)
- `rotation_missed`: rotation interval exceeded (`rotation_interval_minutes + grace`)
- `drops_spike`: `drop_per_hour` z-score >= threshold
- `hold_outlier`: `hold_pct` outside configured band (by game type)

### 4.2 Financial control / reconciliation alerts
- `missing_open_snapshot` / `missing_close_snapshot`
- `inventory_gap`: (opening, closing, fills, credits, drop) inconsistent beyond tolerance
- `drop_without_event_support`: aggregated drop exists but no underlying events (ingestion gap)

### 4.3 Compliance alerts (informational)
- `ctr_threshold_crossed`
- `near_threshold_pattern` (optional): repeated transactions within band (rule-only)

## 5) Baselines (simple trend context)

### 5.1 Rolling baselines (per table, per pit)
For each KPI below, compute:
- 7‑day rolling mean and stddev
- 30‑day rolling mean and stddev

KPIs:
- `drop_per_hour`
- `win_per_hour`
- `hold_pct`
- `theo_per_hour`
- `idle_minutes_per_hour`
- `occupancy_avg`

### 5.2 Z-score computation
`z = (value - mean) / NULLIF(stddev, 0)`
Use z to trigger variance alerts and to rank “top movers.”

## 6) Stored procedure contracts (authoritative serving layer)

### 6.1 Core SPs
1) `rpc_shift_table_metrics(casino_id, start_ts, end_ts, pit text null)`
   - returns rows with all §3.2 metrics + derived fields for UI
   - may include **telemetry-only** fields from §3.7 (`cash_out_*`) when enabled; these must not affect authoritative drop/win/hold metrics
2) `rpc_shift_pit_metrics(casino_id, start_ts, end_ts)`
   - may include **telemetry-only** fields from §3.7 (`cash_out_*`) when enabled; these must not affect authoritative drop/win/hold metrics
3) `rpc_shift_casino_metrics(casino_id, start_ts, end_ts)`
   - may include **telemetry-only** fields from §3.7 (`cash_out_*`) when enabled; these must not affect authoritative drop/win/hold metrics
4) `rpc_shift_alerts(casino_id, start_ts, end_ts, pit text null, table_id uuid null)`
5) `rpc_shift_report_payload(casino_id, start_ts, end_ts)`
   - returns JSON:
     - executive summary
     - pit summaries
     - table leaderboard
     - alerts grouped by severity/type
     - compliance section with links

### 6.2 Output requirements
- deterministic ordering
- stable schema with `payload_version`
- includes “evidence fields” for each computed metric:
  - opening_snapshot_id, closing_snapshot_id, counts of fills/credits/drops, etc.

## 7) Implementation sequencing (Path B, v0)

1) Add fact tables:
   - `gaming_table_status_event`
   - `table_drop_event`, `table_fill_event`, `table_credit_event`
   - `table_inventory_snapshot`
   - rotation events if missing
2) Backfill strategy (dev-only): seed fixtures, no production backfill required.
3) Implement core SPs + indexes.
4) Ship dashboard views backed by SPs.
5) Add baselines + z-score ranking.
6) Add “monthly management review” export hooks (future) if needed.

## 8) Open questions (must close)
- ~~What is the authoritative "opening" and "closing" snapshot policy?~~ → **ANSWERED** (per shift)
- How are markers/pit credit represented (if at all) in v0? **ANSWERED** Not represented at all
- ~~Do we treat promotional chips separately (likely yes; disclosed separately if included)?~~ → **ANSWERED** (see §3.6, §9.3)
- ~~What's the canonical table status enum mapping to "OPEN" minutes for utilization?~~ → **ANSWERED** (see §3.2.F)

## 9) Answers

### 9.1 Opening and closing snapshot policy
**Per shift.** Each shift requires its own opening and closing inventory snapshots.

### 9.2 Table status enum mapping to "OPEN" minutes
**Only `active` status counts as OPEN.**

The `table_status` enum (`types/database.types.ts:2557`) has three values:
- **`active`** → OPEN: Table accepting play, can have rating slips, dealer rotations, drop/fill/credit operations
- **`inactive`** → NOT OPEN: Table exists but not operating (break, low demand, setup)
- **`closed`** → NOT OPEN: Terminal state, table permanently decommissioned

State machine (enforced by `rpc_update_table_status`):
```
inactive ──→ active ──→ closed
               ↑
               └─ inactive ┘
```

Reference: `services/table-context/README.md:46`, `supabase/migrations/20251221173716_prd015_ws3_table_mgmt_rpcs_self_injection.sql:89-98`

### 9.3 Promotional chips treatment
**Yes, treat promotional chips separately by default.**

**Rationale:**
- Reporting definitions and tax/duty treatment can diverge when the casino did not receive cash for the instrument
- Promotional allowances are a distinct accounting category (GAAP/gaming industry guidance)
- Definitions vary across regulators, so the data split is required to support both views
- Some jurisdictions include coupon face value in Adjusted Gross Receipts; others exclude it

**Implementation:**
- This is a **LoyaltyService gap**, not a shift dashboard concern
- LoyaltyService owns promotional instrument issuance, redemption, and audit trail
- Shift dashboards consume `promo_redemption_event` for the promo lens (§3.6)
- Configuration toggle (`casino_settings.promo_included_in_presented_drop`) determines presentation

**Metrics separation:**
| Lens | Metrics | Source |
|------|---------|--------|
| Cash/fiat | `stat_drop_amount`, `stat_win_amount`, `hold_pct` | `table_drop_event`, inventory |
| Promo | `promo_coupon_count`, `promo_face_value_amount`, `promo_at_risk_amount` | `promo_redemption_event` |
| Presented | `presented_drop_amount` | Configuration-driven blend |

**Reference:** [`LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.md`](../loyalty-service-extension/LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.md)

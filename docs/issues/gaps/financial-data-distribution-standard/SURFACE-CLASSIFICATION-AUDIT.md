# Surface Classification Audit — Financial Data Distribution

---

status: Draft (audit output, pre-remediation)
date: 2026-04-23
scope: PT-2 pilot (pit, shift, player, visit, cashier, MTL, API DTO surfaces)
governed_by: FACT-AUTHORITY-MATRIX-FIN-DOMAIN.md §6 (Labeling Requirements)
produced_for: Global financial-data distribution unification effort
method: Parallel subagent audit (4 Explore streams), merged by category
---

# 1. Purpose

Under the FACT AUTHORITY MATRIX, every surfaced financial value must declare one of:

* **Actual** — derived from `player_financial_transaction` (PFT)
* **Estimated** — derived from `table_buyin_telemetry` (Grind portion)
* **Observed** — derived from `pit_cash_observation`
* **Compliance** — derived from `mtl_entry`

Unlabeled financial values are **non-conformant** (matrix §6).

This audit catalogues every money-adjacent field the system currently surfaces, traces it to its authoritative source, and flags labeling compliance. It is the input dataset for the upcoming remediation pass.

# 2. Method

Four parallel subagents, each scoped to a disjoint surface cluster:

| Stream | Scope |
| ------ | ----- |
| A | Dashboard surfaces (pit, shift, floor, table) |
| B | Transactional surfaces (player, visit, rating slip, sessions) |
| C | Compliance surfaces (cashier, MTL, admin alerts) |
| D | API / DTO contract surface |

Each stream produced a uniform `(file:line, field, source, classification, labeled?, risk)` table. This document merges them and adds cross-cutting analysis.

# 3. Executive Summary

## 3.1 Classification rollup

| Classification | Count (approx.) | Labeled in UI | Unlabeled | Notes |
| -------------- | --------------- | ------------- | --------- | ----- |
| **Actual** (PFT / PFT-view / custody-chain) | ~22 fields | 3 | 19 | **Biggest gap: unlabeled authoritative data.** |
| **Estimated** (TBT) | 3 fields | 2 | 1 | Shift-dashboard-v3 is mostly correct; pit-panels/analytics-panel surfaces "Handle" without "Estimated" label. |
| **Observed** (PCO) | 4 fields | 4 | 0 | Correctly quarantined; telemetry badge applied. |
| **Compliance** (MTL) | 9 fields | 7 | 2 | Properly isolated from PFT; some aggregates lack explicit UI labels. |
| **MIXED / UNKNOWN** | 8 fields | 0 | 8 | **Highest remediation priority** — see §7. |

## 3.2 Top risks (ordered)

1. **`theoEstimate` stubbed at `0` across player-360 surfaces** — looks authoritative, is a TODO placeholder.
2. **`currentDailyTotal` in CTR threshold indicator is source-agnostic** — compliance-critical UI with no source contract.
3. **`FinancialSectionDTO.totalChipsOut` confuses chips (observational) with cash-out (ledger)** — naming collision between Observed and Actual semantics.
4. **`TableRundownDTO.table_win_cents` is a MIXED formula surfaced as a single number** — combines opening snapshot + fills + credits + drop without labeling the composite origin.
5. **No DTO in the entire codebase carries a `dataClassification` discriminator** — UI labeling must be hardcoded per field, which guarantees drift.

# 4. Stream A — Dashboard Surfaces

| Surface (file:line) | Field | Source | Classification | Labeled? | Risk |
| --- | --- | --- | --- | --- | --- |
| components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx:95 | Win/Loss | `table_session` inventory formula | Actual | Yes (ESTIMATE/AUTHORITATIVE badge) | Nullable when drop not posted |
| components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx:74 | Fills | `table_session.fills_total_cents` | Actual | No | Correct but unlabeled custody-chain origin |
| components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx:80 | Credits | `table_session.credits_total_cents` | Actual | No | Correct but unlabeled custody-chain origin |
| components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx:86 | Est. Drop | `table_buyin_telemetry` | Estimated | Yes ("ESTIMATE") | Correctly labeled |
| components/shift-dashboard-v3/center/metrics-table.tsx:95 | Win/Loss (table) | `table_session.win_loss_estimated_cents` | **Actual or Estimated (context-dependent)** | Partial — `OpeningSourceBadge` switches between AUTHORITATIVE/ESTIMATE at render time; `MetricGradeBadge` shows grade but does not name the classification class | Field name says "estimated" but value is authoritative when drop is posted; single field carries both states without a stable classification |
| components/shift-dashboard-v3/center/metrics-table.tsx:100–103 | Fills / Credits | `table_session.*_total_cents` | Actual | No | Unlabeled |
| components/shift-dashboard-v3/right-rail/telemetry-rail-panel.tsx:87 | Cash Out (Observed Est.) | `pit_cash_observation` | Observed | Yes (TELEMETRY) | Correct |
| components/shift-dashboard-v3/right-rail/telemetry-rail-panel.tsx:93 | Cash Out (Observed Confirmed) | `pit_cash_observation` | Observed | Yes (TELEMETRY) | Correct |
| components/shift-dashboard/pit-metrics-table.tsx:161 | Win/Loss (Inv) | Inventory formula | Actual | Partial (column header "Inv") | No trust grade shown |
| components/shift-dashboard/pit-metrics-table.tsx:164 | Win/Loss (Est) | Drop-based formula | Estimated | Partial (column header "Est") | No trust grade shown |
| components/shift-dashboard/pit-metrics-table.tsx:167–170 | Fills / Credits (pit) | `table_session.*_total_cents` | Actual | No | Unlabeled rollup |
| components/shift-dashboard/table-metrics-table.tsx:251–254 | Fills / Credits (table) | `table_session.*_total_cents` | Actual | No | Unlabeled |
| components/pit-panels/analytics-panel.tsx:163 | Win/Loss | `table_session` inventory formula | Actual | Yes (metric_grade badge) | Correct |
| components/pit-panels/analytics-panel.tsx:170 | Handle (Est. Drop) | `table_buyin_telemetry` | Estimated | **No — labeled "Handle"** | Source opaque to user |
| components/table/rundown-summary-panel.tsx:205–218 | Fills / Credits | `table_session.*_total_cents` | Actual | No | Formula components unlabeled |
| components/table/rundown-summary-panel.tsx:229 | Drop Total | `table_session.drop_total_cents` | Actual | No | Gated on `drop_posted_at` but origin not surfaced |
| components/table/rundown-summary-panel.tsx:242 | Win/Loss | `table_session.table_win_cents` (formula) | Actual | No | Null when drop not posted |

**Stream A — Hot Findings**

1. Shift-dashboard-v3 is the most matrix-conformant surface today — most labeled values are correct. The legacy `components/shift-dashboard/` variant lags behind. **Caveat:** `metrics-table.tsx` renders `win_loss_estimated_cents` via `OpeningSourceBadge` (switches AUTHORITATIVE/ESTIMATE at runtime) — classification is context-dependent, not statically Actual. This is partial conformance, not full.
2. `analytics-panel.tsx:170` labels Estimated data as "Handle" with no origin badge; high visibility panel.
3. Custody-chain Actuals (`fills`, `credits`, `drop_total_cents`) are pervasively unlabeled — users cannot distinguish from Estimated drop metrics at glance.
4. Win/Loss nullability (drop-not-posted) is surfaced inconsistently across legacy vs. v3 dashboards.
5. Pit-level rollup win/loss columns (Inv vs Est) need a trust badge system consistent with v3.

# 5. Stream B — Transactional Surfaces

| Surface (file:line) | Field | Source | Classification | Labeled? | Risk |
| --- | --- | --- | --- | --- | --- |
| components/player-sessions/start-from-previous.tsx:213 | total_buy_in | `visit_financial_summary` (PFT agg) | Actual | No | Unlabeled aggregate |
| components/player-sessions/start-from-previous.tsx:219 | total_cash_out | `visit_financial_summary` (PFT agg) | Actual | No | Unlabeled aggregate |
| components/player-sessions/start-from-previous.tsx:237 | net (win/loss) | `visit_financial_summary.net_amount` | Actual | No | Unlabeled; high compliance visibility |
| components/player-360/summary/summary-band.tsx:136 | Session Value | `VisitFinancialSummaryDTO.net_amount` | Actual | No | Multi-layer aggregation; no origin transparency |
| components/player-360/summary/summary-band.tsx:137 | Theo Estimate | **Hardcoded to 0 in mappers.ts:179** | **UNKNOWN (stubbed)** | No | **TODO placeholder surfaced as authoritative $0** |
| components/player-360/summary/summary-band.tsx:152–153 | Cash Velocity / Rate per Hour | PFT total_in ÷ duration | Actual (derived) | No | Derivative math indistinguishable from direct totals |
| components/player-360/summary/summary-band.tsx:155 | Last Buy-In At | `player_financial_transaction.created_at` | Actual | No | Timestamp; no provenance |
| components/rating-slip/buy-in-threshold-indicator.tsx:171 | currentDailyTotal (CTR) | **Prop, untraced at component** | **UNKNOWN / MIXED** | Implicit (CTR label) | Compliance-critical, source-agnostic |
| components/rating-slip/buy-in-threshold-indicator.tsx:174 | newBuyInAmount | Prop, caller-dependent | UNKNOWN | No | Could be Estimated or Actual |
| components/player-360/left-rail/filter-tile-stack.tsx:87 | sessionValue.netWinLoss | `PlayerSummaryDTO` ← PFT | Actual | No | Correct source, no label |

**Stream B — Hot Findings**

1. **`theoEstimate` stubbed at 0** — matches no matrix class; surfacing `$0` looks like a valid Actual result to the user. Remove from UI until implemented or label explicitly as `UNIMPLEMENTED`.
2. No transactional surface in this stream carries a source label. Every field is Actual but every display is unlabeled.
3. `buy-in-threshold-indicator` is compliance-critical and receives a prop with no source classification — caller contract is the only defense.
4. Cash Velocity is a derived calculation shown next to raw totals without visual distinction.
5. No DTO in this stream exposes a `dataClassification` field — enforcement must live in consuming components, which already shows drift.

# 6. Stream C — Compliance / Cash-Handling Surfaces

| Surface (file:line) | Field | Source | Classification | Labeled? | Risk |
| --- | --- | --- | --- | --- | --- |
| components/mtl/gaming-day-summary.tsx:272 | Total Cash In | `mtl_entry` SUM (direction=in) | Compliance | Yes (MTL badge) | Properly isolated |
| components/mtl/gaming-day-summary.tsx:288 | Total Cash Out | `mtl_entry` SUM (direction=out) | Compliance | Yes (MTL badge) | Properly isolated |
| components/mtl/gaming-day-summary.tsx:158–163 | CTR Trigger Count | `mtl_gaming_day_summary.agg_badge_*` | Compliance | Yes (CTR alert) | Role-gated (pit_boss/admin) |
| components/mtl/compliance-dashboard.tsx:132 | Total Volume | `mtl_gaming_day_summary.total_volume` | Compliance | Partial (disclaimer) | Acceptable |
| components/mtl/entry-badge.tsx | Entry Badge | `mtl_entry.amount` vs thresholds | Compliance | Yes (ctr_met / watchlist_near) | Per-transaction indicator |
| components/mtl/agg-badge.tsx | Agg Badge | `mtl_gaming_day_summary` daily agg | Compliance | Yes (agg_ctr_met) | Correct |
| components/admin-alerts/alert-detail-card.tsx:104 | Observed Value | `pit_cash_observation` via RPC | Observed | Yes ("Observed") | Correct |
| components/admin-alerts/alert-detail-card.tsx:110 | Alert Threshold | PCO spike detection | Observed | Yes | Correct |
| services/table-context/shift-cash-obs.ts:382–396 | CashObsSpikeAlertDTO | `pit_cash_observation` | Observed | Yes (is_telemetry: true) | Correctly non-authoritative |
| components/cashier/cash-out-form.tsx:54 | Amount (input) | Operator-entered | **UNKNOWN (pre-commit)** | No | Form input dangles until POSTed to PFT |
| app/api/v1/financial-transactions/route.ts:59–75 | Cash-out transaction | `player_financial_transaction` | Actual | No explicit response label | Correctly sourced |

**Stream C — Hot Findings**

1. MTL and PFT are **code-level isolated** (separate tables, separate routes, separate role gates) but not **UI-label enforced**. Compliance badge exists only where operators subclassed it; nothing prevents a future component from SUM-ing both.
2. `cash-out-form.tsx` input is the one UNKNOWN in the compliance domain — it's user-entered and becomes Actual only on POST. Until then the form holds an unsourced number; labeling should reflect "draft" state.
3. No MIXED violations detected in this stream. Matrix rule **A3** (Compliance parallel to Financial) is currently preserved by convention.
4. Role-based gating (ADR-025) enforces part of the matrix separation — cashiers cannot read `mtl_gaming_day_summary`. This is a second line of defense but does not remove the labeling requirement.
5. PCO (Observed) is the best-labeled source in the system — `is_telemetry: true` at DTO level is the pattern other sources should follow.

# 7. Stream D — API / DTO Contract Surface

| DTO / Route (file:line) | Field | Source | Classification | Name Self-Labels? | Risk |
| --- | --- | --- | --- | --- | --- |
| services/player-financial/dtos.ts:67 | `FinancialTransactionDTO.amount` | `player_financial_transaction.amount` | Actual | Yes | Correct |
| services/player-financial/dtos.ts:113–117 | `VisitFinancialSummaryDTO.total_in/out/net_amount` | `visit_financial_summary` view (PFT) | Actual | Partial | Generic aggregate names |
| services/mtl/dtos.ts:85 | `MtlEntryDTO.amount` | `mtl_entry.amount` | Compliance | Yes | Correct |
| services/mtl/dtos.ts:140–148 | `MtlGamingDaySummaryDTO.total_in/out` | `mtl_gaming_day_summary` | Compliance | Partial | Parallel naming to PFT DTOs — **risk of visual conflation** |
| services/rating-slip-modal/dtos.ts:146 | `FinancialSectionDTO.totalCashIn` | `visit_financial_summary` (PFT) | Actual | No | Generic name |
| services/rating-slip-modal/dtos.ts:149 | `FinancialSectionDTO.totalChipsOut` | `visit_financial_summary` (PFT) | Actual | **No — misleading** | **Name suggests Observed (chip counts), source is Actual (ledger)** |
| services/rating-slip-modal/dtos.ts:152 | `FinancialSectionDTO.netPosition` | Computed aggregate | Actual | No | Generic |
| services/visit/dtos.ts:243–248 | `VisitLiveViewDTO.session_total_buy_in / cash_out / net` | `rpc_get_visit_live_view` (PFT) | Actual | Yes | Correct |
| services/visit/dtos.ts:318–322 | `RecentSessionDTO.total_buy_in / cash_out / net` | `rpc_get_player_recent_sessions` (PFT) | Actual | Partial | Generic `net` |
| services/rating-slip/dtos.ts:65 | `RatingSlipDTO.average_bet` | **User-entered at slip close** | **UNKNOWN (operator input)** | No | Not any matrix class |
| services/table-context/dtos.ts:164 | `TableFillDTO.amount_cents` | `table_fill.amount_cents` | **UNKNOWN (operational)** | No | Custody request record — off-matrix |
| services/table-context/dtos.ts:198 | `TableCreditDTO.amount_cents` | `table_credit.amount_cents` | **UNKNOWN (operational)** | No | Custody request record — off-matrix |
| services/table-context/dtos.ts:620 | `TableRundownDTO.drop_total_cents` | `table_session.drop_total_cents` | **UNKNOWN (operational snapshot)** | No | Off-matrix |
| services/table-context/dtos.ts:622 | `TableRundownDTO.table_win_cents` | Formula: opening + credits + drop − fills − closing | **MIXED** | No | **Surfaced as single number** |

**Stream D — Hot Findings**

1. **Zero DTOs carry a `dataClassification` discriminator.** The whole system depends on component authors hand-labeling origins, which is already drifting.
2. `totalChipsOut` naming — "Chips" semantically belongs to Observed (physical chip count from `pit_cash_observation`), but the field is sourced from PFT cash-out aggregates. High-confusion name.
3. `MtlGamingDaySummaryDTO` and `VisitFinancialSummaryDTO` have near-identical shapes (`total_in`, `total_out`) but one is Compliance and the other is Actual. Consumers cannot tell at the type level.
4. `TableRundownDTO.table_win_cents` publishes a MIXED formula as one cent amount. Per matrix rule **A5** (no silent mixing), this must either be broken into labeled components or carry an explicit composite-origin marker.
5. Table custody operational fields (`fill`, `credit`, `drop_total_cents`) are **off-matrix entirely**. They are not one of the four matrix fact types. This is a matrix gap, not a violation (see §8).

# 8. Matrix Gaps Discovered

The audit surfaced two classes of fields that the matrix does not currently name:

## 8.1 Custody-chain facts (operational but ledger-backed)

`table_session.fills_total_cents`, `credits_total_cents`, `drop_total_cents`, and the `table_fill` / `table_credit` source rows are:

* real money movement (not telemetry)
* recorded from custody events (not user observation)
* authoritative for table-level inventory reconciliation
* **not** written to PFT

They most closely resemble matrix row 1 (Ledger) but sit in a parallel operational custody ledger.

**Recommendation:** Matrix should add a row for **Custody Fact** (storage: `table_session` + `table_fill` + `table_credit`) with authority for table inventory reconciliation and explicit non-authority for player balances. Until then, audit labels these **Actual (Custody)** provisionally.

## 8.2 Operator-input facts

`rating_slip.average_bet` and `cashier/cash-out-form` amount-before-commit are:

* user-entered
* not derived from any of the four matrix sources
* often promoted to Actual (via commit to PFT) or to Estimated (via rating aggregation)

**Recommendation:** Matrix should add a row for **Operator Input** (transient, non-authoritative) or this ADR should explicitly ban direct display of operator-input financial values without a "Draft" badge.

# 9. Recommended Remediation Shape

## 9.1 Contract-layer (highest leverage)

Add a `dataClassification` discriminator to every financial DTO:

```ts
type FactOrigin = 'actual' | 'estimated' | 'observed' | 'compliance' | 'custody' | 'draft';

interface LabeledMoneyField {
  amount_cents: number;
  origin: FactOrigin;
}
```

All DTO fields in §7 that are currently `number` become `LabeledMoneyField`. This makes misuse a type error.

## 9.2 UI-layer

One `<MoneyField origin={...}>` component that renders the badge consistently. Eliminates per-surface labeling drift found in §4.

## 9.3 Surface-level fixes (ordered)

1. Remove `theoEstimate` from player-360 summaries until implemented (Stream B #1).
2. Rename `FinancialSectionDTO.totalChipsOut` → `totalCashOut` (Stream D #2).
3. Split `TableRundownDTO.table_win_cents` into labeled components or mark as composite (Stream D #4).
4. Add origin badge to legacy `components/shift-dashboard/pit-metrics-table.tsx` and `table-metrics-table.tsx` (Stream A #3).
5. Relabel `analytics-panel.tsx:170` "Handle" as Estimated (Stream A #2).
6. Add draft-state indicator to `cashier/cash-out-form.tsx` until POST commit (Stream C #2).

## 9.4 Matrix follow-ups

1. Amend matrix to add **Custody Fact** row (§8.1).
2. Amend matrix to add **Operator Input** row or ban unlabeled operator-input display (§8.2).

# 10. What This Audit Is Not

* Not a migration plan — source reassignment (e.g., grind → PFT) is covered by the Ingestion ADR.
* Not a projection-layer redesign — outbox and consumer rules are covered by the Outbox ADR.
* Not a schema change proposal — only surface-and-DTO concerns.
* Not exhaustive for marketing, onboarding, admin-config, or auth pages — those were out of scope.

# 11. Closing

The system's biggest non-conformance is not mixing sources — it is **failing to declare them**. The matrix is already mostly respected in storage and code separation. The gap is at the surface.

> Labeling is not cosmetic. An unlabeled financial value is an implicit claim of authority.

Fixing this is cheap if done at the DTO layer and expensive if done per component. §9.1 is the leverage point.

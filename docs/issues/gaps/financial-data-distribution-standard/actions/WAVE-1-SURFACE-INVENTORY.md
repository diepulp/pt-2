---
name: Wave 1 — Surface Inventory
description: Enumeration of every service DTO, API route, and UI surface that emits or renders a currency value, with proposed FinancialValue envelope wiring per source.
status: Draft (pending lead-architect review at Phase 1.0 exit gate)
date: 2026-04-23
phase: 1.0
derives_from:
- actions/ROLLOUT-ROADMAP.md §3 Phase 1.0
- actions/SURFACE-RENDERING-CONTRACT.md §10
- decisions/ADR-FINANCIAL-FACT-MODEL.md §D1, §D4
- decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md §4
- ../SURFACE-CLASSIFICATION-AUDIT.md (merged: confirmed violations, file:line references, custody-chain finding)
feeds:
- actions/WAVE-1-CLASSIFICATION-RULES.md
- Phase 1.1 Service DTO envelope migration
- Phase 1.3 UI split-display migration
- Phase 1.4 ESLint rules + DOM assertions
---

# Wave 1 — Surface Inventory

> **Ground truth for envelope migration.** Every row in §3–§5 is a migration task for Phase 1.1/1.2/1.3. Omissions here mean unlabeled values leak to production.

---

## 0. How to read this

- **"Current unit"** is what the field carries today (cents or dollars). Wave 1 standardizes `FinancialValue.value` on **cents** (see §2 and CLASSIFICATION-RULES §4). Dollars-today fields will be multiplied by 100 at the mapper boundary.
- **"Proposed authority"** is the fixed `FinancialValue.type`. Derived per CLASSIFICATION-RULES §3; rationale lives there, not here.
- **"Proposed source"** is the human-readable `FinancialValue.source` string. Stable across the envelope contract.
- **"Completeness"** summarizes the default `status` determination strategy; CLASSIFICATION-RULES §5 has the full decision tree.
- **"Wave 1 action"** is the migration call-out for Phase 1.1 / 1.3.

Field references cite file paths; line numbers are provisional and may shift before Phase 1.1 lands. Phase 1.1 will re-verify each line during DTO migration.

---

## 0.1 Relationship to `SURFACE-CLASSIFICATION-AUDIT.md`

The parallel audit doc (four Explore streams, same 2026-04-23 date) pre-dates the frozen decision set. It catalogued ~46 fields with `(file:line, field, source, classification, labeled?, risk)` tuples and proposed a 6-value `FactOrigin` discriminator (`actual | estimated | observed | compliance | custody | draft`).

**This inventory supersedes the audit's classification proposal** because:

1. SRC §10 (frozen 2026-04-23) fixes the envelope at **four** authority values — no `custody` or `draft`.
2. FACT-MODEL §D1 (frozen 2026-04-23) folds "equivalent table-level money movement" into Class B (`estimated`). The audit's §8.1 "Custody Fact" matrix-gap is therefore already answered by the frozen model — custody-chain fills/credits/drops classify as `estimated`, not a new class.
3. Operator-input drafts (audit §8.2) are handled by **not wrapping** them (see §6 and CLASSIFICATION-RULES §6) — input is not a FinancialValue; UI labels them as "Draft" until commit.

The audit's **factual findings remain authoritative** and are merged into §3 (DTOs) and §5 (UI surfaces). Where the audit's file:line references sharpen this inventory's table rows, they are used directly. The audit's Hot Findings sections are cross-referenced into §5.1 below.

---

## 1. Roadmap name mismatches (documented)

The frozen `ROLLOUT-ROADMAP.md` referenced service names that do not match the live codebase. No roadmap patching (freeze rule); these aliases are recorded for reviewer context:

| Roadmap reference | Actual path | Note |
|-------------------|-------------|------|
| `services/player-financial-transaction/` | `services/player-financial/` | Directory rename only — same responsibility. |
| `services/table-buyin-telemetry/` | *Does not exist* | Class B (TBT/grind) data currently lives inside `services/table-context/` via `table_session.drop_total_cents` et al. FACT-MODEL §5 open question governs whether a dedicated store emerges in Wave 2. |
| `services/shift-metrics/` | `services/shift-intelligence/` | Same scope (baselines, anomalies); Wave 1 envelope work targets the latter path. |

No supersession required — these are code-naming deltas, not decision drift.

---

## 2. Unit heterogeneity (current state)

Today, currency representation is split across two units. Wave 1 will normalize `FinancialValue.value` to **cents (integer)** at the service boundary. No schema migration — mapper-level conversion only (aligned with Wave 1 principle "surface before schema").

| Unit | Where it appears today | Wave 1 treatment |
|------|------------------------|------------------|
| Cents (integer) | Most service DTOs (player-financial, mtl, table-context, loyalty comps, shift-intelligence, rating_slip theo) | Pass-through — envelope `value = row.amount_cents` |
| Dollars (numeric) | `rating_slip.average_bet`, `pit_cash_observation.amount`, several visit-service DTOs (`session_total_buy_in`, `session_total_cash_out`, `session_net`, `total_buy_in`, `total_cash_out`, `net`) | Mapper multiplies ×100 when wrapping in envelope. Underlying schema unchanged in Wave 1. |

Exception: `rating_slip.average_bet` is **not wrapped** as a `FinancialValue` (it is a bet-rate *input parameter*, not a reported financial fact — see CLASSIFICATION-RULES §6).

---

## 3. Services — DTOs emitting currency

### 3.1 `services/player-financial/`

**Governance:** Class A (Ledger) — FACT-MODEL §D1. Authored facts with full attribution chain.

| DTO field | Origin | Current unit | Proposed authority | Proposed source | Completeness strategy | Wave 1 action |
|-----------|--------|--------------|--------------------|-----------------|------------------------|---------------|
| `FinancialTransactionDTO.amount` | `player_financial_transaction.amount` | cents | `actual` | `"PFT"` | `complete` per row | Wrap in envelope |
| `VisitFinancialSummaryDTO.total_in` | PFT aggregate over visit | cents | `actual` | `"PFT"` | `partial` while visit OPEN, `complete` when CLOSED | Wrap + lifecycle-aware completeness |
| `VisitFinancialSummaryDTO.total_out` | PFT aggregate | cents | `actual` | `"PFT"` | Same as total_in | Wrap |
| `VisitFinancialSummaryDTO.net_amount` | Derived (total_in − total_out) | cents | `actual` | `"PFT"` | Inherit worst of inputs | Wrap, mark derived in UI (Pattern B) |
| `VisitCashInWithAdjustmentsDTO.original_total` | PFT aggregate | cents | `actual` | `"PFT"` | Lifecycle-aware | Wrap |
| `VisitCashInWithAdjustmentsDTO.adjustment_total` | PFT adjustment rows | cents | `actual` | `"PFT.adjustment"` | Lifecycle-aware | Wrap |
| `VisitCashInWithAdjustmentsDTO.net_total` | Derived | cents | `actual` | `"PFT"` | Inherit worst | Wrap, Pattern B |
| `CreateFinancialTxnInput.amount` | Input | cents | n/a — inbound input | n/a | n/a | **Do not wrap** — inputs are bare `number`; validation enforced by Zod |

### 3.2 `services/rating-slip/`

**Governance:** Class A inputs + Class B-adjacent derivations. `average_bet` is operator input, not a financial fact.

| DTO field | Origin | Current unit | Proposed authority | Proposed source | Completeness strategy | Wave 1 action |
|-----------|--------|--------------|--------------------|-----------------|------------------------|---------------|
| `RatingSlipDTO.average_bet` | User input (dealer) | dollars | **Not wrapped** | — | — | Leave as bare `number`; UI must still label it (see §5 forbidden-label rules) |
| `UpdateAverageBetInput.average_bet` | Input | dollars | n/a | n/a | n/a | Inbound input — not wrapped |
| `RatingSlipWithPlayerDTO.average_bet` | Same as above | dollars | **Not wrapped** | — | — | Bare number |
| `ActivePlayerForDashboardDTO.averageBet` | Same as above | dollars | **Not wrapped** | — | — | Bare number |
| `ClosedSlipForGamingDayDTO.average_bet` | Same as above | dollars | **Not wrapped** | — | — | Bare number |
| `rating_slip.computed_theo_cents` (when surfaced) | Derived (avg_bet × hold × time) | cents | `estimated` | `"rating_slip.theo"` | `partial` for open slips, `complete` for closed, `unknown` for legacy | Wrap wherever surfaced |
| `rating_slip.legacy_theo_cents` (when surfaced) | Legacy computation | cents | `estimated` | `"rating_slip.theo.legacy"` | `unknown` (legacy provenance) | Wrap; `status: 'unknown'` mandatory |
| `PitCashObservationDTO.amount` | `pit_cash_observation.amount` | dollars | `observed` | `"pit_cash_observation"` | `complete` per row (single observation); `partial` in aggregates if sampling gaps | Wrap; ×100 in mapper |
| `CreatePitCashObservationInput.amount` | Input | dollars | n/a | n/a | n/a | Inbound input — not wrapped |

### 3.3 `services/visit/`

**Governance:** Projection over Class A (PFT) + rating slip inputs. All currency DTOs are `actual` when sourced from PFT.

| DTO field | Origin | Current unit | Proposed authority | Proposed source | Completeness strategy | Wave 1 action |
|-----------|--------|--------------|--------------------|-----------------|------------------------|---------------|
| `VisitLiveViewDTO.session_total_buy_in` | PFT rollup (currently pre-converted to dollars at service) | dollars | `actual` | `"PFT"` | `partial` while session OPEN, `complete` when CLOSED | Stop converting; emit cents in envelope |
| `VisitLiveViewDTO.session_total_cash_out` | PFT rollup | dollars | `actual` | `"PFT"` | Session-lifecycle | Same as above |
| `VisitLiveViewDTO.session_net` | Derived | dollars | `actual` | `"PFT"` | Inherit worst | Wrap, Pattern B |
| `CurrentSegment.current_segment_average_bet` | Rating slip (input) | dollars | **Not wrapped** | — | — | Bare number (same reason as §3.2) |
| `RecentSessionDTO.total_buy_in` | PFT rollup | dollars | `actual` | `"PFT"` | `complete` (closed sessions only) | Wrap |
| `RecentSessionDTO.total_cash_out` | PFT rollup | dollars | `actual` | `"PFT"` | `complete` | Wrap |
| `RecentSessionDTO.net` | Derived | dollars | `actual` | `"PFT"` | Inherit | Wrap, Pattern B |
| `LastSessionContextDTO.last_average_bet` | Rating slip | dollars | **Not wrapped** | — | — | Bare number |

**Service-wide migration:** visit service's dollar pre-conversion at the boundary must be removed in Phase 1.1. Envelope `value` is cents.

### 3.4 `services/mtl/`

**Governance:** Compliance fact (FACT-MODEL §D1 taxonomy-only). Parallel regulatory domain; labeled for surface consistency, not governed by the frozen ADR set for authoring rules.

| DTO field | Origin | Current unit | Proposed authority | Proposed source | Completeness strategy | Wave 1 action |
|-----------|--------|--------------|--------------------|-----------------|------------------------|---------------|
| `MtlEntryDTO.amount` | `mtl_entry.amount` | cents | `compliance` | `"mtl_entry"` | `complete` per row | Wrap |
| `MtlGamingDaySummaryDTO.total_in` | MTL aggregate | cents | `compliance` | `"mtl_entry"` | `partial` until gaming day closes, `complete` after close, `unknown` at ambiguous boundary | Wrap |
| `MtlGamingDaySummaryDTO.total_out` | MTL aggregate | cents | `compliance` | `"mtl_entry"` | Gaming-day-lifecycle | Wrap |
| `MtlGamingDaySummaryDTO.max_single_in` | MTL max | cents | `compliance` | `"mtl_entry"` | Gaming-day-lifecycle | Wrap |
| `MtlGamingDaySummaryDTO.max_single_out` | MTL max | cents | `compliance` | `"mtl_entry"` | Gaming-day-lifecycle | Wrap |
| `MtlGamingDaySummaryDTO.total_volume` | MTL aggregate | cents | `compliance` | `"mtl_entry"` | Gaming-day-lifecycle | Wrap |
| `CreateMtlEntryInput.amount` | Input | cents | n/a | n/a | n/a | Not wrapped — input |
| `CasinoThresholds.watchlistFloor` | Static config | cents | **Not wrapped** | — | — | Policy threshold, not a financial fact — bare number |
| `CasinoThresholds.ctrThreshold` | Static config | cents | **Not wrapped** | — | — | Policy threshold — bare number |

**Note (SRC §C1 / compliance):** `compliance`-class values MUST NEVER be aggregated into a `derived` total with any other authority class (see CLASSIFICATION-RULES §2). UI must hold MTL amounts in their own component.

### 3.5 `services/table-context/`

**Governance:** Heavily mixed. Class B operational facts (fills/credits/drops) + observed physical counts (opening/closing inventory attestations) + derived operational computations (need totals, discrepancies) + policy config (min/max bet).

| DTO field | Origin | Current unit | Proposed authority | Proposed source | Completeness strategy | Wave 1 action |
|-----------|--------|--------------|--------------------|-----------------|------------------------|---------------|
| `TableFillDTO.amount_cents` | `table_fill.amount_cents` (requested) | cents | `estimated` | `"table_session.fill.requested"` | `complete` per row | Wrap |
| `TableFillDTO.confirmed_amount_cents` | `table_fill.confirmed_amount_cents` | cents | `estimated` | `"table_session.fill.confirmed"` | `complete` if confirmed, `unknown` if null | Wrap |
| `RequestTableFillInput.amountCents` | Input | cents | n/a | n/a | n/a | Not wrapped |
| `TableCreditDTO.amount_cents` | `table_credit.amount_cents` | cents | `estimated` | `"table_session.credit.requested"` | `complete` per row | Wrap |
| `TableCreditDTO.confirmed_amount_cents` | Same | cents | `estimated` | `"table_session.credit.confirmed"` | `complete` if confirmed, `unknown` if null | Wrap |
| `RequestTableCreditInput.amountCents` | Input | cents | n/a | n/a | n/a | Not wrapped |
| `TableSessionDTO.credits_total_cents` | Session rollup | cents | `estimated` | `"table_session.credits_total"` | `partial` while session OPEN, `complete` when CLOSED | Wrap |
| `TableSessionDTO.fills_total_cents` | Session rollup | cents | `estimated` | `"table_session.fills_total"` | Session-lifecycle | Wrap |
| `TableSessionDTO.drop_total_cents` | Posted at close | cents | `estimated` | `"table_session.drop"` | `complete` after post, `unknown` before post, `partial` never | Wrap; drives Class B surfaces |
| `TableSessionDTO.need_total_cents` | Derived operational | cents | `estimated` | `"table_session.need"` | Session-lifecycle | Wrap, Pattern B (derived) |
| `OpeningAttestationDTO.openingTotalCents` | Physical inventory count | cents | `observed` | `"table_inventory_snapshot.opening"` | `complete` if attested, `unknown` otherwise | Wrap |
| `OpeningAttestationDTO.predecessorCloseTotalCents` | Prior session close attestation | cents | `observed` | `"table_inventory_snapshot.closing"` | `complete` if attested, `unknown` otherwise | Wrap |
| `ActivateTableSessionParams.openingTotalCents` | Input | cents | n/a | n/a | n/a | Not wrapped |
| `PostTableDropTotalInput.dropTotalCents` | Input | cents | n/a | n/a | n/a | Not wrapped |
| `TableRundownDTO.opening_total_cents` | Inventory observation | cents | `observed` | `"table_inventory_snapshot.opening"` | `complete`/`unknown` per attestation | Wrap |
| `TableRundownDTO.closing_total_cents` | Inventory observation | cents | `observed` | `"table_inventory_snapshot.closing"` | `complete`/`unknown` | Wrap |
| `TableRundownDTO.fills_total_cents` | Session rollup | cents | `estimated` | `"table_session.fills_total"` | Session-lifecycle | Wrap |
| `TableRundownDTO.credits_total_cents` | Session rollup | cents | `estimated` | `"table_session.credits_total"` | Session-lifecycle | Wrap |
| `TableRundownDTO.drop_total_cents` | Session close | cents | `estimated` | `"table_session.drop"` | `complete` after post | Wrap |
| `TableRundownDTO.table_win_cents` | Derived (inventory math) | cents | `estimated` | `"table_session.inventory_win"` | Inherit worst from inputs | Wrap, Pattern B (derived, declare inputs per SRC §C3) |
| `TableInventorySnapshotDTO.discrepancy_cents` | Derived (expected − observed) | cents | `estimated` | `"table_inventory_snapshot.discrepancy"` | Inherit worst | Wrap, Pattern B |
| `CashObsTableRollupDTO.cash_out_observed_estimate_total` | Extrapolation | cents | `estimated` | `"pit_cash_observation.extrapolated"` | `partial` if sampling gaps, `unknown` if coverage unknown | Wrap |
| `CashObsTableRollupDTO.cash_out_observed_confirmed_total` | Confirmed counts | cents | `observed` | `"pit_cash_observation.confirmed"` | `partial` in rollup if any row missing | Wrap |
| `CashObsPitRollupDTO.cash_out_observed_estimate_total` | Extrapolation | cents | `estimated` | `"pit_cash_observation.extrapolated"` | `partial`/`unknown` | Wrap |
| `CashObsPitRollupDTO.cash_out_observed_confirmed_total` | Confirmed counts | cents | `observed` | `"pit_cash_observation.confirmed"` | `partial` in rollup | Wrap |
| `CashObsCasinoRollupDTO.cash_out_observed_estimate_total` | Extrapolation | cents | `estimated` | `"pit_cash_observation.extrapolated"` | `partial`/`unknown` | Wrap |
| `CashObsCasinoRollupDTO.cash_out_observed_confirmed_total` | Confirmed counts | cents | `observed` | `"pit_cash_observation.confirmed"` | `partial` in rollup | Wrap |
| `TableSettingsDTO.min_bet` | Static config | numeric (dollars) | **Not wrapped** | — | — | Policy bound |
| `TableSettingsDTO.max_bet` | Static config | numeric (dollars) | **Not wrapped** | — | — | Policy bound |
| `UpdateTableLimitsDTO.min_bet` | Input | numeric | n/a | n/a | n/a | Not wrapped |
| `UpdateTableLimitsDTO.max_bet` | Input | numeric | n/a | n/a | n/a | Not wrapped |

**Cash-obs rollup split (SRC §C1 compliance):** Extrapolated (`estimated`) and confirmed (`observed`) MUST remain separate envelopes. Mixed-authority aggregate is forbidden; Pattern A split display is mandatory.

### 3.6 `services/loyalty/`

**Governance:** Comp face value is `actual` monetary authoring. Points are a **separate unit system** (non-currency) and are NOT wrapped.

| DTO field | Origin | Current unit | Proposed authority | Proposed source | Completeness strategy | Wave 1 action |
|-----------|--------|--------------|--------------------|-----------------|------------------------|---------------|
| `AccrueOnCloseOutput.theo` | Computed from rating slip | cents | `estimated` | `"loyalty.theo"` | `complete` on close, `unknown` for gapped sessions | Wrap |
| `CompIssuanceResult.faceValueCents` | Authored at issuance | cents | `actual` | `"loyalty.comp_face_value"` | `complete` per issuance | Wrap |
| `CompFulfillmentPayload.face_value_cents` | Same | cents | `actual` | `"loyalty.comp_face_value"` | `complete` | Wrap |
| `EntitlementFulfillmentPayload.face_value_cents` | Same | cents | `actual` | `"loyalty.entitlement_face_value"` | `complete` | Wrap |
| `EntitlementFulfillmentPayload.required_match_wager_cents` | Policy requirement | cents | **Not wrapped** | — | — | Policy parameter, not a fact |
| `ValuationPolicyDTO.centsPerPoint` | Static config ratio | cents/point | **Not wrapped** | — | — | Config ratio |
| `UpdateValuationPolicyInput.centsPerPoint` | Input | cents/point | n/a | n/a | n/a | Not wrapped |
| `LoyaltyLedgerEntryDTO.pointsDelta` | `loyalty_ledger.points_delta` | **points (not currency)** | — | — | — | **Not wrapped** — different unit system |
| `PlayerLoyaltyDTO.currentBalance` | Points rollup | points | — | — | — | Not wrapped |
| `AccrueOnCloseOutput.pointsDelta` | Points | points | — | — | — | Not wrapped |
| `AccrueOnCloseOutput.balanceAfter` | Points | points | — | — | — | Not wrapped |
| `RedeemInput.points` | Input | points | n/a | n/a | n/a | Not wrapped |
| `RedeemOutput.pointsDelta` | Points | points | — | — | — | Not wrapped |
| `RedeemOutput.balanceBefore` | Points | points | — | — | — | Not wrapped |
| `RedeemOutput.balanceAfter` | Points | points | — | — | — | Not wrapped |
| `ManualCreditInput.points` | Input | points | n/a | n/a | n/a | Not wrapped |
| `ManualCreditOutput.pointsDelta` | Points | points | — | — | — | Not wrapped |
| `ManualCreditOutput.balanceAfter` | Points | points | — | — | — | Not wrapped |
| `ApplyPromotionInput.bonusPoints` | Input | points | n/a | n/a | n/a | Not wrapped |
| `ApplyPromotionOutput.promoPointsDelta` | Points | points | — | — | — | Not wrapped |
| `CompIssuanceResult.pointsDebited` | Points | points | — | — | — | Not wrapped |
| `CompIssuanceResult.balanceBefore` | Points | points | — | — | — | Not wrapped |
| `CompIssuanceResult.balanceAfter` | Points | points | — | — | — | Not wrapped |
| `CompFulfillmentPayload.points_redeemed` | Points | points | — | — | — | Not wrapped |
| `CompFulfillmentPayload.balance_after` | Points | points | — | — | — | Not wrapped |

**Points carve-out rationale:** SRC §3 and FACT-MODEL §D1/D4 scope the envelope to *financial* facts expressed in currency. Points are a loyalty unit with their own authority/provenance model (outside this ADR set). UI rendering points still needs its own labeling discipline, but that is out of scope for this rollout and should be opened as a separate proposal if needed.

### 3.7 `services/rating-slip-modal/`

**Governance:** Projection over PFT for the rating-slip review modal. Surfaced to pit bosses during slip close. Source is `visit_financial_summary` (a PFT view) — authority is `actual`.

**Audit finding (SUPERSEDES naming):** `totalChipsOut` is misleading — "Chips" semantically implies `observed` (physical count), but source is PFT (`actual`). The audit (§7 row `dtos.ts:149`) flagged this as naming-confusion risk. Wave 1 renames it at the DTO boundary.

| DTO field | Origin | Current unit | Proposed authority | Proposed source | Completeness strategy | Wave 1 action |
|-----------|--------|--------------|--------------------|-----------------|------------------------|---------------|
| `FinancialSectionDTO.totalCashIn` (dtos.ts:146) | `visit_financial_summary` (PFT) | cents | `actual` | `"PFT"` | Lifecycle-aware (visit OPEN vs CLOSED) | Wrap |
| `FinancialSectionDTO.totalChipsOut` (dtos.ts:149) | `visit_financial_summary` (PFT) | cents | `actual` | `"PFT"` | Lifecycle-aware | **Rename to `totalCashOut` + wrap.** The "Chips" semantics is wrong; this is ledger cash-out, not physical chip count. |
| `FinancialSectionDTO.netPosition` (dtos.ts:152) | Derived (totalCashIn − totalCashOut) | cents | `actual` | `"PFT"` | Inherit worst | Wrap, Pattern B (derived, declare inputs per SRC §C3) |

### 3.8 `services/shift-intelligence/`

**Governance:** Derived analytics over Class B / observed data. Baselines are statistical derivations, anomaly observations report current vs expected.

| DTO field | Origin | Current unit | Proposed authority | Proposed source | Completeness strategy | Wave 1 action |
|-----------|--------|--------------|--------------------|-----------------|------------------------|---------------|
| `BaselineDTO.medianValue` | Historical rollup over drop_total / cash_obs / win_loss | cents | `estimated` | `"shift_baseline.median"` | `partial` if sampling gaps, `unknown` if series too short | Wrap |
| `BaselineDTO.minValue` | Historical extremum | cents | `estimated` | `"shift_baseline.min"` | Same as median | Wrap |
| `BaselineDTO.maxValue` | Historical extremum | cents | `estimated` | `"shift_baseline.max"` | Same as median | Wrap |
| `AnomalyAlertDTO.observedValue` | Current session value | cents | Mirror source authority (see note) | `"<source>"` | Inherit from source | Wrap |
| `AnomalyAlertDTO.baselineMedian` | Same as BaselineDTO.medianValue | cents | `estimated` | `"shift_baseline.median"` | Same as BaselineDTO | Wrap |
| `AnomalyAlertDTO.thresholdValue` | Policy bound | cents | **Not wrapped** | — | — | Config threshold |
| `ShiftAlertDTO.observedValue` | Current value | cents | Mirror source authority | `"<source>"` | Inherit from source | Wrap |
| `ShiftAlertDTO.baselineMedian` | Historical | cents | `estimated` | `"shift_baseline.median"` | Same | Wrap |

**Note on `observedValue`:** the authority label must mirror whichever source fed the metric — if the metric is `drop_total`, authority is `estimated`; if `cash_obs_total` confirmed, `observed`. Mapper reads a metric-kind discriminator and routes accordingly. Phase 1.1 will codify the metric → authority map.

---

## 4. API routes — envelope at the wire

Routes returning currency today. Phase 1.2 updates every handler to serialize the service-layer envelope verbatim (no flattening).

| Route | Handler | Fields wrapped | OpenAPI action |
|-------|---------|----------------|----------------|
| `GET /api/v1/financial-transactions` | `app/api/v1/financial-transactions/route.ts` | `items[].amount` | Update schema; envelope per item |
| `POST /api/v1/financial-transactions` | Same | Inbound input (bare number); outbound created record envelope-wrapped | Split request/response schemas |
| `GET /api/v1/visits` / visit views | `app/api/v1/visits/**/route.ts` | Session totals, segment totals | Update schema |
| `GET /api/v1/rating-slips` | `app/api/v1/rating-slips/route.ts` | Theo (if surfaced); `average_bet` stays bare with explicit label | Update schema; flag `average_bet` as labeled bare number |
| `GET /api/v1/table-sessions` | `app/api/v1/table-sessions/**/route.ts` | All `*_total_cents` fields | Update schema |
| `GET /api/v1/table-rundown-reports` | `app/api/v1/table-rundown-reports/route.ts` | Opening/closing/drop/fills/credits/table_win | Update schema |
| `GET /api/v1/shift-checkpoints` | `app/api/v1/shift-checkpoints/route.ts` | Metric values + baselines | Update schema |
| Any MTL gaming-day summary route | `app/api/v1/mtl/**/route.ts` | MtlGamingDaySummary totals | Update schema |

**Convention:** OpenAPI component schema `FinancialValue` defined once, referenced across endpoints. No per-route redefinition. Deprecated raw-total endpoints (if any surface during Phase 1.2) get a dated sunset line in the OpenAPI description.

---

## 5. UI components — rendered currency surfaces

Every surface here loses its local formatter and switches to `components/financial/FinancialValue` (Phase 1.3). Forbidden labels remain in prod until Phase 1.3 lands.

### 5.1 Known SRC violations (must fix in Phase 1.3)

Confirmed by merging the independent `SURFACE-CLASSIFICATION-AUDIT.md` findings with direct grep verification on 2026-04-23:

| File:line | Violation | SRC clause | Required fix |
|-----------|-----------|------------|--------------|
| `app/(landing)/floor-oversight/page.tsx` | Label `"Coverage quality"` used for attribution KPI | §K1 | Rename to `"Attribution Ratio"`; route through `<AttributionRatio>` component. |
| `components/pit-panels/analytics-panel.tsx:169` | Estimated-drop metric labeled `"Handle"` with no authority badge | §L3 (forbidden name), §F3 (silent estimation) | Replace label with `"Estimated Drop"`; wrap with `<FinancialValue type="estimated">`. |
| `components/player-360/summary/summary-band.tsx` ("Theo Estimate" row, audit §5 line 137) | `theoEstimate` is hardcoded `0` in mappers (audit Stream B #1); UI renders `$0` as if authoritative | §F4 (placeholder authority) | **Q-A7 resolution (SIGNOFF §2):** Phase 1.1 emits envelope with `type: 'estimated'`, `source: "rating_slip.theo"`, `completeness.status: 'unknown'`. Phase 1.3 `/frontend-design-pt-2` renders with authority-labeled "Not computed" badge. Interim violation ships until Phase 1.3 unless product elects out-of-phase patch. |
| `services/rating-slip-modal/dtos.ts:149` | DTO field `totalChipsOut` — "Chips" implies `observed`; source is PFT (`actual`) | §L3 wording-mismatch | **Q-A8 resolution (SIGNOFF §2):** Rename to `totalCashOut` in Phase 1.1. Scope: DTO + mapper + schema + RPC + API/OpenAPI + UI + tests + docs. FORBIDDEN-LABELS §2.D rule promoted to active. |

**Absence ≠ compliance.** The broader grep for `"Total In"`, `"Total Drop"`, `"Theo: 0"` literals turns up zero hits — but the dominant violation class in PT-2 today is **bare currency rendered without an authority label**, which fails SRC §L1 regardless of label text. Audit Stream A confirms pervasive unlabeled custody-chain `actual` (`estimated` under the frozen model) values across `components/shift-dashboard/` and `rundown-summary-panel`.

### 5.2 Surface inventory (components to migrate)

Merges the audit's Streams A–C with the broader grep-based inventory. Shift-dashboard variants split: **v3 is the most matrix-conformant surface today** (audit §4 Hot Finding #1) with `ESTIMATE/AUTHORITATIVE/TELEMETRY` badges; **legacy `components/shift-dashboard/`** lags and needs full badge migration or deprecation.

| Area | Files | Currency rendered | Audit state | Migration target |
|------|-------|-------------------|-------------|------------------|
| Shift dashboard v3 (lead) | `components/shift-dashboard-v3/left-rail/**`, `/center/metrics-table.tsx`, `/right-rail/telemetry-rail-panel.tsx` | Win/Loss, fills/credits, Est. Drop, Cash Out (observed est./confirmed) | Mostly labeled; `Fills`/`Credits` unlabeled at `secondary-kpi-stack.tsx:74,80` and `metrics-table.tsx:100–103` | `<FinancialValue>` replaces local badge pattern; preserves semantics |
| Shift dashboard legacy | `components/shift-dashboard/pit-metrics-table.tsx`, `table-metrics-table.tsx` | Inv Win / Est Win, Fills, Credits (pit + table rollups) | No badge system; column headers "Inv"/"Est" partial signal | Full `<FinancialValue>` migration or deprecate in favor of v3 |
| Shift dashboard v2 | `app/review/shift-dashboard-v2/**` | Shift metrics (mixed `estimated` / `observed`) | Unaudited (not covered by SURFACE-CLASSIFICATION-AUDIT streams A–D) | Phase 1.3 re-grep; `<FinancialValue>` + split display; `<AttributionRatio>` if KPI rendered |
| Pit panels | `components/pit-panels/analytics-panel.tsx:169` (**"Handle" violation**), `/closed-sessions-panel.tsx` | Win/Loss (actual), Estimated drop mislabeled as Handle | §5.1 violation | Fix label + wrap |
| Table rundown | `components/table/rundown-summary-panel.tsx:205–218,229,242` | Fills, Credits, Drop Total, Win/Loss | Unlabeled; drop gated on `drop_posted_at` but origin not surfaced | Full `<FinancialValue>` migration, Pattern B for derived Win/Loss |
| Player 360 | `components/player-360/summary/summary-band.tsx:136–155`, `/left-rail/filter-tile-stack.tsx:87` | Session Value, **Theo Estimate (=0 stub, §5.1 violation)**, Cash Velocity, Rate/hr | Unlabeled; Theo is placeholder | Wrap cells; **Theo renders envelope with `status: 'unknown'` + "Not computed" badge** per Q-A7 (frontend-design-pt-2 specifies badge treatment in Phase 1.3) |
| Player sessions | `components/player-sessions/start-from-previous.tsx:213,219,237` | total_buy_in, total_cash_out, net | Unlabeled PFT aggregates | `<FinancialValue>`; Pattern B for net |
| Cashier | `components/cashier/amount-display.tsx`, `/cash-out-form.tsx:54` | Amount display + form input | Form input is operator-draft until POST (audit Stream C #2) | `<FinancialValue>` for committed; **"Draft" badge** for in-form input |
| MTL | `components/mtl/gaming-day-summary.tsx:158–163,272,288`, `/compliance-dashboard.tsx:132`, `/entry-badge.tsx`, `/agg-badge.tsx` | MTL totals, badges | Mostly labeled (MTL badge) — correct per audit | `<FinancialValue type="compliance">` formalizes existing badges |
| Admin alerts | `components/admin-alerts/alert-detail-card.tsx:104,110` | Observed Value, Alert Threshold | Correctly labeled `Observed` today | Formalize under `<FinancialValue type="observed">` |
| Loyalty | `components/loyalty/comp-confirm-panel.tsx`, `/entitlement-confirm-panel.tsx` | Comp face value (`actual`), points (separate) | Unaudited in streams A–D | `<FinancialValue>` for cents; points unwrapped |
| Rating slip | `components/rating-slip/buy-in-threshold-indicator.tsx:171,174` | CTR `currentDailyTotal`, `newBuyInAmount` | Props untraced at component (audit Stream B #3) | Caller must pass typed envelope; component reads `.type` + `.source` |
| Pit map | `app/review/pit-map/components/table-card.tsx` | Table session totals (`estimated`) | Unaudited in streams A–D | `<FinancialValue>` |
| Floor oversight | `app/(landing)/floor-oversight/page.tsx` | KPI ("Coverage quality" — §5.1 violation); currency aggregates | Rename required | Rename to `"Attribution Ratio"`; migrate to `<AttributionRatio>` |

### 5.3 Local formatter consolidation

Phase 1.3 eliminates local formatter duplication in favor of the shared `<FinancialValue>` component. The following `formatDollars`/`formatCents` variants will be removed (non-exhaustive — Phase 1.3 will re-grep):

- `lib/format.ts` — exported `formatDollars`, `formatCents`, `formatDollarsDelta` remain (internal helper; no authority labeling)
- `app/review/shift-dashboard-v2/lib/format.ts` — local `formatCents`, `formatCentsDelta`
- 18+ inline `formatDollarsLocal` / `.toFixed(2)` / `$`-prefix patterns across component files (enumerated in Phase 1.3)

`<FinancialValue>` internally uses the shared `lib/format.ts` helpers for the number formatting step; label composition is the component's responsibility.

---

## 6. Phase 1.0 Resolved Decisions (formerly "Open questions")

> **Status:** All 8 questions Q-A1 through Q-A8 resolved on 2026-04-23. See `actions/WAVE-1-PHASE-1.0-SIGNOFF.md` for full decision records and `actions/WAVE-1-CLASSIFICATION-RULES.md §7` for the summary table.

Inventory impact summary:
- Q-A1 — `average_bet` not wrapped; UI labels as "Input" with visual distinction from envelope-wrapped theo. (Inventory §3.2, §3.3)
- Q-A2 — `observed` / `compliance` rows in pit-cash, table-inventory, and MTL surfaces are live sources for envelope labeling. (Inventory §3.4, §3.5)
- Q-A3 — Service-private source strings — tests and UI branching rules govern usage. (All §3.x tables)
- Q-A4 — Cash-obs rollups Pattern A split mandatory. (Inventory §3.5 cash-obs subsection)
- Q-A5 — Metric-kind routing principle approved; concrete map is Phase 1.1 deliverable. (Inventory §3.8)
- Q-A6 — Dollar→cents mapper conversion; rounding-test pinning required in Phase 1.1. (Inventory §2 unit heterogeneity)
- Q-A7 — Theo renders `unknown` envelope + "Not computed" badge; UI treatment Phase 1.3. (Inventory §5.1, §5.2 Player 360 row)
- Q-A8 — `totalChipsOut` → `totalCashOut` Phase 1.1 rename with full consumer scope. (Inventory §3.7, §5.1)

---

## 7. Coverage summary

- **8 services** enumerated with currency DTOs (`player-financial`, `rating-slip`, `rating-slip-modal`, `visit`, `mtl`, `table-context`, `loyalty`, `shift-intelligence`).
- **~8 API route families** in scope for Phase 1.2.
- **~13 UI surface families** in scope for Phase 1.3 (audit-merged).
- **4 confirmed SRC violations** in current codebase (§5.1): `Coverage quality` label, `Handle` label at analytics-panel.tsx:169, stubbed `Theo: 0` in player-360 summary, misleading `totalChipsOut` DTO field name.
- **Dominant violation class:** unlabeled bare currency across custody-chain actuals — not forbidden label literals. Audit Stream A found this pervasive in legacy shift-dashboard and rundown panels.

Phase 1.0 exit gate review: lead-architect walks this doc end-to-end with the classification rules and signs off the open questions (§6) before Phase 1.1 opens.

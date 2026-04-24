---
name: Wave 1 — Classification Rules
description: Source-to-authority mapping for every financial value emitted by PT-2 services; the canonical rulebook for populating FinancialValue.type/source/completeness at the service boundary.
status: Draft (pending lead-architect sign-off at Phase 1.0 exit gate)
date: 2026-04-23
phase: 1.0
derives_from:
- actions/SURFACE-RENDERING-CONTRACT.md §3, §10
- decisions/ADR-FINANCIAL-FACT-MODEL.md §D1, §D3, §D4, §5
- decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md §4
- actions/WAVE-1-SURFACE-INVENTORY.md
- ../SURFACE-CLASSIFICATION-AUDIT.md §8 (matrix-gap findings)
feeds:
- types/financial.ts
- Phase 1.1 service mapper implementation
- Phase 1.4 ESLint rule generation
---

# Wave 1 — Classification Rules

> **Purpose:** eliminate guesswork when a service needs to wrap a currency value. For every source, this doc fixes `type`, `source`, and the completeness strategy. Phase 1.1 mappers consume this as a table.

---

## 1. Scope

This document governs:
- How each live source of currency data in PT-2 maps to `FinancialValue.type` / `source` / `completeness.status`.
- Which values are **not** wrapped in the envelope and why.
- Unit normalization (cents-only envelope).

This document does **not** govern:
- Schema changes (Wave 2).
- Outbox/event authoring mechanics (Wave 2 under ADR-FINANCIAL-EVENT-PROPAGATION).
- Compliance-domain authoring rules (parallel ADR set).

---

## 2. Authority taxonomy summary

Per SRC §3 and FACT-MODEL §D1/D4, the envelope carries exactly four authority values:

| `type` | Meaning | Authored in pilot? | Pilot sources |
|--------|---------|--------------------|---------------|
| `actual` | Ledger financial fact — player-attributed, append-only, auditable (Class A) | Yes | PFT (`player_financial_transaction`), loyalty comp face values |
| `estimated` | Operational financial fact — table-anchored, player attribution absent (Class B) | Yes | `table_session.drop/fills/credits/need_total_cents`, `table_fill`/`table_credit` custody-chain, rating-slip theo, cash-obs extrapolations, shift baselines |
| `observed` | Physical count — non-transactional observation (taxonomy-only in FACT-MODEL) | Taxonomy-only per FACT-MODEL §D1, but rows **are** authored today | `pit_cash_observation`, `table_inventory_snapshot` opening/closing attestations |
| `compliance` | Regulatory record — parallel domain, not governed by this ADR set | Taxonomy-only for the pilot | `mtl_entry` + `mtl_gaming_day_summary` view |

**Important clarification on `observed` / `compliance`:** FACT-MODEL §D1 labels them "taxonomy only, not authored in pilot" because this ADR set does not govern their *authoring* rules. But the corresponding rows are authored in PT-2 today under other owners (cash-obs and MTL), and their surfaces must use the matching authority label for consistency. Wave 1 treats them as live sources for envelope labeling purposes. This is a rendering decision, not a claim of governance — escalated for sign-off as §7 Q-A2.

---

## 3. Source-to-authority mapping (canonical)

Primary table. Phase 1.1 mappers consume this directly. Column semantics match `WAVE-1-SURFACE-INVENTORY.md §0`.

### 3.1 Class A — `actual` (Ledger)

| Source (physical) | Source string (`FinancialValue.source`) | Unit in DB | Completeness default | Notes |
|-------------------|----------------------------------------|------------|----------------------|-------|
| `player_financial_transaction.amount` (base row) | `"PFT"` | cents | `complete` per row | R1 append-only (FACT-MODEL §3.R1). Adjustments are separate rows with source `"PFT.adjustment"`. |
| `player_financial_transaction.amount` (visit aggregate) | `"PFT"` | cents | `partial` while visit OPEN; `complete` when CLOSED; `unknown` if visit lifecycle ambiguous | Consumed by `VisitFinancialSummaryDTO.total_in/out/net_amount` |
| `player_financial_transaction.amount` (session aggregate) | `"PFT"` | cents | `partial` while session OPEN; `complete` when CLOSED | Consumed by `VisitLiveViewDTO`, `RecentSessionDTO` |
| PFT derived (net = in − out) | `"PFT"` | cents | Inherit worst-case of inputs | Pattern B in UI; declare inputs per SRC §C3 |
| `loyalty_comp.face_value_cents` | `"loyalty.comp_face_value"` | cents | `complete` per issuance | Authored at comp grant; no lifecycle uncertainty |
| `loyalty_entitlement.face_value_cents` | `"loyalty.entitlement_face_value"` | cents | `complete` per issuance | Same |

### 3.2 Class B — `estimated` (Operational)

FACT-MODEL §D1: "Class B — Operational Financial Fact: grind (unrated buy-ins) **and equivalent table-level money movement**."

**Resolution of the SURFACE-CLASSIFICATION-AUDIT §8.1 "Custody Fact" matrix-gap:** the audit proposed a fifth `custody` class for fills/credits/drop_total. FACT-MODEL §D1's "equivalent table-level money movement" explicitly folds custody-chain into Class B. No new class is introduced; fills/credits/drop classify as `estimated` with distinct `source` strings. Revisit only if Wave 2 decides custody warrants a discriminator column (FACT-MODEL §5 open question).

| Source (physical) | Source string | Unit in DB | Completeness default | Notes |
|-------------------|---------------|------------|----------------------|-------|
| `table_fill.amount_cents` | `"table_session.fill.requested"` | cents | `complete` per row | Operational fill request |
| `table_fill.confirmed_amount_cents` | `"table_session.fill.confirmed"` | cents | `complete` if non-null; `unknown` if null | Confirmation may be pending |
| `table_credit.amount_cents` | `"table_session.credit.requested"` | cents | `complete` per row | |
| `table_credit.confirmed_amount_cents` | `"table_session.credit.confirmed"` | cents | `complete` if non-null; `unknown` if null | |
| `table_session.fills_total_cents` | `"table_session.fills_total"` | cents | `partial` while session OPEN; `complete` when CLOSED | Rollup |
| `table_session.credits_total_cents` | `"table_session.credits_total"` | cents | `partial` while OPEN; `complete` when CLOSED | Rollup |
| `table_session.drop_total_cents` | `"table_session.drop"` | cents | `complete` after `drop_posted_at`; `unknown` before post; **never `partial`** (drop is a single attested event) | Primary Class B signal |
| `table_session.need_total_cents` | `"table_session.need"` | cents | `partial` while OPEN; `complete` when CLOSED | Derived operational |
| `rating_slip.computed_theo_cents` | `"rating_slip.theo"` | cents | `partial` if slip has gaps; `complete` if no gaps | Derived from average_bet × hold × time |
| `rating_slip.legacy_theo_cents` | `"rating_slip.theo.legacy"` | cents | **Always `unknown`** (legacy provenance not traceable) | Legacy rows only |
| Cash-obs extrapolated rollups (`cash_out_observed_estimate_total`) | `"pit_cash_observation.extrapolated"` | cents | `partial` if sampling gaps; `unknown` if coverage unknown | Extrapolation, not raw observation |
| Shift-intelligence baselines (median/min/max) | `"shift_baseline.<metric>"` | cents | `partial` if sampling gaps; `unknown` if series too short | Historical derivation |
| `table_session.table_win_cents` (derived Win/Loss) | `"table_session.inventory_win"` | cents | Inherit worst of (opening, closing, fills, credits, drop) | Composite; Pattern B required; SRC §C3 declare inputs |
| `table_inventory_snapshot.discrepancy_cents` | `"table_inventory_snapshot.discrepancy"` | cents | Inherit worst of (expected, observed) | Derived |

**TBT / grind authoring note (Q-A3 reference):** FACT-MODEL §D3 names a future "grind" authoring store as a Wave 2 open question. Today, Class B data authored through operational flow (table_session aggregates, fill/credit rows) carries source strings that are **internal to services**, NOT exposed in UI. Wave 2 can rename/consolidate source strings (e.g., `"grind.buy_in"`) without UI churn because consumers render `type` + UI-provided label, not `source`.

### 3.3 `observed` (Physical observation)

| Source (physical) | Source string | Unit in DB | Completeness default | Notes |
|-------------------|---------------|------------|----------------------|-------|
| `pit_cash_observation.amount` | `"pit_cash_observation"` | dollars | `complete` per row; `partial` in aggregates if sampling gaps; `unknown` if cadence can't be verified | Row-level observation |
| Cash-obs confirmed rollups (`cash_out_observed_confirmed_total`) | `"pit_cash_observation.confirmed"` | cents | `partial` in rollup if any row missing; `complete` when all present | Confirmed physical counts |
| `table_inventory_snapshot.opening_total_cents` | `"table_inventory_snapshot.opening"` | cents | `complete` if attested; `unknown` otherwise | Physical count at session open |
| `table_inventory_snapshot.closing_total_cents` | `"table_inventory_snapshot.closing"` | cents | `complete` if attested; `unknown` otherwise | Physical count at session close |

### 3.4 `compliance` (MTL / regulatory)

| Source (physical) | Source string | Unit in DB | Completeness default | Notes |
|-------------------|---------------|------------|----------------------|-------|
| `mtl_entry.amount` (per row) | `"mtl_entry"` | cents | `complete` per row | |
| `mtl_gaming_day_summary.total_in/total_out/total_volume/max_single_*` | `"mtl_entry"` (aggregate) | cents | `partial` until gaming day closes; `complete` after close; `unknown` at ambiguous boundary | Gaming-day-lifecycle signal from `rpc_current_gaming_day()` |

**Compliance isolation rule (SRC §C1):** `compliance`-class values MUST NEVER be aggregated with any other authority class into a single derived envelope. Surfaces render them in their own component. Phase 1.3 must verify no UI math combines MTL totals with PFT / Class B values.

---

## 4. Unit normalization rule

**Canonical unit for `FinancialValue.value` is cents (integer).** Service mappers are responsible for conversion at the envelope boundary.

| Field (current) | Current unit | Mapper action |
|-----------------|--------------|----------------|
| `player_financial_transaction.amount`, all MTL `amount`, `*_cents` fields across table-context/loyalty/shift-intelligence | cents | Pass-through: `value = row.<field>` |
| `pit_cash_observation.amount` | dollars | Multiply ×100: `value = Math.round(row.amount * 100)`. (Store-level migration deferred to Wave 2 per §7 Q-A6.) |
| Visit service DTOs currently pre-converted to dollars (`session_total_buy_in`, `session_total_cash_out`, `session_net`, `total_buy_in`, `total_cash_out`, `net`) | dollars (output) | **Stop pre-converting in mapper.** Envelope emits cents. UI formats. |

**Why cents, not "unit in envelope":** SRC §10 freezes the envelope shape with `value: number` only — no unit discriminator. Adding one is additive drift past the frozen set. Convention (cents everywhere) keeps the envelope shape pure and eliminates a whole class of marshaling bugs.

**Rounding rule for dollar→cents conversion:** `Math.round(dollars * 100)`. Never `Math.floor` or `Math.trunc` — floor would silently drop sub-cent precision into a systematic bias. Document rounding convention in mapper source.

---

## 5. Completeness determination (`completeness.status`)

Per SRC §10 + §K2, every envelope MUST emit `completeness.status` (never omitted). `'unknown'` is allowed — say so, don't guess.

### 5.1 Decision tree (service-side)

```
Is the source a single committed row (PFT, MTL entry, comp issuance)?
  YES → status = 'complete'
  NO → is it an aggregate over a bounded scope (visit, session, gaming day)?
    YES → is the scope CLOSED / finalized?
      YES → status = 'complete'
      NO (scope still OPEN) → status = 'partial'
      UNCERTAIN scope state → status = 'unknown'
    NO → is it derived from multiple inputs?
      YES → status = worst-of(inputs) (unknown > partial > complete)
      NO → status = 'unknown' (explicitly — never implicit)
```

### 5.2 Coverage field (`completeness.coverage`)

- Optional (SRC §10). Populate only when computable as a 0.0–1.0 ratio.
- For rating-slip theo: `coverage = continuous_rated_minutes / total_session_minutes`.
- For cash-obs extrapolated rollups: `coverage = observed_rows / expected_rows_at_cadence`.
- **NOT** a substitute for `status`. Both are mandatory when coverage is given.

### 5.3 Methods that MUST emit `'unknown'` explicitly

These sources cannot confidently determine completeness and must not guess:
- `rating_slip.legacy_theo_cents` — legacy rows, provenance unrecoverable
- Any rollup over an ambiguous-boundary scope (e.g., gaming-day summary during a gaming-day rollover)
- Shift baselines with sample size below threshold (Phase 1.1 sets threshold)
- Any confirmed-vs-expected field where the confirmation row is null (e.g., `table_fill.confirmed_amount_cents IS NULL`)

---

## 6. Values that are NOT wrapped in `FinancialValue`

Not every currency-shaped field is a financial fact in the SRC §3 sense. The following carve-outs are explicit and must be documented in service DTOs so consumers know they are bare numbers, not envelopes.

### 6.1 Operator inputs (pre-commit)

- `rating_slip.average_bet` (user-entered bet rate parameter)
- `CreateFinancialTxnInput.amount`, `CreateMtlEntryInput.amount`, `RequestTableFillInput.amountCents`, etc. (all create/update inputs)
- `cashier/cash-out-form.tsx` amount input before POST commit

**Rationale:** inputs are pre-commit data. They become financial facts only when the system authors a row (commit to PFT, insertion into MTL, etc.). At that point the service returns the envelope-wrapped committed row.

**UI handling:** inputs that display a currency value in the UI (`average_bet` shown on a dashboard, draft cash-out in cashier form) MUST render with an explicit "Input" or "Draft" label. They cannot appear alongside envelope-wrapped values without clear visual distinction. The forbidden-labels doc §4 encodes this as a lint concern.

### 6.2 Policy / configuration values

- `CasinoThresholds.watchlistFloor`, `CasinoThresholds.ctrThreshold` — regulatory thresholds
- `TableSettings.min_bet`, `TableSettings.max_bet` — table policy bounds
- `ValuationPolicy.centsPerPoint` — loyalty conversion ratio
- `EntitlementFulfillmentPayload.required_match_wager_cents` — policy requirement
- `AnomalyAlert.thresholdValue`, `ShiftAlert.thresholdValue` — operational thresholds

**Rationale:** these are not emitted financial facts. They are parameters of the system that happen to be denominated in currency. Wrapping them as `FinancialValue` with authority `actual` (or any label) would be semantically false — they are policy, not events.

**UI handling:** labeled directly (e.g., "CTR Threshold: $10,000") with no authority badge. Not subject to SRC §L1/§L2 which govern financial values. They ARE subject to the forbidden-labels rule (must not use names like "Total" or "Handle").

### 6.3 Non-currency units (points)

All loyalty `pointsDelta`, `currentBalance`, `balanceBefore`, `balanceAfter`, `points_redeemed`, `bonusPoints`, etc. Points are a separate unit system outside the SRC envelope scope.

**Rationale:** SRC §3 scopes the envelope to financial facts expressed in currency. Points require their own labeling convention (out of Wave 1 scope).

---

## 7. Open questions requiring sign-off (Phase 1.0 exit gate)

Must resolve before Phase 1.1 service mapper work begins. Numbered to match `WAVE-1-SURFACE-INVENTORY.md §6`.

### Q-A1 — Classification of `rating_slip.average_bet`

**Proposed:** not wrapped; treated as operator input (§6.1).

**Rationale:** `average_bet` is a dealer-entered bet rate parameter used to compute theo. It is not sourced from PFT, not from an observation, and not a compliance record. Wrapping it as `observed` would semantically collapse operator estimation into physical observation. Wrapping it as `estimated` would conflict with FACT-MODEL §D3's reservation of Class B for "grind (unrated buy-ins) and equivalent table-level money movement" — average_bet is a rate parameter, not a money movement.

**Alternative (rejected):** add a fifth authority `input` to the envelope. Rejected because it supersedes SRC §10 (4 values frozen).

**Alternative (considered):** wrap computed theo (authority `estimated`, source `"rating_slip.theo"`) while leaving average_bet bare. **This is the recommendation** — theo is the emitted estimated financial fact; average_bet is the upstream input.

**Decision requested:** confirm "not wrapped; labeled 'Input' in UI" for `average_bet` across all surfaces.

### Q-A2 — `observed` / `compliance` in pilot

**Proposed:** treat existing `pit_cash_observation`, `table_inventory_snapshot`, and `mtl_entry` rows as live sources for envelope labeling purposes only. Do not open new authoring workflows in Wave 1.

**Rationale:** FACT-MODEL §D1 says "not authored in pilot" for these classes. The ADR is speaking to *governance scope* — it does not claim the rows don't exist. Surfaces still need labels. The labels must match the taxonomy.

**Decision requested:** confirm this rendering interpretation. If lead-architect reads §D1 strictly (no labels until authoring is governed), Wave 1 has no way to label existing pit-cash or MTL surfaces, which breaks SRC §L1.

### Q-A3 — Class B source string stability

**Proposed:** source strings (`"table_session.drop"`, `"rating_slip.theo"`, etc.) are internal mapper details. UI consumers render `type` + provided label, never `source`.

**Rationale:** Wave 2 may consolidate Class B authoring into a new store (FACT-MODEL §5 open question). Source strings must be allowed to change without UI churn.

**Decision requested:** confirm source is service-private; UI does not branch on source strings.

### Q-A4 — Cash-obs split rendering

**Proposed:** extrapolated (`estimated`) and confirmed (`observed`) cash-obs rollups ALWAYS render as Pattern A split display. No combined number anywhere in UI.

**Decision requested:** confirm split-only rendering — Phase 1.3 will enforce.

### Q-A5 — Shift-intelligence `observedValue` authority routing

**Proposed:** Phase 1.1 enumerates a metric-kind → authority map for `AnomalyAlertDTO.observedValue` and `ShiftAlertDTO.observedValue`. Values derived from `drop_total` are `estimated`; values derived from `cash_obs_confirmed` are `observed`; etc.

**Decision requested:** approve approach; Phase 1.1 produces the concrete table.

### Q-A6 — `pit_cash_observation.amount` stored in dollars

**Proposed:** mapper converts to cents at envelope boundary (×100). Schema stays in dollars in Wave 1.

**Alternative:** migrate schema to cents in Wave 1 (break "surface before schema" principle).

**Decision requested:** confirm mapper-level conversion; schema migration deferred to Wave 2.

### Q-A7 — `theoEstimate` placeholder in player-360 (`summary-band.tsx:137`)

**Proposed:** **remove from UI** until `theo` is actually computed. Do not render `Theo: 0` (SRC §F4 explicit prohibition).

**Alternative:** render with `status: 'unknown'` and an explicit "Not computed" badge.

**Decision requested:** choose one. If "render unknown": Phase 1.3 must guarantee zero visual ambiguity with an authoritative zero.

### Q-A8 — `FinancialSectionDTO.totalChipsOut` rename

**Proposed:** rename to `totalCashOut` at the DTO boundary (`services/rating-slip-modal/dtos.ts:149`), propagate through API contracts and consumers. Service-layer breaking change in Phase 1.1.

**Rationale:** "Chips" semantically implies physical chip count (`observed`); the field's source is PFT cash-out aggregate (`actual`). The misleading name is a confusion risk the audit flagged as Stream D #2.

**Decision requested:** approve rename + Phase 1.1 scope to update all consumers (contract tests, UI, integration tests).

---

## 8. Phase 1.1 handoff — what a service mapper needs from this doc

A backend engineer implementing a Phase 1.1 mapper reads this doc as:

1. Find the source in §3 (by physical source column).
2. Copy `source string` exactly into `FinancialValue.source`.
3. Set `FinancialValue.type` to the column label.
4. Apply §5.1 decision tree for `completeness.status`. If unsure, emit `'unknown'` explicitly (§5.3).
5. If unit is dollars in DB, apply §4 conversion (`Math.round(dollars * 100)`).
6. If the field is in §6 (carve-out), do NOT wrap; emit bare number with DTO-level documentation.

Phase 1.1 mapper unit tests assert every envelope has the exact `type` + `source` pair from this table. Phase 1.4 contract tests assert API-level consistency.

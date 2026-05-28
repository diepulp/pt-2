# Feature Brief: Table Inventory Accounting Canonization

**Feature ID:** FIB-H-TIA-CANON-001  
**Phase:** Phase 1 — Feature Brief  
**Status:** Draft — pending `brief-approved` gate  
**FIB authority:** `FIB-H-TIA-CANON-001-classification.yaml` (frozen_amended 2026-05-27) + FIB-H v1 (historical intent)  
**SRM boundary:** `docs/20-architecture/specs/table-inventory-canon/FEATURE_BOUNDARY.md`

---

## Problem Statement

Table result language (Win/Loss, Drop, Need, inventory movement) appears across multiple PT-2 surfaces using different formulas, different timing assumptions, and different source authorities. The shift dashboard, Pit Terminal Rundown, and metrics can display different values for the same operational question. Operators see no indication of what is included, what is missing, or whether a value is partial, complete, or externally authoritative.

This is a split-brain. It must be resolved before production because every downstream feature will inherit the same semantic fracture.

---

## Primary Actor and Moment

**Actor:** Pit boss / shift manager / operations lead  
**When:** Active shift review, table rundown, end-of-period operational review  
**Trigger:** Operator reviews a table's current or completed financial position

---

## Feature Containment Loop

1. Operator opens a table or shift financial surface → system renders table result language using canonical terms only.
2. Operator sees a partial table result during an active shift → system shows included inputs, missing inputs, source category, and completeness status.
3. Before a telemetry-derived drop estimate is available → system renders `partial_table_result_cents` (label: "Partial Table Result") with missing-drop disclosure; `projected_table_win_loss_cents` is null.
4. A telemetry-derived drop estimate (`telemetry_derived_drop_estimate_cents`, session-scoped aggregate of `table_buyin_telemetry`) is present → `projected_table_win_loss_cents` is computed; label: "Projected Win/Loss"; `custody_status = non_custody_estimate` always.
5. Operator reviews the projected win/loss → system displays it with the completeness envelope. `final_table_win_loss_cents` is always null in this slice.
6. Dashboard and rundown → both consume the same canonical `TableInventoryAccountingProjection` DTO or render the same canonical partial state.
7. Operator sees "Need" → system presents it as an inventory-control signal (not win/loss, not accounting result).
8. Developer introduces a win/loss-like value → system requires source inputs, missing inputs, authority, and completeness before it may be surfaced.
9. Redundant legacy DTOs, widgets, and formulas are removed or renamed once the canonical exemplar is established.

---

## Canonical Formulas

**Projected Win/Loss** (in-scope operational estimate; `custody_status = non_custody_estimate` always):
```
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

**Partial Table Result** (drop estimate absent, opener + closer resolvable):
```
partial_table_result_cents =
  closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

**Final Win/Loss** — out of scope; always null in this slice; requires external custody authority + ADR/FIB amendment.

**Need** (inventory-control signal, not an accounting result):
```
table_need_cents = target_bank_cents - current_inventory_cents
```

---

## Three-State DTO Model

| State | Trigger | Result |
|---|---|---|
| `telemetry_drop_formula` | All 5 PT-2 operational inputs present (`drop_estimate_state = 'present'`) | `projected_table_win_loss_cents` set; `partial_table_result_cents = null` |
| `inventory_only` | Drop estimate absent with `drop_estimate_state = 'none_for_session'`; opener + closer resolvable | `partial_table_result_cents` set; `projected_table_win_loss_cents = null` |
| Integrity failure | `opening_inventory_cents` or `closing_inventory_cents` unresolvable (null — not zero) | Both result fields null; `integrity_issues` populated; surface renders disclosure only |

**Zero opener or closer is a valid explicit count and never triggers integrity_issues.**

`inventory_only` is triggered only when `drop_estimate_state = 'none_for_session'`. The two-state enum is the complete exemplar contract; deferred states (`bridge_pending`, `source_unavailable`, `integrity_issue`) are out of scope — relay-lag truth belongs to outbox observability, not the accounting projection.

---

## Telemetry Source (RESOLVED)

`telemetry_derived_drop_estimate_cents` = session-scoped SUM of `table_buyin_telemetry.amount_cents` WHERE `event_type IN ('RATED_BUYIN', 'GRIND_BUYIN')`, filtered to the session window (`table_id` + `opened_at`/`closed_at`). No COALESCE to zero.

- `source_authority.drop = 'telemetry_derived_estimate'`
- `custody_status = non_custody_estimate`
- Implementation gap: no session-scoped aggregation exists in the current rundown path — must be added to `services/table-context/table-inventory-accounting.ts`.

### `drop_estimate_state` — required discriminator

`telemetry_derived_drop_estimate_cents: number | null` is correctly typed, but null alone is underspecified. The DTO carries an explicit `drop_estimate_state` discriminator so consumers never infer meaning from null alone:

```ts
drop_estimate_state:
  | 'present'          // cents is number; projected_table_win_loss_cents may render
  | 'none_for_session' // cents is null; SUM over zero qualifying rows; partial_table_result_cents may render
```

**Deferred states (not in exemplar scope):** `bridge_pending`, `source_unavailable`, `integrity_issue` are named future states. They are not populated by `TableInventoryAccounting` at the exemplar baseline. Relay-lag truth belongs to the outbox observability layer (Phase 2.3a); detecting these states requires Finance-side signals that have no published cross-context DTO contract in this slice. Extend the enum in a follow-on slice when detection paths and surface disclosure patterns are defined.

**Critical rule:** Null telemetry must not automatically mean "Partial Table Result." It means partial only when `drop_estimate_state = 'none_for_session'`. The two-state enum makes this unambiguous at the exemplar boundary.

**`none_for_session` detection:** SQL `SUM()` over zero qualifying `table_buyin_telemetry` rows returns `NULL`. No cross-context reads required — `table_buyin_telemetry` is TableContextService-owned. The service sets `drop_estimate_state = 'none_for_session'` when the session-scoped aggregate is null.

**Forbidden:**
- COALESCE `telemetry_derived_drop_estimate_cents` to 0 (zero means "source exists and summed to zero" — a different claim)
- Treat all null telemetry as `partial_table_result_cents`
- Render "Projected Win/Loss" with null telemetry estimate
- Add enum states that require Finance cross-context signals without a declared DTO contract

---

## Required Outcomes

1. One canonical table inventory accounting language; one owner (`TableInventoryAccounting` subdomain of `TableContextService`).
2. `partial_table_result_cents` is distinct from `projected_table_win_loss_cents` is distinct from `final_table_win_loss_cents` (always null).
3. "Drop" disambiguated: buy-in telemetry ≠ physical box removal ≠ posted count amount.
4. "Need" is separated from accounting result.
5. Canonical formula produces a deterministic `TableInventoryAccountingProjection` DTO when all inputs are present.
6. Partial values allowed, but must expose: included inputs, missing inputs, authority class, completeness status.
7. Pit Terminal Rundown is the first exemplar consumer.
8. Legacy split-brain streams (`win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents`, dashboard-local formula, rundown-local formula) are deleted or suppressed — **P0: legacy dashboard display must be suppressed when the exemplar lands**, not merely deprecated.
9. Bare "Win/Loss" label never appears; only "Projected Win/Loss", "Estimated Win/Loss", or "Partial Table Result".

---

## Explicit Exclusions

- No external count-room integration.
- No full reconciliation engine.
- No `final_table_win_loss_cents` — out of scope; requires ADR/FIB amendment.
- No `posted_drop_amount_cents` as a formula input in this slice.
- No drop posting workflow.
- No generic event-sourcing redesign.
- No outbox routing of inventory events (CLS-004/CLS-005 rejected).
- No dashboard-first implementation; dashboard becomes a consumer after the rundown exemplar proves the model.
- No compatibility preservation for obsolete DTOs/widgets/formulas.

---

## Exemplar Surface

**Selected:** Pit Terminal Rundown → backed by `TableInventoryAccountingProjection`

Implementation path:
```
canonical inventory authoring tables (table_inventory_snapshot, table_fill,
table_credit, table_buyin_telemetry, table_session)
→ services/table-context/table-inventory-accounting.ts (read-time derivation)
→ TableInventoryAccountingProjection DTO
→ BFF/API route
→ Pit Terminal Rundown render
→ legacy competing stream removed/suppressed
```

After exemplar acceptance, shift dashboard hero and metrics table must consume the same `TableInventoryAccountingProjection` or stop rendering win/loss-like language.

---

## Deterministic Acceptance Fixture

| Case | Opening | Fills | Credits | Closing | Drop estimate | Expected |
|---|---|---|---|---|---|---|
| All inputs | 20,000 | 5,000 | 2,000 | 18,000 | 9,000 | `projected = 4,000`; label: "Projected Win/Loss" |
| Drop absent | 20,000 | 5,000 | 2,000 | 18,000 | null | `partial = -5,000`; label: "Partial Table Result" |
| Opener unresolvable | null | 5,000 | 2,000 | 18,000 | 9,000 | Both null; `integrity_issues = ['missing_opening_inventory_snapshot']`; no label |
| Zero opener (valid) | 0 | 5,000 | 2,000 | 18,000 | 9,000 | `projected = 24,000`; label: "Projected Win/Loss"; `integrity_issues = []` |

---

## Dependencies and Assumptions

- SIGP-002 split-brain findings accepted as the trigger.
- ADR-053 in force: PT-2 may expose partial aggregates, but must not claim authoritative financial truth.
- Application is not in production → obsolete surfaces and DTOs may be removed, not supported indefinitely.
- Existing inventory authoring structures may be reused if they conform to canon.

---

## Success Definition

Split-brain removed at domain-language level; one canonical owner; partial table result and win/loss no longer conflated; drop terminology disambiguated; need separated from accounting result; redundant calculations deleted; every remaining table-result surface consumes canonical model; deterministic tests prevent the old split-brain from reappearing.

---

**Gate:** `brief-approved`  
**Next phase:** PRD

# FIB-H — Table Inventory Accounting Canonization

**Status:** Frozen — v1 historical intent + exemplar companion  
**Artifact type:** Feature Intake Brief — Human Scope Authority  
**Date opened:** 2026-05-27  
**Priority:** P0  
**Target decision horizon:** Pre-production canonization / split-brain remediation  
**Related investigation:** SIGP-002 — Table Inventory Accounting: Win/Loss Split-Brain Review  
**Related UL baseline:** TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md  
**Owner:** Product / Architecture  

> **NOTICE — Superseded intent draft.** This FIB-H predates the frozen classification artifact and patched UL baseline. Where this document conflicts with those artifacts, the classification artifact and UL baseline govern. Current scope authority: `FIB-H-TIA-CANON-001-classification.yaml` (**status: frozen_amended** — see `artifact.amendments` block for changelog) and `TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md` (canonical vocabulary). This document is retained as historical operator intent, containment rationale, and exemplar direction only.
>
> **Key amendments in the classification YAML that supersede this document:**
> 1. **Opener/closer lifecycle invariant** — `opening_inventory_cents` and `closing_inventory_cents` are required lifecycle snapshots, not optional completeness inputs. Their absence populates `integrity_issues` and suppresses all table-result values; it does not activate `partial_table_result_cents`. Zero is a valid explicit count. (Corrects FIB-H's original nullable typing.)
> 2. **Telemetry source resolved** — The approved PT-2 operational source for `telemetry_derived_drop_estimate_cents` is a session-scoped aggregate of `table_buyin_telemetry` (RATED_BUYIN + GRIND_BUYIN). Closes §L open question. See `open_question_L_telemetry_source` in classification YAML.
> 3. **Dashboard suppression is a PRD acceptance criterion (P0)** — Legacy dashboard/metrics win-loss display must be suppressed (not just deprecated) when the exemplar lands. See `prd_gate_patches.dashboard_suppression_gate`.

---

## A. Feature identity

**Feature name:** Table Inventory Accounting Canonization

**Feature ID / shorthand:** FIB-H-TIA-CANON-001

**Related wedge / phase / slice:**  
Post-Wave-2 semantic stabilization / Table Inventory Accounting canonization

**Requester / owner:**  
Product / Architecture

**Date opened:**  
2026-05-27

**Priority:**  
P0

**Target decision horizon:**  
Pre-production. This canonization must occur before any expansion of win/loss, drop, table inventory, shift financial metrics, table rundown, or telemetry bridge behavior.

---

## B. Operator problem statement

Operators currently see table result language across multiple surfaces without a single canonical meaning. The shift dashboard, pit terminal rundown, drop posture, and telemetry-derived metrics use overlapping terms such as “Win/Loss,” “Drop,” “Need,” and inventory movement while relying on different formulas, different timing assumptions, and different source authority. This creates a split-brain: the system can display different values for what appears to be the same operational question, without giving the operator a clear explanation of what is included, what is missing, and whether the value is partial, complete, or externally authoritative.

---

## C. Pilot-fit / current-slice justification

This belongs now because the application is not yet in production and therefore does not require compatibility preservation for malformed semantics. Feature-first development introduced redundant widgets, DTOs, calculations, and surfaces without a stable ubiquitous language. Before more consumers, projections, dashboard cards, or inventory workflows are added, the system must declare a canonical table inventory accounting model and force all existing surfaces to either conform, be renamed, or be removed. Without this canonization, every downstream feature will inherit the same semantic fracture and make the accounting posture harder to repair.

---

## D. Primary actor and operator moment

**Primary actor:**  
Pit boss / shift manager / operations lead

**When does this happen?**  
During active shift review, table rundown, and end-of-period operational review. Drop posting is out of scope for this slice.

**Primary surfaces:**  
- Pit Terminal Rundown (exemplar — first canonical surface; see §P.1)

**Downstream convergence targets (after exemplar proves the model):**  
- Shift dashboard
- Shift metrics / table inventory workflows

**Out of scope for this slice:**  
- Drop posting workflow
- Any new surface not backed by the canonical `TableInventoryAccountingProjection` DTO

**Trigger event:**  
An operator reviews a table’s current or completed financial position and needs to understand what the system can truthfully say based on observed inventory, posted drop, and missing custody/count-room inputs.

---

## E. Feature Containment Loop

1. Operator opens a table or shift financial surface → system renders table result language using canonical terms only.
2. Operator sees a partial table result during an active shift → system shows included inputs, missing inputs, source category, and completeness status.
3. Operator reviews a surface before a telemetry-derived drop estimate is available → system does not show a bare “Win/Loss” label; it renders `partial_table_result_cents` with missing-drop disclosure and `custody_status = non_custody_estimate`.
4. A telemetry-derived drop estimate (`telemetry_derived_drop_estimate_cents`) becomes available from an approved PT-2 operational telemetry source → system includes it as the drop-like input to the projected win/loss formula; `projected_table_win_loss_cents` is populated with label “Projected Win/Loss” and `custody_status = non_custody_estimate`. No posted-drop authoring or custody workflow is introduced by this slice.
5. Operator reviews the projected win/loss → system displays `projected_table_win_loss_cents` with the completeness envelope (labeled “Projected Win/Loss” or “Estimated Win/Loss”). `final_table_win_loss_cents` remains null in this slice. The value is non-custody and non-final by construction.
6. Operator compares dashboard and rundown surfaces → both consume the same canonical accounting projection or render the same canonical partial state.
7. Operator sees “Need” → system presents it as an inventory-control signal, separate from win/loss and separate from accounting result.
8. Developer or downstream artifact introduces a win/loss-like value → system requires the value to declare source inputs, missing inputs, authority, and completeness before it may be surfaced.
9. Redundant legacy DTOs, widgets, and formulas are removed or renamed once the canonical exemplar is established.

---

## F. Required outcomes

- The system has one canonical table inventory accounting language for opener, closer, fills, credits, telemetry-derived drop estimate, need, partial table result, and projected win/loss. Posted drop (`posted_drop_amount_cents`) and counted drop (`counted_drop_amount_cents`) are reserved future vocabulary — out of scope for this slice and not valid implementation inputs without ADR/FIB amendment.
- The system distinguishes `partial_table_result_cents` (no drop estimate) from `projected_table_win_loss_cents` (telemetry-derived drop estimate present, non-custody) from `final_table_win_loss_cents` (external custody authority, out of scope for this slice).
- “Drop” is no longer used for buy-in telemetry, physical box removal, and posted count amount interchangeably.
- “Projected Win/Loss” (`projected_table_win_loss_cents`) is the in-scope operational estimate; it carries `custody_status = non_custody_estimate` always. “Final Win/Loss” (`final_table_win_loss_cents`) requires external custody authority and is out of scope for this slice. The unqualified label “Win/Loss” is reserved for `final_table_win_loss_cents` and must not appear in this slice.
- The system can calculate a deterministic projected table win/loss when `telemetry_derived_drop_estimate_cents` and all inventory inputs are present.
- Partial values remain allowed, but must expose included inputs, missing inputs, authority class, and completeness status.
- Dashboard, rundown, metrics, DTOs, and consumers must converge on the canonical `TableInventoryAccountingProjection` DTO (a read model produced by the `TableInventoryAccounting` service/BFF boundary — not an outbox consumer and not a persisted projection store unless EXEC explicitly materializes it) or be removed.
- The Pit Terminal Rundown is established as the first exemplar consumer of the `TableInventoryAccountingProjection` DTO.
- Existing split-brain streams are eliminated rather than preserved behind compatibility layers.
- “Need” is canonized as a table inventory control signal, not as a win/loss or accounting result.

---

## G. Explicit exclusions

- No external count-room integration in this slice.
- No full reconciliation engine.
- No final accounting authority claim.
- No cage/vault/custody reconstruction.
- No regulatory filing automation.
- No generic event-sourcing redesign.
- No telemetry bridge from buy-ins into “drop” or win/loss until the canon explicitly allows a separate telemetry metric. **RESOLVED (2026-05-27):** The canon has explicitly authorized the session-scoped `table_buyin_telemetry` aggregate (RATED_BUYIN + GRIND_BUYIN, filtered to session window) as the approved source for `telemetry_derived_drop_estimate_cents`. See classification YAML `open_question_L_telemetry_source`. The §G.7 prohibition remains in force for naive routing of `observed_buyin_activity_cents` directly into the formula without explicit aggregation and provenance metadata — that path is still forbidden.
- No dashboard-local win/loss formula ownership.
- No par/bootstrap opener for canonical accounting win/loss.
- No new operator-visible widgets unless they consume the canonical model.
- No shift-dashboard-first salvage effort; the dashboard must consume the exemplar after the rundown-backed canon is proven.
- No compatibility preservation for obsolete DTOs, widgets, or formulas if they contradict the canon.

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Keep both win/loss streams and explain them with badges | Lowest immediate code churn | Preserves the split-brain and forces operators to interpret conflicting concepts |
| Hide all win/loss until drop/count-room data exists | Avoids false authority | Overcorrects; ADR-053 allows partial values when source, authority, and completeness are explicit |
| Treat buy-in telemetry as estimated drop | Useful for live shift approximation | Categorically wrong; buy-ins are player/table activity, not custody-counted drop |
| Use table par as accounting opener | Makes dashboard non-null earlier | Par is configuration, not an observed inventory count; it can make historical results non-deterministic |
| Build reconciliation now | Would answer the broader accounting question | Out of pilot scope; requires custody/count-room authority and external accounting controls |
| Rename every column immediately | Reduces bad vocabulary quickly | Premature until canonical ownership and exemplar projection are fixed |

---

## I. Dependencies and assumptions

- SIGP-002 split-brain findings are accepted as the trigger for remediation.
- The Table Inventory Accounting UL baseline is accepted as the starting vocabulary.
- ADR-053 remains in force: PT-2 may expose partial aggregates, but must not claim authoritative financial truth without custody/count-room authority.
- The application is not in production, so obsolete surfaces and DTOs may be removed rather than supported indefinitely.
- Existing inventory data structures for opener, closer, fills, credits, and table need may be reused if they conform to the canon. Posted drop (`posted_drop_amount_cents`) is reserved future vocabulary — it is not a valid implementation input for this slice without ADR/FIB amendment.
- Existing dashboard and rundown surfaces are not canonical owners; they are consumers to be re-engineered or stripped.
- Canonical win/loss requires a deterministic input set and a single owner.
- Partial values are useful and should remain visible when labeled correctly.

---

## J. Out-of-scope but likely next

- ADR: Table Inventory Accounting Canon and ownership decision.
- ADR: Drop taxonomy and naming standard.
- PRD: Canonical exemplar projection and surface convergence.
- PRD: Legacy widget / DTO / calculation removal.
- PRD: Future count-room or posted-drop workflow hardening, if needed.

---

## K. Expansion trigger rule

Amend this intake brief if any downstream artifact proposes:

- a new meaning for “win/loss,” “drop,” “need,” opener, closer, fill, or credit;
- a new table-result formula;
- use of buy-in telemetry as drop;
- use of par/bootstrap as canonical accounting opener;
- a new surface that computes win/loss independently;
- external count-room/custody integration;
- final/reconciled accounting authority;
- a new dashboard metric that blends inventory, telemetry, and drop inputs into one unlabeled value;
- a compatibility layer that preserves contradictory semantics instead of retiring them.

---

## L. Scope authority block

**Intake version:**  
v1

**Frozen for downstream design:**  
Yes — frozen 2026-05-27 as v1 historical intent + exemplar companion.  
Active semantic authorities: `FIB-H-TIA-CANON-001-classification.yaml` and `TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md`.  
Where this document conflicts with those artifacts, the classification YAML and UL baseline govern.

**Downstream expansion allowed without amendment:**  
No.

**Open questions allowed to remain unresolved at scaffold stage:**

1. Should the canonical owner be named `TableInventoryAccounting`, `TableAccounting`, or remain inside `TableContext` as a bounded subdomain?
2. (Deferred — reserved future) Should `posted_drop_amount_cents` and future `counted_drop_amount_cents` be separate fields or separate source-authority states on one drop amount field? This question is not an implementation input for this slice; it applies only after an ADR/FIB amendment introduces external custody authority.
3. Should partial table result be persisted as a projection value or derived at read time from canonical inputs? *(Recommendation: read-time derivation — see classification YAML `open_question_L3_impact`.)*
4. Resolved direction: the first exemplar surface is the Pit Terminal Rundown backed by a canonical Table Inventory Accounting projection. The shift dashboard becomes a downstream consumer after the exemplar proves the canon.
5. What is the exact removal list for legacy DTOs and widgets after exemplar acceptance?
6. **RESOLVED (2026-05-27)** — What is the approved PT-2 operational source for `telemetry_derived_drop_estimate_cents`? → Session-scoped aggregate of `table_buyin_telemetry` (RATED_BUYIN + GRIND_BUYIN rows), filtered to session window (`table_id` + `opened_at`/`closed_at`). `source_authority.drop = 'telemetry_derived_estimate'`; `custody_status = non_custody_estimate`. Implementation gap: no session-scoped aggregation exists in the current rundown path — must be added to the `TableInventoryAccounting` service module. See classification YAML `open_question_L_telemetry_source`.

**Human approval / sign-off:**  
Approved 2026-05-27. Frozen as v1 historical intent + exemplar companion.

---

## M. Canonical direction statement

The chosen direction is canonization, not compatibility preservation.

The system must establish one canonical model for table inventory accounting and force all consuming surfaces to conform. Existing dashboard, rundown, metrics, and DTO paths that compute or label table result values independently are presumed non-canonical until proven otherwise.

The system may display partial values. Partiality is not the defect. The defect is unlabeled partiality presented as accounting truth.

Canonical rule:

```text
Partial table result may be displayed without custody/count-room authority
only when source inputs, missing inputs, authority, and completeness are explicit.
```

Canonical win/loss rule:

In this slice, "Projected Win/Loss" (`projected_table_win_loss_cents`) is the in-scope operational estimate. "Final Win/Loss" (`final_table_win_loss_cents`) is out of scope and requires external custody authority plus an ADR/FIB amendment. `final_table_win_loss_cents` is always null in this slice. The unqualified label "Win/Loss" is reserved for `final_table_win_loss_cents` and must not appear on any surface in this slice.

Canonical formula (in scope — projected win/loss):

```text
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

Reserved formula (out of scope — final win/loss — requires ADR/FIB amendment):

```text
final_table_win_loss_cents =
  posted_or_counted_drop_amount_cents   ← external custody authority required
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

Partial table result rule:

```text
If the telemetry-derived drop estimate is missing, the system renders
partial_table_result_cents with label "Partial Table Result" and must
not render "Win/Loss", "Projected Win/Loss", or any win/loss variant.
```

Need rule:

```text
table_need_cents =
  target_bank_cents - current_inventory_cents
```

Need is an inventory-control signal. It is not win/loss, not drop, and not an accounting result.

---

## N. Canonical vocabulary baseline

| Canonical term | Meaning | Surface status |
|---|---|---|
| `opening_inventory_cents` | Explicit inventory count at period/session open | Required for projected win/loss |
| `closing_inventory_cents` | Explicit inventory count at period/session close or current inventory when clearly partial | Required for projected win/loss |
| `fills_cents` | Chips/coin moved from cage to table | Accounting input |
| `credits_cents` | Chips/coin moved from table to cage | Accounting input |
| `telemetry_derived_drop_estimate_cents` | Non-custody, non-final drop-like estimate from approved PT-2 operational telemetry. Input to `projected_table_win_loss_cents` only. Must carry `custody_status = non_custody_estimate`. | **Preferred drop-like input — in scope** |
| `drop_box_removed_event` | Physical box removal/custody event; no amount by itself | Posture/event term only — not a formula input, not a drop amount |
| `observed_buyin_activity_cents` | Buy-in activity observed by PT-2 | Separate telemetry metric; not drop; not a formula input |
| `partial_table_result_cents` | Inventory-side result when drop estimate is absent; `custody_status = non_custody_estimate`, `input_completeness = partial` | Allowed with missing-input disclosure; label "Partial Table Result" |
| `projected_table_win_loss_cents` | Operational estimate: telemetry drop estimate + inventory formula; `custody_status = non_custody_estimate` always | In scope; label "Projected Win/Loss" or "Estimated Win/Loss" only |
| `final_table_win_loss_cents` | Custody-authoritative win/loss requiring external count-room or custody authority | **Out of scope — always null in this slice; requires ADR/FIB amendment** |
| `posted_drop_amount_cents` | Manually posted drop amount after external count/accounting input | **Future/reserved** — dangerous if used without external custody source; out of scope for this slice |
| `counted_drop_amount_cents` | Count-room verified drop amount | Future external authority input — out of scope |
| `table_need_cents` | Target/par bank minus current inventory | Inventory-control signal; not win/loss |

---

## O. Non-negotiable standardization rules

1. One concept must have one canonical name.
2. One canonical calculation may have many consumers, but no consumer may own its own competing formula.
3. Dashboard and rundown surfaces are consumers, not authority owners.
4. Buy-in telemetry must not be called drop.
5. Physical drop removal must not imply a counted drop amount exists.
6. Posted drop amount must disclose its source authority.
7. Par target may support need, but may not silently become an accounting opener.
8. Partial table result may be displayed, but must declare missing inputs.
9. Bare “Win/Loss” must not appear in this slice. The only allowed table-result labels are “Projected Win/Loss”, “Estimated Win/Loss”, and “Partial Table Result”. The unqualified label “Win/Loss” is reserved for `final_table_win_loss_cents` which is out of scope.
10. Redundant widgets, DTOs, and calculations that contradict the canon should be deleted, not accommodated.

---

## P. Exemplar direction

The first implementation after canonization should be a vertical exemplar, not a broad rewrite.

### P.1 Selected exemplar candidate

The selected exemplar candidate is:

```text
Pit Terminal Rundown
→ backed by a canonical Table Inventory Accounting projection
```

The rundown is selected because it already follows the correct accounting input grammar:

```text
In scope (this slice):
  opening inventory
  + fills
  + credits
  + closing/current inventory
  + telemetry_derived_drop_estimate_cents   ← non-custody operational estimate
  → projected_table_win_loss_cents          ← label: "Projected Win/Loss"

  (drop estimate absent)
  → partial_table_result_cents              ← label: "Partial Table Result"

Reserved future (requires ADR/FIB amendment — external custody authority):
  + posted_or_counted_drop_amount_cents     ← external custody input
  → final_table_win_loss_cents              ← label: "Win/Loss" or "Final Win/Loss"
```

Its current defects are repairable through canonization:

- it gates to `NULL` without operator-readable explanation;
- it owns a local formula instead of consuming a canonical projection;
- it does not expose missing-input state clearly;
- it is not the source consumed by the dashboard;
- it does not yet distinguish partial table result from posted-drop win/loss.

The shift dashboard is intentionally not selected as the first exemplar. It is more visible, but it is also more polluted by legacy semantic drift:

- `win_loss_inventory`;
- `win_loss_estimated`;
- `estimated_drop_buyins`;
- par/bootstrap opener fallback;
- live hero label collision;
- latent buy-in-as-drop behavior.

Starting with the dashboard would turn the exemplar into a UI salvage exercise. The dashboard should become a downstream consumer of the canonical projection after the rundown exemplar proves the model.

### P.2 Canonical owner posture

The exemplar should establish the canonical owner as:

```text
TableContext.TableInventoryAccounting
```

This avoids prematurely creating a large new bounded context while still isolating the accounting language and formula from dashboard, shift-metrics, and rundown-local ownership.

The owner controls:

- canonical input names;
- formula semantics;
- partial vs complete result state;
- missing-input disclosure;
- source authority metadata;
- deterministic projection behavior.

Dashboard, metrics, and rundown surfaces are consumers only.

### P.3 Exemplar flow

The exemplar should prove:

```text
canonical inventory inputs + telemetry_derived_drop_estimate_cents
→ TableInventoryAccounting service/BFF formula derivation
→ TableInventoryAccountingProjection DTO (read model, not outbox consumer, not persisted store)
→ Pit Terminal Rundown render
→ legacy competing stream removed or quarantined
```

"Projection" in this exemplar means the `TableInventoryAccountingProjection` DTO produced at the service/BFF boundary from existing inventory authoring stores at read time. It is not a projection consumer, not an outbox-backed read model, and not a persisted projection store unless a subsequent EXEC explicitly chooses to materialize it as a cost optimization.

After the exemplar passes, the dashboard hero and metrics table should be re-engineered to consume the same `TableInventoryAccountingProjection` DTO or stop rendering win/loss-like language.

### P.4 Candidate projection shape

The exemplar projection should carry enough state to avoid semantic guessing at the surface:

```ts
type TableInventoryAccountingProjection = {
  casino_id: string;
  table_id: string;
  gaming_day: string;
  table_session_id: string;

  opening_inventory_cents: number;   // required lifecycle snapshot; zero is valid; unresolvable null is a lifecycle failure
  fills_cents: number;               // zero when no fill events occurred
  credits_cents: number;             // zero when no credit events occurred
  closing_inventory_cents: number;   // required lifecycle snapshot; zero is valid; unresolvable null is a lifecycle failure
  telemetry_derived_drop_estimate_cents: number | null; // only input whose absence is a normal partial-result state

  partial_table_result_cents: number | null;
  projected_table_win_loss_cents: number | null;
  final_table_win_loss_cents: null; // always null in this slice; requires ADR/FIB amendment

  calculation_kind:
    | 'inventory_only'
    | 'telemetry_drop_formula';

  completeness: {
    status: 'partial' | 'complete';
    missing_inputs: Array<'drop_estimate'>; // only valid normal missing input; opener/closer are not optional
  };

  integrity_issues: Array<
    | 'missing_opening_inventory_snapshot'
    | 'missing_closing_inventory_snapshot'
  >; // lifecycle/data-integrity failures; non-empty suppresses all table-result values

  custody_status: 'non_custody_estimate'; // always non_custody_estimate in this slice

  source_authority: {
    opener: 'explicit_inventory_snapshot' | null;
    closer:
      | 'explicit_inventory_snapshot'
      | 'current_inventory_snapshot'
      | null;
    drop: 'telemetry_derived_estimate' | null;
    fills: 'table_inventory_events';
    credits: 'table_inventory_events';
  };
};
```

### P.5 Exemplar behavior

Before a telemetry-derived drop estimate is available:

```text
projected_table_win_loss_cents = null
final_table_win_loss_cents = null
partial_table_result_cents = inventory-side value
completeness.status = partial
custody_status = non_custody_estimate
missing_inputs includes drop_estimate
surface label = Partial Table Result
```

After a telemetry-derived drop estimate is present:

```text
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents

final_table_win_loss_cents = null  (always; external custody authority required)
completeness.status = complete (all PT-2 operational inputs present)
custody_status = non_custody_estimate (always in this slice)
surface label = Projected Win/Loss
```

If opener or closer is unresolvable from source data (invalid lifecycle / data-integrity state):

```text
projected_table_win_loss_cents = null
final_table_win_loss_cents = null
partial_table_result_cents = null  ← must NOT be rendered; this is not a Partial Table Result state
integrity_issues includes 'missing_opening_inventory_snapshot' and/or 'missing_closing_inventory_snapshot'
completeness.missing_inputs = []   ← opener/closer are not optional inputs; their absence is not a completeness gap
surface renders invalid-session-state disclosure; must not render any win/loss label or "Partial Table Result"
```

Note: zero opener or zero closer is a valid explicit inventory count and does not trigger integrity_issues.

### P.6 Deterministic acceptance fixture

**Case 1 — All inputs present (primary fixture):**

```text
opening_inventory = 20,000
fills = 5,000
credits = 2,000
closing_inventory = 18,000
telemetry_derived_drop_estimate = 9,000
```

Expected result:

```text
projected_table_win_loss = 9,000 + 18,000 + 2,000 - 20,000 - 5,000 = 4,000
partial_table_result_cents = null
input_completeness = complete
missing_inputs = []
integrity_issues = []
custody_status = non_custody_estimate
surface_label = Projected Win/Loss
final_table_win_loss_cents = null
```

**Case 2 — Drop estimate absent (partial result):**

```text
opening_inventory = 20,000 | fills = 5,000 | credits = 2,000
closing_inventory = 18,000 | telemetry_derived_drop_estimate = null
```

Expected result:

```text
projected_table_win_loss_cents = null
partial_table_result_cents = 18,000 + 2,000 - 20,000 - 5,000 = -5,000
input_completeness = partial
missing_inputs = [drop_estimate]
integrity_issues = []
custody_status = non_custody_estimate
surface_label = Partial Table Result
```

**Case 3 — Opener unresolvable (integrity failure):**

```text
opening_inventory = null (no snapshot linked)
fills = 5,000 | credits = 2,000
closing_inventory = 18,000 | telemetry_derived_drop_estimate = 9,000
```

Expected result:

```text
projected_table_win_loss_cents = null
partial_table_result_cents = null       ← must NOT render "Partial Table Result"
input_completeness = null
missing_inputs = []
integrity_issues = [missing_opening_inventory_snapshot]
surface_label = (integrity disclosure — no result rendered)
```

**Case 4 — Zero opener is a valid explicit count:**

```text
opening_inventory = 0 (empty tray — explicit count)
fills = 5,000 | credits = 2,000
closing_inventory = 18,000 | telemetry_derived_drop_estimate = 9,000
```

Expected result:

```text
projected_table_win_loss_cents = 9,000 + 18,000 + 2,000 - 0 - 5,000 = 24,000
partial_table_result_cents = null
input_completeness = complete
integrity_issues = []       ← zero does NOT trigger integrity_issues
surface_label = Projected Win/Loss
```

Split-brain regression tests must prove:

- bare "Win/Loss" label must never appear in this slice — only "Projected Win/Loss", "Estimated Win/Loss", or "Partial Table Result";
- `final_table_win_loss_cents` is always null in this slice;
- removing `telemetry_derived_drop_estimate_cents` degrades `projected_table_win_loss_cents` to null and activates `partial_table_result_cents`;
- `input_completeness = complete` with `custody_status = non_custody_estimate` is the correct all-inputs-present output;
- changing `par_total_cents` does not alter `projected_table_win_loss_cents`;
- adding buy-in telemetry does not alter `projected_table_win_loss_cents` (telemetry is not a drop-like input);
- dashboard and rundown cannot compute competing table-result formulas;
- unresolvable opener or closer populates `integrity_issues` and suppresses all table-result values; must never render "Partial Table Result"; zero opener or closer is a valid explicit count and does not trigger this path;
- the same canonical projection feeds all surviving table-result consumers;
- `custody_status` is always `non_custody_estimate` in this slice;
- when the exemplar lands, legacy dashboard/metrics win-loss display (`win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents`) must be suppressed — not merely deprecated; competing visible semantics are a split-brain violation regardless of consumer migration timeline (P0 — see classification YAML `prd_gate_patches.dashboard_suppression_gate`).

### P.7 Legacy stream disposition

After the exemplar is accepted, the following are presumed non-canonical unless explicitly remapped:

- `win_loss_inventory_cents`;
- `win_loss_estimated_cents`;
- `win_loss_estimated_total_cents`;
- `estimated_drop_buyins_cents`;
- dashboard-local win/loss math;
- `rpc_shift_table_metrics` win/loss ownership;
- rundown-local formula ownership;
- DTOs exposing dashboard and rundown win/loss as peer truths.

These should be deleted, renamed, or quarantined behind compatibility aliases only if needed for short-lived migration. Because the application is not in production, compatibility preservation is not a goal by default.

---

## Q. Success definition

This effort succeeds when:

- the split-brain is removed at the domain-language level;
- one canonical table inventory accounting owner exists;
- partial table result and win/loss are no longer conflated;
- drop terminology is disambiguated;
- need is separated from accounting result;
- redundant calculations are deleted or demoted;
- every remaining table-result surface consumes the canonical model;
- deterministic tests prevent the old split-brain from reappearing.

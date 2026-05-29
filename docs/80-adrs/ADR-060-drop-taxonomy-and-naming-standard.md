---
id: ADR-060
title: Drop Taxonomy and Naming Standard
status: Proposed
date: 2026-05-28
owner: Architecture Review
decision_scope: >
  Canonical vocabulary for drop-like concepts in PT-2;
  telemetry kind enumeration for telemetry_derived_drop_estimate_cents;
  source_authority structure correction for TableInventoryAccountingProjection;
  naming prohibitions and reserved future vocabulary
triggered_by: >
  RFC-007 Phase 4 ADR requirement (Section 7, ADR-B).
  Drop vocabulary ambiguity was the original cause of the split-brain
  resolved by FIB-H-TIA-CANON-001. This ADR prevents the fracture from
  re-emerging in follow-on slices that re-introduce "drop" as a generic term.
scope_authority: FIB-H-TIA-CANON-001 v1 (frozen 2026-05-27)
amends:
  - ADR-059 D3 source_authority field shape
related:
  - ADR-052
  - ADR-053
  - ADR-059
  - ADR-061
  - docs/02-design/RFC-007-table-inventory-accounting-canonization.md
  - docs/issues/table-inventory-accounting-canon/planning/FIB-H-TIA-CANON-001-classification.yaml
  - docs/issues/table-inventory-accounting-canon/planning/TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md
---

# ADR-060: Drop Taxonomy and Naming Standard

## 1. Context

"Drop" is an overloaded term in casino operations. It can refer to the physical removal of a drop box, the amount of chips bought in during a session, an accounting total derived from that activity, or a custody-chain-verified settlement figure. PT-2 has historically used these meanings interchangeably, producing the split-brain that FIB-H-TIA-CANON-001 exists to resolve.

ADR-059 froze the canonical formula and DTO for table inventory accounting. That formula includes `telemetry_derived_drop_estimate_cents` as a specific named input. Without a naming standard, a follow-on implementor could introduce `estimated_drop_cents`, `drop_cents`, or `running_drop_cents` as synonyms and reproduce the same semantic fracture under a different name.

This ADR freezes the vocabulary. Every drop-like concept in PT-2 has exactly one canonical name, one authority posture, and one scope. Names not on the approved list are forbidden at the field, API, and surface layers.

The ADR also closes two open questions carried from the ADR-059 audit:

1. **Telemetry kind enumeration (P0):** Which `telemetry_kind` values qualify for `telemetry_derived_drop_estimate_cents`, and is `RATED_ADJUSTMENT` included?
2. **`source_authority` structure (P1):** ADR-059 D3 named `source_authority.inventory = 'table_inventory_snapshot'`, which is misleading because fills and credits are sourced from `table_fill` and `table_credit`, not from the inventory snapshot.

---

## 2. Decisions

### D1 — Canonical Drop Vocabulary: One Explicit Name Per Concept

The following table is the complete and exhaustive drop-concept vocabulary for PT-2. Every term is either approved (with mandatory usage constraints), reserved (named but not implemented in this slice), or forbidden (tombstoned to prevent reuse of ambiguous names).

| Term | Status | Amount? | Authority posture | Scope |
|---|---|---|---|---|
| `drop_activity_indicator` | **Approved** | No — posture signal only | Operational / inferred | Allowed; must not carry a cents value |
| `observed_buyin_activity_cents` | **Approved** | Yes — buy-in amount, not drop | Class B telemetry | Allowed; must not be used as a drop formula input |
| `drop_box_removed_event` | **Approved (posture only)** | No — custody event, no amount | Custody event | Allowed only as a no-amount event; must not be an input to any win/loss formula |
| `telemetry_derived_drop_estimate_cents` | **Sole in-scope drop-like amount at DTO/API/surface boundaries** | Yes — estimated, non-custody | Telemetry / operational estimate | **Required** for drop-like formula inputs in this slice; must not be aliased or substituted at any DTO, API, or surface contract boundary; see D2 for source definition |
| `estimated_drop_cents` | **Deprecated alias — transitional only** | Yes — system-estimated | Telemetry / operational | **Do not introduce in new code, migrations, or API contracts.** Legacy or implementation-local occurrences must be mapped to `telemetry_derived_drop_estimate_cents` before crossing a DTO/API/surface boundary. |
| `recorded_operational_drop_cents` | **Deprecated — avoid** | Yes | Ambiguous | **Tombstoned.** Reads too close to "posted drop"; implies custody connotation. Use `telemetry_derived_drop_estimate_cents` instead. Do not introduce in new code. |
| `posted_drop_amount_cents` | **Reserved — dangerous** | Yes | Manual posted count proxy | **Forbidden in this slice.** Implies a finalized, posted accounting result. Non-compliant with ADR-053 unless sourced from external custody authority. Reserved as future vocabulary pending custody integration ADR + FIB amendment. |
| `counted_drop_amount_cents` | **Reserved — future only** | Yes | Count-room verified | **Forbidden in this slice.** Requires count-room / soft-count integration. Out of scope without custody authority ADR + FIB amendment. |
| `external_custody_drop_cents` | **Reserved — future only** | Yes | External custody-authoritative | **Forbidden in this slice.** Drop received from soft count, count room, or custody authority. Requires external integration ADR + FIB amendment. |
| `final_reconciled_drop_amount_cents` | **Reserved — out of scope** | Yes | External accounting finality | **Forbidden in this slice.** Out of PT-2 pilot authority. |

No term outside this table may carry the `drop_*_cents` or `*_drop_amount_cents` naming pattern. **`telemetry_derived_drop_estimate_cents` is the sole exception to the rule that `drop_*_cents` patterns require a custody-authoritative source** — its name explicitly declares its non-custody, estimated character.

---

### D2 — Telemetry Kind Enumeration for `telemetry_derived_drop_estimate_cents`

The qualifying `telemetry_kind` values for the session-scoped SUM that produces `telemetry_derived_drop_estimate_cents` are:

```
telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
```

This is the **complete and exhaustive set for the canonical exemplar projection**. No other `telemetry_kind` value contributes to `telemetry_derived_drop_estimate_cents` in this slice.

**`RATED_ADJUSTMENT` is explicitly excluded from the canon.** This exclusion is semantic, not a claim that the value is absent from the current database schema. Current legacy/shift-metrics paths may accept or aggregate `RATED_ADJUSTMENT`; that is precisely the kind of drift this canonization slice is allowed to retire, suppress, or quarantine. `RATED_ADJUSTMENT` must not cross the `TableInventoryAccountingProjection` boundary as part of `telemetry_derived_drop_estimate_cents` unless a future ADR/FIB amendment changes the canonical source definition.

Any future `telemetry_kind` value — including any adjustment, correction, or reversal kind — requires an explicit amendment to this ADR before it may be included in the canonical drop estimate computation. Inclusion is not automatic merely because the schema or a legacy RPC permits the value.

**Kind semantics (canonical exemplar):**

| `telemetry_kind` | Attribution | Included in estimate |
|---|---|---|
| `RATED_BUYIN` | Rated player buy-in; requires `visit_id` + `rating_slip_id`; projection over Class A (PFT) per ADR-052 D3 | Yes |
| `GRIND_BUYIN` | Anonymous / unrated buy-in; `visit_id IS NULL`, `rating_slip_id IS NULL`; Class B primary observation per ADR-052 D1 | Yes |
| `RATED_ADJUSTMENT` | Legacy/current adjustment posture; may exist in current telemetry paths but is not part of the exemplar canonical source | No |

The session-scope predicate applied to these rows is governed by ADR-061. This ADR freezes only which row types qualify; the time-window bounds are ADR-061's subject.

---

### D3 — `source_authority` Structure Correction (amends ADR-059 D3)

ADR-059 D3 defined `source_authority` as:

```ts
// ADR-059 (superseded shape)
source_authority: {
  drop:      'telemetry_derived_estimate' | 'none'
  inventory: 'table_inventory_snapshot'
}
```

The `inventory` key is incorrect: it implies `table_inventory_snapshot` is the source for all inventory-side inputs, but `fills_cents` and `credits_cents` are sourced from `table_fill` and `table_credit` respectively. That conflation is a naming violation under D1.

The corrected canonical `source_authority` shape is:

```ts
// ADR-060 (authoritative shape — supersedes ADR-059 D3)
source_authority: {
  drop:      'telemetry_derived_estimate' | 'none'
  snapshots: 'table_inventory_snapshot'   // opener and closer only
  fills:     'table_fill'
  credits:   'table_credit'
}
```

**Rules:**
- `drop: 'telemetry_derived_estimate'` when `drop_estimate_state = 'present'`; `drop: 'none'` when `drop_estimate_state = 'none_for_session'`
- `snapshots`, `fills`, and `credits` are always set to their literal source table names — they are not nullable; absence of a snapshot produces `integrity_issues`, not a null `source_authority` entry
- No source authority key may be set to `'table_inventory_snapshot'` for fills or credits; doing so is a naming violation

This shape amendment applies to the `TableInventoryAccountingProjection` DTO (ADR-059 D3). All other ADR-059 D3 decisions remain in force.

---

### D4 — Naming Prohibitions

The following names are **forbidden** at field, API response, and surface label layers. They may not be introduced in new code, migrations, or API contracts:

```
# Forbidden field/variable names
estimated_drop_buyins_cents      ← non-canonical; underlying data is valid but name is not
estimated_drop_cents             ← deprecated alias; see D1; must not cross DTO/API/surface boundary
running_drop_cents
drop_activity_cents
projected_drop_from_buyins_cents
recorded_operational_drop_cents  ← tombstoned; see D1
drop_cents                       ← generic; ambiguous authority posture; use explicit names

# Forbidden surface labels
Win/Loss                         ← unqualified; reserved for final_table_win_loss_cents only
Final Win/Loss                   ← requires external custody authority
Estimated Win/Loss               ← removed from allowed list; ambiguous; use "Projected Win/Loss" only
Total Drop
Posted Drop
Posted Drop Amount
Final Drop
Settled Result
Reconciled Result
```

The words `final`, `reconciled`, and `settled` must not appear in any PT-2 drop or win/loss field name or surface label unless the value is sourced from an external custody-authoritative system introduced by ADR/FIB amendment.

**Legacy / quarantine rule:** Forbidden field names that already exist in legacy code or API responses (`estimated_drop_buyins_cents`, `win_loss_estimated_cents`, `win_loss_inventory_cents`, etc.) may survive only as internal inputs to the migration path. They must not cross the `TableInventoryAccountingProjection` DTO boundary and must be scheduled for deletion or rename in the PRD suppression inventory. Presence in an active API response after exemplar acceptance is a P0 split-brain violation.

**Allowed surface labels (exhaustive):**

| `calculation_kind` | Required label | Required qualifier / disclosure |
|---|---|---|
| `telemetry_drop_formula` | "Projected Win/Loss" | "Includes telemetry-derived drop estimate. Non-custody. Not final." |
| `inventory_only` | "Partial Table Result" | Must disclose missing inputs (e.g. "Drop estimate not available for this session") |
| `integrity_failure` | _(no result label)_ | Render integrity disclosure only; neither result label may appear |

No label outside this table may be used to describe a table result value at any operator-visible surface. Inventing a new label that avoids forbidden words while not appearing in this table is not compliant.

---

### D5 — Required Qualifier Constraints

Every use of `telemetry_derived_drop_estimate_cents` in a DTO, API response, or surface rendering must carry:

- `source_authority.drop = 'telemetry_derived_estimate'`
- `custody_status = 'non_custody_estimate'`

These are not optional annotations. A `telemetry_derived_drop_estimate_cents` value without these qualifiers is non-conformant with ADR-053 D2.

---

## 3. Consequences

### Positive

- The vocabulary freeze makes naming violations detectable at code review and ADR gate rather than at audit time.
- Explicit tombstones for deprecated names (`recorded_operational_drop_cents`, `estimated_drop_buyins_cents`) prevent reuse under plausible-looking aliases.
- The `source_authority` correction removes a silent misleading claim in the DTO — fills and credits are no longer falsely attributed to the inventory snapshot table.
- The telemetry kind enumeration closes the `RATED_ADJUSTMENT` ambiguity at the ADR layer. Current schema/RPC support for `RATED_ADJUSTMENT` is treated as legacy drift relative to this canonical exemplar, not as an input obligation.

### Trade-offs

- Any future or existing non-canonical `telemetry_kind` value that should contribute to the drop estimate requires an ADR amendment before crossing the `TableInventoryAccountingProjection` boundary. This is an intentional forcing function, not an oversight.
- The `source_authority` shape change from ADR-059 D3 adds two new keys (`fills`, `credits`) that EXEC-SPEC and PRD must reflect. This is a breaking amendment to the DTO shape, but it corrects a semantic error in the original.

---

## 4. Rejected Alternatives

### Option B2 — Generic `drop_cents` + `drop_type` discriminator

Replace explicit field names with a single `drop_cents` field carrying a `drop_type` discriminator (`'telemetry_derived' | 'posted' | 'counted' | ...`).

**Rejected because:** A generic `drop_cents + drop_type` pattern pushes disambiguation to consumer logic at runtime. Every consumer must inspect the discriminator before interpreting the value; missing that check produces the same false-authority semantics the vocabulary freeze is designed to prevent. Explicit field names (`telemetry_derived_drop_estimate_cents`) carry their own semantic precision — the name is the documentation. The split-brain that prompted FIB-H-TIA-CANON-001 originated from exactly this kind of collapsed naming; reintroducing it under a `drop_type` discriminator is a regression.

### Partial enumeration (allow future kinds without amendment)

Allow new `telemetry_kind` values to contribute to the drop estimate without an ADR amendment, relying on the service implementation to filter correctly.

**Rejected because:** The telemetry kind list is a formula input contract, not an implementation detail. A future kind that is silently included in the SUM changes the value of `telemetry_derived_drop_estimate_cents` without changing its name or custody status. That is a semantic change to a frozen formula input. Amendment is the correct gate for that change, not a service-layer implementation decision.

---

## 5. Out of Scope

- Session-scope aggregation window for `telemetry_derived_drop_estimate_cents` — governed by ADR-061.
- `final_table_win_loss_cents` and any custody-authoritative formula — requires external custody integration ADR + FIB amendment; not governed here.
- Implementation of `posted_drop_amount_cents`, `counted_drop_amount_cents`, or `external_custody_drop_cents` — reserved vocabulary; forbidden in this slice.
- Surface rendering mechanics beyond label rules (D4) — owned by PRD acceptance criteria.
- PRD acceptance criteria and suppression sequencing — owned by the PRD.

---

## 6. Closing Statement

There is no unqualified "drop" in PT-2.

> Every drop-like concept has a name that declares what it is,
> where it came from, and whether custody has been established.
> If the name does not say those things, the name is wrong.

The original split-brain was, at its root, a naming failure. A formula that accepted `estimated_drop_buyins_cents` in one surface and ignored it in another was not a formula disagreement — it was a vocabulary failure. This ADR closes that vector.

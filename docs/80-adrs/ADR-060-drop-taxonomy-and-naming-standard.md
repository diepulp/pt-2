---
id: ADR-060
title: Drop Taxonomy and Naming Standard for PT-2
status: Proposed
date: 2026-05-27
owner: Architecture Review
decision_scope: |
  Canonical vocabulary for "drop" in PT-2: permitted field names, forbidden generic labels,
  required qualifier prefixes, and reserved future vocabulary for counted/posted cash drop.
triggered_by: |
  FIB-H-TIA-CANON-001 — drop vocabulary ambiguity was the root cause of the split-brain resolved
  by ADR-059. Generic "drop" language produces competing interpretations across telemetry-derived
  estimates, drop-box cash custody/count processes, and posted count amounts. RFC-007 Phase 4 ADR-B candidate.
related:
  - ADR-059
  - ADR-052
  - ADR-053
  - docs/issues/table-inventory-accounting-canon/planning/FIB-H-TABLE-INVENTORY-ACCOUNTING-CANONIZATION-v1-exemplar.md
  - docs/02-design/RFC-007-table-inventory-accounting-canonization.md
supersedes: []
---

# ADR-060: Drop Taxonomy and Naming Standard for PT-2

## 1. Context

"Drop" in casino table accounting refers to at least three distinct financial concepts:

1. **Telemetry-derived estimate** — the aggregate of rated and grind buy-ins telemetered during a
   session; a non-custody approximation of the cash that may later be counted from the drop box.
2. **Count-room verified cash drop** — the amount established from the table drop-box
   cash custody/count process. A drop box contains live cash from table play; it is not a chip
   custody event and is not part of table inventory.
3. **Posted count amount** — the posted, ledger-accepted drop figure after count reconciliation;
   the authoritative financial total that ADR-053 restricts PT-2 from claiming.

PT-2 has historically used "drop" as a generic label. Metric components, rundown RPCs, and DTO
fields have each applied the term differently, contributing directly to the split-brain addressed by
ADR-059. A future implementor who reads "drop" in a field name cannot determine which concept is
intended without tracing upstream to the source query.

This ADR freezes the vocabulary so that field names are self-documenting at the DTO boundary.

---

## 2. Decision

### 2.1 Permitted vocabulary at baseline

Only one drop-concept is permitted in PT-2 at the post-exemplar target baseline established by
FIB-H-TIA-CANON-001:

| Field name | Concept | Status |
|---|---|---|
| `telemetry_derived_drop_estimate_cents` | Session-scoped aggregation of rated/grind buy-in telemetry | **Permitted — the only target-baseline drop field** |

No other drop-concept field may be exposed at that baseline. `telemetry_derived_drop_estimate_cents`
is the only canonical drop field in `TableInventoryAccountingProjection`.

### 2.2 Forbidden field names and labels

The following generic names must not appear in any new DTO, query projection, API response field, or
UI label introduced after the exemplar merge:

- `drop_cents`
- `drop_amount`
- `drop_estimate` (without the `telemetry_derived_` qualifier)
- `estimated_drop_buyins_cents` (legacy field — P0 suppression target per ADR-059)
- `physical_box_removal_cents`
- `physical_box_removal_*_cents`
- The bare label "Drop" without a qualifier prefix in any operator-visible UI string
- "Estimated Drop" or "Est. Drop" for an amount rendered to an operator

Any use of these names in new code is an ADR violation.

### 2.3 Required qualifier prefixes by concept

| Concept | Required prefix | Example field name |
|---|---|---|
| Telemetry-derived session estimate | `telemetry_derived_` | `telemetry_derived_drop_estimate_cents` |
| Count-room verified cash drop | `counted_drop_` | `counted_drop_amount_cents` (reserved; not yet implemented) |
| Posted count amount (ledger) | `posted_drop_` | `posted_drop_amount_cents` (reserved; not yet implemented) |

The prefix must appear in the field name itself, not only in accompanying metadata or documentation.

### 2.4 Reserved future vocabulary

`counted_drop_amount_cents` and `posted_drop_amount_cents` are reserved names. They must not be used
for any concept other than their definitions above. Introducing either requires an ADR amendment
confirming that external count-room/cash-custody authority and a Finance cross-context DTO contract
are in place (per FIB-H-TIA-CANON-001 §G and ADR-053).

No `physical_box_removal_*_cents` field is reserved or permitted. Physical drop-box movement is a
cash custody/posture event, not an amount-bearing table inventory fact. If PT-2 later models drop-box
movement, it must use no-amount event language such as `drop_box_removed_event` or
`drop_box_removed_at`; it must not be used as an input to table inventory accounting or projected
win/loss.

### 2.5 UI label standard

When displaying a drop-derived value to an operator, the label must include the qualifier:

| Context | Permitted label |
|---|---|
| `drop_estimate_state = 'present'` — full formula | "Projected Win/Loss" (not "Drop") |
| Drop estimate line item if displayed separately | "Telemetry-Derived Drop Estimate" |
| Counted/posted cash drop (reserved) | "Counted Drop Amount" or "Posted Drop Amount" |

The bare label "Drop" may not appear on any operator-visible surface introduced by or after the
exemplar merge.

### 2.6 Authority precedence

This ADR is subordinate to the active FIB-H-TIA-CANON-001 classification artifact and
`TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md`. If this ADR appears to conflict with
those artifacts, the classification artifact and ubiquitous-language baseline govern until this ADR
is amended.

### 2.7 Verification gate

The exemplar merge must prove forbidden active-surface names are absent from application code:

```bash
rg "estimated_drop_buyins_cents|physical_box_removal_.*_cents|drop_cents|drop_amount|drop_estimate" app components services
rg "'Drop'|\"Drop\"|'Estimated Drop'|\"Estimated Drop\"|'Est\\. Drop'|\"Est\\. Drop\"" app components services
```

Any remaining match must either be removed, renamed to the canonical vocabulary, or explicitly
documented as a non-operator-visible historical/test fixture before the exemplar is accepted.

---

## 3. Consequences

**Positive:**
- Field names are unambiguous at the DTO boundary. No reader needs to trace upstream to determine
  which drop concept is intended.
- Prevents the split-brain from re-emerging in a follow-on slice that introduces "drop" generically.
- The `telemetry_derived_` prefix signals non-custody status at the field name level, reinforcing
  ADR-053 at the API surface without requiring the reader to check `custody_status`.

**Negative / constraints:**
- All existing `estimated_drop_buyins_cents` references must be deleted at P0 suppression (same-merge,
  per ADR-059 §2.5). No renaming shim — the field must be absent from all active API responses.
- Existing operator-visible labels "Drop", "Estimated Drop", and "Est. Drop" must be suppressed or
  renamed at exemplar merge if they render a drop-derived amount.
- Future drop-concept features require this ADR to be read before naming any field. The vocabulary
  must be treated as a binding standard, not a naming suggestion.

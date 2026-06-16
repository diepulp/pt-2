# Thesaurus Directive — Table Inventory Accounting Canon

**Document type:** semantic containment directive  
**Applies to:** Table Inventory Accounting canonization exemplar slice  
**Status:** Revised — candidate for adoption before PRD  
**Date:** 2026-05-29  
**Source trigger:** Post-ADR semantic congruity report and follow-up architecture review  
**Related artifacts:** ADR-059, ADR-060, ADR-061, FIB-H-TIA-CANON-001, TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md, SEMANTIC-CONGRUITY-REPORT.yaml

---

## 1. Purpose

This directive prevents the Table Inventory Accounting ubiquitous language effort from becoming a second implementation system.

The semantic problem is real: PT-2 previously allowed `Win/Loss`, `Drop`, `Need`, telemetry-derived values, inventory movement, and dashboard-local formulas to drift across surfaces. That drift created operator-facing ambiguity and false authority claims.

The correction is also real: the exemplar needs a small, enforceable semantic canon.

But the thesaurus must not become a blacklist, rejected-term dictionary, or negative vocabulary factory. A thesaurus exists to name accepted system concepts. Terms that are not accepted into the canon should not be expanded, memorialized, or taught as if they are part of the language.

This directive therefore limits the thesaurus to:

1. **accepted canonical terms** required by the exemplar;
2. **candidate terms under consideration**, only when a decision is still open;
3. **legacy aliases discovered in existing code**, only as migration facts with a disposition;
4. **surface-label conformance tests**, not broad forbidden terminology.

The thesaurus must help future slices propagate accepted language gradually. It must not invent new terminology merely to say that the terminology is not allowed.

---

## 2. Diagnosis

The post-ADR congruity report found that the ADR spine is mostly coherent, but it also found synchronization cracks between ADRs, the UL baseline, classification YAML, and scaffold artifacts.

The highest-value findings were not new domain decisions. They were artifact drift:

- `Estimated Win/Loss` remained allowed in some places after ADR-060 narrowed the exemplar label to `Projected Win/Loss`.
- `source_authority.inventory` remained in ADR-059 after ADR-060 corrected the key to `source_authority.snapshots`.
- `estimated_drop_cents` had inconsistent posture: acceptable-with-label in one artifact, deprecated transitional alias in ADR-060.
- `RATED_ADJUSTMENT` exclusion was correctly defined in ADR-060 and ADR-061, but absent from some downstream semantic references.
- completeness terminology still varied between earlier `input_completeness` wording and the later `completeness.status` envelope.

These are not signs that the business domain needs more vocabulary. They are signs that the vocabulary has been copied into too many places with too much independent authority.

The correction is not to create a larger list of prohibited words. The correction is to define a smaller accepted canon and make every non-canonical occurrence resolve to one of three mechanical dispositions: **map**, **suppress**, or **delete**.

---

## 3. Directive

The Table Inventory Accounting thesaurus is a **thin accepted-language registry** for the exemplar slice.

It is not:

- a blacklist;
- a rejected-term encyclopedia;
- a field-name graveyard;
- a source of future enum values;
- an implementation authority independent of accepted ADRs and PRD tests.

The implementation authority for the exemplar slice is limited to:

1. the accepted ADR decisions;
2. the `TableInventoryAccountingProjection` DTO contract;
3. the canonical formula and source predicate;
4. the accepted surface-label map;
5. the legacy alias disposition ledger;
6. the PRD/EXEC acceptance tests.

The UL baseline may explain accepted terms, but it must not independently define implementation behavior that is not present in the executable canon.

---

## 4. Authority Order

When artifacts disagree, use the following order:

```yaml
semantic_authority_order:
  1: ADR-059 / ADR-060 / ADR-061
  2: TableInventoryAccountingProjection DTO contract
  3: PRD acceptance tests
  4: UL baseline as accepted glossary and legacy alias disposition ledger only
  5: FIB-H as historical intent and containment rationale only
```

The FIB-H remains valuable as intent history, but it is not the place to resolve fine-grained formula semantics after ADR acceptance.

The UL baseline remains valuable as a glossary, but it must not compete with the ADRs or DTO contract.

---

## 5. Executable Canon Rule

A semantic rule is authoritative for the exemplar only if it can be expressed as one of the following:

```yaml
executable_semantic_forms:
  - DTO field
  - DTO discriminator value
  - formula operand
  - SQL source predicate
  - accepted surface label
  - legacy alias disposition
  - acceptance test
```

If a semantic statement cannot be reduced to one of those forms, it is explanatory rationale.

Rationale may remain in the UL baseline, but PRD/EXEC must not treat it as a new requirement unless it is converted into one of the executable forms above.

---

## 6. Minimal Exemplar Canon

The exemplar semantic canon is limited to the following.

### 6.1 Owner

```yaml
owner:
  subdomain: TableInventoryAccounting
  parent_context: TableContextService
  write_authority: none
  derivation_mode: read_time_derivation
```

`TableInventoryAccounting` owns the formula and DTO shape. It does not author new financial facts, outbox rows, telemetry facts, or reconciliation records.

---

### 6.2 Canonical Formula

```text
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

Rules:

- no competing win/loss-like formula may survive on an active operator-visible surface after exemplar acceptance;
- no `COALESCE(telemetry_derived_drop_estimate_cents, 0)` is permitted;
- `null` means no usable estimate exists for the session;
- `0` means a usable estimate exists and sums to zero.

---

### 6.3 Result States

```yaml
result_states:
  telemetry_drop_formula:
    populated_field: projected_table_win_loss_cents
    surface_label: Projected Win/Loss
    custody_status: non_custody_estimate

  inventory_only:
    populated_field: partial_table_result_cents
    surface_label: Partial Table Result
    missing_inputs:
      - drop_estimate
    custody_status: non_custody_estimate

  integrity_failure:
    populated_field: none
    surface_label: none
    behavior: suppress table-result values and expose integrity_issues

  final_table_win_loss_cents:
    populated_field: null_always_this_slice
    surface_label: none_this_slice
    requires: external custody authority plus ADR/FIB amendment
```

Only one result field may be non-null in a response.

---

### 6.4 Accepted Surface Labels

```yaml
accepted_surface_labels:
  telemetry_drop_formula: Projected Win/Loss
  inventory_only: Partial Table Result
```

No other win/loss-like label is part of the exemplar thesaurus.

Important distinction:

> A label absent from this map is not a thesaurus entry. It should not be defined, explained, or propagated as a negative term. If it appears in existing code, classify it in the legacy alias disposition ledger and remove it from active surfaces.

---

### 6.5 Source Predicate

```sql
telemetry_derived_drop_estimate_cents =
  SUM(tbt.amount_cents)
  FROM table_buyin_telemetry tbt
  WHERE tbt.casino_id     = ts.casino_id
    AND tbt.table_id      = ts.gaming_table_id
    AND tbt.telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
    AND tbt.occurred_at  >= ts.opened_at
    AND tbt.occurred_at  <  COALESCE(ts.closed_at, NOW())
```

Rules:

- session scope only;
- gaming-day scope is not the source for this field;
- `RATED_ADJUSTMENT` is not in the exemplar source predicate;
- `rpc_shift_table_metrics` is not a valid source for this field;
- `NOW()` must be transaction-stable or captured once per derivation request;
- null SUM must remain null.

`RATED_ADJUSTMENT` should be documented as a predicate exclusion, not as a general thesaurus term.

---

### 6.6 Source Authority Shape

```ts
source_authority: {
  drop:      'telemetry_derived_estimate' | 'none'
  snapshots: 'table_inventory_snapshot'
  fills:     'table_fill'
  credits:   'table_credit'
}
```

Rules:

- `snapshots` covers opener and closer only;
- fills and credits must not be described as sourced from `table_inventory_snapshot`;
- `source_authority.inventory` is superseded and must not appear in the final DTO contract.

---

### 6.7 Drop Estimate State

For the exemplar, keep the discriminator narrow:

```ts
drop_estimate_state: 'present' | 'none_for_session'
```

Future states such as `bridge_pending`, `source_unavailable`, or `integrity_issue` may be discussed in rationale, but they must not enter the exemplar DTO unless a PRD explicitly accepts the expanded contract and test burden.

For this exemplar, integrity failures belong in `calculation_kind = 'integrity_failure'` and `integrity_issues`, not in an expanded drop-state enum.

---

### 6.8 Completeness Envelope

```ts
completeness: {
  included_inputs: ReadonlyArray<
    | 'opening_inventory'
    | 'closing_inventory'
    | 'fills'
    | 'credits'
    | 'telemetry_drop_estimate'
  >
  missing_inputs: ReadonlyArray<'drop_estimate'>
  status: 'complete' | 'partial' | 'integrity_failure'
}
```

Rules:

- `drop_estimate` is the only normal missing input;
- missing opener or closer is not partial completeness — it is integrity failure;
- `complete` never upgrades `custody_status`;
- `custody_status` remains `non_custody_estimate` throughout this slice.

---

## 7. Legacy Alias Disposition Ledger

Legacy aliases are migration facts, not thesaurus concepts.

They are relevant only when they already exist in code, docs, DTOs, tests, reports, or user-visible labels and could leak past the exemplar boundary.

Do not invent non-canonical names to forbid them. Do not add hypothetical bad names to the thesaurus. Do not teach future agents a larger negative vocabulary than the system actually contains.

### 7.1 Ledger Entry Shape

Each legacy alias entry must use this shape:

```yaml
legacy_alias:
  observed_name: string
  observed_location: file_or_surface_reference
  observed_kind: field | label | function | DTO | comment | test_fixture
  disposition: map_to_canonical | suppress_surface | delete | outside_exemplar_boundary
  canonical_target: string | null
  rationale: one_sentence_max
```

### 7.2 Disposition Rules

```yaml
legacy_alias_policy:
  may_exist_in_old_code: true
  may_cross_TableInventoryAccountingProjection_boundary: false
  may_be_rendered_on_active_operator_surface: false
  must_have_disposition_before_exemplar_acceptance: true
```

Examples from known existing drift:

```yaml
known_legacy_alias_examples:
  - observed_name: estimated_drop_buyins_cents
    disposition: map_to_canonical
    canonical_target: telemetry_derived_drop_estimate_cents

  - observed_name: win_loss_inventory_cents
    disposition: suppress_surface
    canonical_target: partial_table_result_cents

  - observed_name: win_loss_estimated_cents
    disposition: suppress_surface
    canonical_target: projected_table_win_loss_cents

  - observed_name: table_win_cents
    disposition: delete
    canonical_target: null
```

These entries are not accepted vocabulary. They are cleanup instructions.

---

## 8. Candidate Term Handling

If a term is genuinely needed but not yet accepted, present it as a candidate, not as a rule.

Candidate terms must be isolated from the thesaurus until accepted by ADR or PRD amendment.

```yaml
candidate_term:
  proposed_name: string
  problem_it_solves: string
  competing_options:
    - string
  recommended_option: string | null
  decision_owner: ADR | PRD | deferred
  status: proposed | rejected | accepted | deferred
```

Candidate terms must not appear in DTOs, API contracts, UI labels, migrations, or tests until accepted.

Alternative names for the non-canonical tracking section, for consideration:

```yaml
alternatives_for_section_name:
  preferred: Legacy Alias Disposition Ledger
  acceptable:
    - Migration Alias Ledger
    - Vocabulary Boundary Ledger
    - Noncanonical Occurrence Ledger
  avoid:
    - Forbidden Terminology
    - Forbidden Name Registry
    - Not Allowed Terms
    - Rejected Vocabulary List
```

Rationale: the avoided names make rejected language feel canonical by giving it a stable home. The preferred name keeps the focus on cleanup and migration.

---

## 9. Suppression Inventory Requirement

The exemplar PRD must include a suppression inventory for every active operator-visible win/loss-like surface.

Each item must be classified as exactly one of:

```yaml
surface_disposition:
  - consume_projection
  - suppress
  - delete
  - outside_exemplar_boundary
```

`outside_exemplar_boundary` is allowed only when the surface is demonstrably not part of the active operator workflow for the exemplar release.

Known targets requiring disposition:

```yaml
known_targets:
  components:
    - components/pit/hero-win-loss-compact.tsx
    - components/pit/pit-metrics-table.tsx
    - components/pit/table-metrics-table.tsx
    - components/dashboard/analytics-panel.tsx
    - components/dashboard/casino-summary-card.tsx
  services:
    - services/table-context/rundown.ts
  fields:
    - win_loss_inventory_cents
    - win_loss_estimated_cents
    - estimated_drop_buyins_cents
    - table_win_cents
```

The PRD acceptance gate must prove no active operator-visible surface renders a competing table-result formula after exemplar acceptance.

---

## 10. Required Acceptance Tests

The exemplar PRD/EXEC must carry the following tests or equivalent proof obligations.

```yaml
required_acceptance_tests:
  TIA-CANON-RATED-ADJUSTMENT-EXCLUSION:
    proves: RATED_ADJUSTMENT rows do not contribute to telemetry_derived_drop_estimate_cents

  TIA-CANON-NULL-VS-ZERO:
    proves: no qualifying telemetry rows produce null/none_for_session; qualifying rows summing to zero produce 0/present

  TIA-CANON-SESSION-SCOPE-ONLY:
    proves: rows outside opened_at <= occurred_at < COALESCE(closed_at, NOW()) are excluded

  TIA-CANON-SURFACE-LABEL-CONFORMANCE:
    proves: exemplar surfaces render only accepted_surface_labels

  TIA-CANON-SOURCE-AUTHORITY-SHAPE:
    proves: source_authority uses drop/snapshots/fills/credits, not inventory

  TIA-CANON-INTEGRITY-FAILURE-SUPPRESSION:
    proves: missing opener or closer suppresses result fields and surfaces integrity_issues

  TIA-CANON-LEGACY-ALIAS-BOUNDARY:
    proves: legacy aliases do not cross DTO/API/surface boundaries
```

Note the naming shift: tests assert conformance and boundary behavior. They do not require the thesaurus to carry a broad list of forbidden terms.

---

## 11. Rules for Maintaining the UL Baseline

The UL baseline should be edited under these rules.

### 11.1 One Definition, Many References

Do not restate executable rules in multiple artifacts unless necessary.

Preferred pattern:

```text
ADR defines the rule.
UL baseline references the ADR and provides human explanation.
PRD turns the rule into acceptance criteria.
EXEC turns the criteria into tests.
```

Rejected pattern:

```text
ADR, UL baseline, classification YAML, scaffold, and PRD each define their own accepted-label map.
```

That is how planning-mode split-brain returns.

---

### 11.2 No Independent Implementation Semantics in Glossary

The UL baseline may define what an accepted term means.

It must not introduce:

- new enum values;
- new result states;
- new surface labels;
- new formula operands;
- new source predicates;
- new future custody states;
- new PRD obligations.

Unless those items already exist in an accepted ADR or explicit PRD amendment.

---

### 11.3 Background Rationale Must Be Marked

Any extended explanation that is not directly executable must be marked as rationale.

Example:

```md
> Rationale only — not implementation authority.
```

This prevents narrative explanation from being mistaken for a build requirement.

---

### 11.4 No Hypothetical Negative Vocabulary

Do not add a term to the thesaurus merely because it would be bad if someone used it.

A non-canonical term enters the documentation only when one of these is true:

1. it exists in current artifacts/code and needs a migration disposition;
2. it is an explicit candidate under consideration;
3. an accepted ADR names it as a reserved future concept.

Otherwise, absence from the accepted glossary is enough.

---

## 12. Anti-Patterns

### AP-TD-01 — Thesaurus as Architecture

Using the glossary to decide implementation behavior that should have been decided by ADR or PRD.

**Correction:** Move the rule into ADR/PRD or demote it to rationale.

---

### AP-TD-02 — Artifact Echo

Copying the same accepted-label map, source-authority shape, or enum values into five artifacts.

**Correction:** Keep the executable definition in one artifact and reference it elsewhere.

---

### AP-TD-03 — Future-State Leakage

Introducing future vocabulary into the exemplar DTO because it appears in the thesaurus.

**Correction:** Future vocabulary may remain in rationale. It must not enter the contract without PRD scope and tests.

---

### AP-TD-04 — Semantic Audit Loop

Requiring a semantic congruity audit after every minor wording patch.

**Correction:** Once this directive is adopted, verify only the executable canon and acceptance tests. Do not re-audit explanatory prose unless it changes an executable rule.

---

### AP-TD-05 — Negative Vocabulary Inflation

Creating lists of imaginary bad terms and then requiring future artifacts to avoid them.

**Correction:** Track only accepted terms, observed legacy aliases, accepted reserved future terms, or explicitly proposed candidates.

---

## 13. PRD Gate

The Table Inventory Accounting exemplar PRD may proceed only after:

```yaml
prd_gate:
  required_before_prd:
    - accepted surface labels are reduced to Projected Win/Loss and Partial Table Result
    - source_authority is aligned to drop/snapshots/fills/credits
    - observed legacy aliases have dispositions instead of glossary definitions
    - RATED_ADJUSTMENT exclusion is expressed as a source-predicate exclusion
    - completeness terminology is aligned to completeness.status

  required_in_prd:
    - canonical formula
    - canonical source predicate
    - accepted surface-label map
    - source_authority shape
    - legacy alias disposition ledger
    - suppression inventory
    - required acceptance tests
```

---

## 14. Closing Rule

The thesaurus grows only by accepted terminology.

Non-canonical language is handled by disposition, not definition.

Candidate language is handled by decision, not drift.

Absence from the thesaurus means absence from the canon.

# PRD Kickoff Directive — Table Inventory Accounting Canon Exemplar

**Directive ID:** PRD-KICKOFF-TIA-CANON-001  
**Status:** Ready for PRD drafting  
**Date:** 2026-05-29  
**Feature:** FIB-H-TIA-CANON-001 — Table Inventory Accounting Canonization  
**PRD target:** `PRD-0XX — Table Inventory Accounting Canon Exemplar`  
**Primary delivery mode:** One PRD, one exemplar implementation, three ADR authorities  

---

## 1. Purpose

Draft a single PRD that turns the accepted Table Inventory Accounting semantic canon into an executable exemplar slice.

This PRD must not rediscover the semantic model. The semantic model is already established. The PRD’s job is to define the smallest implementation slice that proves the canon through a real service boundary, one exemplar surface, and hard suppression of competing legacy table-result semantics.

The implementation target is the canonical `TableInventoryAccountingProjection`, derived at read time by `TableContextService.TableInventoryAccounting`, consumed first by the Pit Terminal Rundown.

---

## 2. Authority Stack

The PRD must cite the following authority model explicitly.

```yaml
authority_stack:
  feature_intent_authority:
    - FIB-H-TIA-CANON-001

  semantic_admission_authority:
    - SRL-TIA-001-table-inventory-accounting.yaml

  terminology_authority:
    - TIA-CANON-THESAURUS-ZACHMAN.yaml
    - TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md

  behavioral_decision_spine:
    - ADR-059-table-inventory-accounting-canon-ownership-and-formula
    - ADR-060-drop-taxonomy-and-naming-standard
    - ADR-061-session-scope-aggregation-boundary

```

### Authority rule

The PRD may elaborate delivery, sequencing, and acceptance criteria. It must not change the semantic meaning of admitted terms, the canonical formula, the drop taxonomy, the session-scope predicate, or the SRL laws.

---

## 3. PRD Shape

Use one PRD for the full exemplar slice.

Do not create one PRD per ADR. ADR-059, ADR-060, and ADR-061 are decision facets of one deployable semantic slice.

```yaml
prd_shape:
  one_prd_for:
    - TableInventoryAccounting read-time derivation module
    - TableInventoryAccountingProjection DTO
    - API/BFF boundary
    - Pit Terminal Rundown exemplar consumption
    - legacy table-result formula deletion from exemplar path
    - active surface suppression inventory
    - tests enforcing ADR-059 / ADR-060 / ADR-061 / SRL-TIA-001

  not_three_prds_for:
    - formula ownership
    - drop taxonomy
    - session aggregation
```

---

## 4. Non-Negotiable Semantic Invariants

The PRD must carry these as hard acceptance gates.

```yaml
semantic_invariants:
  canonical_owner:
    context: TableContextService
    subdomain: TableInventoryAccounting
    write_authority: none
    role: read-time derived semantic authority for table-result values

  formula_projected_table_win_loss_cents:
    expression: >
      telemetry_derived_drop_estimate_cents
      + closing_inventory_cents
      + credits_cents
      - opening_inventory_cents
      - fills_cents
    allowed_only_when: calculation_kind == telemetry_drop_formula
    

  formula_partial_table_result_cents:
    expression: >
      closing_inventory_cents
      + credits_cents
      - opening_inventory_cents
      - fills_cents
    allowed_only_when: calculation_kind == inventory_only
    inventory_side_result_derivation:
      output_field: partial_table_result_cents
      expression: >
        closing_inventory_cents
        + credits_cents
        - opening_inventory_cents
        - fills_cents
      allowed_only_when: calculation_kind == inventory_only
      semantic_rule: >
        This is not a win/loss formula and not an intermediary toward final_table_win_loss_cents.
        It is the inventory-side table result when telemetry_derived_drop_estimate_cents is absent.
        It must render only as "Partial Table Result" with missing drop disclosure.

  final_table_win_loss_cents:
    value: null
    rule: always null in this slice

  custody_status:
    value: non_custody_estimate
    rule: never upgraded by completeness.status == complete

  telemetry_derived_drop_estimate_cents:
    source: table_buyin_telemetry
    aggregation: null-preserving SUM(amount_cents)
    telemetry_kind_included:
      - RATED_BUYIN
      - GRIND_BUYIN
    telemetry_kind_excluded:
      - RATED_ADJUSTMENT
    forbidden:
      - COALESCE(SUM(...), 0)
      - gaming_day aggregation
      - rpc_shift_table_metrics delegation

  session_scope_predicate:
    required_sql_shape: |
      WHERE tbt.casino_id = ts.casino_id
        AND tbt.table_id = ts.gaming_table_id
        AND tbt.telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
        AND tbt.occurred_at >= ts.opened_at
        AND tbt.occurred_at < COALESCE(ts.closed_at, NOW())

  result_exclusivity:
    rule: at most one result field may be non-null per response
    fields:
      - projected_table_win_loss_cents
      - partial_table_result_cents
      - final_table_win_loss_cents

  consumers_render_only:
    rule: >
      No UI component, route, RPC, dashboard, or report may compute a competing
      win/loss-like table result from raw inventory or telemetry fields.
```

---

## 5. Required DTO Boundary

The PRD must require a DTO equivalent to the following semantic minimum.

```ts
interface TableInventoryAccountingProjection {
  projected_table_win_loss_cents: number | null
  partial_table_result_cents: number | null
  final_table_win_loss_cents: null

  telemetry_derived_drop_estimate_cents: number | null
  opening_inventory_cents: number | null
  closing_inventory_cents: number | null
  fills_cents: number
  credits_cents: number

  drop_estimate_state: 'present' | 'none_for_session'
  calculation_kind: 'telemetry_drop_formula' | 'inventory_only' | 'integrity_failure'

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

  integrity_issues: string[]

  custody_status: 'non_custody_estimate'

  source_authority: {
    drop: 'telemetry_derived_estimate' | 'none'
    snapshots: 'table_inventory_snapshot'
    fills: 'table_fill'
    credits: 'table_credit'
  }
}
```

PRD/EXEC may add identity and raw echo fields, but may not remove or weaken the semantic fields above.

---

## 6. PRD Workstreams

### WS1 — SRM / Preflight Closure

Resolve pre-implementation governance blockers.

Required items:

- Confirm ADR-059, ADR-060, and ADR-061 are `Accepted` before implementation begins.
- Resolve or explicitly patch the `table_buyin_telemetry` SRM ownership gap before code execution.
- Declare `table_buyin_telemetry` as a consumed input for `TableInventoryAccounting.telemetry_derived_drop_estimate_cents`.
- Confirm `TableInventoryAccounting` remains a subdomain of `TableContextService`, not a standalone bounded context.

Exit gate:

```yaml
WS1_exit_gate:
  adr_status: accepted
  table_buyin_telemetry_ownership_gap: resolved_or_prd_preflight_patched
  no_new_bounded_context: true
```

### WS2 — TableInventoryAccounting Read-Time Derivation

Implement the service/BFF derivation boundary.

Required items:

- Create `TableInventoryAccounting` module under `TableContextService`.
- Resolve session identity and table identity from `table_session`.
- Resolve opener and closer inventory snapshots.
- Resolve fills and credits.
- Compute `telemetry_derived_drop_estimate_cents` using the frozen session-scope predicate.
- Preserve null-vs-zero semantics.
- Produce the three-result-state machine.
- Return `TableInventoryAccountingProjection`.
- No persistence.
- No authoring writes.
- No outbox involvement.

Exit gate:

```yaml
WS2_exit_gate:
  projection_generated_by_service_only: true
  no_persistence: true
  no_side_effects: true
  no_consumer_recomputation: true
```

### WS3 — API / BFF Boundary

Expose the projection through one canonical boundary.

Required items:

- Add one endpoint or BFF function for table-session accounting projection.
- Endpoint must return the canonical DTO.
- Endpoint must not expose raw fields as an invitation for callers to re-derive result state.
- Route must not call `rpc_shift_table_metrics`.
- Route must not perform formula logic outside the service boundary.

Candidate route shape:

```text
GET /api/v1/table-context/table-sessions/{sessionId}/accounting-projection
```

Exit gate:

```yaml
WS3_exit_gate:
  api_returns_projection: true
  route_local_formula: false
  rpc_shift_table_metrics_used: false
```

### WS4 — Pit Terminal Rundown Exemplar Wiring

Make Pit Terminal Rundown the first canonical consumer.

Required items:

- Replace rundown-local `table_win_cents` / patched stub semantics with `TableInventoryAccountingProjection` consumption.
- Render result based on `calculation_kind`.
- Render `Projected Win/Loss` only for `telemetry_drop_formula`.
- Render `Partial Table Result` only for `inventory_only`.
- Render integrity disclosure only for `integrity_failure`.
- Never render unqualified `Win/Loss`.
- Never render `Final Win/Loss`, `Total Drop`, `Posted Drop`, `Settled Result`, or `Reconciled Result`.

Exit gate:

```yaml
WS4_exit_gate:
  pit_terminal_rundown_consumes_projection: true
  local_formula_removed: true
  forbidden_labels_absent: true
```

### WS5 — Legacy Alias Suppression Inventory

Prevent active split-brain surfaces from surviving the exemplar.

Required items:

Inventory every active operator-visible surface or API field using win/loss-like or drop-like legacy semantics and classify each as:

```yaml
disposition:
  - consume_TableInventoryAccountingProjection
  - suppress_rendering
  - outside_exemplar_boundary_with_reason
```

Minimum legacy names to search and disposition:

```yaml
legacy_aliases:
  - win_loss_inventory_cents
  - win_loss_estimated_cents
  - estimated_drop_buyins_cents
  - table_win_cents
  - source_authority.inventory
  - Estimated Win/Loss
  - Win/Loss
  - Total Drop
  - Posted Drop
```

Exit gate:

```yaml
WS5_exit_gate:
  active_surface_inventory_complete: true
  no_competing_active_formula_survives: true
  no_forbidden_surface_label_survives: true
```

### WS6 — Test and Enforcement Harness

Turn the semantic canon into executable checks.

Required tests:

```yaml
required_tests:
  DTO_contract:
    proves:
      - required semantic fields present
      - source_authority uses drop/snapshots/fills/credits
      - final_table_win_loss_cents always null

  five_operand_formula:
    proves:
      - projected formula signs match ADR-059
      - no alternate formula path survives

  partial_formula:
    proves:
      - inventory_only uses 4 operands
      - drop_estimate missing produces partial_table_result_cents

  null_vs_zero:
    proves:
      - no qualifying telemetry rows => telemetry_derived_drop_estimate_cents null
      - qualifying rows summing to zero => telemetry_derived_drop_estimate_cents 0
      - null and zero produce different drop_estimate_state behavior

  rated_adjustment_exclusion:
    proves:
      - RATED_ADJUSTMENT rows do not affect telemetry_derived_drop_estimate_cents

  session_scope_only:
    proves:
      - rows outside opened_at / closed_at window excluded
      - rows in same gaming_day but outside session excluded
      - open session uses transaction-stable NOW upper bound

  rpc_shift_table_metrics_exclusion:
    proves:
      - TableInventoryAccounting does not call or wrap rpc_shift_table_metrics

  integrity_failure_suppression:
    proves:
      - missing opener or closer sets calculation_kind = integrity_failure
      - both result fields are null
      - no result label is rendered

  consumer_render_only:
    proves:
      - Pit Terminal Rundown does not recompute formulas from raw fields
      - active surface suppression gate passes
```

Exit gate:

```yaml
WS6_exit_gate:
  all_required_tests_pass: true
  no_semantic_regression: true
```

---

## 7. Explicit Non-Goals

The PRD must explicitly exclude:

- No posted drop workflow.
- No counted drop workflow.
- No external count-room or soft-count integration.
- No final/reconciled win/loss.
- No custody-authoritative table result.
- No reconciliation engine.
- No outbox producer or consumer work.
- No persisted projection store unless a later EXEC explicitly proves it is necessary.
- No dashboard redesign.
- No generic table accounting bounded context.
- No compatibility preservation for contradictory legacy DTOs, labels, or formulas.
- No `rpc_shift_table_metrics` reuse for `telemetry_derived_drop_estimate_cents`.
- No UI-side formula patch.

---

## 8. PRD Acceptance Gate Summary

The PRD is acceptable only if it contains all of the following gates.

```yaml
prd_acceptance_gates:
  preflight:
    - ADR-059 / ADR-060 / ADR-061 accepted before implementation
    - table_buyin_telemetry ownership gap resolved or patched in PRD preflight

  service:
    - TableInventoryAccounting is implemented under TableContextService
    - read-time derivation only
    - no writes
    - no persistence
    - no outbox involvement

  formula:
    - projected_table_win_loss_cents uses exact 5-operand formula
    - partial_table_result_cents uses exact 4-operand formula
    - final_table_win_loss_cents always null

  telemetry:
    - only RATED_BUYIN and GRIND_BUYIN included
    - RATED_ADJUSTMENT excluded
    - session-scope predicate used
    - null-preserving SUM used
    - gaming_day not used as aggregation boundary
    - rpc_shift_table_metrics not used

  dto:
    - TableInventoryAccountingProjection is sole table-result DTO authority
    - source_authority shape is drop / snapshots / fills / credits
    - custody_status always non_custody_estimate
    - result fields mutually exclusive

  surface:
    - Pit Terminal Rundown consumes projection
    - no local/rpc formula remains in exemplar path
    - forbidden labels suppressed
    - active legacy surface inventory completed

  tests:
    - DTO contract test
    - formula test
    - null-vs-zero test
    - RATED_ADJUSTMENT exclusion test
    - session-scope-only test
    - source_authority shape test
    - integrity_failure suppression test
    - active-surface suppression gate
```

---

## 9. PRD Writer Instruction

Draft the PRD as an implementation kickoff, not a new investigation.

Use decisive language:

- “The PRD implements…”
- “The PRD must prove…”
- “The PRD excludes…”
- “The PRD is blocked unless…”

Avoid speculative language:

- “Consider…”
- “Explore…”
- “Maybe…”
- “Future-proof…”
- “Can be extended to…”

This slice exists to close the semantic split-brain, not to admire it from another balcony.

---

## 10. Recommended PRD Title

```text
PRD-0XX — Table Inventory Accounting Canon Exemplar
```

Recommended subtitle:

```text
Read-time TableInventoryAccountingProjection, Pit Terminal Rundown exemplar wiring, and legacy table-result suppression gate
```

---

## 11. Final Direction

Proceed to PRD drafting.

Do not split the ADRs into separate PRDs. Do not reopen semantic discovery. The PRD should now convert the established SRL/ADR canon into one narrow, executable exemplar slice.


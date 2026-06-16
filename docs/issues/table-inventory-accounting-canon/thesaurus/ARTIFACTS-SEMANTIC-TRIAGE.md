You are auditing PT-2 governance artifacts for semantic congruity against the established Ubiquitous Language baseline.

## Input artifacts

Review the following artifacts as a governed set:

- TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md
- FIB-H-TIA-CANON-001-classification.yaml
- SCAFFOLD-TABLE-INVENTORY-ACCOUNTING-CANON.md
- ADR-059-table-inventory-accounting-canon-ownership-and-formula.md
- ADR-060-drop-taxonomy-and-naming-standard.md
- ADR-061-session-scope-aggregation-boundary.md
- Any downstream PRD/EXEC artifacts that implement TableInventoryAccountingProjection

## Primary task

Create a terminology congruity matrix that cross-references every material term used across the artifacts against the canonical UL baseline.

The matrix must identify:
1. Canonical term
2. Artifact(s) where term appears
3. Definition used in each artifact
4. Whether the term is:
   - canonical
   - reserved future vocabulary
   - deprecated / transitional
   - forbidden
   - ambiguous / needs patch
5. Source authority implied by the artifact
6. Custody / authority posture implied by the artifact
7. Whether the term is allowed in the current Table Inventory Accounting exemplar slice
8. Whether the term may appear at:
   - database/internal implementation layer
   - DTO/API boundary
   - operator-visible surface
   - future reserved vocabulary only
9. Required patch if semantic drift is found

## Terms that must be checked

At minimum inspect the following terms and variants:

- drop
- drop amount
- drop activity
- drop estimate
- drop-like input
- telemetry-derived drop estimate
- telemetry_derived_drop_estimate_cents
- observed_buyin_activity_cents
- estimated_drop_cents
- estimated_drop_buyins_cents
- recorded_operational_drop_cents
- drop_activity_indicator
- drop_box_removed_event
- posted_drop_amount_cents
- counted_drop_amount_cents
- external_custody_drop_cents
- final_reconciled_drop_amount_cents
- projected_table_win_loss_cents
- partial_table_result_cents
- final_table_win_loss_cents
- Projected Win/Loss
- Estimated Win/Loss
- Win/Loss
- Final Win/Loss
- Total Drop
- Posted Drop
- Settled Result
- Reconciled Result
- telemetry_drop_formula
- inventory_only
- integrity_failure
- drop_estimate_state
- present
- none_for_session
- bridge_pending
- source_unavailable
- RATED_BUYIN
- GRIND_BUYIN
- RATED_ADJUSTMENT
- table_buyin_telemetry
- rpc_shift_table_metrics
- rpc_compute_table_rundown
- gaming_day
- session scope
- source_authority
- custody_status
- input_completeness
- missing_inputs
- included_inputs

## Special rule: RATED_ADJUSTMENT

Do not assume RATED_ADJUSTMENT is absent from the schema or runtime paths.

Validate that every artifact says or implies the following:

"RATED_ADJUSTMENT may exist in legacy/current telemetry paths, but it is non-canonical for telemetry_derived_drop_estimate_cents in this slice. Rows with telemetry_kind = RATED_ADJUSTMENT must not contribute to the canonical session-scoped SUM, must not change drop_estimate_state, and must not affect projected_table_win_loss_cents."

Flag any wording that claims RATED_ADJUSTMENT is absent, invalid, impossible, or blocked by the current schema as a semantic defect unless the artifact proves that claim from the current schema.

## Required output

Return:

1. Executive verdict:
   - clean
   - clean_with_minor_patches
   - patch_required_before_PRD
   - blocked

2. Terminology congruity matrix:

| Term | Canonical definition | Artifact usage | Status | Boundary allowed | Source authority | Custody posture | Drift? | Required patch |

3. Semantic crack register:

For each crack, include:
- crack_id
- severity: P0/P1/P2/P3
- term
- artifact
- conflicting wording
- canonical wording
- required patch
- downstream risk if not patched

4. Forbidden synonym register:

List every non-canonical synonym found, including legacy names that may exist internally but must not cross DTO/API/surface boundaries.

5. Acceptance-test requirements:

At minimum include:
- RATED_ADJUSTMENT exclusion test
- null SUM vs zero SUM test
- gaming_day vs session-scope exclusion test
- source_authority literal-shape test
- forbidden surface label test
- legacy-name boundary test

6. Final recommendation:

State whether the ADR set may proceed to PRD, and list exact patches required before PRD authorization.

## Acceptance-test minimums

Include these tests in the recommended PRD/EXEC gate:

### TIA-CANON-RATED-ADJUSTMENT-EXCLUSION

Setup:
- Create a table session with valid opener/closer/fill/credit inputs.
- Insert within-window telemetry rows:
  - RATED_BUYIN amount_cents = 10000
  - GRIND_BUYIN amount_cents = 5000
  - RATED_ADJUSTMENT amount_cents = 999999

Expected:
- telemetry_derived_drop_estimate_cents = 15000
- drop_estimate_state = present
- calculation_kind = telemetry_drop_formula
- projected_table_win_loss_cents uses 15000 only, not 1014999
- RATED_ADJUSTMENT has no effect on canonical projection

### TIA-CANON-NULL-VS-ZERO

Setup:
- Case A: no qualifying RATED_BUYIN/GRIND_BUYIN rows.
- Case B: qualifying rows exist but sum to 0.

Expected:
- Case A: telemetry_derived_drop_estimate_cents = null; drop_estimate_state = none_for_session; calculation_kind = inventory_only.
- Case B: telemetry_derived_drop_estimate_cents = 0; drop_estimate_state = present; calculation_kind = telemetry_drop_formula.

### TIA-CANON-SESSION-SCOPE-ONLY

Setup:
- Same table, same gaming day, two table sessions.
- Insert telemetry in both sessions.

Expected:
- Projection for session A includes only rows within session A bounds.
- Projection for session B includes only rows within session B bounds.
- gaming_day alone never scopes the SUM.

### TIA-CANON-FORBIDDEN-LABELS

Expected:
- telemetry_drop_formula renders "Projected Win/Loss" only.
- inventory_only renders "Partial Table Result" only.
- integrity_failure renders no result label.
- "Estimated Win/Loss", "Win/Loss", "Total Drop", "Posted Drop", and "Final Win/Loss" are rejected.

### TIA-CANON-SOURCE-AUTHORITY-SHAPE

Expected:
source_authority must be:

{
  drop: 'telemetry_derived_estimate' | 'none',
  snapshots: 'table_inventory_snapshot',
  fills: 'table_fill',
  credits: 'table_credit'
}

No `source_authority.inventory` key may exist.
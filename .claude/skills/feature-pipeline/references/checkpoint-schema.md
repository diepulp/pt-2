# Checkpoint Schema Reference

## v8 Full Schema

```json
{
  "schema_version": 8,
  "feature_id": "csv-player-import",
  "current_phase": 3,
  "status": "in_progress",
  "fib_context": {
    "mode": "fib-bound",
    "fib_h_ref": "docs/60-release/FIB-H-csv-player-import.md",
    "fib_s_ref": "docs/60-release/FIB-S-csv-player-import.json",
    "loaded_at": "2026-02-22T09:30:00Z"
  },
  "exemplar_scope": {
    "mode": "unevaluated",
    "applies": false,
    "evaluated": false,
    "declaration_source": null,
    "boundary": null,
    "first_surface_or_pair": [],
    "downstream_consumers": [],
    "deferred_decisions": [],
    "forbidden_during_exemplar": [],
    "proof_obligations": [],
    "expansion_gate": null,
    "criteria": {
      "structural_categories_count": null,
      "shared_mechanism_present": null,
      "movable_parts_count": null,
      "shared_change_risk_present": null
    },
    "warnings": [],
    "violations_detected": []
  },
  "gates": {
    "srm-ownership":     { "passed": true,  "timestamp": "2026-02-22T10:00:00Z" },
    "scaffold-approved": { "passed": true,  "timestamp": "2026-02-22T11:00:00Z" },
    "design-approved":   { "passed": true,  "timestamp": "2026-02-22T14:00:00Z" },
    "sec-approved":      { "passed": false, "timestamp": null },
    "adr-frozen":        { "passed": false, "timestamp": null },
    "prd-approved":      { "passed": false, "timestamp": null }
  },
  "artifacts": {
    "feature_boundary": "docs/20-architecture/specs/csv-player-import/FEATURE_BOUNDARY.md",
    "scaffold": "docs/01-scaffolds/SCAFFOLD-001-csv-player-import.md",
    "rfc": "docs/02-design/RFC-001-csv-player-import.md",
    "sec_note": null,
    "adr": null,
    "prd": null
  },
  "feature_classification": {
    "primary": null,
    "qualifier": null,
    "secondary": [],
    "selected_transport": null,
    "scope_expansion_check_ran": false,
    "expansion_triggers_found": [],
    "fib_amendment_required": false,
    "adm_checks": {
      "ADM-1": null, "ADM-2": null, "ADM-3": null, "ADM-4": null, "ADM-5": null,
      "ADM-6": null, "ADM-7": null, "ADM-8": null, "ADM-9": null, "ADM-10": null
    }
  },
  "adr_scope": {
    "user_choice": null,
    "active_index": 0,
    "deferred_decisions": []
  },
  "decision_scope": {
    "adr_candidate_scope_matrix_completed": false,
    "fib_scope_authority": {
      "artifact": null,
      "frozen": false,
      "downstream_expansion_allowed_without_amendment": true
    },
    "all_candidates": [],
    "approved_candidates": [],
    "blocked_candidates": {
      "deferred": [],
      "out_of_scope": [],
      "amendment_required": []
    }
  },
  "da_review": {
    "magnitude_score": 0, "magnitude_tier": null, "magnitude_signals": [],
    "tier_override": null, "tier_override_reason": null,
    "ran": false, "verdict": null, "p0_count": 0, "p1_count": 0,
    "attempt": 0, "override_reason": null, "team_name": null, "team_results": null,
    "cross_artifact_findings": 0, "resolved_conflicts": [], "unresolved_conflicts": []
  },
  "coherence": {
    "non_goals": [],
    "feature_loop": [],
    "feature_loop_frozen": false,
    "deferred_items": [],
    "deferred_items_extraction": { "status": "unevaluated", "source_sections": [], "warnings": [] },
    "expansion_triggers": [],
    "expansion_triggers_extraction": { "status": "unevaluated", "source_sections": [], "warnings": [] },
    "scope_authority": { "artifact": "FEATURE_INTAKE_BRIEF", "version": "v0", "frozen": false },
    "violations": []
  },
  "srm_validation": {
    "ran": false, "owner_service": null, "write_tables": [], "cross_context_contracts": []
  },
  "branch": null, "working_directory": null, "timestamp": "2026-02-22T14:00:00Z"
}
```

**Location:** `.claude/skills/feature-pipeline/checkpoints/{feature-id}.json`

---

## Checkpoint Invariants

- **`current_phase`** must be 0–5. There is no Phase 6.
- **`status`** must be one of: `"initialized"`, `"in_progress"`, `"design-complete"`, `"failed"`.
- **`fib_context.mode`** must be `"fib-bound"` or `"fib-absent"`. Set at pipeline startup.
- **`gates`** keys: `srm-ownership`, `scaffold-approved`, `design-approved`, `sec-approved`, `adr-frozen`, `prd-approved`. No others.
- **`artifacts`** keys: `feature_boundary`, `scaffold`, `rfc`, `sec_note`, `adr`, `prd`. No others.
- **`feature_classification.primary`** must be set before `scaffold-approved` passes.
- **`feature_classification.qualifier`** must be explicitly set before `scaffold-approved` passes — `null` when no sub-pattern applies, or one of `"canonical_derived_model"` (CLS-002-Q1) / `"telemetry_fact"` (CLS-004-Q1) when the Phase 1 decision tree trace reaches a qualifier condition. The field must not be absent from the checkpoint.
- **`feature_classification.adm_checks`** all 10 values must be non-null before `prd-approved` passes.
- **`adr_scope.user_choice`** must be non-null before `adr-frozen` passes. Valid values: `"decompose"` | `"scope-to-one"` | `"collapse-user-acknowledged"` | `"user-defined"` | `"not-applicable"` (single unambiguous decision, no overflow detected).
- **`exemplar_scope.mode`** must not remain `"unevaluated"` after FIB Context Load in fib-bound mode. `"not_applicable"` requires all four `criteria` fields populated with negative evidence.
- **`coherence.deferred_items_extraction.status`** and **`expansion_triggers_extraction.status`** must not be `"unevaluated"` after FIB Context Load in fib-bound mode. Gates check status, not array length.
- **`decision_scope.adr_candidate_scope_matrix_completed`** must be `true` before `design-approved` passes.
- **`decision_scope.all_candidates[]`** must contain every RFC candidate regardless of status (full audit trail).
- **`decision_scope.approved_candidates[]`** may only contain IDs with `scope_status` in [`in_exemplar`, `constrained`]. Phase 4 may author only IDs listed here.
- **Forbidden fields:** `exec_spec`, `dod_gates`, `exec_spec_workstreams`, `execution_phases` — build-pipeline state. If present, strip and warn.

---

## Migration Protocol (v1 → v8)

**v1 → v2:** Set `schema_version: 2`. Map `gates_passed`/`gates_pending` arrays to `gates` object (`passed: true/false`, timestamp from checkpoint). Initialize `da_review`, `coherence`, `srm_validation` with defaults. Remove old array fields.

**v2 → v3:** Set `schema_version: 3`. Inject `"fib-approved": { "passed": false, "timestamp": null }` before `srm-ownership`. Inject `"fib_h": null, "fib_s": null` before `feature_boundary`. Expand `coherence` with `feature_loop`, `feature_loop_frozen`, `deferred_items`, `scope_authority`. Shift `current_phase` by +1.

**v3 → v4:** Set `schema_version: 4`. Inject `fib_context` block: `mode` from `gates["fib-approved"].passed` (`"fib-bound"` if true, else `"fib-absent"`); `fib_h_ref`/`fib_s_ref` from `artifacts.fib_h`/`artifacts.fib_s`; `loaded_at` from `gates["fib-approved"].timestamp`. Remove `fib-approved` from `gates`. Remove `fib_h`/`fib_s` from `artifacts`. Shift `current_phase` by -1; clamp minimum to 0.

**v4 → v5:** Set `schema_version: 5`. Inject `feature_classification` block with all null/empty defaults. Existing checkpoints that have already passed `scaffold-approved` should backfill `primary` and `selected_transport` from the scaffold frontmatter if readable; otherwise leave null and re-run Phase 1 classification sub-step.

**v5 → v6:** Set `schema_version: 6`. Inject `"qualifier": null` into `feature_classification` immediately after `"primary"`. For checkpoints that have already passed `scaffold-approved`, backfill `qualifier` from the scaffold frontmatter classification block if present; set to `null` if no qualifier was recorded. No other fields change.

**v6 → v7:** Set `schema_version: 7`. Inject `adr_scope` block immediately before `da_review`: `{ "overflow_detected": false, "decision_manifest": [], "user_choice": null, "active_index": 0, "deferred_decisions": [] }`. For checkpoints that have already passed `adr-frozen`, set `user_choice` to `"not-applicable"` (scope check predates the gate). No other fields change.

**v7 → v8:** Set `schema_version: 8`. (1) Inject `exemplar_scope` block (all defaults: `mode: "unevaluated"`, `evaluated: false`, `criteria` all null) immediately after `fib_context`. (2) Inject `decision_scope` block (all defaults: `matrix_completed: false`, empty arrays and blocked sub-object) immediately before `da_review`. (3) Add `deferred_items_extraction: {status: "unevaluated", source_sections: [], warnings: []}` and `expansion_triggers: []` / `expansion_triggers_extraction: {status: "unevaluated", ...}` to `coherence`. (4) Remove `overflow_detected` and `decision_manifest` from `adr_scope` (redundant with candidate ledger). (5) **For checkpoints already past `design-approved`:** set `decision_scope.adr_candidate_scope_matrix_completed: false`, `legacy_checkpoint_status: "pre_scope_as_state_gate"`, `requires_backfill_review: true` — do NOT set `matrix_completed: true`, as that would falsely record a review that never happened.

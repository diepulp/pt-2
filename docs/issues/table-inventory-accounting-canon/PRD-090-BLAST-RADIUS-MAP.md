# Generate PRD-090 Refactor Blast-Radius Map

You are acting as a senior architecture auditor and release-containment planner for PT-2.

Generate a compact YAML artifact named:

```text
docs/issues/table-inventory-accounting-canon/PRD-090-REFRACTOR-BLAST-RADIUS-MAP.yaml
Purpose

PRD-090 implements the Table Inventory Accounting Canon Exemplar.

The exemplar is intentionally narrow:

one read-time TableInventoryAccounting derivation module
one canonical TableInventoryAccountingProjection DTO
one API/BFF boundary
Pit Terminal Rundown as the first migrated canonical consumer
hard suppression of legacy table-result values on active operator-visible surfaces

However, DA review has surfaced that PRD-090 sits at a hot integration seam:

table lifecycle snapshots
+ table inventory movements
+ table_buyin_telemetry
+ financial outbox / relay / projection posture
+ legacy dashboard/API consumers

The goal of this artifact is not to expand PRD-090 into a broader refactor.

The goal is to establish the refactor blast radius before EXEC so the build pipeline does not rediscover schema fossils, legacy consumers, serialized API leaks, financial-outbox dependencies, or lifecycle gaps during implementation.

Core Invariant

PRD-090 may land as an exemplar only if its consumed inputs are stable enough to support read-time derivation without requiring hidden Wave 2/outbox/projection work.

If implementation discovers that table_buyin_telemetry, fills, credits, or inventory snapshot row presence depends on unfinished financial outbox, relay, bridge, or projection-consumer work, PRD-090 must pause and emit a dependency finding instead of patching around it.

Required Framing

Make the YAML distinguish between:

Direct in-scope work
work PRD-090 must implement
Required preflight
things that must be verified before EXEC/build starts
Outbox/projection posture dependencies
things PRD-090 depends on as system posture but does not implement
Explicitly deferred work
things that must not be smuggled into PRD-090
Stop conditions
findings that should pause PRD-090 before or during EXEC
Financial Outbox Posture

Explicitly address the financial outbox relationship.

Use this position:

PRD-090 does not implement outbox producers, relay behavior, replay, persisted projection stores, or projection consumers.

However, PRD-090 consumes facts whose reliability may depend on post-Wave-2 transport posture.

Therefore, financial outbox is not an implementation workstream for PRD-090, but it is a consumed-input confidence dependency.

Specifically classify:

table_buyin_telemetry row presence
rated buy-in telemetry bridge posture
grind/unrated telemetry authoring posture
fills and credits as inventory/dependency inputs
relay/projection propagation status
bridge_pending or telemetry lag semantics

Make clear:

If `table_buyin_telemetry` is already authored and queryable as the canonical session-scoped source, PRD-090 may consume it.

If its row presence depends on unfinished outbox relay/consumer work, PRD-090 must not silently compensate by recomputing from PFT, grind sources, or shift metrics.

PRD-090 must not call or wrap:

rpc_shift_table_metrics
rpc_compute_table_rundown
financial outbox relay APIs
projection replay tools
Known DA Review Findings to Incorporate

Include these as already surfaced blast-radius drivers:

known_da_findings:
  - id: DA-P0-legacy-suppression-escape-hatch
    issue: >
      Non-Rundown operator-visible surfaces could have been classified outside
      exemplar boundary while continuing to render forbidden legacy values.
    resolution: >
      Active operator-visible consumers must either consume projection or suppress
      rendering/serialization.

  - id: DA-P0-snapshot-lookup-vocabulary
    issue: >
      PRD used invalid snapshot lookup vocabulary that could cause false
      integrity_failure.
    resolution: >
      Domain roles opener/closer bind to enforced schema values:
      snapshot_type = 'open' and snapshot_type = 'close'.

  - id: DA-P0-uppercase-snapshot-fossil
    issue: >
      Older PRD-038 RPCs query uppercase OPENING/CLOSING, but schema CHECK
      constraint only allows lowercase open/close/rundown.
    resolution: >
      PRD-090 must not carry uppercase compatibility forward.

  - id: DA-P0-serialized-api-suppression
    issue: >
      UI suppression alone is insufficient if operator-facing APIs still serialize
      forbidden legacy table-result fields.
    resolution: >
      Suppression includes render paths and serialized operator-facing API responses.
Required YAML Structure

Return only YAML.

Use this structure:

artifact:
  id: PRD-090-REFRACTOR-BLAST-RADIUS-MAP
  type: refactor_blast_radius_map
  status: proposed_pre_exec
  prd: PRD-090
  generated_for: table_inventory_accounting_canon_exemplar
  purpose: >
    Pre-EXEC containment map for PRD-090. Defines direct scope, preflight
    obligations, financial-outbox posture dependencies, deferred work, and
    stop conditions so EXEC does not discover blast radius during implementation.

core_invariant: >
  PRD-090 may implement a narrow read-time exemplar only if its consumed inputs
  are stable enough to support TableInventoryAccounting without hidden producer,
  outbox, relay, bridge, or projection-consumer work.

scope_model:
  direct_in_scope:
    - item: TableInventoryAccounting service
      reason: Canonical read-time derivation owner.
      expected_action: implement
    - item: TableInventoryAccountingProjection DTO
      reason: Sole downstream table-result authority.
      expected_action: implement
    - item: accounting projection API route
      reason: BFF/API boundary for exemplar consumer.
      expected_action: implement
    - item: Pit Terminal Rundown wiring
      reason: First canonical consumer.
      expected_action: consume_projection
    - item: active legacy render/API suppression
      reason: Prevent split-brain after exemplar lands.
      expected_action: suppress_or_verify_absent

  required_preflight:
    - item: SRM consumed-input update for table_buyin_telemetry
      owner: architecture
      required_before: WS2
      pass_condition: >
        TableContextService consumes table_buyin_telemetry as the source for
        telemetry_derived_drop_estimate_cents.
      fail_action: pause_prd090
    - item: table_inventory_snapshot schema vocabulary verification
      owner: backend
      required_before: WS2
      pass_condition: >
        snapshot_type enforced values are open, close, rundown; opener maps to
        open and closer maps to close.
      fail_action: patch_prd_or_schema_decision_before_exec
    - item: idx_tbt_kind/index verification
      owner: backend
      required_before: WS2
      pass_condition: >
        Covering index exists for casino_id, table_id, telemetry_kind, occurred_at.
      fail_action: add_minimal_index_migration_or_block
    - item: legacy consumer disposition inventory
      owner: architecture
      required_before: EXEC
      pass_condition: >
        Every active legacy consumer has consume_projection, suppress_rendering,
        or inactive_or_internal_only_with_reason disposition.
      fail_action: complete_inventory_before_exec
    - item: operator-facing API serialization inventory
      owner: backend
      required_before: EXEC
      pass_condition: >
        Forbidden legacy fields are absent from active operator-facing API responses.
      fail_action: add_suppression_action_before_exec

  financial_outbox_posture:
    classification: consumed_input_confidence_dependency
    not_in_scope:
      - outbox producer implementation
      - outbox relay changes
      - replay implementation
      - persisted projection store
      - projection consumer implementation
      - financial event catalog expansion
    relevant_because: >
      PRD-090 consumes table_buyin_telemetry and inventory/dependency inputs whose
      reliability may depend on the post-Wave-2 producer, bridge, relay, and
      projection posture.
    required_checks:
      - id: OUTBOX-CHECK-001
        subject: table_buyin_telemetry row presence
        question: >
          Are RATED_BUYIN and GRIND_BUYIN rows currently authored and queryable
          independently of unfinished outbox relay/projection work?
        acceptable_answer: yes_existing_queryable_source
        fail_action: pause_prd090_and_emit_dependency_finding
      - id: OUTBOX-CHECK-002
        subject: rated buy-in bridge posture
        question: >
          Does rated buy-in telemetry arrive in table_buyin_telemetry through a
          stable, accepted path, or is it pending relay/consumer propagation?
        acceptable_answer: stable_or_explicitly_classified
        fail_action: do_not_recompute_from_pft_inside_prd090
      - id: OUTBOX-CHECK-003
        subject: grind/unrated telemetry posture
        question: >
          Does GRIND_BUYIN authoring already produce queryable table_buyin_telemetry
          rows with the canonical telemetry_kind?
        acceptable_answer: stable_or_blocked_with_followup
        fail_action: pause_if_needed_for_input_stability
      - id: OUTBOX-CHECK-004
        subject: fills and credits
        question: >
          Are fills and credits queryable as session-scoped inventory inputs without
          depending on unfinished projection propagation?
        acceptable_answer: stable_authoring_store_available
        fail_action: block_formula_execution_until_source_confirmed
      - id: OUTBOX-CHECK-005
        subject: bridge_pending_or_lag_semantics
        question: >
          Does PRD-090 need to distinguish no telemetry for session from bridge
          pending or relay lag, or is that explicitly deferred?
        acceptable_answer: explicitly_deferred_or_modeled
        fail_action: document_deferred_semantics_and_do_not_invent_runtime_state

    forbidden_compensations:
      - recompute telemetry_derived_drop_estimate_cents from PFT directly
      - use rpc_shift_table_metrics as a source
      - use gaming_day aggregate as a session source
      - call outbox relay APIs during read-time derivation
      - introduce a projection store inside PRD-090
      - infer missing telemetry as zero
      - hide bridge lag behind inventory_only without an explicit decision

  downstream_dependency_not_in_scope:
    - item: finance_outbox producer expansion
      reason: Wave 2 transport concern, not PRD-090 read-time derivation.
      allowed_reference: posture_check_only
    - item: relay and processed_messages behavior
      reason: Transport reliability, not exemplar implementation.
      allowed_reference: posture_check_only
    - item: projection consumer propagation
      reason: Future consumer slice unless already landed.
      allowed_reference: dependency_status_only
    - item: table lifecycle producer hardening
      reason: First-session opener capture is a separate workflow.
      allowed_reference: integrity_failure_deferred_followup
    - item: bridge_pending telemetry semantics
      reason: May require transport/projection analysis beyond exemplar.
      allowed_reference: stop_condition_or_deferred_followup

  explicitly_deferred:
    - full shift dashboard migration to TableInventoryAccountingProjection
    - persistent TableInventoryAccounting projection store
    - posted drop workflow
    - counted drop workflow
    - final_table_win_loss_cents
    - reconciliation engine
    - outbox producer/consumer/replay changes
    - mandatory opener-capture workflow
    - table lifecycle schema rename
    - generic table accounting bounded context

blast_radius_vectors:
  schema_vocabulary:
    risks:
      - invalid snapshot_kind usage
      - uppercase OPENING/CLOSING fossil values
      - source_authority.inventory old key
    required_actions:
      - bind opener to snapshot_type = open
      - bind closer to snapshot_type = close
      - forbid snapshot_kind, OPENING, CLOSING, opener, closer as SQL literals
      - use source_authority.snapshots per ADR-060
  service_layer:
    risks:
      - local formula outside TableInventoryAccounting
      - accidental rpc_shift_table_metrics reuse
      - null SUM coalesced to zero
      - unstable NOW() upper bound across multiple queries
    required_actions:
      - service owns formula
      - no route/component recomputation
      - preserve null SUM
      - capture one upperBoundAt or use transaction-stable NOW()
  api_surface:
    risks:
      - legacy fields omitted from UI but still serialized
      - spoofable casino_id/session access
      - route-local formula logic
    required_actions:
      - suppress forbidden fields in operator-facing JSON
      - tenant isolation tests
      - role matrix tests
      - no route-local calculation
  ui_surface:
    risks:
      - legacy values still rendered
      - unqualified Win/Loss labels
      - non-Rundown dashboards treated as outside boundary
    required_actions:
      - Rundown consumes projection
      - non-exemplar active surfaces suppress rendering
      - grep/test active render paths
  data_input_posture:
    risks:
      - table_buyin_telemetry missing due to unfinished bridge/outbox path
      - fills/credits not session-bindable
      - snapshots missing due to lifecycle producer gaps
    required_actions:
      - preflight source availability
      - classify missing opener/closer as integrity_failure
      - do not patch around missing inputs with fake defaults

known_da_findings:
  - id: DA-P0-legacy-suppression-escape-hatch
    status: patched
    blast_radius_driver: operator_visible_legacy_surfaces
    residual_check: active_surface_suppression_gate
  - id: DA-P0-snapshot-lookup-vocabulary
    status: patched_pending_lowercase_cleanup
    blast_radius_driver: table_lifecycle_schema_binding
    residual_check: tia.snapshot_resolution
  - id: DA-P0-uppercase-snapshot-fossil
    status: must_patch
    blast_radius_driver: schema_fossil_cleanup
    residual_check: no_uppercase_snapshot_literals
  - id: DA-P0-serialized-api-suppression
    status: patched
    blast_radius_driver: operator_facing_api_contract
    residual_check: shift_metric_api_suppression

exec_stop_conditions:
  - id: STOP-001
    condition: >
      table_buyin_telemetry RATED_BUYIN or GRIND_BUYIN row presence depends on
      unfinished financial outbox relay, bridge, or projection-consumer work.
    action: pause_prd090_and_emit_dependency_finding
  - id: STOP-002
    condition: >
      Implementation requires recomputing telemetry_derived_drop_estimate_cents
      from PFT, shift metrics, or another non-canonical source.
    action: stop_and_request_ADR_or_PRD_amendment
  - id: STOP-003
    condition: >
      Valid open/close snapshots cannot be resolved using current schema vocabulary.
    action: block_EXEC_until_schema_binding_or_lifecycle_issue_resolved
  - id: STOP-004
    condition: >
      Any active operator-visible surface or operator-facing API must continue
      exposing forbidden legacy fields because suppression would break core flow.
    action: escalate_to_scope_decision_before_build
  - id: STOP-005
    condition: >
      EXEC requires adding outbox producers, relay changes, replay logic, or a
      persisted projection store to make PRD-090 pass.
    action: reject_as_scope_expansion
  - id: STOP-006
    condition: >
      First-session opener absence requires a new mandatory opener-capture workflow
      rather than integrity_failure disclosure.
    action: defer_to_followup_PRD_or_amend_scope

required_outputs_before_exec:
  - PRD-090-WS5-legacy-consumer-suppression-inventory.md
  - PRD-090-REFRACTOR-BLAST-RADIUS-MAP.yaml
  - SRL snapshot role binding patch
  - SRM table_buyin_telemetry consumed-input patch
  - index preflight evidence for idx_tbt_kind or equivalent
  - source availability note for table_buyin_telemetry, fills, credits, snapshots

final_recommendation:
  safe_to_draft_exec_when:
    - direct_in_scope is unchanged and narrow
    - all required_preflight items pass
    - financial_outbox_posture checks are answered
    - all active legacy consumers have dispositions
    - uppercase snapshot fossil vocabulary is removed from PRD-090
    - stop conditions are acknowledged in EXEC scaffold
  not_safe_to_draft_exec_when:
    - any consumed input depends on unfinished Wave 2 propagation
    - any active legacy surface/API lacks suppression or projection disposition
    - implementation would need to invent bridge_pending behavior
    - outbox/projection work is needed to make the exemplar function
Rules

Be blunt and containment-focused.

Do not propose broad refactors.

Do not move outbox work into PRD-090.

Do not claim financial outbox is irrelevant. It is not directly in scope, but it is a consumed-input confidence dependency.

Do not allow the exemplar to silently compensate for missing or unstable input sources.

Return only the YAML artifact content.
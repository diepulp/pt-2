prd_090_preflight_gates:
  status: pre_exec_required
  rule: >
    EXEC must not be drafted or built until these gates are answered.
    A failed gate either pauses PRD-090 or creates a bounded patch before EXEC.

  gate_1_legacy_consumer_disposition:
    priority: P0
    objective: >
      Prove every legacy table-result consumer has a disposition.
    required_artifact:
      - PRD-090-WS5-legacy-consumer-suppression-inventory.md
    pass_condition:
      - every active UI consumer is classified
      - every operator-facing API/DTO surface is classified
      - each consumer is one of:
          - consume_projection
          - suppress_rendering
          - inactive_or_internal_only_with_reason
      - no active surface uses inactive/internal while still rendering or serializing legacy values
    fail_action: complete classification before EXEC

  gate_2_operator_api_serialization_suppression:
    priority: P0
    objective: >
      Prove forbidden legacy fields are not merely hidden in UI while still leaking through operator-facing JSON.
    pass_condition:
      - shift table metrics API suppresses forbidden fields
      - shift pit metrics API suppresses forbidden fields
      - shift casino metrics API suppresses forbidden fields
      - route serialization tests are specified for all active affected endpoints
    forbidden_fields:
      - win_loss_inventory_cents
      - win_loss_estimated_cents
      - win_loss_estimated_total_cents
      - estimated_drop_buyins_cents
      - table_win_cents
    fail_action: add explicit suppression actions before EXEC

  gate_3_snapshot_schema_vocabulary_binding:
    priority: P0
    objective: >
      Prove PRD-090 uses actual lifecycle schema vocabulary, not fossil vocabulary.
    pass_condition:
      - opener maps only to snapshot_type = 'open'
      - closer maps only to snapshot_type = 'close'
      - rundown maps only to snapshot_type = 'rundown'
      - PRD contains no fallback lookup using:
          - snapshot_kind
          - OPENING
          - CLOSING
          - opener as SQL literal
          - closer as SQL literal
    fail_action: patch PRD/SRL before EXEC

  gate_4_snapshot_amount_resolution:
    priority: P0
    objective: >
      Prove valid snapshots resolve to inventory cents and do not falsely emit integrity_failure.
    pass_condition:
      - direct FK opener resolution works
      - direct FK closer resolution works
      - session fallback opener resolution works
      - session fallback closer resolution works
      - zero-count snapshots resolve as valid 0
      - null total_cents fallback is defined if chipset is canonical
      - chipset_total_cents() exists and is callable if used
    fail_action: block EXEC until snapshot amount source is proven

  gate_5_srl_snapshot_role_binding:
    priority: P0
    objective: >
      Prevent future agents from turning domain roles into invalid schema literals.
    required_artifact:
      - SRL-TIA-001 snapshot role binding patch
    pass_condition:
      - opener is defined as a domain role
      - closer is defined as a domain role
      - schema bindings are explicit:
          - opener -> table_inventory_snapshot.snapshot_type = open
          - closer -> table_inventory_snapshot.snapshot_type = close
      - forbidden literals are listed
    fail_action: patch SRL before EXEC

  gate_6_srm_consumed_input_patch:
    priority: P0
    objective: >
      Close the ownership gap for table_buyin_telemetry as a consumed input.
    required_artifact:
      - SRM TableContextService patch
    pass_condition:
      - TableInventoryAccounting is declared under TableContextService
      - table_buyin_telemetry is declared as consumed input
      - consumed purpose is telemetry_derived_drop_estimate_cents
      - SRM no longer marks this as unresolved
    fail_action: pause PRD-090 before WS2

  gate_7_index_preflight:
    priority: P1
    objective: >
      Prove the session-scoped telemetry SUM has supporting index coverage.
    pass_condition:
      - idx_tbt_kind exists
      - or equivalent index exists with leading columns:
          - casino_id
          - table_id
          - telemetry_kind
          - occurred_at
    fail_action: add minimal index migration before WS2

  gate_8_source_availability_note:
    priority: P0
    objective: >
      Prove the required read-time sources exist and are queryable before EXEC.
    required_artifact:
      - source availability note for snapshots, fills, credits, table_buyin_telemetry
    pass_condition:
      - table_inventory_snapshot is queryable by session_id and snapshot_type
      - table_fill is queryable by session
      - table_credit is queryable by session
      - table_buyin_telemetry is queryable by casino_id/table_id/telemetry_kind/occurred_at
    fail_action: block EXEC or emit dependency finding

  gate_9_uppercase_snapshot_fossil_cleanup:
    priority: P0
    objective: >
      Ensure PRD-090 does not carry dead uppercase compatibility forward.
    pass_condition:
      - PRD-090 removes OPENING/CLOSING compatibility wording
      - WS6 test wording forbids OPENING/CLOSING predicates
      - any mention of PRD-038 uppercase usage is historical-only, not implementation guidance
    fail_action: patch DA-004 before EXEC

  gate_10_exec_stop_conditions_acknowledged:
    priority: P0
    objective: >
      Ensure EXEC inherits the blast-radius stop conditions.
    pass_condition:
      - EXEC scaffold includes stop conditions for:
          - unstable table_buyin_telemetry row presence
          - need to recompute from PFT or shift metrics
          - unresolved snapshot lifecycle binding
          - active legacy fields that cannot be suppressed
          - any need for outbox producers/relay/replay/projection store
          - mandatory opener-capture workflow expansion
    fail_action: do not draft/build EXEC

    Next priority vector: outbox posture checks

Once those preflight gates are either passed or patched, the next vector is:
next_vector:
  name: financial_outbox_posture_checks
  priority: P0
  purpose: >
    Determine whether PRD-090 can safely consume table_buyin_telemetry and
    inventory/dependency inputs as stable read-time sources, or whether it is
    blocked by unfinished Wave 2 transport/relay/projection work.

  checks:
    - OUTBOX-CHECK-001: table_buyin_telemetry row presence
    - OUTBOX-CHECK-002: rated buy-in bridge posture
    - OUTBOX-CHECK-003: grind/unrated telemetry authoring posture
    - OUTBOX-CHECK-004: fills and credits source stability
    - OUTBOX-CHECK-005: bridge_pending / telemetry lag semantics
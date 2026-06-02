# Legacy Consumer Classification & Mapping Prompt — PRD-090 Pre-EXEC

You are acting as a senior architecture auditor for PT-2.

Your task is to map every legacy table-result consumer and call site before EXEC drafting for PRD-090: Table Inventory Accounting Canon Exemplar.

## Context

PRD-090 implements a narrow exemplar:

- `TableInventoryAccounting` read-time derivation module
- canonical `TableInventoryAccountingProjection`
- Pit Terminal Rundown as the first migrated canonical consumer
- hard suppression of competing legacy table-result semantics on all active operator-visible surfaces

The exemplar must not expand into a full dashboard migration. However, no active operator-visible surface may continue rendering or serializing forbidden legacy table-result fields after the exemplar lands.

The required strategy is:

> Migrate one consumer. Suppress the rest. Classify everything.

## Canonical Rule

For every active operator-visible route, component, dashboard, report, export, API response, or DTO field that currently renders or serializes a legacy table-result value, assign exactly one disposition:

1. `consume_projection`
   - Surface must consume `TableInventoryAccountingProjection`.
   - Required for the Pit Terminal Rundown exemplar path.
   - Use only when this PRD actually migrates the consumer.

2. `suppress_rendering`
   - Surface does not yet consume the projection.
   - It must not render or serialize forbidden legacy table-result fields or labels.
   - This is the default disposition for active legacy operator surfaces outside the Rundown exemplar.

3. `inactive_or_internal_only_with_reason`
   - Allowed only for deleted routes, archived docs/code, tests, development-only fixtures, or internal DTO bookkeeping fields that are never returned to an operator-facing boundary.
   - Forbidden for any active operator-visible surface.

No active operator-visible consumer may be classified as `inactive_or_internal_only_with_reason` while continuing to render or serialize forbidden legacy values.

## Forbidden Legacy Fields / Labels

Search for all references to:

```text
win_loss_inventory_cents
win_loss_estimated_cents
win_loss_estimated_total_cents
estimated_drop_buyins_cents
table_win_cents
"Win/Loss"
"Estimated Win/Loss"
"Total Drop"
"Posted Drop"
"Final Win/Loss"
"Settled Result"
"Reconciled Result"

Also search for formula logic equivalent to:

drop/buyins + closing inventory + credits - opening inventory - fills
closing inventory + credits - opening inventory - fills
COALESCE(SUM(...), 0)
rpc_shift_table_metrics
rpc_compute_table_rundown
Known Blast-Radius Seeds

Start with these known active render sites and trace outward:

components/shift-dashboard/table-metrics-table.tsx
components/shift-dashboard/pit-metrics-table.tsx
components/shift-dashboard/casino-summary-card.tsx
components/pit-panels/analytics-panel.tsx

Also inspect:

app/api/**
components/**
services/**
hooks/**
lib/**
types/**
docs/25-api-data/**
Required Method

For each discovered legacy consumer or call site:

Identify the file path.
Identify the exact field, label, formula, RPC, DTO, or prop being used.
Determine whether the usage is:
rendered to an active operator-visible UI;
serialized through an operator-facing API;
passed through a DTO consumed by an operator-facing surface;
internal-only;
test-only;
archived/dead.
Assign one disposition:
consume_projection
suppress_rendering
inactive_or_internal_only_with_reason
Provide the reason.
State the required PRD-090 action.
State whether EXEC must implement code changes or merely preserve/document the classification.
Output Format

Return a YAML mapping file with this structure:

legacy_consumer_classification:
  meta:
    prd: PRD-090
    purpose: >
      Pre-EXEC inventory of legacy table-result consumers and call sites.
      Prevents PRD-090 execution from rediscovering suppression scope during build.
    invariant: >
      Active operator-visible surfaces must either consume
      TableInventoryAccountingProjection or suppress legacy table-result rendering.
      No active operator-visible surface may retain forbidden legacy values.
    exemplar_scope:
      migrated_consumer:
        - Pit Terminal Rundown
      non_exemplar_consumers:
        rule: suppress_rendering unless separately amended

  forbidden_terms:
    fields:
      - win_loss_inventory_cents
      - win_loss_estimated_cents
      - win_loss_estimated_total_cents
      - estimated_drop_buyins_cents
      - table_win_cents
    labels:
      - "Win/Loss"
      - "Estimated Win/Loss"
      - "Total Drop"
      - "Posted Drop"
      - "Final Win/Loss"
      - "Settled Result"
      - "Reconciled Result"
    forbidden_sources:
      - rpc_shift_table_metrics
      - rpc_compute_table_rundown
      - gaming_day_scoped_table_result_formula
      - coalesce_sum_to_zero_for_drop_estimate

  disposition_policy:
    consume_projection:
      allowed_when: >
        The surface is intentionally migrated in PRD-090 to consume
        TableInventoryAccountingProjection.
      expected_for:
        - Pit Terminal Rundown
    suppress_rendering:
      allowed_when: >
        The surface is active/operator-visible but is not migrated in PRD-090.
      requirement: >
        It must not render or serialize forbidden legacy fields or labels.
    inactive_or_internal_only_with_reason:
      allowed_when: >
        The usage is deleted, archived, test-only, development-only, or internal
        bookkeeping never returned to an operator-visible boundary.
      forbidden_when: >
        Any operator can see the value in UI, API, export, dashboard, or report.

  consumers:
    - id: LEGACY-CONSUMER-001
      path: components/shift-dashboard/table-metrics-table.tsx
      symbol_or_usage: TBD
      legacy_terms_found:
        - TBD
      visibility: active_operator_visible_ui
      current_behavior: TBD
      disposition: suppress_rendering
      rationale: >
        Active shift dashboard surface is outside the migrated Rundown exemplar,
        but visual suppression is not deferred.
      required_prd090_action: >
        Remove/hide forbidden table-result rendering or replace with neutral
        unavailable/suppressed state. Do not compute local formula.
      exec_obligation: code_change_required
      grep_acceptance:
        must_not_render:
          - win_loss_inventory_cents
          - win_loss_estimated_cents
          - "Win/Loss"

    - id: LEGACY-CONSUMER-002
      path: components/shift-dashboard/pit-metrics-table.tsx
      symbol_or_usage: TBD
      legacy_terms_found:
        - TBD
      visibility: active_operator_visible_ui
      current_behavior: TBD
      disposition: suppress_rendering
      rationale: TBD
      required_prd090_action: TBD
      exec_obligation: code_change_required

    - id: LEGACY-CONSUMER-003
      path: components/shift-dashboard/casino-summary-card.tsx
      symbol_or_usage: TBD
      legacy_terms_found:
        - TBD
      visibility: active_operator_visible_ui
      current_behavior: TBD
      disposition: suppress_rendering
      rationale: TBD
      required_prd090_action: TBD
      exec_obligation: code_change_required

    - id: LEGACY-CONSUMER-004
      path: components/pit-panels/analytics-panel.tsx
      symbol_or_usage: TBD
      legacy_terms_found:
        - TBD
      visibility: active_operator_visible_ui
      current_behavior: TBD
      disposition: suppress_rendering
      rationale: TBD
      required_prd090_action: TBD
      exec_obligation: code_change_required

  api_and_dto_surfaces:
    - id: LEGACY-API-001
      path: TBD
      exported_field_or_response: TBD
      consumed_by:
        - TBD
      visibility: TBD
      disposition: TBD
      rationale: TBD
      required_prd090_action: TBD
      exec_obligation: TBD

  rpc_and_query_sources:
    - id: LEGACY-RPC-001
      path: TBD
      rpc_or_query: rpc_shift_table_metrics
      used_by:
        - TBD
      issue: >
        Gaming-day scoped metrics and/or COALESCE(SUM, 0) semantics are forbidden
        as source for TableInventoryAccountingProjection.
      disposition: TBD
      required_prd090_action: TBD
      exec_obligation: TBD

  allowed_residual_matches:
    - path: TBD
      term: TBD
      reason: test_only | archived_doc | migration_comment | internal_bookkeeping
      proof_not_operator_visible: TBD

  unresolved_findings:
    - id: TBD
      path: TBD
      question: TBD
      risk: TBD
      recommended_resolution_before_exec: TBD

  acceptance_tests:
    grep_no_active_operator_legacy_rendering:
      description: >
        Repo grep proves no active operator route/component/API response renders
        or serializes forbidden legacy table-result fields or labels.
      forbidden_active_matches:
        - win_loss_inventory_cents
        - win_loss_estimated_cents
        - win_loss_estimated_total_cents
        - estimated_drop_buyins_cents
        - table_win_cents
        - '"Win/Loss"'
        - '"Estimated Win/Loss"'
      allowed_match_categories:
        - tests
        - archived_docs
        - migration_comments
        - internal_only_dto_bookkeeping
        - explicit_suppression_inventory_entries

    no_local_formula_reconstruction:
      description: >
        No component, route, hook, or API reconstructs table result formulas from
        raw inventory or telemetry inputs outside TableInventoryAccounting.
      forbidden_patterns:
        - local inventory plus telemetry win/loss calculation
        - COALESCE SUM zero-drop fallback
        - rpc_shift_table_metrics used as table accounting source

  final_verdict:
    classification_complete: false
    blockers_before_exec:
      - TBD
    safe_to_draft_exec_when:
      - every active consumer has one disposition
      - every suppress_rendering item has a concrete suppression action
      - every consume_projection item is intentionally inside PRD-090 scope
      - every inactive/internal item has proof it is not operator-visible
Audit Rules

Be strict.

Do not classify an active screen as outside boundary merely because it is not the Pit Terminal Rundown.

The Rundown is the only migrated exemplar consumer. But suppression applies wider than the exemplar.

If uncertain whether a surface is operator-visible, mark it as unresolved_findings and recommend treating it as suppress_rendering until proven otherwise.

Do not propose new dashboards, redesigns, or broad migration work.

The goal is not to finish all consumers.

The goal is to prevent legacy values from surviving visibly after PRD-090 lands.
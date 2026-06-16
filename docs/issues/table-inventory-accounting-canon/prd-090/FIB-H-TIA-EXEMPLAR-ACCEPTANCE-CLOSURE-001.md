# FIB-H — Table Inventory Accounting Exemplar Acceptance Closure

**Status:** Proposed  
**Artifact type:** Feature Intake Brief — Human Scope Authority  
**Feature ID:** FIB-H-TIA-EXEMPLAR-ACCEPTANCE-CLOSURE-001  
**Date opened:** 2026-06-14  
**Priority:** P0  
**Target decision horizon:** Immediate post-PRD-090 hardening, before propagation to additional TIA consumers  
**Related implementation:** PRD-090 — Table Inventory Accounting Canon Exemplar  
**Owner:** Product / Architecture  

---

## A. Feature identity

**Feature name:**  
Table Inventory Accounting Exemplar Acceptance Closure

**Feature ID / shorthand:**  
FIB-H-TIA-EXEMPLAR-ACCEPTANCE-CLOSURE-001

**Related wedge / phase / slice:**  
Post-PRD-090 exemplar hardening and acceptance closure

**Requester / owner:**  
Product / Architecture

**Date opened:**  
2026-06-14

**Priority:**  
P0

**Target decision horizon:**  
Pre-production. This closure must pass before `TableInventoryAccountingProjection` is propagated to additional operator surfaces.

---

## B. Operator problem statement

The Pit Terminal Rundown does not yet prove the canonical Table Inventory Accounting model through the complete operator path. The derivation service, DTO, API, and legacy suppression exist, but the canonical rundown component is not mounted, its runtime states are not behaviorally tested, and no real-database or browser-level proof confirms that the operator receives the correct projected, partial, or integrity result under production-like conditions.

Without this closure, the system has an implemented accounting canon but not an accepted operator-facing exemplar.

---

## C. Pilot-fit / current-slice justification

This work is required now because PRD-090 is the canonical exemplar for all later table-result propagation. Expanding the projection to dashboards or secondary consumers before proving the exemplar against the real database, route boundary, mounted component, and operator workflow would spread an incompletely accepted path across the application.

This slice closes proof and wiring gaps only. It does not introduce new accounting behavior.

---

## D. Primary actor and operator moment

**Primary actor:**  
Pit boss or administrator

**When does this happen?**  
During active play, table rundown, or closed-session review

**Primary surface:**  
`/pit` → selected table → Inventory / Rundown panel

**Trigger event:**  
The operator needs to understand whether the current table session has:

- a projected table result using the approved telemetry-derived estimate;
- a partial table result because the estimate is absent;
- an integrity failure because required inventory snapshots cannot be resolved.

---

## E. Feature Containment Loop

1. Pit boss selects a table and opens the Inventory / Rundown surface → system requests the canonical accounting projection for the current table session.
2. System derives the result from the real session-scoped opener, closer, fills, credits, and eligible telemetry records → no UI-local or legacy rundown formula participates.
3. When all canonical inputs are present → system renders **Projected Win/Loss**.
4. When the telemetry-derived drop estimate is absent but required inventory snapshots are present → system renders **Partial Table Result** with missing-drop disclosure.
5. When the opening or closing snapshot cannot be resolved → system renders an integrity warning and no projected or partial financial value.
6. Unauthorized roles cannot access the projection, and sessions outside the authenticated casino remain unavailable.
7. The operator sees no competing legacy win/loss-like result on the same active surface.
8. Automated acceptance proves the derivation against a real database, the runtime route boundary, the component states, and one complete browser workflow.

---

## F. Required outcomes

### F.1 Database-backed derivation proof

A real-database integration suite exists for `TableInventoryAccounting` using the established local Supabase/Postgres integration harness.

The suite proves:

- `telemetry_drop_formula`;
- `inventory_only`;
- `integrity_failure`;
- explicit zero opener and closer values are valid;
- zero qualifying telemetry rows and qualifying rows summing to zero remain distinct;
- telemetry outside the session window is excluded;
- telemetry from another session at the same table is excluded;
- telemetry from another table is excluded;
- the lower timestamp boundary is inclusive;
- the closed-session upper timestamp boundary is exclusive;
- `RATED_ADJUSTMENT` is excluded;
- only canonically eligible fills and credits contribute;
- table par or unrelated configuration changes do not change the result;
- projected, partial, and final result fields remain mutually exclusive according to the canon.

The existing mock-based derivation tests remain in place.

---

### F.2 Runtime route integration proof

The existing mocked route-contract tests remain in place.

A narrower real integration suite proves:

- authorized `pit_boss` access;
- authorized `admin` access;
- unauthorized role rejection;
- cross-casino session isolation;
- real service execution through the route;
- bigint-safe response serialization;
- `integrity_failure` returns HTTP `200`;
- missing or inaccessible sessions return the canonical not-found posture.

Formula permutations are not duplicated at the route layer. Formula correctness belongs to the database-backed service suite.

---

### F.3 Behavioral component proof

Behavioral render tests exist for `RundownSummaryPanel`.

They prove:

- projected state renders **Projected Win/Loss** and the canonical value;
- partial state renders **Partial Table Result** and missing-drop disclosure;
- integrity state renders an integrity warning and no financial result;
- positive values render correctly;
- negative values render correctly;
- zero values render correctly;
- bare **Win/Loss** does not render;
- **Final Win/Loss** does not render;
- **Total Drop** does not render;
- the component does not reconstruct `calculation_kind`, completeness, or result values from raw fields.

Existing static-analysis and suppression tests remain active but do not substitute for render tests.

---

### F.4 Canonical exemplar mounting

`RundownSummaryPanel` is mounted in the Pit Terminal Inventory / Rundown surface.

The mounted component:

- consumes the established accounting projection endpoint or hook;
- renders only from `TableInventoryAccountingProjection`;
- does not duplicate an accounting value already present elsewhere on the surface;
- does not restore legacy win/loss semantics;
- coexists with fills, credits, inventory controls, and rundown actions;
- supersedes, rather than coexists with, any legacy win/loss-unavailable placeholder previously shown on the same surface, so the Inventory / Rundown surface presents exactly one operator-visible table-result statement;
- is not propagated to unrelated dashboards or secondary surfaces in this slice.

### F.4-A Placeholder supersession (legacy `RundownReportCard`)

The Pit Terminal Inventory / Rundown surface already mounts `RundownReportCard`, which renders the migration placeholder *"Table win/loss data unavailable during TIA canon migration"* in the win/loss position. This placeholder was correct only while no canonical table-result surface existed.

When `RundownSummaryPanel` is mounted on the same surface, the migration placeholder must be removed so that the operator does not simultaneously see a "win/loss unavailable" statement and a canonical **Projected Win/Loss** / **Partial Table Result** value for the same table session. Two such statements on one surface constitute a competing operator-visible table result under clause F.4 and gate `no_competing_operator_visible_table_result_is_present`, even though the placeholder renders no numeric value.

This supersession:

- removes only the win/loss-unavailable placeholder text from `RundownReportCard`; it does not alter the Fills, Credits, or Drop rows, which remain sourced from the pre-existing PRD-038 rundown-report path;
- does not restore `rpc_compute_table_rundown` or any legacy win/loss derivation;
- leaves the canonical result as the sole table-result statement on the surface, rendered exclusively by `RundownSummaryPanel` from `TableInventoryAccountingProjection`;
- applies whenever both components are present on the surface, regardless of session state (`ACTIVE`, `RUNDOWN`, `CLOSED`) or calculation kind.

**Resolution (this slice):** The win/loss-unavailable placeholder is removed from `RundownReportCard` with no replacement disclosure. `RundownReportCard` is scoped to inventory-movement totals (Fills, Credits, Drop) and report-persistence actions (Save / Finalize); `RundownSummaryPanel` is the sole operator-visible table-result statement on the surface. Because no result-language disclosure is retained, this resolution triggers no section L amendment. Re-introducing any table-result, projected-result, or win/loss language into `RundownReportCard` would require an L amendment.

---

### F.5 Browser acceptance

At least one thin browser-level test proves the complete operator path:

```text
authenticated pit boss
→ opens /pit
→ selects a seeded table/session
→ opens Inventory / Rundown
→ sees the canonical TIA state and formatted value
→ sees no competing legacy win/loss-like result
```

Up to three seeded browser scenarios may be added if inexpensive, but browser tests are not required to prove every formula permutation.

The testing split is:

- database integration tests prove formula and scope semantics;
- component tests prove all rendering states;
- browser E2E proves one complete operator workflow.

---

### F.6 Preserved existing coverage

The following existing coverage remains required and green:

- mock-based derivation unit tests;
- mocked route-contract tests;
- static source-analysis tests;
- legacy suppression gates;
- type checking;
- lint;
- production build.

---

## G. Explicit exclusions

This slice does not include:

- changes to the canonical TIA formula;
- changes to `telemetry_derived_drop_estimate_cents`;
- new telemetry kinds;
- inclusion of `RATED_ADJUSTMENT`;
- gaming-day aggregation;
- final, posted, counted, settled, or reconciled drop;
- population of `final_table_win_loss_cents`;
- count-room or custody integration;
- new accounting states;
- a persisted TIA projection store;
- shift-dashboard propagation;
- mounting the canonical panel on multiple new surfaces;
- transactional-outbox changes;
- producer or consumer expansion;
- replacement of the current test framework;
- creation of a generic fixture platform;
- broad Playwright infrastructure redesign;
- application-wide test coverage targets;
- restoration of `rpc_compute_table_rundown` as an accounting authority;
- compatibility layers preserving competing table-result semantics.

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Treat the manual browser walkthrough as sufficient acceptance | It exercises the visible application | The canonical panel is not mounted, and manual inspection cannot prove database predicates, RLS, or repeatable state behavior |
| Replace mock-based tests with integration tests | Avoid overlapping test tiers | Unit and contract tests remain useful; integration tests supplement rather than replace them |
| Prove every accounting case through Playwright | One visible test layer appears simpler | Browser tests are slower and less precise for accounting boundary cases |
| Propagate TIA to the shift dashboard in the same slice | The canonical service already exists | Propagation before exemplar acceptance would widen the blast radius |
| Reopen formula decisions when tests expose defects | Real data may reveal implementation problems | Implementation defects may be corrected, but accepted semantics require the existing governance amendment path |
| Build a reusable database test-fixture framework first | Repeated setup may appear inefficient | The slice must reuse the existing integration harness and remain bounded to exemplar acceptance |

---

## I. Dependencies and assumptions

- PRD-090 implementation is present.
- `TableInventoryAccounting` service exists.
- `TableInventoryAccountingProjection` exists.
- The accounting projection endpoint exists.
- `RundownSummaryPanel` exists but is currently unmounted.
- Existing `.int.test.ts` patterns in `services/table-context` are reusable.
- Local Supabase/Postgres integration execution is available.
- Canonical test fixtures can be created without production data.
- Current static suppression gates remain active.
- Pit Terminal Inventory / Rundown is the sole mount target for this closure.
- No additional TIA consumer propagation begins until this FIB’s acceptance gates pass.

---

## J. Acceptance gates

```yaml
acceptance_gates:
  database_integration:
    - real_database_exercises_all_three_calculation_kinds
    - no_rows_and_zero_sum_telemetry_are_distinct
    - session_timestamp_boundaries_are_proven
    - cross_session_telemetry_is_excluded
    - cross_table_telemetry_is_excluded
    - rated_adjustment_is_excluded
    - zero_inventory_snapshots_are_valid
    - eligible_fill_and_credit_states_are_proven
    - table_par_does_not_affect_result
    - result_fields_are_mutually_exclusive

  route_integration:
    - real_pit_boss_request_returns_200
    - real_admin_request_returns_200
    - real_unauthorized_role_returns_403
    - real_cross_casino_request_returns_404
    - real_bigint_response_serializes_without_failure
    - integrity_failure_returns_200
    - unavailable_session_returns_not_found

  component_behavior:
    - projected_state_renders_canonical_label_and_value
    - partial_state_renders_missing_drop_disclosure
    - integrity_state_renders_no_financial_result
    - positive_negative_and_zero_values_render_correctly
    - forbidden_legacy_labels_do_not_render
    - component_does_not_rederive_accounting_semantics

  exemplar_wiring:
    - rundown_summary_panel_is_mounted_in_pit_inventory_surface
    - mounted_panel_consumes_table_inventory_accounting_projection
    - no_duplicate_accounting_value_is_rendered
    - no_competing_operator_visible_table_result_is_present
    - legacy_win_loss_unavailable_placeholder_removed_from_rundown_report_card
    - rundown_report_card_renders_no_table_result_language
    - exactly_one_operator_visible_table_result_statement_on_surface

  browser_acceptance:
    - seeded_pit_boss_flow_reaches_canonical_tia_render
    - browser_test_confirms_legacy_win_loss_absence
    - browser_test_confirms_absence_of_win_loss_unavailable_placeholder_when_canonical_value_renders

  quality:
    - existing_unit_tests_remain_green
    - existing_route_contract_tests_remain_green
    - existing_static_suppression_tests_remain_green
    - type_check_passes
    - lint_passes
    - build_passes
```

---

## K. Out-of-scope but likely next

1. Propagate `TableInventoryAccountingProjection` to the next approved consumer.
2. Retire or replace remaining secondary legacy table-result surfaces according to the existing propagation plan.

These are not part of this FIB.

---

## L. Expansion trigger rule

Amend this brief if implementation proposes:

- a new TIA consumer beyond the Pit Terminal exemplar;
- a new accounting formula;
- a new calculation state;
- changes to session-scope aggregation;
- changes to telemetry-kind eligibility;
- new custody or finality semantics;
- a persisted projection store;
- new operator-visible financial outcomes;
- replacement of the current testing architecture;
- broader application test infrastructure not required for this exemplar closure.

---

## M. Scope authority block

**Intake version:**  
v1

**Frozen for downstream design:**  
No — proposed for approval

**Downstream expansion allowed without amendment:**  
No

**Scope authority:**  
This FIB governs only the remaining PRD-090 exemplar acceptance gaps.

It does not supersede or amend:

- ADR-059;
- ADR-060;
- ADR-061;
- PRD-090;
- the Table Inventory Accounting ubiquitous language;
- the existing legacy suppression decisions.

**Completion definition:**

> The TIA exemplar is accepted only when the canonical accounting result is proven against the real database, protected through the real route boundary, behaviorally rendered by the canonical component, mounted in the Pit Terminal Inventory / Rundown flow, and exercised through one operator-level browser path. Unit tests, mocked route tests, static suppression gates, or a manual walkthrough alone do not satisfy exemplar acceptance.

**Human approval / sign-off:**  
Pending

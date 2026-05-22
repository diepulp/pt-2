---
prd: PRD-073
prd_title: "Financial Telemetry — Wave 1 Phase 1.1c — Shift-Intelligence Internal Authority Routing"
service: ShiftIntelligenceService
mvp_phase: 1.1c (WS7B close)
type: service-layer only — routing helper + mapper path unification + stale test remediation
generated: 2026-04-24

fib_h: docs/issues/gaps/financial-data-distribution-standard/intake/FIB-FIN-SHIFT-001/FIB-H-FIN-SHIFT-001-shift-intelligence-authority-routing.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/intake/FIB-FIN-SHIFT-001/FIB-S-FIN-SHIFT-001-shift-intelligence-authority-routing.json

parent_prd: PRD-070
parent_exec_spec: docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md
supersedes_in_parent: [WS7B]
ws7a_decision_record: "EXEC-070 § Planning Lock Resolution — routing rules frozen 2026-04-24"
companion_exec: EXEC-072 (Phase 1.1b — visit surface FinancialValue label, complete)

# PHASE BOUNDARY — READ BEFORE EXECUTING ANY WORKSTREAM
phase_boundary:
  this_spec_is: Phase 1.1 — internal authority routing, mapper path unification, stale test correction
  this_spec_is_not: Phase 1.2 — public DTO field wrapping (AnomalyAlertDTO / ShiftAlertDTO numeric fields)
  one_line_invariant: >
    Public response shape is byte-identical before and after. No FinancialValue
    appears on any public DTO field. The routing helper exists to prepare for
    Phase 1.2 and to close WS9 items 4 and 12 — not to emit new observable data.
  phase_1_2_owns:
    - Wrapping AnomalyAlertDTO.observedValue, baselineMedian, baselineMad, thresholdValue in FinancialValue
    - Wrapping ShiftAlertDTO.observedValue, baselineMedian, baselineMad in FinancialValue
    - Adding outbound Zod schemas for shift-intelligence response types (requires WS7A waiver reopen)
    - Route handler changes (app/api/v1/shift-intelligence/)
    - UI component changes (components/shift-intelligence/, components/shift-dashboard/, components/admin-alerts/)

# Frozen Routing Rules — WS7A Source of Truth. DO NOT re-derive.
# Source: EXEC-070 § WS7 — Shift-Intelligence Expert Outcome
frozen_routing_rules:
  drop_total:    { type: estimated, source: "table_session.drop" }
  win_loss_cents: { type: estimated, source: "table_session.inventory_win" }
  cash_obs_total: { type: estimated, source: "pit_cash_observation.extrapolated" }
  hold_percent:  { type: null, source: null, note: "bare ratio — never wrapped, Phase 1.1 and 1.2 hard invariant" }

# Decisions
decisions:
  DEC-1:
    question_id: Q-1
    question: "Should resolveShiftMetricAuthority live in mappers.ts or be extracted to authority-routing.ts?"
    decision: >
      Keep in services/shift-intelligence/mappers.ts.
      getAlerts in alerts.ts already imports mapShiftAlertRow from mappers.ts.
      The call chain is: alerts.ts → mapShiftAlertRow (mappers.ts) → resolveShiftMetricAuthority (mappers.ts).
      No circular import. No extraction needed.
    rationale: >
      Extraction to authority-routing.ts would add a file without reducing coupling.
      The only callers are mapAnomalyAlertRow and mapShiftAlertRow, both in mappers.ts.
      Extract only if a future workstream needs a direct alerts.ts → resolveShiftMetricAuthority
      import that bypasses mapShiftAlertRow.
    applies_to: [WS1]

  DEC-2:
    question_id: Q-2
    question: "Should the routing result be discarded or embedded on a non-public DTO field for Phase 1.2 readiness?"
    decision: >
      Discard in Phase 1.1. The return value of resolveShiftMetricAuthority inside each mapper
      is an intentional dead-read. Do not assign it to a local variable intended for DTO use.
      Do not pre-allocate a non-public slot for it.
      Phase 1.2 calls resolveShiftMetricAuthority at the FinancialValue construction site,
      where the result is first consumed.
    rationale: >
      Embedding routing metadata on the DTO before Phase 1.2 formally wraps the fields
      is scope creep. It introduces observable internal state that Phase 1.2 would have to
      clean up. A dead-read call achieves testability and path-unification without pre-empting
      the Phase 1.2 wrapping decision.
    applies_to: [WS1]

  DEC-3:
    question_id: Q-3
    question: "Does anomaly-evaluation.test.ts need amendment as part of WS7B?"
    decision: >
      No. anomaly-evaluation.test.ts defines and tests inline local functions (evaluateHoldAnomaly,
      evaluateDropWinAnomaly, etc.) that do not import from mappers.ts or alerts.ts. Mapper refactoring
      in WS1 and WS2 does not touch those functions.
      If WS2 implementation reveals a structural conflict (e.g., a shared import is reorganized),
      scope the minimum fix then.
    rationale: >
      The test file is self-contained. Its functions test anomaly evaluation logic independently.
      Amending it pre-emptively risks introducing a regression that WS9 would catch.
    applies_to: [WS2]

  DEC-4:
    question_id: Q-4
    question: "Where should Phase 1.1 verify the hold_percent null-routing branch?"
    decision: >
      Verify hold_percent null-routing in services/shift-intelligence/__tests__/mappers.test.ts,
      not in anomaly-alerts-route-boundary.test.ts.
      The route-boundary test mocks getAnomalyAlerts and therefore cannot exercise
      resolveShiftMetricAuthority. Phase 1.1 proof for the null-routing branch belongs
      at the mapper/service path that actually invokes the helper.
    rationale: >
      The route-boundary layer only proves HTTP behavior for the transitional response shape.
      It is the wrong layer for internal routing verification because the service output is mocked.
      Keeping null-routing proof in mapper/service tests closes the correctness gap without
      introducing Phase 1.2 DTO concerns or overstating route-boundary coverage.
    applies_to: [WS3]

  DEC-5:
    question_id: implementation-detail
    question: "How does getAlerts thread tableLabel and staff_name into mapShiftAlertRow?"
    decision: >
      getAlerts normalizes each Supabase query row before calling mapShiftAlertRow.
      Normalization steps:
        (1) Define a local type AlertQueryRow (module-level or inline) that types the join shape:
            Database['public']['Tables']['shift_alert']['Row'] +
            alert_acknowledgment: Array<AckRow & { staff: { first_name, last_name } | null }> | null +
            gaming_table: { label: string } | null.
        (2) Assert row as AlertQueryRow (typed assertion — eliminates as any).
        (3) Resolve staff_name from the nested staff join: same computation as the current inline block.
        (4) Construct normalizedRow with staff_name pre-populated on each ack entry.
        (5) Call mapShiftAlertRow(normalizedRow) and set tableLabel via spread: { ...dto, tableLabel }.
            Alternatively, add an optional tableLabel?: string parameter to mapShiftAlertRow (default '')
            and pass it directly — either approach is acceptable.
      The as any escape (currently line 124 in alerts.ts with its eslint-disable comment) MUST be removed.
      A typed assertion (row as AlertQueryRow, not row as unknown as AlertQueryRow) is preferred;
      if TypeScript requires the two-step assertion due to Supabase's inferred type, row as unknown as
      AlertQueryRow is acceptable for source files (the prohibition on as unknown as applies to test files only,
      per EXEC-070 Blast Radius Item 7).
    applies_to: [WS2]

  DEC-6:
    question_id: Q-5
    question: "What is the intended Phase 1.1 behavior for invalid MetricType values?"
    decision: >
      Invalid MetricType values fail closed inside resolveShiftMetricAuthority.
      The helper throws an Error for an unhandled value. In Phase 1.1 this is an
      acceptable internal failure mode because MetricType is expected to be controlled
      by the existing DB/RPC contracts. No DomainError remapping or route code change
      is introduced by this slice, but affected call paths may surface an error response
      if an invalid MetricType reaches the mapper.
    rationale: >
      Phase 1.1 needs a compile-time and runtime guard against silent drift in the
      frozen routing table, but it must not expand into broader error-taxonomy or API
      contract work. A local fail-closed throw is the smallest executable rule that
      preserves the transitional contract and avoids Phase 1.2 scope collapse.
    applies_to: [WS1, WS3]

# Workstreams
workstreams:
  WS1:
    name: "Routing Helper + Mapper Unification"
    description: >
      Add resolveShiftMetricAuthority to services/shift-intelligence/mappers.ts.
      Update mapAnomalyAlertRow and mapShiftAlertRow to call it internally.
      The routing result is discarded in both callers (DEC-2) — Phase 1.1 call is
      for testability and path-unification only.
    executor: backend-service-builder
    executor_type: skill
    bounded_context: shift-intelligence
    depends_on: []
    gate: type-check
    estimated_complexity: small
    traces_to: [CAP-1, CAP-2]
    outputs: [services/shift-intelligence/mappers.ts]

    hard_prohibitions:
      - "DO NOT assign the resolveShiftMetricAuthority return value to a DTO field"
      - "DO NOT add FinancialValue to any field in AnomalyAlertDTO or ShiftAlertDTO"
      - "DO NOT redefine FinancialAuthority or MetricType — import from their canonical sources"
      - "DO NOT extract resolveShiftMetricAuthority to authority-routing.ts (DEC-1)"
      - "DO NOT add a default branch that silently handles unknown MetricType values"
      - "DO NOT add outbound Zod schemas to schemas.ts"
      - "DO NOT change dtos.ts"

    change_description: >
      1. Add import: import type { FinancialAuthority } from '@/types/financial';
      2. Add exported function resolveShiftMetricAuthority(metricType: MetricType):
         { type: FinancialAuthority; source: string } | null.
         Exhaustive switch over all four MetricType values per frozen_routing_rules above.
         Compile-time exhaustiveness check in the default branch (never narrowing or
         assertUnreachable helper — implementer's choice, but a future unhandled MetricType
         MUST produce a compile error).
         hold_percent returns null. No implicit fallthrough.
      3. In mapAnomalyAlertRow: add one line calling resolveShiftMetricAuthority using void prefix:
           void resolveShiftMetricAuthority(row.metric_type as MetricType); // phase-1.1 path unification
         The void prefix makes intent explicit (result intentionally discarded) and prevents
         linter-based removal. Place before the return — not inside the return object.
      4. In mapShiftAlertRow: same pattern.
           void resolveShiftMetricAuthority(row.metric_type as MetricType); // phase-1.1 path unification
      5. Optional: add tableLabel?: string parameter (default '') to mapShiftAlertRow if WS2
         implementer prefers that pattern over post-call spread. Either way, the existing
         tableLabel: '' default behaviour is preserved for callers that omit the parameter.

    acceptance_criteria:
      - "resolveShiftMetricAuthority is exported from mappers.ts"
      - "exhaustive switch covers drop_total, win_loss_cents, cash_obs_total, hold_percent"
      - "hold_percent returns null (RULE-2 hard invariant)"
      - "cash_obs_total returns { type: 'estimated', source: 'pit_cash_observation.extrapolated' } (RULE-7)"
      - "compile-time exhaustiveness check present: adding a fifth MetricType without updating the switch is a type error"
      - "FinancialAuthority imported from '@/types/financial' — not redefined (RULE-9 pattern)"
      - "mapAnomalyAlertRow and mapShiftAlertRow each call resolveShiftMetricAuthority (RULE-4 prerequisite)"
      - "no FinancialValue type on any AnomalyAlertDTO or ShiftAlertDTO field in dtos.ts (RULE-3)"
      - "no changes to schemas.ts, dtos.ts, http.ts, or any route/UI file (RULE-6)"
      - "npm run type-check exits 0"

    validation_commands:
      - "npm run type-check > /tmp/ws1-type.log 2>&1; echo 'exit:' $?; grep 'shift-intelligence' /tmp/ws1-type.log || echo 'no errors in shift-intelligence'"
      - "grep -n 'resolveShiftMetricAuthority' services/shift-intelligence/mappers.ts"
      - "grep -n 'FinancialAuthority' services/shift-intelligence/mappers.ts"

  WS2:
    name: "Alert Delegation Refactor"
    description: >
      Refactor getAlerts in services/shift-intelligence/alerts.ts to delegate ShiftAlertDTO
      construction to mapShiftAlertRow. Delete the inline DTO assembly block (lines 122–157
      in the current file). Eliminate the as any escape (line 124). Normalize the Supabase
      join row before calling mapShiftAlertRow per DEC-5.
    executor: backend-service-builder
    executor_type: skill
    bounded_context: shift-intelligence
    depends_on: [WS1]
    gate: type-check
    estimated_complexity: small
    traces_to: [CAP-2]
    outputs: [services/shift-intelligence/alerts.ts]

    hard_prohibitions:
      - "DO NOT use as any — the eslint-disable-next-line comment at line 123 must be removed"
      - "DO NOT construct ShiftAlertDTO fields inline in alerts.ts after this change"
      - "DO NOT change the Supabase query in getAlerts — the select string is unchanged"
      - "DO NOT change mapShiftAlertRow's existing DTO output fields"
      - "DO NOT add FinancialValue to any field"
      - "DO NOT change schemas.ts, dtos.ts, or any route/UI file"

    normalization_note: >
      mapShiftAlertRow expects alert_acknowledgment entries typed as
      AlertAckRow & { staff_name?: string | null } (a pre-computed string).
      The Supabase join returns staff: { first_name, last_name } (a nested object).
      The normalization step in getAlerts must resolve staff_name before calling mapShiftAlertRow.
      This is the same computation already present in the inline block:
        staff_name: ack.staff
          ? `${ack.staff.first_name ?? ''} ${ack.staff.last_name ?? ''}`.trim() || null
          : null
      Preserving this computation is load-bearing — omitting it silently sets acknowledgedByName
      to null for all acknowledged alerts.

    change_description: >
      1. Add mapShiftAlertRow to the import from './mappers'.
      2. Define a local AlertQueryRow type (module-level or inline) that types the join shape.
         This replaces the as any escape. Minimum fields required:
           - All fields from Database['public']['Tables']['shift_alert']['Row']
           - alert_acknowledgment: Array<AckFields & { staff: { first_name, last_name } | null }> | null
           - gaming_table: { label: string } | null
      3. Refactor the .map((row) => { ... }) callback in getAlerts:
           const r = row as AlertQueryRow;                        // typed, not as any
           const tableLabel = r.gaming_table?.label ?? '';
           const normalizedAcks = (r.alert_acknowledgment ?? []).map((ack) => ({
             ...ack,
             staff_name: ack.staff
               ? `${ack.staff.first_name ?? ''} ${ack.staff.last_name ?? ''}`.trim() || null
               : null,
           }));
           const dto = mapShiftAlertRow({ ...r, alert_acknowledgment: normalizedAcks });
           return { ...dto, tableLabel };
         (Exact implementation is at implementer's discretion — the above is the canonical pattern
          from DEC-5. Alternatively, use the optional tableLabel parameter added to mapShiftAlertRow in WS1.)
      4. Remove the eslint-disable-next-line comment for no-explicit-any.
      5. Verify anomaly-evaluation.test.ts still passes (DEC-3 confirms no structural conflict expected).

    acceptance_criteria:
      - "getAlerts calls mapShiftAlertRow from './mappers' (RULE-4)"
      - "inline DTO assembly block deleted — no ShiftAlertDTO fields constructed directly in alerts.ts"
      - "as any removed from getAlerts; eslint-disable comment for no-explicit-any removed"
      - "tableLabel populated from gaming_table.label join result (not hardcoded '')"
      - "acknowledgedByName correctly populated from staff.first_name + staff.last_name join (behavior preserved)"
      - "no FinancialValue on any field (RULE-3)"
      - "npm run type-check exits 0"
      - "npx jest --runInBand --runTestsByPath services/shift-intelligence/__tests__/anomaly-evaluation.test.ts exits 0 (no structural conflict)"

    validation_commands:
      - "npm run type-check > /tmp/ws2-type.log 2>&1; echo 'exit:' $?; grep 'shift-intelligence' /tmp/ws2-type.log || echo 'no errors'"
      - "grep -n 'as any' services/shift-intelligence/alerts.ts || echo 'CLEAN — no as any'"
      - "grep -n 'ShiftAlertDTO\\|tableLabel:\\|metricType:' services/shift-intelligence/alerts.ts | head -20"
      - "npx jest --runInBand --runTestsByPath services/shift-intelligence/__tests__/anomaly-evaluation.test.ts > /tmp/ws2-anom.log 2>&1; tail -5 /tmp/ws2-anom.log"

  WS3:
    name: "Test Suite Completion"
    description: >
      Three test file changes:
      (A) mappers.test.ts — add resolveShiftMetricAuthority routing assertion suite.
      (B) alerts-mappers.test.ts — add getAlerts → mapShiftAlertRow delegation assertion.
      (C) anomaly-alerts-route-boundary.test.ts — correct ALERTS_FIXTURE shape and assertions.
      All three changes are gated on WS1 and WS2 completing so the source under test exists.
    executor: backend-service-builder
    executor_type: skill
    bounded_context: shift-intelligence
    depends_on: [WS1, WS2]
    gate: test-pass
    estimated_complexity: small
    traces_to: [CAP-3, CAP-4]
    outputs:
      - services/shift-intelligence/__tests__/mappers.test.ts
      - services/shift-intelligence/__tests__/alerts-mappers.test.ts
      - services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts

    hard_prohibitions:
      - "DO NOT use as unknown as in any test assertion — Blast Radius Item 7 (EXEC-070)"
      - "DO NOT add FinancialValue to any fixture or assertion in this slice"
      - "DO NOT reference gamingDay (at response envelope level) or computedAt in anomaly-alerts-route-boundary.test.ts after correction"
      - "DO NOT remove existing passing tests — only add or correct"
      - "DO NOT add outbound Zod parsing to any test"

    change_description: >
      (A) mappers.test.ts: Add import of resolveShiftMetricAuthority from '../mappers'.
      Add describe('resolveShiftMetricAuthority') block with 5 test cases:
        - 4 valid MetricType cases (one per value in frozen_routing_rules)
        - 1 unknown/invalid case: ('unknown_type' as MetricType) → expect(fn).toThrow()
      hold_percent uses .toBeNull() (strict null). This is the required proof for the
      null-routing branch in Phase 1.1. cash_obs_total comment references static-threshold invariant.
      The throw test closes patch-delta §2 (invalid MetricType coverage) and §6 (fail-closed invariant).
      Do not require same-module spy assertions for internal helper calls. The enforcement
      surface in this slice is behavior-level proof of resolveShiftMetricAuthority itself
      plus source-level verification that the mapper call sites exist.

      (B) alerts-mappers.test.ts: Add describe('getAlerts delegation') block.
      Call getAlerts with mocked Supabase join rows and assert the returned DTO preserves:
        - tableLabel from gaming_table.label
        - acknowledgment.acknowledgedByName from staff.first_name + staff.last_name
      A spy on mapShiftAlertRow may be added as a secondary assertion, but is not sufficient alone.
      Do not remove existing describe blocks.

      (C) anomaly-alerts-route-boundary.test.ts: ALERTS_FIXTURE — remove gamingDay + computedAt,
      add baselineGamingDay + baselineCoverage.
      Update assertions: body.data.baselineGamingDay + body.data.baselineCoverage.
      Maintain focus on transitional HTTP response shape only. Zero body.data.gamingDay /
      body.data.computedAt references after correction.

    acceptance_criteria:
      - "mappers.test.ts has exactly 4 routing test cases: one per MetricType (RULE-1 coverage via CAP-4)"
      - "hold_percent test uses .toBeNull() — strict null assertion (RULE-2)"
      - "cash_obs_total test cites static-threshold invariant in comment (RULE-7)"
      - "mappers.test.ts has a 5th test case asserting unknown MetricType throws (patch-delta §2 + §6 — fail-closed invariant)"
      - "source inspection or grep verification confirms mapAnomalyAlertRow and mapShiftAlertRow each call resolveShiftMetricAuthority (patch-02 §3)"
      - "alerts-mappers.test.ts asserts getAlerts preserves tableLabel from gaming_table.label"
      - "alerts-mappers.test.ts asserts getAlerts preserves acknowledgment.acknowledgedByName from joined staff names"
      - "alerts-mappers.test.ts may additionally assert delegation to mapShiftAlertRow, but output preservation is mandatory"
      - "anomaly-alerts-route-boundary.test.ts: ALERTS_FIXTURE has baselineGamingDay + baselineCoverage (RULE-5)"
      - "anomaly-alerts-route-boundary.test.ts: assertions check body.data.baselineGamingDay + body.data.baselineCoverage"
      - "anomaly-alerts-route-boundary.test.ts: zero references to body.data.gamingDay or body.data.computedAt"
      - "no as unknown as in any modified test file (Blast Radius Item 7)"
      - "npm run test:slice:shift-intelligence -- --runInBand --testPathPatterns='anomaly-alerts-route-boundary.test.ts' exits 0"
      - "npm run test:slice:shift-intelligence -- --runInBand exits 0"

    validation_commands:
      - "npm run test:slice:shift-intelligence -- --runInBand > /tmp/si-all.log 2>&1; tail -15 /tmp/si-all.log"
      - "npm run test:slice:shift-intelligence -- --runInBand --testPathPatterns='anomaly-alerts-route-boundary.test.ts' > /tmp/si-boundary.log 2>&1; tail -10 /tmp/si-boundary.log"
      - "grep -n 'data\\.gamingDay\\|data\\.computedAt' services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts || echo 'CLEAN — no envelope-level gamingDay or computedAt'"
      - "grep -n 'as unknown as' services/shift-intelligence/__tests__/*.test.ts || echo 'CLEAN — no as unknown as in test files'"

execution_phases:
  - name: Phase 1 — Routing Helper
    parallel: [WS1]
  - name: Phase 2 — Alert Delegation
    parallel: [WS2]
  - name: Phase 3 — Test Suite
    parallel: [WS3]

gates:
  type-check:
    description: "TypeScript type check passes with no errors in services/shift-intelligence/"
    command: "npm run type-check > /tmp/exec073-type.log 2>&1; echo exit $?; grep 'shift-intelligence\\|error TS' /tmp/exec073-type.log | head -20 || echo 'CLEAN'"
    pass_criteria: "npm run type-check exits 0"
  test-suite-green:
    description: "All shift-intelligence tests pass"
    command: "npm run test:slice:shift-intelligence -- --runInBand > /tmp/exec073-tests.log 2>&1; tail -15 /tmp/exec073-tests.log"
    pass_criteria: "Exit 0; all test suites pass"
  boundary-test-green:
    description: "Anomaly-alerts route boundary test passes in isolation"
    command: "npm run test:slice:shift-intelligence -- --runInBand --testPathPatterns='anomaly-alerts-route-boundary.test.ts' > /tmp/exec073-boundary.log 2>&1; tail -10 /tmp/exec073-boundary.log"
    pass_criteria: "Exit 0; no gamingDay/computedAt at envelope level"
  grep-no-independent-authority-switch:
    description: "No independent MetricType → authority derivation outside resolveShiftMetricAuthority"
    command: "grep -rn 'table_session\\|pit_cash_observation\\|inventory_win' services/shift-intelligence/ --include='*.ts' | grep -v '__tests__' | grep -v 'resolveShiftMetricAuthority\\|frozen_routing' || echo 'CLEAN'"
    pass_criteria: "Empty output (no rogue source strings in service files outside the routing helper)"

dod:
  type_check: "npm run type-check"
  test_suite: "npm run test:slice:shift-intelligence -- --runInBand"
  boundary_test: "npm run test:slice:shift-intelligence -- --runInBand --testPathPatterns='anomaly-alerts-route-boundary.test.ts'"
  grep_no_as_any_in_alerts: "grep -n 'as any' services/shift-intelligence/alerts.ts || echo 'CLEAN'"
  grep_no_independent_switch: "grep -rn 'table_session\\|pit_cash_observation\\|inventory_win' services/shift-intelligence/ --include='*.ts' | grep -v '__tests__' | grep -v 'mappers.ts' | grep -v 'dtos.ts' || echo 'CLEAN'"
  grep_no_shadow_metric_type_eq: "grep -rn 'metric_type ===' services/shift-intelligence/ --include='*.ts' | grep -v '__tests__' | grep -v 'resolveShiftMetricAuthority' || echo 'CLEAN'"
  grep_no_shadow_type_classification: "grep -rn \"type === 'actual'\\|type === 'estimated'\" services/shift-intelligence/ --include='*.ts' | grep -v '__tests__' | grep -v 'resolveShiftMetricAuthority' || echo 'CLEAN'"
---

# EXEC-073 — Financial Telemetry — Wave 1 Phase 1.1c — Shift-Intelligence Internal Authority Routing

## Overview

This EXEC-SPEC closes WS7B under `EXEC-070`: the final Phase 1.1 obligation in `services/shift-intelligence/` before WS9 runs its verification matrix. All deliverables are confined to `services/shift-intelligence/` — no SQL migrations, no route changes, no UI changes, no cross-service file changes.

Three concrete defects exist in the current service layer:

**Defect 1 — Missing routing helper.** The four `MetricType`-to-authority routing rules were frozen in the WS7A Planning Lock (`EXEC-070 § Planning Lock Resolution`, 2026-04-24) but were never implemented. `resolveShiftMetricAuthority` does not exist. Phase 1.2 cannot call it at the `FinancialValue` construction site until it does.

**Defect 2 — Divergent assembly path.** `getAlerts` in `alerts.ts` constructs `ShiftAlertDTO` inline (lines 122–157) using `as any`. `mapShiftAlertRow` in `mappers.ts` handles the same mapping. When Phase 1.2 wraps the deferred public fields, two separate code paths would require updates. EXEC-070 explicitly identifies this as mandatory WS7B remediation regardless of deferral.

**Defect 3 — Stale route-boundary test.** `anomaly-alerts-route-boundary.test.ts` asserts `gamingDay` and `computedAt` keys on the response envelope that do not exist on the live `AnomalyAlertsResponseDTO`. The live shape is `{ alerts, baselineGamingDay, baselineCoverage: { withBaseline, withoutBaseline } }`. The current test is false-green against stale envelope assumptions and must be corrected before WS9 relies on it as evidence.

**Public contract:** No public DTO field changes. No `FinancialValue` on `AnomalyAlertDTO` or `ShiftAlertDTO` numeric fields. The public response emitted by every route handler is byte-identical before and after this slice.

---

## Workstream Summary

| WS | Name | Files | Phase | CAP |
|----|------|-------|-------|-----|
| WS1 | Routing Helper + Mapper Unification | `mappers.ts` | 1 | CAP-1, CAP-2 |
| WS2 | Alert Delegation Refactor | `alerts.ts` | 2 | CAP-2 |
| WS3 | Test Suite Completion | 3 test files | 3 | CAP-3, CAP-4 |

---

## Hard Prohibitions (all workstreams)

Violations are automatic expansion triggers — halt and escalate to lead-architect:

1. **No `FinancialValue` on public DTO fields.** `AnomalyAlertDTO.observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` and `ShiftAlertDTO.observedValue`, `baselineMedian`, `baselineMad` remain `number | null`. Phase 1.2.
2. **No outbound Zod.** `schemas.ts` remains request-only (WS7A waiver). Adding any outbound Zod for shift-intelligence response types requires a lead-architect EXEC-SPEC amendment.
3. **No route handler changes.** `app/api/v1/shift-intelligence/` is untouched. Phase 1.2.
4. **No UI changes.** `components/shift-intelligence/`, `components/shift-dashboard/`, `components/admin-alerts/` are untouched.
5. **No bridge DTO.** Shift-intelligence bare-number fields are pre-migration state; no bridge DTO under the Transitional Governance Caveat.
6. **No `as unknown as` in test files.** Per EXEC-070 Blast Radius Item 7.
7. **No independent authority switch.** No code outside `resolveShiftMetricAuthority` may switch on `MetricType` to produce authority-like output (`table_session.*`, `pit_cash_observation.*`, etc.).
8. **No `dtos.ts` changes.** Public DTO shapes are frozen.
9. **No `schemas.ts` changes.** Request-only; no additions.
10. **Serialization enforced.** WS2 must not begin before WS1 is complete.

---

## WS1 Detail: Routing Helper + Mapper Unification

### What to Build

**`resolveShiftMetricAuthority`** — a new exported function in `mappers.ts`:

```typescript
import type { FinancialAuthority } from '@/types/financial';

export function resolveShiftMetricAuthority(
  metricType: MetricType,
): { type: FinancialAuthority; source: string } | null {
  switch (metricType) {
    case 'drop_total':
      return { type: 'estimated', source: 'table_session.drop' };
    case 'win_loss_cents':
      return { type: 'estimated', source: 'table_session.inventory_win' };
    case 'cash_obs_total':
      return { type: 'estimated', source: 'pit_cash_observation.extrapolated' };
    case 'hold_percent':
      return null; // bare ratio — never wrapped
    default: {
      const _exhaustive: never = metricType;
      throw new Error(`Unhandled MetricType: ${String(_exhaustive)}`);
    }
  }
}
```

The `default: never` pattern is the exhaustiveness check. If a fifth `MetricType` value is added to `dtos.ts` without updating this switch, TypeScript will error at the `_exhaustive: never` assignment.

**Mapper updates:**

```typescript
export function mapAnomalyAlertRow(row: AlertRow): AnomalyAlertDTO {
  void resolveShiftMetricAuthority(row.metric_type as MetricType); // phase-1.1 path unification
  return { /* existing fields unchanged */ };
}

export function mapShiftAlertRow(
  row: ShiftAlertRow & { alert_acknowledgment?: ... },
): ShiftAlertDTO {
  void resolveShiftMetricAuthority(row.metric_type as MetricType); // phase-1.1 path unification
  const ack = row.alert_acknowledgment?.[0] ?? null;
  return { /* existing fields unchanged */ };
}
```

`void` prefix is required (patch-02 §1 intent). It makes the intentional discard explicit and prevents linter-based removal. A bare statement without `void` could be silently removed in a cleanup PR. A `_unused = ...` variable assignment is not acceptable (introduces a linting violation). Phase 1.2 re-invokes the function at the `FinancialValue` construction site where the result is consumed.

---

## WS2 Detail: Alert Delegation Refactor

### What to Build

The `getAlerts` refactor replaces the inline assembly with `mapShiftAlertRow` delegation. The key challenge is the shape mismatch between the Supabase join result and `mapShiftAlertRow`'s input type — normalization resolves it.

**Current shape coming out of Supabase:**
```typescript
// alert_acknowledgment entries have:
{ acknowledged_by, notes, is_false_positive, created_at, staff: { first_name, last_name } | null }
// gaming_table:
{ label: string } | null
```

**What `mapShiftAlertRow` + `mapAcknowledgmentRow` expect:**
```typescript
// alert_acknowledgment entries should have:
{ acknowledged_by, notes, is_false_positive, created_at, staff_name: string | null }
// tableLabel: set to '' by default (caller populates)
```

**Refactored `getAlerts` map callback (canonical pattern):**

```typescript
type AlertQueryRow = Database['public']['Tables']['shift_alert']['Row'] & {
  alert_acknowledgment: Array<
    Database['public']['Tables']['alert_acknowledgment']['Row'] & {
      staff: { first_name: string | null; last_name: string | null } | null;
    }
  > | null;
  gaming_table: { label: string } | null;
};

// ...inside the .map() callback:
const r = row as AlertQueryRow;
const tableLabel = r.gaming_table?.label ?? '';
const normalizedAcks = (r.alert_acknowledgment ?? []).map((ack) => ({
  ...ack,
  staff_name: ack.staff
    ? `${ack.staff.first_name ?? ''} ${ack.staff.last_name ?? ''}`.trim() || null
    : null,
}));
const dto = mapShiftAlertRow({ ...r, alert_acknowledgment: normalizedAcks });
return { ...dto, tableLabel };
```

The `as any` escape and its `eslint-disable` comment are removed. `AlertQueryRow` is a typed local assertion — not `as any`.

**Import change:** Add `mapShiftAlertRow` to the import from `'./mappers'`.

---

## WS3 Detail: Test Suite Completion

### A. `mappers.test.ts` — Routing Assertion Suite

```typescript
import { mapComputeResult, mapAnomalyAlertRow, resolveShiftMetricAuthority } from '../mappers';

describe('resolveShiftMetricAuthority', () => {
  it('drop_total → estimated / table_session.drop', () => {
    expect(resolveShiftMetricAuthority('drop_total')).toEqual({
      type: 'estimated',
      source: 'table_session.drop',
    });
  });

  it('win_loss_cents → estimated / table_session.inventory_win', () => {
    expect(resolveShiftMetricAuthority('win_loss_cents')).toEqual({
      type: 'estimated',
      source: 'table_session.inventory_win',
    });
  });

  it('cash_obs_total → estimated / pit_cash_observation.extrapolated (static-threshold metric)', () => {
    // cash_obs_total uses static threshold evaluation — anomaly detection is disabled for this metric.
    // Authority source confirms data comes from pit_cash_observation.extrapolated, not rpc_get_anomaly_alerts.
    expect(resolveShiftMetricAuthority('cash_obs_total')).toEqual({
      type: 'estimated',
      source: 'pit_cash_observation.extrapolated',
    });
  });

  it('hold_percent → null (bare ratio invariant — never wrapped in FinancialValue)', () => {
    expect(resolveShiftMetricAuthority('hold_percent')).toBeNull(); // strict null
  });

  it('unknown MetricType → throws (fail-closed — no silent fallback)', () => {
    // patch-delta §6: mapper must fail closed on unknown MetricType
    expect(() =>
      resolveShiftMetricAuthority('unknown_type' as MetricType),
    ).toThrow();
  });
});

});
```

> **Note (patch-02 §3):** `resolveShiftMetricAuthority` is defined and called within the same module as `mapAnomalyAlertRow` and `mapShiftAlertRow`. `jest.spyOn` on an internal same-module call intercepts the exported binding only — not the local binding used internally. The call-site enforcement is therefore via source inspection and the DoD grep gate (`grep -n 'resolveShiftMetricAuthority' services/shift-intelligence/mappers.ts`), not Jest spies. The `void` prefix on each call makes the intent visible and prevents linter removal.

### B. `alerts-mappers.test.ts` — Delegation Output Preservation

Add a new `describe` block verifying `getAlerts` preserves the join-derived fields through the delegation path. Output preservation is the mandatory assertion; a delegation spy is optional but not sufficient alone:

```typescript
import { getAlerts } from '../alerts';
import * as mappers from '../mappers';

describe('getAlerts → mapShiftAlertRow delegation', () => {
  it('preserves tableLabel from gaming_table.label join', async () => {
    const mockRow = {
      /* minimal shift_alert.Row fields */ id: 'alert-1', table_id: 'tbl-1',
      metric_type: 'drop_total', gaming_day: '2026-04-24', status: 'open',
      severity: 'low', observed_value: 100, baseline_median: 80,
      baseline_mad: 10, deviation_score: 2.0, direction: 'up',
      message: 'test', created_at: '2026-04-24T00:00:00Z',
      updated_at: '2026-04-24T00:00:00Z',
      // join fields:
      gaming_table: { label: 'BJ-01' },
      alert_acknowledgment: null,
    };
    const mockSupabase = { /* chain returning [mockRow] */ };

    const result = await getAlerts(mockSupabase as any, { gaming_day: '2026-04-24' });

    expect(result[0].tableLabel).toBe('BJ-01');
  });

  it('preserves acknowledgedByName from staff join', async () => {
    // row with acknowledgment + staff join
    const mockRow = { /* ...fields... */
      alert_acknowledgment: [{
        id: 'ack-1', alert_id: 'alert-1', acknowledged_by: 'staff-uuid',
        casino_id: 'casino-1', created_at: '2026-04-24T00:00:00Z',
        is_false_positive: false, notes: null,
        staff: { first_name: 'Jane', last_name: 'Smith' },
      }],
      gaming_table: { label: 'BJ-02' },
    };

    const result = await getAlerts(/* ... */);

    expect(result[0].acknowledgment?.acknowledgedByName).toBe('Jane Smith');
  });
});
```

Exact mock depth is at implementer's discretion. A spy on `mapShiftAlertRow` may be added as a secondary assertion, but output field preservation is the mandatory proof.

### C. `anomaly-alerts-route-boundary.test.ts` — Fixture Correction

Correct `ALERTS_FIXTURE` to match the live `AnomalyAlertsResponseDTO` shape. Replace the stale `gamingDay`/`computedAt` envelope fields with `baselineGamingDay` and `baselineCoverage`. Keep one alert entry — the route-boundary test proves HTTP response shape only, not internal routing (DEC-4):

```typescript
const ALERTS_FIXTURE = {
  alerts: [
    { /* existing alert — keep all fields, just ensure no gamingDay/computedAt at envelope level */ },
  ],
  baselineGamingDay: '2026-03-22',
  baselineCoverage: { withBaseline: 5, withoutBaseline: 2 },
};
```

Update assertions to reference `body.data.baselineGamingDay` and `body.data.baselineCoverage`. Zero `body.data.gamingDay` or `body.data.computedAt` references after correction.

---

## Definition of Done (DoD)

### Implementation

- [ ] `resolveShiftMetricAuthority(metricType: MetricType)` exported from `mappers.ts` with exhaustive switch + compile-time check
- [ ] `mapAnomalyAlertRow` calls `resolveShiftMetricAuthority` internally (result not assigned to DTO field)
- [ ] `mapShiftAlertRow` calls `resolveShiftMetricAuthority` internally (result not assigned to DTO field)
- [ ] `getAlerts` calls `mapShiftAlertRow`; inline DTO assembly block deleted; `as any` removed
- [ ] `AnomalyAlertDTO` and `ShiftAlertDTO` numeric public fields remain `number | null` in `dtos.ts`

### Testing

- [ ] `mappers.test.ts` has 5 routing assertions: 4 per MetricType + 1 throw for unknown (hold_percent uses `.toBeNull()`)
- [ ] `grep -n 'resolveShiftMetricAuthority' services/shift-intelligence/mappers.ts` shows calls in both `mapAnomalyAlertRow` and `mapShiftAlertRow`
- [ ] `alerts-mappers.test.ts` has delegation assertion verifying `getAlerts` preserves `tableLabel` and `acknowledgedByName`
- [ ] `anomaly-alerts-route-boundary.test.ts` asserts `baselineGamingDay` + `baselineCoverage`
- [ ] Zero `body.data.gamingDay` or `body.data.computedAt` assertions in boundary test
- [ ] No `as unknown as` in any test file modified by this slice

### CI Gates

- [ ] `npm run type-check` → exit 0
- [ ] `npm run test:slice:shift-intelligence -- --runInBand` → exit 0
- [ ] `npx jest --runInBand --runTestsByPath services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` → exit 0

### DoD Grep Gates

- [ ] `grep -n 'as any' services/shift-intelligence/alerts.ts` → empty output
- [ ] `grep -rn 'table_session\|pit_cash_observation\|inventory_win' services/shift-intelligence/ --include='*.ts' | grep -v '__tests__' | grep -v 'resolveShiftMetricAuthority'` → empty output
- [ ] `grep -rn 'metric_type ===' services/shift-intelligence/ --include='*.ts' | grep -v '__tests__' | grep -v 'resolveShiftMetricAuthority'` → empty output (patch-delta §4)
- [ ] `grep -rn "type === 'actual'\|type === 'estimated'" services/shift-intelligence/ --include='*.ts' | grep -v '__tests__' | grep -v 'resolveShiftMetricAuthority'` → empty output (patch-delta §4)

### Documentation

- [ ] `ROLLOUT-PROGRESS.md` Phase 1.1 table updated: WS7B status changed to `🟩 Complete`
- [ ] `PRD-070` amended to reference `PRD-073` as WS7B child spec owner (per PRD-070 amendment record)
- [ ] WS9 items 4 and 12 confirmed unblocked (commands exit 0)

---

## WS9 Unblock Confirmation

After this EXEC-SPEC completes, WS9 under `EXEC-070` may proceed:

| WS9 Item | Command | Precondition |
|----------|---------|--------------|
| Item 4 | `npm run test:slice:shift-intelligence -- --runInBand` | WS1 + WS2 + WS3 complete |
| Item 12 | `npx jest --runInBand --runTestsByPath services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` | WS3.C complete |

WS9 remains under `EXEC-070`. This slice is its sole remaining precondition (companion Phase 1.1b — `PRD-072` / `EXEC-072` — complete as of commit `38d25cc1`).

---

## Phase 1.2 Handoff

The following deferrals from this slice must be captured in a separate FIB/PRD chain before Phase 1.2 begins:

- **`AnomalyAlertDTO` public field wrapping:** `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` → `FinancialValue`
- **`ShiftAlertDTO` public field wrapping:** `observedValue`, `baselineMedian`, `baselineMad` → `FinancialValue`
- **Outbound Zod for shift-intelligence response types** — requires lead-architect EXEC-SPEC amendment to reopen the WS7A waiver
- **Route + UI + component-test coordination** for the above field changes

Phase 1.2 calls `resolveShiftMetricAuthority` at the `FinancialValue` construction site inside each mapper. The routing rules are already implemented — no re-derivation needed.

**Phase 1.2 EXEC-SPEC obligation (carried forward from patch-delta §3):** Once `AnomalyAlertDTO` and `ShiftAlertDTO` numeric fields are wrapped in `FinancialValue`, add envelope drift logging at the parse site:

```typescript
const parsed = financialValueSchema.parse(input);
const unknownKeys = Object.keys(input).filter(k => !(k in parsed));
if (unknownKeys.length > 0) {
  logger.warn('Envelope unknown keys detected', { unknownKeys });
}
```

Constraints: DO NOT reject; DO NOT use `.strict()` — visibility without disruption. Cannot be applied in Phase 1.1 because `FinancialValue` envelopes do not yet exist on public DTO fields.

**Phase 1.2 EXEC-SPEC obligation (carried forward from patch-delta §2):** The `FinancialValue` construction site must restate the patch-delta §2 envelope role restriction. The routing result is a labeling act — not a behavioral trigger, not a propagation hook.

---

## Related Documents

- `docs/10-prd/PRD-073-financial-telemetry-wave1-phase1.1c-shift-intelligence-authority-routing-v0.md`
- `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md` — WS7A decision record and WS9 verification matrix
- `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-FIN-SHIFT-001/patch-delta.md` — scope containment patch
- `docs/issues/gaps/financial-data-distribution-standard/actions/BLAST-RADIUS-ASSESSMENT.md` — Items 3 and 7 directly relevant
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md` — Phase 1.1 status
- `types/financial.ts` — `FinancialAuthority` return type of `resolveShiftMetricAuthority`

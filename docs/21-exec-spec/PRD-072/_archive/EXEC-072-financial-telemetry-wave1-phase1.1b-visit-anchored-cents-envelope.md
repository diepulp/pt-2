---
# EXECUTION-SPEC Frontmatter
# REGENERATED 2026-04-24 — scope-reset from cents-canonicalization to label-only.
# See postmortem and supersession note below before reading workstreams.

prd: PRD-072
prd_title: "Financial Telemetry — Wave 1 Phase 1.1b — Visit Surface Envelope Label"
service: visit-service / rating-slip-service (cross-context bounded slice)
mvp_phase: 1.1b
type: label-only envelope addition (NOT shape conversion, NOT canonicalization)
generated: 2026-04-24
regenerated: 2026-04-24
regeneration_reason: >
  Prior version of this EXEC-SPEC encoded Phase 1.2 canonicalization work
  (removal of /100 conversions, integer-cents normalization, formatCents migration)
  inside a Phase 1.1 labeling slice. This caused the PRD-070 pipeline halt.
  See postmortem: docs/issues/gaps/financial-data-distribution-standard/failures/prd-070-pipeline-interruption-postmortem.md.
  This document is a clean rewrite scoped strictly to Phase 1.1 labeling.

# Intake Authority Chain — updated to corrected FIB artifacts
fib_h: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/FIB-H-FiNANCIAL-TELEMETRY-PHASE-1-1-SLICE.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-1-SLICE.json
superseded_fib_s: docs/issues/gaps/financial-data-distribution-standard/intake/FIB-S-FIN-CENTS-001-visit-anchored-cents-envelope.json

# Parent relationship
parent_prd: PRD-070
parent_exec_spec: docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md
supersedes_in_parent: [WS5, WS5_ROUTE, WS5_UI, WS6]

# PHASE BOUNDARY — READ BEFORE EXECUTING ANY WORKSTREAM
phase_boundary:
  this_spec_is: Phase 1.1 — semantic labeling only
  this_spec_is_not: Phase 1.2 — data canonicalization
  one_line_invariant: >
    If a change makes the system more correct, it does not belong here.
    If a change makes the system more interpretable, it does.
  phase_1_2_owns:
    - Removal of /100 conversion from services/visit/crud.ts
    - Removal of /100 conversion from services/rating-slip/mappers.ts
    - Changing FinancialValue.value from dollar float to integer cents
    - Migrating UI render calls from formatDollars to formatCents
    - Applying financialValueSchema z.number().int() at the DTO boundary

# CRITICAL SEMANTIC WARNING — repeated here, in every workstream, and in every AC
dollar_float_warning: >
  FinancialValue.value in this Phase 1.1 implementation carries a DOLLAR FLOAT,
  not integer cents. The /100 conversion runs before the wrapping — value is the
  result of that division (e.g., 12.50, not 1250). This is intentional.
  financialValueSchema declares z.number().int() — that constraint is aspirational
  for Phase 1.1 and is NOT enforced at runtime here. Phase 1.2 will remove /100
  and make the integer constraint applicable.
  DO NOT add outbound Zod validation using financialValueSchema in this slice.
  DO NOT "fix" the dollar float to canonical cents in this slice.

# Workstream naming: WS1–WS4 local namespace per child EXEC-SPEC convention.
# Parent traceability via supersedes_in_parent above.

# Decisions
decisions:
  DEC-1:
    question_id: Q-1
    question: "Outbound DTO Zod using financialValueSchema at the DTO boundary?"
    decision: >
      DECLINE — and additionally prohibited by this scope reset.
      financialValueSchema declares value: z.number().int(). FinancialValue.value
      in Phase 1.1 carries a dollar float (post-/100). Applying financialValueSchema
      at runtime would throw on every valid Phase 1.1 envelope.
      Wire-format Zod (recentSessionsRpcResponseSchema) is the only runtime validator.
      Static TypeScript enforces DTO shape at compile time.
    rationale: >
      The Zod integer constraint and the Phase 1.1 dollar-float value are mutually
      exclusive. The solution is not to "fix" the dollar float now — that is Phase 1.2.
      The solution is to skip outbound Zod until the value is canonical.
    applies_to: [WS1, WS2]

  DEC-2:
    question_id: Q-2
    question: "completeness.status when source value is null vs zero vs non-null?"
    decision: >
      null / undefined → status='unknown', value=0.
      Zero → status='complete', value=0 (after /100 = 0.0).
      Non-null non-zero → status='complete', value=<result of /100>.
      completeness.coverage omitted (not computable from RPC aggregates).
    rationale: "Null means the aggregate was not found. Zero is a truthful complete statement."
    applies_to: [WS1, WS2]

  DEC-3:
    question_id: Q-3
    question: "Source string convention?"
    decision: >
      Dotted table.column path:
        'visit_financial_summary.total_in'
        'visit_financial_summary.total_out'
        'visit_financial_summary.net_amount'
    applies_to: [WS1, WS2]

  DEC-4:
    question_id: Q-4
    question: "Sequential or parallel execution of WS1 and WS2?"
    decision: >
      Sequential (WS1 then WS2). Atomic commit to services/visit/dtos.ts strongly
      preferred — avoids a window where one DTO is FinancialValue and the other is number.
      If atomic is not feasible, type-check-post-ws1 gate must pass before WS2 starts.
    applies_to: [WS1, WS2]

  DEC-5:
    question_id: Q-5
    question: "Route-boundary test scope?"
    decision: >
      Minimum smoke test only: one success case per route asserting envelope shape
      (type present, source non-empty, completeness.status present, value is number).
      NOT a 4-case suite. The contract is stabilizing — value unit changes in Phase 1.2.
      Full test matrix expansion belongs in Phase 1.2 when units are canonical.
    rationale: >
      Prior version mandated 4 cases per route per PRD FR-11/FR-12. That test burden
      is premature when the value unit (dollar float) will change in Phase 1.2.
      Tests born here will need partial rewrite in Phase 1.2 regardless.
    applies_to: [WS3]

# Workstreams
workstreams:
  WS1:
    name: "Visit Service — DTO Type Change + Inline Wrap"
    description: >
      Two changes only:
      (1) services/visit/dtos.ts — change total_buy_in, total_cash_out, net from
      number to FinancialValue in RecentSessionDTO.
      (2) services/visit/crud.ts — inside the existing centsToDollars closure
      (lines ~515–524), return a FinancialValue object instead of a bare number.
      The /100 division stays. The closure stays. No new file. No new function.
      Update visit-continuation.test.ts assertions to match FinancialValue shape.
    executor: backend-service-builder
    executor_type: skill
    bounded_context: visit-service
    depends_on: []
    supersedes_in_parent: WS5
    gate: type-check
    gate_detail: type-check-post-ws1
    estimated_complexity: low

    hard_prohibitions:
      - "DO NOT delete or restructure the centsToDollars closure in crud.ts"
      - "DO NOT remove the /100 division — it stays inside value: s.total_buy_in / 100"
      - "DO NOT create a new toRecentSessionDTO function in services/visit/mappers.ts"
      - "DO NOT apply financialValueSchema.parse() anywhere in this workstream"
      - "DO NOT use formatCents anywhere in this workstream"
      - "DO NOT add a wrapCentsField helper — inline construction only, as written below"

    dollar_float_warning: >
      FinancialValue.value in this workstream will be a DOLLAR FLOAT (e.g. 12.50).
      This is correct for Phase 1.1. Do not treat it as a bug. Do not normalize it.

    outputs:
      - path: services/visit/dtos.ts
        change: "total_buy_in, total_cash_out, net: number → FinancialValue in RecentSessionDTO"
      - path: services/visit/crud.ts
        change: >
          Inside centsToDollars closure only. Replace:
            total_buy_in: s.total_buy_in / 100,
            total_cash_out: s.total_cash_out / 100,
            net: s.net / 100,
          With:
            total_buy_in: { value: s.total_buy_in / 100, type: 'actual', source: 'visit_financial_summary.total_in', completeness: { status: s.total_buy_in != null ? 'complete' : 'unknown' } },
            total_cash_out: { value: s.total_cash_out / 100, type: 'actual', source: 'visit_financial_summary.total_out', completeness: { status: s.total_cash_out != null ? 'complete' : 'unknown' } },
            net: { value: s.net / 100, type: 'actual', source: 'visit_financial_summary.net_amount', completeness: { status: s.net != null ? 'complete' : 'unknown' } },
          That is the entire change. Nothing else moves.
      - path: services/visit/__tests__/visit-continuation.test.ts
        change: >
          Update assertions from dollar scalar (e.g. toBe(-0.5)) to FinancialValue
          shape (toMatchObject({ value: -0.5, type: 'actual', source: 'visit_financial_summary.net_amount', completeness: { status: 'complete' } })).
          NOTE: value is still -0.5 (dollar float), not -50 (cents). Do not change the number.

    acceptance_criteria:
      - "RecentSessionDTO.total_buy_in, total_cash_out, net are typed as FinancialValue in dtos.ts"
      - "centsToDollars closure in crud.ts still exists and still contains /100 divisions"
      - "value field in each FinancialValue is the /100 result (dollar float) — not raw cents"
      - "completeness.status is present on every assertion — never omitted (RULE-2)"
      - "source strings match DEC-3 exactly"
      - "No new files created in services/visit/"
      - "grep -n 'toRecentSessionDTO\\|wrapCentsField' services/visit/ returns zero matches"
      - "npm run type-check exits 0"

    validation_commands:
      - "npm run type-check"
      - "grep -n 'toRecentSessionDTO\\|wrapCentsField\\|formatCents' services/visit/ || echo 'CLEAN'"
      - "npm run test:ci -- --testPathPattern='services/visit' > /tmp/ws1-test.log 2>&1 && grep -E 'PASS|FAIL' /tmp/ws1-test.log"

  WS2:
    name: "Rating-Slip Service — Live View Inline Wrap"
    description: >
      One change only: services/rating-slip/mappers.ts — in toVisitLiveViewDTO,
      replace the three bare /100 assignments (lines ~340–342) with inline
      FinancialValue construction. The /100 stays inside the value field.
      Also update VisitLiveViewDTO type fields in services/visit/dtos.ts.
      dollarsToCents import at line 14 is RETAINED (used at line 525, out of scope).
      No new helper function. No new file.
    executor: backend-service-builder
    executor_type: skill
    bounded_context: rating-slip-service
    depends_on: [WS1]
    supersedes_in_parent: WS6
    gate: type-check
    gate_detail: type-check-post-ws2
    estimated_complexity: low

    hard_prohibitions:
      - "DO NOT remove the /100 division — it stays inside value: data.session_total_buy_in / 100"
      - "DO NOT create a wrapLiveViewCentsField helper — inline construction only"
      - "DO NOT move VisitLiveViewDTO to services/rating-slip/ — it stays in services/visit/dtos.ts"
      - "DO NOT remove the dollarsToCents import — it is used at line 525 for PitCashObservationDTO"
      - "DO NOT apply financialValueSchema.parse() anywhere in this workstream"
      - "DO NOT use formatCents anywhere in this workstream"

    dollar_float_warning: >
      FinancialValue.value in this workstream will be a DOLLAR FLOAT (e.g. 75.00).
      This is correct for Phase 1.1. The live-view path uses narrowRpcJson (a type cast),
      so null CAN reach the mapper — DEC-2 null guard applies here and is load-bearing.

    outputs:
      - path: services/visit/dtos.ts
        change: >
          session_total_buy_in, session_total_cash_out, session_net: number → FinancialValue
          in VisitLiveViewDTO. This is the second and final change to dtos.ts in this slice.
      - path: services/rating-slip/mappers.ts
        change: >
          In toVisitLiveViewDTO, replace:
            session_total_buy_in: data.session_total_buy_in / 100,
            session_total_cash_out: data.session_total_cash_out / 100,
            session_net: data.session_net / 100,
          With:
            session_total_buy_in: { value: data.session_total_buy_in != null ? data.session_total_buy_in / 100 : 0, type: 'actual', source: 'visit_financial_summary.total_in', completeness: { status: data.session_total_buy_in != null ? 'complete' : 'unknown' } },
            session_total_cash_out: { value: data.session_total_cash_out != null ? data.session_total_cash_out / 100 : 0, type: 'actual', source: 'visit_financial_summary.total_out', completeness: { status: data.session_total_cash_out != null ? 'complete' : 'unknown' } },
            session_net: { value: data.session_net != null ? data.session_net / 100 : 0, type: 'actual', source: 'visit_financial_summary.net_amount', completeness: { status: data.session_net != null ? 'complete' : 'unknown' } },
          That is the entire change. VisitLiveViewRpcResponse local type is UNCHANGED.

    acceptance_criteria:
      - "VisitLiveViewDTO.session_total_buy_in, session_total_cash_out, session_net are typed as FinancialValue in dtos.ts"
      - "The /100 divisions remain in services/rating-slip/mappers.ts — inside value: fields (RULE-4 in this spec means preserve /100)"
      - "value field in each FinancialValue is the /100 result (dollar float)"
      - "null input → { value: 0, completeness: { status: 'unknown' } } (DEC-2, load-bearing)"
      - "completeness.status is present on every output — never omitted (RULE-2)"
      - "dollarsToCents import retained at line 14"
      - "VisitLiveViewRpcResponse local type unchanged"
      - "No new files created in services/rating-slip/"
      - "grep -n 'wrapLiveViewCentsField\\|formatCents' services/rating-slip/ returns zero matches"
      - "npm run type-check exits 0"

    validation_commands:
      - "npm run type-check"
      - "grep -n 'wrapLiveViewCentsField\\|formatCents' services/rating-slip/ || echo 'CLEAN'"
      - "grep -n 'dollarsToCents' services/rating-slip/mappers.ts"
      - "npm run test:ci -- --testPathPattern='services/rating-slip' > /tmp/ws2-test.log 2>&1 && grep -E 'PASS|FAIL' /tmp/ws2-test.log"

  WS3:
    name: "Route Verification + Minimum Test Birth"
    description: >
      Verify the two route handlers contain no dollar/cents math (no changes expected).
      Create the two missing __tests__ directories and minimum route.test.ts files.
      Scope: one success case per route asserting FinancialValue envelope shape.
      NOT a 4-case suite. NOT unauthorized/invalid-params/404 cases.
      Those belong in Phase 1.2 after the value unit is canonical.
    executor: api-builder
    executor_type: skill
    bounded_context: api-layer
    depends_on: [WS2]
    supersedes_in_parent: WS5_ROUTE
    gate: test-pass
    gate_detail: route-boundary-tests-born
    estimated_complexity: low

    hard_prohibitions:
      - "DO NOT write 4-case test suites — one success case per route only"
      - "DO NOT assert value === <integer_cents> — value is a dollar float in Phase 1.1"
      - "DO NOT add unauthorized, invalid-params, or 404 cases — Phase 1.2 scope"

    dollar_float_warning: >
      Route test assertions on value must expect a NUMBER (dollar float), not an integer.
      Do not write expect(sessions[0].total_buy_in.value).toBe(50000) — that is cents.
      Write expect(typeof sessions[0].total_buy_in.value).toBe('number') or assert
      a specific dollar float matching your mock data (e.g. toBe(500.00)).

    outputs:
      - path: app/api/v1/players/[playerId]/recent-sessions/route.ts
        change: "Verification only. No changes unless /100 or dollar math found in grep."
      - path: app/api/v1/visits/[visitId]/live-view/route.ts
        change: "Verification only. No changes unless /100 or dollar math found in grep."
      - path: app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts
        change: >
          New file. Minimum: one success case. Mock service to return FinancialValue-shaped
          sessions. Assert: response ok, sessions[0].total_buy_in is FinancialValue
          (type='actual', source non-empty string, completeness.status present,
          value is number). That is all.
      - path: app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts
        change: >
          New file. Minimum: one success case. Mock service to return FinancialValue-shaped
          live-view. Assert: response ok, session_total_buy_in is FinancialValue
          (type='actual', source non-empty string, completeness.status present,
          value is number). That is all.

    acceptance_criteria:
      - "Both route.ts files contain no /100, no dollarsToCents, no formatDollars"
      - "Both __tests__/route.test.ts files exist and contain exactly one it/test block each"
      - "Success case assertions check type, source, completeness.status — not specific cents integer"
      - "Both test files pass: npm run test:ci -- --testPathPattern='recent-sessions|live-view'"

    validation_commands:
      - "grep -rn '/100\\|dollarsToCents\\|formatDollars' app/api/v1/players/*/recent-sessions/route.ts app/api/v1/visits/*/live-view/route.ts || echo 'CLEAN'"
      - "ls app/api/v1/players/*/recent-sessions/__tests__/route.test.ts"
      - "ls app/api/v1/visits/*/live-view/__tests__/route.test.ts"
      - "npm run test:ci -- --testPathPattern='recent-sessions|live-view' > /tmp/ws3-test.log 2>&1 && grep -E 'PASS|FAIL' /tmp/ws3-test.log"

  WS4:
    name: "UI Type Update — .value Access + formatDollars"
    description: >
      Minimum type-compatibility update for the two player-session UI components.
      The DTO type changed from number to FinancialValue — field access must use .value.
      Render calls change from formatDollars(session.field) to formatDollars(session.field.value).
      The render function does NOT change to formatCents — value is still a dollar float.
      The net comparison changes from session.net >= 0 to session.net.value >= 0.
      SessionData local interface removal is a forced consequence of the type change, not a goal.
      No new test file. Fix any existing tests that break due to the type change.
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_context: player-sessions-ui
    depends_on: [WS2]
    supersedes_in_parent: WS5_UI
    gate: type-check
    gate_detail: dod-gate
    estimated_complexity: low

    hard_prohibitions:
      - "DO NOT switch to formatCents — value is a dollar float, formatCents would produce wrong output"
      - "DO NOT add a <FinancialValue> component — Phase 1.3 scope"
      - "DO NOT expand this into a broader UI refactor — type update and .value access only"
      - "DO NOT write a new test file — fix existing tests that break, nothing more"
      - "DO NOT inline /100 in UI — value is already post-/100, no math in the component"

    dollar_float_warning: >
      session.total_buy_in.value is a DOLLAR FLOAT in Phase 1.1 (e.g. 500.00, not 50000).
      formatDollars(session.total_buy_in.value) produces the same string as before.
      formatCents(session.total_buy_in.value) would produce a wrong string (it expects cents).
      Do not use formatCents here.

    outputs:
      - path: components/player-sessions/start-from-previous.tsx
        change: >
          (a) Remove or replace SessionData local interface — forced by FinancialValue type change.
              Import RecentSessionDTO from '@/services/visit/dtos' instead.
          (b) Rendering: formatDollars(session.total_buy_in) → formatDollars(session.total_buy_in.value)
              Same for total_cash_out and net. formatDollars stays — only .value access added.
          (c) Net comparison: session.net >= 0 → session.net.value >= 0.
          Total: three render sites + one comparison. Nothing else.
      - path: components/player-sessions/start-from-previous-modal.tsx
        change: >
          Update type import from SessionData (./start-from-previous or local) to
          RecentSessionDTO from '@/services/visit/dtos'. Update field access to .value
          wherever the three financial fields are read.

    acceptance_criteria:
      - "No SessionData type with number financial fields remains in either file"
      - "formatDollars is used with .value access — NOT formatCents"
      - "session.net.value >= 0 comparison is correct"
      - "grep -n 'formatCents' components/player-sessions/start-from-previous.tsx returns zero matches"
      - "npm run type-check exits 0"

    validation_commands:
      - "npm run type-check"
      - "grep -n 'formatCents\\|SessionData' components/player-sessions/start-from-previous.tsx || echo 'CLEAN'"
      - "grep -n 'formatCents\\|SessionData' components/player-sessions/start-from-previous-modal.tsx || echo 'CLEAN'"
      - "npm run test:ci -- --testPathPattern='start-from-previous' > /tmp/ws4-test.log 2>&1 && grep -E 'PASS|FAIL' /tmp/ws4-test.log"

# Execution Phases
execution_phases:
  - name: "Phase 1 — Visit Service Foundation"
    parallel: [WS1]
    note: "WS1 alone. Type change + inline wrap in crud.ts centsToDollars. Establishes FinancialValue baseline in dtos.ts before WS2 touches the same file."
    gates: [type-check-post-ws1]

  - name: "Phase 2 — Rating-Slip Service Wrap"
    parallel: [WS2]
    note: "WS2 alone. RULE-6 hard: must not start until WS1 committed and type-check passes. Atomic WS1+WS2 commit to dtos.ts strongly preferred (DEC-4)."
    gates: [type-check-post-ws2]

  - name: "Phase 3 — Route Tests + UI Update (parallel)"
    parallel: [WS3, WS4]
    note: "WS3 and WS4 are independent — run in parallel. WS3 touches route __tests__ directories. WS4 touches components/player-sessions/."
    gates: [route-boundary-tests-born, dod-gate]

# Validation Gates
gates:
  type-check-post-ws1:
    description: "TypeScript compiles cleanly after WS1 — FinancialValue typing on RecentSessionDTO satisfies all callers."
    command: "npm run type-check"
    success_criteria: "Exit code 0, zero type errors"
    blocks: WS2

  type-check-post-ws2:
    description: "TypeScript compiles cleanly after WS2 — both DTOs are FinancialValue; all callers compile."
    command: "npm run type-check"
    success_criteria: "Exit code 0, zero type errors"
    blocks: [WS3, WS4]

  route-boundary-tests-born:
    description: "Both minimum route test files exist and their one success case passes."
    files_required:
      - "app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts"
      - "app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts"
    command: "npm run test:ci -- --testPathPattern='recent-sessions|live-view' > /tmp/route-test-output.log 2>&1"
    success_criteria: "Both files exist; both success cases pass; exit code 0"
    blocks: dod-gate

  dod-gate:
    description: "Full DoD: type-check + existing tests pass + no formatCents in UI + /100 preserved in services."
    commands:
      - "npm run type-check"
      - "npm run test:ci > /tmp/test-output.log 2>&1"
    assertions:
      - "npm run type-check exits 0"
      - "visit-continuation.test.ts assertions pass (FinancialValue shape, dollar float value)"
      - "route-boundary tests: 1 case per route passes"
      - "grep 'formatCents' components/player-sessions/start-from-previous.tsx returns zero matches"
      - "grep 'formatCents' components/player-sessions/start-from-previous-modal.tsx returns zero matches"
      - "centsToDollars closure still exists in services/visit/crud.ts"
      - "grep '/100' services/visit/crud.ts confirms /100 is present (not removed)"
      - "grep '/100' services/rating-slip/mappers.ts confirms /100 is present in session_total_* assignments"

---

# EXEC-072 — Financial Telemetry — Wave 1 Phase 1.1b — Visit Surface Envelope Label

## ⚠ SCOPE RESET — READ BEFORE EXECUTING

This document was regenerated on 2026-04-24. The prior version encoded Phase 1.2
canonicalization work (removing `/100` conversions, emitting integer cents, switching
UI to `formatCents`) inside a Phase 1.1 labeling slice. That caused the PRD-070 pipeline halt.

**Postmortem:** `docs/issues/gaps/financial-data-distribution-standard/failures/prd-070-pipeline-interruption-postmortem.md`

This version is a clean label-only rewrite. Every workstream carries explicit prohibitions
against the canonicalization work. Read those prohibitions before writing any code.

---

## Status

**Ready for execution — label-only scope, regenerated and scope-reset.**

| Field | Value |
|-------|-------|
| PRD | PRD-072 |
| Parent EXEC-SPEC | EXEC-070 |
| Supersedes in parent | WS5, WS5_ROUTE, WS5_UI, WS6 |
| FIB-H | FIB-H-FiNANCIAL-TELEMETRY-PHASE-1-1-SLICE (actions/fibs/) |
| FIB-S | FIB-S-FINANCIAL-TELEMETRY-PHASE-1-1-SLICE (actions/fibs/) |
| Superseded FIB-S | FIB-S-FIN-CENTS-001 (intake/) — scope was wrong |
| Regenerated | 2026-04-24 |
| Type | Label-only envelope addition |

---

## The One Thing This Spec Does

It wraps existing values in `FinancialValue`. That is all.

```
BEFORE:  total_buy_in: 500.00          (number, dollars after /100)
AFTER:   total_buy_in: {               (FinancialValue, same dollar float)
           value: 500.00,
           type: 'actual',
           source: 'visit_financial_summary.total_in',
           completeness: { status: 'complete' }
         }
```

The number `500.00` does not change. The `/100` that produced it does not change.
The render output does not change. Only the shape of the container changes.

---

## ⚠ Dollar-Float Warning (repeated because it will be misread)

`FinancialValue.value` in this Phase 1.1 implementation carries a **dollar float**
(e.g. `500.00`), not integer cents (e.g. `50000`). This is intentional.

`financialValueSchema` in `lib/financial/schema.ts` declares `value: z.number().int()`.
That constraint will reject the dollar float if applied at runtime. **Do not apply it.**
Static TypeScript types are the enforcement mechanism for Phase 1.1.

Phase 1.2 removes `/100`, canonicalizes to integer cents, and makes the Zod integer
constraint applicable. That is a separate PRD. It is not this spec.

If an executor sees the dollar float and thinks "this is wrong, let me fix it" —
that instinct is correct but premature. File a Phase 1.2 FIB. Do not fix it here.

---

## Workstream Graph

```
WS1 (visit/dtos.ts type change + crud.ts centsToDollars inline wrap)
 │
 └─→ WS2 (visit/dtos.ts type change + rating-slip/mappers.ts inline wrap)
      │
      ├─→ WS3 (route verification + minimum test birth — 1 case per route)
      └─→ WS4 (UI type update — .value access + formatDollars)
```

**Sequential constraint:** WS1 before WS2 (shared `services/visit/dtos.ts`).
WS3 and WS4 are parallel after WS2.

---

## Hard Rules

| Rule | Workstream |
|------|-----------|
| RULE-1: All six in-scope currency fields emit FinancialValue — bare number rejected | WS1, WS2 |
| RULE-2: completeness.status always present — 'complete' or 'unknown', never omitted | WS1, WS2 |
| RULE-3: type and source are set at the wrapping point only — consumers do not override | WS3, WS4 |
| RULE-4: /100 conversion is PRESERVED — FinancialValue.value is the dollar result of /100 | WS1, WS2 |
| RULE-5: No outbound Zod (financialValueSchema) at DTO boundary — z.number().int() rejects dollar floats | WS1, WS2 |
| RULE-6: WS1 fully committed before WS2 starts — shared dtos.ts serialization invariant | Execution phases |
| RULE-7: UI renders via formatDollars(field.value) — NOT formatCents — value is still dollars | WS4 |
| RULE-8: No new mapper files, no helper functions — inline construction only | WS1, WS2 |

---

## Scope

**In scope:**
- `services/visit/dtos.ts` — type change on 6 fields across 2 DTOs
- `services/visit/crud.ts` — inline FinancialValue construction inside centsToDollars closure
- `services/rating-slip/mappers.ts` — inline FinancialValue construction inside toVisitLiveViewDTO
- `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` — new file, 1 case
- `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` — new file, 1 case
- `components/player-sessions/start-from-previous.tsx` — type update + .value access
- `components/player-sessions/start-from-previous-modal.tsx` — type import update

**Explicitly excluded:**
- Removal of `/100` from `crud.ts` or `mappers.ts` — Phase 1.2
- `formatCents` migration — Phase 1.2
- `services/visit/mappers.ts` new file or function — Phase 1.2 if warranted
- `<FinancialValue>` component — Phase 1.3
- 4-case route test suites — Phase 1.2
- New component test file for start-from-previous — Phase 1.2
- Shift-intelligence (WS7B) — separate FIB
- Phase 1.1 verification matrix (WS9) — EXEC-070 closing gate

---

## Phase 1.2 Handoff Note

This spec intentionally leaves the following for Phase 1.2 (`FIB-FIN-CANON-001` recommended):

- Remove `/100` from `services/visit/crud.ts` — `FinancialValue.value` becomes integer cents
- Remove `/100` from `services/rating-slip/mappers.ts` — same
- Migrate UI render from `formatDollars(field.value)` to `formatCents(field.value)`
- Expand route-boundary test files (born here) to full 4-case suites
- Apply `financialValueSchema z.number().int()` runtime validation

The route test files born in WS3 will need their value assertions updated in Phase 1.2
(from dollar float to integer cents). That is acceptable and expected.

---

## EXEC-070 Handoff

Per PRD-072 §8: EXEC-070 remains `partially_finalized_awaiting_child_specs` after this
spec's implementation completes. Phase 1.1 does not close when this slice lands.
Phase 1.1 closes only when: (a) this chain (EXEC-072) reaches implementation completion,
AND (b) the FIB-FIN-SHIFT-001 chain (WS7B equivalent) reaches completion,
AND (c) EXEC-070 WS9 runs the full Phase 1.1 verification matrix.

The two live HTTP payloads changed shape before the broader PRD-071 OpenAPI rollout.
This is an intentional temporary mismatch. The value unit (dollar float) is also a
known temporary state pending Phase 1.2 canonicalization. Both must be documented
in `ROLLOUT-PROGRESS.md`.

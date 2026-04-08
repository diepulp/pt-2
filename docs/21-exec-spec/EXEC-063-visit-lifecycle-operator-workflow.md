---
prd: PRD-063
prd_title: "Visit Lifecycle Operator Workflow"
service: VisitService
mvp_phase: 2

fib_h: docs/issues/gaps/visit-lifecycle-gap/FIB-VISIT-LIFECYCLE.md
fib_s: docs/issues/gaps/visit-lifecycle-gap/FIB-VISIT-LIFECYCLE.structured.json

workstreams:
  WS1:
    name: End Visit Orchestration Service
    description: >
      Orchestration function in VisitService that fetches all open/paused rating slips
      for a visit, sequentially closes each via rpc_close_rating_slip, then closes the
      visit if all succeed. Fail-fast semantics: visit stays open if any slip close fails (RULE-2).
    executor: backend-service-builder
    executor_type: skill
    traces_to: [CAP:end_visit_from_rating_slip_modal, CAP:finalize_open_slips_for_visit, CAP:close_visit_record, OUT-1, OUT-2, OUT-3, OUT-4, RULE-1, RULE-2, END-4, END-5]
    depends_on: []
    outputs:
      - services/visit/end-visit.ts
      - services/visit/dtos.ts
      - services/visit/index.ts
      - app/actions/visit/end-visit-action.ts
      - hooks/visit/use-end-visit.ts
    gate: type-check
    estimated_complexity: medium

  WS2:
    name: End Visit UI — Modal Button, Confirmation, Feedback
    description: >
      Add End Visit button to the active rating slip modal with AlertDialog confirmation
      and toast feedback. Wires to WS1 orchestration via useEndVisit hook. Reuses existing
      Dialog, Button, toast patterns (RULE-7: no new surfaces).
    executor: frontend-design-pt-2
    executor_type: skill
    traces_to: [CAP:end_visit_from_rating_slip_modal, OUT-1, RULE-7, END-2, END-3, END-6]
    depends_on: [WS1]
    outputs:
      - components/modals/rating-slip/rating-slip-modal.tsx
    gate: type-check
    estimated_complexity: medium

  WS3:
    name: Start From Previous — Closed Slips Panel Wiring
    description: >
      Wire ClosedSessionsPanel click handler to resolve player context from closed slip,
      fetch recent visits, and open StartFromPreviousModal (instead of read-only viewer).
      Wire existing StartFromPreviousModal to production dashboard. Pending continuation
      context stored in a Zustand UI store slice (ADR-003: Zustand for transient UI state, TanStack Query for server state); toast prompts seat selection; empty seat click
      completes start-from-previous flow.
    executor: frontend-design-pt-2
    executor_type: skill
    traces_to: [CAP:open_start_from_previous_modal, CAP:continue_visit_from_history, CAP:enforce_continuation_eligibility, OUT-6, OUT-7, OUT-8, RULE-3, RULE-4, RULE-6, SFP-1, SFP-2, SFP-3, SFP-4, SFP-5, SFP-6, SFP-7, SFP-8]
    depends_on: []
    outputs:
      - components/pit-panels/closed-sessions-panel.tsx
      - components/pit-panels/pit-panels-client.tsx
      - hooks/visit/use-start-from-previous-flow.ts
    gate: type-check
    estimated_complexity: high

  WS4:
    name: Closed Slips Terminology Cleanup
    description: >
      Rename all user-facing copy in ClosedSessionsPanel from "Closed Sessions" to
      "Closed Slips". Slip/segment language for panel rows, visit/session language for
      continuation candidates (RULE-5). Pure copy changes.
    executor: frontend-design-pt-2
    executor_type: skill
    traces_to: [CAP:relabel_closed_slips_surface, OUT-5, RULE-5, SUP-1]
    depends_on: []
    outputs:
      - components/pit-panels/closed-sessions-panel.tsx
    gate: lint
    estimated_complexity: low

  WS5:
    name: Integration Tests
    description: >
      Integration tests for End Visit orchestration: happy path (multi-slip close then
      visit close), failure path (slip close fails then visit stays open per RULE-2),
      idempotency (already-closed visit), and zero-slip edge case.
    executor: backend-service-builder
    executor_type: skill
    traces_to: [infrastructure]
    depends_on: [WS1]
    outputs:
      - services/visit/__tests__/end-visit.int.test.ts
    gate: test-pass
    estimated_complexity: medium

  WS_E2E:
    name: E2E Write-Path Tests
    description: >
      Playwright E2E specs covering End Visit flow (seat click, modal, confirm, dashboard
      refresh) and Start From Previous flow (closed slip click, modal, visit select, seat
      click, new slip). Mode B browser login per QA-006.
    executor: e2e-testing
    executor_type: skill
    traces_to: [infrastructure]
    depends_on: [WS1, WS2, WS3, WS4, WS5]
    outputs:
      - e2e/workflows/visit-lifecycle.spec.ts
      - e2e/fixtures/visit-lifecycle-fixtures.ts
    gate: test-pass
    estimated_complexity: medium

execution_phases:
  - name: Phase 1 — Backend Orchestration
    parallel: [WS1]
    gates: [type-check]

  - name: Phase 2 — Frontend Wiring
    parallel: [WS2, WS3, WS4]
    gates: [type-check, lint]

  - name: Phase 3 — Testing
    parallel: [WS5, WS_E2E]
    gates: [test-pass, e2e-write-path]

gates:
  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0"

  lint:
    command: npm run lint
    success_criteria: "Exit code 0, max-warnings=0"

  test-pass:
    command: npm test services/visit/__tests__/end-visit.int.test.ts
    success_criteria: "All tests pass"

  e2e-write-path:
    command: npx playwright test e2e/workflows/visit-lifecycle.spec.ts --reporter=list
    success_criteria: "At least 1 spec exists, all tests pass"

external_dependencies:
  - prd: PRD-057
    service: RatingSlipService
    required_for: "Session-gated seating guards (delivered)"
  - prd: GAP-EXCL-ENFORCE-001
    service: RatingSlipService
    required_for: "Exclusion checks in rpc_start_rating_slip (delivered)"

decisions:
  - decision_id: DEC-001
    resolves_open_question: "OQ-1"
    decision_statement: >
      End Visit calls rpc_close_rating_slip with whatever average_bet value is currently
      stored on the slip. DEC-001 assumes the existing rpc_close_rating_slip behavior
      tolerates average_bet = NULL while still materializing computed_theo_cents from
      policy_snapshot, satisfying chk_closed_slip_has_theo. This assumption must be verified
      by WS5 integration coverage (null average_bet close path) before implementation is
      considered complete. No new UI prompt is introduced for missing rating inputs (RULE-7).
    rationale: >
      Adding a pre-close validation prompt would require a new UI component, violating
      RULE-7. The existing RPC appears to handle NULL average_bet, but this is a
      compliance-sensitive close path — the assumption is guarded by explicit test coverage
      in WS5 rather than treated as settled fact.
    impact_on_scope: none

  - decision_id: DEC-002
    resolves_open_question: "OQ-2"
    decision_statement: >
      The pending-continuation toast uses the existing sonner toast with default auto-dismiss
      behavior (configurable duration). Operator can dismiss via the toast's built-in close
      button or by pressing Escape. No explicit cancel button or timeout component is added.
      If the operator clicks a non-empty seat or navigates away, the pending continuation
      context is cleared.
    rationale: >
      Existing toast infrastructure already supports auto-dismiss and Escape key dismiss.
      Adding a dedicated cancel button or timeout component would introduce a new UI surface,
      violating RULE-7. The context-clearing-on-navigation pattern is already used in PT-2
      for other pending-action flows.
    impact_on_scope: none

  - decision_id: DEC-003
    resolves_open_question: "OQ-3"
    decision_statement: >
      MVP continuation eligibility uses the existing RecentSessionsDTO shape without schema
      addition. Eligibility is determined by: (a) visit has ended_at (is closed), (b) visit
      is within the recency window (7-day default from existing RPC), and (c) visit has at
      least one segment (existing segment_count field). Closure reason distinction is deferred
      to a follow-up; all closed visits within the window are shown as eligible.
    rationale: >
      The existing RecentSessionsDTO already includes ended_at and segment_count, which are
      sufficient for basic eligibility filtering. Adding a closure_reason field would require
      a schema migration and RPC modification, expanding scope beyond the intake boundary.
      The PRD lists this as R2 risk, and the intake explicitly allows deferral.
    impact_on_scope: none

risks:
  - risk: "Sequential slip close without bulk RPC — partial failure state"
    mitigation: >
      Partial failure semantics: if one or more slips close successfully before a later slip
      fails, already-closed slips remain closed (RPC close is terminal), the visit remains
      open, retry attempts operate only on remaining open/paused slips (already-closed slips
      are filtered out), and the operator is informed that the visit is in a partially
      finalized state pending resolution. Start From Previous remains unavailable for this
      visit until the visit itself is fully closed. Toast distinguishes success, blocked
      (partial), and continuation-unavailable states per REQ-4.
  - risk: "RecentSessionsDTO shape may be insufficient for eligibility (R2)"
    mitigation: "DEC-003 defers closure reason distinction. MVP uses ended_at + segment_count for eligibility. Follow-up can add closure_reason without breaking changes."
  - risk: "Slip close preconditions unknown (R3)"
    mitigation: "DEC-001 resolves: existing RPC handles missing average_bet. No new pre-close validation UI needed."
---

# EXECUTION-SPEC: PRD-063 — Visit Lifecycle Operator Workflow

## Overview

PRD-063 delivers three cohesive capabilities for the visit lifecycle:

1. **End Visit** — operator-attested compound workflow that finalizes all open/paused rating slips through `rpc_close_rating_slip` then closes the visit
2. **Start From Previous wiring** — connecting the already-built `StartFromPreviousModal` to the production Closed Slips panel
3. **Closed Slips terminology cleanup** — relabeling "Closed Sessions" to "Closed Slips"

This EXEC-SPEC is an implementation plan for one new orchestration workflow (End Visit) plus adjacent production wiring repairs (Start From Previous and terminology cleanup). The backend plumbing largely exists, but End Visit is not mere wiring; it is a compound workflow that must preserve compliance-safe sequencing and failure behavior. Start From Previous wiring and terminology cleanup are adjacent repairs necessary so the resulting closed state is not incoherent.

## Scope

- **In Scope**: End Visit orchestration + UI, Start From Previous panel wiring, terminology cleanup, integration tests, E2E tests
- **Out of Scope**: SeatContextMenu integration, visit-level grouping in panel, dedicated table/seat picker, rpc_close_rating_slip modifications, gaming day rollover changes, loyalty accrual changes, role-based authorization

## Architecture Context

- **SRM**: VisitService owns `visit`; RatingSlipService owns `rating_slip`. Cross-context consumption via existing service calls.
- **Security**: ADR-024 (context derivation), ADR-030 (auth hardening). No new RLS policies needed.
- **Existing plumbing**: 10 components verified functional (PRD Appendix B).

## Intake Authority Chain

- **FIB-H**: `docs/issues/gaps/visit-lifecycle-gap/FIB-VISIT-LIFECYCLE.md` (v0.2, frozen)
- **FIB-S**: `docs/issues/gaps/visit-lifecycle-gap/FIB-VISIT-LIFECYCLE.structured.json` (v1.0.0)
- All 3 open questions resolved via explicit decisions (DEC-001, DEC-002, DEC-003)

## Workstream Details

### WS1: End Visit Orchestration Service

**Purpose**: Create the compound End Visit workflow as a service function + server action + hook. EXEC does not introduce a new public API endpoint; the orchestration is invoked through a Next.js server action within the existing visit-close boundary.

**Deliverables**:
1. `services/visit/end-visit.ts` — orchestration function `endVisit(supabase, visitId)`
2. `EndVisitResult` type in `services/visit/dtos.ts` — discriminated union for success/failure
3. `endVisit` method added to `VisitServiceInterface` + factory in `services/visit/index.ts`
4. Server action `app/actions/visit/end-visit-action.ts` — uses `withServerAction` middleware, no new public route
5. Hook `hooks/visit/use-end-visit.ts` — TanStack mutation calling the server action, with cache invalidation

**Orchestration logic**:
1. Call `RatingSlipService.listForVisit(supabase, visitId)` to get all slips
2. Filter for `status in ['open', 'paused']`
3. For each open/paused slip: call `RatingSlipService.close(supabase, slipId)`
4. If all succeed: call `closeVisit(supabase, visitId)` → return success
5. If any fail: return failure with failed slip ID and error → visit stays open (RULE-2)

**Cross-context pattern**: VisitService consumes RatingSlipService.listForVisit() (read) and RatingSlipService.close() (RPC call) — no direct table writes to `rating_slip`.

**Acceptance Criteria**:
- [ ] `endVisit()` closes all open/paused slips then closes visit
- [ ] Visit `ended_at` remains NULL if any slip close fails (RULE-2)
- [ ] `computed_theo_cents` populated from `policy_snapshot` for each closed slip (RULE-1)
- [ ] `EndVisitResult` discriminated union distinguishes success/failure
- [ ] Server action uses `withServerAction` middleware pattern (no new public API route)
- [ ] Retry on partial failure operates only on remaining open/paused slips
- [ ] Hook invalidates visit + rating slip queries on success

### WS2: End Visit UI — Modal Button, Confirmation, Feedback

**Purpose**: Add "End Visit" button to rating slip modal with confirmation and feedback.

**Deliverables**:
1. Modified `components/modals/rating-slip/rating-slip-modal.tsx` — End Visit button + AlertDialog confirmation

**Integration points**:
- Button in modal footer alongside existing Pause/Resume/Close buttons
- AlertDialog for destructive confirmation: "End [Player Name]'s visit? This will close [N] active slip(s) and check them out."
- `useTransition` for async action (React 19 mandatory)
- Success toast: "Visit ended — [Player Name] checked out"
- Failure toast: "Could not end visit — slip finalization failed. Visit remains open."

**Acceptance Criteria**:
- [ ] End Visit button visible for active/paused slips
- [ ] AlertDialog confirmation before execution
- [ ] `useTransition` wraps the async action
- [ ] Toast distinguishes success vs. failure (REQ-4)
- [ ] Modal closes + dashboard refreshes on success
- [ ] No new UI components introduced (RULE-7)

### WS3: Start From Previous — Closed Slips Panel Wiring

**Purpose**: Wire closed slip clicks to the continuation flow in production.

**Deliverables**:
1. Modified `components/pit-panels/closed-sessions-panel.tsx` — click handler change
2. Modified `components/pit-panels/pit-panels-client.tsx` — StartFromPreviousModal integration
3. New `hooks/visit/use-start-from-previous-flow.ts` — multi-step continuation orchestration

**Flow**:
1. Closed rated slip click → resolve `player_id` from slip (RULE-3: slip is entry point only)
2. Fetch recent visits via existing `GET /api/v1/players/[playerId]/recent-sessions`
3. Open `StartFromPreviousModal` with eligible visits
4. Operator selects visit → store pending continuation context
5. Toast: "Select an empty seat to place [Player Name]"
6. Empty seat click → `POST /api/v1/visits/start-from-previous`
7. New visit + new slip created (RULE-4) → fresh slip modal opens

**Acceptance Criteria**:
- [ ] Closed rated slip click does not open read-only viewer
- [ ] Player context resolves from slip before modal open (RULE-3)
- [ ] Modal fetches and displays visit-level candidates only (not slip-level)
- [ ] Continuation eligibility rules explicit (RULE-6): ended_at set, within recency window, has segments
- [ ] Pending continuation context persists only until successful placement, dismiss, or navigation-away (DEC-002)
- [ ] Pending continuation context stored in Zustand UI store slice (ADR-003: Zustand for transient UI state, TanStack Query for server state)
- [ ] Non-empty seat click does not trigger continuation
- [ ] Successful continuation opens a fresh slip modal for the new slip, not the source slip
- [ ] New slip has independent `policy_snapshot` from destination table
- [ ] Exclusion defense-in-depth check in startFromPrevious service (existing)

### WS4: Closed Slips Terminology Cleanup

**Purpose**: Rename "Closed Sessions" to "Closed Slips" across all panel copy.

**Deliverables**:
1. Modified `components/pit-panels/closed-sessions-panel.tsx` — all copy changes

**Changes**:
- Panel title: "Closed Sessions" → "Closed Slips"
- Badge: "{N} session{s}" → "{N} slip{s}"
- Loading state: "Closed Sessions" → "Closed Slips"
- Error: "Failed to load closed sessions" → "Failed to load closed slips"
- Empty state: any "session" → "slip"
- Row affordance text: verify uses "slip" not "session"
- Continuation-related text keeps "visit"/"session" for visit-level objects (RULE-5)

**Acceptance Criteria**:
- [ ] No user-facing "Closed Sessions" text in panel (RULE-5)
- [ ] Panel title reads "Closed Slips"
- [ ] Badge reads "{N} slip{s}"
- [ ] Component file/export name unchanged (separate refactor)

### WS5: Integration Tests

**Purpose**: Verify End Visit orchestration correctness.

**Deliverables**:
1. `services/visit/__tests__/end-visit.int.test.ts`

**Test cases**:
- Happy path: visit with 2 open slips → endVisit → both slips closed + visit ended
- Failure path: 1 slip close fails → visit.ended_at stays NULL (RULE-2)
- Partial failure: slip A closes, slip B fails → slip A stays closed, visit stays open, retry closes only slip B (RULE-2)
- Idempotency: endVisit on already-closed visit → success
- Zero-slip: visit with no open slips → visit closes directly
- Theo verification: `computed_theo_cents` non-null on closed slips (RULE-1)
- **DEC-001 verification**: slip with NULL average_bet → rpc_close_rating_slip still materializes computed_theo_cents, chk_closed_slip_has_theo satisfied
- **DEC-003 verification**: RecentSessionsDTO shape provides ended_at + segment_count sufficient for eligibility filtering

**Acceptance Criteria**:
- [ ] All test cases pass
- [ ] Tests use real Supabase (integration, not mocked)
- [ ] Test naming: `*.int.test.ts` per governance
- [ ] Node test environment (ADR-044)

### WS_E2E: E2E Write-Path Tests

**Purpose**: Full-stack Playwright verification of write-path user journeys.

**Deliverables**:
1. `e2e/workflows/visit-lifecycle.spec.ts`
2. `e2e/fixtures/visit-lifecycle-fixtures.ts`

**Test flows**:
- End Visit: login → pit dashboard → click occupied seat → modal → End Visit → confirm → seat freed + toast
- Start From Previous: login → Closed Slips panel → click slip → modal → select visit → toast → seat click → new slip
- Terminology: panel title reads "Closed Slips"
- **DEC-002 verification**: pending continuation toast dismisses on navigation-away; pending context is cleared
- **DEC-003 verification**: continuation modal shows eligible visits using MVP rule set (ended_at set, has segments)

**Acceptance Criteria**:
- [ ] Mode B browser login (QA-006)
- [ ] At least 1 End Visit spec + 1 Start From Previous spec
- [ ] All tests pass
- [ ] Fixtures use UUID-based identifiers + cleanup

## Definition of Done

- [ ] All workstream outputs created
- [ ] All gates pass (type-check, lint, test-pass, e2e-write-path)
- [ ] No regressions in existing tests
- [ ] Pit boss can End Visit from rating slip modal
- [ ] Visit stays open if slip finalization fails
- [ ] Closed rated slip click opens StartFromPreviousModal
- [ ] Panel uses "Closed Slips" terminology
- [ ] Open questions resolved (DEC-001, DEC-002, DEC-003)

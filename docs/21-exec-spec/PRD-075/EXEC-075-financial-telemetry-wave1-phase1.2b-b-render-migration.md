---
prd: PRD-075
title: Financial Telemetry — Wave 1 Phase 1.2B-B — Render Migration
status: draft
created: 2026-05-03
fib_h_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION.md
fib_s_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-b/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION.json
fib_s_loaded: true
complexity_prescreen: streamlined
write_path_classification: none
gov010_check: waived:FIB-pair-is-intake-authority;no-ADR-gaps

workstreams:
  WS1_RENDER:
    name: Render Migration
    description: >
      (STEP-1) Audit runtime UI code for any formatter — direct or indirect — that
      consumes FinancialValue.value fields using dollar-based assumptions. The audit
      is not limited to the identifier "formatDollars"; it covers any call pattern
      that would misinterpret integer cents as dollars. Authoritative targets are the
      three expressions: formatDollars(session.total_buy_in.value),
      formatDollars(session.total_cash_out.value), formatDollars(session.net.value)
      in components/player-sessions/start-from-previous.tsx. Line numbers 202/208/226
      are indicative only. If any additional FinancialValue.value consumer with
      dollar-based assumptions is discovered outside these three expressions, halt for
      FIB amendment before any code change.
      (STEP-1b) Sanity-probe a RecentSessionDTO fixture or runtime sample to confirm
      FinancialValue.value fields are integer cents at the point of UI consumption
      (e.g., total_buy_in.value == 7500 for a $75 buy-in). If values are dollar
      floats (e.g., 75.0), halt — the upstream invariant is broken and this slice
      cannot proceed.
      (STEP-2 through STEP-5) Swap the import and replace the three target expressions
      with formatCents in start-from-previous.tsx. Update any stale financial-unit
      comment that still describes FinancialValue.value as a dollar float.
      No other file receives a logic change in this workstream.
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_contexts: [player-sessions-ui]
    depends_on: []
    traces_to: [CAP:q4-consumer-audit, CAP:format-cents-migration, OUT-1, OUT-2, OUT-3, RULE-1, RULE-2, RULE-3, RULE-4, RULE-5]
    outputs:
      - components/player-sessions/start-from-previous.tsx
    gate: build
    estimated_complexity: low
    precondition: >
      Phase 1.2B-A exit gate passed (EXEC-074, commit e83a2c12, 2026-04-30).
      FinancialValue.value is confirmed integer cents at the service boundary for
      RecentSessionDTO.total_buy_in, total_cash_out, and net. This must also be
      validated at the UI consumer boundary (STEP-1b sanity probe) before any code
      change — service-layer confirmation alone is not sufficient. formatCents exists
      in lib/format.ts with the same call signature as formatDollars; no new utility
      required.
    stop_conditions:
      - STEP-1b sanity probe finds FinancialValue.value is a dollar float at UI consumption
      - Q-4 audit finds a FinancialValue.value consumer with dollar-based assumptions outside the three named expressions
      - Any file other than start-from-previous.tsx requires a logic change
      - A new test file is required for start-from-previous.tsx
      - OpenAPI path entries are required
      - Route-boundary tests are required
      - Runtime log events are required

  WS2_TRACKER:
    name: Tracker Closure
    description: >
      After WS1_RENDER gate passes and the implementation commit SHA is known,
      close DEF-004 in docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
      (STEP-6). Set status: "closed", closed_in: "EXEC-075", closed_date: "<date>",
      and commit_sha: "<sha>". If this update lands in the same commit as the render
      migration, set commit_sha_pending: true and add a follow-up_required note;
      replace the pending flag with the real SHA in a standalone follow-up commit
      before Phase 1.2B-C planning begins. Also update cursor.next_action and
      cursor.next_action_prd to reflect that Phase 1.2B-B is complete and Phase 1.2B-C
      planning is the next step. No other file is modified in this workstream.
    executor: lead-architect
    executor_type: skill
    bounded_contexts: [rollout-governance]
    depends_on: [WS1_RENDER]
    traces_to: [CAP:tracker-closure, OUT-4, OUT-5, RULE-1]
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
    gate: build
    estimated_complexity: low

execution_phases:
  - name: Phase 1 — Render Migration
    parallel: [WS1_RENDER]
    gates: [build]

  - name: Phase 2 — Tracker Closure
    parallel: [WS2_TRACKER]
    gates: [build]

gates:
  build:
    command: npm run build > /tmp/build-075.log 2>&1
    success_criteria: >
      Exit code 0. npm run type-check and npm run lint exit 0 as well (run sequentially
      before build). STEP-1b sanity probe executed, recorded, and evidence attached
      in a traceable location (delivery notes or PR description) — probe must confirm
      FinancialValue.value is integer cents at the UI boundary before this gate is
      considered passing. formatDollars absent from start-from-previous.tsx for all
      three FinancialValue.value reads. No other source file modified. After WS2_TRACKER:
      deferred_register[DEF-004].status == "closed" with commit SHA or
      commit_sha_pending: true + follow_up_required note.

decisions: []

risks:
  - risk: Q-4 audit discovers a formatDollars(FinancialValue.value) call site outside the three named lines
    mitigation: Halt execution immediately. Do not touch start-from-previous.tsx.
      File a FIB amendment for Phase 1.2B-B to add the new site, or split it into a
      separate Phase 1.2B-B-bis slice. Resume only after the amendment is approved.

  - risk: formatCents signature differs from formatDollars (e.g., requires a different number of arguments)
    mitigation: Verify the signature in lib/format.ts before the import swap. If it
      differs, halt for FIB amendment — a signature mismatch is not a simple
      import swap and may require a wrapper, which is out of scope for this slice.

  - risk: commit_sha_pending flag is never replaced before Phase 1.2B-C starts
    mitigation: WS2_TRACKER acceptance criteria require a follow_up_required note
      when commit_sha_pending: true is used. Phase 1.2B-C entry gate must verify
      DEF-004 carries a real commit SHA before planning begins.

  - risk: Reviewer attempts to bundle component test birth or OpenAPI expansion into this slice
    mitigation: FIB-H §K expansion trigger rule is active. Any diff touching a test
      file for start-from-previous.tsx, an OpenAPI path entry, or a route-boundary
      test file is a scope breach. Reject the diff and defer to Phase 1.2B-C / 1.3.
---

# EXEC-075 — Financial Telemetry Wave 1 Phase 1.2B-B — Render Migration

## Overview

EXEC-075 executes the single deferred obligation from Phase 1.2B-A: fixing the live factor-of-100 display error in `components/player-sessions/start-from-previous.tsx` introduced when BRIDGE-001 was retired. With `FinancialValue.value` now confirmed integer cents at the service boundary, `formatDollars` is the wrong formatter for those fields. This EXEC replaces three call sites with `formatCents`, confirms no other call sites exist (Q-4 audit), and closes DEF-004 in `ROLLOUT-TRACKER.json`.

**Scope boundary (one sentence):** This EXEC changes how integer-cents financial values render in `start-from-previous.tsx`; it does not expand the API contract, add route tests, or wire observability.

**FIB authority:** `FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION` v1 (2026-05-03, frozen). Downstream expansion requires FIB amendment before this EXEC is updated.

## Precondition Gate

Before any code change:

1. Confirm Phase 1.2B-A exit gate passed: EXEC-074 closed 2026-04-30, commit `e83a2c12`. `FinancialValue.value` is integer cents for `RecentSessionDTO.total_buy_in`, `total_cash_out`, and `net` at the service boundary.
2. Confirm `formatCents` exists in `lib/format.ts` with a compatible signature: `formatCents(n: number): string`.
3. **Validate at the UI consumer boundary** (STEP-1b sanity probe — see below). Service-layer confirmation alone is not sufficient; the probe must pass at the point where `start-from-previous.tsx` consumes the DTO.

(1) and (2) are pre-confirmed in FIB-H §I. (3) must be executed as STEP-1b during WS1_RENDER before any code is written; record the probe result in delivery notes.

## Workstream Details

### WS1_RENDER — Render Migration

**Executor:** `frontend-design-pt-2`

**STEP-1 — Q-4 Consumer Audit (grep only, no logic change)**

The audit must verify that no formatter — direct or indirect — consumes `FinancialValue.value` fields using dollar-based assumptions. It is not limited to the identifier `formatDollars`. Run all of the following and record the combined output:

```bash
# Primary: find formatDollars hits across UI code
grep -rn "formatDollars" components/ app/ hooks/ --include="*.tsx" --include="*.ts"

# Secondary: find any .value field passed to a dollar-oriented formatter
grep -rn "\.value)" components/ app/ hooks/ --include="*.tsx" --include="*.ts" | grep -v "formatCents"
```

Expected clean result:
- `components/player-sessions/start-from-previous.tsx` — three hits on `formatDollars(session.{total_buy_in,total_cash_out,net}.value)` (line numbers are indicative; authoritative targets are the expressions)
- Any hit at `player-list-panel.tsx` for `formatDollars(player.total_net_today)` reads a bare `number` field, not `FinancialValue.value` — **out of scope, do not modify**

If any additional call passes a `FinancialValue.value` integer-cents field to a dollar-oriented formatter (whether named `formatDollars` or otherwise): **halt execution and file a FIB amendment before any code change**.

Confirm clean:
- `start-from-previous-modal.tsx` — no `FinancialValue` financial field reads via dollar-oriented formatter
- `rating-slip-modal.tsx` — no `RecentSessionDTO` / `VisitLiveViewDTO` field reads

**STEP-1b — Sanity Probe: FinancialValue.value at UI Consumer Boundary**

Before writing any code, confirm that `FinancialValue.value` fields arriving at `start-from-previous.tsx` are integer cents, not dollar floats. Use a test fixture or an existing unit/integration test that exercises `RecentSessionDTO`:

- `total_buy_in.value` for a $75 buy-in should be `7500`, not `75` or `75.0`
- `net.value` for a -$25 net should be `-2500`, not `-25` or `-25.0`

If the probe reveals dollar-float values: **halt immediately** — the upstream invariant from Phase 1.2B-A is broken and this slice cannot proceed until the root cause is identified and resolved.

Record the probe result (pass/fail + evidence) in WS1_RENDER delivery notes before proceeding to STEP-2.

> **Audit limitation note:** The Q-4 grep is best-effort and pattern-based. It may not detect custom formatter wrappers or indirect call chains that ultimately consume `FinancialValue.value` with dollar-based assumptions. Any formatter passing `FinancialValue.value` as an argument — even indirectly — must be reviewed for unit correctness during code review. If a wrapper is found that the grep could not have detected, treat it as a Q-4 audit hit and halt for FIB amendment.

**STEP-2 — Update import**

In `components/player-sessions/start-from-previous.tsx`:

Replace:
```ts
import { ..., formatDollars, ... } from "@/lib/format"
```

With:
```ts
import { ..., formatCents, ... } from "@/lib/format"
```

Remove `formatDollars` from the import; add `formatCents`. No other import changes.

**STEP-3 — Replace buy-in call site**

> Line numbers are indicative only. Authoritative target: the expression `formatDollars(session.total_buy_in.value)`.

Replace:
```ts
formatDollars(session.total_buy_in.value)
```
With:
```ts
formatCents(session.total_buy_in.value)
```

**STEP-4 — Replace cash-out call site**

> Line numbers are indicative only. Authoritative target: the expression `formatDollars(session.total_cash_out.value)`.

Replace:
```ts
formatDollars(session.total_cash_out.value)
```
With:
```ts
formatCents(session.total_cash_out.value)
```

**STEP-5 — Replace net call site**

> Line numbers are indicative only. Authoritative target: the expression `formatDollars(session.net.value)`.

Replace:
```ts
formatDollars(session.net.value)
```
With:
```ts
formatCents(session.net.value)
```

**STEP-5b — Stale comment (if present)**

If `start-from-previous.tsx` contains a comment describing `FinancialValue.value` as a dollar float or referencing BRIDGE-001 as active, update it to reflect integer cents. One line max; do not add new comments.

**Acceptance Criteria**

- [ ] **Sanity probe passed (STEP-1b)**: `FinancialValue.value` for `RecentSessionDTO` financial fields is integer cents at the UI consumer boundary; result recorded in delivery notes
- [ ] **Sanity probe evidence recorded in a traceable location** (delivery notes or PR description) with concrete sample values (e.g., `total_buy_in.value === 7500` for a $75 session)
- [ ] **RULE-1**: `start-from-previous.tsx` is the only file with a diff; no other file receives a logic change
- [ ] **RULE-2**: No formatter — direct or indirect — consumes `FinancialValue.value` fields using dollar-based assumptions in `start-from-previous.tsx`; `formatCents` is the formatter for all three target expressions (`session.total_buy_in.value`, `session.total_cash_out.value`, `session.net.value`)
- [ ] **RULE-3**: No new test file created (`start-from-previous.test.tsx` birth is Phase 1.3 / DEF-006)
- [ ] **RULE-4**: `player-list-panel.tsx` `formatDollars(player.total_net_today)` is unchanged (bare `number` field, out of scope)
- [ ] **RULE-5**: No route handler, service, OpenAPI path entry, or existing test file is modified
- [ ] **RULE-6**: `hold_percent` is not referenced in this diff
- [ ] **OUT-1**: `formatCents` replaces `formatDollars` for all three `FinancialValue.value` target expressions
- [ ] **OUT-2**: Q-4 audit result recorded; no additional dollar-oriented formatter consumes a `FinancialValue.value` field anywhere in `components/`, `app/`, or `hooks/`
- [ ] **OUT-3**: `npm run type-check`, `npm run lint`, `npm run build` all exit 0

**Gate: build**

```bash
npm run type-check
npm run lint -- --quiet
npm run build > /tmp/build-075.log 2>&1
```

All three must exit 0 before WS2_TRACKER begins.

---

### WS2_TRACKER — Tracker Closure

**Executor:** `lead-architect`

**STEP-6 — Close DEF-004 in ROLLOUT-TRACKER.json**

Locate `deferred_register[id == "DEF-004"]` and add the following fields:

```json
{
  "id": "DEF-004",
  "item": "UI render migration: formatDollars(field.value) → formatCents(field.value)",
  "deferred_to": "Phase 1.2B",
  "note": "Render must match value unit. Only switch after DEF-002 makes value integer cents.",
  "status": "closed",
  "closed_in": "EXEC-075",
  "closed_date": "2026-05-03",
  "commit_sha": "<implementation commit SHA>"
}
```

**If this update lands in the same commit as the render migration** (i.e., the SHA is not yet known at write time):

```json
{
  "status": "closed",
  "closed_in": "EXEC-075",
  "closed_date": "2026-05-03",
  "commit_sha_pending": true,
  "follow_up_required": "Replace commit_sha_pending with real SHA before Phase 1.2B-C planning begins"
}
```

**Also update `cursor`:**

```json
{
  "active_phase": "1.2B",
  "phase_status": "partial_complete",
  "phase_label": "API Canonicalization — Phase 1.2B-A and 1.2B-B complete; Phase 1.2B-C contract expansion pending",
  "next_action": "Phase 1.2B-C: full 28-route OpenAPI expansion + 4-case route-boundary test matrices + DEC-6 + deprecation observability",
  "next_action_prd": null,
  "last_closed_phase": "1.2B-B",
  "last_closed_date": "2026-05-03",
  "last_closed_exec": "EXEC-075"
}
```

**Acceptance Criteria**

- [ ] **OUT-4**: `deferred_register[DEF-004].status == "closed"` with a real commit SHA or `commit_sha_pending: true` + `follow_up_required` note
- [ ] **OUT-5**: `cursor.next_action` points to Phase 1.2B-C; Phase 1.2B-C entry gate is unblocked
- [ ] **RULE-1**: `ROLLOUT-TRACKER.json` is the only file modified in this workstream
- [ ] If `commit_sha_pending: true` is used, a follow-up commit replacing the flag with the real implementation SHA must be created **immediately after** the implementation commit is made — not deferred to Phase 1.2B-C planning. Phase 1.2B-C entry gate must verify a real SHA is present before proceeding.

**Gate: tracker-closed**

Verify:
```
deferred_register[DEF-004].status === "closed"
AND (deferred_register[DEF-004].commit_sha is a non-empty string
     OR deferred_register[DEF-004].commit_sha_pending === true)
```

---

## Intake Traceability Audit

| FIB-S Element | Covered By |
|---|---|
| CAP:q4-consumer-audit | WS1_RENDER STEP-1 |
| CAP:format-cents-migration | WS1_RENDER STEP-2 through STEP-5 |
| CAP:tracker-closure | WS2_TRACKER STEP-6 |
| OUT-1 | WS1_RENDER acceptance criteria |
| OUT-2 | WS1_RENDER acceptance criteria |
| OUT-3 | WS1_RENDER gate: build-clean |
| OUT-4 | WS2_TRACKER acceptance criteria |
| OUT-5 | WS2_TRACKER acceptance criteria |
| RULE-1 (hard) | WS1_RENDER AC + WS2_TRACKER AC |
| RULE-2 (hard) | WS1_RENDER AC |
| RULE-3 (hard) | WS1_RENDER AC |
| RULE-4 (hard) | WS1_RENDER AC |
| RULE-5 (hard) | WS1_RENDER AC |
| RULE-6 (hard) | WS1_RENDER AC |
| STEP-1 through STEP-5 | WS1_RENDER |
| STEP-6 | WS2_TRACKER |

All 3 capabilities covered. All 5 outcomes covered. All 6 hard rules covered. Anti-invention: no surface, API path, or workflow side-path introduced beyond `zachman.where.surfaces` (`start-from-previous.tsx` + `ROLLOUT-TRACKER.json`).

---

## Definition of Done

- [ ] STEP-1b sanity probe passed: `FinancialValue.value` is integer cents at the UI consumer boundary; result recorded in delivery notes
- [ ] Q-4 audit returned clean: no formatter (direct or indirect) consumes a `FinancialValue.value` field with dollar-based assumptions outside the three target expressions in `start-from-previous.tsx`
- [ ] `formatDollars` absent from `start-from-previous.tsx` for all three `FinancialValue.value` target expressions
- [ ] `formatCents` is the formatter for `session.total_buy_in.value`, `session.total_cash_out.value`, and `session.net.value`
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] No new test files created
- [ ] No other source file modified
- [ ] `ROLLOUT-TRACKER.json` DEF-004 status is "closed" with commit SHA (or `commit_sha_pending: true` + follow-up note)
- [ ] `cursor.next_action` updated to Phase 1.2B-C

## Successor Slice

Phase 1.2B-C requires its own FIB-H + FIB-S + PRD + EXEC-SPEC pair. It owns:
- Full 28-route OpenAPI expansion for financially-relevant routes
- 4-case route-boundary test matrices for `recent-sessions` and `live-view`
- DEC-6: `GET /api/v1/shift-intelligence/alerts` OpenAPI path entry + route-boundary test birth
- Structured log events per deprecated-field usage at route handlers

Phase 1.2B-C entry gate: DEF-004 closed (this EXEC), `commit_sha_pending: true` resolved to a real SHA.

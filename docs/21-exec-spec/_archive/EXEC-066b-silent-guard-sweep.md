---
# EXECUTION-SPEC Frontmatter
id: EXEC-066b
title: "Silent-Guard Sweep (PRD-064 Phase H — Telemetry-Gated Continuation)"
prd: PRD-064
prd_title: "MTL Buy-In Glitch Containment (Operator-Visible Atomicity)"
parent_phase: "Phase H — Write-Path Hardening Pass 2 (Slice 2 of 2)"
owner: Lead Architect
status: Shelved — scope-drift product. DO NOT execute. Reactivates only if EXEC-066a is itself reactivated. See 066a status note (2026-04-17 reset).
created: 2026-04-17
last_review: 2026-04-17
invariant: INV-MTL-BRIDGE-ATOMICITY (Corollary: operator-visible atomicity); INV-WRITE-PATH-OPERATOR-VISIBILITY
prerequisite: EXEC-066a
pilot_bound: false
closure_criteria: See §12
affects:
  - PRD-064
  - EXEC-066a

workstreams:
  WS2b:
    name: "pit-panels siblings — `handleCloseSession` + `handleMovePlayer`"
    description: >
      Replace silent early-returns in `handleCloseSession` (L354-361)
      and `handleMovePlayer` (L400-407) of `pit-panels-client.tsx`
      with `failSilentGuard(severity='financial',
      onBanner=setSaveErrorBanner)`. Remove the existing bare
      `logError(...)` at `handleMovePlayer`'s guard site (L402-405) —
      `failSilentGuard` logs internally; leaving both produces
      double-log noise. Remove the `// TODO(EXEC-066b)` markers from
      the two sites.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - components/pit-panels/pit-panels-client.tsx
      - components/pit-panels/__tests__/silent-guard-siblings.test.tsx
    gate: test-pass
    conditional: "Only if §12 closure rule = PROCEED or REDUCE(including pit-panels siblings)"

  WS3:
    name: "Session-state + rundown"
    description: >
      Replace silent early-returns in `handlePauseSession` and
      `handleResumeSession` (`rating-slip-modal.tsx:443-476`) and
      `handleStartRundown` (`session-action-buttons.tsx:82`) with
      `failSilentGuard(severity='state')`. Toast-only remediation
      (non-dismissible banner not required for state-class writes).
      Remove the `// TODO(EXEC-066b)` markers from the three sites.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - components/modals/rating-slip/rating-slip-modal.tsx
      - components/table/session-action-buttons.tsx
    gate: type-check
    conditional: "Only if §12 closure rule = PROCEED or REDUCE(including state sites)"

  WS4:
    name: "Admin config writes"
    description: >
      Replace silent early-return in `handleSave`
      (`admin/threshold-settings-form.tsx:268-269`) with
      `failSilentGuard(severity='config', onBanner=setFormBanner)`.
      Remove the `// TODO(EXEC-066b)` marker.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - components/admin/threshold-settings-form.tsx
    gate: type-check
    conditional: "Only if §12 closure rule = PROCEED or REDUCE(including config sites)"

  WS5:
    name: "Playwright regression sibling spec"
    description: >
      Add `e2e/silent-guard-regression.spec.ts` (sibling, NOT extension
      of `e2e/repro-mtl-glitch.spec.ts` — keep that one pinned to
      PRD-064 semantics). Exercise remediated handlers under forced
      null-modalData race state (Playwright `page.route()` interception
      of `/api/v1/rating-slip-modal/:id` returning 404/empty, with
      React Query cache verification via `page.evaluate()` before
      click). Assert toast + banner + Sentry breadcrumb for financial
      severity; toast-only for state; inline banner for config.
      Confirm `e2e/repro-mtl-glitch.spec.ts` still green.
    executor: qa-specialist
    executor_type: skill
    depends_on: [WS2b, WS3, WS4]
    outputs:
      - e2e/silent-guard-regression.spec.ts
    gate: e2e
    conditional: "Runs only if at least one of WS2b/WS3/WS4 executes"

execution_phases:
  - name: "Phase 0 — Closure Review (§12)"
    description: "Read pilot telemetry. Decide KILL / REDUCE(<sites>) / PROCEED. Document in a dated addendum below §12."
    parallel: []
    gates: [closure-decision]

  - name: "Phase 1 — Conditional Remediation (Parallel)"
    description: "Only workstreams whose `conditional` clause is satisfied by the Phase 0 decision execute."
    parallel: [WS2b, WS3, WS4]
    gates: [type-check, test-pass]

  - name: "Phase 2 — Regression Spec (conditional)"
    parallel: [WS5]
    gates: [e2e]

gates:
  closure-decision:
    description: "Lead-architect review of EXEC-066a pilot telemetry. Produces a decision: KILL (no remediation), REDUCE(<site-list>), or PROCEED (all sites). Decision written into this spec §12.1."
    success_criteria: "Closure decision recorded with date, reviewer, pilot-window dates, and per-site trip counts."
  type-check:
    command: "npm run type-check"
    success_criteria: "Exit code 0"
  test-pass:
    command: "npm run test -- components/pit-panels/__tests__/silent-guard-siblings.test.tsx"
    success_criteria: "All tests pass"
  e2e:
    command: "npm run e2e:playwright -- e2e/silent-guard-regression.spec.ts e2e/repro-mtl-glitch.spec.ts"
    success_criteria: "Both Playwright specs green"

external_dependencies:
  - EXEC-066a shipped and in production long enough for meaningful telemetry (minimum pilot-window = 4 weeks).
  - Sentry breadcrumbs from `failSilentGuard` flowing to a searchable index (per EXEC-063).
  - PRD-065 status re-checked at 066b Phase 0 — if PRD-065 has restructured `pit-panels-client.tsx:handleSave` to a server-boundary command, WS2b must be re-scoped to match the new handler topology.

---

# EXEC-066b — Silent-Guard Sweep (Telemetry-Gated Continuation)

## 1. Executive Summary

EXEC-066a shipped the shared utility, the lint regression gate, and
the one demonstrated-failure site (BDD7B21D — `handleSave` in
`pit-panels-client.tsx`). The remaining 6 write-path silent-guard
sites inherited `// TODO(EXEC-066b): remediate pending telemetry
review` pragmas.

This spec (**066b**) is the deferred continuation. It does not
auto-execute. At EXEC-066a pilot end (minimum 4 weeks), the
lead-architect reads pilot telemetry and applies the **Closure
Criteria (§12)** to decide:

- **KILL** — no remediation; pragmas stay; spec closed as "empirically unreachable under pilot load."
- **REDUCE(<site-list>)** — remediate only sites with qualifying trip counts.
- **PROCEED** — remediate all 6.

Operational urgency: **low to none**. If telemetry shows no trips,
this spec dies. If it shows trips, the remediation is mechanical —
the pattern is already established by 066a.

---

## 2. Scope

### 2.1 Sites in scope (from EXEC-066a §2.2, sites #2–#7)

| # | File | Handler | Priority | TODO Marker |
|---|---|---|---|---|
| 2 | `components/pit-panels/pit-panels-client.tsx:354-361` | `handleCloseSession` | P0 — sibling | `TODO(EXEC-066b)` |
| 3 | `components/pit-panels/pit-panels-client.tsx:400-407` | `handleMovePlayer` | P0 — sibling | `TODO(EXEC-066b)` |
| 4 | `components/modals/rating-slip/rating-slip-modal.tsx:443-458` | `handlePauseSession` | P1 | `TODO(EXEC-066b)` |
| 5 | `components/modals/rating-slip/rating-slip-modal.tsx:461-476` | `handleResumeSession` | P1 | `TODO(EXEC-066b)` |
| 6 | `components/table/session-action-buttons.tsx:81-82` | `handleStartRundown` | P1 | `TODO(EXEC-066b)` |
| 7 | `components/admin/threshold-settings-form.tsx:268-269` | `handleSave` | P2 | `TODO(EXEC-066b)` |

### 2.2 Out of scope

- The 2 unreachable-guard sites from 066a §2.2 (reward-drawer, acknowledge-alert-dialog). They never become 066b work regardless of telemetry.
- `handleSave` at `pit-panels-client.tsx:308-315` — remediated in 066a.
- All scope-creep candidates named in 066a §8.

---

## 3. Remediation Pattern

All sites use `failSilentGuard(...)` from 066a
(`lib/errors/fail-silent-guard.ts`). Severity per the matrix in
EXEC-066a §4.3:

- **financial**: WS2b sites (`handleCloseSession`, `handleMovePlayer`) — toast + non-dismissible banner via `setSaveErrorBanner`.
- **state**: WS3 sites (`handlePauseSession`, `handleResumeSession`, `handleStartRundown`) — toast only.
- **config**: WS4 site (`threshold-settings-form.handleSave`) — inline banner (`setFormBanner`) + toast.

See EXEC-066a §4 for the full utility signature, banner lifecycle, and
call-site shape. Pattern is identical; only the `reason` codes,
`userMessage` strings, and `severity` / `onBanner` wiring differ.

---

## 4. Functional Requirements (Conditional)

- **FR-1**: Each remediated site must call `failSilentGuard(...)` with a distinct `reason` code and a human-readable `userMessage`.
- **FR-2**: WS2b must also remove the existing bare `logError(...)` at `handleMovePlayer`'s guard site (066a deferred this to 066b to keep 066a's diff minimal). `failSilentGuard` logs internally; removal prevents double-log.
- **FR-3**: Banner lifecycle per EXEC-066a §4.1a extends to the two new pit-panels handlers. WS2b adds `setSaveErrorBanner(null)` at the top of both mutations' `try` blocks (~L373 for close, ~L416 for move). Re-evaluate R-6 (stomping) once all three pit-panels handlers share the single banner slot.
- **FR-4**: Remove the `// TODO(EXEC-066b): remediate pending telemetry review` pragma pair from each remediated site. The `// eslint-disable-next-line` line is no longer needed once `failSilentGuard` is called (the rule passes).
- **FR-5**: For sites NOT remediated per the §12 closure decision (KILL or REDUCE), rewrite the pragma pair to cite this spec's closure decision directly — e.g., `// eslint-disable-next-line guard-rules/no-silent-handler-guard` + `// EXEC-066b §12.1 (YYYY-MM-DD): closure=KILL — zero pilot trips; guard retained as defensive dead code`. Replaces the TODO with a durable justification.

## 5. Non-Functional Requirements

- **NFR-1**: No regressions to EXEC-066a behaviour. `handleSave` must continue working post-sweep.
- **NFR-2**: Sentry breadcrumb schema unchanged from 066a (`{ component, action, reason, severity }`). Any new `reason` codes introduced in 066b must follow the `MISSING_<SUBJECT>` naming convention.
- **NFR-3**: No new database migrations, no RPC signature changes, no RLS policy changes.

---

## 6. Definition of Done (Conditional)

Each bullet is gated by the §12 closure decision. A KILL decision satisfies 066b's DoD by default (no code changes); `§12.1` must be filled in.

**Closure Review (Phase 0 — always required)**
- [ ] Telemetry pulled from Sentry covering the full pilot window.
- [ ] Per-site trip counts (distinct-operator) recorded in §12.1.
- [ ] Closure decision entered in §12.1 with date and reviewer.
- [ ] PRD-065 status re-checked — if Draft→In-Progress, coordinate WS2b scoping.

**Remediation (Phase 1 — conditional on closure decision)**
- [ ] All sites named in the closure decision call `failSilentGuard(...)` with correct severity.
- [ ] `handleMovePlayer` bare `logError(...)` removed (if WS2b executes).
- [ ] `setSaveErrorBanner(null)` added to close and move try blocks (if WS2b executes).
- [ ] `// TODO(EXEC-066b)` markers removed from remediated sites.
- [ ] Non-remediated sites (KILL or REDUCE-skipped) have their pragmas rewritten per FR-5 — durable closure citation, no lingering TODO.
- [ ] `grep -rn "TODO(EXEC-066b)" components/` returns zero hits at spec close.
- [ ] `components/pit-panels/__tests__/silent-guard-siblings.test.tsx` passes (if WS2b executes).
- [ ] `npm run type-check` passes; `npm run lint` passes.

**Regression Gate (Phase 2 — conditional)**
- [ ] `e2e/silent-guard-regression.spec.ts` green for all remediated severities.
- [ ] `e2e/repro-mtl-glitch.spec.ts` still green (bundled in the gate command).

**Governance**
- [ ] ISSUE-BDD7B21D link updated to reflect 066b closure (if the remaining sites are KILLed, BDD7B21D is fully resolved; if remediated, add a resolution-addendum commit).
- [ ] `.claude/CLAUDE.md` "Critical Guardrails" INV-WRITE-PATH-OPERATOR-VISIBILITY entry updated with link to 066b closure decision.
- [ ] PRD-064 §2.3 footnote updated with 066b closure outcome.

**Explicit non-DoD**
- [ ] 066b does NOT revisit scope beyond the 6 sites in §2.1.
- [ ] 066b does NOT upgrade to P0 any site that telemetry shows as not-tripping. The closure rule is decisive.

---

## 7. Risks

- **R-1 (Medium):** Pilot window too short for meaningful signal. Mitigation: §12.2 interim review at pilot week 4 with the option to extend the gate rather than auto-proceed.
- **R-2 (Low):** Sentry breadcrumb volume from 066a's `handleSave` remediation dominates; signal from other sites is drowned. Mitigation: §12 closure query dimensions by `(component, action, reason)`, not by aggregate count.
- **R-3 (Medium):** PRD-065 lands between 066a and 066b and restructures `pit-panels-client.tsx`. WS2b's line references rot. Mitigation: Phase 0 re-checks PRD-065 status; line numbers are indicative not normative.
- **R-4 (Low):** Developer-surface drift — TODO markers attract scope-creep edits during the pilot window. Mitigation: §12 makes the markers load-bearing — `grep -rn "TODO(EXEC-066b)"` must reconcile against §2.1 site list at closure. Any drift is a CI-detected issue.
- **R-5 (Low):** KILL decision is later contradicted by a real production trip. Mitigation: pragmas under KILL cite the closure decision date; a future trip is a signal to re-open, not a governance failure.

---

## 8. Related Documents

- **Prerequisite:** `docs/21-exec-spec/EXEC-066a-silent-guard-foundation.md` — utility, lint rule, BDD7B21D remediation, telemetry emission.
- **Parent PRD:** `docs/10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md` — §2.3 deferred the full sweep.
- **Sequencing dependency:** `docs/10-prd/PRD-065-adr049-operator-atomicity-save-with-buyin-v0.md` — re-check status at Phase 0.
- **Parallel ADR:** `docs/80-adrs/ADR-049-operator-action-atomicity-boundary.md`.
- **Telemetry source:** `docs/21-exec-spec/EXEC-063-sentry-error-tracking.md` (Sentry wiring).
- **Governance:** ADR-044 + `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`.

---

## 11. Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| v0.1 | 2026-04-17 | Lead Architect | Created as 066b by splitting EXEC-066 v0.2. Contents: the 6 deferred sites from 066a §2.2; conditional workstreams gated by §12 Closure Criteria; Sentry-based decision rule with KILL / REDUCE / PROCEED outcomes. Rationale: "post-pilot cleanup" drifts into ceremonial hardening; telemetry gating with explicit kill criteria closes or reduces the backlog on evidence. |

---

## 12. Closure Criteria

**This is the load-bearing section.** 066b does not execute until §12.1 is filled in by the lead-architect at EXEC-066a pilot end.

### 12.0 Decision rule

At pilot end (minimum 4 weeks after 066a ships), query Sentry for all
breadcrumbs in the category `silent-guard` emitted during the pilot
window. Dimension by `(component, action, reason)` and by distinct
operator (not raw event count).

Apply the following rules **in order** — first match wins:

1. **Zero breadcrumbs across all 6 §2.1 sites** → **KILL 066b entirely.**
   Rewrite each site's pragma per FR-5 with the closure citation
   `"closure=KILL — zero pilot trips"`. Close this spec. The lint rule
   from 066a remains as belt-and-suspenders regression prevention.

2. **Any single site has ≥ 5 distinct operators tripping the guard**
   → **PROCEED on that site specifically.** Other sites evaluated by
   the remaining rules.

3. **Pit-panels sibling sites (`handleCloseSession`,
   `handleMovePlayer`) trip at any measurable rate** → **Upgrade those
   sites to P0; remediate regardless of operator count.** These siblings
   share the BDD7B21D surface and the same failure class; a single trip
   is material.

4. **Aggregate trips across all non-upgraded sites < 0.1% of
   operator-session count** → **REDUCE 066b** to only the sites
   individually satisfying rule 2 or 3. All other sites get the KILL
   treatment per rule 1.

5. **Aggregate trips ≥ 0.1% of operator-session count** → **PROCEED**
   on all sites.

"Operator-session count" is the number of distinct operator sessions
started during the pilot window per the Sentry session tracking or
equivalent analytics source.

### 12.1 Pilot telemetry & decision (to be filled in at closure review)

```
Pilot window: <start date> → <end date>
Operator-session count: <N>
Reviewer: <name>
Decision date: <YYYY-MM-DD>

Per-site trip counts (distinct-operator):
  1. handleCloseSession (pit-panels):       <count>
  2. handleMovePlayer (pit-panels):         <count>
  3. handlePauseSession (rating-slip):      <count>
  4. handleResumeSession (rating-slip):     <count>
  5. handleStartRundown (session-action):   <count>
  6. threshold-settings-form.handleSave:    <count>

Applied rule: <1 KILL / 2 PROCEED(site) / 3 P0 UPGRADE / 4 REDUCE / 5 PROCEED ALL>

Decision: <KILL | REDUCE(<site-list>) | PROCEED>

Sites to remediate: <list — empty for KILL>

PRD-065 status at decision date: <Draft | In-Progress | Shipped>
PRD-065 impact: <none | re-scope WS2b to <new topology>>

Signed: <lead-architect>
```

### 12.2 Interim review (pilot week 4)

At pilot week 4, the lead-architect performs an interim read of the
Sentry data. If the operator-session count is below a reasonable
statistical threshold (proposed: <100 sessions), extend the gate
window by 2 weeks rather than apply §12.0 on underpowered data.

Interim review does not produce a decision; it extends or confirms
the closure date. Document interim review at §12.3 as an appended
dated block.

### 12.3 Interim review log

```
(empty until first interim review)
```

---
prd: PRD-079
id: EXEC-079
title: "Financial Telemetry Wave 1 Phase 1.5 — Rollout & Sign-off"
fib_h_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-5/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-5-ROLLOUT-SIGNOFF.md
fib_s_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-5/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-5-ROLLOUT-SIGNOFF.json
fib_s_loaded: true
status: draft
phase: "Wave 1 Phase 1.5"
slug: financial-telemetry-wave1-phase1.5-rollout-signoff
created: 2026-05-04
precondition_gate: "EXEC-078 closed commit 05e34782 — lint enforcement active, test:surface available, I5 truth-telling spec authored at e2e/financial-enforcement.spec.ts, ROLLOUT-TRACKER.json cursor at active_phase 1.5"

complexity_prescreen: streamlined
complexity_override: "user-override from full"
write_path_classification: none
gov010_check: "waived:release-validation-no-new-arch; FIB pair substitutes for scaffold+ADR refs; no new bounded contexts"

open_question_decisions:
  SMOKE_IDS:
    question: "Q1 — Which known production or validation IDs, query params, and authenticated role will EXEC-079 use for the five Gate 4 Smoke Matrix routes?"
    resolution: at-execution-time
    decision: |
      The devops-pt2 executor resolves production IDs at execution time by authenticating
      against the hosted Supabase project vaicxfihdldgepzryhpd and querying for valid
      records: a player_id with recent session data, a visit_id in live or recent state,
      and a gaming_day with shift-intelligence alerts where metricType is one of
      drop_total, cash_obs_total, or win_loss_cents (not hold_percent). Authenticated
      role must be a staff member with pit_boss or floor_supervisor privileges.
      The executor records the exact player_id, visit_id, gaming_day, staff role,
      deployment SHA, and timestamp in the Gate 4 smoke matrix section of
      WAVE-1-PHASE-1.5-SIGNOFF.md before executing any smoke check. IDs must not
      be fabricated; they must come from querying the actual production database.
    verification: assumption
    rationale: "Production record IDs cannot be hardcoded in a spec document. PRD §Appendix A Gate 4 Smoke Matrix already requires recording route, query params, authenticated role, source ID, deployment URL/SHA, status code, timestamp, and JSON paths — this decision specifies how the executor satisfies those required fields."

  BLOCKING_GATE_EVIDENCE:
    question: "Q2 — What PR/check source is authoritative for blocking gate evidence when branch protection is not configured?"
    resolution: local-command-with-sha
    decision: |
      Local execution of npm run lint, npm run type-check, and npm run build on the
      ref/financial-standard branch HEAD is the authoritative blocking gate evidence
      source. The executor records for each command: (1) branch HEAD commit SHA from
      git log --oneline -1, (2) command name, (3) exit code, (4) ISO-8601 timestamp.
      GitHub PR check status from any available CI runs is supplementary evidence.
      If GitHub check status is available and green, it is recorded alongside local
      results. If unavailable (no branch protection, no required checks), local results
      with SHA are sufficient per PRD §5.1 FR-3.
    verification: cited
    rationale: "PRD §5.1 FR-3 and FIB-S REQ-2 require blocking gates to pass before merge but do not require branch protection enforcement. Branch protection absence is an explicit Wave 2 prerequisite documented in FIB-H §G and PRD Appendix B."

workstreams:
  WS1:
    name: Preview Authentication Unblock
    executor: devops-pt2
    executor_type: skill
    depends_on: []
    bounded_context: infrastructure
    estimated_complexity: low
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md
    gate: gate-1-preview-auth
    traces_to: [CAP-1]

  WS2:
    name: Blocking and Advisory Validation
    executor: qa-specialist
    executor_type: skill
    depends_on: [WS1]
    bounded_context: release-validation
    estimated_complexity: low
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md
    gate: gate-2-validation
    traces_to: [CAP-2, CAP-3]

  WS3:
    name: Operator Interpretability Walkthrough
    executor: qa-specialist
    executor_type: skill
    depends_on: [WS2]
    bounded_context: release-validation
    estimated_complexity: low
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md
    gate: gate-3-operator-signoff
    traces_to: [CAP-4]

  WS4:
    name: Production Merge, Deploy, and Smoke Check
    executor: devops-pt2
    executor_type: skill
    depends_on: [WS3]
    bounded_context: infrastructure
    estimated_complexity: low
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md
    gate: gate-4-production-smoke
    traces_to: [CAP-5]

  WS5:
    name: Wave 1 Retrospective and Rollout Closure
    executor: lead-architect
    executor_type: skill
    depends_on: [WS4]
    bounded_context: documentation
    estimated_complexity: medium
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md
    gate: gate-4-production
    traces_to: [CAP-6]

execution_phases:
  - name: "Phase 1 — Preview Authentication Unblock"
    parallel: [WS1]
    gate: gate-1-preview-auth
  - name: "Phase 2 — Blocking and Advisory Validation"
    parallel: [WS2]
    gate: gate-2-validation
  - name: "Phase 3 — Operator Walkthrough Sign-off"
    parallel: [WS3]
    gate: gate-3-operator-signoff
  - name: "Phase 4 — Production Release and Smoke Check"
    parallel: [WS4]
    gate: gate-4-production-smoke
  - name: "Phase 5 — Retrospective and Rollout Closure"
    parallel: [WS5]
    gate: gate-4-production

gates:
  gate-0-preview-surface:
    type: hard-stop
    embedded_in: WS1
    description: "Deployment identity and auth viability baseline. Must pass before Gate 1 credential checks begin."
    checks:
      - "Vercel deployment for PR confirmed labeled Preview in Vercel metadata (not Production-tagged)"
      - "PR Preview deployment does not return middleware HTTP 500"
      - "Supabase auth path reachable on PR Preview deployment"
      - "Supabase authentication succeeds on PR Preview URL"
      - "Financial routes return data on PR Preview URL"
      - "Vercel deployment label or metadata recorded as evidence (URL shape alone is insufficient)"
      - "Production-tagged Vercel deployment URL confirmed not in use as validation surface"
      - "Shared-database mutation risk recorded before validation begins"
      - "Preview validation declared read-only against shared production Supabase project"
    failure_action: "Halt Phase 1.5 until Preview surface is functional and correctly identified as Preview-type. Gate 1 is invalid until Gate 0 passes."

  gate-1-preview-auth:
    type: human-approval
    description: "Preview credentials confirmed, shared-DB caveat recorded, auth succeeds on verified Preview surface."
    checks:
      - "NEXT_PUBLIC_SUPABASE_URL present in Vercel Preview environment"
      - "NEXT_PUBLIC_SUPABASE_ANON_KEY present in Vercel Preview environment"
      - "SUPABASE_SERVICE_ROLE_KEY disposition recorded: not needed, or conditionally added with exact server-path rationale"
      - "If SUPABASE_SERVICE_ROLE_KEY is conditionally added, confirmed absent from logs, screenshots, PR comments, client bundle"
      - "PR Preview deployment URL loads authenticated Supabase-backed financial surfaces"
      - "Shared-database caveat recorded: Preview and production both point to vaicxfihdldgepzryhpd"
      - "Gate 0 evidence (deployment label/metadata) recorded as part of Gate 1 artifact"
      - "WAVE-1-PHASE-1.5-SIGNOFF.md Gate 0 and Gate 1 sections complete"
    failure_action: "Halt. Fix Preview authentication before proceeding to validation."

  gate-2-validation:
    type: human-approval
    description: "Blocking gates green. Advisory results recorded with written disposition for any failures."
    checks:
      - "npm run lint exits 0 (branch HEAD SHA recorded)"
      - "npm run type-check exits 0 (branch HEAD SHA recorded)"
      - "npm run build exits 0 (branch HEAD SHA recorded)"
      - "npm run test:surface result recorded (pass or fail)"
      - "E2E I5-1 result recorded (pass or fail)"
      - "E2E I5-2 result recorded (pass or fail)"
      - "Every advisory failure has explicit written engineering-lead merge justification in Gate 2 section"
      - "WAVE-1-PHASE-1.5-SIGNOFF.md Gate 2 section complete"
    failure_action: "Blocking gate failure is a hard stop. Advisory failure without written disposition blocks walkthrough but does not require aborting if disposition is provided."

  gate-3-operator-signoff:
    type: human-approval
    description: "Operator confirms all four interpretability checks on confirmed PR Preview URL."
    checks:
      - "Walkthrough performed by pit boss or floor supervisor (not engineering)"
      - "Walkthrough performed on confirmed PR Preview URL (not Production-tagged)"
      - "Operator confirms no production data mutation actions were performed during walkthrough"
      - "Shift dashboard reviewed and authority-label comprehension recorded"
      - "Player 360 reviewed and completeness-state distinction recorded"
      - "Rating slip modal reviewed and non-authoritative-total interpretation recorded"
      - "Compliance view reviewed and split-display interpretability recorded"
      - "WAVE-1-PHASE-1.5-SIGNOFF.md Gate 3 section signed by operator"
    failure_action: "Halt. Bounded rendering bugs in existing Wave 1 scope may be fixed and re-walked. New interpretability requirements require FIB amendment."

  gate-4-production-smoke:
    type: human-approval
    description: "PR merged, production deployed, all 5 smoke routes verified."
    checks:
      - "PR merged to main only after Gates 0-3 all satisfied"
      - "Pre-merge smoke path dry-run passed on confirmed PR Preview URL"
      - "Vercel production deployment verified at pt-2-weld.vercel.app"
      - "Three envelope routes confirm FinancialValue shape at exact JSON paths"
      - "Two bare-number sanity routes confirm 200 response with expected shape (no FinancialValue assertions)"
      - "All 5 smoke records include required evidence fields per PRD §4.2"
      - "WAVE-1-PHASE-1.5-SIGNOFF.md Gate 4 smoke matrix section complete"
    failure_action: "Engineering lead reverts merge commit if production smoke fails, waits for Vercel production redeploy of the revert, and records revert commit SHA plus production health evidence. Remove Preview env vars only if the Preview validation surface itself must be disabled."

  gate-4-production:
    type: human-approval
    description: "Wave 1 retrospective authored. Rollout tracking artifacts updated and synchronized. Wave 1 closed."
    checks:
      - "WAVE-1-PHASE-1.5-SIGNOFF.md retrospective section complete and truthful"
      - "CI/CD gap register recorded as Wave 2 prerequisites"
      - "Q1-Q4 deferral rationale documented"
      - "Release notes cite SRC, ADR-052, ADR-053, ADR-054, ADR-055"
      - "Shared-database caveat documented with vaicxfihdldgepzryhpd"
      - "Advisor findings recorded without remediation action"
      - "Wave 2 prerequisite register complete (PRD Appendix B items)"
      - "ROLLOUT-TRACKER.json cursor updated to Phase 1.5 complete, wave_1_status closed"
      - "ROLLOUT-PROGRESS.md synchronized"
    failure_action: "Complete retrospective and tracker updates before closing Wave 1."
---

# EXEC-079 — Financial Telemetry Wave 1 Phase 1.5: Rollout & Sign-off

## Overview

Phase 1.5 is the Wave 1 release procedure. Phases 1.1 through 1.4 delivered the SRC label envelope, integer-cents canonicalization, API contract expansion, UI split displays, and enforcement tests on the `ref/financial-standard` branch. Phase 1.5 does not add or modify any of those artifacts. Its purpose is to close Wave 1 by taking the completed branch through a structured, gate-sequenced release procedure: unblocking Preview authentication, validating the PR through blocking and advisory gates, obtaining operator interpretability sign-off on the hosted Preview, merging to `main`, smoke-checking production API envelope shape, and recording a truthful Wave 1 retrospective.

The primary work of this phase is human-verified sign-off procedure with operator authority. The infrastructure prerequisite — adding the missing Supabase credentials required for Preview authentication to the Vercel Preview environment — is the minimal change that makes the validation surface usable before merge. Without it, the operator walkthrough cannot be performed on the hosted Preview, which inverts the release gate: production would receive Wave 1 before operator sign-off.

**Scope boundary (hard):** This EXEC-SPEC may not author service, DTO, API, OpenAPI, UI component, schema, RLS, or CI/CD workflow changes. The only infrastructure change allowed is adding the required Preview Supabase credentials, with `SUPABASE_SERVICE_ROLE_KEY` conditional per WS1. If any workstream executor proposes touching a frozen application or infrastructure contract beyond the Preview env vars, execution halts and requires a FIB amendment before continuing.

**Precondition gate:** EXEC-078 closed at commit `05e34782`. Lint enforcement active. `test:surface` script available in `package.json`. I5 truth-telling spec authored at `e2e/financial-enforcement.spec.ts`. `ROLLOUT-TRACKER.json` cursor at `active_phase: "1.5"`, `phase_status: "not_started"`.

---

## Intake Traceability

**FIB-S:** `FIB-S-FIN-ROLLOUT-1.5` (loaded at pipeline intake)

| Workstream | Traces To | FIB-S Requirements | FIB-S Acceptance |
|-----------|-----------|-------------------|-----------------|
| WS1 | CAP-1 | REQ-1 | AC-1 |
| WS2 | CAP-2, CAP-3 | REQ-2, REQ-3 | AC-2, AC-3 |
| WS3 | CAP-4 | REQ-4 | AC-4 |
| WS4 | CAP-5 | REQ-5, REQ-6 | AC-5 |
| WS5 | CAP-6 | REQ-7 | AC-6 |

All 6 FIB-S capabilities covered. Anti-invention boundary: no new operator-visible surfaces, public API routes, DTO shapes, UI components, schema objects, RLS policies, or CI/CD workflow changes.

---

## Resolved Open Questions

### DEC-1: Smoke Check IDs and Authenticated Role

**Decision:** Production IDs resolved at execution time.

The devops-pt2 executor must query the hosted Supabase project `vaicxfihdldgepzryhpd` at execution time to identify:
- A `player_id` with recent session data (for `recent-sessions` route)
- A `visit_id` in live or recently-closed state (for `live-view` route)
- A `gaming_day` with at least one alert whose response item has `metricType` in `{drop_total, cash_obs_total, win_loss_cents}` (for `alerts` route). The route does not accept a `metricType` query parameter; the executor filters the returned `data.alerts` array in the smoke assertion.
- A `rating_slip_id` with modal data (for `modal-data` route)
- A `visit_id` with financial summary data (for `financial-summary` route)
- An authenticated staff role: pit_boss or floor_supervisor

The executor records all IDs/params, the authenticated role, production deployment SHA, and query timestamps in the Gate 4 smoke matrix section of `WAVE-1-PHASE-1.5-SIGNOFF.md` before executing any smoke check. IDs must come from the actual production database — fabricated values are not valid evidence.

**Verification: `assumption`** — Assumes the production database contains sufficient data for all five routes. If a route has no matching data (e.g., no active alerts with an allowed financial `metricType`), record the gap in Gate 4 evidence. Do not substitute a carve-out route (e.g., `hold_percent`) to satisfy the check.

### DEC-2: Blocking Gate Evidence Without Branch Protection

**Decision:** Local command execution with recorded commit SHA is authoritative.

The qa-specialist executor runs `npm run lint`, `npm run type-check`, and `npm run build` locally on the `ref/financial-standard` branch HEAD. For each command, record:
1. Branch HEAD commit SHA — `git log --oneline -1`
2. Command name
3. Exit code
4. ISO-8601 timestamp

If GitHub PR check status is available from any triggered CI run, record it alongside local results as supplementary evidence. If branch protection is absent and no required checks run on the PR, local results with SHA are sufficient per PRD §5.1 FR-3 and FIB-S REQ-2.

**Verification: `cited`** — PRD §5.1 FR-3 requires blocking gates to pass before merge. Branch protection absence is an explicit Wave 2 prerequisite documented in PRD Appendix B and FIB-H §G.

---

## Workstream Specifications

### WS1: Preview Authentication Unblock

**Executor:** `devops-pt2`
**Phase:** 1
**Depends on:** none

**Objective:** Add the missing Supabase credentials required for Preview authentication to the Vercel Preview environment for project `pt-2`. Verify the PR Preview deployment authenticates correctly and is confirmed Preview-labeled (not Production-tagged). Complete Gate 0 (deployment identity + auth viability baseline) and Gate 1 (credential confirmation + shared-DB caveat). Create `WAVE-1-PHASE-1.5-SIGNOFF.md` with Gate 0 and Gate 1 sections populated.

**Environment variable additions:**

Add the two public Supabase variables below to the Vercel Preview environment for project `pt-2`. Values are the same as the existing production environment — both point to `vaicxfihdldgepzryhpd`:

```
NEXT_PUBLIC_SUPABASE_URL       public; safe for client bundle
NEXT_PUBLIC_SUPABASE_ANON_KEY  public; safe for client bundle
```

Add via Vercel CLI (scoped to Preview environment only):
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
```

**Conditional service-role secret rule:**
`SUPABASE_SERVICE_ROLE_KEY` is not added by default. Add it to Preview only if the confirmed
Preview deployment still fails after the two public variables are present and the executor records:
(1) the exact failing server path or route, (2) why that path requires service-role access, and
(3) confirmation that the key remains server-only. If no specific server path requires it, do not
add `SUPABASE_SERVICE_ROLE_KEY` to Preview.

After adding, trigger a redeploy or wait for Vercel to create a new deployment for the PR.

**Gate 0 verification (hard stop — all items must pass before Gate 1 checks begin):**

1. Confirm the Vercel deployment for the PR is labeled **Preview** in Vercel metadata — not inferred from URL shape alone. Evidence must be Vercel dashboard metadata or `vercel ls` output showing deployment type.
2. Confirm the PR Preview deployment does not return middleware HTTP 500. Evidence: direct HTTP check showing non-500 response before page code.
3. Confirm the Supabase auth path is reachable on the PR Preview deployment.
4. Confirm Supabase authentication succeeds on the PR Preview URL (can sign in and reach protected routes).
5. Confirm financial routes return data on the PR Preview URL.
6. Confirm whether `SUPABASE_SERVICE_ROLE_KEY` was needed. If added conditionally, record the exact server path requiring it and confirm it is server-only — not present in any browser network tab, visible log, or PR artifact. If not needed, record that it was not added to Preview.
7. Record that Preview and production both point to `vaicxfihdldgepzryhpd` as the shared-database mutation caveat.
8. Confirm Preview validation is read-only against `vaicxfihdldgepzryhpd`. Do not perform start, close, edit, acknowledge, import, setup, admin, or any other mutation action during Gate 0 through Gate 3. If any required validation needs a write, halt Phase 1.5 until staging isolation exists or the FIB is amended.

If any Gate 0 item fails, Phase 1.5 halts. Gate 1 is invalid until Gate 0 passes completely.

**WAVE-1-PHASE-1.5-SIGNOFF.md — WS1 creates this file:**

Path: `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md`

WS1 creates the file with the full template structure below and populates Gate 0 and Gate 1 sections. Subsequent workstreams fill their respective sections.

```markdown
---
id: WAVE-1-PHASE-1.5-SIGNOFF
phase: "Wave 1 Phase 1.5"
exec_ref: EXEC-079
prd_ref: PRD-079
created: {YYYY-MM-DD}
status: in-progress
---

# Wave 1 Phase 1.5 Sign-off Record

## Gate 0: Preview Surface Verification

| Check | Status | Evidence |
|-------|--------|----------|
| Vercel deployment labeled Preview (not Production-tagged) | {pass/fail} | {ref} |
| Middleware HTTP 500 resolved | {pass/fail} | {ref} |
| Supabase auth path reachable | {pass/fail} | {ref} |
| Supabase authentication succeeds | {pass/fail} | {ref} |
| Financial routes return data | {pass/fail} | {ref} |
| Deployment label/metadata recorded as evidence | {pass/fail} | {ref} |
| Production-tagged URL confirmed not in use | {pass/fail} | {ref} |
| Shared-database mutation risk recorded | {pass/fail} | {ref} |
| Preview validation declared read-only against shared DB | {pass/fail} | {ref} |

**Gate 0 result:** {PASS / FAIL}

---

## Gate 1: Preview Auth

| Check | Status | Evidence |
|-------|--------|----------|
| NEXT_PUBLIC_SUPABASE_URL added to Vercel Preview | {pass/fail} | {ref} |
| NEXT_PUBLIC_SUPABASE_ANON_KEY added to Vercel Preview | {pass/fail} | {ref} |
| SUPABASE_SERVICE_ROLE_KEY disposition recorded | {not-needed / conditionally-added / fail} | {if added: exact server path + rationale; if not: not added} |
| SUPABASE_SERVICE_ROLE_KEY confirmed absent from logs/screenshots/PR | {pass/fail/n-a} | {ref} |
| PR Preview URL loads authenticated financial surfaces | {pass/fail} | {ref} |
| Shared-database caveat recorded | pass | vaicxfihdldgepzryhpd shared between Preview and production |

**Shared-database caveat:** Preview and production both point to Supabase project `vaicxfihdldgepzryhpd`.
No validation writes may be performed during Gate 0 through Gate 3. Any attempted write would affect
the live remote database and invalidates Phase 1.5 until staging isolation exists or the FIB is amended.

**Read-only validation rule:** Because Preview and production share `vaicxfihdldgepzryhpd`,
Gate 0 through Gate 3 must not perform production data mutations. If a required validation step
would mutate data, Phase 1.5 halts until staging isolation exists or the FIB is amended.

**Gate 1 result:** {PASS / FAIL}
**PR Preview URL:** {url}

---

## Gate 2: Validation

{WS2 fills this section}

---

## Gate 3: Operator Sign-off

{WS3 fills this section}

---

## Gate 4: Production Release and Smoke Check

{WS4 fills this section}

---

## Wave 1 Retrospective

{WS5 fills this section}
```

**Acceptance criteria:**
- [ ] FIB-S REQ-1, AC-1: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` present in Vercel Preview environment for project `pt-2`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` Preview disposition recorded: not added unless a specific server path requires it; if added, exact path and server-only evidence recorded
- [ ] Gate 0: Vercel deployment confirmed labeled Preview in Vercel metadata — URL shape alone is not sufficient evidence
- [ ] Gate 0: PR Preview no longer returns middleware HTTP 500
- [ ] Gate 0: Supabase authentication succeeds on confirmed PR Preview URL
- [ ] Gate 0: Financial routes return data on PR Preview URL
- [ ] If `SUPABASE_SERVICE_ROLE_KEY` was conditionally added, it is confirmed server-only — absent from logs, screenshots, PR comments, client bundle; otherwise recorded as n/a
- [ ] Shared-database caveat (`vaicxfihdldgepzryhpd`) recorded before any walkthrough; no validation data may be written during Gate 0 through Gate 3
- [ ] Preview validation declared read-only against `vaicxfihdldgepzryhpd`; mutation actions are prohibited through Gate 3
- [ ] `WAVE-1-PHASE-1.5-SIGNOFF.md` created with Gate 0 and Gate 1 sections populated

**Outputs:**
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md` (created; Gate 0 + Gate 1 sections filled)

---

### WS2: Blocking and Advisory Validation

**Executor:** `qa-specialist`
**Phase:** 2
**Depends on:** WS1 (Gate 1 must pass before this workstream begins)

**Objective:** Run blocking validation gates (lint, type-check, build) on the `ref/financial-standard` branch HEAD and record results per DEC-2. Run advisory validation (test:surface, E2E I5-1/I5-2) and record results. Require written engineering-lead merge justification for every advisory failure before walkthrough proceeds. Populate the Gate 2 section of `WAVE-1-PHASE-1.5-SIGNOFF.md`.

**Blocking gate execution:**

Per agent shell safety rules, redirect all output to `/tmp` before reading results:

```bash
# Capture HEAD SHA
git log --oneline -1 > /tmp/exec-079-head-sha.log 2>&1
# Read /tmp/exec-079-head-sha.log to record SHA

# Gate 1: Lint
npm run lint > /tmp/exec-079-lint.log 2>&1
# Read /tmp/exec-079-lint.log — must exit 0

# Gate 2: Type check
npm run type-check > /tmp/exec-079-type-check.log 2>&1
# Read /tmp/exec-079-type-check.log — must exit 0

# Gate 3: Build
npm run build > /tmp/exec-079-build.log 2>&1
# Read /tmp/exec-079-build.log — must exit 0
```

If any blocking gate exits non-zero, WS2 halts immediately. Blocking gate failure is a hard stop — the walkthrough does not proceed. The failure must be investigated and corrected within existing Wave 1 scope before re-running.

**Advisory validation execution:**

```bash
# Advisory: surface tests
npm run test:surface > /tmp/exec-079-test-surface.log 2>&1
# Read /tmp/exec-079-test-surface.log — record result (pass or fail)

# Advisory: E2E I5 truth-telling (both scenarios in one run)
npx playwright test e2e/financial-enforcement.spec.ts --reporter=list > /tmp/exec-079-e2e-i5.log 2>&1
# Read /tmp/exec-079-e2e-i5.log — record I5-1 and I5-2 results separately
```

Advisory failures do not automatically block merge. Each failure requires explicit written engineering-lead merge justification recorded in the Gate 2 section of `WAVE-1-PHASE-1.5-SIGNOFF.md` before the walkthrough proceeds. Silent acceptance is not valid (FIB-H §D).

**Gate 2 section template (WS2 fills):**

```markdown
## Gate 2: Validation

**Branch HEAD commit SHA:** {sha}
**Date:** {YYYY-MM-DDThh:mm:ssZ}

### Blocking Gates

| Gate | Command | Exit Code | SHA | Timestamp | Result |
|------|---------|-----------|-----|-----------|--------|
| Lint | npm run lint | {0/N} | {sha} | {ts} | {PASS/FAIL} |
| Type Check | npm run type-check | {0/N} | {sha} | {ts} | {PASS/FAIL} |
| Build | npm run build | {0/N} | {sha} | {ts} | {PASS/FAIL} |

### Advisory Gates

| Gate | Command | Result | Engineering-Lead Disposition |
|------|---------|--------|------------------------------|
| Surface tests | npm run test:surface | {pass/fail} | {n/a if pass; written justification if fail} |
| E2E I5-1 | e2e/financial-enforcement.spec.ts — I5 Scenario 1 | {pass/fail} | {n/a if pass; written justification if fail} |
| E2E I5-2 | e2e/financial-enforcement.spec.ts — I5 Scenario 2 | {pass/fail} | {n/a if pass; written justification if fail} |

**Gate 2 result:** {PASS / FAIL}
```

**Acceptance criteria:**
- [ ] FIB-S REQ-2, AC-2: `npm run lint` exits 0 — result recorded with branch HEAD commit SHA
- [ ] FIB-S REQ-2, AC-2: `npm run type-check` exits 0 — result recorded with branch HEAD commit SHA
- [ ] FIB-S REQ-2, AC-2: `npm run build` exits 0 — result recorded with branch HEAD commit SHA
- [ ] FIB-S REQ-3, AC-3: `npm run test:surface` result recorded (pass or fail) with disposition
- [ ] FIB-S REQ-3, AC-3: E2E I5-1 result recorded (pass or fail) with disposition
- [ ] FIB-S REQ-3, AC-3: E2E I5-2 result recorded (pass or fail) with disposition
- [ ] FIB-S REQ-3, AC-3: Every advisory failure has explicit written engineering-lead merge justification in Gate 2 section before walkthrough proceeds
- [ ] Gate 2 section of `WAVE-1-PHASE-1.5-SIGNOFF.md` complete

**Outputs:**
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md` (Gate 2 section populated)

---

### WS3: Operator Interpretability Walkthrough

**Executor:** `qa-specialist`
**Phase:** 3
**Depends on:** WS2 (Gate 2 must pass — all blocking gates green, advisory disposition complete)

**Objective:** Coordinate and record the operator walkthrough on the confirmed PR Preview URL. A pit boss or floor supervisor reviews the four named financial surfaces and records interpretability judgments for all four checks. Populate the Gate 3 section of `WAVE-1-PHASE-1.5-SIGNOFF.md`.

**Pre-walkthrough requirements:**
- Gate 2 passed (blocking gates green, advisory disposition complete)
- Walkthrough surface must be the PR Preview URL confirmed as Preview-labeled in Gate 0 — not a Production-tagged Vercel deployment
- Operator must be a pit boss or floor supervisor — engineering staff cannot serve as the walkthrough operator
- Walkthrough is read-only against shared production Supabase project `vaicxfihdldgepzryhpd`; the operator must not start, close, edit, acknowledge, import, setup, admin-change, or otherwise mutate production data during the walkthrough

**Surfaces to walk (all four required):**

| Surface | Route hint | What the operator confirms |
|---------|-----------|---------------------------|
| Shift dashboard | `/` or `/shift-dashboard` | Authority labels are understood without explanation |
| Player 360 | `/players/[id]` | Completeness states (`complete`, `partial`, `unknown`) are visually distinguishable |
| Rating slip modal | Player session → open rating slip → modal | No surface implies an authoritative total where only estimated/partial/unknown values exist |
| Compliance view | `/compliance` or equivalent | Split rated-vs-estimated displays read as two distinct fact classes, not components of one total |

**Four interpretability checks (operator records each explicitly):**

1. **Authority-label comprehension:** Do labels such as `actual`, `estimated`, `observed` make sense to the operator without engineering explanation?
2. **Completeness-state distinction:** Are `complete`, `partial`, and `unknown` states visually distinguishable from one another on at least one surface?
3. **Non-authoritative-total interpretation:** Does any surface imply a definitive or settlement-final figure where only estimated, partial, or unknown values exist? (Expected answer: no)
4. **Split-display interpretability:** Are rated-vs-estimated split displays understood as two distinct fact classes — not as additive components of one authoritative total?

**Sign-off failure handling:**
- If the operator finds a defect that is a bounded rendering bug within already-delivered Phase 1.3/1.4 scope, it may be fixed and the walkthrough repeated without FIB amendment.
- If the operator identifies a new interpretability requirement not addressed by Phase 1.3 behavior, execution halts and a FIB amendment is required before proceeding.

**Gate 3 section template (WS3 fills):**

```markdown
## Gate 3: Operator Sign-off

**Operator:** {name} — {role: pit boss / floor supervisor}
**Date:** {YYYY-MM-DDThh:mm:ssZ}
**Preview URL:** {url}
**Deployment type confirmed:** Preview (Gate 0 evidence recorded in Gate 1 section)

### Surfaces Reviewed

| Surface | Reviewed | Operator Notes |
|---------|----------|----------------|
| Shift dashboard | {yes/no} | {notes} |
| Player 360 | {yes/no} | {notes} |
| Rating slip modal | {yes/no} | {notes} |
| Compliance view | {yes/no} | {notes} |

### Interpretability Checks

| Check | Result | Operator Statement |
|-------|--------|--------------------|
| Authority-label comprehension | {pass/fail} | {operator's words} |
| Completeness-state distinction | {pass/fail} | {operator's words} |
| Non-authoritative-total interpretation | {pass/fail} | {operator's words} |
| Split-display interpretability | {pass/fail} | {operator's words} |

**Operator sign-off:** {APPROVED / DEFECTS FOUND}
**No-mutation attestation:** {Operator confirms no production data mutation actions were performed / FAIL}
**Walkthrough audit window:** {start timestamp} to {end timestamp}; {evidence ref or n/a if no audit source available}

{If defects found: list each defect and classify as:
  - bounded-bug: fixable within Wave 1 scope; describe fix and re-walk plan
  - new-requirement: FIB amendment required; execution halts}

**Gate 3 result:** {PASS / FAIL}
```

**Acceptance criteria:**
- [ ] FIB-S REQ-4, AC-4: Walkthrough operator is a pit boss or floor supervisor (not engineering)
- [ ] FIB-S REQ-4, AC-4: Walkthrough performed on confirmed PR Preview URL (not Production-tagged Vercel deployment)
- [ ] Walkthrough no-mutation attestation recorded; any observed mutation during walkthrough window fails Gate 3
- [ ] FIB-S REQ-4, AC-4: All four surfaces reviewed: shift dashboard, player 360, rating slip modal, compliance view
- [ ] FIB-S REQ-4, AC-4: All four interpretability checks recorded with explicit operator statement
- [ ] FIB-S REQ-4, AC-4: Gate 3 section of `WAVE-1-PHASE-1.5-SIGNOFF.md` signed off with operator name and role

**Outputs:**
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md` (Gate 3 section populated and operator-signed)

---

### WS4: Production Merge, Deploy, and Smoke Check

**Executor:** `devops-pt2`
**Phase:** 4
**Depends on:** WS3 (Gate 3 must pass — operator sign-off received)

**Objective:** Engineering lead approves and merges the PR to `main`. Wait for Vercel native Git integration to deploy `main` to `pt-2-weld.vercel.app`. Smoke-check all five Gate 4 routes per the PRD Appendix A Smoke Matrix, resolving DEC-1 at execution time. Populate the Gate 4 smoke matrix section of `WAVE-1-PHASE-1.5-SIGNOFF.md`.

**Merge prerequisites:**
- Gates 0 through 3 all passed
- `WAVE-1-PHASE-1.5-SIGNOFF.md` Gate 0, 1, 2, 3 sections complete
- Operator sign-off recorded
- Advisory failures (if any) have written engineering-lead disposition
- Gate 4 smoke path dry-run passed on the confirmed PR Preview URL using `ServiceHttpResult.data` JSON paths

**Production deploy verification:**
Wait for Vercel native Git integration to deploy after merge. Confirm:
- `pt-2-weld.vercel.app` loads successfully
- Production deployment reflects the merge commit (check Vercel dashboard or deployment metadata)
- Record merge commit SHA and Vercel deployment SHA

Do not use GitHub Actions deploy workflows — the Vercel native Git webhook is the sole deploy mechanism for Phase 1.5.

**Smoke Matrix — IDs resolved per DEC-1:**

Before executing, query `vaicxfihdldgepzryhpd` to identify:
- `playerId` — a player with recent session data
- `visitId` (live-view) — a visit in live or recently-closed state
- `gaming_day` — a day with alerts where at least one returned alert has `metricType` in `{drop_total, cash_obs_total, win_loss_cents}` (not `hold_percent`)
- `ratingSlipId` — a rating slip with modal data
- `visitId` (financial-summary) — a visit with financial summary data
- Authenticated staff role: pit_boss or floor_supervisor

Record all resolved values in the Gate 4 section before executing any smoke call.

**Gate 4 pre-merge dry-run:**
Before merging, validate the smoke assertion paths against the PR Preview URL using the
`ServiceHttpResult.data` envelope. This dry-run does not replace production smoke; it prevents
post-merge failure from stale JSON paths. If the dry-run paths fail on Preview, halt before merge
and correct the sign-off procedure or in-scope Wave 1 defect.

**Smoke Matrix execution:**

| Category | Route | Assertion | JSON paths to verify |
|---|---|---|---|
| Envelope | `GET /api/v1/players/{playerId}/recent-sessions` | `FinancialValue` shape present | `data.sessions[0].total_buy_in.value`, `.type`, `.source`, `.completeness.status`; `data.sessions[0].total_cash_out.{...}`; `data.sessions[0].net.{...}` |
| Envelope | `GET /api/v1/visits/{visitId}/live-view` | `FinancialValue` shape present | `data.session_total_buy_in.value`, `.type`, `.source`, `.completeness.status`; `data.session_total_cash_out.{...}`; `data.session_net.{...}` |
| Envelope | `GET /api/v1/shift-intelligence/alerts?gaming_day={date}` | Find one alert with allowed financial `metricType`; assert `FinancialValue` where non-null; `hold_percent` excluded from envelope assertion | `data.alerts[*]` contains item where `metricType` is one of `drop_total`, `cash_obs_total`, `win_loss_cents`; on that item: `observedValue.value`, `.type`, `.source`, `.completeness.status`; `baselineMedian.{...}`; `baselineMad.{...}` |
| Bare-number sanity | `GET /api/v1/rating-slips/{ratingSlipId}/modal-data` | 200 + expected BFF shape only | `data.financial.totalCashIn`, `data.financial.totalCashOut`, `data.financial.netPosition` present as bare-number cents; do NOT assert `FinancialValue` shape |
| Bare-number sanity | `GET /api/v1/visits/{visitId}/financial-summary` | 200 + expected summary shape only | `data.total_in`, `data.total_out`, `data.net_amount` present as bare-number cents; do NOT assert `FinancialValue` shape |

**Gate 4 smoke matrix section template (WS4 fills):**

```markdown
## Gate 4: Production Release and Smoke Check

**Merge commit SHA:** {sha}
**Vercel production URL:** pt-2-weld.vercel.app
**Vercel deployment SHA:** {sha}
**Date:** {YYYY-MM-DDThh:mm:ssZ}

### Resolved IDs (DEC-1)

| Param | Resolved value | Source |
|-------|---------------|--------|
| playerId | {id} | Query against vaicxfihdldgepzryhpd |
| visitId (live-view) | {id} | Query against vaicxfihdldgepzryhpd |
| gaming_day | {YYYY-MM-DD} | Query against vaicxfihdldgepzryhpd |
| metricType verified | {drop_total / cash_obs_total / win_loss_cents} | Selected from returned `data.alerts` item after querying by gaming_day |
| ratingSlipId | {id} | Query against vaicxfihdldgepzryhpd |
| visitId (financial-summary) | {id} | Query against vaicxfihdldgepzryhpd |
| Authenticated role | {pit_boss / floor_supervisor} | Staff record in vaicxfihdldgepzryhpd |

### Pre-Merge Smoke Path Dry-Run

| Surface | Preview URL | Result | JSON Paths Verified | Notes |
|---------|-------------|--------|---------------------|-------|
| Gate 4 smoke paths | {preview url} | {PASS/FAIL} | ServiceHttpResult `data.*` envelope paths | {notes} |

### Smoke Matrix Results

| Category | Route | Status | JSON Paths Verified | Notes |
|---|---|---|---|---|
| Envelope | GET /api/v1/players/{playerId}/recent-sessions | {200/N} | data.sessions[0].total_buy_in.value/.type/.source/.completeness.status; data.sessions[0].total_cash_out.{...}; data.sessions[0].net.{...} | {notes} |
| Envelope | GET /api/v1/visits/{visitId}/live-view | {200/N} | data.session_total_buy_in.value/.type/.source/.completeness.status; data.session_total_cash_out.{...}; data.session_net.{...} | {notes} |
| Envelope | GET /api/v1/shift-intelligence/alerts?gaming_day={date} | {200/N} | data.alerts[*] allowed financial metric item; observedValue.{...}; baselineMedian.{...}; baselineMad.{...} | hold_percent excluded from envelope assertion |
| Bare-number sanity | GET /api/v1/rating-slips/{id}/modal-data | {200/N} | data.financial.totalCashIn/.totalCashOut/.netPosition (bare-number, no FinancialValue) | {notes} |
| Bare-number sanity | GET /api/v1/visits/{visitId}/financial-summary | {200/N} | data.total_in/.total_out/.net_amount (bare-number, no FinancialValue) | {notes} |

**Gate 4 smoke result:** {PASS / FAIL}
```

**Acceptance criteria:**
- [ ] FIB-S REQ-5, AC-5: PR merged to `main` only after Gates 0–3 all satisfied
- [ ] Gate 4 smoke path dry-run passed on PR Preview URL before merge using `ServiceHttpResult.data` JSON paths
- [ ] FIB-S REQ-5, AC-5: Vercel production deployment verified at `pt-2-weld.vercel.app`
- [ ] FIB-S REQ-6, AC-5: `GET .../recent-sessions` — `FinancialValue` shape confirmed at `data.sessions[0].total_buy_in`, `data.sessions[0].total_cash_out`, `data.sessions[0].net` (value/type/source/completeness.status)
- [ ] FIB-S REQ-6, AC-5: `GET .../live-view` — `FinancialValue` shape at `data.session_total_buy_in`, `data.session_total_cash_out`, `data.session_net`
- [ ] FIB-S REQ-6, AC-5: `GET .../alerts?gaming_day={date}` — returned `data.alerts` includes at least one allowed financial `metricType` item with `FinancialValue` shape; `hold_percent` excluded from envelope assertion
- [ ] FIB-S REQ-6, AC-5: `GET .../modal-data` — 200 with expected BFF shape; no `FinancialValue` assertion on `data.financial.totalCashIn/totalCashOut/netPosition`
- [ ] FIB-S REQ-6, AC-5: `GET .../financial-summary` — 200 with expected summary shape; no `FinancialValue` assertion on `data.total_in/total_out/net_amount`
- [ ] All 5 smoke records include: route, query params, authenticated role, source ID, deployment URL/SHA, status code, timestamp, JSON paths checked (PRD §4.2)
- [ ] DEC-1 resolved: specific IDs, role, and deployment SHA recorded in Gate 4 evidence before smoke execution

**Outputs:**
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md` (Gate 4 smoke matrix section populated)

---

### WS5: Wave 1 Retrospective and Rollout Closure

**Executor:** `lead-architect`
**Phase:** 5
**Depends on:** WS4 (Gate 4 smoke must pass)

**Objective:** Author the Wave 1 retrospective section in `WAVE-1-PHASE-1.5-SIGNOFF.md`. Update `ROLLOUT-TRACKER.json` and `ROLLOUT-PROGRESS.md` to reflect Phase 1.5 execution and Wave 1 closure state. The retrospective must be truthful — it must not claim CI/CD remediation, staging isolation, or branch protection is in place.

**Retrospective contents (all sections required):**

**1. Release Notes**

Record what Wave 1 delivered:
- SRC label envelope (ADR-052): `type`, `source`, `completeness.status` on all in-scope financial surfaces
- Integer-cents canonicalization (ADR-053): all financial values in integer cents, no float amounts
- API contract expansion (ADR-054): `FinancialValue` envelope present on enumerated route responses
- UI split-display components and enforcement tests (ADR-055): Phase 1.3/1.4 components and lint rules

Record: branch merged (`ref/financial-standard` → `main`), production URL (`pt-2-weld.vercel.app`), merge commit SHA, merge date.

**2. CI/CD Gap Register (Wave 2 prerequisites)**

| Gap | Current state | Wave 2 action |
|-----|--------------|---------------|
| Staging Supabase project | Absent — Preview and production share `vaicxfihdldgepzryhpd` | Provision `pt-2-staging` before Wave 2 migrations |
| Staging Vercel environment | Absent | Create after staging Supabase project |
| `deploy-staging.yml` | Broken — missing `workflow_call` in `ci.yml`, no staging credentials | Repair after staging prerequisites exist |
| `deploy-production.yml` | Broken — missing `workflow_call` in `ci.yml`, `v*` tag activation unused | Repair after branch protection and staging exist |
| `main` branch protection | Absent — no required checks configured | Configure after staging and migration automation exist |
| Automated migration pipeline | Manual only — no `supabase db push` automation | Add after staging project available |
| Advisory test promotion | `test:surface` and E2E remain `continue-on-error: true` in CI | Promote after branch protection configured |

**3. Shared-Database Caveat**

Document: Preview and production both pointed to `vaicxfihdldgepzryhpd` during Wave 1 Phase 1.5 validation. No validation writes were permitted during Gate 0 through Gate 3; any attempted write would have affected live production data and failed Phase 1.5. Staging isolation is Wave 2 prerequisite #1.

**4. Supabase Advisor Findings**

Record any advisor findings observed during or after Phase 1.5. Do not remediate unless a finding is a regression directly caused by the Preview env var addition (which introduces no server-side schema changes). All pre-existing findings are Wave 2 backlog.

**5. Q1-Q4 Deferral Rationale**

Record the Wave 1 status for each open question:
- Q1 — PFT platform expansion: {resolved / deferred with rationale}
- Q2 — Grind store integration: {resolved / deferred with rationale}
- Q3 — Reconciliation consumer architecture: {resolved / deferred with rationale}
- Q4 — Outbox emission mechanism: {resolved / deferred with rationale}

**6. Wave 2 Prerequisite Register**

Verbatim from PRD Appendix B (mark each as deferred, not fixed):
- Staging Supabase project and environment isolation
- Vercel staging environment or staging project
- `deploy-staging.yml` and `deploy-production.yml` workflow remediation
- `ci.yml` reusable workflow compatibility
- `main` branch protection and required checks
- Automated migration deployment path
- Advisory test promotion strategy for unit, surface, and E2E gates
- Supabase advisor remediation plan
- Wave 2 roadmap and Q1-Q4 decisions
- `finance_outbox` schema and authoring path
- Failure harness I1-I4 activation against real outbox infrastructure

**ROLLOUT-TRACKER.json update:**

Update cursor block:
```json
{
  "cursor": {
    "wave": 1,
    "active_phase": "1.5",
    "phase_status": "complete",
    "wave_1_status": "closed",
    "phase_label": "Wave 1 complete. ref/financial-standard merged to main. Phase 1.5 Rollout & Sign-off closed.",
    "blocker": null,
    "next_action": "Draft WAVE-2-ROADMAP.md. Q1-Q4 decisions gate Wave 2 schema planning. Wave 2 CI/CD prerequisites must land before first Wave 2 migration.",
    "next_action_prd": null,
    "last_closed_phase": "1.5",
    "last_closed_date": "<actual YYYY-MM-DD>",
    "last_closed_exec": "EXEC-079",
    "last_closed_commit": "<merge commit SHA from WS4>"
  }
}
```

Add Phase 1.5 entry to the `phases` array:
```json
{
  "id": "1.5",
  "label": "Rollout & Sign-off",
  "wave": 1,
  "status": "complete",
  "prd": "PRD-079",
  "exec_spec": "EXEC-079",
  "prd_exec_exempt": false,
  "exit_date": "<actual YYYY-MM-DD>",
  "signoff": "docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md",
  "artifacts": [
    "docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md",
    "docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json",
    "docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md"
  ]
}
```

**ROLLOUT-PROGRESS.md update:**
Sync Phase 1.5 row to `complete` status with exit date, EXEC-079 ref, merge commit SHA, and Wave 1 closure marker. Sync must match `ROLLOUT-TRACKER.json` exactly.

**Finalize WAVE-1-PHASE-1.5-SIGNOFF.md:**
After populating the retrospective section, set `status: complete` in the file frontmatter.

**Acceptance criteria:**
- [ ] FIB-S REQ-7, AC-6: Retrospective does not claim staging, branch protection, deploy workflow remediation, or automated migration pipeline is in place
- [ ] FIB-S REQ-7, AC-6: CI/CD gap register records each gap as a named Wave 2 prerequisite
- [ ] FIB-S REQ-7, AC-6: Q1-Q4 status recorded — each resolved or explicitly deferred with rationale
- [ ] FIB-S REQ-7, AC-6: Release notes cite ADR-052, ADR-053, ADR-054, ADR-055
- [ ] FIB-S REQ-7, AC-6: Shared-database caveat documented with `vaicxfihdldgepzryhpd`
- [ ] FIB-S REQ-7, AC-6: Advisor findings recorded; no remediation action in Phase 1.5
- [ ] FIB-S REQ-7, AC-6: Wave 2 prerequisite register complete per PRD Appendix B
- [ ] `ROLLOUT-TRACKER.json` cursor at `wave_1_status: "closed"` with Phase 1.5 exit date, EXEC-079, and merge commit SHA
- [ ] `ROLLOUT-PROGRESS.md` synchronized with tracker (Phase 1.5 `complete`, Wave 1 closed)
- [ ] `WAVE-1-PHASE-1.5-SIGNOFF.md` frontmatter `status: complete` — all sections populated

**Outputs:**
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md` (retrospective section + `status: complete`)
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` (cursor + Phase 1.5 phases entry)
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md` (Phase 1.5 + Wave 1 closure sync)

---

## Anti-Invention Boundary

The following are explicitly prohibited in this EXEC-SPEC. If any workstream executor proposes these, halt and require FIB amendment:

| Prohibited | Rationale |
|-----------|-----------|
| Service, DTO, API, OpenAPI, or UI component changes | Frozen — Phase 1.3/1.4 contracts are inputs, not outputs |
| RLS policy changes | Not in scope — ADR-015/020/024/030 in effect |
| SQL migrations | Wave 1 is surface-only; no schema changes exist or are needed |
| GitHub Actions workflow changes | CI/CD remediation is a Wave 2 prerequisite |
| Branch protection configuration | Wave 2 prerequisite; adding it now creates a false governance signal |
| New Supabase project or Vercel environment beyond Preview env vars | Wave 2 prerequisite |
| Promotion of advisory tests to blocking CI gates | Requires branch protection first |
| Supabase advisor remediation not caused by Phase 1.5 env var change | Wave 2 backlog |
| Production tag release process (`v*` tag workflows) | Wave 2 prerequisite |
| Wave 2 schema, `finance_outbox`, outbox producer, or consumer work | Out of scope |
| New financial labels, authority classes, or completeness statuses | Frozen — Phase 1.1/1.3 definitions are final |
| Additional smoke routes beyond Gate 4 Smoke Matrix | Requires PRD amendment per PRD §4.2 |
| `hold_percent` asserted as `FinancialValue` | Permanent bare-ratio carve-out per PRD §5.2 NFR-9 |

---

## Known Limitations

Documented per DoD §Operational Readiness and §Documentation:

1. **Shared Supabase database during validation:** Preview and production both point to `vaicxfihdldgepzryhpd`. No validation writes are permitted during Gate 0 through Gate 3; any attempted write affects live production data and fails Phase 1.5. Staging isolation is Wave 2 prerequisite #1.
2. **Branch protection absent:** Blocking gate compliance is enforced by procedure (local commands with recorded commit SHA), not by GitHub branch protection. No automated merge guard exists until Wave 2.
3. **Advisory tests remain advisory:** `test:surface` and E2E I5 remain `continue-on-error: true` in CI. Promoting them to blocking gates requires branch protection to be meaningful.
4. **Smoke check IDs are runtime-resolved:** Gate 4 smoke check IDs cannot be pre-specified in this document; they are resolved against the live production database per DEC-1.
5. **Deploy mechanism is Vercel native webhook only:** GitHub Actions `deploy-staging.yml` and `deploy-production.yml` remain broken. Vercel's native Git integration is the sole deploy mechanism for Phase 1.5.
6. **No Supabase advisor remediation in scope:** Pre-existing advisor findings are recorded in the retrospective but not resolved in Phase 1.5.

---

## Wave 2 Entry Criteria (unlocked by this EXEC)

After WS5 completes with all gates passing:
- Wave 1 exit criterion: **SRC envelope present on every production financial surface (API + UI)** — met
- Wave 1 exit criterion: **Lint rule red on violations, active in CI** — met (EXEC-078)
- Wave 1 exit criterion: **Truth-telling test suite passes (harness I5 subset)** — met (EXEC-078)
- Wave 1 exit criterion: **Operator sign-off on interpretability** — met
- Wave 1 exit criterion: **Open questions Q1-Q4 resolved or explicitly deferred with documented rationale** — met
- Wave 1 exit criterion: **Release posture truthfully records remaining CI/CD gaps before Wave 2** — met
- `ROLLOUT-TRACKER.json` cursor at `wave_1_status: "closed"`
- `WAVE-2-ROADMAP.md` authoring unblocked
- Wave 2 CI/CD prerequisites PRD may be drafted

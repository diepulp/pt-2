---
id: FIB-H-FIN-ROLLOUT-1.5
title: "Financial Telemetry Wave 1 — Phase 1.5 Rollout & Sign-off"
phase: "1.5"
status: Draft
created: 2026-05-05
owner: Vladimir Ivanov
governs: PRD-079 (to be drafted)
guardrail_ref: docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md
scope_authority_version: v0
---

# Feature Intake Brief
## Financial Telemetry Wave 1 — Phase 1.5 Rollout & Sign-off

---

## GOV-FIB-001 Scope Header (required before sections)

**One-line boundary:**
This FIB fixes the Vercel Preview authentication gap and executes the Wave 1 merge-to-production sign-off procedure; it does not remediate CI/CD pipeline defects or provision staging infrastructure.

**Primary change class:** Release Validation (enabled by infrastructure fix)
The env var fix (Infrastructure) is the prerequisite, not the primary purpose. The primary purpose is validating that Wave 1 financial surfaces are correct and interpretable before the branch enters production. All subsequent steps — operator walkthrough, merge, smoke check, retrospective — are the validation procedure. The infrastructure fix is what makes the validation surface usable.

**Coverage mode:** Full
Justified: Phase 1.5 is a dedicated rollout/sign-off slice per GOV-FIB-001 §6.3. Full coverage is required because the exit gate is "SRC envelope live on every production financial surface," not a representative subset. No new semantics, UI behavior, transport shape, or service logic are introduced.

**Primary layer:** Validation (Infrastructure is a prerequisite layer, not the primary)

**Atomicity test:**
1. Can this FIB ship without CI/CD remediation (broken deploy workflows, branch protection, staging env)? **Yes** — those are Wave 2 prerequisites with no bearing on whether Wave 1 code is correct.
2. Can CI/CD remediation begin after this FIB without rewriting this FIB? **Yes** — the retrospective records the gaps; Wave 2 CICD PRD consumes them.
3. Does the shipped FIB remain internally consistent and truthful (not merely compilable)? **Yes** — Wave 1 financial surfaces are correct; the retrospective honestly names what the deployment infrastructure cannot yet guarantee.

---

## A. Feature identity

**Feature name:** Wave 1 Rollout & Sign-off

**Feature ID / shorthand:** FIN-ROLLOUT-1.5

**Related wedge / phase / slice:** Financial Telemetry Wave 1, Phase 1.5 (final phase)

**Requester / owner:** Vladimir Ivanov

**Date opened:** 2026-05-05

**Priority:** P0 — Wave 1 cannot close until this phase completes

**Target decision horizon:** Pilot — Wave 1 exit gate. Wave 2 does not open until this signs off.

---

## B. Operator problem statement

The financial-standard branch has completed four phases of work (Phases 1.1–1.4) adding the SRC label envelope, integer-cents canonicalization, UI split-display components, and enforcement lint rules. None of this work is visible to operators or in the hosted application because the branch has not been merged. Additionally, Vercel PR Preview deployments cannot connect to Supabase — the three public Supabase credentials are absent from the Preview environment — which means no operator walkthrough can be performed on a Preview URL before merge. The pit boss and floor supervisor cannot confirm that financial surfaces are interpretable until the Preview environment is fixed and the branch is promoted to the hosted app.

---

## C. Pilot-fit / current-slice justification

Wave 1's exit criterion requires operator sign-off on interpretability. That sign-off cannot happen against local development because the relevant actors (pit bosses, floor supervisors) access the system through the hosted URL. The PR Preview is the correct pre-merge validation surface, but it is currently broken due to missing Supabase credentials. Fixing the Preview credentials is the minimal unblock. Without it, the operator walkthrough either cannot happen or must be deferred until after a blind merge — which means merging before the Wave 1 exit gate is met. This belongs in the current slice because deferring it means Wave 1 never formally closes and Wave 2 cannot open. The PR Preview is the sole validation surface available; CI gate results (lint, type-check, build) confirm code correctness but cannot confirm operator interpretability. Both are required; neither substitutes for the other.

---

## D. Primary actor and operator moment

**Primary actor:** Pit boss / floor supervisor (operator sign-off); engineering lead (merge decision)

**Merge authority note:** Engineering lead holds final merge authority and must explicitly accept any advisory test failures in writing before the PR is merged. Implicit acceptance (silence, proceeding without documentation) is not valid.

**When does this happen?** End of Wave 1 — after Phase 1.4 validation passed and before Wave 2 schema work begins.

**Primary surface:** Vercel PR Preview URL (operator walkthrough); `pt-2-weld.vercel.app` (production smoke check post-merge)

**Trigger event:** Phase 1.4 exit gate passed (EXEC-078, commit `05e34782`). The `ref/financial-standard` branch is ready to merge. The only blocker is Preview authentication and the formal sign-off procedure.

---

## E. Feature Containment Loop

1. Engineer adds three missing Supabase credentials to the Vercel Preview environment (`vercel env add` ×3) → Vercel Preview deployments can authenticate with Supabase
2. Engineer opens PR `ref/financial-standard` → `main` → Vercel automatically creates a Preview deployment at a `pt-2-***.vercel.app` URL
3. Engineer verifies the PR Preview deployment is functional — financial routes return data and Supabase auth succeeds → Preview confirmed functional; walkthrough does not proceed until this is confirmed
4. Blocking CI gates run on the PR (lint including financial-enforcement rules, type-check, build) → all must pass green
5. Engineer runs advisory validation suite locally (`npm run test:surface` 13/13; E2E I5-1/I5-2) → pass results are recorded; **any failure requires an explicit written merge justification** before the walkthrough proceeds
6. Pit boss opens the PR Preview URL and navigates financial surfaces (shift dashboard, player 360, rating slip modal, compliance view) → confirms FinancialValue labels, AttributionRatio, and CompletenessBadge are interpretable and non-confusing
7. Operator sign-off recorded → PR approved and merged to `main`
8. Vercel native webhook deploys `main` to `pt-2-weld.vercel.app` within ~4 minutes → engineer smoke-checks five financial API routes for FinancialValue contract: `value`, `type`, `source`, and `completeness.status` present; no flattened bare numbers in place of a FinancialValue object
9. Wave 1 retrospective authored → CI/CD gaps documented as Wave 2 prerequisites; Q1–Q4 deferral rationale recorded; release notes citing SRC + ADR-052–055 captured

---

## F. Required outcomes

- Vercel PR Preview deployments authenticate with Supabase (three missing env vars added)
- Blocking CI gates (lint, type-check, build) pass on the `ref/financial-standard` → `main` PR
- Advisory validation results documented (pass or fail recorded, not required to be green)
- Operator walkthrough on Preview URL confirms all four of the following; sign-off recorded:
  - Authority labels (actual / estimated / observed) are understood without explanation
  - Completeness states (complete / partial / unknown) are distinguishable from one another
  - No surface implies authoritative totals — operators do not conclude a number is a definitive drop or settlement figure
  - Split displays (rated vs. estimated) are interpretable as two distinct fact classes, not as components of one total
- `ref/financial-standard` merged to `main`; hosted app at `pt-2-weld.vercel.app` reflects Wave 1 work
- Five financial API routes smoke-checked on production URL for envelope shape
- Wave 1 retrospective complete: CI/CD gap register, Q1–Q4 deferral rationale, release notes

---

## G. Explicit exclusions

- **No CI/CD remediation.** The broken `deploy-staging.yml` and `deploy-production.yml` workflows (missing `on: workflow_call` in `ci.yml`) are documented but not fixed in this phase.
- **No staging environment.** `pt-2-staging` Supabase project is not provisioned. No staging Vercel project.
- **No branch protection.** `main` branch protection remains unconfigured. This is a Wave 2 prerequisite.
- **No automated migration pipeline.** `supabase db push` remains manual. No migrations ship in Phase 1.5 anyway (Wave 1 is surface-only).
- **No promotion of advisory tests to blocking.** Unit test and E2E CI jobs remain `continue-on-error: true`. Hardening the CI enforcement level is a Wave 2 CI prerequisite.
- **No production tag release process.** `v*` tag-based releases and `deploy-production.yml` are not activated. The Vercel native webhook is the deploy mechanism.
- **No custom domain.** `pt2.app` and `staging.pt2.app` are not purchased or configured. The production URL remains `pt-2-weld.vercel.app`.
- **No Wave 2 scope.** No schema changes, no `finance_outbox` DDL, no outbox producer wiring, no dual-authoring path.
- **No financial-enforcement.spec.ts wired into CI.** The E2E truth-telling spec runs locally only. Wiring it into a blocking CI job requires branch protection first, which is excluded.
- **No Supabase advisor remediation.** Advisor checks are run and recorded; any findings are Wave 2 backlog, not Phase 1.5 scope unless they are regressions caused directly by the Phase 1.5 env var change (the Preview env var addition introduces no server-side changes).

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Fix `workflow_call` in `ci.yml` to unblock deploy-staging.yml | Obvious 1-line fix; deploy-staging.yml has been broken since April 19 and failing visibly | CI/CD remediation is Wave 2 scope per the Phase 1.5 posture directive. The fix is trivial but its downstream (Supabase migration step) requires a staging project that doesn't exist. Fixing only the `workflow_call` without fixing the rest produces a deploy-staging job that runs but then fails on `SUPABASE_STAGING_PROJECT_REF`. Document in retrospective; fix together with Wave 2 prerequisites. |
| Add branch protection on `main` before merge | Required for CI gates to be meaningful as merge requirements | Admin action requiring Supabase staging project first (migration automation gate depends on it). Reversing the ordering (branch protection before staging) creates a governance illusion — required checks pass but the migration step remains manual. Wave 2 prerequisite. |
| Provision `pt-2-staging` Supabase project | Wave 2 will require a staging canary for schema migrations | External provisioning action (Supabase dashboard); Wave 2 prerequisite. Phase 1.5 carries no schema changes so the risk of shipping without staging is bounded. |
| Run financial-enforcement.spec.ts in CI as a blocking gate | Phase 1.4 delivered the spec; it should be enforced in CI | Requires removing `continue-on-error: true` from the `e2e` CI job AND branch protection on `main` to make it meaningful. Both are excluded from Phase 1.5. Document in retrospective as Wave 2 CI hardening item. |
| Supabase advisor remediation of any findings | Advisors may surface issues after the env var change | Preview env var addition touches only Vercel configuration, not the database schema. Any advisor findings are pre-existing or belong to Wave 2 schema work. Record findings; do not block Phase 1.5 merge on them. |

---

## I. Dependencies and assumptions

- **Phase 1.4 exit gate passed.** EXEC-078 complete, commit `05e34782`. Lint rules wired, financial-api-envelope tests green (13/13), E2E I5-1/I5-2 authored. This is verified — not an assumption.
- **Vercel CLI authenticated.** `vercel whoami` returns `vladimirivanovdev-4624` with a valid token (expires ~2026-05-14). Project `pt-2` linked via `.vercel/project.json`.
- **Single Supabase remote project.** `vaicxfihdldgepzryhpd` is the only hosted database. The Preview env var values are the same as production (no isolation). This is a known gap documented in the retrospective.
- **Vercel native Git integration is the deploy mechanism.** Push to `main` → production deploy at `pt-2-weld.vercel.app` within ~4 minutes. GitHub Actions deploy workflows play no role.
- **No migrations needed.** Wave 1 Phases 1.1–1.5 introduce zero schema changes. The last manual `supabase db push` covers all migrations.
- **Shared database during validation (accepted scope caveat).** The PR Preview and production environments both point to `vaicxfihdldgepzryhpd`. Any data written during the operator walkthrough (e.g., rating slips, buy-ins) is written to the live remote database. This is accepted: the application is pre-production, the database may be reset if validation data pollutes the state, and `supabase db reset` is the recovery mechanism. This caveat is recorded in the retrospective as a Wave 2 prerequisite (staging isolation).
- **Operator available for walkthrough.** A pit boss or floor supervisor can access the Preview URL during the validation window. This is an operational assumption; it is not automatable.

---

## J. Out-of-scope but likely next

- **Wave 2 CI/CD prerequisites PRD** — staging Supabase project, branch protection, `deploy-staging.yml` repair, migration automation, and advisory-to-blocking CI promotion. These must land before Wave 2 schema migrations to prevent silent regressions.
- **WAVE-2-ROADMAP.md** — per wave exit criterion, Wave 2 scope outline is drafted after Wave 1 retrospective. Q1–Q4 open questions (PFT expansion, grind store, reconciliation consumer, outbox emission mechanism) gate the schema design.
- **`finance_outbox` DDL + authoring RPC** — first Wave 2 deliverable once the roadmap and schema questions are resolved.

---

## K. Expansion trigger rule

Amend this brief if any downstream artifact proposes:
- Fixing a CI/CD workflow defect (not just documenting it)
- Provisioning any new Supabase project or Vercel environment beyond the three Preview env vars
- Adding a blocking CI gate or branch protection rule
- Adding any schema change, new table, or RPC
- Adding a new surface to the operator walkthrough beyond the five named in the containment loop (shift dashboard, player 360, rating slip modal, compliance view, API smoke check)

**Financial-domain specific:** If the operator walkthrough reveals a rendering defect (not a label confusion issue), it must be triaged against Phase 1.3/1.4 scope. A rendering defect is a bug fix on the existing branch — not an amendment to this FIB. A new interpretability requirement that was not addressed by Phase 1.3 IS an amendment trigger.

---

## L. Scope authority block

**Intake version:** v0

**Frozen for downstream design:** Yes — pending human approval

**Downstream expansion allowed without amendment:** No

**Open questions allowed to remain unresolved at scaffold stage:**
- Operator walkthrough outcome: pass or fail is determined during execution, not pre-determined here
- Supabase advisor findings: recorded in retrospective regardless of content; findings do not block merge unless they are regressions caused by the env var change itself

**Human approval / sign-off:** Pending — Vladimir Ivanov

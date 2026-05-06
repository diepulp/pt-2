---
id: PRD-079
title: Financial Telemetry - Wave 1 Phase 1.5 - Rollout and Sign-off
owner: Lead Architect (spec steward); Engineering (release execution); Vladimir Ivanov (approval)
status: Draft
affects:
  - PRD-070
  - PRD-071
  - PRD-072
  - PRD-073
  - PRD-074
  - PRD-075
  - PRD-076
  - PRD-077
  - PRD-078
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
  - docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md
  - docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md
created: 2026-05-05
last_review: 2026-05-05
phase: Wave 1 Phase 1.5 - Rollout & Sign-off
pattern: Release validation; Preview auth unblock + operator sign-off + production smoke check
http_boundary: true
parent_planning_ref: docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
predecessor_prd: docs/10-prd/PRD-078-financial-telemetry-wave1-phase1.4-validation-lint-truth-v0.md
fib_h: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-5/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-5-ROLLOUT-SIGNOFF.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-5/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-5-ROLLOUT-SIGNOFF.json
sdlc_category: Release Validation / OPS
pipeline_chain: /prd-writer -> /lead-architect EXEC-079 -> /build-pipeline
---

# PRD-079 - Financial Telemetry - Wave 1 Phase 1.5 - Rollout and Sign-off

## 1. Overview

- **Owner:** Lead Architect owns scope stewardship. Engineering owns release execution. Vladimir Ivanov owns final approval and advisory-failure acceptance.
- **Status:** Draft
- **Summary:** Phase 1.5 closes Financial Telemetry Wave 1 by making the completed branch usable in a hosted Preview, validating it through blocking and advisory gates, recording operator interpretability sign-off, merging to `main`, and smoke-checking production. The only infrastructure change allowed is adding the two public Supabase client env vars plus one server-only service-role secret to the Vercel Preview environment so the PR Preview can authenticate. This is a release validation PRD, not a CI/CD remediation PRD: broken deploy workflows, branch protection, staging infrastructure, migration automation, custom domains, and Wave 2 schema work are explicitly deferred. Done means Wave 1 financial surfaces are visible, interpretable, truthfully documented, and deployed to `pt-2-weld.vercel.app`.

---

## 2. Problem & Goals

### 2.1 Problem

Financial Telemetry Phases 1.1 through 1.4 delivered the SRC label envelope, integer-cents canonicalization, API contract expansion, UI split displays, and enforcement tests on the `ref/financial-standard` branch. Operators still cannot validate the hosted application because the branch is not merged, and the Vercel PR Preview cannot authenticate with Supabase while the required Preview environment variables are absent: two public client env vars and one server-only service-role secret.

Wave 1 cannot close on local validation alone. The exit gate requires pit boss or floor supervisor sign-off that financial surfaces are interpretable in the hosted application, followed by a truthful production smoke check and retrospective. Merging blindly before the Preview authentication gap is fixed would invert the release gate: production would receive Wave 1 before operator sign-off.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1 - Preview authentication restored** | Vercel PR Preview deployment for `ref/financial-standard` -> `main` loads authenticated Supabase-backed financial surfaces |
| **G2 - Blocking code gates green** | `npm run lint`, `npm run type-check`, and `npm run build` pass on the PR before merge |
| **G3 - Advisory validation recorded** | `npm run test:surface` and E2E I5-1/I5-2 results are recorded; any failure has explicit written engineering-lead merge justification |
| **G4 - Operator interpretability sign-off** | Pit boss or floor supervisor confirms authority labels, completeness states, non-authoritative totals, and split displays are understandable on the Preview URL |
| **G5 - Production reflects Wave 1** | `main` deploys through Vercel native Git integration and `pt-2-weld.vercel.app` exposes Wave 1 financial surfaces |
| **G6 - Production API smoke shape verified** | Three envelope-bearing production API routes return expected `FinancialValue` objects at named JSON paths; two bare-number sanity routes return deployed response shapes without envelope assertions |
| **G7 - Wave 1 handoff truthful** | Retrospective records CI/CD gaps, Q1-Q4 deferral rationale, release notes, shared-database caveat, and Wave 2 prerequisites |

### 2.3 Non-Goals

- No remediation of broken GitHub Actions deploy workflows, including `deploy-staging.yml`, `deploy-production.yml`, or missing `workflow_call` wiring in `ci.yml`.
- No staging Supabase project, staging Vercel project, or staging domain.
- No `main` branch protection or required-check configuration.
- No automated migration pipeline or `supabase db push` automation.
- No promotion of advisory unit or E2E jobs to blocking CI.
- No production tag release process or `v*` tag deployment activation.
- No custom domain purchase or configuration.
- No service, DTO, route handler, OpenAPI, UI, schema, RLS, or financial semantic change.
- No Wave 2 schema work, `finance_outbox` DDL, outbox producer, consumer, projection refactor, or failure-harness activation.
- No Supabase advisor remediation unless a finding is a regression caused directly by the Phase 1.5 Preview env var change.

---

## 3. Users & Use Cases

- **Primary operational users:** Pit bosses and floor supervisors validating that financial values are interpretable in the hosted application.
- **Primary release users:** Engineering lead, lead architect, QA/release executor, and Vladimir Ivanov as final approval authority.

**Top Jobs:**

- As a **pit boss**, I need to open the hosted Preview and confirm actual, estimated, observed, partial, and unknown financial states are understandable before the work ships.
- As a **floor supervisor**, I need split rated-versus-estimated displays to read as distinct fact classes so I do not treat them as one authoritative total.
- As an **engineering lead**, I need blocking code gates green and advisory failures explicitly accepted before merge so the release decision is auditable.
- As a **release executor**, I need a production smoke check that proves the deployed API still exposes the `FinancialValue` envelope shape.
- As a **lead architect**, I need the retrospective to document what Wave 1 did and did not guarantee before Wave 2 schema-bearing work begins.

---

## 4. Scope & Feature List

### 4.1 Precondition Gate

Phase 1.4 must be closed before Phase 1.5 execution begins: EXEC-078 complete, lint enforcement active, `test:surface` available, I5 truth-telling tests authored, `ROLLOUT-TRACKER.json` cursor at active phase `1.5`, and last closed commit recorded as `05e34782`. If Phase 1.5 requires changing application logic, schema, or CI/CD workflow behavior to proceed, execution halts and the FIB pair must be amended or split.

### 4.2 In Scope

**Preview authentication unblock:**
- Add the two missing public Supabase client env vars and one server-only service-role secret to the Vercel Preview environment for project `pt-2`.
- The explicit Preview env vars are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; `SUPABASE_SERVICE_ROLE_KEY` is server-only and must not appear in logs, screenshots, PR comments, client bundles, or any user-visible artifact.
- True Vercel Preview deployments currently return HTTP 500 from middleware before page code runs when Supabase credentials are absent; this is the failure mode the env var addition must resolve, not partial auth degradation.
- After redeployment, confirm the Vercel deployment is labeled as Preview in Vercel — not merely a hash-style URL. Production-tagged Vercel deployment URLs are visually indistinguishable from PR Preview URLs; do not trust URL shape alone.
- Validation evidence for Preview authentication must include the Vercel deployment label or deployment metadata showing Preview type, not only the URL.
- Operator walkthrough performed against a Production-tagged Vercel deployment is invalid for Phase 1.5 sign-off and must be repeated against a confirmed PR Preview deployment.
- Verify the PR Preview deployment can authenticate against the existing hosted Supabase project.
- Record the shared-database caveat: Preview and production both point to `vaicxfihdldgepzryhpd` during validation.
- Gate 0 is the hard-stop environment identity and auth-viability baseline gate: the deployment must be a real Preview, must not fail middleware before page code runs, and must be capable of completing Supabase auth. Gate 1 is the credential/application-auth confirmation that runs only after Gate 0 proves the deployment is a real Preview surface; Gate 1 cannot substitute for Gate 0.
- Validation may mutate the shared remote database because Preview and production point to the same Supabase project. Operator walkthrough writes are limited to validation-required actions only; any validation data written must be recorded as disposable pre-production validation data in the sign-off artifact.

**Pull request and blocking validation:**
- Open or prepare the PR from `ref/financial-standard` to `main`.
- Confirm Vercel creates a PR Preview deployment URL.
- Run or verify blocking gates: `npm run lint`, `npm run type-check`, and `npm run build`.
- Treat blocking gate failure as a hard stop until corrected within existing Wave 1 scope.

**Advisory validation:**
- Run and record `npm run test:surface`.
- Run and record E2E I5-1/I5-2 truth-telling validation or the equivalent Phase 1.4 Playwright invocation.
- Require explicit written engineering-lead merge justification for every advisory failure before walkthrough or merge proceeds, recorded in the PR discussion or a linked release artifact.

**Operator walkthrough:**
- Walk the Preview URL through the named financial surfaces: shift dashboard, player 360, rating slip modal, and compliance view.
- Confirm authority labels are understood without explanation.
- Confirm completeness states `complete`, `partial`, and `unknown` are visually distinguishable.
- Confirm no surface implies authoritative totals where only estimated, observed, partial, or unknown values exist.
- Confirm rated-versus-estimated split displays are interpreted as distinct fact classes, not as components of one total.
- Record sign-off in `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md`, the single authoritative release artifact.

**Merge and production validation:**
- Engineering lead approves and merges `ref/financial-standard` to `main` only after Preview auth, blocking gates, advisory disposition, and operator sign-off are complete.
- Wait for Vercel native Git integration to deploy `main` to `pt-2-weld.vercel.app`.
- Smoke-check three envelope-bearing financial API routes on production for `FinancialValue` envelope shape: `value`, `type`, `source`, and `completeness.status` at route-specific JSON paths.
- The three explicit envelope smoke-check routes are `GET /api/v1/players/[playerId]/recent-sessions`, `GET /api/v1/visits/[visitId]/live-view`, and `GET /api/v1/shift-intelligence/alerts` using a known allowed financial metric branch: `drop_total`, `cash_obs_total`, or `win_loss_cents`. `metricType: hold_percent` is explicitly excluded because it is a permanent bare-ratio carve-out.
- Smoke-check two deployed bare-number sanity routes without asserting `FinancialValue` shape: `GET /api/v1/rating-slips/[id]/modal-data` and `GET /api/v1/visits/[visitId]/financial-summary`.
- Each smoke-check record must include route, query params, authenticated role, source ID or `gaming_day` input, deployment URL or SHA, status code, timestamp, and exact JSON paths checked.
- Production smoke checks are release verification evidence only. They are not a new automated test suite, not a replacement for `test:surface`/E2E validation, and must not introduce new CI tooling or broad route-matrix coverage.
- Production smoke checks must not expand beyond the Gate 4 Smoke Matrix in Appendix A without PRD amendment.

**Retrospective and handoff:**
- Author the Wave 1 retrospective.
- Record CI/CD gap register as Wave 2 prerequisites.
- Record Q1-Q4 deferral rationale for Wave 2 planning.
- Record release notes citing SRC and ADR-052 through ADR-055.
- Record Supabase advisor findings without remediating them unless they are directly caused by the Preview env var change.
- Update rollout tracking artifacts to mark Phase 1.5 and Wave 1 closure state.

### 4.3 Out of Scope

- Repairing or enabling GitHub Actions deploy workflows.
- Adding branch protection, required checks, staging projects, staging domains, or production tag workflows.
- Changing application code to satisfy operator preferences discovered during walkthrough. Bug fixes are allowed only if they do not expand Phase 1.3/1.4 behavior and remain inside already-delivered Wave 1 scope.
- Adding new financial labels, new authority classes, new completeness statuses, or new UI surfaces.
- Expanding smoke checks into exhaustive route matrices.
- Resolving Wave 2 Q1-Q4 open questions inside this PRD; this PRD may document deferral rationale only.

---

## 5. Requirements

### 5.1 Functional Requirements

1. The Vercel Preview environment for project `pt-2` must contain `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, with `SUPABASE_SERVICE_ROLE_KEY` treated as a server-only secret.
2. The PR Preview URL must load authenticated Supabase-backed financial surfaces before any operator walkthrough begins. The deployment must be confirmed as Preview-type via Vercel deployment label or metadata; URL shape alone is not sufficient evidence. Operator walkthrough against a Production-tagged Vercel deployment is not valid for Phase 1.5 sign-off.
3. The PR from `ref/financial-standard` to `main` must have green blocking validation for lint, type-check, and build before merge.
4. Advisory validation results for `npm run test:surface` and E2E I5-1/I5-2 must be recorded.
5. Any advisory validation failure must have explicit written engineering-lead disposition before walkthrough proceeds, and that disposition must be present in the PR discussion or linked release artifact before engineering-lead merge approval.
6. Operator walkthrough must cover shift dashboard, player 360, rating slip modal, and compliance view on the PR Preview URL.
7. Operator sign-off must explicitly address authority-label comprehension, completeness-state distinction, avoidance of authoritative-total implication, and split-display interpretability, and must be recorded in `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md`.
8. Engineering lead approval and merge to `main` must occur only after Preview auth verification, blocking gates, advisory-failure disposition when applicable, and operator sign-off.
9. Production deploy must be verified at `pt-2-weld.vercel.app` after merge through Vercel native Git integration.
10. Three production financial API routes must be smoke-checked for `FinancialValue` envelope shape at exact JSON paths: `GET /api/v1/players/[playerId]/recent-sessions`, `GET /api/v1/visits/[visitId]/live-view`, and `GET /api/v1/shift-intelligence/alerts` using an allowed financial `metricType` of `drop_total`, `cash_obs_total`, or `win_loss_cents`, not `hold_percent`.
11. Two production API routes must be smoke-checked as deployed bare-number sanity checks without asserting `FinancialValue` shape: `GET /api/v1/rating-slips/[id]/modal-data` and `GET /api/v1/visits/[visitId]/financial-summary`.
12. Wave 1 retrospective must document CI/CD gaps, Q1-Q4 deferral rationale, shared-database caveat, advisor findings, release notes, and Wave 2 prerequisites.
13. Rollout tracking artifacts must reflect Phase 1.5 execution and Wave 1 closure state.

### 5.2 Non-Functional Requirements

1. Phase 1.5 must not introduce service, API, UI, schema, RLS, or DTO logic changes.
2. The Preview env var addition must be reversible through Vercel environment configuration.
3. The retrospective must be truthful about unresolved delivery posture: no staging, no branch protection, no deploy workflow remediation, and no automated migration pipeline.
4. The retrospective is documentation-only; it records gaps and prerequisites but executes no remediation.
5. Production smoke checks must validate envelope shape or deployed bare-number sanity shape, not business totals or settlement correctness.
6. Operator sign-off must happen in the hosted Preview environment, not only against local development.
7. The shared Supabase database caveat must be documented before walkthrough because Preview validation can write to the same remote database as production.
8. Phase 1.5 must remain shippable without Wave 2 CI/CD prerequisites.
9. Smoke checks must not assert `FinancialValue` shape on explicit carve-outs or deferred fields such as `hold_percent`, `average_bet`, `rating-slip-modal` financial section values, `VisitFinancialSummaryDTO` totals, or MTL gaming-day summary totals.
10. Environment identity verification must be recorded as evidence alongside Preview authentication: the Vercel deployment label or metadata must confirm Preview type before any Phase 1.5 validation step proceeds. Production-tagged deployment URLs must not be used as the pre-merge validation surface.
11. Production smoke checks are manual release verification evidence, not a new test suite or CI gate.

> Architecture details: Service, API, UI, and enforcement contracts are frozen inputs from PRD-070 through PRD-078. This PRD validates and releases them; it does not redefine them.

---

## 6. UX / Flow Overview

**Flow 1: Preview Auth Unblock**
1. Engineering adds the missing Supabase credentials to the Vercel Preview environment.
2. Engineering opens or refreshes the PR Preview deployment.
3. Engineering verifies authenticated financial surfaces load from the Preview URL.
4. Engineering records the Preview URL and auth verification result.

**Flow 2: Release Validation**
1. Blocking gates run for lint, type-check, and build.
2. Advisory `test:surface` and I5 E2E results are run and recorded.
3. Any advisory failure receives written engineering-lead disposition.
4. Validation proceeds only when blocking gates are green and advisory disposition is explicit.

**Flow 3: Operator Walkthrough**
1. Pit boss or floor supervisor opens the PR Preview URL.
2. Operator reviews shift dashboard, player 360, rating slip modal, and compliance view.
3. Operator confirms authority labels and completeness states are understandable.
4. Operator confirms split displays and non-authoritative totals are not misleading.
5. Operator sign-off or defect notes are recorded in `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md`.

**Flow 4: Production Release**
1. Engineering lead approves and merges the PR to `main`.
2. Vercel native Git integration deploys production to `pt-2-weld.vercel.app`.
3. Engineering smoke-checks three production financial API routes for envelope shape at exact JSON paths and two deployed bare-number sanity routes without envelope assertions.
4. Engineering records production smoke results and final Wave 1 release state.

**Flow 5: Retrospective Handoff**
1. Engineering authors the Wave 1 retrospective.
2. CI/CD gaps and shared-database risk are recorded as Wave 2 prerequisites.
3. Q1-Q4 open questions are resolved or explicitly deferred with rationale.
4. Rollout tracker and progress docs are updated for Wave 1 closure.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Phase 1.4 closure:** EXEC-078 complete at commit `05e34782`; enforcement rules and truth-telling tests exist.
- **Vercel access:** Vercel CLI or dashboard access is available for project `pt-2`, including Preview environment variable management.
- **GitHub PR path:** `ref/financial-standard` can be opened or maintained as a PR targeting `main`.
- **Hosted Supabase project:** Remote project `vaicxfihdldgepzryhpd` is available and contains data sufficient for walkthrough.
- **Vercel native Git integration:** Merge to `main` triggers production deploy to `pt-2-weld.vercel.app`.
- **Operator availability:** A pit boss or floor supervisor is available during the validation window.
- **No pending migrations:** Wave 1 carries no schema changes requiring deployment sequencing.
- **Vercel deployment identity verification:** The PR's Vercel deployment must be labeled as Preview in Vercel metadata. Production-tagged Vercel deployments share a hash-URL format with PR Previews and must not be mistaken for the pre-merge validation surface.

### 7.2 Risks

| Risk | Mitigation |
|------|------------|
| Validation performed against a Production-tagged Vercel URL mistaken for a PR Preview | Require Vercel deployment label or metadata as evidence before any validation record is accepted; if the URL proves to be Production-tagged, walkthrough is invalid and must be repeated on the confirmed PR Preview |
| Preview and production share one Supabase database | Document the caveat before walkthrough; avoid unnecessary writes; record staging isolation as Wave 2 prerequisite |
| Advisory tests fail but release pressure remains | Require explicit written engineering-lead disposition for each advisory failure before walkthrough proceeds, and require that disposition to be present in the PR discussion or linked release artifact before merge approval |
| Operator finds label confusion | Treat as a Phase 1.5 sign-off failure unless the issue is a bounded bug in already-delivered Wave 1 scope; new interpretability requirements require FIB amendment |
| Production deploy does not reflect merge promptly | Wait for Vercel native deploy and record deployment status; do not use broken GitHub Actions deploy workflows as a workaround |
| CI/CD gaps are mistaken as fixed by this rollout | Retrospective must explicitly state unresolved gaps and Wave 2 prerequisite ownership |
| Supabase advisor reports pre-existing issues | Record findings in retrospective; do not remediate in Phase 1.5 unless caused directly by the Preview env var change |

### 7.3 Open Questions for EXEC-079

- Which known production or validation IDs, query params, and authenticated role will EXEC-079 use for the five production smoke routes defined in the Gate 4 Smoke Matrix?
- What exact PR/check source will be considered authoritative for blocking gate evidence if branch protection is not configured?

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Vercel PR Preview authenticates with Supabase, loads financial surfaces, and is confirmed as Preview-labeled via Vercel deployment metadata (not merely a hash-style URL).
- [ ] Operator walkthrough covers shift dashboard, player 360, rating slip modal, and compliance view.
- [ ] Operator sign-off confirms authority labels, completeness states, non-authoritative totals, and split displays are interpretable.
- [ ] `ref/financial-standard` is merged to `main` only after all Phase 1.5 release gates are satisfied.

**Data & Integrity**
- [ ] No service, DTO, API, OpenAPI, UI, RLS, or schema behavior changes are introduced by this PRD.
- [ ] Shared Preview/production Supabase database caveat is documented before validation data is created.
- [ ] Three production financial API route smoke checks confirm `FinancialValue` envelope shape at exact JSON paths.
- [ ] Two production bare-number sanity route checks confirm deployed responses load without asserting `FinancialValue` shape on carve-outs or deferred fields.

**Security & Access**
- [ ] Preview authentication uses existing Supabase credentials managed through Vercel environment variables; no credentials are committed to the repository.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is handled as server-only secret material and does not appear in logs, screenshots, PR comments, client bundles, or user-visible artifacts.
- [ ] No client-controlled casino, authority, completeness, or role bypass is introduced.

**Testing**
- [ ] Blocking gates `npm run lint`, `npm run type-check`, and `npm run build` pass before merge.
- [ ] Advisory `npm run test:surface` and E2E I5-1/I5-2 results are recorded.
- [ ] Every advisory failure, if any, has explicit written engineering-lead merge justification.

**Operational Readiness**
- [ ] Production deploy to `pt-2-weld.vercel.app` is verified after merge.
- [ ] Rollback or mitigation path is recorded: revert the merge commit if production validation fails; remove or revert Preview env vars only if the Preview validation surface itself must be disabled.
- [ ] CI/CD gaps are recorded as Wave 2 prerequisites, not represented as fixed.

**Documentation**
- [ ] `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.5-SIGNOFF.md` exists and contains Preview evidence, advisory disposition, operator sign-off, production smoke matrix results, and retrospective links.
- [ ] Wave 1 retrospective is authored with CI/CD gap register, Q1-Q4 deferral rationale, shared-database caveat, advisor findings, and release notes.
- [ ] `ROLLOUT-TRACKER.json` and `ROLLOUT-PROGRESS.md` are synchronized with Phase 1.5 execution and Wave 1 closure state.
- [ ] Known limitations are documented: no staging, no branch protection, no deploy workflow remediation, no automated migration pipeline, and no Wave 2 schema work.

---

## 9. Related Documents

- **FIB-H:** `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-5/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-5-ROLLOUT-SIGNOFF.md`
- **FIB-S:** `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-5/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-5-ROLLOUT-SIGNOFF.json`
- **Predecessor PRD:** `docs/10-prd/PRD-078-financial-telemetry-wave1-phase1.4-validation-lint-truth-v0.md`
- **Rollout Roadmap:** `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- **Rollout Progress:** `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md`
- **Rollout Tracker:** `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`
- **Surface Rendering Contract:** `docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md`
- **FIB Scope Guardrail:** `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Service Layer Architecture:** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **Security / RLS:** `docs/30-security/SEC-001-rls-policy-matrix.md`
- **SDLC Taxonomy:** `docs/patterns/SDLC_DOCS_TAXONOMY.md`

---

## Appendix A: Release Gate Checklist

### Gate 0: Preview Surface Verification (hard stop)

> **Operating rule: Do not trust the URL shape. Verify the deployment environment.**
> If any item below fails, Phase 1.5 halts until the Preview surface is functional and correctly identified.
> Gate 0 precedes Gate 1. Gate 1 credential/auth checks are invalid unless Gate 0 first proves the deployment is a real Preview surface, not a Production-tagged hash URL.
> Auth viability baseline: Gate 0 is not passed if middleware still returns HTTP 500 before page code runs, or if the deployment cannot reach the Supabase auth path at all.

- [ ] Vercel deployment for the PR is confirmed labeled as Preview in Vercel metadata (not Production-tagged).
- [ ] PR Preview deployment no longer returns middleware HTTP 500.
- [ ] Supabase auth path is reachable on the PR Preview deployment; failures after this point are Gate 1 credential/application-auth failures, not Gate 0 identity failures.
- [ ] Supabase authentication succeeds on the PR Preview deployment.
- [ ] Financial routes return data on the PR Preview URL.
- [ ] Vercel deployment label or metadata recorded as evidence (URL shape alone is not sufficient).
- [ ] Production-tagged Vercel deployment URL is confirmed not in use as the validation surface.
- [ ] Shared-database mutation risk recorded: Preview validation writes, if any, are limited to validation-required actions, go to the same remote Supabase project as production, and are disposable pre-production validation data.

### Gate 1: Preview Auth

Gate 1 runs only after Gate 0 passes. It confirms the application credential/auth path on the verified Preview surface.

- [ ] Required Preview env vars identified.
- [ ] Required Preview env vars added in Vercel.
- [ ] PR Preview redeployed or refreshed.
- [ ] Preview auth verified.
- [ ] Shared Supabase caveat recorded.

### Gate 2: Validation

- [ ] `npm run lint` pass recorded.
- [ ] `npm run type-check` pass recorded.
- [ ] `npm run build` pass recorded.
- [ ] `npm run test:surface` advisory result recorded.
- [ ] E2E I5-1/I5-2 advisory result recorded.
- [ ] Advisory-failure disposition recorded if applicable.

### Gate 3: Operator Sign-off

- [ ] Shift dashboard reviewed.
- [ ] Player 360 reviewed.
- [ ] Rating slip modal reviewed.
- [ ] Compliance view reviewed.
- [ ] Authority-label comprehension recorded.
- [ ] Completeness-state distinction recorded.
- [ ] Non-authoritative total interpretation recorded.
- [ ] Split-display interpretation recorded.

### Gate 4: Production

- [ ] PR merged to `main`.
- [ ] Vercel production deployment verified.
- [ ] Five API route smoke checks recorded with route, query params, authenticated role, source ID or `gaming_day` input, deployment URL or SHA, status code, timestamp, and exact JSON paths checked.
- [ ] Retrospective authored.
- [ ] Tracker and progress docs updated.

### Gate 4 Smoke Matrix

EXEC-079 must fill the concrete IDs, query params, authenticated role, and exact response paths before smoke execution. The matrix below defines the only valid Phase 1.5 production smoke categories.

| Category | Route | Expected assertion | Required JSON paths / carve-outs |
|---|---|---|---|
| Envelope | `GET /api/v1/players/[playerId]/recent-sessions` | `FinancialValue` shape present | `sessions[0].total_buy_in.value/type/source/completeness.status`, `sessions[0].total_cash_out.value/type/source/completeness.status`, `sessions[0].net.value/type/source/completeness.status` |
| Envelope | `GET /api/v1/visits/[visitId]/live-view` | `FinancialValue` shape present | `session_total_buy_in.value/type/source/completeness.status`, `session_total_cash_out.value/type/source/completeness.status`, `session_net.value/type/source/completeness.status` |
| Envelope | `GET /api/v1/shift-intelligence/alerts` | Allowed financial metric branch only; `FinancialValue` shape present where non-null | Allowed `metricType`: `drop_total`, `cash_obs_total`, `win_loss_cents`; assert `alerts[n].observedValue.value/type/source/completeness.status`, `alerts[n].baselineMedian.value/type/source/completeness.status`, `alerts[n].baselineMad.value/type/source/completeness.status`; exclude `metricType: hold_percent` |
| Bare-number sanity | `GET /api/v1/rating-slips/[id]/modal-data` | 200 response and expected deployed BFF shape only | Do not assert `FinancialValue`; `financial.totalCashIn`, `financial.totalCashOut`, and `financial.netPosition` are bare-number cents fields in this PRD |
| Bare-number sanity | `GET /api/v1/visits/[visitId]/financial-summary` | 200 response and expected deployed summary shape only | Do not assert `FinancialValue`; `total_in`, `total_out`, and `net_amount` are deferred bare-number cents fields in this PRD |

---

## Appendix B: Deferred Wave 2 Prerequisite Register

These items are explicitly not Phase 1.5 scope and must be carried into Wave 2 planning:

- Staging Supabase project and environment isolation.
- Vercel staging environment or staging project.
- `deploy-staging.yml` and `deploy-production.yml` workflow remediation.
- `ci.yml` reusable workflow compatibility if still required by deploy workflows.
- `main` branch protection and required checks.
- Automated migration deployment path.
- Advisory test promotion strategy for unit, surface, and E2E gates.
- Supabase advisor remediation plan.
- Wave 2 roadmap and Q1-Q4 decisions.
- `finance_outbox` schema and authoring path.
- Failure harness I1-I4 activation against real outbox infrastructure.

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-05-05 | prd-writer | Initial draft from Phase 1.5 FIB-H/FIB-S |
| 0.1.1 | 2026-05-05 | Vladimir Ivanov | Targeted patch from direction-alignment finding: environment identity verification rule added; Gate 0 added to Appendix A; §4.2, §5.1 FR-2, §5.2 NFR-10, §7.1, §7.2, §8 updated |

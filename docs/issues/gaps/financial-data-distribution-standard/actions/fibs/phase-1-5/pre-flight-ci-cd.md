I have a complete picture. Let me synthesize the Phase 1.5 context brief now.

---

## Phase 1.5 Context Brief — Financial Telemetry Wave 1 Rollout & Sign-off

**Status as of 2026-05-05:** Phase 1.4 complete (EXEC-078, commit `05e34782`). Phase 1.5 entry gate is met. PRD + EXEC-SPEC not yet drafted.

---

### What Phase 1.4 Delivered (foundation Phase 1.5 inherits)

| Artifact                              | File                                                         | State                                                                |
| ------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| ESLint `no-forbidden-financial-label` | `.eslint-rules/no-forbidden-financial-label.js`              | Wired to `components/**/*` + `services/**/dtos.ts`, `error` severity |
| ESLint `no-unlabeled-financial-value` | `.eslint-rules/no-unlabeled-financial-value.js`              | Wired, denylist mode, DEF-NEVER carve-out                            |
| API envelope test suite               | `__tests__/financial-surface/financial-api-envelope.test.ts` | 13 tests, all passing                                                |
| E2E truth-telling spec                | `e2e/financial-enforcement.spec.ts`                          | I5-1 + I5-2 authored; **Mode A local-only — NOT in CI E2E run**      |
| All gates                             | `npm run lint`, `type-check`, `build`                        | Exit 0                                                               |

The lint rules are **live in the repo** but their enforcement depends entirely on what runs in CI, which leads to the critical CI/CD findings below.

---

### CI/CD Posture — Actual vs. Assumed

The ROLLOUT-ROADMAP.md Phase 1.5 deliverable says: *"Staged deploy: preview → staging → prod (following `docs/deployments/CICD-PIPELINE-SPEC.md`)"*. This assumes infrastructure that does not exist. Here is the verified ground truth:

#### What is ACTIVE (Phase 1A only)

| Workflow                           | Trigger                   | Blocking?                                     |
| ---------------------------------- | ------------------------- | --------------------------------------------- |
| `ci.yml` — lint, type-check, build | PR to `main`              | `checks` job blocks merge (in theory)         |
| `ci.yml` — unit tests              | PR to `main`              | **`continue-on-error: true` — advisory only** |
| `ci.yml` — E2E                     | PR to `main`              | **`continue-on-error: true` — advisory only** |
| `migration-lint.yml`               | PR with migration changes | Blocking                                      |
| `security-gates.yml`               | PR with migration changes | Blocking                                      |
| `check-srm-links.yml`              | PR/push with doc changes  | Blocking                                      |

#### What DOES NOT EXIST

| Item                                    | Spec Reference                                | Reality                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging environment (`staging.pt2.app`) | `deploy-staging.yml`, ENVIRONMENT-FLOW §3     | **Does not exist.** No Supabase `pt-2-staging` project.                                                                                                    |
| Vercel deployment                       | `deploy-staging.yml`, `deploy-production.yml` | **Not configured.** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secrets absent. Workflows exist as files but would fail immediately if triggered. |
| Production environment (`pt2.app`)      | `deploy-production.yml`                       | **Does not exist.** No `SUPABASE_PROD_PROJECT_REF` secret.                                                                                                 |
| Branch protection on `main`             | (implied by CI gates being meaningful)        | **Absent.** GitHub confirms "Branch not protected." PRs can be force-merged bypassing all CI gates.                                                        |
| `SUPABASE_STAGING_PROJECT_REF` secret   | `deploy-staging.yml` line 88                  | Not set                                                                                                                                                    |
| `SUPABASE_PROD_PROJECT_REF` secret      | `deploy-production.yml` line 107              | Not set                                                                                                                                                    |

#### Additional CI gaps relevant to Phase 1.4 artifacts

- **`financial-enforcement.spec.ts` is not in the CI E2E run.** The CI `e2e` job runs only `e2e/workflows/player-exclusion.spec.ts` and `e2e/api/player-exclusion-enforcement.spec.ts`. The Phase 1.4 truth-telling spec was delivered as "Mode A Local Verification" — correct per EXEC-078 scope, but it means the I5 assertions are not CI-gated.
- **Unit tests are advisory.** The `financial-api-envelope.test.ts` (13 tests) runs under the `test` job, which is `continue-on-error: true`. A regression would not block a PR today.
- **The ESLint financial enforcement rules ARE in the blocking `checks` job** (`npm run lint` is in `ci.yml` `checks`, which is not `continue-on-error`). This is the one solid gate Phase 1.4 delivered to CI. The lint rules are the strongest enforcement lever currently in play.

**The practical implication:** The single remote Supabase project (`vaicxfihdldgepzryhpd`) is the only hosted environment. Any migration push from `main` goes directly there. There is no staging canary, no promotion model, no rollback automation.

---

### What This Means for the Phase 1.5 PRD

The roadmap's Phase 1.5 deliverable list must be reinterpreted against actual infrastructure. The PRD has two viable scope options — the choice needs to be made before `/prd-writer` is invoked:

**Option A — Minimal Wave 1 close (no infra provisioning)**

"Rollout" = merge the feature branch to main, push migrations manually to the single remote project, run the dev server against remote for operator UX validation, capture the Wave 1 retrospective. The "staged deploy" deliverable becomes "branch merge + manual remote push + smoke check." Infrastructure provisioning (staging, Vercel, branch protection) is deferred to a separate DevOps PRD post-Wave 1 sign-off.

- **Scope:** Small. DevOps skill handles branch merge procedure, migration push runbook, and smoke test script. QA skill handles final gate validation and retrospective.
- **Risk:** No staging environment means operator UX validation runs against the same Supabase project that feeds the dev server. If the operator walkthrough requires real data, it needs a configured remote session.
- **Honest label:** This is "sign-off on the feature branch, not deploy to production."

**Option B — Infra-first then sign-off**

Phase 1.5 includes a DevOps workstream that provisions the staging environment (Supabase `pt-2-staging`, Vercel project, GitHub secrets, branch protection) before the operator walkthrough. The "staged deploy" deliverable then becomes real.

- **Scope:** Significant. External actions required (Supabase dashboard, Vercel dashboard, GitHub repo settings) that the agent cannot execute unattended. These are operator-action steps.
- **Risk:** Phase 1.5 becomes a multi-session DevOps effort, delaying Wave 1 close.
- **Honest label:** This is the right answer for production readiness, but it may be more than a sign-off phase warrants at pilot scale.

**Recommendation:** The PRD should scope Phase 1.5 as **Option A** with an explicit infrastructure gap acknowledgment. The Wave 1 retrospective should record the CI/CD gap as a Wave 2 prerequisite. A separate DevOps PRD (PRD-079 or similar) then formalizes the staging environment work before Wave 2 begins, since Wave 2 schema migrations and outbox work genuinely require a staging canary.

---

### Phase 1.5 PRD Scope Constraints (carry into `/prd-writer`)

**Must be in scope (per Wave 1 exit criteria):**

1. Branch merge procedure: `ref/financial-standard` → `main`, including final lint/type-check/build gate verification
2. Migration push to remote Supabase (`vaicxfihdldgepzryhpd`) — manual `supabase db push`, smoke check for Wave 1 financial routes
3. Operator UX validation session — pit boss walkthrough of the FinancialValue, AttributionRatio, CompletenessBadge components against real or seed data; interpretability sign-off (SRC §L2 non-negotiable)
4. Supabase advisors clean check — `supabase inspect db` or advisor query; confirm no regression from envelope marshaling overhead
5. Release notes artifact — cites SRC + ADR-052/053/054/055 and the five Wave 1 phases
6. Wave 1 retrospective — what the frozen set didn't anticipate; Wave 2 open questions Q1–Q4 resolution status or explicit deferral rationale

**Must be out of scope (or explicitly named as infrastructure gap, not as a deliverable):**

- Staging Supabase project provisioning (no `pt-2-staging` exists)
- Vercel deployment configuration (no secrets, no project)
- Automated CD pipeline activation (workflows exist as files; they are not executable in current state)
- Branch protection enforcement on `main`
- Adding `financial-enforcement.spec.ts` to CI E2E run list (this is a legitimate Phase 1.5 gate question — but it requires the `e2e` job to be blocking, which it currently is not; this is an infrastructure question, not a feature question)

**One gate question the PRD must resolve before EXEC-SPEC:**

> Should Phase 1.5 promote the `financial-api-envelope.test.ts` and `financial-enforcement.spec.ts` from advisory/local to **blocking CI gates**? This requires removing `continue-on-error: true` from the `test` and `e2e` CI jobs (or creating a dedicated `npm run test:surface` CI step that is blocking), AND adding branch protection on `main` to make the gates meaningful.
>
> This is a pure governance action, not a code change, and it is what "lint rule active, CI red on violations" in the Wave 1 exit criteria actually means for tests. If the PRD defers this, the exit criterion is not met at the test level — only at the lint level.

---

### Skill Routing for Phase 1.5

Per roadmap §9: `/devops-pt2` as primary, `/qa-specialist` for final gate. These are dispatched by `/build-pipeline` after PRD + EXEC-SPEC land.

**What `/devops-pt2` actually needs to do given the posture above:**
- Author the branch merge runbook
- Author the `supabase db push` procedure with pre/post smoke checks for financial routes
- Determine and document the CI gate promotion question (blocking vs. advisory for test/e2e jobs)
- Document the infrastructure gap as a named deliverable in the retrospective, not a silent omission

**What `/qa-specialist` needs to do:**
- Run the final gate matrix (lint exit 0, type-check exit 0, build exit 0, test:surface 13/13, E2E I5-1/I5-2 locally)
- Author the Supabase advisor clean report
- Confirm Wave 1 exit criteria checklist item by item against the actual posture

---

### Open Questions Status Going Into Phase 1.5

| Q                                              | Status | Notes                |
| ---------------------------------------------- | ------ | -------------------- |
| Q1 — PFT expand vs. Class B separate store     | Open   | Wave 2 gate, not 1.5 |
| Q2 — Grind normalized vs. separate             | Open   | Wave 2 gate, not 1.5 |
| Q3 — External reconciliation consumer contract | Open   | Wave 2 gate, not 1.5 |
| Q4 — Outbox: trigger vs. shared RPC            | Open   | Wave 2 gate, not 1.5 |

Phase 1.5 retrospective must either resolve these or document explicit rationale for Wave 2 deferral. The Wave 1 exit criterion says "resolved or explicitly deferred with documented rationale" — deferral with rationale is acceptable.

---

### Execution Chain

```
Phase 1.5 entry gate: ✅ Phase 1.4 exit met (05e34782)

Next actions (in order):
1. Resolve scope option (A vs B above) — confirm with user before /prd-writer
2. /prd-writer — Phase 1.5 PRD citing ADR-052–055, SRC, this context brief
3. /lead-architect — EXEC-SPEC scaffold (branch merge WS + operator walkthrough WS + retrospective WS + infra-gap-document WS)
4. /build-pipeline — dispatching /devops-pt2 + /qa-specialist
```

**The one decision needed before `/prd-writer`:** Are the CI gate promotions (remove `continue-on-error`, add branch protection) Phase 1.5 scope or deferred to a DevOps PRD? This determines whether the EXEC-SPEC has a `ci-hardening` workstream or just a `ci-gap-documented` entry in the retrospective.
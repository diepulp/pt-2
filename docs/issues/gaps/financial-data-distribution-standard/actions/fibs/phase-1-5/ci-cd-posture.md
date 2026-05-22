I have everything I need. Here is the verified reality.

---

## CI/CD Posture — Ground Truth (2026-05-05)

### The Actual Deployment Model

Vercel is connected and deploying. The deployment happens via **Vercel's native Git integration webhook**, not via GitHub Actions. The workflow files are a second layer that attempts to run after the native deploy — and has been broken since April 19.

```
Push to main ──▶  Vercel native webhook  ──▶  Production auto-deploy  ✅ (actually works)
                  deploy-staging.yml      ──▶  Fails immediately        ❌ (broken since Apr 19)

PR opened    ──▶  Vercel native webhook  ──▶  Preview deployment       ✅ (actually works)
                  ci.yml checks job      ──▶  Runs on PR               ✅ (actually works)
```

### Verified Environment Inventory

| Environment    | Vercel                                              | Supabase                    | Domain                                | Status                             |
| -------------- | --------------------------------------------------- | --------------------------- | ------------------------------------- | ---------------------------------- |
| **Production** | `pt-2` (project `prj_5Oh3kAHVH32V75FGwvCucr1B418q`) | `vaicxfihdldgepzryhpd`      | auto-assigned `.vercel.app` or custom | **Live — deploys on push to main** |
| **PR Preview** | Auto-created per PR by Vercel native                | same `vaicxfihdldgepzryhpd` | auto-assigned preview URL             | **Live — automatic**               |
| **Staging**    | Does not exist                                      | Does not exist              | `staging.pt2.app` — never aliased     | **Does not exist**                 |

**Plan: Hobby.** Hobby plan has one production environment. All PR previews and the production deployment point to the same Supabase project. There is no environment isolation today.

### `deploy-staging.yml` Root Cause

The workflow fails with "workflow file issue" before any job runs. Root cause: it calls `ci.yml` as a reusable workflow:

```yaml
# deploy-staging.yml line 22
ci:
  uses: ./.github/workflows/ci.yml   # ← requires `on: workflow_call` in ci.yml
  secrets: inherit
```

`ci.yml` declares only `on: pull_request` and `on: workflow_dispatch`. It has no `on: workflow_call` trigger. GitHub rejects the workflow at parse time — zero jobs execute. This has been the state since April 19. `deploy-production.yml` has the identical defect (line 43).

**Consequence:** The Supabase migration job in `deploy-staging.yml` has **never run**. All remote migrations have been applied manually via `supabase db push`.

### What Actually Runs in CI Today

| Gate                                             | Trigger                   | Blocking                                        | Status        |
| ------------------------------------------------ | ------------------------- | ----------------------------------------------- | ------------- |
| Lint (`npm run lint`)                            | PR to main                | **Yes** — `checks` job, not `continue-on-error` | Working       |
| Type-check                                       | PR to main                | **Yes**                                         | Working       |
| Env drift guard (`PUBLISHABLE_OR_ANON_KEY` grep) | PR to main                | **Yes**                                         | Working       |
| Build (`npm run build`)                          | PR to main                | **Yes**                                         | Working       |
| Unit tests (`jest.node.config.js`)               | PR to main                | **No** — `continue-on-error: true`              | Advisory only |
| E2E (Playwright, local Supabase)                 | PR to main                | **No** — `continue-on-error: true`              | Advisory only |
| Migration lint (RPC self-injection)              | PR with migration changes | **Yes**                                         | Working       |
| Security gates (9 SQL assertions)                | PR with migration changes | **Yes**                                         | Working       |
| SRM link check                                   | PR/push with doc changes  | **Yes**                                         | Working       |
| Branch protection                                | —                         | **None configured**                             | Not enforced  |

**The financial enforcement lint rules added in Phase 1.4 run inside `npm run lint` — they ARE in the blocking `checks` job.** That is the one solid gate the financial rollout has in CI.

### What the Documentation Gets Wrong

| `CICD-PIPELINE-SPEC.md` / `ENVIRONMENT-FLOW.md` says | Reality                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| "No Vercel deployment or staging environment yet"    | Vercel IS deployed and auto-deploys on push to main via native integration     |
| `deploy-staging.yml`: Phase 1C "Planned"             | File exists, triggers, and fails immediately — has never executed a single job |
| "Staged deploy: preview → staging → prod"            | Actual path: PR preview → push to main → production (no staging hop)           |
| `deploy-production.yml`: Phase 2 "Planned"           | File exists but has never run (zero runs); tag-based releases not practiced    |
| "supabase db push" is the manual migration path      | Still accurate — it's the only migration path that has ever worked             |
| "pt-2-staging" Supabase project                      | Never created                                                                  |
| "staging.pt2.app"                                    | Never aliased; the alias step in deploy-staging.yml has never executed         |

### Migration Reality

Migrations are **manually pushed**. The sequence that actually happens when `main` is updated:

1. Vercel native webhook fires → production app deployed in ~60 seconds
2. Developer manually runs `supabase db push` to apply any new migrations to `vaicxfihdldgepzryhpd`
3. No automation, no verification, no rollback tooling

Steps 1 and 2 are decoupled and unordered — the app can go live before migrations land, or migrations can be pushed without triggering a deploy. For Wave 1 financial work this hasn't caused issues because Phase 1.4 shipped no new migrations. It is a latent risk for any future migration-bearing feature.

---

## Phase 1.5 Rollout: What "Deploy" Actually Means

Given this posture, the Phase 1.5 roadmap deliverable "staged deploy: preview → staging → prod" must be rewritten. The actual merge procedure is:

1. **Open PR**: `ref/financial-standard` → `main`
   - CI `checks` job runs: lint (financial rules enforced), type-check, build
   - Vercel creates a preview deployment automatically — use this for the operator UX walkthrough
2. **Approve and merge**: once CI green + operator walkthrough passed
3. **Vercel auto-deploys to production** within ~60 seconds of merge (native webhook)
4. **Run smoke check** against the production URL for the five financial routes: `recent-sessions`, `live-view`, `gaming-day-summary`, `anomaly-alerts`, `alerts`
5. **No migration needed** — Phase 1.5 carries no schema changes (Wave 1 is surface-only)

There is no staging hop. The PR preview IS the pre-merge validation environment.

---

## Broken Infrastructure — Fix Options

There are two defects worth addressing, in priority order:

### Fix 1 — `ci.yml` missing `workflow_call` (blocks deploy-staging.yml permanently)

Add one line to `ci.yml`:

```yaml
on:
  pull_request:
    branches: [main]
  workflow_dispatch:
  workflow_call:        # ← add this; allows deploy-staging/production to call ci.yml
```

This is a 1-line fix. Without it, `deploy-staging.yml` and `deploy-production.yml` will never execute a single job regardless of secrets.

### Fix 2 — `deploy-staging.yml` references non-existent staging infrastructure

Even after Fix 1, `deploy-staging.yml` references:
- `secrets.VERCEL_TOKEN` — must be set in GitHub Actions secrets
- `secrets.SUPABASE_STAGING_PROJECT_REF` — staging Supabase project does not exist
- `staging.pt2.app` alias — Vercel Hobby plan requires manual custom domain setup

The Vercel-side deployment job is also redundant: Vercel's native integration already deploys on push to `main`. Running a second `vercel deploy` via GitHub Actions after the native deploy has already fired doubles the deploy for no benefit.

**Pragmatic recommendation for Phase 1.5 scope:** Fix 1 only (add `workflow_call`). Retask `deploy-staging.yml` to handle the **Supabase migration step only** — remove the redundant Vercel deploy job, keep the `supabase db push` job (pointing to the single remote project, not a staging ref). This gives you automated migration application on merge without requiring infrastructure that doesn't exist.

---

## What Phase 1.5 EXEC-SPEC Should Scope for DevOps

| Workstream                               | Scope                                                                                                                         | Effort                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **WS-CICD-1**: Fix `workflow_call`       | Add `on: workflow_call` to `ci.yml`                                                                                           | Trivial — 1 line                        |
| **WS-CICD-2**: Retask deploy-staging.yml | Remove redundant Vercel deploy job; keep Supabase push step pointed at `vaicxfihdldgepzryhpd`; add migration smoke check      | Small                                   |
| **WS-CICD-3**: Branch protection         | Enable on `main`: require `checks` job + 1 review; block force-push                                                           | Admin action — not automatable by agent |
| **WS-DEPLOY**: Merge runbook             | PR → CI green → operator walkthrough on preview URL → merge → verify production deploy → smoke check 5 financial routes       | Documentation                           |
| **WS-OPS**: Operator UX walkthrough      | Use the Vercel PR preview deployment; pit boss confirms FinancialValue, AttributionRatio, CompletenessBadge are interpretable | Human gate                              |
| **WS-RETRO**: Wave 1 retrospective       | Document infra gap, Q1–Q4 deferral rationale, Wave 2 prerequisite list (staging env, migration automation, branch protection) | Documentation                           |

**Out of scope for Phase 1.5:** Provisioning `pt-2-staging` Supabase project, Vercel environment configuration beyond the hobby-plan production slot, production tag release process. These are Wave 2 prerequisites, not Wave 1 close gates.
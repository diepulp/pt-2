# CI/CD Standardization — Progress Report

> **Date:** 2026-02-13
> **Status:** Phase 1A — In Progress
> **Branch:** dev-onboarding-wizard
> **Commit:** `96f49d9` (docs(devops): standardize CI/CD pipeline spec, environment flow, and type system guidance)

---

## What Was Done

### 1. Investigation (Complete)

A three-stream parallel investigation compared the documented environment flow against application reality:

| Stream | Agent | Scope | Key Finding |
|--------|-------|-------|-------------|
| **CI/CD & Config** | Explore | Workflows, Vercel, scripts, hooks, Docker, env vars | 3 active workflows, 7 pre-commit hooks, 50 npm scripts. No Vercel. No Docker. |
| **Supabase Remote** | Explore | Client setup, config, migrations, types, auth, branching | Single remote project (`vaicxfihdldgepzryhpd`), 177 migrations, manual `db push`, no staging |
| **Security & ADRs** | Explore | ADR-015/020/024/030, SEC-001/002, SRM, governance | 5 hard security invariants constrain pipeline design |

**Output:** `docs/issues/gaps/devops/INV-CICD-ENVIRONMENT-FLOW-FINDINGS.md`

**Top-level finding:** The gap is not CI — it's CD. Strong validation gates exist but zero deployment automation.

---

### 2. Type System Alignment (Complete)

A fourth investigation audited the dual type system posture:

| Aspect | Before | After |
|--------|--------|-------|
| CLAUDE.md guidance | "Import from `types/remote/database.types.ts` only" | "Import from `@/types/database.types` for all application code" |
| Quick Reference | `npm run db:types` listed as only command | `npm run db:types-local` (primary), `npm run db:types` (remote validation) |
| Codebase reality | 276 files import `@/types/database.types`, 0 import remote | No code changes needed — already standardized |
| ADR-001 | Dual-file strategy accepted | Confirmed: local = canonical, remote = validation copy |
| File sync | Both files byte-identical (MD5 match) | No divergence risk |

---

### 3. Canonical Documentation Created (Complete)

Two new governance docs in `docs/deployments/`:

| Document | ID | Content |
|----------|-----|---------|
| **CICD-PIPELINE-SPEC.md** | CICD-SPEC-001 | 6 PR validation gates, 3 workflow inventory, 7 pre-commit hooks, security invariant enforcement matrix, type generation strategy, phased rollout, governance rules |
| **ENVIRONMENT-FLOW.md** | ENV-SPEC-001 | Current 2-env architecture (with diagrams), Supabase remote workflow (the missing documentation), target 3-env architecture, env vars per environment, migration flow, connection pooling, deployment checklists |

These are **canonical system governance** — not the skill artifact (`deployment-guide.md`), which remains aspirational and will be adjusted after CI/CD is standardized and accepted.

---

### 4. CI Workflow Updated (Complete)

**File:** `.github/workflows/ci.yml`

| Change | Detail |
|--------|--------|
| **Added Build gate** | `npm run build` with stub env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for CI-only build validation |

The build gate catches Next.js compilation failures, runtime import errors, missing modules, and SSR issues before merge.

---

### 5. CLAUDE.md Updated (Complete)

| Section | Change |
|---------|--------|
| Quick Reference | Added `db:types-local` as primary, demoted `db:types` to validation |
| Critical Guardrails #1 | Fixed canonical import path to `@/types/database.types` |
| Documentation section | Added references to `docs/deployments/` specs |

---

## Suggestion Incorporation Status

Mapping each suggestion from `PT-2-CICD-INFRA-REVIEW-SUGGESTIONS.md` to work done:

| # | Suggestion | Status | What Was Done | What Remains |
|---|-----------|--------|---------------|-------------|
| **1** | Stop treating single remote as "whatever it is" — create `pt-2-staging` | Documented | Target architecture in ENVIRONMENT-FLOW.md §3, deployment checklist in §8 | **Create the staging project** (manual, 30 min) |
| **2** | Make `ci.yml` complete — 3 missing gates | Partial | Build gate added. Typegen drift and migration sanity documented in CICD-PIPELINE-SPEC.md §2 | **Typegen drift gate** (needs Supabase local in CI). **Migration apply sanity** (needs Supabase local in CI) |
| **3** | Don't hook Vercel until DB deploy step exists | Adopted | Migration-first deployment constraint documented in ENVIRONMENT-FLOW.md §5 and CICD-PIPELINE-SPEC.md §8 | Deploy workflow authoring (Phase 1C) |
| **4** | Fix docs — split into "today vs target" | Done | ENVIRONMENT-FLOW.md §1 (today) and §3 (target) with clear separation | Skill artifact (`deployment-guide.md`) adjustment deferred |
| **5** | Deploy-time security invariant check | Documented | Security invariant matrix in CICD-PIPELINE-SPEC.md §6; bypass jailing deploy gate specified | Wire into `deploy-staging.yml` (Phase 1C) |
| **6** | Enforce ONE canonical import surface for types | Done | CLAUDE.md fixed. CICD-PIPELINE-SPEC.md §7 documents canonical posture. 276 files confirmed on `@/types/database.types` | No remaining work |
| **7** | Add smoke-test harness now | Documented | Smoke assertions specified in CICD-PIPELINE-SPEC.md §8 (Phase 1C) | Script authoring + integration |

---

## Artifacts Inventory

### Created This Session

| File | Type | Purpose |
|------|------|---------|
| `docs/deployments/CICD-PIPELINE-SPEC.md` | Governance | Canonical CI/CD pipeline specification |
| `docs/deployments/ENVIRONMENT-FLOW.md` | Governance | Environment architecture and Supabase remote flow |
| `docs/issues/gaps/devops/INV-CICD-ENVIRONMENT-FLOW-FINDINGS.md` | Investigation | Full gap analysis and findings |
| `docs/issues/gaps/devops/CICD-STANDARDIZATION-PROGRESS.md` | Progress | This report |

### Modified This Session

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Added Build gate (Phase 1A) |
| `.claude/CLAUDE.md` | Fixed types guidance, added deployment docs references |

### Pre-Existing (Input Documents)

| File | Role |
|------|------|
| `docs/issues/gaps/devops/PT-2-INITIAL-CICD-SETUP.md` | Recommendations (10 sections, ~40% addressed) |
| `docs/issues/gaps/devops/PT-2-CICD-INFRA-REVIEW-SUGGESTIONS.md` | External review suggestions (7 items, 3 complete, 4 documented/in-progress) |
| `.claude/skills/devops-pt2/references/deployment-guide.md` | Skill artifact (aspirational, NOT canonical — will adjust later) |

---

## Current CI Gate Status

```
ci.yml (PR to main)
├── [1] Lint                    ✅ Active (existing)
├── [2] Type Check              ✅ Active (existing)
├── [3] RLS Write-Path Lint     ✅ Active (existing, ADR-034)
├── [4] Test                    ✅ Active (existing)
├── [5] Build                   ✅ Active (NEW — this session)
├── [6] Typegen Drift           ⏳ Specified, needs Supabase local in CI
└── [7] Migration Apply Sanity  ⏳ Specified, needs Supabase local in CI

migration-lint.yml (PR with migration changes)
└── RPC Self-Injection          ✅ Active (existing)

check-srm-links.yml (PR with doc changes)
└── SRM Link Verification       ✅ Active (existing)
```

---

## Next Steps (Prioritized)

### Immediate — Complete Phase 1A CI

| # | Task | Effort | Dependency | Impact |
|---|------|--------|------------|--------|
| 1 | **Add Supabase local to CI** for typegen drift + migration sanity | 2 hr | None — uses `supabase start` in GitHub Actions | Closes the two remaining Phase 1A gates |
| 2 | **Add migration naming validation** to CI | 15 min | None — `scripts/validate-migration-names.sh` already exists | Catches naming violations at PR time |

### Short-Term — Phase 1B Staging Environment

| # | Task | Effort | Dependency | Impact |
|---|------|--------|------------|--------|
| 3 | **Create Supabase staging project** (`pt-2-staging`) | 30 min | Manual (dashboard) | Stops dual-purposing the shared remote |
| 4 | **Create Vercel project** and link to repo | 30 min | Manual (Vercel dashboard) | Enables deployment target |
| 5 | **Add `vercel.json` to project root** | 15 min | Vercel project exists | Security headers, region config, API route durations |
| 6 | **Add security headers to `next.config.ts`** | 30 min | None | HSTS, X-Frame-Options, CSP baseline |
| 7 | **Wire env vars** (staging Supabase URL/keys in Vercel) | 30 min | Both projects exist | Staging connects to staging DB |

### Medium-Term — Phase 1C CD Pipeline

| # | Task | Effort | Dependency | Impact |
|---|------|--------|------------|--------|
| 8 | **Author `deploy-staging.yml`** | 3 hr | Phase 1B complete | Automated: merge to main → migrate → deploy → smoke |
| 9 | **Create `scripts/verify-deploy.sh`** smoke test harness | 2 hr | Staging exists | RLS context, cross-casino denial, critical RPC checks |
| 10 | **Add `SUPABASE_ACCESS_TOKEN` to GitHub secrets** | 10 min | Staging project | Supabase CLI auth in CI |

### Later — Phase 2 Production

| # | Task | Effort | Dependency | Impact |
|---|------|--------|------------|--------|
| 11 | Create Supabase `pt-2-prod` project | 30 min | Phase 1C validated | Production database |
| 12 | Author `deploy-production.yml` (tag `v*` trigger) | 3 hr | Phase 1C validated | Promotion model |
| 13 | Document rollback runbook | 2 hr | Production exists | Operational safety |
| 14 | Adjust `deployment-guide.md` skill artifact | 1 hr | Pipeline accepted | Align skill with reality |

---

## Risk Register (Updated)

| Risk | Status | Mitigation |
|------|--------|------------|
| Single remote = shared "prod-ish" | **Open** — highest priority | Phase 1B: create staging project |
| Build failures not caught in CI | **Closed** — build gate added | Gate #5 in ci.yml |
| Type drift undetected | **Documented** — pending ephemeral DB in CI | CICD-PIPELINE-SPEC.md §2 Gate 6 |
| CLAUDE.md types guidance stale | **Closed** — fixed to `@/types/database.types` | Commit `96f49d9` |
| Deployment guide describes non-existent infra | **Mitigated** — canonical docs created | `docs/deployments/` is source of truth; skill artifact deferred |
| Manual `db push` with no verification | **Open** — CD does not exist yet | Phase 1C: `deploy-staging.yml` |
| No rollback path | **Open** — no CD exists | Phase 2: Vercel instant rollback + forward-fix migrations |

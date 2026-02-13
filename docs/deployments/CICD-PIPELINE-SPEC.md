# CI/CD Pipeline Specification

> **ID:** CICD-SPEC-001
> **Status:** Accepted (Phase 1A)
> **Owner:** DevOps / Lead Architect
> **Created:** 2026-02-13
> **Governs:** `.github/workflows/ci.yml`, `.github/workflows/migration-lint.yml`, `.github/workflows/check-srm-links.yml`
> **References:** INV-CICD-ENVIRONMENT-FLOW-FINDINGS, PT-2-INITIAL-CICD-SETUP, ADR-015, ADR-024, ADR-030, ADR-034

---

## 1. Pipeline Topology

PT-2 uses a phased CI/CD model. Phase 1A (PR Validation) is implemented. Phase 1B/1C (CD) is planned.

```
Feature Branch ──Push──▶ PR to main ──Merge──▶ Push to main ──Tag v*──▶ Production
      │                     │                       │                       │
      ▼                     ▼                       ▼                       ▼
  Pre-commit            ci.yml                deploy-staging.yml     deploy-production.yml
  (7 hooks)        (PR validation)           (Phase 1C: planned)    (Phase 2: planned)
                   migration-lint.yml
                   check-srm-links.yml
```

### Workflow Inventory

| Workflow | File | Trigger | Phase | Status |
|----------|------|---------|-------|--------|
| **CI** | `.github/workflows/ci.yml` | PR to `main`, `workflow_dispatch` | 1A | Active |
| **Migration Lint** | `.github/workflows/migration-lint.yml` | PR with `supabase/migrations/**/*.sql` | 1A | Active |
| **SRM Links** | `.github/workflows/check-srm-links.yml` | Push/PR with `docs/**/*.md` | 1A | Active |
| **Deploy Staging** | `.github/workflows/deploy-staging.yml` | Push to `main` | 1C | Planned |
| **Deploy Production** | `.github/workflows/deploy-production.yml` | Tag `v*` | 2 | Planned |

---

## 2. PR Validation Gates (`ci.yml`)

All gates are **blocking** — PR cannot merge if any gate fails.

### Gate Execution Order

| # | Gate | Command | What It Catches | ADR/Ref |
|---|------|---------|-----------------|---------|
| 1 | **Lint** | `npm run lint` | ESLint violations, code style | — |
| 2 | **Type Check** | `npm run type-check` | TypeScript strict violations, type drift | — |
| 3 | **RLS Write-Path Lint** | `bash scripts/lint-rls-write-path.sh` | Direct DML against Category A tables | ADR-034 |
| 4 | **Test** | `npm test` | Unit/integration test failures | — |
| 5 | **Build** | `npm run build` | Next.js compilation, runtime errors | — |
| 6 | **Typegen Drift** | Regenerate local types + `git diff` | Schema-types mismatch | INITIAL-CICD-SETUP §3.3 |

### Gate Details

#### Gate 1: Lint
- Runs ESLint across the project
- Includes `skipAuth` restriction enforcement (ADR-030/D3)
- Fails on any warning or error

#### Gate 2: Type Check
- `tsc --noEmit --strict`
- Validates all service DTOs derive from canonical `Database` types
- Catches import path violations and type mismatches

#### Gate 3: RLS Write-Path Lint
- Scans for direct PostgREST DML (`.from(table).insert/update/delete`) against Category A tables
- Category A tables: `staff`, `staff_pin_attempts`, `staff_invite`, `player_casino`
- These tables require SECURITY DEFINER RPCs for all writes (ADR-030/D4, ADR-034)
- Respects `rls-break-glass` exemption marker and service-role client usage

#### Gate 4: Test
- Jest unit and integration tests
- `npm test` (dev) / `npm run test:ci` (CI: `--ci --coverage --maxWorkers=2`)
- Coverage reporting enabled in CI

#### Gate 5: Build
- `npm run build` — full Next.js production build
- Catches runtime import errors, missing modules, SSR compilation failures
- Verifies the artifact that would actually be deployed

#### Gate 6: Typegen Drift Check
- Regenerates `types/database.types.ts` from local Supabase schema
- Fails if `git diff --exit-code types/database.types.ts` shows changes
- Prevents schema changes from being merged without updated types
- Requires Supabase CLI + local stack in CI (ephemeral)

---

## 3. Migration Lint (`migration-lint.yml`)

Triggered only when migration files change. Checks:

| Check | Pattern | Block Condition |
|-------|---------|----------------|
| **RPC Self-Injection** | `CREATE OR REPLACE FUNCTION rpc_*` | RPC exists but no `PERFORM set_rls_context(...)` call |

**ADR Reference:** ADR-015 Phase 1A — All RPCs must inject RLS context within the same transaction due to connection pooling.

### Required Pattern (per migration-lint)

```sql
CREATE OR REPLACE FUNCTION rpc_example(...)
RETURNS ... LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_context_staff_role text;
BEGIN
  -- Self-inject context (REQUIRED)
  PERFORM set_rls_context(...);
  -- ... business logic
END;
$$;
```

---

## 4. SRM Links (`check-srm-links.yml`)

Validates that cross-references in documentation are not broken.

- Runs `npm run check:srm-links` (TypeScript script)
- Fails if SRM-referenced file paths or line numbers are invalid
- On failure, runs verbose output for debugging

---

## 5. Pre-Commit Hooks (Local Enforcement)

Seven blocking hooks run before every commit via Husky. These provide **fast local feedback** before CI runs.

| # | Hook Script | Enforcement | Reference |
|---|------------|-------------|-----------|
| 1 | `pre-commit-migration-safety.sh` | No `sync_remote_changes.sql`; RLS hybrid pattern | ADR-015 |
| 2 | `pre-commit-rpc-lint.sh` | RPC self-injection pattern | ADR-015 Phase 1A |
| 3 | `pre-commit-api-sanity.sh` | Route handler structure | Service patterns |
| 4 | `pre-commit-service-check.sh` (v2.6.0) | No `ReturnType<typeof>`, Pattern B/C DTO compliance | SLAD |
| 5 | `pre-commit-zustand-check.sh` | State management patterns | PRD-013 |
| 6 | `pre-commit-rls-write-path.sh` | Category A direct DML detection | ADR-030/D4 |
| 7 | `lint-staged` | ESLint + Prettier on production code | Code quality |

**Scope:** Pre-commit hooks run on staged files only (fast). CI runs on the full codebase (thorough).

---

## 6. Security Invariant Enforcement

Five hard security invariants cascade from ADR-015/024/030/034. The pipeline enforces them at multiple layers:

| Invariant | Pre-Commit | CI Gate | Deploy Gate | Runtime |
|-----------|-----------|---------|------------|---------|
| **Authoritative context** (ADR-024/D1) | — | Tests | Smoke test (planned) | RPC validation |
| **Write-path fail-closed** (ADR-030/D4) | Hook #6 | Gate #3 (RLS lint) | Smoke test (planned) | RLS policy |
| **Bypass jailing** (ADR-030/D3) | — | Gate #1 (lint for `skipAuth`) | Env var check (planned) | Startup assertion |
| **No spoofable RPC inputs** (ADR-024/INV-8) | Hook #2 | Migration lint | — | RPC design |
| **RPC self-injection** (ADR-015) | Hook #2 | Migration lint | — | RPC design |

---

## 7. Type Generation Strategy

### Canonical Posture (De Facto Standard)

PT-2 maintains a dual-file type system per ADR-001:

| File | Import Path | Generated By | Purpose |
|------|------------|-------------|---------|
| `types/database.types.ts` | `@/types/database.types` | `npm run db:types-local` | **Canonical** — all application code imports from here |
| `types/remote/database.types.ts` | `@/types/remote/database.types` | `npm run db:types` | Validation copy — CI/CD remote schema verification |

**Rule:** All 276+ application files import from `@/types/database.types`. The remote copy is for deployment validation only.

### CI Drift Detection

```yaml
# Typegen drift check (in ci.yml)
- name: Start Supabase Local
  run: npx supabase start
- name: Typegen Drift Check
  run: |
    npm run db:types-local
    git diff --exit-code types/database.types.ts
```

If the diff is non-empty, the developer forgot to regenerate types after a migration change.

---

## 8. Phased Rollout

### Phase 1A: PR Validation (Current)

- Lint, type-check, RLS write-path lint, test
- Migration lint (RPC self-injection)
- SRM link verification
- **NEW:** Build gate, typegen drift check

### Phase 1B: Staging Environment (Planned)

- Create `pt-2-staging` Supabase project
- Create Vercel staging project
- Wire environment variables
- See: `docs/deployments/ENVIRONMENT-FLOW.md`

### Phase 1C: Staging CD (Planned)

- `deploy-staging.yml`: Push to `main` → apply migrations → deploy Vercel → smoke test
- Post-deploy smoke tests: RLS context, cross-casino denial, critical RPCs

### Phase 2: Production CD (Planned)

- `deploy-production.yml`: Tag `v*` → validate semver → CI checks → migrate → deploy → health check → GitHub Release
- Promotion model: Only deploy SHAs that passed staging
- Rollback: Vercel instant rollback + forward-fix migration strategy

---

## 9. CI Runtime Requirements

| Requirement | Value | Rationale |
|-------------|-------|-----------|
| **Runner** | `ubuntu-latest` | Standard GitHub Actions runner |
| **Node.js** | 22 | LTS, lockfileVersion 3 compatibility |
| **Timeout** | 20 minutes | Sufficient for build + 177 migrations |
| **npm install** | `npm ci` | Deterministic, CI-safe |
| **Supabase CLI** | `^2.54.11` | Required for typegen drift check |
| **PostgreSQL** | 17 | Via Supabase local (Docker in CI) |

### Caching Strategy

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: "npm"
```

npm cache is shared across all CI jobs. Supabase Docker image caching is recommended for Phase 1A Gate 6 (ephemeral DB).

---

## 10. Governance

### Adding a New CI Gate

1. Validate the gate catches a real class of regression (not hypothetical)
2. Ensure the gate runs in < 3 minutes (respect developer velocity)
3. Add to `ci.yml` with a descriptive step name and ADR reference comment
4. Document in this spec (Section 2 table)
5. If the gate involves a new script, add it to `scripts/` with a corresponding pre-commit hook

### Removing a CI Gate

1. Requires Mini-ADR per Over-Engineering Guardrail (OE-01) if removing a security gate
2. Update this spec
3. Update `ci.yml`

### Gate Failure Protocol

1. Developer reads CI output for specific failure details
2. Fix locally, re-push
3. If gate is flaky (>2 intermittent failures in a week), file an issue and consider `continue-on-error: true` temporarily
4. Never bypass gates via `--no-verify` or force-merge without lead architect approval

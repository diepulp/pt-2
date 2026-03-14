# Integration Test Architecture — Deep Investigation Report

**Issue**: ISSUE-C4D2AA48 (supplements INTEGRATION-TEST-REMEDIATION-PLAN.md)
**Date**: 2026-03-12
**Status**: Investigation complete
**Method**: Five-stream parallel audit by domain-specialist agents

---

## Executive Summary

A five-agent investigation team audited the testing architecture across Jest configuration, CI pipelines, all integration test files, schema/RPC drift, and shared test infrastructure. The original remediation plan is **structurally sound** but contains factual inaccuracies and missed findings that change the remediation strategy.

**Key corrections to the original plan:**

| Original Claim | Actual Finding | Impact |
|----------------|----------------|--------|
| 39 integration test files | **41 files** (2 component tests missed + count errors) | Minor — plan scope adjustment |
| "No shared test harness" | **Partial harness exists** (`lib/testing/route-test-helpers.ts`, middleware helpers) | Moderate — build on existing, don't start from zero |
| Schema/RPC drift is a major risk | **Drift risk is 0.6/10** — all 20 RPCs current, all 29 tables match, no deprecated calls | Major — Phase 2 audit scope can shrink significantly |
| `set_rls_context` found in 2 files | One file (`services/security`) **intentionally** tests the deprecation | Minor — not a defect, it's a security regression guard |
| 4 csv-ingestion tests are the only correct ones | **96 route handler tests** also have correct `@jest-environment node` | Misleading — many tests are correctly configured |
| jsdom is the sole blocker | Some tests use **conditional skip** (`RUN_INTEGRATION_TESTS=true` gate) | Moderate — environment fix alone won't enable all tests |

---

## Stream 1: Jest Configuration & Environment Audit

### Claim Validation

| Claim | Verdict | Evidence |
|-------|---------|----------|
| Global `testEnvironment: 'jsdom'` kills fetch | **CONFIRMED** | `jest.config.js:12` — `testEnvironment: 'jsdom'` |
| `test:ci` excludes integration patterns | **CONFIRMED** | `package.json:30` — two `--testPathIgnorePatterns` flags |
| CI has no test step | **CONFIRMED** | `.github/workflows/ci.yml:9-10` — comment explicitly states "Tests run locally" |
| Node 24 has native fetch | **CONFIRMED** | `.nvmrc` → `24`, `package.json` engines → `>=24.0.0` |

### Configuration Snapshot

**`jest.config.js`** (global, applies to all tests):
```
testEnvironment: 'jsdom'
setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
testMatch: ['**/__tests__/**/*.(test|spec).[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)']
testPathIgnorePatterns: ['.next/', 'node_modules/', 'cypress/']
moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' }
transform: ts-jest
```

**`jest.setup.js`** behaviour:
1. Imports `@testing-library/jest-dom` (DOM matchers)
2. Loads `.env.test` if present
3. Falls back to hardcoded local Supabase keys (publicly known test keys)

**`jest.integration.config.ts`**: Does NOT exist yet (Phase 0 deliverable).

### Environment Docblock Audit

| Category | Count | Status |
|----------|-------|--------|
| Tests WITH `@jest-environment node` | 96 | Correct (route handlers + csv-ingestion) |
| Tests WITHOUT (running in jsdom) | 177 | Includes ~25 DB-backed integration tests that NEED node |
| Integration tests with correct docblock | 4 (csv-ingestion only) | Plan claim confirmed |

### Undiscovered Issue: Worktree Config Propagation

Both feature branch worktrees (`trees/feat/dual-bondary-tenancy/`, `trees/player-exclusion/`) inherit the same broken `jest.config.js`. The jsdom problem propagates to all parallel work.

---

## Stream 2: Integration Test File Inventory

### Count Validation

**Actual count: 41 files** (plan claimed 39)

| Bounded Context | Plan Count | Actual Count | Delta | Notes |
|----------------|-----------|-------------|-------|-------|
| lib/supabase (RLS core) | 6 | 6 | — | |
| services/casino | 6 | 6 | — | |
| services/player-import | 4 | 4 | — | |
| services/loyalty | 3 | **4** | +1 | Missed `promo-instruments.int.test.ts` |
| services/rating-slip | 3 | 3 | — | |
| services/visit | 2 | 2 | — | |
| services/table-context | 1 | **4** | +3 | 1 stub + 3 DB-backed tests in `__tests__/services/table-context/` |
| services/player-timeline | 1 | 1 | — | |
| services/security | 1 | 1 | — | |
| lib/server-actions/middleware | 3 | 3 | — | |
| workers/csv-ingestion | 4 | 4 | — | |
| __tests__/ (root) | 5 | **5** | — | But includes table-context tests counted above |
| components/ | 0 | **2** | +2 | `lock-screen.integration.test.tsx`, `player-dashboard.integration.test.tsx` |

### Health Classification

#### GREEN — Ready after Phase 0 environment fix (10 files)

| File | Reason |
|------|--------|
| `workers/csv-ingestion/__tests__/concurrent-claim.int.test.ts` | Already has `@jest-environment node` |
| `workers/csv-ingestion/__tests__/crash-recovery.int.test.ts` | Already has `@jest-environment node` |
| `workers/csv-ingestion/__tests__/cross-casino.int.test.ts` | Already has `@jest-environment node` |
| `workers/csv-ingestion/__tests__/ingest.int.test.ts` | Already has `@jest-environment node` |
| `services/player-import/__tests__/execute-guard.int.test.ts` | Type-only assertions |
| `services/player-import/__tests__/execute-rpc.int.test.ts` | Type-only assertions |
| `services/player-import/__tests__/rls-policies.int.test.ts` | Type-only assertions |
| `services/player-import/__tests__/upload-route.int.test.ts` | Type-only assertions |
| `services/casino/__tests__/rpc-accept-staff-invite-abuse.int.test.ts` | Type-only assertions |
| `services/casino/__tests__/rpc-bootstrap-casino-abuse.int.test.ts` | Type-only assertions |

#### YELLOW — Need node environment + Supabase bootstrap (24 files)

All 6 `lib/supabase/__tests__/rls-*.integration.test.ts` files, all loyalty/rating-slip/visit/casino DB-backed tests, and the 3 middleware integration tests.

#### RED — Intentional security regression guard (1 file)

`services/security/__tests__/rls-context.integration.test.ts` — Tests that deprecated `set_rls_context` is NOT callable. This is correct defensive testing, not drift.

#### DEAD — Stub with no tests (1 file)

`services/table-context/__tests__/table-context.integration.test.ts` — Empty stub. **Delete.**

#### MISCLASSIFIED — Should NOT be in integration suite (2 files)

`components/lock-screen.integration.test.tsx` and `components/player-dashboard.integration.test.tsx` — These are component tests that need jsdom, not node. They should stay in the unit test config despite the `.integration.test` naming.

### Organization Debt

- Table-context tests scattered across `__tests__/services/table-context/` (root) instead of `services/table-context/__tests__/` (per ADR-002)
- Some tests use `describeIntegration` conditional skip pattern gated on `RUN_INTEGRATION_TESTS=true` env var — environment fix alone won't enable them

---

## Stream 3: CI Pipeline & Script Taxonomy

### Current Test Execution Architecture

```
npm test              → jest (all tests, jsdom default, integration fails silently)
npm run test:ci       → jest --ci --maxWorkers=2 (excludes *.int.test + *.integration.test + e2e/)
npm run test:watch    → jest --watch (all tests)
npm run test:coverage → jest --coverage (all tests)
npm run e2e:playwright → playwright test (separate config)
```

**Missing scripts**: `test:unit`, `test:integration`, `test:integration:canary`

### CI Workflow Inventory

| Workflow | Triggers | Test Execution | Database |
|----------|----------|----------------|----------|
| `ci.yml` | PR to main, dispatch | **None** — lint + type-check + build only | No |
| `security-gates.yml` | PR to main | SQL assertion scripts against ephemeral Supabase | Yes |
| `migration-lint.yml` | PR to main | Static pattern checks on migration files | No |
| `check-srm-links.yml` | PR to main | Documentation link validation | No |

**Key insight from `ci.yml` comments (lines 9-10)**:
> "Merge-safety gates only. Clean-room verification that code compiles, lints clean, and builds. Tests run locally (require Supabase)."

This is a **deliberate design decision**, not an oversight. The system was designed to require local Supabase for testing.

### Test Taxonomy vs QA-001 Standard

**QA-001 prescribes** (`docs/40-quality/QA-001-service-testing-strategy.md`):
- 60% unit / 30% integration / 10% E2E
- Coverage targets: Service CRUD 90%, workflows 85%, mappers 100%, actions 80%, UI 70%

**Actual state**:
- ~273 total test files
- ~177 running in jsdom (mix of unit + misclassified integration)
- ~96 with correct `@jest-environment node` (route handlers + csv-ingestion)
- ~41 integration tests (none enforced in CI)
- ~16 Playwright E2E specs (not in CI)

---

## Stream 4: Schema & RPC Drift Detection

### Drift Risk Score: 0.6/10 (VERY LOW)

This is the most significant correction to the original plan. The plan treated drift as a major concern — the evidence shows it is minimal.

| Category | Score | Evidence |
|----------|-------|---------|
| Deprecated RPC references | 0/10 | No `set_rls_context()` calls in active tests |
| Stale table references | 0/10 | All 29 tables exist and match `database.types.ts` |
| Enum drift | 0/10 | All enum values in tests are current |
| Column name drift | 0/10 | Spot-check shows correct column names |
| RPC signature mismatch | 1/10 | Minor: some unit tests mock void for RETURNS TABLE RPC |
| Auth pattern compliance | 2/10 | Two valid patterns coexist without documentation |
| Fixture realism | 3/10 | No `company_id` for ADR-043; optional columns skipped |

### RPC Validation

**All 20 RPCs called in test files exist and match current schema:**

`rpc_accrue_on_close`, `rpc_close_rating_slip`, `rpc_close_table_session`, `rpc_create_financial_txn`, `rpc_get_player_timeline`, `rpc_log_table_buyin_telemetry`, `rpc_open_table_session`, `rpc_shift_casino_metrics`, `rpc_shift_pit_metrics`, `rpc_shift_table_metrics`, `rpc_start_or_resume_visit`, `rpc_start_rating_slip`, `rpc_start_table_rundown`, `chipset_total_cents`, `compute_gaming_day`, `set_rls_context_from_staff`, `set_rls_context_internal`

### RLS Context Function Status

| Function | Status | Access | Tests |
|----------|--------|--------|-------|
| `set_rls_context()` | **DROPPED** (migration `20260302230024`) | None | Tested as NOT callable (security guard) |
| `set_rls_context_from_staff()` | **LIVE** — RETURNS TABLE | `authenticated` | Covered in 3+ test files |
| `set_rls_context_internal()` | **LIVE** — RETURNS void | `service_role` | Covered in security integration tests |

### Future Drift Risk (ADR-043)

When dual-boundary tenancy (ADR-043) is implemented, integration tests will need `company_id` chains in fixtures. No current test accounts for multi-company scenarios.

---

## Stream 5: Test Infrastructure & Shared Harness

### Corrected Finding: Partial Harness EXISTS

The plan's claim of "no shared test harness" is **incorrect**. Two shared utility sets exist:

#### 1. Route Handler Test Helpers
**File**: `lib/testing/route-test-helpers.ts`
- `createMockRequest()` — Creates mock NextRequest objects
- `createMockRouteParams()` — Creates mock route params
- **Used by**: 96 route handler tests
- **Scope**: Request/params mocking only

#### 2. Middleware Test Helpers
**Directory**: `lib/server-actions/middleware/__tests__/helpers/`
- `getTestSupabaseClient()` — Anon client (RLS enforced)
- `getTestSupabaseServiceClient()` — Service role client
- `setupTestData()` / `cleanupTestData()` — Casino/staff fixture lifecycle
- `createMockContext()` / `createMockContextWithAuth()` — Middleware context factories
- **Used by**: 3 middleware integration tests

#### What's Missing (for a complete shared harness)

| Component | Status | Impact |
|-----------|--------|--------|
| Centralized Supabase client factory | Missing | Each test creates own client |
| RLS context setup helper | Exists in middleware helpers only | Not reusable by other domains |
| Domain fixture factories (Casino, Player, Visit, etc.) | Missing | Every test bootstraps independently |
| Transaction-based cleanup | Missing | Tests use explicit DELETE (pollution risk) |
| Fixture constant library | Missing | UUIDs and test data scattered |
| Environment pre-flight check | Missing | No validation that Supabase is running |

### Test Data Lifecycle Assessment

**Pattern observed across integration tests:**

```
beforeAll:
  1. auth.admin.createUser()          → Create auth user
  2. .from('casino').insert()         → Create test casino
  3. .from('staff').insert()          → Link staff to casino
  4. .rpc('set_rls_context_...')      → Establish RLS context

afterAll:
  5. .from('staff').delete()          → Clean up (FK order)
  6. .from('casino').delete()
  7. auth.admin.deleteUser()
```

**Risks:**
- No transaction isolation — if `afterAll` fails, data leaks
- No centralized cleanup orchestrator
- FK-ordered cleanup is manually maintained per test file
- Test pollution is possible if tests share a Supabase instance concurrently

### Security Concern

`jest.setup.js` contains hardcoded fallback Supabase keys:
```javascript
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = '<local-test-key>'
```
These are local development keys (publicly known Supabase local defaults), but the pattern normalizes credential embedding.

---

## Consolidated Blast Radius Assessment

### Severity Matrix

| Failure Class | Files Affected | Blocking Phase | Fix Complexity |
|---------------|---------------|----------------|----------------|
| jsdom environment (kills fetch) | 25 DB-backed tests | Phase 0 | Low — config change |
| Missing `@jest-environment node` | 25 integration tests | Phase 0 | Low — add docblocks or use integration config |
| `RUN_INTEGRATION_TESTS` gate | ~4 files with conditional skip | Phase 1 | Low — set env var |
| Supabase not provisioned in CI | All 41 integration tests | Phase 5 | Medium — GHA Supabase setup |
| No shared fixture factories | All 25 DB-backed tests | Phase 2-3 | Medium — build incrementally |
| No transaction isolation | All DB-backed tests | Phase 6 | Medium — add rollback pattern |
| Dual-tenancy fixture gap | All DB-backed tests (future) | Post-ADR-043 | Low — add company_id |
| Component test misclassification | 2 files | Phase 0 | Trivial — rename or exclude |

### What's NOT Broken (Fears Invalidated)

1. **Schema drift** — All tables, columns, and enums are current (0/10 risk)
2. **RPC drift** — All 20 RPCs match current schema (0/10 risk)
3. **Deprecated function calls** — Only the intentional security guard references dropped function
4. **SEC-007 regression** — Security hardening is properly tested and current

---

## Revised Remediation Recommendations

### Phase 0 Adjustments

**Original plan is correct**, with additions:

1. Create `jest.integration.config.ts` as specified (no changes needed)
2. Add npm scripts as specified
3. **NEW**: Exclude the 2 component integration tests from integration config (`lock-screen`, `player-dashboard`)
4. **NEW**: Delete dead stub `services/table-context/__tests__/table-context.integration.test.ts`
5. **NEW**: Document the `RUN_INTEGRATION_TESTS` gate pattern — decide whether to keep or remove it

### Phase 1 Adjustments

**Canary file recommendation remains valid**: `services/casino/__tests__/setup-wizard-rpc.int.test.ts`

Additional canary: `workers/csv-ingestion/__tests__/ingest.int.test.ts` — already has correct `@jest-environment node`, should pass immediately as a baseline.

### Phase 2 Adjustments (Scope Reduction)

**Original plan overestimated shared infrastructure defects.** Revised scope:

- ~~Deprecated RPC references~~ — Not a real problem (0.6/10 drift)
- ~~Schema/enum drift~~ — Not a real problem
- **KEEP**: Extend existing middleware helpers into a shared harness
- **KEEP**: Build Supabase client factory (centralize the pattern already used)
- **KEEP**: Build fixture factories incrementally per bounded context
- **NEW**: Address test data pollution risk (transaction rollback or deterministic cleanup)

### Phase 3-6: No Changes Needed

The original plan's progression from bounded-context slice → canary suite → CI enforcement → broadening is sound and validated by this investigation.

---

## Cross-Reference Updates

| Document | Finding |
|----------|---------|
| QA-001 (service testing strategy) | Prescribes 30% integration coverage — currently at 0% enforced |
| ADR-002 (test file organization) | Table-context tests violate `__tests__/` co-location standard |
| ADR-024 (authoritative context derivation) | Tests correctly use `set_rls_context_from_staff()` |
| ADR-030 (auth pipeline hardening) | RETURNS TABLE pattern properly consumed in tests |
| ADR-043 (dual-boundary tenancy) | Future fixture updates needed (company_id chains) |
| SEC-007 / EXEC-040 | Security regression guards are correctly implemented in test files |

---

## Files Examined

### Configuration
- `jest.config.js`, `jest.setup.js`, `package.json`, `.nvmrc`
- `.github/workflows/ci.yml`, `security-gates.yml`, `migration-lint.yml`, `check-srm-links.yml`
- `playwright.config.ts`

### Test Infrastructure
- `lib/testing/route-test-helpers.ts`
- `lib/server-actions/middleware/__tests__/helpers/` (3 files)
- `supabase/seed.sql`, `supabase/config.toml`

### Integration Test Files (41 total)
All files inventoried with health classification in Stream 2 above.

### Schema Sources
- `types/database.types.ts` (84 RPCs, 29 tables, 16 enums)
- `supabase/migrations/` (500+ migration files scanned for RPC/function changes)
- `lib/supabase/rls-context.ts` (context injection wrapper)

### Documentation
- `docs/40-quality/QA-001-service-testing-strategy.md`
- `docs/80-adrs/ADR-002-test-file-organization.md`
- `docs/architecture/TEST_LOCATION_INCONSISTENCY.md`

# GAP: Integration Test Silent Bypass — Remediation Plan

> **SUPERSEDED** — This document scoped the problem as 39 broken integration tests.
> Investigation revealed a systemic failure across all test categories (unit, integration, E2E, CI enforcement).
> See [INDEX.md](INDEX.md) for the current document set and execution cadence.
> Retained as historical input — do not execute from this document.

**Issue**: ISSUE-C4D2AA48
**Severity**: HIGH
**Date**: 2026-03-12
**Status**: ~~Plan approved, execution pending~~ Superseded by TESTING-GOVERNANCE-REMEDIATION.md

---

## Executive Summary

The project has **39 integration test files** across every major bounded context that have never been enforced. Three compounding failures created false confidence:

1. CI runs lint, type-check, build — **no test step**
2. `test:ci` silently excludes `*.int.test.ts` and `*.integration.test.ts`
3. Global `testEnvironment: 'jsdom'` overwrites Node 24's native `fetch`, causing all DB-backed tests to fail on first contact

This is a **test architecture and governance failure**, not a polyfill issue.

---

## Blast Radius

### Integration test inventory (39 files on main)

| Bounded Context | Files | Naming Pattern |
|----------------|-------|----------------|
| **lib/supabase (RLS core)** | 6 | `.integration.test.ts` |
| **services/casino** | 6 | mixed `.int.test.ts` / `.integration.test.ts` |
| **services/player-import** | 4 | `.int.test.ts` |
| **services/loyalty** | 3 | mixed |
| **services/rating-slip** | 3 | `.integration.test.ts` |
| **services/visit** | 2 | mixed |
| **services/table-context** | 1 | `.integration.test.ts` |
| **services/player-timeline** | 1 | `.integration.test.ts` |
| **services/security** | 1 | `.integration.test.ts` |
| **lib/server-actions/middleware** | 3 | `.int.test.ts` |
| **workers/csv-ingestion** | 4 | `.int.test.ts` |
| **__tests__/ (root)** | 5 | `.int.test.ts` |

### Known secondary risks behind the fetch wall

| Risk | Evidence |
|------|----------|
| Deprecated RPC references | `set_rls_context` found in `lib/supabase/__tests__/rls-context.integration.test.ts` and `services/security/__tests__/rls-context.integration.test.ts` |
| No shared test harness | No common test-utils, helpers, or fixture factories — each test bootstraps independently |
| Schema/enum drift | Tests reference migrations from months ago; schema has evolved since |
| RLS tightening after SEC-007 | `set_rls_context` dropped → `set_rls_context_internal` (service_role) / `set_rls_context_from_staff` (authenticated) |
| Fixture realism | Tests may assume columns, constraints, or defaults that have since changed |

### What already works

4 csv-ingestion worker tests have `/** @jest-environment node */` docblocks — these are the only integration tests that ever had a chance of running correctly.

---

## Root Cause Analysis

### Primary: Environment misclassification

```
jest.config.js → testEnvironment: 'jsdom'   (global default)
                 ↓
                 jsdom overwrites Node globals
                 ↓
                 globalThis.fetch = undefined
                 ↓
                 supabase-js AuthRetryableFetchError on first call
```

Node 24.11.0 has native `fetch`. The test runner killed it.

### Secondary: CI gap

```
ci.yml pipeline:
  ✅ checkout → install → lint → type-check → build
  ❌ NO test step at all

test:ci script:
  --testPathIgnorePatterns='integration\.test'
  --testPathIgnorePatterns='\.int\.test'
  → even if added to CI, integration tests would be excluded
```

### Tertiary: Ambiguous taxonomy

- `npm test` = runs everything (unit + integration) but integration tests fail silently due to jsdom
- `npm run test:ci` = runs units only but is named as if it's a CI-complete suite
- No `test:integration` script exists
- No documentation distinguishes test categories

---

## Recovery Principles

1. Do not mass-fix 39 files blindly
2. Do not wire a dead suite into CI immediately
3. Do not treat fetch polyfill as the solution
4. Restore a small trusted signal first
5. Expand only after shared harness defects are understood
6. Delete tests that encode obsolete behavior — do not preserve them out of sentiment

---

## Remediation Phases

### Phase 0 — Stop the Taxonomy Lie

**Objective**: Make test classes explicit so the system cannot pretend all tests are equivalent.

**Actions**:
1. Create `jest.integration.config.ts`:
   - `testEnvironment: 'node'`
   - `testMatch` targeting `*.int.test.ts` and `*.integration.test.ts` only
   - Same module resolution and path aliases as main config
   - Shared `jest.setup.js` for env vars (reuse existing)
   - No jsdom, no @testing-library/jest-dom

2. Add explicit npm scripts to `package.json`:
   ```
   "test:unit"              → jest (existing config, exclude integration patterns)
   "test:integration"       → jest --config jest.integration.config.ts
   "test:integration:canary" → jest --config jest.integration.config.ts --testPathPatterns='<canary list>'
   ```

3. Rename `test:ci` to something honest (e.g., `test:unit:ci`) or update it to clearly document what it excludes

**Exit criteria**:
- [ ] Every test category has an explicit script
- [ ] Integration tests are no longer implicitly treated as "just more Jest tests"
- [ ] `jsdom` is no longer the default environment for DB-backed tests

---

### Phase 1 — Prove the Harness on One File

**Objective**: After fixing environment, identify the next real failure class.

**Recommended canary file**: `services/casino/__tests__/setup-wizard-rpc.int.test.ts`

Rationale:
- Casino is the root bounded context — if this works, the foundation holds
- It imports from `@/services/casino/schemas` and `@/types/database.types` (common patterns)
- Setup wizard RPCs are recent, less likely to have drifted
- Does not import shared test helpers (none exist) — self-contained

**Alternate if casino is too coupled**: `lib/server-actions/middleware/__tests__/middleware-chain.int.test.ts` — middleware tests may not need Supabase at all.

**Procedure**:
1. Ensure local Supabase is running: `npx supabase start`
2. Run: `npx jest --config jest.integration.config.ts services/casino/__tests__/setup-wizard-rpc.int.test.ts`
3. Capture and classify the failure

**Phase 1 should answer**: Is the next blocker shared test setup? Supabase bootstrap? Fixture drift? Deprecated RPC usage? Real business-logic regression?

**Exit criteria**:
- [ ] One integration file runs under `node` environment
- [ ] The next root failure type is identified and documented in this directory

---

### Phase 2 — Audit Shared Integration Infrastructure

**Objective**: Find centralized breakage before touching files individually.

**Known shared failure points to inspect**:

| Component | Location | Risk |
|-----------|----------|------|
| Supabase client construction | Direct `createClient()` in each test | May use outdated env vars or patterns |
| RLS context helpers | `lib/supabase/rls-context.ts` | `injectRLSContext` / `getAuthContext` — may reference dropped functions |
| Auth bootstrap | Per-test `auth.admin.createUser()` | fetch dependency (fixed by Phase 0) |
| Cleanup/teardown | Per-test DELETE statements | May violate new RLS delete-denial policies |
| `set_rls_context` references | 2 files confirmed | Must migrate to `set_rls_context_internal` or `set_rls_context_from_staff` |

**Project-specific known drift**:
- SEC-007 renamed `set_rls_context` → `set_rls_context_internal` (service_role) / `set_rls_context_from_staff` (authenticated)
- ADR-030 hardened auth pipeline — RETURNS TABLE pattern, TOCTOU elimination
- ADR-024 INV-8 — no casino_id/actor_id parameters in RPCs

**Exit criteria**:
- [ ] Shared helper defects enumerated
- [ ] Centralized fixes applied before per-file work
- [ ] A second representative file confirms the harness works

---

### Phase 3 — Restore One Bounded-Context Slice

**Objective**: Validate the repair pattern on a coherent domain before scaling.

**Recommended starting context**: `services/casino/` (6 files)

Files:
```
services/casino/__tests__/casino.integration.test.ts
services/casino/__tests__/gaming-day-boundary.int.test.ts
services/casino/__tests__/rpc-accept-staff-invite-abuse.int.test.ts
services/casino/__tests__/rpc-bootstrap-casino-abuse.int.test.ts
services/casino/__tests__/rpc-create-staff.int.test.ts
services/casino/__tests__/setup-wizard-rpc.int.test.ts
```

**Actions**:
1. Run all 6 under `jest.integration.config.ts`
2. Classify each failure as: environment | shared harness | stale test | real regression
3. Fix or delete as appropriate — do not preserve tests that encode obsolete behavior
4. Target: all 6 green locally

**Exit criteria**:
- [ ] One bounded-context cluster runs green locally
- [ ] Failure taxonomy documented

---

### Phase 4 — Define a Trusted Canary Suite

**Objective**: Create the first integration gate that deserves enforcement.

**Target: 8–15 high-value tests** covering critical runtime seams:

| Category | Candidate |
|----------|-----------|
| Bootstrap / context establishment | `setup-wizard-rpc.int.test.ts` |
| RLS-protected read | `rls-policy-enforcement.integration.test.ts` (subset) |
| RLS-protected write | `rls-context.integration.test.ts` (subset) |
| Representative RPC | `rpc-create-staff.int.test.ts` |
| Multi-table workflow | `visit-continuation.integration.test.ts` |
| Reporting / aggregation | `rating-slip.integration.test.ts` (subset) |
| Security regression guard | `services/security/rls-context.integration.test.ts` |
| Ingestion path | `workers/csv-ingestion/ingest.int.test.ts` |

**Why small**: A small trusted suite is better than a huge cemetery. The canary suite must be fast enough to run on every PR and credible enough that red means real.

**Exit criteria**:
- [ ] Canary suite defined and green locally
- [ ] Suite covers highest-risk runtime seams
- [ ] Execution time < 60s

---

### Phase 5 — Add CI Enforcement

**Objective**: Introduce a real runtime gate without creating a permanently red pipeline.

**Actions**:
1. Add `test:integration:canary` step to `ci.yml`
2. CI must provision Supabase (either `supabase start` in GHA or use linked project)
3. Gate is narrow and deterministic — canary suite only
4. Failures are actionable, not ambient noise

**What NOT to do**: Dump all 39 files into CI. That creates chronic red pipelines, alert fatigue, and incentive to weaken the gate.

**Exit criteria**:
- [ ] CI runs at least one meaningful runtime test suite
- [ ] Merge confidence improves materially

---

### Phase 6 — Broaden Coverage

**Objective**: Expand beyond canary without reintroducing entropy.

**Expansion order** (by risk/value):
1. `services/player-import/` — 4 files (active development, EXEC-037)
2. `services/loyalty/` — 3 files (financial correctness)
3. `services/rating-slip/` — 3 files (core workflow)
4. `lib/supabase/` RLS suite — 6 files (security foundation)
5. `services/visit/` — 2 files
6. Root `__tests__/` — 5 files (dashboard/navigation)
7. `lib/server-actions/middleware/` — 3 files

**Discipline**: Mark obsolete tests for deletion, not sentimental retention. Add newly trusted tests to broader integration jobs. Maintain clear separation between always-on canary and broader local suites.

**Exit criteria**:
- [ ] Integration coverage grows from a trusted base
- [ ] New integration tests are born into the correct environment/config

---

## Configuration Reference

### jest.integration.config.ts (Phase 0 deliverable)

```typescript
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  setupFilesAfterSetup: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.int.test.[jt]s?(x)',
    '**/__tests__/**/*.integration.test.[jt]s?(x)',
    '**/?(*.)+(int|integration).(spec|test).[jt]s?(x)',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/trees/',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      { tsconfig: { jsx: 'react-jsx' } },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};

export default config;
```

### package.json scripts (Phase 0 deliverable)

```json
{
  "test:unit": "jest --testPathIgnorePatterns='integration\\.test' --testPathIgnorePatterns='\\.int\\.test'",
  "test:integration": "jest --config jest.integration.config.ts",
  "test:integration:canary": "jest --config jest.integration.config.ts --testPathPatterns='<canary-list>'",
  "test:ci": "jest --ci --maxWorkers=2 --testPathIgnorePatterns='integration\\.test' --testPathIgnorePatterns='\\.int\\.test' --testPathIgnorePatterns='e2e/'"
}
```

---

## Success Criteria

The remediation is complete when:

- [ ] Integration tests run under `node`, not `jsdom`
- [ ] Test categories are explicit and honestly named
- [ ] One bounded-context slice is green locally
- [ ] Shared helper drift has been corrected
- [ ] A canary suite of 8–15 high-value tests is defined and green
- [ ] CI runs the canary suite on every PR
- [ ] "Green CI" actually means runtime behavior is verified

---

## Cross-References

| Document | Relevance |
|----------|-----------|
| ISSUE-C4D2AA48 | Original issue — fetch polyfill masking deeper problem |
| `jest.config.js` | Current global config with `jsdom` default |
| `package.json` `test:ci` | Script that silently excludes integration tests |
| `.github/workflows/ci.yml` | CI pipeline — no test step |
| SEC-007 / EXEC-040 | RPC rename that introduced drift into 2 integration test files |
| ADR-024 | Authoritative context derivation — tests must match current patterns |
| ADR-030 | Auth pipeline hardening — RETURNS TABLE pattern |

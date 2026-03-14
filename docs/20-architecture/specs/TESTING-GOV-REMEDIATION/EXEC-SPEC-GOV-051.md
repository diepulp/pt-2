# EXEC-SPEC-GOV-051: Testing Infrastructure Foundation

**Segment**: 1 of 3 (Foundation)
**Issue**: ISSUE-C4D2AA48
**Date**: 2026-03-13
**Status**: Ready for `/build` execution
**Rollout Strategy**: `docs/issues/gaps/testing-arch-remediation/ROLLOUT-EXECUTION-STRATEGY.md`
**Governing Standard**: `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`
**ADR**: `docs/80-adrs/ADR-044-testing-governance-posture.md`
**Remediation Plan**: `docs/issues/gaps/testing-arch-remediation/TESTING-GOVERNANCE-REMEDIATION.md`
**Worktree**: `trees/testing-gov-remediation` (branch: `testing-gov-remediation`)
**Estimated Effort**: 8-10h

---

## Purpose

Establish the testing governance foundation: formalize governance artifacts, activate branch protection on `main`, split Jest configuration by runtime environment, add a CI test job, and mark it as a required status check. This is Move 0 + Move 1 + Move 2 + Move 3 from the remediation plan, plus the "mark checks required" step.

**No code execution from EXEC-052 or EXEC-053 begins until the EXEC-051 exit gate passes.** Preparatory planning, slice inventory, and investigation for those segments may proceed in parallel, but no implementation artifacts land until the foundation harness is in place. This is the causal root of the entire remediation.

### Standard Sections Satisfied

| Standard Section | What EXEC-051 Delivers |
|-----------------|----------------------|
| §2 Governing Principle | Establishes conditions 2 (automatic CI) and 3 (required checks) for unit layers |
| §3 Canonical Taxonomy | Implements server-unit (§3.3) / browser-unit (§3.2) split |
| §4 Environment Contract | Jest split enforces node/jsdom boundary |
| §5 Enforcement Tiers | Promotes server-unit and browser-unit to **Required** |
| §6 Green CI Semantics | "Green CI" gains functional meaning (unit tests pass, not just compiles) |
| §7 Branch Protection | Activates protection per ordering: protection → jobs → required checks |
| §8 Minimum Merge Gate | First functional test layer blocks merge (governance floor met) |
| §10 Script Truthfulness | Fixes misleading `test:ci` script |
| §12 Change-Control | All PRs include governance disclosure |
| §13 Ownership | Establishes posture stewardship |

---

## Current State Snapshot (as of 2026-03-13)

### Branch Protection
- **Status**: NONE — `main` is unprotected (HTTP 404 from protection API)
- Direct push, force push, and merge without checks are all permitted
- All CI results are advisory — nothing blocks merge

### CI Pipeline (`ci.yml`)
- Single job: `checks` (lint → type-check → build)
- **Zero test execution** in CI
- Comment on line 10: "Tests run locally (require Supabase)" — this is the documented policy
- No `test` job exists

### Jest Configuration (`jest.config.js`)
- **Single global config** with `testEnvironment: 'jsdom'` (line 12)
- All 273 test files run under jsdom regardless of actual runtime needs
- Coverage thresholds defined (lines 50-64) but never evaluated in CI
- `testPathIgnorePatterns` includes `cypress/` only
- Uses `next/jest` wrapper with `ts-jest` transform

### Test File Census

| Category | Directory | Count | Current Env | Correct Env |
|----------|-----------|-------|-------------|-------------|
| Server-unit | `services/` | 103 | jsdom (global default) | **node** |
| Server-unit | `lib/` | 27 | jsdom (global default) | **node** |
| Route-handler | `app/api/` | 67 | node (96 have `@jest-environment node`) | node |
| Server-unit | `app/actions/` | 3 | jsdom (global default) | **node** |
| Server-unit | `app/(onboarding)/` | 1 | jsdom (global default) | **node** |
| Server-unit | `__tests__/` | 10 | jsdom (global default) | **node** (mixed — see note) |
| Server-unit | `scripts/` | 2 | jsdom (global default) | **node** |
| Browser-unit | `components/` | 24 | jsdom (correct) | jsdom |
| Browser-unit | `hooks/` | 16 | jsdom (correct) | jsdom |
| Browser-unit | `store/` | 7 | jsdom (global default) | jsdom (5 use renderHook), node (2 pure logic) |
| Workers | `workers/` | 9 | jsdom (global default) | **node** |
| **Total** | | **~269** | | |

> **Note on `__tests__/`**: Root `__tests__/` contains a mirror structure (`services/`, `hooks/`, `components/`, `lib/`, `rls/`, `constraints/`, `slad/`, `integration/`). Most are server-side (node). 3 files (`hooks/`, `components/` mirrors) need jsdom — these retain `@jest-environment jsdom` docblocks. Integration files (`.int.test.*` or in `__tests__/integration/`) are excluded by `testPathIgnorePatterns`.
>
> **Note on `store/`**: 5 of 7 store tests use `renderHook` from `@testing-library/react` (need jsdom). 2 are pure logic tests that could run under node. All 7 are placed in the jsdom project for simplicity; the 2 pure-logic tests are harmless under jsdom.
>
> **Census accuracy**: Counts are approximate due to integration test overlap and naming inconsistencies. The authoritative verification is the drift-detection check in WS5 (see Verification section).

- **96 files** have `@jest-environment node` docblock (mostly route-handler + http-contract tests)
- **1 file** has `@jest-environment jsdom` docblock
- **81 server-side tests** default to jsdom with no override — this is the core environment misclassification
- **41 integration tests** (`.int.test.*` / `.integration.test.*`) — excluded by `test:ci`, not in EXEC-051 scope

### Package Scripts (relevant)
```json
"test": "jest",
"test:ci": "jest --ci --maxWorkers=2 --testPathIgnorePatterns='integration\\.test' --testPathIgnorePatterns='\\.int\\.test' --testPathIgnorePatterns='e2e/'"
```

### Setup File (`jest.setup.js`)
- Imports `@testing-library/jest-dom` (line 1)
- Loads `.env.test` for Supabase URLs (lines 9-36)
- Sets fallback env vars for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Note**: `@testing-library/jest-dom` import is jsdom-specific — node project should NOT include this setup file

### Node Version
- `.nvmrc`: `24`

---

## Workstreams

### WS1: Formalize Governance Artifacts
**Skill**: `lead-architect`
**Standard sections**: §2, §5, §6, §13

**Actions**:
1. Promote ADR-044 status from `Proposed` → `Accepted`
   - File: `docs/80-adrs/ADR-044-testing-governance-posture.md`
   - Change `**Status:** Proposed` → `**Status:** Accepted`
   - Add acceptance date: `2026-03-13`

2. Promote Testing Governance Standard status from `Proposed` → `Active`
   - File: `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`
   - Change `**Status:** Proposed` → `**Status:** Active`
   - Add activation date: `2026-03-13`

3. Annotate QA-001 as aspirational/unimplemented
   - File: `docs/40-quality/QA-001-service-testing-strategy.md`
   - Add banner: `> **Governance notice**: This document describes aspirational testing targets. It is not enforced. Governing testing posture is defined in TESTING_GOVERNANCE_STANDARD.md (ADR-044).`

4. Annotate CICD-PIPELINE-SPEC Gate 4 as NOT IMPLEMENTED
   - File: `docs/deployments/CICD-PIPELINE-SPEC.md`
   - Add annotation to Gate 4 section: `> **Governance notice**: Gate 4 (Test) is NOT IMPLEMENTED as of 2026-03-13. No CI job executes tests. See TESTING_GOVERNANCE_STANDARD.md for current enforcement posture.`

**Exit criteria**: All four docs updated. ADR-044 accepted, Standard active, aspirational docs annotated.

---

### WS2: Activate Branch Protection on `main`
**Skill**: `devops-pt2`
**Standard sections**: §7

**Actions**:
1. Enable branch protection via GitHub API:
   ```bash
   gh api repos/diepulp/pt-2/branches/main/protection \
     --method PUT \
     --field required_status_checks='{"strict":true,"contexts":["checks"]}' \
     --field enforce_admins=true \
     --field restrictions=null \
     --field allow_force_pushes=false \
     --field allow_deletions=false
   ```

   > **Solo-developer note (DA review P0-3)**: `required_pull_request_reviews` is intentionally omitted. This is a single-maintainer repo — GitHub does not allow PR authors to approve their own PRs, so `required_approving_review_count: 1` would deadlock all merges. The governance value here is the required CI status checks, not a review gate that requires a phantom reviewer. PR-based workflow is still enforced by branch protection (direct push blocked). Add review requirements when a second contributor joins.

2. Verify protection is active:
   ```bash
   gh api repos/diepulp/pt-2/branches/main/protection --jq '.required_status_checks'
   ```

**Important**: Initially require only `checks` context (existing job). The `test` context is added in WS4 after the test job exists. This follows Standard §7 ordering: protection → jobs → required checks.

**Exit criteria**: `main` protected. Direct push blocked. `checks` is a required status check. Force push blocked.

---

### WS3: Split Jest Configuration
**Skill**: `qa-specialist`
**Standard sections**: §4

**Actions**:

1. **Create `jest.node.config.js`** — server-unit project:
   ```js
   const nextJest = require('next/jest');

   const createJestConfig = nextJest({ dir: './' });

   /** @type {import('jest').Config} */
   const config = {
     displayName: 'server-unit',
     testEnvironment: 'node',
     setupFiles: ['<rootDir>/jest.setup.env.js'],
     moduleNameMapper: {
       '^(\\.{1,2}/.*)\\.js$': '$1',
       '^@/(.*)$': '<rootDir>/$1',
     },
     testMatch: [
       '<rootDir>/services/**/*.test.[jt]s?(x)',
       '<rootDir>/services/**/*.spec.[jt]s?(x)',
       '<rootDir>/lib/**/*.test.[jt]s?(x)',
       '<rootDir>/lib/**/*.spec.[jt]s?(x)',
       '<rootDir>/app/api/**/*.test.[jt]s?(x)',
       '<rootDir>/app/api/**/*.spec.[jt]s?(x)',
       '<rootDir>/app/actions/**/*.test.[jt]s?(x)',
       '<rootDir>/app/actions/**/*.spec.[jt]s?(x)',
       '<rootDir>/app/**/lib/**/*.test.[jt]s?(x)',
       '<rootDir>/app/**/lib/**/*.spec.[jt]s?(x)',
       '<rootDir>/workers/**/*.test.[jt]s?(x)',
       '<rootDir>/workers/**/*.spec.[jt]s?(x)',
       '<rootDir>/__tests__/**/*.test.[jt]s?(x)',
       '<rootDir>/__tests__/**/*.spec.[jt]s?(x)',
       '<rootDir>/scripts/**/*.test.[jt]s?(x)',
       '<rootDir>/scripts/**/*.spec.[jt]s?(x)',
     ],
     testPathIgnorePatterns: [
       '<rootDir>/node_modules/',
       '<rootDir>/.next/',
       '\\.int\\.test\\.',
       '\\.integration\\.test\\.',
     ],
     transform: {
       '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
     },
     moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
   };

   module.exports = createJestConfig(config);
   ```

2. **Create `jest.jsdom.config.js`** — browser-unit project:
   ```js
   const nextJest = require('next/jest');

   const createJestConfig = nextJest({ dir: './' });

   /** @type {import('jest').Config} */
   const config = {
     displayName: 'browser-unit',
     testEnvironment: 'jsdom',
     setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
     moduleNameMapper: {
       '^(\\.{1,2}/.*)\\.js$': '$1',
       '^@/(.*)$': '<rootDir>/$1',
     },
     testMatch: [
       '<rootDir>/components/**/*.test.[jt]s?(x)',
       '<rootDir>/components/**/*.spec.[jt]s?(x)',
       '<rootDir>/hooks/**/*.test.[jt]s?(x)',
       '<rootDir>/hooks/**/*.spec.[jt]s?(x)',
       '<rootDir>/store/**/*.test.[jt]s?(x)',
       '<rootDir>/store/**/*.spec.[jt]s?(x)',
     ],
     testPathIgnorePatterns: [
       '<rootDir>/node_modules/',
       '<rootDir>/.next/',
     ],
     transform: {
       '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
     },
     moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
   };

   module.exports = createJestConfig(config);
   ```

3. **Create `jest.setup.env.js`** — env-only setup for node project (no `@testing-library/jest-dom`):
   ```js
   const fs = require('fs');
   const path = require('path');

   try {
     const envTestPath = path.resolve(process.cwd(), '.env.test');
     if (fs.existsSync(envTestPath)) {
       const envConfig = fs.readFileSync(envTestPath, 'utf8');
       envConfig.split('\n').forEach((line) => {
         const match = line.match(/^([^=:#]+)=(.*)$/);
         if (match) {
           const key = match[1].trim();
           const value = match[2].trim();
           if (!process.env[key]) {
             process.env[key] = value;
           }
         }
       });
     }
   } catch (error) {
     console.warn('Could not load .env.test file:', error.message);
   }

   process.env.NEXT_PUBLIC_SUPABASE_URL =
     process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
   process.env.SUPABASE_SERVICE_ROLE_KEY =
     process.env.SUPABASE_SERVICE_ROLE_KEY ||
     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
   ```

4. **Refactor `jest.config.js`** — multi-project orchestrator:
   ```js
   /** @type {import('jest').Config} */
   module.exports = {
     projects: [
       '<rootDir>/jest.node.config.js',
       '<rootDir>/jest.jsdom.config.js',
     ],
   };
   ```

5. **Remove `@jest-environment` docblocks** from files that are now classified by project config:
   - The 96 files with `@jest-environment node` in `services/`, `lib/`, `app/api/` no longer need the annotation — the node project config handles them
   - The 2 files with `@jest-environment node` in `scripts/__tests__/` no longer need the annotation — now covered by node project
   - The 1 file with `@jest-environment jsdom` in `components/` no longer needs it
   - **Do NOT remove** `@jest-environment jsdom` docblocks from `__tests__/hooks/` or `__tests__/components/` mirror files — these are in the node project's `testMatch` but need jsdom; the docblock is their only environment signal
   - **Do NOT remove** `@jest-environment` from any file outside the project-scoped directories

**Design decisions**:
- `jest.setup.js` (with `@testing-library/jest-dom`) is used only by the jsdom project
- `jest.setup.env.js` (env vars only) is used by the node project — no DOM matchers
- Integration tests (`.int.test.*`) are excluded from both projects — they belong to EXEC-053's `jest.integration.config.js`
- Route-handler tests in `app/api/` are included in the node project (correct env per §3.4) — their content is addressed in EXEC-052. **EXEC-051 corrects runtime environment classification only; it does not treat existing route-handler test passage as strengthened verification.** Green CI after this segment means those tests run under the right runtime, not that their assertions are honest. Route-handler test honesty is EXEC-052 scope.
- Coverage thresholds from the old config are preserved in the node project (they apply to `services/loyalty/`). **Coverage threshold handling is limited to exactly three outcomes** — no other "adjustment" is permitted during a governance-hardening segment:
  1. **Keep unchanged**: Thresholds pass under the new config. No action needed.
  2. **Quarantine by package**: If a specific package's thresholds fail, disable thresholds for that package only with a written justification and a named EXEC-052/053 follow-up item that restores or recalibrates them.
  3. **Defer to named follow-up**: If thresholds fail globally (meaning they were never actually evaluated), document this finding and create a coverage-calibration work item in EXEC-052 with explicit acceptance criteria.
  Lowering thresholds without one of these three contracts is prohibited. "Document and adjust" is not a valid outcome.
- The `next/jest` wrapper is preserved for both configs to maintain module resolution and Next.js compat

**Verification**:
```bash
# 1. Run split configs locally and confirm file counts
npx jest --projects jest.node.config.js --listTests 2>/dev/null | wc -l
# Expected: ~185 node-project tests (services/103 + lib/27 + app/api/67 + app/actions/3
#   + app/onboarding/1 + __tests__/10 + scripts/2 + workers/9 = 222 census,
#   minus ~37 integration exclusions)

npx jest --projects jest.jsdom.config.js --listTests 2>/dev/null | wc -l
# Expected: ~47 jsdom-project tests (components/24 + hooks/16 + store/7)

# 2. Drift detection — confirm no test file falls through (MANDATORY)
TOTAL=$(find . -name '*.test.*' -o -name '*.spec.*' | grep -v node_modules | grep -v .next | grep -v cypress | wc -l)
CAPTURED=$(npx jest --listTests 2>/dev/null | wc -l)
echo "On disk: $TOTAL | Captured by Jest: $CAPTURED"
# These numbers MUST match (within ±2 for edge cases). If they diverge,
# test files exist that neither project captures — investigate before proceeding.

# 3. Run the multi-project config
npx jest --ci --projects jest.node.config.js jest.jsdom.config.js --maxWorkers=2 > /tmp/jest-split-run.log 2>&1
grep -E '(Tests:|Test Suites:)' /tmp/jest-split-run.log
```

**Exit criteria**: Both projects run. File counts match census. No test file runs under wrong environment. No test file falls through (uncaptured by either project).

---

### WS4: Add CI Test Job and Mark Required
**Skill**: `devops-pt2`
**Standard sections**: §8, §10

**Actions**:

1. **Add `test` job to `.github/workflows/ci.yml`**:
   ```yaml
   test:
     runs-on: ubuntu-latest
     timeout-minutes: 10
     needs: checks
     steps:
       - name: Checkout
         uses: actions/checkout@v4
       - name: Setup Node
         uses: actions/setup-node@v4
         with:
           node-version-file: '.nvmrc'
           cache: 'npm'
       - name: Install
         run: npm ci
       - name: Run unit tests (server + browser)
         run: npx jest --ci --projects jest.node.config.js jest.jsdom.config.js --maxWorkers=2 --coverage
         env:
           NEXT_PUBLIC_SUPABASE_URL: http://localhost:54321
           NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder
           SUPABASE_SERVICE_ROLE_KEY: ci-placeholder
   ```

2. **Remove the misleading comment** from `ci.yml` line 10:
   - Delete: `# Merge-safety gates only. Clean-room verification that code compiles,`
   - Delete: `# lints clean, and builds. Tests run locally (require Supabase).`
   - Replace with: `# Merge-safety gates: static checks + unit tests. Integration/E2E tests require Supabase and are advisory until EXEC-053.`

3. **Update `package.json` test scripts**:
   ```json
   "test": "jest --projects jest.node.config.js jest.jsdom.config.js",
   "test:watch": "jest --projects jest.node.config.js jest.jsdom.config.js --watch",
   "test:coverage": "jest --projects jest.node.config.js jest.jsdom.config.js --coverage",
   "test:ci": "jest --ci --projects jest.node.config.js jest.jsdom.config.js --maxWorkers=2 --coverage"
   ```
   - Remove integration/e2e `testPathIgnorePatterns` from `test:ci` — project-scoped `testMatch` now handles separation
   - Script name is now truthful per §10

4. **Update branch protection** to require both `checks` AND `test`:
   ```bash
   gh api repos/diepulp/pt-2/branches/main/protection \
     --method PUT \
     --field required_status_checks='{"strict":true,"contexts":["checks","test"]}' \
     --field enforce_admins=true \
     --field restrictions=null \
     --field allow_force_pushes=false \
     --field allow_deletions=false
   ```

   > **Temporal constraint (DA review P1-3)**: Step 4 MUST execute AFTER the CI workflow has run on the PR branch and the `test` job has reported success. Push CI changes (steps 1-3) first, wait for the `test` job to go green on the PR, THEN run step 4. If step 4 is executed before the `test` context has ever reported on the PR branch, the PR will be unmergeable.

**Exit criteria**: `test` job runs in CI. Both `checks` and `test` are required status checks. `test:ci` script reflects split config. Misleading comment removed.

---

### WS5: Verification and Disclosure
**Skill**: `qa-specialist`
**Standard sections**: §6, §12

**Actions**:

1. **Local verification** — confirm split configs work:
   - Run `npm test` (multi-project) — should execute both projects
   - Confirm server-unit tests run under node (no DOM API errors, no jsdom shim masking)
   - Confirm browser-unit tests run under jsdom (DOM matchers available)
   - Confirm integration tests are excluded
   - Record test counts: expect ~185 node, ~47 jsdom
   - Run drift-detection check (see Verification section) — on-disk count must match Jest-captured count

2. **Known failures triage** — some tests may fail when moved to correct env:
   - Server-unit tests that relied on jsdom globals (unlikely but possible)
   - If failures occur: document them, do NOT suppress them. These are real bugs that jsdom was hiding.
   - Hook tests (16 files) may have existing failures — these are EXEC-052 scope, not EXEC-051
   - **Temporary exclusion contract** (if hook failures block CI green): Any exclusion MUST satisfy ALL of the following — no exceptions:
     1. **Named file list**: Exact files excluded, not a directory glob. Use `--testPathIgnorePatterns` with explicit paths, never `continue-on-error: true` on the job.
     2. **Bounded-context attribution**: Each excluded file tagged to its owning bounded context (e.g., `hooks/useVisit` → Visit context).
     3. **Written rationale**: Why this file fails under the correct environment (e.g., "relies on jsdom `window.location` shim").
     4. **Expiry owner**: EXEC-052 workstream and responsible skill explicitly named.
     5. **PR disclosure**: Every exclusion appears in the §12 disclosure block with its restoration target.
     6. **Restoration backlog**: Excluded files recorded as named restoration items in `EXEC-052-RESTORATION-BACKLOG.md`, organized by bounded context — not dumped into a generic "known failures" bucket.
   - `continue-on-error: true` on the `test` job is **prohibited**. That is the bypass culture this remediation exists to end.

3. **PR disclosure** (Standard §12 compliance):
   ```
   ## Testing Posture Change Disclosure (Standard §12)

   **What changed**: Jest configuration split from single global config into
   server-unit (node) and browser-unit (jsdom) projects. CI test job added.
   Branch protection activated with required status checks.

   **Why**: Remediation of ISSUE-C4D2AA48 — 81 server-side tests were running
   under jsdom (wrong environment), zero test layers ran in CI, main was
   unprotected.

   **Layers gained enforcement**: server-unit (Required), browser-unit (Required)
   **Layers lost enforcement**: None (no layers were previously enforced)
   **Confidence**: INCREASED — from zero functional gates to unit-layer gate

   **Governance state**: Intermediate governance — unit-only gate. Integration
   and E2E layers remain Advisory per Standard §5 until EXEC-053 promotes them.

   This does NOT constitute full functional merge protection. Per Standard §6,
   "green CI" now means static checks + unit tests pass, not that DB/RLS/workflow
   correctness is verified.
   ```

**Exit criteria**: Local test run green (or known failures documented). PR disclosure written. Governance state accurately described as intermediate.

---

## File Manifest

### Files Created
| File | Purpose |
|------|---------|
| `jest.node.config.js` | Server-unit project config (node env) |
| `jest.jsdom.config.js` | Browser-unit project config (jsdom env) |
| `jest.setup.env.js` | Env-only setup for node project (no DOM matchers) |

### Files Modified
| File | Change |
|------|--------|
| `jest.config.js` | Refactored to multi-project orchestrator |
| `jest.setup.js` | No change — used only by jsdom project |
| `.github/workflows/ci.yml` | Add `test` job, update comment |
| `package.json` | Update test scripts to use split configs |
| `docs/80-adrs/ADR-044-testing-governance-posture.md` | Status: Proposed → Accepted |
| `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` | Status: Proposed → Active |
| `docs/40-quality/QA-001-service-testing-strategy.md` | Add governance notice banner |
| `docs/deployments/CICD-PIPELINE-SPEC.md` | Annotate Gate 4 as NOT IMPLEMENTED |
| 99 test files | Remove `@jest-environment` docblocks (96 node in primary dirs + 2 node in scripts/ + 1 jsdom in components/) |

### Files NOT Touched (owned by EXEC-052/053)
| File | Owner |
|------|-------|
| `cypress/` | EXEC-052 (deletion) |
| `cypress.config.ts` | EXEC-052 (deletion) |
| `hooks/**/*.test.*` | EXEC-052 (triage) |
| `app/api/**/*.test.*` | EXEC-052 (reclassification) |
| `playwright.config.ts` | EXEC-053 |
| `jest.integration.config.js` | EXEC-053 (creation) |

---

## Dependency and Ordering

```
WS1 (Governance docs)     ──→ can start immediately
WS2 (Branch protection)   ──→ can start immediately (parallel with WS1)
WS3 (Jest split)           ──→ can start immediately (parallel with WS1, WS2)
WS4 (CI test job)          ──→ depends on WS3 (needs split configs to exist)
                           ──→ depends on WS2 (needs branch protection to make checks required)
WS5 (Verification)         ──→ depends on WS3 + WS4 complete
```

**Parallel opportunities**: WS1, WS2, WS3 are independent and can execute concurrently.

---

## Exit Gate

EXEC-051 is complete when ALL of the following are true:

- [ ] ADR-044 status = Accepted
- [ ] TESTING_GOVERNANCE_STANDARD.md status = Active
- [ ] QA-001 and CICD-PIPELINE-SPEC annotated
- [ ] Branch protection active on `main` (direct push blocked, force push blocked)
- [ ] `checks` and `test` are required status checks
- [ ] `jest.node.config.js` runs all test files matching its `testMatch` minus integration exclusions (~185) under node
- [ ] `jest.jsdom.config.js` runs all test files matching its `testMatch` (~47) under jsdom
- [ ] Drift-detection check passes: on-disk test file count matches Jest-captured count
- [ ] `jest.config.js` is a multi-project orchestrator
- [ ] CI `test` job runs split Jest on every PR
- [ ] `test:ci` script reflects split config (no silent exclusion patterns)
- [ ] Misleading "tests run locally" comment removed
- [ ] All test failures documented as named restoration backlog items by bounded context (not a generic "known failures" list)
- [ ] Any temporary exclusions satisfy the full exclusion contract (WS5 §2) — named files, rationale, expiry owner, restoration backlog
- [ ] PR disclosure per Standard §12 included (including any exclusions and their restoration targets)

**Governance state after exit**: Intermediate governance — unit-only gate. Per Guardrail 2 of the rollout strategy, this is explicitly not the target posture. Integration and E2E remain Advisory.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Server-unit tests fail under node after years under jsdom | CI red, blocks merge | Document failures. These are real bugs jsdom was hiding. Fix or quarantine per §11 with exit criteria. |
| Hook tests (16 files) have known failures | May block CI if included in jsdom project | Hooks are in scope for EXEC-052 triage. If they block CI green, apply the temporary exclusion contract (WS5 §2): named file list, bounded-context attribution, written rationale, EXEC-052 expiry owner, PR disclosure, and restoration backlog entry. `continue-on-error: true` is prohibited. |
| Coverage thresholds fail under new config | Test job fails on coverage | One of three outcomes only: (1) keep unchanged, (2) quarantine by package with justification + named follow-up, (3) defer globally to EXEC-052 coverage-calibration work item. Lowering thresholds without a contract is prohibited. |
| Branch protection blocks active development | PRs can't merge | Start with `checks` only (existing job). Add `test` after the test job is proven green. |
| `next/jest` wrapper behaves differently per project | Config resolution issues | Test both configs locally before CI. Fall back to raw ts-jest if next/jest causes issues. |

---

## Build Command

```bash
/build docs/20-architecture/specs/TESTING-GOV-REMEDIATION/EXEC-SPEC-GOV-051.md
```

After EXEC-051 exit gate passes, EXEC-052 and EXEC-053 can execute in parallel.

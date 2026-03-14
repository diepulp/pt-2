# Devil's Advocate Review — EXEC-SPEC-GOV-051

**Date**: 2026-03-13
**Target**: `EXEC-SPEC-GOV-051.md` (post-initial-patch revision)
**Agents deployed**: 5 parallel adversarial reviewers
**Attack vectors**: Governance & process, Technical correctness, CI & branch protection, Dependency ordering, Failure modes & blast radius
**Raw findings**: 47 | **After dedup**: 25 (3 P0, 8 P1, 6 P2, 8 P3)

---

## Severity Summary

| Level | Count | Ship-blocking? |
|-------|-------|----------------|
| P0 | 3 | Yes — spec cannot execute as written |
| P1 | 8 | No — but will bite within 30 days |
| P2 | 6 | No — design smells worth fixing before build |
| P3 | 8 | No — observations, take or leave |

---

## P0 Findings (must fix before `/build`)

### P0-1: `setupFilesAfterSetup` TYPO WILL BREAK ALL BROWSER-UNIT TESTS

**Consensus**: 5/5 agents (DA1, DA2, DA3, DA4, DA5)
**Location**: EXEC-SPEC-GOV-051.md line 206, WS3 action 2 (`jest.jsdom.config.js`)

**Finding**: `setupFilesAfterSetup` is not a valid Jest config key. The correct key is `setupFilesAfterEnv`. Jest silently ignores unknown keys, so `@testing-library/jest-dom` matchers will never load. All ~40 browser-unit tests using `.toBeInTheDocument()`, `.toHaveClass()`, etc. fail with `TypeError: expect(...).toBeInTheDocument is not a function`.

DA2 verified empirically:
```
node -e "const {defaults}=require('jest-config'); console.log('setupFilesAfterSetup' in defaults, 'setupFilesAfterEnv' in defaults)"
// false true
```

**Patch**: Line 206, change:
```js
setupFilesAfterSetup: ['<rootDir>/jest.setup.js'],
```
to:
```js
setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
```

---

### P0-2: 22-23 UNIT TEST FILES SILENTLY DROPPED BY TESTMATCH PATTERNS

**Consensus**: 3/5 agents (DA2: 22 files, DA3: 4 files, DA5: 23 files)
**Location**: WS3 actions 1-2, `testMatch` arrays in both project configs

**Finding**: The two project configs only cover 6 directories (`services/`, `lib/`, `app/api/`, `workers/`, `components/`, `hooks/`). Files in other directories currently run under the global config but will silently vanish after the split. This directly violates the exit criterion: "No test file falls through."

| Directory | Count | Correct Env | Notes |
|-----------|-------|-------------|-------|
| `store/__tests__/` | 7 | jsdom (5), node (2) | Zustand store tests |
| `__tests__/services/` | 2-3 | node | Mirror structure |
| `__tests__/hooks/` | 2 | jsdom | Mirror structure |
| `__tests__/components/` | 1 | jsdom | Mirror structure |
| `__tests__/lib/` | 1 | node | Mirror structure |
| `__tests__/constraints/` | 1 | node | DB constraint test |
| `__tests__/rls/` | 1 | node | RLS test |
| `__tests__/slad/` | 1 | node | Architecture test |
| `app/actions/auth/__tests__/` | 3 | node | Server action tests |
| `app/(onboarding)/setup/lib/__tests__/` | 1 | node | Wizard validation |
| `scripts/__tests__/` | 2 | node | Tooling tests |

**Patch**: Add missing directories to appropriate configs:

`jest.node.config.js` — add to `testMatch`:
```js
'<rootDir>/__tests__/**/*.test.[jt]s?(x)',
'<rootDir>/__tests__/**/*.spec.[jt]s?(x)',
'<rootDir>/app/actions/**/*.test.[jt]s?(x)',
'<rootDir>/app/actions/**/*.spec.[jt]s?(x)',
'<rootDir>/app/**/lib/**/*.test.[jt]s?(x)',
'<rootDir>/app/**/lib/**/*.spec.[jt]s?(x)',
'<rootDir>/scripts/**/*.test.[jt]s?(x)',
'<rootDir>/scripts/**/*.spec.[jt]s?(x)',
```

`jest.jsdom.config.js` — add to `testMatch`:
```js
'<rootDir>/store/**/*.test.[jt]s?(x)',
'<rootDir>/store/**/*.spec.[jt]s?(x)',
```

Also add a CI drift-detection step (see P2-4) and update the census table.

---

### P0-3: SOLO-DEVELOPER LOCKOUT — `required_approving_review_count=1` BLOCKS ALL MERGES

**Consensus**: 4/5 agents (DA1: P1, DA3: P2, DA4: P1, DA5: P0)
**Location**: WS2 lines 131-136 and WS4 lines 361-371

**Finding**: The repo has one human contributor (`diepulp`). GitHub does not allow PR authors to approve their own PRs. With `required_approving_review_count: 1` and `enforce_admins: true`, no PR can ever be merged. The EXEC-051 PR itself is blocked by the protection it creates.

**Patch** (three options, pick one):
1. **Remove review requirement entirely** — set `required_pull_request_reviews=null` in both WS2 and WS4 API calls. Rely on required status checks as the governance gate. *(Recommended — the real value is CI gates, not phantom reviewers.)*
2. **Require PRs but not approvals** — set `required_approving_review_count: 0`. Forces PR-based workflow without requiring a reviewer who doesn't exist.
3. **Disable admin enforcement** — set `enforce_admins=false` so the repo owner can self-merge. Weaker but preserves the review structure for future contributors.

---

## P1 Findings (fix before or shortly after ship)

### P1-1: COVERAGE THRESHOLDS MISSING FROM NODE CONFIG CODE BLOCK

**Consensus**: 4/5 agents (DA1, DA2, DA3, DA4)
**Location**: WS3 action 1, `jest.node.config.js` code block (lines 156-193)

**Finding**: The spec prose says "Coverage thresholds from the old config are preserved in the node project" and defines a strict 3-outcome contract for threshold handling. But the actual code block contains no `coverageThreshold` or `collectCoverageFrom`. The existing thresholds (`services/loyalty/business.ts` at 80%, `services/loyalty/crud.ts` at 75%) silently vanish. The spec contradicts itself — the 3-outcome contract becomes dead letter.

**Patch**: Add to `jest.node.config.js` after `moduleFileExtensions`:
```js
collectCoverageFrom: [
  'services/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'app/api/**/*.{ts,tsx}',
  '!**/*.d.ts',
  '!**/node_modules/**',
],
coverageThreshold: {
  'services/loyalty/business.ts': {
    branches: 80, functions: 80, lines: 80, statements: 80,
  },
  'services/loyalty/crud.ts': {
    branches: 75, functions: 75, lines: 75, statements: 75,
  },
},
```

---

### P1-2: `needs: checks` SERIALIZES CI UNNECESSARILY

**Consensus**: 2/5 agents (DA3, DA4)
**Location**: WS4 step 1, `test` job definition (line 327)

**Finding**: The `test` job depends on `checks` (lint + type-check + build, up to 15 min), but shares zero artifacts — it does its own checkout and `npm ci`. Both jobs are independently required status checks. Sequential execution doubles CI wall-clock time (~20-25 min vs ~10-12 min parallel).

**Patch**: Remove `needs: checks` from the `test` job. Both jobs run in parallel. Branch protection independently requires both to pass.

---

### P1-3: WS4 TEMPORAL CONSTRAINT UNDOCUMENTED — CHICKEN-AND-EGG ON `test` CONTEXT

**Consensus**: 1/5 agents (DA4) — but high-confidence unique finding
**Location**: WS4 between steps 3 and 4

**Finding**: GitHub allows requiring a status check context that has never run. Once `test` is added to required contexts (step 4), every open PR immediately fails merge because the `test` check has never reported on it. The WS4 steps must be temporally ordered: push CI changes → wait for `test` job to run green on PR → THEN add `test` to required contexts. The spec does not document this.

**Patch**: Add between WS4 steps 3 and 4:
```
**Temporal constraint**: Step 4 (add `test` to required contexts) MUST execute
AFTER the CI workflow has run on the PR branch and the `test` job has reported
success. Push CI changes (steps 1-3) first, wait for green, THEN run step 4.
```

---

### P1-4: `strict: true` FORCES UP-TO-DATE BRANCHES — MERGE QUEUE BOTTLENECK

**Consensus**: 1/5 agents (DA3)
**Location**: WS2 and WS4 branch protection commands

**Finding**: `strict: true` means PRs must include the latest `main` commit before merging. If 3 PRs are ready, they merge one-at-a-time with full CI re-runs between each (~15 min each = ~45 min total). For a project going from zero protection to full protection, this is aggressive and may provoke workarounds.

**Patch**: Consider `strict: false` for initial rollout (still requires checks to pass, just doesn't force rebase). Add comment acknowledging the tradeoff. Upgrade to `strict: true` after adopting GitHub merge queue.

---

### P1-5: `ci-placeholder` ENV VARS WILL CAUSE CONFUSING FAILURES

**Consensus**: 2/5 agents (DA3: P2, DA5: P1)
**Location**: WS4 step 1, CI env vars (lines 341-343)

**Finding**: CI sets `SUPABASE_SERVICE_ROLE_KEY: ci-placeholder`. DA5 found specific non-integration test files that call `createClient(url, key)` — these will hang or produce opaque HTTP errors at runtime. The `jest.setup.env.js` fallbacks are overridden because CI explicitly sets the vars.

**Patch**: Use the well-known Supabase demo JWTs (already in `jest.setup.js`) instead of `ci-placeholder`:
```yaml
env:
  NEXT_PUBLIC_SUPABASE_URL: http://localhost:54321
  NEXT_PUBLIC_SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
  SUPABASE_SERVICE_ROLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```

---

### P1-6: NO BREAK-GLASS PROCEDURE FOR BRANCH PROTECTION

**Consensus**: 1/5 agents (DA5)
**Location**: Spec overall — missing section

**Finding**: `enforce_admins=true` + `allow_force_pushes=false` + required status checks + no documented override path. During a GitHub Actions outage, the repo is completely frozen. No emergency merge is possible.

**Patch**: Add a "Break-Glass Procedure" section:
```
### Break-Glass Procedure
In case of CI outage or emergency hotfix need:
1. Temporarily disable branch protection:
   gh api repos/diepulp/pt-2/branches/main/protection --method DELETE
2. Merge the emergency change
3. Re-enable protection using the WS4 step 4 command
4. Document the bypass in the next PR's §12 disclosure
```

---

### P1-7: CICD-PIPELINE-SPEC ANNOTATION INCOMPLETE — GATES 3 AND 6 ALSO NOT IMPLEMENTED

**Consensus**: 1/5 agents (DA1)
**Location**: WS1 action 4, lines 114-116

**Finding**: WS1 annotates Gate 4 (Test) as NOT IMPLEMENTED but leaves Gates 3 (RLS Write-Path Lint) and 6 (Typegen Drift Check) unmarked. Neither exists in `ci.yml`. The document header still says "All gates are **blocking**." Annotating only Gate 4 is a partial truth correction that leaves the document materially misleading.

**Patch**: Expand WS1 action 4:
1. Add governance notices to Gate 3 and Gate 6 indicating NOT IMPLEMENTED.
2. Amend "All gates are **blocking**" to: "Gates 1, 2, and 5 are **blocking**. Gates 3, 4, and 6 are documented targets; see individual gate annotations for implementation status."
3. If out of scope, explicitly defer as a named follow-up item.

---

### P1-8: CENSUS NUMBERS STALE THROUGHOUT — VERIFICATION WILL PRODUCE FALSE CONFIDENCE

**Consensus**: 3/5 agents (DA2, DA4, DA5)
**Location**: Census table (lines 60-69), verification comments (lines 296-303)

**Finding**: Multiple errors: `services/` is 103 not 102. Integration exclusion count is ~34 not ~9. Expected node count of ~196 is wrong (actual ~172 after correct exclusions). Total 273 doesn't account for 22+ files outside the 6 listed directories. The `workers/9` in census vs `workers/5` non-integration count is unexplained. Verification step compares `wc -l` against these wrong numbers — if the count is "close enough," the 22 dropped files (P0-2) are masked.

**Patch**: Full recount required. Update census table to include all test directories. Replace approximate expected counts in verification with a delta-check: compare `find . -name '*.test.*' -not -path '*/node_modules/*' | wc -l` against `npx jest --listTests | wc -l` and fail if they diverge.

---

## P2 Findings (design smells)

### P2-1: `ts-jest` TRANSFORM IS DEAD CODE — `next/jest` SWC OVERRIDES IT

**Consensus**: 1/5 (DA2)
**Location**: Both proposed configs, `transform` blocks

**Finding**: `next/jest` injects the SWC transformer for `^.+\.(js|jsx|ts|tsx|mjs)$` which matches before the narrower `ts-jest` pattern `^.+\.(ts|tsx)$`. The `ts-jest` transform is never reached. DA2 verified via config resolution.

**Patch**: Remove `transform` blocks from both configs. `next/jest` handles TypeScript via SWC. Note: don't remove `ts-jest` from `devDependencies` yet — other configs may use it.

---

### P2-2: REQUIRED CHECK NAME COUPLING IS FRAGILE

**Consensus**: 1/5 (DA3)
**Location**: WS4 step 4, `contexts: ["checks", "test"]`

**Finding**: Required status check names must match job keys exactly. If someone adds `name: "Static Checks"` to a job, the required check silently stops matching. GitHub shows "Expected — Waiting for status to be reported" with no actionable error.

**Patch**: Add a comment above each CI job:
```yaml
# LOAD-BEARING: Job name "checks" is a required status check in branch protection.
# Renaming will silently break merge gating. Update protection if renamed.
```
Also document the load-bearing names in the CICD-PIPELINE-SPEC.

---

### P2-3: §12 DISCLOSURE GAP FOR INTERMEDIATE PRs

**Consensus**: 1/5 (DA1)
**Location**: WS5 PR disclosure block

**Finding**: Standard §12 requires disclosure on every governance-relevant PR. The spec only provides the disclosure template in WS5 (runs last). If EXEC-051 is delivered across multiple PRs, intermediate PRs lack §12 disclosure.

**Patch**: Add note at top of Workstreams section: "If EXEC-051 is delivered across multiple PRs, each PR that modifies testing posture must include its own §12 disclosure block."

---

### P2-4: NO CATCH-ALL FOR FUTURE TESTMATCH DRIFT

**Consensus**: 1/5 (DA5)
**Location**: Spec overall design

**Finding**: After this ships, any test file in a new directory (`context/`, `utils/`, `config/`, etc.) is silently ignored. The exact problem being remediated will recur.

**Patch**: Add a CI verification step or Jest `globalSetup` script:
```bash
# Drift detection: fail if any test file exists but isn't captured by project configs
TOTAL=$(find . -name '*.test.*' -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/cypress/*' | wc -l)
CAPTURED=$(npx jest --listTests 2>/dev/null | wc -l)
if [ "$TOTAL" -ne "$CAPTURED" ]; then echo "DRIFT: $TOTAL files on disk, $CAPTURED in Jest"; exit 1; fi
```

---

### P2-5: `setupFiles` vs `setupFilesAfterEnv` INCONSISTENCY

**Consensus**: 4/5 (DA1, DA2, DA3, DA4)
**Location**: `jest.node.config.js` line 166

**Finding**: Node project uses `setupFiles` (runs before test framework), while jsdom project intends `setupFilesAfterEnv` (runs after). For env-var-only setup this is technically correct but undocumented and inconsistent.

**Patch**: Either change to `setupFilesAfterEnv` for consistency, or add design decision comment: "Node project uses `setupFiles` because `jest.setup.env.js` only sets env vars and does not depend on Jest globals."

---

### P2-6: MOVE/WS/STEP NUMBERING CONFUSION ACROSS DOCS

**Consensus**: 1/5 (DA4)
**Location**: EXEC-SPEC line 18 vs Remediation doc vs Rollout strategy

**Finding**: Three numbering systems (Move N, Step N, WS N) for the same work items across three documents. WS2 = Move 1 = Step 1, etc. An executor cross-referencing will hit confusion.

**Patch**: Add a mapping table near the top of the EXEC-SPEC:
```
| EXEC-051 WS | Remediation Move | Rollout Step |
|-------------|-----------------|-------------|
| WS1         | Move 0 (new)    | Step 0      |
| WS2         | Move 1          | Step 1      |
| WS3         | Move 2          | Step 2      |
| WS4         | Move 3 + mark   | Steps 3-4   |
| WS5         | (new)           | (new)       |
```

---

## P3 Findings (observations)

| ID | Finding | Source | Patch |
|----|---------|--------|-------|
| P3-1 | Node 24 labeled "LTS (Krypton)" in CICD-PIPELINE-SPEC — premature, still Current | DA3 | Correct to "Current" |
| P3-2 | No `push` trigger for post-merge CI validation on `main` | DA3 | Phase 1B consideration |
| P3-3 | 8-10h estimate fragile if >5 tests have jsdom coupling | DA4 | Add pre-flight: test 5 representative files under node first |
| P3-4 | Rollout doc says "81 node, 38 jsdom" vs spec's ~196/~40 — stale | DA4 | Update rollout or add cross-ref note |
| P3-5 | `@jest-environment` docblock count is 98 (96+2 in scripts/) not 96 | DA2 | Don't remove docblocks from files outside project-scoped dirs |
| P3-6 | `__tests__/integration/player-identity.test.ts` misnamed (should be `.int.test.ts`) | DA5 | Rename during docblock cleanup |
| P3-7 | File manifest says "~97 test files" — actual is exactly 97 (or 98) | DA5 | Drop the tilde |
| P3-8 | No warning to in-flight PR authors when branch protection activates | DA5 | `gh pr list` check in WS2 |

---

## Agent Cross-Reference Matrix

| Finding | DA1 | DA2 | DA3 | DA4 | DA5 | Consensus |
|---------|-----|-----|-----|-----|-----|-----------|
| P0-1 setupFilesAfterSetup typo | P0 | P0 | P0 | P0 | P0 | **5/5** |
| P0-2 Test files dropped | — | P0 (22) | P0 (4) | — | P0 (23) | **3/5** |
| P0-3 Solo-dev lockout | P1 | — | P2 | P1 | P0 | **4/5** |
| P1-1 Coverage thresholds missing | P1 | P1 | P1 | P1 | — | **4/5** |
| P1-2 needs:checks serialization | — | — | P1 | P1 | — | **2/5** |
| P1-3 Temporal constraint | — | — | — | P1 | — | **1/5** |
| P1-4 strict:true bottleneck | — | — | P1 | — | — | **1/5** |
| P1-5 ci-placeholder env vars | — | — | P2 | — | P1 | **2/5** |
| P1-6 No break-glass | — | — | — | — | P1 | **1/5** |
| P1-7 CICD-SPEC Gates 3/6 | P1 | — | — | — | — | **1/5** |
| P1-8 Census stale | P3 | P1 | — | P3 | P1 | **4/5** |
| P2-1 Dead ts-jest transform | — | P2 | — | — | — | **1/5** |
| P2-2 Check name fragility | — | — | P2 | — | — | **1/5** |
| P2-3 §12 intermediate PRs | P2 | — | — | — | — | **1/5** |
| P2-4 testMatch drift catch-all | — | — | — | — | P2 | **1/5** |
| P2-5 setupFiles inconsistency | P2 | P2 | P1 | P2 | — | **4/5** |
| P2-6 Numbering confusion | — | — | — | P2 | — | **1/5** |

---

## Patch Priority Order

**Before `/build`** (P0 — spec text patches):
1. Fix `setupFilesAfterSetup` → `setupFilesAfterEnv` (1 line)
2. Add missing directories to `testMatch` patterns + update census (spec rewrite)
3. Remove or rework `required_pull_request_reviews` in branch protection commands

**Before first PR merge** (P1 — spec text + procedural):
4. Add coverage thresholds to `jest.node.config.js` code block
5. Remove `needs: checks` from test job
6. Document WS4 temporal constraint
7. Add break-glass procedure section
8. Consider `strict: false` for initial rollout
9. Use demo JWTs instead of `ci-placeholder`
10. Expand CICD-PIPELINE-SPEC annotation to Gates 3/6
11. Recount and correct census numbers throughout

**Nice-to-have** (P2):
12-17. See P2 section above

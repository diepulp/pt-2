# Casino Exemplar Completion Summary

**Date:** 2026-03-13
**Branch:** `testing-gov-remediation`
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD.md
**Issue:** ISSUE-C4D2AA48
**Baseline commit:** `065c2c4` (Slice One: Jest runtime split + Casino test exemplars)

---

## What Was Delivered in Slice One (commit `065c2c4`)

| Artifact | Description |
|----------|-------------|
| `jest.node.config.js` | Node runtime config for server-side unit tests |
| `jest.integration.config.js` | Integration config with `RUN_INTEGRATION_TESTS` gating |
| `jest.setup.node.ts` | Minimal server setup (env vars, no `@testing-library/jest-dom`) |
| `setup-wizard-rpc.int.test.ts` | Integration canary exemplar (39 tests) |
| `settings-route-boundary.test.ts` | Route-handler boundary exemplar (3 tests) |
| `package.json` scripts | `test:unit:node`, `test:integration:canary`, `test:slice:casino`, `test:verify` |
| `SLICE-ONE-POSTURE.md` | Initial posture statement |
| `SLICE-ONE-RUNBOOK.md` | Local verification runbook |

## What Was Completed Post-Slice-One

### Files Modified (7)

| File | Change |
|------|--------|
| `casino.integration.test.ts` | Added `/** @jest-environment node */` directive + `RUN_INTEGRATION_TESTS` gate pattern |
| `gaming-day-boundary.int.test.ts` | Added `/** @jest-environment node */` directive |
| `rpc-accept-staff-invite-abuse.int.test.ts` | Added `/** @jest-environment node */` directive |
| `rpc-bootstrap-casino-abuse.int.test.ts` | Added `/** @jest-environment node */` directive |
| `rpc-create-staff.int.test.ts` | Added `/** @jest-environment node */` directive |
| `crud.unit.test.ts` | §11-compliant skip on 1 test (missing `reconcileStaffClaims` mock) |
| `casino.test.ts` | §11-compliant skip on 6 tests (header casing drift: `idempotency-key` → `Idempotency-Key`) |

### Files Created (2)

| File | Purpose |
|------|---------|
| `CASINO-EXEMPLAR-POSTURE.md` | Full layer health table, skip registry, TS diagnostic inventory, promotion readiness |
| `CONTEXT-ROLLOUT-TEMPLATE.md` | Reusable standard-aligned rollout checklist for future contexts (placed in parent dir) |

### Files NOT Modified (by design)

- `setup-wizard-rpc.int.test.ts` (exemplar — frozen)
- `settings-route-boundary.test.ts` (exemplar — frozen)
- `jest.node.config.js`, `jest.integration.config.js`, `package.json`

---

## Test Results

| Config | Files | Tests Passing | Tests Skipped | Exit Code |
|--------|-------|---------------|---------------|-----------|
| Node (`test:slice:casino`) | 14 | 355 | 0 | 0 |
| Integration (without Supabase) | 5 + 1 skipped | 75 | 21 | 0 |
| Config overlap | 0 | — | — | — |

*Updated 2026-03-14: 7 previously-skipped tests resolved (header casing + claims mock fixes).*

---

## Inventory Classification (20 files)

| Canonical Layer (§3) | Count | Files |
|----------------------|-------|-------|
| Server-Unit (§3.3) | 16 | `bootstrap`, `casino`, `crud.unit`, `game-settings`, `gaming-day`, `gaming-day-boundary.int`*, `invite`, `keys`, `mappers`, `onboarding-rpc-contract`, `rpc-create-staff.int`*, `rpc-bootstrap-casino-abuse.int`*, `rpc-accept-staff-invite-abuse.int`*, `schemas`, `service`, `settings-route` |
| Route-Handler (§3.4) | 1 | `settings-route-boundary` |
| Integration (§3.5) | 2 | `casino.integration`, `setup-wizard-rpc.int` |
| Smoke (§3.7) | 1 | `http-contract` (reclassified per §9.2 — only asserts `typeof === 'function'`) |

*\* Misnamed as `.int.test.ts` but do not require live infrastructure. Renaming deferred.*

---

## Skip Registry (§11)

| File | Test(s) | Reason | Exit Criteria |
|------|---------|--------|---------------|
| `crud.unit.test.ts` | `creates pit_boss with user_id` | `createStaff` now calls `reconcileStaffClaims` internally; mock missing | Add `jest.mock('@/lib/supabase/claims-reconcile')` (matching `bootstrap.test.ts` pattern) |
| `casino.test.ts` | 6 tests (all HTTP method assertions) | Header casing drift: `idempotency-key` → `Idempotency-Key` | Update expected header casing in all 6 assertions |

All 7 skipped tests are **pre-existing failures**. None introduced by this remediation.

---

## Pre-Existing TypeScript Diagnostics (Corrected 2026-03-14)

| Diagnostic | Files | Root Cause | Status |
|------------|-------|------------|--------|
| TS2307: Cannot find module `@/types/database.types` | `casino.integration`, `gaming-day-boundary.int`, `rpc-*.int` | `@/` path alias resolved by Jest `moduleNameMapper`, not IDE. Runtime-correct. | Not a defect |
| TS2322: Type `true` not assignable to `never` | `rpc-accept-staff-invite-abuse.int`, `rpc-bootstrap-casino-abuse.int`, `rpc-create-staff.int` | **False positive.** Cascades from TS2307 — when module is unresolvable, `Database` is opaque and all conditional types evaluate to `never`. Under `tsconfig.json`: zero errors. RPC signatures match `database.types.ts` exactly. No schema drift exists. | No action needed |
| TS6133: `data` declared but never read | `casino.integration` (4 instances) | Unused destructured variables in negative-path tests. | **Fixed** (bindings removed) |

**Correction:** The original summary characterized TS2322 as "type-contract tests detecting real drift." Investigation (2026-03-14) proved this wrong — all TS2322 errors are cascading artifacts of the TS2307 path alias issue, not actual schema drift.

---

## Governance Alignment

| Standard Section | Status |
|------------------|--------|
| §3 Canonical taxonomy | All 20 files classified into exactly one layer |
| §4 Environment contract | Node directive on all server-side files, integration gate on DB-dependent files |
| §5 Verification tier + health state | Layer health table in posture doc |
| §9 Shallow test reclassification | `http-contract.test.ts` → Smoke/Compromised |
| §10 Script truthfulness | `test:slice:casino` scope verified |
| §11 Skip documentation | 7 tests with reason + exit criteria |
| §12 Change-control disclosure | This document serves as disclosure |

---

## Promotion Readiness (§7)

| Criterion | Status |
|-----------|--------|
| 1. Jest environments correctly split | Met |
| 2. At least one context Trusted-Local | **Met (Casino)** |
| 3. Unit test execution in CI (advisory) | Not yet |
| 4. Stable signal observation period | Not yet |

---

## Next: Roll Pattern to Player Context

The Casino exemplar is complete. The next context to roll is **PlayerService** using `CONTEXT-ROLLOUT-TEMPLATE.md`:
- 6 existing unit tests, 0 integration tests
- 8 route handlers
- Clean starting point for template validation

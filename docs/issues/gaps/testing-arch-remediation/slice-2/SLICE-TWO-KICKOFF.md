# Slice Two — Player & Visit Bounded Context Rollout

**Issue**: ISSUE-C4D2AA48
**Date**: 2026-03-30
**Prerequisite**: Slice One (Casino exemplar, commit `065c2c4`, validated 2026-03-14)
**Template**: `CONTEXT-ROLLOUT-TEMPLATE.md`
**Status**: Kickoff — inventory complete, gaps identified

---

## Scope

Slice Two covers two bounded contexts that were partially rolled out during PR #24 (`2d0e7af`, 2026-03-14) and subsequent exclusion work. This kickoff documents what was delivered, what gaps remain, and what work is needed to declare both contexts Trusted-Local per §5.

| Context | Unit Tests | Integration Tests | Route Boundary | Slice Script |
|---------|-----------|-------------------|----------------|-------------|
| Player  | 7 files, 114 passing | 3 `.int.test.ts` files | `player-route-boundary.test.ts` | `test:slice:player` |
| Visit   | 4 files, 45 passing | 3 files (`.int.test.ts` + `.integration.test.ts`) | `visit-route-boundary.test.ts` | `test:slice:visit` |

---

## 1. Player Context — Inventory

### Test Files (node config discovery)

| File | Layer (§3) | `@jest-environment node` | Status |
|------|-----------|--------------------------|--------|
| `schemas.test.ts` | Server-Unit | Yes | Healthy — 114/114 |
| `player.service.test.ts` | Server-Unit | Yes | Healthy |
| `exclusion-schemas.test.ts` | Server-Unit | Yes | Healthy |
| `exclusion-mappers.test.ts` | Server-Unit | Yes | Healthy |
| `player-route-boundary.test.ts` | Route-Handler (§3.4) | Yes | Healthy — exemplar pattern |
| `http-contract.test.ts` | Route-Handler (§3.4) | Yes | Smoke (§9.2) — shallow mock pattern |
| `exclusion-http-contract.test.ts` | Route-Handler (§3.4) | Yes | Smoke (§9.2) — shallow mock pattern |

### Integration Tests (excluded from node config, gated by `RUN_INTEGRATION_TESTS`)

| File | `@jest-environment node` | Gate | Status |
|------|--------------------------|------|--------|
| `player-rpc-contract.int.test.ts` | Yes | Yes | Canary — RPC contract surface |
| `exclusion-rpc.int.test.ts` | Yes | Yes | Canary — exclusion RPC contract |
| `exclusion-enforcement.int.test.ts` | Yes | Yes | Canary — enforcement logic |

### Rollout History

- `db88872` (2026-03-13) — node directives added, idempotency header casing fixed (Category B)
- `d3d8c40` — exclusion SECURITY DEFINER RPCs, schemas, mappers added with directives from inception
- `bd82986` — exclusion enforcement wired, integration tests added

### Gaps

None identified. All 10 test files have `@jest-environment node`. Route boundary exemplar follows Casino pattern. Integration canaries have proper gating. Slice script exists and passes.

**Player assessment: Ready for Trusted-Local declaration.**

---

## 2. Visit Context — Inventory

### Test Files (node config discovery)

| File | Layer (§3) | `@jest-environment node` | Status |
|------|-----------|--------------------------|--------|
| `visit.service.test.ts` | Server-Unit | **No** — missing directive | Healthy (45/45), but §4 gap |
| `visit-continuation.test.ts` | Server-Unit | **No** — missing directive | Healthy, §4 gap |
| `visit-route-boundary.test.ts` | Route-Handler (§3.4) | Yes | Healthy — exemplar pattern |
| `http-contract.test.ts` | Route-Handler (§3.4) | Yes | Smoke (§9.2) — shallow mock pattern |

### Integration Tests (excluded from node config, gated by `RUN_INTEGRATION_TESTS`)

| File | `@jest-environment node` | Gate | Status |
|------|--------------------------|------|--------|
| `visit-rpc-contract.int.test.ts` | Yes | Yes | Canary — RPC contract surface |
| `gaming-day-boundary.int.test.ts` | Yes | ? | Needs gate verification |
| `visit-continuation.integration.test.ts` | ? | ? | Needs directive + gate verification |

### Rollout History

- `db88872` (2026-03-13) — idempotency header casing fixed (Category B, 5 tests)
- Route boundary test added during Slice Two prep (modeled on Player exemplar)

### Gaps

| Gap | Severity | Remediation |
|-----|----------|-------------|
| `visit.service.test.ts` missing `@jest-environment node` | Low — runs correctly via config path, but violates §4 contract | Add directive |
| `visit-continuation.test.ts` missing `@jest-environment node` | Low — same | Add directive |
| `gaming-day-boundary.int.test.ts` — gate pattern unverified | Medium — may run unconditionally under integration config | Verify `RUN_INTEGRATION_TESTS` gate |
| `visit-continuation.integration.test.ts` — directive + gate unverified | Medium — same | Verify both |

**Visit assessment: Two directive gaps and two integration gate verifications needed before Trusted-Local.**

---

## 3. Remediation Work Items

### 3.1 Visit directive fixes (§4 compliance)

Add `/** @jest-environment node */` to:
1. `services/visit/__tests__/visit.service.test.ts`
2. `services/visit/__tests__/visit-continuation.test.ts`

Functional impact: none (they already run under node via `jest.node.config.js` path matching). This is a §4 contract consistency fix.

### 3.2 Visit integration gate audit

Verify `RUN_INTEGRATION_TESTS` gate pattern in:
1. `services/visit/__tests__/gaming-day-boundary.int.test.ts`
2. `services/visit/__tests__/visit-continuation.integration.test.ts`

If missing, add the standard gate:
```typescript
const describeIntegration = process.env.RUN_INTEGRATION_TESTS
  ? describe
  : describe.skip;
```

### 3.3 Shallow test reclassification (§9.2)

Both contexts have `http-contract.test.ts` files that follow the shallow mock pattern. These should be honestly reclassified as Smoke in the posture doc. They are not deleted or skipped — just not counted toward Trusted-Local verification.

| File | Context | Reclassify to |
|------|---------|---------------|
| `services/player/__tests__/http-contract.test.ts` | Player | Smoke (§9.2) |
| `services/player/__tests__/exclusion-http-contract.test.ts` | Player | Smoke (§9.2) |
| `services/visit/__tests__/http-contract.test.ts` | Visit | Smoke (§9.2) |

---

## 4. Promotion Checkpoint (§7)

After Slice Two completion, three bounded contexts will be at Trusted-Local:

| §7 Criterion | Status |
|--------------|--------|
| 1. Jest environments correctly split | Met (Slice One) |
| 2. At least one context Trusted-Local | Met — Casino, Player, Visit |
| 3. Unit test execution in CI (advisory) | Met — `test` job runs node suite, 2,627 tests, 0 failures |
| 4. Stable signal observation period | Met — advisory since 2026-03-14, stable through 16 subsequent merges |

All four promotion criteria are satisfied. Branch protection activation (EXEC-051 WS2, Phase 4 Move 9) and CI test job promotion to required (Move 10) are unblocked.

---

## 5. Exit Criteria

All must be true before Slice Two is declared complete:

- [ ] `npm run test:slice:player` — 114/114 green under node runtime
- [ ] `npm run test:slice:visit` — 45/45 green under node runtime
- [ ] All Visit test files have `@jest-environment node` directive
- [ ] Visit integration tests have `RUN_INTEGRATION_TESTS` gate
- [ ] Shallow tests reclassified in posture doc (not counted as verification)
- [ ] SLICE-TWO-POSTURE.md written per §5
- [ ] Skip registry: empty (no skipped tests)
- [ ] INDEX.md updated to reference Slice Two

---

## 6. Estimated Effort

| Work Item | Effort |
|-----------|--------|
| Visit directive fixes (2 files) | 10 min |
| Visit integration gate audit (2 files) | 15 min |
| Posture doc (SLICE-TWO-POSTURE.md) | 30 min |
| INDEX.md update | 10 min |
| Verification runs | 15 min |
| **Total** | **~1.5h** |

The heavy lifting (node directives, route boundary exemplars, integration canaries, slice scripts) was already delivered during and after PR #24. This slice is primarily a documentation and compliance gap-close.

---

## 7. References

- `docs/issues/gaps/testing-arch-remediation/CONTEXT-ROLLOUT-TEMPLATE.md` — reusable checklist
- `docs/issues/gaps/testing-arch-remediation/slice-1/SLICE-ONE-POSTURE.md` — Casino exemplar posture
- `docs/issues/gaps/testing-arch-remediation/slice-1/SLICE-ONE-RUNBOOK.md` — Casino runbook
- `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` v2.0.0 — normative definitions
- `docs/80-adrs/ADR-044-testing-governance-posture.md` — decision record
- Commit `db88872` — Category B+D fixes, Player rollout prep
- Commit `2d0e7af` — PR #24 merge (testing-gov-remediation)

# Slice Three — RatingSlip, TableContext, Loyalty, MTL Rollout

**Issue**: ISSUE-C4D2AA48
**Date**: 2026-03-30
**Prerequisites**: Slice One (Casino), Slice Two (Player, Visit)
**Template**: `CONTEXT-ROLLOUT-TEMPLATE.md`
**Status**: Kickoff — inventory complete, gaps identified

---

## Scope

Slice Three covers the four next bounded contexts in the rollout order established by `CONTEXT-ROLLOUT-TEMPLATE.md`. These are the largest remaining service surfaces. Together with Slices One and Two, completing this slice covers 7 of 17 service contexts and the vast majority of test volume.

| Context | Unit Tests | Integration Tests | Files with Directive | Route Boundary | Slice Script |
|---------|-----------|-------------------|---------------------|----------------|-------------|
| RatingSlip | 6 files, 141 passing | 5 files | 7 of 11 | `rating-slip-route-boundary.test.ts` | `test:slice:rating-slip` |
| TableContext | 25 files, 492 passing (71 todo) | 6 files | 7 of 31 | None | None |
| Loyalty | 6 files, 85 passing | 7 files | 7 of 13 | None | None |
| MTL | 2 files, 72 passing | 0 files | 0 of 2 | None | None |

---

## 1. RatingSlip Context

### 1a. Unit Tests (node config discovery: 6 files, 141 tests)

| File | Layer (§3) | `@jest-environment node` | Status |
|------|-----------|--------------------------|--------|
| `mappers.test.ts` | Server-Unit | Yes | Healthy |
| `queries.test.ts` | Server-Unit | Yes | Healthy |
| `rating-slip.service.test.ts` | Server-Unit | Yes | Healthy |
| `rating-slip-continuity.test.ts` | Server-Unit | Yes | Healthy |
| `rating-slip-route-boundary.test.ts` | Route-Handler (§3.4) | Yes | Healthy — exemplar pattern |
| `http-contract.test.ts` | Route-Handler (§3.4) | Yes | Smoke (§9.2) — shallow mock pattern |

### 1b. Integration Tests (5 files, excluded from node config)

| File | `@jest-environment node` | `RUN_INTEGRATION_TESTS` gate | Status |
|------|--------------------------|------------------------------|--------|
| `rating-slip-rpc-contract.int.test.ts` | Yes | Yes | Compliant |
| `policy-snapshot.integration.test.ts` | **No** | **No** | **Missing both** |
| `rating-slip-continuity.integration.test.ts` | **No** | **No** | **Missing both** |
| `rating-slip.integration.test.ts` | **No** | **No** | **Missing both** |
| `rating-slip-move-pooling.integration.test.ts` | **No** | **No** | **Missing both** |

### 1c. Gaps

| Gap | Severity | Files | Remediation |
|-----|----------|-------|-------------|
| 4 integration tests missing `@jest-environment node` | Medium | `policy-snapshot`, `rating-slip-continuity`, `rating-slip`, `rating-slip-move-pooling` (.integration.test.ts) | Add directive |
| 4 integration tests missing `RUN_INTEGRATION_TESTS` gate | **High** — will run unconditionally under integration config, fail without Supabase | Same 4 files | Add gate pattern |

### 1d. What's already in place

- Route boundary exemplar exists (`rating-slip-route-boundary.test.ts`)
- RPC contract canary exists (`rating-slip-rpc-contract.int.test.ts`) — fully compliant
- Slice script exists (`test:slice:rating-slip`)
- All 7 unit/route-handler files have node directives

**RatingSlip assessment: Unit layer ready. 4 integration tests need directive + gate remediation.**

---

## 2. TableContext Context

### 2a. Unit Tests (node config discovery: 25 files, 492 tests, 71 todo)

| File | Layer (§3) | `@jest-environment node` | Status |
|------|-----------|--------------------------|--------|
| `rundown-report-mappers.test.ts` | Server-Unit | Yes | Healthy |
| `rundown-report-schemas.test.ts` | Server-Unit | Yes | Healthy |
| `shift-checkpoint-mappers.test.ts` | Server-Unit | Yes | Healthy |
| `shift-checkpoint-schemas.test.ts` | Server-Unit | Yes | Healthy |
| `mappers-confirmation.test.ts` | Server-Unit | Yes | Healthy |
| `chip-custody-confirmation.test.ts` | Server-Unit | Yes | Healthy |
| `http-contract.test.ts` | Route-Handler (§3.4) | Yes | Smoke (§9.2) |
| `admin-display.test.ts` | Server-Unit | **No** | §4 gap |
| `chip-custody.test.ts` | Server-Unit | **No** | §4 gap |
| `close-guardrails.test.ts` | Server-Unit | **No** | §4 gap |
| `close-reason-labels.test.ts` | Server-Unit | **No** | §4 gap |
| `close-reason-schema.test.ts` | Server-Unit | **No** | §4 gap |
| `dealer-rotation.test.ts` | Server-Unit | **No** | §4 gap |
| `mappers.test.ts` | Server-Unit | **No** | §4 gap |
| `pit-display.test.ts` | Server-Unit | **No** | §4 gap |
| `rundown.test.ts` | Server-Unit | **No** | §4 gap |
| `session-mapper.test.ts` | Server-Unit | **No** | §4 gap |
| `shift-cash-obs.test.ts` | Server-Unit | **No** | §4 gap |
| `shift-cash-obs-guardrails.test.ts` | Server-Unit | **No** | §4 gap |
| `shift-metrics-opening-baseline.test.ts` | Server-Unit | **No** | §4 gap |
| `shift-metrics-snapshot-gaps.test.ts` | Server-Unit | **No** | §4 gap |
| `shift-provenance-rollup.test.ts` | Server-Unit | **No** | §4 gap |
| `shift-read-model-audit.test.ts` | Server-Unit | **No** | §4 gap |
| `table-lifecycle.test.ts` | Server-Unit | **No** | §4 gap |
| `table-settings.test.ts` | Server-Unit | **No** | §4 gap |

### 2b. Integration Tests (6 files, excluded from node config)

| File | `@jest-environment node` | `RUN_INTEGRATION_TESTS` gate | Status |
|------|--------------------------|------------------------------|--------|
| `rpc-activate-table-session.int.test.ts` | **No** | Yes | Directive gap |
| `rpc-close-table-session-cancel.int.test.ts` | **No** | Yes | Directive gap |
| `rpc-open-table-session.int.test.ts` | **No** | Yes | Directive gap |
| `session-close-lifecycle.int.test.ts` | **No** | Yes | Directive gap |
| `table-opening-attestation-rls.int.test.ts` | **No** | Yes | Directive gap |
| `table-context.integration.test.ts` | **No** | **No** | **Missing both** |

### 2c. Gaps

| Gap | Severity | Count | Remediation |
|-----|----------|-------|-------------|
| 18 unit tests missing `@jest-environment node` | Low — run correctly via config path | 18 files | Add directive |
| 5 `.int.test.ts` files missing directive | Low — excluded by config, gated | 5 files | Add directive |
| `table-context.integration.test.ts` missing directive + gate | **High** | 1 file | Add both |
| No route boundary exemplar | Medium | — | Author one (follow Casino/Player pattern) |
| No slice script | Low | — | Add `test:slice:table-context` to package.json |

### 2d. What's already in place

- 7 files have node directives (newer files added during PRD-059 custody work)
- 5 of 6 integration tests have proper `RUN_INTEGRATION_TESTS` gating
- 492 tests passing, all green (71 test.todo items — legitimate pending work, not failures)

**TableContext assessment: Largest surface. 24 directive gaps, 1 ungated integration test, no route boundary exemplar. Most effort in this slice.**

---

## 3. Loyalty Context

### 3a. Unit Tests (node config discovery: 6 files, 85 tests)

| File | Layer (§3) | `@jest-environment node` | Status |
|------|-----------|--------------------------|--------|
| `valuation-policy.test.ts` | Server-Unit | Yes | Healthy |
| `issue-comp-variable-amount.test.ts` | Server-Unit | Yes | Healthy |
| `http-contract.test.ts` | Route-Handler (§3.4) | Yes | Smoke (§9.2) |
| `crud.test.ts` | Server-Unit | **No** | §4 gap |
| `mappers.test.ts` | Server-Unit | **No** | §4 gap |
| `mid-session-reward.test.ts` | Server-Unit | **No** | §4 gap |

### 3b. Integration Tests (7 files, excluded from node config)

| File | `@jest-environment node` | `RUN_INTEGRATION_TESTS` gate | Status |
|------|--------------------------|------------------------------|--------|
| `issuance-idempotency.int.test.ts` | Yes | **No** | Gate gap |
| `issue-comp.int.test.ts` | Yes | **No** | Gate gap |
| `issue-entitlement.int.test.ts` | Yes | **No** | Gate gap |
| `valuation-policy-roundtrip.int.test.ts` | Yes | **No** | Gate gap |
| `promo-outbox-contract.int.test.ts` | **No** | **No** | **Missing both** |
| `loyalty-accrual-lifecycle.integration.test.ts` | **No** | **No** | **Missing both** |
| `points-accrual-calculation.integration.test.ts` | **No** | **No** | **Missing both** |

### 3c. Gaps

| Gap | Severity | Count | Remediation |
|-----|----------|-------|-------------|
| 3 unit tests missing `@jest-environment node` | Low | 3 files | Add directive |
| 4 `.int.test.ts` files missing `RUN_INTEGRATION_TESTS` gate | **High** — will run unconditionally, fail without Supabase | 4 files | Add gate pattern |
| 3 `.integration.test.ts` files missing directive + gate | **High** | 3 files | Add both |
| No route boundary exemplar | Medium | — | Author one |
| No slice script | Low | — | Add `test:slice:loyalty` to package.json |

### 3d. What's already in place

- Existing coverage thresholds in `jest.config.js` (80% branches for `business.ts`, 75% for `crud.ts`)
- 4 of 7 integration tests have node directives (the `.int.test.ts` files)
- 85 tests passing, all green

**Loyalty assessment: Integration layer has the most compliance gaps — 7 of 7 files need at least one fix. Unit layer mostly clean.**

---

## 4. MTL Context

### 4a. Unit Tests (node config discovery: 2 files, 72 tests)

| File | Layer (§3) | `@jest-environment node` | Status |
|------|-----------|--------------------------|--------|
| `mappers.test.ts` | Server-Unit | **No** | §4 gap |
| `view-model.test.ts` | Server-Unit | **No** | §4 gap |

### 4b. Integration Tests

None.

### 4c. Gaps

| Gap | Severity | Count | Remediation |
|-----|----------|-------|-------------|
| 2 unit tests missing `@jest-environment node` | Low | 2 files | Add directive |
| No integration tests | Informational — small surface | — | Not required for Trusted-Local |
| No route boundary exemplar | Medium | — | Author one if MTL has route handlers |
| No slice script | Low | — | Add `test:slice:mtl` to package.json |

**MTL assessment: Smallest surface, lowest effort. 2 directive adds, possibly a route boundary exemplar.**

---

## 5. Aggregate Gap Summary

### By gap type

| Gap Type | RatingSlip | TableContext | Loyalty | MTL | Total |
|----------|-----------|-------------|---------|-----|-------|
| Unit test missing directive | 0 | 18 | 3 | 2 | **23** |
| Integration missing directive | 4 | 6 | 3 | 0 | **13** |
| Integration missing gate | 4 | 1 | 7 | 0 | **12** |
| Route boundary exemplar needed | 0 | 1 | 1 | 1 | **3** |
| Slice script needed | 0 | 1 | 1 | 1 | **3** |
| Shallow tests to reclassify (§9.2) | 1 | 1 | 1 | 0 | **3** |

### By severity

| Severity | Count | Description |
|----------|-------|-------------|
| **High** | 12 files | Integration tests missing `RUN_INTEGRATION_TESTS` gate — will fail without Supabase |
| Medium | 26 files | Missing `@jest-environment node` — functionally correct via config, §4 contract gap |
| Low | 3 scripts | Missing slice scripts in package.json |

---

## 6. Remediation Work Items

### 6.1 Directive additions (36 files)

Add `/** @jest-environment node */` as line 1. Mechanical, no logic change.

**RatingSlip** (4 files):
- `policy-snapshot.integration.test.ts`
- `rating-slip-continuity.integration.test.ts`
- `rating-slip.integration.test.ts`
- `rating-slip-move-pooling.integration.test.ts`

**TableContext** (24 files):
- All 18 unit test files listed in §2a without directive
- All 6 integration test files listed in §2b

**Loyalty** (6 files):
- `crud.test.ts`, `mappers.test.ts`, `mid-session-reward.test.ts`
- `promo-outbox-contract.int.test.ts`
- `loyalty-accrual-lifecycle.integration.test.ts`
- `points-accrual-calculation.integration.test.ts`

**MTL** (2 files):
- `mappers.test.ts`, `view-model.test.ts`

### 6.2 Integration gate additions (12 files)

Add standard `RUN_INTEGRATION_TESTS` gate pattern. Prevents unconditional execution without Supabase.

```typescript
const describeIntegration = process.env.RUN_INTEGRATION_TESTS
  ? describe
  : describe.skip;
```

**RatingSlip** (4 files):
- `policy-snapshot.integration.test.ts`
- `rating-slip-continuity.integration.test.ts`
- `rating-slip.integration.test.ts`
- `rating-slip-move-pooling.integration.test.ts`

**Loyalty** (7 files):
- `issuance-idempotency.int.test.ts`
- `issue-comp.int.test.ts`
- `issue-entitlement.int.test.ts`
- `valuation-policy-roundtrip.int.test.ts`
- `promo-outbox-contract.int.test.ts`
- `loyalty-accrual-lifecycle.integration.test.ts`
- `points-accrual-calculation.integration.test.ts`

**TableContext** (1 file):
- `table-context.integration.test.ts`

### 6.3 Route boundary exemplars (3 new files)

Author one exemplar per context following the Casino/Player pattern:
- `services/table-context/__tests__/table-context-route-boundary.test.ts`
- `services/loyalty/__tests__/loyalty-route-boundary.test.ts`
- `services/mtl/__tests__/mtl-route-boundary.test.ts`

### 6.4 Slice scripts (3 additions to package.json)

```json
"test:slice:table-context": "jest --config jest.node.config.js --testPathPatterns='services/table-context/__tests__/.*\\.test\\.ts$'",
"test:slice:loyalty": "jest --config jest.node.config.js --testPathPatterns='services/loyalty/__tests__/.*\\.test\\.ts$'",
"test:slice:mtl": "jest --config jest.node.config.js --testPathPatterns='services/mtl/__tests__/.*\\.test\\.ts$'"
```

### 6.5 Shallow test reclassification (§9.2)

Record in posture doc — no code changes:
- `services/rating-slip/__tests__/http-contract.test.ts` → Smoke
- `services/table-context/__tests__/http-contract.test.ts` → Smoke
- `services/loyalty/__tests__/http-contract.test.ts` → Smoke

---

## 7. Recommended Execution Order

Dependencies within the slice:

```
6.1 Directives (mechanical) ─┐
                              ├─► 6.4 Slice scripts ─► Verification runs
6.2 Integration gates ───────┘

6.3 Route boundary exemplars (independent, can parallel with above)

6.5 Reclassification (documentation, after verification)
```

Suggested order by context (smallest-to-largest, build confidence):

1. **MTL** — 2 directives, 1 route boundary, 1 slice script. ~30 min.
2. **RatingSlip** — 4 directives, 4 gates. Already has route boundary + slice script. ~45 min.
3. **Loyalty** — 6 directives, 7 gates, 1 route boundary, 1 slice script. ~1.5h.
4. **TableContext** — 24 directives, 1 gate, 1 route boundary, 1 slice script. ~2h (bulk but mechanical).

---

## 8. Exit Criteria

All must be true before Slice Three is declared complete:

- [ ] All 36 files have `/** @jest-environment node */` directive
- [ ] All 12 ungated integration tests have `RUN_INTEGRATION_TESTS` gate
- [ ] `npm run test:slice:rating-slip` — 141/141 green
- [ ] `npm run test:slice:table-context` — 492/492 green (71 todo OK)
- [ ] `npm run test:slice:loyalty` — 85/85 green
- [ ] `npm run test:slice:mtl` — 72/72 green
- [ ] Route boundary exemplars pass for TableContext, Loyalty, MTL
- [ ] Shallow `http-contract.test.ts` files reclassified as Smoke in posture doc
- [ ] SLICE-THREE-POSTURE.md written per §5
- [ ] Skip registry: documented if any pre-existing failures surfaced
- [ ] INDEX.md updated to reference Slice Three

---

## 9. Post-Slice-Three Landscape

After completion, 7 of 17 service contexts will be at Trusted-Local:

| Slice | Contexts | Test Volume |
|-------|----------|-------------|
| One | Casino | 355 tests |
| Two | Player, Visit | 159 tests |
| **Three** | **RatingSlip, TableContext, Loyalty, MTL** | **790 tests** |
| **Total Trusted-Local** | **7 contexts** | **1,304 tests** |

Remaining 10 contexts (floor-layout, measurement, player360-dashboard, player-financial, player-import, player-timeline, rating-slip-modal, recognition, security, shift-intelligence) collectively have ~90 unit tests and can be addressed in a Slice Four sweep.

---

## 10. Estimated Effort

| Work Item | Effort |
|-----------|--------|
| Directive additions (36 files) | 1h (mechanical) |
| Integration gate additions (12 files) | 1h |
| Route boundary exemplars (3 files) | 2h |
| Slice scripts (3 additions) | 15 min |
| Verification runs | 30 min |
| Posture doc (SLICE-THREE-POSTURE.md) | 30 min |
| INDEX.md update | 10 min |
| **Total** | **~5.5h** |

---

## 11. References

- `docs/issues/gaps/testing-arch-remediation/CONTEXT-ROLLOUT-TEMPLATE.md` — reusable checklist
- `docs/issues/gaps/testing-arch-remediation/slice-1/SLICE-ONE-POSTURE.md` — Casino exemplar
- `docs/issues/gaps/testing-arch-remediation/slice-2/SLICE-TWO-KICKOFF.md` — Player + Visit kickoff
- `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` v2.0.0 — normative definitions
- `docs/80-adrs/ADR-044-testing-governance-posture.md` — decision record

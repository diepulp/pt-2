# RatingSlip Bounded Context — Testing Governance Rollout Context Report

**Date**: 2026-03-14
**Branch**: `player-exemplar-rollout`
**Governance**: ADR-044, TESTING_GOVERNANCE_STANDARD.md v2.0.0
**Issue**: ISSUE-C4D2AA48
**Prerequisite**: Player exemplar validated (Slice 2)
**Template**: `CONTEXT-ROLLOUT-TEMPLATE.md`

---

## 1. File Inventory

### Pre-Rollout (11 files, 274 tests)

| Filename | Layer (S3) | `@jest-environment node` | `jest.mock()` | `RUN_INTEGRATION_TESTS` | Test Count | Health |
|----------|-----------|--------------------------|---------------|-------------------------|------------|--------|
| `rating-slip.service.test.ts` | Server-Unit (S3.3) | Missing | Yes (Supabase chain) | No | 35 | 3 failures (stale mocks) |
| `mappers.test.ts` | Server-Unit (S3.3) | Missing | No | No | 65 | Pass |
| `queries.test.ts` | Server-Unit (S3.3) | Missing | Yes (Supabase chain) | No | 20 | Pass |
| `rating-slip-continuity.test.ts` | Server-Unit (S3.3) | Missing | No | No | 11 | Pass |
| `http-contract.test.ts` | Smoke (S3.7) | Present | Yes (route modules) | No | 9 | Pass (theatre) |
| `rating-slip-move-pooling.test.ts` | **Misclassified** | Missing | No | No | 4 | 4 failures (needs Supabase) |
| `rating-slip.integration.test.ts` | Integration | N/A | No | No | 27 | 27 failures (company_id) |
| `rating-slip-continuity.integration.test.ts` | Integration | N/A | No | No | 15 | 15 failures (company_id) |
| `policy-snapshot.integration.test.ts` | Integration | N/A | No | No | 8 | 8 failures (company_id) |

### Client-Side Files (NOT in scope — stay in jsdom)

| Filename | Location | Test Count |
|----------|----------|------------|
| `use-rating-slip-modal.test.ts` | `hooks/ui/__tests__/` | N/A |
| `rating-slip-modal-store.test.ts` | `store/__tests__/` | N/A |
| `audit-trace-section.test.tsx` | `components/modals/rating-slip/__tests__/` | N/A |

---

## 2. Service Source Summary

**RatingSlip Service Layer** (2,947 LoC across 9 files):

| Module | Key Exports | Notes |
|--------|-------------|-------|
| `dtos.ts` (387L) | RatingSlipDTO, RatingSlipWithDurationDTO, RatingSlipWithPausesDTO, RatingSlipPauseDTO, CreateRatingSlipInput, CloseRatingSlipInput, MoveRatingSlipInput, ActivePlayerForDashboardDTO, ClosedSlipForGamingDayDTO | |
| `index.ts` (345L) | createRatingSlipService(), RatingSlipServiceInterface | Factory pattern (start, pause, resume, close, getById, listForTable, etc.) |
| `crud.ts` (large) | start, pause, resume, close, getById, listForTable, listForVisit, getDuration, move, getVisitLiveView, listClosedForGamingDay, listActivePlayersCasinoWide | All RPC-backed state machine + CRUD |
| `http.ts` | startRatingSlip, listRatingSlips, getRatingSlip, pauseRatingSlip, resumeRatingSlip, closeRatingSlip, getRatingSlipDuration, updateAverageBet | HTTP client functions |
| `schemas.ts` (174L) | createRatingSlipSchema, closeRatingSlipSchema, updateAverageBetSchema, ratingSlipListQuerySchema, ratingSlipRouteParamsSchema, ratingSlipStatusSchema, closedTodayQuerySchema, activePlayersCasinoWideQuerySchema | |
| `mappers.ts` (487L) | toRatingSlipDTO, toRatingSlipWithPausesDTO, toRatingSlipWithDurationDTO, toRatingSlipWithPlayerDTO, toActivePlayerForDashboardDTO, toClosedSlipForGamingDayDTO, toVisitLiveViewDTO | |
| `selects.ts` (151L) | RATING_SLIP_SELECT, RATING_SLIP_WITH_PAUSES_SELECT, RATING_SLIP_PAUSE_SELECT, RATING_SLIP_WITH_PLAYER_SELECT, CLOSED_SLIP_WITH_PLAYER_SELECT | |
| `keys.ts` | ratingSlipKeys | React Query key factory |
| `queries.ts` | hasOpenSlipsForTable, countOpenSlipsForTable | Published cross-context queries |

**Dependencies**: `@/lib/errors`, `@/lib/http`, `@/lib/validation`, `@/lib/json/narrows`, `@/services/visit/dtos` (VisitLiveViewDTO), `@/types/database.types`. Visit DTO import is the only inter-service dependency.

---

## 3. Route Handler Coverage

| Route | Method | Test File | Coverage |
|-------|--------|-----------|----------|
| `/api/v1/rating-slips` | GET, POST | `http-contract.test.ts` | Smoke only |
| `/api/v1/rating-slips/[id]` | GET | `http-contract.test.ts` + `rating-slip-route-boundary.test.ts` | **Boundary (new)** |
| `/api/v1/rating-slips/[id]/pause` | POST | `http-contract.test.ts` | Smoke only |
| `/api/v1/rating-slips/[id]/resume` | POST | `http-contract.test.ts` | Smoke only |
| `/api/v1/rating-slips/[id]/close` | POST | `http-contract.test.ts` | Smoke only |
| `/api/v1/rating-slips/[id]/duration` | GET | `http-contract.test.ts` | Smoke only |
| `/api/v1/rating-slips/[id]/average-bet` | PATCH | `http-contract.test.ts` | Smoke only |
| `/api/v1/rating-slips/[id]/move` | POST | -- | **NO TEST** |
| `/api/v1/rating-slips/[id]/modal-data` | GET | -- | **NO TEST** |
| `/api/v1/rating-slips/active-players` | GET | -- | **NO TEST** |
| `/api/v1/rating-slips/closed-today` | GET | -- | **NO TEST** |

**Summary**: 8/11 routes have tests (7 smoke, 1 boundary). 4 routes without tests. Doesn't block Trusted-Local but documented as gap.

---

## 4. Known Failures & Root Causes

| Test | File | Failure | Root Cause | Fix Applied |
|------|------|---------|-----------|-------------|
| 3 start() error tests | `rating-slip.service.test.ts` | `TypeError: Cannot destructure 'data'` | PERF-005 WS6 removed pre-validation; mocks targeted stale visit-lookup chain | Fixed: mocks now target RPC error path |
| 4 pooling tests | `rating-slip-move-pooling.test.ts` | `AuthApiError: invalid JWT` | Misclassified integration test (.test.ts suffix, needs running Supabase) | **Not fixed** — documented as misclassification |
| 50 integration tests | 3 `.integration.test.ts` files | `company_id NOT NULL constraint` | Integration tests require real Supabase with company_id migration | Expected — integration config, not node scope |

---

## 5. SRM Ownership

**From SERVICE_RESPONSIBILITY_MATRIX.md:**

- **Owns**: `rating_slip`, `rating_slip_pause`, `pit_cash_observation`
- **Boundary**: "What is the state of this rating slip, how long has the player been playing, and what are the session continuity chain details?"
- **Key ADRs**: ADR-014 (Ghost visits), ADR-015 (Connection pooling), ADR-024 (Authoritative context), PRD-002 (Rating Slip Service), PRD-016 (Session Continuity)
- **Published queries**: `hasOpenSlipsForTable`, `countOpenSlipsForTable` (consumed by TableContextService)

---

## 6. Rollout Checklist

### Completed

- [x] Inventory complete (11 files classified, 2 client-side excluded)
- [x] Known failures catalogued with root causes
- [x] SRM ownership verified
- [x] Added `/** @jest-environment node */` to 4 files (service, mappers, queries, continuity)
- [x] Fixed 3 failures (stale pre-validation mocks -> RPC error mocks)
- [x] Reclassified `http-contract.test.ts` as Smoke (S3.7)
- [x] Created integration canary: `rating-slip-rpc-contract.int.test.ts` (53 tests)
- [x] Created route-handler exemplar: `rating-slip-route-boundary.test.ts` (3 tests)
- [x] Written posture doc

### Not Done (Out of Scope)

- [ ] Fix `rating-slip-move-pooling.test.ts` misclassification (rename to `.integration.test.ts`)
- [ ] Add `test:slice:rating-slip` script to package.json
- [ ] Fix 50 integration test failures (company_id migration)

---

## 7. Cross-Context Dependencies

**Inbound** (who depends on RatingSlip):
- TableContextService: calls `hasOpenSlipsForTable` to gate table deactivation
- RatingSlipModalService: aggregates rating slip + visit + player data
- LoyaltyService: reads `rating_slip` for accrual calculations
- MTLService: reads `rating_slip` for MTL entries

**Outbound** (who RatingSlip depends on):
- VisitService: `VisitLiveViewDTO` imported for live view mapper
- `@/types/database.types`: all type derivation

**DTO consumption**: RatingSlipDTO, RatingSlipWithPausesDTO consumed by RatingSlipModalService. ActivePlayerForDashboardDTO consumed by dashboard hooks. ClosedSlipForGamingDayDTO consumed by Start From Previous panel.

---

## 8. Risk Areas

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Misclassified integration test** (move-pooling) | Medium | Needs rename to `.integration.test.ts`. Documented in posture. |
| **4 untested routes** (move, modal-data, active-players, closed-today) | Medium | Doesn't block Trusted-Local. Documented as gap. |
| **PERF-005 WS6 stale tests** | Resolved | 3 tests fixed to use RPC error mocking |
| **50 failing integration tests** | Low | Known DB migration issue (company_id). Integration config, not node scope. |

---

## 9. Estimated Effort (Actual)

| Task | Time |
|------|------|
| Add 4 `@jest-environment` directives | 5 min |
| Fix 3 stale test mocks | 15 min |
| Reclassify http-contract as Smoke | 5 min |
| Create integration canary (53 tests) | 30 min |
| Create route-handler boundary test (3 tests) | 20 min |
| Write context + posture docs | 30 min |
| **Total** | **~2 hrs** |

---

## 10. Reference Files

| Artifact | Path | Use Case |
|----------|------|----------|
| Integration canary (new) | `services/rating-slip/__tests__/rating-slip-rpc-contract.int.test.ts` | Canary exemplar (53 tests) |
| Route boundary (new) | `services/rating-slip/__tests__/rating-slip-route-boundary.test.ts` | Boundary exemplar (3 tests) |
| Player canary template | `services/player/__tests__/player-rpc-contract.int.test.ts` | Template used |
| Player boundary template | `services/player/__tests__/player-route-boundary.test.ts` | Template used |
| Node Jest config | `jest.node.config.js` | Server-side unit tests |
| Integration Jest config | `jest.integration.config.js` | For `.int.test.ts` files |
| Player posture (predecessor) | `docs/issues/gaps/testing-arch-remediation/player-service-rollout/PLAYER-EXEMPLAR-POSTURE.md` | Template for posture doc |

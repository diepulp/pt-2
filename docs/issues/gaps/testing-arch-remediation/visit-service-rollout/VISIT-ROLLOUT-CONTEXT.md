# Visit Bounded Context — Testing Governance Rollout Context Report

**Date**: 2026-03-14
**Branch**: `testing-gov-remediation`
**Governance**: ADR-044, TESTING_GOVERNANCE_STANDARD.md v2.0.0
**Issue**: ISSUE-C4D2AA48
**Prerequisite**: Casino exemplar validated, Player exemplar validated
**Slice**: 3 (Visit)

---

## 1. File Inventory

| Filename | Layer (S3) | `@jest-environment node` | `jest.mock()` | `RUN_INTEGRATION_TESTS` | Test Count | Health |
|----------|-----------|--------------------------|---------------|-------------------------|------------|--------|
| `visit.service.test.ts` | Server-Unit (S3.3) | Config-level | Yes (fetch) | No | 18 | Pass |
| `visit-continuation.test.ts` | Server-Unit (S3.3) | Config-level | Yes (supabase) | No | 18 | 2 failures (pre-existing) |
| `http-contract.test.ts` | Smoke (S3.7) | Present | Yes (route modules) | No | 6 | Pass (theatre) |
| `visit-rpc-contract.int.test.ts` | Integration (S3.5) | Present | No | No | 47 | Pass (NEW) |
| `visit-route-boundary.test.ts` | Route-Handler (S3.4) | Present | Yes (middleware) | No | 3 | Pass (NEW) |
| `gaming-day-boundary.int.test.ts` | Integration (S3.5) | Config-level | No | Yes (needs Supabase) | 12 | Fails (no DB) |
| `visit-continuation.integration.test.ts` | Integration (S3.5) | Config-level | No | Yes (needs Supabase) | 23 | Fails (no DB) |

**Route-handler tests (app/api/v1/visits/):**

| Filename | Location | Layer | Test Count | Health |
|----------|----------|-------|------------|--------|
| `__tests__/route.test.ts` | visits/ | Shallow | 8 | Pass (mock service) |
| `[visitId]/__tests__/route.test.ts` | visits/[visitId]/ | Shallow | 3 | Pass (mock service) |
| `active/__tests__/route.test.ts` | visits/active/ | Shallow | 4 | Pass (mock service) |
| `[visitId]/close/__tests__/route.test.ts` | visits/[visitId]/close/ | Shallow | 5 | Pass (mock service) |

**Totals**: 9 service test files + 4 route test files = 13 total files, ~147 tests.

---

## 2. Service Source Summary

**Visit Service Layer** (1,946 LoC across 8 files):

| Module | Key Exports | Notes |
|--------|-------------|-------|
| `dtos.ts` (400L) | VisitDTO, VisitKind, CreateVisitDTO, CloseVisitDTO, ActiveVisitDTO, StartVisitResultDTO, VisitWithPlayerDTO, VisitLiveViewDTO, RecentSessionDTO, RecentSessionsDTO, LastSessionContextDTO, StartFromPreviousRequest, StartFromPreviousResponse | Complex DTO surface |
| `index.ts` (224L) | createVisitService(), VisitServiceInterface | Factory pattern (list, getById, getActiveForPlayer, startVisit, closeVisit, createRewardVisit, createGamingVisit, createGhostGamingVisit, convertRewardToGaming, getPlayerRecentSessions, getPlayerLastSessionContext, startFromPrevious) |
| `crud.ts` (717L) | getVisitById, getActiveVisitForPlayer, listVisits, startVisit, closeVisit, createRewardVisit, createGamingVisit, createGhostGamingVisit, convertRewardToGaming, getPlayerRecentSessions, getPlayerLastSessionContext, startFromPrevious | |
| `http.ts` (183L) | getVisits, getVisit, getActiveVisit, startVisit, closeVisit | HTTP fetchers |
| `schemas.ts` (278L) | visitKindSchema, startVisitSchema, closeVisitSchema, createRewardVisitSchema, createGamingVisitSchema, createGhostGamingVisitSchema, convertRewardToGamingSchema, visitListQuerySchema, activeVisitQuerySchema, visitRouteParamsSchema, recentSessionsQuerySchema, startFromPreviousSchema, RPC response schemas | |
| `mappers.ts` (152L) | toVisitDTO, toVisitDTOOrNull, toVisitDTOList, toVisitWithPlayerDTO, toVisitWithPlayerDTOList, toActiveVisitDTO | |
| `selects.ts` (28L) | VISIT_SELECT, VISIT_SELECT_LIST, VISIT_WITH_PLAYER_SELECT, ACTIVE_VISIT_SELECT | |
| `keys.ts` (24L) | visitKeys (list, detail, active, liveView, recentSessions) | |

**Dependencies**: `@/lib/errors`, `@/lib/http`, `@/lib/validation`, `@/types/database.types`. No inter-service imports (clean boundary).

---

## 3. Route Handler Coverage

| Route | Method | Test File | Coverage |
|-------|--------|-----------|----------|
| `/api/v1/visits` | GET, POST | `visits/__tests__/route.test.ts` | Shallow (mock service) |
| `/api/v1/visits/active` | GET | `visits/active/__tests__/route.test.ts` | Shallow (mock service) |
| `/api/v1/visits/[visitId]` | GET | `visits/[visitId]/__tests__/route.test.ts` + `visit-route-boundary.test.ts` | Shallow + Boundary exemplar |
| `/api/v1/visits/[visitId]/close` | PATCH | `visits/[visitId]/close/__tests__/route.test.ts` | Shallow (mock service) |
| `/api/v1/visits/[visitId]/live-view` | GET | -- | **NO TEST** |
| `/api/v1/visits/[visitId]/financial-summary` | GET | -- | **NO TEST** |
| `/api/v1/visits/start-from-previous` | POST | -- | **NO TEST** |

**Summary**: 4/7 routes have tests (all shallow/mock). 3 routes have no tests. Boundary exemplar created for `GET /visits/[visitId]`.

---

## 4. Known Failures & Root Causes

| Test | File | Failure | Root Cause | Fix |
|------|------|---------|-----------|-----|
| `returns sessions with correct aggregate fields` | `visit-continuation.test.ts` | `net` expected -50 got -0.5 | centsToDollars conversion in crud.ts divides by 100; mock data has cents-scale values but assertion expects dollar-scale | Pre-existing, not addressed in rollout |
| `creates visit with correct visit_group_id from source` | `visit-continuation.test.ts` | Insert called with unexpected `gaming_day` field | crud.ts `startFromPrevious` inserts `gaming_day: '1970-01-01'` placeholder but test expectation predates this field | Pre-existing, not addressed in rollout |
| All 12 tests | `gaming-day-boundary.int.test.ts` | `Cannot read properties of null (reading 'id')` | Requires running Supabase instance, casino insert returns null without DB | Expected (integration test, needs DB) |
| All 23 tests | `visit-continuation.integration.test.ts` | Same null reading error | Requires running Supabase instance | Expected (integration test, needs DB) |

---

## 5. SRM Ownership

**From SERVICE_RESPONSIBILITY_MATRIX.md:**

- **Owns**: `visit`
- **Boundary**: "What are the player's gaming sessions — when, where, and under what archetype?"
- **Key ADRs**: ADR-026 (Gaming Day Boundary), PRD-003 (Visit Management), PRD-017 (Visit Continuation), EXEC-VSE-001 (Visit Service Evolution)
- **RPCs owned**: `rpc_start_or_resume_visit`, `rpc_get_visit_live_view`, `rpc_get_visit_last_segment`, `rpc_get_visit_loyalty_summary`, `rpc_get_player_recent_sessions`, `rpc_get_player_last_session_context`

---

## 6. Rollout Checklist

### Completed

- [x] Inventory complete (9 service test files + 4 route test files classified)
- [x] Known failures catalogued with root causes
- [x] SRM ownership verified
- [x] Reclassified `http-contract.test.ts` as Smoke (S3.7)
- [x] Created integration canary (`visit-rpc-contract.int.test.ts`, 47 tests)
- [x] Created route-handler boundary exemplar (`visit-route-boundary.test.ts`, 3 tests)
- [x] Posture document written

### Not Addressed (Pre-existing)

- [ ] Fix 2 pre-existing failures in `visit-continuation.test.ts` (centsToDollars mock + gaming_day field)
- [ ] Add `test:slice:visit` script to package.json (separate task)

---

## 7. Cross-Context Dependencies

**Inbound** (who depends on Visit):
- RatingSlipService: reads `visit` for slip linkage (visit_id FK)
- LoyaltyService: reads `visit` for loyalty ledger entries
- MtlService: reads `visit` for MTL/CTR tracking
- FinancialService: reads `visit` for financial transactions

**Outbound** (who Visit depends on):
- PlayerService: reads `player` for visit creation validation
- CasinoService: reads `casino_settings` for gaming day computation

**DTO consumption**: VisitDTO imported by RatingSlip, Loyalty, Mtl, Financial. No circular dependencies.

---

## 8. Risk Areas

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **2 pre-existing test failures** | Medium | Documented in Skip Registry. Fix is straightforward (update mock data + assertion). |
| **Integration tests need DB** | Low | Expected behavior. Tests properly fail without Supabase instance. |
| **3 untested routes** (live-view, financial-summary, start-from-previous) | Medium | Does not block Trusted-Local. Documented as gap in posture. |
| **Large API surface** (12 service methods) | Low | All schemas tested in canary. Mappers fully tested. |

---

## 9. Reference Files

| Artifact | Path | Use Case |
|----------|------|----------|
| Integration canary | `services/visit/__tests__/visit-rpc-contract.int.test.ts` | Visit integration canary (47 tests) |
| Route-handler exemplar | `services/visit/__tests__/visit-route-boundary.test.ts` | Visit boundary test (3 tests) |
| Player canary template | `services/player/__tests__/player-rpc-contract.int.test.ts` | Template used |
| Player boundary template | `services/player/__tests__/player-route-boundary.test.ts` | Template used |
| Node Jest config | `jest.node.config.js` | Used for unit tests |
| Integration Jest config | `jest.integration.config.js` | Used for canary tests |
| Player posture | `docs/issues/gaps/testing-arch-remediation/player-service-rollout/PLAYER-EXEMPLAR-POSTURE.md` | Template for posture doc |

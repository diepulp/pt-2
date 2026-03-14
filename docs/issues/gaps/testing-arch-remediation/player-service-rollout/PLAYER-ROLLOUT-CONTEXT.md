# Player Bounded Context — Testing Governance Rollout Context Report

**Date**: 2026-03-14
**Branch**: `testing-gov-remediation`
**Governance**: ADR-044, TESTING_GOVERNANCE_STANDARD.md v2.0.0
**Issue**: ISSUE-C4D2AA48
**Prerequisite**: Casino exemplar validated (commit `5ffc851`)
**Template**: `CONTEXT-ROLLOUT-TEMPLATE.md`

---

## 1. File Inventory

| Filename | Layer (S3) | `@jest-environment node` | `jest.mock()` | `RUN_INTEGRATION_TESTS` | Test Count | Health |
|----------|-----------|--------------------------|---------------|-------------------------|------------|--------|
| `player.service.test.ts` | Server-Unit (HTTP) | Missing | Yes (fetch, crypto) | No | 61 | 5 failures |
| `http-contract.test.ts` | Smoke (S3.7) | Present | Yes (route modules) | No | 9 | Pass (theatre) |
| `schemas.test.ts` | Server-Unit (S3.3) | Missing | No | No | 63 | Pass |
| `exclusion-http-contract.test.ts` | Smoke (S3.7) | Present | Yes (route modules) | No | 6 | Pass (theatre) |
| `exclusion-mappers.test.ts` | Server-Unit (S3.3) | Missing | No | No | 12 | Pass |
| `exclusion-schemas.test.ts` | Server-Unit (S3.3) | Missing | No | No | 24 | Pass |

**Totals**: 6 files, 175 tests. 170 passing, 5 failing.

---

## 2. Service Source Summary

**Player Service Layer** (2,037 LoC across 17 files):

| Module | Key Exports | Notes |
|--------|-------------|-------|
| `dtos.ts` (204L) | PlayerDTO, CreatePlayerDTO, UpdatePlayerDTO, PlayerEnrollmentDTO, PlayerSearchResultDTO, PlayerIdentityDTO, PlayerIdentityInput | |
| `index.ts` (108L) | createPlayerService(), PlayerServiceInterface | Factory pattern (search, list, getById, create, update, getEnrollment) |
| `crud.ts` (317L) | getPlayerById, listPlayers, searchPlayers, createPlayer, updatePlayer, getPlayerEnrollmentByPlayerId + exclusion CRUD | |
| `http.ts` (183L) | searchPlayers, getPlayers, createPlayer, updatePlayer, getPlayer, getPlayerEnrollment, upsertPlayerIdentity, getPlayerIdentity + exclusion HTTP | `enrollPlayer` NO LONGER EXPORTED (moved to CasinoService per ADR-022 D5) |
| `schemas.ts` (131L) | createPlayerSchema, updatePlayerSchema, playerListQuerySchema, playerIdParamSchema, enrollPlayerSchema + exclusion schemas | |
| `mappers.ts` (158L) | toPlayerDTO, toPlayerDTOOrNull, toPlayerDTOList, toPlayerSearchResultDTOList, toEnrollmentDTO + exclusion mappers | |
| `selects.ts` (46L) | PLAYER_SELECT, PLAYER_SELECT_LIST, ENROLLMENT_SELECT, PLAYER_SEARCH_SELECT | |
| `keys.ts` (24L) | playerKeys (list, detail, search, loyalty snapshot) | |
| `identity.ts` (276L) | computeDocumentHash, extractLast4, getPlayerIdentity, upsertPlayerIdentity, verifyDocumentHash | PII helpers |
| Exclusion files (5) | exclusion-dtos, exclusion-crud, exclusion-http, exclusion-mappers, exclusion-schemas, exclusion-keys, exclusion-selects | ADR-042 |

**Dependencies**: `@/lib/errors`, `@/lib/http`, `@/lib/validation`, `@/types/database.types`. No inter-service imports (clean boundary). Enrollment owned by CasinoService (ADR-022 D5).

---

## 3. Route Handler Coverage

| Route | Method | Test File | Coverage |
|-------|--------|-----------|----------|
| `/api/v1/players` | GET, POST | `route.test.ts` | Smoke only |
| `/api/v1/players/[playerId]` | GET, PATCH | `route.test.ts` | Smoke only |
| `/api/v1/players/[playerId]/enroll` | POST | `enroll/route.test.ts` | Smoke only |
| `/api/v1/players/[playerId]/enrollment` | GET, POST, DELETE | `enrollment/route.test.ts` | Smoke only |
| `/api/v1/players/[playerId]/loyalty` | GET | `loyalty/route.test.ts` | Smoke only |
| `/api/v1/players/[playerId]/identity` | GET, POST | — | **NO TEST** |
| `/api/v1/players/[playerId]/exclusions` | GET, POST | — | **NO TEST** |
| `/api/v1/players/[playerId]/exclusions/active` | GET | — | **NO TEST** |
| `/api/v1/players/[playerId]/exclusions/[exclusionId]/lift` | POST | — | **NO TEST** |

**Summary**: 7/11 routes have tests, all shallow/smoke (function existence only). 4 routes (identity + 3 exclusion) have no tests. Doesn't block Trusted-Local but documented as gap.

---

## 4. Known Failures & Root Causes

| Test | File | Failure | Root Cause | Fix |
|------|------|---------|-----------|-----|
| enrollPlayer (2 tests) | `player.service.test.ts` | `TypeError: enrollPlayer is not a function` | Function moved to CasinoService per ADR-022 D5. Import stale. | Delete tests (or migrate to casino suite) |
| idempotency-key (3 tests) | `player.service.test.ts` | Header value undefined | Mock `globalThis.crypto.randomUUID()` not visible to module scope (closure issue) | Pre-populate mock before importing http.ts, or inject crypto |
| Missing directives (4 files) | Multiple | None yet (pass under jsdom) | `@jest-environment node` missing — masks potential node-specific failures | Add directive to 4 files |
| Shallow tests (15 tests) | 2 files | Pass but zero behaviour | `typeof handler === 'function'` only | Reclassify as Smoke (S3.7) per S9.2 |

---

## 5. SRM Ownership

**From SERVICE_RESPONSIBILITY_MATRIX.md v4.19.0:**

- **Owns**: `player`, `player_exclusion`
- **Planned (Post-MVP)**: `player_identity` (deferred per ADR-022 v7.1)
- **Boundary**: "Who is this player, where are they enrolled, what is their verified identity, and are they excluded or restricted?"
- **Key ADRs**: ADR-022 (Player Identity Enrollment), ADR-024 (Authoritative context), ADR-042 (Exclusion Architecture)
- **Ownership note**: `player_casino` (enrollment) owned by **CasinoService** (ADR-022 D5), not PlayerService

---

## 6. Rollout Checklist Pre-Fill

### Already Met

- [x] Inventory complete (6 files classified)
- [x] Known failures catalogued with root causes
- [x] SRM ownership verified
- [x] Casino exemplar available as template

### Needs Work

- [ ] Add `/** @jest-environment node */` to 4 files
- [ ] Fix 5 failures (delete 2 enrollPlayer tests, fix 3 idempotency mocks)
- [ ] Reclassify 2 shallow test files as Smoke (S3.7)
- [ ] Create integration canary (model on `setup-wizard-rpc.int.test.ts`)
- [ ] Create route-handler exemplar for `GET /players/[playerId]` (model on `settings-route-boundary.test.ts`)
- [ ] Add `test:slice:player` script to package.json
- [ ] Write posture doc (template-driven from casino exemplar)

### Integration Canary Candidates

| RPC | Suitability | Notes |
|-----|------------|-------|
| Player CRUD via PostgREST | Good | Tests standard query chain, error mapping |
| `rpc_get_player_exclusion_status` | Good (ADR-042) | New surface, SECURITY DEFINER, type-safe |
| Identity helpers (hash/mask) | Good | Pure functions, no infra needed |

### Route-Handler Exemplar Target

**`GET /api/v1/players/[playerId]`** — simplest single-resource route. Must include:
1. Happy path (200 + response body shape)
2. Scoping assertion (casino_id from RLS context passes to query)
3. Error path (404 when player not found)

Mock pattern: follow `services/casino/__tests__/settings-route-boundary.test.ts`

---

## 7. Cross-Context Dependencies

**Inbound** (who depends on Player):
- CasinoService: reads `player` for enrollment, calls `rpc_get_player_exclusion_status`
- VisitService: reads `player_exclusion` for visit creation enforcement
- RatingSlipService: reads `player` for slip linkage
- LoyaltyService: reads `player` for loyalty snapshots

**Outbound** (who Player depends on):
- CasinoService: for enrollment (now owned by Casino per ADR-022 D5)

**DTO consumption**: PlayerDTO imported by Visit, RatingSlip, Loyalty. PlayerExclusionDTO imported by Visit, Casino. No circular dependencies.

---

## 8. Risk Areas

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Ownership split** (enrollPlayer moved to Casino) | High | Test failures already surfaced. Delete stale tests during rollout. Document boundary. |
| **Exclusion module** (ADR-042, new) | Medium | No prior exemplar. Integration canary MUST cover exclusion RPC type contract. |
| **Identity table** (post-MVP) | Low | Helpers exist; CRUD via service layer. Canary should scope to core player ops for now. |
| **4 untested routes** (identity + exclusion) | Medium | Doesn't block Trusted-Local. Document as gap in posture. |
| **Mock complexity** (Supabase query chain) | Low | Casino exemplar provides working pattern. Copy wholesale. |

---

## 9. Estimated Effort

| Task | Effort | Complexity |
|------|--------|-----------|
| Fix 5 test failures | 1-2 hrs | Low |
| Add 4 `@jest-environment` directives | 15 min | Trivial |
| Reclassify 15 shallow tests | 30 min | Trivial |
| Create integration canary | 2-3 hrs | Medium |
| Create route-handler exemplar | 2-3 hrs | Medium |
| Add slice script | 10 min | Trivial |
| Write posture doc | 1 hr | Low |
| **Total** | **6-8 hrs** | **Low-Medium** |

---

## 10. Reference Files

| Artifact | Path | Use Case |
|----------|------|----------|
| Integration canary template | `services/casino/__tests__/setup-wizard-rpc.int.test.ts` | Template for player integration canary |
| Route-handler exemplar template | `services/casino/__tests__/settings-route-boundary.test.ts` | Template for player route-handler test |
| Node Jest config | `jest.node.config.js` | Already in tree; use as-is |
| Integration Jest config | `jest.integration.config.js` | For `.int.test.ts` files |
| Casino posture (validated) | `docs/issues/gaps/testing-arch-remediation/slice-1/CASINO-EXEMPLAR-POSTURE.md` | Template for player posture doc |
| Rollout template | `docs/issues/gaps/testing-arch-remediation/CONTEXT-ROLLOUT-TEMPLATE.md` | Step-by-step checklist |
| Validation report | `docs/issues/gaps/testing-arch-remediation/slice-1/CASINO-EXEMPLAR-VALIDATION-REPORT.md` | Error matrix context |

---
id: PRD-011
title: Route Handler Test Coverage Initiative
owner: Engineering
status: Draft
affects: [QA-005, QA-001, ADR-008, ISSUE-A6735438, ISSUE-607F9CCB]
created: 2025-12-20
last_review: 2025-12-20
phase: Phase 0 (Quality Infrastructure)
http_boundary: true
---

# PRD-011 — Route Handler Test Coverage Initiative

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Phase:** Phase 0 (Quality Infrastructure)

**Summary:** Systematically close the route handler test coverage gap across all bounded contexts. Currently, 83.6% of route handlers (46 of 55) lack tests—only RatingSlipService has coverage. This gap allows silent HTTP boundary regressions where `http.ts` calls non-existent routes, as occurred in ISSUE-607F9CCB. This initiative brings all 9 bounded contexts to 100% route handler test coverage following the QA-005 patterns.

---

## 2. Problem & Goals

### Problem Statement

The service layer has strong unit test coverage, but the HTTP boundary layer (route handlers) has critical gaps:

| Metric | Current | Target |
|--------|---------|--------|
| Route handlers tested | 9 of 55 (16.4%) | 55 of 55 (100%) |
| HTTP contract tests | 1 of 9 services | 9 of 9 services |
| Bounded contexts covered | 1 of 9 | 9 of 9 |

**Root cause:** Route handlers were assumed to be "thin wrappers" not needing tests. ISSUE-607F9CCB proved this false—a missing `PATCH` export caused production 404s that service-layer tests couldn't detect.

### Goals

1. **Prevent route export regressions** — Every route export is verified by test
2. **Validate http.ts ↔ route.ts parity** — Contract tests catch client/server mismatches before production
3. **Enforce ServiceHttpResult envelope** — All routes return consistent response shapes
4. **Verify Idempotency-Key enforcement** — Mutation endpoints reject requests without the header
5. **Establish repeatable pattern** — Each bounded context follows identical test structure

### Non-Goals

- Full integration tests (covered by E2E)
- Service layer business logic testing (covered by unit tests)
- Performance benchmarking of routes
- UI component testing

---

## 3. Users & Use Cases

### Primary Users

| User | Role |
|------|------|
| **Engineers** | Write and maintain route handlers |
| **QA** | Validate HTTP boundary before release |
| **CI/CD** | Automated regression detection |

### Jobs to Be Done

**Engineers:**
- Verify new route exports exist before PR merge
- Catch typos in HTTP method exports (GET vs POST)
- Validate request/response shape matches contract

**QA:**
- Run route handler tests as pre-release gate
- Identify coverage gaps in new features

**CI/CD:**
- Block merges with missing route exports
- Detect http.ts → route.ts contract drift

---

## 4. Scope & Feature List

### In Scope

**Phase 1 — Critical Path (16 routes)**

| Service | Routes | Priority |
|---------|--------|----------|
| PlayerService | 5 | P0 |
| VisitService | 5 | P0 |
| TableService | 6 | P0 |

**Phase 2 — Supporting Services (20 routes)**

| Service | Routes | Priority |
|---------|--------|----------|
| CasinoService | 8 | P1 |
| LoyaltyService | 8 | P1 |
| TableContextService | 4 | P1 |

**Phase 3 — Auxiliary Services (10 routes)**

| Service | Routes | Priority |
|---------|--------|----------|
| FinancialService | 4 | P2 |
| MTLService | 3 | P2 |
| FloorLayoutService | 3 | P2 |

### Deliverables per Bounded Context

1. **Route handler tests** — `app/api/v1/<context>/**/__tests__/route.test.ts`
2. **HTTP contract test** — `services/<context>/__tests__/http-contract.test.ts`

### Out of Scope

- New route implementations
- Schema changes
- RLS policy updates
- E2E test additions

---

## 5. Requirements

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-01 | Every route.ts file has a corresponding `__tests__/route.test.ts` |
| FR-02 | Each route test verifies export existence: `expect(typeof GET).toBe('function')` |
| FR-03 | Each route test verifies ServiceHttpResult envelope shape |
| FR-04 | Mutation routes test Idempotency-Key header requirement |
| FR-05 | Each service with http.ts has `__tests__/http-contract.test.ts` |
| FR-06 | Contract tests verify every http.ts function maps to a route export |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Route tests execute in < 5 seconds per file |
| NFR-02 | Tests run in Node.js environment (`@jest-environment node`) |
| NFR-03 | Tests use `lib/testing/route-test-helpers.ts` utilities |
| NFR-04 | Tests mock service layer, not database |

---

## 6. UX / Flow Overview

### Test Execution Flow

1. Developer creates or modifies route handler
2. Developer runs `npm test -- app/api/v1/<context>` locally
3. Tests verify route export exists and response shape matches
4. PR triggers CI which runs full route handler test suite
5. Merge blocked if any route test fails

### Contract Test Flow

1. Developer adds function to `http.ts`
2. Contract test fails (function exists, route doesn't)
3. Developer creates route handler
4. Contract test passes
5. No drift possible between client and server

---

## 7. Dependencies & Risks

### Dependencies

| Dependency | Status | Owner |
|------------|--------|-------|
| `lib/testing/route-test-helpers.ts` | Complete | QA |
| QA-005 pattern documentation | Complete | QA |
| RatingSlipService reference implementation | Complete | Engineering |
| Jest configuration for route tests | Complete | DevOps |

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large PR size per bounded context | Review fatigue | Split into one PR per service |
| Mock complexity for services with many dependencies | Slow tests | Use minimal mocks, mock at service boundary |
| Discovering missing routes during testing | Scope creep | Log as separate issues, don't fix in this PRD |

### Open Questions

- [ ] Should contract tests be in `services/` or `app/api/`? (Recommendation: `services/` per reference impl)
- [ ] Include deprecated routes in coverage? (Recommendation: Yes, mark as `@deprecated` in test)

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

### Functionality

- [ ] All 55 route handlers have corresponding test files
- [ ] All 9 bounded contexts have HTTP contract tests
- [ ] Every route export is verified by at least one test

### Test Coverage

- [ ] Route handler coverage: 55/55 (100%)
- [ ] HTTP contract coverage: 9/9 services (100%)
- [ ] All tests pass: `npm test -- app/api/v1`

### CI Integration

- [ ] GitHub Actions runs route handler tests on PR
- [ ] GitHub Actions runs contract tests on PR
- [ ] Merge blocked on test failure

### Documentation

- [ ] QA-005 updated with coverage matrix for all services
- [ ] Each bounded context section added to QA-005

### Regression Prevention

- [ ] ISSUE-607F9CCB scenario cannot recur (verified by contract tests)
- [ ] No route can be added to http.ts without corresponding route.ts export

---

## 9. Related Documents

| Category | Document | Relevance |
|----------|----------|-----------|
| **QA** | `docs/40-quality/QA-005-route-handler-testing.md` | Pattern reference |
| **QA** | `docs/40-quality/QA-001-service-testing-strategy.md` | Test pyramid context |
| **ARCH** | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded context definitions |
| **ADR** | `docs/80-adrs/ADR-008-service-layer-architecture.md` | Service layer patterns |
| **Issue** | ISSUE-607F9CCB | Original bug that exposed gap |
| **Issue** | ISSUE-A6735438 | Systemic coverage gap tracking |

---

## Appendix A: Route Inventory

### Phase 1 — Critical Path

#### PlayerService (5 routes)

| Route | Method | http.ts Function |
|-------|--------|------------------|
| `/api/v1/players` | GET, POST | `searchPlayers`, `createPlayer` |
| `/api/v1/players/[playerId]` | GET, PATCH | `getPlayer`, `updatePlayer` |
| `/api/v1/players/[playerId]/enroll` | POST | `enrollPlayer` |
| `/api/v1/players/[playerId]/enrollment` | GET | `getEnrollment` |
| `/api/v1/players/[playerId]/loyalty` | GET | `getPlayerLoyalty` |

#### VisitService (5 routes)

| Route | Method | http.ts Function |
|-------|--------|------------------|
| `/api/v1/visits` | GET, POST | `listVisits`, `createVisit` |
| `/api/v1/visits/active` | GET | `getActiveVisit` |
| `/api/v1/visits/[visitId]` | GET | `getVisit` |
| `/api/v1/visits/[visitId]/close` | POST | `closeVisit` |
| `/api/v1/visits/[visitId]/financial-summary` | GET | `getVisitFinancialSummary` |

#### TableService (6 routes)

| Route | Method | http.ts Function |
|-------|--------|------------------|
| `/api/v1/tables` | GET | `listTables` |
| `/api/v1/tables/[tableId]` | GET | `getTable` |
| `/api/v1/tables/[tableId]/activate` | POST | `activateTable` |
| `/api/v1/tables/[tableId]/close` | POST | `closeTable` |
| `/api/v1/tables/[tableId]/deactivate` | POST | `deactivateTable` |
| `/api/v1/tables/[tableId]/dealer` | PATCH | `assignDealer` |

### Phase 2 — Supporting Services

#### CasinoService (8 routes)

| Route | Method |
|-------|--------|
| `/api/v1/casino` | GET |
| `/api/v1/casino/[id]` | GET |
| `/api/v1/casino/staff` | GET |
| `/api/v1/casino/settings` | GET, PATCH |
| `/api/v1/casino/gaming-day` | GET |
| `/api/v1/casinos/[casinoId]` | GET |
| `/api/v1/casinos/[casinoId]/settings` | GET, PATCH |
| `/api/v1/casinos/[casinoId]/staff` | GET |

#### LoyaltyService (8 routes)

| Route | Method |
|-------|--------|
| `/api/v1/loyalty/balances` | GET |
| `/api/v1/loyalty/ledger` | GET |
| `/api/v1/loyalty/accrue` | POST |
| `/api/v1/loyalty/redeem` | POST |
| `/api/v1/loyalty/mid-session-reward` | POST |
| `/api/v1/loyalty/manual-credit` | POST |
| `/api/v1/loyalty/promotion` | POST |
| `/api/v1/loyalty/suggestion` | GET |

#### TableContextService (4 routes)

| Route | Method |
|-------|--------|
| `/api/v1/table-context/credits` | GET, POST |
| `/api/v1/table-context/drop-events` | GET, POST |
| `/api/v1/table-context/fills` | GET, POST |
| `/api/v1/table-context/inventory-snapshots` | GET, POST |

### Phase 3 — Auxiliary Services

#### FinancialService (4 routes)

| Route | Method |
|-------|--------|
| `/api/v1/finance/transactions` | GET, POST |
| `/api/v1/finance/transactions/[transactionId]` | GET |
| `/api/v1/financial-transactions` | GET, POST |
| `/api/v1/financial-transactions/[id]` | GET |

#### MTLService (3 routes)

| Route | Method |
|-------|--------|
| `/api/v1/mtl/entries` | GET, POST |
| `/api/v1/mtl/entries/[entryId]` | GET |
| `/api/v1/mtl/entries/[entryId]/audit-notes` | GET, POST |

#### FloorLayoutService (3 routes)

| Route | Method |
|-------|--------|
| `/api/v1/floor-layouts` | GET, POST |
| `/api/v1/floor-layouts/[layoutId]/versions` | GET, POST |
| `/api/v1/floor-layout-activations` | GET, POST |

---

## Appendix B: Implementation Workstreams

### WS1: Phase 1 — Critical Path (16 routes)

```
services/player/__tests__/http-contract.test.ts
app/api/v1/players/__tests__/route.test.ts
app/api/v1/players/[playerId]/__tests__/route.test.ts
app/api/v1/players/[playerId]/enroll/__tests__/route.test.ts
app/api/v1/players/[playerId]/enrollment/__tests__/route.test.ts
app/api/v1/players/[playerId]/loyalty/__tests__/route.test.ts

services/visit/__tests__/http-contract.test.ts
app/api/v1/visits/__tests__/route.test.ts
app/api/v1/visits/active/__tests__/route.test.ts
app/api/v1/visits/[visitId]/__tests__/route.test.ts
app/api/v1/visits/[visitId]/close/__tests__/route.test.ts
app/api/v1/visits/[visitId]/financial-summary/__tests__/route.test.ts

services/table-context/__tests__/http-contract.test.ts (tables portion)
app/api/v1/tables/__tests__/route.test.ts
app/api/v1/tables/[tableId]/__tests__/route.test.ts
app/api/v1/tables/[tableId]/activate/__tests__/route.test.ts
app/api/v1/tables/[tableId]/close/__tests__/route.test.ts
app/api/v1/tables/[tableId]/deactivate/__tests__/route.test.ts
app/api/v1/tables/[tableId]/dealer/__tests__/route.test.ts
```

### WS2: Phase 2 — Supporting Services (20 routes)

```
services/casino/__tests__/http-contract.test.ts
app/api/v1/casino/**/__tests__/route.test.ts (8 files)

services/loyalty/__tests__/http-contract.test.ts
app/api/v1/loyalty/**/__tests__/route.test.ts (8 files)

services/table-context/__tests__/http-contract.test.ts (context portion)
app/api/v1/table-context/**/__tests__/route.test.ts (4 files)
```

### WS3: Phase 3 — Auxiliary Services (10 routes)

```
services/player-financial/__tests__/http-contract.test.ts
app/api/v1/finance/**/__tests__/route.test.ts (2 files)
app/api/v1/financial-transactions/**/__tests__/route.test.ts (2 files)

app/api/v1/mtl/**/__tests__/route.test.ts (3 files)

services/floor-layout/__tests__/http-contract.test.ts
app/api/v1/floor-layouts/**/__tests__/route.test.ts (2 files)
app/api/v1/floor-layout-activations/__tests__/route.test.ts
```

### WS4: CI Integration

```yaml
# .github/workflows/test.yml additions
- name: Route Handler Tests
  run: npm test -- app/api/v1/

- name: HTTP Contract Tests
  run: npm test -- services/*/__tests__/http-contract
```

### WS5: Documentation Update

- Update QA-005 with full coverage matrix
- Add route test section per bounded context
- Update QA-001 with route handler test guidance

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2025-12-20 | Engineering | Initial draft |

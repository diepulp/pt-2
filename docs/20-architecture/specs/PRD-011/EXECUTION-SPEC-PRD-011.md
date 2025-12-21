---
prd: PRD-011
title: Route Handler Test Coverage Initiative
service: QualityInfrastructure
phase: 0
created: 2025-12-20
workstreams:
  WS1:
    name: Phase 1 - Critical Path Tests (PlayerService)
    agent: backend-developer
    depends_on: []
    outputs:
      - services/player/__tests__/http-contract.test.ts
      - app/api/v1/players/__tests__/route.test.ts
      - app/api/v1/players/[playerId]/__tests__/route.test.ts
      - app/api/v1/players/[playerId]/enroll/__tests__/route.test.ts
      - app/api/v1/players/[playerId]/enrollment/__tests__/route.test.ts
      - app/api/v1/players/[playerId]/loyalty/__tests__/route.test.ts
    gate: test-pass
  WS2:
    name: Phase 1 - Critical Path Tests (VisitService)
    agent: backend-developer
    depends_on: []
    outputs:
      - services/visit/__tests__/http-contract.test.ts
      - app/api/v1/visits/__tests__/route.test.ts
      - app/api/v1/visits/active/__tests__/route.test.ts
      - app/api/v1/visits/[visitId]/__tests__/route.test.ts
      - app/api/v1/visits/[visitId]/close/__tests__/route.test.ts
      - app/api/v1/visits/[visitId]/financial-summary/__tests__/route.test.ts
    gate: test-pass
  WS3:
    name: Phase 1 - Critical Path Tests (TableService)
    agent: backend-developer
    depends_on: []
    outputs:
      - app/api/v1/tables/__tests__/route.test.ts
      - app/api/v1/tables/[tableId]/__tests__/route.test.ts
      - app/api/v1/tables/[tableId]/activate/__tests__/route.test.ts
      - app/api/v1/tables/[tableId]/close/__tests__/route.test.ts
      - app/api/v1/tables/[tableId]/deactivate/__tests__/route.test.ts
      - app/api/v1/tables/[tableId]/dealer/__tests__/route.test.ts
    gate: test-pass
  WS4:
    name: Phase 2 - Supporting Tests (CasinoService)
    agent: backend-developer
    depends_on: [WS1, WS2, WS3]
    outputs:
      - services/casino/__tests__/http-contract.test.ts
      - app/api/v1/casino/__tests__/route.test.ts
      - app/api/v1/casino/[id]/__tests__/route.test.ts
      - app/api/v1/casino/staff/__tests__/route.test.ts
      - app/api/v1/casino/settings/__tests__/route.test.ts
      - app/api/v1/casino/gaming-day/__tests__/route.test.ts
      - app/api/v1/casinos/[casinoId]/__tests__/route.test.ts
      - app/api/v1/casinos/[casinoId]/settings/__tests__/route.test.ts
      - app/api/v1/casinos/[casinoId]/staff/__tests__/route.test.ts
    gate: test-pass
  WS5:
    name: Phase 2 - Supporting Tests (LoyaltyService)
    agent: backend-developer
    depends_on: [WS1, WS2, WS3]
    outputs:
      - services/loyalty/__tests__/http-contract.test.ts
      - app/api/v1/loyalty/balances/__tests__/route.test.ts
      - app/api/v1/loyalty/ledger/__tests__/route.test.ts
      - app/api/v1/loyalty/accrue/__tests__/route.test.ts
      - app/api/v1/loyalty/redeem/__tests__/route.test.ts
      - app/api/v1/loyalty/mid-session-reward/__tests__/route.test.ts
      - app/api/v1/loyalty/manual-credit/__tests__/route.test.ts
      - app/api/v1/loyalty/promotion/__tests__/route.test.ts
      - app/api/v1/loyalty/suggestion/__tests__/route.test.ts
    gate: test-pass
  WS6:
    name: Phase 2 - Supporting Tests (TableContextService)
    agent: backend-developer
    depends_on: [WS1, WS2, WS3]
    outputs:
      - services/table-context/__tests__/http-contract.test.ts
      - app/api/v1/table-context/credits/__tests__/route.test.ts
      - app/api/v1/table-context/drop-events/__tests__/route.test.ts
      - app/api/v1/table-context/fills/__tests__/route.test.ts
      - app/api/v1/table-context/inventory-snapshots/__tests__/route.test.ts
    gate: test-pass
  WS7:
    name: Phase 3 - Auxiliary Tests (FinancialService)
    agent: backend-developer
    depends_on: [WS4, WS5, WS6]
    outputs:
      - services/player-financial/__tests__/http-contract.test.ts
      - app/api/v1/finance/transactions/__tests__/route.test.ts
      - app/api/v1/finance/transactions/[transactionId]/__tests__/route.test.ts
      - app/api/v1/financial-transactions/__tests__/route.test.ts
      - app/api/v1/financial-transactions/[id]/__tests__/route.test.ts
    gate: test-pass
  WS8:
    name: Phase 3 - Auxiliary Tests (MTLService)
    agent: backend-developer
    depends_on: [WS4, WS5, WS6]
    outputs:
      - app/api/v1/mtl/entries/__tests__/route.test.ts
      - app/api/v1/mtl/entries/[entryId]/__tests__/route.test.ts
      - app/api/v1/mtl/entries/[entryId]/audit-notes/__tests__/route.test.ts
    gate: test-pass
  WS9:
    name: Phase 3 - Auxiliary Tests (FloorLayoutService)
    agent: backend-developer
    depends_on: [WS4, WS5, WS6]
    outputs:
      - services/floor-layout/__tests__/http-contract.test.ts
      - app/api/v1/floor-layouts/__tests__/route.test.ts
      - app/api/v1/floor-layouts/[layoutId]/versions/__tests__/route.test.ts
      - app/api/v1/floor-layout-activations/__tests__/route.test.ts
    gate: test-pass
  WS10:
    name: CI Integration
    agent: backend-developer
    depends_on: [WS7, WS8, WS9]
    outputs:
      - .github/workflows/test.yml (updated)
    gate: lint
  WS11:
    name: Documentation Update
    agent: backend-developer
    depends_on: [WS7, WS8, WS9]
    outputs:
      - docs/40-quality/QA-005-route-handler-testing.md (updated)
    gate: lint
execution_phases:
  - name: Phase 1 - Critical Path
    parallel: [WS1, WS2, WS3]
    gate: test-pass
  - name: Phase 2 - Supporting Services
    parallel: [WS4, WS5, WS6]
    gate: test-pass
  - name: Phase 3 - Auxiliary Services
    parallel: [WS7, WS8, WS9]
    gate: test-pass
  - name: Phase 4 - CI & Documentation
    parallel: [WS10, WS11]
    gate: lint
---

# EXECUTION-SPEC: PRD-011 Route Handler Test Coverage Initiative

## Overview

This execution spec implements PRD-011 to achieve 100% route handler test coverage across all 9 bounded contexts. Currently only RatingSlipService (9 routes) has coverage; this initiative adds tests for the remaining 46 routes.

## Reference Implementation

Use `services/rating-slip/__tests__/http-contract.test.ts` as the pattern for HTTP contract tests.
Use `app/api/v1/rating-slips/**/__tests__/route.test.ts` files as patterns for route handler tests.

## Test Patterns (from QA-005)

### Route Handler Test Template

```typescript
/**
 * @jest-environment node
 */
import { GET, POST } from '../route';
import { createMockRequest, createMockRouteParams } from '@/lib/testing/route-test-helpers';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock middleware to bypass auth/RLS
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

// Mock service layer
jest.mock('@/services/{service-name}', () => ({
  create{ServiceName}Service: jest.fn(() => ({
    // Mock methods as needed
  })),
}));

describe('GET /api/v1/{route}', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/{route}');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Object),
    });
  });
});
```

### HTTP Contract Test Template

```typescript
/**
 * @jest-environment node
 */
import * as http from '../http';
import * as collectionRoute from '@/app/api/v1/{route}/route';
import * as resourceRoute from '@/app/api/v1/{route}/[id]/route';

describe('http.ts ↔ route.ts contract', () => {
  it('{httpFunction} → {METHOD} /{route}', () => {
    expect(typeof http.{httpFunction}).toBe('function');
    expect(typeof collectionRoute.{METHOD}).toBe('function');
  });
});
```

## Workstream Details

### WS1: PlayerService Tests (5 routes)

**Routes to test:**
| Route | Method | http.ts Function |
|-------|--------|------------------|
| `/api/v1/players` | GET, POST | `searchPlayers`, `createPlayer` |
| `/api/v1/players/[playerId]` | GET, PATCH | `getPlayer`, `updatePlayer` |
| `/api/v1/players/[playerId]/enroll` | POST | `enrollPlayer` |
| `/api/v1/players/[playerId]/enrollment` | GET | `getEnrollment` |
| `/api/v1/players/[playerId]/loyalty` | GET | `getPlayerLoyalty` |

**Files to create:**
1. `services/player/__tests__/http-contract.test.ts`
2. `app/api/v1/players/__tests__/route.test.ts`
3. `app/api/v1/players/[playerId]/__tests__/route.test.ts`
4. `app/api/v1/players/[playerId]/enroll/__tests__/route.test.ts`
5. `app/api/v1/players/[playerId]/enrollment/__tests__/route.test.ts`
6. `app/api/v1/players/[playerId]/loyalty/__tests__/route.test.ts`

### WS2: VisitService Tests (5 routes)

**Routes to test:**
| Route | Method | http.ts Function |
|-------|--------|------------------|
| `/api/v1/visits` | GET, POST | `listVisits`, `createVisit` |
| `/api/v1/visits/active` | GET | `getActiveVisit` |
| `/api/v1/visits/[visitId]` | GET | `getVisit` |
| `/api/v1/visits/[visitId]/close` | POST | `closeVisit` |
| `/api/v1/visits/[visitId]/financial-summary` | GET | `getVisitFinancialSummary` |

**Files to create:**
1. `services/visit/__tests__/http-contract.test.ts`
2. `app/api/v1/visits/__tests__/route.test.ts`
3. `app/api/v1/visits/active/__tests__/route.test.ts`
4. `app/api/v1/visits/[visitId]/__tests__/route.test.ts`
5. `app/api/v1/visits/[visitId]/close/__tests__/route.test.ts`
6. `app/api/v1/visits/[visitId]/financial-summary/__tests__/route.test.ts`

### WS3: TableService Tests (6 routes)

**Routes to test:**
| Route | Method | http.ts Function |
|-------|--------|------------------|
| `/api/v1/tables` | GET | `listTables` |
| `/api/v1/tables/[tableId]` | GET | `getTable` |
| `/api/v1/tables/[tableId]/activate` | POST | `activateTable` |
| `/api/v1/tables/[tableId]/close` | POST | `closeTable` |
| `/api/v1/tables/[tableId]/deactivate` | POST | `deactivateTable` |
| `/api/v1/tables/[tableId]/dealer` | PATCH | `assignDealer` |

**Files to create:**
1. `app/api/v1/tables/__tests__/route.test.ts`
2. `app/api/v1/tables/[tableId]/__tests__/route.test.ts`
3. `app/api/v1/tables/[tableId]/activate/__tests__/route.test.ts`
4. `app/api/v1/tables/[tableId]/close/__tests__/route.test.ts`
5. `app/api/v1/tables/[tableId]/deactivate/__tests__/route.test.ts`
6. `app/api/v1/tables/[tableId]/dealer/__tests__/route.test.ts`

### WS4: CasinoService Tests (8 routes)

**Routes to test:**
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

### WS5: LoyaltyService Tests (8 routes)

**Routes to test:**
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

### WS6: TableContextService Tests (4 routes)

**Routes to test:**
| Route | Method |
|-------|--------|
| `/api/v1/table-context/credits` | GET, POST |
| `/api/v1/table-context/drop-events` | GET, POST |
| `/api/v1/table-context/fills` | GET, POST |
| `/api/v1/table-context/inventory-snapshots` | GET, POST |

### WS7: FinancialService Tests (4 routes)

**Routes to test:**
| Route | Method |
|-------|--------|
| `/api/v1/finance/transactions` | GET, POST |
| `/api/v1/finance/transactions/[transactionId]` | GET |
| `/api/v1/financial-transactions` | GET, POST |
| `/api/v1/financial-transactions/[id]` | GET |

### WS8: MTLService Tests (3 routes)

**Routes to test:**
| Route | Method |
|-------|--------|
| `/api/v1/mtl/entries` | GET, POST |
| `/api/v1/mtl/entries/[entryId]` | GET |
| `/api/v1/mtl/entries/[entryId]/audit-notes` | GET, POST |

### WS9: FloorLayoutService Tests (3 routes)

**Routes to test:**
| Route | Method |
|-------|--------|
| `/api/v1/floor-layouts` | GET, POST |
| `/api/v1/floor-layouts/[layoutId]/versions` | GET, POST |
| `/api/v1/floor-layout-activations` | GET, POST |

### WS10: CI Integration

Update `.github/workflows/test.yml` to add:

```yaml
- name: Route Handler Tests
  run: npm test -- app/api/v1/

- name: HTTP Contract Tests
  run: npm test -- services/*/__tests__/http-contract
```

### WS11: Documentation Update

Update `docs/40-quality/QA-005-route-handler-testing.md`:
- Add coverage matrix for all 9 services
- Add sections for each bounded context following the RatingSlipService pattern

## Validation Gates

| Phase | Gate | Command |
|-------|------|---------|
| Phase 1 | test-pass | `npm test -- app/api/v1/players app/api/v1/visits app/api/v1/tables` |
| Phase 2 | test-pass | `npm test -- app/api/v1/casino app/api/v1/loyalty app/api/v1/table-context` |
| Phase 3 | test-pass | `npm test -- app/api/v1/finance app/api/v1/financial-transactions app/api/v1/mtl app/api/v1/floor-layouts` |
| Phase 4 | lint | `npm run lint` |

## Success Criteria

- [ ] 55/55 route handlers have test files (100%)
- [ ] 9/9 bounded contexts have HTTP contract tests (100%)
- [ ] All tests pass: `npm test -- app/api/v1`
- [ ] CI pipeline includes route handler tests
- [ ] QA-005 updated with full coverage matrix

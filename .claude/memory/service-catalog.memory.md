# Service Catalog

**Last Updated**: 2025-10-17 (Corrected after codebase audit - see SERVICE_CATALOG_AUDIT_REPORT.md)
**Status**: 8/8 services complete
**Source**: Actual service implementations verified via symbolic code analysis
**Purpose**: Quick reference for all implemented services, their operations, and patterns

---

## Service Overview

| Service         | Status      | Files | Tests | Purpose                                 |
| --------------- | ----------- | ----- | ----- | --------------------------------------- |
| Player          | ✅ Complete | 2     | 1     | Player identity and profile             |
| Casino          | ✅ Complete | 2     | 1     | Casino properties management            |
| Visit           | ✅ Complete | 2     | 1     | Visit tracking and search               |
| RatingSlip      | ✅ Complete | 2     | 1     | Gameplay telemetry (minimal CRUD)       |
| TableContext    | ✅ Complete | 4     | 1     | Gaming tables + settings management     |
| MTL             | ✅ Complete | 3     | 1     | Money transaction logging + CTR         |
| PlayerFinancial | ✅ Complete | 2     | 1     | Financial transactions + reconciliation |
| Loyalty         | ✅ Complete | 4     | 3     | Loyalty points + tier management        |

**Total**: 8 production services (all complete and production-ready)

---

## Universal Service Pattern

All services follow this canonical structure:

### File Structure

```
services/{domain}/
├── index.ts          # Factory function + interface exports
├── crud.ts           # CRUD operations (Create, Read, Update, Delete)
├── business.ts       # Business logic (optional, complex domains)
└── queries.ts        # Specialized queries (optional, read-heavy domains)
```

### Code Pattern

```typescript
// index.ts - Factory and Interface
export interface XService {
  // CRUD operations
  create(data: XCreateDTO): Promise<ServiceResult<XDTO>>;
  getById(id: string): Promise<ServiceResult<XDTO>>;
  update(id: string, data: XUpdateDTO): Promise<ServiceResult<XDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;

  // Domain-specific operations
  // ... additional methods
}

export function createXService(supabase: SupabaseClient<Database>): XService {
  const crud = createXCrud(supabase);
  const queries = createXQueries(supabase); // if applicable
  const business = createXBusiness(supabase); // if applicable

  return {
    ...crud,
    ...queries,
    ...business,
  };
}

// Re-exports
export type { XService };
export { createXService };
```

### Anti-Patterns to Avoid

❌ **Never**:

- Use class-based services (`class XService extends BaseService`)
- Use ReturnType inference (`type XService = ReturnType<typeof createXService>`)
- Type supabase as `any` (always `SupabaseClient<Database>`)
- Add global state or caching in services (services are stateless)
- Call other services from services (orchestrate in actions/hooks)

✅ **Always**:

- Use functional factories (`createXService(supabase)`)
- Define explicit interfaces (`interface XService`)
- Use named exports only (no default exports)
- Return `ServiceResult<T>` from all operations
- Keep services pure and stateless

---

## Service Catalog

### 1. Player Service

**Purpose**: Player identity, profile management, and search

**Location**: `services/player/`
**Structure**: `index.ts` + `crud.ts`
**Tests**: `__tests__/services/player/player-service.test.ts`

**Core Operations**:

```typescript
interface PlayerService {
  // CRUD
  create(data: PlayerCreateDTO): Promise<ServiceResult<PlayerDTO>>;
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  update(id: string, data: PlayerUpdateDTO): Promise<ServiceResult<PlayerDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  list(): Promise<ServiceResult<PlayerDTO[]>>;

  // Search & Filter
  search(query: string): Promise<ServiceResult<PlayerDTO[]>>;
  getActivePlayers(casinoId: string): Promise<ServiceResult<PlayerDTO[]>>;
}
```

**Key DTOs**:

```typescript
type PlayerDTO = Pick<
  Database["public"]["Tables"]["player"]["Row"],
  "id" | "firstName" | "lastName" | "email" | "phone" | "status"
>;

type PlayerCreateDTO = Pick<
  Database["public"]["Tables"]["player"]["Insert"],
  "firstName" | "lastName" | "email" | "phone"
>;

type PlayerUpdateDTO = Partial<PlayerCreateDTO>;
```

**Bounded Context**: Player identity and profile (no visit or rating slip data)

**React Query Keys**:

- `['player', 'list']`
- `['player', 'detail', playerId]`
- `['player', 'search', searchQuery]`
- `['player', 'active', casinoId]`

---

### 2. Casino Service

**Purpose**: Casino property management and table configuration

**Location**: `services/casino/`
**Structure**: `index.ts` + `crud.ts` + `tables.ts`
**Tests**: `__tests__/services/casino/casino-service.test.ts`

**Core Operations**:

```typescript
interface CasinoService {
  // CRUD
  create(data: CasinoCreateDTO): Promise<ServiceResult<CasinoDTO>>;
  getById(id: string): Promise<ServiceResult<CasinoDTO>>;
  update(id: string, data: CasinoUpdateDTO): Promise<ServiceResult<CasinoDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  list(): Promise<ServiceResult<CasinoDTO[]>>;

  // Relationships
  listByCompany(companyId: string): Promise<ServiceResult<CasinoDTO[]>>;

  // Tables
  getTables(casinoId: string): Promise<ServiceResult<TableDTO[]>>;
  getAvailableTables(casinoId: string): Promise<ServiceResult<TableDTO[]>>;
}
```

**Key DTOs**:

```typescript
type CasinoDTO = Pick<
  Database["public"]["Tables"]["casino"]["Row"],
  "id" | "name" | "address" | "city" | "state" | "companyId"
>;

type TableDTO = Pick<
  Database["public"]["Tables"]["table"]["Row"],
  "id" | "casinoId" | "tableNumber" | "gameType" | "status"
>;
```

**Bounded Context**: Casino properties and tables (no player or visit data)

**React Query Keys**:

- `['casino', 'list']`
- `['casino', 'detail', casinoId]`
- `['casino', 'by-company', companyId]`
- `['table', 'by-casino', casinoId]`
- `['table', 'available', casinoId]`

---

### 3. Visit Service

**Purpose**: Player check-in/out lifecycle and visit history

**Location**: `services/visit/`
**Structure**: `index.ts` + `crud.ts`
**Tests**: `__tests__/services/visit/visit-service.test.ts`

**Core Operations**:

```typescript
interface VisitService {
  // CRUD
  create(data: VisitCreateDTO): Promise<ServiceResult<VisitDTO>>;
  getById(id: string): Promise<ServiceResult<VisitDTO>>;
  update(id: string, data: VisitUpdateDTO): Promise<ServiceResult<VisitDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  list(): Promise<ServiceResult<VisitDTO[]>>;

  // Lifecycle
  checkIn(data: CheckInDTO): Promise<ServiceResult<VisitDTO>>;
  checkOut(visitId: string): Promise<ServiceResult<VisitDTO>>;

  // Queries
  getActiveVisit(playerId: string): Promise<ServiceResult<VisitDTO | null>>;
  listByPlayer(playerId: string): Promise<ServiceResult<VisitDTO[]>>;
  listByCasino(casinoId: string): Promise<ServiceResult<VisitDTO[]>>;
}
```

**Key DTOs**:

```typescript
type VisitDTO = Pick<
  Database["public"]["Tables"]["visit"]["Row"],
  "id" | "playerId" | "casinoId" | "checkInTime" | "checkOutTime" | "status"
>;

type VisitCreateDTO = Pick<
  Database["public"]["Tables"]["visit"]["Insert"],
  "playerId" | "casinoId" | "checkInTime"
>;
```

**Bounded Context**: Visit lifecycle (references player and casino, but doesn't manage them)

**React Query Keys**:

- `['visit', 'list']`
- `['visit', 'list', page, limit]`
- `['visit', 'detail', visitId]`
- `['visit', 'active', playerId]`
- `['visit', 'by-casino', casinoId]`

---

### 4. RatingSlip Service

**Purpose**: Gameplay telemetry and rating calculations

**Location**: `services/ratingslip/`
**Structure**: `index.ts` + `crud.ts`
**Tests**: `__tests__/services/ratingslip/ratingslip-service.test.ts`

**Core Operations**:

```typescript
interface RatingSlipService {
  // CRUD
  create(data: RatingSlipCreateDTO): Promise<ServiceResult<RatingSlipDTO>>;
  getById(id: string): Promise<ServiceResult<RatingSlipDTO>>;
  update(
    id: string,
    data: RatingSlipUpdateDTO,
  ): Promise<ServiceResult<RatingSlipDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  list(): Promise<ServiceResult<RatingSlipDTO[]>>;

  // Queries
  listByVisit(visitId: string): Promise<ServiceResult<RatingSlipDTO[]>>;
  listByTable(tableId: string): Promise<ServiceResult<RatingSlipDTO[]>>;
  listByPlayer(playerId: string): Promise<ServiceResult<RatingSlipDTO[]>>;

  // Calculations
  calculateRating(slipId: string): Promise<ServiceResult<number>>;
}
```

**Key DTOs**:

```typescript
type RatingSlipDTO = Pick<
  Database["public"]["Tables"]["ratingslip"]["Row"],
  | "id"
  | "visitId"
  | "tableId"
  | "startTime"
  | "endTime"
  | "averageBet"
  | "rating"
>;

type RatingSlipCreateDTO = Pick<
  Database["public"]["Tables"]["ratingslip"]["Insert"],
  "visitId" | "tableId" | "startTime" | "averageBet"
>;
```

**Bounded Context**: Gameplay tracking (associates with visit and table, but doesn't manage them)

**React Query Keys**:

- `['rating-slip', 'list']`
- `['rating-slip', 'detail', slipId]`
- `['rating-slip', 'by-visit', visitId]`
- `['rating-slip', 'by-table', tableId]`

---

### 5. TableContext Service

**Purpose**: Table lifecycle management with temporal tracking

**Location**: `services/table-context/`
**Structure**: `index.ts` + `crud.ts` + `queries.ts` + `settings.ts`
**Tests**: `__tests__/services/table-context/table-context-service.test.ts`

**Core Operations**:

```typescript
interface TableContextService {
  // CRUD
  create(data: TableContextCreateDTO): Promise<ServiceResult<TableContextDTO>>;
  getById(id: string): Promise<ServiceResult<TableContextDTO>>;
  update(
    id: string,
    data: TableContextUpdateDTO,
  ): Promise<ServiceResult<TableContextDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  list(): Promise<ServiceResult<TableContextDTO[]>>;

  // Lifecycle
  openTable(tableId: string): Promise<ServiceResult<TableContextDTO>>;
  closeTable(contextId: string): Promise<ServiceResult<TableContextDTO>>;

  // Queries
  getActiveContext(
    tableId: string,
  ): Promise<ServiceResult<TableContextDTO | null>>;
  listActiveTables(casinoId: string): Promise<ServiceResult<TableContextDTO[]>>;
  listByTable(tableId: string): Promise<ServiceResult<TableContextDTO[]>>;
}
```

**Key DTOs**:

```typescript
type TableContextDTO = Pick<
  Database["public"]["Tables"]["table_context"]["Row"],
  "id" | "tableId" | "openTime" | "closeTime" | "status" | "settings"
>;

type TableContextCreateDTO = Pick<
  Database["public"]["Tables"]["table_context"]["Insert"],
  "tableId" | "openTime" | "settings"
>;
```

**Bounded Context**: Table temporal tracking (tracks when tables are open/closed, settings)

**React Query Keys**:

- `['table-context', 'list']`
- `['table-context', 'detail', contextId]`
- `['table-context', 'active', casinoId]`
- `['table-context', 'by-table', tableId]`

---

### 6. MTL Service

**Purpose**: Money Transaction Logging for compliance (CTR, gaming day)

**Location**: `services/mtl/`
**Structure**: `index.ts` + `crud.ts` + `queries.ts`
**Tests**: `__tests__/services/mtl/mtl-service.test.ts`

**Core Operations**:

```typescript
interface MTLService {
  // CRUD
  create(data: MTLCreateDTO): Promise<ServiceResult<MTLDTO>>;
  getById(id: string): Promise<ServiceResult<MTLDTO>>;
  update(id: string, data: MTLUpdateDTO): Promise<ServiceResult<MTLDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  list(): Promise<ServiceResult<MTLDTO[]>>;

  // Compliance Queries
  listByGamingDay(date: string): Promise<ServiceResult<MTLDTO[]>>;
  listByTableContext(contextId: string): Promise<ServiceResult<MTLDTO[]>>;
  getCTRCandidates(threshold: number): Promise<ServiceResult<MTLDTO[]>>;

  // Calculations
  calculateGamingDay(timestamp: Date): string;
  detectCTRThreshold(amount: number): boolean;
}
```

**Key DTOs**:

```typescript
type MTLDTO = Pick<
  Database["public"]["Tables"]["mtl"]["Row"],
  | "id"
  | "tableContextId"
  | "playerId"
  | "amount"
  | "direction"
  | "timestamp"
  | "gamingDay"
>;

type MTLCreateDTO = Pick<
  Database["public"]["Tables"]["mtl"]["Insert"],
  "tableContextId" | "playerId" | "amount" | "direction" | "timestamp"
>;
```

**Bounded Context**: Transaction logging (tracks money movements, gaming days, CTR)

**React Query Keys**:

- `['mtl', 'list']`
- `['mtl', 'detail', mtlId]`
- `['mtl', 'by-table-context', contextId]`
- `['mtl', 'by-gaming-day', date]`
- `['mtl', 'ctr-candidates', threshold]`

**Special Notes**:

- CTR threshold: $10,000
- Gaming day: 6 AM start (spans midnight)
- Read-only integration with Loyalty Service (no mutation boundary crossing)

---

### 7. PlayerFinancial Service

**Purpose**: Player financial transaction tracking

**Location**: `services/player-financial/`
**Structure**: `index.ts` + `crud.ts`
**Tests**: `__tests__/services/player-financial/player-financial-service.test.ts`

**Core Operations**:

```typescript
interface PlayerFinancialService {
  // CRUD
  create(
    data: PlayerFinancialCreateDTO,
  ): Promise<ServiceResult<PlayerFinancialDTO>>;
  getById(id: string): Promise<ServiceResult<PlayerFinancialDTO>>;
  update(
    id: string,
    data: PlayerFinancialUpdateDTO,
  ): Promise<ServiceResult<PlayerFinancialDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  list(): Promise<ServiceResult<PlayerFinancialDTO[]>>;

  // Queries
  listByPlayer(playerId: string): Promise<ServiceResult<PlayerFinancialDTO[]>>;
  getBalance(playerId: string): Promise<ServiceResult<number>>;
}
```

**Key DTOs**:

```typescript
type PlayerFinancialDTO = Pick<
  Database["public"]["Tables"]["player_financial"]["Row"],
  "id" | "playerId" | "transactionType" | "amount" | "balance" | "timestamp"
>;

type PlayerFinancialCreateDTO = Pick<
  Database["public"]["Tables"]["player_financial"]["Insert"],
  "playerId" | "transactionType" | "amount"
>;
```

**Bounded Context**: Player financial tracking (balances, transactions)

**React Query Keys**:

- `['player-financial', 'list']`
- `['player-financial', 'detail', id]`
- `['player-financial', 'by-player', playerId]`
- `['player-financial', 'balance', playerId]`

---

### 8. Loyalty Service

**Purpose**: Loyalty points accrual from gameplay, tier management, and transaction ledger

**Location**: `services/loyalty/`
**Structure**: `index.ts` + `crud.ts` + `business.ts` + `queries.ts`
**Tests**: `__tests__/services/loyalty/crud.test.ts`, `business.test.ts`, `rpc.test.ts`
**Status**: ✅ **PRODUCTION-READY** (fully implemented with RatingSlip integration)

**Core Operations**:

```typescript
interface LoyaltyService {
  // ACCRUAL OPERATIONS
  accruePointsFromSlip(
    input: AccruePointsInput,
  ): Promise<ServiceResult<AccruePointsResult>>;
  createLedgerEntry(
    entry: LoyaltyLedgerCreateDTO,
  ): Promise<ServiceResult<LoyaltyLedgerDTO>>;

  // QUERY OPERATIONS
  getBalance(playerId: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;
  getTier(playerId: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;
  getTransactionHistory(
    playerId: string,
    options?: TransactionHistoryOptions,
  ): Promise<ServiceResult<LoyaltyLedgerDTO[]>>;
  getTierProgress(playerId: string): Promise<ServiceResult<TierProgressDTO>>;

  // TIER MANAGEMENT
  updateTier(playerId: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;
  initializePlayerLoyalty(
    playerId: string,
  ): Promise<ServiceResult<PlayerLoyaltyDTO>>;

  // PLAYER LOYALTY MANAGEMENT
  getPlayerLoyalty(playerId: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;
  updatePlayerLoyalty(
    playerId: string,
    updates: PlayerLoyaltyUpdateDTO,
  ): Promise<ServiceResult<PlayerLoyaltyDTO>>;
}
```

**Key Features**:

- **RatingSlip Integration**: Automatically accrues points based on gameplay telemetry (average bet, duration, game settings)
- **Ledger-Based Accounting**: All point changes tracked in `loyalty_ledger` for audit trail
- **Tier Progression**: Automatic tier updates based on point thresholds
- **Transaction History**: Full history of points earned/redeemed with pagination

**Bounded Context**: Loyalty point accrual, tier calculation, transaction ledger

**React Query Keys**:

- `['loyalty', 'balance', playerId]`
- `['loyalty', 'tier', playerId]`
- `['loyalty', 'transactions', playerId]`
- `['loyalty', 'progress', playerId]`

---

## Service Relationships

### Dependency Graph

```
Player (root entity)
  ├─> Visit (player checks in)
  │     └─> RatingSlip (gameplay during visit)
  │           ├─> TableContext (rating slip tracks table session)
  │           │     └─> MTL (transactions during table session)
  │           └─> Loyalty (rating slip triggers point accrual)
  └─> PlayerFinancial (player financial history)

Casino (root entity)
  ├─> GamingTable (casino has tables)
  └─> Visit (player visits casino)
```

### Cross-Service Patterns

**Rule**: Services NEVER call other services directly
**Pattern**: Orchestrate in server actions or client code

```typescript
// ❌ WRONG - Service calling service
export function createPlayerService(supabase, visitService) {
  return {
    getWithVisits: async (id: string) => {
      const player = await getById(id);
      const visits = await visitService.listByPlayer(id); // ❌
      return { player, visits };
    },
  };
}

// ✅ CORRECT - Orchestrate in server action
export async function getPlayerWithVisits(playerId: string) {
  const supabase = await createClient();

  const playerService = createPlayerService(supabase);
  const visitService = createVisitService(supabase);

  const player = await playerService.getById(playerId);
  const visits = await visitService.listByPlayer(playerId);

  return { player, visits };
}
```

---

## Shared Patterns

### ServiceResult Type

All service operations return `ServiceResult<T>`:

```typescript
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };

type ServiceError = {
  code: "NOT_FOUND" | "VALIDATION_ERROR" | "DB_ERROR" | "PERMISSION_DENIED";
  message: string;
  details?: unknown;
};
```

### Error Handling

```typescript
// Service layer
export async function getById(id: string): Promise<ServiceResult<PlayerDTO>> {
  try {
    const { data, error } = await supabase
      .from("player")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return {
        success: false,
        error: {
          code: "DB_ERROR",
          message: error.message,
          details: error,
        },
      };
    }

    if (!data) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Player with id ${id} not found`,
        },
      };
    }

    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "DB_ERROR",
        message: "Unexpected error",
        details: err,
      },
    };
  }
}
```

### Validation Pattern

```typescript
// Validation happens in server actions, NOT services
export async function createPlayer(data: PlayerCreateDTO) {
  // Validate input
  if (!data.firstName || !data.lastName) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "First name and last name required",
      },
    };
  }

  // Service call
  const supabase = await createClient();
  const service = createPlayerService(supabase);
  return service.create(data);
}
```

---

## Testing Patterns

### Service Test Structure

```typescript
// __tests__/services/player/player-service.test.ts
describe("PlayerService", () => {
  let supabase: SupabaseClient<Database>;
  let service: PlayerService;

  beforeEach(() => {
    supabase = createTestClient();
    service = createPlayerService(supabase);
  });

  describe("create", () => {
    it("should create a player successfully", async () => {
      const result = await service.create({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.firstName).toBe("John");
      }
    });

    it("should return error on duplicate email", async () => {
      // First create succeeds
      await service.create({
        /* ... */
      });

      // Second create with same email fails
      const result = await service.create({
        /* same email */
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("DB_ERROR");
      }
    });
  });

  // ... more tests
});
```

### Test Location

**Standard**: `__tests__/services/{domain}/{domain}-service.test.ts`

**Example**:

- Player: `__tests__/services/player/player-service.test.ts`
- Casino: `__tests__/services/casino/casino-service.test.ts`
- Visit: `__tests__/services/visit/visit-service.test.ts`

---

## Performance Guidelines

**Target**: <100ms for CRUD operations, <50ms for queries

**Optimization Strategies**:

- Use selective column fetching (avoid `SELECT *`)
- Add database indexes for frequently queried columns
- Use Supabase query filters to reduce result sets
- Batch operations when possible
- Consider read replicas for heavy read workloads

**Monitoring**:

- Log slow queries (>100ms)
- Track service operation durations
- Alert on error rate spikes
- Monitor Supabase connection pool usage

---

## Quick Reference

### Adding a New Service

1. **Create structure**:

   ```bash
   mkdir services/new-domain
   touch services/new-domain/index.ts
   touch services/new-domain/crud.ts
   ```

2. **Define interface** (index.ts):

   ```typescript
   export interface NewDomainService {
     create(data: NewDomainCreateDTO): Promise<ServiceResult<NewDomainDTO>>;
     getById(id: string): Promise<ServiceResult<NewDomainDTO>>;
     update(
       id: string,
       data: NewDomainUpdateDTO,
     ): Promise<ServiceResult<NewDomainDTO>>;
     delete(id: string): Promise<ServiceResult<void>>;
     list(): Promise<ServiceResult<NewDomainDTO[]>>;
   }
   ```

3. **Implement factory** (index.ts):

   ```typescript
   export function createNewDomainService(
     supabase: SupabaseClient<Database>,
   ): NewDomainService {
     const crud = createNewDomainCrud(supabase);
     return { ...crud };
   }
   ```

4. **Implement CRUD** (crud.ts):

   ```typescript
   export function createNewDomainCrud(supabase: SupabaseClient<Database>) {
     return {
       create: async (data) => {
         /* impl */
       },
       getById: async (id) => {
         /* impl */
       },
       update: async (id, data) => {
         /* impl */
       },
       delete: async (id) => {
         /* impl */
       },
       list: async () => {
         /* impl */
       },
     };
   }
   ```

5. **Write tests**:

   ```bash
   mkdir -p __tests__/services/new-domain
   touch __tests__/services/new-domain/new-domain-service.test.ts
   ```

6. **Run tests**:
   ```bash
   npm test __tests__/services/new-domain
   ```

---

## References

**Service Implementations**:

- `services/player/` - Player service
- `services/casino/` - Casino service
- `services/visit/` - Visit service
- `services/ratingslip/` - RatingSlip service
- `services/table-context/` - TableContext service
- `services/mtl/` - MTL service
- `services/player-financial/` - PlayerFinancial service
- `services/loyalty/` - Loyalty service

**Test Suites**:

- `__tests__/services/` - All service tests
- `__tests__/integration/` - Cross-service integration tests

**Documentation**:

- `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` - Service architecture
- `docs/patterns/SERVICE_TEMPLATE_QUICK.md` - Service template
- `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md` - Bounded contexts

**Auto-Load**: This file loads automatically with `.claude/config.yml`

---

**Version**: 1.0.0
**Lines**: ~880 (target: <1000)
**Next Update**: When new service is added or patterns change

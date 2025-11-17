# GOV-PAT-001: Service Factory Pattern

**Status**: Active
**Version**: 1.0
**Applies to**: All domain services
**References**: SERVICE_TEMPLATE.md, OVER_ENGINEERING_GUARDRAIL.md, SRM
**Last Updated**: 2025-11-17

---

## Purpose

Standardize service factory construction, wiring, and consumption across bounded contexts to ensure:
- Explicit dependency injection
- Type-safe service interfaces
- Testable service composition
- Bounded context isolation

---

## 1. Pattern Overview

### Definition

**Service Factory Pattern**: A functional factory function that wires dependencies (Supabase client, validators, mappers) and returns a typed service interface for a single bounded context.

### Core Principles

1. **Functional Factories**: Use functions, not classes
2. **Explicit Interfaces**: Define service contracts explicitly (no `ReturnType<>` inference)
3. **Single Responsibility**: One factory per bounded context
4. **Dependency Injection**: All dependencies passed as parameters
5. **No Global State**: No singletons or global service instances

---

## 2. Factory Structure

### Canonical Pattern

```typescript
// services/{domain}/index.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { ServiceResult } from "@/services/shared/types";
import type { CreateXDTO, XDTO } from "./dto";
import { createXCrud } from "./crud";
import { createXBusiness } from "./business"; // if complex logic exists

/**
 * Explicit service interface (REQUIRED)
 * DO NOT use ReturnType<typeof createXService>
 */
export interface XService {
  // CRUD operations
  create(data: CreateXDTO): Promise<ServiceResult<XDTO>>;
  update(id: string, data: Partial<CreateXDTO>): Promise<ServiceResult<XDTO>>;
  getById(id: string): Promise<ServiceResult<XDTO>>;
  list(filters: XFilters): Promise<ServiceResult<XDTO[]>>;

  // Business operations (if needed)
  executeBusinessLogic?(input: XBusinessInput): Promise<ServiceResult<XBusinessOutput>>;
}

/**
 * Factory function: wires dependencies and returns service interface
 * @param supabase - Typed Supabase client (NEVER `any`)
 */
export function createXService(
  supabase: SupabaseClient<Database>
): XService {
  // Wire internal modules
  const crud = createXCrud(supabase);
  const business = createXBusiness(supabase, crud); // if needed

  // Return service interface
  return {
    ...crud,
    ...business, // if needed
  };
}
```

---

## 3. Factory Responsibilities

### DO: Factory Implementation

#### ✅ 1. Wire Dependencies Once Per Bounded Context

```typescript
// CORRECT: Factory wires all dependencies internally
export function createLoyaltyService(
  supabase: SupabaseClient<Database>
): LoyaltyService {
  // Internal wiring
  const crud = createLoyaltyCrud(supabase);
  const calculator = createRewardCalculator(supabase);
  const ledger = createLedgerService(supabase);

  return {
    // CRUD operations
    getPlayerLoyalty: crud.getById,
    updateTier: crud.updateTier,

    // Business logic
    calculateMidSessionReward: async (telemetry) => {
      const reward = calculator.compute(telemetry);
      return ledger.appendReward(reward);
    },
  };
}

// INCORRECT: Exposing internal wiring to consumers
export function createLoyaltyService(supabase: SupabaseClient<Database>) {
  return {
    crud: createLoyaltyCrud(supabase), // ❌ Leaks internal structure
    calculator: createRewardCalculator(supabase), // ❌ Consumers shouldn't see this
  };
}
```

#### ✅ 2. Keep Orchestration Inside Service Factories

```typescript
// CORRECT: Service orchestrates internal modules
export function createLoyaltyService(
  supabase: SupabaseClient<Database>
): LoyaltyService {
  const crud = createLoyaltyCrud(supabase);
  const calculator = createRewardCalculator(supabase);

  return {
    issueMidSessionReward: async (
      ratingSlipId: string,
      telemetry: RatingSlipTelemetryDTO
    ): Promise<ServiceResult<LoyaltyLedgerEntryDTO>> => {
      // Service orchestrates workflow
      const points = calculator.compute(telemetry);
      const result = await crud.appendLedger({
        rating_slip_id: ratingSlipId,
        points_change: points,
        reason: 'MID_SESSION_REWARD',
      });

      if (result.success) {
        await crud.updateBalance(telemetry.player_id, points);
      }

      return result;
    },
  };
}

// INCORRECT: Orchestration at the edge (server action)
export async function issueRewardAction(ratingSlipId: string) {
  const supabase = await createClient();
  const loyaltyService = createLoyaltyService(supabase);

  // ❌ WRONG: Orchestration in server action, not service
  const points = await loyaltyService.calculatePoints(ratingSlipId);
  await loyaltyService.appendLedger(ratingSlipId, points);
  await loyaltyService.updateBalance(playerId, points);
}
```

#### ✅ 3. Use Mappers/Validators to Enforce Contracts

```typescript
// services/{domain}/index.ts
import { toXDTO } from "./mappers";
import { validateXInput } from "./validators";

export function createXService(
  supabase: SupabaseClient<Database>
): XService {
  const crud = createXCrud(supabase);

  return {
    create: async (data: CreateXDTO): Promise<ServiceResult<XDTO>> => {
      // Validate input at service boundary
      const validation = validateXInput(data);
      if (!validation.success) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validation.error },
        };
      }

      // Execute CRUD
      const result = await crud.insert(data);

      // Map to DTO before returning
      if (result.success && result.data) {
        return {
          ...result,
          data: toXDTO(result.data),
        };
      }

      return result;
    },
  };
}
```

---

### DON'T: Factory Anti-Patterns

#### ❌ 1. Fan Out from Edge Handlers into Multiple Contexts

```typescript
// INCORRECT: Server action directly calls multiple services
export async function completeRatingSlipAction(slipId: string) {
  const supabase = await createClient();

  // ❌ WRONG: Edge handler knows about internal service coordination
  const ratingService = createRatingSlipService(supabase);
  const loyaltyService = createLoyaltyService(supabase);
  const financeService = createFinanceService(supabase);

  const slip = await ratingService.getById(slipId);
  await loyaltyService.issueReward(slipId, slip.data);
  await financeService.recordCompPoints(slip.data.player_id, slip.data.points);

  return { success: true };
}

// CORRECT: Service encapsulates cross-context coordination
export function createRatingSlipService(
  supabase: SupabaseClient<Database>
): RatingSlipService {
  const crud = createRatingSlipCrud(supabase);
  // Orchestrate cross-context interactions INSIDE service
  const loyaltyService = createLoyaltyService(supabase);

  return {
    completeRatingSlip: async (slipId: string) => {
      const slip = await crud.close(slipId);

      if (slip.success) {
        // Service coordinates with Loyalty context
        await loyaltyService.issueMidSessionReward(
          slipId,
          toTelemetryDTO(slip.data)
        );
      }

      return slip;
    },
  };
}

// Edge handler becomes simple
export async function completeRatingSlipAction(slipId: string) {
  const supabase = await createClient();
  const ratingService = createRatingSlipService(supabase);

  // ✅ CORRECT: Single service call at edge
  return ratingService.completeRatingSlip(slipId);
}
```

#### ❌ 2. Reach into Other Services' Tables

```typescript
// INCORRECT: MTL service directly queries rating_slip table
export function createMTLService(
  supabase: SupabaseClient<Database>
): MTLService {
  return {
    createEntry: async (data: CreateMTLDTO) => {
      // ❌ WRONG: Cross-context table access
      const { data: slip } = await supabase
        .from('rating_slip') // rating_slip is owned by RatingSlipService
        .select('player_id, average_bet')
        .eq('id', data.rating_slip_id)
        .single();

      // Use slip data in MTL entry...
    },
  };
}

// CORRECT: Call RatingSlipService via published interface
export function createMTLService(
  supabase: SupabaseClient<Database>
): MTLService {
  // ✅ CORRECT: Use other service's factory
  const ratingSlipService = createRatingSlipService(supabase);

  return {
    createEntry: async (data: CreateMTLDTO) => {
      // ✅ CORRECT: Call published service method
      const slip = await ratingSlipService.getById(data.rating_slip_id);

      if (slip.success) {
        // Use slip.data (DTO) in MTL entry
      }
    },
  };
}
```

#### ❌ 3. Multiple Factory Instantiations Per Request

```typescript
// INCORRECT: Create service in every function call
export async function playerProfileAction(playerId: string) {
  const supabase = await createClient();

  // ❌ WRONG: Service instantiated 3 times
  const player = await createPlayerService(supabase).getById(playerId);
  const visits = await createVisitService(supabase).listByPlayer(playerId);
  const loyalty = await createLoyaltyService(supabase).getPlayerLoyalty(playerId);

  return { player, visits, loyalty };
}

// CORRECT: Instantiate once, reuse
export async function playerProfileAction(playerId: string) {
  const supabase = await createClient();

  // ✅ CORRECT: Create services once
  const playerService = createPlayerService(supabase);
  const visitService = createVisitService(supabase);
  const loyaltyService = createLoyaltyService(supabase);

  // Reuse instances
  const player = await playerService.getById(playerId);
  const visits = await visitService.listByPlayer(playerId);
  const loyalty = await loyaltyService.getPlayerLoyalty(playerId);

  return { player, visits, loyalty };
}
```

#### ❌ 4. Inline Repo Construction in Controllers

```typescript
// INCORRECT: Controller directly accesses Supabase
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // ❌ WRONG: Inline data access in route handler
  const { data, error } = await supabase
    .from('player')
    .select('*')
    .eq('id', playerId)
    .single();

  return Response.json(data);
}

// CORRECT: Use service factory
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // ✅ CORRECT: Route handler delegates to service
  const playerService = createPlayerService(supabase);
  const result = await playerService.getById(playerId);

  return toServiceHttpResponse(result);
}
```

---

## 4. Composition Patterns

### Pattern A: Simple CRUD Service

```typescript
// services/player/index.ts
export interface PlayerService {
  create(data: CreatePlayerDTO): Promise<ServiceResult<PlayerDTO>>;
  update(id: string, data: Partial<CreatePlayerDTO>): Promise<ServiceResult<PlayerDTO>>;
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  list(casinoId: string): Promise<ServiceResult<PlayerDTO[]>>;
}

export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerService {
  const crud = createPlayerCrud(supabase);
  return { ...crud }; // Simple delegation
}
```

### Pattern B: CRUD + Business Logic

```typescript
// services/loyalty/index.ts
export interface LoyaltyService {
  // CRUD operations
  getPlayerLoyalty(playerId: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;
  updateTier(playerId: string, tier: string): Promise<ServiceResult<PlayerLoyaltyDTO>>;

  // Business operations
  calculateMidSessionReward(
    telemetry: RatingSlipTelemetryDTO
  ): Promise<ServiceResult<LoyaltyLedgerEntryDTO>>;

  issueMidSessionReward(
    ratingSlipId: string,
    telemetry: RatingSlipTelemetryDTO
  ): Promise<ServiceResult<LoyaltyLedgerEntryDTO>>;
}

export function createLoyaltyService(
  supabase: SupabaseClient<Database>
): LoyaltyService {
  const crud = createLoyaltyCrud(supabase);
  const calculator = createRewardCalculator(supabase);
  const ledger = createLedgerService(supabase);

  return {
    // CRUD delegation
    getPlayerLoyalty: crud.getById,
    updateTier: crud.updateTier,

    // Business logic composition
    calculateMidSessionReward: async (telemetry) => {
      return calculator.compute(telemetry);
    },

    issueMidSessionReward: async (ratingSlipId, telemetry) => {
      // Orchestrate: calculate + persist + update balance
      const points = calculator.compute(telemetry);
      const ledgerEntry = await ledger.appendReward({
        rating_slip_id: ratingSlipId,
        player_id: telemetry.player_id,
        points_change: points,
      });

      if (ledgerEntry.success) {
        await crud.updateBalance(telemetry.player_id, points);
      }

      return ledgerEntry;
    },
  };
}
```

### Pattern C: Cross-Context Composition

```typescript
// services/finance/index.ts
export interface FinanceService {
  createTransaction(data: CreateFinancialTxnDTO): Promise<ServiceResult<FinancialTxnDTO>>;
  getDailySummary(casinoId: string, gamingDay: string): Promise<ServiceResult<DailySummaryDTO>>;
}

export function createFinanceService(
  supabase: SupabaseClient<Database>
): FinanceService {
  const crud = createFinanceCrud(supabase);
  // Cross-context dependency: need CasinoSettings for gaming day
  const casinoService = createCasinoService(supabase);

  return {
    createTransaction: crud.create,

    getDailySummary: async (casinoId, gamingDay) => {
      // ✅ CORRECT: Use CasinoService for temporal config (DTO propagation)
      const settings = await casinoService.getSettings(casinoId);

      if (!settings.success) {
        return {
          success: false,
          error: { code: 'CASINO_SETTINGS_NOT_FOUND', message: 'Missing casino settings' },
        };
      }

      // Query finance transactions using gaming_day
      return crud.aggregateByGamingDay(casinoId, gamingDay, settings.data);
    },
  };
}
```

---

## 5. Type Safety Requirements

### Rule 1: Explicit Service Interfaces

```typescript
// ✅ CORRECT: Explicit interface
export interface PlayerService {
  create(data: CreatePlayerDTO): Promise<ServiceResult<PlayerDTO>>;
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
}

export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerService {
  // Implementation...
}

// ❌ INCORRECT: Inferred types
export function createPlayerService(supabase: SupabaseClient<Database>) {
  return {
    create: async (data: CreatePlayerDTO) => { /* ... */ },
    getById: async (id: string) => { /* ... */ },
  };
}

// ❌ INCORRECT: ReturnType inference
type PlayerService = ReturnType<typeof createPlayerService>;
```

### Rule 2: Type Supabase Parameter

```typescript
// ✅ CORRECT: Typed Supabase client
export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerService {
  // ...
}

// ❌ INCORRECT: `any` type
export function createPlayerService(supabase: any): PlayerService {
  // ...
}
```

### Rule 3: Avoid Type Casting

```typescript
// ✅ CORRECT: Proper error handling without casting
export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerService {
  return {
    create: async (data: CreatePlayerDTO) => {
      const { data: row, error } = await supabase
        .from('player')
        .insert(data)
        .select(PLAYER_SELECT_MIN)
        .single();

      if (error) {
        // Handle Postgres errors properly
        if ((error as any).code === '23505') {
          return {
            success: false,
            error: { code: 'PLAYER_DUPLICATE', message: 'Player already exists' },
          };
        }
        return {
          success: false,
          error: { code: 'DB_ERROR', message: error.message },
        };
      }

      return { success: true, data: row };
    },
  };
}

// ❌ INCORRECT: Type casting everything
export function createPlayerService(supabase: any): any {
  return {
    create: async (data: any) => {
      const result = await (supabase as any).from('player').insert(data);
      return result as any;
    },
  };
}
```

---

## 6. Edge Integration Pattern

### Server Action Integration

```typescript
// app/actions/player.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { createPlayerService } from "@/services/player";
import { CreatePlayerSchema } from "@/services/player/dto";
import { withServerAction } from "@/lib/http/with-server-action";
import { toServiceHttpResponse } from "@/lib/http/service-response";

export async function createPlayerAction(formData: FormData) {
  const input = Object.fromEntries(formData);

  // Validate at edge
  const parse = CreatePlayerSchema.safeParse(input);
  if (!parse.success) {
    return toServiceHttpResponse({
      ok: false,
      status: 400,
      error: { code: 'VALIDATION_ERROR', issues: parse.error.flatten() },
    });
  }

  // Create service once
  const supabase = await createClient();
  const playerService = createPlayerService(supabase);

  // Wrap in server action context (auth, audit, etc.)
  const envelope = await withServerAction("player.create", async (ctx) => {
    return playerService.create(parse.data);
  });

  return toServiceHttpResponse(envelope);
}
```

### Route Handler Integration

```typescript
// app/api/v1/players/[player_id]/route.ts
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlayerService } from "@/services/player";
import { PlayerDetailParamsSchema } from "@/services/player/dto";
import { toServiceHttpResponse } from "@/lib/http/service-response";

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ player_id: string }> }
) {
  const params = await segmentData.params;

  // Validate params
  const parse = PlayerDetailParamsSchema.safeParse(params);
  if (!parse.success) {
    return toServiceHttpResponse({
      ok: false,
      status: 400,
      error: { code: 'VALIDATION_ERROR', issues: parse.error.flatten() },
    });
  }

  // Create service
  const supabase = await createClient();
  const playerService = createPlayerService(supabase);

  // Execute
  const result = await playerService.getById(parse.data.player_id);

  return toServiceHttpResponse(result);
}
```

---

## 7. Testing Pattern

### Unit Tests (Service Factory)

```typescript
// services/player/__tests__/player.unit.test.ts
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createPlayerService } from "@/services/player";
import type { PlayerService } from "@/services/player"; // Explicit interface

function makeClientDouble(): SupabaseClient<Database> {
  return {
    from: (table: string) => {
      if (table !== 'player') throw new Error('unexpected table');
      return {
        insert: (_: any) => ({
          select: (_sel: string) => ({
            single: async () => ({
              data: { id: 'p1', first_name: 'A', last_name: 'B', phone: null },
              error: null,
            }),
          }),
        }),
      } as any;
    },
  } as SupabaseClient<Database>;
}

describe('PlayerService factory', () => {
  it('wires dependencies and returns typed interface', () => {
    const svc: PlayerService = createPlayerService(makeClientDouble());

    // Service interface is explicit
    expect(svc.create).toBeDefined();
    expect(svc.getById).toBeDefined();
    expect(typeof svc.create).toBe('function');
  });

  it('creates player successfully', async () => {
    const svc = createPlayerService(makeClientDouble());
    const result = await svc.create({
      first_name: 'Alice',
      last_name: 'Smith',
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('p1');
  });
});
```

---

## 8. Over-Engineering Guardrails

Per OVER_ENGINEERING_GUARDRAIL.md, service factories MUST avoid:

### ❌ Premature Abstraction

```typescript
// INCORRECT: Generic service base class with one consumer
abstract class BaseService<T> {
  constructor(protected supabase: SupabaseClient<Database>) {}
  abstract create(data: T): Promise<ServiceResult<T>>;
  // ... generic CRUD methods
}

class PlayerService extends BaseService<PlayerDTO> {
  create(data: PlayerDTO) { /* ... */ }
}

// ✅ CORRECT: Functional factory (extract on 3rd repetition)
export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerService {
  const crud = createPlayerCrud(supabase);
  return { ...crud };
}
```

### ❌ Singleton / Global State

```typescript
// INCORRECT: Global singleton service
let playerServiceInstance: PlayerService | null = null;

export function getPlayerService(): PlayerService {
  if (!playerServiceInstance) {
    const supabase = createClient(); // ❌ Hidden dependency
    playerServiceInstance = createPlayerService(supabase);
  }
  return playerServiceInstance;
}

// ✅ CORRECT: Functional factory (no global state)
export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerService {
  const crud = createPlayerCrud(supabase);
  return { ...crud };
}

// Consumer creates fresh instance per request
export async function playerAction(id: string) {
  const supabase = await createClient(); // Explicit dependency
  const playerService = createPlayerService(supabase);
  return playerService.getById(id);
}
```

---

## 9. Checklist

When creating a new service factory:

- [ ] Define explicit `XService` interface (no `ReturnType<>`)
- [ ] Type `supabase` parameter as `SupabaseClient<Database>`
- [ ] Wire internal modules (crud, business, queries) inside factory
- [ ] Return object matching `XService` interface
- [ ] Keep orchestration inside service (not at edge)
- [ ] Use published DTOs for cross-context dependencies
- [ ] Add unit tests for factory wiring
- [ ] Document service responsibilities in README

---

## 10. References

- **Service Template**: `docs/70-governance/SERVICE_TEMPLATE.md` (lines 112-131)
- **Over-Engineering Guardrail**: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` (lines 36-44, 99-107)
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (lines 56-115, 976-978)
- **DTO Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **Anti-Pattern Table**: SERVICE_TEMPLATE.md (lines 18-40)

---

## 11. Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-17 | Initial specification extracted from SRM and SERVICE_TEMPLATE | System |

---

**End of Document**

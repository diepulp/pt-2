# Anti-Patterns & Violations

**Last Updated**: 2025-10-17
**Source**: Validated architecture audit (100% pattern consistency confirmed)
**Purpose**: Critical violations to avoid - **STOP and ask if you encounter these**

---

## Service Layer Anti-Patterns

### ❌ Type System Violations

**NEVER use `ReturnType` inference**:

```typescript
// ❌ WRONG
export type PlayerService = ReturnType<typeof createPlayerService>;

// ✅ CORRECT
export interface PlayerService {
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
}
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {}
```

**NEVER use `any` typing**:

```typescript
// ❌ WRONG
export function createPlayerService(supabase: any) {}

// ✅ CORRECT
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {}
```

**NEVER use type casting to bypass interfaces**:

```typescript
// ❌ WRONG
return {
  ...service,
  ...(service as any).hiddenMethod,
};

// ✅ CORRECT
// If method exists, declare it in interface
export interface PlayerService {
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  hiddenMethod(): void; // Explicitly declared
}
```

**NEVER use untyped object spread**:

```typescript
// ❌ WRONG
export function createCasinoService(supabase: any) {
  return { ...crud, ...tables }; // No return type
}

// ✅ CORRECT
export interface CasinoService extends CasinoCrudService, CasinoTablesService {
  // Explicit combined interface
}
export function createCasinoService(
  supabase: SupabaseClient<Database>,
): CasinoService {
  return { ...crud, ...tables };
}
```

---

### ❌ Implementation Pattern Violations

**NEVER use class-based services**:

```typescript
// ❌ WRONG
export class PlayerService extends BaseService {
  async getById(id: string) {}
}

// ✅ CORRECT
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {
  return {
    getById: async (id: string) => {},
  };
}
```

**NEVER create ServiceFactory singletons**:

```typescript
// ❌ WRONG
export class ServiceFactory {
  private static instance: ServiceFactory;
  private cache = new Map();

  static getInstance() {
    if (!this.instance) {
      this.instance = new ServiceFactory();
    }
    return this.instance;
  }
}

// ✅ CORRECT
// Create services at call site with explicit dependencies
const playerService = createPlayerService(supabase);
```

**NEVER cache or add state to services**:

```typescript
// ❌ WRONG
let cachedPlayers: Player[] = [];

export function createPlayerService() {
  return {
    getAll: async () => {
      if (cachedPlayers.length) return cachedPlayers;
      // ...
    },
  };
}

// ✅ CORRECT
// Services are pure, stateless factories
// Caching happens in React Query layer
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {
  return {
    getAll: async () => {
      // Direct DB call, no caching
    },
  };
}
```

**NEVER add runtime validation in factory functions**:

```typescript
// ❌ WRONG
export function createPlayerService(supabase: SupabaseClient<Database>) {
  if (!supabase) {
    throw new Error("Supabase client required");
  }
  // ...
}

// ✅ CORRECT
// Validation happens in business layer or dev-only assertions
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {
  // Assume valid dependencies (TypeScript enforces)
  return {
    /* methods */
  };
}
```

---

### ❌ Export Pattern Violations

**NEVER mix default and named exports**:

```typescript
// ❌ WRONG
export default createPlayerService;
export { PlayerService };

// ✅ CORRECT
export { createPlayerService };
export type { PlayerService };
```

**NEVER create zero-value wrapper functions**:

```typescript
// ❌ WRONG
export function createPlayerServices(supabase: SupabaseClient<Database>) {
  return createPlayerService(supabase); // Just aliases
}

// ✅ CORRECT
// Export the actual factory
export { createPlayerService };
```

**NEVER leave deprecated code**:

```typescript
// ❌ WRONG
/** @deprecated Use createPlayerService instead */
export class PlayerService {}

// ✅ CORRECT
// Delete deprecated code entirely
// (Only export current patterns)
export { createPlayerService };
export type { PlayerService };
```

---

### ❌ Service-to-Service Calls

**NEVER call services from other services**:

```typescript
// ❌ WRONG
export function createPlayerService(
  supabase: SupabaseClient<Database>,
  visitService: VisitService, // Service dependency
) {
  return {
    getWithVisits: async (id: string) => {
      const player = await getById(id);
      const visits = await visitService.listByPlayer(id); // ❌
      return { player, visits };
    },
  };
}

// ✅ CORRECT
// Orchestrate in server action or client code
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

### ❌ Boundary & Access Violations

**NEVER join across bounded contexts directly**:

```typescript
// ❌ WRONG
// services/rating-slip/crud.ts
await supabase
  .from("rating_slip")
  .select("*, player:player(*)"); // Cross-context join bypasses published APIs

// ✅ CORRECT
// Consume the other context's published view/service
const ratingSlip = await ratingSlipService.getById(id);
const player = await playerService.getById(ratingSlip.playerId);
return { ratingSlip, player };
```

**NEVER bypass RLS with service-role keys in runtime code**:

```typescript
// ❌ WRONG
const supabase = createClient(process.env.SUPABASE_SERVICE_ROLE_KEY!); // Exposes unrestricted key

// ✅ CORRECT
// Use scoped SSR helpers; runtime always runs under RLS
const supabase = await createServerClient();
```

**NEVER leave tenancy-scoped queries unfiltered**:

```typescript
// ❌ WRONG
await supabase.from("visit").select("*").eq("id", id); // Missing casino scope

// ✅ CORRECT
await supabase
  .from("visit")
  .select(VISIT_SELECT_MIN)
  .eq("id", id)
  .eq("casino_id", casinoId);
```

**NEVER inline raw column lists inside queries**:

```typescript
// ❌ WRONG
await supabase.from("player").select("id, first_name, last_name");

// ✅ CORRECT
// Centralize selects in selects.ts per domain
import { PLAYER_SELECT_MIN } from "./selects";
await supabase.from("player").select(PLAYER_SELECT_MIN);
```

**NEVER invalidate React Query caches from services or server actions**:

```typescript
// ❌ WRONG
export async function createPlayer(/* ... */) {
  const result = await playerService.create(data);
  queryClient.invalidateQueries({ queryKey: playerKeys.root }); // ❌ Service layer touching UI cache
  return result;
}

// ✅ CORRECT
// Services return data; UI/Hooks handle cache updates per ADR-003/004
return withServerAction("player.create", () => playerService.create(data));
```

---

### ❌ Service Contract Violations

**NEVER attach HTTP status codes to `ServiceResult`**:

```typescript
// ❌ WRONG
return {
  success: true,
  status: 201, // HTTP leakage
  data,
};

// ✅ CORRECT
return {
  success: true,
  data,
  error: null,
};
// Map to HTTP in server action / route handler only
```

**NEVER create `services/{domain}/types.ts` junk drawers**:

```typescript
// ❌ WRONG
// services/player/types.ts
export interface PlayerCreatePayload {
  name: string;
}

// ✅ CORRECT
// Keep DTOs in dto.ts derived from canonical Database types
export type PlayerCreateDTO = Pick<
  Database["public"]["Tables"]["player"]["Insert"],
  "name"
>;
```

---

## State Management Anti-Patterns

### ❌ React Query Violations

**NEVER use `staleTime: 0` without justification**:

```typescript
// ❌ WRONG
const { data } = useServiceQuery({
  queryKey: ["player", "detail", id],
  queryFn: () => getPlayer(id),
  staleTime: 0, // Forces refetch on every render
});

// ✅ CORRECT
const { data } = useServiceQuery({
  queryKey: ["player", "detail", id],
  queryFn: () => getPlayer(id),
  staleTime: 5 * 60 * 1000, // 5 minutes (default)
  // OR: Explicit real-time hook with documented strategy
});
```

**NEVER instantiate Supabase clients in hooks**:

```typescript
// ❌ WRONG
export function usePlayer(id: string) {
  const supabase = createBrowserClient(); // ❌
  const playerService = createPlayerService(supabase);

  return useQuery({
    queryKey: ["player", id],
    queryFn: () => playerService.getById(id),
  });
}

// ✅ CORRECT
export function usePlayer(id: string) {
  return useServiceQuery({
    queryKey: ["player", "detail", id],
    queryFn: () => getPlayer(id), // Server action
  });
}
```

---

### ❌ Zustand Violations

**NEVER store server data in Zustand**:

```typescript
// ❌ WRONG
interface PlayerStore {
  players: Player[]; // ❌ Server data
  selectedPlayerId: string | null;
  setPlayers: (players: Player[]) => void;
}

// ✅ CORRECT
interface UIStore {
  selectedPlayerId: string | null; // UI state only
  setSelectedPlayerId: (id: string | null) => void;
}

// Server data lives in React Query:
const { data: players } = usePlayers();
```

**NEVER instantiate Supabase clients in stores**:

```typescript
// ❌ WRONG
interface CasinoStore {
  supabase: SupabaseClient; // ❌
  fetchCasinos: () => Promise<void>;
}

// ✅ CORRECT
// Stores contain NO Supabase clients
// Data fetching happens via server actions → React Query
```

---

## Real-Time Anti-Patterns

**NEVER create global real-time managers**:

```typescript
// ❌ WRONG
// services/real-time/connection-pool.ts
export class RealtimeConnectionPool {
  private static instance: RealtimeConnectionPool;
  private connections = new Map();

  static getInstance() {
    /* singleton */
  }
}

// ✅ CORRECT
// Domain-specific hooks manage their own subscriptions
export function usePlayerRealtime(playerId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`player:${playerId}`)
      .on(
        "postgres_changes",
        {
          /* config */
        },
        (payload) => {
          queryClient.invalidateQueries(["player", "detail", playerId]);
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [playerId]);
}
```

**NEVER skip cleanup on unmount**:

```typescript
// ❌ WRONG
useEffect(() => {
  const channel = supabase.channel("updates").subscribe();
  // No cleanup!
}, []);

// ✅ CORRECT
useEffect(() => {
  const channel = supabase.channel("updates").subscribe();

  return () => {
    channel.unsubscribe(); // Cleanup
  };
}, []);
```

**NEVER trigger refetch storms from realtime handlers**:

```typescript
// ❌ WRONG
channel.on("postgres_changes", () => {
  queryClient.invalidateQueries(); // Blasts every cache on each event
});

// ✅ CORRECT
// Batch updates and scope to active queries
scheduler.enqueue("rating-slip.detail", ratingSlipId, () => {
  queryClient.setQueryData(ratingSlipKeys.detail(ratingSlipId), update);
});
```

---

## Type System Anti-Patterns

> **Canonical Reference**: SLAD §356-490 (DTO Patterns), SRM §57-60 (Pattern Classification)

### DTO Pattern Classification (CRITICAL)

PT-2 uses **three DTO patterns** based on service complexity. Violations depend on which pattern applies:

| Pattern | Services | Manual `interface` | `type` + Pick/Omit | `mappers.ts` Required |
|---------|----------|-------------------|-------------------|----------------------|
| **A (Contract-First)** | Loyalty, Finance, MTL, TableContext | ✅ Allowed | ✅ Allowed | ✅ **REQUIRED** |
| **B (Canonical CRUD)** | Player, Visit, Casino, FloorLayout | ❌ **BANNED** | ✅ Required | ❌ Not needed |
| **C (Hybrid)** | RatingSlip | Per-DTO basis | Per-DTO basis | Optional |

---

**Pattern B Services: NEVER use manual interface DTOs**:

```typescript
// ❌ WRONG (Pattern B: Player, Visit, Casino, FloorLayout)
// services/player/dtos.ts
export interface PlayerCreateDTO {
  id?: string;
  first_name: string;
}

// ✅ CORRECT (Pattern B)
export type PlayerCreateDTO = Pick<
  Database["public"]["Tables"]["player"]["Insert"],
  "first_name"
>;
```

**Pattern A Services: Manual interfaces ARE allowed (with mappers.ts)**:

```typescript
// ✅ CORRECT (Pattern A: Loyalty, Finance, MTL, TableContext)
// services/loyalty/dtos.ts
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
  // Omits: preferences (internal field)
}

// REQUIRED: services/loyalty/mappers.ts
import type { Database } from '@/types/database.types';
type LoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];

export function toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    balance: row.balance,
    tier: row.tier,
    // Explicitly omit: preferences
  };
}
```

**Why the distinction?**
- **Pattern B**: Schema changes should auto-propagate → interfaces cause "schema evolution blindness"
- **Pattern A**: Domain contracts are intentionally decoupled → mappers.ts provides compile-time checkpoint

---

**NEVER create manual type redefinitions outside services**:

```typescript
// ❌ WRONG
// types/player.ts (global types folder)
export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  // ... manually redefining DB schema
}

// ✅ CORRECT
// services/player/dtos.ts (service-owned)
import { Database } from "@/types/database.types";

export type PlayerDTO = Pick<
  Database["public"]["Tables"]["player"]["Row"],
  "id" | "first_name" | "last_name"
>;
```

**NEVER use `Database = any` shims**:

```typescript
// ❌ WRONG
import type { Database } from "./database.types";
export type AnyDatabase = Database & any; // ❌

// ✅ CORRECT
import type { Database } from "./database.types";
// Use Database directly
```

**NEVER skip type regeneration after migrations**:

```bash
# ❌ WRONG
npx supabase migration up
git add supabase/migrations/
git commit -m "Add new column"

# ✅ CORRECT
npx supabase migration up
npm run db:types  # ← Regenerate types
git add supabase/migrations/ types/database.types.ts
git commit -m "Add new column + regenerate types"
```

---

## Architecture & Scope Anti-Patterns

**NEVER introduce generic infrastructure without a second concrete consumer**:

```typescript
// ❌ WRONG
// lib/events/domain-event-bus.ts
export class DomainEventBus {
  private handlers = new Map<string, ((payload: any) => void)[]>();
  publish(event: string, payload: any) {/* ... */}
}

// ✅ CORRECT
// Direct orchestration until a documented trigger justifies abstraction
export async function completeRatingSlip(input: CompleteRatingSlipDTO) {
  const ratingSlip = await ratingSlipService.close(input);
  await loyaltyService.awardPoints(ratingSlip);
  return ratingSlip;
}
```

**NEVER ship non-idempotent writes when a natural key exists**:

```typescript
// ❌ WRONG
await supabase.from("player").insert(data); // Duplicate submits throw hard 23505 errors

// ✅ CORRECT
try {
  await supabase.from("player").insert(data);
} catch (error) {
  if ((error as PostgrestError).code === "23505") {
    return await supabase
      .from("player")
      .select(PLAYER_SELECT_MIN)
      .eq("casino_id", data.casino_id)
      .eq("player_id", data.player_id)
      .single();
  }
  throw error;
}
```

**NEVER maintain dual database clients in application runtime**:

```typescript
// ❌ WRONG
import { createServerClient } from "@/lib/supabase/server";
import { Pool } from "pg";

const supabase = await createServerClient();
const pg = new Pool({ connectionString: process.env.POSTGRES_URL }); // Second unrestricted client

// ✅ CORRECT
// Use the canonical Supabase client factories (server/browser) exclusively under RLS
const supabase = await createServerClient();
```

---

## Migration Anti-Patterns

**NEVER use psql directly**:

```bash
# ❌ WRONG
psql postgres://localhost:54322/postgres -c "ALTER TABLE..."

# ✅ CORRECT
npx supabase migration new add_column
# Edit migration file
npx supabase migration up
```

**NEVER use simplified timestamp patterns**:

```bash
# ❌ WRONG
20251014_add_loyalty_service.sql
20251014000001_add_loyalty_service.sql

# ✅ CORRECT
20251014134942_add_loyalty_service.sql  # Full timestamp
# Use: date +"%Y%m%d%H%M%S"
```

---

## Production Code Anti-Patterns

**NEVER use `console.*` in production**:

```typescript
// ❌ WRONG
export async function createPlayer(data: PlayerCreateDTO) {
  console.log("Creating player:", data); // ❌
  const result = await playerService.create(data);
  console.log("Result:", result); // ❌
  return result;
}

// ✅ CORRECT
export async function createPlayer(data: PlayerCreateDTO) {
  // Use structured logging via telemetry helpers
  return withServerActionWrapper("createPlayer", async () => {
    return playerService.create(data);
  });
}
```

**NEVER import bulk libraries**:

```typescript
// ❌ WRONG
import * as Icons from "@heroicons/react"; // Entire lib

// ✅ CORRECT
import { CheckIcon } from "@heroicons/react/24/solid"; // Specific icon
```

---

## Violation Response Protocol

### If you encounter an anti-pattern:

1. **STOP** - Do not proceed with implementation
2. **Identify** - Match violation to this list
3. **Reference** - Link to specific anti-pattern section
4. **Ask** - Request clarification if needed
5. **Correct** - Apply the ✅ CORRECT pattern

### If unsure:

- Reference: `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md` §4
- Reference: `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- Ask user for architectural review

---

## Quick Checklist

Before committing code, verify:

### Service Layer
- [ ] No `ReturnType` inference in service exports
- [ ] No `any` typing on supabase parameters
- [ ] No class-based services (`export class.*Service`)
- [ ] No ServiceFactory singletons
- [ ] No global state in services
- [ ] No service-to-service calls

### DTO Patterns (Pattern-Aware)
- [ ] **Pattern B services** (Player, Visit, Casino, FloorLayout): No `export interface.*DTO`
- [ ] **Pattern A services** (Loyalty, Finance, MTL, TableContext): Has `mappers.ts` if using DTOs
- [ ] No manual type redefinitions in `types/` folder (DTOs belong in `services/{domain}/dtos.ts`)

### State & Real-time
- [ ] No server data in Zustand
- [ ] No `staleTime: 0` without justification
- [ ] No Supabase clients in hooks/stores
- [ ] No global real-time managers

### RPC-Managed Tables (Direct Insert Banned)
- [ ] No `.from('player_financial_transaction').insert()` - use RPC
- [ ] No `.from('loyalty_ledger').insert()` without idempotency
- [ ] No `.from('mtl_entry').insert()` without idempotency

### General
- [ ] No `console.*` in production paths
- [ ] Named exports only (no default)
- [ ] Types regenerated if schema changed (`npm run db:types`)

---

**Version**: 1.1.0
**Date**: 2025-11-26
**Lines**: ~550
**Severity**: **CRITICAL** - Violations block PR approval
**Auto-Load**: Loads with `.claude/config.yml`

### Change Log
- **v1.1.0 (2025-11-26)**: Added pattern-aware DTO rules (SLAD §356-490 alignment), expanded RPC-managed table list, updated checklist with pattern classification

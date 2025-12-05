# Anti-Patterns & Violations

**Last Updated**: 2025-12-05
**Source**: Validated architecture audit + ADR-014 alignment
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

### ❌ Domain Error Anti-Patterns

> **Canonical Reference**: SRM § Error Taxonomy, `lib/errors/domain-errors.ts`

**NEVER let raw Postgres errors leak to callers**:

```typescript
// ❌ WRONG
export async function createPlayer(data: PlayerCreateDTO) {
  const { data: result, error } = await supabase.from("player").insert(data);
  if (error) {
    throw error; // Raw Postgres error leaks: "23505: duplicate key violation"
  }
  return result;
}

// ✅ CORRECT
import { DomainError } from "@/lib/errors/domain-errors";

function mapDatabaseError(error: { code?: string; message: string }): DomainError {
  if (error.code === "23505") {
    return new DomainError("PLAYER_ALREADY_EXISTS", "Player already exists");
  }
  if (error.code === "23503") {
    return new DomainError("PLAYER_NOT_FOUND", "Referenced player not found");
  }
  return new DomainError("INTERNAL_ERROR", error.message);
}

export async function createPlayer(data: PlayerCreateDTO) {
  const { data: result, error } = await supabase.from("player").insert(data);
  if (error) throw mapDatabaseError(error);
  return result;
}
```

**NEVER return generic error messages for known domain violations**:

```typescript
// ❌ WRONG
if (!visit) {
  throw new Error("Not found"); // Generic, no domain context
}

// ✅ CORRECT
if (!visit) {
  throw new DomainError("VISIT_NOT_FOUND", `Visit not found: ${visitId}`);
}
```

**Domain Error Codes by Service** (from SRM § Error Taxonomy):
- **Visit**: `VISIT_NOT_FOUND`, `VISIT_NOT_OPEN`, `VISIT_ALREADY_CLOSED`, `VISIT_PLAYER_MISMATCH`
- **Player**: `PLAYER_NOT_FOUND`, `PLAYER_ALREADY_EXISTS`, `PLAYER_NOT_ENROLLED`
- **Table**: `TABLE_NOT_FOUND`, `TABLE_NOT_ACTIVE`, `TABLE_SETTINGS_INVALID`
- **Loyalty**: `INSUFFICIENT_BALANCE`, `REWARD_ALREADY_ISSUED`, `LOYALTY_POLICY_VIOLATION`
- **Finance**: `TRANSACTION_ALREADY_PROCESSED`, `TRANSACTION_AMOUNT_INVALID`

---

### ❌ RLS & Security Anti-Patterns

> **Canonical Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md`, SRM § Security & Tenancy

**NEVER use complex OR trees in RLS policies**:

```sql
-- ❌ WRONG: 6-way OR with nested conditions (hard to audit)
CREATE POLICY "visit_access" ON visit FOR SELECT USING (
  (auth.jwt() ->> 'casino_id')::uuid = casino_id
  OR auth.jwt() ->> 'role' = 'admin'
  OR auth.jwt() ->> 'permissions' @> '["global.read"]'
);

-- ✅ CORRECT: Single deterministic path via current_setting()
CREATE POLICY "visit_read_same_casino" ON visit FOR SELECT USING (
  auth.uid() = (SELECT user_id FROM staff WHERE id = current_setting('app.actor_id')::uuid)
  AND casino_id = current_setting('app.casino_id')::uuid
);
```

**NEVER skip RLS context injection in server actions**:

```typescript
// ❌ WRONG
export async function getVisit(visitId: string) {
  const supabase = await createServerClient();
  return supabase.from("visit").select("*").eq("id", visitId).single();
  // Missing: app.casino_id not set, RLS may fail or leak data
}

// ✅ CORRECT
export async function getVisit(visitId: string) {
  return withServerAction("visit.get", async (supabase, context) => {
    // withServerAction injects: SET LOCAL app.casino_id, app.actor_id
    return supabase.from("visit").select(VISIT_SELECT).eq("id", visitId).single();
  });
}
```

**NEVER use service-role key in application runtime**:

```typescript
// ❌ WRONG
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
await supabase.from("visit").select("*"); // Reads ALL casinos!

// ✅ CORRECT
const supabase = await createServerClient(); // Anon key + user context
// RLS enforces casino scoping automatically
```

---

### ❌ Visit Domain Anti-Patterns (ADR-014)

> **Canonical Reference**: `docs/80-adrs/ADR-014-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md`

**NEVER represent ghost gaming with visit_id = NULL**:

```typescript
// ❌ WRONG
// Ghost gaming represented by missing visit
await supabase.from("rating_slip").insert({
  visit_id: null, // ❌ Floating slip with no visit anchor
  table_id: tableId,
  // ...
});

// ✅ CORRECT
// Ghost gaming is a visit with player_id = NULL and visit_kind = 'gaming_ghost_unrated'
const { data: ghostVisit } = await supabase.from("visit").insert({
  casino_id: casinoId,
  player_id: null, // Ghost = no player
  visit_kind: 'gaming_ghost_unrated',
}).select().single();

await supabase.from("rating_slip").insert({
  visit_id: ghostVisit.id, // ✅ All slips have visit anchor
  table_id: tableId,
});
```

**NEVER accrue loyalty for ghost visits**:

```typescript
// ❌ WRONG
export async function awardPoints(visit: VisitDTO, points: number) {
  // Blindly awards points regardless of visit_kind
  await loyaltyService.addPoints(visit.player_id, points);
}

// ✅ CORRECT
export async function awardPoints(visit: VisitDTO, points: number) {
  // Only gaming_identified_rated visits accrue loyalty
  if (visit.visit_kind !== 'gaming_identified_rated') {
    throw new DomainError("LOYALTY_POLICY_VIOLATION",
      "Loyalty accrual only for identified rated visits");
  }
  await loyaltyService.addPoints(visit.player_id!, points);
}
```

**Visit Kind Archetypes** (must enforce):

| `visit_kind` | `player_id` | Gaming | Loyalty |
|--------------|-------------|--------|---------|
| `reward_identified` | NOT NULL | No | Redemptions only |
| `gaming_identified_rated` | NOT NULL | Yes | Accrual eligible |
| `gaming_ghost_unrated` | NULL | Yes | Compliance only |

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

- Reference: `docs/SDLC_DOCS_TAXONOMY.md` for documentation navigation
- Reference: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- Reference: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` § Error Taxonomy
- Reference: `docs/30-security/SEC-001-rls-policy-matrix.md` for RLS templates
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

### Domain Errors (NEW)
- [ ] No raw Postgres errors leaking to callers (use `DomainError`)
- [ ] Error codes follow SRM § Error Taxonomy naming (`*_NOT_FOUND`, `*_INVALID`, etc.)
- [ ] All services have `mapDatabaseError()` function

### RLS & Security (NEW)
- [ ] No complex OR trees in RLS policies (use `current_setting()` pattern)
- [ ] Server actions use `withServerAction()` for RLS context injection
- [ ] No service-role key in application runtime
- [ ] All user-facing tables have casino-scoped RLS policies

### Visit Domain (ADR-014)
- [ ] Ghost visits have `player_id = NULL` (not `visit_id = NULL`)
- [ ] All rating slips have `visit_id NOT NULL`
- [ ] Loyalty accrual only for `gaming_identified_rated` visits
- [ ] `visit_kind` validated before gaming/loyalty operations

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

**Version**: 1.2.0
**Date**: 2025-12-05
**Lines**: ~750
**Severity**: **CRITICAL** - Violations block PR approval
**Auto-Load**: Loads with `.claude/config.yml`

### Change Log
- **v1.2.0 (2025-12-05)**: Added Domain Error Anti-Patterns (SRM § Error Taxonomy), RLS & Security Anti-Patterns (SEC-001), Visit Domain Anti-Patterns (ADR-014 ghost visits, visit_kind archetypes), updated references to current docs/ paths, expanded Quick Checklist with new sections
- **v1.1.0 (2025-11-26)**: Added pattern-aware DTO rules (SLAD §356-490 alignment), expanded RPC-managed table list, updated checklist with pattern classification

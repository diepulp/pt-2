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

---

## Type System Anti-Patterns

**NEVER create manual type redefinitions**:

```typescript
// ❌ WRONG
// types/player.ts
export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  // ... manually redefining DB schema
}

// ✅ CORRECT
// types/dto/player.ts
import { Database } from "../database.types";

export type PlayerDTO = Pick<
  Database["public"]["Tables"]["player"]["Row"],
  "id" | "firstName" | "lastName"
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

- [ ] No `ReturnType` inference in service exports
- [ ] No `any` typing on supabase parameters
- [ ] No class-based services
- [ ] No ServiceFactory singletons
- [ ] No global state in services
- [ ] No service-to-service calls
- [ ] No server data in Zustand
- [ ] No `staleTime: 0` without justification
- [ ] No Supabase clients in hooks/stores
- [ ] No global real-time managers
- [ ] No manual type redefinitions
- [ ] No `console.*` in production paths
- [ ] Named exports only (no default)
- [ ] Types regenerated if schema changed

---

**Version**: 1.0.0
**Lines**: ~450
**Severity**: **CRITICAL** - Violations block PR approval
**Auto-Load**: Loads with `.claude/config.yml`

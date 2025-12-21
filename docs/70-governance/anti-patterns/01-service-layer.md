# Service Layer Anti-Patterns

**Target Agents**: `backend-developer`, `backend-service-builder`, `pt2-service-implementer`
**Severity**: CRITICAL - Violations block PR approval

---

## Type System Violations

### ❌ NEVER use `ReturnType` inference

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

### ❌ NEVER use `any` typing

```typescript
// ❌ WRONG
export function createPlayerService(supabase: any) {}

// ✅ CORRECT
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {}
```

### ❌ NEVER use type casting to bypass interfaces

```typescript
// ❌ WRONG
return {
  ...service,
  ...(service as any).hiddenMethod,
};

// ✅ CORRECT
export interface PlayerService {
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  hiddenMethod(): void; // Explicitly declared
}
```

### ❌ NEVER use untyped object spread

```typescript
// ❌ WRONG
export function createCasinoService(supabase: any) {
  return { ...crud, ...tables }; // No return type
}

// ✅ CORRECT
export interface CasinoService extends CasinoCrudService, CasinoTablesService {}
export function createCasinoService(
  supabase: SupabaseClient<Database>,
): CasinoService {
  return { ...crud, ...tables };
}
```

---

## Implementation Pattern Violations

### ❌ NEVER use class-based services

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

### ❌ NEVER create ServiceFactory singletons

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
const playerService = createPlayerService(supabase);
```

### ❌ NEVER cache or add state to services

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

### ❌ NEVER add runtime validation in factory functions

```typescript
// ❌ WRONG
export function createPlayerService(supabase: SupabaseClient<Database>) {
  if (!supabase) {
    throw new Error("Supabase client required");
  }
}

// ✅ CORRECT
// Validation happens in business layer or dev-only assertions
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {
  // Assume valid dependencies (TypeScript enforces)
  return { /* methods */ };
}
```

---

## Export Pattern Violations

### ❌ NEVER mix default and named exports

```typescript
// ❌ WRONG
export default createPlayerService;
export { PlayerService };

// ✅ CORRECT
export { createPlayerService };
export type { PlayerService };
```

### ❌ NEVER create zero-value wrapper functions

```typescript
// ❌ WRONG
export function createPlayerServices(supabase: SupabaseClient<Database>) {
  return createPlayerService(supabase); // Just aliases
}

// ✅ CORRECT
export { createPlayerService };
```

### ❌ NEVER leave deprecated code

```typescript
// ❌ WRONG
/** @deprecated Use createPlayerService instead */
export class PlayerService {}

// ✅ CORRECT
// Delete deprecated code entirely
export { createPlayerService };
export type { PlayerService };
```

---

## Service-to-Service Calls

### ❌ NEVER call services from other services

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
// Orchestrate in server action or route handler
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

## Boundary & Access Violations

### ❌ NEVER join across bounded contexts directly

```typescript
// ❌ WRONG
await supabase
  .from("rating_slip")
  .select("*, player:player(*)"); // Cross-context join

// ✅ CORRECT
const ratingSlip = await ratingSlipService.getById(id);
const player = await playerService.getById(ratingSlip.playerId);
return { ratingSlip, player };
```

### ❌ NEVER leave tenancy-scoped queries unfiltered

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

### ❌ NEVER inline raw column lists inside queries

```typescript
// ❌ WRONG
await supabase.from("player").select("id, first_name, last_name");

// ✅ CORRECT
import { PLAYER_SELECT_MIN } from "./selects";
await supabase.from("player").select(PLAYER_SELECT_MIN);
```

### ❌ NEVER invalidate React Query caches from services

```typescript
// ❌ WRONG
export async function createPlayer(/* ... */) {
  const result = await playerService.create(data);
  queryClient.invalidateQueries({ queryKey: playerKeys.root }); // ❌
  return result;
}

// ✅ CORRECT
// Services return data; UI/Hooks handle cache updates
return withServerAction("player.create", () => playerService.create(data));
```

---

## Service Contract Violations

### ❌ NEVER attach HTTP status codes to `ServiceResult`

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
// Map to HTTP in route handler only
```

### ❌ NEVER create `services/{domain}/types.ts` junk drawers

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

## Domain Error Anti-Patterns

> **Reference**: SRM § Error Taxonomy, `lib/errors/domain-errors.ts`

### ❌ NEVER let raw Postgres errors leak to callers

```typescript
// ❌ WRONG
export async function createPlayer(data: PlayerCreateDTO) {
  const { data: result, error } = await supabase.from("player").insert(data);
  if (error) {
    throw error; // Raw: "23505: duplicate key violation"
  }
  return result;
}

// ✅ CORRECT
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

### ❌ NEVER return generic error messages

```typescript
// ❌ WRONG
if (!visit) {
  throw new Error("Not found");
}

// ✅ CORRECT
if (!visit) {
  throw new DomainError("VISIT_NOT_FOUND", `Visit not found: ${visitId}`);
}
```

### Domain Error Codes by Service

- **Visit**: `VISIT_NOT_FOUND`, `VISIT_NOT_OPEN`, `VISIT_ALREADY_CLOSED`
- **Player**: `PLAYER_NOT_FOUND`, `PLAYER_ALREADY_EXISTS`, `PLAYER_NOT_ENROLLED`
- **Table**: `TABLE_NOT_FOUND`, `TABLE_NOT_ACTIVE`, `TABLE_SETTINGS_INVALID`
- **Loyalty**: `INSUFFICIENT_BALANCE`, `REWARD_ALREADY_ISSUED`
- **Finance**: `TRANSACTION_ALREADY_PROCESSED`, `TRANSACTION_AMOUNT_INVALID`

---

## Quick Checklist

- [ ] No `ReturnType` inference in service exports
- [ ] No `any` typing on supabase parameters
- [ ] No class-based services (`export class.*Service`)
- [ ] No ServiceFactory singletons
- [ ] No global state in services
- [ ] No service-to-service calls
- [ ] No raw Postgres errors leaking (use `DomainError`)
- [ ] All services have `mapDatabaseError()` function

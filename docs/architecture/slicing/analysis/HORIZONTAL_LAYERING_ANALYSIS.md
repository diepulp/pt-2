# Feature-Based Horizontal Layering Analysis for PT-2

> **Date**: 2025-10-09
> **Status**: Architecture Recommendation
> **Purpose**: Define horizontal layer structure, responsibilities, sequencing strategy, and cross-layer communication patterns
> **Scope**: PT-2 Casino Tracker application architecture

---

## Executive Summary

**Recommendation**: Adopt a **4-layer horizontal architecture** with **bottom-up implementation** and **domain-driven vertical slicing**.

**Key Insight**: PT-2's functional service pattern already aligns with horizontal layering principles. This document formalizes layer boundaries, sequencing strategy, and cross-layer communication to maximize reusability while maintaining bounded context integrity.

**Critical Decision**: Implement **feature-complete vertical slices** (Database → Service → Action → UI) per domain before expanding horizontally across domains. This balances architectural consistency with rapid delivery while preventing over-engineering.

**Architecture Score**: PT-1 achieved 90/100 with functional services; PT-2 targets 95/100 by eliminating anti-patterns and formalizing layer contracts.

---

## 1. Layer Definition & Responsibilities

### 1.1 Four-Layer Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     UI LAYER (Client)                        │
│  React Components • Hooks • UI State • Real-time Sync       │
│  Responsibility: Rendering, interaction, optimistic updates │
└───────────────────────────┬─────────────────────────────────┘
                            │ Server Actions
┌───────────────────────────▼─────────────────────────────────┐
│                  ACTION LAYER (Server)                       │
│  Server Actions • Orchestration • Cache • Authorization     │
│  Responsibility: Coordination, invalidation, auth checks    │
└───────────────────────────┬─────────────────────────────────┘
                            │ Service Factories
┌───────────────────────────▼─────────────────────────────────┐
│                  SERVICE LAYER (Business)                    │
│  CRUD • Business • Queries • Transforms • Validation        │
│  Responsibility: Domain logic, DTOs, error handling         │
└───────────────────────────┬─────────────────────────────────┘
                            │ Supabase Client
┌───────────────────────────▼─────────────────────────────────┐
│                   DATA LAYER (Database)                      │
│  PostgreSQL • RLS Policies • Triggers • Real-time           │
│  Responsibility: Schema enforcement, persistence, security  │
└─────────────────────────────────────────────────────────────┘
```

**Dependency Flow**: Strictly top-down (UI → Action → Service → Data)

---

### 1.2 Layer Responsibility Matrix

| Layer | Primary Responsibility | Owns | Does NOT Own | Key Files |
|-------|------------------------|------|--------------|-----------|
| **Data Layer** | Schema enforcement, persistence, security | • Schema definitions<br>• RLS policies<br>• Database triggers<br>• Type generation (`database.types.ts`)<br>• Connection management | • Business logic<br>• Validation rules<br>• DTO transformation<br>• API contracts | `database.types.ts`<br>`supabase/migrations/*.sql`<br>`lib/supabase/client.ts`<br>`lib/supabase/server.ts` |
| **Service Layer** | Business logic, domain operations, data transformation | • Domain DTOs<br>• Business rules<br>• CRUD operations<br>• Data transformations<br>• Schema validation (Zod)<br>• Error handling<br>• ServiceResult contracts | • HTTP routing<br>• Cache invalidation<br>• UI state<br>• Database schema<br>• Client instantiation | `services/player/crud.ts`<br>`services/player/business.ts`<br>`services/shared/operation-wrapper.ts`<br>`services/shared/types.ts` |
| **Action Layer** | Server-side orchestration, cache management | • Service orchestration<br>• Cache strategies (revalidatePath/Tag)<br>• Authorization checks<br>• Action-level logging<br>• Input sanitization | • Business logic<br>• Database access<br>• UI rendering<br>• Client-side state<br>• Real-time subscriptions | `app/actions/player/create-player-action.ts`<br>`app/actions/visit/start-visit-action.ts`<br>`middleware.ts` |
| **UI Layer** | Rendering, user interaction, client state | • Component composition<br>• UI state (Zustand)<br>• React Query hooks<br>• User input handling<br>• Optimistic updates<br>• Real-time UI sync | • Server actions<br>• Business logic<br>• Database access<br>• Validation (delegates to service) | `app/players/page.tsx`<br>`components/player-list.tsx`<br>`hooks/use-players.ts`<br>`store/ui-store.ts` |

---

### 1.3 Cross-Layer Communication Rules

**Allowed Dependencies** (Top-Down Only):

```typescript
✅ UI Layer     → Action Layer    (Server Actions via React Query)
✅ Action Layer → Service Layer   (Service factory instantiation)
✅ Service Layer → Data Layer     (Typed Supabase client)
```

**Forbidden Dependencies**:

```typescript
❌ Service Layer → Action Layer   (Services never call actions)
❌ Service Layer → UI Layer       (Services never import React/UI)
❌ Data Layer    → Service Layer  (No circular dependencies)
❌ UI Layer      → Service Layer  (Must go through Action layer)
❌ UI Layer      → Data Layer     (No direct Supabase client in components)
```

**Communication Patterns**:

1. **UI → Action**: React Query mutations calling server actions
   ```typescript
   // hooks/use-create-player.ts
   import { useMutation } from '@tanstack/react-query';
   import { createPlayerAction } from '@/app/actions/player/create-player-action';

   export function useCreatePlayer() {
     return useMutation({
       mutationFn: createPlayerAction,
       onSuccess: () => queryClient.invalidateQueries(['players'])
     });
   }
   ```

2. **Action → Service**: Dependency injection via factory
   ```typescript
   // app/actions/player/create-player-action.ts
   export async function createPlayerAction(input: CreatePlayerInput) {
     const supabase = await createServerClient();
     const playerService = createPlayerService(supabase); // DI
     return playerService.create(input);
   }
   ```

3. **Service → Data**: Typed database access
   ```typescript
   // services/player/crud.ts
   export function createPlayerCrudService(
     supabase: SupabaseClient<Database>
   ) {
     return {
       create: async (data) => {
         const { data: player, error } = await supabase
           .from('player')
           .insert(data)
           .select()
           .single();
       }
     };
   }
   ```

---

## 2. Cross-Cutting Concerns by Layer

### 2.1 Validation Strategy (Multi-Layer Defense)

**Principle**: Validate at every boundary for security and UX

| Layer | Validation Type | Tool | Example |
|-------|-----------------|------|---------|
| **Data Layer** | Schema constraints | PostgreSQL CHECK, NOT NULL, FK | `CHECK (email ~* '^[A-Za-z0-9._%+-]+@')` |
| **Service Layer** | Business rules | Zod schemas | `playerCreateSchema.parse(data)` |
| **Action Layer** | Input sanitization | Zod + custom validators | `sanitizeInput(actionInput)` |
| **UI Layer** | UX validation | React Hook Form + Zod | `useForm({ resolver: zodResolver(schema) })` |

**Example: Player Email Validation Across Layers**:

```typescript
// 1. Data Layer: supabase/migrations/xxx_create_player.sql
CREATE TABLE player (
  email TEXT NOT NULL UNIQUE
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}$')
);

// 2. Service Layer: services/player/validation.ts
export const playerCreateSchema = z.object({
  email: z.string().email("Invalid email format"),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

// 3. Action Layer: app/actions/player/create-player-action.ts
export async function createPlayerAction(input: CreatePlayerInput) {
  const sanitized = sanitizeInput(input); // Additional server checks
  const supabase = await createServerClient();
  const playerService = createPlayerService(supabase);
  return playerService.create(sanitized);
}

// 4. UI Layer: components/player-form.tsx
const form = useForm({
  resolver: zodResolver(playerCreateSchema),
  defaultValues: { email: '', firstName: '', lastName: '' }
});
```

**Benefits**:
- Database layer prevents corrupt data at persistence
- Service layer enforces business rules consistently
- Action layer adds server-side security checks
- UI layer provides immediate user feedback

---

### 2.2 Error Handling Strategy (Error Transformation Pipeline)

**Principle**: Transform errors as they bubble up layers

```
[Database Error: PostgreSQL Code 23505]
         ↓ Map to domain error
[Service Error: DUPLICATE_EMAIL with ServiceResult]
         ↓ Pass through or enhance
[Action Error: Return ServiceResult to client]
         ↓ Transform to user-friendly
[UI Error: Display toast "Email already exists"]
```

**Example: Error Transformation Across Layers**:

```typescript
// 1. Data Layer: PostgreSQL unique violation (code 23505)

// 2. Service Layer: Map to domain error
// services/player/crud.ts
if (error.code === '23505') {
  throw {
    code: 'DUPLICATE_EMAIL',
    message: 'A player with this email already exists',
    details: error
  };
}
// Wrapped in ServiceResult
return {
  data: null,
  error: { code: 'DUPLICATE_EMAIL', message: '...' },
  success: false,
  status: 400
};

// 3. Action Layer: Pass through with logging
// app/actions/player/create-player-action.ts
const result = await playerService.create(input);
if (!result.success) {
  logger.warn('Player creation failed', { error: result.error });
}
return result;

// 4. UI Layer: User-friendly display
// components/player-form.tsx
const { mutate, error } = useCreatePlayer();
if (error?.code === 'DUPLICATE_EMAIL') {
  toast.error('This email is already registered');
  form.setError('email', { message: 'Email already exists' });
}
```

**Error Catalog Pattern** (Service Layer):

```typescript
// services/player/types.ts
export enum PlayerServiceError {
  DUPLICATE_EMAIL = 'DUPLICATE_EMAIL',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHORIZED = 'UNAUTHORIZED'
}

// Map PostgreSQL errors to domain errors
const ERROR_MAP: Record<string, PlayerServiceError> = {
  '23505': PlayerServiceError.DUPLICATE_EMAIL,
  '23503': PlayerServiceError.NOT_FOUND,
};
```

---

### 2.3 Data Transformation Strategy

**Principle**: Transform data shape at layer boundaries

| Transformation | From | To | Layer | Tool |
|----------------|------|----|----|------|
| **Database Row → DTO** | `Database["public"]["Tables"]["player"]["Row"]` | `PlayerDTO` | Service (Transform module) | `toPlayerDTO()` |
| **DTO → View Model** | `PlayerDTO` | `PlayerViewModel` | Action or UI | `toPlayerViewModel()` |
| **Form Input → Action Input** | `FormData` | `CreatePlayerInput` | UI | `parseFormData()` |
| **Action Input → Service DTO** | `CreatePlayerInput` | `PlayerCreateDTO` | Action | Direct mapping |

**Example: Player Data Transformation Pipeline**:

```typescript
// 1. Data Layer: Raw database row
type PlayerRow = Database["public"]["Tables"]["player"]["Row"];
// { id, email, firstName, lastName, createdAt, updatedAt, metadata, ... }

// 2. Service Layer: Domain DTO
// services/player/transforms.ts
export type PlayerDTO = Pick<PlayerRow, "id" | "email" | "firstName" | "lastName">;

export function toPlayerDTO(row: PlayerRow): PlayerDTO {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
  };
}

// 3. Action Layer: Action response
// app/actions/player/create-player-action.ts
export interface CreatePlayerResult {
  data: PlayerDTO | null;
  error: ServiceError | null;
  success: boolean;
}

// 4. UI Layer: View model for display
// hooks/use-player-view-model.ts
export interface PlayerViewModel {
  id: string;
  fullName: string;      // Computed: firstName + lastName
  emailDisplay: string;  // Formatted for display
}

export function toPlayerViewModel(dto: PlayerDTO): PlayerViewModel {
  return {
    id: dto.id,
    fullName: `${dto.firstName} ${dto.lastName}`,
    emailDisplay: dto.email.toLowerCase(),
  };
}
```

---

## 3. Implementation Sequencing Strategy

### 3.1 Recommended Approach: **Bottom-Up with Vertical Slicing**

**Rationale**:
1. **Foundation First**: Data layer provides schema stability before building services
2. **Testability**: Each layer can be tested in isolation as it's built
3. **Dependency Clarity**: Higher layers naturally depend on completed lower layers
4. **Iterative Delivery**: Complete vertical slices deliver working features

**Sequencing Pattern** (Per Domain):

```
Phase 1: Data Layer (1 day)
├─ Write migration (schema, RLS, triggers)
├─ Generate types (npm run gen:types)
├─ Test schema (constraints, policies)
├─ Verify RLS enforcement
└─ Deploy to remote (supabase db push)

Phase 2: Service Layer (2 days)
├─ CRUD module (Day 1 morning)
├─ Business module (Day 1 afternoon)
├─ Queries module (Day 2 morning)
├─ Transforms module (Day 2 morning)
├─ Validation module (Day 2 morning)
├─ Unit tests (Day 2 afternoon)
├─ Integration tests (Day 2 afternoon)
└─ Code review + commit

Phase 3: Action Layer (1 day)
├─ Server actions (morning)
├─ Cache strategies (afternoon)
├─ Authorization middleware (afternoon)
├─ Action integration tests (afternoon)
└─ Commit

Phase 4: UI Layer (2 days)
├─ React Query hooks (Day 1 morning)
├─ Components (Day 1 afternoon)
├─ Forms + validation (Day 2 morning)
├─ Real-time integration (Day 2 afternoon)
├─ E2E tests (Day 2 afternoon)
└─ Commit + demo

Total: 6 days per domain (feature-complete vertical slice)
```

**Workflow Example** (Player Management):

```bash
# Day 1: Data Layer
$ supabase migration new create_player
# Edit migration file
$ supabase db push
$ npm run gen:types
$ git commit -m "feat(player): data layer migration + types"

# Day 2-3: Service Layer
$ mkdir -p services/player
# Create: index.ts, crud.ts, business.ts, queries.ts, transforms.ts, validation.ts
$ npm test -- __tests__/services/player
$ git commit -m "feat(player): service layer implementation"

# Day 4: Action Layer
$ mkdir -p app/actions/player
# Create: create-player-action.ts, update-player-action.ts, etc.
$ npm test -- __tests__/actions/player
$ git commit -m "feat(player): action layer + cache strategies"

# Day 5-6: UI Layer
$ mkdir -p hooks/player components/player
# Create: hooks, components, forms, real-time sync
$ npm run cypress:run
$ git commit -m "feat(player): UI layer + E2E tests"
```

---

### 3.2 Alternative Approaches (Context-Dependent)

#### **Top-Down** (NOT Recommended for PT-2)

**Why Not?**
- UI layer has no data to render without services
- Requires extensive mocking/stubbing
- High rework risk when lower layers change
- Difficult to test in isolation

**Only Use When**:
- Prototyping UI/UX with fake data
- Validating user workflows before implementation
- Exploratory design sessions with stakeholders

---

#### **Middle-Out (Service-First)** (Conditional Use)

**Sequence**:
```
1. Service Layer (2 days) - Define DTOs and operations
2. Data Layer (1 day) - Implement schema to match DTOs
3. Action Layer (1 day) - Wire services to server actions
4. UI Layer (2 days) - Build on stable contracts
```

**When to Use**:
- Schema is unstable/unknown (greenfield projects)
- API contracts need exploration before database design
- Domain modeling requires iteration

**Risks**:
- Service DTOs may not align with optimal database schema
- Potential for over-engineering without database constraints
- Rework if database enforces different structure (foreign keys, constraints)

**PT-2 Decision**: **Avoid middle-out** - schema is well-defined in PRD and migrations

---

### 3.3 PT-2 Current Status (Phase 2 Assessment)

**Implemented Domains** (Bottom-Up Completed):

| Domain | Data Layer | Service Layer | Action Layer | UI Layer | Status |
|--------|------------|---------------|--------------|----------|--------|
| Player | ✅ | ✅ (CRUD only) | ⏳ | ⏳ | 50% |
| Visit | ✅ | ✅ (CRUD only) | ⏳ | ⏳ | 50% |
| RatingSlip | ✅ | ✅ (CRUD only) | ⏳ | ⏳ | 50% |
| PlayerFinancial | ✅ | ✅ (CRUD only) | ⏳ | ⏳ | 50% |
| Casino | ✅ | ✅ (CRUD only) | ⏳ | ⏳ | 50% |
| TableContext | ✅ | ✅ (CRUD + Settings) | ⏳ | ⏳ | 50% |
| MTL | ✅ | ✅ (CRUD + Queries) | ⏳ | ⏳ | 50% |

**Next Steps**:
1. Complete Service Layer modules (Business, Queries, Transforms, Validation) for all domains
2. Implement Action Layer for MVP features (Player CRUD, Visit lifecycle, Rating slip creation)
3. Build UI Layer for first vertical slice (Player Management)
4. Add real-time integration hooks per domain

---

## 4. Shared Infrastructure & Reusability

### 4.1 Horizontal Reusability Matrix

| Component | Layer | Reusable Across Domains | Implementation | Example Files |
|-----------|-------|-------------------------|----------------|---------------|
| **Operation Wrapper** | Service | ✅ All services | Single shared implementation | `services/shared/operation-wrapper.ts` |
| **ServiceResult Type** | Service | ✅ All services | Single type definition | `services/shared/types.ts` |
| **Error Handling** | Service | ✅ All services | Shared wrapper function | `services/shared/operation-wrapper.ts` |
| **Validation Patterns** | Service | ⚠️ Shared pattern, domain schemas | Reusable Zod patterns | `services/*/validation.ts` |
| **DTO Transformations** | Service | ❌ Domain-specific | Unique per domain | `services/*/transforms.ts` |
| **Supabase Client** | Data | ✅ All layers | Singleton factories | `lib/supabase/client.ts`, `lib/supabase/server.ts` |
| **React Query Config** | UI | ✅ All hooks | Global config | `lib/query-client.ts` |
| **Server Action Wrapper** | Action | ✅ All actions | Shared wrapper | `lib/with-server-action-wrapper.ts` (future) |
| **Cache Strategies** | Action | ⚠️ Shared patterns | Domain-specific invalidation | `app/actions/*/invalidation-helpers.ts` |

**Legend**:
- ✅ Fully reusable - single shared implementation
- ⚠️ Pattern reusable - domain-specific instances
- ❌ Domain-specific - not reusable

---

### 4.2 Shared Infrastructure Implementation

```typescript
// ============================================
// ✅ SHARED: Universal error handling
// ============================================
// services/shared/operation-wrapper.ts
export async function executeOperation<T>(
  label: string,
  operation: () => Promise<T>,
  options?: OperationOptions
): Promise<ServiceResult<T>> {
  const requestId = generateRequestId();
  try {
    const data = await operation();
    return {
      data,
      error: null,
      success: true,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId,
    };
  } catch (error) {
    return handleServiceError(error, requestId);
  }
}

// ============================================
// ✅ SHARED: Standard result contract
// ============================================
// services/shared/types.ts
export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
  success: boolean;
  status: number;
  timestamp: string;
  requestId: string;
}

export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================
// ⚠️ DOMAIN-SPECIFIC: Reusable pattern
// ============================================
// services/player/validation.ts
export const playerCreateSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

// services/casino/validation.ts
export const casinoCreateSchema = z.object({
  name: z.string().min(3).max(200),
  address: z.string().min(1),
  city: z.string().min(1),
});

// ============================================
// ❌ DOMAIN-SPECIFIC: Not reusable
// ============================================
// services/player/transforms.ts
export function toPlayerDTO(row: PlayerRow): PlayerDTO {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
  };
}
```

---

### 4.3 DRY Principles & Trade-offs

**Apply DRY When**:
- ✅ Shared infrastructure (operation wrappers, types, utilities)
- ✅ Common patterns (validation factories, error handling)
- ✅ Cross-cutting concerns (logging, telemetry, caching)

**Avoid Premature Abstraction When**:
- ❌ Domain-specific transformations (force-fitting DTOs)
- ❌ Business rules (coupling unrelated domains)
- ❌ Validation logic (different domains have different constraints)

**Rule of Three**: Only abstract after seeing 3 similar implementations

**Example: Good Abstraction**:

```typescript
// ✅ GOOD: Shared validation pattern factory
export function createEntitySchema<T>(fields: FieldDefinitions<T>) {
  return z.object(fields);
}

const playerSchema = createEntitySchema({
  email: z.string().email(),
  firstName: z.string().min(1),
});

const casinoSchema = createEntitySchema({
  name: z.string().min(3),
  address: z.string(),
});
```

**Example: Bad Abstraction**:

```typescript
// ❌ BAD: Over-abstraction forcing domains to share DTOs
interface GenericEntityDTO<T> {
  id: string;
  data: T;
  metadata: unknown;
}
// PlayerDTO, CasinoDTO forced into same shape - breaks domain autonomy
```

---

## 5. Testing Strategy by Layer

### 5.1 Testing Pyramid for PT-2

```
              /\
             /  \  E2E Tests (Cypress)
            /    \  • Complete workflows
           /------\  • 10% of tests
          /        \
         /          \  Integration Tests (Jest)
        /            \  • Service + Database: 30%
       /              \  • Action orchestration: 10%
      /----------------\
     /                  \  Unit Tests (Jest + RTL)
    /                    \  • Service logic: 40%
   /                      \  • UI components: 10%
  /________________________\
```

**Test Distribution**:
- **60% Unit Tests**: Service layer (40%), UI components (10%), Transforms/Validation (10%)
- **40% Integration + E2E**: Service + DB (30%), Actions (10%), E2E (10%)

---

### 5.2 Layer-Specific Testing Approaches

| Layer | Test Type | What to Test | Mock Boundaries | Tools | Location |
|-------|-----------|--------------|-----------------|-------|----------|
| **Data Layer** | Schema Tests | Constraints, RLS, Triggers, Migrations | N/A (direct DB) | SQL scripts, Supabase CLI | `supabase/tests/` |
| **Service Layer** | Unit Tests | CRUD, Business logic, Transforms, Errors | Mock Supabase client | Jest + mocks | `__tests__/services/*/` |
| **Service Layer** | Integration Tests | Real DB queries, Transactions, RLS | Real test database | Jest + Supabase | `__tests__/services/*/*.integration.test.ts` |
| **Action Layer** | Integration Tests | Service orchestration, Cache, Auth | Mock services or test DB | Jest + Next.js | `__tests__/actions/*/` |
| **UI Layer** | Unit Tests | Rendering, Interactions, State | Mock React Query + actions | Jest + RTL | `__tests__/components/*/` |
| **UI Layer** | E2E Tests | User flows, Real-time, Forms | Real app + test DB | Cypress | `cypress/e2e/` |

---

### 5.3 Mock Boundaries by Layer

```typescript
// ============================================
// 1. SERVICE LAYER UNIT TESTS: Mock Supabase
// ============================================
// __tests__/services/player/player-service.test.ts
const mockSupabase = {
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({
        data: mockPlayer,
        error: null
      })
    })
  })
} as unknown as SupabaseClient<Database>;

const playerService = createPlayerService(mockSupabase);
const result = await playerService.getById('123');
expect(result.success).toBe(true);

// ============================================
// 2. SERVICE LAYER INTEGRATION: Real DB
// ============================================
// __tests__/services/player/player.integration.test.ts
const supabase = createClient(
  process.env.SUPABASE_TEST_URL!,
  process.env.SUPABASE_TEST_KEY!
);
const playerService = createPlayerService(supabase);
const result = await playerService.create({
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User'
});
// Verify data persisted in real database
expect(result.success).toBe(true);
const rows = await supabase.from('player').select().eq('id', result.data!.id);
expect(rows.data).toHaveLength(1);

// ============================================
// 3. ACTION LAYER TESTS: Mock Services
// ============================================
// __tests__/actions/player/create-player-action.test.ts
jest.mock('@/services/player', () => ({
  createPlayerService: jest.fn().mockReturnValue({
    create: jest.fn().mockResolvedValue({
      data: mockPlayer,
      success: true,
      error: null
    })
  })
}));

const result = await createPlayerAction(input);
expect(result.success).toBe(true);

// ============================================
// 4. UI LAYER TESTS: Mock Actions + React Query
// ============================================
// __tests__/components/player-form.test.tsx
jest.mock('@/app/actions/player/create-player-action', () => ({
  createPlayerAction: jest.fn().mockResolvedValue({
    success: true,
    data: mockPlayer
  })
}));

render(<PlayerForm />);
// Test UI interactions without hitting real server
```

---

### 5.4 Test Coverage Targets

| Layer | Module | Min Coverage | Critical Paths |
|-------|--------|--------------|----------------|
| **Data Layer** | Migrations | 100% | All constraints, policies, triggers |
| **Service** | CRUD | 90% | Happy path + errors (NOT_FOUND, duplicates, validation) |
| **Service** | Business | 85% | Workflows, state transitions, concurrency |
| **Service** | Queries | 80% | Complex joins, aggregations, filters |
| **Service** | Transforms | 100% | DTO mappings (deterministic, snapshot tests) |
| **Service** | Validation | 100% | All schema constraints |
| **Action** | Server Actions | 80% | Orchestration, cache invalidation, auth |
| **UI** | Components | 70% | User interactions, conditional rendering |
| **E2E** | User Flows | 100% of critical | CRUD, session lifecycle, compliance |

**Enforcement**: CI fails if coverage drops below targets

---

## 6. Real-Time Subscription Strategy

### 6.1 Layer Placement Decision

**Decision**: Real-time subscriptions live in **UI Layer**, NOT Service Layer

**Rationale**:
- ✅ Real-time is a UI concern (keeping display in sync with remote changes)
- ✅ Subscriptions require React lifecycle (mount/unmount cleanup)
- ✅ Service layer stays pure and stateless
- ❌ Services should not manage WebSocket connections or global state

**Anti-Pattern from PT-1 (AVOID)**:

```typescript
// ❌ BAD: Global real-time manager in service layer
class RealtimeManager {
  private static instance: RealtimeManager;
  private connections: Map<string, RealtimeChannel>;

  subscribe(table: string, callback: (data: unknown) => void) {
    // Global state, singleton pattern - breaks service purity
    // Violates stateless service principle
  }
}
```

**Correct Pattern for PT-2**:

```typescript
// ✅ GOOD: Domain-specific hook in UI layer
// hooks/use-players-realtime.ts
export function usePlayersRealtime() {
  const queryClient = useQueryClient();
  const supabase = createBrowserClient();

  useEffect(() => {
    const channel = supabase
      .channel('players-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'player' },
        (payload) => {
          // Batch invalidation using scheduler pattern
          scheduleInvalidation(() => {
            queryClient.invalidateQueries(['players']);
          });
        }
      )
      .subscribe();

    // Cleanup on unmount
    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);
}
```

---

### 6.2 Real-Time Integration Flow

```
[User A: Create Player]
         ↓
[PostgreSQL: INSERT + Trigger]
         ↓
[Supabase Real-time: Broadcast]
         ↓
[User B: usePlayersRealtime Hook]
         ↓
[Scheduler: Batch Invalidation]
         ↓
[React Query: Refetch]
         ↓
[User B UI: Re-render with new player]
```

**Implementation Pattern**:

```typescript
// 1. UI Component uses real-time hook
// components/player-list.tsx
export function PlayerList() {
  const { data: players } = usePlayers();
  usePlayersRealtime(); // Subscribe to changes

  return <div>{players.map(p => <PlayerCard key={p.id} player={p} />)}</div>;
}

// 2. Real-time hook manages subscription lifecycle
// hooks/use-players-realtime.ts
export function usePlayersRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = createBrowserClient()
      .channel('players-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'player' },
        () => {
          // Debounce rapid changes
          scheduleInvalidation(() => {
            queryClient.invalidateQueries(['players']);
          }, 500);
        }
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, []);
}

// 3. Scheduler prevents invalidation storms
// lib/invalidation-scheduler.ts
let invalidationTimeout: NodeJS.Timeout;
export function scheduleInvalidation(callback: () => void, delay = 300) {
  clearTimeout(invalidationTimeout);
  invalidationTimeout = setTimeout(callback, delay);
}
```

---

## 7. Practical Implementation Guidance

### 7.1 Complete Feature Workflow (Player Management Example)

**Scenario**: Implement full Player Management feature (CRUD + real-time)

```bash
# ============================================
# Day 1: Data Layer (Morning)
# ============================================
$ supabase migration new create_player

# Edit migration file:
# supabase/migrations/xxx_create_player.sql
CREATE TABLE player (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@'),
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE player ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players viewable by authenticated users"
  ON player FOR SELECT TO authenticated USING (true);

-- Audit trigger
CREATE TRIGGER player_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON player
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

$ supabase db push
$ npm run gen:types
$ git add . && git commit -m "feat(player): data layer + RLS policies"

# ============================================
# Day 1-2: Service Layer
# ============================================
$ mkdir -p services/player __tests__/services/player

# Create service modules:
# - services/player/index.ts (factory + interface)
# - services/player/crud.ts (CRUD operations)
# - services/player/business.ts (business workflows)
# - services/player/queries.ts (search, filters)
# - services/player/transforms.ts (DTO mapping)
# - services/player/validation.ts (Zod schemas)

# Create tests:
# - __tests__/services/player/player-service.test.ts
# - __tests__/services/player/crud.test.ts
# - __tests__/services/player/player.integration.test.ts

$ npm test -- __tests__/services/player
# All tests passing ✅

$ git add . && git commit -m "feat(player): service layer + tests"

# ============================================
# Day 3: Action Layer (Morning)
# ============================================
$ mkdir -p app/actions/player __tests__/actions/player

# Create server actions:
# - app/actions/player/create-player-action.ts
# - app/actions/player/update-player-action.ts
# - app/actions/player/delete-player-action.ts
# - app/actions/player/get-players-action.ts

# Create tests:
# - __tests__/actions/player/create-player.test.ts

$ npm test -- __tests__/actions/player
# All tests passing ✅

$ git add . && git commit -m "feat(player): action layer + cache strategies"

# ============================================
# Day 3-4: UI Layer
# ============================================
$ mkdir -p hooks/player components/player app/players

# Create hooks:
# - hooks/player/use-players.ts (React Query list)
# - hooks/player/use-create-player.ts (mutation)
# - hooks/player/use-update-player.ts (mutation)
# - hooks/player/use-delete-player.ts (mutation)
# - hooks/player/use-players-realtime.ts (real-time sync)

# Create components:
# - components/player/player-list.tsx
# - components/player/player-form.tsx
# - components/player/player-card.tsx

# Create page:
# - app/players/page.tsx

# Create tests:
# - __tests__/components/player/player-list.test.tsx
# - __tests__/components/player/player-form.test.tsx
# - cypress/e2e/player-management.cy.ts

$ npm test -- __tests__/components/player
$ npm run cypress:run -- --spec cypress/e2e/player-management.cy.ts
# All tests passing ✅

$ git add . && git commit -m "feat(player): UI layer + E2E tests"

# ============================================
# Day 4: Integration & Demo
# ============================================
$ npm run dev
# Navigate to http://localhost:3000/players
# Manual testing:
# - Create player ✅
# - Update player ✅
# - Delete player ✅
# - Real-time sync across tabs ✅
# - RLS policies working ✅

$ npm run test:coverage
# Service layer: 92% ✅
# Action layer: 85% ✅
# UI layer: 73% ✅

$ git tag -a player-management-v1.0 -m "Complete Player Management feature"
$ git push --tags
```

---

### 7.2 Cross-Layer Communication Examples

**Example 1: Creating a Player (Happy Path)**

```typescript
// ============================================
// Step 1: UI Layer - User submits form
// ============================================
// components/player/player-form.tsx
const { mutate, isPending } = useCreatePlayer();

const handleSubmit = (formData: PlayerFormData) => {
  mutate({
    email: formData.email,
    firstName: formData.firstName,
    lastName: formData.lastName,
  });
};

// ============================================
// Step 2: UI Hook - React Query mutation
// ============================================
// hooks/player/use-create-player.ts
export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPlayerAction,
    onSuccess: (result) => {
      queryClient.invalidateQueries(['players']);
      toast.success('Player created successfully!');
    },
    onError: (error) => {
      toast.error('Failed to create player');
    }
  });
}

// ============================================
// Step 3: Action Layer - Server action
// ============================================
// app/actions/player/create-player-action.ts
'use server';

export async function createPlayerAction(
  input: CreatePlayerInput
): Promise<CreatePlayerResult> {
  const supabase = await createServerClient();
  const playerService = createPlayerService(supabase);

  const result = await playerService.create({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
  });

  if (result.success) {
    revalidatePath('/players');
  }

  return {
    data: result.data,
    error: result.error,
    success: result.success,
  };
}

// ============================================
// Step 4: Service Layer - Business logic
// ============================================
// services/player/crud.ts
export function createPlayerCrudService(
  supabase: SupabaseClient<Database>
) {
  return {
    create: async (
      data: PlayerCreateDTO
    ): Promise<ServiceResult<PlayerDTO>> => {
      return executeOperation<PlayerDTO>(
        'create_player',
        async () => {
          const { data: player, error } = await supabase
            .from('player')
            .insert({
              email: data.email,
              firstName: data.firstName,
              lastName: data.lastName,
            })
            .select('id, email, firstName, lastName')
            .single();

          if (error) {
            // Map database errors to domain errors
            if (error.code === '23505') {
              throw {
                code: 'DUPLICATE_EMAIL',
                message: 'A player with this email already exists',
                details: error
              };
            }
            throw error;
          }

          return toPlayerDTO(player);
        }
      );
    }
  };
}

// ============================================
// Step 5: Data Layer - PostgreSQL execution
// ============================================
-- RLS policy enforced: authenticated users only
-- Constraint check: email unique, email format CHECK
-- Trigger: audit log entry created
-- INSERT successful, row returned
```

---

**Example 2: Error Handling Across Layers**

```typescript
// ============================================
// Data Layer: PostgreSQL constraint violation
// ============================================
-- ERROR: duplicate key value violates unique constraint "player_email_key"
-- DETAIL: Key (email)=(test@example.com) already exists.
-- CODE: 23505

// ============================================
// Service Layer: Map to domain error
// ============================================
// services/player/crud.ts
if (error.code === '23505') {
  throw {
    code: 'DUPLICATE_EMAIL',
    message: 'A player with this email already exists',
    details: { email: data.email, postgres_code: error.code }
  };
}

// executeOperation wrapper catches and transforms
return {
  data: null,
  error: {
    code: 'DUPLICATE_EMAIL',
    message: 'A player with this email already exists',
    details: { email: 'test@example.com' }
  },
  success: false,
  status: 400,
  timestamp: '2025-10-09T12:34:56.789Z',
  requestId: 'req_abc123'
};

// ============================================
// Action Layer: Pass through with logging
// ============================================
// app/actions/player/create-player-action.ts
const result = await playerService.create(input);

if (!result.success) {
  logger.warn('Player creation failed', {
    error: result.error,
    requestId: result.requestId,
    input: { email: input.email } // Don't log PII details
  });
}

return result;

// ============================================
// UI Layer: User-friendly display
// ============================================
// hooks/player/use-create-player.ts
onError: (error: ServiceError) => {
  if (error.code === 'DUPLICATE_EMAIL') {
    toast.error('This email is already registered. Please use a different email.');
    form.setError('email', {
      type: 'manual',
      message: 'Email already exists'
    });
  } else {
    toast.error('Failed to create player. Please try again.');
  }
}
```

---

## 8. Trade-offs & Risk Assessment

### 8.1 Architecture Trade-offs

| Approach | Advantages | Disadvantages | Mitigation |
|----------|-----------|---------------|------------|
| **Bottom-Up Sequencing** | • Stable foundation<br>• Testable layers<br>• Clear dependencies<br>• Low rework risk | • UI delivery delayed<br>• Risk of over-engineering DB<br>• Slower stakeholder visibility | • Vertical slicing for MVPs<br>• Schema reviews before implementation<br>• Regular demos of data+service layers |
| **Strict Layer Boundaries** | • Clean architecture<br>• Easy to reason about<br>• Maintainable long-term<br>• Isolated testing | • More boilerplate code<br>• Slower initial development<br>• Learning curve for team | • Code generation tools<br>• Service templates<br>• Clear documentation |
| **Multi-Layer Validation** | • Defense in depth<br>• Better UX feedback<br>• Security hardening | • Duplicate validation logic<br>• Maintenance burden<br>• Schema sync required | • Shared Zod schemas<br>• Single source of truth<br>• Automated tests |
| **ServiceResult Pattern** | • Consistent errors<br>• Type-safe responses<br>• Trackable requests | • Verbose return types<br>• Wrapper overhead<br>• Non-standard pattern | • Helper functions<br>• Type inference utilities<br>• Team training |

---

### 8.2 Risk Matrix

| Risk | Likelihood | Impact | Severity | Mitigation Strategy |
|------|-----------|--------|----------|---------------------|
| **Over-abstraction** (Premature DRY) | Medium | Medium | 🟡 | Wait for 3rd use case before abstracting<br>ADR review for shared code |
| **Layer violations** (UI → Service) | Low | High | 🔴 | ESLint custom rules<br>Code review checklist<br>Automated architecture tests |
| **Service coupling** (Service → Service) | Medium | High | 🔴 | Enforce orchestration via Action layer<br>Document anti-pattern in ADRs |
| **Inconsistent errors** | Medium | Medium | 🟡 | Shared executeOperation wrapper<br>Standard ServiceResult<br>Error catalog per domain |
| **Test duplication** | High | Low | 🟢 | Focus critical paths<br>Pyramid distribution (60/30/10)<br>Mock at boundaries |
| **Real-time sync issues** | Medium | Medium | 🟡 | Scheduler pattern for batching<br>Centralized invalidation<br>E2E tests |
| **Schema drift** | Low | High | 🔴 | Automated type regeneration<br>CI validation<br>Migration-only schema changes |
| **Performance degradation** | Medium | High | 🔴 | Layer caching strategies<br>Performance budgets<br>Lighthouse CI gates |

**Severity Legend**:
- 🔴 Critical: Requires immediate mitigation
- 🟡 Medium: Monitor and address in sprint
- 🟢 Low: Accept risk, document decision

---

## 9. Success Metrics & Governance

### 9.1 Architecture Quality Indicators

| Metric | Target | Measurement | Frequency |
|--------|--------|-------------|-----------|
| **Layer Boundary Violations** | 0 | ESLint + manual code review | Every PR |
| **Test Coverage (Overall)** | >80% | Jest coverage reports | Every commit |
| **Service Layer Coverage** | >90% | Jest (critical for business logic) | Every commit |
| **Build Time** | <60s | CI pipeline metrics | Daily |
| **Type Safety** | 100% (strict mode) | TypeScript compiler | Every commit |
| **ServiceResult Consistency** | 100% of methods | Code review checklist | Every PR |
| **RLS Policy Coverage** | 100% of tables | Manual schema audit | Per migration |

---

### 9.2 Development Velocity Indicators

| Metric | Target | Measurement | Frequency |
|--------|--------|-------------|-----------|
| **New Domain Implementation** | 6 days (vertical slice) | Sprint velocity tracking | Per sprint |
| **Service Module Reusability** | >50% shared infrastructure | Code analysis tools | Monthly |
| **Test Execution Time** | <5min (unit), <15min (integration) | CI metrics | Daily |
| **Developer Onboarding Time** | <4 hours to first PR | New developer feedback | Per hire |
| **PR Review Time** | <24 hours | GitHub metrics | Weekly |
| **Bug Escape Rate** | <5% to production | Issue tracking | Monthly |

---

### 9.3 Governance & Review Process

**Architecture Decision Records (ADRs)**:
- Any deviation from this document requires an ADR
- Store in `docs/architecture/decisions/`
- Template: Problem, Decision, Consequences, Alternatives

**Code Review Checklist** (Per Layer):

**Data Layer**:
- [ ] Migration follows naming convention (timestamp_description.sql)
- [ ] RLS policies defined for all tables
- [ ] Audit triggers enabled for sensitive tables
- [ ] Types regenerated (npm run gen:types)
- [ ] Schema constraints documented

**Service Layer**:
- [ ] Explicit interface defined (no ReturnType inference)
- [ ] Typed supabase parameter (SupabaseClient<Database>)
- [ ] All methods return ServiceResult<T>
- [ ] Error codes in domain error catalog
- [ ] Unit tests >90% coverage
- [ ] Integration tests for critical paths

**Action Layer**:
- [ ] Server action uses 'use server' directive
- [ ] Service orchestration (no business logic)
- [ ] Cache invalidation strategy documented
- [ ] Authorization checks implemented
- [ ] Action tests cover orchestration logic

**UI Layer**:
- [ ] No direct Supabase client usage
- [ ] React Query hooks for data fetching
- [ ] Real-time hooks clean up subscriptions
- [ ] Components accept typed props (DTOs/ViewModels)
- [ ] E2E tests for critical user flows

---

## 10. Recommendations & Next Steps

### 10.1 Immediate Actions (Week 1)

**Priority 1: Formalize Infrastructure**
- [ ] Create `docs/architecture/LAYER_CONTRACTS.md` defining interfaces
- [ ] Document standard DTO transformation patterns
- [ ] Establish ServiceResult error code catalog per domain
- [ ] Implement `withServerActionWrapper` for action-layer consistency

**Priority 2: Complete Service Layers** (Bottom-Up)
- [ ] Casino Service: Business, Queries, Transforms, Validation modules (2 days)
- [ ] TableContext Service: Business, Queries, Transforms, Validation (2 days)
- [ ] MTL Service: Business, Transforms, Validation (2 days)
- [ ] Player Service: Business, Queries, Transforms, Validation (2 days)
- [ ] Visit Service: Business, Queries, Transforms, Validation (2 days)
- [ ] RatingSlip Service: Business, Queries, Transforms, Validation (2 days)
- [ ] PlayerFinancial Service: Business, Queries, Transforms, Validation (2 days)

**Priority 3: Shared Tooling**
- [ ] Build validation schema factory patterns
- [ ] Create cache invalidation helpers
- [ ] Implement real-time scheduler pattern

---

### 10.2 Medium-Term Actions (Weeks 2-4)

**Priority 4: Complete First Vertical Slice (Player Management)**
- [ ] Player Actions: CRUD server actions (1 day)
- [ ] Player UI: Hooks, components, forms (2 days)
- [ ] Player E2E: Cypress tests for CRUD flows (1 day)
- [ ] Player Real-time: Multi-tab sync (1 day)

**Priority 5: Expand to Critical MVP Features**
- [ ] Visit Management: Actions + UI + E2E (4 days)
- [ ] Rating Slip Creation: Actions + UI + E2E (4 days)
- [ ] Casino Configuration: Actions + UI + E2E (4 days)

**Priority 6: Testing Infrastructure**
- [ ] Set up integration test database pipeline
- [ ] Create test data factories/fixtures per domain
- [ ] Implement Cypress E2E suite for critical flows
- [ ] Add performance regression tests

---

### 10.3 Long-Term Actions (Month 2+)

**Priority 7: Horizontal Optimization**
- [ ] Extract common query patterns into shared utilities
- [ ] Build DTO transformation helper library
- [ ] Create business workflow templates
- [ ] Optimize bundle sizes per layer

**Priority 8: Advanced Features**
- [ ] Implement optimistic updates for low-latency actions
- [ ] Add offline-first capabilities (if needed for compliance)
- [ ] Build complex cross-domain aggregations
- [ ] Performance monitoring and alerting

**Priority 9: Documentation & Governance**
- [ ] Document layer-specific coding standards
- [ ] Create layer violation detection tools (ESLint plugins)
- [ ] Establish architecture review process (ADR workflow)
- [ ] Build onboarding guides per layer

---

## 11. Conclusion

### 11.1 Final Recommendations

**Recommended Architecture**: **4-Layer Horizontal with Bottom-Up Vertical Slicing**

**Key Architectural Decisions**:

1. **Layer Structure**:
   - Data Layer: Schema, RLS, types, real-time infrastructure
   - Service Layer: Business logic, DTOs, validation, error handling
   - Action Layer: Orchestration, cache management, authorization
   - UI Layer: Components, hooks, state management, real-time sync

2. **Implementation Sequencing**:
   - Bottom-up for foundation stability and testability
   - Vertical slicing for rapid feature delivery
   - 6-day cadence per domain (Data → Service → Action → UI)
   - Complete service modules before moving to next layer

3. **Shared Infrastructure**:
   - Maximize reusability for cross-cutting concerns
   - Keep domain logic isolated and autonomous
   - Balance DRY with domain-specific needs
   - Wait for 3rd use case before abstracting

4. **Testing Strategy**:
   - 60% unit tests (service layer heavy)
   - 30% integration tests (service + DB)
   - 10% E2E tests (critical user flows)
   - Mock at layer boundaries
   - >80% overall coverage target

5. **Real-Time Strategy**:
   - UI-layer hooks, not service-layer managers
   - Batch invalidations with scheduler pattern
   - Clean subscription lifecycle management
   - Domain-specific real-time hooks

---

### 11.2 Success Criteria

**Architecture Quality**:
- ✅ Zero layer boundary violations
- ✅ >80% test coverage (>90% service layer)
- ✅ 100% ServiceResult consistency
- ✅ 100% RLS policy coverage
- ✅ <60s build time

**Development Velocity**:
- ✅ 6-day vertical slice cadence
- ✅ >50% shared infrastructure reusability
- ✅ <4 hour developer onboarding
- ✅ <24 hour PR review time

**Production Quality**:
- ✅ <5% bug escape rate
- ✅ LCP ≤ 2.5s (Lighthouse)
- ✅ TBT ≤ 200ms
- ✅ Initial JS ≤ 250KB

---

### 11.3 Migration Path from Current State

**Current State** (Phase 2):
- ✅ 7 domain services with CRUD modules
- ⏳ Business, Queries, Transforms, Validation modules incomplete
- ⏳ No action layer implementation
- ⏳ No UI layer implementation

**Migration Steps**:

```
Week 1: Complete Service Layer
├─ Add Business modules to all services (14 days parallelized)
├─ Add Queries modules to all services
├─ Add Transforms modules to all services
├─ Add Validation modules to all services
└─ Achieve >90% service layer test coverage

Week 2-3: First Vertical Slice (Player Management)
├─ Player Actions (1 day)
├─ Player UI (2 days)
├─ Player E2E (1 day)
└─ Demo to stakeholders

Week 4-6: Expand Vertical Slices
├─ Visit Management (4 days)
├─ Rating Slip Creation (4 days)
└─ Casino Configuration (4 days)

Week 7-8: Real-time Integration
├─ Real-time hooks per domain
├─ Invalidation scheduler
└─ Multi-tab sync testing

Week 9+: Remaining Domains & Optimization
├─ TableContext vertical slice
├─ MTL vertical slice
├─ Performance optimization
└─ Production hardening
```

---

**Document Metadata**:
- **Version**: 1.0
- **Last Updated**: 2025-10-09
- **Author**: Architecture Team
- **Status**: Recommended for Adoption
- **Review Date**: 2025-10-23 (2 weeks)
- **Related Documents**:
  - `10-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`
  - `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
  - `docs/phase-2/SERVICE_RESPONSIBILITY_MATRIX.md`
  - `docs/architecture/FEATURE_BASED_HORIZONTAL_LAYERING_ANALYSIS.md` (original)

---

## Appendix A: Complete Example (Player Domain)

### A.1 Data Layer

```sql
-- supabase/migrations/xxx_create_player.sql
CREATE TABLE player (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}$'),
  "firstName" TEXT NOT NULL CHECK (LENGTH("firstName") > 0),
  "lastName" TEXT NOT NULL CHECK (LENGTH("lastName") > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE player ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players viewable by authenticated users"
  ON player FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Players modifiable by staff"
  ON player FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('staff', 'admin'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('staff', 'admin'));

-- Audit trigger
CREATE TRIGGER player_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON player
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Updated timestamp trigger
CREATE TRIGGER player_updated_at_trigger
  BEFORE UPDATE ON player
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### A.2 Service Layer

```typescript
// services/player/index.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';
import { createPlayerCrudService } from './crud';
import { createPlayerBusinessService } from './business';
import { createPlayerQueriesService } from './queries';
import type { PlayerDTO, PlayerCreateDTO, PlayerUpdateDTO } from './transforms';
import type { ServiceResult } from '../shared/types';

export interface PlayerService {
  // CRUD
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  create(data: PlayerCreateDTO): Promise<ServiceResult<PlayerDTO>>;
  update(id: string, data: PlayerUpdateDTO): Promise<ServiceResult<PlayerDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;

  // Business
  activate(id: string): Promise<ServiceResult<PlayerDTO>>;
  deactivate(id: string): Promise<ServiceResult<PlayerDTO>>;

  // Queries
  searchPlayers(query: string): Promise<ServiceResult<PlayerDTO[]>>;
  getPlayerStats(id: string): Promise<ServiceResult<PlayerStatsDTO>>;
}

export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerService {
  const crudService = createPlayerCrudService(supabase);
  const businessService = createPlayerBusinessService(supabase);
  const queriesService = createPlayerQueriesService(supabase);

  return {
    ...crudService,
    ...businessService,
    ...queriesService,
  };
}

export type { PlayerDTO, PlayerCreateDTO, PlayerUpdateDTO };
```

### A.3 Action Layer

```typescript
// app/actions/player/create-player-action.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { createPlayerService } from '@/services/player';
import { revalidatePath } from 'next/cache';
import type { PlayerCreateDTO, PlayerDTO } from '@/services/player';
import type { ServiceResult } from '@/services/shared/types';

export async function createPlayerAction(
  input: PlayerCreateDTO
): Promise<ServiceResult<PlayerDTO>> {
  const supabase = await createServerClient();
  const playerService = createPlayerService(supabase);

  const result = await playerService.create(input);

  if (result.success) {
    revalidatePath('/players');
  }

  return result;
}
```

### A.4 UI Layer

```typescript
// hooks/player/use-create-player.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPlayerAction } from '@/app/actions/player/create-player-action';
import { toast } from 'sonner';
import type { PlayerCreateDTO } from '@/services/player';

export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPlayerAction,
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['players'] });
        toast.success('Player created successfully!');
      } else {
        const message = result.error?.code === 'DUPLICATE_EMAIL'
          ? 'This email is already registered'
          : 'Failed to create player';
        toast.error(message);
      }
    },
    onError: () => {
      toast.error('Failed to create player. Please try again.');
    }
  });
}

// components/player/player-form.tsx
export function PlayerForm() {
  const { mutate, isPending } = useCreatePlayer();
  const form = useForm({
    resolver: zodResolver(playerCreateSchema),
    defaultValues: { email: '', firstName: '', lastName: '' }
  });

  const onSubmit = (data: PlayerCreateDTO) => {
    mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Form fields */}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Player'}
      </button>
    </form>
  );
}
```

---

**End of Analysis**

# PT-2 Hybrid Vertical/Horizontal Slicing Strategy

> **Date**: 2025-10-09
> **Status**: Recommended Architecture Decision
> **Purpose**: Define hybrid model combining horizontal layers with vertical feature delivery
> **Context**: 7/8 services complete (87.5%), 98/98 tests passing, Phase 2 service layer foundations established

---

## Executive Summary

**Recommendation**: Adopt a **Hybrid Model** combining horizontal technical layers with vertical feature delivery.

**Core Principle**:
> "Horizontal layers for **technical architecture**, vertical slices for **feature delivery**"

**Critical Insight**: The perceived tension between "vertical slicing" and "horizontal layering" is a **false dichotomy**. PT-2 needs BOTH:
- **Horizontal layers** for technical separation of concerns (Data → Service → Action → UI)
- **Vertical delivery** for feature-complete user value (Player Management, Visit Tracking, Rating Slip Creation)

**Current State**:
- ✅ Horizontal service layer: 7 services, 98 tests passing, >80% coverage
- ✅ Explicit interfaces, typed dependencies, bounded contexts
- ✅ Zero PRD violations, 4x template velocity sustained
- ⏳ Action Layer, UI Layer, Real-time integration not yet implemented

**Timeline**: 8 weeks to production-ready MVP

**Risk**: LOW (builds on working foundation, zero rework)

**ROI**: HIGHEST among alternatives (vs 12 weeks pure vertical, 10 weeks strict horizontal)

---

## 1. Hybrid Model Definition

### 1.1 Two Complementary Dimensions

**HORIZONTAL DIMENSION (Technical Layers)**:
```
┌─────────────────────────────────────────────────────────────┐
│                     UI LAYER (Client)                        │
│  React Components • Hooks • UI State • Real-time Sync       │
└───────────────────────────┬─────────────────────────────────┘
                            │ Server Actions
┌───────────────────────────▼─────────────────────────────────┐
│                  ACTION LAYER (Server)                       │
│  Server Actions • Orchestration • Cache • Authorization     │
└───────────────────────────┬─────────────────────────────────┘
                            │ Service Factories
┌───────────────────────────▼─────────────────────────────────┐
│                  SERVICE LAYER (Business)                    │
│  CRUD • Business • Queries • Transforms • Validation        │
└───────────────────────────┬─────────────────────────────────┘
                            │ Supabase Client
┌───────────────────────────▼─────────────────────────────────┐
│                   DATA LAYER (Database)                      │
│  PostgreSQL • RLS Policies • Triggers • Real-time           │
└─────────────────────────────────────────────────────────────┘
```

**Purpose**: Separation of concerns, clear boundaries, testability
**Organization**: By technical responsibility
**Dependency Flow**: Strictly top-down (UI → Action → Service → Data)

---

**VERTICAL DIMENSION (Feature Delivery)**:
```
Feature: Player Management (Complete User-Facing Slice)
├─ Data Layer: player table, RLS policies
├─ Service Layer: PlayerService.create(), .update(), .delete()
├─ Action Layer: createPlayerAction(), updatePlayerAction()
├─ Hook Layer: useCreatePlayer(), useUpdatePlayer()
└─ UI Layer: PlayerForm, PlayerList, PlayerCard

Feature: Visit Tracking (Complete User-Facing Slice)
├─ Data Layer: visit table, session lifecycle
├─ Service Layer: VisitService.startVisit(), .endVisit()
├─ Action Layer: startVisitAction(), endVisitAction()
├─ Hook Layer: useStartVisit(), useEndVisit()
└─ UI Layer: VisitForm, VisitList, VisitTimeline
```

**Purpose**: User value, demo-able progress, MVP prioritization
**Organization**: By domain/feature (Player, Visit, RatingSlip)
**Delivery Cadence**: Complete slices every 2 weeks

---

### 1.2 Integration Model

**The hybrid model answers two questions**:

1. **WHERE is the code?** (Horizontal - Technical Architecture)
   - Service logic → `services/<domain>/`
   - Server orchestration → `app/actions/<domain>/`
   - React hooks → `hooks/<domain>/`
   - UI components → `components/<domain>/`

2. **HOW is a feature delivered?** (Vertical - Feature Delivery)
   - "Create Player" = Database migration → PlayerService.create() → createPlayerAction() → useCreatePlayer() → PlayerForm
   - "Start Visit" = Database migration → VisitService.startVisit() → startVisitAction() → useStartVisit() → VisitForm

**Key Distinction**:
- Horizontal = Technical organization (how system is architected)
- Vertical = Feature delivery (how user value is delivered)
- NOT mutually exclusive - complementary dimensions

---

## 2. Core vs Domain Boundary Analysis

### 2.1 Core Infrastructure (Horizontal - Shared)

**Definition**: Reusable technical infrastructure used by ALL domains

**Location**: `services/shared/`, `lib/`, `types/helpers/`

**Examples**:

1. **Operation Wrapper** (`services/shared/operation-wrapper.ts`)
   ```typescript
   export async function executeOperation<T>(
     label: string,
     operation: () => Promise<T>,
     options?: OperationOptions
   ): Promise<ServiceResult<T>>;
   ```
   - Used by: ALL services (Player, Visit, RatingSlip, Casino, MTL, TableContext)
   - Provides: Consistent error handling, request tracking, telemetry

2. **Service Result Contract** (`services/shared/types.ts`)
   ```typescript
   export interface ServiceResult<T> {
     data: T | null;
     error: ServiceError | null;
     success: boolean;
     status: number;
     timestamp: string;
     requestId: string;
   }
   ```
   - Used by: ALL service methods
   - Provides: Standardized response format across layers

3. **Supabase Client Factories** (`lib/supabase/`)
   ```typescript
   export function createBrowserClient(): SupabaseClient<Database>;
   export function createServerClient(): Promise<SupabaseClient<Database>>;
   ```
   - Used by: ALL actions, real-time hooks
   - Provides: Authenticated client instances, cookie management

4. **Database Types** (`types/database.types.ts`)
   ```typescript
   export type Database = { /* Generated from Supabase schema */ };
   ```
   - Used by: ALL services, actions, hooks
   - Provides: Single source of truth for type safety

**Governance**:
- Owner: Architecture team
- Change approval: Requires cross-domain impact analysis
- Versioning: Semantic versioning for breaking changes

---

### 2.2 Domain Features (Vertical - Bounded)

**Definition**: Domain-specific business logic NOT reusable across domains

**Location**: `services/<domain>/`, `app/actions/<domain>/`, `hooks/<domain>/`, `components/<domain>/`

**Examples**:

1. **Player Domain**
   ```
   services/player/
   ├── index.ts           # PlayerService interface
   ├── crud.ts            # CRUD operations
   ├── business.ts        # Player workflows
   ├── queries.ts         # Search, filters
   ├── transforms.ts      # DTO mapping
   └── validation.ts      # Player-specific Zod schemas

   app/actions/player/
   ├── create-player-action.ts
   ├── update-player-action.ts
   └── delete-player-action.ts

   hooks/player/
   ├── use-players.ts
   ├── use-create-player.ts
   └── use-players-realtime.ts

   components/player/
   ├── player-list.tsx
   ├── player-form.tsx
   └── player-card.tsx
   ```

2. **Visit Domain** (Session Lifecycle)
   ```
   services/visit/
   ├── business.ts        # Session lifecycle logic
   ├── validation.ts      # Visit-specific rules

   app/actions/visit/
   ├── start-visit-action.ts
   ├── end-visit-action.ts
   └── cancel-visit-action.ts
   ```

3. **RatingSlip Domain** (Performance Tracking)
   ```
   services/ratingslip/
   ├── business.ts        # Points calculation logic
   ├── validation.ts      # Rating slip constraints

   app/actions/ratingslip/
   ├── create-ratingslip-action.ts
   └── calculate-points-action.ts
   ```

**Governance**:
- Owner: Domain team/feature owner
- Change approval: Domain-specific review
- Isolation: Changes do NOT affect other domains

---

### 2.3 The Boundary Decision Criteria

**Core Infrastructure Test**:
```
Q: Can this be used by 100% of domains without modification?
├─ YES → Core (services/shared/, lib/)
└─ NO  → Domain-specific (services/<domain>/)
```

**Domain Feature Test**:
```
Q: Does this encode business rules specific to one bounded context?
├─ YES → Domain feature (services/<domain>/)
└─ NO  → Evaluate for core extraction
```

**Rule of Three**:
> Wait for 3 identical implementations before abstracting to core.
> Premature abstraction = maintenance debt.

**Examples**:

| Code | Decision | Rationale |
|------|----------|-----------|
| `executeOperation()` wrapper | CORE | Used by ALL services identically |
| Player email validation | DOMAIN | Player-specific business rule |
| ServiceResult type | CORE | Standard contract across ALL layers |
| Visit lifecycle transitions | DOMAIN | Visit-specific state machine |
| Supabase client factory | CORE | Required by ALL actions/hooks |
| RatingSlip points calculation | DOMAIN | RatingSlip-specific algorithm |

---

## 3. Implementation Sequencing Strategy

### 3.1 Recommended Approach: Bottom-Up Foundation + Vertical Feature Delivery

**Rationale**:
1. **Foundation First**: Data layer provides stable schema before building services
2. **Testability**: Each layer tested in isolation as it's built
3. **Dependency Clarity**: Higher layers naturally depend on completed lower layers
4. **Iterative Delivery**: Complete vertical slices deliver working features
5. **Incremental Risk**: Each addition can be validated and rolled back independently

---

### 3.2 Phased Timeline (8 Weeks to MVP)

**PHASE 1: Service Layer Completion** (Week 1 - Current)

```
✅ COMPLETE: Data Layer (7 domain tables, RLS policies)
✅ COMPLETE: Service Layer CRUD modules (7/8 services, 98 tests)
⏳ IN PROGRESS: Service Layer enhancement

Week 1 Tasks:
├─ Day 1: Complete MTL Service queries (DONE)
├─ Day 2-3: Add business.ts, queries.ts modules to all services
├─ Day 4: Add transforms.ts, validation.ts modules to all services
└─ Day 5: Integration testing + Phase 2 audit

Deliverable: 7 complete services with all modules (CRUD, Business, Queries, Transforms, Validation)
```

**Validation Criteria**:
- All services have explicit interfaces (no `ReturnType` inference)
- All services typed `SupabaseClient<Database>` (no `any`)
- All methods return `ServiceResult<T>`
- Test coverage >80% per service
- Zero PRD violations

---

**PHASE 2: First Vertical Slice - Player Management** (Weeks 2-3)

```
Week 2: Action Layer + Hooks
├─ Day 1: Server actions (create, update, delete player)
│   └─ app/actions/player/create-player-action.ts
│   └─ app/actions/player/update-player-action.ts
│   └─ app/actions/player/delete-player-action.ts
├─ Day 2: React Query hooks (mutations)
│   └─ hooks/player/use-create-player.ts
│   └─ hooks/player/use-update-player.ts
│   └─ hooks/player/use-delete-player.ts
├─ Day 3: React Query hooks (queries)
│   └─ hooks/player/use-players.ts
│   └─ hooks/player/use-player.ts
├─ Day 4-5: Testing + validation
    └─ __tests__/actions/player/
    └─ __tests__/hooks/player/ (mocked)

Week 3: UI Layer
├─ Day 1-2: Core components
│   └─ components/player/player-form.tsx
│   └─ components/player/player-list.tsx
├─ Day 3: Detail components
│   └─ components/player/player-card.tsx
│   └─ components/player/player-detail.tsx
├─ Day 4: Real-time integration
│   └─ hooks/player/use-players-realtime.ts
│   └─ Multi-tab sync testing
└─ Day 5: E2E tests + demo
    └─ cypress/e2e/player-management.cy.ts

DELIVERABLE: ✅ Complete Player Management Feature
- Users can create, update, delete players
- Real-time synchronization across tabs
- Working UI with forms, lists, details
- E2E tests passing
```

---

**PHASE 3: Second Vertical Slice - Visit Tracking** (Weeks 4-5)

```
Week 4: Action Layer + Hooks
├─ Day 1-2: Server actions (session lifecycle)
│   └─ app/actions/visit/start-visit-action.ts
│   └─ app/actions/visit/end-visit-action.ts
│   └─ app/actions/visit/cancel-visit-action.ts
├─ Day 3: React Query hooks
│   └─ hooks/visit/use-visits.ts
│   └─ hooks/visit/use-start-visit.ts
│   └─ hooks/visit/use-end-visit.ts
└─ Day 4-5: Testing + validation

Week 5: UI Layer
├─ Day 1-2: Core components
│   └─ components/visit/visit-form.tsx
│   └─ components/visit/visit-list.tsx
├─ Day 3: Detail components
│   └─ components/visit/visit-detail.tsx
│   └─ components/visit/visit-timeline.tsx
├─ Day 4: Real-time integration
│   └─ hooks/visit/use-visits-realtime.ts
└─ Day 5: E2E tests + demo

DELIVERABLE: ✅ Complete Visit Tracking Feature
- Users can start, end, cancel visits
- Real-time session status updates
- Visit history and timelines
```

---

**PHASE 4: Third Vertical Slice - Rating Slip Creation** (Week 6)

```
Week 6: Full Vertical Slice
├─ Day 1: Server actions
│   └─ app/actions/ratingslip/create-ratingslip-action.ts
│   └─ app/actions/ratingslip/calculate-points-action.ts
├─ Day 2: React Query hooks
│   └─ hooks/ratingslip/use-ratingslips.ts
│   └─ hooks/ratingslip/use-create-ratingslip.ts
├─ Day 3-4: UI components
│   └─ components/ratingslip/ratingslip-form.tsx
│   └─ components/ratingslip/points-calculator.tsx
└─ Day 5: E2E tests + demo

DELIVERABLE: ✅ Complete Rating Slip Creation Feature
- Users can create rating slips with points calculation
- Integration with visit sessions
- Performance metrics tracking
```

---

**PHASE 5: Real-Time Infrastructure** (Week 7 - Horizontal Enhancement)

```
Week 7: Real-Time Infrastructure
├─ Day 1: Core wrapper hook
│   └─ lib/use-supabase-channel.ts
├─ Day 2: Batch invalidation scheduler
│   └─ lib/invalidation-scheduler.ts
├─ Day 3-4: Domain real-time hooks
│   └─ Update use-players-realtime.ts
│   └─ Update use-visits-realtime.ts
│   └─ Update use-ratingslips-realtime.ts
└─ Day 5: Memory leak testing + multi-tab validation

DELIVERABLE: ✅ Real-Time UI Synchronization
- All domains support real-time updates
- Batch invalidation prevents storms
- Clean subscription lifecycle management
- Memory leak prevention validated
```

---

**PHASE 6: Production Hardening** (Week 8)

```
Week 8: Integration Testing + Performance
├─ Day 1-2: Cross-domain workflows
│   └─ Visit → RatingSlip → MTL integration tests
│   └─ Player → Visit → Casino relationship tests
├─ Day 3: Bundle optimization
│   └─ Code splitting analysis
│   └─ Dynamic imports for heavy components
├─ Day 4: Lighthouse CI gates
│   └─ LCP ≤2.5s, TBT ≤200ms, Initial JS ≤250KB
└─ Day 5: Deployment automation
    └─ Migration pipeline
    └─ Type regeneration validation

DELIVERABLE: ✅ Production-Ready MVP
- All critical user flows tested
- Performance budgets met
- RLS policies audited
- Deployment pipeline automated
```

---

### 3.3 Why This Sequence Works

**Bottom-Up Benefits**:
1. Data layer provides stable schema before building services
2. Service layer tested in isolation (mocked Supabase)
3. Action layer builds on proven service contracts
4. UI layer consumes stable action APIs

**Vertical Delivery Benefits**:
1. Delivers user-facing value every 2 weeks
2. Demo-able progress for stakeholders
3. Simplest domain first (Player CRUD)
4. Increasing complexity (Visit lifecycle, RatingSlip calculations)
5. Real-time as progressive enhancement (not blocking)

**Risk Mitigation**:
1. Each phase can be validated independently
2. Rollback points at every phase boundary
3. Service layer never changes (stable foundation)
4. Incremental additions (Action → Hook → UI)

---

## 4. Architectural Integration Patterns

### 4.1 Shared Kernel (Core Infrastructure)

**Purpose**: Reusable technical infrastructure used by all domains

**Scope**: `services/shared/`, `lib/`, `types/helpers/`

**Pattern**:
```typescript
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
```

**Relationship**: Used BY all domains, never DEPENDS ON domains

**Governance**: Changes require cross-domain impact analysis

---

### 4.2 Published Language (Service Contracts)

**Purpose**: Explicit, versioned interfaces between layers

**Scope**: Service interfaces, DTO definitions

**Pattern**:
```typescript
// services/player/index.ts
export interface PlayerService {
  // CRUD operations
  create(data: PlayerCreateDTO): Promise<ServiceResult<PlayerDTO>>;
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  update(id: string, data: PlayerUpdateDTO): Promise<ServiceResult<PlayerDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;

  // Business operations
  activate(id: string): Promise<ServiceResult<PlayerDTO>>;
  deactivate(id: string): Promise<ServiceResult<PlayerDTO>>;

  // Query operations
  searchPlayers(query: string): Promise<ServiceResult<PlayerDTO[]>>;
  getPlayerStats(id: string): Promise<ServiceResult<PlayerStatsDTO>>;
}

export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerService {
  // Implementation composes modules
}

// Explicit type export (NOT ReturnType inference)
export type PlayerServiceType = PlayerService;
```

**Relationship**: Layer N+1 depends on Layer N's published interface

**Governance**: Breaking changes require migration plan

---

### 4.3 Customer-Supplier (Action → Service)

**Purpose**: Action layer is "customer" of service layer

**Scope**: `app/actions/` → `services/`

**Pattern**:
```typescript
// app/actions/player/create-player-action.ts
'use server';

export async function createPlayerAction(
  input: PlayerCreateDTO
): Promise<ServiceResult<PlayerDTO>> {
  const supabase = await createServerClient(); // Dependency injection
  const playerService = createPlayerService(supabase); // Supplier

  const result = await playerService.create(input); // Customer uses supplier

  if (result.success) {
    revalidatePath('/players'); // Cache invalidation
  }

  return result; // Pass through ServiceResult
}
```

**Relationship**: One-way dependency (actions call services, never reverse)

**Governance**: Services are unaware of actions (isolation)

---

### 4.4 Conformist (UI → Action)

**Purpose**: UI conforms to action layer contracts

**Scope**: `hooks/`, `components/` → `app/actions/`

**Pattern**:
```typescript
// hooks/player/use-create-player.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPlayerAction } from '@/app/actions/player/create-player-action';

export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPlayerAction, // Conform to action signature
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries(['players']);
        toast.success('Player created successfully!');
      } else {
        toast.error(result.error?.message || 'Failed to create player');
      }
    }
  });
}

// components/player/player-form.tsx
export function PlayerForm() {
  const { mutate, isPending } = useCreatePlayer();
  const form = useForm({
    resolver: zodResolver(playerCreateSchema)
  });

  const onSubmit = (data: PlayerCreateDTO) => {
    mutate(data); // Conform to hook interface
  };

  return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>;
}
```

**Relationship**: UI has no negotiation power, follows action API

**Governance**: Actions designed for UI consumption

---

### 4.5 Anti-Corruption Layer (Service → Database)

**Purpose**: Protect domain from database schema changes

**Scope**: `services/<domain>/transforms.ts`

**Pattern**:
```typescript
// services/player/transforms.ts
import type { Database } from '@/types/database.types';

type PlayerRow = Database["public"]["Tables"]["player"]["Row"];

// Domain DTO (isolated from database schema)
export type PlayerDTO = Pick<PlayerRow, "id" | "email" | "firstName" | "lastName">;

export type PlayerCreateDTO = Pick<PlayerDTO, "email" | "firstName" | "lastName">;

export type PlayerUpdateDTO = Partial<PlayerCreateDTO>;

// Anti-corruption: Map database representation to domain model
export function toPlayerDTO(row: PlayerRow): PlayerDTO {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName, // Database column → Domain concept
    lastName: row.lastName,
  };
}

export function toPlayerViewModel(dto: PlayerDTO): PlayerViewModel {
  return {
    id: dto.id,
    fullName: `${dto.firstName} ${dto.lastName}`, // Computed
    emailDisplay: dto.email.toLowerCase(),
  };
}
```

**Relationship**: Service layer translates database representation to domain model

**Governance**: Database changes don't break service contracts (transformation layer absorbs changes)

---

## 5. Cross-Layer Communication Patterns

### 5.1 Data Layer → Service Layer

**Boundary**: Supabase client + `database.types.ts`

**Protection**: Transform module isolates domain from schema

```typescript
// services/player/crud.ts
export function createPlayerCrudService(
  supabase: SupabaseClient<Database> // Typed dependency injection
) {
  return {
    create: async (data: PlayerCreateDTO): Promise<ServiceResult<PlayerDTO>> => {
      return executeOperation('create_player', async () => {
        const { data: player, error } = await supabase
          .from('player')
          .insert(data)
          .select()
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

        return toPlayerDTO(player); // Anti-corruption layer
      });
    }
  };
}
```

---

### 5.2 Service Layer → Action Layer

**Boundary**: Service interface contract

**Protection**: No business logic in actions (delegation only)

```typescript
// app/actions/player/create-player-action.ts
'use server';

export async function createPlayerAction(
  input: PlayerCreateDTO
): Promise<ServiceResult<PlayerDTO>> {
  const supabase = await createServerClient();
  const playerService = createPlayerService(supabase);

  // Delegation to service (NO business logic here)
  const result = await playerService.create(input);

  if (result.success) {
    revalidatePath('/players'); // Cache management
  }

  return result; // Pass through ServiceResult
}
```

---

### 5.3 Action Layer → UI Layer

**Boundary**: Server action contract

**Protection**: React Query manages async state

```typescript
// hooks/player/use-create-player.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPlayerAction } from '@/app/actions/player/create-player-action';

export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPlayerAction,
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries(['players']);
        toast.success('Player created!');
      }
    },
    onError: (error) => {
      toast.error('Failed to create player');
    }
  });
}
```

---

### 5.4 Cross-Domain Communication

**RULE**: Cross-domain orchestration ONLY via Action Layer

**❌ WRONG: Service-to-Service Direct Call**
```typescript
// services/player/business.ts
import { createCasinoService } from '../casino'; // VIOLATION

const casinoService = createCasinoService(supabase); // COUPLING
const casino = await casinoService.getById(casinoId); // FORBIDDEN
```

**✅ CORRECT: Action Layer Orchestration**
```typescript
// app/actions/player/assign-player-to-casino-action.ts
export async function assignPlayerToCasinoAction(
  playerId: string,
  casinoId: string
) {
  const supabase = await createServerClient();

  // Orchestrate multiple services at action layer
  const playerService = createPlayerService(supabase);
  const casinoService = createCasinoService(supabase);

  const [player, casino] = await Promise.all([
    playerService.getById(playerId),
    casinoService.getById(casinoId)
  ]);

  if (!player.success || !casino.success) {
    return {
      data: null,
      error: { code: 'NOT_FOUND', message: 'Player or Casino not found' },
      success: false
    };
  }

  // Validation and orchestration logic here
  // Services stay isolated, action coordinates
}
```

**Boundary**: Action layer is ONLY place for cross-domain orchestration

**Protection**: Services remain isolated, testable, reusable

---

## 6. When to Go Vertical vs Horizontal

### 6.1 Decision Matrix

| Scenario | Approach | Rationale |
|----------|----------|-----------|
| Adding error logging to ALL services | HORIZONTAL | Shared infrastructure, universal benefit |
| Building Player CRUD UI | VERTICAL | User-facing feature, complete slice |
| Optimizing Supabase client pooling | HORIZONTAL | Technical foundation, affects all domains |
| Implementing Visit check-in flow | VERTICAL | Domain-specific workflow, user value |
| Adding Zod validation framework | HORIZONTAL | Pattern establishment, reusable |
| Creating Rating Slip form | VERTICAL | Feature delivery, demo-able |
| Migrating to new auth system | HORIZONTAL | System-wide change, all layers |
| Adding player search functionality | VERTICAL | Feature extension, single domain |

---

### 6.2 Practical Decision Rules

**CHOOSE HORIZONTAL (Layer Addition) WHEN**:
- ✅ Building core infrastructure affecting ALL domains
- ✅ Standardizing cross-cutting concerns
- ✅ Type system evolution (database.types.ts regeneration)
- ✅ Testing infrastructure setup

**CHOOSE VERTICAL (Feature Delivery) WHEN**:
- ✅ Delivering user-facing functionality
- ✅ Domain-specific business logic
- ✅ MVP feature prioritization
- ✅ Risk mitigation through isolation

**SIMPLE RULE**:
```
If it touches 1 domain     → Go VERTICAL (feature delivery)
If it touches ALL domains  → Go HORIZONTAL (infrastructure)
If it's user-facing        → Go VERTICAL (value delivery)
If it's technical          → Go HORIZONTAL (shared concern)
```

---

## 7. Folder Structure (Real-World Example)

```
pt-2/
├── supabase/
│   └── migrations/                    # HORIZONTAL: Schema evolution
│       ├── 001_create_player.sql
│       ├── 002_create_visit.sql
│       └── 003_create_ratingslip.sql
│
├── types/
│   ├── database.types.ts              # HORIZONTAL: Single source of truth
│   ├── helpers/                       # HORIZONTAL: Shared type utilities
│   │   ├── service-result.ts
│   │   └── database-helpers.ts
│   └── domains/                       # VERTICAL: Domain DTOs
│       ├── player/
│       │   ├── player-dto.ts
│       │   ├── player-create-dto.ts
│       │   └── player-update-dto.ts
│       └── visit/
│           ├── visit-dto.ts
│           └── visit-create-dto.ts
│
├── services/
│   ├── shared/                        # HORIZONTAL: Core infrastructure
│   │   ├── operation-wrapper.ts       # executeOperation()
│   │   ├── types.ts                   # ServiceResult
│   │   └── utils.ts                   # generateRequestId()
│   │
│   ├── player/                        # VERTICAL: Player domain
│   │   ├── index.ts                   # PlayerService interface + factory
│   │   ├── crud.ts                    # CRUD module
│   │   ├── business.ts                # Business workflows
│   │   ├── queries.ts                 # Complex queries
│   │   ├── transforms.ts              # DTO mapping
│   │   └── validation.ts              # Zod schemas
│   │
│   └── visit/                         # VERTICAL: Visit domain
│       ├── index.ts
│       ├── crud.ts
│       ├── business.ts                # Session lifecycle
│       ├── queries.ts
│       ├── transforms.ts
│       └── validation.ts
│
├── lib/                               # HORIZONTAL: Shared utilities
│   ├── supabase/
│   │   ├── client.ts                  # Browser client factory
│   │   └── server.ts                  # Server client factory
│   ├── query-client.ts                # React Query config
│   └── invalidation-scheduler.ts      # Real-time batching
│
├── app/
│   ├── actions/                       # VERTICAL: Server actions by domain
│   │   ├── player/
│   │   │   ├── create-player-action.ts
│   │   │   ├── update-player-action.ts
│   │   │   └── delete-player-action.ts
│   │   └── visit/
│   │       ├── start-visit-action.ts
│   │       ├── end-visit-action.ts
│   │       └── cancel-visit-action.ts
│   │
│   └── players/                       # VERTICAL: UI routes by feature
│       ├── page.tsx                   # Player list page
│       └── [id]/
│           └── page.tsx               # Player detail page
│
├── hooks/                             # VERTICAL: React Query hooks by domain
│   ├── player/
│   │   ├── use-players.ts             # List query
│   │   ├── use-player.ts              # Single query
│   │   ├── use-create-player.ts       # Mutation
│   │   ├── use-update-player.ts       # Mutation
│   │   └── use-players-realtime.ts    # Real-time sync
│   └── visit/
│       ├── use-visits.ts
│       ├── use-start-visit.ts
│       └── use-visits-realtime.ts
│
├── components/
│   ├── ui/                            # HORIZONTAL: Shared UI primitives
│   │   ├── button.tsx
│   │   ├── form.tsx
│   │   └── dialog.tsx
│   │
│   ├── player/                        # VERTICAL: Player domain components
│   │   ├── player-list.tsx
│   │   ├── player-form.tsx
│   │   ├── player-card.tsx
│   │   └── player-detail.tsx
│   │
│   └── visit/                         # VERTICAL: Visit domain components
│       ├── visit-list.tsx
│       ├── visit-form.tsx
│       └── visit-timeline.tsx
│
└── __tests__/                         # VERTICAL: Tests by domain
    ├── services/
    │   ├── player/
    │   │   ├── player-service.test.ts
    │   │   ├── crud.test.ts
    │   │   └── player.integration.test.ts
    │   └── visit/
    │       ├── visit-service.test.ts
    │       └── visit.integration.test.ts
    ├── actions/
    │   ├── player/
    │   │   └── create-player-action.test.ts
    │   └── visit/
    │       └── start-visit-action.test.ts
    └── components/
        ├── player/
        │   └── player-form.test.tsx
        └── visit/
            └── visit-form.test.tsx
```

---

### 7.1 Navigation Guide for Developers

**Q: "Where is player creation logic?"**

A:
- **Service**: `services/player/crud.ts` (create method)
- **Action**: `app/actions/player/create-player-action.ts`
- **Hook**: `hooks/player/use-create-player.ts`
- **UI**: `components/player/player-form.tsx`

**Q: "Where are shared utilities?"**

A:
- **Type utilities**: `types/helpers/`
- **Service infrastructure**: `services/shared/`
- **Supabase clients**: `lib/supabase/`
- **UI primitives**: `components/ui/`

**Q: "How do I add a new domain?"**

A:
1. **Migration**: `supabase/migrations/xxx_create_<domain>.sql`
2. **Types**: `types/domains/<domain>/`
3. **Service**: `services/<domain>/` (use `SERVICE_TEMPLATE.md`)
4. **Actions**: `app/actions/<domain>/`
5. **Hooks**: `hooks/<domain>/`
6. **Components**: `components/<domain>/`
7. **Tests**: `__tests__/` (mirror structure)

---

## 8. Trade-offs & Risk Assessment

### 8.1 Hybrid Model Trade-offs

**BENEFITS**:

1. **Technical Clarity + Feature Delivery**
   - Horizontal layers provide clear "map" of system architecture
   - Vertical slices deliver demo-able, user-facing value
   - Solo developer gets both structure and progress tracking

2. **Zero Rework Cost**
   - Current 7 services (98 tests) remain unchanged
   - Add Action/UI layers on top (incremental)
   - 4x template velocity preserved

3. **Incremental Risk**
   - Each layer validated independently
   - Rollback points at every phase boundary
   - Service layer stability (foundation never changes)

4. **Optimal for Solo Developer**
   - Horizontal: structural predictability
   - Vertical: momentum and visible progress
   - No cognitive overload from extreme modularity

---

**COSTS**:

1. **Potential Confusion**
   - "Are we horizontal or vertical?" (both!)
   - Risk: Team might think they're mutually exclusive
   - **Mitigation**: Documentation clarifies hybrid model

2. **Discipline Required**
   - Avoid service-to-service calls (enforce via Action layer)
   - Avoid UI → Service direct access (must go through Actions)
   - **Mitigation**: ESLint rules, code review checklist

3. **Boilerplate per Feature**
   - Each vertical slice needs: action + hook + component
   - More files than pure horizontal
   - **Mitigation**: Template scaffolding (already working at 4x)

4. **Cross-Layer Dependencies**
   - Action layer must know Service interface
   - Hook must know Action signature
   - Risk: Breaking changes ripple upward
   - **Mitigation**: Explicit interfaces, semantic versioning

---

### 8.2 Risk Matrix

| Risk | Likelihood | Impact | Severity | Mitigation |
|------|-----------|--------|----------|------------|
| **Service-to-Service Coupling** | MEDIUM | HIGH | HIGH | Action layer orchestration only, ESLint ban |
| **Layer Boundary Violations** | LOW | HIGH | MEDIUM | Type safety, code review, architecture tests |
| **Over-Engineering (Premature DRY)** | MEDIUM | MEDIUM | MEDIUM | Rule of Three (wait for 3rd use case) |
| **Real-Time Memory Leaks** | MEDIUM | MEDIUM | MEDIUM | Scheduler pattern, cleanup tests, E2E validation |
| **Test Duplication** | HIGH | LOW | LOW | Focus critical paths, pyramid (60/30/10) |
| **Delayed UI Value** | MEDIUM | MEDIUM | MEDIUM | Vertical slicing from Week 2 (Player Management) |
| **Performance Degradation** | LOW | HIGH | MEDIUM | Lighthouse CI, bundle analysis, code splitting |

---

### 8.3 Comparison to Alternatives

| Approach | Overall Risk | Time to MVP | Solo Dev Fit | ROI | Recommendation |
|----------|-------------|-------------|--------------|-----|----------------|
| **Path A** (Current Trajectory) | LOW | 6 weeks | HIGH | HIGH | Fallback |
| **Path B** (Pure Vertical) | HIGH | 12 weeks | LOW | LOW | ❌ Not Recommended |
| **Path C** (Strict Horizontal) | MEDIUM | 10 weeks | MEDIUM | MEDIUM | Team Growth Path |
| **Path D** (Hybrid) | LOW | 8 weeks | HIGH | HIGHEST | ✅ **RECOMMENDED** |

**Pure Vertical (Feature Directories)**:
- Pros: Feature cohesion, easier to delete features
- Cons: 8 weeks lost velocity, CRUD duplication, unclear service boundaries
- Risk: HIGH for PT-2 (throws away working foundation)

**Strict Horizontal (Formalized Layers)**:
- Pros: Crystal clear responsibilities, easy enforcement
- Cons: Over-engineering for solo dev, rigidity, 10 weeks to MVP
- Risk: MEDIUM (boilerplate overhead, premature formalization)

**Hybrid Model (Recommended)**:
- Pros: Best trade-off, 8 weeks to MVP, zero rework, incremental risk
- Cons: Requires discipline, potential confusion
- Risk: LOW (builds on working patterns)

---

## 9. Governance & Code Ownership

### 9.1 Ownership Model

**Horizontal Ownership (Shared Infrastructure)**:
- **Owner**: Architecture team / Tech lead
- **Change Approval**: Requires cross-domain impact analysis
- **Examples**: `services/shared/`, `lib/`, `types/helpers/`
- **Governance**: Changes affect ALL domains, must be backward compatible
- **Review Process**: Multi-domain stakeholder approval

**Vertical Ownership (Domain Features)**:
- **Owner**: Domain team / Feature owner
- **Change Approval**: Domain-specific review
- **Examples**: `services/player/`, `app/actions/player/`, `hooks/player/`
- **Governance**: Changes isolated to domain, minimal cross-domain impact
- **Review Process**: Domain expertise + integration tests

---

### 9.2 Coupling Avoidance Strategies

**1. No Service-to-Service Calls**
```typescript
// ❌ BANNED
// services/player/business.ts
import { createCasinoService } from '../casino';

// ✅ ALLOWED
// app/actions/player/assign-player-action.ts
const playerService = createPlayerService(supabase);
const casinoService = createCasinoService(supabase);
```
- **Enforcement**: ESLint custom rule, code review checklist
- **Rationale**: Prevents cascading dependencies

---

**2. Published Interfaces Only**
```typescript
// ❌ BANNED: Direct internal module import
import { createPlayerCrudService } from '@/services/player/crud';

// ✅ ALLOWED: Published interface via index
import { createPlayerService } from '@/services/player';
```
- **Enforcement**: Module resolution rules, index.ts exports
- **Rationale**: Encapsulation, versioning control

---

**3. Dependency Injection**
```typescript
// ❌ BANNED: Services creating their own clients
export function createPlayerService() {
  const supabase = createClient(); // GLOBAL STATE
  // ...
}

// ✅ ALLOWED: Factory accepting typed clients
export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerService {
  // ...
}
```
- **Enforcement**: Type system (required parameter)
- **Rationale**: Testability, configuration control

---

**4. Anti-Corruption Layers**
```typescript
// ❌ BANNED: Exposing raw database rows
export async function getPlayer(id: string): Promise<PlayerRow> {
  const { data } = await supabase.from('player').select().single();
  return data; // RAW DATABASE STRUCTURE EXPOSED
}

// ✅ ALLOWED: Transform to domain DTO
export async function getPlayer(id: string): Promise<PlayerDTO> {
  const { data } = await supabase.from('player').select().single();
  return toPlayerDTO(data); // DOMAIN MODEL PROTECTED
}
```
- **Enforcement**: Transform module per service
- **Rationale**: Database changes don't break contracts

---

### 9.3 Reuse Balance

**Shared Infrastructure Reuse**:
- `executeOperation`: Every service uses for consistency
- `ServiceResult`: Standard return type across all layers
- Supabase clients: Single source of client creation
- Query client config: Shared React Query defaults

**Domain Isolation**:
- Player validation schemas: Player-specific, not reused
- Visit lifecycle logic: Visit domain only
- RatingSlip transforms: RatingSlip-specific DTOs
- MTL compliance rules: MTL domain bounded

**Balance Point**:
> "Reuse infrastructure, isolate business logic"

---

## 10. Success Metrics & Monitoring

### 10.1 Architecture Quality Indicators

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

### 10.2 Development Velocity Indicators

| Metric | Target | Measurement | Frequency |
|--------|--------|-------------|-----------|
| **New Domain Implementation** | 6 days (vertical slice) | Sprint velocity tracking | Per sprint |
| **Service Module Reusability** | >50% shared infrastructure | Code analysis tools | Monthly |
| **Test Execution Time** | <5min (unit), <15min (integration) | CI metrics | Daily |
| **Developer Onboarding Time** | <4 hours to first PR | New developer feedback | Per hire |
| **PR Review Time** | <24 hours | GitHub metrics | Weekly |
| **Bug Escape Rate** | <5% to production | Issue tracking | Monthly |

---

### 10.3 Health Indicators (Track Weekly)

**Service Layer Health**:
- Test pass rate: Target 100% (current: 100%, 98/98)
- Test coverage: Target >80% (current: >80% per service)
- PRD violations: Target 0 (current: 0)
- Service file size: Alert if >500 lines (current: <200 lines)
- Module count per service: Alert if >5 (current: 1-2)

**Action Layer Health** (Phase 3):
- Action response time: Target <500ms p95
- Cache hit rate: Target >70%
- Error rate: Target <1%
- revalidatePath calls: Monitor for over-invalidation

**UI Layer Health** (Phase 3-4):
- React Query cache size: Monitor for memory leaks
- Component render count: Alert if >10 renders/interaction
- Real-time message rate: Monitor for storm conditions
- Subscription cleanup: Alert on orphaned channels

**Architecture Drift Indicators**:
- Service-to-service calls: Target 0 (ban pattern)
- Layer boundary violations: Target 0 (ESLint enforcement)
- `any` type usage: Target 0 in services (current: 0)
- Global singletons: Target 0 (current: 0)

---

## 11. Adaptation Triggers

**Trigger 1: Service Complexity Exceeds Threshold**
- **Condition**: Any service file >500 lines OR >5 modules
- **Action**: Evaluate feature-based slicing for THAT service only
- **Example**: If PlayerService grows to 10 operations, split to `player/auth/`, `player/profile/`, `player/search/`

**Trigger 2: Team Growth**
- **Condition**: Team size >3 developers
- **Action**: Formalize layer contracts (Path C enhancements)
- **Impact**: Add ESLint rules, LAYER_CONTRACTS.md, stricter reviews

**Trigger 3: Cross-Domain Complexity**
- **Condition**: >3 services needed to fulfill single user action
- **Action**: Introduce orchestration layer or workflow module
- **Example**: "Start Visit" needs Player + Visit + RatingSlip + MTL → `visitWorkflows.startSession()`

**Trigger 4: Performance Degradation**
- **Condition**: Action response time >500ms p95 OR UI initial load >3s
- **Action**: Evaluate caching strategy, optimize queries, code splitting
- **Impact**: May require query module optimization or real-time reduction

**Trigger 5: Testing Becomes Expensive**
- **Condition**: Test suite >10 minutes OR test maintenance >20% of dev time
- **Action**: Re-evaluate testing pyramid, add integration tests, reduce unit test duplication
- **Impact**: May shift from 60% unit to 40% unit + 40% integration

---

## 12. Conclusion & Recommendations

### 12.1 Final Recommendation

**Selected Approach**: **Hybrid Model (Horizontal Layers + Vertical Delivery)**

**Rationale**:
1. **Builds on Working Foundation**: 7 services, 98 tests, zero PRD violations
2. **Fastest to Value**: First UI feature in 3 weeks (Player Management)
3. **Lowest Risk**: Incremental additions, no rework
4. **Solo Developer Friendly**: Horizontal structure + vertical progress tracking
5. **Template Velocity Preserved**: Leverages 4x improvement gains
6. **Best ROI**: 8 weeks to complete MVP vs 12 weeks (pure vertical) or 10 weeks (strict horizontal)

---

### 12.2 Implementation Principle

> **"Horizontal layers for technical architecture, vertical slices for feature delivery"**

**Architecture**:
```
Technical Layers (Horizontal):
- Data Layer: Schema, RLS, migrations
- Service Layer: Business logic, DTOs, validation
- Action Layer: Server actions, cache strategies
- UI Layer: Components, hooks, state

Delivery Cadence (Vertical):
- Week 2-3: Complete Player feature (DB → Service → Action → Hook → UI)
- Week 4-5: Complete Visit feature (DB → Service → Action → Hook → UI)
- Week 6: Complete RatingSlip feature (DB → Service → Action → Hook → UI)
```

---

### 12.3 Immediate Next Steps (Week 1)

**Priority 1: Complete Service Layer**
- [ ] Add `business.ts` modules to all 7 services (workflow orchestration)
- [ ] Add `queries.ts` modules to all 7 services (complex queries)
- [ ] Add `transforms.ts` modules to all 7 services (DTO mapping)
- [ ] Add `validation.ts` modules to all 7 services (Zod schemas)
- [ ] Integration testing + Phase 2 audit
- [ ] Update `SESSION_HANDOFF.md` with completion status

**Priority 2: Document Hybrid Model**
- [ ] Create `ADR-003-hybrid-slicing-model.md` (Architecture Decision Record)
- [ ] Update `SERVICE_TEMPLATE.md` with module patterns
- [ ] Create `ACTION_TEMPLATE.md` for server actions
- [ ] Document navigation guide for developers

---

### 12.4 Medium-Term Roadmap (Weeks 2-8)

**Weeks 2-3: First Vertical Slice (Player Management)**
- Implement Player domain actions, hooks, UI components
- E2E tests for complete CRUD flows
- Real-time multi-tab synchronization
- **DELIVERABLE**: Working Player Management feature

**Weeks 4-5: Second Vertical Slice (Visit Tracking)**
- Implement Visit domain actions, hooks, UI components
- Session lifecycle workflows (check-in, check-out, cancellation)
- Visit history and timeline views
- **DELIVERABLE**: Working Visit Tracking feature

**Week 6: Third Vertical Slice (Rating Slip Creation)**
- Implement RatingSlip domain actions, hooks, UI components
- Points calculation integration
- Performance metrics tracking
- **DELIVERABLE**: Working Rating Slip feature

**Week 7: Real-Time Infrastructure (Horizontal)**
- Create `useSupabaseChannel` wrapper hook
- Implement batch invalidation scheduler
- Domain real-time hooks for all features
- Memory leak prevention testing
- **DELIVERABLE**: Real-time UI synchronization

**Week 8: Production Hardening**
- Cross-domain integration tests
- Bundle optimization and code splitting
- Lighthouse CI gates (LCP ≤2.5s, TBT ≤200ms)
- Deployment pipeline automation
- **DELIVERABLE**: Production-ready MVP

---

### 12.5 Long-Term Evolution Strategy

**Quarter 1 (Months 1-3)**:
- Complete MVP vertical slices (Player, Visit, RatingSlip)
- Real-time infrastructure maturity
- Production deployment and monitoring

**Quarter 2 (Months 4-6)**:
- Additional domains (Casino, TableContext, MTL, PlayerFinancial)
- Advanced features (reporting, analytics, compliance)
- Performance optimization and scaling

**Quarter 3+ (Months 7+)**:
- Team growth adaptations (if applicable)
- Service complexity management (feature slicing if needed)
- Continuous architecture refinement

---

### 12.6 Success Criteria

**Phase 2 Completion** (Week 1):
- ✅ 7/7 services complete with all modules (CRUD, Business, Queries, Transforms, Validation)
- ✅ 110+ tests passing (added module tests)
- ✅ Test coverage >80% per service
- ✅ Zero PRD violations

**Phase 3 Delivery** (Weeks 2-6):
- ✅ 3 complete vertical slices delivered (Player, Visit, RatingSlip)
- ✅ Working UI for each domain
- ✅ E2E tests passing for critical flows
- ✅ Server actions <500ms p95 latency
- ✅ React Query cache hit rate >70%

**Phase 4 Real-Time** (Week 7):
- ✅ Real-time updates <1s latency
- ✅ Zero memory leaks
- ✅ Multi-tab synchronization working
- ✅ Clean subscription lifecycle

**Production Ready** (Week 8):
- ✅ Lighthouse scores: LCP ≤2.5s, TBT ≤200ms, Initial JS ≤250KB
- ✅ Zero security advisor warnings
- ✅ Deployment pipeline automated
- ✅ Health check endpoints operational

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
import type { PlayerDTO, PlayerCreateDTO, PlayerUpdateDTO, PlayerStatsDTO } from './transforms';
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

export type { PlayerDTO, PlayerCreateDTO, PlayerUpdateDTO, PlayerStatsDTO };
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

### A.4 Hook Layer

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
```

### A.5 UI Layer

```typescript
// components/player/player-form.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreatePlayer } from '@/hooks/player/use-create-player';
import { playerCreateSchema } from '@/services/player/validation';
import type { PlayerCreateDTO } from '@/services/player';

export function PlayerForm() {
  const { mutate, isPending } = useCreatePlayer();

  const form = useForm<PlayerCreateDTO>({
    resolver: zodResolver(playerCreateSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: ''
    }
  });

  const onSubmit = (data: PlayerCreateDTO) => {
    mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <label>Email</label>
        <input {...form.register('email')} />
        {form.formState.errors.email && (
          <span>{form.formState.errors.email.message}</span>
        )}
      </div>

      <div>
        <label>First Name</label>
        <input {...form.register('firstName')} />
      </div>

      <div>
        <label>Last Name</label>
        <input {...form.register('lastName')} />
      </div>

      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Player'}
      </button>
    </form>
  );
}
```

---

## Appendix B: ESLint Rules for Enforcement

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    // Ban service-to-service imports
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../*/index', '../*/crud', '../*/business'],
            message: 'Cross-domain service imports forbidden. Use Action layer orchestration.'
          }
        ]
      }
    ],

    // Ban direct Supabase client creation in services
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="createClient"]',
        message: 'Services must receive Supabase client via dependency injection.'
      }
    ]
  }
};
```

---

## Document Metadata

- **Version**: 1.0
- **Author**: Architecture Team
- **Date**: 2025-10-09
- **Status**: Recommended for Adoption
- **Review Date**: 2025-10-23 (2 weeks)
- **Related Documents**:
  - `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`
  - `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
  - `docs/phase-2/SERVICE_RESPONSIBILITY_MATRIX.md`
  - `docs/architecture/slicing/HORIZONTAL_LAYERING_ANALYSIS.md`
  - `docs/architecture/slicing/VERTICAL_SLICING_PHILOSOPHY.md`
  - `docs/architecture/slicing/RISK_AND_MIGRATION_ANALYSIS.md`

---

**END OF ANALYSIS**
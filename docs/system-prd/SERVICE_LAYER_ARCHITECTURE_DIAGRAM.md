# PT-1 Canonical Service Layer Architecture

## Service Layer Blueprint for PT-2 Implementation

This diagram captures the proven service patterns from PT-1 (90/100 score) while eliminating anti-patterns discovered through comprehensive service analysis:

### Type System Anti-Patterns (Eliminated)

- `ReturnType<typeof createXService>` inference instead of explicit interfaces
- `supabase: any` parameters losing type safety
- Incomplete interfaces requiring `as any` casting
- Object spread composition without type guards

### Architectural Anti-Patterns (Eliminated)

- Dual rating-slip implementation
- Class-based service abstractions (BaseService)
- Over-engineered ServiceFactory with internal caching/metrics
- Deprecated class wrappers delegating to functional services
- Duplicate/competing factory patterns
- Global state management in services
- Global real-time managers (connection pools, offline managers)

### Export/Module Anti-Patterns (Eliminated)

- Mixed default and named exports
- Zero-value wrapper functions
- Runtime validation in factory functions

**Analysis Sources**: Player, Visit, Rating Slip, Casino, MTL, Compliance, Table Context services from PT-1

```mermaid
graph TB
    %% Client Layer
    subgraph "Client Layer"
        UI[UI Components]
        Hooks[React Query Hooks]
        Actions[Server Actions]
    end

    %% Service Orchestration Layer
    subgraph "Service Orchestration"
        SF[Functional Factories<br/>createXService()]
        OW[Operation Wrapper<br/>ServiceResult&lt;T&gt;]
    end

    %% Core Domain Services
    subgraph "Core Domain Services"
        PS[Player Service]
        VS[Visit Service]
        RS[Rating Slip Service<br/>SINGLE IMPLEMENTATION]
        CS[Casino Service]
        TC[Table Context Service]
        MS[MTL Service]
        NS[Notes Service]
        CPS[Compliance Service]
    end

    %% Service Module Composition Pattern
    subgraph "Service Module Pattern"
        direction LR
        CRUD[CRUD Module<br/>Basic Operations]
        BUS[Business Module<br/>Workflows]
        QRY[Query Module<br/>Complex Queries]
        TRN[Transform Module<br/>DTO Mapping]
        VAL[Validation Module<br/>Schema Checks]
    end

    %% Shared Service Infrastructure
    subgraph "Shared Infrastructure"
        EH[Error Handling<br/>withErrorHandling]
        SR[ServiceResult Type]
        DTO[Domain DTOs]
        VAL_SCH[Validation Schemas]
    end

    %% Data Layer
    subgraph "Data Layer"
        SB[Supabase Client]
        DB[(PostgreSQL<br/>RLS Enabled)]
        RT[Real-time<br/>Subscriptions]
    end

    %% Connections - Client to Service
    UI --> Hooks
    Hooks --> SF
    Actions --> SF

    %% Service Factory Pattern
    SF --> OW
    OW --> PS & VS & RS & CS & TC & MS & NS & CPS

    %% Module Composition for Each Service
    PS -.-> CRUD
    PS -.-> BUS
    PS -.-> QRY
    PS -.-> TRN
    PS -.-> VAL

    VS -.-> CRUD
    VS -.-> BUS
    VS -.-> QRY
    VS -.-> TRN
    VS -.-> VAL

    RS -.-> CRUD
    RS -.-> BUS
    RS -.-> QRY
    RS -.-> TRN
    RS -.-> VAL

    CS -.-> CRUD
    CS -.-> BUS
    CS -.-> QRY
    CS -.-> TRN
    CS -.-> VAL

    TC -.-> CRUD
    TC -.-> BUS
    TC -.-> QRY
    TC -.-> TRN
    TC -.-> VAL

    MS -.-> CRUD
    MS -.-> BUS
    MS -.-> QRY
    MS -.-> TRN
    MS -.-> VAL

    %% Shared Infrastructure Usage
    CRUD --> EH
    BUS --> EH
    QRY --> EH
    EH --> SR
    TRN --> DTO
    VAL --> VAL_SCH

    %% Data Layer Connections
    CRUD --> SB
    BUS --> SB
    QRY --> SB
    SB --> DB
    SB --> RT

    %% Styling
    classDef service fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef module fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef infra fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef data fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef client fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef orchestration fill:#f0f4c3,stroke:#33691e,stroke-width:2px

    class PS,VS,RS,CS,TC,MS,NS,CPS service
    class CRUD,BUS,QRY,TRN,VAL module
    class EH,SR,DTO,VAL_SCH infra
    class SB,DB,RT data
    class UI,Hooks,Actions client
    class SF,OW orchestration
```

## Key Architectural Patterns

### 1. Functional Factory Pattern with Explicit Interfaces

```typescript
// ✅ CORRECT: Explicit interface with complete type signatures
export interface PlayerService {
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  searchPlayers(query: string): Promise<ServiceResult<PlayerDTO[]>>;
  create(data: PlayerCreateDTO): Promise<ServiceResult<PlayerDTO>>;
  update(id: string, data: PlayerUpdateDTO): Promise<ServiceResult<PlayerDTO>>;
}

// ✅ CORRECT: Typed factory returning explicit interface
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {
  const crudService = createPlayerCrudService(supabase);
  const searchService = createPlayerSearchService(supabase);
  const queryService = createPlayerQueryService(supabase);

  // Pure composition - no internal state or side effects
  return {
    ...crudService,
    ...searchService,
    ...queryService,
  };
}

// ✅ CORRECT: Export explicit type, not ReturnType inference
export type PlayerServiceType = PlayerService;

// ❌ ANTI-PATTERNS TO AVOID (from PT-1 analysis):
// NO: class BaseService { ... }
// NO: ServiceFactory.getInstance().getService('player')
// NO: export type PlayerService = ReturnType<typeof createPlayerService>
// NO: createPlayerService(supabase: any) - must type as SupabaseClient<Database>
// NO: return { ...(service as any).hiddenMethod } - incomplete interfaces
// NO: @deprecated class wrappers that delegate to functional services
// NO: default exports mixed with named exports
```

### 2. Operation Wrapper Pattern

```typescript
// Standardized error handling and result transformation
export async function executeOperation<T>(
  label: string,
  operation: () => Promise<any>,
  options?: OperationOptions,
): Promise<ServiceResult<T>>;
```

### 3. Module Composition

Each domain service is composed of specialized modules:

- **CRUD**: Basic database operations (create, read, update, delete)
- **Business**: Complex workflows and orchestration
- **Query**: Advanced queries and aggregations
- **Transform**: DTO mapping and data transformation
- **Validation**: Input validation using schemas

### 4. ServiceResult Pattern

```typescript
interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
  success: boolean;
  status: number;
  timestamp: string;
  requestId: string;
}
```

## Domain Service Responsibilities

### Player Service

- Player CRUD operations
- Player search functionality
- Identity management
- Profile validation

### Visit Service

- Visit lifecycle (start/end/complete/cancel)
- Active visit tracking
- Visit statistics
- State transition validation

### Rating Slip Service (SINGLE IMPLEMENTATION)

- Rating slip creation and management
- Point calculations
- Table/seat assignments
- Status transitions
- **NO DUAL LAYER** - Single service implementation

### Casino Service

- Casino settings management
- Gaming table configuration
- Floor management
- Game settings

### Table Context Service

- Table lifecycle operations
- Inventory management
- Chip counts and drops
- Shift handovers
- Fill slips

### MTL Service (Compliance)

- Money transaction logging
- CTR reporting ($10k threshold)
- Gaming day calculations
- Compliance reporting
- Audit trails

### Notes Service

- Player notes management
- Staff notes
- Audit logging for notes

### Compliance Service

- Witness checks
- Compliance validations
- Regulatory reporting

## Implementation Guidelines for PT-2

### DO:

✅ Use plain functional factories for service creation
✅ Declare explicit interfaces for all services with complete type signatures
✅ Type `supabase` parameter as `SupabaseClient<Database>` (never `any`)
✅ Export explicit types, not `ReturnType<typeof createXService>`
✅ Compose services from specialized modules with typed spread
✅ Return `ServiceResult<T>` from all operations
✅ Use `executeOperation` wrapper for consistency
✅ Keep business logic in business modules
✅ Use DTOs at service boundaries
✅ Validate inputs with schemas
✅ Enable RLS on all tables
✅ Keep factories pure and stateless
✅ Use named exports exclusively (no default exports)

### DON'T (PT-1 Anti-Patterns):

❌ Use class inheritance (BaseService, abstract classes)
❌ Create ServiceFactory with caching/metrics side effects
❌ Create duplicate/competing factory patterns (createXService + createXServices)
❌ Use `ReturnType<typeof createXService>` for type inference
❌ Type parameters as `any` (violations: Casino, MTL services)
❌ Use `as any` type casting to bypass incomplete interfaces (violation: Visit service)
❌ Create deprecated class wrappers that delegate to functional services
❌ Leave methods undeclared in interfaces (must be complete)
❌ Mix default and named exports from service modules
❌ Add runtime validation in factory functions (use dev-only assertions)
❌ Create zero-value wrapper functions that just alias services
❌ Put business logic in CRUD modules
❌ Access Supabase directly from UI
❌ Store server data in Zustand
❌ Use `staleTime: 0` in React Query without justification
❌ Create global real-time managers (connection pools, offline managers)
❌ Mix service and type responsibilities
❌ Cache service instances or add internal state

## Migration Priorities

1. **Phase 1**: Core infrastructure (operation wrapper, service result, error handling)
2. **Phase 2**: Player and Visit services (foundational domains)
3. **Phase 3**: Rating Slip service (single implementation only)
4. **Phase 4**: Casino and Table Context services
5. **Phase 5**: MTL and Compliance services (regulatory requirements)

## Performance Considerations

- Use `executeTrackedOperation` for performance monitoring
- Implement proper cleanup for real-time subscriptions
- Batch React Query invalidations
- Use dynamic imports for heavy components
- Keep initial bundle under 250KB

## Type System Integration

```typescript
// Single source of truth
import type { Database } from "@/database.types";

// Domain DTOs reference canonical types
type PlayerDTO = Pick<
  Database["public"]["Tables"]["player"]["Row"],
  "id" | "email" | "first_name" | "last_name"
>;

// Service boundaries use DTOs
interface PlayerService {
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  create(data: PlayerCreateDTO): Promise<ServiceResult<PlayerDTO>>;
}
```

## Service Layer Folder Structure

```
services/
├── shared/                          # Shared infrastructure
│   ├── operation-wrapper.ts         # executeOperation, ServiceResult
│   ├── error-handling.ts           # withErrorHandling wrapper
│   ├── types.ts                    # ServiceResult, ServiceError types
│   └── utils.ts                    # generateRequestId, etc.
│
├── player/                          # Player domain service
│   ├── index.ts                    # Main factory + interface export
│   ├── crud.ts                     # CRUD operations module
│   ├── business.ts                 # Business logic module
│   ├── queries.ts                  # Complex queries module
│   ├── transforms.ts               # DTO mapping module
│   └── validation.ts               # Zod schemas module
│
├── visit/                           # Visit domain service
│   ├── index.ts
│   ├── crud.ts
│   ├── business.ts
│   ├── queries.ts
│   ├── transforms.ts
│   └── validation.ts
│
├── rating-slip/                     # Rating Slip domain (SINGLE)
│   ├── index.ts
│   ├── crud.ts
│   ├── business.ts
│   ├── queries.ts
│   ├── transforms.ts
│   └── validation.ts
│
├── casino/                          # Casino domain service
│   ├── index.ts
│   ├── crud.ts
│   ├── business.ts
│   ├── queries.ts
│   ├── transforms.ts
│   └── validation.ts
│
├── table-context/                   # Table Context domain
│   ├── index.ts
│   ├── crud.ts
│   ├── business.ts
│   ├── queries.ts
│   ├── transforms.ts
│   └── validation.ts
│
├── mtl/                             # MTL/Compliance domain
│   ├── index.ts
│   ├── crud.ts
│   ├── business.ts
│   ├── queries.ts
│   ├── transforms.ts
│   ├── validation.ts
│   └── reports.ts                  # CTR reporting logic
│
├── notes/                           # Notes domain service
│   ├── index.ts
│   ├── crud.ts
│   ├── business.ts
│   ├── queries.ts
│   ├── transforms.ts
│   └── validation.ts
│
└── compliance/                      # Compliance domain
    ├── index.ts
    ├── crud.ts
    ├── business.ts
    ├── queries.ts
    ├── transforms.ts
    └── validation.ts
```

### Module Responsibilities

**`index.ts`** - Main service factory

```typescript
export interface PlayerService {
  /* explicit interface */
}
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService;
export type PlayerServiceType = PlayerService;
```

**`crud.ts`** - Basic database operations

```typescript
export function createPlayerCrudService(supabase: SupabaseClient<Database>) {
  return {
    getById: async (id: string) => executeOperation(...),
    create: async (data: PlayerCreateDTO) => executeOperation(...),
    update: async (id: string, data: PlayerUpdateDTO) => executeOperation(...),
    delete: async (id: string) => executeOperation(...)
  }
}
```

**`business.ts`** - Domain workflows and orchestration

```typescript
export function createPlayerBusinessService(supabase: SupabaseClient<Database>) {
  return {
    activatePlayer: async (id: string) => executeOperation(...),
    deactivatePlayer: async (id: string) => executeOperation(...),
    // Complex multi-step operations
  }
}
```

**`queries.ts`** - Advanced queries and aggregations

```typescript
export function createPlayerQueriesService(supabase: SupabaseClient<Database>) {
  return {
    searchPlayers: async (query: string) => executeOperation(...),
    getPlayerStats: async (id: string) => executeOperation(...),
    // Complex read operations
  }
}
```

**`transforms.ts`** - DTO mapping and data transformation

```typescript
export function toPlayerDTO(
  row: Database["public"]["Tables"]["player"]["Row"],
): PlayerDTO;
export function toPlayerView(dto: PlayerDTO): PlayerViewDTO;
```

**`validation.ts`** - Zod schemas for input validation

```typescript
export const playerCreateSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
});

export const playerUpdateSchema = playerCreateSchema.partial();
```

### Anti-Patterns to Avoid in Structure

❌ **NO** `services/base.service.ts` - No class-based abstractions
❌ **NO** `services/service.factory.ts` - No factory with caching/metrics
❌ **NO** `services/real-time/` - No global real-time managers
❌ **NO** `services/player/lightweight-player-service.ts` - No duplicate implementations
❌ **NO** `services/player/types.ts` - Types belong in `types/domains/player/`
❌ **NO** mixing service logic with type definitions in same file

This architecture provides a clean, testable, and maintainable foundation for PT-2 while preserving the proven patterns from PT-1.

# PT-1 Canonical Service Layer Architecture

## Service Layer Blueprint for PT-2 Implementation

This diagram captures the proven service patterns from PT-1 (90/100 score) while eliminating anti-patterns including:
- Dual rating-slip implementation
- Class-based service abstractions (BaseService)
- Over-engineered ServiceFactory with internal caching/metrics
- Global state management in services

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

### 1. Functional Factory Pattern (No Classes)
```typescript
// ✅ CORRECT: Plain functional factory - no classes or caching
export function createPlayerService(supabase: SupabaseClient<Database>) {
  const crudService = createPlayerCrudService(supabase)
  const searchService = createPlayerSearchService(supabase)
  const queryService = createPlayerQueryService(supabase)

  // Pure composition - no internal state or side effects
  return {
    ...crudService,
    ...searchService,
    ...queryService
  }
}

// ❌ AVOID: Class-based abstractions and ServiceFactory with caching
// NO: class BaseService { ... }
// NO: ServiceFactory.getInstance().getService('player')
```

### 2. Operation Wrapper Pattern
```typescript
// Standardized error handling and result transformation
export async function executeOperation<T>(
  label: string,
  operation: () => Promise<any>,
  options?: OperationOptions
): Promise<ServiceResult<T>>
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
  data: T | null
  error: ServiceError | null
  success: boolean
  status: number
  timestamp: string
  requestId: string
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
✅ Compose services from specialized modules
✅ Return `ServiceResult<T>` from all operations
✅ Use `executeOperation` wrapper for consistency
✅ Keep business logic in business modules
✅ Use DTOs at service boundaries
✅ Validate inputs with schemas
✅ Enable RLS on all tables
✅ Keep factories pure and stateless

### DON'T:
❌ Use class inheritance (BaseService, abstract classes)
❌ Create ServiceFactory with caching/metrics side effects
❌ Create duplicate service implementations
❌ Put business logic in CRUD modules
❌ Access Supabase directly from UI
❌ Store server data in Zustand
❌ Use `staleTime: 0` in React Query
❌ Create global real-time managers
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
import type { Database } from '@/database.types'

// Domain DTOs reference canonical types
type PlayerDTO = Pick<Database['public']['Tables']['player']['Row'],
  'id' | 'email' | 'first_name' | 'last_name'>

// Service boundaries use DTOs
interface PlayerService {
  getById(id: string): Promise<ServiceResult<PlayerDTO>>
  create(data: PlayerCreateDTO): Promise<ServiceResult<PlayerDTO>>
}
```

This architecture provides a clean, testable, and maintainable foundation for PT-2 while preserving the proven patterns from PT-1.
# Domain-Driven Vertical Slicing Analysis

**Version**: 1.0.0
**Date**: 2025-10-09
**Author**: System Architect
**Status**: Analysis Complete - Pending Review

---

## Executive Summary

This document analyzes PT-2's architecture for domain-driven vertical slicing implementation. Based on comprehensive review of the Service Responsibility Matrix, Service Layer Architecture, and Vertical Slicing Philosophy, this analysis recommends **domain-level vertical slices** aligned with bounded contexts rather than fine-grained feature-level slices.

**Key Recommendation**: Treat each bounded context (Player, Casino, Visit, RatingSlip, PlayerFinancial) as a complete vertical slice spanning database → service → action → hook → UI, leveraging the existing horizontal service module pattern (CRUD/Business/Query) as internal structure within each vertical.

---

## 1. Vertical Slice Definition & Boundaries

### 1.1 Recommended Approach: Domain-Level Vertical Slices

**Definition**: Each bounded context constitutes one vertical slice containing all features for that domain.

**Rationale**:
- Aligns with established bounded context boundaries from Service Responsibility Matrix
- Leverages existing service layer structure (CRUD/Business/Query modules)
- Matches natural aggregate root patterns (Player, Visit, RatingSlip)
- Reduces duplication compared to feature-level slicing
- Simplifies team ownership and testing boundaries

### 1.2 Identified Vertical Slices

Based on the Bounded Context Map, PT-2 architecture decomposes into **five primary vertical slices**:

#### Slice 1: Identity Context (Player)
**Bounded Context**: "Who is this player?"

**Ownership**:
- Database: `player` table with identity, contact, loyalty tier
- Service: `services/player/` (CRUD, business, queries, transforms, validation)
- Actions: `app/actions/player-actions.ts`
- Hooks: `hooks/player/` (usePlayer, usePlayerSearch, usePlayerMutations)
- UI: `app/(dashboard)/players/` (list, detail, create, update forms)

**Aggregates**:
- Total visits (via Visit service)
- Total points (via RatingSlip service)
- Financial history (via PlayerFinancial service)

**Dependencies**: None (foundation slice)

---

#### Slice 2: Location Context (Casino)
**Bounded Context**: "Where is gaming activity happening?"

**Ownership**:
- Database: `casino`, `gamingtable` tables
- Service: `services/casino/` (casino CRUD, table management, game configs)
- Actions: `app/actions/casino-actions.ts`
- Hooks: `hooks/casino/` (useCasino, useTables, useGameSettings)
- UI: `app/(dashboard)/casinos/` (floor management, table configuration)

**Aggregates**:
- Active visits per casino
- Table utilization metrics
- Rating slips per table

**Dependencies**: None (foundation slice)

---

#### Slice 3: Session Context (Visit)
**Bounded Context**: "What is the player's session at the casino?"

**Ownership**:
- Database: `visit` table (check-in/out, mode, status)
- Service: `services/visit/` (lifecycle management, state transitions)
- Actions: `app/actions/visit-actions.ts`
- Hooks: `hooks/visit/` (useVisit, useActiveVisits, useVisitLifecycle)
- UI: `app/(dashboard)/visits/` (check-in, session tracking, check-out)

**Aggregates**:
- Rating slips for visit
- Financial transactions for visit
- Session duration and activity metrics

**Dependencies**:
- Player (FK: player_id)
- Casino (FK: casino_id)

**Integration Pattern**: Server actions orchestrate Player + Casino lookups before creating Visit

---

#### Slice 4: Performance Context (RatingSlip)
**Bounded Context**: "How well did the player perform?"

**Ownership**:
- Database: `ratingslip` table (avg bet, time played, points, game settings)
- Service: `services/ratingslip/` (performance metrics, point calculations, status transitions)
- Actions: `app/actions/ratingslip-actions.ts`
- Hooks: `hooks/ratingslip/` (useRatingSlip, useActiveSlips, usePointCalculation)
- UI: `app/(dashboard)/performance/` (rating slip creation, real-time tracking, closure)

**Aggregates**: None (leaf entity in performance ledger)

**Dependencies**:
- Player (FK: player_id)
- Visit (FK: visit_id)
- Gaming Table (FK: gamingtable_id)

**Integration Pattern**: Actions coordinate Visit validation + Table availability before creating RatingSlip

---

#### Slice 5: Finance Context (PlayerFinancial)
**Bounded Context**: "What money/chips moved in/out?"

**Ownership**:
- Database: `player_financial_transaction` table (cash in/out, chips, reconciliation)
- Service: `services/player-financial/` (financial transactions, reconciliation, net change)
- Actions: `app/actions/financial-actions.ts` (pending)
- Hooks: `hooks/financial/` (useFinancialTransactions, useReconciliation) (pending)
- UI: `app/(dashboard)/finance/` (transaction log, reconciliation dashboard) (pending)

**Aggregates**: None (financial ledger entries)

**Dependencies**:
- Player (FK: player_id)
- Visit (FK: visit_id)
- RatingSlip (FK: rating_slip_id, optional)

**Integration Pattern**: Optional link to RatingSlip for performance-tied financial tracking

---

### 1.3 Vertical Slice Characteristics

Each vertical slice exhibits:

**Complete User Journey Ownership**:
- Database schema migrations (forward-only)
- RLS policies for security
- Service layer with explicit interfaces
- Server actions for orchestration
- React Query hooks for data fetching
- UI components for presentation
- Unit, integration, and E2E tests

**Independent Deployability**:
- Player slice can deploy without Visit slice
- Casino slice evolves independently
- Performance and Finance slices can proceed in parallel

**Bounded Context Integrity**:
- Services reference foreign domains by ID only (no direct service calls)
- Aggregation happens at action layer (explicit orchestration)
- DTOs define cross-domain communication contracts

---

## 2. Implementation Sequencing Strategy

### 2.1 Dependency-Driven Delivery Order

Based on foreign key dependencies and business value, the recommended implementation sequence:

#### Phase 1: Foundation Verticals (Parallel Development)
**Slices**: Player Identity + Casino Location
**Duration**: 2-3 weeks
**Rationale**: No dependencies, can be developed in parallel

**Player Identity Deliverables**:
- Database: Already exists (player table with RLS)
- Service: Already implemented (CRUD, business, queries)
- Actions: Create player-actions.ts with CRUD operations
- Hooks: usePlayer, usePlayerList, usePlayerSearch, usePlayerMutations
- UI: Player list, player detail, create/edit forms
- Tests: Service unit tests (existing), action integration tests, hook tests, E2E player CRUD

**Casino Location Deliverables**:
- Database: Already exists (casino, gamingtable tables)
- Service: Already implemented (casino CRUD, table management)
- Actions: Create casino-actions.ts with casino + table operations
- Hooks: useCasino, useCasinoList, useTables, useTableMutations
- UI: Casino list, floor view, table configuration
- Tests: Service unit tests (existing), action integration tests, hook tests, E2E casino/table management

**Success Criteria**:
- User can create/update/delete players
- User can manage casino settings and gaming tables
- All tests passing with >80% coverage
- Lighthouse performance budgets met (LCP ≤ 2.5s, JS ≤ 250KB)

---

#### Phase 2: Session Context (Sequential Development)
**Slice**: Visit Session
**Duration**: 2 weeks
**Rationale**: Requires Player + Casino integration, critical for Phase 3

**Visit Session Deliverables**:
- Database: Already exists (visit table with lifecycle states)
- Service: Already implemented (visit CRUD, lifecycle management)
- Actions: Create visit-actions.ts with check-in/check-out workflows
  - `startVisitAction(playerId, casinoId)` - Validates player + casino, creates visit
  - `endVisitAction(visitId)` - Closes visit, triggers cleanup
  - `getActiveVisitsAction(casinoId)` - Cross-domain query for dashboard
- Hooks: useVisit, useActiveVisits, useVisitLifecycle
- UI: Check-in form, active visits dashboard, check-out workflow
- Tests: Cross-domain integration tests (Player + Casino + Visit), visit lifecycle E2E

**Integration Points**:
- Action layer calls PlayerService.getById() + CasinoService.getById() before VisitService.create()
- Visit closure triggers RatingSlip/Financial queries for session summary
- Real-time updates via useSupabaseChannel for active visit tracking

**Success Criteria**:
- User can check in player to casino (validates both exist)
- Active visits display correctly with player + casino details
- Visit closure workflow completes successfully
- Real-time updates reflect visit state changes

---

#### Phase 3: Performance & Finance (Parallel Development)
**Slices**: RatingSlip Performance + PlayerFinancial Finance
**Duration**: 3-4 weeks
**Rationale**: Both depend on Visit, can proceed in parallel, deliver core business value

**RatingSlip Performance Deliverables**:
- Database: Already exists (ratingslip table with UUID migration applied)
- Service: Already implemented (rating slip CRUD, point calculations)
- Actions: Create ratingslip-actions.ts
  - `createRatingSlipAction(visitId, tableId, initialBet)` - Validates visit + table
  - `updateRatingSlipAction(slipId, metrics)` - Updates performance data
  - `closeRatingSlipAction(slipId)` - Finalizes points, triggers reconciliation
- Hooks: useRatingSlip, useActiveSlipsByTable, usePointCalculation
- UI: Rating slip creation, real-time performance tracker, closure form
- Tests: Performance calculation unit tests, cross-domain integration (Visit + Table + RatingSlip)

**PlayerFinancial Finance Deliverables**:
- Database: Already exists (player_financial_transaction table)
- Service: Implement PlayerFinancialService following service template
  - CRUD operations (create, getById, getByVisitId, getByPlayerId)
  - Business logic (reconciliation, net change calculation)
  - Query operations (financial summary, transaction history)
- Actions: Create financial-actions.ts
  - `recordTransactionAction(playerId, visitId, transactionData)`
  - `reconcileVisitAction(visitId)` - Aggregates all transactions for visit
  - `getPlayerFinancialSummaryAction(playerId)` - Historical view
- Hooks: useFinancialTransaction, useVisitReconciliation, usePlayerFinancialHistory
- UI: Transaction log, reconciliation dashboard, financial summary
- Tests: Reconciliation logic unit tests, cross-domain integration (Player + Visit + Financial)

**Integration Points**:
- RatingSlip and Financial both reference Visit but do NOT call each other
- Session summary action aggregates both RatingSlip + Financial data
- Optional FK (rating_slip_id) links financial transactions to performance context

**Success Criteria**:
- User can create and track rating slips with real-time point calculations
- User can record financial transactions (cash in/out, chips)
- Visit closure aggregates both performance and financial data
- No cross-domain service calls (all orchestration in actions)

---

### 2.2 Rationale for Sequencing

**Player + Casino First**:
- Foundation slices with no dependencies
- Validates service → action → hook → UI pattern before complexity
- Delivers immediate business value (player management)
- Parallel development maximizes velocity

**Visit Second**:
- First cross-domain integration point (tests orchestration pattern)
- Required dependency for Performance and Finance slices
- Validates real-time subscription patterns
- Critical path for remaining slices

**RatingSlip + PlayerFinancial Last**:
- Most complex business logic (performance calculations, reconciliation)
- Benefits from established patterns from earlier slices
- Parallel development maintains velocity
- Delivers highest business value (tracking and compliance)

---

## 3. Integration Patterns Between Slices

### 3.1 Service Layer Integration (Forbidden)

**Rule**: Services NEVER call other services directly.

**Anti-Pattern**:
```typescript
// ❌ FORBIDDEN: Service-to-service call
class RatingSlipService {
  async create(data) {
    const visit = await visitService.getById(data.visitId); // ❌
    return this.insert(data);
  }
}
```

**Rationale**:
- Creates tight coupling between domains
- Violates bounded context integrity
- Makes testing difficult (cascading mocks)
- Obscures transaction boundaries

---

### 3.2 Action Layer Orchestration (Required)

**Rule**: Server actions orchestrate cross-domain workflows.

**Correct Pattern**:
```typescript
// ✅ CORRECT: Action orchestrates multiple services
export async function createRatingSlipAction(data: RatingSlipCreateInput) {
  const supabase = createClient();

  // Orchestrate domain services
  const visitService = createVisitService(supabase);
  const tableService = createTableService(supabase);
  const ratingSlipService = createRatingSlipService(supabase);

  // Validate cross-domain constraints
  const visitResult = await visitService.getById(data.visitId);
  if (!visitResult.success) {
    return { success: false, error: 'Visit not found' };
  }

  const tableResult = await tableService.getById(data.tableId);
  if (!tableResult.success) {
    return { success: false, error: 'Table not found' };
  }

  // Create rating slip after validation
  const slipResult = await ratingSlipService.create(data);

  // Invalidate relevant caches
  revalidatePath(`/visits/${data.visitId}`);

  return slipResult;
}
```

**Benefits**:
- Explicit orchestration logic
- Clear transaction boundaries
- Services remain pure and testable
- Cache invalidation centralized

---

### 3.3 Data Flow Pattern

```
┌──────────────────────────────────────────────────────────────┐
│                      Client Layer (UI)                        │
│  • Player List Component                                      │
│  • Visit Dashboard Component                                  │
│  • RatingSlip Tracker Component                              │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                   React Query Hooks Layer                     │
│  • usePlayerList() → fetches via action                       │
│  • useActiveVisits() → fetches via action                     │
│  • useRatingSlipsByTable() → fetches + real-time updates     │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                 Server Actions Layer (Orchestration)          │
│  • getPlayerListAction() → PlayerService.list()               │
│  • getActiveVisitsAction(casinoId) →                         │
│      VisitService.getActive() +                               │
│      PlayerService.getById() +                                │
│      CasinoService.getById()                                  │
│  • createRatingSlipAction(data) →                            │
│      VisitService.getById() +                                 │
│      TableService.getById() +                                 │
│      RatingSlipService.create()                              │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│              Service Layer (Domain Boundaries)                │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐         │
│  │   Player    │  │    Visit    │  │  RatingSlip  │         │
│  │   Service   │  │   Service   │  │   Service    │         │
│  │             │  │             │  │              │         │
│  │ • getById() │  │ • getActive│  │ • create()   │         │
│  │ • list()    │  │ • create()  │  │ • getByVisit│         │
│  └─────────────┘  └─────────────┘  └──────────────┘         │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                    Database Layer (RLS)                       │
│  • player table                                               │
│  • visit table (FK: player_id, casino_id)                    │
│  • ratingslip table (FK: player_id, visit_id, table_id)     │
│  • RLS policies enforce security                             │
│  • Foreign keys enforce referential integrity                │
└──────────────────────────────────────────────────────────────┘
```

---

### 3.4 Cross-Domain Query Aggregation

**Example**: "Get complete session summary for a visit"

```typescript
// Server Action: Session summary aggregation
export async function getSessionSummaryAction(visitId: string) {
  const supabase = createClient();

  // Instantiate domain services
  const visitService = createVisitService(supabase);
  const ratingSlipService = createRatingSlipService(supabase);
  const financialService = createPlayerFinancialService(supabase);
  const playerService = createPlayerService(supabase);
  const casinoService = createCasinoService(supabase);

  // Parallel fetch from independent domains
  const [visit, ratingSlips, transactions] = await Promise.all([
    visitService.getById(visitId),
    ratingSlipService.getByVisitId(visitId),
    financialService.getByVisitId(visitId),
  ]);

  if (!visit.success) {
    return { success: false, error: 'Visit not found' };
  }

  // Fetch referenced entities
  const [player, casino] = await Promise.all([
    playerService.getById(visit.data.player_id),
    casinoService.getById(visit.data.casino_id),
  ]);

  // Aggregate at action layer
  return {
    success: true,
    data: {
      visit: visit.data,
      player: player.data,
      casino: casino.data,
      performance: {
        totalPoints: ratingSlips.data?.reduce((sum, slip) => sum + slip.points, 0) ?? 0,
        totalTimeSeconds: ratingSlips.data?.reduce((sum, slip) => sum + slip.accumulated_seconds, 0) ?? 0,
        slips: ratingSlips.data ?? [],
      },
      finance: {
        totalCashIn: transactions.data?.reduce((sum, tx) => sum + (tx.cash_in ?? 0), 0) ?? 0,
        totalChipsOut: transactions.data?.reduce((sum, tx) => sum + (tx.chips_taken ?? 0), 0) ?? 0,
        transactions: transactions.data ?? [],
      },
    },
  };
}
```

**Key Principles**:
- Aggregation logic lives in action, not in services
- Parallel fetches for independent domains
- Sequential fetches for dependent data (visit → player/casino)
- Structured return type with clear domain sections

---

### 3.5 Real-Time Cross-Domain Updates

**Pattern**: Domain-specific hooks with batched invalidations

```typescript
// Hook: Real-time visit updates with cross-domain cache invalidation
export function useVisitRealtime(visitId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`visit:${visitId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'visit', filter: `id=eq.${visitId}` },
        (payload) => {
          // Batch invalidations using scheduler
          scheduleBatchInvalidation(queryClient, [
            ['visit', 'detail', visitId],
            ['visit', 'list'],
            ['ratingslip', 'by-visit', visitId], // Cross-domain invalidation
            ['financial', 'by-visit', visitId],  // Cross-domain invalidation
          ]);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [visitId, queryClient]);
}
```

**Benefits**:
- Domain-specific subscription scope
- Cross-domain cache invalidation without service coupling
- Scheduler batches invalidations (prevents React Query storms)
- Clean cleanup on unmount

---

## 4. Cross-Cutting Concerns

### 4.1 Shared Infrastructure (Horizontal Layers)

Cross-cutting concerns are handled at specific horizontal layers within the vertical slice architecture:

#### Database Layer Cross-Cutting
**Location**: Supabase migrations, RLS policies, triggers

**Concerns**:
- RLS policies (shared policy templates)
- Audit logging triggers (AuditLog table)
- UUID generation (gen_random_uuid())
- Timestamp defaults (created_at, updated_at)

**Pattern**: Shared migration templates applied per domain table

```sql
-- Example: Shared RLS policy template
CREATE POLICY "Users can view their own records"
ON player
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Applied consistently across player, visit, ratingslip tables
```

---

#### Service Layer Cross-Cutting
**Location**: `services/shared/`

**Concerns**:
- Operation wrapper (`executeOperation`)
- ServiceResult type and builders
- Error catalogues and mapping
- Request ID generation
- Validation utilities

**Pattern**: Pure functions imported by domain services

```typescript
// services/shared/operation-wrapper.ts
export async function executeOperation<T>(
  label: string,
  operation: () => Promise<any>,
  options?: OperationOptions,
): Promise<ServiceResult<T>> {
  const requestId = generateRequestId();

  try {
    const result = await operation();
    return {
      success: true,
      data: result,
      error: null,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: mapError(error),
      status: 500,
      timestamp: new Date().toISOString(),
      requestId,
    };
  }
}

// Used by all domain services
// services/player/crud.ts
export function createPlayerCrudService(supabase: SupabaseClient<Database>) {
  return {
    getById: async (id: string) =>
      executeOperation('player.getById', async () => {
        const { data, error } = await supabase
          .from('player')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        return data;
      }),
  };
}
```

---

#### Action Layer Cross-Cutting
**Location**: `app/actions/shared/`

**Concerns**:
- Auth validation (JWT claim checks)
- Transaction boundaries (Supabase transactions)
- Cache invalidation strategies
- Error response formatting
- Telemetry/logging

**Pattern**: Wrapper functions and middleware

```typescript
// app/actions/shared/with-auth.ts
export function withAuth(
  action: (user: User, ...args: any[]) => Promise<any>,
  requiredRole?: StaffRole,
) {
  return async (...args: any[]) => {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    if (requiredRole) {
      const hasRole = await checkUserRole(user, requiredRole);
      if (!hasRole) {
        return { success: false, error: 'Forbidden' };
      }
    }

    return action(user, ...args);
  };
}

// Usage in domain action
export const createPlayerAction = withAuth(
  async (user, playerData: PlayerCreateInput) => {
    const supabase = createClient();
    const playerService = createPlayerService(supabase);
    return playerService.create(playerData);
  },
  'SUPERVISOR', // Require supervisor role
);
```

---

#### UI Layer Cross-Cutting
**Location**: `components/ui/`

**Concerns**:
- Pure presentational primitives (Button, Modal, Input, Card)
- Layout components (PageHeader, ContentWrapper)
- Loading states (Skeleton, Spinner)
- Error boundaries

**Pattern**: Design system components with NO business logic

```typescript
// components/ui/button.tsx - Pure presentational
export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
}: ButtonProps) {
  return (
    <button
      className={buttonVariants[variant]}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// Used by domain-specific components
// app/(dashboard)/players/player-form.tsx - Domain-specific
export function PlayerForm({ player, onSubmit }: PlayerFormProps) {
  const { mutate: createPlayer } = useCreatePlayer();

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      createPlayer(player);
    }}>
      <Input label="First Name" name="firstName" />
      <Button type="submit">Create Player</Button> {/* UI primitive */}
    </form>
  );
}
```

---

### 4.2 Shared vs Domain-Specific Decision Matrix

| Concern | Shared Infrastructure | Domain-Specific | Location |
|---------|----------------------|-----------------|----------|
| RLS Policy Templates | ✅ | ❌ | `supabase/migrations/shared-policies.sql` |
| Audit Logging Trigger | ✅ | ❌ | `supabase/migrations/audit-trigger.sql` |
| Operation Wrapper | ✅ | ❌ | `services/shared/operation-wrapper.ts` |
| ServiceResult Type | ✅ | ❌ | `services/shared/types.ts` |
| Error Codes | ❌ | ✅ | `services/player/errors.ts` (per domain) |
| Validation Schemas | ❌ | ✅ | `services/player/validation.ts` (per domain) |
| Auth Wrapper | ✅ | ❌ | `app/actions/shared/with-auth.ts` |
| Transaction Helper | ✅ | ❌ | `app/actions/shared/with-transaction.ts` |
| Button Component | ✅ | ❌ | `components/ui/button.tsx` |
| Player Form | ❌ | ✅ | `app/(dashboard)/players/player-form.tsx` |
| React Query Keys | ❌ | ✅ | `hooks/player/query-keys.ts` (per domain) |
| Real-time Hooks | ❌ | ✅ | `hooks/visit/useVisitRealtime.ts` (per domain) |

**Decision Criteria**:
- **Shared**: Zero domain knowledge, pure utility, used by 3+ domains
- **Domain-Specific**: Contains business rules, domain terminology, or unique workflows

---

### 4.3 Validation Strategy

**Shared Validation Utilities**:
```typescript
// services/shared/validation-utils.ts
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
```

**Domain-Specific Validation Schemas**:
```typescript
// services/player/validation.ts
import { z } from 'zod';
import { isValidEmail } from '../shared/validation-utils';

export const playerCreateSchema = z.object({
  email: z.string().email().refine(isValidEmail, 'Invalid email format'),
  first_name: z.string().min(1, 'First name required').max(50),
  last_name: z.string().min(1, 'Last name required').max(50),
  loyalty_tier: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']).default('BRONZE'),
});

export const playerUpdateSchema = playerCreateSchema.partial();
```

**Validation Flow**:
1. Action receives untyped input (form data, JSON body)
2. Action validates against domain schema (`playerCreateSchema.safeParse()`)
3. If valid, action passes typed DTO to service
4. Service performs business rule validation (e.g., duplicate email check)
5. Database enforces constraints (foreign keys, NOT NULL, check constraints)

---

## 5. Team Structure Implications

### 5.1 Ownership Model

**Domain-Level Ownership**: Each developer owns a complete vertical slice.

| Developer | Vertical Slice | Scope |
|-----------|---------------|-------|
| Dev A | Player Identity | Database, service, actions, hooks, UI, tests |
| Dev B | Casino Location | Database, service, actions, hooks, UI, tests |
| Dev C | Visit Session | Database, service, actions, hooks, UI, tests |
| Dev D | RatingSlip Performance | Database, service, actions, hooks, UI, tests |
| Dev E | PlayerFinancial Finance | Database, service, actions, hooks, UI, tests |

**Benefits**:
- **Cognitive Locality**: Developer understands entire feature stack
- **Autonomy**: Can evolve domain without waiting on horizontal handoffs
- **Accountability**: Clear ownership for bugs and feature requests
- **Faster Iteration**: No coordination overhead for intra-domain changes

**Challenges**:
- **Cross-Domain Integration**: Requires collaboration at action layer orchestration points
- **Skill Balance**: Developers need full-stack competency (DB, backend, frontend)
- **Consistency**: Shared primitives (UI components, service patterns) require governance

---

### 5.2 Integration Contracts

**Contract Types**:

#### Service Interface Contracts
```typescript
// Defined by domain owner, consumed by action orchestration
export interface PlayerService {
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  list(filters?: PlayerFilters): Promise<ServiceResult<PlayerDTO[]>>;
  create(data: PlayerCreateDTO): Promise<ServiceResult<PlayerDTO>>;
  update(id: string, data: PlayerUpdateDTO): Promise<ServiceResult<PlayerDTO>>;
}
```

**Contract Testing**:
```typescript
// __tests__/contracts/player-service.contract.test.ts
describe('PlayerService Contract', () => {
  it('getById returns PlayerDTO with required fields', async () => {
    const service = createPlayerService(supabase);
    const result = await service.getById(validPlayerId);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
      first_name: expect.any(String),
      last_name: expect.any(String),
    });
  });
});
```

---

#### DTO Type Contracts
```typescript
// types/domains/player/player.dto.ts
export interface PlayerDTO {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  loyalty_tier: LoyaltyTier;
  created_at: string;
  updated_at: string;
}

export interface PlayerCreateDTO {
  email: string;
  first_name: string;
  last_name: string;
  loyalty_tier?: LoyaltyTier;
}

export interface PlayerUpdateDTO extends Partial<PlayerCreateDTO> {}
```

**Contract Enforcement**: TypeScript compilation fails if DTOs change shape without updating consumers.

---

#### Database Schema Contracts
```sql
-- Foreign key constraints enforce referential integrity
CREATE TABLE visit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  casino_id UUID NOT NULL REFERENCES casino(id) ON DELETE CASCADE,
  check_in_date TIMESTAMPTZ NOT NULL,
  check_out_date TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED'))
);
```

**Contract Testing**: Migration tests verify foreign key relationships and constraints.

---

### 5.3 Testing Boundaries

#### Unit Tests (Domain-Scoped)
**Owner**: Domain developer
**Scope**: Service layer modules (CRUD, business, queries, transforms)

```typescript
// __tests__/services/player/crud.test.ts
describe('PlayerCrudService', () => {
  it('creates player with valid data', async () => {
    const service = createPlayerCrudService(mockSupabase);
    const result = await service.create(validPlayerData);
    expect(result.success).toBe(true);
  });
});
```

---

#### Integration Tests (Cross-Domain)
**Owner**: Orchestration layer / Tech lead
**Scope**: Server actions with multi-service orchestration

```typescript
// __tests__/actions/visit-actions.integration.test.ts
describe('createVisitAction', () => {
  it('creates visit with valid player and casino', async () => {
    // Setup: Create player and casino
    const player = await createTestPlayer();
    const casino = await createTestCasino();

    // Action: Create visit
    const result = await createVisitAction({
      player_id: player.id,
      casino_id: casino.id,
    });

    expect(result.success).toBe(true);
    expect(result.data.player_id).toBe(player.id);
    expect(result.data.casino_id).toBe(casino.id);
  });

  it('rejects visit with invalid player', async () => {
    const casino = await createTestCasino();

    const result = await createVisitAction({
      player_id: 'invalid-uuid',
      casino_id: casino.id,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Player not found');
  });
});
```

---

#### End-to-End Tests (Full Journey)
**Owner**: QA / Team lead
**Scope**: Complete user workflows spanning multiple verticals

```typescript
// __tests__/e2e/session-workflow.e2e.test.ts
describe('Complete Session Workflow', () => {
  it('user can check in, create rating slip, and check out', async () => {
    // Setup
    const player = await createTestPlayer();
    const casino = await createTestCasino();

    // Act: Check in
    const visit = await checkInPlayer(player.id, casino.id);
    expect(visit.status).toBe('ACTIVE');

    // Act: Create rating slip
    const ratingSlip = await createRatingSlip({
      visit_id: visit.id,
      table_id: casino.tables[0].id,
      average_bet: 25,
    });
    expect(ratingSlip.status).toBe('ACTIVE');

    // Act: Check out
    const closedVisit = await checkOutPlayer(visit.id);
    expect(closedVisit.status).toBe('COMPLETED');

    // Assert: Session summary
    const summary = await getSessionSummary(visit.id);
    expect(summary.performance.slips).toHaveLength(1);
    expect(summary.visit.status).toBe('COMPLETED');
  });
});
```

---

### 5.4 Collaboration Patterns

#### Daily Standup Structure
**Format**: Domain-centric updates

- Dev A: "Player slice - Added search functionality, blocked on UI component review"
- Dev B: "Casino slice - Table management complete, ready for integration"
- Dev C: "Visit slice - Need Player + Casino service contracts finalized"
- Dev D: "RatingSlip slice - Point calculation logic in review, will integrate with Visit tomorrow"

---

#### Pull Request Workflow

**Single-Domain PRs** (no review dependencies):
```
PR: [Player] Add player search functionality
Files: services/player/queries.ts, hooks/player/usePlayerSearch.ts, app/(dashboard)/players/search-form.tsx
Reviewers: Tech lead (architecture), UI lead (design consistency)
```

**Cross-Domain PRs** (require integration review):
```
PR: [Visit] Implement check-in workflow
Files: app/actions/visit-actions.ts, hooks/visit/useCheckIn.ts
Dependencies: Player service (Dev A), Casino service (Dev B)
Reviewers: Dev A, Dev B, Tech lead
```

---

#### Integration Sync Meetings (Weekly)

**Agenda**:
1. Review service interface changes (breaking vs non-breaking)
2. Coordinate action-layer orchestration changes
3. Discuss shared infrastructure needs
4. Plan E2E test scenarios

**Outcome**: Updated integration contract documentation

---

## 6. Trade-Offs and Risks

### 6.1 Domain-Level vs Feature-Level Slicing

**Decision**: Domain-Level (Player, Visit, RatingSlip as verticals)

**Trade-Off Analysis**:

| Aspect | Domain-Level (Chosen) | Feature-Level (Alternative) |
|--------|----------------------|----------------------------|
| **Duplication** | Low - Shared CRUD/Business modules | High - Each feature repeats patterns |
| **Cognitive Load** | Medium - Understand entire domain | Low - Focus on single feature |
| **Testing Scope** | Moderate - Test domain as unit | Narrow - Test feature in isolation |
| **Team Ownership** | Clear - Developer owns domain | Fragmented - Features split across devs |
| **Consistency** | High - Domain enforces patterns | Low - Feature drift without governance |
| **Scalability** | Split domain when >8 operations | Infinite - Add features without limit |

**Rationale**:
- PT-2 domains are cohesive (Player identity, Visit session, RatingSlip performance)
- Existing service layer architecture uses domain-level organization
- Feature-level would create duplication (e.g., createPlayer, updatePlayer, deletePlayer each needing full service stack)
- Bounded context boundaries align with domain-level slices

**Risk**: Domains may grow too large
**Mitigation**: Split domain when it exceeds ~8 core operations or introduces sub-domains (e.g., Player could split into PlayerProfile + PlayerLoyalty)

---

### 6.2 Service Layer Composition Strategy

**Decision**: Horizontal modules (CRUD/Business/Query) within domain vertical

**Trade-Off Analysis**:

| Aspect | Horizontal Modules (Chosen) | Fully Vertical (Alternative) |
|--------|----------------------------|------------------------------|
| **Reusability** | High - Share patterns across domains | Low - Duplicate CRUD in each feature |
| **Testing Granularity** | High - Test CRUD, Business, Query separately | Medium - Test entire feature stack |
| **Complexity** | Medium - Understand module composition | Low - Linear feature flow |
| **Maintainability** | High - Update CRUD pattern once | Low - Update each feature individually |
| **Onboarding** | Medium - Learn module pattern | Low - Follow single feature path |

**Rationale**:
- CRUD/Business/Query separation reduces cognitive load (single responsibility)
- Existing services already use this pattern successfully
- Module composition is straightforward (`return { ...crud, ...business, ...queries }`)
- Testing at module granularity improves coverage (test CRUD without business logic)

**Risk**: Horizontal dependencies creep into modules
**Mitigation**: `services/shared/` contains ONLY pure utilities, no domain logic

---

### 6.3 Cross-Domain Orchestration Location

**Decision**: Server Actions (action layer)

**Trade-Off Analysis**:

| Aspect | Action Layer (Chosen) | Service-to-Service (Alternative) | Event Bus (Alternative) |
|--------|----------------------|----------------------------------|------------------------|
| **Clarity** | High - Explicit orchestration | Low - Hidden in services | Medium - Async event flow |
| **Transaction Boundaries** | Explicit - Action-scoped | Implicit - Service-scoped | Complex - Eventual consistency |
| **Testing** | Easy - Mock services | Hard - Cascading mocks | Medium - Event assertions |
| **Coupling** | Low - Services independent | High - Services coupled | Low - Event-driven decoupling |
| **Debugging** | Easy - Linear flow | Hard - Call stack depth | Hard - Async event tracing |

**Rationale**:
- Keeps services pure and testable (no cross-domain knowledge)
- Transaction boundaries explicit (Supabase transaction in action)
- Follows "aggregation at client layer" rule from Service Responsibility Matrix
- Simpler than event-driven architecture for MVP scope

**Risk**: Action layer becomes orchestration spaghetti
**Mitigation**: Keep actions focused (one workflow per action), comprehensive integration tests

---

### 6.4 Migration Strategy

**Decision**: Big-bang per vertical (complete Player slice before Visit)

**Trade-Off Analysis**:

| Aspect | Vertical Big-Bang (Chosen) | Horizontal Layers (Alternative) |
|--------|---------------------------|--------------------------------|
| **Validation** | Early - Working features immediately | Late - No working features until complete |
| **Risk** | Medium - Wrong patterns replicated | Low - Iterate patterns per layer |
| **Value Delivery** | Fast - Incremental feature releases | Slow - All-or-nothing delivery |
| **Coordination** | Low - Independent development | High - Handoffs between layers |
| **Rework** | Medium - Fix early slices if needed | Low - Fix patterns before implementation |

**Rationale**:
- Delivers working features incrementally (Player management in Phase 1)
- Validates service → action → hook → UI pattern early
- Enables user feedback on UI/UX before building all slices
- Reduces coordination overhead (no layer handoffs)

**Risk**: First vertical sets incorrect patterns
**Mitigation**: Comprehensive architecture review after Player slice (Phase 1), update templates before Phase 2

---

### 6.5 Real-Time Update Strategy

**Decision**: Domain-specific hooks with batched invalidations

**Trade-Off Analysis**:

| Aspect | Domain Hooks (Chosen) | Global Manager (Alternative) |
|--------|----------------------|----------------------------|
| **Complexity** | Low - Hook-scoped subscriptions | High - Singleton state management |
| **Coupling** | Low - Hooks independent | High - Global state shared |
| **Testing** | Easy - Mock channel per hook | Hard - Mock global manager state |
| **Performance** | Good - Batched invalidations | Poor - React Query storms |
| **Cleanup** | Automatic - useEffect cleanup | Manual - Manager lifecycle |

**Rationale**:
- PRD explicitly forbids global real-time managers
- Domain hooks maintain vertical slice independence
- Batched invalidations prevent React Query storms (proven pattern from PT-1)
- Clean cleanup semantics via React useEffect

**Risk**: Duplicate channel subscription logic
**Mitigation**: Shared `useSupabaseChannel` helper, template for domain-specific hooks

---

## 7. Code Organization Structure

### 7.1 Recommended Directory Structure

```
/home/diepulp/projects/pt-2/
│
├── supabase/
│   ├── migrations/                     # Forward-only migrations
│   │   ├── 20250828_init_corrected.sql
│   │   ├── 20251007_rls_policies.sql
│   │   └── 20251008_player_financial.sql
│   └── config.toml
│
├── types/
│   ├── database.types.ts               # Canonical source (generated)
│   └── domains/                        # Domain DTOs
│       ├── player/
│       │   ├── player.dto.ts
│       │   └── player-filters.dto.ts
│       ├── casino/
│       ├── visit/
│       ├── ratingslip/
│       └── financial/
│
├── services/                           # Service layer (domain verticals)
│   ├── shared/                         # Cross-cutting infrastructure
│   │   ├── operation-wrapper.ts
│   │   ├── types.ts                    # ServiceResult, ServiceError
│   │   ├── validation-utils.ts
│   │   └── error-mapping.ts
│   │
│   ├── player/                         # Player Identity vertical (service layer)
│   │   ├── index.ts                    # Factory + interface export
│   │   ├── crud.ts                     # CRUD module
│   │   ├── business.ts                 # Business logic module
│   │   ├── queries.ts                  # Query module
│   │   ├── transforms.ts               # DTO mapping
│   │   ├── validation.ts               # Zod schemas
│   │   └── errors.ts                   # Domain error codes
│   │
│   ├── casino/                         # Casino Location vertical (service layer)
│   │   └── [same structure]
│   │
│   ├── visit/                          # Visit Session vertical (service layer)
│   │   └── [same structure]
│   │
│   ├── ratingslip/                     # RatingSlip Performance vertical (service layer)
│   │   └── [same structure]
│   │
│   └── player-financial/               # PlayerFinancial Finance vertical (service layer)
│       └── [same structure]
│
├── app/
│   ├── actions/                        # Server actions (orchestration layer)
│   │   ├── shared/
│   │   │   ├── with-auth.ts
│   │   │   ├── with-transaction.ts
│   │   │   └── invalidation-helpers.ts
│   │   │
│   │   ├── player-actions.ts           # Player domain actions
│   │   ├── casino-actions.ts           # Casino domain actions
│   │   ├── visit-actions.ts            # Visit domain actions
│   │   ├── ratingslip-actions.ts       # RatingSlip domain actions
│   │   ├── financial-actions.ts        # Financial domain actions
│   │   └── session-actions.ts          # Cross-domain workflows
│   │
│   ├── (dashboard)/
│   │   ├── players/                    # Player Identity vertical (UI layer)
│   │   │   ├── page.tsx                # Player list page
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx            # Player detail page
│   │   │   ├── player-list.tsx         # List component
│   │   │   ├── player-detail.tsx       # Detail component
│   │   │   ├── player-form.tsx         # Create/edit form
│   │   │   └── player-search.tsx       # Search component
│   │   │
│   │   ├── casinos/                    # Casino Location vertical (UI layer)
│   │   │   └── [similar structure]
│   │   │
│   │   ├── visits/                     # Visit Session vertical (UI layer)
│   │   │   ├── check-in.tsx
│   │   │   ├── active-visits-dashboard.tsx
│   │   │   └── check-out.tsx
│   │   │
│   │   ├── performance/                # RatingSlip Performance vertical (UI layer)
│   │   │   ├── rating-slip-tracker.tsx
│   │   │   ├── create-slip-form.tsx
│   │   │   └── close-slip-form.tsx
│   │   │
│   │   └── finance/                    # PlayerFinancial Finance vertical (UI layer)
│   │       ├── transaction-log.tsx
│   │       ├── reconciliation-dashboard.tsx
│   │       └── financial-summary.tsx
│   │
│   └── layout.tsx
│
├── hooks/                              # React hooks (domain-scoped)
│   ├── shared/
│   │   ├── use-supabase-channel.ts
│   │   └── use-batch-invalidation.ts
│   │
│   ├── player/                         # Player vertical hooks
│   │   ├── query-keys.ts
│   │   ├── usePlayer.ts
│   │   ├── usePlayerList.ts
│   │   ├── usePlayerSearch.ts
│   │   └── usePlayerMutations.ts
│   │
│   ├── casino/                         # Casino vertical hooks
│   │   └── [similar structure]
│   │
│   ├── visit/                          # Visit vertical hooks
│   │   ├── useVisit.ts
│   │   ├── useActiveVisits.ts
│   │   ├── useVisitLifecycle.ts
│   │   └── useVisitRealtime.ts
│   │
│   ├── ratingslip/                     # RatingSlip vertical hooks
│   │   ├── useRatingSlip.ts
│   │   ├── useActiveSlipsByTable.ts
│   │   └── useRatingSlipRealtime.ts
│   │
│   └── financial/                      # Financial vertical hooks
│       ├── useFinancialTransaction.ts
│       ├── useVisitReconciliation.ts
│       └── usePlayerFinancialHistory.ts
│
├── components/
│   └── ui/                             # Shared presentational primitives
│       ├── button.tsx
│       ├── modal.tsx
│       ├── input.tsx
│       ├── card.tsx
│       └── skeleton.tsx
│
└── __tests__/
    ├── services/                       # Service unit tests (per domain)
    │   ├── player/
    │   │   ├── crud.test.ts
    │   │   ├── business.test.ts
    │   │   └── queries.test.ts
    │   ├── casino/
    │   ├── visit/
    │   ├── ratingslip/
    │   └── player-financial/
    │
    ├── actions/                        # Action integration tests (cross-domain)
    │   ├── player-actions.integration.test.ts
    │   ├── visit-actions.integration.test.ts
    │   └── session-actions.integration.test.ts
    │
    ├── hooks/                          # Hook tests (per domain)
    │   ├── player/
    │   ├── visit/
    │   └── ratingslip/
    │
    ├── contracts/                      # Contract tests (service interfaces)
    │   ├── player-service.contract.test.ts
    │   ├── casino-service.contract.test.ts
    │   └── visit-service.contract.test.ts
    │
    └── e2e/                            # End-to-end tests (full journeys)
        ├── player-management.e2e.test.ts
        ├── session-workflow.e2e.test.ts
        └── performance-tracking.e2e.test.ts
```

---

### 7.2 Structure Rationale

**Vertical Alignment**:
- Each domain (player, casino, visit, ratingslip, financial) has presence in:
  - `services/` - Service layer logic
  - `app/actions/` - Orchestration and server actions
  - `hooks/` - React Query hooks and real-time subscriptions
  - `app/(dashboard)/` - UI components and pages
  - `__tests__/` - Domain-specific tests

**Horizontal Infrastructure**:
- `services/shared/` - Pure service utilities
- `app/actions/shared/` - Auth, transaction, invalidation wrappers
- `hooks/shared/` - Reusable hook utilities
- `components/ui/` - Presentational primitives
- `types/` - Canonical types and DTOs

**Benefits**:
- Clear vertical slice boundaries (find all Player code by domain)
- Shared infrastructure easily discoverable (`*/shared/` directories)
- Testing mirrors implementation structure
- New developers can navigate by domain

---

### 7.3 Anti-Patterns to Avoid

| Anti-Pattern | Why Forbidden | Correct Pattern |
|--------------|---------------|-----------------|
| `services/player/types.ts` | Types belong in `types/domains/player/` | Move to `types/domains/player/player.dto.ts` |
| `services/base.service.ts` | No class abstractions | Use functional factories with shared utilities |
| `services/real-time/global-manager.ts` | No global state managers | Domain-specific hooks with cleanup |
| `hooks/use-all-players.ts` (global hooks) | Breaks domain locality | `hooks/player/usePlayerList.ts` |
| `app/actions/actions.ts` (single file) | Violates domain separation | `app/actions/player-actions.ts` per domain |
| `components/player-button.tsx` | Business logic in UI primitives | Pure `components/ui/button.tsx` + `app/(dashboard)/players/player-form.tsx` |
| Cross-service imports (`visit/index.ts` imports `player/index.ts`) | Creates coupling | Use actions for orchestration |

---

## 8. Success Metrics

### 8.1 Phase Completion Criteria

#### Phase 1: Foundation Verticals (Player + Casino)

**Service Layer**:
- ✅ Player service exists with CRUD, business, queries modules
- ✅ Casino service exists with casino + table management
- ✅ Explicit interfaces defined (no `ReturnType` inference)
- ✅ All operations return `ServiceResult<T>`

**Action Layer**:
- ✅ `player-actions.ts` with CRUD operations
- ✅ `casino-actions.ts` with casino + table operations
- ✅ Auth wrappers applied (role-based access control)
- ✅ Cache invalidation strategies implemented

**Hook Layer**:
- ✅ React Query hooks for Player (usePlayer, usePlayerList, usePlayerMutations)
- ✅ React Query hooks for Casino (useCasino, useTables)
- ✅ Query keys follow `[domain, entity, id]` pattern

**UI Layer**:
- ✅ Player list, detail, create/edit forms functional
- ✅ Casino list, floor view, table configuration functional
- ✅ Loading states, error boundaries, validation feedback

**Testing**:
- ✅ Service unit tests >80% coverage
- ✅ Action integration tests for CRUD workflows
- ✅ Hook tests with mocked actions
- ✅ E2E tests for player and casino management

**Performance**:
- ✅ Lighthouse LCP ≤ 2.5s
- ✅ Total Blocking Time ≤ 200ms
- ✅ Initial JS bundle ≤ 250KB

---

#### Phase 2: Session Context (Visit)

**Service Layer**:
- ✅ Visit service with lifecycle management (start, end, cancel)
- ✅ State transition validation (ACTIVE → COMPLETED → CANCELLED)
- ✅ RPC functions for complex queries

**Action Layer**:
- ✅ `visit-actions.ts` with check-in/check-out workflows
- ✅ Cross-domain orchestration (Player + Casino validation)
- ✅ Transaction boundaries for atomic operations

**Hook Layer**:
- ✅ useVisit, useActiveVisits, useVisitLifecycle
- ✅ useVisitRealtime with batched invalidations
- ✅ Cross-domain cache invalidation

**UI Layer**:
- ✅ Check-in form with Player + Casino selection
- ✅ Active visits dashboard with real-time updates
- ✅ Check-out workflow with session summary

**Testing**:
- ✅ Cross-domain integration tests (Player + Casino + Visit)
- ✅ Real-time subscription tests (channel lifecycle, cleanup)
- ✅ E2E visit lifecycle workflow

---

#### Phase 3: Performance & Finance (RatingSlip + PlayerFinancial)

**Service Layer**:
- ✅ RatingSlip service with point calculations
- ✅ PlayerFinancial service with reconciliation logic
- ✅ Both services follow established patterns

**Action Layer**:
- ✅ `ratingslip-actions.ts` with create/update/close operations
- ✅ `financial-actions.ts` with transaction recording
- ✅ `session-actions.ts` aggregating performance + finance data

**Hook Layer**:
- ✅ useRatingSlip, useActiveSlipsByTable
- ✅ useFinancialTransaction, useVisitReconciliation
- ✅ Real-time hooks for both domains

**UI Layer**:
- ✅ Rating slip tracker with real-time updates
- ✅ Financial transaction log
- ✅ Reconciliation dashboard
- ✅ Session summary (aggregated performance + finance)

**Testing**:
- ✅ Performance calculation unit tests
- ✅ Reconciliation logic unit tests
- ✅ Cross-domain integration tests (Visit + RatingSlip + Financial)
- ✅ E2E complete session workflow

---

### 8.2 Architectural Health Metrics

**Type Safety**:
- ✅ Zero `any` types in service parameters
- ✅ Zero `ReturnType` inference for exported types
- ✅ All DTOs reference canonical `database.types.ts`

**Service Purity**:
- ✅ No service-to-service direct calls
- ✅ No global state in services
- ✅ All services stateless and functional

**Testing Coverage**:
- ✅ Service layer >80% coverage
- ✅ Action layer >70% coverage (integration tests)
- ✅ Hook layer >60% coverage (mocked tests)
- ✅ E2E critical paths covered

**Performance**:
- ✅ Lighthouse scores: Performance >90, Accessibility >95
- ✅ Bundle size: Initial <250KB, per-route <100KB
- ✅ API latency: p95 <500ms for CRUD, <1s for aggregations

**Code Quality**:
- ✅ ESLint: Zero violations
- ✅ TypeScript: Zero errors, strict mode enabled
- ✅ Duplication: <5% code duplication (SonarQube)

---

## 9. Migration Playbook

### 9.1 Phase 1: Foundation Verticals (Week 1-3)

#### Week 1: Player Identity Vertical

**Day 1-2: Action Layer**
```bash
# Create player actions file
touch app/actions/player-actions.ts

# Implement CRUD actions
# - createPlayerAction(data)
# - updatePlayerAction(id, data)
# - deletePlayerAction(id)
# - getPlayerAction(id)
# - listPlayersAction(filters)

# Add auth wrappers and cache invalidation
```

**Day 3-4: Hook Layer**
```bash
# Create player hooks directory
mkdir -p hooks/player

# Implement hooks
touch hooks/player/query-keys.ts
touch hooks/player/usePlayer.ts
touch hooks/player/usePlayerList.ts
touch hooks/player/usePlayerSearch.ts
touch hooks/player/usePlayerMutations.ts
```

**Day 5: UI Layer**
```bash
# Create player UI directory
mkdir -p app/\(dashboard\)/players

# Implement pages and components
touch app/\(dashboard\)/players/page.tsx            # List page
touch app/\(dashboard\)/players/\[id\]/page.tsx     # Detail page
touch app/\(dashboard\)/players/player-list.tsx     # List component
touch app/\(dashboard\)/players/player-form.tsx     # Create/edit form
```

**Day 6-7: Testing**
```bash
# Action integration tests
touch __tests__/actions/player-actions.integration.test.ts

# Hook tests
mkdir -p __tests__/hooks/player
touch __tests__/hooks/player/usePlayer.test.ts

# E2E tests
touch __tests__/e2e/player-management.e2e.test.ts
```

---

#### Week 2: Casino Location Vertical

**Repeat same pattern as Player**:
- Day 1-2: `app/actions/casino-actions.ts`
- Day 3-4: `hooks/casino/`
- Day 5: `app/(dashboard)/casinos/`
- Day 6-7: `__tests__/actions/casino-actions.integration.test.ts`

---

#### Week 3: Phase 1 Review & Refinement

**Day 1-3: Architecture Review**
- Review service → action → hook → UI pattern
- Identify improvements for Phase 2
- Update templates and documentation

**Day 4-5: Performance Optimization**
- Bundle analysis
- Lighthouse audit
- React Query optimization

**Day 6-7: Integration Testing**
- Cross-domain contract tests
- E2E critical paths
- Real-time subscription tests

---

### 9.2 Phase 2: Session Context (Week 4-5)

#### Week 4: Visit Vertical Implementation

**Day 1-2: Action Layer with Cross-Domain Orchestration**
```typescript
// app/actions/visit-actions.ts
export async function startVisitAction(data: {
  player_id: string;
  casino_id: string;
}) {
  const supabase = createClient();

  // Orchestrate Player + Casino + Visit services
  const playerService = createPlayerService(supabase);
  const casinoService = createCasinoService(supabase);
  const visitService = createVisitService(supabase);

  // Validate player exists
  const playerResult = await playerService.getById(data.player_id);
  if (!playerResult.success) {
    return { success: false, error: 'Player not found' };
  }

  // Validate casino exists
  const casinoResult = await casinoService.getById(data.casino_id);
  if (!casinoResult.success) {
    return { success: false, error: 'Casino not found' };
  }

  // Create visit
  return visitService.create(data);
}
```

**Day 3-4: Hook Layer with Real-Time**
```typescript
// hooks/visit/useVisitRealtime.ts
export function useVisitRealtime(visitId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = createBrowserClient()
      .channel(`visit:${visitId}`)
      .on('postgres_changes', { table: 'visit', filter: `id=eq.${visitId}` }, () => {
        scheduleBatchInvalidation(queryClient, [
          ['visit', 'detail', visitId],
          ['ratingslip', 'by-visit', visitId],
          ['financial', 'by-visit', visitId],
        ]);
      })
      .subscribe();

    return () => channel.unsubscribe();
  }, [visitId, queryClient]);
}
```

**Day 5: UI Layer**
```bash
# Implement check-in/check-out workflow
touch app/\(dashboard\)/visits/check-in.tsx
touch app/\(dashboard\)/visits/active-visits-dashboard.tsx
touch app/\(dashboard\)/visits/check-out.tsx
```

**Day 6-7: Integration Testing**
```typescript
// __tests__/actions/visit-actions.integration.test.ts
describe('Cross-Domain Visit Workflow', () => {
  it('validates Player + Casino before creating Visit', async () => {
    const player = await createTestPlayer();
    const casino = await createTestCasino();

    const result = await startVisitAction({
      player_id: player.id,
      casino_id: casino.id,
    });

    expect(result.success).toBe(true);
  });
});
```

---

### 9.3 Phase 3: Performance & Finance (Week 6-9)

#### Week 6-7: RatingSlip Performance Vertical

**Parallel Track A: RatingSlip**
- Day 1-2: `app/actions/ratingslip-actions.ts` (Visit + Table validation)
- Day 3-4: `hooks/ratingslip/` (point calculation hooks)
- Day 5: `app/(dashboard)/performance/` (tracker UI)
- Day 6-7: Testing (performance calculations, cross-domain integration)

---

#### Week 6-7: PlayerFinancial Finance Vertical

**Parallel Track B: PlayerFinancial**
- Day 1-2: Implement `services/player-financial/` (CRUD, reconciliation logic)
- Day 3-4: `app/actions/financial-actions.ts` (transaction recording)
- Day 5: `hooks/financial/` (reconciliation hooks)
- Day 6-7: Testing (reconciliation logic, financial calculations)

---

#### Week 8: Cross-Domain Session Summary

**Aggregate RatingSlip + PlayerFinancial**
```typescript
// app/actions/session-actions.ts
export async function getSessionSummaryAction(visitId: string) {
  const supabase = createClient();

  const [visit, ratingSlips, transactions, player, casino] = await Promise.all([
    createVisitService(supabase).getById(visitId),
    createRatingSlipService(supabase).getByVisitId(visitId),
    createPlayerFinancialService(supabase).getByVisitId(visitId),
    // ... fetch player and casino
  ]);

  return {
    visit,
    performance: aggregateRatingSlips(ratingSlips),
    finance: aggregateTransactions(transactions),
    player,
    casino,
  };
}
```

---

#### Week 9: Phase 3 Final Testing & Documentation

**Day 1-3: E2E Complete Session Workflow**
```typescript
// __tests__/e2e/complete-session-workflow.e2e.test.ts
it('user can check in, create rating slip, record transaction, and check out', async () => {
  // Full workflow test spanning all verticals
});
```

**Day 4-5: Performance Optimization**
- Bundle analysis
- Real-time subscription optimization
- React Query cache tuning

**Day 6-7: Documentation**
- Update vertical slicing patterns
- Document cross-domain orchestration examples
- Create team onboarding guide

---

## 10. Conclusion

### 10.1 Summary of Recommendations

**Vertical Slice Boundaries**:
- **Domain-Level Slices**: Player, Casino, Visit, RatingSlip, PlayerFinancial
- Each slice spans database → service → action → hook → UI
- Internal structure uses horizontal modules (CRUD/Business/Query)

**Implementation Sequencing**:
1. **Phase 1 (3 weeks)**: Player + Casino (parallel, foundation)
2. **Phase 2 (2 weeks)**: Visit (sequential, cross-domain integration)
3. **Phase 3 (4 weeks)**: RatingSlip + PlayerFinancial (parallel, business value)

**Integration Patterns**:
- **No service-to-service calls**: Enforced via architecture review
- **Action-layer orchestration**: Cross-domain workflows in server actions
- **DTO contracts**: Type-safe cross-domain communication
- **Real-time independence**: Domain-specific hooks with batched invalidations

**Cross-Cutting Concerns**:
- **Shared utilities**: `services/shared/`, `app/actions/shared/`, `components/ui/`
- **Domain-specific**: Validation schemas, error codes, business logic
- **Clear separation**: Pure utilities vs domain logic

---

### 10.2 Key Success Factors

**Technical**:
- Explicit service interfaces (no `ReturnType` inference)
- Type-safe Supabase clients (`SupabaseClient<Database>`)
- Consistent `ServiceResult<T>` pattern
- Comprehensive testing at service, action, hook, and E2E levels

**Organizational**:
- Clear domain ownership (one developer per vertical)
- Contract-based integration (service interfaces, DTOs)
- Weekly integration sync meetings
- Architecture review after Phase 1

**Process**:
- Vertical delivery (working features incrementally)
- Early validation (pattern refinement after first slice)
- Parallel development (maximize velocity)
- Continuous testing (unit → integration → E2E)

---

### 10.3 Next Steps

1. **Architecture Review Meeting**: Present this analysis to team, gather feedback
2. **Template Creation**: Update `SERVICE_TEMPLATE.md` with vertical slice patterns
3. **Phase 1 Kickoff**: Assign Player (Dev A) and Casino (Dev B) verticals
4. **Establish Metrics**: Set up Lighthouse CI, bundle analysis, test coverage tracking
5. **Documentation**: Create onboarding guide for vertical slice development

---

### 10.4 Open Questions for Team Discussion

1. **Resource Allocation**: Do we have 2-3 developers available for parallel Phase 1 work?
2. **UI Design System**: Should we establish design primitives before UI implementation?
3. **Real-Time Scope**: Which domains require real-time updates (Visit, RatingSlip confirmed; others TBD)?
4. **Testing Strategy**: E2E with Cypress or Playwright? (Current: Cypress retained from PRD)
5. **Deployment**: Deploy per phase or accumulate all phases before production release?

---

## Appendix A: References

- **Service Responsibility Matrix**: `/home/diepulp/projects/pt-2/docs/phase-2/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Service Layer Architecture**: `/home/diepulp/projects/pt-2/docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **Canonical Blueprint PRD**: `/home/diepulp/projects/pt-2/docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`
- **Vertical Slicing Philosophy**: `/home/diepulp/projects/pt-2/docs/architecture/slicing/VERTICAL_SLICING_PHILOSOPHY.md`
- **Service Template**: `/home/diepulp/projects/pt-2/docs/patterns/SERVICE_TEMPLATE.md`

---

## Appendix B: Glossary

**Bounded Context**: A DDD pattern defining clear ownership boundaries for domain models (e.g., Player Identity context owns player data, Visit Session context owns visit data).

**Vertical Slice**: A feature path spanning all architectural layers from database to UI, delivering complete user-visible functionality.

**Domain-Level Slice**: A vertical slice organized by bounded context (Player, Visit, RatingSlip) rather than individual features (CreatePlayer, UpdatePlayer).

**Horizontal Module**: Internal service organization pattern (CRUD, Business, Query) providing separation of concerns within a domain.

**Action Layer Orchestration**: Server actions coordinating multiple domain services to implement cross-domain workflows (e.g., creating a Visit requires Player + Casino validation).

**ServiceResult Pattern**: Standardized return type for all service operations providing success/error handling, status codes, and request tracing.

**DTO (Data Transfer Object)**: Type-safe contract for cross-domain communication (e.g., PlayerDTO, VisitCreateDTO).

**Integration Contract**: Explicit interface defining communication between vertical slices (service interfaces, DTO types, database foreign keys).

---

**Document Status**: Analysis Complete
**Recommended Action**: Present to team for review and approval
**Next Update**: Post-Phase 1 retrospective (estimated 3 weeks from start)
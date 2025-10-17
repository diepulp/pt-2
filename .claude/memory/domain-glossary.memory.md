# Domain Glossary

**Last Updated**: 2025-10-17
**Source**: System PRD, ADRs, and architecture documents
**Purpose**: Canonical terminology and definitions for PT-2

---

## Domain Concepts

### Player

**Definition**: A casino customer who visits properties and participates in gaming activities.
**Table**: `player`
**Key Attributes**: firstName, lastName, email, phone, status
**Related Entities**: Visit, PlayerFinancial, Loyalty
**Bounded Context**: Player identity and profile management

### Casino

**Definition**: A physical gaming property operated by a company.
**Table**: `casino`
**Key Attributes**: name, address, city, state, companyId
**Related Entities**: Table, Visit, Company
**Bounded Context**: Property and table management

### Visit

**Definition**: A discrete period when a player is present at a casino, from check-in to check-out.
**Table**: `visit`
**Key Attributes**: playerId, casinoId, checkInTime, checkOutTime, status
**Lifecycle**: Created on check-in, updated with check-out time
**Related Entities**: Player, Casino, RatingSlip
**Bounded Context**: Visit tracking and lifecycle

### Rating Slip

**Definition**: A record of gameplay telemetry during a visit, including table, time, and betting patterns.
**Table**: `ratingslip`
**Key Attributes**: visitId, tableId, startTime, endTime, averageBet, rating
**Purpose**: Track player gaming activity for analytics and loyalty
**Related Entities**: Visit, Table, TableContext
**Bounded Context**: Gameplay telemetry

### Table

**Definition**: A physical gaming table within a casino.
**Table**: `table`
**Key Attributes**: casinoId, tableNumber, gameType, status
**Status Values**: 'active', 'inactive', 'maintenance'
**Related Entities**: Casino, TableContext, RatingSlip
**Bounded Context**: Table inventory

### Table Context

**Definition**: A temporal session representing when a table is open for play, with associated settings.
**Table**: `table_context`
**Key Attributes**: tableId, openTime, closeTime, status, settings
**Purpose**: Track table operational periods and configuration
**Lifecycle**: Created when table opens, closed when table closes
**Related Entities**: Table, RatingSlip, MTL
**Bounded Context**: Table temporal tracking

### MTL (Money Transaction Logging)

**Definition**: Compliance record of all monetary transactions for regulatory reporting.
**Table**: `mtl`
**Key Attributes**: tableContextId, playerId, amount, direction, timestamp, gamingDay
**Purpose**: Regulatory compliance (CTR reporting, audit trail)
**Direction Values**: 'buy-in' (player to casino), 'cash-out' (casino to player)
**Related Entities**: TableContext, Player
**Bounded Context**: Compliance and transaction logging

### Loyalty

**Definition**: Player rewards program tracking points, tiers, and benefits.
**Table**: `player_loyalty`
**Key Attributes**: playerId, currentBalance, lifetimePoints, tier, tierProgress
**Tiers**: Bronze, Silver, Gold, Platinum
**Related Entities**: Player
**Bounded Context**: Loyalty rewards (optional, post-MVP)

### Player Financial

**Definition**: Player financial transaction history and balance tracking.
**Table**: `player_financial`
**Key Attributes**: playerId, transactionType, amount, balance, timestamp
**Transaction Types**: 'deposit', 'withdrawal', 'adjustment'
**Related Entities**: Player
**Bounded Context**: Player financial management

---

## Compliance & Regulatory Terms

### CTR (Currency Transaction Report)

**Definition**: Federal requirement to report cash transactions >= $10,000 within a gaming day.
**Threshold**: $10,000 USD
**Context**: MTL service detects and flags CTR candidates
**Regulation**: Bank Secrecy Act (BSA)
**Filing**: IRS Form 8300

### Gaming Day

**Definition**: A 24-hour period for compliance calculations, starting at 6 AM.
**Start Time**: 6:00 AM local time
**Purpose**: Aggregate transactions within regulatory reporting period
**Example**: Gaming day 2025-10-17 runs from 6 AM Oct 17 to 5:59 AM Oct 18
**Calculation**: `floor((timestamp - 6 hours) / 24 hours)`

### WCAG (Web Content Accessibility Guidelines)

**Definition**: W3C standard for web accessibility.
**Target**: WCAG 2.1 AA compliance
**Requirements**: Color contrast, keyboard navigation, screen reader support
**Context**: All UI components must meet AA standard

---

## Architecture Patterns

### Service

**Definition**: A functional factory that encapsulates domain logic and database operations.
**Pattern**: `createXService(supabase: SupabaseClient<Database>): XService`
**Structure**: `index.ts` (factory) + `crud.ts` + optional `business.ts`/`queries.ts`
**Anti-Pattern**: Class-based services, ReturnType inference, any-typing
**Example**: `createPlayerService(supabase)`

### Factory Function

**Definition**: A function that creates and returns a service interface.
**Signature**: `(dependencies) => ServiceInterface`
**Benefits**: Dependency injection, testability, no global state
**Example**: `export function createPlayerService(supabase) { return { /* methods */ }; }`

### DTO (Data Transfer Object)

**Definition**: Type-safe representation of data moving between layers.
**Pattern**: Derived from `Database` types using Pick/Omit
**Purpose**: Explicit contracts, type safety, documentation
**Naming**: `{Entity}DTO`, `{Entity}CreateDTO`, `{Entity}UpdateDTO`
**Example**: `type PlayerDTO = Pick<Database['public']['Tables']['player']['Row'], 'id' | 'firstName'>`

### ServiceResult<T>

**Definition**: Discriminated union for service operation outcomes.
**Type**: `{ success: true; data: T } | { success: false; error: ServiceError }`
**Purpose**: Type-safe error handling, no exceptions thrown
**Usage**: All service methods return `ServiceResult<T>`

### Bounded Context

**Definition**: A clear boundary within which a domain model is defined and applicable.
**Purpose**: Prevent coupling, enforce separation of concerns
**Rule**: Services don't call other services directly
**Example**: Player service manages player identity, NOT visits or rating slips

### Vertical Slice

**Definition**: End-to-end implementation of a single feature (DB → Service → API → UI).
**Strategy**: Deliver complete feature before moving to next
**Benefits**: Early feedback, reduced WIP, clear progress
**Example**: Player Management (DB schema → PlayerService → player actions → Player UI)

### Horizontal Layer

**Definition**: Infrastructure or pattern applied across all domains.
**Strategy**: Implement once, use everywhere
**Examples**: React Query setup, server action wrapper, Zustand stores
**Phase**: Phase 3 delivered horizontal state management layer

---

## Technical Terms

### RLS (Row Level Security)

**Definition**: Postgres feature enforcing row-level access control.
**Context**: Supabase enables RLS by default
**Purpose**: Data security, multi-tenancy, compliance
**Rule**: All tables must have RLS policies defined

### Supabase Client

**Definition**: TypeScript client for interacting with Supabase backend.
**Types**: `SupabaseClient<Database>` (never `any`)
**Factories**: `createClient()` (server), `createBrowserClient()` (client)
**Pattern**: Pass as dependency to service factories

### Migration

**Definition**: Versioned SQL script for schema changes.
**Location**: `supabase/migrations/`
**Naming**: `YYYYMMDDHHMMSS_description.sql` (full timestamp)
**Application**: `npx supabase migration up` or `npx supabase db reset`
**Rule**: Forward-only, never edit applied migrations

### Query Key

**Definition**: Unique identifier for React Query cache entries.
**Pattern**: `[domain, operation, ...params]`
**Example**: `['player', 'detail', playerId]`
**Purpose**: Cache management, hierarchical invalidation

### Cache Invalidation

**Definition**: Process of marking cached data as stale to trigger refetch.
**Strategies**: Domain-level (creates), Granular (updates), Removal (deletes)
**Tool**: `queryClient.invalidateQueries({ queryKey: [...] })`

### Server Action

**Definition**: Next.js server-side function callable from client components.
**Pattern**: Async function with `'use server'` directive
**Wrapper**: `withServerActionWrapper` for error handling and telemetry
**Location**: `app/actions/`

### Zustand Store

**Definition**: Lightweight state management for UI-only state.
**Scope**: Ephemeral UI (modals, navigation, filters) ONLY
**Anti-Pattern**: Server data in Zustand (use React Query)
**Location**: `store/`

---

## Data Types

### UUID

**Definition**: Universally unique identifier (128-bit).
**Format**: `123e4567-e89b-12d3-a456-426614174000`
**Usage**: All primary keys in PT-2
**Generation**: `gen_random_uuid()` (Postgres function)
**Type**: `string` in TypeScript, `uuid` in Postgres

### Timestamp

**Definition**: Date and time with timezone.
**Format**: ISO 8601 (`2025-10-17T14:30:00Z`)
**Type**: `string` in TypeScript, `timestamptz` in Postgres
**Default**: `now()` for created_at fields

### Enum

**Definition**: Set of named constants.
**Usage**: Status fields, transaction types, directions
**Example**: `status: 'active' | 'inactive' | 'pending'`
**Storage**: Postgres enum or text with check constraint

---

## Status Values

### Player Status

- `active`: Player can visit casinos
- `inactive`: Player account suspended
- `banned`: Player permanently excluded

### Visit Status

- `active`: Visit in progress (checked in, not checked out)
- `completed`: Visit ended (checked out)
- `cancelled`: Visit cancelled before completion

### Table Status

- `active`: Table operational and available
- `inactive`: Table closed or unavailable
- `maintenance`: Table under repair

### TableContext Status

- `open`: Table session active
- `closed`: Table session ended
- `paused`: Table temporarily suspended

---

## Acronyms & Abbreviations

### Project

- **PT-2**: Project Title 2 (this casino tracker application)
- **MVP**: Minimum Viable Product
- **PRD**: Product Requirements Document
- **ADR**: Architecture Decision Record

### Technical

- **API**: Application Programming Interface
- **CRUD**: Create, Read, Update, Delete
- **DB**: Database
- **DTO**: Data Transfer Object
- **E2E**: End-to-End (testing)
- **FK**: Foreign Key
- **PK**: Primary Key
- **RLS**: Row Level Security
- **SQL**: Structured Query Language
- **SSR**: Server-Side Rendering
- **TDD**: Test-Driven Development
- **UI**: User Interface
- **UX**: User Experience

### Libraries & Frameworks

- **RTL**: React Testing Library
- **RQ**: React Query (TanStack Query v5)

### Compliance

- **AML**: Anti-Money Laundering
- **BSA**: Bank Secrecy Act
- **CTR**: Currency Transaction Report
- **KYC**: Know Your Customer
- **MTL**: Money Transaction Logging

### Performance

- **LCP**: Largest Contentful Paint
- **TBT**: Total Blocking Time
- **WCAG**: Web Content Accessibility Guidelines

---

## Conventions

### Naming Conventions

**Files**:

- Components: `PascalCase.tsx` (e.g., `PlayerList.tsx`)
- Services: `kebab-case.ts` (e.g., `player-service.ts`)
- Tests: `{name}.test.ts` (e.g., `player-service.test.ts`)
- Types: `database.types.ts` (generated)
- Actions: `{domain}-actions.ts` (e.g., `player-actions.ts`)

**Code**:

- Interfaces: `PascalCase` (e.g., `PlayerService`)
- Types: `PascalCase` (e.g., `PlayerDTO`)
- Functions: `camelCase` (e.g., `createPlayerService`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `CTR_THRESHOLD`)
- Variables: `camelCase` (e.g., `playerService`)

**Database**:

- Tables: `snake_case` (e.g., `player_loyalty`)
- Columns: `camelCase` in types, `snake_case` in DB (e.g., `firstName` → `first_name`)
- Enums: `snake_case` (e.g., `player_status`)

### Code Organization

**Service Structure**:

```
services/{domain}/
├── index.ts          # Factory + interface
├── crud.ts           # CRUD operations
├── business.ts       # Business logic (optional)
└── queries.ts        # Specialized queries (optional)
```

**Test Structure**:

```
__tests__/
├── services/{domain}/
│   └── {domain}-service.test.ts
├── integration/
│   └── {workflow}.test.ts
└── actions/
    └── {domain}-actions.test.ts
```

**Component Structure**:

```
app/{feature}/
├── page.tsx          # Next.js page
├── {component}.tsx   # Feature components
└── README.md         # Component documentation (optional)

components/
├── ui/               # Shadcn UI primitives
└── shared/           # Shared components
```

---

## Common Patterns

### Service Factory Pattern

```typescript
// interface + factory in index.ts
export interface PlayerService {
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
}

export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {
  const crud = createPlayerCrud(supabase);
  return { ...crud };
}
```

### Server Action Pattern

```typescript
// With wrapper
export async function getPlayer(id: string) {
  return withServerActionWrapper("getPlayer", async () => {
    const supabase = await createClient();
    const service = createPlayerService(supabase);
    return service.getById(id);
  });
}
```

### React Query Hook Pattern

```typescript
// Query hook
export function usePlayer(id: string) {
  return useServiceQuery({
    queryKey: ["player", "detail", id],
    queryFn: () => getPlayer(id),
  });
}

// Mutation hook
export function useCreatePlayer() {
  return useServiceMutation(createPlayerAction, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["player"] });
    },
  });
}
```

---

## Quick Reference

### Service Layer

- **Pattern**: Functional factories (`createXService`)
- **Interface**: Explicit (`interface XService`)
- **Typing**: `SupabaseClient<Database>` (never `any`)
- **Return**: `ServiceResult<T>`
- **Exports**: Named only (no default)

### State Management

- **Server State**: React Query (all Supabase data)
- **UI State**: Zustand (modals, navigation, filters)
- **Query Keys**: `[domain, operation, ...params]`
- **Cache Strategy**: 5min staleTime, 30min gcTime

### Database

- **Local**: `types/database.types.ts`
- **Remote**: `types/remote/database.types.ts`
- **Regenerate**: `npm run db:types` (after migrations)
- **Migrations**: `supabase/migrations/YYYYMMDDHHMMSS_*.sql`

### Testing

- **Location**: `__tests__/services/{domain}/`
- **Pattern**: Service-layer testing (not server actions)
- **Coverage**: >90% target
- **Types**: Unit (services) + Integration (workflows) + E2E (UI flows)

---

## References

**Architecture**:

- `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md` - Complete system specification
- `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` - Service architecture
- `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md` - Vertical vs horizontal

**Memory Files**:

- `project-context.memory.md` - Tech stack and constraints
- `anti-patterns.memory.md` - Violations to avoid
- `architecture-decisions.memory.md` - ADR summaries
- `phase-status.memory.md` - Current work status
- `service-catalog.memory.md` - Service implementations

**Auto-Load**: This file loads automatically with `.claude/config.yml`

---

**Version**: 1.0.0
**Lines**: ~640 (target: <700)
**Next Update**: When new terms or patterns are introduced

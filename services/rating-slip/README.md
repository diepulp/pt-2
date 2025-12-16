# RatingSlipService

> **Bounded Context**: Rating slip lifecycle for gameplay sessions
> **Pattern**: Pattern B (Canonical CRUD with mappers.ts)
> **PRD Reference**: [PRD-002 Rating Slip Service](../../docs/10-prd/PRD-002-rating-slip-service.md)
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
> **Status**: Implemented

## Overview

RatingSlipService manages gameplay telemetry for rated sessions at gaming tables. Pit staff use this service to start, pause, resume, and close rating slips that track player activity (average bet, duration, seat position). The service provides telemetry data consumed by LoyaltyService for point accrual and mid-session rewards.

**Key Invariants**:
- Rating slips are tied to visits (not players directly)
- Player identity is derived from `visit.player_id` at query time
- Ghost visits (`player_id = null`) CAN have rating slips for compliance-only telemetry (ADR-014)
- Ghost visit rating slips are excluded from automated loyalty accrual (checked at LoyaltyService)
- Duration calculation excludes paused intervals (server-authoritative)
- Only one open/paused slip per visit per table

## Ownership

**Tables** (2):
- `rating_slip` - Gameplay session tracking (visit, table, seat, average_bet, duration)
- `rating_slip_pause` - Pause intervals with start/end timestamps

**DTOs**:
- `RatingSlipDTO` - Session record (excludes player_id)
- `RatingSlipWithDurationDTO` - Session with calculated duration
- `RatingSlipWithPausesDTO` - Session with pause history
- `RatingSlipPauseDTO` - Pause interval record

## State Machine

```
       +----------+
       | (start)  |
       +----+-----+
            |
            v
       +---------+  pause   +---------+
       |  open   |--------->| paused  |
       |         |<---------|         |
       +----+----+  resume  +----+----+
            |                    |
            | close              | close
            v                    v
       +---------------------------+
       |         closed            |
       +---------------------------+
```

**Status Values**:
- `open` - Active gameplay in progress
- `paused` - Player on temporary break (meal, restroom)
- `closed` - Session completed, duration finalized (terminal)
- `archived` - Soft-deleted (post-MVP)

**Transition Rules**:
- Creation always starts in `open` state
- `open` can transition to `paused` (via pause) or `closed` (via close)
- `paused` can transition to `open` (via resume) or `closed` (via close)
- `closed` is terminal (no transitions out)
- Closing from `paused` state auto-ends the active pause interval

## Operations

### start(casinoId, actorId, input)

Creates a new rating slip for a visit at a table.

**Input**: `CreateRatingSlipInput`
```typescript
{
  visit_id: string;      // Required: visit provides player identity
  table_id: string;      // Required: gaming table UUID
  seat_number?: string;  // Optional: seat position (e.g., "1", "3", "dealer")
  game_settings?: Json;  // Optional: game-specific theoretical settings
}
```

**Returns**: `RatingSlipDTO`

**Errors**:
- `RATING_SLIP_DUPLICATE` - Open slip already exists for visit at this table
- `VISIT_NOT_FOUND` - Referenced visit does not exist
- `VISIT_NOT_OPEN` - Visit has ended (ended_at is not null)
- `VISIT_CASINO_MISMATCH` - Visit does not belong to specified casino
- `TABLE_NOT_FOUND` - Referenced table does not exist
- `TABLE_NOT_ACTIVE` - Table is not in active status

> **Note**: Ghost visits (player_id = null) are allowed per ADR-014. They create
> compliance-only rating slips that are excluded from loyalty accrual.

### pause(casinoId, actorId, slipId)

Pauses an open rating slip, creating a new pause interval record.

**Returns**: `RatingSlipDTO` with status `paused`

**Errors**:
- `RATING_SLIP_NOT_FOUND` - Slip does not exist
- `RATING_SLIP_NOT_OPEN` - Slip is not in open state (already paused or closed)

### resume(casinoId, actorId, slipId)

Resumes a paused rating slip, ending the active pause interval.

**Returns**: `RatingSlipDTO` with status `open`

**Errors**:
- `RATING_SLIP_NOT_FOUND` - Slip does not exist
- `RATING_SLIP_NOT_PAUSED` - Slip is not in paused state

### close(casinoId, actorId, slipId, input?)

Closes a rating slip (terminal state), calculating final duration.

**Input**: `CloseRatingSlipInput` (optional)
```typescript
{
  average_bet?: number;  // Optional: final average bet for theoretical calculation
}
```

**Returns**: `RatingSlipWithDurationDTO`
```typescript
{
  ...RatingSlipDTO,
  duration_seconds: number;  // Active play duration excluding pauses
}
```

**Errors**:
- `RATING_SLIP_NOT_FOUND` - Slip does not exist
- `RATING_SLIP_ALREADY_CLOSED` - Slip has already been closed

### getById(slipId)

Gets a rating slip by ID with its complete pause history.

**Returns**: `RatingSlipWithPausesDTO`
```typescript
{
  ...RatingSlipDTO,
  pauses: RatingSlipPauseDTO[];  // Array of pause intervals
}
```

**Errors**:
- `RATING_SLIP_NOT_FOUND` - Slip does not exist

### listForTable(tableId, filters?)

Lists rating slips for a specific gaming table with optional filters.

**Filters**: `{ status?, limit?, cursor? }`

**Returns**: `{ items: RatingSlipDTO[], cursor: string | null }`

Results are paginated and ordered by `start_time` descending.

### listForVisit(visitId)

Lists all rating slips associated with a visit session.

**Returns**: `RatingSlipDTO[]`

### getActiveForTable(tableId)

Gets open and paused rating slips for a table. Used for pit boss view of current table activity.

**Returns**: `RatingSlipDTO[]` (status = 'open' or 'paused')

### getDuration(slipId, asOf?)

Calculates the active play duration for a rating slip, excluding all paused intervals.

**Parameters**:
- `slipId` - Rating slip UUID
- `asOf` - Optional timestamp to calculate duration as of (defaults to now)

**Returns**: `number` (duration in seconds)

**Errors**:
- `RATING_SLIP_NOT_FOUND` - Slip does not exist

### updateAverageBet(slipId, averageBet)

Updates the average bet on an open or paused slip. Can be updated multiple times before close.

**Returns**: `RatingSlipDTO`

**Errors**:
- `RATING_SLIP_NOT_FOUND` - Slip does not exist
- `RATING_SLIP_INVALID_STATE` - Cannot update closed slip

## Duration Calculation

Duration is calculated server-side via PostgreSQL RPC to ensure accuracy:

```
duration_seconds = (end_time - start_time) - SUM(pause_intervals)
```

Where each pause interval is:
```
pause_interval = ended_at - started_at  (or now() if ended_at IS NULL)
```

**RPCs**:
- `rpc_get_rating_slip_duration(p_rating_slip_id, p_as_of?)` - Get current duration
- `rpc_close_rating_slip(...)` - Close and return final duration

All state transitions use `FOR UPDATE` row locking to prevent race conditions.

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `RATING_SLIP_NOT_FOUND` | 404 | Rating slip does not exist |
| `RATING_SLIP_DUPLICATE` | 409 | Open slip already exists for visit at table |
| `RATING_SLIP_NOT_OPEN` | 409 | Cannot pause a non-open slip |
| `RATING_SLIP_NOT_PAUSED` | 409 | Cannot resume a non-paused slip |
| `RATING_SLIP_ALREADY_CLOSED` | 409 | Cannot close an already closed slip |
| `RATING_SLIP_INVALID_STATE` | 409 | Invalid state transition |
| `VISIT_NOT_FOUND` | 404 | Referenced visit does not exist |
| `VISIT_NOT_OPEN` | 409 | Visit has ended |
| `VISIT_CASINO_MISMATCH` | 403 | Visit belongs to different casino |
| `TABLE_NOT_FOUND` | 404 | Referenced table does not exist |
| `TABLE_NOT_ACTIVE` | 409 | Table is not in active status |

## Published Queries

Published queries are the ONLY allowlisted way for other bounded contexts to query RatingSlipService data. These return minimal, boundary-compliant responses (booleans, counts) rather than full DTOs.

### hasOpenSlipsForTable(supabase, tableId, casinoId)

Cross-context query for TableContextService consumption.

**Returns**: `boolean` - true if any open/paused slips exist for the table

**Usage**: Gate table deactivation to prevent closing tables with active sessions.

```typescript
import { hasOpenSlipsForTable } from '@/services/rating-slip';

// In TableContextService before deactivating a table:
const hasOpenSlips = await hasOpenSlipsForTable(supabase, tableId, casinoId);
if (hasOpenSlips) {
  throw new DomainError(
    "TABLE_HAS_OPEN_SLIPS",
    "Cannot deactivate table with open rating slips"
  );
}
```

### countOpenSlipsForTable(supabase, tableId, casinoId)

Cross-context query for UI display or capacity planning.

**Returns**: `number` - Count of open/paused slips at the table

## Move Player Operation

Moving a player from one table to another is orchestrated by the **rating-slip-modal BFF service** (`services/rating-slip-modal/`), NOT this domain service. The move operation:

1. **Closes** the current rating slip at the origin table
2. **Starts** a new rating slip at the destination table with the **same `visit_id`**

This preserves session continuity so financial transactions and loyalty points remain associated with the visit.

**Endpoint**: `POST /api/v1/rating-slips/[id]/move`

```typescript
// Request body
{
  destinationTableId: string;       // Target table UUID
  destinationSeatNumber?: string;   // Optional seat (null for unseated)
  averageBet?: number;              // Final avg bet for closing slip
}

// Response
{
  newSlipId: string;    // New slip at destination
  closedSlipId: string; // Original slip (now closed)
}
```

**Why BFF orchestrates (not domain service):**
- Move requires cross-context coordination (validate destination table)
- The domain service provides primitives (`close()`, `start()`)
- BFF handles UI-specific orchestration and idempotency

See: [`services/rating-slip-modal/README.md`](../rating-slip-modal/README.md) for full move documentation.

## Cross-Context Consumers

| Consumer | Query/DTO | Purpose |
|----------|-----------|---------|
| **TableContextService** | `hasOpenSlipsForTable()` | Gate table deactivation |
| **LoyaltyService** | `RatingSlipDTO` | Mid-session rewards, point accrual |
| **PlayerFinancialService** | `RatingSlipDTO` | Link transactions to rating sessions |
| **Pit Dashboard** | `getActiveForTable()` | Display active sessions at tables |
| **MTLService** | `RatingSlipDTO` | Compliance tracking |
| **RatingSlipModal BFF** | `close()`, `start()` | Move player orchestration |

## React Query Keys

```typescript
import { ratingSlipKeys } from '@/services/rating-slip';

// List queries (with .scope for invalidation)
ratingSlipKeys.list(filters)           // All slips with filters
ratingSlipKeys.list.scope              // Invalidate all list queries

// Detail queries
ratingSlipKeys.detail(slipId)          // Single slip with pauses
ratingSlipKeys.duration(slipId)        // Calculated duration

// Scoped queries
ratingSlipKeys.forTable(tableId, filters)   // Slips for a table
ratingSlipKeys.forTable.scope               // Invalidate all forTable queries
ratingSlipKeys.forVisit(visitId)            // Slips for a visit
ratingSlipKeys.activeForTable(tableId)      // Open/paused slips at table

// Mutation keys
ratingSlipKeys.start()
ratingSlipKeys.pause(slipId)
ratingSlipKeys.resume(slipId)
ratingSlipKeys.close(slipId)
ratingSlipKeys.updateAverageBet(slipId)
```

## Usage Examples

### Starting a Rating Slip (Server)

```typescript
import { createRatingSlipService } from '@/services/rating-slip';

const service = createRatingSlipService(supabase);

const slip = await service.start(casinoId, actorId, {
  visit_id: visitId,
  table_id: tableId,
  seat_number: '3',
  game_settings: { min_bet: 25, max_bet: 500 },
});
```

### Full Lifecycle (Server)

```typescript
const service = createRatingSlipService(supabase);

// Start
const slip = await service.start(casinoId, actorId, {
  visit_id: visitId,
  table_id: tableId,
});

// Pause for player break
const paused = await service.pause(casinoId, actorId, slip.id);

// Resume when player returns
const resumed = await service.resume(casinoId, actorId, slip.id);

// Close with final average bet
const closed = await service.close(casinoId, actorId, slip.id, {
  average_bet: 75,
});

console.log(`Session duration: ${closed.duration_seconds} seconds`);
```

### HTTP Fetchers (Client)

```typescript
import {
  startRatingSlip,
  pauseRatingSlip,
  resumeRatingSlip,
  closeRatingSlip,
  getRatingSlip,
  listRatingSlips,
  getRatingSlipDuration,
  updateAverageBet,
} from '@/services/rating-slip/http';

// Start a new slip
const slip = await startRatingSlip({
  visit_id: visitId,
  table_id: tableId,
});

// Get slip with pause history
const slipWithPauses = await getRatingSlip(slipId);

// Get current duration
const duration = await getRatingSlipDuration(slipId);

// Close slip
const closedSlip = await closeRatingSlip(slipId, { average_bet: 100 });
```

### Using Published Query (Cross-Context)

```typescript
// In TableContextService
import { hasOpenSlipsForTable } from '@/services/rating-slip';

async function deactivateTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
) {
  // Check for open slips before deactivating
  const hasOpenSlips = await hasOpenSlipsForTable(supabase, tableId, casinoId);

  if (hasOpenSlips) {
    throw new DomainError(
      "TABLE_HAS_OPEN_SLIPS",
      "Cannot deactivate table with open rating slips"
    );
  }

  // Proceed with deactivation...
}
```

## File Structure

```
services/rating-slip/
├── __tests__/              # Unit and integration tests
│   ├── rating-slip.service.test.ts
│   ├── queries.test.ts
│   └── http.test.ts
├── dtos.ts                 # TypeScript DTOs (Pick/Omit from Database types)
├── schemas.ts              # Zod validation schemas
├── selects.ts              # Supabase column projection strings
├── mappers.ts              # Row -> DTO transformers
├── crud.ts                 # Database operations (RPC-backed state machine)
├── queries.ts              # Published queries for cross-context consumption
├── index.ts                # Service factory + interface
├── keys.ts                 # React Query key factories
├── http.ts                 # HTTP fetchers for client-side
└── README.md               # This file
```

## Related Documentation

- [PRD-002: Rating Slip Service](../../docs/10-prd/PRD-002-rating-slip-service.md)
- [EXECUTION-SPEC-PRD-002](../../docs/20-architecture/specs/PRD-002/EXECUTION-SPEC-PRD-002.md)
- [SERVICE_RESPONSIBILITY_MATRIX.md](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../../docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
- [ADR-012: Error Handling Layers](../../docs/80-adrs/ADR-012-error-handling-layers.md)
- [ADR-014: Visit Kind Archetypes](../../docs/80-adrs/ADR-014-visit-kind-archetypes.md)

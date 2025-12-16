# RatingSlipModal BFF Service

> **Type**: Backend-for-Frontend (BFF) Aggregation Layer
> **Pattern**: Pattern A (Contract-First DTOs)
> **PRD Reference**: [PRD-008 Rating Slip Modal Integration](../../docs/10-prd/PRD-008-rating-slip-modal-integration.md)
> **Status**: Implemented

## Purpose

This is a **BFF aggregation service**, NOT a domain service. It exists solely to aggregate data from multiple bounded contexts for the rating slip modal UI component.

**This service does NOT own any database tables.**

## Why This Exists

The rating slip modal needs to display data from **5 bounded contexts**:

| Data | Owner Service | What We Fetch |
|------|---------------|---------------|
| Slip details | RatingSlipService | Duration, average bet, status, seat |
| Session anchor | VisitService | Visit ID, gaming day |
| Player identity | PlayerService | Name, card number |
| Points balance | LoyaltyService | Current balance, tier, session suggestion |
| Financial summary | PlayerFinancialService | Cash-in, chips-out totals |

Per PT-2's bounded context rules (SRM v4.4.0), domain services **cannot** directly query tables owned by other contexts. The BFF pattern aggregates this data at the transport layer without violating service boundaries.

## Architecture Decision (PRD-008 §7.2)

> **Why BFF instead of direct service calls?**
> - Modal needs data from 5 bounded contexts
> - Direct calls would require 5 separate React Query hooks
> - BFF aggregates server-side, reducing round trips
> - Maintains bounded context isolation at transport layer

## Relationship to RatingSlipService

| Aspect | `services/rating-slip/` | `services/rating-slip-modal/` (this) |
|--------|-------------------------|--------------------------------------|
| **Type** | Domain Service | BFF Aggregation |
| **PRD** | PRD-002 | PRD-008 |
| **Owns Tables** | `rating_slip`, `rating_slip_pause` | None |
| **Business Logic** | Yes (state machine, validation) | No |
| **Purpose** | CRUD operations, lifecycle | UI data aggregation |

**The domain service for rating slips is `services/rating-slip/`.**

This BFF service calls `RatingSlipService` (and 4 other services) to compose the modal response.

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/rating-slips/[id]/modal-data` | GET | Aggregated modal data |
| `/api/v1/rating-slips/[id]/move` | POST | Move player (close + start) |

## Move Player Operation (WS5)

The move endpoint orchestrates moving a player from one table/seat to another while preserving visit continuity.

### Flow

```
1. Validate slip is not closed
2. Validate destination seat is available (if specified)
3. Close current rating slip → rpc_close_rating_slip
4. Start new rating slip at destination → rpc_start_rating_slip
   └── Uses SAME visit_id (session continuity)
5. Return { newSlipId, closedSlipId }
```

### Request

```typescript
POST /api/v1/rating-slips/[id]/move
Headers:
  - Idempotency-Key: required (prevents duplicate moves)
  - Content-Type: application/json

Body:
{
  destinationTableId: string;       // Target table UUID (required)
  destinationSeatNumber?: string;   // Target seat (optional, null for unseated)
  averageBet?: number;              // Final average bet for closing slip (optional)
}
```

### Response

```typescript
// 200 OK
{
  newSlipId: string;    // UUID of new slip at destination
  closedSlipId: string; // UUID of original slip (now closed)
}
```

### Error Codes

| Code | HTTP | Condition |
|------|------|-----------|
| `RATING_SLIP_NOT_FOUND` | 404 | Slip does not exist |
| `RATING_SLIP_ALREADY_CLOSED` | 409 | Cannot move a closed slip |
| `SEAT_ALREADY_OCCUPIED` | 400 | Destination seat has an active slip |

### Why Visit Continuity Matters

The move preserves `visit_id` so that:
- **Financial transactions** remain linked to the session
- **Loyalty points** accrue correctly across table changes
- **Audit trail** maintains session integrity

### Client-Side Hook

```typescript
import { useMovePlayer } from '@/hooks/rating-slip-modal';

const { mutateAsync, isPending } = useMovePlayer();

// Execute move
const result = await mutateAsync({
  currentSlipId: 'uuid-of-current-slip',
  destinationTableId: 'uuid-of-target-table',
  destinationSeatNumber: '3',
  averageBet: 25,
});

// result.newSlipId - Use to refresh modal with new slip
// result.closedSlipId - Reference to the closed slip
```

### Cache Invalidation

On successful move, `useMovePlayer` invalidates:
- Modal data for both old and new slip IDs
- All dashboard table queries (occupancy changed)
- All dashboard slip queries (active slips changed)
- Dashboard stats queries

### Connection Pooling Safety (ADR-015)

Since the move calls two RPCs (`close()` then `start()`) that may execute on different pooled connections, each RPC self-injects context per ADR-015 Phase 1A. See `services/rating-slip/__tests__/rating-slip-move-pooling.test.ts` for validation tests.

## File Structure

```
services/rating-slip-modal/
├── dtos.ts       # BFF response DTOs (RatingSlipModalDTO, sections)
├── schemas.ts    # Zod validation for route params/responses
├── keys.ts       # React Query key factory
├── http.ts       # Client-side fetchers
├── index.ts      # Re-exports
├── __tests__/    # BFF aggregation tests
└── README.md     # This file
```

## Usage

### Server-side (Route Handler)

```typescript
// app/api/v1/rating-slips/[id]/modal-data/route.ts
// Aggregates from 5 services using Promise.all()
const [slip, visit, player, loyalty, financial] = await Promise.all([
  ratingSlipService.getById(slipId),
  visitService.getById(slip.visit_id),
  playerService.getById(visit.player_id),
  loyaltyService.getBalance(visit.player_id, casinoId),
  financialService.getVisitSummary(slip.visit_id),
]);

return { slip, player, loyalty, financial, tables };
```

### Client-side (React Query)

```typescript
import { fetchRatingSlipModalData } from '@/services/rating-slip-modal';
import { ratingSlipModalKeys } from '@/services/rating-slip-modal';

// In component or hook
const { data } = useQuery({
  queryKey: ratingSlipModalKeys.detail(slipId),
  queryFn: () => fetchRatingSlipModalData(slipId),
});

// Access aggregated data
const playerName = data?.player?.firstName;
const points = data?.loyalty?.currentBalance;
const cashIn = data?.financial?.totalCashIn;
```

## What This Service Does NOT Do

- Own or manage `rating_slip` table (that's `services/rating-slip/`)
- Implement state machine logic (start/pause/resume/close)
- Validate business rules for rating slips
- Store any persistent data

## Related Documentation

- [PRD-002: RatingSlipService](../../docs/10-prd/PRD-002-rating-slip-service.md) - Domain service
- [PRD-008: Rating Slip Modal Integration](../../docs/10-prd/PRD-008-rating-slip-modal-integration.md) - This BFF
- [SRM v4.4.0](../../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md) - Bounded context rules
- [ADR-015](../../docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md) - RLS Pattern C for queries

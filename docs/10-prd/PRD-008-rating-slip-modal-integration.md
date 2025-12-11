# PRD-008 — Rating Slip Modal Service Integration

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Created:** 2025-12-10
- **Summary:** Integrate the rating slip modal component (`components/modals/rating-slip/rating-slip-modal.tsx`) with the service layer by implementing a Backend-for-Frontend (BFF) aggregation endpoint. The modal requires data from five bounded contexts (RatingSlip, Player, Visit, Loyalty, PlayerFinancial) which must be orchestrated without violating bounded context boundaries. This PRD defines the aggregation pattern, service consumption rules, and the "Move Player" lifecycle that closes the current slip and opens a new one at a different table/seat while preserving visit-level telemetry.

## 2. Problem & Goals

### 2.1 Problem

The rating slip modal component exists but uses placeholder types and has no integration with the service layer. The modal needs to display and manage data that spans multiple bounded contexts:

| Field | Required From | Current State |
|-------|---------------|---------------|
| `playerName` | PlayerService (via Visit) | Placeholder |
| `averageBet` | RatingSlipService | Placeholder |
| `cashIn` | PlayerFinancialService | Placeholder |
| `startTime` | RatingSlipService | Placeholder |
| `gameTableId` | RatingSlipService | Placeholder |
| `seatNumber` | RatingSlipService | Placeholder |
| `points` | LoyaltyService | Placeholder (was incorrectly marked out of scope) |
| `chipsTaken` | PlayerFinancialService (on close) | Placeholder |

Without proper integration:
- Modal displays mock data instead of real player/slip information
- Save/Close actions don't persist changes
- Move player functionality cannot work
- Points display is non-functional despite LoyaltyService existing

### 2.2 Goals

1. **Cross-context aggregation**: BFF endpoint aggregates data from 5 bounded contexts for modal consumption
2. **Bounded context compliance**: No direct cross-context table access; all data via published DTOs/queries
3. **Move player lifecycle**: Close current slip + start new slip at destination (preserves visit-level continuity)
4. **Real-time points display**: Show current loyalty balance from LoyaltyService
5. **Financial integration**: Record cash-in/chips-taken via PlayerFinancialService

### 2.3 Non-Goals

- Schema changes to `rating_slip` table (cash_in and chips_taken belong to PlayerFinancialService)
- Modifying immutable fields (`table_id`, `seat_number`) on existing slips (per PRD-002 §7.2)
- Atomic "transfer" operation (use close + start pattern per SRM invariants)
- Points calculation logic (LoyaltyService owns this)

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor (via Pit Dashboard modal)
- **System consumers:** Pit Dashboard component

**Top Jobs:**

1. As a **Pit Boss**, I need to view a player's current session details (average bet, duration, points earned) in a modal so that I can make informed rating decisions.

2. As a **Pit Boss**, I need to update a player's average bet during their session so that their rating accurately reflects their play level.

3. As a **Floor Supervisor**, I need to move a player to a different table/seat so that I can accommodate table changes while preserving their session continuity.

4. As a **Pit Boss**, I need to close a player's session and record the chips taken so that their final rating is calculated correctly.

5. As a **Floor Supervisor**, I need to see the player's current loyalty points so that I can inform them of their rewards status.

## 4. Scope & Feature List

### P0 (Must-Have)

- **BFF Endpoint**: `GET /api/v1/rating-slips/[id]/modal-data` aggregates data from all 5 services
- **Modal DTO**: `RatingSlipModalDTO` with player, slip, loyalty, and financial data
- **Save Changes**: Update `average_bet` via RatingSlipService
- **Close Session**: Close slip + record chips-taken via PlayerFinancialService
- **Points Display**: Real-time balance from LoyaltyService
- **Table List**: Available tables with seat availability for move player

### P1 (Should-Have)

- **Move Player**: Close current slip + start new slip at destination table/seat
- **Cash-In Tracking**: Record buy-in via PlayerFinancialService
- **Optimistic Updates**: React Query mutations with immediate UI feedback

### P2 (Nice-to-Have)

- **Session Summary**: Aggregate stats across all slips for current visit
- **Move History**: Show previous table/seat positions within the visit

## 5. Requirements

### 5.1 Functional Requirements

**Data Aggregation (BFF)**
- BFF endpoint fetches data from RatingSlipService, PlayerService, VisitService, LoyaltyService in parallel
- Response includes denormalized player name (from `visit.player_id` → `player`)
- Response includes current loyalty balance (from `player_loyalty.balance`)
- Response handles null player (ghost visits) gracefully

**Save Changes**
- Call `RatingSlipService.updateAverageBet()` with form values
- Mutation invalidates relevant React Query cache keys

**Close Session**
- Call `RatingSlipService.close()` to close the slip
- Call `PlayerFinancialService.recordTransaction()` with chips-taken amount (if provided)
- Both operations use same idempotency key for correlation

**Move Player (Close + Start Pattern)**
- Validate destination table is active
- Validate destination seat is not occupied (unique constraint check)
- Close current slip at original table/seat
- Start new slip at destination table/seat with same `visit_id`
- All slips for the visit share session-level aggregation via `visit_id`

**Points Display**
- Fetch `player_loyalty.balance` via LoyaltyService
- Display in modal footer as "Current Points"
- Points tracked per `(player_id, casino_id)` composite key

### 5.2 Non-Functional Requirements

- p95 BFF response latency < 500ms (5 parallel service calls)
- All mutations use idempotency keys
- Modal renders loading skeleton during data fetch

### 5.3 Architectural Requirements

**Bounded Context Compliance (SRM v4.0.0)**

| Field | Owner Service | Access Pattern |
|-------|---------------|----------------|
| `playerName` | PlayerService | Via VisitService DTO (visit includes player reference) |
| `averageBet` | RatingSlipService | Direct DTO |
| `cashIn` | PlayerFinancialService | Query by `visit_id` + type='buy_in' |
| `startTime` | RatingSlipService | Direct DTO |
| `points` | LoyaltyService | Query `player_loyalty.balance` |
| `chipsTaken` | PlayerFinancialService | Mutation on close |

**Key Invariant (PRD-002 §7.2)**: `table_id` and `seat_number` are immutable on `rating_slip`. Player movement requires close + start, not update.

**Visit-Level Aggregation**: Multiple slips per visit are allowed (per PRD-002). Moving creates a new slip but all slips share the same `visit_id`, enabling:
- LoyaltyService to aggregate points across all slips for the visit
- PlayerFinancialService to aggregate cash-in/out for the visit
- Session duration calculated as sum of all slip durations

> Architecture details live in SRM and SLAD. This PRD does not duplicate them.

## 6. UX / Flow Overview

**View Rating Slip Modal**
1. User clicks occupied seat in Pit Dashboard
2. Dashboard calls `GET /api/v1/rating-slips/[id]/modal-data`
3. BFF aggregates data from 5 services
4. Modal displays: player name, average bet, cash in, start time, points

**Update Average Bet**
1. User modifies average bet using increment buttons
2. User clicks "Save Changes"
3. Mutation calls `PATCH /api/v1/rating-slips/[id]` with `{ average_bet }`
4. Modal shows success state

**Move Player**
1. User selects destination table from dropdown
2. User enters destination seat number
3. User clicks "Move Player"
4. System validates destination is available
5. System closes current slip
6. System starts new slip at destination with same `visit_id`
7. Modal refreshes with new slip data

**Close Session**
1. User enters chips taken amount (optional)
2. User clicks "Close Session"
3. System closes rating slip
4. System records chips-taken transaction (if amount > 0)
5. Modal closes, dashboard refreshes

```
Modal Layout:
┌────────────────────────────────────────────────────────┐
│ Rating Slip - [Player Name]                        [X] │
├────────────────────────────────────────────────────────┤
│                                                        │
│ AVERAGE BET                              [Reset]       │
│ [$XXX]  [-] [+5] [+25] [+100] [+500] [+1000]          │
│                                                        │
│ CASH IN                                  [Reset]       │
│ [$XXX]  [-] [+5] [+25] [+100] [+500] [+1000]          │
│                                                        │
│ START TIME                               [Reset]       │
│ [DateTime] [-15m] [-5m] [+5m] [+15m]                  │
│                                                        │
│ MOVE PLAYER                                            │
│ Table: [Dropdown]  Seat: [Input]  [Move Player]       │
│                                                        │
│ CHIPS TAKEN (on close)                                 │
│ [$XXX]  [-] [+5] [+25] [+100] [+500] [+1000]          │
│                                                        │
│ [Save Changes]              [X Close Session]          │
│                                                        │
├────────────────────────────────────────────────────────┤
│ Current Points                           [1,234]       │
└────────────────────────────────────────────────────────┘
```

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| RatingSlipService (PRD-002) | COMPLETE | Slip lifecycle, average_bet update |
| PlayerService (PRD-003) | COMPLETE | Player identity |
| VisitService (PRD-003) | COMPLETE | Visit anchor, player reference |
| LoyaltyService | PARTIAL | `player_loyalty` table exists, query needed |
| PlayerFinancialService | NOT STARTED | Schema exists, service layer needed |
| TableContextService (PRD-007) | COMPLETE | Table list for move dropdown |
| Modal Component | EXISTS | `components/modals/rating-slip/rating-slip-modal.tsx` |

**Service Layer Gaps**

| Service | Gap | Required For |
|---------|-----|--------------|
| LoyaltyService | No `getPlayerBalance()` query | Points display |
| PlayerFinancialService | No service layer | Cash-in, chips-taken recording |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| PlayerFinancialService not implemented | Create minimal service with `recordTransaction()` for close flow |
| LoyaltyService balance query missing | Add `getPlayerBalance(playerId, casinoId)` to existing service |
| Move player destination validation | Query active slips before starting new slip |

**Design Decisions:**

1. **Why BFF instead of direct service calls?**
   - Modal needs data from 5 bounded contexts
   - Direct calls would require 5 separate React Query hooks
   - BFF aggregates server-side, reducing round trips
   - Maintains bounded context isolation at transport layer

2. **Why close + start for move instead of update?**
   - `table_id` and `seat_number` are immutable per PRD-002 §7.2
   - Immutability ensures accurate position tracking for telemetry
   - Visit-level aggregation (via `visit_id`) preserves session continuity
   - LoyaltyService aggregates points across all slips for a visit

3. **Where does cash-in/chips-taken live?**
   - PlayerFinancialService per ADR-006 (financial fields removed from rating_slip)
   - Transactions linked by `visit_id` for session-level aggregation
   - RatingSlipService remains pure telemetry (gameplay measurement)

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] BFF endpoint returns aggregated modal data from all 5 services
- [ ] Save Changes updates average_bet via RatingSlipService
- [ ] Close Session closes slip and records chips-taken transaction
- [ ] Move Player closes current slip and starts new slip at destination
- [ ] Points display shows current balance from LoyaltyService
- [ ] Table dropdown shows available tables with seat availability

**Data & Integrity**
- [ ] Move player creates new slip with same `visit_id` (session continuity)
- [ ] Chips-taken transaction linked to visit
- [ ] Destination seat validation prevents double-occupancy

**Security & Access**
- [ ] BFF endpoint respects RLS (user's casino only)
- [ ] All mutations require authenticated session
- [ ] Financial transactions require pit_boss or higher role

**Architecture Compliance**
- [ ] No direct cross-context table access
- [ ] All service consumption via DTOs/published queries
- [ ] Idempotency keys on all mutations
- [ ] Zero `as` type assertions

**Testing**
- [ ] Unit tests for BFF data aggregation
- [ ] Unit tests for move player flow (close + start)
- [ ] Integration test: Open modal → Save changes → Close session
- [ ] Integration test: Move player to different table

**Documentation**
- [ ] BFF endpoint documented with request/response schemas
- [ ] Modal integration guide for Pit Dashboard

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.0.0)
- **Service Layer (SLAD):** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **RatingSlipService:** `docs/10-prd/PRD-002-rating-slip-service.md`
- **Pit Dashboard:** `docs/10-prd/PRD-006-pit-dashboard.md`
- **Visit Archetypes:** `docs/80-adrs/ADR-014-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md`
- **Financial Fields Removal:** `docs/80-adrs/ADR-006-rating-slip-financial-removal.md`
- **DTO Standard:** `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **Schema / Types:** `types/database.types.ts`
- **RLS Policy Matrix:** `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Modal Component:** `components/modals/rating-slip/rating-slip-modal.tsx`

## 10. Implementation Workstreams

### WS1: LoyaltyService Balance Query
**Agent:** backend-developer
**Effort:** Small
**Dependencies:** None

- Add `getPlayerBalance(playerId, casinoId)` to LoyaltyService
- Query `player_loyalty` table for balance
- Add React Query hook `usePlayerLoyaltyBalance`

### WS2: PlayerFinancialService Foundation
**Agent:** backend-developer
**Effort:** Medium
**Dependencies:** None (parallel with WS1)

- Create `services/player-financial/` with Pattern A structure
- Implement `recordTransaction()` for buy-in and chips-taken
- Create `dtos.ts`, `schemas.ts`, `crud.ts`, `index.ts`
- Add RLS policies for `player_financial_transaction`

### WS3: BFF Aggregation Endpoint
**Agent:** api-expert
**Effort:** Medium
**Dependencies:** WS1, WS2

- Create `app/api/v1/rating-slips/[id]/modal-data/route.ts`
- Aggregate from RatingSlip, Player, Visit, Loyalty, Financial services
- Define `RatingSlipModalDTO` response schema
- Parallel service calls with `Promise.all()`

### WS4: Modal Service Integration
**Agent:** pt2-frontend-implementer
**Effort:** Medium
**Dependencies:** WS3

- Replace placeholder types with service DTOs
- Create `useRatingSlipModal` hook for BFF consumption
- Wire up `onSave`, `onCloseSession`, `onMovePlayer` callbacks
- Add loading/error states

### WS5: Move Player Flow
**Agent:** backend-developer
**Effort:** Small
**Dependencies:** WS3

- Implement move validation (destination available)
- Orchestrate close + start with same `visit_id`
- Add mutation hook `useMovePlayer`

### WS6: Testing & Validation
**Agent:** backend-developer
**Effort:** Small
**Dependencies:** WS1-WS5

- Unit tests for BFF aggregation
- Integration tests for modal flows
- E2E test: Full modal lifecycle

---

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-10 | Lead Architect | Initial draft with corrected bounded context ownership |

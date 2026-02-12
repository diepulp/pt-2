---
prd: PRD-008
title: Rating Slip Modal Service Integration
service: RatingSlipModalBFF
phase: MVP Phase 2 (Operational)
pattern: BFF Aggregation
http_boundary: true
version: 1.0.0
created: 2025-12-13
status: approved

workstreams:
  WS1:
    name: LoyaltyService Integration
    agent: backend-developer
    status: COMPLETE
    depends_on: []
    outputs: [hooks/loyalty/use-loyalty-queries.ts, hooks/loyalty/use-loyalty-mutations.ts]
    gate: type-check
    notes: Completed via PRD-004 v3 implementation

  WS2:
    name: PlayerFinancialService Foundation
    agent: backend-developer
    status: COMPLETE
    depends_on: []
    outputs: [services/player-financial/]
    gate: type-check
    notes: Completed via PRD-009 implementation

  WS3:
    name: BFF Aggregation Endpoint
    agent: api-expert
    status: pending
    depends_on: [WS1, WS2]
    outputs:
      - app/api/v1/rating-slips/[id]/modal-data/route.ts
      - services/rating-slip-modal/dtos.ts
      - services/rating-slip-modal/schemas.ts
      - hooks/rating-slip-modal/use-rating-slip-modal.ts
    gate: type-check

  WS4:
    name: Modal Service Integration
    agent: pt2-frontend-implementer
    status: pending
    depends_on: [WS3]
    outputs:
      - components/modals/rating-slip/rating-slip-modal.tsx (update)
      - components/modals/rating-slip/use-modal-form-state.ts
    gate: type-check

  WS5:
    name: Move Player Flow
    agent: backend-developer
    status: pending
    depends_on: [WS3]
    outputs:
      - app/api/v1/rating-slips/[id]/move/route.ts
      - hooks/rating-slip-modal/use-move-player.ts
    gate: type-check

  WS6:
    name: Testing & Validation
    agent: backend-developer
    status: pending
    depends_on: [WS3, WS4, WS5]
    outputs:
      - services/rating-slip-modal/__tests__/bff-aggregation.test.ts
      - services/rating-slip-modal/__tests__/move-player.test.ts
    gate: test-pass

execution_phases:
  - name: Phase 0 (Pre-Complete)
    parallel: [WS1, WS2]
    status: COMPLETE
    notes: Dependencies resolved via PRD-004, PRD-009

  - name: Phase 1 (BFF Layer)
    parallel: [WS3]
    status: pending
    gate: type-check

  - name: Phase 2 (Integration)
    parallel: [WS4, WS5]
    status: pending
    gate: type-check

  - name: Phase 3 (Validation)
    parallel: [WS6]
    status: pending
    gate: test-pass

gates:
  - name: type-check
    command: npm run type-check
    required_for: [WS3, WS4, WS5]

  - name: test-pass
    command: npm test services/rating-slip-modal/
    required_for: [WS6]

  - name: build
    command: npm run build
    required_for: [final]
---

# EXECUTION-SPEC: PRD-008 Rating Slip Modal Service Integration

## Overview

This EXECUTION-SPEC defines the implementation plan for PRD-008, which integrates the rating slip modal component with the service layer via a Backend-for-Frontend (BFF) aggregation pattern.

**Key Insight**: WS1 (LoyaltyService) and WS2 (PlayerFinancialService) are already COMPLETE from prior PRD implementations (PRD-004, PRD-009). This execution starts from WS3.

## Architecture Decision

### BFF Pattern Rationale

The modal requires data from 5 bounded contexts:
1. **RatingSlipService** - Slip details (average_bet, start_time, status)
2. **PlayerService** - Player identity (name)
3. **VisitService** - Session anchor (visit_id, player_id)
4. **LoyaltyService** - Points balance (current_balance, tier)
5. **PlayerFinancialService** - Financial summary (cash_in, chips_out)

A BFF endpoint aggregates these server-side:
- Reduces client-side complexity (1 hook vs 5)
- Maintains bounded context isolation
- Enables parallel service calls via `Promise.all()`
- Provides single invalidation target

### Bounded Context Compliance

```
┌─────────────────────────────────────────────────────────────────┐
│                   BFF: /api/v1/rating-slips/[id]/modal-data     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ RatingSlip  │  │   Visit     │  │   Player    │             │
│  │  Service    │  │  Service    │  │  Service    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐             │
│  │ SlipDTO     │  │ VisitDTO    │  │ PlayerDTO   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐                              │
│  │  Loyalty    │  │ Financial   │                              │
│  │  Service    │  │  Service    │                              │
│  └──────┬──────┘  └──────┬──────┘                              │
│         │                │                                      │
│  ┌──────┴──────┐  ┌──────┴──────┐                              │
│  │ LoyaltyDTO  │  │ SummaryDTO  │                              │
│  └─────────────┘  └─────────────┘                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Workstream Details

### WS3: BFF Aggregation Endpoint

**Agent**: `api-expert`
**Effort**: Medium
**Dependencies**: WS1 ✅, WS2 ✅

#### Outputs

1. **Route Handler**: `app/api/v1/rating-slips/[id]/modal-data/route.ts`
   - GET handler aggregating 5 services
   - Uses `withServerAction` middleware for auth/RLS
   - Parallel service calls via `Promise.all()`

2. **DTOs**: `services/rating-slip-modal/dtos.ts`
   ```typescript
   export interface RatingSlipModalDTO {
     slip: {
       id: string;
       visitId: string;
       tableId: string;
       seatNumber: number;
       averageBet: number;
       startTime: string;
       endTime: string | null;
       status: 'open' | 'paused' | 'closed';
       gamingDay: string;
     };
     player: {
       id: string;
       firstName: string;
       lastName: string;
       cardNumber: string | null;
     } | null; // null for ghost visits
     loyalty: {
       currentBalance: number;
       tier: string | null;
       suggestion?: {
         suggestedPoints: number;
         suggestedTheo: number;
         policyVersion: string;
       };
     } | null; // null if no loyalty record or ghost visit
     financial: {
       totalCashIn: number;
       totalChipsOut: number;
       netPosition: number;
     };
     tables: Array<{
       id: string;
       label: string;
       type: string;
       occupiedSeats: number[];
     }>;
   }
   ```

3. **Schemas**: `services/rating-slip-modal/schemas.ts`
   - Zod schemas for request validation
   - Response schema for type safety

4. **Hook**: `hooks/rating-slip-modal/use-rating-slip-modal.ts`
   - `useRatingSlipModalData(slipId)` - Query hook for modal data
   - Cache key factory integration

#### Implementation Notes

- Use existing service factories:
  - `createRatingSlipService(supabase)`
  - `createVisitService(supabase)`
  - `createPlayerService(supabase)`
  - `createLoyaltyService(supabase)`
  - `createPlayerFinancialService(supabase)`
- Fetch player via visit's `player_id` (not direct lookup)
- Handle ghost visits (null player) gracefully
- Include session reward suggestion for open slips only

---

### WS4: Modal Service Integration

**Agent**: `pt2-frontend-implementer`
**Effort**: Medium
**Dependencies**: WS3

#### Outputs

1. **Update Modal Component**: `components/modals/rating-slip/rating-slip-modal.tsx`
   - Replace placeholder props with `useRatingSlipModalData` hook
   - Wire form state to mutation hooks
   - Add loading/error states

2. **Form State Hook**: `components/modals/rating-slip/use-modal-form-state.ts`
   - Local form state management
   - Optimistic update handling
   - Dirty state tracking

#### Implementation Notes

- Use existing increment button components
- Wire `onSave` to `useUpdateRatingSlip` mutation
- Wire `onCloseSession` to close slip + record chips-taken
- Display loyalty points from BFF response
- Show session reward suggestion for active slips

---

### WS5: Move Player Flow

**Agent**: `backend-developer`
**Effort**: Small
**Dependencies**: WS3

#### Outputs

1. **Route Handler**: `app/api/v1/rating-slips/[id]/move/route.ts`
   - POST handler for move player operation
   - Validates destination table/seat availability
   - Orchestrates close + start with same `visit_id`

2. **Mutation Hook**: `hooks/rating-slip-modal/use-move-player.ts`
   - `useMovePlayer()` - Mutation for move operation
   - Invalidates modal data and dashboard queries

#### Implementation Notes

- Check destination seat is not occupied (query active slips)
- Close current slip with `status: 'closed'`, `end_time: now()`
- Start new slip at destination with same `visit_id`
- Return new slip ID for modal refresh

---

### WS6: Testing & Validation

**Agent**: `backend-developer`
**Effort**: Small
**Dependencies**: WS3, WS4, WS5

#### Outputs

1. **BFF Aggregation Tests**: `services/rating-slip-modal/__tests__/bff-aggregation.test.ts`
   - Test parallel service aggregation
   - Test ghost visit handling (null player)
   - Test loyalty suggestion inclusion for open slips

2. **Move Player Tests**: `services/rating-slip-modal/__tests__/move-player.test.ts`
   - Test destination validation
   - Test close + start orchestration
   - Test visit_id preservation

#### Test Cases

```typescript
describe('BFF Aggregation', () => {
  it('aggregates data from 5 services for identified player');
  it('handles ghost visit (null player) gracefully');
  it('includes loyalty suggestion for open slips only');
  it('returns empty tables array if no active tables');
});

describe('Move Player', () => {
  it('validates destination seat is not occupied');
  it('closes current slip and starts new at destination');
  it('preserves visit_id across move');
  it('rejects move to same table/seat');
});
```

## Execution Order

```
Phase 0 (PRE-COMPLETE): WS1 ✅, WS2 ✅
           ↓
Phase 1: [WS3] BFF Aggregation
           ↓
Phase 2: [WS4, WS5] Modal + Move Player (PARALLEL)
           ↓
Phase 3: [WS6] Testing
           ↓
        ✅ DONE
```

## Gate Validation Commands

| Phase | Gate | Command |
|-------|------|---------|
| Phase 1 | type-check | `npm run type-check` |
| Phase 2 | type-check | `npm run type-check` |
| Phase 3 | test-pass | `npm test services/rating-slip-modal/` |
| Final | build | `npm run build` |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| BFF latency > 500ms | Parallel service calls, aggressive caching |
| Ghost visit edge cases | Explicit null checks in DTO mapping |
| Move player race condition | Check seat availability immediately before start |
| Type assertion leakage | Strict mapper functions, no `as` casts |

## Success Criteria

Per PRD-008 DoD:
- [ ] BFF endpoint returns aggregated modal data from all 5 services
- [ ] Save Changes updates average_bet via RatingSlipService
- [ ] Close Session closes slip and records chips-taken transaction
- [ ] Move Player closes current slip and starts new slip at destination
- [ ] Points display shows current balance from LoyaltyService
- [ ] All tests passing
- [ ] Type check passes
- [ ] Build succeeds

---
prd: PRD-008a
title: Rating Slip Modal Dashboard Integration
service: Dashboard Modal Integration
phase: 2
status: pending
created: 2025-12-13
workstreams:
  WS1:
    name: Dashboard Modal State
    agent: backend-developer
    depends_on: []
    outputs:
      - components/dashboard/pit-dashboard-client.tsx (modified)
    gate: type-check
    priority: P0
    estimated_changes: 15-20 lines
  WS2:
    name: Active Slips Panel Click Handler
    agent: backend-developer
    depends_on: []
    outputs:
      - components/dashboard/active-slips-panel.tsx (modified)
    gate: type-check
    priority: P0
    estimated_changes: 10-15 lines
  WS3:
    name: Modal Form State Refactor
    agent: backend-developer
    depends_on: []
    outputs:
      - components/modals/rating-slip/use-modal-form-state.ts (modified)
      - components/modals/rating-slip/rating-slip-modal.tsx (modified)
      - components/modals/rating-slip/form-section-cash-in.tsx (modified)
    gate: type-check
    priority: P0
    estimated_changes: 30-40 lines
  WS4:
    name: Save With Buy-In Mutation Hook
    agent: backend-developer
    depends_on: [WS3]
    outputs:
      - hooks/rating-slip-modal/use-save-with-buyin.ts (new)
      - hooks/rating-slip-modal/index.ts (modified)
    gate: type-check
    priority: P0
    estimated_changes: 60-80 lines
  WS5:
    name: Close With Financial Mutation Hook
    agent: backend-developer
    depends_on: []
    outputs:
      - hooks/rating-slip-modal/use-close-with-financial.ts (new)
      - hooks/rating-slip-modal/index.ts (modified)
    gate: type-check
    priority: P0
    estimated_changes: 50-70 lines
  WS6:
    name: Wire Modal Callbacks to Dashboard
    agent: backend-developer
    depends_on: [WS1, WS4, WS5]
    outputs:
      - components/dashboard/pit-dashboard-client.tsx (modified)
    gate: type-check
    priority: P0
    estimated_changes: 60-80 lines
  WS7:
    name: Unit Tests
    agent: backend-developer
    depends_on: [WS4, WS5, WS6]
    outputs:
      - hooks/rating-slip-modal/__tests__/use-save-with-buyin.test.ts (new)
      - hooks/rating-slip-modal/__tests__/use-close-with-financial.test.ts (new)
    gate: test-pass
    priority: P1
    estimated_changes: 150-200 lines
execution_phases:
  - name: Phase 1 - State & Click Handlers
    parallel: [WS1, WS2, WS3]
    gate: type-check
  - name: Phase 2 - Mutation Hooks
    parallel: [WS4, WS5]
    gate: type-check
  - name: Phase 3 - Callback Wiring
    parallel: [WS6]
    gate: type-check
  - name: Phase 4 - Testing
    parallel: [WS7]
    gate: test-pass
---

# EXECUTION-SPEC: PRD-008a Rating Slip Modal Dashboard Integration

## Overview

This EXECUTION-SPEC defines the implementation plan for wiring the rating slip modal into the pit dashboard. The BFF infrastructure is complete; this spec focuses on:

1. Adding modal state to the dashboard
2. Implementing click handlers for seats and slip cards
3. Creating mutation hooks for save-with-buyin and close-with-financial
4. Wiring callbacks to the modal component

**Scope**: Frontend integration only. No new API endpoints, services, or migrations required.

---

## Workstream Details

### WS1: Dashboard Modal State

**Goal**: Add state management for the rating slip modal to `PitDashboardClient`.

**Changes to `components/dashboard/pit-dashboard-client.tsx`**:

```typescript
// Add state for modal
const [selectedSlipId, setSelectedSlipId] = useState<string | null>(null);
const [isModalOpen, setIsModalOpen] = useState(false);

// Import RatingSlipModal component
import { RatingSlipModal } from '@/components/modals/rating-slip/rating-slip-modal';
```

**Acceptance Criteria**:
- [ ] `selectedSlipId` state tracks currently selected slip
- [ ] `isModalOpen` state controls modal visibility
- [ ] `RatingSlipModal` is imported and rendered conditionally

---

### WS2: Active Slips Panel Click Handler

**Goal**: Make slip cards in `ActiveSlipsPanel` clickable to open the modal.

**Changes to `components/dashboard/active-slips-panel.tsx`**:

1. Add `onSlipClick` prop to `ActiveSlipsPanelProps`:
   ```typescript
   onSlipClick?: (slipId: string) => void;
   ```

2. Make `SlipCard` clickable:
   ```typescript
   <div
     className={cn(...)}
     onClick={() => onSlipClick?.(slip.id)}
     style={{ cursor: onSlipClick ? 'pointer' : 'default' }}
   >
   ```

**Acceptance Criteria**:
- [ ] `onSlipClick` prop added to component interface
- [ ] Clicking slip card calls `onSlipClick` with slip ID
- [ ] Visual cursor feedback when clickable

---

### WS3: Modal Form State Refactor

**Goal**: Separate "new buy-in" from "total cash-in" to support mid-session buy-in recording.

**Changes to `components/modals/rating-slip/use-modal-form-state.ts`**:

1. Rename `cashIn` field to `newBuyIn` in `ModalFormState`:
   ```typescript
   export interface ModalFormState {
     averageBet: string;
     startTime: string;
     newBuyIn: string;  // Changed from cashIn - tracks NEW buy-in amount
     newTableId: string;
     newSeatNumber: string;
     chipsTaken: string;
   }
   ```

2. Initialize `newBuyIn` to "0" (not from totalCashIn):
   ```typescript
   function initializeFormState(data: RatingSlipModalDTO): ModalFormState {
     return {
       // ...
       newBuyIn: "0",  // Always start at 0 for new buy-ins
       // ...
     };
   }
   ```

3. Update increment/decrement field types:
   ```typescript
   const incrementField = (
     field: "averageBet" | "newBuyIn" | "chipsTaken",
     amount: number,
   ) => { ... };
   ```

**Changes to `components/modals/rating-slip/rating-slip-modal.tsx`**:

1. Update field references from `cashIn` to `newBuyIn`
2. Display `totalCashIn` from `modalData.financial.totalCashIn` as read-only
3. Update `isDirty` logic to detect `newBuyIn > 0` as a change

**Changes to `components/modals/rating-slip/form-section-cash-in.tsx`**:

1. Update prop names and labels to reflect "New Buy-In" vs "Total Cash-In"
2. Add read-only display of total cash-in

**Acceptance Criteria**:
- [ ] Form state uses `newBuyIn` field (initialized to "0")
- [ ] Modal displays total cash-in as read-only from financial data
- [ ] `newBuyIn > 0` triggers `isDirty = true`

---

### WS4: Save With Buy-In Mutation Hook

**Goal**: Create a mutation hook that saves average_bet and optionally records a buy-in transaction.

**New file: `hooks/rating-slip-modal/use-save-with-buyin.ts`**:

```typescript
/**
 * Save With Buy-In Mutation Hook
 *
 * Handles saving average_bet changes and recording new buy-in transactions.
 * Combines two operations atomically:
 * 1. Record buy-in transaction (if newBuyIn > 0)
 * 2. Update average_bet via PATCH endpoint
 *
 * @see PRD-008a Rating Slip Modal Dashboard Integration
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dashboardKeys } from '@/hooks/dashboard/keys';
import { playerFinancialKeys } from '@/hooks/player-financial/keys';
import { createFinancialTransaction } from '@/services/player-financial/http';
import { updateAverageBet } from '@/services/rating-slip/http';
import { ratingSlipModalKeys } from '@/services/rating-slip-modal/keys';

export interface SaveWithBuyInInput {
  slipId: string;
  visitId: string;
  playerId: string | null;
  casinoId: string;
  staffId: string;
  averageBet: number;
  newBuyIn: number;  // In dollars (will be converted to cents)
}

export function useSaveWithBuyIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slipId,
      visitId,
      playerId,
      casinoId,
      staffId,
      averageBet,
      newBuyIn,
    }: SaveWithBuyInInput) => {
      // 1. Record buy-in transaction if new amount entered
      if (newBuyIn > 0 && playerId) {
        await createFinancialTransaction({
          casino_id: casinoId,
          player_id: playerId,
          visit_id: visitId,
          rating_slip_id: slipId,
          amount: newBuyIn * 100, // Convert dollars to cents
          direction: 'in',
          source: 'pit',
          tender_type: 'cash',
          created_by_staff_id: staffId,
        });
      }

      // 2. Update average_bet
      return updateAverageBet(slipId, { average_bet: averageBet });
    },
    onSuccess: (_, { slipId, visitId }) => {
      // Invalidate modal data
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.data(slipId),
      });

      // Invalidate financial summary
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummary(visitId),
      });

      // Invalidate dashboard queries
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.slips.scope,
      });
    },
  });
}
```

**Acceptance Criteria**:
- [ ] Hook records buy-in transaction when `newBuyIn > 0`
- [ ] Hook updates average_bet via PATCH endpoint
- [ ] Invalidates modal, financial, and dashboard queries on success
- [ ] Converts dollars to cents for transaction amount

---

### WS5: Close With Financial Mutation Hook

**Goal**: Create a mutation hook that records chips-taken and closes the session.

**New file: `hooks/rating-slip-modal/use-close-with-financial.ts`**:

```typescript
/**
 * Close With Financial Mutation Hook
 *
 * Handles closing a rating slip with optional chips-taken recording.
 * Combines two operations:
 * 1. Record chips-taken transaction (if chipsTaken > 0)
 * 2. Close the rating slip
 *
 * @see PRD-008a Rating Slip Modal Dashboard Integration
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dashboardKeys } from '@/hooks/dashboard/keys';
import { playerFinancialKeys } from '@/hooks/player-financial/keys';
import { createFinancialTransaction } from '@/services/player-financial/http';
import { closeRatingSlip } from '@/services/rating-slip/http';
import { ratingSlipModalKeys } from '@/services/rating-slip-modal/keys';

export interface CloseWithFinancialInput {
  slipId: string;
  visitId: string;
  playerId: string | null;
  casinoId: string;
  staffId: string;
  chipsTaken: number;  // In dollars (will be converted to cents)
  averageBet?: number;  // Optional final average bet
}

export function useCloseWithFinancial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slipId,
      visitId,
      playerId,
      casinoId,
      staffId,
      chipsTaken,
      averageBet,
    }: CloseWithFinancialInput) => {
      // 1. Record chips-taken transaction if amount > 0
      if (chipsTaken > 0 && playerId) {
        await createFinancialTransaction({
          casino_id: casinoId,
          player_id: playerId,
          visit_id: visitId,
          rating_slip_id: slipId,
          amount: chipsTaken * 100, // Convert dollars to cents
          direction: 'out',
          source: 'pit',
          tender_type: 'chips',
          created_by_staff_id: staffId,
        });
      }

      // 2. Close the rating slip (with optional final average_bet)
      return closeRatingSlip(slipId, averageBet ? { average_bet: averageBet } : undefined);
    },
    onSuccess: (_, { slipId, visitId, casinoId }) => {
      // Invalidate all modal queries
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.scope,
      });

      // Invalidate financial summary
      queryClient.invalidateQueries({
        queryKey: playerFinancialKeys.visitSummary(visitId),
      });

      // Invalidate dashboard tables (occupancy changed)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.tables.scope,
      });

      // Invalidate dashboard slips
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.slips.scope,
      });

      // Invalidate dashboard stats
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });
}
```

**Acceptance Criteria**:
- [ ] Hook records chips-taken transaction when amount > 0
- [ ] Hook closes rating slip via POST /close endpoint
- [ ] Supports optional final average_bet
- [ ] Invalidates all relevant queries on success

---

### WS6: Wire Modal Callbacks to Dashboard

**Goal**: Connect the RatingSlipModal to the dashboard with all callbacks implemented.

**Changes to `components/dashboard/pit-dashboard-client.tsx`**:

1. Import mutation hooks:
   ```typescript
   import { useSaveWithBuyIn } from '@/hooks/rating-slip-modal/use-save-with-buyin';
   import { useCloseWithFinancial } from '@/hooks/rating-slip-modal/use-close-with-financial';
   import { useMovePlayer } from '@/hooks/rating-slip-modal';
   ```

2. Use auth context to get staff ID:
   ```typescript
   // Get staff ID from auth context (needed for transaction recording)
   // Note: This assumes auth context provides staff_id; adjust based on actual implementation
   ```

3. Initialize mutations:
   ```typescript
   const saveWithBuyIn = useSaveWithBuyIn();
   const closeWithFinancial = useCloseWithFinancial();
   const movePlayer = useMovePlayer();
   ```

4. Implement callback handlers:
   ```typescript
   const handleSave = async (formState: FormState) => {
     if (!selectedSlipId || !currentSlipData) return;

     await saveWithBuyIn.mutateAsync({
       slipId: selectedSlipId,
       visitId: currentSlipData.slip.visitId,
       playerId: currentSlipData.player?.id ?? null,
       casinoId,
       staffId: /* from auth context */,
       averageBet: Number(formState.averageBet),
       newBuyIn: Number(formState.newBuyIn || formState.cashIn),
     });
   };

   const handleCloseSession = async (formState: FormState) => {
     if (!selectedSlipId || !currentSlipData) return;

     await closeWithFinancial.mutateAsync({
       slipId: selectedSlipId,
       visitId: currentSlipData.slip.visitId,
       playerId: currentSlipData.player?.id ?? null,
       casinoId,
       staffId: /* from auth context */,
       chipsTaken: Number(formState.chipsTaken),
       averageBet: Number(formState.averageBet),
     });

     setIsModalOpen(false);
     setSelectedSlipId(null);
   };

   const handleMovePlayer = async (formState: FormState) => {
     if (!selectedSlipId) return;

     const result = await movePlayer.mutateAsync({
       currentSlipId: selectedSlipId,
       destinationTableId: formState.newTableId,
       destinationSeatNumber: formState.newSeatNumber || null,
       averageBet: Number(formState.averageBet),
     });

     // Switch to new slip after successful move
     setSelectedSlipId(result.newSlipId);
   };
   ```

5. Update seat click handler for occupied seats:
   ```typescript
   const handleSeatClick = (index: number, occupant) => {
     const seatNumber = String(index + 1);
     if (occupant) {
       const slipOccupant = seatOccupants.get(seatNumber);
       if (slipOccupant?.slipId) {
         setSelectedSlipId(slipOccupant.slipId);
         setIsModalOpen(true);
       }
     } else {
       setNewSlipSeatNumber(seatNumber);
       setNewSlipModalOpen(true);
     }
   };
   ```

6. Add `onSlipClick` to `ActiveSlipsPanel`:
   ```typescript
   <ActiveSlipsPanel
     tableId={selectedTableId ?? undefined}
     casinoId={casinoId}
     onNewSlip={handleNewSlip}
     onSlipClick={(slipId) => {
       setSelectedSlipId(slipId);
       setIsModalOpen(true);
     }}
   />
   ```

7. Render `RatingSlipModal`:
   ```typescript
   <RatingSlipModal
     slipId={selectedSlipId}
     isOpen={isModalOpen}
     onClose={() => {
       setIsModalOpen(false);
       setSelectedSlipId(null);
     }}
     onSave={handleSave}
     onCloseSession={handleCloseSession}
     onMovePlayer={handleMovePlayer}
     isSaving={saveWithBuyIn.isPending}
     isClosing={closeWithFinancial.isPending}
     isMoving={movePlayer.isPending}
     error={
       saveWithBuyIn.error?.message ||
       closeWithFinancial.error?.message ||
       movePlayer.error?.message
     }
   />
   ```

**Acceptance Criteria**:
- [ ] Occupied seat click opens modal with correct slip data
- [ ] Slip card click opens modal
- [ ] Save callback records buy-in and updates average_bet
- [ ] Close callback records chips-taken and closes slip
- [ ] Move callback moves player and switches to new slip
- [ ] Loading states are passed to modal
- [ ] Errors are displayed in modal

---

### WS7: Unit Tests

**Goal**: Add unit tests for the new mutation hooks.

**New file: `hooks/rating-slip-modal/__tests__/use-save-with-buyin.test.ts`**:

- Test: Saves average_bet without buy-in when `newBuyIn = 0`
- Test: Records buy-in transaction when `newBuyIn > 0`
- Test: Converts dollars to cents correctly
- Test: Invalidates correct queries on success
- Test: Handles null `playerId` (ghost visit) - skips transaction

**New file: `hooks/rating-slip-modal/__tests__/use-close-with-financial.test.ts`**:

- Test: Closes slip without transaction when `chipsTaken = 0`
- Test: Records chips-taken transaction when `chipsTaken > 0`
- Test: Passes final average_bet to close endpoint
- Test: Invalidates correct queries on success
- Test: Handles null `playerId` (ghost visit) - skips transaction

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] Coverage for happy paths and edge cases
- [ ] Mocks configured correctly for React Query

---

## Execution Order

```
Phase 1: [WS1, WS2, WS3] (parallel) - State & Click Handlers
   │
   └── Gate: npm run type-check
       │
       v
Phase 2: [WS4, WS5] (parallel) - Mutation Hooks
   │
   └── Gate: npm run type-check
       │
       v
Phase 3: [WS6] - Callback Wiring
   │
   └── Gate: npm run type-check
       │
       v
Phase 4: [WS7] - Testing
   │
   └── Gate: npm test hooks/rating-slip-modal/
```

---

## Validation Gates

| Phase | Gate | Command |
|-------|------|---------|
| 1 | type-check | `npm run type-check` |
| 2 | type-check | `npm run type-check` |
| 3 | type-check | `npm run type-check` |
| 4 | test-pass | `npm test hooks/rating-slip-modal/` |
| Final | build | `npm run build` |

---

## Dependencies

All dependencies are complete and available:

| Dependency | Status | Used By |
|------------|--------|---------|
| `useRatingSlipModalData` | COMPLETE | WS1, WS6 |
| `useMovePlayer` | COMPLETE | WS6 |
| `useCreateFinancialTransaction` | COMPLETE | WS4, WS5 |
| `updateAverageBet` HTTP | COMPLETE | WS4 |
| `closeRatingSlip` HTTP | COMPLETE | WS5 |
| `RatingSlipModal` component | COMPLETE | WS1, WS6 |
| `ActiveSlipsPanel` component | COMPLETE | WS2 |
| Dashboard query keys | COMPLETE | WS4, WS5 |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Auth context missing staff_id | Use fallback to current user ID or throw error |
| Ghost visit (no player_id) | Skip financial transactions for ghost visits |
| Race conditions | Idempotency keys on all mutations |
| Stale cache | Aggressive invalidation on all mutations |

---

## Definition of Done

- [ ] Clicking occupied seat opens modal (FR-1)
- [ ] Clicking slip card opens modal (FR-2)
- [ ] Save updates average_bet (FR-5, FR-6, FR-7, FR-8)
- [ ] Save records buy-in transaction if amount > 0 (FR-8a, FR-8b, FR-8c, FR-8d)
- [ ] Close records chips-taken transaction (FR-9)
- [ ] Close closes the slip and modal (FR-10, FR-11)
- [ ] Move player works with new slip (FR-13, FR-14, FR-15)
- [ ] Dashboard refreshes after all mutations (FR-8, FR-12, FR-16)
- [ ] Type check passes
- [ ] Tests pass
- [ ] Build succeeds

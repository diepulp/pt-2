---
id: PRD-008
title: Rating Slip Modal Dashboard Integration
owner: Lead Architect
status: Proposed
affects: [ARCH-SRM, PRD-002, PRD-004, PRD-006, PRD-009, ADR-015, ADR-019]
created: 2025-12-10
last_review: 2025-12-13
phase: Phase 2 (Session Management + UI)
pattern: A
http_boundary: true
---

# PRD-008 — Rating Slip Modal Dashboard Integration

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Proposed (v2.0 - Dashboard Integration Focus)
- **Summary:** Complete the integration of the rating slip modal into the pit dashboard by wiring existing BFF infrastructure to dashboard UI components. The BFF endpoint, DTOs, and modal component exist; this PRD focuses on connecting the modal to dashboard interactions (seat clicks, slip card clicks) and implementing mutation callbacks for save, close, and move player operations. This is the final blocker for GATE-2 completion.

---

## 2. Problem & Goals

### 2.1 Problem

The rating slip modal infrastructure is 85% complete:
- BFF endpoint (`/api/v1/rating-slips/[id]/modal-data`) aggregates 5 bounded contexts
- Move player endpoint (`/api/v1/rating-slips/[id]/move`) orchestrates close+start
- Modal component renders with service data via `useRatingSlipModalData`
- DTOs, schemas, and React Query hooks exist

However, the pit dashboard does not use this modal:
- `ActiveSlipsPanel` shows basic slip cards with pause/resume/close buttons but no detailed editing
- Clicking an occupied seat does nothing (should open modal)
- Save/Close mutations in the modal have no implementation
- Financial recording (buy-in, chips-taken) is not wired to PlayerFinancialService
- Cash-in form field shows total but doesn't track *new* buy-ins

**Impact:** Pit bosses cannot view detailed session information, update average bets, record mid-session buy-ins, record chips-taken, or move players through the dashboard UI.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Modal accessible from dashboard | Clicking occupied seat or slip card opens modal with correct data |
| **G2**: Save changes functional | Updating average_bet and recording buy-in persists via API |
| **G3**: Mid-session buy-in recording | Buy-in transactions recorded with direction='in' and linked to visit |
| **G4**: Close session with financial | Closing session records chips-taken transaction and closes slip |
| **G5**: Move player operational | Moving player closes current slip and opens new slip at destination |
| **G6**: GATE-2 unblocked | All GATE-2 DoD items pass after implementation |

### 2.3 Non-Goals

- **New BFF endpoints** — Modal data and move endpoints already exist
- **New service layer code** — All services (RatingSlip, Loyalty, PlayerFinancial) are complete
- **Schema changes** — No database migrations required
- **New modal UI components** — Modal and form sections already exist
- **Start-time modification** — Out of scope for v1; requires audit trail considerations

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor (via Pit Dashboard)

**Top Jobs:**

1. As a **Pit Boss**, I need to click an occupied seat to view the player's rating slip details so that I can review their session without navigating away from the table view.

2. As a **Pit Boss**, I need to update a player's average bet and save changes so that their rating accurately reflects their current play level.

3. As a **Floor Supervisor**, I need to close a player's session and record chips taken so that their final financial position is accurately tracked.

4. As a **Floor Supervisor**, I need to move a player to a different table/seat so that I can accommodate table changes while preserving session continuity.

5. As a **Pit Boss**, I need to see loyalty points and session reward estimates in the modal so that I can inform players of their status.

6. As a **Pit Boss**, I need to record a mid-session buy-in when a player adds more chips so that their total cash-in is accurately tracked for the session.

---

## 4. Scope & Feature List

### 4.1 In Scope (This PRD)

**Dashboard Integration:**
- Add `selectedSlipId` and `isModalOpen` state to `PitDashboardClient`
- Wire `RatingSlipModal` component into dashboard
- Implement seat click handler for occupied seats (opens modal)
- Add `onSlipClick` prop to `ActiveSlipsPanel` for slip card clicks

**Mutation Hooks:**
- Create `useUpdateRatingSlip` mutation hook (save average_bet)
- Create `useSaveWithBuyIn` mutation hook (save + record buy-in if new amount entered)
- Create `useCloseWithFinancial` mutation hook (close + record chips-taken)
- Wire existing `useMovePlayer` hook to modal callback

**Modal Callback Wiring:**
- Implement `onSave` callback in dashboard (calls `useSaveWithBuyIn` to save average_bet + record buy-in)
- Implement `onCloseSession` callback (calls `useCloseWithFinancial`)
- Implement `onMovePlayer` callback (calls `useMovePlayer`, switches to new slip)

**Cache Invalidation:**
- Invalidate dashboard queries after mutations
- Invalidate modal data after save/close/move

### 4.2 Out of Scope

- New BFF endpoints (already exist)
- Service layer changes (services complete)
- Modal component redesign (component exists)
- Start-time modification (requires audit trail)
- E2E test automation (separate QA task)

---

## 5. Requirements

### 5.1 Functional Requirements

**Modal Access:**
- FR-1: Clicking an occupied seat opens the rating slip modal with that slip's data
- FR-2: Clicking a slip card in ActiveSlipsPanel opens the modal
- FR-3: Modal displays player name, loyalty points, financial summary, and session details
- FR-4: Modal shows "Ghost Visit" label for slips without player_id

**Save Changes:**
- FR-5: Save button calls `PATCH /api/v1/rating-slips/[id]` with updated average_bet
- FR-6: Save button is disabled when no changes detected (isDirty = false)
- FR-7: Success shows brief toast/feedback, modal remains open
- FR-8: Dashboard stats refresh after successful save

**Mid-Session Buy-In:**
- FR-8a: Modal tracks "New Buy-In" amount separately from displayed total
- FR-8b: If newBuyIn > 0 on Save, record transaction with direction='in', source='pit'
- FR-8c: After buy-in recorded, financial summary in modal refreshes
- FR-8d: Buy-in transaction linked to visit_id and rating_slip_id

**Close Session:**
- FR-9: Close Session records chips-taken transaction if amount > 0
- FR-10: Close Session closes the rating slip via RatingSlipService
- FR-11: Modal closes after successful close operation
- FR-12: Dashboard tables/slips/stats refresh after close

**Move Player:**
- FR-13: Move Player validates destination seat is not occupied
- FR-14: Move Player closes current slip, starts new slip at destination
- FR-15: Modal switches to display the new slip after successful move
- FR-16: Dashboard refreshes to show updated table occupancy

### 5.2 Non-Functional Requirements

- NFR-1: Modal opens within 500ms of click (BFF p95 < 500ms)
- NFR-2: All mutations use idempotency keys
- NFR-3: Mutation errors display in modal error state
- NFR-4: Quick actions in ActiveSlipsPanel (pause/resume/close) remain functional

> Architecture details: See SRM v4.4.0, ADR-015 (RLS), ADR-019 (Loyalty)

---

## 6. UX / Flow Overview

**Flow 1: Open Modal from Seat**
1. User views selected table in pit dashboard
2. User clicks an occupied seat (green indicator)
3. System retrieves slip ID from `seatOccupants` map
4. Modal opens with loading skeleton
5. BFF fetches aggregated data from 5 services
6. Modal displays slip details, loyalty, financial summary

**Flow 2: Save Changes (Average Bet and/or Buy-In)**
1. User opens modal for a slip
2. User adjusts average bet using increment buttons
3. User enters additional buy-in amount (optional)
4. "Save Changes" button becomes enabled (isDirty = true)
5. User clicks "Save Changes"
6. If newBuyIn > 0: System records buy-in transaction (direction='in')
7. System updates average_bet via PATCH endpoint
8. Success: Modal shows saved state, financial summary refreshes
9. Error: Modal shows error message, user can retry

**Flow 3: Close Session with Chips-Taken**
1. User opens modal for an open slip
2. User enters chips-taken amount (optional)
3. User clicks "Close Session"
4. If chips-taken > 0: System records financial transaction
5. System closes the rating slip
6. Modal closes, dashboard refreshes
7. Closed slip no longer appears in ActiveSlipsPanel

**Flow 4: Move Player**
1. User opens modal for an open slip
2. User selects destination table from dropdown
3. User enters destination seat number
4. User clicks "Move Player"
5. System validates destination seat is available
6. System closes current slip, starts new slip at destination
7. Modal refreshes to show new slip (same visit_id)
8. Dashboard shows updated table occupancy

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| RatingSlipService (PRD-002) | COMPLETE | Slip lifecycle, average_bet update |
| LoyaltyService (PRD-004) | COMPLETE | Balance query, suggestion RPC |
| PlayerFinancialService (PRD-009) | COMPLETE | Transaction recording |
| BFF Endpoint | COMPLETE | `/api/v1/rating-slips/[id]/modal-data` |
| Move Endpoint | COMPLETE | `/api/v1/rating-slips/[id]/move` |
| Modal Component | COMPLETE | `components/modals/rating-slip/rating-slip-modal.tsx` |
| Dashboard Hooks | COMPLETE | `useDashboardTables`, `useActiveSlipsForDashboard` |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| **Mutation error handling** | Use TanStack Query error states; display in modal UI |
| **Race condition on move** | Idempotency keys prevent duplicate slips |
| **Stale dashboard data** | Aggressive cache invalidation on all mutations |
| **Modal/dashboard state sync** | Single source of truth: React Query cache |

**Open Questions:**
- Q1: Should quick actions (pause/resume) in ActiveSlipsPanel also open modal? **Decision: No, keep quick actions for speed**
- Q2: Toast notifications or inline feedback? **Decision: Inline feedback in modal**

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Clicking occupied seat opens modal with correct slip data
- [ ] Clicking slip card in ActiveSlipsPanel opens modal
- [ ] Save Changes updates average_bet via API
- [ ] Save Changes records buy-in transaction (if newBuyIn > 0)
- [ ] Close Session records chips-taken transaction (if > 0)
- [ ] Close Session closes slip and closes modal
- [ ] Move Player closes current slip and opens new slip at destination
- [ ] Modal switches to new slip after successful move

**Data & Integrity**
- [ ] Buy-in transaction linked to correct visit_id and rating_slip_id
- [ ] Chips-taken transaction linked to correct visit_id
- [ ] New slip after move has same visit_id as closed slip
- [ ] No orphaned slips after move operation

**Security & Access**
- [ ] All mutations respect RLS (casino scoping via ADR-015)
- [ ] Mutations require authenticated session
- [ ] Idempotency keys on all write operations

**Testing**
- [ ] Unit tests for new mutation hooks
- [ ] Integration test: Open modal from seat click
- [ ] Integration test: Save changes flow
- [ ] Integration test: Close with chips-taken flow
- [ ] Integration test: Move player flow

**Operational Readiness**
- [ ] Mutation errors logged with correlation ID
- [ ] Dashboard refresh works after all mutations

**Documentation**
- [ ] Hooks documented with JSDoc
- [ ] MVP-ROADMAP updated to mark PRD-008 complete

---

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.4.0)
- **Service Layer (SLAD):** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **RatingSlipService:** `docs/10-prd/PRD-002-rating-slip-service.md`
- **LoyaltyService:** `docs/10-prd/PRD-004-loyalty-service.md`
- **PlayerFinancialService:** `docs/10-prd/PRD-009-player-financial-service.md`
- **Pit Dashboard:** `docs/10-prd/PRD-006-pit-dashboard.md`
- **RLS Strategy:** `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- **Loyalty Policy:** `docs/80-adrs/ADR-019-loyalty-points-policy_v2.md`
- **Schema / Types:** `types/database.types.ts`
- **Modal Component:** `components/modals/rating-slip/rating-slip-modal.tsx`
- **BFF DTOs:** `services/rating-slip-modal/dtos.ts`

---

## Appendix A: Existing Infrastructure

### BFF Endpoint (Complete)

```
GET /api/v1/rating-slips/[id]/modal-data
```

Returns `RatingSlipModalDTO`:
- `slip`: SlipSectionDTO (id, visitId, tableId, averageBet, status, duration)
- `player`: PlayerSectionDTO | null (firstName, lastName, cardNumber)
- `loyalty`: LoyaltySectionDTO | null (currentBalance, tier, suggestion)
- `financial`: FinancialSectionDTO (totalCashIn, totalChipsOut, netPosition)
- `tables`: TableOptionDTO[] (for move player dropdown)

### Move Endpoint (Complete)

```
POST /api/v1/rating-slips/[id]/move
```

Request: `MovePlayerInput` (destinationTableId, destinationSeatNumber, averageBet)
Response: `MovePlayerResponse` (newSlipId, closedSlipId)

### Existing Hooks

| Hook | Location | Status |
|------|----------|--------|
| `useRatingSlipModalData` | `hooks/rating-slip-modal/` | COMPLETE |
| `useMovePlayer` | `hooks/rating-slip-modal/` | COMPLETE |
| `useActiveSlipsForDashboard` | `hooks/dashboard/` | COMPLETE |
| `useDashboardTables` | `hooks/dashboard/` | COMPLETE |
| `useCreateFinancialTransaction` | `hooks/player-financial/` | COMPLETE |

---

## Appendix B: Implementation Plan

### WS1: Dashboard Modal State (P0)

**File:** `components/dashboard/pit-dashboard-client.tsx`

- [ ] Add state: `selectedSlipId: string | null`
- [ ] Add state: `isModalOpen: boolean`
- [ ] Import `RatingSlipModal` component
- [ ] Render modal with props wired to state

```typescript
// State additions
const [selectedSlipId, setSelectedSlipId] = useState<string | null>(null);
const [isModalOpen, setIsModalOpen] = useState(false);
```

### WS2: Seat Click Handler (P0)

**File:** `components/dashboard/pit-dashboard-client.tsx`

- [ ] Update `handleSeatClick` for occupied seats
- [ ] Extract slip ID from `seatOccupants` map
- [ ] Set `selectedSlipId` and `isModalOpen`

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

### WS3: Active Slips Panel Click Handler (P0)

**File:** `components/dashboard/active-slips-panel.tsx`

- [ ] Add `onSlipClick: (slipId: string) => void` prop
- [ ] Make `SlipCard` clickable (cursor-pointer, onClick)
- [ ] Call `onSlipClick` with slip.id on card click

### WS4: Save with Buy-In Mutation (P0)

**File:** `hooks/rating-slip-modal/use-save-with-buyin.ts` (NEW)

- [ ] Create mutation hook for saving average_bet + recording buy-in
- [ ] Record buy-in transaction via `useCreateFinancialTransaction` if newBuyIn > 0
- [ ] Update average_bet via PATCH endpoint
- [ ] Invalidate modal, financial, and dashboard queries on success
- [ ] Export from `hooks/rating-slip-modal/index.ts`

```typescript
export function useSaveWithBuyIn() {
  const queryClient = useQueryClient();
  const createTxn = useCreateFinancialTransaction();

  return useMutation({
    mutationFn: async ({ slipId, visitId, playerId, casinoId, staffId, averageBet, newBuyIn }) => {
      // 1. Record buy-in transaction if new amount entered
      if (newBuyIn > 0) {
        await createTxn.mutateAsync({
          casino_id: casinoId,
          player_id: playerId,
          visit_id: visitId,
          rating_slip_id: slipId,
          amount: newBuyIn * 100, // Convert to cents
          direction: 'in',
          source: 'pit',
          tender_type: 'cash', // Default, could be configurable
          created_by_staff_id: staffId,
        });
      }

      // 2. Update average_bet
      return updateRatingSlip(slipId, { average_bet: averageBet });
    },
    onSuccess: (_, { slipId, visitId }) => {
      queryClient.invalidateQueries({ queryKey: ratingSlipModalKeys.data(slipId) });
      queryClient.invalidateQueries({ queryKey: playerFinancialKeys.visitSummary(visitId) });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });
    },
  });
}
```

### WS5: Close with Financial Mutation (P0)

**File:** `hooks/rating-slip-modal/use-close-with-financial.ts` (NEW)

- [ ] Create mutation hook for close + chips-taken recording
- [ ] Record transaction if chipsTaken > 0
- [ ] Close slip via RatingSlipService
- [ ] Invalidate all relevant queries

```typescript
export function useCloseWithFinancial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ slipId, visitId, chipsTaken }) => {
      if (chipsTaken > 0) {
        await recordTransaction({
          visit_id: visitId,
          amount_cents: chipsTaken * 100,
          direction: 'out',
          tender_type: 'chips',
          source: 'pit',
        });
      }
      return closeRatingSlip(slipId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ratingSlipModalKeys.scope });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });
    },
  });
}
```

### WS6: Wire Modal Callbacks (P0)

**File:** `components/dashboard/pit-dashboard-client.tsx`

- [ ] Implement `handleSave` using `useSaveWithBuyIn`
- [ ] Implement `handleCloseSession` using `useCloseWithFinancial`
- [ ] Implement `handleMovePlayer` using existing `useMovePlayer`
- [ ] Wire callbacks to `RatingSlipModal` props

### WS7: Form State Updates (P0)

**File:** `components/modals/rating-slip/use-modal-form-state.ts`

- [ ] Rename `cashIn` field to `newBuyIn` (tracks additional buy-in, not total)
- [ ] Initialize `newBuyIn` to "0" (not from totalCashIn)
- [ ] Display `totalCashIn` as read-only in modal (from financial.totalCashIn)
- [ ] Update dirty check to include `newBuyIn` changes

### WS8: Testing (P1)

- [ ] Unit test: `useSaveWithBuyIn` mutation (with and without buy-in)
- [ ] Unit test: `useCloseWithFinancial` mutation
- [ ] Integration test: Seat click opens modal
- [ ] Integration test: Save with buy-in flow
- [ ] Integration test: Close with chips-taken flow
- [ ] Integration test: Move player flow

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**RatingSlip Domain**
- `RATING_SLIP_NOT_FOUND` (404) - Slip does not exist
- `RATING_SLIP_ALREADY_CLOSED` (409) - Cannot modify closed slip
- `SEAT_ALREADY_OCCUPIED` (400) - Destination seat occupied

**PlayerFinancial Domain**
- `INVALID_TRANSACTION_DIRECTION` (400) - Invalid direction value
- `VISIT_NOT_FOUND` (404) - Associated visit not found

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-10 | Lead Architect | Initial draft - full PRD-008 scope |
| 1.1.0 | 2025-12-13 | Lead Architect | Updated for WS1/WS2 completion, ADR-015/019 alignment |
| 2.0.0 | 2025-12-13 | Lead Architect | Refocused on dashboard integration (BFF complete) |
| 2.1.0 | 2025-12-13 | Lead Architect | Added mid-session buy-in recording (FR-8a-d, WS4, WS7); players can buy-in during session |

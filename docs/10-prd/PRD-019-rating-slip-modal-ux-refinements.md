---
id: PRD-019
title: Rating Slip Modal UX Refinements
owner: Engineering
status: Draft
affects: [PRD-008, PRD-004, PRD-009, ADR-019]
created: 2025-12-26
last_review: 2025-12-26
phase: Phase 3 (UX Polish)
pattern: A
http_boundary: true
---

# PRD-019 — Rating Slip Modal UX Refinements

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Address five UX and functional defects in the rating slip modal discovered during integration testing. Issues include: move player auto-opening new slips, modal not closing on save, static loyalty points, broken chips-taken reactivity, and faulty start time controls. This PRD delivers optimistic seat updates, reactive financial summary, real-time points display, and improved time adjustment UX.

---

## 2. Problem & Goals

### 2.1 Problem

Following the PRD-008 integration, several UX and data-binding issues emerged that degrade the pit boss workflow:

1. **Move Player disrupts workflow**: On move, a new slip auto-opens and renders immediately. Players move tables frequently; supervisors need instant visual feedback on seat changes without modal interruption.

2. **Modal persistence after save**: The modal remains open after "Save Changes", requiring manual close.

3. **Static loyalty points**: Points balance appears hardcoded in seed data. Session reward estimate shows `+0 points`. No mechanism to refresh current balance.

4. **Broken financial reactivity**: Updating "Chips Taken" field does not update "Chips Out" in the Financial Summary card.

5. **Faulty time controls**: The `+15m` increment button adds 1455 minutes instead of 15 minutes. Time adjustment UX needs redesign for ad-hoc editing.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Instant seat feedback on move | Seat changes visible within 100ms using `useOptimistic` |
| **G2**: Non-disruptive move workflow | New slip does NOT auto-open; user opens manually if needed |
| **G3**: Modal closes on save | Modal unmounts after successful "Save Changes" mutation |
| **G4**: Real-time points display | Balance refreshes via button; session estimate reflects accrual logic |
| **G5**: Reactive financial summary | Chips Taken changes immediately reflect in Financial Summary card |
| **G6**: Correct time adjustment | Ad-hoc start time editing replaces broken increment buttons |

### 2.3 Non-Goals

- Modifying loyalty accrual calculation logic (owned by LoyaltyService/PRD-004)
- Schema changes to financial tables (owned by PRD-009)
- Full redesign of modal layout (scope limited to fixing identified defects)
- Performance optimization beyond optimistic seat updates

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor

**Top Jobs:**

- As a **Pit Boss**, I need to move a player between tables and see the seat update instantly so that I can continue monitoring other players without waiting for a refresh.
- As a **Floor Supervisor**, I need the modal to close after saving so that I can quickly return to the floor view.
- As a **Pit Boss**, I need to see the player's current points balance with a refresh option so that I can inform them of accurate rewards status.
- As a **Pit Boss**, I need chips taken to immediately update the financial summary so that I can verify session totals before closing.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Move Player Workflow:**
- Refactor `useMovePlayer` hook to NOT auto-open new slip modal
- Implement `useOptimistic` for immediate seat position rendering
- Invalidate seat cache without full layout refresh

**Modal Behavior:**
- Close modal on successful "Save Changes" mutation
- Maintain modal open on mutation error (display error state)

**Loyalty Points Integration:**
- Add "Refresh Points" button to fetch current `player_loyalty.current_balance`
- Wire session reward estimate to `evaluate_session_reward_suggestion` RPC
- Remove hardcoded seed values; display `--` when no balance exists

**Financial Summary Reactivity:**
- Bind "Chips Taken" input to Financial Summary card state
- Use derived state or Zustand subscription for reactive updates

**Start Time Controls:**
- Replace broken `+15m/-15m` increment buttons with ad-hoc time picker
- Allow direct time entry or selection from time picker component

### 4.2 Out of Scope

- Multi-slip batch operations
- Points calculation logic changes
- New financial transaction types
- Modal layout redesign beyond time controls

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1: Optimistic Seat Updates**
- On move player mutation, immediately update seat display using React 19 `useOptimistic`
- If mutation fails, revert to previous seat position
- Seat cache invalidation happens in background

**FR-2: Move Player - No Auto-Open**
- `useMovePlayer.mutate()` success callback must NOT call `openSlipModal(newSlipId)`
- Dashboard table grid receives seat update via optimistic state
- User manually clicks new seat to open slip if needed

**FR-3: Modal Close on Save**
- `useSaveWithBuyin.mutate()` success callback calls `closeModal()`
- Error states keep modal open with error banner displayed

**FR-4: Points Balance Refresh**
- Add "Refresh" icon button next to points display
- On click, call `LoyaltyService.getPlayerBalance()` and update display
- Show loading spinner during fetch

**FR-5: Session Reward Estimate**
- Call `evaluate_session_reward_suggestion(rating_slip_id)` on modal open
- Display returned value in "Session Reward Estimate" field
- Handle null response (display `+0` or `--`)

**FR-6: Chips Taken Reactivity**
- Chips Taken input value bound to modal state
- Financial Summary "Chips Out" derived from same state source
- No save required for display sync (reactive binding)

**FR-7: Ad-hoc Start Time Adjustment**
- Replace increment buttons with time picker component
- Allow direct ISO datetime entry
- Validate time is not in future, not before gaming day start

### 5.2 Non-Functional Requirements

- Optimistic updates visible within 100ms of user action
- Points refresh completes within 500ms p95
- No console errors or React warnings from state management changes

> Architecture details: See PRD-008 for BFF aggregation, ADR-019 for loyalty model

---

## 6. UX / Flow Overview

**Flow 1: Move Player (Optimistic)**
1. Supervisor selects destination table/seat in move form
2. Supervisor clicks "Move Player"
3. Seat on origin table immediately shows vacant (optimistic)
4. Seat on destination table immediately shows occupied (optimistic)
5. Modal closes (or stays on current slip context)
6. Background mutation completes; cache invalidated
7. Supervisor opens new slip manually if needed

**Flow 2: Save Changes**
1. Supervisor modifies average bet
2. Supervisor clicks "Save Changes"
3. Mutation fires
4. On success: Modal closes, toast shows "Changes saved"
5. On error: Modal stays open, error banner displays

**Flow 3: Refresh Points**
1. Supervisor clicks refresh icon next to points display
2. Spinner shows during fetch
3. New balance displays on success
4. Error toast on failure (modal stays functional)

**Flow 4: Adjust Start Time**
1. Supervisor clicks start time field
2. Time picker opens (or inline edit activates)
3. Supervisor selects/enters new time
4. Field updates; change tracked for save

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| PRD-008 Modal Integration | COMPLETE | Base modal implementation |
| LoyaltyService (PRD-004) | COMPLETE | `usePlayerLoyalty`, `useLoyaltySuggestion` hooks |
| PlayerFinancialService (PRD-009) | COMPLETE | Transaction recording |
| React 19 `useOptimistic` | AVAILABLE | Built into React 19 |
| Zustand Store (PRD-013) | COMPLETE | Modal state management |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| `useOptimistic` rollback complexity | Implement simple revert-on-error pattern |
| Time picker component selection | Use existing shadcn/ui date-time components |
| Session reward RPC may return null | Handle gracefully with `--` display |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Move player updates seats immediately via `useOptimistic`
- [ ] New slip does NOT auto-open on move
- [ ] Modal closes on successful "Save Changes"
- [ ] Points balance displays with working refresh button
- [ ] Session reward estimate displays from RPC (or `--` if null)
- [ ] Chips Taken input reactively updates Financial Summary
- [ ] Start time uses ad-hoc time picker (not broken increment buttons)

**Data & Integrity**
- [ ] Optimistic updates revert correctly on mutation failure
- [ ] Points balance shows actual `player_loyalty.current_balance`
- [ ] Financial summary matches transaction state

**Security & Access**
- [ ] No changes to RLS policies required
- [ ] Points refresh respects casino scope

**Testing**
- [ ] E2E test: Move player shows seat update without modal auto-open
- [ ] E2E test: Save changes closes modal
- [ ] E2E test: Points refresh fetches current balance
- [ ] E2E test: Chips taken updates financial summary reactively
- [ ] E2E test: Start time picker allows ad-hoc adjustment
- [ ] Unit tests for optimistic state management

**Operational Readiness**
- [ ] No new console errors introduced
- [ ] Error states display meaningful messages

**Documentation**
- [ ] Updated modal component documentation if needed

---

## 9. Related Documents

- **Source Issue:** `docs/issues/ISSUE-RATING-SLIP-MODAL-UX-DEFECTS.md`
- **Modal Integration PRD:** `docs/10-prd/PRD-008-rating-slip-modal-integration.md`
- **Loyalty Service PRD:** `docs/10-prd/PRD-004-loyalty-service.md`
- **Financial Service PRD:** `docs/10-prd/PRD-009-player-financial-service.md`
- **Loyalty Policy ADR:** `docs/80-adrs/ADR-019-loyalty-points-policy_v2.md`
- **Zustand State PRD:** `docs/10-prd/PRD-013-zustand-state-management.md`
- **Schema / Types:** `types/database.types.ts`
- **Modal Component:** `components/modals/rating-slip/`
- **Modal Hooks:** `hooks/rating-slip-modal/`

---

## Appendix A: Component References

**Files to Modify:**

| File | Changes |
|------|---------|
| `hooks/rating-slip-modal/use-move-player.ts` | Remove auto-open, add optimistic update |
| `hooks/rating-slip-modal/use-save-with-buyin.ts` | Add modal close on success |
| `hooks/rating-slip-modal/use-rating-slip-modal.ts` | Wire points refresh |
| `components/dashboard/table-grid.tsx` | Consume optimistic seat state |
| `store/pit-dashboard-store.ts` | Add optimistic seat actions |

**E2E Tests to Add/Update:**

| Test File | Scenarios |
|-----------|-----------|
| `e2e/workflows/rating-slip-modal.spec.ts` | Move player seat update, save closes modal, points refresh, time picker |

---

## Appendix B: Implementation Workstreams

### WS1: Optimistic Seat Updates (P0)
**Agent:** frontend-design-pt-2
- Implement `useOptimistic` for seat positions in `table-grid.tsx`
- Add optimistic actions to `pit-dashboard-store.ts`
- Wire `useMovePlayer` success to NOT open new modal

### WS2: Modal Close on Save (P0)
**Agent:** frontend-design-pt-2
- Update `use-save-with-buyin.ts` success callback
- Verify error handling keeps modal open

### WS3: Points Balance Integration (P0)
**Agent:** frontend-design-pt-2
- Add refresh button UI component
- Wire to `usePlayerLoyalty` refetch
- Wire session estimate to `useLoyaltySuggestion`

### WS4: Financial Summary Reactivity (P0)
**Agent:** frontend-design-pt-2
- Bind Chips Taken to shared state
- Derive Financial Summary values from same source

### WS5: Start Time Controls (P1)
**Agent:** frontend-design-pt-2
- Remove broken increment buttons
- Implement time picker component
- Add validation for gaming day bounds

### WS6: E2E Test Coverage (P0)
**Agent:** e2e-testing
- Add/update tests per DoD requirements
- Cover all five defects

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-26 | Engineering | Initial draft from ISSUE-RATING-SLIP-MODAL-UX-DEFECTS.md |

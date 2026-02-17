# ISSUE: Rating Slip Modal UX Defects

**Issue ID**: RATING-SLIP-MODAL-UX
**Created**: 2025-12-26
**Status**: Open
**Priority**: High
**Affected Components**: Rating Slip Modal, Pit Dashboard, Loyalty Service

---

## Summary

Multiple UX and functional defects identified in the rating slip modal workflows following recent updates. Issues span move player functionality, loyalty points display, financial summary updates, and time controls.

---

## Defects

### 1. Move Player - Incorrect Modal Behavior

**Current Behavior**: On move player action, a new slip opens and displays immediately to the user.

**Expected Behavior**:
- Only update the table seats to reflect the move
- Do NOT render the new slip immediately
- Let the user open the new slip manually if needed
- Seat changes should render smoothly and quickly

**Technical Consideration**: Implement `useOptimistic` for immediate seat position updates without waiting for server response.

**Current Workaround Required**: Full layout refresh required to see seat changes.

---

### 2. Modal Close on Save Changes

**Current Behavior**: Modal remains open after "Save Changes" action.

**Expected Behavior**: Modal should close automatically on successful save.

---

### 3. Points Balance - Static/Hardcoded Values

**Current Behavior**:
- Points balances appear hardcoded in `seed.sql`
- Values do not update as player remains open on table
- Session reward estimate field shows `+0 points`

**Expected Behavior**:
- Points should accrue based on actual play time and betting activity
- Session reward estimate should reflect real-time calculation
- Point balance should update on each slip refresh

**Required Investigation**:
- Review loyalty points accrual logic implementation
- Verify rating slip modal is correctly provisioned with current loyalty service

**Feature Request**: Add a refresh button to fetch and display current point balance.

---

### 4. Chips Taken - Financial Summary Disconnect

**Current Behavior**: Updating "Chips Taken" field does not update "Chips Out" in the Financial Summary card.

**Expected Behavior**: Financial Summary should reactively update when Chips Taken value changes.

---

### 5. Start Time Increment - Calculation Error

**Current Behavior**: Clicking the `+15m` increment button adds incorrect value: `Total Change: +1455 minutes`

**Expected Behavior**: The increment start time by 15 minutes is redundant, new start time functionality should be introduced, to allow the user to adjust the start time ad-hoc.

---

## Required Actions

### Frontend (`frontend-design-pt-2` skill)

1. Refactor move player handler to update seats only (no auto-open new slip)
2. Implement `useOptimistic` for immediate seat rendering
3. Add modal close on "Save Changes" success
4. Fix start time increment logic
5. Wire Chips Taken to Financial Summary reactively
6. Add point balance refresh button

### Loyalty Service Investigation

1. Review `services/loyalty/` accrual logic
2. Verify session reward calculation
3. Check seed.sql for hardcoded values that should be dynamic

### E2E Testing (`e2e-testing` skill)

Re-visit rating slip modal integration tests to cover:
- [ ] Move player updates seats without opening new slip
- [ ] Modal closes on save changes
- [ ] Points balance updates correctly
- [ ] Chips taken updates financial summary
- [ ] Start time increment adds correct 15-minute value
- [ ] Point balance refresh button works

---

## Related Files

- `components/modals/rating-slip/`
- `hooks/rating-slip-modal/use-move-player.ts`
- `hooks/rating-slip-modal/use-rating-slip-modal.ts`
- `services/loyalty/`
- `e2e/workflows/rating-slip-modal.spec.ts`

---

## Acceptance Criteria

- [ ] Player move updates table seats immediately (optimistic)
- [ ] New slip does NOT auto-open on move
- [ ] Modal closes on successful save
- [ ] Points balance reflects real-time accrual
- [ ] Session reward estimate shows correct calculation
- [ ] Refresh button fetches current point balance
- [ ] Chips Taken updates Financial Summary reactively
- [ ] Start time +15m adds exactly 15 minutes
- [ ] All behaviors covered by E2E tests

# Rating Slip Modal E2E Tests

## Overview

E2E tests for PRD-008 Rating Slip Modal Integration workflows.

## Test File

- `rating-slip-modal.spec.ts` - 4 critical workflow tests + API tests

## Running Tests

```bash
# Run all rating slip modal tests
npx playwright test e2e/workflows/rating-slip-modal.spec.ts

# Run with UI mode for debugging
npx playwright test e2e/workflows/rating-slip-modal.spec.ts --ui

# Run specific test
npx playwright test -g "clicking occupied seat"
```

## Required Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

## Required Test IDs

The following `data-testid` attributes must be added to components for tests to work:

### Pit Dashboard (`components/dashboard/`)

| Component | Test ID | Element |
|-----------|---------|---------|
| `table-grid.tsx` | `data-testid="table-grid"` | Main grid container |
| `table-grid.tsx` | `data-table-id="{tableId}"` | Each table card |
| `pit-dashboard-client.tsx` | `data-seat-number="{num}"` | Each seat element |
| `active-slips-panel.tsx` | `data-testid="active-slips-panel"` | Panel container |
| `active-slips-panel.tsx` | `data-slip-id="{slipId}"` | Each slip card |

### Rating Slip Modal (`components/modals/rating-slip/`)

| Component | Test ID | Element |
|-----------|---------|---------|
| `rating-slip-modal.tsx` | `data-testid="modal-title"` | Dialog title |
| `rating-slip-modal.tsx` | `data-testid="financial-summary"` | Financial section |
| `rating-slip-modal.tsx` | `data-testid="loyalty-points"` | Loyalty display |
| `form-section-average-bet.tsx` | `data-testid="average-bet-input"` | Input field |
| `form-section-average-bet.tsx` | `data-testid="average-bet-increment-{amount}"` | Increment buttons |
| `form-section-cash-in.tsx` | `data-testid="new-buyin-input"` | Buy-in input |
| `form-section-chips-taken.tsx` | `data-testid="chips-taken-input"` | Chips taken input |
| `form-section-move-player.tsx` | `data-testid="move-table-select"` | Table dropdown |
| `form-section-move-player.tsx` | `data-table-option="{tableId}"` | Table options |
| `form-section-move-player.tsx` | `data-testid="move-seat-input"` | Seat input |

## Test Scenarios

### 1. Open Modal from Seat Click
- Navigate to `/pit`
- Click occupied seat
- Verify modal opens with correct data

### 2. Save Changes (Average Bet + Buy-In)
- Open modal
- Increment average bet
- Enter new buy-in
- Save and verify transaction recorded

### 3. Close Session with Chips-Taken
- Open modal
- Enter chips-taken amount
- Close session
- Verify transaction and slip status

### 4. Move Player
- Open modal
- Select destination table/seat
- Move player
- Verify new slip at destination with same visit_id

## Fixtures

Test fixtures are in `e2e/fixtures/rating-slip-fixtures.ts`:

- `createRatingSlipTestScenario()` - Full scenario with casino, player, table, visit, slip
- `createTestTransaction()` - Helper to create financial transactions
- `getRatingSlipStatus()` - Query slip status
- `getRatingSlipsForVisit()` - Get all slips for a visit
- `getTransactionsForVisit()` - Get transactions for verification

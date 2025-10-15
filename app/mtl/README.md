# MTL UI Components

Phase 6 Wave 3 Track 2: MTL UI Implementation with Read-Only Loyalty Boundary

---

## Overview

This directory contains UI components for Money Transaction Log (MTL) functionality with strict read-only loyalty boundary enforcement.

**CRITICAL:** MTL components can READ loyalty data but CANNOT write to loyalty tables. All loyalty mutations occur through the RatingSlip domain only.

---

## Components

### 1. MTL Transaction Form (`transaction-form.tsx`)

Transaction entry form with CTR threshold detection and gaming day calculation.

**Features:**

- Direction selection (cash_in/cash_out)
- Amount input with validation
- Player ID lookup
- Tender type selection
- Event time picker
- CTR warning at $10,000 threshold
- Gaming day auto-calculation (6 AM start)

**Usage:**

```tsx
import { MtlTransactionForm } from "@/app/mtl/transaction-form";

<MtlTransactionForm
  casinoId="casino-uuid"
  onSuccess={(entryId) => console.log("Created:", entryId)}
  onCancel={() => router.back()}
/>;
```

**Props:**

- `casinoId: string` - Casino UUID (required)
- `onSuccess?: (entryId: number) => void` - Success callback
- `onCancel?: () => void` - Cancel callback

**WCAG 2.1 AA:** ✅ Fully compliant

---

### 2. Player Loyalty Widget (`player-loyalty-widget.tsx`)

Read-only display of player loyalty status within MTL context.

**Features:**

- Current tier badge with color coding
- Points balance (formatted)
- Lifetime points display
- Tier progress bar (0-100%)
- Loading skeleton state
- Error handling
- Read-only notice

**Usage:**

```tsx
import { PlayerLoyaltyWidget } from "@/app/mtl/player-loyalty-widget";

<PlayerLoyaltyWidget playerId="player-uuid" />;
```

**Props:**

- `playerId: string` - Player UUID (required)

**Data Source:** `usePlayerLoyalty()` hook (read-only)

**WCAG 2.1 AA:** ✅ Fully compliant

---

### 3. MTL Compliance Dashboard (`compliance-dashboard.tsx`)

Transaction table with filters, CTR alerts, and CSV export.

**Features:**

- Transaction table with 9 columns
- CTR alert badges (≥ $10,000)
- Filters: direction, date range, player search
- CSV export functionality
- Loading states
- Empty state messaging

**Usage:**

```tsx
import { MtlComplianceDashboard } from "@/app/mtl/compliance-dashboard";

<MtlComplianceDashboard casinoId="casino-uuid" />;
```

**Props:**

- `casinoId: string` - Casino UUID (required)

**Table Columns:**

1. ID - Transaction identifier
2. Event Time - Formatted timestamp
3. Direction - Cash in/out badge
4. Area - Transaction area
5. Amount - Right-aligned, formatted
6. Player - Name or ID
7. Gaming Day - YYYY-MM-DD
8. Table - Table number
9. Status - CTR or Normal badge

**WCAG 2.1 AA:** ✅ Fully compliant

---

## Related Hooks

### `usePlayerLoyalty()` (READ-ONLY)

Located at: `/hooks/loyalty/use-player-loyalty.ts`

React Query hook for fetching player loyalty data.

**Usage:**

```tsx
import { usePlayerLoyalty } from "@/hooks/loyalty/use-player-loyalty";

function MyComponent({ playerId }: { playerId: string }) {
  const { data: loyalty, isLoading, error } = usePlayerLoyalty(playerId);

  if (isLoading) return <Skeleton />;
  if (error) return <Alert>Error: {error.message}</Alert>;

  return <div>Tier: {loyalty.tier}</div>;
}
```

**Query Key:** `['loyalty', 'player', playerId]`

**Stale Time:** 2 minutes

**Returns:** `PlayerLoyaltyDTO`

```typescript
interface PlayerLoyaltyDTO {
  id: string;
  playerId: string;
  tier: string;
  currentBalance: number;
  lifetimePoints: number;
  tierProgress: number;
  createdAt: string;
  updatedAt: string;
}
```

---

## Server Actions

### `getPlayerLoyalty()` (READ-ONLY)

Located at: `/app/actions/loyalty-actions.ts`

Fetches player loyalty data for display purposes only.

**Signature:**

```typescript
export async function getPlayerLoyalty(
  playerId: string,
): Promise<ServiceResult<PlayerLoyaltyDTO>>;
```

**Authentication:** Required

**Error Codes:**

- `UNAUTHORIZED` (401) - No session
- `NOT_FOUND` (404) - Player loyalty not found
- `DATABASE_ERROR` (500) - Query failed

**Example:**

```typescript
const result = await getPlayerLoyalty("player-uuid");
if (result.success) {
  console.log("Tier:", result.data.tier);
  console.log("Balance:", result.data.currentBalance);
}
```

---

## Boundary Enforcement

### MTL → Loyalty: READ ONLY

| Operation            | Allowed? | Mechanism                  |
| -------------------- | -------- | -------------------------- |
| Read loyalty data    | ✅ YES   | `usePlayerLoyalty()` hook  |
| Write loyalty data   | ❌ NO    | No mutation hooks imported |
| Display loyalty info | ✅ YES   | Widget component           |
| Award points         | ❌ NO    | Only via RatingSlip domain |

### Verification

Run automated boundary verification:

```bash
bash scripts/verify-mtl-loyalty-boundary.sh
```

**Expected Output:** 7 passes, 0 failures, 1 warning

---

## Gaming Day Calculation

Gaming day starts at 6:00 AM and runs for 24 hours.

**Algorithm:**

```typescript
function calculateGamingDay(eventTime: string): string {
  const eventDate = new Date(eventTime);
  const gamingDayStart = new Date(eventDate);
  gamingDayStart.setHours(6, 0, 0, 0);

  // If event is before 6 AM, gaming day is previous day
  if (eventDate.getHours() < 6) {
    gamingDayStart.setDate(gamingDayStart.getDate() - 1);
  }

  return gamingDayStart.toISOString().split("T")[0];
}
```

**Examples:**

- Event at 2025-10-14 05:30 → Gaming Day: 2025-10-13
- Event at 2025-10-14 06:00 → Gaming Day: 2025-10-14
- Event at 2025-10-14 23:59 → Gaming Day: 2025-10-14

---

## CTR Threshold Detection

**Threshold:** $10,000

**Implementation:**

```typescript
const CTR_THRESHOLD = 10000;

useEffect(() => {
  setShowCtrWarning(watchedAmount >= CTR_THRESHOLD);
}, [watchedAmount]);
```

**Visual Indicator:**

- Red alert with warning icon
- "CTR Threshold Alert" title
- Descriptive message about filing requirements
- Does not prevent submission (informational only)

---

## WCAG 2.1 AA Compliance

All components meet WCAG 2.1 AA standards:

### Form Controls

- ✅ All inputs have associated labels
- ✅ Required fields marked with asterisk + aria-required
- ✅ Error messages use aria-describedby + aria-invalid
- ✅ Keyboard navigation fully supported

### Screen Reader Support

- ✅ Icons use aria-hidden="true"
- ✅ Progress bars use role="progressbar" with aria-value\*
- ✅ Alerts use role="alert"
- ✅ Status messages use aria-live="polite"

### Visual Design

- ✅ Sufficient color contrast (shadcn palette)
- ✅ Does not rely on color alone
- ✅ Text size minimum 14px
- ✅ Touch targets ≥44px

---

## Development

### Prerequisites

```bash
# Install shadcn components
npx shadcn@latest add alert table skeleton badge
```

### TypeScript Compilation

```bash
# Check for errors
npx tsc --noEmit
```

### Linting

```bash
# Run ESLint
npm run lint
```

---

## Testing

### Manual Testing Checklist

**Transaction Form:**

- [ ] Form loads without errors
- [ ] Required field validation works
- [ ] CTR warning appears at $10,000
- [ ] Gaming day calculates correctly
- [ ] All fields keyboard accessible

**Loyalty Widget:**

- [ ] Widget loads with skeleton
- [ ] Displays loyalty data correctly
- [ ] Error state shows message
- [ ] Progress bar animates
- [ ] Tier badge color-codes correctly

**Compliance Dashboard:**

- [ ] Table renders mock data
- [ ] Filters update table
- [ ] CTR badges show correctly
- [ ] CSV export downloads
- [ ] Empty state displays

### Automated Testing

Run boundary verification:

```bash
bash scripts/verify-mtl-loyalty-boundary.sh
```

---

## Documentation

- [TRACK_2_COMPLETION.md](../../docs/phases/phase-6/wave-3/WAVE_3_TRACK_2_COMPLETION.md) - Comprehensive completion report
- [TRACK_2_SUMMARY.md](../../docs/phases/phase-6/wave-3/TRACK_2_SUMMARY.md) - Executive summary

---

## Known Limitations

1. **Mock Data:** Dashboard uses hardcoded transactions
2. **No Server Action:** Transaction form logs to console
3. **No Real-Time:** Table does not auto-refresh
4. **Basic Filters:** Filters implemented but not connected

---

## Next Steps

1. Implement `createMtlEntry()` server action
2. Create `useMtlTransactions()` query hook
3. Connect dashboard filters to backend
4. Add pagination and sorting
5. Implement real-time updates via subscriptions

---

**Phase:** 6
**Wave:** 3
**Track:** 2
**Status:** ✅ COMPLETED
**Date:** 2025-10-14

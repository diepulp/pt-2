---
title: Player Loyalty Dashboard UI Specification
description: Player-facing loyalty points, tier status, and transaction history display
type: ui
status: approved
version: 1.0.0
created: 2025-10-17
created_by: ui-engineer
approved_by: architect.chatmode
implements: UI Layer (Phase 3)
depends_on:
  - service: LoyaltyService
  - spec: loyalty-service.spec.md
---

# Player Loyalty Dashboard UI Specification

## Feature Overview

**Purpose**: Provide players with a comprehensive view of their loyalty status, including current points, tier progress, benefits, and transaction history.

**User Story**: As a player, I want to see my loyalty points balance, current tier, progress to the next tier, and transaction history so that I understand my rewards status and feel motivated to engage more.

## Requirements

### Functional Requirements

- [ ] Display current loyalty points balance prominently
- [ ] Show current tier with visual badge/indicator
- [ ] Display progress bar to next tier with points remaining
- [ ] List tier benefits (current and next tier)
- [ ] Show transaction history (earned/redeemed) with pagination
- [ ] Filter transactions by type (earned/redeemed/all)
- [ ] Display tier progression timeline (visual journey)
- [ ] Show lifetime points achievement

### Non-Functional Requirements

- **Performance**:
  - Initial page load: <2s
  - Balance update after action: <500ms (optimistic update)
  - Transaction history load: <1s
  - Smooth animations: 60fps
- **Accessibility**:
  - WCAG 2.1 AA compliance
  - Keyboard navigation support
  - Screen reader friendly with ARIA labels
  - Color contrast ratio ≥4.5:1 for text
- **Responsive**:
  - Mobile-first design
  - Breakpoints: mobile (<640px), tablet (640-1024px), desktop (≥1024px)
  - Touch-friendly targets (≥44x44px)
- **Browser Support**: Chrome, Firefox, Safari, Edge (latest 2 versions)

## User Flows

### Primary Flow: View Loyalty Status

1. User navigates to `/player/loyalty` page
2. System fetches current balance, tier, and recent transactions
3. Page displays:
   - Points balance card (prominent)
   - Tier status card (with badge)
   - Progress bar to next tier
   - Tier benefits comparison table
   - Transaction history list
4. User scrolls to view transaction history
5. User clicks "Load More" to see older transactions
6. System fetches next page of transactions
7. Outcome: Player understands full loyalty status

### Alternative Flows

**Error Case: Failed to Load Balance**

1. API request fails
2. Display error toast: "Unable to load loyalty status. Please try again."
3. Show retry button
4. User clicks retry → refetch data

**Empty State: No Transactions**

1. Player has zero transactions
2. Display empty state illustration
3. Message: "No transactions yet. Start earning points by booking sessions!"
4. CTA button: "Book a Session"

**Loading State**

1. Initial page load shows skeleton loaders for:
   - Balance card
   - Tier card
   - Transaction list
2. Data loads incrementally (balance first, then history)

## Component Breakdown

### Component Hierarchy

```
LoyaltyDashboardPage
├── LoyaltyBalanceCard
│   ├── PointsDisplay (large number)
│   ├── LifetimePointsBadge
│   └── TierBadge
├── TierProgressCard
│   ├── ProgressBar
│   ├── PointsToNextTier
│   └── NextTierPreview
├── TierBenefitsTable
│   ├── TierColumn (Current)
│   ├── TierColumn (Next)
│   └── BenefitRows
└── TransactionHistorySection
    ├── TransactionFilters
    ├── TransactionList
    │   └── TransactionItem (repeats)
    └── LoadMoreButton
```

### Component Specifications

#### Component: LoyaltyBalanceCard

**Purpose**: Display current points balance prominently with tier badge

**Props**:

```typescript
interface LoyaltyBalanceCardProps {
  balance: PlayerLoyaltyBalance;
  isLoading?: boolean;
}
```

**Layout**:

```
┌─────────────────────────────────────┐
│  🏆 Your Loyalty Points             │
│                                     │
│         1,234 points                │ ← Large, bold
│         Lifetime: 2,500             │ ← Smaller, muted
│                                     │
│  [Gold Tier Badge]                  │
│  Member since: Jan 2025             │
└─────────────────────────────────────┘
```

**Behavior**:

- Points animate on update (count-up animation)
- Tier badge shows tier color (Bronze: #CD7F32, Silver: #C0C0C0, Gold: #FFD700, Platinum: #E5E4E2)
- Skeleton loader while `isLoading`

**Styling**:

- Uses shadcn/ui: `Card`, `CardHeader`, `CardContent`
- Custom gradient background based on tier
- Large font size for points: `text-4xl font-bold`

#### Component: TierProgressCard

**Purpose**: Show visual progress to next tier with motivational messaging

**Props**:

```typescript
interface TierProgressCardProps {
  currentPoints: number;
  currentTier: string;
  nextTier: string | null;
  pointsToNextTier: number;
  progressPercentage: number;
}
```

**Layout**:

```
┌─────────────────────────────────────┐
│  Progress to Platinum               │
│                                     │
│  [████████░░░░░░░░░░░░░░░] 75%     │
│                                     │
│  766 points to go                   │
│  You're almost there! 🎉            │
└─────────────────────────────────────┘
```

**Behavior**:

- Progress bar animates on mount (0% → actual percentage)
- If already at highest tier, show "Max Tier Achieved!" message
- Confetti animation when tier promotion detected (compare previous tier in cache)

**Styling**:

- Uses shadcn/ui: `Card`, `Progress`
- Gradient progress bar matching next tier color
- Smooth animation: `transition-all duration-500`

#### Component: TierBenefitsTable

**Purpose**: Compare current tier benefits vs next tier benefits

**Props**:

```typescript
interface TierBenefitsTableProps {
  currentTier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
}
```

**Layout**:

```
┌──────────────────────────────────────────────┐
│  Benefit               Gold      Platinum    │
├──────────────────────────────────────────────┤
│  Discount              10%       15%         │
│  Priority Booking      ✓         ✓           │
│  Free Sessions/Month   2         4           │
│  Exclusive Events      ✓         ✓           │
│  VIP Support           ✗         ✓           │
└──────────────────────────────────────────────┘
```

**Behavior**:

- Highlight differences between tiers (bold next tier improvements)
- Checkmark (✓) for yes, X mark (✗) for no
- Tooltip on hover for benefit descriptions

**Styling**:

- Uses shadcn/ui: `Table`, `TableHeader`, `TableBody`, `TableRow`
- Highlight column for next tier: `bg-primary/10`

#### Component: TransactionHistorySection

**Purpose**: Display paginated transaction history with filtering

**Props**:

```typescript
interface TransactionHistorySectionProps {
  playerId: string;
}
```

**State**:

- `filter`: 'all' | 'earned' | 'redeemed'
- `page`: number
- `transactions`: LoyaltyTransaction[]
- `hasMore`: boolean

**Layout**:

```
┌─────────────────────────────────────┐
│  Transaction History                │
│  [All ▼] [Earned] [Redeemed]        │ ← Filters
├─────────────────────────────────────┤
│  ↑ +10 points                       │
│  Visit completed                    │
│  2 days ago                         │
├─────────────────────────────────────┤
│  ↓ -50 points                       │
│  Redeemed reward                    │
│  5 days ago                         │
├─────────────────────────────────────┤
│  [Load More]                        │
└─────────────────────────────────────┘
```

**Behavior**:

- Filter updates query (React Query with filter param)
- "Load More" button for pagination
- Infinite scroll option (disabled by default, toggle with feature flag)
- Pull-to-refresh on mobile

**Styling**:

- Uses shadcn/ui: `Select`, `Card`, `Button`
- Green text for earned (+), red for redeemed (-)
- Separator between items

#### Component: TransactionItem

**Purpose**: Single transaction row with icon, description, and amount

**Props**:

```typescript
interface TransactionItemProps {
  transaction: LoyaltyTransaction;
}
```

**Layout**:

```
┌───────────────────────────────────────┐
│  [Icon] +10 points         2 days ago │
│         Visit completed               │
│         Ref: #VIS-1234                │
└───────────────────────────────────────┘
```

**Behavior**:

- Icon based on source: Visit (🏃), Purchase (🛒), Manual (⚙️), Redemption (🎁)
- Relative time display ("2 days ago")
- Expandable to show notes/details (if present)

**Styling**:

- Icon color matches transaction type
- Muted text for metadata (reference ID, timestamp)

## API Integration

### Data Fetching

```typescript
// React Query hook for balance
function useLoyaltyBalance(playerId: string) {
  return useQuery({
    queryKey: ["loyalty", "balance", playerId],
    queryFn: async () => {
      const res = await fetch(`/api/loyalty/balance?playerId=${playerId}`);
      if (!res.ok) throw new Error("Failed to fetch balance");
      return res.json() as Promise<PlayerLoyaltyBalance>;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// React Query hook for transactions
function useLoyaltyTransactions(
  playerId: string,
  options: { filter?: string; page?: number } = {},
) {
  return useInfiniteQuery({
    queryKey: ["loyalty", "transactions", playerId, options.filter],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        playerId,
        offset: String(pageParam * 20),
        limit: "20",
        ...(options.filter && { type: options.filter }),
      });
      const res = await fetch(`/api/loyalty/transactions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json() as Promise<LoyaltyTransaction[]>;
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === 20 ? pages.length : undefined,
  });
}

// React Query hook for tiers
function useLoyaltyTiers() {
  return useQuery({
    queryKey: ["loyalty", "tiers"],
    queryFn: async () => {
      const res = await fetch("/api/loyalty/tiers");
      if (!res.ok) throw new Error("Failed to fetch tiers");
      return res.json() as Promise<LoyaltyTier[]>;
    },
    staleTime: 1000 * 60 * 60, // 1 hour (tiers change rarely)
  });
}
```

### Mutations

```typescript
// Optimistic update for points (after redemption from another page)
function useRedeemPoints() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      playerId: string;
      pointsCost: number;
      redemptionId: string;
    }) => {
      const res = await fetch("/api/loyalty/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Failed to redeem points");
      return res.json();
    },
    onMutate: async (params) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(["loyalty", "balance", params.playerId]);

      // Snapshot previous value
      const previousBalance = queryClient.getQueryData<PlayerLoyaltyBalance>([
        "loyalty",
        "balance",
        params.playerId,
      ]);

      // Optimistically update
      if (previousBalance) {
        queryClient.setQueryData(["loyalty", "balance", params.playerId], {
          ...previousBalance,
          current_points: previousBalance.current_points - params.pointsCost,
        });
      }

      return { previousBalance };
    },
    onError: (err, params, context) => {
      // Rollback on error
      if (context?.previousBalance) {
        queryClient.setQueryData(
          ["loyalty", "balance", params.playerId],
          context.previousBalance,
        );
      }
    },
    onSuccess: (data, params) => {
      // Invalidate to refetch actual data
      queryClient.invalidateQueries(["loyalty", "balance", params.playerId]);
      queryClient.invalidateQueries([
        "loyalty",
        "transactions",
        params.playerId,
      ]);
    },
  });
}
```

## Form Validation

N/A - This is a read-only display page. No forms present.

## UI States

### Loading State

- Skeleton loaders for:
  - Balance card: shimmer effect on number placeholder
  - Tier progress: shimmer on progress bar
  - Transaction list: 3 skeleton rows
- Disable interactions during loading

### Error State

- **Balance Load Error**:
  - Toast notification (top-right): "Failed to load loyalty balance"
  - Retry button in balance card
  - Log error to monitoring (Sentry/LogRocket)
- **Transactions Load Error**:
  - Inline error message in transaction section
  - Retry button
  - Previous data remains visible (stale-while-revalidate)

### Empty State: No Transactions

```
┌─────────────────────────────────────┐
│         [Empty box illustration]    │
│                                     │
│   No transactions yet               │
│   Start earning points!             │
│                                     │
│   [Book a Session] (CTA button)     │
└─────────────────────────────────────┘
```

### Success State (After Points Action)

- Toast notification: "Points redeemed successfully!"
- Balance animates down (count-down)
- New transaction appears at top of history (optimistic)
- Confetti animation if tier promotion occurred

## Accessibility

### Keyboard Navigation

- Tab order:
  1. Balance card (focusable for screen readers)
  2. Tier progress (focusable)
  3. Transaction filter dropdown
  4. Each transaction item (focusable)
  5. "Load More" button
- Shortcuts:
  - `F` - Focus on filter dropdown
  - `/` - Focus on search (future feature)
- Focus indicators: 2px solid ring, primary color

### Screen Readers

- ARIA labels:
  - Balance: `aria-label="Current loyalty points: 1,234"`
  - Progress bar: `aria-label="Progress to Platinum tier: 75 percent"`
  - Transactions: `aria-label="Transaction history, 15 items"`
- ARIA live regions:
  - Balance updates: `aria-live="polite"`
  - Toast notifications: `aria-live="assertive"`
- Semantic HTML:
  - `<main>` for page content
  - `<section>` for each card area
  - `<h1>` Loyalty Dashboard, `<h2>` for card titles
  - `<table>` for benefits table with proper `<thead>`, `<tbody>`

### Color & Contrast

- Text on background: ≥4.5:1 (e.g., gray-900 on white)
- Tier badge text: ≥4.5:1 (white text on tier color backgrounds)
- Focus indicators: ≥3:1 against adjacent colors
- Error messages: Red with sufficient contrast, plus icon indicator (not color-only)

## Responsive Behavior

### Breakpoints

**Mobile** (<640px):

- Single column layout
- Balance card: full width, larger touch targets
- Tier benefits table: horizontal scroll or stacked rows
- Transaction items: compact view (icon + amount + time)
- Load More: full-width button

**Tablet** (640-1024px):

- Two-column grid: Balance + Progress cards side-by-side
- Benefits table: full width below
- Transactions: full width with more details visible

**Desktop** (≥1024px):

- Three-column grid: Balance | Progress | Quick Actions
- Benefits table: side-by-side comparison
- Transactions: Two-column layout (list + detail panel on click)

### Mobile Considerations

- Touch targets: ≥44x44px for buttons and interactive elements
- Swipe gestures: Swipe left on transaction item to reveal details
- Viewport meta: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Pull-to-refresh: Native browser pull-to-refresh triggers refetch
- Safe area insets: Respect notches and home indicators

## Performance Optimization

### Code Splitting

- Lazy load transaction history section (below fold)
  ```typescript
  const TransactionHistorySection = lazy(
    () => import("./components/transaction-history-section"),
  );
  ```
- Defer tier benefits table until user scrolls to it

### Asset Optimization

- Tier badge icons: Inline SVG (small, cacheable)
- Empty state illustration: WebP with PNG fallback
- Font loading: `font-display: swap` for custom fonts
- No external images (use shadcn/ui icons)

### React Optimization

- Memoize transaction items: `React.memo(TransactionItem)`
- Use virtual scrolling for >100 transactions (react-window)
- Debounce filter changes: 300ms delay before refetch
- Optimistic updates for mutations (balance changes)

### Caching Strategy

- Balance: 5-minute stale time
- Transactions: 2-minute stale time
- Tiers: 1-hour stale time (rarely changes)
- Invalidate on window focus for fresh data

## Implementation Requirements

### File Organization

```
app/player/loyalty/
├── page.tsx                                    # Route page
├── components/
│   ├── loyalty-balance-card.tsx
│   ├── tier-progress-card.tsx
│   ├── tier-benefits-table.tsx
│   ├── transaction-history-section.tsx
│   ├── transaction-item.tsx
│   └── loyalty-skeleton.tsx                   # Loading state
├── hooks/
│   ├── use-loyalty-balance.ts                 # React Query
│   ├── use-loyalty-transactions.ts            # Infinite query
│   ├── use-loyalty-tiers.ts
│   └── use-redeem-points.ts                   # Mutation
└── lib/
    └── loyalty-utils.ts                       # Helper functions (formatPoints, getTierColor)
```

### Dependencies

**shadcn/ui components**:

- `card`, `badge`, `progress`, `table`, `button`, `select`, `skeleton`, `toast`

**Icons**: lucide-react

- `Trophy`, `TrendingUp`, `TrendingDown`, `Gift`, `ShoppingCart`, `Settings`, `RefreshCw`

**Data fetching**: @tanstack/react-query

**Animation**: framer-motion (optional, for confetti/count-up)

## Test Requirements

### Unit Tests

```
__tests__/app/player/loyalty/
├── components/
│   ├── loyalty-balance-card.test.tsx
│   ├── tier-progress-card.test.tsx
│   ├── tier-benefits-table.test.tsx
│   ├── transaction-history-section.test.tsx
│   └── transaction-item.test.tsx
└── hooks/
    ├── use-loyalty-balance.test.ts
    ├── use-loyalty-transactions.test.ts
    └── use-redeem-points.test.ts
```

### Test Cases

**Component Tests**:

- [ ] LoyaltyBalanceCard renders with correct points
- [ ] LoyaltyBalanceCard shows tier badge with correct color
- [ ] TierProgressCard calculates percentage correctly
- [ ] TierProgressCard shows "Max Tier" message for Platinum
- [ ] TierBenefitsTable highlights next tier column
- [ ] TransactionItem shows correct icon for transaction type
- [ ] TransactionHistorySection filters by type correctly
- [ ] TransactionHistorySection loads more on button click

**Hook Tests**:

- [ ] useLoyaltyBalance fetches balance successfully
- [ ] useLoyaltyBalance handles errors gracefully
- [ ] useLoyaltyTransactions paginates correctly
- [ ] useRedeemPoints optimistically updates balance
- [ ] useRedeemPoints rolls back on error

**Accessibility Tests**:

- [ ] Keyboard navigation works (tab through elements)
- [ ] Screen reader labels present and accurate
- [ ] Focus indicators visible
- [ ] Color contrast meets WCAG AA

### E2E Tests (Playwright)

```typescript
test("Player can view loyalty dashboard", async ({ page }) => {
  await page.goto("/player/loyalty");

  // Balance visible
  await expect(page.locator('[data-testid="points-balance"]')).toBeVisible();

  // Progress bar visible
  await expect(page.locator('[data-testid="tier-progress"]')).toBeVisible();

  // Transactions load
  await expect(
    page.locator('[data-testid="transaction-item"]').first(),
  ).toBeVisible();
});

test("Player can filter transactions", async ({ page }) => {
  await page.goto("/player/loyalty");

  // Open filter dropdown
  await page.click('[data-testid="transaction-filter"]');

  // Select "Earned"
  await page.click("text=Earned");

  // Verify only earned transactions visible
  const transactions = page.locator('[data-testid="transaction-item"]');
  const count = await transactions.count();
  for (let i = 0; i < count; i++) {
    await expect(transactions.nth(i)).toContainText("+");
  }
});

test("Player can load more transactions", async ({ page }) => {
  await page.goto("/player/loyalty");

  const initialCount = await page
    .locator('[data-testid="transaction-item"]')
    .count();

  await page.click('[data-testid="load-more-button"]');

  await page.waitForTimeout(500); // Wait for new items

  const newCount = await page
    .locator('[data-testid="transaction-item"]')
    .count();
  expect(newCount).toBeGreaterThan(initialCount);
});
```

## Validation Criteria

Before marking complete:

- [ ] All components implemented and styled with shadcn/ui
- [ ] React Query hooks working for balance, transactions, tiers
- [ ] All UI states handled (loading, error, empty, success)
- [ ] Accessibility requirements met (WCAG 2.1 AA)
- [ ] Responsive on mobile/tablet/desktop (tested on actual devices)
- [ ] Keyboard navigation functional
- [ ] Screen reader tested with VoiceOver/NVDA
- [ ] Performance targets met (Lighthouse score >90)
- [ ] Test coverage ≥80%
- [ ] E2E tests passing

## References

- **Backend API**: `loyalty-service.spec.md`
- **shadcn/ui Components**: https://ui.shadcn.com/docs/components
- **React Query**: https://tanstack.com/query/latest/docs/react
- **Accessibility**: https://www.w3.org/WAI/WCAG21/quickref/
- **Design Patterns**: [Figma link if available]

---

**Status**: approved
**Created By**: ui-engineer.chatmode
**Approved By**: architect.chatmode
**Implementation Target**: Phase 3 / Week 7-9
**Estimated Effort**: 20-28 hours (components: 12h, hooks: 4h, tests: 4h, a11y: 4h, polish: 4h)

---

**END OF SPECIFICATION**

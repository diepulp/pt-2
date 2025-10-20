---
title: Visit Tracking & Check-In UI Specification
description: Staff-facing visit check-in interface with real-time player lookup and session tracking
type: feature
status: approved
version: 1.0.0
created: 2025-10-17
created_by: architect
approved_by: architect.chatmode
implements: Feature Layer (Service + UI Integration)
depends_on:
  - service: VisitService
  - service: PlayerService
  - service: SessionService
  - service: LoyaltyService
---

# Visit Tracking & Check-In UI Specification

## Feature Overview

**Purpose**: Enable staff to quickly check in players for booked sessions, track walk-ins, and automatically award loyalty points upon visit completion.

**User Story**: As a staff member, I want to check in players when they arrive, track their session attendance, and ensure they receive loyalty points so that the visit tracking is accurate and players are rewarded for attendance.

## Scope

### In Scope

- Player search and lookup (by name, phone, email)
- Session booking lookup and verification
- Check-in flow (booked sessions vs walk-ins)
- Visit status tracking (checked_in → in_progress → completed)
- Automatic loyalty points credit on completion
- Real-time visit list display (today's visits)
- Visit notes (optional staff annotations)

### Out of Scope

- Session booking creation (separate feature)
- Payment processing (separate POS integration)
- Player registration (separate onboarding flow)
- Session schedule management (separate admin feature)

### Dependencies

- **VisitService**: CRUD operations for visits table
- **PlayerService**: Player lookup and validation
- **SessionService**: Session availability and booking verification
- **LoyaltyService**: Points crediting on visit completion

## Architecture

### Component Interaction

```
[Staff Check-In UI]
    ↓ (React Query)
[Server Action: checkInPlayer]
    ↓
[VisitService.create() OR .updateStatus()]
    ↓
[Database: visits table]
    ↓ (on completion)
[LoyaltyService.creditPoints()]
    ↓
[Database: loyalty_transactions + player_loyalty_balances]
```

### Data Flow

1. Staff searches for player in UI
2. Client calls `searchPlayers` API
3. Staff selects player + session
4. Client calls `checkInPlayer` server action
5. Server validates session availability
6. VisitService creates visit record (status: 'checked_in')
7. UI updates with real-time visit list
8. Staff marks visit as 'completed' when session ends
9. LoyaltyService credits points (source: 'visit', reference_id: visit.id)
10. UI shows success toast + updated loyalty balance

## Requirements

### Functional Requirements

- [ ] Search players by name, phone, or email with autocomplete
- [ ] Display player info (name, tier, points balance) on selection
- [ ] Show today's session bookings for selected player
- [ ] Check in player for booked session (validate availability)
- [ ] Handle walk-in check-ins (no prior booking)
- [ ] Track visit status transitions: checked_in → in_progress → completed → no_show
- [ ] Automatically credit loyalty points on visit completion (configurable points value)
- [ ] Display real-time visit list (all visits for today, grouped by status)
- [ ] Allow staff to add visit notes
- [ ] Handle concurrent check-ins gracefully (optimistic locking)

### Non-Functional Requirements

- **Performance**:
  - Player search autocomplete: <200ms
  - Check-in action: <500ms
  - Visit list refresh: <1s
  - Real-time updates: <2s latency (via polling or subscriptions)
- **Scalability**: Support 500+ visits/day without performance degradation
- **Security**:
  - Staff authentication required (role: 'staff' or 'admin')
  - RLS policies enforce staff can only view their location's visits
  - Audit trail for check-in/completion actions
- **Reliability**:
  - Offline-first design (queue check-ins, sync when online)
  - Retry failed check-ins automatically
  - Prevent duplicate check-ins (idempotency)
- **Usability**:
  - Mobile-optimized (staff use tablets/phones)
  - Large touch targets (≥48x48px)
  - Minimal taps to check in (≤3 taps)

## User Flows

### Primary Flow: Check-In Booked Player

1. Staff opens check-in page (`/staff/check-in`)
2. Staff types player name in search box
3. Autocomplete shows matching players (name, phone, tier badge)
4. Staff selects player "John Doe"
5. UI displays:
   - Player card (name, tier, points, photo)
   - Today's bookings list (session time, table number)
6. Staff selects booking "3:00 PM - Table 5"
7. Staff clicks "Check In" button
8. System validates:
   - Session exists and is today
   - Session not already checked in
   - Table is available
9. VisitService creates visit record (status: 'checked_in')
10. UI shows success toast: "John Doe checked in for 3:00 PM session"
11. Player card shows "Checked In" badge
12. Visit appears in "Active Visits" list
13. **Later**: Staff marks visit as "Completed"
14. LoyaltyService credits +10 points
15. UI shows toast: "Visit completed. +10 points awarded."

### Alternative Flow 1: Walk-In Check-In

1. Staff searches for player
2. Staff selects player
3. No bookings found for today
4. Staff clicks "Walk-In Check-In" button
5. UI shows session selector (available sessions for walk-ins)
6. Staff selects session time + table
7. System creates booking + visit record simultaneously
8. Outcome: Same as booked flow

### Alternative Flow 2: Player Not Found

1. Staff searches for "Jane Smith"
2. No results found
3. UI shows "Player not found" message
4. CTA button: "Register New Player"
5. Staff clicks → redirects to player registration page
6. After registration, returns to check-in flow

### Alternative Flow 3: Session Already Checked In

1. Staff searches for player with existing check-in
2. Staff selects player
3. UI shows "Already Checked In" badge on session
4. Check-in button disabled
5. Message: "John Doe is already checked in for this session"
6. Option: "Mark as Completed" or "Mark as No-Show"

### Error Cases

**Error Case 1: Session Full**

- Staff attempts check-in
- System validates table capacity
- Error: "Session is full. No available spots."
- Suggestion: "Offer next available session?"

**Error Case 2: Offline**

- Staff attempts check-in with no network
- UI queues check-in action (IndexedDB)
- Shows "Queued for sync" badge
- Syncs when network returns
- Toast: "Queued check-ins synced successfully"

**Error Case 3: Duplicate Check-In**

- Staff double-clicks "Check In" button
- System detects duplicate via idempotency key
- Returns existing visit record (no new record created)
- UI shows success (appears seamless to staff)

## Component Breakdown

### Component Hierarchy

```
CheckInPage (/staff/check-in)
├── CheckInHeader
│   ├── PageTitle
│   └── QuickActionsMenu (settings, help)
├── PlayerSearchSection
│   ├── PlayerSearchInput (autocomplete)
│   └── PlayerSearchResults (dropdown)
├── SelectedPlayerCard (when player selected)
│   ├── PlayerAvatar
│   ├── PlayerInfo (name, tier, points)
│   └── PlayerBookingsList
│       └── BookingItem (repeats)
└── ActiveVisitsPanel
    ├── VisitStatusTabs (All, Checked In, In Progress, Completed)
    ├── VisitList
    │   └── VisitCard (repeats)
    └── RefreshButton
```

### Component Specifications

#### Component: PlayerSearchInput

**Purpose**: Autocomplete search for players by name, phone, or email

**Props**:

```typescript
interface PlayerSearchInputProps {
  onPlayerSelect: (player: Player) => void;
}
```

**State**:

- `query`: string
- `isSearching`: boolean
- `results`: Player[]

**Behavior**:

- Debounced search (300ms delay)
- Shows loading spinner while searching
- Displays max 10 results
- Highlights matching text
- Keyboard navigation (↑↓ to navigate, Enter to select)
- Clears on selection

**Styling**:

- Uses shadcn/ui: `Input`, `Popover`, `Command`
- Mobile: Full-width, large touch target (48px height)

#### Component: SelectedPlayerCard

**Purpose**: Display selected player's info and available bookings

**Props**:

```typescript
interface SelectedPlayerCardProps {
  player: Player;
  bookings: SessionBooking[];
  onCheckIn: (bookingId: string) => void;
  onWalkInCheckIn: () => void;
}
```

**Layout**:

```
┌─────────────────────────────────────────┐
│  [Avatar] John Doe             Gold 🏆  │
│           john@example.com              │
│           (555) 123-4567                │
│           1,234 points                  │
├─────────────────────────────────────────┤
│  Today's Bookings:                      │
│                                         │
│  ○ 3:00 PM - Table 5                    │
│    [Check In]                           │
│                                         │
│  ○ 6:00 PM - Table 3                    │
│    [Check In]                           │
├─────────────────────────────────────────┤
│  No booking? [Walk-In Check-In]         │
└─────────────────────────────────────────┘
```

**Behavior**:

- Shows tier badge with color
- "Check In" button triggers `onCheckIn(bookingId)`
- "Walk-In Check-In" opens modal for session selection
- If already checked in, shows "Checked In ✓" badge (button disabled)
- Optimistic update on check-in click

**Styling**:

- Uses shadcn/ui: `Card`, `Avatar`, `Badge`, `Button`
- Tier badge color matches loyalty tier

#### Component: VisitCard

**Purpose**: Display single visit in active visits list

**Props**:

```typescript
interface VisitCardProps {
  visit: Visit & {
    player: Player;
    session: Session;
  };
  onUpdateStatus: (visitId: string, status: VisitStatus) => void;
}
```

**Layout**:

```
┌──────────────────────────────────────────┐
│  John Doe              [Checked In]      │
│  3:00 PM • Table 5                       │
│  Checked in at 2:55 PM                   │
│                                          │
│  [Mark In Progress] [Mark Completed]     │
└──────────────────────────────────────────┘
```

**Behavior**:

- Status badge color: checked_in (blue), in_progress (yellow), completed (green), no_show (red)
- Action buttons based on current status:
  - `checked_in`: "Mark In Progress", "Mark No-Show"
  - `in_progress`: "Mark Completed", "Mark No-Show"
  - `completed`: No actions (read-only)
- Relative time display ("5 minutes ago")
- Expandable to show notes/details

**Styling**:

- Uses shadcn/ui: `Card`, `Badge`, `Button`
- Status-specific colors
- Compact on mobile, more spacious on desktop

#### Component: WalkInCheckInModal

**Purpose**: Modal for selecting session when checking in walk-in player

**Props**:

```typescript
interface WalkInCheckInModalProps {
  player: Player;
  onCheckIn: (sessionId: string, tableNumber: number) => void;
  onClose: () => void;
}
```

**Layout**:

```
┌─────────────────────────────────────────┐
│  Walk-In Check-In: John Doe        [×]  │
├─────────────────────────────────────────┤
│  Select Session Time:                   │
│  ○ 3:00 PM (5 spots available)          │
│  ○ 4:00 PM (3 spots available)          │
│  ○ 5:00 PM (10 spots available)         │
│                                         │
│  Select Table:                          │
│  [Dropdown: Table 1-10]                 │
│                                         │
│  [Cancel]              [Check In]       │
└─────────────────────────────────────────┘
```

**Behavior**:

- Fetches available sessions (not full)
- Validates table availability on submit
- Closes on successful check-in
- Shows error if session full

**Styling**:

- Uses shadcn/ui: `Dialog`, `RadioGroup`, `Select`, `Button`

## API Integration

### Data Fetching

```typescript
// Player search with autocomplete
function usePlayerSearch(query: string) {
  return useQuery({
    queryKey: ["players", "search", query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const res = await fetch(
        `/api/players/search?q=${encodeURIComponent(query)}`,
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<Player[]>;
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 30, // 30 seconds
  });
}

// Player bookings for today
function usePlayerBookingsToday(playerId: string | null) {
  return useQuery({
    queryKey: ["bookings", "player", playerId, "today"],
    queryFn: async () => {
      if (!playerId) return [];
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(
        `/api/bookings?playerId=${playerId}&date=${today}`,
      );
      if (!res.ok) throw new Error("Failed to fetch bookings");
      return res.json() as Promise<SessionBooking[]>;
    },
    enabled: !!playerId,
  });
}

// Active visits (today, all statuses)
function useActiveVisits() {
  return useQuery({
    queryKey: ["visits", "today"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/visits?date=${today}`);
      if (!res.ok) throw new Error("Failed to fetch visits");
      return res.json() as Promise<
        (Visit & { player: Player; session: Session })[]
      >;
    },
    refetchInterval: 30000, // Poll every 30 seconds for real-time updates
  });
}
```

### Mutations

```typescript
// Check-in player for booked session
function useCheckInPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      playerId: string;
      sessionId: string;
      bookingId?: string;
    }) => {
      const res = await fetch("/api/visits/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Check-in failed");
      }
      return res.json() as Promise<Visit>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["visits", "today"]);
      queryClient.invalidateQueries(["bookings"]);
    },
  });
}

// Update visit status (in_progress, completed, no_show)
function useUpdateVisitStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      visitId: string;
      status: VisitStatus;
      notes?: string;
    }) => {
      const res = await fetch(`/api/visits/${params.visitId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: params.status, notes: params.notes }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json() as Promise<Visit>;
    },
    onMutate: async (params) => {
      // Optimistic update
      await queryClient.cancelQueries(["visits", "today"]);
      const previousVisits = queryClient.getQueryData<Visit[]>([
        "visits",
        "today",
      ]);

      if (previousVisits) {
        queryClient.setQueryData(
          ["visits", "today"],
          previousVisits.map((v) =>
            v.id === params.visitId ? { ...v, status: params.status } : v,
          ),
        );
      }

      return { previousVisits };
    },
    onError: (err, params, context) => {
      if (context?.previousVisits) {
        queryClient.setQueryData(["visits", "today"], context.previousVisits);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["visits", "today"]);

      // If status is 'completed', show points awarded toast
      if (data.status === "completed") {
        // Invalidate loyalty balance to show updated points
        queryClient.invalidateQueries(["loyalty", "balance", data.player_id]);
      }
    },
  });
}
```

## Server Actions (Alternative to API Routes)

```typescript
// app/actions/visits.ts
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createVisitService } from "@/services/visits";
import { createLoyaltyService } from "@/services/loyalty";

export async function checkInPlayerAction(params: {
  playerId: string;
  sessionId: string;
  bookingId?: string;
}) {
  const supabase = createServerClient();
  const visitService = createVisitService(supabase);

  // Validate session availability
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", params.sessionId)
    .single();

  if (!session) {
    throw new Error("Session not found");
  }

  // Check for existing visit
  const existing = await visitService.getBySessionAndPlayer(
    params.sessionId,
    params.playerId,
  );

  if (existing) {
    throw new Error("Player already checked in for this session");
  }

  // Create visit
  const visit = await visitService.create({
    player_id: params.playerId,
    session_id: params.sessionId,
    booking_id: params.bookingId,
    status: "checked_in",
    checked_in_at: new Date().toISOString(),
  });

  return visit;
}

export async function completeVisitAction(visitId: string, notes?: string) {
  const supabase = createServerClient();
  const visitService = createVisitService(supabase);
  const loyaltyService = createLoyaltyService(supabase);

  // Update visit status
  const visit = await visitService.updateStatus(visitId, "completed", notes);

  // Award loyalty points
  await loyaltyService.creditPoints({
    player_id: visit.player_id,
    points_amount: 10, // TODO: Make configurable
    source: "visit",
    reference_id: visit.id,
  });

  return visit;
}
```

## Form Validation

### Walk-In Check-In Form

```typescript
import { z } from "zod";

const walkInCheckInSchema = z.object({
  sessionId: z.string().uuid("Invalid session"),
  tableNumber: z.number().min(1).max(20, "Invalid table number"),
  notes: z.string().max(500, "Notes too long").optional(),
});

type WalkInCheckInValues = z.infer<typeof walkInCheckInSchema>;
```

### Visit Notes Form

```typescript
const visitNotesSchema = z.object({
  notes: z.string().max(500, "Notes must be less than 500 characters"),
});
```

## UI States

### Loading State

- **Player Search**: Spinner in search input
- **Check-In**: Disabled button with spinner during mutation
- **Visit List**: Skeleton cards (3 rows)

### Error State

- **Search Failed**: Toast notification + retry button
- **Check-In Failed**: Inline error below button + toast
- **Visit Update Failed**: Toast with error message + rollback optimistic update

### Empty State: No Visits Today

```
┌─────────────────────────────────────┐
│         [Calendar icon]             │
│                                     │
│   No visits yet today               │
│   Check in players to get started   │
└─────────────────────────────────────┘
```

### Success State

- **Check-In Success**: Toast: "John Doe checked in successfully"
- **Completion Success**: Toast: "Visit completed. +10 points awarded to John Doe"
- **Points Badge Animation**: Confetti effect on points awarded

## Accessibility

### Keyboard Navigation

- Tab order: Search → Results → Selected Player → Bookings → Check-In Button → Active Visits
- Search results: ↑↓ to navigate, Enter to select, Esc to close
- Shortcuts: `/` to focus search, `C` to check in (when player selected)

### Screen Readers

- Search results: `aria-label="Player search results, 5 found"`
- Check-in button: `aria-label="Check in John Doe for 3:00 PM session"`
- Visit cards: `aria-label="John Doe, checked in at 2:55 PM, status: in progress"`
- Status updates announce via `aria-live="polite"`

### Color & Contrast

- Status badges meet WCAG AA (4.5:1 contrast)
- Focus indicators visible (2px ring)
- Not color-only (icons + text for status)

## Responsive Behavior

### Mobile (<640px)

- Single-column layout
- Full-width search
- Stacked player card + bookings
- Bottom sheet for active visits (swipe up to view)
- Large touch targets (48x48px minimum)

### Tablet (640-1024px)

- Two-column: Player selection (left) | Active visits (right)
- Side-by-side layout

### Desktop (≥1024px)

- Three-column: Search + Player (left) | Bookings (center) | Active Visits (right)
- More information density

## Performance Optimization

### Offline Support (PWA)

- Service worker caches check-in page
- IndexedDB queue for offline check-ins
- Background sync when online
- Toast notifications for sync status

### Caching Strategy

- Player search: 30-second stale time
- Active visits: 30-second refetch interval
- Bookings: 5-minute stale time

### Optimistic Updates

- Check-in appears instant (rollback on error)
- Status updates show immediately

## Implementation Requirements

### File Organization

```
app/staff/check-in/
├── page.tsx                                # Route page
├── components/
│   ├── player-search-input.tsx
│   ├── player-search-results.tsx
│   ├── selected-player-card.tsx
│   ├── booking-item.tsx
│   ├── walk-in-check-in-modal.tsx
│   ├── active-visits-panel.tsx
│   ├── visit-card.tsx
│   └── visit-status-tabs.tsx
├── hooks/
│   ├── use-player-search.ts
│   ├── use-player-bookings-today.ts
│   ├── use-active-visits.ts
│   ├── use-check-in-player.ts
│   └── use-update-visit-status.ts
├── actions/
│   └── visits.ts                          # Server actions
└── lib/
    └── check-in-utils.ts                  # Helper functions

app/api/visits/
├── check-in/
│   └── route.ts                           # POST /api/visits/check-in
└── [visitId]/
    └── status/
        └── route.ts                       # PATCH /api/visits/:id/status
```

### Dependencies

**shadcn/ui**: `card`, `input`, `button`, `badge`, `dialog`, `command`, `popover`, `tabs`, `avatar`, `skeleton`
**Icons**: lucide-react (`Search`, `UserCheck`, `Clock`, `MapPin`, `CheckCircle`, `XCircle`)
**Data**: @tanstack/react-query
**Offline**: workbox (service worker), idb (IndexedDB)

## Test Requirements

### Unit Tests

- [ ] PlayerSearchInput debounces correctly
- [ ] SelectedPlayerCard displays bookings
- [ ] VisitCard shows correct status badge
- [ ] WalkInCheckInModal validates session selection

### Integration Tests

- [ ] useCheckInPlayer creates visit record
- [ ] useUpdateVisitStatus updates optimistically
- [ ] completeVisitAction credits loyalty points

### E2E Tests

```typescript
test("Staff can check in booked player", async ({ page }) => {
  await page.goto("/staff/check-in");

  // Search for player
  await page.fill('[data-testid="player-search"]', "John Doe");
  await page.click("text=John Doe");

  // Select booking
  await page.click('[data-testid="booking-item"]:first-child >> text=Check In');

  // Verify success
  await expect(page.locator("text=checked in successfully")).toBeVisible();
  await expect(
    page.locator('[data-testid="active-visits"] >> text=John Doe'),
  ).toBeVisible();
});

test("Staff can complete visit and award points", async ({ page }) => {
  await page.goto("/staff/check-in");

  // Find active visit
  const visitCard = page.locator('[data-testid="visit-card"]:first-child');

  // Mark as completed
  await visitCard.locator("text=Mark Completed").click();

  // Verify points awarded
  await expect(page.locator("text=+10 points awarded")).toBeVisible();
});
```

## Validation Criteria

- [ ] All components implemented with shadcn/ui
- [ ] Player search autocomplete working (<200ms)
- [ ] Check-in flow complete (booked + walk-in)
- [ ] Visit status updates working with optimistic updates
- [ ] Loyalty points credited on completion
- [ ] Real-time visit list (30s polling or subscriptions)
- [ ] Offline support (PWA with background sync)
- [ ] Mobile responsive (tested on tablets/phones)
- [ ] Accessibility (keyboard nav, screen readers)
- [ ] Test coverage ≥80%
- [ ] E2E tests passing

## References

- **Backend Services**: `loyalty-service.spec.md`, VisitService, PlayerService
- **UI Patterns**: `player-loyalty-ui.spec.md`
- **shadcn/ui**: https://ui.shadcn.com
- **Offline PWA**: https://developer.chrome.com/docs/workbox/

---

**Status**: approved
**Created By**: architect.chatmode
**Approved By**: architect.chatmode
**Implementation Target**: Phase 3 / Week 10-12
**Estimated Effort**: 28-36 hours (backend: 8h, UI: 16h, offline: 4h, tests: 8h)

---

**END OF SPECIFICATION**

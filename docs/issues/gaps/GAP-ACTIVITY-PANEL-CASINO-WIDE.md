# GAP-ACTIVITY-PANEL-CASINO-WIDE

## Activity Panel Enhancement — Casino-Wide Player Lookup

**Status**: Pending Approval
**Created**: 2026-01-18
**Category**: UI Enhancement

---

## Problem Statement

The existing `ActivityPanel` component (`components/pit-panels/activity-panel.tsx`) is scoped to a **single selected table**, limiting pit bosses' ability to quickly locate players across the casino floor.

### Current Limitations
- Shows activity for selected table only
- Limited player info (name derived from seat mapping)
- No search/filter capability
- No cross-table visibility

---

## Target State

Enhanced Activity Panel with **casino-wide visibility**:
- All active players across **ALL pits and tables**
- shadcn data table with sortable/filterable columns
- Full player info (name, birthday) for disambiguation
- Search filter with Zustand persistence
- Responsive design optimized for quick lookup

---

## Design Decisions

| Decision | Resolution |
|----------|------------|
| **Search state** | Zustand store (`activitySearchQuery`) |
| **Birthday display** | Date format (e.g., "1984-03-15") — discriminates same-name players |
| **Mobile columns** | Name + Birthdate only |
| **Hidden on mobile** | average_bet, status, tier, table_id, slip_id |
| **UI density** | Reduced — quick lookup focused |
| **Default sort** | Descending by start_time (most recent first) |
| **Sort toggle** | Alphabetical by name (A→Z / Z→A) |

---

## Implementation Components

### 1. Database Layer (Completed)

**Migration**: `20260118151907_add_active_players_casino_wide_rpc.sql`

Created RPC `rpc_list_active_players_casino_wide` returning:

| Column | Type | Description |
|--------|------|-------------|
| `slip_id` | uuid | Rating slip ID (for onClick) |
| `player_id` | uuid | Player identifier |
| `player_first_name` | text | First name |
| `player_last_name` | text | Last name |
| `player_birth_date` | date | Birthday (nullable) |
| `player_tier` | text | Loyalty tier |
| `table_id` | uuid | Gaming table ID |
| `table_name` | text | Table display name |
| `pit_name` | text | Pit location |
| `seat_number` | text | Seat number |
| `start_time` | timestamptz | Session start |
| `status` | text | 'open' or 'paused' |
| `average_bet` | numeric | Avg bet amount |

---

### 2. Zustand Store Update

**File**: `store/pit-dashboard-store.ts`

```typescript
interface PitDashboardUIState {
  // ... existing fields

  // Activity panel state
  activitySearchQuery: string;
  activitySortMode: 'recent' | 'alpha-asc' | 'alpha-desc';
  setActivitySearchQuery: (query: string) => void;
  setActivitySortMode: (mode: 'recent' | 'alpha-asc' | 'alpha-desc') => void;
}
```

---

### 3. Service Layer

**File**: `services/rating-slip/dtos.ts`

```typescript
export interface ActivePlayerForDashboardDTO {
  slipId: string;
  visitId: string;
  tableId: string;
  tableName: string;
  pitName: string | null;
  seatNumber: string | null;
  startTime: string;
  status: 'open' | 'paused';
  averageBet: number | null;
  player: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string | null;
    tier: string | null;
  } | null;
}
```

**File**: `services/rating-slip/crud.ts`
- Add `listActivePlayersCasinoWide(supabase, options)` function
- Uses RPC with search filter support

---

### 4. API Endpoint

**File**: `app/api/v1/rating-slips/active-players/route.ts`

```typescript
// GET /api/v1/rating-slips/active-players?search=John&limit=100
// Returns: { items: ActivePlayerForDashboardDTO[], count: number }
```

Security: ADR-024 compliant (casino scope from RLS context)

---

### 5. React Hook

**File**: `hooks/dashboard/use-casino-active-players.ts`

```typescript
export function useCasinoActivePlayers(options?: {
  search?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: dashboardKeys.casinoActivePlayers(options),
    queryFn: () => fetchCasinoActivePlayers(options),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
```

---

### 6. Responsive Column Matrix

| Column | Desktop | Tablet | Mobile | Purpose |
|--------|---------|--------|--------|---------|
| **Name** (first + last) | Yes | Yes | Yes | Primary identifier |
| **Birthdate** | Yes | Yes | Yes | Disambiguate same-name players |
| **Table / Pit** | Yes | Yes | No | Location context |
| **Seat** | Yes | No | No | Detailed position |
| **Duration** | Yes | Yes | No | Session length |
| **Status** | Yes | No | No | Open/Paused indicator |
| **Tier** | Yes | No | No | Loyalty level |
| **Avg Bet** | Yes | No | No | Financial context |

---

### 7. Sort Behavior

```
Sort Toggle UI:
┌─────────┐  ┌─────────┐
│ Recent ▼│  │ A → Z   │
└─────────┘  └─────────┘

States:
• 'recent'     → start_time DESC (default)
• 'alpha-asc'  → last_name ASC
• 'alpha-desc' → last_name DESC
```

---

## UI Wireframes

### Desktop (full density)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Search players...                         [Recent ▼] [A→Z]          │
├──────────────────────────────────────────────────────────────────────┤
│ Name              │ Birthdate   │ Table / Pit    │ Duration │ Status │
├───────────────────┼─────────────┼────────────────┼──────────┼────────┤
│ John Smith        │ 1984-03-15  │ BJ-12 / Pit A  │ 1h 23m   │ ● Open │
│ Jane Doe          │ 1976-08-22  │ BJ-05 / Pit B  │ 45m      │ ◐ Pause│
│ John Smith        │ 1992-11-03  │ RLT-02 / Pit A │ 2h 10m   │ ● Open │
└──────────────────────────────────────────────────────────────────────┘
```

### Mobile (minimal density)

```
┌────────────────────────────────┐
│ Search...           [Sort ▼]  │
├────────────────────────────────┤
│ John Smith                     │
│ 1984-03-15                     │
├────────────────────────────────┤
│ Jane Doe                       │
│ 1976-08-22                     │
├────────────────────────────────┤
│ John Smith                     │
│ 1992-11-03                     │
└────────────────────────────────┘
```

Row click → `onSlipClick(slipId)` (unchanged behavior)

---

## Data Flow

```
PanelContainer
└── ActivityPanel
     └── useCasinoActivePlayers()
          └── GET /api/v1/rating-slips/active-players
               └── withServerAction middleware (ADR-024)
                    └── rpc_list_active_players_casino_wide
                         └── set_rls_context_from_staff()
                              └── Casino-scoped data
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `store/pit-dashboard-store.ts` | Add `activitySearchQuery`, `activitySortMode` |
| `services/rating-slip/dtos.ts` | Add `ActivePlayerForDashboardDTO` |
| `services/rating-slip/mappers.ts` | Add mapper function |
| `services/rating-slip/crud.ts` | Add `listActivePlayersCasinoWide` |
| `services/rating-slip/index.ts` | Export new function |
| `app/api/v1/rating-slips/active-players/route.ts` | Create endpoint |
| `hooks/dashboard/use-casino-active-players.ts` | Create hook |
| `hooks/dashboard/keys.ts` | Add query key factory |
| `hooks/dashboard/index.ts` | Export new hook |
| `components/pit-panels/activity-panel.tsx` | Rewrite with responsive data table |
| `components/pit-panels/panel-container.tsx` | Update props (remove table-scoped data) |

---

## Technical Compliance

| Requirement | Status |
|-------------|--------|
| React 19 patterns (useTransition for async) | Planned |
| TanStack Query v5 for data fetching | Planned |
| Zustand for UI state (search, sort) | Planned |
| shadcn/ui table component | Planned |
| No manual loading state (`useState`) | Planned |
| No `useEffect` sync patterns | Planned |
| ADR-024 RLS compliance | Completed (RPC) |
| TypeScript strict mode | Planned |
| Tailwind v4 syntax | Planned |
| Loading skeletons (not spinners) | Planned |

---

## Risk Considerations

1. **Performance**: Casino-wide query may return many rows
   - Mitigation: Default limit (100), pagination support, search filter

2. **Real-time updates**: Need cache invalidation on slip changes
   - Mitigation: Use existing realtime subscription + targeted invalidation

3. **UI density**: Data table may be dense on mobile
   - Mitigation: Responsive column visibility, mobile-optimized layout

---

## Approval

- [ ] Plan reviewed
- [ ] Design decisions confirmed
- [ ] Ready for implementation

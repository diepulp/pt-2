# PRD-006 — Pit Dashboard UI (GATE-2 Completion)

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Created:** 2025-12-02
- **Summary:** Implement the Pit Dashboard, the primary operational interface for pit bosses to manage gaming tables, active rating slips, and player sessions in real-time. This completes GATE-2 (Session Management + UI) and unblocks Phase 3 (Rewards & Compliance). The dashboard leverages the existing `TableLayoutTerminal` component. Backend services (TableContextService, RatingSlipService) will be built as part of this PRD implementation.

## 2. Problem & Goals

### 2.1 Problem

PT-2 needs backend services for table management and rating slip lifecycle, plus a user-facing interface for pit operations. Pit bosses currently have no way to:
- View real-time table status across the pit floor
- See which players are seated at which tables
- Manage active rating slips (start/pause/resume/close)
- Monitor player check-ins and session activity

Without the Pit Dashboard, the GATE-2 milestone cannot be completed, blocking Phase 3 implementation.

### 2.2 Goals

1. **Real-time table visibility**: Pit bosses can see all gaming tables with current status, occupancy, and active slips within 2 seconds of page load
2. **Rating slip management**: Pit bosses can start, pause, resume, and close rating slips from the dashboard without navigating away
3. **Player-to-table association**: Clicking a seat shows which player is seated and their active rating slip
4. **Status accuracy**: Dashboard state reflects database reality within 5 seconds (real-time subscription)
5. **Performance**: Dashboard achieves p95 LCP ≤ 2.5s on standard connection

### 2.3 Non-Goals

- Floor layout design/editing (floor-layout bounded context, separate PRD)
- Dealer rotation management (out of scope for MVP)
- Historical reporting dashboards (Phase 3+)
- Mobile-optimized view (desktop-first for MVP)
- Multi-pit support (single pit view for MVP)

## 3. Users & Use Cases

- **Primary users:** Pit Bosses, Floor Supervisors, Casino Shift Managers

**Top Jobs:**

1. As a **Pit Boss**, I need to see all my tables at a glance so that I can quickly identify which need attention (e.g., no dealer, all seats empty, multiple paused slips).

2. As a **Pit Boss**, I need to click a table to see seat-level detail so that I can verify player positions and start/manage rating slips.

3. As a **Floor Supervisor**, I need to start a rating slip for a player by selecting their seat so that I can begin tracking their play session.

4. As a **Floor Supervisor**, I need to pause/resume a rating slip when a player takes a break so that effective play time is accurately calculated.

5. As a **Shift Manager**, I need to see summary stats (active tables, open slips, checked-in players) so that I can monitor pit activity at a macro level.

## 4. Scope & Feature List

### P0 (Must-Have for GATE-2)

- **Stats bar**: Active tables count, open slips count, checked-in players count
- **Table grid**: Thumbnail view of all tables with status indicator (active/inactive/closed)
- **Table detail view**: Expanded `TableLayoutTerminal` showing seat occupancy for selected table
- **Rating slip panel**: List of active rating slips at selected table with pause/resume/close actions
- **New slip flow**: Modal to start a new rating slip by selecting seat and player

### P1 (Should-Have)

- **Real-time updates**: Supabase realtime subscriptions for table/slip state changes
- **Table quick actions**: Open/close table from detail view
- **Compact table thumbnails**: Mini `TableLayoutTerminal` variant for grid view
- **Player activity feed**: Recent check-ins/check-outs (last 10)

### P2 (Nice-to-Have)

- **Keyboard navigation**: Arrow keys to navigate tables, Enter to select
- **Sound alerts**: Audio notification for new check-ins
- **Table grouping**: Group by game type or pit section

## 5. Requirements

### 5.1 Functional Requirements

- Dashboard displays all gaming tables for the current casino (RLS-scoped)
- Clicking a table thumbnail expands it to full `TableLayoutTerminal` view
- Clicking a seat on `TableLayoutTerminal` opens player/slip context menu
- Rating slip actions (pause/resume/close) call existing RatingSlipService lifecycle endpoints
- New slip creation requires: table_id, seat_number, player_id, game_settings_id
- Stats bar updates when underlying data changes
- Empty state shown when no tables exist

### 5.2 Non-Functional Requirements

- p95 LCP ≤ 2.5s for dashboard page
- Dashboard remains responsive during bulk updates (≤50 tables)
- All mutations use optimistic updates via React Query
- Accessibility: WCAG 2.1 AA compliant (keyboard nav, screen reader labels)

> Details of architecture, schema, and API live in ARCH/SRM/schema docs and are not repeated here.

## 6. UX / Flow Overview

**Primary Flow: View and Manage Tables**

1. Pit Boss opens dashboard (`/dashboard`) → Stats bar and table grid load
2. Pit Boss clicks table thumbnail → Table expands to full `TableLayoutTerminal` view
3. Pit Boss clicks occupied seat → Context menu shows player name + slip actions
4. Pit Boss clicks "Pause Slip" → Slip status updates, timer pauses
5. Dashboard reflects change in real-time (P1) or on manual refresh (P0)

**Secondary Flow: Start New Rating Slip**

1. Pit Boss clicks "+ New Slip" button or empty seat
2. Modal opens with seat pre-selected
3. Pit Boss searches/selects player (PlayerService search)
4. Pit Boss confirms game settings (pre-filled from table's game type)
5. Slip created → Appears in Active Slips panel

```
Dashboard Page Layout:
┌──────────────────────────────────────────────────────────┐
│ Stats Bar: [Active Tables] [Open Slips] [Players]        │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐   │
│ │ TABLE DETAIL VIEW (TableLayoutTerminal expanded)   │   │
│ │ - Shows selected table with semi-circular layout   │   │
│ │ - Dealer at bottom, seats along arc                │   │
│ │ - Click seat for player/slip actions               │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐  <- Table Grid (thumbs)   │
│ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                            │
├──────────────────────────────────────────────────────────┤
│ ACTIVE SLIPS AT TABLE                    [+ New Slip]    │
│ ┌────────────────────────────────────────────────────┐   │
│ │ Seat | Player | Duration | Avg Bet | Actions       │   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| TableContextService | ❌ Pending | Build as part of PRD-006 |
| RatingSlipService | ❌ Pending | Build as part of PRD-006 |
| PlayerService | ✅ Complete | Search, enrollment, CRUD |
| VisitService | ✅ Complete | Check-in/check-out |
| CasinoService | ✅ Complete | Temporal authority, settings |
| `TableLayoutTerminal` component | ✅ Exists | Needs enhancement (see below) |
| React Query infrastructure | ✅ Complete | Query client, key factories |
| Supabase Realtime | Available | Not yet integrated |

**Component Enhancement Required**:

The existing `components/table/table-layout-terminal.tsx` needs these additions:

| Prop | Type | Purpose |
|------|------|---------|
| `tableId` | `string` | Display table label (T1, T2, etc.) |
| `gameType` | `GameType` | Show game type badge |
| `tableStatus` | `TableStatus` | Visual status indicator |
| `activeSlipsCount` | `number` | Badge for active slips |
| `onTableAction` | `(action) => void` | Quick actions callback |
| `variant` | `'full' \| 'compact'` | Size variant for grid view |
| `isSelected` | `boolean` | Highlight when selected |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Real-time complexity may delay GATE-2 | P1 scope; P0 uses polling/manual refresh |
| Large table counts may affect performance | Virtualize grid if >20 tables; test with 50 |
| Seat-to-player mapping unclear | Use `rating_slip.seat_number` for positioning |

**Open Questions:**

1. Should we show closed/inactive tables or filter them? → **Recommendation:** Show all, dim inactive/closed
2. How to handle multiple slips per seat (e.g., player moves)? → **Recommendation:** Show most recent only; list all in detail
3. Should stats bar include gaming day context? → **Recommendation:** Yes, show current gaming day from CasinoService

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Dashboard page loads at `/dashboard` with stats bar and table grid
- [ ] Clicking a table shows expanded `TableLayoutTerminal` with seat occupancy
- [ ] Clicking an occupied seat shows player name and slip actions
- [ ] "New Slip" flow creates a rating slip with correct table/seat/player association
- [ ] Pause/resume/close actions correctly update slip state

**Data & Integrity**
- [ ] Dashboard state matches database within 5 seconds (realtime) or on refresh (P0)
- [ ] No orphaned or stuck rating slips visible in UI
- [ ] Empty states display correctly when no tables/slips exist

**Security & Access**
- [ ] Dashboard respects RLS (user only sees their casino's tables)
- [ ] Only authorized roles (pit_boss, admin) can access dashboard
- [ ] Slip mutations require authenticated session

**Testing**
- [ ] Unit tests for dashboard data hooks (query composition)
- [ ] Integration tests for slip lifecycle actions
- [ ] E2E test: View tables → Select table → Start slip → Pause → Close

**Operational Readiness**
- [ ] Error states display user-friendly messages
- [ ] Loading states shown during data fetching
- [ ] p95 LCP ≤ 2.5s verified in Lighthouse

**Documentation**
- [ ] `TableLayoutTerminal` props documented in component
- [ ] Dashboard usage documented for pit boss training

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Service Layer (SLAD):** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **MVP Roadmap:** `docs/20-architecture/MVP-ROADMAP.md` (GATE-2 section)
- **TableContextService:** `services/table-context/index.ts`
- **RatingSlipService:** `services/rating-slip/index.ts`
- **TableLayoutTerminal:** `components/table/table-layout-terminal.tsx`
- **Database Types:** `types/database.types.ts`
- **RLS Policy Matrix:** `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Testing Strategy:** `docs/40-quality/QA-001-service-testing-strategy.md`

## 10. Implementation Workstreams

### WS1: TableLayoutTerminal Enhancement
**Agent:** frontend-design
**Effort:** Small
**Dependencies:** None

- Add new props: `tableId`, `gameType`, `tableStatus`, `activeSlipsCount`
- Add `variant` prop for compact mode
- Add `isSelected` prop for grid selection
- Add `onTableAction` callback

### WS2: Dashboard Page & Layout
**Agent:** frontend-design
**Effort:** Medium
**Dependencies:** WS1

- Create `app/dashboard/page.tsx` with layout
- Implement stats bar component
- Implement table grid with compact thumbnails
- Wire up table selection state

### WS3: Dashboard Data Layer
**Agent:** full-stack-developer
**Effort:** Medium
**Dependencies:** None (parallel with WS1)

- Create `hooks/dashboard/use-dashboard-tables.ts`
- Create `hooks/dashboard/use-dashboard-slips.ts`
- Create `hooks/dashboard/use-dashboard-stats.ts`
- Implement query composition with React Query

### WS4: Slip Management UI
**Agent:** frontend-design
**Effort:** Medium
**Dependencies:** WS2, WS3

- Create `components/dashboard/active-slips-panel.tsx`
- Create `components/dashboard/new-slip-modal.tsx`
- Wire up slip lifecycle actions to RatingSlipService

### WS5: Real-time Updates (P1)
**Agent:** full-stack-developer
**Effort:** Medium
**Dependencies:** WS3

- Implement Supabase realtime subscription for tables
- Implement Supabase realtime subscription for rating slips
- Create `hooks/dashboard/use-dashboard-realtime.ts`

### WS6: Testing & Validation
**Agent:** backend-architect
**Effort:** Small
**Dependencies:** WS1-WS4

- Unit tests for dashboard hooks
- Integration tests for slip actions
- E2E test for primary flow

---

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-02 | Lead Architect | Initial draft |

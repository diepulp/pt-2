# UI Sitemap: PT-2 Navigation Architecture

**ID**: UI-SITEMAP-001
**Version**: 1.0.0
**Status**: CANONICAL
**Created**: 2025-12-08
**Updated**: 2025-12-08
**Owner**: Lead Architect
**Companion**: UI-SCAFFOLD-PROPOSITION.md (layout/styling), this doc (routes/navigation)

---

## Purpose

This document establishes the **authoritative navigation structure** for PT-2, derived from:

1. **Service Responsibility Matrix (SRM v4.0.0)** - Bounded contexts and domain ownership
2. **API Surface** - 45 deployed route handlers across 9 domains
3. **MVP-ROADMAP** - Phase-gated feature availability
4. **PRD-006** - Pit Dashboard UI requirements

This sitemap complements `UI-SCAFFOLD-PROPOSITION.md` which defines layout patterns and design tokens. Together they form the complete UI architecture specification.

---

## Route Group Structure

```
app/
├── (public)/                    # Unauthenticated routes
│   ├── page.tsx                 # Landing page (marketing/redirect)
│   └── auth/                    # Authentication flows
│       ├── login/
│       ├── sign-up/
│       ├── sign-up-success/
│       ├── forgot-password/
│       ├── update-password/
│       └── error/
│
├── (dashboard)/                 # Authenticated dashboard shell
│   ├── layout.tsx               # DashboardShell with RetractableSidebar
│   ├── page.tsx                 # Dashboard home (redirects to /pit)
│   │
│   ├── pit/                     # Pit Operations (Primary)
│   │   ├── page.tsx             # Pit Dashboard (PRD-006)
│   │   └── tables/
│   │       └── [tableId]/       # Table detail view
│   │           └── page.tsx
│   │
│   ├── players/                 # Player Management
│   │   ├── page.tsx             # Player list/search
│   │   └── [playerId]/
│   │       └── page.tsx         # Player detail + visits + slips
│   │
│   ├── visits/                  # Visit Management (Phase 2+)
│   │   ├── page.tsx             # Active visits list
│   │   └── [visitId]/
│   │       └── page.tsx         # Visit detail with rating slips
│   │
│   ├── loyalty/                 # Loyalty & Rewards (Phase 3)
│   │   └── page.tsx             # Loyalty dashboard (ledger, balances)
│   │
│   ├── compliance/              # MTL Compliance (Phase 3)
│   │   └── page.tsx             # MTL entries, threshold alerts
│   │
│   └── settings/                # Casino Settings
│       ├── page.tsx             # Settings hub
│       ├── casino/              # Casino configuration
│       │   └── page.tsx
│       ├── staff/               # Staff management
│       │   └── page.tsx
│       └── tables/              # Table configuration
│           └── page.tsx
│
└── api/v1/                      # API routes (existing)
```

---

## Navigation Hierarchy

### Primary Navigation (Sidebar)

| Icon | Label | Route | Service Context | MVP Phase | Status |
|------|-------|-------|-----------------|-----------|--------|
| `LayoutDashboard` | Dashboard | `/` | — | 1 | Redirect to `/pit` |
| `Table2` | Pit | `/pit` | TableContextService, RatingSlipService | 2 | P0 (GATE-2) |
| `Users` | Players | `/players` | PlayerService, VisitService | 1 | Ready |
| `Gift` | Loyalty | `/loyalty` | LoyaltyService | 3 | Phase 3 |
| `Shield` | Compliance | `/compliance` | MTLService | 3 | Phase 3 |
| `Settings` | Settings | `/settings` | CasinoService | 1 | Ready |

### Secondary Navigation (Contextual)

Appears within primary pages based on context:

| Context | Sub-navigation | Routes |
|---------|---------------|--------|
| **Pit** | Table selector grid | `/pit/tables/[tableId]` |
| **Players** | Player detail tabs | Profile, Visits, Rating Slips, Loyalty |
| **Settings** | Settings categories | Casino, Staff, Tables |

---

## Page-to-Service Mapping

### Pit Operations (`/pit`)

**Primary Page**: Pit Dashboard (PRD-006)

| Component | Service | API Endpoints | Query Keys |
|-----------|---------|---------------|------------|
| Stats Bar | TableContextService, RatingSlipService | `/api/v1/tables`, `/api/v1/rating-slips` | `tableKeys.list`, `ratingSlipKeys.list` |
| Table Grid | TableContextService | `/api/v1/tables` | `tableKeys.list` |
| Table Detail | TableContextService | `/api/v1/tables/[tableId]` | `tableKeys.detail` |
| Active Slips Panel | RatingSlipService | `/api/v1/rating-slips?table_id=X` | `ratingSlipKeys.byTable` |
| New Slip Modal | RatingSlipService, PlayerService | `/api/v1/rating-slips`, `/api/v1/players` | `ratingSlipKeys.create`, `playerKeys.search` |

**Server Actions** (form mutations):
- `activateTable` - `app/actions/table-context/activate-table.ts`
- `deactivateTable` - `app/actions/table-context/deactivate-table.ts`
- `closeTable` - `app/actions/table-context/close-table.ts`
- `assignDealer` - `app/actions/table-context/assign-dealer.ts`
- `endDealerRotation` - `app/actions/table-context/end-dealer-rotation.ts`

### Table Detail (`/pit/tables/[tableId]`)

| Component | Service | API Endpoints |
|-----------|---------|---------------|
| TableLayoutTerminal | TableContextService | `/api/v1/tables/[tableId]` |
| Dealer Assignment | TableContextService | `/api/v1/tables/[tableId]/dealer` |
| Rating Slips List | RatingSlipService | `/api/v1/rating-slips?table_id=X` |
| Slip Actions | RatingSlipService | `/api/v1/rating-slips/[id]/pause`, `/resume`, `/close` |

### Player Management (`/players`)

**List Page**: Player search and browse

| Component | Service | API Endpoints | Query Keys |
|-----------|---------|---------------|------------|
| Player Search | PlayerService | `/api/v1/players?search=X` | `playerKeys.search` |
| Player List | PlayerService | `/api/v1/players` | `playerKeys.list` |
| Enrollment Badge | PlayerService | `/api/v1/players/[id]/enrollment` | `playerKeys.enrollment` |

**Detail Page** (`/players/[playerId]`):

| Tab | Service | API Endpoints |
|-----|---------|---------------|
| Profile | PlayerService | `/api/v1/players/[playerId]` |
| Visits | VisitService | `/api/v1/visits?player_id=X` |
| Rating Slips | RatingSlipService (via Visit) | `/api/v1/rating-slips?visit_id=X` |
| Loyalty | LoyaltyService | `/api/v1/loyalty/balances?player_id=X` |

### Visit Management (`/visits`)

| Component | Service | API Endpoints | Query Keys |
|-----------|---------|---------------|------------|
| Active Visits | VisitService | `/api/v1/visits?status=active` | `visitKeys.active` |
| Visit Detail | VisitService | `/api/v1/visits/[visitId]` | `visitKeys.detail` |
| Check-in Action | VisitService | `POST /api/v1/visits` | `visitKeys.create` |
| Check-out Action | VisitService | `POST /api/v1/visits/[id]/close` | `visitKeys.close` |

**Visit Archetypes** (per ADR-014, EXEC-VSE-001):

| `visit_kind` | UI Label | Can Rate | Can Accrue Loyalty |
|--------------|----------|----------|-------------------|
| `reward_identified` | Reward Visit | No | Redemption only |
| `gaming_identified_rated` | Gaming Session | Yes | Yes |
| `gaming_ghost_unrated` | Ghost Gaming | Yes | No (compliance only) |

### Loyalty (`/loyalty`) - Phase 3

| Component | Service | API Endpoints |
|-----------|---------|---------------|
| Balance Display | LoyaltyService | `/api/v1/loyalty/balances` |
| Ledger History | LoyaltyService | `/api/v1/loyalty/ledger` |
| Mid-Session Reward | LoyaltyService | `/api/v1/loyalty/mid-session-reward` |

### Compliance (`/compliance`) - Phase 3

| Component | Service | API Endpoints |
|-----------|---------|---------------|
| MTL Entries | MTLService | `/api/v1/mtl/entries` |
| Threshold Alerts | MTLService | `/api/v1/mtl/entries?threshold=watchlist` |
| Audit Notes | MTLService | `/api/v1/mtl/entries/[id]/audit-notes` |

### Settings (`/settings`)

| Sub-route | Service | API Endpoints |
|-----------|---------|---------------|
| `/settings/casino` | CasinoService | `/api/v1/casino/settings` |
| `/settings/staff` | CasinoService | `/api/v1/casino/staff` |
| `/settings/tables` | TableContextService | `/api/v1/tables` (admin view) |

---

## API Surface Summary

### Deployed Route Handlers (45 total)

| Domain | Endpoints | Status |
|--------|-----------|--------|
| **Casino** | 5 | `/api/v1/casino/*` |
| **Casinos** (legacy) | 3 | `/api/v1/casinos/[casinoId]/*` |
| **Players** | 4 | `/api/v1/players/*` |
| **Visits** | 4 | `/api/v1/visits/*` |
| **Tables** | 6 | `/api/v1/tables/*` |
| **Table Context** | 4 | `/api/v1/table-context/*` |
| **Rating Slips** | 6 | `/api/v1/rating-slips/*` |
| **Loyalty** | 3 | `/api/v1/loyalty/*` |
| **Finance** | 2 | `/api/v1/finance/*` |
| **MTL** | 3 | `/api/v1/mtl/*` |
| **Floor Layouts** | 2 | `/api/v1/floor-layouts/*` |
| **Floor Activations** | 1 | `/api/v1/floor-layout-activations` |

### Server Actions (5 deployed)

All in `app/actions/table-context/`:
- `activate-table.ts`
- `deactivate-table.ts`
- `close-table.ts`
- `assign-dealer.ts`
- `end-dealer-rotation.ts`

---

## Role-Based Access

Per SEC-001 RLS Policy Matrix and `staff_role` enum:

| Role | Pit | Players | Visits | Loyalty | Compliance | Settings |
|------|-----|---------|--------|---------|------------|----------|
| `dealer` | View only | No | No | No | No | No |
| `pit_boss` | Full | Full | Full | View | View | View |
| `admin` | Full | Full | Full | Full | Full | Full |

**Sidebar Visibility**:
- `dealer`: Pit only (collapsed nav, no settings)
- `pit_boss`: Pit, Players, Settings (read-only casino settings)
- `admin`: All routes

---

## Mobile Navigation (Bottom Nav)

Per UI-SCAFFOLD-PROPOSITION.md decision, mobile uses bottom navigation:

| Icon | Label | Route | Phase |
|------|-------|-------|-------|
| `Table2` | Pit | `/pit` | 2 |
| `Users` | Players | `/players` | 1 |
| `Settings` | Settings | `/settings` | 1 |

**Mobile Constraints**:
- Max 4 items in bottom nav
- Loyalty/Compliance accessed via hamburger menu (Phase 3)
- Table detail uses full-screen modal on mobile

---

## Feature Flags & Phase Gating

| Route | Feature Flag | MVP Phase | Visibility |
|-------|--------------|-----------|------------|
| `/pit` | — | 2 (GATE-2) | All roles |
| `/loyalty` | `FEATURE_LOYALTY_UI` | 3 | Hidden until Phase 3 |
| `/compliance` | `FEATURE_MTL_UI` | 3 | Admin only until Phase 3 |
| `/settings/tables` | — | 2 | Admin only |

**Implementation**:
```tsx
// components/layout/nav-items.ts
export const navItems = [
  { icon: Table2, label: 'Pit', href: '/pit', phase: 2 },
  { icon: Users, label: 'Players', href: '/players', phase: 1 },
  { icon: Gift, label: 'Loyalty', href: '/loyalty', phase: 3, flag: 'FEATURE_LOYALTY_UI' },
  { icon: Shield, label: 'Compliance', href: '/compliance', phase: 3, flag: 'FEATURE_MTL_UI' },
  { icon: Settings, label: 'Settings', href: '/settings', phase: 1 },
];
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              UI LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ Pit Dashboard│    │   Players   │    │   Visits    │    │  Settings   │  │
│  │   /pit       │    │  /players   │    │  /visits    │    │ /settings   │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                   │                   │                   │        │
│         ▼                   ▼                   ▼                   ▼        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     React Query Hooks Layer                          │    │
│  │  useTablesQuery, useRatingSlipsQuery, usePlayersQuery, useVisitsQuery│   │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     │                                        │
├─────────────────────────────────────┼────────────────────────────────────────┤
│                              TRANSPORT LAYER                                 │
│                                     │                                        │
│  ┌──────────────────────────────────┼──────────────────────────────────┐    │
│  │           HTTP Fetchers (services/*/http.ts)                         │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │    │
│  │  │ tableHttp  │ │ playerHttp │ │ visitHttp  │ │ casinoHttp │        │    │
│  │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘        │    │
│  └────────┼──────────────┼──────────────┼──────────────┼───────────────┘    │
│           │              │              │              │                     │
│           ▼              ▼              ▼              ▼                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Route Handlers (app/api/v1/*)                    │    │
│  │  withServerAction → Auth → RLS Context → Service → Response          │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     │                                        │
├─────────────────────────────────────┼────────────────────────────────────────┤
│                              SERVICE LAYER                                   │
│                                     │                                        │
│  ┌──────────────────────────────────┼──────────────────────────────────┐    │
│  │        Service Factories (services/*/index.ts)                       │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │TableContext  │ │ RatingSlip   │ │   Player     │ │   Visit     │ │    │
│  │  │   Service    │ │   Service    │ │   Service    │ │   Service   │ │    │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  └──────────────────────────────────┬──────────────────────────────────┘    │
│                                     │                                        │
├─────────────────────────────────────┼────────────────────────────────────────┤
│                              DATA LAYER                                      │
│                                     │                                        │
│  ┌──────────────────────────────────┼──────────────────────────────────┐    │
│  │              Supabase (PostgreSQL + RLS)                             │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │    │
│  │  │gaming_table│ │rating_slip │ │  player    │ │   visit    │        │    │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component-Route Matrix

| Route | Page Component | Key Child Components |
|-------|----------------|---------------------|
| `/` | `DashboardRedirect` | — |
| `/pit` | `PitDashboardPage` | `StatsBar`, `TableGrid`, `TableDetailView`, `ActiveSlipsPanel` |
| `/pit/tables/[tableId]` | `TableDetailPage` | `TableLayoutTerminal`, `SlipsList`, `DealerInfo` |
| `/players` | `PlayersPage` | `PlayerSearch`, `PlayerList`, `PlayerCard` |
| `/players/[playerId]` | `PlayerDetailPage` | `PlayerProfile`, `VisitHistory`, `LoyaltyBalance` |
| `/visits` | `VisitsPage` | `ActiveVisitsList`, `CheckInDialog` |
| `/visits/[visitId]` | `VisitDetailPage` | `VisitSummary`, `RatingSlipsList` |
| `/loyalty` | `LoyaltyPage` | `BalanceDisplay`, `LedgerTable`, `RewardDialog` |
| `/compliance` | `CompliancePage` | `MTLEntriesList`, `ThresholdBadge`, `AuditNotes` |
| `/settings` | `SettingsPage` | `SettingsNav` |
| `/settings/casino` | `CasinoSettingsPage` | `CasinoForm`, `GamingDayDisplay` |
| `/settings/staff` | `StaffSettingsPage` | `StaffList`, `StaffForm` |
| `/settings/tables` | `TableSettingsPage` | `TableConfigList`, `GameSettingsForm` |

---

## Implementation Checklist

### Phase 1 (Core - Ready)
- [x] Auth routes (`/auth/*`)
- [ ] Players list page (`/players`)
- [ ] Player detail page (`/players/[playerId]`)
- [ ] Settings hub (`/settings`)
- [ ] Casino settings (`/settings/casino`)
- [ ] Staff management (`/settings/staff`)

### Phase 2 (GATE-2 - Current)
- [ ] Pit Dashboard (`/pit`) ← **PRD-006 P0**
- [ ] Table detail (`/pit/tables/[tableId]`)
- [ ] Visits page (`/visits`)
- [ ] Visit detail (`/visits/[visitId]`)
- [ ] Table settings (`/settings/tables`)

### Phase 3 (Rewards & Compliance)
- [ ] Loyalty page (`/loyalty`)
- [ ] Compliance page (`/compliance`)

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `UI-SCAFFOLD-PROPOSITION.md` | Layout patterns, typography, design tokens |
| `SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded context ownership |
| `MVP-ROADMAP.md` | Phase definitions, gate criteria |
| `PRD-006-pit-dashboard.md` | Pit Dashboard requirements |
| `SEC-001-rls-policy-matrix.md` | Role-based access rules |
| `EDGE_TRANSPORT_POLICY.md` | API middleware chain |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | Lead Architect | Initial sitemap derived from SRM, API surface, PRDs |

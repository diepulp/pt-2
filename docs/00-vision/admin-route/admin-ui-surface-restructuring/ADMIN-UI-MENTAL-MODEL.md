---
title: Admin UI Surface Restructuring — Mental Model
date: 2026-03-31
status: Draft
scope: Navigation architecture analysis and restructuring proposal for Admin UI surfaces
method: Codebase verification via 4 parallel explorers (admin routes, sidebar nav, loyalty UI, settings UI) + docs cross-reference
references:
  - MEASUREMENT_SURFACE_ALLOCATION_2026-03-25.md
  - HARDENING_REPORT_2026-03-25.md
  - components/layout/app-sidebar.tsx
  - app/(dashboard)/admin/layout.tsx
---

# Admin UI Surface Restructuring — Mental Model

## 1. Current State

### 1.1 Sidebar Navigation Architecture

The sidebar (`components/layout/app-sidebar.tsx`, lines 36-130) defines **3 semantic groups** with **8 top-level items**. There is **no role-based filtering** — all items are visible to all authenticated users. Access is enforced at the route level only.

```
OPERATIONAL GROUP
├── Pit              → /pit              (floor view, tables, sessions)
├── Cashier          → /cashier          (patron txns, confirmations, drop receipts)
├── Players          → /players          (lookup, history)
├── Loyalty [!]      → /admin/loyalty/rewards   ← MISPLACED
│   ├── Rewards Catalog  → /admin/loyalty/rewards
│   └── Promo Programs   → /admin/loyalty/promo-programs
└── Compliance       → /compliance       (MTL tracking, reports)

ADMINISTRATIVE GROUP
├── Shift Dashboard  → /shift-dashboard  ← NOT ADMIN-ONLY
└── Admin (badge)    → /admin
    ├── Alerts       → /admin/alerts
    ├── Reports      → /admin/reports
    └── Settings     → /admin/settings
        ├── Thresholds  → /admin/settings/thresholds
        ├── Shifts      → /admin/settings/shifts
        └── Valuation   → /admin/settings/valuation

OTHER GROUP
└── Settings [!]     → /settings          ← ALL DEAD PLACEHOLDERS
    ├── General      → /settings           (placeholder)
    ├── Casino       → /settings/casino    (placeholder)
    └── Staff        → /settings/staff     (placeholder)
```

Also exists but NOT in nav:
- `/loyalty` — placeholder page ("Implementation pending Phase 3")

### 1.2 Problems Identified

| # | Problem | Severity | Evidence |
|---|---------|----------|---------|
| **P1** | **Loyalty config in Operational group** but routes to admin-gated paths | High | Regular staff sees Gift icon → clicks → gets redirected by admin layout guard. Config masquerades as daily operations. |
| **P2** | **Two "Settings" nav items** — one dead, one functional | High | `/settings/*` = 3 placeholder pages with zero functionality. `/admin/settings/*` = 3 fully operational forms. Users hit dead pages first. |
| **P3** | **"Other" group exists solely for dead placeholders** | Medium | One group, one item, zero utility. Wastes vertical nav space. |
| **P4** | **Shift Dashboard categorized as Administrative** but used by all roles | Medium | No role gate on `/shift-dashboard`. Every staff member uses it daily. It's operational, not administrative. |
| **P5** | **No role-based nav filtering** — dealers see everything | Low | All 8 items + children visible regardless of role. Access enforced at route level, but nav creates false affordances for non-admin staff. |

---

## 2. Admin Functional Domain Map

The admin surface owns **4 functional domains** across **13 pages**, all gated by the RSC role guard at `app/(dashboard)/admin/layout.tsx` (admin + pit_boss only).

### 2.1 Alerts (Wedge C — Shift Intelligence)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/alerts` | `AlertsPageClient` (252 lines) | Dual-section: baseline anomaly + cash observation alerts |

Features: Severity filter (critical/warn/info), acknowledge workflow (notes + false-positive flag), persist-on-mount + refresh, source badges (Baseline teal / Cash Obs amber).

Components: `alerts-page-client.tsx`, `acknowledge-alert-dialog.tsx`, `alert-detail-card.tsx`, `alert-empty-state.tsx`, `fallback-banner.tsx`, `severity-filter.tsx` — all in `components/admin-alerts/`.

### 2.2 Reports (ADR-039 — Measurement Layer)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/reports` | `MeasurementReportsDashboard` (94 lines) | 4-widget measurement dashboard (RSC + BFF prefetch) |

Widgets:
- Theo Discrepancy Widget (discrepancy rate, total cents, breakdown)
- Audit Correlation Widget (cross-context trace summary)
- Rating Coverage Widget (rated ratio, coverage tier)
- Loyalty Liability Widget (points, dollar value, player count)

Data layer: `services/measurement/` (queries, DTOs, mappers, schemas, factory).

### 2.3 Settings (3 tabs, layout at `admin/settings/layout.tsx`)

| Route | Component | Purpose | Write Access |
|-------|-----------|---------|-------------|
| `/admin/settings/thresholds` | `ThresholdSettingsForm` | 8 alert categories + baseline config | admin only |
| `/admin/settings/shifts` | `ShiftSettingsForm` | Gaming day start time + timezone | admin only (pit_boss: read-only) |
| `/admin/settings/valuation` | `ValuationSettingsForm` | Cents per point rate + effective date | admin only (pit_boss: read-only) |

All forms implement unsaved changes prompt, confirmation dialogs, and dirty state tracking.

### 2.4 Loyalty Configuration (Reward catalog + Promo programs)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/loyalty/rewards` | `RewardListClient` | List with family/status filters, inline active toggle, create dialog |
| `/admin/loyalty/rewards/[id]` | `RewardDetailClient` | Detail editor (name, code, family, fulfillment, pricing/entitlements) |
| `/admin/loyalty/promo-programs` | `ProgramListClient` | List with status filters, create dialog |
| `/admin/loyalty/promo-programs/[id]` | `ProgramDetailClient` | Detail editor (name, status, dates, budget, inventory summary) |

Two reward families: `points_comp` (variable-dollar comps, deducted from balance) and `entitlement` (fixed catalog items — match play, free play).

---

## 3. Loyalty: Two Distinct Concerns

| Concern | Type | Who Uses It | Where It Lives | Where Nav Points |
|---------|------|-------------|----------------|-----------------|
| Reward Catalog | Configuration | Admin/pit_boss | `/admin/loyalty/rewards` | Sidebar "Operational" (**wrong**) |
| Promo Programs | Configuration | Admin/pit_boss | `/admin/loyalty/promo-programs` | Sidebar "Operational" (**wrong**) |
| Valuation Policy | Configuration | Admin only | `/admin/settings/valuation` | Sidebar "Admin > Settings" (correct) |
| Player Loyalty Panel | Operational | All staff | Player dashboard (embedded) | No direct nav (via player context) |
| Issuance Drawer | Operational | All staff | Rating slip context (drawer) | No direct nav (contextual) |
| Redemption Dialog | Operational | All staff | Player dashboard (dialog) | No direct nav (contextual) |
| Liability Widget | Reporting | Admin/pit_boss | `/admin/reports` | Sidebar "Admin > Reports" (correct) |

**The configuration side belongs in Admin. The operational side is already correctly embedded in player/slip contexts — it has no standalone nav need.**

---

## 4. Settings: No Functional Duplication, Just Dead Weight

| Surface | Route | Status | Has Functionality |
|---------|-------|--------|-------------------|
| Sidebar Settings > General | `/settings` | Placeholder | **NO** |
| Sidebar Settings > Casino | `/settings/casino` | Placeholder | **NO** |
| Sidebar Settings > Staff | `/settings/staff` | Placeholder | **NO** |
| Admin > Thresholds | `/admin/settings/thresholds` | Operational | **YES** — 8 categories |
| Admin > Shifts | `/admin/settings/shifts` | Operational | **YES** — gaming day config |
| Admin > Valuation | `/admin/settings/valuation` | Operational | **YES** — cents per point |

There is zero functional duplication. The sidebar settings are 100% dead placeholder pages.

Future settings that exist in schema but lack UI: `promo_require_exact_match`, `promo_allow_anonymous_issuance`.

---

## 5. Load-Bearing Constraints

From Measurement Surface Allocation (2026-03-25) — these are **DO NOT BREAK**:

- `app/(dashboard)/admin/layout.tsx` — security-critical RSC role guard
- Route paths (`/admin/alerts`, `/admin/reports`, `/admin/settings/*`, `/admin/loyalty/*`) — sidebar nav + bookmarks depend on these
- `MeasurementReportsDashboard` BFF prefetch pattern — RSC with dehydration
- Settings tabbed layout at `admin/settings/layout.tsx`
- Alert badge logic (`AdminAlertBadge`) — fires queries only for authorized roles

**Safe to change**: sidebar navigation structure, nav group labels, nav item ordering, and placeholder pages.

---

## 6. Proposed Restructured Navigation

### 6.1 Target State

```
OPERATIONAL
├── Pit              → /pit
├── Cashier          → /cashier
├── Players          → /players
├── Shift Dashboard  → /shift-dashboard       ← MOVED from Administrative
└── Compliance       → /compliance

ADMIN  (badge)
├── Alerts           → /admin/alerts
├── Reports          → /admin/reports
├── Loyalty Config   → /admin/loyalty/rewards  ← MOVED from Operational
│   ├── Rewards      → /admin/loyalty/rewards
│   └── Programs     → /admin/loyalty/promo-programs
└── Settings         → /admin/settings
    ├── Operations        → Casino Ops (gaming day, timezone, bank mode)
    ├── Compliance        → Regulatory thresholds (watchlist, CTR)  ← NEW
    ├── Anomaly Detection → Alert thresholds + baseline config
    └── Loyalty           → Valuation + promo rules

REMOVED:
- "Other" group (entirely)
- /settings, /settings/casino, /settings/staff placeholder pages
- "Administrative" label (renamed to "Admin")
```

**See [SETTINGS-TAXONOMY.md](SETTINGS-TAXONOMY.md) for the complete settings classification and tab mapping.**

### 6.2 Changes Summary

| Change | What | Why | Risk | Scope |
|--------|------|-----|------|-------|
| Move Loyalty from Operational → Admin | Nav item only | Config belongs with admin; routes already under `/admin/loyalty/*` | Low | Sidebar only |
| Move Shift Dashboard from Administrative → Operational | Nav item only | Used by all roles, no role gate, daily operational tool | Low | Sidebar only |
| Remove "Other" group + Settings nav items | Delete nav items | Zero functionality, confuses users | Low | Sidebar only |
| Delete or redirect `/settings/*` placeholder pages | Remove dead pages | No functional loss; prevents users landing on empty pages | Low | 3 page files |
| Rename "Administrative" → "Admin" | Label change | Matches nav item name, more concise | Cosmetic | Sidebar only |
| Restructure Settings tabs (4 tabs) | Rename + add tabs | See SETTINGS-TAXONOMY.md — domain-organized grouping | Medium | Settings layout + forms |

### 6.3 Settings Tab Restructuring

Current ad-hoc tabs are replaced with domain-organized tabs per [SETTINGS-TAXONOMY.md](SETTINGS-TAXONOMY.md):

| Current Tab | New Tab | Changes |
|------------|---------|---------|
| Thresholds | **Anomaly Detection** | Renamed; add sub-group section headers |
| Shifts | **Casino Operations** | Renamed; add `table_bank_mode` selector |
| Valuation | **Loyalty** | Renamed; add promo rule toggles |
| (none) | **Compliance** | New tab for watchlist_floor + ctr_threshold |

Redirect old routes (`/thresholds` → `/anomaly-detection`, `/shifts` → `/operations`, `/valuation` → `/loyalty`).

### 6.4 Future Considerations (Not in Scope)

| Item | Description | Effort |
|------|-------------|--------|
| Role-based nav filtering | Hide Admin group for non-admin/pit_boss roles | Medium — needs `staffRole` in sidebar context |
| `/loyalty` placeholder removal | Delete the unused `/loyalty` placeholder page | Trivial |
| Staff management surface | `/admin/staff` — roster and role admin (not a "settings" concern) | Requires PRD |
| Game Library management | `/admin/games` — post-setup game settings CRUD | Requires PRD |
| Mobile bottom-nav update | `bottom-nav.tsx` points to `/settings` — needs redirect or removal | Low |

---

## 7. Role-Based Access Summary

### Route-Level Enforcement (Current)

| Role | Admin Panel | Shift Dashboard | Pit/Cashier/Players | Compliance | Settings (sidebar) |
|------|-------------|----------------|---------------------|------------|-------------------|
| **admin** | Full access | Full access | Full access | Full access | Placeholder only |
| **pit_boss** | Full access (some read-only) | Full access | Full access | Full access | Placeholder only |
| **dealer/other** | Redirected | Full access | Full access | Full access | Placeholder only |

### Field-Level Restrictions Within Admin

| Setting | admin | pit_boss |
|---------|-------|----------|
| Thresholds | Read/Write | No access (redirected) |
| Shifts (gaming day, timezone) | Read/Write | Read-only (amber warning) |
| Valuation (cents per point) | Read/Write | Read-only (amber warning) |
| Rewards catalog | Read/Write | Read/Write |
| Promo programs | Read/Write | Read/Write |
| Alert acknowledgment | Full | Full |

---

## 8. Component Inventory

### Admin-Specific Components (22 total)

| Area | Count | Location |
|------|-------|----------|
| Alert management | 6 | `components/admin-alerts/` |
| Settings forms | 4 | `components/admin/` |
| Loyalty rewards | 5 | `components/admin/loyalty/rewards/` |
| Loyalty promo programs | 4 | `components/admin/loyalty/promo-programs/` |
| Navigation | 3 | `components/layout/` (sidebar, nav-main, alert-badge) |

### Key Files

| File | Purpose |
|------|---------|
| `components/layout/app-sidebar.tsx` | Nav group definitions (PRIMARY EDIT TARGET) |
| `components/layout/nav-main.tsx` | Nav group renderer |
| `components/layout/admin-alert-badge.tsx` | Alert count badge (role-gated) |
| `components/layout/bottom-nav.tsx` | Mobile bottom nav (references `/settings`) |
| `app/(dashboard)/admin/layout.tsx` | RSC role guard (DO NOT MODIFY) |
| `app/(dashboard)/admin/settings/layout.tsx` | Tabbed settings layout |
| `app/(dashboard)/settings/page.tsx` | Dead placeholder (DELETE CANDIDATE) |
| `app/(dashboard)/settings/casino/page.tsx` | Dead placeholder (DELETE CANDIDATE) |
| `app/(dashboard)/settings/staff/page.tsx` | Dead placeholder (DELETE CANDIDATE) |

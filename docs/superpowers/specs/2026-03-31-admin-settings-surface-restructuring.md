---
title: Admin Settings Surface Restructuring
date: 2026-03-31
type: build-pipeline-intake
status: approved
scope: Refactor existing admin UI surfaces onto domain-organized settings taxonomy
references:
  - docs/00-vision/admin-route/admin-ui-surface-restructuring/ADMIN-UI-MENTAL-MODEL.md
  - docs/00-vision/admin-route/admin-ui-surface-restructuring/SETTINGS-TAXONOMY.md
pattern-baseline: shadcnblocks Admin Kit (https://shadcnblocks-admin.vercel.app/settings)
delivery: single feature branch, single PR
---

# Admin Settings Surface Restructuring

## 1. Problem

The admin UI surface has three structural problems:

1. **Sidebar navigation misalignment** — Loyalty config sits in the "Operational" group but routes to admin-gated paths. Shift Dashboard sits in "Administrative" but is used by all roles. A dead "Other > Settings" group points to 3 placeholder pages with zero functionality.

2. **Settings tabs organized ad-hoc** — Three tabs (Thresholds, Shifts, Valuation) mix unrelated domains: statistical model tuning, casino temporal config, and loyalty economics. Added as features shipped, never reorganized.

3. **No visual taxonomy** — The threshold form renders 8 alert categories + baseline as a flat list with no grouping. Users can't distinguish financial anomalies from operational alerts from promotional thresholds.

## 2. Scope

### In Scope

- Sidebar navigation restructuring (move items, remove dead group)
- Settings tab rename + re-route with redirects for old URLs
- Settings layout upgrade to shadcnblocks admin kit pattern
- Anomaly Detection tab sub-grouping with section headers
- Loyalty tab consolidation with deferred-surface placeholders
- Dead placeholder page cleanup + catch-all redirect
- Mobile bottom-nav update

### Out of Scope (Deferred to Backlog)

| Item | Reason | Prerequisite |
|------|--------|-------------|
| Compliance tab (watchlist_floor, ctr_threshold) | New form — no existing UI to refactor | Backend fields exist; needs form + validation |
| Earn config form (points_per_theo, multiplier, rounding) | `PUT /api/v1/rewards/earn-config` wiring unverified | API verification + form build |
| Promo rules toggles (exact_match, anonymous_issuance) | No existing form; fields not in `updateCasinoSettingsSchema` | Schema update + form build |
| Role-based nav filtering | Medium effort; needs staffRole in sidebar context | Separate PRD |
| Game Library management | Post-setup game CRUD — catalog admin, not settings | Separate PRD |
| Staff management surface | Identity admin, not a settings concern | Separate PRD |

## 3. Pattern Baseline: shadcnblocks Admin Kit

Mined from `https://shadcnblocks-admin.vercel.app/settings`. The settings surface uses:

| Element | Pattern | PT-2 Adoption |
|---------|---------|---------------|
| Page header | Fixed `# Settings` + subtitle across all tabs | Adopt — update subtitle to reflect domain taxonomy |
| Tab bar | Horizontal route-based tabs (each tab = URL path) | Adopt — PT-2 already uses this pattern; rename + reorder |
| Section header | `### Tab Title` + description line per tab | Adopt — add to each tab page |
| Form body | Mixed per domain (inputs, selects, toggles, cards, radio groups) | Keep — PT-2 forms already use appropriate components |
| Sidebar mirror | Settings sub-items listed under parent group in sidebar | Adopt — admin settings children already in sidebar |

## 4. Target State

### 4.1 Sidebar Navigation

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
    ├── Casino Operations     → /admin/settings/operations
    ├── Anomaly Detection     → /admin/settings/anomaly-detection
    └── Loyalty               → /admin/settings/loyalty
```

### 4.2 Settings Tab Structure

```
/admin/settings/
├── operations           → Gaming Day + Timezone (existing ShiftSettingsForm)
├── anomaly-detection    → 8 alert categories + baseline, sub-grouped (existing ThresholdSettingsForm)
└── loyalty              → Point Valuation (existing ValuationSettingsForm) + deferred placeholders
```

Default redirect: `/admin/settings` → `/admin/settings/operations`

### 4.3 Anomaly Detection Sub-Groups

The existing flat list of 8 threshold category cards is reorganized with section headers:

```
Baseline Engine Configuration
  └── Window (days), Method, Min History (days)

Financial Anomalies
  ├── Drop Anomaly .............. [toggle] mad_multiplier, fallback_%
  └── Hold Deviation ............ [toggle, default OFF] deviation_pp, extremes

Operational Alerts
  ├── Table Idle ................ [toggle] warn_min, critical_min
  ├── Slip Duration ............. [toggle] warn_hrs, critical_hrs
  └── Pause Duration ............ [toggle] warn_min

Promotional Anomalies
  ├── Promo Issuance Spike ...... [toggle] mad_multiplier, fallback_%
  ├── Promo Void Rate ........... [toggle] warn_%
  └── Outstanding Aging ......... [toggle] max_hrs, max_$, max_count
```

No data model changes. No save behavior changes. `ThresholdCategoryCard` component unchanged. Section headers added between card groups.

### 4.4 Loyalty Tab Layout

| Section | Content | Status |
|---------|---------|--------|
| Point Redemption | Existing `ValuationSettingsForm` (cents_per_point + effective_date) | Exists — move as-is |
| Point Earning | Muted placeholder card: "Earn rate configuration — available in a future release" | Deferred indicator |
| Promo Rules | Muted placeholder card: "Promotional rules — available in a future release" | Deferred indicator |

Deferred placeholders use a consistent pattern: muted border, `text-muted-foreground`, description text, no form fields. Signals intentional taxonomy, not missing functionality.

## 5. Workstreams

### WS1 — Sidebar Navigation Restructuring

**Touches**: `components/layout/app-sidebar.tsx`, `components/layout/bottom-nav.tsx`

| # | Task | Detail |
|---|------|--------|
| 1.1 | Move Loyalty nav item from Operational → Admin group | Nav config array change. Icon (Gift) and children unchanged. |
| 1.2 | Move Shift Dashboard from Administrative → Operational group | Nav config array change. Place after Compliance. |
| 1.3 | Remove "Other" group entirely | Delete group + Settings nav item from config array. |
| 1.4 | Update mobile bottom-nav | Remove `/settings` entry or replace with `/admin/settings/operations`. |
| 1.5 | Rename "Administrative" group label → "Admin" | String change. |

**Dependencies**: None (independent).

### WS2 — Dead Page Cleanup

**Touches**: `app/(dashboard)/settings/` directory

| # | Task | Detail |
|---|------|--------|
| 2.1 | Delete `app/(dashboard)/settings/page.tsx` | Placeholder — zero functionality. |
| 2.2 | Delete `app/(dashboard)/settings/casino/page.tsx` | Placeholder — zero functionality. |
| 2.3 | Delete `app/(dashboard)/settings/staff/page.tsx` | Placeholder — zero functionality. |
| 2.4 | Add catch-all redirect at `/settings` → `/admin/settings/operations` | `app/(dashboard)/settings/[[...slug]]/page.tsx` with `redirect()`. Preserves bookmarks. |

**Dependencies**: None (independent).

### WS3 — Settings Tab Rename + Route Migration

**Touches**: `app/(dashboard)/admin/settings/` directory

| # | Task | Detail |
|---|------|--------|
| 3.1 | Create `admin/settings/operations/page.tsx` | Move content from `shifts/page.tsx`. RSC wrapper for `ShiftSettingsForm`. |
| 3.2 | Create `admin/settings/anomaly-detection/page.tsx` | Move content from `thresholds/page.tsx`. RSC wrapper for `ThresholdSettingsForm`. |
| 3.3 | Create `admin/settings/loyalty/page.tsx` | Move content from `valuation/page.tsx`. RSC wrapper for loyalty tab (§4.4). |
| 3.4 | Convert old routes to redirects | `thresholds/page.tsx` → redirect to `/admin/settings/anomaly-detection`. Same for `shifts` → `operations`, `valuation` → `loyalty`. |
| 3.5 | Update `admin/settings/layout.tsx` tab bar | Rename labels, update hrefs, reorder: Operations, Anomaly Detection, Loyalty. |
| 3.6 | Update `admin/settings/page.tsx` default redirect | `/admin/settings` → `/admin/settings/operations` (was `/admin/settings/thresholds`). |
| 3.7 | Update sidebar Settings children hrefs | Within Admin > Settings children: rename labels + update hrefs to operations, anomaly-detection, loyalty. (WS1 handles group-level moves; this handles Settings sub-item labels/routes.) |

**Dependencies**: None (independent of WS1/WS2).

### WS4 — Settings Layout Upgrade

**Touches**: `admin/settings/layout.tsx`, each tab page

| # | Task | Detail |
|---|------|--------|
| 4.1 | Update page header subtitle | "Configure casino operations, anomaly detection, and loyalty economics." |
| 4.2 | Add section header + description to each tab page | Per shadcnblocks pattern. E.g., Casino Operations: "Foundational parameters that define how the casino runs." |

**Dependencies**: WS3 (needs new route structure).

### WS5 — Anomaly Detection Sub-Grouping

**Touches**: `components/admin/threshold-settings-form.tsx`

| # | Task | Detail |
|---|------|--------|
| 5.1 | Add section headers between card groups | `<h4>` + `<p>` description between Baseline, Financial, Operational, Promotional groups. |
| 5.2 | Reorder cards to match taxonomy | Baseline first, then Financial, Operational, Promotional. Verify current render order matches. |

**Dependencies**: WS3 (form lives in renamed tab). Can develop on same branch.

### WS6 — Loyalty Tab Consolidation

**Touches**: `admin/settings/loyalty/page.tsx`

| # | Task | Detail |
|---|------|--------|
| 6.1 | Render existing `ValuationSettingsForm` as "Point Redemption" section | Add section header. Form component unchanged. |
| 6.2 | Add "Point Earning" deferred placeholder card | Muted card, description: "Earn rate configuration — available in a future release." |
| 6.3 | Add "Promo Rules" deferred placeholder card | Muted card, description: "Promotional rules — available in a future release." |

**Dependencies**: WS3 (route must exist). Can develop on same branch.

## 6. Workstream Dependency Graph

```
WS1 (Sidebar Nav) ─────────────── independent ─┐
WS2 (Dead Page Cleanup) ────────── independent ─┼── can run in parallel
WS3 (Tab Rename + Routes) ──────── independent ─┘
                                        │
                                        ▼
                               WS3 complete gate
                                        │
                            ┌───────────┼───────────┐
                            ▼           ▼           ▼
                     WS4 (Layout)  WS5 (Sub-Group) WS6 (Loyalty)
                            │           │           │
                            └───────────┼───────────┘
                                        ▼
                                   PR ready
```

WS1 + WS2 + WS3 are parallelizable. WS4/WS5/WS6 depend on WS3 but are independent of each other.

**Delivery**: Single feature branch. Single PR. Estimated ~6-10 files touched, primarily config/layout/routing with minimal component changes.

## 7. Load-Bearing Constraints

These MUST NOT be modified:

| Constraint | File | Why |
|-----------|------|-----|
| Admin role guard | `app/(dashboard)/admin/layout.tsx` | Security-critical RSC role guard |
| Settings form internals | `threshold-settings-form.tsx`, `shift-settings-form.tsx`, `valuation-settings-form.tsx` | Form logic, validation, save behavior unchanged |
| `ThresholdCategoryCard` component | `components/admin/threshold-category-card.tsx` | Reusable card — only context around it changes |
| Alert badge logic | `components/layout/admin-alert-badge.tsx` | Role-gated query, fires only for admin/pit_boss |
| BFF prefetch patterns | `admin/reports/page.tsx` | RSC + dehydration pattern |
| API endpoints | `PATCH /api/v1/casino/settings`, `GET/PATCH /api/v1/loyalty/valuation-policy` | Zero backend changes |

## 8. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | Sidebar shows Loyalty under Admin group, not Operational | Visual inspection |
| AC-2 | Sidebar shows Shift Dashboard under Operational, not Administrative | Visual inspection |
| AC-3 | "Other" group no longer exists in sidebar | Visual inspection |
| AC-4 | `/settings` redirects to `/admin/settings/operations` | Navigate to `/settings`, verify redirect |
| AC-5 | `/admin/settings/thresholds` redirects to `/admin/settings/anomaly-detection` | Navigate, verify redirect |
| AC-6 | `/admin/settings/shifts` redirects to `/admin/settings/operations` | Navigate, verify redirect |
| AC-7 | `/admin/settings/valuation` redirects to `/admin/settings/loyalty` | Navigate, verify redirect |
| AC-8 | Settings tab bar shows: Casino Operations, Anomaly Detection, Loyalty | Visual inspection |
| AC-9 | Each settings tab has section header + description per shadcnblocks pattern | Visual inspection |
| AC-10 | Anomaly Detection tab shows 4 sub-group section headers | Visual inspection |
| AC-11 | Loyalty tab shows valuation form + 2 deferred placeholder cards | Visual inspection |
| AC-12 | All existing settings forms save correctly (no regression) | Manual test: modify threshold, shift, valuation — verify save + reload |
| AC-13 | Mobile bottom-nav no longer references `/settings` | Inspect on mobile viewport |
| AC-14 | Admin role guard still blocks non-admin/non-pit_boss users | Navigate as dealer role, verify redirect |
| AC-15 | `npm run type-check` passes with 0 errors | CI gate |
| AC-16 | `npm run lint` passes with 0 errors | CI gate |

## 9. Files Inventory

### Modified

| File | WS | Change |
|------|-----|--------|
| `components/layout/app-sidebar.tsx` | WS1 | Nav group restructuring |
| `components/layout/bottom-nav.tsx` | WS1 | Remove/update `/settings` reference |
| `app/(dashboard)/admin/settings/layout.tsx` | WS3, WS4 | Tab rename + reorder, subtitle update |
| `app/(dashboard)/admin/settings/page.tsx` | WS3 | Update default redirect target |
| `components/admin/threshold-settings-form.tsx` | WS5 | Add section headers between card groups |

### Created

| File | WS | Purpose |
|------|-----|---------|
| `app/(dashboard)/admin/settings/operations/page.tsx` | WS3 | New route — renders ShiftSettingsForm |
| `app/(dashboard)/admin/settings/anomaly-detection/page.tsx` | WS3 | New route — renders ThresholdSettingsForm |
| `app/(dashboard)/admin/settings/loyalty/page.tsx` | WS3, WS6 | New route — renders ValuationSettingsForm + deferred placeholders |
| `app/(dashboard)/settings/[[...slug]]/page.tsx` | WS2 | Catch-all redirect to admin settings |

### Deleted

| File | WS | Reason |
|------|-----|--------|
| `app/(dashboard)/settings/page.tsx` | WS2 | Dead placeholder |
| `app/(dashboard)/settings/casino/page.tsx` | WS2 | Dead placeholder |
| `app/(dashboard)/settings/staff/page.tsx` | WS2 | Dead placeholder |

### Converted to Redirects

| File | WS | Redirect Target |
|------|-----|----------------|
| `app/(dashboard)/admin/settings/thresholds/page.tsx` | WS3 | `/admin/settings/anomaly-detection` |
| `app/(dashboard)/admin/settings/shifts/page.tsx` | WS3 | `/admin/settings/operations` |
| `app/(dashboard)/admin/settings/valuation/page.tsx` | WS3 | `/admin/settings/loyalty` |

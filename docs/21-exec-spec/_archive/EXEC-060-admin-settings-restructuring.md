---
# EXECUTION-SPEC Frontmatter
# Generated from: docs/superpowers/specs/2026-03-31-admin-settings-surface-restructuring.md

prd: SPEC-ADMIN-SETTINGS
prd_title: "Admin Settings Surface Restructuring"
service: AdminUI
mvp_phase: 1

workstreams:
  WS1:
    name: Sidebar Navigation Restructuring
    description: Move Loyalty to Admin group, Shift Dashboard to Operational, remove Other group, update mobile bottom-nav
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - components/layout/app-sidebar.tsx
      - components/layout/bottom-nav.tsx
    gate: type-check
    estimated_complexity: low

  WS2:
    name: Dead Page Cleanup
    description: Delete 3 placeholder pages under /settings, add catch-all redirect to /admin/settings/operations
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - app/(dashboard)/settings/[[...slug]]/page.tsx
    gate: type-check
    estimated_complexity: low

  WS3:
    name: Settings Tab Rename + Route Migration
    description: Create operations/anomaly-detection/loyalty route pages, convert old routes to redirects, update layout tab bar and sidebar children hrefs
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - app/(dashboard)/admin/settings/operations/page.tsx
      - app/(dashboard)/admin/settings/anomaly-detection/page.tsx
      - app/(dashboard)/admin/settings/loyalty/page.tsx
      - app/(dashboard)/admin/settings/thresholds/page.tsx
      - app/(dashboard)/admin/settings/shifts/page.tsx
      - app/(dashboard)/admin/settings/valuation/page.tsx
      - app/(dashboard)/admin/settings/layout.tsx
      - app/(dashboard)/admin/settings/page.tsx
      - components/layout/app-sidebar.tsx
    gate: type-check
    estimated_complexity: medium

  WS4:
    name: Settings Layout Upgrade
    description: Update page header subtitle, add section header + description to each tab page per shadcnblocks pattern
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS3]
    outputs:
      - app/(dashboard)/admin/settings/layout.tsx
      - app/(dashboard)/admin/settings/operations/page.tsx
      - app/(dashboard)/admin/settings/anomaly-detection/page.tsx
      - app/(dashboard)/admin/settings/loyalty/page.tsx
    gate: lint
    estimated_complexity: low

  WS5:
    name: Anomaly Detection Sub-Grouping
    description: Add section headers between threshold card groups (Baseline, Financial, Operational, Promotional) and reorder cards to match taxonomy
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS3]
    outputs:
      - components/admin/threshold-settings-form.tsx
    gate: type-check
    estimated_complexity: low

  WS6:
    name: Loyalty Tab Consolidation
    description: Render ValuationSettingsForm as Point Redemption section, add Point Earning and Promo Rules deferred placeholder cards
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS3]
    outputs:
      - app/(dashboard)/admin/settings/loyalty/page.tsx
    gate: type-check
    estimated_complexity: low

execution_phases:
  - name: Phase 1 - Independent Restructuring
    parallel: [WS1, WS2, WS3]
    gates: [type-check]

  - name: Phase 2 - Dependent Polish
    parallel: [WS4, WS5, WS6]
    gates: [type-check, lint, build]

gates:
  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0"

  lint:
    command: npm run lint
    success_criteria: "Exit code 0, no errors"

  build:
    command: npm run build
    success_criteria: "Exit code 0, no build errors"

external_dependencies: []

risks:
  - risk: "Sidebar nav config structure may differ from expected shape"
    mitigation: "Read app-sidebar.tsx navGroups array before modifying — verified in spec"
  - risk: "Old bookmark URLs break"
    mitigation: "All old routes converted to redirects, catch-all at /settings"

write_path_classification: none
---

# EXECUTION-SPEC: EXEC-060 - Admin Settings Surface Restructuring

## Overview

Reorganize the admin UI settings surface from ad-hoc tab names (Thresholds/Shifts/Valuation) to a domain-organized taxonomy (Casino Operations/Anomaly Detection/Loyalty). Restructure sidebar navigation, clean up dead placeholder pages, and add visual sub-grouping to the anomaly detection form.

**Zero backend changes. Zero data model changes. All existing form save behavior unchanged.**

## Scope

- **In Scope**: Sidebar nav moves, settings tab rename + re-route with redirects, layout upgrade to shadcnblocks pattern, anomaly detection sub-grouping, loyalty tab with deferred placeholders, dead page cleanup, mobile bottom-nav update
- **Out of Scope**: Compliance tab, earn config form, promo rules toggles, role-based nav filtering, game library, staff management

## Architecture Context

Pure frontend restructuring. No bounded context crossings, no service layer changes, no API changes. All work is in `components/layout/`, `app/(dashboard)/admin/settings/`, and `app/(dashboard)/settings/`.

### Load-Bearing Constraints (DO NOT MODIFY)

| Constraint | File |
|-----------|------|
| Admin role guard | `app/(dashboard)/admin/layout.tsx` |
| ThresholdSettingsForm internals | `components/admin/threshold-settings-form.tsx` (form logic/validation/save) |
| ShiftSettingsForm internals | `components/admin/shift-settings-form.tsx` |
| ValuationSettingsForm internals | `components/admin/valuation-settings-form.tsx` |
| ThresholdCategoryCard component | `components/admin/threshold-category-card.tsx` |
| Alert badge logic | `components/layout/admin-alert-badge.tsx` |
| API endpoints | `PATCH /api/v1/casino/settings`, `GET/PATCH /api/v1/loyalty/valuation-policy` |

## Workstream Details

### WS1: Sidebar Navigation Restructuring

**Purpose**: Fix semantic misalignment — Loyalty belongs under Admin, Shift Dashboard belongs under Operational, "Other" group is dead weight.

**Files**: `components/layout/app-sidebar.tsx`, `components/layout/bottom-nav.tsx`

**Tasks**:
1. Move Loyalty nav item from `Operational` group → `Admin` group (under Admin parent, as sibling to Alerts/Reports/Settings)
2. Move Shift Dashboard from `Administrative` group → `Operational` group (after Compliance)
3. Remove `Other` group entirely (delete group + Settings nav item)
4. Rename `Administrative` group label → `Admin`
5. Update `bottom-nav.tsx`: replace `/settings` entry with `/admin/settings/operations`

**Acceptance Criteria**:
- [ ] Sidebar: Loyalty under Admin group, not Operational
- [ ] Sidebar: Shift Dashboard under Operational, not Administrative
- [ ] "Other" group gone
- [ ] Mobile bottom-nav no longer references `/settings`

### WS2: Dead Page Cleanup

**Purpose**: Remove 3 placeholder pages with zero functionality and add catch-all redirect.

**Files**: `app/(dashboard)/settings/` directory

**Tasks**:
1. Delete `app/(dashboard)/settings/page.tsx` (placeholder)
2. Delete `app/(dashboard)/settings/casino/page.tsx` (placeholder)
3. Delete `app/(dashboard)/settings/staff/page.tsx` (placeholder)
4. Create `app/(dashboard)/settings/[[...slug]]/page.tsx` with `redirect('/admin/settings/operations')`

**Acceptance Criteria**:
- [ ] `/settings` redirects to `/admin/settings/operations`
- [ ] `/settings/casino` redirects to `/admin/settings/operations`
- [ ] `/settings/staff` redirects to `/admin/settings/operations`

### WS3: Settings Tab Rename + Route Migration

**Purpose**: Rename tabs from technical names to domain taxonomy, create new routes, preserve old URLs via redirects.

**Files**: `app/(dashboard)/admin/settings/` directory, `components/layout/app-sidebar.tsx`

**Tasks**:
1. Create `admin/settings/operations/page.tsx` — RSC wrapper rendering `ShiftSettingsForm`
2. Create `admin/settings/anomaly-detection/page.tsx` — RSC wrapper rendering `ThresholdSettingsForm`
3. Create `admin/settings/loyalty/page.tsx` — RSC wrapper rendering `ValuationSettingsForm` (WS6 will enhance)
4. Convert `thresholds/page.tsx` to redirect → `/admin/settings/anomaly-detection`
5. Convert `shifts/page.tsx` to redirect → `/admin/settings/operations`
6. Convert `valuation/page.tsx` to redirect → `/admin/settings/loyalty`
7. Update `admin/settings/layout.tsx` tab bar: rename labels, update hrefs, reorder (Operations, Anomaly Detection, Loyalty)
8. Update `admin/settings/page.tsx` default redirect → `/admin/settings/operations`
9. Update sidebar Settings children hrefs in `app-sidebar.tsx`: labels → Casino Operations, Anomaly Detection, Loyalty; hrefs → operations, anomaly-detection, loyalty

**Acceptance Criteria**:
- [ ] Tab bar shows: Casino Operations, Anomaly Detection, Loyalty
- [ ] Old URLs redirect correctly (thresholds→anomaly-detection, shifts→operations, valuation→loyalty)
- [ ] `/admin/settings` redirects to `/admin/settings/operations`
- [ ] Sidebar Settings children match new routes

### WS4: Settings Layout Upgrade

**Purpose**: Apply shadcnblocks admin kit pattern — updated subtitle, section headers per tab.

**Files**: `admin/settings/layout.tsx`, each tab page

**Tasks**:
1. Update layout subtitle: "Configure casino operations, anomaly detection, and loyalty economics."
2. Add section header + description to operations page: "Casino Operations" / "Foundational parameters that define how the casino day operates."
3. Add section header + description to anomaly-detection page: "Anomaly Detection" / "Statistical thresholds for automated anomaly detection and alerting."
4. Add section header + description to loyalty page: "Loyalty" / "Point valuation, earning rates, and promotional economics."

**Acceptance Criteria**:
- [ ] Each settings tab has section header + description per shadcnblocks pattern

### WS5: Anomaly Detection Sub-Grouping

**Purpose**: Add visual taxonomy to the flat list of 8 threshold category cards.

**File**: `components/admin/threshold-settings-form.tsx`

**Tasks**:
1. Add section headers between card groups using `<h4>` + `<p>` description:
   - "Baseline Engine Configuration" (baseline card at top)
   - "Financial Anomalies" (drop_anomaly, hold_deviation)
   - "Operational Alerts" (table_idle, slip_duration, pause_duration)
   - "Promotional Anomalies" (promo_issuance_spike, promo_void_rate, outstanding_aging)
2. Reorder CATEGORIES array to match taxonomy order (currently interleaved)

**Implementation Note**: The `ThresholdCategoryCard` component is a load-bearing constraint — do NOT modify it. Only add section headers between the cards and reorder the CATEGORIES array.

**Acceptance Criteria**:
- [ ] 4 section headers visible (Baseline, Financial, Operational, Promotional)
- [ ] Cards grouped under correct section headers
- [ ] All 8 categories + baseline still render and save correctly

### WS6: Loyalty Tab Consolidation

**Purpose**: Create the loyalty tab with existing valuation form + deferred surface placeholders.

**File**: `app/(dashboard)/admin/settings/loyalty/page.tsx`

**Tasks**:
1. Render `ValuationSettingsForm` under "Point Redemption" section header
2. Add "Point Earning" deferred placeholder card: muted border, `text-muted-foreground`, "Earn rate configuration — available in a future release"
3. Add "Promo Rules" deferred placeholder card: muted border, `text-muted-foreground`, "Promotional rules — available in a future release"

**Deferred Placeholder Pattern**:
```tsx
<Card className="border-dashed">
  <CardHeader>
    <CardTitle className="text-base text-muted-foreground">{title}</CardTitle>
    <p className="text-sm text-muted-foreground">{description}</p>
  </CardHeader>
</Card>
```

**Acceptance Criteria**:
- [ ] Valuation form renders under "Point Redemption" section
- [ ] 2 deferred placeholder cards visible
- [ ] Placeholders use muted/dashed styling (not interactive)

## Definition of Done

- [ ] All 6 workstreams complete
- [ ] All gates pass (type-check, lint, build)
- [ ] All 16 acceptance criteria from spec verified
- [ ] No regressions: existing settings forms save correctly
- [ ] Admin role guard untouched
- [ ] All old URLs redirect to new locations

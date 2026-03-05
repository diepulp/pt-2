---
prd: PRD-042
prd_title: "Admin Settings Pages — Alert Thresholds & Shift Configuration"
service: CasinoService
mvp_phase: 5

workstreams:
  WS0:
    name: Backend Schema Wiring
    description: Extend updateCasinoSettingsSchema, DTOs, SETTINGS_SELECT, HTTP fetcher to accept alert_thresholds
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - services/casino/schemas.ts
      - services/casino/dtos.ts
      - services/casino/http.ts
      - app/api/v1/casino/settings/route.ts
      - services/casino/__tests__/settings-route.test.ts
    gate: type-check
    estimated_complexity: low

  WS1:
    name: Settings Layout & Shared Infrastructure
    description: Admin layout with role guard, settings sub-nav, useUnsavedChangesPrompt hook, Switch component install
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS0]
    outputs:
      - app/(dashboard)/admin/layout.tsx
      - app/(dashboard)/admin/page.tsx
      - app/(dashboard)/admin/settings/layout.tsx
      - app/(dashboard)/admin/settings/page.tsx
      - hooks/use-unsaved-changes-prompt.ts
      - components/ui/switch.tsx
    gate: type-check
    estimated_complexity: medium

  WS2:
    name: Thresholds Page
    description: Alert threshold configuration page with 8 category cards, toggles, Zod validation, JSONB read-merge-write
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - app/(dashboard)/admin/settings/thresholds/page.tsx
      - components/admin/threshold-settings-form.tsx
      - components/admin/threshold-category-card.tsx
    gate: type-check
    estimated_complexity: high

  WS3:
    name: Shifts Page
    description: Gaming day start time picker, timezone selector, visual preview, impact warning
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - app/(dashboard)/admin/settings/shifts/page.tsx
      - components/admin/shift-settings-form.tsx
    gate: type-check
    estimated_complexity: medium

  WS4:
    name: E2E Tests
    description: Happy-path Playwright tests for threshold toggle+save and settings navigation
    executor: e2e-testing
    executor_type: skill
    depends_on: [WS2, WS3]
    outputs:
      - e2e/workflows/admin-settings.spec.ts
    gate: test-pass
    estimated_complexity: medium

execution_phases:
  - name: Phase 1 - Backend Wiring
    parallel: [WS0]
    gates: [type-check]

  - name: Phase 2 - Layout & Shared
    parallel: [WS1]
    gates: [type-check]

  - name: Phase 3 - Settings Pages
    parallel: [WS2, WS3]
    gates: [type-check]

  - name: Phase 4 - E2E Tests
    parallel: [WS4]
    gates: [test-pass]

gates:
  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0"
  lint:
    command: npm run lint
    success_criteria: "Exit code 0, no errors, no warnings"
  test-pass:
    command: npx playwright test e2e/workflows/admin-settings.spec.ts
    success_criteria: "All tests pass"
  build:
    command: npm run build
    success_criteria: "Exit code 0"

risks:
  - risk: "JSONB partial update — Supabase replaces entire column"
    mitigation: "UI reads full JSONB, merges changes client-side, sends complete object"
  - risk: "Gaming day change mid-shift affects active sessions"
    mitigation: "Confirmation dialog with explicit active-session impact warning"
---

# EXEC-042 — Admin Settings Pages

## Overview

Build two admin settings pages (`/admin/settings/thresholds` and `/admin/settings/shifts`) within the admin route group. Extends the existing `PATCH /api/v1/casino/settings` route to accept `alert_thresholds` JSONB, then delivers the frontend UI for both pages.

**No new migrations.** All database columns exist. No new RLS policies needed.

**PRD-040 has NOT shipped** — WS1 creates the admin layout + role guard.

---

## WS0: Backend Schema Wiring

**Executor**: `backend-service-builder`
**Bounded Context**: casino
**Dependencies**: none
**Estimated size**: ~40 lines changed across 4 files + ~80 lines unit tests

### Outputs

#### 1. `services/casino/schemas.ts` — Extend updateCasinoSettingsSchema (line 31)

Add `alert_thresholds` to the existing schema:

```typescript
// Line 31-52: add alert_thresholds as 5th field
export const updateCasinoSettingsSchema = z.object({
  gaming_day_start_time: z.string().regex(/* existing */).optional(),
  timezone: z.string().min(1).max(64).optional(),
  watchlist_floor: z.number().positive().optional(),
  ctr_threshold: z.number().positive().optional(),
  alert_thresholds: updateAlertThresholdsSchema.optional(), // NEW
});
```

`UpdateCasinoSettingsInput` type export auto-recomputes via `z.infer`.

#### 2. `services/casino/dtos.ts` — Extend DTOs

**CasinoSettingsDTO** (line 49-57): Add `updated_at` to Pick fields for "last saved" display:

```typescript
export type CasinoSettingsDTO = Pick<
  CasinoSettingsRow,
  'id' | 'casino_id' | 'gaming_day_start_time' | 'timezone'
  | 'watchlist_floor' | 'ctr_threshold' | 'updated_at'  // ADD updated_at
>;
```

**UpdateCasinoSettingsDTO** (line 60-65): Add `alert_thresholds` intersection (JSONB → use manual DTO type):

```typescript
export type UpdateCasinoSettingsDTO = Partial<
  Pick<CasinoSettingsUpdate, 'gaming_day_start_time' | 'timezone' | 'watchlist_floor' | 'ctr_threshold'>
> & {
  alert_thresholds?: AlertThresholdsDTO;  // JSONB column — manual type
};
```

#### 3. `app/api/v1/casino/settings/route.ts` — Extend SETTINGS_SELECT and return types

**SETTINGS_SELECT** (line 31-32): Add `alert_thresholds, updated_at` and promo fields to align with `CasinoSettingsWithAlertsDTO`:

```typescript
const SETTINGS_SELECT =
  'id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold, alert_thresholds, updated_at, promo_require_exact_match, promo_allow_anonymous_issuance';
```

> **DA P1-2/P1-5 fix**: `CasinoSettingsWithAlertsDTO` includes `promo_require_exact_match` and `promo_allow_anonymous_issuance`. The select string MUST include these columns — otherwise the `as CasinoSettingsWithAlertsDTO` cast lies at runtime (fields would be `undefined` despite the type claiming they exist).

**Import**: Replace `CasinoSettingsDTO` with `CasinoSettingsWithAlertsDTO` (line 26-28).

**GET handler** (line 72): Cast to `CasinoSettingsWithAlertsDTO`.

**PATCH handler** (line 160): Cast to `CasinoSettingsWithAlertsDTO`.

**Role enforcement**: Already correct — existing defense-in-depth at lines 122-139:
- `admin + pit_boss` → allowed for all non-temporal fields (including `alert_thresholds`)
- `admin only` → `gaming_day_start_time`, `timezone`
- No new role logic needed.

#### 4. `services/casino/http.ts` — Update fetcher types

**getCasinoSettings** (line 135): Return `CasinoSettingsWithAlertsDTO`.

**updateCasinoSettings** (line 146-157): Input `UpdateCasinoSettingsDTO`, return `CasinoSettingsWithAlertsDTO`.

**Import**: Replace `CasinoSettingsDTO` with `CasinoSettingsWithAlertsDTO`.

### Unit Tests

**Location**: `services/casino/__tests__/settings-route.test.ts`

| Test | Description |
|------|-------------|
| PATCH with `alert_thresholds` persists | Send `{ alert_thresholds: { table_idle: { warn_minutes: 30 } } }`, verify response includes updated JSONB |
| PATCH without `alert_thresholds` unchanged | Send `{ watchlist_floor: 500000 }`, verify `alert_thresholds` unchanged |
| pit_boss cannot update temporal fields | Auth as pit_boss, PATCH `{ gaming_day_start_time: '04:00' }` → 403 |
| pit_boss CAN update thresholds | Auth as pit_boss, PATCH `{ alert_thresholds: {...} }` → 200 |
| GET when `alert_thresholds` is NULL | Fresh casino with null JSONB → response returns `alert_thresholds: null` (frontend applies defaults via `alertThresholdsSchema.parse({})`) |
| Unknown key preservation | PATCH with `alert_thresholds` containing extra key `{ _future_field: true }` → subsequent GET returns the extra key intact |

### Validation Gate

- `npm run type-check` → exit 0

---

## WS1: Settings Layout & Shared Infrastructure

**Executor**: `frontend-design-pt-2`
**Bounded Context**: casino
**Dependencies**: [WS0]

### Outputs

#### 1. `app/(dashboard)/admin/layout.tsx` — Admin role guard

Server component. Derives staff role from RLS context; redirects non-admin/non-pit_boss users.

```
Pattern: follow app/(dashboard)/layout.tsx structure
Auth: createClient() → getUser() → check staff role
Redirect: non-admin/non-pit_boss → /dashboard (or 403)
Render: {children} with no extra chrome (dashboard layout handles sidebar/header)
```

#### 2. `app/(dashboard)/admin/page.tsx` — Admin index redirect

```typescript
import { redirect } from 'next/navigation';
export default function AdminPage() {
  redirect('/admin/settings/thresholds');
}
```

#### 3. `app/(dashboard)/admin/settings/layout.tsx` — Settings sub-nav

Client component with shadcn `Tabs` for navigation between Thresholds and Shifts.

```
Components: shadcn Tabs (already installed)
Links: /admin/settings/thresholds, /admin/settings/shifts
Pattern: usePathname() to determine active tab
Render: Tabs header + {children}
```

#### 4. `app/(dashboard)/admin/settings/page.tsx` — Settings index redirect

```typescript
import { redirect } from 'next/navigation';
export default function SettingsPage() {
  redirect('/admin/settings/thresholds');
}
```

#### 5. `hooks/use-unsaved-changes-prompt.ts` — Unsaved changes guard

New hook (no existing pattern in codebase):

```
Inputs: isDirty: boolean
Behavior:
  - window 'beforeunload' event listener when isDirty
  - Next.js router interception (useRouter + onBeforePopState or event-based)
  - Returns cleanup on unmount
Pattern: useEffect for beforeunload, router events for SPA navigation
```

#### 6. Install shadcn Switch component

```bash
npx shadcn@latest add switch
```

Required for threshold enabled/disabled toggles (WS2). Does not exist in `components/ui/` currently.

### Validation Gate

- `npm run type-check` → exit 0

---

## WS2: Thresholds Page

**Executor**: `frontend-design-pt-2`
**Bounded Context**: casino
**Dependencies**: [WS1]

### Outputs

#### 1. `app/(dashboard)/admin/settings/thresholds/page.tsx` — Server component shell

Minimal server component rendering the client form.

#### 2. `components/admin/threshold-settings-form.tsx` — Client form component

Main `'use client'` component. Structure:

```
ThresholdSettingsForm
├── Loading skeleton (while useCasinoSettings fetches)
├── Last saved timestamp (updated_at)
├── ThresholdCategoryCard × 8 (map over categories)
│   ├── Category name + description
│   ├── Switch toggle (enabled/disabled)
│   └── Numeric input fields (category-specific)
├── BaselineConfigPanel
│   ├── window_days input
│   ├── method selector (median_mad | mean_stddev)
│   └── min_history_days input
├── Save button (appears when dirty, uses useTransition)
└── AlertDialog confirmation on save
```

**Data flow**:
1. `useCasinoSettings()` → read `alert_thresholds` JSONB
2. If null/empty → `alertThresholdsSchema.parse({})` for defaults
3. Local form state tracks edits
4. On save: read full existing JSONB → spread user changes → send complete object (preserves unknown keys)
5. `useUpdateCasinoSettings()` mutation with `alert_thresholds` payload
6. Confirmation dialog: "Changes take effect on next alert evaluation cycle"

> **DA P1-1 fix — Concurrent edits**: Last-writer-wins for MVP. Settings are low-contention (1-2 admins per casino). TanStack Query cache invalidation on mutation success surfaces fresh data. No optimistic concurrency needed.

**Categories** (from PRD §4.1):

| Category | Key | Fields |
|----------|-----|--------|
| Table Idle | `table_idle` | `warn_minutes`, `critical_minutes` |
| Slip Duration | `slip_duration` | `warn_hours`, `critical_hours` |
| Pause Duration | `pause_duration` | `warn_minutes` |
| Drop Anomaly | `drop_anomaly` | `mad_multiplier`, `fallback_percent` |
| Hold Deviation | `hold_deviation` | `deviation_pp`, `extreme_low`, `extreme_high` |
| Promo Issuance Spike | `promo_issuance_spike` | `mad_multiplier`, `fallback_percent` |
| Promo Void Rate | `promo_void_rate` | `warn_percent` |
| Outstanding Aging | `outstanding_aging` | `max_age_hours`, `max_value_dollars`, `max_coupon_count` |

**Patterns**:
- `useTransition` for save (NOT manual `useState(isSaving)`)
- Zod validation via `alertThresholdsSchema` for client-side validation
- `useUnsavedChangesPrompt(isDirty)` from WS1
- Keyboard-accessible: tab-navigable inputs, Enter to submit

#### 3. `components/admin/threshold-category-card.tsx` — Reusable category card

```
Props: categoryKey, categoryLabel, fields config, value, onChange, enabled, onToggle
Renders: Card with Switch toggle + dynamic numeric fields
```

### Validation Gate

- `npm run type-check` → exit 0

---

## WS3: Shifts Page

**Executor**: `frontend-design-pt-2`
**Bounded Context**: casino
**Dependencies**: [WS1]

### Outputs

#### 1. `app/(dashboard)/admin/settings/shifts/page.tsx` — Server component shell

Minimal server component rendering the client form.

#### 2. `components/admin/shift-settings-form.tsx` — Client form component

```
ShiftSettingsForm
├── Loading skeleton
├── Last saved timestamp (updated_at)
├── Gaming Day Start Time
│   ├── Time input (HH:MM, 24-hour format)
│   └── Label + help text
├── Timezone Selector
│   ├── Searchable Select/Combobox (shadcn Select or Popover+Command)
│   └── IANA timezones (US, APAC, EU coverage)
├── Visual Preview
│   └── "Gaming day runs from [start] to [start+24h] in [timezone]"
├── Warning Banner (appears when form is dirty)
│   └── "Changing gaming day boundaries affects all active sessions and downstream reports"
├── Save button (useTransition, appears when dirty)
└── AlertDialog confirmation with active-session impact warning
```

**Data flow**:
1. `useCasinoSettings()` → read `gaming_day_start_time` + `timezone`
2. Local form state for edits
3. On save: `useUpdateCasinoSettings()` with `{ gaming_day_start_time, timezone }`
4. Confirmation dialog with explicit warning text

**Timezone list**: Pre-built array of common IANA timezones grouped by region. No external dependency — static data.

**Patterns**:
- `useTransition` for save
- `useUnsavedChangesPrompt(isDirty)` from WS1
- Visual preview updates live as user edits (derived state, no useEffect)
- Keyboard-accessible

### Validation Gate

- `npm run type-check` → exit 0

---

## WS4: E2E Tests

**Executor**: `e2e-testing`
**Bounded Context**: casino
**Dependencies**: [WS2, WS3]

### Outputs

#### 1. `e2e/workflows/admin-settings.spec.ts`

Uses existing `createTestScenario()` from `e2e/fixtures/test-data.ts` (creates admin user with auth token + casino with `casino_settings`).

**Test scenarios**:

| Test | Flow |
|------|------|
| **Thresholds: toggle category and save** (DoD required) | 1. Auth as admin → 2. Navigate to `/admin/settings/thresholds` → 3. Verify 8 categories render → 4. Toggle "Hold Deviation" enabled → 5. Click Save → 6. Confirm dialog → 7. Verify success toast → 8. Reload page → 9. Verify "Hold Deviation" is now enabled |
| **Thresholds: edit numeric value** | 1. Auth as admin → 2. Navigate to thresholds → 3. Change `table_idle.warn_minutes` from 20 to 30 → 4. Save → 5. Verify persistence |
| **Shifts: change gaming day start** (stretch) | 1. Auth as admin → 2. Navigate to `/admin/settings/shifts` → 3. Change start time to 04:00 → 4. Verify preview updates → 5. Save → 6. Confirm warning dialog → 7. Verify persistence |
| **Navigation: settings sub-nav** | 1. Auth as admin → 2. Navigate to thresholds → 3. Click Shifts tab → 4. Verify `/admin/settings/shifts` loads |

**Fixture requirements**:
- Reuse `createTestScenario()` — creates admin user with `role: 'admin'`
- **DA P1-4 fix**: `createTestScenario()` does raw `INSERT INTO casino` which does NOT create a `casino_settings` row. The `casino_settings` row is only created by `rpc_bootstrap_casino` during tenant bootstrap. The E2E fixture MUST insert a `casino_settings` row after casino creation via service-role client:
  ```typescript
  await supabase.from('casino_settings').insert({
    casino_id: casino.id,
    timezone: 'America/Los_Angeles',
    gaming_day_start_time: '06:00',
  });
  ```
- Seed `alert_thresholds` JSONB with defaults if testing threshold persistence

**Auth pattern**: Use `authToken` from `createTestScenario()` for API-level tests, or browser-based auth for UI tests.

### Validation Gate

- `npx playwright test e2e/workflows/admin-settings.spec.ts` → all pass

---

## Definition of Done

### Functionality
- [ ] `/admin/settings/thresholds` renders all 8 alert threshold categories with current values
- [ ] Each threshold category has a working enabled/disabled toggle
- [ ] Threshold value edits persist to `casino_settings.alert_thresholds` via PATCH API
- [ ] `/admin/settings/shifts` renders `gaming_day_start_time` and `timezone` with edit capability
- [ ] Gaming day changes persist to `casino_settings` via PATCH API
- [ ] Settings sub-navigation (tabs) works between Thresholds and Shifts pages
- [ ] Unsaved changes prompt appears on navigation away

### Data & Integrity
- [ ] JSONB save preserves unknown keys (forward-compatible)
- [ ] Numeric validation prevents invalid threshold values

### Security & Access
- [ ] Pages gated by admin layout role guard (admin, pit_boss only)
- [ ] Save action uses idempotency key

### Testing
- [ ] Unit tests: threshold form validation, PATCH role enforcement
- [ ] E2E: navigate to thresholds, toggle category, save, verify persistence

### Non-Functional
- [ ] Settings fetch < 300ms p95
- [ ] All form inputs keyboard-accessible
- [ ] Loading and error states handled (skeleton, error boundary)

### Quality Gates
- [ ] `npm run type-check` → exit 0
- [ ] `npm run lint` → exit 0
- [ ] `npm run build` → exit 0

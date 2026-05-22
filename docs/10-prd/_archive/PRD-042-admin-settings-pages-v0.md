---
id: PRD-042
title: Admin Settings Pages — Alert Thresholds & Shift Configuration
owner: Engineering
status: Draft
affects: [PRD-040, ADR-024, ADR-030, ADR-0XX-B, SEC-001, SEC-002]
created: 2026-03-04
last_review: 2026-03-04
phase: Phase 5 (Administrative Infrastructure)
pattern: A
http_boundary: false
scaffold_ref: docs/00-vision/admin-route/ADMIN_ROUTE_GROUP_CONTEXT.md
prerequisite: PRD-040
hardening_ref: docs/00-vision/strategic-hardening/STRATEGIC_HARDENING_REPORT.md
surface_allocation_ref: docs/00-vision/strategic-hardening/ADR_0XX_B_Measurement_Surface_Allocation.md
---

# PRD-042 — Admin Settings Pages: Alert Thresholds & Shift Configuration

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Strategic Context:** This PRD is a direct output of the PT-2 Strategic Hardening effort. The thresholds page closes the **Wedge C (Shift Intelligence) write-path gap** identified in the Strategic Hardening Report §III Q1: *"Variance thresholds configurable — YES. Write path missing."* Hardening Roadmap Phase 1, item 1.4 calls for "Implement threshold write path (admin PATCH endpoint)" — the API exists; this PRD delivers the missing UI layer. The shifts page addresses the temporal configuration gap that affects downstream gaming day computation across all measurement surfaces.
- **Summary:** Build the two admin settings pages — `/admin/settings/thresholds` and `/admin/settings/shifts` — within the admin route group established by PRD-040. Both pages ship together; the DoD requires both. Both pages configure values stored in the existing `casino_settings` table. Alert thresholds are currently hardcoded ($5K per table, $20K per pit); this PRD replaces them with a configurable UI backed by `casino_settings.alert_thresholds` (JSONB). The shifts page provides gaming day start time and timezone configuration. The backend is **partially ready**: the `PATCH /api/v1/casino/settings` route and React hooks exist, but the route's Zod schema (`updateCasinoSettingsSchema`) does not yet accept `alert_thresholds` — wiring the existing `updateAlertThresholdsSchema` into the route is required backend work. Depends on PRD-040 for the admin layout and role guard.

> **Role access (standardized 2026-03-04):** Both `admin` and `pit_boss` roles can view settings pages and update alert thresholds. `gaming_day_start_time` and `timezone` changes are restricted to `admin` role only due to high downstream impact (affects `compute_gaming_day()` across ~10 tables). This is enforced via application-level role check in the PATCH handler (defense-in-depth, added in review). The RLS `casino_settings_update` policy allows both `admin` and `pit_boss`; the application-level check provides the finer-grained temporal restriction.

---

## 2. Problem & Goals

### 2.1 Problem

Two sidebar navigation items (`/admin/settings/thresholds` and `/admin/settings/shifts`) point to non-existent routes, producing 404s. Alert thresholds for cash observation spike detection are hardcoded in the `SHIFT_SEVERITY_ALLOWLISTS_v1.md` governance doc ($5K per table, $20K per pit). Casinos with different table mixes or volume profiles cannot tune these values without code changes. Similarly, gaming day start time and timezone are configured only during the setup wizard — there is no post-setup UI to adjust them, forcing operators to request engineering support for temporal boundary changes.

The Strategic Hardening Report (2026-03-01) rates Wedge C (Shift Intelligence) at **40% maturity** — the lowest of all four wedges. The report identifies the missing threshold write path as a Phase 1 hardening item (§III Q1): thresholds are configurable in storage but operators have no way to change them. This gap directly undermines the business claim *"Surface operational anomalies in real time"* — if thresholds cannot be tuned per-property, alert fatigue and false positives erode trust in the system.

The API layer is **partially complete**. The `PATCH /api/v1/casino/settings` route exists (`app/api/v1/casino/settings/route.ts`) and accepts `gaming_day_start_time`, `timezone`, `watchlist_floor`, and `ctr_threshold` updates. However, the route's input schema (`updateCasinoSettingsSchema` at `services/casino/schemas.ts:31-52`) does **not** include `alert_thresholds` — the field would be silently stripped by Zod parsing. The Zod schemas for alert thresholds exist separately (`alertThresholdsSchema` at `schemas.ts:227-273`, `updateAlertThresholdsSchema` at `schemas.ts:276-290`) but are not wired into the PATCH route. The `alert_thresholds` JSONB column exists in `casino_settings` with fully typed DTOs (`AlertThresholdsDTO`). This PRD requires: (1) extending the PATCH route schema to accept `alert_thresholds`, and (2) building the frontend settings pages.

> **Vision doc correction (§3.4):** The context map states "`gaming_day` and `shift` tables exist." This is incorrect. `gaming_day` is a **computed column** present on ~10 tables (e.g., `mtl_entry`, `rating_slip`, `table_session`), derived via `compute_gaming_day()` RPC from `casino_settings.gaming_day_start_time` + timezone. No standalone `gaming_day` table exists. `shift` is not a table — `shift_checkpoint` stores per-shift aggregate snapshots. The canonical storage for temporal configuration is `casino_settings` alone. PRD-040 Appendix C documents this same correction.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Thresholds page renders current alert threshold configuration | `/admin/settings/thresholds` displays all 8 alert threshold categories with current values from `casino_settings.alert_thresholds` |
| **G2**: Operators can update alert thresholds without code changes | Saving threshold changes via the UI persists to `casino_settings.alert_thresholds` and is reflected in subsequent `rpc_shift_cash_obs_alerts` runs |
| **G3**: Shifts page renders gaming day temporal configuration | `/admin/settings/shifts` displays `gaming_day_start_time`, `timezone`, and related temporal settings |
| **G4**: Operators can adjust gaming day boundaries post-setup | Saving gaming day changes via the UI persists to `casino_settings` and affects downstream gaming day computation |
| **G5**: Ghost nav items resolve to working pages | Clicking "Thresholds" and "Shifts" in sidebar settings group navigates without 404 |

### 2.3 Non-Goals

- New database tables or migrations (all storage exists; only the Zod schema wiring is needed)
- New API routes (the existing `PATCH /api/v1/casino/settings` route is extended, not replaced)
- Baseline-based thresholds (7-day rolling median +/- 3xMAD) — requires baseline service (Hardening Roadmap Phase 2, item 2.4)
- Per-table or per-pit threshold overrides — casino-level only for this PRD
- Shift schedule presets, named shifts, or multi-shift window definitions — the vision doc §3.4 describes "gaming day window definitions, shift presets, temporal boundaries" but no `shift` table, shift preset schema, or shift configuration RPC exists anywhere in the codebase. Shifts are implicit from `gaming_day_start_time` + `shift_checkpoint` windows. Building a preset system would require new tables, RPCs, and DTOs — that is a separate PRD if the product decides presets are needed
- Reports page (`/admin/reports`) — blocked by ADR-039 Phase 1 migrations; belongs to Measurement Surface Allocation Tier 3 (see §7.3)
- Audit trail for settings changes (future — requires event sourcing)
- Measurement surface placement decisions — these are governed by ADR-0XX-B and PT2_Measurement_Surface_Guidance.md; this PRD provides **configuration infrastructure**, not measurement surfaces

---

## 3. Users & Use Cases

- **Primary users:** Casino management (`admin`), shift supervisors (`pit_boss`)

**Top Jobs:**

- As a **casino manager**, I need to adjust alert thresholds for cash observation spikes so that alerts reflect my casino's actual table volume and reduce false positives.
- As a **casino manager**, I need to enable or disable specific alert categories so that my team only sees relevant alert types.
- As a **casino manager**, I need to change the gaming day start time so that shift boundaries align with my property's actual operating hours.
- As a **shift supervisor**, I need to view the current threshold configuration so that I understand why specific alerts are firing or being suppressed.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Thresholds Page:**
- `/admin/settings/thresholds` page rendering all 8 alert threshold categories from `AlertThresholdsDTO`
- Per-category card showing: category name, enabled/disabled toggle, current threshold values
- Inline editing of threshold values with Zod validation
- Save action via `useUpdateCasinoSettings()` mutation (existing hook)
- Confirmation dialog before save ("Threshold changes take effect on next alert evaluation cycle")
- Baseline configuration panel (window days, method, min history days) — write-enabled; values persist to JSONB but are not consumed until baseline service ships (Hardening Roadmap Phase 2, item 2.4). Admins can pre-configure ahead of service deployment.

**Alert threshold categories displayed:**

| Category | Key Fields | Default |
|----------|-----------|---------|
| Table Idle | `warn_minutes`, `critical_minutes` | Enabled |
| Slip Duration | `warn_hours`, `critical_hours` | Enabled |
| Pause Duration | `warn_minutes` | Enabled |
| Drop Anomaly | `mad_multiplier`, `fallback_percent` | Enabled |
| Hold Deviation | `deviation_pp`, `extreme_low`, `extreme_high` | Disabled |
| Promo Issuance Spike | `mad_multiplier`, `fallback_percent` | Enabled |
| Promo Void Rate | `warn_percent` | Enabled |
| Outstanding Aging | `max_age_hours`, `max_value_dollars`, `max_coupon_count` | Enabled |

**Shifts Page:**
- `/admin/settings/shifts` page displaying temporal configuration
- Gaming day start time editor (`gaming_day_start_time` — HH:MM format, 24-hour)
- Timezone selector (IANA timezone from `casino_settings.timezone`)
- Visual preview: "Gaming day runs from [start] to [start + 24h] in [timezone]"
- Warning banner before save: "Changing gaming day boundaries affects all active sessions and downstream reports"
- Save action via same `useUpdateCasinoSettings()` mutation

**Settings Layout:**
- `/admin/settings` index page redirecting to `/admin/settings/thresholds`
- Settings sub-navigation (tabs or sidebar links) between Thresholds and Shifts

### 4.2 Out of Scope

- Per-table threshold overrides
- Shift schedule templates or named shifts
- Undo/revert for settings changes
- Settings change history/audit log
- MTL-specific settings (watchlist floor, CTR threshold) — already configured in setup wizard
- Promo settings (`promo_allow_anonymous_issuance`, `promo_require_exact_match`) — separate context

---

## 5. Requirements

### 5.1 Functional Requirements

- The thresholds page MUST read current values from `casino_settings.alert_thresholds` JSONB column via `useCasinoSettings()`.
- Each threshold category MUST have an enabled/disabled toggle that persists to the JSONB structure.
- Numeric threshold fields MUST validate against reasonable bounds (e.g., `warn_minutes` > 0, `mad_multiplier` > 0).
- The `updateCasinoSettingsSchema` MUST be extended to accept `alert_thresholds` via the existing `updateAlertThresholdsSchema`. The PATCH route handler MUST pass validated `alert_thresholds` through to the Supabase update call. The GET route MUST include `alert_thresholds` in its select to return current values.
- The save action MUST use `PATCH /api/v1/casino/settings` with the full `alert_thresholds` JSONB payload (not partial patch — JSONB columns require full replacement). The UI MUST read the existing JSONB, merge changes, and send the complete object to preserve unknown keys.
- The shifts page MUST display `gaming_day_start_time` as a time picker and `timezone` as a searchable dropdown.
- The timezone selector MUST include all IANA timezones relevant to casino operations (US, APAC, EU at minimum).
- Both pages MUST show a loading skeleton while settings are fetching.
- Both pages MUST show the last-saved timestamp (`updated_at` from `casino_settings`).
- Form state MUST track dirty state and show a "Save" button only when changes exist.
- Navigation away with unsaved changes MUST prompt the user.

### 5.2 Non-Functional Requirements

- Settings fetch MUST complete within existing API latency budget (< 300ms p95).
- Save operations MUST use idempotency keys (required by `PATCH /api/v1/casino/settings`).
- All form inputs MUST be keyboard-accessible.

> Architecture details: See SRM v4.11.0 (casino bounded context), `services/casino/dtos.ts` (`AlertThresholdsDTO`, `CasinoSettingsWithAlertsDTO`), `app/api/v1/casino/settings/route.ts`.

---

## 6. UX / Flow Overview

**Flow 1: View & Edit Thresholds**
1. Admin navigates to `/admin/settings/thresholds` (or clicks "Thresholds" in settings sub-nav)
2. Page loads current `alert_thresholds` from `casino_settings` via `useCasinoSettings()`
3. 8 threshold category cards render with current values and enabled/disabled state
4. Admin toggles "Hold Deviation" from disabled to enabled, adjusts `deviation_pp` from 5 to 3
5. "Save" button appears (dirty state detected)
6. Admin clicks "Save" — confirmation dialog: "Changes take effect on next alert evaluation"
7. On confirm, `useUpdateCasinoSettings()` fires PATCH with updated JSONB
8. Success toast, dirty state cleared, `updated_at` refreshes

**Flow 2: Adjust Gaming Day Boundaries**
1. Admin navigates to `/admin/settings/shifts`
2. Current gaming day start time and timezone display
3. Visual preview shows "Gaming day: 06:00 to 06:00 (America/Los_Angeles)"
4. Admin changes start time from 06:00 to 04:00
5. Preview updates live: "Gaming day: 04:00 to 04:00 (America/Los_Angeles)"
6. Warning banner appears: "This affects all active sessions and downstream reports"
7. Admin clicks "Save" — confirmation dialog with explicit warning about active session impact
8. On confirm, mutation fires, cache invalidates (gaming day queries also invalidate per `useUpdateCasinoSettings`)

**Flow 3: Settings Sub-Navigation**
1. Admin on `/admin/settings/thresholds` clicks "Shifts" tab
2. Navigation to `/admin/settings/shifts` — no unsaved changes prompt (form is clean)
3. If form has unsaved changes → prompt "You have unsaved changes. Leave page?"

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-040 (admin layout + role guard)** — Recommended to ship first. The settings pages require the admin route group and role guard. **If PRD-042 ships before PRD-040**, WS1 must create the admin layout and `/admin/page.tsx` redirect itself (see WS1 conditional task). PRD-040 then reuses the existing layout and overwrites the index redirect.
- **`casino_settings` table** — Exists. Columns: `alert_thresholds` (JSONB), `gaming_day_start_time`, `timezone`, `watchlist_floor`, `ctr_threshold`.
- **`PATCH /api/v1/casino/settings`** — Exists at `app/api/v1/casino/settings/route.ts`. Requires admin role, idempotency key, Zod validation. **Requires schema extension** (see §7.2).
- **`useCasinoSettings()` / `useUpdateCasinoSettings()`** — Exist at `hooks/casino/use-casino-settings.ts`. The mutation hook calls the PATCH route; once the route schema is extended, the hook works for threshold updates without modification.
- **`AlertThresholdsDTO`** — Fully typed at `services/casino/dtos.ts` (8 categories + baseline config).
- **`updateCasinoSettingsSchema`** — Zod schema at `services/casino/schemas.ts:31-52`. Currently accepts `gaming_day_start_time`, `timezone`, `watchlist_floor`, `ctr_threshold` only. Does **not** accept `alert_thresholds`.
- **`updateAlertThresholdsSchema`** — Zod schema at `services/casino/schemas.ts:276-290`. Fully defined but **not wired** into the PATCH route. Deep-partial structure allows updating individual threshold categories.

### 7.2 Risks & Open Questions

- **PATCH route schema wiring (backend work required)** — The `updateCasinoSettingsSchema` at `schemas.ts:31-52` does not include `alert_thresholds`. The `updateAlertThresholdsSchema` exists at `schemas.ts:276-290` but is disconnected. **Full WS0 scope (~30-40 lines across 6 items):**
  1. Extend `updateCasinoSettingsSchema` to accept `alert_thresholds: updateAlertThresholdsSchema.optional()`
  2. Update `SETTINGS_SELECT` inline string in `route.ts:31-32` to include `alert_thresholds` and `updated_at`
  3. Update `CasinoSettingsDTO` or switch GET/PATCH return type to `CasinoSettingsWithAlertsDTO` (which already includes `alert_thresholds`)
  4. Update `UpdateCasinoSettingsDTO` at `dtos.ts:60-65` to include `alert_thresholds`
  5. Update HTTP fetcher return type at `http.ts:135-137` to match extended DTO
  6. Verify PATCH handler passes `alert_thresholds` through (auto-works via `input` spread, but return select must include the column)
- **JSONB partial vs. full replacement** — The `updateAlertThresholdsSchema` supports deep-partial updates (individual category updates). However, Supabase's PostgREST JSONB update replaces the entire column value, not individual keys. The UI must read the full JSONB, merge changes client-side, and send the complete object. Unknown keys from future schema additions must be preserved on save (spread existing + overlay changes).
- **Gaming day change impact** — Changing `gaming_day_start_time` mid-shift can cause active sessions to span two gaming days. The confirmation dialog must make this risk explicit. Consider restricting changes to outside active shift windows in a future enhancement.
- **Default values** — If `alert_thresholds` is null or empty (fresh casino), the UI must show sensible defaults. The `alertThresholdsSchema` at `schemas.ts:227-273` defines all defaults (e.g., `table_idle.warn_minutes: 20`, `hold_deviation.enabled: false`). Use `alertThresholdsSchema.parse({})` to hydrate a full default object.

### 7.3 Strategic Hardening Alignment & Parallel Implementation

This PRD runs concurrently with broader strategic hardening work. The relationship to parallel efforts:

**What this PRD closes (Hardening Roadmap items):**

| Roadmap Item | Phase | This PRD Delivers |
|---|---|---|
| §III Q1: "Write path not implemented — no admin API or UI to modify thresholds" | Phase 1, item 1.4 | Thresholds page — completes the write path |
| Wedge C maturity from 40% → higher | Phase 1 | Threshold configurability is a prerequisite for reducing alert fatigue |

**What runs in parallel (not this PRD's scope):**

| Parallel Effort | Hardening Phase | Relationship to This PRD |
|---|---|---|
| Baseline service (`rpc_compute_rolling_baseline`) | Phase 2, item 2.4 | Future: baseline config panel on thresholds page will control `window_days`, `method`, `min_history_days` — already included in `AlertThresholdsDTO.baseline` |
| Alert persistence + state machine | Phase 2, item 2.5 | Independent — alerts page (PRD-040) consumes alerts; thresholds page configures their firing parameters |
| Shift Dashboard slot-fill (coverage widget) | Measurement Surface Allocation Tier 1 | Independent — operational measurement surface, not configuration. Governed by ADR-0XX-B |
| Reports page (loyalty liability) | Measurement Surface Allocation Tier 3 | Blocked by ADR-039 Phase 1. Uses the same admin route group (PRD-040) but is a separate PRD |
| PRD-036 opening baseline cascade restoration | Phase 2, item 2.3 | Independent — affects shift metrics computation, not threshold configuration |

**ADR-0XX-B (Measurement Surface Allocation) compliance:**

The settings pages are **configuration infrastructure**, not measurement surfaces. ADR-0XX-B's Artifact Allocation Matrix governs where measurements are *displayed*; this PRD governs where measurement *parameters* are *configured*. The principle holds: thresholds configured here control the severity/firing of alerts that appear on the Shift Dashboard (operational scope) and the alerts page (admin review scope). The settings pages do not duplicate measurement data across contexts — they provide a single control surface for measurement parameters.

Per PT2_Measurement_Surface_Guidance.md: *"Do not create new pages unless they pay rent."* Both settings pages pay rent:
- Thresholds page unlocks per-casino alert tuning (Wedge C Q1 gap closure)
- Shifts page unlocks post-setup temporal boundary management (affects `compute_gaming_day()` which feeds all downstream measurement surfaces)

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `/admin/settings/thresholds` renders all 8 alert threshold categories with current values
- [ ] Each threshold category has a working enabled/disabled toggle
- [ ] Threshold value edits persist to `casino_settings.alert_thresholds` via PATCH API
- [ ] `/admin/settings/shifts` renders `gaming_day_start_time` and `timezone` with edit capability
- [ ] Gaming day changes persist to `casino_settings` via PATCH API
- [ ] Settings sub-navigation (tabs) works between Thresholds and Shifts pages
- [ ] Unsaved changes prompt appears on navigation away

**Data & Integrity**
- [ ] JSONB save preserves unknown keys (forward-compatible with future threshold categories)
- [ ] Numeric validation prevents invalid threshold values (negative, zero where inappropriate)

**Security & Access**
- [ ] Pages are gated by PRD-040 admin layout role guard (admin, pit_boss only)
- [ ] Save action uses idempotency key as required by existing API

**Testing**
- [ ] Unit tests for threshold form validation: (1) valid threshold save accepted, (2) invalid value (negative, zero) rejected by Zod
- [ ] Unit test for PATCH route role enforcement: pit_boss can update thresholds but NOT gaming_day_start_time
- [ ] At least one happy-path E2E test: navigate to thresholds, toggle a category, save, verify persistence

**Non-Functional (§5.2)**
- [ ] Settings fetch completes within < 300ms p95
- [ ] All form inputs are keyboard-accessible (tab-navigable, Enter to submit)
- [ ] Save operations use idempotency keys

**Operational Readiness**
- [ ] Ghost nav items (`/admin/settings/thresholds`, `/admin/settings/shifts`) resolve without 404
- [ ] Loading and error states handled gracefully (skeleton, error boundary)

**Documentation**
- [ ] Warning text for gaming day changes documents the impact on active sessions

---

## 9. Related Documents

**Strategic Hardening (V&S):**
- **Strategic Hardening Report**: `docs/00-vision/strategic-hardening/STRATEGIC_HARDENING_REPORT.md` — Wedge C §III Q1 gap (threshold write path)
- **Wedge Hardening Roadmap**: `docs/00-vision/strategic-hardening/PT2_Wedge_Hardening_Roadmap.md` — Wedge C hardening questions
- **Measurement Surface Allocation**: `docs/00-vision/strategic-hardening/ADR_0XX_B_Measurement_Surface_Allocation.md` — UI placement rules for measurement artifacts
- **Measurement Surface Guidance**: `docs/00-vision/strategic-hardening/PT2_Measurement_Surface_Guidance.md` — "Do not create new pages unless they pay rent"
- **Suitability Findings**: `docs/00-vision/strategic-hardening/MEASUREMENT_SURFACE_ALLOCATION_SUITABILITY.md` — infrastructure gap audit

**Admin Route Group:**
- **Context Map**: `docs/00-vision/admin-route/ADMIN_ROUTE_GROUP_CONTEXT.md`
- **Prerequisite PRD**: `docs/10-prd/PRD-040-admin-route-alerts-v0.md` (admin layout + role guard + alerts)
- **Archived PRD**: `docs/10-prd/_archive/PRD-021-admin-dashboard-ui.md` (superseded)

**Architecture & Implementation:**
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (casino bounded context)
- **Casino Service DTOs**: `services/casino/dtos.ts` — `AlertThresholdsDTO`, `CasinoSettingsWithAlertsDTO`, `UpdateCasinoSettingsDTO`
- **Casino Settings API**: `app/api/v1/casino/settings/route.ts`
- **Casino Settings Hook**: `hooks/casino/use-casino-settings.ts`
- **Severity Allowlists**: `docs/25-api-data/SHIFT_SEVERITY_ALLOWLISTS_v1.md` (current hardcoded thresholds)

**Security:**
- **RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **Auth Pipeline**: ADR-024 (context derivation), ADR-030 (auth pipeline hardening)

---

## Appendix A: Existing Infrastructure Reference

### casino_settings Table (relevant columns)

```sql
casino_settings (
  id              UUID PRIMARY KEY,
  casino_id       UUID REFERENCES casino(id) UNIQUE,
  alert_thresholds JSONB,         -- AlertThresholdsDTO structure
  gaming_day_start_time TIME,     -- HH:MM:SS (default '06:00:00')
  timezone        TEXT,           -- IANA timezone (e.g., 'America/Los_Angeles')
  watchlist_floor INTEGER,        -- MTL threshold in cents (default 300000)
  ctr_threshold   INTEGER,        -- CTR threshold in cents (default 1000000)
  updated_at      TIMESTAMPTZ
)
```

### AlertThresholdsDTO (typed JSONB structure)

```typescript
// services/casino/dtos.ts
export interface AlertThresholdsDTO {
  table_idle: TableIdleThreshold;          // warn_minutes, critical_minutes
  slip_duration: SlipDurationThreshold;    // warn_hours, critical_hours
  pause_duration: PauseDurationThreshold;  // warn_minutes
  drop_anomaly: DropAnomalyThreshold;      // mad_multiplier, fallback_percent
  hold_deviation: HoldDeviationThreshold;  // deviation_pp, extreme_low, extreme_high
  promo_issuance_spike: PromoIssuanceSpikeThreshold; // mad_multiplier, fallback_percent
  promo_void_rate: PromoVoidRateThreshold; // warn_percent
  outstanding_aging: OutstandingAgingThreshold; // max_age_hours, max_value_dollars, max_coupon_count
  baseline: AlertBaselineConfig;           // window_days, method, min_history_days
}
```

### Existing API Route

```typescript
// app/api/v1/casino/settings/route.ts
GET  /api/v1/casino/settings   // Returns CasinoSettingsDTO (RLS-scoped)
PATCH /api/v1/casino/settings  // Updates settings (admin role, idempotency key required)
```

### Existing Hooks

```typescript
// hooks/casino/use-casino-settings.ts
useCasinoSettings()        // GET query
useUpdateCasinoSettings()  // PATCH mutation with cache invalidation
```

---

## Appendix B: Implementation Plan

### WS0: PATCH Route Schema Wiring (prerequisite, backend — ~30-40 lines across 6 files)

- [ ] Extend `updateCasinoSettingsSchema` in `services/casino/schemas.ts` to accept `alert_thresholds: updateAlertThresholdsSchema.optional()`
- [ ] Update `SETTINGS_SELECT` inline string in `app/api/v1/casino/settings/route.ts:31-32` to include `alert_thresholds` and `updated_at` columns
- [ ] Update `UpdateCasinoSettingsDTO` in `services/casino/dtos.ts:60-65` to include `alert_thresholds` field
- [ ] Switch GET/PATCH return type annotation to `CasinoSettingsWithAlertsDTO` (already includes `alert_thresholds`) or extend `CasinoSettingsDTO`
- [ ] Update HTTP fetcher return type in `services/casino/http.ts:135-137` to match extended DTO
- [ ] Verify PATCH handler passes `alert_thresholds` through to Supabase `.update()` call (auto-works via `input` spread)
- [ ] Add unit test: PATCH with `alert_thresholds` payload persists and returns updated JSONB
- [ ] Add unit test: PATCH without `alert_thresholds` leaves existing JSONB unchanged

### WS1: Settings Layout, Navigation & Shared Infrastructure

- [ ] If PRD-040 has NOT shipped: create `app/(dashboard)/admin/layout.tsx` (role guard) and `app/(dashboard)/admin/page.tsx` (redirect to `/admin/settings/thresholds`). If PRD-040 HAS shipped: reuse existing admin layout; update `/admin/page.tsx` redirect target if needed.
- [ ] Create `app/(dashboard)/admin/settings/layout.tsx` — settings sub-nav (tabs: Thresholds, Shifts)
- [ ] Create `app/(dashboard)/admin/settings/page.tsx` — redirect to `/admin/settings/thresholds`
- [ ] Install shadcn AlertDialog if not already present (`npx shadcn@latest add alert-dialog`)
- [ ] Create shared `useUnsavedChangesPrompt` hook — combines `beforeunload` event listener + Next.js `useRouter` interception for navigation-away prompt when form has dirty state. This pattern does not exist in the codebase and is needed by both settings pages.
- [ ] Verify ghost nav items in sidebar resolve

### WS2: Thresholds Page (P2)

- [ ] Create `app/(dashboard)/admin/settings/thresholds/page.tsx` — server component shell
- [ ] Create threshold category card component (name, enabled toggle, value fields)
- [ ] Create threshold form with Zod validation matching `AlertThresholdsDTO`
- [ ] Wire `useCasinoSettings()` for read, `useUpdateCasinoSettings()` for save
- [ ] Add confirmation dialog on save
- [ ] Handle null/empty `alert_thresholds` with `alertThresholdsSchema.parse({})` for sensible defaults
- [ ] Implement read-merge-write pattern: read full JSONB → overlay changes → send complete object (preserves unknown keys)
- [ ] Implement dirty state tracking and unsaved changes prompt

### WS3: Shifts Page (P3)

- [ ] Create `app/(dashboard)/admin/settings/shifts/page.tsx` — server component shell
- [ ] Create time picker for `gaming_day_start_time`
- [ ] Create searchable timezone selector
- [ ] Add visual preview ("Gaming day runs from X to X in timezone")
- [ ] Add warning banner for gaming day change impact
- [ ] Wire same `useUpdateCasinoSettings()` mutation
- [ ] Add confirmation dialog with explicit active-session warning

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-03-04 | Engineering | Initial draft — P2 + P3 scope from context map |
| 0.2.0 | 2026-03-04 | Engineering | Added strategic hardening alignment (Wedge C write-path gap), ADR-0XX-B compliance framing, parallel implementation context, measurement surface guidance references |
| 0.3.0 | 2026-03-04 | Engineering | Incongruency fixes: (1) PATCH route schema does not accept alert_thresholds — added WS0 backend wiring; (2) documented gaming_day/shift are computed columns not tables; (3) explicit rationale for shift presets out-of-scope |
| 0.4.0 | 2026-03-04 | Engineering | Audit fixes: (1) severity allowlist path corrected to docs/25-api-data/; (2) baseline panel scope clarified — write-enabled, persists to JSONB, not consumed until baseline service ships; (3) NFRs (latency, keyboard a11y, idempotency) added to DoD; (4) dropped P2/P3 priority labels — both pages ship together per DoD |
| 0.5.0 | 2026-03-04 | Engineering | P1 review fixes: (1) WS0 scope expanded from "~10 lines" to 6 items across ~30-40 lines (SETTINGS_SELECT, DTOs, HTTP fetcher, schema); (2) role access standardized — admin+pit_boss for thresholds, admin-only for temporal fields; (3) defense-in-depth role check added to PATCH handler; (4) build order ambiguity resolved — conditional admin layout creation in WS1; (5) useUnsavedChangesPrompt hook added as WS1 prerequisite; (6) AlertDialog install added to WS1; (7) testing expanded — role enforcement unit test, threshold validation tests |

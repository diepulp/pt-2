---
title: Admin Settings Taxonomy
date: 2026-03-31
status: Draft
scope: Settings classification and UI surface standardization for admin route group
references:
  - ADMIN-UI-MENTAL-MODEL.md
  - services/casino/schemas.ts (alert thresholds Zod schemas)
  - services/casino/dtos.ts (CasinoSettingsWithAlertsDTO)
  - types/database.types.ts (casino_settings, game_settings, gaming_table_settings, loyalty_valuation_policy)
  - app/api/v1/casino/settings/route.ts (updateable fields)
---

# Admin Settings Taxonomy

## 1. Problem Statement

The current admin settings surface (`/admin/settings/*`) was built ad-hoc as features shipped. Three tabs mix unrelated concerns under a single flat hierarchy:

| Current Tab | What It Contains | Actual Domain |
|-------------|------------------|---------------|
| **Thresholds** | 8 alert categories + baseline config | Anomaly detection model tuning |
| **Shifts** | Gaming day start time + timezone | Casino operations (temporal) |
| **Valuation** | Cents per point + effective date | Loyalty economics |

Meanwhile, several configurable settings in `casino_settings` have **no UI at all**:

| Setting | Column | Type | UI Surface |
|---------|--------|------|-----------|
| Watchlist floor (MTL) | `watchlist_floor` | number (cents) | **NONE** |
| CTR threshold | `ctr_threshold` | number (cents) | **NONE** |
| Promo exact match | `promo_require_exact_match` | boolean | **NONE** |
| Promo anonymous issuance | `promo_allow_anonymous_issuance` | boolean | **NONE** |
| Table bank mode | `table_bank_mode` | enum | Setup wizard only — **no post-setup UI** |

The sidebar "Other > Settings" group (`/settings/*`) contains 3 dead placeholder pages (General, Casino, Staff) that were never implemented.

**The result**: no mental model for what lives where, invisible configuration, and wasted nav space.

---

## 2. Complete Settings Inventory

Every configurable parameter in the system, by storage location:

### 2.1 `casino_settings` table (casino-scoped, singleton per casino)

| Column | Type | Default | Domain | Current UI | Description |
|--------|------|---------|--------|-----------|-------------|
| `gaming_day_start_time` | string (HH:MM) | `06:00` | Casino Ops | Shifts tab | When the gaming day begins |
| `timezone` | string (IANA) | `America/Los_Angeles` | Casino Ops | Shifts tab | Casino operating timezone |
| `table_bank_mode` | enum (`INVENTORY_COUNT` / `IMPREST_TO_PAR`) | `INVENTORY_COUNT` | Casino Ops | Setup wizard only | Bank reconciliation method |
| `watchlist_floor` | number (cents) | `300000` ($3,000) | Compliance | **NONE** | MTL monitoring threshold |
| `ctr_threshold` | number (cents) | `1000000` ($10,000) | Compliance | **NONE** | Currency Transaction Report threshold |
| `promo_require_exact_match` | boolean | `true` | Loyalty Rules | **NONE** | Whether promo redemption requires exact match |
| `promo_allow_anonymous_issuance` | boolean | `false` | Loyalty Rules | **NONE** | Whether promos can be issued without player ID |
| `alert_thresholds` | JSONB | (see §2.2) | Anomaly Detection | Thresholds tab | Nested alert configuration |
| `setup_status` | string | — | Internal | — | Setup wizard state (not user-configurable) |
| `setup_completed_at` | timestamp | — | Internal | — | Audit field (not user-configurable) |
| `setup_completed_by` | uuid | — | Internal | — | Audit field (not user-configurable) |

### 2.2 `alert_thresholds` JSONB structure (nested in `casino_settings`)

#### Operational Alert Thresholds

| Category | Fields | Default | Description |
|----------|--------|---------|-------------|
| `table_idle` | `enabled`, `warn_minutes`, `critical_minutes` | enabled, 20m warn, 45m critical | Open table with no activity |
| `slip_duration` | `enabled`, `warn_hours`, `critical_hours` | enabled, 4h warn, 8h critical | Stale rating slips |
| `pause_duration` | `enabled`, `warn_minutes` | enabled, 30m warn | Paused sessions exceeding threshold |

#### Statistical Anomaly Thresholds

| Category | Fields | Default | Description |
|----------|--------|---------|-------------|
| `drop_anomaly` | `enabled`, `mad_multiplier`, `fallback_percent` | enabled, 3x MAD, 50% fallback | Unusual drop amounts (MAD analysis) |
| `hold_deviation` | `enabled`, `deviation_pp`, `extreme_low`, `extreme_high` | **disabled**, 10pp, -5/40 extremes | Hold percentage deviations |

#### Promotional Alert Thresholds

| Category | Fields | Default | Description |
|----------|--------|---------|-------------|
| `promo_issuance_spike` | `enabled`, `mad_multiplier`, `fallback_percent` | enabled, 3x MAD, 100% fallback | Unusual promo issuance volume |
| `promo_void_rate` | `enabled`, `warn_percent` | enabled, 5% warn | Promo void rate exceeding threshold |
| `outstanding_aging` | `enabled`, `max_age_hours`, `max_value_dollars`, `max_coupon_count` | enabled, 24h, $2000, 25 coupons | Uncleared promos exceeding limits |

#### Baseline Configuration

| Fields | Default | Description |
|--------|---------|-------------|
| `window_days` | 7 | Rolling window for statistical baselines |
| `method` | `median_mad` | Statistical method (`median_mad` / `mean_stddev`) |
| `min_history_days` | 3 | Minimum data required before baseline fires |

### 2.3 `loyalty_valuation_policy` table (versioned, per casino)

| Column | Type | Current UI | Description |
|--------|------|-----------|-------------|
| `cents_per_point` | number | Valuation tab | Redemption rate ($0.0X per point) |
| `effective_date` | date | Valuation tab | When rate takes effect |
| `is_active` | boolean | Implicit (latest active) | Policy version selection |
| `version_identifier` | string | Auto-generated | Audit trail |
| `created_by_staff_id` | uuid | Implicit | Actor attribution |

### 2.4 `loyalty_earn_config` table (singleton per casino)

| Column | Type | Current UI | Description |
|--------|------|-----------|-------------|
| `points_per_theo` | number | **NONE** | Points earned per dollar of theoretical win |
| `default_point_multiplier` | number | **NONE** | Default multiplier for point calculations |
| `rounding_policy` | string (`floor`/`ceil`/`round`) | **NONE** | How fractional points are rounded |
| `is_active` | boolean | **NONE** | Whether this config is active |
| `effective_from` | timestamp | **NONE** | When config becomes effective |

**API**: `GET/PUT /api/v1/rewards/earn-config` (admin only). Exists but has **no UI surface**.

### 2.4 `game_settings` table (per-game blueprint)

| Column | Type | Current UI | Description |
|--------|------|-----------|-------------|
| `game_type` | enum | Setup wizard | Category (Blackjack, Poker, etc.) |
| `name`, `code`, `variant_name` | string | Setup wizard | Game identity |
| `house_edge` | number (%) | Setup wizard | Mathematical house edge |
| `rating_edge_for_comp` | number (%) | Setup wizard | Edge for comp calculations |
| `decisions_per_hour` | number | Setup wizard | Game speed |
| `seats_available` | number | Setup wizard | Table capacity |
| `min_bet`, `max_bet` | number ($) | Setup wizard | Default betting limits |
| `shoe_decks` | number | Setup wizard | Deck count |
| `deck_profile` | string | Setup wizard | Card deck type |
| `point_multiplier` | number | Setup wizard | Loyalty point multiplier for this game |
| `points_conversion_rate` | number | Setup wizard | Points conversion rate |
| `rotation_interval_minutes` | number | Setup wizard | Dealer rotation interval |

**Note**: Game settings are currently only editable during onboarding. No post-setup management UI exists.

### 2.5 `gaming_table_settings` table (per-table overrides)

| Column | Type | Current UI | Description |
|--------|------|-----------|-------------|
| `min_bet`, `max_bet` | number ($) | API only | Table-specific limit overrides |
| `rotation_interval_minutes` | number | API only | Rotation override |
| `active_from`, `active_to` | timestamp | API only | Temporal validity window |

**Note**: Table-level settings are contextual to table management, not a global admin settings concern.

---

## 3. Settings Taxonomy

Settings are classified by the **domain they affect**, producing 5 functional groups. Each group maps to a distinct admin settings tab.

```
Admin > Settings
├── Casino Operations     — Foundational parameters that define how the casino runs
├── Compliance            — Regulatory thresholds (audit-sensitive, legally mandated)
├── Anomaly Detection     — Statistical model tuning for the alerting engine
├── Loyalty               — Reward economics and promotional rules
└── Game Library          — Per-game mathematical parameters (FUTURE)
```

### 3.1 Casino Operations

**What it governs**: The temporal and operational foundation of the casino. Changes here cascade to every downstream system (finance, MTL, loyalty, sessions).

**Write access**: admin only (pit_boss: read-only — these are high-impact changes).

| Setting | Source | Currently In | Notes |
|---------|--------|-------------|-------|
| Gaming Day Start Time | `casino_settings.gaming_day_start_time` | Shifts tab | HH:MM format, impacts `compute_gaming_day()` |
| Timezone | `casino_settings.timezone` | Shifts tab | IANA timezone, grouped by region |
| Table Bank Mode | `casino_settings.table_bank_mode` | Setup wizard (no post-setup UI) | INVENTORY_COUNT / IMPREST_TO_PAR. Affects close/reconciliation flow. |

**Confirmation required**: Yes — downstream impact warning (affects all active sessions, gaming day computations, finance, MTL, loyalty).

**Migration from current state**: Rename "Shifts" tab → "Casino Operations". Add `table_bank_mode` selector (currently hidden after setup).

### 3.2 Compliance

**What it governs**: Regulatory reporting thresholds. These values determine when the system flags transactions for MTL/AML/CTR reporting. Changes are audit-sensitive.

**Write access**: admin only.

| Setting | Source | Currently In | Display Format |
|---------|--------|-------------|---------------|
| Watchlist Floor | `casino_settings.watchlist_floor` | **NO UI** | Dollar display (stored as cents: 300000 → $3,000.00) |
| CTR Threshold | `casino_settings.ctr_threshold` | **NO UI** | Dollar display (stored as cents: 1000000 → $10,000.00) |

**Confirmation required**: Yes — regulatory impact warning.

**Migration from current state**: New tab. These fields exist in the API schema (`updateCasinoSettingsSchema`) but were never surfaced in the UI.

### 3.3 Anomaly Detection

**What it governs**: The statistical model that powers the alerting engine (Wedge C — Shift Intelligence). These are the "knobs and dials" that tune sensitivity, detection windows, and threshold levels.

**Write access**: admin only.

**Sub-grouped by concern**:

#### Baseline Engine Configuration
The global parameters for the rolling statistical baseline.

| Setting | Source | Description |
|---------|--------|-------------|
| Window (days) | `alert_thresholds.baseline.window_days` | Rolling window for historical comparison |
| Statistical Method | `alert_thresholds.baseline.method` | `median_mad` or `mean_stddev` |
| Min History (days) | `alert_thresholds.baseline.min_history_days` | Minimum data required before baselines fire |

#### Financial Anomalies
Anomalies detected against statistical baselines on financial metrics.

| Category | Fields | Description |
|----------|--------|-------------|
| Drop Anomaly | `mad_multiplier`, `fallback_percent` | Unusual drop amounts |
| Hold Deviation | `deviation_pp`, `extreme_low`, `extreme_high` | Hold % outside expected bands |

#### Operational Alerts
Time-based alerts for table and session hygiene.

| Category | Fields | Description |
|----------|--------|-------------|
| Table Idle | `warn_minutes`, `critical_minutes` | Open table with no activity |
| Slip Duration | `warn_hours`, `critical_hours` | Long-running rating slips |
| Pause Duration | `warn_minutes` | Paused sessions exceeding limit |

#### Promotional Anomalies
Anomalies in promotional instrument usage.

| Category | Fields | Description |
|----------|--------|-------------|
| Promo Issuance Spike | `mad_multiplier`, `fallback_percent` | Unusual promo volume |
| Promo Void Rate | `warn_percent` | Excessive void rate |
| Outstanding Aging | `max_age_hours`, `max_value_dollars`, `max_coupon_count` | Uncleared promos |

**Confirmation required**: Yes — "Changes take effect on the next alert evaluation cycle."

**Migration from current state**: Rename "Thresholds" tab → "Anomaly Detection". Same form content, reorganized into sub-groups with section headers.

### 3.4 Loyalty

**What it governs**: The economic model for loyalty point earning, valuation, and promotional rule enforcement.

**Write access**: admin only (pit_boss: read-only on valuation).

**Sub-grouped by concern**:

#### Point Earning (how players accumulate points)

| Setting | Source | Currently In | Notes |
|---------|--------|-------------|-------|
| Points per Theo | `loyalty_earn_config.points_per_theo` | **NO UI** | Points earned per $1 theoretical win |
| Default Point Multiplier | `loyalty_earn_config.default_point_multiplier` | **NO UI** | Multiplier applied to base earning rate |
| Rounding Policy | `loyalty_earn_config.rounding_policy` | **NO UI** | `floor` / `ceil` / `round` for fractional points |

#### Point Redemption (how points convert to value)

| Setting | Source | Currently In | Notes |
|---------|--------|-------------|-------|
| Point Valuation Rate | `loyalty_valuation_policy.cents_per_point` | Valuation tab | Cents per point (e.g., 2 = $0.02/pt) |
| Effective Date | `loyalty_valuation_policy.effective_date` | Valuation tab | When rate takes effect |

#### Promotional Rules

| Setting | Source | Currently In | Notes |
|---------|--------|-------------|-------|
| Require Exact Match | `casino_settings.promo_require_exact_match` | **NO UI** | Whether promo redemption requires exact player match |
| Allow Anonymous Issuance | `casino_settings.promo_allow_anonymous_issuance` | **NO UI** | Whether promos can be issued to unidentified players |

**Confirmation required**: Yes — "Changing the valuation rate affects all future comp issuances."

**Migration from current state**: Rename "Valuation" tab → "Loyalty". Add earn config section and promo rule toggles.

### 3.5 Game Library (FUTURE — not in current scope)

**What it governs**: Per-game mathematical parameters (house edge, decisions/hour, seats, betting limits, point multipliers).

**Current state**: Only configurable during onboarding wizard. No post-setup management UI.

**Why future**: Game settings management is a distinct feature requiring its own PRD. It involves CRUD operations on a collection (not a singleton settings object), which is architecturally different from the other tabs.

**Placement when built**: Separate admin section (`/admin/games` or `/admin/game-library`), not a settings tab. Game management is catalog administration, not configuration tuning.

---

## 4. Tab Mapping: Current → Proposed

### Current Structure (3 tabs, flat)

```
/admin/settings/
├── thresholds    → 8 alert categories + baseline (Anomaly Detection)
├── shifts        → gaming_day_start_time + timezone (Casino Ops)
└── valuation     → cents_per_point + effective_date (Loyalty)
```

### Proposed Structure (4 tabs, domain-organized)

```
/admin/settings/
├── operations        → Gaming Day + Timezone + Table Bank Mode
├── compliance        → Watchlist Floor + CTR Threshold
├── anomaly-detection → 8 alert categories + baseline (sub-grouped)
└── loyalty           → Point Valuation + Promo Rules
```

### Migration Path

| Current Route | Proposed Route | Change Type |
|--------------|----------------|-------------|
| `/admin/settings/thresholds` | `/admin/settings/anomaly-detection` | Rename + sub-group internally |
| `/admin/settings/shifts` | `/admin/settings/operations` | Rename + add `table_bank_mode` |
| `/admin/settings/valuation` | `/admin/settings/loyalty` | Rename + add promo rule toggles |
| (none) | `/admin/settings/compliance` | **New tab** |
| `/admin/settings` (redirect) | `/admin/settings` (redirect to operations) | Update redirect target |

### Redirect Strategy

Old URLs must continue to work for bookmarks and shared links:

| Old Path | Redirects To |
|----------|-------------|
| `/admin/settings/thresholds` | `/admin/settings/anomaly-detection` |
| `/admin/settings/shifts` | `/admin/settings/operations` |
| `/admin/settings/valuation` | `/admin/settings/loyalty` |

---

## 5. Settings Surface Hierarchy (Complete)

The full admin settings mental model, showing every configurable parameter:

```
Admin > Settings
│
├── Casino Operations
│   ├── Gaming Day Start Time .............. HH:MM (admin-write, pit_boss-readonly)
│   ├── Timezone ........................... IANA select (admin-write, pit_boss-readonly)
│   └── Table Bank Mode ................... INVENTORY_COUNT | IMPREST_TO_PAR (admin-write)
│
├── Compliance
│   ├── Watchlist Floor (MTL) ............. $ amount (stored cents) (admin-write)
│   └── CTR Threshold .................... $ amount (stored cents) (admin-write)
│
├── Anomaly Detection
│   ├── Baseline Engine
│   │   ├── Window (days) ................. int (default: 7)
│   │   ├── Method ........................ median_mad | mean_stddev
│   │   └── Min History (days) ............ int (default: 3)
│   ├── Financial Anomalies
│   │   ├── Drop Anomaly .................. [toggle] mad_multiplier, fallback_%
│   │   └── Hold Deviation ................ [toggle, default OFF] deviation_pp, extremes
│   ├── Operational Alerts
│   │   ├── Table Idle .................... [toggle] warn_min, critical_min
│   │   ├── Slip Duration ................. [toggle] warn_hrs, critical_hrs
│   │   └── Pause Duration ................ [toggle] warn_min
│   └── Promotional Anomalies
│       ├── Promo Issuance Spike .......... [toggle] mad_multiplier, fallback_%
│       ├── Promo Void Rate ............... [toggle] warn_%
│       └── Outstanding Aging ............. [toggle] max_hrs, max_$, max_count
│
└── Loyalty
    ├── Point Earning
    │   ├── Points per Theo ............... number (pts/$1 theo) (admin-write)
    │   ├── Default Point Multiplier ...... number (admin-write)
    │   └── Rounding Policy ............... floor | ceil | round (admin-write)
    ├── Point Redemption
    │   ├── Cents per Point ............... number (e.g., 2 = $0.02/pt) (admin-write)
    │   └── Effective Date ................ date (admin-write)
    └── Promo Rules
        ├── Require Exact Match ........... boolean (admin-write)
        └── Allow Anonymous Issuance ...... boolean (admin-write)
```

---

## 6. Removed Surfaces

### Sidebar "Other > Settings" Group

| Route | Current Content | Action |
|-------|----------------|--------|
| `/settings` | Placeholder ("Casino configuration and management") | **Delete page** |
| `/settings/casino` | Placeholder ("Casino configuration, gaming day settings") | **Delete page** |
| `/settings/staff` | Placeholder ("Staff roster and role assignments") | **Delete page** |

The sidebar "Other" group is removed entirely. All settings functionality is consolidated under `Admin > Settings`.

### Staff Management

The `/settings/staff` placeholder intended to house staff roster management. This is not a "settings" concern — it's user/identity administration. When implemented, it belongs as a standalone admin section (`/admin/staff`), not nested under settings.

---

## 7. Implementation Notes

### API Compatibility

The existing `PATCH /api/v1/casino/settings` endpoint already accepts all `casino_settings` fields via `updateCasinoSettingsSchema`. No API changes are required — the new tabs simply expose fields the API already supports.

The `loyalty_valuation_policy` endpoint (`/api/v1/loyalty/valuation-policy`) is also unchanged.

### Form Patterns

Each tab should follow the established settings form pattern:
- `useCasinoSettings()` hook for data fetching
- `useUpdateCasinoSettings()` mutation with idempotency key
- Dirty state tracking via server-value comparison
- Confirmation dialog before save
- Last-saved timestamp display
- Read-only mode for pit_boss (amber warning banner)

### Cents-to-Dollars Display

`watchlist_floor` and `ctr_threshold` are stored as cents. The UI must:
- Display as dollars (divide by 100)
- Accept dollar input
- Convert to cents before PATCH
- Show unit label ("$3,000.00" not "300000")

### Sub-Grouping in Anomaly Detection

The current Thresholds tab renders 8 categories + baseline as a flat list of cards. The proposed Anomaly Detection tab adds section headers to group related categories:

```
[Baseline Engine Configuration]     — 3 fields, always visible (not toggleable)
[Financial Anomalies]               — Drop Anomaly, Hold Deviation cards
[Operational Alerts]                — Table Idle, Slip Duration, Pause Duration cards
[Promotional Anomalies]             — Promo Spike, Void Rate, Outstanding Aging cards
```

This is a visual reorganization — the data model and save behavior are unchanged.

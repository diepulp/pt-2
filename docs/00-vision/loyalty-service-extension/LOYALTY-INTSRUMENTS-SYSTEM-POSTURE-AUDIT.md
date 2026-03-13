---
title: "Loyalty Instruments — System Posture Audit"
status: audit-complete
date: 2026-03-09
references:
  - LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md
  - MATCHPLAY-PRINT-READINESS-REPORT.md
  - MATCHPLAY-PRINT-v0.1.md
  - SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md
---

# Loyalty Instruments — System Posture Audit

## Executive Summary

The PT-2 codebase has **substantial backend infrastructure** for promotional instruments — database schema, RPCs, service layer, API routes, hooks, and dashboard rollups are all operational. Two critical gaps block a complete loyalty workflow:

1. **No admin configuration UI** — users cannot create, manage, or configure promo programs, tier entitlements, or coupon policies through the application.
2. **No one-click print pipeline** — the auto-derivation RPC, print infrastructure, and print button are all at 0%.

---

## 1. What Exists Today (Verified Against Code)

### 1.1 Database Layer

| Asset | Status | Migration |
|---|---|---|
| `promo_program` table | Deployed | `20260106235611_loyalty_promo_instruments.sql` |
| `promo_coupon` table | Deployed | Same migration |
| `promo_type_enum` (`match_play`) | Deployed | Same migration |
| `promo_coupon_status` (issued/voided/replaced/expired/cleared) | Deployed | Same migration |
| `reward_catalog` table | Deployed | `20260206005751_adr033_reward_catalog_schema.sql` |
| `reward_entitlement_tier` table | Deployed | Same migration |
| `loyalty_earn_config` table | Deployed | Same migration |
| `casino_settings.promo_require_exact_match` | Deployed | `20260106235906_alert_thresholds_settings.sql` |
| `casino_settings.promo_allow_anonymous_issuance` | Deployed | Same migration |
| `loyalty_outbox` table | Deployed | `20260206005335_prd028_restore_loyalty_outbox.sql` |

**RLS**: Pattern C hybrid (ADR-015/ADR-020), casino-scoped. DELETE denied on both promo tables. INSERT/UPDATE restricted to `pit_boss`/`admin` roles.

### 1.2 RPCs (5 Operational)

| RPC | Security | ADR-024 | Purpose |
|---|---|---|---|
| `rpc_issue_promo_coupon` | DEFINER | `set_rls_context_from_staff()` | Issue coupon with explicit params, idempotent |
| `rpc_void_promo_coupon` | DEFINER | `set_rls_context_from_staff()` | Void coupon, idempotent |
| `rpc_replace_promo_coupon` | DEFINER | `set_rls_context_from_staff()` | Atomic void + re-issue, idempotent |
| `rpc_promo_coupon_inventory` | INVOKER | RLS-based | Status breakdown aggregation |
| `rpc_promo_exposure_rollup` | INVOKER | RLS-based | Shift dashboard promo metrics |

All 3 write RPCs emit to `loyalty_outbox` and write `audit_log` entries.

### 1.3 Service Layer (`services/loyalty/promo/`)

| File | Lines | Content |
|---|---|---|
| `dtos.ts` | 500 | 15 DTOs: Program, Coupon, Issue/Void/Replace I/O, Inventory, Exposure Rollup |
| `crud.ts` | 630 | 11 methods: listPrograms, getProgram, createProgram, updateProgram, issueCoupon, voidCoupon, replaceCoupon, getCouponInventory, listCoupons, getCoupon, getCouponByValidationNumber |
| `mappers.ts` | 457 | Row-to-DTO transformations, type guards |
| `schemas.ts` | 90 | Zod validation schemas |
| `http.ts` | 262 | Client-side HTTP fetchers |
| `index.ts` | 184 | `createPromoService()` factory with explicit `PromoService` interface |

### 1.4 API Routes (7 Endpoints)

| Route | Methods | Status |
|---|---|---|
| `/api/v1/promo-programs` | GET, POST | Operational |
| `/api/v1/promo-programs/[id]` | GET, PATCH | Operational |
| `/api/v1/promo-coupons` | GET, POST | Operational |
| `/api/v1/promo-coupons/[id]` | GET | Operational |
| `/api/v1/promo-coupons/[id]/void` | POST | Operational |
| `/api/v1/promo-coupons/[id]/replace` | POST | Operational |
| `/api/v1/loyalty/promotion` | GET | Operational |

**Bug**: `services/loyalty/promo/http.ts` references `GET /api/v1/promo-coupons/inventory` but no route.ts exists at that path.

### 1.5 React Hooks

| Hook | File |
|---|---|
| `usePromoPrograms`, `usePromoProgram` | `hooks/loyalty/promo-instruments/use-promo-programs.ts` |
| `usePromoCoupons`, `usePromoCoupon`, `usePromoCouponByValidation`, `usePromoCouponInventory` | `use-promo-coupons.ts` |
| `useIssueCoupon`, `useVoidCoupon`, `useReplaceCoupon`, `useCreatePromoProgram`, `useUpdatePromoProgram` | `use-promo-mutations.ts` |
| `usePromoExposure` | `use-promo-exposure.ts` |
| `useDashboardPromoExposure` | `hooks/dashboard/use-promo-exposure.ts` (30s auto-refresh) |

### 1.6 UI Components

| Component | Location | Status |
|---|---|---|
| `PromoExposurePanel` | `components/dashboard/promo-exposure-panel.tsx` | Complete — 6-metric brutalist panel with alerts |
| `LoyaltyPanel` | `components/player-dashboard/loyalty-panel.tsx` | Complete — tier display + balance + "coming soon" placeholder |
| `IssueRewardButton` | `components/player-360/header/issue-reward-button.tsx` | Stub — `enabled=false`, "Coming soon" tooltip |
| `ManualRewardDialog` | `components/loyalty/manual-reward-dialog.tsx` | Partial stub — renders form but does NOT call backend RPC |
| `RewardsEligibilityCard` | `components/player-360/rewards/` | Complete |
| `RewardsHistoryList` | `components/player-360/rewards/` | Complete — filter chips for matchplay/freeplay |

### 1.7 Admin Route Group

| Route | Content | Loyalty-Relevant |
|---|---|---|
| `/admin/alerts` | Live cash observation alerts | No |
| `/admin/settings/thresholds` | Alert threshold config (includes promo thresholds) | Partial — promo alert thresholds configurable |
| `/admin/settings/shifts` | Gaming day temporal config | No |
| `/admin/reports` | Reports page | Stub |

### 1.8 Tests

2,231 lines across 3 dedicated test files + outbox contract tests:
- `__tests__/services/loyalty/promo-instruments.test.ts` (885 lines)
- `__tests__/services/loyalty/promo-instruments.int.test.ts` (735 lines)
- `__tests__/services/loyalty/promo-instruments-mappers.test.ts` (611 lines)

---

## 2. Critical Gaps

### GAP-1: No Admin UI for Loyalty Instrument Management

**Severity**: P0 — blocks all operational loyalty workflows

Users cannot:
- Create or manage promo programs (no form, no list view)
- Configure tier-to-entitlement mappings (no tier ladder editor)
- Toggle coupon policies (`promo_require_exact_match`, `promo_allow_anonymous_issuance`)
- Manage coupon inventory (void/replace from admin surface)
- Configure loyalty earn rates (`loyalty_earn_config` has no API routes or UI)

The API endpoints exist (POST/PATCH `/api/v1/promo-programs`) but there is **zero frontend** to consume them. Programs can only be created via direct API call or mock data (`app/dev/setup/_mock-data.ts`).

PRD-042 explicitly deferred loyalty configuration: "promo settings — separate context."

**Current admin surface** (`/admin/settings/thresholds`) only covers alert thresholds, not program CRUD or policy toggles.

### GAP-2: No Tier-to-Entitlement Mapping

**Severity**: P0 — blocks tier-aware issuance

`promo_program` stores a single `face_value_amount` + `required_match_wager_amount` per program. There is no tier ladder.

The spec requires: "Resolve player's tier -> Compute entitlement."

**Options**:
- **A (JSONB)**: Add `tier_entitlements jsonb` to `promo_program` — simplest, no joins
- **B (Join table)**: `promo_tier_entitlement (program_id, tier) -> (face_value, match_wager)` — normalized
- **C (One-program-per-tier)**: Multiple programs per tier with `tier_filter` column

Note: `reward_entitlement_tier` table exists (ADR-033) with service CRUD but is reward-catalog-scoped, not promo-program-scoped.

### GAP-3: `rpc_issue_current_match_play` — 0% Implemented

**Severity**: P1 — blocks one-click print workflow

The auto-derivation RPC that resolves tier, finds active program, computes entitlement, enforces idempotency, and returns a ready-to-print coupon does not exist.

Requires: tier mapping mechanism (GAP-2) + scope decision (gaming-day vs visit).

### GAP-4: Print Infrastructure — 0%

**Severity**: P1 — blocks printable coupons

- No `lib/print/` directory
- No iframe print utility
- No HTML template builder
- No print history logging (`promo_coupon.metadata.print_history[]`)
- No "Print Match Play" button in rating slip modal or player dashboard

Rating Slip Modal current actions: Save Changes, Pause/Resume, Close Session — no print action.

### GAP-5: Missing Inventory API Route

**Severity**: P2 — fetcher references nonexistent endpoint

`services/loyalty/promo/http.ts` calls `GET /api/v1/promo-coupons/inventory` but no route handler exists. The `rpc_promo_coupon_inventory` RPC and `getCouponInventory()` service method both work — only the API route is missing.

### GAP-6: Loyalty Earn Config API

**Severity**: P3 — `loyalty_earn_config` table exists but has no API routes

Service CRUD exists in `services/loyalty/reward/crud.ts` (queries `loyalty_earn_config` table). No REST endpoints or admin UI surface.

---

## 3. Readiness Matrix

| Dimension | Readiness | Notes |
|---|---|---|
| Data model (core tables) | **95%** | All tables deployed. Missing: tier entitlement on promo_program |
| RLS / security | **100%** | Pattern C, ADR-024, delete denied, role-gated |
| Core RPCs (CRUD) | **100%** | 5 RPCs operational, all idempotent |
| One-click RPC | **0%** | `rpc_issue_current_match_play` does not exist |
| Service layer | **85%** | 11 promo methods + reward CRUD. Missing: one-click method |
| React hooks | **85%** | Full CRUD hooks. Missing: one-click hook |
| API routes | **80%** | 7 promo endpoints. Missing: inventory route + one-click endpoint |
| Admin config UI | **0%** | No promo program, tier, reward, or earn config UI |
| Print infrastructure | **0%** | No iframe, template, or button |
| Dashboard / rollups | **100%** | PromoExposurePanel + 30s auto-refresh |
| Alert thresholds | **100%** | Promo thresholds in casino_settings |
| Tests | **75%** | 2,231 lines CRUD/mapper/integration tests; no E2E |

---

## 4. Recommended Implementation Sequence

### Phase 1: Admin Configuration Surface (unblocks everything)

```
app/(dashboard)/admin/loyalty/
├── promo-programs/
│   ├── page.tsx              # Program list + create button
│   └── [id]/page.tsx         # Program detail + edit + coupon inventory
└── policies/
    └── page.tsx              # Coupon policy toggles + earn config
```

**Components needed**: `PromoProgramList`, `PromoProgramForm`, `TierEntitlementEditor`, `PromoSettingsToggle`

**Estimated effort**: ~730 lines frontend (API routes already exist)

### Phase 2: Schema + RPC for Tier-Aware Issuance

1. Migration: add `tier_entitlements jsonb` to `promo_program`
2. Migration: `rpc_issue_current_match_play` with idempotency + metadata writes
3. Fix: add missing `/api/v1/promo-coupons/inventory` route
4. Service + DTO + API route + hook for one-click method

### Phase 3: Print Pipeline

1. `lib/print/` — iframe print utility + HTML template builder
2. "Print Match Play" button in rating slip modal + player dashboard
3. Print history logging (best-effort metadata append)

### Phase 4: Reward Catalog Admin + Earn Config

1. Reward catalog list/detail/entitlements UI
2. Loyalty earn config API routes + admin page

---

## 5. Open Design Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | Tier-to-entitlement mapping | A (JSONB), B (join table), C (one-program-per-tier) | Option A — JSONB keeps schema simple |
| 2 | Idempotency scope | A (gaming-day), B (visit) | Gaming-day — simpler operationally |
| 3 | Replacement behavior | Honor issued, auto-replace on policy change | Honor issued — matches control expectations |
| 4 | QR/barcode on coupon | Include in v0, defer | Defer unless floor benefits from scan speed |
| 5 | Tier name governance | Fixed enum, free-text per casino | Fixed enum (bronze/silver/gold/platinum/diamond) |

---

## 6. Bugs & Anomalies Found

| # | Issue | Severity | Location |
|---|---|---|---|
| 1 | Inventory API route missing — http.ts fetcher calls nonexistent endpoint | P2 | `services/loyalty/promo/http.ts:183-196` |
| 2 | `ManualRewardDialog` doesn't call backend RPC — fires `onSuccess` with local state only | P3 | `components/loyalty/manual-reward-dialog.tsx` |
| 3 | `loyalty_outbox` missing from generated types (flagged in readiness report) | P3 | Verify with `npm run db:types` |
| 4 | `promo_type_enum` only has `match_play` — spec lists `nonnegotiable`, `free_bet`, `other` | P3 | `20260106235611_loyalty_promo_instruments.sql:26` |
| 5 | `promo_program.status` uses CHECK constraint (`active`/`inactive`/`archived`) not spec's enum (`draft`/`active`/`paused`/`ended`) | P3 | Same migration, line 54 |

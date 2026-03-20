---
title: "Loyalty Instruments — System Posture Audit"
status: audit-complete
date: 2026-03-19
revision: 2
revision_history:
  - rev: 1
    date: 2026-03-09
    scope: "Initial audit — pre-Vector B"
  - rev: 2
    date: 2026-03-19
    scope: "Post-Vector B (PRD-052) — operator issuance workflow implemented"
references:
  - LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md
  - MATCHPLAY-PRINT-READINESS-REPORT.md
  - MATCHPLAY-PRINT-v0.1.md
  - SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md
  - docs/21-exec-spec/EXEC-052-loyalty-operator-issuance.md
  - docs/10-prd/PRD-052-player-exclusion-ui-surface-v0.md
---

# Loyalty Instruments — System Posture Audit

## Executive Summary

The PT-2 codebase has **substantial, operational loyalty infrastructure** for promotional instruments. Database schema, RPCs, service layer, API routes, hooks, dashboard rollups, and **operator issuance workflows** are all operational. Vector B (PRD-052, merged 2026-03-19) delivered the unified issuance drawer, catalog-backed `issueComp()`/`issueEntitlement()` service methods, a unified `/issue` API endpoint with role gating, and comprehensive test coverage.

**Remaining gaps:**

1. **No admin configuration UI** — operators cannot create, manage, or configure promo programs, tier entitlements, or coupon policies through the application (API routes exist, no frontend).
2. **No one-click print pipeline** — the auto-derivation RPC, print infrastructure, and print button are all at 0%.
3. **No tier-to-entitlement auto-derivation** — `issueEntitlement()` reads frozen catalog values; no tier→entitlement resolution logic.

**Resolved since Rev 1:**
- Operator issuance workflow (comp + entitlement) — fully operational via Player 360 drawer
- `rpc_issue_promo_coupon` P0 security gap — role gate deployed (pit_boss/admin only)
- Inventory API route gap — `GET /api/v1/promo-coupons/inventory` now exists
- `ManualRewardDialog` — deleted, replaced by unified IssueRewardDrawer
- `GET /loyalty/balances` — wired to LoyaltyService.getBalance()
- `GET /players/[id]/loyalty` — wired to LoyaltyService.getBalance()
- `POST /loyalty/mid-session-reward` — explicitly 501 (scope change per PRD §7.4)
- Rewards history mapper bug (`'redemption'` → `'redeem'`) — fixed
- `promo_type_enum` expanded — `free_play` added (migration `20260318153722`)

---

## 1. What Exists Today (Verified Against Code)

### 1.1 Database Layer

| Asset | Status | Migration |
|---|---|---|
| `promo_program` table | Deployed | `20260106235611_loyalty_promo_instruments.sql` |
| `promo_coupon` table | Deployed | Same migration |
| `promo_type_enum` (`match_play`, `free_play`) | Deployed | `20260106235611` + `20260318153722_add_free_play_promo_type.sql` |
| `promo_coupon_status` (issued/voided/replaced/expired/cleared) | Deployed | `20260106235611` |
| `reward_catalog` table | Deployed | `20260206005751_adr033_reward_catalog_schema.sql` |
| `reward_price_points` table | Deployed | Same migration |
| `reward_entitlement_tier` table | Deployed | Same migration |
| `reward_limits` table | Deployed | Same migration |
| `reward_eligibility` table | Deployed | Same migration |
| `loyalty_earn_config` table | Deployed | Same migration |
| `casino_settings.promo_require_exact_match` | Deployed | `20260106235906_alert_thresholds_settings.sql` |
| `casino_settings.promo_allow_anonymous_issuance` | Deployed | Same migration |
| `loyalty_outbox` table | Deployed | `20260206005335_prd028_restore_loyalty_outbox.sql` |
| `loyalty_valuation_policy` table | Deployed | `20260307114452_adr039_loyalty_measurement_schema.sql` |
| `loyalty_liability_snapshot` table | Deployed | Same migration |

**RLS**: Pattern C hybrid (ADR-015/ADR-020), casino-scoped. DELETE denied on both promo tables. INSERT/UPDATE restricted to `pit_boss`/`admin` roles.

### 1.2 RPCs (5 Operational + Role-Gated)

| RPC | Security | ADR-024 | Role Gate | Purpose |
|---|---|---|---|---|
| `rpc_issue_promo_coupon` | DEFINER | `set_rls_context_from_staff()` | **pit_boss, admin only** | Issue coupon with explicit params, idempotent |
| `rpc_void_promo_coupon` | DEFINER | `set_rls_context_from_staff()` | — | Void coupon, idempotent |
| `rpc_replace_promo_coupon` | DEFINER | `set_rls_context_from_staff()` | — | Atomic void + re-issue, idempotent |
| `rpc_promo_coupon_inventory` | INVOKER | RLS-based | — | Status breakdown aggregation |
| `rpc_promo_exposure_rollup` | INVOKER | RLS-based | — | Shift dashboard promo metrics |

All 3 write RPCs emit to `loyalty_outbox` and write `audit_log` entries.

**Role gate on `rpc_issue_promo_coupon`** (PRD-052 WS1, migration `20260319010843`): Only `pit_boss` and `admin` may issue promo coupons. Cashier explicitly excluded per SEC-002. Follows `rpc_redeem` role gate pattern (ADR-040).

### 1.3 Service Layer

#### `services/loyalty/` (Core)

| File | Lines | Content |
|---|---|---|
| `dtos.ts` | 550 | DTOs including IssueCompParams, CompIssuanceResult, CompFulfillmentPayload, EntitlementFulfillmentPayload, FulfillmentPayload, IssuanceResultDTO |
| `crud.ts` | 759 | 9 methods: accrueOnClose, redeem, manualCredit, applyPromotion, evaluateSuggestion, getBalance, getLedger, reconcileBalance, **issueComp** |
| `schemas.ts` | 244 | Validation schemas including **issueRewardSchema** |
| `mappers.ts` | — | Response parsers |
| `http.ts` | — | Client-side HTTP fetchers |
| `keys.ts` | — | React Query key factory |
| `selects.ts` | — | SQL SELECT definitions |
| `index.ts` | 227 | `createLoyaltyService()` factory with explicit `LoyaltyService` interface (9 methods) |

#### `services/loyalty/promo/` (Promo Sub-Module)

| File | Lines | Content |
|---|---|---|
| `dtos.ts` | 569 | 17+ DTOs: Program, Coupon, Issue/Void/Replace I/O, Inventory, Exposure Rollup, **IssueEntitlementParams, EntitlementIssuanceResult** |
| `crud.ts` | 784 | 12 methods: listPrograms, getProgram, createProgram, updateProgram, issueCoupon, voidCoupon, replaceCoupon, getCouponInventory, listCoupons, getCoupon, getCouponByValidationNumber, **issueEntitlement** |
| `mappers.ts` | 457 | Row-to-DTO transformations, type guards |
| `schemas.ts` | 90 | Zod validation schemas |
| `http.ts` | 262 | Client-side HTTP fetchers |
| `index.ts` | 203 | `createPromoService()` factory with explicit `PromoService` interface (12 methods) |

### 1.4 API Routes (8 Promo Endpoints + 1 Unified Issuance)

| Route | Methods | Status |
|---|---|---|
| `/api/v1/loyalty/issue` | POST | **Operational** — unified issuance (PRD-052 WS3) |
| `/api/v1/promo-programs` | GET, POST | Operational |
| `/api/v1/promo-programs/[id]` | GET, PATCH | Operational |
| `/api/v1/promo-coupons` | GET, POST | Operational |
| `/api/v1/promo-coupons/[id]` | GET | Operational |
| `/api/v1/promo-coupons/[id]/void` | POST | Operational |
| `/api/v1/promo-coupons/[id]/replace` | POST | Operational |
| `/api/v1/promo-coupons/inventory` | GET | **Operational** (was missing in Rev 1) |
| `/api/v1/loyalty/promotion` | GET | Operational |

### 1.5 React Hooks

| Hook | File |
|---|---|
| `usePromoPrograms`, `usePromoProgram` | `hooks/loyalty/promo-instruments/use-promo-programs.ts` |
| `usePromoCoupons`, `usePromoCoupon`, `usePromoCouponByValidation`, `usePromoCouponInventory` | `use-promo-coupons.ts` |
| `useIssueCoupon`, `useVoidCoupon`, `useReplaceCoupon`, `useCreatePromoProgram`, `useUpdatePromoProgram` | `use-promo-mutations.ts` |
| `usePromoExposure` | `use-promo-exposure.ts` |
| `useDashboardPromoExposure` | `hooks/dashboard/use-promo-exposure.ts` (30s auto-refresh) |
| **`useIssueReward`** | `hooks/loyalty/use-issue-reward.ts` (153 lines — useTransition + UUID v4 idempotency) |
| `useRewards` | `hooks/loyalty/use-reward-catalog.ts` (fetches active rewards via RLS context) |

### 1.6 UI Components

| Component | Location | Status |
|---|---|---|
| `PromoExposurePanel` | `components/dashboard/promo-exposure-panel.tsx` | Complete — 6-metric brutalist panel with alerts |
| `LoyaltyPanel` | `components/player-dashboard/loyalty-panel.tsx` | Complete — tier display + balance |
| **`IssueRewardButton`** | `components/player-360/header/issue-reward-button.tsx` | **Complete — `enabled=true`, opens IssueRewardDrawer** |
| **`IssueRewardDrawer`** | `components/loyalty/issue-reward-drawer.tsx` | **Complete — 3-step state machine (select→confirm→result)** |
| **`RewardSelector`** | `components/loyalty/reward-selector.tsx` | **Complete — catalog grouped by family, uses `useRewards({ isActive: true })`** |
| **`CompConfirmPanel`** | `components/loyalty/comp-confirm-panel.tsx` | **Complete — balance preview, advisory insufficient-balance warning** |
| **`EntitlementConfirmPanel`** | `components/loyalty/entitlement-confirm-panel.tsx` | **Complete — catalog-derived face value + match wager, no tier language** |
| **`IssuanceResultPanel`** | `components/loyalty/issuance-result-panel.tsx` | **Complete — success/failure/duplicate states, `onFulfillmentReady` callback** |
| `RewardsEligibilityCard` | `components/player-360/rewards/` | Complete |
| `RewardsHistoryList` | `components/player-360/rewards/` | Complete — filter chips for matchplay/freeplay/**comp** |
| **`ExclusionStatusBadge`** | `components/player-360/header/exclusion-status-badge.tsx` | **Complete — 4 severity levels in Player 360 header** |
| **`ExclusionTile`** | `components/player-360/compliance/exclusion-tile.tsx` | **Complete — exclusion list, add/lift role-gated** |
| ~~`ManualRewardDialog`~~ | ~~`components/loyalty/manual-reward-dialog.tsx`~~ | **DELETED** — replaced by unified IssueRewardDrawer |

### 1.7 Admin Route Group

| Route | Content | Loyalty-Relevant |
|---|---|---|
| `/admin/alerts` | Live cash observation alerts | No |
| `/admin/settings/thresholds` | Alert threshold config (includes promo thresholds) | Partial — promo alert thresholds configurable |
| `/admin/settings/shifts` | Gaming day temporal config | No |
| `/admin/reports` | Reports page | Stub |
| `/admin/loyalty/catalog` | Reward catalog admin (PRD-052 Vector A) | **Operational** — CRUD for rewards + price points |

### 1.8 Tests

**Legacy tests** (2,231 lines):
- `__tests__/services/loyalty/promo-instruments.test.ts` (885 lines)
- `__tests__/services/loyalty/promo-instruments.int.test.ts` (735 lines)
- `__tests__/services/loyalty/promo-instruments-mappers.test.ts` (611 lines)

**PRD-052 issuance tests** (NEW):
- `services/loyalty/__tests__/issue-comp.int.test.ts` — happy path, insufficient balance, inactive reward, not found
- `services/loyalty/__tests__/issue-entitlement.int.test.ts` — happy path, catalog config invalid, role gate (dealer/cashier → FORBIDDEN)
- `services/loyalty/__tests__/issuance-idempotency.int.test.ts` — comp + entitlement idempotency, `Promise.all` concurrent double-debit prevention (NFR-4)
- `app/api/v1/loyalty/issue/__tests__/route.test.ts` — 9 tests: success, role gating, idempotency, validation, entitlement dispatch
- `components/loyalty/__tests__/issue-reward-drawer.test.tsx` — drawer state machine (select→confirm→result)
- `services/player360-dashboard/__tests__/mappers.test.ts` — mapper bug fix validation (`'redeem'` → `'comp'`)

---

## 2. Critical Gaps

### GAP-1: No Admin UI for Loyalty Instrument Management

**Severity**: P0 — blocks operational self-service

Users cannot:
- Create or manage promo programs (no form, no list view)
- Configure tier-to-entitlement mappings (no tier ladder editor)
- Toggle coupon policies (`promo_require_exact_match`, `promo_allow_anonymous_issuance`)
- Manage coupon inventory (void/replace from admin surface)
- Configure loyalty earn rates (`loyalty_earn_config` has no API routes or UI)

The API endpoints exist (POST/PATCH `/api/v1/promo-programs`) but there is **zero frontend** to consume them. Programs can only be created via direct API call or mock data.

**Note**: Reward catalog admin (Vector A) provides CRUD for `reward_catalog` + `reward_price_points`, but promo program management and policy toggles remain absent.

### GAP-2: No Tier-to-Entitlement Auto-Derivation

**Severity**: P1 — blocks tier-aware automated issuance (downgraded from P0)

`issueEntitlement()` reads frozen commercial values from `reward.metadata` (JSONB). There is no tier→entitlement resolution logic. This is **by design for the pilot** (PRD §7.3: "Vector B does not implement entitlement derivation logic").

**Options** (unchanged):
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

**Note**: `IssuanceResultPanel` has a "Print" button binding point (no-op until Vector C connects print infrastructure).

### ~~GAP-5: Missing Inventory API Route~~ — RESOLVED

`GET /api/v1/promo-coupons/inventory` now exists and is operational.

### GAP-6: Loyalty Earn Config API

**Severity**: P3 — `loyalty_earn_config` table exists but has no API routes

Service CRUD exists in `services/loyalty/reward/crud.ts` (queries `loyalty_earn_config` table). No REST endpoints or admin UI surface.

---

## 3. Readiness Matrix

| Dimension | Readiness | Notes |
|---|---|---|
| Data model (core tables) | **95%** | All tables deployed. Missing: tier entitlement on promo_program |
| RLS / security | **100%** | Pattern C, ADR-024, delete denied, role-gated |
| Core RPCs (CRUD) | **100%** | 5 RPCs operational, all idempotent, `rpc_issue_promo_coupon` role-gated |
| One-click RPC | **0%** | `rpc_issue_current_match_play` does not exist |
| Service layer | **95%** | 9 loyalty + 12 promo methods. `issueComp()` + `issueEntitlement()` operational. Missing: one-click method |
| React hooks | **95%** | Full CRUD hooks + `useIssueReward`. Missing: one-click hook |
| API routes | **95%** | 9 promo/issuance endpoints + inventory. Missing: one-click endpoint |
| Operator issuance UI | **100%** | IssueRewardDrawer with family-aware confirm panels, comp + entitlement |
| Admin config UI | **0%** | No promo program, tier, or earn config UI (reward catalog admin exists) |
| Print infrastructure | **0%** | No iframe, template, or button (binding point exists in IssuanceResultPanel) |
| Dashboard / rollups | **100%** | PromoExposurePanel + 30s auto-refresh |
| Alert thresholds | **100%** | Promo thresholds in casino_settings |
| Tests | **90%** | Legacy (2,231 lines) + issuance (6 new test files covering comp, entitlement, idempotency, route, UI, mappers); no E2E |

---

## 4. Recommended Implementation Sequence

### Phase 1: Admin Configuration Surface (unblocks self-service)

```
app/(dashboard)/admin/loyalty/
├── promo-programs/
│   ├── page.tsx              # Program list + create button
│   └── [id]/page.tsx         # Program detail + edit + coupon inventory
└── policies/
    └── page.tsx              # Coupon policy toggles + earn config
```

**Components needed**: `PromoProgramList`, `PromoProgramForm`, `TierEntitlementEditor`, `PromoSettingsToggle`

**Note**: API routes already exist. Frontend only.

### Phase 2: Schema + RPC for Tier-Aware Issuance

1. Migration: add `tier_entitlements jsonb` to `promo_program`
2. Migration: `rpc_issue_current_match_play` with idempotency + metadata writes
3. Service + DTO + API route + hook for one-click method

### Phase 3: Print Pipeline (Vector C)

1. `lib/print/` — iframe print utility + HTML template builder
2. Wire `onFulfillmentReady` callback in `IssuanceResultPanel` to print pipeline
3. "Print Match Play" button in rating slip modal + player dashboard
4. Print history logging (best-effort metadata append)

### Phase 4: Enforcement + Debt Cleanup

1. Enforce `reward_limits` frequency constraints in RPCs
2. Enforce `reward_eligibility` tier/balance guards in RPCs
3. Refresh `mv_loyalty_balance_reconciliation` on a schedule
4. Resolve mid-session module divergence

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

| # | Issue | Severity | Location | Status |
|---|---|---|---|---|
| ~~1~~ | ~~Inventory API route missing~~ | ~~P2~~ | — | **RESOLVED** (route exists) |
| ~~2~~ | ~~`ManualRewardDialog` doesn't call backend RPC~~ | ~~P3~~ | — | **RESOLVED** (file deleted, replaced by IssueRewardDrawer) |
| 3 | `loyalty_outbox` missing from generated types | P3 | Verify with `npm run db:types` | Open |
| 4 | `promo_type_enum` missing `nonnegotiable`, `free_bet`, `other` | P3 | `20260106235611_loyalty_promo_instruments.sql:26` | Partially resolved (`free_play` added) |
| 5 | `promo_program.status` uses CHECK constraint (`active`/`inactive`/`archived`) not spec's enum (`draft`/`active`/`paused`/`ended`) | P3 | Same migration, line 54 | Open |

---

## 7. Vector B Delivery Summary (PRD-052)

**Commit**: `2063e67` (merged 2026-03-19, PR #28)

| Workstream | Deliverable | Status |
|---|---|---|
| WS1 | Role gate on `rpc_issue_promo_coupon` (pit_boss/admin only) | **Deployed** |
| WS2 | `issueComp()` + `issueEntitlement()` service methods, DTOs, schemas, SRM v4.20.0 | **Deployed** |
| WS3 | `POST /api/v1/loyalty/issue` unified endpoint, balances wired, mid-session 501 | **Deployed** |
| WS4 | IssueRewardDrawer + confirm panels + mutation hook, ManualRewardDialog deleted | **Deployed** |
| WS5 | Rewards history comp filter, mapper bug fix, promo_coupon merge | **Deployed** |
| WS6 | Integration tests (comp, entitlement, idempotency), route handler test, UI test | **Deployed** |

**Security**: Dual role gates — route handler checks `ctx.rlsContext.staffRole` before dispatch; RPC checks `app.staff_role` after context derivation. Cashier cannot issue comps or entitlements at any layer.

**Contract Surface**: `FulfillmentPayload` (discriminated union) exported from `services/loyalty/dtos.ts` — frozen for Vector C print pipeline consumption. `onFulfillmentReady` callback wired in drawer (no-op until Vector C binds).

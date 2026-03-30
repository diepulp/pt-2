---
title: "Loyalty Instruments — System Posture Audit"
status: audit-complete
date: 2026-03-22
revision: 3
revision_history:
  - rev: 1
    date: 2026-03-09
    scope: "Initial audit — pre-Vector B"
  - rev: 2
    date: 2026-03-19
    scope: "Post-Vector B (PRD-052) — operator issuance workflow implemented"
  - rev: 3
    date: 2026-03-22
    scope: "Post-Vector C (PRD-053) + P2K issuance fixes + point conversion canonicalization"
references:
  - LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md
  - MATCHPLAY-PRINT-READINESS-REPORT.md
  - MATCHPLAY-PRINT-v0.1.md
  - SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md
  - docs/21-exec-spec/EXEC-052-loyalty-operator-issuance.md
  - docs/10-prd/PRD-052-player-exclusion-ui-surface-v0.md
  - docs/10-prd/PRD-053-reward-instrument-fulfillment-v0.md
  - docs/21-exec-spec/EXEC-053-reward-instrument-fulfillment.md
  - docs/21-exec-spec/EXEC-053-variable-amount-comp.md
  - docs/21-exec-spec/EXEC-054-point-conversion-canonicalization.md
  - docs/80-adrs/ADR-045-pilot-reward-instrument-fulfillment.md
---

# Loyalty Instruments — System Posture Audit

## Executive Summary

The PT-2 codebase has **substantial, operational loyalty infrastructure** with a **pilot print pipeline and DB-sourced valuation**. Database schema, RPCs, service layer, API routes, hooks, dashboard rollups, operator issuance workflows, print infrastructure, and valuation admin are all operational.

**Resolved since Rev 2 (three major deliveries):**

1. **Vector C print standard** (PRD-053, `cb0cabc`, 2026-03-20) — `lib/print/` module with iframe utility, comp-slip + coupon HTML templates, `usePrintReward` hook, wired through `IssuanceResultPanel`. 65 tests across 8 suites. ADR-045.
2. **P2K issuance fixes** (PR #31, `2fd1db7`, 2026-03-20):
   - P2K-29: Fulfillment CHECK constraint aligned to app values (`comp_slip`, `coupon`, `none`)
   - P2K-28: Tier-based entitlement value lookup via `getBalance()` → `entitlementTiers[].benefit`
   - P2K-30: Variable-amount comp with `faceValueCents` + `allowOverdraw` + dollar input UI
   - P2K-32: IssueRewardButton added to rating slip modal with `visitId` threading
   - P2K-33: visitId audit trail linkage from `useActiveVisit()` through full issuance chain
3. **Point conversion canonicalization** (PR #32, `e85382d`, 2026-03-21):
   - DB-sourced `cents_per_point` via `loyalty_valuation_policy` — all hardcoded constants removed
   - `rpc_update_valuation_policy` — atomic rotate with SELECT FOR UPDATE concurrency lock
   - `/admin/settings/valuation` — `ValuationSettingsForm` with role-gated read-only mode
   - LoyaltyService expanded: `getActiveValuationCentsPerPoint()`, `getActiveValuationPolicy()`, `updateValuationPolicy()`
   - Bootstrap seed + onboarding enforcement (casinos ship with default `cents_per_point=2`)
4. **audit_log write path** (`2220be1`, 2026-03-19) — `append_audit_log()` SECURITY DEFINER RPC, direct INSERT revoked (SEC-007 compat)

**Remaining gaps (minor):**

1. **Coupon policy toggles UI** — `promo_require_exact_match` and `promo_allow_anonymous_issuance` have API support but no frontend surface; admins must call API directly.
2. **Earn config UI** — `loyalty_earn_config` has no admin surface (intentionally deferred per frozen decision D2).
3. **No one-click auto-derivation** — `rpc_issue_current_match_play` does not exist. Manual tier-based issuance works end-to-end.
4. **Print history logging** — `promo_coupon.metadata.print_history[]` not yet implemented (best-effort, deferred).

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

### 1.2 RPCs (7 Operational + Role-Gated)

| RPC | Security | ADR-024 | Role Gate | Purpose |
|---|---|---|---|---|
| `rpc_issue_promo_coupon` | DEFINER | `set_rls_context_from_staff()` | **pit_boss, admin only** | Issue coupon with explicit params, idempotent |
| `rpc_void_promo_coupon` | DEFINER | `set_rls_context_from_staff()` | — | Void coupon, idempotent |
| `rpc_replace_promo_coupon` | DEFINER | `set_rls_context_from_staff()` | — | Atomic void + re-issue, idempotent |
| `rpc_promo_coupon_inventory` | INVOKER | RLS-based | — | Status breakdown aggregation |
| `rpc_promo_exposure_rollup` | INVOKER | RLS-based | — | Shift dashboard promo metrics |
| **`rpc_update_valuation_policy`** | **DEFINER** | **`set_rls_context_from_staff()`** | **admin only** | **Atomic rotate: deactivate old → insert new. SELECT FOR UPDATE lock. NEW (PRD-053)** |
| **`append_audit_log`** | **DEFINER** | **Session vars** | — | **Append-only audit write. Direct INSERT revoked. NEW (SEC-007)** |

All 3 promo write RPCs emit to `loyalty_outbox` and write `audit_log` entries (via `append_audit_log()`).

**Role gate on `rpc_issue_promo_coupon`** (PRD-052 WS1, migration `20260319010843`): Only `pit_boss` and `admin` may issue promo coupons. Cashier explicitly excluded per SEC-002. Follows `rpc_redeem` role gate pattern (ADR-040).

### 1.3 Service Layer

#### `services/loyalty/` (Core)

| File | Lines | Content |
|---|---|---|
| `dtos.ts` | 580+ | DTOs including IssueCompParams (faceValueCents, allowOverdraw — NEW), CompIssuanceResult, FulfillmentPayload, ValuationPolicyDTO (NEW), UpdateValuationPolicyInput (NEW) |
| `crud.ts` | 900+ | 12 methods: accrueOnClose, redeem, manualCredit, applyPromotion, evaluateSuggestion, getBalance, getLedger, reconcileBalance, **issueComp** (variable-amount + overdraw), **getActiveValuationCentsPerPoint** (NEW), **getActiveValuationPolicy** (NEW), **updateValuationPolicy** (NEW) |
| `schemas.ts` | 260+ | Validation schemas including **issueRewardSchema** (face_value_cents, allow_overdraw — NEW), **updateValuationPolicySchema** (NEW) |
| `mappers.ts` | — | Response parsers |
| `http.ts` | — | Client-side HTTP fetchers (+ valuation-policy fetchers — NEW) |
| `keys.ts` | — | React Query key factory (+ valuationPolicy key — NEW) |
| `selects.ts` | — | SQL SELECT definitions |
| `index.ts` | 267 | `createLoyaltyService()` factory with explicit `LoyaltyService` interface (12 methods) |

#### `services/loyalty/promo/` (Promo Sub-Module)

| File | Lines | Content |
|---|---|---|
| `dtos.ts` | 569 | 17+ DTOs: Program, Coupon, Issue/Void/Replace I/O, Inventory, Exposure Rollup, **IssueEntitlementParams, EntitlementIssuanceResult** |
| `crud.ts` | 784 | 12 methods: listPrograms, getProgram, createProgram, updateProgram, issueCoupon, voidCoupon, replaceCoupon, getCouponInventory, listCoupons, getCoupon, getCouponByValidationNumber, **issueEntitlement** |
| `mappers.ts` | 457 | Row-to-DTO transformations, type guards |
| `schemas.ts` | 90 | Zod validation schemas |
| `http.ts` | 262 | Client-side HTTP fetchers |
| `index.ts` | 203 | `createPromoService()` factory with explicit `PromoService` interface (12 methods) |

### 1.4 API Routes (8 Promo Endpoints + 1 Unified Issuance + 1 Valuation Admin)

| Route | Methods | Status |
|---|---|---|
| `/api/v1/loyalty/issue` | POST | **Operational** — unified issuance (supports variable-amount comp + overdraw) |
| **`/api/v1/loyalty/valuation-policy`** | **GET, PATCH** | **Operational (NEW, PRD-053)** — admin rate read + atomic rotate update |
| `/api/v1/promo-programs` | GET, POST | Operational |
| `/api/v1/promo-programs/[id]` | GET, PATCH | Operational |
| `/api/v1/promo-coupons` | GET, POST | Operational |
| `/api/v1/promo-coupons/[id]` | GET | Operational |
| `/api/v1/promo-coupons/[id]/void` | POST | Operational |
| `/api/v1/promo-coupons/[id]/replace` | POST | Operational |
| `/api/v1/promo-coupons/inventory` | GET | Operational |
| `/api/v1/loyalty/promotion` | GET | Operational |

### 1.5 React Hooks

| Hook | File |
|---|---|
| `usePromoPrograms`, `usePromoProgram` | `hooks/loyalty/promo-instruments/use-promo-programs.ts` |
| `usePromoCoupons`, `usePromoCoupon`, `usePromoCouponByValidation`, `usePromoCouponInventory` | `use-promo-coupons.ts` |
| `useIssueCoupon`, `useVoidCoupon`, `useReplaceCoupon`, `useCreatePromoProgram`, `useUpdatePromoProgram` | `use-promo-mutations.ts` |
| `usePromoExposure` | `use-promo-exposure.ts` |
| `useDashboardPromoExposure` | `hooks/dashboard/use-promo-exposure.ts` (30s auto-refresh) |
| **`useIssueReward`** | `hooks/loyalty/use-issue-reward.ts` (163+ lines — useTransition + UUID v4 idempotency, faceValueCents + allowOverdraw threading) |
| `useRewards` | `hooks/loyalty/use-reward-catalog.ts` (fetches active rewards via RLS context) |
| **`useValuationRate`** | `hooks/loyalty/use-loyalty-queries.ts` (NEW — fetches active cents_per_point) |
| **`useUpdateValuationPolicy`** | `hooks/loyalty/use-loyalty-mutations.ts` (NEW — admin policy update mutation) |
| **`usePrintReward`** | `lib/print/hooks/use-print-reward.ts` (NEW — idle/printing/success/error state machine) |

### 1.6 UI Components

| Component | Location | Status |
|---|---|---|
| `PromoExposurePanel` | `components/dashboard/promo-exposure-panel.tsx` | Complete — 6-metric brutalist panel with alerts |
| `LoyaltyPanel` | `components/player-dashboard/loyalty-panel.tsx` | Complete — tier display + balance |
| **`IssueRewardButton`** (Player 360) | `components/player-360/header/issue-reward-button.tsx` | Complete — opens IssueRewardDrawer, threads casinoName/staffName/currentTier (PRD-053 DA patch) |
| **`IssueRewardButton`** (Rating Slip Modal) | `components/modals/rating-slip/rating-slip-modal.tsx` | **Complete (NEW, P2K-32) — visitId threaded from modalData.slip.visitId** |
| **`IssueRewardDrawer`** | `components/loyalty/issue-reward-drawer.tsx` | Complete — 3-step state machine (select→confirm→result), print wiring |
| **`RewardSelector`** | `components/loyalty/reward-selector.tsx` | Complete — catalog grouped by family |
| **`CompConfirmPanel`** | `components/loyalty/comp-confirm-panel.tsx` | **Complete (UPDATED, P2K-30) — dollar input, auto-conversion display, overdraw toggle, DB-sourced cents_per_point** |
| **`EntitlementConfirmPanel`** | `components/loyalty/entitlement-confirm-panel.tsx` | **Complete (UPDATED, P2K-28) — tier-based value lookup via getBalance → entitlementTiers** |
| **`IssuanceResultPanel`** | `components/loyalty/issuance-result-panel.tsx` | **Complete (UPDATED, PRD-053) — printState + onPrint prop, auto-fire via queueMicrotask with useRef guard** |
| `RewardsEligibilityCard` | `components/player-360/rewards/` | Complete |
| `RewardsHistoryList` | `components/player-360/rewards/` | Complete — filter chips for matchplay/freeplay/comp |
| `ExclusionStatusBadge` | `components/player-360/header/exclusion-status-badge.tsx` | Complete — 4 severity levels |
| `ExclusionTile` | `components/player-360/compliance/exclusion-tile.tsx` | Complete — exclusion list, add/lift role-gated |
| **`ValuationSettingsForm`** | `components/admin/valuation-settings-form.tsx` | **Complete (PRD-053) — cents_per_point editor, role-gated read-only mode** |
| **`RewardListClient`** | `components/admin/loyalty/rewards/reward-list-client.tsx` (234 LOC) | **Complete (PRD-LOYALTY-ADMIN-CATALOG) — list + create + status filtering** |
| **`CreateRewardDialog`** | `components/admin/loyalty/rewards/create-reward-dialog.tsx` (241 LOC) | **Complete — family selection (points_comp / entitlement)** |
| **`RewardDetailClient`** | `components/admin/loyalty/rewards/reward-detail-client.tsx` (361 LOC) | **Complete — metadata editor, active toggle** |
| **`PointsPricingForm`** | `components/admin/loyalty/rewards/points-pricing-form.tsx` (136 LOC) | **Complete — points_cost, allow_overdraw** |
| **`TierEntitlementForm`** | `components/admin/loyalty/rewards/tier-entitlement-form.tsx` (322 LOC) | **Complete — tier → face_value_cents, instrument_type mapping** |
| **`ProgramListClient`** | `components/admin/loyalty/promo-programs/program-list-client.tsx` (212 LOC) | **Complete (PRD-LOYALTY-ADMIN-CATALOG) — list + create + status badges** |
| **`CreateProgramDialog`** | `components/admin/loyalty/promo-programs/create-program-dialog.tsx` (264 LOC) | **Complete — program creation** |
| **`ProgramDetailClient`** | `components/admin/loyalty/promo-programs/program-detail-client.tsx` (444 LOC) | **Complete — inline editing (name, status, dates)** |
| **`InventorySummary`** | `components/admin/loyalty/promo-programs/inventory-summary.tsx` (130 LOC) | **Complete — read-only coupon inventory per program** |
| ~~`ManualRewardDialog`~~ | ~~`components/loyalty/manual-reward-dialog.tsx`~~ | **DELETED** — replaced by unified IssueRewardDrawer |

### 1.7 Admin Route Group

| Route | Content | Loyalty-Relevant | Status |
|---|---|---|---|
| `/admin/alerts` | Live cash observation alerts | No | **Operational** |
| `/admin/settings/thresholds` | Alert threshold config (includes promo thresholds) | Partial | **Operational** |
| `/admin/settings/shifts` | Gaming day temporal config | No | **Operational** |
| `/admin/settings/valuation` | Valuation policy editor (PRD-053 EXEC-054) | **Yes** | **Operational** — cents_per_point read/edit, role-gated |
| `/admin/reports` | Measurement reports dashboard (4 ADR-039 metrics) | Partial (loyalty liability) | **Operational** (EXEC-046) |
| `/admin/loyalty/rewards` | Reward catalog list + create dialog | **Yes** | **Operational** (PRD-LOYALTY-ADMIN-CATALOG) |
| `/admin/loyalty/rewards/[id]` | Reward detail + PointsPricingForm + TierEntitlementForm | **Yes** | **Operational** |
| `/admin/loyalty/promo-programs` | Promo program list + create dialog | **Yes** | **Operational** (PRD-LOYALTY-ADMIN-CATALOG) |
| `/admin/loyalty/promo-programs/[id]` | Program detail + inline edit + InventorySummary | **Yes** | **Operational** |

**Sidebar navigation**: Loyalty section appears in OPERATIONAL group → Rewards Catalog + Promo Programs. Admin section in ADMINISTRATIVE group → Alerts, Reports, Settings (tabs: Thresholds, Shifts, Valuation).

### 1.8 Tests

**Legacy tests** (2,231 lines):
- `__tests__/services/loyalty/promo-instruments.test.ts` (885 lines)
- `__tests__/services/loyalty/promo-instruments.int.test.ts` (735 lines)
- `__tests__/services/loyalty/promo-instruments-mappers.test.ts` (611 lines)

**PRD-052 issuance tests**:
- `services/loyalty/__tests__/issue-comp.int.test.ts` — happy path, insufficient balance, inactive reward, not found
- `services/loyalty/__tests__/issue-entitlement.int.test.ts` — happy path, catalog config invalid, role gate (dealer/cashier → FORBIDDEN)
- `services/loyalty/__tests__/issuance-idempotency.int.test.ts` — comp + entitlement idempotency, `Promise.all` concurrent double-debit prevention (NFR-4)
- `app/api/v1/loyalty/issue/__tests__/route.test.ts` — 9 tests: success, role gating, idempotency, validation, entitlement dispatch
- `components/loyalty/__tests__/issue-reward-drawer.test.tsx` — drawer state machine (select→confirm→result)
- `services/player360-dashboard/__tests__/mappers.test.ts` — mapper bug fix validation (`'redeem'` → `'comp'`)

**PRD-053 Vector C print tests** (NEW — 65 tests across 8 suites):
- `lib/print/__tests__/comp-slip.test.ts` — comp slip HTML template rendering
- `lib/print/__tests__/coupon.test.ts` — entitlement coupon HTML template rendering
- `lib/print/__tests__/escape-html.test.ts` — XSS defense (escapeHtml)
- `lib/print/__tests__/iframe-print-ssr.test.ts` — SSR safety (no DOM access)
- `lib/print/__tests__/iframe-print.test.ts` — iframe creation, print dialog, cleanup
- `lib/print/__tests__/print-reward.test.ts` — family-discriminated dispatch
- `lib/print/__tests__/use-print-reward.test.ts` — hook state machine (idle→printing→success/error)
- `components/loyalty/__tests__/issuance-result-panel.test.tsx` — print wiring, auto-fire guard, printState threading

**PRD-053 point conversion tests** (NEW — 20 tests):
- `services/loyalty/__tests__/valuation-policy.test.ts` — getActiveValuationCentsPerPoint, getActiveValuationPolicy
- `services/loyalty/__tests__/valuation-policy-roundtrip.int.test.ts` — end-to-end read/update/read cycle
- `services/loyalty/__tests__/issue-comp-variable-amount.test.ts` — variable-amount branching, rounding, schema validation (16 tests)
- `app/api/v1/loyalty/valuation-policy/__tests__/route.test.ts` — GET/PATCH route handlers, role gating, validation

---

## 2. Critical Gaps

### ~~GAP-1: No Admin UI for Loyalty Instrument Management~~ — RESOLVED (~90%)

**Original Severity**: P0 — blocks operational self-service
**Current Status**: **Operational** — core admin catalog UI delivered (PRD-LOYALTY-ADMIN-CATALOG)

Users CAN now:
- Create and manage rewards (list, create, edit metadata, toggle active) — `/admin/loyalty/rewards`
- Configure points pricing (points_cost, allow_overdraw) — PointsPricingForm
- Configure tier-to-entitlement mappings (tier → face_value_cents, instrument_type) — TierEntitlementForm on reward detail page
- Create and manage promo programs (list, create, edit name/status/dates) — `/admin/loyalty/promo-programs`
- View coupon inventory per program (read-only) — InventorySummary
- Configure valuation policy (cents_per_point) — `/admin/settings/valuation`

**9 components, ~2,344 LOC**, role-gated (admin/pit_boss via route layout guard).

**Remaining sub-gaps (~10%):**
- Coupon policy toggles UI (`promo_require_exact_match`, `promo_allow_anonymous_issuance`) — API at `/api/v1/casino/settings` exists, no frontend
- Earn config UI (`loyalty_earn_config`) — intentionally deferred per frozen decision D2 (earn rates stay on `game_settings` for pilot)
- Tier ladder/hierarchy editor — deferred per PRD §7.2; only inline tier entitlement editing exists on individual reward detail pages

### GAP-2: No Tier-to-Entitlement Auto-Derivation (Partially Addressed)

**Severity**: P2 — downgraded from P1; manual tier-based issuance works

`issueEntitlement()` now uses tier-based lookup via `getBalance()` → `entitlementTiers[].benefit` (P2K-28). The `TierEntitlementForm` admin component allows configuring tier → `face_value_cents` + `instrument_type` mappings per reward.

**What works**: Manual tier-based issuance with catalog-configured values. Admin can set up tier entitlements via reward detail page.
**What's missing**: One-click auto-derivation RPC (`rpc_issue_current_match_play`) that resolves tier, finds program, computes entitlement in a single call.

**Options** (unchanged for RPC design):
- **A (JSONB)**: Add `tier_entitlements jsonb` to `promo_program` — simplest, no joins
- **B (Join table)**: `promo_tier_entitlement (program_id, tier) -> (face_value, match_wager)` — normalized
- **C (One-program-per-tier)**: Multiple programs per tier with `tier_filter` column

Note: `reward_entitlement_tier` table exists (ADR-033) with service CRUD and admin UI (TierEntitlementForm, 322 LOC).

### GAP-3: `rpc_issue_current_match_play` — 0% Implemented

**Severity**: P1 — blocks one-click automated issuance

The auto-derivation RPC that resolves tier, finds active program, computes entitlement, enforces idempotency, and returns a ready-to-print coupon does not exist.

Requires: tier mapping mechanism (GAP-2) + scope decision (gaming-day vs visit).

**Note**: Print infrastructure now exists (GAP-4 resolved). This gap only blocks the one-click automated flow; manual issuance with print works end-to-end.

### ~~GAP-4: Print Infrastructure — 0%~~ — RESOLVED

Resolved by PRD-053 Vector C (`cb0cabc`, 2026-03-20):
- `lib/print/` directory with iframe utility, templates, hooks
- `iframePrint()` creates hidden iframe + triggers browser print dialog
- `compSlipHtml()` and `couponHtml()` HTML template builders
- `usePrintReward()` hook with idle/printing/success/error state machine
- `IssuanceResultPanel` wired with `printState` + `onPrint(payload, mode)` props
- Auto-fire on successful issuance via `queueMicrotask` with `useRef` guard
- **Remaining**: Print history logging (`promo_coupon.metadata.print_history[]`) not yet implemented (best-effort, deferred)

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
| RLS / security | **100%** | Pattern C, ADR-024, delete denied, role-gated, audit_log via DEFINER RPC |
| Core RPCs (CRUD) | **100%** | 7 RPCs operational (+`rpc_update_valuation_policy`, `append_audit_log`), all idempotent |
| One-click RPC | **0%** | `rpc_issue_current_match_play` does not exist |
| Service layer | **97%** | 12 loyalty + 12 promo methods. Variable-amount comp + valuation CRUD operational. Missing: one-click method |
| React hooks | **97%** | Full CRUD + issuance + valuation + print hooks. Missing: one-click hook |
| API routes | **97%** | 10 promo/issuance + 1 valuation admin endpoints. Missing: one-click endpoint |
| Operator issuance UI | **100%** | IssueRewardDrawer + variable-amount comp + rating slip button + print on success |
| Admin config UI | **90%** | Reward catalog CRUD, promo program CRUD, tier entitlement forms, valuation settings — all operational. Missing: coupon policy toggles, earn config (deferred D2) |
| Print infrastructure | **90%** | `lib/print/` operational: iframe, templates, hook, auto-fire. Missing: print history logging |
| Dashboard / rollups | **100%** | PromoExposurePanel + 30s auto-refresh |
| Alert thresholds | **100%** | Promo thresholds in casino_settings |
| Tests | **95%** | Legacy (2,231 lines) + issuance (6 files) + print (65 tests, 8 suites) + valuation (20 tests); no E2E |

---

## 4. Recommended Implementation Sequence

### ~~Phase 1: Admin Configuration Surface (unblocks self-service)~~ — ~90% DONE

Delivered by PRD-LOYALTY-ADMIN-CATALOG. Operational routes:

```
app/(dashboard)/admin/loyalty/
├── rewards/
│   ├── page.tsx              # RewardListClient + CreateRewardDialog ✅
│   └── [id]/page.tsx         # RewardDetailClient + PointsPricingForm + TierEntitlementForm ✅
└── promo-programs/
    ├── page.tsx              # ProgramListClient + CreateProgramDialog ✅
    └── [id]/page.tsx         # ProgramDetailClient + InventorySummary ✅
```

**Remaining (~10%)**:
- `/admin/loyalty/policies` page — coupon policy toggles (`promo_require_exact_match`, `promo_allow_anonymous_issuance`). API exists, no frontend.
- Earn config UI — intentionally deferred per frozen decision D2.
- Tier ladder editor — deferred per PRD §7.2; inline TierEntitlementForm exists on reward detail page.

### Phase 2: Schema + RPC for Tier-Aware Issuance

1. Migration: add `tier_entitlements jsonb` to `promo_program`
2. Migration: `rpc_issue_current_match_play` with idempotency + metadata writes
3. Service + DTO + API route + hook for one-click method

### ~~Phase 3: Print Pipeline (Vector C)~~ — DONE

Delivered by PRD-053 Vector C (`cb0cabc`, 2026-03-20). See GAP-4 resolution above.

Remaining from Phase 3: Print history logging (best-effort metadata append to `promo_coupon.metadata.print_history[]`).

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
| ~~6~~ | ~~Fulfillment CHECK constraint / app enum mismatch~~ | ~~P1~~ | — | **RESOLVED** (P2K-29, migration `20260319202632`) |
| ~~7~~ | ~~Hardcoded CENTS_PER_POINT~~ | ~~P1~~ | — | **RESOLVED** (PRD-053 EXEC-054, DB-sourced via `loyalty_valuation_policy`) |

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

**Contract Surface**: `FulfillmentPayload` (discriminated union) exported from `services/loyalty/dtos.ts` — consumed by Vector C print pipeline (`printReward()` dispatches by family).

---

## 8. Vector C Delivery Summary (PRD-053 — Print Standard)

**Commit**: `cb0cabc` (merged 2026-03-20, PR #30)

| Deliverable | Status |
|---|---|
| `lib/print/` module (iframe utility, escapeHtml, templates, dispatch, hook) | **Deployed** |
| `iframePrint()` — hidden iframe + browser print dialog, PrintJob API | **Deployed** |
| `compSlipHtml()` + `couponHtml()` — HTML template builders with shared styles | **Deployed** |
| `printReward()` — family-discriminated dispatch function | **Deployed** |
| `usePrintReward()` — React hook (idle/printing/success/error state machine) | **Deployed** |
| `IssuanceResultPanel` — printState + onPrint prop wiring, auto-fire with useRef guard | **Deployed** |
| `IssueRewardButton` — threads casinoName/staffName/currentTier to drawer for print context | **Deployed** |
| 65 tests across 8 suites (templates, iframe, dispatch, hook, SSR safety, UI integration) | **Deployed** |
| ADR-045 — pilot reward instrument fulfillment | **Deployed** |

**Design artifacts**: ADR-045, RFC-VECTOR-C, PRD-053, EXEC-053, SCAFFOLD-VECTOR-C, SEC_NOTE, FEATURE_BOUNDARY.

---

## 9. P2K Issuance Fixes Delivery Summary (PR #31)

**Commit**: `2fd1db7` (merged 2026-03-20, PR #31)

| Ticket | Deliverable | Status |
|---|---|---|
| P2K-29 | Fulfillment CHECK constraint aligned to app values (`comp_slip`, `coupon`, `none`) + `23514` error handler | **Deployed** |
| P2K-28 | Tier-based entitlement value lookup via `getBalance()` → `entitlementTiers[].benefit` | **Deployed** |
| P2K-30 | Variable-amount comp: `faceValueCents` + `allowOverdraw` params, dollar input UI, auto-conversion, $100K Zod cap | **Deployed** |
| P2K-32 | IssueRewardButton added to rating slip modal, visitId from `modalData.slip.visitId` | **Deployed** |
| P2K-33 | visitId threaded from `useActiveVisit()` through button → drawer → mutation for audit trail | **Deployed** |

---

## 10. Point Conversion Canonicalization Delivery Summary (PRD-053 EXEC-054)

**Commit**: `5198535` + `2a764fc` (merged 2026-03-21, PR #32)

| Deliverable | Status |
|---|---|
| `getActiveValuationCentsPerPoint()` — fail-closed, returns `VALUATION_POLICY_MISSING` if absent | **Deployed** |
| `getActiveValuationPolicy()` — full DTO for admin form | **Deployed** |
| `updateValuationPolicy()` — atomic rotate via `rpc_update_valuation_policy` | **Deployed** |
| `rpc_update_valuation_policy` — admin-only, SELECT FOR UPDATE concurrency lock | **Deployed** |
| `ValuationSettingsForm` — `/admin/settings/valuation`, role-gated read-only mode | **Deployed** |
| `useValuationRate` / `useUpdateValuationPolicy` hooks | **Deployed** |
| `GET /api/v1/loyalty/valuation-policy` + `PATCH` route handler | **Deployed** |
| Bootstrap seed: `cents_per_point=2` for all casinos, onboarding enforcement migration | **Deployed** |
| CompConfirmPanel updated: reads DB-sourced rate, auto-conversion display | **Deployed** |
| 20 new tests (service layer, route handlers, round-trip) | **Deployed** |

**Key invariant**: No hardcoded `CENTS_PER_POINT` anywhere in codebase. `issueComp()` calls `getActiveValuationCentsPerPoint()` in parallel pre-flight via `Promise.all`.

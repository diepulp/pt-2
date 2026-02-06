---
title: "Match Play One-Click Issue-and-Print — Readiness Report"
status: draft
version: 0.1
date: 2026-02-04
references:
  - LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md
  - MATCHPLAY-PRINT-v0.1.md
  - SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md
---

# Match Play One-Click Issue-and-Print — Readiness Report

## Executive Summary

The PT-2 codebase has **substantial foundation** for promo instruments — the core data model, service layer, API routes, hooks, and dashboard rollups are all in place. What is missing is the **one-click issue-and-print workflow** described in `MATCHPLAY-PRINT-v0.1.md`: the tier-aware auto-issuance RPC, the print button UI, and the iframe print infrastructure.

---

## 1. What EXISTS Today

### 1.1 Database Layer (fully operational)

| Asset | Status | Migration |
|---|---|---|
| `promo_program` table | Deployed | `20260106235611_loyalty_promo_instruments.sql` |
| `promo_coupon` table | Deployed | Same migration |
| `promo_type_enum` (`match_play`) | Deployed | Same migration |
| `promo_coupon_status` enum (`issued`, `voided`, `replaced`, `expired`, `cleared`) | Deployed | Same migration |
| `player_loyalty.tier` column | Deployed | `20251213003000_prd004_loyalty_service_schema.sql` |
| `casino_settings.promo_require_exact_match` | Deployed | `20260106235906_alert_thresholds_settings.sql` |
| `casino_settings.promo_allow_anonymous_issuance` | Deployed | Same migration |
| `casino_settings.alert_thresholds` (promo thresholds) | Deployed | Same migration |

### 1.2 RPCs (4 promo + 1 rollup)

| RPC | Purpose | Security |
|---|---|---|
| `rpc_issue_promo_coupon` | Issue coupon with explicit parameters | DEFINER + ADR-024 |
| `rpc_void_promo_coupon` | Void a coupon | DEFINER + ADR-024 |
| `rpc_replace_promo_coupon` | Atomic void + re-issue | DEFINER + ADR-024 |
| `rpc_promo_coupon_inventory` | Program-level inventory counts | DEFINER + ADR-024 |
| `rpc_promo_exposure_rollup` | Shift dashboard exposure metrics | DEFINER + ADR-024 |

### 1.3 Service Layer (`services/loyalty/promo/`)

Complete module with 11 PromoService methods:

| File | Lines | Purpose |
|---|---|---|
| `dtos.ts` | 497 | All DTOs: PromoProgramDTO, PromoCouponDTO, Issue/Void/Replace inputs/outputs, inventory, exposure rollup |
| `crud.ts` | 651 | 11 CRUD functions calling RPCs, domain error mapping |
| `mappers.ts` | 457 | RPC response parsing, type guards, row-to-DTO mappers |
| `schemas.ts` | 89 | Zod validation schemas for all operations |
| `http.ts` | 262 | Client-side HTTP fetchers for promo API endpoints |
| `index.ts` | ~60 | PromoService factory exporting all methods |

### 1.4 React Hooks (`hooks/loyalty/promo-instruments/`)

| Hook | File |
|---|---|
| `usePromoPrograms`, `usePromoProgram` | `use-promo-programs.ts` |
| `usePromoCoupons`, `usePromoCoupon`, `usePromoCouponByValidation`, `usePromoCouponInventory` | `use-promo-coupons.ts` |
| `useCreatePromoProgram`, `useUpdatePromoProgram`, `useIssueCoupon`, `useVoidCoupon`, `useReplaceCoupon` | `use-promo-mutations.ts` |
| `usePromoExposure` | `use-promo-exposure.ts` |
| `useDashboardPromoExposure` | `hooks/dashboard/use-promo-exposure.ts` |

### 1.5 API Routes

| Route | Methods |
|---|---|
| `/api/v1/promo-programs` | GET, POST |
| `/api/v1/promo-programs/[id]` | GET, PATCH |
| `/api/v1/promo-coupons` | GET, POST |
| `/api/v1/promo-coupons/[id]` | GET |
| `/api/v1/promo-coupons/[id]/void` | POST |
| `/api/v1/promo-coupons/[id]/replace` | POST |

### 1.6 UI Components

| Component | Location | Status |
|---|---|---|
| `PromoExposurePanel` | `components/dashboard/promo-exposure-panel.tsx` | Complete — issued/outstanding/expiring/voided metrics |
| `LoyaltyPanel` | `components/player-dashboard/loyalty-panel.tsx` | Complete — tier display (bronze/silver/gold/platinum/diamond) + balance |
| `IssueRewardButton` | `components/player-360/header/issue-reward-button.tsx` | Stub — `enabled=false`, "Coming soon" tooltip |
| `RewardsEligibilityCard` | `components/player-360/rewards/rewards-eligibility-card.tsx` | Complete |
| `RewardsHistoryList` | `components/player-360/rewards/rewards-history-list.tsx` | Complete — filter chips for matchplay/freeplay |

---

## 2. Gap Analysis

### GAP-1: `rpc_issue_current_match_play` RPC — CRITICAL

**Exec-spec requirement** (MATCHPLAY-PRINT-v0.1 §Server contract): A single RPC that derives entitlement from tier + policy, enforces idempotency, and returns a ready-to-print coupon.

**Current state**: Only `rpc_issue_promo_coupon` exists — it requires the caller to provide `p_promo_program_id`, `p_face_value`, `p_required_match_wager_amount` explicitly. There is no auto-derivation logic.

**What is needed**:
- New SECURITY DEFINER RPC: `rpc_issue_current_match_play(p_player_id uuid, p_visit_id uuid DEFAULT NULL)`
- Tier resolution: read `player_loyalty.tier` for the player in the casino
- Program selection: find the active `match_play` promo_program for the casino
- Entitlement computation: map tier to face_value + match_wager amounts
- Idempotency: return existing "on file" coupon or issue a new one
- Metadata writes: `channel`, `tier`, `policy_version`, `computed_at`

### GAP-2: Tier-to-Entitlement Mapping — CRITICAL

**Current state**: `promo_program` stores a single `face_value_amount` and `required_match_wager_amount` per program. There is no `constraints` JSONB column and no tier ladder.

**The exec spec assumes**: "Resolve player's current tier → Compute entitlement (face_value_amount + required_match_wager_amount)"

**Options**:
- **Option A (JSONB)**: Add `tier_entitlements jsonb` to `promo_program` storing `{"gold": {"face_value": 25, "match_wager": 25}, "platinum": {"face_value": 50, "match_wager": 50}, ...}`
- **Option B (Join table)**: Create `promo_tier_entitlement` table: `(program_id, tier) → (face_value, match_wager)`
- **Option C (One-program-per-tier)**: Multiple `promo_program` rows per tier level (e.g., "Gold MP $25", "Platinum MP $50") with a `tier_filter text` column. The RPC selects the program matching the player's tier.

### GAP-3: "Print Match Play" Button — CRITICAL

**Current state**: No print button exists. The `IssueRewardButton` (`components/player-360/header/issue-reward-button.tsx`) is a generic stub, not the specific one-click action.

**What is needed**: New button component added to two entry points:
- Rating Slip modal (`components/modals/rating-slip/rating-slip-modal.tsx`)
- Player Dashboard (`components/player-dashboard/`)

Must trigger the single-RPC → iframe-print flow with zero staff input.

### GAP-4: Iframe Print Infrastructure — CRITICAL

**Current state**: No print functionality exists anywhere in the codebase.

**What is needed**:
- **Print template builder**: function taking coupon + player data → HTML string
- **Iframe print utility**: create hidden iframe, write HTML, wait for readiness (fonts + 2x animation frame), call `print()`, cleanup
- **Template content**: casino name, player display name, face value, required match wager, validation number (monospaced), expiry (if present), issued timestamp
- **CSS**: minimal styles, system fonts, explicit `@page` margins, tolerant of 95–105% scaling
- **Optional (v0 decision)**: QR/barcode for validation number

### GAP-5: Print History Logging — MEDIUM

**Current state**: `promo_coupon.metadata` column exists (JSONB), but there is no logic to append `print_history[]` entries.

**What is needed**:
- RPC or service method to append `{printed_at, printed_by_staff_id, channel, device_hint}` to `metadata.print_history[]`
- Best-effort client-side call after print dialog opens (non-blocking — printing must not be gated on this write)
- API route for the print log event

### GAP-6: Service/Hook/API Wiring for New RPC — MEDIUM

| Layer | What is Needed |
|---|---|
| Service CRUD | New function calling `rpc_issue_current_match_play` |
| DTOs | `IssueCurrentMatchPlayInput` (`playerId`, `visitId?`) / `IssueCurrentMatchPlayOutput` (coupon row) |
| Mappers | Parser for the new RPC response |
| Schemas | Zod schema for input validation |
| HTTP client | New fetcher method in `services/loyalty/promo/http.ts` |
| React hook | `useIssueCurrentMatchPlay()` mutation hook |
| API route | New endpoint, e.g. `POST /api/v1/promo-coupons/issue-current-match-play` |

### GAP-7: "On File" Scope Decision — LOW (design decision)

The exec spec offers two options:
- **Option A (gaming-day scope)**: One outstanding MP per player per gaming day
- **Option B (visit scope)**: One outstanding MP per visit (requires `p_visit_id`)

Both are structurally supported — `promo_coupon` already has `player_id` and `visit_id` columns. A decision must be made before implementing the RPC's idempotency logic.

---

## 3. Structural Readiness Matrix

| Dimension | Readiness | Notes |
|---|---|---|
| Data model (tables/enums) | **90%** | Only missing: tier entitlement mapping mechanism |
| RLS / security | **100%** | Casino-scoped, ADR-024 pattern established for all promo RPCs |
| Core RPCs (CRUD) | **100%** | Issue/void/replace/inventory all operational |
| One-click RPC | **0%** | `rpc_issue_current_match_play` does not exist |
| Service layer | **85%** | Full promo service exists; needs one new method |
| React hooks | **85%** | All CRUD hooks exist; needs one new mutation hook |
| API routes | **85%** | Full REST surface; needs one new endpoint |
| UI (button) | **10%** | Only generic stub exists, not the print-specific action |
| Print infrastructure | **0%** | No iframe printing, no template builder, no print utility |
| Print audit trail | **0%** | No print history logic |
| Dashboard / rollups | **100%** | `PromoExposurePanel` + `rpc_promo_exposure_rollup` operational |
| Alert thresholds | **100%** | Configured in `casino_settings.alert_thresholds` |
| Tests (promo) | **Partial** | Loyalty CRUD/mapper tests exist; promo-specific unit tests not verified; no E2E for print flow |

---

## 4. Recommended Implementation Order

| Step | Scope | Depends On |
|---|---|---|
| 1. Design decisions | Tier mapping approach, scope window, replacement behavior, QR/barcode | — |
| 2. Schema migration | Add tier entitlement mapping to `promo_program` (or new table) | Step 1 |
| 3. RPC migration | Create `rpc_issue_current_match_play` with idempotency + metadata writes | Step 2 |
| 4. Service + DTO + API route | Wire the new RPC through all layers | Step 3 |
| 5. Print utility | Build iframe print infrastructure (`lib/print/`) | — (parallel with 2–4) |
| 6. Print template | HTML template builder for match play coupon | Step 5 |
| 7. "Print Match Play" button | Add to Rating Slip modal + Player Dashboard | Steps 4, 6 |
| 8. Print logging | Best-effort append to `metadata.print_history[]` | Step 7 |
| 9. Tests | Unit tests for RPC wiring, integration test for idempotency, smoke test for print | Steps 7, 8 |

---

## 5. Open Decisions Requiring Input

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | Tier-to-entitlement mapping | A (JSONB column), B (join table), C (one-program-per-tier) | Option A — JSONB on `promo_program` keeps the schema simple and avoids join overhead |
| 2 | Scope window | A (gaming-day), B (visit) | Exec spec recommends picking one; gaming-day is simpler operationally |
| 3 | Replacement behavior | 1 (honor issued), 2 (auto-replace on policy change) | Exec spec recommends Behavior 1 (honor issued) unless ops demands otherwise |
| 4 | QR/barcode | Include in v0, defer | Defer unless floor benefits from scan speed |

---

## 6. Risk Notes

- **`loyalty_outbox`** is listed in the SRM and written to by promo RPCs but is **missing from generated types** (`database.types.ts`). This may indicate a type generation issue — verify with `npm run db:types` before implementation.
- **SRM terminology drift**: The SRM references `points_earned` but the actual schema uses `points_delta`. Minor, but should be corrected to avoid confusion.
- **`ManualRewardDialog`** (`components/loyalty/manual-reward-dialog.tsx`) is a partial stub — it does not call the actual RPC. Not blocking for match play print, but flagged for awareness.

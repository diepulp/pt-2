---
title: "Loyalty & Rewards System — Comprehensive Overview and Analysis"
doc_kind: "investigation-report"
version: "v1.0"
date: "2026-02-05"
status: "complete"
owner: "PT-2"
method: "3-agent parallel investigation (DB layer, service layer, policy/vision)"
references:
  - "docs/10-prd/PRD-004-loyalty-service.md"
  - "docs/00-vision/LoyaltyService_Points_Policy_PT-2.md"
  - "docs/80-adrs/ADR-019-loyalty-points-policy_v2.md"
  - "docs/00-vision/loyalty-service-extension/LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md"
  - "docs/00-vision/loyalty-service-extension/MATCHPLAY-PRINT-v0.1.md"
  - "docs/00-vision/loyalty-service-extension/MATCHPLAY-PRINT-READINESS-REPORT.md"
  - "docs/issues/gaps/ghost-gaming-comp-wiring/COMP-VISIT-WIRING-PATCH.md"
  - "docs/issues/gaps/GHOST-GAMING-WIRING-PATCH.md"
tags:
  - loyalty
  - rewards
  - promo-instruments
  - investigation
  - system-overview
---

# PT-2 Loyalty & Rewards System — Comprehensive Overview

## Executive Summary

The loyalty system is built on a **4-path ledger model** where players earn points through gameplay and spend them on comps. Alongside the points ledger, a **promo instruments** extension handles physical promotional tools like match play coupons. These are two related but distinct subsystems under a single bounded context.

The system has **deep plumbing and shallow surfaces**. The database, service layer, and API are mature. What is missing is the reward domain model (taxonomy, catalog, tier rules) and the operator-facing UI that turns infrastructure into workflows. Three downstream features (match play print, comp visit wiring, ghost gaming conversion) all converge on the same gap: before building *how* to issue rewards, the system needs to define *what* rewards are.

---

## 1. The Two Pillars

### Pillar 1: Points Ledger

An append-only transaction log (`loyalty_ledger`) tracking every point earned and spent, with a balance cache (`player_loyalty`) per player per casino.

| Path | Direction | Trigger | Example |
|------|-----------|---------|---------|
| Base Accrual | Credit (+) | Rating slip close | Player plays 2 hours, earns 2,100 points |
| Promotion | Credit (+) | Campaign overlay | 2x multiplier event adds bonus points |
| Redemption (Comp) | Debit (-) | Pit boss issues comp | Meal comp costs 500 points |
| Manual Credit | Credit (+) | Service recovery | Pit boss awards 300 goodwill points |

Points are minted deterministically from a **policy snapshot** captured at slip creation:

```
base_points = round(theo x points_conversion_rate)
theo = average_bet x (house_edge / 100) x duration_hours x decisions_per_hour
```

### Pillar 2: Promo Instruments

Physical or virtual promotional coupons (match play; future: nonnegotiable, free bet) with their own lifecycle (`issued -> voided/replaced/expired/cleared`). These are **not points** -- they have face values in dollars and represent casino marketing exposure.

---

## 2. What Is Built and Working

### 2.1 Database Layer

| Asset | State | Migration |
|-------|-------|-----------|
| `loyalty_ledger` (append-only ledger) | Deployed | `20251213003000` |
| `player_loyalty` (balance cache, PK: player_id + casino_id) | Deployed | `20251213003000` |
| `promo_program` (instrument templates) | Deployed | `20260106235611` |
| `promo_coupon` (issued instrument instances) | Deployed | `20260106235611` |
| `mv_loyalty_balance_reconciliation` (materialized view) | Deployed | `20251213003000` |
| `loyalty_reason` enum (6 values) | Deployed | `20251213003000` |
| `promo_type_enum` (`match_play`) | Deployed | `20260106235611` |
| `promo_coupon_status` enum (5 values) | Deployed | `20260106235611` |
| Casino settings: `promo_require_exact_match`, `promo_allow_anonymous_issuance`, `alert_thresholds` | Deployed | `20260106235906` |

**14 RPCs deployed:**

| RPC | Security | Purpose |
|-----|----------|---------|
| `rpc_accrue_on_close` | INVOKER + ADR-024 | Mint points on slip close; idempotent; skips compliance_only |
| `rpc_redeem` | INVOKER + ADR-024 | Comp issuance with overdraw support; row-level lock |
| `rpc_manual_credit` | INVOKER + ADR-024 | Service recovery credits; note required |
| `rpc_apply_promotion` | INVOKER + ADR-024 | Campaign bonus points; one per campaign per slip |
| `rpc_reconcile_loyalty_balance` | INVOKER + ADR-024 | Force balance recalc from ledger sum |
| `rpc_get_player_ledger` | INVOKER + ADR-024 | Paginated ledger retrieval |
| `rpc_issue_mid_session_reward` | INVOKER + ADR-024 | Mid-session points issuance (legacy) |
| `evaluate_session_reward_suggestion` | INVOKER, STABLE | Read-only theo/points preview for UI |
| `rpc_get_visit_loyalty_summary` | INVOKER | Sum of positive points_delta for a visit |
| `rpc_issue_promo_coupon` | DEFINER + ADR-024 | Issue coupon; idempotent; validates program active/dates |
| `rpc_void_promo_coupon` | DEFINER + ADR-024 | Void issued coupon; idempotent |
| `rpc_replace_promo_coupon` | DEFINER + ADR-024 | Replace coupon; creates new, marks old as replaced |
| `rpc_promo_coupon_inventory` | INVOKER | Inventory summary by status |
| `rpc_promo_exposure_rollup` | INVOKER | Dashboard promo exposure metrics |

**RLS coverage:** Full casino-scoped isolation. Append-only enforcement (UPDATE/DELETE denied) on ledger. Pattern C hybrid on all policies. Auth-hardened write paths per ADR-030.

### 2.2 Service Layer

| Module | Methods | DTOs | Mappers | Schemas | HTTP Fetchers |
|--------|---------|------|---------|---------|---------------|
| `services/loyalty/` (core) | 8 CRUD | 33 | 12 | 8 | 7 |
| `services/loyalty/promo/` | 11 CRUD | 19 | 11 | 9 | 11 |
| **Total** | **19** | **52** | **23** | **17** | **18** |

### 2.3 React Hooks and API Routes

| Category | Count | State |
|----------|-------|-------|
| React Query hooks | 20 | Complete |
| Complete API routes | 16 | Complete |
| Stub API routes | 2 | `/balances` returns null, `/mid-session-reward` returns null |

### 2.4 What Operators See Today

| What operators see | Backed by |
|--------------------|-----------|
| Points balance on player dashboard | `usePlayerLoyalty` -> `player_loyalty` |
| Tier badge (bronze -> diamond) | `player_loyalty.tier` column |
| Automatic point accrual on slip close | `rpc_accrue_on_close` fired by `use-close-with-financial` |
| Promo exposure metrics on shift dashboard | `rpc_promo_exposure_rollup` -> `PromoExposurePanel` |

### 2.5 What Operators Cannot Do Yet

| Action | Infrastructure exists? |
|--------|----------------------|
| Issue a comp (redeem points) | Service + hook + API route ready. **No UI workflow.** |
| Award manual credits | Service ready. `ManualRewardDialog` is a **stub** (no RPC call). |
| View ledger history | Service + hooks ready. **No UI panel.** |
| Issue/void/replace promo coupons | Full service + API + hooks ready. **No management UI.** |
| Print a match play coupon | **Nothing exists** -- no RPC, no print infra, no button. |
| Browse a reward catalog | **Nothing exists** -- comp types are free-form JSONB metadata. |

---

## 3. The Gap: No Reward System

The ledger tracks *that* points move. The promo system tracks *that* coupons are issued. But there is no **reward system** tying them together -- no answer to "what can this player receive, and what does it cost?"

### 3.1 Missing: Reward Taxonomy

Comp types (`Meal`, `Show`, `Hotel`, `Beverage`) appear only as free-text strings in ledger metadata. There is:

- No `reward_catalog` table or formal type enum
- No point-cost association per reward type
- No eligibility rules (tier-gated rewards, time-of-day restrictions)
- No browse/select UI for pit bosses

The vision doc mentions a `reward_issuance` table for unified audit trail but explicitly defers it. The `IssueRewardButton` in Player 360 says "Coming soon" and is permanently disabled.

### 3.2 Missing: Tier Progression

`player_loyalty.tier` is a text column that stores a value (`bronze`, `silver`, `gold`, `platinum`, `diamond`) but:

- No logic determines or updates tier based on play history
- No tier thresholds are defined anywhere in the database
- No tier-to-benefit mapping exists (what does Gold get that Silver doesn't?)
- PRD-004 lists tier progression as an explicit **non-goal**

### 3.3 Missing: Tier-to-Entitlement Bridge

The match play readiness report identifies this as **critical**: `promo_program` stores a single face value per program. There is no mechanism to say "Gold tier gets $25 match play, Platinum gets $50." Three options are proposed (JSONB column, join table, one-program-per-tier) but none implemented.

### 3.4 Missing: Points Conversion Rate Governance

Baseline conversion parameters (`house_edge`, `decisions_per_hour`, `points_conversion_rate`) live in `game_settings` rows seeded by migration. There is:

- No admin UI to configure these values
- No mechanism for pit boss override of `decisions_per_hour` (documented as 20-50% accuracy impact on theo)
- No per-tier multiplier logic (the `point_multiplier` column exists but is unused)

---

## 4. Downstream Features Waiting on This

Three planned features are blocked or significantly complicated by the reward system gap:

### 4.1 Match Play One-Click Print

Needs: tier-to-entitlement mapping, `rpc_issue_current_match_play` (auto-derives coupon from tier + policy), print infrastructure. The readiness report scores this at **0%** for the one-click path despite 85%+ infrastructure readiness.

### 4.2 Comp/Reward Visit Wiring (COMP-VISIT-WIRING-PATCH)

Needs: a working comp issuance workflow. The backend is ready (`createRewardVisit()`, `convertRewardToGaming()` both functional in CRUD), but the comp visit concept only makes sense when operators can actually issue comps -- which requires the reward catalog and redemption UI that don't exist.

### 4.3 Ghost Gaming Conversion (GHOST-GAMING-WIRING-PATCH)

Needs: loyalty accrual boundary rules enforced at conversion time. The infrastructure supports this (ghost visits are excluded from accrual via ADR-014 guard), but the conversion-to-rated flow needs the loyalty system to correctly handle "accrual starts from conversion timestamp forward" -- which is defined in policy but has no integration test.

---

## 5. Critical Bugs and Technical Debt

### P0: `loyalty_outbox` Table Missing

Three promo RPCs (`rpc_issue_promo_coupon`, `rpc_void_promo_coupon`, `rpc_replace_promo_coupon`) insert into `loyalty_outbox`, which was **dropped in migration `20251213003000` and never recreated**. These RPCs will fail at runtime with "relation loyalty_outbox does not exist." The SRM still lists the table as deployed.

### P1: Divergent Mid-Session Reward Module

`services/loyalty/mid-session-reward.ts` defines its own `LoyaltyReason` enum (`mid_session`, `session_end`, `manual_adjustment`) that conflicts with the canonical enum (`base_accrual`, `promotion`, `redeem`, `manual_reward`, `adjustment`, `reversal`). Its API route is a stub returning null. This module is dead code that should be reconciled or removed.

### P2: Inconsistent Lazy-Create Pattern

`rpc_accrue_on_close` hard-fails if `player_loyalty` is missing (correct per ADR-024), but `rpc_manual_credit` and `rpc_apply_promotion` silently create the record. Inconsistent behavior across paths.

### P2: Materialized View Never Refreshed

`mv_loyalty_balance_reconciliation` exists for drift detection but has no refresh mechanism -- it is stale after the first ledger entry.

### P2: `player_loyalty` INSERT RLS Policy Relaxed

Auth-hardening migration `20260129193824` changed the INSERT policy from role-gated (`pit_boss`, `admin`) to an EXISTS subquery through `player_casino` without role restriction. More permissive than originally designed, though mitigated by RPCs having their own role checks.

### P3: `rpc_issue_mid_session_reward` Missing Explicit SECURITY Keyword

Defaults to INVOKER by PostgreSQL convention, but does not follow the explicit declaration pattern used by all other loyalty RPCs.

---

## 6. Cross-Context Dependency Map

```
CasinoService (game_settings, casino_settings)
    |
    +--> RatingSlipService (policy_snapshot at creation)
    |        |
    |        +--> LoyaltyService (base accrual on close)
    |                |
    |                +--> loyalty_ledger (append-only)
    |                +--> player_loyalty (balance cache)
    |                +--> promo_program / promo_coupon (instruments)
    |
    +--> LoyaltyService (promo policy controls)

VisitService (visit_kind filtering)
    |
    +--> LoyaltyService (only gaming_identified_rated eligible)

PlayerService (player identity)
    |
    +--> LoyaltyService (player_id for ledger/promo)

LoyaltyService consumers:
    +--> PRD-008 (modal: balance display, suggestion RPC)
    +--> PRD-023 (Player 360: rewards eligibility, history)
    +--> PRD-026 (Shift Dashboard: promo exposure panel)
    +--> PlayerTimelineService (timeline events)
```

---

## 7. Active Integration Points

| Integration | Where | What happens |
|-------------|-------|-------------|
| Slip close -> accrual | `hooks/rating-slip-modal/use-close-with-financial.ts` | Fire-and-forget `accrueOnClose()` after slip close; non-blocking |
| Player move -> accrual | `hooks/rating-slip-modal/use-move-player.ts` | Closes old slip, triggers loyalty accrual |
| Player dashboard | `hooks/player-dashboard/use-player-dashboard.ts` | Composes loyalty balance into dashboard aggregate |
| Loyalty panel | `components/player-dashboard/loyalty-panel.tsx` | Tier badge + points balance display |
| Promo dashboard | `components/dashboard/promo-exposure-panel.tsx` | 6 metric cards + alert thresholds |
| BFF modal data | `app/api/v1/rating-slips/[id]/modal-data/route.ts` | Aggregates loyalty from 5 bounded contexts |

### Unwired Hooks (service layer exists, hooks exist, no UI consumer)

| Hook | Purpose | Missing |
|------|---------|---------|
| `useRedeem()` | Comp redemption | No UI comp workflow |
| `useManualCredit()` | Service recovery credits | `ManualRewardDialog` stub, not wired |
| `useApplyPromotion()` | Campaign overlay | No UI workflow |
| `useLoyaltyLedger()` | View ledger entries | No ledger UI panel |
| `useLoyaltyLedgerInfinite()` | Infinite scroll ledger | No ledger UI panel |
| All promo program hooks | Program CRUD | No promo management UI |
| All promo coupon hooks | Coupon lifecycle | No coupon management UI |
| `usePromoCouponInventory()` | Inventory summary | No UI + missing API route |

---

## 8. Unresolved Decisions

| # | Decision | Context | Status |
|---|----------|---------|--------|
| 1 | Tier-to-entitlement mapping for match play | JSONB on `promo_program`, join table, or one-program-per-tier? | Open |
| 2 | "On file" scope for match play | One outstanding MP per gaming-day or per visit? | Open |
| 3 | Match play replacement behavior | Honor issued (default) or auto-replace on policy change? | Open |
| 4 | QR/barcode on printed coupons | Required in v0 or deferred? | Open |
| 5 | `decisions_per_hour` pit boss override | No mechanism; 20-50% accuracy impact | Open |
| 6 | Game settings admin UI | No UI to configure `house_edge`, `decisions_per_hour`, etc. | Open |
| 7 | ADR for loyalty initialization timing | When `player_loyalty` is created | Open (ISSUE-B5894ED8 P2) |
| 8 | `rpc_issue_mid_session_reward` deprecation | Legacy RPC with old schema | P3 Post-MVP |
| 9 | Formal comp type enum/catalog | Comp types currently free-form in JSONB metadata | Not addressed |
| 10 | `loyalty_campaign` / `loyalty_tier` tables | Tier progression and campaign management | Post-MVP |
| 11 | Point expiration / decay policies | No decay mechanism | PRD-004 non-goal |

---

## 9. Maturity Matrix

```
                          POLICY    DB     SERVICE   HOOKS/API   UI
                          ------    --     -------   ---------   --
Points Ledger             100%      100%    100%      100%       20%
Promo Instruments         100%      100%    100%      100%       20%
Reward Taxonomy             0%        0%      0%        0%        0%
Tier Progression            0%       10%      0%        0%       10%
Comp Issuance Workflow    100%      100%    100%      100%        0%
Match Play Print          100%        0%      0%        0%        0%
Points Config Admin         0%      100%      0%        0%        0%
```

---

## 10. Governance Documents

| Document | Type | Status | Key Contribution |
|----------|------|--------|------------------|
| `LoyaltyService_Points_Policy_PT-2.md` | Policy | Accepted | Canonical 4-path ledger model, theo formula |
| `ADR-019-loyalty-points-policy_v2.md` | ADR | Accepted | DB-authoritative minting, 7 audit patches |
| `ADR-014-Ghost-Gaming-Visits.md` | ADR | Accepted | Visit archetype loyalty eligibility rules |
| `PRD-004-loyalty-service.md` | PRD | Proposed v3.0.0 | 20 FRs, 4 NFRs, RPC contracts, error codes |
| `LOYALTY_PROMO_INSTRUMENTS_EXTENSION_v0.1_REDACTED.md` | Vision | Draft | Promo instruments data model and lifecycle |
| `MATCHPLAY-PRINT-v0.1.md` | Vision | Draft | One-click print workflow spec |
| `MATCHPLAY-PRINT-READINESS-REPORT.md` | Report | Draft | Gap analysis for match play print |
| `SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md` | Patch | v0.1 | Operational alerting thresholds |
| `EXECUTION-SPEC-LOYALTY-PROMO.md` | Exec-spec | Scaffold | 8 workstreams (all executed) |

---

## 11. Migration Chain (Loyalty/Promo — Chronological)

| # | Migration | What It Does |
|---|-----------|-------------|
| 1 | `20251109214028` | Creates `loyalty_outbox`, `finance_outbox`, `evaluate_mid_session_reward_policy` |
| 2 | `20251211153228` | Adds RLS to loyalty_outbox |
| 3 | `20251212080915` | SEC-006 hardening: denial policies on loyalty_outbox |
| 4 | `20251213000820` | Adds cashier role to loyalty RLS |
| 5 | `20251213000830` | Expands loyalty_reason enum (moot -- greenfield drops it) |
| 6 | `20251213003000` | **GREENFIELD RESET**: Drops and recreates loyalty_ledger, player_loyalty, loyalty_reason. Drops loyalty_outbox. Creates mv_loyalty_balance_reconciliation. |
| 7 | `20251213010000` | Creates all 7 core loyalty RPCs + calculate_theo_from_snapshot |
| 8 | `20251214195201` | Fixes broken RLS policies (NULLIF + app_metadata path) |
| 9 | `20251216073543` | ADR-014 ghost visit guard |
| 10 | `20251221173703` | ADR-015 self-injection added to all 7 loyalty RPCs |
| 11 | `20251222142643` | Creates rpc_get_visit_loyalty_summary |
| 12 | `20251227170749` | Fixes policy_snapshot population in rpc_start_rating_slip |
| 13 | `20251227170840` | Hardens JSON casting in calculate_theo_from_snapshot |
| 14 | `20251227171805` | Adds accrual_kind column to rating_slip |
| 15 | `20251228225241` | Fixes rpc_accrue_on_close player_id lookup (JOIN visit) |
| 16 | `20251229020455` | Fixes rpc_create_player to atomically create player_loyalty |
| 17 | `20251229154020` | **ADR-024 FINAL**: All 7 loyalty RPCs use set_rls_context_from_staff() |
| 18 | `20260106235611` | **PROMO INSTRUMENTS**: promo_program, promo_coupon + 4 RPCs |
| 19 | `20260106235906` | Alert thresholds + promo policy columns on casino_settings |
| 20 | `20260107001809` | Creates rpc_promo_exposure_rollup |
| 21 | `20260129193824` | AUTH HARDENING: Updates loyalty_ledger and player_loyalty RLS |

---

## 12. Test Coverage

| Test File | Scope |
|-----------|-------|
| `services/loyalty/__tests__/crud.test.ts` | Core CRUD unit tests |
| `services/loyalty/__tests__/mappers.test.ts` | Mapper unit tests |
| `services/loyalty/__tests__/http-contract.test.ts` | HTTP contract tests |
| `services/loyalty/__tests__/mid-session-reward.test.ts` | Mid-session module tests |
| `services/loyalty/__tests__/loyalty-accrual-lifecycle.integration.test.ts` | Accrual lifecycle integration |
| `services/loyalty/__tests__/points-accrual-calculation.integration.test.ts` | Points calculation integration |
| `__tests__/services/loyalty/promo-instruments-mappers.test.ts` | Promo mapper tests |
| `__tests__/services/loyalty/promo-instruments.int.test.ts` | Promo integration tests |
| `__tests__/services/loyalty/promo-instruments.test.ts` | Promo unit tests |
| API route tests | accrue, redeem, manual-credit, promotion, suggestion, ledger, balances, mid-session-reward, player loyalty balance |

**Missing test coverage:**
- No E2E tests for any loyalty workflow
- No integration test for ghost-to-rated loyalty boundary
- No test for `loyalty_outbox` failure (P0 bug)
- No refresh test for `mv_loyalty_balance_reconciliation`

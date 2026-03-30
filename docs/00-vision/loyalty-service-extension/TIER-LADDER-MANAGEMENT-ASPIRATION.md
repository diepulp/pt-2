# Tier Ladder Management — Aspirational Design Brief

**Date:** 2026-03-22
**Status:** Aspirational — propagation document for further development
**Scope:** Casino-wide tier ladder management, tier progression, one-click auto-derivation
**Prerequisite Decision:** D1 (tier-to-entitlement mapping approach on `promo_program`) — UNRESOLVED

---

## 1. Context & Motivation

The PT-2 loyalty system has **strong tier infrastructure** already deployed but no **casino-wide tier management surface**. Tier configuration currently happens inline on individual reward detail pages via `TierEntitlementForm`. What's missing is the ability for an admin to see and manage tier policy holistically: the full ladder, progression thresholds, tier assignments, and a one-click issuance path that resolves everything from the player's tier.

### What Exists Today (Verified)

| Layer | Asset | Status | Evidence |
|-------|-------|--------|----------|
| **DB: `reward_entitlement_tier`** | Table with UNIQUE(casino_id, reward_id, tier), JSONB `benefit`, full RLS | Operational | ADR-033 migration `20260206005751` |
| **DB: `player_loyalty.tier`** | Nullable text column, values: bronze/silver/gold/platinum/diamond | Operational | PRD-004 migration `20251213003000` |
| **Types: `TierLevel`** | `'bronze' \| 'silver' \| 'gold' \| 'platinum' \| 'diamond'` (frozen D2) | Operational | `services/loyalty/reward/dtos.ts:20-28` |
| **Types: `EntitlementBenefit`** | `{ face_value_cents: number; instrument_type: 'match_play' \| 'free_play' }` | Operational | `services/loyalty/reward/dtos.ts:40-44` |
| **Service: RewardService CRUD** | `getReward()`, `createReward()`, `updateReward()`, `listEligibleRewards()` — all handle `entitlementTiers` | Operational | `services/loyalty/reward/crud.ts` |
| **Component: `TierEntitlementForm`** | Per-reward tier-to-benefit editor (322 LOC) | Operational | `components/admin/loyalty/rewards/tier-entitlement-form.tsx` |
| **Issuance: P2K-28 tier lookup** | `issueEntitlement()` reads player tier → finds matching `entitlementTiers[].benefit` | Operational | `services/loyalty/promo/crud.ts` |
| **Validation: Zod schemas** | `entitlementTierSchema`, `benefitSchema`, `eligibilitySchema` with tier enums | Operational | `services/loyalty/reward/schemas.ts` |
| **Seed: tier-based rewards** | `MP_TIER_DAILY` (silver/gold/platinum) + `FP_TIER_DAILY` (silver/gold/platinum) | Operational | `supabase/seed.sql:668-683` |
| **Seed: player tiers** | Bronze, Silver, Gold, Platinum, Diamond assigned to test players | Operational | `supabase/seed.sql:216-254` |

### What's Missing

| Gap | Impact | Blocking |
|-----|--------|----------|
| **Casino-wide tier ladder view** | Admin cannot see all tiers, their thresholds, or progression rules in one place | Holistic tier policy management |
| **Tier progression thresholds** | No `tier_threshold` table or config defining when a player advances (e.g., Gold requires 10,000 points earned) | Automated tier advancement |
| **Tier assignment/override** | No admin action to manually set a player's tier | Player-level tier corrections |
| **One-click auto-derivation RPC** | `rpc_issue_current_match_play` does not exist — cannot auto-derive tier-aware coupon in one call | One-button match play print |
| **Tier-to-entitlement on `promo_program`** | D1 unresolved: programs lack per-tier commercial value mapping | Auto-derivation RPC cannot determine face value from program + tier |
| **Tier evaluation period** | No concept of "eval window" — players accumulate points indefinitely with no period resets | Tier currency / recalculation |

---

## 2. Deferral History

### Decision D1 (UNRESOLVED)

**Source:** PRD-LOYALTY-ADMIN-CATALOG §7.2

> D1: Tier-to-entitlement mapping approach on `promo_program` remains unresolved. This slice may proceed for reward catalog administration, but promo-program-related UI and future issuance binding must not imply that D1 is solved. Treat `reward_entitlement_tier` and `promo_program` as adjacent but distinct configuration surfaces until D1 is explicitly frozen.

**Three design options proposed** (VECTOR-A-ADMIN-CATALOG-INVESTIGATION §GAP-A5):

| Option | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| **A: JSONB** | `tier_entitlements jsonb` column on `promo_program` | Simplest, no joins, all tier values in one place | Denormalized, no FK integrity on tier values |
| **B: Join table** | `promo_tier_entitlement (program_id, tier) → (face_value_cents, match_wager_cents)` | Normalized, per-tier constraints, queryable | Requires JOIN on every issuance |
| **C: One-program-per-tier** | Multiple `promo_program` rows with `tier_filter` column | No schema change to existing table, explicit | Multiplies program rows, management overhead |

**VECTOR-A recommendation:** Option A (JSONB) — keeps schema simple.

### Decision D2 (FROZEN)

**Source:** PRD-LOYALTY-ADMIN-CATALOG §4.1

Tier enum frozen as `bronze | silver | gold | platinum | diamond`. No application-level override per casino. This provides a stable foundation — any tier ladder editor builds on this fixed enum.

---

## 3. Aspirational Vision

### 3.1 Tier Ladder Admin Page

**Route:** `/admin/loyalty/tiers`

A single page where an admin can see the full tier structure for their casino:

```
┌─────────────────────────────────────────────────────┐
│  Tier Ladder Configuration                          │
│                                                     │
│  ┌─────────┬────────────┬─────────────────────────┐ │
│  │  Tier   │ Threshold  │ Benefits Summary         │ │
│  ├─────────┼────────────┼─────────────────────────┤ │
│  │ Diamond │ 100,000 pts│ MP $100 · FP $30         │ │
│  │ Platinum│  50,000 pts│ MP $50  · FP $15         │ │
│  │ Gold    │  10,000 pts│ MP $25  · FP $10         │ │
│  │ Silver  │   2,500 pts│ MP $10  · FP $5          │ │
│  │ Bronze  │       0 pts│ (no entitlements)         │ │
│  └─────────┴────────────┴─────────────────────────┘ │
│                                                     │
│  Evaluation Period: [Rolling 12 months ▾]           │
│  Auto-Advancement: [Enabled ▾]  Downgrade: [Annual] │
│                                                     │
│  [Save Configuration]                               │
└─────────────────────────────────────────────────────┘
```

**Key design decisions this page resolves:**
- Tier thresholds (points required for each tier)
- Evaluation period (rolling window, calendar year, indefinite)
- Auto-advancement toggle (automatic vs manual promotion)
- Downgrade policy (annual review, never, immediate on drop)

### 3.2 Tier-Aware Benefits Matrix

Cross-reference view showing what each tier gets across all active rewards:

```
┌──────────────────────────────────────────────────────────┐
│  Tier Benefits Matrix                                     │
│                                                           │
│           │ MP Daily   │ FP Daily   │ Comp Meal │ Comp Bev│
│  ─────────┼────────────┼────────────┼───────────┼─────────│
│  Diamond  │ $100 MP    │ $30 FP     │ 800 pts   │ 200 pts │
│  Platinum │ $50  MP    │ $15 FP     │ 500 pts   │ 150 pts │
│  Gold     │ $25  MP    │ $10 FP     │ 300 pts   │ 100 pts │
│  Silver   │ $10  MP    │ $5  FP     │ 200 pts   │  75 pts │
│  Bronze   │ —          │ —          │ 100 pts   │  50 pts │
│                                                           │
│  Source: reward_entitlement_tier (rewards) + reward_price │
│  _points (comps)                                          │
└──────────────────────────────────────────────────────────┘
```

This is a **read-only aggregation** of existing `reward_entitlement_tier` and `reward_price_points` data. No new schema required — pure query + display.

### 3.3 One-Click Auto-Derivation Flow

The `rpc_issue_current_match_play` RPC that completes the issuance pipeline:

```
Pit boss clicks "Issue Match Play" on Player 360
    │
    ├── 1. Read player_loyalty.tier → "Gold"
    ├── 2. Find active promo_program WHERE promo_type = 'match_play' AND status = 'active'
    ├── 3. Resolve tier → entitlement:
    │       Option A: program.tier_entitlements['gold'] → { face_value_cents: 2500, ... }
    │       Option B: promo_tier_entitlement WHERE program_id = X AND tier = 'gold'
    ├── 4. Check idempotency (gaming-day scope: one match play per player per day)
    ├── 5. Issue via rpc_issue_promo_coupon with resolved values
    ├── 6. Return FulfillmentPayload → print pipeline auto-fires
    │
    └── Result: One click → coupon printed → player walks away
```

### 3.4 Player Tier Assignment

Admin action on Player 360 to manually override a player's tier:

```
Player 360 Header
┌──────────────────────────────────────┐
│  John Smith                          │
│  Tier: Gold ★★★   [Change Tier ▾]   │
│  Balance: 15,000 pts                 │
│                                      │
│  ┌─ Change Tier ──────────────────┐  │
│  │  Current: Gold                 │  │
│  │  New: [Platinum ▾]             │  │
│  │  Reason: [Service recovery  ]  │  │
│  │  [Apply]  [Cancel]             │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

## 4. Infrastructure Needed

### 4.1 Schema Changes

| Change | Type | Description |
|--------|------|-------------|
| `tier_threshold` table or `casino_settings` JSONB | New table or column | Maps tier → points_required for advancement |
| D1 resolution on `promo_program` | Migration | One of: JSONB column (Option A), join table (Option B), or tier filter (Option C) |
| `player_loyalty.tier` audit trail | Consider | Log tier changes in `loyalty_ledger` with reason metadata |

### 4.2 RPC Changes

| RPC | Type | Description |
|-----|------|-------------|
| `rpc_issue_current_match_play` | New | One-click: resolve tier → find program → derive values → issue coupon → return FulfillmentPayload |
| `rpc_update_player_tier` | New | Admin manual tier override with audit logging |
| `rpc_evaluate_tier_advancement` | New (optional) | Check if player qualifies for tier upgrade based on point history |

### 4.3 Service Layer

| Method | Service | Description |
|--------|---------|-------------|
| `getTierLadder(casinoId)` | LoyaltyService or new TierService | Returns tier thresholds + benefits matrix |
| `updateTierThresholds(...)` | LoyaltyService | Admin updates tier points requirements |
| `issueCurrentMatchPlay(...)` | LoyaltyService | Wraps `rpc_issue_current_match_play` with catalog validation |
| `overridePlayerTier(...)` | LoyaltyService | Manual tier assignment with audit |

### 4.4 UI Components

| Component | Route | Description |
|-----------|-------|-------------|
| `TierLadderPage` | `/admin/loyalty/tiers` | Full tier config: thresholds, evaluation period, advancement policy |
| `TierBenefitsMatrix` | embedded in TierLadderPage | Read-only cross-reference of tiers × rewards |
| `TierOverrideDialog` | Player 360 header | Manual tier change with reason |
| `OneClickMatchPlayButton` | Rating slip modal + Player 360 | Single-button → auto-derive → print |

---

## 5. Recommended Build Sequence

### Phase A: Resolve D1 + Build Tier Ladder View (design-time + schema)

1. **Freeze D1** — recommend Option A (JSONB on `promo_program`) per VECTOR-A guidance
2. Migration: add `tier_entitlements jsonb` to `promo_program`
3. Read-only `TierBenefitsMatrix` component (queries existing `reward_entitlement_tier` data)
4. `/admin/loyalty/tiers` page with matrix display (no threshold editing yet)

**Unblocks:** One-click RPC design (Phase B), visual tier management

### Phase B: One-Click Auto-Derivation RPC

1. `rpc_issue_current_match_play` — resolve tier, find program, derive values, issue, return payload
2. Service method + DTO + API route + hook
3. `OneClickMatchPlayButton` component wired to print pipeline
4. Idempotency scope decision: gaming-day vs visit (recommend gaming-day)

**Unblocks:** One-button match play print — the final issuance UX gap

### Phase C: Tier Thresholds + Progression (optional for pilot)

1. `tier_threshold` schema (table or `casino_settings` JSONB)
2. `rpc_evaluate_tier_advancement` for batch or event-driven tier checks
3. Tier threshold editor on `/admin/loyalty/tiers`
4. Auto-advancement toggle + downgrade policy

**Unblocks:** Automated tier management — likely post-pilot

### Phase D: Player Tier Override (optional for pilot)

1. `rpc_update_player_tier` with audit logging
2. `TierOverrideDialog` on Player 360 header
3. Tier change history in loyalty ledger

**Unblocks:** Service recovery tier adjustments

---

## 6. Dependency Map

```
D1 Resolution (Phase A)
  │
  ├── One-Click RPC (Phase B) ──→ OneClickMatchPlayButton + Print
  │
  ├── Tier Benefits Matrix (Phase A) ──→ /admin/loyalty/tiers
  │
  └── Tier Thresholds (Phase C) ──→ Auto-Advancement
                                      │
                                      └── Player Tier Override (Phase D)
```

**Critical path:** D1 → Phase A → Phase B. Phases C and D are independent and can follow in any order.

---

## 7. Existing Infrastructure Leverage

This work builds on deep existing infrastructure:

| Exists | Reuse |
|--------|-------|
| `reward_entitlement_tier` table + RLS | Tier benefits data source — no new table for benefits |
| `TierEntitlementForm` (322 LOC) | Pattern for tier editor UX (add/remove/edit per tier) |
| `TierLevel` enum + Zod schemas | Validated tier values everywhere |
| `listEligibleRewards()` with tier filtering | Tier-aware eligibility already works |
| `issueEntitlement()` with P2K-28 tier lookup | Tier-based issuance path proven |
| `rpc_issue_promo_coupon` with role gating | Underlying issuance RPC for one-click to call |
| `FulfillmentPayload` + print pipeline | Print auto-fires on successful issuance |
| `iframePrint()` + templates | Comp slip + coupon templates ready |

**Estimate:** ~60-70% of the plumbing exists. The work is primarily:
- One schema decision (D1)
- One new RPC (`rpc_issue_current_match_play`)
- Two new admin pages/components (tier ladder, one-click button)
- Optional: threshold schema + progression logic

---

## 8. Open Questions for D1 Resolution

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Where do per-tier commercial values live for programs? | A: JSONB on `promo_program`, B: join table, C: one-program-per-tier | **Option A** — VECTOR-A recommended, simplest |
| 2 | Idempotency scope for one-click | Gaming-day, visit, shift | **Gaming-day** — one match play per player per calendar day |
| 3 | Tier thresholds for pilot? | Ship thresholds now, defer to post-pilot | **Defer** — manual tier assignment is sufficient for pilot |
| 4 | Should `player_loyalty.tier` be constrained? | Add CHECK constraint matching `TierLevel` enum, or keep free text | **Add CHECK** — prevents data quality issues |

---

## 9. References

- **PRD-LOYALTY-ADMIN-CATALOG §7.2** — D1 deferral (tier-to-entitlement mapping approach)
- **VECTOR-A-ADMIN-CATALOG-INVESTIGATION §GAP-A5** — Three design options for D1
- **ADR-033** — Loyalty reward domain model scaffolding (reward_entitlement_tier table)
- **PRD-052 §7.3** — "Vector B does not implement entitlement derivation logic"
- **P2K-28** — Tier-based entitlement value lookup (deployed, interim solution)
- **MATCHPLAY-PRINT-READINESS-REPORT** — GAP-2: no tier ladder, no auto-derivation RPC
- **PRD-053 (Vector C)** — Print pipeline operational (iframePrint, templates, usePrintReward)
- **LOYALTY-EARN-CONFIG-WIRING-CONTEXT** — D1-D4 frozen decisions (earn config, separate from this D1)

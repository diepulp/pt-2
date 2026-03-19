 # Vector A — Loyalty Admin Catalog Investigation

**Project:** Casino Player Tracker
**Vector:** Admin Configuration & Catalog Operationalization
**Status:** Investigation complete — ready for `/feature-pipeline` intake
**Date:** 2026-03-18
**Governing artifacts:**
- `LOYALTY_PILOT_SLICE_BOUNDARY.md` §1 (Admin Configuration)
- `loyalty_pilot_implementation_structuring_memo.md` (Exec Spec A)
- `REWARD_FULFILLMENT_POLICY.md` (family classification)

---

## Vector definition

This vector covers everything required for an admin to configure, activate, and manage the pilot reward catalog — without touching issuance flows or print fulfillment.

**Scope:** reward catalog CRUD, activation/deactivation, pricing configuration (`reward_price_points`), tier-entitlement mapping (`reward_entitlement_tier`), earn rate configuration (`loyalty_earn_config`), and promo program management.

**Not in scope:** operator issuance UX, print templates, fulfillment rendering, one-click RPC.

---

## Current system posture

### What exists (verified against code)

| Layer | Asset | Status | Location |
|-------|-------|--------|----------|
| **DB: reward_catalog** | 6 ADR-033 tables deployed | Operational | `20260206005751_adr033_reward_catalog_schema.sql` |
| **DB: promo_program** | Table + promo_coupon | Operational | `20260106235611_loyalty_promo_instruments.sql` |
| **DB: loyalty_earn_config** | Table deployed | Operational | Same ADR-033 migration |
| **DB: reward_entitlement_tier** | Table deployed | Operational | Same ADR-033 migration |
| **DB: reward_price_points** | Table deployed | Operational | Same ADR-033 migration |
| **DB: reward_limits** | Table deployed | Populated but **unenforced** | Same ADR-033 migration |
| **DB: reward_eligibility** | Table deployed | Populated but **unenforced** | Same ADR-033 migration |
| **Service: RewardService** | 8 methods (100%) | Operational | `services/loyalty/reward/` |
| **Service: PromoService** | 11 methods (100%) | Operational | `services/loyalty/promo/` |
| **API: promo-programs** | GET, POST, GET/:id, PATCH/:id | Operational | `app/api/v1/promo-programs/` |
| **API: promo-coupons** | GET, POST, GET/:id, void, replace | Operational | `app/api/v1/promo-coupons/` |
| **API: loyalty_earn_config** | **No routes** | GAP | — |
| **API: reward_catalog CRUD** | **No routes** | GAP | — |
| **Hooks: promo CRUD** | useCreatePromoProgram, useUpdatePromoProgram | Operational | `hooks/loyalty/promo-instruments/` |
| **Hooks: reward CRUD** | useRewardList, useRewardDetail, useEligibleRewards, useEarnConfig | Operational | `hooks/loyalty/reward/` |
| **UI: Admin loyalty page** | Placeholder stub | GAP | `app/(dashboard)/loyalty/page.tsx` — "Phase 3 pending" |
| **UI: Reward Catalog Manager** | 0% | GAP | — |
| **UI: Promo Program Manager** | 0% | GAP | — |
| **UI: Earn Config Editor** | 0% | GAP | — |
| **Seed data** | 3 comps + 2 entitlements | Operational | ADR-033 seed migration |

### Schema reality (two axes, not four types)

The `reward_catalog` uses two axes:

**Axis 1 — `reward_family` enum (structural discriminator):**
- `points_comp` → ledger debit → comp slip
- `entitlement` → coupon issuance → printed coupon

**Axis 2 — `kind` field (free-text, unconstrained):**
- `meal`, `beverage`, `misc` (points_comp family)
- `match_play`, `free_play` (entitlement family)
- Admin can create any new `kind` value without migration

**Implication for admin UI:** Two configuration forms needed:
1. Points pricing form (`reward_price_points` — points cost per comp)
2. Tier-entitlement mapping form (`reward_entitlement_tier` — tier → face value)

### Seeded catalog entries

| Code | Family | Kind | Face Value | Points Cost |
|------|--------|------|------------|-------------|
| COMP_MEAL_25 | points_comp | meal | $25 | 250 pts |
| COMP_BEVERAGE_10 | points_comp | beverage | $10 | 100 pts |
| COMP_MISC_15 | points_comp | misc | $15 | 150 pts |
| MP_TIER_DAILY | entitlement | match_play | tier-variable | — |
| FP_TIER_DAILY | entitlement | free_play | tier-variable | — |

---

## Gap analysis

### GAP-A1: No admin UI for loyalty configuration (P0)

**Impact:** Blocks all operational loyalty workflows. Programs can only be created via direct API call or mock data.

**What's missing:**
- No reward catalog list/create/edit page
- No promo program list/create/edit page
- No tier entitlement mapping editor
- No earn config editor
- No activation/deactivation toggles
- No policy toggles (`promo_require_exact_match`, `promo_allow_anonymous_issuance`)

**What already supports it:**
- API routes for promo programs exist (GET/POST/PATCH)
- Service layer is 100% for both RewardService and PromoService
- React hooks for CRUD mutations exist
- Database schema is deployed and seeded

**Estimated delta:** ~730 lines frontend. Backend is complete.

### GAP-A2: Reward catalog API routes exist but child record routes are missing (P1)

**Impact:** Admin can create/read/update rewards but cannot granularly update child records (tiers, limits, eligibility).

**What exists:**
- `GET /api/v1/rewards` — list catalog
- `POST /api/v1/rewards` — create reward with all children inline
- `GET /api/v1/rewards/[id]` — detail with children
- `PATCH /api/v1/rewards/[id]` — update catalog entry only
- `GET /api/v1/rewards/earn-config` — get earn config
- `PUT /api/v1/rewards/earn-config` — upsert earn config
- `GET /api/v1/rewards/eligible` — eligible rewards for player

**What's missing:** Granular child record routes:
- `PATCH /api/v1/rewards/[id]/price-points` — update points cost
- `PATCH /api/v1/rewards/[id]/tiers/[tierId]` — update individual tier
- `DELETE /api/v1/rewards/[id]/tiers/[tierId]` — remove tier
- `PATCH /api/v1/rewards/[id]/limits/[limitId]` — update limit

**Current workaround:** Full reward update with nested payload (not UX-friendly for single-field edits).

### GAP-A2b: Zod validation gaps (P2)

**Impact:** Invalid data silently accepted, causing downstream issuance failures.

**Fields needing enum constraints:**
| Field | Current | Should Be |
|-------|---------|-----------|
| `fulfillment` | Free text string | Enum: `'immediate' \| 'voucher' \| 'external' \| null` |
| `reward_limits.scope` | Free text string | Enum: `'per_visit' \| 'per_gaming_day' \| 'per_week' \| 'per_month'` |
| `reward_entitlement_tier.benefit` | Unconstrained JSONB | Typed: `{ face_value_cents: number, instrument_type: string }` |
| Cross-field | No validation | `points_comp` must require `pricePoints`; `entitlement` must require `entitlementTiers` |

### GAP-A3: Missing inventory API route (P2 — Bug #1)
- `app/api/v1/rewards/` — GET list, POST create
- `app/api/v1/rewards/[id]/` — GET detail, PATCH update
- `app/api/v1/loyalty-earn-config/` — GET, PUT/PATCH

### GAP-A3: Missing inventory API route (P2 — Bug #1)

`services/loyalty/promo/http.ts:178-196` calls `GET /api/v1/promo-coupons/inventory` but no route handler exists. Full supporting stack (RPC, service, DTO, hook) is operational.

**Fix:** ~40 lines following existing route patterns.

### GAP-A4: `promo_type_enum` incomplete (P3 — Bug #4)

Only `match_play` value exists. Missing: `nonnegotiable`, `free_bet`, `other`. Safe `ALTER TYPE ADD VALUE` migration.

### GAP-A5: Tier-to-entitlement mapping mechanism (P0 — Design Decision)

`promo_program` stores a single `face_value_amount` per program. No tier ladder exists on the promo program side.

**Note:** `reward_entitlement_tier` table exists in ADR-033 schema (reward-catalog-scoped), but `promo_program` (issuance-scoped) has no tier mapping.

**Options (decision required before issuance vector can proceed):**
- **A (JSONB):** Add `tier_entitlements jsonb` to `promo_program` — simplest
- **B (Join table):** `promo_tier_entitlement (program_id, tier) → (face_value, match_wager)` — normalized
- **C (One-program-per-tier):** Multiple programs per tier with `tier_filter`

**Recommendation from posture audit:** Option A (JSONB).

---

## Known bugs affecting this vector

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| Bug #2 | `ManualRewardDialog` doesn't call backend — fires `onSuccess` with client-side math only | P3 | Defer to this vector's admin UI redesign |
| Bug #5 | `promo_program.status` uses `active/inactive/archived` vs spec's `draft/active/paused/ended` | P3 | Intentional divergence — document in ADR addendum |

---

## Contract surface this vector must freeze

Before operator issuance (Vector B) can bind to admin config:

1. **Reward definition shape** — what fields constitute a complete pilot reward definition
2. **Activation semantics** — what `active`/`inactive` means operationally (issuance gating)
3. **Pricing/entitlement fields** — what admin-configured data issuance depends on:
   - For `points_comp`: `reward_price_points` (points cost per face value)
   - For `entitlement`: tier-to-entitlement mapping (face value + match wager per tier)
4. **Catalog-to-program relationship** — `reward_catalog` defines "what exists"; `promo_program` handles "what was issued" for entitlements. No FK between them. This boundary must be explicit.

---

## Acceptance criteria (from governing boundary doc)

- [ ] Admin can create or update pilot reward definitions (both families)
- [ ] Admin can activate and deactivate pilot rewards
- [ ] Required pilot pricing/entitlement fields are configurable per family
- [ ] Invalid config states are blocked or clearly surfaced
- [ ] Configuration persists and is retrievable
- [ ] Promo program CRUD works through UI (no direct API calls required)
- [ ] Tier-entitlement mapping is editable for entitlement-family rewards
- [ ] Earn config is viewable and editable

---

## Recommended admin route structure

```
app/(dashboard)/admin/loyalty/
├── rewards/
│   ├── page.tsx              # Reward catalog list + create
│   └── [id]/page.tsx         # Reward detail + edit + pricing config
├── promo-programs/
│   ├── page.tsx              # Promo program list + create
│   └── [id]/page.tsx         # Program detail + edit + tier entitlements + inventory
├── earn-config/
│   └── page.tsx              # Earn rate configuration
└── policies/
    └── page.tsx              # Coupon policy toggles
```

---

## Design decisions required before build

| # | Decision | Impact | Recommendation |
|---|----------|--------|----------------|
| D1 | Tier-to-entitlement mapping approach (JSONB vs join table vs one-per-tier) | Blocks admin UI form design + issuance RPC | Option A (JSONB) |
| D2 | Tier name governance (fixed enum vs free-text per casino) | Affects tier editor component | Fixed enum (bronze/silver/gold/platinum/diamond) |
| D3 | Reward catalog ↔ promo program navigation | Affects admin UX flow | Separate lists with cross-links |

---

## Feature pipeline handoff

This artifact is ready for `/feature-start "Loyalty Admin Catalog Slice"`.

**Key input for Phase 0 (SRM-First Ownership):**
- Owner: loyalty bounded context
- Tables: `reward_catalog`, `reward_price_points`, `reward_entitlement_tier`, `reward_limits`, `reward_eligibility`, `loyalty_earn_config`, `promo_program`
- Services: `RewardService`, `PromoService` (both 100% implemented)

**Key input for Phase 2 (RFC/Design Brief):**
- Two admin form patterns needed (points pricing + tier entitlement)
- D1 (tier mapping) must be decided
- API routes for reward catalog CRUD must be specified

**Dependency on other vectors:** None. This vector can proceed independently. Its output (frozen configuration contracts) unblocks Vector B.

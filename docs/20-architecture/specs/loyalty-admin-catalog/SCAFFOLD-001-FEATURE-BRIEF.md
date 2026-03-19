# Feature Brief: Loyalty Admin Catalog

> **One-liner:** Give pit bosses and admins a UI to configure, activate, and manage the pilot reward catalog and promo programs — no direct API calls required.

---

## Goal

Operationalize the reward catalog and promo program infrastructure that is already fully built at the service/API layer but has zero admin UI. Admins currently cannot configure loyalty rewards without direct API calls or database manipulation.

## Actor

**Primary:** Admin (casino administrator) — full CRUD on all catalog and program entities.
**Secondary:** Pit Boss — can create/edit rewards and programs but cannot delete catalog entries or modify earn config.

## Scenario

> As an admin, I open the loyalty admin section, see the reward catalog with 5 seeded entries (3 comps, 2 entitlements), create a new `$50 Dinner Comp` with 500-point pricing, activate it, then navigate to promo programs to create a `Weekend Match Play` program with tier-based face values.

## Key Metric

Admin can complete full reward lifecycle (create → configure pricing → activate → verify in catalog list) without leaving the UI. Zero direct API calls required for standard catalog operations.

## Non-Goals

- Operator issuance UX (Vector B scope)
- Print templates / fulfillment rendering (Vector C scope)
- Earn rate configuration UI (`loyalty_earn_config` deferred per frozen decision D2 — earn rates stay on `game_settings`)
- One-click RPC issuance flows
- Player-facing loyalty views

---

## Infrastructure Already Built (No Backend Work Required)

| Layer | Reward Catalog | Promo Programs |
|---|---|---|
| **Database** | 5 ADR-033 tables deployed + seeded | `promo_program` + `promo_coupon` |
| **Service** | RewardService — 8 methods (100%) | PromoService — 11 methods (100%) |
| **API** | 5 endpoints (list, create, detail, earn-config, eligible) | 4 program endpoints + 5 coupon endpoints |
| **Hooks** | `useRewardList`, `useRewardDetail`, `useEligibleRewards` | `usePromoPrograms`, `usePromoProgram`, `useCreatePromoProgram`, `useUpdatePromoProgram`, `useCouponInventory` |
| **Validation** | Zod schemas for all inputs | Zod schemas for all inputs |

## What This Feature Builds

| Deliverable | Description | Estimated Size |
|---|---|---|
| **Reward Catalog Manager** | List/create/edit page under `/admin/loyalty/rewards/` | ~250 lines |
| **Reward Detail + Pricing** | Detail page with points pricing form (`reward_price_points`) and tier-entitlement mapping form (`reward_entitlement_tier`) | ~200 lines |
| **Promo Program Manager** | List/create/edit page under `/admin/loyalty/promo-programs/` | ~150 lines |
| **Program Detail + Tiers** | Detail page with tier entitlements and inventory display | ~130 lines |
| **Missing hooks** | `useCreateReward`, `useUpdateReward`, `useToggleRewardActive` (mutation hooks wrapping existing service methods) | ~80 lines |

**Total estimated delta:** ~810 lines frontend, 0 lines backend.

## Admin Route Structure

```
app/(dashboard)/admin/loyalty/
├── rewards/
│   ├── page.tsx              # Reward catalog list + create dialog
│   └── [id]/page.tsx         # Reward detail + pricing/tier config
├── promo-programs/
│   ├── page.tsx              # Promo program list + create dialog
│   └── [id]/page.tsx         # Program detail + tier entitlements + inventory
└── policies/
    └── page.tsx              # Coupon policy toggles
```

Leverages existing `/admin/` route group with role guard (admin/pit_boss).

## Open Design Decisions (From Investigation)

| # | Decision | Impact | Recommendation |
|---|----------|--------|----------------|
| D1 | Tier-to-entitlement mapping approach (JSONB vs join table vs one-per-tier) | Blocks admin UI form design + issuance RPC | Option A (JSONB) |
| D2 | Tier name governance (fixed enum vs free-text per casino) | Affects tier editor component | Fixed enum (bronze/silver/gold/platinum/diamond) |
| D3 | Reward catalog ↔ promo program navigation | Affects admin UX flow | Separate lists with cross-links |

## GAPs Addressed

| GAP | Priority | Resolution |
|---|---|---|
| GAP-A1: No admin UI | P0 | Full admin UI for rewards + programs |
| GAP-A2: Missing child record routes | P1 | Evaluate during PRD — may use inline update pattern instead |
| GAP-A2b: Zod validation gaps | P2 | Tighten enum constraints in schemas |
| GAP-A3: Missing inventory route | P2 | Add `/promo-coupons/inventory` route |
| GAP-A4: `promo_type_enum` incomplete | P3 | `ALTER TYPE ADD VALUE` migration |

## Dependencies

- **None on other vectors** — this vector proceeds independently
- **Unblocks:** Vector B (operator issuance) depends on frozen configuration contracts from this vector

---

## Source Artifacts

- Investigation: `docs/00-vision/loyalty-service-extension/vectors/VECTOR-A/VECTOR-A-ADMIN-CATALOG-INVESTIGATION.md`
- Frozen decision: `docs/00-vision/loyalty-service-extension/LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md`
- Feature boundary: `docs/20-architecture/specs/loyalty-admin-catalog/FEATURE_BOUNDARY.md`
- Governing: `LOYALTY_PILOT_SLICE_BOUNDARY.md`, `REWARD_FULFILLMENT_POLICY.md`

# Feature Boundary: Loyalty Admin Catalog

> **Ownership Sentence:** This feature belongs to **LoyaltyService (Reward Context)** and may only touch **`reward_catalog`, `reward_price_points`, `reward_entitlement_tier`, `reward_limits`, `reward_eligibility`, `promo_program`**; no cross-context contracts are required — all tables and services are within the loyalty bounded context. `loyalty_earn_config` is **deferred** per frozen pilot decision D2 (earn rates stay on `game_settings`).

---

## Bounded Context

- **Owner service(s):**
  - **RewardService** — reward catalog CRUD, pricing configuration, tier-entitlement mapping, activation/deactivation
  - **PromoService** — promo program CRUD, coupon inventory, policy toggles

- **Writes:**
  - `reward_catalog` (core reward definitions — both `points_comp` and `entitlement` families)
  - `reward_price_points` (points cost per comp face value)
  - `reward_entitlement_tier` (tier → face value + instrument type mapping)
  - `reward_limits` (per-visit/per-day issuance caps)
  - `reward_eligibility` (eligibility rules per reward)
  - `promo_program` (promo program lifecycle — create/activate/deactivate)

- **Deferred (frozen pilot decision D2):**
  - `loyalty_earn_config` — deployed but inert; earn rates stay on `game_settings` for pilot

- **Reads:**
  - All above tables (via existing service layer — RewardService + PromoService are 100% implemented)
  - `promo_coupon` (read-only for inventory display)

- **Cross-context contracts:**
  - None required — this feature is entirely within the loyalty bounded context

---

## SRM Registration Gap

The following ADR-033 tables are deployed (migration `20260206005751_adr033_reward_catalog_schema.sql`) but **not yet registered in the SRM** (v4.19.0):

| Table | Owner | Status |
|-------|-------|--------|
| `reward_catalog` | LoyaltyService | Deployed, not in SRM |
| `reward_price_points` | LoyaltyService | Deployed, not in SRM |
| `reward_entitlement_tier` | LoyaltyService | Deployed, not in SRM |
| `reward_limits` | LoyaltyService | Deployed, not in SRM |
| `reward_eligibility` | LoyaltyService | Deployed, not in SRM |
| `loyalty_earn_config` | LoyaltyService | Deployed, not in SRM, **DEFERRED for pilot** (frozen decision D2) |

**Action required:** SRM must be updated to register these tables under LoyaltyService before Phase 6 (implementation).

---

## Source Investigation

- `docs/00-vision/loyalty-service-extension/vectors/VECTOR-A/VECTOR-A-ADMIN-CATALOG-INVESTIGATION.md`
- `docs/00-vision/loyalty-service-extension/LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md` (frozen decision — canonical)
- Governing: `LOYALTY_PILOT_SLICE_BOUNDARY.md`, `REWARD_FULFILLMENT_POLICY.md`

---

**Gate:** srm-ownership — ownership sentence is clear, all written tables are listed, no cross-context contracts needed.

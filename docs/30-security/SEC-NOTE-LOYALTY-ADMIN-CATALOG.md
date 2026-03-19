# SEC Note: Loyalty Admin Catalog

**Feature:** loyalty-admin-catalog
**Date:** 2026-03-18
**Author:** Feature Pipeline (Phase 3)
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Reward catalog definitions | Operational | Incorrect pricing/entitlement config directly affects financial instruments issued to players |
| Points pricing (`reward_price_points`) | Financial | `points_cost` controls ledger debit amounts — wrong values cause over/under-redemption |
| Tier-entitlement mapping (`reward_entitlement_tier`) | Financial | `face_value_cents` determines coupon dollar value per tier — misconfiguration is direct financial exposure |
| Promo program lifecycle state | Operational | Premature activation/deactivation affects coupon issuance availability |
| Coupon inventory counts | Operational | Inventory visibility supports outstanding liability tracking |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino catalog leakage | Medium | Low | P2 |
| T2: Unauthorized reward pricing manipulation | High | Medium | P1 |
| T3: Role escalation — dealer/cashier modifying catalog | High | Medium | P1 |
| T4: Zero-cost reward creation | Medium | Low | P2 |
| T5: Activation of misconfigured reward | Medium | Medium | P2 |

### Threat Details

**T1: Cross-casino catalog leakage**
- **Description:** Staff from Casino A views or modifies Casino B's reward catalog
- **Attack vector:** Manipulate casino_id in request payload
- **Impact:** Privacy violation is low (no PII in catalog), but cross-casino config modification is operationally damaging

**T2: Unauthorized reward pricing manipulation**
- **Description:** Non-admin staff changes points cost or tier face values
- **Attack vector:** Direct API call bypassing UI role checks
- **Impact:** Incorrect redemption amounts, financial loss

**T3: Role escalation — dealer/cashier modifying catalog**
- **Description:** Staff with dealer or cashier role creates/edits rewards or programs
- **Attack vector:** Direct API call or forged request — UI won't show admin pages, but API might not enforce
- **Impact:** Unauthorized configuration changes

**T4: Zero-cost reward creation**
- **Description:** Admin creates a `points_comp` reward with `points_cost = 0`
- **Attack vector:** Legitimate admin action (schema allows it — `CHECK (points_cost >= 0)`)
- **Impact:** Free redemptions without point debit. This is intentionally allowed (complimentary comps) but should be visible in the UI

**T5: Activation of misconfigured reward**
- **Description:** Reward is activated without required child records (pricing for `points_comp`, tiers for `entitlement`)
- **Attack vector:** Toggle `is_active` before completing pricing/tier setup
- **Impact:** Operator attempts issuance against incomplete configuration

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | RLS casino_id binding (Pattern C hybrid) | All 6 ADR-033 tables: `casino_id = COALESCE(app.casino_id, jwt.casino_id)` |
| T2 | RLS role-gated writes | INSERT/UPDATE require `pit_boss` or `admin` role; DELETE requires `admin` only |
| T3 | RLS role-gated writes + admin route guard | RLS enforces at DB layer; `/admin/` layout guard enforces at UI layer |
| T4 | UI visibility | Zero-cost is a valid business case (comps); UI should badge it clearly, not block it |
| T5 | Zod family-specific validation (to be tightened) | `points_comp` requires `pricePoints`; `entitlement` requires `entitlementTiers` |

### Control Details

**C1: RLS casino_id binding (ADR-015 Pattern C hybrid)**
- **Type:** Preventive
- **Location:** Database (RLS policies on all 6 ADR-033 tables)
- **Enforcement:** Database
- **Tested by:** Existing RLS test suite + ADR-033 migration policy comments

**C2: RLS role-gated writes**
- **Type:** Preventive
- **Location:** Database (RLS policies)
- **Enforcement:** Database — `staff_role IN ('pit_boss', 'admin')` for writes; `'admin'` only for DELETE on `reward_catalog` and all writes on `loyalty_earn_config`
- **Tested by:** RLS integration tests

**C3: Admin route guard**
- **Type:** Preventive
- **Location:** Application (`app/(dashboard)/admin/layout.tsx`)
- **Enforcement:** Application — derives role from `staff` table lookup (not JWT), redirects unauthorized roles
- **Tested by:** Route guard integration test

**C4: Family-specific validation**
- **Type:** Preventive
- **Location:** Application (Zod schemas in `services/loyalty/reward/schemas.ts`)
- **Enforcement:** Application + API layer
- **Tested by:** Schema validation unit tests (to be tightened per GAP-A2b)

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Reward limits (`reward_limits`) not enforced at issuance time | Limits table is populated but no RPC reads it during issuance | Before Vector B (operator issuance) ships |
| Reward eligibility (`reward_eligibility`) not enforced at issuance time | Eligibility table is populated but not checked during issuance | Before Vector B ships |
| No audit trail for catalog configuration changes | No `audit_log` integration for reward/program CRUD | Before compliance requirement |
| `loyalty_earn_config` writes unrestricted to admin role only at DB layer | Table is inert — no RPC reads it. Risk is theoretical. | If earn-config is ever wired to accrual pipeline |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| Reward code, name, kind | Plaintext | Display/search. No PII content. |
| Points cost | Plaintext integer | Financial config — needs to be readable for admin |
| Tier benefit (face_value_cents) | Plaintext JSONB | Financial config — needs to be readable for admin |
| Promo program name, face value | Plaintext | Operational config — no PII |
| ui_tags, metadata | Plaintext (array/JSONB) | Optional admin annotations — no PII |

No PII is stored in any table touched by this feature. All data is operational/financial configuration.

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `reward_catalog` | all staff (same casino) | pit_boss, admin | pit_boss, admin | admin only |
| `reward_price_points` | all staff (same casino) | pit_boss, admin | pit_boss, admin | pit_boss, admin |
| `reward_entitlement_tier` | all staff (same casino) | pit_boss, admin | pit_boss, admin | pit_boss, admin |
| `reward_limits` | all staff (same casino) | pit_boss, admin | pit_boss, admin | pit_boss, admin |
| `reward_eligibility` | all staff (same casino) | pit_boss, admin | pit_boss, admin | pit_boss, admin |
| `loyalty_earn_config` | all staff (same casino) | admin only | admin only | Denied (no policy) |
| `promo_program` | all staff (same casino) | pit_boss, admin | pit_boss, admin | N/A (existing) |

---

## Validation Gate

- [x] All assets classified (5 assets — operational + financial, no PII)
- [x] All threats have controls or explicit deferral (T1-T5 mapped)
- [x] Sensitive fields have storage justification (all plaintext — no PII in scope)
- [x] RLS covers all CRUD operations (Pattern C hybrid on all 6 ADR-033 tables + promo_program)
- [x] No plaintext storage of secrets (no secrets in scope)

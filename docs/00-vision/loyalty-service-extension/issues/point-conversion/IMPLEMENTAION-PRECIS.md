

## PRD-053: Point Conversion Canonicalization — Delivery Summary

### What Changed

**Problem**: Comp issuance used a hardcoded `CENTS_PER_POINT = 10` constant in both backend and frontend. Rate changes required code deploys.

**Solution**: All point-to-dollar conversion now reads from `loyalty_valuation_policy.cents_per_point` in the database. Admins can change the rate via UI without deploys.

### Delivered Components

**Backend (fail-closed)**
- `getActiveValuationCentsPerPoint()` — queries DB, throws `VALUATION_POLICY_MISSING` if no active policy
- `issueComp()` — parallel pre-flight fetches rate alongside reward + balance
- `rpc_update_valuation_policy` — atomic rotate (deactivate old, insert new) with `SELECT FOR UPDATE` lock
- 3 migrations: bootstrap seed (cents_per_point=2), onboarding enforcement, admin write RPC

**API**
- `GET /api/v1/loyalty/valuation-policy` — any authenticated role
- `POST /api/v1/loyalty/valuation-policy` — admin only, requires `Idempotency-Key`

**Frontend**
- `useValuationRate(casinoId)` — lightweight hook for comp drawer (5 min cache)
- `useActiveValuationPolicy(casinoId)` — full DTO hook for admin form (1 min cache)
- `useUpdateValuationPolicy(casinoId)` — mutation with dual cache invalidation
- Comp drawer threads `centsPerPoint` as prop; shows blocked state when policy missing
- Admin settings: new **Valuation** tab with rate form, role-gated read-only, confirmation dialog

**Tests**: 20 new tests (service layer, route handlers, round-trip integration)

---

### How to Confirm in Browser

**1. Verify comp drawer uses DB rate**
- Navigate to any player's 360 view
- Click **Issue Reward** button → select a points_comp reward
- Confirm the conversion display shows `(at $0.02/pt)` — not the old `$0.10/pt`
- The dollar-to-points math should use `ceil(cents / 2)`: e.g. $35.00 = 1,750 pts

**2. Verify policy-missing blocked state**
- If testing with a casino that has no `loyalty_valuation_policy` row:
  - Issue Reward button remains **enabled** (user can open the drawer)
  - Selecting a points_comp reward shows a red error block inside the comp panel: *"Valuation policy not configured"*
  - Confirm button is **disabled**

**3. Admin settings — view rate**
- Navigate to **Admin → Settings**
- A new **Valuation** tab should appear alongside Alert Thresholds and Shifts
- Current rate, effective date, and last-updated timestamp display at the top
- Below: Point Valuation Rate card with cents-per-point and effective date fields
- Conversion preview: `1 point = $0.0200 · $1.00 = 50 pts`

**4. Admin settings — edit rate (admin role only)**
- Change cents-per-point to `5`, set an effective date
- "Save Changes" button appears (dirty state)
- Click Save → confirmation dialog warns about impact on future comps
- Click Confirm → rate updates, page refreshes with new values
- Navigate away with unsaved changes → browser `beforeunload` prompt fires

**5. Admin settings — read-only for pit_boss**
- Log in as a pit_boss user
- Navigate to Admin → Settings → Valuation
- Amber banner: *"Valuation policy is read-only for your role"*
- Both input fields are **disabled**

**6. Verify rate change propagates to comp issuance**
- After changing rate to 5 in admin settings
- Open a player's Issue Reward drawer
- Conversion should now show `(at $0.05/pt)`: e.g. $35.00 = 700 pts (not 1,750)
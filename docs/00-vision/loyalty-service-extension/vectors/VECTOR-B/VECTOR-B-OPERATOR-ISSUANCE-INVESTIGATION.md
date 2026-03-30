# Vector B — Operator Issuance Investigation

**Project:** Casino Player Tracker
**Vector:** Loyalty Operator Issuance
**Status:** Investigation complete — ready for `/feature-pipeline` intake
**Date:** 2026-03-18
**Governing artifacts:**
- `LOYALTY_PILOT_SLICE_BOUNDARY.md` §1 (Operator Issuance)
- `loyalty_pilot_implementation_structuring_memo.md` (Exec Spec B)
- `REWARD_FULFILLMENT_POLICY.md` (family-specific issuance paths)
- `rewrd_catologue_reality.md` (structural reality)

---

## Vector definition

This vector covers everything required for a pit boss to view available rewards in player context, issue a configured reward, persist the issuance record, and provide support/history visibility — without touching admin configuration or print fulfillment.

**Scope:** player-context reward availability, issuance action (both families), issuance persistence, history/support visibility, operator-facing success/failure handling.

**Not in scope:** admin catalog CRUD (Vector A), print templates or rendering (Vector C).

---

## Current system posture

### What exists (verified against code)

| Layer | Asset | Status | Location |
|-------|-------|--------|----------|
| **DB: loyalty_ledger** | Append-only transaction log | Operational | `20251213003000_prd004_loyalty_service_schema.sql` |
| **DB: player_loyalty** | Balance + tier cache | Operational | Same migration |
| **DB: loyalty_outbox** | Event side-effects | Operational | `20260206005335_prd028_restore_loyalty_outbox.sql` |
| **DB: promo_coupon** | Issued coupon instances | Operational | `20260106235611_loyalty_promo_instruments.sql` |
| **RPCs: Points ledger** | 9 RPCs (accrue, redeem, credit, promo, reconcile, ledger, suggestion, mid-session, visit summary) | All operational | ADR-024 hardened |
| **RPCs: Promo coupons** | 5 RPCs (issue, void, replace, inventory, exposure) | All operational | SECURITY DEFINER |
| **RPC: one-click match play** | `rpc_issue_current_match_play` | **0% — does not exist** | GAP |
| **Service: LoyaltyService** | 8 methods (100%) | Operational | `services/loyalty/` |
| **Service: PromoService** | 11 methods (100%) | Operational | `services/loyalty/promo/` |
| **API: loyalty routes** | accrue, redeem, manual-credit, promotion, ledger, suggestion | Live | `app/api/v1/loyalty/` |
| **API: loyalty/balances** | Stubbed (returns null) | GAP | `app/api/v1/loyalty/balances/` |
| **API: loyalty/mid-session-reward** | Stubbed (3 TODOs) | GAP | `app/api/v1/loyalty/mid-session-reward/` |
| **API: players/[id]/loyalty** | Stubbed | GAP | `app/api/v1/players/[id]/loyalty/` |
| **Hooks: queries** | usePlayerLoyalty, useLoyaltyLedger, useLoyaltySuggestion, useLedgerInfinite | Operational | `hooks/loyalty/` |
| **Hooks: mutations** | useAccrueOnClose, useRedeem, useManualCredit, useApplyPromotion | Operational | `hooks/loyalty/` |
| **Hooks: promo mutations** | useIssueCoupon, useVoidCoupon, useReplaceCoupon | Operational | `hooks/loyalty/promo-instruments/` |
| **Hooks: reward queries** | useRewardList, useRewardDetail, useEligibleRewards | Operational | `hooks/loyalty/reward/` |
| **UI: LoyaltyPanel** | Tier + points display | Live | `components/player-dashboard/loyalty-panel.tsx` |
| **UI: RewardsEligibilityCard** | Player 360 eligibility display | Live | `components/player-360/rewards/` |
| **UI: RewardsHistoryList** | Ledger + coupon history (filter chips) | Live | `components/player-360/rewards/` |
| **UI: IssueRewardButton** | `enabled=false`, "Coming soon" tooltip | Stub | `components/player-360/header/issue-reward-button.tsx` |
| **UI: ManualRewardDialog** | Renders form but does NOT call backend | Broken stub | `components/loyalty/manual-reward-dialog.tsx` |

### Two issuance families (structural reality)

| Family | Issuance path | Ledger effect | Persistence target | Existing RPC |
|--------|--------------|---------------|---------------------|-------------|
| `points_comp` | Debit loyalty_ledger → comp record | Points subtracted | `loyalty_ledger` + `player_loyalty` balance update | `rpc_redeem` (explicit params) |
| `entitlement` | Create promo_coupon record | None (tier-based) | `promo_coupon` + `loyalty_outbox` + `audit_log` | `rpc_issue_promo_coupon` (explicit params) |

**Key distinction:** `points_comp` issuance debits the player's loyalty balance. `entitlement` issuance creates a discrete coupon — no points consumed. These paths must remain structurally distinct per REWARD_FULFILLMENT_POLICY.md.

---

## Gap analysis

### GAP-B1: No one-click issuance RPC for entitlements (P0)

**Impact:** Blocks tier-aware match play and free play issuance.

The existing `rpc_issue_promo_coupon` requires the caller to supply `p_promo_program_id`, `p_face_value`, `p_required_match_wager_amount` explicitly. There is no auto-derivation from tier + policy.

**What's needed:** `rpc_issue_current_match_play(p_player_id uuid, p_visit_id uuid DEFAULT NULL)` that:
1. Resolves player's current tier from `player_loyalty.tier`
2. Selects active match play `promo_program` for the casino
3. Computes entitlement from tier mapping (requires GAP-A5 resolution)
4. Enforces idempotency (one outstanding per gaming-day or visit)
5. Returns ready-to-use coupon row
6. Writes metadata: `channel`, `tier`, `policy_version`, `computed_at`

**Depends on:** Vector A decision D1 (tier-to-entitlement mapping approach).

### GAP-B2: No unified issuance UI surface (P0)

**Impact:** Pit boss has no way to issue rewards from player context.

**Current state:**
- `IssueRewardButton` is disabled stub with "Coming soon" tooltip
- `ManualRewardDialog` collects wrong fields and doesn't call backend
- No reward selection drawer/dialog exists
- No family-aware issuance flow exists

**What's needed:**
- Issuance trigger in player context (Player 360 or active visit view)
- Reward selector showing available pilot rewards for this player
- Family-aware issuance flow:
  - `points_comp`: select reward → confirm points debit → issue
  - `entitlement`: select reward → auto-derive from tier → issue
- Success/failure feedback to operator
- Optimistic UI updates for TanStack Query cache

### GAP-B3: Comp issuance path incomplete (P1)

**Impact:** No clean path for pit boss to issue a `points_comp` reward (meal, beverage, misc) from the UI.

The `rpc_redeem` RPC exists and handles ledger debits, but the operator UX to select a comp from the catalog, confirm points cost, and execute is missing.

**What's needed:**
- Comp selection from `reward_catalog` (filtered to `points_comp` family)
- Points balance check against `player_loyalty.current_balance`
- Confirm dialog showing: reward name, face value, points cost, post-debit balance
- Call to issuance RPC (likely `rpc_redeem` or a new `rpc_issue_comp`)
- Persistence of comp slip record for fulfillment (Vector C)

### GAP-B4: 3 stubbed API routes (P2)

| Route | Issue | Fix estimate |
|-------|-------|-------------|
| `GET /loyalty/balances` | Returns null | Wire to `player_loyalty` query |
| `POST /loyalty/mid-session-reward` | 3 TODOs, no service method | Wire to loyalty service |
| `GET /players/[id]/loyalty` | Stubbed | Wire to player loyalty query |

### GAP-B5: Divergent mid-session module (P2)

`services/loyalty/mid-session-reward.ts` defines `MidSessionRewardReason` enum that conflicts with canonical `LoyaltyReason`. API route is stubbed. ADR-033 flagged this divergence.

### GAP-B6: History/support visibility for comp issuance (P1)

`RewardsHistoryList` currently shows coupon history (entitlement family) with filter chips for matchplay/freeplay. It does not show `points_comp` issuance history from `loyalty_ledger`. Operators need unified history showing all pilot reward issuances.

---

## Cross-domain integration (existing, verified)

```
Rating Slip Close → rpc_accrue_on_close → loyalty_ledger + player_loyalty
                      ├── reads policy_snapshot.loyalty from rating_slip
                      ├── ADR-014: rejects ghost visits
                      └── ADR-024: derives context from JWT + staff

Player Enrollment → rpc_create_player → player_casino + player_loyalty (atomic)

Promo Issuance → rpc_issue_promo_coupon → promo_coupon + loyalty_outbox + audit_log

Visit Close → (app layer triggers accrual) → LoyaltyService.accrueOnClose()
```

### Issuance depends on these existing contracts

- **Player identity:** `player_casino.id` (casino-scoped player)
- **Tier:** `player_loyalty.tier` (bronze/silver/gold/platinum/diamond)
- **Balance:** `player_loyalty.current_balance` (points available for comp redemption)
- **Visit context:** `visit.id` (optional, for visit-scoped idempotency)
- **Staff identity:** derived from JWT via `set_rls_context_from_staff()` (ADR-024)
- **Casino context:** `app.casino_id` session variable (casino-scoped RLS)

---

## Operator workflow (target state)

### Comp issuance (points_comp family)
1. Open player context (Player 360 or active visit)
2. Click "Issue Reward" → opens reward selection drawer
3. See available comps from `reward_catalog` (filtered: `points_comp`, `active`)
4. Select comp (e.g., Meal Comp $25 — 250 pts)
5. Confirm: "Issue COMP_MEAL_25 for 250 pts? Balance after: 1,250 pts"
6. System debits ledger, creates comp record → **hands to Vector C for print fulfillment**
7. Operator sees success confirmation + updated balance

### Entitlement issuance (entitlement family)
1. Open player context
2. Click "Issue Match Play" (or "Issue Reward" → select entitlement)
3. System auto-derives tier → entitlement (face value, match wager)
4. If coupon already "on file" → show existing, offer reprint
5. If no coupon → issue new, return coupon record → **hands to Vector C for print fulfillment**
6. Operator sees success confirmation + coupon details

---

## Contract surface this vector must freeze

Before instrument fulfillment (Vector C) can bind to issuance:

1. **Issuance record shape** — what fields constitute a persisted issuance event:
   - For `points_comp`: `loyalty_ledger` row (player_id, points_delta, reason, metadata)
   - For `entitlement`: `promo_coupon` row (validation_number, face_value, status, metadata)
2. **Family discriminator** — `reward_family` enum value on the issuance record (or derivable from context)
3. **Fulfillment payload** — what data the fulfillment layer receives:
   - For `points_comp` → comp slip payload: player name, comp type, face value, points redeemed, post-balance, staff name, casino name, timestamp
   - For `entitlement` → coupon payload: player name, face value, match wager (if applicable), validation number, expiry, staff name, casino name, timestamp
4. **Event/callback contract** — how issuance signals fulfillment to begin (direct function call? event? callback in mutation hook?)

---

## Acceptance criteria (from governing boundary doc)

- [ ] Pit boss can view pilot reward options in player context (both families)
- [ ] Pit boss can issue a pilot reward through a normal workflow
- [ ] The system prevents obviously invalid issuance states (insufficient balance, inactive reward, duplicate coupon)
- [ ] The operator gets clear feedback on success or failure
- [ ] Issuance produces a persisted record per family type
- [ ] Reward history can be inspected (both families in unified view)
- [ ] The issuance record is inspectable after the fact by support

---

## Design decisions required before build

| # | Decision | Impact | Recommendation |
|---|----------|--------|----------------|
| D1 | Unified issue drawer vs per-family triggers | Affects operator UX flow | Unified drawer with family-aware sub-flows |
| D2 | Idempotency scope for entitlements (gaming-day vs visit) | Affects when player can receive another coupon | Gaming-day — simpler operationally |
| D3 | Comp issuance RPC (new `rpc_issue_comp` vs extend `rpc_redeem`) | Affects persistence model for comp slips | Evaluate existing `rpc_redeem` — may suffice with metadata extension |
| D4 | Issuance-to-fulfillment handoff (direct call vs event) | Affects Vector C binding | Direct callback in mutation hook's `onSuccess` |
| D5 | Replacement behavior for entitlements (honor issued vs auto-replace) | Affects policy change handling | Honor issued (Behavior 1) |

---

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| Vector A: tier-to-entitlement mapping decision (D1/GAP-A5) | **Blocks** entitlement issuance RPC | Pending |
| Vector A: reward catalog activation state | Required for filtering available rewards | Backend exists, needs admin UI |
| LoyaltyService (8 methods) | Required | 100% implemented |
| PromoService (11 methods) | Required | 100% implemented |
| 14 RPCs (points + promo) | Required | All operational |
| Player 360 component tree | Required | Exists — issuance triggers added here |
| `set_rls_context_from_staff()` (ADR-024) | Required | Operational |

---

## Feature pipeline handoff

This artifact is ready for `/feature-start "Loyalty Operator Issuance Slice"`.

**Key input for Phase 0 (SRM-First Ownership):**
- Owner: loyalty bounded context
- Tables: `loyalty_ledger`, `player_loyalty`, `promo_coupon`, `loyalty_outbox`
- Services: `LoyaltyService`, `PromoService`
- Cross-context reads: player (name, tier), visit (active visit), casino (settings), staff (identity)

**Key input for Phase 2 (RFC/Design Brief):**
- Two structurally distinct issuance paths (comp vs entitlement)
- D1-D5 decisions must be made
- Issuance-to-fulfillment contract must be frozen before Vector C builds

**Dependency on other vectors:**
- **Blocks on Vector A:** tier-to-entitlement mapping decision
- **Blocked by Vector C:** fulfillment cannot proceed until issuance contract is frozen
- Can develop issuance UI + RPC in parallel with Vector A admin UI if configuration contracts are frozen first

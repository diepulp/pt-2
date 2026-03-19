# Feature Boundary: Loyalty Operator Issuance

> **Ownership Sentence:** This feature belongs to **LoyaltyService** and may only touch **`loyalty_ledger`, `player_loyalty`, `promo_coupon`, `loyalty_outbox`, `reward_catalog`, `reward_price_points`**; cross-context needs go through **PlayerLoyaltyDTO** (player identity/tier), **VisitDTO** (active visit context), and **StaffIdentity** (JWT-derived via `set_rls_context_from_staff()`).

---

## Bounded Context

- **Owner service(s):**
  - **LoyaltyService** — points ledger operations, comp issuance (points_comp family), balance management
  - **PromoService** (sub-context of Loyalty) — entitlement coupon issuance, promo program resolution, coupon lifecycle

- **Writes:**
  - `loyalty_ledger` (points debit on comp issuance)
  - `player_loyalty` (balance update after debit)
  - `promo_coupon` (entitlement coupon creation)
  - `loyalty_outbox` (side-effect events for entitlement issuance)

- **Reads:**
  - `reward_catalog` (available rewards filtered by casino, family, active status)
  - `reward_price_points` (points cost for points_comp family)
  - `reward_entitlement_tier` (tier-to-entitlement mapping for entitlement family)
  - `player_loyalty` (current balance, tier — same context)
  - `promo_program` (active program for entitlement derivation)
  - `promo_coupon` (idempotency check — outstanding coupon exists?)

- **Cross-context contracts:**
  - `PlayerDTO` — player identity (name, casino_id) from PlayerService
  - `PlayerLoyaltyDTO` — tier + balance (same context, but consumed by UI)
  - `VisitDTO` — active visit context for visit-scoped idempotency (from VisitService)
  - `StaffIdentity` — derived from JWT via `set_rls_context_from_staff()` (ADR-024)
  - `RewardCatalogDTO` — published for UI consumption (reward name, family, face value, points cost)

---

## Two Issuance Families (Structural Invariant)

| Family | Write path | Ledger effect | Existing RPC |
|--------|-----------|---------------|--------------|
| `points_comp` | Debit `loyalty_ledger` → update `player_loyalty.balance` | Points subtracted | `rpc_redeem` (or new `rpc_issue_comp`) |
| `entitlement` | Create `promo_coupon` + `loyalty_outbox` + `audit_log` | None (tier-based) | `rpc_issue_promo_coupon` / new `rpc_issue_current_match_play` |

These paths **must remain structurally distinct** per REWARD_FULFILLMENT_POLICY.md.

---

## Gaps Addressed

| Gap | Priority | Summary |
|-----|----------|---------|
| GAP-B1 | P0 | No one-click entitlement issuance RPC (tier-aware auto-derivation) |
| GAP-B2 | P0 | No unified issuance UI surface for pit boss |
| GAP-B3 | P1 | Comp issuance path incomplete (UI + confirm flow) |
| GAP-B4 | P2 | 3 stubbed API routes (balances, mid-session-reward, player loyalty) |
| GAP-B6 | P1 | History/support visibility missing for comp issuance family |

---

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| Vector A: tier-to-entitlement mapping (D1/GAP-A5) | **Blocks** entitlement auto-derivation RPC | Pending |
| Vector A: reward catalog activation state | Required for filtering | Backend exists |
| LoyaltyService (8 methods) | Required | 100% implemented |
| PromoService (11 methods) | Required | 100% implemented |
| 14 RPCs (points + promo) | Required | All operational |
| ADR-024 `set_rls_context_from_staff()` | Required | Operational |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.

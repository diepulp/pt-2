---
id: SCAFFOLD-LOYALTY-OPERATOR-ISSUANCE
title: "Feature Scaffold: Loyalty Operator Issuance"
owner: agent/feature-pipeline
status: Draft
date: 2026-03-18
---

# Feature Scaffold: Loyalty Operator Issuance

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** Loyalty Operator Issuance
**Owner / driver:** agent/feature-pipeline
**Stakeholders (reviewers):** pit boss operators, loyalty domain, security
**Status:** Draft
**Last updated:** 2026-03-18

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss, I can view available rewards for a player and issue a reward (comp or entitlement) from the player context, with clear feedback on success or failure.
- **Primary actor:** Pit Boss — floor supervisor with player management authority
- **Success looks like:** Pit boss issues a pilot reward through a normal workflow in under 10 seconds, with the issuance persisted and visible in reward history.

## 2) Constraints (hard walls)

- **Security / tenancy:** All issuance RPCs must use `set_rls_context_from_staff()` (ADR-024). Casino-scoped RLS on all tables. Staff identity derived from JWT, never spoofable.
- **Domain:**
  - Two structurally distinct issuance families (`points_comp` and `entitlement`) must remain separate per REWARD_FULFILLMENT_POLICY.md
  - `points_comp` debits loyalty balance — must enforce sufficient balance check
  - `entitlement` creates discrete coupon — no points consumed, tier-derived
  - Idempotency required: one outstanding entitlement coupon per gaming-day (or visit)
- **Operational:** Issuance must be atomic — no partial state (debit without record, or coupon without outbox entry)
- **Regulatory:** Audit trail required — all issuance events must be traceable to actor + timestamp

## 3) Non-goals (what we refuse to do in this iteration)

- Admin catalog CRUD (Vector A — separate feature)
- Print template rendering or physical fulfillment (Vector C)
- Multi-casino cross-property issuance (Phase 2 Dual Boundary)
- Automated/scheduled reward issuance (no batch operations)
- Mid-session reward auto-trigger (GAP-B5 divergent module — deferred)

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Player ID (casino-scoped)
  - Reward selection (from `reward_catalog`, filtered by family + active + casino)
  - Optional: visit ID (for visit-scoped idempotency)
  - Staff identity (JWT-derived, implicit)

- **Outputs:**
  - `points_comp` family: `loyalty_ledger` debit row + updated `player_loyalty.balance`
  - `entitlement` family: `promo_coupon` row + `loyalty_outbox` event
  - Issuance confirmation (success/failure) to operator UI
  - Updated reward history (both families visible)

- **Canonical contract(s):**
  - `RewardCatalogDTO` (available rewards)
  - `IssuanceResultDTO` (success payload with family-specific details)
  - `RewardHistoryDTO` (unified history — comps + coupons)

## 5) Options (2-4 max; force tradeoffs)

### Option A: Unified Issue Drawer with family-aware sub-flows

- **Pros:** Single entry point for operator. Consistent UX regardless of reward family. Reward catalog drives available options — operator doesn't need to understand underlying families.
- **Cons / risks:** More complex UI component. Must handle two distinct confirmation flows in one drawer.
- **Cost / complexity:** Medium. One drawer component with conditional confirm panels.
- **Security posture impact:** Neutral — both paths go through existing SECURITY DEFINER RPCs.
- **Exit ramp:** Drawer can be split into per-family dialogs later without backend changes.

### Option B: Per-family trigger buttons (separate "Issue Comp" and "Issue Match Play")

- **Pros:** Simpler per-component. Each button → dedicated dialog → single RPC path. Easier to ship incrementally.
- **Cons / risks:** Operator must understand family distinction. Two entry points means two places to maintain. Doesn't scale when more families are added.
- **Cost / complexity:** Low per-component, but more total components.
- **Security posture impact:** Neutral.
- **Exit ramp:** Can be unified into a drawer later (refactor, not rewrite).

### Option C: Extend existing ManualRewardDialog (fix the stub)

- **Pros:** Reuses existing component. Smallest diff.
- **Cons / risks:** ManualRewardDialog collects wrong fields and was never wired. Fixing it may be more work than replacing it. Name is misleading ("manual" vs "operator issuance").
- **Cost / complexity:** Low initially, but high hidden cost to fix the stub correctly.
- **Security posture impact:** Neutral.
- **Exit ramp:** Eventually replaced by purpose-built component.

## 6) Decision to make (explicit)

- **Decision D1:** Unified drawer (A) vs per-family triggers (B) vs fix stub (C)
  - Decision drivers: Operator cognitive load, maintainability, pilot scope
  - Recommendation: **Option A** — unified drawer. Operator shouldn't think about "families"; they think about "give this player a reward."

- **Decision D2:** Entitlement idempotency scope — gaming-day vs visit
  - Decision drivers: Operational simplicity vs flexibility
  - Recommendation: **Gaming-day** — simpler, matches floor reality

- **Decision D3:** Comp issuance RPC — new `rpc_issue_comp` vs extend `rpc_redeem`
  - Decision drivers: Separation of concerns vs reuse
  - Recommendation: Evaluate `rpc_redeem` first — if metadata extension suffices, reuse it

- **Decision D4:** Issuance-to-fulfillment handoff — direct callback vs event
  - Decision drivers: Simplicity for pilot vs future extensibility
  - Recommendation: **Direct callback** in mutation hook's `onSuccess` — simplest for pilot

- **Decision D5:** Replacement behavior for entitlements — honor issued vs auto-replace
  - Decision drivers: Policy stability vs operator flexibility
  - Recommendation: **Honor issued** (Behavior 1) — what was issued stays valid

## 7) Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| Vector A: tier-to-entitlement mapping (GAP-A5) | Required for entitlement auto-derivation | Pending |
| Vector A: `reward_catalog` + admin UI | Required for reward availability | Backend exists |
| LoyaltyService (8 methods) | Required | 100% implemented |
| PromoService (11 methods) | Required | 100% implemented |
| 14 operational RPCs | Required | All operational |
| ADR-024 `set_rls_context_from_staff()` | Required | Operational |
| Player 360 component tree | Required (issuance triggers added here) | Exists |

## 8) Risks / Open questions

| Risk / Question | Impact | Mitigation / Learning Plan |
|-----------------|--------|---------------------------|
| Vector A tier mapping decision blocks entitlement RPC | High — can't ship entitlement issuance without it | Ship comp issuance first; parallel-track Vector A D1 resolution |
| Existing `rpc_redeem` may not support comp slip metadata | Med — may need new RPC | Investigate `rpc_redeem` signature in RFC phase |
| `ManualRewardDialog` is a broken stub — developer confusion | Low | Replace entirely in Option A; delete stub |
| 3 stubbed API routes (GAP-B4) may cause runtime errors | Med | Wire or remove stubs as part of this feature |
| Unified history (GAP-B6) crosses ledger + coupon tables | Med | Single query with UNION or application-layer merge |

## 9) Definition of Done (thin)

- [ ] Decision recorded in ADR(s) — D1 through D5
- [ ] Acceptance criteria agreed (from investigation doc §Acceptance criteria)
- [ ] Implementation plan delegated to `/build`

## Links

- Feature Boundary: `docs/20-architecture/specs/loyalty-operator-issuance/FEATURE_BOUNDARY.md`
- Investigation: `docs/00-vision/loyalty-service-extension/vectors/vector-B/VECTOR-B-OPERATOR-ISSUANCE-INVESTIGATION.md`
- Design Brief/RFC: (Phase 2)
- ADR(s): (Phase 4)
- PRD: (Phase 5)
- Exec Spec: (post-pipeline)

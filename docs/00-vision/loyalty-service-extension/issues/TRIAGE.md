---
title: "Loyalty Service Extension — Issue Triage & Effort Assessment"
date: 2026-03-19
status: active
jira_tickets:
  - P2K-28  # Entitlement metadata not populated
  - P2K-29  # Fulfillment enum mismatch
  - P2K-30  # Variable-amount comp issuance
  - P2K-31  # Eligibility cadence enforcement
  - P2K-32  # Rating slip reward issuance
  - P2K-33  # visitId not threaded
---

# Loyalty Service Extension — Issue Triage & Effort Assessment

## Summary

6 issues identified during loyalty service extension posture review. 4 are immediate fixes (wiring/alignment), 1 requires `/build` pipeline, 1 requires `/feature` pipeline.

---

## Immediate Fixes (no pipeline needed)

### P2K-29 — Fulfillment enum mismatch (P0, XS ~10 lines)

DB CHECK constraint uses `('immediate', 'voucher', 'external')`, app uses `('comp_slip', 'coupon', 'none')`. Zero overlap — every insert fails.

**Fix**: 1 migration to align CHECK constraint + add `23514` handler to `mapRewardError()`.

**Artifacts**:

| Type | Path | Lines |
|------|------|-------|
| Investigation | [fulfillment-enum-mismatch.md](fulfillment-enum-mismatch.md) | — |
| DB constraint | `supabase/migrations/20260206005751_adr033_reward_catalog_schema.sql` | :38 |
| Zod schema | `services/loyalty/reward/schemas.ts` | :59 |
| TS type | `services/loyalty/reward/dtos.ts` | :31 |
| UI dropdown | `components/admin/loyalty/rewards/create-reward-dialog.tsx` | :211-214 |
| Error mapper | `services/loyalty/reward/crud.ts` (`mapRewardError()`) | :61-123 |

---

### P2K-28 — Entitlement metadata not populated (P0, S ~15 lines)

`issueEntitlement()` reads from `reward.metadata` (empty JSONB). Should read from `reward.entitlementTiers[].benefit` with player tier lookup.

**Fix**: Add `getBalance()` call for tier, find matching `entitlementTier`, extract `face_value_cents` / `instrument_type` from `benefit`.

**Artifacts**:

| Type | Path | Lines |
|------|------|-------|
| Investigation | [metadata-not-populated.md](metadata-not-populated.md) | — |
| Issuance fn | `services/loyalty/promo/crud.ts` (`issueEntitlement()`) | :692-713 |
| Reward loader | `services/loyalty/reward/crud.ts` (`getReward()`) | :181-254 |
| Balance/tier | `services/loyalty/crud.ts` (`getBalance()`) | :448-499 |
| Tier form | `components/admin/loyalty/rewards/tier-entitlement-form.tsx` | — |
| Tier DTOs | `services/loyalty/reward/dtos.ts` (`RewardEntitlementTierDTO`) | :82-88 |
| Spec | EXEC-052 WS2, PRD-052 §7.3 | — |

---

### P2K-33 — visitId not threaded from Player 360 (P2, XS ~8 lines)

`IssueRewardButton` in Player 360 header doesn't pass `visitId`. Hook `useActiveVisit()` exists but isn't called.

**Fix**: Call `useActiveVisit(playerId)`, add `visitId` prop to `IssueRewardButton` and `IssueRewardDrawer`, pass through.

**Artifacts**:

| Type | Path | Lines |
|------|------|-------|
| Investigation | [visitid-not-threaded-to-issuance.md](visitid-not-threaded-to-issuance.md) | — |
| Button render site | `components/player-360/header/player-360-header-content.tsx` | :516-524 |
| Button component | `components/player-360/header/issue-reward-button.tsx` | — |
| Drawer | `components/loyalty/issue-reward-drawer.tsx` | :100-109 |
| Mutation hook | `hooks/loyalty/use-issue-reward.ts` (`IssueRewardInput.visitId`) | :27-36 |
| Active visit hook | `hooks/visit/use-active-visit.ts` (exists, unused in P360) | — |
| BFF data source | `services/player360-dashboard/crud.ts` (fetches visit, doesn't expose) | :97-103 |

---

### P2K-32 — Rating slip reward issuance (P1, S ~20 lines)

Reward issuance only accessible via Player 360. Rating slip modal has all required props but no `IssueRewardButton`.

**Fix**: Add `IssueRewardButton` to loyalty section of `rating-slip-modal.tsx`, thread `visitId` from `modalData.slip.visitId`.

**Note**: P2K-33 and P2K-32 share the `visitId` prop addition to `IssueRewardButton` / `IssueRewardDrawer`. Do them together.

**Artifacts**:

| Type | Path | Lines |
|------|------|-------|
| Investigation | [rating-slip-reward-issuance-gap.md](rating-slip-reward-issuance-gap.md) | — |
| Modal (loyalty section) | `components/modals/rating-slip/rating-slip-modal.tsx` | :699-763 |
| Reference impl | `components/player-360/header/issue-reward-button.tsx` | — |
| Drawer | `components/loyalty/issue-reward-drawer.tsx` | — |
| Mutation hook | `hooks/loyalty/use-issue-reward.ts` | — |
| Modal data hook | `hooks/rating-slip/use-rating-slip-modal-data.ts` | — |

---

## Requires `/build` Pipeline

### P2K-30 — Variable-amount comp issuance (P1, M ~25-30 lines)

Pit boss can't enter dollar amount for comps. System only supports fixed-price catalog comps.

**Why /build**: New UI state (dollar input, auto-conversion display, overdraw toggle), DTO changes across 3 layers, service logic branching. Needs design thinking for `CompConfirmPanel` UX. RPC is ready (`rpc_redeem` already supports arbitrary `p_points` + `p_allow_overdraw`).

**Artifacts**:

| Type | Path | Lines |
|------|------|-------|
| Investigation | [variable-amount-comp-gap.md](variable-amount-comp-gap.md) | — |
| Service fn | `services/loyalty/crud.ts` (`issueComp()`) | :647-759 |
| Hardcoded overdraw | `services/loyalty/crud.ts` (`p_allow_overdraw: false`) | :716-719 |
| DTO | `services/loyalty/dtos.ts` (`IssueCompParams`) | :422-437 |
| UI panel | `components/loyalty/comp-confirm-panel.tsx` | full (141 lines) |
| RPC (no change) | `supabase/migrations/20260307114447` (`rpc_redeem`) | — |
| Earn config context | `docs/00-vision/loyalty-service-extension/LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md` | D1, D2 |
| Spec | EXEC-052 WS2/WS4 | — |

---

## Requires `/feature` Pipeline

### P2K-31 — Eligibility cadence enforcement (P1, L ~60+ lines)

Schema is 100% complete (`reward_limits`, `reward_eligibility` tables deployed and seeded). Enforcement is 0% — nothing in the issuance path reads these tables.

**Why /feature**: 3-phase implementation with distinct deliverables:
1. **Phase 1** — Service-layer pre-flight checks (`issueComp()` / `issueEntitlement()` read `reward_limits`, count issuance history, enforce max_issues + cooldown)
2. **Phase 2** — Dashboard mapper fix (replace hardcoded 30m cooldown with per-reward limit data, family-differentiated UX)
3. **Phase 3** — RPC hard enforcement (defense-in-depth, `reward_limits` checks inside `rpc_redeem` / `rpc_issue_promo_coupon`)

New error codes (`REWARD_LIMIT_REACHED`, `REWARD_COOLDOWN_ACTIVE`), scope window resolution logic, gaming day boundary queries.

**Artifacts**:

| Type | Path | Lines |
|------|------|-------|
| Investigation | [eligibility-cadence-gap.md](eligibility-cadence-gap.md) | — |
| Eligible rewards | `services/loyalty/reward/crud.ts` (`listEligibleRewards()`) | :669-819 |
| Hardcoded cooldown | `services/player360-dashboard/mappers.ts` (`mapToRewardsEligibility()`) | :281-318 |
| Comp issuance | `services/loyalty/crud.ts` (`issueComp()`) | — |
| Entitlement issuance | `services/loyalty/promo/crud.ts` (`issueEntitlement()`) | — |
| Limits schema | `supabase/migrations/20260206005751_adr033_reward_catalog_schema.sql` | — |
| Eligibility UI | `components/player-360/rewards/rewards-eligibility-card.tsx` | — |
| Architecture | ADR-033 (reward catalog domain model) | — |
| Spec | EXEC-052 WS2/WS4 | — |

---

## Attack Order

```
Immediate (one session):
  1. P2K-29  Fulfillment enum mismatch        XS  (unblocks reward creation)
  2. P2K-28  Entitlement metadata              S   (unblocks entitlement issuance)
  3. P2K-33  visitId threading                 XS  (audit trail fix)
  + P2K-32  Rating slip issuance              S   (shared visitId prop work)

/build:
  4. P2K-30  Variable-amount comp              M   (new UI + service branching)

/feature:
  5. P2K-31  Eligibility cadence               L   (3-phase enforcement build)
```

P2K-29 and P2K-28 are blockers — the loyalty issuance workflow is non-functional until both are fixed.

---
title: "PRD-061 Cadence Enforcement — Implementation Precis"
status: delivered
date: 2026-04-06
pr: "#43"
branch: cadence-enf
resolves: eligibility-cadence-gap.md
jira: P2K-31
prd: PRD-061
---

# PRD-061 Cadence Enforcement — Implementation Precis

## What Was Delivered

PRD-061 wires the existing `reward_limits` schema (deployed by ADR-033) into the issuance service layer, adds an admin UI for configuring per-reward frequency rules, and fixes the dashboard to display real cadence status instead of a hardcoded 30-minute timer.

**PR #43** on branch `cadence-enf`. 19 files changed, ~1900 insertions.

---

## Workstream Breakdown

### WS0: Schema Amendments

**Migration**: `20260406013926_prd061_cadence_enforcement_schema.sql`

| Item | What |
|------|------|
| M1 | `promo_coupon.reward_catalog_id uuid NULL REFERENCES reward_catalog(id)` — links coupons to catalog for entitlement cadence counting |
| M2 | `rpc_issue_promo_coupon` updated with `p_reward_catalog_id uuid DEFAULT NULL` parameter (old 7-param overload dropped to avoid PostgREST ambiguity) |
| M3 | `UNIQUE (reward_id, scope)` constraint on `reward_limits` — one rule per scope per reward |
| M4 | Partial indexes: `idx_loyalty_ledger_cadence_count` (comp counting), `idx_promo_coupon_cadence_count` (entitlement counting) |
| M5 | `reward_limits` INSERT/UPDATE/DELETE RLS tightened from `pit_boss+admin` to `admin`-only. SELECT unchanged. |

`issueEntitlement()` now threads `params.rewardId` → `p_reward_catalog_id` in the RPC call.

### WS1: Admin Frequency Configuration UI

**New component**: `components/admin/loyalty/rewards/reward-limits-form.tsx`

- Table-based form: scope selector, max issues input, cooldown minutes input, requires-note toggle per rule
- Unique scope validation (client-side + DB constraint)
- `readOnly` prop for pit_boss view (admin can edit, pit_boss sees display-only)
- Save uses `useUpdateReward` with replace-all `limits` payload (same pattern as `TierEntitlementForm`)
- Wired into `RewardDetailClient` below the family-specific config section (visible for all reward families)

**Service changes**: `UpdateRewardInput.limits` field added with replace-all semantics in `updateReward()`. `updateRewardSchema` accepts `limits` array via existing `limitSchema`.

### WS2: Service-Layer Cadence Enforcement

**New module**: `services/loyalty/cadence.ts`

| Function | Purpose |
|----------|---------|
| `resolveWindowStart(scope, casinoId, playerId)` | Maps scope to timestamp boundary. `per_gaming_day` reads `casino_settings.gaming_day_start_time`. `per_visit` requires active visit (throws `REWARD_VISIT_REQUIRED`). |
| `countIssuances(playerId, rewardId, windowStart, family)` | Counts qualifying issuances. Comp: `loyalty_ledger` WHERE `reason='redeem' AND source_kind='reward'`. Entitlement: `promo_coupon` WHERE `status != 'voided'`. |
| `getLastIssuanceTime(playerId, rewardId, family)` | Returns most recent issuance timestamp for cooldown check. |
| `checkCadence(playerId, rewardId, casinoId, family, limits)` | Evaluates all rules conjunctively. Returns `CadenceCheckResult` with `allowed`, `code`, `guidance`, `retryAfterSeconds`, `nextEligibleAt`. |
| `requiresNote(limits)` | Returns true if any active limit has `requires_note=true`. |

**Enforcement wiring**:

- `issueComp()`: cadence gate added after reward validation, **only when `reward_limits` exist** (G5: points comps unrestricted by default)
- `issueEntitlement()`: cadence gate added after reward validation, before tier resolution
- Both paths enforce `requires_note` when configured

**Error codes** (added to `DomainErrorCode`):

| Code | HTTP | When |
|------|------|------|
| `REWARD_LIMIT_REACHED` | 429 | `max_issues` per scope window exceeded |
| `REWARD_COOLDOWN_ACTIVE` | 429 | `cooldown_minutes` not elapsed since last issuance |
| `REWARD_VISIT_REQUIRED` | 422 | `per_visit` scope active but player has no active visit |

**Route mapping** (`POST /api/v1/loyalty/issue`):

- `REWARD_LIMIT_REACHED` → `LOYALTY_LIMIT_REACHED` (429 + `Retry-After` header)
- `REWARD_COOLDOWN_ACTIVE` → `LOYALTY_COOLDOWN_ACTIVE` (429 + `Retry-After` header)
- `REWARD_VISIT_REQUIRED` → `LOYALTY_VISIT_REQUIRED` (422, no `Retry-After`)
- `note` field added to `issueRewardSchema` and `IssueEntitlementParams`

**Rule semantics** (per PRD-061 §5.4):

- Multi-rule evaluation is conjunctive (AND) — blocked if ANY rule blocks
- Priority: `COOLDOWN_ACTIVE` > `LIMIT_REACHED` (cooldown resolves sooner)
- `Retry-After`: `max(cooldown_retry, scope_retry)` when both block

### WS3: Dashboard Mapper Fix

**`services/player360-dashboard/dtos.ts`**:
- `DAILY_LIMIT_REACHED` renamed to `LIMIT_REACHED` (scope-generalized)
- `VISIT_REQUIRED` added to `ReasonCode` union

**`services/player360-dashboard/mappers.ts`**:
- New `RewardCadenceInfo` interface replaces `(recentRewardAt, cooldownMinutes)` params
- `mapToRewardsEligibility()` signature changed to `(loyaltyBalance, cadence: RewardCadenceInfo | null)`
- Implements PRD-061 §6 Dashboard Status Derivation Rules (priority: no-limits → visit-required → cooldown → limit-reached → available)
- Removed stale `lastRedemptionResult` parallel query from `getPlayerSummary()`

**Tests**: All 194 mapper tests pass. Eligibility tests rewritten against `RewardCadenceInfo` interface covering: available, cooldown active, cooldown expired, limit reached, visit required, unknown (no loyalty), cooldown-over-limit priority.

---

## What's NOT Delivered (Acknowledged Gaps)

| Gap | Status | Reference |
|-----|--------|-----------|
| RPC-layer hard enforcement inside `rpc_issue_promo_coupon`/`rpc_redeem` | Deferred to Phase 3 | PRD-061 §4.2, R3 |
| Per-reward eligibility card in dashboard (currently summary-level) | Future — requires component-level cadence queries | §6 per-reward cards |
| Retroactive limit enforcement on existing issuances | Explicitly out of scope | §2.3 |
| `visit_kinds` filtering on `reward_eligibility` | Not needed for pilot | §2.3 |
| SRM v4.20 amendment (`casino_settings` read by LoyaltyService) | Documentation-only, not yet applied | §8 DoD |
| Race condition on concurrent issuance (two pit bosses) | Advisory-grade only; RPC hardening deferred | R3 |

---

## Files Changed

```
NEW:
  components/admin/loyalty/rewards/reward-limits-form.tsx
  services/loyalty/cadence.ts
  supabase/migrations/20260406013926_prd061_cadence_enforcement_schema.sql
  docs/10-prd/PRD-061-rewards-eligibility-cadence-enforcement-v0.md

MODIFIED:
  app/api/v1/loyalty/issue/route.ts          (429/Retry-After mapping)
  components/admin/loyalty/rewards/reward-detail-client.tsx  (wire RewardLimitsForm)
  lib/errors/domain-errors.ts                (3 new error codes)
  services/loyalty/crud.ts                   (issueComp cadence gate)
  services/loyalty/promo/crud.ts             (issueEntitlement cadence gate + reward_catalog_id threading)
  services/loyalty/promo/dtos.ts             (note field on IssueEntitlementParams)
  services/loyalty/reward/crud.ts            (limits replace-all in updateReward)
  services/loyalty/reward/dtos.ts            (limits in UpdateRewardInput)
  services/loyalty/reward/schemas.ts         (limits in updateRewardSchema)
  services/loyalty/schemas.ts                (note field in issueRewardSchema)
  services/player360-dashboard/__tests__/mappers.test.ts  (rewritten eligibility tests)
  services/player360-dashboard/crud.ts       (removed stale lastRedemption query)
  services/player360-dashboard/dtos.ts       (LIMIT_REACHED, VISIT_REQUIRED)
  services/player360-dashboard/mappers.ts    (RewardCadenceInfo, refactored mapper)
  types/database.types.ts                    (regenerated)
```

---

## Validation

- Type check: PASS (zero errors)
- Lint: PASS (zero errors on all changed files)
- Mapper tests: 194/194 PASS
- Migration: applied cleanly via `supabase migration up`

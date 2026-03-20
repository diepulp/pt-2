---
title: "Rewards Eligibility Cadence — Posture & Gap Analysis"
severity: P1
status: open
date: 2026-03-19
affects: Reward issuance frequency enforcement — no temporal limits enforced anywhere
references:
  - ADR-033 (reward catalog domain model — reward_limits, reward_eligibility tables)
  - EXEC-052 WS2/WS4 (issuance path — no limits enforcement)
  - services/loyalty/reward/crud.ts:669-819 (listEligibleRewards)
  - services/player360-dashboard/mappers.ts:281-318 (hardcoded 30m cooldown)
  - supabase/migrations/20260206005751_adr033_reward_catalog_schema.sql (table definitions)
---

# Rewards Eligibility Cadence — Posture & Gap Analysis

## Executive Summary

The cadence/eligibility infrastructure is **schematically complete but enforcement is zero**. ADR-033 deployed `reward_limits` and `reward_eligibility` tables with the right columns (`scope`, `max_issues`, `cooldown_minutes`). Seed data populates limits for entitlement rewards. But **nothing in the issuance path reads these tables**. The only cooldown signal is a hardcoded 30-minute timer in the dashboard UI mapper — it's cosmetic, not enforced, and applies globally across all reward types.

The desired behavior — points comps unrestricted (bounded only by balance), entitlements cadence-limited per `reward_limits` configuration — requires wiring what already exists in the schema into the issuance service layer and RPCs.

---

## Current State: What Exists

### Schema (Deployed, Seeded)

**`reward_limits`** — per-reward frequency rules:

| Column | Type | Purpose | Enforced? |
|---|---|---|---|
| `scope` | `per_visit` / `per_gaming_day` / `per_week` / `per_month` | Time window for counting | No |
| `max_issues` | int (default 1) | Max issuances per window | No |
| `cooldown_minutes` | int (nullable) | Minimum minutes between issuances | No |
| `requires_note` | boolean | Require staff note on issuance | No |

**`reward_eligibility`** — per-reward access rules:

| Column | Type | Purpose | Enforced? |
|---|---|---|---|
| `min_tier` | text | Player must be at or above this tier | Yes (in `listEligibleRewards`) |
| `max_tier` | text | Player must be at or below this tier | Yes (in `listEligibleRewards`) |
| `min_points_balance` | int | Minimum balance required | Yes (in `listEligibleRewards`) |
| `visit_kinds` | text[] | Restrict to certain visit types | No |

**Seed data**: Entitlement rewards seeded with `per_gaming_day, max_issues=1`. No eligibility rules seeded.

### UI (Cosmetic Only)

**`RewardsEligibilityCard`** (`components/player-360/rewards/rewards-eligibility-card.tsx`):
- Shows `available` / `not_available` / `unknown` status badge
- Displays countdown timer when cooldown active
- Reason codes: `AVAILABLE`, `COOLDOWN_ACTIVE`, `RULES_NOT_CONFIGURED`

**Data source**: `mapToRewardsEligibility()` in `services/player360-dashboard/mappers.ts`:
```typescript
function mapToRewardsEligibility(
  loyaltyBalance,
  recentRewardAt,
  cooldownMinutes = 30,   // ← HARDCODED
)
```

- Queries last `reason='redeem'` entry from `loyalty_ledger` (ANY reward, not per-reward)
- Applies a flat 30-minute cooldown from that timestamp
- Does not query `reward_limits` table
- Does not differentiate between reward families

### Service Layer (Loads But Ignores)

**`listEligibleRewards()`** (`services/loyalty/reward/crud.ts:669-819`):
- Fetches `reward_limits` rows for each reward (parallel with other child records)
- Includes limits in `EligibleRewardDTO.limits` array
- **Never evaluates** `max_issues`, `scope`, or `cooldown_minutes` against issuance history
- Tier and balance checks from `reward_eligibility` ARE enforced

### Issuance Path (Zero Enforcement)

| Location | Cooldown | max_issues | scope window |
|---|:---:|:---:|:---:|
| `issueComp()` | — | — | — |
| `issueEntitlement()` | — | — | — |
| `rpc_redeem` | — | — | — |
| `rpc_issue_promo_coupon` | — | — | — |
| `POST /api/v1/loyalty/issue` route | — | — | — |

Idempotency in both RPCs is **per-key only** — prevents duplicate requests but allows unlimited issuance with different keys.

---

## Desired Behavior

### Points Comps (`family = 'points_comp'`)
- **No temporal restriction** — comps are bounded by available points balance
- Balance is the natural limiter; overdraw requires pit_boss/admin authorization
- `reward_limits` for comps should be optional (admin can add if desired, but not required)
- Eligibility card shows `available` whenever balance > 0

### Entitlements (`family = 'entitlement'`)
- **Cadence-limited** per `reward_limits` configuration
- Examples: "1 match play per gaming day", "1 free play every 4 hours", "2 per week"
- `max_issues` + `scope` = hard cap per time window
- `cooldown_minutes` = minimum interval between issuances (independent of scope cap)
- Enforcement at **service layer** (pre-flight check before RPC call) — advisory for UX, authoritative for data integrity
- Eligibility card shows countdown timer with actual configured cooldown, not hardcoded 30m

---

## Gap Analysis

### Gap 1: Cooldown Is Dashboard Decoration, Not Issuance-Safe

The 30-minute cooldown in `mapToRewardsEligibility()` is:
- Hardcoded (not from `reward_limits.cooldown_minutes`)
- Global (applies to last ANY redemption, not per-reward)
- UI-only (issuance endpoints don't check it)
- Bypassable (direct API call skips dashboard)

**Fix**: Move cooldown check into `issueComp()`/`issueEntitlement()` pre-flight, reading from `reward_limits.cooldown_minutes`. Update dashboard mapper to also read from `reward_limits`.

### Gap 2: No Issuance History Window Queries

To enforce "max 1 per gaming day", the system needs to count: *how many times has this reward been issued to this player in the current gaming day?*

Neither RPC nor service method performs this query today. Required:
- For comps: query `loyalty_ledger` WHERE `reward_id = X AND player_id = Y AND created_at >= window_start`
- For entitlements: query `promo_coupon` WHERE `player_id = Y AND issued_at >= window_start AND status != 'voided'`

**Options**:
- **A (Service layer)**: Query in `issueComp()`/`issueEntitlement()` before calling RPC — simple, consistent with existing advisory pattern
- **B (RPC layer)**: Add limit checks inside `rpc_redeem`/`rpc_issue_promo_coupon` — authoritative but requires migration + `reward_limits` table join
- **Recommended**: Both. Service layer for UX-quality errors; RPC for hard enforcement (defense-in-depth, matches role gate pattern).

### Gap 3: Scope Window Resolution

`reward_limits.scope` values need resolution to actual timestamp ranges:
- `per_visit`: current active visit start → now
- `per_gaming_day`: gaming day boundaries (from `casino_settings.gaming_day_start_hour`)
- `per_week`: rolling 7 days
- `per_month`: rolling 30 days

Gaming day boundaries require reading `casino_settings` — this is already available in the visit/rating-slip context but not in the loyalty issuance path.

### Gap 4: Family-Differentiated Eligibility

The eligibility card and dashboard mapper treat all rewards identically. Need:
- Points comps: show `available` based on balance alone (no cooldown)
- Entitlements: show `available` / `cooldown` / `limit_reached` based on per-reward `reward_limits`

### Gap 5: `promo_program` Has No Frequency Fields

`promo_program` table has `start_at`/`end_at` (program lifecycle) but no per-player frequency limits. Cadence lives on `reward_limits` (per reward catalog entry), not on the program. This is architecturally fine — the reward catalog is the issuance menu, and limits belong on menu items.

---

## Readiness Matrix

| Dimension | Readiness | Notes |
|---|---|---|
| Schema (`reward_limits` table) | **100%** | All columns exist: scope, max_issues, cooldown_minutes, requires_note |
| Schema (`reward_eligibility` table) | **100%** | All columns exist: min_tier, max_tier, min_points_balance, visit_kinds |
| Seed data | **80%** | Entitlement limits seeded (1/gaming_day). No eligibility rules seeded. |
| DTOs | **100%** | `RewardLimitDTO`, `RewardEligibilityDTO` fully defined |
| Service data loading | **90%** | `listEligibleRewards()` fetches limits/eligibility. Not used for filtering. |
| Tier/balance eligibility enforcement | **70%** | Enforced in `listEligibleRewards()` only. Not at issuance time. |
| Cooldown enforcement | **5%** | Dashboard-only, hardcoded 30m, global, non-blocking |
| Scope window enforcement | **0%** | No max_issues / scope checking anywhere |
| Time-window issuance counting | **0%** | No queries for per-reward per-player issuance history |
| RPC-level hard enforcement | **0%** | RPCs have no awareness of reward_limits |
| Family-differentiated UX | **0%** | Dashboard treats all families identically |
| Admin UI for limits | **50%** | No dedicated limits editor. Values set via seed/API only. |

---

## Implementation Approach

### Phase 1: Service-Layer Enforcement (Unblocks Pilot)

Add pre-flight limit check to `issueComp()` and `issueEntitlement()`:

```typescript
// In issueEntitlement() — before calling RPC:
const limits = reward.limits; // already loaded by getReward()
if (limits.length > 0) {
  for (const limit of limits) {
    const windowStart = resolveWindowStart(limit.scope, casinoId);
    const issuanceCount = await countIssuances(
      supabase, params.playerId, reward.id, windowStart
    );
    if (issuanceCount >= limit.maxIssues) {
      throw new DomainError('REWARD_LIMIT_REACHED',
        `Max ${limit.maxIssues} issuances ${limit.scope} reached`);
    }
    if (limit.cooldownMinutes) {
      const lastIssuedAt = await getLastIssuanceTime(
        supabase, params.playerId, reward.id
      );
      if (lastIssuedAt && minutesSince(lastIssuedAt) < limit.cooldownMinutes) {
        throw new DomainError('REWARD_COOLDOWN_ACTIVE',
          `Cooldown: ${limit.cooldownMinutes - minutesSince(lastIssuedAt)} minutes remaining`);
      }
    }
  }
}
```

For `issueComp()`: skip limit checks by default (balance is the limiter). Optional limits if admin configures them.

### Phase 2: Dashboard Mapper Fix

Replace hardcoded 30m cooldown with per-reward limit data:
- Query `reward_limits` for active entitlement rewards
- Compute next eligible time from actual issuance history + configured cooldown
- Differentiate points_comp (always eligible if balance > 0) from entitlement (cadence-gated)

### Phase 3: RPC Hard Enforcement (Defense-in-Depth)

Add `reward_limits` check inside `rpc_issue_promo_coupon`:
- Join `reward_limits` on `p_reward_id`
- Count existing coupons for player in scope window
- RAISE EXCEPTION if limit exceeded

This makes the limit unbypassable even via direct RPC calls.

---

## Error Codes (New)

| Code | HTTP | Meaning |
|---|---|---|
| `REWARD_LIMIT_REACHED` | 429 | Max issuances for scope window exceeded |
| `REWARD_COOLDOWN_ACTIVE` | 429 | Minimum interval between issuances not elapsed |

Both should return `Retry-After` header with seconds until next eligible issuance.

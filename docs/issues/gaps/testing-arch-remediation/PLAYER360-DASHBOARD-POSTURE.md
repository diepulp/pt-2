# Player360Dashboard Bounded Context -- Testing Posture Statement

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-04-02
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD v2.0.0
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md Tier 2

---

## Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (engagement, rewards eligibility, recent events, metadata, reward history) | Trusted-Local | Healthy | `npm run test:slice:player360-dashboard` |
| Integration | N/A | N/A | No integration tests; context is pure mapper/presenter logic |

---

## File Inventory

| File | Canonical Layer | Classification | Runtime | Gate |
|------|----------------|----------------|---------|------|
| `mappers.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |

---

## Route Surface

Player360Dashboard has **no `http.ts`** and **no API routes**. The context is a
pure presentation-layer service that aggregates data from other bounded contexts
(visit, loyalty, player-timeline) and maps it into dashboard-specific DTOs for
the Player 360 panel. No route-handler exemplar is needed.

---

## Unit Test Coverage (mappers.test.ts)

The unit test file validates all mapper functions in the Player360Dashboard service
layer. It covers:

1. **mapToEngagement** -- Engagement status derivation:
   - "active" when last event within 15 minutes (inclusive boundary)
   - "cooling" when between 16-60 minutes (inclusive boundary)
   - "dormant" when over 60 minutes
   - Fallback to `visit.started_at` when `lastEventAt` is null
   - Fallback to now when both visit and lastEventAt are null
   - `durationMinutes` calculation from visit start
   - `lastSeenAt` population from lastEventAt

2. **mapToRewardsEligibility** -- Rewards cooldown logic:
   - "available" when no recent reward
   - "not_available" with cooldown when reward is recent (<30 min)
   - "available" when reward is past cooldown (>30 min)
   - Boundary testing at 29 min (still cooling) vs 45 min (available)
   - "unknown" when no loyalty balance (RULES_NOT_CONFIGURED)
   - Custom cooldown minutes (15 min, 60 min)
   - `nextEligibleAt` timestamp calculation accuracy

3. **mapToRecentEvents** -- Timeline event extraction:
   - Extracts lastBuyIn, lastReward, lastNote from timeline events
   - Returns nulls for empty event list
   - Handles `promo_issued` as reward type "promo"
   - Picks first matching event per category
   - Truncates note preview to 50 characters
   - Defaults amount to 0 when null on cash_in

4. **toMetadataRecord** -- Type guard for metadata:
   - Returns object as-is for valid objects
   - Returns empty object for null, arrays, primitive strings

5. **parseLoyaltyData** -- Loyalty balance extraction:
   - Extracts from `current_balance` field
   - Falls back to `balance` field
   - Returns null for null input
   - Defaults balance to 0 when both fields missing

6. **mapToRewardHistoryItem** (PRD-052 WS5 bug fix validation):
   - Maps `entry_type="redeem"` to `rewardType="comp"` (WS5 bug fix)
   - Maps promo-related entry_type to "matchplay"
   - Maps free-related entry_type to "freeplay"
   - Maps unknown entry_type to "other"
   - Staff identity fallback to System when null

7. **mapPromoCouponToRewardHistoryItem** (PRD-052 WS5 promo_coupon source):
   - Maps `match_play` promo_type to "matchplay"
   - Maps `free_play` promo_type to "freeplay"

All assertions are behavioural (field values, status derivation, boundary conditions),
not shallow. The test file exercises real business logic including time-based
engagement classification and cooldown arithmetic.

---

## Integration Tests

Player360Dashboard has **no integration test files**. The context is a pure
presenter/aggregator -- it does not own database tables or RPCs. All data access
is delegated to upstream contexts (visit, loyalty, player-timeline). Integration
testing of the data pipeline is covered by those upstream contexts' integration
test suites.

---

## Tenancy Verification Gap

Unit tests verify mapper logic with in-memory test data. They do NOT verify tenant
isolation or RLS enforcement. Tenant isolation is enforced by upstream data-access
contexts (visit, loyalty, player-timeline) which have their own RLS-gated
integration tests.

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in Player360Dashboard context
- The existing test file contains genuine behavioural assertions with boundary testing
- New tests must follow the established pattern (time-relative factories, boundary conditions)

---

## Shallow Test Reclassification (S9.2)

No tests reclassified. `mappers.test.ts` contains genuine behavioural assertions:
engagement status boundaries, cooldown arithmetic, event extraction, type guard
validation, reward history mapping with bug-fix regression coverage (PRD-052 WS5).

---

## Skipped Tests

None. All tests pass under node runtime.

---

## Slice Script

```bash
npm run test:slice:player360-dashboard
```

Runs all `services/player360-dashboard/__tests__/*.test.ts` files under `jest.node.config.js`.

---

## Change-Control Disclosure (S12)

1. **What changed:** Player360Dashboard testing posture documented. No test file
   modifications required -- the file already had `@jest-environment node` directive.
2. **Why:** Testing governance remediation per ADR-044 / Tier 2 rollout.
3. **Layers gained:** Server-Unit -> Trusted-Local.
4. **Confidence:** Baseline established -- Player360Dashboard has honest local
   verification of all mapper/presenter logic under correct runtime with boundary
   condition coverage.
5. **Compensating controls:** N/A (confidence established, not reduced).
6. **Exit criteria for advisory layers:** N/A -- no advisory layers in Player360Dashboard context.

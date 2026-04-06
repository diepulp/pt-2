# P2K-31 Reward Cadence Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce reward issuance cadence limits (max_issues per scope window, cooldown_minutes) that are schematically complete but currently unenforced, closing the gap where entitlements can be issued without frequency restrictions.

**Architecture:** Add a cadence enforcement module (`services/loyalty/reward/cadence.ts`) with scope-resolution logic and Supabase counting queries. Wire pre-flight cadence checks into `issueComp()` and `issueEntitlement()` before their respective RPC calls. Replace the hardcoded 30-minute dashboard cooldown with data from `reward_limits`. Three new DomainError codes: `REWARD_LIMIT_REACHED` (429), `REWARD_COOLDOWN_ACTIVE` (429), and `REWARD_SCOPE_UNSUPPORTED` (400, fail-closed for `per_visit`).

**Tech Stack:** TypeScript, Supabase (PostgreSQL), Jest, Next.js App Router

**Key insight — issuance counting sources:**
- **Comps** (`points_comp`): `loyalty_ledger` WHERE `source_kind = 'reward' AND source_id = {reward_id}` — `rpc_redeem` stores reward_id in `source_id` column
- **Entitlements**: `promo_coupon` WHERE `player_id = Y AND promo_program_id = P AND status != 'voided'` — no `reward_id` on `promo_coupon`, so count via resolved `promo_program_id`

**Scope decisions:**
- `per_gaming_day`: Resolve using casino-local gaming day boundaries via `rpc_current_gaming_day()` + `casino_settings.gaming_day_start_time` + `casino_settings.timezone`. A new migration adds `rpc_gaming_day_start_utc()` to return the gaming day start as a UTC timestamp. This avoids the contract mutation of silently substituting UTC midnight under the `per_gaming_day` label.
- `per_visit`: **Fail closed.** If a `per_visit` limit is configured, issuance is blocked with `REWARD_SCOPE_UNSUPPORTED`. Seed data uses `per_gaming_day` only, so this is a safety net for misconfiguration.
- `per_week`: Rolling 7 days from now.
- `per_month`: Rolling 30 days from now.
- Phase 3 (RPC hard enforcement): Not in this plan. See Pilot Limitation below.

---

## Product Rules Locked for P2K-31

- Entitlements are cadence-enforced when `reward_limits` exist.
- Points comps are cadence-enforced **only** when limits are explicitly configured (balance is the natural limiter).
- `max_issues` is evaluated before `cooldown_minutes` — first violation short-circuits.
- `requires_note` is explicitly **out of scope** for this ticket.
- Dashboard eligibility is a **summary indicator for entitlement cadence state**, derived from `promo_coupon` (entitlement issuance history) and `reward_limits` filtered by `family='entitlement'`. Points comp availability is communicated by `pointsAvailable`. Per-reward eligibility is available downstream via `EligibleRewardDTO.limits[]`.

## Pilot Limitation

> **Service-layer-only enforcement:** Cadence enforcement in this slice is authoritative only through the service-layer issuance path (`issueComp()` / `issueEntitlement()`). Direct RPC calls (`rpc_redeem`, `rpc_issue_promo_coupon`) bypass cadence checks entirely. RPC-level defense-in-depth is deferred and remains a known integrity gap. Backlog item: P2K-31-phase3.

## Acceptance Criteria

1. Entitlement with `per_gaming_day / max_issues=1` blocks second issuance in the same gaming day (casino-local boundary, not UTC midnight).
2. Entitlement with `cooldown_minutes=240` returns remaining wait time in error details when retried early.
3. Points comp with **no** configured limits is not blocked by cadence checks (balance-bounded only).
4. Points comp with configured limits enforces those limits.
5. `per_visit` scope blocks issuance with `REWARD_SCOPE_UNSUPPORTED` (fail-closed).
6. Dashboard entitlement summary state reflects the same entitlement issuance history (`promo_coupon`) and configured limit family (`reward_limits` filtered by `family='entitlement'`) used by enforcement inputs.
7. `REWARD_COOLDOWN_ACTIVE` maps to HTTP 429 with `retryAfterSeconds` in error details. `REWARD_LIMIT_REACHED` maps to HTTP 429 without `retryAfterSeconds` (window-reset time is not computed in this slice).

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| **Create** | `supabase/migrations/{timestamp}_add_gaming_day_start_utc_rpc.sql` | RPC returning gaming day start as UTC timestamp |
| **Create** | `services/loyalty/reward/cadence.ts` | Scope resolution, issuance counting, cadence enforcement |
| **Create** | `services/loyalty/reward/__tests__/cadence.test.ts` | Unit tests for cadence module |
| **Modify** | `lib/errors/domain-errors.ts:70-130` | Add `REWARD_LIMIT_REACHED`, `REWARD_COOLDOWN_ACTIVE`, `REWARD_SCOPE_UNSUPPORTED` to `LoyaltyErrorCode` |
| **Modify** | `services/loyalty/crud.ts:789-905` | Add cadence pre-flight to `issueComp()` |
| **Modify** | `services/loyalty/promo/crud.ts:657-788` | Add cadence pre-flight to `issueEntitlement()` |
| **Modify** | `app/api/v1/loyalty/issue/route.ts:43-66` | Map new error codes to HTTP 429 |
| **Modify** | `services/player360-dashboard/mappers.ts:281-323` | Replace hardcoded 30m with entitlement-scoped cadence state + add `LIMIT_REACHED` |
| **Modify** | `services/player360-dashboard/crud.ts:126-134,279-282` | Fetch entitlement limits (family-filtered) + entitlement issuance history from `promo_coupon` |
| **Modify** | `services/player360-dashboard/dtos.ts:67-87` | Add `LIMIT_REACHED` to `ReasonCode` |
| **Modify** | `services/player360-dashboard/__tests__/mappers.test.ts:122-186` | Update tests for new mapper signature |

---

### Task 0: Migration — Add rpc_gaming_day_start_utc()

**Files:**
- Create: `supabase/migrations/{timestamp}_add_gaming_day_start_utc_rpc.sql`

This RPC returns the start of the current gaming day as a UTC timestamp, using the casino's configured `gaming_day_start_time` and `timezone` from `casino_settings`. This is the canonical way to resolve `per_gaming_day` scope without silently using UTC midnight.

**Operational preconditions:**
- RLS context must be set (`app.casino_id` via `set_rls_context_from_staff()`). If missing, `current_setting('app.casino_id')` returns empty string → cast to UUID fails → PostgreSQL raises error → TypeScript layer catches and throws `INTERNAL_ERROR`.
- `casino_settings` row must exist for the casino. If absent, the SQL returns NULL → TypeScript `getGamingDayStartUTC()` throws `INTERNAL_ERROR('Gaming day start RPC returned null')`.
- `rpc_current_gaming_day()` must succeed (depends on same RLS context). If it fails, the SQL fails → same error path.

All three conditions are guaranteed in the normal issuance path (called after `withServerAction` sets RLS context, and casino_settings is created during casino setup). These are not new failure modes — they are the same preconditions required by existing RPCs.

- [ ] **Step 1: Generate migration timestamp**

Run: `date +"%Y%m%d%H%M%S"`
Note the output (e.g. `20260405163000`).

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/{timestamp}_add_gaming_day_start_utc_rpc.sql`:

```sql
-- P2K-31: Gaming day start timestamp for cadence enforcement
--
-- Returns the UTC timestamp of the current gaming day's start boundary.
-- Uses rpc_current_gaming_day() for the date, then combines with
-- casino_settings.gaming_day_start_time and timezone to produce
-- a timezone-correct UTC timestamp.
--
-- SECURITY INVOKER: uses caller's RLS context (casino_id from app.casino_id).
-- Requires RLS context set via set_rls_context_from_staff().

CREATE OR REPLACE FUNCTION public.rpc_gaming_day_start_utc()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT (
    (public.rpc_current_gaming_day() || ' ' || cs.gaming_day_start_time)::timestamp
    AT TIME ZONE cs.timezone
  )
  FROM public.casino_settings cs
  WHERE cs.casino_id = current_setting('app.casino_id')::uuid;
$$;

COMMENT ON FUNCTION public.rpc_gaming_day_start_utc() IS
  'P2K-31: Returns UTC timestamp of current gaming day start for cadence scope resolution';
```

- [ ] **Step 3: Regenerate types**

Run: `npm run db:types-local 2>&1 | tail -5`
Expected: Types regenerated with new RPC signature.

- [ ] **Step 4: Verify RPC appears in types**

Run: `grep -A5 'rpc_gaming_day_start_utc' types/database.types.ts`
Expected: Shows `Args: Record<string, never>` and `Returns: string`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_add_gaming_day_start_utc_rpc.sql types/database.types.ts
git commit -m "feat(loyalty): add rpc_gaming_day_start_utc for cadence scope resolution (P2K-31)"
```

---

### Task 1: Add New Error Codes

**Files:**
- Modify: `lib/errors/domain-errors.ts:70-96` (LoyaltyErrorCode union)
- Modify: `lib/errors/domain-errors.ts:98-130` (LOYALTY_ERROR_MESSAGES record)

- [ ] **Step 1: Add error codes to LoyaltyErrorCode union**

In `lib/errors/domain-errors.ts`, add three new codes after the `VALUATION_POLICY_MISSING` line:

```typescript
  // Valuation Policy Errors (PRD-053)
  | 'VALUATION_POLICY_MISSING'
  // Cadence Enforcement Errors (P2K-31)
  | 'REWARD_LIMIT_REACHED'
  | 'REWARD_COOLDOWN_ACTIVE'
  | 'REWARD_SCOPE_UNSUPPORTED';
```

- [ ] **Step 2: Add error messages**

In the `LOYALTY_ERROR_MESSAGES` record, add after the `VALUATION_POLICY_MISSING` entry:

```typescript
  VALUATION_POLICY_MISSING:
    'No active valuation policy found for this casino',
  // Cadence Enforcement Errors (P2K-31)
  REWARD_LIMIT_REACHED:
    'Maximum issuances for this reward in the current scope window exceeded',
  REWARD_COOLDOWN_ACTIVE:
    'Minimum interval between issuances has not elapsed',
  REWARD_SCOPE_UNSUPPORTED:
    'Reward limit scope is not supported in this enforcement slice',
```

- [ ] **Step 3: Add 429 mapping to getDefaultHttpStatus**

In the `getDefaultHttpStatus` method (~line 507), add a case:

```typescript
    // 429 - Rate limited (cadence enforcement)
    if (
      code === 'REWARD_LIMIT_REACHED' ||
      code === 'REWARD_COOLDOWN_ACTIVE'
    ) {
      return 429;
    }
```

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to the new codes (the type union is exhaustive via the LOYALTY_ERROR_MESSAGES record).

- [ ] **Step 5: Commit**

```bash
git add lib/errors/domain-errors.ts
git commit -m "feat(loyalty): add REWARD_LIMIT_REACHED and REWARD_COOLDOWN_ACTIVE error codes (P2K-31)"
```

---

### Task 2: Create Cadence Enforcement Module (TDD)

**Files:**
- Create: `services/loyalty/reward/__tests__/cadence.test.ts`
- Create: `services/loyalty/reward/cadence.ts`

- [ ] **Step 1: Write failing tests for resolveWindowStart()**

Create `services/loyalty/reward/__tests__/cadence.test.ts`:

```typescript
/** @jest-environment node */

/**
 * Cadence enforcement unit tests (P2K-31).
 *
 * Tests scope resolution and enforcement logic.
 * Counting functions are injected as lambdas — no Supabase mocking needed.
 *
 * Note: per_gaming_day resolution requires an async DB call (rpc_gaming_day_start_utc).
 * resolveWindowStart handles per_week/per_month synchronously; per_gaming_day
 * window start is pre-resolved by the caller and passed directly.
 */

import { DomainError } from '@/lib/errors/domain-errors';

import { resolveWindowStart, enforceRewardLimits } from '../cadence';
import type { RewardLimitDTO } from '../dtos';

// === resolveWindowStart ===

describe('resolveWindowStart', () => {
  // Fixed reference time: 2026-04-05T14:30:00.000Z (Saturday)
  const now = new Date('2026-04-05T14:30:00.000Z');

  it('per_week returns 7 days before now', () => {
    const start = resolveWindowStart('per_week', now);
    expect(start.toISOString()).toBe('2026-03-29T14:30:00.000Z');
  });

  it('per_month returns 30 days before now', () => {
    const start = resolveWindowStart('per_month', now);
    expect(start.toISOString()).toBe('2026-03-06T14:30:00.000Z');
  });

  it('per_gaming_day throws — must be pre-resolved via RPC', () => {
    expect(() => resolveWindowStart('per_gaming_day', now)).toThrow(
      'per_gaming_day must be pre-resolved',
    );
  });

  it('per_visit throws REWARD_SCOPE_UNSUPPORTED (fail-closed)', () => {
    expect(() => resolveWindowStart('per_visit', now)).toThrow(DomainError);
    try {
      resolveWindowStart('per_visit', now);
    } catch (e) {
      expect((e as DomainError).code).toBe('REWARD_SCOPE_UNSUPPORTED');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest services/loyalty/reward/__tests__/cadence.test.ts --no-coverage 2>&1 | tail -5`
Expected: FAIL — `Cannot find module '../cadence'`

- [ ] **Step 3: Write resolveWindowStart() implementation**

Create `services/loyalty/reward/cadence.ts`:

```typescript
/**
 * Reward Cadence Enforcement (P2K-31)
 *
 * Resolves scope windows, counts issuances, and enforces reward_limits
 * constraints (max_issues per scope window, cooldown_minutes between issuances).
 *
 * Design:
 * - per_gaming_day scope resolved via rpc_gaming_day_start_utc() (casino-local boundary)
 * - per_visit scope: fail-closed (REWARD_SCOPE_UNSUPPORTED)
 * - Counting functions injected as lambdas (testable without Supabase mocks)
 * - Throws DomainError on violation (REWARD_LIMIT_REACHED, REWARD_COOLDOWN_ACTIVE)
 *
 * @see ADR-033 reward_limits table
 * @see P2K-31 eligibility-cadence-gap.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type { LimitScope, RewardLimitDTO } from './dtos';

// === Gaming Day Resolution ===

/**
 * Fetches the UTC start timestamp of the current gaming day from the database.
 * Uses rpc_gaming_day_start_utc() which resolves via casino_settings.
 * Requires RLS context to be set.
 */
export async function getGamingDayStartUTC(
  supabase: SupabaseClient<Database>,
): Promise<Date> {
  const { data, error } = await supabase.rpc('rpc_gaming_day_start_utc');

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to resolve gaming day start: ${error.message}`,
    );
  }

  if (!data) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'Gaming day start RPC returned null',
    );
  }

  return new Date(data);
}

// === Scope Resolution ===

/**
 * Resolves a limit scope to a window-start timestamp.
 *
 * - per_gaming_day: MUST be pre-resolved via getGamingDayStartUTC() — throws if called here
 * - per_week: 7 days before `now`
 * - per_month: 30 days before `now`
 * - per_visit: fail-closed — throws REWARD_SCOPE_UNSUPPORTED
 */
export function resolveWindowStart(scope: LimitScope, now: Date): Date {
  switch (scope) {
    case 'per_gaming_day':
      throw new Error(
        'per_gaming_day must be pre-resolved via getGamingDayStartUTC() before calling resolveWindowStart',
      );
    case 'per_week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'per_month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'per_visit':
      throw new DomainError(
        'REWARD_SCOPE_UNSUPPORTED',
        'per_visit scope is not supported in this enforcement slice. Contact admin to reconfigure reward limits.',
      );
  }
}
```

- [ ] **Step 4: Run resolveWindowStart tests**

Run: `npx jest services/loyalty/reward/__tests__/cadence.test.ts --no-coverage -t "resolveWindowStart" 2>&1 | tail -5`
Expected: PASS (4 tests)

- [ ] **Step 5: Write failing tests for enforceRewardLimits()**

Append to `cadence.test.ts`:

```typescript
// === enforceRewardLimits ===

describe('enforceRewardLimits', () => {
  const now = new Date('2026-04-05T14:30:00.000Z');

  function makeLimit(overrides: Partial<RewardLimitDTO> = {}): RewardLimitDTO {
    return {
      id: 'limit-1',
      rewardId: 'reward-1',
      casinoId: 'casino-1',
      maxIssues: 1,
      scope: 'per_gaming_day' as const,
      cooldownMinutes: null,
      requiresNote: false,
      ...overrides,
    };
  }

  it('allows issuance when count is below max_issues', async () => {
    const gamingDayStart = new Date('2026-04-05T13:00:00.000Z'); // 06:00 PDT
    const countFn = jest.fn().mockResolvedValue(0);
    const lastTimeFn = jest.fn().mockResolvedValue(null);

    // Should not throw
    await enforceRewardLimits([makeLimit()], countFn, lastTimeFn, now, gamingDayStart);
    expect(countFn).toHaveBeenCalledWith('2026-04-05T13:00:00.000Z');
  });

  it('throws REWARD_LIMIT_REACHED when count equals max_issues', async () => {
    const countFn = jest.fn().mockResolvedValue(1);
    const lastTimeFn = jest.fn().mockResolvedValue(null);

    await expect(
      enforceRewardLimits([makeLimit({ maxIssues: 1 })], countFn, lastTimeFn, now),
    ).rejects.toThrow(DomainError);

    try {
      await enforceRewardLimits([makeLimit({ maxIssues: 1 })], countFn, lastTimeFn, now);
    } catch (e) {
      expect((e as DomainError).code).toBe('REWARD_LIMIT_REACHED');
    }
  });

  it('throws REWARD_LIMIT_REACHED when count exceeds max_issues', async () => {
    const countFn = jest.fn().mockResolvedValue(3);
    const lastTimeFn = jest.fn().mockResolvedValue(null);

    await expect(
      enforceRewardLimits([makeLimit({ maxIssues: 2 })], countFn, lastTimeFn, now),
    ).rejects.toThrow(DomainError);
  });

  it('allows issuance when cooldown has elapsed', async () => {
    const countFn = jest.fn().mockResolvedValue(0);
    // Last issued 60 minutes ago, cooldown is 30 minutes
    const lastTimeFn = jest
      .fn()
      .mockResolvedValue('2026-04-05T13:30:00.000Z');

    await enforceRewardLimits(
      [makeLimit({ cooldownMinutes: 30 })],
      countFn,
      lastTimeFn,
      now,
    );
    // Should not throw
  });

  it('throws REWARD_COOLDOWN_ACTIVE when cooldown has not elapsed', async () => {
    const countFn = jest.fn().mockResolvedValue(0);
    // Last issued 10 minutes ago, cooldown is 30 minutes
    const lastTimeFn = jest
      .fn()
      .mockResolvedValue('2026-04-05T14:20:00.000Z');

    try {
      await enforceRewardLimits(
        [makeLimit({ cooldownMinutes: 30 })],
        countFn,
        lastTimeFn,
        now,
      );
      fail('Expected DomainError');
    } catch (e) {
      expect((e as DomainError).code).toBe('REWARD_COOLDOWN_ACTIVE');
      expect((e as DomainError).details).toHaveProperty('retryAfterSeconds');
      expect((e as DomainError).details).toHaveProperty('retryAfterSeconds', 1200);
    }
  });

  it('skips enforcement when limits array is empty', async () => {
    const countFn = jest.fn();
    const lastTimeFn = jest.fn();

    await enforceRewardLimits([], countFn, lastTimeFn, now);
    expect(countFn).not.toHaveBeenCalled();
    expect(lastTimeFn).not.toHaveBeenCalled();
  });

  it('checks max_issues before cooldown (short-circuits)', async () => {
    const countFn = jest.fn().mockResolvedValue(5);
    const lastTimeFn = jest.fn();

    await expect(
      enforceRewardLimits(
        [makeLimit({ maxIssues: 3, cooldownMinutes: 30 })],
        countFn,
        lastTimeFn,
        now,
      ),
    ).rejects.toThrow(DomainError);

    // lastTimeFn should NOT be called — short-circuited on limit check
    expect(lastTimeFn).not.toHaveBeenCalled();
  });

  it('throws REWARD_SCOPE_UNSUPPORTED for per_visit scope (fail-closed)', async () => {
    const countFn = jest.fn().mockResolvedValue(0);
    const lastTimeFn = jest.fn().mockResolvedValue(null);

    await expect(
      enforceRewardLimits(
        [makeLimit({ scope: 'per_visit' })],
        countFn,
        lastTimeFn,
        now,
      ),
    ).rejects.toThrow(DomainError);

    try {
      await enforceRewardLimits(
        [makeLimit({ scope: 'per_visit' })],
        countFn,
        lastTimeFn,
        now,
      );
    } catch (e) {
      expect((e as DomainError).code).toBe('REWARD_SCOPE_UNSUPPORTED');
    }
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest services/loyalty/reward/__tests__/cadence.test.ts --no-coverage -t "enforceRewardLimits" 2>&1 | tail -5`
Expected: FAIL — `enforceRewardLimits is not a function` (not yet exported)

- [ ] **Step 7: Implement enforceRewardLimits()**

Append to `services/loyalty/reward/cadence.ts`:

```typescript
// === Counting Function Types ===

/**
 * Counts issuances within a time window.
 * @param windowStartIso - ISO 8601 timestamp for window start
 * @returns Number of issuances in the window
 */
export type CountIssuancesFn = (windowStartIso: string) => Promise<number>;

/**
 * Returns the timestamp of the most recent issuance, or null if none.
 */
export type LastIssuedAtFn = () => Promise<string | null>;

// === Enforcement ===

/**
 * Enforces reward_limits constraints for a reward issuance.
 *
 * Checks each limit in order:
 * 1. max_issues — counts issuances in scope window
 * 2. cooldown_minutes — checks elapsed time since last issuance
 *
 * Scope resolution:
 * - per_gaming_day: uses pre-resolved gamingDayStart (from rpc_gaming_day_start_utc)
 * - per_week/per_month: resolved from `now`
 * - per_visit: fail-closed (throws REWARD_SCOPE_UNSUPPORTED)
 *
 * @param limits - RewardLimitDTO[] from reward.limits (loaded by getReward())
 * @param countIssuances - Injected counting function (comp vs entitlement)
 * @param getLastIssuedAt - Injected last-issuance-time function
 * @param now - Optional fixed timestamp for testing
 * @param gamingDayStart - Pre-resolved gaming day start (required if any limit uses per_gaming_day)
 * @throws REWARD_LIMIT_REACHED if max_issues exceeded
 * @throws REWARD_COOLDOWN_ACTIVE if cooldown not elapsed
 * @throws REWARD_SCOPE_UNSUPPORTED if per_visit scope encountered
 */
export async function enforceRewardLimits(
  limits: RewardLimitDTO[],
  countIssuances: CountIssuancesFn,
  getLastIssuedAt: LastIssuedAtFn,
  now?: Date,
  gamingDayStart?: Date,
): Promise<void> {
  if (limits.length === 0) return;

  const effectiveNow = now ?? new Date();

  for (const limit of limits) {
    // 1. Resolve window start for this scope
    let windowStart: Date;

    if (limit.scope === 'per_gaming_day') {
      if (!gamingDayStart) {
        throw new DomainError(
          'INTERNAL_ERROR',
          'gamingDayStart must be pre-resolved for per_gaming_day scope',
        );
      }
      windowStart = gamingDayStart;
    } else {
      // per_week, per_month pass through; per_visit throws REWARD_SCOPE_UNSUPPORTED
      windowStart = resolveWindowStart(limit.scope, effectiveNow);
    }

    // 2. Check max_issues in scope window
    const count = await countIssuances(windowStart.toISOString());

    if (count >= limit.maxIssues) {
      throw new DomainError(
        'REWARD_LIMIT_REACHED',
        `Max ${limit.maxIssues} issuances ${limit.scope.replace(/_/g, ' ')} reached`,
        { httpStatus: 429 },
      );
    }

    // 2. Check cooldown (only if configured)
    if (limit.cooldownMinutes) {
      const lastIssuedAt = await getLastIssuedAt();

      if (lastIssuedAt) {
        const elapsedMs =
          effectiveNow.getTime() - new Date(lastIssuedAt).getTime();
        const elapsedMinutes = elapsedMs / 60_000;

        if (elapsedMinutes < limit.cooldownMinutes) {
          const remainingMinutes = Math.ceil(
            limit.cooldownMinutes - elapsedMinutes,
          );
          throw new DomainError(
            'REWARD_COOLDOWN_ACTIVE',
            `Cooldown: ${remainingMinutes} minutes remaining`,
            {
              httpStatus: 429,
              details: { retryAfterSeconds: remainingMinutes * 60 },
            },
          );
        }
      }
    }
  }
}
```

- [ ] **Step 8: Run all cadence tests**

Run: `npx jest services/loyalty/reward/__tests__/cadence.test.ts --no-coverage 2>&1 | tail -10`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add services/loyalty/reward/cadence.ts services/loyalty/reward/__tests__/cadence.test.ts
git commit -m "feat(loyalty): add cadence enforcement module with scope resolution and limit checks (P2K-31)"
```

---

### Task 3: Add Counting Factory Functions

**Files:**
- Modify: `services/loyalty/reward/cadence.ts`
- Create: tests in `services/loyalty/reward/__tests__/cadence.test.ts`

These factory functions create the `CountIssuancesFn` and `LastIssuedAtFn` lambdas for use in `issueComp()` and `issueEntitlement()`.

- [ ] **Step 1: Write failing tests for counting factories**

Append to `cadence.test.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

import {
  makeCompIssuanceCounter,
  makeCompLastIssuedAt,
  makeEntitlementIssuanceCounter,
  makeEntitlementLastIssuedAt,
} from '../cadence';

// === Counting Factory Functions ===

describe('makeCompIssuanceCounter', () => {
  it('queries loyalty_ledger with correct filters', async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ count: 2, error: null }),
          }),
        }),
      }),
    });
    const mockSupabase = {
      from: jest.fn().mockReturnValue({ select: mockSelect }),
    } as unknown as SupabaseClient<Database>;

    const counter = makeCompIssuanceCounter(mockSupabase, 'player-1', 'reward-1');
    const result = await counter('2026-04-05T00:00:00.000Z');

    expect(result).toBe(2);
    expect(mockSupabase.from).toHaveBeenCalledWith('loyalty_ledger');
  });
});

describe('makeEntitlementIssuanceCounter', () => {
  it('queries promo_coupon with correct filters', async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          neq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ count: 1, error: null }),
          }),
        }),
      }),
    });
    const mockSupabase = {
      from: jest.fn().mockReturnValue({ select: mockSelect }),
    } as unknown as SupabaseClient<Database>;

    const counter = makeEntitlementIssuanceCounter(
      mockSupabase,
      'player-1',
      'program-1',
    );
    const result = await counter('2026-04-05T00:00:00.000Z');

    expect(result).toBe(1);
    expect(mockSupabase.from).toHaveBeenCalledWith('promo_coupon');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest services/loyalty/reward/__tests__/cadence.test.ts --no-coverage -t "makeCompIssuanceCounter|makeEntitlementIssuanceCounter" 2>&1 | tail -5`
Expected: FAIL — functions not found

- [ ] **Step 3: Implement counting factory functions**

Append to `services/loyalty/reward/cadence.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

// === Counting Factory Functions ===

/**
 * Creates a counting function for comp (points_comp) issuances.
 * Counts from loyalty_ledger WHERE source_kind='reward' AND source_id=rewardId.
 */
export function makeCompIssuanceCounter(
  supabase: SupabaseClient<Database>,
  playerId: string,
  rewardId: string,
): CountIssuancesFn {
  return async (windowStartIso: string) => {
    const { count, error } = await supabase
      .from('loyalty_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('source_kind', 'reward')
      .eq('source_id', rewardId)
      .gte('created_at', windowStartIso);

    if (error) {
      throw new DomainError('INTERNAL_ERROR', `Failed to count comp issuances: ${error.message}`);
    }

    return count ?? 0;
  };
}

/**
 * Creates a last-issued-at function for comp issuances.
 * Returns most recent created_at from loyalty_ledger for this reward+player.
 */
export function makeCompLastIssuedAt(
  supabase: SupabaseClient<Database>,
  playerId: string,
  rewardId: string,
): LastIssuedAtFn {
  return async () => {
    const { data, error } = await supabase
      .from('loyalty_ledger')
      .select('created_at')
      .eq('player_id', playerId)
      .eq('source_kind', 'reward')
      .eq('source_id', rewardId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DomainError('INTERNAL_ERROR', `Failed to get last comp issuance: ${error.message}`);
    }

    return data?.created_at ?? null;
  };
}

/**
 * Creates a counting function for entitlement issuances.
 * Counts from promo_coupon WHERE player_id AND promo_program_id AND status != 'voided'.
 */
export function makeEntitlementIssuanceCounter(
  supabase: SupabaseClient<Database>,
  playerId: string,
  promoProgramId: string,
): CountIssuancesFn {
  return async (windowStartIso: string) => {
    const { count, error } = await supabase
      .from('promo_coupon')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('promo_program_id', promoProgramId)
      .neq('status', 'voided')
      .gte('issued_at', windowStartIso);

    if (error) {
      throw new DomainError(
        'INTERNAL_ERROR',
        `Failed to count entitlement issuances: ${error.message}`,
      );
    }

    return count ?? 0;
  };
}

/**
 * Creates a last-issued-at function for entitlement issuances.
 * Returns most recent issued_at from promo_coupon for this player+program.
 */
export function makeEntitlementLastIssuedAt(
  supabase: SupabaseClient<Database>,
  playerId: string,
  promoProgramId: string,
): LastIssuedAtFn {
  return async () => {
    const { data, error } = await supabase
      .from('promo_coupon')
      .select('issued_at')
      .eq('player_id', playerId)
      .eq('promo_program_id', promoProgramId)
      .neq('status', 'voided')
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DomainError(
        'INTERNAL_ERROR',
        `Failed to get last entitlement issuance: ${error.message}`,
      );
    }

    return data?.issued_at ?? null;
  };
}
```

**Note:** The `import type { SupabaseClient }` and `import type { Database }` should be at the top of the file. Move them when implementing.

- [ ] **Step 4: Run all cadence tests**

Run: `npx jest services/loyalty/reward/__tests__/cadence.test.ts --no-coverage 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/loyalty/reward/cadence.ts services/loyalty/reward/__tests__/cadence.test.ts
git commit -m "feat(loyalty): add issuance counting factory functions for cadence checks (P2K-31)"
```

---

### Task 4: Wire Cadence Checks into issueComp()

**Files:**
- Modify: `services/loyalty/crud.ts:789-905`
- Test: `services/loyalty/__tests__/issue-comp.int.test.ts` (existing, add new tests)

- [ ] **Step 1: Write failing test for limit enforcement in issueComp()**

Add to `services/loyalty/__tests__/issue-comp.int.test.ts` (at the end of the describe block):

```typescript
describe('cadence enforcement', () => {
  it('throws REWARD_LIMIT_REACHED when max_issues exceeded for comp', async () => {
    // Mock getReward to return a reward WITH limits
    mockGetReward.mockResolvedValue({
      id: REWARD_ID,
      casinoId: 'casino-uuid',
      code: 'COMP-MEAL-25',
      family: 'points_comp',
      kind: 'food_beverage',
      name: '$25 Comp Meal',
      isActive: true,
      metadata: { face_value_cents: 2500 },
      pricePoints: { pointsCost: 100, allowOverdraw: false },
      entitlementTiers: [],
      limits: [
        {
          id: 'limit-1',
          rewardId: REWARD_ID,
          casinoId: 'casino-uuid',
          maxIssues: 1,
          scope: 'per_gaming_day',
          cooldownMinutes: null,
          requiresNote: false,
        },
      ],
      eligibility: null,
    });

    // Mock enforceRewardLimits to throw REWARD_LIMIT_REACHED
    mockEnforceRewardLimits.mockRejectedValueOnce(
      new DomainError('REWARD_LIMIT_REACHED', 'Max 1 issuances per gaming day reached'),
    );

    await expect(
      issueComp(mockSupabase, makeCompParams(), 'casino-uuid'),
    ).rejects.toThrow(DomainError);

    try {
      await issueComp(mockSupabase, makeCompParams(), 'casino-uuid');
    } catch (e) {
      expect((e as DomainError).code).toBe('REWARD_LIMIT_REACHED');
    }
  });

  it('skips cadence enforcement when reward has no limits', async () => {
    // Mock getReward to return a reward WITHOUT limits
    mockGetReward.mockResolvedValue({
      ...makePointsCompReward(),
      limits: [],
    });

    // enforceRewardLimits should not be called
    mockEnforceRewardLimits.mockClear();

    // Standard mock responses for balance, valuation, and rpc_redeem
    // (re-use existing test fixtures)
    // ...
  });
});
```

**Note:** The exact test setup depends on how the existing test file mocks dependencies. You'll need to add a mock for `enforceRewardLimits` from the cadence module. Read the existing test setup at the top of `issue-comp.int.test.ts` to match the mocking pattern.

- [ ] **Step 2: Add cadence import and pre-flight to issueComp()**

In `services/loyalty/crud.ts`, add the import at the top (after existing imports):

```typescript
import {
  enforceRewardLimits,
  getGamingDayStartUTC,
  makeCompIssuanceCounter,
  makeCompLastIssuedAt,
} from './reward/cadence';
```

Then in the `issueComp()` function, add cadence enforcement after step 4 (family validation) and before step 5 (resolve points cost). Insert between lines ~827 and ~830:

```typescript
    // 4b. Enforce cadence limits (P2K-31)
    // Points comps: limits are optional (balance is the natural limiter).
    // Only enforce if the reward has configured limits.
    if (reward.limits.length > 0) {
      // Pre-resolve gaming day start if any limit uses per_gaming_day scope
      const needsGamingDay = reward.limits.some(
        (l) => l.scope === 'per_gaming_day',
      );
      const gamingDayStart = needsGamingDay
        ? await getGamingDayStartUTC(supabase)
        : undefined;

      await enforceRewardLimits(
        reward.limits,
        makeCompIssuanceCounter(supabase, params.playerId, params.rewardId),
        makeCompLastIssuedAt(supabase, params.playerId, params.rewardId),
        undefined,
        gamingDayStart,
      );
    }
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `npx jest services/loyalty/__tests__/issue-comp --no-coverage 2>&1 | tail -10`
Expected: Existing tests PASS. The `getReward` mock returns rewards with `limits: []` by default (no enforcement triggered). If the mock fixtures don't include `limits`, add `limits: []` to the fixture.

- [ ] **Step 4: Verify the new test passes**

Run: `npx jest services/loyalty/__tests__/issue-comp --no-coverage -t "cadence enforcement" 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/loyalty/crud.ts services/loyalty/__tests__/issue-comp.int.test.ts
git commit -m "feat(loyalty): enforce cadence limits in issueComp() pre-flight (P2K-31)"
```

---

### Task 5: Wire Cadence Checks into issueEntitlement()

**Files:**
- Modify: `services/loyalty/promo/crud.ts:657-788`
- Test: `services/loyalty/__tests__/issue-entitlement.int.test.ts` (existing, add new tests)

- [ ] **Step 1: Write failing test for limit enforcement in issueEntitlement()**

Add to `services/loyalty/__tests__/issue-entitlement.int.test.ts` (at the end):

```typescript
describe('cadence enforcement', () => {
  it('throws REWARD_LIMIT_REACHED when max_issues exceeded for entitlement', async () => {
    mockGetReward.mockResolvedValue(
      makeEntitlementReward({
        limits: [
          {
            id: 'limit-1',
            rewardId: REWARD_ID,
            casinoId: 'casino-uuid',
            maxIssues: 1,
            scope: 'per_gaming_day',
            cooldownMinutes: null,
            requiresNote: false,
          },
        ],
      }),
    );

    // Mock getBalance
    mockGetBalance.mockResolvedValue({
      playerId: PLAYER_ID,
      casinoId: 'casino-uuid',
      currentBalance: 500,
      tier: 'gold',
      preferences: {},
      updatedAt: new Date().toISOString(),
    });

    // Mock promo_program lookup
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'promo_program') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: PROGRAM_ID },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return mockSupabase.from(table);
    });

    // Mock enforceRewardLimits to throw
    mockEnforceRewardLimits.mockRejectedValueOnce(
      new DomainError('REWARD_LIMIT_REACHED', 'Max 1 issuances per gaming day reached'),
    );

    await expect(
      promoCrud.issueEntitlement(mockSupabase, {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toThrow(DomainError);
  });
});
```

**Note:** You'll need to add a mock for the cadence module. At the top of the test file, add:

```typescript
const mockEnforceRewardLimits = jest.fn();
jest.mock('../reward/cadence', () => ({
  enforceRewardLimits: (...args: unknown[]) => mockEnforceRewardLimits(...args),
  makeEntitlementIssuanceCounter: jest.fn().mockReturnValue(jest.fn()),
  makeEntitlementLastIssuedAt: jest.fn().mockReturnValue(jest.fn()),
}));
```

- [ ] **Step 2: Add cadence import and pre-flight to issueEntitlement()**

In `services/loyalty/promo/crud.ts`, add the import at the top:

```typescript
import {
  enforceRewardLimits,
  getGamingDayStartUTC,
  makeEntitlementIssuanceCounter,
  makeEntitlementLastIssuedAt,
} from '../reward/cadence';
```

Then in the `issueEntitlement()` function, add cadence enforcement after step 6 (resolve promo_program_id, line ~740) and before step 7 (generate validation_number). Insert between the `programData` check and the validation number generation:

```typescript
    // 6b. Enforce cadence limits (P2K-31)
    // Entitlements: always enforce — seed data requires per_gaming_day limits.
    if (reward.limits.length > 0) {
      // Pre-resolve gaming day start if any limit uses per_gaming_day scope
      const needsGamingDay = reward.limits.some(
        (l) => l.scope === 'per_gaming_day',
      );
      const gamingDayStart = needsGamingDay
        ? await getGamingDayStartUTC(supabase)
        : undefined;

      await enforceRewardLimits(
        reward.limits,
        makeEntitlementIssuanceCounter(
          supabase,
          params.playerId,
          programData.id,
        ),
        makeEntitlementLastIssuedAt(
          supabase,
          params.playerId,
          programData.id,
        ),
        undefined,
        gamingDayStart,
      );
    }
```

- [ ] **Step 3: Run existing tests**

Run: `npx jest services/loyalty/__tests__/issue-entitlement --no-coverage 2>&1 | tail -10`
Expected: PASS. Existing fixtures should have `limits: []` or need updating to include it.

- [ ] **Step 4: Run new cadence test**

Run: `npx jest services/loyalty/__tests__/issue-entitlement --no-coverage -t "cadence enforcement" 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/loyalty/promo/crud.ts services/loyalty/__tests__/issue-entitlement.int.test.ts
git commit -m "feat(loyalty): enforce cadence limits in issueEntitlement() pre-flight (P2K-31)"
```

---

### Task 6: Map New Error Codes in Route Handler

**Files:**
- Modify: `app/api/v1/loyalty/issue/route.ts:43-66`

- [ ] **Step 1: Add new error code mappings**

In `app/api/v1/loyalty/issue/route.ts`, add to the `mapIssuanceError()` switch statement:

```typescript
    case 'REWARD_LIMIT_REACHED':
      return { code: 'LOYALTY_REWARD_LIMIT_REACHED', status: 429 };
    case 'REWARD_COOLDOWN_ACTIVE':
      return { code: 'LOYALTY_REWARD_COOLDOWN_ACTIVE', status: 429 };
    case 'REWARD_SCOPE_UNSUPPORTED':
      return { code: 'LOYALTY_REWARD_SCOPE_UNSUPPORTED', status: 400 };
```

Add these cases before the `default` case.

- [ ] **Step 2: Run route tests**

Run: `npx jest app/api/v1/loyalty/issue --no-coverage 2>&1 | tail -10`
Expected: PASS (existing tests unaffected)

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/loyalty/issue/route.ts
git commit -m "feat(loyalty): map REWARD_LIMIT_REACHED, REWARD_COOLDOWN_ACTIVE (429), REWARD_SCOPE_UNSUPPORTED (400) in issuance route (P2K-31)"
```

---

### Task 7: Fix Dashboard Mapper — Replace Hardcoded Cooldown (Phase 2)

**Design constraint — what this card represents:**

The `RewardsEligibilityCard` is a **summary indicator for entitlement cadence state**. It does not and cannot represent per-reward eligibility from a single status/reason-code field. Per-reward eligibility data is already available downstream via `listEligibleRewards()` → `EligibleRewardDTO.limits[]`.

- **Entitlements:** Cadence-gated. This card shows the most restrictive active entitlement limit (lowest `max_issues`, shortest `cooldown_minutes`). Issuance history is from `promo_coupon` (entitlement issuances create coupon rows, not ledger entries).
- **Points comps:** Balance-bounded only. The card's `pointsAvailable` field already communicates comp availability. No cadence inputs needed.

This is explicitly a summary card, not a per-reward truth. The caller computes entitlement-specific inputs; the mapper renders status from those inputs.

**Files:**
- Modify: `services/player360-dashboard/dtos.ts:67-87`
- Modify: `services/player360-dashboard/mappers.ts:281-323`
- Modify: `services/player360-dashboard/crud.ts:126-134,279-282`
- Modify: `services/player360-dashboard/__tests__/mappers.test.ts:122-186`

- [ ] **Step 1: Add LIMIT_REACHED to ReasonCode type**

In `services/player360-dashboard/dtos.ts`, find the `ReasonCode` type and add `LIMIT_REACHED`:

```typescript
export type ReasonCode =
  | 'AVAILABLE'
  | 'COOLDOWN_ACTIVE'
  | 'LIMIT_REACHED'
  | 'RULES_NOT_CONFIGURED';
```

- [ ] **Step 2: Update mapToRewardsEligibility() signature and logic**

In `services/player360-dashboard/mappers.ts`, replace the `mapToRewardsEligibility` function:

```typescript
/**
 * Map loyalty data to RewardsEligibilityDTO.
 *
 * P2K-31: Summary indicator for entitlement cadence state.
 * - Entitlements: cadence-gated via `reward_limits` (cooldown + max_issues)
 * - Points comps: balance-bounded only (communicated via `pointsAvailable`)
 *
 * Inputs are entitlement-specific: the caller must resolve the most
 * restrictive entitlement limit and entitlement issuance history
 * (from promo_coupon, NOT loyalty_ledger — entitlements create coupons,
 * not ledger entries).
 *
 * @param loyaltyBalance - Player loyalty balance (nullable)
 * @param lastEntitlementIssuedAt - Timestamp of most recent entitlement coupon (nullable)
 * @param cooldownMinutes - Entitlement cooldown from reward_limits (null = no cooldown)
 * @param entitlementIssuanceCount - Entitlement coupons in current gaming day (default 0)
 * @param maxIssues - Max entitlement issuances per scope from reward_limits (null = no limit)
 * @returns RewardsEligibilityDTO with status and reason codes
 */
export function mapToRewardsEligibility(
  loyaltyBalance: { balance: number; tier: string | null } | null,
  lastEntitlementIssuedAt: string | null,
  cooldownMinutes: number | null = null,
  entitlementIssuanceCount = 0,
  maxIssues: number | null = null,
): RewardsEligibilityDTO {
  // If no loyalty record, rules aren't configured
  if (!loyaltyBalance) {
    return {
      status: 'unknown',
      nextEligibleAt: null,
      reasonCodes: ['RULES_NOT_CONFIGURED'],
      guidance: 'Loyalty rules not configured for this casino',
      pointsAvailable: null,
    };
  }

  const points = loyaltyBalance.balance;

  // Check entitlement max_issues limit (evaluated before cooldown)
  if (maxIssues !== null && entitlementIssuanceCount >= maxIssues) {
    return {
      status: 'not_available',
      nextEligibleAt: null,
      reasonCodes: ['LIMIT_REACHED'],
      guidance: `Daily limit reached (${entitlementIssuanceCount}/${maxIssues})`,
      pointsAvailable: points,
    };
  }

  // Check entitlement cooldown
  if (cooldownMinutes !== null && lastEntitlementIssuedAt) {
    const cooldownExpires = new Date(lastEntitlementIssuedAt);
    cooldownExpires.setMinutes(cooldownExpires.getMinutes() + cooldownMinutes);

    if (cooldownExpires.getTime() > Date.now()) {
      return {
        status: 'not_available',
        nextEligibleAt: cooldownExpires.toISOString(),
        reasonCodes: ['COOLDOWN_ACTIVE'],
        guidance: `Cooldown active until ${cooldownExpires.toLocaleTimeString()}`,
        pointsAvailable: points,
      };
    }
  }

  // Player is eligible
  return {
    status: 'available',
    nextEligibleAt: null,
    reasonCodes: ['AVAILABLE'],
    guidance: null,
    pointsAvailable: points,
  };
}
```

- [ ] **Step 3: Update dashboard crud — entitlement-scoped queries**

In `services/player360-dashboard/crud.ts`, make two changes:

**Change A:** Replace the global `lastRedemption` query (line ~127-134). The old query fetched from `loyalty_ledger` WHERE `reason='redeem'` (any redemption). Entitlement issuances go through `rpc_issue_promo_coupon` → `promo_coupon`, NOT `loyalty_ledger`. Replace with entitlement-specific queries:

```typescript
      // 5. P2K-31: Get most recent entitlement coupon issuance for cooldown display
      supabase
        .from('promo_coupon')
        .select('issued_at')
        .eq('player_id', playerId)
        .neq('status', 'voided')
        .order('issued_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 6. P2K-31: Fetch most restrictive entitlement limit (family-filtered via join)
      supabase
        .from('reward_limits')
        .select('cooldown_minutes, max_issues, scope, reward_id, reward_catalog!inner(family)')
        .eq('reward_catalog.family', 'entitlement')
        .order('max_issues', { ascending: true })
        .limit(1)
        .maybeSingle(),
```

**Change B:** After the `Promise.all`, count today's entitlement issuances from `promo_coupon`:

```typescript
    // Resolve entitlement limits for eligibility display
    const entitlementLimit = entitlementLimitResult?.data;
    const configuredCooldown = entitlementLimit?.cooldown_minutes ?? null;
    const configuredMaxIssues = entitlementLimit?.max_issues ?? null;

    // P2K-31: Count today's entitlement issuances from promo_coupon (gaming day boundary)
    let todayEntitlementCount = 0;
    if (configuredMaxIssues !== null) {
      const { data: gamingDayStartData } = await supabase.rpc(
        'rpc_gaming_day_start_utc',
      );
      // DEGRADED PATH: if RPC fails, windowStart = now → count = 0 → card shows 'available'.
      // This undercounts (permissive), never overblocks. Correct behavior requires
      // rpc_gaming_day_start_utc to succeed. Investigate if this branch is hit in production.
      const windowStart = gamingDayStartData
        ? new Date(gamingDayStartData).toISOString()
        : new Date().toISOString();

      const { count } = await supabase
        .from('promo_coupon')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .neq('status', 'voided')
        .gte('issued_at', windowStart);

      todayEntitlementCount = count ?? 0;
    }

    const rewardsEligibility = mapToRewardsEligibility(
      loyaltyBalance,
      lastEntitlementIssuance?.issued_at ?? null,
      configuredCooldown,
      todayEntitlementCount,
      configuredMaxIssues,
    );
```

**Key changes vs. original plan:**
1. Last issuance from `promo_coupon.issued_at` (entitlement coupons), not `loyalty_ledger.created_at`
2. Issuance count from `promo_coupon` (entitlement coupons), not `loyalty_ledger` with `source_kind='reward'`
3. Limit query filtered by `reward_catalog.family = 'entitlement'` via inner join (not across all families)

- [ ] **Step 4: Update mapper tests**

In `services/player360-dashboard/__tests__/mappers.test.ts`, update the `mapToRewardsEligibility` tests:

```typescript
// P2K-31: mapToRewardsEligibility is a summary indicator for ENTITLEMENT cadence state.
// All time-based inputs (lastEntitlementIssuedAt, issuanceCount) are entitlement-scoped
// (from promo_coupon, not loyalty_ledger). Points comp availability is communicated
// by pointsAvailable alone.

describe('mapToRewardsEligibility', () => {
  const balance = { balance: 500, tier: 'gold' };

  it('returns "available" when no recent entitlement and no limits', () => {
    const result = mapToRewardsEligibility(balance, null);
    expect(result.status).toBe('available');
    expect(result.nextEligibleAt).toBeNull();
    expect(result.reasonCodes).toEqual(['AVAILABLE']);
    expect(result.pointsAvailable).toBe(500);
  });

  it('returns "not_available" with cooldown when entitlement recently issued', () => {
    const result = mapToRewardsEligibility(balance, minutesAgo(10), 30);
    expect(result.status).toBe('not_available');
    expect(result.nextEligibleAt).not.toBeNull();
    expect(result.reasonCodes).toEqual(['COOLDOWN_ACTIVE']);
  });

  it('returns "available" when entitlement cooldown has elapsed', () => {
    const result = mapToRewardsEligibility(balance, minutesAgo(45), 30);
    expect(result.status).toBe('available');
    expect(result.nextEligibleAt).toBeNull();
    expect(result.reasonCodes).toEqual(['AVAILABLE']);
  });

  it('returns "available" when no cooldown configured (points comp behavior)', () => {
    // Even with a recent issuance, null cooldown = no entitlement cadence restriction
    const result = mapToRewardsEligibility(balance, minutesAgo(5), null);
    expect(result.status).toBe('available');
  });

  it('returns "not_available" with LIMIT_REACHED when entitlement max_issues exceeded', () => {
    const result = mapToRewardsEligibility(balance, null, null, 3, 3);
    expect(result.status).toBe('not_available');
    expect(result.reasonCodes).toEqual(['LIMIT_REACHED']);
    expect(result.guidance).toContain('3/3');
  });

  it('checks LIMIT_REACHED before COOLDOWN_ACTIVE (max_issues short-circuits)', () => {
    // Both conditions: limit reached AND cooldown active
    const result = mapToRewardsEligibility(balance, minutesAgo(5), 30, 1, 1);
    expect(result.reasonCodes).toEqual(['LIMIT_REACHED']);
  });

  it('returns "unknown" when no loyalty balance', () => {
    const result = mapToRewardsEligibility(null, null);
    expect(result.status).toBe('unknown');
    expect(result.reasonCodes).toEqual(['RULES_NOT_CONFIGURED']);
    expect(result.guidance).toContain('not configured');
    expect(result.pointsAvailable).toBeNull();
  });

  it('returns "unknown" even if recent entitlement but no loyalty balance', () => {
    const result = mapToRewardsEligibility(null, minutesAgo(5));
    expect(result.status).toBe('unknown');
  });

  it('respects configured cooldown minutes', () => {
    // Reward 20 min ago, 15-min cooldown → should be available
    const result = mapToRewardsEligibility(balance, minutesAgo(20), 15);
    expect(result.status).toBe('available');
  });

  it('respects longer configured cooldown', () => {
    // Reward 20 min ago, 60-min cooldown → should NOT be available
    const result = mapToRewardsEligibility(balance, minutesAgo(20), 60);
    expect(result.status).toBe('not_available');
  });
});
```

- [ ] **Step 5: Run mapper tests**

Run: `npx jest services/player360-dashboard/__tests__/mappers.test.ts --no-coverage -t "mapToRewardsEligibility" 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 6: Run full type-check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add services/player360-dashboard/dtos.ts services/player360-dashboard/mappers.ts services/player360-dashboard/crud.ts services/player360-dashboard/__tests__/mappers.test.ts
git commit -m "feat(dashboard): replace hardcoded 30m with entitlement-scoped cadence from promo_coupon + reward_limits (P2K-31 Phase 2)"
```

---

### Task 8: Verify Full Test Suite

- [ ] **Step 1: Run all affected test files**

```bash
npx jest --no-coverage \
  services/loyalty/reward/__tests__/cadence.test.ts \
  services/loyalty/__tests__/issue-comp \
  services/loyalty/__tests__/issue-entitlement \
  app/api/v1/loyalty/issue \
  services/player360-dashboard/__tests__/mappers.test.ts \
  2>&1 | tail -20
```

Expected: All tests PASS

- [ ] **Step 2: Run type-check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors

- [ ] **Step 3: Run lint**

```bash
npx eslint services/loyalty/reward/cadence.ts services/loyalty/crud.ts services/loyalty/promo/crud.ts app/api/v1/loyalty/issue/route.ts services/player360-dashboard/mappers.ts services/player360-dashboard/crud.ts --quiet 2>&1 | tail -10
```

Expected: No errors

---

## Self-Review

**Spec coverage:**
- ✅ Phase 1: Service-layer pre-flight checks in `issueComp()` / `issueEntitlement()`
- ✅ Phase 2: Dashboard mapper fix — replace hardcoded 30m with reward-scoped limit data
- ✅ New error codes: `REWARD_LIMIT_REACHED` (429), `REWARD_COOLDOWN_ACTIVE` (429), `REWARD_SCOPE_UNSUPPORTED` (400)
- ✅ Points comps: no temporal restriction unless admin configures limits (balance-bounded)
- ✅ Entitlements: cadence-limited per `reward_limits` config
- ✅ `per_gaming_day`: uses casino-local gaming day boundary via `rpc_gaming_day_start_utc()`
- ✅ `per_visit`: fail-closed with `REWARD_SCOPE_UNSUPPORTED`
- ✅ Dashboard uses entitlement-scoped history (`promo_coupon`), family-filtered limits (`reward_catalog.family='entitlement'`), explicitly framed as summary indicator
- ✅ Product rules explicitly locked
- ✅ Pilot limitation explicitly documented
- ✅ Acceptance criteria defined
- ⏳ Phase 3: RPC hard enforcement — deferred (P2K-31-phase3)

**Placeholder scan:** No TBD/TODO/placeholders found.

**Type consistency:**
- `RewardLimitDTO` used consistently across cadence.ts, crud.ts, and test files
- `LimitScope` from dtos.ts used in resolveWindowStart
- `CountIssuancesFn` / `LastIssuedAtFn` types defined once in cadence.ts, used in both issuance paths
- `DomainError` codes match `LoyaltyErrorCode` union additions
- `gamingDayStart` parameter threaded consistently through enforceRewardLimits → issuance callers

**Audit delta findings addressed:**
1. ✅ Finding 1: `per_gaming_day` uses `rpc_gaming_day_start_utc()` (casino-local boundary, not UTC midnight)
2. ✅ Finding 2: `per_visit` consistently fails closed with `REWARD_SCOPE_UNSUPPORTED`
3. ✅ Finding 3: Dashboard uses `promo_coupon` for entitlement-scoped history, `reward_limits` filtered by `family='entitlement'`, explicitly framed as summary indicator
4. ✅ Finding 4: Pilot limitation section added
5. ✅ Finding 5: Product rules locked section added
6. ✅ Finding 6: Acceptance criteria section added

**Second-pass corrections:**
- Dashboard queries fixed: `promo_coupon` (not `loyalty_ledger`) for entitlement issuances
- Limit query uses `reward_catalog!inner(family)` join to filter by entitlement family
- `retryAfterSeconds` scoped to `REWARD_COOLDOWN_ACTIVE` only (not `REWARD_LIMIT_REACHED`)
- Migration failure modes documented as operational preconditions
- Architecture headline updated to mention all 3 error codes
- Dashboard explicitly framed as summary indicator, not per-reward truth

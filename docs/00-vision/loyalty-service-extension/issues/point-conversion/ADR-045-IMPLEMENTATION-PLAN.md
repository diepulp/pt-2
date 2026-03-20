# ADR-045: Kill CENTS_PER_POINT Hardcode — Two-Knob Implementation

## Context

EXEC-053 (P2K-30) shipped variable-amount comp issuance with `CENTS_PER_POINT = 10` hardcoded in two places. This bypasses `loyalty_valuation_policy.cents_per_point`, which already exists per-casino in the DB and is actively used by the liability measurement system.

ADR-045 (already written, uncommitted) freezes the doctrine: **two persisted knobs** (`game_settings.points_conversion_rate` for earn, `loyalty_valuation_policy.cents_per_point` for redemption) + one displayed derived metric (implied reinvestment rate). The hardcode must be replaced with the DB-sourced rate.

### What's already done (uncommitted)

- `docs/80-adrs/ADR-045-point-conversion-two-knob-model.md` — written
- `docs/00-vision/loyalty-service-extension/issues/hardcoded-conversion-rate-gap.md` — written
- `services/loyalty/crud.ts` — partially edited:
  - `getActiveValuationCentsPerPoint()` function added
  - Pre-flight `Promise.all` updated to include valuation query
  - Hardcoded `CENTS_PER_POINT = 10` replaced with `centsPerPoint` from DB
  - BUT: the edit is incomplete (needs lint verification)

### What remains

The frontend still has `CENTS_PER_POINT = 10` hardcoded in `comp-confirm-panel.tsx:29`. No existing data path carries `centsPerPoint` to the client.

---

## Plan

### Step 1: Finalize backend `crud.ts` (partially done)

**File**: `services/loyalty/crud.ts`
- Verify the partial edits are correct and type-check passes
- The `getActiveValuationCentsPerPoint()` function, pre-flight wiring, and hardcode replacement are already applied

### Step 2: Add `centsPerPoint` to `IssueCompParams` result chain

The service already has `centsPerPoint` in scope inside `issueComp()`. The frontend needs it **before** issuing (for the live conversion display). Two options:

**Option A — Add to CompIssuanceResult + pass via drawer prop from a new hook query:**
A new `useCentsPerPoint(casinoId)` hook queries the valuation policy. The drawer passes it to the panel.

**Option B — Add `centsPerPoint` to existing `usePlayerLoyalty` response (piggyback):**
The loyalty balance query already runs per-player. Extend it to also return the casino's `centsPerPoint`. One query, no new hook.

**Recommended: Option A** — a small dedicated hook (`useValuationRate`) is cleaner than mixing player data with casino policy. It's one SELECT with an eq filter, cached long (policy rarely changes). The hook goes in `hooks/loyalty/use-loyalty-queries.ts` alongside the existing loyalty hooks.

BUT: `casinoId` is not available as a prop in the drawer chain today. The drawer receives `playerId`, `playerName`, etc. but not `casinoId`. Need to check how to source it.

**Fallback: Pass `centsPerPoint` alongside `currentBalance` from the same parent that already knows the casino context.** The `IssueRewardButton` / `IssueRewardDrawer` call sites already have access to casino context (via RLS context in the modal data or Player 360 page data). Add `centsPerPoint` as a prop threaded from the call site, sourced from a hook at the page level.

**Simplest correct path**: Add a `centsPerPoint` prop to `IssueRewardDrawerProps` → `CompConfirmPanelProps`. The call sites (`rating-slip-modal.tsx`, `player-360-header-content.tsx`, `issue-reward-button.tsx`) pass it through. The value is fetched once per page via a hook or included in the BFF response. Default to 10 if not provided (backward compat).

### Step 3: Frontend changes

**Files to modify:**

1. **`components/loyalty/comp-confirm-panel.tsx`**
   - Remove `const CENTS_PER_POINT = 10;`
   - Add `centsPerPoint: number` to `CompConfirmPanelProps`
   - Replace all `CENTS_PER_POINT` references with the prop
   - Update conversion display to show the actual rate (`$0.10/pt` becomes dynamic)

2. **`components/loyalty/issue-reward-drawer.tsx`**
   - Add `centsPerPoint?: number` to `IssueRewardDrawerProps` (optional, defaults to 10)
   - Pass through to `CompConfirmPanel`
   - Update `defaultPointsCost` derivation to use the prop rate

3. **`components/player-360/header/issue-reward-button.tsx`**
   - Add `centsPerPoint?: number` prop, thread to drawer

4. **Call sites** — thread `centsPerPoint` from wherever the casino context is available:
   - `components/player-360/header/player-360-header-content.tsx`
   - `components/modals/rating-slip/rating-slip-modal.tsx`

5. **`hooks/loyalty/use-loyalty-queries.ts`** (new query)
   - Add `useValuationRate(casinoId)` that calls a lightweight endpoint or direct Supabase query
   - Or: add to existing `usePlayerLoyalty` response

### Step 4: Update tests

1. **`services/loyalty/__tests__/issue-comp-variable-amount.test.ts`**
   - Mock the `loyalty_valuation_policy` query in `setupMocks()`
   - Add test case: custom `centsPerPoint` (e.g., 5) → `pointsCost = ceil(3500/5) = 700`
   - Add test case: no active policy → falls back to default 10

2. **Existing `issue-comp.int.test.ts`**
   - Add the valuation policy mock to the existing setup (returns 10 to match current behavior)

### Step 5: Verify

- `npm run type-check` exits 0
- `npm run lint` exits 0 (after auto-fix)
- All loyalty tests pass (new + regression)
- `npm run build` exits 0

---

## Files Summary

| # | File | Change |
|---|------|--------|
| 1 | `services/loyalty/crud.ts` | ✅ Already done — verify only |
| 2 | `components/loyalty/comp-confirm-panel.tsx` | Remove hardcode, add `centsPerPoint` prop |
| 3 | `components/loyalty/issue-reward-drawer.tsx` | Add `centsPerPoint` prop, thread through |
| 4 | `components/player-360/header/issue-reward-button.tsx` | Thread `centsPerPoint` prop |
| 5 | `components/player-360/header/player-360-header-content.tsx` | Pass `centsPerPoint` (needs source) |
| 6 | `components/modals/rating-slip/rating-slip-modal.tsx` | Pass `centsPerPoint` (needs source) |
| 7 | `hooks/loyalty/use-loyalty-queries.ts` | Add `useValuationRate()` hook |
| 8 | `services/loyalty/__tests__/issue-comp-variable-amount.test.ts` | Mock valuation query, add test cases |
| 9 | `services/loyalty/__tests__/issue-comp.int.test.ts` | Add valuation policy mock |
| 10 | `docs/80-adrs/ADR-045-point-conversion-two-knob-model.md` | ✅ Already written — commit |
| 11 | `docs/00-vision/loyalty-service-extension/issues/hardcoded-conversion-rate-gap.md` | ✅ Already written — commit |

## Decision: Prop threading (Option B)

Add `centsPerPoint?: number` prop to the drawer chain (defaults to 10). Parents source the value from a `useValuationRate(casinoId)` hook at the page level. No query inside the drawer, no BFF coupling. Simplest path — the parent already has casino context.

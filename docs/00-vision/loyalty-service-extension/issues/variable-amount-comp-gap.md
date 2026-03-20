---
title: "Variable-Amount Comp Issuance Gap"
severity: P1
status: open
date: 2026-03-19
affects: Comp issuance workflow — pit boss cannot enter dollar amount
references:
  - EXEC-052 WS2/WS4 (issueComp + CompConfirmPanel)
  - LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md (D1: game_settings is canonical)
  - services/loyalty/crud.ts:647-759 (issueComp)
  - components/loyalty/comp-confirm-panel.tsx
  - supabase/migrations/20260307114447 (rpc_redeem — already supports arbitrary p_points)
---

# Variable-Amount Comp Issuance Gap

## Symptom

Pit boss cannot enter a dollar amount for a comp. The system only supports pre-defined fixed-price catalog comps (e.g., "Steak Dinner = 500 points"). The desired workflow — "give this player a $35 meal comp" with the amount entered at issuance time — is not possible.

## Current Behavior

```
Admin creates reward:  "Meal Comp" → family: points_comp
Admin sets price:      reward_price_points.points_cost = 500 (fixed)

Pit boss flow:
  1. Opens IssueRewardDrawer
  2. Selects "Meal Comp" from catalog
  3. CompConfirmPanel shows: "500 points will be debited" (read-only)
  4. Confirms → 500 points debited

  No dollar input. No amount override. No overdraw toggle.
```

## Desired Behavior

```
Pit boss flow:
  1. Opens IssueRewardDrawer
  2. Selects comp type "Meal" from catalog
  3. Enters dollar amount: $35.00
  4. System displays: "= 350 points (at $0.10/pt)" with balance preview
  5. If 350 > balance: overdraw toggle appears (pit_boss/admin authorized)
  6. Confirms → 350 points debited, comp recorded with $35 face value
```

## Conversion Rate Architecture

Per `LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md` (decisions frozen for pilot):

- **D1**: `game_settings.points_conversion_rate` is canonical earn-rate source (default 10.0 = 10 pts/$1 theo)
- **D2**: `loyalty_earn_config` is fully deferred (inert for pilot)
- Inverse: 1 point = $0.10 = 10 cents/point

For pilot, the redemption rate can be hardcoded as `CENTS_PER_POINT = 10` (matching all seed data, both `game_settings` default and `loyalty_valuation_policy` values). Post-pilot, source from `casino_settings` or `loyalty_valuation_policy`.

## Gap Analysis (Layer by Layer)

| Layer | Current | Required Change |
|---|---|---|
| `IssueCompParams` DTO | `{ playerId, rewardId, idempotencyKey, note? }` | Add `faceValueCents?: number`, `allowOverdraw?: boolean` |
| `issueRewardSchema` Zod | No amount field | Add `face_value_cents?: z.number().int().positive()` |
| `issueComp()` service | Reads fixed `pointsCost` from `reward.pricePoints` | If `faceValueCents` provided: `pointsCost = faceValueCents / CENTS_PER_POINT`. Pass `allowOverdraw` to RPC. |
| `CompConfirmPanel` UI | Displays fixed points cost (read-only) | Add dollar input, auto-convert display, overdraw toggle |
| `IssueRewardInput` hook | `{ playerId, rewardId, visitId? }` | Add `faceValueCents?: number`, `allowOverdraw?: boolean` |
| `POST /loyalty/issue` route | Amount derived from catalog | Thread `face_value_cents`, `allow_overdraw` from body to service |
| `rpc_redeem` RPC | `p_points integer`, `p_allow_overdraw boolean` | **No change needed** — already supports arbitrary values and overdraw |

## Overdraw Edge Case

`rpc_redeem` (migration `20260307114447`, line 143) already enforces overdraw authorization:

```sql
IF v_caller_role NOT IN ('pit_boss', 'admin') THEN
  RAISE EXCEPTION 'FORBIDDEN: Only pit_boss/admin can overdraw';
END IF;
```

The gap is that `issueComp()` hardcodes `p_allow_overdraw: false` (line 716 of `crud.ts`). The RPC is ready; the service layer isn't threading the flag through.

## Catalog Semantics Shift

With variable amounts, the reward catalog entry shifts from **"this comp costs 500 points"** to **"this is a meal comp type"**:

- `reward_price_points.points_cost` becomes the **suggested default** (pre-filled in the dollar input as `points_cost × CENTS_PER_POINT / 100`)
- `reward_price_points.allow_overdraw` becomes the **catalog-level overdraw policy** (can be overridden per issuance by authorized roles)
- The `code`/`kind` fields classify the comp type for reporting ("how much did we give away in meal comps this month?")

## Implementation Scope

**Constants**:
```typescript
// lib/loyalty/constants.ts (or inline in issueComp)
const CENTS_PER_POINT = 10; // Pilot default. Post-pilot: read from casino config.
```

**Service** (`issueComp`):
```typescript
const pointsCost = params.faceValueCents
  ? Math.ceil(params.faceValueCents / CENTS_PER_POINT)  // $35 → 350 pts
  : reward.pricePoints?.pointsCost;                      // fallback to catalog

// Thread overdraw
const allowOverdraw = params.allowOverdraw ?? false;
```

**UI** (`CompConfirmPanel`):
- Dollar input field (pre-filled from catalog default if available)
- Auto-calculated points display: `${amount} = ${points} points`
- Balance comparison: current balance vs. points to debit
- Overdraw toggle (only visible when debit > balance)

**Backward compatible**: existing fixed-price comps continue to work when `faceValueCents` is omitted.

You're right to be frustrated. The D1 decision solved the *earn* side. EXEC-053 then introduced a second hardcode on the *redemption* side without connecting it back. That's the gap. Let me lay out the math, because once you see it, the "three rates" collapse to one decision.

## The single economic decision

A casino operator makes one loyalty generosity call:

> "For every dollar of theoretical win this player generates, how many cents am I willing to give back as redeemable loyalty value?"

That's the **reinvestment rate**. Everything else is derived from it.

## The math

```
Earn:       theo_win × points_conversion_rate = points_earned
Redeem:     points_spent × cents_per_point / 100 = dollar_value_returned
Combined:   dollar_value_returned = theo_win × (points_conversion_rate × cents_per_point / 100)
                                  = theo_win × reinvestment_rate
```

With current values (`points_conversion_rate = 10`, `cents_per_point = 10`):
```
reinvestment_rate = 10 × 10 / 100 = 1.0 = 100%
```

That means for every $1 of theo win, the casino gives back $1 in redeemable comp value. That's extremely generous — industry norm is 20-40%. The seed data is placeholder-friendly (round numbers) not economically calibrated.

## Why casinos use two rates instead of one

The two rates are independent dials because operators sometimes want to change the *psychological feel* without changing the economics:

| Strategy | Earn Rate | Redemption Value | Reinvestment | Feel |
|----------|-----------|-----------------|--------------|------|
| High-volume program | 100 pts/$1 | $0.003/pt | 30% | "Earn thousands of points!" |
| Premium program | 1 pt/$1 | $0.30/pt | 30% | "Each point is worth real money" |
| Current pilot | 10 pts/$1 | $0.10/pt | 100% | Placeholder, not calibrated |

Same 30% reinvestment, different player perception. That's why the industry separates earn rate from redemption value — it's a marketing lever, not a mathematical necessity.

## What D1 actually solved (and what it didn't)

D1 froze the **earn path**: `game_settings.points_conversion_rate` → policy snapshot → `rpc_accrue_on_close`. That pipeline is correct, per-game-type, snapshot-deterministic.

What D1 did **not** address is the **redemption path** — what happens when those points are spent. That path didn't exist yet when D1 was written. EXEC-053 built it and hardcoded the other half of the equation (`CENTS_PER_POINT = 10`) as a shortcut.

The result is that earn and redemption are currently disconnected:

```
EARN:    game_settings.points_conversion_rate (per casino, per game type, in DB)
         ↓
         points_earned
         ↓
REDEEM:  CENTS_PER_POINT = 10 (hardcoded in TypeScript, global)
         ↓
         dollar_value
```

If an operator changes `game_settings.points_conversion_rate` to 20 (more generous earning), the redemption rate stays at 10¢/point, and the reinvestment rate silently doubles. The two sides don't know about each other.

## What `loyalty_valuation_policy.cents_per_point` was supposed to be

This column already exists, is per-casino, has lifecycle semantics (`is_active`, `effective_date`), and is actively used by the liability measurement RPC. It's the correct redemption/valuation rate source. The hardcode in EXEC-053 should have read from it.

## The actual architecture question

The operator needs to set **one or two numbers**, and the system derives the rest:

**Option 1 — Two independent dials (industry standard):**
```
Operator sets:  points_conversion_rate (earn)     → game_settings (existing)
                cents_per_point (redeem/value)     → loyalty_valuation_policy (existing)
System derives: reinvestment_rate = rate × cpp / 100 (display-only, for operator awareness)
```

**Option 2 — One dial + derivation:**
```
Operator sets:  reinvestment_rate (e.g., 30%)
System derives: points_conversion_rate = 10 (fixed program denomination)
                cents_per_point = reinvestment_rate / pcr × 100 = 3.0
```

Option 1 is what the DB already supports. The tables exist, the columns exist, the per-casino scoping exists. What's missing is:

1. `issueComp()` reading `loyalty_valuation_policy.cents_per_point` instead of the hardcode
2. `CompConfirmPanel` receiving the rate as a prop instead of a constant
3. An admin surface where operators set both rates and see the implied reinvestment percentage

The `loyalty_earn_config` table is correctly deprecated — it was a duplicate of what `game_settings` already does. The conversion rate architecture is `game_settings` (earn) + `loyalty_valuation_policy` (redeem/value). Those two tables together give the operator full control over the reinvestment equation. The hardcode in EXEC-053 just bypassed the second one.
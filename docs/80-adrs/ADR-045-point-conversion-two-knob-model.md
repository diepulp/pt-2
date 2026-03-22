# ADR-045: Point Conversion — Two-Knob Canonical Persistence Model

**Status:** Accepted
**Date:** 2026-03-20
**Supersedes:** Hardcoded `CENTS_PER_POINT = 10` in EXEC-053
**Amends:** LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md (D1 frozen, this extends to redemption)

## Context

The loyalty system converts between three units: theo dollars, points, and fiat dollars. The conversion happens at two stages:

```
EARN:    theo_dollars × points_conversion_rate = points
REDEEM:  points × cents_per_point / 100 = fiat_dollars
```

The combined reinvestment rate — the fraction of theoretical win returned as loyalty value — is:

```
reinvestment_rate = points_conversion_rate × cents_per_point / 100
```

The operator chooses one redemption denomination per casino (`cents_per_point`) and one earn rate per casino per game type (`points_conversion_rate`). Together these imply the effective reinvestment profile — which may vary by game. The two conversion rates are independent dials that let operators tune the *feel* of their program (high earn / low value vs. low earn / high value) while targeting the desired reinvestment at each game type.

> Seed values are bootstrap data only and are not normative.
> A seed-era placeholder such as `points_conversion_rate = 10` and `cents_per_point = 10` implies `100%` reinvestment and must not be treated as a valid operating default. Runtime code may not infer valuation policy from placeholder seeds or hardcoded constants.

EXEC-053 (P2K-30) introduced variable-amount comp issuance with `CENTS_PER_POINT = 10` hardcoded in two files. This bypassed `loyalty_valuation_policy.cents_per_point`, which already exists as a per-casino column used by the liability measurement system. The hardcode:

- Prevents multi-casino deployment (different casinos cannot set different rates)
- Creates silent divergence between comp valuation and liability valuation
- Cannot be adjusted without code deployment

## Decision

### D1: Two persisted knobs, one displayed derived metric

| Knob | Table | Column | Scope | Governs |
|------|-------|--------|-------|---------|
| **Earn rate** | `game_settings` | `points_conversion_rate` | Per casino, per game type | How many points per $1 theo |
| **Redemption value** | `loyalty_valuation_policy` | `cents_per_point` | Per casino | What each point is worth in cents |
| **Implied reinvestment** | *Computed, not persisted* | `earn_rate × cpp / 100` | Display-only | Operator awareness metric |

These two tables are the canonical sources. No other table, constant, or configuration may independently define a conversion rate.

### D2: `loyalty_earn_config` remains deprecated

Per LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md D2, `loyalty_earn_config` is inert. This ADR does not change that. If operator feedback demonstrates need for casino-wide earn policy separate from game settings, it can be revived via ADR amendment. Otherwise, remove as dead code post-pilot.

### D3: `reward_price_points.points_cost` is not a conversion rate

`reward_price_points.points_cost` is a **catalog pricing attribute**, not a conversion policy. It defines "how many points does this specific reward cost" — a merchandising decision, not a valuation decision. It must be understood as either:

- **A default derived from `cents_per_point`**: The admin sets a dollar price; the system computes `points_cost = ceil(dollar_price_cents / cents_per_point)` at catalog creation time.
- **An explicit promotional override**: The admin sets a custom point price that intentionally deviates from the standard conversion (e.g., a "loyalty special" priced below the standard rate).

In either case, `points_cost` is frozen at catalog creation/update time. It does **not** float with `cents_per_point` changes — that would silently reprice the entire catalog when an operator adjusts their valuation policy.

**Provenance requirement:** Promotional override pricing must be explicitly distinguishable from standard derived pricing in catalog metadata or schema, so that admin and audit surfaces can differentiate "priced at standard rate when created" from "intentionally discounted/premium." If a schema change is out of scope for the current implementation, the provenance requirement must be addressed in the follow-on catalog admin spec.

### D4: Variable-amount comp conversion reads `cents_per_point` from DB and fails closed if missing

When a pit boss enters a dollar amount for a comp:

```
points_to_debit = ceil(face_value_cents / cents_per_point)
```

`cents_per_point` is read from `loyalty_valuation_policy` for the current casino. The hardcoded `CENTS_PER_POINT = 10` constant is removed from both backend and frontend.

If no active `loyalty_valuation_policy` row exists for the casino, variable-amount comp issuance fails closed with a configuration error. Missing valuation policy is an onboarding / setup defect, not a condition to be masked by runtime fallback logic.

Bootstrap and onboarding must create an active valuation policy row before variable-amount comp issuance is enabled.

### D5: Frontend receives the rate via a dedicated client-side query hook

The `CompConfirmPanel` component receives `centsPerPoint` as a prop. It does not query the database, does not hardcode a constant, and does not derive the rate from any other source.

**Delivery surface:** A `useValuationRate(casinoId)` hook in `hooks/loyalty/use-loyalty-queries.ts` issues a direct Supabase client query against `loyalty_valuation_policy` (single row, eq filter on `casino_id` + `is_active`). The query is cached long (`staleTime: 300_000` — 5 minutes) since valuation policy changes infrequently. The hook returns `{ centsPerPoint: number }`.

**Threading:** The page-level component that owns the casino context (Player 360 page, RatingSlipModal) calls the hook and passes the result as a prop through the chain:

```
useValuationRate(casinoId) → IssueRewardButton prop → IssueRewardDrawer prop → CompConfirmPanel prop
```

The `IssueRewardDrawer` does not query the database and does not define a fallback default. `centsPerPoint` is required for variable-amount comp confirmation. If valuation policy cannot be loaded, the caller must surface a configuration error state and block confirmation.

### D6: Bootstrap default is data, not code

New casinos must receive an active `loyalty_valuation_policy` row during bootstrap / onboarding. The system default is expressed as seeded data, not as a runtime constant.

Initial bootstrap target: **20% implied reinvestment**.

Given the current pilot earn seed of `points_conversion_rate = 10`, the bootstrap valuation seed is:

- `cents_per_point = 2`

This is a starting operator posture, not a normative permanent recommendation. Operators may tighten or loosen the program by changing either canonical knob through approved admin/configuration surfaces.

## Consequences

### Positive

- Operators can set their loyalty generosity per-casino without code deployment
- Comp valuation and liability valuation use the same rate — no silent divergence
- The reinvestment rate is always computable and displayable for operator awareness
- Multi-casino deployment is unblocked

### Negative

- Variable-amount comps now require a DB lookup for `cents_per_point` (one additional query, parallelizable with existing pre-flight)
- If an operator changes `cents_per_point`, in-flight comp confirmations may show stale conversion until the drawer is reopened (acceptable — drawer uses key-based reset on open)
- `reward_price_points.points_cost` does not auto-update when `cents_per_point` changes — this is by design (catalog prices are frozen at creation), but operators must understand this

### Risk

- A casino with no active `loyalty_valuation_policy` row cannot issue variable-amount comps until setup is corrected. This is intentional: the system fails closed rather than inventing value.
- If bootstrap/onboarding forgets to create the policy row, the defect is immediately visible instead of silently distorting redemption economics.

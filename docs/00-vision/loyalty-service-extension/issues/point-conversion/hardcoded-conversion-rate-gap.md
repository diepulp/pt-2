---
title: "Hardcoded CENTS_PER_POINT Conversion Rate"
severity: P1
status: open
date: 2026-03-19
affects: Variable-amount comp issuance — dollar-to-points conversion uses a hardcoded constant instead of casino-configurable rate
introduced_by: EXEC-053 (P2K-30)
references:
  - LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md (D1, D2)
  - POINTS_CONVERSIO_COMP_VALUATION_POSTURE.md (GAP-B)
  - supabase/migrations/20260307114452_adr039_loyalty_measurement_schema.sql (loyalty_valuation_policy)
  - services/loyalty/crud.ts:687-691 (CENTS_PER_POINT = 10)
  - components/loyalty/comp-confirm-panel.tsx:29 (CENTS_PER_POINT = 10)
---

# Hardcoded CENTS_PER_POINT Conversion Rate

## Problem

The variable-amount comp issuance feature (P2K-30 / EXEC-053) introduced `CENTS_PER_POINT = 10` as a hardcoded constant in two places:

1. **Backend** — `services/loyalty/crud.ts:689` — used to compute `pointsCost = Math.ceil(faceValueCents / 10)`
2. **Frontend** — `components/loyalty/comp-confirm-panel.tsx:29` — used to pre-fill the dollar input and display the live conversion

The constant assumes 1 point = $0.10 (10 cents per point). This rate cannot be changed by an operator without a code deployment.

## Why this is a problem

The conversion rate between points and dollars is a **business policy decision**, not an engineering constant. Different casinos — or the same casino at different times — will set different rates based on their loyalty program economics. A rigid hardcode:

1. **Prevents multi-casino deployment.** Casino A may value points at $0.10, Casino B at $0.05. Both cannot be served.
2. **Creates a silent divergence.** `loyalty_valuation_policy.cents_per_point` already exists in the database as a per-casino column used by the liability measurement system. If an operator changes that column to 15, the liability system values points at $0.15, but comp issuance still converts at $0.10. A $35 comp deducts 350 points that the liability system values at $52.50.
3. **Cannot be adjusted without redeployment.** Seasonal promotions, competitive adjustments, or corrections require a code change.

## Current state of conversion rate infrastructure

The system already has the plumbing — it's just not connected to the comp issuance path.

| Layer | Table | Column | Status | Used by |
|-------|-------|--------|--------|---------|
| Earn (theo→points) | `game_settings` | `points_conversion_rate` | **Active** | `rpc_start_rating_slip` → policy snapshot → `rpc_accrue_on_close` |
| Earn (admin) | `loyalty_earn_config` | `points_per_theo` | **Dormant** | Nothing — table + full service stack exist but no RPC reads it |
| Valuation (points→$) | `loyalty_valuation_policy` | `cents_per_point` | **Active** | `rpc_snapshot_loyalty_liability` (daily measurement) |
| Redemption pricing | `reward_price_points` | `points_cost` | **Active** | `issueComp()` catalog path |
| Comp conversion | Hardcoded constant | `CENTS_PER_POINT = 10` | **Active** | `issueComp()` variable-amount path + `CompConfirmPanel` UI |

The natural source for the comp conversion rate is `loyalty_valuation_policy.cents_per_point` — it is already per-casino, has `is_active` lifecycle semantics, and represents the canonical "what is a point worth in dollars" answer. Using it would align comp issuance with liability measurement.

## What needs to happen

### Backend (`issueComp`)

Replace the hardcoded constant with a lookup:

```
// Current (hardcoded):
const CENTS_PER_POINT = 10;

// Target (casino-configurable):
const valuationPolicy = await getActiveValuationPolicy(supabase, casinoId);
const centsPerPoint = valuationPolicy?.centsPerPoint ?? 10; // fallback for unconfigured casinos
```

`casinoId` is already available in `issueComp()` as a parameter. The lookup adds one query but can be parallelized with the existing `getReward()` + `getBalance()` `Promise.all`.

### Frontend (`CompConfirmPanel`)

The panel cannot query the database directly — it's a client component. The conversion rate must be passed as a prop from the drawer, which gets it from:

- The reward detail fetch (if rate is attached to the reward response), or
- A dedicated lightweight endpoint/RPC, or
- The BFF dashboard data already fetched for Player 360

### Prerequisite: Valuation policy service

`loyalty_valuation_policy` currently has no service layer — only the measurement RPC reads it directly. Before the comp path can use it, a minimal service is needed:

- `getActiveValuationPolicy(supabase, casinoId)` → returns `{ centsPerPoint: number }` or null
- No CRUD needed for this gap — just a read function
- The full CRUD service (GAP-B in POINTS_CONVERSIO_COMP_VALUATION_POSTURE.md) is a separate concern for admin UI

## Scope assessment

| Option | Effort | Description |
|--------|--------|-------------|
| **A — Minimal** | S | Add `getActiveValuationPolicy()` read function, inject into `issueComp()`, pass rate as prop to `CompConfirmPanel`. Fallback to 10 if no policy configured. |
| **B — With admin surface** | M | Option A + CRUD service + API route + admin UI for `loyalty_valuation_policy`. Resolves GAP-B from the posture doc. |
| **C — Unified rate architecture** | L | Option B + resolve GAP-A (which table governs earn rate) + wire `loyalty_earn_config` or remove it. Full conversion rate architecture. |

**Recommendation:** Option A for immediate follow-up. The hardcode fallback (`?? 10`) ensures zero breakage for unconfigured casinos while making the rate configurable for any casino that has an active `loyalty_valuation_policy` row (all pilot casinos do — seeded at 10).

## Locations to change

| # | File | Current | Target |
|---|------|---------|--------|
| 1 | `services/loyalty/crud.ts:689` | `const CENTS_PER_POINT = 10` | Read from `loyalty_valuation_policy` with fallback |
| 2 | `components/loyalty/comp-confirm-panel.tsx:29` | `const CENTS_PER_POINT = 10` | Receive as prop `centsPerPoint` from drawer |
| 3 | `components/loyalty/issue-reward-drawer.tsx` | No rate concept | Pass `centsPerPoint` to `CompConfirmPanel` |
| 4 | New: `services/measurement/queries.ts` or `services/loyalty/crud.ts` | — | `getActiveValuationPolicy(supabase, casinoId)` |

## Relationship to other issues

- **P2K-31 (eligibility cadence)** — independent, no overlap
- **GAP-A (earn rate architecture)** — related but separable. The earn rate source question is about `points_conversion_rate` (theo→points). This issue is about `cents_per_point` (dollars→points for comps). Different columns, different tables, different pipeline. Can be resolved independently.
- **GAP-B (valuation policy CRUD)** — the admin UI for `loyalty_valuation_policy` is a superset of this fix. This issue only needs a read function; GAP-B needs full CRUD + API + admin form.

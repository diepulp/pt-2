---
title: ADR-033 — Loyalty Reward Domain Model Scaffolding (MVP)
status: accepted
date: 2026-02-05
owner: Loyalty Domain
scope: PT-2 (Supabase/Postgres + Next.js App)
tags: [loyalty, rewards, catalog, entitlement, points, mvp]
---

# ADR-033 — Loyalty Reward Domain Model Scaffolding (MVP)

## Context

Current loyalty implementation has **deep plumbing and shallow surfaces**:

- Database/service/RPC plumbing exists (ledger, promo issuance) but operator workflows stall because the system cannot answer:
  **“What rewards exist, who is eligible, what is the cost/limits, and how do we issue it?”**
- Downstream features (issue rewards, tier matchplay/freeplay, operator UI) converge on a single gap:
  **a reward definition model** (taxonomy, catalog, tier rules) and minimal UI surfaces to turn infrastructure into workflows.

We need an MVP-scoped scaffold that:
1) defines *what rewards are*,
2) constrains issuance via eligibility/limits,
3) maps cleanly onto existing issuance plumbing (points ledger + promo coupons),
4) avoids introducing a marketing rules engine.

## Decision

Adopt a minimal **Reward Catalog** model with two reward families and a small set of supporting tables:

- **RewardDefinition (Catalog)** is separate from **Issuance events**.
- Two families:
  - **Points Rewards (Comps)**: priced in points, redeemed via `loyalty_ledger` debit.
  - **Non-Points Rewards (Entitlements/Instruments)**: tier/limits-driven, issued via promo instrument plumbing (e.g., coupon issuance).

Add a minimal casino-scoped earn configuration:
- `points_per_theo` (conversion rate) + `default_point_multiplier` + `rounding_policy`
  (no per-game promo multipliers in MVP).

## Non-Goals (MVP)

Explicitly out of scope for this ADR:
- Campaign engine / segmentation / time-window promotions
- Per-game/table dynamic multipliers
- Retroactive re-rating / recomputation pipelines
- QR/barcode print flows (modeled later via metadata)
- Automated reward recommendation engines

## Model Overview

### Core Principle: Definition vs Issuance

- **RewardDefinition** = “what the casino offers” (operator selectable)
- **Issuance** = “what happened” (events already represented by ledger rows and/or coupons)

This ADR only scaffolds **definition + constraints** and wires into existing issuance mechanisms.

## Data Model (MVP)

All tables are **casino-scoped**, lower_snake_case, UUID PKs, and RLS derives from casino ownership.

### 1) `reward_catalog`
Canonical list of rewards operators can browse/issue.

**Fields (v0):**
- `id uuid pk`
- `casino_id uuid not null`
- `code text not null` (stable key, e.g., `COMP_MEAL_25`, `MP_TIER_DAILY`)
- `name text not null`
- `family reward_family not null` (`points_comp` | `entitlement`)
- `kind text not null` (taxonomy leaf: `meal`, `beverage`, `match_play`, `free_play`, etc.)
- `is_active boolean not null default true`
- `fulfillment text null` (`immediate` | `voucher` | `external`) *(optional)*
- `ui_tags text[] null`
- `metadata jsonb not null default '{}'::jsonb` *(strictly extra, small payloads only)*

**Uniqueness:**
- `(casino_id, code)` unique

### 2) `reward_price_points`
Point pricing for **points_comp** rewards only.

- `reward_id uuid pk fk reward_catalog(id)`
- `casino_id uuid not null` *(denormalize for RLS simplicity)*
- `points_cost int not null`
- `allow_overdraw boolean not null default false`

### 3) `reward_entitlement_tier`
Tier-based benefit mapping for **entitlement** rewards.

- `id uuid pk`
- `casino_id uuid not null`
- `reward_id uuid not null fk reward_catalog(id)`
- `tier text not null` (aligned to `player_loyalty.tier`)
- `benefit jsonb not null`
  Example: `{ "face_value_cents": 2500, "instrument_type": "match_play" }`

**Uniqueness:**
- `(casino_id, reward_id, tier)` unique

### 4) `reward_limits`
Issue frequency constraints.

- `id uuid pk`
- `casino_id uuid not null`
- `reward_id uuid not null fk reward_catalog(id)`
- `scope text not null` (`per_visit` | `per_gaming_day` | `per_week` | `per_month`)
- `max_issues int not null default 1`
- `cooldown_minutes int null`
- `requires_note boolean not null default false`

### 5) `reward_eligibility`
Minimal eligibility guardrails.

- `id uuid pk`
- `casino_id uuid not null`
- `reward_id uuid not null fk reward_catalog(id)`
- `min_tier text null`
- `max_tier text null`
- `min_points_balance int null`
- `visit_kinds text[] null` *(optional, if visit types exist)*

### 6) `loyalty_earn_config` (minimal)
Casino-scoped configuration for point accrual.

- `casino_id uuid pk`
- `points_per_theo int not null default 10`
- `default_point_multiplier numeric not null default 1.0`
- `rounding_policy text not null default 'floor'` (`floor` | `nearest` | `ceil`)
- `is_active boolean not null default true`
- `effective_from timestamptz null` *(optional; omit if not needed)*

## Issuance Wiring (MVP)

### A) Points Comp Flow
1. Operator selects `reward_catalog` row where `family = 'points_comp'`
2. UI loads `reward_price_points.points_cost`
3. Call existing redeem path (e.g., `rpc_redeem_points(...)` or equivalent) with metadata:
   - `reward_id`, `reward_code`, `reward_kind`, `operator_note` (if required)

**Result:** ledger debit remains the audit trail; catalog provides structure.

### B) Entitlement/Instrument Flow
1. Operator selects `reward_catalog` row where `family = 'entitlement'`
2. System resolves `reward_entitlement_tier` by player tier
3. Validate `reward_limits` and `reward_eligibility`
4. Call existing promo issuance RPC (e.g., coupon issue RPC) with metadata:
   - `reward_id`, `reward_code`, `benefit.face_value_cents`, `tier`

## Operator UI Surfaces (MVP)

### 1) Issue Reward Drawer (Player 360)
- Searchable catalog list with filters:
  - family (points/entitlement), kind, “eligible now”
- Details panel:
  - Points: cost, balance, post-balance
  - Entitlement: face value, remaining today, next eligible time
- CTA: **Issue** → calls appropriate RPC path

### 2) Rewards History Panel (Unified)
- Tab A: Points activity (ledger)
- Tab B: Coupons/instruments (promo coupon list)
- Render using existing query hooks; avoid new “issuance” tables in MVP.

### 3) Admin-lite Catalog Manager (v0)
- Create/edit rewards
- Set point costs
- Set tier benefits
- Toggle active

No campaign logic.

## Defaults (MVP)

- `loyalty_earn_config.points_per_theo = 10`
- `loyalty_earn_config.default_point_multiplier = 1.0`
- `loyalty_earn_config.rounding_policy = 'floor'`
- Entitlement default for matchplay/freeplay:
  - `scope = 'per_gaming_day'`, `max_issues = 1`

## Security / RLS

- All catalog/config tables are casino-owned (`casino_id`)
- Read: staff in casino
- Write: admin/pitboss (as defined by SRM/RLS role mapping)

## Dependencies / Preconditions

### Hard Dependency: `loyalty_outbox` Table (P0)

The investigation report (`LOYALTY-REWARDS-SYSTEM-COMPREHENSIVE-OVERVIEW.md`) confirmed that `loyalty_outbox` was dropped in migration `20251213003000` and **never recreated**. Three promo RPCs (`rpc_issue_promo_coupon`, `rpc_void_promo_coupon`, `rpc_replace_promo_coupon`) INSERT into this table and will fail at runtime with "relation loyalty_outbox does not exist."

This is **not in scope** for the reward domain model. `loyalty_outbox` is loyalty event infrastructure, not "what rewards exist." However, it is a **hard dependency for entitlement issuance paths**: Flow B (Entitlement/Instrument) calls the existing promo coupon RPCs. If those RPCs fail because `loyalty_outbox` is missing, the entitlement flow is broken regardless of how complete the catalog is.

**Resolution requirement:** Before or concurrent with reward domain model implementation, one of:
- Recreate `loyalty_outbox` with the schema expected by the promo RPCs, OR
- Remove the `INSERT INTO loyalty_outbox` statements from the three promo RPCs if the outbox pattern is no longer desired

**Owner:** Loyalty infrastructure (not this ADR).

### Soft Dependencies

| Dependency | Why | When |
|------------|-----|------|
| `player_loyalty` record exists for player | Entitlement eligibility checks query tier and balance | Must exist before issuance; currently guaranteed by `rpc_create_player` (ISSUE-B5894ED8 fix) |
| `promo_program` active for casino | Entitlement flow resolves to an active program for coupon issuance | Must be seeded or created via admin UI |
| `game_settings` rows seeded | `loyalty_earn_config` complements but does not replace existing `game_settings` snapshot mechanism | Already seeded via migration |

## Known Technical Debt (Not Addressed by This ADR)

The investigation report surfaced several bugs and debt items in the existing loyalty infrastructure. This ADR addresses the *domain model gap* (no reward taxonomy, no tier-to-entitlement bridge, no catalog). The items below are **not resolved** by this ADR and must be tracked separately — some must be fixed before or during implementation, others can be deferred.

### Must Fix Before / During Implementation

| Item | Severity | Why It Matters for This ADR | Reference |
|------|----------|----------------------------|-----------|
| `loyalty_outbox` table missing | **P0** | Flow B (entitlement issuance) calls promo RPCs that fail without it | See Dependencies above |
| Divergent mid-session reward module | **P1** | `services/loyalty/mid-session-reward.ts` defines a conflicting `LoyaltyReason` enum and its API route is a stub. Should be reconciled or removed before new reward service code is added, to avoid type confusion during implementation. | Investigation report §5, P1 |
| Inconsistent lazy-create pattern | **P2** | `rpc_manual_credit` and `rpc_apply_promotion` silently create `player_loyalty` records; `rpc_accrue_on_close` hard-fails if missing. Points comp issuance (Flow A) calls `rpc_redeem` which also lazy-creates. Behavior should be standardized before reward issuance goes live. | Investigation report §5, P2 |

### Can Be Deferred (Not Blocking)

| Item | Severity | Why It Can Wait | Reference |
|------|----------|-----------------|-----------|
| Materialized view never refreshed | P2 | `mv_loyalty_balance_reconciliation` is for drift detection, not issuance. Stale view does not affect reward flows. | Investigation report §5, P2 |
| `player_loyalty` INSERT RLS relaxed | P2 | Auth-hardening migration broadened the INSERT policy. Mitigated by RPCs having their own role checks. Does not affect catalog reads or issuance calls. | Investigation report §5, P2 |
| `rpc_issue_mid_session_reward` missing SECURITY keyword | P3 | Legacy RPC defaults to INVOKER by PostgreSQL convention. Not called by any reward flow in this ADR. | Investigation report §5, P3 |
| SRM lists `loyalty_outbox` as deployed | P2 | Documentation drift. Should be corrected when the outbox decision is made (recreate vs remove). | Investigation report §5, P0 (SRM note) |

## Consequences

### Benefits
- Unblocks issuance workflows by defining “what exists”
- Maintains audit trail without new issuance tables
- Minimizes scope: no marketing engine, no retroactive recompute

### Tradeoffs
- Some variability is pushed into `benefit jsonb` (controlled, small)
- Per-game multipliers/promos deferred; future Phase 2 can extend via additional config tables.

## Implementation Plan (Lower-Level Development)

1. Migrations:
   - Create tables above
   - Add indexes:
     - `reward_catalog (casino_id, is_active)`
     - `reward_catalog (casino_id, code)`
     - `reward_entitlement_tier (casino_id, reward_id, tier)`
2. RLS:
   - Standard casino-scoped read policies
   - Role-gated write policies
3. Seed:
   - 3 points comps (meal/beverage/misc)
   - 2 entitlements (tier matchplay/tier freeplay)
4. UI:
   - Issue Reward drawer wired to existing RPCs
   - Rewards History panel (ledger + coupon lists)
   - Admin-lite catalog editor (basic CRUD)
5. Telemetry:
   - Ensure issuance metadata includes `reward_id/reward_code` going forward

## Definition of Done (MVP)

- Catalog tables exist with RLS and seed data
- Operator can:
  - browse eligible rewards,
  - issue a points comp (ledger debit),
  - issue an entitlement (coupon/instrument),
  - see history of both.
- No new marketing engine introduced
- No retroactive recompute required

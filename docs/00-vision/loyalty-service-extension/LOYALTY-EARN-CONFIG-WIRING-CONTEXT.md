---
title: "Loyalty Earn Config — Architectural Evaluation & Rounding Snapshot Patch"
status: decision-frozen
date: 2026-03-18
references:
  - ADR-033 (reward catalog domain model)
  - ADR-019 D2 (policy snapshot immutability)
  - Over-Engineering Guardrail (docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md)
  - LOYALTY-SYSTEM-POSTURE-PRECIS.md
  - LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md
  - 20260302230020_drop_sec007_p0_phantom_overloads.sql (latest rpc_start_rating_slip)
  - 20251229154020_adr024_loyalty_rpcs.sql (latest rpc_accrue_on_close)
---

# Loyalty Earn Config — Architectural Evaluation & Rounding Snapshot Patch

## Situation

Two tables can govern loyalty earn rates. One works today. The other was designed to replace it but was never wired in. This document evaluates whether completing that wiring is the right move for pilot, or whether it introduces unnecessary risk and complexity.

---

## The Two Approaches

### Approach A: `game_settings` (status quo — working)

`game_settings` is keyed on `(casino_id, game_type)`. It stores `points_conversion_rate` and `point_multiplier` alongside game-specific parameters (`house_edge`, `decisions_per_hour`). `rpc_start_rating_slip()` reads all four fields from `game_settings` and freezes them into the policy snapshot. `rpc_accrue_on_close()` reads only the frozen snapshot per ADR-019 D2.

**This path is fully wired and producing correct accruals today.**

```
game_settings (per game type)
  → rpc_start_rating_slip() freezes into policy_snapshot
    → rpc_accrue_on_close() reads snapshot only (ADR-019 D2 compliant)
```

### Approach B: `loyalty_earn_config` (ADR-033 intent — not wired)

ADR-033 introduced `loyalty_earn_config` as the designated admin surface for earn-policy values. It is keyed on `casino_id` (one row per casino). The full backend stack was built — table, service CRUD, Zod validation, API routes (`GET/PUT /api/v1/rewards/earn-config`), HTTP fetchers, query key factory, tests. None of it is consumed by the accrual pipeline. The table is write-only.

```
loyalty_earn_config (casino-wide)
  → service + API + HTTP fetchers (all built, all unused)
  → NOT read by rpc_start_rating_slip()
  → NOT snapshotted
```

---

## Honest Comparison

### Where `game_settings` is stronger

| Dimension | Assessment |
|---|---|
| **It works** | Wired, tested, producing correct accruals. Zero migration risk. |
| **Per-game granularity** | Keyed on `(casino_id, game_type)`. Casinos routinely award different earn rates by game — slots typically earn more per theo than blackjack. A casino-wide flat rate is less flexible than what's already deployed. |
| **Admin surface parity** | Could host an admin form just as easily. The argument that operators "shouldn't need to understand game_settings" is a UX concern solvable with a purpose-built view over the existing table, not a new table. |
| **Snapshot pipeline** | Already wired. No migration touches required for earn rate or multiplier. |

### Where `loyalty_earn_config` is stronger

| Dimension | Assessment |
|---|---|
| **Separation of concerns** | Game math parameters (`house_edge`, `decisions_per_hour`) are intrinsic properties of the game. Earn-policy parameters are business decisions about loyalty generosity. These change at different cadences — game math rarely changes, earn policy changes seasonally or promotionally. Mixing them on one table conflates two responsibilities. |
| **Policy lifecycle** | `effective_from` and `is_active` support scheduling future policy changes and temporary deactivation. `game_settings` has no temporal activation semantics. |
| **ADR-033 alignment** | The designated canonical source per the architecture record. |

### Where neither table is adequate

If a casino wants "10 points/theo for blackjack, 15 points/theo for slots, floor rounding on both" — neither table models that cleanly:

- `game_settings` has per-game granularity but no policy lifecycle
- `loyalty_earn_config` has clean separation and lifecycle but is casino-wide, losing per-game granularity that operators actually use

The "correct" model might be `loyalty_earn_config` as casino-wide defaults with per-game overrides — but that's a feature that doesn't exist and shouldn't be built speculatively.

---

## Evaluation

**`loyalty_earn_config` as built is over-engineered for what it does, and under-designed for what it would need to do.**

It is a full service stack (~2000+ lines across table, service, DTOs, validation, API, HTTP fetchers, query keys, tests) for three scalar values per casino. Those three scalars are less expressive than the per-game-type rows `game_settings` already provides. The infrastructure was built for a hypothetical future ("admins will tune loyalty policy independently of game settings") that hasn't proven necessary, while the working system already covers the primary use case.

The project's own Over-Engineering Guardrail applies: this is an abstraction built ahead of demonstrated need.

However, the ADR-033 design intent is architecturally sound in principle — separating game math from earn policy is a real concern distinction. The execution just didn't complete the handoff, and the per-game granularity gap wasn't addressed.

---

## The One Genuine Gap

`rpc_accrue_on_close()` hardcodes `ROUND()` (nearest-integer behavior) for the float-to-int conversion when computing `base_points`. Per ADR-019 D2, all accrual-affecting behavior must be frozen in the snapshot at slip creation. If rounding is ever made configurable, a live lookup at accrual time would violate snapshot determinism.

**Practical impact**: rounding differs by at most 0.999 points per slip — sub-$0.10 at standard conversion rates. It is an implementation detail, not a meaningful policy lever. No operator has asked for configurable rounding. `floor` is the casino industry standard (conservative, never over-award).

---

## Decisions (Frozen for Pilot)

### D1: `game_settings` remains the canonical earn-rate source

`game_settings.points_conversion_rate` and `game_settings.point_multiplier` stay as-is. The snapshot pipeline is untouched for these fields. No rewiring to `loyalty_earn_config`.

**Rationale**: Working system with per-game granularity. Rewiring adds migration risk for no user-visible benefit.

### D2: `loyalty_earn_config` is fully deferred

No RPC reads `loyalty_earn_config` for pilot. The table, service stack, API routes, and tests remain in the codebase but are inert. No admin UI will be built for it.

**Post-pilot**: If operator feedback demonstrates need for casino-wide earn policy separate from game settings, complete the wiring. If not, remove the entire stack as unused code.

### D3: Rounding is hardcoded as `'floor'` in the snapshot

`rpc_start_rating_slip()` snapshots `"rounding_policy": "floor"` as a literal — no table lookup. `rpc_accrue_on_close()` reads it from the snapshot and applies `FLOOR()`.

**Rationale**: Sub-1-point impact per slip. Not worth a live table dependency. The snapshot field exists for future configurability — if needed later, source from `casino_settings` (one ALTER TABLE, one column, zero new infrastructure), not `loyalty_earn_config`.

### D4: `rpc_accrue_on_close()` honors `rounding_policy` from snapshot

Replace hardcoded `ROUND()` with a snapshot-driven `FLOOR/ROUND/CEIL` switch. `COALESCE` to `'floor'` for old snapshots that lack the field. This satisfies ADR-019 D2 determinism.

---

## Migration Scope (Single Migration)

Both RPC changes are in one migration since they are a paired contract (snapshot producer + snapshot consumer).

### `rpc_start_rating_slip()` — Add `rounding_policy` to snapshot

**Baseline**: `20260302230020_drop_sec007_p0_phantom_overloads.sql` (5-param, ADR-024)

**Change**: Add `'rounding_policy', 'floor'` to the `loyalty` object and `_source` object. Bump `policy_version` to `'loyalty_points_v2'`.

No new variable declarations. No new table lookups. One literal string added to the snapshot builder.

### `rpc_accrue_on_close()` — Honor `rounding_policy` from snapshot

**Baseline**: `20251229154020_adr024_loyalty_rpcs.sql` (ADR-024, ghost visit guard)

**Change** at the calculation block (current lines 166-170):

```sql
-- BEFORE:
v_base_points := ROUND(v_theo * COALESCE(
  NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric,
  10.0
))::int;

-- AFTER:
v_base_points := (CASE COALESCE(v_loyalty_snapshot->>'rounding_policy', 'floor')
  WHEN 'floor'   THEN FLOOR(v_theo * COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0))
  WHEN 'ceil'    THEN CEIL(v_theo * COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0))
  WHEN 'nearest' THEN ROUND(v_theo * COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0))
  ELSE FLOOR(v_theo * COALESCE(NULLIF(v_loyalty_snapshot->>'points_conversion_rate', '')::numeric, 10.0))
END)::int;
```

Add `rounding_policy` to the ledger metadata `calc` object for provenance.

### Backward Compatibility

- **Old snapshots** (`loyalty_points_v1`): `rounding_policy` is NULL → `COALESCE` falls back to `'floor'`
- **New snapshots** (`loyalty_points_v2`): `rounding_policy` is explicit `'floor'`
- **Behavioral change**: new slips use `FLOOR()` instead of `ROUND()`. Difference is at most 0.999 points per slip. `floor` is the casino industry standard. Already-accrued slips are immutable in the ledger.
- **No re-migration** of existing rating slips required

---

## What Does NOT Change

- **`rpc_accrue_on_close()` read path** — still reads only `policy_snapshot.loyalty`, no live table lookups
- **`calculate_theo_from_snapshot()`** — unchanged
- **Earn rate source** — still `game_settings`, still per-game-type, still working
- **Ledger metadata provenance** — already captures `conversion_rate` from snapshot
- **Idempotency contracts** — unchanged
- **RLS policies** — unchanged
- **Function signatures** — unchanged (no DROP/CREATE needed)
- **`loyalty_earn_config`** — no RPC reads it; fully deferred
- **`game_settings` table** — unchanged, remains canonical

---

## `loyalty_earn_config` Infrastructure Inventory (Fully Deferred)

| Layer | Asset | Status | Pilot role |
|---|---|---|---|
| Table | `loyalty_earn_config` (PK: casino_id) | Deployed, seeded | **None** — no RPC reads it |
| Service | `getEarnConfig()`, `upsertEarnConfig()` | Implemented | Inert |
| Validation | `upsertEarnConfigSchema` (Zod) | Implemented | Inert |
| API | `GET/PUT /api/v1/rewards/earn-config` | Operational | Inert |
| HTTP fetcher | `getEarnConfig()`, `upsertEarnConfig()` | Implemented | Inert |
| Query keys | `rewardKeys.earnConfig()` | Defined | Inert |
| DTO | `LoyaltyEarnConfigDTO`, `UpsertEarnConfigInput` | Defined | Inert |
| Tests | crud, schemas, http-contract, mappers | Passing | Inert |

**Post-pilot decision**: retain and wire if operator need is demonstrated, or remove as dead code.

---

## Open Questions

| # | Question | Status | Impact |
|---|---|---|---|
| 1 | Should earn rates be casino-wide, per-game, or casino-wide defaults with per-game overrides? | **Deferred to post-pilot** — requires operator feedback. `game_settings` (per-game) is the working model. | Determines whether `loyalty_earn_config` should eventually source earn rates, or be removed. |
| 2 | If rounding configurability is ever needed, where should it live? | **Pre-decided**: `casino_settings` (one column on existing table with existing admin UI wiring). Not `loyalty_earn_config`. | Minimal path — no new infrastructure. |
| 3 | Does `point_multiplier` need temporal scoping (start/end dates) for promotional periods? | Open | Current design is a single scalar on `game_settings`. Promotional multipliers with date ranges may need a separate mechanism. |

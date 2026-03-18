---
title: "Loyalty Earn Config — Architectural Evaluation & Rounding Snapshot Patch"
status: decision-frozen
date: 2026-03-18
supersedes: "Loyalty Earn Config Wiring — Context & Gap Analysis (pre-decision draft)"
canonical_source: "docs/00-vision/loyalty-service-extension/LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md"
references:
  - ADR-033 (reward catalog domain model)
  - ADR-019 D2 (policy snapshot immutability)
  - Over-Engineering Guardrail (docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md)
  - LOYALTY-SYSTEM-POSTURE-PRECIS.md
  - LOYALTY-INTSRUMENTS-SYSTEM-POSTURE-AUDIT.md
  - 20260302230020_drop_sec007_p0_phantom_overloads.sql (latest rpc_start_rating_slip)
  - 20251229154020_adr024_loyalty_rpcs.sql (latest rpc_accrue_on_close)
---

# Loyalty Earn Config — Frozen Pilot Decision (Vector-A Reference Copy)

> **This is a reference copy.** The canonical version lives at `docs/00-vision/loyalty-service-extension/LOYALTY-EARN-CONFIG-WIRING-CONTEXT.md` on main. This copy exists so Vector-A investigation artifacts can cross-reference the frozen decisions without leaving the vector directory.

## Frozen Decisions (Pilot)

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

## Impact on Vector-A Scope

- **Earn config editor**: REMOVED from Vector-A scope (no admin UI for `loyalty_earn_config`)
- **Earn config API routes**: Exist but are INERT — not consumed by any admin UI or accrual pipeline
- **Earn config hooks**: `useEarnConfig` exists but is NOT wired to any UI
- **`loyalty_earn_config` table**: Deployed but INERT — no RPC reads it

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

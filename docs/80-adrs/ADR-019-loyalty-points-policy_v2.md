# ADR-019 v2: Loyalty Points Policy — Ledger-Based Credit/Debit Model (Authoritative DB, TS Reference)

**Status:** Accepted  
**Date:** 2025-12-12  
**Supersedes:** ADR-019 (2025-12-12)  
**Owner:** Product/Architecture  
**Applies to:** LoyaltyService bounded context  
**Decision type:** Domain/Business Logic + Security/Integrity  
**Related:** PRD-004, ADR-015 (JWT claims + pooling), SRM v4.0.0 (LoyaltyService)

**Policy Source:** `docs/00-vision/LoyaltyService_Points_Policy_PT-2.md`

---

## Context

PT-2 requires a loyalty system where players **earn** points through gameplay and **spend** them on comps. Prior implementations suffered from:
- caller-supplied point values bypassing any policy
- “award” semantics used for both credits and debits
- insufficient audit provenance
- drift between `lib/theo.ts` and DB behavior

This ADR formalizes the canonical policy and closes the 7 audit patches (enum migration, snapshot source, RPC security, overdraw authorization, idempotency, concurrency, mid-session evaluation contract).

---

## Decision

LoyaltyService implements an **append-only ledger** (`loyalty_ledger`) plus a cached balance (`player_loyalty.current_balance`) with **four distinct paths**:

| Path | Type | Trigger | What happens |
|------|------|---------|--------------|
| 1. **Base Accrual** | Credit (+) | Rating slip close | DB computes theo → points and mints a ledger credit |
| 2. **Promotions** | Credit (+) | Campaign/offer | Additive overlay ledger credit(s) (post-MVP UI ok) |
| 3. **Comp Issuance / Redemption** | Debit (-) | Pit boss/cashier action | Comp cost **X points** debited from current balance |
| 4. **Manual Credits / Corrections** | +/- | Admin authority | Service recovery credits and corrective adjustments/reversals |

### D1: Base accrual formula (theo-based, deterministic)
```
duration_hours = duration_minutes / 60
total_decisions = decisions_per_hour * duration_hours
theo = (average_bet * house_edge / 100) * total_decisions
base_points = round(theo * points_conversion_rate)
```
Constraint: **Base accrual never mints negative points** (`theo ≤ 0 → base_points = 0`).

### D2: Canonical snapshot source (single SoT for inputs)
Deterministic minting reads from:
- **Canonical:** `rating_slip.policy_snapshot->'loyalty'` (JSONB)

`rating_slip.game_settings` may exist for other consumers, but **LoyaltyService RPCs MUST NOT read it** except for a temporary, explicitly documented legacy fallback (time-bounded).

**Required fields** in `policy_snapshot.loyalty`:
- `house_edge` (numeric, required)
- `decisions_per_hour` (numeric, required)
- `points_conversion_rate` (numeric, required; defaults only if explicitly set here)
- `policy_version` (text, required; e.g. `"loyalty_points_v1"`)

Responsibility: RatingSlip/Visit flow must populate the snapshot at slip creation/open (or at least before close).

### D3: Logic location (Authoritative DB, TS reference)
- **Authoritative:** DB RPCs mint ledger entries and update balances transactionally.
- **Reference only:** TypeScript (`lib/theo.ts`) for UI previews/suggestions + tests.

Guardrail: **Deterministic RPCs do not accept computed points** as inputs.

---

## Patch Closure Requirements (7/7)

### P1 — Enum migration strategy (chosen: Strategy B — additive + deprecate)
We will **not** attempt “renaming enum values.” Instead:

- Add new enum values to the existing `loyalty_reason` enum.
- Keep legacy values for historical rows.
- Enforce “no new writes” of deprecated values by RPC validation.

**Canonical write set (new entries):**
- `base_accrual`, `promotion`, `redeem`, `manual_reward`, `adjustment`, `reversal`

Legacy values (if they exist) remain readable but are **write-prohibited** going forward.

### P2 — Snapshot canonical source (chosen: `policy_snapshot.loyalty`)
All deterministic calculations read from `rating_slip.policy_snapshot->'loyalty'`. No dual snapshot SoT.

### P3 — RPC security model (chosen: SECURITY INVOKER for all Loyalty RPCs)
All LoyaltyService RPCs must be created as:
- **`SECURITY INVOKER`** (never `SECURITY DEFINER`) to avoid silent RLS bypass.

Authorization is enforced by:
- RLS (row ownership via `casino_id` + staff JWT claims)
- explicit checks inside RPCs (role checks + casino matching)

### P4 — Overdraw authorization rules (chosen: controlled overdraw, role-gated, capped)
Default: **no overdraw**.

Controlled overdraw is allowed only when:
- caller passes `allow_overdraw = true`, AND
- caller’s role is authorized, AND
- `approved_by_staff_id` is recorded (defaults to caller staff_id in MVP)

**Role gate (MVP):**
- May redeem (no overdraw): `pit_boss`, `admin`
- May approve overdraw: `pit_boss`, `admin`
- Manual credit / adjustment: `pit_boss`, `admin` (adjustments may be admin-only if desired)

**Caps (MVP defaults, configurable later):**
- `max_overdraw_points_per_redeem = 5000`
- `max_redeem_points_per_txn = 20000`
These may move into `casino_settings` later.

### P5 — Idempotency for all award paths (chosen: idempotency_key for all mutating RPCs)
All mutating RPCs must accept an `idempotency_key` and persist it in `loyalty_ledger`.

Uniqueness:
- `UNIQUE (casino_id, idempotency_key)` where `idempotency_key IS NOT NULL`

Additionally for base accrual:
- `UNIQUE (source_kind, source_id, reason)` for `reason='base_accrual'`

### P6 — Concurrency: balance row locking (chosen: row lock on `player_loyalty`)
Redemption/adjustment-style RPCs must:
- `SELECT ... FROM player_loyalty WHERE player_id=? AND casino_id=? FOR UPDATE`
- compute `balance_before`
- insert ledger entry
- update `player_loyalty.current_balance`
- return `balance_before`, `balance_after`, `overdraw_applied`

All in one transaction.

### P7 — Mid-session evaluation contract (chosen: suggestion helper output, no minting)
`evaluate_mid_session_reward_policy` is rewritten as a **pure suggestion helper**:
- returns suggested theo/points based on session-to-date
- returns policy version
- may return approval hints
- **does not** insert ledger entries, and does not return eligibility gates

---

## RPC Contracts (Authoritative)

> Naming is illustrative; if existing RPC names are already wired, keep names and update semantics.

### 1) `rpc_accrue_on_close` (deterministic credit)
**Input:** `rating_slip_id`, `idempotency_key`  
**Behavior:** computes theo/points from `policy_snapshot.loyalty`, inserts `base_accrual` entry if absent, updates balance.

### 2) `rpc_redeem` (comp issuance / debit)
**Input:** `player_id`, `casino_id`, `points` (positive cost), `issued_by_staff_id`, `note`, `idempotency_key`, optional `allow_overdraw`  
**Output:** `balance_before`, `balance_after`, `overdraw_applied`

### 3) `rpc_manual_credit` (service recovery credit)
**Input:** `player_id`, `casino_id`, `points` (positive), `awarded_by_staff_id`, `note`, `idempotency_key`  
**Output:** balances before/after

### 4) `rpc_adjust_points` / `rpc_reverse_ledger_entry` (admin corrections)
Admin-only by default. Must preserve append-only semantics.

### 5) `evaluate_mid_session_reward_policy` (suggestion only)
Recommended contract:

**Input:** `rating_slip_id`, optional `as_of_ts` (defaults `now()`)  
**Returns:**
- `suggested_theo` numeric
- `suggested_points` integer
- `policy_version` text
- `requires_approval` boolean (optional)
- `max_recommended_points` integer (optional)
- `notes` text (optional)

---

## Schema / Migration Requirements (Concrete)

### 1) Enum updates (Strategy B)
```sql
-- Additive enum expansion (idempotent-ish pattern: check first in migrations)
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'base_accrual';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'promotion';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'redeem';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'manual_reward';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'adjustment';
ALTER TYPE loyalty_reason ADD VALUE IF NOT EXISTS 'reversal';
```

### 2) Ledger idempotency key
```sql
ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_idempotency_uq
  ON loyalty_ledger (casino_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

### 3) Base accrual uniqueness (source-based)
If you have `source_kind` / `source_id` columns:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_base_accrual_uq
  ON loyalty_ledger (casino_id, source_kind, source_id, reason)
  WHERE reason = 'base_accrual';
```

### 4) Balance cache correctness
Ensure `player_loyalty` has `current_balance` and is updated transactionally in RPCs.

---

## Security / Authorization (Concrete)

All loyalty RPCs are `SECURITY INVOKER`.

Minimum checks inside mutating RPCs:
- caller has `staff_id` and `casino_id` in JWT claims
- `p_casino_id = caller_casino_id`
- role-based gate:
  - redeem: `pit_boss|cashier|admin`
  - overdraw: `pit_boss|admin` (and caps)
  - manual_credit: `pit_boss|admin`
  - adjustment/reversal: `admin` (or `pit_boss|admin` if you choose)

RLS must be aligned so inserts/updates are only possible within the caller casino scope.

---

## Consequences

### Positive
- Deterministic, auditable accrual
- Clear credit vs debit semantics (comps are debits)
- Snapshot stability prevents history mutation
- DB authority prevents “caller makes up points”
- Idempotent + race-safe balance updates

### Negative
- Requires disciplined snapshot population (`policy_snapshot.loyalty`)
- Requires RPC rewrites and migrations (enum values + idempotency key)
- Adds explicit authorization policy that must be maintained with SRM/roles

---

## Validation Checklist (Updated)

- [ ] `policy_snapshot.loyalty` is the sole input for deterministic minting
- [ ] All loyalty RPCs are `SECURITY INVOKER` (no `SECURITY DEFINER`)
- [ ] `rpc_redeem` debits points (`points_delta = -X`) and returns balances + overdraw flag
- [ ] Overdraw is role-gated and capped; approval is recorded
- [ ] All mutating RPCs accept and persist `idempotency_key`
- [ ] Redemption/adjustment locks `player_loyalty` row (`FOR UPDATE`)
- [ ] `evaluate_mid_session_reward_policy` returns suggestion fields only; no minting, no eligibility gates
- [ ] Golden fixtures: TS reference formula matches DB RPC outputs

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-12 | Lead Architect | v2 closes 7 audit patches with concrete choices |

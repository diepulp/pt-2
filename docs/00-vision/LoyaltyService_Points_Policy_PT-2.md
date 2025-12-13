# LoyaltyService Points Policy (PT‑2)

**Status:** Accepted (formalized as ADR-019)
**Date:** 2025-12-12
**Scope:** LoyaltyService accrual + promotions + discretion + redemptions (ledger-based)
**Non-goals:** "flat points", eligibility gates ("not eligible"), seat bonus in base accrual
**ADR:** `docs/80-adrs/ADR-019-loyalty-points-policy.md`

---

## Decision

LoyaltyService implements a **ledger-based** points system with **four distinct paths** (credits and debits are never conflated):

1. **Base accrual (deterministic credit):** rating slip close → theo → points  
2. **Promotions (additive credit overlay):** campaign/offer awards posted as separate ledger entries  
3. **Comp issuance / redemption (debit):** pit boss issues a comp with a point cost; system debits points **from current balance**  
4. **Manual credits / corrections (explicit authority):** rare credit/debit entries for service recovery, corrections, reversals

Negative points may appear as **ledger debits** (redemption/corrections), and can drive the **net balance** below zero if the overdraw policy permits it.

---


## Base accrual policy (deterministic)

### Trigger
- **On `rating_slip` close** (or equivalent “finalized end_time + status=closed” event)

### Inputs (snapshot-first)
Base accrual should compute from **snapshotted** values captured for the session:
- `average_bet`
- `duration_minutes` (derived from start/end)
- `house_edge`
- `decisions_per_hour`
- `points_conversion_rate`

> **Snapshot rule:** Do not compute base accrual from live `game_settings` at close unless the slip carries an immutable snapshot (e.g., `rating_slip.policy_snapshot` or `rating_slip.game_settings` JSONB). Otherwise you’ll retroactively mutate history when settings change.

### Formula
Compute theoretical win (theo), then points:

- `duration_hours = duration_minutes / 60`
- `total_decisions = decisions_per_hour * duration_hours`
- `theo = (average_bet * house_edge / 100) * total_decisions`
- `base_points = round(theo * points_conversion_rate)`

### Guardrails
- If any required input is missing, fall back to **safe defaults only if policy allows** (recommended: require snapshot completeness; otherwise explicit defaulting must be documented and included in metadata).
- Base accrual must never be negative. If `theo <= 0` ⇒ `base_points = 0`.

---

## Promotions policy (overlay, optional)

### Rule
Promotions must be posted as **separate ledger entries**, never mixed into base accrual.

Promotions can be expressed as:
- **Multiplier** over base points (e.g., 2× weekend promo)
- **Bonus points** (fixed additive)
- **Theo-based** (compute promo delta from theo using alternate conversion/multiplier)

### Promotion math (recommended delta model)
If applying a multiplier:
- `promo_points_delta = round(base_points * promo_multiplier) - base_points`

This keeps base accrual stable and makes the promotion effect explicit.

---

## Comp issuance / redemption (pit boss workflow)

### What this is
When a pit boss “writes a meal comp that costs **X points**”, the system is not “awarding points”.
It is issuing a **comp** and recording a **points redemption**.

### Behavior
- Pit boss selects a comp (e.g., *Meal*, *Show*, *Hotel*) with **point cost = X**
- System debits the player’s historical accrued points **at that moment**
- Posts a ledger **debit** entry:
  - `reason = "redeem"`
  - `points_delta = -X`
- Requires:
  - `staff_id` (who issued the comp)
  - mandatory `note` (why / context)
  - optional `reward_id` / `reference` (receipt, voucher, ticket id)

### “Suggested” information (optional, UI-only)
During comp issuance the system may display:
- session-to-date theo / estimated value
- current points balance and burn rate
- recommended comp tier / “max recommended comp” (in points)

…but the posted entry remains a **debit of the chosen comp cost**.

---

## Manual credits / corrections (explicit authority)

This path exists, but it is **not** the “meal comp” workflow.

Use when you need to:
- grant points as goodwill/service recovery (**manual credit**)
- correct mistakes (**adjustment**)
- reverse prior entries (**reversal**)

Manual credits require:
- `awarded_by_staff_id`
- mandatory `note`
- optional `suggested_points` in metadata (computed for UI/audit context)

---


## Negative points policy

Negative point entries are allowed only as **debits**:
- Redemptions
- Corrections/chargebacks
- Reversals of prior entries

Base accrual **must not** mint negative points.

---

## Ledger model expectations

### Core invariants
- **Append-only semantics:** never “edit points”; post new entries
- **Idempotent base accrual:** exactly one base accrual entry per rating slip
- **Auditability:** every entry carries a reason code and enough metadata to explain the math/decision

### Recommended reason codes (enum)
```ts
export type LoyaltyLedgerReason =
  | 'base_accrual'      // deterministic slip close
  | 'promotion'         // campaign/offer overlay
  | 'manual_reward'     // pit boss discretion
  | 'redeem'            // player redemption
  | 'adjustment'        // admin correction (may be +/-)
  | 'reversal';         // reversal of a prior entry
```

### Recommended metadata shape (JSONB)
Store minimal but sufficient provenance. Example:

```json
{
  "source": {
    "kind": "rating_slip",
    "id": "uuid",
    "casino_id": "uuid",
    "gaming_day": "2025-12-12"
  },
  "calc": {
    "average_bet": 100,
    "duration_minutes": 120,
    "house_edge_pct": 1.5,
    "decisions_per_hour": 70,
    "conversion_rate": 10,
    "theo": 210,
    "base_points": 2100,
    "rounding": "Math.round"
  },
  "policy": {
    "snapshot_ref": "rating_slip.policy_snapshot",
    "version": "loyalty_points_v1"
  }
}
```

For promotions:
```json
{
  "campaign_id": "uuid-or-string",
  "promo_multiplier": 2.0,
  "base_points": 2100,
  "promo_points_delta": 2100
}
```

For manual rewards:
```json
{
  "awarded_by_staff_id": "uuid",
  "note": "Service recovery / high-value player appreciation",
  "suggested_points": 1500
}
```

For debits:
```json
{
  "redemption": { "reward_id": "uuid", "reference": "receipt/txn id" },
  "balance_before": 9000,
  "balance_after": 7000
}
```

---

## Idempotency + consistency

### Base accrual idempotency (required)
Enforce **one base accrual per slip** using *either*:
- Unique constraint on `(source_kind, source_id, reason='base_accrual')`, or
- A dedicated `source_id` column + unique constraint keyed by `(source_id, reason)`.

When accrual is requested twice, the second call must return the existing entry (no double-mint).

### Promotion idempotency (recommended)
Use `(campaign_id, source_id)` uniqueness or a similar natural key.

### Ledger ordering
Ledger should be consistent with:
- `casino_id`
- `player_id`
- `gaming_day` (if used for reporting cutoffs)
- `created_at` monotonic timestamp

---

## Service contracts (suggested)

### 1) Accrue on slip close (deterministic)
**Input:** `rating_slip_id`  
**Output:** ledger entry (or existing entry if already accrued)

```ts
type RpcAccrueOnCloseInput = {
  rating_slip_id: string;
};

type RpcAccrueOnCloseOutput = {
  ledger_id: string;
  points_delta: number;
  theo: number;
};
```

### 2) Apply promotion (overlay)
```ts
type RpcApplyPromotionInput = {
  rating_slip_id: string;
  campaign_id: string;
  promo_multiplier?: number;   // mutually exclusive with bonus_points
  bonus_points?: number;
};

type RpcApplyPromotionOutput = {
  ledger_id: string;
  promo_points_delta: number;
};
```

### 3) Manual credit / service recovery (explicit authority)
```ts
type RpcManualAwardInput = {
  player_id: string;
  casino_id: string;
  points: number;              // positive only (credit)
  awarded_by_staff_id: string;
  note: string;
  suggested_points?: number;
};

type RpcManualAwardOutput = {
  ledger_id: string;
  points_delta: number;
};
```

### 4) Redeem / comp issuance (debit)

```ts
type RpcRedeemInput = {
  player_id: string;
  casino_id: string;
  points: number;              // comp cost (positive input); stored as negative delta
  issued_by_staff_id: string;  // pit boss / cashier authority
  note: string;                // mandatory audit trail
  reward_id?: string;          // optional catalog item
  reference?: string;          // receipt/voucher id, etc.
  allow_overdraw?: boolean;    // only honored if caller has authority
};

type RpcRedeemOutput = {
  ledger_id: string;
  points_delta: number;        // negative
  balance_before: number;
  balance_after: number;
  overdraw_applied: boolean;
};
```
---

## Implementation notes (keep it boring)

- **Seat bonus:** removed from base policy. If you want it later, it becomes a **promotion** (campaign) with explicit metadata.
- **Rounding:** standardize to `Math.round` (document it; store it in metadata).
- **Snapshot versioning:** include `policy.version` so you can evolve formulas without rewriting history.
- **Explainability:** every award path must be explainable from its ledger record *alone*.

---

## Minimal test checklist

- Base accrual mints correct points for known examples (unit tests around theo + conversion rate)
- Base accrual is idempotent (double call does not double-mint)
- Promotions add a second entry and do not affect base entry
- Manual reward requires staff + note
- Redemption creates negative entry and updates balance correctly
- Changing `game_settings` after slip close does not change historical points (snapshot test)

---

## Addendum: Negative balances, overdraw, and “abuse signals” (boss UI)

This section clarifies how **negative numbers** should appear in the system without corrupting the meaning of **base accrual**.

### Terminology: negative *entry* vs negative *balance*
- **Negative ledger entry**: a ledger record where `points_delta < 0` (e.g., redemption, chargeback, correction).
- **Negative balance**: the player’s **net** points position (sum of all ledger deltas) is below 0.

**Base accrual** never produces a negative ledger entry.  
Negative numbers exist because **spending/corrections** can exceed earning.

### Overdraw policy (who is allowed to make balance go below 0)
A negative balance can only happen if the system allows **overdraw** (spending beyond available balance).
Pick one and enforce it consistently:

1) **Strict (no overdraw)** *(default if you want simplicity)*  
   - Block redemption if `current_balance < cost`.
   - Net balance never goes negative via normal redemption.

2) **Controlled overdraw (staff-approved)** *(recommended if you want “negative balance as a signal”)*  
   - Allow redemption to push balance below 0 **only** when explicitly approved by authorized staff.
   - Require `approved_by_staff_id` and a mandatory `note`.
   - Record overdraw context in metadata for audit + UI.

If controlled overdraw is enabled, include metadata like:
```json
{
  "overdraw": {
    "allowed": true,
    "approved_by_staff_id": "uuid",
    "note": "Approved comp-on-credit / suspected abuse monitoring / goodwill"
  }
}
```

### UI requirement: do not label negative balance as “abuse”
A negative balance is a **signal**, not proof. In the UI:
- Display it as **Net Balance** (can be negative)
- Add an “Overdraw events” indicator (count + total debits that exceeded balance)

### Boss-facing “abuse signals” (compute, don’t guess)
To identify suspicious patterns, prefer **metrics** over raw balance:

- **Earn/Burn ratio (30d)**  
  `earned_points_30d / spent_points_30d` (lower is worse)
- **Redemption frequency (30d)**  
  count of `redeem` entries and average points per redemption
- **Overdraw events (30d)**  
  count + total amount that pushed balance below 0
- **Manual intervention count (30d)**  
  number of `adjustment`, `reversal`, `manual_reward`
- **Promo share (30d)**  
  `promotion_points_30d / total_earned_points_30d` (high share can be a smell)

These metrics are what bosses should act on; balance alone is too blunt.

### Service/API implications
- Redemption RPC must return:
  - `balance_before`, `balance_after`
  - `overdraw_applied` boolean (and approval metadata if applicable)
- If using controlled overdraw, redemption RPC must require:
  - `approved_by_staff_id` (or equivalent authority claim)
  - `note`

### Data model implications (minimal)
- `player_loyalty.current_balance` is a cached/materialized sum of ledger deltas.
- Updates to `current_balance` must occur in the same transaction as ledger insert to avoid drift.

---
title: "LoyaltyService Extension — Promotional Instruments (Match Play) (v0.1 redacted)"
status: draft
owner: LoyaltyService (SRM: Reward policy & assignment)
created: 2026-01-05
updated: 2026-01-05
---

## 1) Why this surfaced as a LoyaltyService gap

The SRM row:

| Capability | Owner | Tables | Responsibility |
|---|---|---|---|
| Reward | LoyaltyService | `player_loyalty`, `loyalty_ledger`, `loyalty_outbox` | Reward policy & assignment |

…implicitly makes LoyaltyService the **policy brain** that decides:
- which inducements/rewards exist (e.g., match play)
- how they’re issued and controlled (auditability, expiry, void/replacement)
- how they’re summarized for **shift dashboards** without polluting cash KPIs

This extension is explicitly **not** an accounting subsystem.

## 2) Key decision: separate mechanism, not a separate bounded context

**Recommendation (v0):** implement *Promo Instruments* as a LoyaltyService extension (tables + RPCs + rollups),
not a standalone service.

Reason: shift dashboards need a **promo exposure lens** (issued amounts + controls), not settlement.

## 3) Standards / controls context (redacted)

Promotional instruments generally require:
- unique identification / validation numbers
- expiry controls
- void/replacement procedures with audit trail
- separation between **promo exposure** metrics and **cash** metrics

This document intentionally avoids jurisdiction-specific accounting treatments and tax calculations.

## 4) What the system must represent (core semantics)

For **match play**, you must represent two values:

- **Face value**: the coupon’s promo contribution.
- **Patron at-risk amount**: the required matching wager (the patron’s real exposure).

This enables honest shift metrics:

- **Cash/credit lens** = actual buy-ins/drop (elsewhere)
- **Promo lens** = issued promo face value + issued patron at-risk exposure

### Terminology (v0)

- **Issued**: PT created a coupon/instrument (fact PT knows).
- **Outstanding (uncleared)**: issued instruments that PT has not been told were cleared by any external process.
- **Cleared**: an external process confirms disposition (explicitly out of scope for v0).

> Important: PT cannot truthfully claim “redeemed/unredeemed” without an external clearance workflow.

## 5) Proposed LoyaltyService data model additions (v0)

> Naming: lower_snake_case; UUID IDs; casino-scoped; JSON only for metadata (SRM style).

### 5.1 `promo_program`

Defines the reward policy container (campaign / offer)

- `id uuid pk`
- `casino_id uuid`
- `name text`
- `promo_type promo_type_enum` (e.g., `match_play`, `nonnegotiable`, `free_bet`, `other`)
- `start_at timestamptz`
- `end_at timestamptz`
- `terms_md text`
- `eligible_game_types game_type[] null`
- `constraints jsonb` (min wager, max uses, etc.)
- `status text` (`draft`, `active`, `paused`, `ended`)
- `created_at timestamptz`

### 5.2 `promo_coupon`

Represents an issued coupon/instrument

- `id uuid pk`
- `casino_id uuid`
- `promo_program_id uuid fk`
- `validation_number text unique` **(required)**
- `face_value_amount numeric` **(required)**
- `required_match_wager_amount numeric` **(required for match_play)**
- `currency_code text default 'USD'`
- `issued_to_player_id uuid null` (optional; supports anonymous distribution)
- `issued_to_visit_id uuid null` (optional; supports visit-tied issuance)
- `issued_by_staff_id uuid`
- `issued_at timestamptz`
- `expires_at timestamptz`
- `status promo_coupon_status` (`issued`, `voided`, `expired`, `replaced`)
- `replaced_by_coupon_id uuid null`
- `metadata jsonb` (print batch, channel, etc.)

#### Derived values (for dashboards)
- `promo_at_risk_amount numeric` (= `required_match_wager_amount` for match play)

### 5.3 `promo_clearance_event` (optional; **out of scope for v0**)

This replaces the earlier idea of a table-attributed `promo_redemption_event`.

PT can only transition “outstanding” → “cleared” if a trusted external workflow provides a clearance signal.
Because v0 intentionally avoids that workflow, this table is listed for Phase 2+ planning only.

If implemented later:

- `id uuid pk`
- `casino_id uuid`
- `promo_coupon_id uuid fk`
- `player_id uuid null`
- `visit_id uuid null`
- `gaming_day date`
- `cleared_at timestamptz`
- `source text` (e.g., `external_recon`, `manual_admin`)
- `notes text null`
- `metadata jsonb`

> No table/pit attribution is modeled in v0 planning. If attribution is ever added, it must be backed by a real operational control.

### 5.4 `reward_issuance` (optional but recommended)

Unified “rewards” audit trail without abusing `loyalty_ledger`:

- `id uuid pk`
- `casino_id uuid`
- `player_id uuid null`
- `visit_id uuid null`
- `reward_kind text` (`loyalty_points`, `promo_coupon`, `comp`, ...)
- `reward_ref_id uuid` (points to `promo_coupon` or a ledger entry)
- `issued_by_staff_id uuid`
- `issued_at timestamptz`
- `notes text null`

> Keep `loyalty_ledger` reserved for points deltas; promo instruments are not points.

## 6) Required enums / configuration (v0)

### Enums
- `promo_type_enum`: `match_play`, `nonnegotiable`, `free_bet`, `other`
- `promo_coupon_status`: `issued`, `voided`, `expired`, `replaced`

### Casino settings (v0, non-accounting)
Keep this strictly in the “controls” lane:
- `promo_require_exact_match boolean` (if false, allow >= match wager)
- `promo_allow_anonymous_issuance boolean` (true by default)

> No per-casino toggles that attempt to compute accounting bases (AGR/tax). PT exports facts; finance/BI applies jurisdiction policy.

## 7) LoyaltyService RPC surface (v0)

### Issuance
- `rpc_issue_promo_coupon(p_program_id, p_face_value, p_required_match_wager_amount, p_player_id?, p_visit_id?, p_expires_at?) -> promo_coupon`
  - writes coupon
  - emits `loyalty_outbox` event `promo_coupon_issued`

### Admin / control procedures
- `rpc_void_promo_coupon(p_coupon_id, p_reason) -> void`
- `rpc_replace_promo_coupon(p_coupon_id, p_new_validation_number, ...) -> promo_coupon`
- `rpc_promo_coupon_inventory(p_program_id?, p_status?, p_date_range?) -> setof promo_coupon`
  - supports audit expectations and operational controls

### Explicitly out of scope for v0
- Coupon “redemption” RPCs that claim table attribution or settlement outcomes.
- Any clearance ingestion workflow (reserved for Phase 2+).

## 8) How this feeds shift dashboards (exposure-based, **non-settlement**)

Shift rollups add a **promo exposure lens** (separate from cash KPIs):

**Issued (known)**
- `promo_issued_count`
- `promo_face_value_issued_amount`
- `promo_at_risk_issued_amount`
- `promo_type_breakdown` (jsonb)

**Outstanding (uncleared) (honest)**
- `promo_outstanding_uncleared_count`
- `promo_outstanding_face_value_amount`
- `promo_outstanding_at_risk_amount`

Where:

- `outstanding_uncleared = issued - (voided + expired + replaced)`

> Note: “Outstanding (uncleared)” does **not** mean “unused”. It means PT has no clearance signal.
> In v0, it is expected that “outstanding” may remain outstanding indefinitely inside PT.

## 9) Alert rules enabled (rule-based)

Rule-based alerts that stay in-scope:

- “High promo issuance rate” (spike vs baseline)
- “Excessive replacements/voids” (control integrity)
- “Approaching expiry volume” (exposure aging)

Avoid alerts that require settlement/reconciliation.

## 10) Definition of Done (closing the gap)

1. New tables added and RLS-scoped (casino_id).
2. Issuance, void, replacement flows implemented with auditability.
3. Shift rollups updated to include promo exposure + outstanding (uncleared).
4. Integration tests:
   - expiry/voiding/replacement
   - match amount validation (policy-controlled)
   - rollup correctness for promo metrics
5. Dashboard/report surfaces promo summaries separately from cash KPIs.

## 11) Resolved questions (v0 decisions)

- **Settlement outcomes (push/win/lose):** out of scope for v0.
- **Player/visit binding:** coupons may be tied to player/visit **or** issued anonymously.
- **Accounting policy toggles (presented drop / AGR / tax reporting):** out of scope for v0.

### What is AGR?
**AGR** commonly refers to **Adjusted Gross Revenue** (or similar “adjusted” revenue base used for reporting/tax), which varies by jurisdiction and house policy.

PT will not calculate AGR. PT will only produce promo instrument facts (issued/voided/expired/replaced/outstanding).
Downstream finance/BI systems (or a future Phase 2+ workflow) may apply jurisdictional policy.

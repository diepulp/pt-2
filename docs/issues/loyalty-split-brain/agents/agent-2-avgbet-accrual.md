# Agent 2 — Average-Bet → Accrual Recomputation / Immutability of Settled Points

**Angle:** Rating-slip telemetry (`average_bet`) → loyalty accrual recomputation and the immutability of settled points.
**Method:** split-brain-authority taxonomy (10 fractures, S0–S5), provenance test, cure routing. Read-only diagnosis.
**Branch:** `epson`. **Date:** 2026-06-21.

---

## 1. Angle Summary

Headline symptom under test: *"adjusting the average bet on a rating slip MUTATES and RESETS the points already accrued."*

**Verdict up front:** The **settled ledger is immutable** — `loyalty_ledger` is hard append-only (RLS `deny_update USING(false)` / `deny_delete USING(false)`, plus a business-uniqueness index that blocks re-minting). Editing `average_bet` cannot, and does not, overwrite a posted `base_accrual` row. The reported "reset" is **not** a true authority mutation of settled points.

What IS real and is the genuine fracture: the **theoretical-loss (`theo`) basis is recomputed live from the current `rating_slip.average_bet` column at every read and at close, because the value the system *calls* an immutable snapshot (`policy_snapshot.loyalty`) deliberately omits `avg_bet`.** So the "accrued" number an operator sees *before close* (the Session Reward Estimate) and the materialized `computed_theo_cents` *at close* both move when avg_bet is edited. This is **Projection Drift + Authority Ambiguity over a mislabeled snapshot**, not ledger mutation.

---

## 2. Exact Mechanism of the Average-Bet "Reset" (traced)

### 2a. The theo formula reads LIVE avg_bet, with snapshot as a no-op fallback

`calculate_theo_from_snapshot` (`supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql:15-48`):

```
v_avg_bet := COALESCE((p_loyalty_snapshot->>'avg_bet')::numeric, p_slip_record.average_bet, 0);  -- L31
v_theo := v_avg_bet * (v_house_edge/100) * v_duration_hours * v_decisions_per_hour;               -- L39
```

The function *prefers* `snapshot.avg_bet`, falling back to the live slip column.

### 2b. The snapshot NEVER captures avg_bet — every build path omits it

Every `policy_snapshot.loyalty` construction stamps only policy params (house_edge, decisions_per_hour, points_conversion_rate, point_multiplier, policy_version) and **never `avg_bet`**:

- Rollover / resume slip build: `supabase/migrations/20260117170000_fix_resolve_slip_context_policy_snapshot.sql:131-146` (`avg_bet` absent).
- Move-player new-slip build: `supabase/migrations/20260307114918_adr039_close_slip_materialize_theo.sql:356-364` (`avg_bet` absent).

Because `snapshot->>'avg_bet'` is always NULL, the `COALESCE` at L31 **always falls through to the live `p_slip_record.average_bet`**. The snapshot's prefix-branch is dead code. The single most volatile telemetry input is read live every time.

### 2c. Editing avg_bet writes the live column with no snapshot/ledger coupling

`updateAverageBet` (`services/rating-slip/crud.ts:577-589`) is a plain table update:

```
.from('rating_slip').update({ average_bet: averageBet }).in('status', ['open','paused'])
```

Route: `app/api/v1/rating-slips/[id]/average-bet/route.ts:39-89` (PATCH, open/paused only). It touches neither `policy_snapshot` nor `loyalty_ledger`. So the new avg_bet immediately changes what every downstream `calculate_theo_from_snapshot` consumer computes.

### 2d. Two live consumers move when avg_bet changes

1. **Pre-close estimate (read-only):** `evaluate_session_reward_suggestion` (`...prd004_loyalty_rpcs.sql:766-825`) is `STABLE`, recomputes `v_theo := calculate_theo_from_snapshot(v_slip,...)` from the **current** slip each call → `suggested_points`. UI renders it in the modal as **"Session Reward Estimate … Based on current session activity"** (`components/modals/rating-slip/rating-slip-modal.tsx:824-854`, value at `:843-845`). Shown only for `open`/`paused` slips. This is the number that "resets" as the operator edits avg_bet — by design for an estimate, but easily misread as accrued points because it sits directly beneath the loyalty balance block (`:573-574`, `:811-819`).
2. **At-close materialization:** `rpc_close_rating_slip` recomputes theo with `v_result.average_bet := COALESCE(p_average_bet, v_result.average_bet)` then writes `computed_theo_cents` (`...adr039_close_slip_materialize_theo.sql:109-137`); `rpc_move_player` mirrors it (`:370-392`). So the final avg_bet edit at close determines the materialized theo.

### 2e. The settled ledger is immutable (the "reset" stops at close)

`rpc_accrue_on_close` (`...prd004_loyalty_rpcs.sql:57-251`) fires only on `status='closed'` (`:149-151`), is idempotent on `(casino_id, rating_slip_id, reason='base_accrual')` (`:117-136` early-return; business-uniqueness index `ux_loyalty_ledger_base_accrual` at `20251213003000_prd004_loyalty_service_schema.sql:117-119`), and inserts a row whose `metadata.calc.avg_bet` is frozen (`:202`). Append-only is enforced by RLS: `loyalty_ledger_deny_update FOR UPDATE USING (false)` and `loyalty_ledger_deny_delete FOR DELETE USING (false)` (`...service_schema.sql:225-233`). **No RPC updates or deletes a posted ledger row.** Post-close, avg_bet edits are blocked by `updateAverageBet`'s `.in('status',['open','paused'])` filter (`crud.ts:587`, surfaced as `RATING_SLIP_INVALID_STATE`).

**Net mechanism:** avg_bet is an authoritative *input* whose effect on "points" is a **live recompute** that is correct-by-design only while the slip is open, but the basis for that recompute is mislabeled as an immutable `policy_snapshot`. Once accrued, points are immutable.

---

## 3. Findings Table

| ID | Title | Fracture type(s) | Severity + rationale | Provenance verdict | Evidence (file:line) | Cure pattern | Route-to |
|---|---|---|---|---|---|---|---|
| **AB-1** | `policy_snapshot.loyalty` omits `avg_bet`; theo silently reads live slip column | Authority Ambiguity + Projection Drift | **S3** — a value named "snapshot" is not point-in-time for its most volatile input; propagates to estimate AND at-close materialization; directive-worthy before loyalty liability enters financial reporting | Claimed immutable snapshot fact; actually a live recompute from current telemetry → **fails provenance** | `...20251213010000_prd004_loyalty_rpcs.sql:31`; snapshot builds `...20260117170000_...:131-146`, `...20260307114918_...:356-364` | Single-formula-owner: snapshot must capture `avg_bet` at accrual time (or theo basis must be a declared live-input model, not labeled a snapshot) | financial-model-authority + RatingSlip/Loyalty SRM owners |
| **AB-2** | Pre-close "Session Reward Estimate" recomputes on every avg_bet edit, adjacent to balance | Projection Drift (contained) | **S2** — correct for an estimate; risk is operator misread as accrued. Labeled "estimate / based on current session activity," so contained | Estimate correctly labeled as projection; provenance OK *given the label* | `evaluate_session_reward_suggestion` `...rpcs.sql:766-825`; UI `rating-slip-modal.tsx:824-854` | Surface labeling (already largely present); keep estimate visually separated from settled balance | RatingSlip/Loyalty surface owners |
| **AB-3** | At-close `computed_theo_cents` uses last live avg_bet; no record that prior estimate differed | Authority Ambiguity | **S2** — final value is legitimately the close-time avg_bet; ambiguity is only that there is no captured-at-accrual avg_bet to audit against the snapshot label | Final theo is a deterministic close-time computation; acceptable IF avg_bet is declared an authoritative close-time input | `...20260307114918_...:109-137` (close), `:370-392` (move) | Same as AB-1: capture avg_bet into the frozen basis; `metadata.calc.avg_bet` already freezes it post-accrual | Loyalty SRM owner |
| **AB-4** | Settled `base_accrual` immutability (NOT a fracture — refutes the headline) | n/a (control) | **S0** | Stored immutable fact; passes provenance | append-only RLS `...service_schema.sql:225-233`; uniqueness `:117-119`; idempotent return `...rpcs.sql:117-136` | none — preserve | n/a |
| **AB-5** | `reversal` reason defined but no RPC → no correction model for a wrong-avg_bet accrual | Lifecycle Ambiguity | **S2** — once accrual is wrong (e.g. avg_bet fat-fingered before close), there is no first-class correction path; only admin `rpc_reconcile_loyalty_balance` (recompute-from-sum, not a corrective entry) | Correction lifecycle undefined | `services/loyalty/dtos.ts:38`; reconcile RPC `...rpcs.sql:834-916` | Define append-only reversal/adjustment RPC (no in-place edit) | financial-model-authority |

---

## 4. Is it (a), (b), or (c)? — Verdict

**Primary: (c)** — *accrual/theo is recomputed from current slip state rather than from an immutable snapshot captured at accrual time.* The snapshot exists and is named as the authority basis (ADR-019 D2, "CANONICAL SOURCE: policy_snapshot.loyalty"), but it omits `avg_bet`, so `calculate_theo_from_snapshot` always recomputes from the live `rating_slip.average_bet`. Evidence: `...rpcs.sql:31` COALESCE fallback + snapshot builds omitting `avg_bet` (`...20260117170000_...:131-146`, `...20260307114918_...:356-364`).

**Secondary: (a)** — a **live projection/preview** (`evaluate_session_reward_suggestion` → "Session Reward Estimate") is rendered immediately beneath the loyalty balance and moves on every avg_bet edit. It IS correctly labeled an estimate (`rating-slip-modal.tsx:833,848-851`), which contains the risk, but its adjacency to `currentBalance` is the most likely source of the operator's "my accrued points reset" perception.

**Explicitly NOT (b)** — there is **no** re-run/upsert that replaces a prior ledger entry. `loyalty_ledger` is append-only by RLS (`deny_update`/`deny_delete USING(false)`), `base_accrual` is single-row-per-slip and idempotent, and post-close avg_bet edits are rejected (`crud.ts:587`). The headline "mutates and RESETS the points already accrued" is **refuted for settled points**; it is true only for the *pre-close live estimate* and the *not-yet-materialized* close-time theo.

---

## 5. Open Questions

1. **Intended model for avg_bet in theo:** Is `average_bet` meant to be an authoritative *close-time* input (then `policy_snapshot` is misnamed and should not imply avg_bet is frozen), or should accrual freeze a time-weighted/at-accrual avg_bet into the snapshot? This is the load-bearing decision and belongs to financial-model-authority. Note `final_average_bet` exists (`20251214044205_add_missing_rating_slip_columns.sql:6`) and is set at close — is it the intended frozen basis?
2. **Operator perception vs. reality:** Confirm with UX whether the reported "reset" is the Session Reward Estimate (open-slip, by-design) being read as accrued balance. If so, AB-2 is a surface-separation fix, not a data fix.
3. **Mid-session avg_bet volatility:** A single avg_bet field is overwritten on each edit (no time-weighting); a player who raises their bet late gets theo computed as if the higher bet applied for the whole session. Is that an accepted simplification or a separate accuracy gap? (Adjacent to, but distinct from, the split-brain.)
4. **Correction path (AB-5):** When loyalty liability enters financial reporting, a wrong settled accrual has no reversal RPC. Should `reversal` be implemented as an append-only corrective entry before that milestone?
5. **Cross-check with remediation-surface §2.2:** That entry flags Loyalty primarily as *propagation* (accrual writes ledger but emits no outbox). This angle adds the *intra-aggregate* snapshot-vs-live theo basis fracture, which §2.2 does not name. Both should be folded into the Loyalty SIGP register.

---

### Severity roll-up
S3×1 (AB-1, snapshot omits avg_bet), S2×3 (AB-2/AB-3/AB-5), S0 control (AB-4). No S4/S5: settled points are immutable, so there is no current production trust break or compliance hazard on *posted* rewards — the hazard is latent and activates if (i) the snapshot label is trusted as audit basis, or (ii) loyalty liability enters financial reporting without a correction model.

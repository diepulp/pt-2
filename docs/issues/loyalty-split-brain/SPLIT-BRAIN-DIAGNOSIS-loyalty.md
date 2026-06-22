# Loyalty Service — Consolidated Split-Brain Diagnosis

> **Status:** Diagnostic (SIGP-style). Candidate register entry **SIGP-003 (Loyalty)**.
> **Method:** 6 parallel `split-brain-authority` agents, each one angle. Per-angle reports in `./agents/`.
> **Scope:** LoyaltyService + its producers (RatingSlip telemetry, promo, manual, mid-session) + its consumers (Player-360, shift report, measurement, comp/entitlement panels, receipts).
> **Date:** 2026-06-21 · **Branch:** `epson`
> **Routing:** `financial-model-authority` (fact-class, valuation contract, outbox), `tia-canon-authority` (not implicated), SRL (vocabulary), Loyalty SRM owner, rls-expert/ADR-040 (attribution).

---

## 0. One-paragraph verdict

Loyalty is **one disease expressed in three layers**. (1) **Temporal/authority** — a "snapshot rule" was codified and correctly applied to the *accrual conversion rate*, but never inherited by the *valuation rate*, by *theo's avg-bet input*, or by the *balance cache*; so several settled/held facts are silently recomputed from mutable live inputs. (2) **Propagation** — `loyalty_outbox` predates the Wave 2 transactional-outbox canon; producers are bifurcated (accrual = ledger-only, promo = outbox-only) and **no consumer/relay exists**. (3) **Semantic** — no SRL bindings, overloaded vocabulary, disjoint reason-vs-event taxonomies, and a deprecated reason vocabulary that still mints into the canonical column. The decisive escalation: `rpc_snapshot_loyalty_liability` already feeds the **shift-report PDF**, so the valuation + cache fractures are **already load-bearing (S4), not latent**.

---

## 1. The two reported symptoms — reconciled against the code

### Symptom A — "Editing the valuation rate at `/admin/loyalty/economics` retroactively re-prices accrued points." → **CONFIRMED (S4)**

There are **two unnamed point↔money rates**:
- **Accrual rate** (`points_conversion_rate`) — *correctly pinned* at slip close into `rating_slip.policy_snapshot` and stamped on the ledger (`supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql:166,201`).
- **Valuation rate** (`cents_per_point`, `loyalty_valuation_policy`, PRD-053/ADR-039) — **versioned in storage** (`effective_date`, `version_identifier`, `is_active`) but **every projection reads only `is_active = true`**, discarding the version axis (`services/loyalty/crud.ts:642-661`; `hooks/loyalty/use-loyalty-queries.ts:199-211`; `services/measurement/queries.ts:250-256`).

`rpc_snapshot_loyalty_liability` computes `SUM(balance) × is_active rate` and **UPSERTs on `(casino_id, snapshot_date)`** (`supabase/migrations/20260307115101_adr039_rpc_snapshot_loyalty_liability.sql:56-59,69-77,99-104`). Re-running after a rate edit re-prices the identical held-point pool. The fix is already named in the vision doc as the "snapshot rule" (`docs/00-vision/LoyaltyService_Points_Policy_PT-2.md:38`) — it was applied to accrual and never to valuation.

### Symptom B — "Adjusting average bet on a rating slip resets the points already accrued." → **RE-SCOPED: refuted for *settled* points; confirmed for the *open-session estimate* (S3)**

Posted rewards do **not** mutate:
- `loyalty_ledger` is hard append-only — RLS `deny_update`/`deny_delete USING(false)` (`supabase/migrations/20251213003000_prd004_loyalty_service_schema.sql:224-233`).
- Business-uniqueness `ux_loyalty_ledger_base_accrual` + idempotent early-return in `rpc_accrue_on_close` (`...20251213010000...:117-136`).
- Post-close `average_bet` edits are **rejected** (`services/rating-slip/crud.ts:587`).

What actually moves is the **live theo recompute on the open slip**. `calculate_theo_from_snapshot` reads `COALESCE(snapshot->>'avg_bet', slip.average_bet, 0)` (`...20251213010000...:31`) — but **every** `policy_snapshot.loyalty` builder **omits `avg_bet`** (`supabase/migrations/20260117170000_*.sql:131-146`; `20260307114918_*.sql:356-364`), so theo **always** falls through to the *live* slip column. The snapshot's pinning branch is dead code, and the open-slip "Session Reward Estimate" (`evaluate_session_reward_suggestion` → `components/modals/rating-slip/rating-slip-modal.tsx:824-854`) re-prices as you edit.

> **✅ Verified empirically (2026-06-21).** Reproduction test `services/loyalty/__tests__/symptom-b-avgbet-immutability.int.test.ts` drives the **real** `accrueOnClose` + `updateAverageBet` against local Supabase. Result (4/4 pass):
> 1. **App path blocked** — `updateAverageBet` on a closed slip throws `RATING_SLIP_INVALID_STATE`.
> 2. **Worst case can't move settled points** — forcing `average_bet` to 5× at the DB level (bypassing the guard) and re-running accrual with a *new* idempotency key returns `is_existing=true`, leaves exactly **one** `base_accrual` row, points **unchanged**, balance unchanged. The lock is the partial unique index `ON CONFLICT (casino_id, rating_slip_id) WHERE reason='base_accrual'` — keyed on the *slip*, not the idempotency key.
> 3. **Forward accrual still honors avg_bet** — a fresh slip at 5× bet accrues 5× points.
>
> **Conclusion: settled/closed-slip accrued points are immutable; Symptom B cannot occur on a closed slip via any path.** What an operator sees move is the **open/active-slip live estimate** (AB-1 / L-07 below) — a forward-looking preview, not settled points. The remaining defect is *labeling*: the estimate reads like it is "resetting accrued points." If you ever observe the number change on an **already-closed** slip, re-open this item — that would contradict the test and indicate an unfound path.

**Both symptoms are the same fracture class:** a value presented as settled/authoritative is actually recomputed from a mutable live input that should have been pinned.

---

## 2. Consolidated fracture register (deduped across all 6 angles)

Severity = propagation danger (S0 local → S5 production trust break). **S3+ needs a Canonicalization Directive before broad rollout; S4+ blocks dependent implementation.**

| ID | Fracture | Type(s) | Sev | Status | Evidence (file:line) | Cure |
|----|----------|---------|-----|--------|----------------------|------|
| **L-01** | Valuation projection is point-in-time-blind; liability snapshot re-prices held points | Authority Ambiguity + Projection Drift | **S4** | **Live** (feeds shift report) | `20260307115101...:56-77`; `crud.ts:642-661`; `use-loyalty-queries.ts:199-211` | Cure B: single-formula-owner + **as-of versioned** lookup; snapshot already stores `valuation_policy_version`/`valuation_effective_date` — render the rate that produced the figure |
| **L-02** | Liability `$` = `SUM(current_balance) × live rate` → cache drift **and** rate drift both flow into a reported money figure; widget shows pinned `$` beside a separately-fetched live rate (contradiction by construction) | Projection Drift + Surface Misrepresentation | **S4** | **Live** | `20260307115101...:69-77`; `services/measurement/queries.ts:242-257`, `mappers.ts:285-292`; `components/measurement/loyalty-liability-widget.tsx:60-89` | Pin valuation + sum ledger truth; carry as-of to render |
| **L-03** | Balance aggregate split-brain: ledger SUM *declared* authoritative but **every** surface reads the `current_balance` cache; equality enforced by RPC arithmetic only — no constraint/trigger | Aggregate Split-Brain | **S3** | Contained (drift invisible) | declared `20251213003000...:174-178`; cache reads `crud.ts:452-503`, `rating-slip-modal.tsx:573`, `loyalty-panel.tsx:146`, `comp-confirm-panel.tsx:89` | Single-owner read-time derivation (pagination index already supports `SUM`) |
| **L-04** | Drift detector is **dead code** — MV `mv_loyalty_balance_reconciliation` never REFRESHed, never read, cron never built | Aggregate Split-Brain (detect-not-prevent) | **S3** | Latent | `20251213003000...:303-314`; only DDL + REVOKE `20260403202555:102` | Prevent (constraint/trigger) or scheduled reconcile + alert |
| **L-05** | Undefined reversal/correction model: ledger immutable + "use reversal entries", but `reversal` is enum/DTO/Zod only — **no RPC, zero call sites**; corrections forced into `manual_reward`/`adjustment` misuse | Lifecycle Ambiguity + Authority Ambiguity | **S4** | Active hazard | `20251213003000...:224-229`; `services/loyalty/dtos.ts:38`; `schemas.ts:32` | `rpc_reverse_ledger_entry` (compensating row + atomic cache update) |
| **L-06** | Pre-Wave-2 outbox; producer split total (accrual=ledger-only, promo=outbox-only); **no consumer/relay/claim/drain**; missing canonical envelope (`event_id` UUIDv7, `fact_class`, `origin_label`, `aggregate_id`, immutability trigger); SEC-011 left table authenticated-facing | Propagation Ambiguity | **S4** | Contained (no consumer to mislead) | `20251109214028...:79-92`; `20260206005335...:32-41`; Wave 2 canon `20260511134129...`; matrix in `agents/agent-3-outbox-propagation.md §4` | Transactional outbox: accrual emits same-txn; adopt `fact_class`/`origin_label`; unify taxonomy with ledger reason codes |
| **L-07** | Theo snapshot omits `avg_bet` → theo always recomputed from live slip column; snapshot pinning branch is dead code (Symptom B mechanism) | Authority Ambiguity + Projection Drift | **S3** | Contained | `20251213010000...:31`; snapshot builders `20260117170000...:131-146`, `20260307114918...:356-364`; `services/rating-slip/crud.ts:577-589` | Capture `avg_bet` into frozen basis at accrual, or stop labeling it a snapshot |
| **L-08** | Second contradictory reason vocabulary: `MidSessionRewardReason` carries 4/5 values marked WRITE-PROHIBITED; `mid-session-reward.ts` defaults `p_reason ?? 'mid_session'`, minting a deprecated reason into the canonical column; RPC inserts raw `loyalty_reason` with no DB guard | Vocabulary Overload | **S4** | Active hazard | `dtos.ts:316-321`; prohibited list `20251213000830...:97-101,162`; default `services/loyalty/mid-session-reward.ts:58`; raw insert `adr024_loyalty_rpcs.sql:1055,1146` | Canonical reason taxonomy + DB CHECK/enum guard; resolve open Q (is mid-session RPC dead?) |
| **L-09** | Spoofable `p_staff_id` → `staff_id` in `rpc_issue_mid_session_reward` — the exact pattern ADR-040 removed from redeem/manual_credit | Attribution Ambiguity (identity regression) | **S3–S4** | Latent (RLS may override) | `adr024_loyalty_rpcs.sql:1051,1140-1146` | ADR-040 derivation from context; or drop the RPC |
| **L-10** | `loyalty_ledger` has **no `gaming_day` column**; accrual gaming-day is `created_at` wall-clock — violates TEMP-002/PRD-027 | Attribution Ambiguity | **S3** | Latent | schema `20251213003000`; cf. `reference_temporal-authority-stack` | Add `gaming_day`, derive via `useGamingDay()`/canonical chain |
| **L-11** | Surface cluster: Player-360 header passes `currentBalance` default **0** + enrollment string as `currentTier` → comp drawer shows wrong balance / false overdraw, while same component renders correctly in the modal | Surface Misrepresentation + Projection Drift | **S3** | Live (operator-facing) | `components/player-360/.../player-360-header-content.tsx:539-551`; default `issue-reward-button.tsx:73`; correct `rating-slip-modal.tsx:815-816` | Pass authoritative balance/tier; single source |
| **L-12** | CompConfirmPanel recomputes `ceil(amountCents/centsPerPoint)` and `balance − cost` client-side — surface owns redeem math it should only render | Surface Misrepresentation | **S3** | Live | `components/loyalty/comp-confirm-panel.tsx:88-89` | Render server-computed values; don't recompute owned math |
| **L-13** | Provenance dropped at render: balance/suggestion DTOs hold `updatedAt`/`policyVersion` but strip them; PDF labels snapshot "Dollar Liability" with no as-of; fabricated `'bronze'` tier for null | Surface Misrepresentation | **S2** | Live | `dtos.ts:103-121,356-383`; `reports/shift-report/sections/loyalty-liability.tsx:53`; `loyalty-panel.tsx:141` | Carry source/authority/as-of to boundary (exemplars exist: `entitlement-confirm-panel.tsx:103-135`, `print-outcome-badge.tsx`) |
| **L-14** | Vocabulary overload, none SRL-bound: "reward", "comp", "credit", "theo", "points/cents"; ledger reason codes and outbox `event_type`s are disjoint vocabularies for the same events | Vocabulary Overload (semantic crack) | **S2** | Latent | only `SRL-TIA-001` exists; `agents/agent-6-producers-vocabulary.md §3` | SRL semantic roots bound to Loyalty SRM owner + linter |
| **L-15** | No authority class on ledger rows: theo-*estimated* accrual and *actual* redeem/credit sum into one balance with the estimate/actual distinction invisible (only the read DTO wraps theo) | Authority Ambiguity | **S2** | Latent | `mappers.ts:218`; `mappers.ts:285-292` | Stamp fact class on the row (aligns with L-06 outbox `fact_class`) |

---

## 3. The cross-cutting thread (the actual root cause)

**Most issues are semantic, not computational — the arithmetic is mostly right; the labels lie about authority, provenance, or completeness.**

```
            "snapshot rule" codified  ──applied──▶  accrual conversion rate ✓ (pinned)
                                       │
                                       └──NOT inherited──▶ valuation rate   ✗  L-01/L-02
                                                          theo avg_bet     ✗  L-07
                                                          balance cache    ✗  L-03/L-04
```

One bounded context (Loyalty) **owns** the formula for points and their value, but:
- it never finished propagating the pin-at-event discipline to its later-added rates/inputs (temporal layer → L-01, L-02, L-07);
- it caches the aggregate and lets the cache, not the ledger, be the read truth, with no prevention (aggregate layer → L-03, L-04, L-15);
- it predates the outbox canon and so cannot reliably tell consumers *what happened* (propagation layer → L-06, L-08, L-14);
- it never registered its vocabulary, so "reward/comp/credit/theo/points" mean different things in different files (semantic layer → L-08, L-14).

This matches `references/remediation-surface.md §2.2` (CONFIRMED: Propagation + Authority Ambiguity) and **extends it** with the intra-aggregate snapshot-vs-live theo fracture (L-07) and the valuation point-in-time-blindness (L-01) that §2.2 did not name.

---

## 4. Containment status — what changes the priority

§2.2 rates Loyalty "contained today" and "urgent when loyalty liability enters financial reporting." **That condition is already partially met:** `rpc_snapshot_loyalty_liability` → measurement widget **and the shift-report PDF**. So **L-01, L-02, L-05** are not latent — they are live in an operator/management-facing money surface. That promotes Loyalty above its §2.4 rank for the valuation/liability slice specifically.

---

## 5. Disposition (SIGP outputs)

1. **Canonicalization Directive (resolve before any further loyalty-liability reporting work):** the **valuation/liability path** — L-01, L-02, L-05. As-of versioned valuation + ledger-truth sum + a real reversal RPC. Route: `financial-model-authority` (valuation contract + fact-class).
2. **Risk Register entries with containment:** L-03/L-04 (balance cache + dead detector), L-06 (outbox — contained only while no consumer exists; do **not** add a consumer that reads loyalty_outbox until the envelope is canonical), L-07 (theo snapshot), L-08/L-09 (mid-session reason + spoofable staff — resolve the "is the RPC dead?" question first; dropping it kills both), L-10 (gaming_day).
3. **Semantic clearance blockers:** L-14 (SRL bindings) + L-11/L-12/L-13 (surface-truth) — fold into a loyalty surface-rendering-contract pass.
4. **Sequencing match (both exemplars):** diagnostic → exemplar proof → producer expansion → consumer/surface migration. The cheapest proving slice is **L-01/L-02** (as-of valuation; no transport needed — Cure B, single-formula-owner). The structural slice is **L-06** (transactional outbox; Cure A — but only when liability genuinely needs propagation).

> **Containment rule while fractures are open:** do not connect any consumer to `loyalty_outbox`, do not add new surfaces that recompute point value client-side, and do not introduce a third balance representation. Surface the fracture; do not worship it.

---

## 6. Per-angle source reports

| Angle | Report |
|-------|--------|
| Valuation authority & retroactive re-valuation | `agents/agent-1-valuation-authority.md` |
| Avg-bet → accrual recompute / immutability | `agents/agent-2-avgbet-accrual.md` |
| Outbox vs Wave 2 exemplar (propagation) | `agents/agent-3-outbox-propagation.md` |
| Balance-cache vs ledger + reversal | `agents/agent-4-balance-reversal.md` |
| Consumers & render surfaces | `agents/agent-5-consumers-surface.md` |
| Producers, vocabulary & attribution | `agents/agent-6-producers-vocabulary.md` |

---

## 7. Open questions for the owner

1. ~~**Symptom B on closed slips?**~~ **RESOLVED 2026-06-21** — reproduction test confirms settled points are immutable on closed slips (see Symptom B §1). The live open-slip estimate is the only thing that moves; treat as a labeling fix (L-07).
2. **Is `rpc_issue_mid_session_reward` dead?** If yes, dropping it eliminates L-08 + L-09 at once.
3. **Does any current consumer already treat the liability snapshot as settlement/financial truth?** If yes, L-01/L-02 escalate to S5.
4. **Should valuation be as-of-event-pinned (snapshot the rate onto each accrual) or as-of-date-versioned (render via policy version)?** The snapshot table already carries the version columns — favors the lighter as-of-versioned cure.

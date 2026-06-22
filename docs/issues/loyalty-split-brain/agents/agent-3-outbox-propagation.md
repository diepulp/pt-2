# Agent 3 — Loyalty Outbox vs Wave 2 Transactional-Outbox Exemplar (Propagation Ambiguity)

**Domain:** Loyalty (`services/loyalty/`, `loyalty_outbox`, `loyalty_ledger`, `player_loyalty`)
**Fracture angle:** Propagation Ambiguity — events transported without a stable category or consumer contract.
**Mode:** Read-only diagnosis. Route-to: `financial-model-authority` (transport substrate, Wave 2 contract owner).
**Date:** 2026-06-21 · Branch: `epson`

---

## 1. Angle Summary

`loyalty_outbox` was built (2025-11-09) **before** the Wave 2 transactional-outbox exemplar was canonized (2026-05-11), so it predates the canonical contract entirely. It is a legacy `event_type`/`payload`/`processed_at`/`attempt_count` placeholder that the Wave 2 transform explicitly classified as the *"legacy zero-producer placeholder"* shape and replaced for `finance_outbox` — but the same transform was **never applied to `loyalty_outbox`**. The result is a confirmed structural propagation split (remediation-surface §2.2):

- **Accrual/redemption writes the ledger but emits NO outbox event.** `rpc_accrue_on_close` inserts `loyalty_ledger` + reads `player_loyalty.current_balance`; never touches `loyalty_outbox`. Same for `rpc_redeem`, `rpc_manual_credit`, `rpc_apply_promotion`, `rpc_issue_mid_session_reward`.
- **Promo emits an outbox event but writes NO ledger entry.** `rpc_issue_promo_coupon` / `rpc_void_promo_coupon` / `rpc_replace_promo_coupon` INSERT into `loyalty_outbox` (4-column subset); coupons live in `promo_coupon`; `loyalty_outbox.ledger_id` is nullable precisely *"for promo events"*.

Two producers, two disjoint propagation mechanisms, one domain — and **no consumer at all**. The provenance test fails: a downstream consumer cannot deterministically know *what happened* (no event-id ordering authority) or *in what category* (no `fact_class`/`origin_label`). The README documents an outbox contract ("Mutations append to `loyalty_outbox` in same transaction; Worker drains via FOR UPDATE SKIP LOCKED; Retry…+ dead-letter") that **does not exist in code** — a documentation-vs-reality split layered on top of the structural split.

---

## 2. Canonical Wave 2 Contract (with evidence)

The exemplar `finance_outbox` (cure: **Transactional Outbox**, cure-patterns.md §1) establishes:

- **Same-transaction, literal emit.** Authoring write + outbox INSERT in one transaction inside the SECURITY DEFINER RPC. `supabase/migrations/20260511134129_wave2_finance_outbox_transform.sql:135-137` — *"SECURITY DEFINER RPCs (rpc_create_financial_txn, rpc_record_grind_observation) insert rows directly within their transactions."*
- **Caller-supplied UUIDv7 `event_id` PK = relay + replay ordering authority.** `…transform.sql:56-58` — *"NOT via DEFAULT — caller must supply. UUIDv7 ordering is the relay + replay authority."*
- **Immutable `fact_class` (`ledger`|`operational`), CHECK-constrained.** `…transform.sql:63-65`.
- **Immutable `origin_label` (`actual`|`estimated`|`observed`|`compliance`); never upgraded.** `…transform.sql:67-69` — *"Travels unchanged through relay + consumer. No code path may upgrade 'estimated' to 'actual'."*
- **`aggregate_id` = PK of authoring row** (provenance back-pointer). `…transform.sql:76-78`.
- **Envelope immutability enforced by trigger.** `fn_finance_outbox_immutable_envelope` blocks UPDATE on all envelope columns. `…transform.sql:106-131`.
- **At-least-once relay via claim RPC** (delivery_attempts/last_attempted_at/last_error). `…transform.sql:86-91`; `rpc_claim_outbox_batch` (`20260511134531_…:12`); `rpc_acknowledge_outbox_delivery` (`20260518014252_…:27`).
- **Idempotent, projection-only consumer** dedup via `processed_messages` receipt (`20260511134418_wave2_processed_messages.sql`); UNIQUE `(event_id, casino_id)`.
- **RLS hardening — service_role only.** No authenticated policies; `GRANT … TO service_role` (`…transform.sql:134-138`); SEC-011 revokes all authenticated DML (`20260523034116_sec011_revoke_authenticated_outbox_table_access.sql:26-37`).
- **Proven by symmetric Class-A + Class-B pair** under I1–I4 harness (cure-patterns.md §1, §5).

---

## 3. Loyalty-Outbox-vs-Canonical Gap Table

| Contract item | Canonical (`finance_outbox`) | Loyalty (`loyalty_outbox`) | Gap | Sev |
|---|---|---|---|---|
| Same-transaction emit | Ledger write + outbox INSERT in one RPC txn | **Accrual/redeem/credit emit nothing**; only promo emits (and promo writes no ledger) | Disjoint producers; ledger mutations never propagate | **S3** |
| Event ordering authority | Caller-supplied UUIDv7 `event_id` PK (`:56-58`) | `id uuid DEFAULT gen_random_uuid()` — random, no ordering (`20260206005335_…:33`; types `:1323`) | No deterministic relay/replay order | S3 |
| `fact_class` | NOT NULL CHECK `ledger`/`operational` (`:63-65`) | **Absent** (types `:1318-1327`) | Consumer cannot know authority class | **S3** |
| `origin_label` | NOT NULL CHECK, immutable in transit (`:67-69`) | **Absent** | No provenance; cannot resolve actual vs estimated | **S3** |
| `aggregate_id` provenance | NOT NULL, PK of authoring row (`:76-78`) | Only `ledger_id` (nullable; NULL for all promo events) (`20260206005335_…:35`) | Promo events have no authoring back-pointer | S2 |
| Envelope immutability | Trigger blocks envelope UPDATE (`:106-131`) | Only append-only REVOKE + denial RLS for authenticated (`20260206005335_…:114-125`); no envelope trigger | Owner can mutate envelope; weaker than canonical | S2 |
| At-least-once relay | `rpc_claim_outbox_batch` + delivery_attempts/last_error (`:86-91`) | `attempt_count` column exists but **no claim RPC, no relay** (grep: zero hits) | Counter present, never incremented; no transport | **S4** |
| Idempotent projection-only consumer | `processed_messages` receipt, UNIQUE `(event_id,casino_id)` | **No consumer of any kind** (grep claim/relay/drain/consume = 0) | Events accumulate; `processed_at` always NULL (test `:247`) | **S4** |
| Dead-letter | last_error VARCHAR(2000) (`:90`) | **Absent** (README claims it; code has none) | No failure surface | S2 |
| RLS hardening | service_role-only; SEC-011 revoke (`sec011…:26-37`) | authenticated SELECT/INSERT RLS policies retained; **SEC-011 did NOT touch loyalty_outbox** | Transport surface still authenticated-facing | S2 |
| Symmetric pair / parity proof | Class A + B land together, I1–I4 | None | No invariant harness | S2 |

---

## 4. Producer Propagation Matrix

| Write RPC | Migration (file:line) | Writes `loyalty_ledger`? | Emits `loyalty_outbox`? |
|---|---|---|---|
| `rpc_accrue_on_close` | `20260318131945_snapshot_rounding_policy.sql:182` (insert `:284`) | **YES** | **NO** |
| `rpc_redeem` | `20260307114447_adr040_loyalty_identity_derivation.sql:24` | **YES** | **NO** |
| `rpc_manual_credit` | `20260307114447_…:226` | **YES** | **NO** |
| `rpc_apply_promotion` | `20260304172336_prd043_d2_remove_loyalty_p_casino_id.sql:199` | **YES** | **NO** |
| `rpc_issue_mid_session_reward` | `20260304172335_prd043_d1_remove_p_casino_id.sql:738` | **YES** | **NO** |
| `rpc_issue_promo_coupon` | `20260106235611_loyalty_promo_instruments.sql:244` (emit `:392`); role-gated dup `20260319010843_…:12` (emit `:170`); cadence dup `20260406013926_…:44` (emit `:203`) | **NO** (writes `promo_coupon`) | **YES** |
| `rpc_void_promo_coupon` | `20260106235611_…:464` (emit `:532`) | **NO** | **YES** |
| `rpc_replace_promo_coupon` | `20260106235611_…:596` (emit `:706`) | **NO** | **YES** |

**The asymmetry is total and structural:** every ledger-writing RPC emits nothing; every outbox-emitting RPC writes no ledger. The two halves of the loyalty domain propagate through entirely disjoint mechanisms, and neither half has a consumer. Promo outbox payloads are hand-built `jsonb_build_object` blobs with `correlation_id` but **no `fact_class`/`origin_label`** — a consumer would have to infer category from `event_type` string + payload shape, which cure-patterns.md §1 explicitly forbids (*"Inference is forbidden"*).

---

## 5. Findings

| ID | Title | Fracture type | Severity + rationale | Evidence (file:line) | Cure | Route-to |
|---|---|---|---|---|---|---|
| L3-001 | Accrual/redemption write ledger, emit no outbox | Propagation Ambiguity | **S3** — ledger mutations (the authority facts) silently fail to propagate; drift activates the moment any consumer is added or loyalty liability enters financial reporting | `20260318131945_…:284` (ledger insert, no outbox); matrix §4 (5 RPCs) | Transactional Outbox — make every ledger-writing RPC emit same-txn with `fact_class`/`origin_label` | financial-model-authority |
| L3-002 | Promo emits outbox, writes no ledger; disjoint mechanism | Propagation Ambiguity + Aggregate Split-Brain | **S3** — one domain split across two non-overlapping propagation paths; promo liability lives only in `promo_coupon` + a payload blob | `20260106235611_…:392,532,706`; `ledger_id` nullable `20260206005335_…:35` | Unify event taxonomy with ledger reason codes; single propagation substrate | financial-model-authority |
| L3-003 | No consumer / relay / claim / drain for loyalty_outbox | Propagation Ambiguity | **S4** — events accumulate forever, `processed_at` always NULL; the documented "Worker drains via FOR UPDATE SKIP LOCKED" does not exist. (Pairs with the dead Outbox Relay GAP noted for finance in prod.) | grep claim/relay/drain/consume = 0 hits; test asserts `processed_at` NULL *"no consumer has processed it"* `promo-outbox-contract.int.test.ts:247` | Idempotent projection-only consumer + `processed_messages`-style receipt | financial-model-authority |
| L3-004 | No `event_id`/`fact_class`/`origin_label`/`aggregate_id` envelope | Propagation Ambiguity + Authority Ambiguity | **S3** — provenance test fails: consumer cannot determine what/category deterministically; forces forbidden payload-shape inference | types `:1317-1347` (full Row shape); contrast `20260511134129_…:56-78` | Adopt Wave 2 envelope columns + immutability trigger | financial-model-authority |
| L3-005 | README documents an outbox contract that does not exist | Surface Misrepresentation (doc-layer) | **S2** — README claims same-txn append, FOR UPDATE SKIP LOCKED drain, retry + dead-letter, <100 pending SLO; none implemented. Misleads future builders into assuming propagation works | `services/loyalty/README.md:106-119` vs code reality | Suppress/correct doc until transport exists (honesty rule, cure-patterns §5) | financial-model-authority |
| L3-006 | loyalty_outbox not hardened to service_role-only | Propagation Ambiguity (transport RLS) | **S2** — SEC-011 hardened `finance_outbox` but left `loyalty_outbox` with authenticated SELECT/INSERT policies; transport surface remains authenticated-facing | `sec011_…:26-37` (finance only); `20260206005335_…:74-92` (authenticated policies retained) | Apply SEC-011-equivalent revoke when transport lands | financial-model-authority |
| L3-007 | `reversal` reason defined but no RPC; correction model undefined | Lifecycle Ambiguity | **S2** — corroborates remediation-surface §2.2; an undefined reversal path means any future outbox event taxonomy has no compensation category | `services/loyalty/dtos.ts:38` (`'reversal'`) | Define reversal RPC + reason mapping before unifying taxonomy | financial-model-authority |

**Overall severity: S4** (driven by L3-003 absent transport + L3-001/002 structural producer split). Per the SIGP threshold, **S3+ requires a Canonicalization Directive before broad rollout; S4 blocks implementation** of any feature that would make loyalty liability a financial-reporting input until the producer split is closed. Today the fracture is **contained** — drift is detectable (balance drift MV), promo liability is not yet in financial reporting, and there is no consumer to be misled. It becomes acute the moment (a) a consumer is wired, or (b) loyalty liability enters financial reporting.

---

## 6. Open Questions

1. **Was `loyalty_outbox` ever meant to carry accrual events?** PRD-028 restored it *only* for the three promo RPCs ("Three promo RPCs INSERT into this table"). Is accrual propagation a missing requirement, or was accrual deliberately ledger-only with a different propagation plan? (financial-model-authority)
2. **Does the dead Outbox Relay (finance, prod) cover loyalty at all,** or is loyalty propagation entirely unbuilt? Evidence says unbuilt (no claim RPC), but confirm against the relay deployment topology.
3. **What is the canonical `fact_class` for loyalty?** Points are an explicit envelope carve-out (§6.3 in dtos.ts:147-168); `theo` is `estimated`. If loyalty liability is a `ledger` fact, the producer split must be closed under ADR-052 Class-A rules (player_id NOT NULL). financial-model-authority owns this end-state.
4. **Promo coupon as liability** — `promo_coupon.face_value_amount` is real money exposure propagated only as a payload blob with no `origin_label`. Should promo issuance be a Class-A/Class-B fact, or stay a non-financial operational event? (Determines whether this is S3 or escalates.)
5. **Symmetric-pair obligation:** if loyalty adopts the outbox, does it need a Class-A (accrual liability) + Class-B (promo observational) pair landed together, mirroring the Wave 2 parity rule, to avoid collapsing promo into the ledger class?

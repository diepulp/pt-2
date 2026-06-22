# Lane Report — SPLIT-BRAIN ROUTING (Loyalty + Rating-Slip Seams)

> **Lane:** Split-Brain Routing. Loyalty (`active_remediation`), Rating Slip (`contingent_dependency`), Visit (`mapping`), cross-domain seams.
> **Method:** Converts the existing `SPLIT-BRAIN-DIAGNOSIS-loyalty.md` (L-01..L-15) into propagation-map nodes/edges. Did **not** re-diagnose. New evidence added only for the cross-domain seam transaction-boundary (close→accrual atomicity).
> **Authority posture:** This lane NAMES fractures and ROUTES. It does not re-decide financial valuation or TIA end-states. Route targets: `financial-model-authority` (valuation contract, fact-class, outbox), `tia-canon-authority` (telemetry→TIA only), SRL (vocabulary), Loyalty SRM owner, rls-expert/ADR-040 (attribution).
> **Date:** 2026-06-21 · **Branch:** `epson`

---

## 0. Headline findings

1. **The Rating-Slip → Loyalty accrual seam is the most fractured edge in the lane and is NOT covered by any L-XX.** The §9 seam-contract target (close → freeze basis → invoke accrual → ledger+outbox atomic → return settled) is fully violated. Accrual is a **client-orchestrated, fire-and-forget, non-atomic** call with errors silently swallowed (`hooks/rating-slip-modal/use-close-with-financial.ts:131-145`; `use-move-player.ts:289`). `rpc_close_rating_slip` does **not** invoke accrual (`supabase/migrations/20260129100000_perf005_close_rpc_inline_duration.sql` — body has no accrue/loyalty reference). New node `seam_rs_close_accrual`, severity **S4** (silent accrual loss on close = operator-invisible reward omission).
2. Loyalty's 15 fractures collapse to **3 layers**: temporal/authority (L-01/L-02/L-07), aggregate (L-03/L-04/L-15), propagation+semantic (L-06/L-08/L-14). Two are **already live S4** on a management money surface (shift-report PDF): L-01, L-02, L-05.
3. **Rating Slip preliminary read: OUTCOME C-leaning (between B and C).** The close→accrual seam is not a mere boundary defect; it shows the ingress boundary cannot atomically supply a downstream domain. Two seams (`seam_rs_close_accrual`, `seam_rs_modal_estimate`) MUST be certified before any loyalty outbox/propagation slice.

---

## 1. Loyalty Canonical Authority Inventory (§6.1)

| Authored fact | Canonical owner | DTO / envelope | Correction rule | Temporal posture | Permitted consumers | Forbidden competing owners |
|---|---|---|---|---|---|---|
| Loyalty point movement | `loyalty_ledger` (append-only; RLS `deny_update`/`deny_delete USING(false)`, `20251213003000...:224-233`) | `SettledLoyaltyMovementDTO` (target) | compensating row only — **reversal RPC ABSENT (L-05)** | `event_time_pinned` | balance projection, liability projection, outbox | any surface subtracting/mutating balance |
| Loyalty balance | **declared** ledger SUM (`20251213003000...:174-178`) but **de facto** `current_balance` cache (L-03) | `LoyaltyBalanceDTO` (target) | derive at read OR atomic governed projection | `current_operational_state` | Player-360, modal, panels | `current_balance` direct reads (L-03 surfaces) |
| Loyalty liability | `rpc_snapshot_loyalty_liability` (`20260307115101...`) | `LoyaltyLiabilitySnapshotDTO` (target, §12 strategy) | superseding snapshot w/ provenance | **MUST be** `as_of_date_versioned`; **IS** point-in-time-blind (L-01) | shift-report PDF, measurement widget | `is_active`-only valuation reads (L-01/L-02) |
| Point valuation rate | `loyalty_valuation_policy` (versioned: `effective_date`/`version_identifier`/`is_active`) | as-of lookup (target) | new policy version | `as_of_date_versioned`; **IS** `is_active`-only (L-01) | liability projection only | any projection reading `is_active=true` to value held points |
| Accrual conversion rate | `rating_slip.policy_snapshot` (pinned at close, `20251213010000...:166,201`) | pinned ledger stamp | n/a (immutable) | `event_time_pinned` ✓ (the ONE correct exemplar) | accrual RPC | — |
| Reversal / correction | **NONE — absent (L-05)** | absent (enum/DTO/Zod only: `dtos.ts:38`, `schemas.ts:32`) | undefined → forced into `manual_reward`/`adjustment` misuse | undefined | — | `manual_reward`/`adjustment` as unnamed reversal |

---

## 2. Loyalty Producer Inventory (§6.2)

| Producer | Entry surface | RPC / command | Auth table | Outbox | Classification | L-XX | Disposition |
|---|---|---|---|---|---|---|---|
| Accrual on close | rating-slip close (client orchestrated) | `rpc_accrue_on_close` | `loyalty_ledger` | **none** | `ledger_only` | L-06, L-07 | emit same-txn outbox (Phase 4); pin `avg_bet` basis |
| Promo issuance | promo flow | promo RPC | — | **outbox only** | `outbox_only` | L-06 | add ledger write; unify taxonomy |
| Manual reward | reward drawer | manual reward RPC | `loyalty_ledger` | none | `legacy_authoring` | L-08 | canonical reason guard |
| Mid-session reward | (scaffold; may be dead) | `rpc_issue_mid_session_reward` | `loyalty_ledger` | none | `dead_candidate` / `blocked_by_anchor_resolution` | L-08, L-09 | **resolve "is it dead?" first** — deletion kills L-08+L-09 |
| Redemption | comp/redeem panel | redeem RPC | `loyalty_ledger` | none | `legacy_authoring` | L-12 | server-owned redeem math; settled movement |
| Reversal | — | **absent** | — | — | `dead_candidate` (not built) | L-05 | build `rpc_reverse_loyalty_ledger_entry` (Phase 2) |

**Anchor regression (L-09):** `rpc_issue_mid_session_reward` accepts spoofable `p_staff_id` (`adr024_loyalty_rpcs.sql:1051,1140-1146`) — the exact pattern ADR-040 removed. `canonical_but_uncertified_workflow` at best; `dead_candidate` preferred.

---

## 3. Loyalty Consumer Inventory (§6.3)

| Consumer | Value | Current source | Canonical source | Recompute? | Provenance? | Classification | L-XX | Disposition |
|---|---|---|---|---|---|---|---|---|
| Shift-report PDF liability section | liability $ | live snapshot, no as-of label, fabricated `'bronze'` (`reports/shift-report/sections/loyalty-liability.tsx:53`) | as-of snapshot DTO | no (reads snapshot) but snapshot itself re-prices | **drops as-of** | `legacy_projection_consumer` + `surface_misrepresentation` | L-01, L-13 | migrate to as-of snapshot DTO; render rate+version+as-of |
| Measurement liability widget | liability $ + rate | pinned $ beside separately-fetched **live** rate (contradiction) (`components/measurement/loyalty-liability-widget.tsx:60-89`; `services/measurement/queries.ts:242-257`) | one snapshot identity | yes (live rate) | partial | `surface_misrepresentation` | L-02 | render single snapshot; no separate live rate fetch |
| Player-360 header / comp drawer | balance, tier | `currentBalance` default **0** + enrollment string as tier (`player-360-header-content.tsx:539-551`; `issue-reward-button.tsx:73`) | balance DTO | no | fabricates 0/tier | `surface_misrepresentation` + `client_recompute` | L-11 | pass authoritative balance/tier |
| Comp-confirm panel | point cost, post-redeem balance | `ceil(amountCents/centsPerPoint)` + `balance − cost` **client-side** (`comp-confirm-panel.tsx:88-89`) | server redemption quote | **yes** | no | `client_recompute` (AP-7) | L-12 | render server-computed quote |
| Loyalty panel | balance, tier | `current_balance` cache + fabricated tier (`loyalty-panel.tsx:141,146`) | balance DTO | no | strips `updatedAt`/`policyVersion` | `legacy_projection_consumer` | L-03, L-13 | canonical DTO; no fabrication |
| Rating-slip modal balance | balance | `current_balance` cache (`rating-slip-modal.tsx:573`) | balance DTO | no | no | `legacy_projection_consumer` | L-03 | canonical balance DTO |
| Rating-slip modal **estimate** | open-slip reward | `evaluate_session_reward_suggestion`, live theo recompute (`rating-slip-modal.tsx:824-854`) | `LiveRewardEstimateDTO` labeled live | **yes (by design)** | not labeled "estimate" | `surface_misrepresentation` (labeling) | L-07 | label as live estimate; basis-as-of |
| Receipts | settled reward | (consumes accrual result) | settled movement DTO | no | partial | `migration_target` | L-13 | settled movement DTO |

---

## 4. Cross-Domain Seam Inventory (§6.4) — the ten-question answers

### SEAM 1 — Rating Slip close → Loyalty accrual (`seam_rs_close_accrual`) — **the §9 contract; S4; NEW (no L-XX)**

| # | Question | Answer |
|---|---|---|
| 1 | What fact crosses? | request to settle accrual for a closed slip |
| 2 | Command/fact/estimate/projection-input? | **command** (should freeze basis + settle) |
| 3 | Identity anchors? | `ratingSlipId`, `casinoId`, `playerId` (null for ghost) |
| 4 | Frozen values? | accrual conversion rate IS pinned (`policy_snapshot`, ✓); **avg_bet is NOT** (L-07) — basis incomplete |
| 5 | Live values? | avg_bet falls through to live slip column (L-07) |
| 6 | Idempotency owner? | client passes `slipId` as key; RPC dedupes via partial unique index on `(casino_id, rating_slip_id) WHERE reason='base_accrual'` (slip-keyed, robust) |
| 7 | Sync / txn / outbox? | **Async fire-and-forget, separate RPC, NOT in close txn** (`use-close-with-financial.ts:131-145`). Close commits; accrual may silently never run. |
| 8 | Authority labels surviving? | none — no fact_class, no settled flag carried |
| 9 | Failure behavior? | **errors swallowed** (`.catch(() => {})`); accrual loss is invisible to operator |
| 10 | Who may correct? | nobody — no reversal model (L-05); a missed accrual has no compensation path |

**Verdict:** target contract (atomic ledger+outbox commit, settled result returned) is fully unmet. This is the lane's top-priority seam-certification target.

### SEAM 2 — Rating Slip modal → reward estimate (`seam_rs_modal_estimate`) — Symptom B / L-07; S3

| # | Answer |
|---|---|
| 1 | open-slip reward suggestion | 2 | **estimate** (live) | 3 | `ratingSlipId`, player, table | 4 | none (live by design) | 5 | avg_bet, theo, valuation all live | 6 | n/a (no settlement) | 7 | synchronous recompute on edit | 8 | should carry `live`/`settled:false` — currently absent | 9 | recompute on input change | 10 | n/a |

**Verdict:** mechanism correct (estimate SHOULD be live); defect is **labeling** — reads like settled points reset. Settled points proven immutable (`services/loyalty/__tests__/symptom-b-avgbet-immutability.int.test.ts`, 4/4 pass). Cure: `LiveRewardEstimateDTO` with `estimate_status:'live'`.

### SEAM 3 — Rating Slip → PFT (`seam_rs_pft`) — finance-agent owned; loyalty-relevant flow only

| # | Answer (loyalty-relevant) |
|---|---|
| 1 | financial transaction (buy-in/cash) | 2 | authored fact | 3 | `ratingSlipId`, `visitId`, `playerId`, `casinoId` | 4–7 | **defer to financial-model-authority** | 8 | fact_class/origin_label (Wave 2) | 9–10 | finance-owned |

**Note:** shares the same identity-anchor set as the accrual seam. The close orchestration co-issues a pit-cash observation (`use-close-with-financial.ts` createPitCashObservation, also `amountKind:'estimate'`, idempotency `chips-taken-${slipId}`) — same non-atomic client-orchestration pattern. Map for identity-anchor consistency; **detail deferred to finance lane.**

### SEAM 4 — Loyalty ledger → balance (`seam_ledger_balance`) — L-03/L-04; S3

| # | Answer |
|---|---|
| 1 | aggregate balance | 2 | projection input → projection | 3 | `playerId`, `casinoId` | 4 | none | 5 | balance (recomputed continuously) | 6 | RPC arithmetic only (no constraint/trigger) | 7 | synchronous SUM **declared** but cache read in practice | 8 | "authoritative" label lies (cache, not SUM) | 9 | drift silently invisible; MV detector dead (L-04) | 10 | ledger owner only |

**Verdict:** Aggregate split-brain. Ledger SUM declared authoritative; every surface reads `current_balance`; no enforcement. Dead MV `mv_loyalty_balance_reconciliation` (`20251213003000...:303-314`).

### SEAM 5 — Loyalty ledger → liability (`seam_ledger_liability`) — L-01/L-02; **S4 LIVE**

| # | Answer |
|---|---|
| 1 | liability $ valuation | 2 | projection (dated) | 3 | `casinoId`, `snapshot_date` | 4 | **should** freeze balance@cutoff × policy@cutoff; **freezes neither** | 5 | balance (cache) + valuation rate (`is_active`) both live | 6 | UPSERT on `(casino_id, snapshot_date)` — re-run re-prices | 7 | synchronous recompute | 8 | "Dollar Liability" label implies settled — it re-prices | 9 | rate edit retroactively re-prices held pool | 10 | loyalty owner |

**Verdict:** point-in-time-blind. Snapshot table already carries `valuation_policy_version`/`valuation_effective_date` — favors as-of-versioned cure (Cure B). **Already load-bearing via shift-report PDF.**

### SEAM 6 — Loyalty → shift report (`seam_loyalty_shift_report`) — L-13 (+ inherits L-01); S2 surface, S4 underlying

| # | Answer |
|---|---|
| 1 | liability section + tier | 2 | projection render | 3 | `casinoId`, gaming-day | 4 | (inherits snapshot) | 5 | (inherits snapshot live rate) | 6 | n/a | 7 | render | 8 | **drops** as-of/version; fabricates `'bronze'` for null | 9 | renders stale/unlabeled figure | 10 | n/a |

**Verdict:** provenance dropped at render boundary. PDF labels "Dollar Liability" with no as-of (`loyalty-liability.tsx:53`).

### SEAM 7 — Rating Slip → telemetry (`seam_rs_telemetry`) — NOTE only; TIA lane owns telemetry→TIA

Rating-slip close emits pit-cash observations (`amountKind:'estimate'`) into the telemetry/financial-observation path. **Telemetry→TIA aggregation is owned by `tia-canon-authority`.** Mapped here only as an outbound edge from the rating-slip ingress; do not certify in this lane.

---

## 5. L-XX → Node Crosswalk

| L-XX | Sev | Node ID(s) | Edge(s) |
|---|---|---|---|
| L-01 | S4 | `loyalty_liability_snapshot`, `loyalty_liability_shift_report` | `seam_ledger_liability` |
| L-02 | S4 | `loyalty_liability_widget`, `loyalty_liability_snapshot` | `seam_ledger_liability` |
| L-03 | S3 | `loyalty_balance_cache`, `loyalty_panel`, `rs_modal_balance`, `comp_confirm_panel` | `seam_ledger_balance` |
| L-04 | S3 | `loyalty_balance_reconciliation_mv` (dead) | `seam_ledger_balance` |
| L-05 | S4 | `loyalty_reversal_rpc` (absent) | `seam_rs_close_accrual` (no correction path) |
| L-06 | S4 | `loyalty_outbox`, `producer_accrual`, `producer_promo` | (intra-domain; future propagation edges) |
| L-07 | S3 | `producer_accrual`, `seam_rs_modal_estimate` | `seam_rs_close_accrual`, `seam_rs_modal_estimate` |
| L-08 | S4 | `producer_mid_session`, `producer_manual_reward` | — |
| L-09 | S3–S4 | `producer_mid_session` | — |
| L-10 | S3 | `loyalty_ledger` (no gaming_day) | — |
| L-11 | S3 | `player360_header`, `comp_drawer` | — |
| L-12 | S3 | `comp_confirm_panel` | `seam_ledger_balance` |
| L-13 | S2 | `loyalty_liability_shift_report`, `loyalty_panel`, `receipts` | `seam_loyalty_shift_report` |
| L-14 | S2 | (all loyalty nodes — SRL unbound) | — |
| L-15 | S2 | `loyalty_ledger` (no fact_class) | aligns w/ L-06 outbox fact_class |

---

## 6. Rating Slip Escalation — preliminary read (§10)

**Preliminary outcome: between B (internally fractured) and C (systemic ingress problem) — leaning C.**

Evidence:
- The close→accrual seam is **not a boundary-only defect** (which would be Outcome A). The ingress boundary cannot atomically supply a downstream domain: close commits in its own RPC txn, accrual is a separate fire-and-forget client call whose failure is invisible (`use-close-with-financial.ts:131-145`). The same non-atomic client-orchestration pattern also drives the PFT/pit-cash observation in the same hook — i.e. the ingress boundary supplies **multiple** downstream domains (loyalty, finance/telemetry) through the **same** unsafe client-side fan-out.
- That multi-downstream-via-unsafe-fan-out signature is the §10 Outcome C tell ("cannot safely supply multiple downstream domains without a broader ingress standard").
- It is not yet confirmed C because Rating Slip's own lifecycle/authority (open/closed) appears single-owned (close RPC rejects post-close edits, `crud.ts:587`); the fracture is at the orchestration/seam, not (yet evidenced) in RS's internal lifecycle. That keeps B on the table.

**Decision rule:** the focused RS split-brain review (after loyalty-facing seams repaired) should test whether the unsafe client fan-out is loyalty-specific (→ B) or a general ingress property across finance+telemetry+loyalty (→ C). The pit-cash co-orchestration is early evidence for C.

**Seams that MUST be certified first (before any loyalty propagation/outbox slice):**
1. `seam_rs_close_accrual` — make close→accrual atomic (or transactionally durable via outbox-on-close), no silent loss. **Top priority.**
2. `seam_rs_modal_estimate` — label estimate as live; freeze basis at close.

---

## 7. Visit domain (`mapping`)

Visit consumes loyalty/financial **summaries** at the visit aggregate level. It is a `mapping`-status node: it is an identity provider (`visitId`) traveling on the accrual and PFT seams (anchor on `seam_rs_close_accrual`, `seam_rs_pft`), and a downstream consumer of financial summaries (defer summary detail to finance/visit lanes). No loyalty authority is owned by Visit. Map it as: identity-anchor provider (visitId) + financial-summary consumer; no competing loyalty owner.

---

## 8. Proof Obligations (§14) for the loyalty exemplar slices

| Proof class | Liability slice (L-01/02/05) | Balance+reversal slice (L-03/04/05) | Outbox slice (L-06) | Seam slice (close→accrual) |
|---|---|---|---|---|
| 14.1 Mechanism | as-of policy lookup deterministic | ledger-SUM = balance; reversal nets zero | same-txn outbox insert (reuse Wave 2 I1–I4) | atomic/durable close→accrual |
| 14.2 Producer capability | snapshot RPC idempotent on (casino,date,policy) | `rpc_reverse_loyalty_ledger_entry` valid inputs | accrual emits ledger+outbox | close path settles accrual on valid slip |
| 14.3 Workflow certification | real shift-report run supplies cutoff+policy | real reversal workflow supplies original-entry id | real close supplies anchors+emits | **real operator close does not silently drop accrual** (current: FAILS) |
| 14.4 Consumer certification | shift-report renders snapshot rate+version+as-of, no live fetch | all surfaces read one balance DTO | consumer projection-only, idempotent | modal shows settled vs estimate distinctly |
| 14.5 Suppression | `is_active`-only valuation reads removed | `current_balance` direct reads removed; dead MV deleted-or-activated | no ledger-only/outbox-only producers remain | client fire-and-forget accrual path removed |

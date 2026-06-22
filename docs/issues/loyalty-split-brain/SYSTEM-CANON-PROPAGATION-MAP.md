# System Canon Propagation Map

> **Status:** Proposed (initial system-wide audit)
> **Date:** 2026-06-21 · **Branch:** `epson`
> **Directive:** [`SYSTEM-CANON-PROPAGATION-MAP-DIRECTIVE.md`](./SYSTEM-CANON-PROPAGATION-MAP-DIRECTIVE.md)
> **Machine-readable register:** [`SYSTEM-CANON-PROPAGATION-REGISTER.yaml`](./SYSTEM-CANON-PROPAGATION-REGISTER.yaml) ← source of truth
> **Method:** 3 parallel authority agents — `/tia-canon-authority`, `/financial-model-authority`, `/split-brain-authority`
> **Lane reports:** [`LANE-TIA.md`](./propagation-map/LANE-TIA.md) · [`LANE-FINANCIAL.md`](./propagation-map/LANE-FINANCIAL.md) · [`LANE-SPLITBRAIN.md`](./propagation-map/LANE-SPLITBRAIN.md)
> **Loyalty diagnosis source:** [`SPLIT-BRAIN-DIAGNOSIS-loyalty.md`](./SPLIT-BRAIN-DIAGNOSIS-loyalty.md) (L-01..L-15)

---

## 0. One-paragraph verdict

The system has **two strong, locally-correct exemplars** (Table Inventory Accounting, Transactional Outbox) and **one financial surface contract**, each at `standardized_pattern` maturity but only **`partial` propagation**. Every one fails the same way at the same altitude: **the mechanism is proven and the producers are mostly canonical, but the standard stops at the render boundary or at an un-migrated legacy consumer.** TIA per-session is converged but its aggregate rollup is deferred (legacy drop aggregate still live on 2 dashboards). The finance outbox authors perfectly in-transaction but its `FinancialValue` envelope is stripped before JSX everywhere except two surfaces, and the **production relay trigger has silently deviated** from the ADR-056 Vercel cron to a GitHub Actions `*/5` cron. Loyalty — the authorized first remediation — never inherited the snapshot rule it codified for accrual, so its valuation, balance cache, and theo estimate re-price from live inputs; its reversal RPC does not exist; and its outbox predates the Wave-2 canon. The decisive cross-domain finding is the **Rating Slip → Loyalty accrual seam**: it is a client-orchestrated, fire-and-forget, **non-atomic** call with errors swallowed, and the same hook fans out a non-atomic pit-cash/PFT observation — pushing Rating Slip toward **Outcome C (systemic ingress problem)**.

---

## 1. Canonical Pattern Maturity (directive §3, §5.1)

| Pattern | Maturity | Propagation | Owner | Exemplar | Gap |
|---|---|---|---|---|---|
| `tia_projection` | standardized_pattern | **partial** | TableContext.TIA | PRD-090 (LIVE) | aggregate rollup deferred (TODO-WS4); drop aggregate un-suppressed |
| `transactional_outbox` | standardized_pattern | **partial** | finance_outbox | PRD-081 / Wave 2 | render-layer strips envelope; relay trigger deviated |
| `financial_value_surface` | standardized_pattern | **partial** | FinancialValue envelope | `FinancialValue.tsx` | only 2 surfaces render labels visibly |
| `producer_anchor_resolution` | standardized_pattern | **partial** | `fn_finance_outbox_emit` | — | grind/fill/credit workflows uncertified |
| `append_only_correction` | **proven_exemplar** | incomplete | loyalty | (finance PFT is the mature instance) | loyalty reversal RPC absent (L-05) |
| `temporal_snapshot_rule` | **candidate_standard** | incomplete | loyalty | accrual-rate pin | not inherited by valuation / avg_bet / balance |

**Reading:** No pattern is yet a `propagated_standard`. Per directive §3, an exemplar is not system-wide merely because its own implementation is complete.

---

## 2. Domain Status (directive §5.2)

| Domain | Status | Note |
|---|---|---|
| **loyalty** | `active_remediation` | program SIGP-003; exercises all three patterns |
| **rating_slip** | `contingent_dependency` | ingress/orchestration seam; escalation **B-leaning-C** |
| **player_financial** | `partial_propagation` | producers canonical; consumers strip envelope; relay deviated |
| **table_context** | `partial_propagation` | per-session TIA converged; aggregate deferred |
| **mtl** | `mapped_dependency` | clean one-directional PFT→MTL derivation; never emits |
| **visit** | `mapping` | identity-anchor provider + financial-summary consumer |

---

## 3. The cross-cutting thread (root cause)

```
            proven mechanism ──▶ canonical producer ──▶ ✗ STOPS HERE
                                                          │
                  TIA:      per-session ✓ ───────────────┤── aggregate rollup deferred (legacy drop live)
                  Finance:  same-txn emit ✓ ─────────────┤── envelope stripped at render (AP-7)
                  Loyalty:  accrual-rate pin ✓ ──────────┤── valuation/balance/theo re-price live
                  Loyalty:  ledger immutable ✓ ──────────┘── reversal RPC absent; corrections misused
```

> **Most issues are semantic, not computational. The arithmetic is mostly right — the labels lie about authority, provenance, or completeness, OR the standard simply never reached the last mile (the consumer / the aggregate / the operator workflow).**

This is the feature-first pattern the directive exists to stop: a proven exemplar left as an island while adjacent producers and consumers stay unmapped.

---

## 4. Required inventories (directive §6) — where to read them

The four connected inventories are maintained in the lane reports; the register holds their distilled node/edge form.

| Inventory | Directive § | Primary lane report |
|---|---|---|
| Canonical Authority Inventory | 6.1 | each LANE file §"Authority" |
| Producer Inventory | 6.2 | LANE-FINANCIAL, LANE-SPLITBRAIN, LANE-TIA |
| Consumer Inventory | 6.3 | LANE-SPLITBRAIN (loyalty), LANE-FINANCIAL (surfaces), LANE-TIA |
| Cross-Domain Seam Inventory | 6.4 | LANE-SPLITBRAIN (the 10-question answers per seam) |

### 4.1 Mandatory seam map (directive §6.4 minimum set) — certification status

| Seam | Edge | Cert status | Owner lane |
|---|---|---|---|
| Rating Slip → Loyalty accrual | `seam_rs_close_accrual → producer_accrual` | **failing** (non-atomic, errors swallowed) | splitbrain |
| Rating Slip → PFT | `seam_rs_pft → finance_outbox` | deferred_to_finance (client-orchestrated) | financial |
| PFT → finance outbox | `pft_authoring → finance_outbox` | **certified** (I1–I5) | financial |
| Rating Slip → telemetry | `rating_slip_close → telemetry` | owned_by_tia_lane | tia |
| Telemetry → TIA | `table_buyin_telemetry → tia_accounting_service` | **certified** | tia |
| Table session → TIA session-scope | `table_session → tia_accounting_service` | certified_with_leak | tia |
| Loyalty ledger → balance | `loyalty_ledger → loyalty_balance_cache` | uncertified (no constraint) | splitbrain |
| Loyalty ledger → liability | `loyalty_ledger → loyalty_liability_snapshot` | **failing** (re-prices) | splitbrain |
| Loyalty → shift report | `loyalty_liability_snapshot → shift_report` | **failing** (no as-of) | splitbrain |
| Rating Slip modal → reward estimate | `seam_rs_modal_estimate → rs_modal_estimate` | uncertified (unlabeled live) | splitbrain |
| MTL → linked PFT adjustment | `mtl_linked_adjustment → pft_adjustment` | **certified** (one-directional) | financial |
| Visit → financial summaries | `finance_outbox → visit_class_a_projection` | certified transport / uncertified render | financial |

---

## 5. Fracture crosswalk (loyalty L-01..L-15 → nodes)

The loyalty diagnosis register is now wired into the propagation map. Full mapping in the register's `fracture_crosswalk:`. Highlights:

| L-ID | Sev | Node(s) | Disposition |
|---|---|---|---|
| L-01 | S4 | `loyalty_liability_snapshot`, `loyalty_liability_shift_report` | migrate to as-of versioned |
| L-02 | S4 | `loyalty_liability_widget`, `loyalty_liability_snapshot` | pin valuation + ledger sum |
| L-03 | S3 | `loyalty_balance_cache` + 3 surface readers | single-owner read-time derivation |
| L-05 | S4 | `loyalty_reversal_rpc` (absent), `seam_rs_close_accrual` | build reversal RPC |
| L-06 | S4 | `producer_accrual`, `producer_promo` | unify on same-txn outbox |
| L-07 | S3 | `producer_accrual`, `rs_modal_estimate`, `seam_rs_modal_estimate` | freeze basis / label live |

---

## 6. Rating Slip escalation (directive §10) — preliminary

**Outcome: B leaning C.** The close→accrual edge is not a boundary-only defect — the ingress cannot atomically supply a downstream domain (close RPC commits; accrual is a separate fire-and-forget client call with errors swallowed; `rpc_close_rating_slip` does not invoke accrual). The same hook co-orchestrates a non-atomic pit-cash/PFT observation, so one unsafe client fan-out feeds **finance + telemetry + loyalty** — the Outcome C tell. RS's internal lifecycle looks single-owned (post-close edits rejected), keeping B alive.

**Decision test:** is the unsafe client fan-out loyalty-specific (B) or general across finance+telemetry+loyalty (C)? The pit-cash co-orchestration is early evidence for **C**.

**Certify these seams before any RS canonization decision:** `seam_rs_close_accrual` (make close→accrual atomic/durable, no silent loss), then `seam_rs_modal_estimate` (label live estimate, freeze basis at close).

---

## 7. Rollout selection (directive §7) — recommended next bounded slice

```
priority = operator_visible_trust_impact × financial_or_compliance_consequence
           × propagation_breadth × mutable_input_exposure
```

**Next slice: `loyalty_liability_slice` (L-01 / L-02 / L-05).** Highest on every factor — live S4 in the shift-report PDF (operator/management-facing money figure), re-prices on a rate edit (mutable-input exposure), feeds both the widget and the PDF (breadth). It is also the **cheapest proving slice**: Cure B (single-formula-owner + as-of versioned lookup), no transport needed; the snapshot table already carries `valuation_policy_version` / `valuation_effective_date`.

**Containment rule while fractures are open:** do not connect any consumer to `loyalty_outbox`; do not add surfaces that recompute point value client-side; do not introduce a third balance representation.

---

## 8. Expansion gate (directive §13) — current standing

Horizontal expansion is permitted only when all seven hold. Status today:

| Gate | TIA | Outbox | Loyalty |
|---|---|---|---|
| 1. exemplar passes real execution proofs | ✅ per-session | ✅ mechanism | ⛔ not started |
| 2. producer + consumer nodes registered | ✅ | ✅ | ✅ (this map) |
| 3. competing paths classified | ✅ | ✅ | ✅ |
| 4. suppression/migration disposition exists | ⚠️ aggregate gap | ⚠️ no removal gate | ✅ |
| 5. seam contracts frozen | ✅ | ✅ PFT side | ⛔ RS seam failing |
| 6. next bounded slice named | ✅ WS4 | ✅ surfaces | ✅ liability slice |
| 7. inherited + re-proven invariants explicit | ✅ | ⚠️ relay deviation | ✅ |

**Neither pattern is cleared for broad horizontal expansion** until the suppression gates (TIA drop aggregate, finance bare-dollar surfaces) and the relay governance deviation are closed.

---

## 9. Forbidden rollout patterns observed (directive §15)

| Anti-pattern | Where observed |
|---|---|
| **AP-3** RPC-only certification | grind/fill/credit producers work but operator workflow unproven; relay trigger deviated |
| **AP-4** surface compatibility preservation | bare-dollar surfaces live beside `<FinancialValue>` with no removal gate; TIA drop aggregate beside suppressed win/loss |
| **AP-7** consumer self-healing | rating-slip modal recomputes net; player-360 client-recomputes cashVelocity; comp-confirm recomputes point cost; GrindBuyinPanel hides estimated/partial |

No AP-5 (map-free parallel canonization) — this audit closes that risk by mapping shared seams before any second program begins.

---

## 10. Open flags for the owner

1. **RELAY-TRIGGER-DEVIATION (S3)** — prod relay runs on GitHub Actions `*/5`, not the ADR-056 Vercel cron; removed in commit `607fdcb1` (Hobby plan limit), undocumented; PRD-086/088/089 still assert "Vercel every minute." → amend ADR-056 or restore Vercel cron.
2. **TIA-DTO-DRIFT-ADR059-D3 (S5)** — `drop_estimate_state 'absent'` ≠ canon `'none_for_session'`; completeness envelope missing `included/missing_inputs`; `source_authority.drop` uses literal table name.
3. **TIA-DROP-AGGREGATE-UNSUPPRESSED (S4)** — `estimated_drop_buyins_total_cents` survives on `secondary-kpi-stack.tsx:75` + `casino-summary-card.tsx:260`; probable casino-drop double-count at `assembler.ts:395-398`.
4. **RS-CLOSE-ACCRUAL-NONATOMIC (S4)** — `use-close-with-financial.ts:131-145` fire-and-forget accrual, errors swallowed; §9 seam contract fully unmet.

---

## 11. Required artifacts per canonization program (directive §16) — Loyalty checklist

| # | Artifact | Status |
|---|---|---|
| 1 | Split-brain diagnosis | ✅ `SPLIT-BRAIN-DIAGNOSIS-loyalty.md` |
| 2 | Canonicalization Directive | ✅ `LOYALTY-CANONIZATION-REMEDIATION-STRATEGY.md` |
| 3 | Bounded producer/consumer map | ✅ this register + LANE-SPLITBRAIN |
| 4 | Cross-domain seam contract | ⚠️ drafted (§9 directive); RS seam not frozen |
| 5 | Exemplar PRD | ⛔ pending (liability slice) |
| 6 | Real execution proof | ⛔ pending |
| 7 | Suppression + migration inventory | ✅ dispositions in register |
| 8 | Expansion plan | ⚠️ phased slices named; not authorized |
| 9 | Propagation register update | ✅ this file |
| 10 | Final convergence signoff | ⛔ pending |

---

## 12. Maintenance

This register is the coordination source of truth (directive §4). Per **directive §19**, any future PRD that introduces a financial/loyalty producer, a derived financial value, a cache, a report/dashboard consumer, a correction path, a new event type, or reads directly from a canonical authoring store **must cite this register** and declare: affected nodes, affected edges, canonical pattern used, migration/suppression disposition, proof obligations, and the register update required at completion. **A PRD lacking this block is incomplete.**

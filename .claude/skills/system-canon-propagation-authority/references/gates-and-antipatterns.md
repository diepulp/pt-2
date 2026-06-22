# Gates & Anti-Patterns Reference

The enforcement checklists. Run the one that matches the request. Each maps to a directive section; cite the section in your ruling.

## Table of contents
1. Rollout selection — picking the next domain (§7)
2. The expansion gate — authorizing horizontal expansion (§13)
3. The five proof obligations as a checklist (§14)
4. The eight forbidden rollout patterns (§15) — with tells
5. Concern lanes — every PRD declares one (§11)
6. Required artifacts per canonization program (§16)

---

## 1. Rollout selection — picking the next domain (§7)

Do **not** select by code size, defect count, or implementation convenience. Use:

```
priority = operator_visible_trust_impact
         × financial_or_compliance_consequence
         × propagation_breadth
         × mutable_input_exposure
```

Tie-breakers (favor a domain that):
- can exercise *multiple* proven patterns in one slice;
- exposes a bounded exemplar slice (not a big-bang);
- has a **live S4/S5** surface (real trust at stake now, not latent);
- is an upstream ingress boundary (unblocks many mapped nodes);
- whose remediation unblocks multiple already-mapped nodes.

Output: name the slice, show the factor reasoning, and confirm the bounded map for that slice already exists (directive §12 — a slice may begin only when all direct producers, all direct consumers, all immediate upstream identity/temporal providers, all immediate downstream projections/surfaces, and all competing paths are mapped).

*Current standing:* `rollout_recommendation` in the register names `loyalty_liability_slice` (L-01/L-02/L-05) — highest on every factor (live S4 in the shift-report PDF) and cheapest to prove (Cure B, no transport).

---

## 2. The expansion gate — authorizing horizontal expansion (§13)

Horizontal expansion is permitted **only when all seven hold**:

1. the exemplar passes real execution proofs;
2. producer and consumer nodes are registered;
3. all competing paths are classified;
4. a suppression or migration disposition exists for each;
5. cross-domain seam contracts are frozen;
6. the next bounded slice is named;
7. inherited and re-proven invariants are explicit.

If any fails, the ruling is **Blocked** — name the failing gate number. Each expansion slice must additionally **state**: new nodes added, new edges certified, inherited proof invariants, invariants requiring re-proof, legacy nodes removed/suppressed, and the map update due at completion.

*Current standing:* neither TIA nor outbox is cleared for broad expansion — gate 4 (TIA drop aggregate un-suppressed; finance bare-dollar surfaces have no removal gate) and gate 5/7 (relay trigger deviated, RS seam failing) are open. See the MAP §8 standing table.

---

## 3. The five proof obligations as a checklist (§14)

For any "is this done?" question, fill all five — a single pass on one does not satisfy another. The first class is *inherited from the slice*, the last three are what propagation *adds*:

- [ ] **mechanism** — does the canonical mechanism work? (formula / same-txn insert / as-of lookup) — **this is the slice's I1–I4 proof under `EXEMPLAR_SLICE_DISCIPLINE.md`, executed by `build-pipeline`; inherit it, do not re-run it here**
- [ ] **producer-capability** — does the RPC/service produce the right result on valid inputs?
- [ ] **workflow certification** — does the *real operator workflow* supply anchors + invoke the canonical path? *(not the same as the RPC working — see AP-3)*
- [ ] **consumer certification** — does the *real surface* render the canonical DTO without recomputing? *(see AP-7)*
- [ ] **suppression** — are competing visible paths removed/disabled/unreachable? *(see AP-4)*

A ruling that reports "done" without stating which of these five remains open is itself a violation of §14.

---

## 4. The eight forbidden rollout patterns (§15) — with tells

Scan every ruling for these. Name any present by ID; presence of AP-3/4/7 is common in PT-2 and is not a reason to pass the work.

| ID | Name | Tell — you are looking at it when… |
|---|---|---|
| **AP-1** | Ad-Hoc Exemplar Copying | a feature copies the TIA/outbox pattern but does not update the register (no §19 block) |
| **AP-2** | Domain-Local Completion Claim | a service is called standardized while its consumers still read legacy paths |
| **AP-3** | RPC-Only Certification | a producer is "propagated" because the RPC works, but the operator workflow does not supply its anchors |
| **AP-4** | Surface Compatibility Preservation | a legacy surface stays live beside the canonical one "temporarily" with no removal gate |
| **AP-5** | Map-Free Parallel Canonization | two domains begin broad remediation before their shared seams are classified |
| **AP-6** | Infrastructure-First Propagation | the outbox/transport is added before fact semantics, correction rules, and vocabulary are stable |
| **AP-7** | Consumer Self-Healing | a UI/hook reads raw stores and recomputes state to compensate for missing propagation |
| **AP-8** | Framework Prematurity | repeated governance patterns are converted into a generic runtime platform before ≥3 stable implementations prove it |

*Currently observed in the map:* AP-3 (grind/fill/credit workflows uncertified; relay trigger deviated), AP-4 (bare-dollar surfaces beside `<FinancialValue>`; TIA drop aggregate), AP-7 (rating-slip modal / player-360 / comp-confirm client recompute).

---

## 5. Concern lanes — every PRD declares one (§11)

Propagation is organized by canonical concern, not only by domain. Every remediation PRD must identify which lane it advances, which mapped nodes it changes, which remain deferred, and which proof obligations apply.

| Lane | Applies to |
|---|---|
| **Authority & Temporal Pinning** | loyalty valuation/accrual basis, rating-slip close snapshot, TIA session bounds, gaming-day attribution, historical report snapshots |
| **Aggregate Ownership** | loyalty balance, TIA projection, visit financial summaries, shift metrics, dashboard caches, liability snapshots |
| **Producer Discipline** | PFT, adjustments, loyalty accrual/redemption, grind, fills, credits, corrections |
| **Propagation** | finance outbox, loyalty outbox, relay, idempotent receipt, replay, workflow-level producer certification |
| **Surface Convergence** | rating-slip modal, Player 360, shift report, measurement widgets, pit terminal rundown, comp panels, receipts, exports |

---

## 6. Required artifacts per canonization program (§16)

No program is complete without all ten. Use as the program-level DoD:

1. Split-brain diagnosis
2. Canonicalization Directive
3. Bounded producer/consumer map
4. Cross-domain seam contract
5. Exemplar PRD
6. Real execution proof
7. Suppression and migration inventory
8. Expansion plan
9. Propagation register update
10. Final convergence signoff

*Loyalty program standing (from MAP §11):* 1–3 and 7,9 done; 4 partial (RS seam not frozen); 5,6,10 pending; 8 drafted-not-authorized.

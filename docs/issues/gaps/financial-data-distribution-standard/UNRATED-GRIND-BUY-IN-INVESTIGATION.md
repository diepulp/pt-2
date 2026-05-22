# Unrated / Grind Buy-In — Synthesis for Financial Standard Design

The investigation surfaced a **canonical governance document the earlier investigation missed** (`docs/telemetry-semantics-grind.md`, canonical, 2026-01-16). That doc fundamentally reshapes how the Financial Standard must treat grind. Below is the focused synthesis.

---

## 1. The finding that changes the prior recommendation

**`telemetry-semantics-grind.md` already defines grind as "compliance-only observation, must remain unlinked."**

Verbatim from the canonical doc:

> Identity-based grind (unrated/anonymous): No player record or player declines identification such that the session is not linkable. Compliance-only observation (e.g., MTL/CTR monitoring). No loyalty accrual. **Canonical classification: GRIND_BUYIN (must remain unlinked).**

This **contradicts draft ADR-FINANCIAL-EVENT-INGESTION-UNIFICATION D3**, which says grind must be written to PFT with `is_rated=false, txn_type='buyin'`. Per the canonical doc, grind MUST remain unlinked — pushing it into `player_financial_transaction` (which is patron-attributed by design) violates the standing classification.

**This is not a minor inconsistency. It is the central design question the Financial Standard must resolve.**

---

## 2. The fork in the road for the Standard

The Standard must pick one and document the consequences. The three viable positions:

### Position A — Grind IS financial (draft ADR's position)
- Relax PFT `player_id` to NULLABLE, add `table_id`, add `is_rated`
- Write grind to PFT; TBT becomes a projection
- **Cost:** Contradicts `telemetry-semantics-grind.md`; must supersede that doc
- **Cost:** PFT no longer means "per-player ledger"; it becomes "cash movement ledger, sometimes patron-attributed"
- **Cost:** Every downstream reader that assumes `player_id NOT NULL` (loyalty, MTL bridge, timeline, compliance panel) needs NULL-guards
- **Benefit:** Single ingestion surface; truly single financial truth; single outbox emit point

### Position B — Grind is operational telemetry (canonical doc's position, status quo)
- PFT stays patron-attributed (player_id stays NOT NULL)
- Grind stays in `table_buyin_telemetry` via `rpc_log_table_buyin_telemetry`
- Financial Standard declares two fact classes explicitly: **ledger facts** (PFT) and **operational telemetry facts** (TBT grind, pit_cash_observation)
- **Cost:** "Single financial truth" becomes "single patron-attributed financial truth"; drop variance requires joining two surfaces
- **Cost:** The draft ingestion ADR D3 must be amended to *exclude* grind
- **Benefit:** Preserves the canonical doc; no PFT schema surgery; no `player_id NOT NULL` relaxation; simpler migration
- **Benefit:** Semantically honest — grind IS observational (an operator's eyeballs on the felt), not ledgered

### Position C — Hybrid: grind gets its own ledger
- Introduce a third ledger table (`table_anonymous_buyin` or similar) that is append-only like PFT but patron-free
- Emit to `finance_outbox` from BOTH PFT and the grind ledger
- TBT becomes a projection over both
- **Cost:** Three ledgers; the user has explicitly said the goal is to *collapse* ledgers, not multiply them
- Probably wrong — listed for completeness

**My recommendation: Position B**, because it aligns with the document that already shipped as canonical, and because the investigation revealed that the "grind is financial" intuition leads to cascading NULL-guard contamination across the entire patron-attributed stack (loyalty, MTL, timeline, compliance panel).

If Position B is chosen, the previous synthesis I produced needs one major revision: **drop the `player_id` nullability migration and the `rpc_create_financial_txn` signature change for grind.** The rest of the plan (outbox, split visit_financial_summary, rating-slip modal split-brain fix, MTL wiring) stands unchanged.

---

## 3. Governance gaps the Standard must close (regardless of A/B/C)

The investigation surfaced nine divergences. These are the ones the Standard **must** resolve, not as code changes but as doc/policy changes:

| #   | Gap                                                             | Standard must declare…                                                                                                                              |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | SRM does not assign ownership of `table_buyin_telemetry`        | Owner (TableContextService is the de-facto owner; Shift Intelligence is a consumer)                                                                 |
| G2  | "Telemetry, not accounting" vs "contributes to Est. Drop KPI"   | Operational materiality is explicit: telemetry is non-authoritative for patron ledger BUT authoritative for variance/drop KPIs                      |
| G3  | No grind-to-rated promotion path                                | Retroactive attribution is forbidden OR requires a named adjustment workflow                                                                        |
| G4  | Rated/grind asymmetry (PFT→TBT vs direct-to-TBT) not documented | Either the asymmetry is canonical (Position B) or it's being unified (Position A) — say which                                                       |
| G5  | Undo as negative-amount row is an implicit convention           | Append-only reversal is a first-class primitive; document negative-amount semantics and whether second-undo is permitted                            |
| G6  | ADR-014 (ghost visits) vs TBT-grind axes not cross-referenced   | Visit-taxonomy (rated/ghost) and telemetry-taxonomy (rated/grind) are orthogonal axes; cite both                                                    |
| G7  | MTL ineligibility not formally stated                           | "Grind is excluded from MTL because CTR thresholds aggregate by patron and grind has no patron" — put this in SRM, not only in the provenance trace |
| G8  | `useGrindBuyinTotal` builds keys inline (ADR-050 E1 violation)  | Mandate factory-key compliance with a registered `tableContextKeys.grindTotal(...)` entry                                                           |
| G9  | No pit-boss operational runbook for rated-vs-grind              | Runbook required before this ships to production (Position A amplifies this — the decision surface widens)                                          |

---

## 4. Corrected input for the Financial Standard

Incorporating this investigation, the Standard should contain these sections (in addition to the Distribution Contract draft you already have):

1. **Fact class taxonomy** — Ledger fact (PFT), Compliance fact (MTL), Loyalty fact (loyalty_ledger), **Operational telemetry fact (TBT grind, pit_cash_observation)**. Four classes, not three. Operational telemetry is a distinct first-class class — it has real downstream consumers (Est. Drop variance model) and therefore deserves explicit declaration, not dismissal as "just observational."

2. **Authority vs materiality matrix** — a fact can be **non-authoritative for settlement** but **materially operational** (grind, pit_cash_observation). The Standard should separate these two dimensions so the `visit_financial_summary` UNION problem (silent blending) has a principled remediation.

3. **Grind classification decision** — pick Position A, B, or C above; state the rationale; explicitly supersede or reinforce `telemetry-semantics-grind.md`.

4. **Immutability and retroactive attribution** — state whether grind can ever be promoted to rated, and by what workflow (my read: forbid it; require a separate compensating adjustment).

5. **SRM amendments** — assign `table_buyin_telemetry` owner, declare MTL exclusion, add cross-reference to ADR-014 and ADR-050.

6. **Ops posture dependency** — the Standard is undeployable without the pit-boss runbook that distinguishes the two write surfaces. This should be listed as a blocking Definition of Done.

---

## 5. Revised implementation plan delta (if Position B is chosen)

From the earlier synthesis, drop these items:
- Migration 1 (`pft_relax_player_id_and_add_table_id`) — unnecessary
- Migration 2's `is_rated` column on PFT — unnecessary
- `rpc_create_financial_txn` signature change for grind — unnecessary
- `hooks/table-context/use-buyin-telemetry.ts:94` redirect — unnecessary
- `rpc_log_table_buyin_telemetry` does not get dropped

Keep these items:
- Outbox producer on PFT writes (unchanged)
- `visit_financial_summary` UNION removal + sibling `visit_cash_observation_summary` view
- Rating-slip modal split-brain display fix (independent)
- Compliance panel `mtlEntries` wiring (independent)
- TBT stays a real table; `fn_bridge_finance_to_telemetry` continues to write the RATED side; grind RPC continues to write the GRIND side — *but* the Standard now declares TBT's dual-source architecture as canonical rather than accidental

Net effect: **the migration scope shrinks substantially** if Position B is the Standard's answer. Only pieces of schema surgery unrelated to grind (outbox, view split) remain.

---

## Bottom line

The earlier plan assumed the draft ADR was authoritative. It isn't — the canonical grind-semantics doc already exists and takes the opposite position. Before drafting the Financial Standard, **decide whether you are superseding that canonical doc or reinforcing it.** That single decision determines whether the migration is 11 files (Position A) or 4 files (Position B) and whether the Standard's headline is "one financial ledger" or "one ledger per fact class, with declared consumption rules."
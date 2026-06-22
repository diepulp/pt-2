# Fracture Taxonomy — The Disease, Its Types, and Its Artifacts

This reference owns the **anatomy of the split-brain / semantic-crack disease**: how it arose, the ten canonical fracture types with their tells and required decisions, the legacy artifacts that still embody it, and a quote bank for crisp diagnosis.

## Table of Contents
1. Origin & Anatomy
2. The Ten Fracture Types (canonical, from SIGP §8)
3. Concrete Manifestations Observed
4. Legacy Artifact Catalog (remediation targets)
5. Quote Bank

---

## 1. Origin & Anatomy

The disease is **accreted debt from feature-first development**, not a single bad design. Each pipeline was locally correct when written; the split is an artifact of sequencing.

- *"The `rpc_shift_table_metrics` SQL was written before the shift-intelligence baseline system existed… The shift-intelligence RPCs were added later, and they compute hold % independently."* — `ISSUE-005-HOLD-SPLIT-BRAIN.md`
- A UI convenience bolts telemetry into a canonical aggregate: migration `20260218203729` added the `pit_cash_observation` UNION to `visit_financial_summary` *"to surface 'chips taken' in the modal's cash-out total."*
- The deeper truth: *"the system is not the source of financial truth"* (`DECISION-CONSOLIDATION.md` §1) — yet surfaces rendered estimates as authoritative totals.

**The governing diagnostic test** (use this first, every time):

> *"Every financial value must answer: 'Where did this number come from, exactly?' If it can't be answered deterministically, it is flagged split-brain or undefined provenance."* — `FINANCIAL-PROVENANCE-TRACE.md`

**The decisive framing:** *"most issues are semantic, not computational"* — the arithmetic is usually right; the **labels lie** about authority, provenance, or completeness. *"audit shows mislabeling is primary failure; numbers are correct but misleading; user interpretation is the real risk."* (`DECISION-CONSOLIDATION.md` §1, D6)

**Why split-brains hide:** they present under one name. Two numbers measuring different things share a label on screen, so the divergence is invisible until an operator acts on the wrong one. The system was modeled player-first; reality (anonymous grind, table-anchored cash) forced a parallel store (`table_buyin_telemetry`) that then drifted into *"shadow ledger behavior"* (`DECISION-CONSOLIDATION.md` D4).

---

## 2. The Ten Fracture Types (canonical — SIGP §8)

Use these labels in every diagnosis and Semantic Risk Register entry. For each: definition, fracture signs, and the decision required if fractured.

### Authority Ambiguity
The system does not clearly distinguish actual, estimated, observed, compliance, or derived truth.
- **Signs:** "source of truth" used casually; derived values treated as authored facts; observational data displayed as actual; totals without completeness; reconciliation implied by aggregation.
- **Decision:** define authority class, owner, correction model, and surface label.

### Aggregate Split-Brain
Two bounded contexts appear to own the same lifecycle, status, or fact.
- **Signs:** Visit and Rating Slip both claiming session lifecycle; two services computing "active" differently; a summary table acting as a source of record; a modal/route/dashboard computing state that belongs elsewhere.
- **Decision:** name the lifecycle owner, the projection consumers, and the forbidden reconstruction paths.

### Projection Drift
A derived value is computed from unstable or incomplete inputs, or in two decoupled pipelines that yield different numbers/gates.
- **Signs:** the same metric computed two ways (win/loss session-vs-shift; hold% intelligence-vs-live-metrics); projections polling authoring tables directly; completeness always unknown; replay producing different state.
- **Decision:** define inputs, ordering, lifecycle boundary, completeness rule, and replay gate.

### Surface Misrepresentation
UI/API/export can imply stronger truth than the system owns.
- **Signs:** clean totals over partial data; unlabeled estimates; "drop/settlement/final" language used prematurely; tooltip-only caveats for load-bearing uncertainty; a fabricated `complete` completeness badge.
- **Decision:** define visible label, completeness semantics, forbidden copy, rendering constraints.

### Vocabulary Overload
One term carries multiple conflicting meanings (or competing artifacts assign different canonical status to one term — the documentation-layer mirror of the disease).
- **Signs:** "financial event" used for authority facts, telemetry, and dependency events; "session" used for visit, rating slip, and UI tab state; "drop" used for custody event, posted amount, and telemetry sum; "complete" used without lifecycle ownership.
- **Decision:** retire, split, or canonize the term; add a glossary/SRL entry.

### Lifecycle Ambiguity
Open, closed, active, complete, voided, or finalized states lack a clear owner.
- **Signs:** two stores with overlapping lifecycle and no cascade; one aggregate can close while another stays open; no canonical transition boundary.
- **Decision:** name the lifecycle owner and the canonical transition boundary.

### Attribution Ambiguity
Actor, player, staff, table, casino, or gaming-day ownership is unclear.
- **Signs:** per-visit and per-table aggregates structurally non-reconcilable; attribution chain optional where it must be mandatory (or vice versa).
- **Decision:** define the required attribution chain per fact class.

### Propagation Ambiguity
Events are transported without a stable semantic category or consumer contract.
- **Signs:** overloaded event names; event payloads carrying UI envelopes; event categories inferred from payload shape; missing idempotency identity; consumers writing back to authoring stores.
- **Decision:** define event category, authoring owner, immutable fields, replay expectations, consumer limits.

### Reconciliation Leak
The system implies accounting, settlement, or external truth it does not possess.
- **Signs:** "Total Drop", shift-end settlement values, "final" money positions; aggregation presented as reconciliation.
- **Decision:** mark the value non-authoritative; expose for external reconciliation, never perform it (ADR-053 boundary).

### Domain Boundary Leak
One bounded context writes, derives, or corrects another context's authority state.
- **Signs:** a consumer writing PFT; a compliance surface authoring financial adjustments; a projection repairing missing producer data by inventing inputs.
- **Decision:** restore the boundary; consumers are projection-only.

---

## 3. Concrete Manifestations Observed

These are the canonical worked examples — use them as recognition templates.

**Win/Loss computed two ways under one label.** Session rundown (`rpc_compute_table_rundown`: `closing + credits + drop − opening − fills`, NULL until drop posted, posted-cents source) vs shift dashboard (`rpc_shift_table_metrics`: `(closing − opening) − fills + credits + estimated_drop_buyins`, non-null from shift start via par bootstrap, telemetry-sum source). *"The two numbers are measuring different things with the same label."* (`DROP-POSTURE-05-26.md`) → **Aggregate Split-Brain + Projection Drift + Vocabulary Overload.**

**Telemetry elevated to ledger truth.** `visit_financial_summary` UNIONs PFT (authoritative) with `pit_cash_observation` (non-authoritative), treating every observation row as a canonical `direction='out'` event, no dedup by `amount_kind`. *"A telemetry record is thus elevated to a financial number with no semantic fence. This is the single highest-risk split-brain in the current architecture."* (`FINANCIAL-PROVENANCE-TRACE.md` §0) → **Aggregate Split-Brain + Authority Ambiguity.**

**Unsaved client state blended into a canonical total.** `rating-slip-modal.tsx` net position = `totalCashIn − (totalChipsOut_api + pendingChipsTaken_form)` — server totals blended with unsaved Zustand form state. Doubly contaminated (telemetry-polluted summary + local form state). → **Surface Misrepresentation.**

**One buy-in recorded at two grains.** A rated buy-in writes once to PFT (per-player/visit) and once to `table_buyin_telemetry` (per-table/time) via `fn_bridge_finance_to_telemetry`; one-way; an adjustment double-fires the bridge, inflating drop estimates unless consumers dedup by ancestry. → **Propagation Ambiguity + Attribution Ambiguity.**

**"Drop" means three disconnected things.** `table_drop_event` (physical custody), `drop_total_cents` (manually posted), `estimated_drop_buyins_cents` (telemetry) — *"three disconnected drop concepts that don't talk to each other"* (`DROP-POSTURE-05-26.md`). → **Vocabulary Overload.**

---

## 4. Legacy Artifact Catalog (remediation targets)

**Tables / stores:** `visit_financial_summary` (PFT + observation UNION); `table_buyin_telemetry` (dual-source shadow ledger); `pit_cash_observation` (telemetry leaking into aggregates); three disconnected drop stores (`table_drop_event` / `table_session.drop_total_cents` / `estimated_drop_buyins_cents`).

**RPCs / triggers:** `rpc_compute_table_rundown` vs `rpc_shift_table_metrics` (two win/loss pipelines); `rpc_compute_rolling_baseline` / `rpc_get_anomaly_alerts` (third hold% pipeline); `fn_bridge_finance_to_telemetry` (one-way, double-fires on adjustment); `fn_derive_mtl_from_finance` (one-way; direct MTL inserts orphan it).

**Forbidden / non-canonical field names:** `estimated_drop_buyins_cents`, `estimated_drop_cents` (→ `telemetry_derived_drop_estimate_cents`); `win_loss_inventory_cents`, `win_loss_estimated_cents`, `win_loss_estimated_total_cents` (P0 **suppress**, not deprecate); `recorded_operational_drop_cents` (tombstoned); `source_authority.inventory` (→ `snapshots`); generic `drop_cents`, `running_drop_cents`, `drop_activity_cents`.

**UI surfaces:** `rating-slip-modal.tsx` (net position contamination); fills/credits mislabeled `'actual'` across `rundown-summary-panel.tsx`, `metrics-table.tsx`, `secondary-kpi-stack.tsx`, `pit-metrics-table.tsx`, `table-metrics-table.tsx`; `components/player-360/compliance/panel.tsx` (client-side MTL recompute).

> The two domain authority skills own the *remediated* end-state of these artifacts. This catalog is the disease inventory — verify current status against the domain skill before acting, since several entries are mid-remediation (suppressed/commented in DTOs while still live in migrations).

---

## 5. Quote Bank

1. *"Architecture fails not when data is missing, but when different truths are silently treated as the same."* — `FACT-AUTHORITY-MATRX-FIN-DOMAIN.md` §10
2. *"The two numbers are measuring different things with the same label."* — `DROP-POSTURE-05-26.md`
3. *"A telemetry record is thus elevated to a financial number with no semantic fence. This is the single highest-risk split-brain in the current architecture."* — `FINANCIAL-PROVENANCE-TRACE.md` §0
4. *"Every financial value must answer: 'Where did this number come from, exactly?'"* — `FINANCIAL-PROVENANCE-TRACE.md`
5. *"most issues are semantic, not computational."* — `DECISION-CONSOLIDATION.md` §1
6. *"player-first model caused TBT shadow system… mixing both caused shadow ledger behavior."* — `DECISION-CONSOLIDATION.md` D2/D4
7. *"Shared delivery does not mean shared authority. Shared replay does not mean shared ontology. Projection dependency does not mean financial truth."* — `PRE-WAVE-2-UBIQUITOUS-LANGUAGE-PROPOSITION.md` §10
8. *"Activity is not drop. Removal is not amount. Estimated is not final. Posted is not final. Complete inputs do not upgrade custody status."* — `TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md`
9. *"The system does not have a single 'financial truth.' It has: authoritative truth (ledger) and operational truth (observation). These must coexist — but never be confused."* — `FACT-AUTHORITY-MATRX-FIN-DOMAIN.md` §10
10. *"Surface the fracture. Do not worship the fracture."* — SIGP §15

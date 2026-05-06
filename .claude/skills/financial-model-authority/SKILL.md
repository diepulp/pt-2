---
name: financial-model-authority
description: Root authority on PT-2's global financial model overhaul. This skill is the final arbiter on conformance with ADR-052, ADR-053, ADR-054, and ADR-055. It also governs the transitional bridge DTO contract and knows the open implementation gaps.
---

# Financial Model Authority — PT-2 Pilot

You are the root authority on PT-2's global financial model overhaul. Your job is threefold:

1. **Enforce frozen decisions.** ADR-052 through ADR-055 are locked (frozen 2026-04-23). They are not patched — they are superseded via new ADRs. No implementation decision overrides them without that formal process.
2. **Provide precise implementation context.** Guide development and implementation teams so they build conformant code the first time rather than discovering violations at review.
3. **Hold the scope boundary.** Protect the pilot from accumulating accounting-domain complexity it cannot honor.

---

## The Frozen ADR Set

Four ADRs were frozen together on 2026-04-23 as an interdependent set. Violating one typically violates the others.

| ADR | Short Title | What It Governs |
|---|---|---|
| **ADR-052** | Financial Fact Model (Dual-Layer) | Two fact classes, discriminator fields, table-first anchoring, TBT reclassification |
| **ADR-053** | Financial System Scope Boundary | No authoritative totals, no reconciliation — hard pilot boundary |
| **ADR-054** | Financial Event Propagation & Surface Contract | Transactional outbox, immutable `origin_label`, surface rendering contract |
| **ADR-055** | Cross-Class Authoring Parity | Both authoring paths must have identical discipline — no "lighter" ingestion for grind |

Snapshot files: `docs/issues/gaps/financial-data-distribution-standard/decisions/`
Canonical numbered files: `docs/80-adrs/ADR-052` through `ADR-055`

Read `references/adr-registry.md` for the full compressed decision records.

---

## The Two Fact Classes — Core Mental Model

Everything downstream depends on getting this distinction right.

```
CLASS A — Ledger Financial Fact
  storage:       player_financial_transaction (PFT)
  fact_class:    'ledger'
  origin_label:  'actual'
  player_id:     mandatory (full attribution chain required)
  table_id:      mandatory
  authority:     auditable financial truth, append-only

CLASS B — Operational Financial Fact (Grind)
  storage:       table_buyin_telemetry (grind partition only)
  fact_class:    'operational'
  origin_label:  'estimated'
  player_id:     absent by construction — NULL, never populated
  table_id:      mandatory
  authority:     operational observation, non-authoritative for ledger
```

Two further classes exist in the taxonomy but are **not authored in pilot scope**:

| Label | Source | Pilot status |
|---|---|---|
| `Observed` | `pit_cash_observation` | Taxonomy only — no authoring in pilot |
| `Compliance` | `mtl_entry` | Parallel domain — never merged with the three above |

The discriminators (`fact_class`, `origin_label`) are **immutable**. Set at insert, never changed. Reclassification means a new row in the target class.

---

## Hard Rules (Non-Negotiable)

### R1 — Table-first anchoring
`table_id` is mandatory on every row in both classes. There is no player-first model. Player attribution is conditional; table context is universal.

### R2 — No cross-class derivation
Class B is never produced by projecting Class A. Class A is never produced by projecting Class B. Each is authored independently. Dual-write from PFT to the grind store is forbidden.

### R3 — Outbox is the only propagation path
Every authored event (Class A or B) emits to `finance_outbox` **within the same DB transaction** as the authoring write — one `BEGIN…COMMIT`, one `pg_current_xact_id()`. Not eventually. Not via background job. Not via post-commit trigger. Literally the same transaction boundary.

### R4 — `origin_label` is immutable in transit
A value's label travels unchanged through every consumer, projection, API response, and UI render. Consumers may not upgrade `'estimated'` to `'actual'`. Mixed-authority aggregates degrade to the lowest present, by the hierarchy: `Actual > Observed > Estimated`. `Compliance` is parallel — never merged with any other authority in a single aggregate.

### R5 — No authoritative totals
The system does not produce "Total Drop", shift-end settlement values, or any "final" money position for a table, shift, or casino. These require custody inputs (count room, inventory, cage handoffs) the system does not observe.

### R6 — No UI-driven reconciliation
The UI does not recompute financial state against authoring stores to patch staleness. Staleness is surfaced as a completeness label, never silently corrected.

### R7 — Authoring parity
Every discipline rule that applies to Class A authoring applies equally to Class B. No lighter ingestion for grind. No "Class A first, Class B catches up" rollout timing.

---

## Surface Rendering Contract

Every financial value at any system boundary — UI, API DTO, export, report — must carry all three:

```ts
{
  value: number
  type: 'actual' | 'estimated' | 'observed' | 'compliance'  // never omitted, never 'unknown'
  source: string           // e.g. "PFT", "grind", "pit_cash_observation", "mtl_entry"
  completeness: {
    status: 'complete' | 'partial' | 'unknown'   // mandatory — 'unknown' is valid, silence is not
    coverage?: number      // 0.0–1.0, optional refinement, never substitutes for status
  }
}
```

**Key rendering rules:**
- Labels must be **visible to the user** — not buried in tooltips or API-only metadata
- A surface that cannot determine completeness renders `'unknown'`, it never guesses `'complete'`
- Mixed-class surfaces must show each class separately; they may optionally show a derived total labeled as such with authority degraded per R4
- **Attribution Ratio** (`Rated / (Rated + Estimated)`) is the one permitted place Class A and B volumes are compared — as a ratio of counts/amounts, never as a merged financial total

---

## Scope Boundary — Definitive Answers

These come up repeatedly. The answers do not change without a new ADR superseding ADR-053.

| Question | Answer | Authority |
|---|---|---|
| "Can we show Total Drop?" | No. Show what was observed with completeness labels. | ADR-053 D2 |
| "Can we reconcile ledger vs reality?" | No. Expose data for external reconciliation; don't perform it. | ADR-053 D3 |
| "Can grind feed into PFT?" | No. Grind → PFT contaminates ledger semantics. | ADR-052 R3 |
| "Can TBT act as a ledger?" | No. TBT is either grind (Class B primary) or rated (projection from PFT only). | ADR-052 D3 |
| "Can we add `is_rated` to PFT to absorb grind?" | No. Explicitly rejected. Violates attribution constraints. | ADR-052 §4 |
| "Can the UI recompute to fix staleness?" | No. Render completeness; don't patch. | ADR-054 D7 |
| "Can a consumer write to PFT?" | No. Consumers are projection-only. | ADR-054 D4 |

---

## Active Bridge DTO (Transitional)

**Status:** TRANSITIONAL — owned by PRD-072 / EXEC-072  
**Affected fields:** `RecentSessionDTO.total_buy_in/cash_out/net`, `VisitLiveViewDTO.session_total_buy_in/cash_out/net`

```ts
type FinancialValueBridge = {
  value: number           // dollar-float (NOT canonical integer cents)
  type: 'actual'
  source: string
  completeness: { status: 'complete' | 'unknown' }
}
```

Bridge rules: preserve `/100` conversions; use `formatDollars(field.value)`; do not enforce `financialValueSchema`; do not canonicalize to cents.

**Sunset trigger:** Phase 1.2 Financial Data Canonicalization PRD. Retirement actions: remove `/100`, make `value` integer cents, apply `financialValueSchema`, migrate renders to `formatCents`.

Canonical target vs bridge DTO distinction: the catalog describes the destination; the active EXEC-SPEC describes the road. See `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`.

---

## Open Implementation Gaps

| Gap | Description | Severity |
|---|---|---|
| **GAP-F1** | `finance_outbox` has zero producers — outbox pattern not yet wired to PFT or grind write paths | Structural — ADR-054 is not yet enforced in code |
| **FPT-001** | FACT-LOYALTY-REDEMPTION doc misclassified as broken; implementation is correct | Doc error (INTERIM) |
| **FPT-002** | GAP-L2 accrual caller misidentified as UNKNOWN | Doc error (INTERIM) |
| **FPT-003** | `mtlEntries={[]}` not connected; `onViewHistory` unwired — reason unestablished | Doc + omission (INTERIM) |
| **FPT-004** | Trace staleness post Phase 1.1 — 4 stale findings + 1 new gap N1 | Doc staleness (INTERIM) |

GAP-F1 is the most structurally significant active gap. Any spec or implementation that assumes outbox producers exist must be flagged: that wire-up is pending.

Read `references/open-issues.md` for full gap detail.

---

## How to Engage Implementation Teams

When reviewing a PRD, EXEC-SPEC, FIB, or code, walk through this sequence:

**1. Classify the fact.** Is this authoring a Ledger fact (Class A via PFT), an Operational fact (Class B via grind), or a projection? Clarify before any other question.

**2. Check the write boundary.** Class A writes go through `rpc_create_financial_txn` or `rpc_create_financial_adjustment`. Class B writes go through the grind authoring path. Direct inserts into `player_financial_transaction` outside seed/test are non-conformant.

**3. Check outbox coupling.** Does the authoring write emit to `finance_outbox` in the same transaction? (Note GAP-F1: this is not yet implemented. If a spec assumes it is available, flag the dependency.)

**4. Check discriminator fields.** Does every row set `fact_class` and `origin_label` explicitly at insert? Are these typed as enums, not free strings?

**5. Check surface labels.** Does every financial value at the API/UI boundary carry `type`, `source`, and `completeness`? Are labels visible, not metadata-only?

**6. Check scope claims.** Does the spec claim to produce an authoritative total, perform reconciliation, or compute drop? These require superseding ADR-053 first.

**7. Check TBT usage.** Is TBT being written to via a dual-write from PFT? Is the grind partition receiving rows derived from PFT? Both forbidden.

**8. Check authority degradation.** If the surface aggregates across classes, does it degrade to the lowest authority present? Is `Compliance` rendered separately?

**9. Check FIB scope (if reviewing a FIB or pre-FIB spec).** Apply GOV-FIB-001: one primary change class, no cross-class `MUST` items, coverage mode declared, adjacent consequence ledger present. See the FIB Scope Gate section below.

Read `references/enforcement-guide.md` for the full non-conformant pattern list and conformance checklist.

---

## FIB Generation Protocol

**Applies to:** authoring a new FIB for any financial domain feature.

Financial FIBs are dual-artifact: **FIB-H** (human-readable intake brief) followed by **FIB-S** (structured schema). The pipeline order is: FIB-H → FIB-S → Scaffold → ADR → PRD → EXEC. Scaffold may not begin until both FIB-H and FIB-S are frozen.

Templates: `docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` (FIB-H form, §5) and `docs/60-release/zachman_interpolated_feature_intake_recommendation.md` (FIB-S JSON schema, §Proposed structured schema).

### Step 0 — Pre-generation gate (mandatory, non-skippable)

**Read `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md` in full before writing a single line of any FIB-H.**

The "FIB Scope Gate" section later in this skill is a navigation aid that surfaces recurring financial-domain patterns. It is not a substitute for the full guardrail. The full document owns:

- §4 — Change class classification gate (all six classes with allowed/deferred work)
- §5 — Cross-class leakage rule and the blocked rationalizations list
- §6 — All seven required blocks (one-line boundary, primary class, coverage mode with valid/invalid scope examples, layer budget with DTO classification rule, cause vs consequence split table, adjacent consequence ledger minimum requirements, atomicity test including the "ships as correct internal contract" clause)
- §7 — Ten red flags; any two require split or amendment before approval
- §9 — Accurate scope rule consistency check
- §10 — Expansion rule (allowed vs not allowed)
- §11 — Diff size sanity check thresholds
- §12 — Smell test phrases that trigger mandatory ledger review
- §13 — Full 22-item review checklist (the approval gate)

Relying on the embedded summary and filling in the details from memory is the documented failure mode. If the full document was not read, the FIB must not proceed past draft.

### FIB-H — minimum-viable sections for financial work

| Section | What it must contain |
|---|---|
| **B — Operator problem** | 1 paragraph, no architecture language, names the actor and the operational consequence |
| **D — Actor and moment** | Primary actor + when/where the feature is triggered |
| **E — Containment Loop** | 5–10 numbered steps: actor → action → system response. Becomes the positive scope boundary. |
| **G — Explicit exclusions** | Named exclusions including any adjacent financial work deliberately deferred (e.g., "canonicalization is out of scope") |
| **H — Adjacent ideas rejected** | At least two entries; one must be a cross-class or cross-phase financial consequence that was considered for this slice and deferred |
| **L — Scope authority block** | `frozen: Yes`, `downstream expansion allowed without amendment: No` |

### FIB-S — admission gates

A scaffold must be rejected if FIB-S is missing any of:

- At least one entity under `zachman.what.entities`
- At least one capability under `zachman.how.capabilities`
- At least one surface and bounded context under `zachman.where`
- At least one actor under `zachman.who.actors`
- At least one trigger event under `zachman.when.trigger_events`
- At least one rule or invariant under `zachman.why`
- `scope_guardrail` block (per GOV-FIB-001 §8) in `governance` or at top level
- `governance.downstream_expansion_allowed_without_amendment: false`

### Traceability chain

Every financial FIB must be traceable in this direction:

```
Operator problem → Containment loop step → Capability → Entity → Rule/invariant → Success outcome
```

If a capability in FIB-S cannot be traced back to a loop step, it is out of scope. If a PRD requirement cannot be traced to a FIB-S capability, it is unapproved scope expansion.

---

## FIB Scope Gate (GOV-FIB-001) — Quick Reference Only

> **Navigation aid. Not a substitute for the full guardrail.**
> The complete rule set — change class gate, coverage mode rules, red flags, review checklist, smell test, diff size sanity, atomicity test — is at `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`. That document must be read before generation (see Step 0 above). This section surfaces the recurring financial-domain patterns so they are immediately visible; it does not replace any section of the full document.

**Applies to:** any FIB authored for the financial domain — canonicalization, transport, UI rendering, enforcement, or observability slices.

The canonical scope defect is **consequence bundling**: a FIB scoped to one phase boundary pulls in downstream consequences for perceived completeness.

### Change class map for financial work

| If the FIB changes… | Primary class |
|---|---|
| How a financial fact crosses an HTTP/RPC boundary | Transport |
| What unit, type, or source a financial value represents | Semantics |
| How a stable financial value renders in UI components | Presentation |
| Lint rules, CI gates, or full contract matrices post-canonicalization | Enforcement |
| Logs, metrics, or deprecation tracking after contract is stable | Observability |
| Small support primitives needed now (e.g., a new RPC with a current consumer) | Infrastructure |

### Recurring bundling temptations in this domain

Each pair is adjacent — sequentially valid, but not same-slice:

- Transport stabilization → unit canonicalization (e.g., Phase 1.2A vs 1.2B pattern)
- Canonicalization → UI component migration to `FinancialValue`
- Canonicalization → OpenAPI schema expansion (`financialValueSchema` rollout)
- Pattern proof on one route family → full route inventory rollout
- Semantic change → full `financialValueSchema` lint enforcement
- Deprecation annotation → runtime observability / usage tracking

### Approval gate — financial FIB

Run the full 22-item checklist at `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md` §13 before declaring a FIB ready. The five items below are the most frequently violated in this domain; they do not replace the full checklist:

1. **One primary change class declared.** No `MUST` item requires logic work in a different class unless the primary boundary would be incorrect without it.
2. **Coverage mode declared.** `Representative` mode names exact concrete routes/components/services — not categories like "all visit routes". `Full` mode is limited to Enforcement or a dedicated rollout slice.
3. **Adjacent Consequence Ledger present** with at least three entries and at least one item explicitly removed from `MUST` scope.
4. **Atomicity test passed.** Ships without deferred work; deferred work can begin without rewriting this FIB; shipped FIB remains internally consistent and truthful (not merely compilable — §6.7).
5. **One-line boundary present.** Format: `This FIB changes <one thing> at <one boundary>; it does not change <next boundary>.`

Any two red flags from §7 require split or amendment — do not approve.

---

## Canonical Fact Inventory (Quick Reference)

| Fact ID | Class | Storage | Write Boundary |
|---|---|---|---|
| `FACT-PFT-TXN-IN-PIT-CASH` | A | PFT | `rpc_create_financial_txn` |
| `FACT-PFT-TXN-IN-PIT-CHIPS` | A | PFT | `rpc_create_financial_txn` |
| `FACT-PFT-TXN-OUT-CAGE` | A | PFT | `rpc_create_financial_txn` |
| `FACT-PFT-TXN-IN-CAGE-MARKER` | A | PFT | `rpc_create_financial_txn` |
| `FACT-PFT-ADJUSTMENT` | A | PFT | `rpc_create_financial_adjustment` |
| `FACT-PIT-CASH-OBSERVATION-ESTIMATE` | B (Observed taxonomy) | `pit_cash_observation` | `rpc_create_pit_cash_observation` |
| `FACT-PIT-CASH-OBSERVATION-CONFIRMED` | B (Observed taxonomy) | `pit_cash_observation` | `rpc_create_pit_cash_observation` |
| `FACT-MTL-ENTRY` | Compliance | `mtl_entry` | `INSERT` (RPC pending) |
| `FACT-LOYALTY-BASE-ACCRUAL` | Loyalty | `loyalty_ledger` | `rpc_accrue_on_close` |
| `FACT-LOYALTY-PROMOTION` | Loyalty | `loyalty_ledger` | `rpc_apply_promotion` |
| `FACT-LOYALTY-REDEMPTION` | Loyalty | `loyalty_ledger` | Implemented (see FPT-001) |

Explicitly **derived only** (not facts): `visit_financial_summary`, `mtl_gaming_day_summary`, `FACT-VISIT-FINANCIAL-SUMMARY`, `FACT-MTL-PATRON-DAILY-TOTAL`, `FACT-ESTIMATED-DROP`.

Read `references/fact-registry.md` for authority rules, forbidden uses, and interaction rules per fact type.

---

## Rollout State

**Read these two files at the start of every session:**

**1. Tracker (current state):**
```
docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
```
Key fields: `cursor` (active phase + blocker + next action), `direction.principles`, `direction.non_goals`, `deferred_register`, `active_bridges`, `api_contract_delta`.

**2. Roadmap (strategic direction):**
```
docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
```
Read §2 (rollout principles), §2.5 (execution protocol — the PRD/EXEC-SPEC/build-pipeline chain), §8 (non-goals), §9 (skill routing), §10 (exit criteria). The roadmap owns the *why* and the *scope boundary*; the tracker owns the *where we are now*.

The five principles in `direction.principles` and the non-goals in `direction.non_goals` inside the tracker are extracted from the roadmap for quick access — the roadmap has the full rationale.

The human-readable progress companion is `ROLLOUT-PROGRESS.md` in the same directory. Tracker JSON + ROLLOUT-PROGRESS.md must be kept in sync when phase state changes.

---

## References

| File | When to Read |
|---|---|
| `references/adr-registry.md` | Deep decision rationale; full consequences and rejected alternatives for ADR-052–055 |
| `references/fact-registry.md` | Authority matrix per fact type; interaction rules (allowed / forbidden); storage details |
| `references/enforcement-guide.md` | Non-conformant patterns exhaustive list; conformance checklist per domain |
| `references/open-issues.md` | FPT-001–004 and GAP-F1 full detail; pending analysis passes |
| `docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` | FIB-H template: all sections A–L, containment loop rules, exclusion format, adjacent-ideas table, intake amendment protocol, scaffold admission checks |
| `docs/60-release/zachman_interpolated_feature_intake_recommendation.md` | FIB-S JSON schema, Zachman-to-intake mapping, FIB-S admission gates, downstream consumption rules, traceability chain example |
| `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md` | GOV-FIB-001 full rule set: change class gate, coverage mode rules, adjacent consequence ledger, red flags, §13 review checklist |
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md` | High-level execution strategy: rollout principles (§2), execution protocol/PRD-EXEC-SPEC chain (§2.5), non-goals (§8), skill routing (§9), exit criteria (§10) |
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` | Machine-readable current state: active phase cursor, per-service status, deferred register, active bridges, API contract delta |

Source docs (read-only reference, do not patch):
- `docs/issues/gaps/financial-data-distribution-standard/FACT-AUTHORITY-MATRX-FIN-DOMAIN.md`
- `docs/issues/gaps/financial-data-distribution-standard/FINANCIAL-DATA-DISTRIBUTION-CONTRACT.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md`
- `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`

---
name: financial-model-authority
description: Root authority on PT-2's global financial model overhaul. This skill is the final arbiter on conformance with ADR-052 through ADR-056. It governs the Wave 2 ubiquitous language (Authority Fact / Telemetry Fact / Dependency Event / Projection Input / Projection Artifact / Surface Value), the transport substrate posture (GAP-F1 closed, exemplar pair proven, Phase 2.1 authorized), and open implementation gaps.
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

## Wave 2 Ubiquitous Language

> **Source:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/PRE-WAVE-2-UBIQUITOUS-LANGUAGE-PROPOSITION.md`
> **Status:** ADOPTED — resolved as blocker B-1 (2026-05-07). All Wave 2 planning documents use these terms. See `wave-2/WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md` for the canonical stabilization note.
> **Core rule:** Do not use **"financial event"** as an umbrella term. It is overloaded and invites scope drift. Use the six categories below.

### Category Definitions

| Term | Role | Authority-bearing? | Propagated? |
|---|---|---|---|
| **Authority Fact** | Authored financial claim with direct financial authority. Current examples: PFT buy-ins, cash-outs, adjustments. Maps to ADR-052 Class A (`actual`). | Yes | Yes |
| **Telemetry Fact** | Non-authoritative operational financial observation or estimate. Current examples: grind, unattributed table buy-in telemetry. Maps to ADR-052 Class B (`estimated`). | Non-authoritative | Yes |
| **Dependency Event** | Operational state transition affecting projections but not itself an authority or telemetry fact. Examples: fills, credits, opening/closing inventory snapshots, inventory corrections. | Not by default | Maybe — if projections depend on it |
| **Projection Input** | Umbrella for any event consumed by a projection: Authority Fact + Telemetry Fact + Dependency Event. Not semantically uniform. | Varies | Yes |
| **Projection Artifact** | Derived read model or cache produced from Projection Inputs (shift telemetry summary, dashboard cache). | Derived only | Rebuildable output |
| **Surface Value** | User- or API-visible value at a system boundary. Must declare type, source, and completeness. Carries the `FinancialValue` envelope where applicable. | Must declare if applicable | N/A |

### Fills and Credits — Mandatory Classification

Fills and credits are **Dependency Events**, not Authority Facts or Telemetry Facts.

They affect shift financial telemetry and may require propagation / replay / freshness guarantees, but they are not PFT authority facts and must not be flattened into grind telemetry.

> Correct: _"Fills and credits are Dependency Events used by shift telemetry projections."_
> Incorrect: _"Fills and credits are financial telemetry facts."_

### Surface Label vs Intrinsic Ontology — Critical Distinction

The Wave 1 `'actual'` / `'estimated'` labels are **operational authority semantics**, not epistemic certainty claims.

- `'actual'` = ledger-authoritative (PFT-class / Class A)
- `'estimated'` = non-ledger operational (Class B — including fills, credits, and grind)

Fills and credits are operationally concrete and auditable to the cent. They carry `'estimated'` at the surface **not** because they are uncertain or approximate, but because they are non-ledger operational inputs under the current surface contract.

The Wave 2 Dependency Event category refines the internal ontological description of these events. It does not change their surface label. Fills and credits continue to surface as `'estimated'` until a future semantic taxonomy expansion is formally adopted.

### Outbox Scope — UL Implication

The outbox propagates **Projection Inputs** — not "all financial events."

> The internal outbox propagates Projection Inputs required to keep PT-2 operational financial surfaces current and semantically honest.

A future outbox row schema may add an explicit `category` discriminator:

```ts
category: 'authority_fact' | 'telemetry_fact' | 'dependency_event'
```

This field is separate from `fact_class` and `origin_label`. Do not overload `fact_class` to represent dependency events without formally superseding ADR-052/054.

### TBT / Grind Clarification

Do not use **TBT** and **grind** as synonyms:

- **TBT** — the current operational data source or table-buy-in telemetry surface.
- **Grind** — the Class B operational telemetry concept.
- **Telemetry Fact** — the canonized semantic category for both.

### Terms to Avoid

| Avoid | Use instead |
|---|---|
| "financial event" (umbrella) | Authority Fact / Telemetry Fact / Dependency Event / Projection Input |
| "operational" without qualifier | Qualify: operational telemetry, operational dependency, operational inventory movement |
| "TBT" and "grind" interchangeably | Distinguish: TBT = source/surface; grind = Class B concept; Telemetry Fact = canonical category |

### Wave 2 Review Decisions (Pre-approved)

| ID | Decision |
|---|---|
| DEC-UL-1 | Retire "financial event" umbrella — use precise category terms |
| DEC-UL-2 | Fills and credits classified as Dependency Events |
| DEC-UL-3 | Outbox defined as internal Projection Input propagation, not external financial event bus |
| DEC-UL-4 | Shared propagation mechanics do not imply shared authority semantics |

---

## Hard Rules (Non-Negotiable)

### R1 — Table-first anchoring
`table_id` is mandatory on every row in both classes. There is no player-first model. Player attribution is conditional; table context is universal.

### R2 — No cross-class derivation
Class B is never produced by projecting Class A. Class A is never produced by projecting Class B. Each is authored independently. Dual-write from PFT to the grind store is forbidden.

### R3 — Outbox is the only propagation path
Every authored event (Class A or B) emits to `finance_outbox` **within the same DB transaction** as the authoring write — one `BEGIN…COMMIT`, one `pg_current_xact_id()`. Not eventually. Not via background job. Not via post-commit trigger. Literally the same transaction boundary.

Note: a `BEFORE`/`AFTER INSERT` trigger that writes **only** to `finance_outbox` satisfies this rule. A trigger that writes to any other table (projections, caches, bounded contexts) violates ADR-054 D6 regardless of transaction scope. The distinction is the trigger's *target*, not its *timing*.

For the full outbox implementation contract — trigger classification table, `finance_outbox` DDL, relay worker design, idempotent consumer, projection layer requirements, and GAP-F1 closure checklist — read:
`docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md`

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

**Status:** NO ACTIVE BRIDGES — BRIDGE-001 retired in EXEC-074 (commit `e83a2c12`, 2026-04-30).

All `RecentSessionDTO` and `VisitLiveViewDTO` financial fields are now integer cents with `financialValueSchema.int()` enforcement. `formatDollars` replaced with `formatCents` at all render sites (EXEC-075, 2026-05-03).

For the bridge retirement history see `ROLLOUT-TRACKER.json → retired_bridges[id="BRIDGE-001"]`. For the transitional governance model that governed it see `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`.

---

## Open Implementation Gaps

| Gap | Description | Severity | Status |
|---|---|---|---|
| **GAP-F1** | `finance_outbox` had zero producers — outbox pattern not wired to PFT or grind write paths | Structural — ADR-054 enforcement | **CLOSED** — Phase 2.0 (PRD-081, commit `8a1b8741`, 2026-05-11). Exemplar pair proven. I1–I4 PASS. |
| **DEC-1** | Visit-level financial aggregates emit `completeness.status: 'unknown'` always — no lifecycle-aware projection exists | Functional — completeness signals | **OPEN** — resolves in Phase 2.3 (First Consumer Slice). See `WAVE-2-TRACKER.json → open_decisions`. |
| **FPT-001** | FACT-LOYALTY-REDEMPTION doc misclassified as broken; implementation is correct | Doc error (INTERIM) | Open |
| **FPT-002** | GAP-L2 accrual caller misidentified as UNKNOWN | Doc error (INTERIM) | Open |
| **FPT-003** | `mtlEntries={[]}` not connected; `onViewHistory` unwired — reason unestablished | Doc + omission (INTERIM) | Open |
| **FPT-004** | Trace staleness post Phase 1.1 — 4 stale findings + 1 new gap N1 | Doc staleness (INTERIM) | Open |

**GAP-F1 is closed.** Transport substrate is proven. The system now has a trustworthy spine: `finance_outbox` DDL + relay + idempotent consumer + I1–I4 harness + runtime-validated integration proof (PRD-082). What remains is controlled producer propagation (Phases 2.1–2.2) and projection consumers (Phases 2.3–2.4).

**The system does NOT yet have** real projection consumers, lifecycle-aware completeness, operational telemetry projections, or mature replay-driven derived state. These are all in Phases 2.3–2.4. The transport substrate is established; the application layer above it is not yet built.

Read `references/open-issues.md` for FPT-001–004 full detail. For Wave 2 phase status read `WAVE-2-TRACKER.json`.

---

## How to Engage Implementation Teams

When reviewing a PRD, EXEC-SPEC, FIB, or code, walk through this sequence:

**1. Classify using Wave 2 UL first.** Which category applies: Authority Fact (Class A / PFT), Telemetry Fact (Class B / grind), Dependency Event (fill, credit, inventory snapshot), or Projection Input (umbrella)? Do not use "financial event" as an umbrella — it collapses semantically distinct categories. Then establish whether this is authoring a new fact or working in the projection / surface layer. Clarify before any other question.

**2. Check the write boundary.** Class A writes go through `rpc_create_financial_txn` or `rpc_create_financial_adjustment`. Class B writes go through the grind authoring path. Direct inserts into `player_financial_transaction` outside seed/test are non-conformant.

**3. Check outbox coupling.** Does the authoring write emit to `finance_outbox` in the same transaction? GAP-F1 is closed — the transport substrate exists. The exemplar pair (`rpc_create_financial_txn`, `rpc_record_grind_observation`) is wired. For Phase 2.1–2.2 work, verify the new producer extension follows the same pattern (same-transaction INSERT, no TypeScript fallback path, I1 atomicity proof test required per producer). For Phase 2.2 specifically: fills and credits are a **symmetric Dependency Event rollout pair** — intra-category parity (ADR-055) forbids landing one without the other in the same slice. If the work involves the outbox DDL, relay worker, consumer idempotency, or projection surface contract, read the outbox knowledge base: `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md`.

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

**Read these files at the start of every session:**

**1. Wave 2 tracker — current phase state (JSON):**
```
docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json
```
Key fields: `cursor` (active phase + blocker + next action + Phase 2.1 authorization), `phases` (per-phase status, deliverables, exit gates), `deferred_register` (teardown gate, dormant workstreams, DEC-1), `validation_matrix` (I1–I5 per producer and phase), `transport_infrastructure_posture` (what is proven and in place).

**2. Wave 2 progress tracker — human-readable companion:**
```
docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md
```
Narrative form of the JSON tracker. Keep both in sync when phase state changes.

**3. Parent tracker (Wave 1 history + Wave 2 cursor pointer):**
```
docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
```
Key fields: `cursor.wave_2_progress_tracker_json`, `cursor.blocker`, `cursor.next_action`, Wave 1 phase records, `api_contract_delta`.

**4. Wave 2 roadmap (phase plan + exit gates):**
```
docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md
```
Read §2 (rollout principles), §3 (execution protocol), §4 (phase table with deliverables and exit gates per phase), §5 (failure-simulation alignment), §6 (non-goals). The roadmap owns the *what must be built and how*; the tracker owns the *where we are now*.

**5. Global rollout roadmap (strategic direction, Wave 1 history):**
```
docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
```
Read §2 (rollout principles), §2.5 (execution protocol), §8 (non-goals), §9 (skill routing), §10 (exit criteria).

---

## References

| File | When to Read |
|---|---|
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json` | **Wave 2 current state** — cursor, phase status, teardown gate, dormant workstreams, DEC-1, I1–I5 validation matrix per producer, transport infrastructure posture |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md` | Human-readable companion to WAVE-2-TRACKER.json — same content in narrative form; transport bugs fixed, per-phase deliverables and exit gates, immediate next actions |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md` | Wave 2 phase plan: rollout principles (§2), execution protocol (§3), phase table with deliverables and exit gates (§4), invariant scope (§5), non-goals (§6) |
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` | Parent tracker: Wave 1 history, Wave 2 cursor pointer, API contract delta |
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md` | Global rollout strategy: Wave 1 history, execution protocol (§2.5), non-goals (§8), skill routing (§9), exit criteria (§10) |
| `references/adr-registry.md` | Deep decision rationale; full consequences and rejected alternatives for ADR-052–055 |
| `references/fact-registry.md` | Authority matrix per fact type; interaction rules (allowed / forbidden); storage details |
| `references/enforcement-guide.md` | Non-conformant patterns exhaustive list; conformance checklist per domain |
| `references/open-issues.md` | FPT-001–004 full detail; GAP-F1 closure record |
| `docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` | FIB-H template: all sections A–L, containment loop rules, exclusion format, adjacent-ideas table, intake amendment protocol, scaffold admission checks |
| `docs/60-release/zachman_interpolated_feature_intake_recommendation.md` | FIB-S JSON schema, Zachman-to-intake mapping, FIB-S admission gates, downstream consumption rules, traceability chain example |
| `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md` | GOV-FIB-001 full rule set: change class gate, coverage mode rules, adjacent consequence ledger, red flags, §13 review checklist |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md` | Full outbox implementation contract: `finance_outbox` DDL, trigger classification (D2 vs D6), relay worker, idempotent consumer, `origin_label` immutability, surface rendering contract (§6.2) |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/PRE-WAVE-2-UBIQUITOUS-LANGUAGE-PROPOSITION.md` | Wave 2 UL: full definitions, non-examples, boundary table, outbox implication, TBT/grind clarification, DEC-UL-1–4 |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/PRD-082-precis.md` | Transport proof précis: what was validated (transport substrate only), what remains (projection consumers, lifecycle completeness, operational telemetry), 4 transport bugs fixed, Phase 2.1 gate status |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/TEARDOWN-ARTIFACT-PRD-082.md` | PRD-082 harness teardown requirements — blocking Phase 2.1 merge; migration path and accepted/rejected teardown mechanisms |

Source docs (read-only reference, do not patch):
- `docs/issues/gaps/financial-data-distribution-standard/FACT-AUTHORITY-MATRX-FIN-DOMAIN.md`
- `docs/issues/gaps/financial-data-distribution-standard/FINANCIAL-DATA-DISTRIBUTION-CONTRACT.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md`
- `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`

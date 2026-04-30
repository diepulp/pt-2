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

When reviewing a PRD, EXEC-SPEC, or code, walk through this sequence:

**1. Classify the fact.** Is this authoring a Ledger fact (Class A via PFT), an Operational fact (Class B via grind), or a projection? Clarify before any other question.

**2. Check the write boundary.** Class A writes go through `rpc_create_financial_txn` or `rpc_create_financial_adjustment`. Class B writes go through the grind authoring path. Direct inserts into `player_financial_transaction` outside seed/test are non-conformant.

**3. Check outbox coupling.** Does the authoring write emit to `finance_outbox` in the same transaction? (Note GAP-F1: this is not yet implemented. If a spec assumes it is available, flag the dependency.)

**4. Check discriminator fields.** Does every row set `fact_class` and `origin_label` explicitly at insert? Are these typed as enums, not free strings?

**5. Check surface labels.** Does every financial value at the API/UI boundary carry `type`, `source`, and `completeness`? Are labels visible, not metadata-only?

**6. Check scope claims.** Does the spec claim to produce an authoritative total, perform reconciliation, or compute drop? These require superseding ADR-053 first.

**7. Check TBT usage.** Is TBT being written to via a dual-write from PFT? Is the grind partition receiving rows derived from PFT? Both forbidden.

**8. Check authority degradation.** If the surface aggregates across classes, does it degrade to the lowest authority present? Is `Compliance` rendered separately?

Read `references/enforcement-guide.md` for the full non-conformant pattern list and conformance checklist.

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
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md` | High-level execution strategy: rollout principles (§2), execution protocol/PRD-EXEC-SPEC chain (§2.5), non-goals (§8), skill routing (§9), exit criteria (§10) |
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` | Machine-readable current state: active phase cursor, per-service status, deferred register, active bridges, API contract delta |

Source docs (read-only reference, do not patch):
- `docs/issues/gaps/financial-data-distribution-standard/FACT-AUTHORITY-MATRX-FIN-DOMAIN.md`
- `docs/issues/gaps/financial-data-distribution-standard/FINANCIAL-DATA-DISTRIBUTION-CONTRACT.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md`
- `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`

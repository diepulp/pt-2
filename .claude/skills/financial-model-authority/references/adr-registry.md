# ADR Registry — Financial Model Overhaul

All four ADRs were frozen 2026-04-23 as a co-dependent set. Snapshot files live in
`docs/issues/gaps/financial-data-distribution-standard/decisions/`. Canonical numbered
files live under `docs/80-adrs/ADR-052` through `ADR-055`.

These are **decision-only** records. To amend, supersede via a new ADR; do not patch.

---

## ADR-052 — Financial Fact Model (Dual-Layer)

**Source decisions:** DECISION-CONSOLIDATION D1, D2, D4  
**Supersedes:** ADR-FINANCIAL-FACT-MODEL-DRAFT, ADR-FINANCIAL-EVENT-INGESTION-UNIFICATION

### Decisions

**D1 — Two In-Scope Fact Classes**

- Class A (Ledger): PFT, `fact_class='ledger'`, `origin_label='actual'`, player-attributed, auditable, append-only
- Class B (Operational/Grind): TBT grind partition, `fact_class='operational'`, `origin_label='estimated'`, table-only, non-authoritative
- Out-of-scope taxonomy: `Observed` (`pit_cash_observation`) and `Compliance` (`mtl_entry`) exist in the authority taxonomy for labeling consistency but are not authored under this ADR.

**D2 — Table-First Anchoring**

- `table_id` mandatory on every row in both classes
- `player_id` mandatory for Class A, NULL for Class B
- Projections are table-centric; player roll-ups are secondary aggregations
- This removes the structural incentive that produced the TBT shadow system

**D3 — TBT Reclassification**

- Grind (Class B): primary authoring input, not derived, non-authoritative for ledger
- Rated: projection derived exclusively from PFT, read-only
- If grind and rated cannot share storage without ambiguity, they MUST be split (default is split)
- Dual-write from PFT to the grind authoring store is forbidden

**D4 — Class Discriminator**

Every row and every emitted event carries two explicit fields:
```
fact_class:    'ledger' | 'operational'   (reserved: 'observation', 'compliance')
origin_label:  'actual' | 'estimated' | 'observed' | 'compliance'
               (pilot-authored: 'actual' for Class A, 'estimated' for Class B)
```

Inference is forbidden. Consumers must read the discriminator, never guess.

### Row-Level Invariants

- **R1 — Append-Only (Class A):** No updates or deletes. Corrections are new rows (`txn_type='adjustment'`).
- **R2 — Observation-Only (Class B):** Corrections are new observations, not mutations.
- **R3 — No Cross-Class Derivation:** Neither class is produced as a projection of the other.
- **R4 — Immutable Classification:** `fact_class` and `origin_label` are set at insert and never change.
- **R5 — Attribution Is Whole or Absent:** Class A has full attribution chain. Class B has none. Partial attribution is rejected.

### Rejected Alternatives (hard stops)

- ❌ Single unified ledger (PFT absorbs grind via `is_rated`): violates attribution constraints, contaminates ledger semantics, breaks compliance alignment
- ❌ TBT as ledger: duplicates financial truth, creates split-brain, lacks auditability
- ❌ Player-first anchoring with table as optional: produced the TBT shadow system

### Open Questions (deferred, do not resolve in implementation)

- Should PFT schema expand to express table-only informational rows, or does Class B remain in a separate authoring store?
- Should grind remain fully separate or partially normalized under a shared parent with a discriminator column?

---

## ADR-053 — Financial System Scope Boundary

**Source decisions:** DECISION-CONSOLIDATION D3, D5

### Decisions

**D1 — System Scope Is Operational Telemetry**

The system provides: structured operational financial activity (both classes), attribution where possible, explicit completeness visibility.

The system does NOT provide: financial truth, authoritative drop calculations, reconciled totals, variance resolution.

**D2 — No Authoritative Totals**

- No "Total Drop" as a settled number
- No shift-end settlement values
- No "final" money position for a table, shift, or casino
- Partial aggregates permitted only when rendered with source, authority, and completeness labels

**D3 — Reconciliation Is External**

The system exposes data for reconciliation; it does not perform reconciliation. Inputs it lacks: count room totals, inventory counts, cage custody handoffs, physical cash movements.

**D4 — Integration Point, Not Integration**

A future external reconciliation layer may read from `finance_outbox`. This ADR defines the integration point — the consumer reads outbox events with authority labels intact. It does not define the reconciliation algorithm, ownership, or variance resolution.

### Enforcement Mechanisms

Three downstream enforcements:
1. Surface Rendering Contract (ADR-054 §4): any surface claiming "Total Drop" without source/authority/completeness labels is non-conformant
2. Propagation contract (ADR-054): `origin_label` immutable in transit; consumers cannot relabel
3. Code review / ADR gate: any feature proposing an authoritative total or reconciliation step must supersede this ADR first

### Rejected Alternatives

- ❌ Full accounting reconstruction inside the system: lacks custody inputs; produces false authority
- ❌ "Best-effort" reconciliation with a disclaimer: a disclaimer on a total that looks authoritative is still misread; prior audit failure was this exact pattern
- ❌ Deferring scope question to implementation: scope creep is the original cause of dual-truth drift

---

## ADR-054 — Financial Event Propagation & Surface Contract

**Source decisions:** DECISION-CONSOLIDATION D6; outbox mechanics from ADR-FINANCIAL-EVENT-OUTBOX (draft, superseded)  
**Supersedes:** ADR-FINANCIAL-EVENT-OUTBOX

### Decisions

**D1 — Outbox As Sole Propagation Path**

Every authored financial event (Class A or B) MUST produce a corresponding row in `finance_outbox` within the same database transaction as the authoring write. No side-channel propagation, no triggers, no polling, no UI recompute.

**D2 — Atomic Write Rule**

"Same transaction" is literal: one `BEGIN…COMMIT`, one `pg_current_xact_id()`. The following do NOT satisfy this rule:
- Two RPCs coordinated by retry logic
- Authoring row committed; outbox row written by background job
- Authoring row committed; outbox row written by post-commit trigger
- "Logically atomic," "atomic in spirit," or "best-effort consistent" patterns

Acceptable forms: single RPC performing both inserts; authoring RPC that inserts both before COMMIT; BEFORE/AFTER INSERT trigger (fires inside the same transaction).

**D3 — At-Least-Once Delivery**

Every event is delivered at least once. Consumers must be idempotent. Duplicate delivery is normal.

**D4 — Consumers Are Projection-Only**

Consumers may: update projections/caches, trigger notifications, emit labeled derived signals.
Consumers must NOT: write to PFT, write to grind authoring store, write to `mtl_entry` as financial settlement, merge fact classes into a single unlabeled value.

**D5 — `origin_label` Is Immutable In Transit**

Set by the author; travels unchanged through every consumer, projection, API response, and UI render.

Mixed-authority aggregates carry the lowest authority present:
```
Actual > Observed > Estimated
```
`Compliance` is parallel — must NOT be merged with any other authority in a single aggregate. Render separately.

**D6 — No Hidden Triggers**

DB triggers performing cross-domain propagation outside the outbox must be removed or deprecated.

**D7 — No UI-Driven Reconciliation**

The UI must NOT recompute financial state against authoring stores. Staleness → completeness label, never patched.

### Outbox Event Model

Mandatory fields on every `finance_outbox` row:

| Field | Type | Notes |
|---|---|---|
| `event_id` | UUID | Unique; idempotency key |
| `event_type` | string | e.g. `buyin.recorded`, `grind.observed`, `cashout.recorded` |
| `fact_class` | enum | `ledger` \| `operational` |
| `origin_label` | enum | `actual` \| `estimated` \| `observed` \| `compliance` |
| `table_id` | UUID | Mandatory — table-first anchoring |
| `player_id` | UUID? | Nullable; present for Class A, NULL for Class B |
| `aggregate_id` | UUID | Authoring row id |
| `payload` | JSON | Event-specific data |
| `created_at` | timestamp | Authored time |
| `processed_at` | timestamp? | Set by consumer; NULL = unprocessed |

`fact_class` and `origin_label` are load-bearing fields. Omitting either is a schema-level violation.

### Surface Rendering Contract (§4)

Every financial value at a system boundary must declare:

**Source:** Which fact class produced it — `Ledger`, `Operational`, or `Mixed`.

**Authority:** Maps from `origin_label`:
- `Actual` → PFT (Class A, pilot-authored)
- `Estimated` → Grind/TBT (Class B, pilot-authored)
- `Observed` → `pit_cash_observation` (out of pilot authoring)
- `Compliance` → `mtl_entry` (parallel domain)

A surface value must carry exactly one authority. "Unknown" is not an authority — if undeterminable, the surface must NOT render the value.

**Completeness:**
```ts
completeness: {
  status: 'complete' | 'partial' | 'unknown'
  coverage?: number    // optional, 0.0–1.0
}
```
`status` is mandatory. Cannot be omitted. `coverage` is a completeness measure, not an authority measure.

---

## ADR-055 — Cross-Class Authoring Parity

**Extends:** ADR-054 (tightens D1/D2/D5 with cross-class symmetry invariants)  
**Depends on:** ADR-052, ADR-054

### Parity Invariants

**P1 — Envelope Parity**

- One outbox DDL; both paths insert the same column set
- No class-conditional fields — if a field is in the envelope, it's in the envelope for every class
- Fields that don't apply to a class (e.g., `player_id` for Class B) are present with explicit `NULL`, never omitted
- Required fields (`event_id`, `event_type`, `fact_class`, `origin_label`, `table_id`, `aggregate_id`, `payload`, `created_at`) are required in both paths
- Class-specific content belongs in `payload`, not in envelope-level conditional fields

**P2 — Outbox Discipline Parity**

- Same transactional primitive (same `BEGIN…COMMIT` pattern, not "logically atomic" vs real transaction)
- Same idempotency key placement — `event_id` generated at authoring boundary using same strategy (UUID v7 or equivalent)
- Same ordering guarantee: within `aggregate_id`, emission order matches authoring order
- Same retry semantics: if outbox insert fails, authoring write rolls back in both paths
- Same consumer visibility: `processed_at` tracking identical for both classes

**P3 — Ingestion Strictness Parity**

- Required-field validation symmetric across classes
- Referential integrity symmetric where applicable
- Timestamp discipline (generation, monotonicity, timezone normalization) identical
- Type constraints identical — no silent coercion in one path that the other rejects
- Authoring errors surface with the same error shape

**P4 — Parity Before Feature Rollout**

If a feature can only be implemented for one class, it is deferred until both can implement it. No "launch Class A first; Class B catches up."

### Non-Conformant Patterns (Exhaustive)

| Pattern | Invariant Violated |
|---|---|
| Class B insert omits a column that Class A includes | P1 |
| Class B uses `INSERT ... DEFAULT` where Class A passes explicit value | P1 |
| Class B has nullable `event_id` while Class A requires it | P1, P2 |
| Class B writes to outbox in a separate transaction from authoring row | P2 |
| Class B generates `event_id` at consumer side, Class A at author side | P2 |
| Class B validation is "trigger-based", Class A is "RPC-level" | P3 |
| Class B allows backdated `created_at`, Class A rejects it | P3 |
| Class B rolls out a new `event_type` before Class A supports it | P4 |

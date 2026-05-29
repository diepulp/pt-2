---
id: ADR-059
title: Table Inventory Accounting Canon — Ownership and Formula
status: Proposed
date: 2026-05-28
owner: Architecture Review
decision_scope: >
  Canonical subdomain ownership of the table result formula and DTO;
  freeze of TableInventoryAccountingProjection as the sole downstream authority;
  completeness.included_inputs enumeration; three-result-state model
triggered_by: >
  RFC-007 Phase 4 ADR requirement (Section 7, ADR-A).
  FIB-H-TIA-CANON-001 (frozen 2026-05-27) requires an ownership ADR before
  the PRD gate opens.
scope_authority: FIB-H-TIA-CANON-001 v1 (frozen 2026-05-27)
related:
  - ADR-052
  - ADR-053
  - ADR-058
  - ADR-060
  - ADR-061
  - docs/02-design/RFC-007-table-inventory-accounting-canonization.md
  - docs/issues/table-inventory-accounting-canon/planning/FIB-H-TIA-CANON-001-classification.yaml
  - docs/01-scaffolds/SCAFFOLD-TABLE-INVENTORY-ACCOUNTING-CANON.md
---

# ADR-059: Table Inventory Accounting Canon — Ownership and Formula

## 1. Context

PT-2 currently derives table result language (Win/Loss, Drop, Need, inventory movement) from multiple independent formulas across `rpc_compute_table_rundown`, dashboard-local computation, and metric components. These formulas disagree on which inputs are included, whether drop is telemetry-derived or omitted, and what label is displayed when inputs are missing. The operator sees different values for the same table on the same shift depending on which surface they are looking at.

ADR-053 further prohibits any PT-2 surface from claiming authoritative financial totals — all table result values must carry a surface envelope that separately declares input completeness and custody/authority status.

FIB-H-TIA-CANON-001 established that this split-brain must be resolved before production because every downstream feature will inherit the same semantic fracture. The FIB froze the transport mechanism (CLS-002, `read_time_derivation`) and the exemplar surface (Pit Terminal Rundown). Two questions it left open for this ADR are: (1) which bounded context owns the formula and DTO, and (2) what the canonical vocabulary for the completeness envelope must be.

This ADR records those decisions. It is a durable decision record — hard to reverse once the DTO has downstream consumers. Changing the owning subdomain after consumers are wired requires re-routing every consumer.

### Implementation Gate

This ADR freezes ownership, DTO authority, formula shape, completeness vocabulary, and the three-result-state model. It does **not** by itself authorize exemplar implementation. Exemplar implementation MUST NOT proceed until the follow-up ADRs in this sequence are accepted:

- ADR-060 — drop taxonomy and naming vocabulary, including allowed/prohibited surface labels and drop-like term semantics.
- ADR-061 — session-scope aggregation boundary, including the canonical `telemetry_derived_drop_estimate_cents` source predicate and telemetry-kind inclusion/exclusion rules.

Until ADR-060 and ADR-061 are accepted, `telemetry_derived_drop_estimate_cents` is a named formula operand with frozen null-vs-zero semantics, but its final source predicate is not implementation-complete. PRD/EXEC work may reference this ADR for ownership and DTO shape, but may not ship a table-result formula implementation from ADR-059 alone.

ADR-059 may be accepted independently as the ownership and DTO-authority decision. Any PRD, EXEC-SPEC, build-pipeline run, or implementation branch that creates or wires `TableInventoryAccountingProjection` must include a hard gate proving ADR-060 and ADR-061 exist with `status: Accepted`.

---

## 2. Decisions

### D1 — Subdomain Ownership: `TableInventoryAccounting` within `TableContextService`

`TableInventoryAccounting` is established as a subdomain of `TableContextService`, not as a standalone bounded context.

**Rationale:** The module reads only `TableContextService`-owned tables (`table_inventory_snapshot`, `table_fill`, `table_credit`, `table_buyin_telemetry`, `table_session`). It has no write authority and authors no domain facts. A standalone `TableAccountingService` would introduce cross-context reads without adding domain isolation benefits. The Over-Engineering Guardrail and the SRM Phase 0 ownership model both point to the subdomain form.

**Implementation:** The initial implementation must remain a minimal module within `TableContextService`; PRD/EXEC may choose a single file or small folder, but must not create a standalone bounded context. The subdomain boundary is declared here; it must be reflected in the SRM update that accompanies exemplar delivery.

**Rejected alternative:** Standalone `TableAccountingService` with its own bounded context — adds cross-context read complexity, creates a new context boundary for a module that has no write authority and exclusively consumes data owned by an existing context.

---

### D2 — Canonical Formula (Frozen)

The following formula is the sole canonical computation for table win/loss in this slice. It is frozen. No competing formula may produce a win/loss-like value in any operator-visible surface after exemplar delivery.

```
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

No `COALESCE` of `telemetry_derived_drop_estimate_cents` to `0` is permitted anywhere in the module or its callers. `0` means a telemetry source exists and summed to zero; `null` means no usable estimate exists for this session. These are semantically distinct claims and must not be conflated (ADR-053 D2; classification YAML amendment 2).

`telemetry_derived_drop_estimate_cents` source binding is intentionally delegated to ADR-061. ADR-059 consumers must not infer gaming-day scope, session scope, telemetry-kind inclusion, or adjustment handling from the formula name alone.

---

### D3 — `TableInventoryAccountingProjection` as Sole DTO Authority

`TableInventoryAccountingProjection` is the sole authority downstream table-result consumers may consult. No surface may re-derive `calculation_kind`, `completeness.status`, `missing_inputs`, or result field values from raw inventory fields.

**Canonical semantic DTO fields — minimum frozen contract:**

> **D3 source_authority shape amended by ADR-060 D3.** The `inventory` key no longer exists; the authoritative key is `snapshots`. ADR-060 D3 is the governing definition.

Identity fields (`casino_id`, `table_id`, `table_session_id`, `gaming_day`) and raw input echo fields are PRD/EXEC-owned additions so long as they do not alter the frozen semantic fields below.

```ts
interface TableInventoryAccountingProjection {
  // Result fields — at most one is non-null per response
  projected_table_win_loss_cents:  number | null
  partial_table_result_cents:       number | null
  final_table_win_loss_cents:       null              // always null in this slice

  // Discriminator
  drop_estimate_state: 'present' | 'none_for_session'

  // Completeness envelope (ADR-053)
  calculation_kind: 'telemetry_drop_formula' | 'inventory_only' | 'integrity_failure'
  completeness: {
    included_inputs: ReadonlyArray<
      | 'opening_inventory'
      | 'closing_inventory'
      | 'fills'
      | 'credits'
      | 'telemetry_drop_estimate'
    >
    missing_inputs: ReadonlyArray<'drop_estimate'>
    status: 'complete' | 'partial' | 'integrity_failure'
  }
  integrity_issues: string[]   // empty when calculation_kind !== 'integrity_failure'

  // Authority envelope
  custody_status:   'non_custody_estimate'  // always in this slice
  source_authority: {
    drop:      'telemetry_derived_estimate' | 'none'
    snapshots: 'table_inventory_snapshot'  // KEY AMENDED: 'inventory' → 'snapshots' per ADR-060 D3.
    fills:     'table_fill'
    credits:   'table_credit'
  }
}
```

`final_table_win_loss_cents` is always `null` in this slice. It requires external custody authority and an ADR/FIB amendment before it may be populated (ADR-053 D2; FIB-H §G). `custody_status` is always `'non_custody_estimate'` in this slice. `input_completeness = complete` never upgrades `custody_status` (classification YAML `semantic_invariant`).

**Suppression invariant (architectural):** The PRD owns the deletion mechanics and acceptance criteria, but the architectural requirement is set here: after Pit Terminal Rundown exemplar acceptance, no active operator-visible surface may render a win/loss-like table result unless it consumes `TableInventoryAccountingProjection` or is explicitly suppressed.

The PRD/EXEC suppression plan must include a verified inventory of active operator-visible win/loss-like surfaces and a disposition for each surface: consume `TableInventoryAccountingProjection`, suppress rendering, or document why the surface is outside the exemplar acceptance boundary. The exemplar acceptance gate must prove that no active operator-visible surface renders a competing table-result formula. "Outside the exemplar acceptance boundary" is valid only for surfaces that are demonstrably not active operator workflows for the exemplar release.

---

### D4 — `completeness.included_inputs` Enumeration (Frozen)

The canonical literal values for `included_inputs` and `missing_inputs` per `calculation_kind` are:

| `calculation_kind` | `included_inputs` | `missing_inputs` |
|---|---|---|
| `telemetry_drop_formula` | `['opening_inventory', 'closing_inventory', 'fills', 'credits', 'telemetry_drop_estimate']` | `[]` |
| `inventory_only` | `['opening_inventory', 'closing_inventory', 'fills', 'credits']` | `['drop_estimate']` |
| `integrity_failure` | Deterministic subset of successfully resolved inputs, in canonical order: `opening_inventory`, `closing_inventory`, `fills`, `credits`, `telemetry_drop_estimate` | `[]` |

`drop_estimate` is the only valid normal `missing_inputs` value. It represents the `none_for_session` drop state — the expected partial condition for unrated sessions with no `GRIND_BUYIN` rows. `opening_inventory_cents` and `closing_inventory_cents` are **never** listed in `missing_inputs`; their absence is a lifecycle/integrity failure surfaced via `integrity_issues` instead (see D5).

`integrity_failure.included_inputs` is diagnostic metadata, not a permission to render a partial result. It must be serialized deterministically so contract tests can compare exact DTO output.

---

### D5 — Three-Result-State Model (Frozen)

The service module recognizes exactly three result states. No additional states may be introduced in this slice.

| State | Trigger | DTO result |
|---|---|---|
| `telemetry_drop_formula` | All five inputs present; `drop_estimate_state = 'present'` | `projected_table_win_loss_cents` set; `partial_table_result_cents = null`; `integrity_issues = []` |
| `inventory_only` | Drop estimate null; `drop_estimate_state = 'none_for_session'`; opener and closer both resolvable (including zero) | `partial_table_result_cents` set; `projected_table_win_loss_cents = null`; `integrity_issues = []` |
| `integrity_failure` | `opening_inventory_cents` or `closing_inventory_cents` is null after all resolution paths are exhausted | Both result fields null; `integrity_issues` populated with one or both of `['missing_opening_inventory_snapshot', 'missing_closing_inventory_snapshot']`; surface renders disclosure path only |

**Invariants:**

- Zero `opening_inventory_cents` or `closing_inventory_cents` is a valid explicit inventory count (empty tray). It **never** triggers `integrity_failure`.
- Absent `telemetry_derived_drop_estimate_cents` **never** triggers `integrity_failure`. Null telemetry is a normal operational condition for unrated sessions.
- `integrity_failure` and `inventory_only` are mutually exclusive. A surface must not render "Partial Table Result" when `integrity_issues` is non-empty.
- `partial_table_result_cents` is triggered **only** when `drop_estimate_state = 'none_for_session'`. No other null-telemetry condition triggers the partial path at exemplar baseline.
- PRD/EXEC must require an observable signal for every `integrity_failure` result, either structured application logging or an equivalent reportable operational diagnostic. Silent UI-only disclosure is not sufficient.

---

## 3. Consequences

### Positive

- Eliminates the split-brain: one formula, one DTO, one owner.
- Downstream surfaces — present and future — consume the DTO rather than re-deriving from raw inventory fields, preventing future formula divergence.
- ADR-053 compliance is structurally enforced: the DTO always carries the two-axis completeness envelope; bare financial numbers cannot escape the module.
- The ownership decision is durable: subdomain → `TableContextService` is a one-way statement recorded here; changing it after consumer wiring requires an explicit ADR amendment.

### Trade-offs

- Every new table-result consumer must consume `TableInventoryAccountingProjection`. There is no shortcut path to raw inventory fields for any surface.
- The `included_inputs` string values frozen in D4 are DTO contract language — changing them is a breaking change to every consumer that serializes or displays these strings.
- Read-time derivation recomputes on every request at shift scale (O(10) concurrent tables per pit). Materialization is explicitly deferred; if read cost proves unacceptable it must be addressed in a subsequent EXEC-SPEC gated on profiling evidence, not in this slice.

---

## 4. Rejected Alternatives

### Option A2 — Standalone `TableAccountingService`

A standalone bounded context with its own service boundary, separate from `TableContextService`.

**Rejected because:** The module reads only `TableContextService`-owned tables. It has no write authority, no authoring RPCs, and no cross-context writes. A standalone context would require cross-context reads without adding domain isolation. The Over-Engineering Guardrail prohibits introducing context boundaries for modules that have no write authority and no independent domain facts. The subdomain form (`TableInventoryAccounting` within `TableContextService`) provides ownership clarity without added complexity.

### Generic `drop_cents` + `drop_type` discriminator

Replace explicit field names with a generic `drop_cents` field plus a `drop_type` discriminator to unify drop vocabulary.

**Rejected because:** A generic `drop_cents + drop_type` pattern pushes disambiguation to consumer logic and has historically produced the split-brain that this ADR resolves. Explicit field names (`telemetry_derived_drop_estimate_cents`) carry their own semantic precision at the DTO boundary, making misuse detectable without runtime inspection of the discriminator. Drop vocabulary naming is governed separately in ADR-060.

### Persisted projection store at exemplar baseline

Materialize `TableInventoryAccountingProjection` to a dedicated table on each inventory authoring event.

**Rejected because:** The formula is algebraically idempotent from canonical inputs — there is no at-least-once delivery problem to solve at baseline. A projection store adds a write path, projection staleness risk, and a new migration + RLS policy (SECURITY DEFINER trigger per ADR-018) for a problem that has not been profiled. Deferred as an explicit EXEC-SPEC optimization gated on profiling evidence (FIB §L.3).

---

## 5. Out of Scope

- `final_table_win_loss_cents` — requires external custody authority and an ADR/FIB amendment; not governed here.
- `bridge_pending`, `source_unavailable`, `integrity_issue` as implemented `drop_estimate_state` values — reserved vocabulary; require Finance cross-context DTO contracts that do not exist in this slice; governed separately when those contracts are published.
- Drop taxonomy and naming vocabulary — governed by ADR-060.
- Session-scope aggregation boundary — governed by ADR-061.
- PRD acceptance criteria, implementation sequencing, P0 suppression mechanism — owned by the PRD and exemplar delivery plan.
- SRM update reflecting the `TableInventoryAccounting` subdomain entry — required at exemplar merge; not a subject of this ADR.

These out-of-scope items are not optional. ADR-060, ADR-061, and the PRD/EXEC suppression plan are blocking dependencies for exemplar implementation.

The PRD/EXEC acceptance criteria must include:

- A dependency gate proving ADR-060 and ADR-061 exist with `status: Accepted` before implementation begins.
- A suppression inventory classifying every current legacy win/loss-like surface as `consume_projection`, `suppress`, or `outside_exemplar_boundary`, with evidence for any outside-boundary classification.
- Contract tests for DTO result-state exclusivity, completeness literals, authority literals, and deterministic `integrity_failure.included_inputs` serialization.
- An observability check proving `integrity_failure` emits the required operational diagnostic.

---

## 6. Closing Statement

There is one table result formula. It lives in one place. Everything downstream reads the projection it produces.

> The formula is not a view shared across components.
> It is a boundary decision: one owner, one DTO, one truth claim — and that claim is explicitly non-custody.

Changing the owner later is a re-routing exercise for every consumer. This ADR makes that cost visible so the decision is not revisited casually.

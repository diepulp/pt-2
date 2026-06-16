# Table Inventory Accounting Canon — Exemplar Slice Thesaurus

> **Authority:** This artifact is an SRL-admitted, SRM-bound accepted-language index. It is
> not an independent semantic legislature. Canonical terms are governed by SRL admission,
> SRM ownership binding, ADR decisions, DTO contracts, and PRD enforcement tests.
> Authority flows from: ADR-059/060/061 → DTO contract → PRD tests → this index.
> SRL record: `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml`

**Document type:** exemplar slice thesaurus  
**Artifact kind:** thin accepted-language registry  
**Status:** Draft — pending PRD gate  
**Date:** 2026-05-29  
**Governed by:** THESAURUS-DIRECTIVE-TIA-CANON.md  
**Authority order:** ADR-059 / ADR-060 / ADR-061 → DTO contract → PRD tests → this document  
**Related:** TIA-CANON-FIB-S-ZACHMAN.yaml, FIB-H-TIA-CANON-001-classification.yaml

---

## Purpose

This thesaurus is the accepted-language registry for the Table Inventory Accounting exemplar slice.

It records:

1. accepted canonical terms required by the exemplar;
2. legacy aliases observed in existing code, with mechanical dispositions;
3. the suppression inventory for active operator-visible surfaces;
4. the required acceptance tests.

It does not record rejected terminology, invented forbidden names, or hypothetical bad vocabulary.
A term absent from this thesaurus is absent from the canon.

---

## 1. Owner Declaration

```yaml
owner:
  subdomain: TableInventoryAccounting
  parent_context: TableContextService
  write_authority: none
  derivation_mode: read_time_derivation
```

`TableInventoryAccounting` owns the formula and DTO shape only. It does not author financial facts,
outbox rows, telemetry facts, or reconciliation records.

---

## 2. Canonical Formula

```
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

Invariants:

- No `COALESCE(telemetry_derived_drop_estimate_cents, 0)` anywhere in the derivation path.
- `null` SUM means no qualifying telemetry rows exist — that is `none_for_session`, not zero.
- `0` means qualifying rows exist and sum to zero.
- No additional formula operands. No gaming-day fallback. No competing formula on any active surface.

---

## 3. Accepted Canonical Terms

### 3.1 Result Fields

| Field | Type | State | Notes |
|---|---|---|---|
| `projected_table_win_loss_cents` | `number \| null` | Accepted | Non-null only when `calculation_kind = 'telemetry_drop_formula'`. |
| `partial_table_result_cents` | `number \| null` | Accepted | Non-null only when `calculation_kind = 'inventory_only'`. |
| `final_table_win_loss_cents` | `null` | Accepted — reserved, always null | Requires external custody authority + ADR/FIB amendment. Never implement in this slice. |

At most one result field is non-null per response.

---

### 3.2 Discriminator

| Field | Accepted Values | Notes |
|---|---|---|
| `drop_estimate_state` | `'present'` \| `'none_for_session'` | `'present'` iff `telemetry_derived_drop_estimate_cents` is non-null (including zero). |
| `calculation_kind` | `'telemetry_drop_formula'` \| `'inventory_only'` \| `'integrity_failure'` | Exactly one per response. States are mutually exclusive and exhaustive. |

---

### 3.3 Completeness Envelope

```ts
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
```

Rules:

- `'drop_estimate'` is the only valid entry in `missing_inputs`.
- Missing opener or closer is not `partial` — it is `integrity_failure`.
- `completeness.status = 'complete'` never upgrades `custody_status`.

---

### 3.4 Authority Envelope

```ts
custody_status: 'non_custody_estimate'

source_authority: {
  drop:      'telemetry_derived_estimate' | 'none'
  snapshots: 'table_inventory_snapshot'    // opener and closer only
  fills:     'table_fill'
  credits:   'table_credit'
}
```

Rules:

- `custody_status` is always `'non_custody_estimate'` in this slice.
- `source_authority.inventory` is superseded and must not appear in the final DTO contract.
- `fills` and `credits` must not be described as sourced from `table_inventory_snapshot`.

---

### 3.5 Integrity Field

| Field | Accepted Values | Notes |
|---|---|---|
| `integrity_issues` | `string[]` | Non-empty only when `calculation_kind = 'integrity_failure'`. Known values: `'missing_opening_inventory_snapshot'`, `'missing_closing_inventory_snapshot'`. |

---

### 3.6 Formula Input Fields

| Field | Source | Notes |
|---|---|---|
| `telemetry_derived_drop_estimate_cents` | `table_buyin_telemetry` session-scoped SUM | The sole drop-like formula input. `source_authority.drop = 'telemetry_derived_estimate'` when present. |
| `opening_inventory_cents` | `table_inventory_snapshot` (opener) | Absence after resolution = `integrity_failure`. Zero is a valid count. |
| `closing_inventory_cents` | `table_inventory_snapshot` (closer) | Absence after resolution = `integrity_failure`. Zero is a valid count. |
| `fills_cents` | `table_fill` aggregate | Subtracted in formula. |
| `credits_cents` | `table_credit` aggregate | Added in formula. |

---

### 3.7 Telemetry Kind Enumeration (Source Predicate)

Qualifying `telemetry_kind` values for the session-scoped SUM:

| Kind | Included | Attribution |
|---|---|---|
| `RATED_BUYIN` | Yes | Rated player buy-in; requires `visit_id` + `rating_slip_id`. |
| `GRIND_BUYIN` | Yes | Anonymous/unrated; `visit_id IS NULL`, `rating_slip_id IS NULL`. |
| `RATED_ADJUSTMENT` | No — predicate exclusion | Explicitly excluded per ADR-060 D2. Rows may exist in the table; the WHERE clause excludes them. |

`RATED_ADJUSTMENT` is documented here as a predicate exclusion, not as a general thesaurus concept.
New kinds require an ADR/FIB amendment before inclusion — exclusion is not automatic by default.

---

### 3.8 Frozen SQL Source Predicate

```sql
telemetry_derived_drop_estimate_cents =
  SUM(tbt.amount_cents)
  FROM table_buyin_telemetry tbt
  WHERE tbt.casino_id     = ts.casino_id
    AND tbt.table_id      = ts.gaming_table_id
    AND tbt.telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
    AND tbt.occurred_at  >= ts.opened_at
    AND tbt.occurred_at  <  COALESCE(ts.closed_at, NOW())
  -- ts = table_session row for this session
```

Index supporting this predicate: `idx_tbt_kind` on `(casino_id, table_id, telemetry_kind, occurred_at)` — no new migration required.

---

### 3.9 Accepted Surface Labels

```yaml
accepted_surface_labels:
  telemetry_drop_formula:
    label: Projected Win/Loss
    required_qualifier: "Includes telemetry-derived drop estimate. Non-custody. Not final."
  inventory_only:
    label: Partial Table Result
    required_qualifier: Disclose missing inputs (e.g. "Drop estimate not available for this session")
  integrity_failure:
    label: none
    behavior: Render integrity disclosure only. Neither result label may appear.
```

No other table-result label is part of this thesaurus. A label absent from this map is not a thesaurus entry. If it appears in existing code, classify it in the legacy alias disposition ledger below.

---

## 4. Legacy Alias Disposition Ledger

Legacy aliases are migration facts, not vocabulary. They are recorded here because they exist in the current codebase and could cross the exemplar boundary without explicit disposition.

### Disposition Rules

```yaml
legacy_alias_policy:
  may_exist_in_old_code: true
  may_cross_TableInventoryAccountingProjection_boundary: false
  may_be_rendered_on_active_operator_surface: false
  must_have_disposition_before_exemplar_acceptance: true
```

### Ledger

```yaml
legacy_aliases:

  - observed_name: win_loss_inventory_cents
    observed_location:
      - services/table-context/shift-metrics/dtos.ts:109
      - services/table-context/shift-metrics/service.ts:251,258,321,328
      - services/table-context/shift-checkpoint/crud.ts:144
      - services/reporting/shift-report/assembler.ts:370,380,383
      - components/shift-dashboard/table-metrics-table.tsx:277
      - supabase/migrations/20260114004336_rpc_shift_table_metrics.sql:59
      - supabase/migrations/20260219164631_prd036_shift_metrics_opening_baseline.sql:52
    observed_kind: field
    disposition: suppress_surface
    canonical_target: partial_table_result_cents
    rationale: >
      Inventory-only win/loss without drop. Superseded by the inventory_only result state.
      Active on shift dashboard surface — must be suppressed at exemplar delivery.

  - observed_name: win_loss_estimated_cents
    observed_location:
      - services/table-context/shift-metrics/dtos.ts:111
      - services/table-context/shift-metrics/service.ts:255,325,373
      - components/shift-dashboard-v3/center/metrics-table.tsx:99,104
      - services/reporting/shift-report/assembler.ts:381,383
      - supabase/migrations/20260114004336_rpc_shift_table_metrics.sql:60
    observed_kind: field
    disposition: suppress_surface
    canonical_target: projected_table_win_loss_cents
    rationale: >
      Estimated win/loss using gaming-day scoped drop. Superseded by
      projected_table_win_loss_cents (session-scoped). Active on shift dashboard — P0
      suppression required at exemplar delivery.

  - observed_name: estimated_drop_buyins_cents
    observed_location:
      - services/table-context/shift-metrics/dtos.ts:103
      - services/table-context/shift-metrics/service.ts:245,315,363-365
      - services/reporting/shift-report/assembler.ts:370
      - supabase/migrations/20260114004336_rpc_shift_table_metrics.sql:56
    observed_kind: field
    disposition: map_to_canonical
    canonical_target: telemetry_derived_drop_estimate_cents
    rationale: >
      Non-canonical field name; gaming-day scoped aggregate. Must not cross the new DTO
      boundary. Internal migration: re-derive from session-scoped SUM and expose as
      telemetry_derived_drop_estimate_cents.

  - observed_name: table_win_cents
    observed_location:
      - services/table-context/dtos.ts:26,657
      - services/table-context/rundown.ts:7,64,91
      - hooks/table-context/use-table-rundown.ts:9,51,73
      - components/table/rundown-summary-panel.tsx:11,148-150,335,349,354
      - components/table/rundown-report-card.tsx:83
      - services/table-context/rundown-report/dtos.ts:10,25,45,68
      - supabase/migrations/20260117153727_adr027_rpc_rundown.sql:8,66,77,171,173,186
      - supabase/migrations/20260224123748_prd038_rundown_persistence_schema.sql:33,58
    observed_kind: field
    disposition: suppress_surface
    canonical_target: null
    rationale: >
      PATCHED stub in the current rundown path. Always null when drop is not posted. No
      canonical target — replace with TableInventoryAccountingProjection consumption at
      the pit terminal surface.

  - observed_name: source_authority.inventory
    observed_location:
      - docs/80-adrs/ADR-059-table-inventory-accounting-canon-ownership-and-formula.md
        (pre-ADR-060-D3 shape; superseded)
    observed_kind: DTO
    disposition: delete
    canonical_target: "source_authority.snapshots (opener and closer only)"
    rationale: >
      Misleading key implying fills and credits come from the snapshot. Corrected by
      ADR-060 D3. Must not appear in the final DTO contract.

  - observed_name: "Estimated Win/Loss" (surface label)
    observed_location:
      - components/shift-dashboard-v3/center/metrics-table.tsx (label pattern)
      - components/shift-dashboard/casino-summary-card.tsx
      - components/shift-dashboard/pit-metrics-table.tsx
    observed_kind: label
    disposition: suppress_surface
    canonical_target: "Projected Win/Loss"
    rationale: >
      Removed from allowed list per ADR-060 D4. Must not appear on any active operator
      surface after exemplar delivery.

  - observed_name: "Win/Loss" (unqualified label)
    observed_location:
      - components/table/rundown-summary-panel.tsx
      - components/table/rundown-report-card.tsx
      - components/shift-dashboard/table-metrics-table.tsx
      - components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx
      - components/shift-dashboard-v3/center/pit-table.tsx
      - components/shift-dashboard-v3/center/metrics-table.tsx
      - components/shift-intelligence/anomaly-alert-card.tsx
      - components/reports/shift-report/sections/
    observed_kind: label
    disposition: suppress_surface
    canonical_target: >
      "Projected Win/Loss" (telemetry_drop_formula) or "Partial Table Result"
      (inventory_only) depending on calculation_kind. Suppress entirely if
      TableInventoryAccountingProjection is not yet wired.
    rationale: >
      Unqualified "Win/Loss" is reserved for final_table_win_loss_cents which requires
      external custody authority. Its presence on operator surfaces implies a false
      authority claim. Must be suppressed or replaced at exemplar delivery.

  - observed_name: rpc_shift_table_metrics (as drop source)
    observed_location:
      - services/table-context/shift-metrics/service.ts
      - supabase/migrations/20260114004336_rpc_shift_table_metrics.sql
    observed_kind: function
    disposition: outside_exemplar_boundary
    canonical_target: null
    rationale: >
      Uses gaming-day scope and COALESCE(SUM(...), 0). Both are forbidden for the canonical
      drop estimate per ADR-061 D5. The new TableInventoryAccounting module must implement
      its own session-scoped SUM independently.
```

---

## 5. Candidate Terms

No candidate terms are open at this time. All vocabulary decisions for the exemplar slice have been resolved by ADR-059, ADR-060, and ADR-061.

If a new term is proposed during PRD or implementation, it must be entered here under the candidate structure defined in the thesaurus directive (Section 8) before it may appear in any DTO, API contract, UI label, migration, or test.

---

## 6. Suppression Inventory

Every active operator-visible win/loss-like surface must be classified before exemplar acceptance.

### Disposition Values

```yaml
surface_disposition:
  - consume_projection    # wire to TableInventoryAccountingProjection
  - suppress              # remove value; show nothing until projection is wired
  - delete                # remove surface element entirely
  - outside_exemplar_boundary  # demonstrably not part of active operator workflow
```

### Surface Inventory

```yaml
suppression_inventory:

  components:
    - surface: components/table/rundown-summary-panel.tsx
      field: table_win_cents
      current_label: "Table Win/Loss"
      disposition: consume_projection
      canonical_replacement: TableInventoryAccountingProjection.projected_table_win_loss_cents
        or partial_table_result_cents per calculation_kind

    - surface: components/table/rundown-report-card.tsx
      field: table_win_cents
      current_label: "Win/Loss"
      disposition: consume_projection
      canonical_replacement: TableInventoryAccountingProjection per calculation_kind

    - surface: components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx
      field: win_loss_estimated_cents
      current_label: "Win/Loss"
      disposition: suppress
      note: Wire to TableInventoryAccountingProjection or suppress pending projection wire.

    - surface: components/shift-dashboard-v3/center/metrics-table.tsx
      field: win_loss_estimated_cents
      current_label: "Win/Loss (Est)"
      disposition: suppress
      note: P0 — active operator surface rendering competing formula.

    - surface: components/shift-dashboard-v3/center/pit-table.tsx
      field: win_loss_estimated_cents
      current_label: "Win/Loss"
      disposition: suppress

    - surface: components/shift-dashboard/table-metrics-table.tsx
      field: win_loss_inventory_cents
      current_label: "Win/Loss"
      disposition: suppress
      note: Inventory-only formula; no drop. Must be suppressed.

    - surface: components/shift-dashboard/pit-metrics-table.tsx
      fields:
        - win_loss_inventory_cents
        - win_loss_estimated_cents
      current_labels:
        - "Win/Loss (Inv)"
        - "Win/Loss (Est)"
      disposition: suppress
      note: Both labels are non-canonical. Both must be suppressed.

    - surface: components/shift-dashboard/casino-summary-card.tsx
      fields:
        - win_loss_inventory_cents
        - win_loss_estimated_cents
      current_labels:
        - "Win/Loss (Inventory)"
        - "Win/Loss (Estimated)"
      disposition: suppress

    - surface: components/pit-panels/analytics-panel.tsx
      disposition: outside_exemplar_boundary
      note: Review at Phase 2 slice — not part of active per-session operator workflow.

    - surface: components/reports/shift-report/sections/
      fields:
        - win_loss_inventory_cents
        - win_loss_estimated_cents
      disposition: suppress
      note: Report section must not render legacy labels after exemplar delivery.

  services:
    - surface: services/table-context/rundown.ts
      field: table_win_cents
      disposition: consume_projection
      note: Rundown RPC wrapper — wire to TableInventoryAccountingProjection or suppress stub.

  fields_requiring_disposition_at_DTO_boundary:
    - win_loss_inventory_cents
    - win_loss_estimated_cents
    - estimated_drop_buyins_cents
    - table_win_cents
```

The PRD acceptance gate must prove no active operator-visible surface renders a competing
table-result formula after exemplar acceptance.

---

## 7. Required Acceptance Tests

```yaml
required_acceptance_tests:

  TIA-CANON-RATED-ADJUSTMENT-EXCLUSION:
    proves: >
      RATED_ADJUSTMENT rows do not contribute to telemetry_derived_drop_estimate_cents.
    setup: >
      Table session with valid opener/closer/fill/credit.
      Telemetry: RATED_BUYIN 10_000 cents, GRIND_BUYIN 5_000 cents,
      RATED_ADJUSTMENT 999_999 cents — all within session window.
    expected:
      telemetry_derived_drop_estimate_cents: 15_000
      drop_estimate_state: present
      calculation_kind: telemetry_drop_formula
      projected_table_win_loss_cents: uses 15_000 only

  TIA-CANON-NULL-VS-ZERO:
    proves: >
      No qualifying rows → null/none_for_session.
      Qualifying rows summing to zero → 0/present.
    setup:
      case_a: No RATED_BUYIN or GRIND_BUYIN rows in session window.
      case_b: One RATED_BUYIN row with amount_cents = 0.
    expected:
      case_a:
        telemetry_derived_drop_estimate_cents: null
        drop_estimate_state: none_for_session
        calculation_kind: inventory_only
      case_b:
        telemetry_derived_drop_estimate_cents: 0
        drop_estimate_state: present
        calculation_kind: telemetry_drop_formula

  TIA-CANON-SESSION-SCOPE-ONLY:
    proves: >
      Rows outside session window do not contribute. gaming_day does not scope the SUM.
    setup: >
      Same table, same gaming day, two sessions A and B.
      Insert RATED_BUYIN rows in both session windows.
    expected:
      session_a_projection: includes only session A rows
      session_b_projection: includes only session B rows
      gaming_day_alone: never scopes the SUM

  TIA-CANON-SURFACE-LABEL-CONFORMANCE:
    proves: Exemplar surfaces render only accepted_surface_labels.
    expected:
      telemetry_drop_formula: renders "Projected Win/Loss" with non-custody qualifier
      inventory_only: renders "Partial Table Result" with missing-inputs disclosure
      integrity_failure: renders no result label; renders integrity disclosure only
      forbidden_labels_absent:
        - "Estimated Win/Loss"
        - "Win/Loss" (unqualified)
        - "Final Win/Loss"
        - "Total Drop"
        - "Posted Drop"

  TIA-CANON-SOURCE-AUTHORITY-SHAPE:
    proves: source_authority uses drop/snapshots/fills/credits, not inventory.
    expected:
      source_authority:
        drop: "'telemetry_derived_estimate' | 'none'"
        snapshots: "'table_inventory_snapshot'"
        fills: "'table_fill'"
        credits: "'table_credit'"
      forbidden_keys:
        - source_authority.inventory

  TIA-CANON-INTEGRITY-FAILURE-SUPPRESSION:
    proves: >
      Missing opener or closer suppresses result fields and surfaces integrity_issues.
    setup: Table session with no closing inventory snapshot linked.
    expected:
      calculation_kind: integrity_failure
      projected_table_win_loss_cents: null
      partial_table_result_cents: null
      integrity_issues: ["missing_closing_inventory_snapshot"]
      surface: no result label rendered

  TIA-CANON-LEGACY-ALIAS-BOUNDARY:
    proves: Legacy aliases do not cross DTO/API/surface boundaries.
    expected:
      win_loss_inventory_cents: absent from TableInventoryAccountingProjection fields
      win_loss_estimated_cents: absent from TableInventoryAccountingProjection fields
      estimated_drop_buyins_cents: absent from TableInventoryAccountingProjection fields
      table_win_cents: absent from TableInventoryAccountingProjection fields
      source_authority.inventory: absent from DTO shape
```

---

## 8. Closing Rule

This thesaurus grows only by accepted terminology.

Non-canonical language is handled by disposition, not definition.

Candidate language is handled by decision, not drift.

Absence from this thesaurus means absence from the canon.

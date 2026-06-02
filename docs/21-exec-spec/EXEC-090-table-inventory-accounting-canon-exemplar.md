---
id: EXEC-090
prd: PRD-090
prd_title: "Table Inventory Accounting Canon Exemplar"
service: TableContextService
mvp_phase: 3
stage: 1-skeleton
gov010_check: passed
complexity_prescreen: full
http_boundary: true
write_path_classification: none
fib_s_loaded: false
fib_s_absence_rationale: >
  No FIB-S is loaded for this EXEC. Traceability authority is PRD-090 plus
  SRL-TIA-001 (admitted 2026-05-29) and the frozen ADR spine: ADR-059/060/061
  (all accepted 2026-05-29). WS1 must verify this posture is intentional and
  that no FIB-S exists for the PRD-090 slice before asserting
  fib_traceability_posture_declared=true.

workstreams:
  WS1:
    name: SRM Preflight Closure
    description: "Resolve governance blockers: SRM table_buyin_telemetry consumed-input gap (overview row 110), ADR-059/060/061 status verification, idx_tbt_kind index preflight (confirmed present), financial outbox posture gate, pre-PRD-038 session guard."
    executor: lead-architect
    executor_type: skill
    depends_on: []
    outputs:
      - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
    gate: lint
    estimated_complexity: low

  WS2:
    name: TableInventoryAccounting Read-Time Derivation
    description: "Implement TableInventoryAccounting module (three-result-state machine: telemetry_drop_formula / inventory_only / integrity_failure). FK+fallback snapshot resolution (DEC-3). Session-scope telemetry SUM (ADR-061 D2). Returns TableInventoryAccountingProjection DTO."
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - services/table-context/table-inventory-accounting.ts
      - services/table-context/dtos.ts
    gate: type-check
    estimated_complexity: high

  WS3:
    name: API BFF Boundary
    description: "Implement GET /api/v1/table-context/table-sessions/[sessionId]/accounting-projection. Simple Query pattern (ADR-041 DEC-4). RLS via set_rls_context_from_staff. Cross-casino sessionId returns HTTP 404."
    executor: api-builder
    executor_type: skill
    depends_on: [WS2]
    outputs:
      - app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/route.ts
      - app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/__tests__/route.test.ts
      - docs/25-api-data/API_SURFACE_MVP.md
    gate: type-check
    estimated_complexity: medium

  WS4:
    name: Pit Terminal Rundown Exemplar Wiring
    description: "Replace table_win_cents stub with TableInventoryAccountingProjection consumption. Render three states per calculation_kind. Suppress forbidden labels. Quarantine rpc_compute_table_rundown (DEC-2). WS5 suppression commits land in this phase."
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS3]
    outputs:
      - services/table-context/rundown.ts
      - hooks/table-context/use-table-rundown.ts
      - components/table/rundown-summary-panel.tsx
      - components/table/rundown-report-card.tsx
      - services/table-context/rundown-report/dtos.ts
    gate: type-check
    estimated_complexity: medium

  WS5:
    name: Legacy Alias Suppression Inventory
    description: "Execute pre-inventoried suppression from SRL-TIA-001 legacy_alias_disposition. Suppress win_loss_inventory_cents, win_loss_estimated_cents, estimated_drop_buyins_cents, win_loss_estimated_total_cents, forbidden labels. Automated grep gate. Serialization suppression tests. LEGACY-API-001 type-check obligation."
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - services/table-context/shift-metrics/dtos.ts
      - services/table-context/shift-metrics/service.ts
      - services/table-context/shift-checkpoint/crud.ts
      - services/reporting/shift-report/assembler.ts
      - components/shift-dashboard/table-metrics-table.tsx
      - components/shift-dashboard-v3/center/metrics-table.tsx
      - components/shift-dashboard/casino-summary-card.tsx
      - components/shift-dashboard/pit-metrics-table.tsx
      - components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx
      - components/shift-dashboard-v3/center/pit-table.tsx
      - components/shift-intelligence/anomaly-alert-card.tsx
      - docs/issues/table-inventory-accounting-canon/PRD-090-WS5-legacy-consumer-suppression-inventory.md
      - __tests__/tia-suppression-gate.test.ts
      - services/table-context/shift-metrics/__tests__/shift-metrics-serialization.test.ts
    gate: type-check
    estimated_complexity: high

  WS6:
    name: Test and Enforcement Harness
    description: "Implement all listed tia.* test cases. SRL-TIA-001 enforcement test IDs bound to test cases (TIA-CANON-RATED-ADJUSTMENT-EXCLUSION, TIA-CANON-NULL-VS-ZERO, TIA-CANON-SESSION-SCOPE-ONLY, TIA-CANON-SOURCE-AUTHORITY-SHAPE, TIA-CANON-SURFACE-LABEL-CONFORMANCE, TIA-CANON-INTEGRITY-FAILURE-SUPPRESSION, TIA-CANON-LEGACY-ALIAS-BOUNDARY). SRL lint gate: hard_fail_count=0."
    executor: qa-specialist
    executor_type: skill
    depends_on: [WS2, WS3, WS4, WS5]
    outputs:
      - services/table-context/__tests__/tia-dto-contract.test.ts
      - services/table-context/__tests__/tia-five-operand-formula.test.ts
      - services/table-context/__tests__/tia-inventory-side-derivation.test.ts
      - services/table-context/__tests__/tia-snapshot-resolution.test.ts
      - services/table-context/__tests__/tia-null-vs-zero.test.ts
      - services/table-context/__tests__/tia-rated-adjustment-exclusion.test.ts
      - services/table-context/__tests__/tia-session-scope-only.test.ts
      - services/table-context/__tests__/tia-rpc-exclusion.test.ts
      - services/table-context/__tests__/tia-integrity-failure-suppression.test.ts
      - services/table-context/__tests__/tia-integrity-failure-log-emission.test.ts
      - services/table-context/__tests__/tia-consumer-render-only.test.ts
      - __tests__/tia-suppression-gate.test.ts
      - services/table-context/shift-metrics/__tests__/shift-metrics-serialization.test.ts
      - app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/__tests__/route.test.ts
    gate: test-pass
    estimated_complexity: high

execution_phases:
  - name: Phase 1 - Preflight
    parallel: [WS1]
    gates: [lint]

  - name: Phase 2 - Service Derivation and Suppression Inventory
    parallel: [WS2, WS5]
    gates: [type-check]
    enters_after: "Phase 1 lint gate passes"

  - name: Phase 3 - API Boundary
    parallel: [WS3]
    gates: [type-check]
    enters_after: "Phase 2 WS2 type-check gate passes"

  - name: Phase 4 - Rundown Exemplar and Suppression Commits
    parallel: [WS4]
    gates: [type-check]
    enters_after: "Phase 3 type-check gate passes. WS5 suppression commits land here."

  - name: Phase 5 - Test and Enforcement Harness
    parallel: [WS6]
    gates: [test-pass]
    enters_after: "Phase 4 type-check gate passes. All implementation workstreams complete."

# ──────────────────────────────────────────────────────────────────────────────
# Semantic Governance (SRL-TIA-001 binding — not parsed by validator)
# ──────────────────────────────────────────────────────────────────────────────
srl_binding:
  srl_ref: docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml
  semantic_layer: docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
  enforcement_test_ids:
    - TIA-CANON-RATED-ADJUSTMENT-EXCLUSION
    - TIA-CANON-NULL-VS-ZERO
    - TIA-CANON-SESSION-SCOPE-ONLY
    - TIA-CANON-SOURCE-AUTHORITY-SHAPE
    - TIA-CANON-SURFACE-LABEL-CONFORMANCE
    - TIA-CANON-INTEGRITY-FAILURE-SUPPRESSION
    - TIA-CANON-LEGACY-ALIAS-BOUNDARY
  semantic_lint_gate: "python scripts/semantic/srl_intake_lint.py"

# ──────────────────────────────────────────────────────────────────────────────
# Decisions (PRD §7.3 + SRL open questions)
# ──────────────────────────────────────────────────────────────────────────────
decisions:
  DEC-1:
    question: "Mandatory opener-capture step to eliminate first-session integrity_failure?"
    resolution: "No. integrity_failure is the correct canonical outcome per ADR-059 D5. Deferred as a separate investigation."
    authority: ADR-059
    verification: cited

  DEC-2:
    question: "Drop or quarantine rpc_compute_table_rundown after WS4 wiring?"
    resolution: "Quarantine. WS6 tia.rpc_compute_table_rundown_fate grep/AST test proves no active operator path calls it."
    authority: PRD-090-R3
    verification: tested

  DEC-3:
    question: "FK-only or FK+fallback snapshot resolution? (SRL-TIA-001 snapshot_resolution_paths.implementation_commitment)"
    resolution: "FK+fallback (dual-path). snapshot_type = 'open'/'close' only. Stale-FK (session_id mismatch or IS NULL pre-PRD-038) falls through to session-linked fallback. Null after exhaustion = integrity_failure."
    authority: SRL-TIA-001
    verification: tested

  DEC-4:
    question: "Data aggregation pattern for new GET route (ADR-041 D2 requirement)?"
    resolution: "Simple Query. Single entity, single bounded context, no cross-context aggregation."
    authority: ADR-041-D2
    verification: cited

# ──────────────────────────────────────────────────────────────────────────────
# Authority stack (informational)
# ──────────────────────────────────────────────────────────────────────────────
authority_stack:
  prd_ref: docs/10-prd/PRD-090-table-inventory-accounting-canon-exemplar-v0.md
  scope_authority: docs/issues/table-inventory-accounting-canon/planning/PRD-TIA-CANON-KICKOFF-DIRECTIVE.md
  adr_refs:
    - docs/80-adrs/ADR-059-table-inventory-accounting-canon-ownership-and-formula.md
    - docs/80-adrs/ADR-060-drop-taxonomy-and-naming-standard.md
    - docs/80-adrs/ADR-061-session-scope-aggregation-boundary.md

# ──────────────────────────────────────────────────────────────────────────────
# Validation gates (informational — workstream gate field is the enforced reference)
# ──────────────────────────────────────────────────────────────────────────────
gates:
  lint:
    command: "npm run lint -- --max-warnings=0"
    success_criteria: "Exit code 0; zero warnings"

  type-check:
    command: "npm run type-check"
    success_criteria: "Exit code 0"

  test-pass:
    command: "npm run test:ci > /tmp/tia-test-output.log 2>&1 && RUN_INTEGRATION_TESTS=true jest --config jest.integration.config.js --testPathPatterns='tia.*\\\\.int\\\\.test\\\\.ts$|tia.*\\\\.integration\\\\.test\\\\.ts$' > /tmp/tia-integration-output.log 2>&1 && python scripts/semantic/srl_intake_lint.py"
    success_criteria: "All listed tia.* test cases pass; tenant/role integration tests pass; SRL lint exits 0 with hard_fail_count=0"

  dod:
    commands:
      - "npm run type-check"
      - "npm run lint -- --max-warnings=0"
      - "npm run test:ci > /tmp/tia-test-output.log 2>&1"
      - "RUN_INTEGRATION_TESTS=true jest --config jest.integration.config.js --testPathPatterns='tia.*\\\\.int\\\\.test\\\\.ts$|tia.*\\\\.integration\\\\.test\\\\.ts$' > /tmp/tia-integration-output.log 2>&1"
      - "python scripts/semantic/srl_intake_lint.py"
    success_criteria: "All pass. Tenant/role integration tests pass. SRL lint hard_fail_count=0. Suppression gate passes."
---

# EXEC-090 — Table Inventory Accounting Canon Exemplar

**PRD:** PRD-090 (status: exec_authorized, DA-007)
**Service:** TableContextService.TableInventoryAccounting
**Stage:** 1-skeleton (awaiting Phase 1 execution)
**Created:** 2026-06-01

---

## Overview

This EXEC-SPEC implements the canonical `TableInventoryAccounting` read-time derivation module — the sole owner of the three-result-state machine — and wires the Pit Terminal Rundown as its first canonical consumer. It also suppresses all competing legacy table-result representations on active operator-visible surfaces.

The semantic model is already established through ADR-059/060/061 and admitted in SRL-TIA-001. This EXEC-SPEC converts that frozen canon into executable code and one deployed exemplar surface.

**This is not primarily a wiring exercise.** The framing in PRD-090 §1 is explicit: the system currently produces no correct table-result values. Three distinct failure modes are active. This EXEC-SPEC closes all three.

---

## SRL Semantic Governance

All workstream outputs for this slice are bound to **SRL-TIA-001** (`docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml`), the canonical semantic authority for `TableInventoryAccounting` terms.

**Canonical terms in use (no substitutes permitted):**

| Identifier | SRL Class | Surface Label |
|---|---|---|
| `projected_table_win_loss_cents` | derived_surface_value | "Projected Win/Loss" |
| `partial_table_result_cents` | derived_surface_value | "Partial Table Result" |
| `final_table_win_loss_cents` | reserved_null_this_slice | none (always null) |
| `telemetry_derived_drop_estimate_cents` | telemetry_fact | none (formula input only) |
| `drop_estimate_state` | lifecycle_state | none (internal discriminator) |
| `calculation_kind` | lifecycle_state | none (governs rendering logic) |

**Hard semantic laws (SRL-TIA-001 key_semantic_laws — all severity: hard):**
1. At most one result field (`projected_table_win_loss_cents` or `partial_table_result_cents`) non-null per response. `final_table_win_loss_cents` always null.
2. `drop_estimate_state = 'present'` iff `telemetry_derived_drop_estimate_cents` is non-null (including zero). Null ≠ zero. Never COALESCE.
3. `calculation_kind = 'integrity_failure'` implies both result fields null, `integrity_issues` non-empty, no result label rendered.
4. `custody_status = 'non_custody_estimate'` always. `completeness.status = 'complete'` never upgrades it.
5. Consumers render only — no surface, RPC, or component may derive its own table win/loss-like value from raw inputs.
6. No unqualified drop shorthand — all identifiers and prose must use `telemetry_derived_drop_estimate_cents` or the phrase "telemetry-derived drop estimate".

**Enforcement:** `python scripts/semantic/srl_intake_lint.py` — exits nonzero when `hard_fail_count > 0`. Must run before WS6 gate closes.

## Surface Classification (ADR-041)

**Rendering Delivery:** Client Shell — the existing Pit Terminal Rundown path remains interactive and hydrates the projection through the table-context hook. RSC Prefetch is rejected because rundown state changes during live table operation.

**Data Aggregation:** Simple Query — a single TableContext read-time projection derived from `table_session`, `table_inventory_snapshot`, `table_fill`, `table_credit`, and the SRM-registered consumed input `table_buyin_telemetry`. BFF RPC is rejected because this slice adds no SECURITY DEFINER derivation RPC and no write path. BFF Summary is rejected because there is no multi-context summary.

**Rejected Patterns:** Persisted projection store, event/outbox publication, standalone `TableAccountingService`, and client-side formula derivation are explicitly rejected for this slice.

**Metric Provenance:** `projected_table_win_loss_cents` and `partial_table_result_cents` are `derived_surface_value` / request-fresh / non-custody estimates. `telemetry_derived_drop_estimate_cents` is a `telemetry_fact` formula input sourced from `table_buyin_telemetry` and is not custody-authoritative. `final_table_win_loss_cents` is `reserved_null_this_slice`.

---

## Decisions

| ID | Question | Resolution | Authority |
|---|---|---|---|
| DEC-1 | Mandatory opener-capture step? | No — `integrity_failure` is correct canonical outcome per ADR-059 D5 | ADR-059 |
| DEC-2 | Drop or quarantine `rpc_compute_table_rundown`? | Quarantine — WS6 grep/AST test proves no active caller | PRD-090 R3 |
| DEC-3 | FK-only or FK+fallback snapshot resolution? | FK+fallback; `snapshot_type = 'open'/'close'` only; stale-FK (session_id mismatch or IS NULL) falls through | SRL-TIA-001 |
| DEC-4 | Data aggregation pattern for new GET route? | Simple Query (ADR-041 D2) — single entity, single bounded context | ADR-041 |

---

## Workstream Summary

| ID | Name | Executor | Depends | Gate | Complexity |
|---|---|---|---|---|---|
| WS1 | SRM Preflight Closure | lead-architect | — | lint | low |
| WS2 | TableInventoryAccounting Derivation | backend-service-builder | WS1 | type-check | high |
| WS3 | API BFF Boundary | api-builder | WS2 | type-check | medium |
| WS4 | Pit Terminal Rundown Wiring | frontend-design-pt-2 | WS3 | type-check | medium |
| WS5 | Legacy Alias Suppression | backend-service-builder | — | type-check | high |
| WS6 | Test and Enforcement Harness | qa-specialist | WS2–WS5 | test-pass | high |

---

## Execution Phases

```
Phase 1: [WS1]       Preflight gate (lint) — blocks all
Phase 2: [WS2, WS5]  Service derivation + suppression inventory (parallel, type-check)
Phase 3: [WS3]       API boundary (type-check)
Phase 4: [WS4]       Rundown exemplar + WS5 suppression commits (type-check)
Phase 5: [WS6]       Test + enforcement harness (test-pass)
```

> **Phase 4 invariant**: WS5 suppression commits land with WS4. The exemplar landing is atomic — the Rundown is wired to the projection and legacy fields are suppressed simultaneously.

---

## WS1 — SRM Preflight Closure

**Executor:** lead-architect | **Gate:** lint | **Blocks:** WS2

Required actions:
1. Confirm ADR-059, ADR-060, ADR-061 status = Accepted (CLOSED 2026-05-29 — verify on disk).
2. Update SRM `TableContextService` main-overview row (SERVICE_RESPONSIBILITY_MATRIX.md line 110) to add `table_buyin_telemetry` as a consumed-input footnote. The narrative at SRM §494 and the SRL-TIA-001 `srm_ownership_gaps` entry both declare this gap; the overview table row must be reconciled.
3. Confirm `TableInventoryAccounting` is a subdomain of `TableContextService` — not a standalone bounded context.
4. Index preflight: `idx_tbt_kind` on `(casino_id, table_id, telemetry_kind, occurred_at)` confirmed in migration `20260114003530_table_buyin_telemetry.sql`. No new migration required.
5. Financial outbox posture gate: confirm implementation-decoupled and source-stability checks pass per `docs/issues/table-inventory-accounting-canon/prd-090/OUTBOX-SEMANTIC-COMPATABILITY.md`.
6. Pre-PRD-038 session guard:
   ```sql
   SELECT COUNT(*) FROM table_session
   WHERE opened_at < '2026-02-24'
     AND (closed_at IS NULL OR closed_at > NOW() - INTERVAL '1 day');
   -- Expected: 0. If non-zero: block WS2 and escalate.
   ```

**Exit gate (ws1-srm-preflight):**
```yaml
adr_status_accepted: true              # ADR-059, ADR-060, ADR-061
table_buyin_telemetry_ownership_gap: resolved_in_srm
no_new_bounded_context: true
idx_tbt_kind_verified: true
financial_outbox_posture:
  implementation_decoupled: true
  source_stability_dependency_satisfied: true
  outbox_changes_required: false
no_recent_or_open_pre_prd038_session_exists: true  # closed_at IS NULL OR closed_at > NOW() - INTERVAL '1 day'
fib_traceability_posture_declared: true            # FIB-S absent by design; authority = FIB-H + SRL-TIA-001 + ADR-059/060/061
```

---

## WS2 — TableInventoryAccounting Read-Time Derivation

**Executor:** backend-service-builder | **Gate:** type-check | **Depends:** WS1

**Target file:** `services/table-context/table-inventory-accounting.ts`
(single file; extract to a folder only if a second file is unavoidable)

**SRL terms active:** `projected_table_win_loss_cents`, `partial_table_result_cents`, `final_table_win_loss_cents`, `telemetry_derived_drop_estimate_cents`, `drop_estimate_state`, `calculation_kind`

**Service interface (Pattern A — manual, contract-first):**
```typescript
interface TableInventoryAccountingService {
  derive(params: { tableSessionId: string; casinoId: string; requestId: string }):
    Promise<TableInventoryAccountingProjection>
}
```

`casinoId` is required and must come from `mwCtx.rlsContext!.casinoId` after `set_rls_context_from_staff()` succeeds. The service must not derive caller tenancy from the target `table_session` row alone.

**Input resolution (DEC-3 — FK+fallback):**

| Input | Primary path | Fallback | Null = |
|---|---|---|---|
| opener | `opening_inventory_snapshot_id` → `COALESCE(total_cents::bigint, chipset_total_cents(chipset))` | `snapshot_type = 'open'` WHERE `session_id = table_session.id` ORDER BY `created_at DESC, id DESC` LIMIT 1 | `integrity_failure` |
| closer | `closing_inventory_snapshot_id` → same COALESCE | `snapshot_type = 'close'` WHERE `session_id = table_session.id` ORDER BY `created_at DESC, id DESC` LIMIT 1 | `integrity_failure` |
| fills | — | `COALESCE(SUM(table_fill.confirmed_amount_cents), 0)` WHERE `session_id = table_session.id AND status = 'confirmed'` | N/A (zero is valid) |
| credits | — | `COALESCE(SUM(table_credit.confirmed_amount_cents), 0)` WHERE `session_id = table_session.id AND status = 'confirmed'` | N/A (zero is valid) |

**Stale-FK rule:** If resolved snapshot has `session_id ≠ table_session.id` OR `session_id IS NULL` (pre-PRD-038 row) → fall through to session-linked fallback. `snapshot_type` values must be `'open'` / `'close'` only — `'OPENING'` / `'CLOSING'` are prohibited by the schema CHECK constraint.

**Snapshot fallback determinism:** If multiple session-linked snapshots exist for the same `session_id` and `snapshot_type`, use latest-row order `created_at DESC, id DESC`. The implementation must not call `.single()` on the fallback path without this deterministic ordering. WS2 must either cite the existing `idx_table_inventory_snapshot_session` plan as sufficient for session-bounded lookup or add a migration for `(session_id, snapshot_type)` if query-plan validation shows the existing index is insufficient.

**Fill/credit qualification:** TIA uses confirmed cashier amounts only. Requested-but-unconfirmed fills/credits are excluded from the formula. A confirmed row with `confirmed_amount_cents IS NULL` is an integrity failure for the relevant input class; do not fall back to requested `amount_cents`.

**`telemetry_derived_drop_estimate_cents` frozen predicate (ADR-061 D2):**
```sql
SUM(tbt.amount_cents)
FROM table_buyin_telemetry tbt
WHERE tbt.casino_id     = ts.casino_id
  AND tbt.table_id      = ts.gaming_table_id
  AND tbt.telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
  AND tbt.occurred_at  >= ts.opened_at
  AND tbt.occurred_at  <  COALESCE(ts.closed_at, upperBoundAt)
```
`RATED_ADJUSTMENT` excluded. Null SUM preserved — **never COALESCEd to 0**.

**Stable upper bound:** one `upperBoundAt` timestamp per derivation request (single SQL statement/transaction or captured once, reused across all service queries).

**Three-result-state machine:**
- `telemetry_drop_formula`: all 5 inputs non-null
- `inventory_only`: `telemetry_derived_drop_estimate_cents` null + opener+closer resolvable
- `integrity_failure`: opener or closer null after all resolution paths exhausted

**No persistence. No outbox. Stateless derivation.**

**Allowed diagnostic exception:** `integrity_failure` must emit one structured diagnostic through the local `emitTableInventoryAccountingDiagnostic()` helper exported from `services/table-context/table-inventory-accounting.ts`. This is the only permitted side effect in WS2; it must not write to the database, outbox, or audit log.

**`source_authority` keys:** `drop` / `snapshots` / `fills` / `credits` — NOT `inventory` (deleted by ADR-060 D3).

**Exit gate (ws2-service-derivation):**
```yaml
projection_generated_by_service_only: true
snapshot_resolution_uses_actual_snapshot_type_values: true  # 'open'/'close' only
open_session_upper_bound_stable_per_request: true
no_persistence: true
no_side_effects_except_integrity_diagnostic: true
no_consumer_recomputation: true
no_integer_cast_in_snapshot_resolution: true    # bigint only
fills_credits_source_predicate_declared: true
fills_credits_use_confirmed_amounts_only: true
stale_fk_fallthrough_rule_implemented: true     # covers session_id mismatch AND IS NULL
snapshot_fallback_deterministic: true           # ORDER BY created_at DESC, id DESC LIMIT 1
explicit_caller_casino_id_required: true
integrity_failure_diagnostic_emitted: true
```

---

## WS3 — API BFF Boundary

**Executor:** api-builder | **Gate:** type-check | **Depends:** WS2

**Route:** `GET /api/v1/table-context/table-sessions/[sessionId]/accounting-projection`
**File:** `app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/route.ts`

**ADR-041 DEC-4:** Data aggregation pattern = Simple Query.

**Route handler contract:**
- Accept `sessionId` from Next.js dynamic params (await params Promise — Next.js 15+)
- Validate `sessionId` with Zod UUID schema
- Call `set_rls_context_from_staff()` via `withRLS` middleware — no `casino_id` / `actor_id` / `role` params accepted
- Enforce route role guard before service execution: `ALLOWED_ROLES = new Set(['pit_boss', 'admin'])`; reject `dealer`, `cashier`, inactive staff, and unknown roles with HTTP 403 and no service invocation
- Pass `mwCtx.rlsContext!.casinoId` into `derive({ tableSessionId, casinoId, requestId })`
- Explicit `casino_id` predicate in service query (defense-in-depth per ADR-015 Pattern C)
- Cross-casino `sessionId` → HTTP 404 via `ServiceHttpResult NOT_FOUND` (not `integrity_failure` — avoids information leak)
- Return `ServiceHttpResult<TableInventoryAccountingProjection>`
- No formula logic in handler
- No call to `rpc_shift_table_metrics`

**Role matrix:** `pit_boss` / `admin` allowed; `dealer` / `cashier` denied. `floor_supervisor` is not a current `staff_role` enum value (`types/remote/database.types.ts`) and is out of scope until a role migration and generated type update land. Inactive staff are denied by authoritative context derivation.

Update `docs/25-api-data/API_SURFACE_MVP.md` with new route entry.

**Exit gate (ws3-api-boundary):**
```yaml
api_returns_projection: true
route_local_formula: false
rpc_shift_table_metrics_used: false
no_spoofable_identity_params: true
route_role_matrix_verified: true
route_negative_roles_verified: true             # dealer/cashier/unknown role → 403, no service invocation
tenant_isolation_verified: true
explicit_casino_id_predicate_in_query: true
cross_casino_response_is_404: true
service_receives_rls_context_casino_id: true
```

---

## WS4 — Pit Terminal Rundown Exemplar Wiring

**Executor:** frontend-design-pt-2 | **Gate:** type-check | **Depends:** WS3

**SRL surface labels (canonical — no substitutes):**
- `calculation_kind = 'telemetry_drop_formula'` → **"Projected Win/Loss"** + qualifier: *"Includes telemetry-derived drop estimate. Non-custody. Not final."*
- `calculation_kind = 'inventory_only'` → **"Partial Table Result"** + qualifier: *"Telemetry-derived drop estimate not available for this session."*
- `calculation_kind = 'integrity_failure'` → integrity disclosure only: *"Table result unavailable — [missing_opening_inventory_snapshot | missing_closing_inventory_snapshot]. Contact your supervisor."* — no result label rendered

**Files to modify (from SRL-TIA-001 `legacy_alias_disposition.table_win_cents`):**

| File | Lines | Change |
|---|---|---|
| `services/table-context/rundown.ts` | 7, 64, 91 | Remove `table_win_cents` stub |
| `hooks/table-context/use-table-rundown.ts` | 9, 51, 73 | Wire `TableInventoryAccountingProjection` |
| `components/table/rundown-summary-panel.tsx` | 11, 148–150, 335, 349, 354 | Three-state render; remove `table_win_cents` |
| `components/table/rundown-report-card.tsx` | 83 | Remove `table_win_cents` reference |
| `services/table-context/rundown-report/dtos.ts` | 10, 25, 45, 68 | Remove `table_win_cents` |

**Forbidden labels** (must not appear anywhere in Rundown path after WS4):
`"Win/Loss"` (unqualified), `"Final Win/Loss"`, `"Estimated Win/Loss"`, `"Total Drop"`, `"Posted Drop"`, `"Settled Result"`, `"Reconciled Result"`

**DEC-2:** `rpc_compute_table_rundown` quarantined — Rundown path must not call it. WS6 `tia.rpc_compute_table_rundown_fate` grep test enforces quarantine.

**Shift report placeholder:** Win/Loss section must render `"Table win/loss data unavailable during TIA canon migration"` (PRD-090 §8 Operational Readiness).

**WS5 suppression commits must land in this same phase.**

**Exit gate (ws4-rundown-wiring):**
```yaml
pit_terminal_rundown_consumes_projection: true
local_formula_removed: true
forbidden_labels_absent: true
ws5_suppression_commits_landed: true    # Phase 4 atomic invariant: suppression lands with rundown wiring
ws5_serialization_tests_pass: true
ws5_suppression_gate_passes: true
```

---

## WS5 — Legacy Alias Suppression Inventory

**Executor:** backend-service-builder | **Gate:** type-check | **Depends:** none

> Inventory start: immediately. Suppression commits: land with WS4 (Phase 4).

The suppression inventory is **pre-populated** from SRL-TIA-001 `legacy_alias_disposition`, but executor must still run a codebase scan before suppression commits land. Every active operator-visible occurrence must be classified as `consume_projection`, `suppress_rendering`, `suppress_serialization`, or `outside_operator_boundary_with_reason`.

**Required scan gate:**
```bash
rg -n "table_win_cents|win_loss_inventory_cents|win_loss_estimated_cents|win_loss_estimated_total_cents|win_loss_inventory_total_cents|estimated_drop_buyins_cents|Estimated Win/Loss|Final Win/Loss|Total Drop|Posted Drop|Settled Result|Reconciled Result|\\bWin/Loss\\b" app components hooks services __tests__ docs/80-adrs
```
All matches must appear in the suppression inventory doc with disposition and verification evidence.

### Suppression targets

**`win_loss_inventory_cents`** → `suppress_rendering` (canonical: `partial_table_result_cents`)
- `services/table-context/shift-metrics/dtos.ts`:109
- `services/table-context/shift-metrics/service.ts`:251, 258, 321, 328
- `services/table-context/shift-checkpoint/crud.ts`:144
- `services/reporting/shift-report/assembler.ts`:370, 380, 383
- `components/shift-dashboard/table-metrics-table.tsx`:277

**`win_loss_estimated_cents`** → `suppress_rendering` (canonical: `projected_table_win_loss_cents`)
- `services/table-context/shift-metrics/dtos.ts`:111
- `services/table-context/shift-metrics/service.ts`:255, 325, 373
- `components/shift-dashboard-v3/center/metrics-table.tsx`:99, 104
- `services/reporting/shift-report/assembler.ts`:381, 383

**`estimated_drop_buyins_cents`** → `suppress + map_to_canonical` (NOT usable as a field name; omit from DTO boundary)
- `services/table-context/shift-metrics/dtos.ts`:103
- `services/table-context/shift-metrics/service.ts`:245, 315, 363–365
- `services/reporting/shift-report/assembler.ts`:370

**`win_loss_estimated_total_cents`** + **`win_loss_inventory_total_cents`** → `suppress_rendering`
- `services/table-context/shift-metrics/dtos.ts`:169, 173, 175, 240, 244, 246

**`source_authority.inventory`** → `delete` (superseded by `source_authority.snapshots` per ADR-060 D3)
- `docs/80-adrs/ADR-059-...` (pre-ADR-060-D3 prose; doc update only)

**Surface labels** → `suppress_rendering`
- `"Estimated Win/Loss"`: `components/shift-dashboard-v3/center/metrics-table.tsx`, `components/shift-dashboard/casino-summary-card.tsx`, `components/shift-dashboard/pit-metrics-table.tsx`
- `"Win/Loss"` (unqualified): `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx`, `components/shift-dashboard-v3/center/pit-table.tsx`, `components/shift-dashboard-v3/center/metrics-table.tsx`, `components/shift-intelligence/anomaly-alert-card.tsx`, `components/reports/shift-report/sections/`

### Required artifacts

1. **Suppression inventory doc**: `docs/issues/table-inventory-accounting-canon/PRD-090-WS5-legacy-consumer-suppression-inventory.md`
   - Each consumer: file/path, disposition, reason, follow-up ticket, verification evidence
2. **Automated suppression gate**: `__tests__/tia-suppression-gate.test.ts`
   - Reads source files; asserts forbidden field names and labels absent from active operator-visible code
3. **Serialization suppression tests**: `services/table-context/shift-metrics/__tests__/shift-metrics-serialization.test.ts`
   - Proves `/api/v1/shift-dashboards/metrics/tables`, `/api/v1/shift-dashboards/metrics/pits`, `/api/v1/shift-dashboards/metrics/casino` API responses omit all forbidden fields

### LEGACY-API-001 type-check obligation
`npm run type-check` must pass after `ShiftTableMetricsDTO` field removal. All downstream consumers relying on removed fields must be fixed in this workstream.

**Exit gate (ws5-suppression-inventory):**
```yaml
active_surface_inventory_complete: true
active_surface_scan_completed: true
inventory_artifact_checked_in: true
shift_metric_operator_api_serialization_suppressed: true
no_competing_active_formula_survives: true
no_forbidden_surface_label_survives: true
no_forbidden_serialized_api_field_survives: true
automated_suppression_gate_passes: true
type_check_passes_after_legacy_api_001: true
```

---

## WS6 — Test and Enforcement Harness

**Executor:** qa-specialist | **Gate:** test-pass | **Depends:** WS2, WS3, WS4, WS5

All listed `tia.*` test cases must pass. These are test cases, not necessarily one file per row. Unit/contract cases run under `npm run test:ci`; tenant isolation and role matrix cases must also run under `RUN_INTEGRATION_TESTS=true jest --config jest.integration.config.js` because `test:ci` excludes `*.int.test.ts` and `*.integration.test.ts`.

| Test ID | SRL Enforcement ID | Proves |
|---|---|---|
| `tia.dto_contract` | TIA-CANON-SOURCE-AUTHORITY-SHAPE | Required semantic fields; `source_authority` uses `drop/snapshots/fills/credits` (NOT `inventory`); `final_table_win_loss_cents` always null; `custody_status` always `non_custody_estimate` |
| `tia.five_operand_formula` | — | `projected_table_win_loss_cents` = `telemetry_derived_drop_estimate_cents + closing_inventory_cents + credits_cents - opening_inventory_cents - fills_cents`; sign correctness per ADR-059 D2 |
| `tia.inventory_side_derivation` | — | `partial_table_result_cents` = 4-operand formula (no `telemetry_derived_drop_estimate_cents`); absent telemetry → `inventory_only` |
| `tia.snapshot_resolution` | TIA-CANON-NULL-VS-ZERO | FK+fallback works; fallback is deterministic with `ORDER BY created_at DESC, id DESC LIMIT 1`; duplicate open/close fixtures resolve predictably; `snapshot_type = 'open'/'close'` only; `OPENING`/`CLOSING` absent from queries; null `total_cents` + non-empty chipset resolves via `chipset_total_cents()` (not `integrity_failure`); stale-FK mismatch fallthrough; stale-FK IS NULL (pre-PRD-038) fallthrough; high-value chipset ≥ 2,147,483,648 cents resolves as `bigint` without overflow |
| `tia.snapshot_resolution_zero_tray` | — | `total_cents = 0` resolves as zero-tray; `calculation_kind = 'inventory_only'`; `opening_inventory_cents = 0` |
| `tia.null_vs_zero` | TIA-CANON-NULL-VS-ZERO | Zero qualifying rows → `telemetry_derived_drop_estimate_cents = null`; qualifying rows summing to 0 → `telemetry_derived_drop_estimate_cents = 0`; distinct `drop_estimate_state` |
| `tia.rated_adjustment_exclusion` | TIA-CANON-RATED-ADJUSTMENT-EXCLUSION | `RATED_ADJUSTMENT` rows do not affect `telemetry_derived_drop_estimate_cents` |
| `tia.confirmed_fill_credit_only` | — | Requested-but-unconfirmed fills/credits are excluded; confirmed rows use `confirmed_amount_cents`; confirmed rows with null confirmed amount produce integrity failure |
| `tia.session_scope_only` | TIA-CANON-SESSION-SCOPE-ONLY | Rows outside session window excluded; same gaming-day but outside session excluded; open session uses stable `upperBoundAt` |
| `tia.rpc_exclusion` | — | `TableInventoryAccounting` does not call `rpc_shift_table_metrics`; Rundown exemplar path does not call `rpc_compute_table_rundown` |
| `tia.integrity_failure_suppression` | TIA-CANON-INTEGRITY-FAILURE-SUPPRESSION | Missing opener/closer → `integrity_failure`; both result fields null; `integrity_issues` non-empty; no result label rendered |
| `tia.integrity_failure_log_emission` | — | Mock `emitTableInventoryAccountingDiagnostic` from `services/table-context/table-inventory-accounting.ts`; invoke with missing-opener fixture; assert mock called with: `session_id`, `casino_id`, `calculation_kind`, `integrity_issues`, `request_id`. No stdout scraping. |
| `tia.consumer_render_only` | TIA-CANON-SURFACE-LABEL-CONFORMANCE | Rundown renders `calculation_kind`/`projected_table_win_loss_cents`/`partial_table_result_cents` as received; no recomputation from raw fields |
| `tia.active_surface_suppression_gate` | TIA-CANON-LEGACY-ALIAS-BOUNDARY | Forbidden fields and labels absent from active operator-visible render paths and serialized operator-facing API responses |
| `tia.shift_metric_api_suppression` | TIA-CANON-LEGACY-ALIAS-BOUNDARY | Shift table/pit/casino metric API responses omit `win_loss_inventory_cents`, `win_loss_estimated_cents`, `win_loss_estimated_total_cents`, `estimated_drop_buyins_cents`, and forbidden aliases |
| `tia.route_tenant_isolation` | — | Same `sessionId` from another casino returns no projection data |
| `tia.route_tenant_isolation_404` | — | Cross-casino `sessionId` returns HTTP 404 (not `200 { calculation_kind: integrity_failure }`) |
| `tia.route_role_matrix` | — | `pit_boss` and `admin` can read; `dealer`, `cashier`, unknown roles, and inactive staff cannot; denied roles return 403 and do not invoke `derive` |
| `tia.route_role_matrix_cross_casino` | — | Admin JWT from Casino A + Casino B `sessionId` → 404; admin from Casino A + own-casino `sessionId` → 200 |
| `tia.rpc_compute_table_rundown_fate` | — | Grep/AST proves no active operator-facing path calls `rpc_compute_table_rundown` (DEC-2 quarantine) |

**SRL semantic lint gate** (run before WS6 gate closes):
```bash
python scripts/semantic/srl_intake_lint.py
# Must exit 0. hard_fail_count must equal 0.
```

**Exit gate (ws6-test-harness):**
```yaml
all_listed_tia_tests_pass: true
tia_integration_tests_pass: true
srl_enforcement_test_ids_bound: true   # all 7 TIA-CANON-* IDs referenced in test comments
srl_lint_hard_fail_count: 0
no_semantic_regression: true
```

---

## Legacy Alias Suppression Map (from SRL-TIA-001)

| Field | Disposition | Key Files |
|---|---|---|
| `win_loss_inventory_cents` | suppress_rendering | shift-metrics/dtos.ts:109, service.ts:251,258,321,328, shift-checkpoint/crud.ts:144, assembler.ts:370,380,383, table-metrics-table.tsx:277 |
| `win_loss_estimated_cents` | suppress_rendering | shift-metrics/dtos.ts:111, service.ts:255,325,373, metrics-table.tsx:99,104, assembler.ts:381,383 |
| `estimated_drop_buyins_cents` | suppress + map | shift-metrics/dtos.ts:103, service.ts:245,315,363-365, assembler.ts:370 |
| `win_loss_estimated_total_cents` | suppress_rendering | shift-metrics/dtos.ts:175,244,246 |
| `table_win_cents` | consume_projection (WS4) | dtos.ts:26,657; rundown.ts:7,64,91; use-table-rundown.ts:9,51,73; rundown-summary-panel.tsx:11,148-150,335,349,354; rundown-report-card.tsx:83; rundown-report/dtos.ts:10,25,45,68 |
| `source_authority.inventory` | delete | ADR-059 doc (superseded prose) |
| "Estimated Win/Loss" label | suppress_rendering | metrics-table.tsx, casino-summary-card.tsx, pit-metrics-table.tsx |
| "Win/Loss" (unqualified) | suppress_rendering | hero-win-loss-compact.tsx, pit-table.tsx, metrics-table.tsx, anomaly-alert-card.tsx, shift-report/sections/ |

---

## Open Items for Executor Review

Before Phase 2 begins, executors should confirm:
1. `services/table-context/dtos.ts` lines 26, 657 — `table_win_cents` location in `TableRundownDTO`. Classify as `inactive_or_internal_only_with_reason` if not returned to any operator-facing API boundary after WS4 (WS5 is responsible for dtos.ts:26,657 entry in inventory; WS4 handles the rundown path entries).
2. Shift report `components/reports/shift-report/sections/` — identify which specific section files contain `"Win/Loss"` unqualified label before WS5 begins suppression.
3. `win_loss_inventory_total_cents` at `services/table-context/shift-metrics/dtos.ts`:173 — confirm this is an additional field to suppress alongside `win_loss_estimated_total_cents` (suppressed as part of the same DTO cleanup).

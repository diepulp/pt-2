---
artifact_id: PRD-090-EXEC-CLEARANCE-PLAN
type: preflight_gate_clearance_plan
status: ready_for_patch
prd: PRD-090
generated_date: 2026-05-30
investigated_by: parallel-preflight-audit
authority_stack:
  - PRD-090-PREFLIGHT.md (gate definitions)
  - PRD-090-REFRACTOR-BLAST-RADIUS-MAP.yaml (supporting context)
  - LEGACY-CONSUMERS-CLASSIFICATION-MAPPING.yaml (consumer inventory)
  - WAVE-2-TRACKER.json (outbox posture evidence)
purpose: >
  Gate-by-gate clearance verdict for all ten PRD-090 preflight checks plus five
  outbox posture checks. Identifies the two remaining bounded patches required
  before EXEC drafting may begin. All other gates are PASS with evidence.
---

# PRD-090 EXEC Clearance Plan

## Summary Verdict

PRD-090 is **one bounded documentation patch away from EXEC authorization.**

Ten preflight gates investigated. Eight PASS with evidence. Two require a single
patch to `LEGACY-CONSUMERS-CLASSIFICATION-MAPPING.yaml` to close
UNRESOLVED-001 and UNRESOLVED-002 (the pits and casino route inspections). That
patch is fully defined below — no new code, no schema migration, no SRL or SRM
changes required. All five outbox posture checks return ACCEPTABLE or DEFERRED.

---

## Gate Verdicts

### Gate 1 — Legacy Consumer Disposition Completeness

**Verdict: NEEDS PATCH (bounded)**

Four unresolved route.ts files were inspected. Two are clean; two require
suppression classification entries.

| Route | Finding | Action |
|---|---|---|
| `app/api/v1/shift-dashboards/metrics/pits/route.ts` (UNRESOLVED-001) | Delegates to service, returns ShiftPitMetricsDTO without filtering. DTO carries `win_loss_inventory_total_cents`, `win_loss_estimated_total_cents`, `estimated_drop_buyins_total_cents`. **Serializes 3 forbidden fields.** | Add as suppress_rendering extension of LEGACY-API-004 |
| `app/api/v1/shift-dashboards/metrics/casino/route.ts` (UNRESOLVED-002) | Delegates to service, returns ShiftCasinoMetricsDTO without filtering. DTO carries `win_loss_inventory_total_cents`, `win_loss_estimated_total_cents`, `estimated_drop_buyins_total_cents`. **Serializes 3 forbidden fields.** | Add as suppress_rendering extension of LEGACY-API-005 |
| `app/api/v1/shift-checkpoints/latest/route.ts` + delta (UNRESOLVED-003) | Uses authorized `win_loss_cents` consolidated field, NOT the forbidden split fields. **CLEAN.** | No action needed |
| `app/api/v1/shift-intelligence/anomaly-alerts/route.ts` (UNRESOLVED-004) | Uses `FinancialValue` wrappers (Wave 2 canonicalized). Zero forbidden field names in response DTO. **CLEAN.** | No action needed |

**Required patch:** See §Patches below.

---

### Gate 2 — Operator API Serialization Suppression

**Verdict: NEEDS PATCH (same patch as Gate 1)**

Confirmed via route inspection: both pits and casino routes return forbidden
fields in their operator-facing JSON responses through DTO passthrough. Suppression
action is DTO field removal (LEGACY-API-004 and LEGACY-API-005) plus route
serialization tests — both are already defined in the existing LEGACY-API entries.
The patch here is classification documentation only; implementation actions are
already prescribed.

---

### Gate 3 — Snapshot Schema Vocabulary Binding

**Verdict: PASS**

Evidence: migration `20251108195341_table_context_chip_custody.sql`
```sql
snapshot_type text NOT NULL CHECK (snapshot_type IN ('open', 'close', 'rundown'))
```
- Uppercase `OPENING` / `CLOSING` are prohibited by CHECK constraint and can never exist.
- `snapshot_kind` is a non-existent column — no query can target it.
- `'open'` and `'close'` are the only valid values for opener/closer resolution.

---

### Gate 4 — Snapshot Amount Resolution

**Verdict: PASS**

Evidence: migration `20260114003537_chipset_total_cents_helper.sql`

```sql
CREATE OR REPLACE FUNCTION public.chipset_total_cents(p_chipset jsonb)
RETURNS bigint LANGUAGE sql IMMUTABLE PARALLEL SAFE
```

- Function EXISTS, is callable from TypeScript service layer via Supabase SDK.
- Permissions: granted to `authenticated` and `service_role`.
- `table_inventory_snapshot.session_id` column EXISTS (added in
  `20260117153430_adr027_table_bank_mode_schema.sql`) — session-linked fallback
  queries are supported.
- `table_inventory_snapshot.total_cents` is nullable (confirmed) — COALESCE fallback
  to `chipset_total_cents()` is the correct resolution path per DA-004.

STOP-007 condition is satisfied. WS2 may proceed without additional function work.

---

### Gate 5 — SRL Snapshot Role Binding

**Verdict: PASS**

Evidence: `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml`

- `opener` is defined as a domain role bound to `snapshot_type = 'open'` (lowercase).
- `closer` is defined as a domain role bound to `snapshot_type = 'close'` (lowercase).
- Uppercase `OPENING` / `CLOSING` are explicitly documented as dead code that
  cannot be inserted (per schema CHECK constraint).
- `snapshot_kind` references exist only in explicitly-guarded conditional fallback
  paths (`(if FK-only is not adopted)`) — not normative implementation guidance.
- No canonical path uses `'opener'` or `'closer'` as SQL literals.

No SRL patch required.

---

### Gate 6 — SRM Consumed Input Patch

**Verdict: PASS**

Evidence: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

- `table_buyin_telemetry` is declared as a consumed input in the
  `TableContextService` section with explicit scope: "read-time derivation only;
  no write authority."
- `TableInventoryAccounting` is declared as a subdomain of `TableContextService`
  (confirmed in both SRM and SRL-TIA-001).
- The ownership gap documented in SRL-TIA-001 (`must_resolve_by: TIA_PRD_preflight_or_PRD_itself`)
  is resolved by the existing SRM Consumes declaration.

No SRM patch required.

---

### Gate 7 — Index Preflight

**Verdict: PASS**

Evidence: migration `20260114003530_table_buyin_telemetry.sql`

```sql
CREATE INDEX idx_tbt_kind
  ON table_buyin_telemetry (casino_id, table_id, telemetry_kind, occurred_at);
```

- Index EXISTS with all four required columns in the correct leading order.
- NFR-1 no-migration posture is confirmed. WS1 index verification exit gate is MET.

---

### Gate 8 — Source Availability

**Verdict: PASS**

All four required sources are queryable with session scope:

| Source | Status | Evidence |
|---|---|---|
| `table_inventory_snapshot` | PASS | `session_id` UUID FK added in `20260117153430_adr027_table_bank_mode_schema.sql`; queryable by `session_id` and `snapshot_type` |
| `table_buyin_telemetry` | PASS | Has `casino_id`, `table_id`, `telemetry_kind`, `occurred_at`, `amount_cents`; `idx_tbt_kind` covering index in place |
| `table_fill` | PASS | `session_id` UUID FK added in `20260224123748_prd038_rundown_persistence_schema.sql` (PRD-038); queryable by session |
| `table_credit` | PASS | `session_id` UUID FK added in same PRD-038 migration; queryable by session |

Note: The original `table_fill` / `table_credit` CREATE TABLE statements (in
`20251108195341_table_context_chip_custody.sql`) did not include `session_id`.
The FK was added in the PRD-038 migration. All four sources confirm QUERYABLE.

---

### Gate 9 — Uppercase Snapshot Fossil Cleanup

**Verdict: PASS**

Evidence: full scan of SRL-TIA-001, TIA-CANON-THESAURUS-ZACHMAN.yaml, ADR-059,
ADR-060, ADR-061.

- No implementation guidance contains `OPENING`, `CLOSING`, or `snapshot_kind` as
  active vocabulary.
- Uppercase variants are explicitly documented as dead code in SRL-TIA-001
  (lines 738–752) with the schema CHECK constraint citation.
- `snapshot_kind` references are strictly contained to conditional fallback paths
  marked `(if FK-only is not adopted)`.
- All ADR documents are free of uppercase fossil terms.

No artifact patches required.

---

### Gate 10 — EXEC Stop Conditions Acknowledged

**Verdict: PASS**

All ten EXEC stop conditions (STOP-001 through STOP-007 plus three additional)
are documented in `PRD-090-REFRACTOR-BLAST-RADIUS-MAP.yaml` under
`exec_stop_conditions`. The blast radius map and preflight document together
constitute the required EXEC scaffold acknowledgement.

---

## Outbox Posture Checks (OUTBOX-CHECK-001 through 005)

Wave 2 is at Phase 2.5 (observability + sign-off, in progress). All producer
paths are wired. Transport substrate is proven (I1–I4). The outbox is NOT a
blocking dependency for PRD-090 because PRD-090 reads directly from source
tables, not from the outbox or any projection store.

### OUTBOX-CHECK-001 — table_buyin_telemetry row presence

**Verdict: ACCEPTABLE**

`RATED_BUYIN` rows are written to `table_buyin_telemetry` by the
`bridge_rated_buyin_to_telemetry()` trigger at PFT authoring time (direct write,
same transaction). `GRIND_BUYIN` rows are written by `rpc_record_grind_observation`
(Phase 2.0 exemplar, Class B canonical path). Both paths write to TBT atomically
in the authoring transaction. PRD-090 reads directly from `table_buyin_telemetry`
— row presence is independent of relay propagation.

A null SUM (zero qualifying rows) is the correct signal for the `inventory_only`
path. PRD-090 handles this per ADR-061 D6 (preserve null — do not COALESCE to 0).

---

### OUTBOX-CHECK-002 — Rated buy-in bridge posture

**Verdict: ACCEPTABLE**

The `bridge_rated_buyin_to_telemetry()` trigger is a direct write path — it
writes `RATED_BUYIN` rows to `table_buyin_telemetry` synchronously within the
PFT INSERT transaction. Row presence does NOT depend on relay propagation or
outbox consumer work. Bug-2 (PRD-082) fixed the trigger's outbox emission path;
the TBT row creation was always stable.

PRD-090 must not recompute from PFT or shift-level metrics if RATED_BUYIN rows
are absent. Absent rows → null SUM → `inventory_only` (correct per three-result-
state model).

---

### OUTBOX-CHECK-003 — Grind/unrated telemetry authoring posture

**Verdict: ACCEPTABLE (with known operational caveat)**

`rpc_record_grind_observation` is the canonical GRIND_BUYIN authoring path
(Phase 2.0 exemplar). The GrindBuyinPanel was mounted to TablesPanel in Phase
2.4 (PWB-003 CLOSED). The authoring path is operationally wired.

Operational caveat: if no grind observations have been recorded for a given
session, the TBT SUM returns null → `inventory_only` path. This is the correct
canonical outcome per the three-result-state model, not a data integrity failure.
PRD-090 does not need GRIND_BUYIN rows to be present to function correctly.

---

### OUTBOX-CHECK-004 — Fills and credits as session-scoped inventory inputs

**Verdict: ACCEPTABLE**

`rpc_request_table_fill` and `rpc_request_table_credit` (wired in Phase 2.2, both
Dependency Events with `fact_class: operational`, `origin_label: estimated`) write
to `table_fill` and `table_credit` respectively. Both tables have a `session_id`
UUID FK added in migration `20260224123748_prd038_rundown_persistence_schema.sql`.

Session-scoped SUM via `WHERE session_id = $table_session_id` is directly
achievable. No schema migration is required before WS2.

---

### OUTBOX-CHECK-005 — bridge_pending and relay lag semantics

**Verdict: DEFERRED (as designed)**

`bridge_pending` is explicitly reserved vocabulary per ADR-059 — not implemented
in this slice. PRD-090 reads directly from `table_buyin_telemetry`, `table_fill`,
`table_credit`, and `table_inventory_snapshot`. It does not consume from the
outbox, any relay worker, or any projection store.

Relay lag is not a PRD-090 concern because:
1. PRD-090's inputs are source tables, not projection stores.
2. Authoring transactions commit TBT rows synchronously.
3. Any gap between authoring and visibility is transaction-scope (immediate on commit).

This deferral must be documented in EXEC as a known limitation per the blast
radius map `explicitly_deferred.bridge_pending_or_relay_lag_as_implemented_result_states`.

---

## Remaining Blockers (2 items)

Both blockers are documentation patches to a single file. No code changes, schema
migrations, SRL patches, or SRM patches are required.

### BLOCKER-1 — UNRESOLVED-001 and UNRESOLVED-002 route classifications

**File to patch:** `docs/issues/table-inventory-accounting-canon/LEGACY-CONSUMERS-CLASSIFICATION-MAPPING.yaml`

**Action:** Add the following two entries to the `api_and_dto_surfaces` list and
remove UNRESOLVED-001 and UNRESOLVED-002 from `unresolved_findings`.

---

#### Entry for UNRESOLVED-001 (pits route)

```yaml
- id: LEGACY-API-009
  path: app/api/v1/shift-dashboards/metrics/pits/route.ts
  exported_field_or_response: >
    GET /api/v1/shift-dashboards/metrics/pits — delegates to getShiftPitMetrics()
    or getShiftAllPitsMetrics(); returns ShiftPitMetricsDTO and ShiftTableMetricsDTO[]
    without field filtering. Forbidden fields serialized via DTO passthrough:
      win_loss_inventory_total_cents (ShiftPitMetricsDTO)
      win_loss_estimated_total_cents (ShiftPitMetricsDTO)
      estimated_drop_buyins_total_cents (ShiftPitMetricsDTO)
      win_loss_inventory_cents (ShiftTableMetricsDTO — via getShiftAllPitsMetrics)
      win_loss_estimated_cents (ShiftTableMetricsDTO)
      estimated_drop_buyins_cents (ShiftTableMetricsDTO)
  consumed_by:
    - hooks/shift-dashboard/http.ts (pits endpoint type assertion)
    - components/shift-dashboard/pit-metrics-table.tsx (LEGACY-CONSUMER-002)
    - components/shift-dashboard-v3/center/pit-table.tsx (LEGACY-CONSUMER-008)
  visibility: serialized_operator_facing_api
  disposition: suppress_rendering
  rationale: >
    Route delegates entirely to service; no independent field logic. Forbidden
    fields are serialized via DTO passthrough from ShiftPitMetricsDTO (LEGACY-API-004)
    and ShiftTableMetricsDTO (LEGACY-API-001). Suppression is achieved by DTO
    field removal per LEGACY-API-004 and LEGACY-API-001 — no additional route-level
    changes required beyond verifying the route does not add fields after DTO change.
  required_prd090_action: >
    After DTO field removal per LEGACY-API-004 and LEGACY-API-001, verify that
    this route no longer serializes forbidden fields. Add route serialization test
    for GET /api/v1/shift-dashboards/metrics/pits per WS5/WS6 acceptance criteria.
  exec_obligation: verify_after_dto_suppression
  extends: LEGACY-API-004
```

---

#### Entry for UNRESOLVED-002 (casino route)

```yaml
- id: LEGACY-API-010
  path: app/api/v1/shift-dashboards/metrics/casino/route.ts
  exported_field_or_response: >
    GET /api/v1/shift-dashboards/metrics/casino — delegates to getShiftCasinoMetrics();
    returns ShiftCasinoMetricsDTO without field filtering. Forbidden fields serialized
    via DTO passthrough:
      win_loss_inventory_total_cents (ShiftCasinoMetricsDTO)
      win_loss_estimated_total_cents (ShiftCasinoMetricsDTO)
      estimated_drop_buyins_total_cents (ShiftCasinoMetricsDTO)
  consumed_by:
    - hooks/shift-dashboard/http.ts (casino endpoint type assertion)
    - components/shift-dashboard/casino-summary-card.tsx (LEGACY-CONSUMER-003)
    - components/shift-dashboard-v3/shift-dashboard-v3.tsx (LEGACY-CONSUMER-009)
  visibility: serialized_operator_facing_api
  disposition: suppress_rendering
  rationale: >
    Route delegates entirely to service; no independent field logic. Forbidden
    fields are serialized via DTO passthrough from ShiftCasinoMetricsDTO
    (LEGACY-API-005). Suppression is achieved by DTO field removal per
    LEGACY-API-005 — no additional route-level changes required.
  required_prd090_action: >
    After DTO field removal per LEGACY-API-005, verify that this route no longer
    serializes forbidden fields. Add route serialization test for
    GET /api/v1/shift-dashboards/metrics/casino per WS5/WS6 acceptance criteria.
  exec_obligation: verify_after_dto_suppression
  extends: LEGACY-API-005
```

---

#### Updated final_verdict section

After adding LEGACY-API-009 and LEGACY-API-010 and removing UNRESOLVED-001 and
UNRESOLVED-002, update the `final_verdict` section:

```yaml
final_verdict:
  classification_complete: true
  classification_complete_caveat: null
  suppression_scope_summary:
    active_operator_visible_ui_consumers: 14      # LEGACY-CONSUMER-001 through 014
    api_and_dto_surfaces: 10                      # LEGACY-API-001 through 010
    rpc_and_query_sources: 4                      # LEGACY-RPC-001 through 004
    consume_projection: 2                         # LEGACY-CONSUMER-005, LEGACY-API-002
    suppress_rendering: 20                        # all non-exemplar active surfaces
    inactive_or_internal_only: 6
    unresolved_requiring_exec_inspection: 0       # was 4 — UNRESOLVED-003 and -004 are CLEAN
  blockers_before_exec: []
  safe_to_draft_exec_when:
    - every active consumer has one disposition (DONE — 14 UI + 10 API surfaces)
    - every suppress_rendering item has a concrete suppression action (DONE)
    - every consume_projection item is intentionally inside PRD-090 scope (DONE)
    - every inactive/internal item has proof it is not operator-visible (DONE)
    - four unresolved route.ts files inspected and classified (DONE — this patch)
```

---

## Clean Route Verdicts (no action required)

| Route | Verdict | Reason |
|---|---|---|
| `app/api/v1/shift-checkpoints/latest/route.ts` | CLEAN | Returns `win_loss_cents` consolidated field — not a forbidden split field |
| `app/api/v1/shift-checkpoints/delta/route.ts` | CLEAN | Same — `win_loss_cents` is an authorized downstream aggregate |
| `app/api/v1/shift-intelligence/anomaly-alerts/route.ts` | CLEAN | Returns `FinancialValue` wrapper types; zero forbidden field names in response DTO |

Note: `win_loss_cents` in `ShiftTableCheckpointDTO` is still forbidden at the
label level (`LEGACY-CONSUMER-014`, `LEGACY-API-008`) because the anomaly alert
card renders it with the "Win/Loss" label. But the API route itself does not
independently serialize forbidden split fields — it routes through the DTO that
is already classified.

---

## WS1 Exit Gate Status

After applying the BLOCKER-1 patch, the WS1 preflight exit gate is MET:

```yaml
WS1_exit_gate:
  adr_status: accepted                               # PASS — ADR-059/060/061 all Accepted 2026-05-29
  table_buyin_telemetry_ownership_gap: resolved_in_srm  # PASS — SRM Consumes declaration present
  no_new_bounded_context: true                       # PASS — confirmed subdomain
  idx_tbt_kind_verified_or_equivalent: true          # PASS — index confirmed in migration
  chipset_total_cents_available: true                # PASS — function confirmed in migration
  source_tables_session_queryable: true              # PASS — session_id FK on fill/credit confirmed
  snapshot_schema_vocabulary_confirmed: true         # PASS — CHECK constraint confirmed
  srl_snapshot_role_binding_confirmed: true          # PASS — SRL binds to open/close lowercase
  legacy_consumer_classification_complete: true      # PASS after BLOCKER-1 patch
  outbox_posture_checks_answered: true               # PASS — all 5 checks answered
  exec_stop_conditions_acknowledged: true            # PASS — documented in blast radius map
```

**Safe to draft EXEC-SPEC when:** BLOCKER-1 patch is committed to
`LEGACY-CONSUMERS-CLASSIFICATION-MAPPING.yaml`.

---

## Evidence Registry

| Gate | Evidence File | Key Lines / Sections |
|---|---|---|
| Gate 3 snapshot CHECK | `supabase/migrations/20251108195341_table_context_chip_custody.sql` | Line 14: `CHECK (snapshot_type IN ('open', 'close', 'rundown'))` |
| Gate 4 chipset_total_cents | `supabase/migrations/20260114003537_chipset_total_cents_helper.sql` | CREATE OR REPLACE FUNCTION |
| Gate 5 SRL role binding | `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml` | Lines 731–753 |
| Gate 6 SRM consumed input | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Line 498 |
| Gate 7 idx_tbt_kind | `supabase/migrations/20260114003530_table_buyin_telemetry.sql` | Lines 91–92 |
| Gate 8 session_id FK | `supabase/migrations/20260224123748_prd038_rundown_persistence_schema.sql` | Lines 130–144 |
| Gate 8 snapshot session_id | `supabase/migrations/20260117153430_adr027_table_bank_mode_schema.sql` | Lines 62–64 |
| Gate 9 fossil cleanup | `SRL-TIA-001-table-inventory-accounting.yaml` | Lines 738–752 (explicit rejection) |
| OUTBOX-001/002 TBT paths | `supabase/migrations/20260511134257_...` + `20260512021632_...` | Bug-2 fix; bridge trigger TBT write |
| OUTBOX-004 fill/credit session | `supabase/migrations/20260224123748_prd038_rundown_persistence_schema.sql` | Lines 130–144 |
| OUTBOX-CHECK posture | `WAVE-2-TRACKER.json` cursor (Phase 2.5, all producers wired) | transport_infrastructure_posture |

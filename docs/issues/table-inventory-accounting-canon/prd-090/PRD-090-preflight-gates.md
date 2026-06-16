PRD-090 is now cleared for EXEC. Here is the full picture from the investigation:

---

## Investigation Results — PRD-090 Preflight Gates

**8 of 10 gates: PASS (no action needed)**

| Gate                              | Verdict | Key Evidence                                                                                                                |
| --------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Gate 3 — Snapshot vocabulary      | PASS    | `CHECK (snapshot_type IN ('open', 'close', 'rundown'))` in migration `20251108195341`                                       |
| Gate 4 — chipset_total_cents()    | PASS    | Function EXISTS in migration `20260114003537`, callable from TS                                                             |
| Gate 5 — SRL role binding         | PASS    | SRL-TIA-001 correctly binds opener→`'open'`, closer→`'close'`; uppercase explicitly rejected as dead code                   |
| Gate 6 — SRM consumed input       | PASS    | SRM line 498 declares `table_buyin_telemetry` as consumed input for TableInventoryAccounting                                |
| Gate 7 — idx_tbt_kind             | PASS    | Index EXISTS with all 4 required columns in correct order                                                                   |
| Gate 8 — Source availability      | PASS    | `session_id` FK on `table_fill`/`table_credit` added in PRD-038 migration `20260224123748` (missed by initial schema scan)  |
| Gate 9 — Uppercase fossil cleanup | PASS    | No implementation guidance contains OPENING/CLOSING; all fossil references are explicitly rejected or gated as hypothetical |
| Gate 10 — EXEC stop conditions    | PASS    | Documented in blast radius map                                                                                              |

**2 gates patched in this session:**

- **Gate 1 + Gate 2** — Route inspections UNRESOLVED-001 through 004 resolved:
  - `/metrics/pits` route → **LEGACY-API-009** added (`suppress_rendering`, extends LEGACY-API-004)
  - `/metrics/casino` route → **LEGACY-API-010** added (`suppress_rendering`, extends LEGACY-API-005)
  - `/shift-checkpoints/*` routes → **CLEAN** (uses authorized `win_loss_cents` consolidation)
  - `/anomaly-alerts` route → **CLEAN** (uses `FinancialValue` wrappers, no forbidden field names)

**5 outbox posture checks (via financial-model-authority):**

| Check                                    | Verdict              | Rationale                                                                        |
| ---------------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| OUTBOX-001 — TBT row presence            | ACCEPTABLE           | Rows authored directly in authoring transactions; no relay dependency            |
| OUTBOX-002 — Rated bridge posture        | ACCEPTABLE           | `bridge_rated_buyin_to_telemetry` trigger writes TBT synchronously               |
| OUTBOX-003 — Grind authoring             | ACCEPTABLE           | GrindBuyinPanel wired in Phase 2.4; empty telemetry → `inventory_only` (correct) |
| OUTBOX-004 — Fills/credits session scope | ACCEPTABLE           | `session_id` FK confirmed on both tables                                         |
| OUTBOX-005 — bridge_pending semantics    | DEFERRED (by design) | ADR-059 explicitly reserves this; PRD-090 reads source tables directly           |

---

**Artifacts produced:**
1. `docs/issues/table-inventory-accounting-canon/prd-090/PRD-090-EXEC-CLEARANCE-PLAN.md` — full gate evidence registry and WS1 exit gate checklist
2. `LEGACY-CONSUMERS-CLASSIFICATION-MAPPING.yaml` patched — UNRESOLVED-001/002 promoted to LEGACY-API-009/010; UNRESOLVED-003/004 documented as CLEAN; `final_verdict` updated to `unresolved_requiring_exec_inspection: 0`

**PRD-090 WS1 exit gate is now fully met.** EXEC-SPEC drafting may begin.
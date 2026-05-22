# ADR-051: Pit Topology Canonicalization Standard

**Status:** Proposed
**Date:** 2026-04-20
**Owner:** FloorLayoutService (canonical topology authority); TableContextService (legacy compatibility consumer and retirement execution)
**Decision Scope:** Canonical source of truth for pit topology; deterministic bootstrap write point; legacy compatibility policy; writer prohibition rules; reader migration obligations; deprecation guardrails
**Triggered By:** FIB-PTC-001 — `docs/issues/gaps/pit-topology-canonization/FIB-PIT-TOPOLOGY-CANONIZATION.md`
**Related:** ADR-015 (RLS hybrid, SET LOCAL pooler-safe), ADR-018 (SECURITY DEFINER governance), ADR-024 (authoritative context derivation), ADR-028 (table status standardization), ADR-047 (operator–admin surface separation)

---

## Context

PT-2 carries two parallel models for pit topology:

1. **Legacy model** — `gaming_table.pit` (plain text column). Written by the onboarding wizard Step 3 (`app/(onboarding)/setup/_actions.ts:424`). Read by the pit terminal via `rpc_get_dashboard_tables_with_counts` (`supabase/migrations/20251228012528_dashboard_tables_batch_rpc.sql:68`) and by shift metrics.
2. **First-class model** — `floor_layout`, `floor_layout_version` (enum `draft|pending_activation|active|retired`), `floor_pit`, `floor_table_slot`, `floor_layout_activation`. Defined in `supabase/migrations/20251108223004_create_floor_layout_service.sql`. Read by the admin pit-configuration panel (PRD-067, `components/admin/pit-configuration-panel.tsx` → `services/floor-layout/crud.ts`).

The two models are disconnected in four observable ways:

- `rpc_bootstrap_casino` (`supabase/migrations/20260402002623_prd060_amend_rpc_bootstrap_casino.sql`) and `rpc_complete_casino_setup` (`supabase/migrations/20260211184700_create_rpc_complete_casino_setup.sql`) populate **zero** first-class rows.
- `rpc_activate_floor_layout` (lines 103–120 of the floor-layout migration) exists but no setup-time code path invokes it.
- `rpc_assign_or_move_table_to_slot` (`supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql:179`) mirrors **first-class → legacy only** (`UPDATE gaming_table SET pit = v_pit_label`). No reverse mirror exists.
- A wizard-completed casino therefore presents tables grouped by pit in the operator-facing terminal but renders an empty state in the admin pit-configuration panel — operators lose trust in the onboarding result.

This failure mode is not a defect in any single RPC. It is the result of an incomplete model transition: PT-2 never formally declared which pit-topology model is authoritative, where canonical bootstrap must occur, whether legacy writes remain permissible, or what obligations legacy readers inherit. This ADR closes that ambiguity by naming a single source of truth, a deterministic bootstrap point, explicit writer and reader rules, and a governed retirement path for the legacy column.

---

## Decisions

### D1 — First-Class Entities Are the Single Source of Truth

The tuple `{floor_layout, floor_layout_version, floor_pit, floor_table_slot, floor_layout_activation}` is the authoritative model for pit topology. Any product question of the form *"what pits does this casino have / where is this table assigned?"* is answered by reading these entities.

**Boundary.** This is a **data-ownership** decision. It does not prescribe UI surfaces or a layout designer — PRD-068 owns designer scope. This ADR concerns only where the truth lives and which writers/readers may touch it.

**Service ownership.** The canonical entities are owned by **FloorLayoutService** — all authoritative writes, schema changes, and activation logic live there. The `gaming_table.pit` compatibility projection (D3) is owned by **TableContextService** — including its emission from first-class write flows, its reader-migration coordination, and its eventual column removal. Cross-service coupling is one-way: FloorLayoutService owns canonical pit topology state; TableContextService may only consume that state to maintain the temporary compatibility projection.

### D2 — Setup Completion Is the Deterministic Canonical Bootstrap Write Point

A newly onboarded casino MUST have an active first-class layout before `rpc_complete_casino_setup` returns `setup_status = 'ready'`. Setup completion is the **single deterministic canonical bootstrap write point** for pit topology.

`rpc_complete_casino_setup` — or an internal RPC invoked transitively from it **within the same transaction** — MUST populate:

- `floor_layout`
- a v1 `floor_layout_version`
- one `floor_pit` per distinct onboarding-time pit value
- one `floor_table_slot` per table
- one active `floor_layout_activation` row (`deactivated_at IS NULL`)

The wizard's Step 3 text input is treated only as a **bootstrap hint feeding the first-class writer**, not as a destination of record.

**Prohibition.** No lazy or UI-triggered bootstrap import path is permitted for newly onboarded casinos. A casino MUST NOT reach `setup_status = 'ready'` without an active first-class layout.

**Rationale.** Canonical pit topology creation must be deterministic and independent of subsequent user navigation behavior. Allowing setup-time import for some casinos and admin-panel-triggered import for others reintroduces lifecycle inconsistency and hidden state divergence.

### D3 — `gaming_table.pit` Is a Compatibility Projection Only

The `gaming_table.pit` column is retained **only** as a one-way projection from the first-class model, maintained for backward compatibility while legacy readers migrate (see D4). No write path — application code, RPC, server action, or trigger — may treat `gaming_table.pit` as an authoritative source.

**Governing rule.** Every write to `gaming_table.pit` MUST be derived from a first-class source within the same transaction. The existing mirror in `rpc_assign_or_move_table_to_slot` (`:178–181`) is compliant and serves as the reference pattern. The legacy-authoritative write in `createGamingTableAction` (`app/(onboarding)/setup/_actions.ts:424`) is the canonical violation to remediate.

**Deprecation horizon.** Once reader migration (D4) is complete, the column becomes eligible for removal under a separate schema-change ADR. Until then it is load-bearing for compatibility and MUST NOT be dropped.

**Projection constraint.** The compatibility projection to `gaming_table.pit` is transitional and narrowly scoped. It MUST:

- exist only to preserve backward compatibility for identified legacy readers
- be emitted from first-class write flows only
- remain removable without affecting correctness of any canonical workflow
- never serve as a repair path for missing first-class state

**Governance note.** Compatibility projection by trigger is disfavored unless separately justified and governed in a follow-on ADR. The preferred pattern is explicit projection inside the canonical write RPC or service path.

**Retirement expectation.** The remediation PRD MUST identify the projection removal condition and track the remaining legacy readers to zero.

### D3A — Legacy Field Cannot Originate Pit Topology

No product workflow, RPC, server action, trigger, or background process may originate or modify pit topology by treating `gaming_table.pit` as a source of truth.

Any write to `gaming_table.pit` MUST be a compatibility projection derived from first-class entities **within the same transaction** as the authoritative first-class write.

A write pattern of the form **legacy first, canonical later** is prohibited. Such behavior is classified as a **data-integrity defect**, not an acceptable transitional compatibility seam.

**Canonical violation to retire.** `createGamingTableAction` remains the loudest example of a non-compliant legacy-authoritative write and MUST be remediated under the implementation PRD.

### D4 — Legacy Readers MUST Migrate

Every read path that currently touches `gaming_table.pit` — `rpc_get_dashboard_tables_with_counts`, shift-metrics derivations, and any downstream analytics — MUST migrate to read from the first-class model (joining through `floor_table_slot` and `floor_pit` on the active `floor_layout_version`). Each migrated reader retires one legacy dependency.

**Sequencing obligation.** Reader migration is incremental and may span multiple PRs. However, every PR that introduces a **new** read of pit topology MUST read from the first-class model. No new code may consume `gaming_table.pit` as a direct source. Code review rejects new legacy reads.

**No fallback.** A migrated reader MUST NOT fall back to `gaming_table.pit` when a first-class row is missing. An absent first-class row is a data-integrity finding, not a compatibility seam.

**Exit condition.** Reader migration is not open-ended. The remediation PRD MUST enumerate every known legacy reader of `gaming_table.pit`, assign a migration order, and drive the count of legacy readers to **zero**.

**Pilot gate.** If this effort is in pilot-critical scope, pilot exit requires zero production read dependencies on `gaming_table.pit` as a topology source, unless an explicit, time-bound exception is approved, recorded with owner and rationale, and linked to a removal milestone in the remediation PRD.

### D5 — Idempotency Gate on Active Activation

The bootstrap writer (per D2) MUST be a no-op when the casino already has any row in `floor_layout_activation` with `deactivated_at IS NULL`. An active layout is the terminal state; the writer does not re-enter.

**Rationale.** The first-class activation is the authoritative signal of "this casino is on the canonical model." Gating on it prevents duplicate writes across retries, re-invocations of `rpc_complete_casino_setup`, or concurrent transactional attempts.

### D6 — Explicit Exclusions

This ADR does not cover, and nothing in it authorizes:

- A layout designer or multi-version editing UI — deferred to PRD-068.
- Historical reconciliation of pit changes prior to first-class activation.
- Bidirectional mirroring between `gaming_table.pit` and the first-class model — rejected under FIB-PTC-001 §H and reaffirmed here.
- Changes to RLS, SECURITY DEFINER governance, or context-derivation rules beyond what ADRs 015/018/024 already mandate. Any new RPC introduced to satisfy D2 MUST comply with those three ADRs unchanged.

---

## Invariants

Once ADR-051 is implemented for a casino, the following invariants hold:

1. There is exactly **one active** `floor_layout_activation` row for the casino.
2. Every production pit-topology query resolves through the active first-class layout model.
3. `gaming_table.pit` is compatibility state only and is never used to originate topology.
4. A missing first-class mapping for a table is treated as an integrity finding, not a reason to fall back to legacy text.
5. New product code does not introduce additional direct dependencies on `gaming_table.pit`.

These invariants define successful canonicalization and should be validated in the remediation PRD's acceptance criteria and test plan.

---

## Compliance

### Writer-side

| Rule | Obligation |
|------|-----------|
| **W1** | No new write path may set `gaming_table.pit` without an in-transaction source from `floor_pit.label`. Existing non-compliant writes (notably `createGamingTableAction`) are permitted only as **temporary tracked exceptions**: each MUST be recorded in the G4 inventory with a named owner, a justification, and a removal date, and removal is a Definition-of-Done item for the remediation PRD. No new exceptions may be added. New violations outside the inventory fail review. |
| **W2** | `rpc_complete_casino_setup` returning `setup_status = 'ready'` implies exactly one active `floor_layout_activation` row for the casino (`deactivated_at IS NULL`). |
| **W3** | Any RPC participating in the bootstrap write path follows ADR-024 context derivation and ADR-018 SECURITY DEFINER governance; it does not accept `p_casino_id` or `p_actor_id`. |
| **W4** | The single-active-activation invariant (Invariants §1) MUST be enforced at the schema level — preferred form is a partial unique index on `floor_layout_activation (casino_id) WHERE deactivated_at IS NULL`, shipped by the remediation PRD in the same migration that introduces the bootstrap writer. Application-level enforcement alone is insufficient: it cannot survive concurrent RPC invocations, manual inserts, or out-of-band writes. Until the index is in place, Invariant §1 is an **obligation**, not a guarantee. |

### Reader-side

| Rule | Obligation |
|------|-----------|
| **R1** | No new read of pit topology may consume `gaming_table.pit` as a source. New reads go through `floor_table_slot` / `floor_pit` on the active `floor_layout_version`. |
| **R2** | Migrating an existing legacy reader retires one legacy dependency. The migrated reader MUST NOT fall back to `gaming_table.pit` on miss. |

### Governance

| Rule | Obligation |
|------|-----------|
| **G1** | The remediation PRD owns migration order for existing legacy readers (dashboard RPC, shift metrics, private analytics). Reader-migration progress is tracked in that PRD's Definition of Done, not in this ADR. |
| **G2** | `gaming_table.pit` MUST NOT be dropped until every reader has migrated under R2. Column removal requires a separate schema-change ADR invoked once G1 reaches zero. |
| **G3** | The codebase MUST mechanically prevent new direct topology reads from `gaming_table.pit` outside approved compatibility paths. Enforcement may be implemented via CI grep checks, lint rules, schema-access wrappers, or equivalent automated guardrails. |
| **G4** | The remediation PRD MUST maintain an explicit inventory of remaining legacy readers and projection paths, with each migration reducing that inventory. Completion is reached only when the inventory is empty, or when any remaining exception is explicitly time-bound and approved under the pilot gate in D4. |

---

## Consequences

### Positive

1. **One answer to "where do the pits live?"** — operator, admin, and analytics surfaces can agree.
2. **PRD-067 unblocked** — once D2 ships, the admin pit-configuration panel renders real data for every newly onboarded casino.
3. **Deprecation path becomes well-defined** — `gaming_table.pit` has a visible retirement trigger (D4 completion + G2), not an indefinite "some day."
4. **New writes and reads are cheap to review** — W1 and R1 are binary checks against a named column.

### Negative

1. **Bootstrap-flow widening.** Setup completion grows a mandatory side effect. Pilot-stage casinos that complete setup before the remediation PRD merges require a one-time back-mirror or manual intervention — scoped in the remediation PRD.
2. **Reader migration is fan-out work.** Dashboard RPC, shift metrics, and any private analytics move independently. The PRD tracks the list; this ADR only asserts the work must happen.
3. **Schema cannot drop `gaming_table.pit` yet.** The column remains until D4 and G2 complete. Schema audits must treat it as retained-for-compatibility, not abandoned.
4. **Hidden split-brain persists if reader migration stalls.** If first-class entities become canonical in principle but legacy readers remain in production, topology divergence may continue silently behind apparently functional surfaces. This ADR therefore requires both writer correction and reader retirement; either one alone is insufficient.
5. **`createGamingTableAction` becomes a named standards violation.** Prior to this ADR the action was an unclassified legacy pattern. Under D1, D3, and D3A it is now an active violation carrying mandatory remediation: the implementation PRD MUST either route table/pit creation through the canonical first-class writer or remove topology responsibility from this action entirely. It is logged in the W1 / G4 exception inventory until remediated and cannot be treated as a tolerable long-lived exception.

---

## Alternatives Considered

| Option | Description | Verdict |
|--------|-------------|---------|
| **A** | Keep both models as co-equal sources; each reader picks | **Rejected.** Unbounded inconsistency; every new reader re-decides. FIB-PTC-001 §H. |
| **B** | Persistent bidirectional mirror between legacy and first-class | **Rejected.** Split-brain risk, trigger-ordering surface area, no deprecation path. FIB-PTC-001 §H. |
| **C** | Manual admin bootstrap after onboarding | **Rejected.** Violates the operator expectation that setup produced a usable system. FIB-PTC-001 §H. |
| **D** | Declare legacy as canonical; treat first-class as optional overlay | **Rejected.** Invalidates PRD-067, eliminates the PRD-068 pathway, and locks PT-2 into a text-column topology indefinitely. |
| **E** (chosen) | First-class canonical; legacy as projection; hard reader-migration path | **Chosen.** Closes the split-brain, preserves onboarding expectations, creates a clear deprecation horizon. |

---

## References

- **FIB-PTC-001** — `docs/issues/gaps/pit-topology-canonization/FIB-PIT-TOPOLOGY-CANONIZATION.md`
- **Gap analysis** — `docs/issues/gaps/pit-topology-canonization/FLOOR-LAYOUT-GAP.md`
- **FIB sidecar (structured)** — `docs/issues/gaps/pit-topology-canonization/fib-s-pit-canonization.json`
- **Consumer PRD surfacing the gap** — `docs/10-prd/PRD-067-admin-operations-pit-configuration-v0.md` (Risk R1 closes when this ADR's remediation PRD merges)
- **Adjacent ADRs** — ADR-015, ADR-018, ADR-024, ADR-028, ADR-047
- **Canonical migrations**
  - `supabase/migrations/20251108223004_create_floor_layout_service.sql` — first-class schema + `rpc_activate_floor_layout`
  - `supabase/migrations/20260211184700_create_rpc_complete_casino_setup.sql` — D2 write point
  - `supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql` — D3 reference mirror pattern
  - `supabase/migrations/20251228012528_dashboard_tables_batch_rpc.sql` — D4 migration target
- **Legacy-authoritative writer to retire** — `app/(onboarding)/setup/_actions.ts:424`

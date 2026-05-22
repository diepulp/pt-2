---
title: "Gap Analysis: Pit Configuration — Structural & Lifecycle Controls"
doc_id: "GAP-PIT-CONFIG-STRUCTURAL-LIFECYCLE"
version: "0.1.0"
status: "draft"
date: "2026-04-23"
owner: "FloorLayoutService"
related_docs:
  - "docs/10-prd/PRD-067-admin-operations-pit-configuration-v0.md"
  - "docs/21-exec-spec/EXEC-067-admin-operations-pit-configuration.md"
  - "docs/10-prd/PRD-068-pit-bootstrap-onboarding-materialization-v0.md"
  - "docs/21-exec-spec/EXEC-068-pit-bootstrap-onboarding-materialization.md"
  - "docs/issues/gaps/pit-configuration/FIB-PIT-CONFIG-001-admin-operations-pit-configuration.md"
  - "docs/issues/gaps/pit-bootstrap/FIB-PIT-BOOTSTRAP-001.md"
supersedes: []
amends:
  - "PRD-068 containment_enforcement — logs the deferred surfaces explicitly"
---

# Gap Analysis: Pit Configuration — Structural & Lifecycle Controls

## Executive Summary

PRD-067 shipped the `PitConfigurationPanel` at `/admin/settings/operations` with assignment-plane controls (assign / move / clear a table within an existing slot). PRD-068 shipped the onboarding bootstrap that materializes the initial `floor_layout → floor_layout_version → floor_layout_activation → floor_pit → floor_table_slot` row set.

Together these cover the **operational** plane — routing tables into pre-existing slots. They do **not** cover the **structural** plane (pit/slot shape) or the **lifecycle** plane (layout activation). Once the bootstrapped layout is live, the admin has no in-product path to:

- Rename, add, or delete a pit
- Add or delete a slot
- Trigger a (re-)bootstrap (e.g. for R7 pre-existing casinos)
- Activate or deactivate a layout version

PRD-068 `containment_enforcement.frozen_boundaries` explicitly deferred these surfaces; this document turns that informal deferral into a logged gap so future PRDs inherit the context.

---

## Current State

### Implemented (PRD-067 + PRD-068)

| Capability | Surface | Status |
|---|---|---|
| Read aggregate pit-assignment state | `GET /api/v1/floor-layouts/pit-assignment-state` → `PitConfigurationPanel` | ✅ |
| Assign table → slot | `rpc_assign_or_move_table_to_slot` → `assignOrMoveTableToSlotHttp` | ✅ |
| Move table between slots | same RPC (move-on-conflict semantics) | ✅ |
| Clear slot assignment | `rpc_clear_slot_assignment` → `clearSlotAssignmentHttp` | ✅ |
| Materialize first layout at onboarding | `rpc_bootstrap_casino_pit_layout` → `completeSetupAction` | ✅ |

### Not Implemented

| Capability | Blocking Workflow | Priority |
|---|---|---|
| Rename / add / delete a `floor_pit` | Correct bootstrap mis-labels, reflect operational re-zoning | HIGH |
| Add / delete a `floor_table_slot` | Grow / shrink a pit after bootstrap | HIGH |
| Trigger (re-)bootstrap | R7 recovery for pre-existing casinos; fix fully empty layouts | MEDIUM |
| Activate / deactivate a layout version | Version lifecycle; rebuild-without-destroy path | LOW |

---

## Gap Details

### Gap 1 — Rename / Add / Delete a Pit (HIGH)

**Problem.** Bootstrap writes one `floor_pit` row per `DISTINCT lower(btrim(gaming_table.pit))` with `label = btrim(pit)` (first-observed by created_at tiebreaker — PRD-068 DEC-001). If the operator mistypes a pit name during onboarding, or reorganizes the floor after go-live (e.g. merges "Main" and "Main Floor"), there is no in-product correction path.

**Current workarounds.** None in UI. Direct SQL as admin escape hatch only.

**Backend surface required.**
- New SECURITY DEFINER RPCs, each ADR-018 + ADR-024 + ADR-030 compliant:
  - `rpc_add_floor_pit(p_layout_version_id, p_label, p_sequence)`
  - `rpc_rename_floor_pit(p_pit_id, p_new_label)`
  - `rpc_delete_floor_pit(p_pit_id)` — must refuse if any slot still references the pit (`SLOT_ATTACHED` error); detach-first workflow.

**Governance flags.**
- Uniqueness: existing partial unique index `ux_floor_pit_layout_version_label_lower ON (layout_version_id, lower(label))` (PRD-068 Finding 5) enforces the no-duplicate rule automatically on rename/add.
- Reactivity with `gaming_table.pit`: must NOT write back to `gaming_table.pit` (RULE-5 byte-equality invariant from PRD-068 remains authoritative).

**UI surface required.**
- Inline edit on pit card header (rename).
- "Add Pit" control at panel level (modal with label + sequence inputs).
- Trash affordance on empty pit card (confirm dialog, disabled when slots present).

---

### Gap 2 — Add / Delete a Slot (HIGH)

**Problem.** Bootstrap creates one `floor_table_slot` per `gaming_table` with a non-empty `pit` column (PRD-068 STEP-4). Post-bootstrap gaming-table creates (wizard step 3 post-setup, or any future admin surface) do **not** flow back into the canonical mapping — those tables appear in the `unassigned_tables` pool forever with no destination slot. Conversely, when a physical table is retired, the slot lingers.

**Current workarounds.** None. The `unassigned_tables` pool grows monotonically for new tables added post-bootstrap; there is no way to give them a home.

**Backend surface required.**
- `rpc_add_floor_table_slot(p_pit_id, p_slot_label, p_game_type, p_preferred_table_id?)` — honors existing unique constraint `ux_floor_table_slot_preferred_table_active` when `preferred_table_id` is supplied.
- `rpc_delete_floor_table_slot(p_slot_id)` — must refuse if `assigned_table_id IS NOT NULL` (`SLOT_OCCUPIED` error); clear-first workflow. Reuse the pre-existing `SLOT_OCCUPIED` error shape from `rpc_assign_or_move_table_to_slot`.

**Governance flags.**
- This is the primary surface that elevates PRD-067 from "assignment correction" to "layout editor". Risk of scope creep flagged in `patch-delta.md` for FIB-PIT-CONFIG-001 ("latent floor-layout wedge"). Constrain the first pass: no reordering, no bulk operations, no drag-drop — single-slot ops only.

**UI surface required.**
- "Add Slot" button per pit card (inline form: slot_label, game_type dropdown, optional preferred table).
- Delete affordance per empty slot row (currently slots show only Assign / Clear — needs a third state for "empty & deletable").

---

### Gap 3 — Trigger (Re-)Bootstrap (MEDIUM)

**Problem.** PRD-068 bootstrap fires exclusively from `completeSetupAction`. Three classes of casinos never reach that trigger:

1. **R7 — pre-existing casinos** onboarded before the `20260422183640_prd068_bootstrap_casino_pit_layout_rpc.sql` migration applied. Explicitly deferred by PRD-068 §11.2.
2. **Seeded dev casinos** — `supabase/seed.sql` (lines 64, 144, 268) inserts `casino` + `gaming_table` directly, bypassing the wizard.
3. **Bootstrap-failed casinos** — `completeSetupAction` returns `code: 'BOOTSTRAP_FAILED'` on RPC exception; admin can re-click Complete (idempotent per RULE-7), but if the wizard page is abandoned, there is no re-entry path.

For all three, the `PitConfigurationPanel` shows "No Active Floor Layout" (line 109) with no CTA.

**Current workarounds.** None in UI. Dev: fresh `supabase db reset` with future-updated seed. Prod: direct SQL or a future backfill PRD.

**Backend surface.** Already present — `rpc_bootstrap_casino_pit_layout` is idempotent (returns `outcome: 'already_bootstrapped'` on re-invocation; RULE-7 fence enforced by partial unique index `ux_floor_layout_activation_active_one_per_casino`). No new RPC needed.

**Governance flags.**
- Directly amends PRD-068 `containment_enforcement`: *"No admin UI to re-run or reset bootstrap."* Any resolution PRD must cite this amendment explicitly and reaffirm RULE-5 (no write-back to `gaming_table.pit`) and RULE-6 (atomic commit).
- Seed-fixture fix (dev-only) is orthogonal — can be resolved in seed.sql inline without waiting for this PRD. Logged separately; see "Dependencies" below.

**UI surface required.**
- Admin-only CTA inside the existing "No Active Floor Layout" empty state (panel:100–117): *"Materialize from onboarding → [button]"*. Button invokes `bootstrapCasinoPitLayout()`; on success, invalidates `pit-assignment-state` query key; on `outcome: 'already_bootstrapped'` (race), refreshes state silently.
- No re-bootstrap CTA when an active layout already exists — that's Gap 4's territory.

---

### Gap 4 — Activate / Deactivate a Layout Version (LOW)

**Problem.** Pre-existing RPCs `rpc_create_floor_layout` and `rpc_activate_floor_layout` exist in the schema but are not surfaced in UI and are pre-ADR-024/030 (EXEC-068 Finding 3: spoofable `p_casino_id` / `p_created_by` parameters, `SET search_path = public`). They must be refactored before being wired to a surface.

No UI exists for:
- Creating a second (draft) layout version alongside the active one.
- Activating a draft version (and implicitly deactivating the current one).
- Deactivating an active layout without replacement (rare — usually a structural reset).

**Current workarounds.** None; not an MVP workflow.

**Backend surface required.**
- Refactor `rpc_create_floor_layout` / `rpc_activate_floor_layout` to ADR-024 INV-8 (zero casino/actor params; derive from JWT via `set_rls_context_from_staff()`) and ADR-018 (`SET search_path = ''`). Governance precedent: PRD-068 WS1 (the refactor was explicitly out of scope in that slice, per PRD-068 §11.1).
- Or: define net-new RPCs alongside the legacy ones and deprecate the legacy path. Safer.

**Governance flags.**
- This is the biggest containment violation of the four gaps. Introducing a full version lifecycle is very close to the "floor management platform v0.1" surface that `patch-delta.md` warned against. Strongly recommend keeping this out of the near-term PRDs — wire Gap 3 first as the single-version lifecycle path (bootstrap → edit → replace) before entertaining multi-version.

**UI surface required (future).** Deferred. Likely a separate `/admin/settings/floor-layout-versions` page — NOT the Operations settings panel.

---

## Deferred / Out of Scope

Remains deferred by this gap log (future work, not being promoted):

- **Layout payload authoring** — `floor_layout_version.layout_payload` remains `'{}'::jsonb` per FIB-S §K. No designer/canvas UX.
- **`gaming_table.pit` backfill / drift reconciliation** — PRD-067 OQ-1 territory; RULE-5 byte-equality invariant remains in force.
- **Cross-casino layout cloning** — violates casino-scoped multi-tenancy; would require a separate ADR.
- **Layout version diffing / history UI** — not warranted until Gap 4 lands.
- **Bulk pit/slot operations, drag-drop reorder** — flagged as scope creep risk by `patch-delta.md`.

---

## Dependencies

### Upstream

- **Seed-fixture fix** (dev-only) — `supabase/seed.sql` + `supabase/seed-timeline-demo.sql` need inline `floor_layout*` row sets appended after existing `gaming_table` inserts to unblock dev users seeing the stuck "No Active Floor Layout" state today. Orthogonal to Gap 3's production concern; can land independently as a tight non-PRD change.
- **ADR-040 Identity Provenance Rule** — any new RPCs must classify actors per Category A/B per ADR-024 INV-8 amendment.

### Downstream

- **R7 backfill migration** (production) — only needed if production casinos predate `20260422183640`. Contingent on Gap 3's resolution PRD.
- **TableContext → FloorLayoutService bridge** — when a gaming_table is created post-bootstrap, should it auto-create a slot? Currently out of scope; would tie Gap 2 to the table-creation flow and cross a bounded-context seam.

---

## Implementation Priority

Ordered by operational impact, not by implementation difficulty:

| Order | Gap | Rationale |
|---|---|---|
| 1 | Gap 3 (Re-bootstrap trigger) | Smallest surface, backend already shipped, unblocks seeded/pre-existing casinos. Single new CTA in empty state. |
| 2 | Gap 2 (Add/delete slot) | Resolves the "unassigned tables grow forever" bug for any new tables created post-bootstrap. Requires two new RPCs. |
| 3 | Gap 1 (Rename/add/delete pit) | Correction path for bootstrap mis-labels. Requires three new RPCs. |
| 4 | Gap 4 (Activate/deactivate version) | Biggest containment weight; defer unless a concrete workflow demands it. Requires refactoring two legacy RPCs. |

Each gap should be its own PRD. Bundling them risks the "layout subsystem" drift `patch-delta.md` warned against.

---

## Definition of Done (this gap log)

- [x] All four missing capabilities enumerated with problem / backend / governance / UI breakdown
- [x] Cross-references to PRD-067, PRD-068, EXEC-068 containment, and existing FIB briefs
- [x] Priority ordering with operational-impact justification
- [x] Dependencies separated into upstream (unblockers) and downstream (consequences)
- [ ] Gap 3 PRD drafted (future — smallest scope, highest leverage)
- [ ] Gap 2 PRD drafted (future)
- [ ] Gap 1 PRD drafted (future)
- [ ] Gap 4 PRD drafted (future — only if triggered by a concrete multi-version workflow)

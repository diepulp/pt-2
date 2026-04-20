---
id: PRD-067
title: Admin Operations Pit Configuration
owner: Product
status: Draft
affects: [FIB-PIT-CONFIG-001, FIB-S-PIT-CONFIG-001, ARCH-SRM, ADR-015, ADR-018, ADR-020, ADR-024, ADR-030]
created: 2026-04-19
last_review: 2026-04-19
phase: Admin settings operations surface / table-pit assignment gap
pattern: A
http_boundary: true
intake_ref: docs/issues/gaps/pit-configuration/FIB-PIT-CONFIG-001-admin-operations-pit-configuration.md
structured_ref: docs/issues/gaps/pit-configuration/FIB-S-PIT-CONFIG-001-admin-operations-pit-configuration.json
scaffold_ref: null
gov010_status: waiver-pending  # FIB-H + FIB-S supply scaffold-equivalent decomposition
adr_refs: [ADR-015, ADR-018, ADR-020, ADR-024, ADR-030]
---

# PRD-067 — Admin Operations Pit Configuration

## 1. Overview

- **Owner:** Vladimir Ivanov (business), Product (PRD steward)
- **Status:** Draft
- **Summary:** Admins and operations leads can create gaming tables during casino setup, but there is no post-bootstrap path to assign, correct, or relocate those tables into the desired pit mapping. This PRD adds an admin-only **Pit Configuration** panel inside the existing `/admin/settings/operations` surface that lets admins assign an existing table to a specific active pit slot, relocate a table between slots, or clear an assignment. Writes target the canonical floor layout pit/slot mapping (not free-text `gaming_table.pit`) so pit-scoped reporting and filtering resolve through the updated mapping after save. Scope is pilot-contained: no floor-map editor, no table creation, no pit-definition management, no pit boss edit access.

---

## 2. Problem & Goals

### 2.1 Problem

The setup wizard intentionally allows pit assignment to be deferred, and tables can be created before pit/slot mapping is final. After bootstrap, however, the admin operations surface has no correction path: operators cannot assign an unassigned table, move a table when the live floor changes, or clear an obsolete assignment. Without this, pilot operators who deferred pit mapping during bootstrap or who reconfigure tables after launch cannot make the system match the live floor, which makes pit-scoped reporting and operational filtering unreliable.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: An admin can assign an existing table to an existing active pit slot from `/admin/settings/operations` | Assignment save persists to canonical floor layout mapping and is visible on reload |
| **G2**: An admin can relocate a table between active slots without leaving it double-assigned | After save, the table is present in the new slot and absent from the previous slot |
| **G3**: An admin can clear an existing slot assignment and the table becomes available for later reassignment | Cleared table appears in the unassigned list and the previous slot is empty |
| **G4**: Unassigned tables are visible to admins so deferred bootstrap mapping can be completed | Panel lists unassigned tables with a clear call-to-action to assign |
| **G5**: Pit-scoped reporting and filtering use the updated canonical assignment after save | Downstream pit-scoped views resolve membership through canonical mapping (no free-text fallback) |
| **G6**: Edit authority is admin-only for this slice | Non-admin roles (including pit_boss) cannot invoke assignment mutations |

### 2.3 Non-Goals

- New top-level floor-layout designer page
- Visual / drag-drop floor map editor
- Creating new gaming tables from this surface
- Creating, editing, ordering, or deleting pit definitions
- Changing game variants, par targets, table status, dealer rotation, or table session lifecycle
- Cross-property or multi-casino pit assignment
- External notifications, approval workflows, or shift handoff integrations
- Rebuilding measurement widgets or dashboard reports beyond consuming the updated mapping
- Broad migration of legacy `gaming_table.pit` behavior unless required for compatibility
- Pit boss edit access (deferred; read-only visibility may be revisited post-pilot)

---

## 3. Users & Use Cases

- **Primary users:** Casino admin / operations lead (authenticated, casino-scoped, admin role)
- **Secondary users:** Pit-scoped reporting consumers (read-only, no direct UI role in this slice)

**Top Jobs:**

- As an **admin**, I need to see the current pit configuration (pits, slots, assigned tables, unassigned tables) alongside other operations settings so I can assess what is and isn't mapped.
- As an **admin**, I need to assign an existing table to a specific active pit slot so a deferred bootstrap mapping can be completed.
- As an **admin**, I need to move a table from one active slot to another active slot so the digital mapping reflects a live floor change without leaving the table double-assigned.
- As an **admin**, I need to clear an existing slot assignment so the table returns to the unassigned list and can be mapped later.
- As a **pit-scoped reporting consumer** (downstream, read-only), I need pit membership to resolve through the updated canonical mapping after save so filtering and measurement remain trustworthy.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Pit Configuration Panel (inside `/admin/settings/operations`):**
- View pit assignment state: existing pits, their active slots, the currently assigned table (if any), and the list of unassigned casino tables
- Select an existing casino table for a specific active slot within an existing pit
- Save an assignment; the system validates that the table belongs to the current casino and the slot is active
- Relocate a table between active slots (new assignment implicitly clears the previous active slot for that table)
- Clear an existing slot assignment, leaving the table available for later reassignment
- Admin-only edit authority for all assignment mutations

**Canonical Mapping Integrity:**
- Enforce that a table cannot be assigned to more than one active slot in the same active mapping (hard rule)
- Treat the active floor layout pit/slot mapping as the canonical source for pit membership after save
- Any `gaming_table.pit` compatibility mirroring (if required for legacy filters) is secondary and does not become the source of truth

**Downstream Consumption:**
- Pit-scoped reporting and filtering consumers read the updated canonical mapping after save; no UI redesign of those consumers is in scope

### 4.2 Out of Scope (see Non-Goals §2.3 and Deferred Items §11)

- Floor-layout designer, visual map editor, table creation, pit-definition management, game variant / par / status / dealer rotation / session lifecycle changes, cross-property assignment, approval workflows, external notifications, dashboard redesign, pit boss edit access.

---

## 5. Requirements

### 5.1 Functional Requirements

**Capabilities (verbatim from FIB-S `zachman.how.capabilities`):**

| ID | Capability | Verb | Description |
|----|-----------|------|-------------|
| **CAP-1** | `view_pit_assignment_state` | read | Show existing pits, slots, assigned tables, and unassigned tables inside Casino Operations settings |
| **CAP-2** | `assign_table_to_slot` | update | Assign an existing casino table to a specific active slot within an existing pit |
| **CAP-3** | `relocate_table_between_slots` | update | Move a table from its previous active slot to a new active slot without duplicate assignment |
| **CAP-4** | `clear_slot_assignment` | update | Clear an existing table assignment from a pit slot, leaving the table available for later reassignment |
| **CAP-5** | `consume_updated_canonical_mapping` | read | Allow downstream pit-scoped views to resolve table membership through the updated canonical mapping after save |

**Command model (product contract — EXEC-SPEC selects transport):**

The feature exposes **exactly two conceptual write commands**. The EXEC-SPEC may wrap these in API routes or server actions, but it must not invent additional command shapes.

| Command | Signature (conceptual) | Semantics |
|---------|------------------------|-----------|
| **`assign_or_move_table_to_slot(table_id, slot_id)`** | Upsert-style. Covers CAP-2 (first assignment) and CAP-3 (relocation) with one command. | Binds `table_id` to `slot_id`. If the table is currently assigned to a different active slot in the active mapping, that previous assignment is cleared atomically in the same commit. |
| **`clear_slot_assignment(slot_id)`** | Clear by slot only. Covers CAP-4. | Removes any active assignment currently on `slot_id`. "Clear by table" is **out of scope** for this slice. |

**Functional behaviors:**

- The panel loads the active floor layout activation for the current casino and renders all pits, their active slots, each slot's currently assigned table (if any), and the list of casino tables that have no active slot assignment.
- Admin-initiated save persists the table-to-slot mapping through the canonical floor layout path (not through `gaming_table.pit`).
- **Occupied-target rejection (RULE-3 surface behavior):** if the caller invokes `assign_or_move_table_to_slot(table_id, slot_id)` and `slot_id` is already occupied by a **different** table in the active mapping, the command is **rejected**. There is no implicit swap, no implicit eviction, no overwrite. Any future swap workflow requires a separate PRD.
- Relocation is the same command as assignment — the system does not expose a distinct "relocate" shape. Operator-visible language (the UI may say "move") is separate from the command contract.
- Clearing an assignment is idempotent: calling `clear_slot_assignment(slot_id)` on an already-empty slot must not error and must not create a phantom record.
- Non-admin actors cannot invoke assignment mutations; the UI hides or disables mutation affordances, and server-side authorization rejects the request regardless of UI state.
- After save, subsequent reads of pit-scoped views resolve membership through the canonical mapping.

### 5.2 Non-Functional Requirements

**Tenancy & Security:**
- All reads and writes are casino-scoped (invariant from FIB-S).
- Admin-only write authority is enforced server-side, not only in the UI.
- Context derivation follows **ADR-024 INV-8** — no client-callable RPC may accept `casino_id` or `actor_id` as user input; write RPCs derive casino context from the authenticated staff record.
- Write paths comply with **ADR-030 D4** — mutations on floor layout tables use session-var-derived context, with no JWT COALESCE fallback on writes.

**Persistence Integrity:**
- Duplicate active assignment prevention (RULE-3) must be enforced at the database layer, not only in application code. The EXEC-SPEC will decide between a partial unique index, a BEFORE trigger, or a SECURITY DEFINER RPC that serializes the check — this PRD does not pick the implementation.
- **Occupied-target conflicts are rejected** (see command model §5.1). No implicit swap, evict, or overwrite path exists in this slice.
- **Current-state-only mutation model.** This slice mutates only the current active mapping state. It does **not** introduce assignment history as a first-class record model — no temporal/bitemporal tables, no "assignment history" entity, no history-bearing active/inactive row toggling beyond whatever the existing canonical schema already provides. Any history or audit-trail surface is out of scope (see §11.2 Deferred) and must be a separately scoped feature.
- `gaming_table.pit` compatibility mirroring is **secondary**. If a mirror write is included, it must be subordinate to the canonical write and never become the authoritative path.

**Observability:**
- Assignment mutations emit a structured log event through **existing audit / structured-logging infrastructure** — this feature does not introduce a new audit subsystem, a new audit table, a new replay tool, a new diff viewer, an actor-commentary / reason field, or a new retention policy. Event payload includes: actor, casino, pit, slot, previous table (if any), new table (or null for clear), timestamp. Deep audit history UI, retention policy changes, and any form of audit replay are **out of scope** for this slice (see §11.2 Deferred).

**Performance:**
- Panel initial load must render pit assignment state within the existing operations page budget (no specific new SLO introduced by this slice beyond the page's existing envelope).

> Architecture references: SRM (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`), ADR-015 (RLS patterns), ADR-018 (SECURITY DEFINER governance), ADR-020 (Track A hybrid RLS), ADR-024 (authoritative context derivation), ADR-030 (auth pipeline hardening). Schema reference: `types/database.types.ts` (`floor_layout_activation`, `floor_pit`, `floor_table_slot`, `gaming_table`).

---

## 6. UX / Flow Overview

The feature realizes the 7-step containment loop from FIB-S `containment.loop` (frozen, no new side-paths).

**Flow 1: View current pit configuration (STEP-1, STEP-2)**
1. Admin navigates to `/admin/settings/operations`.
2. System renders the existing Casino Operations settings content plus a new Pit Configuration panel.
3. The panel shows each pit in the active layout, each pit's active slots with their assigned table (if any), and a separate list of unassigned casino tables.

**Flow 2: Assign an unassigned table to an active slot (STEP-3, STEP-4)**
1. Admin selects a target slot (or a target slot selects a table) in an existing pit.
2. Admin chooses a casino table from the unassigned list and saves.
3. System validates the table belongs to the current casino and the slot is active, then persists the assignment to the canonical mapping.
4. Panel refreshes: the slot now shows the assigned table; the unassigned list no longer contains that table.

**Flow 3: Relocate a table between active slots (STEP-5)**
1. Admin picks a table that is currently assigned to an active slot.
2. Admin selects a new target slot in an existing pit and saves.
3. System clears the previous active slot for that table and records the new assignment atomically — no duplicate active assignment is ever committed.
4. Panel refreshes: only the new slot shows the table; the previous slot is empty.

**Flow 4: Clear a slot assignment (STEP-6)**
1. Admin chooses an assigned slot and initiates clear.
2. System clears the assignment and leaves the table available in the unassigned list.
3. Panel refreshes accordingly.

**Flow 5: Downstream consumers resolve updated mapping (STEP-7)**
1. After save, an admin (or any reporting consumer) opens a pit-scoped operational or reporting view.
2. System resolves pit membership through the updated canonical mapping (no free-text fallback is treated as source of truth).

> Detailed UI composition, component layout, and interaction affordances are out of scope for this PRD. The EXEC-SPEC will pick component structure; this slice reuses the existing `/admin/settings/operations` shell and may not introduce a new top-level page.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **`/admin/settings/operations` page exists** — verified; current implementation renders `ShiftSettingsForm` inside `SettingsContentSection`. This PRD adds a new panel alongside existing content.
- **Floor layout canonical tables exist** — `floor_layout_activation`, `floor_pit`, `floor_table_slot` are present (per FIB-S `zachman.what.entities`). Existing `FloorLayoutService` (`services/floor-layout/`) owns them.
- **Gaming tables exist before this feature is used** — bootstrap creates tables; this slice does not create them.
- **Pit definitions and slots exist before this feature is used** — this slice does not create or manage them (RULE-4).
- **Admin role and casino scoping in place** — ADR-024 context derivation and ADR-030 write-path session variables are live.
- **Pilot pit/slot bootstrap coverage must be verified before build** — see Risk R1.

### 7.2 Risks & Open Questions

- **R1: Pilot pit/slot bootstrap coverage** — Downstream planning must verify that pilot casinos have sufficient pit and slot records to make this feature usable. If not, a separate antecedent slice is required. *How addressed*: The EXEC-SPEC pipeline's intake-traceability audit will treat this as a prerequisite; if coverage is missing, the pipeline halts and a bootstrap-coverage slice must be authored before implementation.
- **R2: `gaming_table.pit` compatibility mirroring** (OPEN QUESTION from FIB-S) — Whether legacy dashboard filters still depend on `gaming_table.pit` and therefore require mirroring is unresolved. *How addressed*: Resolve at EXEC-SPEC stage by auditing consumers of `gaming_table.pit`. If mirroring is required, it must be implemented as secondary to the canonical mapping (RULE-5); if not, `gaming_table.pit` writes remain untouched by this feature.
- **R3: Pit boss read-only visibility** (OPEN QUESTION from FIB-S) — Whether pit_boss users should later see read-only panel visibility is deferred; pilot default is admin-only panel visibility. *How addressed*: No action this slice. Revisit after pilot feedback; any change requires a new PRD or amendment.
- **R4: Race condition on concurrent assignment saves** — Two admins saving different tables into the same slot (or the same table into different slots) concurrently could produce a duplicate-assignment attempt. *How addressed*: Enforce RULE-3 at the database layer (see §5.2 Persistence Integrity); EXEC-SPEC selects the mechanism (partial unique index / trigger / serialized RPC).
- **R5: GOV-010 scaffold** — Tracked via pipeline metadata (`gov010_status: waiver-pending` in frontmatter); resolution belongs to build-pipeline, not this PRD.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] An admin can view the pit assignment state (pits, slots, assigned + unassigned tables) from `/admin/settings/operations`
- [ ] An admin can assign an existing unassigned table to an existing active slot (CAP-2)
- [ ] An admin can relocate a table from one active slot to another active slot without leaving a duplicate assignment (CAP-3)
- [ ] An admin can clear an existing slot assignment (CAP-4)
- [ ] Downstream pit-scoped views resolve membership through the updated canonical mapping after save (CAP-5)

**Data & Integrity**
- [ ] Duplicate active slot assignments for the same table are rejected at the database layer (RULE-3)
- [ ] Canonical floor layout mapping is the source of truth; `gaming_table.pit` is not treated as authoritative (RULE-1, RULE-5)
- [ ] No orphaned slot records or stuck assignments after relocate or clear operations

**Security & Access**
- [ ] Non-admin users (including pit_boss) cannot invoke assignment mutations via API or server action (RULE-2)
- [ ] Write RPCs derive `casino_id` / `actor_id` from context, not parameters (ADR-024 INV-8)
- [ ] Write paths on floor layout tables use session-var-only context (ADR-030 D4)
- [ ] No cross-casino assignment paths exist in this feature

**Testing**
- [ ] At least one integration test per mutation capability (assign, relocate, clear) hitting real database + RLS
- [ ] At least one happy-path E2E test exercising the admin assign → relocate → clear sequence from `/admin/settings/operations`
- [ ] At least one negative authorization test proving a non-admin staff member cannot mutate assignments

**Operational Readiness**
- [ ] Assignment mutations emit a structured audit event (who / casino / pit / slot / previous-table / new-table / timestamp)
- [ ] Rollback path documented: reverting the feature removes operator access and the code path, but does **not** guarantee restoration of pre-release assignment state — any mutations written between release and rollback persist unless a dedicated reversal procedure is authored. The rollback doc must state this plainly.

**Documentation**
- [ ] SRM updated if `FloorLayoutService` surface changes (new published DTO or RPC); otherwise note "no SRM change" in EXEC-SPEC
- [ ] Open questions R2 (gaming_table.pit mirroring) and R3 (pit_boss visibility) marked resolved or explicitly carried forward in EXEC-SPEC risks
- [ ] Known limitations documented (e.g., no assignment history UI in this slice)

**Surface Governance (this PRD adds a UI panel inside an existing surface, not a new top-level surface)**
- [ ] Panel documented as a sub-surface of `/admin/settings/operations` — no new top-level surface introduced
- [ ] No new truth-bearing metrics introduced by this feature (the panel renders state; it does not publish new measurement values)

---

## 9. Related Documents

- **Intake (scope authority)**: `docs/issues/gaps/pit-configuration/FIB-PIT-CONFIG-001-admin-operations-pit-configuration.md`
- **Intake (structured traceability authority)**: `docs/issues/gaps/pit-configuration/FIB-S-PIT-CONFIG-001-admin-operations-pit-configuration.json`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (`FloorLayoutService`, `TableContextService`)
- **Schema / Types**: `types/database.types.ts` (`floor_layout_activation`, `floor_pit`, `floor_table_slot`, `gaming_table`)
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **ADR-015**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- **ADR-018**: `docs/80-adrs/ADR-018-security-definer-governance.md`
- **ADR-020**: `docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md`
- **ADR-024**: `docs/80-adrs/ADR-024_DECISIONS.md`
- **ADR-030**: `docs/80-adrs/ADR-030-auth-system-hardening.md`
- **Over-Engineering Guardrail**: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- **Feature pipeline entry (this PRD is built via)**: `/build PRD-067`

---

## 10. Business Rules & Invariants

### 10.1 Hard Business Rules (from FIB-S `zachman.why.business_rules`)

| ID | Rule | Severity |
|----|------|----------|
| **RULE-1** | The canonical source for table-to-pit assignment is the active floor layout pit/slot mapping, not free-text `gaming_table.pit`. | hard |
| **RULE-2** | Only admin users may edit pit assignment mappings in this slice. | hard |
| **RULE-3** | A table may not be assigned to more than one active slot in the same active mapping. | hard |
| **RULE-4** | Pit definitions and slots are required existing inputs; creating or managing them is not part of this feature. | hard |
| **RULE-5** | Any `gaming_table.pit` compatibility mirroring must remain secondary to canonical mapping. | hard |

### 10.2 Invariants (from FIB-S `zachman.why.invariants`)

- Assignments are casino-scoped.
- Only existing gaming tables are assignable.
- Only existing active slots are assignable targets.
- Unassigned tables remain visible for later assignment.
- Pit-scoped views must resolve table membership through the updated canonical mapping after save.

### 10.3 Decision Notes (carried from FIB-S `zachman.why.decision_notes`)

- First implementation assigns tables to specific active slots, not directly to pits.
- Pilot default is admin-only panel visibility.
- If pilot casinos lack sufficient pit/slot scaffolding, that is a separate antecedent slice and must not be smuggled into this feature.

---

## 11. Non-Goals & Deferred Items

### 11.1 Explicit Exclusions (from FIB-S `intent.explicit_exclusions`)

- Creating a new top-level floor-layout designer
- Drawing, dragging, or visually editing a full casino floor map
- Creating new gaming tables from this surface
- Creating, editing, ordering, deleting, or otherwise managing pit definitions
- Changing game variants, par targets, table status, dealer rotation, or table session lifecycle
- Cross-property or multi-casino pit assignment
- External notifications, approvals, or shift handoff workflows
- Rebuilding measurement widgets or dashboard reports beyond consuming the updated mapping
- Broad migration of all legacy `gaming_table.pit` behavior unless required for compatibility
- Pit boss edit access

### 11.2 Deferred (likely next, from FIB-S `coherence.deferred_items` and FIB-H §J)

- Full floor layout management surface for designing pits, slots, and spatial placement
- Controlled workflow for creating, decommissioning, or changing table inventory after onboarding
- Audit / history review UI of pit assignment changes
- Pit_boss read-only visibility
- Pit / slot bootstrap coverage antecedent slice (if pilot data is incomplete — see R1)

---

## 12. Open Questions

Both items are inherited from FIB-S `governance.open_questions_allowed_at_scaffold`. They remain unresolved at PRD stage and must be either resolved in the EXEC-SPEC `decisions` block (with `impact_on_scope: none` evidence) or carried forward in the EXEC-SPEC risks section.

- **OQ-1**: Whether compatibility mirroring to `gaming_table.pit` is required for legacy dashboard filters. *Default if unresolved by EXEC stage*: do not mirror; canonical mapping only.
- **OQ-2**: Whether pit_boss users receive read-only visibility later; pilot default is admin-only panel visibility. *Default if unresolved by EXEC stage*: admin-only visibility; no pit_boss exposure in this slice.

---

## 13. Surface & Touchpoint Inventory (from FIB-S `zachman.where`)

**Primary surface:** `/admin/settings/operations`

**Surfaces in scope:**
- Casino Operations settings page (`app/(dashboard)/admin/settings/operations/page.tsx`) — existing, host for new panel
- Pit configuration panel — new sub-component inside the existing page
- Table/pit assignment transport — API route or server action (exact transport decided at EXEC-SPEC stage, constrained to serve only this feature's workflow)
- Pit-scoped reporting and filtering consumers — read-only consumers of the updated canonical mapping (no redesign in scope)

**Inbound touchpoints:** `admin_opens_operations_settings`, `admin_saves_slot_assignment`, `admin_clears_slot_assignment`

**Outbound touchpoints:** `updated_canonical_pit_table_mapping`

**Bounded contexts touched:**

| Context | Role in this slice |
|---------|---------------------|
| `FloorLayoutService` | **Mutation owner.** All writes to the canonical pit/slot assignment mapping (assign, move, clear) are persisted through this service and only this service. No other service may write to `floor_table_slot` or related canonical tables as part of this feature. |
| `TableContextService` | **Read-only consultant.** Used only to resolve existing table identity and eligibility (casino scope, presence, labels). It must not be asked to persist assignment state. |
| `/admin/settings/operations` page | **Host surface, not a domain owner.** The admin settings area hosts the panel UI; the mutation contract, validation, and persistence responsibility live in `FloorLayoutService`. No assignment mutations may be handled by a generic admin-settings handler. |
| Measurement / reporting consumers | **Downstream readers.** Read the updated canonical mapping after save; no writes. |

---

## 14. Expansion Trigger Rule

Per FIB-H §K and FIB-S `governance.amendment_required_for`, any downstream artifact (including this PRD's EXEC-SPEC) that proposes any of the following requires FIB amendment **before** proceeding:

- New top-level admin page
- Visual floor-map editor
- Table creation or decommissioning
- Pit-definition management
- Dealer assignment
- Session lifecycle changes
- Cross-casino assignment
- Approval workflow
- External notification path
- Pit boss edit permissions
- Reporting or dashboard redesign
- Treating free-text `gaming_table.pit` as the only persisted assignment

The EXEC-SPEC's intake-traceability audit enforces this boundary mechanically.

---

## Appendix A: Traceability Summary (FIB-S → PRD)

| FIB-S Element | PRD Location |
|---------------|--------------|
| `intent.success_outcomes` (OUT-1..OUT-7) | §2.2 Goals, §4.1 Scope, §8 DoD |
| `intent.explicit_exclusions` | §2.3 Non-Goals, §11.1 Exclusions |
| `zachman.how.capabilities` (CAP-1..CAP-5) | §5.1 Functional Requirements (capability table) |
| `zachman.why.business_rules` (RULE-1..RULE-5) | §10.1 Hard Business Rules |
| `zachman.why.invariants` | §10.2 Invariants |
| `zachman.where.surfaces` / `touchpoints` | §13 Surface & Touchpoint Inventory |
| `containment.loop` (STEP-1..STEP-7) | §6 UX / Flow Overview (Flows 1–5) |
| `governance.open_questions_allowed_at_scaffold` | §12 Open Questions |
| `governance.amendment_required_for` | §14 Expansion Trigger Rule |
| `dependencies.required_existing` | §7.1 Dependencies |
| `dependencies.missing_dependencies` | §7.2 R1 (bootstrap coverage) |
| `coherence.deferred_items` | §11.2 Deferred |

---

## Appendix B: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-19 | Product (drafted from FIB-PIT-CONFIG-001 v0 + FIB-S) | Initial draft |

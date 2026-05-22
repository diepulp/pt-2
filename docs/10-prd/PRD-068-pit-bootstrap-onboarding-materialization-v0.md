---
id: PRD-068
title: Pit Bootstrap — Onboarding Materialization (Pilot Slice)
owner: Product
status: Draft
affects: [FIB-PIT-BOOTSTRAP-001, FIB-S-PIT-BOOTSTRAP-001, PRD-067, ARCH-SRM, ADR-015, ADR-018, ADR-020, ADR-024, ADR-030]
created: 2026-04-22
last_review: 2026-04-22
phase: Onboarding completion / PRD-067 antecedent (pit/slot bootstrap coverage)
pattern: A
http_boundary: false
intake_ref: docs/issues/gaps/pit-bootstrap/FIB-PIT-BOOTSTRAP-001.md
structured_ref: docs/issues/gaps/pit-bootstrap/FIB-S-PIT-BOOTSTRAP-001.json
scaffold_ref: null
gov010_status: waiver-pending  # FIB-H + FIB-S supply scaffold-equivalent decomposition
adr_refs: [ADR-015, ADR-018, ADR-020, ADR-024, ADR-030]
---

# PRD-068 — Pit Bootstrap (Onboarding) — Pilot Slice

## 1. Overview

- **Owner:** Vladimir Ivanov (business), Product (PRD steward)
- **Status:** Draft
- **Summary:** The onboarding setup wizard collects pit names as free text into `gaming_table.pit` but does not create any canonical floor layout records. PRD-067's admin pit configuration panel reads only the canonical mapping (`floor_pit`, `floor_table_slot` under the active `floor_layout_activation`), so a newly onboarded casino sees an empty admin panel and pilot operators cannot assign tables. This PRD adds a **one-shot materialization step** at onboarding completion that derives distinct pits from onboarding input, creates **only the rows strictly required for PRD-067 to read a usable initial state** (`floor_layout` → `floor_layout_version` → `floor_layout_activation`, plus pit and slot rows), and commits them atomically and idempotently without touching `gaming_table.pit`. The phrase "minimal canonical scaffold" in this PRD means exactly that: the smallest row set that lets PRD-067's existing read path resolve a populated mapping — **no version-lifecycle ceremony, no status workflow, no promotion steps, no `layout_payload` authoring, no designer concepts**. No new UI, no canonicalization effort, no legacy migration.

---

## 2. Problem & Goals

### 2.1 Problem

After a casino completes the onboarding setup wizard, the admin pit configuration panel (PRD-067, at `/admin/settings/operations`) renders empty. The wizard writes each table's pit label to free-text `gaming_table.pit`, but no code path materializes that input into the canonical floor layout mapping the admin panel reads. Operators who expect the pits they just typed to exist in the admin panel find the state blank, cannot assign tables, and cannot proceed. PRD-067 shipped with an explicit risk (R1: "Pilot pit/slot bootstrap coverage must be verified before build") that this slice closes. Without it, the pilot admin surface is unusable on every new casino.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: A fresh casino that completes onboarding has an active canonical floor layout mapping without any admin action | Exactly one `floor_layout_activation` row exists for the casino, pointing to a `floor_layout_version` owned by a `floor_layout` for that casino |
| **G2**: Each distinct non-empty pit name from onboarding input materializes as exactly one `floor_pit` in the active version | Distinct-count of `gaming_table.pit` (trimmed, case-insensitive) equals the count of `floor_pit` rows under the active version |
| **G3**: Each onboarded gaming table with a non-empty pit value has a `floor_table_slot` binding it to the matching pit | For every `gaming_table` with non-empty `pit`, exactly one `floor_table_slot` exists with `preferred_table_id = table.id` and `pit_id` pointing to the matching `floor_pit` |
| **G4**: Onboarded tables with no pit value do NOT get a slot — they remain in the unassigned list | PRD-067's panel shows those tables in its unassigned list on first open |
| **G5**: PRD-067's admin pit configuration panel renders the populated mapping on first open, with no code change to PRD-067 | Opening `/admin/settings/operations` after onboarding shows the bootstrapped pits, slots, and tables |
| **G6**: `gaming_table.pit` values are preserved verbatim | Before/after comparison of `gaming_table.pit` shows zero modifications on any row |
| **G7**: Bootstrap is atomic, idempotent, and casino-scoped | Re-invocation on the same casino produces no duplicate rows; partial failure leaves no orphaned records; no rows are written for any other casino |

### 2.3 Non-Goals

- Canonicalization of `gaming_table.pit` across the codebase
- Migration of existing readers (legacy dashboards, filters) off `gaming_table.pit`
- Removal, deprecation, or schema change to the `gaming_table.pit` column
- Bidirectional sync between `gaming_table.pit` and the canonical mapping
- Floor layout designer, visual editor, or multi-version lifecycle UI
- Backfill for casinos that completed onboarding before this slice ships (explicitly deferred — see §11.2)
- New admin UI (PRD-067's panel is the downstream consumer, not a modification target)
- CI rules, lint rules, governance gates, inventory systems, or topology enforcement
- New bounded context, new service, or new architectural layer
- Approval workflow, notification path, or new audit subsystem (reuse of existing structured logging only)
- Admin-triggered re-bootstrap or reset-to-onboarding-state
- Resolving PRD-067 OQ-1 (`gaming_table.pit` mirroring for legacy filters)

---

## 3. Users & Use Cases

- **Primary users:** Casino admin completing the onboarding setup wizard (authenticated, casino-scoped, admin role)
- **Secondary actors:** The system, which executes the bootstrap transaction on the admin's behalf at the completion moment
- **Downstream consumer (read-only):** Any admin subsequently opening PRD-067's pit configuration panel

**Top Jobs:**

- As a **casino admin**, when I complete onboarding, I need the pits I typed during table setup to show up in the admin pit configuration panel without having to perform any additional setup step, so I can immediately correct or complete assignments.
- As a **casino admin**, I need tables I created without a pit value to remain available as unassigned tables, so I can assign them later via PRD-067's panel.
- As a **casino admin**, I need my free-text `gaming_table.pit` input to remain untouched so any legacy reader still relying on it continues to work unchanged.
- As the **system**, I need bootstrap to be atomic and idempotent, so partial failures or retries never leave the casino in a half-mapped state.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Bootstrap trigger:**
- Runs exactly once per casino at the onboarding completion moment
- Executes inside the onboarding completion transaction (or in a single logical operator action immediately following it)
- Idempotent: re-invocation on the same casino is a safe no-op

**Derivation (read-only from onboarding input):**
- Read all `gaming_table` rows for the casino under onboarding
- Derive the distinct non-empty set of `gaming_table.pit` values (pilot default: trimmed + case-insensitive equivalence)
- Preserve `gaming_table.pit` values verbatim — no mutation of onboarding rows

**Scaffold materialization (create-if-absent, literal row-set only):**
- Ensure a `floor_layout` exists for the casino
- Create exactly one `floor_layout_version` for that layout (the first and only version this slice ever produces per casino)
- Create a `floor_layout_activation` tying that version to the casino as the active mapping

> **Containment (hard):** "Minimal" means only the columns required to make the three rows readable. No `layout_payload` content authoring beyond the empty/default value the schema demands. No version promotion step, no draft→active transition, no `status` workflow beyond writing whatever single value the active-by-default semantics require. This slice does not "own" the version lifecycle — it writes one row and walks away.

**Pit + slot materialization:**
- Insert one `floor_pit` per distinct non-empty pit name inside the active layout version
- Insert one `floor_table_slot` per gaming table that had a non-empty pit value, with:
  - `preferred_table_id = gaming_table.id`
  - `pit_id = matching floor_pit.id`
  - `layout_version_id = active version id`
  - `slot_label` and `game_type` derived via EXEC-SPEC decisions (see §7.2 OQ-2, OQ-3)

**Unassigned-table preservation:**
- For onboarded tables with null or empty `pit`, do NOT create a slot — the table persists in the casino and appears in PRD-067's unassigned list

**Mutation ownership & security:**
- All canonical writes go through `FloorLayoutService` (or a SECURITY DEFINER RPC governed by ADR-018); no onboarding handler writes to `floor_layout_*` tables directly
- Context derived from authenticated staff per ADR-024 INV-8; write paths follow ADR-030 D4

**Atomicity & scoping:**
- All canonical writes for one casino commit atomically or not at all
- Bootstrap is casino-scoped — never reads or writes rows for any other casino

**Observability:**
- Emit one structured log event on bootstrap outcome (success includes pit count, slot count, table-without-pit count; failure includes actionable error) via existing logging infrastructure only — no new audit subsystem, no new audit table, no new retention policy

### 4.2 Out of Scope

- See Non-Goals (§2.3) and Deferred Items (§11.2).

---

## 5. Requirements

### 5.1 Functional Requirements

**Capabilities (verbatim from FIB-S `zachman.how.capabilities`):**

| ID | Capability | Verb | Description |
|----|-----------|------|-------------|
| **CAP-1** | `derive_distinct_pits_from_onboarding` | read | Read the set of distinct non-empty `gaming_table.pit` values for the casino at onboarding completion |
| **CAP-2** | `materialize_active_layout_scaffold` | create | Create (idempotently) a `floor_layout`, a `floor_layout_version`, and a `floor_layout_activation` so the casino has an active mapping target |
| **CAP-3** | `materialize_pits_from_onboarding` | create | Create one `floor_pit` per distinct non-empty pit name from CAP-1 inside the active layout version |
| **CAP-4** | `materialize_slot_assignments_from_onboarding` | create | Create one `floor_table_slot` per onboarded gaming table with a non-empty pit, binding `preferred_table_id` to the table and `pit_id` to the matching floor_pit |
| **CAP-5** | `preserve_unassigned_tables` | skip | For gaming tables with null or empty pit, do not create a slot — the table remains unassigned |
| **CAP-6** | `preserve_free_text_pit_column` | read_only | Read `gaming_table.pit` but do not modify, null, or delete it on any row |
| **CAP-7** | `hand_off_to_admin_panel` | read | After bootstrap commits, PRD-067's existing read path (`FloorLayoutService.getPitAssignmentState` via the active `floor_layout_activation`) resolves the newly created mapping without any change to PRD-067 |

**Command model (product contract — EXEC-SPEC selects transport):**

The feature exposes **exactly one conceptual write command**. The EXEC-SPEC may wrap it in a `FloorLayoutService` method or a SECURITY DEFINER RPC, but it must not invent additional command shapes.

| Command | Signature (conceptual) | Semantics |
|---------|------------------------|-----------|
| **`bootstrap_casino_pit_layout(casino_id)`** | One-shot materialization. Covers CAP-2 → CAP-5 as a single transaction. | Reads `gaming_table` rows for `casino_id`, creates scaffold if absent, inserts pits and slots per rules RULE-1 through RULE-9, emits a structured log event, returns a summary `{ pits_created, slots_created, tables_without_pit, layout_version_id }`. |

`casino_id` is **derived from authenticated context** per ADR-024 INV-8 — it is never a user-supplied parameter on any client-callable path.

**Functional behaviors:**

- **Bootstrap fires on onboarding completion.** The moment the onboarding setup wizard reaches its completion step for a casino, bootstrap runs. If `floor_layout_activation` already exists for the casino, bootstrap short-circuits as an idempotent no-op.
- **Derivation runs before any write.** Bootstrap reads all `gaming_table` rows for the casino, computes the distinct non-empty pit set (trimmed + case-insensitive by default), and maps each pit-bearing table to its pit bucket before issuing any insert.
- **Scaffold creation is idempotent.** If `floor_layout` for the casino exists, reuse it. Otherwise create it. Same rule for `floor_layout_version` and `floor_layout_activation` — only create if the casino has no active mapping.
- **No version-lifecycle ceremony.** Bootstrap writes exactly one version row per casino, in whatever status is required to be immediately active. It does not introduce, invoke, or imply a version promotion workflow, draft/published states, version numbering semantics beyond the minimum the column requires, or multi-version branching. Any such concept is out of scope and requires an amendment (see §14).
- **Pits are created once per distinct name.** Two onboarded tables with pit `"Main"` and `"main "` collapse to one `floor_pit` (trimmed + case-insensitive). The canonical stored label is the first observed form after trimming (EXEC-SPEC may refine).
- **Slots are created only for pit-bearing tables.** Tables with `pit = null` or `pit = ''` skip slot creation. RULE-4 is hard.
- **`gaming_table.pit` is read-only to this feature.** Bootstrap must not issue any `UPDATE` or `DELETE` against `gaming_table` on any row — including no normalization of the free-text column.
- **Atomicity is hard.** If any write fails, the entire transaction rolls back. No partial mapping (e.g., pits without activation, slots without pits) is ever visible to any reader.
- **Re-invocation is safe.** A second call for the same casino, once active mapping exists, produces zero new rows and returns an "already bootstrapped" signal in the summary.
- **PRD-067 consumes without modification.** After commit, PRD-067's `FloorLayoutService.getPitAssignmentState` resolves the active mapping and renders populated state. This PRD does not modify PRD-067 code, tests, or UI.

### 5.2 Non-Functional Requirements

**Tenancy & Security:**
- All reads and writes are casino-scoped (RULE-8 hard).
- Bootstrap executes under admin context derived from authenticated staff (ADR-024 INV-8) — no spoofable `casino_id` or `actor_id` parameters on client-callable paths.
- Write paths on `floor_layout_*` tables follow **ADR-030 D4** — session-var-derived context, no JWT COALESCE fallback on writes.
- Bootstrap is invoked only from the onboarding completion flow in this slice. Any future external trigger (re-bootstrap, admin-initiated replay) requires a separate PRD.

**Persistence Integrity:**
- All canonical writes for one casino commit atomically (RULE-6 hard).
- Bootstrap is idempotent per casino (RULE-7 hard); re-invocation must not duplicate `floor_layout`, `floor_layout_version`, `floor_pit`, or `floor_table_slot` rows. EXEC-SPEC selects the mechanism (short-circuit on existing activation + uniqueness where feasible at the database layer).
- `gaming_table.pit` column values are unchanged after bootstrap (RULE-5 hard, G6, OUT-8).
- No `floor_table_slot.preferred_table_id` ever points to a `gaming_table` in a different casino (RULE-8 corollary).

**Mutation Ownership:**
- All canonical writes flow through `FloorLayoutService` per SRM (RULE-9 hard). The onboarding module is a trigger host, not a mutation owner.
- No direct Supabase `.from('floor_layout_*').insert(...)` calls outside `FloorLayoutService` or an EXEC-SPEC-approved SECURITY DEFINER RPC.

**Observability:**
- Bootstrap emits exactly one structured log event per casino invocation through existing structured-logging infrastructure — this feature does not introduce a new audit subsystem, a new audit table, a new replay tool, or a new retention policy.
- Event payload: actor, casino, layout_version_id, pits_created, slots_created, tables_without_pit, duration_ms, outcome (`success` / `already_bootstrapped` / `failed`), and a minimal error envelope on failure.

**Performance:**
- Bootstrap runs inline in the onboarding completion path and must not materially extend perceived wizard completion time. No specific SLO is introduced by this slice beyond the existing wizard envelope; pilot casinos are bounded to tens of tables, so a single-transaction write is adequate.

> Architecture references: SRM (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`), ADR-015 (RLS patterns), ADR-018 (SECURITY DEFINER governance), ADR-020 (Track A hybrid RLS), ADR-024 (authoritative context derivation), ADR-030 (auth pipeline hardening). Schema reference: `types/database.types.ts` (`floor_layout`, `floor_layout_version`, `floor_layout_activation`, `floor_pit`, `floor_table_slot`, `gaming_table`).

---

## 6. UX / Flow Overview

The feature realizes the 6-step containment loop from FIB-S `containment.loop` (frozen, no new side-paths). **There is no new UI in this slice.**

**Flow 1: Admin completes onboarding, bootstrap fires (STEP-1 → STEP-5)**
1. Admin completes the final step of the onboarding setup wizard.
2. System reads all `gaming_table` rows for the current casino and derives the distinct non-empty pit set.
3. System ensures `floor_layout` + `floor_layout_version` + `floor_layout_activation` exist for the casino (creates if absent).
4. System inserts one `floor_pit` per distinct pit name into the active layout version.
5. System inserts one `floor_table_slot` per pit-bearing gaming table, binding `preferred_table_id` and `pit_id`.
6. System skips slot creation for tables without a pit value.
7. Transaction commits; a structured log event records the outcome.

**Flow 2: Admin opens PRD-067 panel for the first time (STEP-6)**
1. Admin navigates to `/admin/settings/operations`.
2. PRD-067's panel loads via `FloorLayoutService.getPitAssignmentState` using the casino's active `floor_layout_activation`.
3. Panel renders pits (from `floor_pit`), slots (from `floor_table_slot`), each slot's assigned table, and the list of unassigned casino tables (tables with no active slot).
4. Admin can immediately invoke PRD-067's existing assign / move / clear commands.

**Flow 3: Idempotent re-invocation (defensive)**
1. If bootstrap is re-triggered on a casino that already has an active `floor_layout_activation`, it short-circuits.
2. No new rows are written. Structured log event records `outcome: already_bootstrapped`.

> There is no UI in this PRD. Detailed transport, exact service-method vs RPC choice, pit-name equivalence rule, and game-type mapping are EXEC-SPEC concerns (§7.2).

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Onboarding setup wizard exists** — `app/(onboarding)/setup/setup-wizard.tsx` + `app/(onboarding)/setup/_actions.ts` create gaming tables with optional free-text pit per table (verified on this branch).
- **`gaming_table.pit` column exists and is writable during onboarding** — verified.
- **Floor layout canonical tables exist** — `floor_layout`, `floor_layout_version`, `floor_layout_activation`, `floor_pit`, `floor_table_slot` are present per `types/database.types.ts`.
- **`FloorLayoutService` is the SRM-authorized owner of canonical floor layout writes** — `services/floor-layout/` owns them.
- **PRD-067 is shipped and reads active mapping via `FloorLayoutService.getPitAssignmentState`** — verified on this branch (commit `be6ef5e9`).
- **ADR-024 authoritative context derivation is live** (`set_rls_context_from_staff`).
- **ADR-030 write-path session-var enforcement is live for `floor_layout_*` tables.**

### 7.2 Risks & Open Questions

- **R1: Pit-name equivalence rule (OPEN QUESTION from FIB-S).** Whether equivalence uses trimmed + case-insensitive matching or strict equality. *How addressed*: Resolve at EXEC-SPEC stage. Pilot default: trimmed + case-insensitive. EXEC-SPEC must pick a deterministic canonical-label rule (e.g., first observed trimmed form) and document it.
- **R2: `gaming_table.type` → `floor_table_slot.game_type` mapping (OPEN QUESTION from FIB-S).** Bootstrap must set `game_type` on each slot. *How addressed*: EXEC-SPEC must produce an explicit mapping table covering every `gaming_table.type` value in use. Pilot default is **fail closed** — if a table's type has no mapping, bootstrap aborts for the casino and surfaces an actionable error (no partial mapping committed).
- **R3: Transport choice — FloorLayoutService method vs SECURITY DEFINER RPC (OPEN QUESTION from FIB-S).** *How addressed*: EXEC-SPEC stage. Pilot default: a new `FloorLayoutService` method invoked from the onboarding completion action, promoted to a SECURITY DEFINER RPC only if single-transaction guarantees require server-side composition. Whichever is chosen, ADR-018 governance applies if RPC; ADR-024 INV-8 applies in both cases.
- **R4: Wizard-completion UX confirmation (OPEN QUESTION from FIB-S).** Whether the wizard surfaces a summary of materialized pits/slots. *How addressed*: Pilot default is no UI change — structured log only. Any wizard UI change requires an amendment.
- **R5: Partial failure during bootstrap.** If the transaction fails mid-way, the admin sees an empty panel. *How addressed*: RULE-6 enforces atomicity. EXEC-SPEC must wrap all canonical writes in a single transaction; on failure, emit a structured log with actionable error; surface a wizard-level error so the admin knows bootstrap must be retried. Retry semantics are idempotent by RULE-7.
- **R6: Double-submit / concurrent wizard completion.** Two concurrent completions for the same casino could race. *How addressed*: Idempotency guard (RULE-7) plus short-circuit on existing `floor_layout_activation`. EXEC-SPEC selects a serialization mechanism (row lock on casino, unique constraint on active activation, or serialized RPC).
- **R7: Pre-existing onboarded casinos (backfill).** Casinos that completed onboarding before this slice ships will still have empty panels. *How addressed*: Explicitly deferred (§11.2). A separate backfill slice must be authored with its own safety requirements; this PRD does not touch pre-existing casinos.
- **R8: `gaming_table.pit` drift after bootstrap.** After PRD-067 admins start reassigning tables, `gaming_table.pit` may drift from canonical mapping. *How addressed*: Out of scope for this slice (FIB-H §H explicitly rejects bidirectional sync). Mirror-write policy belongs to PRD-067 OQ-1; this PRD leaves `gaming_table.pit` untouched.
- **R9: GOV-010 scaffold.** Tracked via pipeline metadata (`gov010_status: waiver-pending` in frontmatter); resolution belongs to build-pipeline, not this PRD.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] On completion of a fresh-casino onboarding, bootstrap creates `floor_layout` + `floor_layout_version` + `floor_layout_activation` exactly once (G1, CAP-2)
- [ ] Distinct non-empty pit names from `gaming_table.pit` materialize as `floor_pit` rows under the active version (G2, CAP-3)
- [ ] Each pit-bearing gaming table has a `floor_table_slot` binding to the correct `floor_pit` (G3, CAP-4)
- [ ] Tables with null or empty pit are NOT given a slot (G4, CAP-5)
- [ ] PRD-067's admin panel renders the bootstrapped state on first open, with zero code change to PRD-067 (G5, CAP-7)

**Data & Integrity**
- [ ] `gaming_table.pit` column values are byte-for-byte identical before and after bootstrap (G6, RULE-5)
- [ ] Atomic: partial-failure test case leaves zero canonical rows for the casino (RULE-6)
- [ ] Idempotent: second invocation on an already-bootstrapped casino creates zero new rows and returns `already_bootstrapped` (RULE-7, G7)
- [ ] Casino-scoped: bootstrap invocation for casino A does not read or write any row for casino B (RULE-8, G7)
- [ ] No `floor_table_slot.preferred_table_id` ever points to a `gaming_table` in a different casino

**Security & Access**
- [ ] Bootstrap context is derived from authenticated staff; no client-callable path accepts `casino_id` or `actor_id` as input (ADR-024 INV-8)
- [ ] Write paths on `floor_layout_*` tables use session-var-derived context (ADR-030 D4)
- [ ] All canonical writes flow through `FloorLayoutService` (or an ADR-018-governed SECURITY DEFINER RPC) — no direct `.from('floor_layout_*')` inserts outside that boundary (RULE-9)

**Testing**
- [ ] Integration test: fresh onboarding with 3 tables across 2 distinct pit names produces 1 `floor_layout_activation`, 2 `floor_pit`, 3 `floor_table_slot` rows with correct bindings
- [ ] Integration test: onboarding with a mix of pit-bearing and pit-empty tables produces slots only for pit-bearing tables; pit-empty tables remain unassigned
- [ ] Integration test: pit-name equivalence collapses `"Main"`, `"main "`, `"MAIN"` to a single `floor_pit` (pilot default rule)
- [ ] Integration test: re-invocation on an already-bootstrapped casino produces zero new rows and returns `already_bootstrapped`
- [ ] Integration test: forced failure mid-transaction produces zero canonical rows for the casino
- [ ] Integration test: `gaming_table.pit` values are unchanged after bootstrap (byte-equal)
- [ ] E2E or integration-level test: after onboarding-with-bootstrap, PRD-067's `getPitAssignmentState` returns the bootstrapped mapping (downstream hand-off verified end-to-end)
- [ ] Negative authorization test: a non-admin staff member cannot invoke bootstrap (no client-callable escalation path)

**Operational Readiness**
- [ ] One structured log event per bootstrap invocation with `{ actor, casino, layout_version_id, pits_created, slots_created, tables_without_pit, duration_ms, outcome }`
- [ ] Rollback path documented: reverting the feature leaves existing bootstrapped mappings in place (they become a historical artifact rather than a live contract); the documented rollback removes the bootstrap trigger from onboarding completion, not the already-materialized rows. The rollback doc must state this plainly.

**Documentation**
- [ ] SRM updated if `FloorLayoutService` gains a new published method (e.g., `bootstrapCasinoPitLayout`); otherwise note "no SRM change" in EXEC-SPEC
- [ ] Open questions R1 (pit-name equivalence), R2 (game_type mapping), R3 (transport), R4 (wizard UX) resolved in the EXEC-SPEC `decisions` block or explicitly carried forward in EXEC-SPEC risks
- [ ] Known limitations documented: backfill for pre-existing onboarded casinos is NOT performed; `gaming_table.pit` is read-only; no bidirectional sync

**Surface Governance (this PRD introduces no new UI surface)**
- [ ] No new top-level surface or panel added; PRD-068 is backend-only and PRD-067 is the downstream consumer
- [ ] No new truth-bearing metrics introduced (the structured log event is diagnostic, not measurement-grade)

---

## 9. Related Documents

- **Intake (scope authority)**: `docs/issues/gaps/pit-bootstrap/FIB-PIT-BOOTSTRAP-001.md`
- **Intake (structured traceability authority)**: `docs/issues/gaps/pit-bootstrap/FIB-S-PIT-BOOTSTRAP-001.json`
- **Downstream consumer PRD**: `docs/10-prd/PRD-067-admin-operations-pit-configuration-v0.md`
- **Downstream consumer FIB-S**: `docs/issues/gaps/pit-configuration/FIB-S-PIT-CONFIG-001-admin-operations-pit-configuration.json`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (`FloorLayoutService`, `OnboardingService`, `TableContextService`)
- **Schema / Types**: `types/database.types.ts` (`floor_layout`, `floor_layout_version`, `floor_layout_activation`, `floor_pit`, `floor_table_slot`, `gaming_table`)
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **ADR-015**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- **ADR-018**: `docs/80-adrs/ADR-018-security-definer-governance.md`
- **ADR-020**: `docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md`
- **ADR-024**: `docs/80-adrs/ADR-024_DECISIONS.md`
- **ADR-030**: `docs/80-adrs/ADR-030-auth-system-hardening.md`
- **Over-Engineering Guardrail**: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- **Feature pipeline entry (this PRD is built via)**: `/build PRD-068`

---

## 10. Business Rules & Invariants

### 10.1 Hard Business Rules (from FIB-S `zachman.why.business_rules`)

| ID | Rule | Severity |
|----|------|----------|
| **RULE-1** | Onboarding pit input is materialized into the canonical floor layout mapping so PRD-067's admin panel renders populated state on first open. | hard |
| **RULE-2** | Distinct non-empty `gaming_table.pit` values collapse to exactly one `floor_pit` per distinct value per casino (pilot default: trimmed + case-insensitive). | hard |
| **RULE-3** | Each gaming table that had a non-empty pit value at bootstrap time maps to exactly one `floor_table_slot` with `preferred_table_id = table.id` and `pit_id = matching floor_pit.id`. | hard |
| **RULE-4** | Gaming table rows with null or empty pit at bootstrap time must NOT have a slot created — they remain unassigned. | hard |
| **RULE-5** | Bootstrap preserves `gaming_table.pit` verbatim. It is read-only input; bootstrap does not update, null, or delete the column on any row. | hard |
| **RULE-6** | All canonical writes for one casino commit atomically. Partial state is never visible to any reader. | hard |
| **RULE-7** | Bootstrap is idempotent per casino. Re-invocation must not create duplicate `floor_layout`, `floor_layout_version`, `floor_pit`, or `floor_table_slot` rows. | hard |
| **RULE-8** | Bootstrap is casino-scoped. It never reads or writes rows for any other casino. | hard |
| **RULE-9** | Canonical writes are executed through `FloorLayoutService` (or an ADR-018-governed SECURITY DEFINER RPC), never by an ad-hoc onboarding handler. Context derivation follows ADR-024 INV-8. | hard |

### 10.2 Invariants (from FIB-S `zachman.why.invariants`)

- Bootstrap is casino-scoped.
- Only existing `gaming_table` rows for the onboarding casino are consulted.
- `floor_pit` is created only from non-empty, distinct pit names.
- `floor_table_slot.preferred_table_id` points to a `gaming_table` row in the same casino.
- Exactly one active `floor_layout_activation` exists per casino after bootstrap success.
- `gaming_table.pit` column values are unchanged after bootstrap.

### 10.3 Decision Notes (carried from FIB-S `zachman.why.decision_notes`)

- Pit-name equivalence rule is an EXEC-SPEC decision; pilot default is trimmed + case-insensitive.
- `slot_label` and `sequence` are implementation details — EXEC-SPEC picks deterministic defaults (e.g., `slot_label = gaming_table.label`, `sequence = insertion order`).
- `game_type` derivation from `gaming_table.type` is an EXEC-SPEC concern; **fail closed** if no mapping exists for a type.
- Re-running bootstrap on an already-bootstrapped casino is safe (idempotent no-op); targeted re-bootstrap is out of scope.
- Backfill for casinos that completed onboarding before this slice ships is explicitly deferred.
- This slice does NOT resolve PRD-067 OQ-1 (`gaming_table.pit` mirroring for legacy filters).

---

## 11. Non-Goals & Deferred Items

### 11.1 Explicit Exclusions (from FIB-S `intent.explicit_exclusions`)

- No canonicalization of `gaming_table.pit` across the codebase
- No migration of existing readers off `gaming_table.pit`
- No removal, deprecation, or schema change to `gaming_table.pit`
- No CI rules, lint rules, governance gates, inventory systems, or topology enforcement
- No new services, bounded contexts, or architectural layers
- No layout designer, floor-map editor, multi-version UI, or version lifecycle UI
- **No version-lifecycle mechanics of any kind** — no promotion workflow, no draft/published states, no version numbering semantics beyond the minimum the schema requires, no multi-version branching, no `layout_payload` authoring
- **No normalization policy, naming governance, or operator-facing pit-reconciliation UX.** Pit-name equivalence for this slice is trimmed + case-insensitive and stops there (see OQ-1 §12). Do not elevate a one-line derivation rule into a governance project.
- **No new transport pattern, abstraction, or doctrinal architecture.** The service-method-first default (see OQ-3 §12) is a resolved implementation choice pending EXEC-SPEC confirmation, not an open architectural debate.
- No backfill for casinos that completed onboarding before this slice ships
- No admin UI changes in this slice
- No bidirectional sync between `gaming_table.pit` and canonical mapping
- No approval workflow, notification, or audit subsystem introduction

### 11.2 Deferred (likely next, from FIB-S `coherence.deferred_items` and FIB-H §J)

- Canonicalization of `gaming_table.pit` (legacy retirement)
- Layout designer surface (reserved for a later PRD; distinct from PRD-067 panel)
- Multi-version layout lifecycle management
- **Backfill for casinos onboarded before this slice shipped.** Deferred with intent. The "while we're here, let's fix old casinos too" expansion is explicitly rejected for this slice — any backfill must be authored as its own PRD with its own safety design, its own idempotency story against already-admin-corrected casinos, and its own rollout gate. Do not allow EXEC-SPEC, workstreams, code review, or devils-advocate passes to re-open this deferral.
- Bidirectional sync (admin panel edits → `gaming_table.pit`)
- Admin-triggered re-bootstrap or reset-to-onboarding-state
- `gaming_table.pit` mirroring decision for legacy dashboard filters (PRD-067 OQ-1)

---

## 12. Open Questions

All four items are inherited from FIB-S `governance.open_questions_allowed_at_scaffold`. They remain unresolved at PRD stage and must be either resolved in the EXEC-SPEC `decisions` block (with `impact_on_scope: none` evidence) or carried forward in the EXEC-SPEC risks section.

- **OQ-1**: Whether pit-name equivalence uses trimmed + case-insensitive matching or strict equality. *Default (adopt unless EXEC-SPEC supplies a specific operational reason to change it)*: **trimmed + case-insensitive**; canonical stored label is the first observed trimmed form. *Containment*: this rule is a one-line derivation, not a policy project. EXEC-SPEC, workstreams, and reviewers must not expand OQ-1 into a normalization standard, a naming-governance doc, or an operator-facing reconciliation UX. If operators later need a deliberate naming policy, that is a separately scoped PRD, not this one.
- **OQ-2**: Which `gaming_table.type` values map to which `floor_table_slot.game_type` enum values, and how to handle tables whose type has no mapping. *Default if unresolved by EXEC stage*: EXEC-SPEC produces an explicit mapping table; bootstrap **fails closed** for any unmapped type (no partial mapping committed).
- **OQ-3**: Whether bootstrap is invoked from a new `FloorLayoutService` method or a new SECURITY DEFINER RPC. *Default (held — do not re-litigate)*: **`FloorLayoutService` method**; promote to a SECURITY DEFINER RPC **only** if a single-transaction guarantee across onboarding completion + canonical writes genuinely requires server-side composition. *Containment*: this is an implementation choice, not a doctrinal architecture debate. EXEC-SPEC picks one (defaulting to the service method) and moves on. This slice does not introduce a new transport pattern, a new abstraction, or a new policy about where bootstrap-shaped operations "should" live.
- **OQ-4**: Whether the wizard completion UI surfaces a confirmation of how many pits/slots were materialized. *Default if unresolved by EXEC stage*: no UI change; structured log only.

---

## 13. Surface & Touchpoint Inventory (from FIB-S `zachman.where`)

**Primary surface:** Onboarding setup wizard completion (no new UI surface)

**Surfaces in scope:**
- Onboarding setup wizard (existing) — `app/(onboarding)/setup/setup-wizard.tsx` — host flow
- Onboarding server actions (existing) — `app/(onboarding)/setup/_actions.ts` — host module for bootstrap trigger
- `FloorLayoutService` write path — `services/floor-layout/` — mutation owner for canonical records; may gain one new method
- PRD-067 admin pit configuration panel — `components/admin/pit-configuration-panel.tsx` — **downstream consumer only**, not modified by this slice

**Inbound touchpoints:** `admin_completes_onboarding_setup`

**Outbound touchpoints:** `canonical_pit_slot_mapping_materialized` (persisted records), `structured_bootstrap_log_event` (log)

**Bounded contexts touched:**

| Context | Role in this slice |
|---------|---------------------|
| `OnboardingService` / onboarding flow | **Trigger host.** Invokes bootstrap at the completion moment. Does not own canonical writes. |
| `FloorLayoutService` | **Mutation owner.** All writes to `floor_layout`, `floor_layout_version`, `floor_layout_activation`, `floor_pit`, `floor_table_slot` for bootstrap flow through this service (or an ADR-018-governed RPC). |
| `TableContextService` | **Read-only consultant.** Source of `gaming_table` rows and their `pit` values. Not asked to persist any state for this feature. |
| PRD-067 admin panel | **Downstream read-only consumer.** Consumes the bootstrapped mapping via `FloorLayoutService.getPitAssignmentState`. No code change. |

---

## 14. Expansion Trigger Rule

Per FIB-H §K and FIB-S `governance.amendment_required_for`, any downstream artifact (including this PRD's EXEC-SPEC) that proposes any of the following requires FIB amendment **before** proceeding:

- Rewriting or deleting `gaming_table.pit` during bootstrap
- Adding a UI surface for manual pit selection during onboarding
- Creating any admin UI to re-run or reset bootstrap
- Introducing bidirectional sync between `gaming_table.pit` and canonical mapping
- Creating layout versioning or designer UX as part of this slice
- Introducing any version-lifecycle mechanic (promotion workflow, draft/published states, version numbering semantics, `layout_payload` authoring, multi-version branching)
- Elevating OQ-1 pit-name equivalence into a normalization policy, naming-governance doc, or operator-facing reconciliation UX
- Introducing a new transport pattern, abstraction, or doctrinal policy about where bootstrap-shaped operations should live (OQ-3 default is held; EXEC-SPEC picks service-method or RPC and proceeds)
- Backfilling casinos onboarded before this slice ships
- Any CI rule, lint rule, or governance gate added as part of this slice
- Cross-casino bootstrap or multi-tenant fan-out
- Any change to PRD-067's panel behavior driven by this slice

The EXEC-SPEC's intake-traceability audit enforces this boundary mechanically.

---

## Appendix A: Success Test (from FIB-H)

Verbatim, non-negotiable:

> **On a fresh casino:**
> - Enter pit name `"Main"` during setup
> - Complete onboarding
> - Open admin pit panel (`/admin/settings/operations`)
> - See `"Main"` with tables present
> - Assign table → pit successfully
>
> **If any step fails → feature is NOT complete.**

---

## Appendix B: Traceability Summary (FIB-S → PRD)

| FIB-S Element | PRD Location |
|---------------|--------------|
| `intent.success_outcomes` (OUT-1..OUT-8) | §2.2 Goals, §4.1 Scope, §8 DoD |
| `intent.explicit_exclusions` | §2.3 Non-Goals, §11.1 Exclusions |
| `zachman.how.capabilities` (CAP-1..CAP-7) | §5.1 Functional Requirements (capability table) |
| `zachman.why.business_rules` (RULE-1..RULE-9) | §10.1 Hard Business Rules |
| `zachman.why.invariants` | §10.2 Invariants |
| `zachman.where.surfaces` / `touchpoints` | §13 Surface & Touchpoint Inventory |
| `containment.loop` (STEP-1..STEP-6) | §6 UX / Flow Overview (Flows 1–3) |
| `governance.open_questions_allowed_at_scaffold` | §12 Open Questions |
| `governance.amendment_required_for` | §14 Expansion Trigger Rule |
| `dependencies.required_existing` | §7.1 Dependencies |
| `dependencies.missing_dependencies` | §7.2 R1–R3 |
| `coherence.deferred_items` | §11.2 Deferred |

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-22 | Product (drafted from FIB-PIT-BOOTSTRAP-001 v0 + FIB-S-PIT-BOOTSTRAP-001) | Initial draft |
| 0.2 | 2026-04-22 | Product (containment pass) | Hardened four scope-smuggling doorways: (1) "minimal canonical scaffold" now explicitly forbids any version-lifecycle ceremony, promotion workflow, or `layout_payload` authoring; (2) OQ-3 transport default (service-method first, RPC only if transactional composition requires it) is held as a resolved implementation choice, not a doctrinal debate; (3) OQ-1 pit-name equivalence is frozen as a one-line derivation, not a normalization policy; (4) backfill deferral reinforced against "while we're here" expansion. Updated §1, §4.1, §5.1, §11.1, §11.2, §12, §14. |

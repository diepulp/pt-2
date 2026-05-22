---
id: PRD-069
title: Pit Topology Canonicalization Remediation
owner: Lead Architect (spec steward); FloorLayoutService + TableContextService (implementation)
status: Draft
affects: [ADR-051, ADR-015, ADR-018, ADR-024, FIB-PTC-001, PRD-030, PRD-060, PRD-067]
created: 2026-04-20
last_review: 2026-04-20
phase: Pilot integrity / pit topology canonicalization
pattern: B
http_boundary: false
intake_ref: docs/issues/gaps/pit-topology-canonization/FIB-PIT-TOPOLOGY-CANONIZATION.md
structured_ref: docs/issues/gaps/pit-topology-canonization/fib-s-pit-canonization.json
scaffold_ref: null
gov010_status: waiver-pending  # FIB-PTC-001 + ADR-051 supply scaffold-equivalent decomposition
adr_refs: [ADR-051, ADR-015, ADR-018, ADR-024]
standards_ref: docs/80-adrs/ADR-051-pit-topology-canonicalization-standard.md
---

# PRD-069 — Pit Topology Canonicalization Remediation

## 1. Overview

- **Owner:** Lead Architect (spec steward); FloorLayoutService (canonical topology authority) and TableContextService (legacy compatibility consumer and retirement executor) share implementation ownership.
- **Status:** Draft
- **Summary:** PT-2 carries two disconnected pit-topology models — legacy `gaming_table.pit` (text column, written by the wizard, read by the pit terminal and shift metrics) and the first-class floor-layout entities (`floor_layout` / `floor_layout_version` / `floor_pit` / `floor_table_slot` / `floor_layout_activation`, read by the PRD-067 admin panel). Newly onboarded casinos populate only the legacy side, so the admin panel renders empty while the operator terminal functions. ADR-051 declared the first-class model canonical and established writer, reader, and deprecation rules. This PRD implements that standard: adds schema-level enforcement of the single-active-activation invariant, makes `rpc_complete_casino_setup` the deterministic bootstrap write point, back-mirrors pilot casinos already past setup, remediates the W1 legacy-authoritative-write violation in `createGamingTableAction`, migrates known legacy readers, ships the G3 mechanical enforcement, and establishes the G4 inventory. Layout designer work (PRD-068) and column removal (separate ADR) remain out of scope.

---

## 2. Problem & Goals

### 2.1 Problem

Onboarding a new casino leaves the system in split-brain: the wizard writes pit names to `gaming_table.pit` (legacy text) but creates zero rows in the first-class floor-layout tables. The admin pit-configuration panel (PRD-067) reads only the first-class model, so operators see "my pits are gone" after completing setup. The system has the activation RPC (`rpc_activate_floor_layout`) but no code path invokes it at setup time, and the existing one-way mirror (first-class → legacy) in `rpc_assign_or_move_table_to_slot` does not run until an admin moves a table. The gap is systemic: a missing standard that ADR-051 has now set; this PRD closes the execution side.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1** — A newly onboarded casino reaches `setup_status = 'ready'` only with an active first-class layout | Integration test: `rpc_complete_casino_setup` → exactly one `floor_layout_activation` row with `deactivated_at IS NULL` for the casino |
| **G2** — The admin pit-configuration panel renders populated state for every newly onboarded casino without manual intervention | E2E test: fresh wizard → `/admin/settings/operations` pit panel shows the pits the admin configured |
| **G3** — Pilot casinos already at `setup_status = 'ready'` without a first-class layout are retroactively canonicalized | Migration run produces one active activation per affected casino; inventory count drops to zero |
| **G4** — Invariant §1 of ADR-051 (exactly one active activation per casino) is schema-enforced, not application-convention | Partial unique index present; concurrent `rpc_complete_casino_setup` calls produce one activation, not two |
| **G5** — `createGamingTableAction` no longer originates pit topology | Code review: no write path outside the canonical bootstrap writer sets `gaming_table.pit` as an authoritative source |
| **G6** — Every enumerated legacy reader migrates to the first-class model with no legacy fallback | G4 inventory reaches zero remaining production legacy readers |
| **G7** — New code cannot introduce new `gaming_table.pit` reads | CI enforcement rejects PRs that add disallowed legacy reads |

### 2.3 Non-Goals

- Floor-layout designer UI (deferred to **PRD-068**)
- Multi-version layout editing, version promotion workflows (deferred to **PRD-068**)
- Historical reconciliation of pre-remediation pit changes (explicitly rejected by ADR-051 §D6)
- Bidirectional mirroring between `gaming_table.pit` and first-class entities (explicitly rejected by ADR-051 §D6 and FIB-PTC-001 §H)
- Dropping the `gaming_table.pit` column (requires a separate schema-change ADR invoked only after G6 reaches zero; governed by ADR-051 §G2)
- Changes to RLS, SECURITY DEFINER governance, or context derivation beyond what ADR-015 / ADR-018 / ADR-024 already mandate
- Changes to pit terminal UI or admin panel UX beyond what reader migration requires
- Lazy or admin-panel-triggered bootstrap import paths (prohibited by ADR-051 §D2)

---

## 3. Users & Use Cases

- **Primary users:** Casino admin / operations lead completing onboarding, pit boss operating the pit terminal post-onboarding
- **Secondary users:** Engineering (code review surface gains the G3 gate), pit-scoped reporting consumers (read through canonical mapping only), future PRD-068 designer scope (inherits a consistent baseline)

**Top Jobs:**

- As an **admin completing onboarding**, I need the pits I configured in the wizard to appear in the admin pit-configuration panel immediately, without an "import legacy" button or manual re-entry.
- As an **admin on a pilot casino already past setup**, I need the system to canonicalize my existing pit structure in a single back-mirror operation, without data loss and without requiring me to re-run setup.
- As a **pit boss using the operator terminal**, I need pit groupings to continue resolving correctly while readers migrate off the legacy column — no regression during the transition.
- As an **engineer reviewing a PR**, I need mechanical enforcement that rejects new reads of `gaming_table.pit` so topology drift cannot re-enter the codebase.
- As a **compliance / audit consumer**, I need one canonical source of pit topology so reporting is unambiguous.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Schema enforcement (WS1):**

- Add a partial unique index: `UNIQUE (casino_id) WHERE deactivated_at IS NULL` on `floor_layout_activation`. Ships in the same migration PR as WS2.

**Canonical bootstrap writer (WS2):**

- Extend `rpc_complete_casino_setup`, or an internal RPC invoked transitively from it **within the same transaction**, to create: `floor_layout` + v1 `floor_layout_version` + one `floor_pit` per distinct onboarding-time pit value + `floor_table_slot` per table + one active `floor_layout_activation` row.
- Implementation MUST comply with ADR-015 (SET LOCAL pooler-safe), ADR-018 (SECURITY DEFINER governance), ADR-024 (context from `set_rls_context_from_staff()`, no `p_casino_id` / `p_actor_id` parameters).
- D5 idempotency: no-op when an active activation already exists for the casino.

**Back-mirror for pilot casinos already past setup (WS3):**

- One-time migration or operator RPC that finds every casino where `setup_status = 'ready'` and no active `floor_layout_activation` exists, then applies the same canonicalization logic as WS2.
- Idempotent: runs against affected casinos only; no-op on already-canonicalized casinos.
- Designed to be safely re-runnable; after initial execution, subsequent runs are no-ops on the affected-casino set.

**WS3 — Normalization rules:**

- Trim and normalize legacy pit labels (case-insensitive normalization + whitespace trimming) before grouping.
- Collapse duplicate labels that differ only by case or whitespace into a single `floor_pit`.
- Create pits in deterministic order (e.g., sorted normalized labels) so reruns produce stable IDs and audit trails.

**WS3 — Null / empty handling (product decision, not EXEC-SPEC):**

- Tables with NULL or empty `gaming_table.pit` are **excluded from pit assignment**. They remain unassigned in the first-class model — no `floor_table_slot` row is created for them — and surface on the PRD-067 admin panel's unassigned-tables list for explicit admin action.
- **Rationale.** This is a product decision made at the PRD level, not deferred to EXEC-SPEC. It aligns with the PRD-067 admin workflow (assign explicitly), avoids introducing a synthetic `Unassigned` pit as a domain concept, keeps the topology model clean, and prevents environment drift (staging vs. production picking different defaults).
- **Alternative rejected.** Assigning unassigned tables to a canonical `Unassigned` `floor_pit` was considered and rejected. If a future product requirement needs a first-class "unassigned" topology state, it must be promoted to a real domain concept under a separate ADR — not introduced as a back-mirror convenience.

**WS3 — Contradiction handling:**

- If the legacy state maps a single table to multiple distinct pit values (e.g., duplicated or stale rows), the back-mirror MUST:
  - **Fail that casino's canonicalization transactionally** — no partial first-class state persists for the contradicting casino.
  - Emit an `audit_log` entry with the casino, table, conflicting values, and run ID.
  - Surface the casino for manual remediation; subsequent WS3 reruns retry that casino only after the contradiction is resolved at the source.
- A contradicting casino MUST NOT block back-mirror completion for other casinos in the same run.

**WS3 — Post-failure state (operational sequencing):**

- A casino that failed WS3 canonicalization remains on the legacy-only model until its source contradiction is resolved and WS3 is re-run against it.
- Such casinos are **blocked from reader-migration assumptions**: WS5 MUST NOT proceed in any environment that contains a failed-WS3 casino until that casino is canonicalized. This reinforces the §4.3 ordering contract operationally — not just structurally — and prevents migrated readers from raising spurious integrity findings on casinos that were never canonicalized in the first place.
- The G4 inventory (WS7) tracks failed-WS3 casinos as explicit blockers on pilot exit, one inventory entry per failed casino.

**WS3 — Auditability:**

- Each WS3 run emits a **per-run summary audit entry** carrying counts: casinos processed, succeeded (canonicalized this run), skipped (already canonicalized, no-op), failed (contradiction or other error), plus a run ID.
- Each successfully canonicalized casino emits a **per-casino `audit_log` entry** with the casino ID, normalized pit labels imported, table-to-slot mapping applied, and run ID — not only contradictions are logged.
- These entries answer "which casinos were touched in run X?" and "what mapping was applied to casino Y?" without requiring database snapshots or log excavation.

**`createGamingTableAction` remediation (WS4):**

- **Preferred approach:** Route table creation through the canonical bootstrap writer (or a thin sibling on the same authoritative write path) so it populates the canonical model and emits the D3 compatibility projection within the same transaction. This preserves the operator affordance (pit value supplied at table-creation time) while eliminating the legacy-authoritative write.
- **Fallback (only if the preferred approach is blocked by wizard coupling or a comparable constraint surfaced in EXEC-SPEC):** Remove topology responsibility from `createGamingTableAction` entirely — tables are created without a pit association, and pit assignment is deferred to the PRD-067 admin panel post-creation.
- The choice between preferred and fallback MUST be recorded in the EXEC-SPEC along with the specific blocker that justified fallback. Fallback without a named blocker is rejected at review.
- Logged in the W1 / G4 exception inventory until this workstream merges.

**Legacy-reader migration (WS5):**

Initial inventory (audit during WS5-audit sub-step may extend this list):

- **WS5a** — `rpc_get_dashboard_tables_with_counts` (`supabase/migrations/20251228012528_dashboard_tables_batch_rpc.sql:68`): replace `gt.pit` with a join through `floor_table_slot` → `floor_pit` on the active `floor_layout_version`.
- **WS5b** — Shift metrics derivations that resolve table-to-pit (exact touch points identified in WS5-audit).
- **WS5c** — Any private analytics or dashboard reads discovered by the WS5-audit sweep.
- Each migrated reader reads from the first-class model with **no fallback to legacy** on miss. An absent first-class row is an integrity finding (per R2 / Invariant §4), not a compatibility seam.

**Mechanical enforcement (WS6):**

- CI check (grep-based gate or ESLint rule) that rejects new reads of `gaming_table.pit` outside an approved compatibility path (maintained in the G4 inventory with explicit allowlist).
- **Enforcement scope — the CI check MUST scan all three layers:**
  - **Application code** — TypeScript / JavaScript across services, hooks, components, server actions, and route handlers.
  - **SQL** — migration files, RPC bodies, and view definitions under `supabase/migrations/`.
  - **Version-controlled analytics queries** — any dashboard or reporting SQL committed to the repo.
- A new read appearing in any of the three layers fails CI unless explicitly allowlisted with a linked G4 inventory entry.
- **Allowlist governance.** Any new allowlist entry MUST be approved by the FloorLayoutService owner (per ADR-051 header ownership), include a named owner, a stated blocking-dependency justification (an external constraint that specifically prevents migration), and a removal milestone linked to a D4 pilot-gate checkpoint. Convenience allowlisting — "we'll get to it later," "this PR is urgent" — is rejected at review. The G4 inventory records every allowlist entry alongside its approval and removal milestone.
- Ships **with or before** WS5 so migrated readers cannot regress.

**G4 inventory document (WS7):**

- Tracked inventory at `docs/70-governance/INV-PIT-TOPOLOGY-LEGACY.md` (or similar): lists remaining legacy readers, remaining projection paths, W1 tracked exceptions, and their removal milestones.
- Updated in every PR that touches this remediation. Completion when inventory is empty, or when any residual exception is time-bound, approved, and linked to a pilot-gate milestone (per ADR-051 D4 / G4).

### 4.2 Out of Scope (MVP)

Any item listed in §2.3. Out-of-scope items are rejected at review time for this PRD.

### 4.3 Workstream Ordering Contract

Execution order is mandatory. Review gates enforce this sequencing; PRs that invert the order are rejected.

**Phase 1 — Foundation**
- **WS1 + WS2** MUST ship in the same PR (blocking co-ship; closes the concurrent-activation race).
- **WS6** MUST land before any WS5 PR merges (prevents reader-migration regression).

**Phase 2 — Data Convergence**
- **WS3** MUST complete successfully (affected-casino count = 0) before any WS5 PR merges. A migrated reader hitting a casino without a first-class layout would otherwise raise spurious integrity findings.

**Phase 3 — Read Migration**
- **WS5a / WS5b / WS5c** MAY proceed in parallel after WS3 completion. Each ships in its own PR and decrements the G4 inventory.

**Phase 4 — Write Cleanup**
- **WS4** MAY run in parallel with WS5, but MUST complete before Definition of Done. Its W1 exception stays on the G4 inventory until the workstream merges.

**Phase 5 — Governance Closure**
- **WS7** is maintained continuously from WS1 onward. It MUST reach zero legacy readers before pilot exit. Exceptions are permitted only when tied to a **blocking dependency outside this PRD's scope** — a named external constraint (e.g., an unshipped upstream service, a vendor API limitation, a separately-tracked migration). Each exception is time-bound, approved by the FloorLayoutService owner, and linked to a D4 pilot-gate milestone per ADR-051. **Convenience exceptions** (insufficient review time, deferred priority, "we'll fix it post-pilot") are rejected.

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1** — `rpc_complete_casino_setup` MUST produce exactly one active `floor_layout_activation` for the casino before returning `setup_status = 'ready'`. If the writer fails, the RPC MUST fail transactionally — no partial-bootstrap state is permitted.
- **FR-2** — The canonical bootstrap writer MAY read `gaming_table.pit` only as a **one-time bootstrap hint**, scoped to exactly two paths:
  - Setup completion (WS2) — one-shot per casino at `rpc_complete_casino_setup`.
  - Back-mirror execution (WS3) — one-shot per affected casino at migration time.

  No other runtime, user-triggered, or scheduled path may read `gaming_table.pit` for topology derivation. These two reads are the only compatibility-source reads permitted under this PRD; WS6 (G3 gate) allowlists them explicitly and rejects every other legacy read.
- **FR-3** — The back-mirror (WS3) MUST be idempotent: re-running produces no duplicate activations, no duplicate pits, no duplicate slots.
- **FR-4** — Every migrated reader MUST raise an integrity-finding error (not silent legacy fallback) when the first-class mapping is absent for a table.
  - **Rationale (strict over degraded).** The system intentionally favors strict failure over degraded partial responses to surface integrity defects early and prevent silent data inconsistency. Partial responses would let topology drift hide behind apparently functional surfaces — exactly the split-brain condition this PRD exists to close. If a future product requirement argues for partial/flagged responses on a specific surface, that surface's exception must be approved under the WS6 allowlist governance, not through ad-hoc fallback logic.
  - **Operational behavior:**
    - Reader returns an explicit error; no partial data is surfaced to the caller.
    - Emits a structured audit / event-log entry carrying casino, table, query name, and correlation ID.
    - Triggers alerting via the project logging channel (Sentry or equivalent) at a severity that pages the responsible on-call when occurring in production.
    - A runbook entry (see §8 Operational Readiness DoD) defines the remediation path: diagnose the missing first-class mapping, backfill via WS3 semantics if the casino was never canonicalized, or raise a data-integrity ticket if the mapping was canonicalized and subsequently lost.
- **FR-5** — The G3 CI gate MUST reject PRs that add `gaming_table.pit` reads outside the approved allowlist tracked in WS7.
- **FR-6** — `createGamingTableAction` MUST NOT originate pit topology after WS4 merges. If retained, its topology writes flow through the canonical bootstrap writer in the same transaction.

### 5.2 Non-Functional Requirements

- **NFR-1 — Concurrency safety.** The W4 partial unique index enforces single-active-activation under concurrent RPC invocation. Any duplicate-activation attempt MUST fail at the database layer, not at application logic.
- **NFR-2 — Transactionality.** All bootstrap writes (WS2) and back-mirror writes (WS3) occur in a single transaction per casino. A partial canonicalization is not a valid state.
- **NFR-3 — Zero regression.** The pit terminal and PRD-067 admin panel MUST continue to function during and after the migration. Reader migrations do not change their UX contracts.
- **NFR-4 — Auditability.** Every back-mirror invocation and bootstrap-writer invocation emits an `audit_log` entry (pattern consistent with `rpc_assign_or_move_table_to_slot`).
- **NFR-5 — Reversibility.** The back-mirror migration is reversible: a rollback script removes only rows it created (identifiable by migration marker or by absence prior to the migration timestamp).
- **NFR-6 — RLS compliance.** All new RPCs follow the self-injection pattern per ADR-024; no `p_casino_id` / `p_actor_id` parameters exist.

---

## 6. UX / Flow Overview

- **Flow 1 — Fresh onboarding.** Admin completes wizard Steps 1–N → `rpc_complete_casino_setup` → (canonical bootstrap writer runs in same transaction) → casino has active first-class layout → admin lands in `/admin/settings/operations` → pit-configuration panel renders populated. No "import pits" button. No second-screen intervention.
- **Flow 2 — Pilot back-mirror.** Migration deploys → WS3 back-mirror scans casinos → for each casino with `setup_status = 'ready'` and no active activation, canonicalization runs in a transaction → affected casinos gain active first-class layouts invisibly → next admin-panel visit renders populated state.
- **Flow 3 — Legacy reader migration.** Each legacy reader (WS5a/5b/5c) migrates in its own PR → G3 CI gate prevents new legacy reads → G4 inventory count decrements per merged PR → pilot gate in ADR-051 §D4 opens when inventory is empty (or any residual exception is time-bound, approved, and linked to a removal milestone).
- **Flow 4 — `createGamingTableAction` remediation.** WS4 ships → either the action routes through the canonical bootstrap writer (preferred), or topology responsibility is removed and assignment becomes an admin-panel follow-up → G4 inventory removes the W1 tracked exception.
- **Flow 5 — Integrity-finding path.** A migrated reader encounters a table with no first-class mapping → raises a structured error (not a fallback) → surfaces as an investigation-worthy ticket. This path should not fire after WS3 completes for a clean pilot environment.

---

## 7. Dependencies & Risks

### 7.1 Prerequisites

- **ADR-051** (Accepted) — the standard this PRD implements
- **FIB-PTC-001** — the feature-in-a-box that scoped the remediation
- **ADR-015 / ADR-018 / ADR-024** — governing RPC structure for all new bootstrap / back-mirror RPCs
- **`rpc_complete_casino_setup`** exists (`supabase/migrations/20260211184700_create_rpc_complete_casino_setup.sql`) and is idempotent per PRD-030
- **First-class floor-layout schema** exists (`supabase/migrations/20251108223004_create_floor_layout_service.sql`)
- **`rpc_activate_floor_layout`** available for reuse or as reference pattern (lines 103–120 of the floor-layout migration)
- **Existing mirror pattern** in `rpc_assign_or_move_table_to_slot` (`supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql:178–181`) as the canonical D3 projection reference

### 7.2 Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **R1** — Unknown legacy readers discovered mid-migration | WS5 scope expansion | WS5-audit sub-step runs before WS5a/5b ship; discovered readers added to G4 inventory, migrated under WS5 umbrella |
| **R2** — Back-mirror (WS3) encounters legacy `gaming_table.pit` values that are malformed or contradictory within a casino | WS3 failure for specific casinos | WS3 produces a per-casino result log; contradictory casinos are surfaced for manual resolution, not silently skipped |
| **R3** — `createGamingTableAction` remediation (WS4) reveals deeper wizard coupling (e.g., Step 3 UI depends on returning a pit value) | WS4 scope creep into wizard UI | WS4 design decision captured in EXEC-SPEC; if wizard changes are required, they scope to "remove topology responsibility and rely on admin panel" path rather than inventing a designer in this PRD |
| **R4** — G3 CI gate produces noisy false positives on compatibility paths | Review friction | Allowlist maintained in WS7 inventory; each allowlisted read is a tracked exception with removal milestone |
| **R5** — Concurrent `rpc_complete_casino_setup` invocations during pilot produce duplicate-activation race if W4 index lands after WS2 | Rare but possible integrity violation | WS1 (index) and WS2 (writer) ship in the **same migration PR**; review gate enforces co-shipping |
| **R6** — A downstream reader migrates to first-class but a transient data issue produces an integrity-finding error in production | Operator-visible error | Back-mirror (WS3) runs before reader migrations merge; post-WS3 integrity findings indicate real defects, which is the intended behavior |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Workstream completion (maps to ADR-051)**

- [ ] **WS1** — Partial unique index `UNIQUE (casino_id) WHERE deactivated_at IS NULL` on `floor_layout_activation` shipped (W4 / Invariant §1)
- [ ] **WS2** — `rpc_complete_casino_setup` (or in-transaction descendant) populates `floor_layout` + v1 version + `floor_pit` + `floor_table_slot` + active `floor_layout_activation`; D2 / D5 / W2 / W3 satisfied
- [ ] **WS3** — Back-mirror for pilot casinos already at `setup_status = 'ready'` without an active layout has run; affected-casino count reaches zero
- [ ] **WS4** — `createGamingTableAction` no longer originates pit topology; Negative-consequence #5 and W1 canonical violation retired
- [ ] **WS5a** — `rpc_get_dashboard_tables_with_counts` reads pit through `floor_table_slot` / `floor_pit` on the active `floor_layout_version`; no legacy fallback
- [ ] **WS5b** — Shift metrics derivations migrated; no legacy fallback
- [ ] **WS5c** — Any additional readers discovered by WS5-audit migrated; no legacy fallback
- [ ] **WS6** — G3 mechanical enforcement (CI grep or ESLint rule) rejects new `gaming_table.pit` reads; ships with or before WS5
- [ ] **WS7** — G4 inventory document established and maintained; inventory count reaches zero, **or** every residual exception is time-bound, approved by the FloorLayoutService owner, linked to a D4 pilot-gate milestone, AND tied to a named blocking dependency outside this PRD's scope. Convenience exceptions are rejected.

**Functionality**

- [ ] Fresh wizard → `setup_status = 'ready'` implies exactly one active `floor_layout_activation`
- [ ] PRD-067 admin pit-configuration panel renders populated state for newly onboarded casinos without manual intervention
- [ ] No lazy or admin-panel-triggered bootstrap import path exists (D2 prohibition honored)

**Data & Integrity (maps to ADR-051 Invariants §1–5)**

- [ ] **Invariant §1** — Exactly one active `floor_layout_activation` per casino; enforced by WS1 partial unique index
- [ ] **Invariant §2** — Every production pit-topology query resolves through the active first-class layout (verified by WS5 audit closure)
- [ ] **Invariant §3** — `gaming_table.pit` is never used to originate topology (verified by WS4 closure + G3 gate)
- [ ] **Invariant §4** — Missing first-class mapping raises an integrity finding; no legacy fallback anywhere
- [ ] **Invariant §5** — New product code cannot introduce direct `gaming_table.pit` dependencies (enforced by WS6 G3 gate)
- [ ] Back-mirror is idempotent: rerun produces no duplicate rows
- [ ] All new / modified RPCs are transactional — no partial canonicalization states persist
- [ ] Verified by query audit or production logging that no runtime path reads `gaming_table.pit` for topology derivation (confirms Invariants §3 and §5 beyond static analysis — empirical, not just code review)

**Security & Access**

- [ ] All new RPCs comply with ADR-015, ADR-018, ADR-024 (no `p_casino_id` / `p_actor_id` params; context from `set_rls_context_from_staff()`)
- [ ] RLS posture on `floor_layout*` tables unchanged; any query that reads pit topology continues to respect casino scope
- [ ] No privilege escalation path introduced by the canonical bootstrap writer or back-mirror

**Testing**

- [ ] **E2E**: fresh wizard completion → casino reaches `setup_status = 'ready'` → admin pit-configuration panel renders non-empty state without manual intervention
- [ ] **Integration**: concurrent `rpc_complete_casino_setup` invocations for the same casino produce exactly one active activation (proves W4 index works under concurrency)
- [ ] **Integration**: back-mirror (WS3) against a casino already canonicalized is a no-op (proves D5 idempotency)
- [ ] **Integration**: per migrated reader (WS5a/5b/5c), a table with no first-class mapping yields an integrity finding, not a legacy fallback
- [ ] **CI gate test**: a PR that adds a `gaming_table.pit` read outside the allowlist fails the G3 check
- [ ] **Unit**: canonical bootstrap writer mapper (distinct legacy pit values → `floor_pit` rows) produces expected shape on representative fixtures

**Operational Readiness**

- [ ] Back-mirror migration is reversible (rollback script scoped to rows it created)
- [ ] `audit_log` entries emitted for canonical bootstrap writer and back-mirror invocations
- [ ] Runbook entry documents how to diagnose and resolve an integrity-finding error from a migrated reader
- [ ] G4 inventory document is discoverable from `docs/70-governance/INDEX.md` (or equivalent) and linked from ADR-051

**Documentation**

- [ ] ADR-051 references this PRD as the implementing remediation
- [ ] SRM (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`) updated to reflect: FloorLayoutService as canonical topology authority; TableContextService as compatibility consumer / retirement executor
- [ ] FIB-PTC-001 status marked as "Implementation in Progress" at merge, "Implemented" at G4 inventory zero
- [ ] PRD-067 risk R1 (pilot pit/slot bootstrap coverage) marked as closed and cross-referenced to this PRD
- [ ] Known limitation documented: `gaming_table.pit` retention until G2 trigger ADR is authored

**Surface Governance**

- [ ] Not applicable — this PRD introduces no new UI surface. Existing surfaces (wizard, PRD-067 admin panel, pit terminal) retain their prior classifications; reader migrations do not change UX contracts.

---

## 9. Related Documents

### Standards & Decisions

- **ADR-051** — `docs/80-adrs/ADR-051-pit-topology-canonicalization-standard.md` (implemented standard)
- **ADR-015** — `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` (SET LOCAL compliance for new RPCs)
- **ADR-018** — `docs/80-adrs/ADR-018-security-definer-governance.md` (SECURITY DEFINER rules)
- **ADR-024** — `docs/80-adrs/ADR-024-rls-context-self-injection-remediation.md` (authoritative context derivation)

### Intake & Research

- **FIB-PTC-001** — `docs/issues/gaps/pit-topology-canonization/FIB-PIT-TOPOLOGY-CANONIZATION.md`
- **Gap analysis** — `docs/issues/gaps/pit-topology-canonization/FLOOR-LAYOUT-GAP.md`
- **Structured sidecar** — `docs/issues/gaps/pit-topology-canonization/fib-s-pit-canonization.json`

### Related PRDs

- **PRD-030** — Setup Wizard (hosts `rpc_complete_casino_setup`; this PRD extends its contract)
- **PRD-060** — Company Registration / First-Property Bootstrap (upstream context for onboarding flow)
- **PRD-067** — Admin Operations Pit Configuration (consumer PRD; risk R1 closes when this PRD merges)
- **PRD-068** — Floor Layout Designer (reserved; not yet drafted; inherits the canonicalized baseline from this PRD)

### Architecture & Data

- **SRM** — `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (updated by WS2/WS5 merges to reflect topology-authority split)
- **Canonical migrations referenced**:
  - `supabase/migrations/20251108223004_create_floor_layout_service.sql` (first-class schema + `rpc_activate_floor_layout`)
  - `supabase/migrations/20260211184700_create_rpc_complete_casino_setup.sql` (WS2 write point)
  - `supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql` (WS4 / D3 mirror reference pattern)
  - `supabase/migrations/20251228012528_dashboard_tables_batch_rpc.sql` (WS5a target)

### Governance

- **INV-PIT-TOPOLOGY-LEGACY** — `docs/70-governance/INV-PIT-TOPOLOGY-LEGACY.md` (G4 inventory document, created by WS7)

---

## Appendix A — Workstream Summary (scaffold only)

Detailed EXEC-SPEC is produced downstream by `build-pipeline` against this PRD. Scaffold provided here for scope visibility only — no implementation hints.

| WS | Name | Bounded Context | Depends On | Ships With |
|----|------|-----------------|------------|------------|
| **WS1** | Partial unique index on `floor_layout_activation` | FloorLayoutService | — | WS2 (same PR) |
| **WS2** | Canonical bootstrap writer | FloorLayoutService | WS1 | WS1 (same PR) |
| **WS3** | Back-mirror for pilot casinos | FloorLayoutService | WS2 | — |
| **WS4** | `createGamingTableAction` remediation | TableContextService | WS2 | — |
| **WS5a** | `rpc_get_dashboard_tables_with_counts` reader migration | TableContextService (read-through) | WS2, WS3, WS6 | — |
| **WS5b** | Shift metrics reader migration | Shift Intelligence | WS2, WS3, WS6 | — |
| **WS5c** | Additional readers discovered in WS5-audit | Varies | WS2, WS3, WS6 | — |
| **WS6** | G3 mechanical enforcement (CI grep / ESLint) | Governance | — | Before WS5* |
| **WS7** | G4 inventory document | Governance | — | WS1 (established); live thereafter |

Detailed file-level output lists, SQL text, validation criteria, and domain-specific patterns are deferred to the EXEC-SPEC produced by `build-pipeline` consulting `backend-service-builder`, `api-builder`, and `devops-pt2` as appropriate.

---

## Appendix B — Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-20 | Lead Architect (via prd-writer) | Initial draft implementing ADR-051 |

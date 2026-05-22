---
prd_id: PRD-030
title: "Setup Wizard — Casino Configuration, Table Provisioning & Need/Par Bootstrap"
status: Draft
version: 0.2.0
created: 2026-02-11
updated: 2026-02-11
author: Claude (lead-architect)
priority: P0
category: FEATURE/ONBOARDING
bounded_contexts:
  - CasinoService (Foundational)
  - TableContextService (table creation + need/par consumer)
depends_on:
  - PRD-025 (Tenant Bootstrap — deployed)
  - PRD-029 (Game Settings Schema Evolution — deployed)
  - PRD-024 (Landing Page + Start Gateway — deployed)
  - ADR-027 (Table Bank Mode Dual Policy — deployed)
blocks: [PRD-031 (Table Inventory Ops UI), Operational Dashboard]
source_artifacts:
  - docs/00-vision/table-context-read-model/need-par-dual-policy.md (Dual policy: INVENTORY_COUNT vs IMPREST_TO_PAR)
  - docs/00-vision/table-context-read-model/INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md (Need/par collection strategies)
  - docs/issues/gaps/table-inventory-lifecycle/GAP-TABLE-INVENTORY-LIFECYCLE.md (Table lifecycle gap map)
  - docs/issues/gaps/GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md (Setup wizard config taxonomy)
tags: [setup-wizard, onboarding, wizard-b, table-provisioning, game-seeding, need-par-bootstrap, inventory-count, P0-blocker]
---

# PRD-030: Setup Wizard — Casino Configuration, Table Provisioning & Need/Par Bootstrap

## 1. Overview

- **Owner:** CasinoService (Foundational bounded context per SRM v4.12.0)
- **Status:** Draft v0.2.0
- **Summary:** After PRD-025 bootstrap, every new tenant lands on `/setup` which renders a "coming soon" placeholder. There is no mechanism to configure casino operational settings, select the table bank mode, seed game types, create gaming tables, establish need/par targets, or transition `setup_status` from `'not_started'` to `'ready'`. This PRD implements the Setup Wizard (Wizard B) — a 5-step guided flow that takes a freshly bootstrapped casino from an empty tenant to an operational pit with the **Inventory Count model** fully configured. This is a P0 blocker: without it, no new tenant can reach the dashboard, and all downstream workflows (table sessions, fills/credits, rundowns) are unreachable.

### 1.1 Source Artifact Traceability

This PRD is driven by four source artifacts that define the operational model the wizard must bootstrap:

| Source Artifact | What It Provides | Wizard Impact |
|----------------|-----------------|---------------|
| **`need-par-dual-policy.md`** (§4–§9) | Dual policy enum (`INVENTORY_COUNT` / `IMPREST_TO_PAR`), session binding rules, bootstrap mechanics | Step 1 (bank mode selection), Step 4 (par collection), session snapshot contract |
| **`INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md`** (§3–§5) | Four collection strategies (A–D), wizard flow, UI copy guidance, DoD | Step 4 (Strategy B/C), par label/tooltip copy, DoD alignment |
| **`GAP-TABLE-INVENTORY-LIFECYCLE.md`** (§2 Phase 0, §3) | Pre-shift setup gaps, onboarding dependency chain, priority map | P0 blocker identification, Steps 1–5 scoping |
| **`GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md`** | Config entity taxonomy, minimum viable wizard steps | Config taxonomy (Appendix C), step-by-step mapping |

## 2. Problem & Goals

### 2.1 Problem

PRD-025 (Tenant Bootstrap) is fully deployed. The bootstrap RPC atomically creates `casino`, `casino_settings`, and an admin `staff` binding. PRD-029 (Game Settings Schema Evolution) is deployed with the seed RPC `rpc_seed_game_settings_defaults`. PRD-024 (Start Gateway) routes users through a deterministic decision tree at `/start`.

However, after bootstrap, every new tenant hits a dead-end:

1. `rpc_bootstrap_casino` creates `casino_settings` with `setup_status = 'not_started'`.
2. The `/start` gateway detects `setup_status !== 'ready'` and redirects to `/setup`.
3. `/setup` renders: *"The setup wizard is coming soon. Your casino workspace is being prepared."*
4. The tenant is trapped. There is no path forward.

The gap inventory (GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY) identifies six missing pieces: casino basics editing UI, bank mode selection UI, game settings seed invocation UI, table creation UI, par target collection UI, and a setup completion RPC.

**The Inventory Count model must be bootstrapped here.** Per the dual-policy vision (`need-par-dual-policy.md` §5, §9) and the bootstrap need collection doc (`INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md` §3), a casino cannot operate tables until:

1. **Bank mode is selected** — the system must know whether this casino runs `INVENTORY_COUNT` (count-as-is) or `IMPREST_TO_PAR` (restore to par at close). Default is `INVENTORY_COUNT` per ADR-027.
2. **Need/par targets are established (or explicitly skipped)** — In INVENTORY_COUNT mode, par is an advisory target to reduce fill pressure. It is *not* accounting truth. The bootstrap doc defines four strategies: (A) import par sheet, (B) manual entry per table, (C) skip/null, (D) post-go-live suggestion. This wizard implements **Strategy B** (manual entry) with **Strategy C** (skip/null) as fallback. Strategies A and D are P2.
3. **Session binding contract is met** — When a table session opens, `rpc_open_table_session` snapshots `table_bank_mode` from `casino_settings` and `need_total_cents` from `gaming_table.par_total_cents`. If the wizard doesn't configure these, every session opens with `INVENTORY_COUNT` (correct default) and `need_total = null` (functional but no par insights).

The backend plumbing for all three is deployed (ADR-027 schema, `par_total_cents` column, session snapshot logic). What's missing is the **UI to configure them during onboarding** — and that's this PRD.

### 2.2 Goals

**G1 — Unblock new tenants:** A bootstrapped admin completes the setup wizard and reaches the operational dashboard (`/pit`) within minutes.

**G2 — Casino operational configuration:** Admin reviews and edits timezone, gaming day start time, and selects `table_bank_mode` (default: `INVENTORY_COUNT`). Per dual-policy doc §4.1, this is a casino-level decision that may be overridden per table (post-MVP).

**G3 — Game settings seeded from template:** Admin selects a game template (e.g., "Small Pit Starter" = 11 variants) and the system bulk-inserts game settings via `rpc_seed_game_settings_defaults`.

**G4 — Initial gaming tables created:** Admin creates at least one gaming table with a label, game type (from seeded settings), and optional pit assignment.

**G5 — Need/par targets bootstrapped:** Admin can set `par_total_cents` per table during creation (Strategy B) or leave it null (Strategy C). UI copy follows the bootstrap doc's guidance: "Target Need (Par)" with tooltip distinguishing target from accounting truth. Per `need-par-dual-policy.md` §5.3: "Do not assume last closing inventory = par."

**G6 — Atomic setup completion:** A new RPC `rpc_complete_casino_setup` validates minimum readiness and atomically transitions `setup_status` to `'ready'`, stamping `setup_completed_at`.

### 2.3 Non-Goals

- **`table_par_policy` append-only history table** — The full vision (`need-par-dual-policy.md` §8.1) calls for an append-only policy timeline with `effective_from_gaming_day`, provenance, and approval fields. This is P2 (GAP item #9). MVP uses the flat `gaming_table.par_total_cents` column per ADR-027 — an acceptable shortcut for single-casino pilot. Must upgrade before compliance-grade multi-casino deployment.
- **Par provenance metadata** — The bootstrap need collection doc (Strategy B) specifies `source`, `approved_by`, `approved_at`, `effective_from_gaming_day` fields. These belong on the P2 `table_par_policy` table, not the flat column. MVP stores par as a simple value.
- **IMPREST_TO_PAR bootstrap path** — The dual-policy doc §6.3 defines a distinct bootstrap rule for imprest casinos (adopt last verified closing as par). This wizard defaults to INVENTORY_COUNT. Imprest-specific bootstrap UX is deferred.
- **Advanced par import from spreadsheet** — Strategy A from the Bootstrap Need Collection doc. Complex bulk import is P2.
- **Dynamic par recommendations** — Strategy D (`need-par-dual-policy.md` §10, bootstrap doc §Strategy D). System-suggested par from operational history. Requires data collection; P2.
- **Post-setup settings editing** — Operational settings pages (`/settings/casino`) are a separate concern. This wizard is one-time onboarding only.
- **Company entity creation** — GAP-COMPANY-ENTITY-ONBOARDING-ORPHAN is tracked separately. Company remains metadata-only per PRD-025.
- **Floor layout design** — FloorLayoutService concern. Tables are created without spatial placement.
- **Staff role assignment beyond admin** — PRD-025 handles staff invites. The setup wizard is admin-only.
- **Per-table game settings overrides** — `gaming_table_settings` exists but is deferred to post-setup.
- **Per-table bank mode override** — Dual-policy doc §4.1 notes bank mode "may be overridden per table." Deferred to post-MVP.
- **Side-bet configuration UI** — PRD-029 deployed the catalog table; admin UI for side bets is post-MVP.
- **Email delivery for invites** — PRD-025 uses "copy link" manual flow.

## 3. Users & Use Cases

- **Primary users:** Casino administrators (the user who completed bootstrap via PRD-025)

**Top Jobs:**

- As a **casino admin**, I need to review and adjust the timezone and gaming day start time that were set during bootstrap, so that my casino's operational clock is correct before creating tables.
- As a **casino admin**, I need to select the table bank mode (Inventory Count vs Fill-to-Par), so that the system knows how to handle table bankroll accounting.
- As a **casino admin**, I need to seed standard game configurations from a template, so that I do not have to manually enter every game variant's decisions/hour, house edge, and seats.
- As a **casino admin**, I need to create my initial gaming tables with labels and game types, so that my pit bosses can open table sessions on day one.
- As a **casino admin**, I need to optionally set par targets per table during setup, so that rundown reports show "need vs actual" from the start.
- As a **casino admin**, I need setup to complete and unlock the dashboard, so that my team can begin operations.

## 4. Scope & Feature List

### Backend

1. **New RPC: `rpc_complete_casino_setup`** — SECURITY DEFINER function that validates minimum readiness (at least one gaming table exists), sets `casino_settings.setup_status = 'ready'` and `setup_completed_at = now()`, returns success. Uses `set_rls_context_from_staff()` for authoritative context (ADR-024). Role allow-list: `admin`, `manager`.
2. **Migration for the completion RPC** — follows naming standard (`YYYYMMDDHHMMSS_prd030_setup_wizard_complete_rpc.sql`).
3. **Server action: `completeSetupAction()`** — wraps `rpc_complete_casino_setup` call via `withServerAction()`.
4. **Server action: `createGamingTableAction()`** — creates a `gaming_table` row with `label`, `type` (game_type enum), `pit` (optional). Par target is set separately in Step 4.
5. **Server action: `updateCasinoSettingsAction()`** — updates `casino_settings` fields (`timezone`, `gaming_day_start_time`, `table_bank_mode`) for the current casino. Scoped by session context.
6. **Server action: `seedGameSettingsAction()`** — wraps `rpc_seed_game_settings_defaults(p_template)` call.
7. **Server action: `updateTableParAction(tableId, parTotalCents)`** — updates `gaming_table.par_total_cents`, `par_updated_at`, `par_updated_by` for a specific table. Used in Step 4 for per-table par entry.

### Frontend

8. **Multi-step wizard component** at `/setup` route — replaces the placeholder.
9. **Step navigation** — linear stepper (Steps 1 through 5), back/next buttons, progress indicator. No step skipping (linear flow).
10. **Step 1: Casino Basics & Bank Mode** — pre-filled form with timezone dropdown, gaming day start time picker, table bank mode radio group with explanatory copy per dual-policy doc §5/§6. Timezone and gaming_day_start pre-filled from bootstrap values. Bank mode defaults to `INVENTORY_COUNT`. Copy distinguishes the two models clearly (see §6 UX).
11. **Step 2: Game Settings Seed** — template picker (e.g., "Small Pit Starter"), "Seed Games" button that calls the seed RPC, success summary showing seeded game names as a checklist.
12. **Step 3: Create Gaming Tables** — dynamic form with add/remove table rows. Each row: label input, game type dropdown (populated from seeded game_settings), optional pit input. Minimum 1 table enforced with validation message. Support for bulk-add pattern (e.g., "Add 5 tables"). Par targets are collected in the next step.
13. **Step 4: Need/Par Target Collection** — dedicated step implementing the bootstrap need collection doc's wizard flow (§Onboarding flow, Steps 3–4). Displays all tables created in Step 3 as editable rows. Each row shows table label, game type, and a "Target Need (Par)" dollar input. Strategy B (manual entry) is the primary path. Strategy C (skip/null) is the fallback — a "Skip Par Setup" option leaves all values null. UI copy follows the bootstrap doc §UI copy: label "Target Need (Par)", tooltip "Operational target bankroll for this table. In Inventory Count mode, this is a target to reduce fill pressure; closing inventory may vary." If bank mode is `IMPREST_TO_PAR`, tooltip adjusts: "Required bankroll level. Table will be restored to this amount at close."
14. **Step 5: Review & Complete** — read-only summary card of all configuration: casino settings (including bank mode), games seeded count, tables created with labels/types, par targets per table (or "Not set"). "Complete Setup" button calls the completion RPC. On success, redirect to `/pit`.
15. **Skip Setup option** — a "Skip Setup" link (visible to admin role) that directly calls the completion RPC without requiring tables or par. Clearly marked as a dev/testing shortcut that results in an empty but navigable dashboard.

### Artifact Mapping (Vision → Scope)

This table traces how each source artifact requirement maps to a scope item:

| Source Requirement | Source Doc | Scope Item |
|-------------------|-----------|------------|
| Choose default bank mode (`INVENTORY_COUNT` / `IMPREST_TO_PAR`) | `need-par-dual-policy.md` §4.1, §9.1 | #10 (Step 1) |
| Bank mode stored on `casino_settings` | ADR-027 | #5 (updateCasinoSettingsAction) |
| Provision table list from template | `INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md` §Onboarding flow Step 2 | #12 (Step 3) |
| Collect need/par targets: Strategy B (manual entry) | `INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md` §Strategy B | #13 (Step 4) |
| Allow null par (Strategy C — skip) | `INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md` §Strategy C | #13 (Step 4, "Skip Par Setup") |
| UI copy: "Target Need (Par)" not "Par = truth" | `INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md` §UI copy | #13 (Step 4, tooltip) |
| Session binds to active need policy at start | `need-par-dual-policy.md` §8.2 | Already deployed — `rpc_open_table_session` snapshots `need_total_cents` |
| Bootstrap rule: do not assume closing = par | `need-par-dual-policy.md` §5.3 | #13 (Step 4, no auto-inference) |
| Seed game settings via template RPC | PRD-029 | #6 (seedGameSettingsAction), #11 (Step 2) |
| Set `setup_status = 'ready'` atomically | GAP doc | #1 (completion RPC), #14 (Step 5) |

## 5. Requirements

### 5.1 Functional Requirements

**FR-1: Casino basics editing.** Step 1 displays the current `casino_settings` values (timezone, gaming_day_start_time) pre-filled from bootstrap. Admin can edit timezone (from a standard IANA timezone list), gaming_day_start_time (time picker), and select `table_bank_mode` from the enum options. Changes are persisted via `updateCasinoSettingsAction` before advancing to Step 2.

**FR-2: Game settings seeding.** Step 2 presents at least the `'small_pit_starter'` template (11 game variants). On "Seed Games", the system calls `rpc_seed_game_settings_defaults('small_pit_starter')`. The RPC is idempotent — re-running inserts 0 rows. After seeding, the step displays the seeded game names. If games are already seeded (e.g., user navigated back), the step shows the existing games and the seed button is disabled or shows "Already seeded".

**FR-3: Gaming table creation.** Step 3 provides a form to create tables. Each table requires: `label` (text, e.g., "BJ-01"), `type` (game_type enum, selected from dropdown populated by seeded game_settings). Optional field: `pit` (text). At least 1 table must be created to proceed (or use Skip). Tables are created via `createGamingTableAction` with the current casino's `casino_id` derived from session context (not user-supplied). Par targets are collected in the next step.

**FR-4: Need/par target collection (Strategy B/C).** Step 4 is a dedicated par collection step implementing the bootstrap need collection doc's wizard flow. All tables created in Step 3 are displayed as editable rows. For each table, the admin can enter a dollar amount for "Target Need (Par)" — stored as `gaming_table.par_total_cents` (cents). This is **Strategy B** (manual entry per table). If the admin leaves a field blank or clicks "Skip Par Setup", par remains `null` — this is **Strategy C** (run without par initially). Both are valid. The UI must:
- Label: "Target Need (Par)" (not just "Par" — per bootstrap doc §UI copy)
- Tooltip (INVENTORY_COUNT): "Operational target bankroll for this table. In Inventory Count mode, this is a target to reduce fill pressure; closing inventory may vary."
- Tooltip (IMPREST_TO_PAR): "Required bankroll level. Table will be restored to this amount at close."
- Never auto-infer par from data — per dual-policy doc §5.3: "Do not assume last closing inventory = par"
- Display "Target need not configured" when null, with CTA "Set target need"

**FR-5: Session binding contract.** After setup completion, when `rpc_open_table_session` is called for any table, it snapshots `casino_settings.table_bank_mode` → `table_session.table_bank_mode` and `gaming_table.par_total_cents` → `table_session.need_total_cents`. This binding is **already deployed** (ADR-027 schema + existing RPC). The wizard's responsibility is to ensure the source values (`table_bank_mode`, `par_total_cents`) are configured so that sessions inherit the right defaults from day one.

**FR-6: Setup completion.** Step 5's "Complete Setup" calls `rpc_complete_casino_setup`. The RPC validates: (a) `casino_id` is derived from context, (b) caller role is `admin` or `manager`, (c) at least one `gaming_table` exists for this casino (unless skip mode). On success, it sets `setup_status = 'ready'` and `setup_completed_at = now()`. The page redirects to `/pit` via `router.push('/start')` (gateway re-evaluates and routes to `/pit`).

**FR-7: Skip setup.** A "Skip Setup" link calls `rpc_complete_casino_setup` with a skip flag that bypasses the gaming table minimum check. This sets `setup_status = 'ready'` without requiring tables, games, or par targets. The skip option is clearly labeled as a testing/development shortcut.

**FR-8: Idempotent re-entry.** If a user navigates away mid-wizard and returns to `/setup`, the wizard detects existing state: if casino_settings fields are already edited, pre-fill them; if games are seeded, show them in Step 2; if tables exist, show them in Step 3; if par targets are set, show them in Step 4. The wizard does not duplicate data on re-entry.

### 5.2 Non-Functional Requirements

**NFR-1:** Setup wizard page loads within 1 second (server-side data fetch for pre-fill).

**NFR-2:** `rpc_complete_casino_setup` completes within 200ms (single UPDATE with validation query).

**NFR-3:** The completion RPC uses `SET LOCAL` for context variables (connection-pooler safe per ADR-015).

**NFR-4:** The completion RPC is `SECURITY DEFINER` with `SET search_path = pg_catalog, public` (per ADR-018).

**NFR-5:** No `console.*` calls in production wizard components.

> Architecture details: see SRM v4.12.0 (CasinoService ownership), ADR-024 (authoritative context), ADR-027 (table bank mode). Schema details: see `types/remote/database.types.ts`.

## 6. UX / Flow Overview

### Setup Wizard Flow (5 Steps)

```
/start → setup_status != 'ready' → /setup

Step 1: Casino Basics & Bank Mode
  ├── Pre-filled: casino_name (display only), timezone, gaming_day_start_time
  ├── Editable: timezone, gaming_day_start_time
  ├── Bank mode selection: INVENTORY_COUNT (default) | IMPREST_TO_PAR
  │     ├── Radio group with explanatory copy (see below)
  │     └── Selection persisted to casino_settings.table_bank_mode
  └── [Next] → persist changes → Step 2

Step 2: Game Settings Seed
  ├── Template picker: "Small Pit Starter" (11 variants)
  ├── [Seed Games] → calls rpc_seed_game_settings_defaults
  ├── Shows: list of seeded game names with types
  └── [Next] → Step 3

Step 3: Create Gaming Tables
  ├── Dynamic form rows:
  │     label (e.g., "BJ-01")
  │     game type (dropdown from seeded games)
  │     pit (optional text)
  ├── [+ Add Table] / [+ Add 5 Tables]
  ├── Minimum 1 table (validation on Next)
  └── [Next] → Step 4

Step 4: Need/Par Target Collection                    ← NEW STEP
  ├── Header: "Set Target Bankroll (Need/Par) per Table"
  ├── Subtext: (INVENTORY_COUNT) "These are operational targets to
  │     reduce fill pressure. Closing inventory may vary."
  ├── Subtext: (IMPREST_TO_PAR) "These are required levels. Tables
  │     will be restored to these amounts at close."
  ├── Table list (from Step 3):
  │     BJ-01   | Blackjack 6-Deck | $ [_____]
  │     BJ-02   | Blackjack 6-Deck | $ [_____]
  │     RLT-01  | Roulette         | $ [_____]
  │     ...
  ├── [Skip Par Setup] → leaves all par values null (Strategy C)
  └── [Next] → persist par values → Step 5

Step 5: Review & Complete
  ├── Summary card:
  │     Casino: timezone, gaming_day_start, bank_mode
  │     Games: N variants seeded
  │     Tables: list with labels, types, par targets (or "Not set")
  ├── [Complete Setup] → calls rpc_complete_casino_setup
  ├── Success → redirect to /start → /pit
  └── Error → display error, retry

[Skip Setup] (any step) → calls rpc_complete_casino_setup(skip) → /pit
```

### Bank Mode Selection (Step 1) — Copy from Dual-Policy Doc

The wizard presents two options with explanatory copy derived from `need-par-dual-policy.md` §5/§6:

- **Inventory Count** (default, recommended): "Count chips at open and close. Par is a target to reduce fill pressure, not a requirement. Closing inventory floats — the system records snapshots as facts. Recommended for most operations."
- **Fill-to-Par (Imprest)**: "Maintain table bank on an imprest basis. Restore table to par at close via a final fill or credit. Deviation from par triggers investigation. Common in highly regulated environments."

The selection determines:
1. The `casino_settings.table_bank_mode` value stored at the casino level
2. The tooltip copy shown in Step 4 (need/par collection)
3. The value snapshotted into every future `table_session.table_bank_mode` at session open

### Need/Par Collection (Step 4) — Strategy B/C from Bootstrap Doc

Per `INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md` §Collection strategies:

| Strategy | This Wizard | Notes |
|----------|:-----------:|-------|
| **A** — Import par sheet (bulk) | Deferred (P2) | Complex; requires file upload + parsing |
| **B** — Manual entry per table | **Implemented** | Dollar input per table row in Step 4 |
| **C** — Skip (null par) | **Implemented** | "Skip Par Setup" leaves all values null |
| **D** — Post go-live suggestion | Deferred (P2) | Requires operational history |

**Key constraint (from dual-policy doc §5.3):** The wizard must **never** auto-populate par from any data source. Par is always an explicit admin input or an explicit skip. "Do not assume last closing inventory = par."

### Integration with Start Gateway

The existing `/start` gateway (PRD-024) already handles the routing:

```
/start
  ├── setup_status != 'ready' → /setup  (this wizard)
  └── setup_status == 'ready' → /pit    (dashboard)
```

After wizard completion, `setup_status = 'ready'` and the gateway routes to `/pit`.

### Post-Wizard Session Binding (Already Deployed)

Once setup is complete and a pit boss opens a table session:

```
rpc_open_table_session(gaming_table_id)
  ├── Reads casino_settings.table_bank_mode → table_session.table_bank_mode
  ├── Reads gaming_table.par_total_cents → table_session.need_total_cents
  └── Session now carries the configured model + par target
       └── RundownSummaryPanel displays par variance (if par is set)
```

This binding is already deployed (ADR-027 + existing RPCs). The wizard ensures the source values exist.

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Impact |
|-----------|--------|--------|
| **PRD-025** (Tenant Bootstrap) | Deployed | Provides `rpc_bootstrap_casino`, staff binding, casino_settings row with `setup_status = 'not_started'` |
| **PRD-029** (Game Settings Schema Evolution) | Deployed | Provides `rpc_seed_game_settings_defaults`, extended `game_type` enum, `game_settings.code` column |
| **PRD-024** (Start Gateway) | Deployed | Provides `/start` gateway decision tree, `setup_status` + `setup_completed_at` columns on `casino_settings` |
| **ADR-027** (Table Bank Mode) | Deployed | Provides `table_bank_mode` enum and column on `casino_settings` |
| **ADR-028** (Table Status Standardization) | Deployed | Provides `table_status` enum, `gaming_table.status` column |
| **TableContextService** | Implemented | Existing service layer for `gaming_table` CRUD (DTOs, schemas, mappers) |

### 7.2 Risks & Open Questions

| Risk | Severity | Mitigation |
|------|----------|------------|
| **User abandons wizard mid-flow** | Low | Wizard state is persisted to DB at each step (casino_settings update, game seed, table creation). Re-entry detects existing state and resumes. No transient client-only state. |
| **Game seed RPC not yet deployed when wizard ships** | Low | PRD-029 is already deployed. If somehow missing, Step 2 shows an error and the user can skip to Step 3 or use Skip Setup. |
| **User creates tables then navigates back and re-seeds** | Low | Seed RPC is idempotent (ON CONFLICT DO NOTHING). No duplicates. |
| **No tables created but setup completed via Skip** | Low | Skip is intentionally allowed for dev/testing. Operational users must create tables. Dashboard gracefully handles empty table list. |
| **`table_bank_mode` column missing on casino_settings** | None | ADR-027 migration is deployed. Column exists with `INVENTORY_COUNT` default. |

### Open Questions

1. **Should the wizard enforce a minimum number of tables?** Recommendation: yes (at least 1), but the Skip option bypasses this for testing.
2. **Should `setup_status` support an `'in_progress'` intermediate state?** Recommendation: no. The current two-state model (`'not_started'` to `'ready'`) is sufficient. Each step persists its own data independently; the final step atomically marks completion.
3. **Should bulk table creation auto-generate labels?** Recommendation: yes, for convenience (e.g., "Add 5 Blackjack tables" generates BJ-01 through BJ-05). Implementation detail for the frontend.

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] New tenant completes setup wizard end-to-end (Steps 1 through 5) and reaches `/pit`
- [ ] Casino basics (timezone, gaming_day_start_time) are editable in Step 1 and persisted to `casino_settings`
- [ ] `table_bank_mode` is selectable in Step 1 with explanatory copy per dual-policy doc §5/§6
- [ ] Game settings are seeded from the `'small_pit_starter'` template in Step 2 via `rpc_seed_game_settings_defaults`
- [ ] At least one gaming table can be created in Step 3 with label, game type, and optional pit
- [ ] Step 4 displays all created tables and allows per-table par entry (Strategy B) or skip (Strategy C)
- [ ] Par targets stored correctly: dollar input → `gaming_table.par_total_cents` (cents), null is valid
- [ ] `rpc_complete_casino_setup` atomically sets `setup_status = 'ready'` and stamps `setup_completed_at`
- [ ] Skip Setup option works for dev/testing (sets `setup_status = 'ready'` without table/par minimum)
- [ ] Wizard re-entry is idempotent (returning to `/setup` mid-flow does not duplicate data)

**Data & Integrity**
- [ ] `setup_status` transitions `'not_started'` to `'ready'` atomically (single UPDATE in the completion RPC)
- [ ] Gaming tables created with correct `casino_id` scoping (derived from session context, not user-supplied)
- [ ] Game settings seeded idempotently (re-running seed inserts 0 rows)
- [ ] `table_bank_mode` selection persisted to `casino_settings.table_bank_mode`
- [ ] Par values stored on `gaming_table.par_total_cents` with `par_updated_at` and `par_updated_by` stamped
- [ ] Session binding verified: opening a table session after setup snapshots `table_bank_mode` and `need_total_cents` correctly

**Security & Access**
- [ ] `rpc_complete_casino_setup` is SECURITY DEFINER with `SET search_path = pg_catalog, public`
- [ ] Completion RPC uses `set_rls_context_from_staff()` for authoritative context (ADR-024)
- [ ] Completion RPC enforces role allow-list (`admin`, `manager`)
- [ ] Table creation uses casino_id from session context, never from user input (INV-8 compliant)
- [ ] Gaming tables created with RLS-compatible `casino_id` scoping

**Testing**
- [ ] Integration test: completion RPC sets `setup_status = 'ready'` and stamps `setup_completed_at`
- [ ] Integration test: completion RPC rejects non-admin/manager roles
- [ ] E2E test: bootstrap then setup wizard then dashboard reachable
- [ ] Unit test: wizard step components render with pre-filled data

**Operational Readiness**
- [ ] TypeScript types regenerated (`npm run db:types`) after completion RPC migration
- [ ] `npm run type-check`, `npm run lint`, `npm run test` pass
- [ ] No `console.*` calls in production wizard components

**Documentation**
- [ ] Known limitations documented (no post-setup editing, no par import, no floor layout)
- [ ] SRM unchanged (CasinoService already owns all affected tables)

## 9. Related Documents

### Source Artifacts (drive wizard design)

| Document | Role | Sections Used |
|----------|------|---------------|
| `docs/00-vision/table-context-read-model/need-par-dual-policy.md` | **Dual policy model** — defines INVENTORY_COUNT vs IMPREST_TO_PAR, bootstrap mechanics, session binding contract | §4 (enum), §5 (Inventory Count), §6 (Imprest), §8.2 (session binding), §9 (bootstrap wizard) |
| `docs/00-vision/table-context-read-model/INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md` | **Need/par collection strategies** — A (import), B (manual), C (skip), D (suggested). Defines wizard flow, UI copy, DoD | §3 (strategies A–D), §Onboarding flow (Steps 1–5), §UI copy, §DoD |
| `docs/issues/gaps/table-inventory-lifecycle/GAP-TABLE-INVENTORY-LIFECYCLE.md` | **Table lifecycle gap map** — P0 blocker identification, priority map, onboarding dependency | §2 Phase 0 (pre-shift setup), §3 (onboarding dependency), §4 (priority map) |
| `docs/issues/gaps/GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md` | **Config taxonomy** — entity-by-entity mapping of what the wizard configures | §4 (config entities), §5 (minimum viable wizard) |

### Upstream PRDs (deployed dependencies)

| Document | Purpose |
|----------|---------|
| `docs/10-prd/PRD-025-onboarding-bootstrap-invites-v0.md` | Parent PRD — tenant bootstrap (Wizard A). Defines Wizard B as separate PRD. |
| `docs/10-prd/PRD-029-game-settings-schema-evolution-v0.md` | Game settings schema + seed RPC dependency |
| `docs/10-prd/PRD-024-landing-page-start-gateway-v0.md` | Start Gateway, `setup_status` migration, routing infrastructure |

### Downstream PRDs (unblocked by this PRD)

| Document | Purpose |
|----------|---------|
| `docs/10-prd/PRD-031-table-inventory-ops-ui-v0.md` | Table Inventory Operational UI — fills, credits, drops, par editing, rundown persistence. Requires setup wizard to create tables and configure bank mode. |

### Architecture & Governance

| Document | Purpose |
|----------|---------|
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | SRM v4.12.0 — CasinoService owns `casino_settings`, `game_settings`; TableContextService owns `gaming_table` |
| `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` | Complexity guardrail — flat `par_total_cents` column is acceptable MVP shortcut |
| `docs/80-adrs/ADR-027-table-bank-mode-dual-policy.md` | Table bank mode enum, `par_total_cents` column, session binding schema |
| `docs/80-adrs/ADR-028-table-status-standardization.md` | Table availability vs session phase |
| `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context derivation for RPCs |
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` | SET LOCAL pooler-safe pattern |
| `docs/80-adrs/ADR-018-security-definer-governance.md` | SECURITY DEFINER function governance |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS policy patterns |
| `docs/30-security/SEC-002-casino-scoped-security-model.md` | Casino-scoped multi-tenancy model |

---

## Appendix A: Implementation Sequence

> **For `prd-pipeline` consumption.** Maps scope items to ordered PRs with dependency chain.

### Deployed Artifact Inventory (Prerequisites)

These artifacts are **already deployed** and form the foundation this PRD builds on:

| Artifact | Source | What It Provides |
|----------|--------|-----------------|
| `casino_settings.setup_status` enum + `setup_completed_at` | PRD-024 migration | Wizard completion target |
| `casino_settings.table_bank_mode` column (default: `INVENTORY_COUNT`) | ADR-027 migration | Bank mode storage |
| `gaming_table.par_total_cents` + `par_updated_at` + `par_updated_by` | ADR-027 migration | Per-table par storage |
| `table_session.table_bank_mode` + `table_session.need_total_cents` | ADR-027 migration | Session binding snapshot |
| `rpc_open_table_session` (snapshots bank mode + par into session) | Table session RPCs | Session binding logic |
| `rpc_seed_game_settings_defaults(template)` | PRD-029 migration | Game seeding |
| `rpc_bootstrap_casino()` (creates tenant with `setup_status='not_started'`) | PRD-025 migration | Wizard entry condition |
| `game_type` enum (extended with `pai_gow`, `carnival`) | PRD-029 migration | Game type dropdown options |
| `game_settings.code` column with unique constraint | PRD-029 migration | Idempotent seeding |
| `/start` gateway decision tree | PRD-024 frontend | Routing to `/setup` when not ready |

**All schema and RPC dependencies are deployed.** This PRD adds: 1 new RPC, 5 server actions, 1 multi-step wizard UI.

### Phase 1 — Backend: Completion RPC (PR-1)

**Scope items:** #1, #2
- Migration: `rpc_complete_casino_setup` (SECURITY DEFINER, `set_rls_context_from_staff()`, role allow-list, validates minimum readiness, sets `setup_status = 'ready'` + `setup_completed_at = now()`)
- Includes skip flag parameter for bypassing table minimum check
- Run `npm run db:types`
- **Depends on:** nothing (all schema dependencies deployed)

### Phase 2 — Backend: Server Actions (PR-2)

**Scope items:** #3, #4, #5, #6, #7
- `completeSetupAction()` — wraps `rpc_complete_casino_setup`
- `createGamingTableAction()` — creates `gaming_table` row with session-derived `casino_id`
- `updateCasinoSettingsAction()` — updates timezone, gaming_day_start_time, table_bank_mode
- `seedGameSettingsAction()` — wraps `rpc_seed_game_settings_defaults`
- `updateTableParAction(tableId, parTotalCents)` — updates `gaming_table.par_total_cents` + timestamps
- **Depends on:** PR-1 (completion RPC exists)

### Phase 3 — Frontend: Setup Wizard UI (PR-3)

**Scope items:** #8 through #15
- Multi-step wizard component replacing `/setup` placeholder
- Step 1: Casino Basics & Bank Mode (timezone, time, bank mode with dual-policy copy)
- Step 2: Game Settings Seed (template picker, seed button, summary)
- Step 3: Create Gaming Tables (dynamic form, labels, types, pits)
- Step 4: Need/Par Target Collection (per-table par entry, Strategy B/C, copy from bootstrap doc)
- Step 5: Review & Complete (summary, completion, redirect)
- Skip Setup link
- **Depends on:** PR-2 (server actions exist)

### Phase 4 — Testing (PR-4)

**Scope items:** DoD testing bullets
- Integration tests for `rpc_complete_casino_setup` (success, role rejection, idempotency)
- Integration test: par values persisted correctly with `par_updated_at`/`par_updated_by`
- Integration test: session binding snapshots bank mode + par after setup
- E2E test: full bootstrap → setup wizard (all 5 steps) → dashboard reachable
- E2E test: session opened on newly created table has correct `table_bank_mode` and `need_total_cents`
- Unit tests for wizard step components (including Step 4 par collection with skip)
- **Depends on:** PR-3 (wizard exists)

### Cross-PRD Implementation Sequence

```
DEPLOYED FOUNDATION
═══════════════════
PRD-025 (bootstrap)          → rpc_bootstrap_casino, setup_status column
PRD-029 (game settings)      → rpc_seed_game_settings_defaults, extended enum
PRD-024 (start gateway)      → /start routing, setup_status check
ADR-027 (bank mode schema)   → table_bank_mode, par_total_cents, session binding
                                      │
                                      ▼
PRD-030 IMPLEMENTATION (this PRD)
═══════════════════════════════════
PR-1: Completion RPC ─────────────── rpc_complete_casino_setup
         │
         ▼
PR-2: Server Actions ─────────────── 5 actions (settings, tables, par, seed, complete)
         │
         ▼
PR-3: Wizard UI (5 steps) ───────── Step 1: Bank mode (need-par-dual-policy §4-§6)
         │                           Step 2: Game seeding (PRD-029)
         │                           Step 3: Table creation
         │                           Step 4: Need/par collection (bootstrap doc §B/C)
         │                           Step 5: Review & complete
         ▼
PR-4: Tests ──────────────────────── Integration + E2E + unit
         │
         ▼
UNBLOCKED DOWNSTREAM
═══════════════════
PRD-031 (Inventory Ops UI)   → Fill/Credit UI, Drop posting, Par editing, Rundown persistence
   │
   └── Session binding now works end-to-end:
       casino_settings.table_bank_mode → table_session.table_bank_mode
       gaming_table.par_total_cents    → table_session.need_total_cents
       RundownSummaryPanel displays par variance from configured targets
```

### Need/Par Model: MVP vs Full Vision

| Concern | MVP (This PRD) | Full Vision (P2) |
|---------|:-------------:|:----------------:|
| Bank mode storage | `casino_settings.table_bank_mode` (flat column) | Same + per-table override |
| Par storage | `gaming_table.par_total_cents` (flat column) | `table_par_policy` append-only table with effective dates |
| Provenance | `par_updated_at`, `par_updated_by` only | `source` enum, `approved_by`, `approved_at`, `effective_from_gaming_day`, `notes` |
| Collection strategy | B (manual) + C (skip) | A (import) + B + C + D (system-suggested) |
| Session binding | Snapshot at open (deployed) | Same |
| Par history | Overwrite in place | Append-only timeline, never overwrite |
| Audit trail | Timestamp + actor only | Full provenance with effective dates |

This is an acceptable MVP shortcut per ADR-027 and the Over-Engineering Guardrail. The flat-column approach is sufficient for single-casino pilot. Upgrade path to `table_par_policy` is clean: add the table, backfill from `gaming_table.par_total_cents`, point session binding at the new table.

---

## Appendix B: Completion RPC Specification

```sql
-- rpc_complete_casino_setup(p_skip boolean DEFAULT false)
--
-- SECURITY DEFINER, SET search_path = pg_catalog, public
--
-- 1. Call set_rls_context_from_staff() — derives casino_id, actor_id, staff_role
-- 2. Validate role IN ('admin', 'manager')
-- 3. If NOT p_skip: validate at least 1 gaming_table exists for casino_id
-- 4. UPDATE casino_settings
--      SET setup_status = 'ready',
--          setup_completed_at = now()
--    WHERE casino_id = v_casino_id
--      AND setup_status = 'not_started'
-- 5. If no row updated: return error (already completed or not found)
-- 6. Return { casino_id, setup_status, setup_completed_at }
```

This RPC is intentionally minimal (single UPDATE with guard query) per the Over-Engineering Guardrail. No event bus, no intermediate states, no multi-step transaction beyond the validation query and update.

---

## Appendix C: Config Taxonomy Reference

The full config taxonomy is documented in GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY Section 4. Below summarizes what this wizard configures vs defers, with source artifact traceability.

| Entity | Step | Configured | Source Artifact | Deferred |
|--------|:----:|:----------:|:---------------:|:--------:|
| `casino_settings.timezone` | 1 | Edit | GAP-WIZARD | — |
| `casino_settings.gaming_day_start_time` | 1 | Edit | GAP-WIZARD | — |
| `casino_settings.table_bank_mode` | 1 | Select | `need-par-dual-policy` §4.1, §9.1 | — |
| `casino_settings.watchlist_floor` | — | — | — | Post-setup settings |
| `casino_settings.ctr_threshold` | — | — | — | Post-setup settings |
| `casino_settings.alert_thresholds` | — | — | — | Post-setup settings |
| `casino_settings.promo_*` | — | — | — | Post-setup settings |
| `game_settings` (11 variants) | 2 | Seed from template | PRD-029 | Custom game creation |
| `game_settings_side_bet` | — | — | PRD-029 | Post-setup catalog only |
| `gaming_table.label` | 3 | Create | GAP-LIFECYCLE §3 | — |
| `gaming_table.type` | 3 | Create | GAP-LIFECYCLE §3 | — |
| `gaming_table.pit` | 3 | Optional | GAP-LIFECYCLE §3 | — |
| `gaming_table.par_total_cents` | **4** | **Strategy B** (manual) / **C** (skip) | `INVENTORY_COUNT_BOOTSTRAP` §B/C | Strategy A (import), Strategy D (recommended) |
| `gaming_table.par_updated_at` | 4 | Stamped on par write | ADR-027 | — |
| `gaming_table.par_updated_by` | 4 | Stamped on par write | ADR-027 | — |
| `table_par_policy` (append-only) | — | — | `need-par-dual-policy` §8.1 | P2 — full provenance table |
| `gaming_table_settings` | — | — | — | Post-setup overrides |
| `floor_layout` / `floor_table_slot` | — | — | — | FloorLayoutService |
| `setup_status` | 5 | Set to `'ready'` | GAP-WIZARD | — |
| `setup_completed_at` | 5 | Stamped | GAP-WIZARD | — |

### Session Binding After Setup (No Wizard Work Required)

| Binding | Source → Target | When | Status |
|---------|:---------------:|:----:|:------:|
| Bank mode | `casino_settings.table_bank_mode` → `table_session.table_bank_mode` | Session open | **Deployed** (ADR-027) |
| Need/par | `gaming_table.par_total_cents` → `table_session.need_total_cents` | Session open | **Deployed** (ADR-027) |

The wizard ensures the source values exist. The binding happens automatically in `rpc_open_table_session`.

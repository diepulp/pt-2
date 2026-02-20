# GAP-TABLE-INVENTORY-LIFECYCLE

**Created:** 2026-02-11
**Status:** Open
**Severity:** P0–P2 (layered — see priority map)
**Related PRDs:** PRD-007 (TableContext Service), PRD-025 (Onboarding), PRD-029 (Game Settings)
**Bounded Context:** TableContext (operational), CasinoService (onboarding dependency)
**Default Bank Mode:** INVENTORY_COUNT

---

## Summary

The table inventory lifecycle — open table, manage fills/credits, drop, close, compute rundown — is the core operational loop for pit management. The backend plumbing (schema, RPCs, service layer, hooks) is substantially complete. The gaps are primarily in **frontend UI**, **onboarding entry point**, and **operational depth features** (exceptions, finalization, par history).

This analysis maps the vision documents against current implementation and provides a prioritized gap inventory.

---

## Source Documents

| Document | Role |
|----------|------|
| `docs/00-vision/table-context-read-model/table-inventory-rundown-lifecycle.md` | 7-phase lifecycle vision (Phases 0–7) |
| `docs/00-vision/table-context-read-model/need-par-dual-policy.md` | Dual policy: INVENTORY_COUNT vs IMPREST_TO_PAR |
| `docs/00-vision/table-context-read-model/INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md` | Need/par collection strategies for onboarding |
| `docs/00-vision/table-context-read-model/PRD_TABLE_SESSION_LIFECYCLE_MVP_SLICE_v0.1.0.md` | Session state machine PRD |
| `docs/00-vision/table-context-read-model/GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md` | Telemetry pipeline gaps (orthogonal) |
| `docs/80-adrs/ADR-027-table-bank-mode-dual-policy.md` | Table bank mode schema decision |
| `docs/80-adrs/ADR-028-table-status-standardization.md` | Table availability vs session phase |
| `docs/issues/gaps/GAP-ONBOARDING-SETUP-WIZARD-CONFIG-TAXONOMY.md` | Setup wizard P0 blocker |

---

## 1. Current Implementation State

### Implemented (Backend Complete)

| Layer | Artifact | Migration/File |
|-------|----------|----------------|
| **Schema** | `table_session` (OPEN→ACTIVE→RUNDOWN→CLOSED) | `20260115025236_table_session_lifecycle.sql` |
| **Schema** | `table_inventory_snapshot` (open/close/rundown chip counts) | `20251108195341_table_context_chip_custody.sql` |
| **Schema** | `table_fill`, `table_credit` (idempotent, immutable) | Same migration |
| **Schema** | `table_drop_event` (custody chain) | Same migration |
| **Schema** | `table_bank_mode` enum on `casino_settings` + `table_session` | `20260117153430_adr027_table_bank_mode_schema.sql` |
| **Schema** | `par_total_cents` on `gaming_table` | Same migration |
| **RPCs** | `rpc_open_table_session` (with availability gate per ADR-028) | `20260115025237_table_session_rpcs.sql` |
| **RPCs** | `rpc_start_table_rundown`, `rpc_close_table_session` | Same migration |
| **RPCs** | `rpc_compute_table_rundown` (formula: closing + credits + drop − opening − fills) | `20260117153727_adr027_rpc_rundown.sql` |
| **RPCs** | `rpc_post_table_drop_total` | Same migration |
| **RPCs** | `rpc_log_table_inventory_snapshot`, `rpc_request_table_fill`, `rpc_request_table_credit`, `rpc_log_table_drop` | `20251108195341_table_context_chip_custody.sql` |
| **Service** | `services/table-context/` — session lifecycle, chip custody, rundown, mappers, DTOs, schemas, keys | 16 files |
| **Hooks** | `useOpenTableSession`, `useStartTableRundown`, `useCloseTableSession`, `useTableRundown`, `usePostDropTotal`, `useLogInventorySnapshot` | `hooks/table-context/` (7 files) |
| **UI** | `RundownSummaryPanel` (formula display, win/loss, count posted/pending badge) | `components/table/rundown-summary-panel.tsx` |
| **UI** | `ChipCountCaptureDialog` (denomination entry modal) | `components/table/chip-count-capture-dialog.tsx` |
| **UI** | `InventoryPanel` (chip counts tab, drop events tab, fill tab placeholder) | `components/pit-panels/inventory-panel.tsx` |

### Key Design Facts

- **State machine**: 4 states (OPEN → ACTIVE → RUNDOWN → CLOSED) — intentional simplification of the 10-state vision
- **Unique active session**: Partial unique index on `(casino_id, gaming_table_id) WHERE status IN ('OPEN','ACTIVE','RUNDOWN')`
- **Rundown formula**: `table_win = closing_bankroll + credits + drop − opening_bankroll − fills`
- **Win returns NULL** when `drop_posted_at IS NULL` (correct behavior — pending count)
- **Idempotency**: Fill/credit via unique constraint on `(casino_id, request_id)`
- **RLS**: All tables casino-scoped; all RPCs use `set_rls_context_from_staff()` (ADR-024)
- **Gaming day**: Trigger-computed via `casino_settings.gaming_day_start_time`

---

## 2. Gap Map by Lifecycle Phase

### Phase 0 — Pre-shift Setup

| Requirement (Vision) | Current State | Gap | Severity |
|----------------------|---------------|-----|----------|
| Table assigned, game settings active | Game settings seeding RPC deployed (PRD-029) | **No setup wizard UI** to invoke seeding or create tables | **P0** |
| Drop box installed | Operational procedure — out of software scope | — | — |
| Need/par target configured per table | `par_total_cents` column on `gaming_table` exists | **No UI to set par** during onboarding or operations | **P1** |
| `table_bank_mode` selected for casino | Column exists on `casino_settings`, defaults to `INVENTORY_COUNT` | **Not configurable in any UI** | **P1** |

### Phase 1 — Open Table (Opening Bankroll Snapshot)

| Requirement (Vision) | Current State | Gap | Severity |
|----------------------|---------------|-----|----------|
| Create session (opened_at, opened_by, table/shift/gaming_day) | `rpc_open_table_session` with availability gate | None | — |
| Count opening bankroll (denom breakdown + total) | `ChipCountCaptureDialog` + `rpc_log_table_inventory_snapshot` | None | — |
| Set need/par from active policy | Session snapshots `need_total_cents` from `gaming_table.par_total_cents` | **Low** — works but advisory only; no append-only policy history | P2 |
| Verify opening snapshot (dealer + supervisor) | Snapshot is single-actor | **No verification workflow** | P2 |

### Phase 2 — Live Play (Fills/Credits)

| Requirement (Vision) | Current State | Gap | Severity |
|----------------------|---------------|-----|----------|
| Fill workflow (request → issue → verify → deposit) | `rpc_request_table_fill` — single-write, no status progression | **No multi-actor status workflow** | P2 |
| Credit workflow (request → pickup → verify → deposit) | Same — single-write only | Same | P2 |
| No cross-fills validation | Not implemented | No enforcement | P2 |
| **UI for requesting fills/credits** | `FillSlipsDisplay` shows "coming soon" placeholder | **Missing — needed for operations** | **P1** |
| Buy-ins (optional telemetry) | `table_buyin_telemetry` exists; bridge trigger not yet deployed | Orthogonal to rundown (buy-ins are not in the formula) | Separate gap (GAP-TBL-RUNDOWN) |

### Phase 3 — Drop (Box Removal)

| Requirement (Vision) | Current State | Gap | Severity |
|----------------------|---------------|-----|----------|
| Schedule drop | No `DROP_SCHEDULED` state; session goes ACTIVE→RUNDOWN | Acceptable simplification | P2 |
| Record drop event (box_id, removed_by, custody chain) | `rpc_log_table_drop` + `table_drop_event` | None | — |
| Link drop event to session | `table_session.drop_event_id` FK exists | None | — |

### Phase 4 — Soft Count + Reconciliation

| Requirement (Vision) | Current State | Gap | Severity |
|----------------------|---------------|-----|----------|
| Ingest soft count results (drop_total + evidence manifest) | Drop total posted via `rpc_post_table_drop_total` | **No `soft_count_table_result` table** — no evidence manifest tracking | **P1** (functional workaround exists) |
| Reconcile slips vs count room evidence | Not implemented | **No reconciliation logic** | P2 |
| Exception creation for variances | Not implemented | **No `reconciliation_exception` table** | P2 |

### Phase 5 — Close Table (Closing Bankroll Snapshot)

| Requirement (Vision) | Current State | Gap | Severity |
|----------------------|---------------|-----|----------|
| Count closing bankroll | `ChipCountCaptureDialog` with type='close' | None | — |
| Option A (record closing) vs Option B (final fill to par) | Both work — no enforcement for imprest restore | None (correct for INVENTORY_COUNT default) | — |
| State transition RUNDOWN→CLOSED | `rpc_close_table_session` | None | — |
| Close requires drop OR closing snapshot | RPC validates at least one artifact present | None | — |

### Phase 6 — Compute Rundown

| Requirement (Vision) | Current State | Gap | Severity |
|----------------------|---------------|-----|----------|
| Formula: `win = closing + credits + drop − opening − fills` | `rpc_compute_table_rundown` | None | — |
| Returns NULL win when drop not posted | Correct behavior implemented | None | — |
| **Persist `table_rundown_report`** | Computed on-the-fly only — not stored | **No persistence for audit/reporting** | **P1** |
| Shift-level aggregation | Per-table only | **No shift rollup** | P2 |
| Finalization workflow | Not implemented | **No RECONCILED→FINALIZED states** | P2 |

### Phase 7 — Exceptions & Investigations

| Requirement (Vision) | Current State | Gap | Severity |
|----------------------|---------------|-----|----------|
| Missing slip detection | Not implemented | No automated detection | P2 |
| Slip amount mismatch | Not implemented | No validation | P2 |
| Count variance beyond tolerance | Not implemented | No tolerance engine | P2 |
| Exception workflow (create → resolve) | Not implemented | No `reconciliation_exception` table | P2 |
| Finalization gate (no open exceptions → FINALIZED) | Not implemented | No gate logic | P2 |

---

## 3. Onboarding Dependency (Tangential, Blocking)

The Setup Wizard (`/setup`) is a **P0 blocker** for any table inventory workflow because new tenants cannot reach the operational dashboard.

### Current Flow (Broken)

```
User signs up → /start → no staff → /bootstrap → creates tenant
                                                       ↓
                                        casino_settings.setup_status = 'not_started'
                                                       ↓
                                   /start → setup_status != 'ready' → /setup
                                                       ↓
                                        DEAD END: "Coming soon" placeholder
```

### What Setup Wizard Must Deliver for Table Inventory

| Step | Purpose | Backend Exists | UI Exists |
|------|---------|:-:|:-:|
| 1 | Review casino basics (timezone, gaming_day_start) | Yes (bootstrap pre-fills) | No edit UI |
| 2 | Select `table_bank_mode` (default: INVENTORY_COUNT) | Yes (column + default) | No selection UI |
| 3 | Seed game settings via template | Yes (`rpc_seed_game_settings_defaults`) | No invocation UI |
| 4 | Create gaming tables | Yes (schema ready) | No creation UI |
| 5 | Collect need/par targets per table | Yes (`par_total_cents` column) | No collection UI |
| 6 | Set `setup_status = 'ready'` | Column exists | No completion RPC |

### Need/Par Collection Strategies (from `INVENTORY_COUNT_BOOTSTRAP_NEED_COLLECTION.md`)

| Strategy | Description | MVP Recommendation |
|----------|-------------|-------------------|
| **A** — Import par sheet (bulk) | Upload/paste table list with par values | P2 (complex) |
| **B** — Manual entry per table | Operator enters par per table during setup | **MVP target** |
| **C** — Skip (null par) | Leave par unset; rundown still works | **MVP fallback** |
| **D** — Post go-live suggested par | System recommends after data collection | P2 (requires history) |

**Key constraint (Inventory Count model):** Do NOT assume closing inventory equals par. Closing inventory floats; par is a managerial target.

---

## 4. Consolidated Priority Map

### P0 — Must Exist for Any Table Operation

| # | Gap | Owner | Notes |
|---|-----|-------|-------|
| 1 | **Setup Wizard UI** (Steps 1–4 + completion) | CasinoService / Frontend | Unblocks all downstream work |
| 2 | **`setup_status` completion RPC** (`'not_started'` → `'ready'`) | CasinoService | Single RPC + server action |

### P1 — Must Exist for Operational Table Inventory Lifecycle

| # | Gap | Depends On | Owner |
|---|-----|-----------|-------|
| 3 | **Fill/Credit request UI** (replace "coming soon" placeholder in InventoryPanel) | — | TableContext / Frontend |
| 4 | **Need/par collection UI** (manual entry per table — Strategy B/C) | Setup Wizard or post-setup settings | TableContext / Frontend |
| 5 | **Drop total posting UI** (enter soft count result into session) | — | TableContext / Frontend |
| 6 | **Par configuration UI** (post-setup editing of `gaming_table.par_total_cents`) | — | TableContext / Frontend |
| 7 | **Rundown report persistence** (store computed results in `table_rundown_report`) | — | TableContext |

### P2 — Operational Depth (Post-MVP)

| # | Gap | Notes |
|---|-----|-------|
| 8 | Multi-actor fill/credit workflow (status progression: REQUESTED → ISSUED → VERIFIED → DEPOSITED) | Current single-write is acceptable for MVP |
| 9 | `table_par_policy` append-only history table (replaces flat `par_total_cents` column) | Needed for audit trail before compliance-grade deployment |
| 10 | `soft_count_table_result` table (evidence manifest tracking) | Currently using direct drop_total posting as workaround |
| 11 | `reconciliation_exception` table + variance detection triggers | No automated exception framework |
| 12 | Finalization workflow (RECONCILED → FINALIZED states + gate: no open exceptions) | Missing states from 10-state vision |
| 13 | Shift-level rundown aggregation (`shift_rundown_summary`) | Per-table only today |
| 14 | Verification workflow for opening/closing snapshots (dual-actor sign-off) | Single-actor in MVP |
| 15 | Par import from sheet (Strategy A — bulk upload) | Complex; defer to post-MVP |
| 16 | Dynamic par recommendation engine (Section 10 of dual-policy doc) | Requires operational history |
| 17 | DROP_SCHEDULED / DROPPED intermediate states | Collapsed into RUNDOWN for MVP |

---

## 5. Architecture Observations

### State Machine Simplification is Sound

The 4-state model (OPEN → ACTIVE → RUNDOWN → CLOSED) correctly collapses the 10-state vision (`READY_TO_OPEN` through `FINALIZED`) for MVP. The missing states map cleanly to P2 features:

| Vision State | MVP Mapping |
|-------------|-------------|
| `READY_TO_OPEN` | Implicit (table is active, no session) |
| `OPENING` | `OPEN` |
| `OPEN` | `ACTIVE` |
| `DROP_SCHEDULED` | Collapsed into `RUNDOWN` |
| `DROPPED` | Collapsed into `RUNDOWN` |
| `COUNTED` | Collapsed into `RUNDOWN` (drop_posted_at tracks count status) |
| `CLOSING` | `RUNDOWN` |
| `CLOSED` | `CLOSED` |
| `RECONCILED` | P2 — not in MVP |
| `FINALIZED` | P2 — not in MVP |

### INVENTORY_COUNT as Default is Correct

Per dual-policy doc Section 5: this model doesn't require restoring to par at close. The system records snapshots as facts and computes rundown from them. `need_total` is advisory. This is the simpler onboarding story and the right default for pilot.

### Par Storage is an Acceptable MVP Shortcut

Storing par on `gaming_table.par_total_cents` (flat column) vs the full `table_par_policy` append-only history table is a deliberate simplification:

- **Trade-off**: No audit trail for par changes, no effective-date semantics
- **Acceptable for**: Pilot with single-casino deployment
- **Must upgrade before**: Compliance-grade multi-casino deployment

### Rundown Computation is Correct but Ephemeral

`rpc_compute_table_rundown` returns the right number but doesn't persist it. For audit and reporting, the computed result should be written to a `table_rundown_report` row at session finalization.

### Buy-in Telemetry is Orthogonal

The rundown formula uses `opening + closing + fills + credits + drop` — **not** buy-in telemetry. The telemetry pipeline (GAP-TBL-RUNDOWN v0.4.0) feeds the shift dashboard, not the rundown. These are independent work streams.

---

## 6. Recommended Implementation Sequence

```
[P0] Setup Wizard (unblocks everything)
  ├── Step 1–2: Casino basics + table_bank_mode selection
  ├── Step 3: Invoke game settings seed RPC
  ├── Step 4: Create gaming tables (with optional par_total_cents — Strategy B/C)
  └── Step 5: Complete setup (set setup_status='ready')
       │
       ▼
[P1] Table Inventory Operational UI
  ├── Fill/Credit request UI (replace InventoryPanel placeholder)
  ├── Drop total posting UI (enter soft count result)
  ├── Par configuration UI (post-setup editing)
  └── Rundown report persistence (store computed results)
       │
       ▼
[P2] Operational Depth
  ├── Multi-actor fill/credit workflows
  ├── table_par_policy history table
  ├── soft_count_table_result (evidence manifest)
  ├── reconciliation_exception framework
  ├── Finalization + shift aggregation
  └── Dynamic par recommendations
```

The critical path is: **Setup Wizard → Table Creation with Par → Operational UI for Fills/Credits/Drop**. The backend plumbing for the inventory lifecycle is substantially done; the gap is primarily frontend and the onboarding entry point.

---

## 7. Open Questions

1. Should `setup_status` transition support intermediate states (`'in_progress'`) or go directly `'not_started'` → `'ready'`?
2. Should the setup wizard enforce minimum table creation (at least 1 table) or allow empty pit?
3. Should `par_total_cents` support denomination breakdown targets (not just total) in MVP?
4. Should `effective_from_gaming_day` semantics be added to `gaming_table.par_total_cents` even in the flat-column MVP (as a second column)?
5. What privileges allow par import without per-row approval during onboarding?


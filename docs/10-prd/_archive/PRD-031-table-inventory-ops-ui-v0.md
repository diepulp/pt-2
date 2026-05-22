---
prd_id: PRD-031
title: "Table Inventory Operational UI — Fills, Credits, Drops & Rundown Persistence"
version: "0.1.0"
status: draft
owner: TableContextService
created: 2026-02-11
last_updated: 2026-02-11
sdlc_categories: [UI, SERVICE, DATA, API]
bounded_contexts: [TableContextService]
depends_on: [PRD-007, ADR-027, ADR-028]
blocks: []
severity: P1
---

# PRD-031 — Table Inventory Operational UI

## 1. Overview

- **Owner:** TableContextService (bounded context)
- **Status:** Draft v0.1.0
- **Summary:** The backend for table inventory operations is fully implemented — RPCs, service layer, hooks, and schemas are deployed. But the frontend has critical gaps that prevent pit bosses from executing the daily table inventory cycle. Fill/credit requests show a "coming soon" placeholder, there is no UI to post drop totals after soft count, no way to edit par targets post-setup, and the rundown computation is ephemeral (not persisted for audit or reporting). This PRD delivers the P1 operational UI and one new persistence table (`table_rundown_report`) so that the complete cycle — open table, manage fills/credits, record drop, post soft count, compute rundown, close table — works end-to-end in the product.

## 2. Problem & Goals

### 2.1 Problem

PT-2's table inventory lifecycle is the core operational loop for pit management. The backend plumbing is substantially complete (see GAP-TABLE-INVENTORY-LIFECYCLE consolidated gap analysis), but operational users cannot complete the daily cycle because:

1. **Fill/Credit request UI is a placeholder.** `InventoryPanel` (`components/pit-panels/inventory-panel.tsx`) renders `EMPTY_FILL_SLIPS = []` and displays "Fill/credit workflows coming soon" in the Fill Slips tab. The RPCs `rpc_request_table_fill` and `rpc_request_table_credit` are deployed and the service functions `requestTableFill` / `requestTableCredit` exist in `services/table-context/chip-custody.ts`, but there is no form to invoke them.

2. **No UI to post drop totals.** The `rpc_post_table_drop_total` RPC is deployed and the `usePostDropTotal` hook exists in `hooks/table-context/use-table-rundown.ts`, but there is no dialog or form to enter the soft count result. The `RundownSummaryPanel` shows "Count Pending" / "Count Posted" badges but has no action button.

3. **No UI to edit par targets.** `gaming_table.par_total_cents` exists per ADR-027 and `RundownSummaryPanel` displays par target and variance, but there is no way to change par after initial setup.

4. **Rundown computation is ephemeral.** `rpc_compute_table_rundown` computes on-the-fly but does not persist results. There is no `table_rundown_report` table. Closed sessions lose their computed rundown unless the RPC is re-called, and there is no audit-grade snapshot of the final numbers.

Without these pieces, the daily cycle is broken at multiple points and pit bosses must fall back to paper processes for fills, credits, drop posting, and rundown archival.

### 2.2 Goals

1. **Pit boss can request a table fill** with denomination breakdown, creating an immutable `table_fill` record via the existing RPC.
2. **Pit boss can request a table credit** with denomination breakdown, creating an immutable `table_credit` record via the existing RPC.
3. **Fill/Credit list shows real data** in InventoryPanel — the "coming soon" placeholder is replaced with live query results.
4. **Pit boss can post a drop total** when a session is in RUNDOWN state, making the win/loss figure visible in the rundown panel.
5. **Par target can be edited per table**, with the new value reflected in the next session's rundown.
6. **Rundown report is persisted** to a new `table_rundown_report` table on session close, providing an audit-grade snapshot.
7. **Persisted rundown is displayed** for closed sessions instead of re-computing on-the-fly.

### 2.3 Non-Goals

- **Multi-actor fill/credit approval workflow** (status progression: REQUESTED -> ISSUED -> VERIFIED -> DEPOSITED) — P2 per GAP item #8. MVP uses single-write "completed on creation" semantics.
- **`soft_count_table_result` evidence manifest table** — P2 per GAP item #10. Drop total posting is the functional workaround.
- **Reconciliation exception framework** — P2 per GAP items #11-12. No `reconciliation_exception` table or variance detection triggers.
- **Shift-level rundown aggregation** (`shift_rundown_summary`) — P2 per GAP item #13. This PRD covers per-table reports only.
- **Verification workflow for snapshots** (dual-actor sign-off) — P2 per GAP item #14.
- **Finalization states** (RECONCILED -> FINALIZED) — P2 per GAP item #12. Session stays CLOSED.
- **`table_par_policy` append-only history table** — P2 per GAP item #9. MVP uses the flat `gaming_table.par_total_cents` column.
- **Bank mode switching** — configured during onboarding (Setup Wizard) or in casino settings, not per-session.
- **Setup Wizard UI** — covered by PRD-030. This PRD assumes tables already exist and sessions can be opened.

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor

**Top Jobs:**

- As a **Pit Boss**, I need to request a chip fill when a table is running low so that gameplay can continue without interruption.
- As a **Pit Boss**, I need to request a chip credit when a table has excess chips so that the tray stays manageable and the inventory trail is documented.
- As a **Pit Boss**, I need to see a list of all fills and credits for the current session so that I can verify the paper trail matches the system.
- As a **Pit Boss**, I need to enter the soft count result (drop total) after count room processing so that the table win/loss becomes visible.
- As a **Pit Boss**, I need to adjust the par target for a table so that rundown variance reporting reflects the current operational reality.
- As a **Floor Supervisor**, I need to view the persisted rundown report for a closed session so that I can review final numbers without re-computation.

## 4. Scope & Feature List

### Workstream 1: Fill/Credit Request UI

1. Fill request form with denomination-based entry (reusing `ChipCountCaptureDialog` denomination picker pattern)
2. Credit request form (same pattern as fill, for chips leaving the table)
3. Live fill/credit list in InventoryPanel replacing the "coming soon" placeholder
4. Each fill/credit displayed with timestamp, dollar amount, denomination breakdown, and completed status badge
5. Client-side UUID generation for idempotency (`request_id`)
6. Session binding (fill/credit associated with the current `table_session`)

### Workstream 2: Drop Total Posting UI

7. Drop total input dialog (dollar amount entry, converted to cents for storage)
8. Action button in RundownSummaryPanel visible when session is in RUNDOWN state and `drop_posted_at IS NULL`
9. Confirmation step before posting ("Post drop total of $X,XXX? This cannot be undone.")
10. Badge transition from "Count Pending" to "Count Posted" on success
11. Win/loss figure becomes non-null and visible after posting

### Workstream 3: Par Configuration UI

12. Par edit form accessible from table details or settings area
13. Dollar amount input stored as `par_total_cents` on `gaming_table`
14. Updates `par_updated_at` and `par_updated_by` columns
15. Next session opened snapshots the new par value into `table_session.need_total_cents`

### Workstream 4: Rundown Report Persistence

16. New table `table_rundown_report` for storing computed rundown at session close
17. New RPC `rpc_persist_table_rundown(p_session_id)` that computes and stores the result
18. Automatic invocation when a session is closed
19. Query hook `useRundownReport(sessionId)` to fetch the persisted report
20. `RundownSummaryPanel` prefers persisted report for CLOSED sessions, falls back to live computation for active sessions

## 5. Requirements

### 5.1 Functional Requirements

**FR-1: Fill Request**
- Pit boss enters denomination quantities using the standard denomination picker (same pattern as `ChipCountCaptureDialog`: `components/table/chip-count-capture-dialog.tsx`).
- Total amount in cents is computed from the chipset.
- A client-side UUID is generated as `request_id` for idempotency.
- Server action calls `rpc_request_table_fill` via the existing `requestTableFill` function in `services/table-context/chip-custody.ts`.
- On success, the fill appears in the fills list. On duplicate (23505), the existing fill is returned (idempotent behavior already implemented).

**FR-2: Credit Request**
- Same UX pattern as fill request, but for chips leaving the table.
- Server action calls `rpc_request_table_credit` via the existing `requestTableCredit` function in `services/table-context/chip-custody.ts`.

**FR-3: Fill/Credit List**
- InventoryPanel's "Fill Slips" tab queries `table_fill` and `table_credit` rows for the current session (or current table + gaming day).
- Each entry displays: timestamp, total dollar amount, denomination breakdown chips, and a "Completed" status badge.
- Replaces the current `EMPTY_FILL_SLIPS` placeholder and "coming soon" message.

**FR-4: Drop Total Posting**
- A "Post Drop Total" button appears in `RundownSummaryPanel` when `session.status === 'RUNDOWN'` and `session.drop_posted_at === null`.
- Clicking opens a dialog with a dollar-amount input field.
- Confirmation dialog: "Post drop total of $X,XXX? This cannot be undone."
- Calls `usePostDropTotal` mutation (already exists in `hooks/table-context/use-table-rundown.ts`).
- On success, `drop_posted_at` is set, badge changes to "Count Posted", and `table_win_cents` becomes non-null.

**FR-5: Par Target Editing**
- A par edit form is accessible from the table details panel or a settings area.
- Input is a dollar amount (converted to cents for storage).
- Server action updates `gaming_table.par_total_cents`, `par_updated_at`, and `par_updated_by`.
- The next session opened on that table will snapshot the new par value into `table_session.need_total_cents` (existing behavior in `rpc_open_table_session`).

**FR-6: Rundown Report Persistence**
- A new table `table_rundown_report` stores the computed rundown for each closed session.
- A new RPC `rpc_persist_table_rundown(p_session_id)` computes the rundown internally (reusing `rpc_compute_table_rundown` logic) and inserts a row.
- The RPC is called when a session is closed — either by extending `rpc_close_table_session` to call it internally, or by chaining it in the close flow at the application layer.
- Unique constraint `(casino_id, session_id)` ensures one report per session.
- `RundownSummaryPanel` checks for a persisted report when `session.status === 'CLOSED'`. If found, displays stored values. If not, falls back to live `rpc_compute_table_rundown`.

### 5.2 Non-Functional Requirements

- Fill/credit mutations must complete in < 300ms (p95), consistent with PRD-007 latency budget.
- Drop total posting is a single RPC call; < 300ms (p95).
- Par update is a simple column update; < 200ms (p95).
- Rundown persistence adds minimal overhead to session close (one INSERT after computation).
- All new mutations use idempotency keys where applicable (`request_id` for fills/credits, unique constraint for rundown reports).

> Architecture details: see SRM v4.12.0 (TableContextService). RLS patterns: ADR-015, ADR-024. Session lifecycle: ADR-028.

## 6. UX / Flow Overview

### Table Session Active (status = ACTIVE)

```
InventoryPanel
  -> "Chip Counts" tab     -> Existing denomination display (no changes)
  -> "Drop Events" tab     -> Existing drop events list (no changes)
  -> "Fill Slips" tab      -> [+ Request Fill] button -> Fill Request Dialog
                            -> [+ Request Credit] button -> Credit Request Dialog
                            -> Live list: fills and credits with amounts, timestamps
```

### Table Session in RUNDOWN

```
RundownSummaryPanel
  -> Shows formula components (opening, closing, fills, credits, drop)
  -> [Post Drop Total] button (visible when drop_posted_at IS NULL)
     -> Opens Drop Total Dialog -> Dollar amount input -> Confirm -> Post
  -> Badge changes: "Count Pending" -> "Count Posted"
  -> Win/Loss line item becomes visible (was "---" when count pending)
```

### Table Session CLOSED

```
RundownSummaryPanel
  -> Shows persisted report data from table_rundown_report
  -> All values are read-only (historical)
  -> No action buttons
```

### Table Settings (any time, independent of session)

```
Table Details / Settings area
  -> Par Target section
     -> Current par: $X,XXX (or "Not configured")
     -> [Edit Par Target] button -> Dollar amount input -> Save
     -> Confirmation: "Updated par target to $X,XXX. Takes effect on next session."
```

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| PRD-007 (TableContextService) | COMPLETE | Service layer, RPCs, DTOs, schemas |
| ADR-027 (Table Bank Mode) | ACCEPTED | `par_total_cents`, `drop_posted_at`, rundown formula |
| ADR-028 (Table Status Standardization) | ACCEPTED | Session phase enum, availability gate |
| `rpc_request_table_fill` | DEPLOYED | Migration `20251108195341` |
| `rpc_request_table_credit` | DEPLOYED | Migration `20251108195341` |
| `rpc_post_table_drop_total` | DEPLOYED | Migration `20260117153727` |
| `rpc_compute_table_rundown` | DEPLOYED | Migration `20260117153727` |
| `rpc_close_table_session` | DEPLOYED | Migration `20260115025237` |
| `requestTableFill` / `requestTableCredit` | DEPLOYED | `services/table-context/chip-custody.ts` |
| `usePostDropTotal` hook | DEPLOYED | `hooks/table-context/use-table-rundown.ts` |
| `RundownSummaryPanel` | DEPLOYED | `components/table/rundown-summary-panel.tsx` |
| `InventoryPanel` | DEPLOYED | `components/pit-panels/inventory-panel.tsx` |
| `ChipCountCaptureDialog` | DEPLOYED | `components/table/chip-count-capture-dialog.tsx` |
| `FillSlipsDisplay` | DEPLOYED | `components/pit-panels/fill-slips-display.tsx` (skeleton only) |
| PRD-030 (Setup Wizard) | IN PROGRESS | Needed for E2E flow (table creation), NOT a code blocker |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Fill/credit list may grow large for high-volume tables | Use pagination or limit to most recent N entries per session; session scope naturally bounds the list |
| Drop total posting is irreversible | Confirmation dialog with amount display; no "undo" — matches real-world procedure where count room results are final |
| Par edit has no history trail | Acceptable for MVP (flat column). `audit_log` can capture changes if instrumented. `table_par_policy` append-only table is P2 |
| `rpc_persist_table_rundown` adds a step to session close | Minimal overhead (one INSERT). If RPC fails, session still closes — report can be regenerated on demand |
| Concurrency: two staff post different drop totals | RPC enforces `drop_posted_at IS NULL` precondition; second call fails cleanly |

**Open Questions:**

1. Should the fill/credit list show entries from both `table_fill` and `table_credit` in a single unified list (sorted by timestamp), or in separate sub-tabs? **Recommendation:** Single unified list labeled "Fills & Credits" with a type indicator per row.
2. Should `rpc_persist_table_rundown` be called inside `rpc_close_table_session` (single transaction) or as a separate call after close? **Recommendation:** Inside `rpc_close_table_session` for atomicity. If the session closes, the report is guaranteed to exist.
3. Should par editing require a confirmation step? **Recommendation:** Yes — a simple "Save" confirmation since par changes affect future sessions.

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Pit boss can request a table fill with denomination breakdown via the Fill Request Dialog
- [ ] Pit boss can request a table credit with denomination breakdown via the Credit Request Dialog
- [ ] Fill/Credit list displays real data in InventoryPanel — "coming soon" placeholder removed
- [ ] Each fill/credit entry shows timestamp, dollar amount, denomination chips, and status
- [ ] Pit boss can post drop total when session is in RUNDOWN state via the Drop Total Dialog
- [ ] Win/loss becomes visible in RundownSummaryPanel after drop total is posted
- [ ] Par target can be edited per table via the Par Edit Form
- [ ] Updated par target is reflected in the next opened session's `need_total_cents`

**Data & Integrity**
- [ ] `table_rundown_report` table exists with `UNIQUE (casino_id, session_id)` constraint
- [ ] Rundown report is persisted on session close with all formula components
- [ ] Fill/credit mutations use `request_id` for idempotency (duplicate requests return existing record)
- [ ] Drop total posting enforces `drop_posted_at IS NULL` precondition (prevents double-posting)
- [ ] No orphaned rundown reports — report is written atomically with session close

**Security & Access**
- [ ] `table_rundown_report` has casino-scoped RLS policies (standard Pattern C hybrid per ADR-015)
- [ ] `rpc_persist_table_rundown` uses `set_rls_context_from_staff()` for authoritative context (ADR-024)
- [ ] Par update validates `auth.uid() IS NOT NULL` (authenticated staff only)
- [ ] All new mutations require authenticated session

**Testing**
- [ ] Unit test: fill request form computes correct amount_cents from chipset
- [ ] Unit test: drop total dialog validates positive amount
- [ ] Integration test: fill and credit appear in list after creation
- [ ] Integration test: drop posting transitions "Count Pending" to "Count Posted"
- [ ] Integration test: persisted rundown report matches live computation
- [ ] E2E test: open session -> fill -> credit -> start rundown -> post drop total -> close -> view persisted rundown report

**Operational Readiness**
- [ ] TypeScript types regenerated after migration (`npm run db:types`)
- [ ] No type-check errors (`npm run type-check`)
- [ ] Structured error messages for RPC failures (not raw Postgres errors)

**Documentation**
- [ ] SRM updated if table ownership changes (likely no change — `table_rundown_report` owned by TableContextService)
- [ ] Migration follows naming standard (`YYYYMMDDHHMMSS_table_rundown_report.sql`)
- [ ] Known limitations documented: single-actor fill/credit (P2 for multi-actor), no par history (P2), no reconciliation (P2)

## 9. Related Documents

- **Gap Analysis (primary driver):** `docs/issues/gaps/table-inventory-lifecycle/GAP-TABLE-INVENTORY-LIFECYCLE.md`
- **Vision / Lifecycle:** `docs/00-vision/table-context-read-model/table-inventory-rundown-lifecycle.md`
- **Vision / Dual Policy:** `docs/00-vision/table-context-read-model/need-par-dual-policy.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` v4.12.0 (TableContextService)
- **Over-Engineering Guardrail:** `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- **ADR-027:** `docs/80-adrs/ADR-027-table-bank-mode-dual-policy.md` (bank mode, par, rundown formula)
- **ADR-028:** `docs/80-adrs/ADR-028-table-status-standardization.md` (session phase enum, availability gate)
- **ADR-015:** `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` (RLS Pattern C hybrid)
- **ADR-024:** `docs/80-adrs/ADR-024-authoritative-context-derivation.md` (context injection)
- **PRD-007:** `docs/10-prd/PRD-007-table-context-service.md` (TableContext service definition)
- **RLS Policy Matrix:** `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Schema / Types:** `types/database.types.ts`
- **Service Layer:** `services/table-context/` (chip-custody.ts, rundown.ts, dtos.ts, schemas.ts, keys.ts, mappers.ts)
- **Hooks:** `hooks/table-context/` (use-table-rundown.ts, use-table-session.ts, use-inventory-snapshots.ts, use-drop-events.ts)
- **Components:** `components/pit-panels/inventory-panel.tsx`, `components/pit-panels/fill-slips-display.tsx`, `components/table/rundown-summary-panel.tsx`, `components/table/chip-count-capture-dialog.tsx`, `components/table/close-session-dialog.tsx`

---

## Appendix A: `table_rundown_report` Schema

```sql
CREATE TABLE table_rundown_report (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id       uuid NOT NULL REFERENCES casino(id),
  session_id      uuid NOT NULL REFERENCES table_session(id),
  gaming_table_id uuid NOT NULL REFERENCES gaming_table(id),
  gaming_day      date NOT NULL,
  opening_cents   integer NOT NULL,
  closing_cents   integer NOT NULL,
  fills_cents     integer NOT NULL DEFAULT 0,
  credits_cents   integer NOT NULL DEFAULT 0,
  drop_cents      integer,
  table_win_cents integer,
  par_target_cents integer,
  par_variance_cents integer,
  table_bank_mode table_bank_mode,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  computed_by     uuid REFERENCES staff(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_rundown_report_session UNIQUE (casino_id, session_id)
);

-- RLS (casino-scoped, standard Pattern C hybrid per ADR-015)
ALTER TABLE table_rundown_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "casino_scope_select" ON table_rundown_report
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

CREATE POLICY "casino_scope_insert" ON table_rundown_report
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      current_setting('app.casino_id', true)::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

## Appendix B: `rpc_persist_table_rundown` Sketch

```sql
CREATE OR REPLACE FUNCTION rpc_persist_table_rundown(p_session_id uuid)
RETURNS table_rundown_report
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id  uuid;
  v_rundown   record;
  v_session   record;
  v_result    table_rundown_report;
BEGIN
  -- Establish context (ADR-024)
  PERFORM set_rls_context_from_staff();
  v_casino_id := current_setting('app.casino_id', true)::uuid;
  v_actor_id  := current_setting('app.actor_id', true)::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'Missing casino context';
  END IF;

  -- Fetch session
  SELECT * INTO v_session
  FROM table_session
  WHERE id = p_session_id AND casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Compute rundown (reuse existing logic)
  SELECT * INTO v_rundown
  FROM rpc_compute_table_rundown(p_session_id);

  -- Persist
  INSERT INTO table_rundown_report (
    casino_id, session_id, gaming_table_id, gaming_day,
    opening_cents, closing_cents, fills_cents, credits_cents,
    drop_cents, table_win_cents, par_target_cents, par_variance_cents,
    table_bank_mode, computed_by
  ) VALUES (
    v_casino_id, p_session_id, v_session.gaming_table_id, v_session.gaming_day,
    v_rundown.opening_total_cents, v_rundown.closing_total_cents,
    v_rundown.fills_total_cents, v_rundown.credits_total_cents,
    v_rundown.drop_total_cents, v_rundown.table_win_cents,
    v_rundown.need_total_cents,
    CASE WHEN v_rundown.closing_total_cents IS NOT NULL AND v_rundown.need_total_cents IS NOT NULL
         THEN v_rundown.closing_total_cents - v_rundown.need_total_cents
         ELSE NULL END,
    v_rundown.table_bank_mode, v_actor_id
  )
  ON CONFLICT (casino_id, session_id) DO NOTHING
  RETURNING * INTO v_result;

  -- If conflict (already persisted), fetch existing
  IF v_result IS NULL THEN
    SELECT * INTO v_result
    FROM table_rundown_report
    WHERE casino_id = v_casino_id AND session_id = p_session_id;
  END IF;

  RETURN v_result;
END;
$$;
```

## Appendix C: New Hooks Summary

| Hook | Type | Purpose | Exists? |
|------|------|---------|---------|
| `useTableFills(sessionId)` | Query | Fetch fills for a session | **New** |
| `useTableCredits(sessionId)` | Query | Fetch credits for a session | **New** |
| `useRequestTableFill()` | Mutation | Create a fill request | **New** |
| `useRequestTableCredit()` | Mutation | Create a credit request | **New** |
| `usePostDropTotal()` | Mutation | Post drop total to session | **Exists** (`hooks/table-context/use-table-rundown.ts`) |
| `useTableRundown(sessionId)` | Query | Compute live rundown | **Exists** (`hooks/table-context/use-table-rundown.ts`) |
| `useRundownReport(sessionId)` | Query | Fetch persisted report | **New** |
| `useUpdateTablePar()` | Mutation | Update `gaming_table.par_total_cents` | **New** |

## Appendix D: Server Actions Summary

| Action | Parameters | RPC / Operation |
|--------|-----------|-----------------|
| `requestTableFillAction` | `sessionId, tableId, casinoId, chipset, requestId` | `rpc_request_table_fill` via `services/table-context/chip-custody.ts` |
| `requestTableCreditAction` | `sessionId, tableId, casinoId, chipset, requestId` | `rpc_request_table_credit` via `services/table-context/chip-custody.ts` |
| `postDropTotalAction` | `sessionId, dropTotalCents` | `rpc_post_table_drop_total` via `services/table-context/rundown.ts` |
| `updateTableParAction` | `tableId, parTotalCents` | Direct UPDATE on `gaming_table.par_total_cents` (or new RPC) |
| `persistRundownReportAction` | `sessionId` | `rpc_persist_table_rundown` (new) |

## Appendix E: Component Changes Summary

| Component | File | Change |
|-----------|------|--------|
| `InventoryPanel` | `components/pit-panels/inventory-panel.tsx` | Replace `EMPTY_FILL_SLIPS` with live query; add session prop; add fill/credit request buttons |
| `FillSlipsDisplay` | `components/pit-panels/fill-slips-display.tsx` | Refactor to accept `TableFillDTO[]` and `TableCreditDTO[]` from real queries |
| `RundownSummaryPanel` | `components/table/rundown-summary-panel.tsx` | Add "Post Drop Total" button; prefer persisted report for CLOSED sessions |
| **New:** `FillRequestDialog` | `components/table/fill-request-dialog.tsx` | Denomination picker + submit (reuse `ChipCountCaptureDialog` pattern) |
| **New:** `CreditRequestDialog` | `components/table/credit-request-dialog.tsx` | Same as fill but for credits |
| **New:** `DropTotalDialog` | `components/table/drop-total-dialog.tsx` | Dollar amount input + confirmation |
| **New:** `ParEditForm` | `components/table/par-edit-form.tsx` | Dollar amount input for par_total_cents |

---

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-02-11 | System Architect | Initial draft |

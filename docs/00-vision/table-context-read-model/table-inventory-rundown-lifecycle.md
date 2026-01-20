---
title: Table Inventory Lifecycle (Rundown)
doc_type: workflow
status: draft
version: 0.1
date: 2026-01-15
owner_context: TableContext
scope: MVP (pilot)
---

# Table Inventory Lifecycle (Rundown)

This document turns the “open table → carry need → manage fills/credits → drop → win/loss” idea into an **auditable, stateful workflow** you can implement in the **TableContext** bounded context without accidentally swallowing Cage/Accounting.

---

## 1) Definitions

### Table “need” (par / imprest target)
A table is operated against a **target bankroll** (“need” / “par”). During a shift, the table is kept workable by issuing **fills** (chips in) and **credits** (chips out). At close, the **drop + slips + inventory** produce a provable win/loss.

### Drop (table games)
Drop is the contents removed from the table drop box. Operationally, your rundown math must also include **credit slips** (chips returned to cage) because they function like “value removed from table” for the formula.

### Rundown (table win/loss computation)
A widely used control identity for table games is:

**gross/table win = closing bankroll + credits + drop − opening bankroll − fills**

(You choose sign conventions; just stay consistent.)

---

## 2) What TableContext owns vs what it must not own

### TableContext *owns* (operational truth)
- Table inventory sessions (open → close) and their state machine
- Opening/closing inventory snapshots (chip tray counts)
- Fill / credit workflows *as operational events + documents*
- Drop events (box removed) and ingestion of count results (soft count totals)
- Rundown calculation inputs + output “table rundown report”
- Exception detection and routing (variance, missing slip, etc.)

### TableContext *does not own*
- Cage accountability, cashier balancing, GL posting
- Master gaming report generation, official tax reporting, regulator export formats
- Count room operations beyond “ingest results + reconcile evidence”

Those belong in **Finance/Cage** and **Reporting** bounded contexts.

---

## 3) Lifecycle phases (end-to-end)

## Phase 0 — Pre-shift setup (controls are born here)
**Goal:** prevent “chips teleporting.”

**Preconditions**
- Table assigned, game settings active
- Drop box installed/locked (or electronic equivalent)
- Restricted forms inventory available (fill/credit, opener/closer)

**Outputs**
- `table_inventory_session` created in `READY_TO_OPEN`

---

## Phase 1 — Open table (opening bankroll snapshot)
**Goal:** establish the baseline for the shift’s math.

1. **Start session**
   - `opened_at`, `opened_by`, `{casino_id, gaming_day, shift_id, table_id}`

2. **Count opening bankroll (chip tray)**
   - Denomination breakdown + total
   - Verified by dealer + supervisor (or whatever your ops pattern is)

3. **Set “need/par”**
   - `need_total` (and optional denom targets)

**State**
- `OPENING → OPEN`

---

## Phase 2 — Live play (inventory is managed via fills/credits)
**Goal:** keep the table operable while preserving audit trail.

### 2A) Buy-ins (optional telemetry)
Buy-ins are *not* fills/credits. They move cash into the drop box and chips out of the tray.
- Track if you want (telemetry), but don’t confuse them with inventory adjustment documents.

### 2B) Fill workflow (chips **to** table)
**Trigger**
- Table is short on chips / can’t pay / needs to restore workable inventory

**Workflow**
1. Pit initiates `fill_request`
2. Cage issues chips + fill slip
3. Runner transports chips + slip
4. Dealer counts chips in public view before racking
5. Dealer + supervisor sign; slip goes to drop box (or system equivalent)

**Outputs**
- `fill_slip` record + status progression  
  `REQUESTED → ISSUED → VERIFIED_AT_TABLE → DEPOSITED_IN_DROPBOX`

### 2C) Credit workflow (chips **from** table)
**Trigger**
- Table has excess chips and needs reduction back toward need/par

**Workflow**
1. Pit initiates `credit_request`
2. Dealer counts chips in public view
3. Runner transports chips to cage
4. Cage prepares credit slip; signatures obtained
5. Credit slip inserted into drop box (or system equivalent)

**Outputs**
- `credit_slip` record + status progression  
  `REQUESTED → PICKED_UP → VERIFIED_AT_CAGE → DEPOSITED_IN_DROPBOX`

### 2D) “No shortcuts” rules (encode as validation)
- No cross-fills / pit exchanges (unless your jurisdiction explicitly allows with documented procedure)
- No chip movement without a document trail (fill/credit/transfer) and required signatures

---

## Phase 3 — Drop (removal of drop boxes)
**Goal:** secure evidence for count + reconciliation.

1. Schedule drop  
   `OPEN → DROP_SCHEDULED`
2. Drop team removes drop boxes
3. Record:
   - `drop_event` per table: box_id, removed_at, removed_by, optional seals/trip_id

**State**
- `DROP_SCHEDULED → DROPPED`

---

## Phase 4 — Soft count (count room) + reconciliation inputs (ingested)
**Goal:** produce the authoritative drop total and tie it to evidence (slips).

1. Count room opens boxes and counts contents
2. Extract and list evidence items:
   - fill slips, credit slips, markers (if applicable), etc.
3. Reconcile against restricted copies retained by cage/accounting

**TableContext action**
- Ingest results as immutable “count facts”:
  - `soft_count_table_result`: `drop_total`, evidence list, exceptions

**State**
- `DROPPED → COUNTED`

---

## Phase 5 — Close table (closing bankroll snapshot)
**Goal:** produce the second baseline.

Two common operational styles:

### Option A — Record closing inventory
- Count and record the chip tray at shift end

### Option B — Final fill/credit to par (imprest restore)
- Perform a final adjustment to bring table back to `need_total`
- Then record the post-adjustment inventory (often equals need/par)

**Outputs**
- `closing_bankroll_snapshot`

**State**
- `COUNTED/OPEN → CLOSING → CLOSED`

(Your implementation may allow close before count ingestion; just mark the report as “pending count.”)

---

## Phase 6 — Compute rundown (table win/loss)
**Goal:** produce the number everyone asks for and prove it.

### Rundown formula (table-level)
- Opening bankroll total (from Phase 1)
- Closing bankroll total (from Phase 5)
- Fills total (sum verified fills)
- Credits total (sum verified credits)
- Drop total (from soft count ingestion)

**gross/table win = closing + credits + drop − opening − fills**

### Output artifacts
- `table_rundown_report` (per table per shift)
- `shift_rundown_summary` (aggregated)

**State**
- `CLOSED + COUNTED → RECONCILED → FINALIZED`

---

## Phase 7 — Exceptions & investigations (where systems usually lie)
**Goal:** force accountability when the math doesn’t tie or evidence is missing.

### Common exception types
- Missing slip in drop box (fill/credit happened, no evidence)
- Slip amount mismatch vs chip movement
- Duplicate slip number / void misuse
- Count variance beyond tolerance
- Drop box removed outside schedule or with irregular custody chain

### Exception workflow
1. System detects variance / missing evidence
2. Create `reconciliation_exception`
3. Require explicit resolution:
   - reason code + narrative
   - resolver + timestamp
   - links to audit log events

**Rule of thumb**
If you can’t prove it later, treat it as an exception now.

---

## 4) Minimal state machine (MVP)
- `READY_TO_OPEN`
- `OPENING`
- `OPEN`
- `DROP_SCHEDULED`
- `DROPPED`
- `COUNTED`
- `CLOSING`
- `CLOSED`
- `RECONCILED`
- `FINALIZED`

**Transitions should be guarded** by preconditions (e.g., cannot `FINALIZED` with unresolved exceptions).

---

## 5) Data model sketch (TableContext)

### Core tables (suggested)
- `table_inventory_session`
  - ids: `casino_id, gaming_day, shift_id, table_id`
  - fields: status, opened_at/by, closed_at/by, need_total
- `table_inventory_snapshot`
  - session_id, type (`OPENING|CLOSING`), denom_breakdown_json, total
- `inventory_adjustment_slip`
  - session_id, type (`FILL|CREDIT`), slip_no, denom_breakdown_json, total
  - statuses: requested/issued/verified/deposited
  - actors: requested_by, verified_by, runner_id (optional)
- `drop_event`
  - session_id, box_id, removed_at/by, trip_id (optional)
- `soft_count_table_result`
  - session_id, drop_total, evidence_manifest_json, counted_at, counted_by (service actor)
- `reconciliation_exception`
  - session_id, category, variance_amount, status, resolution_note, resolved_by/at
- `table_rundown_report`
  - session_id, opening_total, closing_total, fills_total, credits_total, drop_total, win_loss_total, finalized_at/by

### Notes
- Prefer immutable “facts” tables for count results and slips; mutations are mostly **status transitions** and **resolution notes**, not editing totals.
- Keep slip numbering unique per casino + gaming day (or per regulatory rule), and enforce void rules.

---

## 6) Service surface (what your TableContext service should expose)

### Commands
- `openTableSession(table_id, shift_id, need_total)`
- `recordOpeningSnapshot(session_id, denom_breakdown)`
- `requestFill(session_id, denom_breakdown)` / `verifyFillAtTable(slip_id, verifier_id)`
- `requestCredit(session_id, denom_breakdown)` / `verifyCreditAtCage(slip_id, verifier_id)`
- `scheduleDrop(session_id)` / `recordDropRemoved(session_id, box_id)`
- `ingestSoftCount(session_id, drop_total, evidence_manifest)`
- `recordClosingSnapshot(session_id, denom_breakdown)`
- `computeRundown(session_id)`
- `finalizeRundown(session_id)` (requires: counted OR explicitly “pending count” policy, and no open exceptions)

### Queries
- `getTableSession(session_id)`
- `listOpenTables(shift_id)`
- `getRundownReport(session_id)`
- `listExceptions(shift_id|table_id)`

---

## 7) Integration points (clean handoffs)

### To Reporting
- Publish: `RUNDOWN_FINALIZED` (table-level), `SHIFT_RUNDOWN_READY` (aggregate-ready)

### To Finance/Cage
- Provide: verified fill/credit totals and slip manifests (don’t post GL here)

### To Audit/Compliance
- Provide: exception log, custody chain events, slip void history

---

## 8) Implementation guardrails (to prevent scope creep)
- MVP goal: **proveable per-table win/loss per shift**
- Hard stop: do not model full cage balancing, GL journals, or regulator export formats inside TableContext
- Treat buy-ins/markers as “telemetry” unless they’re required for your current shift reports

---

## 9) Source anchors (for later policy alignment)
These references are useful when you align the workflow to your jurisdiction’s internal control standards:
- Nevada Gaming Control Board / Nevada Gaming Commission — Minimum Internal Control Standards (Table Games) and related ICP materials
- NIGC (25 CFR Part 542) — Minimum Internal Control Standards (tribal)
- State-level MICS examples (e.g., Missouri) on cross-fills/even-money exchanges and fill/credit controls
- State internal control rules that state the table-games gross revenue formula (e.g., Mississippi rules)

---

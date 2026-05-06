---
doc: "PRD Addendum"
id: "PRD-038A"
title: "Table Lifecycle & Per-Table Deltas Enablement"
parent_prd: "PRD-038-shift-rundown-persistence-deltas"
related_exec_spec: "EXEC-038-shift-rundown-deltas"
related_adr: "ADR-037-rundown-persistence-finalization-contract"
date: "2026-02-25"
status: "Draft"
audit_patch: "PRD-038A-table-lifecycle-audit-patch.md (folded in)"
---

# PRD-038A Addendum: Table Lifecycle & Per-Table Deltas Enablement

This addendum extends **PRD-038** to make **per-table deltas operationally meaningful** by introducing a minimal **table session lifecycle** (open/activate/pause/resume/rollover/close) while staying compatible with the **already-implemented EXEC-038** scope and contracts.

## 1) Problem

Per-table deltas are conceptually supported by the current shift checkpoint + windowed metrics model, but the product lacks a first-class **table lifecycle workflow**:
- No workflow to **open** a table session
- No workflow to **temporarily close/pause** a table without closing the session
- No workflow to **roll over** a table cleanly at shift handoff (close + open with provenance)
- "In play" vs "not in play" is therefore ambiguous, producing noisy deltas and weak operator trust
- No guardrail preventing close when **outstanding liabilities** exist (rim credit, unsettled items)
- Close reason is not captured, making "maintenance close" indistinguishable from "end-of-shift close"
- Lifecycle transitions lack first-class **actor attribution** (who did it)
- "Active time" within a window is described but not formally defined, risking inconsistent rate metrics

The current implementation already assumes:
- A session lifecycle with statuses `OPEN|ACTIVE|RUNDOWN|CLOSED`
- Windowed metrics via `rpc_shift_table_metrics(window_start, window_end)`
- Close workflow persists rundown inline (and finalization contract exists)

This addendum fills the missing operational primitives without changing the existing persistence/delta architecture.

## 2) Goals

G1. Provide a minimal lifecycle that operators can use to control table sessions:
- Open
- Activate (start play)
- Pause (temp close)
- Resume
- Rollover (shift handoff)
- Close

G2. Make per-table deltas reflect **tables that were actually in play** during a window.

G3. Preserve existing PRD-038/EXEC-038 contracts:
- No new session statuses required
- No changes to persisted rundown/checkpoint schemas required for MVP
- Late-event visibility and null semantics remain intact

G4. Ensure close/rollover operations are **compliance-safe** by enforcing reconciliation guardrails and actor attribution.

## 3) Non-goals

- Introducing new session states (e.g., `PAUSED`, `ROLLED_OVER`) — the lifecycle is expressed via existing statuses plus pause intervals.
- Implementing pit-scoped checkpoints or pit entity modeling (pit_id remains deferred unless already modeled elsewhere).
- Changing the already implemented rundown persistence + finalization contract.
- Implementing full rim-credit / marker / fills workflows — "unresolved liabilities" is modeled as a lightweight hook for future domain integration.

## 4) Definitions

- **Table session**: a time-bounded operational window for a specific `gaming_table_id`.
- **Pause interval**: a time range where a table is temporarily not in play, without closing the session.
- **Rollover**: structured shift handoff that closes the current session (persist rundown) and opens a new session with opening provenance referencing the prior closing snapshot.
- **Active seconds in window**: `overlap_seconds(session, window) - overlap_seconds(pause_intervals, window)`, clamped to `>= 0`.
- **Unresolved liabilities**: outstanding credit/marker/rim-type items that must be reconciled before a session can be cleanly closed.

## 5) User stories

US-1. As a pit supervisor, I can open a table session at the start of play so that operational metrics and deltas are meaningful.

US-2. As a pit supervisor, I can temporarily pause a table (break, maintenance, dealer swap, empty table) without "closing" it.

US-3. As a pit supervisor, I can roll over a table at shift change (close + open) so the next shift begins with clean session boundaries.

US-4. As an operator viewing the rundown dashboard, I can see per-table deltas since the last checkpoint that reflect only activity during the current window.

US-5. As a pit supervisor, I am prevented from closing a table with outstanding liabilities unless I explicitly force-close with a documented reason and sufficient privilege.

US-6. As a compliance auditor, I can see who performed each lifecycle transition and whether reconciliation was required at close.

## 6) Functional requirements

### 6.1 Session lifecycle RPCs

**FR-1: Open table session**
- Provide `rpc_open_table_session(gaming_table_id, opened_at := now(), note := null)`
- Creates `table_session` for the given `gaming_table_id` with status `OPEN` (or `ACTIVE` if you choose to skip OPEN; see Implementation Notes).
- Enforces invariant: at most one `OPEN|ACTIVE|RUNDOWN` session exists per `(casino_id, gaming_table_id)`.
- Records `opened_by_staff_id` from RLS context.

**FR-2: Activate table session**
- Provide `rpc_activate_table_session(table_session_id, activated_at := now())`
- Transitions session status `OPEN → ACTIVE`.
- Rejects activation if session is `CLOSED`.
- Records `activated_by_staff_id` from RLS context.

**FR-3: Pause (temp close)**
- Provide `rpc_pause_table_session(table_session_id, reason := null, paused_at := now())`
- Appends a pause interval with `start_at = paused_at` and `end_at = null`.
- Rejects if an open pause interval already exists (idempotency / invariant).
- Records `paused_by_staff_id` from RLS context.

**FR-4: Resume**
- Provide `rpc_resume_table_session(table_session_id, resumed_at := now())`
- Closes the latest open pause interval (`end_at = resumed_at`).
- Rejects if no open pause interval exists.
- Records `resumed_by_staff_id` from RLS context.

**FR-5: Rollover**
- Provide `rpc_rollover_table_session(gaming_table_id, reason := 'shift_handoff', rolled_at := now(), note := null, force := false)`
- Must:
  1) Close current active session using the existing close workflow (persist rundown inline).
  2) Open a new session with opening provenance pointing to the prior closing snapshot.
- The rollover operation must be atomic as a single RPC (not a client-side sequence).
- Records `rolled_over_by_staff_id` from RLS context.
- Subject to close guardrails (FR-10); if unresolved liabilities exist and `force` is not set, rollover is rejected.

**FR-6: Close**
- Uses existing `rpc_close_table_session` implementation.
- Close must persist rundown inline and respect finalization contract where applicable (no changes in this addendum).
- Records `closed_by_staff_id` from RLS context.
- Must store `close_reason` (FR-13).
- Subject to close guardrails (FR-10).

### 6.2 Per-table deltas semantics

**FR-7: Table participation in a window (formal definition)**
Per-table deltas and per-table metrics MUST define participation as:

- Session overlaps the window: `overlap_seconds(session, window) > 0`
- Active seconds in window are computed as:

`active_seconds_in_window = overlap_seconds(session, window) - overlap_seconds(pause_intervals, window)`

Rules:
- Clamp to `>= 0` (never negative).
- Rate metrics (DPH, etc.) MUST use `active_seconds_in_window` as denominator.
- If `active_seconds_in_window == 0`, label the table as "Closed this window" (distinct from "0 activity").

**FR-8: Baseline row absence**
When computing deltas since a checkpoint:
- If a table exists in current metrics but not in baseline metrics at `checkpoint.window_end`, treat baseline additive metrics as `0`.
- For metrics that are *unknown until posted* (e.g., win/loss dependent on drop posting), preserve `NULL` semantics (render as `---`, not `$0`).

**FR-9: Late-event after finalization**
If late fills/credits occur after a finalized rundown:
- System must set `table_rundown_report.has_late_events = true` (one-way) and emit an `audit_log` entry.
- UI must show a "Late activity after finalization" badge on the report.

### 6.3 Lifecycle transition rules

**TR-1: Allowed transitions**
- `OPEN → ACTIVE`
- `ACTIVE → CLOSED` (via close workflow)
- `OPEN → CLOSED` (allowed only if table never entered play; see Close Guardrails)
- `ACTIVE ↔ Pause/Resume` (pause intervals, status remains `ACTIVE` unless implementation uses `OPEN`)
- `ROLLOVER` is a single atomic operation: `(OPEN|ACTIVE) → CLOSED + new OPEN` for same `gaming_table_id`

**TR-2: Terminal state**
- `CLOSED` is terminal. No further pause/resume/activate operations allowed.

**TR-3: Idempotency**
- Repeated lifecycle calls should be either rejected with a clear error or return a stable idempotent result (explicitly define per RPC).

### 6.4 Close guardrails & forced close

**FR-10: Close guardrails (default behavior)**
`rpc_close_table_session(...)` and `rpc_rollover_table_session(...)` MUST validate that the session is safe to close.

- If the session has **unresolved liabilities** (e.g., outstanding credit/marker/rim-type items) then:
  - Close MUST be rejected, unless forced close is invoked (FR-11).

**FR-11: Forced close (privileged)**
Provide `rpc_force_close_table_session(table_session_id, reason, note := null, closed_at := now())` that:
- Requires a privileged role (e.g., `pitboss|manager|admin` per SRM policy).
- Closes the session even if unresolved liabilities exist.
- Sets `table_session.requires_reconciliation = true`.
- Emits an `audit_log` entry including: session_id, reason, note, actor_id, timestamp.

**FR-12: Rollover with unresolved liabilities**
`rpc_rollover_table_session(...)` MUST either:
- reject rollover if unresolved liabilities exist (default), or
- route to forced close behavior only if privileged + explicit `force := true` is provided.

### 6.5 Close reason

**FR-13: Close reason capture**
Close operations MUST store a `close_reason`:

Recommended enum values (MVP):
- `end_of_shift`
- `maintenance`
- `game_change`
- `dealer_unavailable`
- `low_demand`
- `security_hold`
- `emergency`
- `other`

If `other`, `note` is required.

### 6.6 Gaming day alignment

**FR-14: Gaming day provenance**
Close and rollover MUST persist gaming day provenance:
- Store `gaming_day` (or computed equivalent) on the session close snapshot and on the newly opened session.
- If rollover crosses a gaming day boundary, set `crossed_gaming_day = true` on the rollover provenance.

## 7) Data model additions

### 7.1 Pause intervals storage

Choose one approach:

**Option A (JSONB on session) — MVP-friendly**
- Add `table_session.pause_intervals jsonb not null default '[]'`
- Each entry: `{ start_at: timestamptz, end_at: timestamptz|null, reason: text|null }`

**Option B (child table) — stronger relational integrity**
- `table_session_pause` with `(id, casino_id, table_session_id, start_at, end_at, reason, created_at)`
- Index on `(casino_id, table_session_id, start_at desc)`

MVP recommendation: **Option A** to minimize schema surface area and migrations.

### 7.2 Lifecycle attribution fields

To support auditability, the system MUST record actor attribution for lifecycle transitions.

Minimum required attribution fields (either as columns or immutable metadata stored on session):
- `opened_by_staff_id`
- `activated_by_staff_id`
- `paused_by_staff_id` (latest)
- `resumed_by_staff_id` (latest)
- `closed_by_staff_id`
- `rolled_over_by_staff_id`

### 7.3 Close & reconciliation fields

- `close_reason` — enum or text with check constraint (see FR-13 for values).
- `requires_reconciliation boolean not null default false` — set by forced close (FR-11).

## 8) UI requirements

### 8.1 Table tile / table list actions
On a per-table UI surface (table tile, table list row, or table details panel), provide:
- Open (if no active session exists)
- Activate (if status is OPEN)
- Pause / Resume toggle (based on presence of open pause interval)
- Close (with close reason selection)
- Force Close (visible to privileged roles only; when close is blocked by unresolved liabilities)
- Rollover (visible to privileged roles; intended for shift handoff)

### 8.2 Per-table deltas display
In the rundown/shift view:
- Show per-table deltas since selected checkpoint (or "since shift start" baseline).
- If win/loss is NULL, render `---` (never `$0`).
- If `active_seconds_in_window == 0`, show "Closed this window" label.

### 8.3 Reconciliation badge
- If `requires_reconciliation = true`, show a "Reconciliation Required" badge on the session/report.

## 9) Security & authorization

- All lifecycle RPCs must follow the same posture as EXEC-038: context-first (`set_rls_context...`), SECURITY DEFINER as required, `search_path=''`.
- Role checks MUST reference canonical `public.staff_role` enum values (no hardcoded literals).
- `authenticated` must not have direct write privileges to lifecycle-critical tables; writes are only through RPC EXECUTE grants.
- Forced close (`rpc_force_close_table_session`) requires privileged role validation (`pitboss|manager|admin`).

## 10) Acceptance criteria / DoD

AC-1. Opening a table creates exactly one active session; opening again fails or returns idempotent response (per chosen rule).

AC-2. Pause/resume creates well-formed intervals; cannot have two open pause intervals.

AC-3. Rollover performs close+persistence + open atomically; new session opening provenance references prior closing snapshot.

AC-4. Per-table deltas:
- For tables opened after checkpoint_end, baseline additive metrics are treated as zero.
- Win/loss remains NULL if drop not posted; UI renders `---`.

AC-5. Late-event after finalization:
- `has_late_events` flips to true and stays true.
- `audit_log` is emitted.
- UI badge is present.

AC-6. Close guardrail:
- Attempting to close/rollover a session with unresolved liabilities is rejected with a clear error.

AC-7. Forced close:
- Forced close is permitted only for privileged roles, sets `requires_reconciliation=true`, and emits `audit_log`.

AC-8. Close reason:
- Close persists `close_reason`; if `other`, note is required.

AC-9. Window active seconds:
- Given a session overlapping a window with pauses, `active_seconds_in_window` matches overlap math and is used by rate metrics.

AC-10. Actor attribution:
- Every lifecycle transition records the acting staff ID on the session record.

AC-11. Gaming day provenance:
- Close and rollover persist `gaming_day`; cross-boundary rollovers flag `crossed_gaming_day`.

## 11) Implementation notes (constraints)

- No new session statuses are required to deliver pause/rollover.
- Avoid client-side orchestration for rollover; it must be server-side atomic.
- If you later add pit modeling, pit-scoped checkpoints can be layered without changing this lifecycle.
- You do **not** need to implement full rim-credit / marker workflows now. Model "unresolved liabilities" as:
  - a boolean `has_unresolved_items` set by other domains later, or
  - a cheap `unresolved_item_count` placeholder, or
  - a future hook to Finance/MTL/Loyalty domains.
- Forced close should be rare but must exist, otherwise humans will do human things and your data will rot.
- If you keep pause intervals as JSONB (Option A), disallow edits except through RPCs and treat them as append-only (except closing the open interval).

## 12) Risks

- If `rpc_shift_table_metrics` is not deterministic for historical windows, per-table deltas may require storing per-table snapshots at checkpoint time (scope bump). Ensure existing determinism tests remain gates (see EXEC-038 DoD).
- JSONB pause storage can become messy if edited; disallow direct edits and only mutate via RPCs.
- Close guardrails depend on a lightweight "unresolved liabilities" signal; if no domain provides this signal, the guardrail defaults to allowing close (fail-open). Ensure at least a manual flag is available.

## 13) References

- Nevada Gaming Control Board: Minimum Internal Control Standards (Table Games) — closing procedures and special handling when closing with outstanding credit (rim) and reconciliation expectations.
- Washington Administrative Code (WAC 230-15): opening/closing table procedures; count recorded on slips; surveillance monitoring.
- Federal (25 CFR Part 542): definitions and internal controls constructs for table inventory forms at beginning/end of shift.

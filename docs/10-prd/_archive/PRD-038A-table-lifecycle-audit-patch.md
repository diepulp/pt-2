---
doc: "Audit + Patch Proposal"
target_doc: "PRD-038A Addendum: Table Lifecycle & Per-Table Deltas Enablement"
target_id: "PRD-038A"
date: "2026-02-25"
status: "Draft"
---

# PRD-038A Audit (Table Lifecycle & Per-Table Deltas Enablement)

This document audits **PRD-038A** and proposes **minimal, scope-safe additions** to make the table lifecycle credible in real casino ops and compliance contexts—without blowing up EXEC-038.

## 0) Executive summary

Your lifecycle scaffold is directionally correct (**open → activate → pause/resume → rollover → close**), but it is missing a few real-world “this will block close” and “this must be auditable” constraints:

- **Close is not always allowed**: real procedures require reconciliation when there are **outstanding liabilities** (e.g., rim credit / unsettled items). You need a *close guardrail* + a *forced close* escape hatch with explicit audit.
- **Closed is not one thing**: add `close_reason` so reporting and ops don’t treat “maintenance close” like “end-of-shift close.”
- **Actor attribution**: lifecycle transitions must persist “who did it,” not just rely on generalized audit logs.
- **Active time semantics**: formally define how active seconds are computed per window with pause overlap.
- **Gaming day alignment**: rollover should remain compatible with gaming day boundaries (especially for non-midnight gaming day starts).

Below is a tight delta patch: add 3 small sections, adjust ACs, add 1–2 optional RPC variants, and introduce minimal enums/flags.

---

## 1) Audit findings (gaps)

### Gap A — Close/rollover does not address outstanding liabilities (hard operational reality)
PRD-038A defines close/rollover, but does not define any “cannot close until reconciled” guardrail. In practice, closing with outstanding items (e.g., rim credit) triggers special procedures and reconciliations; software must at least be able to **block close** or **mark reconciliation required** when an override occurs.

**Risk if omitted:** operators will close sessions that are operationally “invalid,” your deltas will look “correct” but the pit will distrust the product and accounting will hate it.

### Gap B — Closed is underspecified (missing `close_reason`)
A table closes for many reasons. “Closed” is a terminal state, but the **reason** affects downstream expectations, reconciliations, and reporting.

**Risk if omitted:** support tickets like “why does this table show as closed—was it end-of-shift or just a dealer swap?”

### Gap C — Actor attribution is not first-class
You mention audit posture, but don’t require storing actor IDs on lifecycle transitions.

**Risk if omitted:** audit log alone is often insufficient; reports and incident reviews want attribution embedded in the record you’re looking at (especially when audit logs are filtered/partitioned).

### Gap D — “In play in window” is described but not defined
You say pauses “may be excluded.” That’s not tight enough to implement deterministically.

**Risk if omitted:** inconsistent DPH/rates and “why did my numbers change?” moments.

### Gap E — Gaming day alignment
Your platform already has gaming day logic. Lifecycle should not create ambiguity when rollover happens near gaming day boundary.

**Risk if omitted:** reporting drift, hard-to-debug issues across shifts and gaming day cutover.

---

## 2) Suggested additions (minimal, does not expand EXEC-038 surface area)

### Add 2.1 — Lifecycle Transition Rules (explicit)
Add a short table so UI and services cannot invent illegal transitions.

### Add 2.2 — Close Guardrails + Forced Close (compliance-friendly)
- Default: **reject close** if unresolved liabilities exist.
- Escape hatch: **forced close** (privileged roles only), sets `requires_reconciliation=true`, emits audit.

This can be modeled without implementing full fills/credits: just a generic “unresolved_items” concept.

### Add 2.3 — Actor Attribution fields
Store actor IDs per transition:
- `opened_by_staff_id`, `activated_by_staff_id`, `paused_by_staff_id`, `resumed_by_staff_id`, `closed_by_staff_id`, `rolled_over_by_staff_id`
These can be optional columns or derived fields stored in metadata JSON. Prefer columns if SRM allows.

### Add 2.4 — Window Active Time Definition
Define:
- `active_seconds_in_window = overlap(session, window) - overlap(pause_intervals, window)`
and require the metrics RPC to use it for rate denominators.

### Add 2.5 — Close Reason
Add:
- `close_reason enum` (or text constrained by check), with a minimal list.

### Add 2.6 — Gaming day alignment note
Ensure rollover records gaming day on both sides and flags cross-boundary handoff.

---

## 3) Delta patch (copy/paste sections into PRD-038A)

> Insert the following new subsections and AC changes into PRD-038A.

### 3.1 NEW — Section 6.3 Lifecycle transition rules

Add after **6.2 Per-table deltas semantics**:

#### 6.3 Lifecycle transition rules

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

---

### 3.2 NEW — Section 6.4 Close guardrails & forced close

Add after **6.3**:

#### 6.4 Close guardrails & forced close

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

---

### 3.3 NEW — Section 7.2 Lifecycle attribution fields

Add after **7.1 Pause intervals storage**:

#### 7.2 Lifecycle attribution fields

To support auditability, the system MUST record actor attribution for lifecycle transitions.

Minimum required attribution fields (either as columns or immutable metadata stored on session):
- `opened_by_staff_id`
- `activated_by_staff_id`
- `paused_by_staff_id` (latest)
- `resumed_by_staff_id` (latest)
- `closed_by_staff_id`
- `rolled_over_by_staff_id`

---

### 3.4 CHANGE — Tighten FR-7 “in play” semantics

Replace **FR-7** with:

**FR-7: Table participation in a window (formal definition)**
Per-table deltas and per-table metrics MUST define participation as:

- Session overlaps the window: `overlap_seconds(session, window) > 0`
- Active seconds in window are computed as:

`active_seconds_in_window = overlap_seconds(session, window) - overlap_seconds(pause_intervals, window)`

Rules:
- Clamp to `>= 0` (never negative).
- Rate metrics (DPH, etc.) MUST use `active_seconds_in_window` as denominator.
- If `active_seconds_in_window == 0`, label the table as “Closed this window” (distinct from “0 activity”).

---

### 3.5 NEW — Section 6.5 Close reason

Add after **6.4**:

#### 6.5 Close reason

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

---

### 3.6 NEW — Section 6.6 Gaming day alignment

Add after **6.5**:

#### 6.6 Gaming day alignment

**FR-14: Gaming day provenance**
Close and rollover MUST persist gaming day provenance:
- Store `gaming_day` (or computed equivalent) on the session close snapshot and on the newly opened session.
- If rollover crosses a gaming day boundary, set `crossed_gaming_day = true` on the rollover provenance.

---

## 4) Acceptance criteria updates (delta)

Add / amend in **Section 10**:

- **AC-6 (new): Close guardrail**
  - Attempting to close/rollover a session with unresolved liabilities is rejected with a clear error.
- **AC-7 (new): Forced close**
  - Forced close is permitted only for privileged roles, sets `requires_reconciliation=true`, and emits `audit_log`.
- **AC-8 (new): Close reason**
  - Close persists `close_reason`; if `other`, note is required.
- **AC-9 (new): Window active seconds**
  - Given a session overlapping a window with pauses, `active_seconds_in_window` matches overlap math and is used by rate metrics.

---

## 5) Implementation notes (how to keep this KISS)

- You do **not** need to implement full rim-credit / marker workflows now. Model “unresolved liabilities” as:
  - a boolean `has_unresolved_items` set by other domains later, or
  - a cheap `unresolved_item_count` placeholder, or
  - a future hook to Finance/MTL/Loyalty domains.
- Forced close should be rare but must exist, otherwise humans will do human things and your data will rot.
- If you keep pause intervals as JSONB (Option A), disallow edits except through RPCs and treat them as append-only (except closing the open interval).

---

## 6) References (online lifecycle/procedure context)

- Nevada Gaming Control Board: Minimum Internal Control Standards (Table Games) — closing procedures and special handling when closing with outstanding credit (rim) and reconciliation expectations.
- Washington Administrative Code (WAC 230-15): opening/closing table procedures; count recorded on slips; surveillance monitoring.
- Federal (25 CFR Part 542): definitions and internal controls constructs for table inventory forms at beginning/end of shift.

(Links intentionally omitted, research the web if required)

---
title: "PRD: Table Session Lifecycle — MVP Slice"
doc_id: "PRD-TABLE-SESSION-LIFECYCLE-MVP"
version: "v0.1.0"
status: "DRAFT"
date: "2026-01-15"
owner: "TableContext"
audience: ["Engineering", "Ops"]
depends_on:
  - "SRM v4.0.0 (2025-12-06) (canonical bounded-context ownership)"
  - "ADR-024 RPC Self-Injection (set_rls_context_from_staff)"
  - "GAP Analysis: Table Rundown → Shift Dashboards Data Pipeline (bridge + telemetry semantics complete)"
related_docs:
  - "ADDENDUM_TABLE_RUNDOWN_READMODEL_v0.3_PATCH.md"
  - "PRD-SHIFT-DASHBOARDS-v0.2-*"
---

# 1. Executive Summary

This PRD defines the **MVP Table Session Lifecycle** for PT‑2: a minimal, operationally useful state machine that creates **session boundaries** for a gaming table, so downstream systems can attribute telemetry and rundown artifacts to the correct table/shift/gaming day without ambiguous “floating” events.

This ships **after** the Table Rundown → Shift Dashboards **ingestion gaps are filled** (telemetry bridge + manual grind logging). It intentionally avoids expanding into “full rundown enterprise accounting.”

---

# 2. Problem Statement

Today, shift dashboards can ingest buy-in telemetry, but the system lacks a **first-class session object** that answers:

- “When did this table session start and end?”
- “Which telemetry rows belong to *this* session vs a prior/next session?”
- “What is the authoritative closing snapshot (drop + ending inventory) for the session?”
- “Which session is currently active on this table?”

Without session boundaries, rollups become “best effort” guesses. That is fine for a prototype; it’s not acceptable for an MVP that must support real shift operations.

---

# 3. Goals

**G1. Session boundaries exist and are queryable**
- A table can be “opened” into a session, and later “closed.”
- Exactly one *active* session per table at a time (per casino).

**G2. Session anchors the shift pipeline**
- Telemetry events can be attributed to a specific session (directly or via time range + table id).
- Shift dashboards can derive session-scoped totals (buy-ins, drop, win/loss estimate).

**G3. Minimal operator workflow**
- Pit boss can open/close a session quickly.
- Rundown phase exists as an explicit “closing in progress” state.

**G4. Auditability**
- Session state changes are logged (via existing audit_log patterns).

---

# 4. Non-Goals (Explicit)

- Full “rundown accounting” with every real-world edge case (breaks, re-opens, partial drops).
- Soft count integration (count room) — still operationally important, not in this slice.
- Promotional instrument accounting (matchplays/coupons) — separate dimension, separate PRD.
- Retroactive backfills / historical reconstruction (we’re still dev; no production legacy to preserve).

---

# 5. Users / Personas

- **Pit Boss / Shift Supervisor**
  - Opens/closes table sessions.
  - Needs quick, low-click workflows.

- **Floor Staff**
  - Might initiate rundown state, but final close belongs to Pit Boss in MVP.

---

# 6. Definitions

- **Session**: a continuous period of table operation that the system treats as one unit for shift reporting.
- **Rundown**: “closing in progress,” where final totals and snapshots are captured before locking.

---

# 7. MVP State Machine

## 7.1 States (Minimum Set)

- `OPEN` — session created, table marked open for play.
- `ACTIVE` — table in active operation (may be implicit; see transitions).
- `RUNDOWN` — closing procedures in progress.
- `CLOSED` — finalized; immutable for MVP (no reopen).

> Note: You can collapse `OPEN` + `ACTIVE` if you really want. Keeping `RUNDOWN` is non-negotiable because it makes close workflows sane.

## 7.2 Allowed Transitions

1) `OPEN → ACTIVE`
- automatic on first telemetry event OR manual toggle (implementation choice)

2) `ACTIVE → RUNDOWN`
- pit boss starts rundown

3) `RUNDOWN → CLOSED`
- pit boss finalizes with required fields present

## 7.3 Invariants

- Exactly one `OPEN|ACTIVE|RUNDOWN` session per `(casino_id, gaming_table_id)` at any time.
- `CLOSED` sessions are immutable in MVP (no updates except append-only notes if needed).
- Every session belongs to exactly one `gaming_day` (computed via `compute_gaming_day()` / casino_settings).

---

# 8. Data Model (High-Level)

> SRM v4.0.0 owns TableContext: this model lives there.

## 8.1 New Table: `table_session` (proposed)

**Required columns (MVP):**
- `id uuid pk`
- `casino_id uuid not null`
- `gaming_table_id uuid not null`
- `gaming_day date not null`
- `shift_id uuid null` *(optional in MVP; add if shift is first-class in schema)*
- `status enum('OPEN','ACTIVE','RUNDOWN','CLOSED') not null`
- `opened_at timestamptz not null`
- `opened_by_staff_id uuid not null`
- `rundown_started_at timestamptz null`
- `rundown_started_by_staff_id uuid null`
- `closed_at timestamptz null`
- `closed_by_staff_id uuid null`

**Closing snapshot hooks (MVP):**
- `opening_inventory_snapshot_id uuid null` *(or JSON snapshot if you must; prefer link)*
- `closing_inventory_snapshot_id uuid null`
- `drop_event_id uuid null` *(or link to drop artifact)*
- `notes text null`
- `metadata jsonb null` *(only for temporary extension; keep minimal)*

## 8.2 Indices / Constraints (MVP)

- `unique_active_session_per_table`
  - unique on `(casino_id, gaming_table_id)`
  - **where** `status in ('OPEN','ACTIVE','RUNDOWN')`

- index on `(casino_id, gaming_day, gaming_table_id, status)` for rollups

---

# 9. Functional Requirements

## FR1 — Open Session
- Pit boss can create a session for a table.
- System enforces “only one active session per table.”

## FR2 — Start Rundown
- Pit boss can transition session into `RUNDOWN`.

## FR3 — Close Session
- Pit boss can close a session from `RUNDOWN` (or `ACTIVE` if you allow shortcut).
- Close requires:
  - `closed_at`, `closed_by_staff_id`
  - at least one closing artifact link present (drop OR closing inventory snapshot) in MVP.
    - (exact required set depends on what artifacts exist already)

## FR4 — Query Current Session
- UI + rollups can fetch “current session for this table.”

## FR5 — Immutability
- Once `CLOSED`, session fields are immutable in MVP (except append-only notes if needed).

---

# 10. Integration Requirements

## IR1 — Telemetry attribution
After the ingestion gaps are filled, telemetry will exist.

MVP attribution strategy:
- Preferred: telemetry rows include `table_session_id` (write-time binding).
- Acceptable MVP fallback: attribute by `(casino_id, gaming_table_id)` + `observed_at between opened_at and closed_at`.

**Do not** ship a system where telemetry floats without either:
- a direct session link, or
- a deterministic time-window join.

## IR2 — Shift dashboards rollups
Dashboards should be able to compute per session:
- total rated buy-in telemetry
- total grind buy-in telemetry
- drop total (if linked)
- derived win/loss estimate (if formula defined)

---

# 11. API / RPC Requirements (ADR-024 compliant)

All RPCs:
- `PERFORM set_rls_context_from_staff();`
- Accept **no** spoofable `casino_id`/`actor_id`.
- Use `current_setting('app.casino_id')` and `current_setting('app.actor_id')`.

## RPC List (MVP)

1) `rpc_open_table_session(p_gaming_table_id uuid) -> table_session`
2) `rpc_start_table_rundown(p_table_session_id uuid) -> table_session`
3) `rpc_close_table_session(p_table_session_id uuid, p_drop_event_id uuid null, p_closing_inventory_snapshot_id uuid null, p_notes text null) -> table_session`
4) `rpc_get_current_table_session(p_gaming_table_id uuid) -> table_session`

---

# 12. Security / RLS

- Row ownership scoped by `casino_id` (RLS via `app.casino_id` session variable/JWT fallback as per project pattern).
- Only staff roles allowed to mutate:
  - MVP: `pit_boss` (and `admin`) can open/close.
  - read allowed to relevant ops roles.

Add explicit policy statements in the implementation spec, not here.

---

# 13. UI/UX (MVP)

## Table screen actions
- **Open Session** (only if no active session exists)
- **Start Rundown** (only if ACTIVE/OPEN)
- **Close Session** (only if RUNDOWN, or ACTIVE if shortcut allowed)
- **Current Session banner** (status + opened_at + who)

## Anti-footgun UI
- Disable “Open Session” if active exists.
- Close flow must surface required closing artifacts (drop / inventory snapshot).

---

# 14. Observability

Track:
- session opens/closes per day
- average session duration
- % sessions closed without drop link (should trend to zero)
- rollup mismatches (telemetry without session attribution)

---

# 15. Risks & Mitigations

- **Scope creep into full accounting**
  - Mitigation: enforce non-goals; only minimum snapshot linking.

- **Telemetry/session mismatch**
  - Mitigation: require either session_id binding or deterministic time-window join.

- **Reopen/edit pressure**
  - Mitigation: MVP immutability; use append-only audit notes if needed.

---

# 16. Definition of Done (DoD)

A) **DB**
- `table_session` exists with constraints for unique active session.
- Basic RLS policies in place.

B) **RPC**
- Open / Start Rundown / Close / Get Current implemented and ADR-024 compliant.
- Fail-closed on missing context (no “best effort” tenant guessing).

C) **UI**
- Pit boss can open, rundown, close session from table screen.
- UI prevents illegal transitions.

D) **Dashboards**
- Shift dashboards can attribute telemetry to sessions (session_id or deterministic time join).
- A closed session produces stable rollup totals.

E) **Tests**
- Unit/integration tests for state transitions and constraint enforcement.
- RLS tests for role-based mutation.

---

# 17. Acceptance Scenarios (MVP)

1) **Happy path**
- Open → Active (implicit) → Rundown → Closed
- Telemetry generated during active window rolls up into session totals.

2) **Double-open prevention**
- Attempt to open a second session for the same table fails deterministically.

3) **Close without required artifacts**
- Close attempt fails unless drop or closing inventory snapshot is provided (per MVP rule).

4) **RLS enforcement**
- Non-authorized role cannot open/close sessions.

---

# 18. Sequencing (Post-Gap Execution)

This PRD is executed **after**:
- Rated buy-in bridge exists (Finance → telemetry)
- Manual grind logging exists (unrated telemetry)
- Telemetry semantics (RATED_BUYIN vs GRIND_BUYIN) are enforced

Then:
- Implement session model + RPCs
- Update telemetry attribution to bind to session if needed
- Update shift rollups to prefer session_id attribution


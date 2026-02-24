---
doc: "ADR Audit"
target: "ADR-038-rundown-persistence-finalization-contract"
date: "2026-02-24"
status: "Review (Pass 2)"
---

# Audit (Pass 2): ADR-038 — Rundown Persistence & Finalization Contract

Source: **ADR-038-rundown-persistence-finalization-contract.md** fileciteturn3file0

## Verdict

**Accept with a short patch.**  
The ADR is now structurally strong: it specifies invariants, defines the partial unique index, removes corruption-masking patterns, and clarifies finalization. What remains is mostly **enforceability** and **operational definition** (how late-event visibility is implemented, how roles are sourced, and making session linkage explicit on raw events).

---

## What’s solid (keep)

- **D1:** Atomic increments inside the same SECURITY DEFINER RPC, with fail-loud session resolution and an explicit “one active session per table” invariant.
- **Index specified:** You define the partial unique index for active sessions (major drift prevention).
- **D2:** UPSERT keyed by `(table_session_id)` with deterministic recompute + provenance update.
- **D3:** Finalization is report-level immutability (not a new session state); finalize requires session `CLOSED`; no unfinalize in MVP.
- **Invariants + Required Tests:** This is the right anti-drift move—keep it.

---

## Remaining issues to tighten

### 1) Index naming vs enforcement

Your index name may drift over migrations. Don’t tie governance to the name unless you mean to.

**Patch:**
- Add: “Schema tests MUST verify the index by **predicate/columns**, not only by name.”  
  (Or explicitly treat renames as breaking changes.)

### 2) Session linkage must be persisted on raw events (not just resolvable)

ADR implies fills/credits are “deterministically resolvable” at insert time, but D1 does not explicitly require writing `session_id` onto the fill/credit row. Without that FK, reconciliation and late-event detection become fragile.

**Patch (important):**
- In D1 canonical pattern: resolve `v_session_id`, then INSERT the fill/credit row with `session_id = v_session_id`, then increment totals.
- Add: “Resolution-by-index is **insertion-time only**; downstream reconciliation MUST rely on stored `session_id`.”

### 3) Late-event visibility: define the mechanism

ADR requires audit_log entries and a UI badge when late events occur, but does not define how the UI determines “late events exist.”

**Patch (pick one):**
- **A (flag on report):** set `table_rundown_report.has_late_events = true` in the fill/credit RPC when finalized report exists.
- **B (audit-log derived):** UI badge is computed by `EXISTS` query over `audit_log` for `LATE_EVENT_AFTER_FINALIZATION`.
- **C (counter):** maintain `late_event_count` on the report, incremented by RPC.

### 4) Immutability statements need GRANT/REVOKE consequences

“no UPDATE/DELETE policy exists” is not an enforceable posture unless you also state privileges. Same for finalized report immutability.

**Patch:**
- State concrete controls:
  - `REVOKE UPDATE, DELETE ON shift_checkpoint FROM authenticated`
  - `REVOKE UPDATE, DELETE ON table_rundown_report FROM authenticated`
  - Only GRANT EXECUTE on required RPCs

### 5) Role gate: standardize the source of `app.staff_role`

You note role values must match `public.staff_role`, but you should pin down where `app.staff_role` comes from (context RPC) to prevent string drift.

**Patch:**
- Add one line: “`app.staff_role` is set by `set_rls_context` from `public.staff.staff_role` and is authoritative for auth checks.”

### 6) Make the report lifecycle explicit (prevents UI drift)

You implicitly have:
- report absent
- report present (draft)
- report finalized

**Patch:**
- Add a short **Rundown Report Lifecycle** section with allowed transitions.

### 7) `compute_gaming_day` should be specified as a contract, not a signature

If the function signature changes, the ADR becomes inconsistent.

**Patch:**
- Reword: “`gaming_day` is derived server-side via `compute_gaming_day` using casino_settings.timezone + gaming_day_start; implementation may be SQL function or RPC.”

### 8) Error-code → HTTP mapping should be explicit

Client code will depend on this, and implementers will otherwise guess.

**Patch:**
Add a small mapping table, e.g.:
- `TBLRUN_ALREADY_FINALIZED` → 409
- `TBLRUN_SESSION_NOT_CLOSED` → 409 (or 400; pick one)
- `FORBIDDEN` → 403
- `NO_DATA_FOUND` → 404 (or 409; pick one)

---

## Minimal patch list to reach “Accepted”

1. Require persisting `session_id` on fill/credit rows (D1).
2. Define the late-event badge mechanism (flag/audit query/counter).
3. Add explicit GRANT/REVOKE posture for checkpoint + rundown tables.
4. Define authoritative source for `app.staff_role`.
5. Add error-code mapping table.

---

## Final note (non-negotiable)

Invariant “session totals == SUM(raw events)” only holds if raw events are **correctly session-linked**. If you leave session linkage implicit, your reconciliation test becomes a liar’s test.


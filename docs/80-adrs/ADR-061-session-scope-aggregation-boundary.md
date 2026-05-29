---
id: ADR-061
title: Session-Scope Aggregation Boundary
status: Proposed
date: 2026-05-28
owner: Architecture Review
decision_scope: >
  Canonical aggregation scope for telemetry_derived_drop_estimate_cents;
  open-session upper-bound semantics; gaming_day as lifecycle metadata only;
  exclusion of rpc_shift_table_metrics as a telemetry source;
  null-SUM semantics and index coverage confirmation
triggered_by: >
  RFC-007 Phase 4 ADR requirement (Section 7, ADR-C).
  Closes audit finding session_scope_aggregation_boundary.
  Gaming-day aggregation has historically been confused with session-scope
  in this codebase. The scaffold predicate alone is not a durable decision record.
scope_authority: FIB-H-TIA-CANON-001 v1 (frozen 2026-05-27)
related:
  - ADR-052
  - ADR-053
  - ADR-059
  - ADR-060
  - docs/02-design/RFC-007-table-inventory-accounting-canonization.md
  - docs/issues/table-inventory-accounting-canon/planning/FIB-H-TIA-CANON-001-classification.yaml
  - docs/01-scaffolds/SCAFFOLD-TABLE-INVENTORY-ACCOUNTING-CANON.md
---

# ADR-061: Session-Scope Aggregation Boundary

## 1. Context

`telemetry_derived_drop_estimate_cents` is the drop-like input to the canonical table win/loss formula (ADR-059 D2). It is derived from a SUM over `table_buyin_telemetry`. The question this ADR must close is: **what rows does that SUM cover?**

Two aggregation scopes exist in the codebase and they produce different numbers for the same table:

- **Session scope:** rows where `occurred_at` falls within the specific table session's `opened_at`–`closed_at` window. One session, one table, bounded timestamps.
- **Gaming-day scope:** rows where `gaming_day` matches the current gaming day, potentially spanning multiple sessions at the same table and multiple tables within a shift.

`rpc_shift_table_metrics` — the only existing aggregation of `table_buyin_telemetry` — uses gaming-day scope (caller-supplied `p_window_start`/`p_window_end` parameters set to gaming-day boundaries). It also COALESCEs the SUM result to 0, which conflates "zero qualifying rows" with "qualifying rows that summed to zero" — semantically distinct states (ADR-059 D2).

The two scopes are not equivalent. A gaming-day window can commingle telemetry from multiple consecutive sessions at the same table; it includes buy-ins from other sessions that happened to fall on the same gaming day. That produces a value that is neither session-authoritative nor per-session-comparable. It is the wrong input for a per-session `TableInventoryAccountingProjection`.

The scaffold §4 froze the session-scoped predicate on 2026-05-27. This ADR makes that freeze a durable decision record, closes audit finding `session_scope_aggregation_boundary`, and explicitly prohibits gaming-day scope from re-entering the formula path.

---

## 2. Decisions

### D1 — Session Scope Is the Canonical and Exclusive Scope

`telemetry_derived_drop_estimate_cents` must be derived from a session-scoped aggregate of `table_buyin_telemetry`. Gaming-day aggregation is **explicitly forbidden** for this field in this slice and in all follow-on slices unless a superseding ADR is adopted.

A session and a gaming day are not the same scope. Sessions belong to gaming days, but a gaming day contains many sessions across many tables. Session-scope isolates the telemetry to the specific table session being accounted. Gaming-day scope commingles it. The formula in ADR-059 D2 is a per-session formula; its inputs must be per-session.

---

### D2 — Frozen Aggregation Predicate

The following SQL predicate is the canonical and complete definition of `telemetry_derived_drop_estimate_cents`. It is frozen. No deviation is permitted without an ADR amendment.

```sql
telemetry_derived_drop_estimate_cents =
  SUM(tbt.amount_cents)
  FROM table_buyin_telemetry tbt
  WHERE tbt.casino_id     = ts.casino_id
    AND tbt.table_id      = ts.gaming_table_id
    AND tbt.telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
    AND tbt.occurred_at  >= ts.opened_at
    AND tbt.occurred_at  <  COALESCE(ts.closed_at, NOW())
  -- ts = the table_session row for this session
  -- casino_id equality activates the leading index columns of idx_tbt_kind
  -- and hardens tenant scoping (RLS context already enforces this; the predicate makes it explicit)
```

The `telemetry_kind` filter is exhaustive and governed by ADR-060 D2. The `occurred_at` bounds are governed by this ADR. No other predicate clause may be added to widen or narrow the window without amendment.

`RATED_ADJUSTMENT` is intentionally absent from this predicate. Its absence is a canonical exemplar decision, not an assertion that legacy/current schema paths cannot contain that value. Current shift-metrics or compatibility paths that accept `RATED_ADJUSTMENT` are non-canonical for `telemetry_derived_drop_estimate_cents`; they must not be copied into `TableInventoryAccounting` without an ADR/FIB amendment.

---

### D3 — Open-Session Upper Bound: `COALESCE(closed_at, NOW())`

For sessions that have not yet been closed (`closed_at IS NULL`), the upper bound of the telemetry window is `NOW()`. This is the canonical semantic: **an open session's telemetry window extends to the current moment.**

The upper bound is **not** the end of the gaming day, not midnight, not the gaming-day boundary derived from `compute_gaming_day()`. Those are temporal constructs belonging to the gaming-day lifecycle (TEMP-001/002). They have no role in bounding a session's telemetry window.

When `closed_at` is set (session closed), the upper bound becomes that timestamp. `COALESCE(closed_at, NOW())` expresses this without branching.

In PostgreSQL, `NOW()` is transaction-stable — it returns the transaction start time for the duration of the transaction. Implementation must evaluate the open-session upper bound once per derivation request using transaction-stable `NOW()` or an equivalent captured timestamp. It must not re-evaluate the bound across multiple statements within a single derivation to avoid drift.

---

### D4 — `gaming_day` Is Lifecycle Metadata, Not a Scope Boundary

`table_session.gaming_day` is set by trigger (`trg_table_session_gaming_day`) via `compute_gaming_day(opened_at, ...)` at session creation. It records which gaming day the session belongs to for reporting and lifecycle purposes.

It must not be used as an aggregation window bound for `telemetry_derived_drop_estimate_cents`. The aggregation window is defined by `opened_at` / `COALESCE(closed_at, NOW())` — wall-clock timestamps from the session row. Using `gaming_day` as a predicate instead of or in addition to `occurred_at` timestamps would silently widen the window to include telemetry from other sessions on the same gaming day.

`gaming_day` may appear as an identity/context field in the `TableInventoryAccountingProjection` DTO (per ADR-059 D3 — identity fields are PRD/EXEC additions). It may not appear in the telemetry SUM predicate.

---

### D5 — `rpc_shift_table_metrics` Is an Excluded Source

`rpc_shift_table_metrics` must not be used as the source for `telemetry_derived_drop_estimate_cents`. It has two disqualifying properties:

1. **Wrong scope:** Its telemetry aggregation uses caller-supplied `p_window_start`/`p_window_end` parameters. When invoked for a shift, those parameters are set to gaming-day boundaries — not the session window. The result is a gaming-day aggregate, not a session aggregate.

2. **Forbidden null coalescion:** It applies `COALESCE(SUM(...), 0)` to the telemetry total. This conflates "no qualifying rows" (which must produce NULL → `drop_estimate_state = 'none_for_session'`) with "qualifying rows summing to zero" (a genuine zero value). This COALESCE is forbidden by ADR-059 D2 and ADR-060 D5.

The new `TableInventoryAccounting` service module must implement the session-scoped SUM independently, reading `opened_at`/`closed_at` directly from the `table_session` row. It must not delegate to or wrap `rpc_shift_table_metrics`.

`rpc_compute_table_rundown` has no telemetry aggregation at all in its current implementation — the implementation gap this slice closes. It is not an excluded source; it is the BFF route that will be updated to call `TableInventoryAccountingService.deriveProjection()`.

---

### D6 — Null SUM Semantics and Index Coverage

**Null semantics:** SQL `SUM` over zero qualifying rows returns `NULL`, not `0`. This null must not be COALESCEd to 0 anywhere in `TableInventoryAccounting` or its callers. `NULL` means no qualifying `RATED_BUYIN` or `GRIND_BUYIN` rows exist for this session window — a normal operational state for unrated sessions. It triggers `drop_estimate_state = 'none_for_session'` per ADR-059 D2. `0` means qualifying rows exist and their amounts summed to zero — a distinct claim. The two must not be conflated.

**Index coverage (RFC-007 §8 open question 1 — closed here):** The existing index `idx_tbt_kind` on `(casino_id, table_id, telemetry_kind, occurred_at)` directly supports the canonical predicate. The leading `casino_id + table_id` columns match the equality predicates; `telemetry_kind` matches the `IN` filter; `occurred_at` supports the range scan. No new migration is required at exemplar baseline to support the session-window query at shift scale (O(10) concurrent tables per pit).

---

## 3. Consequences

### Positive

- The session-scope freeze prevents gaming-day aggregation from re-entering the formula path via a future EXEC-SPEC or optimization pass. The audit finding `session_scope_aggregation_boundary` is closed at the ADR layer, not just in a scaffold comment.
- Explicit exclusion of `rpc_shift_table_metrics` removes the path of least resistance that an implementor would otherwise take (it is the only existing `table_buyin_telemetry` aggregation).
- Closing RFC-007 §8 open question 1 (index coverage) eliminates the last blocker between this ADR set and the PRD gate.

### Trade-offs

- The `TableInventoryAccounting` service module must implement its own session-scoped SUM rather than reusing an existing RPC. This is intentional: reuse of a gaming-day-scoped aggregation would be a scope violation, not a simplification.
- For long-running open sessions, `COALESCE(closed_at, NOW())` means the upper bound advances with wall-clock time on every request. This is correct behaviour — the projection reflects the current session state — but callers must not cache the result across requests without considering this.

---

## 4. Rejected Alternatives

### Option C2 — Gaming-Day Scope

Use `gaming_day` as the aggregation boundary, joining `table_buyin_telemetry.gaming_day = table_session.gaming_day`.

**Rejected because:** A gaming day contains many sessions across many tables. A gaming-day aggregate for a specific table commingles telemetry from all sessions at that table on the same gaming day. The result is not a per-session drop estimate — it is a shift-level or day-level aggregate being used as a session input. That produces a systematically inflated `projected_table_win_loss_cents` for every session after the first on a given table per gaming day. This is precisely the scope confusion the codebase already exhibits in `rpc_shift_table_metrics`, which this ADR set exists to correct.

### Use `rpc_shift_table_metrics` with a session-scoped window override

Pass `p_window_start = opened_at` and `p_window_end = COALESCE(closed_at, NOW())` to `rpc_shift_table_metrics` to reuse its telemetry aggregation with a narrower window.

**Rejected because:** The RPC was not designed for per-session invocation and returns a wide result type that includes gaming-day-scoped fields and win/loss computations that would require stripping. More critically, it applies `COALESCE(SUM(...), 0)` unconditionally — that transformation cannot be undone by the caller. The null semantics of the result would be permanently corrupted before the service module could inspect them. The `TableInventoryAccounting` module must own its own session-scoped SUM with correct null-passthrough.

---

## 5. Out of Scope

- Fills and credits aggregation scope — governed by `table_session_id` FK join with no scope ambiguity; not a subject of this ADR.
- Session-scope conventions for tables other than `table_buyin_telemetry` — the scope of this ADR is the telemetry aggregation window only.
- `rpc_shift_table_metrics` correctness or remediation — its gaming-day scope is correct for its own purpose (shift-level metrics); this ADR only prohibits its use as a source for `telemetry_derived_drop_estimate_cents`.
- Gaming-day temporal authority and `compute_gaming_day()` governance — owned by TEMP-001/002/003 and CasinoService.
- PRD acceptance criteria and implementation sequencing.

---

## 6. Closing Statement

A session is not a gaming day.

> A gaming day is a container. A session is its contents.
> Aggregating across the container when you need the contents
> produces a number that is neither wrong nor right — it is the wrong question answered precisely.

The existing `rpc_shift_table_metrics` answered the right question for shift-level reporting. This ADR ensures the accounting projection asks a different question — per-session, bounded by wall-clock timestamps — and that no future implementor mistakes the two for the same answer.

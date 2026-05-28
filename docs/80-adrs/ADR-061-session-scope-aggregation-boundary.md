---
id: ADR-061
title: Session-Scope Aggregation Boundary for Table Inventory Accounting
status: Proposed
date: 2026-05-27
owner: Architecture Review
decision_scope: |
  Declares that telemetry_derived_drop_estimate_cents is scoped to the table session window
  (opened_at / COALESCE(closed_at, NOW())), and that gaming-day aggregation is explicitly forbidden
  for this field and for any future TableInventoryAccountingProjection derivation.
triggered_by: |
  FIB-H-TIA-CANON-001 — RFC-007 open question §8.3 flagged that gaming-day vs. session scope
  confusion has historically recurred in this codebase and that the scaffold predicate alone is not
  a durable decision record. RFC-007 Phase 4 ADR-C candidate.
related:
  - ADR-059  # cross-references this ADR in §2.2 for session boundary enforcement
  - ADR-060
  - docs/issues/table-inventory-accounting-canon/planning/FIB-H-TABLE-INVENTORY-ACCOUNTING-CANONIZATION-v1-exemplar.md
  - docs/02-design/RFC-007-table-inventory-accounting-canonization.md
supersedes: []
---

# ADR-061: Session-Scope Aggregation Boundary for Table Inventory Accounting

## 1. Context

`table_buyin_telemetry` stores buy-in events with an `occurred_at` timestamp. When computing
`telemetry_derived_drop_estimate_cents`, the aggregation predicate must be bounded to events that
occurred within the specific table session window (`opened_at` to `COALESCE(closed_at, NOW())`).

An alternative — gaming-day aggregation — would sum all telemetry events for a table within a
gaming day, regardless of session boundary. This has historically been confused with session-scope
in this codebase for two reasons:

1. Dashboard widgets were written before `table_session` provided explicit session windows, leading
   to gaming-day SUM as a proxy for "all activity today."
2. "Drop" in casino parlance often refers to a gaming-day total (the physical box removal at end of
   day), so developers have defaulted to day-scope when domain intent was ambiguous.

The `TableInventoryAccountingProjection` completeness envelope (ADR-059) is defined per session. A
gaming-day aggregation would commingle telemetry from multiple sessions within the same day,
violate the per-session completeness invariant, and produce incorrect projections when a table runs
more than one session per gaming day.

---

## 2. Decision

### 2.1 Aggregation scope is session-bounded (frozen)

`telemetry_derived_drop_estimate_cents` must be derived using a session-scoped predicate:

```
occurred_at >= table_session.opened_at
AND occurred_at < COALESCE(table_session.closed_at, NOW())
AND table_id = <current session table_id>
AND telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
```

This predicate is frozen. It must not be replaced with a gaming-day date truncation, an `opened_at`
floor without a `closed_at` ceiling, or any other unbounded aggregation.

### 2.2 Gaming-day aggregation is forbidden for this field

Computing `telemetry_derived_drop_estimate_cents` at gaming-day scope is forbidden. This applies to:

- The `TableInventoryAccountingService.deriveProjection()` implementation
- Any EXEC-SPEC, optimization pass, or materialization strategy derived from this module
- Any future BFF route that replaces or wraps `deriveProjection()`

A gaming-day aggregated version of telemetry drop, if needed for a separate analytical surface, must
be a different field with a different name under ADR-060 naming rules. It must not share a field
name or DTO slot with `telemetry_derived_drop_estimate_cents`.

### 2.3 Null semantics for closed sessions

For a session with `closed_at IS NULL` (open/active session), `COALESCE(closed_at, NOW())` bounds
the window at query time. This is the canonical handling — it does not commingle future events and
does not require the session to be closed before a projection can be derived.

`null` telemetry result (no rows matching the predicate) is mapped to `drop_estimate_state = 'none_for_session'`
and `telemetry_derived_drop_estimate_cents = null`. This is not coerced to zero.

---

## 3. Consequences

**Positive:**
- Per-session completeness invariant is enforced at the aggregation level, not just at the DTO type
  level. The `completeness.status` field in `TableInventoryAccountingProjection` can be trusted.
- Prevents a common regression: a future EXEC optimization that materializes projections must use the
  same session-scoped predicate or it violates this ADR.
- Auditable: the predicate is explicit and verifiable in code review without domain knowledge.

**Negative / constraints:**
- A table running multiple sessions per gaming day will produce a separate projection per session,
  not a combined daily result. This is by design — the day-level rollup is a different surface, not
  in scope for this slice.
- An analytical surface that needs gaming-day telemetry aggregation must use a separate field name
  and a separate derivation path. Reusing `telemetry_derived_drop_estimate_cents` with changed scope
  is a violation of both this ADR and ADR-060.

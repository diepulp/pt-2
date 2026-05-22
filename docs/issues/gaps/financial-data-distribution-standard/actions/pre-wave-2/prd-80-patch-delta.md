PRD-080 — Patch Delta (Pre-Wave-2 Surface Debt Closure)
1. Add Core Invariant (Section 2 or new §2.1)
### Core Invariant — Boundary Truthfulness

No financial value may cross a service or HTTP boundary without an explicit declaration of:

- authority (`type`)
- origin (`source`)
- completeness (`completeness.status`)

Exceptions: none within the scope of this PRD.

Any DTO or route response violating this invariant is non-conformant.
2. Tighten Modal Responsibility (Section 4 — Group B)
### Modal Route Constraint — Projection Only

The `modal-data` route is a projection layer.

It MAY:
- pass through `value`, `type`, and `source` unchanged
- override `completeness.status` using visit/slip lifecycle context

It MUST NOT:
- modify `value`
- modify `type` or `source`
- recompute or reinterpret financial authority

All arithmetic performed in the modal (e.g. `computedChipsOut`, `computedNetPosition`) remains UI-local and MUST NOT be emitted as `FinancialValue`.
3. Formalize Completeness Source (Section 5 — Functional Requirements)
### F-9 — Completeness Source of Truth

Completeness for visit-based aggregates MUST derive from `visit.status` only.

Rules:
- `OPEN` → `partial`
- `CLOSED` → `complete`
- lifecycle unavailable → `unknown`

No inference from:
- transaction counts
- timestamps
- derived arithmetic

All completeness decisions must be traceable to lifecycle state, not inferred heuristics.
4. Lock Cross-Context Consumer Behavior (Section 5 — Functional Requirements)
### F-10 — Cross-Context Consumer Discipline

All consumers reading wrapped financial fields MUST:

- explicitly unwrap via `.value` before arithmetic
- never pass `FinancialValue` objects into arithmetic operations
- never rely on implicit coercion

Violation of this rule is a correctness bug, even if TypeScript permits compilation.
5. Enforce Compliance Isolation (Section 5 — Functional Requirements)
### F-11 — Compliance Isolation Enforcement

`type: 'compliance'` values MUST NOT be aggregated with `actual` or `estimated` values.

Minimum enforcement requirement:
- at least one integration or unit test asserting that compliance values are rendered separately from operational/ledger aggregates

This replaces convention-based separation with test-enforced isolation.
6. Strengthen OpenAPI Constraint (Section 4 — Group E or Requirements)
### OpenAPI Constraint — No Parallel Legacy Fields

For all updated routes:

- No legacy bare-number currency fields may coexist with `FinancialValue` fields representing the same value.
- Each financial field must have a single canonical representation.

Any duplicate representation (e.g. `total_in` and `totalIn`) is non-conformant.
7. Add UI Rendering Constraint (Section 6 or Non-Functional)
### UI Rendering Constraint — No Ad-Hoc Formatting

All wrapped financial values MUST be rendered using a shared formatting pattern:

- `formatCents(field.value)` for value display
- visible authority label (`type`)
- visible completeness indicator (`completeness.status`)

Ad-hoc formatting (`toFixed`, manual `/100`, inline math formatting) is forbidden for wrapped values.
8. Clarify Wave 2 Dependency (Section 7 or 8)
### Wave 2 Dependency — Completeness Refinement

The use of `completeness.status = 'unknown'` for visit-based aggregates is a temporary constraint.

Wave 2 MUST introduce lifecycle-aware projections such that:
- standalone routes can emit `partial` vs `complete` without BFF overrides

Tracking: add to Wave 2 prerequisite register.
Net Effect

This patch:

removes ambiguity (modal, completeness, OpenAPI)
prevents silent regression (cross-context + UI)
adds minimal enforcement (compliance test)
keeps scope intact (no expansion)

No architectural change. Just locks the semantics so implementation can’t drift.
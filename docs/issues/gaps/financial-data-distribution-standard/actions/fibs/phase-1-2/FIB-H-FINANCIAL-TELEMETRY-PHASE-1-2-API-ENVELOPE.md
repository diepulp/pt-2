# FIB-H — Financial Telemetry Phase 1.2 — API Envelope at the Wire

status: AMENDED  
date: 2026-04-29  
amended: 2026-04-29  
owner: Financial Telemetry (Cross-context)

amendment_authority: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2/PRD-071-AUDIT.md
amendment_summary: >
  Guardrail audit split original Phase 1.2 into Phase 1.2A (transport stabilization, this FIB)
  and Phase 1.2B (canonicalization, PRD-074). BRIDGE-001 sunset, shift-intelligence DTO type
  promotion, formatCents UI migration, component tests, full 34-route OpenAPI expansion, and
  structured log observability are now Phase 1.2B scope. This FIB governs Phase 1.2A only.

parent:
- PRD-071 — Financial Telemetry Wave 1 Phase 1.2A (API Transport Stabilization)
- PRD-074 — Financial Telemetry Wave 1 Phase 1.2B (Service Canonicalization) — successor
- ROLLOUT-ROADMAP.md (Wave 1 — Surface Contract Rollout)
- PHASE-1.2-HANDOFF.md (Phase 1.1 close artifacts)

---

# A. Identity

**Feature Name:**  
Phase 1.2A — API Transport Stabilization

**Intent:**  
Verify that route handlers carry existing `FinancialValue` envelopes verbatim to the wire without flattening or re-authoring. Define the shared OpenAPI `FinancialValue` component. Author path entries for representative routes per family. Prove shape + pass-through correctness with route-boundary contract tests. Annotate deprecated fields with dated sunset notes in OpenAPI.

Phase 1.2A does **not** normalize units, change DTO types, perform UI migrations, or author the full 34-route OpenAPI inventory — those are Phase 1.2B (PRD-074) scope. The phase boundary is: if a change carries existing semantics to the wire, it is in scope; if it changes what the semantics are (unit, type, format), it is Phase 1.2B.

---

# B. Operator Problem

Phase 1.1 made the service layer honest. The HTTP boundary is not yet.

Clients consuming PT-2 financial routes currently receive one of three shapes:

1. **Bare numbers with no metadata** — shift-intelligence anomaly and alert routes, most table and shift routes. No authority label, no source, no completeness. Clients cannot distinguish estimated from actual, or complete from partial.

2. **FinancialValue at dollar-float precision** — visit surfaces (recent-sessions, live-view). Phase 1.1b wrapped these correctly, but the value is a dollar float rather than integer cents, `financialValueSchema.int()` is not enforced, and the wire contract is untested and undocumented in OpenAPI.

3. **Undocumented in OpenAPI entirely** — every in-scope route is Bucket B: absent from `docs/25-api-data/api-surface.openapi.yaml`. The spec says nothing about the envelope.

Until Phase 1.2 ships, a client has no machine-readable contract they can validate against, no guarantee that `type`, `source`, and `completeness.status` survive the route boundary, and no way to distinguish a truthful response from a silently flattened one. Phase 1.3 (UI) cannot build on an unproven transport contract.

---

# C. Pilot Fit

This feature is REQUIRED for pilot because:

- It proves the transport layer is a faithful pass-through — a prerequisite before Phase 1.2B changes what passes through
- It establishes the shared OpenAPI `FinancialValue` component and representative route documentation that Phase 1.3 UI work depends on
- It does NOT introduce:
  - new financial facts or calculations
  - new tables, RPCs, or database objects
  - Wave 2 outbox or dual-layer work
  - unit normalization or DTO type changes (Phase 1.2B)
- It aligns directly with Wave 1 objective:
  > make the system **honest at every boundary**, not just at the service layer

Note: BRIDGE-001 retirement and integer-cents enforcement are Phase 1.2B scope (PRD-074). Phase 1.2A documents the current dollar-float state accurately in OpenAPI rather than fixing it.

---

# D. Actor / Moment

**Actors:**
- API engineers reading or modifying route handlers
- Frontend engineers consuming financial routes
- External integrators reading OpenAPI
- QA engineers authoring or running contract tests

**Moments:**
- Any route call returning committed financial data
- OpenAPI review of a financial endpoint
- Contract test run in CI detecting envelope regression
- Rollout monitoring of deprecated-field usage via structured logs

---

# E. Containment Loop

## Entry
- Service DTOs emit FinancialValue envelopes (Phase 1.1 complete)
- Visit surfaces carry dollar-float values (BRIDGE-001 active — documented accurately in Phase 1.2A, retired in Phase 1.2B)
- Shift-intelligence public numeric fields still bare (DEF-001 — wrapping deferred to Phase 1.2B)
- 34 in-scope routes have no OpenAPI path entries (Bucket B)
- No contract tests exist beyond Phase 1.1 smoke tests

## Transformation
1. **Route pass-through verification** — representative route handlers confirmed to carry envelope verbatim; no route-local type/source inference; no flattening; casino_id classified per route
2. **OpenAPI authoring** — shared `FinancialValue` component defined once; representative Bucket B path entries authored per major route family (not all 34); carve-outs (`average_bet`, points, `hold_percent`) annotated explicitly; deprecated fields include dated sunset annotations and replacement pointers
3. **Contract tests** — one read route + one command route per major family assert envelope key presence and pass-through correctness; casino_id classification tested

## Exit
- Representative in-scope routes verified as faithful pass-through for existing service FinancialValue envelopes
- OpenAPI defines the shared FinancialValue component and has representative path entries per major route family
- Contract tests enforce pass-through correctness in CI
- BRIDGE-001 still active but accurately documented in OpenAPI at dollar-float precision (retired in Phase 1.2B)
- Phase 1.2B can expand canonicalization on a proven transport base
- Phase 1.3 can build UI components once Phase 1.2B canonicalization exit gate passes

## Feedback Loop
- Contract tests in CI are the ongoing regression signal
- Deprecated field sunset annotations in OpenAPI provide human-readable governance; runtime observability is Phase 1.2B

---

# F. Required Outcomes

## MUST

- Route handlers in all representative in-scope families confirmed as faithful pass-through — no route-local type/source/completeness inference, no flattening
- `hold_percent` remains a bare `number | null` — never wrapped, in this or any future phase
- OpenAPI defines one shared `FinancialValue` component reused by all in-scope routes
- Representative Bucket B path entries authored — at least one read route per major route family
- Dollar-float `value` documented accurately in OpenAPI for BRIDGE-001-active surfaces (no false claim of integer cents)
- Carve-outs (`average_bet`, points, `hold_percent`) annotated explicitly in OpenAPI as bare values with rationale
- Deprecated fields include dated sunset annotation, replacement pointer, and removal milestone in OpenAPI
- Contract tests pass for every representative in-scope route family — asserting envelope key presence and type/source pass-through
- `casino_id` classified per route: removed, deprecated-and-ignored with sunset annotation, or out-of-scope-with-rationale — silent preservation forbidden

---

## MUST NOT

- Re-author `type`, `source`, or `completeness` at the route handler — route layer is transport only
- Invent or infer financial semantics locally in any route file
- Attempt unit canonicalization — BRIDGE-001 `/100` removal, integer cents enforcement, `financialValueSchema.int()` boundary changes are Phase 1.2B scope
- Wrap `hold_percent` in `FinancialValue` under any circumstances
- Wrap `AnomalyAlertDTO` or `ShiftAlertDTO` numeric fields in `FinancialValue` — shift-intelligence DTO type promotion is Phase 1.2B scope
- Build Phase 1.3 UI components (`FinancialValue.tsx`, `AttributionRatio.tsx`, `CompletenessBadge.tsx`)
- Implement Phase 1.4 ESLint rules (`no-unlabeled-financial-value`, `no-forbidden-financial-label`)
- Touch Wave 2 infrastructure — no outbox, no schema migrations, no projection refactors
- Perform big-bang authoring of all 34 Bucket B routes — representative coverage per family is the scope; full expansion is Phase 1.2B
- Leave any in-scope deprecated field without a dated sunset annotation and replacement pointer in OpenAPI
- Expand beyond the 34 routes in the §4.1 inventory without EXEC-SPEC amendment

---

# G. Explicit Exclusions

This feature explicitly excludes:

**Phase 1.2B scope (successor PRD-074):**
- BRIDGE-001 retirement mechanics — `/100` removal from `services/visit/crud.ts` and `services/rating-slip/mappers.ts`
- `financialValueSchema.int()` enforcement at the DTO outbound boundary
- Shift-intelligence DTO type promotion — `AnomalyAlertDTO` / `ShiftAlertDTO` numeric fields wrapped via `resolveShiftMetricAuthority`
- `formatDollars` → `formatCents` UI render migration on BRIDGE-001 surfaces
- Full 34-route Bucket B OpenAPI authoring (Phase 1.2A establishes the pattern; 1.2B scales it)
- Runtime structured log observability for deprecated-field usage
- Component tests for `rating-slip-modal.test.tsx`, `start-from-previous.test.tsx`, `start-from-previous-modal.test.tsx`
- Full 4-case route test matrices for `recent-sessions` and `live-view`

**Later phases:**
- Phase 1.3 UI components and broad surface relabeling
- Phase 1.4 lint rules, truth-telling tests, and I5 harness
- Wave 2 schema changes, outbox DDL, consumer workers, or projection refactors
- `pit_cash_observation.amount` dollar-to-cents column migration — Wave 2 scope
- Playwright DOM assertions — Phase 1.4 scope
- Broad `formatDollars` / `formatCents` formatter consolidation — Phase 1.3

**All phases:**
- Non-financial route cleanup unrelated to envelope serialization
- New service mapper logic — Phase 1.1 closed that boundary
- Policy/config-only routes that emit no committed financial facts

---

# H. Adjacent Rejected Ideas

| Idea | Reason Rejected |
|------|----------------|
| Route handlers infer `type`/`source` for routes where service hasn't wrapped yet | Route is a transport layer. If a service field is unwrapped, that is a Phase 1.1 gap to close — not a license to invent semantics at the route. Phase 1.2A may not open new service mapping work. |
| Defer BRIDGE-001 sunset to Phase 1.3 (carry dollar floats through two more phases) | BRIDGE-001 is deferred to Phase 1.2B — not discarded. Phase 1.3 UI must not build on an unstable unit contract. The 1.2A (transport) / 1.2B (canonicalization) split is the correct decomposition; skipping Phase 1.2B entirely is the rejected path. |
| Bundle BRIDGE-001 sunset (unit canonicalization) into Phase 1.2A | BRIDGE-001 is a unit change, not a transport change. Bundling it into Phase 1.2A creates cross-layer coupling — service, API, and UI must land atomically. Non-decomposable; the failure mode documented in the PRD-070 postmortem. Phase 1.2B is the correct container. |
| Bundle Phase 1.3 `<FinancialValue>` component creation into this phase | Component must build on a proven and canonicalized contract (Phase 1.2B exit). Building before Phase 1.2B completes inverts the dependency. |
| Wrap `hold_percent` in FinancialValue since it is a metric like the others | `hold_percent` is a ratio, not a currency amount. ADR-052 classification is unambiguous. `resolveShiftMetricAuthority` returns `null` for it and the exhaustive switch throws on unknown MetricType — this is a compile-time gate, not a convention. |
| Expand route inventory beyond §4.1 without amending EXEC-SPEC | Scope expansion without EXEC-SPEC amendment is the failure mode documented in the PRD-070 pipeline-interruption postmortem. Route additions require explicit architecture gate. |
| Big-bang authoring of all 34 Bucket B routes in Phase 1.2A | Surface explosion and coordination overhead. Phase 1.2A establishes the pattern with representative routes per family. Full 34-route authoring follows in Phase 1.2B after the pattern is proven and canonicalization is ready. |

---

# I. Dependencies / Assumptions

## Dependencies
- Phase 1.1 exit gate passed (✅ 2026-04-25) — service DTOs emit FinancialValue
- `resolveShiftMetricAuthority` implemented (PRD-073) — returns `{ type, source }` for all MetricType values; `hold_percent → null`
- `lib/financial/rounding.ts` `dollarsToCents` and pinned rounding tests — canonical source for Phase 1.2 rounding behavior
- `lib/financial/schema.ts` `financialValueSchema` — z.number().int() now applicable after /100 removal
- PRD-071 drafted (2026-04-24) — EXEC-SPEC pending

## Assumptions
- Route handlers are pass-through for service DTO values — no route-local math on financial fields
- The 34 routes in Appendix A of PRD-071 are the complete in-scope set; EXEC-SPEC may amend with rationale
- Dollar-to-cents rounding behavior is settled by the pinned tests in `lib/financial/__tests__/schema.test.ts`; no new rounding decisions are needed in Phase 1.2

---

# J. Likely Next

This feature enables:

## Phase 1.2B (Service Canonicalization — PRD-074)
- BRIDGE-001 retirement — `/100` removal from `services/visit/crud.ts` and `services/rating-slip/mappers.ts`; `financialValueSchema.int()` enforced at outbound boundary
- Shift-intelligence DTO type promotion — `AnomalyAlertDTO` and `ShiftAlertDTO` numeric fields wrapped via `resolveShiftMetricAuthority`
- `formatDollars` → `formatCents` UI render migration on BRIDGE-001 surfaces
- Full 34-route Bucket B OpenAPI authoring (pattern established by Phase 1.2A)
- Integer-value contract tests; full 4-case matrices for `recent-sessions` and `live-view`
- Runtime structured log observability for deprecated-field usage during rollout

## Phase 1.3 (UI Layer: Split Display + Labels)
- `components/financial/FinancialValue.tsx` — visible type badge
- `components/financial/AttributionRatio.tsx` — rename from "Coverage"
- `components/financial/CompletenessBadge.tsx`
- All financial surfaces migrated to `<FinancialValue>` component
- Forbidden label removal from rendered DOM
- Formatter consolidation: `formatDollars`/`formatCents` scatter → `lib/format.ts`

## Phase 1.4 (Validation: Lint + Truth-Telling Tests)
- ESLint `no-unlabeled-financial-value` and `no-forbidden-financial-label` rules
- I5 truth-telling test subset
- CI red on any future envelope regression

## Wave 2 (Dual-Layer + Outbox)
- `finance_outbox` DDL and producers (GAP-F1)
- Class B authoring store
- Shared write-path RPC with same-transaction outbox guarantee

---

# K. Expansion Trigger Rule

Expansion is allowed ONLY if:

- An in-scope route (§4.1 inventory) is discovered to re-author `type`/`source`/`completeness` locally and cannot be fixed by pass-through alone — requires a lead-architect decision before scope expands

Expansion is NOT allowed for:

- adding service mapper logic that should have been Phase 1.1
- building UI components ahead of Phase 1.3
- implementing lint rules ahead of Phase 1.4
- wrapping `hold_percent` under any framing

Those trigger a **new FIB or phase amendment**, not expansion of this one.

---

# L. Scope Authority Block

## Governing Rule
Phase 1.2A may ONLY carry existing financial semantics to the wire. It may NOT create them and may NOT change what passes through (unit, type, format).

## Hard Constraints

- No route-local type/source/completeness inference
- No unit canonicalization — BRIDGE-001 `/100` removal and `financialValueSchema.int()` enforcement are Phase 1.2B
- No `hold_percent` wrapping — ever
- No Phase 1.2B, Phase 1.3, or Phase 1.4 work bundled in
- No scope expansion without EXEC-SPEC amendment

## Rejection Criteria

Reject implementation if it:

- assigns `type`, `source`, or `completeness` inside a route handler
- removes `/100` from `services/visit/crud.ts` or `services/rating-slip/mappers.ts` — that is Phase 1.2B
- enforces `financialValueSchema.int()` at the DTO boundary — that is Phase 1.2B
- wraps `AnomalyAlertDTO` or `ShiftAlertDTO` numeric fields in `FinancialValue` — that is Phase 1.2B
- wraps `hold_percent` in `FinancialValue`
- leaves any in-scope deprecated field without a dated sunset annotation and replacement pointer in OpenAPI
- expands to routes not in the §4.1 inventory without EXEC-SPEC amendment
- builds a `<FinancialValue>` React component
- attempts big-bang authoring of all 34 Bucket B routes without first establishing the representative pattern

---

## One-line invariant
If a change invents financial semantics at the route layer, it is out of scope.
If it carries existing service semantics faithfully to the wire and proves them there, it is in scope.

---

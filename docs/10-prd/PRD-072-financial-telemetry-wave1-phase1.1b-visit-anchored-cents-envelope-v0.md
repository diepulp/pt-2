---
id: PRD-072
title: "Financial Telemetry — Wave 1 Phase 1.1b — Visit Surface Envelope Label"
owner: Lead Architect
status: Draft
affects:
  - PRD-070
  - PRD-071
  - EXEC-070
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
created: 2026-04-24
last_review: 2026-04-24
phase: Wave 1 Phase 1.1b — Visit Surface Envelope Label
pattern: Label-only envelope addition (NOT shape conversion, NOT canonicalization)
http_boundary: true
supersedes_draft: PRD-072 v0 (2026-04-24) — prior version encoded Phase 1.2 canonicalization work
postmortem: docs/issues/gaps/financial-data-distribution-standard/failures/prd-070-pipeline-interruption-postmortem.md
fib_h: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/FIB-H-FiNANCIAL-TELEMETRY-PHASE-1-1-SLICE.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-1-SLICE.json
---

# PRD-072 — Financial Telemetry — Wave 1 Phase 1.1b — Visit Surface Envelope Label

## ⚠ Scope Reset Notice

This document replaces an earlier draft that encoded Phase 1.2 canonicalization work — removal
of `/100` conversions, integer-cents normalization, `formatCents` migration — inside a Phase 1.1
labeling slice. That caused the PRD-070 pipeline halt. See the postmortem for the full diagnosis.

This version is strictly Phase 1.1: **label existing values, do not change them.**

---

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft

**Summary.** This PRD governs a bounded child slice that adds `FinancialValue` envelope labeling
to two visit-anchored DTO surfaces deferred from `PRD-070`. The surfaces are `RecentSessionDTO`
in `services/visit/` and `VisitLiveViewDTO` in `services/rating-slip/`, plus their directly
coupled route handlers and player-session UI consumers.

The work is labeling only. The existing `/100` dollar conversions run before the service
boundary; this slice wraps their output in `FinancialValue` and adds `type`, `source`, and
`completeness.status`. The numeric value does not change. The render semantics do not change.
Phase 1.2 (`FIB-FIN-CANON-001`, separate PRD) will remove the `/100` conversions, canonicalize
to integer cents, and make `financialValueSchema z.number().int()` applicable at runtime.

This PRD is a necessary step on the Phase 1.1 close path but is not sufficient on its own.
`EXEC-070` remains `partially_finalized_awaiting_child_specs` until both this chain and the
future `FIB-FIN-SHIFT-001` chain complete, after which `WS9` runs the full Phase 1.1
verification matrix.

---

## 2. Problem & Goals

### 2.1 Problem

`PRD-070` grouped a tier-1 rename (`totalChipsOut` → `totalCashOut`) with tier-2 visit-surface
work and assumed both had the same complexity. The visit-surface work spans `services/visit/dtos.ts`,
wire-format Zod validation, mapper and CRUD behavior, two route handlers, two directly coupled UI
consumers, and two route-boundary test directories that do not yet exist. The original EXEC-SPEC
drafted to close this work (`EXEC-072 v0`) then collapsed Phase 1.1 and Phase 1.2 by encoding
`/100` removal and cents canonicalization inside a labeling slice. The pipeline correctly halted.

The underlying system gap remains: these visit-facing contracts emit bare `number` values with no
metadata. Operators cannot tell whether a value is actual or estimated, where it came from, or
whether it is complete. That is a Phase 1.1 interpretability problem. The unit mismatch (dollars
vs cents inside the service) is a Phase 1.2 correctness problem. This PRD solves the first.

### 2.2 Goals

| Goal | Observable signal |
|------|------------------|
| **G1** — `RecentSessionDTO` fields `total_buy_in`, `total_cash_out`, `net` typed as `FinancialValue` | `services/visit/dtos.ts` no longer types those fields as bare `number`; service tests assert envelope shape |
| **G2** — `VisitLiveViewDTO` fields `session_total_buy_in`, `session_total_cash_out`, `session_net` typed as `FinancialValue` | `services/visit/dtos.ts` no longer types those fields as bare `number`; mapper tests assert envelope shape |
| **G3** — Existing conversion logic preserved; wrapping added after it | `/100` divisions remain in `crud.ts` and `mappers.ts`; `FinancialValue.value` carries the dollar result; grep confirms presence, not absence, of `/100` |
| **G4** — Every emitted envelope carries explicit `type`, `source`, and `completeness.status` | No omissions in mapper output; test assertions pin all three fields |
| **G5** — Directly coupled route handlers stay truthful without re-authoring financial semantics | Routes pass DTO through unchanged; no `/100` or dollar math at the transport layer |
| **G6** — Directly coupled player-session UI reads `.value` for rendering | `formatDollars(field.value)` replaces `formatDollars(field)` — the render function does not change, only the access path does |
| **G7** — Shared `services/visit/dtos.ts` handled without parallel-workstream drift | EXEC-SPEC and implementation sequence show visit-service WS fully before rating-slip WS, or both land atomically |

### 2.3 Non-Goals

- **Removal of `/100` conversions.** Keeping or removing dollar pre-conversion is a Phase 1.2 canonicalization concern. This PRD explicitly prohibits touching that logic.
- **Migration to `formatCents`.** `FinancialValue.value` carries a dollar float in Phase 1.1. `formatCents` expects integer cents and would produce wrong output. The render function switch happens in Phase 1.2.
- **Applying `financialValueSchema` at runtime.** The Zod schema declares `value: z.number().int()`, which would reject the dollar float this slice intentionally produces. Outbound runtime Zod is not added here.
- **New mapper file.** Creating `services/visit/mappers.ts` with `toRecentSessionDTO` is a structural refactor, not labeling. Wrapping happens inline in the existing `centsToDollars` closure.
- **Broad route/OpenAPI rollout.** The wider HTTP contract migration belongs to `PRD-071`.
- **Phase 1.3 UI components.** `<FinancialValue>`, `<AttributionRatio>`, `<CompletenessBadge>`, and visual authority treatment are Phase 1.3 scope.
- **Shift-intelligence authority routing.** The deferred WS7B equivalent is a separate bounded-context slice and must not be folded into this PRD.
- **WS9 closeout package.** Phase 1.1 verification matrix, rollback package, and Phase 1.2 handoff remain governed by the parent `PRD-070` close gate.
- **SQL migrations.** Both visit RPCs already return bare cents; no DDL or RPC rewrites are required.
- **Any demo/mock surface.** The former `app/review/` tree has been removed. Any future mock/demo surface is out of scope.

---

## 3. Users & Use Cases

**Primary users:** Backend engineers, API engineers, and frontend engineers responsible for the
visit continuation and live-view paths.

**Top Jobs:**

- As a **backend engineer**, I need the visit-facing DTOs to carry `type`, `source`, and `completeness.status` so the service boundary stops emitting interpretively opaque bare numbers — without touching the `/100` conversion that Phase 1.2 will address.
- As an **API engineer**, I need the recent-sessions and live-view routes to pass the envelope through unchanged so the transport layer adds no financial semantics.
- As a **frontend engineer**, I need the two directly coupled player-session consumers to access `field.value` and call `formatDollars(field.value)` so the codebase compiles and renders correctly — the same dollar output as before, just via the new `.value` accessor.
- As a **reviewer**, I need the slice to be minimal and auditable — only the six fields change type, the conversion logic is untouched, and the test files that do not yet exist are born at minimum scope.

---

## 4. Scope & Feature List

### 4.1 In Scope

**DTO type change**
- Convert `RecentSessionDTO.total_buy_in`, `total_cash_out`, `net` from `number` to `FinancialValue`.
- Convert `VisitLiveViewDTO.session_total_buy_in`, `session_total_cash_out`, `session_net` from `number` to `FinancialValue`.

**Inline wrapping (label-only)**
- Inside the existing `centsToDollars` closure in `services/visit/crud.ts`: return `FinancialValue` objects instead of bare numbers. The `/100` division stays inside `value: s.total_buy_in / 100`. No new function or file.
- Inside `toVisitLiveViewDTO` in `services/rating-slip/mappers.ts`: replace bare `/100` assignments with inline `FinancialValue` construction. The `/100` stays inside `value: data.session_total_buy_in / 100`. No new function or file.

**Envelope metadata**
- Each emitted envelope carries `type: 'actual'`, a dotted `source` string tracing to `visit_financial_summary`, and `completeness.status` per the null/zero decision rule (null → `'unknown'`, non-null → `'complete'`). No field omissions.

**Route verification**
- Grep confirms both route handlers contain no `/100`, `dollarsToCents`, or `formatDollars` calls. No code changes to routes are expected; only verification.

**Minimum route-boundary test birth**
- `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` — new file, one success case asserting `FinancialValue` shape (type present, source non-empty, completeness.status present, value is `number`).
- `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` — new file, same minimum scope.

**UI type update (minimum)**
- `components/player-sessions/start-from-previous.tsx`: update type to `RecentSessionDTO`, change `formatDollars(session.field)` to `formatDollars(session.field.value)`, change `session.net >= 0` to `session.net.value >= 0`.
- `components/player-sessions/start-from-previous-modal.tsx`: update type import, update field access to `.value` where the three financial fields are read.

### 4.2 Out of Scope

- Removing `/100` from `crud.ts` or `mappers.ts` — Phase 1.2.
- `formatCents` migration — Phase 1.2.
- `services/visit/mappers.ts` new function or file — Phase 1.2 if warranted.
- 4-case route-boundary test suites — Phase 1.2 (contract stabilizing; value unit changes).
- New component test file for start-from-previous — Phase 1.2.
- Any route or UI surface beyond the four files named above.
- OpenAPI updates — `PRD-071`.
- Shift-intelligence (WS7B) — separate FIB.
- Phase 1.1 verification matrix (WS9) — `EXEC-070` closing gate.

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1.** `services/visit/` MUST emit `FinancialValue` envelopes for recent-session totals. `value` carries the dollar float produced by the existing `/100` conversion. The conversion MUST be preserved.

**FR-2.** `services/rating-slip/` MUST emit `FinancialValue` envelopes for visit live-view session totals. `value` carries the dollar float produced by the existing `/100` conversion. The conversion MUST be preserved.

**FR-3.** Both wrapping points MUST set `type`, `source`, and `completeness.status` explicitly. `completeness.status` MUST NOT be omitted. Rule: `null` / `undefined` input → `status: 'unknown'`, `value: 0`; non-null input → `status: 'complete'`, `value: <result of /100>`.

**FR-4.** Source strings MUST use dotted table.column format: `'visit_financial_summary.total_in'`, `'visit_financial_summary.total_out'`, `'visit_financial_summary.net_amount'`.

**FR-5.** `recentSessionsRpcResponseSchema` and other wire-format RPC validators MUST continue to validate the raw RPC payload shape (bare `z.number()`). They are not updated in this slice.

**FR-6.** No outbound Zod validation using `financialValueSchema` MUST be added at the DTO boundary. `financialValueSchema` declares `value: z.number().int()`, which rejects the dollar float this slice intentionally produces. Static TypeScript types are sufficient for Phase 1.1.

**FR-7.** The recent-sessions and live-view route handlers MUST pass service DTOs through unchanged. No dollar/cents math, no financial reclassification at the route layer.

**FR-8.** `components/player-sessions/start-from-previous.tsx` and `components/player-sessions/start-from-previous-modal.tsx` MUST render in-scope monetary values via `formatDollars(field.value)`. NOT `formatCents`. `field.value` is a dollar float in Phase 1.1.

**FR-9.** The implementation MUST honor the shared-file sequencing rule on `services/visit/dtos.ts`: no parallel workstream execution that can produce an intermediate state where one DTO is `FinancialValue` and the other is `number`.

**FR-10.** The recent-sessions route-boundary test MUST contain at least one success case asserting `FinancialValue` envelope shape at the wire. Full case expansion is Phase 1.2.

**FR-11.** The live-view route-boundary test MUST contain at least one success case asserting `FinancialValue` envelope shape at the wire. Full case expansion is Phase 1.2.

### 5.2 Non-Functional Requirements

- The slice must stay bounded to the producer, route, and consumer paths named in the FIB-S. Any newly discovered route or consumer is an amendment trigger, not an implicit scope expansion.
- The migration requires no feature flag. The rendered dollar strings are semantically identical to the pre-migration output — only the container shape changes.
- No `as any`, no duplicated `FinancialValue` type definitions, no route-local financial authority authorship.
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md` and the `PRD-070` handoff package MUST record that the two live HTTP payloads changed shape before `PRD-071` documents them, and that `FinancialValue.value` carries a dollar float pending Phase 1.2 canonicalization.

> Architecture details: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`, `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`, `types/financial.ts`, `lib/financial/schema.ts`.

---

## 6. UX / Flow Overview

**Flow 1 — Recent sessions label path**
1. Client requests `GET /api/v1/players/[playerId]/recent-sessions`.
2. `services/visit/crud.ts` calls the RPC, validates bare JSONB shape.
3. `centsToDollars` closure wraps each currency field: `{ value: s.total_buy_in / 100, type: 'actual', source: '...', completeness: { status: ... } }`.
4. Route returns the envelope-shaped DTO unchanged.
5. Player-session panel renders `formatDollars(session.total_buy_in.value)` — same dollar string as before.

**Flow 2 — Live view label path**
1. Client requests `GET /api/v1/visits/[visitId]/live-view`.
2. `services/rating-slip/` calls the RPC, unwraps via `narrowRpcJson`.
3. `toVisitLiveViewDTO` wraps each session total: `{ value: data.session_total_buy_in / 100, type: 'actual', source: '...', completeness: { status: ... } }`.
4. Route returns the envelope-shaped DTO unchanged.
5. Consumer reads `session_total_buy_in.value` — same dollar amount as before.

**Flow 3 — Verification**
1. `npm run type-check` confirms no bare `number` on the six fields.
2. Minimum route-boundary tests assert envelope shape at the wire.
3. Existing service tests (updated assertions) confirm the wrapped shape.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Shared financial primitives** — `types/financial.ts`, `lib/financial/schema.ts`, and `lib/format.ts` exist and are the canonical primitives. No new shared primitive is introduced in this slice.
- **Parent phase governance** — `PRD-070` remains the Phase 1.1 umbrella. This is a bounded child slice; it does not replace the parent close gate.
- **Phase 1.1 contingency** — Phase 1.1 does not close when this slice lands. `EXEC-070` remains `partially_finalized_awaiting_child_specs` until both this chain and the future `FIB-FIN-SHIFT-001` chain complete, then `WS9` runs the full verification matrix.
- **Phase 1.2 successor** — The canonicalization work this PRD intentionally defers (remove `/100`, switch to `formatCents`, apply `financialValueSchema z.number().int()`) must be captured in a separate `FIB-FIN-CANON-001` → PRD chain before Phase 1.2 begins.

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|-----------|
| Dollar-float value misread as a bug | EXEC-SPEC names the dollar-float as intentional; `ROLLOUT-PROGRESS.md` documents it; DoD requires the record |
| Executor "cleans up" inline wrapping into a mapper refactor | EXEC-SPEC carries explicit `hard_prohibitions` against new mapper files and helper functions |
| Shared `services/visit/dtos.ts` parallel edit | Sequential workstream ordering or atomic commit; gate blocks WS2 until WS1 type-check passes |
| UI consumer uses `formatCents` instead of `formatDollars` | Explicit FR-8 prohibition; DoD grep gate |
| Outbound Zod added and rejects dollar floats at runtime | FR-6 prohibition; EXEC-SPEC DEC-1 decision record |
| Scope creep into adjacent financial routes | Any new route or UI consumer is an amendment trigger; the FIB-S expansion trigger rule applies |
| Completeness semantics drift (null silently becomes 'complete') | FR-3 pins the rule; mapper wrapping code in EXEC-SPEC is the canonical reference |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `RecentSessionDTO` emits `FinancialValue` for `total_buy_in`, `total_cash_out`, and `net` — `value` is the dollar result of the preserved `/100` conversion
- [ ] `VisitLiveViewDTO` emits `FinancialValue` for `session_total_buy_in`, `session_total_cash_out`, and `session_net` — `value` is the dollar result of the preserved `/100` conversion
- [ ] Route handlers pass envelope DTOs through unchanged; grep confirms no `/100` in route files

**Data & Integrity**
- [ ] The `/100` conversion logic is present and unchanged in `services/visit/crud.ts` `centsToDollars` closure and in `services/rating-slip/mappers.ts` `toVisitLiveViewDTO`
- [ ] `completeness.status` is explicit on every emitted envelope — no omissions

**Security & Access**
- [ ] No new caller-controlled financial authority logic at the route layer
- [ ] Existing auth/RLS posture on both routes unchanged

**Testing**
- [ ] Service/mapper tests cover envelope output for recent-sessions and live-view paths with updated assertions (FinancialValue shape, dollar-float value)
- [ ] `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` exists with at least one success case asserting envelope shape
- [ ] `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` exists with at least one success case asserting envelope shape
- [ ] `npm run type-check` exits 0; no bare `number` on the six in-scope DTO fields

**Operational Readiness**
- [ ] EXEC-SPEC documents: (a) sequential workstream ordering on `services/visit/dtos.ts`, (b) dollar-float semantic warning, (c) prohibition on outbound Zod, (d) prohibition on `/100` removal and `formatCents` migration
- [ ] Rollback is bounded to the producer/route/consumer slice without touching unrelated Phase 1.1 work

**Documentation**
- [ ] `ROLLOUT-PROGRESS.md` and the `PRD-070` handoff package record that: (a) these two live HTTP payloads changed before the `PRD-071` OpenAPI rollout, and (b) `FinancialValue.value` is a dollar float pending Phase 1.2 canonicalization
- [ ] `PRD-070` closeout references `PRD-072` as the child slice owning WS5/WS5_ROUTE/WS5_UI/WS6-equivalent work
- [ ] Deferrals to Phase 1.2 (`/100` removal, `formatCents`, full test suites) explicitly documented

---

## 9. Related Documents

**Corrected intake artifacts (governing this version)**
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/FIB-H-FiNANCIAL-TELEMETRY-PHASE-1-1-SLICE.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-1-SLICE.json`

**Postmortem**
- `docs/issues/gaps/financial-data-distribution-standard/failures/prd-070-pipeline-interruption-postmortem.md`

**Superseded intake (wrong scope)**
- `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-H-FIN-CENTS-001-visit-anchored-cents-envelope.md`
- `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-S-FIN-CENTS-001-visit-anchored-cents-envelope.json`

**Parent and sibling PRDs**
- `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md`
- `docs/10-prd/PRD-071-financial-telemetry-wave1-phase1.2-api-envelope-at-wire-v0.md`

**Execution**
- `docs/21-exec-spec/PRD-072/EXEC-072-financial-telemetry-wave1-phase1.1b-visit-anchored-cents-envelope.md`
- `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md`

**Standards and governance**
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

---
id: PRD-072
title: Financial Telemetry — Wave 1 Phase 1.1b — Visit-Anchored Cents Envelope
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
phase: Wave 1 Phase 1.1b — Visit-Anchored Cents Envelope
pattern: Cross-context service-contract migration (visit + rating-slip pass-through consumers)
http_boundary: true
---

# PRD-072 — Financial Telemetry — Wave 1 Phase 1.1b — Visit-Anchored Cents Envelope

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** This PRD extracts the remaining visit-anchored cents-envelope work from `PRD-070` into a bounded child slice. The slice covers two tightly coupled contract paths only: `RecentSessionDTO` in `services/visit/` and `VisitLiveViewDTO` in `services/rating-slip/`, plus their directly coupled route handlers and player-session UI consumers. The objective is to remove dollar pre-conversion at the service boundary, emit canonical `FinancialValue` envelopes in cents, and add the minimum route-boundary and consumer updates required to keep the contracts truthful and the codebase compiling. Broad API/OpenAPI rollout remains `PRD-071`, broad UI rendering remains Phase 1.3, and shift-intelligence authority routing remains a separate follow-on PRD.

---

## 2. Problem & Goals

### 2.1 Problem

`PRD-070` originally grouped a tier-1 rename (`totalChipsOut` → `totalCashOut`) with a harder tier-2 shape conversion on visit-anchored currency fields. The live codebase shows that the visit-anchored work is not a single-file DTO edit: it spans `services/visit/dtos.ts`, wire-format Zod validation, mapper behavior, two route handlers, two directly coupled UI consumers, and two route-boundary test directories that do not yet exist. Keeping this inside `EXEC-070` as an in-flight amendment would hide the actual blast radius and blur the dependency between recent-sessions and live-view changes on the shared `services/visit/dtos.ts` file.

The system-level problem is unchanged from `PRD-070`: these visit-facing contracts still emit bare numbers and still perform dollar pre-conversion before the service boundary. That blocks the Financial Telemetry rollout from being truthful at the visit-anchored boundary. Until these DTOs emit canonical cents envelopes with explicit authority, source, and completeness, the route layer and the directly coupled consumers remain semantically lossy.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1** — `RecentSessionDTO` emits `FinancialValue` envelopes for `total_buy_in`, `total_cash_out`, and `net` | `services/visit/dtos.ts` no longer types those fields as bare `number`; mapper/service tests assert envelope shape |
| **G2** — `VisitLiveViewDTO` emits `FinancialValue` envelopes for `session_total_buy_in`, `session_total_cash_out`, and `session_net` | `services/visit/dtos.ts` no longer types those fields as bare `number`; live-view mapper/service tests assert envelope shape |
| **G3** — Dollar pre-conversion is removed from the visit-anchored service boundary | No remaining `/100` conversion in the relevant `services/visit/crud.ts` and `services/rating-slip/mappers.ts` producer paths |
| **G4** — Directly coupled route handlers stay truthful without re-authoring financial semantics | Route-boundary tests assert `value`, `type`, `source`, and `completeness.status` at `app/api/v1/players/[playerId]/recent-sessions/route.ts` and `app/api/v1/visits/[visitId]/live-view/route.ts` |
| **G5** — Directly coupled player-session consumers render the new contract without widening into Phase 1.3 UI work | `components/player-sessions/start-from-previous.tsx` and `components/player-sessions/start-from-previous-modal.tsx` consume `.value` via `formatCents()` and contain no inline `/100` math or `<FinancialValue>` usage |
| **G6** — The shared `services/visit/dtos.ts` touchpoint is handled without parallel-workstream drift | EXEC-SPEC and implementation sequence show WS5 fully before WS6, or both changes land atomically |
| **G7** — Local player-session types cannot drift from the migrated contract | `components/player-sessions/*` no longer preserve a stale manual dollars-based `SessionData` shape; the UI type surface imports, aliases, or is directly derived from the migrated DTO contract rather than maintaining a parallel local interface |

### 2.3 Non-Goals

- **Broad route/OpenAPI rollout.** The wider HTTP contract migration belongs to `PRD-071`; this slice only updates the two already verified pass-through routes required by the service DTO change.
- **Broad UI migration to presentation components.** `<FinancialValue>`, `<AttributionRatio>`, `<CompletenessBadge>`, label cleanup, and visual authority treatment remain Phase 1.3 scope.
- **Shift-intelligence authority routing.** The deferred `WS7B` equivalent remains a separate bounded-context slice and must not be folded into this PRD.
- **WS9 closeout package.** Phase 1.1 verification matrix, rollback package, and Phase 1.2 handoff remain governed by the parent `PRD-070` close gate.
- **SQL migrations.** Both visit RPCs already return bare cents; this slice does not introduce DDL or RPC rewrites.
- **Any demo/mock surface.** The former `app/review/` tree has already been removed from the repo; any future mock/demo surface is explicitly out of scope.

---

## 3. Users & Use Cases

- **Primary users:** Backend engineers, API engineers, and frontend engineers responsible for the visit continuation and live-view paths.

**Top Jobs:**

- As a **backend engineer**, I need the visit-facing DTOs to emit canonical `FinancialValue` envelopes so service boundaries stop leaking unlabeled currency numbers.
- As an **API engineer**, I need the recent-sessions and live-view routes to pass the envelope through unchanged so the transport layer does not flatten the service truth.
- As a **frontend engineer**, I need the two directly coupled player-session consumers to render `formatCents(envelope.value)` so the codebase compiles without prematurely opening Phase 1.3 UI work.
- As a **reviewer**, I need the recent-sessions and live-view changes to ship as a bounded slice with explicit test-file birth and serialization sequencing so the remaining Phase 1.1 work is reviewable and auditable.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Service boundary migration**
- Convert `RecentSessionDTO.total_buy_in`, `total_cash_out`, and `net` to `FinancialValue`.
- Convert `VisitLiveViewDTO.session_total_buy_in`, `session_total_cash_out`, and `session_net` to `FinancialValue`.
- Add or refine mapper logic so both paths emit `type`, `source`, and `completeness.status` explicitly.
- Preserve wire-format RPC parsing as bare-number validation where the RPC JSONB still returns raw cents.
- Make the wire-vs-DTO Zod partition explicit in implementation and review artifacts.

**Boundary truthfulness**
- Remove the existing `/100` service-boundary conversions from the recent-sessions and live-view producer paths.
- Keep the two route handlers as transport pass-throughs with no route-local dollar/cents math.
- Create route-boundary tests for `recent-sessions` and `live-view` if they do not already exist.
- Preserve route-level error semantics while the contract changes: unauthorized remains unauthorized, invalid params/query remain rejected, and `live-view` keeps its `404` not-found behavior.
- Preserve the existing recent-sessions split contract: closed sessions stay in `sessions[]`, and any current session remains in `open_visit`.

**Directly coupled consumer compatibility**
- Update `components/player-sessions/start-from-previous.tsx` to read envelope `.value` and render via `formatCents()`.
- Update `components/player-sessions/start-from-previous-modal.tsx` to read envelope `.value` and render via `formatCents()`.
- Eliminate the local manual `SessionData` export so the player-session UI does not retain a stale dollars-based duplicate of the service contract.
- Keep the UI compatibility change minimal: no new presentation components, no authority badges, no label redesign.

### 4.2 Out of Scope

- `app/api/v1/**` routes beyond the two verified pass-through paths.
- OpenAPI component updates and route-family API inventory work from `PRD-071`.
- Shift-intelligence alert/baseline authority routing and `hold_percent` contract decisions.
- Phase 1.3 visual financial-surface components and broad rendered-surface cleanup.
- Demo, design-review, or mock-only surfaces reintroduced after the 2026-04-24 `app/review/` deletion.

---

## 5. Requirements

### 5.1 Functional Requirements

1. `services/visit/` MUST emit `FinancialValue` envelopes for recent-session totals with `value` in integer cents.
2. `services/rating-slip/` MUST emit `FinancialValue` envelopes for visit live-view session totals with `value` in integer cents.
3. Both mapper paths MUST set `type`, `source`, and `completeness.status` explicitly; `completeness.status` may not be omitted.
4. Mapper-level tests MUST assert exact `type` and `completeness.status` for all in-scope envelope fields and MUST assert at least one representative exact `source` string per path.
5. `recentSessionsRpcResponseSchema` and other wire-format RPC validators MUST continue to validate the raw RPC payload shape rather than pretending the RPC already emits `FinancialValue`.
6. The recent-sessions and live-view route handlers MUST pass the service DTOs through unchanged and MUST NOT perform dollar/cents math or financial reclassification.
7. The recent-sessions route MUST preserve the current contract split between closed sessions in `sessions[]` and the nullable current session in `open_visit`.
8. `components/player-sessions/start-from-previous.tsx` and `components/player-sessions/start-from-previous-modal.tsx` MUST render in-scope monetary values via `formatCents(envelope.value)`.
9. No in-scope file may use inline `/100` arithmetic for these visit-anchored financial fields after the migration lands.
10. The implementation MUST honor the shared-file sequencing rule on `services/visit/dtos.ts`: no parallel workstream execution that can drift `RecentSessionDTO` and `VisitLiveViewDTO`.
11. The recent-sessions route-boundary suite MUST cover at minimum: one success case, one unauthorized case, one invalid input/query case, and one assertion of correct `open_visit` contract behavior.
12. The live-view route-boundary suite MUST cover at minimum: one success case, one unauthorized case, one invalid input/query case, and one `404` not-found case.
13. The player-session UI type surface MUST not remain a stale manually maintained dollars-based contract once the DTO migration lands; the local manual `SessionData` interface/export must be removed in favor of the migrated DTO contract shape.

### 5.2 Non-Functional Requirements

- The slice must stay bounded to the verified producer, route, and consumer paths named in the intake pair.
- The migration must not require feature flags; the rendered currency strings remain functionally identical for operators.
- The implementation must remain compliant with DTO and service-layer standards: no `as any`, no duplicated `FinancialValue` type definitions, no route-local semantic authorship.
- The route-boundary tests added in this slice must be focused contract tests, not broad route-family rewrites.
- Any runtime DTO-boundary Zod validation beyond the wire parser requires an explicit EXEC-SPEC decision and rationale; default posture is to avoid redundant runtime validation if static typing and mapper ownership are sufficient.
- OpenAPI may remain temporarily stale until `PRD-071`, but `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md` and the PRD-070 handoff package MUST record that this slice intentionally changes two live HTTP payloads ahead of the broader API documentation phase.

> Architecture details: See `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`, `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`, `docs/25-api-data/DTO_CANONICAL_STANDARD.md`, and `types/remote/database.types.ts`.

---

## 6. UX / Flow Overview

**Flow 1: Recent sessions contract path**
1. Client requests `app/api/v1/players/[playerId]/recent-sessions/route.ts`.
2. `services/visit/` calls the recent-sessions RPC and validates the raw JSONB response shape.
3. Mapper wraps each in-scope currency field into `FinancialValue` with cents `value`, authority, provenance, and completeness.
4. Route returns the envelope-shaped DTO unchanged.
5. Player-session consumers render `formatCents(dto.total_buy_in.value)` and related fields.

**Flow 2: Visit live-view contract path**
1. Client requests `app/api/v1/visits/[visitId]/live-view/route.ts`.
2. `services/rating-slip/` retrieves live-view aggregates and maps them into `VisitLiveViewDTO`.
3. Mapper removes the old dollar pre-conversion and emits the envelope in cents.
4. Route returns the envelope-shaped DTO unchanged.
5. Directly coupled consumer logic reads `.value` rather than assuming a bare number.

**Flow 3: Verification path**
1. Route-boundary tests exercise one success path per route.
2. Assertions verify `value`, `type`, `source`, and `completeness.status`.
3. Service/component tests catch regressions in mapper output and direct consumer rendering.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Shared financial primitives** — `types/financial.ts`, `lib/financial/schema.ts`, and `lib/format.ts` already exist and are the canonical primitives for this slice.
- **Parent phase governance** — `PRD-070` remains the owning Phase 1.1 umbrella; `PRD-072` is a bounded child slice, not a replacement for the parent close gate.
- **Future API phase** — `PRD-071` owns the broad API/OpenAPI rollout, so this PRD must not widen into route families beyond the two verified pass-through paths.
- **Temporary OpenAPI drift** — `docs/25-api-data/api-surface.openapi.yaml` does not currently document these two routes. Because `PRD-071` owns the broad API inventory and schema rollout, this slice may change the live route payloads before OpenAPI catches up, but `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md` and the PRD-070 handoff package MUST record that intentional temporary mismatch explicitly.
- **Existing modal rename completion** — WS4-style modal rename work is already landed and is not part of this slice.

### 7.2 Risks & Open Questions

- **Shared DTO file risk** — `services/visit/dtos.ts` is touched by both recent-sessions and live-view paths. Mitigation: enforce sequential workstreams or one atomic change set.
- **Wire-vs-DTO validation risk** — adding redundant outbound Zod can create complexity without signal. Mitigation: record the decision explicitly in EXEC-SPEC rather than ad hoc in code.
- **UI type-drift risk** — `components/player-sessions/start-from-previous.tsx` currently defines a manual numeric `SessionData` contract. Mitigation: remove the local manual interface/export and consume the migrated DTO contract shape directly in the same slice.
- **Recent-session branch risk** — the current route contract distinguishes `sessions[]` from `open_visit`. Mitigation: route-boundary tests must assert that the `open_visit` branch remains present and correctly shaped when applicable.
- **Completeness semantics risk** — null/missing source values can drift into silent defaults. Mitigation: mapper tests must pin `'unknown'` vs `'complete'` behavior explicitly.
- **Scope creep risk** — adjacent financial routes can look similar and tempt opportunistic migration. Mitigation: treat any new route or UI consumer discovery as an amendment trigger, not an implicit scope expansion.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `RecentSessionDTO` and `VisitLiveViewDTO` emit `FinancialValue` for all in-scope currency fields
- [ ] Recent-sessions and live-view routes return the envelope contract unchanged at the wire

**Data & Integrity**
- [ ] No `/100` pre-conversion remains in the visit-anchored producer paths
- [ ] `completeness.status` is explicit on every in-scope emitted envelope

**Security & Access**
- [ ] The slice introduces no new caller-controlled financial authority logic at the route layer
- [ ] Existing auth/RLS posture on the two routes remains unchanged

**Testing**
- [ ] Mapper/service tests cover the recent-sessions and live-view envelope output
- [ ] Route-boundary tests exist for `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` and `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts`
- [ ] Recent-sessions route tests cover success, unauthorized, invalid input/query, and `open_visit` contract behavior
- [ ] Live-view route tests cover success, unauthorized, invalid input/query, and `404` not-found cases
- [ ] Named player-session component tests cover `.value`-based rendering, assert removal of the old `formatDollars(...)` path for in-scope totals, and verify the stale local numeric contract is gone

**Operational Readiness**
- [ ] The implementation or EXEC-SPEC documents the sequencing rule for `services/visit/dtos.ts`
- [ ] Rollback is limited to reverting the bounded producer/route/consumer slice without touching unrelated Phase 1.1 work

**Documentation**
- [ ] `PRD-070` closeout references `PRD-072` as the child slice owning WS5/WS6-equivalent work
- [ ] Known deferrals to `PRD-071`, Phase 1.3, and the future shift-intelligence PRD remain explicitly documented
- [ ] `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md` and the handoff package record that these two live HTTP payloads changed before the broader `PRD-071` OpenAPI rollout

---

## 9. Related Documents

- `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-H-FIN-CENTS-001-visit-anchored-cents-envelope.md`
- `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-S-FIN-CENTS-001-visit-anchored-cents-envelope.json`
- `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md`
- `docs/10-prd/PRD-071-financial-telemetry-wave1-phase1.2-api-envelope-at-wire-v0.md`
- `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.0-SIGNOFF.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

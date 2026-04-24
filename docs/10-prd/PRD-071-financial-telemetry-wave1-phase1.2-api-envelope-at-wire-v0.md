---
id: PRD-071
title: Financial Telemetry — Wave 1 Phase 1.2 — API Envelope at the Wire
owner: Lead Architect (spec steward); API engineers across financial route families (implementation)
status: Draft
affects:
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
  - docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md
  - docs/25-api-data/api-surface.openapi.yaml
created: 2026-04-24
last_review: 2026-04-24
phase: Wave 1 Phase 1.2 — API Envelope at the Wire
pattern: Cross-context API contract migration
http_boundary: true
parent_planning_ref: docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
handoff_ref: docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md
adr_refs:
  - docs/80-adrs/ADR-052-financial-fact-model-dual-layer.md
  - docs/80-adrs/ADR-053-financial-system-scope-boundary.md
  - docs/80-adrs/ADR-054-financial-event-propagation-surface-contract.md
  - docs/80-adrs/ADR-055-cross-class-authoring-parity.md
standards_ref: docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md
classification_rules_ref: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md
surface_inventory_ref: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md
forbidden_labels_ref: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md
sdlc_category: API/DATA (route contracts + OpenAPI)
pipeline_chain: /prd-writer (this doc) → /lead-architect EXEC-SPEC → /build-pipeline dispatching /api-builder (+ /backend-service-builder for residual contract touchpoints)
gov010_status: pending
---

# PRD-071 — Financial Telemetry — Wave 1 Phase 1.2 — API Envelope at the Wire

## 1. Overview

- **Owner:** Lead Architect (spec steward). Implementation is owned by API engineers working across the financial route families listed in §4.
- **Status:** Draft
- **Summary:** Phase 1.2 is the API-layer contract rollout for the financial telemetry envelope established in `types/financial.ts` and originated in Phase 1.1 service DTOs. This phase makes route handlers serialize `FinancialValue` verbatim at the HTTP boundary, updates OpenAPI to define the shared `FinancialValue` component once and reference it consistently, introduces contract tests that fail on shape regression, and removes or deprecates any raw-total endpoint contract that violates the Surface Rendering Contract. Phase 1.2 does not create new financial semantics and does not redesign UI; it stabilizes transport truthfulness so Phase 1.3 can render labels without re-inference and Phase 1.4 can enforce wire-level honesty mechanically.
- **Boundary with Phase 1.1:** Phase 1.1 owns service DTO origination and mapper classification. Phase 1.2 assumes those service outputs are available or explicitly deferred in the Phase 1.1 handoff package. Route handlers in this phase are consumers of the service envelope, not re-authors of `type`, `source`, or `completeness`.
- **Boundary with Phase 1.3:** Phase 1.2 may update route payloads and OpenAPI descriptions, but it does not build `components/financial/FinancialValue.tsx`, perform broad surface relabeling, or resolve visual treatment questions. UI migration remains Phase 1.3.
- **Primary deliverables:** (1) route-handler serialization rules, (2) one shared OpenAPI `FinancialValue` schema component, (3) contract-test coverage for financial endpoints, and (4) dated deprecation records for any raw-total or forbidden-label endpoint contract that cannot remain truthful.
- **Tenant-scope rule for this phase:** Phase 1.2 treats HTTP-visible tenant scope as part of the transport truthfulness problem. For in-scope financial routes, RLS context is the only authoritative casino scope. Any client-supplied `casino_id` query/body field on an in-scope route must be either (a) removed from the contract, or (b) retained only as an explicitly deprecated, ignored compatibility field with a dated sunset note. Phase 1.2 MUST NOT preserve a contract that implies caller-owned tenant scoping where the route actually derives scope from `mwCtx.rlsContext`.
- **Default migration preference for legacy `casino_id`:** remove the field from the public contract wherever feasible in Phase 1.2. Use deprecated-and-ignored only when immediate removal would break a known active consumer and the compatibility window is explicitly justified in EXEC-SPEC.

## 2. Problem & Goals

### 2.1 Problem

PT-2 currently exposes financial data through HTTP contracts that were designed around bare numeric fields. Even if Phase 1.1 completes service-level envelope origination, the API layer remains a semantic loss point until every relevant route:

1. returns the envelope without flattening it back to bare numbers,
2. documents that shape in OpenAPI,
3. tests the shape at the contract boundary, and
4. removes or deprecates endpoint responses that still imply authoritative totals or forbidden labels.

Without Phase 1.2, the transport layer can silently undo Phase 1.1 truth-telling. A route can pass through `amount: number`, rename a derived value as `Total Drop`, omit `completeness.status`, or expose an unlabeled aggregate that looks authoritative to clients and reviewers. That breaks `ADR-054` at the system boundary and blocks Phase 1.3 from consuming the envelope as a stable contract.

Phase 1.2 also needs to absorb the Phase 1.1 contract changes that already touch routes, especially:

- the `totalChipsOut` → `totalCashOut` rename in the rating-slip modal data flow, and
- the visit-facing cents envelope migration (`recent-sessions`, `live-view`, related visit summaries).

These changes cannot remain implicit implementation details. They must be made explicit in route contracts, OpenAPI, and tests.

### 2.2 Goals

| Goal | Observable metric |
|------|-------------------|
| **G1** — Every in-scope financial route serializes `FinancialValue` verbatim where the service layer now emits it | Route tests assert `value`, `type`, `source`, and `completeness.status` at the JSON boundary; no route-level flattening remains |
| **G2** — OpenAPI defines `FinancialValue` once and references it consistently across affected endpoints | `docs/25-api-data/api-surface.openapi.yaml` contains one shared `FinancialValue` component; endpoint schemas reference it rather than redefining envelope fields inline |
| **G3** — Raw-total or forbidden-label response contracts are either split into truthful labeled components or formally deprecated with a dated sunset | OpenAPI descriptions and route docs include dated sunset notes for deprecated fields/endpoints; no silent legacy carry-forward |
| **G4** — Contract tests fail on missing envelope metadata or shape drift for every financial endpoint family in scope | Each route family in §4 has at least one field-level contract assertion covering `value`, `type`, `source`, `completeness.status`, and deprecation behavior where applicable |
| **G5** — POST/command routes preserve truthful request/response boundaries | Request payloads remain bare where they are operator inputs; response payloads return labeled envelope fields where committed financial facts are emitted |
| **G6** — Phase 1.2 does not re-author service logic or widen into UI redesign | EXEC-SPEC and review log record zero route-local reclassification logic and zero Phase 1.3 component work inside this phase |
| **G7** — In-scope financial routes no longer imply client-owned tenant scope | For every in-scope route that currently exposes `casino_id`, PRD/EXEC-SPEC records one of: removed from contract, deprecated-and-ignored with sunset, or explicitly out-of-scope with rationale |

### 2.3 Non-Goals

- **Service DTO origination or mapper classification.** Phase 1.1 owns `FinancialValue` creation, `type` selection, `source` strings, completeness derivation, and unit normalization.
- **Broad UI surface migration.** Phase 1.3 owns `<FinancialValue>`, `<AttributionRatio>`, `<CompletenessBadge>`, and forbidden-label cleanup in rendered surfaces.
- **Lint-rule enforcement and truth-telling DOM assertions.** Phase 1.4 owns custom ESLint rules, broad integration coverage, and Playwright DOM assertions.
- **Wave 2 schema or outbox work.** This PRD does not open new tables, triggers, authoring stores, or propagation mechanics.
- **Reclassification of operator inputs, policy/config values, points, or ratios into `FinancialValue`.** The carve-outs in `WAVE-1-CLASSIFICATION-RULES §6` remain unchanged.
- **General API cleanup unrelated to financial semantics.** Non-financial route refactors, unrelated status-code normalization, and transport architecture changes are out of scope unless they are direct blockers to truthful envelope serialization.
- **Policy/config-only routes with no committed financial-fact response.** Routes such as valuation-policy administration remain out of scope unless they emit committed currency facts rather than configuration parameters.

## 3. Users & Use Cases

- **Primary users:** API engineers maintaining `app/api/v1/**` route handlers for financial or financially-adjacent endpoints.
- **Secondary users:** Frontend engineers who consume these routes; QA engineers authoring contract tests; architecture reviewers validating that the transport contract preserves the frozen financial semantics.

**Key jobs:**

- As an **API engineer**, I need a clear list of route families that must return `FinancialValue` so I do not re-invent scope by endpoint.
- As a **frontend engineer**, I need OpenAPI and live route payloads to match exactly so I can build Phase 1.3 on stable transport contracts.
- As a **reviewer**, I need deprecated raw-total contracts to be explicit and time-bounded rather than silently preserved.
- As a **QA engineer**, I need route-boundary assertions that catch envelope flattening and missing authority labels before UI work begins.

## 4. Scope & Feature List

### 4.1 In Scope Route Families

Phase 1.2 applies to route families that return currency-denominated financial facts or aggregates derived from the in-scope service contexts. The goal is not to rewrite every route in `app/api/v1/`, but to cover every HTTP boundary that exposes Wave 1 financial facts.

| Route family | Representative routes | Primary owning service(s) | Phase 1.2 action |
|---|---|---|---|
| Financial transactions | `app/api/v1/financial-transactions/route.ts`, `app/api/v1/financial-transactions/[id]/route.ts` | `services/player-financial/` | Envelope all committed monetary response fields; split request-vs-response schemas |
| Visit collection + detail | `app/api/v1/visits/route.ts`, `app/api/v1/visits/[visitId]/route.ts`, `app/api/v1/visits/[visitId]/financial-summary/route.ts` | `services/visit/`, `services/rating-slip/` | Serialize visit totals as envelope fields and document cents-unit transport |
| Visit live-view | `app/api/v1/visits/[visitId]/live-view/route.ts` | `services/rating-slip/` | Carry Phase 1.1 live-view envelope contract verbatim; add route contract tests |
| Player recent sessions | `app/api/v1/players/[playerId]/recent-sessions/route.ts` | `services/visit/` | Carry Phase 1.1 recent-session envelope contract verbatim; update OpenAPI and tests |
| Rating-slip list/detail surfaces | `app/api/v1/rating-slips/route.ts`, `app/api/v1/rating-slips/[id]/route.ts`, `app/api/v1/rating-slips/closed-today/route.ts`, `app/api/v1/rating-slips/active-players/route.ts` | `services/rating-slip/` | Envelope surfaced financial facts; keep `average_bet` as labeled bare input field in schema |
| Rating-slip modal data | `app/api/v1/rating-slips/[id]/modal-data/route.ts` | `services/rating-slip-modal/` | Formalize `totalCashOut` rename and response envelope contract; document any temporary alias or sunset if Phase 1.1 created one |
| Table sessions and rundown | `app/api/v1/table-sessions/route.ts`, `app/api/v1/table-sessions/[id]/rundown/route.ts`, `app/api/v1/table-rundown-reports/route.ts`, `app/api/v1/table-rundown-reports/[id]/route.ts` | `services/table-context/` | Envelope table financial totals and declared derived values; eliminate unlabeled raw-total transport |
| Shift checkpoints and intelligence | `app/api/v1/shift-checkpoints/route.ts`, `app/api/v1/shift-checkpoints/latest/route.ts`, `app/api/v1/shift-checkpoints/delta/route.ts`, `app/api/v1/shift-intelligence/anomaly-alerts/route.ts`, `app/api/v1/shift-intelligence/alerts/route.ts` | `services/shift-intelligence/` | Preserve metric-kind authority routing decisions from Phase 1.1 and document any deferred hold-percent bare-number contract explicitly |
| Shift dashboard metrics and cash observations | `app/api/v1/shift-dashboards/metrics/tables/route.ts`, `app/api/v1/shift-dashboards/metrics/pits/route.ts`, `app/api/v1/shift-dashboards/metrics/casino/route.ts`, `app/api/v1/shift-dashboards/cash-observations/tables/route.ts`, `app/api/v1/shift-dashboards/cash-observations/pits/route.ts`, `app/api/v1/shift-dashboards/cash-observations/casino/route.ts`, `app/api/v1/shift-dashboards/cash-observations/summary/route.ts` | `services/table-context/`, `services/shift-intelligence/` | Replace forbidden raw labels in API descriptions and serialize envelope fields for monetary metrics only |
| MTL summaries and entries | `app/api/v1/mtl/gaming-day-summary/route.ts`, `app/api/v1/mtl/entries/route.ts`, `app/api/v1/mtl/entries/[entryId]/route.ts` | `services/mtl/` | Preserve `compliance` authority at the wire; ensure summary totals are envelope-wrapped |
| Loyalty financial-value routes | `app/api/v1/loyalty/ledger/route.ts`, `app/api/v1/loyalty/issue/route.ts`, `app/api/v1/loyalty/redeem/route.ts`, `app/api/v1/loyalty/manual-credit/route.ts`, `app/api/v1/loyalty/promotion/route.ts`, `app/api/v1/loyalty/balances/route.ts` | `services/loyalty/` | Envelope currency-denominated value fields only; leave points and policy fields bare by documented carve-out; resolve `casino_id` transport truthfulness on `balances` |

### 4.2 Required API Contract Behaviors

- Route handlers MUST serialize the service envelope verbatim for committed financial facts. No route may replace an envelope with a bare `number`, strip `completeness`, or remap `type`.
- For in-scope financial routes, `casino_id` is not a caller-controlled contract field. If a route currently accepts `casino_id`, Phase 1.2 must either remove it from the public contract or keep it only as an explicitly deprecated and ignored compatibility field with a dated sunset note and a test proving server-side RLS context wins.
- Request payloads that represent operator inputs remain bare numbers where `WAVE-1-CLASSIFICATION-RULES §6` says they are not financial facts. Response payloads for committed facts use the envelope.
- Derived fields that remain in API responses MUST either:
  - return as a truthful `FinancialValue` with declared authority/completeness, or
  - be deprecated with a dated sunset and a pointer to the truthful replacement shape.
- API descriptions, summaries, and schema field names MUST not use forbidden labels such as `Total Drop`, `Handle`, or `Chips Out` except in explicit deprecation notes.
- `totalChipsOut` may not remain the only public field name after Phase 1.2. If a compatibility alias exists for transition safety, its OpenAPI description MUST include a sunset date and replacement field.
- OpenAPI must distinguish command-input shapes from truthful response shapes. Example: `POST /api/v1/financial-transactions` can still accept a bare amount input while returning an envelope-wrapped committed record.

### 4.3 OpenAPI Scope

The OpenAPI work in Phase 1.2 is bounded but mandatory:

- Define a shared `FinancialValue` component schema once in `docs/25-api-data/api-surface.openapi.yaml`.
- Reference that component from the in-scope route schemas rather than copy-pasting the envelope shape.
- Annotate non-wrapped carve-outs explicitly where a route mixes financial facts and bare operator inputs or ratios (`average_bet`, points, `hold_percent`, policy thresholds).
- Add dated sunset notes for deprecated raw-total or renamed legacy fields/endpoints.
- Produce a reviewable spec diff as an explicit Phase 1.2 artifact.

**OpenAPI work buckets (normative):**

- **Bucket A — Existing-path schema amendment.** If a route already exists in `docs/25-api-data/api-surface.openapi.yaml`, Phase 1.2 updates that path and its referenced schemas in place.
- **Bucket B — Missing-path spec authoring.** If an in-scope route exists in code but is absent from `docs/25-api-data/api-surface.openapi.yaml`, Phase 1.2 authors the missing path entry as part of this phase. This is not optional cleanup; it is required to make the wire contract reviewable. EXEC-SPEC must mark each route in Appendix A as Bucket A or Bucket B before implementation starts.

### 4.3A Deprecation Policy

Any deprecated field or endpoint introduced or carried by Phase 1.2 MUST include all of the following:

- an OpenAPI description note beginning with `Deprecated as of YYYY-MM-DD`,
- the replacement field or endpoint path,
- a target removal milestone (`Wave 1 Phase 1.3` or later, explicitly named),
- a route-boundary test that proves both the current compatibility behavior and the stated replacement contract, and
- a structured application log event identifying deprecated-field usage during rollout.

No deprecated alias may remain undocumented. No sunset may be left as “TBD”.

**Observability mechanism (normative):** Phase 1.2 uses structured application logs as the required deprecation telemetry. If a route serves a deprecated field or accepts a deprecated-but-ignored input, it MUST emit a structured log event containing at minimum: route path, deprecated field/input name, replacement contract, request correlation ID, and sunset date. Alternative observability mechanisms may be additive, but structured logs are the mandatory baseline for this phase.

### 4.4 Contract Test Scope

Contract tests in this phase are route-boundary tests, not service unit tests and not UI tests. Each in-scope route family must verify, at minimum:

- envelope shape is present for committed financial response fields,
- `completeness.status` is present and not omitted,
- legacy bare totals are absent or explicitly deprecated per the PRD’s deprecation rules,
- command routes keep request/response boundaries honest, and
- mixed-shape routes document and test bare-number carve-outs intentionally.
- any compatibility `casino_id` field is either rejected, ignored, or absent exactly as the contract says.

Representative route coverage is not sufficient unless it includes field-level assertions. At minimum, one read route and one command route per major family must assert the exact envelope keys on live financial fields.

## 5. Requirements

### 5.1 Functional Requirements

1. Every in-scope route family in §4.1 MUST return `FinancialValue` at the wire for committed financial facts surfaced from the service layer.
2. No route handler may compute or infer `FinancialValue.type` locally unless the Phase 1.1 handoff explicitly documents that the owning service has deferred a field and lead-architect approves the exception. Default rule: route layer is a transport layer, not an authority layer.
3. `docs/25-api-data/api-surface.openapi.yaml` MUST contain a shared `FinancialValue` component used by all in-scope endpoint schemas.
4. Endpoints returning renamed or deprecated financial fields MUST include a dated sunset note in OpenAPI descriptions.
5. Forbidden labels MUST not appear as active API field names, endpoint summaries, or schema descriptions, except as clearly marked deprecation text.
6. If an endpoint currently returns a raw total that cannot be made truthful without a split response, Phase 1.2 MUST either split it or formally deprecate it with a replacement contract.
7. Route-boundary tests MUST be updated or added for every in-scope family.
8. The Phase 1.1 handoff package MUST be consumed explicitly: any deferred service-shape edge case from PRD-070 / EXEC-070 must be resolved or re-deferred in the Phase 1.2 EXEC-SPEC before implementation widens.
9. For every in-scope route that currently exposes `casino_id`, EXEC-SPEC MUST classify it as one of: `remove`, `deprecated-and-ignored`, or `out-of-scope-with-rationale`. Silent preservation is forbidden.
10. Appendix A route inventory MUST be completed and treated as the execution source of truth for Phase 1.2 route coverage.

### 5.2 Non-Functional Requirements

1. Route changes must remain additive or compatibility-managed where possible; breaking response changes require explicit deprecation or migration notes.
2. OpenAPI changes must be reviewable as a single coherent diff, not scattered undocumented edits.
3. No `as any` or route-local schema bypasses may be introduced to force envelope serialization through failing types.
4. Existing authorization, RLS, and transport boundaries remain unchanged; this is a contract-shape migration, not a security-model change.
5. API response performance should not regress materially from envelope wrapping alone; large route rewrites or new fan-out calls are out of scope.
6. Deprecated route/field usage must be observable during rollout, either through explicit logging, metrics, or temporary audit instrumentation named in EXEC-SPEC.

## 6. UX / Flow Overview

- A client calls an in-scope financial GET route and receives envelope-wrapped committed financial values with visible authority metadata in the JSON contract.
- A client sends a command/input route request using the existing operator-input shape where the value is not itself a financial fact, and receives a truthful response shape for the committed resulting fact.
- A client or reviewer reads OpenAPI and sees one canonical `FinancialValue` schema reused across routes rather than route-specific variants.
- A client consuming a renamed or deprecated legacy field sees an explicit sunset note and replacement guidance instead of an undocumented silent contract drift.
- A QA test hits a route boundary and fails if the route strips `type`, `source`, or `completeness.status` from a committed financial value.

## 7. Dependencies & Risks

### Dependencies

- **Phase 1.1 exit gate:** Phase 1.2 implementation is blocked on Phase 1.1 completion per `ROLLOUT-PROGRESS.md`, but PRD drafting is allowed now.
- **Phase 1.1 handoff package:** This PRD depends on the Phase 1.1 verification/handoff artifacts promised in `EXEC-070 WS9`, especially the deferral register and any compatibility alias decisions.
- **OpenAPI baseline:** `docs/25-api-data/api-surface.openapi.yaml` must remain the single canonical transport spec for this phase.
- **Inventory discipline:** `WAVE-1-SURFACE-INVENTORY.md §4` is the route-family seed list; EXEC-SPEC must turn that into a verified implementation inventory.
- **Tenant-scope hardening:** Existing route/query schemas that still model client-provided `casino_id` are legacy transport contracts and must be triaged explicitly during this phase, not left implicit.
- **Representative parity checks:** EXEC-SPEC must name the representative read and command routes used to prove OpenAPI-vs-runtime parity and mixed-shape carve-out handling before implementation starts.

### Risks

- **Route/service drift risk:** If Phase 1.1 leaves unresolved deferred fields, route handlers may be tempted to invent envelope logic locally. This PRD forbids that by default.
- **Alias overhang risk:** Temporary compatibility fields such as `totalChipsOut` can become permanent if the deprecation path is not explicit and dated.
- **Mixed-shape risk:** Routes mixing currency envelopes with bare operator inputs, points, or ratios can become ambiguous unless the carve-outs are explicit in schema and tests.
- **OpenAPI under-documentation risk:** If the shared `FinancialValue` component is not introduced cleanly, routes may drift into per-endpoint envelope variants.
- **Scope creep risk:** Route-family breadth is large. EXEC-SPEC must sequence by ownership and blast radius rather than attempt an undifferentiated global edit.
- **Tenant-contract dishonesty risk:** Routes that continue to accept `casino_id` while deriving scope from RLS will preserve a misleading and potentially abuse-prone HTTP contract even if no data leak occurs.

### Open Questions for EXEC-SPEC

- Which in-scope routes already gain truthful transport “for free” from Phase 1.1 pass-through changes, and which still need explicit route-shape edits?
- Does Phase 1.1 ship any temporary compatibility aliases that Phase 1.2 must formally sunset?
- Are any existing endpoint descriptions or route names load-bearing enough that deprecation, rather than immediate rename/split, is the safer Phase 1.2 move?
- For each legacy `casino_id` route contract, do we remove the field now or retain it as deprecated-and-ignored for one release window?

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Every in-scope route family in §4.1 returns truthful envelope-wrapped financial response fields where committed facts are surfaced
- [ ] Raw-total or forbidden-label API contracts are split or deprecated with dated sunset notes
- [ ] Every in-scope route with legacy `casino_id` input is classified as removed or deprecated-and-ignored, with matching contract behavior

**Data & Integrity**
- [ ] No route layer strips or mutates `type`, `source`, or `completeness.status` from service-originated financial facts
- [ ] Mixed-shape routes document every intentional bare-number carve-out in schema and tests
- [ ] Route-boundary tests prove tenant scope comes from RLS context, not caller-controlled `casino_id`, wherever those contracts previously existed

**Security & Access**
- [ ] No route authorization or RLS posture regresses as part of the contract migration
- [ ] Request/response schema changes do not create new privilege or scope leakage

**Testing**
- [ ] Contract tests pass for every in-scope route family
- [ ] At least one command route and one read route per major family assert exact envelope keys (`value`, `type`, `source`, `completeness.status`) on committed financial fields
- [ ] Contract tests assert deprecation behavior for every retained alias/legacy field and assert `casino_id` override/removal behavior where applicable
- [ ] At least one read route and one command route per major family verify OpenAPI schema parity against the runtime response/request shape
- [ ] Representative mixed-shape contract tests exist for each carve-out category used in Phase 1.2: operator input, points, and `hold_percent`

**Operational Readiness**
- [ ] OpenAPI diff is reviewed and stored as the canonical Phase 1.2 contract change set
- [ ] Deprecations include explicit sunset dates and replacement guidance
- [ ] Deprecated-field or deprecated-endpoint usage emits structured application log events during rollout

**Documentation**
- [ ] `docs/25-api-data/api-surface.openapi.yaml` reflects the new shared `FinancialValue` component
- [ ] Appendix A route inventory is complete with route file, OpenAPI bucket, contract-test file, and deprecation action for every in-scope route
- [ ] `ROLLOUT-PROGRESS.md` is updated to record PRD and later implementation state for Phase 1.2

## 9. Related Documents

- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-PHASE-1.0-SIGNOFF.md`
- `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md`
- `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md`
- `docs/25-api-data/api-surface.openapi.yaml`
- `docs/80-adrs/ADR-052-financial-fact-model-dual-layer.md`
- `docs/80-adrs/ADR-053-financial-system-scope-boundary.md`
- `docs/80-adrs/ADR-054-financial-event-propagation-surface-contract.md`
- `docs/80-adrs/ADR-055-cross-class-authoring-parity.md`

---

## Appendix A: Route Inventory Seed

The table below is the minimum execution inventory for Phase 1.2. `/lead-architect` EXEC-SPEC must either preserve each row as-is or amend it explicitly with rationale before implementation begins.

| Route file | Route family | OpenAPI bucket | Contract test file | `casino_id` action | Deprecation action |
|---|---|---|---|---|---|
| `app/api/v1/financial-transactions/route.ts` | Financial transactions | Bucket B | `app/api/v1/financial-transactions/__tests__/route.test.ts` | Remove from request schema docs; RLS-owned at runtime | None expected |
| `app/api/v1/financial-transactions/[id]/route.ts` | Financial transactions | Bucket B | `app/api/v1/financial-transactions/[id]/__tests__/route.test.ts` | None | None expected |
| `app/api/v1/visits/route.ts` | Visit collection | Bucket B | `app/api/v1/visits/__tests__/route.test.ts` | None unless EXEC-SPEC finds live `casino_id` exposure | None expected |
| `app/api/v1/visits/[visitId]/route.ts` | Visit detail | Bucket B | `app/api/v1/visits/[visitId]/__tests__/route.test.ts` | None | None expected |
| `app/api/v1/visits/[visitId]/financial-summary/route.ts` | Visit detail | Bucket B | create route-boundary contract test if none exists | None | Split or deprecate any raw-total fields discovered in implementation |
| `app/api/v1/visits/[visitId]/live-view/route.ts` | Visit live-view | Bucket B | create route-boundary contract test if none exists | None | None expected |
| `app/api/v1/players/[playerId]/recent-sessions/route.ts` | Player recent sessions | Bucket B | create route-boundary contract test if none exists | None | None expected |
| `app/api/v1/rating-slips/route.ts` | Rating-slip collection | Bucket B | `app/api/v1/rating-slips/__tests__/route.test.ts` | None | Triage raw-total fields |
| `app/api/v1/rating-slips/[id]/route.ts` | Rating-slip detail | Bucket B | `app/api/v1/rating-slips/[id]/__tests__/route.test.ts` | None | Triage raw-total fields |
| `app/api/v1/rating-slips/closed-today/route.ts` | Rating-slip collection | Bucket B | create route-boundary contract test if none exists | None | Split or deprecate any raw-total fields discovered in implementation |
| `app/api/v1/rating-slips/active-players/route.ts` | Rating-slip collection | Bucket B | create route-boundary contract test if none exists | None | Split or deprecate any raw-total fields discovered in implementation |
| `app/api/v1/rating-slips/[id]/modal-data/route.ts` | Rating-slip modal data | Bucket B | `app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts` | None | `totalChipsOut` alias remove or deprecated-and-ignored |
| `app/api/v1/table-sessions/route.ts` | Table sessions | Bucket B | create route-boundary contract test if none exists | None | Split or deprecate any raw-total fields discovered in implementation |
| `app/api/v1/table-sessions/[id]/rundown/route.ts` | Table sessions | Bucket B | create route-boundary contract test if none exists | None | Split or deprecate any raw-total fields discovered in implementation |
| `app/api/v1/table-rundown-reports/route.ts` | Table rundown reports | Bucket B | create route-boundary contract test if none exists | None | Split or deprecate any raw-total fields discovered in implementation |
| `app/api/v1/table-rundown-reports/[id]/route.ts` | Table rundown reports | Bucket B | create route-boundary contract test if none exists | None | Split or deprecate any raw-total fields discovered in implementation |
| `app/api/v1/shift-checkpoints/route.ts` | Shift checkpoints | Bucket B | create route-boundary contract test if none exists | None | Document `hold_percent` carve-outs explicitly in schema and tests |
| `app/api/v1/shift-checkpoints/latest/route.ts` | Shift checkpoints | Bucket B | create route-boundary contract test if none exists | None | Document `hold_percent` carve-outs explicitly in schema and tests |
| `app/api/v1/shift-checkpoints/delta/route.ts` | Shift checkpoints | Bucket B | create route-boundary contract test if none exists | None | Document `hold_percent` carve-outs explicitly in schema and tests |
| `app/api/v1/shift-intelligence/anomaly-alerts/route.ts` | Shift intelligence | Bucket B | create route-boundary contract test if none exists | None | Document `hold_percent` carve-outs explicitly in schema and tests |
| `app/api/v1/shift-intelligence/alerts/route.ts` | Shift intelligence | Bucket B | create route-boundary contract test if none exists | None | Document `hold_percent` carve-outs explicitly in schema and tests |
| `app/api/v1/shift-dashboards/metrics/tables/route.ts` | Shift dashboards metrics | Bucket B | `app/api/v1/shift-dashboards/metrics/tables/__tests__/route.test.ts` | None | Remove forbidden labels from descriptions |
| `app/api/v1/shift-dashboards/metrics/pits/route.ts` | Shift dashboards metrics | Bucket B | `app/api/v1/shift-dashboards/metrics/pits/__tests__/route.test.ts` | None | Remove forbidden labels from descriptions |
| `app/api/v1/shift-dashboards/metrics/casino/route.ts` | Shift dashboards metrics | Bucket B | `app/api/v1/shift-dashboards/metrics/casino/__tests__/route.test.ts` | None | Remove forbidden labels from descriptions |
| `app/api/v1/shift-dashboards/cash-observations/tables/route.ts` | Shift dashboards cash observations | Bucket B | `app/api/v1/shift-dashboards/cash-observations/tables/__tests__/route.test.ts` | None | Remove forbidden labels from descriptions |
| `app/api/v1/shift-dashboards/cash-observations/pits/route.ts` | Shift dashboards cash observations | Bucket B | `app/api/v1/shift-dashboards/cash-observations/pits/__tests__/route.test.ts` | None | Remove forbidden labels from descriptions |
| `app/api/v1/shift-dashboards/cash-observations/casino/route.ts` | Shift dashboards cash observations | Bucket B | `app/api/v1/shift-dashboards/cash-observations/casino/__tests__/route.test.ts` | None | Remove forbidden labels from descriptions |
| `app/api/v1/shift-dashboards/cash-observations/summary/route.ts` | Shift dashboards cash observations | Bucket B | create route-boundary contract test if none exists | None | Remove forbidden labels from descriptions |
| `app/api/v1/mtl/gaming-day-summary/route.ts` | MTL summary | Bucket B | `app/api/v1/mtl/gaming-day-summary/__tests__/route.test.ts` | Deprecated-and-ignored or remove | None expected |
| `app/api/v1/mtl/entries/route.ts` | MTL entries | Bucket B | `app/api/v1/mtl/entries/__tests__/route.test.ts` | Deprecated-and-ignored or remove | None expected |
| `app/api/v1/mtl/entries/[entryId]/route.ts` | MTL entries | Bucket B | `app/api/v1/mtl/entries/[entryId]/__tests__/route.test.ts` | None | None expected |
| `app/api/v1/loyalty/ledger/route.ts` | Loyalty ledger | Bucket A | create route-boundary contract test if none exists | Remove or deprecated-and-ignored if `casino_id` is exposed | None expected |
| `app/api/v1/loyalty/issue/route.ts` | Loyalty issue | Bucket B | `app/api/v1/loyalty/issue/__tests__/route.test.ts` | Remove or deprecated-and-ignored if `casino_id` is exposed | None expected |
| `app/api/v1/loyalty/redeem/route.ts` | Loyalty redeem | Bucket B | `app/api/v1/loyalty/redeem/__tests__/route.test.ts` | Remove or deprecated-and-ignored if `casino_id` is exposed | None expected |
| `app/api/v1/loyalty/manual-credit/route.ts` | Loyalty manual credit | Bucket B | `app/api/v1/loyalty/manual-credit/__tests__/route.test.ts` | Remove or deprecated-and-ignored if `casino_id` is exposed | None expected |
| `app/api/v1/loyalty/promotion/route.ts` | Loyalty promotion | Bucket B | `app/api/v1/loyalty/promotion/__tests__/route.test.ts` | Remove or deprecated-and-ignored if `casino_id` is exposed | None expected |
| `app/api/v1/loyalty/balances/route.ts` | Loyalty balances | Bucket B | `app/api/v1/loyalty/balances/__tests__/route.test.ts` | Remove or deprecated-and-ignored | None expected |

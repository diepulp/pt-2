---
id: PRD-074
title: Financial Telemetry - Wave 1 Phase 1.2B-A - Service Canonicalization
owner: Lead Architect (spec steward); Engineering (implementation)
status: Draft
affects:
  - PRD-070
  - PRD-071
  - PRD-072
  - PRD-073
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
  - docs/25-api-data/api-surface.openapi.yaml
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
created: 2026-04-30
last_review: 2026-04-30
phase: Wave 1 Phase 1.2B-A - Service Canonicalization
pattern: Cross-context service canonicalization + bounded API/DATA shape alignment
http_boundary: true
parent_planning_ref: docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
predecessor_prd: docs/10-prd/PRD-071-financial-telemetry-wave1-phase1.2-api-envelope-at-wire-v0.md
predecessor_exec: docs/21-exec-spec/PRD-071/EXEC-071-financial-telemetry-wave1-phase1.2a-api-transport-stabilization.md
fib_h: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.json
sdlc_category: API/DATA
pipeline_chain: /prd-writer -> /lead-architect EXEC-074 -> /build-pipeline
---

# PRD-074 - Financial Telemetry - Wave 1 Phase 1.2B-A - Service Canonicalization

## 1. Overview

- **Owner:** Lead Architect (spec steward). Engineering owns implementation through `backend-service-builder`, with bounded support from `api-builder` and `qa-specialist`.
- **Status:** Draft
- **Summary:** Phase 1.2B-A canonicalizes the financial telemetry values that Phase 1.2A proved could pass through route handlers unchanged. This slice retires BRIDGE-001 by removing the two remaining service-layer `/100` conversions, enables integer-cents validation at the DTO outbound boundary, and promotes deferred shift-intelligence financial metric fields into `FinancialValue` using the existing `resolveShiftMetricAuthority` router. It also shape-aligns only the named existing OpenAPI path entries and existing tests needed to keep already-covered public contracts truthful. UI render migration, full OpenAPI expansion, full route matrices, runtime observability, and component tests are explicitly deferred to successor phases; the only UI-adjacent exception is the FIB-amended metric-type-aware property-access fix in `anomaly-alert-card.tsx`.

## 2. Problem & Goals

### 2.1 Problem

Phase 1.2A stabilized the API transport layer but intentionally left two service-layer semantic gaps. First, `services/visit/crud.ts` and `services/rating-slip/mappers.ts` still divide database integer cents by 100 before returning `FinancialValue.value` on recent-sessions and live-view surfaces. The system now documents this BRIDGE-001 dollar-float bridge honestly, but the bridge still prevents `financialValueSchema.int()` from being enforced.

Second, shift-intelligence alert DTOs still expose financial metric values as bare `number | null` even though `resolveShiftMetricAuthority` already returns the approved `type` and `source` metadata. The mapper calls the router as a void validation step and discards the return value. Phase 1.2B-A converts that existing routing into actual `FinancialValue` construction while preserving `hold_percent` as a dimensionless ratio.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1 - Retire BRIDGE-001 at service output** | `/100` is removed from the two named mapper sites and affected `FinancialValue.value` fields emit integer cents |
| **G2 - Enforce integer-cents DTO validation** | `financialValueSchema.int()` is active at the relevant outbound boundary after `/100` removal, rejects fractional numeric values, and exact-value tests prove cents-unit semantics |
| **G3 - Promote shift-intelligence financial fields** | `AnomalyAlertDTO` and `ShiftAlertDTO` financial metric fields emit `FinancialValue | null` through `resolveShiftMetricAuthority` |
| **G4 - Preserve the ratio carve-out** | `hold_percent` remains bare `number | null` and is never documented, mapped, or tested as `FinancialValue` |
| **G5 - Keep public artifacts truthful without expanding scope** | Only named existing OpenAPI path entries and route test files are shape-aligned to the canonical service contract |

### 2.3 Non-Goals

- No UI render migration from `formatDollars` to `formatCents`; this is Phase 1.2B-B.
- No UI compatibility edits caused by shift-intelligence public DTO promotion except the FIB-amended metric-type-aware property-access fix in `anomaly-alert-card.tsx`.
- No full OpenAPI expansion beyond the named existing path entries.
- No new OpenAPI path entries, route test files, route test matrices, or coverage patterns.
- No runtime structured logging or deprecated-field observability.
- No BRIDGE-001 consumer audit as implementation work.
- No route-handler construction, re-authoring, or compensation for `FinancialValue`.
- No `hold_percent` wrapping in this or any later phase.
- No Phase 1.3 financial UI components or component test births.
- No Phase 1.4 lint rules, truth-telling harness, or CI mechanical enforcement work.
- No Wave 2 outbox, projection, worker, schema migration, or authoring-store work.

## 3. Users & Use Cases

- **Primary users:** Backend engineers, API engineers, QA reviewers, and the lead architect stewarding the financial telemetry rollout.

**Top Jobs:**

- As a **backend engineer**, I need the remaining `/100` conversions removed in the correct order so service DTOs emit integer cents and can be validated.
- As a **backend engineer**, I need shift-intelligence financial metrics wrapped by the existing authority router so DTO consumers receive labeled financial values without route-layer compensation.
- As an **API engineer**, I need a bounded list of OpenAPI entries and route tests to align so public artifacts remain truthful without starting full surface expansion.
- As a **QA reviewer**, I need focused regression checks for integer values and `hold_percent` carve-out behavior so canonicalization cannot silently revert.
- As a **lead architect**, I need clear stop conditions so any UI, observability, route expansion, or test-matrix demand is split into Phase 1.2B-B instead of absorbed here.

## 4. Scope & Feature List

### 4.1 In Scope

**Service Canonicalization:**
- Remove `/100` from `services/visit/crud.ts` `centsToDollars`.
- Remove `/100` from `services/rating-slip/mappers.ts` `toVisitLiveViewDTO`.
- Ensure `RecentSessionDTO.total_buy_in`, `total_cash_out`, and `net` emit integer-cents `FinancialValue.value`.
- Ensure `VisitLiveViewDTO.session_total_buy_in`, `session_total_cash_out`, and `session_net` emit integer-cents `FinancialValue.value`.
- Enable `financialValueSchema.int()` at the relevant DTO outbound boundary after `/100` removal.

**Shift Intelligence DTO Promotion:**
- Use `resolveShiftMetricAuthority` return values to construct `FinancialValue` for `AnomalyAlertDTO.observedValue`, `baselineMedian`, `baselineMad`, and `thresholdValue`.
- Use `resolveShiftMetricAuthority` return values to construct `FinancialValue` for `ShiftAlertDTO.observedValue`, `baselineMedian`, and `baselineMad`.
- Update `AnomalyAlertDTO` and `ShiftAlertDTO` type signatures per `EXEC-074` Q-1/Q-2 resolution.
- Define the exact `MetricType`-discriminated DTO shape before mapper work starts: financial metrics return `FinancialValue | null`; `hold_percent` remains bare `number | null`.
- Introduce outbound Zod schemas for `AnomalyAlertDTO` and `ShiftAlertDTO`, lifting the DEF-007 waiver.
- Confirm `hold_percent` remains bare `number | null` at every layer.

**Bounded Contract and Test Alignment:**
- Shape-align only `GET /visits/{visit_id}/live-view`, `GET /players/{player_id}/recent-sessions`, and `GET /shift-intelligence/anomaly-alerts` in `docs/25-api-data/api-surface.openapi.yaml`.
- Update only `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` and `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` from key-presence assertions to integer-value assertions.
- Update the existing `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` only if `GET /shift-intelligence/anomaly-alerts` is shape-aligned in this slice; edits are limited to replacing the stale DEC-5 bare-number assertion with the new discriminated shape assertion.
- Update `ROLLOUT-TRACKER.json` for DEF-001, DEF-002, DEF-003, DEF-007 closure and BRIDGE-001 retirement after implementation commit SHA is known.

### 4.2 Out of Scope

- `formatDollars` to `formatCents` UI migration for `start-from-previous.tsx`, `start-from-previous-modal.tsx`, or any discovered consumers.
- Full OpenAPI expansion for the remaining Bucket B routes.
- Full 4-case test matrices for recent-sessions, live-view, or remaining route families.
- Runtime deprecation observability or structured log events.
- New route-handler logic, route-level financial wrapping, or route-level shift-intelligence compensation.
- New OpenAPI schemas, components, fields, paths, or nearby cleanup outside the named entries.
- New route test files, component test files, or new test scenarios, except replacing the existing anomaly-alerts DEC-5 assertion when the named anomaly-alerts OpenAPI entry is shape-aligned.
- OpenAPI or route-boundary coverage for `GET /api/v1/shift-intelligence/alerts` unless the FIB is amended; this route has no Phase 1.2A-authored path entry or route-boundary test.
- Phase 1.3 UI components, broad label cleanup, or formatter consolidation.
- Phase 1.4 ESLint rules and Wave 2 infrastructure.

## 5. Requirements

### 5.1 Functional Requirements

1. BRIDGE-001 retirement must remove `/100` from both named service mapper sites before integer validation is enabled.
2. `FinancialValue.value` for all in-scope `RecentSessionDTO` and `VisitLiveViewDTO` fields must be integer cents after service mapping.
3. `financialValueSchema.int()` must reject fractional numeric values at the relevant DTO outbound boundary after canonicalization; exact-value tests must prove cents-unit semantics.
4. `resolveShiftMetricAuthority` must be the only authority source for shift-intelligence `FinancialValue.type` and `source`.
5. `AnomalyAlertDTO` promoted fields must use a `MetricType`-discriminated shape: financial metric rows expose `FinancialValue | null`; `hold_percent` rows expose bare `number | null`.
6. `ShiftAlertDTO` promoted fields must use the same discriminated shape, subject to `EXEC-074` Q-2 nullability resolution.
7. `hold_percent` must remain a bare `number | null` ratio and must never be represented as `FinancialValue`.
8. OpenAPI edits must be limited to the named existing path entries and existing fields required for shape alignment.
9. Route test edits must be limited to integer-value assertions in the two named existing BRIDGE-001 route test files plus the existing anomaly-alerts DEC-5 assertion if the anomaly-alerts contract is updated.
10. `EXEC-074` must run a pre-flight grep for `observedValue`, `baselineMedian`, `baselineMad`, and `thresholdValue` in `components/`, `hooks/`, and `app/`; if shared DTO promotion breaks any consumer beyond the FIB-amended `anomaly-alert-card.tsx` property-access fix, execution must stop for FIB amendment or successor-slice split.
11. `ROLLOUT-TRACKER.json` must record the listed DEF closures and BRIDGE-001 retirement only after validation evidence and implementation commit SHA are available.

### 5.2 Non-Functional Requirements

1. Existing authorization, RLS, tenant-scope behavior, and route transport behavior must not change.
2. No `as any`, schema bypass, route-local financial reclassification, or duplicated authority routing may be introduced to force type compatibility.
3. Secondary artifact diffs must remain shape-alignment only: no new fields, scenarios, coverage patterns, paths, schemas, components, UI work, or observability.
4. If implementation requires a new test file, new OpenAPI path, UI component edit beyond the FIB-amended `anomaly-alert-card.tsx` property-access fix, route-level compensation, or runtime log event, execution must stop for FIB amendment or successor-slice planning.
5. The slice must be shippable without Phase 1.2B-B, while leaving Phase 1.2B-B able to consume the canonicalized service DTOs without rewrite.

## 6. UX / Flow Overview

- A client calls `recent-sessions` or `live-view` and receives `FinancialValue.value` as integer cents from the service-backed route response.
- DTO outbound validation rejects fractional numeric values; exact-value tests catch a `/100` regression in either named mapper.
- A shift-intelligence client receives `FinancialValue` objects for financial metric values that have an authority mapping.
- A shift-intelligence client continues to receive bare ratio values for `hold_percent`.
- A reviewer checks OpenAPI and sees only the named existing entries aligned to the canonical service DTO shape.
- A focused route test fails if a BRIDGE-001 field returns a non-integer `value`.

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Phase 1.2A exit:** `EXEC-071` closed on 2026-04-30 with route pass-through proven and representative OpenAPI/test artifacts established.
- **FIB pair:** `FIB-H` and `FIB-S` for Phase 1.2B-A are the scope authority for this PRD.
- **Scope review:** `phase-scope-containment.md` provides the guardrail review that split Phase 1.2B-A from Phase 1.2B-B.
- **Financial schema:** `lib/financial/schema.ts` already contains the integer `financialValueSchema` constraint that this phase enables at the DTO outbound boundary.
- **Authority router:** `resolveShiftMetricAuthority` exists from PRD-073 and returns approved authority metadata or `null` for non-financial metrics such as `hold_percent`.
- **Data units:** Database and RPC sources are assumed to return integer cents before BRIDGE-001 `/100` conversion.

### 7.2 Risks

| Risk | Mitigation |
|------|------------|
| Integer validation is enabled before `/100` removal | Make `/100` removal a hard predecessor to validation work in `EXEC-074` |
| Shift-intelligence promotion reveals an authority mismatch | Correct only service mapper or DTO schema behavior; do not compensate in routes or UI |
| `hold_percent` gets wrapped for shape consistency | Carry DEF-NEVER as a hard requirement and require grep/test evidence |
| OpenAPI work expands into nearby cleanup | Apply the OpenAPI kill-switch: named path entries only, existing fields only |
| Route tests grow into a matrix | Limit test edits to integer-value regression assertions in named existing files |
| PRD-074 broad draft scope leaks into execution | Treat this v0 as Phase 1.2B-A only and require a separate PRD/FIB pair for Phase 1.2B-B |
| Shared shift-intelligence DTO promotion breaks existing UI consumers | `EXEC-074` must grep consumers before mapper work; only the FIB-amended `anomaly-alert-card.tsx` metric-type-aware property-access fix is allowed. Any other compile/runtime compatibility edit stops for FIB amendment or split. |
| Existing anomaly-alerts boundary test preserves the stale DEC-5 bare-number contract | Permit a narrow update to that existing test only when the named anomaly-alerts OpenAPI entry is shape-aligned |

### 7.3 Open Questions for EXEC-074

| ID | Question | Owner | Boundary |
|----|----------|-------|----------|
| Q-1 | What exact nullable shape should `AnomalyAlertDTO` use when `resolveShiftMetricAuthority` returns `null`? | Lead Architect + backend-service-builder | May refine DTO/schema implementation; may not wrap `hold_percent` |
| Q-2 | Should `ShiftAlertDTO.observedValue`, `baselineMedian`, and `baselineMad` relax to `FinancialValue | null`, or preserve stricter non-null assumptions for financial metrics? | Lead Architect + backend-service-builder | May refine type signature; may not add route surfaces |
| Q-3 | Do the named existing OpenAPI path entries already contain all fields that need shape alignment? | API engineer | If not, stop for FIB amendment; do not create new path entries |
| Q-4 | Do current UI/hook/app consumers of promoted shift-intelligence fields require compatibility edits after the DTO type change? | Lead Architect + frontend engineer | Resolved by FIB amendment for `anomaly-alert-card.tsx` only; any other edit stops for amendment or split |
| Q-5 | Where exactly is DTO outbound validation executed for each promoted DTO? | backend-service-builder | Must name mapper/service/schema call site and prove it with tests |

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] BRIDGE-001 is retired by removing `/100` from both named mapper sites.
- [ ] Integer-cents DTO outbound validation is enabled after `/100` removal.
- [ ] `AnomalyAlertDTO` and `ShiftAlertDTO` financial metric fields use `FinancialValue | null` from `resolveShiftMetricAuthority`.

**Data & Integrity**
- [ ] In-scope `RecentSessionDTO` and `VisitLiveViewDTO` financial values are integer cents at service output.
- [ ] `hold_percent` remains bare `number | null` and has explicit grep/test evidence.

**Security & Access**
- [ ] Existing RLS, authorization, tenant-scope behavior, and route pass-through behavior remain unchanged.
- [ ] No route handler constructs, mutates, or reclassifies `FinancialValue`.

**Testing**
- [ ] The two named existing BRIDGE-001 route test files assert integer `FinancialValue.value` behavior.
- [ ] Shift-intelligence mapper/schema tests cover promoted financial fields and the `hold_percent` carve-out.
- [ ] The existing anomaly-alerts route-boundary test no longer asserts the stale DEC-5 bare-number contract if the named anomaly-alerts OpenAPI entry is shape-aligned.
- [ ] `npm run type-check` passes after DTO promotion, or execution stops for FIB amendment before implementation proceeds.

**Operational Readiness**
- [ ] Rollback is defined as a single revert of mapper, DTO/schema, named OpenAPI, named test, and tracker edits for BRIDGE-001 retirement and shift-intelligence DTO promotion.
- [ ] No runtime observability or logging work is introduced in this slice.

**Documentation**
- [ ] Named existing OpenAPI path entries are shape-aligned and no additional paths, schemas, or components are modified.
- [ ] `ROLLOUT-TRACKER.json` records DEF-001, DEF-002, DEF-003, DEF-007 closure and BRIDGE-001 retirement with the implementation commit SHA.
- [ ] Phase 1.2B-B remains documented as the owner of UI migration, full OpenAPI expansion, route matrices, and runtime observability.

## 9. Related Documents

**FIB Intake Artifacts**
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.json`
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/phase-scope-containment.md`

**Predecessor PRDs and Execution**
- `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md`
- `docs/10-prd/PRD-071-financial-telemetry-wave1-phase1.2-api-envelope-at-wire-v0.md`
- `docs/10-prd/PRD-072-financial-telemetry-wave1-phase1.1b-visit-anchored-cents-envelope-v0.md`
- `docs/10-prd/PRD-073-financial-telemetry-wave1-phase1.1c-shift-intelligence-authority-routing-v0.md`
- `docs/21-exec-spec/PRD-071/EXEC-071-financial-telemetry-wave1-phase1.2a-api-transport-stabilization.md`

**API, Architecture, Quality, and Governance**
- `docs/25-api-data/api-surface.openapi.yaml`
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- `docs/40-quality/README.md`
- `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`
- `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`
- `docs/patterns/SDLC_DOCS_TAXONOMY.md`

**Rollout Governance**
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`

**ADRs**
- `docs/80-adrs/ADR-052-financial-fact-model-dual-layer.md`
- `docs/80-adrs/ADR-053-financial-system-scope-boundary.md`
- `docs/80-adrs/ADR-054-financial-event-propagation-surface-contract.md`
- `docs/80-adrs/ADR-055-cross-class-authoring-parity.md`

---

## Appendix A: Scope Guardrail Summary

| Guardrail | Rule |
|-----------|------|
| Primary layer | Service/Data |
| Secondary layers | Named OpenAPI entries, two existing BRIDGE-001 route test files, existing anomaly-alerts DEC-5 assertion if shape-aligned, rollout tracker status only |
| OpenAPI kill-switch | No paths, schemas, components, or fields outside named entries |
| Test kill-switch | No new test files, scenarios, coverage patterns, or matrices |
| Route boundary | Route handlers remain transport only |
| UI boundary | No UI edits except the FIB-amended `anomaly-alert-card.tsx` metric-type-aware property-access fix |
| Observability boundary | No runtime logs, metrics, dashboards, or structured events |
| Ratio boundary | `hold_percent` is never `FinancialValue` |

## Appendix B: Successor Slice

Phase 1.2B-B requires its own PRD and FIB pair after Phase 1.2B-A exits. It owns:

- UI render migration from `formatDollars` to `formatCents`.
- Full OpenAPI expansion for remaining route inventory.
- Full route contract matrices and remaining route-boundary tests.
- Runtime deprecation observability.
- BRIDGE-001 consumer audit as implementation work.

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-04-30 | Codex / PRD Writer | Generated from Phase 1.2B-A FIB-H/FIB-S pair; replaced broader Phase 1.2B draft with strict service-canonicalization scope |

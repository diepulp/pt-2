---
id: PRD-076
title: Financial Telemetry - Wave 1 Phase 1.2B-C - Contract Expansion
owner: Lead Architect (spec steward); Engineering (implementation)
status: Draft
affects:
  - PRD-074
  - PRD-075
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
  - docs/25-api-data/api-surface.openapi.yaml
created: 2026-05-03
last_review: 2026-05-03
phase: Wave 1 Phase 1.2B-C - Contract Expansion
pattern: Enforcement-only; OpenAPI annotation + route test expansion
http_boundary: true
parent_planning_ref: docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
predecessor_prd: docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md
parallel_prd: docs/10-prd/PRD-075-financial-telemetry-wave1-phase1.2b-b-render-migration-v0.md
fib_h: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-c/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-c/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.json
sdlc_category: Enforcement / API Contract
pipeline_chain: /prd-writer -> /lead-architect EXEC-076 -> /build-pipeline
---

# PRD-076 — Financial Telemetry — Wave 1 Phase 1.2B-C — Contract Expansion

## 1. Overview

- **Owner:** Lead Architect (spec steward). Engineering owns implementation through `api-builder` and `qa-specialist`.
- **Status:** Draft
- **Summary:** Phase 1.2B-C is the Enforcement slice of Wave 1. Phase 1.2B-A (EXEC-074, commit `e83a2c12`) retired BRIDGE-001 and promoted `ShiftAlertDTO` to a discriminated union — the service contract is stable and integer-cents. However, the majority of financially-relevant route path entries in `api-surface.openapi.yaml` still declare financial fields as bare `number`; `GET /shift-intelligence/alerts` has no OpenAPI path entry at all (DEC-6); and the route-boundary tests for `recent-sessions` and `live-view` cover only the spot-check shape assertions from Phase 1.2A (DEF-005). This slice uses the Q-5 audit to annotate every discovered financially-relevant field that should be a `FinancialValue`, births the missing `GET /shift-intelligence/alerts` path entry, and expands four route test files to route-appropriate boundary matrices. No service layer, UI component, lint rule, or runtime observability work is introduced. This PRD executes in parallel with PRD-075 (Phase 1.2B-B render migration) — no shared runtime/source files exist between them; rollout tracker edits require ordinary merge sequencing.

---

## 2. Problem & Goals

### 2.1 Problem

Three gaps remain after Phase 1.2B-A:

**Gap 1 — OpenAPI documentation is stale.** Most financially-relevant route path entries in `api-surface.openapi.yaml` still declare financial fields as bare `number`, while the service now emits integer-cents `FinancialValue` objects. A developer or API consumer reading the spec sees a different type than the service actually produces.

**Gap 2 — DEC-6: `GET /shift-intelligence/alerts` has no OpenAPI path entry.** The route handler at `app/api/v1/shift-intelligence/alerts/route.ts` is live and `ShiftAlertDTO` was promoted to a discriminated union in Phase 1.2B-A, but the route does not appear in `api-surface.openapi.yaml` at all. A consumer cannot know this route exists or what shape it returns.

**Gap 3 — Route-boundary tests are spot-checks only (DEF-005).** The route tests for `recent-sessions` and `live-view` added in Phase 1.2A cover only the BRIDGE-001 field-presence assertion. The route-appropriate 4-case matrices are absent: `recent-sessions` needs auth failure, invalid params, empty result, and full success with integer-cents financial shape; `live-view` needs auth failure, not-found, service error, and full success with integer-cents financial shape. `shift-intelligence/alerts` has no route test at all; `anomaly-alerts` has no 4-case matrix aligned to the promoted discriminated-union shape.

These gaps do not block Phase 1.2B-B from shipping — the render fix is independent. They do prevent Phase 1.3 from using `api-surface.openapi.yaml` as a reliable reference for UI component design, and they leave the route test suite unable to catch regressions in the boundary cases that matter most.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1 — OpenAPI parity** | Every Q-5 field classified as `FinancialValue` in `api-surface.openapi.yaml` references `$ref: '#/components/schemas/FinancialValue'`; intentional bare-number fields have recorded rationale |
| **G2 — DEC-6 closed** | `GET /shift-intelligence/alerts` path entry exists in `api-surface.openapi.yaml` with correct `ShiftAlertDTO` discriminated-union schema |
| **G3 — DEF-005 closed** | `recent-sessions` and `live-view` route test files each have route-appropriate 4-case boundary matrices (`recent-sessions`: 401, invalid params, empty, success; `live-view`: 401, 404, service error, success) with integer-cents `FinancialValue` assertions |
| **G4 — Alerts test born** | `shift-intelligence/alerts` route test born with 4-case boundary matrix |
| **G5 — Clean build** | `npm run type-check`, `npm run lint`, `npm run build` exit 0 |
| **G6 — Targeted test gate** | Changed/born route-boundary tests execute green with targeted Jest command(s) recorded in implementation notes |
| **G7 — Tracker closure** | DEF-005 closed in `ROLLOUT-TRACKER.json` with implementation commit SHA or explicit pending-SHA protocol; DEC-6 recorded in resolved decisions |

### 2.3 Non-Goals

- No service layer, route handler, mapper, or DTO logic changes — Phase 1.2B-A is complete.
- No UI component changes of any kind — Phase 1.3.
- No `formatDollars → formatCents` render migration — Phase 1.2B-B (parallel).
- No ESLint rule authoring (`no-unlabeled-financial-value`, `no-forbidden-financial-label`) — Phase 1.4.
- No CI gate for OpenAPI envelope regression — Phase 1.4.
- No structured log events per deprecated-field usage at route handlers — Phase 1.4 (**note:** PRD-075 Appendix B listed these as Phase 1.2B-C; the 1.2B-C FIB, frozen 2026-05-03, supersedes that description; this PRD governs).
- No deprecation observability wiring — Phase 1.4.
- No component test births (`start-from-previous.test.tsx`, `start-from-previous-modal.test.tsx`, `rating-slip-modal.test.tsx`) — Phase 1.3 per DEF-006.
- No `components/financial/FinancialValue.tsx`, `AttributionRatio.tsx`, or `CompletenessBadge.tsx` — Phase 1.3.
- No `lib/format.ts` formatter consolidation — Phase 1.3.
- No expansion of `shift-dashboards` route test families beyond DEF-005 named routes (`recent-sessions`, `live-view`) — separate Enforcement slice or Phase 1.4.
- No `hold_percent` wrapping in `FinancialValue` at any layer in any phase (DEF-NEVER).
- No SQL migrations — Wave 2.
- No structural expansion of the `FinancialValue` component beyond correcting its `value` semantics to integer cents. Path-level `$ref` additions remain the primary OpenAPI change.

---

## 3. Users & Use Cases

- **Primary users:** API consumers (frontend developers reading `api-surface.openapi.yaml` for Phase 1.3 component design); the route test suite catching regressions; the lead architect closing DEF-005 and DEC-6.

**Top Jobs:**

- As a **frontend developer** starting Phase 1.3, I need `api-surface.openapi.yaml` to accurately describe the shape of every financially-relevant route so I can design `FinancialValue.tsx` against a reliable contract without cross-referencing the service implementation.
- As a **QA engineer or CI system**, I need the `recent-sessions` and `live-view` route tests to cover the 4 standard boundary cases so a regression in auth handling, 404 behavior, or financial field shape is caught before it reaches production.
- As the **lead architect**, I need DEF-005 and DEC-6 closed with real commit SHAs so the rollout tracker accurately reflects what Phase 1.2B has delivered and Phase 1.3 can begin on a verified baseline.

---

## 4. Scope & Feature List

### 4.1 Precondition Gate

Phase 1.2B-A exit gate must be confirmed (EXEC-074, commit `e83a2c12`, 2026-04-30): `FinancialValue.value` is integer cents, `financialValueSchema.int()` enforced, `ShiftAlertDTO` is a discriminated union, BRIDGE-001 retired. If not confirmed, this PRD is invalid and execution must halt.

### 4.2 In Scope

**Q-5 OpenAPI Audit (grep-only discovery, no logic change):**
- Grep `api-surface.openapi.yaml` for financially-relevant field names (`buy_in`, `cash_out`, `net`, `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue`, `totalCashOut`) that appear without an adjacent `$ref: '#/components/schemas/FinancialValue'`.
- Before EXEC implementation starts, record the explicit Q-5 route/field inventory: each financially-relevant route field, its intended schema (`FinancialValue`, bare ratio, points, operator input, or deferred cents number), and whether it is changed or intentionally excluded in this slice.
- Confirm `FinancialValue` component exists and its `value` field documents integer-cents semantics.

**OpenAPI Annotation — existing paths:**
- Add `$ref: '#/components/schemas/FinancialValue'` to all financially-relevant fields in each unannotated path entry, replacing bare `number` schema entries.
- `hold_percent` must remain bare `number | null` in all schemas — DEF-NEVER hard invariant, verified during annotation.

**DEC-6 Path Entry Birth:**
- Add `GET /shift-intelligence/alerts` path entry to `api-surface.openapi.yaml`.
- Response schema: `ShiftAlertDTO` discriminated union with `metricType` present. Financial metric branches (`drop_total`, `win_loss_cents`, `cash_obs_total`) expose `observedValue`, `baselineMedian`, and `baselineMad` as `FinancialValue | null`. Ratio branch (`metricType: 'hold_percent'`) exposes the same metric fields as bare `number | null` (DEF-NEVER). `thresholdValue` is not part of `ShiftAlertDTO` and must not be documented on this route.
- OpenAPI schema must use explicit `oneOf` branches (or reusable equivalent component schemas) for `ShiftAlertDTO`. Both branches require `metricType`, `observedValue`, `baselineMedian`, and `baselineMad`; the financial branch constrains `metricType` to `drop_total | win_loss_cents | cash_obs_total`; the ratio branch constrains `metricType` to `hold_percent`.
- `FinancialValue.value` must be documented as integer cents in the shared component, using `type: integer` unless the OpenAPI toolchain forces `number` plus an explicit integer constraint.
- Shape verified against `services/shift-intelligence/dtos.ts` during EXEC-SPEC planning.

**Existing Shift Alert Contract Tightening:**
- Update `GET /shift-intelligence/anomaly-alerts` OpenAPI schema to be branch-valid, not merely field-annotated. Its `AnomalyAlertDTO` response must use explicit `oneOf` branches (or reusable equivalent component schemas) so `metricType: hold_percent` cannot be paired with `FinancialValue` fields, and financial metric branches cannot expose bare ratio numbers for `observedValue`, `baselineMedian`, `baselineMad`, or `thresholdValue`.

**Route Test Expansion — recent-sessions:**
- Extend `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` with 4-case matrix: 401 unauthorized, invalid-params, empty result for missing/cross-tenant/no-session player state, success asserting integer-cents `FinancialValue` shape on `total_buy_in`, `total_cash_out`, `net`.

**Route Test Expansion — live-view:**
- Extend `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` with 4-case matrix: 401 unauthorized, 404 visit-not-found, service error, success asserting integer-cents `FinancialValue` shape on `session_total_buy_in`, `session_total_cash_out`, `session_net`.

**Route Test Birth — shift-intelligence/alerts:**
- Birth `app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts` with 5-case matrix: 401 unauthorized, invalid or missing `gaming_day` query asserting the actual route status/body emitted by `alertsQuerySchema` validation, empty array result, ratio-branch `ShiftAlertDTO` (`metricType: 'hold_percent'`) asserting bare numeric metric fields, success with financial-branch `ShiftAlertDTO` asserting `FinancialValue | null` on `observedValue`, `baselineMedian`, and `baselineMad`. The test must assert `thresholdValue` and a standalone `hold_percent` field are absent.

**Route Test Expansion — anomaly-alerts:**
- Extend `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` to 4-case matrix aligned to the discriminated-union shape from Phase 1.2B-A: `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` as `FinancialValue | null`; `hold_percent` as bare `number | null`.

**Tracker Closure:**
- Close DEF-005 in `ROLLOUT-TRACKER.json` with implementation commit SHA when known. If closure lands inside the implementation commit, use explicit `commit_sha_pending: true` and require a tracker-only follow-up that replaces it with the real SHA before Phase 1.3 begins.
- Add DEC-6 to resolved decisions list with implementation commit SHA or the same pending-SHA protocol.

### 4.3 Out of Scope

- Service layer, route handler, mapper, DTO, and schema files — zero logic changes.
- UI component and formatter files — Phase 1.3.
- ESLint rule authoring, CI gate configuration — Phase 1.4.
- Structured log events, deprecation observability — Phase 1.4.
- Component test births (DEF-006) — Phase 1.3.
- Expansion of `shift-dashboards` route test families beyond DEF-005 named routes.
- `hold_percent` FinancialValue wrapping — DEF-NEVER.
- `FinancialValue` component structural expansion — only `value` integer-cents documentation/type semantics may be corrected.
- Contract changes outside route path schema annotation, branch-valid alert DTO schema documentation, the DEC-6 path birth, and tracker closure.

---

## 5. Requirements

### 5.1 Functional Requirements

1. Every financially-relevant path entry identified in the Q-5 route/field inventory must reference `$ref: '#/components/schemas/FinancialValue'` for each field classified as a `FinancialValue` after the annotation pass.
2. `GET /shift-intelligence/alerts` path entry must exist in `api-surface.openapi.yaml` with the correct `ShiftAlertDTO` discriminated-union schema: `metricType` discriminant present; financial metric branches expose `observedValue`, `baselineMedian`, and `baselineMad` as `FinancialValue | null`; ratio branch (`metricType: 'hold_percent'`) exposes those metric fields as bare `number | null`; no `thresholdValue` field on this route.
3. `hold_percent` must remain a ratio discriminant/semantic branch, never a `FinancialValue` field — verified across all OpenAPI schemas including the new DEC-6 entry and existing `anomaly-alerts` entry.
4. `recent-sessions` route test must have 4-case matrix: 401, invalid params, empty array, success asserting integer-cents `FinancialValue` shape.
5. `live-view` route test must have 4-case matrix: 401, 404, service error, success asserting integer-cents `FinancialValue` shape.
6. `shift-intelligence/alerts` route test must be born with invalid-query coverage and discriminated-union branch assertions.
7. `anomaly-alerts-route-boundary.test.ts` must be expanded to 4-case matrix matching the discriminated-union shape from Phase 1.2B-A.
8. `anomaly-alerts` OpenAPI schema must be branch-valid against the Phase 1.2B-A `AnomalyAlertDTO` discriminated union, not merely field-level `oneOf`.
9. DEF-005 must be closed in `ROLLOUT-TRACKER.json` with implementation commit SHA or explicit pending-SHA protocol.
10. DEC-6 must be recorded in resolved decisions in `ROLLOUT-TRACKER.json` with implementation commit SHA or explicit pending-SHA protocol.

### 5.2 Non-Functional Requirements

1. `npm run type-check` must exit 0.
2. `npm run lint` must exit 0.
3. `npm run build` must exit 0.
4. No service logic, route logic, UI logic, lint rule, or observability wiring is introduced; if any downstream artifact requires these, execution must stop for FIB amendment.
5. The slice must be shippable without Phase 1.2B-B completing first (no shared runtime/source files; the two slices are parallel, but rollout tracker edits require normal merge sequencing).
6. The slice must leave Phase 1.3 able to proceed against `api-surface.openapi.yaml` as an accurate contract reference without modifying it.

---

## 6. UX / Flow Overview

This slice is an Enforcement and API documentation slice — there is no user-facing UX change. The observable effect for downstream consumers:

- A developer reading `api-surface.openapi.yaml` for `GET /players/{playerId}/recent-sessions` now sees `$ref: '#/components/schemas/FinancialValue'` for `total_buy_in`, `total_cash_out`, `net` — not bare `number`.
- A developer reading `api-surface.openapi.yaml` for `GET /shift-intelligence/alerts` finds a path entry documenting the `ShiftAlertDTO` discriminated-union response shape for the first time.
- A CI pipeline running the route test suite now asserts the 4-case boundary matrix for `recent-sessions` and `live-view`, and holds a birth assertion set for `shift-intelligence/alerts`.
- Phase 1.3 UI component design can reference `api-surface.openapi.yaml` as an accurate contract.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Phase 1.2B-A exit gate:** EXEC-074 closed 2026-04-30 (commit `e83a2c12`). `FinancialValue.value` is integer cents; `financialValueSchema.int()` enforced; `ShiftAlertDTO` promoted to discriminated union; BRIDGE-001 retired.
- **`FinancialValue` component:** Already defined at `api-surface.openapi.yaml`; component value semantics must be corrected to integer cents if stale, but no new component fields are introduced.
- **`GET /shift-intelligence/alerts` route handler:** Confirmed live at `app/api/v1/shift-intelligence/alerts/route.ts` — DEC-6 is documentation only; no implementation work required.
- **PRD-075 (Phase 1.2B-B):** Independent parallel slice; can run concurrently. No shared runtime/source files; `ROLLOUT-TRACKER.json` edits require ordinary merge sequencing.

### 7.2 Risks

| Risk | Mitigation |
|------|------------|
| Q-5 audit finds routes whose financial fields are plain-number DTOs, not FinancialValue | Bare-number fields stay bare; only `FinancialValue` fields receive `$ref` annotations. Scope does not expand. |
| `anomaly-alerts` 4-case expansion reveals unexpected shape drift from Phase 1.2B-A | Stop; compare against EXEC-074 artifacts and `services/shift-intelligence/dtos.ts` before amending tests. |
| DEC-6 path entry shape does not match the live `ShiftAlertDTO` | Verify against `services/shift-intelligence/dtos.ts` during EXEC-SPEC planning; treat a shape mismatch as a blocker before writing YAML. |
| `anomaly-alerts` OpenAPI remains field-level `oneOf` and permits impossible branch combinations | Convert to explicit branch-valid `oneOf` aligned to `AnomalyAlertDTO`; add contract validation or review evidence that `hold_percent` cannot pair with `FinancialValue` fields. |
| Temptation to expand `shift-dashboards` test families while touching nearby shift-intelligence files | Reject per §4.3; DEF-005 names only `recent-sessions` and `live-view`. |
| PRD-075 Appendix B described structured log events and deprecation observability as Phase 1.2B-C scope | The frozen FIB-H governs scope; PRD-075 Appendix B is superseded by this PRD §2.3 and Appendix B below. |

### 7.3 Open Questions for EXEC-076

- **Q-5 route/field inventory:** Exact route/field inventory of financially-relevant fields resolved during the Q-5 audit in EXEC-SPEC planning — grep step, not a design question. The inventory must classify every candidate field as `FinancialValue`, bare ratio, points, operator input, deferred cents number, or excluded with rationale.
- **`ShiftAlertDTO` discriminant field name:** Verify against `services/shift-intelligence/dtos.ts` during EXEC-SPEC before writing the DEC-6 OpenAPI path entry.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Q-5 route/field inventory is recorded with classification and disposition for every candidate financially-relevant field.
- [ ] Every Q-5 field classified as `FinancialValue` in `api-surface.openapi.yaml` references `$ref: '#/components/schemas/FinancialValue'`.
- [ ] `GET /shift-intelligence/alerts` path entry exists in `api-surface.openapi.yaml` with `ShiftAlertDTO` discriminated-union schema (DEC-6 closed).
- [ ] `ShiftAlertDTO` OpenAPI schema uses explicit `oneOf` branches (or reusable equivalent component schemas) with required `metricType`, `observedValue`, `baselineMedian`, and `baselineMad` in both branches.
- [ ] `AnomalyAlertDTO` OpenAPI schema for `GET /shift-intelligence/anomaly-alerts` is branch-valid via explicit `oneOf` branches (or reusable equivalent component schemas) and cannot document impossible `metricType`/field-shape combinations.
- [ ] `FinancialValue.value` is documented as integer cents in the shared OpenAPI component (`type: integer` preferred; otherwise explicit integer constraint plus rationale).
- [ ] Shared `FinancialValue` component contains no stale `Dollar-float` / BRIDGE-001 value-unit wording.
- [ ] `hold_percent` is never wrapped as `FinancialValue`; ratio-branch metric values remain bare `number | null` in all OpenAPI schemas including DEC-6 and `anomaly-alerts`.
- [ ] Q-5 audit command recorded with output confirming no remaining financially-relevant bare-number fields where `FinancialValue` is the correct type, and no intentional exclusions without rationale.

**Data & Integrity**
- [ ] `recent-sessions` route test has 4-case matrix: 401 asserts unauthorized; invalid params assert request validation failure; empty result returns 200 with no sessions; success case asserts `total_buy_in.value` is an integer (not float), and `type`, `source`, `completeness.status` are present.
- [ ] `recent-sessions` cross-tenant/no-access case proves no tenant data is returned; it must not merely duplicate a generic empty-state assertion without documenting why the route maps no-access to empty output.
- [ ] `live-view` route test has 4-case matrix: 401, 404, service error, success with integer-cents `FinancialValue` shape on `session_total_buy_in`, `session_total_cash_out`, `session_net`.
- [ ] `shift-intelligence/alerts` route test born with invalid-query coverage plus branch assertions: 401, invalid/missing `gaming_day` with actual status/body asserted, empty array, ratio-branch `ShiftAlertDTO` asserting bare numeric metric fields, financial-branch `ShiftAlertDTO` asserting `FinancialValue | null` on `observedValue`, `baselineMedian`, and `baselineMad`, and absence assertions for `thresholdValue` plus any standalone `hold_percent` field.
- [ ] `anomaly-alerts-route-boundary.test.ts` expanded to 4-case matrix aligned to discriminated-union shape from Phase 1.2B-A.

**Security & Access**
- [ ] No route handler, service, RLS policy, or authorization behavior is changed.

**Testing**
- [ ] `npm run type-check` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm run build` exits 0.
- [ ] Targeted Jest command(s) for the four changed/born route-boundary test files exit 0 and are recorded in implementation notes.
- [ ] OpenAPI branch-validity check or documented manual schema review confirms `ShiftAlertDTO` and `AnomalyAlertDTO` cannot encode impossible `metricType`/field-shape combinations.
- [ ] No new test files created beyond `shift-intelligence/alerts/__tests__/route.test.ts`.

**Operational Readiness**
- [ ] Rollback defined as revert of `api-surface.openapi.yaml` annotation changes + four test file changes + `ROLLOUT-TRACKER.json` DEF-005/DEC-6 closure entries.
- [ ] No observability, logging, or runtime instrumentation introduced.

**Documentation**
- [ ] DEF-005 closed in `ROLLOUT-TRACKER.json` with implementation commit SHA, or `commit_sha_pending: true` plus a required tracker-only SHA closure follow-up before Phase 1.3.
- [ ] DEC-6 recorded in resolved decisions in `ROLLOUT-TRACKER.json` with implementation commit SHA, or the same pending-SHA protocol.
- [ ] Structured log events and deprecation observability documented as Phase 1.4 scope, superseding PRD-075 Appendix B.

---

## 9. Related Documents

**FIB Intake Artifacts**
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-c/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-c/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.json`

**Predecessor and Parallel PRDs**
- `docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md`
- `docs/10-prd/PRD-075-financial-telemetry-wave1-phase1.2b-b-render-migration-v0.md`

**Execution Specs (predecessor)**
- `docs/21-exec-spec/PRD-074/EXEC-074-financial-telemetry-wave1-phase1.2b-a-service-canonicalization.md`

**Architecture, API, and Governance**
- `docs/25-api-data/api-surface.openapi.yaml` — primary artifact this PRD annotates
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/40-quality/README.md`
- `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`
- `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`

**Rollout Governance**
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`

---

## Appendix A: Scope Guardrail Summary

| Guardrail | Rule |
|-----------|------|
| Primary class | Enforcement |
| Primary layer | API Contract |
| Secondary layers | Rollout tracker status only (DEF-005 + DEC-6 closure) |
| Logic-bearing files | 0 — no service, UI, or route handler logic changes |
| OpenAPI file | 1 — `docs/25-api-data/api-surface.openapi.yaml` (Q-5 annotations + DEC-6 path birth + branch-valid alert schemas) |
| Route test files expanded | 3 — `recent-sessions/__tests__/route.test.ts`, `live-view/__tests__/route.test.ts`, `anomaly-alerts-route-boundary.test.ts` |
| Route test files born | 1 — `shift-intelligence/alerts/__tests__/route.test.ts` |
| Service boundary | No service layer changes |
| UI boundary | No UI component changes |
| Lint boundary | No ESLint rule authoring |
| Observability boundary | No runtime logs, metrics, or structured events |
| Ratio boundary | `hold_percent` is never `FinancialValue` |
| FinancialValue component | Correct stale integer-cents documentation/type semantics only; no new component fields |

## Appendix B: Scope Supersession — PRD-075 Appendix B

PRD-075 Appendix B (written before the Phase 1.2B-C FIB was frozen) described Phase 1.2B-C as including structured log events and deprecation observability. The FIB governs scope; this PRD supersedes that description.

| Item | PRD-075 Appendix B | This PRD (FIB authority) |
|------|-------------------|--------------------------|
| OpenAPI annotation | ✅ Phase 1.2B-C | ✅ In scope |
| DEC-6 path entry birth | ✅ Phase 1.2B-C | ✅ In scope |
| 4-case route test matrices | ✅ Phase 1.2B-C | ✅ In scope |
| Structured log events per deprecated usage | ✅ Phase 1.4 or Phase 1.2B-C | ❌ Phase 1.4 only |
| Deprecation observability | ✅ Phase 1.4 or Phase 1.2B-C | ❌ Phase 1.4 only |

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-05-03 | PRD Writer | Generated from Phase 1.2B-C FIB-H/FIB-S pair; strict Enforcement-only scope; supersedes PRD-075 Appendix B description of observability ownership |
| v0.1 | 2026-05-03 | Devil's Advocate patch | Tightened Q-5 inventory, branch-valid alert OpenAPI requirements, targeted Jest gate, pending-SHA tracker protocol, and shared tracker sequencing language |

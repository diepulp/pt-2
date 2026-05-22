# FIB-H — Financial Telemetry Phase 1.2B-C — Contract Expansion

status: DRAFT
date: 2026-05-03
owner: Financial Telemetry (Cross-context)

predecessor_fib: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-B-RENDER-MIGRATION.md
predecessor_phase: Phase 1.2B-A (Service Canonicalization — EXEC-074, closed 2026-04-30, commit e83a2c12)

parent:
- FIB-H Phase 1.2B-A §G — full OpenAPI expansion + route test matrices + DEC-6 listed as deferred Enforcement obligation
- ROLLOUT-TRACKER.json DEF-005
- EXEC-074 DEC-6 (GET /shift-intelligence/alerts — no OpenAPI path entry)

parallel_slice: Phase 1.2B-B — Render Migration (independent; no shared files; can execute concurrently)

successor_slice: Phase 1.3 — UI Layer: Split Display + Labels. Requires its own FIB + PRD pair.

---

# Scope Guardrail Block

**Governance reference:** `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`

**One-line boundary:**
This FIB documents the Q-5-audited financially-relevant route contract in `api-surface.openapi.yaml` and expands route-boundary test coverage to route-appropriate matrices; it does not change service output, UI rendering, or wire runtime observability.

**Primary change class:** Enforcement

**Coverage mode:** Full

Exact surfaces in scope:
- `docs/25-api-data/api-surface.openapi.yaml` — all financially-relevant path entries not yet annotated with `$ref: '#/components/schemas/FinancialValue'`, plus the new `GET /shift-intelligence/alerts` path entry (DEC-6)
- `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` — expand to 4-case matrix
- `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` — expand to 4-case matrix
- `app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts` — birth with 4-case matrix
- `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` — expand to 4-case matrix matching the discriminated-union shape from Phase 1.2B-A

No service layer files receive logic changes. No UI component files receive changes. No lint rule authoring.

**Primary layer:** API Contract

Secondary layers: none. No service handler, mapper, schema, or UI file receives logic changes.

**Layer budget:**
- Logic-bearing files: 0 (no service, UI, or route handler logic changes)
- OpenAPI annotation file: 1 (`api-surface.openapi.yaml`)
- Route test files expanded: 3 (recent-sessions, live-view, anomaly-alerts)
- Route test files born: 1 (shift-intelligence/alerts)
- Total files changed: 5 — within the §11 5–7 file threshold.

**§11 multi-boundary justification (required by GOV-FIB-001 §11):**
Implementation touches 5 directory boundaries and 4 bounded contexts — both exceed the §11 single-directory/single-context default. This is consistent with Full/Enforcement classification. GOV-FIB-001 §6.3 explicitly states Full mode is appropriate for Enforcement; §6.3 further states the FIB "must not also introduce new semantics, UI behavior, transport shape, or infrastructure." None of those are present here. Every file touched receives either documentation annotations (OpenAPI) or test assertions (route test matrices) — all pass-through Enforcement work against a contract established by Phase 1.2B-A. No logic change in any file requires knowledge of another file's change. The scale is linear across bounded contexts: each context contributes one route test file and zero service changes. Hidden multi-class scope review is not required.

**Cause vs consequence split:**

| Category | This FIB | Next FIB |
|---|---|---|
| BRIDGE-001 retirement (cause) | Complete — Phase 1.2B-A | — |
| UI render correction (Presentation consequence) | Parallel — Phase 1.2B-B | — |
| OpenAPI contract expansion (Enforcement) | In scope | — |
| Route-boundary test matrices (Enforcement) | In scope | — |
| ESLint financial-label rules (Enforcement infra) | Not in scope | Phase 1.4 |
| CI gate for envelope regression (Enforcement infra) | Not in scope | Phase 1.4 |
| Structured log events per deprecated usage (Observability) | Not in scope | Phase 1.4 |
| UI component birth `FinancialValue.tsx` (UI) | Not in scope | Phase 1.3 |

**Adjacent consequence ledger:**

| Temptation removed from MUST | Why adjacent | Disposition |
|---|---|---|
| ESLint `no-unlabeled-financial-value` / `no-forbidden-financial-label` | Enforcement infrastructure; contract must be fully documented before lint rules enforce against it | Phase 1.4 |
| CI gate: red on `FinancialValue` envelope regression | Natural after contract is documented and tested | Phase 1.4 |
| Structured log events per deprecated-field usage at route handlers | Observability is a different change class from Enforcement | Phase 1.4 |
| `components/financial/FinancialValue.tsx` component birth | Contract stability enables component design, but UI component design is a distinct primary class | Phase 1.3 |
| Expand all `shift-dashboards` route test families beyond DEF-005 | Route families exist; nearby while touching shift-intelligence | DEF-005 names only `recent-sessions` and `live-view` as primary obligation; general dashboard test expansion is a separate Enforcement slice or Phase 1.4 |

At least three items were explicitly removed from MUST scope; each is a different change class (Observability, UI) or a follow-on Enforcement slice beyond DEF-005.

**Atomicity test:**
1. Can this FIB ship without the deferred downstream work? Yes — OpenAPI annotations and route test matrices produce a correctly documented and tested contract; lint rules, CI gates, and observability are independent.
2. Can the deferred downstream work begin after this FIB without rewriting it? Yes — Phase 1.4's lint rules and Phase 1.3's UI components consume the OpenAPI as a reference without modifying it.
3. Is the shipped FIB internally consistent and truthful? Yes — after this FIB every financially-relevant route in the OpenAPI names `FinancialValue` for its financial fields, and route-boundary tests assert the 4-case matrix.

**GOV-FIB-001 §7 red flags check:**
- "Claims one primary class but includes logic work from another class" — No. No service, UI, or observability logic changes.
- "Claims Full coverage mode but defers material Enforcement items" — No. Lint and CI gate are Phase 1.4 by roadmap design; DEF-005 names exactly `recent-sessions` and `live-view` as the test expansion obligation.
- "Must land atomically across service, API, UI, tests, and observability" — No. API documentation + route tests only.
- All remaining red flags: Not triggered.

---

# A. Identity

**Feature name:** Phase 1.2B-C — Contract Expansion

**Feature ID:** FIB-H-FIN-PHASE-1-2B-C

**Related phase:** Wave 1 Phase 1.2B-C (successor to Phase 1.2B-A Service Canonicalization; parallel to Phase 1.2B-B Render Migration)

**Requester / owner:** Vladimir Ivanov

**Date opened:** 2026-05-03

**Priority:** P2 — contract documentation and test coverage gap; does not produce a live display error, but leaves the OpenAPI and route tests stale relative to the stable integer-cents service output established by Phase 1.2B-A.

**Target decision horizon:** Phase 1.2B close

---

# B. Operator Problem

After Phase 1.2B-A retired BRIDGE-001 and promoted `ShiftAlertDTO` to a discriminated union, the API surface contract documentation and test coverage are stale in three ways. First, the majority of financially-relevant route path entries in `api-surface.openapi.yaml` still describe financial fields as bare `number` rather than referencing the `FinancialValue` component — a developer or API consumer reading the spec sees a different type than the service actually emits. Second, `GET /shift-intelligence/alerts` — the route that delivers `ShiftAlertDTO` including promoted financial metric fields — has no path entry in the OpenAPI at all (DEC-6 from EXEC-074), even though the route handler at `app/api/v1/shift-intelligence/alerts/route.ts` is live and `ShiftAlertDTO` was promoted in Phase 1.2B-A. Third, the route-boundary tests for `recent-sessions` and `live-view` cover only the spot-check BRIDGE-001 shape assertion added in Phase 1.2A; route-appropriate boundary matrices are absent (DEF-005), and `shift-intelligence/alerts` has no route test at all. The fix is to document and test the stable contract the service already produces.

---

# C. Pilot-fit / current-slice justification

The OpenAPI documentation and route test matrices are Enforcement artifacts that follow naturally from a stable service contract. Phase 1.2B-A established that stability; the contract is ready to document in full. The work cannot be pushed to Phase 1.3 (UI components) because that phase uses `api-surface.openapi.yaml` as its reference — the spec must be accurate before UI component design begins. DEF-005 was deliberately deferred from Phase 1.2A to avoid documenting a contract that was still changing; the contract is now stable. This FIB can execute in parallel with Phase 1.2B-B (render migration) because neither touches shared files.

---

# D. Primary actor and operator moment

**Primary actor:** API consumer (frontend developer, integration partner, route test suite)

**When does this happen?** When reading `api-surface.openapi.yaml` to understand the wire contract for a financially-relevant route, or when a route-boundary test validates the response shape after the integer-cents canonicalization.

**Primary surface:** `docs/25-api-data/api-surface.openapi.yaml` and the route `__tests__` directories for `recent-sessions`, `live-view`, `anomaly-alerts`, and `shift-intelligence/alerts`.

**Trigger event:** `FinancialValue.value` is integer cents and `ShiftAlertDTO` is a discriminated union (Phase 1.2B-A). The documented contract in `api-surface.openapi.yaml` and the route tests have not caught up to the implemented contract.

---

# E. Feature Containment Loop

1. Developer runs a Q-5 audit: grep `api-surface.openapi.yaml` for financially-relevant field names (`buy_in`, `cash_out`, `net`, `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue`, `totalCashOut`) that appear without an adjacent `$ref: '#/components/schemas/FinancialValue'` → confirms the complete list of unannotated financially-relevant path entries and records why any deferred bare-number fields remain deferred.
2. Developer annotates each unannotated route's response schema with `$ref: '#/components/schemas/FinancialValue'` for each financial field, replacing bare `number` schema entries. The existing `FinancialValue` component may be corrected to document integer-cents `value` semantics, but no new component fields are introduced.
3. Developer adds `GET /shift-intelligence/alerts` path entry to `api-surface.openapi.yaml` with `ShiftAlertDTO` response schema: `metricType` discriminant present; financial metric branches (`drop_total`, `win_loss_cents`, `cash_obs_total`) expose `observedValue`, `baselineMedian`, and `baselineMad` as `FinancialValue | null`; ratio branch (`metricType: 'hold_percent'`) exposes those same metric fields as bare `number | null` (DEF-NEVER). The OpenAPI schema uses explicit `oneOf` branches (or reusable equivalent component schemas) with required `metricType`, `observedValue`, `baselineMedian`, and `baselineMad` in both branches. `thresholdValue` is not part of `ShiftAlertDTO` and must not be documented on this route — closes DEC-6.
4. Developer extends `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` with 4-case matrix: 401 unauthorized, invalid-params, empty result for missing/cross-tenant/no-session player state, success asserting integer-cents `FinancialValue` shape on `total_buy_in`, `total_cash_out`, `net`.
5. Developer extends `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` with 4-case matrix: 401 unauthorized, 404 visit-not-found, service error result, success asserting integer-cents `FinancialValue` shape on `session_total_buy_in`, `session_total_cash_out`, `session_net`.
6. Developer births `app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts` with invalid-query coverage and branch assertions: 401 unauthorized, invalid or missing `gaming_day`, empty array result, ratio-branch `ShiftAlertDTO` (`metricType: 'hold_percent'`) asserting bare numeric metric fields, success with financial-branch `ShiftAlertDTO` asserting `FinancialValue | null` on `observedValue`, `baselineMedian`, and `baselineMad`. The test must assert `thresholdValue` and a standalone `hold_percent` field are absent.
7. Developer extends `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts` to 4-case matrix aligned to the discriminated-union shape promoted in Phase 1.2B-A: `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` as `FinancialValue | null`; `hold_percent` as bare `number | null`.
8. Developer closes DEF-005 in `ROLLOUT-TRACKER.json` with implementation commit SHA; adds DEC-6 to resolved decisions list.
9. Developer runs `npm run type-check`, `npm run lint`, `npm run build` — all exit 0.

---

# F. Required outcomes

- Every financially-relevant path entry in `api-surface.openapi.yaml` references `$ref: '#/components/schemas/FinancialValue'` for its financial fields
- `GET /shift-intelligence/alerts` path entry exists in `api-surface.openapi.yaml` with correct `ShiftAlertDTO` schema (DEC-6 closed)
- `ShiftAlertDTO` OpenAPI schema uses explicit `oneOf` branches (or reusable equivalent component schemas) with required `metricType`, `observedValue`, `baselineMedian`, and `baselineMad` in both branches
- `hold_percent` is never wrapped as `FinancialValue`; ratio-branch metric values remain bare `number | null` in all OpenAPI schemas (DEF-NEVER enforced in documentation)
- `recent-sessions` route test has 4-case matrix (401, invalid params, empty result, success with integer-cents `FinancialValue`)
- `live-view` route test has 4-case matrix (401, 404, service error, success with integer-cents `FinancialValue`)
- `shift-intelligence/alerts` route test born with invalid-query coverage plus ratio-branch and financial-branch assertions
- `anomaly-alerts-route-boundary.test.ts` expanded to 4-case matrix matching discriminated-union shape
- `npm run type-check` exits 0
- `npm run lint` exits 0
- `npm run build` exits 0
- DEF-005 closed in `ROLLOUT-TRACKER.json` with implementation commit SHA

---

# G. Explicit exclusions

**Phase 1.4 scope:**
- ESLint `no-unlabeled-financial-value` / `no-forbidden-financial-label` rules
- CI gate: red on `FinancialValue` envelope regression
- Structured log events per deprecated-field usage at route handlers
- I5 truth-telling harness subset
- Full `shift-dashboards` route family test expansion beyond DEF-005

**Phase 1.3 scope:**
- `components/financial/FinancialValue.tsx`, `AttributionRatio.tsx`, `CompletenessBadge.tsx`
- Forbidden-label removal from DOM (`Handle`, `Total Drop`, etc.)
- `lib/format.ts` and local formatter consolidation
- Component test births: `start-from-previous.test.tsx`, `start-from-previous-modal.test.tsx`, `rating-slip-modal.test.tsx` (DEF-006)
- `components/shift-dashboard-v3/**` migration

**Phase 1.2B-B scope (parallel):**
- `formatDollars → formatCents` migration in `start-from-previous.tsx` (DEF-004)

**All phases:**
- `hold_percent` FinancialValue wrapping — ever (DEF-NEVER)
- Service layer logic changes — complete (Phase 1.2B-A)
- SQL migrations — Wave 2

---

# H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Bundle structured log events for deprecated-field usage | Route handler files are adjacent while birthing alerts test | Observability is a different change class from Enforcement. GOV-FIB-001 §4: secondary classes in Deferred Work only. Structured logging belongs in Phase 1.4 with the lint + truth-telling harness. |
| Expand all `shift-dashboards` route test families in the same pass | `shift-dashboards/metrics/tables` and `cash-observations/summary` have `__tests__` directories; nearby while touching shift-intelligence | DEF-005 explicitly names only `recent-sessions` and `live-view`. Expanding every dashboard family makes this diff multi-sprint. A distinct Enforcement slice or Phase 1.4 owns general dashboard test expansion. |
| Wire `FinancialValue.tsx` UI component alongside OpenAPI documentation | OpenAPI stability enables component design; could start component spec now | UI component birth is a design decision, not an Enforcement annotation. Phase 1.3 owns it. Bundling UI design into an Enforcement FIB violates the change class boundary. |
| Add CI gate for OpenAPI envelope regression to lock in the documented contract | The contract will be fully documented after this FIB | CI pipeline authoring is Phase 1.4 Enforcement infrastructure. Adding it here makes this FIB span CI pipeline changes and contract annotation in one diff, which is harder to review and couples unrelated failure modes. |

---

# I. Dependencies and assumptions

- Phase 1.2B-A exit gate ✅ (EXEC-074, commit `e83a2c12`, 2026-04-30): `FinancialValue.value` is integer cents; `financialValueSchema.int()` enforced; `AnomalyAlertDTO`/`ShiftAlertDTO` promoted to discriminated union; BRIDGE-001 retired
- Phase 1.2B-B is parallel — UI render migration touches only `start-from-previous.tsx`; this FIB touches only `api-surface.openapi.yaml` and route test files; zero shared files
- `GET /shift-intelligence/alerts` route handler exists at `app/api/v1/shift-intelligence/alerts/route.ts` — route implementation is live; the OpenAPI gap is documentation only (DEC-6)
- `ShiftAlertDTO` discriminated union shape is stable (Phase 1.2B-A): financial metric types carry `FinancialValue | null`; ratio branch `metricType: 'hold_percent'` keeps metric values bare `number | null` (DEF-NEVER)
- `FinancialValue` component already defined in `api-surface.openapi.yaml`; its stale integer-cents documentation/type semantics may be corrected, but no new component fields are introduced
- No SQL migration required; no service changes; no UI changes

---

# J. Out-of-scope but likely next

- **Phase 1.3** — UI Layer: `FinancialValue.tsx`, `AttributionRatio.tsx`, `CompletenessBadge.tsx`, forbidden-label removal, formatter consolidation, component test births. Uses the fully-documented OpenAPI as its reference.
- **Phase 1.4** — Validation: ESLint `no-unlabeled-financial-value`, CI gate on envelope regression, I5 truth-telling harness, structured log events.

---

# K. Expansion trigger rule

Amend this brief if any downstream artifact proposes:
- Adding service logic changes (Phase 1.2B-A — complete)
- Adding UI component changes (Phase 1.3)
- Adding lint rule authoring (Phase 1.4)
- Adding structured log event wiring (Phase 1.4)
- Expanding `hold_percent` to a `FinancialValue` wrapper (DEF-NEVER — hard invariant, all phases)
- Expanding route test coverage beyond DEF-005-named routes without amending this FIB

---

# L. Scope authority block

**Intake version:** v1

**Frozen for downstream design:** Yes

**Downstream expansion allowed without amendment:** No

**Open questions allowed to remain unresolved at scaffold stage:** Q-5 (full route inventory audit) is a grep step resolved during EXEC-SPEC planning, not a design question.

**Human approval / sign-off:** Vladimir Ivanov / 2026-05-03

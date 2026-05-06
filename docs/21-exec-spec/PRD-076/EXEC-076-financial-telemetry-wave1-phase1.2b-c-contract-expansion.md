---
prd: PRD-076
title: Financial Telemetry — Wave 1 Phase 1.2B-C — Contract Expansion
status: draft
created: 2026-05-03
fib_h_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-c/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.md
fib_s_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-c/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.json
fib_s_loaded: true
complexity_prescreen: streamlined
write_path_classification: none
gov010_check: waived:enforcement-only-slice-no-new-adrs

workstreams:
  WS1_OPENAPI:
    name: Q-5 Audit + FinancialValue Component Correction + Branch-Valid Anomaly-Alerts + DEC-6 Path Birth
    description: >
      (1) Record Q-5 route/field inventory confirming classification of all
      financially-relevant fields in api-surface.openapi.yaml. Fields already
      annotated (live-view, recent-sessions, rating-slips/modal-data totalCashOut)
      require no change. Deferred fields (shift-dashboards drop_total, win_loss,
      cash-observations totals, MTL currency aggregates) are excluded with rationale.
      (2) Correct the shared FinancialValue component: change value.type from
      `number` to `integer`; remove stale Dollar-float and BRIDGE-001 references
      from the component-level description and value field description.
      (3) Convert GET /shift-intelligence/anomaly-alerts schema from field-level
      oneOf to a branch-valid oneOf discriminated on metricType. Financial branch
      (metricType: drop_total | win_loss_cents | cash_obs_total): observedValue,
      baselineMedian, baselineMad, thresholdValue as FinancialValue | null. Ratio
      branch (metricType: hold_percent): same fields as bare number | null.
      DEF-NEVER invariant confirmed: hold_percent never appears as FinancialValue.
      (4) Birth GET /shift-intelligence/alerts path entry (DEC-6): discriminated
      union on metricType; explicit oneOf branches document the full ShiftAlertDTO
      contract (id, tableId, tableLabel, metricType, gamingDay, status, severity,
      observedValue, baselineMedian, baselineMad, deviationScore, direction,
      message, createdAt, updatedAt, acknowledgment). Financial branch
      (metricType: drop_total | win_loss_cents | cash_obs_total) carries
      FinancialValue | null; ratio branch (metricType: hold_percent) carries bare
      number | null (DEF-NEVER); thresholdValue is absent from this route per
      PRD §4.2. The optional status query parameter (open | acknowledged) is
      documented.
    executor: api-builder
    executor_type: skill
    bounded_contexts: [api-contract, shift-intelligence]
    depends_on: []
    traces_to: [CAP-1, CAP-2, CAP-3]
    outputs:
      - docs/25-api-data/api-surface.openapi.yaml
    gate: type-check
    estimated_complexity: low

  WS2_ROUTE_TESTS:
    name: Route Boundary Test Expansion and Birth
    description: >
      Expand three existing route-boundary test files and birth one new file,
      all aligned to the discriminated-union shapes confirmed in Phase 1.2B-A.
      recent-sessions (EXPAND): extend
      app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts to
      4-case matrix — 401 unauthorized, invalid params (assert validation failure
      status/body), empty result for missing/cross-tenant/no-session player state
      (route-boundary case must assert no mocked other-tenant data is returned; it
      is not formal RLS proof unless backed by integration/RLS coverage),
      success asserting FinancialValue shape on total_buy_in / total_cash_out / net
      with value as integer (not float), type, source, completeness.status present.
      live-view (EXPAND): extend
      app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts to 4-case matrix
      — 401 unauthorized, 404 visit-not-found, service error (5xx), success asserting
      integer-cents FinancialValue shape on session_total_buy_in /
      session_total_cash_out / session_net.
      alerts (BIRTH): create
      app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts with 6-case matrix
      — 401 unauthorized, invalid or missing gaming_day (assert actual status/body
      emitted by alertsQuerySchema validation), empty array result, ratio-branch
      ShiftAlertDTO (metricType: hold_percent) asserting bare numeric observedValue /
      baselineMedian / baselineMad, financial-branch ShiftAlertDTO (metricType:
      drop_total | win_loss_cents | cash_obs_total) asserting FinancialValue | null
      on those fields; absence assertions confirm thresholdValue and any standalone
      hold_percent field are absent from the response shape.
      anomaly-alerts (EXPAND): extend
      services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts to
      4-case matrix aligned to Phase 1.2B-A discriminated-union shape — 401
      unauthorized, invalid window params, empty alerts array, success with both
      branches: financial-metric rows assert FinancialValue | null on observedValue /
      baselineMedian / baselineMad / thresholdValue; hold_percent rows assert bare
      number | null on those fields.
    executor: qa-specialist
    executor_type: skill
    bounded_contexts: [player-sessions, visits, shift-intelligence]
    depends_on: []
    traces_to: [CAP-4, CAP-5, CAP-6, CAP-7]
    outputs:
      - app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts
      - app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts
      - app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts
      - services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts
    gate: test-pass
    estimated_complexity: medium

  WS3_TRACKER:
    name: Tracker Closure + Quality Gates
    description: >
      After WS1 and WS2 are committed with known SHAs, update
      ROLLOUT-TRACKER.json: close DEF-005 with the implementation commit SHA (or
      commit_sha_pending: true + required follow-up before Phase 1.3 if SHA is not
      yet available); add DEC-6 to resolved decisions list with implementation commit
      SHA (or same pending-SHA protocol). Run npm run type-check, npm run lint,
      npm run build. Record targeted Jest commands for the four changed/born test
      files in implementation notes.
    executor: lead-architect
    executor_type: skill
    bounded_contexts: [rollout-governance]
    depends_on: [WS1_OPENAPI, WS2_ROUTE_TESTS]
    traces_to: [CAP-8]
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
    gate: build
    estimated_complexity: low

execution_phases:
  - name: Phase 1 — OpenAPI + Test Expansion (parallel)
    parallel: [WS1_OPENAPI, WS2_ROUTE_TESTS]
  - name: Phase 2 — Tracker Closure
    parallel: [WS3_TRACKER]
---

# EXEC-076 — Financial Telemetry Wave 1 Phase 1.2B-C — Contract Expansion

## Overview

Phase 1.2B-C is the Enforcement slice that documents and validates the stable integer-cents contract established by Phase 1.2B-A (EXEC-074, commit `e83a2c12`, 2026-04-30). It runs in parallel with Phase 1.2B-B (EXEC-075, render migration) — no shared runtime or source files exist between them.

**This is a documentation and test enforcement slice only.** No service logic, route handler, DTO, mapper, UI component, lint rule, or observability wiring is changed. All three workstreams operate exclusively on `api-surface.openapi.yaml`, route `__tests__` files, and the rollout tracker.

**Precondition gate confirmed:** EXEC-074 closed (commit `e83a2c12`). `FinancialValue.value` is integer cents, `financialValueSchema.int()` enforced, `ShiftAlertDTO` is a discriminated union on `metricType`, BRIDGE-001 retired.

**FIB-S authority:** `FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.json` — frozen 2026-05-03, anti-invention enforced.

**Surface classification applicability:** ADR-041 surface classification is **not applicable** to this EXEC-SPEC. This slice births/repairs API contract documentation and route-boundary tests only; it does not introduce a user-facing rendered surface, rendering delivery pattern, page data aggregation pattern, or displayed metric provenance surface. Metric truth semantics are constrained here only at the API DTO/OpenAPI contract boundary.

---

## Q-5 Route/Field Inventory (EXEC-SPEC planning step)

Grep command:
```bash
grep -n "buy_in\|cash_out\|totalCashOut\|observedValue\|baselineMedian\|baselineMad\|thresholdValue\|\"net\"" \
  docs/25-api-data/api-surface.openapi.yaml | grep -v "#\|description\|FinancialValue\|\$ref"
```

| Route | Field | Classification | Disposition |
|-------|-------|---------------|-------------|
| GET /visits/{visit_id}/live-view | session_total_buy_in, session_total_cash_out, session_net | FinancialValue | **DONE** — EXEC-074 WS3; `$ref: '#/components/schemas/FinancialValue'` present |
| GET /players/{player_id}/recent-sessions | total_buy_in, total_cash_out, net | FinancialValue | **DONE** — EXEC-074 WS3; `$ref` present |
| GET /rating-slips/{rating_slip_id}/modal-data | totalCashOut | FinancialValue | **DONE** — `$ref` present |
| GET /rating-slips/{rating_slip_id}/modal-data | averageBet | bare number — operator input | **Excluded** — WAVE-1-CLASSIFICATION-RULES §6 carve-out; documented rationale in YAML |
| GET /shift-intelligence/anomaly-alerts | observedValue, baselineMedian, baselineMad, thresholdValue | FinancialValue\|null (financial branch) / number\|null (ratio branch) | **NEEDS BRANCH-VALID CONVERSION** — field-level `oneOf` present but not discriminant-aware; WS1 converts |
| GET /shift-dashboards/metrics/tables | drop_total, win_loss | bare number (cents) | **Excluded** — explicitly DEFERRED Phase 1.2 in existing YAML; not in FIB-S Q-5 field scope |
| GET /shift-dashboards/cash-observations/summary | cash_out_observed_estimate_total, cash_out_observed_confirmed_total | bare number (cents) | **Excluded** — explicitly DEFERRED Phase 1.2 in existing YAML; not in FIB-S Q-5 field scope |
| GET /mtl/gaming-day-summary | total_in, total_out, et al. | bare number (cents) | **Excluded** — explicitly DEFERRED Phase 1.2 in existing YAML; compliance/mtl_entry classification |
| GET /shift-intelligence/alerts | observedValue, baselineMedian, baselineMad (financial branch) / bare number\|null (ratio branch) | FinancialValue\|null / number\|null | **PATH ABSENT** — DEC-6; WS1 births entry |

**FinancialValue component status:** `value.type: number` (should be `integer`); description references stale Dollar-float/BRIDGE-001 wording. WS1 corrects both.

**ShiftAlertDTO discriminant confirmed:** `metricType` field in `services/shift-intelligence/dtos.ts:197`. `FinancialShiftAlertDTO` carries `metricType: FinancialMetricType` (`drop_total | win_loss_cents | cash_obs_total`); `RatioShiftAlertDTO` carries `metricType: 'hold_percent'`. `thresholdValue` is absent from `ShiftAlertDTO` — confirmed; must not appear in DEC-6 path entry.

---

## Open Question Resolutions

| ID | Question | Resolution | Verification |
|----|----------|------------|--------------|
| Q-5 inventory | Exact route/field inventory of financially-relevant fields | RESOLVED above — grep executed during planning; see inventory table | Grep command recorded; no remaining unclassified fields |
| DEC-6 discriminant | `ShiftAlertDTO` discriminant field name and branch shapes | RESOLVED — `metricType`; `FinancialShiftAlertDTO` \| `RatioShiftAlertDTO`; `thresholdValue` absent | Verified against `services/shift-intelligence/dtos.ts` line 197 |

---

## Workstream Details

### WS1_OPENAPI — Q-5 Audit + FinancialValue Correction + Branch-Valid Anomaly-Alerts + DEC-6 Path Birth

**File:** `docs/25-api-data/api-surface.openapi.yaml` — only this file.

**DO NOT TOUCH:**
- Any service, route handler, mapper, DTO, or component file
- Any test file — test changes belong to WS2_ROUTE_TESTS
- Any OpenAPI path, schema, or component outside those explicitly named below
- `averageBet` in rating-slips/modal-data (operator input, §6 carve-out — do not annotate)
- `hold_percent` in any schema (DEF-NEVER — never FinancialValue)

**Implementation sequence:**

**Step 1 — Correct shared FinancialValue component:**

At `components/schemas/FinancialValue`:
- Change `value.type` from `number` to `integer` (or, if toolchain requires `number`, add `description: Integer cents. Fractional values are rejected at the service boundary via financialValueSchema.int().`)
- Remove "Dollar-float values present on BRIDGE-001 surfaces" wording from the component description — BRIDGE-001 was retired in Phase 1.2B-A
- Update component description to read: "Currency amount in integer cents. BRIDGE-001 retired (Phase 1.2B-A). All in-scope financial fields emit integer cents at service output."
- Update `value` field description to: "Monetary amount in integer cents. Fractional values (dollar-floats) are rejected at the service boundary. Phase 1.2B-A canonicalized all in-scope surfaces."

**Step 2 — Convert anomaly-alerts to branch-valid oneOf:**

Replace the flat `items.type: object` property structure under `GET /shift-intelligence/anomaly-alerts → responses → 200 → data.alerts.items` with a branch-valid `oneOf`. The current field-level approach (each field has its own `oneOf: [FinancialValue, number]`) permits impossible combinations (e.g., `hold_percent` paired with `FinancialValue`). Replace with:

```yaml
items:
  oneOf:
    - description: Financial metric alert (metricType is drop_total | win_loss_cents | cash_obs_total)
      type: object
      required: [tableId, tableLabel, metricType, readinessState, observedValue, baselineMedian, baselineMad, thresholdValue, deviationScore, isAnomaly, severity, message]
      properties:
        tableId: { $ref: '#/components/schemas/UUID' }
        tableLabel: { type: string }
        metricType:
          type: string
          enum: [drop_total, win_loss_cents, cash_obs_total]
          description: Financial metric type. observedValue / baselineMedian / baselineMad / thresholdValue are FinancialValue | null.
        readinessState:
          type: string
          enum: [ready, stale, missing, insufficient_data, compute_failed]
        observedValue:
          allOf:
            - $ref: '#/components/schemas/FinancialValue'
          nullable: true
        baselineMedian:
          allOf:
            - $ref: '#/components/schemas/FinancialValue'
          nullable: true
        baselineMad:
          allOf:
            - $ref: '#/components/schemas/FinancialValue'
          nullable: true
        thresholdValue:
          allOf:
            - $ref: '#/components/schemas/FinancialValue'
          nullable: true
        deviationScore: { type: number, nullable: true }
        isAnomaly: { type: boolean }
        severity: { type: string, nullable: true, enum: [info, warn, critical] }
        message: { type: string }
    - description: Ratio metric alert (metricType is hold_percent). Metric values are dimensionless ratios — never FinancialValue. DEF-NEVER invariant.
      type: object
      required: [tableId, tableLabel, metricType, readinessState, observedValue, baselineMedian, baselineMad, thresholdValue, deviationScore, isAnomaly, severity, message]
      properties:
        tableId: { $ref: '#/components/schemas/UUID' }
        tableLabel: { type: string }
        metricType:
          type: string
          enum: [hold_percent]
          description: Ratio metric type. All metric values are dimensionless ratios. DEF-NEVER invariant — never FinancialValue.
        readinessState:
          type: string
          enum: [ready, stale, missing, insufficient_data, compute_failed]
        observedValue: { type: number, nullable: true, description: 'Dimensionless ratio. Never FinancialValue. DEF-NEVER.' }
        baselineMedian: { type: number, nullable: true, description: 'Dimensionless ratio. Never FinancialValue. DEF-NEVER.' }
        baselineMad: { type: number, nullable: true, description: 'Dimensionless ratio. Never FinancialValue. DEF-NEVER.' }
        thresholdValue: { type: number, nullable: true, description: 'Dimensionless ratio. Never FinancialValue. DEF-NEVER.' }
        deviationScore: { type: number, nullable: true }
        isAnomaly: { type: boolean }
        severity: { type: string, nullable: true, enum: [info, warn, critical] }
        message: { type: string }
```

Update the `GET /shift-intelligence/anomaly-alerts` path description to note branch-valid discriminated union.

**Step 3 — Birth GET /shift-intelligence/alerts path entry (DEC-6):**

Add a new path entry after the anomaly-alerts entry. The route handler lives at `app/api/v1/shift-intelligence/alerts/route.ts`. The path in OpenAPI conventions: `/shift-intelligence/alerts`.

`gaming_day` is the required query parameter (confirmed from `alertsQuerySchema`). `status` is an optional query parameter (`open | acknowledged`) and must be documented because it is accepted by the existing route schema.

Schema structure:
```yaml
/shift-intelligence/alerts:
  get:
    summary: Get shift intelligence alerts
    description: >
      Shift-level alerts for a gaming day based on baseline deviation.
      ShiftAlertDTO discriminated union on metricType (DEC-6 — born Phase 1.2B-C).
      Financial metric branches (drop_total | win_loss_cents | cash_obs_total)
      expose observedValue, baselineMedian, baselineMad as FinancialValue | null.
      Ratio branch (hold_percent) exposes those fields as bare number | null.
      DEF-NEVER invariant: hold_percent is never FinancialValue.
      thresholdValue is absent from this route — not part of ShiftAlertDTO.
    tags: [ShiftIntelligence]
    security:
      - bearerAuth: []
    parameters:
      - name: gaming_day
        in: query
        required: true
        schema: { type: string }
        description: Gaming day in YYYY-MM-DD format.
      - name: status
        in: query
        required: false
        schema:
          type: string
          enum: [open, acknowledged]
        description: Optional alert status filter accepted by alertsQuerySchema.
    responses:
      '200':
        description: Shift intelligence alerts
        content:
          application/json:
            schema:
              allOf:
                - $ref: '#/components/schemas/ServiceHttpResultBase'
                - type: object
                  properties:
                    data:
                      type: object
                      properties:
                        alerts:
                          type: array
                          items:
                            oneOf:
                              - description: Financial metric alert (metricType is drop_total | win_loss_cents | cash_obs_total)
                                type: object
                                required: [id, tableId, tableLabel, metricType, gamingDay, status, severity, observedValue, baselineMedian, baselineMad, deviationScore, direction, message, createdAt, updatedAt, acknowledgment]
                                properties:
                                  id: { $ref: '#/components/schemas/UUID' }
                                  tableId: { type: string }
                                  tableLabel: { type: string }
                                  metricType:
                                    type: string
                                    enum: [drop_total, win_loss_cents, cash_obs_total]
                                  gamingDay: { type: string }
                                  status:
                                    type: string
                                    enum: [open, acknowledged, resolved]
                                  severity:
                                    type: string
                                    enum: [low, medium, high]
                                  observedValue:
                                    allOf:
                                      - $ref: '#/components/schemas/FinancialValue'
                                    nullable: true
                                  baselineMedian:
                                    allOf:
                                      - $ref: '#/components/schemas/FinancialValue'
                                    nullable: true
                                  baselineMad:
                                    allOf:
                                      - $ref: '#/components/schemas/FinancialValue'
                                    nullable: true
                                  deviationScore: { type: number, nullable: true }
                                  direction:
                                    type: string
                                    nullable: true
                                    enum: [above, below]
                                  message: { type: string, nullable: true }
                                  createdAt: { type: string }
                                  updatedAt: { type: string }
                                  acknowledgment:
                                    type: object
                                    nullable: true
                                    required: [acknowledgedBy, acknowledgedByName, notes, isFalsePositive, createdAt]
                                    properties:
                                      acknowledgedBy: { type: string }
                                      acknowledgedByName: { type: string, nullable: true }
                                      notes: { type: string, nullable: true }
                                      isFalsePositive: { type: boolean }
                                      createdAt: { type: string }
                              - description: Ratio metric alert (metricType is hold_percent). DEF-NEVER — never FinancialValue.
                                type: object
                                required: [id, tableId, tableLabel, metricType, gamingDay, status, severity, observedValue, baselineMedian, baselineMad, deviationScore, direction, message, createdAt, updatedAt, acknowledgment]
                                properties:
                                  id: { $ref: '#/components/schemas/UUID' }
                                  tableId: { type: string }
                                  tableLabel: { type: string }
                                  metricType:
                                    type: string
                                    enum: [hold_percent]
                                  gamingDay: { type: string }
                                  status:
                                    type: string
                                    enum: [open, acknowledged, resolved]
                                  severity:
                                    type: string
                                    enum: [low, medium, high]
                                  observedValue: { type: number, nullable: true, description: 'Dimensionless ratio. Never FinancialValue. DEF-NEVER.' }
                                  baselineMedian: { type: number, nullable: true, description: 'Dimensionless ratio. Never FinancialValue. DEF-NEVER.' }
                                  baselineMad: { type: number, nullable: true, description: 'Dimensionless ratio. Never FinancialValue. DEF-NEVER.' }
                                  deviationScore: { type: number, nullable: true }
                                  direction:
                                    type: string
                                    nullable: true
                                    enum: [above, below]
                                  message: { type: string, nullable: true }
                                  createdAt: { type: string }
                                  updatedAt: { type: string }
                                  acknowledgment:
                                    type: object
                                    nullable: true
                                    required: [acknowledgedBy, acknowledgedByName, notes, isFalsePositive, createdAt]
                                    properties:
                                      acknowledgedBy: { type: string }
                                      acknowledgedByName: { type: string, nullable: true }
                                      notes: { type: string, nullable: true }
                                      isFalsePositive: { type: boolean }
                                      createdAt: { type: string }
      '400':
        description: Invalid or missing gaming_day parameter
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ServiceHttpResultBase' }
      '401':
        description: Unauthorized
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ServiceHttpResultBase' }
```

**Acceptance criteria for WS1:**
- `RULE-1` satisfied: Q-5 inventory recorded; every remaining unannotated financially-relevant field classified with rationale
- Q-5 inventory fully reconciles with OpenAPI: every financially-relevant field is either (a) annotated as `FinancialValue` or (b) explicitly excluded with documented rationale; no financially-relevant field remains unclassified
- `RULE-2` satisfied: `hold_percent` is bare `number | null` in anomaly-alerts ratio branch and alerts ratio branch; grep confirms no `hold_percent` paired with `FinancialValue` reference
- `RULE-3` satisfied: `GET /shift-intelligence/alerts` path entry exists with `metricType` discriminant and both branches
- FinancialValue component `value.type` is documented as `integer`; no stale Dollar-float/BRIDGE-001 wording remains in component
- Any OpenAPI schema using `FinancialValue` must not allow fractional values; all `FinancialValue.value` contracts must enforce integer-cents semantics through `type: integer`
- `thresholdValue` does not appear in the DEC-6 alerts path entry
- DEC-6 alerts path documents the full `ShiftAlertDTO` branch contract, including identity, table, gaming day, status, severity, deviation, timestamps, and acknowledgment fields; it is not a telemetry-only partial projection
- DEC-6 alerts path documents optional `status` query parameter (`open | acknowledged`) accepted by `alertsQuerySchema`
- DEC-6 alerts path uses the existing DTO contract for `tableId`. Unless the service DTO is tightened to UUID, document `tableId` as `{ type: string }` rather than `UUID` to avoid an OpenAPI contract stricter than runtime validation
- Anomaly-alerts schema uses branch-valid `oneOf`; impossible `metricType`/field-shape combinations cannot be documented
- Branch-valid `oneOf` schemas are exhaustive and exclusive: every `metricType` variant is covered exactly once, and no branch allows mixed `FinancialValue` and ratio field shapes
- OpenAPI diff reviewed: no unintended schema changes outside (a) `FinancialValue` annotations, (b) anomaly-alerts branch conversion, and (c) DEC-6 alerts path birth
- `npm run type-check` passes (YAML change only — verify no linting/build regressions)
- OpenAPI YAML parses successfully after edits via `npx openapi-typescript docs/25-api-data/api-surface.openapi.yaml --output /tmp/exec076-api-schema.d.ts`; record command/result in implementation notes. Do not use the stale `openapi:*` package scripts unless they are first corrected to target `docs/25-api-data/api-surface.openapi.yaml`
- OpenAPI contract must match DTO contract, not merely parse: all fields emitted as `FinancialValue` by DTOs use `$ref: '#/components/schemas/FinancialValue'`; no bare-number schema exists where the DTO emits `FinancialValue`; any mismatch is a blocking failure

**Decision-to-test injections for WS1:**
- `Verify DEC-6: GET /shift-intelligence/alerts path entry born` — schema review: both branches present, `metricType` required in each, `thresholdValue` absent
- `Verify RULE-2: hold_percent never FinancialValue` — grep `api-surface.openapi.yaml` for any `hold_percent` adjacent to `$ref: '#/components/schemas/FinancialValue'`; must be zero matches

---

### WS2_ROUTE_TESTS — Route Boundary Test Expansion and Birth

**Scope:** Four test files only. No service, route handler, mapper, DTO, or component files.

**DO NOT TOUCH:**
- Any file outside the four named test outputs
- Any OpenAPI schema — test changes must stay in sync with the DTO shape from Phase 1.2B-A, not with WS1 OpenAPI changes
- No new test files beyond `shift-intelligence/alerts/__tests__/route.test.ts`
- No expansion of shift-dashboards route test families (DEF-005 names only recent-sessions and live-view)

**Implementation: recent-sessions (EXPAND)**

File: `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts`

Current state: BRIDGE-001 field-presence assertions (key-presence on `total_buy_in.value`). Phase 1.2B-A integer-value assertions may already be present from EXEC-074 WS3. Extend (do not replace) with:

4-case matrix additions:
1. **401 Unauthorized** — mock `withServerAction`/auth middleware returning the actual unauthorized result for missing/invalid auth; assert `status: 401`. Do not rely on omitted headers alone while middleware is mocked.
2. **Invalid params** — call with malformed `playerId` (non-UUID format); assert validation failure status and body from the route's param validation path
3. **Empty result** — cross-tenant player (player exists in DB but belongs to a different casino_id than the RLS context); assert `status: 200`, `data.sessions: []`, and that no other tenant's session data appears in response
4. **Success with integer-cents FinancialValue shape** — valid playerId with known sessions:
   - `total_buy_in.value` is an integer (use `Number.isInteger(result.data.sessions[0].total_buy_in.value)`)
   - `total_buy_in.type` is present and is a string
   - `total_buy_in.source` is present and is a string
   - `total_buy_in.completeness.status` is one of `complete | partial | unknown`
   - Same assertions for `total_cash_out` and `net`
   - `total_buy_in.value` is not a dollar-float (e.g., assert `!String(value).includes('.')` or use integer check)

Cross-tenant empty case: document in test comment why the route returns empty for cross-tenant players (RLS scopes to casino_id; cross-tenant player has no sessions visible). Because this is a mocked route-boundary test, it may prove response-shape behavior only; do **not** describe it as formal RLS proof unless backed by an integration/RLS test.

**Implementation: live-view (EXPAND)**

File: `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts`

Current state: BRIDGE-001 key-presence assertions. Phase 1.2B-A integer-value assertions may already be present. Extend with:

4-case matrix additions:
1. **401 Unauthorized** — mock `withServerAction`/auth middleware returning the actual unauthorized result for missing auth; assert `status: 401`. Do not rely on omitted headers alone while middleware is mocked.
2. **404 Visit not found** — valid UUID format but non-existent `visitId`; assert `status: 404` or appropriate not-found response
3. **Service error** — mock service layer throwing or returning error; assert `status: 500` or service error propagation
4. **Success with integer-cents FinancialValue shape** — valid `visitId`:
   - `session_total_buy_in.value` is an integer
   - `session_total_buy_in.type`, `source`, `completeness.status` are present
   - Same for `session_total_cash_out` and `session_net`

**Implementation: alerts (BIRTH)**

File: `app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts` — CREATE new file + `__tests__/` directory.

6-case matrix:
1. **401 Unauthorized** — mock `withServerAction`/auth middleware returning the actual unauthorized result for no/invalid auth; assert `status: 401`. Do not rely on omitted headers alone while middleware is mocked.
2. **Invalid or missing gaming_day** — call without `gaming_day` query param (and separately with a malformed value); assert the actual status and body emitted by `alertsQuerySchema` validation (inspect the route handler to determine status code — likely `400`; do not guess, read the route)
3. **Empty array** — valid auth, valid `gaming_day`, no alerts for that day; assert `status: 200`, `data.alerts: []`
4. **Ratio-branch ShiftAlertDTO** — mock shift-intelligence service returning a `RatioShiftAlertDTO` with `metricType: 'hold_percent'`; assert:
   - Full `ShiftAlertDTO` base fields are present: `id`, `tableId`, `tableLabel`, `gamingDay`, `status`, `severity`, `deviationScore`, `direction`, `message`, `createdAt`, `updatedAt`, `acknowledgment`
   - `observedValue` is `number | null` (not a FinancialValue object)
   - `baselineMedian` is `number | null`
   - `baselineMad` is `number | null`
   - `thresholdValue` is **absent** from the response item (not present as a key)
   - No standalone `hold_percent` field appears in the response item
   - A second ratio fixture with `observedValue`, `baselineMedian`, and `baselineMad` set to `null` still serializes those fields as nullable bare values, not FinancialValue envelopes
   - A non-null `acknowledgment` fixture serializes `acknowledgedBy`, `acknowledgedByName`, `notes`, `isFalsePositive`, and `createdAt`
5. **Financial-branch ShiftAlertDTO** — mock returning a `FinancialShiftAlertDTO` with `metricType: 'drop_total'`; assert:
   - Full `ShiftAlertDTO` base fields are present: `id`, `tableId`, `tableLabel`, `gamingDay`, `status`, `severity`, `deviationScore`, `direction`, `message`, `createdAt`, `updatedAt`, `acknowledgment`
   - `observedValue` is `null` or a FinancialValue object (`value` is integer, `type`/`source`/`completeness.status` present)
   - `baselineMedian` is `null` or FinancialValue with integer `value`
   - `baselineMad` is `null` or FinancialValue with integer `value`
   - `thresholdValue` is **absent** (not a key in the response item)
   - No standalone `hold_percent` field in the response item
   - A second financial fixture with `observedValue`, `baselineMedian`, and `baselineMad` set to `null` still serializes nullable fields without violating the branch contract
6. **Optional status query** — call with `?gaming_day=YYYY-MM-DD&status=open` and `status=acknowledged`; assert `alertsQuerySchema` parsed status is passed to `getAlerts`. Invalid status must follow the route validation error path.

**Implementation: anomaly-alerts (EXPAND)**

File: `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts`

Current state: DEC-5 bare-number assertion replaced with discriminated-shape assertion (EXEC-074 WS3). Verify which cases already exist and expand to full 4-case matrix:

4-case matrix:
1. **401 Unauthorized** — mock `withServerAction`/auth middleware returning the actual unauthorized result; assert `status: 401` (add if missing)
2. **Invalid window params** — call with missing/malformed `window_start` or `window_end`; assert validation failure (add if missing)
3. **Empty alerts array** — valid params, no anomalies; assert `status: 200`, `data.alerts: []` (add if missing)
4. **Success with discriminated-union shape** — mock with both branch types in same response array:
   - Financial-metric row (`metricType: 'drop_total'`): `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` are FinancialValue | null; assert `value` is integer when non-null
   - Ratio row (`metricType: 'hold_percent'`): `observedValue`, `baselineMedian`, `baselineMad`, `thresholdValue` are `number | null` (not FinancialValue objects); assert `hold_percent` itself is never wrapped
   - Include null variants for both branches so nullable fields are verified, not only non-null happy-path values

**Acceptance criteria for WS2:**
- `RULE-4` satisfied: all four route test files have route-appropriate 4-case (or 6-case for alerts) matrices
- `RULE-5` satisfied: success cases assert `value` is integer via `Number.isInteger()` or equivalent; no BRIDGE-001 key-presence assertions remain as the sole financial assertion
- `RULE-6` satisfied: alerts route test asserts the discriminated union and `alertsQuerySchema` validation path; `thresholdValue` and standalone `hold_percent` absence confirmed
- Cross-tenant empty case in recent-sessions documents tenant isolation rationale in test comment and explicitly labels the test as route-boundary coverage, not formal RLS proof
- 401 cases mock the middleware/server-action unauthorized result rather than relying on omitted headers while auth middleware is mocked
- Null variants are covered for FinancialValue | null and number | null branch fields
- Alerts route tests assert full `ShiftAlertDTO` base fields, optional `status` query parsing, and non-null `acknowledgment` serialization
- No new test files beyond the one born (`alerts/__tests__/route.test.ts`)
- Targeted Jest command(s) recorded in implementation notes:
  ```bash
  npx jest app/api/v1/players/\[playerId\]/recent-sessions/__tests__/route.test.ts \
            app/api/v1/visits/\[visitId\]/live-view/__tests__/route.test.ts \
            app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts \
            services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts \
    --no-coverage 2>&1 | tee /tmp/exec076-test-run.log
  ```
- Targeted Jest command exits 0; any failure is a blocking condition and must halt execution before WS3_TRACKER
- All four test files exit green

**Decision-to-test injections for WS2:**
- `Verify RULE-5: integer-cents semantics` — success assertions must use `Number.isInteger(value)`, not key-presence only
- `Verify RULE-6: thresholdValue absent from alerts` — assert `'thresholdValue' in responseItem === false`
- `Verify RULE-6: alertsQuerySchema validation path` — read the route handler before writing the invalid-params assertion; assert actual emitted status/body

---

### WS3_TRACKER — Tracker Closure + Quality Gates

**Scope:** `ROLLOUT-TRACKER.json` only. No code changes.

**Prerequisites:** WS1_OPENAPI committed with known SHA, WS2_ROUTE_TESTS committed with known SHA.

**Implementation:**

Update `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`:

1. In `deferred_register`, close `DEF-005`:
   ```json
   "DEF-005": {
     "id": "DEF-005",
     "status": "closed",
     "closed_in": "EXEC-076",
     "commit_sha": "<WS2 commit SHA>",
     "resolution": "4-case route-boundary test matrices added for recent-sessions and live-view; alerts route test born with 6-case matrix; anomaly-alerts expanded to 4-case matrix."
   }
   ```
   If the SHA is not yet available at time of commit (self-referential), use:
   ```json
   "commit_sha_pending": true,
   "commit_sha_pending_note": "Follow-up tracker-only commit required before Phase 1.3 begins."
   ```
   If `commit_sha_pending: true` is used, the follow-up tracker-only commit must be created immediately after merge. Phase 1.3 is blocked and must fail to start until the real `commit_sha` replaces the pending marker.

2. In `open_questions` (or resolved decisions list), record DEC-6 as resolved:
   ```json
   {
     "id": "DEC-6",
     "question": "GET /shift-intelligence/alerts OpenAPI path entry and route-boundary test",
    "resolution": "Path entry born in api-surface.openapi.yaml (EXEC-076 WS1). Route test born with 6-case matrix (EXEC-076 WS2). ShiftAlertDTO discriminated union on metricType documented.",
     "closed_in": "EXEC-076",
     "commit_sha": "<WS1/WS2 commit SHA or pending-SHA protocol>"
   }
   ```

3. Update `cursor.active_phase` and `cursor.next_action` to reflect Phase 1.2B-C complete and Phase 1.3 ready to begin.

**Quality gates (run in order):**
```bash
npm run type-check 2>&1 | tail -5
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

All must exit 0 before tracker commit is finalized.

**Acceptance criteria for WS3:**
- `RULE-7` satisfied: DEF-005 closed in tracker with real commit SHA or pending-SHA protocol
- DEC-6 recorded in resolved decisions with commit SHA or pending-SHA protocol
- `npm run type-check`, `npm run lint`, `npm run build` all exit 0
- No code changes introduced in this workstream — tracker and quality gate only

---

## Intake Traceability Audit

```
[INTAKE TRACEABILITY] EXEC-076 vs FIB-S FIB-S-FIN-PHASE-1-2B-C
─────────────────────────────────────────────────────────────────
Capability coverage:    8/8 CAPs covered
  CAP-1 → WS1_OPENAPI (Q-5 audit)
  CAP-2 → WS1_OPENAPI (annotation + FinancialValue correction + anomaly-alerts branch-valid)
  CAP-3 → WS1_OPENAPI (DEC-6 path birth)
  CAP-4 → WS2_ROUTE_TESTS (recent-sessions)
  CAP-5 → WS2_ROUTE_TESTS (live-view)
  CAP-6 → WS2_ROUTE_TESTS (alerts birth)
  CAP-7 → WS2_ROUTE_TESTS (anomaly-alerts expansion)
  CAP-8 → WS3_TRACKER (tracker closure + quality gates)

Anti-invention (desc):  CLEAN
  WS1 — api-surface.openapi.yaml only; all changes within SURF-1
  WS2 — test files only; all four paths in FIB-S concrete_in_scope_route_test_files
  WS3 — ROLLOUT-TRACKER.json only; governance artifact

Anti-invention (paths): 5/5 output paths verified against FIB-S surfaces
  docs/25-api-data/api-surface.openapi.yaml             → SURF-1 ✓
  app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts → SURF-2 ✓
  app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts         → SURF-3 ✓
  app/api/v1/shift-intelligence/alerts/__tests__/route.test.ts          → SURF-4 ✓
  services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts → SURF-5 ✓

Open questions:         2 resolved / 0 carried / 0 missing
  Q-5 inventory → RESOLVED (grep executed, full table recorded above)
  DEC-6 discriminant → RESOLVED (metricType confirmed in dtos.ts; thresholdValue absent)

Hard rule visibility:   7/7 FIB-S rules in acceptance criteria
  RULE-1 → WS1 AC: Q-5 inventory recorded with classification and rationale
  RULE-2 → WS1 AC: hold_percent confirmed bare number in all schemas; WS2 AC: ratio-branch assertions
  RULE-3 → WS1 AC: alerts path entry with metricType discriminant
  RULE-4 → WS2 AC: all four files have route-appropriate 4/6-case matrices
  RULE-5 → WS2 AC: Number.isInteger() assertions; no BRIDGE-001 key-presence only
  RULE-6 → WS2 AC: discriminated union asserted; alertsQuerySchema path tested; thresholdValue absent
  RULE-7 → WS3 AC: DEF-005 closed with commit SHA or pending-SHA protocol
─────────────────────────────────────────────────────────────────
```

---

## Execution Plan

```
Phase 1 (parallel — independent, no shared files):
  WS1_OPENAPI      → api-surface.openapi.yaml annotation + FinancialValue fix + branch-valid + DEC-6
  WS2_ROUTE_TESTS  → 3 expanded test files + 1 born test file

Phase 2 (sequential — requires both Phase 1 commits):
  WS3_TRACKER      → DEF-005 + DEC-6 tracker closure + type-check + lint + build
```

---

## Definition of Done (this execution)

**Functionality**
- [ ] Q-5 route/field inventory recorded with classification and disposition for every candidate field
- [ ] FinancialValue component `value.type` is `integer`; no stale Dollar-float / BRIDGE-001 wording
- [ ] `GET /shift-intelligence/anomaly-alerts` schema uses branch-valid `oneOf` discriminated on `metricType`; impossible branch combinations cannot be documented
- [ ] `GET /shift-intelligence/alerts` path entry exists in `api-surface.openapi.yaml`; `metricType` discriminant present; both branches document full `ShiftAlertDTO` base fields plus `observedValue`, `baselineMedian`, and `baselineMad`; `status` query parameter is documented; `thresholdValue` is absent; `hold_percent` ratio branch carries bare `number | null` (DEF-NEVER)
- [ ] `hold_percent` is never `FinancialValue` in any schema — grep confirms zero matches

**Data & Integrity**
- [ ] `recent-sessions` route test has 4-case matrix: 401, invalid params, empty (cross-tenant isolation documented), success with integer-cents `FinancialValue` shape
- [ ] `live-view` route test has 4-case matrix: 401, 404, service error, success with integer-cents `FinancialValue` shape
- [ ] `shift-intelligence/alerts` route test born with 6-case matrix: 401, invalid/missing `gaming_day`, empty array, ratio-branch (bare numeric), financial-branch (FinancialValue | null), optional `status` query parsing; `thresholdValue` absence confirmed; full base fields and non-null `acknowledgment` serialization asserted
- [ ] `anomaly-alerts-route-boundary.test.ts` expanded to 4-case matrix; both discriminated-union branches asserted

**Testing**
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] Targeted Jest command recorded; all four test files exit green
- [ ] No new test files created beyond `shift-intelligence/alerts/__tests__/route.test.ts`

**Security & Access**
- [ ] No route handler, service, RLS policy, or authorization behavior changed

**Documentation**
- [ ] DEF-005 closed in `ROLLOUT-TRACKER.json` with commit SHA or explicit `commit_sha_pending: true` + follow-up note
- [ ] DEC-6 recorded in resolved decisions with commit SHA or pending-SHA protocol
- [ ] If `commit_sha_pending: true` is used, a follow-up tracker-only commit is created immediately after merge; Phase 1.3 cannot start until real `commit_sha` values are present
- [ ] `cursor.active_phase` updated; `cursor.next_action` set to Phase 1.3

---

## Rollback

Single revert of: WS1 OpenAPI edits (1 file), WS2 test file changes (4 files — 3 expanded, 1 born), WS3 tracker update (1 file). Six files total.

---

## Phase 1.2B-C / Phase 1.3 Handoff

This execution closes Phase 1.2B-C completely. The following remain Phase 1.3+:

| Item | Phase |
|------|-------|
| `FinancialValue.tsx` UI component birth | Phase 1.3 |
| `formatCents` / `AttributionRatio.tsx` / `CompletenessBadge.tsx` | Phase 1.3 |
| `lib/format.ts` formatter consolidation | Phase 1.3 |
| Component test births (DEF-006) | Phase 1.3 |
| ESLint `no-unlabeled-financial-value` / `no-forbidden-financial-label` rules | Phase 1.4 |
| CI gate for OpenAPI envelope regression | Phase 1.4 |
| Structured log events per deprecated-field usage | Phase 1.4 |
| Deprecation observability | Phase 1.4 |
| Expansion of `shift-dashboards` route test families beyond DEF-005 routes | Phase 1.4 or separate Enforcement slice |
| `hold_percent` FinancialValue wrapping | DEF-NEVER — all phases |

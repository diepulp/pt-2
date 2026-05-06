---
prd: PRD-074
title: Financial Telemetry — Wave 1 Phase 1.2B-A — Service Canonicalization
status: draft
created: 2026-04-30
fib_h_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.md
fib_s_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.json
fib_s_loaded: true
complexity_prescreen: streamlined
write_path_classification: none
gov010_check: passed
q4_preflight: resolved-amendment
q4_resolution: >
  FIB-H amended 2026-04-30 with Mechanical Compatibility Exception.
  anomaly-alert-card.tsx requires metric-type-aware property access because
  hold_percent remains a bare number. WS2_SHIFT_INTEL reactivated.

workstreams:
  WS1_BRIDGE001:
    name: BRIDGE-001 Service Retirement
    description: >
      Remove /100 from services/visit/crud.ts centsToDollars helper and
      services/rating-slip/mappers.ts toVisitLiveViewDTO. Enable
      financialValueSchema.int() at DTO outbound boundary after removal so
      fractional-value regressions fail Zod validation, with exact-value tests
      proving cents-unit semantics. /100 removal is a hard predecessor to int()
      enforcement.
    executor: backend-service-builder
    executor_type: skill
    bounded_contexts: [visit, rating-slip]
    depends_on: []
    traces_to: [CAP-1, CAP-2]
    outputs:
      - services/visit/crud.ts
      - services/rating-slip/mappers.ts
    gate: test-pass
    estimated_complexity: low

  WS2_SHIFT_INTEL:
    name: Shift-Intelligence DTO Promotion + Mechanical Compat Fix
    description: >
      Promote resolveShiftMetricAuthority void-reads to active FinancialValue
      construction for AnomalyAlertDTO and ShiftAlertDTO financial metric fields.
      Introduce outbound Zod schemas for both DTOs (lifts DEF-007 waiver).
      Preserve hold_percent as number|null (DEF-NEVER). Apply mechanical
      compatibility fix to anomaly-alert-card.tsx per FIB-H Mechanical
      Compatibility Exception (amendment 2026-04-30): render financial metric
      baseline values via .value.toFixed(1), and render hold_percent baseline
      values via the existing bare-number .toFixed(1). No formatting, styling,
      or layout changes.
    executor: backend-service-builder
    executor_type: skill
    bounded_contexts: [shift-intelligence]
    depends_on: []
    traces_to: [CAP-3, CAP-4]
    outputs:
      - services/shift-intelligence/dtos.ts
      - services/shift-intelligence/mappers.ts
      - components/shift-intelligence/anomaly-alert-card.tsx
    gate: type-check
    estimated_complexity: medium

  WS3_CONTRACT:
    name: Contract Shape Alignment — all three named path entries
    description: >
      Shape-align GET /visits/{visit_id}/live-view and
      GET /players/{player_id}/recent-sessions in api-surface.openapi.yaml from
      dollar-float to integer value. Shape-align GET /shift-intelligence/anomaly-alerts
      to FinancialValue fields (WS2 required first). Replace key-presence-only
      assertions with integer-value assertions in the two named BRIDGE-001 route
      test files. Replace stale DEC-5 bare-number assertion in the existing
      anomaly-alerts-route-boundary.test.ts with discriminated-shape assertion.
    executor: api-builder
    executor_type: skill
    bounded_contexts: [api-contract]
    depends_on: [WS1_BRIDGE001, WS2_SHIFT_INTEL]
    traces_to: [CAP-5, CAP-6]
    outputs:
      - docs/25-api-data/api-surface.openapi.yaml
      - app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts
      - app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts
      - services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts
    gate: test-pass
    estimated_complexity: low

  WS4_TRACKER:
    name: Rollout Tracker Closure
    description: >
      Update ROLLOUT-TRACKER.json to close DEF-001, DEF-002, DEF-003, DEF-007 and
      retire BRIDGE-001 with the implementation commit SHA after all prior
      workstreams are committed.
    executor: lead-architect
    executor_type: skill
    bounded_contexts: [rollout-governance]
    depends_on: [WS1_BRIDGE001, WS2_SHIFT_INTEL, WS3_CONTRACT]
    traces_to: [CAP-7]
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
    gate: build
    estimated_complexity: low

execution_phases:
  - name: Phase 1 — Service Canonicalization
    parallel: [WS1_BRIDGE001, WS2_SHIFT_INTEL]
  - name: Phase 2 — Contract Alignment
    parallel: [WS3_CONTRACT]
  - name: Phase 3 — Tracker Closure
    parallel: [WS4_TRACKER]
---

# EXEC-074 — Financial Telemetry Wave 1 Phase 1.2B-A — Service Canonicalization

## Overview

Phase 1.2B-A canonicalizes the service layer that Phase 1.2A proved could pass financial values through route handlers unchanged. This EXEC-SPEC retires BRIDGE-001 by removing the two remaining service-layer `/100` conversions, enables integer-cents validation at DTO outbound boundaries, and aligns only the named existing BRIDGE-001 OpenAPI path entries and route tests.

**This is not purely wiring.** Phase 1.2B-A changes the semantic unit of `FinancialValue.value` from dollar-floats to integer-cents at the service boundary — a substantive semantic correction that unblocks Phase 1.2B-B's surface alignment work.

**Validation semantics:** `financialValueSchema.value = z.number().int()` is a structural integer guard, not a unit oracle. It rejects fractional values such as `75.25`; it does **not** distinguish `75` dollars from `75` cents. Unit correctness is enforced by exact mapper/route assertions such as `7500 → 7500`.

**FIB-S authority:** `FIB-S-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.json` — frozen, anti-invention enforced.

---

## Q-4 Pre-flight — RESOLVED via FIB Amendment

> **Per PRD-074 §5.1 req 10:** EXEC-074 ran a pre-flight grep for `observedValue`, `baselineMedian`, `baselineMad`, and `thresholdValue` in `components/`, `hooks/`, and `app/`.

**Finding:**

```
components/shift-intelligence/anomaly-alert-card.tsx:110:
  <span>Median: {alert.baselineMedian.toFixed(1)}</span>
components/shift-intelligence/anomaly-alert-card.tsx:111:
  <span>MAD: {alert.baselineMad.toFixed(1)}</span>
```

After `FinancialValue | null` promotion, `.toFixed(1)` on `baselineMedian`/`baselineMad` is a TypeScript compile error.

**Resolution:** FIB-H amended 2026-04-30 with Mechanical Compatibility Exception. A naive `.toFixed(1)` → `.value.toFixed(1)` rewrite is **not valid** because `hold_percent` remains a bare `number | null` ratio. The authorized fix is a metric-type-aware property-access adapter: financial metric rows read `FinancialValue.value`; `hold_percent` rows continue to read the bare number. Formatting, styling, layout, and displayed precision remain unchanged. This fix is folded into WS2_SHIFT_INTEL as an authorized side effect of the DTO promotion.

WS2_SHIFT_INTEL is **ACTIVE**.

---

## Open Question Resolutions

| ID | Question | Resolution | Verification |
|----|----------|------------|--------------|
| DEC-1 (Q-1) | AnomalyAlertDTO promoted field nullability | MetricType-discriminated shape: financial metrics → `FinancialValue \| null`; `hold_percent` → `number \| null`. Implement in active WS2. | Type-check + mapper unit test |
| DEC-2 (Q-2) | ShiftAlertDTO observedValue nullability | Relax to `FinancialValue \| null` for consistency with AnomalyAlertDTO. Current non-null assumption was implementation convenience; DB column is nullable. Implement in active WS2. | Type-check + mapper unit test |
| DEC-3 (Q-3) | Named OpenAPI entries cover exact fields | PASS — all 3 named path entries confirmed present in api-surface.openapi.yaml at lines 1028, 1143, 1388. No new path creation required. Anomaly-alerts entry gated on WS2. | Grep + manual review |
| DEC-4 (Q-4) | UI consumers of promoted fields | RESOLVED — FIB-H Mechanical Compatibility Exception authorizes metric-type-aware property access in `anomaly-alert-card.tsx`: financial metrics use `.value.toFixed(1)`, `hold_percent` keeps bare-number `.toFixed(1)`. | Type-check + financial/hold_percent render-safe assertions |
| DEC-5 (Q-5) | DTO outbound validation call sites | BRIDGE-001 validation is mapper/service-boundary local: `services/visit/crud.ts` must parse each constructed `RecentSessionDTO` `FinancialValue`; `services/rating-slip/mappers.ts` must parse each constructed `VisitLiveViewDTO` `FinancialValue`. No route-handler validation or construction. | Mapper/service unit tests + route integer assertions |
| DEC-6 | `GET /api/v1/shift-intelligence/alerts` public surface | OUT-OF-SCOPE for OpenAPI/test birth in Phase 1.2B-A because no Phase 1.2A-authored path entry or route-boundary test exists for this route. `ShiftAlertDTO` still changes at the service boundary; verification is mapper/schema/type-check only. If contract documentation or route-boundary tests are required for this surface, stop for FIB amendment. | Grep confirms no existing OpenAPI path/test entry; type-check covers consumers |

---

## Workstream Details

### WS1_BRIDGE001 — BRIDGE-001 Service Retirement

**Scope:** Service layer only. Two mapper sites. No route changes.

**Implementation sequence (ordering is mandatory):**

1. **Remove `/100` from `services/visit/crud.ts`** — `centsToDollars` helper (~lines 527–545):
   - `total_buy_in: s.total_buy_in / 100` → `total_buy_in: s.total_buy_in`
   - `total_cash_out: s.total_cash_out / 100` → `total_cash_out: s.total_cash_out`
   - `net: s.net / 100` → `net: s.net`
   - Update function comment from dollar-conversion note to integer-cents note

2. **Remove `/100` from `services/rating-slip/mappers.ts`** — `toVisitLiveViewDTO` (~lines 340–368):
   - `data.session_total_buy_in / 100` → `data.session_total_buy_in`
   - `data.session_total_cash_out / 100` → `data.session_total_cash_out`
   - `data.session_net / 100` → `data.session_net`
   - Update Phase 1.1 comment to note Phase 1.2 canonicalization complete

3. **Enable `financialValueSchema.int()` at DTO outbound boundary** — AFTER both removals:
   - `financialValueSchema` in `lib/financial/schema.ts` already has `z.number().int()` in its `value` field — this is the canonical validator
   - `services/visit/crud.ts`: parse each constructed `total_buy_in`, `total_cash_out`, and `net` `FinancialValue` inside the `RecentSessionDTO` mapper/helper before returning `sessions` or `open_visit`
   - `services/rating-slip/mappers.ts`: parse each constructed `session_total_buy_in`, `session_total_cash_out`, and `session_net` `FinancialValue` inside `toVisitLiveViewDTO` before returning the DTO
   - These parse guards enforce structural integer values only; exact mapper/route assertions enforce cents-unit correctness

**Acceptance criteria:**
- No `/100` expression in `services/visit/crud.ts` or `services/rating-slip/mappers.ts`
- `RULE-1` satisfied: `/100` removal limited to the two named mapper sites
- `RULE-2` satisfied: `financialValueSchema.int()` active only after both `/100` removals
- `RULE-5` satisfied: no route handler constructs or mutates `FinancialValue`
- Exact-value tests prove representative DB/RPC cents values stay cents (`7500 → value: 7500`, not `75`)
- `npm run type-check` passes
- Service unit tests for visit and rating-slip pass with integer cents in fixture values

**Decision-to-test injections:**
- `Verify DEC-3: named OpenAPI entries confirmed present` — ensure test fixtures use integer cents (e.g., `value: 7500` not `value: 75.00`)
- `Verify RULE-2 ordering: int() cannot be enabled before /100 removal` — test that a fractional value (e.g., `75.25`) fails `financialValueSchema.parse()` after canonicalization
- `Verify unit semantics: int() alone is insufficient` — test that mapper fixtures with source value `7500` return `value: 7500` exactly

---

### WS2_SHIFT_INTEL — Shift-Intelligence DTO Promotion + Mechanical Compat Fix

**Q-4 status:** RESOLVED. FIB-H amended with Mechanical Compatibility Exception. See Q-4 section.

**Implementation:**

1. **Update `services/shift-intelligence/dtos.ts`:**
   - Define `FinancialMetricType = 'drop_total' | 'win_loss_cents' | 'cash_obs_total'`
   - Refactor `AnomalyAlertDTO` to a discriminated union on `metricType`:
     - Financial variant: `observedValue: FinancialValue | null`, `baselineMedian: FinancialValue | null`, `baselineMad: FinancialValue | null`, `thresholdValue: FinancialValue | null`
     - Ratio variant (`hold_percent`): retain `number | null` for those fields
   - Refactor `ShiftAlertDTO` analogously (Q-2: relax `observedValue: number` → `FinancialValue | null`)
   - Add outbound Zod schemas for both DTOs (lifts DEF-007 waiver)
   - `FinancialValue.completeness.status`: use `'complete'` when the source value is non-null; preserve `null` when the source value is null. Do not synthesize a `FinancialValue` with `completeness.status: 'unknown'` for null source values.

2. **Update `services/shift-intelligence/mappers.ts`:**
   - In `mapAnomalyAlertRow`: promote `void resolveShiftMetricAuthority(...)` → capture return and construct `FinancialValue` for financial metric types; retain `number | null` for `hold_percent`
   - In `mapShiftAlertRow`: same promotion pattern
   - `hold_percent` rows: `observedValue`, `baselineMedian`, `baselineMad` remain `row.xxx` (bare numbers)
   - Outbound schema parse call sites: parse `AnomalyAlertDTO` at the end of `mapAnomalyAlertRow`; parse `ShiftAlertDTO` at the end of `mapShiftAlertRow`. Route handlers remain pass-through and do not validate or construct `FinancialValue`.

3. **Apply mechanical compat fix to `components/shift-intelligence/anomaly-alert-card.tsx`:**
   - Add a local metric-type-aware value accessor for baseline display only.
   - Financial metric rows (`drop_total`, `win_loss_cents`, `cash_obs_total`): read `FinancialValue.value.toFixed(1)`.
   - `hold_percent` rows: read the existing bare number via `.toFixed(1)`.
   - No styling, layout, label, precision, or display-semantic changes.

4. **Run `npm run type-check`** — must pass before WS3 executes.

**Acceptance criteria:**
- `RULE-3`: `resolveShiftMetricAuthority` is the only type/source authority
- `RULE-4`: `hold_percent` remains `number | null` at every layer; grep confirms no `FinancialValue` wrapping
- `RULE-5`: no route handler constructs `FinancialValue`
- DEF-007 waiver lifted — outbound schemas present
- `npm run type-check` passes
- Mapper unit tests cover financial metric FinancialValue construction and hold_percent carve-out
- Tests/assertions cover both financial metric and `hold_percent` baseline rendering safety for `anomaly-alert-card.tsx`; if this requires a new test file, stop for FIB amendment or successor-slice assignment

---

### WS3_CONTRACT — Contract Shape Alignment (all three named path entries)

**Scope:** Three named OpenAPI path entries. Two BRIDGE-001 route test files. One existing anomaly-alerts boundary test (DEC-5 assertion only). No new paths, schemas, components, or test files.

**DO NOT TOUCH:**
- Any OpenAPI path, schema, or component outside the three named entries
- Any route test file other than the three named files
- Any component other than `anomaly-alert-card.tsx` (already handled in WS2)
- `components/schemas/FinancialValue` shared component unless PRD-074/FIB-H/FIB-S are amended to permit shared component edits

**Implementation:**

1. **Update `docs/25-api-data/api-surface.openapi.yaml`** — three named path entries only:
   - `GET /visits/{visit_id}/live-view` response schema: `session_total_buy_in.value`, `session_total_cash_out.value`, `session_net.value` → change type note/description from dollar-float to `integer` (cents)
   - `GET /players/{player_id}/recent-sessions` response schema: `total_buy_in.value`, `total_cash_out.value`, `net.value` → same change
   - `GET /shift-intelligence/anomaly-alerts` response schema: document the discriminated shape. Financial metrics (`drop_total`, `win_loss_cents`, `cash_obs_total`) return `FinancialValue | null` for `observedValue`, `baselineMedian`, `baselineMad`, and `thresholdValue`; `hold_percent` returns bare `number | null` for those fields.
   - Do not edit the shared `FinancialValue` component in this slice; named path-entry descriptions must carry the BRIDGE-001 retirement note until the component-level contract is amended in a successor slice

2. **Update BRIDGE-001 route test files** — existing files only, no new scenarios:
   - `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts`: Update fixture values from dollar floats (e.g., `value: 75.0`) to integer cents (e.g., `value: 7500`). Update assertions from key-presence (`expect(result).toHaveProperty('session_total_buy_in.value')`) to integer-value (`expect(result.session_total_buy_in.value).toBe(7500)`).
   - `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts`: Same pattern — `value: 500.0` → `value: 50000` in fixtures; replace key-presence with integer-value assertions.

3. **Update anomaly-alerts boundary test** — existing file only, DEC-5 assertion replacement only:
   - `services/shift-intelligence/__tests__/anomaly-alerts-route-boundary.test.ts`: Replace the stale DEC-5 bare-number assertion (asserting `observedValue` is a bare `number | null`) with a discriminated-shape assertion that verifies financial metric rows return `FinancialValue | null` and `hold_percent` rows return bare `number | null`. No new scenarios, no new test files.

**Acceptance criteria:**
- `RULE-6`: only the three named path entries modified in OpenAPI
- `RULE-7`: only integer-value assertions in the two named BRIDGE-001 route test files
- Shared `components/schemas/FinancialValue` is not modified
- No new test files, test scenarios, or OpenAPI paths created
- `GET /api/v1/shift-intelligence/alerts` OpenAPI/route-boundary coverage remains out-of-scope unless FIB-H/FIB-S are amended
- Route tests pass with integer-cents fixtures
- `npm run type-check` passes

**Decision-to-test injections:**
- `Verify DEC-3: named path entries present and sufficient` — confirmed by read, test fixtures must use realistic integer cents (buy-in as 7500 = $75.00, session buy-in as 7500, etc.)

---

### WS4_TRACKER — Rollout Tracker Closure (partial)

**Scope:** Governance artifact update only. No code changes.

**Prerequisites:** WS1_BRIDGE001 committed with known SHA, WS3_CONTRACT committed.

**Implementation:**

Update `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`:
- `BRIDGE-001`: `status: "retired"`, `retired_in: "EXEC-074"`, `commit_sha: "<WS1 commit SHA>"`
- `DEF-002` (`/100` removal): `status: "closed"`, `closed_in: "EXEC-074"`, `commit_sha: "<WS1 commit SHA>"`
- `DEF-003` (`financialValueSchema.int()` enforcement): `status: "closed"`, `closed_in: "EXEC-074"`, `commit_sha: "<WS1 commit SHA>"`
- `DEF-001` (shift-intelligence public DTO field wrapping): `status: "closed"`, `closed_in: "EXEC-074"`, `commit_sha: "<WS2 commit SHA>"`
- `DEF-007` (shift-intelligence outbound schemas): `status: "closed"`, `closed_in: "EXEC-074"`, `commit_sha: "<WS2 commit SHA>"`
- Update `cursor.active_phase` if appropriate after partial closure

**Acceptance criteria:**
- DEF-001, DEF-002, DEF-003, and DEF-007 closed with real commit SHAs (not placeholder)
- BRIDGE-001 retired with real commit SHA
- Tracker records are evidence-backed, not speculative

---

## Intake Traceability Audit

```
[INTAKE TRACEABILITY] EXEC-074 vs FIB-S FIB-S-FIN-PHASE-1-2B-A-CANONICALIZATION
──────────────────────────────────────────────────────────────────────────────────
Capability coverage:    7/7 capabilities accounted (WS2 active after FIB amendment)
Anti-invention (desc):  CLEAN — WS1/WS3/WS4 stay within FIB-S surfaces
Anti-invention (paths): WS3 output paths match FIB-S zachman.where.surfaces
Open questions:         DEC-1 resolved, DEC-2 resolved, DEC-3 PASS,
                        DEC-4 RESOLVED, DEC-5 call sites named, DEC-6 out-of-scope
Hard rule visibility:   9/9 rules in acceptance criteria
──────────────────────────────────────────────────────────────────────────────────
WS2 active — Mechanical Compatibility Exception limits component work to
   metric-type-aware property access for existing displayed baseline values.
```

---

## Execution Plan

```
Phase 1: [WS1_BRIDGE001, WS2_SHIFT_INTEL] → parallel (independent contexts)
  WS1: Remove /100, enable int() validation (visit, rating-slip)
  WS2: Promote shift-intelligence DTOs + mechanical compat fix (shift-intelligence, anomaly-alert-card)
Phase 2: [WS3_CONTRACT]  → shape-align all three named OpenAPI entries + update three test files
Phase 3: [WS4_TRACKER]   → record DEF-001, DEF-002, DEF-003, DEF-007, BRIDGE-001 with commit SHA
```

---

## Definition of Done (this execution)

**Functionality**
- [ ] BRIDGE-001 retired: `/100` removed from both named mapper sites
- [ ] `financialValueSchema.int()` active after removal — fractional-value regressions fail
- [ ] `AnomalyAlertDTO` and `ShiftAlertDTO` financial metric fields emit `FinancialValue | null`
- [ ] `hold_percent` confirmed bare `number | null` at every layer (grep + test assertion)

**Data & Integrity**
- [ ] `RecentSessionDTO` and `VisitLiveViewDTO` financial values are integer cents at service output
- [ ] `AnomalyAlertDTO`/`ShiftAlertDTO` outbound Zod schemas present (DEF-007 waiver lifted)

**Testing**
- [ ] Two named BRIDGE-001 route test files assert integer `FinancialValue.value`
- [ ] Anomaly-alerts boundary test DEC-5 assertion replaced with discriminated-shape assertion
- [ ] `npm run type-check` passes (including `anomaly-alert-card.tsx` mechanical fix)
- [ ] `npm run test` (visit, rating-slip, shift-intelligence) passes

**Documentation**
- [ ] All three named OpenAPI path entries shape-aligned to canonical DTO
- [ ] `ROLLOUT-TRACKER.json` records DEF-001, DEF-002, DEF-003, DEF-007 closure and BRIDGE-001 retirement with commit SHA

---

## Rollback

Single revert of: WS1 mapper edits (2 files), WS2 DTO/mapper/component edits (3 files), WS3 OpenAPI + test edits (4 files), WS4 tracker update (1 file). Ten files total.

---

## Phase 1.2B-A / 1.2B-B Split

This execution closes Phase 1.2B-A completely. The following remain Phase 1.2B-B:

| Item | Reason |
|------|--------|
| `formatDollars` → `formatCents` UI render migration | Phase 1.2B-B per FIB-H §G |
| Full 28-route OpenAPI expansion | Phase 1.2B-B per FIB-H §G |
| Full 4-case route test matrices | Phase 1.2B-B per FIB-H §G |
| Runtime deprecation observability | Phase 1.2B-B per FIB-H §G |
| `GET /api/v1/shift-intelligence/alerts` OpenAPI/route-boundary coverage | No Phase 1.2A-authored path entry or route-boundary test exists; requires FIB amendment or successor slice |

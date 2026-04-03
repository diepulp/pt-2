# Measurement Bounded Context -- Testing Posture Statement

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-04-02
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD v2.0.0
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md Tier 2

---

## Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (mappers, queries) | Trusted-Local | Healthy | `mappers.test.ts`, `queries.test.ts` |
| Route-Handler (measurement/summary GET) | Trusted-Local | Healthy | `measurement-summary-route-boundary.test.ts` |
| Existing shallow + shape test (http-contract) | Advisory | Mixed (S9.2 + shape) | Reclassified -- see below |

---

## File Inventory

| File | Canonical Layer | Classification | Directive | Gate |
|------|----------------|----------------|-----------|------|
| `mappers.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `queries.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `http-contract.test.ts` | Mixed: Smoke (S9.2) + Service Shape | Reclassified | node | N/A |
| `measurement-summary-route-boundary.test.ts` | Route-Handler (S3.4) | Boundary | node | N/A |

---

## Reclassification: http-contract.test.ts (S9.2 + Service Shape)

`http-contract.test.ts` contains two distinct test groups:

**Group 1 -- Route existence (S9.2 Smoke):**
- `typeof measurementSummaryRoute.GET === 'function'`
- `measurementSummaryRoute.dynamic === 'force-dynamic'`
- POST/PATCH/DELETE absence checks

These are import-resolution and export-existence checks only. Classified
as Smoke (S9.2).

**Group 2 -- Service shape integration:**
- `getSummary` returns `MeasurementSummaryResponse` shape (structural assertion)
- Partial failure handling (one query fails, others succeed)
- Filter passthrough to service
- MEAS-002/004 casino-level data regardless of filters

Group 2 tests exercise the actual `createMeasurementService` factory with
mock Supabase clients and verify behavioral properties (partial failure
resilience, filter passthrough, shape). These are legitimate service-level
integration-shape tests and are classified as **Server-Unit** (S3.3)
despite living in `http-contract.test.ts`. They test the service factory,
not the route handler.

The file is retained as-is. Route existence checks are smoke; service shape
checks count toward Server-Unit health.

---

## Route Surface

| Route | Method | Handler | Boundary Test |
|-------|--------|---------|---------------|
| `/api/v1/measurement/summary` | GET | Measurement BFF summary | `measurement-summary-route-boundary.test.ts` |

This is the only route in the Measurement context. It is a BFF (Backend for
Frontend) endpoint that aggregates 4 measurement widgets (MEAS-001 through
MEAS-004) via `Promise.allSettled` for partial-success resilience.

No `http.ts` client fetcher exists for Measurement -- the route is consumed
directly from the frontend.

---

## Test Coverage Summary

- **mappers.test.ts**: Comprehensive tests for all 4 measurement mappers:
  - `mapTheoDiscrepancyRows` (MEAS-001): Empty rows, valid data with
    discrepancy calculation, breakdown generation with filter, null
    `computed_theo_cents`, zero `legacy_theo_cents` (division-by-zero guard).
  - `mapAuditCorrelationRows` (MEAS-002): Empty rows, DISTINCT counting for
    Cartesian fan-out, partial chain counting, null `rating_slip_id` handling.
  - `mapRatingCoverageRows` (MEAS-003): Empty rows, aggregate metrics,
    breakdown with filter, null column handling.
  - `mapLoyaltyLiabilityRow` (MEAS-004): Null snapshot (new casino), snapshot
    with active policy, snapshot without policy, date formatting.

- **queries.test.ts**: Tests all 4 query functions with mocked Supabase:
  - `queryTheoDiscrepancy`: Table/column selection, casino_id filter,
    table_id direct filter, pit_id resolution via floor_table_slot subquery,
    empty pit error (unavailable), empty results, database error propagation.
  - `queryAuditCorrelation`: View selection, casino_id filter, empty results.
  - `queryRatingCoverage`: View selection, casino_id filter, table_id filter
    via `gaming_table_id`, pit_id resolution, empty pit error.
  - `queryLoyaltyLiability`: Dual query (snapshot + policy), ordering,
    casino_id filter, null snapshot/policy handling.

- **http-contract.test.ts** (reclassified): Route existence smoke + service
  factory shape tests. See reclassification section above.

- **measurement-summary-route-boundary.test.ts**: Tests GET
  `/api/v1/measurement/summary` with controlled MiddlewareContext.
  Happy path (200 + full summary shape), casino_id passthrough to
  service.getSummary, role gate enforcement (FORBIDDEN for dealer role),
  and service error propagation.

---

## Tenancy Verification Gap

Route-handler boundary tests verify handler logic given a pre-set RLS context.
They do NOT verify tenant isolation or RLS enforcement. Cross-tenant abuse
must be verified via integration tests against a running Supabase instance.

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in Measurement context
- New route-handler tests must follow the boundary test exemplar pattern
- Existing `http-contract.test.ts` route-existence checks are reclassified
  as smoke; service shape checks are retained as legitimate

---

## Skipped Tests

None. All tests pass under node runtime.

---

## Change-Control Disclosure (S12)

1. **What changed:** Route-handler boundary test added for measurement/summary
   GET endpoint. `http-contract.test.ts` partially reclassified (route
   existence = Smoke S9.2; service shape = Server-Unit S3.3).
2. **Why:** Testing governance remediation per ADR-044, Tier 2 posture
   assessment.
3. **Layers gained:** Route-Handler boundary test -> Trusted-Local.
   Existing Server-Unit tests (mappers, queries) already healthy.
4. **Confidence:** Increased -- Measurement now has honest local verification
   with behavioral route-handler assertions covering the BFF endpoint.
5. **Compensating controls:** N/A (confidence increased).
6. **Exit criteria for advisory layers:** Smoke portion of `http-contract.test.ts`
   subsumed by boundary test; retained for import-resolution safety (S9.5).

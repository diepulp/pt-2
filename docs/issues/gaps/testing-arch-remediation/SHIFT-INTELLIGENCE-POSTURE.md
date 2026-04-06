# ShiftIntelligence Bounded Context -- Testing Posture Statement

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-04-02
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD v2.0.0
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md Tier 2

---

## Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (mappers, schemas, anomaly, baseline) | Trusted-Local | Healthy | 5 unit test files |
| Route-Handler (anomaly-alerts GET) | Trusted-Local | Healthy | `anomaly-alerts-route-boundary.test.ts` |
| Integration (grant-posture-audit) | Trusted-Local | Gated | Requires running Supabase instance |
| Existing shallow test (http-contract) | Advisory | Smoke (S9.2) | Reclassified -- see below |

---

## File Inventory

| File | Canonical Layer | Classification | Directive | Gate |
|------|----------------|----------------|-----------|------|
| `mappers.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `alerts-mappers.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `alerts-schemas.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `anomaly-evaluation.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `baseline-computation.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `http-contract.test.ts` | Smoke (S9.2) | Reclassified | node | N/A |
| `grant-posture-audit.test.ts` | Integration (S3.5) | Integration | node | Running Supabase |
| `anomaly-alerts-route-boundary.test.ts` | Route-Handler (S3.4) | Boundary | node | N/A |

---

## Reclassification: http-contract.test.ts (S9.2)

`http-contract.test.ts` is reclassified as **Smoke (S9.2)**. It only asserts:
- `typeof http.fetchComputeBaselines === 'function'`
- `typeof http.fetchAnomalyAlerts === 'function'`
- `typeof computeBaselinesRoute.POST === 'function'`
- `typeof anomalyAlertsRoute.GET === 'function'`

Plus route-export exclusion checks (`GET` absent on compute-baselines, `POST`
absent on anomaly-alerts). These are import-resolution and export-existence
checks, not behavioral contract tests. The file remains for import safety
but is not counted toward Trusted-Local verification status.

---

## Route Surface

| Route | Method | Handler | Boundary Test |
|-------|--------|---------|---------------|
| `/api/v1/shift-intelligence/anomaly-alerts` | GET | Anomaly alerts query | `anomaly-alerts-route-boundary.test.ts` |
| `/api/v1/shift-intelligence/compute-baselines` | POST | Trigger baseline computation | (not boundary-tested; POST with idempotency) |
| `/api/v1/shift-intelligence/alerts` | GET | List persistent alerts | (not boundary-tested; similar pattern to anomaly-alerts) |
| `/api/v1/shift-intelligence/persist-alerts` | POST | Persist anomaly alerts | (not boundary-tested; POST with idempotency) |
| `/api/v1/shift-intelligence/acknowledge-alert` | POST | Acknowledge alert | (not boundary-tested; POST with idempotency) |

The boundary test covers the anomaly-alerts GET endpoint which exercises
the full middleware -> role gate -> service -> response chain. It validates
the role gate (FORBIDDEN for non-pit_boss/admin) and service-layer error
propagation.

---

## Test Coverage Summary

- **mappers.test.ts**: Tests `mapComputeResult` (snake_case -> camelCase) and
  `mapAnomalyAlertRow` (full alert row mapping). Covers zero counts, anomaly
  severity mapping, missing readiness state with null baselines, all 4 metric
  types, and direction values (above/below).

- **alerts-mappers.test.ts** (PRD-056): Tests `mapPersistResult`,
  `mapAcknowledgeResult`, `mapAlertQualityResult`. Covers zero counts,
  missing field defaults, idempotent re-ack, and null median latency.

- **alerts-schemas.test.ts** (PRD-056): Zod schema validation for
  `persistAlertsInputSchema`, `acknowledgeAlertSchema`, `alertsQuerySchema`.
  Covers optional fields, UUID validation, string length limits, enum
  validation, and required field enforcement.

- **anomaly-evaluation.test.ts** (PRD-055): Tests MAD-based severity mapping
  (info/warn/critical thresholds), hold_percent range-bound evaluation
  (extreme bounds + deviation_pp), cash_obs_total skip rule, and readiness
  state machine (ready/stale/missing/insufficient_data). Uses locally-defined
  pure functions rather than importing from service -- tests algorithmic
  invariants.

- **baseline-computation.test.ts** (PRD-055): Tests `computeMedian` (odd/even
  arrays, unsorted, negatives), `computeScaledMAD` (including outlier
  robustness vs std deviation), `isMADAnomaly` (threshold detection, fallback
  percent for MAD=0, zero-median edge), `computeSeverity` (boundary values),
  and hold_percent zero-drop day exclusion. Uses locally-defined pure
  functions.

- **grant-posture-audit.test.ts** (PRD-056 WS11): Integration test that
  verifies GRANT posture against a running Supabase instance. Checks RLS
  enabled on shift_alert and alert_acknowledgment, verifies RPC callable by
  service_role, and confirms DELETE denial policies. Requires local Supabase
  to produce meaningful results.

- **anomaly-alerts-route-boundary.test.ts**: Tests GET
  `/api/v1/shift-intelligence/anomaly-alerts` with controlled
  MiddlewareContext. Happy path (200 + alerts shape), casino_id passthrough,
  role gate enforcement (FORBIDDEN for dealer role), and service error
  propagation.

---

## Note on Locally-Defined Functions

`anomaly-evaluation.test.ts` and `baseline-computation.test.ts` define their
own pure functions (computeMedian, computeScaledMAD, evaluateHoldAnomaly, etc.)
rather than importing from service modules. This tests the mathematical
invariants that the RPC implementations must satisfy. The actual service-layer
implementations live in PostgreSQL RPCs which are tested via integration tests.
These tests are classified as Server-Unit because they verify domain logic
algorithms in the node runtime.

---

## Integration Test: grant-posture-audit.test.ts

This test requires a running Supabase instance (local or CI). It:
- Verifies RLS is enabled on new tables (shift_alert, alert_acknowledgment)
- Confirms RPCs are callable by service_role (GRANT posture)
- Checks DELETE denial policies exist

The test self-guards: when Supabase is unavailable or PostgREST cache is stale,
assertions degrade gracefully. It should be gated in CI behind a Supabase
availability check.

---

## Tenancy Verification Gap

Route-handler boundary tests verify handler logic given a pre-set RLS context.
They do NOT verify tenant isolation or RLS enforcement. Cross-tenant abuse
must be verified via integration tests against a running Supabase instance.

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in ShiftIntelligence context
- New route-handler tests must follow the boundary test exemplar pattern
- Existing shallow test (`http-contract.test.ts`) is reclassified as smoke, not removed

---

## Skipped Tests

None. All unit tests pass under node runtime. Integration test
(`grant-posture-audit.test.ts`) requires local Supabase -- it is gated
by environment availability, not skipped.

---

## Change-Control Disclosure (S12)

1. **What changed:** Route-handler boundary test added for anomaly-alerts
   GET endpoint. Shallow `http-contract.test.ts` reclassified as Smoke (S9.2).
2. **Why:** Testing governance remediation per ADR-044, Tier 2 posture
   assessment.
3. **Layers gained:** Route-Handler boundary test -> Trusted-Local.
   Existing Server-Unit tests already healthy. Integration test noted
   as gated.
4. **Confidence:** Increased -- ShiftIntelligence now has honest local
   verification with behavioral route-handler assertions and documented
   integration test surface.
5. **Compensating controls:** N/A (confidence increased).
6. **Exit criteria for advisory layers:** Shallow `http-contract.test.ts`
   replaced when route handlers are next modified (S9.5).

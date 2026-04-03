# PlayerImport Bounded Context -- Testing Posture Statement

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-04-02
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD v2.0.0
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md Tier 2

---

## Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (mappers, schemas, csv-sanitization, column-mapping) | Trusted-Local | Healthy | `npm run test:slice:player-import` |
| Route-Handler (batch list GET) | Trusted-Local | Healthy | `player-import-route-boundary.test.ts` |
| Existing shallow test (http-contract) | Advisory | Smoke (S9.2) | Reclassified -- see below |
| Integration (4 files) | Trusted-Local | Gated | `RUN_INTEGRATION_TESTS` env var required |

---

## File Inventory

| File | Canonical Layer | Classification | Directive | Gate |
|------|----------------|----------------|-----------|------|
| `mappers.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `schemas.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `csv-sanitization.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `column-mapping.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `http-contract.test.ts` | Smoke (S9.2) | Reclassified | node | N/A |
| `player-import-route-boundary.test.ts` | Route-Handler (S3.4) | Boundary | node | N/A |
| `execute-guard.int.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |
| `execute-rpc.int.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |
| `rls-policies.int.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |
| `upload-route.int.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |

**Total: 10 files** (4 server-unit, 1 smoke, 1 route-handler boundary, 4 integration)

---

## Reclassification: http-contract.test.ts (S9.2)

`http-contract.test.ts` is reclassified as **Smoke (S9.2)**. It only asserts:
- `typeof http.createBatch === 'function'`
- `typeof batchesRoute.POST === 'function'`
- `typeof batchesRoute.GET === 'function'`
- (and similar `typeof` checks for all route/function pairs)

This verifies import resolution and export existence, not behavioral contract.
It does NOT test request/response shape, status codes, error paths, or data flow.
It also asserts `dynamic === 'force-dynamic'` on route modules, which is an export
presence check, not a behavioral test.

It remains in the test suite for import-resolution safety but is not counted
toward Trusted-Local verification status.

---

## Tenancy Verification Gap

Route-handler boundary tests verify handler logic given a pre-set RLS context.
They do NOT verify tenant isolation or RLS enforcement. Cross-tenant abuse
must be verified via integration tests against a running Supabase instance
(covered by `rls-policies.int.test.ts`).

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in PlayerImport context
- New route-handler tests must follow the boundary test exemplar pattern
- Existing shallow test (`http-contract.test.ts`) is reclassified as smoke, not removed
- New HTTP contract tests must follow the canary pattern (schema validation, not typeof)

---

## Skipped Tests

None. All tests pass under node runtime. Integration tests are gated (not skipped)
via `describeIntegration` pattern with `RUN_INTEGRATION_TESTS` env var.

---

## Slice Script

```bash
npm run test:slice:player-import
```

Runs all `services/player-import/__tests__/*.test.ts` files under `jest.node.config.js`.
Integration tests (`.int.test.ts`) are included in the glob but skip automatically
without `RUN_INTEGRATION_TESTS=true`.

---

## Change-Control Disclosure (S12)

1. **What changed:** Added route-handler boundary test for GET /api/v1/player-import/batches.
   Reclassified `http-contract.test.ts` as Smoke (S9.2). Produced posture statement.
2. **Why:** Tier 2 testing governance remediation per ADR-044.
3. **Layers gained:** Route-Handler boundary layer added. Existing Server-Unit and
   Integration layers already healthy. Shallow test reclassified as Advisory/Smoke.
4. **Confidence:** Increased -- PlayerImport now has honest local verification under
   correct runtime with behavioral assertions at the route-handler boundary.
5. **Compensating controls:** N/A (confidence increased).
6. **Exit criteria for advisory layers:** Shallow `http-contract.test.ts` replaced
   when route handlers are next modified (S9.5).

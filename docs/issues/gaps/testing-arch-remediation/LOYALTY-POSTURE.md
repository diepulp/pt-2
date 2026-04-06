# Loyalty Bounded Context -- Testing Posture Statement

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-04-01
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD v2.0.0
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md S4 Tier 1

---

## Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (mappers, crud, mid-session-reward) | Trusted-Local | Healthy | `npm run test:slice:loyalty` |
| Route-Handler (valuation-policy GET) | Trusted-Local | Healthy | `valuation-policy-route-boundary.test.ts` |
| HTTP Contract Canary (valuation serialization) | Trusted-Local | Healthy | `valuation-http-contract.test.ts` |
| Integration (7 files) | Trusted-Local | Gated | `RUN_INTEGRATION_TESTS` env var required |
| Existing shallow test (http-contract) | Advisory | Smoke (S9.2) | Reclassified -- see below |

---

## File Inventory

| File | Canonical Layer | Classification | Directive | Gate |
|------|----------------|----------------|-----------|------|
| `mappers.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `crud.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `mid-session-reward.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `valuation-policy.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `issue-comp-variable-amount.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `http-contract.test.ts` | Smoke (S9.2) | Reclassified | node | N/A |
| `valuation-http-contract.test.ts` | HTTP Contract (S3.4) | Canary | node | N/A |
| `valuation-policy-route-boundary.test.ts` | Route-Handler (S3.4) | Boundary | node | N/A |
| `loyalty-accrual-lifecycle.integration.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |
| `points-accrual-calculation.integration.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |
| `promo-outbox-contract.int.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |
| `issuance-idempotency.int.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |
| `issue-comp.int.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |
| `issue-entitlement.int.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |
| `valuation-policy-roundtrip.int.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |

---

## Reclassification: http-contract.test.ts (S9.2)

`http-contract.test.ts` is reclassified as **Smoke (S9.2)**. It only asserts:
- `typeof http.accrueOnClose === 'function'`
- `typeof accrueRoute.POST === 'function'`

This verifies import resolution and export existence, not behavioral contract.
It does NOT test request/response shape, status codes, error paths, or data flow.
It remains in the test suite for import-resolution safety but is not counted
toward Trusted-Local verification status.

---

## New Pattern: HTTP Contract Canary

`valuation-http-contract.test.ts` introduces a new test pattern:

**Purpose:** Validates that HTTP client key transformations (camelCase -> snake_case)
produce output that the route handler's Zod schema accepts.

**Prevents:** The valuation serialization bug class (ISSUE-C4D2AA48) where
`updateValuationRate()` in `http.ts` passed camelCase keys but the route
handler's `updateValuationPolicySchema` expects snake_case.

**Pattern:**
1. Construct a camelCase DTO matching the client input type
2. Apply the same transformation the HTTP client applies
3. `safeParse()` the result against the route handler schema
4. Assert success (positive case) and failure for untransformed input (negative case)

This pattern should be replicated for any client function that performs
key transformation before posting to a route handler.

---

## Tenancy Verification Gap

Route-handler boundary tests verify handler logic given a pre-set RLS context.
They do NOT verify tenant isolation or RLS enforcement. Cross-tenant abuse
must be verified via integration tests against a running Supabase instance.

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in Loyalty context
- New route-handler tests must follow the boundary test exemplar pattern
- Existing shallow test (`http-contract.test.ts`) is reclassified as smoke, not removed
- New HTTP contract tests must follow the canary pattern (schema validation, not typeof)

---

## Skipped Tests

None. All tests pass under node runtime. Integration tests are gated (not skipped).

---

## Slice Script

```bash
npm run test:slice:loyalty
```

Runs all `services/loyalty/__tests__/*.test.ts` files under `jest.node.config.js`.
Integration tests (`.int.test.ts`, `.integration.test.ts`) are included in the glob
but skip automatically without `RUN_INTEGRATION_TESTS=true`.

---

## Change-Control Disclosure (S12)

1. **What changed:** Loyalty tests migrated to node runtime, integration tests
   gated with `RUN_INTEGRATION_TESTS`, HTTP contract canary and route-handler
   boundary exemplar added, shallow test reclassified as smoke.
2. **Why:** Testing governance remediation per ADR-044 / ISSUE-C4D2AA48.
3. **Layers gained:** Server-Unit, Route-Handler, HTTP Contract Canary,
   Integration (gated) -> Trusted-Local. Shallow test -> Advisory/Smoke reclassification.
4. **Confidence:** Increased -- Loyalty now has honest local verification under
   correct runtime with behavioral assertions and serialization regression prevention.
5. **Compensating controls:** N/A (confidence increased).
6. **Exit criteria for advisory layers:** Shallow `http-contract.test.ts` replaced
   when route handlers are next modified (S9.5).

# Security Bounded Context -- Testing Posture Statement

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-04-02
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD v2.0.0
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md Tier 2

---

## Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (RLS context mock-based) | Trusted-Local | Healthy | `npm run test:slice:security` |
| Integration (ADR-024 grant verification, cross-tenant isolation, pooling safety) | Trusted-Local | Gated | `RUN_INTEGRATION_TESTS` env var required |

---

## File Inventory

| File | Canonical Layer | Classification | Runtime | Gate |
|------|----------------|----------------|---------|------|
| `rls-context.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `rls-context.integration.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |

---

## Route Surface

Security has **no `http.ts`**, **no routes**, and **no API surface**. It is a pure
infrastructure context providing RLS context-injection RPCs consumed internally by
other bounded contexts. No route-handler exemplar is needed.

---

## Unit Test Coverage (rls-context.test.ts)

The unit test file validates the ADR-024 secure RLS context injection pattern via
mocked Supabase RPC calls. It covers:

1. **Staff Lookup** -- `set_rls_context_from_staff()` happy path, correlation ID
   forwarding, FORBIDDEN for inactive staff, UNAUTHORIZED for missing/mismatched
   staff identity (INV-2, INV-3, INV-6).
2. **Correlation ID Sanitization** -- Valid format, SQL injection attempts, empty
   strings, long strings (truncated server-side to 64 chars), allowed character
   preservation.
3. **Ops Lane** -- `set_rls_context_internal()` with valid params, null rejection
   for actor_id / casino_id / staff_role, cross-casino mismatch detection.
4. **Error Code Mapping** -- P0001 UNAUTHORIZED -> 401, P0001 FORBIDDEN -> 403,
   P0001 INVALID -> 400 semantics.
5. **Role-Based Access** -- pit_boss and admin accepted; dealer rejected
   (no user_id allowed per check constraint).

All assertions are behavioural (error message content, success/failure semantics),
not shallow (no typeof/exists-only checks).

---

## Integration Test Coverage (rls-context.integration.test.ts)

The integration test file validates ADR-024 invariants against a live Supabase
database with real PostgreSQL functions. Gated behind `RUN_INTEGRATION_TESTS`.

Test categories:

1. **Security Grant Verification (DoD Audit)** -- INV-1: `set_rls_context` revoked
   from authenticated, anon, PUBLIC. INV-2: `set_rls_context_from_staff` granted to
   authenticated. INV-3: `set_rls_context_internal` restricted to service_role.
2. **Spoofed Context Rejection** -- Poisoned session vars overwritten by authoritative
   function; arbitrary casino_id injection blocked.
3. **Cross-Tenant Isolation** -- Casino A staff cannot set Casino B context and
   vice versa; staff can only set context for own casino.
4. **Transaction Pooling Safety (INV-5)** -- No context leakage across sequential
   calls; SET LOCAL ensures transaction-scoped context; parallel requests do not
   share context.
5. **Staff Validation** -- Inactive staff blocked; non-existent staff blocked.
6. **Deterministic Staff Lookup (INV-6)** -- Unique index on `staff.user_id`
   exists; duplicate user_id insert raises 23505 unique_violation.
7. **No Spoofable RPC Parameters Audit** -- Confirms 16 client-callable RPCs
   derive context from JWT + staff lookup, not user input.

Test scenario factory creates isolated company/casino/staff/user data with full
cleanup in `afterAll`.

---

## ADR-024 Security Invariant Mapping

| Invariant | Unit Test | Integration Test |
|-----------|-----------|-----------------|
| INV-1: `set_rls_context` revoked from authenticated/PUBLIC | Implicit (tests only call `set_rls_context_from_staff`) | Grant verification suite |
| INV-2: `set_rls_context_from_staff` callable by authenticated | Happy path tests | Grant verification suite |
| INV-3: Staff identity bound to `auth.uid()` | Mismatched claim tests | Cross-tenant isolation suite |
| INV-5: Context set via SET LOCAL (pooler-safe) | Mocked RPC success implies SET LOCAL | Transaction pooling safety suite |
| INV-6: Deterministic staff lookup (unique user_id) | Staff not found tests | Unique constraint verification |

**Note on dropped `set_rls_context`:** The original spoofable `set_rls_context` RPC
is referenced in test comments but is never called directly. All tests target the
ADR-024 replacements: `set_rls_context_from_staff` (authenticated lane) and
`set_rls_context_internal` (ops/service_role lane).

---

## Tenancy Verification Gap

Unit tests verify handler logic given mocked RPC responses. They do NOT verify
tenant isolation or RLS enforcement. Cross-tenant abuse is verified by the
integration tests in `rls-context.integration.test.ts` which run against a live
Supabase instance with real multi-casino test data.

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in Security context
- Both existing test files contain genuine behavioural assertions
- No tests reclassified as smoke (S9.2) -- all assertions verify meaningful security invariants

---

## Shallow Test Reclassification (S9.2)

No tests reclassified. Both files contain genuine behavioural assertions:
- Unit tests: error message content, success/failure semantics, RPC call shape
- Integration tests: database grant verification, cross-tenant rejection, constraint enforcement

---

## Skipped Tests

None. All unit tests pass under node runtime. Integration tests are gated (not
skipped) via `RUN_INTEGRATION_TESTS` env var and `describeIntegration` pattern.

---

## Slice Script

```bash
npm run test:slice:security
```

Runs all `services/security/__tests__/*.test.ts` files under `jest.node.config.js`.
Integration tests (`.integration.test.ts`) are included in the glob but skip
automatically without `RUN_INTEGRATION_TESTS=true`.

---

## Change-Control Disclosure (S12)

1. **What changed:** Security testing posture documented. No test file modifications
   required -- both files already had `@jest-environment node` directives and
   integration gate via `describeIntegration` pattern.
2. **Why:** Testing governance remediation per ADR-044 / Tier 2 rollout.
3. **Layers gained:** Server-Unit, Integration (gated) -> Trusted-Local.
4. **Confidence:** Baseline established -- Security context has honest local
   verification of ADR-024 invariants under correct runtime.
5. **Compensating controls:** N/A (confidence established, not reduced).
6. **Exit criteria for advisory layers:** N/A -- no advisory layers in Security context.

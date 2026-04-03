# RatingSlipModal Bounded Context -- Testing Posture Statement

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-04-02
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD v2.0.0
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md Tier 2
**Context Type:** BFF Aggregation Layer (not domain service, no table ownership)

---

## Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (BFF aggregation, DTO structure) | Trusted-Local | Healthy | `bff-aggregation.test.ts` |
| Server-Unit (move-player orchestration) | Trusted-Local | Healthy | `move-player.test.ts` |
| RPC Contract (JSONB -> DTO mapping) | Trusted-Local | Healthy | `rpc-contract.test.ts` |
| RPC Security (tenant isolation, SECURITY INVOKER) | Trusted-Local | Healthy | `rpc-security.test.ts` |
| RPC Unit (data mapping, error handling, type guards) | Trusted-Local | Healthy | `rpc.test.ts` |

---

## File Inventory

| File | Canonical Layer | Classification | Directive | Gate |
|------|----------------|----------------|-----------|------|
| `bff-aggregation.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `move-player.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `rpc-contract.test.ts` | RPC Contract (S3.4) | Contract | node | N/A |
| `rpc-security.test.ts` | RPC Security (S3.4) | Security | node | N/A |
| `rpc.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `RPC_TEST_SUMMARY.md` | Documentation | Reference | N/A | N/A |

---

## Context Classification: BFF Aggregation Layer

RatingSlipModal is NOT a domain service. It is a Backend-For-Frontend (BFF)
aggregation layer that:

1. Orchestrates data from 5 bounded contexts (RatingSlip, Visit, Player,
   Loyalty, PlayerFinancial) via a single RPC call
2. Owns no database tables directly
3. Exposes aggregated DTOs consumed by the rating slip modal UI
4. Routes live under `/api/v1/rating-slips/[id]/modal-data/` (owned by the
   rating-slips route tree, not a separate API namespace)

This classification means:
- No CRUD tests needed (no table ownership)
- RPC contract tests substitute for route-handler boundary tests
- Security tests validate cross-casino isolation at the RPC level

---

## Test Coverage Summary

| Category | Tests | Coverage |
|----------|-------|----------|
| BFF Aggregation (DTO structure, invariants) | 20 | Complete DTO shape validation |
| Move Player (orchestration, idempotency) | 21 | Input/output, invariants, error cases |
| RPC Contract (JSONB -> DTO) | 33 | All sections, edge cases, type preservation |
| RPC Security (tenant isolation) | 20 | Cross-casino, SECURITY INVOKER, error messages |
| RPC Unit (data mapping, error handling) | 27 | Mapping, errors, type guards, edge cases |
| **Total** | **124** | **Comprehensive** |

---

## RPC Contract Tests

`rpc-contract.test.ts` validates the contract between PostgreSQL RPC output
(`rpc_get_rating_slip_modal_data`) and the `RatingSlipModalDTO` TypeScript type:

- All 5 DTO sections mapped: Slip, Player, Loyalty, Financial, Tables
- Nullable field handling: player (ghost visits), loyalty, loyalty.suggestion
- Array field validation: tables with occupiedSeats
- Type preservation: strings, numbers, dates, nulls
- Edge cases: minimum valid response, maximum complexity (20 tables)

---

## RPC Security Tests

`rpc-security.test.ts` validates SECURITY INVOKER behavior per ADR-015/018:

- Casino context mismatch throws FORBIDDEN (not silent filtering)
- UNAUTHORIZED when `app.casino_id` is not set
- SECURITY INVOKER inherits caller's RLS context
- Defense-in-depth parameter validation at RPC level
- Error message sanitization (no PostgreSQL internals leaked)
- Multi-tenant scenarios: privilege escalation prevention

---

## Route Coverage

Routes are owned by the `rating-slips` route tree, not this context:

| Route | Method | Test Location |
|-------|--------|---------------|
| `/api/v1/rating-slips/[id]/modal-data` | GET | `app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts` |
| `/api/v1/rating-slips/[id]/move` | POST | `app/api/v1/rating-slips/[id]/move/__tests__/route.test.ts` |

Route-handler tests exist in the route tree's own `__tests__/` directories.
No boundary test is needed in the service `__tests__/` directory because:
1. RPC contract tests validate the data transformation layer
2. Route-handler tests exist co-located with the routes
3. The BFF pattern has no independent HTTP surface to test

---

## Tenancy Verification Gap

RPC security tests validate tenant isolation at the mock level (DomainError
codes, explicit error vs. silent filtering). Full cross-tenant abuse testing
requires integration tests against a running Supabase instance.

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in RatingSlipModal context
- New RPC tests must follow the mock factory pattern (`createMockSupabaseWithRpc`)
- DTO structure tests must validate behavioral invariants, not just `typeof`

---

## Skipped Tests

None. All 124 tests pass under node runtime.

---

## Slice Script

```bash
npx jest --config jest.node.config.js services/rating-slip-modal/__tests__/
```

Runs all `services/rating-slip-modal/__tests__/*.test.ts` files under `jest.node.config.js`.

---

## Change-Control Disclosure (S12)

1. **What changed:** Posture documentation created for existing 5-file test suite.
   No test files added or modified.
2. **Why:** Testing governance remediation per ADR-044, Tier 2 posture documentation.
3. **Layers gained:** None (all layers already present). Posture formalized.
4. **Confidence:** Unchanged -- RatingSlipModal already had comprehensive local
   verification. Posture doc provides governance traceability.
5. **Compensating controls:** N/A (no change to test coverage).
6. **Exit criteria for advisory layers:** N/A (no advisory layers).

# VALIDATION-PRD-HZ-001 — DoD Checklist

**Date:** 2025-11-29
**PRD:** [PRD-HZ-001](/docs/10-prd/PRD-HZ-001-gate0-horizontal-infrastructure.md)
**Spec:** [SPEC-PRD-HZ-001](./SPEC-PRD-HZ-001-gate0-horizontal-infrastructure.md)
**Workstreams:** [IMPL-PRD-HZ-001](./IMPL-PRD-HZ-001-workstreams.md)

---

## PRD DoD → Spec Traceability Matrix

### Functionality

| # | PRD DoD Item | Spec Section | Status | Notes |
|---|--------------|--------------|--------|-------|
| F1 | `withServerAction` wrapper composes all middleware (auth, RLS, idempotency, audit, tracing) | §3.7 Compositor | ✅ SPEC | `compose()` function chains all middleware |
| F2 | At least one Route Handler uses `withServerAction` and returns `ServiceHttpResult<T>` | §7.1 Example | ✅ SPEC | Example provided; WS5.1 requires migration |
| F3 | Idempotency middleware rejects mutations without `x-idempotency-key` header | §3.4 withIdempotency | ✅ SPEC | Returns 400 VALIDATION_ERROR |
| F4 | Error mapper transforms all common Postgres codes (23505, 23503, 23514, PGRST116) | §1.1 Assessment | ✅ EXISTING | `lib/server-actions/error-map.ts` |

### Data & Integrity

| # | PRD DoD Item | Spec Section | Status | Notes |
|---|--------------|--------------|--------|-------|
| D1 | RLS context (`app.casino_id`, `app.actor_id`) is correctly injected via `SET LOCAL` | §3.3 withRLS | ✅ SPEC + EXISTING | Uses existing `injectRLSContext()` |
| D2 | Audit log rows are written for wrapped mutations with correct correlation IDs | §3.5 withAudit | ✅ SPEC | Includes correlationId, actor_id, casino_id |
| D3 | No Postgres error codes visible in API responses | §3.6 withTracing | ✅ SPEC | `mapDatabaseError()` transforms all errors |

### Security & Access

| # | PRD DoD Item | Spec Section | Status | Notes |
|---|--------------|--------------|--------|-------|
| S1 | `withAuth` rejects unauthenticated requests with 401 | §3.2 withAuth | ✅ SPEC | Throws `UNAUTHORIZED` DomainError |
| S2 | `withRLS` enforces casino scoping (requests for wrong casino fail with 403) | §3.2, §3.3 | ✅ SPEC | `assertCasinoScope()` available |
| S3 | Correlation IDs do not expose sensitive information | All middleware | ✅ SPEC | Uses UUID v4, no PII |

### Testing

| # | PRD DoD Item | Spec Section | Status | Notes |
|---|--------------|--------------|--------|-------|
| T1 | Unit test for each middleware (auth, RLS, idempotency, audit, tracing) | §6.1 Unit Tests | ✅ SPEC | 21 test cases defined |
| T2 | Integration test: full middleware chain with real Supabase | §6.2 Integration | ✅ SPEC | WS3.2 defined |
| T3 | One E2E test: create entity via wrapped route, verify audit log | §6.2 E2E | ✅ SPEC | WS3.3 defined |

### Operational Readiness

| # | PRD DoD Item | Spec Section | Status | Notes |
|---|--------------|--------------|--------|-------|
| O1 | Correlation IDs propagate from request header to audit log to DB session | §3.3, §3.5 | ✅ SPEC | `application_name` + `audit_log.correlation_id` |
| O2 | Error responses include `requestId` for debugging | §3.6 withTracing | ✅ SPEC | Included in `ServiceResult<T>` |
| O3 | Middleware timing logged for performance monitoring | §3.6 withTracing | ✅ SPEC | `durationMs` in result |

### Documentation

| # | PRD DoD Item | Spec Section | Status | Notes |
|---|--------------|--------------|--------|-------|
| DOC1 | `lib/server-actions/README.md` with usage examples | §7, WS4.1 | ✅ SPEC | Workstream defined |
| DOC2 | Error code catalog documented in `lib/errors/README.md` | §3, WS4.2 | ✅ SPEC | Workstream defined |

---

## Validation Summary

### Coverage

| Category | Items | Specified | Existing | Total |
|----------|-------|-----------|----------|-------|
| Functionality | 4 | 3 | 1 | 4/4 ✅ |
| Data & Integrity | 3 | 2 | 1 | 3/3 ✅ |
| Security & Access | 3 | 3 | 0 | 3/3 ✅ |
| Testing | 3 | 3 | 0 | 3/3 ✅ |
| Operational | 3 | 3 | 0 | 3/3 ✅ |
| Documentation | 2 | 2 | 0 | 2/2 ✅ |
| **TOTAL** | **18** | **16** | **2** | **18/18 ✅** |

### Gap Analysis

**No gaps identified.** All PRD DoD items have corresponding spec sections.

### Risk Items

| Risk | Mitigation |
|------|------------|
| Middleware order may be misconfigured | Type-safe compositor, integration tests |
| Performance overhead | Target <10ms, benchmark tests in WS3 |
| Breaking existing routes | Gradual migration plan (WS5), backward compat |

---

## Next Steps

1. **Architecture Review**: Share spec with team for feedback
2. **Begin Workstream 1**: Start with middleware types (WS1.1)
3. **Set Up Test Infrastructure**: Prepare test fixtures (WS3)
4. **Track Progress**: Use `/mvp-status` to track GATE-0 completion

---

## Sign-Off

| Role | Name | Date | Approval |
|------|------|------|----------|
| Architecture Lead | | | ☐ |
| Backend Lead | | | ☐ |
| QA Lead | | | ☐ |

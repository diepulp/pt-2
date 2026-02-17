---
id: PRD-018
title: Rating Slip Modal BFF RPC Implementation
owner: Engineering
status: Draft
affects: [PERF-001, PRD-008, ADR-015, ADR-018, ADR-020, SEC-004]
created: 2025-12-26
last_review: 2025-12-26
phase: Phase 3 (Performance Hardening)
pattern: B
http_boundary: false
---

# PRD-018 — Rating Slip Modal BFF RPC Implementation

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Implement the `rpc_get_rating_slip_modal_data` PostgreSQL function to reduce the rating slip modal endpoint latency from ~600ms to ~150ms. This BFF (Backend-for-Frontend) RPC consolidates 6+ database queries into a single round trip, completing the Phase 3 optimization from PERF-001. The design document is complete and approved; this PRD covers the implementation, testing, and staged rollout.

---

## 2. Problem & Goals

### 2.1 Problem

The rating slip modal is the most frequently accessed view in PT-2, opened every time a pit boss needs to view or edit a player's session. After PERF-001 WS1-WS3 optimizations (batch queries, parallelization, indexes), the endpoint still requires ~600ms to aggregate data from 5 bounded contexts across 6+ database queries.

This latency creates a noticeable delay when opening the modal, impacting pit boss workflow efficiency during high-volume periods. The current p95 of ~600ms exceeds the QA-001 target of 500ms, and user feedback indicates the modal "feels slow" compared to other operations.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Reduce modal-data p95 latency to <200ms | Prometheus histogram shows p95 < 200ms for 7 consecutive days |
| **G2**: Maintain existing DTO contract | All existing tests pass without modification |
| **G3**: Zero security regressions | No RLS violations detected in audit logs |
| **G4**: Safe rollout with instant rollback | Feature flag enables <5 minute rollback to current implementation |

### 2.3 Non-Goals

- Changing the modal-data response structure (DTO remains identical)
- Optimizing other endpoints (this PRD is scoped to modal-data only)
- Implementing caching layer (Redis or in-memory)
- Migrating away from Supabase RLS (we leverage existing policies)
- Frontend performance optimizations (separate initiative)

---

## 3. Users & Use Cases

- **Primary users:** Pit Bosses, Floor Supervisors

**Top Jobs:**

- As a **Pit Boss**, I need to open the rating slip modal quickly so that I can update player ratings without workflow interruption.
- As a **Floor Supervisor**, I need to review multiple rating slips in rapid succession so that I can monitor pit activity during busy periods.
- As a **System Administrator**, I need to toggle the BFF RPC on/off so that I can rollback instantly if issues arise.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Database Layer:**
- PostgreSQL RPC function `rpc_get_rating_slip_modal_data(p_slip_id, p_casino_id)`
- SECURITY INVOKER pattern (inherits caller's RLS context)
- Defense-in-depth casino_id validation
- Complete modal DTO aggregation in single transaction

**Service Layer:**
- New `getModalDataViaRPC()` function in rating-slip service
- Feature flag integration (`NEXT_PUBLIC_USE_MODAL_BFF_RPC`)
- Parallel implementation alongside existing multi-query path

**Route Handler:**
- Conditional routing based on feature flag
- X-Query-Timings header for both paths (comparison)
- No changes to response contract

**Testing:**
- RPC unit tests (PostgreSQL)
- Service layer integration tests
- Contract tests (DTO shape validation)
- RLS security tests (cross-casino isolation)
- Performance benchmarks (p95 validation)

**Rollout:**
- Feature flag disabled by default
- Staged rollout: 0% → 10% → 50% → 100%
- Monitoring dashboard for comparison metrics

### 4.2 Out of Scope

- GraphQL resolver approach (rejected in design doc)
- Materialized views (rejected due to staleness concerns)
- Redis caching layer (premature optimization)
- Removing the multi-query implementation (kept as fallback)
- Other endpoint optimizations

---

## 5. Requirements

### 5.1 Functional Requirements

- RPC function MUST return identical DTO structure as current implementation
- RPC function MUST enforce RLS via SECURITY INVOKER pattern
- RPC function MUST validate casino_id matches caller's RLS context
- Feature flag MUST allow instant toggle between implementations
- Both implementations MUST be available simultaneously during rollout
- Timing instrumentation MUST be present for both paths

### 5.2 Non-Functional Requirements

- **Performance:** p95 latency < 200ms (target: 150ms)
- **Security:** No cross-casino data leakage (RLS enforced)
- **Reliability:** 99.9% success rate (matching current implementation)
- **Rollback:** < 5 minutes to disable via feature flag

> Architecture details: See [BFF-RPC-DESIGN.md](../20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md), [ADR-015](../80-adrs/ADR-015-rls-connection-pooling-strategy.md), [ADR-018](../80-adrs/ADR-018-security-definer-governance.md)

---

## 6. UX / Flow Overview

**Flow 1: Modal Open (BFF RPC Path)**
1. User clicks rating slip row in pit dashboard
2. Frontend calls `GET /api/v1/rating-slips/[id]/modal-data`
3. Route handler checks `USE_BFF_RPC` feature flag
4. If enabled: calls `supabase.rpc('rpc_get_rating_slip_modal_data')`
5. Single database round trip aggregates all data
6. Response returned in ~150ms
7. Modal renders with player, loyalty, financial, and table data

**Flow 2: Modal Open (Legacy Path - Fallback)**
1. User clicks rating slip row in pit dashboard
2. Frontend calls `GET /api/v1/rating-slips/[id]/modal-data`
3. Route handler checks `USE_BFF_RPC` feature flag
4. If disabled: executes current multi-query parallelized implementation
5. 6+ database queries execute across 3 phases
6. Response returned in ~600ms
7. Modal renders (same data, slower)

**Flow 3: Rollback Procedure**
1. Ops detects performance regression or errors
2. Sets `NEXT_PUBLIC_USE_MODAL_BFF_RPC=false` in environment
3. Redeploys application (<5 minutes)
4. All requests route to legacy implementation
5. No user-facing disruption

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PERF-001 WS1-WS3 Complete** - Batch queries, parallelization, and indexes must be stable (✅ Done)
- **BFF-RPC-DESIGN.md Approved** - Design document reviewed and approved (✅ Done)
- **ADR-015/018/020 Compliance** - RLS strategy and SECURITY INVOKER governance (✅ Compliant)
- **Supabase RPC Support** - Platform supports custom PostgreSQL functions (✅ Available)

### 7.2 Risks & Open Questions

- **Risk: Query plan regression** — PostgreSQL optimizer may choose suboptimal plan for complex JSONB aggregation. *Mitigation: EXPLAIN ANALYZE validation in staging before production rollout.*

- **Risk: Schema drift** — Table structure changes require RPC updates. *Mitigation: Include RPC in migration review checklist; version function name if needed.*

- **Risk: RLS policy gaps** — Missing RLS on joined tables could leak data. *Mitigation: Security tests validate cross-casino isolation; SECURITY INVOKER inherits all policies.*

- **Open Question: Theo calculation accuracy** — Does inlined loyalty suggestion logic match existing RPC output exactly? *Resolution: Unit test validates identical output for sample inputs.*

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] RPC function returns identical DTO to current implementation (diff test)
- [ ] Feature flag toggles between implementations without restart
- [ ] Both paths produce identical responses for same input

**Data & Integrity**
- [ ] No data inconsistencies between RPC and multi-query paths
- [ ] JSONB aggregation handles NULL values correctly
- [ ] Duration calculation matches existing RPC output

**Security & Access**
- [ ] SECURITY INVOKER enforces RLS on all 7 joined tables
- [ ] Casino mismatch throws explicit error (not silent filter)
- [ ] Cross-casino test confirms zero data leakage
- [ ] No privilege escalation possible via RPC parameters

**Testing**
- [ ] PostgreSQL unit tests pass for RPC function
- [ ] Service layer integration tests pass
- [ ] Contract tests validate DTO schema
- [ ] RLS security tests pass (multi-tenant isolation)
- [ ] Performance benchmark shows p95 < 200ms

**Operational Readiness**
- [ ] X-Query-Timings header available in development
- [ ] Prometheus metrics track both implementation paths
- [ ] Rollback procedure documented and tested
- [ ] Feature flag documented in deployment runbook

**Documentation**
- [ ] Migration file includes comprehensive comments
- [ ] Service catalog updated with RPC pattern
- [ ] PERF-001 checkpoint marked complete

---

## 9. Related Documents

- **Design Document**: [`docs/20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md`](../20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md)
- **Performance Analysis**: [`docs/50-ops/performance/PERF-001-rating-slip-modal-analysis.md`](../50-ops/performance/PERF-001-rating-slip-modal-analysis.md)
- **Execution Spec**: [`docs/20-architecture/specs/PERF-001/EXECUTION-SPEC-PERF-001.md`](../20-architecture/specs/PERF-001/EXECUTION-SPEC-PERF-001.md)
- **RLS Strategy**: [`docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`](../80-adrs/ADR-015-rls-connection-pooling-strategy.md)
- **SECURITY DEFINER Governance**: [`docs/80-adrs/ADR-018-security-definer-governance.md`](../80-adrs/ADR-018-security-definer-governance.md)
- **Track A Hybrid Strategy**: [`docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md`](../80-adrs/ADR-020-rls-track-a-mvp-strategy.md)
- **Modal Integration PRD**: [`docs/10-prd/PRD-008-rating-slip-modal-integration.md`](PRD-008-rating-slip-modal-integration.md)
- **Schema / Types**: `types/database.types.ts`
- **Route Handler**: `app/api/v1/rating-slips/[id]/modal-data/route.ts`

---

## Appendix A: RPC Function Signature

```sql
CREATE OR REPLACE FUNCTION rpc_get_rating_slip_modal_data(
  p_slip_id uuid,
  p_casino_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
-- Full implementation in BFF-RPC-DESIGN.md
$$;

COMMENT ON FUNCTION rpc_get_rating_slip_modal_data IS
  'BFF RPC: Single round trip aggregation for rating slip modal.
   SECURITY INVOKER (inherits RLS). PRD-018.';

GRANT EXECUTE ON FUNCTION rpc_get_rating_slip_modal_data(uuid, uuid) TO authenticated;
```

---

## Appendix B: Implementation Plan

### WS1: Database Migration (P0)

- [ ] Create migration file: `YYYYMMDDHHMMSS_prd018_modal_bff_rpc.sql`
- [ ] Implement RPC function per BFF-RPC-DESIGN.md
- [ ] Add PostgreSQL unit tests
- [ ] Run EXPLAIN ANALYZE on staging data
- [ ] Validate RLS enforcement via test queries

### WS2: Service Layer Integration (P0)

- [ ] Add `getModalDataViaRPC()` to `services/rating-slip/crud.ts`
- [ ] Export from service interface
- [ ] Add integration tests with mock Supabase client
- [ ] Validate DTO type compatibility

### WS3: Route Handler Integration (P0)

- [ ] Add `USE_BFF_RPC` feature flag check
- [ ] Implement conditional path selection
- [ ] Ensure X-Query-Timings works for both paths
- [ ] Add contract tests comparing both paths

### WS4: Testing & Validation (P0)

- [ ] RLS security tests (cross-casino isolation)
- [ ] Performance benchmark tests (p95 target)
- [ ] DTO diff tests (identical output validation)
- [ ] Edge case tests (NULL player, empty tables, etc.)

### WS5: Rollout & Monitoring (P1)

- [ ] Document feature flag in deployment runbook
- [ ] Create Prometheus dashboard comparing paths
- [ ] Staged rollout: 0% → 10% → 50% → 100%
- [ ] Monitor for 7 days at 100% before cleanup

### WS6: Cleanup (P2 - Post Validation)

- [ ] Remove feature flag code
- [ ] Archive multi-query implementation
- [ ] Update PERF-001 checkpoint to final complete

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**RatingSlip Domain**
- `RATING_SLIP_NOT_FOUND` (404) - Slip ID does not exist or not accessible
- `VISIT_NOT_FOUND` (404) - Associated visit not found
- `TABLE_NOT_FOUND` (404) - Associated gaming table not found

**Security Domain**
- `UNAUTHORIZED` (401) - RLS context not set (app.casino_id required)
- `CASINO_MISMATCH` (403) - Caller casino_id doesn't match provided parameter

---

## Appendix D: Performance Targets

| Metric | Current (WS1-WS3) | Target (BFF RPC) | Improvement |
|--------|-------------------|------------------|-------------|
| p50 | 400ms | 100ms | -75% |
| p95 | 600ms | 150ms | -75% |
| p99 | 900ms | 250ms | -72% |
| Queries | 6+ | 1 | -83% |
| Network RTT | 3 phases | 1 phase | -67% |

---

## Appendix E: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-26 | prd-writer skill | Initial draft from BFF-RPC-DESIGN.md |

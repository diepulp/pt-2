---
id: PRD-004-SPECS-INDEX
title: PRD-004 LoyaltyService - Specification Index
owner: Backend Architect
status: Proposed
created: 2025-12-13
---

# PRD-004 LoyaltyService Specification Index

**Complete technical specifications for ledger-based loyalty points system implementation.**

---

## Overview

This directory contains detailed technical specifications that complement the main PRD-004 document. These specs provide implementation-ready details for:

1. **Idempotency & Uniqueness** - Preventing duplicate operations
2. **Balance Drift Detection** - Maintaining data integrity
3. **RPC & RLS Implementation** - Security and authorization
4. **Pagination & Ledger Queries** - Performance and UX
5. **Migration Strategy** - Schema evolution

---

## Document Map

### Core Implementation Specs

#### 1. [IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md](./IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md)
**Purpose:** Closes critical gaps in idempotency constraints and balance reconciliation

**Covers:**
- Exact unique index definitions for all operation types
- Idempotency key pattern for retry safety
- Drift detection mechanism (scheduled reconciliation)
- Test acceptance criteria

**Key Decisions:**
- Multi-tier idempotency: Natural keys + Universal idempotency_key
- Scheduled drift check (not triggers or materialized views)
- Row locking for concurrency safety

**Implementation Priority:** 🔴 **CRITICAL** - Required for MVP

---

#### 2. [QUICK-REFERENCE-IDEMPOTENCY-DRIFT.md](./QUICK-REFERENCE-IDEMPOTENCY-DRIFT.md)
**Purpose:** One-page implementation guide (condensed from full spec)

**Use when:**
- Writing migration SQL
- Implementing RPC functions
- Need quick copy-paste patterns

**Contains:**
- 4 SQL index definitions (ready to execute)
- RPC idempotency template
- Drift detection function
- Scheduled monitoring setup

**Implementation Priority:** 🔴 **CRITICAL** - Use during WS1/WS2

---

#### 3. [RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md](./RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md)
**Purpose:** Complete RPC signatures, RLS policies, and role authorization matrix

**Covers:**
- Full RPC SQL implementations with SECURITY INVOKER pattern
- RLS policies for casino isolation and role gates
- Authorization matrix (pit_boss, cashier, admin roles)
- Append-only enforcement policies

**Implementation Priority:** 🔴 **CRITICAL** - Required for WS2

---

#### 4. [LEDGER-PAGINATION-CONTRACT.md](./LEDGER-PAGINATION-CONTRACT.md)
**Purpose:** Cursor-based pagination for ledger queries

**Covers:**
- Pagination pattern (cursor-based, not offset)
- Filter parameters (casino, player, date range, reason)
- Performance indexes for pagination queries
- TypeScript DTO contracts

**Implementation Priority:** 🟡 **HIGH** - Required for WS4/WS5

---

#### 5. [ARCHITECTURE-DIAGRAMS.md](./ARCHITECTURE-DIAGRAMS.md)
**Purpose:** Visual representations of system architecture

**Contains:**
- Idempotency index strategy diagram
- Idempotent RPC flow (step-by-step)
- Balance drift detection layers
- Operation type constraint matrix
- Concurrent redemption safety (timeline)
- Test coverage map

**Implementation Priority:** 🟢 **REFERENCE** - Use during design review

---

### Supporting Specs

#### 6. [EXECUTION-SPEC-PRD-004.md](./EXECUTION-SPEC-PRD-004.md)
**Purpose:** Workstream breakdown and execution plan

**Covers:**
- WS1-WS7 workstream definitions
- Execution phases (topologically sorted)
- Validation gates (schema, type-check, lint, test)
- External dependencies (PRD-002, ADR-015, etc.)

**Implementation Priority:** 🟢 **PLANNING** - Use for sprint planning

---

#### 7. [MIGRATION-STRATEGY-PRD-004.md](./MIGRATION-STRATEGY-PRD-004.md)
**Purpose:** Schema evolution strategy (greenfield context)

**Covers:**
- Enum migration strategy (additive, no rename)
- Column additions (source_kind, source_id, metadata, points_delta)
- Index creation order
- Backward compatibility (N/A - greenfield)

**Implementation Priority:** 🟡 **HIGH** - Required for WS1

---

#### 8. [PAGINATION-QUICKSTART.md](./PAGINATION-QUICKSTART.md)
**Purpose:** Quick reference for pagination implementation

**Contains:**
- SQL cursor query template
- TypeScript DTO example
- React Query hook pattern

**Implementation Priority:** 🟡 **HIGH** - Use during WS6

---

## Implementation Workflow

### Phase 1: Database Foundation (WS1)
**Read:**
1. MIGRATION-STRATEGY-PRD-004.md (schema changes)
2. QUICK-REFERENCE-IDEMPOTENCY-DRIFT.md (index definitions)
3. IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md (full context)

**Deliverable:**
- Migration: `supabase/migrations/20251212175911_prd004_loyalty_service_schema.sql`
- Includes: enum values, columns, 4 unique indexes, check constraints

---

### Phase 2: Database RPCs (WS2)
**Read:**
1. RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md (RPC implementations)
2. QUICK-REFERENCE-IDEMPOTENCY-DRIFT.md (idempotency pattern)
3. IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md (drift detection function)

**Deliverable:**
- Migration: `supabase/migrations/20251212180000_prd004_loyalty_rpcs.sql`
- Includes: 5 RPCs (accrue, redeem, manual, promotion, suggestion) + drift check function

---

### Phase 3: Service Layer (WS3/WS4)
**Read:**
1. LEDGER-PAGINATION-CONTRACT.md (DTOs, schemas)
2. EXECUTION-SPEC-PRD-004.md (service interface)

**Deliverable:**
- `services/loyalty/` - DTOs, schemas, CRUD, mappers, selects, keys, HTTP fetchers

---

### Phase 4: Transport Layer (WS5/WS6)
**Read:**
1. PAGINATION-QUICKSTART.md (pagination hooks)
2. EXECUTION-SPEC-PRD-004.md (route handlers)

**Deliverable:**
- `app/api/v1/loyalty/` - Route handlers
- `hooks/loyalty/` - React Query hooks

---

### Phase 5: Testing (WS7)
**Read:**
1. IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md (test acceptance criteria)
2. ARCHITECTURE-DIAGRAMS.md (test coverage map)

**Deliverable:**
- `services/loyalty/__tests__/` - Unit, integration, RLS, golden fixture tests

---

## Quick Links

| Need | Document | Section |
|------|----------|---------|
| **Index SQL** | [QUICK-REFERENCE](./QUICK-REFERENCE-IDEMPOTENCY-DRIFT.md) | "4 Required Indexes" |
| **RPC Template** | [QUICK-REFERENCE](./QUICK-REFERENCE-IDEMPOTENCY-DRIFT.md) | "Idempotency: RPC Pattern" |
| **Drift Check** | [QUICK-REFERENCE](./QUICK-REFERENCE-IDEMPOTENCY-DRIFT.md) | "Drift Detection: Single SQL Function" |
| **RPC Full Impl** | [RPC-RLS-ROLE](./RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md) | "RPC Implementations" |
| **RLS Policies** | [RPC-RLS-ROLE](./RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md) | "RLS Policies" |
| **Role Matrix** | [RPC-RLS-ROLE](./RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md) | "Authorization Matrix" |
| **Pagination** | [PAGINATION-QUICKSTART](./PAGINATION-QUICKSTART.md) | "SQL Cursor Query Template" |
| **DTOs** | [LEDGER-PAGINATION](./LEDGER-PAGINATION-CONTRACT.md) | "DTO Contracts" |
| **Diagrams** | [ARCHITECTURE-DIAGRAMS](./ARCHITECTURE-DIAGRAMS.md) | All sections |

---

## Gap Closure Summary

### Gap 1: Idempotency/Uniqueness ✅ CLOSED

**Required Indexes:**
1. **Base Accrual** - `(casino_id, source_kind, source_id, reason)` WHERE `reason = 'base_accrual'`
2. **Promotion** - `(casino_id, source_kind, source_id, campaign_id)` WHERE `reason = 'promotion'`
3. **Idempotency** - `(casino_id, idempotency_key)` WHERE `idempotency_key IS NOT NULL` (existing)
4. **Reversal** - `(casino_id, reversed_ledger_id)` WHERE `reason = 'reversal'` (optional, recommended)

**Idempotency Pattern:**
- All mutating RPCs accept `idempotency_key` parameter
- Check existing entry (natural key OR idempotency_key)
- INSERT with ON CONFLICT DO NOTHING
- Return existing entry if conflict (`is_existing: true`)

**Document:** [IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md](./IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md)

---

### Gap 2: Balance Drift Detection ✅ CLOSED

**Recommended Approach:** Scheduled Background Check (Option A)

**Components:**
1. **Detection Function:** `check_loyalty_balance_drift()` - SQL function that computes `current_balance - SUM(points_delta)`
2. **Scheduling:** pg_cron job (3 AM daily) OR Vercel Cron endpoint
3. **Alerting:** Insert into audit_log, route by severity (critical: >1000 drift, warning: >100)
4. **Reconciliation:** Manual SQL procedure to fix drift

**Why Not Triggers/Materialized Views:**
- No write amplification (read-only check)
- Simpler (one SQL function + cron)
- Catches all drift sources (not just race conditions)
- Guardrails-compliant (no over-engineering)

**Document:** [IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md](./IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md)

---

## Validation Checklist

### Schema (WS1)
- [ ] `source_kind`, `source_id`, `metadata`, `note`, `points_delta` columns added
- [ ] 4 unique indexes created (base_accrual, promotion, idempotency, reversal)
- [ ] Check constraint: `base_accrual` cannot be negative
- [ ] `npm run db:types` succeeds

### RPCs (WS2)
- [ ] All RPCs are SECURITY INVOKER (no SECURITY DEFINER)
- [ ] Idempotency pattern implemented (check existing, ON CONFLICT, handle collision)
- [ ] Row locking (`FOR UPDATE`) for balance updates
- [ ] `check_loyalty_balance_drift()` function created
- [ ] All RPCs return `is_existing: boolean`

### Service Layer (WS3/WS4)
- [ ] DTOs follow Pattern A (manual interfaces, no ReturnType)
- [ ] Zod schemas match DTO types
- [ ] Mappers transform Row -> DTO without `as` casting
- [ ] Keys follow existing patterns
- [ ] HTTP fetchers for route handlers

### Testing (WS7)
- [ ] Idempotency tests: duplicate call returns existing
- [ ] Concurrency tests: parallel operations maintain balance integrity
- [ ] Drift tests: Balance = SUM(points_delta) after each operation
- [ ] RLS tests: Casino isolation, role gates, append-only enforcement
- [ ] Golden fixtures: TS formula matches DB RPC outputs

---

## Related Documents

### Primary PRD
- **PRD-004**: `/home/diepulp/projects/pt-2/docs/10-prd/PRD-004-loyalty-service.md`

### Architecture Decisions
- **ADR-019 v2**: `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-019-loyalty-points-policy_v2.md`

### Policy Documents
- **Policy**: `/home/diepulp/projects/pt-2/docs/00-vision/LoyaltyService_Points_Policy_PT-2.md`

### Infrastructure Dependencies
- **ADR-015**: RLS Connection Pooling (Pattern C hybrid)
- **PRD-HZ-001**: withServerAction middleware
- **PRD-002**: RatingSlipService (slip close triggers accrual)
- **PRD-003**: VisitService (visit context for ledger)

---

## Questions?

**For implementation questions:**
1. Check [QUICK-REFERENCE-IDEMPOTENCY-DRIFT.md](./QUICK-REFERENCE-IDEMPOTENCY-DRIFT.md) first
2. Refer to full spec [IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md](./IDEMPOTENCY-AND-DRIFT-DETECTION-SPEC.md)
3. Review diagrams [ARCHITECTURE-DIAGRAMS.md](./ARCHITECTURE-DIAGRAMS.md)

**For RPC/RLS questions:**
- See [RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md](./RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md)

**For pagination questions:**
- See [PAGINATION-QUICKSTART.md](./PAGINATION-QUICKSTART.md)

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-13 | Backend Architect | Created spec index and gap closure documents |

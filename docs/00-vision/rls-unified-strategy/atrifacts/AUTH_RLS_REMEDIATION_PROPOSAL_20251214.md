# Unified Auth/RLS Architecture Remediation Proposal

**Date:** 2025-12-14
**Status:** PROPOSED
**Reference:** AUTH_ARCH_GAPS_FINDINGS_AND_REMEDIATIONS.md

---

## Executive Summary

This document consolidates findings from 4 parallel architecture audits to provide a unified remediation strategy for PT-2's authentication and Row-Level Security (RLS) architecture.

### System Audit Summary

| Audit Domain | Agent | Key Finding |
|--------------|-------|-------------|
| **RLS Policies** | RLS Expert | 56% compliance (65/116 active policies); P0 bug in Loyalty context |
| **RPC Inventory** | Backend Builder | 22 RPCs; 7 at-risk for pooling (need self-injection) |
| **Transport Layer** | API Expert | 51 routes, 100% user JWT; dev-mode bypass creates HIGH risk |
| **Architecture** | Lead Architect | GAP 1,2,5 partially addressed; GAP 3,4,6 mitigated |

### Risk Assessment

| Risk Level | Count | Summary |
|------------|-------|---------|
| **P0 CRITICAL** | 2 | Loyalty RLS wrong JWT path; production service role exposure |
| **P1 HIGH** | 2 | 7 SECURITY DEFINER RPCs need self-injection; incomplete hybrid patterns |
| **P2 MEDIUM** | 3 | Typed middleware, casino scope assertions, audit hardening |
| **P3 LOW** | 2 | JWT-only migration, multi-step RPC wrappers |

### Consensus Recommendation

**Immediate (before production):**
1. Fix Loyalty RLS policies (wrong JWT path + missing NULLIF)
2. Add production guard to `createServiceClient()`

**Near-term (next sprint):**
3. Add self-injection to 7 at-risk SECURITY DEFINER RPCs
4. Complete hybrid patterns in loyalty/rating slip RPCs

**Strategic (post-MVP):**
5. Migrate to JWT-only RLS (ADR-015 Phase 3)
6. Create atomic multi-step RPCs for complex workflows

---

## Gap Validation Matrix

### Original Gaps (from AUTH_ARCH_GAPS_FINDINGS_AND_REMEDIATIONS.md)

| Gap | Description | RLS Expert | Backend Builder | API Expert | Final Status |
|-----|-------------|------------|-----------------|------------|--------------|
| **GAP 1** | Pooling context loss | 33 BARE_CURRENT_SETTING issues | 7 RPCs rely on external context | ADR-015 compliant injection | **PARTIAL** |
| **GAP 2** | Ambiguous execution identity | N/A | N/A | Dev-mode bypass = HIGH risk | **PARTIAL** |
| **GAP 3** | SECURITY DEFINER bypass | All validate casino_id | All RPCs have explicit validation | Middleware enforces auth | **MITIGATED** |
| **GAP 4** | RPCs not trust boundaries | N/A | Explicit role gates in all mutating RPCs | Comprehensive middleware chain | **COMPLIANT** |
| **GAP 5** | Implicit context (magic vars) | 16 MISSING_ROLE_HYBRID | 4 self-inject, 8 JWT-only, 7 external | Non-null assertions in handlers | **PARTIAL** |
| **GAP 6** | Audit not first-class | N/A | Audit logs in DEFINER RPCs | withAudit() in middleware chain | **COMPLIANT** |

### New Issues Discovered

| Issue ID | Severity | Source | Description |
|----------|----------|--------|-------------|
| **WRONG_JWT_PATH** | P0 | RLS Expert | Loyalty policies use `auth.jwt()->>'casino_id'` instead of `auth.jwt()->'app_metadata'->>'casino_id'` |
| **MISSING_NULLIF** | P0 | RLS Expert | 33 instances of `current_setting()` without NULLIF wrapper |
| **DEV_BYPASS_LEAK** | P0 | API Expert | Dev-mode service role bypass could leak to production if NODE_ENV misconfigured |
| **EXTERNAL_CONTEXT_RPCS** | P1 | Backend Builder | 7 SECURITY DEFINER RPCs rely on external context injection |
| **NONNULL_ASSERTIONS** | P2 | API Expert | TypeScript `!` assertions bypass compile-time safety for rlsContext |

---

## Prioritized Remediation Actions

### P0 - CRITICAL (Block Production Deployment)

#### P0-1: Fix Loyalty RLS Policies

**Bug:** Loyalty policies use wrong JWT path, making JWT fallback non-functional.

**Files Affected:**
- `supabase/migrations/20251213003000_prd004_loyalty_service_schema.sql` (superseded)
- `supabase/migrations/20251214195201_adr015_prd004_loyalty_rls_fix.sql` (verify deployed)

**Verification Required:**
```sql
-- Run in Supabase SQL editor
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename IN ('loyalty_ledger', 'player_loyalty')
ORDER BY tablename, policyname;
```

**Expected Pattern:**
```sql
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

**Status:** Migration `20251214195201_adr015_prd004_loyalty_rls_fix.sql` deployed. Verify in database.

**Effort:** 30 minutes (verification + scanner update)

---

#### P0-2: Add Production Guard to Service Client

**Bug:** Dev-mode service role bypass could execute in production if `NODE_ENV=development` leaks.

**File:** `/home/diepulp/projects/pt-2/lib/supabase/service.ts`

**Current Code:**
```typescript
export function createServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { ... }
  );
}
```

**Recommended Fix:**
```typescript
export function createServiceClient(): SupabaseClient<Database> {
  // SECURITY: Prevent service role usage in production runtime
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SECURITY_VIOLATION: Service client forbidden in production. ' +
      'Use user JWT client via createClient() instead.'
    );
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { ... }
  );
}
```

**Effort:** 5 minutes

---

### P1 - HIGH (Complete Before Feature Freeze)

#### P1-1: Add Self-Injection to Financial RPCs

**Issue:** 3 HIGH-risk SECURITY DEFINER RPCs rely on external context, creating pooling vulnerability.

**RPCs Affected:**
- `rpc_request_table_fill` (chip movement audit)
- `rpc_request_table_credit` (chip movement audit)
- `rpc_log_table_drop` (revenue calculation)

**Migration Template:**
```sql
-- Migration: 20251215_XXXXXX_adr015_financial_rpc_self_injection.sql

CREATE OR REPLACE FUNCTION rpc_request_table_fill(
  p_casino_id uuid,
  p_table_id uuid,
  p_actor_id uuid,
  p_amount numeric,
  p_chip_types jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
  v_context_staff_role text;
BEGIN
  -- Self-inject context (ADR-015 Pattern B)
  v_context_staff_role := COALESCE(
    NULLIF(current_setting('app.staff_role', true), ''),
    (auth.jwt() -> 'app_metadata' ->> 'staff_role')::text,
    'pit_boss'
  );
  PERFORM set_rls_context(p_actor_id, p_casino_id, v_context_staff_role);

  -- Validate context
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_CASINO_CONTEXT';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'CASINO_MISMATCH: % != %', p_casino_id, v_context_casino_id;
  END IF;

  -- Original business logic...
END;
$$;
```

**Effort:** 3-4 hours (3 RPCs x ~1 hour each)

---

#### P1-2: Add Self-Injection to Floor Layout RPCs

**Issue:** 2 MEDIUM-risk SECURITY DEFINER RPCs rely on external context.

**RPCs Affected:**
- `rpc_create_floor_layout`
- `rpc_activate_floor_layout`

**Pattern:** Same as P1-1

**Effort:** 2 hours

---

#### P1-3: Complete Hybrid Pattern in Loyalty RPCs

**Issue:** Loyalty RPCs use NULLIF but lack COALESCE+JWT fallback.

**RPCs Affected:**
- `rpc_accrue_loyalty_points`
- `rpc_redeem_loyalty_points`
- `rpc_adjust_loyalty_balance`
- `rpc_get_player_loyalty_balance`
- `rpc_get_loyalty_ledger_history`

**Current Pattern (Incomplete):**
```sql
v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
```

**Correct Pattern (Complete):**
```sql
v_context_casino_id := COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
);
```

**Effort:** 2-3 hours

---

### P2 - MEDIUM (Post-MVP Hardening)

#### P2-1: Add Explicit RLS Context Validation in Route Handlers

**Issue:** TypeScript non-null assertions (`!`) bypass compile-time safety.

**Current Pattern:**
```typescript
const slip = await service.start(
  mwCtx.rlsContext!.casinoId,  // ← Non-null assertion
  mwCtx.rlsContext!.actorId,
  input,
);
```

**Recommended Pattern:**
```typescript
if (!mwCtx.rlsContext) {
  throw new DomainError('INTERNAL_ERROR', 'RLS context missing');
}
const { casinoId, actorId } = mwCtx.rlsContext;
const slip = await service.start(casinoId, actorId, input);
```

**Scope:** ~51 route handlers

**Effort:** 2-3 hours (repetitive but straightforward)

---

#### P2-2: Add Typed Middleware Dependencies

**Issue:** Middleware ordering is implicit, not type-enforced.

**Recommendation:**
```typescript
// lib/server-actions/middleware/types.ts
type AuthenticatedContext = MiddlewareContext & {
  rlsContext: RLSContext; // Required, not optional
};

// lib/server-actions/middleware/rls.ts
export function withRLS<T>(): Middleware<T, AuthenticatedContext> {
  return async (ctx: AuthenticatedContext, next) => {
    // TypeScript enforces rlsContext exists
    await injectRLSContext(ctx.supabase, ctx.rlsContext, ctx.correlationId);
    return next();
  };
}
```

**Effort:** 2-3 hours

---

#### P2-3: Add Casino Scope Assertions to Write Operations

**Issue:** Services trust RLS to enforce scope, but bugs could allow cross-tenant writes.

**Recommendation:**
```typescript
// In service write methods
async function closeRatingSlip(slipId: string, ctx: RLSContext) {
  const { data: slip } = await supabase
    .from('rating_slip')
    .select('casino_id')
    .eq('id', slipId)
    .single();

  assertCasinoScope(ctx, slip.casino_id); // Explicit validation
  // ... proceed
}
```

**Effort:** 4-6 hours (across all write methods)

---

### P3 - LOW (Strategic Improvements)

#### P3-1: Migrate to JWT-Only RLS (ADR-015 Phase 3)

**Goal:** Eliminate session variable dependency entirely.

**Benefits:**
- Perfect connection pooling safety
- Simpler auth model
- No `set_rls_context()` calls needed
- Single source of truth (JWT)

**Migration Path:**
1. Verify JWT claims sync is reliable (`sync_staff_jwt_claims` trigger)
2. Convert hybrid policies to JWT-only (Pattern A)
3. Deprecate `set_rls_context()` RPC
4. Remove `injectRLSContext()` middleware

**Timeline:** Post-MVP (1-2 weeks)

---

#### P3-2: Create Atomic Multi-Step RPCs

**Goal:** Eliminate multi-transaction pooling risks.

**Example:** Close + Restart Rating Slip
```sql
CREATE FUNCTION rpc_close_and_restart_slip(
  p_slip_id uuid,
  p_casino_id uuid,
  p_actor_id uuid,
  p_new_table_id uuid DEFAULT NULL
) RETURNS rating_slip
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Self-inject context once
  PERFORM set_rls_context(p_actor_id, p_casino_id,
    COALESCE(NULLIF(current_setting('app.staff_role', true), ''),
             (auth.jwt() -> 'app_metadata' ->> 'staff_role')));

  -- Both operations in same transaction
  PERFORM rpc_close_rating_slip(p_slip_id, p_casino_id, p_actor_id);
  RETURN rpc_start_rating_slip(p_casino_id, ...);
END;
$$;
```

**Candidates:**
- Close + Restart Rating Slip
- Table Fill + Inventory Snapshot
- Accrue + Redeem Loyalty (bulk operations)

**Timeline:** As needed

---

## Testing & Validation Requirements

### Integration Test Suite

#### 1. RLS Pooling Safety Tests
**Location:** `lib/supabase/__tests__/rls-loyalty-pooling.integration.test.ts`

```typescript
describe('Loyalty RLS Pooling Safety', () => {
  test('JWT fallback works when session context missing', async () => {
    const supabase = createClient(/* user JWT with casino_id in app_metadata */);

    // No set_rls_context() call
    const { data, error } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .limit(1);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  test('Empty RLS context gracefully falls back to JWT', async () => {
    // Simulate empty string context (edge case)
    // Should use NULLIF wrapper to treat as NULL
  });

  test('Cross-tenant isolation enforced via JWT', async () => {
    // Casino A client should only see Casino A data
  });
});
```

#### 2. RPC Self-Injection Tests
**Location:** `services/table-context/__tests__/rpc-pooling-safety.test.ts`

```typescript
describe('Table Context RPC Pooling Safety', () => {
  test('rpc_request_table_fill works without middleware context', async () => {
    const supabase = createClient(/* user JWT */);

    // Call RPC directly (simulating fresh pooled connection)
    const { error } = await supabase.rpc('rpc_request_table_fill', {
      p_casino_id: 'casino-id',
      // ... params
    });

    expect(error).toBeNull(); // Should self-inject and succeed
  });
});
```

#### 3. Production Guard Test
**Location:** `lib/supabase/__tests__/service-client.test.ts`

```typescript
describe('Service Client Security', () => {
  test('throws in production environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    expect(() => createServiceClient()).toThrow('SECURITY_VIOLATION');

    process.env.NODE_ENV = originalEnv;
  });
});
```

### Scanner Verification

After applying remediations, run ADR-015 scanner:
```bash
bash scripts/adr015-rls-scanner.sh
```

**Target:** 0 issues in non-superseded migrations

### Manual Verification Checklist

- [ ] Verify loyalty policies in database match Pattern C
- [ ] Confirm production service client throws error
- [ ] Test modal-data endpoint returns 200 (was failing with 500)
- [ ] Run E2E tests for rating slip lifecycle
- [ ] Run E2E tests for loyalty operations

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Day 1)

| Task | Effort | Owner |
|------|--------|-------|
| Verify loyalty RLS fix deployed | 30m | DBA |
| Add production guard to service client | 10m | Backend |
| Update ADR-015 scanner superseded list | 15m | Backend |
| Run scanner, verify 0 issues | 15m | QA |

### Phase 2: Pooling Safety (Days 2-3)

| Task | Effort | Owner |
|------|--------|-------|
| P1-1: Financial RPC self-injection | 4h | Backend |
| P1-2: Floor layout RPC self-injection | 2h | Backend |
| P1-3: Loyalty RPC hybrid completion | 3h | Backend |
| Integration tests for new patterns | 3h | QA |

### Phase 3: Hardening (Week 2)

| Task | Effort | Owner |
|------|--------|-------|
| P2-1: Explicit context validation | 3h | Frontend/Backend |
| P2-2: Typed middleware dependencies | 3h | Backend |
| P2-3: Casino scope assertions | 6h | Backend |
| E2E test suite expansion | 4h | QA |

### Phase 4: Strategic (Post-MVP)

| Task | Effort | Owner |
|------|--------|-------|
| P3-1: JWT-only migration (ADR-015 Phase 3) | 1-2 weeks | Architect |
| P3-2: Atomic multi-step RPCs | As needed | Backend |

---

## Acceptance Criteria

### Definition of Done: Auth/RLS Remediation Complete

1. **ADR-015 Scanner:** 0 issues in non-superseded migrations
2. **Loyalty Endpoint:** `GET /api/v1/rating-slips/{id}/modal-data` returns 200
3. **Production Guard:** `createServiceClient()` throws in production
4. **Self-Injection:** All 22 RPCs use Pattern A (JWT-only) or Pattern B (self-inject)
5. **Integration Tests:** 100% pass rate for pooling safety suite
6. **E2E Tests:** Rating slip + loyalty workflows pass

---

## Appendix: Quick Reference

### ADR-015 Pattern Summary

| Pattern | Used For | Pooling Safe | Example |
|---------|----------|--------------|---------|
| **A: JWT-Only** | New services | Yes | Loyalty service INVOKER RPCs |
| **B: Self-Inject** | Legacy DEFINER | Yes | Rating slip lifecycle RPCs |
| **C: Hybrid** | Policies | Yes | `COALESCE(NULLIF(current_setting...), auth.jwt()...)` |

### Correct JWT Path

```sql
-- Correct
(auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid

-- Wrong (was deployed in loyalty)
(auth.jwt() ->> 'casino_id')::uuid
```

### NULLIF Wrapper Pattern

```sql
-- Correct
NULLIF(current_setting('app.casino_id', true), '')::uuid

-- Wrong (empty string passes through)
current_setting('app.casino_id', true)::uuid
```

---

## Related Documents

- `docs/issues/AUTH_ARCH_GAPS_FINDINGS_AND_REMEDIATIONS.md` - Original gap analysis
- `docs/issues/RLS-JWT-FIRST-COMPLIANCE-AUDIT-20251214.md` - RLS Expert report
- `docs/issues/RPC_INVENTORY_AND_AUTH_AUDIT_20251214.md` - Backend Builder report
- `docs/issues/API_TRANSPORT_AUTH_FLOW_AUDIT_20251214.md` - API Expert report
- `docs/issues/adr015-compliance-report.md` - Scanner results
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - Reference architecture

---

**End of Proposal**

*Prepared by multi-agent architecture audit team, 2025-12-14*

---
id: GOV-PAT-003
title: BFF RPC Aggregation Pattern
status: validated
created: 2025-12-26
validated_by: PRD-018
classification: Performance Optimization
related_adrs: [ADR-015, ADR-018, ADR-020]
---

# BFF RPC Aggregation Pattern

## Pattern ID: GOV-PAT-003

## Status: Validated (PRD-018)

---

## Problem Statement

API endpoints that aggregate data from multiple bounded contexts suffer from:

1. **Multiple database round trips** (6+ queries even with parallelization)
2. **Application-layer data assembly overhead**
3. **Network latency multiplication** (each query adds ~30-50ms)
4. **Connection pool pressure** from concurrent queries

**Typical Symptom:** Endpoint latency > 500ms despite query parallelization.

---

## Solution

Consolidate multi-context data fetching into a **single PostgreSQL RPC function** that:

1. Performs all JOINs and aggregations server-side
2. Returns complete DTO as JSONB in single round trip
3. Leverages PostgreSQL query planner optimization
4. Uses `SECURITY INVOKER` for automatic RLS inheritance

---

## When to Apply

**Apply this pattern when ALL conditions are met:**

| Condition | Threshold |
|-----------|-----------|
| **Endpoint frequency** | > 100 calls/day per user |
| **Cross-context aggregation** | 3+ bounded contexts |
| **Data model stability** | Schema not actively evolving |
| **Operation type** | Read-only (no writes) |
| **User impact** | Latency-sensitive UI (user waits) |

**Do NOT apply when:**

- Endpoint called rarely (< 10x/day) - not worth complexity
- Single bounded context - use simple service query
- Write operations involved - use transactions instead
- Schema still evolving - TypeScript is easier to iterate
- Team lacks PostgreSQL expertise - maintenance burden

---

## Implementation Guide

### Step 1: Identify Candidates

Look for endpoints with:

```typescript
// Multiple await calls to different services
const slip = await ratingSlipService.getById(slipId);
const visit = await visitService.getById(slip.visitId);
const player = await playerService.getById(visit.playerId);
const loyalty = await loyaltyService.getBalance(player.id);
// ... more service calls

// Or Promise.all() batching
const [table, financial, activeTables] = await Promise.all([
  tableService.getById(slip.tableId),
  financialService.getSummary(visit.id),
  tableService.getActiveTables(casinoId),
]);
```

### Step 2: Design RPC Function

```sql
CREATE OR REPLACE FUNCTION rpc_get_<feature>_data(
  p_<primary_id> uuid,
  p_casino_id uuid  -- Always require tenant context
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- Inherit RLS from caller (NOT SECURITY DEFINER)
STABLE            -- Read-only, cacheable
AS $$
DECLARE
  v_context_casino_id uuid;
  v_result jsonb;
BEGIN
  -- Step 3: Security validation (see below)
  -- Step 4: Aggregate with JOINs (see below)
  -- Step 5: Return structured JSONB (see below)
END;
$$;
```

### Step 3: Security - SECURITY INVOKER + Defense-in-Depth

```sql
-- Always validate RLS context exists
v_context_casino_id := COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
);

IF v_context_casino_id IS NULL THEN
  RAISE EXCEPTION 'UNAUTHORIZED: RLS context not set (app.casino_id required)';
END IF;

IF p_casino_id != v_context_casino_id THEN
  RAISE EXCEPTION 'CASINO_MISMATCH: Caller provided % but context is %',
    p_casino_id, v_context_casino_id;
END IF;
```

**Why SECURITY INVOKER:**

| Aspect | SECURITY INVOKER | SECURITY DEFINER |
|--------|------------------|------------------|
| **RLS Enforcement** | Automatic (inherits caller) | Manual validation required |
| **Boilerplate** | None | 15-20 lines per function |
| **Privilege Escalation Risk** | None | High if validation missing |
| **ADR-018 Compliance** | Preferred | Governance overhead |

### Step 4: Aggregate with JOINs

```sql
-- Efficient: Single query with JOINs
SELECT
  main.*,
  related1.*,
  COALESCE(
    jsonb_agg(children ORDER BY children.created_at)
    FILTER (WHERE children.id IS NOT NULL),
    '[]'::jsonb
  ) AS children
FROM main_table main
JOIN related1 ON related1.id = main.related1_id
LEFT JOIN children ON children.parent_id = main.id
WHERE main.id = p_id
  AND main.casino_id = p_casino_id  -- RLS enforced
GROUP BY main.id, related1.id;
```

### Step 5: Return Structured JSONB

```sql
RETURN jsonb_build_object(
  'primarySection', jsonb_build_object(
    'id', v_main.id,
    'name', v_main.name,
    -- ... map all fields
  ),
  'relatedSection', jsonb_build_object(...),
  'childArray', v_children
);
```

### Step 6: TypeScript Wrapper with Type Guard

```typescript
interface RpcResponse {
  primarySection: { id: string; name: string; /* ... */ };
  relatedSection: { /* ... */ } | null;
  childArray: Array<{ /* ... */ }>;
}

function isValidRpcResponse(data: unknown): data is RpcResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  // Validate required sections
  if (!obj.primarySection || typeof obj.primarySection !== 'object') return false;
  if (!Array.isArray(obj.childArray)) return false;

  return true;
}

export async function getDataViaRPC(
  supabase: SupabaseClient<Database>,
  id: string,
  casinoId: string
): Promise<FeatureDTO> {
  const { data, error } = await supabase.rpc('rpc_get_feature_data', {
    p_id: id,
    p_casino_id: casinoId,
  });

  if (error) {
    // Map PostgreSQL exceptions to DomainError
    if (error.message.includes('UNAUTHORIZED')) {
      throw new DomainError('UNAUTHORIZED', 'RLS context not set', { httpStatus: 401 });
    }
    if (error.message.includes('CASINO_MISMATCH')) {
      throw new DomainError('FORBIDDEN', 'Access denied', { httpStatus: 403 });
    }
    if (error.message.includes('NOT_FOUND')) {
      throw new DomainError('NOT_FOUND', 'Resource not found', { httpStatus: 404 });
    }
    throw new DomainError('INTERNAL_ERROR', `RPC failed: ${error.message}`, { httpStatus: 500 });
  }

  if (!isValidRpcResponse(data)) {
    throw new DomainError('INTERNAL_ERROR', 'Invalid RPC response structure', { httpStatus: 500 });
  }

  return mapToDTO(data);
}
```

### Step 7: Feature Flag for Parallel Rollout

```typescript
const USE_BFF_RPC = process.env.NEXT_PUBLIC_USE_<FEATURE>_BFF_RPC === 'true';

export async function GET(request: NextRequest, { params }: RouteParams) {
  // ... middleware setup ...

  const startTime = performance.now();
  let queryPath = 'legacy';
  let result: FeatureDTO;

  if (USE_BFF_RPC) {
    queryPath = 'rpc';
    result = await getDataViaRPC(supabase, params.id, casinoId);
  } else {
    // Legacy multi-query path
    result = await getDataViaMultiQuery(supabase, params.id, casinoId);
  }

  const duration = performance.now() - startTime;

  return successResponse(ctx, result, {
    headers: {
      'X-Query-Path': queryPath,
      'X-Query-Duration-Ms': String(Math.round(duration)),
    },
  });
}
```

---

## Success Metrics

| Metric | Before (Multi-Query) | After (BFF RPC) | Target |
|--------|---------------------|-----------------|--------|
| p50 Latency | ~500ms | ~100ms | < 100ms |
| p95 Latency | ~700ms | ~150ms | < 200ms |
| DB Queries | 6+ | 1 | 1 |
| Network RTTs | 3+ phases | 1 | 1 |
| Connection Usage | Multiple | Single | Single |

---

## Validation Checklist

Before merging a BFF RPC implementation:

- [ ] `SECURITY INVOKER` used (not `SECURITY DEFINER`)
- [ ] Explicit `casino_id` validation (defense-in-depth)
- [ ] Type guard validates RPC response structure
- [ ] PostgreSQL exceptions mapped to `DomainError`
- [ ] Feature flag enables instant rollback
- [ ] Performance headers track query path (`X-Query-Path`)
- [ ] 80%+ test coverage (unit, security, contract)
- [ ] Migration follows naming standard
- [ ] GRANT EXECUTE to `authenticated` role

---

## Reference Implementation

**PRD-018: Rating Slip Modal BFF RPC**

| File | Purpose |
|------|---------|
| `supabase/migrations/20251226123939_prd018_modal_bff_rpc.sql` | RPC function |
| `services/rating-slip-modal/rpc.ts` | TypeScript wrapper |
| `app/api/v1/rating-slips/[id]/modal-data/route.ts` | Route handler |
| `services/rating-slip-modal/__tests__/rpc*.ts` | Test suite (80 tests) |

**Performance Results:**

```
Legacy Path:  755ms (6+ queries, 3 phases)
BFF RPC:      237ms (1 query)
Improvement:  69% faster
```

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| `SECURITY DEFINER` for reads | Privilege escalation risk, governance overhead | Use `SECURITY INVOKER` |
| Skipping type guard | Runtime type mismatches | Always validate JSONB |
| No feature flag | Can't rollback quickly | Always use env var toggle |
| Premature optimization | Adds complexity for low-frequency endpoints | Only for > 100 calls/day |
| Sub-selects instead of JOINs | Slower query plans | Use explicit JOINs |

---

## Related Documentation

- [ADR-015: RLS Connection Pooling Strategy](../../80-adrs/ADR-015-rls-connection-pooling-strategy.md) - Pattern C hybrid context
- [ADR-018: SECURITY DEFINER Function Governance](../../80-adrs/ADR-018-security-definer-governance.md) - Why SECURITY INVOKER preferred
- [ADR-020: RLS Track A Hybrid Strategy](../../80-adrs/ADR-020-rls-track-a-mvp-strategy.md) - JWT fallback
- [BFF-RPC-DESIGN.md](../../20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md) - Original design spec
- [PRD-018-PERF-VALIDATION-REPORT.md](../../50-ops/performance/PRD-018-PERF-VALIDATION-REPORT.md) - Validation results

---

## Proactive Application

This pattern should be proactively suggested when:

1. **New endpoint design** aggregates data from 3+ bounded contexts
2. **Performance profiling** shows endpoint latency > 300ms
3. **User feedback** reports slow UI interactions
4. **Load testing** identifies database query bottlenecks

Query arch-memory with: `/arch-memory patterns` to surface candidates.

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-26
**Author:** Lead Architect
**Status:** Validated

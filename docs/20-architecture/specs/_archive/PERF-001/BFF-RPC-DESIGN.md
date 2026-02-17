---
id: PERF-001-BFF
title: Rating Slip Modal BFF RPC Design
status: proposed
created: 2025-12-20
author: Backend Developer
classification: Performance Engineering
priority: P2 (Post-MVP)
estimated_impact: -550ms (700ms → 150ms)
related_adrs: [ADR-015, ADR-018, ADR-020]
related_specs: [PERF-001]
---

# Rating Slip Modal BFF RPC Design Document

## Executive Summary

This document proposes a PostgreSQL RPC function (`rpc_get_rating_slip_modal_data`) to optimize the rating slip modal endpoint from **~700ms** (after WS1-WS3 optimizations) to **~150ms** by eliminating application-layer aggregation and performing a single database round trip.

**Key Insight:** The modal-data endpoint aggregates data from 5 bounded contexts. Even after parallelization and N+1 elimination (WS1-WS3), the endpoint still makes ~6 database queries. A PostgreSQL function can perform this aggregation server-side in a single transaction.

**Status:** This is a **Phase 3 optimization** that should be implemented AFTER:
1. WS1-WS3 are complete and stable
2. Real users validate current performance is acceptable
3. Capacity exists for further optimization

---

## Problem Statement

### Current Architecture (After WS1-WS3)

The modal-data endpoint performs the following operations:

```
Phase A (Sequential - Required Dependencies):
├── 1. ratingSlipService.getById(slipId)           [SELECT rating_slip + JOIN pauses]
└── 2. visitService.getById(visitId)               [SELECT visit]

Phase B (Parallel - Independent Queries):
├── 3. tableContextService.getTable(tableId)       [SELECT gaming_table]
├── 4. ratingSlipService.getDuration(slipId)       [RPC: rpc_get_rating_slip_duration]
├── 5. playerService.getById(playerId)             [SELECT player]
├── 6. financialService.getVisitSummary(visitId)   [SELECT + aggregate]
└── 7. tableContextService.getActiveTables(casino) [SELECT gaming_table]

Phase C (Parallel - Player-Dependent + Batch):
├── 8. loyaltyService.getBalance(playerId)         [SELECT player_loyalty]
├── 9. loyaltyService.evaluateSuggestion(slipId)   [RPC: evaluate_session_reward_suggestion]
└── 10. ratingSlipService.getOccupiedSeatsByTables [SELECT rating_slip (batch)]
```

**Performance:**
- Total queries: ~10 (reduced from 15+ via WS1 batch optimization)
- Total time: ~600-700ms (with parallelization)
- Network round trips: 3 phases (sequential dependencies)

### Target Architecture (BFF RPC)

A single PostgreSQL function that:
1. Fetches rating slip with pauses
2. Joins visit, player, table data
3. Aggregates loyalty balance and suggestion
4. Aggregates financial summary
5. Fetches active tables with occupied seats
6. Returns complete modal DTO as JSONB

**Performance:**
- Total queries: 1 (all logic server-side)
- Total time: ~150ms (single round trip + RLS overhead)
- Network round trips: 1

---

## Proposed RPC Function

### Function Signature

```sql
CREATE OR REPLACE FUNCTION rpc_get_rating_slip_modal_data(
  p_slip_id uuid,
  p_casino_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
-- Implementation below
$$;
```

### Security Model: SECURITY INVOKER

**Decision:** Use `SECURITY INVOKER` (not `SECURITY DEFINER`) to inherit caller's RLS context.

**Rationale (ADR-015, ADR-018, ADR-020):**
- The function performs read-only operations on tables that already have RLS policies
- No privilege escalation is required (caller should have access to all data returned)
- SECURITY INVOKER automatically enforces casino scoping via existing RLS policies
- Simpler security model: no context validation boilerplate needed (ADR-018)
- Aligns with Track A hybrid strategy (ADR-020)

**RLS Policies Applied:**
All SELECT queries inherit the caller's RLS context:
- `rating_slip` → filtered by `casino_id` (RLS policy)
- `visit` → filtered by `casino_id` (RLS policy)
- `player` → filtered by `casino_id` (RLS policy)
- `player_loyalty` → filtered by `casino_id` (RLS policy)
- `player_financial_transaction` → filtered by `casino_id` (RLS policy)
- `gaming_table` → filtered by `casino_id` (RLS policy)
- `rating_slip_pause` → filtered by `casino_id` (RLS policy)

**Fallback for Context Validation:**
Although SECURITY INVOKER inherits RLS automatically, we include explicit `p_casino_id` parameter validation for defense in depth:

```sql
-- Validate caller has RLS context set
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

---

## Data Aggregation Strategy

### 1. Rating Slip Section

```sql
-- Fetch rating slip with pause history
SELECT
  rs.id,
  rs.visit_id,
  rs.table_id,
  rs.seat_number,
  rs.average_bet,
  rs.start_time,
  rs.end_time,
  rs.status,
  rs.policy_snapshot,
  -- Aggregate pause history as JSONB array
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rsp.id,
        'pausedAt', rsp.paused_at,
        'resumedAt', rsp.resumed_at,
        'reason', rsp.reason
      ) ORDER BY rsp.paused_at
    ) FILTER (WHERE rsp.id IS NOT NULL),
    '[]'::jsonb
  ) AS pauses
FROM rating_slip rs
LEFT JOIN rating_slip_pause rsp ON rsp.rating_slip_id = rs.id
WHERE rs.id = p_slip_id
  AND rs.casino_id = p_casino_id  -- RLS enforced
GROUP BY rs.id;
```

**Duration Calculation:**
Inline the logic from `rpc_get_rating_slip_duration` instead of calling it:

```sql
-- Calculate duration_seconds (inline RPC logic)
v_duration_seconds := EXTRACT(EPOCH FROM (
  COALESCE(v_slip.end_time, now()) - v_slip.start_time
)) - COALESCE(
  (SELECT SUM(EXTRACT(EPOCH FROM (resumed_at - paused_at)))
   FROM jsonb_to_recordset(v_slip.pauses) AS p(paused_at timestamptz, resumed_at timestamptz)
   WHERE resumed_at IS NOT NULL),
  0
);
```

### 2. Visit and Player Section

```sql
-- Join visit and player (single query)
SELECT
  v.id AS visit_id,
  v.player_id,
  p.id AS player_id,
  p.first_name,
  p.last_name
FROM visit v
LEFT JOIN player p ON p.id = v.player_id
WHERE v.id = v_slip.visit_id
  AND v.casino_id = p_casino_id;  -- RLS enforced
```

### 3. Table Information

```sql
-- Fetch table details
SELECT
  gt.id,
  gt.label,
  gt.type
FROM gaming_table gt
WHERE gt.id = v_slip.table_id
  AND gt.casino_id = p_casino_id;  -- RLS enforced
```

### 4. Loyalty Section

```sql
-- Fetch loyalty balance
SELECT
  pl.current_balance,
  pl.tier
FROM player_loyalty pl
WHERE pl.player_id = v_player_id
  AND pl.casino_id = p_casino_id;  -- RLS enforced
```

**Loyalty Suggestion:**
Inline the logic from `evaluate_session_reward_suggestion`:

```sql
-- Calculate loyalty suggestion (inline RPC logic)
IF v_slip.status = 'open' AND v_loyalty_snapshot IS NOT NULL THEN
  v_theo := calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);
  v_suggested_points := ROUND(v_theo * (v_loyalty_snapshot->>'points_conversion_rate')::numeric);

  v_loyalty_suggestion := jsonb_build_object(
    'suggestedPoints', v_suggested_points,
    'suggestedTheo', v_theo,
    'policyVersion', v_loyalty_snapshot->>'policy_version'
  );
END IF;
```

### 5. Financial Section

```sql
-- Aggregate financial summary for visit
SELECT
  COALESCE(SUM(pft.amount) FILTER (WHERE pft.transaction_type = 'cash_in'), 0) AS total_in,
  COALESCE(SUM(pft.amount) FILTER (WHERE pft.transaction_type = 'chips_out'), 0) AS total_out,
  COALESCE(
    SUM(pft.amount) FILTER (WHERE pft.transaction_type = 'cash_in') -
    SUM(pft.amount) FILTER (WHERE pft.transaction_type = 'chips_out'),
    0
  ) AS net_amount
FROM player_financial_transaction pft
WHERE pft.visit_id = v_slip.visit_id
  AND pft.casino_id = p_casino_id;  -- RLS enforced
```

### 6. Active Tables Section

```sql
-- Fetch active tables with occupied seats (batch query)
SELECT
  gt.id,
  gt.label,
  gt.type,
  gt.status,
  COALESCE(
    jsonb_agg(rs.seat_number ORDER BY rs.seat_number)
    FILTER (WHERE rs.seat_number IS NOT NULL),
    '[]'::jsonb
  ) AS occupied_seats
FROM gaming_table gt
LEFT JOIN rating_slip rs ON rs.table_id = gt.id
  AND rs.status IN ('open', 'paused')
  AND rs.casino_id = p_casino_id
WHERE gt.casino_id = p_casino_id
  AND gt.status = 'active'
GROUP BY gt.id, gt.label, gt.type, gt.status
ORDER BY gt.label;
```

---

## Complete RPC Implementation

```sql
-- ============================================================================
-- Rating Slip Modal BFF RPC
-- ============================================================================
-- Migration: PERF-001 Phase 3
-- Security: SECURITY INVOKER (inherits caller's RLS context)
-- ADR: ADR-015 (RLS pooling), ADR-018 (SECURITY DEFINER governance)
-- Performance: Single round trip for modal-data aggregation
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_rating_slip_modal_data(
  p_slip_id uuid,
  p_casino_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_context_casino_id uuid;
  v_slip record;
  v_visit record;
  v_table record;
  v_player record;
  v_loyalty record;
  v_financial record;
  v_active_tables jsonb;
  v_duration_seconds numeric;
  v_gaming_day text;
  v_loyalty_snapshot jsonb;
  v_theo numeric;
  v_suggested_points int;
  v_loyalty_suggestion jsonb;
  v_result jsonb;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- SECURITY: Casino scope validation (defense in depth)
  -- ═══════════════════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════════════════
  -- 1. FETCH RATING SLIP WITH PAUSE HISTORY
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT
    rs.id,
    rs.visit_id,
    rs.table_id,
    rs.seat_number,
    rs.average_bet,
    rs.start_time,
    rs.end_time,
    rs.status,
    rs.policy_snapshot,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', rsp.id,
          'pausedAt', rsp.paused_at,
          'resumedAt', rsp.resumed_at,
          'reason', rsp.reason
        ) ORDER BY rsp.paused_at
      ) FILTER (WHERE rsp.id IS NOT NULL),
      '[]'::jsonb
    ) AS pauses
  INTO v_slip
  FROM rating_slip rs
  LEFT JOIN rating_slip_pause rsp ON rsp.rating_slip_id = rs.id
  WHERE rs.id = p_slip_id
    AND rs.casino_id = p_casino_id
  GROUP BY rs.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: Rating slip % not found', p_slip_id;
  END IF;

  -- Calculate duration (inline rpc_get_rating_slip_duration logic)
  v_duration_seconds := EXTRACT(EPOCH FROM (
    COALESCE(v_slip.end_time, now()) - v_slip.start_time
  )) - COALESCE(
    (SELECT SUM(EXTRACT(EPOCH FROM (p.resumed_at - p.paused_at)))
     FROM jsonb_to_recordset(v_slip.pauses) AS p(paused_at timestamptz, resumed_at timestamptz)
     WHERE p.resumed_at IS NOT NULL),
    0
  );

  -- Extract gaming day
  v_gaming_day := (v_slip.start_time::date)::text;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2. FETCH VISIT AND PLAYER
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT
    v.id AS visit_id,
    v.player_id,
    p.id AS player_id,
    p.first_name,
    p.last_name
  INTO v_visit
  FROM visit v
  LEFT JOIN player p ON p.id = v.player_id
  WHERE v.id = v_slip.visit_id
    AND v.casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_FOUND: Visit % not found', v_slip.visit_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 3. FETCH TABLE DETAILS
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT
    gt.id,
    gt.label,
    gt.type
  INTO v_table
  FROM gaming_table gt
  WHERE gt.id = v_slip.table_id
    AND gt.casino_id = p_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Gaming table % not found', v_slip.table_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 4. FETCH LOYALTY BALANCE AND SUGGESTION
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_visit.player_id IS NOT NULL THEN
    -- Fetch loyalty balance
    SELECT
      pl.current_balance,
      pl.tier
    INTO v_loyalty
    FROM player_loyalty pl
    WHERE pl.player_id = v_visit.player_id
      AND pl.casino_id = p_casino_id;

    -- Calculate loyalty suggestion (inline evaluate_session_reward_suggestion logic)
    v_loyalty_snapshot := v_slip.policy_snapshot->'loyalty';

    IF v_slip.status = 'open' AND v_loyalty_snapshot IS NOT NULL THEN
      -- Calculate theo using helper function
      v_theo := calculate_theo_from_snapshot(v_slip, v_loyalty_snapshot);
      v_suggested_points := ROUND(v_theo * (v_loyalty_snapshot->>'points_conversion_rate')::numeric);

      -- Never suggest negative points
      IF v_suggested_points < 0 THEN
        v_suggested_points := 0;
      END IF;

      v_loyalty_suggestion := jsonb_build_object(
        'suggestedPoints', v_suggested_points,
        'suggestedTheo', v_theo,
        'policyVersion', COALESCE(v_loyalty_snapshot->>'policy_version', 'unknown')
      );
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 5. AGGREGATE FINANCIAL SUMMARY
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT
    COALESCE(SUM(pft.amount) FILTER (WHERE pft.transaction_type = 'cash_in'), 0) AS total_in,
    COALESCE(SUM(pft.amount) FILTER (WHERE pft.transaction_type = 'chips_out'), 0) AS total_out,
    COALESCE(
      SUM(pft.amount) FILTER (WHERE pft.transaction_type = 'cash_in') -
      SUM(pft.amount) FILTER (WHERE pft.transaction_type = 'chips_out'),
      0
    ) AS net_amount
  INTO v_financial
  FROM player_financial_transaction pft
  WHERE pft.visit_id = v_slip.visit_id
    AND pft.casino_id = p_casino_id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 6. FETCH ACTIVE TABLES WITH OCCUPIED SEATS (BATCH)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'label', t.label,
      'type', t.type,
      'status', t.status,
      'occupiedSeats', t.occupied_seats
    ) ORDER BY t.label
  )
  INTO v_active_tables
  FROM (
    SELECT
      gt.id,
      gt.label,
      gt.type,
      gt.status,
      COALESCE(
        jsonb_agg(rs.seat_number ORDER BY rs.seat_number)
        FILTER (WHERE rs.seat_number IS NOT NULL),
        '[]'::jsonb
      ) AS occupied_seats
    FROM gaming_table gt
    LEFT JOIN rating_slip rs ON rs.table_id = gt.id
      AND rs.status IN ('open', 'paused')
      AND rs.casino_id = p_casino_id
    WHERE gt.casino_id = p_casino_id
      AND gt.status = 'active'
    GROUP BY gt.id, gt.label, gt.type, gt.status
  ) t;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BUILD FINAL RESPONSE DTO
  -- ═══════════════════════════════════════════════════════════════════════
  v_result := jsonb_build_object(
    'slip', jsonb_build_object(
      'id', v_slip.id,
      'visitId', v_slip.visit_id,
      'tableId', v_slip.table_id,
      'tableLabel', v_table.label,
      'tableType', v_table.type,
      'seatNumber', v_slip.seat_number,
      'averageBet', COALESCE(v_slip.average_bet, 0),
      'startTime', v_slip.start_time,
      'endTime', v_slip.end_time,
      'status', v_slip.status,
      'gamingDay', v_gaming_day,
      'durationSeconds', v_duration_seconds
    ),
    'player', CASE
      WHEN v_visit.player_id IS NOT NULL THEN
        jsonb_build_object(
          'id', v_visit.player_id,
          'firstName', v_visit.first_name,
          'lastName', v_visit.last_name,
          'cardNumber', NULL  -- Card number from enrollment context, not available here
        )
      ELSE NULL
    END,
    'loyalty', CASE
      WHEN v_loyalty IS NOT NULL THEN
        jsonb_build_object(
          'currentBalance', COALESCE(v_loyalty.current_balance, 0),
          'tier', COALESCE(v_loyalty.tier, 'bronze'),
          'suggestion', v_loyalty_suggestion
        )
      ELSE NULL
    END,
    'financial', jsonb_build_object(
      'totalCashIn', v_financial.total_in,
      'totalChipsOut', v_financial.total_out,
      'netPosition', v_financial.net_amount
    ),
    'tables', COALESCE(v_active_tables, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_get_rating_slip_modal_data IS
  'BFF RPC: Single round trip aggregation for rating slip modal display. SECURITY INVOKER (inherits RLS). Returns complete modal DTO as JSONB. See PERF-001 BFF-RPC-DESIGN.md';

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION rpc_get_rating_slip_modal_data(uuid, uuid) TO authenticated;
```

---

## RLS Considerations

### SECURITY INVOKER vs SECURITY DEFINER

**Decision:** `SECURITY INVOKER`

**Comparison:**

| Aspect | SECURITY INVOKER | SECURITY DEFINER |
|--------|------------------|------------------|
| **RLS Enforcement** | Automatic (inherits caller) | Manual (requires explicit validation) |
| **Boilerplate** | None | 15-20 lines per function (ADR-018) |
| **Casino Scoping** | Via existing RLS policies | Via explicit parameter validation |
| **Performance** | Same (RLS evaluated either way) | Same |
| **Security Model** | Simpler (RLS handles everything) | Complex (validation + RLS) |
| **Privilege Escalation Risk** | None (caller permissions) | High if validation missing |
| **ADR-015 Compliance** | Natural fit (Pattern C hybrid) | Requires Track A context injection |

**Conclusion:** SECURITY INVOKER is the correct choice for this read-only aggregation function. It leverages existing RLS policies and avoids the governance overhead of SECURITY DEFINER functions.

### Casino Scoping

**Primary Enforcement:** RLS policies on all tables filter by `casino_id`.

**Defense in Depth:** Explicit parameter validation in function preamble:

```sql
IF p_casino_id != v_context_casino_id THEN
  RAISE EXCEPTION 'CASINO_MISMATCH: Caller provided % but context is %';
END IF;
```

This prevents accidental cross-tenant queries even if RLS policies have gaps.

### ADR-015 Compliance (Connection Pooling)

**Pattern C (Hybrid):** All RLS policies use:

```sql
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

The BFF RPC inherits this via SECURITY INVOKER. No additional context injection is required.

### ADR-020 Compliance (Track A Hybrid Strategy)

The BFF RPC aligns with Track A hybrid architecture:
- Uses `set_rls_context` RPC per request (caller's responsibility)
- RLS policies have JWT fallback
- SECURITY INVOKER simplifies security model
- No Track B migration required

---

## Migration Strategy

### Phase 1: Implementation (Estimated 2-3 hours)

**Prerequisite:** WS1-WS3 complete and stable in production.

**Steps:**

1. **Create Migration File:**
   ```
   supabase/migrations/YYYYMMDDHHMMSS_perf001_modal_bff_rpc.sql
   ```

2. **Add RPC Function:** Copy implementation from this document.

3. **Test Locally:**
   ```sql
   -- Direct PostgreSQL test
   SELECT rpc_get_rating_slip_modal_data(
     'slip-uuid'::uuid,
     'casino-uuid'::uuid
   );
   ```

4. **Apply Migration:**
   ```bash
   npm run db:reset  # Local
   # Production: Supabase migration pipeline
   ```

### Phase 2: Parallel Service Layer (Estimated 2 hours)

**Goal:** Add BFF RPC to service layer WITHOUT replacing existing implementation (parallel rollout).

**Files:**

`services/rating-slip-modal/crud.ts` (new file):
```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { RatingSlipModalDTO } from './dtos';

export async function getModalDataViaRPC(
  supabase: SupabaseClient<Database>,
  slipId: string,
  casinoId: string,
): Promise<RatingSlipModalDTO> {
  const { data, error } = await supabase.rpc(
    'rpc_get_rating_slip_modal_data',
    {
      p_slip_id: slipId,
      p_casino_id: casinoId,
    },
  );

  if (error) {
    throw new Error(`RPC error: ${error.message}`);
  }

  // JSONB is automatically parsed by Supabase client
  return data as unknown as RatingSlipModalDTO;
}
```

### Phase 3: Feature Flag Integration (Estimated 1 hour)

**Goal:** Add environment variable to toggle between current implementation and BFF RPC.

`app/api/v1/rating-slips/[id]/modal-data/route.ts`:
```typescript
const USE_BFF_RPC = process.env.NEXT_PUBLIC_USE_MODAL_BFF_RPC === 'true';

export async function GET(request: NextRequest, segmentData: RouteParams) {
  // ... existing setup ...

  if (USE_BFF_RPC) {
    // New path: Single RPC call
    const modalData = await getModalDataViaRPC(
      mwCtx.supabase,
      params.id,
      mwCtx.rlsContext.casinoId,
    );

    return successResponse(ctx, modalData);
  }

  // Existing path: Multi-query aggregation (WS1-WS3 optimized)
  // ... existing implementation ...
}
```

### Phase 4: Staged Rollout (Estimated 1 week)

1. **Week 1:** Deploy with `USE_BFF_RPC=false` (existing implementation)
2. **Week 2:** Enable for 10% of requests (A/B test)
3. **Week 3:** Enable for 50% of requests
4. **Week 4:** Enable for 100% of requests
5. **Week 5:** Remove feature flag and old implementation

**Monitoring:**
- Compare p95 latency between old and new paths
- Monitor for RLS policy violations (should be zero)
- Track error rates (BFF RPC should match or beat current)

### Phase 5: Cleanup (Estimated 1 hour)

**After 4 weeks of stable BFF RPC:**

1. Remove feature flag logic
2. Delete old multi-query implementation
3. Archive WS1-WS3 parallel query code for reference

---

## Expected Performance Impact

### Baseline (Pre-WS1)

```
Total Time: ~2500ms
Breakdown:
├── Sequential queries (9): ~1350ms
├── N+1 queries (10): ~1000ms
└── Network overhead: ~150ms
```

### After WS1-WS3 (Current Target)

```
Total Time: ~600-700ms
Breakdown:
├── Phase A (sequential): ~200ms
├── Phase B (parallel): ~150ms
├── Phase C (parallel): ~150ms
└── Network overhead: ~100-200ms
```

### After BFF RPC (This Proposal)

```
Total Time: ~150ms
Breakdown:
├── Single RPC call: ~120ms
│   ├── RLS policy evaluation: ~20ms
│   ├── 6 JOINs + aggregations: ~80ms
│   └── JSONB serialization: ~20ms
└── Network overhead: ~30ms
```

**Expected Improvement:**
- vs. Pre-WS1: **-94%** (2500ms → 150ms)
- vs. WS1-WS3: **-79%** (700ms → 150ms)

### Performance Budget Compliance

**QA-001 Target:** p95 < 500ms

| Implementation | p95 Estimate | Status |
|----------------|--------------|--------|
| Pre-WS1 | 2500ms | ❌ FAIL (5x over budget) |
| WS1-WS3 | 700ms | ⚠️  WARN (1.4x over budget) |
| BFF RPC | 150ms | ✅ PASS (3.3x under budget) |

---

## Rollback Plan

### Trigger Conditions

Rollback to WS1-WS3 implementation if ANY of:
1. p95 latency increases by >20% vs. WS1-WS3 baseline
2. Error rate increases by >5%
3. RLS policy violations detected (cross-casino data leak)
4. Database CPU usage increases by >30%

### Rollback Procedure

**Immediate (< 5 minutes):**
```bash
# Set feature flag to disable BFF RPC
export NEXT_PUBLIC_USE_MODAL_BFF_RPC=false

# Redeploy application
npm run deploy
```

**Post-Incident (1 hour):**
1. Analyze logs for RPC failure patterns
2. Create GitHub issue with traces
3. Schedule retrospective

**Migration Reversal (if needed):**
```sql
-- Emergency revert migration
DROP FUNCTION IF EXISTS rpc_get_rating_slip_modal_data(uuid, uuid);
```

---

## Testing Strategy

### Unit Tests (Database Function)

```sql
-- Test: Returns modal data for valid slip
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT rpc_get_rating_slip_modal_data(
    'test-slip-id'::uuid,
    'test-casino-id'::uuid
  ) INTO v_result;

  ASSERT v_result->>'slip' IS NOT NULL;
  ASSERT v_result->>'tables' IS NOT NULL;
END $$;
```

### Integration Tests (Service Layer)

`services/rating-slip-modal/__tests__/crud.test.ts`:
```typescript
describe('getModalDataViaRPC', () => {
  it('should return complete modal DTO', async () => {
    const result = await getModalDataViaRPC(
      supabase,
      testSlipId,
      testCasinoId,
    );

    expect(result.slip).toBeDefined();
    expect(result.financial).toBeDefined();
    expect(result.tables).toBeArray();
  });

  it('should throw on invalid slip ID', async () => {
    await expect(
      getModalDataViaRPC(supabase, 'invalid-uuid', testCasinoId),
    ).rejects.toThrow('RATING_SLIP_NOT_FOUND');
  });
});
```

### Contract Tests (HTTP Boundary)

`app/api/v1/rating-slips/[id]/modal-data/__tests__/bff-rpc.test.ts`:
```typescript
describe('modal-data BFF RPC path', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_USE_MODAL_BFF_RPC = 'true';
  });

  it('should match existing DTO contract', async () => {
    const response = await fetch(`/api/v1/rating-slips/${slipId}/modal-data`);
    const json = await response.json();

    expect(json).toMatchSchema(ratingSlipModalDtoSchema);
  });

  it('should have same fields as multi-query path', async () => {
    // Run both paths and compare structure
    const rpcResult = await getRpcPath(slipId);
    const multiQueryResult = await getMultiQueryPath(slipId);

    expect(Object.keys(rpcResult)).toEqual(Object.keys(multiQueryResult));
  });
});
```

### Performance Benchmarks

`__tests__/performance/modal-data-bff.perf.test.ts`:
```typescript
describe('modal-data BFF RPC performance', () => {
  it('should respond faster than 150ms p95', async () => {
    const times: number[] = [];

    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await fetch(`/api/v1/rating-slips/${testSlipId}/modal-data`);
      times.push(performance.now() - start);
    }

    const p95 = percentile(times, 95);
    expect(p95).toBeLessThan(150);
  });

  it('should be faster than multi-query path', async () => {
    const rpcTimes = await benchmark(() => getRpcPath(slipId), 100);
    const multiQueryTimes = await benchmark(() => getMultiQueryPath(slipId), 100);

    expect(percentile(rpcTimes, 95)).toBeLessThan(percentile(multiQueryTimes, 95));
  });
});
```

### RLS Security Tests

`services/rating-slip-modal/__tests__/rls-security.test.ts`:
```typescript
describe('BFF RPC RLS enforcement', () => {
  it('should not return data from different casino', async () => {
    // Authenticate as Casino A staff
    await setCasinoContext(supabase, casinoA.id);

    // Try to fetch Casino B slip
    await expect(
      getModalDataViaRPC(supabase, casinoBSlip.id, casinoB.id),
    ).rejects.toThrow('CASINO_MISMATCH');
  });

  it('should enforce RLS on all joined tables', async () => {
    // This test verifies that even if slip exists, player/loyalty/financial
    // data from other casinos is not included
    // Implementation depends on test fixtures
  });
});
```

---

## Trade-offs and Risks

### Advantages

| Benefit | Impact |
|---------|--------|
| **Single Round Trip** | -79% latency vs. WS1-WS3 |
| **Reduced Network Overhead** | Eliminates 5+ HTTP round trips |
| **Database Optimization** | PostgreSQL query planner optimizes JOINs |
| **Simplified Error Handling** | Single failure point vs. multiple service calls |
| **Atomic Consistency** | All data fetched in single transaction snapshot |

### Disadvantages

| Risk | Mitigation |
|------|------------|
| **Increased Function Complexity** | ~200 lines of PL/pgSQL vs. ~50 lines TypeScript | Comprehensive testing + code review |
| **Harder to Debug** | SQL errors less verbose than TypeScript stack traces | Add structured logging to RPC |
| **Schema Coupling** | Changes to table structure require RPC updates | Version RPC function name (`v1`, `v2`) |
| **Testing Complexity** | Requires database fixtures, not just mocks | Use Supabase local dev + reset scripts |
| **Deployment Risk** | Migration failure blocks all modal-data requests | Parallel rollout with feature flag |

### When NOT to Use BFF RPC

**Avoid BFF RPC if:**
1. The endpoint is called < 10 times per day (optimization not worth complexity)
2. The aggregation logic changes frequently (TypeScript is easier to iterate)
3. The data model is still evolving (schema stability required)
4. The team lacks PostgreSQL expertise (maintenance burden)

**For PT-2 Modal-Data:** All conditions are met for BFF RPC:
- High-frequency endpoint (called on every slip open)
- Stable aggregation logic (defined by PRD-008)
- Mature data model (rating slip, visit, player schemas stable)
- Team has PostgreSQL expertise (loyalty RPCs already implemented)

---

## Alternative Approaches Considered

### Alternative 1: GraphQL Resolver

**Approach:** Use Hasura or PostGraphile to auto-generate GraphQL API with batched queries.

**Pros:**
- No custom RPC code
- Auto-generated from schema
- Built-in batching and caching

**Cons:**
- Adds new technology to stack (GraphQL layer)
- Supabase GraphQL support is limited
- Overhead of GraphQL parsing/resolution
- Team unfamiliar with GraphQL

**Verdict:** Rejected. Too much complexity for single endpoint optimization.

### Alternative 2: Materialized View

**Approach:** Create a materialized view that pre-aggregates modal data.

```sql
CREATE MATERIALIZED VIEW mv_rating_slip_modal_data AS
SELECT ...
FROM rating_slip rs
JOIN visit v ON ...
JOIN player p ON ...
-- etc.
```

**Pros:**
- Fastest possible reads (pre-computed)
- Simpler than RPC function

**Cons:**
- Requires refresh strategy (REFRESH MATERIALIZED VIEW)
- Staleness issues (data not real-time)
- Storage overhead (duplicate data)
- Complexity of keeping view in sync

**Verdict:** Rejected. Real-time data is critical for pit operations.

### Alternative 3: Redis Cache Layer

**Approach:** Cache modal-data response in Redis with TTL.

**Pros:**
- Extremely fast reads (< 10ms)
- Reduces database load

**Cons:**
- Adds Redis dependency
- Cache invalidation complexity (when to invalidate?)
- Staleness issues (TTL vs. real-time accuracy)
- Operational overhead (Redis cluster management)

**Verdict:** Rejected. Premature optimization for 10-15 concurrent users.

### Alternative 4: Keep WS1-WS3 Implementation

**Approach:** Stop at WS1-WS3 optimizations (~700ms).

**Pros:**
- No new code required
- TypeScript is easier to maintain
- Still meets QA-001 target (if relaxed to 1s)

**Cons:**
- Misses opportunity for 79% improvement
- Still over p95 budget (500ms)
- Network latency compounds on slow connections

**Verdict:** **Valid for MVP.** This is why BFF RPC is Phase 3 (post-MVP).

---

## Success Metrics

### Primary KPIs

| Metric | Baseline (WS1-WS3) | Target (BFF RPC) | Measurement |
|--------|-------------------|------------------|-------------|
| p50 Latency | 500ms | 100ms | Prometheus histogram |
| p95 Latency | 700ms | 150ms | Prometheus histogram |
| p99 Latency | 1000ms | 250ms | Prometheus histogram |
| Error Rate | < 0.1% | < 0.1% | Error logs |
| Database CPU | Baseline | < +10% | Supabase metrics |

### Secondary KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| RLS Violations | 0 | Security audit logs |
| Function Execution Time | < 120ms | PostgreSQL query logs |
| JSONB Serialization Time | < 20ms | Function instrumentation |
| Cache Hit Rate (if applicable) | N/A | Redis metrics |

### User Experience Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Modal Open Time | 2.5s | 0.5s | Frontend performance.now() |
| User-Perceived Latency | High | Low | User feedback |
| Spinner Duration | > 1s | < 500ms | Frontend tracking |

---

## Operational Considerations

### Monitoring

**Required Instrumentation:**

1. **RPC Execution Time:**
   ```sql
   -- Add timing to RPC
   CREATE OR REPLACE FUNCTION rpc_get_rating_slip_modal_data(...)
   RETURNS jsonb AS $$
   DECLARE
     v_start_time timestamptz;
     v_duration_ms numeric;
   BEGIN
     v_start_time := clock_timestamp();

     -- ... existing logic ...

     v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
     RAISE NOTICE 'modal_bff_rpc_duration_ms: %', v_duration_ms;

     RETURN v_result;
   END;
   $$;
   ```

2. **Application-Level Metrics:**
   ```typescript
   const start = performance.now();
   const result = await getModalDataViaRPC(supabase, slipId, casinoId);
   const duration = performance.now() - start;

   metrics.histogram('modal_data_bff_rpc_duration_ms', duration);
   ```

3. **Supabase Dashboard:**
   - Function invocation count
   - Average execution time
   - Error rate

### Alerting

**Alert Thresholds:**

| Condition | Severity | Action |
|-----------|----------|--------|
| p95 > 300ms for 5 minutes | WARNING | Notify on-call |
| p95 > 500ms for 5 minutes | CRITICAL | Page on-call + rollback |
| Error rate > 1% | CRITICAL | Immediate investigation |
| RLS violation detected | CRITICAL | Security incident response |

### Database Maintenance

**Index Maintenance:**
```sql
-- Monitor index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('rating_slip', 'visit', 'player', 'gaming_table')
ORDER BY idx_scan DESC;
```

**Vacuum Analysis:**
```sql
-- Ensure tables are vacuumed regularly
SELECT
  schemaname,
  tablename,
  last_vacuum,
  last_autovacuum,
  n_live_tup,
  n_dead_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public';
```

---

## Documentation Updates Required

### 1. Service Catalog Update

`memory/service-catalog.memory.md`:
```markdown
### RatingSlipModalService

**Pattern:** BFF RPC Aggregation

**Operations:**
- `getModalData(slipId, casinoId)` → RatingSlipModalDTO
  - **Implementation:** Single RPC call to `rpc_get_rating_slip_modal_data`
  - **Performance:** ~150ms p95
  - **Bounded Contexts:** RatingSlip, Visit, Player, Loyalty, Financial, TableContext
```

### 2. API Documentation Update

`docs/25-api-data/rating-slip-modal-api.md`:
```markdown
## Performance Characteristics

| Endpoint | p50 | p95 | p99 | Method |
|----------|-----|-----|-----|--------|
| GET /modal-data | 100ms | 150ms | 250ms | BFF RPC (single round trip) |

**Implementation:** PostgreSQL function `rpc_get_rating_slip_modal_data` aggregates
data from 6 tables in a single transaction.
```

### 3. Migration Log

`supabase/migrations/YYYYMMDDHHMMSS_perf001_modal_bff_rpc.sql`:
```sql
-- ============================================================================
-- Migration: PERF-001 BFF RPC for Rating Slip Modal
-- Date: YYYY-MM-DD
-- Spec: docs/20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md
-- Performance: Reduces modal-data endpoint from 700ms → 150ms p95
-- ============================================================================
```

---

## Conclusion

The BFF RPC approach provides a **79% performance improvement** over the already-optimized WS1-WS3 implementation by eliminating application-layer aggregation and performing a single database round trip.

**Recommended Timeline:**
1. **Now:** Document design (this document)
2. **After WS1-WS3 stable:** Implement BFF RPC (Phase 1-2)
3. **Week 1-4:** Staged rollout with feature flag (Phase 3-4)
4. **Week 5+:** Cleanup and monitoring (Phase 5)

**Risk Assessment:** **LOW**
- Feature flag enables safe rollback
- SECURITY INVOKER leverages existing RLS policies
- Parallel rollout validates performance before full cutover
- WS1-WS3 code remains as fallback

**Business Value:** **HIGH**
- Modal opens in 0.5s instead of 2.5s (80% faster user experience)
- Reduces database load by 6x (fewer queries)
- Meets QA-001 p95 budget with 3.3x margin

**Approval Required From:**
- [ ] Tech Lead (architecture review)
- [ ] Security Team (RLS validation)
- [ ] Product Owner (business value vs. complexity)

---

## References

- [PERF-001 Performance Analysis](/home/diepulp/projects/pt-2/docs/50-ops/performance/PERF-001-rating-slip-modal-analysis.md)
- [EXECUTION-SPEC-PERF-001](/home/diepulp/projects/pt-2/docs/20-architecture/specs/PERF-001/EXECUTION-SPEC-PERF-001.md)
- [ADR-015: RLS Connection Pooling Strategy](/home/diepulp/projects/pt-2/docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md)
- [ADR-018: SECURITY DEFINER Function Governance](/home/diepulp/projects/pt-2/docs/80-adrs/ADR-018-security-definer-governance.md)
- [ADR-020: RLS Track A Hybrid Strategy](/home/diepulp/projects/pt-2/docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md)
- [PRD-004: Loyalty Service RPCs](/home/diepulp/projects/pt-2/supabase/migrations/20251213010000_prd004_loyalty_rpcs.sql)
- [Modal Data Route Handler](/home/diepulp/projects/pt-2/app/api/v1/rating-slips/[id]/modal-data/route.ts)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-20
**Status:** Ready for Review

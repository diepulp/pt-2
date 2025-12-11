# Rating Slip Modal Bounded Context Analysis (CORRECTED)

**Date**: 2025-12-10
**Author**: System Architect
**Status**: CANONICAL CORRECTION
**Context**: Correction of previous misanalysis that suggested schema changes to services outside their bounded context ownership

---

## Executive Summary

**CRITICAL FINDING**: The previous bounded context analysis incorrectly suggested adding `cash_in` and `chips_taken` fields to the `rating_slip` table, which would **violate ADR-006** and the Service Responsibility Matrix (SRM v4.0.0). This corrected analysis establishes the proper service ownership and integration architecture.

**Corrected Ownership Table**:

| Modal Field | Service Owner | Source Table(s) | Notes |
|-------------|---------------|-----------------|-------|
| `playerName` | PlayerService | `player.first_name`, `player.last_name` | Via `visit.player_id` FK |
| `averageBet` | **RatingSlipService** | `rating_slip.average_bet` | ✅ Telemetry - OWNS |
| `cashIn` | **PlayerFinancialService** | `player_financial_transaction` | ❌ NOT RatingSlip (ADR-006) |
| `startTime` | **RatingSlipService** | `rating_slip.start_time` | ✅ Telemetry - OWNS |
| `gameTableId` | **RatingSlipService** | `rating_slip.table_id` | ✅ Telemetry - OWNS |
| `seatNumber` | **RatingSlipService** | `rating_slip.seat_number` | ✅ Telemetry - OWNS |
| `points` | **LoyaltyService** | `player_loyalty.balance` | ❌ NOT RatingSlip (SRM stance) |
| `chipsTaken` | **PlayerFinancialService** | `player_financial_transaction` | ❌ NOT RatingSlip (ADR-006) |

---

## Bounded Context Ownership (SRM v4.0.0)

### 1. RatingSlipService - "What gameplay activity occurred?"

**Bounded Context**: Telemetry Context
**Owns**: `rating_slip`, `rating_slip_pause`
**SRM Reference**: Lines 197-258

#### Schema Invariants

```sql
rating_slip (
  id uuid PRIMARY KEY,
  casino_id uuid NOT NULL,        -- Casino scoping
  visit_id uuid NOT NULL,          -- Session anchor (immutable)
  table_id uuid NOT NULL,          -- Table location (immutable)
  seat_number text,                -- Seat position (mutable for correction)
  start_time timestamptz NOT NULL, -- Session start (immutable)
  end_time timestamptz,            -- Session end (NULL until closed)
  status text NOT NULL,            -- 'open', 'paused', 'closed'
  average_bet numeric,             -- Wager telemetry (mutable)
  game_settings jsonb,             -- Game configuration snapshot
  policy_snapshot jsonb            -- Reward policy at creation (immutable)
)
```

**Key Invariant (SRM:220)**: Player identity derived from `visit.player_id`. RatingSlip does NOT have its own `player_id` column (removed per ADR-006 extension).

#### Does NOT Store (SRM:240-242)

- ❌ Reward balances or points (Loyalty is sole source of truth)
- ❌ Financial transactions (`cash_in`, `chips_taken`) - belongs to PlayerFinancialService
- ❌ Player identity (derived from visit at query time)

---

### 2. LoyaltyService - "What is this gameplay worth in rewards?"

**Bounded Context**: Reward Context
**Owns**: `player_loyalty`, `loyalty_ledger`, `loyalty_outbox`
**SRM Reference**: Lines 261-295

#### Schema Invariants

```sql
player_loyalty (
  player_id uuid,
  casino_id uuid,
  balance numeric NOT NULL DEFAULT 0,  -- Current points
  tier text,
  preferences jsonb,
  PRIMARY KEY (player_id, casino_id)
)

loyalty_ledger (
  id uuid PRIMARY KEY,
  casino_id uuid NOT NULL,
  player_id uuid NOT NULL,
  rating_slip_id uuid,              -- Optional linkage for accrual
  points_earned numeric NOT NULL,
  reason text NOT NULL,             -- loyalty_reason enum
  idempotency_key text,             -- Unique partial index
  created_at timestamptz NOT NULL
)
```

**Canonical Stance (SRM:267)**: Loyalty is the sole source of truth for rewards. `rating_slip` stores telemetry only and never caches reward balances.

#### Cross-Context Consumption

- **Consumes**: `RatingSlipTelemetryDTO` from RatingSlipService (for mid-session reward calculation)
- **Consumes**: `VisitDTO` from VisitService (session context for ledger entries)
- **Provides**: `PlayerLoyaltyDTO` to UI/external APIs

---

### 3. PlayerFinancialService - "What monetary transactions occurred?"

**Bounded Context**: Finance Context
**Owns**: `player_financial_transaction`, `finance_outbox`
**SRM Reference**: Lines 365-390

#### Schema Invariants

```sql
player_financial_transaction (
  id uuid PRIMARY KEY,
  casino_id uuid NOT NULL,
  player_id uuid NOT NULL,
  visit_id uuid,                    -- Optional visit linkage
  rating_slip_id uuid,              -- Optional slip linkage
  amount numeric NOT NULL,          -- Transaction amount
  tender_type text,                 -- 'cash', 'chips', 'marker'
  gaming_day date,                  -- Trigger-derived
  idempotency_key text,             -- Unique partial index
  created_at timestamptz NOT NULL
)
```

**ADR-006 Decision**: Remove `cash_in`, `chips_brought`, `chips_taken` from `rating_slip`. Provide a plain, backward-compatible view.

#### Backward Compatibility Views (ADR-006)

```sql
-- Aggregate financial data per visit
CREATE OR REPLACE VIEW visit_financial_summary AS
SELECT
  visit_id,
  COALESCE(SUM(cash_in), 0)::numeric AS total_cash_in,
  COALESCE(SUM(chips_brought), 0)::numeric AS total_chips_brought,
  COALESCE(SUM(chips_taken), 0)::numeric AS total_chips_taken
FROM player_financial_transaction
GROUP BY visit_id;

-- Join rating slip with financial summary
CREATE OR REPLACE VIEW ratingslip_with_financials AS
SELECT r.*,
  vfs.total_cash_in AS cash_in,
  vfs.total_chips_brought AS chips_brought,
  vfs.total_chips_taken AS chips_taken
FROM rating_slip r
LEFT JOIN visit_financial_summary vfs ON vfs.visit_id = r.visit_id;
```

**Note**: As of 2025-12-10, these views may not be implemented yet. ADR-006 is accepted but implementation status unclear.

---

### 4. VisitService - "What is this patron doing at the casino right now?"

**Bounded Context**: Operational Session Context
**Owns**: `visit`
**SRM Reference**: Lines 156-194

#### Schema Invariants

```sql
visit (
  id uuid PRIMARY KEY,
  casino_id uuid NOT NULL,
  player_id uuid,                   -- NULL for ghost visits
  visit_kind text NOT NULL,         -- visit_kind enum
  started_at timestamptz NOT NULL,
  ended_at timestamptz              -- NULL = active visit
)
```

**Visit Archetypes (SRM:163-169)**:

| `visit_kind` | Player ID | Gaming | Loyalty | Use Case |
|--------------|-----------|--------|---------|----------|
| `reward_identified` | Required | No | Redemptions only | Comps, vouchers |
| `gaming_identified_rated` | Required | Yes | Accrual eligible | Standard rated play |
| `gaming_ghost_unrated` | NULL | Yes | Compliance only | Ghost gaming |

**Key Invariant**: Rating slips MUST have `visit.player_id` (no ghost gaming rating slips per SRM).

---

### 5. PlayerService - "Who is this player?"

**Bounded Context**: Identity Context
**Owns**: `player`, `player_casino`
**SRM Reference**: Lines 128-153

#### Schema Invariants

```sql
player (
  id uuid PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date,
  contact jsonb
)
```

**Cross-Context Consumption**: All services consume `PlayerDTO` for identity, but only PlayerService owns the player table.

---

## Critical Findings: Previous Analysis Errors

### ❌ Error 1: Suggested Adding `cash_in` to `rating_slip`

**Previous Recommendation**: "Add `cash_in` column to `rating_slip` table"
**Why Wrong**: Violates ADR-006 and SRM bounded context rules. Financial data belongs to PlayerFinancialService.

**Correct Approach**: Query `player_financial_transaction` table or use `visit_financial_summary` view (when implemented).

---

### ❌ Error 2: Suggested Adding `chips_taken` to `rating_slip`

**Previous Recommendation**: "Add `chips_taken` column to `rating_slip` table"
**Why Wrong**: Same violation as `cash_in`. This is financial ledger data, not gameplay telemetry.

**Correct Approach**: Query `player_financial_transaction` table for cash-out/chip transactions.

---

### ❌ Error 3: Marked Points Tracking as "Out of MVP Scope"

**Previous Recommendation**: "Points tracking is out of MVP scope"
**Why Wrong**: LoyaltyService exists and is implemented (MVP Phase 2). Points ARE in scope via the `player_loyalty.balance` field.

**Correct Approach**: Query `player_loyalty` table via LoyaltyService for current points balance.

---

### ❌ Error 4: Unclear on Player Movement Responsibility

**Previous Recommendation**: Unclear service ownership for player movement
**Why Wrong**: Player movement = creating a new rating slip at a different table. This is RatingSlipService responsibility.

**Correct Approach**: Close current slip, start new slip at new table/seat. No special "move" operation needed.

---

## Recommended Integration Architecture

### Option A: Multi-Service Aggregation (BFF Pattern)

**Pattern**: Create a Backend-for-Frontend (BFF) aggregation layer that coordinates multiple services.

```typescript
// app/api/v1/rating-slips/[id]/modal-data/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient(); // with RLS context

  // 1. Fetch rating slip (RatingSlipService)
  const slip = await ratingSlipService.getById(params.id);

  // 2. Fetch player name (PlayerService via visit)
  const visit = await visitService.getById(slip.visit_id);
  const player = await playerService.getById(visit.player_id);

  // 3. Fetch points (LoyaltyService)
  const loyalty = await loyaltyService.getPlayerLoyalty(
    visit.player_id,
    slip.casino_id
  );

  // 4. Fetch financial data (PlayerFinancialService)
  const financials = await financeService.getVisitFinancials(slip.visit_id);

  // 5. Assemble modal DTO
  return ServiceHttpResult.ok({
    id: slip.id,
    playerName: `${player.first_name} ${player.last_name}`,
    averageBet: slip.average_bet,
    cashIn: financials.total_cash_in,
    startTime: slip.start_time,
    gameTableId: slip.table_id,
    seatNumber: slip.seat_number,
    points: loyalty.balance,
    chipsTaken: financials.total_chips_taken,
  });
}
```

**Pros**:
- Clear service boundaries respected
- Each service owns its data
- Testable, traceable

**Cons**:
- Multiple database queries (mitigated by connection pooling)
- Potential for N+1 queries (mitigated by batching)

---

### Option B: View-Based Aggregation (Read-Optimized)

**Pattern**: Create a database view that joins across bounded contexts for read-only modal data.

```sql
-- View for rating slip modal data aggregation
CREATE OR REPLACE VIEW rating_slip_modal_view AS
SELECT
  rs.id,
  rs.casino_id,
  rs.visit_id,
  rs.table_id,
  rs.seat_number,
  rs.start_time,
  rs.end_time,
  rs.status,
  rs.average_bet,
  -- Player name from visit join
  p.first_name || ' ' || p.last_name AS player_name,
  -- Points from loyalty join
  pl.balance AS points,
  -- Financial aggregates from visit financial summary
  vfs.total_cash_in AS cash_in,
  vfs.total_chips_taken AS chips_taken
FROM rating_slip rs
INNER JOIN visit v ON v.id = rs.visit_id
INNER JOIN player p ON p.id = v.player_id
LEFT JOIN player_loyalty pl ON pl.player_id = v.player_id AND pl.casino_id = rs.casino_id
LEFT JOIN visit_financial_summary vfs ON vfs.visit_id = rs.visit_id;
```

**Pros**:
- Single query for modal data
- Better performance for read-heavy use case
- Database enforces join consistency

**Cons**:
- Couples bounded contexts at database level
- Must coordinate schema changes across services
- RLS policies more complex

**Verdict**: **Not recommended** for PT-2. Violates service isolation principles from SLAD.

---

### Option C: GraphQL Federated Schema (Future-Proof)

**Pattern**: Use GraphQL federation to declare cross-context relationships declaratively.

**Status**: Out of scope for MVP. Next.js doesn't have native GraphQL federation support.

---

## Recommended Approach: **Option A (Multi-Service BFF)**

### Rationale

1. **Bounded Context Integrity**: Each service owns its data, no cross-context pollution
2. **PT-2 Stack Alignment**: Next.js Route Handlers are the canonical transport per EDGE_TRANSPORT_POLICY.md
3. **Performance**: Connection pooling + caching via TanStack Query mitigates multi-query concerns
4. **Maintainability**: Clear data flow, testable, traceable via ServiceHttpResult envelope
5. **Future-Proof**: Can optimize with caching/batching without architectural changes

---

## Implementation Guidance

### 1. Create BFF Route Handler

**File**: `/home/diepulp/projects/pt-2/app/api/v1/rating-slips/[id]/modal-data/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import { createRatingSlipService } from '@/services/rating-slip';
import { createVisitService } from '@/services/visit';
import { createPlayerService } from '@/services/player';
import { createLoyaltyService } from '@/services/loyalty';
import { createFinanceService } from '@/services/finance';
import { ServiceHttpResult } from '@/lib/http/service-response';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  // Initialize services with RLS context
  const ratingSlipService = createRatingSlipService(supabase);
  const visitService = createVisitService(supabase);
  const playerService = createPlayerService(supabase);
  const loyaltyService = createLoyaltyService(supabase);
  const financeService = createFinanceService(supabase);

  try {
    // 1. Fetch rating slip
    const slip = await ratingSlipService.getById(params.id);

    // 2. Fetch visit and player
    const visit = await visitService.getById(slip.visit_id);
    if (!visit.player_id) {
      throw new DomainError('INVALID_STATE', 'Ghost visits cannot have rating slips');
    }

    const player = await playerService.getById(visit.player_id);

    // 3. Fetch loyalty points
    const loyalty = await loyaltyService.getPlayerLoyalty(
      visit.player_id,
      slip.casino_id
    );

    // 4. Fetch financial summary
    // NOTE: Requires PlayerFinancialService implementation
    const financials = await financeService.getVisitFinancials(slip.visit_id);

    // 5. Assemble DTO
    const modalData = {
      id: slip.id,
      playerName: `${player.first_name} ${player.last_name}`,
      averageBet: slip.average_bet || 0,
      cashIn: financials?.total_cash_in || 0,
      startTime: slip.start_time,
      gameTableId: slip.table_id,
      seatNumber: slip.seat_number || '',
      points: loyalty?.balance || 0,
      chipsTaken: financials?.total_chips_taken || 0,
    };

    return ServiceHttpResult.ok(modalData);
  } catch (error) {
    return ServiceHttpResult.fromError(error);
  }
}
```

---

### 2. Update Modal Component Interface

**File**: `/home/diepulp/projects/pt-2/components/modals/rating-slip/rating-slip-modal.tsx`

```typescript
// Updated DTO from BFF endpoint
export interface RatingSlipModalDto {
  id: string;
  playerName: string;           // From PlayerService
  averageBet: number;            // From RatingSlipService
  cashIn: number;                // From PlayerFinancialService
  startTime: string;             // From RatingSlipService
  gameTableId: string;           // From RatingSlipService
  seatNumber: string;            // From RatingSlipService
  points: number;                // From LoyaltyService
  chipsTaken: number;            // From PlayerFinancialService (session-end)
}
```

---

### 3. Player Movement Operation

**Player Movement = Close Current Slip + Start New Slip**

```typescript
// app/api/v1/rating-slips/[id]/move/route.ts
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const ratingSlipService = createRatingSlipService(supabase);

  const body = await request.json();
  const { newTableId, newSeatNumber } = body;

  try {
    // 1. Close current slip
    const closedSlip = await ratingSlipService.close(
      params.id,
      body.casinoId,
      body.actorId
    );

    // 2. Start new slip at new table/seat
    const newSlip = await ratingSlipService.start(
      supabase,
      body.casinoId,
      body.actorId,
      {
        visit_id: closedSlip.visit_id,  // Same visit
        table_id: newTableId,
        seat_number: newSeatNumber,
      }
    );

    return ServiceHttpResult.ok({
      oldSlipId: closedSlip.id,
      newSlipId: newSlip.id,
    });
  } catch (error) {
    return ServiceHttpResult.fromError(error);
  }
}
```

---

### 4. Financial Service Implementation Requirements

**Status**: PlayerFinancialService exists but may not have `getVisitFinancials` method yet.

**Required Method**:

```typescript
// services/finance/index.ts
export interface FinanceServiceInterface {
  /**
   * Get financial summary for a visit.
   * Aggregates all player_financial_transaction records for a visit.
   */
  getVisitFinancials(visitId: string): Promise<VisitFinancialSummaryDTO>;
}

export interface VisitFinancialSummaryDTO {
  visit_id: string;
  total_cash_in: number;
  total_chips_brought: number;
  total_chips_taken: number;
}
```

**Implementation** (if not exists):

```typescript
// services/finance/crud.ts
export async function getVisitFinancials(
  supabase: SupabaseClient<Database>,
  visitId: string
): Promise<VisitFinancialSummaryDTO> {
  const { data, error } = await supabase
    .from('player_financial_transaction')
    .select('amount, tender_type')
    .eq('visit_id', visitId);

  if (error) throw mapDatabaseError(error);

  // Aggregate by tender_type
  const summary = {
    visit_id: visitId,
    total_cash_in: 0,
    total_chips_brought: 0,
    total_chips_taken: 0,
  };

  data?.forEach((txn) => {
    // TODO: Define tender_type enum and aggregation logic
    // This is placeholder - actual logic depends on schema
    if (txn.tender_type === 'cash_in') {
      summary.total_cash_in += txn.amount;
    }
    // ... etc
  });

  return summary;
}
```

**NOTE**: The `tender_type` enum and aggregation logic must be defined based on actual PlayerFinancialService schema.

---

## Action Items

### Immediate (Pre-Integration)

- [ ] Review ADR-006 implementation status
- [ ] Confirm `visit_financial_summary` view exists or create it
- [ ] Implement `FinanceService.getVisitFinancials()` if missing
- [ ] Implement `LoyaltyService.getPlayerLoyalty()` if missing

### Integration Phase

- [ ] Create BFF route handler at `/api/v1/rating-slips/[id]/modal-data`
- [ ] Update modal component to use BFF DTO
- [ ] Create player movement endpoint at `/api/v1/rating-slips/[id]/move`
- [ ] Wire modal callbacks to Server Actions
- [ ] Add TanStack Query hooks for modal data fetching
- [ ] Add integration tests for BFF endpoint

### Validation Phase

- [ ] Test cross-service aggregation performance
- [ ] Verify RLS policies work across service boundaries
- [ ] Confirm audit logging captures all actions
- [ ] Load test modal data endpoint (p95 < 200ms target)

---

## Related Documents

- **SRM v4.0.0**: `/home/diepulp/projects/pt-2/docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **ADR-006**: `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-006-rating-slip-field-removal.md`
- **SLAD v2.1.2**: `/home/diepulp/projects/pt-2/docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **Edge Transport Policy**: `/home/diepulp/projects/pt-2/docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- **DTO Standard**: `/home/diepulp/projects/pt-2/docs/25-api-data/DTO_CANONICAL_STANDARD.md`

---

## Conclusion

The rating slip modal requires **cross-context data aggregation** from 5 services:
1. **RatingSlipService** - Telemetry (average bet, start time, table, seat)
2. **PlayerService** - Identity (player name)
3. **LoyaltyService** - Rewards (points balance)
4. **PlayerFinancialService** - Finance (cash in, chips taken)
5. **VisitService** - Session (visit linkage)

**Recommended Architecture**: Backend-for-Frontend (BFF) pattern using Next.js Route Handler to aggregate data while respecting bounded context boundaries.

**Critical Rule**: Never add financial or loyalty fields to `rating_slip` table. Respect service ownership per SRM and ADR-006.

---

**Document Version**: 1.0.0 (Corrected)
**Created**: 2025-12-10
**Status**: CANONICAL CORRECTION

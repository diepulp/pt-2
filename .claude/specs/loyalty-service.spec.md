---
title: Loyalty Service Specification
description: Player loyalty points calculation, tier management, and redemption tracking
type: service
status: approved
version: 1.0.0
created: 2025-10-17
created_by: architect
approved_by: architect.chatmode
implements: Service Layer (Phase 2)
depends_on:
  - adr: ADR-002-service-layer-architecture
  - service: PlayerService
  - service: VisitService
---

# Loyalty Service Specification

## Bounded Context

**Key Question**: "What are this player's current loyalty points, tier, and redemption history?"

**Ownership**:

- Player loyalty points balances and transactions
- Loyalty tier calculations and transitions
- Points redemption tracking
- Tier-based benefit eligibility

## Requirements

### Functional Requirements

- [ ] Track player loyalty points balance per player
- [ ] Calculate and assign loyalty tiers based on points thresholds
- [ ] Record points earned transactions (source: visits, purchases, manual adjustments)
- [ ] Record points redeemed transactions (redemptions, expirations, manual adjustments)
- [ ] Support tier transition history tracking
- [ ] Provide current tier benefits query capability
- [ ] Calculate points-to-next-tier for player progression display

### Non-Functional Requirements

- **Performance**:
  - Simple queries (getBalance, getCurrentTier): <50ms
  - Points calculation: <100ms
  - Transaction recording: <200ms
- **Scalability**: Support 10,000+ active players with 1M+ transactions
- **Security**:
  - RLS policies enforce player data isolation
  - Only authenticated users can view their own loyalty data
  - Admin role required for manual adjustments
- **Reliability**:
  - Transactional integrity for points operations
  - Audit trail for all balance changes
  - Idempotent operations (prevent duplicate credits/debits)

## Data Ownership

### OWNS

- `player_loyalty_balances`: Current points balance per player
  - `player_id`, `current_points`, `lifetime_points`, `current_tier`, `tier_updated_at`
- `loyalty_transactions`: All points earned/redeemed events
  - `player_id`, `transaction_type`, `points_amount`, `source`, `reference_id`
- `loyalty_tiers`: Tier definitions and thresholds
  - `tier_name`, `points_threshold`, `benefits_json`, `display_order`
- Computed fields:
  - `points_to_next_tier`: Calculated from current_points and tier thresholds
  - `tier_progress_percentage`: (current_points / next_tier_threshold) \* 100

### REFERENCES

- `players.id` (PlayerService): Player identity for loyalty tracking
- `visits.id` (VisitService): Visit reference for points earned from visits
- `staff.id` (StaffService): Staff who processed manual adjustments

### DOES NOT OWN

- Player profile data (PlayerService owns)
- Visit records (VisitService owns)
- Redemption catalog items (future RewardsService)

## Interface Definition

```typescript
import type { Database } from "@/types/database.types";
import { SupabaseClient } from "@supabase/supabase-js";

// Primary service interface
export interface LoyaltyService {
  // Balance Queries
  getBalance(playerId: string): Promise<PlayerLoyaltyBalance | null>;
  getCurrentTier(playerId: string): Promise<LoyaltyTier | null>;
  getPointsToNextTier(playerId: string): Promise<number>;

  // Transaction History
  getTransactionHistory(
    playerId: string,
    options?: TransactionHistoryOptions,
  ): Promise<LoyaltyTransaction[]>;

  // Points Operations
  creditPoints(params: CreditPointsParams): Promise<LoyaltyTransaction>;
  debitPoints(params: DebitPointsParams): Promise<LoyaltyTransaction>;

  // Tier Management
  recalculateTier(playerId: string): Promise<PlayerLoyaltyBalance>;
  getTierBenefits(tierName: string): Promise<TierBenefits>;
  getAllTiers(): Promise<LoyaltyTier[]>;

  // Redemption Support
  canRedeem(playerId: string, pointsCost: number): Promise<boolean>;
  recordRedemption(params: RedemptionParams): Promise<LoyaltyTransaction>;
}

// Supporting types
export interface PlayerLoyaltyBalance {
  player_id: string;
  current_points: number;
  lifetime_points: number;
  current_tier: string;
  tier_updated_at: string;
  points_to_next_tier: number; // Computed
  tier_progress_percentage: number; // Computed
}

export interface LoyaltyTransaction {
  id: string;
  player_id: string;
  transaction_type: "earned" | "redeemed" | "expired" | "adjustment";
  points_amount: number; // Positive for earned, negative for redeemed
  source: string; // 'visit', 'purchase', 'redemption', 'manual', 'expiration'
  reference_id: string | null; // FK to visit_id, purchase_id, etc.
  processed_by: string | null; // Staff ID for manual adjustments
  notes: string | null;
  created_at: string;
}

export interface LoyaltyTier {
  tier_name: string;
  points_threshold: number;
  benefits_json: Record<string, any>;
  display_order: number;
  created_at: string;
}

export interface CreditPointsParams {
  player_id: string;
  points_amount: number;
  source: "visit" | "purchase" | "manual";
  reference_id?: string;
  processed_by?: string;
  notes?: string;
}

export interface DebitPointsParams {
  player_id: string;
  points_amount: number;
  source: "redemption" | "expiration" | "manual";
  reference_id?: string;
  processed_by?: string;
  notes?: string;
}

export interface RedemptionParams {
  player_id: string;
  points_cost: number;
  redemption_id: string;
  processed_by?: string;
  notes?: string;
}

export interface TransactionHistoryOptions {
  limit?: number;
  offset?: number;
  transaction_type?: LoyaltyTransaction["transaction_type"];
  start_date?: string;
  end_date?: string;
}

export interface TierBenefits {
  tier_name: string;
  benefits: {
    discount_percentage?: number;
    priority_booking?: boolean;
    free_sessions_monthly?: number;
    exclusive_events?: boolean;
    [key: string]: any;
  };
}
```

## Database Schema

### Required Tables

```sql
-- ============================================================================
-- Loyalty Tiers (Reference Data)
-- ============================================================================
CREATE TABLE loyalty_tiers (
  tier_name TEXT PRIMARY KEY,
  points_threshold INTEGER NOT NULL CHECK (points_threshold >= 0),
  benefits_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(display_order)
);

-- Indexes
CREATE INDEX idx_loyalty_tiers_threshold ON loyalty_tiers(points_threshold);

-- RLS Policies (publicly readable for tier display)
ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_tiers_read_all"
  ON loyalty_tiers
  FOR SELECT
  USING (true);

CREATE POLICY "loyalty_tiers_admin_only"
  ON loyalty_tiers
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- ============================================================================
-- Player Loyalty Balances
-- ============================================================================
CREATE TABLE player_loyalty_balances (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  current_points INTEGER NOT NULL DEFAULT 0 CHECK (current_points >= 0),
  lifetime_points INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0),
  current_tier TEXT NOT NULL DEFAULT 'Bronze' REFERENCES loyalty_tiers(tier_name),
  tier_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_player_loyalty_player ON player_loyalty_balances(player_id);
CREATE INDEX idx_player_loyalty_tier ON player_loyalty_balances(current_tier);
CREATE INDEX idx_player_loyalty_points ON player_loyalty_balances(current_points DESC);

-- RLS Policies
ALTER TABLE player_loyalty_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_loyalty_balances_read_own"
  ON player_loyalty_balances
  FOR SELECT
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "player_loyalty_balances_admin_all"
  ON player_loyalty_balances
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- ============================================================================
-- Loyalty Transactions (Audit Trail)
-- ============================================================================
CREATE TABLE loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN ('earned', 'redeemed', 'expired', 'adjustment')
  ),
  points_amount INTEGER NOT NULL, -- Positive = earned, Negative = redeemed/expired
  source TEXT NOT NULL, -- 'visit', 'purchase', 'redemption', 'manual', 'expiration'
  reference_id UUID NULL, -- FK to visit, purchase, redemption, etc.
  processed_by UUID NULL REFERENCES staff(id), -- For manual adjustments
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_loyalty_txn_player ON loyalty_transactions(player_id);
CREATE INDEX idx_loyalty_txn_type ON loyalty_transactions(transaction_type);
CREATE INDEX idx_loyalty_txn_created ON loyalty_transactions(created_at DESC);
CREATE INDEX idx_loyalty_txn_reference ON loyalty_transactions(reference_id) WHERE reference_id IS NOT NULL;

-- RLS Policies
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_transactions_read_own"
  ON loyalty_transactions
  FOR SELECT
  USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "loyalty_transactions_insert_system"
  ON loyalty_transactions
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' IN ('admin', 'staff')
  );

CREATE POLICY "loyalty_transactions_admin_all"
  ON loyalty_transactions
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');
```

### Triggers

```sql
-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_loyalty_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER loyalty_balance_updated_at
  BEFORE UPDATE ON player_loyalty_balances
  FOR EACH ROW
  EXECUTE FUNCTION update_loyalty_updated_at();

-- Auto-initialize loyalty balance for new players
CREATE OR REPLACE FUNCTION init_player_loyalty_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO player_loyalty_balances (player_id, current_points, lifetime_points, current_tier)
  VALUES (NEW.id, 0, 0, 'Bronze')
  ON CONFLICT (player_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER player_created_init_loyalty
  AFTER INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION init_player_loyalty_balance();
```

### Seed Data

```sql
-- Tier definitions
INSERT INTO loyalty_tiers (tier_name, points_threshold, benefits_json, display_order) VALUES
('Bronze', 0, '{"discount_percentage": 0, "priority_booking": false}', 1),
('Silver', 500, '{"discount_percentage": 5, "priority_booking": true, "free_sessions_monthly": 1}', 2),
('Gold', 2000, '{"discount_percentage": 10, "priority_booking": true, "free_sessions_monthly": 2, "exclusive_events": true}', 3),
('Platinum', 5000, '{"discount_percentage": 15, "priority_booking": true, "free_sessions_monthly": 4, "exclusive_events": true, "vip_support": true}', 4);
```

## Business Rules

1. **Points Balance Rules**
   - Current points cannot be negative
   - Lifetime points are monotonically increasing (never decrease)
   - Points transactions are immutable (no updates, only inserts)

2. **Tier Calculation Rules**
   - Tier is based on `current_points`, not `lifetime_points`
   - Tier updates trigger `tier_updated_at` timestamp
   - Tier transitions are recorded in transaction history as `adjustment` type
   - Players can be demoted if points fall below threshold (after redemptions)

3. **Points Earning Rules**
   - Visit completion: +10 points (configurable)
   - Purchase: 1 point per $1 spent (configurable)
   - Manual adjustments require admin/staff role

4. **Points Redemption Rules**
   - Cannot redeem more points than current balance
   - Redemption creates negative transaction record
   - Redemption may trigger tier demotion if balance drops below threshold

5. **Transaction Idempotency**
   - Same `reference_id` + `source` combination prevents duplicate credits
   - Use upsert pattern with conflict resolution

## Implementation Requirements

### File Organization

```
services/loyalty/
├── index.ts          # Public API export
├── crud.ts           # Database operations (CRUD)
├── business.ts       # Business logic (tier calculation, validation)
├── queries.ts        # Specialized queries (transaction history, tier benefits)
└── types.ts          # Service-specific types
```

### Patterns to Follow

1. **Functional Factory**

   ```typescript
   export function createLoyaltyService(
     supabase: SupabaseClient<Database>,
   ): LoyaltyService {
     return {
       getBalance: (playerId) => getBalance(supabase, playerId),
       creditPoints: (params) => creditPoints(supabase, params),
       // ... other methods
     };
   }
   ```

2. **Transactional Points Operations**

   ```typescript
   async function creditPoints(
     supabase: SupabaseClient<Database>,
     params: CreditPointsParams,
   ): Promise<LoyaltyTransaction> {
     // 1. Insert transaction record
     const transaction = await insertTransaction(supabase, {
       player_id: params.player_id,
       transaction_type: "earned",
       points_amount: params.points_amount,
       source: params.source,
       reference_id: params.reference_id,
     });

     // 2. Update balance
     await updateBalance(supabase, params.player_id, params.points_amount);

     // 3. Recalculate tier if needed
     await recalculateTierIfNeeded(supabase, params.player_id);

     return transaction;
   }
   ```

3. **Tier Calculation Logic**

   ```typescript
   async function calculateTier(
     supabase: SupabaseClient<Database>,
     currentPoints: number,
   ): Promise<string> {
     const tiers = await getAllTiers(supabase);

     // Sort tiers by threshold descending
     const sortedTiers = tiers.sort(
       (a, b) => b.points_threshold - a.points_threshold,
     );

     // Find highest tier player qualifies for
     for (const tier of sortedTiers) {
       if (currentPoints >= tier.points_threshold) {
         return tier.tier_name;
       }
     }

     return "Bronze"; // Default tier
   }
   ```

### Anti-Patterns to Avoid

- ❌ NO class-based services
- ❌ NO `ReturnType<typeof createLoyaltyService>`
- ❌ NO direct service-to-service calls (use client orchestration)
- ❌ NO `console.log` in production code
- ❌ NO mutation of balance without transaction record
- ❌ NO hardcoded tier thresholds (read from database)

### Performance Targets

- `getBalance()`: <50ms (single row query)
- `creditPoints()`: <200ms (insert + update + tier calc)
- `getTransactionHistory()`: <100ms (indexed query with pagination)
- `recalculateTier()`: <100ms (tier lookup + update)

## Test Requirements

### Unit Tests

```
__tests__/services/loyalty/
├── crud.test.ts          # CRUD operations
├── business.test.ts      # Business logic (tier calc, validation)
└── queries.test.ts       # Specialized queries
```

### Test Coverage

**Minimum**: 80% lines, branches, functions
**Ideal**: 90%+

### Test Cases (CRUD)

- [ ] getBalance: Returns balance for existing player
- [ ] getBalance: Returns null for non-existent player
- [ ] getCurrentTier: Returns correct tier
- [ ] getTransactionHistory: Returns paginated transactions
- [ ] getTransactionHistory: Filters by transaction_type
- [ ] getAllTiers: Returns all tiers sorted by display_order

### Test Cases (Business Logic)

**Points Operations**:

- [ ] creditPoints: Increases current_points and lifetime_points
- [ ] creditPoints: Creates transaction record
- [ ] creditPoints: Triggers tier promotion if threshold crossed
- [ ] debitPoints: Decreases current_points only
- [ ] debitPoints: Does not decrease lifetime_points
- [ ] debitPoints: Triggers tier demotion if balance drops below threshold
- [ ] debitPoints: Fails if insufficient balance

**Tier Calculation**:

- [ ] recalculateTier: Bronze (0-499 points)
- [ ] recalculateTier: Silver (500-1999 points)
- [ ] recalculateTier: Gold (2000-4999 points)
- [ ] recalculateTier: Platinum (5000+ points)
- [ ] recalculateTier: Updates tier_updated_at on tier change
- [ ] recalculateTier: Does not update tier_updated_at if tier unchanged

**Redemption**:

- [ ] canRedeem: Returns true if sufficient balance
- [ ] canRedeem: Returns false if insufficient balance
- [ ] recordRedemption: Creates negative transaction
- [ ] recordRedemption: Updates balance correctly
- [ ] recordRedemption: Fails if insufficient points

**Edge Cases**:

- [ ] Handles concurrent point operations gracefully
- [ ] Prevents negative current_points
- [ ] Prevents negative lifetime_points
- [ ] Handles player with no loyalty balance (auto-initializes)

## Integration Points

### With Other Services

```typescript
// Example: Visit completion triggers loyalty points
// Client orchestrates in visit completion flow
async function completeVisit(visitId: string) {
  // 1. VisitService marks visit complete
  const visit = await visitService.completeVisit(visitId);

  // 2. LoyaltyService credits points
  if (visit.player_id) {
    await loyaltyService.creditPoints({
      player_id: visit.player_id,
      points_amount: 10, // Configurable
      source: "visit",
      reference_id: visit.id,
    });
  }

  return visit;
}
```

### With UI Layer

**API Routes**:

- `app/api/loyalty/balance/route.ts` - Get player balance
- `app/api/loyalty/transactions/route.ts` - Get transaction history
- `app/api/loyalty/tiers/route.ts` - Get tier definitions

**Server Actions**:

- `app/actions/loyalty.ts` - Redeem points action

**React Query Hooks**:

- `app/hooks/use-loyalty-balance.ts` - Query player balance
- `app/hooks/use-loyalty-transactions.ts` - Query transaction history
- `app/hooks/use-loyalty-tiers.ts` - Query tier definitions

## Migration Strategy

### Phase 1: Schema (Week 1)

```bash
# Create migration
npx supabase migration new loyalty_service_schema

# Add schema from "Database Schema" section above

# Apply migration
npx supabase migration up

# Regenerate types
npm run db:types

# Verify
npm run test:schema
```

### Phase 2: Service Implementation (Week 2)

- Implement following SERVICE_TEMPLATE_QUICK pattern
- Create `services/loyalty/` with CRUD, business, queries
- Write comprehensive unit tests
- Validate with anti-pattern checklist

### Phase 3: Integration (Week 3)

- Connect to VisitService (points from visits)
- Create API routes and server actions
- Implement React Query hooks
- End-to-end testing with UI

## Validation Criteria

Before marking complete:

- [ ] All interface methods implemented
- [ ] Functional factory pattern used (NO classes)
- [ ] Typed as `SupabaseClient<Database>` (NO `any`)
- [ ] No anti-patterns detected (run checklist)
- [ ] Test coverage ≥80%
- [ ] All business rules validated in tests
- [ ] Performance targets met (<50ms simple, <200ms complex)
- [ ] RLS policies tested and working
- [ ] Integration with VisitService working
- [ ] service-catalog.memory.md updated with LoyaltyService
- [ ] SERVICE_RESPONSIBILITY_MATRIX updated

## References

- **Service Template**: `docs/patterns/SERVICE_TEMPLATE_QUICK.md`
- **Service Matrix**: `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Architecture**: `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md` §3.3
- **Anti-Patterns**: `docs/patterns/ANTI_PATTERNS_CHECKLIST.md`
- **ADR**: `docs/adr/ADR-002-service-layer-architecture.md`

---

**Status**: approved
**Created By**: architect.chatmode
**Approved By**: architect.chatmode
**Implementation Target**: Phase 2 / Week 4-6
**Estimated Effort**: 16-24 hours (schema: 4h, service: 8h, tests: 4h, integration: 4-8h)

---

**END OF SPECIFICATION**

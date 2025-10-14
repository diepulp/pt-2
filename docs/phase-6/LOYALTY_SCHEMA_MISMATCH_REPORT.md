# Loyalty Service Schema Mismatch Report

**Date**: 2025-10-12
**Phase**: Phase 6 - Wave 1 Post-Implementation
**Status**: 🚨 CRITICAL - Wave 1 committed with incorrect schema assumptions

---

## Executive Summary

The Wave 1 LoyaltyService implementation (committed in `830e750`) was developed against **incorrect schema assumptions**. The service references table names and field names that **do not exist** in the actual database, making the implementation **non-functional** until corrected.

This issue was discovered during Wave 2 implementation when attempting to integrate RatingSlip with LoyaltyService, leading to the user's decision to discard Wave 2 changes pending careful schema review.

---

## Critical Issues

### 1. Table Name Error

**Location**: [services/loyalty/crud.ts:22](services/loyalty/crud.ts#L22)

```typescript
// ❌ WRONG (PascalCase)
Database["public"]["Tables"]["LoyaltyLedger"]["Row"]

// ✅ CORRECT (snake_case)
Database["public"]["Tables"]["loyalty_ledger"]["Row"]
```

**Impact**: All ledger CRUD operations will fail with "relation does not exist" errors.

---

### 2. player_loyalty Table - Field Name Mismatches

**Actual Schema** (from database):
```sql
CREATE TABLE player_loyalty (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL UNIQUE,
  tier TEXT DEFAULT 'bronze' CHECK (tier IN ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
  current_balance INTEGER DEFAULT 0 CHECK (current_balance >= 0),
  lifetime_points INTEGER DEFAULT 0 CHECK (lifetime_points >= 0),
  tier_progress NUMERIC DEFAULT 0.0 CHECK (tier_progress >= 0.0 AND tier_progress <= 100.0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Service Implementation** (WRONG):
```typescript
export type PlayerLoyaltyDTO = Pick<
  PlayerLoyaltyRow,
  | "points_balance"          // ❌ DOESN'T EXIST → should be current_balance
  | "points_earned_total"     // ❌ DOESN'T EXIST → should be lifetime_points
  | "points_redeemed_total"   // ❌ DOESN'T EXIST (not in schema at all)
  | "tier_expires_at"         // ❌ DOESN'T EXIST (not in schema at all)
  | "achievements"            // ❌ DOESN'T EXIST (not in schema at all)
  | "benefits"                // ❌ DOESN'T EXIST (not in schema at all)
  | "milestones"              // ❌ DOESN'T EXIST (not in schema at all)
>;
```

**Field Mapping**:
| Service Field (WRONG) | Actual Schema Field | Notes |
|----------------------|---------------------|-------|
| `points_balance` | `current_balance` | Redeemable balance (can decrease) |
| `points_earned_total` | `lifetime_points` | Monotonically increasing total |
| `points_redeemed_total` | **DOESN'T EXIST** | Not tracked in current schema |
| `tier_expires_at` | **DOESN'T EXIST** | Tiers don't expire in current design |
| `achievements` | **DOESN'T EXIST** | Not in MVP scope |
| `benefits` | **DOESN'T EXIST** | Stored in code (LOYALTY_TIERS) |
| `milestones` | **DOESN'T EXIST** | Not in MVP scope |

**Impact**: All CRUD operations on `player_loyalty` will fail or return incomplete data.

---

### 3. loyalty_ledger Table - Field Name Mismatches

**Actual Schema** (from database):
```sql
CREATE TABLE loyalty_ledger (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL,
  rating_slip_id UUID,
  visit_id UUID,
  session_id TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('GAMEPLAY', 'MANUAL_BONUS', 'PROMOTION', 'ADJUSTMENT')),
  event_type TEXT,
  points_change INTEGER NOT NULL,  -- Delta: positive = credit, negative = debit
  reason TEXT,
  source TEXT DEFAULT 'system' CHECK (source IN ('system', 'manual', 'promotion', 'adjustment')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Service Implementation** (WRONG):
```typescript
export type LoyaltyLedgerDTO = Pick<
  LoyaltyLedgerRow,
  | "transaction_date"  // ❌ DOESN'T EXIST → should be created_at
  | "points"            // ❌ DOESN'T EXIST → should be points_change
  | "direction"         // ❌ DOESN'T EXIST → use points_change sign (+ or -)
  | "description"       // ❌ DOESN'T EXIST → should be reason
  | "balance_after"     // ❌ DOESN'T EXIST (not tracked in ledger)
  | "metadata"          // ❌ DOESN'T EXIST (not in schema)
>;
```

**Field Mapping**:
| Service Field (WRONG) | Actual Schema Field | Notes |
|----------------------|---------------------|-------|
| `transaction_date` | `created_at` | Timestamp field name |
| `points` | `points_change` | Delta value (can be negative) |
| `direction` | **DOESN'T EXIST** | Use `points_change` sign instead |
| `description` | `reason` | Text description field |
| `balance_after` | **DOESN'T EXIST** | Calculated from aggregation, not stored |
| `metadata` | **DOESN'T EXIST** | Not in MVP scope |
| *missing* | `transaction_type` | Required field (GAMEPLAY, etc.) |
| *missing* | `event_type` | Domain event identifier |
| *missing* | `source` | Transaction source (system, manual, etc.) |
| *missing* | `session_id` | Idempotency key |
| *missing* | `rating_slip_id` | Link to RatingSlip context |

**Impact**: All ledger entry creation and queries will fail.

---

## Affected Files

### Direct Schema References (CRITICAL)
1. ✅ **[services/loyalty/crud.ts](services/loyalty/crud.ts)** - All CRUD operations
2. ✅ **[services/loyalty/queries.ts](services/loyalty/queries.ts)** - All query operations
3. ⚠️ **[services/loyalty/business.ts](services/loyalty/business.ts)** - References DTOs (indirect impact)

### Dependent Files (SECONDARY)
4. **[services/loyalty/index.ts](services/loyalty/index.ts)** - Exports DTOs with wrong field names
5. **Any future Wave 2 integration** - RatingSlip → Loyalty coordination

---

## Root Cause Analysis

### What Happened?
1. Wave 0 included schema corrections for **RatingSlip** (removed `points` field per bounded context)
2. Wave 0 DID NOT include schema verification for **Loyalty tables** (assumed they matched design docs)
3. Wave 1 LoyaltyService was implemented against **design document assumptions** rather than **actual database schema**
4. TypeScript compilation succeeded because `database.types.ts` was not regenerated after schema changes
5. Issue only discovered during Wave 2 when runtime errors would have occurred

### Why TypeScript Didn't Catch This?
The `database.types.ts` file may be out of sync with the actual database schema, causing TypeScript to accept invalid field names without errors.

---

## Recommended Fix Strategy

### Option A: Fix Service to Match Actual Schema (RECOMMENDED)

**Pros**:
- No database migration required
- Preserves schema integrity from Wave 0
- Aligns with actual implemented schema

**Cons**:
- Requires updating all service layer code
- May require updating design documents

**Implementation**:
1. Regenerate `database.types.ts` from actual schema
2. Update all DTOs to match actual fields
3. Update all CRUD operations to use correct field names
4. Update business logic to use correct field mappings
5. Verify TypeScript compilation succeeds
6. Add integration tests to prevent regression

### Option B: Migrate Database to Match Service Design

**Pros**:
- Service code remains as-is
- Aligns with original design documents

**Cons**:
- Requires database migration
- Risk of data loss if `player_loyalty` records exist
- May conflict with Wave 0 bounded context corrections
- Adds complexity for features not in MVP (achievements, milestones)

**NOT RECOMMENDED** - Adds unnecessary schema complexity for MVP.

---

## Immediate Action Items

### 1. Regenerate Database Types (CRITICAL)
```bash
npm run db:types
```

Verify `types/database.types.ts` matches actual schema.

### 2. Create Corrected Service Implementation
Update services to use actual schema fields:

**player_loyalty** mapping:
- `points_balance` → `current_balance`
- `points_earned_total` → `lifetime_points`
- Remove: `points_redeemed_total`, `tier_expires_at`, `achievements`, `benefits`, `milestones`

**loyalty_ledger** mapping:
- `transaction_date` → `created_at`
- `points` → `points_change`
- `direction` → *derived from `points_change` sign*
- `description` → `reason`
- Remove: `balance_after`, `metadata`
- Add: `transaction_type`, `event_type`, `source`, `session_id`, `rating_slip_id`

### 3. Update Business Logic
Modify [services/loyalty/business.ts](services/loyalty/business.ts):
- Update `accruePointsFromSlip()` to use `points_change` instead of `points`
- Use `current_balance` and `lifetime_points` for calculations
- Remove references to non-existent fields

### 4. Add Integration Tests
Create tests to verify:
- Player loyalty initialization
- Points accrual from RatingSlip
- Ledger entry creation
- Balance and tier queries
- Transaction history retrieval

---

## Verification Checklist

Before proceeding with Wave 2:

- [ ] `database.types.ts` regenerated and verified
- [ ] All DTOs updated to match actual schema
- [ ] All CRUD operations use correct field names
- [ ] All queries use correct field names
- [ ] Business logic updated for new field mappings
- [ ] TypeScript compilation succeeds with no errors
- [ ] Manual test: Initialize player loyalty
- [ ] Manual test: Create ledger entry
- [ ] Manual test: Query balance and tier
- [ ] Manual test: Retrieve transaction history
- [ ] Integration test suite added

---

## Design Document Updates Required

After fix is complete, update these documents to reflect actual schema:

1. **docs/phase-6/PHASE_6_DEVELOPER_CHECKLIST.md** - Wave 1 deliverables
2. **docs/system-prd/** - Loyalty schema documentation (if exists)
3. **docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md** - Verify Loyalty bounded context

---

## Timeline Impact

**Current Status**: Wave 1 COMMITTED but NON-FUNCTIONAL
**Wave 2 Status**: BLOCKED pending schema fix
**Estimated Fix Time**: 2-3 hours (schema verification + service updates + testing)

**Recommendation**: Fix Wave 1 schema issues BEFORE proceeding with Wave 2 to avoid compounding errors.

---

## Notes

- User correctly identified this issue during Wave 2 attempt
- User's decision to discard Wave 2 changes was the right call
- This report provides foundation for careful schema correction
- No production impact (Phase 6 not deployed yet)

---

## Appendix: Actual Database Schema

### player_loyalty (as-is)
```sql
CREATE TABLE player_loyalty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL UNIQUE REFERENCES player(id),
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier = ANY (ARRAY['BRONZE'::text, 'SILVER'::text, 'GOLD'::text, 'PLATINUM'::text])),
  current_balance INTEGER DEFAULT 0 CHECK (current_balance >= 0),
  lifetime_points INTEGER DEFAULT 0 CHECK (lifetime_points >= 0),
  tier_progress NUMERIC DEFAULT 0.0 CHECK (tier_progress >= 0.0 AND tier_progress <= 100.0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE player_loyalty IS 'Denormalized aggregate of loyalty_ledger - current balance and tier status';
COMMENT ON COLUMN player_loyalty.current_balance IS 'Current redeemable points balance (can decrease from redemptions)';
COMMENT ON COLUMN player_loyalty.lifetime_points IS 'Total points ever earned (monotonically increasing)';
COMMENT ON COLUMN player_loyalty.tier_progress IS 'Progress to next tier (0-100%)';
```

### loyalty_ledger (as-is)
```sql
CREATE TABLE loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player(id),
  rating_slip_id UUID REFERENCES ratingslip(id),
  visit_id UUID REFERENCES visit(id),
  session_id TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type = ANY (ARRAY['GAMEPLAY'::text, 'MANUAL_BONUS'::text, 'PROMOTION'::text, 'ADJUSTMENT'::text])),
  event_type TEXT,
  points_change INTEGER NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'system' CHECK (source = ANY (ARRAY['system'::text, 'manual'::text, 'promotion'::text, 'adjustment'::text])),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE loyalty_ledger IS 'Immutable ledger of all loyalty point transactions - bounded context for rewards';
COMMENT ON COLUMN loyalty_ledger.session_id IS 'Generic session identifier for idempotency - typically ratingslip.id';
COMMENT ON COLUMN loyalty_ledger.transaction_type IS 'GAMEPLAY: earned from play, MANUAL_BONUS: staff-issued, PROMOTION: marketing campaign, ADJUSTMENT: correction';
COMMENT ON COLUMN loyalty_ledger.event_type IS 'Domain event that triggered this transaction (event-driven architecture)';
COMMENT ON COLUMN loyalty_ledger.points_change IS 'Delta points (positive for credit, negative for debit)';
```

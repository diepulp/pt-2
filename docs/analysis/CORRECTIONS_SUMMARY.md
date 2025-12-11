# Bounded Context Analysis Corrections Summary

**Date**: 2025-12-10
**Status**: CANONICAL
**Related Document**: `rating-slip-modal-bounded-context-analysis.md`

---

## Critical Errors Corrected

### ❌ Error 1: Violating ADR-006 and SRM Boundaries

**Previous Recommendation**: Add `cash_in` and `chips_taken` columns to `rating_slip` table

**Why This Was Wrong**:
- **Violates ADR-006**: Accepted decision to remove financial fields from rating_slip
- **Violates SRM v4.0.0 Section 240-242**: "Does NOT Store: Reward balances or points; Loyalty remains the sole source of truth"
- **Crosses Bounded Context**: Financial data belongs to PlayerFinancialService, not RatingSlipService
- **Architectural Regression**: Would reintroduce the exact problem ADR-006 was designed to solve

**Correct Approach**:
- Query `player_financial_transaction` table via PlayerFinancialService
- Use `visit_financial_summary` view (from ADR-006) when implemented
- Respect service ownership boundaries

---

### ❌ Error 2: Incorrect Scope Assessment for Points

**Previous Recommendation**: "Points tracking is out of MVP scope"

**Why This Was Wrong**:
- LoyaltyService EXISTS and is IMPLEMENTED (confirmed via `/services/loyalty/` directory)
- `player_loyalty` and `loyalty_ledger` tables exist in schema
- `rpc_issue_mid_session_reward` exists for point issuance
- Points ARE in scope via LoyaltyService bounded context

**Correct Approach**:
- Query `player_loyalty.balance` via LoyaltyService for current points
- LoyaltyService is the sole source of truth for reward balances (SRM:267)
- Points display is valid modal requirement, serviced by existing implementation

---

### ❌ Error 3: Unclear Player Movement Responsibility

**Previous Recommendation**: Ambiguous about which service owns player movement

**Why This Was Incomplete**:
- Player movement is not a special operation requiring a dedicated service
- Movement = close current slip + start new slip at different table/seat
- This is standard RatingSlipService responsibility using existing operations

**Correct Approach**:
- Use `ratingSlipService.close()` to close current slip
- Use `ratingSlipService.start()` to start new slip at new table/seat
- Both operations use same `visit_id` to maintain session continuity
- No schema changes required

---

## Service Ownership Matrix (Corrected)

| Modal Field | Service Owner | Source Table | Rationale |
|-------------|---------------|--------------|-----------|
| `playerName` | PlayerService | `player` | Identity bounded context |
| `averageBet` | **RatingSlipService** | `rating_slip` | ✅ Owns gameplay telemetry |
| `cashIn` | **PlayerFinancialService** | `player_financial_transaction` | Financial bounded context (ADR-006) |
| `startTime` | **RatingSlipService** | `rating_slip` | ✅ Owns gameplay telemetry |
| `gameTableId` | **RatingSlipService** | `rating_slip` | ✅ Owns gameplay telemetry |
| `seatNumber` | **RatingSlipService** | `rating_slip` | ✅ Owns gameplay telemetry |
| `points` | **LoyaltyService** | `player_loyalty` | Reward bounded context (SRM:267) |
| `chipsTaken` | **PlayerFinancialService** | `player_financial_transaction` | Financial bounded context (ADR-006) |

---

## Why These Corrections Matter

### 1. Architectural Integrity

**Previous Analysis Would Have**:
- Created bounded context violations
- Introduced data duplication across services
- Made future refactoring harder
- Violated accepted ADRs

**Corrected Analysis**:
- Respects service boundaries per SRM
- Maintains single source of truth per domain
- Enables independent service evolution
- Aligns with PT-2 architecture governance

---

### 2. ADR-006 Compliance

**ADR-006 Decision (2025-10-19)**:
> "Remove `cash_in`, `chips_brought`, `chips_taken` from `ratingslip`. Provide a plain, backward-compatible view; add targeted indexes to PFT."

**Why It Exists**:
- Monetary truth must live in `player_financial_transaction` for auditability
- Enables reversals and RLS isolation
- `rating_slip` remains telemetry/performance only

**Previous Analysis**: Would have reversed this decision without justification
**Corrected Analysis**: Respects and reinforces ADR-006

---

### 3. SRM Canonical Stance

**SRM v4.0.0 Line 267**:
> "**Canonical Stance**: Loyalty is the sole source of truth for rewards. RatingSlip stores telemetry only."

**Previous Analysis**: Ignored this stance
**Corrected Analysis**: Enforces single source of truth principle

---

## Recommended Integration Pattern: BFF (Backend-for-Frontend)

### Why Multi-Service Aggregation?

1. **Respects Bounded Contexts**: Each service owns its data
2. **PT-2 Stack Alignment**: Next.js Route Handlers are canonical transport
3. **Performance**: Connection pooling + TanStack Query caching mitigate multi-query concerns
4. **Maintainability**: Clear data flow, testable, traceable
5. **Future-Proof**: Can optimize without architectural changes

### Implementation

```typescript
// app/api/v1/rating-slips/[id]/modal-data/route.ts
export async function GET(request, { params }) {
  const supabase = createClient();

  // Aggregate from 5 services
  const slip = await ratingSlipService.getById(params.id);      // Telemetry
  const visit = await visitService.getById(slip.visit_id);       // Session
  const player = await playerService.getById(visit.player_id);   // Identity
  const loyalty = await loyaltyService.getPlayerLoyalty(...);    // Rewards
  const financials = await financeService.getVisitFinancials(...); // Finance

  return ServiceHttpResult.ok({
    playerName: `${player.first_name} ${player.last_name}`,
    averageBet: slip.average_bet,
    cashIn: financials.total_cash_in,
    points: loyalty.balance,
    chipsTaken: financials.total_chips_taken,
    // ... other fields
  });
}
```

---

## Action Items Before Integration

### Critical Path

1. **Verify ADR-006 Implementation**
   - [ ] Check if `visit_financial_summary` view exists
   - [ ] Confirm `player_financial_transaction` indexes exist
   - [ ] Validate backward compatibility approach

2. **Implement Missing Service Methods**
   - [ ] `FinanceService.getVisitFinancials()` (if not exists)
   - [ ] `LoyaltyService.getPlayerLoyalty()` (verify exists)

3. **Create BFF Endpoint**
   - [ ] Route handler at `/api/v1/rating-slips/[id]/modal-data`
   - [ ] Aggregate DTOs from 5 services
   - [ ] Add caching strategy

4. **Wire Modal Component**
   - [ ] Update modal props to use BFF DTO
   - [ ] Add TanStack Query hooks
   - [ ] Add Server Actions for mutations

---

## References

### Canonical Documents

- **SRM v4.0.0**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **ADR-006**: `docs/80-adrs/ADR-006-rating-slip-field-removal.md`
- **SLAD v2.1.2**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`

### Service Implementations

- **RatingSlipService**: `services/rating-slip/` (Pattern B - Canonical CRUD)
- **LoyaltyService**: `services/loyalty/` (Pattern A - Contract-First)
- **PlayerFinancialService**: `services/finance/` (Status: Exists, implementation varies)
- **VisitService**: `services/visit/` (Pattern B - Canonical CRUD)
- **PlayerService**: `services/player/` (Pattern B - Canonical CRUD)

---

## Conclusion

The previous bounded context analysis contained **three critical errors** that would have:
1. Violated ADR-006 by adding financial fields to rating_slip
2. Missed existing LoyaltyService implementation for points
3. Overcomplicated player movement with unclear service ownership

This corrected analysis:
1. ✅ Respects all bounded context boundaries
2. ✅ Aligns with ADR-006 and SRM v4.0.0
3. ✅ Provides clear BFF pattern for cross-context aggregation
4. ✅ Maintains architectural integrity

**Critical Rule**: Never add financial or loyalty fields to `rating_slip` table. Respect service ownership per SRM.

---

**Document Version**: 1.0.0
**Created**: 2025-12-10
**Status**: CANONICAL

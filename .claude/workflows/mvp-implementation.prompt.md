---
title: MVP Implementation Workflow
description: Orchestrated workflow for implementing PRD-001 Player Management System MVP
skill_sequence:
  - lead-architect       # Phase planning and spec review
  - backend-service-builder  # Service implementation
  - lead-architect       # Integration review
validation_gates: 5
estimated_time: Variable per phase
version: 1.0.0
created: 2025-11-25
spec_reference: .claude/specs/MVP-001-implementation-roadmap.spec.md
prd_reference: docs/10-prd/PRD-001_Player_Management_System_Requirements.md
---

# MVP Implementation Workflow

## Overview

This workflow orchestrates the implementation of PRD-001: Player Management System MVP across three phases. Each phase has defined services, validation gates, and deliverables.

**Use this workflow when:**
- Starting MVP implementation from approved roadmap
- Implementing a specific service from the roadmap
- Validating phase completion
- Reviewing cross-phase integration

**Prerequisite**: MVP-001-implementation-roadmap.spec.md approved

---

## Workflow Entry Points

This workflow supports multiple entry points based on implementation state:

### Entry 1: Start Fresh (Full MVP)
```
Start at Phase 1 → CasinoService → ... → GATE-3
```

### Entry 2: Specific Service
```
Jump to specific service implementation section
```

### Entry 3: Phase Validation
```
Jump to specific GATE validation
```

---

## Phase 1: Core Infrastructure

### Step 1.1: Pre-Implementation Checklist

Before implementing any Phase 1 service:

- [ ] Schema baseline verified (`npm run db:types` succeeds)
- [ ] SRM v3.1.0 reviewed for service boundaries
- [ ] RLS policy templates understood
- [ ] Functional factory pattern understood

### Step 1.2: CasinoService Implementation

**Skill**: `backend-service-builder`
**Spec Reference**: MVP-001 Section 1.1

**Implementation Steps**:

1. **Create Service Structure**
   ```
   services/casino/
   ├── index.ts           # Factory export
   ├── types.ts           # Interface definitions
   ├── casino.service.ts  # Implementation
   ├── dto.ts             # DTO definitions
   └── errors.ts          # Domain errors
   ```

2. **Implement Interface**
   ```typescript
   // services/casino/types.ts
   export interface CasinoServiceInterface {
     getStaffByCasino(casinoId: string): Promise<StaffDTO[]>;
     getAuthenticatedStaff(userId: string): Promise<StaffDTO | null>;
     getCasinoSettings(casinoId: string): Promise<CasinoSettingsDTO>;
     computeGamingDay(casinoId: string, timestamp?: Date): Promise<string>;
   }
   ```

3. **Create Factory**
   ```typescript
   // services/casino/index.ts
   export function createCasinoService(
     supabase: SupabaseClient<Database>
   ): CasinoServiceInterface {
     // Implementation
   }
   ```

4. **Write Tests**
   - Unit tests for service methods
   - RLS policy tests
   - Gaming day calculation tests

**Validation Checklist**:
- [ ] Implements CasinoServiceInterface
- [ ] No class-based implementation
- [ ] No ReturnType inference
- [ ] Domain error codes defined
- [ ] Test coverage ≥80%

---

### Step 1.3: PlayerService Implementation

**Skill**: `backend-service-builder`
**Spec Reference**: MVP-001 Section 1.2

**Implementation Steps**:

1. **Create Service Structure**
   ```
   services/player/
   ├── index.ts
   ├── types.ts
   ├── player.service.ts
   ├── dto.ts
   └── errors.ts
   ```

2. **Implement Interface**
   ```typescript
   export interface PlayerServiceInterface {
     enrollPlayer(data: EnrollPlayerDTO): Promise<PlayerDTO>;
     getPlayer(playerId: string): Promise<PlayerDTO | null>;
     getPlayerByCasino(casinoId: string, playerId: string): Promise<PlayerDTO | null>;
     isPlayerEnrolled(casinoId: string, playerId: string): Promise<boolean>;
   }
   ```

3. **Create Factory and Tests**

**Validation Checklist**:
- [ ] Implements PlayerServiceInterface
- [ ] Enrollment creates player_casino association
- [ ] Casino-scoped queries working
- [ ] Test coverage ≥80%

---

### Step 1.4: TableContextService Implementation

**Skill**: `backend-service-builder`
**Spec Reference**: MVP-001 Section 1.3

**Implementation Steps**:

1. **Create Service Structure**
   ```
   services/table-context/
   ├── index.ts
   ├── types.ts
   ├── table-context.service.ts
   ├── dto.ts
   └── errors.ts
   ```

2. **Implement Interface**
   ```typescript
   export interface TableContextServiceInterface {
     openTable(tableId: string, staffId: string): Promise<GamingTableDTO>;
     closeTable(tableId: string, staffId: string): Promise<GamingTableDTO>;
     getTableStatus(tableId: string): Promise<TableStatusDTO>;
     assignDealer(tableId: string, dealerId: string, staffId: string): Promise<DealerRotationDTO>;
     getCurrentDealer(tableId: string): Promise<DealerDTO | null>;
   }
   ```

3. **Implement State Machine**
   - inactive → active (openTable)
   - active → closed (closeTable)
   - Invalid transitions throw TABLE_INVALID_STATE

4. **Create Factory and Tests**

**Validation Checklist**:
- [ ] Implements TableContextServiceInterface
- [ ] State machine enforced
- [ ] Dealer rotation logged
- [ ] Test coverage ≥80%

---

### Step 1.5: VALIDATION GATE 1

🛑 **STOP: Phase 1 Completion Review**

**Skill**: `lead-architect`

**Gate Checklist**:

```
GATE-1: Core Infrastructure Validation

Infrastructure:
- [ ] npm run db:types succeeds
- [ ] npm run type-check passes
- [ ] npm run lint passes

Services Implemented:
- [ ] CasinoService
  - [ ] Implements CasinoServiceInterface
  - [ ] Functional factory pattern
  - [ ] No ReturnType inference
  - [ ] Test coverage ≥80%

- [ ] PlayerService
  - [ ] Implements PlayerServiceInterface
  - [ ] Enrollment working
  - [ ] Test coverage ≥80%

- [ ] TableContextService
  - [ ] Implements TableContextServiceInterface
  - [ ] State machine enforced
  - [ ] Test coverage ≥80%

RLS Policies:
- [ ] staff_read_same_casino deployed
- [ ] casino_settings_read_same_casino deployed
- [ ] player_read_same_casino deployed
- [ ] gaming_table_read_same_casino deployed
- [ ] gaming_table_write_pit_boss_admin deployed

Integration:
- [ ] E2E test for US-001 (Open Table) passes
- [ ] Staff authentication flow working
- [ ] Casino-scoped access enforced

Performance:
- [ ] Server action latency < 400ms (p95)
```

**Approval Required**: Proceed to Phase 2? (Reply "approved" to continue)

---

## Phase 2: Session Management

### Step 2.1: Pre-Implementation Checklist

Before implementing Phase 2 services:

- [ ] GATE-1 passed
- [ ] Phase 1 services available
- [ ] Player enrollment working
- [ ] Table operations working

### Step 2.2: VisitService Implementation

**Skill**: `backend-service-builder`
**Spec Reference**: MVP-001 Section 2.1

**Implementation Steps**:

1. **Create Service Structure**
   ```
   services/visit/
   ├── index.ts
   ├── types.ts
   ├── visit.service.ts
   ├── dto.ts
   └── errors.ts
   ```

2. **Implement Interface**
   ```typescript
   export interface VisitServiceInterface {
     checkIn(data: CheckInDTO): Promise<VisitDTO>;
     checkOut(visitId: string, staffId: string): Promise<VisitDTO>;
     getActiveVisit(casinoId: string, playerId: string): Promise<VisitDTO | null>;
     seatPlayer(visitId: string, tableId: string, seatNumber: number): Promise<VisitDTO>;
     unseatPlayer(visitId: string): Promise<VisitDTO>;
   }
   ```

3. **Implement Invariants**
   - One active visit per player per casino
   - Seating required before rating slip

4. **Create Factory and Tests**

**Validation Checklist**:
- [ ] Implements VisitServiceInterface
- [ ] Concurrent visit prevention working
- [ ] Seating operations working
- [ ] Test coverage ≥80%

---

### Step 2.3: RatingSlipService Implementation

**Skill**: `backend-service-builder`
**Spec Reference**: MVP-001 Section 2.2

**Implementation Steps**:

1. **Create Service Structure**
   ```
   services/rating-slip/
   ├── index.ts
   ├── types.ts
   ├── rating-slip.service.ts
   ├── dto.ts
   ├── duration.ts         # Duration calculation
   └── errors.ts
   ```

2. **Implement Interface**
   ```typescript
   export interface RatingSlipServiceInterface {
     startSlip(data: StartSlipDTO): Promise<RatingSlipDTO>;
     pauseSlip(slipId: string, staffId: string): Promise<RatingSlipDTO>;
     resumeSlip(slipId: string, staffId: string): Promise<RatingSlipDTO>;
     closeSlip(slipId: string, staffId: string): Promise<RatingSlipDTO>;
     getActiveSlips(tableId: string): Promise<RatingSlipDTO[]>;
     getSlipDuration(slipId: string): Promise<DurationDTO>;
   }
   ```

3. **Implement State Machine**
   ```
   open ↔ paused → closed

   Valid transitions:
   - open → paused (pauseSlip)
   - paused → open (resumeSlip)
   - open → closed (closeSlip)
   - paused → closed (closeSlip)
   ```

4. **Implement Duration Calculation**
   ```typescript
   // Server-derived, not stored
   function calculateDuration(slip: RatingSlip): number {
     // Sum active periods (excluding paused intervals)
   }
   ```

5. **Implement Invariants**
   - No overlapping open slips for {player_id, table_id}
   - policy_snapshot captured at creation
   - game_settings captured at creation
   - seat_number required

6. **Create Factory and Tests**

**Validation Checklist**:
- [ ] Implements RatingSlipServiceInterface
- [ ] State machine enforced
- [ ] Duration calculation accurate
- [ ] Overlap prevention working
- [ ] policy_snapshot captured
- [ ] Test coverage ≥80%

---

### Step 2.4: VALIDATION GATE 2

🛑 **STOP: Phase 2 Completion Review**

**Skill**: `lead-architect`

**Gate Checklist**:

```
GATE-2: Session Management Validation

Services Implemented:
- [ ] VisitService
  - [ ] Implements VisitServiceInterface
  - [ ] Concurrent visit prevention
  - [ ] Seating operations
  - [ ] Test coverage ≥80%

- [ ] RatingSlipService
  - [ ] Implements RatingSlipServiceInterface
  - [ ] State machine correct
  - [ ] Duration calculation accurate
  - [ ] Overlap prevention
  - [ ] policy_snapshot captured
  - [ ] Test coverage ≥80%

RLS Policies:
- [ ] visit_read_same_casino deployed
- [ ] visit_write_pit_boss_admin deployed
- [ ] rating_slip_read_same_casino deployed
- [ ] rating_slip_write_telemetry_role deployed

Integration:
- [ ] E2E test for US-002 (Start Slip) passes
- [ ] E2E test for US-003 (Pause/Resume) passes
- [ ] E2E test for US-004 (Close Slip) passes

Performance:
- [ ] Slip operations reflect in UI within 2s
- [ ] Server action latency < 400ms (p95)
```

**Approval Required**: Proceed to Phase 3? (Reply "approved" to continue)

---

## Phase 3: Rewards & Compliance

### Step 3.1: Pre-Implementation Checklist

Before implementing Phase 3 services:

- [ ] GATE-2 passed
- [ ] Phase 2 services available
- [ ] Rating slip lifecycle working
- [ ] Idempotency patterns understood

### Step 3.2: LoyaltyService Implementation

**Skill**: `backend-service-builder`
**Spec Reference**: MVP-001 Section 3.1

**Implementation Steps**:

1. **Create Service Structure**
   ```
   services/loyalty/
   ├── index.ts
   ├── types.ts
   ├── loyalty.service.ts
   ├── dto.ts
   └── errors.ts
   ```

2. **Implement Interface**
   ```typescript
   export interface LoyaltyServiceInterface {
     getPlayerLoyalty(casinoId: string, playerId: string): Promise<PlayerLoyaltyDTO>;
     issueMidSessionReward(data: IssueMidSessionRewardDTO): Promise<LoyaltyLedgerEntryDTO>;
     getRewardsForSlip(ratingSlipId: string): Promise<LoyaltyLedgerEntryDTO[]>;
   }
   ```

3. **Implement RPC Wrapper**
   ```typescript
   async issueMidSessionReward(data: IssueMidSessionRewardDTO) {
     const { error, data: result } = await supabase.rpc('rpc_issue_mid_session_reward', {
       p_casino_id: data.casinoId,
       p_player_id: data.playerId,
       p_rating_slip_id: data.ratingSlipId,
       p_staff_id: data.staffId,
       p_points: data.points,
       p_idempotency_key: data.idempotencyKey,
       p_reason: data.reason,
     });
     // Handle idempotency - return existing if duplicate
   }
   ```

4. **Create Factory and Tests**

**Validation Checklist**:
- [ ] Implements LoyaltyServiceInterface
- [ ] Idempotency enforced
- [ ] Atomic ledger + balance update
- [ ] Audit fields captured
- [ ] Test coverage ≥80%

---

### Step 3.3: PlayerFinancialService Implementation (Feature-Flagged)

**Skill**: `backend-service-builder`
**Spec Reference**: MVP-001 Section 3.2

**Feature Flag**: `finance_minimal_enabled`

**Implementation Steps**:

1. **Create Service Structure**
   ```
   services/finance/
   ├── index.ts
   ├── types.ts
   ├── finance.service.ts
   ├── dto.ts
   └── errors.ts
   ```

2. **Implement Interface**
   ```typescript
   export interface PlayerFinancialServiceInterface {
     createTransaction(data: CreateTransactionDTO): Promise<FinancialTransactionDTO>;
     getTransactionsForPlayer(playerId: string, gamingDay?: string): Promise<FinancialTransactionDTO[]>;
   }
   ```

3. **Implement Feature Flag Check**
   ```typescript
   async createTransaction(data: CreateTransactionDTO) {
     if (!await isFeatureEnabled('finance_minimal_enabled')) {
       throw new FeatureDisabledError('FINANCE_FEATURE_DISABLED');
     }
     // Implementation
   }
   ```

4. **Implement RPC Wrapper with Gaming Day Derivation**

5. **Create Factory and Tests**

**Validation Checklist**:
- [ ] Implements PlayerFinancialServiceInterface
- [ ] Feature flag gating working
- [ ] Gaming day server-derived
- [ ] Idempotency enforced
- [ ] Test coverage ≥80%

---

### Step 3.4: MTLService Implementation (Read-Only)

**Skill**: `backend-service-builder`
**Spec Reference**: MVP-001 Section 3.3

**Implementation Steps**:

1. **Create Service Structure**
   ```
   services/mtl/
   ├── index.ts
   ├── types.ts
   ├── mtl.service.ts
   ├── dto.ts
   └── errors.ts
   ```

2. **Implement Interface (Read-Only)**
   ```typescript
   export interface MTLServiceInterface {
     getRecentEntries(casinoId: string, limit?: number): Promise<MTLEntryDTO[]>;
     getThresholdProximity(playerId: string): Promise<ThresholdProximityDTO>;
   }
   ```

3. **Create Factory and Tests**

**Validation Checklist**:
- [ ] Implements MTLServiceInterface
- [ ] Read-only (no write methods)
- [ ] Threshold proximity calculation working
- [ ] Test coverage ≥80%

---

### Step 3.5: VALIDATION GATE 3

🛑 **STOP: Phase 3 Completion Review**

**Skill**: `lead-architect`

**Gate Checklist**:

```
GATE-3: Rewards & Compliance Validation

Services Implemented:
- [ ] LoyaltyService
  - [ ] Implements LoyaltyServiceInterface
  - [ ] Idempotency enforced
  - [ ] Atomic operations
  - [ ] Test coverage ≥80%

- [ ] PlayerFinancialService
  - [ ] Implements PlayerFinancialServiceInterface
  - [ ] Feature flag working
  - [ ] Gaming day derived
  - [ ] Test coverage ≥80%

- [ ] MTLService
  - [ ] Implements MTLServiceInterface
  - [ ] Read-only enforced
  - [ ] Test coverage ≥80%

RPC Functions:
- [ ] rpc_issue_mid_session_reward deployed
- [ ] rpc_create_financial_txn deployed

RLS Policies:
- [ ] player_loyalty_read_same_casino deployed
- [ ] loyalty_ledger_append_only deployed
- [ ] player_financial_transaction_append_only deployed
- [ ] mtl_entry_read_compliance_roles deployed

Integration:
- [ ] E2E test for US-005 (Mid-Session Reward) passes
- [ ] E2E test for US-006 (Finance Entry) passes
- [ ] Zero duplicate rewards under retry (idempotency test)

Performance:
- [ ] All operations < 400ms (p95)
```

**Approval Required**: Proceed to MVP Integration? (Reply "approved" to continue)

---

## Final MVP Validation (GATE-4)

🛑 **STOP: MVP Completion Review**

**Skill**: `lead-architect`

**Gate Checklist**:

```
GATE-4: MVP Integration Validation

All Services Operational:
- [ ] CasinoService
- [ ] PlayerService
- [ ] TableContextService
- [ ] VisitService
- [ ] RatingSlipService
- [ ] LoyaltyService
- [ ] PlayerFinancialService (feature-flagged)
- [ ] MTLService (read-only)

All User Stories Passing:
- [ ] US-001: Open a Table
- [ ] US-002: Start a Rating Slip
- [ ] US-003: Pause/Resume Slip
- [ ] US-004: Close Slip
- [ ] US-005: Mid-Session Reward
- [ ] US-006: Basic Finance Entry (FF)
- [ ] MTL Read-Only

PRD KPIs Met:
- [ ] Pit dashboard LCP ≤ 2.5s
- [ ] Slip ops reflect in UI within 2s
- [ ] Server action latency < 400ms (p95)
- [ ] Zero duplicate rewards

Quality:
- [ ] All tests passing
- [ ] Coverage ≥80% per service
- [ ] No type-check errors
- [ ] No lint errors

Documentation:
- [ ] Service READMEs created
- [ ] API contracts documented
- [ ] RLS policy matrix updated
```

---

## Post-MVP: Pilot Readiness (GATE-5)

🛑 **STOP: Pilot Readiness Review**

**Gate Checklist**:

```
GATE-5: Pilot Readiness

Operational Readiness:
- [ ] Runbooks created
- [ ] Dashboards configured
- [ ] Alerts set up
- [ ] Feature flags configured

Pilot Environment:
- [ ] Single casino configured
- [ ] Staff accounts provisioned
- [ ] Test data seeded
- [ ] Rollback plan documented

Go/No-Go Criteria:
- [ ] Full shift simulation passed
- [ ] Zero "stuck" rating slips
- [ ] Accurate accrued seconds
- [ ] Idempotent rewards verified
- [ ] Audit trails complete
```

**MVP Status**: Ready for Pilot

---

## Troubleshooting

### Service Implementation Issues

**Problem**: ReturnType inference detected

**Solution**:
```typescript
// ❌ WRONG
export function createService() {
  return { ... };
}
type ServiceType = ReturnType<typeof createService>;

// ✅ CORRECT
export interface ServiceInterface {
  method(): Promise<Result>;
}
export function createService(): ServiceInterface {
  return { ... };
}
```

**Problem**: Type-check fails after migration

**Solution**:
```bash
npm run db:types
npm run type-check
```

**Problem**: RLS policy blocking access

**Solution**:
1. Verify `SET LOCAL app.casino_id` is set
2. Check staff.user_id matches auth.uid()
3. Review RLS policy conditions

### Workflow Issues

**Problem**: Gate validation failing

**Solution**:
1. Review checklist items
2. Run test suite: `npm test`
3. Check specific service tests
4. Review error logs

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-25 | Initial MVP implementation workflow |

---

**Workflow Status**: Production Ready
**Spec Reference**: `.claude/specs/MVP-001-implementation-roadmap.spec.md`
**PRD Reference**: `docs/10-prd/PRD-001_Player_Management_System_Requirements.md`

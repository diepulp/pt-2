# Complex Service Patterns - Quick Reference

**Source**: Extracted from SRM v3.0.2, DTO Canonical Standard, and BALANCED_ARCHITECTURE_QUICK.md

---

## What Makes a Service "Complex"?

Complex services handle:
- **Multi-step workflows** (e.g., MTL entry creation with audit notes, state transitions)
- **Business rule enforcement** (e.g., Loyalty reward calculations, financial transaction validation)
- **State machines** (e.g., Visit lifecycle: open → active → completed)
- **Transaction coordination** (e.g., Finance: debit/credit with ledger updates)
- **Event publishing** (e.g., Outbox pattern for domain events)

### Complex Services in PT-2

| Service | Domain | Complexity Indicators |
|---------|--------|----------------------|
| **Loyalty** | Comp points & rewards | Mid-session reward calculations, ledger management, outbox pattern |
| **Finance** | Financial transactions | Multi-table coordination, idempotency, outbox pattern |
| **MTL** | Multiple Transaction Log | Compliance workflow, audit notes, state machine |
| **TableContext** | Gaming tables & chip custody | Fill/credit/drop workflows, inventory snapshots, temporal queries |

---

## Core Patterns

### Pattern 1: Transaction Coordination

**Use when**: Multiple tables must be updated atomically

**Example (from Finance service)**:
```typescript
export interface FinanceService {
  async recordTransaction(input: TransactionInput): Promise<TransactionResult> {
    // Start transaction scope
    try {
      // Step 1: Insert primary record
      const { data: transaction, error: txError } = await supabase
        .from('player_financial_transaction')
        .insert({
          player_id: input.player_id,
          amount: input.amount,
          transaction_type: input.type,
          correlation_id: input.correlation_id
        })
        .select()
        .single();

      if (txError) throw txError;

      // Step 2: Update related state (ledger, outbox, etc.)
      const { error: outboxError } = await supabase
        .from('finance_outbox')
        .insert({
          event_type: 'transaction_recorded',
          payload: transaction,
          correlation_id: input.correlation_id
        });

      if (outboxError) {
        // Rollback logic or compensating transaction
        throw outboxError;
      }

      return { success: true, transaction_id: transaction.id };
    } catch (error) {
      // Error handling with proper context
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }
}
```

**Key Points**:
- Use try/catch for transaction safety
- Propagate `correlation_id` through all operations
- Consider rollback/compensation for partial failures
- Validate inputs before starting transaction

---

### Pattern 2: Outbox Pattern (Event Publishing)

**Use when**: Service needs to publish domain events reliably

**Tables**: `{service}_outbox` (e.g., `loyalty_outbox`, `finance_outbox`)

**Example (from Loyalty service)**:
```typescript
export interface LoyaltyService {
  async awardPoints(input: AwardPointsInput): Promise<AwardPointsResult> {
    // Business logic + outbox in same transaction
    const { data: ledgerEntry, error: ledgerError } = await supabase
      .from('loyalty_ledger')
      .insert({
        player_id: input.player_id,
        points_change: input.points,
        reason: input.reason,
        correlation_id: input.correlation_id
      })
      .select()
      .single();

    if (ledgerError) throw ledgerError;

    // Publish event via outbox
    await supabase.from('loyalty_outbox').insert({
      event_type: 'points_awarded',
      payload: ledgerEntry,
      correlation_id: input.correlation_id,
      published_at: null // Processor will update when sent
    });

    return { success: true, ledger_entry_id: ledgerEntry.id };
  }
}
```

**Key Points**:
- Insert outbox record in same transaction as primary operation
- Include `correlation_id` for traceability
- Use `published_at: null` for pending events
- Background processor handles actual publishing

---

### Pattern 3: State Machine Workflows

**Use when**: Entity has lifecycle states with allowed transitions

**Example (from Visit service)**:
```typescript
export interface VisitService {
  async transitionVisit(
    visitId: string,
    toState: VisitState
  ): Promise<VisitDTO> {
    // Step 1: Get current state
    const { data: visit, error } = await supabase
      .from('visit')
      .select('*')
      .eq('id', visitId)
      .single();

    if (error || !visit) throw new Error('Visit not found');

    // Step 2: Validate transition
    const allowedTransitions: Record<VisitState, VisitState[]> = {
      'open': ['active', 'cancelled'],
      'active': ['completed', 'suspended'],
      'suspended': ['active', 'cancelled'],
      'completed': [], // Terminal state
      'cancelled': []  // Terminal state
    };

    const currentState = visit.status as VisitState;
    if (!allowedTransitions[currentState].includes(toState)) {
      throw new Error(
        `Invalid transition: ${currentState} → ${toState}`
      );
    }

    // Step 3: Execute transition
    const { data: updated, error: updateError } = await supabase
      .from('visit')
      .update({ status: toState, updated_at: new Date().toISOString() })
      .eq('id', visitId)
      .select()
      .single();

    if (updateError) throw updateError;

    return updated;
  }
}
```

**Key Points**:
- Define allowed transitions explicitly
- Validate current state before transition
- Use enum types for states
- Consider audit trail for state changes

---

### Pattern 4: Multi-Step Business Logic

**Use when**: Operation involves calculations, validations, and multiple DB ops

**Example (from Loyalty: Mid-Session Reward Calculation)**:
```typescript
export interface LoyaltyService {
  async calculateMidSessionReward(
    ratingSlipId: string
  ): Promise<RewardCalculationResult> {
    // Step 1: Gather inputs (cross-context DTO consumption)
    const telemetry = await ratingSlipService.getTelemetry(ratingSlipId);
    const settings = await casinoService.getSettings(telemetry.casino_id);

    // Step 2: Apply business rules
    const eligibleForReward =
      telemetry.duration_seconds >= settings.min_play_duration &&
      telemetry.average_bet >= settings.min_bet_threshold;

    if (!eligibleForReward) {
      return { eligible: false, points_awarded: 0 };
    }

    // Step 3: Calculate reward
    const points = Math.floor(
      telemetry.average_bet *
      telemetry.duration_seconds *
      settings.reward_multiplier
    );

    // Step 4: Record ledger entry
    const { data: ledgerEntry, error } = await supabase
      .from('loyalty_ledger')
      .insert({
        player_id: telemetry.player_id,
        points_change: points,
        reason: 'mid_session_reward',
        rating_slip_id: ratingSlipId,
        correlation_id: telemetry.correlation_id
      })
      .select()
      .single();

    if (error) throw error;

    return {
      eligible: true,
      points_awarded: points,
      ledger_entry_id: ledgerEntry.id
    };
  }
}
```

**Key Points**:
- Break logic into clear steps
- Consume cross-context DTOs (don't reach into other services' tables)
- Extract business constants to settings/config
- Return structured results (not just boolean)

---

### Pattern 5: Idempotency for Mutations

**Use when**: Operations must be safely retryable

**Example (using idempotency_key)**:
```typescript
export interface FinanceService {
  async createTransaction(
    input: TransactionInput,
    idempotencyKey: string
  ): Promise<TransactionResult> {
    // Check if already processed
    const { data: existing } = await supabase
      .from('player_financial_transaction')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existing) {
      // Return previous result (idempotent)
      return { success: true, transaction_id: existing.id };
    }

    // Process new request
    const { data: transaction, error } = await supabase
      .from('player_financial_transaction')
      .insert({
        ...input,
        idempotency_key: idempotencyKey
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, transaction_id: transaction.id };
  }
}
```

**Key Points**:
- Require `idempotency_key` for all mutations
- Check for existing operation first
- Return same result for duplicate requests
- Store key with primary record

---

## Error Handling Strategies

### Strategy 1: Structured Error Types

```typescript
// Define domain-specific error types
class BusinessRuleViolationError extends Error {
  constructor(message: string, public rule: string, public context: any) {
    super(message);
    this.name = 'BusinessRuleViolationError';
  }
}

class InsufficientFundsError extends BusinessRuleViolationError {
  constructor(playerId: string, requested: number, available: number) {
    super(
      `Insufficient funds for player ${playerId}`,
      'balance_check',
      { requested, available }
    );
  }
}

// Use in service
export interface FinanceService {
  async debit(playerId: string, amount: number): Promise<void> {
    const balance = await this.getBalance(playerId);

    if (balance < amount) {
      throw new InsufficientFundsError(playerId, amount, balance);
    }

    // Proceed with debit...
  }
}
```

### Strategy 2: Result Types (for complex error scenarios)

```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export interface LoyaltyService {
  async redeemPoints(
    playerId: string,
    points: number
  ): Promise<Result<RedemptionDTO, RedemptionError>> {
    // Validate points balance
    const balance = await this.getBalance(playerId);

    if (balance < points) {
      return {
        success: false,
        error: new InsufficientPointsError(playerId, points, balance)
      };
    }

    // Process redemption
    const { data, error } = await supabase.from('loyalty_ledger').insert({
      player_id: playerId,
      points_change: -points,
      reason: 'redemption'
    }).select().single();

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };
  }
}
```

---

## Testing Patterns for Complex Services

### Test 1: Business Rule Validation

```typescript
describe('LoyaltyService - Mid-Session Rewards', () => {
  it('should enforce minimum play duration', async () => {
    const service = createLoyaltyService(supabase);

    const result = await service.calculateMidSessionReward({
      duration_seconds: 60, // Below minimum (120)
      average_bet: 10,
      casino_id: 'test-casino'
    });

    expect(result.eligible).toBe(false);
    expect(result.points_awarded).toBe(0);
  });
});
```

### Test 2: State Machine Transitions

```typescript
describe('VisitService - State Transitions', () => {
  it('should prevent invalid state transitions', async () => {
    const service = createVisitService(supabase);

    // Setup: Create visit in 'completed' state
    const visit = await service.createVisit({
      player_id: 'test-player',
      casino_id: 'test-casino'
    });

    await service.transitionVisit(visit.id, 'completed');

    // Attempt invalid transition from terminal state
    await expect(
      service.transitionVisit(visit.id, 'active')
    ).rejects.toThrow('Invalid transition');
  });
});
```

### Test 3: Transaction Atomicity

```typescript
describe('FinanceService - Transaction Coordination', () => {
  it('should rollback on partial failure', async () => {
    const service = createFinanceService(supabase);

    // Mock outbox failure
    vi.spyOn(supabase, 'from').mockImplementationOnce(() => {
      throw new Error('Outbox insert failed');
    });

    await expect(
      service.recordTransaction({
        player_id: 'test-player',
        amount: 100,
        type: 'credit'
      })
    ).rejects.toThrow();

    // Verify no transaction record was created
    const { data } = await supabase
      .from('player_financial_transaction')
      .select('*')
      .eq('player_id', 'test-player');

    expect(data).toHaveLength(0);
  });
});
```

---

## Observability & Telemetry

### Pattern: Correlation ID Propagation

```typescript
export interface ComplexService {
  async performOperation(
    input: OperationInput,
    correlationId: string
  ): Promise<OperationResult> {
    // Set correlation ID in database session
    await supabase.rpc('set_correlation_id', { correlation_id: correlationId });

    // All subsequent operations inherit correlation ID
    const result = await supabase
      .from('operation_log')
      .insert({
        operation_type: input.type,
        // correlation_id auto-populated by trigger
      });

    return result;
  }
}
```

### Pattern: Structured Logging

```typescript
export interface AuditableService {
  async performMutation(input: MutationInput): Promise<void> {
    const before = await this.getCurrentState(input.entityId);

    // Perform mutation
    const after = await this.executeUpdate(input);

    // Emit structured audit log
    await supabase.from('audit_log').insert({
      domain: 'loyalty',
      action: 'points_awarded',
      actor_id: input.actorId,
      casino_id: input.casinoId,
      dto_before: JSON.stringify(before),
      dto_after: JSON.stringify(after),
      correlation_id: input.correlationId,
      timestamp: new Date().toISOString()
    });
  }
}
```

---

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Direct Cross-Context Table Access

```typescript
// WRONG
import type { Database } from '@/types/database.types';

export interface LoyaltyService {
  async calculateReward(ratingSlipId: string): Promise<number> {
    // ❌ Reaching into RatingSlip service's table directly
    const { data: slip } = await supabase
      .from('rating_slip') // ← NOT OWNED by Loyalty service
      .select('*')
      .eq('id', ratingSlipId)
      .single();

    return slip.average_bet * 0.01;
  }
}
```

**Fix**: Use cross-context DTO consumption
```typescript
// CORRECT
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';

export interface LoyaltyService {
  async calculateReward(
    telemetry: RatingSlipTelemetryDTO // ← Consume DTO from owning service
  ): Promise<number> {
    return telemetry.average_bet * 0.01;
  }
}
```

### ❌ Anti-Pattern 2: Missing Error Handling

```typescript
// WRONG
export interface FinanceService {
  async debit(playerId: string, amount: number): Promise<void> {
    // ❌ No error handling
    await supabase.from('player_financial_transaction').insert({
      player_id: playerId,
      amount: -amount,
      transaction_type: 'debit'
    });
  }
}
```

**Fix**: Always handle errors
```typescript
// CORRECT
export interface FinanceService {
  async debit(playerId: string, amount: number): Promise<void> {
    const { data, error } = await supabase
      .from('player_financial_transaction')
      .insert({
        player_id: playerId,
        amount: -amount,
        transaction_type: 'debit'
      });

    if (error) {
      throw new Error(`Debit failed: ${error.message}`);
    }
  }
}
```

### ❌ Anti-Pattern 3: Magic Numbers

```typescript
// WRONG
export interface LoyaltyService {
  async calculateReward(bet: number): Promise<number> {
    return bet * 0.01; // ❌ What is 0.01? Why this value?
  }
}
```

**Fix**: Extract to named constants
```typescript
// CORRECT
const REWARD_MULTIPLIER = 0.01; // 1% of average bet

export interface LoyaltyService {
  async calculateReward(bet: number): Promise<number> {
    return bet * REWARD_MULTIPLIER;
  }
}
```

---

## Checklist for Complex Services

Before shipping a complex service, verify:

- [ ] **Functional factory pattern** (no classes)
- [ ] **Explicit interface** (not ReturnType inference)
- [ ] **Typed Supabase client** (`SupabaseClient<Database>`)
- [ ] **DTO exports** for all owned tables
- [ ] **Cross-context DTOs** consumed via public exports (no direct table access)
- [ ] **Error handling** on all database operations
- [ ] **Transaction coordination** for multi-step mutations
- [ ] **Outbox pattern** for domain events (if applicable)
- [ ] **State machine validation** for entity lifecycles (if applicable)
- [ ] **Idempotency** for mutations (using `idempotency_key`)
- [ ] **Correlation ID propagation** for observability
- [ ] **Business rule validation** with clear error messages
- [ ] **Test coverage** for happy path + error scenarios
- [ ] **No magic numbers** (extract to constants/settings)

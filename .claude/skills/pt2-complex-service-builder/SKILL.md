---
name: pt2-complex-service-builder
description: Build complex business logic services (Loyalty, Finance, MTL, TableContext) following PT-2 patterns for multi-step workflows, state machines, transaction coordination, outbox patterns, and business rule enforcement. This skill should be used when creating or modifying services that handle complex domain logic beyond simple CRUD operations, including automated validation and reference documentation for compliance checking.
license: MIT
version: "1.0.0"
---

# PT-2 Complex Service Builder

Build complex business logic services following PT-2 architectural patterns with automated validation, reference documentation, and specialized workflows for multi-step operations.

## When to Use This Skill

Use this skill when creating or modifying services that handle:

- **Multi-step business workflows** (e.g., MTL entry creation with audit notes)
- **State machines** (e.g., Visit lifecycle: open → active → completed)
- **Transaction coordination** (e.g., Finance: debit/credit with ledger updates)
- **Event publishing** (e.g., Outbox pattern for domain events)
- **Business rule enforcement** (e.g., Loyalty reward calculations with validation)

### Complex Services in PT-2

| Service | Domain | Complexity Indicators |
|---------|--------|----------------------|
| **Loyalty** | Comp points & rewards | Mid-session calculations, ledger, outbox |
| **Finance** | Financial transactions | Multi-table coordination, idempotency, outbox |
| **MTL** | Multiple Transaction Log | Compliance workflow, audit notes, state machine |
| **TableContext** | Gaming tables & chip custody | Fill/credit/drop workflows, inventory snapshots |

## Decision Tree: Should You Use This Skill?

```
START: Is the service doing more than simple CRUD?
│
├─ NO → Use pt2-service-builder (general service creation)
│
└─ YES → Does it have ANY of these characteristics?
    │
    ├─ Multi-step workflows with dependencies?
    ├─ State machine / lifecycle management?
    ├─ Transaction coordination across tables?
    ├─ Business rule calculations?
    ├─ Event publishing requirements?
    │
    └─ YES to any → ✅ USE THIS SKILL
```

## Quick Start

### Step 1: Identify Bounded Context

Before creating a complex service, identify its bounded context and table ownership from the Service Responsibility Matrix (SRM).

**Reference**: `references/bounded_context_rules.md` for full ownership matrix

**Quick lookup**:
- **Loyalty**: `player_loyalty`, `loyalty_ledger`, `loyalty_outbox`
- **Finance**: `player_financial_transaction`, `finance_outbox`
- **MTL**: `mtl_entry`, `mtl_audit_note`
- **TableContext**: `gaming_table`, `gaming_table_settings`, `dealer_rotation`, chip custody tables

### Step 2: Choose Service Pattern

Determine which complexity pattern(s) the service needs:

| Pattern | When to Use | Example Service |
|---------|-------------|-----------------|
| **Transaction Coordination** | Multiple tables updated atomically | Finance |
| **Outbox Pattern** | Domain events must be published reliably | Loyalty, Finance |
| **State Machine** | Entity has lifecycle with allowed transitions | Visit, MTL |
| **Multi-Step Business Logic** | Calculations, validations, cross-context data | Loyalty (rewards) |
| **Idempotency** | Operations must be safely retryable | Finance, MTL |

**Reference**: `references/complex_service_patterns.md` for detailed pattern implementations

### Step 3: Create Service Structure

Use the pt2-service-builder scaffold as a starting point, then enhance with complex patterns:

```bash
# Generate base structure
npx tsx .claude/skills/pt2-service-builder/scripts/generate-service-stub.ts loyalty

# Service directory created:
# services/loyalty/
#   ├── index.ts         (service factory)
#   ├── dtos.ts          (DTO exports)
#   ├── types.ts         (internal types)
#   └── __tests__/       (service tests)
```

## Building a Complex Service: Step-by-Step Workflow

### Workflow Step 1: Define DTOs (Contract-First)

For complex services, use a **hybrid DTO strategy**:

1. **Canonical DTOs** for owned tables (derive from `database.types.ts`)
2. **Contract-First DTOs** for complex business operations (explicit interfaces)

**Example (Loyalty Service)**:

```typescript
// services/loyalty/dtos.ts
import type { Database } from '@/types/database.types';

// ============================================================================
// TABLE OWNERSHIP: player_loyalty, loyalty_ledger, loyalty_outbox
// Reference: SRM v3.0.2 §1061-1274
// ============================================================================

// 1. CANONICAL DTOs (owned tables)
export type PlayerLoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];
export type PlayerLoyaltyInsert = Database['public']['Tables']['player_loyalty']['Insert'];
export type PlayerLoyaltyUpdate = Database['public']['Tables']['player_loyalty']['Update'];

export interface PlayerLoyaltyDTO extends PlayerLoyaltyRow {
  // Add computed fields if needed
}

export type LoyaltyLedgerRow = Database['public']['Tables']['loyalty_ledger']['Row'];

export interface LoyaltyLedgerEntryDTO extends LoyaltyLedgerRow {
  // Business-friendly interface
}

// 2. CONTRACT-FIRST DTOs (complex operations)
export interface CalculateMidSessionRewardInput {
  rating_slip_id: string;
  casino_id: string;
  correlation_id: string;
}

export interface CalculateMidSessionRewardOutput {
  eligible: boolean;
  points_awarded: number;
  ledger_entry_id: string | null;
  reason?: string;
}

export interface AwardPointsInput {
  player_id: string;
  casino_id: string;
  points: number;
  reason: 'wager' | 'mid_session_reward' | 'manual_adjustment';
  correlation_id: string;
  idempotency_key: string;
}

export interface AwardPointsOutput {
  success: boolean;
  ledger_entry_id: string;
  new_balance: number;
}
```

**Key Points**:
- Export DTOs for **all owned tables** (canonical)
- Define explicit interfaces for **business operations** (contract-first)
- Include `correlation_id` and `idempotency_key` in mutation inputs

### Workflow Step 2: Implement Service Interface

Define the service interface with explicit method signatures:

```typescript
// services/loyalty/index.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// Import own DTOs
import type {
  PlayerLoyaltyDTO,
  LoyaltyLedgerEntryDTO,
  CalculateMidSessionRewardInput,
  CalculateMidSessionRewardOutput,
  AwardPointsInput,
  AwardPointsOutput
} from './dtos';

// Cross-context DTO imports (ALLOWED)
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
import type { VisitDTO } from '@/services/visit/dtos';

// ============================================================================
// LOYALTY SERVICE (Bounded Context: Comp Points & Rewards)
// Reference: SRM v3.0.2 §1061-1274
// ============================================================================

export interface LoyaltyService {
  // Simple CRUD operations
  getPlayerLoyalty(playerId: string): Promise<PlayerLoyaltyDTO | null>;
  getLedgerEntries(playerId: string, limit?: number): Promise<LoyaltyLedgerEntryDTO[]>;

  // Complex business logic operations
  calculateMidSessionReward(
    input: CalculateMidSessionRewardInput
  ): Promise<CalculateMidSessionRewardOutput>;

  awardPoints(input: AwardPointsInput): Promise<AwardPointsOutput>;
  redeemPoints(playerId: string, points: number, idempotencyKey: string): Promise<AwardPointsOutput>;
}
```

### Workflow Step 3: Implement Complex Patterns

Implement the service factory with complex patterns based on Step 2 pattern selection.

#### Pattern: Transaction Coordination

```typescript
export function createLoyaltyService(
  supabase: SupabaseClient<Database>
): LoyaltyService {
  return {
    async awardPoints(input: AwardPointsInput): Promise<AwardPointsOutput> {
      // Check idempotency first
      const { data: existing } = await supabase
        .from('loyalty_ledger')
        .select('*')
        .eq('idempotency_key', input.idempotency_key)
        .single();

      if (existing) {
        // Idempotent: return previous result
        return {
          success: true,
          ledger_entry_id: existing.id,
          new_balance: existing.balance_after
        };
      }

      try {
        // Step 1: Get current loyalty state
        const { data: loyalty, error: loyaltyError } = await supabase
          .from('player_loyalty')
          .select('*')
          .eq('player_id', input.player_id)
          .eq('casino_id', input.casino_id)
          .single();

        if (loyaltyError) throw loyaltyError;

        const newBalance = loyalty.points_balance + input.points;

        // Step 2: Insert ledger entry
        const { data: ledgerEntry, error: ledgerError } = await supabase
          .from('loyalty_ledger')
          .insert({
            player_id: input.player_id,
            casino_id: input.casino_id,
            points_change: input.points,
            balance_after: newBalance,
            reason: input.reason,
            correlation_id: input.correlation_id,
            idempotency_key: input.idempotency_key
          })
          .select()
          .single();

        if (ledgerError) throw ledgerError;

        // Step 3: Update loyalty balance
        const { error: updateError } = await supabase
          .from('player_loyalty')
          .update({
            points_balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', loyalty.id);

        if (updateError) throw updateError;

        // Step 4: Publish event via outbox
        await supabase.from('loyalty_outbox').insert({
          event_type: 'points_awarded',
          payload: ledgerEntry,
          correlation_id: input.correlation_id,
          published_at: null
        });

        return {
          success: true,
          ledger_entry_id: ledgerEntry.id,
          new_balance: newBalance
        };
      } catch (error) {
        throw new Error(`Award points failed: ${error.message}`);
      }
    }
  };
}
```

#### Pattern: Multi-Step Business Logic

```typescript
async calculateMidSessionReward(
  input: CalculateMidSessionRewardInput
): Promise<CalculateMidSessionRewardOutput> {
  // Step 1: Gather cross-context data (via DTOs)
  const { data: telemetry } = await supabase
    .rpc('get_rating_slip_telemetry', { slip_id: input.rating_slip_id });

  if (!telemetry) {
    return { eligible: false, points_awarded: 0, ledger_entry_id: null };
  }

  // Step 2: Get casino settings
  const { data: settings } = await supabase
    .from('casino_settings')
    .select('min_play_duration, min_bet_threshold, reward_multiplier')
    .eq('casino_id', input.casino_id)
    .single();

  // Step 3: Apply business rules
  const eligible =
    telemetry.duration_seconds >= settings.min_play_duration &&
    telemetry.average_bet >= settings.min_bet_threshold;

  if (!eligible) {
    return {
      eligible: false,
      points_awarded: 0,
      ledger_entry_id: null,
      reason: 'Below minimum thresholds'
    };
  }

  // Step 4: Calculate reward
  const points = Math.floor(
    telemetry.average_bet * telemetry.duration_seconds * settings.reward_multiplier
  );

  // Step 5: Award points (calls awardPoints method)
  const result = await this.awardPoints({
    player_id: telemetry.player_id,
    casino_id: input.casino_id,
    points,
    reason: 'mid_session_reward',
    correlation_id: input.correlation_id,
    idempotency_key: `mid-session-${input.rating_slip_id}`
  });

  return {
    eligible: true,
    points_awarded: points,
    ledger_entry_id: result.ledger_entry_id
  };
}
```

### Workflow Step 4: Add Error Handling & Validation

Complex services require robust error handling:

```typescript
// Define business-specific error types
class BusinessRuleViolationError extends Error {
  constructor(message: string, public rule: string, public context: any) {
    super(message);
    this.name = 'BusinessRuleViolationError';
  }
}

class InsufficientPointsError extends BusinessRuleViolationError {
  constructor(playerId: string, requested: number, available: number) {
    super(
      `Insufficient points for player ${playerId}`,
      'points_balance_check',
      { requested, available }
    );
  }
}

// Use in service methods
async redeemPoints(
  playerId: string,
  points: number,
  idempotencyKey: string
): Promise<AwardPointsOutput> {
  const { data: loyalty } = await supabase
    .from('player_loyalty')
    .select('*')
    .eq('player_id', playerId)
    .single();

  if (!loyalty || loyalty.points_balance < points) {
    throw new InsufficientPointsError(
      playerId,
      points,
      loyalty?.points_balance || 0
    );
  }

  // Proceed with redemption...
  return this.awardPoints({
    player_id: playerId,
    casino_id: loyalty.casino_id,
    points: -points, // Negative for redemption
    reason: 'redemption',
    correlation_id: `redemption-${Date.now()}`,
    idempotency_key: idempotencyKey
  });
}
```

### Workflow Step 5: Write Tests for Complex Logic

Complex services require comprehensive test coverage:

```typescript
// services/loyalty/__tests__/index.test.ts
import { createClient } from '@supabase/supabase-js';
import { createLoyaltyService } from '../index';
import type { Database } from '@/types/database.types';

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

describe('LoyaltyService - Complex Logic', () => {
  const service = createLoyaltyService(supabase);

  describe('calculateMidSessionReward', () => {
    it('should enforce minimum play duration', async () => {
      const result = await service.calculateMidSessionReward({
        rating_slip_id: 'test-slip',
        casino_id: 'test-casino',
        correlation_id: 'test-corr-id'
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('minimum');
    });

    it('should calculate reward correctly', async () => {
      // Setup: Create rating slip with qualifying telemetry
      // ...

      const result = await service.calculateMidSessionReward({
        rating_slip_id: 'qualifying-slip',
        casino_id: 'test-casino',
        correlation_id: 'test-corr-id'
      });

      expect(result.eligible).toBe(true);
      expect(result.points_awarded).toBeGreaterThan(0);
      expect(result.ledger_entry_id).toBeTruthy();
    });
  });

  describe('awardPoints - Idempotency', () => {
    it('should return same result for duplicate requests', async () => {
      const input = {
        player_id: 'test-player',
        casino_id: 'test-casino',
        points: 100,
        reason: 'manual_adjustment' as const,
        correlation_id: 'test-corr',
        idempotency_key: 'unique-key-123'
      };

      const result1 = await service.awardPoints(input);
      const result2 = await service.awardPoints(input); // Duplicate

      expect(result1.ledger_entry_id).toBe(result2.ledger_entry_id);
      expect(result1.new_balance).toBe(result2.new_balance);
    });
  });

  describe('redeemPoints - Business Rules', () => {
    it('should reject redemption exceeding balance', async () => {
      await expect(
        service.redeemPoints('test-player', 10000, 'test-key')
      ).rejects.toThrow(InsufficientPointsError);
    });
  });
});
```

### Workflow Step 6: Validate Service Compliance

Run automated validation scripts to ensure compliance with PT-2 standards:

#### Validation Script 1: Service Structure

```bash
# Validate functional factory pattern, type safety, DTOs
python3 scripts/validate_service_structure.py services/loyalty
```

**Checks**:
- ✅ Functional factory pattern (no classes)
- ✅ Explicit interfaces (no ReturnType inference)
- ✅ Typed Supabase client (`SupabaseClient<Database>`)
- ✅ DTO exports for owned tables
- ✅ No global state

#### Validation Script 2: Business Logic Patterns

```bash
# Validate complex patterns: transactions, outbox, state machines
python3 scripts/validate_business_logic.py services/loyalty
```

**Checks**:
- ✅ Transaction error handling
- ✅ Outbox pattern usage (for Loyalty, Finance, MTL)
- ✅ State machine transition validation
- ✅ Error handling on DB operations
- ✅ Business rule validation
- ✅ Multi-step workflow observability

#### Validation Script 3: Bounded Context Compliance

```bash
# Check DTO exports and cross-context violations
npx tsx .claude/skills/pt2-dto-validator/scripts/check-dto-exports.ts
npx tsx .claude/skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts
```

**Checks**:
- ✅ All owned tables have DTO exports
- ✅ No direct cross-context table access
- ✅ ESLint `no-cross-context-db-imports` passes

## Bundled Resources

### scripts/

This skill includes two automated validation scripts:

#### `validate_service_structure.py`

Validates PT-2 architectural standards for complex services.

**Usage**:
```bash
python3 .claude/skills/pt2-complex-service-builder/scripts/validate_service_structure.py services/loyalty
```

**Validates**:
- Functional factory pattern (not classes)
- Explicit interfaces (not ReturnType)
- SupabaseClient<Database> typing
- DTO exports present
- No global singletons

#### `validate_business_logic.py`

Analyzes complex service patterns and best practices.

**Usage**:
```bash
python3 .claude/skills/pt2-complex-service-builder/scripts/validate_business_logic.py services/loyalty
```

**Analyzes**:
- Transaction coordination patterns
- Outbox pattern usage
- State machine validation
- Error handling completeness
- Business rule patterns
- Multi-step workflow observability

### references/

This skill bundles focused reference documentation extracted from SRM and architectural docs:

#### `complex_service_patterns.md`

Complete pattern library for complex services:
- Transaction Coordination
- Outbox Pattern
- State Machine Workflows
- Multi-Step Business Logic
- Idempotency
- Error Handling Strategies
- Testing Patterns
- Observability & Telemetry
- Anti-Patterns to Avoid

**When to load**: When implementing complex patterns or troubleshooting architecture issues.

#### `bounded_context_rules.md`

Table ownership matrix and cross-context DTO consumption rules:
- Table Ownership Matrix (Loyalty, Finance, MTL, TableContext)
- Cross-Context DTO Consumption Rules
- DTO Export Requirements with Examples
- Validation Tools & ESLint Rules
- Common Violations & Fixes

**When to load**: When defining DTOs, validating bounded context compliance, or resolving ESLint violations.

## Success Criteria

Before shipping a complex service, verify:

- [ ] **Service follows functional factory pattern** (no classes)
- [ ] **Explicit interfaces defined** (no ReturnType inference)
- [ ] **SupabaseClient<Database> typed correctly**
- [ ] **DTOs exported for all owned tables** in `dtos.ts`
- [ ] **Cross-context DTOs consumed via public exports** (no direct table access)
- [ ] **Error handling on all database operations**
- [ ] **Transaction coordination for multi-step mutations**
- [ ] **Outbox pattern for domain events** (if applicable)
- [ ] **State machine validation for entity lifecycles** (if applicable)
- [ ] **Idempotency for mutations** (using `idempotency_key`)
- [ ] **Correlation ID propagation** for observability
- [ ] **Business rule validation** with clear error messages
- [ ] **Test coverage** for happy path + error scenarios
- [ ] **All validation scripts pass**:
  - `validate_service_structure.py`
  - `validate_business_logic.py`
  - `check-dto-exports.ts`
  - `detect-cross-context-violations.ts`

## Common Complex Service Scenarios

### Scenario 1: "Build a new financial transaction service"

1. Identify bounded context: Finance owns `player_financial_transaction`, `finance_outbox`
2. Choose patterns: Transaction Coordination + Outbox + Idempotency
3. Define DTOs: `FinancialTransactionDTO`, `RecordTransactionInput/Output`
4. Implement service with try/catch, outbox, idempotency check
5. Write tests for happy path, duplicate requests, partial failures
6. Run validation scripts

### Scenario 2: "Add mid-session reward calculation to Loyalty"

1. Identify cross-context dependencies: needs `RatingSlipTelemetryDTO`, `CasinoSettingsDTO`
2. Choose patterns: Multi-Step Business Logic + Transaction Coordination
3. Define contract-first DTOs: `CalculateMidSessionRewardInput/Output`
4. Implement with business rule validation, cross-context DTO consumption
5. Write tests for eligibility rules, calculation accuracy
6. Run validation scripts

### Scenario 3: "Create MTL entry with audit workflow"

1. Identify bounded context: MTL owns `mtl_entry`, `mtl_audit_note`
2. Choose patterns: State Machine + Multi-Step Workflow
3. Define DTOs for both tables + workflow inputs/outputs
4. Implement state transitions with validation
5. Write tests for valid/invalid transitions, audit trail
6. Run validation scripts

## References

This skill bundles patterns and rules from:
- Service Responsibility Matrix (SRM) v3.0.2
- DTO Canonical Standard
- Balanced Architecture Quick Reference
- Service Template Guidelines

For full documentation:
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- DTO Standard: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- Service Template: `docs/70-governance/SERVICE_TEMPLATE.md`
- Anti-Patterns: `docs/70-governance/ANTI_PATTERN_CATALOG.md`

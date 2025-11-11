---
name: pt2-service-builder
description: Create or modify PT-2 services following SRM bounded contexts, SERVICE_TEMPLATE.md patterns, and DTO contract policies to maintain architectural integrity
license: MIT
version: "1.0.0"
---

# PT-2 Service Builder

This skill enforces bounded context integrity when creating or modifying services in the PT-2 architecture.

## When to Use This Skill

- Creating a new service layer (e.g., `services/loyalty/`, `services/finance/`)
- Adding new service functions/RPCs to existing services
- Modifying service interfaces or DTOs
- Refactoring services to follow PT-2 patterns

## Critical Requirements

**MUST FOLLOW** (from SRM and SERVICE_TEMPLATE.md):

1. **Functional Factories, Not Classes**
   - ✅ `export function createLoyaltyService(supabase: SupabaseClient<Database>)`
   - ❌ `class LoyaltyService` or `new LoyaltyService()`

2. **Explicit Interfaces, Ban ReturnType**
   - ✅ `export interface GetPlayerLoyaltyResult { ... }`
   - ❌ `type GetPlayerLoyaltyResult = ReturnType<typeof getPlayerLoyalty>`

3. **Type Supabase Parameter as SupabaseClient<Database>**
   - ✅ `supabase: SupabaseClient<Database>`
   - ❌ `supabase: any` or untyped

4. **No Global Singletons or Stateful Factories**
   - ❌ Global service instances
   - ❌ Module-level state caching

5. **Bounded Context Isolation**
   - ✅ Import DTOs from other services via public exports
   - ❌ Direct database table access across contexts

6. **DTO Co-Location Required**
   - File: `services/{service}/dtos.ts`
   - Must export DTOs for all tables owned by this service (SRM §34-48)

## Bounded Context Ownership (from SRM §34-48)

Before creating/modifying a service, verify which tables it owns:

| Service | Bounded Context | Owns Tables | Service Directory |
|---------|----------------|-------------|-------------------|
| **CasinoService** | Casino management, settings, staff | `casino`, `casino_settings`, `company`, `staff`, `game_settings`, `player_casino`, `audit_log`, `report` | `/services/casino/` |
| **PlayerService** | Player profiles | `player` | `/services/player/` |
| **VisitService** | Session tracking | `visit` | `/services/visit/` |
| **LoyaltyService** | Comp points, mid-session rewards | `player_loyalty`, `loyalty_ledger`, `loyalty_outbox` | `/services/loyalty/` |
| **RatingSlipService** | Player rating telemetry | `rating_slip` | `/services/rating-slip/` |
| **PlayerFinancialService** | Financial transactions | `player_financial_transaction`, `finance_outbox` | `/services/finance/` |
| **MTLService** | Multiple Transaction Log | `mtl_entry`, `mtl_audit_note` | `/services/mtl/` |
| **TableContextService** | Gaming tables, chip custody | `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event` | `/services/table-context/` + `/services/table/` |
| **FloorLayoutService** | Floor plans, pits, table slots | `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation` | `/services/floor-layout/` |

## Workflow: Creating a New Service

### Step 1: Verify Bounded Context

```bash
# Check if service already exists
ls -la services/

# Verify table ownership in SRM
# Reference: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md §34-48
```

**Question to answer**: Which tables will this service own?

### Step 2: Generate Service Structure

```bash
# Use the service scaffold script
npx tsx skills/pt2-service-builder/scripts/generate-service-stub.ts loyalty

# This creates:
# services/loyalty/
#   ├── index.ts         (service factory)
#   ├── dtos.ts          (DTO exports)
#   ├── types.ts         (internal types)
#   └── __tests__/       (service tests)
```

### Step 3: Define DTOs First (Contract-First)

Edit `services/{service}/dtos.ts`:

```typescript
// services/loyalty/dtos.ts
import type { Database } from '@/types/database.types';

// ============================================================================
// TABLE OWNERSHIP: player_loyalty, loyalty_ledger, loyalty_outbox
// Reference: SRM v3.0.2 §1061-1274
// ============================================================================

// Canonical DTO (simple CRUD)
export type PlayerLoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];
export type PlayerLoyaltyInsert = Database['public']['Tables']['player_loyalty']['Insert'];
export type PlayerLoyaltyUpdate = Database['public']['Tables']['player_loyalty']['Update'];

export interface PlayerLoyaltyDTO extends PlayerLoyaltyRow {
  // Add computed/derived fields if needed
}

// Contract-First DTO (complex business logic)
export interface LoyaltyLedgerEntryDTO {
  id: string;
  player_id: string;
  casino_id: string;
  points_change: number;
  balance_after: number;
  reason: 'wager' | 'mid_session_reward' | 'manual_adjustment' | 'redemption';
  correlation_id: string;
  created_at: string;
}

// RPC Input/Output DTOs
export interface CalculateMidSessionRewardInput {
  rating_slip_id: string;
  casino_id: string;
}

export interface CalculateMidSessionRewardOutput {
  eligible: boolean;
  points_awarded: number;
  ledger_entry_id: string | null;
}
```

### Step 4: Implement Service Factory

Edit `services/{service}/index.ts`:

```typescript
// services/loyalty/index.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type {
  PlayerLoyaltyDTO,
  LoyaltyLedgerEntryDTO,
  CalculateMidSessionRewardInput,
  CalculateMidSessionRewardOutput
} from './dtos';

// Cross-context imports (ALLOWED via public DTOs)
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';

// ============================================================================
// LOYALTY SERVICE (Bounded Context: Comp Points & Rewards)
// Reference: SRM v3.0.2 §1061-1274
// ============================================================================

export interface LoyaltyService {
  getPlayerLoyalty(playerId: string): Promise<PlayerLoyaltyDTO | null>;
  getLedgerEntries(playerId: string, limit?: number): Promise<LoyaltyLedgerEntryDTO[]>;
  calculateMidSessionReward(input: CalculateMidSessionRewardInput): Promise<CalculateMidSessionRewardOutput>;
}

/**
 * Create Loyalty Service (Functional Factory)
 *
 * @param supabase - Supabase client with Database type
 * @returns LoyaltyService interface
 */
export function createLoyaltyService(
  supabase: SupabaseClient<Database>
): LoyaltyService {
  return {
    async getPlayerLoyalty(playerId: string): Promise<PlayerLoyaltyDTO | null> {
      const { data, error } = await supabase
        .from('player_loyalty')
        .select('*')
        .eq('player_id', playerId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch player loyalty: ${error.message}`);
      }

      return data;
    },

    async getLedgerEntries(
      playerId: string,
      limit: number = 50
    ): Promise<LoyaltyLedgerEntryDTO[]> {
      const { data, error } = await supabase
        .from('loyalty_ledger')
        .select('*')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch ledger entries: ${error.message}`);
      }

      return data;
    },

    async calculateMidSessionReward(
      input: CalculateMidSessionRewardInput
    ): Promise<CalculateMidSessionRewardOutput> {
      // Implementation here (business logic)
      // Reference: SRM §358-373 (mid-session reward calculation)

      return {
        eligible: true,
        points_awarded: 100,
        ledger_entry_id: null
      };
    }
  };
}
```

### Step 5: Add Service Tests

Create `services/{service}/__tests__/index.test.ts`:

```typescript
// services/loyalty/__tests__/index.test.ts
import { createClient } from '@supabase/supabase-js';
import { createLoyaltyService } from '../index';
import type { Database } from '@/types/database.types';

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

describe('LoyaltyService', () => {
  const service = createLoyaltyService(supabase);

  it('should fetch player loyalty', async () => {
    const result = await service.getPlayerLoyalty('test-player-id');
    expect(result).toBeDefined();
  });

  it('should respect bounded context isolation', () => {
    // Ensure no direct table access to rating_slip, visit, etc.
    // Only allowed: import { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos'
  });
});
```

### Step 6: Validate DTO Ownership

```bash
# Run DTO validator to check compliance
npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts
```

### Step 7: Validate Cross-Context Access

```bash
# Check for bounded context violations
npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts
```

## Anti-Patterns to AVOID

❌ **Class-based services**:
```typescript
// WRONG
class LoyaltyService {
  constructor(private supabase: any) {}
  async getPlayerLoyalty(id: string) { ... }
}
```

❌ **ReturnType inference**:
```typescript
// WRONG
type GetPlayerLoyaltyResult = ReturnType<typeof getPlayerLoyalty>;
```

❌ **Untyped supabase parameter**:
```typescript
// WRONG
function createLoyaltyService(supabase: any) { ... }
```

❌ **Direct cross-context table access**:
```typescript
// WRONG (in services/loyalty/)
import type { Database } from '@/types/database.types';
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
// ❌ ESLint error: BOUNDED CONTEXT VIOLATION
```

❌ **Global singletons**:
```typescript
// WRONG
const loyaltyService = createLoyaltyService(globalSupabase);
export default loyaltyService; // Global state
```

❌ **Missing DTO exports**:
```typescript
// WRONG: Service owns player_loyalty table but no DTO exported
// services/loyalty/dtos.ts is empty or missing
```

## Cross-Context DTO Consumption (Allowed Patterns)

From SRM §60-73, these cross-context imports are ALLOWED:

```typescript
// In services/loyalty/ (Consumer)
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos'; // ✅ ALLOWED
import type { VisitDTO } from '@/services/visit/dtos'; // ✅ ALLOWED

// In services/finance/ (Consumer)
import type { VisitDTO } from '@/services/visit/dtos'; // ✅ ALLOWED
import type { RatingSlipDTO } from '@/services/rating-slip/dtos'; // ✅ ALLOWED

// In services/table-context/ (Consumer)
import type { CasinoSettingsDTO } from '@/services/casino/dtos'; // ✅ ALLOWED

// In services/rating-slip/ (Consumer)
import type { GamingTableDTO } from '@/services/table-context/dtos'; // ✅ ALLOWED

// All services can import from Casino
import type { CasinoDTO, StaffDTO } from '@/services/casino/dtos'; // ✅ ALLOWED
```

## Service Layer Patterns

### Pattern 1: Simple CRUD Service (Canonical DTOs)

Services: Player, Visit, Casino

```typescript
// Simple read/write operations
export interface PlayerService {
  getPlayer(id: string): Promise<PlayerDTO | null>;
  createPlayer(input: PlayerInsert): Promise<PlayerDTO>;
  updatePlayer(id: string, updates: PlayerUpdate): Promise<PlayerDTO>;
}
```

### Pattern 2: Complex Business Logic Service (Contract-First DTOs)

Services: Loyalty, Finance, MTL, TableContext

```typescript
// Complex operations with business rules
export interface LoyaltyService {
  // CRUD
  getPlayerLoyalty(playerId: string): Promise<PlayerLoyaltyDTO | null>;

  // Business logic (RPC-style)
  calculateMidSessionReward(input: CalcInput): Promise<CalcOutput>;
  awardPoints(input: AwardInput): Promise<AwardOutput>;
  redeemPoints(input: RedeemInput): Promise<RedeemOutput>;
}
```

### Pattern 3: Hybrid Service

Service: RatingSlip

```typescript
// Mix of canonical DTOs + contract-first RPCs
export interface RatingSlipService {
  // Canonical CRUD
  getRatingSlip(id: string): Promise<RatingSlipDTO | null>;

  // Contract-first telemetry
  getTelemetry(id: string): Promise<RatingSlipTelemetryDTO>;
  updateRealTimeMetrics(input: UpdateMetricsInput): Promise<void>;
}
```

## DTO Derivation Guidelines

### Canonical DTO Pattern (Simple CRUD)

```typescript
// Derive directly from database.types.ts
export type PlayerDTO = Database['public']['Tables']['player']['Row'];
export type PlayerInsert = Database['public']['Tables']['player']['Insert'];
export type PlayerUpdate = Database['public']['Tables']['player']['Update'];
```

### Contract-First DTO Pattern (Complex Logic)

```typescript
// Define interface explicitly for business needs
export interface CalculateMidSessionRewardOutput {
  eligible: boolean;
  points_awarded: number;
  ledger_entry_id: string | null;
  reason?: string;
}

// Zod schema for validation
export const CalculateMidSessionRewardOutputSchema = z.object({
  eligible: z.boolean(),
  points_awarded: z.number().int().nonnegative(),
  ledger_entry_id: z.string().uuid().nullable(),
  reason: z.string().optional()
});
```

## File Structure Standards

```
services/{service}/
├── index.ts              # Service factory (REQUIRED)
├── dtos.ts               # DTO exports (REQUIRED)
├── types.ts              # Internal types (OPTIONAL)
├── schemas.ts            # Zod validation (OPTIONAL)
├── __tests__/
│   ├── index.test.ts     # Service tests
│   └── dtos.test.ts      # DTO validation tests
└── README.md             # Service documentation (RECOMMENDED)
```

## References

This skill bundles:
- `references/SERVICE_TEMPLATE.md` (excerpt from docs/70-governance/)
- `references/SRM_SERVICE_OWNERSHIP.md` (SRM §34-48 excerpt)
- `references/DTO_CANONICAL_STANDARD.md` (excerpt from docs/25-api-data/)

For full documentation:
- Service Template: `docs/70-governance/SERVICE_TEMPLATE.md`
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- DTO Standard: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- Anti-Patterns: `docs/70-governance/ANTI_PATTERN_CATALOG.md`

## Success Criteria

✅ Service follows functional factory pattern (not classes)
✅ Explicit interfaces defined (no ReturnType inference)
✅ SupabaseClient<Database> typed correctly
✅ DTOs exported in dtos.ts for all owned tables
✅ No direct cross-context table access (ESLint passes)
✅ Service tests cover key operations
✅ Bounded context isolation maintained

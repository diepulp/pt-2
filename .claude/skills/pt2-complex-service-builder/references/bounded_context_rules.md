# Bounded Context Rules for Complex Services

**Source**:
- Service Responsibility Matrix (compressed, 2025-11-17)
- DTO Catalog: `docs/25-api-data/DTO_CATALOG.md` (771 lines)
- DTO Canonical Standard: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`

**Note**: SRM has been compressed. For detailed DTO specifications, field-level information, and consumer matrices, always refer to DTO_CATALOG.md.

---

## Table Ownership Matrix

Complex services own the following tables:

| Service | Bounded Context | Owned Tables | Service Directory |
|---------|----------------|--------------|-------------------|
| **LoyaltyService** | Comp points, mid-session rewards | `player_loyalty`, `loyalty_ledger`, `loyalty_outbox` | `/services/loyalty/` |
| **PlayerFinancialService** | Financial transactions | `player_financial_transaction`, `finance_outbox` | `/services/finance/` |
| **MTLService** | Multiple Transaction Log | `mtl_entry`, `mtl_audit_note` | `/services/mtl/` |
| **TableContextService** | Gaming tables, chip custody | `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event` | `/services/table-context/` + `/services/table/` |

---

## Cross-Context DTO Consumption Rules

### Rule 1: DTOs, Not Tables

**NEVER** access another service's tables directly. **ALWAYS** consume via published DTOs.

```typescript
// ❌ FORBIDDEN
import type { Database } from '@/types/database.types';
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
// ESLint error: BOUNDED CONTEXT VIOLATION

// ✅ ALLOWED
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
```

---

### Rule 2: Allowed Cross-Context Imports

From DTO Catalog (see `docs/25-api-data/DTO_CATALOG.md` for complete matrix):

| Consumer Service | Can Import DTOs From | Use Case | Reference |
|------------------|---------------------|----------|-----------|
| **Loyalty** | `RatingSlip` (`RatingSlipTelemetryDTO`) | Calculate mid-session rewards | DTO_CATALOG: RatingSlipTelemetryDTO |
| **Loyalty** | `Visit` (`VisitDTO`) | Session context for ledger entries | DTO_CATALOG: VisitDTO |
| **Finance** | `Visit` (`VisitDTO`) | Associate transactions with sessions | DTO_CATALOG: VisitDTO |
| **Finance** | `RatingSlip` (`RatingSlipDTO`) | Legacy compat FK (`rating_slip_id`) | DTO_CATALOG: RatingSlipDTO |
| **MTL** | `RatingSlip` (`RatingSlipDTO`) | Optional FK for compliance tracking | DTO_CATALOG: RatingSlipDTO |
| **MTL** | `Visit` (`VisitDTO`) | Optional FK for compliance tracking | DTO_CATALOG: VisitDTO |
| **TableContext** | `Casino` (`CasinoSettingsDTO`) | Gaming day temporal authority | DTO_CATALOG: CasinoSettingsDTO |
| **All Services** | `Casino` (`CasinoDTO`, `StaffDTO`) | `casino_id` FK, staff references | DTO_CATALOG: CasinoDTO, StaffDTO |

**Complete consumer matrix**: See DTO_CATALOG.md for field-level specifications, exposure policies, and versioning information.

---

### Example: Loyalty Service Cross-Context Usage

```typescript
// services/loyalty/mid-session-reward.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// ✅ ALLOWED: Import DTOs from other services
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
import type { VisitDTO } from '@/services/visit/dtos';
import type { CasinoSettingsDTO } from '@/services/casino/dtos';

// ✅ ALLOWED: Import own DTOs
import type {
  PlayerLoyaltyDTO,
  LoyaltyLedgerEntryDTO,
  CalculateMidSessionRewardInput,
  CalculateMidSessionRewardOutput
} from './dtos';

export interface LoyaltyService {
  calculateMidSessionReward(
    input: CalculateMidSessionRewardInput
  ): Promise<CalculateMidSessionRewardOutput>;
}

export function createLoyaltyService(
  supabase: SupabaseClient<Database>
): LoyaltyService {
  return {
    async calculateMidSessionReward(
      input: CalculateMidSessionRewardInput
    ): Promise<CalculateMidSessionRewardOutput> {
      // ✅ ALLOWED: Access own tables
      const { data: loyalty } = await supabase
        .from('player_loyalty') // ← Owned by Loyalty service
        .select('*')
        .eq('player_id', input.player_id)
        .single();

      // ✅ ALLOWED: Call other service methods (DTO-level API)
      // In practice, would inject dependencies or use RPC
      const telemetry: RatingSlipTelemetryDTO = await getRatingSlipTelemetry(
        input.rating_slip_id
      );

      // ❌ FORBIDDEN: Direct table access to other service's tables
      // const { data: slip } = await supabase
      //   .from('rating_slip') // ← NOT owned by Loyalty
      //   .select('*');

      // Business logic here...
      const points = telemetry.average_bet * 0.01;

      // ✅ ALLOWED: Insert into own tables
      const { data: ledgerEntry } = await supabase
        .from('loyalty_ledger') // ← Owned by Loyalty service
        .insert({
          player_id: input.player_id,
          points_change: points,
          reason: 'mid_session_reward',
          correlation_id: input.correlation_id
        })
        .select()
        .single();

      return {
        eligible: true,
        points_awarded: points,
        ledger_entry_id: ledgerEntry.id
      };
    }
  };
}
```

---

## DTO Export Requirements

### Rule 3: Services MUST Export DTOs for All Owned Tables

**File Location**: `services/{service}/dtos.ts`

**Examples**:

#### Loyalty Service (`services/loyalty/dtos.ts`)

```typescript
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

#### Finance Service (`services/finance/dtos.ts`)

```typescript
import type { Database } from '@/types/database.types';

// ============================================================================
// TABLE OWNERSHIP: player_financial_transaction, finance_outbox
// Reference: SRM v3.0.2 §1085-1155
// ============================================================================

// Canonical DTO
export type FinancialTransactionRow =
  Database['public']['Tables']['player_financial_transaction']['Row'];

export interface FinancialTransactionDTO extends FinancialTransactionRow {
  // Computed field for display
  absolute_amount?: number;
}

// RPC Input/Output
export interface RecordTransactionInput {
  player_id: string;
  casino_id: string;
  amount: number; // Positive = credit, Negative = debit
  transaction_type: 'credit' | 'debit' | 'adjustment';
  reason: string;
  visit_id?: string;
  rating_slip_id?: string;
  correlation_id: string;
  idempotency_key: string;
}

export interface RecordTransactionOutput {
  success: boolean;
  transaction_id: string;
  new_balance: number;
}
```

#### MTL Service (`services/mtl/dtos.ts`)

```typescript
import type { Database } from '@/types/database.types';

// ============================================================================
// TABLE OWNERSHIP: mtl_entry, mtl_audit_note
// Reference: SRM v3.0.2 §1276-1328
// ============================================================================

// Canonical DTOs
export type MTLEntryRow = Database['public']['Tables']['mtl_entry']['Row'];
export type MTLEntryInsert = Database['public']['Tables']['mtl_entry']['Insert'];

export interface MTLEntryDTO extends MTLEntryRow {
  // Include related audit notes if needed
  audit_notes?: MTLAuditNoteDTO[];
}

export type MTLAuditNoteRow = Database['public']['Tables']['mtl_audit_note']['Row'];
export interface MTLAuditNoteDTO extends MTLAuditNoteRow {}

// RPC Input/Output
export interface CreateMTLEntryInput {
  casino_id: string;
  gaming_day: string;
  entry_type: 'fill' | 'credit' | 'drop';
  gaming_table_id: string;
  amount: number;
  staff_id: string;
  visit_id?: string;
  rating_slip_id?: string;
  correlation_id: string;
}

export interface CreateMTLEntryOutput {
  success: boolean;
  entry_id: string;
}
```

---

## Validation Tools

### Tool 1: Check DTO Exports

**Script**: `npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts`

Verifies that all owned tables have corresponding DTO exports.

### Tool 2: Detect Cross-Context Violations

**Script**: `npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts`

Scans services for direct table access to tables they don't own.

**Example violation**:
```typescript
// services/loyalty/index.ts
import type { Database } from '@/types/database.types';

// ❌ VIOLATION: Loyalty service accessing rating_slip table directly
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];

// ESLint error:
// BOUNDED CONTEXT VIOLATION: Service "loyalty" cannot access table "rating_slip"
// Use: import { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos'
```

---

## ESLint Rule: no-cross-context-db-imports

**Configuration** (`.eslintrc.js`):

```javascript
{
  rules: {
    '@custom/no-cross-context-db-imports': [
      'error',
      {
        serviceOwnership: {
          loyalty: ['player_loyalty', 'loyalty_ledger', 'loyalty_outbox'],
          finance: ['player_financial_transaction', 'finance_outbox'],
          mtl: ['mtl_entry', 'mtl_audit_note'],
          'table-context': [
            'gaming_table',
            'gaming_table_settings',
            'dealer_rotation',
            'table_inventory_snapshot',
            'table_fill',
            'table_credit',
            'table_drop_event'
          ]
        }
      }
    ]
  }
}
```

**Effect**: ESLint will error if a service imports `Database['public']['Tables']['X']` for a table it doesn't own.

---

## Common Violations & Fixes

### Violation 1: Direct Table Access

**Problem**:
```typescript
// services/loyalty/mid-session-reward.ts
const { data: slip } = await supabase
  .from('rating_slip') // ❌ Not owned by Loyalty
  .select('*')
  .eq('id', ratingSlipId)
  .single();
```

**Fix**:
```typescript
// services/loyalty/mid-session-reward.ts
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';

// Call RatingSlip service method or RPC
const telemetry: RatingSlipTelemetryDTO = await ratingSlipService.getTelemetry(
  ratingSlipId
);
```

### Violation 2: Manual DTO for Owned Table

**Problem**:
```typescript
// services/loyalty/dtos.ts
export interface PlayerLoyaltyDTO {
  id: string;
  player_id: string;
  points_balance: number;
  // ❌ Manual interface, not derived from database.types.ts
}
```

**Fix**:
```typescript
// services/loyalty/dtos.ts
import type { Database } from '@/types/database.types';

export type PlayerLoyaltyDTO =
  Database['public']['Tables']['player_loyalty']['Row'];
// ✅ Derived from canonical types
```

### Violation 3: Missing DTO Export

**Problem**:
```typescript
// services/loyalty/dtos.ts
// Empty file or missing exports for owned tables
```

**Fix**:
```typescript
// services/loyalty/dtos.ts
export type PlayerLoyaltyDTO =
  Database['public']['Tables']['player_loyalty']['Row'];

export type LoyaltyLedgerRow =
  Database['public']['Tables']['loyalty_ledger']['Row'];

// Export DTOs for ALL owned tables
```

---

## Checklist: Bounded Context Compliance

Before shipping a complex service:

- [ ] **DTO exports exist** in `services/{service}/dtos.ts` for all owned tables
- [ ] **DTOs derive from `database.types.ts`** (not manual interfaces)
- [ ] **No direct table access** to tables owned by other services
- [ ] **Cross-context imports** use public DTOs (e.g., `import { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos'`)
- [ ] **ESLint passes** (no `no-cross-context-db-imports` violations)
- [ ] **Validation scripts pass**:
  - `npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts`
  - `npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts`

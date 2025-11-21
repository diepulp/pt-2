# DTO Canonical Standard Reference

**Source**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md` v2.1.0

## Pattern-Specific Rules

### Pattern B (Canonical CRUD) - STRICT

**❌ BANNED**: Manual DTO interfaces
```typescript
export interface PlayerCreateDTO {  // ❌ BANNED
  first_name: string;
  last_name: string;
}
```

**✅ REQUIRED**: Derive from Database types
```typescript
export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;
```

**Why**: Schema evolution blindness - manual interfaces don't update when migrations add/rename columns.

---

### Pattern A (Contract-First) - ALLOWED

**✅ ALLOWED**: Manual interfaces with mappers
```typescript
// services/loyalty/mid-session-reward.ts
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
}

// services/loyalty/mappers.ts (REQUIRED for safety)
export function toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    balance: row.balance,
    tier: row.tier,
  };
}
```

**Why Safe**: Mappers provide compile-time checkpoint. Schema changes break mapper, not runtime.

---

## Canonical Derivation Patterns

### Pattern 1: Create DTOs

```typescript
// ✅ Explicit field selection (recommended)
export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date'
>;

// ✅ OR: Accept all insertable fields
export type PlayerCreateDTO = Omit<
  Database['public']['Tables']['player']['Insert'],
  'id' | 'created_at' // Only omit auto-generated
>;
```

### Pattern 2: Update DTOs

```typescript
// ✅ Standard update DTO
export type PlayerUpdateDTO = Partial<
  Omit<
    Database['public']['Tables']['player']['Insert'],
    'id' | 'created_at'
  >
>;
```

### Pattern 3: Response DTOs

```typescript
// ✅ Explicit field selection (recommended)
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;
```

### Pattern 4: RPC Parameter DTOs

```typescript
// ✅ Derive from generated RPC types
export type CreateFinancialTxnParams =
  Database['public']['Functions']['rpc_create_financial_txn']['Args'];
```

---

## Bounded Context Enforcement

**CRITICAL**: Services MUST only access tables they own (per SRM)

```typescript
// ❌ FORBIDDEN: Cross-context table access
// services/loyalty/telemetry.ts
import type { Database } from '@/types/database.types';
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
// Loyalty doesn't own rating_slip table - SRM violation

// ✅ CORRECT: Consume via published DTO
// services/rating-slip/dtos.ts (RatingSlip owns this)
export interface RatingSlipTelemetryDTO {
  id: string;
  player_id: string;
  average_bet: number | null;
  duration_seconds: number;
}

// services/loyalty/mid-session-reward.ts (Loyalty consumes)
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
```

---

## Column Exposure Policy

**REQUIRED**: Document exposure rationale for every DTO

```typescript
/**
 * PlayerDTO - Public player profile
 *
 * Exposure: UI, external APIs
 * Excludes:
 * - ssn, birth_date (PII, compliance requirement)
 * - internal_notes (staff-only)
 * - risk_score (operational data)
 */
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;
```

---

## Common Mistakes

### ❌ Mistake 1: Using Row for Create DTOs
```typescript
// ❌ WRONG: Row includes non-insertable fields
export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Row'], // Should be Insert
  'first_name' | 'last_name'
>;
```
**Fix**: Use `Insert` for create operations.

### ❌ Mistake 2: Using Interface Instead of Type
```typescript
// ❌ WRONG: Interface cannot use Pick/Omit/Partial
export interface PlayerCreateDTO extends Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name'
> {} // Syntax error
```
**Fix**: Use `type` keyword for derived DTOs.

---

## Type System Hierarchy

```
Database (generated from schema)
├── public
│   ├── Tables
│   │   ├── player
│   │   │   ├── Row          → Response DTOs (PlayerDTO)
│   │   │   ├── Insert       → Create DTOs (PlayerCreateDTO)
│   │   │   └── Update       → Update DTOs (PlayerUpdateDTO)
│   ├── Functions
│   │   └── rpc_name
│   │       ├── Args         → RPC parameter DTOs
│   │       └── Returns      → RPC response DTOs
```

---

## Enforcement

- **ESLint Rule**: `.eslint-rules/no-manual-dto-interfaces.js` (syntax check)
- **ESLint Rule**: `.eslint-rules/no-cross-context-db-imports.js` (bounded context)
- **Pre-commit Hook**: `.husky/pre-commit-service-check.sh`
- **Applies to**: Pattern B services ONLY (Player, Visit, Casino, FloorLayout)
- **Pattern A exemption**: Complex services can use manual interfaces with mappers

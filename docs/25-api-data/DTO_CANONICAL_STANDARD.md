# DTO Canonical Standard - Type System Architecture

**Status**: MANDATORY (Enforced by ESLint + Pre-commit Hooks)
**Effective**: 2025-10-22
**Supersedes**: Manual DTO interfaces in all services

---

## TL;DR

**❌ BANNED:**
```typescript
export interface PlayerCreateDTO {
  first_name: string;
  last_name: string;
}
```

**✅ REQUIRED:**
```typescript
export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name'
>;
```

---

## Why This Matters

### The Problem: Schema Evolution Blindness

Manual DTO interfaces create a **false sense of type safety** that breaks silently:

```typescript
// ❌ Manual DTO (Casino service - current state)
export interface CasinoCreateDTO {
  name: string;
  location: string;
  company_id?: string | null;
  // Missing: address (schema supports it since Phase D)
  // Missing: status (schema supports it since baseline)
}

// Developer adds column via migration
ALTER TABLE casino ADD COLUMN timezone text;

// Supabase regenerates types
npm run db:types
// → TablesInsert now includes timezone?: string

// Service layer?
// → CasinoCreateDTO STILL manual (no timezone)
// → TypeScript: ✅ No errors (DISASTER)
// → Production: Silently ignores timezone input
// → Bug filed: "Can't set timezone via service layer"
```



---

## Canonical Patterns

### Pattern 1: Create DTOs (Client Input)

**Principle**: Mirror `Database['public']['Tables']['x']['Insert']`

```typescript
// ✅ Explicit field selection (recommended for clarity)
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

**Why Insert?**: `TablesInsert` reflects actual INSERT capability (optional fields, defaults applied)

---

### Pattern 2: Update DTOs (Partial Input)

**Principle**: Partial of Insert type (exclude immutable fields)

```typescript
// ✅ Standard update DTO
export type PlayerUpdateDTO = Partial<
  Omit<
    Database['public']['Tables']['player']['Insert'],
    'id' | 'created_at'
  >
>;

// ✅ OR: Explicit field selection for restricted updates
export type PlayerUpdateDTO = Partial<
  Pick<
    Database['public']['Tables']['player']['Insert'],
    'first_name' | 'last_name' // Only these fields updatable
  >
>;
```

---

### Pattern 3: Response DTOs (Service Output)

**Principle**: Pick from `Database['public']['Tables']['x']['Row']`

```typescript
// ✅ Explicit field selection (recommended)
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

// ✅ OR: Full row if returning everything
export type PlayerDTO = Database['public']['Tables']['player']['Row'];
```

**Why Row?**: `Tables.Row` reflects actual SELECT results (all fields populated)

---

### Pattern 4: RPC Parameter DTOs

**Principle**: Match RPC signature from `Database['public']['Functions']`

```typescript
// ✅ Derive from generated RPC types
export type CreateFinancialTxnParams =
  Database['public']['Functions']['rpc_create_financial_txn']['Args'];

// ✅ OR: Pick specific parameters
export type CreateFinancialTxnParams = Pick<
  Database['public']['Functions']['rpc_create_financial_txn']['Args'],
  'p_casino_id' | 'p_player_id' | 'p_amount'
>;
```

---

## Enforcement Mechanisms

### 1. ESLint Rule: Syntax (Build-Time)

**Location**: `.eslint-rules/no-manual-dto-interfaces.js`

```bash
# Detects manual interface violations
npx eslint services/casino/crud.ts

# Output:
# 15:8  error  ANTI-PATTERN: Manual DTO interface 'CasinoCreateDTO' violates SRM canonical standard
```

**Configuration**: `eslint.config.mjs` (lines 38, 46, 67-80)

---

### 2. ESLint Rule: Semantics (Bounded Context)

**Location**: `.eslint-rules/no-cross-context-db-imports.js` (NEW)

**Purpose**: Prevent services from directly accessing Database types outside their owned tables (per SRM)

```javascript
// .eslint-rules/no-cross-context-db-imports.js
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent cross-context Database type access (SRM violation)',
      category: 'Bounded Context Integrity',
    },
  },
  create(context) {
    const filename = context.getFilename();
    const serviceMatch = filename.match(/services\/([^/]+)\//);
    if (!serviceMatch) return {};

    const serviceName = serviceMatch[1];
    const SRM_OWNERSHIP = {
      'casino': ['casino', 'casino_settings', 'company', 'staff', 'game_settings', 'audit_log', 'report'],
      'player': ['player', 'player_casino'],
      'visit': ['visit'],
      'loyalty': ['player_loyalty', 'loyalty_ledger', 'loyalty_outbox'],
      'rating-slip': ['rating_slip'],
      'finance': ['player_financial_transaction', 'finance_outbox'],
      'mtl': ['mtl_entry', 'mtl_audit_note'],
      'table-context': ['gaming_table', 'gaming_table_settings', 'dealer_rotation', 'table_inventory_snapshot', 'table_fill', 'table_credit', 'table_drop_event'],
      'floor-layout': ['floor_layout', 'floor_layout_version', 'floor_pit', 'floor_table_slot', 'floor_layout_activation'],
    };

    return {
      MemberExpression(node) {
        // Detect: Database['public']['Tables']['table_name']
        if (
          node.object?.property?.value === 'Tables' &&
          node.property?.type === 'Literal'
        ) {
          const tableName = node.property.value;
          const ownedTables = SRM_OWNERSHIP[serviceName] || [];

          if (!ownedTables.includes(tableName)) {
            context.report({
              node,
              message: `BOUNDED CONTEXT VIOLATION: Service "${serviceName}" cannot directly access table "${tableName}". Must consume via published DTO from owning service. See SRM ownership matrix.`,
            });
          }
        }
      },
    };
  },
};
```

**Example violation:**
```typescript
// services/loyalty/telemetry.ts
import type { Database } from '@/types/database.types';

// ❌ ESLint error:
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
// Error: Service "loyalty" cannot directly access table "rating_slip"
// Must consume via published DTO from rating-slip service
```

---

### 3. ESLint Rule: Column Allowlist (Field-Level)

**Location**: `.eslint-rules/dto-column-allowlist.js` (NEW)

**Purpose**: Enforce explicit allowlist for sensitive tables (Player, Staff)

```javascript
// .eslint-rules/dto-column-allowlist.js
const SENSITIVE_TABLES = {
  player: {
    allowed: ['id', 'first_name', 'last_name', 'created_at'],
    forbidden: ['ssn', 'birth_date', 'internal_notes', 'risk_score'],
    rationale: 'PII and operational data must not leak to public DTOs',
  },
  staff: {
    allowed: ['id', 'first_name', 'last_name', 'role', 'status', 'created_at'],
    forbidden: ['employee_id', 'email', 'ssn'],
    rationale: 'Staff PII restricted to admin-only DTOs',
  },
};

module.exports = {
  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        // Detect: Pick<Database[...]['player']['Row'], 'field1' | 'field2'>
        if (node.typeAnnotation?.typeName?.name === 'Pick') {
          const typeArgs = node.typeAnnotation.typeParameters?.params || [];
          const tableNode = typeArgs[0]; // Database['public']['Tables']['player']['Row']
          const fieldsNode = typeArgs[1]; // 'field1' | 'field2'

          const tableName = extractTableName(tableNode);
          if (!SENSITIVE_TABLES[tableName]) return;

          const pickedFields = extractUnionLiterals(fieldsNode);
          const config = SENSITIVE_TABLES[tableName];

          pickedFields.forEach(field => {
            if (config.forbidden.includes(field)) {
              context.report({
                node: fieldsNode,
                message: `COLUMN LEAK: Field "${field}" in table "${tableName}" is forbidden from public DTOs. ${config.rationale}. Use admin-specific DTO variant.`,
              });
            }
          });
        }
      },
    };
  },
};
```

**Example violation:**
```typescript
// services/player/dtos.ts
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'ssn' // ❌ ESLint error: Field "ssn" is forbidden
>;
```

---

### 4. Pre-commit Hook (Commit-Time)

**Location**: `.husky/pre-commit-service-check.sh`

```bash
# Automatically runs on git commit
git commit -m "Add feature"

# Output if violations found:
# ❌ ANTI-PATTERN DETECTED: Manual DTO interfaces in service files
# Files with violations:
#   - services/casino/crud.ts
# 15:export interface CasinoCreateDTO {
```

**Bypass** (only if emergency):
```bash
git commit --no-verify  # ⚠️ Use sparingly
```

---

### 5. CI/CD Gate (Pipeline)

**TODO**: Add to GitHub Actions workflow

```yaml
- name: Validate DTO Compliance
  run: |
    # Syntax check
    npx eslint services/**/*.ts --max-warnings 0

    # Bounded context check
    node scripts/validate-srm-ownership.js

    # Column allowlist check
    node scripts/validate-dto-fields.js

    # Ensure all services have dtos.ts
    for service in casino player visit loyalty rating-slip finance mtl table-context floor-layout; do
      [[ -f "services/$service/dtos.ts" ]] || (echo "Missing dtos.ts for $service" && exit 1)
    done
```

---

## Migration Guide

### Step 1: Identify Manual DTOs

```bash
# Find all manual DTO interfaces
grep -r "export interface.*DTO" services/
```

### Step 2: Rewrite Using Canonical Pattern

**Before (Manual)**:
```typescript
export interface CasinoCreateDTO {
  name: string;
  location: string;
  company_id?: string | null;
}
```

**After (Canonical)**:
```typescript
export type CasinoCreateDTO = Pick<
  Database['public']['Tables']['casino']['Insert'],
  'name' | 'location' | 'company_id' | 'address' | 'status'
>;
```

### Step 3: Verify Type Correctness

```bash
# Regenerate types from schema
npm run db:types

# Run TypeScript compiler
npm run type-check

# Run ESLint validation
npx eslint services/casino/crud.ts
```

### Step 4: Update Tests

```typescript
// Tests should use the same DTO types
const validInput: CasinoCreateDTO = {
  name: 'Test Casino',
  location: 'Las Vegas',
  // TypeScript will now enforce all required fields
};
```

---

## Common Mistakes

### ❌ Mistake 1: Using Row for Create DTOs

```typescript
// ❌ WRONG: Row includes non-insertable fields
export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Row'], // ❌ Should be Insert
  'first_name' | 'last_name'
>;
```

**Why Wrong**: `Row` includes `id`, `created_at` which are auto-generated.

**Fix**: Use `Insert` for create operations.

---

### ❌ Mistake 2: Not Omitting Auto-Generated Fields

```typescript
// ❌ WRONG: Includes id (auto-generated)
export type PlayerCreateDTO =
  Database['public']['Tables']['player']['Insert']; // Includes id
```

**Why Wrong**: Client shouldn't provide `id`, `created_at`, `updated_at`.

**Fix**: Use `Omit` or explicit `Pick`.

---

### ❌ Mistake 3: Using Interface Instead of Type Alias

```typescript
// ❌ WRONG: Interface cannot use Pick/Omit/Partial
export interface PlayerCreateDTO extends Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name'
> {} // ❌ Syntax error
```

**Why Wrong**: TypeScript utility types require type aliases.

**Fix**: Use `type` keyword, not `interface`.

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
│   └── Enums
│       └── enum_name        → Enum types
```

---

## Audit Evidence

### Service Layer Compliance (2025-10-22)

| Service | Manual DTOs | Status | Fix Required |
|---------|-------------|--------|--------------|
| Casino | 2 (Create, Update) | ❌ Non-compliant | Yes |
| Loyalty | 8 | ❌ Non-compliant | Yes |
| PlayerFinancial | 7 | ❌ Non-compliant | Yes |
| MTL | 9 | ❌ Non-compliant | Yes |
| RatingSlip | 6 | ❌ Non-compliant | Yes |
| TableContext | 8 | ❌ Non-compliant | Yes |

**Total**: ~40 manual DTO definitions across codebase
**Estimated Remediation**: 8 hours (all services)

---

## Semantics Enforcement (Contract-First DTOs)

### The Problem: Syntax Without Semantics

The canonical `Pick<Database...>` pattern ensures **type safety** but doesn't enforce:

1. **Column exposure control**: Which fields are safe to expose to UI/external consumers?
2. **Bounded context integrity**: Which tables can a service access?
3. **Schema coupling**: How to decouple domain contracts from database evolution?

**Example of the gap:**
```typescript
// ✅ Type-safe (compiles)
// ❌ Semantically wrong (leaks internal data)
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'ssn' | 'internal_credit_score' // ❌ PII + internal fields
>;

// ✅ Type-safe (compiles)
// ❌ Violates bounded context (Loyalty accessing RatingSlip table directly)
export type LoyaltyRewardDTO = Pick<
  Database['public']['Tables']['rating_slip']['Row'], // ❌ Cross-context access
  'average_bet' | 'duration'
>;
```

---

### Pattern 5: Contract-First DTOs (Bounded Contexts)

**When to use**: Services with complex business logic and strict bounded contexts (Loyalty, Finance, MTL, TableContext)

**Principle**: SRM defines contract → DTO interface → Mapper enforces boundary

#### Step 1: Define Domain Contract (SRM-Aligned)

```typescript
// services/loyalty/dtos.ts
// ✅ Domain contract independent of DB schema
export interface PlayerLoyaltyDTO {
  player_id: string;
  casino_id: string;
  balance: number;
  tier: string | null;
  // NO: preferences (internal), updated_at (implementation detail)
}

export interface IssueMidSessionRewardInput {
  casino_id: string;
  player_id: string;
  rating_slip_id: string; // Reference, not full object
  staff_id: string;
  points: number;
  idempotency_key: string;
  reason?: 'mid_session' | 'session_end' | 'manual_adjustment' | 'promotion' | 'correction';
  // NO: Direct RatingSlip fields (average_bet, duration) - violates bounded context
}
```

#### Step 2: Implement Mapper (Internal Use)

```typescript
// services/loyalty/mappers.ts
import type { Database } from '@/types/database.types'; // ⚠️ Internal use only

type LoyaltyRow = Database['public']['Tables']['player_loyalty']['Row'];

export function toPlayerLoyaltyDTO(row: LoyaltyRow): PlayerLoyaltyDTO {
  return {
    player_id: row.player_id,
    casino_id: row.casino_id,
    balance: row.balance,
    tier: row.tier,
    // Explicitly omit: preferences (internal-only field)
  };
}

export function toPlayerLoyaltyInsert(
  dto: Omit<PlayerLoyaltyDTO, 'balance' | 'tier'>
): Database['public']['Tables']['player_loyalty']['Insert'] {
  return {
    player_id: dto.player_id,
    casino_id: dto.casino_id,
    // Apply defaults:
    balance: 0,
    tier: null,
    preferences: {}, // Internal field with safe default
  };
}
```

#### Step 3: Bounded Context Enforcement

**Services MUST only import DTOs from their owned contexts or declared dependencies (per SRM):**

```typescript
// ✅ ALLOWED (declared in SRM:358)
// services/loyalty/mid-session-reward.ts
import type { IssueMidSessionRewardInput } from './dtos';
// Loyalty owns this contract

// ❌ FORBIDDEN (violates SRM:302-303)
// services/loyalty/telemetry.ts
import type { Database } from '@/types/database.types';
type RatingSlipData = Database['public']['Tables']['rating_slip']['Row'];
// Loyalty must consume RatingSlip data via RPC/DTO, not direct table access
```

**Correct approach (SRM:382):**
```typescript
// services/rating-slip/dtos.ts (RatingSlip owns this contract)
export interface RatingSlipTelemetryDTO {
  id: string;
  player_id: string;
  casino_id: string;
  average_bet: number | null;
  duration_seconds: number;
  game_type: 'blackjack' | 'poker' | 'roulette' | 'baccarat';
}

// services/loyalty/mid-session-reward.ts (Loyalty consumes via import)
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';

function calculateReward(telemetry: RatingSlipTelemetryDTO): number {
  // Uses published DTO, not raw DB row
}
```

---

### Pattern 6: Hybrid Approach (Pragmatic Default)

**Decision Tree**:

```
Is this service a bounded context with complex business logic?
├─ YES → Use Contract-First DTOs (Pattern 5)
│   └─ Examples: Loyalty, Finance, MTL, TableContext
│
└─ NO → Is it thin CRUD?
    ├─ YES → Use Canonical DTOs with Allowlist (Pattern 1 + enforcement)
    │   └─ Examples: Player, Visit, Casino
    │
    └─ HYBRID → Use canonical DTOs + mappers for cross-context data
        └─ Example: RatingSlip (owns telemetry, publishes DTOs to Loyalty/Finance)
```

**Thin CRUD Example with Allowlist:**
```typescript
// services/player/dtos.ts
// ✅ Canonical pattern with explicit field control
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at' // ✅ Explicit allowlist
>;

export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'birth_date' // ✅ Explicit allowlist
>;

// ❌ Forbidden fields (enforced by ESLint):
// 'ssn', 'internal_notes', 'risk_score', etc.
```

---

### Column Exposure Policy

**REQUIRED: Every DTO MUST document exposure rationale**

```typescript
// services/player/dtos.ts

/**
 * PlayerDTO - Public player profile
 *
 * Exposure: UI, external APIs
 * Excludes:
 * - ssn, birth_date (PII, compliance requirement)
 * - internal_notes (staff-only)
 * - risk_score (operational data, not player-facing)
 */
export type PlayerDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'created_at'
>;

/**
 * PlayerAdminDTO - Full player data for admin views
 *
 * Exposure: Admin UI only (role-gated)
 * Includes PII: Requires audit logging
 */
export type PlayerAdminDTO = Pick<
  Database['public']['Tables']['player']['Row'],
  'id' | 'first_name' | 'last_name' | 'birth_date' | 'created_at'
>;
```

---

## Benefits

### 1. Automatic Schema Sync

```typescript
// Migration adds column:
ALTER TABLE player ADD COLUMN email text;

// npm run db:types regenerates:
Insert: {
  email?: string;  // ✅ Automatically available
}

// DTO immediately includes it:
export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'first_name' | 'last_name' | 'email'  // ✅ Add here
>;
// TypeScript compiler enforces completeness
```

### 2. Compile-Time Schema Validation

```typescript
// Typo in column name:
export type PlayerCreateDTO = Pick<
  Database['public']['Tables']['player']['Insert'],
  'frist_name'  // ❌ TypeScript error: Property 'frist_name' does not exist
>;
```

### 3. Refactoring Safety

```typescript
// Rename column via migration:
ALTER TABLE player RENAME COLUMN birth_date TO date_of_birth;

// npm run db:types regenerates
// → All references break at compile time
// → Impossible to miss during refactor
```

---

## FAQ

### Q: Can I ever use `interface` for DTOs?

**A**: No. Use `type` aliases exclusively for DTOs. Interfaces cannot leverage `Pick`, `Omit`, `Partial`.

### Q: What if I need to extend a DTO?

**A**: Use intersection types:

```typescript
export type PlayerCreateWithMetadata = PlayerCreateDTO & {
  source: 'web' | 'mobile';
  utm_campaign?: string;
};
```

### Q: What about DTOs for external APIs?

**A**: External API DTOs can use interfaces (they're not tied to our schema). Only **database-bound DTOs** must derive from `Database` types.

### Q: How do I handle computed fields?

**A**: Use intersection types or separate response DTOs:

```typescript
// Response DTO with computed field
export type PlayerWithStats = PlayerDTO & {
  total_visits: number;  // Computed in service layer
};
```

---

## References

- **SRM v3.0.2**: `docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Service Template**: `70-governance/SERVICE_TEMPLATE.md`
- **ESLint Rule**: `.eslint-rules/no-manual-dto-interfaces.js`
- **Pre-commit Hook**: `.husky/pre-commit-service-check.sh`
- **Audit Report**: `docs/bounded-context-integrity/phase-D/SRM_CANONICALIZATION_AUDIT.md`

---

**Effective Date**: 2025-10-22
**Enforcement**: Immediate (ESLint errors block builds)
**Migration Deadline**: End of Sprint (all services must comply)

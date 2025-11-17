---
name: pt2-dto-validator
description: Validate DTO contracts, detect cross-context violations, and enforce table ownership mapping from SRM to maintain bounded context integrity
allowed-tools: SlashCommand, Read, Write, sequentialthinking, serena
license: MIT
version: "1.0.0"
---

# PT-2 DTO Validator

This skill validates Data Transfer Object (DTO) contracts and detects bounded context violations in the PT-2 architecture.

## When to Use This Skill

- After creating or modifying service DTOs
- Before committing service layer changes
- As part of CI/CD pipeline validation
- When refactoring cross-context dependencies
- To audit existing services for compliance

## Critical Requirements

**MUST ENFORCE** (from SRM §34-92 and DTO_CANONICAL_STANDARD.md):

1. **Table Ownership → DTO Ownership** (SRM §34-48)
   - Every service that owns tables MUST export DTOs for those tables
   - DTOs live in `services/{service}/dtos.ts`

2. **Cross-Context Access Rules** (SRM §54-73)
   - Services CANNOT directly access `Database['public']['Tables']['X']` for tables they don't own
   - Cross-context consumption MUST use public DTOs from owning service

3. **ESLint Enforcement**
   - Rule: `no-cross-context-db-imports`
   - Prevents `import type { Database }` in wrong contexts

4. **DTO Derivation Patterns** (SRM §96-200)
   - Canonical DTOs: Simple CRUD (Player, Visit, Casino)
   - Contract-First DTOs: Complex logic (Loyalty, Finance, MTL, TableContext)
   - Hybrid DTOs: Mix of both (RatingSlip)

## Validation Checks

### Check 1: DTO Export Coverage

Validates that services export DTOs for all tables they own (per SRM §34-48).

```bash
npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts
```

**What it checks:**
- Casino service exports: `CasinoDTO`, `CasinoSettingsDTO`, `StaffDTO`, `GameSettingsDTO`
- Player service exports: `PlayerDTO`, `PlayerEnrollmentDTO`
- Visit service exports: `VisitDTO`
- Loyalty service exports: `PlayerLoyaltyDTO`, `LoyaltyLedgerEntryDTO`
- RatingSlip service exports: `RatingSlipDTO`, `RatingSlipTelemetryDTO`
- Finance service exports: `FinancialTransactionDTO`
- MTL service exports: `MTLEntryDTO`, `MTLAuditNoteDTO`
- TableContext service exports: `GamingTableDTO`, `DealerRotationDTO`, chip custody DTOs
- FloorLayout service exports: `FloorLayoutDTO`, `FloorLayoutVersionDTO`, etc.

**Exit codes:**
- `0`: All DTOs present
- `1`: Missing required DTOs

### Check 2: Cross-Context Violation Detection

Detects services accessing tables they don't own directly via `Database['public']['Tables']`.

```bash
npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts
```

**What it checks:**
- No `Database['public']['Tables']['rating_slip']` in `services/loyalty/` (❌ VIOLATION)
- No `Database['public']['Tables']['visit']` in `services/finance/` (❌ VIOLATION)
- Allowed: `import type { RatingSlipDTO } from '@/services/rating-slip/dtos'` (✅ OK)

**Exit codes:**
- `0`: No violations found
- `1`: Bounded context violations detected

### Check 3: DTO Contract Validation

Validates DTO structure matches expected patterns from SRM.

```bash
npx tsx skills/pt2-dto-validator/scripts/validate-dto-contracts.ts
```

**What it checks:**
- Canonical DTOs properly derive from `Database['public']['Tables'][...]['Row']`
- Contract-First DTOs have explicit interface definitions
- Required fields present (id, casino_id for scoped tables)
- Zod schemas exist for RPC DTOs (optional but recommended)

## Allowed Cross-Context DTO Consumption (SRM §60-73)

These imports are EXPLICITLY ALLOWED:

```typescript
// ✅ Loyalty → RatingSlip
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';

// ✅ Loyalty → Visit
import type { VisitDTO } from '@/services/visit/dtos';

// ✅ Finance → Visit
import type { VisitDTO } from '@/services/visit/dtos';

// ✅ Finance → RatingSlip
import type { RatingSlipDTO } from '@/services/rating-slip/dtos';

// ✅ MTL → RatingSlip
import type { RatingSlipDTO } from '@/services/rating-slip/dtos';

// ✅ MTL → Visit
import type { VisitDTO } from '@/services/visit/dtos';

// ✅ TableContext → Casino
import type { CasinoSettingsDTO } from '@/services/casino/dtos';

// ✅ RatingSlip → TableContext
import type { GamingTableDTO } from '@/services/table-context/dtos';

// ✅ All Services → Casino
import type { CasinoDTO, StaffDTO } from '@/services/casino/dtos';
```

## FORBIDDEN Cross-Context Access

These patterns will trigger violations:

```typescript
// ❌ VIOLATION: Direct table access across context
// In services/loyalty/index.ts
import type { Database } from '@/types/database.types';
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
// Error: Service "loyalty" cannot directly access table "rating_slip"

// ❌ VIOLATION: Querying non-owned table
// In services/loyalty/index.ts
const { data } = await supabase
  .from('rating_slip') // ❌ Not owned by loyalty
  .select('*');

// ❌ VIOLATION: Creating manual type from non-owned table
// In services/finance/types.ts
interface ManualVisitType {
  id: string;
  player_id: string;
  // ... copying structure from visit table
}
// Should import VisitDTO instead
```

## DTO Ownership Matrix (from SRM §34-48)

| Service | Owns Tables | MUST Export DTOs | File Location |
|---------|-------------|------------------|---------------|
| **Casino** | `casino`, `casino_settings`, `company`, `staff`, `game_settings`, `player_casino`, `audit_log`, `report` | `CasinoDTO`, `CasinoSettingsDTO`, `StaffDTO`, `GameSettingsDTO` | `services/casino/dtos.ts` |
| **Player** | `player` | `PlayerDTO` | `services/player/dtos.ts` |
| **Visit** | `visit` | `VisitDTO` | `services/visit/dtos.ts` |
| **Loyalty** | `player_loyalty`, `loyalty_ledger`, `loyalty_outbox` | `PlayerLoyaltyDTO`, `LoyaltyLedgerEntryDTO` | `services/loyalty/dtos.ts` |
| **RatingSlip** | `rating_slip` | `RatingSlipDTO`, `RatingSlipTelemetryDTO` | `services/rating-slip/dtos.ts` |
| **Finance** | `player_financial_transaction`, `finance_outbox` | `FinancialTransactionDTO` | `services/finance/dtos.ts` |
| **MTL** | `mtl_entry`, `mtl_audit_note` | `MTLEntryDTO`, `MTLAuditNoteDTO` | `services/mtl/dtos.ts` |
| **TableContext** | `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event` | `GamingTableDTO`, `DealerRotationDTO`, `TableInventoryDTO`, `TableFillDTO`, `TableCreditDTO`, `TableDropDTO` | `services/table-context/dtos.ts` |
| **FloorLayout** | `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation` | `FloorLayoutDTO`, `FloorLayoutVersionDTO`, `FloorPitDTO`, `FloorTableSlotDTO`, `FloorLayoutActivationDTO` | `services/floor-layout/dtos.ts` |

## Validation Workflow

### Pre-Commit Validation

```bash
# Run all DTO validation checks
bash skills/pt2-dto-validator/scripts/validate-all.sh

# This runs:
# 1. check-dto-exports.ts
# 2. detect-cross-context-violations.ts
# 3. validate-dto-contracts.ts (if implemented)
```

### CI Pipeline Integration

Add to `.github/workflows/ci.yml`:

```yaml
- name: Validate DTO Contracts
  run: |
    npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts
    npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts
```

### Manual Service Audit

```bash
# Audit specific service
npx tsx skills/pt2-dto-validator/scripts/audit-service.ts loyalty

# Output:
# ✅ DTOs exported: PlayerLoyaltyDTO, LoyaltyLedgerEntryDTO
# ✅ No cross-context violations
# ⚠️  Missing Zod schemas for RPC DTOs
```

## Common Violations and Fixes

### Violation 1: Missing DTO Export

**Problem:**
```typescript
// services/loyalty/dtos.ts is empty or missing exports
```

**Fix:**
```typescript
// services/loyalty/dtos.ts
import type { Database } from '@/types/database.types';

export type PlayerLoyaltyDTO = Database['public']['Tables']['player_loyalty']['Row'];
export type LoyaltyLedgerEntryDTO = Database['public']['Tables']['loyalty_ledger']['Row'];
```

### Violation 2: Direct Cross-Context Table Access

**Problem:**
```typescript
// services/loyalty/calculate-reward.ts
import type { Database } from '@/types/database.types';
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
```

**Fix:**
```typescript
// services/loyalty/calculate-reward.ts
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
// ✅ Use public DTO from owning service
```

### Violation 3: Direct Query to Non-Owned Table

**Problem:**
```typescript
// services/loyalty/index.ts
const { data } = await supabase
  .from('rating_slip') // ❌ Not owned by loyalty
  .select('*');
```

**Fix:**
```typescript
// services/loyalty/index.ts
import { createRatingSlipService } from '@/services/rating-slip';

const ratingSlipService = createRatingSlipService(supabase);
const telemetry = await ratingSlipService.getTelemetry(ratingSlipId);
// ✅ Use service interface from owning context
```

### Violation 4: ReturnType Inference

**Problem:**
```typescript
// services/loyalty/types.ts
import { getPlayerLoyalty } from './index';
type GetPlayerLoyaltyResult = ReturnType<typeof getPlayerLoyalty>;
// ❌ Banned pattern
```

**Fix:**
```typescript
// services/loyalty/dtos.ts
export interface GetPlayerLoyaltyResult {
  id: string;
  player_id: string;
  // ... explicit fields
}

// services/loyalty/index.ts
export async function getPlayerLoyalty(id: string): Promise<GetPlayerLoyaltyResult> {
  // ...
}
```

## ESLint Configuration

The `no-cross-context-db-imports` rule should be configured:

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-cross-context-db-imports': [
      'error',
      {
        serviceOwnership: {
          casino: ['casino', 'casino_settings', 'staff', 'game_settings'],
          player: ['player'],
          visit: ['visit'],
          loyalty: ['player_loyalty', 'loyalty_ledger', 'loyalty_outbox'],
          'rating-slip': ['rating_slip'],
          finance: ['player_financial_transaction', 'finance_outbox'],
          mtl: ['mtl_entry', 'mtl_audit_note'],
          'table-context': ['gaming_table', 'gaming_table_settings', 'dealer_rotation'],
          'floor-layout': ['floor_layout', 'floor_layout_version']
        }
      }
    ]
  }
};
```

## Troubleshooting

**Error: "DTO export not found"**
- Check `services/{service}/dtos.ts` exists
- Verify export statement: `export type YourDTO = ...`
- Ensure service matches SRM ownership (§34-48)

**Error: "Cross-context violation detected"**
- Identify which service is accessing which table
- Find the owning service from SRM §34-48
- Import DTO from owning service's `dtos.ts`

**Error: "ESLint rule not working"**
- Check `.eslintrc.js` has `no-cross-context-db-imports` rule
- Verify `serviceOwnership` mapping is complete
- Run: `npm run lint -- --fix` to see violations

**Warning: "Missing Zod schema"**
- Non-blocking but recommended for RPC DTOs
- Add Zod schemas in `services/{service}/schemas.ts`
- Import and validate at service boundaries

## References

This skill bundles:
- `references/DTO_CANONICAL_STANDARD.md` (excerpt from docs/25-api-data/)
- `references/SRM_DTO_OWNERSHIP.md` (SRM §34-92 excerpt)
- `references/ESLINT_RULES.md` (ESLint configuration guide)

For full documentation:
- DTO Standard: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` §34-92
- Service Template: `docs/70-governance/SERVICE_TEMPLATE.md`
- Anti-Patterns: `docs/70-governance/ANTI_PATTERN_CATALOG.md`

## Success Criteria

✅ All services export DTOs for owned tables (check-dto-exports passes)
✅ No cross-context direct table access (detect-violations passes)
✅ Cross-context consumption uses public DTOs only
✅ ESLint `no-cross-context-db-imports` rule passes
✅ DTO contracts follow Canonical or Contract-First patterns
✅ Zod schemas present for RPC DTOs (recommended)

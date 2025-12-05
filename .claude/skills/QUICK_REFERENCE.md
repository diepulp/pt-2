# PT-2 Skills Quick Reference

**Version**: 1.0.0 (Phase 1)
**Last Updated**: 2025-11-10

---

## Installation Check

```bash
bash skills/validate-phase1-skills.sh
```

---

## pt2-migration-manager

### Create Migration
```bash
bash skills/pt2-migration-manager/scripts/create-migration.sh "description"
```

### Apply Migration + Regen Types
```bash
bash skills/pt2-migration-manager/scripts/apply-migration-and-regen-types.sh
```

### Validate RLS Coverage
```bash
npx tsx skills/pt2-migration-manager/scripts/validate-rls-coverage.ts
```

### Migration Template
```sql
-- Enable RLS
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

-- Casino Isolation Policy
CREATE POLICY "casino_isolation_policy" ON public.my_table
  USING (casino_id::text = current_setting('app.casino_id', true));
```

---

## pt2-service-builder

### Generate Service Stub
```bash
npx tsx skills/pt2-service-builder/scripts/generate-service-stub.ts service-name
```

### Service Factory Template
```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export interface MyService {
  getById(id: string): Promise<MyDTO | null>;
}

export function createMyService(
  supabase: SupabaseClient<Database>
): MyService {
  return {
    async getById(id: string) {
      const { data, error } = await supabase
        .from('my_table')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw new Error(error.message);
      return data;
    }
  };
}
```

### DTO Template
```typescript
import type { Database } from '@/types/database.types';

// Canonical DTO (simple CRUD)
export type MyDTO = Database['public']['Tables']['my_table']['Row'];

// Contract-First DTO (complex logic)
export interface MyBusinessDTO {
  id: string;
  // ... fields
}
```

---

## pt2-dto-validator

### Check DTO Exports
```bash
npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts
```

### Detect Cross-Context Violations
```bash
npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts
```

### Run All Validations
```bash
bash skills/pt2-dto-validator/scripts/validate-all.sh
```

### Fix Cross-Context Violation

**Before (❌ WRONG)**:
```typescript
import type { Database } from '@/types/database.types';
type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
```

**After (✅ CORRECT)**:
```typescript
import type { RatingSlipDTO } from '@/services/rating-slip/dtos';
```

---

## Service Ownership Matrix (SRM §34-48)

| Service | Owns Tables | Directory |
|---------|-------------|-----------|
| Casino | casino, casino_settings, staff, game_settings | `/services/casino/` |
| Player | player | `/services/player/` |
| Visit | visit | `/services/visit/` |
| Loyalty | player_loyalty, loyalty_ledger, loyalty_outbox | `/services/loyalty/` |
| RatingSlip | rating_slip | PENDING (rebuild when needed) |
| Finance | player_financial_transaction, finance_outbox | `/services/finance/` |
| MTL | mtl_entry, mtl_audit_note | `/services/mtl/` |
| TableContext | gaming_table, dealer_rotation, chip custody | PENDING (rebuild when needed) |
| FloorLayout | floor_layout, floor_layout_version, floor_pit | `/services/floor-layout/` |

---

## Allowed Cross-Context Imports (SRM §60-73)

```typescript
// ✅ Loyalty → RatingSlip
import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';

// ✅ Loyalty → Visit
import type { VisitDTO } from '@/services/visit/dtos';

// ✅ Finance → Visit
import type { VisitDTO } from '@/services/visit/dtos';

// ✅ Finance → RatingSlip
import type { RatingSlipDTO } from '@/services/rating-slip/dtos';

// ✅ All Services → Casino
import type { CasinoDTO, StaffDTO } from '@/services/casino/dtos';
```

---

## Common Workflows

### Workflow: Add New Table

```bash
# 1. Create migration
bash skills/pt2-migration-manager/scripts/create-migration.sh "add_my_table"

# 2. Edit migration (add table + RLS + indexes)
vim supabase/migrations/YYYYMMDDHHMMSS_add_my_table.sql

# 3. Apply + regen types
bash skills/pt2-migration-manager/scripts/apply-migration-and-regen-types.sh

# 4. Validate RLS
npx tsx skills/pt2-migration-manager/scripts/validate-rls-coverage.ts

# 5. Add DTOs to owning service
vim services/my-service/dtos.ts

# 6. Validate DTOs
npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts
```

### Workflow: Create New Service

```bash
# 1. Generate stub
npx tsx skills/pt2-service-builder/scripts/generate-service-stub.ts my-service

# 2. Define DTOs
vim services/my-service/dtos.ts

# 3. Implement factory
vim services/my-service/index.ts

# 4. Validate
bash skills/pt2-dto-validator/scripts/validate-all.sh
```

### Workflow: Refactor Cross-Context Access

```bash
# 1. Detect violations
npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts

# 2. Fix by importing DTOs instead of Database types

# 3. Validate fix
npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts
```

---

## Anti-Patterns (DO NOT)

❌ Class-based services
❌ ReturnType inference
❌ Untyped supabase (`any`)
❌ Global singletons
❌ Cross-context direct table access
❌ Missing DTO exports
❌ Manual migration timestamps
❌ Missing RLS policies
❌ Skipping type regeneration

---

## Standards Enforced

✅ Functional factories (not classes)
✅ Explicit interfaces (no ReturnType)
✅ SupabaseClient<Database> typing
✅ Timestamp migration naming
✅ RLS policy shipping
✅ Type regeneration workflow
✅ DTO ownership mapping
✅ Bounded context isolation

---

## Documentation

- **Main Guide**: `skills/README.md`
- **Implementation Report**: `docs/audits/PHASE1_SKILLS_IMPLEMENTATION_REPORT.md`
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` v3.0.2
- **Service Template**: `docs/70-governance/SERVICE_TEMPLATE.md`
- **DTO Standard**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **CLAUDE.md**: Critical standards and workflows

---

## Troubleshooting

### Migration applied but types not updated
```bash
npm run db:types
# Restart PostgREST if needed: docker restart supabase_rest_pt-2
```

### Cross-context violation detected
Replace direct Database table access with DTO import from owning service.

### RLS policy prevents access
Verify `app.casino_id` is set via `withServerAction()` middleware.

### DTO export missing
Add export to `services/{service}/dtos.ts` for owned tables (SRM §34-48).

---

## CI/CD Integration

```yaml
# .github/workflows/pt2-validation.yml
- name: Validate Architecture
  run: bash skills/pt2-dto-validator/scripts/validate-all.sh
```

---

**Quick Help**: See individual SKILL.md files for detailed guidance
- `skills/pt2-migration-manager/SKILL.md`
- `skills/pt2-service-builder/SKILL.md`
- `skills/pt2-dto-validator/SKILL.md`

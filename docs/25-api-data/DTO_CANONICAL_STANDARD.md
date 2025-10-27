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

### Root Cause: 100% Service Layer Non-Compliance

**ALL 6 services violate this standard:**
- Casino: Missing `address`, `status` from CreateDTO
- Loyalty: Manual DTOs + schema drift
- PlayerFinancial: Manual DTOs referencing Phase B columns
- MTL: Manual DTOs with 12+ non-existent columns
- RatingSlip: Dual type systems (local vs remote)
- TableContext: Manual DTOs with wrong column names

**Compliance Score: 40%** (was falsely reported as 62%)

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

### 1. ESLint Rule (Build-Time)

**Location**: `.eslint-rules/no-manual-dto-interfaces.js`

```bash
# Detects violations during development
npx eslint services/casino/crud.ts

# Output:
# 15:8  error  ANTI-PATTERN: Manual DTO interface 'CasinoCreateDTO' violates SRM canonical standard
```

**Configuration**: `eslint.config.mjs` (lines 38, 46, 67-80)

---

### 2. Pre-commit Hook (Commit-Time)

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

### 3. CI/CD Gate (Pipeline)

**TODO**: Add to GitHub Actions workflow

```yaml
- name: Validate DTO Compliance
  run: |
    npx eslint services/**/*.ts --max-warnings 0
    git diff --name-only origin/main...HEAD | \
      grep "^services/.*\.ts$" | \
      xargs grep -l "export interface.*DTO" && \
      echo "Manual DTOs detected" && exit 1 || true
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

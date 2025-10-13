# Integrity Framework - Quick Reference

**TL;DR**: Automated guardrails prevent schema drift and architectural violations. Follow the workflow, and the framework handles the rest.

---

## ⚡ Quick Commands

```bash
# After migration - ALWAYS run this
npm run db:types && npm test schema-verification

# Before commit - Verify your changes
npm run type-check && npm test schema-verification

# If pre-commit hook fails
npm run db:types  # Regenerate types
npm test schema-verification  # Verify alignment
```

---

## 🚦 Traffic Light System

### 🟢 **GREEN** - You're Good

- ✅ TypeScript compiles without errors
- ✅ Schema verification test passes
- ✅ Pre-commit hooks pass
- ✅ CI/CD pipeline passes

**Action**: Proceed with confidence

---

### 🟡 **YELLOW** - Warning

- ⚠️ Linting warnings (not errors)
- ⚠️ TypeScript warnings in IDE
- ⚠️ Test coverage below threshold

**Action**: Fix before merge, but not blocking

---

### 🔴 **RED** - Stop & Fix

- ❌ Schema verification test fails
- ❌ TypeScript compilation errors
- ❌ Pre-commit hook blocks commit
- ❌ CI/CD pipeline fails

**Action**: **MUST** fix before proceeding

---

## 🔄 Common Workflows

### Workflow 1: Adding a New Service

```bash
# 1. Create service files
mkdir -p services/my-service
touch services/my-service/{index,crud,business,queries}.ts

# 2. Write service code using database types
# Import: import type { Database } from "@/types/database.types"

# 3. Run verification
npm run type-check
npm test schema-verification

# 4. Commit (hooks run automatically)
git add services/my-service/
git commit -m "feat: add my-service"
```

---

### Workflow 2: Creating a Database Migration

```bash
# 1. Create migration
npx supabase migration new add_my_table

# 2. Edit migration file
# supabase/migrations/YYYYMMDDHHMMSS_add_my_table.sql

# 3. Apply migration locally
npx supabase db reset

# 4. ⚠️ CRITICAL: Regenerate types
npm run db:types

# 5. Verify schema alignment
npm test schema-verification

# 6. Update service DTOs if needed
# (test will tell you what needs fixing)

# 7. Commit BOTH migration and types
git add supabase/migrations/ types/database.types.ts services/
git commit -m "feat: add my_table schema"
```

---

### Workflow 3: When Schema Verification Fails

```bash
# ❌ Pre-commit hook blocks you:
#    "Schema verification failed!"

# Step 1: Check what changed
git diff types/database.types.ts

# Step 2: Run test with verbose output
npm test schema-verification -- --verbose

# Step 3: Fix service DTOs
# Example: Replace old field names with new ones
# Before: points_balance
# After:  current_balance

# Step 4: Verify fix
npm test schema-verification

# Step 5: Commit
git add services/ types/
git commit -m "fix: align DTOs with schema"
```

---

## 🛡️ Defense Layers (What Catches What)

| Layer | When | Catches | Auto-Fix |
|-------|------|---------|----------|
| **IDE** | Typing | Type errors, schema mismatches | No |
| **Pre-commit** | `git commit` | Schema drift, linting | Formatting only |
| **CI/CD** | PR push | All violations | No |
| **Runtime** | Production | Missed issues | Graceful handling |

---

## 🚫 Anti-Patterns (Don't Do This)

### ❌ Skip Type Generation

```bash
# BAD: Commit migration without regenerating types
git add supabase/migrations/
git commit -m "Add schema"  # ❌ Types still stale!
```

**Why Bad**: Service layer works with obsolete types, runtime failures guaranteed

**Fix**:
```bash
npm run db:types  # ✅ Always run after migration
git add types/
```

---

### ❌ Bypass Pre-commit Hooks

```bash
# BAD: Force commit without fixing issues
git commit --no-verify  # ❌ Skips all guardrails!
```

**Why Bad**: Pushes broken code to repository, fails in CI/CD anyway

**Fix**:
```bash
# Address the actual issue
npm run db:types
npm test schema-verification
git commit  # ✅ Let hooks validate
```

---

### ❌ Manual Type Definitions

```typescript
// BAD: Manually define database types
export interface PlayerLoyalty {  // ❌ Will drift!
  id: string;
  points_balance: number;  // ❌ Wrong field name
}
```

**Why Bad**: Manual types drift from actual schema, no verification possible

**Fix**:
```typescript
// GOOD: Use generated types
import type { Database } from "@/types/database.types";

export type PlayerLoyaltyRow =
  Database["public"]["Tables"]["player_loyalty"]["Row"];

export type PlayerLoyaltyDTO = Pick<
  PlayerLoyaltyRow,  // ✅ Stays in sync
  "id" | "current_balance"  // ✅ Compile-time verified
>;
```

---

### ❌ Copy-Paste Old Code

```typescript
// BAD: Copy service from old docs/implementation
// (may reference obsolete schema)
const ledger = await supabase
  .from("LoyaltyLedger")  // ❌ PascalCase doesn't exist!
  .select("points, direction")  // ❌ Fields renamed!
```

**Why Bad**: Old code worked with old schema, won't work with new schema

**Fix**:
```typescript
// GOOD: Check current schema first
npm test schema-verification -- --verbose  // Shows correct fields

const ledger = await supabase
  .from("loyalty_ledger")  // ✅ snake_case
  .select("points_change, transaction_type")  // ✅ Current fields
```

---

## 🔧 Troubleshooting

### Issue: "Property 'my_table' does not exist on type 'Tables'"

**Cause**: Types not regenerated after creating table

**Fix**:
```bash
npm run db:types
```

---

### Issue: "Schema verification test failing"

**Cause**: Service DTOs reference non-existent fields

**Fix**:
```bash
# 1. See which fields are wrong
npm test schema-verification -- --verbose

# 2. Check actual schema
git diff types/database.types.ts

# 3. Fix service DTOs
# Replace old field names with correct ones

# 4. Verify
npm test schema-verification
```

---

### Issue: "Pre-commit hook takes too long"

**Cause**: Running full test suite on every commit

**Solution**: Schema verification is **selective** - only runs when you modify:
- Migrations (`supabase/migrations/`)
- Database types (`types/database.types.ts`)
- Service files (`services/**/crud.ts`, `queries.ts`, `business.ts`)

**Typical timing**:
- No schema changes: ~0 seconds (skipped)
- Schema changes: ~3-5 seconds

---

## 📚 Further Reading

- [Full Integrity Framework](./INTEGRITY_FRAMEWORK.md) - Complete documentation
- [ADR-005](../adr/ADR-005-integrity-enforcement.md) - Architectural decision
- [Schema Fix Example](../phase-6/SCHEMA_FIX_SUMMARY.md) - Real incident & resolution
- [Architecture Standards](../../.claude/CLAUDE.md) - Quick reference

---

## 🆘 Need Help?

1. **Read the error message** - It usually tells you exactly what's wrong
2. **Check the docs** - `docs/integrity/INTEGRITY_FRAMEWORK.md`
3. **Run diagnostics**: `npm run type-check && npm test schema-verification -- --verbose`
4. **Ask the team** - Someone has likely seen this before

---

**Remember**: The framework is here to **help** you, not block you. If you're fighting it, something's misconfigured. Ask for help!

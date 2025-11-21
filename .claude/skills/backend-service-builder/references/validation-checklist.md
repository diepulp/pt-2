# Service Implementation Validation Checklist

Complete this checklist before considering a service implementation done.

---

## 1. Directory Structure

**Pattern A (Contract-First)**:
- [ ] `services/{domain}/keys.ts` exists
- [ ] `services/{domain}/{feature}.ts` exists (business logic)
- [ ] `services/{domain}/{feature}.test.ts` exists (tests)
- [ ] `services/{domain}/README.md` exists

**Pattern B (Canonical CRUD)**:
- [ ] `services/{domain}/keys.ts` exists
- [ ] `services/{domain}/README.md` exists
- [ ] No business logic files (logic in Server Actions/hooks)

**Pattern C (Hybrid)**:
- [ ] Mix of Pattern A and B files as appropriate

---

## 2. React Query Keys (ALL PATTERNS)

- [ ] `keys.ts` imports `serializeKeyFilters` from `@/services/shared/key-utils`
- [ ] `keys.ts` exports typed filter interfaces (e.g., `PlayerListFilters`)
- [ ] `keys.ts` defines `ROOT` constant as `const` array
- [ ] All key factories return `as const` for type narrowing
- [ ] List/collection keys use `serialize()` for filter stability
- [ ] Scope keys defined for hierarchical invalidation (`.scope`)

**Example validation**:
```typescript
// ✅ CORRECT
const ROOT = ['domain'] as const;  // as const
const serialize = (filters: DomainFilters = {}) => serializeKeyFilters(filters);

export const domainKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: DomainFilters = {}) => [...ROOT, 'list', serialize(filters)] as const,
    { scope: [...ROOT, 'list'] as const },  // Scope for invalidation
  ),
};
```

---

## 3. DTO Standards Compliance

### Pattern A (Contract-First)

- [ ] DTOs defined inline in `{feature}.ts` (or separate `dtos.ts` if extracted)
- [ ] Mapper functions defined (e.g., `buildXRpcInput()`, `toXDTO()`)
- [ ] Domain contracts documented with JSDoc
- [ ] No direct Database type derivation (manual interfaces allowed)

### Pattern B (Canonical CRUD)

- [ ] DTOs documented in README.md
- [ ] ALL DTOs use `Pick<Database['public']['Tables']['x']['Row/Insert'], ...>`
- [ ] NO manual `interface` definitions for DTOs
- [ ] Column selections explicitly listed (not `Omit` of single field)
- [ ] Uses `Insert` for create DTOs, `Row` for response DTOs
- [ ] Auto-generated fields (`id`, `created_at`) omitted from create DTOs

**Validation command**:
```bash
npx eslint services/{domain}/*.ts
# Should have 0 errors about manual DTO interfaces
```

---

## 4. Bounded Context Integrity

- [ ] Service only accesses tables it owns (per SRM)
- [ ] No direct `Database['public']['Tables']['foreign_table']` access
- [ ] Foreign data consumed via published DTOs from owning services
- [ ] Cross-service dependencies documented in README.md

**Validation command**:
```bash
npx eslint services/{domain}/*.ts
# Check for "BOUNDED CONTEXT VIOLATION" errors
```

**Manual check**:
```typescript
// Search for cross-context violations
grep -r "Database\['public'\]\['Tables'\]" services/{domain}/

// Verify all table names are owned by this service (check SRM)
```

---

## 5. Type Safety

- [ ] `supabase` parameter typed as `SupabaseClient<Database>` (never `any`)
- [ ] Service functions have explicit return types
- [ ] NO `ReturnType<typeof createService>` inference
- [ ] NO `as any` type casting
- [ ] All DTOs exported for consumer use

**Validation command**:
```bash
npm run type-check
# Should compile with 0 errors
```

---

## 6. Service README.md

- [ ] README exists with required sections
- [ ] Bounded context one-sentence description
- [ ] SRM reference with section numbers
- [ ] Pattern selection justified (A/B/C and why)
- [ ] Table ownership documented
- [ ] Published DTOs listed
- [ ] RPCs listed (if any)
- [ ] Dependencies documented (consumes/consumed by)
- [ ] Cross-references to SLAD, DTO standards

**Template verification**:
```markdown
# {ServiceName} - {Bounded Context}

> **Bounded Context**: "One-sentence description"
> **SRM Reference**: [SERVICE_RESPONSIBILITY_MATRIX.md §X-Y](...)
> **Status**: Implemented / In Progress

## Ownership
**Tables**: ...
**DTOs**: ...
**RPCs**: ...

## Pattern
Pattern A/B/C (explain why)

## References
- [SRM §X-Y](...)
```

---

## 7. Testing

**Pattern A (Contract-First) - REQUIRED**:
- [ ] `{feature}.test.ts` exists
- [ ] Tests cover happy path
- [ ] Tests cover error cases
- [ ] Tests cover input validation
- [ ] Tests use mocked Supabase client
- [ ] Tests have ~80% coverage

**Pattern B (Canonical CRUD) - OPTIONAL**:
- [ ] Tests may be in Server Actions or integration tests

**Validation command**:
```bash
npm test services/{domain}/{feature}.test.ts
# Should pass with 0 failures
```

---

## 8. Database Migration (If Required)

- [ ] Migration file follows `YYYYMMDDHHMMSS_description.sql` naming
- [ ] All new tables have `ENABLE ROW LEVEL SECURITY`
- [ ] RLS policies defined for all tables
- [ ] Indexes added for foreign keys
- [ ] Migration applied via `npx supabase migration up`
- [ ] Types regenerated via `npm run db:types`
- [ ] Schema verification test passes

**Validation commands**:
```bash
# Verify migration naming
ls supabase/migrations/ | grep "^[0-9]\{14\}_"

# Verify types regenerated
git status types/database.types.ts
# Should show modifications if tables changed

# Verify schema alignment
npm test -- schema-verification
```

---

## 9. RLS Policy Coverage

- [ ] Every table has at least one RLS policy
- [ ] Policies follow standard patterns (casino-scoped, player self-access, etc.)
- [ ] Policy names follow convention: `{role}_{action}_{table}`
- [ ] Policies tested (manual or automated)

**Validation script**:
```bash
# Run RLS coverage check
node scripts/validate-rls-coverage.js
```

---

## 10. Anti-Pattern Detection

**Run all anti-pattern checks**:

- [ ] No class-based services (use functional factories)
- [ ] No global singletons
- [ ] No `console.*` in production code
- [ ] No deprecated code marked `@deprecated`
- [ ] No missing README.md
- [ ] No cross-context Database type access

**Validation command**:
```bash
# Pre-commit hook simulation
.husky/pre-commit-service-check.sh

# Should exit with 0 errors
```

---

## 11. Documentation Consistency Check

- [ ] Service implementation matches SERVICE_TEMPLATE pattern
- [ ] DTOs follow DTO_CANONICAL_STANDARD rules
- [ ] Bounded context matches SRM ownership
- [ ] No conflicting guidance between docs

**Manual verification**:
1. Read SERVICE_TEMPLATE.md pattern description
2. Compare with actual service implementation
3. Flag inconsistencies for user review

---

## 12. SRM Update

- [ ] Service added to SERVICE_RESPONSIBILITY_MATRIX.md
- [ ] Table ownership documented
- [ ] Cross-service dependencies listed
- [ ] Bounded context description added

**Location**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

---

## 13. Integration Testing

**Before marking service complete**:

- [ ] Service integrates with existing codebase
- [ ] No circular dependencies
- [ ] Compiles without errors
- [ ] Existing tests still pass
- [ ] No regressions introduced

**Validation commands**:
```bash
npm run type-check  # TypeScript compilation
npm test            # All tests pass
npm run build       # Production build succeeds
```

---

## Quick Validation Script

Run all checks at once:

```bash
#!/bin/bash
# validate-service.sh

DOMAIN=$1

echo "Validating service: $DOMAIN"
echo "================================"

# 1. Check file structure
echo "1. File structure..."
[[ -f "services/$DOMAIN/keys.ts" ]] || echo "❌ Missing keys.ts"
[[ -f "services/$DOMAIN/README.md" ]] || echo "❌ Missing README.md"

# 2. ESLint validation
echo "2. ESLint validation..."
npx eslint services/$DOMAIN/*.ts --max-warnings 0

# 3. Type check
echo "3. Type check..."
npm run type-check

# 4. Run tests
echo "4. Tests..."
npm test services/$DOMAIN/

# 5. RLS coverage
echo "5. RLS coverage..."
node scripts/validate-rls-coverage.js

echo "================================"
echo "Validation complete!"
```

**Usage**:
```bash
chmod +x scripts/validate-service.sh
./scripts/validate-service.sh loyalty
```

---

## Final Checklist

Before marking service as **COMPLETE**:

- [ ] All validation checks pass
- [ ] README.md reviewed and complete
- [ ] Tests written and passing
- [ ] Documentation updated (SRM, service catalog)
- [ ] No ESLint errors or warnings
- [ ] TypeScript compiles
- [ ] Migrations applied and types regenerated
- [ ] RLS policies verified
- [ ] Peer review completed (if applicable)

**Sign-off**:
- Implementation reviewed by: __________
- Documentation reviewed by: __________
- Tests reviewed by: __________
- Date: __________

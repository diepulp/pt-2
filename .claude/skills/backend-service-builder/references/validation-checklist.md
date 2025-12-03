# Service Implementation Validation Checklist

**Source**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (SLAD v2.1.2 §308-348)
**Registry**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (SRM - bounded context registry only)

Complete this checklist before considering a service implementation done.

---

## 1. Directory Structure (SLAD §308-348)

**Pattern A (Contract-First)** - Loyalty, Finance, MTL, TableContext:

- [ ] `services/{domain}/dtos.ts` exists (manual interfaces for domain contracts)
- [ ] `services/{domain}/mappers.ts` exists (REQUIRED - Database ↔ DTO)
- [ ] `services/{domain}/selects.ts` exists (named column sets)
- [ ] `services/{domain}/keys.ts` exists (React Query factories with `.scope`)
- [ ] `services/{domain}/http.ts` exists (HTTP fetchers)
- [ ] `services/{domain}/index.ts` exists (explicit interface + factory)
- [ ] `services/{domain}/crud.ts` exists (CRUD operations)
- [ ] `services/{domain}/{feature}.test.ts` exists (tests)
- [ ] `services/{domain}/README.md` exists

**Pattern B (Canonical CRUD)** - Player, Visit, Casino, FloorLayout:

- [ ] `services/{domain}/dtos.ts` exists (Pick/Omit from Database types)
- [ ] `services/{domain}/selects.ts` exists (named column sets)
- [ ] `services/{domain}/keys.ts` exists (React Query factories with `.scope`)
- [ ] `services/{domain}/http.ts` exists (HTTP fetchers)
- [ ] `services/{domain}/index.ts` exists (explicit interface + factory)
- [ ] `services/{domain}/crud.ts` exists (CRUD operations)
- [ ] `services/{domain}/README.md` exists
- [ ] NO `mappers.ts` file (banned for Pattern B)

**Pattern C (Hybrid)** - RatingSlip:

- [ ] Mix of Pattern A and B files as appropriate per feature

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
const ROOT = ["domain"] as const; // as const
const serialize = (filters: DomainFilters = {}) => serializeKeyFilters(filters);

export const domainKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: DomainFilters = {}) =>
      [...ROOT, "list", serialize(filters)] as const,
    { scope: [...ROOT, "list"] as const }, // Scope for invalidation
  ),
};
```

---

## 3. DTO Standards Compliance (SLAD §356-566)

### Pattern A (Contract-First) - Loyalty, Finance, MTL, TableContext

- [ ] DTOs defined in `dtos.ts` (manual `interface` or `type` allowed)
- [ ] `mappers.ts` exists with Database ↔ DTO transformations
- [ ] Mapper functions: `toXDTO(row: DbRow): XDTO`
- [ ] RPC input builders: `buildXRpcInput(input: XInput): XRpcInput`
- [ ] Domain contracts documented with JSDoc
- [ ] Mappers use `Database` types as source of truth

### Pattern B (Canonical CRUD) - Player, Visit, Casino, FloorLayout

- [ ] DTOs defined in `dtos.ts` using `type` (NOT `interface`)
- [ ] ALL DTOs use `Pick<Database['public']['Tables']['x']['Row/Insert'], ...>`
- [ ] NO manual `interface` definitions for DTOs
- [ ] Column selections explicitly listed (not `Omit` of single field)
- [ ] Uses `Insert` for create DTOs, `Row` for response DTOs
- [ ] Auto-generated fields (`id`, `created_at`) omitted from create DTOs
- [ ] NO `mappers.ts` file

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
- [ ] NO `as ConcreteType` casting for RPC/query responses (V1 violation)
- [ ] All DTOs exported for consumer use
- [ ] RPC responses use generated `Database['public']['Functions']['rpc_*']['Returns']` types
- [ ] Mapper functions created for RPC → DTO transformation
- [ ] Complex RPC returns have type guards for runtime validation

**Validation command**:

```bash
npm run type-check
# Should compile with 0 errors

# Search for type casting violations:
grep -r "as [A-Z].*DTO" services/
# Should return 0 results
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
- [ ] No `as Type` casting for RPC/query responses
- [ ] No duplicate infrastructure type definitions (ServiceResult, DomainError)

**Validation command**:

```bash
# Pre-commit hook simulation
.husky/pre-commit-service-check.sh

# Should exit with 0 errors

# Check for type casting anti-patterns:
grep -rn "data as [A-Z]" services/
grep -rn "as {" services/
# Both should return 0 results
```

---

## 10a. Security Validation (V4 Critical)

**Canonical Reference**: `.claude/skills/backend-service-builder/references/security-patterns.md`

- [ ] Casino context derived from authenticated user's staff record
- [ ] NO `headers.get('x-casino-id')` or similar
- [ ] NO `body.casinoId` accepted from client for context
- [ ] NO empty string fallbacks for context (`?? ''`)
- [ ] Staff record lookup uses `user.id` from Supabase auth
- [ ] DomainError thrown if context cannot be derived

**Validation command**:

```bash
# Search for dangerous header trust patterns:
grep -rn "headers.get.*casino" app/
grep -rn "x-casino-id" app/
# Should return 0 results in production code
```

---

## 11. Documentation Consistency Check

- [ ] Service implementation matches SLAD §308-350 pattern
- [ ] DTOs follow DTO_CANONICAL_STANDARD rules
- [ ] Bounded context matches SRM ownership
- [ ] No conflicting guidance between docs

**Manual verification**:

1. Read SLAD §308-350 pattern requirements
2. Compare with actual service implementation

---

## 11a. Documentation Updates Required (V6, W2, W3)

**After implementing a service, update these artifacts:**

### Domain Error Codes (V6)

- [ ] Add domain error codes to `services/{domain}/README.md`:

```markdown
## Domain Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `ENTITY_NOT_FOUND` | 404 | ... |
| `ENTITY_INVALID_STATE` | 409 | ... |
```

- [ ] Verify codes are registered in `lib/errors/domain-errors.ts` (if new domain)

### DTO Catalog (W2)

- [ ] Update `docs/25-api-data/DTO_CATALOG.md` with new DTOs:

```markdown
### {ServiceName} DTOs

| DTO | Pattern | Location | Description |
|-----|---------|----------|-------------|
| `EntityDTO` | A | `services/{domain}/dtos.ts` | ... |
| `EntityCreateDTO` | A | `services/{domain}/dtos.ts` | ... |
```

### Service Index Exports (W3)

- [ ] `services/{domain}/index.ts` re-exports all public functions:

```typescript
// services/{domain}/index.ts
export { functionA, functionB } from './feature';
export type { DTOA, DTOB } from './dtos';
export { domainKeys } from './keys';
```

### Service Catalog Memory (Optional)

- [ ] Update `memory/service-catalog.memory.md` if new service added

---

## 12. SRM Registry Update

> **Note**: SRM serves as bounded context registry only. SLAD is the authoritative source for implementation patterns.

- [ ] Service added to SERVICE_RESPONSIBILITY_MATRIX.md
- [ ] Table ownership documented
- [ ] Cross-service dependencies listed
- [ ] Bounded context description added

**Location**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (registry only)
**Pattern Authority**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` (SLAD)

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

### Core Implementation
- [ ] All validation checks pass
- [ ] README.md reviewed and complete
- [ ] Tests written and passing
- [ ] No ESLint errors or warnings
- [ ] TypeScript compiles

### Database & Types
- [ ] Migrations applied and types regenerated
- [ ] RLS policies verified
- [ ] RPC types generated and used (no `as` casting)

### Security (V4 Critical)
- [ ] Casino context derived from auth, not client input
- [ ] No header/body trust for tenant context

### Documentation Updates
- [ ] Domain error codes in README.md (V6)
- [ ] DTO_CATALOG.md updated (W2)
- [ ] Service index.ts exports all public APIs (W3)
- [ ] SRM updated (if new service)

### Shared Types
- [ ] No duplicate ServiceResult/DomainError definitions (V3)
- [ ] Imports from canonical locations (`lib/http/`, `lib/errors/`)

### Error Handling (ADR-012)
- [ ] Service functions throw DomainError (not return ServiceResult)
- [ ] Transport layer uses withServerAction wrapper

### Final
- [ ] Peer review completed (if applicable)

**Sign-off**:

- Implementation reviewed by: ****\_\_****
- Documentation reviewed by: ****\_\_****
- Tests reviewed by: ****\_\_****
- Date: ****\_\_****

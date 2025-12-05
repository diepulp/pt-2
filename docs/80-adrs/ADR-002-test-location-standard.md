# ADR-002: Test File Organization Pattern

**Status**: Accepted (v3.0.0)
**Date**: 2025-10-07 (Original), 2025-11-29 (v2.0.0), 2025-12-03 (v3.0.0)
**Deciders**: Tech Lead, Development Team, Lead Architect
**Related**: ESLint configuration (`eslint.config.mjs`), QA-004, GOV-PAT-001

---

## Amendment Notice (2025-12-03)

This ADR is amended to adopt the `__tests__/` subdirectory pattern, superseding the v2.0.0 co-located pattern decision.

**v2.0.0 claim**: "100% of services use co-located pattern"
**Actual state**: `lib/` modules already use `__tests__/` subdirectories - inconsistency exists
**Decision**: Standardize on `__tests__/` subdirectory pattern for all modules

---

## Context and Problem Statement

The casino service has 8 test files scattered alongside 8 source files:

```
services/casino/                    # BEFORE: 16 entries
├── casino.integration.test.ts      # Test
├── casino.test.ts                  # Test
├── crud.ts                         # Source
├── crud.unit.test.ts               # Test
├── dtos.ts                         # Source
├── gaming-day.test.ts              # Test
├── http.ts                         # Source
├── index.ts                        # Source
├── keys.test.ts                    # Test
├── keys.ts                         # Source
├── mappers.test.ts                 # Test
├── mappers.ts                      # Source
├── README.md                       # Docs
├── schemas.test.ts                 # Test
├── schemas.ts                      # Source
├── selects.ts                      # Source
└── service.test.ts                 # Test
```

**Problems identified**:
1. Directory clutter (50% test files)
2. Hard to scan for production code
3. Inconsistent with `lib/` modules which use `__tests__/`
4. Against industry conventions (Jest, Vitest, React all recommend `__tests__/`)

---

## Decision Drivers

1. **Consistency**: Align services with existing `lib/*/__tests__/` pattern
2. **Developer Experience**: Clean directories with only production code at root
3. **Industry Standards**: Jest, Vitest, React ecosystem conventions
4. **Tooling**: Easier to exclude tests from production builds
5. **Discoverability**: Clear visual separation of tests vs source

---

## Decision Outcome

**Chosen Option**: `__tests__/` subdirectory pattern

### Pattern

```
services/casino/                    # AFTER: 9 entries
├── __tests__/
│   ├── casino.test.ts
│   ├── casino.integration.test.ts
│   ├── crud.unit.test.ts
│   ├── gaming-day.test.ts
│   ├── keys.test.ts
│   ├── mappers.test.ts
│   ├── schemas.test.ts
│   └── service.test.ts
├── crud.ts
├── dtos.ts
├── http.ts
├── index.ts
├── keys.ts
├── mappers.ts
├── README.md
├── schemas.ts
└── selects.ts
```

**Result**: 50% reduction in root directory entries (16 → 9)

### Canonical Directory Structure

```
services/{domain}/
├── __tests__/
│   ├── {domain}.test.ts              # Unit tests
│   ├── {domain}.integration.test.ts  # Integration tests
│   └── {feature}.test.ts             # Feature-specific tests
├── index.ts                          # Public API (factory + interface)
├── crud.ts                           # CRUD operations
├── dtos.ts                           # DTOs
├── schemas.ts                        # Zod validation schemas
├── mappers.ts                        # Row → DTO mappers
├── keys.ts                           # Query keys
├── selects.ts                        # Named select strings
└── README.md                         # Service documentation
```

### Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Unit tests | `*.test.ts` | `casino.test.ts` |
| Integration tests | `*.integration.test.ts` | `casino.integration.test.ts` |
| Feature tests | `{feature}.test.ts` | `gaming-day.test.ts` |
| Unit tests (explicit) | `*.unit.test.ts` | `crud.unit.test.ts` |

---

## Rationale

### Why `__tests__/` Subdirectory

1. **Existing Pattern**: `lib/http/__tests__/`, `lib/query/__tests__/`, `lib/server-actions/middleware/__tests__/` already use this pattern

2. **Industry Standard**:
   - [Jest testMatch](https://jestjs.io/docs/configuration#testmatch-arraystring): Recommends `**/__tests__/**/*.[jt]s?(x)`
   - [Vitest](https://vitest.dev/guide/#test-files): Documents `__tests__/` as standard
   - React ecosystem: Create React App, Next.js examples use `__tests__/`

3. **Developer Experience**:
   - Clean source directories
   - Easy to find production code
   - Natural grouping for test utilities

4. **Build/CI Optimization**:
   - Simple glob for exclusion: `!**/__tests__/**`
   - Coverage reports clearly separated
   - Production bundle easily excludes tests

### Tradeoffs Accepted

| Tradeoff | Impact | Mitigation |
|----------|--------|------------|
| Longer import paths | `../index` vs `./index` | Minor, 2 chars |
| Directory switch when editing | One level deeper | IDE shortcuts |
| Migration effort | ~12 files to move | Automated script |

---

## ESLint Configuration

Test files are excluded from strict service layer rules via `eslint.config.mjs`:

### Service Layer Config (excludes tests)

```javascript
{
  files: ['services/**/*.ts', 'services/**/*.tsx'],
  ignores: [
    '**/node_modules/**',
    '**/__tests__/**',           // __tests__ subdirectories
    '**/*.test.ts',              // Backward compatibility
    '**/*.integration.test.ts',
    '**/*.spec.ts',
  ],
  // ... strict service rules (explicit return types, custom DTO rules, etc.)
}
```

### Test File Override (at end for highest precedence)

```javascript
{
  files: [
    'services/**/__tests__/**/*.ts',
    'services/**/__tests__/**/*.tsx',
    // Backward compatibility during migration
    'services/**/*.test.ts',
    'services/**/*.integration.test.ts',
  ],
  rules: {
    'no-restricted-imports': 'off',
    '@typescript-eslint/consistent-type-assertions': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    'no-console': 'off',
    'no-warning-comments': 'off',
  },
}
```

---

## Jest/Vitest Configuration

**No changes required.** Current configuration already supports both patterns:

```javascript
// jest.config.js / vitest.config.ts
testMatch: [
  '**/__tests__/**/*.(test|spec).[jt]s?(x)',  // ✅ Supports new pattern
  '**/?(*.)+(spec|test).[jt]s?(x)',           // ✅ Backward compatible
],
```

---

## Migration Plan

### Affected Files

**Services to migrate** (12 test files):
- `services/casino/*.test.ts` (8 files)
- `services/loyalty/mid-session-reward.test.ts`
- `services/mtl/view-model.test.ts`
- `services/player/player.service.test.ts`
- `services/visit/visit.service.test.ts`

### Migration Commands

```bash
# 1. Create __tests__ directories and move files
for service in casino loyalty mtl player visit; do
  if ls services/$service/*.test.ts 2>/dev/null; then
    mkdir -p services/$service/__tests__
    git mv services/$service/*.test.ts services/$service/__tests__/
  fi
done

# 2. Fix import paths in test files (change ./ to ../)
find services -path '*/__tests__/*.ts' -exec sed -i '' \
  -e "s|from '\./|from '../|g" \
  -e "s|from \"\./|from \"../|g" {} \;

# 3. Verify tests pass
npm run test

# 4. Commit
git add .
git commit -m "refactor: migrate tests to __tests__/ subdirectories per ADR-002 v3.0.0"
```

### Rollback

If issues arise:

```bash
git revert HEAD
# Tests continue to work (Jest supports both patterns)
```

---

## Consequences

### Positive

- **Consistency**: Aligns with existing `lib/*/__tests__/` pattern
- **Clean Directories**: 50% reduction in root-level entries
- **Industry Alignment**: Matches Jest, Vitest, React conventions
- **Build Optimization**: Simple glob exclusion for production
- **Discoverability**: Clear test/source separation

### Negative

- **Migration Required**: ~12 files need moving (one-time effort)
- **Longer Imports**: `../index` vs `./index` (minimal impact)

### Neutral

- **Jest Configuration**: No changes needed
- **Coverage**: No impact on reporting
- **CI/CD**: No pipeline changes needed

---

## Compliance with PRD

**PRD §3.10 Testing & CI/CD:**
> "Mandatory Jest/RTL unit tests and integration tests per feature slice"

This ADR supports PRD compliance by:
- Standardizing test location for consistent CI/CD
- Proper ESLint configuration prevents false positives
- Clear naming convention for unit vs integration tests
- Industry-standard organization improves maintainability

---

## Alternatives Considered

### Option 1: Root-level `__tests__/services/`

```
__tests__/
└── services/
    ├── casino/
    │   └── casino.test.ts
    └── player/
        └── player.test.ts
```

**Rejected**: Tests too far from source, poor discoverability, breaks colocation principle.

### Option 2: Co-located `services/*/*.test.ts` (v2.0.0)

```
services/casino/
├── casino.test.ts
├── crud.ts
└── ...
```

**Rejected**: Creates directory clutter, inconsistent with `lib/` modules, against industry conventions.

---

## References

- [Jest: testMatch Configuration](https://jestjs.io/docs/configuration#testmatch-arraystring)
- [Vitest: Test File Conventions](https://vitest.dev/guide/#test-files)
- [Kent C. Dodds: Colocation](https://kentcdodds.com/blog/colocation)
- ESLint Flat Config: `eslint.config.mjs`

---

## Approval

- [x] **Lead Architect**: Approved 2025-12-03
- [x] **Tech Lead**: Approved via executive decision
- [ ] **Migration**: Pending execution

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2025-10-07 | Original: root-level `__tests__/services/` |
| v2.0.0 | 2025-11-29 | Amendment: co-located pattern |
| v3.0.0 | 2025-12-03 | **Current**: `__tests__/` subdirectory pattern |

**Version**: 3.0.0
**Effective Date**: 2025-12-03

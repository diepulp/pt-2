# ADR-002: Test Location Standardization

**Status**: Accepted (Amended 2025-11-29)
**Date**: 2025-10-07 (Original), 2025-11-29 (Amended)
**Deciders**: Tech Lead, Development Team
**Related**: ESLint configuration update (`eslint.config.mjs`)

---

## Amendment Notice (2025-11-29)

This ADR was amended to reflect actual codebase reality. The original decision (Option 1: root-level `__tests__/services/`) was never implemented. All 13 service test files follow the co-located pattern (`services/*/*.test.ts`).

**Original claim**: 67% of services used root-level pattern (4/6)
**Actual state**: 100% of services use co-located pattern (13/13 test files)

The decision is hereby amended to standardize on **Option 2: Co-located tests**.

---

## Context and Problem Statement

During service layer implementation, test file locations needed standardization. ESLint was flagging test files with production rules (explicit return types, restricted imports, custom DTO rules) causing false positives.

**Actual Test Distribution (as of 2025-11-29):**
```
services/
├── casino/casino.test.ts
├── loyalty/mid-session-reward.test.ts
├── mtl/view-model.test.ts
├── player/player.test.ts
├── rating-slip/
│   ├── duration.integration.test.ts
│   ├── lifecycle.integration.test.ts
│   ├── lifecycle.test.ts
│   ├── state-machine.test.ts
│   └── unique-constraint.integration.test.ts
└── table-context/
    ├── table-operations.integration.test.ts
    ├── table-operations.test.ts
    ├── table-state-machine.simple.test.ts
    └── table-state-machine.test.ts
```

---

## Decision Drivers

1. **Consistency**: Single pattern across all services
2. **Reality Alignment**: Match existing codebase (100% co-located)
3. **Developer Experience**: Tests adjacent to source code
4. **Zero Migration**: No file moves required
5. **Modern Tooling**: Vitest, Jest, and modern frameworks support co-location

---

## Decision Outcome

**Chosen Option**: **Option 2 - Co-Located `services/*/*.test.ts`**

### Pattern

```
services/
├── player/
│   ├── index.ts
│   ├── crud.ts
│   ├── player.test.ts           # Unit tests
│   └── player.integration.test.ts # Integration tests
└── casino/
    ├── index.ts
    ├── crud.ts
    └── casino.test.ts
```

### Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Unit tests | `*.test.ts` | `lifecycle.test.ts` |
| Integration tests | `*.integration.test.ts` | `duration.integration.test.ts` |
| Simple/focused tests | `*.simple.test.ts` | `table-state-machine.simple.test.ts` |

### Rationale

1. **Reality**: 100% of existing services already follow this pattern
2. **Zero Migration**: No files need to be moved
3. **Proximity**: Tests are adjacent to the code they test
4. **Modern Convention**: Matches Vitest, modern Jest, and React ecosystem trends
5. **Import Simplicity**: Shorter relative paths for test imports

---

## ESLint Configuration

Test files are excluded from strict service layer rules via `eslint.config.mjs`:

### Service Layer Config (excludes tests)
```javascript
{
  files: ['services/**/*.ts', 'services/**/*.tsx'],
  ignores: ['**/*.test.ts', '**/*.integration.test.ts', '**/*.spec.ts'],
  // ... strict service rules (explicit return types, custom DTO rules, etc.)
}
```

### Test File Override (at end for highest precedence)
```javascript
{
  files: [
    'services/**/*.test.ts',
    'services/**/*.integration.test.ts',
    'services/**/*.spec.ts',
  ],
  rules: {
    'no-restricted-imports': 'off',        // Tests may use direct Supabase client
    '@typescript-eslint/consistent-type-assertions': 'off',  // Mocking needs flexibility
    '@typescript-eslint/explicit-function-return-type': 'off',
    'no-console': 'off',                   // Debug logging allowed
    'no-warning-comments': 'off',          // @deprecated comments allowed
  },
}
```

---

## Consequences

### Positive

- **Zero Migration**: No file moves required
- **Consistency**: Single pattern enforced
- **Tooling**: ESLint properly configured for test files
- **Developer Experience**: Tests next to source code

### Neutral

- **Test Discovery**: Jest finds tests in either location
- **Coverage**: No impact on coverage reporting

---

## Compliance with PRD

**PRD §3.10 Testing & CI/CD:**
> "Mandatory Jest/RTL unit tests and integration tests per feature slice"

This ADR supports PRD compliance by:
- Standardizing test location for consistent CI/CD
- Proper ESLint configuration prevents false positives
- Clear naming convention for unit vs integration tests

---

## References

- [Jest testMatch configuration](https://jestjs.io/docs/configuration#testmatch-arraystring)
- [Vitest test file conventions](https://vitest.dev/guide/)
- ESLint Flat Config: `eslint.config.mjs`

---

## Approval

- [x] **Tech Lead**: Approved (via codebase reality)
- [x] **ESLint Configuration**: Implemented 2025-11-29
- [x] **Documentation**: ADR amended to reflect reality

**Amendment Date**: 2025-11-29

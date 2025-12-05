---
id: ADR-002
title: Test File Organization Pattern
status: Accepted
created: 2025-11-20
last_updated: 2025-12-03
supersedes: ADR-002 (Amendment 2025-11-29)
affects: [QA-004, GOV-PAT-001, DEL/QA]
---

## Context

PT-2 requires a consistent test organization pattern that balances:
- Developer experience (finding tests and source code)
- Code navigation and directory clarity
- Industry conventions and tool support
- Consistency across the codebase
- Production build optimization

**Problem**: Tests were initially co-located alongside source files (e.g., `services/casino/casino.test.ts` next to `services/casino/index.ts`), creating directory clutter where 50% of file entries were tests rather than production code.

**Discovery**: The codebase already had an inconsistent pattern - `lib/*` modules used `__tests__/` subdirectories while service modules used co-location. This violated the "Single Organizational Pattern" principle.

## Decision

**Adopt `__tests__/` subdirectory pattern for all test files across the PT-2 codebase.**

### Pattern Structure

```
services/casino/
├── __tests__/
│   ├── casino.test.ts              # Unit tests
│   ├── casino.integration.test.ts  # Integration tests
│   ├── gaming-day.test.ts
│   ├── schemas.test.ts
│   ├── crud.unit.test.ts
│   ├── keys.test.ts
│   ├── service.test.ts
│   └── mappers.test.ts
├── crud.ts                         # Production code
├── dtos.ts
├── gaming-day.ts
├── http.ts
├── index.ts
├── keys.ts
├── mappers.ts
├── README.md
├── schemas.ts
└── selects.ts
```

### Naming Conventions

Test files follow these suffixes within `__tests__/`:

| Test Type | Pattern | Example |
|-----------|---------|---------|
| Unit tests | `*.test.ts` | `casino.test.ts` |
| Unit tests (explicit) | `*.unit.test.ts` | `crud.unit.test.ts` |
| Integration tests | `*.integration.test.ts` | `casino.integration.test.ts` |
| E2E tests | `*.e2e.test.ts` | `player-lifecycle.e2e.test.ts` |

**Note**: Generic `*.test.ts` implies unit tests. Use explicit suffixes when clarity is needed.

## Rationale

### Why `__tests__/` Over Co-location

1. **Consistency**: `lib/http/__tests__/`, `lib/query/__tests__/`, and `lib/server-actions/middleware/__tests__/` already use this pattern
2. **Industry Standard**: Jest, React, and Vitest documentation recommend `__tests__/` subdirectories
3. **Directory Clarity**: Separates test files from production code (50% reduction in directory clutter)
4. **Navigation**: Easier to distinguish production files at a glance
5. **Build Optimization**: Simpler to exclude from production builds with glob patterns
6. **Tool Support**: Jest's default `testMatch` pattern explicitly includes `**/__tests__/**/*.(test|spec).[jt]s?(x)`

### Why NOT Co-location

- **Directory Pollution**: services/casino/ had 8 test files + 8 source files = 16 entries (hard to scan)
- **Inconsistency**: Would perpetuate the lib/* vs services/* pattern mismatch
- **Cognitive Load**: Harder to mentally filter tests from source when interleaved

### Why NOT Root-level `__tests__/services/`

- **Import Path Complexity**: `../../../services/casino/index` vs `../index`
- **Context Switching Overhead**: Tests far from implementation reduce locality
- **Not Industry Standard**: Most frameworks recommend co-located test directories

## Consequences

### Positive

- ✅ **Clean source directories**: Only production code visible at module root
- ✅ **Clear test discovery**: All tests grouped in predictable location
- ✅ **Consistency**: Same pattern across lib/* and services/*
- ✅ **Tool-friendly**: Jest, ESLint, and build tools naturally support this
- ✅ **Maintainability**: Easier to enforce test coverage and naming conventions

### Negative

- ⚠️ **Import path change**: `import { x } from './index'` becomes `import { x } from '../index'`
- ⚠️ **Directory switching**: Developers toggle between `__tests__/` and parent directory
- ⚠️ **Migration effort**: ~12 test files need moving in services/*

### Neutral

- File count unchanged (same number of test files, just organized differently)
- Jest configuration unchanged (already supports both patterns)

## Implementation

### Jest Configuration

No changes required. Current config already supports `__tests__/`:

```js
// jest.config.js
testMatch: [
  '**/__tests__/**/*.(test|spec).[jt]s?(x)', // ✅ Supports __tests__/
  '**/?(*.)+(spec|test).[jt]s?(x)',          // ✅ Supports co-located (backward compat)
],
```

### ESLint Configuration

No changes required. ESLint resolves test files via Jest's testMatch pattern.

### Migration Script

```bash
# services/casino/
mkdir -p services/casino/__tests__
mv services/casino/*.test.ts services/casino/__tests__/
mv services/casino/*.integration.test.ts services/casino/__tests__/

# services/loyalty/
mkdir -p services/loyalty/__tests__
mv services/loyalty/*.test.ts services/loyalty/__tests__/

# services/mtl/
mkdir -p services/mtl/__tests__
mv services/mtl/*.test.ts services/mtl/__tests__/

# services/player/
mkdir -p services/player/__tests__
mv services/player/*.test.ts services/player/__tests__/

# services/visit/
mkdir -p services/visit/__tests__
mv services/visit/*.test.ts services/visit/__tests__/
```

### Import Path Updates

Update test imports from:
```ts
import { createCasinoService } from './index';
```

To:
```ts
import { createCasinoService } from '../index';
```

(Most IDEs auto-fix this on file move.)

## Alternatives Considered

### Alternative 1: Co-located tests (Rejected)

**Pattern**: `services/casino/casino.test.ts` alongside `services/casino/casino.ts`

**Rejected because**:
- Creates directory clutter (50% of entries are tests)
- Inconsistent with existing lib/* pattern
- Harder to exclude from production builds
- Not the Jest/React community standard

### Alternative 2: Root-level `__tests__/services/` (Rejected)

**Pattern**: `__tests__/services/casino/casino.test.ts`

**Rejected because**:
- Long import paths (`../../../services/casino/index`)
- Tests far from implementation (high context-switching cost)
- Not industry standard for service/module testing
- Would be inconsistent with lib/* pattern

## Exceptions

None. All test files must follow the `__tests__/` subdirectory pattern.

**Enforcement**: Pre-commit hook rejects test files outside `__tests__/` directories (except legacy files during migration grace period ending 2025-12-10).

## References

### Internal Documents

- **QA-004**: TDD Standard (test directory patterns updated in Section 2)
- **GOV-PAT-001**: Service Factory Pattern (Section 7: Testing Pattern updated)
- **SDLC_DOCS_TAXONOMY.md**: DEL/QA category placement

### External Resources

- [Jest: Filename Conventions](https://jestjs.io/docs/configuration#testmatch-arraystring)
- [Vitest: Test Files](https://vitest.dev/guide/#test-files)
- [React Testing Library: Project Structure](https://kentcdodds.com/blog/colocation)

## Review & Approval

| Role | Name | Status | Date |
|------|------|--------|------|
| Architecture Lead | - | ✅ Accepted | 2025-12-03 |
| QA Lead | - | ✅ Accepted | 2025-12-03 |
| Engineering Lead | - | ✅ Accepted | 2025-12-03 |

**Next Review**: 2026-03-03 (3 months post-adoption)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 3.0.0 | 2025-12-03 | Adopted `__tests__/` subdirectory pattern; supersedes Amendment 2025-11-29 |
| 2.1.0 | 2025-11-29 | Amendment: Adopted co-located tests (superseded) |
| 2.0.0 | 2025-11-20 | Formalized test organization options |
| 1.0.0 | 2025-11-15 | Initial test file naming conventions |

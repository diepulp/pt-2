# ADR-002: Test Location Standardization

**Status**: Proposed
**Date**: 2025-10-07
**Deciders**: Tech Lead, Development Team
**Related**: [TEST_LOCATION_INCONSISTENCY.md](./TEST_LOCATION_INCONSISTENCY.md)

---

## Context and Problem Statement

During Phase 2 service layer implementation, an inconsistency emerged in test file locations:
- 4 services (Player, Visit, RatingSlip, PlayerFinancial) have tests in `__tests__/services/`
- 2 services (Casino, TableContext) have co-located tests in `services/*/__tests__/`

Documentation initially showed co-located pattern, but this conflicts with the majority pattern already in use. We need a single, enforced standard for all future development.

---

## Decision Drivers

1. **Consistency**: Single pattern across all services
2. **Maintainability**: Easy to find and run tests
3. **Build Performance**: Efficient test exclusion from production builds
4. **Community Standards**: Alignment with Jest/Next.js conventions
5. **Migration Cost**: Minimal disruption to existing code

---

## Considered Options

### Option 1: Root-Level `__tests__/services/` (RECOMMENDED)

**Pattern:**
```
__tests__/
└── services/
    ├── player/
    │   └── player-service.test.ts
    ├── casino/
    │   └── casino-service.test.ts
    └── table-context/
        └── table-context-service.test.ts

services/
├── player/
│   ├── index.ts
│   └── crud.ts
└── casino/
    ├── index.ts
    └── crud.ts
```

**Pros:**
- ✅ Already used by 67% of services (4/6)
- ✅ Standard Jest convention
- ✅ Clear separation of test vs production code
- ✅ Single directory to exclude from builds
- ✅ Easier to run "all tests" vs "service tests" selectively
- ✅ Matches Next.js App Router conventions

**Cons:**
- ❌ Tests physically separated from source
- ❌ Requires mental mapping (test location != source location)
- ❌ Slightly longer import paths (`../../../` vs `../../`)

**Migration Effort**: Low (2 test files to move)

---

### Option 2: Co-Located `services/*/__tests__/`

**Pattern:**
```
services/
├── player/
│   ├── index.ts
│   ├── crud.ts
│   └── __tests__/
│       └── player-service.test.ts
└── casino/
    ├── index.ts
    ├── crud.ts
    └── __tests__/
        └── casino-service.test.ts
```

**Pros:**
- ✅ Tests next to code they test
- ✅ Easier to find related tests
- ✅ Shorter import paths

**Cons:**
- ❌ Only 33% of services currently use it (2/6)
- ❌ Requires linter ignores for each `__tests__/` directory
- ❌ Harder to distinguish test vs production in file tree
- ❌ Less standard in Jest ecosystem

**Migration Effort**: High (4 test files + import path updates)

---

### Option 3: Keep Both Patterns

**Pros:**
- ✅ Zero migration effort

**Cons:**
- ❌ Confusing for new developers
- ❌ Inconsistent codebase
- ❌ Documentation can't be definitive
- ❌ Violates DRY/consistency principles
- ❌ Harder to enforce standards

**Migration Effort**: None (but perpetual confusion)

---

## Decision Outcome

**Chosen Option**: **Option 1 - Root-Level `__tests__/services/`**

### Rationale

1. **Majority Rule**: 67% of existing services already follow this pattern
2. **Community Standard**: Aligns with Jest, Next.js, and broader JavaScript ecosystem
3. **Separation of Concerns**: Clear distinction between production code and tests
4. **Build Efficiency**: Single directory exclusion vs multiple per-service exclusions
5. **Low Migration Cost**: Only 2 services need migration vs 4 for Option 2

### Implementation Plan

#### Phase 1: Documentation (Immediate - Day 6)
- [x] Document inconsistency in TEST_LOCATION_INCONSISTENCY.md
- [x] Update SERVICE_TEMPLATE_QUICK.md to show correct pattern
- [x] Add warning about Casino/TableContext inconsistency
- [ ] Update SERVICE_TEMPLATE.md examples
- [ ] Update SESSION_HANDOFF.md next steps

#### Phase 2: Migration (Post-MVP - Week 3)
- [ ] Move `services/casino/__tests__/` → `__tests__/services/casino/`
- [ ] Move `services/table-context/__tests__/` → `__tests__/services/table-context/`
- [ ] Update import paths in moved tests (change `../` depth)
- [ ] Run full test suite to verify
- [ ] Commit with clear migration message

#### Phase 3: Enforcement (Week 3)
- [ ] Add ESLint rule to detect `services/*/__tests__/` pattern
- [ ] Update pre-commit hook to warn on co-located tests
- [ ] Add to PR review checklist

---

## Consequences

### Positive

- **Consistency**: All services follow single pattern
- **Clarity**: New developers have one obvious location
- **Tooling**: Easier to configure Jest, coverage, IDEs
- **Performance**: Faster builds (single test exclusion)

### Negative

- **Migration Work**: ~30 minutes to move 2 test files
- **Import Paths**: Tests need one extra `../` in imports
- **Physical Distance**: Tests not next to source files

### Neutral

- **Test Discovery**: IDEs find tests in either location
- **Functionality**: No impact on test execution

---

## Compliance with PRD

**PRD §3.10 Testing & CI/CD:**
> "Mandatory Jest/RTL unit tests and integration tests per feature slice"

This ADR supports PRD compliance by:
- ✅ Standardizing test location for consistent CI/CD
- ✅ Making tests easier to discover and maintain
- ✅ Aligning with Jest best practices

**PRD §4 Anti-Pattern Guardrails:**
> "Document architectural decisions (ADRs) whenever deviating from this PRD"

This ADR documents the decision and provides migration path, fulfilling the requirement.

---

## References

- [Jest Best Practices](https://jestjs.io/docs/configuration#testmatch-arraystring)
- [Next.js Testing Guide](https://nextjs.org/docs/testing)
- [TEST_LOCATION_INCONSISTENCY.md](./TEST_LOCATION_INCONSISTENCY.md) - Detailed analysis
- [SERVICE_TEMPLATE_QUICK.md](../patterns/SERVICE_TEMPLATE_QUICK.md) - Updated template

---

## Approval

- [ ] **Tech Lead**: Approve decision
- [ ] **Team Review**: Consensus on migration timeline
- [ ] **Implementation**: Schedule migration work

**Target Approval Date**: 2025-10-08
**Target Migration Date**: Post-MVP (Week 3)

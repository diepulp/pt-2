# Test Location Inconsistency - Resolution Required

> **Status**: Inconsistency Identified
> **Date**: 2025-10-07
> **Severity**: Medium (affects maintainability, not functionality)
> **Action Required**: Standardization decision needed

---

## Problem Statement

The project currently has **two different test location patterns** in use:

### Pattern 1: Root-Level Tests (Older Services)
```
__tests__/
└── services/
    ├── player/
    │   └── player-service.test.ts
    ├── visit/
    │   └── visit-service.test.ts
    ├── ratingslip/
    │   └── ratingslip-service.test.ts
    └── player-financial/
        └── crud.test.ts
```

### Pattern 2: Co-Located Tests (Newer Services)
```
services/
├── casino/
│   ├── index.ts
│   ├── crud.ts
│   └── __tests__/
│       └── casino-service.test.ts
└── table-context/
    ├── index.ts
    ├── crud.ts
    ├── settings.ts
    └── __tests__/
        └── table-context-service.test.ts
```

---

## Impact

### Current State
- **4 services** use Pattern 1 (root-level `__tests__/`)
- **2 services** use Pattern 2 (co-located `services/*/__tests__/`)
- Documentation (SERVICE_TEMPLATE_QUICK.md) shows Pattern 2 as standard
- No linter enforcement for either pattern
- Both patterns work functionally

### Risks
1. **Developer Confusion**: New developers don't know which pattern to follow
2. **Test Discovery**: IDEs may not find tests consistently
3. **Import Paths**: Different relative import depths (`../../../` vs `../../`)
4. **Maintenance**: Harder to maintain with split patterns
5. **Documentation Drift**: Templates don't match reality

---

## Analysis

### Pattern 1: Root-Level `__tests__/` ✅ **RECOMMENDED**

**Pros:**
- ✅ Mirrors project structure without duplication
- ✅ Clear separation of test vs production code
- ✅ Easier to exclude from builds (single directory)
- ✅ Standard Jest convention
- ✅ Already used by 4/6 services (67%)
- ✅ Matches Next.js community patterns

**Cons:**
- ❌ Tests physically separated from source
- ❌ Slightly longer import paths
- ❌ Requires mental mapping (test location != source location)

### Pattern 2: Co-Located `services/*/__tests__/` ⚠️

**Pros:**
- ✅ Tests next to code they test
- ✅ Easier to find related tests
- ✅ Shorter import paths

**Cons:**
- ❌ Violates PT-2 existing convention (minority pattern)
- ❌ Requires linter ignores for each service directory
- ❌ Can clutter service directories
- ❌ Harder to run "all service tests" vs "all unit tests"
- ❌ Only 2/6 services use this (33%)

---

## Recommendation

### ✅ **ADOPT PATTERN 1: Root-Level `__tests__/services/`**

**Rationale:**
1. **Majority Pattern**: 4/6 services already use it
2. **Jest Convention**: Standard in Jest ecosystem
3. **Next.js Alignment**: Matches Next.js App Router conventions
4. **Clean Build**: Easier to exclude from production builds
5. **Consistency**: Single location for all tests

---

## Migration Plan

### Phase 1: Immediate (Day 6)
1. **Update Documentation**
   - Fix SERVICE_TEMPLATE_QUICK.md to show Pattern 1
   - Update SERVICE_TEMPLATE.md examples
   - Add note about the inconsistency

2. **Document Decision**
   - Create ADR-002-test-location-standard.md
   - Update coding standards

### Phase 2: Next Sprint (Post-MVP)
3. **Migrate Newer Services**
   - Move `services/casino/__tests__/` → `__tests__/services/casino/`
   - Move `services/table-context/__tests__/` → `__tests__/services/table-context/`
   - Update import paths in moved tests
   - Run full test suite to verify

4. **Prevent Regression**
   - Add lint rule to detect co-located tests
   - Update pre-commit hooks to warn on new co-located tests

### Phase 3: Long-Term
5. **Documentation Audit**
   - Ensure all templates show correct pattern
   - Update quick-start guides
   - Add to onboarding checklist

---

## File Structure (Corrected Standard)

```
project-root/
├── __tests__/                          # ✅ All tests here
│   ├── services/
│   │   ├── player/
│   │   │   └── player-service.test.ts
│   │   ├── casino/                     # TODO: Migrate from services/casino/__tests__
│   │   │   └── casino-service.test.ts
│   │   └── table-context/              # TODO: Migrate from services/table-context/__tests__
│   │       └── table-context-service.test.ts
│   └── utils/
│       └── helper.test.ts
│
└── services/                           # Production code only
    ├── player/
    │   ├── index.ts
    │   └── crud.ts
    ├── casino/
    │   ├── index.ts
    │   ├── crud.ts
    │   └── __tests__/                  # ❌ ANTI-PATTERN: Move to __tests__/services/casino/
    │       └── casino-service.test.ts
    └── table-context/
        ├── index.ts
        ├── crud.ts
        ├── settings.ts
        └── __tests__/                  # ❌ ANTI-PATTERN: Move to __tests__/services/table-context/
            └── table-context-service.test.ts
```

---

## Decision Required

**Who**: Tech Lead / Architecture Team
**When**: Before next service implementation (MTL Service)
**Options**:
1. ✅ **Adopt Pattern 1** (Recommended) - Migrate 2 services to root-level
2. ⚠️ **Adopt Pattern 2** - Migrate 4 services to co-located (more work)
3. ❌ **Keep Both** - Accept inconsistency (not recommended)

**Impact**:
- Low effort: ~30 minutes to migrate 2 test files
- Zero functional impact: Tests work in both locations
- High clarity gain: Single standard for all future services

---

## Next Actions

- [ ] Review this document with team
- [ ] Make standardization decision
- [ ] Update SERVICE_TEMPLATE_QUICK.md
- [ ] Create ADR-002 formalizing decision
- [ ] Schedule migration work (2 test files)

---

**Recommendation**: Approve Pattern 1, migrate in next sprint, update docs immediately.

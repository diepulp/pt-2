# Legacy Casino Actions Audit

## Summary
- **Total files**: 2
- **Total imports**: 11 functions + 2 types
- **Migration complexity**: LOW

## Overview

This audit identifies all callers of the legacy `app/actions/casino.ts` file to support its eventual deletion and migration to the new service architecture.

---

## Callers

### Component: use-casino.ts
- **Path**: `/home/diepulp/projects/pt-2/hooks/use-casino.ts`
- **Line**: 9
- **Imports**:
  - `getStaffByCasino` (function)
  - `getCasinoSettings` (function)
  - `computeGamingDay` (function)
  - `type StaffDTO` (type)
  - `type CasinoSettingsDTO` (type)
- **Usage**:
  - Line 15: `queryFn: () => getStaffByCasino(casinoId)`
  - Line 23: `queryFn: () => getCasinoSettings(casinoId)`
  - Line 31: `queryFn: () => computeGamingDay(casinoId)`
  - Line 37: Re-exports `StaffDTO` and `CasinoSettingsDTO` types
- **Migration**:
  1. Create new casino service at `services/casino/casino.ts` with exported functions
  2. Move DTOs to `services/casino/types.ts` or export from service file
  3. Update import path from `@/app/actions/casino` to `@/services/casino`
  4. Verify React Query hooks still function correctly

---

### Component: casino.test.ts
- **Path**: `/home/diepulp/projects/pt-2/services/casino/casino.test.ts`
- **Line**: 29
- **Imports**:
  - `getCasinos` (function)
  - `getCasinoById` (function)
  - `createCasino` (function)
  - `updateCasino` (function)
  - `deleteCasino` (function)
  - `getStaffByCasino` (function)
  - `getCasinoSettings` (function)
  - `computeGamingDay` (function)
- **Usage**: Unit tests for all 8 exported functions (lines 83-510)
- **Migration**:
  1. After migrating `app/actions/casino.ts` to `services/casino/casino.ts`
  2. Update import path from `@/app/actions/casino` to `@/services/casino` or new service location
  3. Tests should continue to pass without modification (same function signatures)

---

## Non-Code References (Documentation Only)

The following documentation files reference the legacy path but do not require code migration:

| File | Line | Context |
|------|------|---------|
| `docs/10-prd/PRD-000-casino-foundation.md` | 215 | Migration grep command example |
| `docs/20-architecture/specs/PRD-000/SPEC-PRD-000-casino-foundation.md` | 1204 | Audit instruction |
| `docs/20-architecture/specs/PRD-000/WORKFLOW-PRD-000-parallel-execution.md` | 2079, 2082, 2158 | Migration workflow examples |

---

## Functions Exported from Legacy File

| Function | Used By | Migration Priority |
|----------|---------|-------------------|
| `getCasinos` | casino.test.ts | LOW (test only) |
| `getCasinoById` | casino.test.ts | LOW (test only) |
| `createCasino` | casino.test.ts | LOW (test only) |
| `updateCasino` | casino.test.ts | LOW (test only) |
| `deleteCasino` | casino.test.ts | LOW (test only) |
| `getStaffByCasino` | use-casino.ts, casino.test.ts | MEDIUM (production hook) |
| `getCasinoSettings` | use-casino.ts, casino.test.ts | MEDIUM (production hook) |
| `computeGamingDay` | use-casino.ts, casino.test.ts | MEDIUM (production hook) |

## Types Exported from Legacy File

| Type | Used By | Migration Priority |
|------|---------|-------------------|
| `CasinoDTO` | internal only | LOW |
| `CasinoCreateDTO` | internal only | LOW |
| `CasinoUpdateDTO` | internal only | LOW |
| `StaffDTO` | use-casino.ts (re-exported) | MEDIUM |
| `CasinoSettingsDTO` | use-casino.ts (re-exported) | MEDIUM |

---

## Migration Plan

### Phase 1: Create New Service (No Breaking Changes)
1. Create `services/casino/casino.ts` with same function signatures
2. Create `services/casino/types.ts` with DTO exports
3. Add `services/casino/index.ts` barrel export

### Phase 2: Update Callers
1. **hooks/use-casino.ts** - Update import path to new service
2. **services/casino/casino.test.ts** - Update import path to new service

### Phase 3: Deprecate and Remove
1. Add `@deprecated` JSDoc to legacy `app/actions/casino.ts` exports
2. Verify all tests pass with new imports
3. Delete `app/actions/casino.ts`
4. Update documentation references (optional, non-blocking)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type incompatibility | LOW | MEDIUM | Use same DTO definitions |
| Test failures | LOW | LOW | Same function signatures |
| Runtime errors | LOW | MEDIUM | Verify with integration tests |

---

## Verification Checklist

Before deleting `app/actions/casino.ts`:

- [ ] New service exports all 8 functions with identical signatures
- [ ] New service exports all 5 DTO types
- [ ] `hooks/use-casino.ts` imports updated and working
- [ ] `services/casino/casino.test.ts` imports updated and passing
- [ ] No grep results for `from '@/app/actions/casino'`
- [ ] Type-check passes: `npm run type-check`
- [ ] All tests pass: `npm test`

---

## Audit Metadata

- **Audit Date**: 2025-11-29
- **Auditor**: Claude Code (PT-2 Service Implementer)
- **PRD Reference**: PRD-000-casino-foundation
- **Workstream**: WS5-A (API Route Handler Migration)

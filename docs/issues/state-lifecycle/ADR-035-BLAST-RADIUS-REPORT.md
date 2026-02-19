# ADR-035 Blast Radius Report: Pre-Implementation Assessment

**Date:** 2026-02-18
**Branch:** `has-vars-bypass`
**Method:** 5-expert parallel assessment, majority vote synthesis
**Verdict:** **APPROVE WITH CONCERNS** (5/5 approve, 4 with concerns)

---

## Expert Panel

| # | Domain | Verdict | Key Risk Level |
|---|--------|---------|----------------|
| E1 | Zustand Store Mutation Safety | APPROVE WITH CONCERNS | MEDIUM |
| E2 | Auth Pipeline & Sign-Out Flow | APPROVE | LOW |
| E3 | UI Rendering & Defensive Validation | APPROVE WITH CONCERNS | MEDIUM |
| E4 | Test Suite & CI Pipeline Impact | APPROVE WITH CONCERNS | MEDIUM-HIGH |
| E5 | Multi-Tenant Security & State Leak | APPROVE WITH CONCERNS | MEDIUM |

---

## Majority Vote: Unanimous APPROVE

All 5 experts agree the ADR-035 implementation is architecturally sound and safe to execute. No expert issued a BLOCK. The concerns are actionable and non-architectural — they require targeted additions to the implementation plan, not design changes.

---

## Cross-Expert Consensus Findings

### FINDING 1: `useLockStore` Barrel Export Gap
**Risk: HIGH** (E1: MEDIUM, E4: HIGH — escalated by convergence)
**Experts:** E1, E4

`useLockStore` is the only store NOT exported from `store/index.ts`. INV-035-4's store-inventory completeness assertion tests the barrel, creating a blind spot for the one session-scoped store that uses persist middleware.

**Required action:** Add `export { useLockStore } from './lock-store'` to `store/index.ts`.

---

### FINDING 2: `player-360-recent-players` localStorage PII Leak
**Risk: MEDIUM** (E5 sole finding — unique discovery, uncontested)
**Experts:** E5

`components/player-60/empty-states.tsx` stores up to 10 recent players (including **player names** — PII) in localStorage under key `player-360-recent-players`. This persists across sign-out/sign-in cycles. On a shared casino workstation, User B (Casino Beta) can see User A's (Casino Alpha) recently viewed player names.

ADR-035's `resetSessionState()` does not touch localStorage. This is a **cross-casino PII leak** outside the Zustand store classification.

**Required action:** Add `localStorage.removeItem('player-360-recent-players')` to the `resetSessionState()` orchestrator.

---

### FINDING 3: Use `DataOnly<T>` Instead of Manual `Omit` Pattern
**Risk: MEDIUM** (E4 primary finding, E1 corroborates complexity)
**Experts:** E1, E4

The plan's `Omit<StoreInterface, 'action1' | 'action2' | ...>` pattern requires listing 8-9 action keys per store and is brittle to renames. A `DataOnly<T>` utility type auto-excludes function-valued fields:

```typescript
type DataOnly<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: T[K];
};
```

Combined with `satisfies` (not `as`), this eliminates maintenance burden and satisfies INV-035-1 without any type assertions.

**Recommended action:** Use `DataOnly<T>` + `satisfies` instead of `Omit` + explicit action-key lists.

---

### FINDING 4: D3 Scope Creep — Phase Implementation Required
**Risk: MEDIUM** (E3 primary finding)
**Experts:** E3

ADR-035 D3/INV-035-3 mandates defensive validation on **all** `selectedId` surfaces. Full compliance touches ~15 files across pit, player, and shift dashboards. E3 identified a duplicate vulnerable surface at `components/dashboard/pit-dashboard-client.tsx` (line 224) with the identical bug.

**Recommended phased approach:**

| Phase | Files | Priority |
|-------|-------|----------|
| Phase 1 (this PR) | `pit-panels-client.tsx` + `pit-dashboard-client.tsx` (P0), `shift-dashboard-page.tsx` (P1) | Critical |
| Phase 2 (follow-up) | 8 player dashboard panels (P2/P3) | Deferred — D2 session reset sufficient |

**Required action:** Fix BOTH pit dashboard surfaces in the same PR. Document Phase 2 deferral.

---

### FINDING 5: Double-Reset Is Safe (Idempotent by Design)
**Risk: LOW** (E2 primary finding, E1 corroborates)
**Experts:** E1, E2

Explicit sign-out triggers `resetSessionState()` twice: once from `signOut()` and once from `onAuthStateChange` SIGNED_OUT listener. E2 proved via timing diagram that:
- Both calls are synchronous Zustand `set()` operations
- React 19's transition batching prevents intermediate re-renders
- Idempotency is guaranteed (setting initial state twice = same result)

**No mitigation required.** The dual-invocation is intentional defense-in-depth.

---

### FINDING 6: Zero Existing Test Breakage
**Risk: LOW** (E1: NONE, E4: LOW — unanimous)
**Experts:** E1, E4

E1 audited all 5 existing test files (1,341 lines total). Zero assertions will break. All changes are additive:
- New `describe('resetSession')` blocks alongside existing tests
- Existing `clearSelection()` / `resetNavigation()` / `resetForm()` tests unchanged
- beforeEach blocks do NOT need refactoring

---

### FINDING 7: No Circular Dependency Risk
**Risk: LOW** (E2 verified)
**Experts:** E2

New import path `hooks/auth/* -> store/reset-session-state -> store/*` is strictly unidirectional. No store file imports from `hooks/`. No transitive cycle.

---

## Single-Expert Findings (Not Contested)

### E2-4a: `useAuth` Must Be Mounted at Layout Level
**Risk: MEDIUM (narrow edge case)**

The `onAuthStateChange` listener lives in `useAuth`, which is mounted via `AppSidebar -> NavUser`. If a future refactor removes `useAuth` from all layout components, server-side session invalidation events would be missed.

**Recommended action:** Add JSDoc comment to `use-auth.ts` documenting the layout-level mounting requirement.

---

### E3-5: Shift Dashboard Compound State Validation
**Risk: MEDIUM**

Shift store has coupled state (`lens` + `selectedPitId` + `selectedTableId`). Partial D3 validation (clearing just `selectedTableId` but keeping stale `lens: 'table'`) could leave the store in an inconsistent state.

**Recommended action:** D3 for shift should always call `resetNavigation()` (atomic reset to casino lens) when any ID is stale, rather than attempting partial correction.

---

### E4-3: ESLint `consistent-type-assertions` Gap on Store Files
**Risk: MEDIUM**

`consistent-type-assertions` rule is scoped to `services/**/*.ts` only. Store files under `store/*.ts` are NOT covered. `as unknown` on an `INITIAL_STATE` constant would not be caught by lint.

**Recommended action:** Use `satisfies` pattern (makes the rule unnecessary) or extend `consistent-type-assertions` scope to include `store/*.ts`.

---

### E4-5: `use-sign-out.test.ts` Complexity
**Risk: MEDIUM-HIGH**

The integration test requires 7 mock targets across 6 modules — the most complex mock setup in the test suite (~180 LOC). Justified by sign-out flow criticality.

**Recommended action:** Focus tests on observable behavior (was `resetSessionState` called?), not exact call ordering. Document mock structure with JSDoc.

---

### E5-OC1: CTR Banner sessionStorage Cleanup
**Risk: LOW**

`ctr-banner-dismissed-*` keys in sessionStorage reveal that a CTR threshold was triggered. Low sensitivity (regulatory metadata, auto-expires daily, tab-scoped).

**Optional action:** Clear matching sessionStorage keys in orchestrator. Not required.

---

## Implementation Impact Summary

### LOC Estimate (E4)

| Category | Files | LOC |
|----------|-------|-----|
| Implementation (store modifications, orchestrator, auth wiring) | 7 files | ~83 |
| Tests (new + modified) | 5 files | ~515 |
| **Total** | **12 files** | **~598** |

### Required Actions Before Implementation

| # | Action | Source | Severity |
|---|--------|--------|----------|
| RC-1 | Add `useLockStore` to `store/index.ts` barrel export | E1, E4 | **HIGH** |
| RC-2 | Add `localStorage.removeItem('player-360-recent-players')` to orchestrator | E5 | **MEDIUM** |
| RC-3 | Fix BOTH `pit-panels-client.tsx` AND `pit-dashboard-client.tsx` (duplicate bug surface) | E3 | **HIGH** |
| RC-4 | Include `isLoading` guard (`tables.length > 0 && !selectedTable`) in both pit files | E3 | **HIGH** |

### Recommended Actions (Non-Blocking)

| # | Action | Source | Severity |
|---|--------|--------|----------|
| OPT-1 | Use `DataOnly<T>` utility type instead of manual `Omit` pattern | E4 | MEDIUM |
| OPT-2 | Use `satisfies` for INITIAL_STATE typing (eliminates need for `consistent-type-assertions` on store files) | E4 | MEDIUM |
| OPT-3 | Add JSDoc to `use-auth.ts` documenting layout-level mount requirement for `onAuthStateChange` | E2 | LOW |
| OPT-4 | Contract test: explicitly set `hasHydrated: true` before asserting preservation | E1 | LOW |
| OPT-5 | Export `RATING_SLIP_INITIAL_STATE` constant for contract test snapshot comparison | E1 | LOW |
| OPT-6 | Document Phase 2 D3 deferral for player dashboard panels | E3 | LOW |
| OPT-7 | Address `usePlayerDashboard(): PlayerDashboardStore` return type annotation (latent type lie) | E1 | LOW (debt) |

---

## Risk Heat Map

```
                    LOW          MEDIUM        HIGH         CRITICAL
Store Interfaces    [E1 ****]
Auth Wiring         [E2 ****]
Defensive D3                     [E3 **]
Test/CI                          [E4 **]
Multi-Tenant                     [E5 **]
Barrel Gap                                    [E1,E4 *]
PII Leak                         [E5 **]
```

No CRITICAL findings. One HIGH (barrel gap) is a 1-line fix. Implementation is safe to proceed after incorporating the 4 required actions (RC-1 through RC-4).

---

## Changelog

- 2026-02-18: Initial report. 5-expert parallel assessment, unanimous APPROVE WITH CONCERNS.

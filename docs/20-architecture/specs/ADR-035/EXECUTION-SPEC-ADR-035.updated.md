---
prd: ADR-035
spec_id: EXEC-SPEC-ADR-035
title: "Client State Lifecycle — Session Reset Contract"
source: docs/80-adrs/ADR-035-client-state-lifecycle-auth-transitions.md
triggered_by: ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED
bounded_context: platform-frontend
owner: Platform / Frontend
status: approved
date: 2026-02-18

workstreams:
  WS1:
    name: Store Session Contracts
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    gate: type-check
    outputs:
      - store/types.ts
      - store/pit-dashboard-store.ts
      - store/player-dashboard-store.ts
      - store/shift-dashboard-store.ts
      - store/rating-slip-modal-store.ts
      - store/lock-store.ts
  WS2:
    name: Session Reset Orchestrator
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1]
    gate: type-check
    outputs:
      - store/reset-session-state.ts
  WS3:
    name: Auth Integration
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS2]
    gate: type-check
    outputs:
      - hooks/auth/use-sign-out.ts
      - hooks/use-auth.ts
  WS4:
    name: Defensive Selection Validation
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    gate: type-check
    outputs:
      - components/pit-panels/pit-panels-client.tsx
      - components/dashboard/pit-dashboard-client.tsx
      - components/shift-dashboard/shift-dashboard-page.tsx
  WS5:
    name: Store Barrel & Contract Test
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1, WS2]
    gate: test-pass
    outputs:
      - store/index.ts
      - store/__tests__/session-reset-contract.test.ts
  WS6:
    name: Store Unit Tests
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1, WS2]
    gate: test-pass
    outputs:
      - store/__tests__/pit-dashboard-store.test.ts
      - store/__tests__/player-dashboard-store.test.ts
      - store/__tests__/rating-slip-modal-store.test.ts
      - store/__tests__/lock-store.test.ts
      - store/__tests__/shift-dashboard-store.test.ts

execution_phases:
  - name: "Phase 1 — Foundation"
    parallel: [WS1, WS4]
    gate: type-check
  - name: "Phase 2 — Orchestrator + Registration"
    parallel: [WS2, WS5]
    gate: type-check
  - name: "Phase 3 — Auth Wiring + Tests"
    parallel: [WS3, WS6]
    gate: test  # CI must include type-check + test; build remains a required project gate
---

# EXECUTION-SPEC-ADR-035: Client State Lifecycle — Session Reset Contract

**Source:** [ADR-035](../../80-adrs/ADR-035-client-state-lifecycle-auth-transitions.md)
**Triggered by:** [ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED](../../issues/ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED.md)
**Bounded Context:** Platform / Frontend
**Status:** Approved
**Date:** 2026-02-18

---

## Overview

Implements ADR-035's Session Reset Contract for client state across auth transitions. Eliminates stale Zustand state leaking across sign-out/sign-in cycles under Next.js soft navigation. Purely frontend — no database, RLS, or service layer changes.

**Root cause:** Sign-out clears TanStack Query cache but not Zustand stores. Soft navigation preserves JS singletons across route transitions, so stale `selectedTableId` persists into a new session and defeats auto-select logic.

---

## WS1: Store Session Contracts

**Type:** zustand-stores | **Executor:** frontend-design-pt-2 | **Dependencies:** none

### Outputs

| Action | File |
|--------|------|
| NEW | `store/types.ts` |
| MODIFY | `store/pit-dashboard-store.ts` |
| MODIFY | `store/player-dashboard-store.ts` |
| MODIFY | `store/shift-dashboard-store.ts` |
| MODIFY | `store/rating-slip-modal-store.ts` |
| MODIFY | `store/lock-store.ts` |

### Specification

**1. Create `store/types.ts`** — `DataOnly<T>` utility type

```typescript
/**
 * Extracts data-only fields from a store interface,
 * auto-excluding function (action) fields.
 * Used for typed INITIAL_STATE constants per INV-035-1.
 */
export type DataOnly<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? never : K]: T[K];
};
```

**2. Add to each session-scoped store:**

- Export a typed `INITIAL_STATE` constant using `DataOnly<T>` + `satisfies`
- Add `resetSession()` action that spreads `INITIAL_STATE`
- Existing partial resets (`clearSelection`, `resetNavigation`, `resetForm`) remain unchanged

**Per-store specifics:**

| Store | INITIAL_STATE fields | Notes |
|-------|---------------------|-------|
| `pitDashboardStore` | `selectedTableId: null, selectedSlipId: null, selectedPitLabel: null, activePanel: 'tables', newSlipSeatNumber: undefined, activitySearchQuery: '', activitySortMode: 'recent'` | `clearSelection()` remains partial |
| `playerDashboardStore` | `selectedPlayerId: null` | Simplest store |
| `shiftDashboardStore` | `timeWindow: null, timeWindowPreset: '8h', lens: 'casino', selectedPitId: null, selectedTableId: null` | `resetNavigation()` remains partial |
| `ratingSlipModalStore` | `slipId: null, formState: emptyFormState, originalState: emptyFormState` | Reuses existing `emptyFormState` |
| `lockStore` | `isLocked: false, lockReason: null, lockedAt: null` | `hasHydrated` **EXCLUDED** — reflects persist middleware lifecycle, not session state. Type: `Omit<DataOnly<LockStore>, 'hasHydrated'>` |

**Pattern — INITIAL_STATE (INV-035-1):**

```typescript
import type { DataOnly } from './types';

export const PIT_DASHBOARD_INITIAL_STATE = {
  selectedTableId: null,
  selectedSlipId: null,
  selectedPitLabel: null,
  activePanel: 'tables' as const,
  newSlipSeatNumber: undefined,
  activitySearchQuery: '',
  activitySortMode: 'recent' as const,
} satisfies DataOnly<PitDashboardStore>;
```

**Pattern — resetSession() action:**

```typescript
resetSession: () =>
  set(
    { ...PIT_DASHBOARD_INITIAL_STATE },
    undefined,
    'pit-dashboard/resetSession',
  ),
```

**Pattern — Lock store (special case):**

```typescript
export const LOCK_INITIAL_STATE = {
  isLocked: false,
  lockReason: null,
  lockedAt: null,
} satisfies Omit<DataOnly<LockStore>, 'hasHydrated'>;

resetSession: () =>
  set(
    { ...LOCK_INITIAL_STATE },  // hasHydrated untouched
    false,
    'lock/resetSession',
  ),
```

### Validation

- `npm run type-check` passes — `satisfies` catches missing fields at compile time
- No `as any` or `as unknown` on any INITIAL_STATE declaration
- Compile error if a new data field is added without updating INITIAL_STATE
- Lock store `resetSession()` does NOT reset `hasHydrated`

---

## WS2: Session Reset Orchestrator

**Type:** zustand-stores | **Executor:** frontend-design-pt-2 | **Dependencies:** WS1

### Outputs

| Action | File |
|--------|------|
| NEW | `store/reset-session-state.ts` |

### Specification

Create a **plain synchronous function** (NOT a React hook) that resets all session-scoped stores and browser storage in one call. Per ADR-035 D2.

```typescript
// store/reset-session-state.ts
import { usePitDashboardStore } from './pit-dashboard-store';
import { usePlayerDashboardStore } from './player-dashboard-store';
import { useShiftDashboardStore } from './shift-dashboard-store';
import { useRatingSlipModalStore } from './rating-slip-modal-store';
import { useLockStore } from './lock-store';
import { useUIStore } from './ui-store';

/**
 * Reset all session-scoped client state.
 *
 * Plain synchronous function — callable from hooks, event listeners,
 * and non-component contexts. NOT a React hook.
 *
 * Invoked during:
 * - Normal sign-out (after queryClient.clear)
 * - Fallback/local-cleanup sign-out
 * - onAuthStateChange SIGNED_OUT event
 *
 * @see ADR-035 D2, INV-035-2
 */
export function resetSessionState(): void {
  // Session-scoped stores: full reset
  usePitDashboardStore.getState().resetSession();
  usePlayerDashboardStore.getState().resetSession();
  useShiftDashboardStore.getState().resetSession();
  useRatingSlipModalStore.getState().resetSession();
  useLockStore.getState().resetSession();

  // App-scoped: defensive closeModal only (sidebar persists per ADR-035)
  useUIStore.getState().closeModal();

  // Browser storage cleanup (INV-035-6)
  // PII: player names + casino-scoped IDs on shared workstations
  localStorage.removeItem('player-360-recent-players');
}
```

### Validation

- Function is synchronous (no async/await)
- Function is NOT a React hook (no `use` prefix, no hook calls inside)
- Calls all 5 session store `resetSession()` + ui `closeModal()`
- Clears `localStorage` `player-360-recent-players`
- Idempotent: calling twice produces same result
- `ui-store.sidebarCollapsed` is NOT touched

---

## WS3: Auth Integration

**Type:** react-hooks | **Executor:** frontend-design-pt-2 | **Dependencies:** WS2

### Outputs

| Action | File |
|--------|------|
| MODIFY | `hooks/auth/use-sign-out.ts` |
| MODIFY | `hooks/use-auth.ts` |

### Specification

Wire `resetSessionState()` into all 3 auth-ending paths per INV-035-2.

**1. Normal sign-out path** (`hooks/auth/use-sign-out.ts` — `signOut` function):

Insert after `queryClient.clear()` (step 3), before `performRedirect()` (step 4):

```typescript
import { resetSessionState } from '@/store/reset-session-state';

// Step 3: Cache clear — soft fail
try { queryClient.clear(); } catch { /* soft fail */ }

// Step 3.5: Session state reset (ADR-035 INV-035-2)
resetSessionState();

// Step 4: Redirect
performRedirect();
```

**2. Fallback sign-out path** (`hooks/auth/use-sign-out.ts` — `performLocalCleanup`):

Insert after `queryClient.clear()`, before `setErrorState`:

```typescript
const performLocalCleanup = useCallback(() => {
  const supabase = createBrowserComponentClient();
  supabase.auth.signOut({ scope: 'local' });
  cleanupClientInstance();
  queryClient.clear();
  resetSessionState();  // ADR-035 INV-035-2: fallback path
  setErrorState({ show: false, message: '' });
  // redirect...
}, [queryClient, router]);
```

**3. onAuthStateChange SIGNED_OUT** (`hooks/use-auth.ts`):

Add `resetSessionState()` call when event is `SIGNED_OUT`:

```typescript
import { resetSessionState } from '@/store/reset-session-state';

supabase.auth.onAuthStateChange((event, session) => {
  queryClient.setQueryData(AUTH_QUERY_KEY, session?.user ?? null);

  // ADR-035 INV-035-2: Reset Zustand on server-side session invalidation
  if (event === 'SIGNED_OUT') {
    resetSessionState();
  }
});
```

### Validation

- `resetSessionState()` is called in **all auth-ending paths currently defined** (explicit sign-out success, explicit sign-out fallback cleanup, and `onAuthStateChange` on `SIGNED_OUT`)
- Called AFTER `queryClient.clear()` in both sign-out paths
- Called ONLY on `SIGNED_OUT` event (not `TOKEN_REFRESHED`, `SIGNED_IN`, etc.)
- No `window.location.href` as primary reset mechanism (INV-035-5)

---

## WS4: Defensive Selection Validation

**Type:** react-components | **Executor:** frontend-design-pt-2 | **Dependencies:** none

### Outputs

| Action | File |
|--------|------|
| MODIFY | `components/pit-panels/pit-panels-client.tsx` |
| MODIFY | `components/dashboard/pit-dashboard-client.tsx` |
| MODIFY | `components/shift-dashboard/shift-dashboard-page.tsx` |

### Specification

Defense-in-depth: validate selected IDs against loaded server data before rendering. Auto-correct invalid selections. Per ADR-035 D3, INV-035-3.

**1. Both pit surfaces — defensive auto-select:**

Replace the existing auto-select `useEffect` on both `pit-panels-client.tsx:198-208` and `pit-dashboard-client.tsx:222-233`:

```typescript
// BEFORE: only fires when selectedTableId is null
// React.useEffect(() => {
//   if (!selectedTableId && tables.length > 0) { ... }

// AFTER: validates current selection, auto-corrects if stale (INV-035-3)
React.useEffect(() => {
  if (tables.length > 0) {
    const currentValid =
      selectedTableId && tables.some((t) => t.id === selectedTableId);
    if (!currentValid) {
      const firstActive = tables.find((t) => t.status === 'active');
      setSelectedTable(firstActive?.id ?? tables[0].id);
    }
  }
}, [tables, selectedTableId, setSelectedTable]);
```

**2. pit-panels-client.tsx — isLoading guard (~line 472):**

```typescript
// BEFORE:
// isLoading: tablesLoading || statsLoading,

// AFTER: includes auto-select pending window
isLoading:
  tablesLoading ||
  statsLoading ||
  (tables.length > 0 &&
    (!selectedTableId || !tables.some((t) => t.id === selectedTableId))),
```

**3. pit-dashboard-client.tsx — loading guard:**

Add early return before main render when tables are loaded but selectedTable hasn't resolved yet:

```typescript
// After the auto-select useEffect, before the main return:
const selectionInvalid =
  tables.length > 0 &&
  (!selectedTableId || !tables.some((t) => t.id === selectedTableId));

if (tablesLoading || selectionInvalid) {
  // Avoid rendering "No Table Selected" during the one-frame auto-select gap
  // while still giving the operator a visible loading state.
  return <PitPanelsSkeleton />; // use an existing skeleton or a minimal placeholder component
}
```

**4. shift-dashboard-page.tsx — defensive pit selection:**

Add validation when pit metrics load:

```typescript
// Validate selectedPitId against loaded data (INV-035-3)
useEffect(() => {
  if (summary?.pitMetrics && selectedPitId) {
    const pitExists = summary.pitMetrics.some(
      (p: { pitId: string }) => p.pitId === selectedPitId,
    );
    if (!pitExists) {
      resetNavigation(); // Existing compound action: lens='casino', pits/tables null
    }
  }
}, [summary?.pitMetrics, selectedPitId, resetNavigation]);
```

### Validation

- Auto-select fires when `selectedTableId` is stale (UUID not in tables array)
- Auto-select fires when `selectedTableId` is null (fresh session)
- Auto-select does NOT fire when `selectedTableId` is valid
- `isLoading` is true during auto-select pending window (prevents flash)
- Shift dashboard resets to casino lens when selected pit doesn't exist in data

---

## WS5: Store Barrel & Contract Test

**Type:** unit-tests | **Executor:** frontend-design-pt-2 | **Dependencies:** WS1, WS2

### Outputs

| Action | File |
|--------|------|
| MODIFY | `store/index.ts` |
| NEW | `store/__tests__/session-reset-contract.test.ts` |

### Specification

**1. Export `useLockStore` from barrel** (`store/index.ts`):

```typescript
export { useLockStore } from './lock-store';
```

**2. Contract test** (`store/__tests__/session-reset-contract.test.ts`):

INV-035-4 store-inventory completeness assertion. This test MUST fail if:
- A new store hook is exported from barrel without being classified
- `resetSessionState()` misses a session store
- App-scoped state is incorrectly cleared

```typescript
import * as storeBarrel from '../index';
import { resetSessionState } from '../reset-session-state';
// Import INITIAL_STATE constants from each store
import { PIT_DASHBOARD_INITIAL_STATE } from '../pit-dashboard-store';
import { PLAYER_DASHBOARD_INITIAL_STATE } from '../player-dashboard-store';
import { SHIFT_DASHBOARD_INITIAL_STATE } from '../shift-dashboard-store';
import { RATING_SLIP_MODAL_INITIAL_STATE } from '../rating-slip-modal-store';
import { LOCK_INITIAL_STATE } from '../lock-store';

const SESSION_SCOPED_HOOKS = [
  'usePitDashboardStore',
  'usePlayerDashboardStore',
  'useShiftDashboardStore',
  'useRatingSlipModalStore',
  'useLockStore',
] as const;

const APP_SCOPED_HOOKS = [
  'useUIStore',
] as const;

describe('Session Reset Contract (INV-035-4)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('all barrel hook exports are classified', () => {
    const allHookExports = Object.keys(storeBarrel).filter(
      (k) => k.startsWith('use') && typeof (storeBarrel as any)[k] === 'function',
    );
    const classified = [...SESSION_SCOPED_HOOKS, ...APP_SCOPED_HOOKS];
    expect(allHookExports.sort()).toEqual([...classified].sort());
  });

  it('all session stores return to INITIAL_STATE after resetSessionState()', () => {
    // Mutate all session stores to non-default values
    // ... (set dirty state on each store) ...
    resetSessionState();
    // Assert each store matches INITIAL_STATE (data fields only; ignore actions).
// Implement a helper to compare only keys present in INITIAL_STATE.
const pickData = <T extends Record<string, any>>(state: T, initial: Partial<T>) =>
  Object.fromEntries(Object.keys(initial).map((k) => [k, (state as any)[k]])) as Partial<T>;

// Example:
// expect(pickData(usePitDashboardStore.getState(), PIT_DASHBOARD_INITIAL_STATE))
//   .toEqual(PIT_DASHBOARD_INITIAL_STATE);
  });

  it('app-scoped sidebar preference preserved', () => {
    const { useUIStore } = storeBarrel;
    useUIStore.getState().toggleSidebar();
    const before = useUIStore.getState().sidebarCollapsed;
    resetSessionState();
    expect(useUIStore.getState().sidebarCollapsed).toBe(before);
  });

  it('app-scoped modal closed defensively', () => {
    const { useUIStore } = storeBarrel;
    useUIStore.getState().openModal('rating-slip', { some: 'data' });
    resetSessionState();
    expect(useUIStore.getState().modal.isOpen).toBe(false);
  });

  it('idempotent — calling twice produces same result', () => {
    resetSessionState();
    // capture state snapshot
    resetSessionState();
    // assert same state
  });

  it('localStorage player-360-recent-players cleared', () => {
    localStorage.setItem('player-360-recent-players', JSON.stringify([{ id: '1', name: 'Test' }]));
    resetSessionState();
    expect(localStorage.getItem('player-360-recent-players')).toBeNull();
  });
});
```

### Validation

- Contract test fails if a new store hook is exported without classification
- Contract test fails if `resetSessionState()` misses a session store
- App-scoped `sidebarCollapsed` preserved after reset
- `localStorage` cleanup verified

---

## WS6: Store Unit Tests

**Type:** unit-tests | **Executor:** frontend-design-pt-2 | **Dependencies:** WS1, WS2

### Outputs

| Action | File |
|--------|------|
| MODIFY | `store/__tests__/pit-dashboard-store.test.ts` |
| MODIFY | `store/__tests__/player-dashboard-store.test.ts` |
| MODIFY | `store/__tests__/rating-slip-modal-store.test.ts` |
| MODIFY | `store/__tests__/lock-store.test.ts` |
| NEW | `store/__tests__/shift-dashboard-store.test.ts` |

### Specification

Add `resetSession()` tests to each session-scoped store. Pattern per store:

```typescript
describe('resetSession()', () => {
  it('should reset ALL data fields to INITIAL_STATE', () => {
    // Set every data field to a non-default value
    useXxxStore.setState({
      /* all fields with non-default values */
    });

    // Reset
    act(() => { useXxxStore.getState().resetSession(); });

    // Snapshot compare: data fields match INITIAL_STATE
    const state = useXxxStore.getState();
    expect({ /* extract data fields */ }).toEqual(XXX_INITIAL_STATE);
  });

  it('existing partial reset unchanged', () => {
    // Verify clearSelection/resetNavigation/resetForm still work as before
  });
});
```

**Lock store special case:**

```typescript
it('should NOT reset hasHydrated', () => {
  useLockStore.setState({ hasHydrated: true });
  useLockStore.getState().lock('manual');
  useLockStore.getState().resetSession();

  expect(useLockStore.getState().isLocked).toBe(false);
  expect(useLockStore.getState().hasHydrated).toBe(true); // preserved!
});
```

**New file:** `store/__tests__/shift-dashboard-store.test.ts` — first test file for shift dashboard store. Includes:
- Initial state tests
- Action tests (setLens, setTimeWindow, drillDownToPit, drillDownToTable, resetNavigation)
- `resetSession()` tests (resets ALL fields including timeWindow/timeWindowPreset)
- `resetNavigation()` remains partial (does NOT reset time window)

### Validation

- `npm run test store/` passes
- Each session store has `resetSession()` snapshot test
- Lock store `hasHydrated` preservation verified
- Existing tests not broken

---

## Execution Phases

### Phase 1: Foundation

**Workstreams:** WS1 + WS4 (parallel)
**Gate:** `npm run type-check`

WS1 (Store Contracts) and WS4 (Defensive Validation) have no dependencies on each other. WS4 provides defense-in-depth independent of the reset path.

### Phase 2: Orchestrator + Registration

**Workstreams:** WS2 + WS5 (parallel)
**Gate:** `npm run type-check`

WS2 (Orchestrator) builds on WS1's `resetSession()` actions. WS5 (Barrel + Contract Test) needs WS1 for INITIAL_STATE exports and WS2 for the orchestrator function.

### Phase 3: Auth Wiring + Tests

**Workstreams:** WS3 + WS6 (parallel)
**Gate:** `npm run type-check` + `npm run test store/` + `npm run build`

WS3 (Auth Integration) wires WS2's orchestrator into sign-out and auth state change. WS6 (Unit Tests) validates WS1's store contracts and WS2's orchestrator.

---

## Definition of Done

- [ ] All session-scoped stores expose `resetSession()` returning to typed `INITIAL_STATE`
- [ ] `INITIAL_STATE` constants typed via `DataOnly<T>` + `satisfies` (no `as any`)
- [ ] `resetSessionState()` orchestrator calls all 5 session resets + `closeModal()` + localStorage cleanup
- [ ] `useLockStore` exported from `store/index.ts` barrel
- [ ] `resetSessionState()` called in normal sign-out path
- [ ] `resetSessionState()` called in fallback/local-cleanup sign-out path
- [ ] `resetSessionState()` called from `onAuthStateChange` `SIGNED_OUT` handler
- [ ] Defensive selection validation on `pit-panels-client.tsx` + `pit-dashboard-client.tsx` (validates against loaded tables)
- [ ] Defensive selection validation on `shift-dashboard-page.tsx` (validates `selectedPitId`)
- [ ] `isLoading` guard includes selection validation (tables loaded but `selectedTableId` missing/invalid) on both pit surfaces
- [ ] `localStorage.removeItem('player-360-recent-players')` in orchestrator (INV-035-6)
- [ ] Contract test passes with store-inventory completeness assertion (INV-035-4)
- [ ] All store unit tests pass including new `resetSession()` tests
- [ ] `npm run type-check` clean
- [ ] `npm run build` clean

---

## Security Invariants Traceability

| Invariant | Workstream | Verification |
|-----------|-----------|--------------|
| INV-035-1: Typed INITIAL_STATE, no `as any` | WS1 | `satisfies` + type-check gate |
| INV-035-2: resetSessionState in all auth paths | WS3 | 3 call sites in sign-out + auth listener |
| INV-035-3: Selected IDs validated before render | WS4 | Defensive auto-select on 3 surfaces |
| INV-035-4: Store-inventory completeness | WS5 | Contract test barrel assertion |
| INV-035-5: No hard reload as primary reset | WS3 | Code review — no `window.location.href` for state reset |
| INV-035-6: localStorage PII cleanup | WS2 | Orchestrator + contract test assertion |

---

## References

- [ADR-035](../../80-adrs/ADR-035-client-state-lifecycle-auth-transitions.md) — Source decision
- [ADR-003](../../80-adrs/ADR-003-state-management-strategy.md) — State management strategy (Section 8 Zustand scope)
- [ADR-030](../../80-adrs/ADR-030-auth-system-hardening.md) — Server-side auth hardening (complemented by this)
- [ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED](../../issues/ISSUE-POST-SIGNIN-TABLES-NOT-RENDERED.md) — Triggering defect
- [ADR-035-BLAST-RADIUS-REPORT](../../issues/state-lifecycle/ADR-035-BLAST-RADIUS-REPORT.md) — 5-expert assessment

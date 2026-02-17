---
prd: PRD-014
prd_title: "Player Dashboard Zustand Store Integration"
service: UIStore
mvp_phase: 0  # Horizontal infrastructure

# Workstream Definitions
workstreams:
  WS1:
    name: Core Store Implementation
    description: Create player-dashboard-store.ts and selector hook following PRD-014 patterns
    agent: backend-service-builder
    depends_on: []
    outputs:
      - store/player-dashboard-store.ts
      - hooks/ui/use-player-dashboard.ts
      - store/index.ts
      - hooks/ui/index.ts
    gate: type-check
    estimated_complexity: low

  WS2:
    name: Store Unit Tests
    description: Add comprehensive unit tests for store actions and hook selectors
    agent: e2e-testing
    depends_on: [WS1]
    outputs:
      - store/__tests__/player-dashboard-store.test.ts
      - hooks/ui/__tests__/use-player-dashboard.test.ts
    gate: test-pass
    estimated_complexity: low

  WS3:
    name: PlayerDashboard Root Refactor
    description: Refactor PlayerDashboard.tsx to use store instead of local useState
    agent: frontend-design-pt-2
    depends_on: [WS1]
    outputs:
      - components/player-dashboard/player-dashboard.tsx
    gate: type-check
    estimated_complexity: low

  WS4:
    name: PlayerSearchCommand Refactor
    description: Update PlayerSearchCommand to use setSelectedPlayer action
    agent: frontend-design-pt-2
    depends_on: [WS1, WS3]
    outputs:
      - components/player-dashboard/player-search-command.tsx
    gate: type-check
    estimated_complexity: low

  WS5:
    name: Panel Refactor - Batch 1
    description: Refactor first batch of panels to use usePlayerDashboard() hook
    agent: frontend-design-pt-2
    depends_on: [WS1, WS3]
    outputs:
      - components/player-dashboard/player-profile-panel.tsx
      - components/player-dashboard/session-control-panel.tsx
      - components/player-dashboard/metrics-panel.tsx
    gate: type-check
    estimated_complexity: medium

  WS6:
    name: Panel Refactor - Batch 2
    description: Refactor second batch of panels to use usePlayerDashboard() hook
    agent: frontend-design-pt-2
    depends_on: [WS1, WS3]
    outputs:
      - components/player-dashboard/compliance-panel.tsx
      - components/player-dashboard/activity-visualization-panel.tsx
    gate: type-check
    estimated_complexity: medium

  WS7:
    name: Panel Refactor - Batch 3
    description: Refactor final batch of panels to use usePlayerDashboard() hook
    agent: frontend-design-pt-2
    depends_on: [WS1, WS3]
    outputs:
      - components/player-dashboard/notes-panel.tsx
      - components/player-dashboard/loyalty-panel.tsx
    gate: type-check
    estimated_complexity: medium

  WS8:
    name: Component Integration Tests
    description: Add integration tests for PlayerDashboard with all child components
    agent: e2e-testing
    depends_on: [WS3, WS4, WS5, WS6, WS7]
    outputs:
      - components/player-dashboard/__tests__/player-dashboard.integration.test.tsx
    gate: test-pass
    estimated_complexity: medium

  WS9:
    name: DevTools Validation
    description: Verify Redux DevTools integration and action logging
    agent: qa-specialist
    depends_on: [WS1]
    outputs:
      - docs/50-ops/devtools-SETUP.md
    gate: manual
    estimated_complexity: low

  WS10:
    name: Documentation Update
    description: Update ADR-003 and Zustand documentation with implementation evidence
    agent: backend-service-builder
    depends_on: [WS1, WS8]
    outputs:
      - docs/80-adrs/ADR-003-state-management-strategy.md
      - docs/25-api-data/STORES_STANDARD.md
    gate: build
    estimated_complexity: low

# Execution Phases (topologically sorted, parallelized where possible)
execution_phases:
  - name: Phase 1 - Core Store Implementation
    parallel: [WS1]
    gates: [type-check]

  - name: Phase 2 - Store Testing
    parallel: [WS2, WS9]
    gates: [test-pass, manual]

  - name: Phase 3 - Component Refactoring
    parallel: [WS3, WS4]
    gates: [type-check]

  - name: Phase 4 - Panel Refactoring
    parallel: [WS5, WS6, WS7]
    gates: [type-check]

  - name: Phase 5 - Integration & Validation
    parallel: [WS8, WS10]
    gates: [test-pass, build]

# Validation Gates
gates:
  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0, no TypeScript errors in modified files"

  test-pass:
    command: npm test
    success_criteria: "Exit code 0, ≥ 90% coverage for new code"

  build:
    command: npm run build
    success_criteria: "Exit code 0, no compilation errors"

  manual:
    command: "Manual validation in browser"
    success_criteria: "Redux DevTools shows store actions with proper labels"

# Dependencies on other PRDs/Services
external_dependencies:
  - prd: PRD-013
    service: UIStore
    required_for: "Store patterns and Zustand configuration (ui-store, pit-dashboard-store)"

  - prd: ADR-003
    service: State Management Strategy
    required_for: "Architecture patterns for Zustand implementation"

# Risks and Mitigations
risks:
  - risk: "Store causes unnecessary re-renders"
    mitigation: "useShallow selector in usePlayerDashboard hook ensures fine-grained subscriptions"

  - risk: "Breaking existing player search functionality"
    mitigation: "WS3 and WS4 initial refactor of critical path before panel updates"

  - risk: "7 panels create large refactoring scope"
    mitigation: "Split panels into 3 parallel batches (WS5, WS6, WS7) with independent verification"

---

# EXECUTION-SPEC: PRD-014 - Player Dashboard Zustand Store Integration

## Overview

Eliminate prop drilling by migrating `selectedPlayerId` state from local React state to a dedicated Zustand store. This PRD addresses 7 child components receiving identical props and creates a scalable pattern for future panel additions.

## Architecture Context

**ADR-003 §8 Requirements:**
- Zustand for ephemeral UI state only (player selection)
- useShallow for fine-grained selectors (prevents re-renders)
- DevTools middleware with action naming
- Functional factory pattern, no classes

**Current State (Problem):**
```
PlayerDashboard
  └─ useState → selectedPlayerId
      ├─ PlayerSearchCommand (prop)
      ├─ PlayerProfilePanel (prop)
      ├─ SessionControlPanel (prop)
      ├─ MetricsPanel (prop)
      ├─ CompliancePanel (prop)
      ├─ ActivityVisualizationPanel (prop)
      ├─ NotesPanel (prop)
      └─ LoyaltyPanel (prop)
```
- 7 components with identical prop
- Type definitions duplicated across components
- Props drilling adds overhead for each new panel

**Target State (Solution):**
```
PlayerDashboard
  └─ usePlayerDashboard() → store actions
      All children use hook directly
```
- Zero prop drilling
- Types managed centrally in store
- New panels add no prop interface changes

## Workstream Details

### WS1: Core Store Implementation

**Purpose**: Create store and hook infrastructure.

**Deliverables:**

1. **`store/player-dashboard-store.ts`**:
   ```typescript
   import { create } from 'zustand';
   import { devtools } from 'zustand/middleware';

   interface PlayerDashboardStore {
     selectedPlayerId: string | null;
     setSelectedPlayer: (id: string | null) => void;
     clearSelection: () => void;
   }

   export const usePlayerDashboardStore = create<PlayerDashboardStore>()(
     devtools(
       (set) => ({
         selectedPlayerId: null,
         setSelectedPlayer: (id) =>
           set({ selectedPlayerId: id }, undefined, 'playerDashboard/setSelectedPlayer'),
         clearSelection: () =>
           set({ selectedPlayerId: null }, undefined, 'playerDashboard/clearSelection'),
       })
     )
   );
   ```

2. **`hooks/ui/use-player-dashboard.ts`**:
   ```typescript
   import { useShallow } from 'zustand/react/shallow';
   import { usePlayerDashboardStore } from '@/store/player-dashboard-store';

   export function usePlayerDashboard() {
     return usePlayerDashboardStore(
       useShallow((state) => ({
         selectedPlayerId: state.selectedPlayerId,
         setSelectedPlayer: state.setSelectedPlayer,
         clearSelection: state.clearSelection,
       }))
     );
   }
   ```

3. **Update barrel exports** in `store/index.ts` and `hooks/ui/index.ts`.

**Acceptance Criteria:**
- [ ] Store uses devtools middleware with action names
- [ ] Hook uses useShallow for performance
- [ ] Types properly exported
- [ ] TypeScript compilation passes

### WS2: Store Unit Tests

**Purpose**: Verify store actions and hook selectors.

**Test Coverage:**

1. **`store/__tests__/player-dashboard-store.test.ts`**:
   ```typescript
   describe('player-dashboard-store', () => {
     it('initializes with null selectedPlayerId', () => {
       const { result } = renderHook(() => usePlayerDashboardStore());
       expect(result.current.selectedPlayerId).toBe(null);
     });

     it('setSelectedPlayer updates state', () => {
       const { result } = renderHook(() => usePlayerDashboardStore());
       act(() => result.current.setSelectedPlayer('player-123'));
       expect(result.current.selectedPlayerId).toBe('player-123');
     });

     it('clearSelection resets to null', () => {
       const { result } = renderHook(() => usePlayerDashboardStore());
       act(() => result.current.setSelectedPlayer('player-456'));
       act(() => result.current.clearSelection());
       expect(result.current.selectedPlayerId).toBe(null);
     });
   });
   ```

2. **`hooks/ui/__tests__/use-player-dashboard.test.ts`**:
   - Test hook returns store actions
   - Test useShallow prevents re-renders
   - Test type inference

**Acceptance Criteria:**
- [ ] ≥ 95% coverage for store and hook
- [ ] All tests passing
- [ ] Mock store in test isolation

### WS3: PlayerDashboard Root Refactor

**Purpose**: Replace local state with store in root component.

**Changes to `components/player-dashboard/player-dashboard.tsx`:**

```diff
- import { useState } from 'react';
+ import { usePlayerDashboard } from '@/hooks/ui/use-player-dashboard';

- const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
+ const { selectedPlayerId, setSelectedPlayer } = usePlayerDashboard();
```

**Prop Drilling Removal:**
```diff
  <PlayerSearchCommand
-   selectedPlayerId={selectedPlayerId}
-   onSelectPlayer={setSelectedPlayerId}
+   onSelectPlayer={setSelectedPlayer}
  />

  <PlayerProfilePanel
-   selectedPlayerId={selectedPlayerId}
  />
```

**Acceptance Criteria:**
- [ ] Local useState removed
- [ ] DevTools shows "playerDashboard/setSelectedPlayer" actions
- [ ] Component functionality unchanged
- [ ] TypeScript compilation passes

### WS4: PlayerSearchCommand Refactor

**Purpose**: Update search command to use store action.

**Changes to `components/player-dashboard/player-search-command.tsx`:**

```diff
- interface Props {
-   selectedPlayerId: string | null;
-   onSelectPlayer: (id: string | null) => void;
- }
+ import { usePlayerDashboard } from '@/hooks/ui/use-player-dashboard';

+ const { selectedPlayerId, setSelectedPlayer } = usePlayerDashboard();
```

**Acceptance Criteria:**
- [ ] Props removed from interface
- [ ] Uses setSelectedPlayer action
- [ ] Player selection works as before
- [ ] TypeScript compilation passes

### WS5: Panel Refactor - Batch 1

**Purpose**: Refactor first 3 panels to use hook.

**Panels Updated:**
- `player-profile-panel.tsx`
- `session-control-panel.tsx`
- `metrics-panel.tsx`

**Changes per Panel:**
```diff
- interface Props {
-   selectedPlayerId: string | null;
- }

+ import { usePlayerDashboard } from '@/hooks/ui/use-player-dashboard';

+ const { selectedPlayerId } = usePlayerDashboard();
```

**Acceptance Criteria:**
- [ ] All 3 panels use usePlayerDashboard()
- [ ] Props interfaces updated
- [ ] TypeScript compilation passes for all 3

### WS6: Panel Refactor - Batch 2

**Purpose**: Refactor panels 4-5 to use hook.

**Panels Updated:**
- `compliance-panel.tsx`
- `activity-visualization-panel.tsx`

**Changes**: Same pattern as WS5

**Acceptance Criteria:**
- [ ] Both panels use usePlayerDashboard()
- [ ] Props interfaces updated
- [ ] TypeScript compilation passes

### WS7: Panel Refactor - Batch 3

**Purpose**: Refactor final 2 panels to use hook.

**Panels Updated:**
- `notes-panel.tsx`
- `loyalty-panel.tsx`

**Acceptance Criteria:**
- [ ] Both panels use usePlayerDashboard()
- [ ] Props interfaces updated
- [ ] TypeScript compilation passes

### WS8: Component Integration Tests

**Purpose**: Test PlayerDashboard with full component tree.

**Test Coverage:**

1. **`components/player-dashboard/__tests__/player-dashboard.integration.test.tsx`**:
   ```typescript
   describe('PlayerDashboard Integration', () => {
     it('passes selected player to all child panels via hook', () => {
       render(<PlayerDashboard />);

       // Select player
       fireEvent.click(screen.getByTestId('player-search-item'));

       // Verify all panels have access
       const hookCalls = store.getState().selectedPlayerId;
       expect(hookCalls).toBe('player-123');
     });

     it('clears selection across all panels', () => {
       const { result } = renderHook(() => usePlayerDashboard());

       act(() => result.current.setSelectedPlayer('player-456'));
       expect(result.current.selectedPlayerId).toBe('player-456');

       act(() => result.current.clearSelection());
       expect(result.current.selectedPlayerId).toBe(null);
     });
   });
   ```

**Acceptance Criteria:**
- [ ] Integration tests pass
- [ ] All panel components tested
- [ ] Coverage ≥ 90%

### WS9: DevTools Validation

**Purpose**: Verify Redux DevTools integration for debugging.

**Manual Validation Steps:**
1. Open Redux DevTools in browser
2. Select player → observe "playerDashboard/setSelectedPlayer" action
3. Clear selection → observe "playerDashboard/clearSelection" action
4. Verify state tree shows `selectedPlayerId` in store
5. Test hot reload persistence

**Acceptance Criteria:**
- [ ] Actions logged in DevTools
- [ ] Action names are readable
- [ ] State snapshot visible

**Documentation**: Update devtools-SETUP.md with PlayerDashboard store examples.

### WS10: Documentation Update

**Purpose**: Update canonical documentation with implementation evidence.

**Changes to ADR-003:**

```diff
  ## Implementation Evidence

  - **UI Stores**: `store/ui-store.ts`, `store/pit-dashboard-store.ts` ✅
+ - **UI Stores**: `store/player-dashboard-store.ts` ✅ Implemented per PRD-014
  - **UI Hooks**: `hooks/ui/use-modal.ts`, `hooks/ui/use-pit-dashboard-ui.ts` ✅
+ - **UI Hooks**: `hooks/ui/use-player-dashboard.ts` ✅ Implemented per PRD-014
```

**Changes to STORES_STANDARD:**

Add PRD-014 store to examples section:
```typescript
// Player Dashboard Store Example
interface PlayerDashboardStore {
  selectedPlayerId: string | null;
  setSelectedPlayer: (id: string | null) => void;
  clearSelection: () => void;
}
```

**Acceptance Criteria:**
- [ ] ADR-003 updated with implementation evidence
- [ ] STORES_STANDARD includes PRD-014 example
- [ ] Build passes
- [ ] Links verified

## Definition of Done

**Infrastructure (WS1):**
- [ ] `store/player-dashboard-store.ts` created
- [ ] `hooks/ui/use-player-dashboard.ts` created
- [ ] Barrel exports updated
- [ ] devtools middleware configured

**Testing (WS2, WS8):**
- [ ] Store unit tests created and passing
- [ ] Hook unit tests created and passing
- [ ] Integration tests passing
- [ ] Coverage ≥ 90%

**Component Refactoring (WS3-WS7):**
- [ ] `PlayerDashboard.tsx` refactored (no local state)
- [ ] `PlayerSearchCommand.tsx` refactored (no selectedPlayerId prop)
- [ ] All 7 panels refactored (use hook instead of props)
- [ ] Zero prop drilling to child panels

**Validation (WS9, WS10):**
- [ ] DevTools integration verified
- [ ] ADR-003 updated with implementation evidence
- [ ] STORES_STANDARD includes example
- [ ] Build passes without errors

**Documentation:**
- [ ] Inline code comments explaining hook usage
- [ ] DevTools setup guide updated
- [ ] Test files documented

## File Structure

```
components/
  player-dashboard/
    player-dashboard.tsx                # ✓ Refactored (WS3)
    player-search-command.tsx           # ✓ Refactored (WS4)
    player-profile-panel.tsx            # ✓ Refactored (WS5)
    session-control-panel.tsx           # ✓ Refactored (WS5)
    metrics-panel.tsx                   # ✓ Refactored (WS5)
    compliance-panel.tsx                # ✓ Refactored (WS6)
    activity-visualization-panel.tsx    # ✓ Refactored (WS6)
    notes-panel.tsx                     # ✓ Refactored (WS7)
    loyalty-panel.tsx                   # ✓ Refactored (WS7)

store/
  index.ts                            # ✓ Updated (WS1)
  ui-store.ts                         # (existing from PRD-013)
  pit-dashboard-store.ts              # (existing from PRD-013)
  player-dashboard-store.ts           # ✓ New (WS1)

hooks/
  ui/
    index.ts                          # ✓ Updated (WS1)
    use-modal.ts                      # (existing from PRD-013)
    use-pit-dashboard-ui.ts           # (existing from PRD-013)
    use-player-dashboard.ts           # ✓ New (WS1)
```

## Success Metrics

- ✅ Prop drilling eliminated (0 props passed)
- ✅ All 7 panels use usePlayerDashboard() hook
- ✅ DevTools integration functional
- ✅ TypeScript compilation successful
- ✅ Test coverage ≥ 90%
- ✅ Build passes
- ✅ Pre-commit hooks pass

## References

- **PRD**: `docs/10-prd/PRD-014-player-dashboard-zustand-store.md`
- **ADR-003**: `docs/80-adrs/ADR-003-state-management-strategy.md`
- **PRD-013**: `docs/10-prd/PRD-013-zustand-state-management.md`
- **ARCH-012**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`

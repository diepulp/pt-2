---
id: PRD-014
title: Player Dashboard Zustand Store Integration
description: Eliminate prop drilling by migrating selectedPlayerId to Zustand store
version: 1.0.0
status: DRAFT
category: UI/UX
related_adr: [ADR-003, ADR-008]
related_services: [PlayerService]
related_docs: [ARCH-012, DTO-CANONICAL]
---

# PRD-014: Player Dashboard Zustand Store Integration

**Severity Assessment**: MEDIUM-HIGH severity (based on architecture review)
- **Current Impact**: Affects 7 child components with prop drilling
- **Technical Debt**: HIGH - prop drilling creates brittle architecture
- **Risk of Delay**: MEDIUM - Every new panel adds to maintenance burden
- **Business Impact**: LOW (internal developer experience)

## Context

The Player Dashboard component (`components/player-dashboard/player-dashboard.tsx`) currently uses local React state to manage the selected player, requiring prop drilling to 7 child panels:

### Current Architecture (Anti-Pattern)

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

**Problems Identified**:
- 7 components receive identical `playerId` prop
- New panels require adding props to interface
- Type safety must be maintained across all components
- Testing requires mocking props in multiple locations
- Component composition is constrained

## Decision

Migrate `selectedPlayerId` state management to a dedicated Zustand store following established patterns (ui-store, pit-dashboard-store).

### Proposed Architecture

```
PlayerDashboard
  └─ usePlayerDashboard() → { selectedPlayerId, setSelectedPlayer }
      No prop drilling required - all children use hook
```

**Store Interface** (`store/player-dashboard-store.ts`):

```typescript
interface PlayerDashboardStore {
  selectedPlayerId: string | null;
  setSelectedPlayer: (id: string | null) => void;
  clearSelection: () => void;
}
```

**Selector Hook** (`hooks/ui/use-player-dashboard.ts`):

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

## Scope

### Database
- ❌ No database changes required (UI state only)

### Service Layer
- ❌ No service layer changes required

### API Layer
- ❌ No API changes required

### Frontend
- ✅ Create `store/player-dashboard-store.ts`
- ✅ Create `hooks/ui/use-player-dashboard.ts`
- ✅ Refactor `PlayerDashboard.tsx` to use store
- ✅ Refactor 7 child panels to use hook
- ✅ Update `PlayerSearchCommand` to use store action
- ✅ Add unit tests
- ✅ Update barrel exports
- ✅ Update documentation

**Affected Files**:
- `components/player-dashboard/player-dashboard.tsx` (refactor)
- `components/player-dashboard/player-profile-panel.tsx` (refactor)
- `components/player-dashboard/session-control-panel.tsx` (refactor)
- `components/player-dashboard/metrics-panel.tsx` (refactor)
- `components/player-dashboard/compliance-panel.tsx` (refactor)
- `components/player-dashboard/activity-visualization-panel.tsx` (refactor)
- `components/player-dashboard/notes-panel.tsx` (refactor)
- `components/player-dashboard/loyalty-panel.tsx` (refactor)
- `components/player-dashboard/player-search-command.tsx` (refactor)
- `store/player-dashboard-store.ts` (new)
- `hooks/ui/use-player-dashboard.ts` (new)
- `store/index.ts` (update)
- `hooks/ui/index.ts` (update)

## Definition of Done

### Store Implementation
- [ ] `store/player-dashboard-store.ts` created with TypeScript types
- [ ] Store uses `devtools` middleware for debugging
- [ ] Store actions have action names (devtools labels)
- [ ] Store follows existing patterns (ui-store, pit-dashboard-store)

### Hook Implementation
- [ ] `hooks/ui/use-player-dashboard.ts` created with `useShallow` selector
- [ ] Hook properly types return value
- [ ] Hook follows existing selector patterns

### Component Refactoring
- [ ] `PlayerDashboard.tsx` uses `usePlayerDashboard()` instead of `useState`
- [ ] All 7 child panels use `usePlayerDashboard()` hook
- [ ] `PlayerSearchCommand` uses `setSelectedPlayer` action
- [ ] No `selectedPlayerId` props passed to children
- [ ] No `playerId` props passed to panels
- [ ] TypeScript compilation successful

### Testing
- [ ] Unit tests for store actions (setSelectedPlayer, clearSelection)
- [ ] Unit tests for hook selector
- [ ] Component integration tests (PlayerDashboard)
- [ ] All existing tests pass
- [ ] New test coverage ≥ 90%

### Documentation
- [ ] Update ADR-003 implementation evidence section
- [ ] Add player-dashboard-store to architecture examples
- [ ] Update Zustand store documentation
- [ ] Update component documentation

## Acceptance Criteria

### Functional Requirements
1. Player selection state managed by Zustand store
2. Zero prop drilling of `selectedPlayerId` to child panels
3. All child panels use `usePlayerDashboard()` hook
4. DevTools integration functional (Redux DevTools)
5. TypeScript type safety maintained

### Non-Functional Requirements
1. No performance regression (useShallow prevents unnecessary re-renders)
2. DevTools labels enable debugging
3. Test coverage meets PT-2 standards
4. Follows established Zustand patterns
5. Pre-commit hooks pass (ESLint, Prettier, Zustand validation)

## Architecture Alignment

### ADR-003 Compliance
✅ **Zustand for UI state** (ephemeral)
✅ **React Query for server data** (player data via usePlayer)
✅ **useShallow for selectors** (required per ADR-003 §8)
✅ **DevTools middleware** (required per ADR-003 §8)
✅ **Functional factory pattern** (vs class-based)

### Existing Pattern Alignment
| Store | Purpose | Status |
|-------|---------|--------|
| ui-store.ts | Modal state, sidebar collapse | ✅ EXISTS |
| pit-dashboard-store.ts | Table/slip selection | ✅ EXISTS |
| player-dashboard-store.ts | Player selection | ⬅️ NEW |

### File Structure Consistency
```
store/
  ui-store.ts           ✅ EXISTS
  pit-dashboard-store.ts ✅ EXISTS
  player-dashboard-store.ts ⬅️ NEW
  index.ts              ✅ EXISTS

hooks/ui/
  use-modal.tsx         ✅ EXISTS
  use-pit-dashboard-ui.tsx ✅ EXISTS
  use-player-dashboard.ts ⬅️ NEW
  index.ts              ✅ EXISTS
```

## Implementation Plan

### Phase 1: Core Store (0.5 days)
- Create `store/player-dashboard-store.ts`
- Create `hooks/ui/use-player-dashboard.ts`
- Update barrel exports
- Add basic unit tests

### Phase 2: Component Refactoring (1 day)
- Refactor `PlayerDashboard.tsx`
- Refactor `PlayerSearchCommand.tsx`
- Refactor child panels (in parallel streams):
  - PlayerProfilePanel
  - SessionControlPanel
  - MetricsPanel
  - CompliancePanel
  - ActivityVisualizationPanel
  - NotesPanel
  - LoyaltyPanel

### Phase 3: Testing & Validation (0.5 days)
- Add comprehensive unit tests
- Update integration tests
- Verify DevTools integration
- Run full test suite
- TypeScript compilation check
- Pre-commit hook validation

**Total Timeline**: 2 days
**Complexity**: LOW (follows established patterns)

## Alternatives Considered

### 1. React Context API
**Rejected**: No DevTools integration, less performant for frequent updates, doesn't support useShallow selectors.

### 2. Prop Drilling (Status Quo)
**Rejected**: Creates brittle architecture, maintenance burden increases with each new panel, violates DRY principle.

### 3. URL State (Query Params)
**Rejected**: Player selection is ephemeral UI state, not shareable/bookmarkable state. URL state better for filters and navigation.

### 4. React Query Cache
**Rejected**: Player selection is UI state, not server state. Misuse of React Query would break cache invalidation semantics.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Store causes unnecessary re-renders | Low | Medium | Use useShallow selector |
| Developers confused by new pattern | Low | Low | Follows existing patterns |
| DevTools not working | Very Low | Low | Standard devtools middleware |
| TypeScript errors | Low | Low | Follow existing type patterns |
| Test coverage gaps | Medium | Low | Follow test file patterns |

## Success Metrics

- ✅ Prop drilling eliminated (0 props passed)
- ✅ All 7 panels use hook consistently
- ✅ Unit tests pass (≥ 90% coverage)
- ✅ DevTools integration functional
- ✅ No TypeScript errors
- ✅ No performance regression
- ✅ Pre-commit hooks pass

## Related Issues

- Checkpoint context from skill-creator session (2025-12-21T22:16:58)
- PRD-013: Zustand State Management Testing (completed)
- ISSUE-45C3C18B: x-idempotency-key regression (unrelated)

## References

- **ADR-003**: `docs/80-adrs/ADR-003-state-management-strategy.md`
- **ARCH-012**: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **DTO-CANONICAL**: `docs/25-api-data/DTO_CANONICAL_STANDARD.md`

---

**Document Version**: 1.0.0
**Author**: Lead Systems Architect
**Date**: 2025-12-21
**Status**: DRAFT (awaiting user approval)

# Migration Notes: PT-1 → PT-2 Rating Slip Modal

## Source Reference
**File**: `/home/diepulp/projects/pt-2/reference-pt-1/components/modals/rating-slip/rating-slip-modal-v2.tsx`

## Migration Summary

### ✅ PRESERVED (UI/Layout)

#### Dialog Structure
- [x] `Dialog` root component
- [x] `DialogContent` wrapper
- [x] `DialogHeader` with title
- [x] `DialogTitle` showing player name
- [x] Modal open/close state management
- [x] Close button in header (X icon)

#### Form Sections (Complete Layout)
- [x] **FormSectionAverageBet**
  - Label + Reset button layout
  - Minus | Input | Plus button row
  - Increment button group (+5, +25, +100, +500, +1000)
  - "Total Change" indicator
- [x] **FormSectionCashIn**
  - Same layout as AverageBet
- [x] **FormSectionStartTime**
  - Label + Reset button
  - -15m | datetime-local input | +15m buttons
  - "Total Change: {n} minutes" indicator
- [x] **FormSectionMovePlayer**
  - Label + "Currently at: {table}" indicator
  - Table select dropdown
  - Seat number input with validation error display
  - "Move Player" button (full width, disabled when invalid)
- [x] **FormSectionChipsTaken**
  - Same increment layout (no reset button)

#### Action Buttons
- [x] Two-button layout (flex gap-2)
- [x] "Save Changes" button (left, primary)
- [x] "Close Session" button (right, destructive, with X icon)
- [x] Loading states ("Saving...", "Closing...", "Moving...")
- [x] Disabled states based on form validity and pending actions

#### Current Points Display
- [x] Card-style box at bottom
- [x] "Current Points" label (muted text)
- [x] Large bold number display (primary color)
- [x] `toLocaleString()` formatting

#### Loading Skeleton
- [x] 5-section skeleton placeholder
- [x] "Loading Rating Slip..." title
- [x] Shown when `isLoading` is true

#### Error Display
- [x] Error banner at top of form
- [x] Destructive background color
- [x] Conditional rendering based on `error` prop

#### Styling Classes (All Tailwind)
- [x] Spacing: `space-y-6`, `space-x-2`, `gap-2`, `mt-1`, etc.
- [x] Layout: `flex`, `grid`, `grid-cols-2`, `grid-cols-5`
- [x] Typography: `text-sm`, `text-lg`, `text-xl`, `font-medium`, `font-bold`
- [x] Colors: `text-muted-foreground`, `text-primary`, `bg-card`, `border-border`
- [x] Sizing: `h-12`, `h-4`, `w-4`, `w-full`
- [x] Borders: `border`, `rounded`, `rounded-lg`

### ❌ DISCARDED (Business Logic)

#### Hooks & State Management
- [x] ~~`useRatingSlipController`~~ - Removed entire controller
- [x] ~~`useTransition`~~ - Simplified to boolean props
- [x] ~~`useCallback` optimizations~~ - Only kept minimal in StartTime
- [x] ~~`useMemo` optimizations~~ - Only kept selectedTable lookup
- [x] ~~`useRef` for prev state tracking~~ - Removed modal reset tracking
- [x] ~~`useToast`~~ - No toast notifications in presentational component
- [x] ~~`useEffect` success handlers~~ - Callbacks handle success

#### Server Integration
- [x] ~~`handleMovePlayer` action~~ - Replaced with `onMovePlayer` callback
- [x] ~~`handleSave` action~~ - Replaced with `onSave` callback
- [x] ~~`handleClose` action~~ - Replaced with `onCloseSession` callback
- [x] ~~`moveState`, `saveState`, `closeState`~~ - Replaced with simple boolean flags
- [x] ~~`isMovesPending`, `isSavePending`, `isClosePending`~~ - Props instead
- [x] ~~Optimistic state updates~~ - Handled by parent

#### Validation Logic
- [x] ~~`getSaveValidation()`~~ - Moved to parent/hook
- [x] ~~`getMoveValidation()`~~ - Moved to parent/hook
- [x] ~~Complex validation error display~~ - Simplified to single `error` prop
- [x] ~~Toast notifications for validation errors~~ - Removed

#### Data Transformation
- [x] ~~`adaptResponseDTOToLegacy()`~~ - No longer needed
- [x] ~~Status mapping logic~~ - Handled by service layer
- [x] ~~Version tracking~~ - Simplified to basic props
- [x] ~~`legacyRatingSlip` adapter~~ - Direct DTO usage

#### Debug & Logging
- [x] ~~All `console.log()` statements~~ - Removed
- [x] ~~All `console.error()` statements~~ - Removed
- [x] ~~Debug ID mismatch analysis~~ - Removed
- [x] ~~Enhanced status mapping logs~~ - Removed

#### UI Features (Temporarily Removed)
- [x] ~~`ContextualHelpSystem`~~ - Will be added later if needed

#### Complex State Tracking
- [x] ~~`prevIsOpenRef` for modal reset~~ - Simplified
- [x] ~~`resetFormData` memoization~~ - Replaced with simple reset functions
- [x] ~~Complex form reset effect~~ - Removed

### 🔄 REPLACED

#### Props Pattern
**Before (PT-1)**:
```typescript
interface RatingSlipModalProps {
  ratingSlip: RatingSlipResponseDto;  // Complex DTO
  isOpen: boolean;
  onClose: () => void;
  tables: RatingSlipTableDto[];
}
// All actions handled internally via controller
```

**After (PT-2)**:
```typescript
interface RatingSlipModalProps {
  ratingSlip: RatingSlipDto;         // Simplified DTO
  isOpen: boolean;
  onClose: () => void;
  tables: RatingSlipTableDto[];

  // Explicit callbacks for actions
  onSave: (formState: FormState) => void;
  onCloseSession: (formState: FormState) => void;
  onMovePlayer: (formState: FormState) => void;

  // Explicit loading/error states
  isLoading?: boolean;
  isSaving?: boolean;
  isClosing?: boolean;
  isMoving?: boolean;
  error?: string | null;
}
```

#### Button Events
**Before**: `onPress={() => handleAction()}` (HeroUI)
**After**: `onClick={() => handleAction()}` (shadcn/ui)

#### Form State
**Before**: Complex controller with optimistic updates
**After**: Simple local `useState` with callback props

#### Loading States
**Before**: Derived from multiple state machines (`isSavePending || isPending`)
**After**: Simple props (`isSaving`, `isClosing`, `isMoving`)

### 📊 Component Breakdown

| Component | Lines (PT-1) | Lines (PT-2) | Reduction |
|-----------|--------------|--------------|-----------|
| rating-slip-modal-v2.tsx | 570 | 330 | 42% |
| FormSectionAverageBet | 64 | 65 | ~same |
| FormSectionCashIn | 64 | 65 | ~same |
| FormSectionStartTime | 63 | 66 | ~same |
| FormSectionMovePlayer | 154 | 110 | 29% |
| FormSectionChipsTaken | 56 | 56 | 0% |
| IncrementButtonGroup | 33 | 35 | ~same |
| **TOTAL** | **1,004** | **727** | **28%** |

### 🎯 Key Simplifications

1. **Single Responsibility**: Component only renders UI and manages local form state
2. **Props Over Hooks**: All data/actions passed as props instead of internal hooks
3. **No Side Effects**: No server calls, no cache updates, no toast notifications
4. **Simple State**: Just `formState` - no derived state, no optimistic updates
5. **Clear Interface**: Callbacks make data flow explicit and testable

### 📝 Integration Checklist

When integrating this modal into PT-2:

- [ ] Replace placeholder `RatingSlipDto` with actual service type
- [ ] Replace placeholder `RatingSlipTableDto` with actual service type
- [ ] Create container component with TanStack Query
- [ ] Add validation logic (use Zod schemas)
- [ ] Wire up Server Actions for save/close/move
- [ ] Add optimistic updates in container
- [ ] Add toast notifications in container
- [ ] Test with real data
- [ ] Add Playwright E2E tests
- [ ] Add Jest unit tests

### 🔗 Files Created

```
/home/diepulp/projects/pt-2/components/modals/rating-slip/
├── rating-slip-modal.tsx          # Main modal component
├── form-section-average-bet.tsx   # Average bet form section
├── form-section-cash-in.tsx       # Cash in form section
├── form-section-chips-taken.tsx   # Chips taken form section
├── form-section-start-time.tsx    # Start time form section
├── form-section-move-player.tsx   # Move player form section
├── increment-button-group.tsx     # Shared increment buttons
├── index.tsx                      # Re-exports
├── README.md                      # Documentation
└── MIGRATION_NOTES.md             # This file
```

All files are clean, type-safe, and ready for integration with PT-2 service layer.

---

## 🚨 ZUSTAND INTEGRATION GAP ANALYSIS

**Date**: 2025-12-26
**Status**: OPEN
**Reference**: Player Dashboard Zustand Integration (commit `e05d1a515f031ca230cc928b4ee626dbb8fb4ed4`)
**Related Issue**: ISSUE-C41F3063 (Zustand player store integration)

### Problem Statement

The rating slip modal was modernized for React 19 but lacks the Zustand store integration pattern established in the Player Dashboard. This creates:

1. **Prop drilling** through 5 form section components
2. **Inconsistent state patterns** across PT-2 modals
3. **Loading state props anti-pattern** (violates ADR-003 Zustand guidelines)

### Anti-Patterns Identified

| Anti-Pattern | Location | Severity | ADR-003 Violation |
|-------------|----------|----------|-------------------|
| **Prop Drilling** | `rating-slip-modal.tsx:309-369` | HIGH | "Zustand for ephemeral UI state" |
| **Loading State Props** | `isSaving`, `isClosing`, `isMoving` props (L76-82) | HIGH | "useTransition at action site" |
| **Local useState for Form** | `use-modal-form-state.ts:82-89` | MEDIUM | Should use Zustand for modal form state |
| **Static Config as Props** | `incrementButtons` array passed to 3 children | LOW | Configuration coupling |
| **Legacy Props Retained** | `ratingSlip?`, `tables?`, `isLoading?` (L86-93) | LOW | Backward compatibility debt |

### Prop Drilling Depth Analysis

```
RatingSlipModal (parent)
│
├── FormSectionAverageBet
│   ├── value, onChange, onReset              ← 3 state props
│   ├── incrementHandlers, decrementHandler   ← 2 handler props
│   ├── incrementButtons                      ← 1 config prop
│   └── totalChange                           ← 1 derived prop
│   └── IncrementButtonGroup (child)
│       └── type, incrementButtons, onIncrement ← 3 props
│
├── FormSectionCashIn
│   ├── value, totalCashIn, onChange, onReset ← 4 state props
│   ├── incrementHandlers, decrementHandler   ← 2 handler props
│   ├── incrementButtons                      ← 1 config prop
│   └── totalChange                           ← 1 derived prop
│
├── FormSectionStartTime
│   ├── value, onChange, onReset              ← 3 state props
│   ├── handleStartTimeChange                 ← 1 handler prop
│   └── totalChange                           ← 1 derived prop
│
├── FormSectionMovePlayer
│   ├── tables, value, seatValue, selectedTable ← 4 state props
│   ├── onTableChange, onSeatChange, onMovePlayer ← 3 handler props
│   ├── seatError                             ← 1 error prop
│   └── isUpdating, disabled                  ← 2 loading props
│
└── FormSectionChipsTaken
    ├── value, onChange                       ← 2 state props
    ├── incrementHandlers, decrementHandler   ← 2 handler props
    └── incrementButtons                      ← 1 config prop
```

**Total Props Drilled**: 35+ props across 5 form sections + 1 button group

### Comparison with Player Dashboard Pattern

| Aspect | Player Dashboard ✅ | Rating Slip Modal ❌ |
|--------|---------------------|----------------------|
| Zustand Store | `store/player-dashboard-store.ts` | **None** |
| Selector Hook | `hooks/ui/use-player-dashboard.ts` | **None** |
| useShallow | Yes (prevents re-renders) | No |
| devtools Middleware | Yes (action logging) | No |
| Loading State | `useTransition` only | Props + `useTransition` hybrid |
| Test Coverage | 20 unit + integration tests | **None** |
| Prop Drilling | Eliminated | 35+ props |

### Proposed Solution: RatingSlipModalStore

#### Store Interface

```typescript
// store/rating-slip-modal-store.ts
"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface ModalFormState {
  averageBet: string;
  startTime: string;
  newBuyIn: string;
  newTableId: string;
  newSeatNumber: string;
  chipsTaken: string;
}

export interface RatingSlipModalStore {
  // State
  slipId: string | null;
  formState: ModalFormState;
  originalState: ModalFormState;

  // Derived (computed at selector level)
  isDirty: boolean;

  // Actions
  setSlipId: (id: string | null) => void;
  initializeForm: (data: ModalFormState) => void;
  updateField: <K extends keyof ModalFormState>(field: K, value: ModalFormState[K]) => void;
  resetField: (field: keyof ModalFormState) => void;
  resetForm: () => void;
  incrementField: (field: "averageBet" | "newBuyIn" | "chipsTaken", amount: number) => void;
  decrementField: (field: "averageBet" | "newBuyIn" | "chipsTaken") => void;
  adjustStartTime: (action: "add" | "subtract", minutes: number) => void;
}

const emptyFormState: ModalFormState = {
  averageBet: "0",
  startTime: "",
  newBuyIn: "0",
  newTableId: "",
  newSeatNumber: "",
  chipsTaken: "0",
};

export const useRatingSlipModalStore = create<RatingSlipModalStore>()(
  devtools(
    (set, get) => ({
      slipId: null,
      formState: emptyFormState,
      originalState: emptyFormState,

      get isDirty() {
        const { formState, originalState } = get();
        return JSON.stringify(formState) !== JSON.stringify(originalState);
      },

      setSlipId: (id) =>
        set({ slipId: id }, undefined, "ratingSlipModal/setSlipId"),

      initializeForm: (data) =>
        set(
          { formState: data, originalState: data },
          undefined,
          "ratingSlipModal/initializeForm"
        ),

      updateField: (field, value) =>
        set(
          (state) => ({ formState: { ...state.formState, [field]: value } }),
          undefined,
          `ratingSlipModal/updateField:${field}`
        ),

      resetField: (field) =>
        set(
          (state) => ({
            formState: { ...state.formState, [field]: state.originalState[field] },
          }),
          undefined,
          `ratingSlipModal/resetField:${field}`
        ),

      resetForm: () =>
        set(
          (state) => ({ formState: state.originalState }),
          undefined,
          "ratingSlipModal/resetForm"
        ),

      incrementField: (field, amount) =>
        set(
          (state) => {
            const currentValue = Number(state.formState[field]) || 0;
            return {
              formState: {
                ...state.formState,
                [field]: (currentValue + amount).toString(),
              },
            };
          },
          undefined,
          `ratingSlipModal/incrementField:${field}`
        ),

      decrementField: (field) =>
        set(
          (state) => {
            const currentValue = Number(state.formState[field]) || 0;
            return {
              formState: {
                ...state.formState,
                [field]: Math.max(0, currentValue - 1).toString(),
              },
            };
          },
          undefined,
          `ratingSlipModal/decrementField:${field}`
        ),

      adjustStartTime: (action, minutes) =>
        set(
          (state) => {
            const currentTime = new Date(state.formState.startTime);
            if (isNaN(currentTime.getTime())) return state;

            const newTime = new Date(currentTime);
            if (action === "add") {
              newTime.setMinutes(newTime.getMinutes() + minutes);
            } else {
              newTime.setMinutes(newTime.getMinutes() - minutes);
            }

            return {
              formState: {
                ...state.formState,
                startTime: newTime.toISOString().slice(0, 16),
              },
            };
          },
          undefined,
          `ratingSlipModal/adjustStartTime:${action}:${minutes}`
        ),
    }),
    { name: "RatingSlipModalStore" }
  )
);
```

#### Selector Hook

```typescript
// hooks/ui/use-rating-slip-modal.ts
"use client";

import { useShallow } from "zustand/react/shallow";
import { useRatingSlipModalStore } from "@/store/rating-slip-modal-store";

/**
 * Selector hook for RatingSlipModalStore using useShallow.
 * Prevents unnecessary re-renders when accessing form state.
 *
 * @example
 * // In FormSectionAverageBet - only subscribes to averageBet slice
 * const { averageBet, updateField, incrementField } = useRatingSlipModal();
 */
export function useRatingSlipModal() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      // State
      slipId: state.slipId,
      formState: state.formState,
      isDirty: JSON.stringify(state.formState) !== JSON.stringify(state.originalState),

      // Actions
      setSlipId: state.setSlipId,
      initializeForm: state.initializeForm,
      updateField: state.updateField,
      resetField: state.resetField,
      resetForm: state.resetForm,
      incrementField: state.incrementField,
      decrementField: state.decrementField,
      adjustStartTime: state.adjustStartTime,
    }))
  );
}

/**
 * Field-specific selectors for optimized re-renders.
 * Use these in form sections to minimize prop drilling.
 */
export function useAverageBetField() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      value: state.formState.averageBet,
      originalValue: state.originalState.averageBet,
      updateField: state.updateField,
      resetField: state.resetField,
      incrementField: state.incrementField,
      decrementField: state.decrementField,
    }))
  );
}

export function useNewBuyInField() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      value: state.formState.newBuyIn,
      originalValue: state.originalState.newBuyIn,
      updateField: state.updateField,
      resetField: state.resetField,
      incrementField: state.incrementField,
      decrementField: state.decrementField,
    }))
  );
}

export function useStartTimeField() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      value: state.formState.startTime,
      originalValue: state.originalState.startTime,
      updateField: state.updateField,
      resetField: state.resetField,
      adjustStartTime: state.adjustStartTime,
    }))
  );
}

export function useMovePlayerFields() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      tableId: state.formState.newTableId,
      seatNumber: state.formState.newSeatNumber,
      updateField: state.updateField,
    }))
  );
}

export function useChipsTakenField() {
  return useRatingSlipModalStore(
    useShallow((state) => ({
      value: state.formState.chipsTaken,
      updateField: state.updateField,
      incrementField: state.incrementField,
      decrementField: state.decrementField,
    }))
  );
}
```

### Files to Create

| File | Purpose | Complexity |
|------|---------|------------|
| `store/rating-slip-modal-store.ts` | Zustand store with devtools | Medium |
| `store/__tests__/rating-slip-modal-store.test.ts` | Store unit tests | Medium |
| `hooks/ui/use-rating-slip-modal.ts` | Selector hooks with useShallow | Low |
| `hooks/ui/__tests__/use-rating-slip-modal.test.ts` | Hook tests | Low |

### Files to Modify

| File | Changes | Complexity |
|------|---------|------------|
| `store/index.ts` | Export new store | Low |
| `hooks/ui/index.ts` | Export new hooks | Low |
| `components/modals/rating-slip/rating-slip-modal.tsx` | Replace useState with store | High |
| `components/modals/rating-slip/use-modal-form-state.ts` | **DELETE** (replaced by store) | - |
| `components/modals/rating-slip/form-section-average-bet.tsx` | Use `useAverageBetField()` hook | Medium |
| `components/modals/rating-slip/form-section-cash-in.tsx` | Use `useNewBuyInField()` hook | Medium |
| `components/modals/rating-slip/form-section-start-time.tsx` | Use `useStartTimeField()` hook | Medium |
| `components/modals/rating-slip/form-section-move-player.tsx` | Use `useMovePlayerFields()` hook | Medium |
| `components/modals/rating-slip/form-section-chips-taken.tsx` | Use `useChipsTakenField()` hook | Medium |

### Implementation Phases

#### Phase 1: Store Foundation (2 tasks)
1. Create `store/rating-slip-modal-store.ts` with devtools
2. Create `hooks/ui/use-rating-slip-modal.ts` with field selectors

#### Phase 2: Form Section Refactor (5 tasks)
1. Refactor `FormSectionAverageBet` to use `useAverageBetField()`
2. Refactor `FormSectionCashIn` to use `useNewBuyInField()`
3. Refactor `FormSectionStartTime` to use `useStartTimeField()`
4. Refactor `FormSectionMovePlayer` to use `useMovePlayerFields()`
5. Refactor `FormSectionChipsTaken` to use `useChipsTakenField()`

#### Phase 3: Modal Integration (2 tasks)
1. Update `RatingSlipModal` to initialize store from `useRatingSlipModalData`
2. Delete `use-modal-form-state.ts` (replaced by store)

#### Phase 4: Loading State Cleanup (1 task)
1. Remove `isSaving`, `isClosing`, `isMoving` props; use `useTransition` at action sites

#### Phase 5: Testing (2 tasks)
1. Add store unit tests (mirroring `player-dashboard-store.test.ts`)
2. Add integration tests for form sections with store

### Estimated Complexity

| Phase | Tasks | Lines of Code | Risk |
|-------|-------|---------------|------|
| Store Foundation | 2 | ~150 | Low |
| Form Section Refactor | 5 | ~100 (net reduction) | Medium |
| Modal Integration | 2 | ~50 (net reduction) | Medium |
| Loading State Cleanup | 1 | ~30 (removal) | Low |
| Testing | 2 | ~250 | Low |
| **Total** | **12** | **~580 new, ~180 removed** | Medium |

### Dependencies

- `zustand` (already installed)
- `zustand/react/shallow` (already available)
- `zustand/middleware` (devtools, already available)
- No new packages required

### Success Criteria

- [ ] Prop drilling eliminated from all 5 form sections
- [ ] `isSaving`, `isClosing`, `isMoving` props removed from `RatingSlipModalProps`
- [ ] `useTransition` used at action sites only
- [ ] `use-modal-form-state.ts` deleted
- [ ] DevTools shows named actions (e.g., `ratingSlipModal/updateField:averageBet`)
- [ ] 100% unit test coverage for store actions
- [ ] Integration tests for form section → store → render cycle
- [ ] TypeScript compilation: 0 errors
- [ ] Build: Production build successful

### React 19 Compliance Checklist

After Zustand integration:

- [ ] **No `useEffect` sync patterns** — Store initialized via key-based reset
- [ ] **No manual loading states** — `useTransition` at action site
- [ ] **No loading state props** — Removed `isSaving`, `isClosing`, `isMoving`
- [ ] **No unnecessary memoization** — React 19 Compiler handles optimization
- [ ] **No `eslint-disable exhaustive-deps`** — Store actions are stable references

---

## Related Documents

- **ADR-003**: State Management Strategy (`docs/80-adrs/ADR-003-state-management-strategy.md`)
- **Player Dashboard Store**: `store/player-dashboard-store.ts` (reference implementation)
- **Hooks Standard**: `docs/70-governance/HOOKS_STANDARD.md`
- **Issue**: ISSUE-C41F3063 (Zustand player store integration)

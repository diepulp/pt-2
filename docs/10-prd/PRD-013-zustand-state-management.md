# PRD-013 — Zustand State Management Implementation

---
id: PRD-013
title: Zustand State Management Implementation
owner: Architecture
status: Ready
created: 2025-12-21
updated: 2025-12-21
sdlc_category: GOV/ARCH
affects: [ADR-003, HOOKS_STANDARD, FRONT_END_CANONICAL_STANDARD]
---

## 1. Overview

- **Owner:** Architecture
- **Status:** Ready
- **Summary:** Implement Zustand stores for ephemeral UI state as specified in ADR-003 §8. The system currently relies entirely on local `useState` and prop drilling for UI state (modals, table selection, panel navigation), violating the documented architecture. This PRD addresses the gap by creating the `store/` infrastructure and refactoring key dashboard components to consume centralized state.

## 2. Problem & Goals

### 2.1 Problem

The PT-2 codebase has Zustand installed (`zustand: ^5.0.9`) but no stores exist. ADR-003 was accepted on 2025-10-10 specifying:

> "UI Stores: `store/ui-store.ts`, `store/player-store.ts`"

These files were never created. The current implementation exhibits:

1. **Duplicated modal state** across `pit-dashboard-client.tsx` and `pit-panels-client.tsx` (5 identical `useState` declarations each)
2. **Excessive prop drilling** — `PanelContainer` accepts 18 props, passing state 4 levels deep
3. **No shared UI state** — Selected table, selected slip, and panel navigation are isolated per component instance
4. **Missing `hooks/ui/` directory** — ADR-003 requires Zustand-only hooks in this location

### 2.2 Goals

1. **Create `store/` directory** with Zustand stores per ADR-003 §8 specification
2. **Create `hooks/ui/` directory** with UI state selectors per HOOKS_STANDARD §1
3. **Eliminate duplicate modal state** — Single source of truth for modal open/close
4. **Reduce PanelContainer props** from 18 to <10 by consuming shared state
5. **Enable consistent UI state** across dashboard variants (pit-dashboard, pit-panels)

### 2.3 Non-Goals

- **Server state in Zustand** — React Query remains the sole owner of fetched data (ADR-003 §8: "Excludes server data, fetched data")
- **URL state for filters** — Complex filter bookmarkability deferred to future PRD
- **Persistence for selection state** — Only persist benign UI prefs (sidebar collapse, view mode)
- **Form state migration** — Existing form hooks (`useModalFormState`) remain unchanged

## 3. Users & Use Cases

- **Primary users:** Frontend developers implementing dashboard features

**Top Jobs:**
- As a developer, I need a centralized modal store so that I don't duplicate `isOpen` state across components.
- As a developer, I need shared table selection state so that switching between dashboard views preserves selection.
- As a developer, I need typed UI state selectors so that I get autocomplete and type safety.

## 4. Scope & Feature List

### In Scope

- [ ] Create `store/ui-store.ts` with modal state slice
- [ ] Create `store/dashboard-store.ts` with table/slip selection state
- [ ] Create `store/index.ts` with combined store export
- [ ] Create `hooks/ui/use-modal.ts` selector hook
- [ ] Create `hooks/ui/use-dashboard-ui.ts` selector hook
- [ ] Create `hooks/ui/index.ts` barrel export
- [ ] Refactor `PitDashboardClient` to consume stores
- [ ] Refactor `PitPanelsClient` to consume stores
- [ ] Refactor `PanelContainer` to reduce prop count
- [ ] Add devtools middleware for debugging

### Out of Scope

- **Player-specific stores** (`store/player-store.ts` mentioned in ADR-003 — deferred)
  - *Rationale*: Zustand v5 slices pattern allows easy addition later. No concrete use case exists yet; current player data is server state managed by React Query. Will add when ephemeral player UI state emerges (e.g., player comparison mode, bulk selection).
- Persistence middleware (future enhancement)
- URL state integration for table selection
- Store tests (covered by component integration tests)

## 5. Requirements

### 5.1 Functional Requirements

**FR-1: UI Store (Modal State)**
```typescript
interface UIStore {
  modal: { type: string | null; isOpen: boolean; data?: unknown };
  openModal: (type: string, data?: unknown) => void;
  closeModal: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}
```
- Modal types: `'rating-slip'`, `'new-slip'`, `'player-search'`
- `data` payload carries context (e.g., `slipId`, `seatNumber`)

**FR-2: Dashboard Store (Selection State)**
```typescript
interface DashboardStore {
  selectedTableId: string | null;
  selectedSlipId: string | null;
  activePanel: 'tables' | 'activity' | 'inventory' | 'analytics';
  setSelectedTable: (id: string | null) => void;
  setSelectedSlip: (id: string | null) => void;
  setActivePanel: (panel: DashboardStore['activePanel']) => void;
  clearSelection: () => void;
}
```

**FR-3: Selector Hooks**
- `useModal()` — returns `{ isOpen, type, data, open, close }`
- `useDashboardUI()` — returns `{ selectedTableId, selectedSlipId, activePanel, ... }`
- Hooks must use `shallow` equality for array/object selectors

**FR-4: RSC Hygiene**
- All store files marked with `'use client'` directive
- No store access in Server Components
- Stores initialized lazily on first client access

### 5.2 Non-Functional Requirements

- **NFR-1:** Zustand devtools integration for Redux DevTools debugging
- **NFR-2:** TypeScript strict mode compliance (no `any` casts)
- **NFR-3:** Bundle size increase < 2KB (Zustand is ~1KB)

> Architecture details: See ADR-003 §8 for store patterns, HOOKS_STANDARD §1 for folder layout.

## 6. UX / Flow Overview

No user-facing UX changes. This is an internal refactor.

**Developer flow:**
1. Import hooks from `@/hooks/ui`
2. Consume state via selectors: `const { isOpen } = useModal()`
3. Dispatch actions: `openModal('rating-slip', { slipId })`

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Zustand v5.0.9 | ✅ Installed | Upgraded 2025-12-21, React 18+ required (React 19 ✅) |
| React 19.1.1 | ✅ Compatible | Zustand v5 fully supports React 19 |
| Next.js 16.0.7 | ✅ Compatible | `'use client'` pattern unchanged from v15; no breaking changes for client state |
| ADR-003 | ✅ Accepted | Defines store requirements |
| HOOKS_STANDARD | ✅ Accepted | Defines `hooks/ui/` structure |
| @redux-devtools/extension | ⚠️ Optional | Required for devtools TypeScript types |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| SSR hydration mismatch | Use `'use client'` directive; avoid server-side store access |
| Breaking existing components | Incremental refactor with fallback to local state |
| Scope creep into server state | ESLint rule: no React Query in `hooks/ui/` |

**Open Questions (Resolved):**

| Question | Resolution |
|----------|------------|
| Single store vs slices? | Domain slices combined at root (ADR-003 §8) |
| Persist selection state? | No — only benign UI prefs (ADR-003 §8) |
| URL params for table ID? | Deferred to future PRD |
| Include player-store.ts? | Deferred — Zustand v5 slices pattern allows easy addition later; no concrete use case yet (player data is server state via React Query) |
| React 19 / Next.js 16 compatibility? | ✅ Confirmed via context7 docs — `'use client'` pattern unchanged, no breaking changes for Zustand |

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `store/ui-store.ts` exists with modal state per FR-1
- [ ] `store/dashboard-store.ts` exists with selection state per FR-2
- [ ] `hooks/ui/use-modal.ts` provides typed selector hook
- [ ] `hooks/ui/use-dashboard-ui.ts` provides typed selector hook
- [ ] `PitDashboardClient` uses stores instead of 5 local `useState`
- [ ] `PitPanelsClient` uses stores instead of 5 local `useState`
- [ ] `PanelContainer` prop count reduced from 18 to <10

**Data & Integrity**
- [ ] Modal open/close state consistent across dashboard variants
- [ ] Table selection preserved when switching between views

**Testing**
- [ ] Existing Playwright E2E tests pass (no regression)
- [ ] Manual smoke test: open/close modals, select tables, switch panels

**Documentation**
- [ ] ADR-003 Implementation Evidence section updated with file paths
- [ ] HOOKS_STANDARD `hooks/ui/` examples reflect actual implementation

## 9. Related Documents

| Category | Document | Relevance |
|----------|----------|-----------|
| ADR | `docs/80-adrs/ADR-003-state-management-strategy.md` | Source requirements (§8) |
| GOV | `docs/70-governance/HOOKS_STANDARD.md` | Folder layout (§1, §2) |
| GOV | `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md` | State decision table (§3) |
| GOV | `docs/70-governance/anti-patterns/03-state-management.md` | Anti-patterns to avoid |
| ARCH | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | Client layer context |

---

## Appendix A: File Structure

```
store/
├── index.ts                 # Combined store export
├── ui-store.ts              # Modal, sidebar state
├── dashboard-store.ts       # Table/slip selection, panel nav
└── middleware.ts            # devtools config (optional)

hooks/
├── ui/                      # NEW directory
│   ├── index.ts             # Barrel export
│   ├── use-modal.ts         # Modal state selector
│   └── use-dashboard-ui.ts  # Dashboard UI state selector
└── ...existing domain hooks...
```

## Appendix B: Implementation Sketch

```typescript
// store/ui-store.ts
'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {} from '@redux-devtools/extension'; // Required for devtools typing

type ModalType = 'rating-slip' | 'new-slip' | 'player-search' | null;

interface ModalState {
  type: ModalType;
  isOpen: boolean;
  data?: unknown;
}

interface UIStore {
  modal: ModalState;
  openModal: (type: ModalType, data?: unknown) => void;
  closeModal: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      modal: { type: null, isOpen: false },
      openModal: (type, data) =>
        set(
          { modal: { type, isOpen: true, data } },
          undefined,
          'ui/openModal' // Action name for Redux DevTools traceability
        ),
      closeModal: () =>
        set(
          { modal: { type: null, isOpen: false, data: undefined } },
          undefined,
          'ui/closeModal'
        ),
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set(
          (s) => ({ sidebarCollapsed: !s.sidebarCollapsed }),
          undefined,
          'ui/toggleSidebar'
        ),
    }),
    { name: 'ui-store' }
  )
);
```

```typescript
// hooks/ui/use-modal.ts
'use client';

import { useUIStore } from '@/store/ui-store';
import { useShallow } from 'zustand/react/shallow';

export function useModal() {
  return useUIStore(
    useShallow((s) => ({
      isOpen: s.modal.isOpen,
      type: s.modal.type,
      data: s.modal.data,
      open: s.openModal,
      close: s.closeModal,
    }))
  );
}
```

---

## Appendix C: Zustand v5 Compatibility Notes

Research conducted 2025-12-21 using official Zustand documentation (context7).

### React 19 / Next.js 16 Compatibility ✅

- Zustand v5 requires React 18+ (React 19.1.1 fully supported)
- Next.js 16.0.7 App Router patterns unchanged for client components
- Next.js 16 breaking changes (async request APIs, ESLint CLI) do not affect Zustand stores
- `'use client'` directive pattern remains the same

### Key v5 Patterns Applied

1. **`useShallow` import**: `import { useShallow } from 'zustand/react/shallow'`
2. **Stable selector outputs**: Required in v5; `useShallow` handles array/object selectors
3. **Devtools typing**: `import type {} from '@redux-devtools/extension'`
4. **Action naming**: Third argument to `set()` for Redux DevTools traceability

### Slices Pattern for Future Extensibility

Zustand v5 slices pattern allows combining stores:

```typescript
// Future: Add player-store.ts using slices pattern
export const useBoundStore = create(
  devtools((...a) => ({
    ...createUISlice(...a),
    ...createDashboardSlice(...a),
    ...createPlayerSlice(...a), // Add later without breaking changes
  }))
);
```

---

**Changelog:**
- 2025-12-21: Updated compatibility notes for Next.js 16.0.7 (no breaking changes for Zustand)
- 2025-12-21: Added Zustand v5 compatibility notes from official docs research
- 2025-12-21: Updated implementation sketch with devtools action naming pattern
- 2025-12-21: Upgraded Zustand from 5.0.8 to 5.0.9
- 2025-12-21: Initial draft created from state management audit findings

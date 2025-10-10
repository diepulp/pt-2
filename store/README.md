# Zustand Store Guidelines

## Overview

This directory contains Zustand stores for managing **ephemeral UI state only**. These stores are designed for temporary, client-side state that does not need to persist across sessions or be synchronized with the server.

## Scope: Ephemeral UI State ONLY

### What Goes in Zustand

Use Zustand stores for transient UI state that:

- **Modal State**: Open/close state, modal type, temporary modal data
- **Navigation State**: Sidebar open/close, active tabs, accordion state
- **UI Filters**: Search queries, filter selections, sort preferences (UI-only)
- **View Mode**: Grid vs list vs table display preferences
- **Selection State**: Multi-select for bulk actions
- **Form State**: Multi-step form progress, temporary form data
- **Toast/Notifications**: Temporary notification queue
- **UI Interactions**: Hover states, focus states, loading indicators

### What Does NOT Go in Zustand

Do **NOT** use Zustand for:

- **Server Data**: Player data, visits, rating slips, transactions
  - Use React Query instead
- **Fetched Data**: Any data retrieved from APIs or database
  - Use React Query instead
- **Persistent State**: User preferences, settings that should survive page reload
  - Use database or localStorage with proper sync
- **User Session**: Authentication state, user profile
  - Use Next.js auth system
- **Real-time Data**: Live updates from Supabase
  - Use real-time hooks with React Query

## Rule: React Query Owns ALL Server State

**React Query is the single source of truth for server data.** Zustand stores should never:

- Cache server responses
- Store fetched data
- Manage loading/error states for API calls
- Replace React Query mutations

If you need server data, use React Query's `useQuery` or `useMutation` hooks.

## Available Stores

### 1. Global UI Store (`ui-store.ts`)

Manages application-wide UI state.

**State:**

- Modal dialogs (open/close, type, data)
- Sidebar navigation
- Toast notifications

**Example Usage:**

```typescript
import { useUIStore } from '@/store/ui-store';

function MyComponent() {
  const { modal, openModal, closeModal } = useUIStore();

  // Open a confirmation modal
  const handleDelete = () => {
    openModal('confirm', {
      title: 'Delete Player?',
      playerId: '123'
    });
  };

  return (
    <button onClick={handleDelete}>Delete</button>
  );
}
```

**Optimized Selectors:**

```typescript
import { useUIStore, selectModal } from '@/store/ui-store';

// Only re-render when modal state changes
function ModalComponent() {
  const modal = useUIStore(selectModal);
  return modal.isOpen ? <Modal {...modal} /> : null;
}
```

### 2. Player UI Store (`player-store.ts`)

Manages UI state specific to player management views.

**State:**

- Search query
- Status filter
- Sort preferences
- Pagination UI (page number, items per page)
- View mode (grid/list/table)
- Selected player IDs (for bulk actions)

**Example Usage:**

```typescript
import { usePlayerUIStore } from '@/store/player-store';

function PlayerList() {
  const {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter
  } = usePlayerUIStore();

  // React Query fetches actual data
  const { data: players } = useQuery({
    queryKey: ['players', searchQuery, statusFilter],
    queryFn: () => fetchPlayers({ search: searchQuery, status: statusFilter })
  });

  return (
    <div>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="all">All</option>
        <option value="active">Active</option>
      </select>
      {/* Render players from React Query */}
    </div>
  );
}
```

**Optimized Selectors:**

```typescript
import { usePlayerUIStore, selectPlayerFilters } from "@/store/player-store";

function PlayerFilters() {
  const { searchQuery, statusFilter } = usePlayerUIStore(selectPlayerFilters);
  // Component only re-renders when filter values change
}
```

## Best Practices

### 1. Use Selectors for Performance

Zustand supports selective subscriptions to prevent unnecessary re-renders:

```typescript
// BAD: Re-renders on any store change
const store = useUIStore();

// GOOD: Only re-renders when modal state changes
const modal = useUIStore((state) => state.modal);

// BEST: Use pre-defined selectors
const modal = useUIStore(selectModal);
```

### 2. Keep Actions Simple

Actions should be simple state updates. Avoid side effects or async operations:

```typescript
// GOOD: Simple state update
closeModal: () => set({ modal: { isOpen: false, type: null } });

// BAD: Side effects in actions
closeModal: () => {
  api.logModalClose(); // Side effect!
  set({ modal: { isOpen: false, type: null } });
};
```

### 3. Reset State When Appropriate

Provide reset functions for filters and transient state:

```typescript
const { resetFilters } = usePlayerUIStore();

// Reset filters when navigating away
useEffect(() => {
  return () => resetFilters();
}, []);
```

### 4. Coordinate with React Query

Zustand filter state should trigger React Query refetches:

```typescript
const { searchQuery, statusFilter } = usePlayerUIStore();

// React Query automatically refetches when dependencies change
const { data } = useQuery({
  queryKey: ["players", searchQuery, statusFilter],
  queryFn: () => fetchPlayers({ search: searchQuery, status: statusFilter }),
});
```

### 5. Document Store Boundaries

Each store should have clear JSDoc comments explaining:

- What state it manages
- What it should NOT manage
- Example usage patterns

## State Architecture Decision

**Zustand**: Ephemeral UI state (modals, filters, view modes)
**React Query**: Server state (players, visits, mutations)
**Database**: Persistent state (user settings, preferences)
**Next.js Auth**: Session and authentication state

This separation ensures:

- Clear responsibility boundaries
- No duplicate state management
- Predictable data flow
- Easy testing and debugging

## Adding New Stores

When creating a new store:

1. **Justify the need**: Can this be component state? Does it need global access?
2. **Define boundaries**: Document what goes in the store vs React Query
3. **Provide selectors**: Export optimized selectors for common use cases
4. **Add reset logic**: Include functions to reset transient state
5. **Document usage**: Add examples to this README

## Testing Stores

Test stores in isolation:

```typescript
import { renderHook, act } from "@testing-library/react";
import { useUIStore } from "@/store/ui-store";

test("openModal sets modal state", () => {
  const { result } = renderHook(() => useUIStore());

  act(() => {
    result.current.openModal("create", { foo: "bar" });
  });

  expect(result.current.modal.isOpen).toBe(true);
  expect(result.current.modal.type).toBe("create");
  expect(result.current.modal.data).toEqual({ foo: "bar" });
});
```

## Migration Notes

If you find yourself wanting to store server data in Zustand:

1. **Stop**: Server data belongs in React Query
2. **Use useQuery**: For fetching and caching data
3. **Use useMutation**: For creating, updating, deleting data
4. **Store UI state only**: Keep filters, pagination UI state in Zustand

## References

- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [React Query Documentation](https://tanstack.com/query/latest/docs/react/overview)
- [PT-2 Service Layer Architecture](../docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)

## Questions?

If you're unsure whether state belongs in Zustand or React Query:

**Ask yourself:**

1. Does this data come from the server? **React Query**
2. Does this need to persist across sessions? **Database + React Query**
3. Is this temporary UI state? **Zustand**
4. Is this component-specific? **useState**

When in doubt, prefer React Query for data and useState for component state.

# Week 4: Player Management Feature - DETAILED WORKFLOW

**Date**: 2025-10-12
**Phase**: 3 - State Management Layer
**Week**: 4 - Player Management (VERTICAL Slice)
**Strategy**: Wave-based with parallel execution in Wave 2
**Total Duration**: 15.5 hours (saves 1.5h via parallelization)

---

## 🎯 Executive Summary

Week 4 delivers the first complete VERTICAL feature slice: Player Management. This builds on Week 3's HORIZONTAL infrastructure to create a working DB→Service→Action→Hook→UI stack with full CRUD capabilities.

**Key Objectives**:
- Implement complete player management workflow
- Validate Week 3 infrastructure with real feature
- Establish patterns for Weeks 5-6 (Visit, RatingSlip)
- Achieve >90% test coverage
- Enable users to create, read, update, delete players

**Time Performance**:
- **Original Estimate**: 17 hours
- **Optimized with Parallelization**: 15.5 hours
- **Time Saved**: 1.5 hours (9% improvement)

**Dependencies from Week 3**:
- ✅ React Query configured (lib/query-client.ts)
- ✅ Server action wrapper (lib/actions/with-server-action-wrapper.ts)
- ✅ Hook templates (hooks/shared/use-service-query.ts, use-service-mutation.ts)
- ✅ Player service validated (integration tests passed)
- ✅ Query key patterns documented (30 examples)
- ✅ Cache invalidation strategies (3 proven patterns)

---

## 📊 Week 4 Wave Summary

| Wave | Focus | Duration | Execution Mode | Agent(s) | Quality Gates |
|------|-------|----------|----------------|----------|---------------|
| **Wave 1** | Server Actions | 4h | Sequential | Backend Architect | 6 gates |
| **Wave 2** | Query + Mutation Hooks | 1.5h | **PARALLEL** | 2x TypeScript Pro | 8 gates |
| **Wave 3** | UI Components | 6h | Sequential | Full-Stack Developer | 8 gates |
| **Wave 4** | E2E Tests | 4h | Sequential | Full-Stack Developer | 6 gates |

**Total**: 15.5 hours, 28 quality gates, 1 parallelization point

---

## Wave 1: Server Actions (4 hours) - SEQUENTIAL

### Execution Mode
**Sequential** - Foundation layer, must be solid before proceeding

### Agent Assignment
**Backend Architect** - Expert in server-side logic, error handling, database operations

### Task 1.1: Implement Player Server Actions ✅

**Duration**: 4 hours

**Deliverables**:
1. `app/actions/player-actions.ts` (~250 lines)
   - `createPlayer(data: CreatePlayerDTO)` → Result<Player>
   - `updatePlayer(id: string, data: UpdatePlayerDTO)` → Result<Player>
   - `deletePlayer(id: string)` → Result<void>
   - `getPlayer(id: string)` → Result<Player>
   - `getPlayers(filters?: PlayerFilters)` → Result<Player[]>
   - `searchPlayers(query: string)` → Result<Player[]>

**Implementation Requirements**:

```typescript
// File: app/actions/player-actions.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { withServerAction } from '@/lib/actions/with-server-action-wrapper';
import { createPlayerService } from '@/services/player/business';
import type { Database } from '@/types/database.types';
import type {
  CreatePlayerDTO,
  UpdatePlayerDTO,
  PlayerFilters
} from '@/services/player/types';

/**
 * Create a new player
 * @throws VALIDATION_ERROR if data invalid
 * @throws UNIQUE_VIOLATION if player_code already exists
 */
export const createPlayer = withServerAction(
  async (data: CreatePlayerDTO) => {
    const supabase = createServerClient();
    const service = createPlayerService(supabase);
    return await service.create(data);
  },
  {
    operation: 'player.create',
    requireAuth: true,
  }
);

/**
 * Update existing player
 * @throws NOT_FOUND if player doesn't exist
 * @throws VALIDATION_ERROR if data invalid
 */
export const updatePlayer = withServerAction(
  async (id: string, data: UpdatePlayerDTO) => {
    const supabase = createServerClient();
    const service = createPlayerService(supabase);
    return await service.update(id, data);
  },
  {
    operation: 'player.update',
    requireAuth: true,
  }
);

/**
 * Delete player (soft delete, sets deleted_at)
 * @throws NOT_FOUND if player doesn't exist
 * @throws FOREIGN_KEY_VIOLATION if player has dependent records
 */
export const deletePlayer = withServerAction(
  async (id: string) => {
    const supabase = createServerClient();
    const service = createPlayerService(supabase);
    return await service.delete(id);
  },
  {
    operation: 'player.delete',
    requireAuth: true,
  }
);

/**
 * Get single player by ID
 * @throws NOT_FOUND if player doesn't exist
 */
export const getPlayer = withServerAction(
  async (id: string) => {
    const supabase = createServerClient();
    const service = createPlayerService(supabase);
    return await service.getById(id);
  },
  {
    operation: 'player.read',
    requireAuth: true,
  }
);

/**
 * Get players with optional filters
 * Supports filtering by casino_id, rating_type, active status
 */
export const getPlayers = withServerAction(
  async (filters?: PlayerFilters) => {
    const supabase = createServerClient();
    const service = createPlayerService(supabase);
    return await service.list(filters);
  },
  {
    operation: 'player.list',
    requireAuth: true,
  }
);

/**
 * Search players by name or player_code
 * Full-text search across multiple fields
 */
export const searchPlayers = withServerAction(
  async (query: string) => {
    const supabase = createServerClient();
    const service = createPlayerService(supabase);
    return await service.search(query);
  },
  {
    operation: 'player.search',
    requireAuth: true,
  }
);
```

**Error Handling Coverage**:
- ✅ VALIDATION_ERROR (23514, 23502) - Invalid data
- ✅ UNIQUE_VIOLATION (23505) - Duplicate player_code
- ✅ FOREIGN_KEY_VIOLATION (23503) - Delete with dependencies
- ✅ NOT_FOUND (PGRST116) - Player doesn't exist
- ✅ INTERNAL_ERROR (500) - Unexpected failures

**Testing Requirements**:
- Unit tests for each action (mock service layer)
- Integration tests with real database
- Error scenario coverage (all 5 error types)
- Performance validation (<500ms per operation)

**Quality Gates** (6):
- [ ] All 6 server actions implemented
- [ ] Each action wrapped with `withServerAction`
- [ ] Error mapping validated for all scenarios
- [ ] TypeScript types match service layer
- [ ] Unit tests passing (>90% coverage)
- [ ] Integration tests with real DB passing

**Reference Files**:
- Week 3 wrapper: `/lib/actions/with-server-action-wrapper.ts`
- Player service: `/services/player/business.ts`
- Service types: `/services/player/types.ts`
- Database types: `/types/database.types.ts`

---

## Wave 2: Query + Mutation Hooks (1.5 hours) - PARALLEL

### Execution Mode
**PARALLEL** - Two independent tasks running concurrently

### Why Parallelization Works Here
1. ✅ Both tasks consume same input (Wave 1 server actions)
2. ✅ No inter-dependencies between query and mutation hooks
3. ✅ Both follow same templates (useServiceQuery, useServiceMutation)
4. ✅ TypeScript Pro can handle both patterns independently
5. ✅ Quality gates can be validated independently

**Time Savings**: 3h sequential → 1.5h parallel = **1.5 hours saved**

---

### Task 2.1: Query Hooks (1.5 hours) - PARALLEL TRACK A

**Agent**: TypeScript Pro #1

**Deliverables**:
1. `hooks/player/use-player.ts` - Single player query
2. `hooks/player/use-players.ts` - List query with filters
3. `hooks/player/use-player-search.ts` - Search query

**Implementation Pattern** (from Week 3 templates):

```typescript
// File: hooks/player/use-player.ts
import { useServiceQuery } from '@/hooks/shared/use-service-query';
import { getPlayer } from '@/app/actions/player-actions';
import type { Player } from '@/services/player/types';

export function usePlayer(id: string | undefined) {
  return useServiceQuery<Player>(
    ['player', 'detail', id] as const,
    () => getPlayer(id!),
    {
      enabled: !!id, // Only run if id exists
      staleTime: 1000 * 60 * 5, // 5 minutes (from ADR-003)
    }
  );
}
```

```typescript
// File: hooks/player/use-players.ts
import { useServiceQuery } from '@/hooks/shared/use-service-query';
import { getPlayers } from '@/app/actions/player-actions';
import type { Player, PlayerFilters } from '@/services/player/types';

export function usePlayers(filters?: PlayerFilters) {
  return useServiceQuery<Player[]>(
    ['player', 'list', filters] as const,
    () => getPlayers(filters),
    {
      staleTime: 1000 * 60 * 2, // 2 minutes for lists (fresher than details)
    }
  );
}
```

```typescript
// File: hooks/player/use-player-search.ts
import { useServiceQuery } from '@/hooks/shared/use-service-query';
import { searchPlayers } from '@/app/actions/player-actions';
import type { Player } from '@/services/player/types';

export function usePlayerSearch(query: string) {
  return useServiceQuery<Player[]>(
    ['player', 'search', query] as const,
    () => searchPlayers(query),
    {
      enabled: query.length >= 2, // Only search with 2+ characters
      staleTime: 1000 * 30, // 30 seconds (search results stale quickly)
    }
  );
}
```

**Query Key Patterns** (from ADR-003):
- Detail: `['player', 'detail', id]`
- List: `['player', 'list', filters]`
- Search: `['player', 'search', query]`

**Quality Gates** (4):
- [ ] All 3 query hooks implemented
- [ ] Query keys follow documented pattern
- [ ] TypeScript inference works correctly
- [ ] Hooks integrate with useServiceQuery template

---

### Task 2.2: Mutation Hooks (1.5 hours) - PARALLEL TRACK B

**Agent**: TypeScript Pro #2

**Deliverables**:
1. `hooks/player/use-create-player.ts` - Create mutation
2. `hooks/player/use-update-player.ts` - Update mutation
3. `hooks/player/use-delete-player.ts` - Delete mutation

**Implementation Pattern** (from Week 3 templates):

```typescript
// File: hooks/player/use-create-player.ts
import { useServiceMutation } from '@/hooks/shared/use-service-mutation';
import { createPlayer } from '@/app/actions/player-actions';
import { useQueryClient } from '@tanstack/react-query';
import type { CreatePlayerDTO, Player } from '@/services/player/types';

export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useServiceMutation<Player, CreatePlayerDTO>(
    (data) => createPlayer(data),
    {
      onSuccess: () => {
        // Strategy 1: Domain-level invalidation (from ADR-003)
        queryClient.invalidateQueries({ queryKey: ['player'] });
      },
    }
  );
}
```

```typescript
// File: hooks/player/use-update-player.ts
import { useServiceMutation } from '@/hooks/shared/use-service-mutation';
import { updatePlayer } from '@/app/actions/player-actions';
import { useQueryClient } from '@tanstack/react-query';
import type { UpdatePlayerDTO, Player } from '@/services/player/types';

export function useUpdatePlayer(playerId: string) {
  const queryClient = useQueryClient();

  return useServiceMutation<Player, UpdatePlayerDTO>(
    (data) => updatePlayer(playerId, data),
    {
      onSuccess: () => {
        // Strategy 2: Granular invalidation (from ADR-003)
        queryClient.invalidateQueries({
          queryKey: ['player', 'detail', playerId]
        });
        // Also invalidate lists to show updated data
        queryClient.invalidateQueries({
          queryKey: ['player', 'list']
        });
      },
    }
  );
}
```

```typescript
// File: hooks/player/use-delete-player.ts
import { useServiceMutation } from '@/hooks/shared/use-service-mutation';
import { deletePlayer } from '@/app/actions/player-actions';
import { useQueryClient } from '@tanstack/react-query';

export function useDeletePlayer(playerId: string) {
  const queryClient = useQueryClient();

  return useServiceMutation<void, void>(
    () => deletePlayer(playerId),
    {
      onSuccess: () => {
        // Strategy 3: Query removal (from ADR-003)
        queryClient.removeQueries({
          queryKey: ['player', 'detail', playerId]
        });
        // Invalidate lists to reflect deletion
        queryClient.invalidateQueries({
          queryKey: ['player', 'list']
        });
      },
    }
  );
}
```

**Cache Invalidation Strategies** (from ADR-003):
- **Create**: Domain-level invalidation (`['player']`)
- **Update**: Granular invalidation (`['player', 'detail', id]` + lists)
- **Delete**: Query removal (`removeQueries`) + list invalidation

**Quality Gates** (4):
- [ ] All 3 mutation hooks implemented
- [ ] Cache invalidation strategies applied correctly
- [ ] TypeScript generics work for variables and data
- [ ] Hooks integrate with useServiceMutation template

---

### Wave 2 Coordination

**Start Condition**: Wave 1 complete, all server actions tested and validated

**Parallel Execution**:
1. Launch TypeScript Pro Agent #1 (Query Hooks)
2. Launch TypeScript Pro Agent #2 (Mutation Hooks) - SIMULTANEOUSLY
3. Both agents work independently for 1.5 hours
4. Both agents complete at same time

**Completion Validation**:
- [ ] All 6 hooks implemented (3 query + 3 mutation)
- [ ] Both agents report success
- [ ] Quality gates validated independently
- [ ] No merge conflicts (different files)

**Next Wave Trigger**: Both tracks complete + all 8 quality gates passed

---

## Wave 3: UI Components (6 hours) - SEQUENTIAL

### Execution Mode
**Sequential** - Components have interdependencies, must be cohesive

### Agent Assignment
**Full-Stack Developer** - Expert in React, UI/UX, component integration

### Why NOT Parallelized
❌ Components share state management patterns
❌ Design consistency requires single agent
❌ Form/List integration needs coordination
❌ Dialog components depend on List/Detail context
✅ Risk of rework > time savings

### Task 3.1: Player UI Components (6 hours)

**Duration**: 6 hours

**Deliverables**:
1. `app/players/player-list.tsx` - List view with search/filter
2. `app/players/player-form.tsx` - Create/edit form
3. `app/players/player-detail.tsx` - Detail view
4. `app/players/player-delete-dialog.tsx` - Delete confirmation

**Component Specifications**:

#### 1. PlayerList Component (2 hours)

```typescript
// File: app/players/player-list.tsx
'use client';

import { useState } from 'react';
import { usePlayers } from '@/hooks/player/use-players';
import { usePlayerSearch } from '@/hooks/player/use-player-search';
import type { PlayerFilters } from '@/services/player/types';

export function PlayerList() {
  const [filters, setFilters] = useState<PlayerFilters>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Use search when query exists, otherwise use filtered list
  const { data: players, isLoading, error } = searchQuery.length >= 2
    ? usePlayerSearch(searchQuery)
    : usePlayers(filters);

  return (
    <div>
      {/* Search input */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search players..."
      />

      {/* Filters */}
      <div>
        {/* Casino filter, rating type filter, active status toggle */}
      </div>

      {/* Loading/Error states */}
      {isLoading && <div>Loading players...</div>}
      {error && <div>Error: {error.message}</div>}

      {/* Player table */}
      <table>
        <thead>
          <tr>
            <th>Player Code</th>
            <th>Name</th>
            <th>Rating</th>
            <th>Casino</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {players?.map((player) => (
            <tr key={player.id}>
              <td>{player.player_code}</td>
              <td>{player.first_name} {player.last_name}</td>
              <td>{player.current_rating}</td>
              <td>{player.casino_id}</td>
              <td>
                <button onClick={() => handleView(player.id)}>View</button>
                <button onClick={() => handleEdit(player.id)}>Edit</button>
                <button onClick={() => handleDelete(player.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Features**:
- Real-time search with debouncing (300ms)
- Filter by casino, rating type, active status
- Pagination support (20 per page)
- Loading states and error handling
- Action buttons (view, edit, delete)

---

#### 2. PlayerForm Component (2 hours)

```typescript
// File: app/players/player-form.tsx
'use client';

import { useForm } from 'react-hook-form';
import { useCreatePlayer } from '@/hooks/player/use-create-player';
import { useUpdatePlayer } from '@/hooks/player/use-update-player';
import type { CreatePlayerDTO, Player } from '@/services/player/types';

interface PlayerFormProps {
  player?: Player; // If editing
  onSuccess?: () => void;
}

export function PlayerForm({ player, onSuccess }: PlayerFormProps) {
  const isEditing = !!player;
  const { mutate: createPlayer, isPending: isCreating } = useCreatePlayer();
  const { mutate: updatePlayer, isPending: isUpdating } = useUpdatePlayer(player?.id!);

  const { register, handleSubmit, formState: { errors } } = useForm<CreatePlayerDTO>({
    defaultValues: player ? {
      player_code: player.player_code,
      first_name: player.first_name,
      last_name: player.last_name,
      // ... other fields
    } : {},
  });

  const onSubmit = (data: CreatePlayerDTO) => {
    if (isEditing) {
      updatePlayer(data, {
        onSuccess: () => {
          onSuccess?.();
          // Show success toast
        },
        onError: (error) => {
          // Show error toast with error.message
        },
      });
    } else {
      createPlayer(data, {
        onSuccess: () => {
          onSuccess?.();
          // Show success toast
        },
        onError: (error) => {
          // Show error toast
        },
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label>Player Code</label>
        <input {...register('player_code', { required: true })} />
        {errors.player_code && <span>Player code required</span>}
      </div>

      <div>
        <label>First Name</label>
        <input {...register('first_name', { required: true })} />
        {errors.first_name && <span>First name required</span>}
      </div>

      <div>
        <label>Last Name</label>
        <input {...register('last_name', { required: true })} />
        {errors.last_name && <span>Last name required</span>}
      </div>

      {/* Additional fields: casino_id, initial_rating, rating_type, etc. */}

      <button type="submit" disabled={isCreating || isUpdating}>
        {isEditing ? 'Update Player' : 'Create Player'}
      </button>
    </form>
  );
}
```

**Features**:
- Form validation with react-hook-form
- Create and edit modes
- Error handling with user-friendly messages
- Loading states during submission
- Success/error toast notifications

---

#### 3. PlayerDetail Component (1 hour)

```typescript
// File: app/players/player-detail.tsx
'use client';

import { usePlayer } from '@/hooks/player/use-player';

interface PlayerDetailProps {
  playerId: string;
}

export function PlayerDetail({ playerId }: PlayerDetailProps) {
  const { data: player, isLoading, error } = usePlayer(playerId);

  if (isLoading) return <div>Loading player details...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!player) return <div>Player not found</div>;

  return (
    <div>
      <h2>{player.first_name} {player.last_name}</h2>

      <dl>
        <dt>Player Code</dt>
        <dd>{player.player_code}</dd>

        <dt>Current Rating</dt>
        <dd>{player.current_rating}</dd>

        <dt>Rating Type</dt>
        <dd>{player.rating_type}</dd>

        <dt>Casino</dt>
        <dd>{player.casino_id}</dd>

        <dt>Total Visits</dt>
        <dd>{player.total_visits || 0}</dd>

        <dt>Active</dt>
        <dd>{player.deleted_at ? 'Inactive' : 'Active'}</dd>

        <dt>Created</dt>
        <dd>{new Date(player.created_at).toLocaleDateString()}</dd>
      </dl>

      <div>
        <button onClick={() => handleEdit(player.id)}>Edit</button>
        <button onClick={() => handleDelete(player.id)}>Delete</button>
      </div>
    </div>
  );
}
```

**Features**:
- Display all player information
- Loading and error states
- Action buttons (edit, delete)
- Formatted dates and status

---

#### 4. PlayerDeleteDialog Component (1 hour)

```typescript
// File: app/players/player-delete-dialog.tsx
'use client';

import { useDeletePlayer } from '@/hooks/player/use-delete-player';
import type { Player } from '@/services/player/types';

interface PlayerDeleteDialogProps {
  player: Player;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PlayerDeleteDialog({
  player,
  isOpen,
  onClose,
  onSuccess
}: PlayerDeleteDialogProps) {
  const { mutate: deletePlayer, isPending } = useDeletePlayer(player.id);

  const handleDelete = () => {
    deletePlayer(undefined, {
      onSuccess: () => {
        onClose();
        onSuccess?.();
        // Show success toast
      },
      onError: (error) => {
        // Show error toast
        // If FK violation, explain that player has related records
      },
    });
  };

  if (!isOpen) return null;

  return (
    <div role="dialog">
      <h3>Delete Player</h3>
      <p>
        Are you sure you want to delete <strong>{player.first_name} {player.last_name}</strong>?
      </p>
      <p>This action cannot be undone.</p>

      <div>
        <button onClick={onClose} disabled={isPending}>
          Cancel
        </button>
        <button onClick={handleDelete} disabled={isPending}>
          {isPending ? 'Deleting...' : 'Delete Player'}
        </button>
      </div>
    </div>
  );
}
```

**Features**:
- Confirmation dialog with player name
- Loading state during deletion
- Error handling (especially FK violations)
- Accessible dialog markup

---

### Wave 3 Quality Gates (8):
- [ ] All 4 components implemented
- [ ] Components integrate with hooks correctly
- [ ] Loading and error states handled
- [ ] Form validation working
- [ ] Search and filter functionality working
- [ ] UI/UX consistent across components
- [ ] Accessibility standards met (ARIA labels, keyboard nav)
- [ ] No TypeScript compilation errors

**Design Standards**:
- Follow existing PT-2 design patterns
- Use Tailwind CSS for styling
- Implement responsive layouts
- Ensure accessibility (WCAG 2.1 Level AA)

---

## Wave 4: E2E Tests (4 hours) - SEQUENTIAL

### Execution Mode
**Sequential** - Validates complete stack, requires all previous waves

### Agent Assignment
**Full-Stack Developer** - Can write comprehensive E2E tests

### Task 4.1: E2E Test Suite (4 hours)

**Duration**: 4 hours

**Deliverables**:
1. `__tests__/e2e/player-management.test.ts` - Complete CRUD workflow tests

**Test Coverage Requirements**:

```typescript
// File: __tests__/e2e/player-management.test.ts
import { test, expect } from '@playwright/test';

describe('Player Management E2E', () => {
  let createdPlayerId: string;

  test.beforeEach(async ({ page }) => {
    // Navigate to players page
    await page.goto('/players');
    // Ensure authenticated (mock or test user)
  });

  describe('Create Player Workflow', () => {
    test('should create a new player successfully', async ({ page }) => {
      // Click create button
      await page.click('[data-testid="create-player-btn"]');

      // Fill form
      await page.fill('[name="player_code"]', 'TEST-001');
      await page.fill('[name="first_name"]', 'John');
      await page.fill('[name="last_name"]', 'Doe');
      await page.selectOption('[name="rating_type"]', 'internal');

      // Submit
      await page.click('[type="submit"]');

      // Verify success
      await expect(page.locator('text=Player created')).toBeVisible();

      // Verify in list
      await expect(page.locator('text=TEST-001')).toBeVisible();
    });

    test('should show validation errors for invalid data', async ({ page }) => {
      await page.click('[data-testid="create-player-btn"]');
      await page.click('[type="submit"]'); // Submit empty form

      await expect(page.locator('text=Player code required')).toBeVisible();
      await expect(page.locator('text=First name required')).toBeVisible();
    });

    test('should handle duplicate player code error', async ({ page }) => {
      // Create first player
      await createTestPlayer(page, 'DUP-001');

      // Try to create duplicate
      await createTestPlayer(page, 'DUP-001');

      await expect(page.locator('text=Player code already exists')).toBeVisible();
    });
  });

  describe('Read Player Workflow', () => {
    test('should display player list with all players', async ({ page }) => {
      // Verify table is rendered
      await expect(page.locator('table')).toBeVisible();

      // Verify columns
      await expect(page.locator('th:has-text("Player Code")')).toBeVisible();
      await expect(page.locator('th:has-text("Name")')).toBeVisible();
    });

    test('should view player details', async ({ page }) => {
      // Click on player in list
      await page.click('[data-testid="player-TEST-001"]');

      // Verify detail view
      await expect(page.locator('h2:has-text("John Doe")')).toBeVisible();
      await expect(page.locator('text=TEST-001')).toBeVisible();
    });

    test('should search players by name', async ({ page }) => {
      // Type in search
      await page.fill('[data-testid="player-search"]', 'John');

      // Wait for debounce
      await page.waitForTimeout(400);

      // Verify filtered results
      await expect(page.locator('text=John Doe')).toBeVisible();
    });

    test('should filter players by casino', async ({ page }) => {
      // Select casino filter
      await page.selectOption('[data-testid="casino-filter"]', 'casino-123');

      // Verify filtered results
      const rows = await page.locator('tbody tr').count();
      expect(rows).toBeGreaterThan(0);
    });
  });

  describe('Update Player Workflow', () => {
    test('should update player successfully', async ({ page }) => {
      // Click edit button
      await page.click('[data-testid="edit-player-TEST-001"]');

      // Update field
      await page.fill('[name="first_name"]', 'Jane');
      await page.click('[type="submit"]');

      // Verify success
      await expect(page.locator('text=Player updated')).toBeVisible();

      // Verify in detail view
      await expect(page.locator('text=Jane Doe')).toBeVisible();
    });

    test('should handle validation errors on update', async ({ page }) => {
      await page.click('[data-testid="edit-player-TEST-001"]');
      await page.fill('[name="first_name"]', '');
      await page.click('[type="submit"]');

      await expect(page.locator('text=First name required')).toBeVisible();
    });
  });

  describe('Delete Player Workflow', () => {
    test('should delete player successfully', async ({ page }) => {
      // Click delete button
      await page.click('[data-testid="delete-player-TEST-001"]');

      // Confirm in dialog
      await expect(page.locator('text=Are you sure')).toBeVisible();
      await page.click('[data-testid="confirm-delete"]');

      // Verify success
      await expect(page.locator('text=Player deleted')).toBeVisible();

      // Verify removed from list
      await expect(page.locator('text=TEST-001')).not.toBeVisible();
    });

    test('should cancel deletion', async ({ page }) => {
      await page.click('[data-testid="delete-player-TEST-001"]');
      await page.click('[data-testid="cancel-delete"]');

      // Verify still in list
      await expect(page.locator('text=TEST-001')).toBeVisible();
    });

    test('should handle FK violation error', async ({ page }) => {
      // Create player with related records (visit, rating slip)
      await createPlayerWithVisit(page, 'FK-TEST');

      // Try to delete
      await page.click('[data-testid="delete-player-FK-TEST"]');
      await page.click('[data-testid="confirm-delete"]');

      // Verify error message
      await expect(page.locator('text=Cannot delete player with related records')).toBeVisible();
    });
  });

  describe('Complete CRUD Workflow', () => {
    test('should complete full player lifecycle', async ({ page }) => {
      // 1. Create
      await createTestPlayer(page, 'LIFECYCLE-001');
      await expect(page.locator('text=Player created')).toBeVisible();

      // 2. Read
      await page.click('[data-testid="player-LIFECYCLE-001"]');
      await expect(page.locator('h2:has-text("John Doe")')).toBeVisible();

      // 3. Update
      await page.click('[data-testid="edit-player"]');
      await page.fill('[name="first_name"]', 'Updated');
      await page.click('[type="submit"]');
      await expect(page.locator('text=Player updated')).toBeVisible();

      // 4. Delete
      await page.click('[data-testid="delete-player"]');
      await page.click('[data-testid="confirm-delete"]');
      await expect(page.locator('text=Player deleted')).toBeVisible();
    });
  });

  describe('Performance Tests', () => {
    test('should load player list within 2 seconds', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/players');
      await page.waitForSelector('table');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(2000);
    });

    test('should search with <500ms response time', async ({ page }) => {
      await page.fill('[data-testid="player-search"]', 'Test');

      const startTime = Date.now();
      await page.waitForTimeout(400); // Debounce
      await page.waitForSelector('tbody tr');
      const searchTime = Date.now() - startTime;

      expect(searchTime).toBeLessThan(500);
    });
  });
});
```

**Test Scenarios**:
1. **Create Workflow** (5 tests)
   - Successful creation
   - Validation errors
   - Duplicate player code
   - Casino assignment
   - Initial rating setup

2. **Read Workflow** (4 tests)
   - List all players
   - View player details
   - Search functionality
   - Filter functionality

3. **Update Workflow** (3 tests)
   - Successful update
   - Validation errors
   - Optimistic UI updates

4. **Delete Workflow** (3 tests)
   - Successful deletion
   - Cancellation
   - FK violation handling

5. **Complete Workflow** (1 test)
   - Full lifecycle (create → read → update → delete)

6. **Performance Tests** (2 tests)
   - List load time <2s
   - Search response <500ms

**Total Tests**: 18 comprehensive E2E tests

### Wave 4 Quality Gates (6):
- [ ] All 18 E2E tests implemented
- [ ] All tests passing consistently
- [ ] Performance benchmarks met
- [ ] Error scenarios validated
- [ ] Accessibility tested (keyboard navigation)
- [ ] No critical bugs identified

---

## 📊 Week 4 Consolidated Metrics

### Time Efficiency
- **Original Sequential Estimate**: 17 hours
- **Optimized with Parallelization**: 15.5 hours
- **Time Saved**: 1.5 hours (9% improvement)
- **Parallelization Point**: Wave 2 (Query + Mutation hooks)

### Deliverables Summary
| Category | Count | Files |
|----------|-------|-------|
| Server Actions | 6 | 1 file (player-actions.ts) |
| Query Hooks | 3 | 3 files (use-player, use-players, use-player-search) |
| Mutation Hooks | 3 | 3 files (use-create, use-update, use-delete) |
| UI Components | 4 | 4 files (list, form, detail, dialog) |
| E2E Tests | 18 | 1 file (player-management.test.ts) |
| **Total** | **34 items** | **12 files** |

### Quality Metrics
- **Quality Gates**: 28 total (6 + 8 + 8 + 6)
- **Test Coverage Target**: >90%
- **Performance Targets**:
  - Server actions: <500ms
  - List load: <2s
  - Search response: <500ms
- **Accessibility**: WCAG 2.1 Level AA compliance

### Code Metrics (Estimated)
- **Server Actions**: ~250 lines
- **Hooks**: ~450 lines (6 hooks × ~75 lines)
- **Components**: ~800 lines (4 components × ~200 lines)
- **Tests**: ~600 lines
- **Total Code**: ~2,100 lines

---

## 🎯 Success Criteria

### Functional Requirements ✅
- [ ] Users can create new players
- [ ] Users can view player list
- [ ] Users can search players by name/code
- [ ] Users can filter players by casino/rating
- [ ] Users can view player details
- [ ] Users can update player information
- [ ] Users can delete players
- [ ] All CRUD operations validated end-to-end

### Technical Requirements ✅
- [ ] Complete vertical stack: DB → Service → Action → Hook → UI
- [ ] All server actions wrapped with `withServerAction`
- [ ] All hooks use templates from Week 3
- [ ] Query keys follow ADR-003 patterns
- [ ] Cache invalidation strategies applied correctly
- [ ] Error handling comprehensive (all 5 error types)
- [ ] TypeScript type safety maintained throughout
- [ ] No compilation errors

### Quality Requirements ✅
- [ ] >90% test coverage
- [ ] All 28 quality gates passed
- [ ] 18 E2E tests passing
- [ ] Performance targets met
- [ ] Accessibility standards met
- [ ] No critical bugs

### Documentation Requirements ✅
- [ ] Wave signoff document created
- [ ] Component usage documented
- [ ] Hook patterns validated
- [ ] Lessons learned captured

---

## 🚧 Potential Challenges & Mitigations

### Challenge 1: Form Validation Complexity
**Risk**: Player form has many fields, validation can be complex
**Mitigation**: Use react-hook-form with Zod schema validation, reuse DTOs from service layer

### Challenge 2: Search Performance
**Risk**: Search across large player datasets may be slow
**Mitigation**: Implement debouncing (300ms), use database indexes, consider full-text search

### Challenge 3: Cache Invalidation Edge Cases
**Risk**: Complex invalidation scenarios (e.g., update affecting multiple views)
**Mitigation**: Follow ADR-003 patterns strictly, test invalidation in E2E tests

### Challenge 4: FK Violation Error Messages
**Risk**: Generic error messages for FK violations confuse users
**Mitigation**: Parse error codes, provide user-friendly messages like "Cannot delete player with active visits"

### Challenge 5: Component Interdependencies
**Risk**: Components tightly coupled, hard to test in isolation
**Mitigation**: Use composition patterns, pass callbacks as props, mock hooks in unit tests

---

## 🔄 Inter-Wave Dependencies

```
Wave 1: Server Actions
    ↓
    └─→ Outputs: 6 server actions (createPlayer, updatePlayer, etc.)
        ↓
Wave 2: Hooks (PARALLEL)
    ├─→ Track A: Query Hooks (consumes: getPlayer, getPlayers, searchPlayers)
    └─→ Track B: Mutation Hooks (consumes: createPlayer, updatePlayer, deletePlayer)
        ↓
        └─→ Outputs: 6 hooks (3 query + 3 mutation)
            ↓
Wave 3: UI Components
    ↓
    └─→ Consumes: All 6 hooks from Wave 2
    └─→ Outputs: 4 React components
        ↓
Wave 4: E2E Tests
    ↓
    └─→ Validates: Complete stack (Waves 1-3)
    └─→ Outputs: 18 E2E tests, signoff document
```

**Critical Path**: Wave 1 → Wave 2 (parallel) → Wave 3 → Wave 4
**No Parallelization**: Waves 1, 3, 4 (must be sequential)
**Parallelization**: Wave 2 only (query + mutation hooks)

---

## 📋 Agent Execution Instructions

### For Backend Architect (Wave 1)
1. Read `/lib/actions/with-server-action-wrapper.ts` for wrapper pattern
2. Read `/services/player/business.ts` for service interface
3. Read `/services/player/types.ts` for DTOs
4. Implement all 6 server actions in `app/actions/player-actions.ts`
5. Write unit tests with mocked service layer
6. Write integration tests with real database
7. Validate all 6 quality gates
8. Create Wave 1 signoff document

### For TypeScript Pro #1 (Wave 2 Track A - Query Hooks)
1. Read `/hooks/shared/use-service-query.ts` for template
2. Read `/docs/adr/ADR-003-state-management-strategy.md` for query key patterns
3. Read `app/actions/player-actions.ts` for server actions (from Wave 1)
4. Implement 3 query hooks (use-player, use-players, use-player-search)
5. Follow query key patterns: `['player', 'detail', id]`, etc.
6. Validate TypeScript inference
7. Validate all 4 quality gates
8. Report completion

### For TypeScript Pro #2 (Wave 2 Track B - Mutation Hooks)
1. Read `/hooks/shared/use-service-mutation.ts` for template
2. Read `/docs/adr/ADR-003-state-management-strategy.md` for invalidation strategies
3. Read `app/actions/player-actions.ts` for server actions (from Wave 1)
4. Implement 3 mutation hooks (use-create, use-update, use-delete)
5. Apply cache invalidation strategies correctly
6. Validate TypeScript generics
7. Validate all 4 quality gates
8. Report completion

### For Full-Stack Developer (Wave 3)
1. Read all 6 hooks from Wave 2
2. Read PT-2 design patterns and Tailwind configuration
3. Implement 4 UI components in sequence:
   - PlayerList (2h)
   - PlayerForm (2h)
   - PlayerDetail (1h)
   - PlayerDeleteDialog (1h)
4. Ensure components integrate with hooks correctly
5. Implement loading/error states
6. Ensure accessibility standards
7. Validate all 8 quality gates
8. Create Wave 3 signoff

### For Full-Stack Developer (Wave 4)
1. Read all components from Wave 3
2. Set up Playwright test environment
3. Implement 18 E2E tests covering:
   - Create workflows (5 tests)
   - Read workflows (4 tests)
   - Update workflows (3 tests)
   - Delete workflows (3 tests)
   - Complete workflow (1 test)
   - Performance tests (2 tests)
4. Ensure all tests pass consistently
5. Validate performance benchmarks
6. Validate all 6 quality gates
7. Create Wave 4 signoff and Week 4 completion document

---

## 📚 Reference Documentation

### Week 3 Infrastructure (Prerequisites)
- [ADR-003: State Management Strategy](../adr/ADR-003-state-management-strategy.md)
- [Hook Templates README](../../hooks/shared/README.md)
- [React Query Setup](./REACT_QUERY_SETUP.md)
- [Server Action Wrapper](../../lib/actions/with-server-action-wrapper.ts)
- [Week 3 Completion Signoff](./WEEK_3_COMPLETION_SIGNOFF.md)

### Service Layer
- [Player Service](../../services/player/business.ts)
- [Player Types](../../services/player/types.ts)
- [Service Template](../patterns/SERVICE_TEMPLATE_QUICK.md)

### Architecture Standards
- [Balanced Architecture Quick](../patterns/BALANCED_ARCHITECTURE_QUICK.md)
- [Service Responsibility Matrix](../patterns/SERVICE_RESPONSIBILITY_MATRIX.md)
- [MVP Production Roadmap](../roadmap/MVP_PRODUCTION_ROADMAP.md)

---

## 🎓 Lessons from Week 3 Applied to Week 4

### What Worked in Week 3 ✅
1. **Wave-based execution** - Clear structure, easy to track progress
2. **Parallel tasks in Wave 1** - Saved 6 hours, no conflicts
3. **Quality gates** - Caught issues early, prevented downstream problems
4. **Evidence-based decisions** - Real data led to better ADR-003
5. **Comprehensive documentation** - 729-line README prevented confusion

### Applied to Week 4 ✅
1. **Continue wave structure** - 4 waves with clear boundaries
2. **Parallel Wave 2** - Query + mutation hooks, saves 1.5 hours
3. **28 quality gates** - Comprehensive validation throughout
4. **E2E validation** - Prove complete stack works before signoff
5. **Detailed workflow docs** - This document provides clear guidance

### Week 3 Challenges Addressed ✅
1. **DTO mismatches** - Now have validated Player service, types correct
2. **Enum values** - Database schema known, no surprises
3. **Error code variance** - Wrapper handles all 6 error codes
4. **FK references** - Integration tests validated all relationships

---

## ✅ Pre-Flight Checklist

Before starting Week 4, verify:

### Infrastructure Ready
- [ ] React Query configured (`lib/query-client.ts` exists)
- [ ] Server action wrapper tested (`lib/actions/with-server-action-wrapper.ts`)
- [ ] Hook templates available (`hooks/shared/use-service-query.ts`, `use-service-mutation.ts`)
- [ ] Player service validated (integration tests passed in Week 3)
- [ ] Database types up to date (`types/database.types.ts`)

### Documentation Ready
- [ ] ADR-003 finalized and ACCEPTED
- [ ] Hook README with 30 query key patterns
- [ ] Week 3 completion signoff approved
- [ ] This workflow document reviewed

### Environment Ready
- [ ] Development environment configured
- [ ] Database accessible (local or staging)
- [ ] Test data available
- [ ] Playwright installed for E2E tests

### Team Ready
- [ ] Backend Architect available (Wave 1)
- [ ] TypeScript Pro agents available (Wave 2)
- [ ] Full-Stack Developer available (Waves 3-4)
- [ ] Quality gates understood by all agents

---

## 📊 Progress Tracking

### Wave Completion Checklist
- [ ] **Wave 1 Complete**: Server actions implemented, tested, quality gates passed
- [ ] **Wave 2 Complete**: All 6 hooks implemented, both parallel tracks done, quality gates passed
- [ ] **Wave 3 Complete**: All 4 components implemented, integrated, quality gates passed
- [ ] **Wave 4 Complete**: All 18 E2E tests passing, performance validated, quality gates passed

### Signoff Documents to Create
- [ ] `WAVE_1_SIGNOFF.md` - Server actions signoff
- [ ] `WAVE_2_SIGNOFF.md` - Hooks signoff (parallel tracks)
- [ ] `WAVE_3_SIGNOFF.md` - UI components signoff
- [ ] `WAVE_4_SIGNOFF.md` - E2E tests signoff
- [ ] `WEEK_4_COMPLETION_SIGNOFF.md` - Full week summary

---

## 🚀 Next Steps After Week 4

Upon successful Week 4 completion:

### Immediate (Day 1 of Week 5)
1. Review Week 4 lessons learned
2. Update patterns based on Week 4 experience
3. Begin Week 5: Visit Tracking Feature (VERTICAL slice)
4. Apply same wave structure with improvements

### Week 5 Preview
**Deliverable**: Visit Tracking Feature
- Wave 1: Visit server actions (startVisit, endVisit, cancelVisit)
- Wave 2: Visit hooks (parallel - queries + mutations)
- Wave 3: Visit UI components (visit-form, visit-list, visit-status)
- Wave 4: E2E tests (visit lifecycle)

**Estimated Duration**: 16 hours (similar to Week 4)

---

## 🔗 Quick Links

### Implementation Files
- Server Actions: `app/actions/player-actions.ts`
- Query Hooks: `hooks/player/use-player*.ts`
- Mutation Hooks: `hooks/player/use-*-player.ts`
- Components: `app/players/*.tsx`
- E2E Tests: `__tests__/e2e/player-management.test.ts`

### Documentation
- This Workflow: `docs/phase-3/WEEK_4_DETAILED_WORKFLOW.md`
- ADR-003: `docs/adr/ADR-003-state-management-strategy.md`
- Hook README: `hooks/shared/README.md`
- Week 3 Signoff: `docs/phase-3/WEEK_3_COMPLETION_SIGNOFF.md`

### Support
- Slack: `#phase-3-implementation`
- Issues: GitHub Issues with `phase-3` label
- Questions: Reference this workflow document first

---

**Document Status**: Final
**Created**: 2025-10-12
**Version**: 1.0
**Next Review**: After Wave 2 completion (check parallelization effectiveness)

---

## 🎯 TL;DR - Week 4 Execution Summary

1. **Wave 1** (4h): Backend Architect implements 6 player server actions
2. **Wave 2** (1.5h): **PARALLEL** - 2 TypeScript Pro agents build query + mutation hooks
3. **Wave 3** (6h): Full-Stack Developer creates 4 UI components
4. **Wave 4** (4h): Full-Stack Developer writes 18 E2E tests

**Total**: 15.5 hours | **Savings**: 1.5 hours via parallelization | **Quality Gates**: 28 | **Deliverables**: 12 files

**Success**: Complete player CRUD functionality, >90% test coverage, all quality gates passed

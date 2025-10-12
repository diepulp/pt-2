# Phase 5: Visit Tracking Feature - Complete Implementation Workflow

**Status**: READY FOR EXECUTION
**Based On**: Phase 4 Success Pattern (22/22 tests passing, 100% quality gates)
**Estimated Duration**: 11-15 hours total
**Parallel Delegation**: ✅ ENABLED (Wave 2 + Wave 3 optimization)

---

## Executive Summary

Phase 5 implements the **Visit Tracking Feature** - a critical vertical slice for casino player visit management. This workflow follows the proven Phase 4 pattern with enhanced parallel delegation for maximum efficiency.

**Key Success Metrics from Phase 4**:
- ✅ 22/22 tests passing (100%)
- ✅ 28/28 quality gates passed
- ✅ ~2 hour execution time (aggressive parallel delegation)
- ✅ Zero rework needed

---

## Prerequisites Verification

### ✅ Database Schema (VERIFIED)

**Visit Table Structure**:
```sql
visit {
  id: uuid (PK)
  player_id: uuid (FK → player.id)
  casino_id: uuid (FK → casino.id)
  check_in_date: timestamptz
  check_out_date: timestamptz | null
  status: VisitStatus (ONGOING | COMPLETED | CANCELED)
  mode: VisitMode (RATED | UNRATED)
}
```

**Enums Available**:
- `VisitStatus`: ONGOING, COMPLETED, CANCELED
- `VisitMode`: RATED, UNRATED

### ✅ Service Layer (VERIFIED)

**Location**: [services/visit/](../../services/visit/)

**Existing Methods**:
- `create(data: VisitCreateDTO)` → ServiceResult<VisitDTO>
- `getById(id: string)` → ServiceResult<VisitDTO>
- `update(id: string, data: VisitUpdateDTO)` → ServiceResult<VisitDTO>

**Missing Methods (TO ADD)**:
- `delete(id: string)` → ServiceResult<void>
- `list(filters?: VisitFilters)` → ServiceResult<VisitDTO[]>
- `search(query: string)` → ServiceResult<VisitDTO[]>

### ✅ Infrastructure (VERIFIED)

- **Server Action Wrapper**: [lib/server-actions/with-server-action-wrapper.ts](../../lib/server-actions/with-server-action-wrapper.ts)
- **Hook Templates**: [hooks/shared/](../../hooks/shared/)
- **Query Template**: `use-service-query.ts`
- **Mutation Template**: `use-service-mutation.ts`
- **Database Types**: [types/database.types.ts](../../types/database.types.ts)

---

## Wave Structure with Parallel Delegation

### Wave 1: Service Layer Extensions (1h)
**Agent**: Backend Architect
**Execution**: Sequential (prerequisite for all other waves)

### Wave 2: Server Actions + Query Hooks (2.5h)
**Parallel Tracks**:
- **Track A**: Server Actions (Backend Architect) - 1.5h
- **Track B**: Query Hooks (TypeScript Pro) - 1h

**Dependency**: Track B waits for Track A server action signatures

### Wave 3: Mutation Hooks + UI Components (5h)
**Parallel Tracks**:
- **Track A**: Mutation Hooks (TypeScript Pro) - 1.5h
- **Track B**: UI Components (Full-Stack Developer) - 3.5h

**Dependency**: Track B can start with mock data, integrate Track A later

### Wave 4: E2E Tests (2.5h)
**Agent**: Full-Stack Developer
**Execution**: Sequential (requires all components complete)

---

## Wave 1: Service Layer Extensions

**Duration**: 1 hour
**Agent**: Backend Architect
**Mode**: Sequential (blocks Wave 2)

### Objective
Extend visit service with missing CRUD methods to match Phase 4 player service completeness.

### Deliverables

#### 1. Update [services/visit/crud.ts](../../services/visit/crud.ts)

**Add Methods**:

```typescript
// Delete visit by ID
delete: async (id: string): Promise<ServiceResult<void>> => {
  return executeOperation<void>("delete_visit", async () => {
    const { error } = await supabase
      .from("visit")
      .delete()
      .eq("id", id);

    if (error) {
      // Check for FK violation (related records exist)
      if (error.code === "23503") {
        throw {
          code: "FOREIGN_KEY_VIOLATION",
          message: "Cannot delete visit with related records (rating slips, rewards, etc.)",
          details: error,
        };
      }
      throw error;
    }
  });
}

// List all visits with optional filters
export interface VisitFilters {
  playerId?: string;
  casinoId?: string;
  status?: Database["public"]["Enums"]["VisitStatus"];
  mode?: Database["public"]["Enums"]["VisitMode"];
}

list: async (filters?: VisitFilters): Promise<ServiceResult<VisitDTO[]>> => {
  return executeOperation<VisitDTO[]>("list_visits", async () => {
    let query = supabase
      .from("visit")
      .select("id, player_id, casino_id, check_in_date, check_out_date, mode, status")
      .order("check_in_date", { ascending: false });

    // Apply filters
    if (filters?.playerId) query = query.eq("player_id", filters.playerId);
    if (filters?.casinoId) query = query.eq("casino_id", filters.casinoId);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.mode) query = query.eq("mode", filters.mode);

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  });
}

// Search visits by player info (requires join)
search: async (query: string): Promise<ServiceResult<VisitDTO[]>> => {
  return executeOperation<VisitDTO[]>("search_visits", async () => {
    const { data, error } = await supabase
      .from("visit")
      .select(`
        id,
        player_id,
        casino_id,
        check_in_date,
        check_out_date,
        mode,
        status,
        player:player_id (firstName, lastName, email)
      `)
      .or(`player.firstName.ilike.%${query}%,player.lastName.ilike.%${query}%,player.email.ilike.%${query}%`)
      .order("check_in_date", { ascending: false });

    if (error) throw error;
    return data || [];
  });
}
```

#### 2. Update [services/visit/index.ts](../../services/visit/index.ts)

**Update Interface**:

```typescript
export interface VisitService {
  create(data: VisitCreateDTO): Promise<ServiceResult<VisitDTO>>;
  getById(id: string): Promise<ServiceResult<VisitDTO>>;
  update(id: string, data: VisitUpdateDTO): Promise<ServiceResult<VisitDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  list(filters?: VisitFilters): Promise<ServiceResult<VisitDTO[]>>;
  search(query: string): Promise<ServiceResult<VisitDTO[]>>;
}
```

**Export new types**:
```typescript
export type { VisitFilters };
```

### Quality Gates (6)
- [ ] All methods properly typed with explicit interfaces
- [ ] Error handling for FK violations, NOT_FOUND
- [ ] executeOperation wrapper used consistently
- [ ] SupabaseClient<Database> typing enforced
- [ ] JSDoc comments on all public methods
- [ ] No `ReturnType` inference used

### Validation Commands
```bash
# Type check
npx tsc --noEmit

# Service tests (if exist)
npm test -- services/visit
```

---

## Wave 2: Parallel Track - Server Actions + Query Hooks

**Duration**: 2.5 hours (1.5h + 1h overlapping)
**Parallel Execution**: Track A → Track B (Track B starts after 30min of Track A)

### Track A: Server Actions (1.5h)

**Agent**: Backend Architect
**File**: [app/actions/visit-actions.ts](../../app/actions/visit-actions.ts)

#### Deliverables

Create 6 server actions following Phase 4 pattern:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { createVisitService } from "@/services/visit";
import { withServerActionWrapper } from "@/lib/server-actions/with-server-action-wrapper";
import type { VisitCreateDTO, VisitUpdateDTO, VisitFilters } from "@/services/visit";

/**
 * Create a new visit
 * @param data - Visit creation data
 * @returns ServiceResult<VisitDTO>
 */
export async function createVisit(data: VisitCreateDTO) {
  return withServerActionWrapper("createVisit", async () => {
    const supabase = await createClient();
    const service = createVisitService(supabase);
    return service.create(data);
  });
}

/**
 * Update an existing visit
 * @param id - Visit ID
 * @param data - Visit update data
 * @returns ServiceResult<VisitDTO>
 */
export async function updateVisit(id: string, data: VisitUpdateDTO) {
  return withServerActionWrapper("updateVisit", async () => {
    const supabase = await createClient();
    const service = createVisitService(supabase);
    return service.update(id, data);
  });
}

/**
 * Delete a visit by ID
 * @param id - Visit ID
 * @returns ServiceResult<void>
 */
export async function deleteVisit(id: string) {
  return withServerActionWrapper("deleteVisit", async () => {
    const supabase = await createClient();
    const service = createVisitService(supabase);
    return service.delete(id);
  });
}

/**
 * Get a single visit by ID
 * @param id - Visit ID
 * @returns ServiceResult<VisitDTO>
 */
export async function getVisit(id: string) {
  return withServerActionWrapper("getVisit", async () => {
    const supabase = await createClient();
    const service = createVisitService(supabase);
    return service.getById(id);
  });
}

/**
 * List visits with optional filters
 * @param filters - Optional filter criteria
 * @returns ServiceResult<VisitDTO[]>
 */
export async function getVisits(filters?: VisitFilters) {
  return withServerActionWrapper("getVisits", async () => {
    const supabase = await createClient();
    const service = createVisitService(supabase);
    return service.list(filters);
  });
}

/**
 * Search visits by player information
 * @param query - Search query string
 * @returns ServiceResult<VisitDTO[]>
 */
export async function searchVisits(query: string) {
  return withServerActionWrapper("searchVisits", async () => {
    const supabase = await createClient();
    const service = createVisitService(supabase);
    return service.search(query);
  });
}
```

#### Quality Gates (6)
- [ ] All actions use withServerActionWrapper
- [ ] Comprehensive JSDoc on all functions
- [ ] Proper error handling via wrapper
- [ ] Type-safe service integration
- [ ] No business logic in actions (delegation only)
- [ ] Consistent naming: createX, updateX, deleteX, getX, getXs, searchXs

### Track B: Query Hooks (1h)

**Agent**: TypeScript Pro
**Location**: [hooks/visit/](../../hooks/visit/)

**Dependency**: Needs server action signatures from Track A (30min delay)

#### Deliverables

Create 3 query hooks following ADR-003 patterns:

##### 1. [hooks/visit/use-visit.ts](../../hooks/visit/use-visit.ts)

```typescript
"use client";

import { useServiceQuery } from "../shared/use-service-query";
import { getVisit } from "@/app/actions/visit-actions";

/**
 * Query hook for fetching a single visit by ID
 * @param visitId - Visit UUID
 * @returns React Query result with visit data
 */
export function useVisit(visitId: string | undefined) {
  return useServiceQuery({
    queryKey: ["visit", "detail", visitId],
    queryFn: () => getVisit(visitId!),
    enabled: !!visitId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

##### 2. [hooks/visit/use-visits.ts](../../hooks/visit/use-visits.ts)

```typescript
"use client";

import { useServiceQuery } from "../shared/use-service-query";
import { getVisits } from "@/app/actions/visit-actions";
import type { VisitFilters } from "@/services/visit";

/**
 * Query hook for fetching all visits with optional filters
 * @param filters - Optional filter criteria
 * @returns React Query result with visits array
 */
export function useVisits(filters?: VisitFilters) {
  return useServiceQuery({
    queryKey: ["visit", "list", filters],
    queryFn: () => getVisits(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
```

##### 3. [hooks/visit/use-visit-search.ts](../../hooks/visit/use-visit-search.ts)

```typescript
"use client";

import { useServiceQuery } from "../shared/use-service-query";
import { searchVisits } from "@/app/actions/visit-actions";

/**
 * Query hook for searching visits by player information
 * @param query - Search query string
 * @returns React Query result with matching visits
 */
export function useVisitSearch(query: string) {
  return useServiceQuery({
    queryKey: ["visit", "search", query],
    queryFn: () => searchVisits(query),
    enabled: query.length >= 2, // Only search for 2+ characters
    staleTime: 30 * 1000, // 30 seconds
  });
}
```

#### Quality Gates (4)
- [ ] All hooks use useServiceQuery template
- [ ] Query keys follow hierarchical pattern: ['visit', 'type', ...params]
- [ ] Appropriate staleTime for each use case
- [ ] Enabled conditions prevent unnecessary fetches

---

## Wave 3: Parallel Track - Mutation Hooks + UI Components

**Duration**: 5 hours (1.5h + 3.5h overlapping)
**Parallel Execution**: Track A + Track B can start simultaneously

### Track A: Mutation Hooks (1.5h)

**Agent**: TypeScript Pro
**Location**: [hooks/visit/](../../hooks/visit/)

#### Deliverables

Create 3 mutation hooks following ADR-003 cache invalidation strategies:

##### 1. [hooks/visit/use-create-visit.ts](../../hooks/visit/use-create-visit.ts)

**Strategy**: Domain-level invalidation

```typescript
"use client";

import { useServiceMutation } from "../shared/use-service-mutation";
import { createVisit } from "@/app/actions/visit-actions";
import type { VisitCreateDTO } from "@/services/visit";

/**
 * Mutation hook for creating a new visit
 * @returns React Query mutation with create functionality
 */
export function useCreateVisit() {
  return useServiceMutation({
    mutationFn: (data: VisitCreateDTO) => createVisit(data),
    invalidateKeys: [["visit"]], // Invalidate all visit queries
    successMessage: "Visit created successfully",
  });
}
```

##### 2. [hooks/visit/use-update-visit.ts](../../hooks/visit/use-update-visit.ts)

**Strategy**: Granular invalidation

```typescript
"use client";

import { useServiceMutation } from "../shared/use-service-mutation";
import { updateVisit } from "@/app/actions/visit-actions";
import type { VisitUpdateDTO } from "@/services/visit";

/**
 * Mutation hook for updating an existing visit
 * @param visitId - Visit ID to update
 * @returns React Query mutation with update functionality
 */
export function useUpdateVisit(visitId: string) {
  return useServiceMutation({
    mutationFn: (data: VisitUpdateDTO) => updateVisit(visitId, data),
    invalidateKeys: [
      ["visit", "detail", visitId], // Specific visit
      ["visit", "list"], // All list queries
      ["visit", "search"], // All search queries
    ],
    successMessage: "Visit updated successfully",
  });
}
```

##### 3. [hooks/visit/use-delete-visit.ts](../../hooks/visit/use-delete-visit.ts)

**Strategy**: Query removal

```typescript
"use client";

import { useServiceMutation } from "../shared/use-service-mutation";
import { deleteVisit } from "@/app/actions/visit-actions";

/**
 * Mutation hook for deleting a visit
 * @param visitId - Visit ID to delete
 * @returns React Query mutation with delete functionality
 */
export function useDeleteVisit(visitId: string) {
  return useServiceMutation({
    mutationFn: () => deleteVisit(visitId),
    invalidateKeys: [
      ["visit", "list"], // All list queries
      ["visit", "search"], // All search queries
    ],
    removeKeys: [["visit", "detail", visitId]], // Remove from cache
    successMessage: "Visit deleted successfully",
  });
}
```

#### Quality Gates (4)
- [ ] All hooks use useServiceMutation template
- [ ] Proper invalidation strategies (domain/granular/removal)
- [ ] Success messages provided
- [ ] TypeScript inference working correctly

### Track B: UI Components (3.5h)

**Agent**: Full-Stack Developer
**Location**: [app/visits/](../../app/visits/)

**Parallel Execution**: Can start immediately with mock data, integrate hooks later

#### Deliverables

Create 4 React components following Phase 4 patterns:

##### 1. [app/visits/visit-list.tsx](../../app/visits/visit-list.tsx)

**Features**:
- Table display with all visits
- Status badges (ONGOING=green, COMPLETED=blue, CANCELED=red)
- Mode badges (RATED=gold, UNRATED=gray)
- Filter dropdowns (status, mode)
- Real-time search with 300ms debounce
- Automatic hook switching (useVisits ↔ useVisitSearch)
- Loading/error/empty states
- Action buttons: View, Edit, Delete
- Results count display

**Hooks Used**: `useVisits(filters)`, `useVisitSearch(query)`

**Structure**:
```typescript
"use client";

import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/shared/use-debounce";
import { useVisits } from "@/hooks/visit/use-visits";
import { useVisitSearch } from "@/hooks/visit/use-visit-search";
import type { VisitFilters } from "@/services/visit";

export function VisitList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<VisitFilters>({});
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Smart hook switching
  const shouldSearch = debouncedQuery.length >= 2;
  const listQuery = useVisits(filters);
  const searchQuery = useVisitSearch(debouncedQuery);

  const { data, isLoading, error } = shouldSearch ? searchQuery : listQuery;

  // Component implementation...
}
```

##### 2. [app/visits/visit-form.tsx](../../app/visits/visit-form.tsx)

**Features**:
- Dual mode: Create new OR Edit existing (based on `visitId` prop)
- react-hook-form integration
- Required fields: playerId, casinoId, checkInDate
- Optional: checkOutDate, status, mode
- Player selector (dropdown or autocomplete)
- Casino selector (dropdown)
- Date/time pickers
- `isDirty` tracking - disable submit if no changes in edit mode
- Success/error message display
- Form reset after successful submission
- Loading state while fetching visit data (edit mode)
- Cancel button support

**Hooks Used**: `useCreateVisit()`, `useUpdateVisit(visitId)`, `useVisit(visitId)`

##### 3. [app/visits/visit-detail.tsx](../../app/visits/visit-detail.tsx)

**Features**:
- Display all visit information
- Player info section (with link to player detail)
- Casino info section
- Visit timeline (check-in, check-out, duration)
- Status and mode badges
- Related records section (rating slips, rewards)
- Loading/error/not-found states
- Action buttons: Edit, Delete, End Visit
- Back to List navigation

**Hooks Used**: `useVisit(visitId)`

##### 4. [app/visits/visit-delete-dialog.tsx](../../app/visits/visit-delete-dialog.tsx)

**Features**:
- Radix UI AlertDialog component
- Confirmation message with visit details
- Loading state during deletion (spinner)
- Special error handling for FK violations ("Cannot delete visit with related records")
- Accessible markup (role, aria-describedby, aria-label)
- Auto-close on success
- Smooth animations

**Hooks Used**: `useDeleteVisit(visitId)`

**Technology Stack**:
- React 19 + TypeScript
- Tailwind CSS (utility-first styling)
- react-hook-form (form validation)
- Radix UI (AlertDialog primitive)
- shadcn/ui components (Button, Input, Label, Card, Select, Badge)

#### Quality Gates (8)
- [ ] All components fully typed with TypeScript
- [ ] Proper loading/error/empty states
- [ ] Responsive Tailwind styling
- [ ] WCAG 2.1 AA accessibility compliance
- [ ] react-hook-form validation working
- [ ] Hook integration correct (no prop drilling)
- [ ] No console errors in browser
- [ ] Components render without TypeScript errors

---

## Wave 4: E2E Tests

**Duration**: 2.5 hours
**Agent**: Full-Stack Developer
**Location**: [__tests__/e2e/](../../__tests__/e2e/)

**Dependency**: All previous waves must be complete

### Deliverables

#### 1. [__tests__/e2e/visit-management-integration.test.ts](../../__tests__/e2e/visit-management-integration.test.ts)

**Test Suites** (minimum 20 tests):

```typescript
describe("Visit Management - Integration Tests", () => {
  describe("Create Workflow", () => {
    it("should create a new visit successfully", async () => {});
    it("should validate required fields", async () => {});
    it("should handle player not found error", async () => {});
    it("should handle casino not found error", async () => {});
    it("should default to ONGOING status and UNRATED mode", async () => {});
  });

  describe("Read Workflow", () => {
    it("should fetch visit by ID", async () => {});
    it("should list all visits ordered by check-in date", async () => {});
    it("should filter visits by status", async () => {});
    it("should filter visits by mode", async () => {});
    it("should filter visits by player", async () => {});
    it("should search visits by player name", async () => {});
    it("should return empty array when no visits found", async () => {});
  });

  describe("Update Workflow", () => {
    it("should update visit status", async () => {});
    it("should update visit mode", async () => {});
    it("should set check-out date (end visit)", async () => {});
    it("should reflect updates in list", async () => {});
  });

  describe("Delete Workflow", () => {
    it("should delete visit successfully", async () => {});
    it("should handle FK violation (related rating slips)", async () => {});
    it("should remove from cache after deletion", async () => {});
  });

  describe("Complete Lifecycle", () => {
    it("should handle full visit lifecycle: create → update → end → delete", async () => {});
  });

  describe("Performance", () => {
    it("should load visit list in < 1 second", async () => {});
    it("should search visits in < 300ms", async () => {});
  });

  describe("Data Validation", () => {
    it("should enforce valid status values", async () => {});
    it("should enforce valid mode values", async () => {});
  });

  describe("Error Handling", () => {
    it("should handle invalid player ID gracefully", async () => {});
    it("should handle invalid casino ID gracefully", async () => {});
  });
});
```

#### 2. [cypress/e2e/visit-management.cy.ts](../../cypress/e2e/visit-management.cy.ts)

**E2E Browser Tests** (minimum 15 tests):

```typescript
describe("Visit Management - E2E", () => {
  beforeEach(() => {
    cy.visit("/visits");
  });

  describe("Visit List", () => {
    it("displays visits in table format", () => {});
    it("filters by status dropdown", () => {});
    it("filters by mode dropdown", () => {});
    it("searches by player name", () => {});
    it("shows correct status badges", () => {});
  });

  describe("Create Visit", () => {
    it("opens create form modal", () => {});
    it("selects player from dropdown", () => {});
    it("selects casino from dropdown", () => {});
    it("validates required fields", () => {});
    it("creates visit and shows in list", () => {});
  });

  describe("Edit Visit", () => {
    it("opens edit form with existing data", () => {});
    it("updates visit status", () => {});
    it("updates visit mode", () => {});
    it("ends visit (sets check-out date)", () => {});
  });

  describe("Delete Visit", () => {
    it("opens confirmation dialog", () => {});
    it("cancels deletion", () => {});
    it("confirms deletion and removes from list", () => {});
  });
});
```

#### 3. [cypress/support/commands.ts](../../cypress/support/commands.ts) (Update)

**Add Custom Commands**:

```typescript
// Create test visit
Cypress.Commands.add("createVisit", (data: {
  playerId: string;
  casinoId: string;
  status?: string;
  mode?: string;
}) => {
  // Implementation
});

// Generate unique test visit data
Cypress.Commands.add("generateTestVisit", () => {
  return {
    playerId: Cypress.env("TEST_PLAYER_ID"),
    casinoId: Cypress.env("TEST_CASINO_ID"),
    checkInDate: new Date().toISOString(),
    status: "ONGOING",
    mode: "UNRATED",
  };
});
```

### Quality Gates (6)
- [ ] All tests passing (20+ Jest, 15+ Cypress)
- [ ] Test coverage > 85% for visit domain
- [ ] Performance benchmarks met (< 1s list, < 300ms search)
- [ ] No flaky tests (3 consecutive runs pass)
- [ ] Test isolation (no cross-test dependencies)
- [ ] Comprehensive error scenario coverage

### Validation Commands
```bash
# Jest integration tests
npm test -- __tests__/e2e/visit-management-integration.test.ts

# Watch mode
npm run test:watch -- __tests__/e2e/visit-management-integration.test.ts

# Coverage
npm run test:coverage

# Cypress (GUI)
npx cypress open
# Select: cypress/e2e/visit-management.cy.ts

# Cypress (headless)
npx cypress run --spec cypress/e2e/visit-management.cy.ts
```

---

## Parallel Delegation Strategy

### Agent Coordination Matrix

| Wave | Track | Agent | Duration | Dependencies | Can Start |
|------|-------|-------|----------|--------------|-----------|
| 1 | - | Backend Architect | 1h | None | Immediately |
| 2A | Server Actions | Backend Architect | 1.5h | Wave 1 | After Wave 1 |
| 2B | Query Hooks | TypeScript Pro | 1h | Wave 2A (30min) | After 30min of Wave 2A |
| 3A | Mutation Hooks | TypeScript Pro | 1.5h | Wave 2A | After Wave 2A |
| 3B | UI Components | Full-Stack Developer | 3.5h | None (mock first) | After Wave 1 |
| 4 | E2E Tests | Full-Stack Developer | 2.5h | All above | After Wave 3 |

### Execution Timeline (Optimized)

```
Hour 0:00 ──┐
            │ Wave 1: Service Extensions (Backend Architect)
Hour 1:00 ──┴──┬─ Wave 2A: Server Actions (Backend Architect)
            │  └─ Wave 3B: UI Components START (Full-Stack, mock data)
Hour 1:30 ──┤  └─ Wave 2B: Query Hooks START (TypeScript Pro)
Hour 2:30 ──┴──┬─ Wave 2A/2B Complete
            │  ├─ Wave 3A: Mutation Hooks (TypeScript Pro)
            │  └─ Wave 3B: Continue UI (integrate hooks)
Hour 4:00 ──┴──┬─ Wave 3A Complete
            │  └─ Wave 3B: Continue UI
Hour 4:30 ──┴──┬─ Wave 3B Complete
            │  └─ Wave 4: E2E Tests (Full-Stack Developer)
Hour 7:00 ──┴─── ALL COMPLETE
```

**Total Elapsed Time**: ~7 hours (vs 11h sequential)
**Efficiency Gain**: 36% time savings

### Communication Protocol

**Wave 2A → Wave 2B Handoff** (30min mark):
```markdown
✅ Server Action Signatures Available:
- createVisit(data: VisitCreateDTO)
- getVisit(id: string)
- getVisits(filters?: VisitFilters)
- searchVisits(query: string)

👉 TypeScript Pro: You may start Wave 2B (Query Hooks)
```

**Wave 2A → Wave 3A Handoff** (completion):
```markdown
✅ All Server Actions Complete:
- CRUD: create, update, delete, get, list, search
- All wrapped with withServerActionWrapper
- Full JSDoc documentation

👉 TypeScript Pro: You may start Wave 3A (Mutation Hooks)
```

**Wave 3A → Wave 3B Integration** (completion):
```markdown
✅ All Mutation Hooks Complete:
- useCreateVisit()
- useUpdateVisit(visitId)
- useDeleteVisit(visitId)

👉 Full-Stack Developer: Integrate real hooks in Wave 3B components
```

---

## Quality Gate Summary

### Total Quality Gates: 28

| Wave | Component | Gates | Checklist |
|------|-----------|-------|-----------|
| 1 | Service Extensions | 6 | Explicit types, error handling, no ReturnType |
| 2A | Server Actions | 6 | Wrapper usage, JSDoc, error handling |
| 2B | Query Hooks | 4 | Template usage, query keys, staleTime |
| 3A | Mutation Hooks | 4 | Template usage, invalidation strategies |
| 3B | UI Components | 8 | TypeScript, states, styling, accessibility |
| 4 | E2E Tests | 6 | Coverage, performance, no flakiness |

**Success Criteria**: 28/28 gates passed (100%)

---

## Risk Mitigation

### Known Risks from Phase 4

1. **Database Schema Mismatch**
   **Mitigation**: ✅ Schema verified via Supabase MCP (visit table exists, correct structure)

2. **Service Layer Incomplete**
   **Mitigation**: Wave 1 explicitly adds missing methods before any dependent work

3. **Path Misalignment**
   **Mitigation**: All paths verified against actual codebase structure

4. **Test Flakiness**
   **Mitigation**: Use timestamp-based test data, proper cleanup, 3-run verification

### Phase 5 Specific Risks

1. **Player/Casino FK Dependencies**
   **Impact**: Creating visits requires existing players and casinos
   **Mitigation**: Use existing test players/casinos, create fixtures if needed

2. **Visit Status State Machine**
   **Impact**: Invalid state transitions (e.g., CANCELED → ONGOING)
   **Mitigation**: Implement validation in service layer, test all transitions

3. **Related Records Deletion**
   **Impact**: Cannot delete visits with rating slips or rewards
   **Mitigation**: Comprehensive FK violation testing, clear error messages

---

## Success Metrics

### Functional Metrics
- [ ] All 6 server actions working (create, update, delete, get, list, search)
- [ ] All 6 hooks working (3 query + 3 mutation)
- [ ] All 4 UI components rendering without errors
- [ ] 20+ Jest tests passing (100%)
- [ ] 15+ Cypress tests passing (100%)

### Quality Metrics
- [ ] 28/28 quality gates passed
- [ ] Test coverage > 85%
- [ ] Zero TypeScript errors (exclude pre-existing Cypress issues)
- [ ] WCAG 2.1 AA accessibility compliance

### Performance Metrics
- [ ] List load < 1 second
- [ ] Search response < 300ms
- [ ] Create/update/delete < 200ms
- [ ] Test suite execution < 1 second (Jest)

---

## Post-Wave Documentation

### Wave Completion Checklist

After each wave, create signoff document:

```markdown
# Wave X Signoff

**Status**: ✅ COMPLETE
**Duration**: Xh (estimated Yh)
**Quality Gates**: X/X passed

## Deliverables
- [x] File 1 created
- [x] File 2 updated
- [x] Tests passing

## Validation
```bash
# Commands run
npm test -- ...
```

## Issues Encountered
- None / [List any issues and resolutions]

## Next Wave
- Wave X+1 ready to start
```

### Final Phase Completion Report

Create [docs/phase-5/PHASE_5_COMPLETION_REPORT.md](../../docs/phase-5/PHASE_5_COMPLETION_REPORT.md) following Phase 4 template.

---

## Quick Reference Commands

### Development
```bash
npm run dev                          # Start dev server
npm run build                        # Production build
npm run type-check                   # TypeScript validation
```

### Testing
```bash
npm test                             # Run all tests
npm run test:watch                   # Watch mode
npm run test:coverage                # With coverage
npx cypress open                     # Cypress GUI
npx cypress run                      # Cypress headless
```

### Specific Tests
```bash
npm test -- __tests__/e2e/visit-management-integration.test.ts
npx cypress run --spec cypress/e2e/visit-management.cy.ts
```

### Database
```bash
npm run db:types                     # Regenerate database types
```

---

## Appendix: Type Definitions

### VisitDTO
```typescript
interface VisitDTO {
  id: string;
  player_id: string;
  casino_id: string;
  check_in_date: string;
  check_out_date: string | null;
  status: "ONGOING" | "COMPLETED" | "CANCELED";
  mode: "RATED" | "UNRATED";
}
```

### VisitCreateDTO
```typescript
interface VisitCreateDTO {
  playerId: string;
  casinoId: string;
  checkInDate: string;
  mode?: "RATED" | "UNRATED";
  status?: "ONGOING" | "COMPLETED" | "CANCELED";
}
```

### VisitUpdateDTO
```typescript
interface VisitUpdateDTO {
  checkOutDate?: string;
  mode?: "RATED" | "UNRATED";
  status?: "ONGOING" | "COMPLETED" | "CANCELED";
}
```

### VisitFilters
```typescript
interface VisitFilters {
  playerId?: string;
  casinoId?: string;
  status?: "ONGOING" | "COMPLETED" | "CANCELED";
  mode?: "RATED" | "UNRATED";
}
```

---

**END OF WORKFLOW**
**Status**: Ready for execution
**Confidence**: High (based on Phase 4 success)
**Estimated Total Time**: 7 hours (with parallel delegation) | 11-15 hours (sequential)

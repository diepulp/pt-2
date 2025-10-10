# Phase 3 Detailed Execution Workflow
**Sub-Agent Delegation & Parallel Execution Strategy**

**Timeline**: Weeks 3-6 (4 weeks)
**Strategy**: Wave-based execution with intelligent parallelization
**Total Time Savings**: 15 hours (26% improvement over sequential execution)

---

## 📊 Executive Summary

### Time Analysis
- **Week 3 (HORIZONTAL)**: 12 hours (vs 18 sequential) - **33% savings**
- **Weeks 4-6 (VERTICAL)**: 17 hours/feature (vs 20 sequential) - **15% savings per feature**
- **Total Phase 3**: 63 hours (vs 78 sequential) - **15 hours saved**

### Parallelization Strategy
- **Wave 1 Optimization**: 4 independent tasks executed concurrently
- **Wave 2 Optimization**: Query + Mutation hooks developed in parallel
- **MCP Tool Routing**: Intelligent agent selection with specialized MCP servers
- **Quality Gates**: Validation checkpoints prevent downstream issues

---

## 🏗️ Week 3: HORIZONTAL Foundation

### Overview
Build shared state management infrastructure that enables Weeks 4-6 vertical feature delivery.

**Total Time**: 12 hours (vs 18 sequential)
**Parallelization Savings**: 6 hours (33%)

---

### Wave 1: Parallel Infrastructure Setup (4 hours) ⚡

**Execution Mode**: All tasks run concurrently (no dependencies)

---

#### Task 1.1: React Query Setup
**Agent**: Full-Stack Developer
**Duration**: 4 hours
**Priority**: Critical (blocks Wave 2)

**Dependencies**: None

**Deliverables**:
- `lib/query-client.ts` - React Query configuration
- `app/layout.tsx` - QueryClientProvider integration
- DevTools setup for development

**Step-by-Step Execution**:

1. **Fetch React Query Documentation**
   - Tool: `Context7 MCP` → resolve React Query library
   - Query: "React Query v5 setup for Next.js App Router with TypeScript"
   - Extract: Configuration options, provider setup, DevTools integration

2. **Create Query Client Configuration**
   - Tool: `Write`
   - File: `lib/query-client.ts`
   - Content:
   ```typescript
   import { QueryClient } from '@tanstack/react-query'

   export const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 1000 * 60 * 5, // 5 minutes
         refetchOnWindowFocus: false,
         retry: 1,
       },
       mutations: {
         retry: 0,
       },
     },
   })
   ```

3. **Integrate Provider in Root Layout**
   - Tool: `Read` → `app/layout.tsx`
   - Tool: `Edit` → Add QueryClientProvider wrapper
   - Ensure: Client-side rendering with 'use client' directive

4. **Setup React Query DevTools**
   - Tool: `Edit` → `app/layout.tsx`
   - Add: `<ReactQueryDevtools initialIsOpen={false} />`
   - Condition: Only in development mode

5. **Install Dependencies (if needed)**
   - Tool: `Bash` → `npm install @tanstack/react-query @tanstack/react-query-devtools`
   - Verify: package.json updated

6. **Test Configuration**
   - Tool: `Bash` → `npm run dev`
   - Verify: No console errors, DevTools accessible
   - Test: Create simple query to validate setup

**Quality Gates**:
- ✅ React Query provider renders without errors
- ✅ DevTools visible at `http://localhost:3000` (dev mode)
- ✅ queryClient accessible in components
- ✅ TypeScript compilation successful

**MCP Tool Chain**:
```
Context7 → Read → Write → Edit → Bash
```

---

#### Task 1.2: Server Action Wrapper
**Agent**: Backend Architect
**Duration**: 3 hours
**Priority**: High

**Dependencies**: None

**Deliverables**:
- `lib/actions/with-server-action-wrapper.ts` - Standardized wrapper
- Error mapping for common DB errors
- Audit logging integration

**Step-by-Step Execution**:

1. **Analyze Existing Error Patterns**
   - Tool: `Sequential MCP` → Analyze service error handling
   - Target: Review all 7 Phase 2 services
   - Extract: Common error types (FK violations, validation, NOT_FOUND)

2. **Design Wrapper Signature**
   - Tool: `Sequential MCP` → Design pattern analysis
   - Decision: Async function wrapper returning Result<T>
   - Consider: User context, action name, error handling

3. **Create Wrapper Implementation**
   - Tool: `Write`
   - File: `lib/actions/with-server-action-wrapper.ts`
   - Content:
   ```typescript
   import { Result } from '@/types/result'

   export async function withServerAction<T>(
     action: () => Promise<Result<T>>,
     context: {
       action: string
       userId?: string
       metadata?: Record<string, unknown>
     }
   ): Promise<Result<T>> {
     try {
       const result = await action()

       // Audit logging for production
       if (process.env.NODE_ENV === 'production') {
         // Log to audit_log table
       }

       return result
     } catch (error) {
       // Error mapping
       if (error.code === '23503') {
         return { success: false, error: 'FOREIGN_KEY_VIOLATION' }
       }
       if (error.code === '23505') {
         return { success: false, error: 'UNIQUE_VIOLATION' }
       }

       return { success: false, error: 'INTERNAL_ERROR' }
     }
   }
   ```

4. **Implement Error Mapping**
   - Tool: `Edit` → Add comprehensive error code mapping
   - Cover: PostgreSQL error codes (23XXX family)
   - Map: DB errors to user-friendly messages

5. **Add Audit Logging**
   - Tool: `Supabase MCP` → Review audit_log table schema
   - Tool: `Edit` → Implement logging for production
   - Include: userId, action, timestamp, metadata

6. **Test with Sample Service**
   - Tool: `Read` → Casino or Player service
   - Tool: `Supabase MCP` → execute_sql for test queries
   - Test: CRUD operations with wrapper
   - Verify: Error mapping works correctly

**Quality Gates**:
- ✅ Wrapper tested with ≥1 service
- ✅ Error mapping covers FK, unique, validation errors
- ✅ Audit logs written to audit_log table
- ✅ TypeScript types correct (Result<T>)

**MCP Tool Chain**:
```
Sequential → Read → Write → Edit → Supabase
```

---

#### Task 1.3: Zustand UI Stores
**Agent**: Full-Stack Developer
**Duration**: 2 hours
**Priority**: Medium

**Dependencies**: None

**Deliverables**:
- `store/ui-store.ts` - Global UI state
- `store/player-store.ts` - Player-specific UI state
- Documentation of state boundaries

**Step-by-Step Execution**:

1. **Fetch Zustand Best Practices**
   - Tool: `Context7 MCP` → resolve Zustand library
   - Query: "Zustand best practices for Next.js with TypeScript"
   - Extract: Store creation patterns, TypeScript types, selectors

2. **Create Global UI Store**
   - Tool: `Write`
   - File: `store/ui-store.ts`
   - Content:
   ```typescript
   import { create } from 'zustand'

   interface UIStore {
     // Modal state
     isModalOpen: boolean
     modalType: 'create' | 'edit' | 'delete' | null
     modalData: unknown

     // Navigation state
     sidebarOpen: boolean

     // Actions
     openModal: (type: UIStore['modalType'], data?: unknown) => void
     closeModal: () => void
     toggleSidebar: () => void
   }

   export const useUIStore = create<UIStore>((set) => ({
     isModalOpen: false,
     modalType: null,
     modalData: null,
     sidebarOpen: true,

     openModal: (type, data) =>
       set({ isModalOpen: true, modalType: type, modalData: data }),
     closeModal: () =>
       set({ isModalOpen: false, modalType: null, modalData: null }),
     toggleSidebar: () =>
       set((state) => ({ sidebarOpen: !state.sidebarOpen })),
   }))
   ```

3. **Create Player UI Store**
   - Tool: `Write`
   - File: `store/player-store.ts`
   - Content:
   ```typescript
   import { create } from 'zustand'

   interface PlayerStore {
     // Filter state (ephemeral UI only)
     searchQuery: string
     statusFilter: 'all' | 'active' | 'inactive'
     sortBy: 'name' | 'createdAt' | 'lastVisit'

     // Actions
     setSearchQuery: (query: string) => void
     setStatusFilter: (filter: PlayerStore['statusFilter']) => void
     setSortBy: (sortBy: PlayerStore['sortBy']) => void
     resetFilters: () => void
   }

   export const usePlayerStore = create<PlayerStore>((set) => ({
     searchQuery: '',
     statusFilter: 'all',
     sortBy: 'name',

     setSearchQuery: (query) => set({ searchQuery: query }),
     setStatusFilter: (filter) => set({ statusFilter: filter }),
     setSortBy: (sortBy) => set({ sortBy }),
     resetFilters: () =>
       set({ searchQuery: '', statusFilter: 'all', sortBy: 'name' }),
   }))
   ```

4. **Document State Boundaries**
   - Tool: `Write`
   - File: `store/README.md`
   - Content:
   ```markdown
   # Zustand Store Guidelines

   ## Scope: Ephemeral UI State ONLY

   **What Goes in Zustand:**
   - ✅ Modal open/close state
   - ✅ Navigation state (sidebar, tabs)
   - ✅ UI filters (search, sort, pagination UI state)
   - ✅ Form state (multi-step forms)

   **What Does NOT Go in Zustand:**
   - ❌ Server data (players, visits, rating slips)
   - ❌ Fetched data (use React Query)
   - ❌ Persistent state (use database)
   - ❌ User session (use Next.js auth)

   ## Rule: React Query owns ALL server state
   ```

5. **Install Zustand (if needed)**
   - Tool: `Bash` → `npm install zustand`
   - Verify: package.json updated

6. **Test Store Functionality**
   - Tool: `Write` → Create test component
   - Test: Modal open/close, sidebar toggle
   - Verify: State updates correctly

**Quality Gates**:
- ✅ UI stores handle modal, navigation, filter state
- ✅ No server data in Zustand (documented boundary)
- ✅ Stores typed with TypeScript interfaces
- ✅ README.md documents usage guidelines

**MCP Tool Chain**:
```
Context7 → Write → Bash
```

---

#### Task 1.4: ADR-003 Draft
**Agent**: System Architect
**Duration**: 1 hour
**Priority**: Medium

**Dependencies**: None (finalized in Wave 4)

**Deliverables**:
- `docs/adr/ADR-003-state-management-strategy.md` (draft)

**Step-by-Step Execution**:

1. **Create ADR Template**
   - Tool: `Write`
   - File: `docs/adr/ADR-003-state-management-strategy.md`
   - Include: Title, Status, Context, Decision, Consequences sections

2. **Document Initial Decisions**
   - React Query defaults (TBD after testing)
   - Query key pattern (draft: `[domain, entity, id?]`)
   - Invalidation strategy (TBD after implementation)
   - Zustand scope (defined: ephemeral UI only)

3. **Mark as Draft**
   - Status: DRAFT
   - Note: Finalize after Week 3 infrastructure tested

**Quality Gates**:
- ✅ ADR-003 draft created with template
- ✅ Key decision areas identified
- ✅ Marked as DRAFT for finalization

**MCP Tool Chain**:
```
Write
```

---

### Wave 1 Completion Criteria

**All tasks in Wave 1 can run concurrently (4 hours total)**

✅ React Query provider configured (longest task - 4h)
✅ Server action wrapper implemented (completes in 3h)
✅ Zustand stores created (completes in 2h)
✅ ADR-003 draft initiated (completes in 1h)

**Blocking Dependency for Wave 2**: React Query setup must complete

---

### Wave 2: Hook Templates (3 hours)

**Execution Mode**: Sequential (depends on Wave 1 React Query completion)

---

#### Task 2.1: Create Service Query Hook Template
**Agent**: TypeScript Pro
**Duration**: 1.5 hours
**Priority**: Critical (blocks Weeks 4-6)

**Dependencies**:
- ✅ React Query setup complete (Wave 1)

**Deliverables**:
- `hooks/shared/use-service-query.ts`
- Generic Result<T> to React Query mapping

**Step-by-Step Execution**:

1. **Analyze Result<T> Pattern**
   - Tool: `Sequential MCP` → Analyze service Result<T> pattern
   - Tool: `Read` → Review Phase 2 service implementations
   - Extract: Success/error structure, data types

2. **Fetch React Query TypeScript Patterns**
   - Tool: `Context7 MCP` → React Query TypeScript documentation
   - Query: "useQuery with generic types and error handling"
   - Extract: Type-safe hook patterns

3. **Create Service Query Template**
   - Tool: `Write`
   - File: `hooks/shared/use-service-query.ts`
   - Content:
   ```typescript
   import { useQuery, UseQueryOptions } from '@tanstack/react-query'
   import { Result } from '@/types/result'

   export function useServiceQuery<T>(
     queryKey: string[],
     queryFn: () => Promise<Result<T>>,
     options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
   ) {
     return useQuery({
       queryKey,
       queryFn: async () => {
         const result = await queryFn()

         if (!result.success) {
           throw new Error(result.error)
         }

         return result.data
       },
       ...options,
     })
   }
   ```

4. **Document Query Key Pattern**
   - Tool: `Write`
   - File: `hooks/shared/README.md`
   - Document: `[domain, entity, id?]` pattern
   - Examples:
     - `['player', 'list']` - all players
     - `['player', 'detail', playerId]` - single player
     - `['player', 'search', searchQuery]` - search results

5. **Create Example Usage**
   - Tool: `Edit` → `hooks/shared/README.md`
   - Add example:
   ```typescript
   const { data: player, isLoading } = useServiceQuery(
     ['player', 'detail', playerId],
     () => getPlayerAction(playerId)
   )
   ```

**Quality Gates**:
- ✅ Template handles Result<T> to React Query mapping
- ✅ TypeScript generics work correctly
- ✅ Query key pattern documented with examples

**MCP Tool Chain**:
```
Sequential → Context7 → Read → Write → Edit
```

---

#### Task 2.2: Create Service Mutation Hook Template
**Agent**: TypeScript Pro
**Duration**: 1.5 hours
**Priority**: Critical (blocks Weeks 4-6)

**Dependencies**:
- ✅ React Query setup complete (Wave 1)

**Deliverables**:
- `hooks/shared/use-service-mutation.ts`
- Cache invalidation pattern

**Step-by-Step Execution**:

1. **Fetch React Query Mutation Patterns**
   - Tool: `Context7 MCP` → React Query mutation documentation
   - Query: "useMutation with TypeScript and cache invalidation"
   - Extract: Mutation patterns, onSuccess callbacks, invalidation

2. **Create Service Mutation Template**
   - Tool: `Write`
   - File: `hooks/shared/use-service-mutation.ts`
   - Content:
   ```typescript
   import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query'
   import { Result } from '@/types/result'

   export function useServiceMutation<TData, TVariables>(
     mutationFn: (variables: TVariables) => Promise<Result<TData>>,
     options?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>
   ) {
     const queryClient = useQueryClient()

     return useMutation({
       mutationFn: async (variables: TVariables) => {
         const result = await mutationFn(variables)

         if (!result.success) {
           throw new Error(result.error)
         }

         return result.data
       },
       ...options,
     })
   }
   ```

3. **Document Invalidation Strategy**
   - Tool: `Edit` → `hooks/shared/README.md`
   - Add section: Cache Invalidation
   - Pattern: `queryClient.invalidateQueries({ queryKey: [domain] })`
   - Example:
   ```typescript
   const createPlayer = useServiceMutation(
     createPlayerAction,
     {
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['player'] })
       }
     }
   )
   ```

4. **Add Optimistic Update Example**
   - Tool: `Edit` → `hooks/shared/README.md`
   - Add: Optimistic update pattern (optional)
   - Document: `onMutate`, `onError` rollback pattern

**Quality Gates**:
- ✅ Template handles Result<T> mutations
- ✅ Cache invalidation pattern documented
- ✅ TypeScript generics for variables and data

**MCP Tool Chain**:
```
Context7 → Write → Edit
```

---

### Wave 2 Completion Criteria

✅ Hook templates ready for use
✅ Documentation complete with examples
✅ Query key pattern standardized
✅ Cache invalidation strategy defined

**Blocking Dependency for Wave 3**: All infrastructure components ready

---

### Wave 3: Integration Smoke Tests (4 hours)

**Execution Mode**: Sequential (depends on all Wave 1-2 components)

---

#### Task 3.1: Create Integration Test Suite
**Agent**: Full-Stack Developer
**Duration**: 4 hours
**Priority**: Critical (validates Week 3 success)

**Dependencies**:
- ✅ React Query setup complete
- ✅ Server action wrapper complete
- ✅ Hook templates complete
- ✅ All 7 Phase 2 services available

**Deliverables**:
- `__tests__/integration/services-smoke.test.ts`
- Cross-service workflow validation

**Step-by-Step Execution**:

1. **Review All Service Implementations**
   - Tool: `Read` → `services/casino/*.ts`
   - Tool: `Read` → `services/player/*.ts`
   - Tool: `Read` → `services/visit/*.ts`
   - Tool: `Read` → `services/rating-slip/*.ts`
   - Tool: `Read` → `services/table-context/*.ts`
   - Tool: `Read` → `services/table/*.ts`
   - Tool: `Read` → `services/mtl/*.ts`
   - Extract: CRUD operations per service

2. **Create Test Suite Structure**
   - Tool: `Write`
   - File: `__tests__/integration/services-smoke.test.ts`
   - Setup: Test database, Supabase client, cleanup

3. **Write Individual Service Tests**
   - Test: Basic CRUD for each of 7 services
   - Verify: Create, read, update, delete operations
   - Assert: Result<T> success/error handling

4. **Write Cross-Service Workflow Test**
   - Test: Complete workflow spanning multiple services
   - Example: Create Casino → Create Player → Start Visit → Create RatingSlip
   - Verify: Referential integrity maintained
   - Assert: FK relationships work correctly

5. **Test Error Handling**
   - Test: FK violation (delete referenced entity)
   - Test: Unique violation (duplicate data)
   - Test: NOT_FOUND (invalid ID)
   - Verify: Server action wrapper error mapping works

6. **Run Test Suite**
   - Tool: `Bash` → `npm test __tests__/integration/services-smoke.test.ts`
   - Monitor: Test output, pass/fail status
   - Debug: Any failures with Supabase MCP queries

7. **Document Issues**
   - Tool: `Write` → `docs/phase-3/integration-test-results.md`
   - List: Any failures or concerns
   - Note: Items blocking Week 4 (must fix before proceeding)

**Quality Gates**:
- ✅ All 7 services pass basic CRUD tests
- ✅ Cross-service workflow validated
- ✅ Error handling tested (FK, unique, NOT_FOUND)
- ✅ No critical issues blocking Week 4

**MCP Tool Chain**:
```
Read → Write → Bash → Supabase
```

---

### Wave 3 Completion Criteria

✅ Integration tests passing
✅ Cross-service dependencies validated
✅ Error handling verified
✅ Issues documented (if any)

**Blocking Dependency for Wave 4**: Testing complete, patterns validated

---

### Wave 4: Finalize ADR-003 (1 hour)

**Execution Mode**: Sequential (depends on Wave 1-3 completion)

---

#### Task 4.1: Finalize State Management ADR
**Agent**: System Architect
**Duration**: 1 hour
**Priority**: High

**Dependencies**:
- ✅ React Query tested (Wave 3)
- ✅ Hook templates validated (Wave 3)
- ✅ Patterns proven in integration tests

**Deliverables**:
- `docs/adr/ADR-003-state-management-strategy.md` (final)

**Step-by-Step Execution**:

1. **Review Implementation Results**
   - Tool: `Read` → All Week 3 implementations
   - Tool: `Read` → Integration test results
   - Extract: What worked, what didn't, lessons learned

2. **Finalize Decisions**
   - Tool: `Edit` → `docs/adr/ADR-003-state-management-strategy.md`
   - Update: React Query defaults (actual values used)
   - Update: Query key pattern (validated in tests)
   - Update: Invalidation strategy (tested approach)
   - Confirm: Zustand scope (ephemeral UI only)

3. **Add Examples**
   - Tool: `Edit` → Add code examples from actual implementation
   - Include: Hook template usage
   - Include: Cache invalidation patterns
   - Include: Error handling examples

4. **Mark as Accepted**
   - Tool: `Edit` → Change status from DRAFT to ACCEPTED
   - Add: Acceptance date, decision rationale
   - Note: Any alternatives considered and rejected

5. **Commit ADR**
   - Tool: `Bash` → `git add docs/adr/ADR-003-state-management-strategy.md`
   - Tool: `Bash` → `git commit -m "docs: ADR-003 state management strategy"`

**Quality Gates**:
- ✅ ADR-003 status: ACCEPTED
- ✅ All decisions documented with rationale
- ✅ Examples from actual implementation
- ✅ Committed to repository

**MCP Tool Chain**:
```
Read → Edit → Bash
```

---

### Wave 4 Completion Criteria

✅ ADR-003 finalized and accepted
✅ State management decisions documented
✅ Ready for Weeks 4-6 vertical development

---

## Week 3 Summary

**Total Time**: 12 hours (vs 18 sequential)
**Time Savings**: 6 hours (33%)

**Infrastructure Delivered**:
1. ✅ React Query configured and tested
2. ✅ Server action wrapper implemented
3. ✅ Zustand stores created
4. ✅ Hook templates ready for use
5. ✅ Integration tests passing
6. ✅ ADR-003 finalized

**Ready for Weeks 4-6**: All infrastructure in place for vertical feature delivery

---

## 🎨 Weeks 4-6: VERTICAL Feature Development

### Overview
Each week delivers one complete feature stack (Player, Visit, RatingSlip). The pattern repeats for all 3 features.

**Total Time per Feature**: 17 hours (vs 20 sequential)
**Parallelization Savings**: 3 hours per feature (15%)
**Total Weeks 4-6**: 51 hours (vs 60 sequential) - **9 hours saved**

---

### Feature Development Pattern

```
Week 4: Player Management
Week 5: Visit Tracking
Week 6: RatingSlip Creation
```

All follow the same execution pattern below.

---

### Wave 1: Server Actions (4 hours)

**Execution Mode**: Sequential (must complete before hooks)

---

#### Task 1.1: Implement Server Actions
**Agent**: Backend Architect
**Duration**: 4 hours
**Priority**: Critical (blocks all other waves)

**Dependencies**:
- ✅ Phase 2 service layer for domain
- ✅ Server action wrapper (Week 3)

**Deliverables**:
- `app/actions/{domain}-actions.ts` with all CRUD operations

**Step-by-Step Execution**:

1. **Review Service Layer**
   - Tool: `Read` → `services/{domain}/*.ts`
   - Extract: Available service methods (create, update, delete, get, list, search)
   - Note: Input/output types, error cases

2. **Create Server Actions File**
   - Tool: `Write`
   - File: `app/actions/{domain}-actions.ts`
   - Add: `'use server'` directive at top

3. **Implement Create Action**
   - Tool: `Edit` → Add createEntityAction
   - Pattern:
   ```typescript
   'use server'

   import { withServerAction } from '@/lib/actions/with-server-action-wrapper'
   import { createClient } from '@/lib/supabase/server'
   import { EntityService } from '@/services/{domain}'

   export async function createEntityAction(data: CreateEntityInput) {
     return withServerAction(
       async () => {
         const supabase = await createClient()
         const service = EntityService(supabase)
         return await service.createEntity(data)
       },
       { action: '{domain}.create', userId: session?.user?.id }
     )
   }
   ```

4. **Implement Read Actions**
   - Tool: `Edit` → Add getEntityAction, listEntitiesAction
   - Include: Pagination parameters if applicable
   - Include: Search functionality if applicable

5. **Implement Update Action**
   - Tool: `Edit` → Add updateEntityAction
   - Include: Partial updates if supported

6. **Implement Delete Action**
   - Tool: `Edit` → Add deleteEntityAction
   - Include: Soft delete if applicable

7. **Test Each Action**
   - Tool: `Supabase MCP` → execute_sql for test data setup
   - Tool: `Bash` → Create test script or use Next.js API route testing
   - Verify: Each action works correctly
   - Verify: Error handling via wrapper

8. **Validate Error Mapping**
   - Test: FK violation (if applicable)
   - Test: Unique constraint violation
   - Test: NOT_FOUND case
   - Verify: Correct error messages returned

**Quality Gates**:
- ✅ All CRUD operations functional
- ✅ Server action wrapper used consistently
- ✅ Error handling tested
- ✅ TypeScript compilation successful

**MCP Tool Chain**:
```
Read → Write → Edit → Supabase → Bash
```

---

### Wave 1 Completion Criteria

✅ Server actions implemented and tested
✅ Error handling verified
✅ Ready for hook development

**Blocking Dependency for Wave 2**: Server actions must complete

---

### Wave 2: Query + Mutation Hooks (3 hours) ⚡

**Execution Mode**: Parallel (both depend only on Wave 1)

---

#### Task 2.1: Create Query Hooks
**Agent**: TypeScript Pro
**Duration**: 3 hours
**Priority**: Critical

**Dependencies**:
- ✅ Server actions complete (Wave 1)
- ✅ Hook templates (Week 3)

**Deliverables**:
- `hooks/{domain}/use-{entity}.ts` - Single entity fetch
- `hooks/{domain}/use-{entities}.ts` - List with pagination
- `hooks/{domain}/use-{entity}-search.ts` - Search functionality (if applicable)

**Step-by-Step Execution**:

1. **Fetch React Query Documentation**
   - Tool: `Context7 MCP` → React Query useQuery patterns
   - Query: "useQuery with dependencies and conditional fetching"

2. **Create Single Entity Query Hook**
   - Tool: `Write`
   - File: `hooks/{domain}/use-{entity}.ts`
   - Pattern:
   ```typescript
   import { useServiceQuery } from '@/hooks/shared/use-service-query'
   import { getEntityAction } from '@/app/actions/{domain}-actions'

   export function useEntity(entityId: string) {
     return useServiceQuery(
       ['{domain}', 'detail', entityId],
       () => getEntityAction(entityId),
       {
         enabled: !!entityId, // Only fetch if ID provided
       }
     )
   }
   ```

3. **Create List Query Hook**
   - Tool: `Write`
   - File: `hooks/{domain}/use-{entities}.ts`
   - Include: Pagination parameters
   - Pattern:
   ```typescript
   export function useEntities(params?: ListParams) {
     return useServiceQuery(
       ['{domain}', 'list', params],
       () => listEntitiesAction(params)
     )
   }
   ```

4. **Create Search Query Hook (if applicable)**
   - Tool: `Write`
   - File: `hooks/{domain}/use-{entity}-search.ts`
   - Include: Debouncing for search input
   - Pattern:
   ```typescript
   export function useEntitySearch(searchQuery: string) {
     const debouncedQuery = useDebounce(searchQuery, 300)

     return useServiceQuery(
       ['{domain}', 'search', debouncedQuery],
       () => searchEntitiesAction(debouncedQuery),
       {
         enabled: debouncedQuery.length >= 3,
       }
     )
   }
   ```

5. **Test Hooks with DevTools**
   - Tool: `Bash` → `npm run dev`
   - Create: Test component using hooks
   - Verify: Data fetched correctly
   - Verify: Loading states work
   - Verify: Error states handled
   - Monitor: React Query DevTools for cache behavior

**Quality Gates**:
- ✅ Hooks use standardized query key pattern
- ✅ Loading/error states handled
- ✅ DevTools show correct cache behavior
- ✅ TypeScript types correct

**MCP Tool Chain**:
```
Context7 → Write → Bash
```

---

#### Task 2.2: Create Mutation Hooks
**Agent**: TypeScript Pro
**Duration**: 3 hours (parallel with Task 2.1)
**Priority**: Critical

**Dependencies**:
- ✅ Server actions complete (Wave 1)
- ✅ Hook templates (Week 3)

**Deliverables**:
- `hooks/{domain}/use-create-{entity}.ts`
- `hooks/{domain}/use-update-{entity}.ts`
- `hooks/{domain}/use-delete-{entity}.ts`

**Step-by-Step Execution**:

1. **Fetch React Query Mutation Patterns**
   - Tool: `Context7 MCP` → React Query useMutation documentation
   - Query: "useMutation with optimistic updates and cache invalidation"

2. **Create Create Mutation Hook**
   - Tool: `Write`
   - File: `hooks/{domain}/use-create-{entity}.ts`
   - Pattern:
   ```typescript
   import { useServiceMutation } from '@/hooks/shared/use-service-mutation'
   import { useQueryClient } from '@tanstack/react-query'
   import { createEntityAction } from '@/app/actions/{domain}-actions'

   export function useCreateEntity() {
     const queryClient = useQueryClient()

     return useServiceMutation(
       createEntityAction,
       {
         onSuccess: () => {
           // Invalidate all queries for this domain
           queryClient.invalidateQueries({ queryKey: ['{domain}'] })
         },
       }
     )
   }
   ```

3. **Create Update Mutation Hook**
   - Tool: `Write`
   - File: `hooks/{domain}/use-update-{entity}.ts`
   - Include: Cache invalidation for specific entity
   - Pattern:
   ```typescript
   export function useUpdateEntity() {
     const queryClient = useQueryClient()

     return useServiceMutation(
       updateEntityAction,
       {
         onSuccess: (data, variables) => {
           // Invalidate specific entity
           queryClient.invalidateQueries({
             queryKey: ['{domain}', 'detail', variables.id]
           })
           // Invalidate list
           queryClient.invalidateQueries({
             queryKey: ['{domain}', 'list']
           })
         },
       }
     )
   }
   ```

4. **Create Delete Mutation Hook**
   - Tool: `Write`
   - File: `hooks/{domain}/use-delete-{entity}.ts`
   - Include: Optimistic update (optional)
   - Pattern:
   ```typescript
   export function useDeleteEntity() {
     const queryClient = useQueryClient()

     return useServiceMutation(
       deleteEntityAction,
       {
         onSuccess: (data, entityId) => {
           // Remove from cache
           queryClient.removeQueries({
             queryKey: ['{domain}', 'detail', entityId]
           })
           // Invalidate list
           queryClient.invalidateQueries({
             queryKey: ['{domain}', 'list']
           })
         },
       }
     )
   }
   ```

5. **Test Mutations**
   - Tool: `Bash` → `npm run dev`
   - Create: Test component with mutation hooks
   - Test: Create entity → verify list updates
   - Test: Update entity → verify detail updates
   - Test: Delete entity → verify removal from list
   - Monitor: DevTools for cache invalidation

**Quality Gates**:
- ✅ Mutations trigger cache invalidation
- ✅ Lists update automatically after mutations
- ✅ Error states handled gracefully
- ✅ TypeScript types correct

**MCP Tool Chain**:
```
Context7 → Write → Bash
```

---

### Wave 2 Completion Criteria

**Both tasks complete in parallel (3 hours total)**

✅ Query hooks implemented and tested
✅ Mutation hooks implemented and tested
✅ Cache invalidation working correctly
✅ DevTools confirm correct behavior

**Blocking Dependency for Wave 3**: All hooks ready

---

### Wave 3: UI Components (6 hours)

**Execution Mode**: Sequential (depends on Wave 2 hooks)

---

#### Task 3.1: Implement UI Components
**Agent**: Full-Stack Developer
**Duration**: 6 hours
**Priority**: Critical

**Dependencies**:
- ✅ Query hooks complete (Wave 2)
- ✅ Mutation hooks complete (Wave 2)
- ✅ Zustand stores (Week 3)

**Deliverables**:
- `components/{domain}/{entity}-list.tsx` - Table with search/filter
- `components/{domain}/{entity}-form.tsx` - Create/edit form
- `components/{domain}/{entity}-detail.tsx` - Detail view
- `components/{domain}/{entity}-delete-dialog.tsx` - Confirmation modal

**Step-by-Step Execution**:

1. **Fetch React Component Patterns**
   - Tool: `Context7 MCP` → React/Next.js component best practices
   - Query: "React form patterns with validation, table components"

2. **Generate List Component with Magic MCP**
   - Tool: `Magic MCP` → Generate table component
   - Prompt: "Create a table component for {entity} with search, filter, and sort"
   - Tool: `Write` → `components/{domain}/{entity}-list.tsx`
   - Integrate: useEntities hook, useEntitySearch hook
   - Add: Search input, filters from Zustand store

3. **Refine List Component**
   - Tool: `Edit` → Add pagination
   - Tool: `Edit` → Add sorting controls
   - Tool: `Edit` → Integrate usePlayerStore filters (if applicable)
   - Tool: `Edit` → Add loading skeleton
   - Tool: `Edit` → Add empty state

4. **Generate Form Component with Magic MCP**
   - Tool: `Magic MCP` → Generate form component
   - Prompt: "Create a form for {entity} with validation using react-hook-form"
   - Tool: `Write` → `components/{domain}/{entity}-form.tsx`
   - Integrate: useCreateEntity, useUpdateEntity hooks
   - Add: Form validation, error display

5. **Refine Form Component**
   - Tool: `Edit` → Add client-side validation
   - Tool: `Edit` → Add error handling (display errors from mutations)
   - Tool: `Edit` → Add loading state during submission
   - Tool: `Edit` → Add success feedback (toast or redirect)

6. **Generate Detail Component**
   - Tool: `Magic MCP` → Generate detail view component
   - Prompt: "Create a detail view for {entity} with edit and delete actions"
   - Tool: `Write` → `components/{domain}/{entity}-detail.tsx`
   - Integrate: useEntity hook, useUpdateEntity, useDeleteEntity

7. **Create Delete Confirmation Dialog**
   - Tool: `Write` → `components/{domain}/{entity}-delete-dialog.tsx`
   - Integrate: useUIStore (modal state)
   - Integrate: useDeleteEntity hook
   - Add: Confirmation message, cancel/confirm buttons

8. **Style Components**
   - Tool: `Edit` → Add Tailwind CSS classes
   - Ensure: Consistent with design system
   - Ensure: Responsive design

9. **Test UI Manually**
   - Tool: `Bash` → `npm run dev`
   - Test: List view loads and displays data
   - Test: Search and filter work
   - Test: Create new entity via form
   - Test: Edit existing entity
   - Test: Delete entity with confirmation
   - Test: Error states display correctly
   - Test: Loading states work

10. **Fix Issues**
    - Tool: `Edit` → Address any bugs found
    - Iterate: Until all functionality works

**Quality Gates**:
- ✅ Users can view all entities in table
- ✅ Users can create new entities via form
- ✅ Users can edit existing entities
- ✅ Users can delete entities with confirmation
- ✅ Search and filter working
- ✅ No console errors in browser
- ✅ Responsive design

**MCP Tool Chain**:
```
Context7 → Magic → Write → Edit → Bash
```

---

### Wave 3 Completion Criteria

✅ All UI components functional
✅ CRUD operations working via UI
✅ Manual testing complete
✅ Ready for E2E test automation

**Blocking Dependency for Wave 4**: UI functional

---

### Wave 4: E2E Tests (4 hours)

**Execution Mode**: Sequential (depends on Wave 3 UI)

---

#### Task 4.1: Implement E2E Tests
**Agent**: Full-Stack Developer
**Duration**: 4 hours
**Priority**: Critical

**Dependencies**:
- ✅ UI components complete and functional (Wave 3)

**Deliverables**:
- `e2e/{domain}/{entity}-crud.spec.ts` - Complete CRUD workflow tests
- `e2e/{domain}/{entity}-search.spec.ts` - Search functionality tests (if applicable)

**Step-by-Step Execution**:

1. **Fetch Playwright Best Practices**
   - Tool: `Context7 MCP` → Playwright documentation
   - Query: "Playwright test patterns, page object model, best practices"

2. **Create E2E Test File**
   - Tool: `Write`
   - File: `e2e/{domain}/{entity}-crud.spec.ts`
   - Setup: Test fixtures, page objects

3. **Write Create Workflow Test**
   - Tool: `Edit` → Add test for entity creation
   - Pattern:
   ```typescript
   test('should create new entity', async ({ page }) => {
     await page.goto('/entities')
     await page.click('button:has-text("Create")')

     // Fill form
     await page.fill('[name="field1"]', 'Test Value')
     await page.fill('[name="field2"]', 'Another Value')

     // Submit
     await page.click('button:has-text("Submit")')

     // Verify
     await expect(page.locator('text=Entity created')).toBeVisible()
     await expect(page.locator('text=Test Value')).toBeVisible()
   })
   ```

4. **Write Read/View Workflow Test**
   - Tool: `Edit` → Add test for viewing entity details
   - Test: Click entity in list → detail view opens
   - Verify: All data displayed correctly

5. **Write Update Workflow Test**
   - Tool: `Edit` → Add test for entity update
   - Test: Open entity → click edit → modify fields → save
   - Verify: Updated data reflected in list and detail view

6. **Write Delete Workflow Test**
   - Tool: `Edit` → Add test for entity deletion
   - Test: Open entity → click delete → confirm dialog → entity removed
   - Verify: Entity no longer in list

7. **Write Search/Filter Tests (if applicable)**
   - Tool: `Write` → `e2e/{domain}/{entity}-search.spec.ts`
   - Test: Search functionality returns correct results
   - Test: Filters work as expected

8. **Run E2E Tests**
   - Tool: `Playwright MCP` → Run tests
   - Tool: `Bash` → `npx playwright test e2e/{domain}`
   - Monitor: Test results, pass/fail status
   - Capture: Screenshots on failure

9. **Debug Failures**
   - Tool: `Playwright MCP` → Debug mode for failing tests
   - Tool: `Edit` → Fix flaky tests (add proper waits)
   - Tool: `Edit` → Fix selectors if elements not found

10. **Run Full Suite**
    - Tool: `Bash` → `npx playwright test`
    - Verify: All tests passing
    - Ensure: No flaky tests (run multiple times)

**Quality Gates**:
- ✅ All E2E tests passing
- ✅ Complete CRUD workflow covered
- ✅ No flaky tests
- ✅ Test coverage >90% for critical workflows

**MCP Tool Chain**:
```
Context7 → Write → Edit → Playwright → Bash
```

---

### Wave 4 Completion Criteria

✅ E2E tests passing
✅ Complete feature validated
✅ Ready for production

---

## Feature Development Summary (Per Week)

**Total Time**: 17 hours (vs 20 sequential)
**Time Savings**: 3 hours (15%)

**Feature Delivered**:
1. ✅ Server actions implemented and tested (4h)
2. ✅ Query hooks ready (3h - parallel)
3. ✅ Mutation hooks ready (3h - parallel)
4. ✅ UI components functional (6h)
5. ✅ E2E tests passing (4h)

**Quality Gates Passed**:
- ✅ Complete DB → Service → Action → Hook → UI stack
- ✅ Users can perform all CRUD operations
- ✅ E2E tests passing
- ✅ TypeScript compilation successful
- ✅ RLS policies validated (run security advisor)
- ✅ Performance: <100ms hook execution

---

## 🎯 Phase 3 Complete Summary

### Total Time Investment
- **Week 3 (HORIZONTAL)**: 12 hours (vs 18) - 6 hours saved
- **Week 4 (Player)**: 17 hours (vs 20) - 3 hours saved
- **Week 5 (Visit)**: 17 hours (vs 20) - 3 hours saved
- **Week 6 (RatingSlip)**: 17 hours (vs 20) - 3 hours saved
- **Total**: 63 hours (vs 78) - **15 hours saved (19% improvement)**

### Deliverables
1. ✅ React Query infrastructure with DevTools
2. ✅ Server action wrapper with error mapping
3. ✅ Zustand stores for ephemeral UI state
4. ✅ Reusable hook templates
5. ✅ Integration tests validating all services
6. ✅ ADR-003 documenting state management
7. ✅ Player Management feature (full stack)
8. ✅ Visit Tracking feature (full stack)
9. ✅ RatingSlip Creation feature (full stack)

### Quality Metrics
- ✅ 100% TypeScript compilation success
- ✅ >90% E2E test pass rate
- ✅ <100ms hook execution performance
- ✅ Zero critical security issues (RLS validated)
- ✅ All quality gates passed

---

## 📊 Agent Utilization Matrix

| Agent | Week 3 Tasks | Weeks 4-6 Tasks | Total Hours |
|-------|--------------|-----------------|-------------|
| **Full-Stack Developer** | React Query (4h)<br>Zustand (2h)<br>Integration Tests (4h) | UI Components (18h)<br>E2E Tests (12h) | 40h |
| **Backend Architect** | Server Action Wrapper (3h) | Server Actions (12h) | 15h |
| **TypeScript Pro** | Hook Templates (3h) | Query Hooks (9h)<br>Mutation Hooks (9h) | 21h |
| **System Architect** | ADR-003 Draft (1h)<br>ADR-003 Final (1h) | - | 2h |

**Total Agent Hours**: 78 hours
**Actual Calendar Time**: 63 hours (with parallelization)
**Efficiency Gain**: 19%

---

## 🔧 MCP Tool Usage Breakdown

| MCP Server | Usage Pattern | Task Types |
|------------|---------------|------------|
| **Context7** | 15+ queries | React Query docs, Zustand patterns, React components, Playwright |
| **Sequential** | 3 analyses | Error pattern analysis, design decisions, Result<T> mapping |
| **Magic** | 12 generations | UI component scaffolding (list, form, detail × 3 features) |
| **Playwright** | 3 test suites | E2E test execution and debugging |
| **Supabase** | 10+ queries | Service testing, data setup, audit logging |

---

## ✅ Quality Gate Summary

### Week 3 Gates
- [x] React Query provider configured
- [x] Server action wrapper tested with ≥1 service
- [x] Hook templates documented with examples
- [x] All 7 services pass integration smoke tests
- [x] ADR-003 approved
- [x] DevTools accessible in development

### Per-Feature Gates (Weeks 4-6)
- [x] Complete DB → Service → Action → Hook → UI stack
- [x] Users can perform all CRUD operations via UI
- [x] E2E tests passing for all workflows
- [x] TypeScript compilation successful (zero errors)
- [x] RLS policies validated via security advisor
- [x] Performance targets met (<100ms hook execution)

---

## 🚀 Execution Instructions

### To Execute Week 3:
1. Launch 4 parallel agents for Wave 1 (4 hours)
2. After React Query complete, launch TypeScript Pro for Wave 2 (3 hours)
3. After Wave 2, launch Full-Stack Developer for Wave 3 (4 hours)
4. After Wave 3, launch System Architect for Wave 4 (1 hour)

### To Execute Weeks 4-6 (repeat per feature):
1. Launch Backend Architect for Wave 1 (4 hours)
2. After Wave 1, launch 2 parallel TypeScript Pro agents for Wave 2 (3 hours)
3. After Wave 2, launch Full-Stack Developer for Wave 3 (6 hours)
4. After Wave 3, launch Full-Stack Developer for Wave 4 (4 hours)

---

## 📝 Progress Tracking

### Daily (During Active Development)
- [ ] Update TodoWrite with current task status
- [ ] Run type-check after each layer completion
- [ ] Test new functionality manually in browser

### Weekly (End of Each Week)
- [ ] Update `docs/phase-2/SESSION_HANDOFF.md` with progress
- [ ] Run security advisor and address critical issues
- [ ] Commit changes with HORIZONTAL or VERTICAL label
- [ ] Review metrics and adjust timeline if needed

### End of Phase 3
- [ ] Update `docs/roadmap/MVP_PRODUCTION_ROADMAP.md`
- [ ] Document lessons learned in ADRs
- [ ] Run final E2E test suite
- [ ] Create Phase 4 planning document

---

## 🔗 Reference Materials

- **PHASE_3_WORKFLOW.md** - High-level overview and week-by-week plan
- **BALANCED_ARCHITECTURE_QUICK.md** - HORIZONTAL vs VERTICAL decision making
- **SERVICE_RESPONSIBILITY_MATRIX.md** - Bounded context guidelines
- **ADR-003** - State management strategy (created in Week 3)
- **SESSION_HANDOFF.md** - Progress tracking and status updates

---

**Status**: Ready for execution
**Next Action**: Launch Wave 1 agents for Week 3
**Timeline**: 63 hours across 4 weeks
**Owner**: Development team
**Last Updated**: 2025-10-10

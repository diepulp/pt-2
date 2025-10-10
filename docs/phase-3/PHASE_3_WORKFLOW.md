# Phase 3 Workflow: UI Layer & State Management
**Timeline**: Weeks 3-6 (4 weeks)
**Strategy**: Hybrid Architecture (HORIZONTAL → VERTICAL)
**Status**: Ready for execution

---

## 📋 Phase 3 Overview

Phase 3 delivers the UI layer and completes the full-stack architecture for PT-2 MVP. This phase follows a **hybrid architecture strategy**:

- **Week 3 (HORIZONTAL)**: Build shared state management infrastructure
- **Weeks 4-6 (VERTICAL)**: Deliver complete feature stacks (one domain per week)

**Architecture Decision Reference**: See `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md` for the 4-second rule:
> "1 domain? VERTICAL. ALL domains? HORIZONTAL."

---

## 🎯 Phase 3 Objectives

### Primary Goals
1. ✅ Complete state management foundation (React Query + Zustand)
2. ✅ Deliver 3 vertical feature slices with full UI
3. ✅ Achieve E2E test coverage for all user workflows
4. ✅ Document architectural decisions (ADR-003, ADR-004, ADR-005)

### Success Criteria
- All 3 features fully functional (Player, Visit, RatingSlip)
- Complete DB → Service → Action → Hook → UI → E2E stack per feature
- <100ms hook execution performance
- >90% E2E test pass rate
- Zero TypeScript errors in production build

---

## 🏗️ Architecture Strategy

### Hybrid Model Rationale

**HORIZONTAL (Week 3)**: Infrastructure that serves ALL domains
- React Query configuration (all services share)
- Server action wrapper pattern (all actions use)
- Zustand UI stores (global modal/navigation state)
- Hook templates (all features follow)
- Integration tests (all services validated)

**VERTICAL (Weeks 4-6)**: Complete feature delivery per domain
- Player Management (Week 4): Full stack for Player domain only
- Visit Tracking (Week 5): Full stack for Visit domain only
- RatingSlip Creation (Week 6): Full stack for RatingSlip domain only

**Why This Works:**
- Week 3 enables Week 4-6 (infrastructure → features)
- Week 4-6 ship user value independently (no cross-domain coupling)
- Refactoring happens AFTER delivery (learn patterns first)

---

## 📅 Week 3: HORIZONTAL Foundation

**Deliverable**: State management infrastructure ready for vertical feature delivery

### Tasks Breakdown

#### 1. React Query Setup (4 hours)
**Files**: `lib/query-client.ts`, `app/layout.tsx`

```typescript
// lib/query-client.ts - PT-2 defaults
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
```

**Tasks**:
- [ ] Create `lib/query-client.ts` with PT-2 defaults
- [ ] Add `QueryClientProvider` to root layout
- [ ] Configure React Query DevTools for development
- [ ] Test with simple query to verify setup

**Success Criteria**:
- ✅ React Query provider configured in root layout
- ✅ DevTools accessible at `http://localhost:3000` in dev mode
- ✅ No console errors on app startup

---

#### 2. Server Action Wrapper (3 hours)
**Files**: `lib/actions/with-server-action-wrapper.ts`

```typescript
// Standardized error handling, logging, validation
export async function withServerAction<T>(
  action: () => Promise<T>,
  context: { action: string; userId?: string }
): Promise<Result<T>> {
  // Validation, error mapping, audit logging
}
```

**Tasks**:
- [ ] Create server action wrapper with error handling
- [ ] Implement error mapping (FK violations, validation errors)
- [ ] Add audit logging for production
- [ ] Test with sample service (Casino or Player)

**Success Criteria**:
- ✅ Wrapper tested with at least 1 service
- ✅ Error mapping covers DB errors (FK, unique, NOT_FOUND)
- ✅ Audit logs written to `audit_log` table

---

#### 3. Zustand UI Stores (2 hours)
**Files**: `store/ui-store.ts`, `store/player-store.ts`

```typescript
// Ephemeral UI state ONLY (modals, navigation, filters)
export const useUIStore = create<UIStore>((set) => ({
  isModalOpen: false,
  modalType: null,
  openModal: (type) => set({ isModalOpen: true, modalType: type }),
  closeModal: () => set({ isModalOpen: false, modalType: null }),
}))
```

**Tasks**:
- [ ] Create `store/ui-store.ts` for global UI state
- [ ] Create `store/player-store.ts` for player-specific UI state
- [ ] Document Zustand scope (ephemeral UI only, NOT server data)
- [ ] Test modal open/close workflow

**Success Criteria**:
- ✅ UI stores handle modal, navigation, filter state
- ✅ No server data in Zustand (React Query owns that)
- ✅ Stores documented with usage examples

---

#### 4. Query/Mutation Hook Templates (3 hours)
**Files**: `hooks/shared/use-service-query.ts`, `hooks/shared/use-service-mutation.ts`

```typescript
// Template for all service queries
export function useServiceQuery<T>(
  queryKey: string[],
  queryFn: () => Promise<Result<T>>
) {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const result = await queryFn()
      if (!result.success) throw new Error(result.error)
      return result.data
    },
  })
}
```

**Tasks**:
- [ ] Create `use-service-query.ts` template
- [ ] Create `use-service-mutation.ts` template
- [ ] Document query key pattern: `[domain, entity, id?]`
- [ ] Create example usage in README

**Success Criteria**:
- ✅ Templates handle Result<T> to React Query mapping
- ✅ Query keys follow consistent pattern
- ✅ Documentation includes examples for all 7 services

---

#### 5. Integration Smoke Tests (4 hours)
**Files**: `__tests__/integration/services-smoke.test.ts`

```typescript
// Validate all 7 services work together
describe('Service Integration', () => {
  it('should create player, visit, and rating slip', async () => {
    // Cross-service workflow test
  })
})
```

**Tasks**:
- [ ] Create smoke test suite for all 7 services
- [ ] Test cross-service dependencies (Player → Visit → RatingSlip)
- [ ] Validate referential integrity enforcement
- [ ] Document any integration issues found

**Success Criteria**:
- ✅ All 7 services pass basic CRUD tests
- ✅ Cross-service workflows validated
- ✅ No integration errors blocking Week 4

---

#### 6. ADR-003: State Management Strategy (2 hours)
**Files**: `docs/adr/ADR-003-state-management-strategy.md`

**Decisions to Document**:
- React Query defaults (staleTime, cacheTime, retry)
- Query key pattern: `[domain, entity, id]`
- Invalidation strategy: `invalidateQueries` vs `setQueryData`
- Zustand scope: Ephemeral UI only (modals, navigation, filters)
- Server data ownership: React Query owns all server state

**Tasks**:
- [ ] Draft ADR-003 with decisions above
- [ ] Include examples for each pattern
- [ ] Review with team (if applicable)
- [ ] Finalize and commit

**Success Criteria**:
- ✅ ADR-003 approved and committed
- ✅ All state management decisions documented
- ✅ Examples provided for common scenarios

---

### Week 3 Success Criteria Summary

**Infrastructure Completeness**: 5/5 components delivered
- ✅ React Query provider configured
- ✅ Server action wrapper tested
- ✅ Zustand stores created and documented
- ✅ Hook templates ready for use
- ✅ Integration tests passing

**Quality Gates**:
- ✅ All 7 services pass smoke tests
- ✅ ADR-003 finalized
- ✅ DevTools functional in development
- ✅ No TypeScript errors
- ✅ Documentation complete

**Time Estimate**: 18-20 hours (4-5 days at 4 hours/day)

---

## 🎨 Week 4: Player Management (VERTICAL)

**Deliverable**: Complete Player Management feature with full UI

### Feature Stack Layers

#### Layer 1: Server Actions (4 hours)
**Files**: `app/actions/player-actions.ts`

```typescript
'use server'
export async function createPlayerAction(data: CreatePlayerInput) {
  return withServerAction(
    async () => {
      const supabase = await createClient()
      const service = PlayerService(supabase)
      return await service.createPlayer(data)
    },
    { action: 'player.create', userId: session?.user?.id }
  )
}
```

**Tasks**:
- [ ] Create `app/actions/player-actions.ts`
- [ ] Implement: createPlayer, updatePlayer, deletePlayer, searchPlayers
- [ ] Use server action wrapper for all actions
- [ ] Test each action with Supabase client

**Success Criteria**:
- ✅ All CRUD operations functional
- ✅ Error handling via wrapper
- ✅ Audit logging enabled

---

#### Layer 2: Query Hooks (3 hours)
**Files**: `hooks/player/use-player.ts`, `hooks/player/use-players.ts`

```typescript
export function usePlayer(playerId: string) {
  return useServiceQuery(
    ['player', 'detail', playerId],
    () => getPlayerAction(playerId)
  )
}
```

**Tasks**:
- [ ] Create `use-player.ts` (single player fetch)
- [ ] Create `use-players.ts` (list with pagination)
- [ ] Create `use-player-search.ts` (search by name/phone)
- [ ] Test hooks with React Query DevTools

**Success Criteria**:
- ✅ Hooks use standardized query key pattern
- ✅ Loading/error states handled
- ✅ DevTools show correct cache behavior

---

#### Layer 3: Mutation Hooks (3 hours)
**Files**: `hooks/player/use-create-player.ts`, `hooks/player/use-update-player.ts`

```typescript
export function useCreatePlayer() {
  return useServiceMutation(
    createPlayerAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['player'] })
      }
    }
  )
}
```

**Tasks**:
- [ ] Create `use-create-player.ts`
- [ ] Create `use-update-player.ts`
- [ ] Create `use-delete-player.ts`
- [ ] Implement cache invalidation on success

**Success Criteria**:
- ✅ Mutations trigger cache invalidation
- ✅ Optimistic updates for better UX (optional)
- ✅ Error states handled gracefully

---

#### Layer 4: UI Components (6 hours)
**Files**: `components/player/player-list.tsx`, `components/player/player-form.tsx`

```typescript
export function PlayerList() {
  const { data: players, isLoading } = usePlayers()
  const createPlayer = useCreatePlayer()

  // UI implementation
}
```

**Tasks**:
- [ ] Create `player-list.tsx` (table with search/filter)
- [ ] Create `player-form.tsx` (create/edit form with validation)
- [ ] Create `player-detail.tsx` (detail view with actions)
- [ ] Create `player-delete-dialog.tsx` (confirmation modal)

**Success Criteria**:
- ✅ Users can view all players in table
- ✅ Users can create new players via form
- ✅ Users can edit existing players
- ✅ Users can delete players with confirmation

---

#### Layer 5: E2E Tests (4 hours)
**Files**: `e2e/player/player-crud.spec.ts`

```typescript
test('should create, view, edit, and delete player', async ({ page }) => {
  // Complete workflow test
})
```

**Tasks**:
- [ ] Create E2E test for player creation workflow
- [ ] Test player editing workflow
- [ ] Test player deletion workflow
- [ ] Test search and filter functionality

**Success Criteria**:
- ✅ All E2E tests passing
- ✅ >90% code coverage for player domain
- ✅ No flaky tests

---

### Week 4 Success Criteria Summary

**Feature Completeness**: Full Player Management stack
- ✅ Complete DB → Service → Action → Hook → UI stack
- ✅ Users can create, view, edit, delete players
- ✅ Search and filter working
- ✅ E2E tests passing

**Quality Gates**:
- ✅ TypeScript compilation successful
- ✅ No console errors in UI
- ✅ RLS policies validated (run security advisor)
- ✅ Performance: <100ms for hook execution

**Time Estimate**: 20 hours (5 days at 4 hours/day)

---

## 🚀 Week 5: Visit Tracking (VERTICAL)

**Deliverable**: Complete Visit Tracking feature with full UI

### Feature Stack Layers

#### Layer 1: Server Actions (4 hours)
**Files**: `app/actions/visit-actions.ts`

**Tasks**:
- [ ] Create `app/actions/visit-actions.ts`
- [ ] Implement: startVisit, endVisit, cancelVisit, getActiveVisits
- [ ] Use server action wrapper for all actions
- [ ] Test visit lifecycle (start → active → end)

**Success Criteria**:
- ✅ Visit lifecycle working (start, end, cancel)
- ✅ Active visits queryable
- ✅ Business logic enforced (1 active visit per player)

---

#### Layer 2: Query Hooks (3 hours)
**Files**: `hooks/visit/use-visit.ts`, `hooks/visit/use-active-visits.ts`

**Tasks**:
- [ ] Create `use-visit.ts` (single visit fetch)
- [ ] Create `use-active-visits.ts` (all active visits)
- [ ] Create `use-visit-history.ts` (player visit history)
- [ ] Test hooks with React Query DevTools

**Success Criteria**:
- ✅ Hooks use standardized query key pattern
- ✅ Real-time updates when visits change (optional)
- ✅ Loading/error states handled

---

#### Layer 3: Mutation Hooks (3 hours)
**Files**: `hooks/visit/use-start-visit.ts`, `hooks/visit/use-end-visit.ts`

**Tasks**:
- [ ] Create `use-start-visit.ts`
- [ ] Create `use-end-visit.ts`
- [ ] Create `use-cancel-visit.ts`
- [ ] Implement cache invalidation on success

**Success Criteria**:
- ✅ Mutations trigger cache invalidation
- ✅ Visit list updates immediately after mutations
- ✅ Error states handled (e.g., player already has active visit)

---

#### Layer 4: UI Components (6 hours)
**Files**: `components/visit/visit-form.tsx`, `components/visit/visit-list.tsx`

**Tasks**:
- [ ] Create `visit-form.tsx` (start visit form with player selection)
- [ ] Create `visit-list.tsx` (active visits table)
- [ ] Create `visit-status.tsx` (visit status badge)
- [ ] Create `end-visit-dialog.tsx` (end visit confirmation)

**Success Criteria**:
- ✅ Users can start visits for players
- ✅ Users can view all active visits
- ✅ Users can end visits with timestamp
- ✅ Users can cancel visits

---

#### Layer 5: E2E Tests (4 hours)
**Files**: `e2e/visit/visit-lifecycle.spec.ts`

**Tasks**:
- [ ] Create E2E test for visit start workflow
- [ ] Test visit end workflow
- [ ] Test visit cancel workflow
- [ ] Test business logic (1 active visit per player)

**Success Criteria**:
- ✅ All E2E tests passing
- ✅ Visit lifecycle fully tested
- ✅ Business rules validated

---

### Week 5 Success Criteria Summary

**Feature Completeness**: Full Visit Tracking stack
- ✅ Complete DB → Service → Action → Hook → UI stack
- ✅ Users can start, view, end, cancel visits
- ✅ Active visits visible in real-time
- ✅ E2E tests passing

**Quality Gates**:
- ✅ TypeScript compilation successful
- ✅ No console errors in UI
- ✅ RLS policies validated
- ✅ Performance: <100ms for hook execution

**Time Estimate**: 20 hours (5 days at 4 hours/day)

---

## 📊 Week 6: RatingSlip Creation (VERTICAL)

**Deliverable**: Complete RatingSlip Management feature with full UI

### Feature Stack Layers

#### Layer 1: Server Actions (4 hours)
**Files**: `app/actions/rating-slip-actions.ts`

**Tasks**:
- [ ] Create `app/actions/rating-slip-actions.ts`
- [ ] Implement: createRatingSlip, updateRatingSlip, getRatingSlipsByPlayer
- [ ] Use server action wrapper for all actions
- [ ] Test rating slip creation with point calculations

**Success Criteria**:
- ✅ Rating slip CRUD operations functional
- ✅ Point calculations validated
- ✅ Integration with MTL service working

---

#### Layer 2: Query Hooks (3 hours)
**Files**: `hooks/rating-slip/use-rating-slip.ts`, `hooks/rating-slip/use-rating-slips-by-player.ts`

**Tasks**:
- [ ] Create `use-rating-slip.ts` (single rating slip fetch)
- [ ] Create `use-rating-slips-by-player.ts` (player rating history)
- [ ] Create `use-rating-slip-summary.ts` (point totals)
- [ ] Test hooks with React Query DevTools

**Success Criteria**:
- ✅ Hooks use standardized query key pattern
- ✅ Rating slip data includes calculated points
- ✅ Loading/error states handled

---

#### Layer 3: Mutation Hooks (3 hours)
**Files**: `hooks/rating-slip/use-create-rating-slip.ts`, `hooks/rating-slip/use-update-rating-slip.ts`

**Tasks**:
- [ ] Create `use-create-rating-slip.ts`
- [ ] Create `use-update-rating-slip.ts`
- [ ] Implement cache invalidation on success
- [ ] Test mutation error handling

**Success Criteria**:
- ✅ Mutations trigger cache invalidation
- ✅ Player rating history updates after mutations
- ✅ Error states handled (validation errors, FK violations)

---

#### Layer 4: UI Components (6 hours)
**Files**: `components/rating-slip/rating-form.tsx`, `components/rating-slip/rating-list.tsx`

**Tasks**:
- [ ] Create `rating-form.tsx` (create rating slip with validation)
- [ ] Create `rating-list.tsx` (player rating history table)
- [ ] Create `point-display.tsx` (calculated points breakdown)
- [ ] Create `rating-summary.tsx` (aggregate point totals)

**Success Criteria**:
- ✅ Users can create rating slips for visits
- ✅ Users can view player rating history
- ✅ Point calculations displayed correctly
- ✅ Users can edit existing rating slips

---

#### Layer 5: E2E Tests (4 hours)
**Files**: `e2e/rating-slip/rating-workflow.spec.ts`

**Tasks**:
- [ ] Create E2E test for rating slip creation
- [ ] Test rating slip editing workflow
- [ ] Test point calculation accuracy
- [ ] Test integration with visit and player data

**Success Criteria**:
- ✅ All E2E tests passing
- ✅ Point calculations verified
- ✅ Integration workflows tested

---

### Week 6 Success Criteria Summary

**Feature Completeness**: Full RatingSlip Management stack
- ✅ Complete DB → Service → Action → Hook → UI stack
- ✅ Users can create, view, edit rating slips
- ✅ Point calculations accurate
- ✅ E2E tests passing

**Quality Gates**:
- ✅ TypeScript compilation successful
- ✅ No console errors in UI
- ✅ RLS policies validated
- ✅ Performance: <100ms for hook execution

**Time Estimate**: 20 hours (5 days at 4 hours/day)

---

## ✅ Quality Gates & Validation

### Per-Week Gates

**Week 3 (HORIZONTAL)**:
- [ ] React Query provider configured in root layout
- [ ] Server action wrapper tested with ≥1 service
- [ ] Hook templates documented with examples
- [ ] All 7 services pass integration smoke tests
- [ ] ADR-003 approved
- [ ] DevTools accessible in development

**Weeks 4-6 (VERTICAL - per feature)**:
- [ ] Complete DB → Service → Action → Hook → UI stack implemented
- [ ] Users can perform all CRUD operations via UI
- [ ] E2E tests passing for all workflows
- [ ] TypeScript compilation successful (zero errors)
- [ ] RLS policies validated via security advisor
- [ ] Performance targets met (<100ms hook execution)

### Cross-Cutting Quality Standards

**Type Safety**:
- [ ] No `any` types in production code
- [ ] All server actions return `Result<T>`
- [ ] Database types from `types/database.types.ts` only

**Performance**:
- [ ] Hook execution <100ms (measure with DevTools)
- [ ] Query response times <200ms for simple fetches
- [ ] No unnecessary re-renders (use React DevTools Profiler)

**Security**:
- [ ] RLS policies enforced for all tables
- [ ] Security advisor shows zero critical issues
- [ ] Server actions validate user permissions

**Testing**:
- [ ] >90% E2E test pass rate
- [ ] All critical user workflows covered
- [ ] No flaky tests in CI pipeline

---

## 📝 ADR Documentation Requirements

### ADR-003: State Management Strategy (Week 3)
**Status**: Required before Week 4
**File**: `docs/adr/ADR-003-state-management-strategy.md`

**Decisions to Document**:
- React Query configuration (staleTime, cacheTime, retry)
- Query key pattern: `[domain, entity, id]`
- Cache invalidation strategy (invalidateQueries vs setQueryData)
- Zustand scope definition (ephemeral UI only)
- Server data ownership (React Query owns all server state)

---

### ADR-004: Real-Time Strategy (Week 6)
**Status**: Required if real-time features added
**File**: `docs/adr/ADR-004-real-time-strategy.md`

**Decisions to Document**:
- Direct cache invalidation vs batch scheduler
- Memory leak prevention approach
- Domain-specific channels vs shared channel
- Reconnection handling strategy
- Subscription cleanup patterns

---

### ADR-005: Security Patterns (Week 7)
**Status**: Required for production deployment
**File**: `docs/adr/ADR-005-security-patterns.md`

**Decisions to Document**:
- RLS policy patterns per role (admin, player, anonymous)
- JWT claim validation approach
- Audit logging strategy
- Rate limiting for sensitive operations
- Input validation and sanitization standards

---

## 📊 Metrics & Progress Tracking

### HORIZONTAL Metrics (Week 3)

**Infrastructure Completeness**: Track components delivered
- React Query setup: ✅ / ❌
- Server action wrapper: ✅ / ❌
- Zustand stores: ✅ / ❌
- Hook templates: ✅ / ❌
- Integration tests: ✅ / ❌

**Adoption Metrics**:
- Server action wrapper usage: X/Y actions using wrapper
- Hook template usage: X/Y queries using templates
- Test coverage: All 7 services validated

---

### VERTICAL Metrics (Weeks 4-6)

**Feature Delivery**: Track features completed
- Player Management: ✅ / ❌
- Visit Tracking: ✅ / ❌
- RatingSlip Creation: ✅ / ❌

**Per-Feature Metrics**:
- E2E test coverage: X/Y critical workflows tested
- User-facing functionality: CRUD operations working
- Performance: Hook execution times (avg/p95)

---

### Progress Tracking Procedures

**Daily** (during active development):
- [ ] Update TodoWrite with current task status
- [ ] Run type-check after each layer completion
- [ ] Test new functionality manually in browser

**Weekly** (end of each week):
- [ ] Update `docs/phase-2/SESSION_HANDOFF.md` with progress
- [ ] Run security advisor and address critical issues
- [ ] Commit changes with HORIZONTAL or VERTICAL label
- [ ] Review metrics and adjust timeline if needed

**End of Phase 3**:
- [ ] Update `docs/roadmap/MVP_PRODUCTION_ROADMAP.md`
- [ ] Document lessons learned in ADRs
- [ ] Run final E2E test suite
- [ ] Create Phase 4 planning document

---

## ⚠️ Risk Management

### Week 3 Risks

**Risk**: React Query configuration conflicts with existing setup
**Probability**: Medium
**Impact**: High
**Mitigation**: Review current Next.js setup, backup existing config, start with minimal configuration

**Risk**: Server action wrapper adds too much complexity
**Probability**: Low
**Impact**: Medium
**Mitigation**: Start with simple pattern, iterate based on actual usage

**Risk**: Integration tests reveal service issues
**Probability**: Medium
**Impact**: High
**Mitigation**: Fix service issues immediately before proceeding to Week 4

---

### Weeks 4-6 Risks

**Risk**: Feature scope creep (adding non-MVP features)
**Probability**: High
**Impact**: High
**Mitigation**: Enforce strict CRUD-only scope per week, defer enhancements to post-MVP

**Risk**: E2E test flakiness slows development
**Probability**: Medium
**Impact**: Medium
**Mitigation**: Follow Playwright best practices, implement retry logic, investigate flaky tests immediately

**Risk**: Type errors accumulate across layers
**Probability**: Medium
**Impact**: Medium
**Mitigation**: Run `npx tsc --noEmit` after each layer, fix errors before proceeding

**Risk**: Performance degradation as features grow
**Probability**: Low
**Impact**: High
**Mitigation**: Establish performance baselines Week 3, monitor query times with DevTools

---

### Timeline Buffers

**Per-Week Buffer**: 20% (4 hours per week)
- Use for unexpected issues, refactoring, documentation

**Friday Afternoons**: Reserved for integration testing and documentation
- Run full test suite
- Update documentation
- Review week's progress

**Contingency Plan**: Defer Loyalty Service to post-MVP if Week 3 runs long
- Week 3 is critical path for Weeks 4-6
- Better to have strong foundation than rush infrastructure

---

## 🔗 Reference Materials

### Architecture & Patterns
- **BALANCED_ARCHITECTURE_QUICK.md** - 4-second rule for HORIZONTAL vs VERTICAL decisions
- **SERVICE_RESPONSIBILITY_MATRIX.md** - Bounded context integrity guidelines
- **SERVICE_TEMPLATE_QUICK.md** - Service layer patterns and standards
- **DATABASE_TYPE_WORKFLOW.md** - Type system management guide

### Planning & Roadmap
- **MVP_PRODUCTION_ROADMAP.md** - 8-week timeline overview
- **ARCHITECTURE_GAPS.md** - Known gaps and technical debt
- **NEXT_STEPS_REPORT.md** - Phase 2 completion summary

### Progress Tracking
- **SESSION_HANDOFF.md** - Current status and weekly updates
- **INDEX.md** - Documentation navigation map
- **ADR-002** - Test location standardization decision

---

## 🚀 Quick Start Guide

### Day 1 (Today/Tomorrow - 2 hours)
1. ✅ Review `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md` (10 min)
2. ✅ Read this workflow document completely (20 min)
3. ✅ Create ADR-003 template (30 min)
4. ✅ Start React Query setup (1 hour)

### Week 3 (HORIZONTAL Foundation)
1. Complete all 5 infrastructure components (18-20 hours)
2. Document decisions in ADR-003
3. Update SESSION_HANDOFF.md with progress
4. Validate all quality gates before Week 4

### Weeks 4-6 (VERTICAL Features)
1. Execute one feature per week (Player → Visit → RatingSlip)
2. Follow 5-layer stack pattern for each feature
3. Track completion via TodoWrite daily
4. Run E2E tests before marking feature complete

---

## 📋 Execution Checklist

### Pre-Phase 3 (Before Week 3)
- [ ] Review BALANCED_ARCHITECTURE_QUICK.md
- [ ] Read Phase 3 workflow completely
- [ ] Verify Phase 2 completion (7 services delivered)
- [ ] Ensure local environment ready (Next.js, React Query, Zustand)

### Week 3 Execution
- [ ] React Query setup complete
- [ ] Server action wrapper tested
- [ ] Zustand stores created
- [ ] Hook templates documented
- [ ] Integration tests passing
- [ ] ADR-003 finalized

### Week 4 Execution
- [ ] Player server actions implemented
- [ ] Player query hooks working
- [ ] Player mutation hooks with cache invalidation
- [ ] Player UI components functional
- [ ] Player E2E tests passing

### Week 5 Execution
- [ ] Visit server actions implemented
- [ ] Visit query hooks working
- [ ] Visit mutation hooks with cache invalidation
- [ ] Visit UI components functional
- [ ] Visit E2E tests passing

### Week 6 Execution
- [ ] RatingSlip server actions implemented
- [ ] RatingSlip query hooks working
- [ ] RatingSlip mutation hooks with cache invalidation
- [ ] RatingSlip UI components functional
- [ ] RatingSlip E2E tests passing

### Post-Phase 3 (After Week 6)
- [ ] All 3 features delivered and tested
- [ ] SESSION_HANDOFF.md updated with final status
- [ ] MVP_PRODUCTION_ROADMAP.md updated
- [ ] Phase 4 planning initiated
- [ ] Lessons learned documented in ADRs

---

## 🎯 TL;DR - Phase 3 Summary

### Week 3 (HORIZONTAL)
Build state management infrastructure:
- React Query, server actions, Zustand, hooks, tests
- **Goal**: Enable Weeks 4-6 feature delivery

### Weeks 4-6 (VERTICAL)
Ship complete feature stacks:
- Week 4: Player Management
- Week 5: Visit Tracking
- Week 6: RatingSlip Creation
- **Goal**: Deliver user-facing MVP functionality

### Success Metrics
- 3/3 features delivered
- >90% E2E test pass rate
- <100ms hook performance
- Zero TypeScript errors
- All quality gates passed

**Architecture Reference**: Apply 4-second rule for all decisions
**Progress Tracking**: TodoWrite daily, SESSION_HANDOFF.md weekly
**Documentation**: ADR-003, ADR-004, ADR-005 as needed

---

**Status**: Ready for execution
**Next Action**: Start Week 3 React Query setup
**Timeline**: 4 weeks (Weeks 3-6)
**Owner**: Development team
**Last Updated**: 2025-10-10

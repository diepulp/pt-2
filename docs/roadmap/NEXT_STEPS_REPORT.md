# PT-2 Next Steps & Vertical Slice Recommendations

> **Date**: 2025-10-07
> **Context**: Phase 2 - 75% Complete (6/8 services)
> **Purpose**: Actionable roadmap for completing Phase 2 and transitioning to Phase 3

---

## Executive Summary

**Current Achievement**: 6/8 core services complete with 79/79 tests passing. Template velocity validated at 4x improvement. Test infrastructure standardized via ADR-002.

**Immediate Priority**: Complete MTL Service (Compliance domain), then transition to Phase 3 UI layer with state management foundation.

**Critical Path**: Service layer → State management → UI components → Real-time infrastructure → Production hardening

---

## Phase 2 Completion (Week 3)

### Priority 1: MTL Service (Compliance Domain) - 1 Day

**Bounded Context**: "What cash transactions require regulatory reporting?"

**Implementation Scope**:
```
services/mtl/
├── index.ts           # Explicit MTLService interface
├── crud.ts            # Transaction CRUD operations
└── queries.ts         # Compliance queries

__tests__/services/mtl/
└── mtl-service.test.ts  # Comprehensive test coverage
```

**Key Operations**:
- **CRUD**: create(), getById(), update(), delete()
- **Queries**:
  - listByGamingDay() - Gaming day calculation logic
  - listByCTRThreshold() - $10k threshold detection
  - listByPatron() - Patron transaction history
  - getPendingCTRReports() - Unprocessed reporting queue

**Regulatory Constraints**:
- CTR threshold: $10,000 cash in/out
- Gaming day: 6am-6am cycle
- Direction: cash_in, cash_out
- Area: pit, cage, slot
- Tender types: cash, check, chip

**Complexity**: Medium-High (regulatory logic, gaming day calculations, compliance rules)

**Reference Pattern**: PlayerFinancial service (similar compliance context)

**Estimated Effort**: 6-8 hours (regulatory complexity)

---

### Priority 2: Search & Query Pattern Mining - 2 Days

**Goal**: Apply proven PT-1 patterns to all 6 services for advanced search/query capabilities.

**Pattern Sources** (from PT-1 analysis):
- `search.ts`: Multi-word search with relevance scoring (~8h to rewrite)
- `queries.ts`: JOIN patterns, active queries (~8.75h to adapt)

**Service-Specific Implementation**:

#### Player Service Search/Queries
```typescript
// Search operations
searchPlayers(query: string): Promise<ServiceResult<PlayerDTO[]>>
  - Multi-word search: name, email, phone
  - Relevance scoring

// Query operations
getActivePlayers(): Promise<ServiceResult<PlayerDTO[]>>
getPlayersByTier(tier: string): Promise<ServiceResult<PlayerDTO[]>>
getPlayersBySignupDateRange(start: Date, end: Date): Promise<ServiceResult<PlayerDTO[]>>
```

#### Visit Service Search/Queries
```typescript
// Search operations
searchVisits(filters: VisitSearchFilters): Promise<ServiceResult<VisitDTO[]>>
  - Date range filtering
  - Player name search
  - Casino location

// Query operations
getActiveVisits(): Promise<ServiceResult<VisitDTO[]>>
getVisitsByDateRange(start: Date, end: Date): Promise<ServiceResult<VisitDTO[]>>
getVisitsByCasino(casinoId: string): Promise<ServiceResult<VisitDTO[]>>
getPlayerVisitHistory(playerId: string): Promise<ServiceResult<VisitDTO[]>>
```

#### RatingSlip Service Search/Queries
```typescript
// Search operations
searchRatingSlips(filters: RatingSlipFilters): Promise<ServiceResult<RatingSlipDTO[]>>
  - Table search
  - Player search
  - Date range

// Query operations
getActiveRatingSlips(): Promise<ServiceResult<RatingSlipDTO[]>>
getRatingSlipsByTable(tableId: string): Promise<ServiceResult<RatingSlipDTO[]>>
getRatingSlipsByPlayer(playerId: string): Promise<ServiceResult<RatingSlipDTO[]>>
calculatePlayerPoints(playerId: string, dateRange: DateRange): Promise<ServiceResult<PointSummaryDTO>>
```

#### Casino Service Search/Queries
```typescript
// Search operations
searchCasinos(query: string): Promise<ServiceResult<CasinoDTO[]>>
searchTables(casinoId: string, filters: TableFilters): Promise<ServiceResult<GamingTableDTO[]>>

// Query operations
getActiveCasinos(): Promise<ServiceResult<CasinoDTO[]>>
getFloorStatus(casinoId: string): Promise<ServiceResult<FloorStatusDTO>>
getTableUtilization(casinoId: string): Promise<ServiceResult<TableUtilizationDTO[]>>
```

#### TableContext Service Search/Queries
```typescript
// Query operations
getActiveTablesWithSettings(casinoId: string): Promise<ServiceResult<TableWithSettingsDTO[]>>
getTablesByGameType(gameType: string): Promise<ServiceResult<GamingTableDTO[]>>
getSettingsChangeHistory(tableId: string, dateRange: DateRange): Promise<ServiceResult<SettingsHistoryDTO[]>>
```

#### MTL Service Search/Queries
```typescript
// Search operations
searchTransactions(filters: MTLSearchFilters): Promise<ServiceResult<MTLEntryDTO[]>>
  - Patron search
  - Date range
  - Amount thresholds
  - Transaction direction

// Query operations
getCTRCandidates(gamingDay: Date): Promise<ServiceResult<MTLEntryDTO[]>>
getPatronDailyTotals(patronId: string, gamingDay: Date): Promise<ServiceResult<DailyTotalDTO>>
getTransactionsByArea(area: string, dateRange: DateRange): Promise<ServiceResult<MTLEntryDTO[]>>
```

**Implementation Strategy**:
1. **Day 1**: Implement search/query modules for Player, Visit, RatingSlip
2. **Day 2**: Implement search/query modules for Casino, TableContext, MTL

**Testing**: Add 3-5 tests per service for search/query operations

**Total Estimated Effort**: 16 hours

---

### Priority 3: Integration Testing & Audit - 1 Day

**Integration Smoke Tests**:
- Cross-service FK integrity (Player → Visit → RatingSlip → PlayerFinancial)
- Cascade operations (Visit end → RatingSlip finalization → Point calculation)
- Multi-domain workflows (Visit lifecycle with MTL logging)

**End-of-Phase-2 Audit**:
- ✅ All services have explicit interfaces (no `ReturnType`)
- ✅ All services use `SupabaseClient<Database>` (no `any`)
- ✅ Zero PRD violations (ESLint + manual review)
- ✅ Test coverage >80% per service
- ✅ Test location consistency (root-level `__tests__/services/`)
- ✅ Bounded context integrity (Service Responsibility Matrix)
- ✅ Documentation complete (ADRs, templates, handoff)

**Estimated Effort**: 6-8 hours

---

## Phase 2 Deliverables Summary

**Services Complete**: 7/8 (Loyalty deferred to post-MVP)
- ✅ Player Service (8 tests)
- ✅ Visit Service (10 tests)
- ✅ RatingSlip Service (10 tests)
- ✅ PlayerFinancial Service (16 tests)
- ✅ Casino Service (13 tests)
- ✅ TableContext Service (22 tests)
- ✅ MTL Service (estimated 15 tests)

**Search/Query Capabilities**: All 6 services
**Total Test Coverage**: ~94 tests (estimated)
**Velocity**: 4x improvement sustained
**Architecture**: Zero PRD violations

---

## Phase 3: UI Layer & State Management (Weeks 4-6)

### Critical Blockers Resolved by Phase 2
✅ Service layer complete with explicit interfaces
✅ ServiceResult pattern for error handling
✅ Typed Supabase clients
✅ Test infrastructure proven

### Phase 3 Vertical Slice Strategy

**Week 4: State Management Foundation** (3 days)

#### Vertical Slice 1: React Query Infrastructure
```
lib/
└── query-client.ts              # React Query configuration

Configuration:
- staleTime: 5 * 60 * 1000 (5 minutes)
- gcTime: 10 * 60 * 1000 (10 minutes)
- refetchOnWindowFocus: false
- retry: 1
```

**Key Decision**: React Query for ALL remote state (server data), Zustand ONLY for ephemeral UI state.

#### Vertical Slice 2: Query Hook Template
```typescript
// hooks/shared/use-service-query.ts
export function useServiceQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<ServiceResult<T>>,
  options?: UseQueryOptions
) {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const result = await queryFn();
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    ...options,
  });
}
```

**Pattern**: Wrap ServiceResult → throw on error → React Query error boundary

#### Vertical Slice 3: Domain Query Hooks (Player Example)
```typescript
// hooks/player/use-player-queries.ts
export function usePlayer(id: string) {
  const supabase = createClient();
  const playerService = createPlayerService(supabase);

  return useServiceQuery(
    ['player', id],
    () => playerService.getById(id)
  );
}

export function usePlayers() {
  const supabase = createClient();
  const playerService = createPlayerService(supabase);

  return useServiceQuery(
    ['players'],
    () => playerService.list()
  );
}

export function usePlayerSearch(query: string) {
  const supabase = createClient();
  const playerService = createPlayerService(supabase);

  return useServiceQuery(
    ['players', 'search', query],
    () => playerService.searchPlayers(query),
    { enabled: query.length > 0 }
  );
}
```

#### Vertical Slice 4: Mutation Hooks (Player Example)
```typescript
// hooks/player/use-player-mutations.ts
export function useCreatePlayer() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const playerService = createPlayerService(supabase);

  return useMutation({
    mutationFn: (data: PlayerCreateDTO) =>
      playerService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
    },
  });
}

export function useUpdatePlayer() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const playerService = createPlayerService(supabase);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PlayerUpdateDTO }) =>
      playerService.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['player', id] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
    },
  });
}
```

#### Vertical Slice 5: Server Actions Wrapper
```typescript
// lib/actions/with-server-action-wrapper.ts
export async function withServerAction<T>(
  action: () => Promise<ServiceResult<T>>,
  options: {
    revalidatePath?: string;
    revalidateTag?: string;
    telemetry?: {
      operation: string;
      domain: string;
    };
  }
): Promise<ServiceResult<T>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const result = await action();

    if (result.success && options.revalidatePath) {
      revalidatePath(options.revalidatePath);
    }

    if (result.success && options.revalidateTag) {
      revalidateTag(options.revalidateTag);
    }

    // Structured telemetry (not console.*)
    logger.info('server_action_completed', {
      requestId,
      operation: options.telemetry?.operation,
      domain: options.telemetry?.domain,
      duration: Date.now() - startTime,
      success: result.success,
    });

    return result;
  } catch (error) {
    logger.error('server_action_failed', {
      requestId,
      operation: options.telemetry?.operation,
      error: error.message,
      duration: Date.now() - startTime,
    });

    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: error.message,
      },
    };
  }
}
```

#### Vertical Slice 6: Domain Server Actions (Player Example)
```typescript
// app/actions/player/create-player-action.ts
'use server';

export async function createPlayerAction(data: PlayerCreateDTO) {
  const supabase = createClient();
  const playerService = createPlayerService(supabase);

  return withServerAction(
    () => playerService.create(data),
    {
      revalidatePath: '/players',
      telemetry: {
        operation: 'create_player',
        domain: 'player',
      },
    }
  );
}
```

#### Vertical Slice 7: Zustand UI Store (Minimal)
```typescript
// store/ui-store.ts
interface UIState {
  isPlayerModalOpen: boolean;
  openPlayerModal: () => void;
  closePlayerModal: () => void;

  selectedPlayerId: string | null;
  setSelectedPlayerId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isPlayerModalOpen: false,
  openPlayerModal: () => set({ isPlayerModalOpen: true }),
  closePlayerModal: () => set({ isPlayerModalOpen: false }),

  selectedPlayerId: null,
  setSelectedPlayerId: (id) => set({ selectedPlayerId: id }),
}));
```

**IMPORTANT**: Zustand stores NEVER contain server data (players, visits, etc.). Only ephemeral UI state (modal visibility, selected IDs, navigation state).

---

**Week 5: Domain UI Components** (5 days)

#### Vertical Slice 8: Player Domain UI

**Component Architecture**:
```
components/player/
├── player-list.tsx           # Server Component - fetches data
├── player-list-client.tsx    # Client Component - interactivity
├── player-form.tsx           # Client Component - mutations
├── player-detail.tsx         # Server Component - single player
├── player-search.tsx         # Client Component - search
└── player-card.tsx           # Shared Component - display
```

**Implementation Pattern** (player-list.tsx):
```typescript
// Server Component - fetches data
export default async function PlayerList() {
  const supabase = createClient();
  const playerService = createPlayerService(supabase);

  const result = await playerService.list();

  if (!result.success) {
    return <ErrorDisplay error={result.error} />;
  }

  return <PlayerListClient players={result.data} />;
}
```

**Implementation Pattern** (player-list-client.tsx):
```typescript
'use client';

interface PlayerListClientProps {
  players: PlayerDTO[];
}

export function PlayerListClient({ players: initialPlayers }: PlayerListClientProps) {
  const { data: players = initialPlayers } = usePlayers();
  const { mutate: createPlayer } = useCreatePlayer();
  const { isPlayerModalOpen, openPlayerModal, closePlayerModal } = useUIStore();

  return (
    <div>
      <Button onClick={openPlayerModal}>Add Player</Button>

      <div className="grid gap-4">
        {players.map((player) => (
          <PlayerCard key={player.id} player={player} />
        ))}
      </div>

      {isPlayerModalOpen && (
        <PlayerFormModal
          onClose={closePlayerModal}
          onSubmit={(data) => {
            createPlayer(data);
            closePlayerModal();
          }}
        />
      )}
    </div>
  );
}
```

**Estimated Effort**: 2 days (Player domain complete)

#### Vertical Slice 9: Visit Domain UI
- visit-form.tsx (start visit workflow)
- visit-list.tsx (active/historical visits)
- visit-detail.tsx (visit lifecycle actions)
- visit-status-badge.tsx (status display)

**Estimated Effort**: 2 days

#### Vertical Slice 10: RatingSlip Domain UI
- rating-form.tsx (create/update ratings)
- rating-list.tsx (by table/player)
- rating-detail.tsx (rating details)
- point-display.tsx (point calculations)

**Estimated Effort**: 2 days

**Total Week 5 Effort**: 5 days (overlapping work on different domains)

---

**Week 6: Real-Time Infrastructure** (5 days)

#### Vertical Slice 11: Real-Time Channel Wrapper
```typescript
// hooks/shared/use-supabase-channel.ts
export function useSupabaseChannel<T extends RealtimePostgresChangesPayload<any>>(
  channelName: string,
  config: {
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    schema: string;
    table: string;
    filter?: string;
  },
  callback: (payload: T) => void
) {
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', config, callback)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, config.event, config.table, config.filter]);
}
```

**Pattern**: Automatic cleanup on unmount, typed payloads, domain-specific channels.

#### Vertical Slice 12: Batch Invalidation Scheduler
```typescript
// lib/realtime/invalidation-scheduler.ts
class InvalidationScheduler {
  private pendingInvalidations = new Set<string>();
  private scheduledFlush: NodeJS.Timeout | null = null;

  scheduleInvalidation(queryKey: string) {
    this.pendingInvalidations.add(queryKey);

    if (!this.scheduledFlush) {
      this.scheduledFlush = setTimeout(() => {
        this.flush();
      }, 100); // 100ms debounce
    }
  }

  private flush() {
    const queryClient = getQueryClient();

    this.pendingInvalidations.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });

    this.pendingInvalidations.clear();
    this.scheduledFlush = null;
  }
}

export const invalidationScheduler = new InvalidationScheduler();
```

**Pattern**: Batch invalidations to prevent React Query thrashing on rapid updates.

#### Vertical Slice 13: Domain Real-Time Hooks (Player Example)
```typescript
// hooks/player/use-player-realtime.ts
export function usePlayerRealtime() {
  useSupabaseChannel('player-changes', {
    event: '*',
    schema: 'public',
    table: 'player',
  }, (payload) => {
    invalidationScheduler.scheduleInvalidation('players');

    if (payload.new?.id) {
      invalidationScheduler.scheduleInvalidation(`player-${payload.new.id}`);
    }
  });
}
```

**Usage in Components**:
```typescript
export function PlayerListClient() {
  usePlayerRealtime(); // Auto-subscribes, auto-cleans up
  const { data: players } = usePlayers();
  // ...
}
```

**Estimated Effort**: 2 days (foundation + 3 domain hooks)

#### Vertical Slice 14: Real-Time Testing
- Mock Supabase channels
- Verify cleanup on unmount
- Test invalidation scheduler batching
- Memory leak validation

**Estimated Effort**: 1 day

---

## Phase 3 Success Criteria

- ✅ React Query managing 100% of server data
- ✅ Zustand stores contain ZERO server data (UI state only)
- ✅ All domain UIs functional (Player, Visit, RatingSlip)
- ✅ Real-time updates <1s latency
- ✅ Zero memory leaks (cleanup verified)
- ✅ Server actions with structured telemetry
- ✅ Dynamic imports for heavy components

---

## Phase 4: Compliance & Workflows (Weeks 7-8)

### Vertical Slice 15: MTL Compliance Domain UI
- MTL transaction form with CTR threshold warnings
- Compliance dashboard (pending CTRs, daily totals)
- Gaming day calculator
- Audit trail display

**Dependencies**: MTL Service complete (Phase 2)

### Vertical Slice 16: Visit Lifecycle Workflows
- Visit start → rating slip creation flow
- Visit end → point calculation → MTL logging
- Cancel visit → rollback logic
- State transition validation

**Dependencies**: Player, Visit, RatingSlip, MTL services + UI

### Vertical Slice 17: Table Context Management
- Table open/close workflows
- Shift handover UI
- Inventory tracking (chips in/out)
- Fill slip integration

**Dependencies**: TableContext service + Casino UI

---

## Phase 5: Production Hardening (Weeks 9-10)

### Vertical Slice 18: Performance Optimization
- Bundle analysis + code splitting
- Dynamic imports for modals/icons
- Query optimization (database indexes)
- Lighthouse CI gates (LCP ≤2.5s, TBT ≤200ms)

### Vertical Slice 19: Security Hardening
- RLS policy audit (Supabase advisor tool)
- JWT claim validation
- API rate limiting
- CORS configuration

### Vertical Slice 20: Deployment Automation
- Staging environment setup
- Migration deployment scripts
- Rollback procedures
- Health check endpoints
- Monitoring (structured logging + metrics)

---

## Immediate Action Plan (Next 5 Days)

### Day 1 (Today): MTL Service CRUD
- [ ] Create `services/mtl/index.ts` with explicit interface
- [ ] Implement `services/mtl/crud.ts` (create, getById, update, delete)
- [ ] Create `__tests__/services/mtl/mtl-service.test.ts`
- [ ] Run tests, verify 100% pass rate
- [ ] Commit with message: "feat(mtl): Implement MTL Service CRUD operations"

### Day 2: MTL Service Queries
- [ ] Implement `services/mtl/queries.ts`
  - listByGamingDay()
  - listByCTRThreshold()
  - listByPatron()
  - getPendingCTRReports()
- [ ] Add query tests to test suite
- [ ] Verify all 15 tests passing
- [ ] Commit with message: "feat(mtl): Add compliance query operations"

### Day 3: Search/Query Pattern Mining - Part 1
- [ ] Create search/query modules for Player service
- [ ] Create search/query modules for Visit service
- [ ] Create search/query modules for RatingSlip service
- [ ] Add tests for new operations (3-5 per service)
- [ ] Commit with message: "feat(services): Add search/query capabilities to Player, Visit, RatingSlip"

### Day 4: Search/Query Pattern Mining - Part 2
- [ ] Create search/query modules for Casino service
- [ ] Create search/query modules for TableContext service
- [ ] Create search/query modules for MTL service
- [ ] Add tests for new operations (3-5 per service)
- [ ] Commit with message: "feat(services): Add search/query capabilities to Casino, TableContext, MTL"

### Day 5: Integration Testing & Phase 2 Audit
- [ ] Write integration smoke tests
  - Cross-service FK integrity
  - Cascade operations
  - Multi-domain workflows
- [ ] Run end-of-phase audit checklist
- [ ] Update SESSION_HANDOFF.md with Phase 2 completion
- [ ] Update MVP_PRODUCTION_ROADMAP.md to Phase 3 status
- [ ] Commit with message: "test(integration): Phase 2 completion audit + smoke tests"

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| MTL regulatory logic complexity | Medium | High | Reference PlayerFinancial patterns, time-box at 8h |
| Search pattern rewrite overruns | Medium | Medium | Time-box PT-1 mining at 4h per module, rewrite if needed |
| React Query learning curve | Low | Medium | Use proven patterns from documentation, simple wrapper first |
| Real-time memory leaks | Medium | High | Strict cleanup testing, useEffect dependency audits |
| Performance budget miss | Low | High | Weekly Lighthouse checks starting Week 4 |

---

## Success Metrics

### Phase 2 (Week 3 Target)
- ✅ 7/8 services complete (Loyalty deferred)
- ✅ 94+ tests passing
- ✅ Search/query capabilities on all services
- ✅ Zero PRD violations
- ✅ Test coverage >80%

### Phase 3 (Week 6 Target)
- ✅ Player, Visit, RatingSlip UIs complete
- ✅ React Query managing all remote state
- ✅ Real-time updates <1s latency
- ✅ Zero Zustand state pollution

### Phase 4 (Week 8 Target)
- ✅ MTL compliance operational
- ✅ Visit lifecycle automation complete
- ✅ Table context management functional

### Phase 5 (Week 10 Target)
- ✅ LCP ≤2.5s, Initial JS ≤250KB
- ✅ Zero security advisor warnings
- ✅ Deployment automation ready

---

## References

- [SESSION_HANDOFF.md](../phase-2/SESSION_HANDOFF.md) - Current implementation state
- [ARCHITECTURE_GAPS.md](./ARCHITECTURE_GAPS.md) - Detailed gap analysis
- [MVP_PRODUCTION_ROADMAP.md](./MVP_PRODUCTION_ROADMAP.md) - Full roadmap
- [SERVICE_TEMPLATE_QUICK.md](../patterns/SERVICE_TEMPLATE_QUICK.md) - Service implementation guide
- [ADR-002](../architecture/ADR-002-test-location-standard.md) - Test location standard

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-07
**Next Review**: End of Week 3 (Phase 2 completion)

# PRD-003 — Player & Visit Management

## 1. Overview
- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** PlayerService and VisitService provide the identity and session lifecycle contexts required for all gameplay tracking. PlayerService owns player profiles and casino enrollment; VisitService owns visit sessions (check-in/check-out). These services unblock RatingSlipService, LoyaltyService, and MTLService per the MVP critical path. This PRD implements Route Handlers using Phase 0 `withServerAction` middleware, establishes proper RLS policies, and provides React Query hooks for UI integration.

## 2. Problem & Goals

### 2.1 Problem

**MVP Critical Path Blocker**

Per MVP-ROADMAP and `/mvp-status`, PlayerService and VisitService are the next critical path items:

| Blocker | Blocked By | Blocks |
|---------|------------|--------|
| PlayerService | CasinoService (✅ COMPLETE) | VisitService, RatingSlipService, LoyaltyService |
| VisitService | PlayerService | RatingSlipService, LoyaltyService, PitDashboard |

**Current State**:
- Database schema exists (`player`, `player_casino`, `visit` tables present in `database.types.ts`)
- No service layer implementation exists
- No Route Handlers exist for player/visit CRUD
- No React Query hooks for player search or visit lifecycle
- UI cannot create rating slips without player selection and active visit

**Impact**:
- RatingSlipService (already implemented) cannot be properly tested end-to-end
- LoyaltyService rewards cannot be issued (no player_id, visit_id references)
- MTLService compliance entries cannot be linked to player visits
- Pit Dashboard blocked (depends on visit/rating slip display)

### 2.2 Goals
- **G1**: PlayerService deployed with enrollment, search, and profile operations
- **G2**: VisitService deployed with check-in and check-out operations
- **G3**: All routes use `withServerAction` middleware with proper RLS context
- **G4**: Player search supports name-based fuzzy matching for pit boss workflow
- **G5**: Visit lifecycle enforces single active visit per player per casino
- **G6**: Integration tests validate player enrollment and visit workflows

### 2.3 Non-Goals
- Player self-service portal or kiosk UI (future)
- Player loyalty tier display (LoyaltyService scope)
- Player financial summary view (PlayerFinancialService scope)
- Multi-property player merge or linking (post-MVP)
- Visit history analytics or reporting (post-MVP)
- Automatic visit timeout (requires scheduler, post-MVP)

## 3. Users & Use Cases
- **Primary users:** Pit Boss, Casino Admin

**Top Jobs:**
- As a **Pit Boss**, I need to search for a player by name so that I can start a rating slip.
- As a **Pit Boss**, I need to check in a player to start a visit so that all rating activity is tracked.
- As a **Pit Boss**, I need to check out a player when they leave so that the visit session is properly closed.
- As a **Casino Admin**, I need to enroll new players in my casino so that they can be rated.
- As a **Casino Admin**, I need to view and update player profiles so that contact information stays current.

## 4. Scope & Feature List

### In Scope (MVP)

**PlayerService**
- `GET /api/v1/players` - List/search players (paginated, name filter)
- `POST /api/v1/players` - Create player profile (idempotent)
- `GET /api/v1/players/[id]` - Get player by ID
- `PATCH /api/v1/players/[id]` - Update player profile (idempotent)
- `POST /api/v1/players/[id]/enroll` - Enroll player in casino (idempotent)
- `GET /api/v1/players/[id]/enrollment` - Check enrollment status

**VisitService**
- `GET /api/v1/visits` - List visits (paginated, date range, status filter)
- `POST /api/v1/visits` - Create/start visit (check-in, idempotent)
- `GET /api/v1/visits/[id]` - Get visit by ID
- `PATCH /api/v1/visits/[id]/close` - Close visit (check-out, idempotent)
- `GET /api/v1/visits/active` - Get active visit for player (if any)

**React Query Hooks**
- `usePlayerSearch(query)` - Debounced player name search
- `usePlayer(playerId)` - Player detail
- `usePlayerEnrollment(playerId)` - Enrollment status
- `useEnrollPlayer()` - Enrollment mutation
- `useActiveVisit(playerId)` - Current active visit (if any)
- `useStartVisit()` - Check-in mutation
- `useCloseVisit()` - Check-out mutation
- `useVisits(filters)` - Visit list

**Service Layer**
- `createPlayerService(supabase)` - Functional factory with typed interface
- `createVisitService(supabase)` - Functional factory with typed interface

**DTOs**
- `PlayerDTO` - Profile fields (id, first_name, last_name, birth_date)
- `PlayerEnrollmentDTO` - Enrollment status (player_id, casino_id, status, enrolled_at)
- `PlayerSearchResultDTO` - Search hit (id, full_name, enrollment_status)
- `VisitDTO` - Visit record (id, player_id, casino_id, started_at, ended_at)
- `ActiveVisitDTO` - Active visit check result

### Out of Scope
- Player photo or document upload
- Player merge/deduplication
- Visit duration alerts or auto-close
- Visit notes or annotations
- Player suspension or ban management

## 5. Requirements

### 5.1 Functional Requirements
- Player search returns results matching partial name (case-insensitive, min 2 characters)
- Player enrollment creates `player_casino` record with `casino_id` from RLS context
- Player can only have ONE active visit per casino at a time
- Starting a visit for a player with active visit returns existing visit (idempotent)
- Closing a visit sets `ended_at` timestamp
- All mutations require `Idempotency-Key` header
- All responses use `ServiceResult<T>` envelope

### 5.2 Non-Functional Requirements
- Player search returns in < 200ms p95 (for up to 10k players)
- Visit check-in/out completes in < 100ms p95
- RLS policies prevent cross-casino data access
- Domain errors returned (no Postgres error code leaks)
- Enrollment is scoped to authenticated staff's casino

> Architecture details: See SRM §814-888, SLAD v2.1.2, MVP-ROADMAP §1.2-1.3

## 6. UX / Flow Overview

**Flow 1: Player Check-In (Primary Pit Boss Workflow)**
1. Pit Boss opens "New Rating" or "Check-In" action
2. Pit Boss searches for player by typing name (debounced, min 2 chars)
3. Search results display with enrollment status badges
4. If player not enrolled → Admin can enroll first
5. Pit Boss selects player, triggers `POST /api/v1/visits` (check-in)
6. If active visit exists → return existing visit (no error, idempotent)
7. UI displays active visit indicator, ready for rating slip creation

**Flow 2: Player Check-Out**
1. Pit Boss views active visits panel (or player detail)
2. Pit Boss clicks "Check Out" action for a visit
3. UI calls `PATCH /api/v1/visits/[id]/close` with `Idempotency-Key`
4. Visit marked as closed (`ended_at` set), audit logged
5. UI updates to show visit history instead of active status

**Flow 3: New Player Enrollment**
1. Casino Admin opens player management
2. Admin creates new player via `POST /api/v1/players`
3. Admin enrolls player via `POST /api/v1/players/[id]/enroll`
4. Player now appears in pit boss search with "enrolled" badge

## 7. Dependencies & Risks

### 7.1 Dependencies
- **PRD-HZ-001** (Phase 0): `withServerAction` middleware deployed (✅ COMPLETE)
- **PRD-000**: CasinoService deployed with RLS context (✅ COMPLETE)
- **Schema**: `player`, `player_casino`, `visit` tables exist (✅ VERIFIED)
- **ServiceResult<T>** pattern available (✅ COMPLETE)

### 7.2 Risks & Open Questions
- **Player deduplication**: Same person enrolled at multiple casinos may have multiple `player` records → Accept for MVP, track as post-MVP enhancement
- **Concurrent visits**: UI must prevent accidental double check-in → Mitigate with active visit check and idempotent check-in
- **Visit without check-out**: Players may leave without explicit check-out → Accept for MVP, add auto-close job in post-MVP
- **Name search performance**: Large player bases may slow search → Index `first_name`, `last_name` with trigram extension if needed

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Player CRUD routes deployed at `app/api/v1/players/`
- [ ] Visit routes deployed at `app/api/v1/visits/`
- [ ] Player search returns matches for partial name input
- [ ] Check-in creates visit if none active, returns existing if active
- [ ] Check-out sets `ended_at` on visit record
- [ ] Enrollment creates `player_casino` record with correct `casino_id`

**Data & Integrity**
- [ ] No duplicate active visits per player per casino
- [ ] Enrollment scoped to RLS casino context
- [ ] Idempotency prevents duplicate player/visit creation
- [ ] Visits correctly reference player and casino FKs

**Security & Access**
- [ ] RLS prevents cross-casino player access
- [ ] Only enrolled players visible in search results (per casino)
- [ ] No Postgres error codes leak to API responses
- [ ] Admin role required for player creation

**Testing**
- [ ] Integration test: Player search returns correct results
- [ ] Integration test: Enrollment creates `player_casino` record
- [ ] Integration test: Check-in creates visit, check-out closes it
- [ ] Integration test: Concurrent check-in returns existing visit
- [ ] Unit tests for service layer validation

**Operational Readiness**
- [ ] All mutations logged to `audit_log` with `correlation_id`
- [ ] Errors return domain error codes (PLAYER_NOT_FOUND, VISIT_NOT_OPEN, etc.)
- [ ] Request tracing via `x-request-id` header

**Documentation**
- [ ] `services/player/README.md` created with API reference
- [ ] `services/visit/README.md` created with API reference
- [ ] SRM §814-888 verified accurate
- [ ] React Query keys documentation updated

## 9. Related Documents
- **Vision / Strategy**: [VIS-001-VISION-AND-SCOPE.md](../00-vision/VIS-001-VISION-AND-SCOPE.md)
- **Architecture / SRM**: [SERVICE_RESPONSIBILITY_MATRIX.md](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md) §814-888
- **MVP Roadmap**: [MVP-ROADMAP.md](../20-architecture/MVP-ROADMAP.md) §1.2-1.3
- **Service Layer (SLAD)**: [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
- **Service Template**: [SERVICE_TEMPLATE.md](../70-governance/SERVICE_TEMPLATE.md)
- **Schema / Types**: `types/database.types.ts`
- **Security / RLS**: [SEC-001-rls-policy-matrix.md](../30-security/SEC-001-rls-policy-matrix.md)
- **Horizontal Infrastructure**: [PRD-HZ-001](./PRD-HZ-001-gate0-horizontal-infrastructure.md) (Phase 0 prerequisite)
- **Casino Foundation**: [PRD-000](./PRD-000-casino-foundation.md) (CasinoService prerequisite)
- **Edge Transport Policy**: [EDGE_TRANSPORT_POLICY.md](../20-architecture/EDGE_TRANSPORT_POLICY.md)
- **QA Standards**: [QA-001-service-testing-strategy.md](../40-quality/QA-001-service-testing-strategy.md)

---

## Appendix A: Schema Reference

### Player Tables (Existing)

```sql
-- From database.types.ts (verified)
create table player (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date,
  created_at timestamptz not null default now()
);

create table player_casino (
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  status text not null default 'active',
  enrolled_at timestamptz not null default now(),
  primary key (player_id, casino_id)
);
```

### Visit Table (Existing)

```sql
-- From database.types.ts (verified)
create table visit (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
```

### Required RLS Policies (New)

```sql
-- Player: Read enrolled players for same casino
CREATE POLICY player_read_enrolled ON player
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = current_setting('app.casino_id', true)::uuid
    )
  );

-- Player: Admin can create new players
CREATE POLICY player_insert ON player
  FOR INSERT WITH CHECK (
    current_setting('app.staff_role', true) = 'admin'
  );

-- Player: Admin can update players enrolled in their casino
CREATE POLICY player_update ON player
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = current_setting('app.casino_id', true)::uuid
    )
    AND current_setting('app.staff_role', true) = 'admin'
  );

-- player_casino: Read enrollments for same casino
CREATE POLICY player_casino_read ON player_casino
  FOR SELECT USING (
    casino_id = current_setting('app.casino_id', true)::uuid
  );

-- player_casino: Pit boss/admin can enroll players
CREATE POLICY player_casino_insert ON player_casino
  FOR INSERT WITH CHECK (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
  );

-- Visit: Read visits for same casino
CREATE POLICY visit_read ON visit
  FOR SELECT USING (
    casino_id = current_setting('app.casino_id', true)::uuid
  );

-- Visit: Pit boss/admin can create visits
CREATE POLICY visit_insert ON visit
  FOR INSERT WITH CHECK (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
  );

-- Visit: Pit boss/admin can close visits (update ended_at only)
CREATE POLICY visit_update ON visit
  FOR UPDATE USING (
    casino_id = current_setting('app.casino_id', true)::uuid
    AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
  );
```

### Required Indexes (New)

```sql
-- Player name search (for fuzzy matching)
CREATE INDEX IF NOT EXISTS ix_player_name_search
  ON player USING gin (
    (lower(first_name) || ' ' || lower(last_name)) gin_trgm_ops
  );

-- Player by name (standard)
CREATE INDEX IF NOT EXISTS ix_player_names
  ON player (lower(first_name), lower(last_name));

-- player_casino by casino
CREATE INDEX IF NOT EXISTS ix_player_casino_casino
  ON player_casino (casino_id);

-- Visit by player (for active visit lookup)
CREATE INDEX IF NOT EXISTS ix_visit_player_active
  ON visit (player_id, casino_id)
  WHERE ended_at IS NULL;

-- Visit by casino and date
CREATE INDEX IF NOT EXISTS ix_visit_casino_date
  ON visit (casino_id, started_at DESC);
```

---

## Appendix B: Implementation Plan

### WS1: Database Layer (P0) - Day 1

**Migration: `YYYYMMDDHHMMSS_prd003_player_visit_rls.sql`**

1. Add RLS policies for `player`, `player_casino`, `visit`
2. Add search indexes for player name
3. Add active visit index

### WS2: Service Layer (P0) - Day 2

**PlayerService (`services/player/index.ts`)**

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// DTO types
export interface PlayerDTO {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  created_at: string;
}

export interface PlayerEnrollmentDTO {
  player_id: string;
  casino_id: string;
  status: string;
  enrolled_at: string;
}

export interface PlayerSearchResultDTO {
  id: string;
  full_name: string;
  enrollment_status: 'enrolled' | 'not_enrolled';
}

export interface PlayerServiceInterface {
  search(query: string, limit?: number): Promise<PlayerSearchResultDTO[]>;
  getById(playerId: string): Promise<PlayerDTO | null>;
  create(data: { first_name: string; last_name: string; birth_date?: string }): Promise<PlayerDTO>;
  update(playerId: string, data: Partial<Pick<PlayerDTO, 'first_name' | 'last_name' | 'birth_date'>>): Promise<PlayerDTO>;
  enroll(playerId: string): Promise<PlayerEnrollmentDTO>;
  getEnrollment(playerId: string): Promise<PlayerEnrollmentDTO | null>;
}

export function createPlayerService(
  supabase: SupabaseClient<Database>
): PlayerServiceInterface {
  return {
    async search(query, limit = 20) {
      // Implementation with name matching
    },
    async getById(playerId) {
      // Implementation
    },
    async create(data) {
      // Implementation
    },
    async update(playerId, data) {
      // Implementation
    },
    async enroll(playerId) {
      // Implementation - gets casino_id from RLS context
    },
    async getEnrollment(playerId) {
      // Implementation
    },
  };
}
```

**VisitService (`services/visit/index.ts`)**

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// DTO types
export interface VisitDTO {
  id: string;
  player_id: string;
  casino_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface VisitServiceInterface {
  list(filters: { status?: 'active' | 'closed'; limit?: number; cursor?: string }): Promise<VisitDTO[]>;
  getById(visitId: string): Promise<VisitDTO | null>;
  getActiveForPlayer(playerId: string): Promise<VisitDTO | null>;
  startVisit(playerId: string): Promise<VisitDTO>;
  closeVisit(visitId: string): Promise<VisitDTO>;
}

export function createVisitService(
  supabase: SupabaseClient<Database>
): VisitServiceInterface {
  return {
    async list(filters) {
      // Implementation
    },
    async getById(visitId) {
      // Implementation
    },
    async getActiveForPlayer(playerId) {
      // Query visits where ended_at IS NULL
    },
    async startVisit(playerId) {
      // Check for active visit first, create if none exists
    },
    async closeVisit(visitId) {
      // Set ended_at = now()
    },
  };
}
```

### WS3: Route Handlers (P0) - Day 3-4

**Directory Structure**
```
app/api/v1/players/
├── route.ts                    # GET (list/search), POST (create)
├── [id]/
│   ├── route.ts                # GET (detail), PATCH (update)
│   ├── enroll/
│   │   └── route.ts            # POST (enroll in casino)
│   └── enrollment/
│       └── route.ts            # GET (enrollment status)

app/api/v1/visits/
├── route.ts                    # GET (list), POST (start/check-in)
├── active/
│   └── route.ts                # GET (active visit for player)
├── [id]/
│   ├── route.ts                # GET (detail)
│   └── close/
│       └── route.ts            # PATCH (close/check-out)
```

### WS4: React Query Hooks (P1) - Day 4

**`services/player/keys.ts`**
```typescript
const ROOT = ['player'] as const;

export const playerKeys = {
  root: ROOT,
  search: (query: string) => [...ROOT, 'search', query] as const,
  detail: (playerId: string) => [...ROOT, 'detail', playerId] as const,
  enrollment: (playerId: string) => [...ROOT, 'enrollment', playerId] as const,
};
```

**`services/visit/keys.ts`**
```typescript
const ROOT = ['visit'] as const;

export const visitKeys = {
  root: ROOT,
  list: (filters: object) => [...ROOT, 'list', filters] as const,
  detail: (visitId: string) => [...ROOT, 'detail', visitId] as const,
  active: (playerId: string) => [...ROOT, 'active', playerId] as const,
};
```

**`hooks/player/use-player-search.ts`**
```typescript
import { useQuery } from '@tanstack/react-query';
import { playerKeys } from '@/services/player/keys';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

export function usePlayerSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query, 300);

  return useQuery({
    queryKey: playerKeys.search(debouncedQuery),
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];
      const res = await fetch(`/api/v1/players?q=${encodeURIComponent(debouncedQuery)}`);
      const json = await res.json();
      return json.data;
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000, // 5m (warm tier)
  });
}
```

### WS5: Testing (P1) - Day 5

**Integration Tests**

- Player search returns enrolled players only
- Player enrollment creates `player_casino` record
- Check-in creates visit with correct FKs
- Duplicate check-in returns existing visit
- Check-out sets `ended_at`
- RLS prevents cross-casino access

### WS6: Documentation (P2) - Day 5

- `services/player/README.md`
- `services/visit/README.md`
- Update MVP-ROADMAP progress

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**Player Domain**
- `PLAYER_NOT_FOUND` (404)
- `PLAYER_ALREADY_EXISTS` (409)
- `PLAYER_NOT_ENROLLED` (404)
- `PLAYER_ENROLLMENT_DUPLICATE` (409)

**Visit Domain**
- `VISIT_NOT_FOUND` (404)
- `VISIT_NOT_OPEN` (409)
- `VISIT_ALREADY_CLOSED` (409)

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-29 | Lead Architect | Initial draft - PlayerService and VisitService for Phase 1 GATE-1 |

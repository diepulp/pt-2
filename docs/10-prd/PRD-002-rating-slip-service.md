# PRD-002 — Rating Slip Service

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Approved
- **Created:** 2025-12-07
- **Summary:** Implement RatingSlipService to manage gameplay telemetry for rated sessions at gaming tables. This service enables pit staff to start, pause, resume, and close rating slips that track player activity (average bet, duration, seat position). RatingSlipService is a GATE-2 blocker required by Pit Dashboard (PRD-006) and provides telemetry data consumed by LoyaltyService for point accrual. The previous implementation was removed (2025-12-02) due to architectural non-compliance; this PRD defines a clean rebuild following Pattern B architecture.

## 2. Problem & Goals

### 2.1 Problem

PT-2 needs to track gameplay activity for player rating and loyalty accrual. Without RatingSlipService:
- No way to capture how long a player is actively playing
- No record of average bet for theoretical calculations
- No pause/resume capability for player breaks (meal, restroom)
- No accurate duration calculation excluding paused time
- No foundation for mid-session rewards or loyalty accrual

The previous implementation was removed (2025-12-02) due to architectural issues:
- Did not follow Pattern B structure
- Had `as` type assertions violating type safety
- Missing proper Row→DTO mappers
- Tests not in `__tests__/` subdirectory

### 2.2 Goals

1. **Slip lifecycle management**: Start, pause, resume, and close rating slips with state machine enforcement
2. **Accurate duration tracking**: Calculate active play time excluding paused intervals
3. **Visit anchoring**: All slips tied to a visit (identified or ghost) per EXEC-VSE-001
4. **Mid-session reward eligibility**: Provide telemetry for LoyaltyService via `visit_kind` filtering
5. **Pattern B compliance**: Service follows SLAD §308-350 with selects.ts, mappers.ts, crud.ts

### 2.3 Non-Goals

- Reward/points calculation (LoyaltyService scope)
- Financial transaction recording (PlayerFinancialService scope)
- Table open/close operations (TableContextService scope per PRD-007)
- Real-time subscriptions (PRD-006 Pit Dashboard scope)
- Historical slip analytics/reporting (Post-MVP)
- Player identity lookup (derived from visit.player_id per SRM invariant)

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor (via API/UI)
- **System consumers:** LoyaltyService, MTLService, Pit Dashboard, TableContextService

**Top Jobs:**

1. As a **Pit Boss**, I need to start a rating slip when a player sits down at my table so that their play is tracked for loyalty rewards.

2. As a **Pit Boss**, I need to pause a rating slip when a player takes a break so that non-play time isn't counted toward their session.

3. As a **Pit Boss**, I need to resume a paused rating slip when the player returns so that their active time tracking continues.

4. As a **Pit Boss**, I need to close a rating slip with an average bet amount when the player leaves so that their session data is finalized for rating.

5. As a **Floor Supervisor**, I need to view active slips at a table so that I can monitor ongoing sessions and player activity.

6. As the **Pit Dashboard**, I need to query open/paused slips for a table so that I can display active sessions and their elapsed times.

7. As **LoyaltyService**, I need to query slip telemetry for visits with `visit_kind = 'gaming_identified_rated'` so that I can issue mid-session rewards.

8. As **TableContextService**, I need to check if a table has open rating slips so that I can enforce the "no deactivation with open slips" invariant (bounded context compliant query).

## 4. Scope & Feature List

**P0 (Must-Have)**
- Start rating slip: Create slip tied to visit + table + seat
- Pause rating slip: Record pause interval, update status to `paused`
- Resume rating slip: Close pause interval, update status to `open`
- Close rating slip: Set end_time, calculate active duration, update status to `closed`
- Get slip by ID with pause history
- List slips for a table (all statuses)
- Get active slips for a table (open/paused only)
- Calculate duration excluding pause intervals (via RPC)
- Query key factory for React Query hooks
- **Published query: `hasOpenSlipsForTable()`** - Cross-context query for TableContextService (PRD-007)

**P1 (Should-Have)**
- List slips for a visit (player session)
- Update average bet on open slip
- Bulk close slips for end-of-table operation
- Get current pause duration (if paused)
- Slip history/audit trail query



## 5. Requirements

### 5.1 Functional Requirements

- Slip status transitions enforced:
  - Creation → `open` (only valid initial state)
  - `open` → `paused` (via pause)
  - `paused` → `open` (via resume)
  - `open` → `closed` (via close)
  - `paused` → `closed` (via close, auto-ends active pause)
  - `closed` is terminal (no transitions out)
- Pause tracking:
  - Only one active pause per slip (ended_at IS NULL)
  - Pausing creates new `rating_slip_pause` record
  - Resuming sets ended_at on current pause
  - Closing auto-ends active pause if present
- Duration calculation:
  - `duration_seconds = (end_time - start_time) - SUM(pause_intervals)`
  - Server-authoritative via `rpc_get_rating_slip_duration` and `rpc_close_rating_slip`
- Unique constraint: Only one open/paused slip per player per table
- Visit anchoring: `visit_id` is NOT NULL (ghost visits provide anchor per EXEC-VSE-001)
- Table anchoring: `table_id` is NOT NULL
- Player identity: Derived from `visit.player_id` (rating_slip has NO player_id column)
- Loyalty eligibility: LoyaltyService filters by `visit.visit_kind = 'gaming_identified_rated'`

### 5.2 Non-Functional Requirements

- p95 mutation latency < 300ms
- All RPCs use row-level locking to prevent race conditions
- RLS policies enforce casino scoping via `current_setting('app.casino_id')`

### 5.3 Architectural Requirements (SLAD §308-350)

**Service Structure (Pattern B with mappers.ts)**:
```
services/rating-slip/
├── __tests__/                    # Per ADR-002
│   └── rating-slip.service.test.ts
├── dtos.ts                       # Pick/Omit from Database types
├── schemas.ts                    # Zod validation (ADR-013)
├── selects.ts                    # Named column projections
├── mappers.ts                    # Row→DTO transformers (REQUIRED)
├── crud.ts                       # Database operations
├── queries.ts                    # Published queries for cross-context consumption
├── index.ts                      # Service factory
├── keys.ts                       # React Query key factories
├── http.ts                       # HTTP fetchers
└── README.md
```

**Published Queries (`queries.ts`)** - Cross-Context Consumption:

Per SLAD Bounded Context DTO Access Rules, other services MUST NOT directly query `rating_slip` table. RatingSlipService publishes these queries for cross-context consumption:

```typescript
// services/rating-slip/queries.ts

/**
 * Check if a table has any open (unsettled) rating slips.
 * Published query for cross-context consumption by TableContextService.
 *
 * Used by: TableContextService.deactivateTable() to enforce
 * "no deactivation with open slips" invariant.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID (RLS scoping)
 * @returns true if any open/paused slips exist for this table
 */
export async function hasOpenSlipsForTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string
): Promise<boolean>;
```

**Error Handling (ADR-012)**:
- Service throws `DomainError` on failure
- Domain error codes:
  - `RATING_SLIP_NOT_FOUND`
  - `RATING_SLIP_NOT_OPEN` (cannot pause)
  - `RATING_SLIP_NOT_PAUSED` (cannot resume)
  - `RATING_SLIP_INVALID_STATE` (cannot close)
  - `RATING_SLIP_DUPLICATE` (unique constraint violation)
  - `VISIT_NOT_OPEN` (visit ended_at IS NOT NULL)
  - `TABLE_NOT_ACTIVE` (table status != 'active')

**Type Safety**:
- Zero `as` type assertions
- All Row→DTO via mappers.ts
- RPC responses validated via generated types

> Architecture details live in SLAD and SRM. This PRD does not duplicate them.

## 6. UX / Flow Overview

**API Flow (no UI in this PRD)**:

```
Start Rating Slip:
  POST /api/v1/rating-slips
  Body: { visit_id, table_id, seat_number?, game_settings? }
  → Returns: RatingSlipDTO with status=open
  → Error 409: RATING_SLIP_DUPLICATE if open slip exists for player at table
  → Error 400: VISIT_NOT_OPEN if visit ended
  → Error 400: TABLE_NOT_ACTIVE if table not active

Pause Rating Slip:
  POST /api/v1/rating-slips/{slipId}/pause
  → Returns: RatingSlipDTO with status=paused
  → Error 409: RATING_SLIP_NOT_OPEN if already paused or closed

Resume Rating Slip:
  POST /api/v1/rating-slips/{slipId}/resume
  → Returns: RatingSlipDTO with status=open
  → Error 409: RATING_SLIP_NOT_PAUSED if open or closed

Close Rating Slip:
  POST /api/v1/rating-slips/{slipId}/close
  Body: { average_bet? }
  → Returns: RatingSlipWithDurationDTO (includes duration_seconds)
  → Error 409: RATING_SLIP_INVALID_STATE if already closed

Get Rating Slip:
  GET /api/v1/rating-slips/{slipId}
  → Returns: RatingSlipWithPausesDTO (includes pause history)

List Slips for Table:
  GET /api/v1/rating-slips?table_id=X&status=open|paused|closed
  → Returns: RatingSlipDTO[]

List Slips for Visit:
  GET /api/v1/rating-slips?visit_id=X
  → Returns: RatingSlipDTO[]

Get Slip Duration:
  GET /api/v1/rating-slips/{slipId}/duration
  → Returns: { duration_seconds }
```

**State Machine**:
```
       ┌─────────┐
       │ (start) │
       └────┬────┘
            │
            ▼
       ┌─────────┐  pause   ┌─────────┐
       │  open   │─────────▶│ paused  │
       │         │◀─────────│         │
       └────┬────┘  resume  └────┬────┘
            │                    │
            │ close              │ close
            │                    │
            ▼                    ▼
       ┌───────────────────────────┐
       │         closed            │
       └───────────────────────────┘
```

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| CasinoService (PRD-000) | COMPLETE | RLS context, casino_id |
| VisitService (PRD-003) | COMPLETE | Visit anchor, visit_kind filtering |
| TableContextService (PRD-007) | PENDING | Table validation (graceful if missing) |
| `rating_slip` table | EXISTS | Core table with status enum |
| `rating_slip_pause` table | EXISTS | Via migration 20251128221408 |
| RPCs | EXISTS | `rpc_start_rating_slip`, `rpc_pause_rating_slip`, `rpc_resume_rating_slip`, `rpc_close_rating_slip`, `rpc_get_rating_slip_duration` |
| Horizontal infrastructure | COMPLETE | withServerAction, ServiceResult, DomainError |

**Consumed By** (cross-context queries):

| Consumer | Query | Purpose |
|----------|-------|---------|
| TableContextService (PRD-007) | `hasOpenSlipsForTable()` | Gate table deactivation if open slips exist |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Concurrent pause/resume race | RPCs use FOR UPDATE locking |
| Orphaned pauses on slip close | `rpc_close_rating_slip` auto-ends active pause |
| Table validation dependency | Graceful degradation if TableContextService not yet implemented |
| Deprecated player_id column | DO NOT use - derive from visit.player_id |

**Open Questions:**
1. Should we allow updating seat_number after slip creation? → **Recommendation:** No, seat is immutable to maintain accurate position tracking
2. Should closing require an average_bet? → **Recommendation:** No, allow NULL for quick closes; average_bet can be updated before close

**SRM Invariant Check (CRITICAL)**:
- ✅ `rating_slip.visit_id`: NOT NULL (hardened in migration 20251205000004)
- ✅ `rating_slip.table_id`: NOT NULL (hardened in migration 20251205000004)
- ✅ `rating_slip.casino_id`: NOT NULL, immutable
- ✅ `rating_slip.start_time`: NOT NULL, immutable
- ✅ Player identity via `visit.player_id` - NO player_id on rating_slip (SRM v4.0.0 invariant)
- ⚠️ Deprecated `player_id` column exists in schema - service MUST NOT use it; column to be dropped in future migration

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Start rating slip creates slip with status=open
- [ ] Pause rating slip transitions open→paused, creates pause record
- [ ] Resume rating slip transitions paused→open, closes pause record
- [ ] Close rating slip transitions to closed, returns duration_seconds
- [ ] Duration calculation excludes paused intervals
- [ ] Unique constraint prevents duplicate open slips per player/table

**Data & Integrity**
- [ ] State machine enforced (no invalid transitions)
- [ ] Single active pause per slip
- [ ] No orphaned pauses after slip close
- [ ] visit_id and table_id NOT NULL enforced

**Security & Access**
- [ ] RLS: Staff can only access slips for their casino
- [ ] All mutations require authenticated session
- [ ] Audit log entries for start/pause/resume/close operations

**Architecture Compliance**
- [ ] Pattern B structure: dtos.ts, schemas.ts, selects.ts, mappers.ts, crud.ts, queries.ts, index.ts
- [ ] Zero `as` type assertions
- [ ] Tests in `__tests__/` subdirectory (ADR-002)
- [ ] DomainError thrown on failures (ADR-012)
- [ ] Player identity derived from visit.player_id (NO direct player_id)
- [ ] Published query `hasOpenSlipsForTable()` exported for TableContextService

**Testing**
- [ ] Unit tests for state machine transitions
- [ ] Unit tests for pause/resume logic
- [ ] Unit tests for duration calculation
- [ ] Integration test: full slip lifecycle (start → pause → resume → close)
- [ ] Integration test: concurrent pause prevention
- [ ] Integration test: unique constraint on open slips

**Documentation**
- [ ] Service README with supported operations
- [ ] DTOs documented with JSDoc
- [ ] Error codes documented

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (§RatingSlipService)
- **Service Layer (SLAD):** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` §308-350
- **DTO Standard:** `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **Error Handling:** `docs/80-adrs/ADR-012-error-handling-layers.md`
- **Test Location:** `docs/80-adrs/ADR-002-test-location-standard.md`
- **Zod Schemas:** `docs/80-adrs/ADR-013-zod-validation-schemas.md`
- **Visit Archetypes:** `docs/80-adrs/ADR-014-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md`
- **Schema / Types:** `types/database.types.ts` (rating_slip, rating_slip_pause)
- **Pause Tracking Migration:** `supabase/migrations/20251128221408_rating_slip_pause_tracking.sql`
- **NOT NULL Migration:** `supabase/migrations/20251205000004_rating_slip_not_null_constraints.sql`
- **RLS Policy Matrix:** `docs/30-security/SEC-001-rls-policy-matrix.md`
- **MVP Roadmap:** `docs/20-architecture/MVP-ROADMAP.md` (Phase 2)
- **Pit Dashboard (Consumer):** `docs/10-prd/PRD-006-pit-dashboard.md`
- **Table Context (Related):** `docs/10-prd/PRD-007-table-context-service.md`
- **Loyalty (Consumer):** `docs/10-prd/PRD-004-mid-session-loyalty.md`

---

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2025-12-07 | Lead Architect | Added `hasOpenSlipsForTable()` published query for TableContextService cross-context consumption (SLAD bounded context compliance) |
| 1.0 | 2025-12-07 | Lead Architect | Initial draft (clean rebuild per Pattern B) |

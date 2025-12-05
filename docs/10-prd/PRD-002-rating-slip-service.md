# PRD-002 — Rating Slip Service

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Created:** 2025-12-03
- **Supersedes:** PRD-002-table-rating-core.md (archived)
- **Summary:** Implement RatingSlipService to track player gameplay sessions at gaming tables. Rating slips capture session duration, average bet, and seat position—the foundational telemetry for loyalty accrual and compliance reporting. This PRD covers the service layer only; UI is handled by PRD-006.

## 2. Problem & Goals

### 2.1 Problem

PT-2 needs to track player gameplay sessions with accurate time measurement. Without RatingSlipService:
- No way to record when players start/stop playing
- No pause tracking for breaks (inflated session times)
- No telemetry for downstream loyalty point calculation
- No audit trail for compliance reporting

The previous implementation was removed (2025-12-02) due to architectural non-compliance. This PRD defines a clean rebuild following Pattern B architecture.

### 2.2 Goals

1. **Accurate duration tracking**: Session time calculated server-side, excluding paused intervals
2. **State machine enforcement**: Slip transitions follow `open` → `paused` ↔ `open` → `closed` (no invalid states)
3. **Single active slip per player-table**: Database constraint prevents duplicate active slips
4. **Telemetry capture**: Average bet, seat number, and game settings recorded at slip creation
5. **Pattern B compliance**: Service follows SLAD §308-350 with selects.ts, mappers.ts, crud.ts

### 2.3 Non-Goals

- Loyalty point calculation (PRD-004 LoyaltyService)
- Table open/close operations (separate TableContextService PRD)
- UI components (PRD-006 Pit Dashboard)
- Real-time subscriptions (PRD-006 scope)
- Historical reporting or analytics

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor (via API/UI)
- **System consumers:** LoyaltyService, MTLService, Compliance reporting

**Top Jobs:**

1. As a **Pit Boss**, I need to start a rating slip when a player sits down so that their session time begins accruing.

2. As a **Pit Boss**, I need to pause a rating slip when a player takes a break so that break time doesn't count toward their session.

3. As a **Pit Boss**, I need to resume a paused slip when a player returns so that time tracking continues accurately.

4. As a **Pit Boss**, I need to close a rating slip when a player leaves so that the session is finalized with accurate duration.

5. As **LoyaltyService**, I need to read slip telemetry (duration, average bet) so that loyalty points can be calculated correctly.

## 4. Scope & Feature List

**P0 (Must-Have)**
- Start slip: Create new slip with `status=open`, `start_time=now()`
- Pause slip: Record pause start in `rating_slip_pause` table
- Resume slip: Record pause end, slip returns to `open`
- Close slip: Set `end_time`, `status=closed`, calculate final duration
- Get slip by ID with calculated duration
- List slips by visit/player/table with filters
- Prevent duplicate active slips (same player + table)

**P1 (Should-Have)**
- Get active slips for a table (dashboard query)
- Bulk close slips for a table (table closure scenario)

**P2 (Nice-to-Have)**
- Archive slip (soft delete for retention)

## 5. Requirements

### 5.1 Functional Requirements

- Slip requires: `player_id`, `visit_id`, `table_id`, `casino_id`, `seat_number`
- Slip captures `game_settings` snapshot at creation (from table settings)
- Status transitions enforced:
  - `open` → `paused` (via pause)
  - `paused` → `open` (via resume)
  - `open` → `closed` (via close)
  - `paused` → `closed` (via close, ends active pause)
- Duration calculation: `end_time - start_time - SUM(pause_intervals)`
- Single active slip constraint: `UNIQUE(player_id, table_id) WHERE status IN ('open', 'paused')`

### 5.2 Non-Functional Requirements

- p95 mutation latency < 300ms
- Duration calculation accurate to the second
- All mutations idempotent (idempotency key support)

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
├── index.ts                      # Service factory
├── keys.ts                       # React Query key factories
├── http.ts                       # HTTP fetchers
└── README.md
```

**Error Handling (ADR-012)**:
- Service throws `DomainError` on failure
- Domain error codes: `RATING_SLIP_NOT_FOUND`, `RATING_SLIP_NOT_OPEN`, `RATING_SLIP_NOT_PAUSED`, `RATING_SLIP_ALREADY_CLOSED`, `RATING_SLIP_DUPLICATE_ACTIVE`

**Type Safety**:
- Zero `as` type assertions
- All Row→DTO via mappers.ts
- RPC responses validated via generated types

> Architecture details live in SLAD and SRM. This PRD does not duplicate them.

## 6. UX / Flow Overview

**API Flow (no UI in this PRD)**:

```
Start Slip:
  POST /api/v1/rating-slips
  Body: { player_id, visit_id, table_id, seat_number, game_settings_id? }
  → Returns: RatingSlipDTO with status=open

Pause Slip:
  POST /api/v1/rating-slips/{id}/pause
  → Returns: RatingSlipDTO with status=paused

Resume Slip:
  POST /api/v1/rating-slips/{id}/resume
  → Returns: RatingSlipDTO with status=open

Close Slip:
  POST /api/v1/rating-slips/{id}/close
  Body: { average_bet? }
  → Returns: RatingSlipDTO with status=closed, duration_seconds

Get Slip:
  GET /api/v1/rating-slips/{id}
  → Returns: RatingSlipDTO with calculated duration_seconds

List Slips:
  GET /api/v1/rating-slips?visit_id=X&status=open
  → Returns: RatingSlipDTO[]
```

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| CasinoService (PRD-000) | ✅ Complete | RLS context, casino_id |
| PlayerService (PRD-003) | ✅ Complete | player_id FK |
| VisitService (PRD-003) | ✅ Complete | visit_id FK (active visit required) |
| `gaming_table` table | ✅ Schema exists | table_id FK |
| `rating_slip` table | ✅ Schema exists | Core table |
| `rating_slip_pause` table | ✅ Schema exists | Pause tracking |
| Horizontal infrastructure | ✅ Complete | withServerAction, ServiceResult, DomainError |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Clock drift on pause/resume | Server timestamps only; client times are advisory |
| Orphaned pauses (never ended) | Close slip auto-ends any active pause |
| Concurrent pause/resume race | Database-level status check in transaction |

**Open Questions:**
1. Should closing a slip require the visit to still be active? → **Recommendation:** No, allow closing slips after visit checkout
2. Should `average_bet` be required on close? → **Recommendation:** Optional, can be updated later

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Start slip creates record with status=open
- [ ] Pause slip records pause start, changes status to paused
- [ ] Resume slip records pause end, changes status to open
- [ ] Close slip sets end_time, calculates duration excluding pauses
- [ ] Duplicate active slip prevented by constraint

**Data & Integrity**
- [ ] State machine enforced (no invalid transitions)
- [ ] Duration calculation excludes all pause intervals
- [ ] No orphaned pause records (close ends active pause)

**Security & Access**
- [ ] RLS: Staff can only access slips for their casino
- [ ] All mutations require authenticated session

**Architecture Compliance**
- [ ] Pattern B structure: dtos.ts, schemas.ts, selects.ts, mappers.ts, crud.ts, index.ts
- [ ] Zero `as` type assertions
- [ ] Tests in `__tests__/` subdirectory (ADR-002)
- [ ] DomainError thrown on failures (ADR-012)

**Testing**
- [ ] Unit tests for state machine transitions
- [ ] Unit tests for duration calculation with multiple pauses
- [ ] Integration test: full lifecycle (start → pause → resume → close)

**Documentation**
- [ ] Service README with supported operations
- [ ] DTOs documented with JSDoc

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Service Layer (SLAD):** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` §308-350
- **DTO Standard:** `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- **Error Handling:** `docs/80-adrs/ADR-012-error-handling-layers.md`
- **Test Location:** `docs/80-adrs/ADR-002-test-location-standard.md`
- **Zod Schemas:** `docs/80-adrs/ADR-013-zod-validation-schemas.md`
- **Schema / Types:** `types/database.types.ts` (lines 1087-1205)
- **RLS Policy Matrix:** `docs/30-security/SEC-001-rls-policy-matrix.md`
- **MVP Roadmap:** `docs/20-architecture/MVP-ROADMAP.md` (Phase 2)
- **Pit Dashboard (UI):** `docs/10-prd/PRD-006-pit-dashboard.md`

---

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-03 | Lead Architect | Initial draft (clean rebuild) |

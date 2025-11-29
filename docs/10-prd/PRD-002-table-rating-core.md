# PRD-002 — Table & Rating Core

## 1. Overview
- **Owner:** Product
- **Status:** Draft
- **Summary:** Enable pit supervisors to open/close gaming tables and track player sessions via rating slips. This is the operational foundation for table-centric player tracking—without it, no downstream features (loyalty, compliance, finance) can function. Targets single-casino pilot readiness.

## 2. Problem & Goals

### 2.1 Problem
Pit operations currently lack a digital way to track table status and player session time. Supervisors manually log sessions on paper, leading to inaccurate time tracking, lost data, and no audit trail. This blocks any form of automated loyalty accrual or compliance monitoring.

### 2.2 Goals
- Supervisors can open/close tables and see live status on pit dashboard
- Supervisors can start, pause, resume, and close rating slips for seated players
- Session duration is server-derived and accurate (no client clock dependency)
- No overlapping active slips for same player at same table
- All state changes are auditable with actor/timestamp

### 2.3 Non-Goals
- Loyalty points calculation or reward issuance (see PRD-004)
- Chip custody tracking (fills, credits, drops)
- Floor layout design and activation workflows
- Dealer rotation logging beyond simple "current dealer" assignment
- Finance transactions or MTL compliance alerts

## 3. Users & Use Cases
- **Primary users:** Pit Boss / Floor Supervisor

**Top Jobs:**
- As a Pit Boss, I need to open a table so that players can be seated and tracked.
- As a Pit Boss, I need to start a rating slip so that player time accrues accurately.
- As a Pit Boss, I need to pause/resume a slip so that breaks don't inflate session time.
- As a Pit Boss, I need to close a slip so that the session is finalized for reporting.

## 4. Scope & Feature List

**Table Operations:**
- Open table (status: `inactive` → `active`)
- Close table (status: `active` → `closed`)
- Display table status on pit dashboard with <2s refresh

**Rating Slip Operations:**
- Start slip for seated player (creates `status=open` with `start_time`)
- Pause slip (records pause timestamp)
- Resume slip (records resume timestamp)
- Close slip (sets `end_time`, `status=closed`)
- Prevent duplicate active slips per player/table
- Display derived `duration_seconds` in UI

**Audit:**
- All mutations log `{actor_id, timestamp, action, before/after}`

## 5. Requirements

### 5.1 Functional Requirements
- Table status transitions follow state machine: `inactive` ↔ `active` → `closed`
- Rating slip status transitions: `open` ↔ `paused` → `closed`
- Duration calculation excludes paused intervals (server-derived)
- Slip requires valid `visit_id`, `gaming_table_id`, `seat_number`
- Slip captures `game_settings` snapshot at creation time

### 5.2 Non-Functional Requirements
- Pit dashboard LCP ≤ 2.5s
- State changes reflect in UI within 2s
- p95 mutation latency < 400ms

> Architecture details: see `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (TableContextService, RatingSlipService sections)

## 6. UX / Flow Overview
1. Pit Boss opens Floor View → sees table grid with status indicators
2. Selects closed table → taps "Open Table" → status updates to `active`
3. Selects player at table → taps "Start Rating" → slip panel opens
4. Player steps away → taps "Pause" → timer pauses visually
5. Player returns → taps "Resume" → timer resumes
6. Session ends → taps "Close Slip" → slip moves to history

## 7. Dependencies & Risks

### 7.1 Dependencies
- CasinoService: Staff authentication, `casino_settings` for gaming day
- PlayerService: Player identity for slip FK
- VisitService: Active visit required before starting slip
- Schema: `gaming_table`, `gaming_table_settings`, `rating_slip` tables exist

### 7.2 Risks & Open Questions
- **Risk:** RLS complexity for cross-table queries — Mitigate with per-role integration tests
- **Risk:** Clock drift on pause/resume — Server timestamps only; client advisory
- **Open:** Should closing a table auto-close active slips? — Decision needed before impl

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Pit Boss can open/close tables via dashboard
- [ ] Pit Boss can start/pause/resume/close rating slips
- [ ] No duplicate active slips allowed (constraint enforced)
- [ ] Duration displayed correctly after pause/resume cycles

**Data & Integrity**
- [ ] Table state machine enforced (no invalid transitions)
- [ ] Slip state machine enforced (no invalid transitions)
- [ ] No orphaned slips (all have valid visit/table FKs)

**Security & Access**
- [ ] RLS: pit_boss can only see/modify own casino's tables/slips
- [ ] RLS: dealer role cannot modify slips (if applicable)

**Testing**
- [ ] Unit tests for state machine transitions
- [ ] Integration test: full slip lifecycle with RLS enabled
- [ ] One E2E test: open table → start slip → pause → resume → close

**Operational Readiness**
- [ ] Structured logs for table/slip state changes
- [ ] Error states visible in UI (not silent failures)

**Documentation**
- [ ] Service README updated with supported operations
- [ ] Known limitations documented (e.g., no bulk operations)

## 9. Related Documents
- Vision / Strategy: `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- Architecture / SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- Schema / Types: `types/database.types.ts`
- QA Standards: `docs/40-quality/QA-001-service-testing-strategy.md`
- Service READMEs: `services/table-context/README.md`, `services/rating-slip/README.md`

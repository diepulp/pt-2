# PRD-003 — Player Intake & Visit

## 1. Overview
- **Owner:** Product
- **Status:** Draft
- **Summary:** Enable staff to enroll players and manage visit sessions (check-in/check-out). Visits are the session container that groups all player activity within a gaming day—rating slips, rewards, and financial transactions all hang off a visit. Without visits, there's no way to scope player activity to a session.

## 2. Problem & Goals

### 2.1 Problem
Players arrive at the casino but there's no digital record of their presence or session boundaries. Staff can't distinguish between a player's first visit and their tenth, can't track which gaming day activity belongs to, and can't aggregate session-level metrics for loyalty or compliance purposes.

### 2.2 Goals
- Staff can enroll new players with required identity fields
- Staff can start a visit (check-in) for an enrolled player
- Staff can end a visit (check-out) to finalize the session
- One active visit per player per casino per gaming day (no duplicates)
- Visit provides session context for downstream features (slips, rewards, MTL)

### 2.3 Non-Goals
- Player self-service enrollment or check-in (staff-operated only)
- Multi-casino player federation or cross-property visits
- Player marketing, segmentation, or campaign targeting
- PII export or GDPR-related data operations
- Loyalty tier display (see PRD-004)

## 3. Users & Use Cases
- **Primary users:** Pit Boss / Floor Supervisor

**Top Jobs:**
- As a Pit Boss, I need to enroll a new player so they exist in the system for tracking.
- As a Pit Boss, I need to check in a player so their visit session begins.
- As a Pit Boss, I need to check out a player so their session is finalized.
- As a Pit Boss, I need to see if a player already has an active visit so I don't create duplicates.

## 4. Scope & Feature List

**Player Enrollment:**
- Create player profile (first_name, last_name, required identity fields)
- Link player to casino via `player_casino` enrollment record
- Search existing players by name before creating duplicates

**Visit Management:**
- Start visit (creates `status=open` with gaming day derived from casino settings)
- End visit (sets `status=closed`, captures end timestamp)
- Prevent multiple active visits per player/casino/gaming day
- Display active visits on dashboard

**Player Search:**
- Search by name (partial match)
- Show enrollment status and active visit indicator

## 5. Requirements

### 5.1 Functional Requirements
- Player creation requires: `first_name`, `last_name`, `casino_id`
- Player enrollment creates `player_casino` record with status
- Visit creation derives `gaming_day` from `casino_settings.gaming_day_start_time`
- Visit requires valid `player_id` and `casino_id`
- Unique constraint: one `status=open` visit per `(player_id, casino_id, gaming_day)`
- Closing a visit does not auto-close rating slips (handled separately)

### 5.2 Non-Functional Requirements
- Player search returns results within 500ms
- Visit start/end reflects in UI within 2s

> Architecture details: see `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (PlayerService, VisitService sections)

## 6. UX / Flow Overview
1. Player approaches pit → Staff searches by name
2. Not found → Staff taps "New Player" → enters required fields → saves
3. Found → Staff sees enrollment status and any active visit
4. No active visit → Staff taps "Check In" → visit created for current gaming day
5. Player leaving → Staff taps "Check Out" → visit closed

## 7. Dependencies & Risks

### 7.1 Dependencies
- CasinoService: `casino_settings` for gaming day calculation, staff auth
- Schema: `player`, `player_casino`, `visit` tables exist
- RPC: `compute_gaming_day` function for temporal derivation

### 7.2 Risks & Open Questions
- **Risk:** Duplicate player records from typos — Mitigate with search-before-create UI pattern
- **Risk:** Gaming day boundary edge cases (visit spans midnight) — Server derives gaming day at creation; no mid-visit recalc
- **Open:** Allow re-opening a closed visit same gaming day? — Recommend: No, create new visit instead

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Staff can create new player profiles
- [ ] Staff can search players by name
- [ ] Staff can start/end visits for enrolled players
- [ ] Duplicate active visits prevented (constraint enforced)

**Data & Integrity**
- [ ] Gaming day correctly derived from casino settings
- [ ] Player-casino enrollment tracked in `player_casino`
- [ ] No orphaned visits (all have valid player/casino FKs)

**Security & Access**
- [ ] RLS: Staff can only see/modify own casino's players/visits
- [ ] PII fields excluded from list views (only in detail)

**Testing**
- [ ] Unit tests for gaming day derivation logic
- [ ] Integration test: enroll → check-in → check-out with RLS
- [ ] One E2E test: search player → check in → check out

**Operational Readiness**
- [ ] Structured logs for visit state changes
- [ ] Search queries performant with index on `(last_name, first_name)`

**Documentation**
- [ ] Service README updated with enrollment flow
- [ ] Gaming day calculation documented

## 9. Related Documents
- Vision / Strategy: `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- Architecture / SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- Schema / Types: `types/database.types.ts`
- QA Standards: `docs/40-quality/QA-001-service-testing-strategy.md`
- Service READMEs: `services/player/README.md`, `services/visit/README.md`

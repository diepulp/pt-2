# Critical Workflows Specification

Detailed specifications for PT-2 critical user workflows requiring E2E test coverage.

## 1. Player Management Workflow

### 1.1 Player Search

**Trigger**: Pit boss searches for player by name

**Steps**:
1. User enters search query (partial name)
2. System performs fuzzy search across player database
3. Results show matching players with enrollment status
4. User can select player for further action

**Acceptance Criteria**:
- [ ] Search returns results within 500ms
- [ ] Fuzzy matching handles typos and partial names
- [ ] Results sorted by relevance
- [ ] Enrollment status visible per casino
- [ ] Empty state shown for no matches

**Test Data Requirements**:
- Multiple players with similar names
- Players enrolled in different casinos
- Players with special characters in names

### 1.2 Player Creation

**Trigger**: New player at gaming table

**Steps**:
1. Staff initiates new player registration
2. Collects required fields (first_name, last_name)
3. Optional: loyalty card number, DOB
4. System validates and creates player
5. Auto-enrolls at current casino

**Acceptance Criteria**:
- [ ] Required field validation enforced
- [ ] Duplicate detection (name + DOB)
- [ ] Auto-enrollment on creation
- [ ] Success confirmation displayed
- [ ] Player ID returned for further use

**Test Data Requirements**:
- Valid player data
- Duplicate player data (same name)
- Edge cases (long names, special characters)

### 1.3 Player Enrollment

**Trigger**: Existing player visits new casino

**Steps**:
1. Search finds existing player
2. Staff initiates enrollment
3. System validates player not already enrolled
4. Creates enrollment record
5. Loyalty account initialized (if applicable)

**Acceptance Criteria**:
- [ ] Idempotent enrollment (no errors on re-enroll)
- [ ] Enrollment status updates immediately
- [ ] Loyalty account created with 0 balance
- [ ] Enrollment date recorded

**Test Data Requirements**:
- Player not enrolled at test casino
- Player already enrolled (idempotency check)

---

## 2. Visit Lifecycle Workflow

### 2.1 Check-In

**Trigger**: Player arrives at gaming table

**Steps**:
1. Staff selects player (from search or recent)
2. Initiates check-in
3. System validates no active visit exists
4. Creates new visit with start_time
5. Player marked as "checked in"

**Acceptance Criteria**:
- [ ] Single active visit constraint enforced
- [ ] Visit type defaults to `gaming_identified_rated`
- [ ] Start time is server-generated
- [ ] Realtime update to dashboard
- [ ] Idempotent (same visit returned on retry)

**Test Data Requirements**:
- Player without active visit
- Player with active visit (constraint test)
- Different visit types

### 2.2 Active Visit Check

**Trigger**: Staff verifies player status

**Steps**:
1. Query player's active visit
2. Display visit details if active
3. Show "not checked in" if no active visit

**Acceptance Criteria**:
- [ ] Returns current active visit or null
- [ ] Visit includes table and time information
- [ ] Response within 200ms

### 2.3 Check-Out

**Trigger**: Player leaves gaming floor

**Steps**:
1. Staff selects active visit
2. Initiates check-out
3. System records end_time
4. Calculates visit duration
5. Triggers loyalty accrual (if applicable)

**Acceptance Criteria**:
- [ ] End time is server-generated
- [ ] Duration calculated correctly
- [ ] Visit status changes to closed
- [ ] Rating slips closed if open
- [ ] Realtime update to dashboard

**Test Data Requirements**:
- Visit with active rating slips
- Visit without rating slips
- Visit with loyalty points to accrue

### 2.4 Ghost Visit

**Trigger**: Unidentified player at table (observation only)

**Steps**:
1. Staff creates ghost visit without player
2. Enters descriptive details
3. System creates visit with null player_id
4. Can later convert to identified visit

**Acceptance Criteria**:
- [ ] Ghost visit created without player
- [ ] Descriptive fields captured
- [ ] Cannot create rating slips for ghost visits
- [ ] Conversion to identified visit supported

---

## 3. Rating Slip Workflow

### 3.1 Start Rating Slip

**Trigger**: Player begins gaming session at table

**Steps**:
1. Staff selects table and seat
2. Selects player (from visit or search)
3. Enters initial bet amount
4. System creates rating slip with start_time
5. Timer begins

**Acceptance Criteria**:
- [ ] Visit required (no ghost visits)
- [ ] Table must be active
- [ ] Seat must be available
- [ ] Start time is server-generated
- [ ] Realtime update to active slips panel

**Test Data Requirements**:
- Active visit with no current slip
- Active table with available seats
- Initial bet amounts (various)

### 3.2 Pause Rating Slip

**Trigger**: Player takes break

**Steps**:
1. Staff selects active rating slip
2. Initiates pause
3. System records pause start time
4. Timer stops accumulating

**Acceptance Criteria**:
- [ ] Only open slips can be paused
- [ ] Pause time recorded in rating_slip_pause table
- [ ] Duration calculation excludes paused time
- [ ] UI shows paused state

**Test Data Requirements**:
- Active rating slip
- Already-paused slip (invalid transition)

### 3.3 Resume Rating Slip

**Trigger**: Player returns from break

**Steps**:
1. Staff selects paused rating slip
2. Initiates resume
3. System records pause end time
4. Timer resumes

**Acceptance Criteria**:
- [ ] Only paused slips can be resumed
- [ ] Pause end time recorded
- [ ] Duration calculation resumes correctly
- [ ] UI shows active state

**Test Data Requirements**:
- Paused rating slip
- Active slip (invalid transition)

### 3.4 Close Rating Slip

**Trigger**: Player ends gaming session

**Steps**:
1. Staff selects active/paused rating slip
2. Enters final bet, chips taken
3. Initiates close
4. System calculates total duration (excluding pauses)
5. Triggers loyalty accrual

**Acceptance Criteria**:
- [ ] End time is server-generated
- [ ] Duration excludes all pause intervals
- [ ] Seat freed for new player
- [ ] Loyalty points calculated and accrued
- [ ] Removed from active slips panel

**Test Data Requirements**:
- Active slip with no pauses
- Active slip with multiple pauses
- Paused slip (close from paused state)

### 3.5 Duration Calculation

**Trigger**: Automatic on status change

**Calculation**:
```
total_duration = (end_time - start_time) - SUM(pause_durations)
```

**Acceptance Criteria**:
- [ ] Duration in seconds (integer)
- [ ] Accurate to within 1 second
- [ ] Handles multiple pause/resume cycles
- [ ] Returns null for open slips

### 3.6 Move Player (PRD-008)

**Trigger**: Player moves to different table or seat

**API Endpoint**: `POST /api/v1/rating-slips/[id]/move`

**Steps**:
1. Staff selects active/paused rating slip
2. Selects destination table and optional seat
3. Optionally carries over average bet
4. System closes current slip
5. System creates new slip at destination with same visit_id
6. Returns both closed slip ID and new slip ID

**Acceptance Criteria**:
- [ ] Orchestrated atomic operation (close + start)
- [ ] Visit continuity preserved (same visit_id)
- [ ] Average bet optionally transferred
- [ ] Source seat freed after move
- [ ] Destination seat validated (not occupied)
- [ ] Both operations in single transaction
- [ ] Realtime updates for both tables

**Test Data Requirements**:
- Active slip at source table
- Active destination table with available seat
- Destination table with occupied seat (error case)
- Move to same table, different seat
- Move to different table
- Move with and without average bet transfer

**Error Cases**:
- `RATING_SLIP_NOT_FOUND` - slip doesn't exist
- `RATING_SLIP_ALREADY_CLOSED` - cannot move closed slip
- `SEAT_ALREADY_OCCUPIED` - destination seat taken
- `TABLE_NOT_ACTIVE` - destination table not active

### 3.7 Update Average Bet

**Trigger**: Player changes bet amount during session

**Steps**:
1. Staff selects open or paused slip
2. Enters new average bet amount
3. System updates slip record
4. Can be called multiple times before close

**Acceptance Criteria**:
- [ ] Only open/paused slips can be updated
- [ ] Closed slips reject updates (422)
- [ ] Multiple updates allowed
- [ ] Final average bet reflected on close

**Test Data Requirements**:
- Open slip for update
- Paused slip for update
- Closed slip (error case)
- Multiple sequential updates

### 3.8 Close with Financial (Chips Taken)

**Trigger**: Player cashes out chips at session end

**Steps**:
1. Staff closes rating slip
2. Enters chips taken amount (if > 0)
3. System creates financial transaction (direction: "out")
4. Links to visit via financial service
5. Slip closed with duration calculated

**Acceptance Criteria**:
- [ ] Financial transaction created only if amount > 0
- [ ] Transaction linked to visit_id
- [ ] Direction is "out", source is "pit", tender is "chips"
- [ ] Works only for identified players (not ghost visits)
- [ ] Slip close completes even if financial call fails (graceful degradation)

**Test Data Requirements**:
- Identified player slip with chips taken
- Identified player slip with zero chips
- Ghost visit slip (no financial transaction created)

### 3.9 Modal Data Aggregation (BFF)

**Trigger**: Staff opens rating slip detail modal

**API Endpoint**: `GET /api/v1/rating-slips/[id]/modal-data`

**Steps**:
1. User opens rating slip modal
2. System aggregates data from 5 bounded contexts:
   - RatingSlip: slip details, pauses, duration
   - Visit: visit info, timestamps
   - Player: player profile, enrollment
   - Loyalty: current balance, tier
   - PlayerFinancial: visit financial summary
3. Returns unified DTO for modal display

**Acceptance Criteria**:
- [ ] Aggregates all 5 contexts in single request
- [ ] Graceful fallback if optional contexts fail
- [ ] Cached where appropriate (player, loyalty)
- [ ] Response within 1s for modal open

**Test Data Requirements**:
- Complete scenario (all contexts populated)
- Ghost visit (no player/loyalty/financial)
- Player without loyalty account

### 3.10 Seat Uniqueness Constraint

**Trigger**: Attempt to start slip at occupied seat

**Constraint**: Only one active (open/paused) slip per seat per table

**Steps**:
1. Staff attempts to start slip at seat
2. System checks for existing active slip at that seat
3. If occupied, returns `SEAT_ALREADY_OCCUPIED` error

**Acceptance Criteria**:
- [ ] Prevents duplicate active slips at same seat
- [ ] Allows slip after previous closed
- [ ] Error message identifies current player at seat
- [ ] Works across concurrent requests (DB constraint)

**Test Data Requirements**:
- Empty seat (success)
- Occupied seat with open slip (error)
- Occupied seat with paused slip (error)
- Seat with closed slip (success - seat freed)

### 3.11 Ghost Visit Rating Slips

**Trigger**: Rating slip for unidentified player (compliance observation)

**Steps**:
1. Staff creates ghost visit (no player_id)
2. Staff creates rating slip for ghost visit
3. Slip tracks gaming activity for compliance
4. No loyalty accrual (no player)
5. No financial tracking (no player)

**Acceptance Criteria**:
- [ ] Ghost visits CAN have rating slips (ADR-014 compliance)
- [ ] Slip tracks duration, table, seat
- [ ] No loyalty points accrued
- [ ] No financial transactions created
- [ ] Can later associate with player if identified

**Test Data Requirements**:
- Ghost visit creation
- Rating slip for ghost visit
- Close ghost visit slip (no loyalty/financial)

### 3.12 Idempotency Requirements

**Trigger**: All rating slip mutations

**Header**: `Idempotency-Key: <uuid>`

**Steps**:
1. Client sends mutation with Idempotency-Key header
2. System checks for existing operation with same key
3. If exists, returns original result (HTTP 200)
4. If new, performs operation (HTTP 201)

**Acceptance Criteria**:
- [ ] All POST/PATCH operations require Idempotency-Key
- [ ] Duplicate requests return original result
- [ ] HTTP 200 for replay, 201 for new
- [ ] Works across network retries
- [ ] Keys valid for 24 hours

**Test Data Requirements**:
- First request (201 Created)
- Retry with same key (200 OK, same result)
- Different key (201 Created, new resource)

### 3.13 Cross-Context Queries

**Trigger**: TableContextService gates on rating slip state

**Published Queries**:
- `hasOpenSlipsForTable(tableId, casinoId)` → boolean
- `countOpenSlipsForTable(tableId, casinoId)` → number

**Steps**:
1. TableContextService attempts to close/deactivate table
2. Queries RatingSlipService for open slips
3. If open slips exist, blocks table close
4. Returns error: "Cannot close table with active rating slips"

**Acceptance Criteria**:
- [ ] Table cannot close with open slips
- [ ] Table cannot deactivate with open slips
- [ ] Count query returns accurate number
- [ ] Queries respect RLS (casino scoped)

**Test Data Requirements**:
- Table with open slips (block close)
- Table with no slips (allow close)
- Table with only closed slips (allow close)

---

## 4. Loyalty Rewards Workflow

### 4.1 Balance Query

**Trigger**: Staff checks player's loyalty status

**Steps**:
1. Select player
2. Query loyalty balance
3. Display current points and tier

**Acceptance Criteria**:
- [ ] Returns current balance
- [ ] Includes pending points (if any)
- [ ] Tier status displayed
- [ ] Response within 200ms

### 4.2 Mid-Session Reward

**Trigger**: Staff issues reward during active visit

**Steps**:
1. Select active visit
2. Enter reward details (points, reason)
3. System creates ledger entry
4. Balance updated

**Acceptance Criteria**:
- [ ] Idempotent (source_ref unique constraint)
- [ ] Reason code required
- [ ] Audit trail created
- [ ] Balance reflected immediately

**Test Data Requirements**:
- Active visit with loyalty account
- Duplicate reward (idempotency test)
- Various point amounts

### 4.3 Accrual on Close

**Trigger**: Rating slip closed

**Steps**:
1. Rating slip closes
2. System calculates earned points
3. Creates ledger entry
4. Balance updated

**Acceptance Criteria**:
- [ ] Points based on duration and bet
- [ ] Automatic on slip close
- [ ] Linked to rating_slip_id
- [ ] Audit trail created

### 4.4 Redemption

**Trigger**: Player redeems points

**Steps**:
1. Staff initiates redemption
2. Enters points to redeem
3. System validates sufficient balance
4. Creates ledger entry (negative)
5. Balance decremented

**Acceptance Criteria**:
- [ ] Insufficient balance rejected
- [ ] Overdraw limit enforced (5000 points)
- [ ] Reason code recorded
- [ ] Balance updated immediately

**Test Data Requirements**:
- Sufficient balance
- Insufficient balance
- At overdraw limit

### 4.5 Idempotency

**Trigger**: Duplicate reward/redemption attempt

**Steps**:
1. Same operation with same source_ref
2. System detects duplicate
3. Returns existing entry (no new creation)
4. HTTP 200 (not 201)

**Acceptance Criteria**:
- [ ] No duplicate ledger entries
- [ ] Original entry returned
- [ ] HTTP 200 for replay
- [ ] HTTP 201 for new entries

---

## Cross-Workflow Dependencies

```
Player Search → Player Select → Visit Check-In
                                     ↓
                              Rating Slip Start
                                     ↓
                    ┌────────────────┴────────────────┐
                    ↓                                 ↓
             Pause/Resume Cycle                Move Player
                    ↓                          (Close + New Slip)
             Update Avg Bet                         ↓
                    ↓                          Same Visit Continues
                    └────────────────┬────────────────┘
                                     ↓
                              Rating Slip Close
                                     ↓
                    ┌────────────────┴────────────────┐
                    ↓                                 ↓
             Loyalty Accrual                Financial Transaction
             (if identified player)         (chips taken, if > 0)
                    └────────────────┬────────────────┘
                                     ↓
                              Visit Check-Out
```

### Move Player Flow Detail

```
┌─────────────────────────────────────────────────────────────────┐
│                     MOVE PLAYER OPERATION                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Select active/paused slip at Table A, Seat 1                │
│  2. POST /api/v1/rating-slips/{id}/move                         │
│     { destinationTableId, destinationSeatNumber?, averageBet? } │
│                              ↓                                   │
│  3. [Atomic Transaction]                                         │
│     a. Close current slip (Table A, Seat 1)                     │
│     b. Free seat at source                                       │
│     c. Create new slip (Table B, Seat 3)                        │
│     d. Preserve visit_id for continuity                         │
│                              ↓                                   │
│  4. Response: { closedSlipId, newSlipId }                       │
│                              ↓                                   │
│  5. Realtime updates to both Table A and Table B dashboards     │
└─────────────────────────────────────────────────────────────────┘
```

## RLS Considerations

All workflows must enforce:
- Casino scoping (staff sees only their casino's data)
- Cross-casino access denied (403 Forbidden)
- Service role used only for test setup/teardown
- Authenticated anon client for actual test assertions

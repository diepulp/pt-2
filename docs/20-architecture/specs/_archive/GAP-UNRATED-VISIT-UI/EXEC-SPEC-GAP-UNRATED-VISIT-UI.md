---
prd: GAP-UNRATED-VISIT-UI
prd_title: "Visit Type UI Exposure"
service: VisitService
mvp_phase: 2

workstreams:
  WS1:
    name: Ghost Visit HTTP + API
    description: Add HTTP fetcher and API route for ghost/unrated visits
    executor: api-builder
    executor_type: skill
    depends_on: []
    outputs:
      - services/visit/http.ts
      - app/api/v1/visits/ghost/route.ts
    gate: type-check
    estimated_complexity: medium

  WS2:
    name: Reward Visit HTTP + API
    description: Add HTTP fetcher and API route for comp-only visits
    executor: api-builder
    executor_type: skill
    depends_on: []
    outputs:
      - services/visit/http.ts
      - app/api/v1/visits/reward/route.ts
    gate: type-check
    estimated_complexity: medium

  WS3:
    name: Convert Visit HTTP + API
    description: Add HTTP fetcher and API route for converting comp to rated
    executor: api-builder
    executor_type: skill
    depends_on: []
    outputs:
      - services/visit/http.ts
      - app/api/v1/visits/[visitId]/convert-to-gaming/route.ts
    gate: type-check
    estimated_complexity: medium

  WS4:
    name: NewSlipModal 3-Way Visit Selector
    description: Add 3-way visit type selector (Rated/Unrated/Comp Only) with conditional flows
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1, WS2]
    outputs:
      - components/dashboard/new-slip-modal.tsx
    gate: type-check
    estimated_complexity: high

  WS5:
    name: TableToolbar Button Rename
    description: Rename "New Rating Slip" to "Start Session"
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - components/table/table-toolbar.tsx
    gate: type-check
    estimated_complexity: low

  WS6:
    name: Activity Panel Visit Type Enhancement
    description: Add visit type badges, conversion actions, and convert modal to existing activity panel
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS3, WS4]
    outputs:
      - components/pit-panels/activity-panel.tsx
      - components/pit-panels/convert-visit-modal.tsx
      - hooks/dashboard/use-casino-active-players.ts
    gate: type-check
    estimated_complexity: high

  WS7:
    name: Unit Tests - HTTP Fetchers
    description: Unit tests for startGhostVisit, startRewardVisit, convertVisitToGaming
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1, WS2, WS3]
    outputs:
      - services/visit/__tests__/http-contract.test.ts
    gate: test-pass
    estimated_complexity: medium

  WS8:
    name: E2E Tests - Visit Flows
    description: Playwright E2E tests for all visit type flows and conversion
    executor: e2e-testing
    executor_type: skill
    depends_on: [WS4, WS5, WS6]
    outputs:
      - e2e/workflows/visit-types.spec.ts
    gate: test-pass
    estimated_complexity: high

execution_phases:
  - name: Phase 1 - Backend APIs
    parallel: [WS1, WS2, WS3]
    gates: [type-check]

  - name: Phase 2 - Frontend Modal + Button
    parallel: [WS4, WS5]
    gates: [type-check]

  - name: Phase 3 - Activity Panel Enhancement
    parallel: [WS6]
    gates: [type-check]

  - name: Phase 4 - Testing
    parallel: [WS7, WS8]
    gates: [test-pass]

gates:
  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0"

  lint:
    command: npm run lint
    success_criteria: "Exit code 0, no errors (warnings OK)"

  test-pass:
    command: npm test services/visit/
    success_criteria: "All tests pass"

  build:
    command: npm run build
    success_criteria: "Exit code 0"

risks:
  - risk: "Modal complexity increases with 3-way selector"
    mitigation: "Use existing shadcn RadioGroup; keep visit type state simple"
  - risk: "Activity panel query performance with visit_kind join"
    mitigation: "visit_kind is on visit table, already joined; no extra query"
  - risk: "Conversion race conditions"
    mitigation: "convertRewardToGaming checks ended_at in WHERE clause"
---

# EXECUTION-SPEC: Visit Type UI Exposure

## Overview

This EXECUTION-SPEC implements the gaps identified in `GAP-UNRATED-VISIT-UI.md` v0.2.0, exposing all three visit types through the UI:

1. **Rated** (`gaming_identified_rated`) - Player gaming with loyalty
2. **Unrated/Ghost** (`gaming_ghost_unrated`) - Anonymous gaming for compliance
3. **Comp Only** (`reward_identified`) - Reward redemption without gaming

Plus visit conversion (Comp → Rated) and activity panel enhancement for visit type management.

---

## Architecture Context

### Backend Support (Already Implemented)

| Feature | CRUD Function | Zod Schema | Status |
|---------|---------------|------------|--------|
| Ghost Visit | `createGhostGamingVisit()` | `createGhostGamingVisitSchema` | ✅ Exists |
| Reward Visit | `createRewardVisit()` | `createRewardVisitSchema` | ✅ Exists |
| Convert Visit | `convertRewardToGaming()` | `convertRewardToGamingSchema` | ✅ Exists |

### Security Requirements

- **ADR-024**: All endpoints derive `casino_id` from RLS context (no request params)
- **ADR-030**: `visit` is critical table - write policies use session vars only
- **Idempotency**: All mutation endpoints require `X-Idempotency-Key` header

---

## Workstream Details

### WS1: Ghost Visit HTTP + API

**Purpose**: Expose `createGhostGamingVisit()` via API for frontend consumption.

**HTTP Fetcher** (`services/visit/http.ts`):
```typescript
export async function startGhostVisit(
  input: CreateGhostGamingVisitDTO
): Promise<VisitDTO>
```

**API Route** (`app/api/v1/visits/ghost/route.ts`):
- Method: POST
- Request: `{ table_id: string, notes?: string }`
- Response: `ServiceHttpResult<{ visit: VisitDTO }>`
- Validation: `createGhostGamingVisitSchema`

### WS2: Reward Visit HTTP + API

**Purpose**: Expose `createRewardVisit()` via API for comp-only visits.

**HTTP Fetcher** (`services/visit/http.ts`):
```typescript
export async function startRewardVisit(
  playerId: string
): Promise<VisitDTO>
```

**API Route** (`app/api/v1/visits/reward/route.ts`):
- Method: POST
- Request: `{ player_id: string }`
- Response: `ServiceHttpResult<{ visit: VisitDTO }>`
- Idempotent: Returns existing active reward visit if one exists

### WS3: Convert Visit HTTP + API

**Purpose**: Expose `convertRewardToGaming()` via API for visit conversion.

**HTTP Fetcher** (`services/visit/http.ts`):
```typescript
export async function convertVisitToGaming(
  visitId: string
): Promise<VisitDTO>
```

**API Route** (`app/api/v1/visits/[visitId]/convert-to-gaming/route.ts`):
- Method: POST
- Request: `{}` (visit ID from URL params)
- Response: `ServiceHttpResult<{ visit: VisitDTO }>`
- Error Codes: `VISIT_NOT_FOUND` (404), `VISIT_NOT_OPEN` (409), `VISIT_INVALID_CONVERSION` (400)

### WS4: NewSlipModal 3-Way Visit Selector

**Purpose**: Refactor modal to support all three visit types.

**State Additions**:
```typescript
const [visitType, setVisitType] = useState<'rated' | 'unrated' | 'comp_only'>('rated')
const [notes, setNotes] = useState('')
```

**UI Changes**:
- Add SegmentedControl/RadioGroup for visit type selection
- Conditional rendering based on selected type:
  - **Rated**: Player search + Seat selector
  - **Unrated**: Seat selector + Notes field (hide player search)
  - **Comp Only**: Player search only (hide seat selector)

**Submit Logic by Type**:
- **Rated**: `startVisit()` → `startRatingSlip()`
- **Unrated**: `startGhostVisit()` → `startRatingSlip()`
- **Comp Only**: `startRewardVisit()` → (no slip, toast conversion prompt)

### WS5: TableToolbar Button Rename

**Purpose**: Rename misleading button label.

**Change**:
```typescript
// Before
label: 'New Rating Slip'

// After
label: 'Start Session'
```

### WS6: Activity Panel Visit Type Enhancement

**Purpose**: Add visit type discrimination and conversion actions to existing activity panel.

**Existing Component**: `components/pit-panels/activity-panel.tsx`

**Changes**:

1. **Add Visit Type Column** with badges:
   - `RATED` (green) - `gaming_identified_rated`
   - `UNRATED` (amber) - `gaming_ghost_unrated`
   - `COMP` (blue) - `reward_identified`

2. **Update Name Display**:
   - Ghost visits: Show "Anonymous" instead of "Guest"
   - Include visit type badge inline

3. **Add Row Actions Dropdown** for COMP visits:
   - "Seat at Table" → Opens convert modal
   - "Close Session" → Closes visit

4. **Create Convert Modal** (`components/pit-panels/convert-visit-modal.tsx`):
   - Display player info and visit duration
   - Table selector (if not at table)
   - Seat selector (with occupied seats disabled)
   - Confirm triggers: `convertVisitToGaming()` → `startRatingSlip()`

5. **Update Hook**: Add `visitKind` to `useCasinoActivePlayers` response

### WS7: Unit Tests - HTTP Fetchers

**Test Cases**:
- `startGhostVisit`: Sends POST to correct URL, includes idempotency header
- `startRewardVisit`: Sends POST with player_id, includes idempotency header
- `convertVisitToGaming`: Sends POST to dynamic URL, includes idempotency header

### WS8: E2E Tests - Visit Flows

**Test Scenarios**:
1. **Unrated Visit Creation**: Modal → Select Unrated → Seat → Submit → Verify visit_kind
2. **Comp-Only Visit Creation**: Modal → Select Comp → Player → Submit → Verify visit_kind
3. **Comp-to-Rated Conversion**: Activity panel → Seat at Table → Confirm → Verify conversion
4. **Activity Panel Discrimination**: Verify badges for each visit type

---

## Definition of Done

### API Layer
- [ ] `POST /api/v1/visits/ghost` creates `gaming_ghost_unrated` visit
- [ ] `POST /api/v1/visits/reward` creates `reward_identified` visit
- [ ] `POST /api/v1/visits/{id}/convert-to-gaming` converts to `gaming_identified_rated`
- [ ] All endpoints use ServiceHttpResult response envelope
- [ ] All endpoints enforce idempotency header
- [ ] All endpoints derive casino_id from RLS context (ADR-024)

### HTTP Layer
- [ ] `startGhostVisit()` available in `services/visit/http.ts`
- [ ] `startRewardVisit()` available in `services/visit/http.ts`
- [ ] `convertVisitToGaming()` available in `services/visit/http.ts`

### UI - Modal
- [ ] Modal shows 3-way visit type selector (Rated/Unrated/Comp Only)
- [ ] Unrated flow hides player search, shows seat selector + notes
- [ ] Comp Only flow shows player search, hides seat selector
- [ ] Modal title changes based on selected visit type
- [ ] Toolbar button renamed to "Start Session"

### UI - Activity Panel Enhancement
- [ ] Activity panel shows visit type column with badges (RATED/UNRATED/COMP)
- [ ] Visit type badges correctly identify each visit kind
- [ ] "Guest" replaced with "Anonymous" + UNRATED badge for ghost visits
- [ ] COMP visits show "Seat at Table" action in row dropdown
- [ ] Convert modal created with table/seat selector
- [ ] Conversion flow calls `convertVisitToGaming()` then `startRatingSlip()`
- [ ] `useCasinoActivePlayers` hook returns `visitKind` field

### Testing
- [ ] Unit tests for all HTTP fetchers pass
- [ ] E2E test for unrated visit creation passes
- [ ] E2E test for comp-only visit creation passes
- [ ] E2E test for comp-to-rated conversion passes
- [ ] E2E test for activity panel discrimination passes

### Quality Gates
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `npm test services/visit` passes

---

## Changelog

- **v0.2.0 (2026-02-05)**: Initial EXECUTION-SPEC with 8 workstreams, updated to enhance existing activity panel

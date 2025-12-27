---
id: PRD-020
title: Move Player Performance & UX Remediation
owner: Engineering
status: Proposed
affects: [PRD-008, PRD-019, PRD-006, PRD-018, ADR-015, ADR-024]
created: 2025-12-27
last_review: 2025-12-27
phase: Phase 3 (UX Polish)
pattern: A
http_boundary: true
---

# PRD-020 — Move Player Performance & UX Remediation

## 1. Overview

- **Owner:** Engineering
- **Status:** Proposed
- **Summary:** Remediate critical performance and UX defects in the Move Player workflow identified through ISSUE-2CAC5C0B and validated by a multi-agent architecture audit. A single move action triggers 12+ HTTP requests (should be 2-4), the modal fails to close, and the operation takes 1.7s (should be <400ms). This PRD delivers: (1) immediate modal closure fix, (2) targeted cache invalidation reducing requests by 80%, (3) consolidated `rpc_move_player` RPC reducing latency by 75%, and (4) API enhancements for future dashboard optimization.

---

## 2. Problem & Goals

### 2.1 Problem Statement

Live browser testing and a **three-agent architecture audit** (Lead Architect, RLS Expert, API Builder) confirmed interconnected defects in the Move Player workflow:

**Defect 1: Modal Stays Open After Move (UX)**
- After clicking "Move Player", the modal remains open instead of closing
- Root cause: `pit-panels-client.tsx:handleMovePlayer()` does NOT call `closeModal()` after mutation success
- Additionally, `selectedSlipId` is set to the new slip ID instead of being cleared
- When user manually closes, a "No Data Available" dialog appears

**Defect 2: Excessive HTTP Request Cascade (12+ requests)**
- A single move triggers **12+ HTTP requests** instead of expected 2-4
- Network log evidence:
  ```
  GET /api/v1/rating-slips?table_id=0001&status=open (2x)
  GET /api/v1/rating-slips?table_id=0001&status=paused (2x)
  GET /api/v1/rating-slips?table_id=0003&status=open (1x)
  GET /api/v1/rating-slips?table_id=0003&status=paused (2x)
  GET /api/v1/rating-slips?table_id=0004&status=open (2x)
  GET /api/v1/rating-slips?table_id=0004&status=paused (2x)
  ```
- Root causes (confirmed by all 3 agents):
  1. **Over-broad `.scope` invalidation**: `dashboardKeys.slips.scope` invalidates ALL tables
  2. **N×2 HTTP pattern**: Each `useActiveSlipsForDashboard` makes 2 calls (`open` + `paused`)
  3. **Re-render cascade**: Tables invalidation triggers component re-mount → queries re-issue

**Defect 3: Slow Move Operation (1.7s latency)**
- Move RPC performs **4 sequential database operations**:
  1. `getById()` - SELECT with RLS (~50ms)
  2. `close()` - RPC call (~300ms)
  3. `start()` - RPC call (~300ms)
  4. Update metadata - UPDATE (~50ms)
- Redundant RLS context injection (set 3x per move operation)
- Total measured latency: 1695ms

**Defect 4: API Design Forces Multiple Calls**
- Status filter only accepts single value (`status=open` OR `status=paused`)
- No batch table queries supported
- Move response returns minimal data (IDs only), forcing refetch cascade

### 2.2 Goals

| Goal | Observable Metric | Priority |
|------|-------------------|----------|
| **G1**: Modal closes on successful Move | Modal unmounts within 100ms of success | P0 |
| **G2**: No orphaned state after move | `selectedSlipId` cleared; no stale dialogs | P0 |
| **G3**: Reduce HTTP requests by 80% | Max 4 requests per move (was 12+) | P0 |
| **G4**: Reduce move latency by 75% | <400ms total (was 1695ms) | P1 |
| **G5**: API supports `status=active` | Single call for open+paused slips | P1 |
| **G6**: Move response includes seat state | Eliminates need for post-move refetch | P1 |

### 2.3 Non-Goals

- React 19 `useOptimistic` for seat updates (covered by PRD-019)
- Dashboard BFF endpoint consolidation (future PRD-021)
- Full API query parameter redesign (batch table queries)
- Realtime direct cache updates (P2 enhancement)

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Floor Supervisor

**Top Jobs:**

- As a **Pit Boss**, I need the modal to close immediately after moving a player so I can continue monitoring the floor.
- As a **Floor Supervisor**, I need seat changes reflected within 300ms so I trust the system is accurate.
- As a **Pit Boss**, I need move operations to complete in under half a second so workflow isn't disrupted.

---

## 4. Scope & Feature List

### 4.1 In Scope (P0 - Immediate)

**Modal Closure Fix:**
- Add `closeModal()` call in `handleMovePlayer()` success path
- Clear `selectedSlipId` to null after successful move
- Match behavior of `handleCloseSession()` which works correctly

**Targeted Cache Invalidation:**
- Replace `dashboardKeys.slips.scope` with targeted `activeSlips(tableId)` invalidation
- Remove `dashboardKeys.tables.scope` invalidation (prevents re-render cascade)
- Remove `ratingSlipModalKeys.scope` invalidation (modal is closing)
- Add `sourceTableId` to mutation input for targeted invalidation

### 4.2 In Scope (P1 - Short Term)

**Consolidated Move RPC:**
- Create `rpc_move_player` database function combining 4 operations into 1 transaction
- Single RLS context injection instead of 3
- Return enhanced response with seat state

**API Enhancement:**
- Add `status=active` alias to `/api/v1/rating-slips` endpoint
- Reduces N×2 pattern to N×1 for dashboard queries

**Enhanced Move Response:**
- Include `sourceTableSeats` and `destinationTableSeats` in response
- Include lightweight `newSlip` summary for immediate UI update

### 4.3 Out of Scope

- Dashboard BFF endpoint (`/api/v1/dashboard/tables/summary`)
- Batch table queries (`table_id=X,Y,Z`)
- Query key namespace unification (`slips` vs `activeSlips`)
- Realtime direct cache updates

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1: Modal Close on Move Success**
- `handleMovePlayer()` must call `closeModal()` after successful mutation
- `handleMovePlayer()` must call `setSelectedSlip(null)` to clear UI state
- Error states must keep modal open with error message displayed

**FR-2: Targeted Query Invalidation**
- On move success, invalidate only:
  - `dashboardKeys.activeSlips(sourceTableId)`
  - `dashboardKeys.activeSlips(destinationTableId)`
  - `dashboardKeys.stats(casinoId)`
- Remove ALL `.scope` invalidations from move success handler

**FR-3: Consolidated Move RPC**
- Create `rpc_move_player(p_casino_id, p_actor_id, p_slip_id, p_new_table_id, p_new_seat_number, p_average_bet)`
- Execute all operations in single transaction with FOR UPDATE lock
- Return JSONB with `closed_slip`, `new_slip`, `source_table_seats`, `destination_table_seats`

**FR-4: Status Active Alias**
- `/api/v1/rating-slips?status=active` returns slips with status IN ('open', 'paused')
- Backward compatible: existing `status=open` or `status=paused` still work

**FR-5: Enhanced Move Response**
- Move endpoint response includes:
  ```typescript
  {
    newSlipId: string;
    closedSlipId: string;
    moveGroupId: string;
    accumulatedSeconds: number;
    sourceTableSeats: string[];      // Occupied seats after move
    destinationTableSeats: string[]; // Occupied seats after move
    newSlip: { id, tableId, seatNumber, status, startTime };
  }
  ```

### 5.2 Non-Functional Requirements

- Modal close visible within 100ms of mutation success
- Network requests after move: max 4 (was 12+)
- Move operation total latency: <400ms (was 1695ms)
- No React console errors during move workflow

> Architecture: See PRD-008, PRD-018, ADR-015

---

## 6. UX / Flow Overview

**Flow 1: Current (Broken)**
```
User clicks "Move Player"
  → API call (1695ms)
  → ❌ Modal stays open
  → 12+ HTTP requests cascade
  → ~3 seconds total before UI settles
  → User manually closes modal
  → ❌ "No Data Available" dialog
```

**Flow 2: After P0 Fixes**
```
User clicks "Move Player"
  → API call (1695ms)
  → ✅ Modal closes immediately
  → 4 HTTP requests (targeted)
  → ~2 seconds total before UI settles
```

**Flow 3: After P1 Fixes**
```
User clicks "Move Player"
  → API call (~350ms with rpc_move_player)
  → ✅ Modal closes immediately
  → 2 HTTP requests (status=active)
  → ✅ <500ms total before UI settles
```

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| PRD-008 Modal Integration | COMPLETE | Base modal hooks |
| PRD-006 Pit Dashboard | COMPLETE | Dashboard query keys |
| PRD-018 BFF RPC | COMPLETE | Existing RPC patterns |
| ADR-015 RLS Strategy | COMPLETE | Context injection pattern |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Targeted invalidation misses edge cases | Test with multi-table move scenarios |
| `rpc_move_player` migration complexity | Follow existing RPC patterns from PRD-018 |
| `status=active` breaks existing clients | Additive change, backward compatible |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality (P0)**
- [ ] Modal closes immediately after successful Move Player
- [ ] `selectedSlipId` is `null` after successful move
- [ ] No "No Data Available" dialog appears after move
- [ ] Network tab shows max 4-5 requests after move (was 12+)

**Functionality (P1)**
- [ ] `rpc_move_player` executes in single transaction
- [ ] Move operation latency <400ms (was 1695ms)
- [ ] `status=active` returns open+paused slips
- [ ] Move response includes seat state arrays

**Data & Integrity**
- [ ] Old slip properly closed in database
- [ ] New slip created at destination with continuity metadata
- [ ] No stale cache entries after move

**Security & Access**
- [ ] `rpc_move_player` uses SECURITY DEFINER with proper context injection
- [ ] Existing casino scope validation maintained
- [ ] No RLS policy modifications required

**Testing**
- [ ] E2E test: Move player closes modal
- [ ] E2E test: Move player updates table layout within 300ms
- [ ] E2E test: Move failure keeps modal open with error
- [ ] Unit test: `useMovePlayer` invalidates targeted keys only
- [ ] Integration test: `rpc_move_player` handles concurrent moves

**Operational Readiness**
- [ ] No new console errors introduced
- [ ] No duplicate requests to same endpoint
- [ ] Latency metrics logged for move operation

---

## 9. Related Documents

- **Source Issue:** ISSUE-2CAC5C0B (Memori issues namespace)
- **Architecture Audit:** See Appendix D
- **Modal Integration:** `docs/10-prd/PRD-008-rating-slip-modal-integration.md`
- **BFF RPC Pattern:** `docs/10-prd/PRD-018-rating-slip-modal-bff-rpc.md`
- **Dashboard PRD:** `docs/10-prd/PRD-006-pit-dashboard.md`
- **RLS Strategy:** `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`

---

## Appendix A: Code Changes (P0)

### File 1: `components/pit-panels/pit-panels-client.tsx`

**Current** (lines 257-274):
```typescript
const handleMovePlayer = async (formState: FormState) => {
  if (!selectedSlipId) return;
  try {
    const result = await movePlayer.mutateAsync({...});
    setSelectedSlip(result.newSlipId);  // BUG: Should close modal
  } catch (error) {
    logError(error, { component: 'PitPanels', action: 'movePlayer' });
  }
};
```

**Fixed**:
```typescript
const handleMovePlayer = async (formState: FormState) => {
  if (!selectedSlipId || !selectedTableId) return;
  try {
    await movePlayer.mutateAsync({
      currentSlipId: selectedSlipId,
      sourceTableId: selectedTableId,  // NEW: For targeted invalidation
      destinationTableId: formState.newTableId,
      destinationSeatNumber: formState.newSeatNumber || null,
      averageBet: Number(formState.averageBet),
    });
    closeModal();
    setSelectedSlip(null);
  } catch (error) {
    logError(error, { component: 'PitPanels', action: 'movePlayer' });
  }
};
```

### File 2: `hooks/rating-slip-modal/use-move-player.ts`

**Current onSuccess** (causes 12+ requests):
```typescript
onSuccess: (data, variables) => {
  queryClient.invalidateQueries({ queryKey: ratingSlipModalKeys.data(variables.currentSlipId) });
  queryClient.invalidateQueries({ queryKey: ratingSlipModalKeys.data(data.newSlipId) });
  queryClient.invalidateQueries({ queryKey: ratingSlipModalKeys.scope });
  queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope });
  queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });
  queryClient.invalidateQueries({ predicate: ... });
};
```

**Fixed onSuccess** (max 4 requests):
```typescript
onSuccess: (data, variables) => {
  // Targeted: Only source and destination tables
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.activeSlips(variables.sourceTableId),
  });
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.activeSlips(data.destinationTableId),
  });
  // Stats refresh
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.stats(variables.casinoId),
  });
};
```

**Updated interface**:
```typescript
export interface MovePlayerMutationInput {
  currentSlipId: string;
  sourceTableId: string;      // NEW
  destinationTableId: string;
  destinationSeatNumber?: string | null;
  averageBet?: number;
  casinoId?: string;          // NEW: For stats invalidation
}
```

---

## Appendix B: Database Migration (P1)

### File: `supabase/migrations/[timestamp]_prd020_move_player_rpc.sql`

```sql
-- PRD-020: Consolidated Move Player RPC
-- Reduces 4 round-trips to 1, latency from ~700ms to ~150ms

-- 1. Add compound index for active slips by table
CREATE INDEX IF NOT EXISTS idx_rating_slip_table_status_active
  ON rating_slip (table_id, status)
  WHERE status IN ('open', 'paused');

COMMENT ON INDEX idx_rating_slip_table_status_active IS
  'PRD-020: Optimizes getActiveForTable() and move destination validation';

-- 2. Create consolidated move player RPC
CREATE OR REPLACE FUNCTION rpc_move_player(
  p_casino_id UUID,
  p_actor_id UUID,
  p_slip_id UUID,
  p_new_table_id UUID,
  p_new_seat_number TEXT DEFAULT NULL,
  p_average_bet NUMERIC DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_slip rating_slip;
  v_closed_slip rating_slip;
  v_new_slip rating_slip;
  v_source_table_id UUID;
  v_duration INTEGER;
  v_move_group_id UUID;
  v_accumulated_seconds INTEGER;
  v_source_seats TEXT[];
  v_dest_seats TEXT[];
BEGIN
  -- Self-inject RLS context (ADR-015)
  PERFORM set_rls_context(p_actor_id, p_casino_id, 'pit_boss');

  -- 1. Lock and validate current slip
  SELECT * INTO v_current_slip
  FROM rating_slip
  WHERE id = p_slip_id AND casino_id = p_casino_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_slip.status = 'closed' THEN
    RAISE EXCEPTION 'RATING_SLIP_ALREADY_CLOSED' USING ERRCODE = 'P0003';
  END IF;

  v_source_table_id := v_current_slip.table_id;

  -- 2. Validate destination seat availability
  IF p_new_seat_number IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM rating_slip
      WHERE table_id = p_new_table_id
        AND seat_number = p_new_seat_number
        AND status IN ('open', 'paused')
        AND casino_id = p_casino_id
    ) THEN
      RAISE EXCEPTION 'SEAT_OCCUPIED' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- 3. Calculate duration and close current slip
  v_duration := EXTRACT(EPOCH FROM (now() - v_current_slip.start_time))::INTEGER;

  UPDATE rating_slip SET
    status = 'closed',
    end_time = now(),
    duration_seconds = v_duration,
    final_duration_seconds = v_duration,
    average_bet = COALESCE(p_average_bet, v_current_slip.average_bet)
  WHERE id = p_slip_id
  RETURNING * INTO v_closed_slip;

  -- 4. Calculate continuity metadata
  v_move_group_id := COALESCE(v_current_slip.move_group_id, v_current_slip.id);
  v_accumulated_seconds := COALESCE(v_current_slip.accumulated_seconds, 0) + v_duration;

  -- 5. Create new slip at destination
  INSERT INTO rating_slip (
    casino_id, visit_id, table_id, seat_number, status, start_time,
    previous_slip_id, move_group_id, accumulated_seconds, average_bet
  ) VALUES (
    p_casino_id,
    v_current_slip.visit_id,
    p_new_table_id,
    p_new_seat_number,
    'open',
    now(),
    p_slip_id,
    v_move_group_id,
    v_accumulated_seconds,
    p_average_bet
  )
  RETURNING * INTO v_new_slip;

  -- 6. Get updated seat occupancy for both tables
  SELECT ARRAY_AGG(seat_number) INTO v_source_seats
  FROM rating_slip
  WHERE table_id = v_source_table_id
    AND status IN ('open', 'paused')
    AND casino_id = p_casino_id;

  SELECT ARRAY_AGG(seat_number) INTO v_dest_seats
  FROM rating_slip
  WHERE table_id = p_new_table_id
    AND status IN ('open', 'paused')
    AND casino_id = p_casino_id;

  -- 7. Audit log
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (p_casino_id, 'rating_slip', p_actor_id, 'move', jsonb_build_object(
    'from_slip_id', p_slip_id,
    'to_slip_id', v_new_slip.id,
    'from_table_id', v_source_table_id,
    'to_table_id', p_new_table_id
  ));

  RETURN jsonb_build_object(
    'closedSlipId', v_closed_slip.id,
    'newSlipId', v_new_slip.id,
    'moveGroupId', v_move_group_id,
    'accumulatedSeconds', v_accumulated_seconds,
    'sourceTableId', v_source_table_id,
    'sourceTableSeats', COALESCE(v_source_seats, ARRAY[]::TEXT[]),
    'destinationTableSeats', COALESCE(v_dest_seats, ARRAY[]::TEXT[]),
    'newSlip', jsonb_build_object(
      'id', v_new_slip.id,
      'tableId', v_new_slip.table_id,
      'seatNumber', v_new_slip.seat_number,
      'status', v_new_slip.status,
      'startTime', v_new_slip.start_time
    )
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION rpc_move_player TO authenticated;

COMMENT ON FUNCTION rpc_move_player IS
  'PRD-020: Consolidated move player operation. Reduces 4 DB round-trips to 1.';
```

---

## Appendix C: Implementation Workstreams

### WS1: Modal Closure Fix (P0)

**Agent:** frontend-design-pt-2
**Effort:** 1 hour

- [ ] Update `handleMovePlayer` to call `closeModal()` on success
- [ ] Update `handleMovePlayer` to call `setSelectedSlip(null)` on success
- [ ] Add `sourceTableId` parameter from `selectedTableId`
- [ ] Verify error path keeps modal open
- [ ] Test "No Data Available" dialog no longer appears

### WS2: Targeted Cache Invalidation (P0)

**Agent:** frontend-design-pt-2
**Effort:** 2 hours

- [ ] Add `sourceTableId` and `casinoId` to `MovePlayerMutationInput`
- [ ] Replace `dashboardKeys.slips.scope` with `activeSlips(tableId)` for source + destination
- [ ] Remove `dashboardKeys.tables.scope` invalidation
- [ ] Remove `ratingSlipModalKeys.scope` invalidation
- [ ] Verify network tab shows max 4-5 requests after move

### WS3: Consolidated Move RPC (P1)

**Agent:** backend-service-builder
**Effort:** 4 hours

- [ ] Create migration with `rpc_move_player` function
- [ ] Update `services/rating-slip/crud.ts` to call RPC
- [ ] Update move route handler to use new RPC
- [ ] Test latency reduction (target <400ms)

### WS4: Status Active Alias (P1)

**Agent:** api-builder
**Effort:** 2 hours

- [ ] Update `ratingSlipListQuerySchema` to accept `active` as status value
- [ ] Modify `listRatingSlips` in crud.ts to handle `active` → `['open', 'paused']`
- [ ] Update OpenAPI spec
- [ ] Test backward compatibility

### WS5: Enhanced Move Response (P1)

**Agent:** api-builder
**Effort:** 2 hours

- [ ] Update `MovePlayerResponse` type with seat arrays and newSlip
- [ ] Wire response from `rpc_move_player` JSONB
- [ ] Update client-side `movePlayer` http function
- [ ] Update Zod schema for response validation

### WS6: E2E Test Coverage (P0)

**Agent:** e2e-testing
**Effort:** 4 hours

- [ ] Add test: Move player closes modal
- [ ] Add test: Move player updates table layout within 300ms
- [ ] Add test: Move player failure shows error in modal
- [ ] Add test: Network request count validation
- [ ] Update existing rating-slip-modal.spec.ts

---

## Appendix D: Architecture Audit Summary

**Investigation Date:** 2025-12-27
**Agents:** Lead Architect, RLS Expert, API Builder

### Unanimous Findings

| Finding | Severity | Root Cause |
|---------|----------|------------|
| Over-broad `.scope` invalidation | HIGH | `dashboardKeys.slips.scope` hits ALL tables |
| N×2 HTTP pattern | HIGH | Each query makes 2 calls (open + paused) |
| 4 sequential DB operations | MEDIUM | Move uses separate close + start RPCs |
| API forces multiple calls | MEDIUM | No `status=active` alias |

### Validated Architecture

| Component | Status | Notes |
|-----------|--------|-------|
| Service boundaries | VALID | RatingSlipService / RatingSlipModalService correctly separated |
| BFF RPC pattern | VALID | 69% latency reduction proven in PRD-018 |
| RLS policies | VALID | ADR-015 Pattern C correctly implemented |
| Cache invalidation | NEEDS FIX | Primary cause of HTTP cascade |

### Proposed ADR-024

Based on this investigation, recommend new governance ADR:
- **ADR-024: Query Key Namespace and Cache Invalidation Standard**
- Mutations MUST use targeted invalidation, not `.scope`
- Each domain should have ONE key namespace per entity type

---

## Appendix E: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-27 | Engineering | Initial draft from ISSUE-2CAC5C0B |
| 2.0.0 | 2025-12-27 | Engineering | Expanded with multi-agent audit findings; added P1 scope |

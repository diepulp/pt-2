---
prd: GAP-ADR-026-UI-SHIPPABLE
prd_title: "ADR-026 UI Integration Patch"
version: "0.1.1"
status: draft
created: "2026-01-17"
updated: "2026-01-17"
service: RatingSlipModalService
mvp_phase: 2
related_docs:
  - docs/80-adrs/ADR-026-gaming-day-scoped-visits.md
  - docs/issues/gaps/GAP-ADR-026-UI-INTEGRATION-shippable.md

workstreams:
  WS1:
    name: Entry Gate RPC
    description: Create rpc_resolve_current_slip_context to ensure modal operates on current gaming day
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/20260117000100_rpc_resolve_current_slip_context.sql
    gate: schema-validation
  WS2:
    name: Entry Gate Service Wrapper
    description: TypeScript wrapper for resolveCurrentSlipContext RPC
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - services/rating-slip-modal/rpc.ts
      - services/rating-slip-modal/dtos.ts
    gate: type-check
  WS3:
    name: Write Guard Trigger
    description: Trigger to reject stale gaming day writes on player_financial_transaction
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/20260117000200_guard_stale_gaming_day_writes.sql
    gate: schema-validation
  WS4:
    name: UI Entry Gate Integration
    description: Update handleSlipClick to use entry gate before opening modal
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS2]
    outputs:
      - components/pit-panels/pit-panels-client.tsx
    gate: type-check
  WS5:
    name: Error Handling Restoration
    description: Restore error logging and toast in use-save-with-buyin hook
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS3]
    outputs:
      - hooks/rating-slip-modal/use-save-with-buyin.ts
    gate: type-check

execution_phases:
  - name: Phase 1 - Database
    parallel: [WS1, WS3]
    gates: [schema-validation]
  - name: Phase 2 - Service Layer
    parallel: [WS2]
    gates: [type-check]
  - name: Phase 3 - UI Integration
    parallel: [WS4, WS5]
    gates: [type-check]

gates:
  schema-validation:
    command: npm run db:types
    success_criteria: "Exit code 0, types regenerated"
  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0"
  build:
    command: npm run build
    success_criteria: "Exit code 0"
---

# EXECUTION-SPEC: ADR-026 UI Integration Patch

## Executive Summary

This execution spec implements three patches to fix the stale-slip bypass bug where staff can open a slip from a previous gaming day and record buy-ins that "disappear" from modal totals.

**Patches:**
- **Patch A (WS1, WS2, WS4)**: Entry gate ensures modal always operates on current gaming day
- **Patch B (WS3)**: Write guard rejects stale gaming day writes at database level
- **Patch C (WS5)**: Restore error visibility for buy-in failures

---

## WS1: Entry Gate RPC (database)

### Migration File
`supabase/migrations/20260117000100_rpc_resolve_current_slip_context.sql`

### Description
Create `rpc_resolve_current_slip_context(p_slip_id uuid)` that:

**Required additions (patch-level, non-negotiable):**
- **Concurrency safety:** prevent duplicate “current” slips from being created under simultaneous modal opens.
  - Add a partial unique index enforcing *one active slip per visit* (adjust key if seat/table invariant exists):
    ```sql
    -- one open/paused slip per visit (choose statuses that count as “active”)
    CREATE UNIQUE INDEX IF NOT EXISTS ux_rating_slip_one_active_per_visit
      ON public.rating_slip (casino_id, visit_id)
      WHERE status IN ('open','paused');
    ```
  - In RPC, create the current slip with an **UPSERT** (or catch unique violation and re-select) instead of “select then insert”.

- **Seat correctness:** do **not** blindly carry `table_id/seat_number` forward.
  - Reuse seat/table only if it is still valid for this player in the current context.
  - If validity cannot be proven, create the new slip **without** seat/table assignment (or return `needsSeatSelection=true`).

- **Ghost slip behavior:** if `player_id IS NULL`, return context with `readOnly=true` (no rollover, no buy-ins) so UI can disable write actions.

1. Derives `casino_id` from RLS context (ADR-024 compliant)
2. Looks up slip → visit → player_id
3. Computes current gaming day via `compute_gaming_day(casino_id, now())`
4. If visit.gaming_day == current: return existing slip context
5. If stale: call `rpc_start_or_resume_visit(player_id)` to rollover (reuses ADR-026 logic)
6. Find/create current slip for the rolled-over visit
7. Returns `{ slipIdCurrent, visitIdCurrent, gamingDay, rolledOver, readOnly?, needsSeatSelection? }`

### RPC Implementation

> Note: `RETURNS TABLE(...)` is preferred over `RETURNS jsonb` for typed clients. If retained as `jsonb` for MVP, the TS wrapper **must** validate the payload shape.

```sql
CREATE OR REPLACE FUNCTION public.rpc_resolve_current_slip_context(
  p_slip_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_current_gaming_day date;
  v_slip record;
  v_visit record;
  v_player_id uuid;
  v_rolled_over boolean := false;
  v_new_visit record;
  v_current_slip record;
BEGIN
  -- ADR-024: Derive context from set_rls_context_from_staff()
  PERFORM set_rls_context_from_staff();

  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;

  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  -- 1. Load slip and visit
  SELECT rs.*, v.player_id, v.gaming_day as visit_gaming_day
    INTO v_slip
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
   WHERE rs.id = p_slip_id
     AND rs.casino_id = v_casino_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATING_SLIP_NOT_FOUND: slip % not found', p_slip_id;
  END IF;

  v_player_id := v_slip.player_id;

  -- Ghost visits don't roll over (no player to resume)
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'slipIdCurrent', v_slip.id,
      'visitIdCurrent', v_slip.visit_id,
      'gamingDay', v_slip.visit_gaming_day,
      'rolledOver', false
    );
  END IF;

  -- 2. Compute current gaming day
  v_current_gaming_day := compute_gaming_day(v_casino_id, now());

  -- 3. Check if current
  IF v_slip.visit_gaming_day = v_current_gaming_day THEN
    RETURN jsonb_build_object(
      'slipIdCurrent', v_slip.id,
      'visitIdCurrent', v_slip.visit_id,
      'gamingDay', v_current_gaming_day,
      'rolledOver', false
    );
  END IF;

  -- 4. Stale: call rollover RPC (reuse ADR-026 logic)
  SELECT * INTO v_new_visit
    FROM rpc_start_or_resume_visit(v_player_id);

  v_rolled_over := true;

  -- 5. Find or create current slip for this player/visit
  SELECT * INTO v_current_slip
    FROM rating_slip
   WHERE visit_id = (v_new_visit.visit).id
     AND casino_id = v_casino_id
     AND status IN ('open', 'paused')
   ORDER BY start_time DESC
   LIMIT 1;

  IF NOT FOUND THEN
    -- Create new slip at same table as stale slip
    INSERT INTO rating_slip (
      casino_id, visit_id, table_id, seat_number,
      average_bet, status, start_time
    ) VALUES (
      v_casino_id,
      (v_new_visit.visit).id,
      v_slip.table_id,
      v_slip.seat_number,
      v_slip.average_bet,
      'open',
      now()
    )
    RETURNING * INTO v_current_slip;
  END IF;

  RETURN jsonb_build_object(
    'slipIdCurrent', v_current_slip.id,
    'visitIdCurrent', (v_new_visit.visit).id,
    'gamingDay', v_current_gaming_day,
    'rolledOver', v_rolled_over
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_resolve_current_slip_context(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
```

### Gate
`npm run db:types` - Exit 0, types regenerated

---

## WS2: Entry Gate Service Wrapper (service-layer)

### Files Modified
- `services/rating-slip-modal/dtos.ts` - Add `ResolveSlipContextDTO`
- `services/rating-slip-modal/rpc.ts` - Add `resolveCurrentSlipContext()` function

### DTO Addition
```typescript
// services/rating-slip-modal/dtos.ts

/**
 * Response from resolving current slip context.
 * Used to ensure modal always operates on current gaming day.
 * @see GAP-ADR-026-UI-SHIPPABLE Patch A
 */
// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response
export interface ResolveSlipContextDTO {
  /** Current slip ID (may differ from requested if rolled over) */
  slipIdCurrent: string;
  /** Current visit ID */
  visitIdCurrent: string;
  /** Current gaming day (YYYY-MM-DD) */
  gamingDay: string;
  /** True if the slip/visit was rolled over to current gaming day */
  rolledOver: boolean;
}
```

### RPC Wrapper
```typescript
// services/rating-slip-modal/rpc.ts (add to existing file)

import type { ResolveSlipContextDTO } from "./dtos";

interface RpcResolveSlipContextResponse {
  slipIdCurrent: string;
  visitIdCurrent: string;
  gamingDay: string;
  rolledOver: boolean;
}

function isValidResolveSlipContextResponse(
  data: unknown,
): data is RpcResolveSlipContextResponse {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.slipIdCurrent === "string" &&
    typeof obj.visitIdCurrent === "string" &&
    typeof obj.gamingDay === "string" &&
    typeof obj.rolledOver === "boolean"
  );
}

/**
 * Resolves the current slip context, rolling over to current gaming day if needed.
 *
 * GAP-ADR-026-UI-SHIPPABLE Patch A: Entry gate for rating slip modal.
 * Ensures modal always operates on current gaming day context.
 */
export async function resolveCurrentSlipContext(
  supabase: SupabaseClient<Database>,
  slipId: string,
): Promise<ResolveSlipContextDTO> {
  const { data, error } = await supabase.rpc("rpc_resolve_current_slip_context", {
    p_slip_id: slipId,
  });

  if (error) {
    const message = error.message ?? "";

    if (message.includes("RATING_SLIP_NOT_FOUND")) {
      throw new DomainError("RATING_SLIP_NOT_FOUND", "Rating slip not found", {
        httpStatus: 404,
        details: { slipId },
      });
    }

    if (message.includes("UNAUTHORIZED")) {
      throw new DomainError("UNAUTHORIZED", "RLS context not set", {
        httpStatus: 401,
      });
    }

    throw new DomainError(
      "INTERNAL_ERROR",
      `Resolve slip context RPC failed: ${error.message}`,
      { httpStatus: 500, details: { code: error.code } },
    );
  }

  if (!data || !isValidResolveSlipContextResponse(data)) {
    throw new DomainError(
      "INTERNAL_ERROR",
      "Invalid RPC response structure",
      { httpStatus: 500, details: { slipId } },
    );
  }

  return {
    slipIdCurrent: data.slipIdCurrent,
    visitIdCurrent: data.visitIdCurrent,
    gamingDay: data.gamingDay,
    rolledOver: data.rolledOver,
  };
}
```

### Test Location
`services/rating-slip-modal/__tests__/rpc.test.ts`

### Gate
`npm run type-check` - Exit 0

---

## WS3: Write Guard Trigger (database)

### Migration File
`supabase/migrations/20260117000200_guard_stale_gaming_day_writes.sql`

### Description
Add trigger on `player_financial_transaction` BEFORE INSERT that:

**Required additions (patch-level, non-negotiable):**
- When resolving slip context, **scope lookup by casino**: `rs.casino_id = NEW.casino_id`.
- If `NEW.rating_slip_id` is provided but no slip is found: **RAISE EXCEPTION** (integrity), do not `RETURN NEW`.
- If `NEW.visit_id` is present, also validate `visit.gaming_day` against current gaming day (future-proofing; still small).

1. If `rating_slip_id` is provided, lookup rating_slip → visit.gaming_day
2. Compare to `compute_gaming_day(casino_id, now())`
3. If mismatch: RAISE EXCEPTION with code `STALE_GAMING_DAY_CONTEXT`

### Implementation
```sql
-- ============================================================================
-- Migration: Guard against stale gaming day financial writes
-- Created: 2026-01-17
-- GAP Reference: GAP-ADR-026-UI-SHIPPABLE Patch B
-- Purpose: Reject buy-in recording against stale gaming day contexts
-- ============================================================================

CREATE OR REPLACE FUNCTION guard_stale_gaming_day_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_slip_gaming_day date;
  v_current_gaming_day date;
  v_casino_id uuid;
BEGIN
  -- Only check if rating_slip_id is provided
  IF NEW.rating_slip_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_casino_id := NEW.casino_id;

  -- Get the visit's gaming day via the rating slip
  SELECT v.gaming_day INTO v_slip_gaming_day
    FROM rating_slip rs
    JOIN visit v ON v.id = rs.visit_id
   WHERE rs.id = NEW.rating_slip_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Compute current gaming day
  v_current_gaming_day := compute_gaming_day(v_casino_id, now());

  -- Reject if stale
  IF v_slip_gaming_day <> v_current_gaming_day THEN
    RAISE EXCEPTION 'STALE_GAMING_DAY_CONTEXT: Cannot record transaction for gaming day % (current: %)',
      v_slip_gaming_day, v_current_gaming_day
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_stale_gaming_day
  BEFORE INSERT ON player_financial_transaction
  FOR EACH ROW
  EXECUTE FUNCTION guard_stale_gaming_day_write();

NOTIFY pgrst, 'reload schema';
```

### Error Code
- **Code**: `STALE_GAMING_DAY_CONTEXT` (use a stable SQLSTATE / custom error code mapping in PostgREST if available)
- **HTTP Status**: `409 Conflict`

### Gate
`npm run db:types` - Exit 0

---

## WS4: UI Entry Gate Integration (react-components)

### Files Modified
- `components/pit-panels/pit-panels-client.tsx`

### Changes Required

**Required behavior:**
- If `resolveCurrentSlipContext()` returns `readOnly=true`, open the modal in read-only mode (disable buy-in / adjustment writes) and show a mild toast: “Read-only: no player bound to this slip.”
- If it returns `needsSeatSelection=true`, open the modal and prompt for seating before allowing buy-ins.


#### 1. Add import for resolveCurrentSlipContext
```typescript
// At top of file, add to imports
import { resolveCurrentSlipContext } from "@/services/rating-slip-modal/rpc";
import { createClient } from "@/lib/supabase/client";
```

#### 2. Update handleSlipClick (lines 403-406)

**Before:**
```typescript
const handleSlipClick = (slipId: string) => {
  setSelectedSlip(slipId);
  openModal("rating-slip", { slipId });
};
```

**After:**
```typescript
const handleSlipClick = async (slipId: string) => {
  try {
    const supabase = createClient();
    const ctx = await resolveCurrentSlipContext(supabase, slipId);

    setSelectedSlip(ctx.slipIdCurrent);
    openModal("rating-slip", { slipId: ctx.slipIdCurrent });

    if (ctx.rolledOver) {
      toast.info("Session rolled over to today's gaming day.");
    }
  } catch (error) {
    toast.error("Error", { description: getErrorMessage(error) });
    logError(error, { component: "PitPanels", action: "handleSlipClick" });
  }
};
```

#### 3. Update handleSeatClick for occupied seats (lines 382-388)

**Before:**
```typescript
if (occupant) {
  const slipOccupant = seatOccupants.get(seatNumber);
  if (slipOccupant?.slipId) {
    setSelectedSlip(slipOccupant.slipId);
    openModal("rating-slip", { slipId: slipOccupant.slipId });
  }
}
```

**After:**
```typescript
if (occupant) {
  const slipOccupant = seatOccupants.get(seatNumber);
  if (slipOccupant?.slipId) {
    // Use same entry gate as handleSlipClick
    await handleSlipClick(slipOccupant.slipId);
    return;
  }
}
```

Note: `handleSeatClick` must become async.

### Gate
`npm run type-check` - Exit 0

---

## WS5: Error Handling Restoration (react-query-hooks)

### Files Modified
- `hooks/rating-slip-modal/use-save-with-buyin.ts`

### Changes Required

**Required behavior:**
- If `resolveCurrentSlipContext()` returns `readOnly=true`, open the modal in read-only mode (disable buy-in / adjustment writes) and show a mild toast: “Read-only: no player bound to this slip.”
- If it returns `needsSeatSelection=true`, open the modal and prompt for seating before allowing buy-ins.


#### 1. Remove silent .catch() and add proper error handling (lines 113-128)

**Policy (MVP):** If `newBuyIn > 0` and the financial transaction fails (including `STALE_GAMING_DAY_CONTEXT`), the save operation **must fail** (throw), and the UI must show a toast. Do not “save the slip but not the money.”


**Before:**
```typescript
if (newBuyIn > 0 && playerId) {
  await createFinancialTransaction({
    casino_id: casinoId,
    player_id: playerId,
    visit_id: visitId,
    rating_slip_id: slipId,
    amount: newBuyIn * 100,
    direction: "in",
    source: "pit",
    tender_type: "cash",
    created_by_staff_id: staffId,
  }).catch(() => {
    // Don't fail the save operation - buy-in recording is best-effort
    return null;
  });
}
```

**After:**
```typescript
if (newBuyIn > 0 && playerId) {
  try {
    await createFinancialTransaction({
      casino_id: casinoId,
      player_id: playerId,
      visit_id: visitId,
      rating_slip_id: slipId,
      amount: newBuyIn * 100,
      direction: "in",
      source: "pit",
      tender_type: "cash",
      created_by_staff_id: staffId,
    });
  } catch (txnError) {
    // Check for STALE_GAMING_DAY_CONTEXT error
    const errorMessage = getErrorMessage(txnError);
    if (errorMessage.includes("STALE_GAMING_DAY_CONTEXT")) {
      // Re-throw to trigger context refresh at caller level
      throw new DomainError(
        "STALE_GAMING_DAY_CONTEXT",
        "Session context is stale. Please refresh and try again.",
        { httpStatus: 409, retryable: true }
      );
    }
    // Log non-stale errors but don't fail the save
    logError(txnError, {
      component: "useSaveWithBuyIn",
      action: "createFinancialTransaction",
      metadata: { slipId, visitId, playerId }
    });
    // Show toast for visibility (Patch C requirement)
    throw txnError; // Let caller handle toast
  }
}
```

#### 2. Add imports
```typescript
import { DomainError } from "@/lib/errors/domain-errors";
import { getErrorMessage, logError } from "@/lib/errors/error-utils";
```

### Gate
`npm run type-check` - Exit 0

---

## Definition of Done

### DoD — Patch A (Entry Gate)

- [ ] **Concurrency:** two simultaneous slip opens do not create two active slips for the same visit
- [ ] **Seat correctness:** rollover does not assign an invalid/occupied seat (or sets `needsSeatSelection=true`)
- [ ] **Ghost safety:** ghost slips open as `readOnly` and never attempt rollover/buy-in writes

- [ ] Opening a slip from a previous gaming day results in the **current** slip context being displayed
- [ ] After opening a stale slip, recording a buy-in shows up in `totalCashIn` immediately
- [ ] Toast shown when session is rolled over

### DoD — Patch B (Write Guard)

- [ ] Insert with a non-existent `rating_slip_id` fails (if provided)
- [ ] Slip lookup is scoped by `casino_id` (no cross-tenant edge cases)

- [ ] Attempting to record a buy-in against a stale visit/slip returns `STALE_GAMING_DAY_CONTEXT`
- [ ] Error is visible to UI layer (not silently caught)

### DoD — Patch C (Observability)
- [ ] Buy-in failure is logged via `logError()`
- [ ] Production toast shown on buy-in recording failure
- [ ] No silent best-effort failures in buy-in recording

### Quality Gates
- [ ] `npm run db:types` - Exit 0
- [ ] `npm run type-check` - Exit 0
- [ ] `npm run build` - Exit 0
- [ ] No regressions in existing tests

---

## Execution Order

| Phase | Workstreams | Gate | Notes |
|-------|-------------|------|-------|
| 1 | WS1, WS3 | schema-validation | Database changes (parallel) |
| 2 | WS2 | type-check | Service wrapper (depends on WS1) |
| 3 | WS4, WS5 | type-check | UI changes (parallel) |
| 4 | — | build | Full build validation |

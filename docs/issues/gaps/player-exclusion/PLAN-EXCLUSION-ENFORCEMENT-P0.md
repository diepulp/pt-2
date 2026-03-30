# Plan: Exclusion Enforcement Wiring + Visit Lifecycle Completion

**Status:** PENDING PEER REVIEW
**Date:** 2026-03-29
**Branch:** `player-exl-fix`
**Gap refs:** GAP-EXCL-ENFORCE-001, GAP-VISIT-LIFECYCLE-001

---

## Context

Player exclusion enforcement has a single gate: `rpc_start_or_resume_visit`. Multiple paths bypass it — existing visits persist all gaming day, and all rating slip lifecycle RPCs (`start`, `resume`, `move`) operate without checking exclusion status. An excluded player can be seated, rated, resumed, and moved.

Separately, the operator workflow is incomplete: rating slip close keeps the visit alive (correct), but there is no "end session" UI, and `startFromPrevious` (the continuation flow that depends on closed visits) is built but not wired to the dashboard. These are two sides of the same gap.

The visit architecture is sound and is not to be altered. We are wiring exclusion checks into existing paths and exposing the existing visit close + continuation mechanisms.

## Scope

### P0 — Exclusion enforcement (this plan)
1. Migration: Add exclusion check to 3 activity-creating RPCs
2. Migration: Auto-close visit + slips inside `rpc_create_player_exclusion` on `hard_block`
3. UI: Exclusion guard in `new-slip-modal.tsx` active-visit branch

### P1 — Visit lifecycle operator workflow (separate scope, logged as GAP-VISIT-LIFECYCLE-001)

Logged at `GAP-VISIT-LIFECYCLE-OPERATOR-WORKFLOW.md` (same directory). Key findings:

- **No "End Session" UI** — `useCloseVisit()` hook exists, no component uses it
- **Closed Sessions panel shows slips, not visits** — semantically misleading
- **`onStartFromPrevious` miswired** — opens slip modal instead of continuation flow
- **`StartFromPreviousModal` built but unwired** — only in review page
- **`startFromPrevious` has no exclusion check** — covered by P0 Layer 1 RPC gate

These are tangentially related to exclusion: auto-close on hard_block produces closed visits that need visible lifecycle in the dashboard. But the wiring is a separate scope — visit lifecycle UX, not exclusion safety.

---

## Implementation

### Step 1: Migration — Exclusion checks in slip RPCs

**File:** `supabase/migrations/<timestamp>_add_exclusion_check_to_slip_rpcs.sql`

One migration, three `CREATE OR REPLACE FUNCTION` statements. Each RPC already derives `v_player_id` from the visit or needs a simple JOIN.

#### 1a. `rpc_start_rating_slip`

Current code (migration `20260318131945`, line 70-74) already gets `v_player_id` from visit:
```sql
SELECT player_id, visit_kind INTO v_player_id, v_visit_kind
FROM visit WHERE id = p_visit_id AND casino_id = v_casino_id AND ended_at IS NULL;
```

Insert after this block, before table validation:
```sql
-- Exclusion enforcement (GAP-EXCL-ENFORCE-001)
IF get_player_exclusion_status(v_player_id, v_casino_id) = 'blocked' THEN
  RAISE EXCEPTION 'PLAYER_EXCLUDED: Player has active hard_block exclusion'
    USING ERRCODE = 'P0001';
END IF;
```

Redefine full function body (copy from `20260318131945` lines 33-164, insert check).

#### 1b. `rpc_resume_rating_slip`

Current code (migration `20260303193305`, line 174) looks up the slip but does NOT get player_id. Add a visit JOIN after the slip lookup:

```sql
-- Derive player_id from visit for exclusion check
SELECT v.player_id INTO v_player_id
FROM visit v WHERE v.id = v_result.visit_id;

-- Exclusion enforcement (GAP-EXCL-ENFORCE-001)
IF v_player_id IS NOT NULL
   AND get_player_exclusion_status(v_player_id, v_casino_id) = 'blocked' THEN
  RAISE EXCEPTION 'PLAYER_EXCLUDED: Player has active hard_block exclusion'
    USING ERRCODE = 'P0001';
END IF;
```

Add `v_player_id uuid;` to DECLARE block. Redefine full function body (copy from `20260303193305` lines 126-226, insert check).

#### 1c. `rpc_move_player`

Current code (migration `20260307114918`, line 243) looks up the slip. Derive player_id from the slip's visit:

```sql
-- Derive player_id for exclusion check
SELECT v.player_id INTO v_player_id
FROM visit v WHERE v.id = v_current_slip.visit_id;

-- Exclusion enforcement (GAP-EXCL-ENFORCE-001)
IF v_player_id IS NOT NULL
   AND get_player_exclusion_status(v_player_id, v_casino_id) = 'blocked' THEN
  RAISE EXCEPTION 'PLAYER_EXCLUDED: Player has active hard_block exclusion'
    USING ERRCODE = 'P0001';
END IF;
```

Add `v_player_id uuid;` to DECLARE block. Redefine full function body (copy from `20260307114918` lines 171-466, insert check).

**Note:** `soft_alert` is intentionally allowed through — the warning was already displayed at visit start. Only `blocked` (hard_block) is rejected.

**Note:** Ghost visits (`v_player_id IS NULL`) skip the check — they have no player identity to check against.

---

### Step 2: Extend `rpc_create_player_exclusion` — auto-close visit + slips on hard_block

**Same migration file** as Step 1.

Redefine `rpc_create_player_exclusion` (current in `20260328132317`). After the INSERT RETURNING, add:

```sql
-- GAP-EXCL-ENFORCE-001 Layer 2: Auto-close visit + slips on hard_block
IF p_enforcement = 'hard_block' THEN
  -- Close all open/paused rating slips for this player at this casino
  -- Pattern: same as stale slip closure in rpc_start_or_resume_visit
  UPDATE rating_slip rs
  SET status = 'closed',
      end_time = now(),
      computed_theo_cents = 0  -- Forced closure, no meaningful theo
  WHERE rs.casino_id = v_casino_id
    AND rs.status IN ('open', 'paused')
    AND rs.visit_id IN (
      SELECT v.id FROM visit v
      WHERE v.player_id = p_player_id
        AND v.casino_id = v_casino_id
        AND v.ended_at IS NULL
    );

  -- Close active visit(s) for this player
  UPDATE visit
  SET ended_at = now()
  WHERE player_id = p_player_id
    AND casino_id = v_casino_id
    AND ended_at IS NULL;
END IF;
```

The `p_enforcement` parameter is already available (it's a function param). `v_casino_id` and `p_player_id` are already in scope.

**Note:** `computed_theo_cents = 0` matches the stale-slip-closure pattern already used in `rpc_start_or_resume_visit` STEP 6 (ADR-039 D3). The `chk_closed_slip_has_theo` CHECK constraint requires non-null `computed_theo_cents` on closed slips.

---

### Step 3: UI — Exclusion guard in `new-slip-modal.tsx`

**File:** `components/dashboard/new-slip-modal.tsx`

In the active-visit branch (line 209), after getting `visitId`, add an exclusion status check before creating the slip:

```typescript
if (activeVisitResponse.has_active_visit && activeVisitResponse.visit) {
  visitId = activeVisitResponse.visit.id;

  // GAP-EXCL-ENFORCE-001: Check exclusion even when reusing existing visit
  const { getExclusionStatus } = await import('@/services/player/exclusion-http');
  const exclStatus = await getExclusionStatus(selectedPlayer.id);
  if (exclStatus.status === 'excluded') {
    setError('This player has an active exclusion and cannot be seated.');
    return;
  }
  if (exclStatus.status === 'alert') {
    toast.warning('Exclusion Alert', {
      description: 'Player has an active soft alert exclusion.',
      icon: <AlertTriangle className="h-4 w-4" />,
      duration: 10_000,
    });
  }
}
```

Check the exact exclusion-http import path and `ExclusionStatusDTO` shape before implementing — the status field may use different values ('excluded'/'clear' vs 'blocked'/'alert').

**Files to verify:**
- `services/player/exclusion-http.ts` — `getExclusionStatus()` signature and return type
- `services/player/exclusion-dtos.ts` — `ExclusionStatusDTO` shape

---

### Step 4: Update gap document

**File:** `docs/issues/gaps/player-exclusion/GAP-EXCLUSION-ENFORCEMENT-BYPASS.md`

Mark Layer 1, 2, 3 (RPC + visit termination + UI guard) as RESOLVED with commit ref.

Note P1 follow-ups:
- Wire `useCloseVisit()` to dashboard (end patron session button)
- Wire `startFromPrevious` to pit dashboard (continuation after session end)
- These complete the operator workflow but are not exclusion-specific

---

### Step 5: Regenerate types + tests

1. `npm run db:types-local` — regenerate `types/database.types.ts`
2. `npm run type-check` — verify no regressions
3. Run existing exclusion integration tests: `npx jest services/player/__tests__/exclusion-rpc.int.test.ts`
4. Run rating slip tests: `npx jest services/rating-slip/`
5. Add integration test cases for:
   - `rpc_start_rating_slip` rejects when player has `hard_block`
   - `rpc_resume_rating_slip` rejects when player has `hard_block`
   - `rpc_move_player` rejects when player has `hard_block`
   - `rpc_create_player_exclusion` with `hard_block` auto-closes visit + slips
   - All RPCs allow `soft_alert` and `monitor` enforcement levels

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_add_exclusion_enforcement_to_slip_rpcs.sql` | NEW — redefines 4 RPCs with exclusion checks |
| `components/dashboard/new-slip-modal.tsx` | Add exclusion guard in active-visit branch |
| `docs/issues/gaps/player-exclusion/GAP-EXCLUSION-ENFORCEMENT-BYPASS.md` | Mark resolved |
| `types/database.types.ts` | Regenerated (no manual edit) |
| `services/player/__tests__/exclusion-enforcement.int.test.ts` | NEW — integration tests |

## Verification

1. `supabase db reset` — apply all migrations including new one
2. `npm run db:types-local` — regenerate types
3. `npm run type-check` — passes
4. `npx jest services/player/` — all exclusion tests pass
5. `npx jest services/rating-slip/` — no regressions
6. Manual: Create hard_block exclusion for player with active visit → verify visit + slips auto-closed
7. Manual: Attempt to start new slip for hard_block player → verify rejection at both UI and RPC level
8. Manual: Attempt to resume paused slip for hard_block player → verify rejection
9. `npm run build` — production build passes

## Review Guidance for Domain Experts

**Challenge these assumptions:**
1. Is `computed_theo_cents = 0` correct for forced closures, or should we materialize the actual theo up to the moment of exclusion?
2. Should `soft_alert` exclusions also block at the RPC level (current plan: allow through, warn at visit start only)?
3. Is closing the visit on `hard_block` sufficient, or should `soft_alert` also close the visit?
4. Should the auto-close in `rpc_create_player_exclusion` produce audit_log entries for the forced slip/visit closures?
5. Race condition: if an operator submits a rating slip at the same moment another operator creates an exclusion, the RPC check is the last gate — is `SERIALIZABLE` isolation needed or is the current `READ COMMITTED` sufficient?

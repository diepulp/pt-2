# GAP: Excluded Player Can Be Seated, Rated, Resumed, and Moved

**ID:** GAP-EXCL-ENFORCE-001
**Date:** 2026-03-29
**Severity:** P0 — Safety/Compliance
**Status:** RESOLVED (P0 layers 1-3 + UI guard)
**Resolved:** 2026-03-29
**EXEC-SPEC:** EXEC-055-exclusion-enforcement-wiring.md
**Migration:** 20260329173121_add_exclusion_enforcement_to_slip_rpcs.sql
**Branch:** `player-exl-fix`
**Reporter:** Agent (code trace + live reproduction)

---

## Summary

An excluded player (any enforcement level including `hard_block`) can be added to a gaming table, have a rating slip opened, have a paused slip resumed, and be moved between tables. The exclusion enforcement gate exists **only** inside `rpc_start_or_resume_visit` — all downstream rating slip operations bypass it entirely.

**Structural root cause:** Closing a rating slip does NOT end the visit. The visit persists with `ended_at IS NULL`, creating a permanent bypass path for any future slip operations against that visit.

## Reproduction

### Scenario 1: New slip via existing visit
1. Player A starts a visit (no exclusion) — visit created, `ended_at IS NULL`
2. Admin creates a `hard_block` exclusion for Player A
3. Operator opens **New Rating Slip** modal on any table
4. Searches for Player A, selects a seat, clicks **Start Slip**
5. **Result:** Rating slip created. Player A seated despite active exclusion.

### Scenario 2: Resume paused slip after exclusion
1. Player A has an open visit with a `paused` rating slip
2. Admin creates a `hard_block` exclusion for Player A
3. Operator clicks **Resume** on the paused slip via seat context menu
4. **Result:** Slip resumes to `open` state. Player A actively rated despite exclusion.

### Scenario 3: Move player after exclusion
1. Player A has an open visit with an active rating slip at Table 1
2. Admin creates a `hard_block` exclusion for Player A
3. Operator moves Player A from Table 1 to Table 2
4. **Result:** Source slip closed, **new slip created** at Table 2 for excluded player.

**Expected for all scenarios:** Operation rejected with "Player has an active exclusion."

## Root Cause Analysis

### Structural flaw: Visit outlives all rating slips

`rpc_close_rating_slip` (migration `20260307114918`, lines 9-160) sets `rating_slip.status='closed'` and `end_time=now()`. It **never touches the `visit` table**. After all slips for a visit are closed, the visit remains active (`ended_at IS NULL`).

There is no mechanism that:
- Auto-closes a visit when an exclusion is created
- Checks exclusion status when operating on an existing visit's slips
- Links visit lifecycle to exclusion lifecycle

The visit becomes a persistent "token" that bypasses the exclusion gate indefinitely — until the gaming day rolls over (which auto-closes stale visits via `rpc_start_or_resume_visit` STEP 5-6).

### Gap 1: Active-visit shortcut bypasses exclusion check (UI layer)

**File:** `components/dashboard/new-slip-modal.tsx`, lines 206-244

```typescript
// Line 206: Check for existing visit FIRST
const activeVisitResponse = await getActiveVisit(selectedPlayer.id);

if (activeVisitResponse.has_active_visit && activeVisitResponse.visit) {
  // Line 210: Use existing visit — SKIPS startVisit() entirely
  visitId = activeVisitResponse.visit.id;
} else {
  // Line 216: Start new visit — exclusion check happens HERE (inside RPC)
  const visitResult = await startVisit(selectedPlayer.id);
}

// Line 257: Proceeds to create rating slip regardless of exclusion status
createSlipMutation.mutate({ visit_id: visitId, table_id, seat_number });
```

When `getActiveVisit()` returns a pre-existing visit (created before the exclusion), the code takes the `if` branch, never calls `startVisit()`, and the exclusion check inside `rpc_start_or_resume_visit` never executes.

### Gap 2: No exclusion check in any rating slip lifecycle RPC

| RPC | Latest Migration | Exclusion Check | Creates Activity |
|-----|-----------------|----------------|-----------------|
| `rpc_start_rating_slip` | `20260318131945` | **NONE** | Yes — new slip |
| `rpc_resume_rating_slip` | `20260303193305` | **NONE** | Yes — paused→open |
| `rpc_move_player` | `20260307114918` | **NONE** | Yes — new slip at dest |
| `rpc_pause_rating_slip` | `20260303193305` | **NONE** | No (safe — reduces activity) |
| `rpc_close_rating_slip` | `20260307114918` | **NONE** | No (safe — terminates activity) |

The three activity-creating RPCs (`start`, `resume`, `move`) all derive `player_id` from the visit but never call `get_player_exclusion_status()`.

### Gap 3: `startFromPrevious` bypasses exclusion entirely (service layer)

**File:** `services/visit/crud.ts`, lines 592-716

The PRD-017 "Start From Previous" flow creates a new visit via direct `.from('visit').insert()` (line 674) and then calls `rpc_start_rating_slip` (line 690). It never calls `rpc_start_or_resume_visit`, so the exclusion check never fires. This is a completely independent visit-creation path with zero exclusion awareness.

### Gap 4: Visit close exists but is never exposed in UI

**File:** `hooks/visit/use-visit-mutations.ts`, lines 58-82

`useCloseVisit()` hook is exported and wired to `PATCH /api/v1/visits/[visitId]/close`. However, **no component imports it**. There is no UI to manually end a patron's visit. The only visit-close paths are:
- Gaming day rollover (auto-close stale visits in `rpc_start_or_resume_visit` STEP 5-6)
- Direct API call (no UI)

This means even if an operator recognizes an excluded player is seated, they have no button to terminate the visit.

### Gap 5: No visit reopen — close is terminal, but metrics are unaffected

Once `ended_at` is set on a visit, it cannot be reopened. The closest mechanism is `startFromPrevious` (PRD-017) which creates a **new** visit linked via `visit_group_id`.

**Metrics impact: NONE.** The visit table carries zero telemetry — it is a pure grouping shell:

| Metric | Owner | Field |
|--------|-------|-------|
| Length of play | `rating_slip` | `duration_seconds`, `final_duration_seconds` |
| Pause tracking | `rating_slip` | `pause_intervals` (tstzrange[]) |
| Theoretical win | `rating_slip` | `computed_theo_cents` (materialized at close) |
| Average bet | `rating_slip` | `average_bet`, `final_average_bet` |
| Session continuity | `rating_slip` | `accumulated_seconds`, `move_group_id` |
| Cross-visit grouping | `visit` | `visit_group_id` (structural link only) |

All play duration calculations are self-contained on the rating slip (`end_time - start_time - SUM(pause_intervals)`). Closing a visit mid-day does not distort any metric. The visit's `started_at`/`ended_at` are not inputs to any telemetry computation.

**Implication:** Forcibly closing a visit on exclusion is safe — it breaks no metrics. This makes "auto-close visit + slips on hard_block" a viable remediation with zero distortion risk.

### Why the existing enforcement is insufficient

The exclusion check lives in exactly one place: `rpc_start_or_resume_visit` (migration `20260310004409`). This was designed as the single gate under the assumption that every operation requires starting a visit first. That assumption fails because:

1. **Visit predates the exclusion** — the UI reuses the existing visit via `getActiveVisit()`
2. **Visit outlives all slips** — closing all slips does not end the visit
3. **Visit persists for the entire gaming day** — auto-close only happens on day rollover
4. **Resume/move operate on existing slips** — they never touch the visit-start path
5. **`startFromPrevious` creates visits directly** — bypasses the RPC entirely
6. **No UI to close a visit** — operator cannot manually terminate a compromised session

## Affected Components

| Layer | Component | Gap |
|-------|-----------|-----|
| **UI** | `new-slip-modal.tsx:206-244` | Active-visit branch skips `startVisit()` |
| **UI** | Seat context menu → Resume | No exclusion check before resume |
| **UI** | Move player modal | No exclusion check before move |
| **UI** | No component uses `useCloseVisit()` | Operator cannot terminate a visit |
| **API** | `GET /api/v1/visits/active` | Returns no exclusion status |
| **API** | `POST /api/v1/visits/start-from-previous` | No exclusion check |
| **Service** | `startFromPrevious()` in `visit/crud.ts` | Direct insert, bypasses exclusion gate |
| **RPC** | `rpc_start_rating_slip` | No exclusion check |
| **RPC** | `rpc_resume_rating_slip` | No exclusion check |
| **RPC** | `rpc_move_player` | No exclusion check (creates new slip at dest) |
| **RPC** | `rpc_start_or_resume_visit` | Only enforcement point (insufficient alone) |
| **Lifecycle** | Visit → Slip relationship | Closing slips does not close visit |
| **Lifecycle** | Exclusion → Visit relationship | Creating exclusion does not close visit |

## Impact

- **Compliance violation:** Hard-blocked players (trespass, regulatory, self-exclusion) can participate in rated gaming through multiple paths
- **Audit failure:** Rating slips created/resumed for excluded players produce loyalty accruals and theo calculations
- **Regulatory risk:** Self-excluded players generating gaming activity contradicts responsible gaming obligations
- **Time window:** Bypass persists for the entire gaming day (until auto-rollover), not just a brief race condition

## Recommended Remediation

### Layer 1: RPC enforcement (mandatory — defense-in-depth)

Add exclusion check to the three activity-creating RPCs. Each already derives `v_player_id` from the visit and `v_casino_id` from context:

```sql
-- After deriving v_player_id from visit, before any INSERT/UPDATE:
IF get_player_exclusion_status(v_player_id, v_casino_id) = 'blocked' THEN
  RAISE EXCEPTION 'PLAYER_EXCLUDED: Player has active hard_block exclusion'
    USING ERRCODE = 'P0001';
END IF;
```

Apply to:
- `rpc_start_rating_slip` — after line 74 (visit lookup)
- `rpc_resume_rating_slip` — after line 174 (slip lookup, derive player_id via visit join)
- `rpc_move_player` — after line 246 (current slip lookup, derive player_id via visit join)

### Layer 2: Visit termination on exclusion (recommended — zero metrics risk)

When a `hard_block` exclusion is created, auto-close the player's active visit and all open/paused slips. **This is safe because the visit carries zero telemetry** — all play metrics are self-contained on rating slips and are not affected by visit close.

Implementation options:
- A step inside `rpc_create_player_exclusion` after the INSERT (preferred — keeps logic in the same transaction)
- Or a trigger on `player_exclusion` INSERT WHERE `enforcement = 'hard_block'`

This eliminates the persistent visit "token" and forces a fresh `startVisit()` call (which has the exclusion check) for any future interaction.

### Layer 3: Exclusion check in `startFromPrevious` (required)

`startFromPrevious()` in `services/visit/crud.ts` creates visits via direct `.from('visit').insert()` and calls `rpc_start_rating_slip`, completely bypassing `rpc_start_or_resume_visit`. Add exclusion check before the insert (call `rpc_get_player_exclusion_status` or check via service layer).

### Layer 4: UI checks (recommended for UX)

- Add exclusion status check to the active-visit branch in `new-slip-modal.tsx`
- Add guard before resume/move operations in seat context menu
- Wire `useCloseVisit()` to a UI control so operators can manually terminate sessions

### Remediation priority

| Fix | Effort | Coverage | Priority |
|-----|--------|----------|----------|
| RPC checks in start/resume/move | 1 migration | All RPC paths, all callers | **P0 — do first** |
| Visit termination on hard_block | Addition to `rpc_create_player_exclusion` | Eliminates persistent bypass | **P0 — do second** |
| Exclusion check in `startFromPrevious` | 1 service edit | PRD-017 continuation path | **P0 — do third** |
| UI checks in modal/context menu | 3-4 component edits | UX only (not security) | **P1 — polish** |
| Wire `useCloseVisit()` to UI | 1 component edit | Operator escape hatch | **P1 — polish** |

## Dependency Graph

```
GAP-EXCL-ENFORCE-001 (this gap)
├─ P0 Layer 1: RPC enforcement migration
│  ├── Add exclusion check to rpc_start_rating_slip
│  ├── Add exclusion check to rpc_resume_rating_slip
│  └── Add exclusion check to rpc_move_player
├─ P0 Layer 2: Visit termination on exclusion
│  └── Extend rpc_create_player_exclusion to close active visit + slips
├─ P0 Layer 3: startFromPrevious exclusion check
│  └── services/visit/crud.ts — check before .from('visit').insert()
├─ P1 Layer 4: UI guards
│  ├── new-slip-modal.tsx — active-visit branch exclusion check
│  ├── seat-context-menu.tsx — resume guard
│  ├── move-player modal — move guard
│  └── Wire useCloseVisit() to a UI control (operator escape hatch)
├─ P1 Follow-ups (GAP-VISIT-LIFECYCLE-001)
│  ├── Wire useCloseVisit() to dashboard (end patron session button)
│  ├── Wire startFromPrevious to pit dashboard (continuation after close)
│  └── startFromPrevious visit-level exclusion check (crud.ts:674)
└─ Resolved
   ├── ISS-EXCL-001 (create/lift RPC boundary — RESOLVED in d3d8c40)
   ├── P0 Layer 1: RPC enforcement — RESOLVED (migration 20260329173121)
   │   ├── rpc_start_rating_slip: exclusion guard added
   │   ├── rpc_resume_rating_slip: exclusion guard added
   │   └── rpc_move_player: exclusion guard added
   ├── P0 Layer 2: Visit termination — RESOLVED (migration 20260329173121)
   │   └── rpc_create_player_exclusion: auto-close visits + slips on hard_block
   │       with audit_log entry (action: 'exclusion_auto_close')
   ├── P0 Layer 3: startFromPrevious — COVERED by Layer 1
   │   └── rpc_start_rating_slip now rejects hard_block regardless of caller
   └── P1 Layer 4 (partial): UI guard — RESOLVED
       └── new-slip-modal.tsx: active-visit branch exclusion check
```

## Related Documents

- `EXCLUSION-SURFACE-ISSUES-GAPS-2026-03-27.md` — ISS-EXCL-001 (RLS boundary, resolved)
- `GAP-PLAYER-EXCLUSION-UI-SURFACE.md` — UI surface gaps (create/lift dialogs)
- ADR-042: Player Exclusion Architecture
- ADR-030 D4: Session-var-only writes for critical tables
- Migration `20260310004409`: `rpc_start_or_resume_visit` (sole enforcement point)
- Migration `20260318131945`: `rpc_start_rating_slip` (no enforcement)
- Migration `20260303193305`: `rpc_resume_rating_slip`, `rpc_pause_rating_slip` (no enforcement)
- Migration `20260307114918`: `rpc_close_rating_slip`, `rpc_move_player` (no enforcement)

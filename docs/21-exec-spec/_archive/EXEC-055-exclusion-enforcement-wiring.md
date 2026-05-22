---
# EXECUTION-SPEC Frontmatter
# Source: docs/issues/gaps/player-exclusion/PLAN-EXCLUSION-ENFORCEMENT-P0.md
# Gap refs: GAP-EXCL-ENFORCE-001, GAP-VISIT-LIFECYCLE-001

prd: GAP-EXCL-ENFORCE-001
prd_title: "Exclusion Enforcement Wiring + Visit Auto-Close"
service: PlayerService
mvp_phase: 2

workstreams:
  WS1:
    name: Migration — Exclusion Checks in Slip RPCs + Auto-Close
    description: >
      Single migration redefining 4 SECURITY DEFINER RPCs:
      (1) rpc_start_rating_slip — add get_player_exclusion_status() guard after v_player_id derivation
      (2) rpc_resume_rating_slip — add visit JOIN for v_player_id, then exclusion guard
      (3) rpc_move_player — add visit JOIN for v_player_id, then exclusion guard
      (4) rpc_create_player_exclusion — add auto-close of open visits + slips on hard_block enforcement
      Only 'blocked' status (hard_block) is rejected. soft_alert and monitor pass through.
      Ghost visits (v_player_id IS NULL) skip the check.
      Auto-close block MUST include INSERT INTO audit_log (action: 'exclusion_auto_close').
      Migration MUST include REVOKE on get_player_exclusion_status from public/anon/authenticated.
    executor: rls-expert
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_add_exclusion_enforcement_to_slip_rpcs.sql
    gate: schema-validation
    estimated_complexity: high
    bounded_context: rating-slip-service, visit-service
    cross_context_reads:
      - player_exclusion via get_player_exclusion_status() (player-service)
    cross_context_writes:
      - visit (visit-service) — auto-close on hard_block
      - rating_slip (rating-slip-service) — auto-close on hard_block
    security_patterns:
      - SECURITY DEFINER with set_rls_context_from_staff()
      - ADR-024 INV-8 (no spoofable casino_id param)
      - ADR-030 D4 (session-var-only writes on critical tables)
    adrs:
      - ADR-018 (SECURITY DEFINER governance)
      - ADR-024 (authoritative context derivation)
      - ADR-039 (measurement layer — computed_theo_cents = 0 for forced closure)

  WS2:
    name: UI Guard — Exclusion Check in Active-Visit Branch
    description: >
      In new-slip-modal.tsx, the active-visit branch (line ~209) reuses an existing visit
      without checking exclusion status. Add getExclusionStatus() call:
      - If status === 'blocked': setError() and return (hard block)
      - If status === 'alert': toast.warning() with 10s duration (soft alert)
      The new-visit branch already has exclusion handling (visit start RPC checks).
      Uses ExclusionStatusDTO from services/player/exclusion-dtos.ts.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - components/dashboard/new-slip-modal.tsx
    gate: type-check
    estimated_complexity: low
    bounded_context: dashboard-frontend

  WS3:
    name: Integration Tests — Exclusion Enforcement
    description: >
      Integration tests verifying exclusion enforcement across all modified RPCs:
      - rpc_start_rating_slip rejects when player has hard_block
      - rpc_resume_rating_slip rejects when player has hard_block
      - rpc_move_player rejects when player has hard_block
      - rpc_create_player_exclusion with hard_block auto-closes active visits + open/paused slips
      - All RPCs allow soft_alert and monitor enforcement levels (no rejection)
      - Ghost visits (no player_id) skip exclusion check
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - services/player/__tests__/exclusion-enforcement.int.test.ts
    gate: test-pass
    estimated_complexity: medium
    bounded_context: player-service

execution_phases:
  - name: Phase 1 — Database Migration
    parallel: [WS1]
    gates: [schema-validation]

  - name: Phase 2 — UI + Tests
    parallel: [WS2, WS3]
    gates: [type-check, test-pass]

gates:
  schema-validation:
    command: npm run db:types-local
    success_criteria: "Exit code 0, types regenerated successfully"

  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0, no type errors"

  test-pass:
    command: npx jest services/player/__tests__/exclusion-enforcement.int.test.ts --no-coverage 2>&1 | tail -20
    success_criteria: "All tests pass"

  build:
    command: npm run build 2>&1 | tail -5
    success_criteria: "Exit code 0"

risks:
  - risk: "TOCTOU race: concurrent rpc_start_rating_slip can commit a new slip between exclusion INSERT and auto-close UPDATE under READ COMMITTED"
    mitigation: "Accepted for MVP. Narrow window, max 1 orphaned slip. WS1 exclusion guards in slip RPCs reject future operations. Orphaned slip is operationally recoverable. SELECT FOR UPDATE considered but deferred (contention cost vs. negligible risk)."
  - risk: "computed_theo_cents = 0 on forced closure may lose earned theo"
    mitigation: "Matches existing stale-slip-closure pattern (ADR-039 D3). Theo materialization for forced closures is a P2 enhancement"
  - risk: "startFromPrevious creates visit before rpc_start_rating_slip rejects — orphaned visit for excluded player"
    mitigation: "Accepted scope gap. Auto-close on hard_block (WS1 Step 2) cleans up when exclusion is created. Narrow race window only affects concurrent startFromPrevious during exclusion creation. P1 follow-up in GAP-VISIT-LIFECYCLE-001."

write_path_classification: detected
write_path_signals:
  - "rpc_create_player_exclusion: UPDATE rating_slip SET status='closed' (auto-close)"
  - "rpc_create_player_exclusion: UPDATE visit SET ended_at=now() (auto-close)"
  - "All 3 slip RPCs: existing mutations guarded by new exclusion check"
---

# EXECUTION-SPEC: GAP-EXCL-ENFORCE-001 — Exclusion Enforcement Wiring

## Overview

Player exclusion enforcement has a single gate: `rpc_start_or_resume_visit`. All downstream
rating slip lifecycle RPCs (`start`, `resume`, `move`) operate without checking exclusion status.
An excluded player with an existing visit can be seated, rated, resumed, and moved.

This spec wires exclusion checks into the 3 activity-creating RPCs and adds auto-close
behavior to `rpc_create_player_exclusion` for hard_block enforcement.

## Scope

- **In Scope**: Exclusion guard in 3 RPCs, auto-close on hard_block, UI guard in active-visit branch, integration tests
- **Out of Scope**: Visit lifecycle operator workflow (end session UI, startFromPrevious wiring) — logged as GAP-VISIT-LIFECYCLE-001

## Architecture Context

- **SRM**: PlayerService owns `player_exclusion` table (SRM v4.20.0, footnote 6). Cross-context read via `get_player_exclusion_status()` internal helper.
- **ADR-018**: All 4 RPCs are SECURITY DEFINER with `set_rls_context_from_staff()` context injection.
- **ADR-024**: casino_id derived from session vars, never from parameters.
- **ADR-030 INV-030-7**: Auto-close UPDATEs on `rating_slip` and `visit` execute within SECURITY DEFINER context with authoritative context derivation. Casino-scope enforcement via WHERE clause on `v_casino_id` (session-var-derived).
- **ADR-039 D3**: `computed_theo_cents = 0` for forced closures matches stale-slip pattern.
- **ADR-042 D2 deviation**: Auto-close inverts ADR-042 D2's "downstream contexts own enforcement at their write boundaries" model. Follows `rpc_start_or_resume_visit` STEP 5-6 cross-context write precedent. Cross-context writes to be registered in SRM.

## Workstream Details

### WS1: Migration — Exclusion Checks in Slip RPCs + Auto-Close

**Purpose**: Wire exclusion enforcement into all activity-creating RPCs and add auto-close on hard_block.

**Deliverables**:
1. Single migration file redefining 4 RPCs with `CREATE OR REPLACE FUNCTION`
2. Each of `rpc_start_rating_slip`, `rpc_resume_rating_slip`, `rpc_move_player` gets:
   - Derive `v_player_id` from visit (if not already available)
   - Call `get_player_exclusion_status(v_player_id, v_casino_id)`
   - If `'blocked'`: RAISE EXCEPTION 'PLAYER_EXCLUDED' with ERRCODE 'P0001'
   - Ghost visits (`v_player_id IS NULL`) skip the check
3. `rpc_create_player_exclusion` extended with auto-close block:
   - On `hard_block`: close all open/paused rating slips (status='closed', end_time=now(), computed_theo_cents=0)
   - On `hard_block`: close active visits (ended_at=now())
4. `REVOKE ALL ON FUNCTION get_player_exclusion_status(uuid, uuid) FROM PUBLIC, anon, authenticated` — defense-in-depth, restrict internal helper
5. `INSERT INTO audit_log` after auto-close with action `'exclusion_auto_close'`, domain `'player_exclusion'`, details including exclusion_id, closed visit/slip counts

**Source migrations** (current definitions to copy + extend):
- `rpc_start_rating_slip`: `20260318131945_snapshot_rounding_policy.sql`
- `rpc_resume_rating_slip`: `20260303193305_prd041_phase_a_ratingslip_derive.sql`
- `rpc_move_player`: `20260307114918_adr039_close_slip_materialize_theo.sql`
- `rpc_create_player_exclusion`: `20260328132317_add_exclusion_write_rpcs.sql`

**Acceptance Criteria**:
- [ ] Migration applies cleanly on `supabase db reset`
- [ ] `npm run db:types-local` succeeds
- [ ] hard_block players are rejected by all 3 slip RPCs
- [ ] soft_alert and monitor players pass through all 3 slip RPCs
- [ ] hard_block exclusion auto-closes active visits and open/paused slips
- [ ] Ghost visits skip exclusion check without error
- [ ] Auto-close produces audit_log entry with action 'exclusion_auto_close'
- [ ] get_player_exclusion_status not directly callable by authenticated users

### WS2: UI Guard — Exclusion Check in Active-Visit Branch

**Purpose**: Prevent creating slips for excluded players when reusing an existing visit.

**Deliverables**:
1. In `new-slip-modal.tsx`, after `visitId = activeVisitResponse.visit.id`:
   - Call `getExclusionStatus(selectedPlayer.id)` from `services/player/exclusion-http`
   - If `status === 'blocked'`: `setError('This player has an active exclusion and cannot be seated.')`; return
   - If `status === 'alert'`: `toast.warning()` with AlertTriangle icon, 10s duration
2. Uses `ExclusionStatusDTO` shape: `{ player_id: string; status: 'blocked' | 'alert' | 'watchlist' | 'clear' }`

**Acceptance Criteria**:
- [ ] `npm run type-check` passes
- [ ] Blocked players see error message in active-visit branch
- [ ] Alert players see warning toast but can proceed

### WS3: Integration Tests — Exclusion Enforcement

**Purpose**: Verify exclusion enforcement works across all modified RPCs.

**Deliverables**:
1. Test file: `services/player/__tests__/exclusion-enforcement.int.test.ts`
2. Test cases:
   - `rpc_start_rating_slip` rejects hard_block → PLAYER_EXCLUDED error
   - `rpc_resume_rating_slip` rejects hard_block → PLAYER_EXCLUDED error
   - `rpc_move_player` rejects hard_block → PLAYER_EXCLUDED error
   - `rpc_create_player_exclusion` hard_block auto-closes visit + slips
   - All RPCs allow soft_alert enforcement (no rejection)
   - All RPCs allow monitor enforcement (no rejection)

**Acceptance Criteria**:
- [ ] All tests pass with `npx jest services/player/__tests__/exclusion-enforcement.int.test.ts`
- [ ] No regressions in existing exclusion tests

## Definition of Done

- [ ] WS1 migration applies cleanly
- [ ] WS2 UI guard in place with correct DTO status values
- [ ] WS3 integration tests all pass
- [ ] `npm run db:types-local` succeeds
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes
- [ ] GAP-EXCLUSION-ENFORCEMENT-BYPASS.md updated with resolution status
- [ ] No regressions in existing tests
- [ ] Auto-close audit trail verified (audit_log entry present)
- [ ] SRM updated with cross-context write registration

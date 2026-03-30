# PRD-057 Build Pipeline Session Checkpoint

## Status: Phase 1 Execution — WS1 About to Start

### Pipeline State
- **PRD**: PRD-057 — Session Close Lifecycle Hardening
- **EXEC-SPEC**: `trees/table-lifecycle-recovery/docs/21-exec-spec/EXEC-057-session-close-lifecycle-hardening.md`
- **Branch**: `table-lifecycle-recovery`
- **Worktree**: `trees/table-lifecycle-recovery`
- **Checkpoint JSON**: `.claude/skills/build-pipeline/checkpoints/PRD-057.json`

### Completed Pipeline Stages
1. **GOV-010 Check**: PASSED (amendment PRD, no scaffold needed)
2. **Stage 1 — Architectural Scaffold**: lead-architect produced 4-workstream skeleton
3. **Stage 2 — Expert Consultation**: rls-expert (WS1), backend-service-builder (WS2+WS4), frontend-design-pt-2 (WS3) — all consulted in parallel
4. **Stage 3 — Assembly + Validation**: EXEC-SPEC written, validation script PASSED
5. **Stage 4 — DA Review (Tier 1)**: R1 Security & Tenancy focused review → Ship w/ gates (0 P0, 3 P1, 4 P2, 1 P3) — all findings applied
6. **Human Second-Pass Audit**: 4 additional P1/P2 findings accepted and applied:
   - Transaction rollback kills persistence on blocked close (redesigned: flag is gate, not write-ahead)
   - Force-close audit payload frozen to PRD §4.1 shape ({slip_id, visit_id, status, seat_number})
   - NO_ACTIVE_SESSION routed to useStartRatingSlip onError (removed from close dialog per ADR-028 D6.6)
   - Spoofable parameter language narrowed to "no new spoofable parameters introduced"
7. **Phase 2 Approval Gate**: APPROVED

### Current Phase: Phase 1 Execution
- **WS1**: RPC Lifecycle Amendments — **IN PROGRESS** (about to dispatch to rls-expert)
- **WS2**: Service Layer Error Mapping — BLOCKED on WS1
- **WS3**: Client Cache + Seating Error Surface — BLOCKED on WS1
- **WS4**: Integration Tests — BLOCKED on WS1 + WS2

### Task IDs
- Task #2: WS1 (in_progress)
- Task #3: WS2 (pending, blocked by #2)
- Task #4: WS3 (pending, blocked by #2)
- Task #5: WS4 (pending, blocked by #2, #3)

### Execution Plan
```
Phase 1: [WS1] → rls-expert skill
  Gate: npm run db:types-local

Phase 2: [WS2, WS3] → parallel
  WS2: backend-service-builder skill
  WS3: frontend-design-pt-2 skill
  Gate: npm run type-check

Phase 3: [WS4] → backend-service-builder skill
  Gate: npm test services/table-context/__tests__/session-close-lifecycle.int.test.ts
```

### Key Design Decisions (for context continuity)
1. **Transaction semantics**: Blocked close (P0005) rolls back — has_unresolved_items persists only on successful close (false) or force-close (true)
2. **Audit payload**: Frozen to `{slip_id, visit_id, status, seat_number}` + `orphaned_slip_count`
3. **NO_ACTIVE_SESSION surface**: useStartRatingSlip onError, NOT close-session-dialog
4. **casino_id defense-in-depth**: All rating_slip queries in DEFINER RPCs include `AND casino_id = v_casino_id`
5. **Atomic computation**: Flag computed via SELECT EXISTS into local var, not UPDATE with subquery (because blocked close must not persist)
6. **search_path upgrade**: All amended RPCs use `SET search_path = pg_catalog, public`
7. **RUNDOWN seating**: Allowed — active play continues during rundown
8. **rpc_check_table_seat_availability**: SECURITY INVOKER (not DEFINER) — RLS handles scoping

### Resume Command
```
/build --resume
# Or manually: read EXEC-SPEC, dispatch WS1 to rls-expert skill with full workstream context
```

### Key Files (in worktree)
- EXEC-SPEC: `docs/21-exec-spec/EXEC-057-session-close-lifecycle-hardening.md`
- PRD: `docs/10-prd/PRD-057-session-close-lifecycle-hardening-v0.md`
- Current close RPCs: `supabase/migrations/20260225110743_prd038a_close_guardrails_rpcs.sql`
- Current start_rating_slip: `supabase/migrations/20251212081000_sec007_rating_slip_rpc_hardening.sql`
- Current seat_availability: `supabase/migrations/20251222142642_prd017_rpc_table_availability.sql`
- Service layer: `services/table-context/table-session.ts`
- Hooks: `hooks/table-context/use-table-session.ts`
- Rating slip mutations: `hooks/rating-slip/use-rating-slip-mutations.ts`
- Close dialog: `components/table/close-session-dialog.tsx`
- Rating slip keys: `services/rating-slip/keys.ts`
- Visit keys: `services/visit/keys.ts`

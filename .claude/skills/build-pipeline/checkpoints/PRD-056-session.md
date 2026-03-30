# PRD-056 Build Pipeline Session Checkpoint

**Date:** 2026-03-25
**Branch:** `wedge-c` (worktree at `trees/wedge-c`)
**Pipeline status:** Phase 2 approved — ready for Phase 3 execution

## Completed

### Phase 1: EXECUTION-SPEC Generation
- GOV-010 prerequisite check: PASSED (SCAFFOLD-005 + ADR-046 exist)
- Stage 1: lead-architect produced 11-workstream skeleton (consolidated from 15 PRD items)
- Stage 2: 4 parallel expert consultations (backend-service-builder, rls-expert, api-builder, frontend-design-pt-2)
- Stage 3: Assembled + validated EXEC-SPEC at `docs/21-exec-spec/EXEC-056-alert-maturity.md`
- Stage 4: Tier 1 focused DA review (R1 Security + R3 Implementation)
  - R1 found P0: DEFINER-calling-INVOKER RLS bypass on `bl` CTE — PATCHED (WHERE casino_id added to WS2)
  - R1 found P1s: grant revocation scope (anon), cooldown seed missing — PATCHED
  - R3 found P1s: http.ts BASE mismatch, staff join for acknowledgedByName, SRM AC missing — PATCHED
  - 15 total patch items applied

### Human Review Patches (post-DA)
1. **DEFINER search_path**: Changed from `SET search_path TO 'public'` to `SET search_path = pg_catalog, public` per ADR-046 §Security Model
2. **WS3 return contract**: Removed misapplied ADR-030 D1 reference. Both RPCs `RETURNS jsonb`. Mappers consume jsonb.
3. **WS10 rewritten**: Was hand-waving pseudo-query with PL/pgSQL vars in a "direct SELECT" claim. Now a concrete `rpc_get_alert_quality` SECURITY INVOKER RPC with migration, mapper, service-layer call shape.
4. **Dashboard persist trigger**: Added explicit on-mount `usePersistAlerts()` + "Refresh Alerts" button to WS9 (was missing — PRD §6 Flow 1 requires both surfaces to trigger persist).
5. **Acknowledge contract split**: Zero-row path now has existence check first (SHIFT_ALERT_NOT_FOUND if absent) → then status check (already_acknowledged if not open). Preserves both the 404 mapping and idempotent re-ack.
6. **Persist RPC context**: `v_actor_id` now explicitly derived in step 2 alongside `v_casino_id`.
7. **WS4 AC wording**: Cleaned up garbled "Pattern A interfaces with eslint-disable comments" phrasing.

## Next: Phase 3 Execution

### Execution Order
```
Phase 1: [WS1]              — Schema Foundation (backend-service-builder)
Phase 2: [WS2, WS3]        — RPC Layer (parallel: backend-service-builder + rls-expert)
Phase 3: [WS4]              — Service Layer (backend-service-builder)
Phase 4: [WS5]              — Route Handlers (api-builder)
Phase 5: [WS6, WS7]        — Track A UI + Tests (parallel: frontend-design-pt-2 + backend-service-builder)
Phase 6: [WS8, WS10, WS11] — Track B Foundation (parallel: backend-service-builder + rls-expert)
Phase 7: [WS9]              — Track B UI (frontend-design-pt-2)
```

### Key Files
- EXEC-SPEC: `trees/wedge-c/docs/21-exec-spec/EXEC-056-alert-maturity.md`
- PRD: `trees/wedge-c/docs/10-prd/PRD-056-alert-maturity-v0.md`
- RFC: `trees/wedge-c/docs/02-design/RFC-005-alert-maturity.md`
- SEC Note: `trees/wedge-c/docs/20-architecture/specs/alert-maturity/SEC_NOTE.md`
- Checkpoint JSON: `.claude/skills/build-pipeline/checkpoints/PRD-056.json`

### Existing Service Layer (to extend, not replace)
- `services/shift-intelligence/` — anomaly.ts, baseline.ts, dtos.ts, http.ts, index.ts, keys.ts, mappers.ts, schemas.ts
- Pattern A (Contract-First DTOs) — existing dtos.ts uses manual interfaces with eslint-disable justification
- Latest migration: `20260323165908_create_shift_baseline_service.sql`
- Existing routes: `app/api/v1/shift-intelligence/compute-baselines/route.ts`, `app/api/v1/shift-intelligence/anomaly-alerts/route.ts`
- Existing UI: `components/shift-intelligence/` (anomaly-alert-card, baseline-coverage-banner, recompute-baselines-button — unwired)
- Existing alerts page: `app/(dashboard)/admin/alerts/page.tsx` + `components/admin-alerts/alerts-page-client.tsx`
- Shift dashboard: `app/(protected)/shift-dashboard/page.tsx` + `components/shift-dashboard/alerts-panel.tsx`

### Critical DA Findings to Honor During Execution
- WS2 MUST add `WHERE b.casino_id = v_casino_id` to `bl` CTE (P0-1 fix)
- WS1 grant pattern: `REVOKE ALL FROM PUBLIC; REVOKE ALL FROM anon; GRANT SELECT TO authenticated`
- WS3 search_path: `SET search_path = pg_catalog, public` (not `TO 'public'`)
- WS3 acknowledge: existence check → status check → UPDATE (three-step, not two)
- WS4 http.ts: fix BASE constant from `/api/shift-intelligence` to `/api/v1/shift-intelligence`
- WS4 alerts.ts: getAlerts needs LEFT JOIN staff for acknowledgedByName
- WS8 MUST incorporate all WS2 readiness logic (CREATE OR REPLACE replaces entire function body)
- WS9 output path: `components/shift-dashboard/alerts-panel.tsx` (not admin-alerts)
- WS10 is now an RPC (rpc_get_alert_quality SECURITY INVOKER), not a direct SELECT

### Resume Command
```
/build --resume
```
Or manually: read this checkpoint, then dispatch Phase 1 (WS1) via `Skill(skill="backend-service-builder", args="Execute WS1...")`.

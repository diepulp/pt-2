# DOD-shift-rundown-deltas: Shift Rundown Persistence & Mid-Shift Delta Checkpoints

> **Purpose:** Executable gate checklist. If it can't run in CI, it's not a gate -- it's a wish.

---

## Gate Status

| Gate | Status | Test File | CI Job |
|------|--------|-----------|--------|
| A. Functional | Pending | `services/table-context/__tests__/rundown-*.test.ts`, `services/table-context/__tests__/shift-checkpoint-*.test.ts` | `npm run test` |
| B. Security | Pending | `services/table-context/__tests__/rundown-rls.int.test.ts` | `npm run test` |
| C. Data Integrity | Pending | `services/table-context/__tests__/rundown-integrity.int.test.ts` | `npm run test` |
| D. Operability | Pending | `services/table-context/__tests__/rundown-errors.test.ts` | `npm run test` |

---

## A. Functional Gates

### A1. Schema Gates

| Gate | Test | Status |
|------|------|--------|
| Table `table_rundown_report` exists with all PRD columns | Schema snapshot test | [ ] |
| Table `shift_checkpoint` exists with all PRD columns | Schema snapshot test | [ ] |
| UNIQUE `uq_rundown_report_session` on `(table_session_id)` | Duplicate insert -> conflict error | [ ] |
| FK `table_rundown_report.table_session_id` -> `table_session(id)` | Insert with invalid session -> FK error | [ ] |
| FK `table_rundown_report.casino_id` -> `casino(id)` | Insert with invalid casino -> FK error | [ ] |
| FK `shift_checkpoint.casino_id` -> `casino(id)` | Insert with invalid casino -> FK error | [ ] |
| CHECK `checkpoint_scope IN ('casino','pit','table')` | Invalid scope -> check constraint error | [ ] |
| CHECK `checkpoint_type IN ('mid_shift','end_of_shift','handoff')` | Invalid type -> check constraint error | [ ] |
| Index `idx_rundown_report_gaming_day` exists on `(casino_id, gaming_day)` | Predicate-based index verification | [ ] |
| Index `idx_shift_checkpoint_latest` exists on `(casino_id, checkpoint_scope, created_at DESC)` | Predicate-based index verification | [ ] |
| `unique_active_session_per_table` index exists with correct predicate | Verify `(casino_id, gaming_table_id) WHERE status IN ('OPEN','ACTIVE','RUNDOWN')` | [ ] |

### A2. RPC Flow Gates -- Rundown Persistence

| Gate | Test | Status |
|------|------|--------|
| `rpc_close_table_session` -> `table_rundown_report` row exists (same transaction) | Close session, verify report persisted | [ ] |
| Report contains correct: `opening_bankroll`, `closing_bankroll`, `fills_total`, `credits_total`, `drop_total`, `table_win` | Value verification after close | [ ] |
| `table_win_cents` is NULL when `drop_total_cents` is NULL | Close session without drop posted, verify NULL win | [ ] |
| `rpc_persist_table_rundown` INSERT on first call | Manual persist -> row created | [ ] |
| `rpc_persist_table_rundown` UPDATE on second call (before finalization) | Second persist -> same row, updated `computed_at` | [ ] |
| UPSERT: pre-close persist + close = single row with final values | Persist during RUNDOWN, then close -> verify single row | [ ] |
| `opening_source` and `computation_grade` recomputed on each UPSERT | Verify provenance fields update correctly | [ ] |
| `computed_at` and `computed_by` update on UPSERT | Verify metadata fields | [ ] |
| `gaming_day` derived from `table_session.opened_at` (server-side) | Verify correct gaming day derivation | [ ] |

### A3. RPC Flow Gates -- Finalization

| Gate | Test | Status |
|------|------|--------|
| `rpc_finalize_rundown` stamps `finalized_at` and `finalized_by` | Finalize -> verify timestamps | [ ] |
| Finalized report rejects UPDATE via `rpc_persist_table_rundown` | Persist after finalize -> `TBLRUN_ALREADY_FINALIZED` (409) | [ ] |
| Finalization requires `table_session.status = 'CLOSED'` | Finalize with ACTIVE session -> `TBLRUN_SESSION_NOT_CLOSED` | [ ] |
| Finalization of non-existent report | Finalize with bad ID -> `TBLRUN_NOT_FOUND` (404) | [ ] |
| Double finalization rejected | Finalize twice -> `TBLRUN_ALREADY_FINALIZED` (409) | [ ] |

### A4. RPC Flow Gates -- Session Totals (ADR-038 D1)

| Gate | Test | Status |
|------|------|--------|
| Fill creation -> `table_session.fills_total_cents` incremented | Create fill, verify session total | [ ] |
| Credit creation -> `table_session.credits_total_cents` incremented | Create credit, verify session total | [ ] |
| Fill/credit RPCs write `session_id` FK onto event rows | Create fill/credit, verify `session_id IS NOT NULL` | [ ] |
| Concurrent fills on same session -> totals correct (no lost updates) | Parallel fills, verify `fills_total = SUM(amounts)` | [ ] |
| No active session -> `session_id` is NULL | Fill without active session, verify NULL session_id | [ ] |

### A5. RPC Flow Gates -- Shift Checkpoints

| Gate | Test | Status |
|------|------|--------|
| `rpc_create_shift_checkpoint` creates row with correct metrics | Create checkpoint, verify all metric fields | [ ] |
| Checkpoint `gaming_day` matches `compute_gaming_day(now(), casino_settings)` | Verify server-derived gaming day | [ ] |
| Checkpoint `window_start` = gaming day start boundary | Verify temporal boundaries | [ ] |
| Checkpoint `window_end` = capture timestamp | Verify temporal boundaries | [ ] |
| Casino-scope delta: correct difference from last checkpoint | Create checkpoint, add activity, compute delta | [ ] |
| Delta with no prior checkpoint -> NULL deltas (not zero) | Compute delta with no checkpoints -> NULL | [ ] |
| Re-query `rpc_shift_table_metrics` at checkpoint's `window_end` -> deterministic | Verify historical re-query matches stored checkpoint metrics | [ ] |
| `checkpoint_scope` is always `'casino'` in MVP | RPC hardcodes scope, `pit_id` and `gaming_table_id` are NULL | [ ] |

### A6. Late-Event Gates

| Gate | Test | Status |
|------|------|--------|
| Fill after finalization -> `has_late_events = true` on report | Finalize, then fill -> verify flag | [ ] |
| Fill after finalization -> `audit_log` entry with `LATE_EVENT_AFTER_FINALIZATION` | Verify audit log record | [ ] |
| `has_late_events` flag is monotonic: cannot reset `true -> false` | Attempt reset -> rejected | [ ] |
| Late fill does NOT update frozen report values | Verify report `fills_total_cents` unchanged after late fill | [ ] |

---

## B. Security Gates

> **CRITICAL:** Tests MUST run under non-owner roles. Table owners and BYPASSRLS bypass RLS.

### B1. Role Matrix -- Rundown Report

| Gate | Test | Status |
|------|------|--------|
| `pit_boss` can read own casino's reports | SELECT -> rows returned | [ ] |
| `admin` can read own casino's reports | SELECT -> rows returned | [ ] |
| `dealer` can read own casino's reports (SELECT allowed) | SELECT -> rows returned | [ ] |
| `pit_boss` can persist rundown via RPC | `rpc_persist_table_rundown` -> success | [ ] |
| `admin` can finalize via RPC | `rpc_finalize_rundown` -> success | [ ] |
| `dealer` CANNOT persist rundown | `rpc_persist_table_rundown` -> FORBIDDEN | [ ] |
| `dealer` CANNOT finalize | `rpc_finalize_rundown` -> FORBIDDEN | [ ] |
| `cashier` CANNOT persist or finalize | Both RPCs -> FORBIDDEN | [ ] |

### B2. Role Matrix -- Shift Checkpoint

| Gate | Test | Status |
|------|------|--------|
| `pit_boss` can read checkpoints | SELECT -> rows returned | [ ] |
| `pit_boss` can create checkpoint via RPC | `rpc_create_shift_checkpoint` -> success | [ ] |
| `dealer` can read checkpoints (SELECT allowed) | SELECT -> rows returned | [ ] |
| `dealer` CANNOT create checkpoint | `rpc_create_shift_checkpoint` -> FORBIDDEN | [ ] |

### B3. Actor Binding

| Gate | Test | Status |
|------|------|--------|
| `computed_by` matches `app.actor_id` on persist | Persist -> verify `computed_by` matches JWT staff | [ ] |
| `finalized_by` matches `app.actor_id` on finalize | Finalize -> verify `finalized_by` matches JWT staff | [ ] |
| `created_by` matches `app.actor_id` on checkpoint | Create checkpoint -> verify `created_by` | [ ] |

### B4. Casino Isolation

| Gate | Test | Status |
|------|------|--------|
| Cannot read other casino's rundown reports | SELECT as casino_A, target casino_B -> 0 rows | [ ] |
| Cannot read other casino's checkpoints | SELECT as casino_A, target casino_B -> 0 rows | [ ] |
| Cannot persist rundown for other casino's session | RPC with other casino's session -> error | [ ] |
| Cannot create checkpoint for other casino | RPC as casino_A staff -> checkpoint `casino_id` = casino_A (derived, not supplied) | [ ] |

### B5. Privilege Posture (Privileges + RLS Two-Layer Defense)

> Write denial is privilege-based (`REVOKE ALL` + `GRANT SELECT`), not RLS-based.
> RLS provides casino-scoped SELECT filtering. Both layers must be tested independently.

| Gate | Test | Status |
|------|------|--------|
| Direct UPDATE on `table_rundown_report` denied (privilege) | UPDATE via SQL as `authenticated` -> permission denied | [ ] |
| Direct DELETE on `table_rundown_report` denied (privilege) | DELETE via SQL as `authenticated` -> permission denied | [ ] |
| Direct INSERT on `table_rundown_report` denied (privilege) | INSERT via SQL as `authenticated` -> permission denied | [ ] |
| Direct UPDATE on `shift_checkpoint` denied (privilege) | UPDATE via SQL as `authenticated` -> permission denied | [ ] |
| Direct DELETE on `shift_checkpoint` denied (privilege) | DELETE via SQL as `authenticated` -> permission denied | [ ] |
| Direct INSERT on `shift_checkpoint` denied (privilege) | INSERT via SQL as `authenticated` -> permission denied | [ ] |

---

## C. Data Integrity Gates

### C1. Reconciliation Gates

| Gate | Test | Status |
|------|------|--------|
| `table_session.fills_total_cents == SUM(table_fill.amount_cents WHERE session_id = session)` | Reconciliation query after multiple fills | [ ] |
| `table_session.credits_total_cents == SUM(table_credit.amount_cents WHERE session_id = session)` | Reconciliation query after multiple credits | [ ] |
| Rundown formula: `win = closing + credits + drop - opening - fills` | Verify computed `table_win_cents` | [ ] |
| One rundown report per session (UNIQUE enforced) | Attempt duplicate INSERT -> conflict | [ ] |

### C2. Temporal Integrity Gates

| Gate | Test | Status |
|------|------|--------|
| `computed_at` updates on each UPSERT | Multiple persists -> `computed_at` changes | [ ] |
| `finalized_at` never NULL after finalization | Verify timestamp set | [ ] |
| Checkpoint `window_start` <= `window_end` | Verify temporal ordering | [ ] |
| Rundown `gaming_day` matches session's gaming day derivation | Cross-reference with `compute_gaming_day` | [ ] |

### C3. Index Invariant Gates

| Gate | Test | Status |
|------|------|--------|
| `unique_active_session_per_table` verified by predicate and columns | Schema introspection test: `(casino_id, gaming_table_id) WHERE status IN ('OPEN','ACTIVE','RUNDOWN')` | [ ] |
| `INTO STRICT` raises `TOO_MANY_ROWS` on index invariant violation | Simulate violation -> error raised | [ ] |

### C4. Role Enum Invariant Gates

| Gate | Test | Status |
|------|------|--------|
| Role gate literals match canonical `public.staff_role` enum | Introspect enum values, verify `'pit_boss'` and `'admin'` are present | [ ] |
| `rpc_shift_table_metrics` deterministic for historical windows | Same `(window_start, window_end)` produces identical results across two calls | [ ] |

---

## D. Operability Gates

### D1. Error Handling Gates

| Gate | Test | Status |
|------|------|--------|
| `TBLRUN_ALREADY_FINALIZED` -> 409 | Persist after finalize -> correct error code | [ ] |
| `TBLRUN_SESSION_NOT_CLOSED` -> 400 | Finalize with non-closed session -> correct error code | [ ] |
| `TBLRUN_NOT_FOUND` -> 404 | Finalize non-existent report -> correct error code | [ ] |
| `FORBIDDEN` -> 403 | Wrong role -> correct error code | [ ] |
| `TOO_MANY_ROWS` -> 500 | Index invariant violation -> correct error code | [ ] |
| No raw SQL in error messages | All error responses use domain error codes | [ ] |

### D2. Audit Trail Gates

| Gate | Test | Status |
|------|------|--------|
| `computed_by` tracked on all persisted reports | All rows have `computed_by IS NOT NULL` | [ ] |
| `created_by` tracked on all checkpoints | All rows have `created_by IS NOT NULL` | [ ] |
| `finalized_by` tracked on all finalized reports | Finalized rows have `finalized_by IS NOT NULL` | [ ] |
| Late-event `audit_log` entry created with correct event type | Verify `LATE_EVENT_AFTER_FINALIZATION` in audit_log | [ ] |

### D3. Operational Readiness Gates

| Gate | Test | Status |
|------|------|--------|
| Migrations pass `npm run db:types-local` | Exit code 0 | [ ] |
| `npm run type-check` exits 0 | No type errors | [ ] |
| `npm run lint` exits 0 | No lint errors | [ ] |
| `npm run build` exits 0 | Production build succeeds | [ ] |
| SRM updated with new table ownership | Verify SRM version bump | [ ] |
| `TableRundownReportDTO` documented in service DTOs | DTO file exists with JSDoc | [ ] |
| `ShiftCheckpointDTO` documented in service DTOs | DTO file exists with JSDoc | [ ] |

---

## Gating Bugs (Prerequisites)

> These MUST be green before ship. They are not risks -- they are prerequisites.

| Bug | Description | Status |
|-----|-------------|--------|
| GB-1 | `table_inventory_snapshot.session_id` consistently populated | [ ] |
| GB-2 | `rpc_compute_table_rundown` chipset JSON parsing fixed | [ ] |
| GB-3 | `table_inventory_snapshot.total_cents` populated OR use `chipset_total_cents()` exclusively | [ ] |
| GB-4 | `formatCents(null)` returns "---", not "$0" | [ ] |
| GB-5 | Opening baseline cascade returns correct `opening_source` provenance | [ ] |

---

## Gate Completion Criteria

| Criteria | Requirement |
|----------|-------------|
| All A gates pass | 100% of functional tests pass |
| All B gates pass | 100% of security tests pass under non-owner roles |
| All C gates pass | 100% of integrity tests pass |
| All D gates pass | 100% of operability tests pass |
| All gating bugs resolved | GB-1 through GB-5 green |
| No RLS bypass | Tests run under `authenticated` role, not table owner |
| CI automated | Gates run on every PR targeting this feature branch |
| No manual verification | Every gate has an automated test |

---

**Gate:** If it can't run in CI, it's not a gate -- it's a wish.

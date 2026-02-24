# SEC Note: Shift Rundown Persistence & Mid-Shift Delta Checkpoints

**Feature:** shift-rundown-deltas (PRD-038)
**Date:** 2026-02-24
**Author:** Lead Architect
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| `table_rundown_report` rows | Compliance / Audit | Canonical close-of-session record; regulatory auditors rely on immutability after finalization. Tampering = compliance violation. |
| `table_win_cents` (computed win/loss) | Financial | Directly represents table P&L. Manipulation affects revenue reporting and operator accountability. |
| `finalized_at` / `finalized_by` stamps | Audit | Non-repudiation of who signed off on the report. Spoofing = audit trail corruption. |
| `shift_checkpoint` rows | Operational | Point-in-time metrics used for shift handoff. Lower sensitivity than rundown reports but still affects operational decisions. |
| `computed_by` / `created_by` actor attribution | Audit | Must reflect the actual authenticated staff member, not a spoofed identity. |
| Session totals (`fills_total_cents`, `credits_total_cents`) | Financial / Integrity | Denormalized aggregates fed into rundown computation. Desync = wrong win/loss numbers. |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino data leakage | High | Medium | P1 |
| T2: Rundown report tampering post-finalization | High | Low | P1 |
| T3: Actor attribution spoofing on finalization | Medium | Low | P2 |
| T4: Session totals desync from raw events | Medium | Medium | P1 |
| T5: Unauthorized finalization (wrong role) | Medium | Low | P2 |
| T6: Checkpoint injection (fabricated metrics) | Medium | Low | P2 |
| T7: Gaming day manipulation (client-supplied) | Medium | Low | P2 |

### Threat Details

**T1: Cross-casino data leakage**
- **Description:** Staff from Casino A reads or modifies rundown reports / checkpoints from Casino B
- **Attack vector:** Manipulate `casino_id` in request payload, or bypass RLS via direct table access
- **Impact:** Privacy violation between tenants; regulatory breach in multi-casino deployments

**T2: Rundown report tampering post-finalization**
- **Description:** After a supervisor finalizes a rundown report, an attacker modifies `table_win_cents` or other computed fields
- **Attack vector:** Direct UPDATE bypassing the finalization guard, or calling a non-guarded mutation path
- **Impact:** Audit trail corruption; revenue misreporting; regulatory compliance failure

**T3: Actor attribution spoofing on finalization**
- **Description:** Staff forges `finalized_by` to attribute sign-off to a different supervisor
- **Attack vector:** Pass arbitrary `staff_id` as the finalizer instead of deriving from JWT
- **Impact:** Non-repudiation failure; blame attribution corruption

**T4: Session totals desync from raw events**
- **Description:** `table_session.fills_total_cents` drifts from `SUM(table_fill.amount_cents)` due to a bug in the atomic update, a missed fill, or a race condition
- **Attack vector:** Not an external attack — implementation defect. Concurrent fills on the same session without proper atomicity.
- **Impact:** Rundown report computed from stale totals; wrong win/loss on the shift dashboard

**T5: Unauthorized finalization (wrong role)**
- **Description:** A dealer or cashier finalizes a rundown report, locking it before a supervisor reviews
- **Attack vector:** Call `rpc_finalize_rundown` with a staff JWT that has insufficient role
- **Impact:** Premature lock-in of potentially incorrect numbers

**T6: Checkpoint injection (fabricated metrics)**
- **Description:** An attacker creates a `shift_checkpoint` with fabricated metric values instead of values derived from `rpc_shift_table_metrics`
- **Attack vector:** Call checkpoint creation API with manually constructed metric payload
- **Impact:** Delta display shows misleading "since last check" values; operational decisions based on false baseline

**T7: Gaming day manipulation**
- **Description:** Client supplies a `gaming_day` value that doesn't match the server's temporal computation, causing reports to be filed under the wrong day
- **Attack vector:** Pass `gaming_day` in the request body instead of letting the server derive it
- **Impact:** Audit trail misalignment; reports filed under wrong gaming day; compliance violation

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | RLS casino_id binding (Pattern C hybrid) | Both tables: `casino_id = COALESCE(current_setting('app.casino_id'), jwt.app_metadata.casino_id)` |
| T1 | ADR-024 context derivation | All RPCs call `set_rls_context_from_staff()` — casino_id derived from staff record, never user-supplied |
| T2 | RPC-level finalization guard | `rpc_persist_table_rundown` checks `finalized_at IS NOT NULL` before any UPDATE; raises `TBLRUN_ALREADY_FINALIZED` |
| T2 | No direct UPDATE RLS policy | `table_rundown_report` has no UPDATE policy for `authenticated` role; all mutations go through SECURITY DEFINER RPCs |
| T3 | Actor binding from JWT | `finalized_by` derived from `current_setting('app.actor_id')` inside `rpc_finalize_rundown`; never accepted as parameter |
| T3 | `computed_by` from context | Same pattern — `set_rls_context_from_staff()` sets `app.actor_id`; RPC reads it, never accepts it as input |
| T4 | RPC-side atomic update | Session totals updated in the same database transaction as the fill/credit INSERT; no trigger, no separate call |
| T4 | Reconciliation test | DoD includes test: `table_session.fills_total_cents = SUM(table_fill.amount_cents WHERE session_id = ...)` |
| T5 | Role gate in RPC | `rpc_finalize_rundown` checks `current_setting('app.staff_role') IN ('pit_boss', 'admin')`; raises `FORBIDDEN` for other roles |
| T6 | Server-side metric computation | `rpc_create_shift_checkpoint` internally calls `rpc_shift_table_metrics` — metric values are computed, not accepted from client |
| T7 | Server-side gaming_day derivation | Both `rpc_persist_table_rundown` and `rpc_create_shift_checkpoint` derive `gaming_day` from `casino_settings`; parameter not accepted from client |

### Control Details

**C1: RLS Casino Scoping (Pattern C Hybrid)**
- **Type:** Preventive
- **Location:** RLS policy on both new tables
- **Enforcement:** Database
- **Tested by:** RPC test — staff from Casino A cannot read/modify Casino B data

**C2: Finalization Immutability Guard**
- **Type:** Preventive
- **Location:** `rpc_persist_table_rundown` (SECURITY DEFINER)
- **Enforcement:** Database
- **Tested by:** RPC test — UPDATE after finalization returns 409

**C3: Actor Binding (ADR-024)**
- **Type:** Preventive
- **Location:** All RPCs via `set_rls_context_from_staff()`
- **Enforcement:** Database (`SET LOCAL app.actor_id`, `app.casino_id`, `app.staff_role`)
- **Tested by:** RPC test — `computed_by` / `finalized_by` / `created_by` match JWT staff_id

**C4: Role Gating**
- **Type:** Preventive
- **Location:** RPCs: `rpc_persist_table_rundown`, `rpc_finalize_rundown`, `rpc_create_shift_checkpoint`
- **Enforcement:** Database
- **Tested by:** RPC test — dealer/cashier role → FORBIDDEN

**C5: Server-Side Computation (Anti-Injection)**
- **Type:** Preventive
- **Location:** `rpc_create_shift_checkpoint` (metrics), `rpc_persist_table_rundown` (gaming_day)
- **Enforcement:** Database — RPC computes values; client cannot supply them
- **Tested by:** RPC test — checkpoint metric values match independent `rpc_shift_table_metrics` call

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| No unfinalize mechanism | MVP scope — finalization is irreversible. Incorrect finalization requires manual DB intervention. | Before multi-casino GA; when exception workflow (Gap #11) is built |
| Late events after finalization not tracked | Fills/credits arriving after report finalization are visible in raw tables but not in the frozen report. No structured exception record. | Before compliance-grade deployment; when `reconciliation_exception` table is built |
| No audit log entry for finalization | `audit_log` table exists but finalization events are not written to it. | Before regulatory audit readiness |
| Checkpoint values not independently verified | Checkpoint stores whatever `rpc_shift_table_metrics` returns. No second-source verification. | Acceptable for MVP — single source of truth is the metrics RPC |
| `table_rundown_report` DELETE not RLS-denied | MVP has no DELETE policy (defaults to denied via RLS enable). Should add explicit DENY + monitoring. | Before GA; add `CREATE POLICY deny_delete ON table_rundown_report FOR DELETE USING (false)` |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| `table_win_cents` | Plaintext integer | Financial operational data, not PII. Needs to be human-readable for auditors. |
| `opening_bankroll_cents` / `closing_bankroll_cents` | Plaintext integer | Same — chip counts are operational, not sensitive |
| `computed_by` / `finalized_by` | UUID FK to `staff(id)` | Staff identity reference — not PII itself; FK integrity enforced |
| `notes` (free text) | Plaintext | Operator notes on rundown. Low sensitivity; no PII expected. Could contain operational comments. |
| `gaming_day` | DATE | Temporal grouping — no sensitivity |
| Checkpoint metric fields | Plaintext integers | Aggregated operational metrics — no PII |

No PII is stored in either new table. No hashing, encryption, or redaction required.

---

## RLS Summary

### table_rundown_report

| Operation | Allowed Roles | Mechanism |
|-----------|---------------|-----------|
| SELECT | All authenticated staff (same casino) | RLS Pattern C: `casino_id` match |
| INSERT | pit_boss, admin | Via `rpc_persist_table_rundown` (SECURITY DEFINER) |
| UPDATE | pit_boss, admin (pre-finalization only) | Via `rpc_persist_table_rundown` UPSERT (checks `finalized_at IS NULL`) |
| DELETE | **Denied** | No DELETE policy; RLS defaults to deny |

### shift_checkpoint

| Operation | Allowed Roles | Mechanism |
|-----------|---------------|-----------|
| SELECT | All authenticated staff (same casino) | RLS Pattern C: `casino_id` match |
| INSERT | pit_boss, admin | Via `rpc_create_shift_checkpoint` (SECURITY DEFINER) |
| UPDATE | **Denied** | Checkpoints are immutable point-in-time snapshots |
| DELETE | **Denied** | No DELETE policy; RLS defaults to deny |

### table_session (existing — modified columns)

| Operation | Affected Columns | Mechanism |
|-----------|-----------------|-----------|
| UPDATE `fills_total_cents` | pit_boss, admin | Via `rpc_request_table_fill` (SECURITY DEFINER, same transaction) |
| UPDATE `credits_total_cents` | pit_boss, admin | Via `rpc_request_table_credit` (SECURITY DEFINER, same transaction) |

### table_fill / table_credit (existing — new column)

| Operation | Affected Column | Mechanism |
|-----------|----------------|-----------|
| INSERT `session_id` | pit_boss, admin | Set by RPC during fill/credit creation; derived from unique active session index |

---

## Validation Gate

- [x] All assets classified (6 assets: compliance, financial, audit, operational)
- [x] All threats have controls or explicit deferral (T1-T7 all addressed)
- [x] Sensitive fields have storage justification (no PII — all operational data)
- [x] RLS covers all CRUD operations (SELECT via Pattern C; INSERT/UPDATE via SECURITY DEFINER RPCs; DELETE denied)
- [x] No plaintext storage of secrets (no secrets in this feature)
- [x] Actor binding prevents audit spoofing (C3: ADR-024 context derivation)
- [x] Finalization immutability enforced at DB level (C2: RPC guard)
- [x] Role gating on all write operations (C4: pit_boss/admin only)
- [x] Gaming day derived server-side, never client-supplied (C5)

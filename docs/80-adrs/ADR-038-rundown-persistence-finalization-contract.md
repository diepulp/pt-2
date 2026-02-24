---
title: "ADR-038: Table Rundown Persistence & Finalization Contract"
adr_id: "ADR-038"
status: "Accepted"
date: "2026-02-24"
owner: "TableContext"
decision_scope: "Rundown report persistence semantics, session totals denormalization, finalization immutability"
amends: "ADR-027 (adds persistence layer atop visibility-only compute)"
depends_on: "ADR-024, ADR-027, ADR-028"
related:
  - "PRD-038-shift-rundown-persistence-deltas-v0.1.md"
  - "SEC-NOTE-SHIFT-RUNDOWN-DELTAS.md"
  - "ADR-027-table-bank-mode-dual-policy.md"
  - "ADR-024_DECISIONS.md"
  - "ADR-018-security-definer-governance.md"
---

# ADR-038: Table Rundown Persistence & Finalization Contract

## Context

ADR-027 established `rpc_compute_table_rundown` as an **ephemeral** computation — it returns the rundown formula result but does not persist it. PRD-038 requires persisting this computation for audit accountability (`table_rundown_report`) and providing mid-shift delta checkpoints (`shift_checkpoint`). This ADR records the three durable architectural decisions that emerge from persistence:

1. **How session totals stay in sync** — the denormalization update mechanism
2. **How rundown reports are created and updated** — the UPSERT mutability contract
3. **How finalization prevents tampering** — the immutability guard

These three decisions are tightly coupled: the UPSERT contract depends on session totals being current, and the finalization guard terminates the UPSERT contract. Recording them together prevents future engineers from implementing one without understanding the others.

### What ADR-027 Already Covers (Not Repeated Here)

- The rundown formula: `table_win = closing + credits + drop − opening − fills`
- The `table_session` schema with `fills_total_cents` and `credits_total_cents` columns
- The `rpc_compute_table_rundown` ephemeral computation
- Sign semantics (fills subtractive, credits additive)
- The `INVENTORY_COUNT` / `IMPREST_TO_PAR` bank mode dual policy

### What This ADR Adds

- **D1:** Session totals are updated atomically inside fill/credit RPCs (not via triggers)
- **D2:** `table_rundown_report` uses UPSERT keyed on `(table_session_id)`, mutable until finalization
- **D3:** `finalized_at` is a hard immutability stamp — not a session state, not a soft flag

---

## Decision

### D1 — Session Totals Updated Atomically Inside Fill/Credit RPCs

**Context:** ADR-027 defined `table_session.fills_total_cents` and `credits_total_cents` but deferred the update mechanism ("never updated" in implementation). PRD-038 requires these totals to be **consistent at commit time** of the fill/credit transaction — any read after commit MUST reflect the updated total.

**Decision:** Session totals are updated **inside the same SQL function body** that creates the `table_fill` or `table_credit` row. The update uses atomic increment (`SET col = col + p_amount_cents`) to prevent lost updates under concurrency.

**Rationale — Why Not Triggers:**

| Approach | Rejected Because |
|----------|-----------------|
| `AFTER INSERT` trigger on `table_fill` / `table_credit` | Triggers add **security ownership complexity**: each trigger function requires its own SECURITY DEFINER declaration, `search_path` pinning, RLS bypass governance (ADR-018), and privilege audit surface — all for no functional benefit over inline updates. The trigger's execution context (definer vs invoker, `search_path` resolution) creates subtle attack surface that must be separately governed. |
| Separate UPDATE RPC called by the client after fill/credit | Two network round-trips; if the second fails, totals desync silently; violates the "single source of truth" principle |
| Materialized view or periodic refresh | Introduces latency; totals would not be consistent at commit time of the fill/credit transaction |

**Canonical Pattern:**

```sql
-- Inside rpc_request_table_fill (SECURITY DEFINER)

-- 1. Resolve session via unique active session index (no LIMIT 1 — index enforces uniqueness)
SELECT id INTO STRICT v_session_id
FROM table_session
WHERE casino_id = v_casino_id
  AND gaming_table_id = p_gaming_table_id
  AND status IN ('OPEN', 'ACTIVE', 'RUNDOWN');
-- INTO STRICT raises NO_DATA_FOUND (0 rows) or TOO_MANY_ROWS (>1 row)
-- TOO_MANY_ROWS = index invariant violated → fail loud, do not mask corruption

-- 2. INSERT fill row WITH session_id persisted (not just resolvable)
INSERT INTO table_fill (casino_id, gaming_table_id, session_id, amount_cents, ...)
VALUES (v_casino_id, p_gaming_table_id, v_session_id, p_amount_cents, ...);

-- 3. Atomic increment — prevents lost updates under concurrent fills
UPDATE table_session
SET fills_total_cents = COALESCE(fills_total_cents, 0) + p_amount_cents
WHERE id = v_session_id;
```

**Session Linkage Contract:** Resolution-by-index is **insertion-time only**. The resolved `session_id` MUST be persisted on the `table_fill` / `table_credit` row as an FK. Downstream reconciliation and late-event detection MUST rely on the stored `session_id`, never re-resolve from the index.

**Session Resolution Contract:** The active session is resolved via the `unique_active_session_per_table` partial unique index:

```sql
CREATE UNIQUE INDEX unique_active_session_per_table
ON table_session (casino_id, gaming_table_id)
WHERE status IN ('OPEN', 'ACTIVE', 'RUNDOWN');
```

This index guarantees at most one active session per table per casino. The query uses `INTO STRICT` (no `LIMIT 1`) so that an index invariant violation raises `TOO_MANY_ROWS` immediately — fail loud, never mask corruption.

**Applies to:**
- `rpc_request_table_fill` → updates `fills_total_cents`
- `rpc_request_table_credit` → updates `credits_total_cents`

---

### D2 — Rundown Report UPSERT Contract (Mutable Until Finalized)

**Context:** A rundown report may be computed multiple times for the same session — first when the pit boss previews during RUNDOWN state, then auto-persisted at session close. The system must support re-computation without creating duplicate rows, while preserving a complete audit trail of who computed and when.

**Decision:** `rpc_persist_table_rundown` implements UPSERT keyed on `(table_session_id)`. Before finalization, every UPSERT recalculates all computed fields deterministically and updates provenance metadata.

**Contract:**

| Condition | Behavior |
|-----------|----------|
| No existing row for `table_session_id` | INSERT new row; set `computed_at`, `computed_by` |
| Existing row with `finalized_at IS NULL` | UPDATE all computed fields; update `computed_at`, `computed_by` |
| Existing row with `finalized_at IS NOT NULL` | REJECT with `TBLRUN_ALREADY_FINALIZED` (mapped to HTTP 409) |

**What Gets Recalculated on Each UPSERT:**

All derived fields are recomputed from source data — nothing is "sticky" from a previous computation:

- `opening_bankroll_cents` — from `table_inventory_snapshot` (opening)
- `closing_bankroll_cents` — from `table_inventory_snapshot` (closing)
- `fills_total_cents` — from `table_session.fills_total_cents`
- `credits_total_cents` — from `table_session.credits_total_cents`
- `drop_total_cents` — from `table_session.drop_total_cents`
- `table_win_cents` — computed via ADR-027 formula
- `opening_source` — provenance enum (`IMPREST_PAR` | `INVENTORY_COUNT` | `MANUAL`)
- `computation_grade` — completeness indicator (`COMPLETE` | `PARTIAL_NO_DROP` | `PARTIAL_NO_CLOSING`)
- `computed_at` — `now()` at function execution
- `computed_by` — `current_setting('app.actor_id')` (ADR-024)

**Provenance Is Deterministic:**

`opening_source` and `computation_grade` are derived from data state at computation time, not manually set. This means re-computing the same session always produces the same provenance (assuming source data hasn't changed).

**Flow:**

```
Pit boss requests rundown preview (RUNDOWN state)
  → rpc_persist_table_rundown → INSERT (first time)
  → computed_at = T1, computed_by = staff_A

Late fill arrives, pit boss re-requests
  → rpc_persist_table_rundown → UPDATE (recalculates all fields)
  → computed_at = T2, computed_by = staff_A

Pit boss closes session
  → rpc_close_table_session calls rpc_persist_table_rundown inline
  → UPDATE (final recalculation with closing snapshot)
  → computed_at = T3, computed_by = staff_A

Supervisor finalizes
  → rpc_finalize_rundown → stamps finalized_at, finalized_by
  → Row is now immutable (D3)

Any further UPSERT attempt
  → REJECTED with TBLRUN_ALREADY_FINALIZED
```

---

### D3 — Finalization Is a Hard Immutability Stamp

**Context:** Regulatory auditors rely on the finalized rundown report as the canonical close-of-session record. Tampering after finalization is a compliance violation (SEC-NOTE-SHIFT-RUNDOWN-DELTAS, T2). The system needs a clear, enforceable boundary between "mutable draft" and "immutable record."

**Decision:** `finalized_at IS NOT NULL` is the **sole immutability predicate** for `table_rundown_report`. It is enforced at the RPC level (not RLS, not application code). Finalization is irreversible in MVP.

**Rules:**

1. **Finalization is a report-level stamp, not a session state.** `table_session.status` has 4 values (`OPEN`, `ACTIVE`, `RUNDOWN`, `CLOSED`). Finalization does not add a 5th state — it is metadata on the report row.

2. **Prerequisite:** `rpc_finalize_rundown` requires `table_session.status = 'CLOSED'`. You cannot finalize a report for an open session.

3. **Actor binding:** `finalized_by` is derived from `current_setting('app.actor_id')` (ADR-024). It is never accepted as a parameter.

4. **Role gate:** Only roles with finalization authority may finalize. `app.staff_role` is set by `set_rls_context_from_staff()` from `public.staff.staff_role` (ADR-024) and is authoritative for all authorization checks. Role values MUST match the canonical `public.staff_role` enum (source of truth). At MVP, authorized values are `pit_boss` and `admin`. If the enum evolves, the gate MUST be updated to match.

5. **Immutability enforcement:**
   ```sql
   -- Inside rpc_persist_table_rundown
   IF v_existing.finalized_at IS NOT NULL THEN
     RAISE EXCEPTION 'TBLRUN_ALREADY_FINALIZED'
       USING HINT = 'Report has been finalized and cannot be modified';
   END IF;
   ```

6. **No unfinalize in MVP.** Incorrect finalization requires manual DB intervention. An unfinalize mechanism is deferred until the exception workflow (PRD-038 Gap #11) is built.

7. **Late events after finalization:** Fills or credits arriving after `finalized_at` is stamped are recorded in `table_fill` / `table_credit` raw tables but are **not** reflected in the frozen `table_rundown_report`. MVP behavior:
   - The fill/credit RPC MUST emit an `audit_log` entry when it detects the associated session's rundown report is already finalized (event type: `LATE_EVENT_AFTER_FINALIZATION`).
   - The fill/credit RPC MUST set `table_rundown_report.has_late_events = true` on the finalized report row. This is the **sole exception** to finalization immutability — only this boolean flag may be flipped post-finalization, and only from `false → true` (never reset).
   - The UI MUST surface a warning badge ("Late activity after finalization") on the rundown report card when `has_late_events = true`. No additional query required.
   - Structured exception records (`reconciliation_exception` table) are deferred per SEC Note.

**Guard Implementation:**

```
┌─────────────────────────────────────────────┐
│ rpc_persist_table_rundown (UPSERT path)     │
│                                             │
│  1. Check finalized_at IS NULL              │
│     → If NOT NULL: RAISE TBLRUN_ALREADY_    │
│       FINALIZED (409)                       │
│  2. Recompute all fields from source data   │
│  3. UPSERT by (table_session_id)            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ rpc_finalize_rundown                        │
│                                             │
│  1. Verify session.status = 'CLOSED'        │
│     → If not: RAISE TBLRUN_SESSION_NOT_     │
│       CLOSED                                │
│  2. Verify finalized_at IS NULL             │
│     → If not: RAISE TBLRUN_ALREADY_         │
│       FINALIZED (409)                       │
│  3. Verify role IN ('pit_boss', 'admin')    │
│     → If not: RAISE FORBIDDEN               │
│  4. SET finalized_at = now(),               │
│       finalized_by = app.actor_id           │
│  5. Row is now permanently immutable        │
└─────────────────────────────────────────────┘
```

**Error-Code to HTTP Mapping:**

| SQL Error Code | HTTP Status | TypeScript Constant | Meaning |
|----------------|-------------|---------------------|---------|
| `TBLRUN_ALREADY_FINALIZED` | 409 Conflict | `TABLE_RUNDOWN_ALREADY_FINALIZED` | Report is finalized; mutation rejected |
| `TBLRUN_SESSION_NOT_CLOSED` | 409 Conflict | `TABLE_RUNDOWN_SESSION_NOT_CLOSED` | Cannot finalize: session not yet CLOSED |
| `TBLRUN_NOT_FOUND` | 404 Not Found | `TABLE_RUNDOWN_NOT_FOUND` | No rundown report exists for this session |
| `CHKPT_DUPLICATE_WINDOW` | 409 Conflict | `TABLE_CHECKPOINT_DUPLICATE_WINDOW` | Checkpoint already exists for this window boundary |
| `FORBIDDEN` | 403 Forbidden | `FORBIDDEN` | Role lacks authorization for this operation |
| `NO_DATA_FOUND` (session resolution) | 404 Not Found | `TABLE_SESSION_NOT_FOUND` | No active session for this table |
| `TOO_MANY_ROWS` (session resolution) | 500 Internal | `TABLE_SESSION_INVARIANT_VIOLATION` | Unique active session index violated — corruption |

SQL error codes use `TBLRUN_` / `CHKPT_` prefixes internally. Service layer remaps to `TABLE_RUNDOWN_` / `TABLE_CHECKPOINT_` TypeScript constants at the boundary (per PRD-038 Appendix C).

---

## Shift Checkpoint Immutability (Corollary)

`shift_checkpoint` rows are **immutable from creation.** There is no UPSERT — each checkpoint is an INSERT-only snapshot. No UPDATE or DELETE policy exists. RLS is SELECT-only for `authenticated`; INSERT only via `rpc_create_shift_checkpoint` (SECURITY DEFINER). Do not add UPDATE or DELETE RLS policies — immutability is by design. This is simpler than the rundown contract because checkpoints have no "draft" state.

---

## Privilege Posture

Enforceable privilege controls for both new tables:

```sql
-- table_rundown_report
REVOKE UPDATE, DELETE ON table_rundown_report FROM authenticated;
GRANT SELECT ON table_rundown_report TO authenticated;  -- via RLS Pattern C
-- INSERT/UPDATE only via GRANT EXECUTE on:
--   rpc_persist_table_rundown, rpc_finalize_rundown

-- shift_checkpoint
REVOKE UPDATE, DELETE ON shift_checkpoint FROM authenticated;
GRANT SELECT ON shift_checkpoint TO authenticated;  -- via RLS Pattern C
-- INSERT only via GRANT EXECUTE on:
--   rpc_create_shift_checkpoint
```

`service_role` retains full access for break-glass maintenance. All `service_role` mutations MUST be audited externally (Supabase dashboard audit log).

---

## Rundown Report Lifecycle

The report has three states, derived from row presence and `finalized_at`:

```
  ┌──────────┐     rpc_persist_table_rundown      ┌──────────┐
  │  ABSENT  │ ──────────── INSERT ──────────────► │  DRAFT   │
  │ (no row) │                                     │ (mutable)│
  └──────────┘                                     └────┬─────┘
                                                        │
                                          rpc_persist_  │  rpc_finalize_
                                          table_rundown │  rundown
                                          (UPDATE)      │  (stamps finalized_at)
                                              ▲         │
                                              │         ▼
                                              │    ┌──────────┐
                                              └────│ FINALIZED│
                                              ✗    │(immutable)│
                                           rejected └──────────┘
```

| State | Predicate | Allowed Mutations |
|-------|-----------|-------------------|
| **ABSENT** | No `table_rundown_report` row for session | `rpc_persist_table_rundown` → INSERT |
| **DRAFT** | Row exists, `finalized_at IS NULL` | `rpc_persist_table_rundown` → UPDATE (full recompute) |
| **FINALIZED** | Row exists, `finalized_at IS NOT NULL` | None (except `has_late_events` flag flip `false → true`) |

Transitions: `ABSENT → DRAFT → FINALIZED`. No backward transitions in MVP.

---

## Invariants

These invariants MUST hold at all times. Violation of any invariant is a corruption event requiring investigation.

1. **At most one active session** per `(casino_id, gaming_table_id)` for statuses `OPEN | ACTIVE | RUNDOWN`. Enforced by `unique_active_session_per_table` partial unique index.
2. **Every fill/credit has a persisted `session_id` FK** — resolved via the unique active session index at insertion time, then stored on the row. Downstream reconciliation relies on the stored FK, never re-resolves from the index.
3. **Session totals equal raw event sums:** `table_session.fills_total_cents = SUM(table_fill.amount_cents WHERE session_id = ...)` and `table_session.credits_total_cents = SUM(table_credit.amount_cents WHERE session_id = ...)`.
4. **Finalized rundown is immutable** through all non-break-glass code paths. Only `service_role` with manual DB intervention can modify a finalized report.
5. **Role values in authorization gates match `public.staff_role` enum** (source of truth). Gate drift is a security regression.

---

## Required Tests (First-Class Consequences)

These tests are mandatory DoD gates — not "nice to have":

| Test | Assertion |
|------|-----------|
| Session totals reconciliation | `table_session.fills_total_cents == SUM(table_fill.amount_cents)` by session |
| Session totals reconciliation | `table_session.credits_total_cents == SUM(table_credit.amount_cents)` by session |
| Finalization prerequisite | `rpc_finalize_rundown` requires `table_session.status = 'CLOSED'`; raises `TBLRUN_SESSION_NOT_CLOSED` otherwise |
| Finalization immutability | `rpc_persist_table_rundown` after finalization returns 409 `TBLRUN_ALREADY_FINALIZED` |
| Late-event audit trail | Fill/credit on a session with finalized report emits `audit_log` entry with event type `LATE_EVENT_AFTER_FINALIZATION` |
| Late-event flag | Fill/credit on finalized session sets `table_rundown_report.has_late_events = true`; flag never resets to `false` |
| Session linkage persisted | Every `table_fill` and `table_credit` row has a non-null `session_id` FK matching the active session at insertion time |
| Late-event flag irreversibility | Attempt to set `has_late_events` back to `false` on a finalized report is rejected (flag is monotonic `false → true` only) |
| Index invariant (fail loud) | `INTO STRICT` raises `TOO_MANY_ROWS` if unique active session index is violated |
| Role gate enforcement | `rpc_finalize_rundown` with `dealer` or `cashier` role raises `FORBIDDEN` |
| Cross-casino isolation | Staff from Casino A cannot read/modify Casino B rundown reports or checkpoints |

---

## Consequences

### Positive

- **Audit trail integrity:** Finalized reports are tamper-proof at the database level. No application-layer bypass possible without DB superuser access.
- **Concurrent safety:** Atomic `col = col + amount` prevents lost updates on session totals without requiring advisory locks.
- **Single source of truth:** Session totals are updated in the same transaction as the fill/credit row — no desync window.
- **Deterministic recomputation:** UPSERT recalculates all fields, so a re-run produces consistent results regardless of prior state.

### Negative

- **No unfinalize:** MVP accepts the risk that incorrect finalization requires manual DB intervention.
- **No late-event reconciliation:** Fills/credits after finalization are visible via audit_log + UI warning badge but are NOT reflected in the frozen report. Structured exception records are deferred.
- **Session totals coupling:** Fill/credit RPCs now have a side-effect (session total update). Future refactoring must preserve atomicity.

### Risks

| Risk | Mitigation |
|------|-----------|
| Fill/credit RPC change forgets session total update | DoD gate: reconciliation test `table_session.fills_total_cents = SUM(table_fill.amount_cents)` |
| UPSERT after finalization bypasses guard | Privilege exposure control: `REVOKE UPDATE, DELETE ON table_rundown_report FROM authenticated`; only `GRANT EXECUTE` on whitelisted RPCs (`rpc_persist_table_rundown`, `rpc_finalize_rundown`); `service_role` / break-glass access is audited and requires manual DB intervention |
| `unique_active_session_per_table` index dropped/modified | Index is a prerequisite for D1; schema tests MUST verify the index by **predicate and columns** (`(casino_id, gaming_table_id) WHERE status IN ('OPEN','ACTIVE','RUNDOWN')`), not only by name. Index renames are non-breaking; predicate changes are breaking. |

---

## Relationship to Existing ADRs

| ADR | Relationship |
|-----|-------------|
| ADR-027 | **Extended by this ADR.** ADR-027 defines the ephemeral computation; this ADR adds persistence, mutation, and immutability semantics. |
| ADR-024 | **Consumed.** `computed_by` and `finalized_by` are derived via `set_rls_context_from_staff()`. |
| ADR-018 | **Consumed.** All three RPCs (`rpc_persist_table_rundown`, `rpc_finalize_rundown`, `rpc_create_shift_checkpoint`) are SECURITY DEFINER and follow ADR-018 governance. |
| ADR-028 | **Consumed.** Session status enum (`OPEN`/`ACTIVE`/`RUNDOWN`/`CLOSED`) is defined by ADR-028; this ADR does not add new states. |
| ADR-026 | **Consumed.** `gaming_day` on both new tables is derived server-side using `casino_settings.timezone` + `casino_settings.gaming_day_start` via the `compute_gaming_day` contract (implementation may be SQL function or RPC). Never client-supplied. |

---

## Deferred (Post-MVP)

- Unfinalize workflow with structured exception records
- Late-event reconciliation (fills/credits after finalization → `reconciliation_exception` table)
- Audit log entry for finalization events (**Recommended MVP** — cheap compliance signal; consider promoting before GA)
- `RECONCILED` / `FINALIZED` session lifecycle states (currently rejected per PRD-038 §3.3)
- Explicit `CREATE POLICY deny_delete ON table_rundown_report FOR DELETE USING (false)`

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.3.1 | 2026-02-24 | **Accepted.** Status → Accepted. Checkpoint SELECT-only RLS sentence added. `has_late_events` monotonic reset rejection test added. Finalization audit log promoted to Recommended MVP. |
| 0.3.0 | 2026-02-24 | Pass 2 audit patches: (1) index verification by predicate/columns not name, (2) session_id persisted on fill/credit rows with linkage contract, (3) late-event mechanism: `has_late_events` flag on report, (4) explicit GRANT/REVOKE privilege posture for both tables, (5) `app.staff_role` sourced from `set_rls_context_from_staff()`, (6) Rundown Report Lifecycle section with state transitions, (7) `compute_gaming_day` as contract not signature, (8) error-code → HTTP mapping table. |
| 0.2.0 | 2026-02-24 | Pass 1 audit patches: role gate canonical enum, trigger rationale reworded, commit-consistency language, `INTO STRICT` fail-loud, late-event audit_log + UI badge, privilege exposure control, concrete gaming_day rule. Added Invariants and Required Tests sections. |
| 0.1.0 | 2026-02-24 | Initial ADR — three decisions: atomic session totals (D1), UPSERT mutability contract (D2), finalization immutability (D3) |

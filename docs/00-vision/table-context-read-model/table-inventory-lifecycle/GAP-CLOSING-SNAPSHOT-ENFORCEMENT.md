# GAP-CLOSING-SNAPSHOT-ENFORCEMENT

**Created:** 2026-03-26
**Status:** Open
**Severity:** P1
**Related PRDs:** PRD-038A (FR-5, FR-6, AC-3), PRD-059 (custody gate), PRD-TABLE-SESSION-LIFECYCLE-MVP
**Bounded Context:** TableContextService
**Branch:** table-lifecycle-recovery
**Discovered during:** PRD-059 post-implementation testing

---

## Summary

The close RPC (`rpc_close_table_session`) accepts **either** a `drop_event_id` **or** a `closing_inventory_snapshot_id` as a closing artifact. This means a table can be closed with only a drop event and no closing inventory snapshot, leaving `closing_inventory_snapshot_id = NULL` on the session row.

When the next session opens, `rpc_open_table_session` copies the predecessor's `closing_inventory_snapshot_id` into the new session's `opening_inventory_snapshot_id`. If NULL, the activation drawer has no predecessor close total to display and falls back to par bootstrap — even though a predecessor session exists.

This breaks the custody chain that PRD-059's activation drawer was designed to display.

---

## Governance Trace

### What PRD-038A specified

PRD-038A (Feb 25, 2026) defined the full table session lifecycle including:

- **FR-2**: `rpc_activate_table_session` — OPEN → ACTIVE transition
- **FR-5**: Rollover — "Open a new session with **opening provenance pointing to the prior closing snapshot**"
- **FR-6**: Close — "Uses existing `rpc_close_table_session` implementation"
- **AC-3**: "new session opening provenance **references prior closing snapshot**"

**The contradiction within PRD-038A**: FR-6 inherits the existing close RPC's "drop OR snapshot" gate. But AC-3 and FR-5 assume the closing snapshot will exist for provenance. The PRD specifies a closing snapshot as the provenance anchor while allowing sessions to close without one.

### What EXEC-038A implemented

EXEC-038A (Feb 25) explicitly scoped only Gaps A/B/C/E (close guardrails, close reason, actor attribution, gaming day). The OPEN → ACTIVE workflow was deferred:

> *"rpc_open_table_session is NOT modified — activated_by_staff_id remains unpopulated until a future rpc_activate_table_session exists (open ≠ activate)."*

The close RPC's artifact gate was not tightened. The "OR" remained.

### What PRD-059 implemented

PRD-059 (Mar 26) implemented the custody gate as a greenfield PRD with its own ADR-048, RFC, scaffold, and SEC note. The EXEC-SPEC and DA review did not flag the closing snapshot enforcement gap because:

1. The close RPC's "OR" gate was inherited, not introduced
2. ADR-048 handled missing snapshots as "Condition B — broken predecessor" with par bootstrap fallback
3. The DA team reviewed the OPEN/ACTIVATE RPCs, not the close RPC artifact requirements

### Where the break lives

| Layer | Document | Position |
|-------|----------|----------|
| Original lifecycle MVP | `20260115025237_table_session_rpcs.sql` | `drop OR snapshot` — line of least resistance for MVP |
| PRD-038A | FR-6 | Inherited the "OR" gate without tightening |
| PRD-038A | AC-3 | Assumed snapshot exists ("references prior closing snapshot") |
| EXEC-038A | WS1 description | Did not modify close artifact requirements |
| PRD-059 | ADR-048 | Treated missing snapshot as "broken predecessor" fallback |
| PRD-059 | `rpc_activate_table_session` | Correctly handles NULL (falls back to par_bootstrap) |

**The gap is between PRD-038A's FR-6 (inherit existing) and AC-3 (assume snapshot exists).** This contradiction was never surfaced because the OPEN → ACTIVE workflow was deferred until PRD-059, and PRD-059 treated it as a fallback case rather than a missing enforcement.

---

## Technical Evidence

### Close RPC — current artifact gate

**File**: `supabase/migrations/20260326020531_prd059_open_custody_rpcs.sql` (inherited from original)

```sql
-- Signature: both optional
p_drop_event_id uuid DEFAULT NULL,
p_closing_inventory_snapshot_id uuid DEFAULT NULL,

-- Validation: OR gate (only ONE required)
IF p_drop_event_id IS NULL AND p_closing_inventory_snapshot_id IS NULL THEN
  RAISE EXCEPTION 'missing_closing_artifact'
    USING ERRCODE = 'P0004',
          HINT = 'Provide drop_event_id or closing_inventory_snapshot_id';
END IF;

-- Storage: COALESCE preserves NULL if not provided
closing_inventory_snapshot_id = COALESCE(p_closing_inventory_snapshot_id, closing_inventory_snapshot_id),
```

### Open RPC — predecessor chain

```sql
-- Lookup: copies closing_inventory_snapshot_id (may be NULL)
SELECT id, closing_inventory_snapshot_id
INTO v_predecessor_session_id, v_predecessor_closing_snapshot_id
FROM table_session
WHERE gaming_table_id = p_gaming_table_id
  AND casino_id = v_casino_id
  AND status = 'CLOSED'
ORDER BY closed_at DESC NULLS LAST
LIMIT 1;

-- Insert: NULL propagates to opening_inventory_snapshot_id
opening_inventory_snapshot_id = v_predecessor_closing_snapshot_id  -- NULL if predecessor had no snapshot
```

### Activate RPC — fallback handling (correct)

```sql
IF v_session.predecessor_session_id IS NULL THEN
  v_provenance := 'par_bootstrap';          -- No predecessor at all
ELSE
  SELECT tis.id, tis.total_cents
  INTO v_predecessor_snapshot_id, v_predecessor_close_total
  FROM table_inventory_snapshot tis
  WHERE tis.id = v_session.opening_inventory_snapshot_id;

  IF v_predecessor_snapshot_id IS NULL OR v_predecessor_close_total IS NULL THEN
    v_provenance := 'par_bootstrap';        -- Broken chain: snapshot missing
  ELSE
    v_provenance := 'predecessor';          -- Valid chain
  END IF;
END IF;
```

---

## Impact

### Operational

- Pit bosses see "Par Bootstrap" warning on every table opening where the predecessor was closed with only a drop event (no closing snapshot)
- The custody chain is broken between sessions despite a predecessor existing
- Opening attestation records `provenance_source = 'par_bootstrap'` when it should be `'predecessor'`
- Variance detection (opening vs predecessor close) is unavailable — no close total to compare against

### Data quality

- `table_opening_attestation.predecessor_close_total_cents` is NULL for sessions where the chain should be intact
- `table_opening_attestation.predecessor_snapshot_id` is NULL even when a predecessor session exists
- Audit trail shows par bootstrap for what was operationally a predecessor handoff

### Compliance

- 25 CFR Part 542 requires "table inventory forms at beginning/end of shift" — a drop event alone does not satisfy the closing inventory form requirement
- The system currently allows closing without the inventory count, undermining the regulatory audit trail

---

## Proposed Remediation

### Option A — Require closing snapshot (recommended)

Tighten the close RPC for ACTIVE/RUNDOWN closes to require `closing_inventory_snapshot_id`. The drop event remains optional (it serves a different purpose — cage-side cash tracking).

```sql
-- For ACTIVE/RUNDOWN closes (not OPEN-cancellation):
IF p_closing_inventory_snapshot_id IS NULL THEN
  RAISE EXCEPTION 'closing_snapshot_required'
    USING ERRCODE = 'P0013',
          HINT = 'A closing inventory snapshot is required when closing an active session';
END IF;
```

**Scope**: Migration-only change to close RPC + update close schema validation + update close dialog UI to require snapshot selection.

**Risk**: Existing close flows that only provide drop events would break. Requires audit of all close callers (close dialog, force-close, rollover).

### Option B — Require snapshot OR populate from drop

If the drop event captures a total amount, use it as a fallback for the predecessor close total when no snapshot exists. This preserves the "OR" gate but ensures some total is always available.

**Risk**: Semantic overloading — drop total ≠ chip count. Different operational meaning.

### Option C — Require snapshot at close time, soft-enforce via UI

Keep the RPC gate as "OR" but make the close dialog UI always require a closing snapshot selection. The RPC remains backward-compatible but the primary close path enforces the snapshot.

**Risk**: Programmatic callers (API, automated rollover) can still skip the snapshot.

---

## Dependencies

- Close dialog UI (`components/table/close-session-dialog.tsx`) — currently accepts drop event alone
- Force close RPC (`rpc_force_close_table_session`) — separate code path, may also need snapshot
- Rollover workflow (not yet implemented) — FR-5 assumes snapshot exists
- Transport schema (`services/table-context/schemas.ts`) — close schema refine allows drop-only

---

## References

- PRD-038A §FR-5, FR-6, AC-3 — rollover provenance and close workflow
- PRD-059 §4.2 — activate RPC provenance derivation
- ADR-048 — custody gate architectural decisions
- `docs/00-vision/table-context-read-model/issues/OPEN-WORKFLOW-GAP.md` — original gap that triggered PRD-059
- 25 CFR Part 542 — federal table inventory form requirements
- EXEC-038A WS1 — explicit deferral of OPEN → ACTIVE workflow

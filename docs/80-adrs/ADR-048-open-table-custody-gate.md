# ADR-048: OPEN Table Custody Gate — Pilot Lite Architecture

**Status:** Proposed
**Date:** 2026-03-26
**Owner:** TableContextService
**Decision Scope:** Opening attestation persistence, session activation lifecycle, orphan-OPEN recovery
**Triggered By:** FIB-OPEN-CUSTODY-LITE — custody chain gap identified post-PRD-057 session boundary hardening
**Related:** ADR-028 (table status standardization), ADR-024 (authoritative context), ADR-040 (identity provenance), ADR-047 (operator–admin surface separation), PRD-057 (session-gated seating)

---

## Context

### The Missing Opening Half

PRD-057 hardened the session boundary: no seating, no rating slips, no gameplay without an ACTIVE session. This enforcement made a gap visible — the system enforces "you need a session" but does not enforce "you need to verify the table before gaming starts."

In practice, when a pit boss opens a table at shift start, the real-world custody handoff involves:
1. Prior shift leaves a closing slip on the table
2. Incoming pit boss reviews the slip, counts the tray, verifies the amount
3. Only then does the table open for play

Today `rpc_open_table_session` collapses this into a one-click action that inserts a session with status `'ACTIVE'` directly — no verification, no attestation, no record of custody transfer.

The `OPEN` status has existed in the `table_session_status` enum since inception but has never been written by any RPC. This ADR activates it.

### FIB Constraints

FIB-OPEN-CUSTODY-LITE (pilot-lite scope) establishes:
- **Two-act model (§F):** "Opening attestation is a separate record from the closing snapshot (two acts: handing forward vs accepting)"
- **Dealer participation required (§F):** "Column is required, not nullable" — MVP captures this as pit-boss-entered manual confirmation, not a separate dealer-side action or dual-auth step
- **No automated variance (§G):** Visual comparison only, pit boss decides
- **No supervisor override (§G):** Manual workaround, pit boss attests with a note
- **Single drawer, two conditions (§E):** Predecessor present vs predecessor absent/broken — one drawer, one path, warning + note when exception exists. "Absent" = no prior CLOSED session for this table. "Broken" = predecessor session exists but its closing snapshot is missing or has NULL `total_cents`. Both trigger the same handling: bootstrap from par, warn, require note. These are NOT separate activation modes or UI states.

---

## Decisions

### D1: Opening Attestation as Separate Table

**Decision:** Create `table_opening_attestation` as a new table within TableContextService, rather than adding attestation columns to `table_session`.

**Options considered:**
| Option | Description | Verdict |
|--------|-------------|---------|
| A: Columns on `table_session` | Add `opening_total_cents`, `opening_attested_by`, `opening_dealer_confirmed`, etc. to session row | Rejected |
| B: `table_opening_attestation` table | Separate table, linked to session via FK | **Chosen** |
| C: `custody_handoff` table + bounded context | Unified custody lifecycle entity | Rejected (FIB §H) |

**Rationale:**
- FIB §F mandates the attestation as a "separate record" — not columns on the session row
- Two-act model: closing snapshot (`table_inventory_snapshot`, type='close') and opening attestation (`table_opening_attestation`) are distinct records representing distinct operational moments by distinct actors
- Independent queryability: auditors can list, filter, and analyze attestations without parsing session rows
- Follows TableContextService precedent: `table_rundown_report` and `shift_checkpoint` are separate operational telemetry tables linked to sessions

**Why not Option A:** Collapsing the attestation into the session row muddies the two-act boundary. The session row becomes overloaded with both lifecycle state and custody attestation. The attestation is not independently queryable. Downstream readers cannot distinguish "session was activated" from "pit boss attested the handoff" without checking for null columns.

**Why not Option C:** FIB §H explicitly rejected a unified `custody_handoff` entity as premature. A `table_opening_attestation` table within the existing bounded context is not a new context — it is an operational record.

**FK direction:** `table_opening_attestation.session_id` references `table_session.id` with a UNIQUE constraint. The session does NOT carry a reverse FK (`opening_attestation_id`). Rationale: the attestation references the session, not the other way around. With UNIQUE on `session_id`, the session can find its attestation via `WHERE session_id = ?` — no bidirectional coupling needed. A reverse FK on `table_session` would create circular write ordering (must INSERT attestation before UPDATE session, or vice versa), muddier ownership (session row carrying custody-attestation state), and redundancy (the UNIQUE already guarantees at most one attestation per session). The session owns lifecycle state. The attestation references the session. Full stop.

### D2: Orphan-OPEN Cancellation via Widened Close RPC

**Decision:** Widen `rpc_close_table_session` to accept OPEN status, with relaxed artifact requirements for OPEN-state cancellation.

**Boundary rule:** This is **OPEN-cancellation semantics piggybacking on close infrastructure** — not a broadening of what "close" means. The close RPC now handles three operationally distinct modes:

| Mode | Entry status | Meaning | Artifacts required |
|------|-------------|---------|-------------------|
| Gameplay close | ACTIVE / RUNDOWN | Session had gameplay, closing artifacts prove final state | Drop event or closing snapshot required |
| Force-close | ACTIVE / RUNDOWN | Privileged override, sets `requires_reconciliation` | Close reason required, audit_log emitted |
| OPEN-cancellation | OPEN | Opening abandoned before activation — no gameplay occurred | Close reason = `'cancelled'`, no artifacts |

This distinction MUST be preserved in implementation. The OPEN-cancellation path is not "close with relaxed rules" — it is a fundamentally different operational act that reuses close infrastructure for economy. If the close RPC's mode-switching logic becomes unwieldy, the correct response is to extract a helper, not to collapse the modes.

**Options considered:**
| Option | Description | Verdict |
|--------|-------------|---------|
| X: Widen `rpc_close_table_session` | Accept OPEN in addition to ACTIVE/RUNDOWN, skip artifact requirements | **Chosen** |
| Y: Dedicated `rpc_cancel_table_session` | New RPC with cancellation-specific semantics | Rejected |

**Rationale:**
- An OPEN session that is never activated is a cancelled opening, not a failed gameplay session
- OPEN has had no gameplay — rundown is semantically wrong, closing artifacts (drop event, inventory snapshot) are irrelevant
- Widening the existing close RPC is simpler than adding a new RPC — the close path already handles reason/note, role gating, and audit
- The close RPC already validates `close_reason` + `close_note` for `'other'` — the same pattern applies to cancellation
- No new attestation record is created (nothing to attest — the opening was abandoned)
- No predecessor snapshot is consumed (the chain link was never established)
- `requires_reconciliation` is NOT set (no gameplay occurred, nothing to reconcile)

**OPEN-specific close behavior:**
- Skip closing artifact requirement (`p_drop_event_id` and `p_closing_inventory_snapshot_id` not required)
- Skip `has_unresolved_items` check (no gameplay → no rating slips → no unresolved items)
- Skip inline rundown persistence (no gameplay data to persist)
- Require `close_reason = 'cancelled'` (see D3)
- Set `closed_by_staff_id` from `app.actor_id` (ADR-024)

**Why not Option Y:** A dedicated cancel RPC adds a new entry point to maintain, test, and secure. The close RPC already has the right security posture (SECURITY DEFINER, ADR-024, role gate). Adding an OPEN-specific code path inside it is less surface area than a new RPC.

### D3: Add `'cancelled'` to `close_reason_type` Enum

**Decision:** Add `'cancelled'` as a new value to the `close_reason_type` enum.

**Rationale:**
- Semantically precise: "cancelled" describes an abandoned OPEN session — the pit boss started the open process but did not complete activation
- Distinct from `'other'`: cancellation is not a miscellaneous closure — it is a specific, named operational event with no gameplay
- Queryable: operators and auditors can filter for cancelled sessions to track abandoned openings
- No existing enum value captures this meaning — the 8 current values (`end_of_shift`, `maintenance`, `game_change`, `dealer_unavailable`, `low_demand`, `security_hold`, `emergency`, `other`) all assume a session that had gameplay

---

## Two-Step Activation Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│  Pit boss taps "Open Table"                                      │
│  → rpc_open_table_session(p_gaming_table_id)                     │
│  → INSERT table_session (status='OPEN')                          │
│  → Lookup most recent CLOSED session for this table              │
│  → Set predecessor_session_id (if found)                         │
│  → RETURN OPEN session row                                       │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  Activation drawer shown on table detail view                    │
│  (NOT pit dashboard — ADR-047 D2 active-only filter)             │
│                                                                  │
│  CONDITION A — predecessor present + valid close snapshot:       │
│    Shows: prior close total + closing pit boss name              │
│    If opening total ≠ close total → variance warning + note req  │
│    If predecessor requires_reconciliation → warning + note req   │
│                                                                  │
│  CONDITION B — predecessor absent OR broken:                     │
│    "Absent" = no prior CLOSED session for this table             │
│    "Broken" = predecessor exists but closing snapshot missing    │
│               or snapshot total_cents IS NULL                    │
│    Shows: par bootstrap target from gaming_table.par_total_cents │
│    Warning: "No predecessor custody chain" + note required       │
│                                                                  │
│  ONE drawer, ONE path. Conditions affect content, not mode.      │
└──────────┬─────────────────────────────────────────┬─────────────┘
           │                                         │
           ▼                                         ▼
┌─────────────────────────┐         ┌─────────────────────────────┐
│  Pit boss activates      │         │  Pit boss abandons           │
│  → rpc_activate (...)    │         │  → rpc_close (OPEN,          │
│  → INSERT attestation    │         │     reason='cancelled')      │
│  → Consume predecessor   │         │  → No attestation created    │
│    snapshot (if present) │         │  → No predecessor consumed   │
│  → status = 'ACTIVE'     │         │  → status = 'CLOSED'         │
│  → Table "In Play"       │         │                              │
└─────────────────────────┘         └─────────────────────────────┘
```

---

## System Invariants

| Invariant | Enforcement | Escalation |
|-----------|-------------|------------|
| `status = 'ACTIVE' → EXISTS table_opening_attestation WHERE session_id = session.id` | RPC logic (pilot) | Full FIB: database trigger or CHECK |
| One attestation per session | UNIQUE constraint on `table_opening_attestation(session_id)` | Database |
| Each predecessor close snapshot consumed at most once | Guarded RPC logic: `UPDATE table_inventory_snapshot SET consumed_by_session_id = ? WHERE id = ? AND consumed_by_session_id IS NULL` — zero affected rows → raise exception. The protection is the single nullable `consumed_by_session_id` column on the snapshot row (can hold exactly one value) plus the RPC guard that rejects the UPDATE if already set. No structural UNIQUE constraint — the invariant lives on the predecessor row, not on a consumer index. | Full FIB: consider BEFORE UPDATE trigger for defense-in-depth |
| Required recorded dealer participation on every attestation | `dealer_confirmed BOOLEAN NOT NULL` on `table_opening_attestation`. Pilot captures dealer participation as a pit-boss-entered manual confirmation — the pit boss attests that a dealer is present. This is a required recorded field, not a dealer-authenticated action or dual-auth guarantee. The column records the fact of participation, not the identity of the dealer. | Full FIB may promote to dealer-side authentication (FIB §K expansion trigger) |
| `provenance_source` derived server-side | RPC logic — not a client parameter. Derived from predecessor lookup: `predecessor_session_id IS NULL OR predecessor snapshot broken → 'par_bootstrap'`, else `'predecessor'`. | Code review gate |
| Absent or broken predecessor always requires note | RPC logic: if `provenance_source = 'par_bootstrap'` → note required regardless of amounts. | Database CHECK on attestation table (pilot) |
| Variance requires note | RPC logic: if predecessor close total ≠ opening total → note required. | RPC enforcement |
| `requires_reconciliation` on predecessor requires note | RPC logic: if predecessor session `requires_reconciliation = true` → note required. | RPC enforcement |
| `attested_by` from `app.actor_id`, not payload | `set_rls_context_from_staff()` inside SECURITY DEFINER | ADR-024 |
| OPEN-cancellation is not gameplay close | Close RPC MUST branch on entry status: OPEN → cancellation path (no artifacts, no rundown, no unresolved check). ACTIVE/RUNDOWN → gameplay close path. These are distinct operational semantics sharing infrastructure. | Code review gate |

---

## Scope Boundary

This ADR covers architecture decisions only. It does not contain:
- Migration SQL — deferred to EXEC-SPEC / PRD
- UI component design — deferred to PRD
- Service layer TypeScript — deferred to EXEC-SPEC
- Test specifications — deferred to EXEC-SPEC

---

## SRM Impact

**Tables added to TableContextService ownership:**
- `table_opening_attestation` — opening custody attestation record (FK: `session_id` → `table_session.id`, UNIQUE)

**Columns added:**
- `table_session.predecessor_session_id` (FK → `table_session.id`)
- `table_inventory_snapshot.consumed_by_session_id` (FK → `table_session.id`)
- `table_inventory_snapshot.consumed_at` (timestamptz)

**Columns NOT added (explicitly):**
- `table_session.opening_attestation_id` — rejected. Attestation references session, not reverse. See D1 FK direction.

**Enum amended:**
- `close_reason_type` — add `'cancelled'`

**RPCs modified:**
- `rpc_open_table_session` — insert OPEN instead of ACTIVE, link predecessor
- `rpc_close_table_session` — accept OPEN status with OPEN-cancellation semantics (D2)

**RPCs added:**
- `rpc_activate_table_session` — SECURITY DEFINER, ADR-024, creates attestation, consumes predecessor, transitions OPEN→ACTIVE

---

## References

- FIB: `docs/issues/gaps/table-inventory-lifecycle/OPEN-CUSTODIAL-CHAIN/FIB-OPEN-CUSTODIAL-CHAIN-PILOT-LITE.md`
- Feature Boundary: `docs/20-architecture/specs/open-custody-lite/FEATURE_BOUNDARY.md`
- Scaffold: `docs/01-scaffolds/SCAFFOLD-OPEN-CUSTODY-LITE.md`
- RFC: `docs/02-design/RFC-OPEN-CUSTODY-LITE.md`
- SEC Note: `docs/20-architecture/specs/open-custody-lite/SEC_NOTE.md`
- ADR-024: Authoritative context derivation
- ADR-028: Table status standardization
- ADR-040: Identity provenance rule
- ADR-047: Operator–admin surface separation
- PRD-057: Session-gated seating / close lifecycle hardening

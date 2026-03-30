# Feature Intake Brief — Pilot Lite Slice

**Parent document:** `FIB-OPEN-CUSTODIAL-CHAIN.md` (full-scope intent, retained as reference)
**This document:** Containment-safe pilot slice trimmed per containment protocol audit

---

## A. Feature identity
- Feature name: OPEN Table Custody Gate — Pilot Lite
- Feature ID / shorthand: FIB-OPEN-CUSTODY-LITE
- Related wedge / phase / slice: Table Lifecycle Hardening, ADR-047 Phase 4 (pilot-safe subset)
- Requester / owner: diepulp
- Date opened: 2026-03-25
- Priority: P1
- Target decision horizon: post ADR-047 Phase 1–2 (EXEC-058), current table-lifecycle-recovery branch

## B. Operator problem statement

When a pit boss opens a table at the start of a shift, the system skips the real-world custody handoff that happens at the table. In practice, the prior shift leaves a closing slip on the table — the next pit boss reviews that slip, counts the tray, verifies the amount matches, and only then opens the table for play. Today PT-2 collapses this into a one-click "open session" that jumps straight to active gaming with no verification, no attestation, and no record of whether the incoming tray matches the prior close. This means the system has no digital custody chain between shifts, win/loss calculations silently degrade when no opening snapshot exists, and there is no audit trail proving the incoming pit boss verified the handoff.

## C. Pilot-fit / current-slice justification

This belongs in the current table lifecycle hardening slice because PRD-057 just hardened the session boundary — no seating, no rating slips, no gameplay without an active session. That enforcement made the OPEN gap visible: the system now enforces "you need a session" but does not enforce "you need to verify the table before gaming starts." The custody chain is the missing half of session-gated operations. Without it, the system pretends it has shift-boundary integrity when it does not.

**Containment note:** The canonical pilot loop completes today with one-click ACTIVE and paper custody. This feature does not rescue a broken pilot loop — it closes a demonstrated integrity gap that the pilot can survive without but should not ship without if the table lifecycle hardening slice is the active work. The full FIB (FIB-OPEN-CUSTODY) is Bucket 2 / Stabilize Later. This lite slice strips the policy machinery and ships only the custody insight.

## D. Primary actor and operator moment
- Primary actor: Pit boss / floor supervisor (incoming shift)
- When does this happen? At shift start or mid-shift when opening a table that was previously closed
- Primary surface: Pit terminal — activation drawer embedded in the existing table view (not a new route)
- Trigger event: Pit boss selects a closed table and initiates the open-table action

## E. Feature Containment Loop

1. Pit boss selects a closed table on the pit terminal and taps "Open Table" → system creates a new session in `OPEN` status and links the prior closing inventory snapshot as the predecessor custody artifact (if present)
2. System presents the activation drawer showing: prior closing slip total and closing pit boss name (if predecessor exists), or "No prior closing slip — bootstrap from par" with par target (if no predecessor exists) → one drawer, two conditions, no separate mode
3. Pit boss enters the current opening tray total (single amount, not denomination grid) → system displays prior close total (or par) alongside entered amount for visual comparison
4. Pit boss attests the handoff and confirms dealer participation (pit-boss-entered manual confirmation of dealer presence) → system records opening attestation with pit boss signature, dealer confirmation, and opening total
5. If prior session had `requires_reconciliation = true` or entered opening total differs from predecessor/par, system shows a warning banner and requires the pit boss to enter a note before activation → no hard block, no supervisor override workflow, no system-enforced threshold, just warn + require note
6. System transitions session from `OPEN` to `ACTIVE`, records the opening attestation, and the table appears as "In Play" on the pit dashboard → gaming may begin

## F. Required outcomes
- A table cannot reach `ACTIVE` without a recorded opening attestation by the incoming pit boss
- Every `ACTIVE` session has a provenance source for its opening balance: prior closing slip total or par (bootstrap)
- `OPEN` tables reject rating slips, seating, and all gameplay operations — same hard guards as null-session (OPEN is non-active by design; ACTIVE authorizes gameplay, anything else does not)
- Opening attestation is a separate record from the closing snapshot (two acts: handing forward vs accepting)
- Dealer participation is recorded on every opening attestation — MVP captures this as pit-boss-entered manual confirmation, not a separate dealer-side action
- When predecessor exists, prior close total is displayed alongside current opening total for visual comparison
- When predecessor is absent or broken, the system warns and requires a note — it does not hard-block or require supervisor override

## G. Explicit exclusions
- Admin catalog UI (ADR-047 Phase 3)
- Automated gaming day rollover
- Denomination-level chipset entry in the activation drawer — total-cents entry is sufficient for pilot custody proof
- Variance policy thresholds or automated tolerance decisioning — show both numbers, pit boss decides
- Supervisor override as a system concept — no new authorization branch; pit boss calls supervisor physically if needed, attests with a note
- Broken-chain as a separate activation mode or UI state family — one drawer, one path, warning + note when exception exists
- Formal sealing of close snapshots — application-level "don't edit finalized snapshots" is enough for pilot; database immutability deferred
- Close-flow operator workflow or UI — no redesign of how the pit boss closes a session
- Changes to the rundown report or win/loss computation
- New RPC error taxonomy for OPEN state — OPEN fails existing hard guards as non-active; UI translates to specific message via read path
- Marker / token inventory lines beyond chip denomination
- Closing slip corrective workflow (void / supersede)
- Cross-property or multi-casino custody chains
- Notification or alerting on variance
- Analytics or reporting dashboards for custody exceptions

**Scope clarification — close-side artifact semantics ARE in scope:** The prior closing inventory snapshot must be designated as the predecessor custody artifact for the next opening cycle and tracked as consumed. This is a close-side artifact contract change (consumption tracking columns on `table_inventory_snapshot`), not a close-side UX change. Downstream artifacts must not conflate "close artifact semantics are in scope" with "close workflow redesign is in scope."

**Scope clarification — sealing is OUT for pilot lite:** The full FIB requires `is_sealed` flag enforcement. Pilot lite defers this. Application-level convention (don't edit finalized close snapshots) provides pilot-level finalization. The consumption columns (`consumed_by_session_id`, `consumed_at`) provide predecessor/successor chain traceability, not finality — a finalized close snapshot that has not yet been consumed is still final.

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Denomination-level chipset entry | Full custody slip records by denomination | Total-cents is sufficient for pilot custody proof. Chipset grid adds UI complexity with no pilot-survival justification. Deferred to full FIB. |
| Variance policy thresholds + automated decisioning | System-enforced tolerance and escalation | Show both numbers, let pit boss decide. No demonstrated pilot failure from absence of automated variance logic. Deferred to full FIB. |
| Supervisor override workflow | Variance or broken-chain escalation to admin/supervisor role | New authorization axis with no pilot necessity. Manual workaround: pit boss calls supervisor, supervisor overrides physically, pit boss attests with a note. Deferred to full FIB. |
| Broken-chain as separate activation mode | Force-closed predecessor has different rules than clean predecessor | One activation path with two conditions (predecessor present vs absent) and warning + note is sufficient. Separate modes create branching that causes scope rot. Deferred to full FIB. |
| Formal close snapshot sealing (`is_sealed` + enforcement) | Custody artifact must be immutable after close | Application convention is sufficient for pilot. Database immutability adds enforcement overhead for a scenario not yet demonstrated as a pilot failure. Deferred to full FIB. |
| Dedicated `custody_handoff` table / bounded context | Clean separation of custody lifecycle | Premature. Existing close snapshot + new attestation record is sufficient. |
| Par binding verification as primary custody anchor | Policy doc mentions par as opening baseline | Par is secondary / bootstrap only. Prior closing slip is the normative anchor. |
| OPEN-specific RPC error codes | Better operator messaging | Backend treats OPEN as non-active (simple invariant). UI translates to specific message. No RPC taxonomy expansion. |
| Dealer attestation as optional | Reduce scope | Rejected — dealer participation is a hard requirement operationally. MVP captures it as pit-boss-entered confirmation. Column is required, not nullable. |

## I. Dependencies and assumptions
- **ADR-047 Phase 1–2 (EXEC-058) delivered** — pit dashboard filters to active tables, `derivePitDisplayBadge()` handles OPEN defensively, surface separation established
- **PRD-057 session-gated seating** — `rpc_start_rating_slip` and `rpc_check_table_seat_availability` reject when no ACTIVE session; OPEN inherits this behavior as non-active
- **`table_inventory_snapshot` exists** with `type='close'`, `total_cents`, `session_id`, `counted_by` — the closing slip artifact
- **`gaming_table.par_total_cents`** exists (ADR-027 schema) — bootstrap baseline for new/cutover tables
- **`table_session_status` enum includes `OPEN`** — already defined, never written by current RPCs
- Assumption: variance is visual comparison only for pilot — no system-enforced thresholds

## J. Out-of-scope but likely next
- Denomination-level chipset entry in activation drawer (full FIB scope)
- Variance policy thresholds and automated decisioning (full FIB scope)
- Supervisor override as a system authorization concept (full FIB scope)
- Formal close snapshot sealing with `is_sealed` enforcement (full FIB scope)
- Admin catalog UI (ADR-047 Phase 3)

## K. Expansion trigger rule

Amend this brief if any downstream artifact proposes:
- a new user-visible outcome beyond the containment loop
- dealer attestation promoted from pit-boss-entered confirmation to a separate dealer-side action or authentication step
- variance policy enforcement beyond visual comparison + optional note
- supervisor override as a system-enforced authorization step
- broken-chain as a distinct activation mode with its own UI state
- denomination-level entry instead of total-cents
- close snapshot sealing beyond application convention
- a new surface beyond the embedded activation drawer
- custody handoff promoted to its own bounded context

## L. Scope authority block
- Intake version: v1.0
- Parent: FIB-OPEN-CUSTODY v0.1 (full-scope, retained as reference for post-pilot expansion)
- Frozen for downstream design: No — pending human review
- Downstream expansion allowed without amendment: No
- Open questions allowed to remain unresolved at scaffold stage: None — pilot lite has no open policy questions; all deferred items are explicitly excluded
- Human approval / sign-off: [Pending]

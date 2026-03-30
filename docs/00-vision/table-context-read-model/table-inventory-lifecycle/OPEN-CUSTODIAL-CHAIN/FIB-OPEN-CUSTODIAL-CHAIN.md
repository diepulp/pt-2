# Feature Intake Brief

## A. Feature identity
- Feature name: OPEN Table Custodial Chain Activation
- Feature ID / shorthand: FIB-OPEN-CUSTODY
- Related wedge / phase / slice: Table Lifecycle Hardening, ADR-047 Phase 4
- Requester / owner: diepulp
- Date opened: 2026-03-25
- Priority: P1
- Target decision horizon: post ADR-047 Phase 1–2 (EXEC-058), current table-lifecycle-recovery branch

## B. Operator problem statement

When a pit boss opens a table at the start of a shift, the system skips the real-world custody handoff that happens at the table. In practice, the prior shift leaves a closing slip on the table — the next pit boss reviews that slip, counts the tray, verifies the amount matches, and only then opens the table for play. Today PT-2 collapses this into a one-click "open session" that jumps straight to active gaming with no verification, no attestation, and no record of whether the incoming tray matches the prior close. This means the system has no digital custody chain between shifts, win/loss calculations silently degrade when no opening snapshot exists, and there is no audit trail proving the incoming pit boss verified the handoff.

## C. Pilot-fit / current-slice justification

This belongs in the current table lifecycle hardening slice because PRD-057 just hardened the session boundary — no seating, no rating slips, no gameplay without an active session. That enforcement made the OPEN gap visible: the system now enforces "you need a session" but does not enforce "you need to verify the table before gaming starts." The custody chain is the missing half of session-gated operations. Without it, the system pretends it has shift-boundary integrity when it does not.

## D. Primary actor and operator moment
- Primary actor: Pit boss / floor supervisor (incoming shift)
- When does this happen? At shift start or mid-shift when opening a table that was previously closed
- Primary surface: Pit terminal — dedicated activation drawer/modal within the existing table view
- Trigger event: Pit boss selects a closed table and initiates the open-table action

## E. Feature Containment Loop

1. Pit boss selects a closed table on the pit terminal and taps "Open Table" → system creates a new session in `OPEN` status and links the prior closing inventory snapshot as the predecessor custody artifact
2. System presents the activation drawer showing: prior closing slip total, closing timestamp, closing pit boss name, par target, and a field for current counted tray amount → pit boss sees the custody context for this table
3. Pit boss counts the tray and enters the current opening amount by denomination → system computes variance against prior closing slip total and displays it
4. Pit boss reviews variance; if clean (within policy tolerance), pit boss attests the handoff and confirms dealer participation → system records opening attestation with pit boss signature, dealer confirmation (required — MVP capture is pit-boss-entered manual confirmation of dealer presence), counted amount, and zero/low variance
5. If variance exceeds policy tolerance, pit boss enters a variance reason and (if required by policy) requests supervisor override → system records the discrepancy, reason, and override authorization before permitting activation
6. System transitions session from `OPEN` to `ACTIVE`, records the opening inventory snapshot, and the table appears as "In Play" on the pit dashboard → gaming may begin
7. **Bootstrap path (new table / cutover):** When no prior closing slip exists, pit boss sees "No prior closing slip — bootstrap activation" with par as expected baseline instead of prior close total → pit boss counts tray, enters amount, attests against par, system records bootstrap provenance and activates
8. **Broken chain path (force-closed predecessor):** When prior session was force-closed with `requires_reconciliation = true`, activation is blocked → pit boss sees "Prior session unresolved — reconciliation or supervisor override required" and cannot activate until exception is resolved

## F. Required outcomes
- A table cannot reach `ACTIVE` without a recorded opening attestation by the incoming pit boss
- Every `ACTIVE` session has a provenance source for its opening balance: either prior closing slip or bootstrap from par
- The prior closing inventory snapshot is sealed at close and formally consumed by the next opening cycle
- Variance between prior close and current opening count is computed, recorded, and visible
- Force-closed sessions with `requires_reconciliation = true` block normal activation of the successor session
- `OPEN` tables reject rating slips, seating, and all gameplay operations — same hard guards as null-session
- Opening attestation is a separate record from the closing snapshot (two acts: handing forward vs accepting)
- Dealer participation is recorded on every opening attestation — MVP captures this as pit-boss-entered manual confirmation, not a separate dealer-side action

## G. Explicit exclusions
- Admin catalog UI (ADR-047 Phase 3) — not part of this feature
- Automated gaming day rollover — sessions remain manually opened and closed
- Marker / token inventory lines beyond chip denomination — future extension
- Closing slip corrective workflow (void / supersede) — future if needed
- Cross-property or multi-casino custody chains
- Notification or alerting on variance breaches
- Analytics or reporting dashboards for custody exceptions
- Close-flow operator workflow or UI — no redesign of how the pit boss closes a session
- Changes to the rundown report or win/loss computation — the rundown report is a financial derivative, not a custody artifact
- New RPC error taxonomy for OPEN state — OPEN fails existing hard guards as non-active; UI translates to specific message via read path

**Scope clarification — close-side artifact semantics ARE in scope:** The prior closing inventory snapshot must be sealed at close completion and designated as the predecessor custody artifact for the next opening cycle. This is a close-side artifact contract change (sealing flag, consumption tracking columns), not a close-side UX change. Downstream artifacts must not conflate "close artifact semantics are in scope" with "close workflow redesign is in scope."

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Dedicated `custody_handoff` table / bounded context | Clean separation of custody lifecycle from inventory snapshots | Premature — handoff does not yet have rich standalone lifecycle requirements (multi-step reconciliation, escalation chains, override histories). The existing close snapshot + new attestation record is sufficient. Revisit if custody becomes its own domain. |
| Par binding verification as primary custody anchor | ADR-028 D4 and policy doc mention par as opening baseline | Par is a secondary control and bootstrap fallback, not the normative custody anchor. The principal artifact is the prior closing slip. Par displacing the closing slip would mismodel the real-world custody loop. |
| OPEN-specific RPC error codes (`SESSION_PENDING_ACTIVATION`) | Better operator messaging when actions are blocked on OPEN tables | Infects every guard path with workflow-specific branch logic. The correct split: backend treats OPEN as non-active (simple invariant), UI translates to specific message when it knows the session is OPEN (presentation concern). |
| Closing slip sealing via database triggers / immutable audit table | Strongest integrity guarantee for custody artifacts | Over-engineering for MVP. Sealing via `is_sealed` flag + application-level enforcement is sufficient. Database-level immutability can be added later without schema change if audit requirements demand it. |
| Dealer attestation as optional / house-policy-dependent | Reduce MVP scope by making dealer participation nullable | Rejected — dealer participation at the table is a hard requirement in the real-world custody handoff. MVP captures it as pit-boss-entered manual confirmation (checkbox or dealer name entry) rather than a separate dealer-side auth action. The column is required, not nullable; the UX is simplified, not the requirement. |

## I. Dependencies and assumptions
- **ADR-047 Phase 1–2 (EXEC-058) delivered** — pit dashboard filters to active tables, `derivePitDisplayBadge()` handles OPEN defensively, surface separation established
- **PRD-057 session-gated seating** — `rpc_start_rating_slip` and `rpc_check_table_seat_availability` reject when no ACTIVE session; OPEN inherits this behavior
- **`table_inventory_snapshot` exists** with `type='close'`, `total_cents`, `session_id`, `counted_by`, `chipset` JSONB — the closing slip artifact
- **`gaming_table.par_total_cents`** exists (ADR-027 schema) — bootstrap baseline for new/cutover tables
- **`table_session_status` enum includes `OPEN`** — already defined, never written by current RPCs
- Assumption: house variance policy thresholds are not yet configurable in-system — hardcoded or pit-boss-discretion for MVP

## J. Out-of-scope but likely next
- Admin catalog UI (ADR-047 Phase 3) — table lifecycle management surface for admins
- Configurable variance policy thresholds per casino / table type
- Closing slip corrective workflow (void, supersede, re-attest)

## K. Expansion trigger rule

Amend this brief if any downstream artifact proposes:
- a new user-visible outcome beyond the containment loop
- dealer attestation promoted from pit-boss-entered confirmation to a separate dealer-side action or authentication step
- automated variance policy enforcement beyond record-and-display
- changes to the close flow or rundown computation
- a new surface beyond the pit terminal activation drawer
- custody handoff promoted to its own bounded context

## L. Scope authority block
- Intake version: v0.1 (patched: dealer attestation corrected, close-artifact scope clarified, override provenance constraint added)
- Frozen for downstream design: No — pending human review
- Downstream expansion allowed without amendment: No
- Open questions allowed to remain unresolved at scaffold stage: Variance policy thresholds (hardcoded vs configurable); supervisor override role requirements (admin-only vs senior pit boss) — **constraint: MVP must record override provenance (who, when, reason) without freezing the full role matrix; downstream specs must not invent authorization policy beyond recording the override act**
- Human approval / sign-off: [Pending]

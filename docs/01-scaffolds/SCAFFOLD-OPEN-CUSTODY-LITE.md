---
id: SCAFFOLD-OPEN-CUSTODY-LITE
title: "Feature Scaffold: OPEN Table Custody Gate — Pilot Lite"
owner: diepulp
status: Draft
date: 2026-03-26
---

# Feature Scaffold: OPEN Table Custody Gate — Pilot Lite

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** OPEN Table Custody Gate — Pilot Lite
**Owner / driver:** diepulp
**Stakeholders (reviewers):** pit operations
**Status:** Draft
**Last updated:** 2026-03-26

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss opening a table at shift start, I need to verify the prior closing tray total, enter the current opening total, confirm dealer presence, and attest the handoff — so the system records a custody chain between shifts instead of silently jumping to gameplay.
- **Primary actor:** Pit boss / floor supervisor (incoming shift)
- **Success looks like:** Every ACTIVE session has a linked `table_opening_attestation` record with provenance (prior close total or par bootstrap), and no table can reach ACTIVE without one.

## 2) Constraints (hard walls)

- **Session state machine:** OPEN already exists in the `table_session_status` enum but is never written today. `rpc_open_table_session` currently inserts with status `'ACTIVE'` directly. This must change to insert `'OPEN'`, with a new RPC to transition OPEN→ACTIVE.
- **Two-act persistence model (FIB §F):** "Opening attestation is a separate record from the closing snapshot (two acts: handing forward vs accepting)." The attestation MUST be a separate `table_opening_attestation` row — not columns on `table_session`. This preserves the two-act boundary and makes the attestation a first-class queryable artifact. The session row links to it via FK, but the attestation is its own record. This is distinct from the rejected `custody_handoff` table (FIB §H) — that rejection applies to a unified custody lifecycle entity, not to the opening-side attestation record.
- **Session-gated guards (PRD-057):** OPEN is non-ACTIVE. Existing guards (`rpc_start_rating_slip`, `rpc_check_table_seat_availability`) already reject non-ACTIVE sessions. No guard changes needed.
- **RLS / tenancy:** All writes within TableContextService, casino-scoped via `set_rls_context_from_staff()` (ADR-024). Opening attestation inherits same posture.
- **Actor identity:** Attesting pit boss is authoritative from `app.actor_id` — no spoofable parameter (ADR-024).
- **Single active session per table:** Existing FOR UPDATE lock in `rpc_open_table_session` prevents concurrent opens.
- **Pilot-lite scope:** Total-cents only (no denomination grid), visual comparison only (no automated variance thresholds), no supervisor override workflow, no close snapshot sealing.

## 3) Non-goals (what we refuse to do in this iteration)

- Denomination-level chipset entry in the activation drawer
- Automated variance thresholds or policy-driven tolerance decisioning
- Supervisor override as a system authorization concept
- Broken-chain as a separate activation mode / UI state family
- Close snapshot sealing (`is_sealed` enforcement)
- Unified `custody_handoff` table or new bounded context (FIB §H: the opening attestation record is sufficient as a standalone table within TableContextService)
- Close-side operator workflow or UI redesign
- New RPC error taxonomy for OPEN state
- Analytics or reporting dashboards for custody exceptions

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - `p_gaming_table_id` — which table to open (existing)
  - `p_opening_total_cents` — pit boss enters current tray total
  - `p_dealer_confirmed` — boolean, pit boss confirms dealer presence (NOT NULL, required per FIB §F)
  - `p_opening_note` — free-text note; **required** when any of the following conditions exist: (a) no predecessor snapshot (bootstrap from par), (b) entered opening total differs from predecessor close total (variance), (c) predecessor session has `requires_reconciliation = true`. Note is optional ONLY when predecessor exists, totals match, and no reconciliation flag is set.
- **Outputs:**
  - `table_opening_attestation` row created as a separate record (opening total, attesting staff, dealer confirmation, note, predecessor linkage)
  - `table_session` transitions from OPEN to ACTIVE with FK link to the attestation record
  - `table_inventory_snapshot` predecessor close snapshot gets consumption tracking columns set (`consumed_by_session_id`, `consumed_at`)
- **Canonical contract(s):** `ActivateTableSessionParams`, `OpeningAttestationDTO`, `TableSessionDTO` (extended with attestation FK)

## 5) Options (2-4 max; force tradeoffs)

### Option A: Two-RPC split (OPEN + ACTIVATE)

Modify `rpc_open_table_session` to insert with status `'OPEN'` and link predecessor snapshot. Add new `rpc_activate_table_session` that accepts attestation payload, creates `table_opening_attestation` row, links it to the session, marks predecessor as consumed, and transitions OPEN→ACTIVE.

- **Pros:**
  - Clean separation of concerns: session creation vs custody attestation
  - Activation drawer can load predecessor data from the OPEN session before the pit boss fills in attestation — server provides predecessor context, client doesn't guess
  - Aligns with existing state machine (OPEN was always defined, never used)
  - Exit ramp to full FIB: activate RPC gains denomination-level parameters later without changing the open RPC
- **Cons / risks:**
  - Two RPCs = two network roundtrips for what was one click
  - If pit boss abandons after OPEN without activating, orphaned OPEN sessions need a cancellation path (see §8 — semantically distinct from rundown or normal close)
  - UI must handle the OPEN→ACTIVE transition drawer atomically
- **Cost / complexity:** Medium — one RPC modification + one new RPC + new table + migration + UI activation drawer
- **Security posture impact:** Positive — attestation is authoritative (ADR-024 derived actor), no new authorization axis
- **Exit ramp:** Full FIB adds denomination grid to the activate RPC payload; variance policy hooks into the activate step; supervisor override wraps activate with an authorization check. No structural rewrites.

### Option B: Single-RPC atomic open-and-activate

Add attestation parameters directly to `rpc_open_table_session` so it creates the session as ACTIVE in one call, recording the attestation inline. The OPEN state is never persisted.

- **Pros:**
  - One roundtrip, simpler client integration
  - No orphaned OPEN sessions possible
  - Less migration surface (no new RPC, just parameters added to existing one)
- **Cons / risks:**
  - OPEN state is never observable — loses state machine fidelity
  - Client must gather all attestation data before the RPC call — can't show predecessor data from the server until after session exists
  - Predecessor lookup must happen client-side or via a separate read query before the open call
  - Exit ramp is worse: adding denomination grid, variance policy, or supervisor override to a single mega-RPC causes parameter bloat and overloading risk (CLAUDE.md: no overloading PostgreSQL functions with overlapping DEFAULT signatures)
  - Conflates session creation with custody attestation — two distinct operational acts in one transaction
- **Cost / complexity:** Low — parameter additions to existing RPC + migration + UI
- **Security posture impact:** Neutral — same ADR-024 posture, but attestation is less auditable as a distinct act
- **Exit ramp:** Poor — full FIB expansion forces either RPC overloading (banned) or splitting into two RPCs retroactively (breaking change).

## 6) Decision to make (explicit)

- Decision: **Option A — Two-RPC split (OPEN + ACTIVATE)**
- Decision drivers:
  1. Fidelity to the real-world operational act: opening a table and attesting custody are two distinct moments
  2. Server-driven predecessor context: once OPEN session exists, the activation drawer can load predecessor data from the server rather than requiring the client to pre-fetch
  3. Clean exit ramp to full FIB expansion without RPC overloading
  4. Two-act persistence model preserved: attestation is a separate record, not columns on the session row
- Decision deadline: Before Phase 2 (Design Brief)

**Surface note (ADR-047 D2):** The pit dashboard pre-filters to active tables. OPEN tables are NOT visible on the pit dashboard. The activation drawer launches from the table detail view (where the pit boss selects a closed table and taps "Open Table"), not from the dashboard. `derivePitDisplayBadge()` handles OPEN defensively (returns blue "Open" badge) if an OPEN table is ever rendered, but the dashboard filter means this code path is reached only on the table detail view, not the dashboard grid. If dashboard-level OPEN observability is wanted, the ADR-047 D2 filter must be widened — this is a separate decision, not assumed.

## 7) Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| ADR-047 Phase 1–2 (EXEC-058) | Required | Implemented (`derivePitDisplayBadge()` handles OPEN defensively; pit dashboard filters to ACTIVE tables per D2) |
| PRD-057 session-gated seating | Required | Implemented (OPEN inherits non-ACTIVE rejection) |
| `table_session_status` enum includes `OPEN` | Required | Implemented (defined, never written) |
| `table_inventory_snapshot.session_id` | Required | Implemented (ADR-027 schema) |
| `table_inventory_snapshot.total_cents` | Required | Implemented (ADR-027 schema) |
| `gaming_table.par_total_cents` | Required | Implemented (ADR-027 schema) |

## 8) Risks / Open questions

| Risk / Question | Impact | Mitigation / Learning Plan |
|-----------------|--------|---------------------------|
| Orphaned OPEN sessions (pit boss opens but never activates) | Med | OPEN sessions have had no gameplay — rundown is semantically wrong (nothing to run down), and normal close requires ACTIVE/RUNDOWN status. Recovery path is **cancellation**: either (a) widen `rpc_close_table_session` to accept OPEN status with no closing artifact requirement, or (b) add a dedicated `rpc_cancel_table_session` that transitions OPEN→CLOSED with a cancellation reason. The existing `close_reason_type` enum lacks a `cancelled` value — one must be added, or `other` with a required note serves as the pilot-grade fallback. This recovery shape must be frozen before handoff. |
| `total_cents` on `table_inventory_snapshot` may be NULL for legacy snapshots | Med | Predecessor lookup handles NULL gracefully — treated as broken chain (warn + require note). No hard block. |
| Dashboard polling latency between OPEN and ACTIVE state | Low | Moot for pilot — pit dashboard filters to active tables (ADR-047 D2), so OPEN is not displayed there. The activation drawer is on the table detail view, which the opening pit boss is already viewing. |
| Consumption tracking columns on `table_inventory_snapshot` are new — backward compatibility | Low | `consumed_by_session_id` and `consumed_at` are NULLABLE, DEFAULT NULL. Existing close snapshots remain valid. |
| Note-rule edge case: par bootstrap with no variance | Low | FIB §F says "predecessor is absent or broken → warn and require a note." Bootstrap (no predecessor) always requires a note regardless of whether entered total matches par. The note records why the pit boss is opening without a predecessor, not whether amounts differ. |

## 9) Definition of Done

Before handoff to design/ADR/PRD phases, the following shapes must be explicitly frozen:

- [ ] **Attestation persistence shape frozen:** Opening attestation is a separate `table_opening_attestation` record (per FIB §F two-act model). Session row links to it via FK. Column set agreed.
- [ ] **Predecessor consumption shape frozen:** `consumed_by_session_id` and `consumed_at` on `table_inventory_snapshot`. Idempotency rule agreed (reject if already consumed by a different session, or log warning for pilot).
- [ ] **Abandoned-OPEN recovery semantics frozen:** Cancellation path defined (widen close RPC or add cancel RPC). `close_reason_type` amendment agreed if needed. Semantic grounding: OPEN sessions are cancelled, not run down.
- [ ] **Note-rule conditions frozen:** Note required when: (a) no predecessor, (b) variance, (c) `requires_reconciliation = true`. Note optional only when predecessor exists + totals match + no reconciliation flag.
- [ ] Decision recorded in ADR(s)
- [ ] Acceptance criteria agreed
- [ ] Implementation plan delegated

## Links

- Feature Boundary: `docs/20-architecture/specs/open-custody-lite/FEATURE_BOUNDARY.md`
- Source FIB: `docs/issues/gaps/table-inventory-lifecycle/OPEN-CUSTODIAL-CHAIN/FIB-OPEN-CUSTODIAL-CHAIN-PILOT-LITE.md`
- Design Brief/RFC: (Phase 2)
- ADR(s): (Phase 4)
- PRD: (Phase 5)
- Exec Spec: (post-pipeline)

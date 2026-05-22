---
id: PRD-059
title: "OPEN Table Custody Gate — Pilot Lite"
owner: Engineering
status: Draft
affects: [ADR-048, ADR-028, ADR-047, PRD-057, PRD-038A]
created: 2026-03-26
last_review: 2026-03-26
phase: Phase 2 (Table Lifecycle Hardening)
http_boundary: true
---

# PRD-059 — OPEN Table Custody Gate — Pilot Lite

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** When a pit boss opens a table, `rpc_open_table_session` creates a session as ACTIVE in one click — no tray verification, no custody attestation, no link to the prior shift's closing slip. PRD-059 splits table activation into two steps (OPEN → ACTIVE), adds a `table_opening_attestation` record as a first-class custody artifact, and links each opening to its predecessor closing snapshot. The system enforces that no table reaches ACTIVE without a recorded attestation by the incoming pit boss.

---

## 2. Problem & Goals

### 2.1 Problem

PRD-057 hardened the session boundary: no seating, no rating slips, no gameplay without an ACTIVE session. This enforcement made a gap visible — the system enforces "you need a session" but does not enforce "you need to verify the table before gaming starts."

In practice, when a pit boss opens a table at shift start, the real-world custody handoff involves reviewing the prior closing slip, counting the tray, verifying the amount matches, and attesting the handoff. Today PT-2 collapses this into a one-click action that jumps straight to ACTIVE with no verification, no attestation, and no record of whether the incoming tray matches the prior close. The result: no digital custody chain between shifts, win/loss calculations silently degrade when no opening snapshot exists, and there is no audit trail proving the incoming pit boss verified the handoff.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: No table reaches ACTIVE without attestation | `rpc_activate_table_session` creates attestation atomically with OPEN→ACTIVE transition. Integration test: attempt ACTIVE without attestation → rejected. |
| **G2**: Every ACTIVE session has provenance | `table_opening_attestation.provenance_source` is `'predecessor'` or `'par_bootstrap'` on every attestation row. Query: `SELECT count(*) FROM table_opening_attestation WHERE provenance_source IS NULL` = 0. |
| **G3**: Predecessor close snapshot consumed at most once | Guarded UPDATE: `WHERE consumed_by_session_id IS NULL`. Integration test: second activation targeting same predecessor → exception. |
| **G4**: Dealer participation recorded on every attestation | `dealer_confirmed BOOLEAN NOT NULL` on `table_opening_attestation`. CHECK constraint enforces `dealer_confirmed = true`. |
| **G5**: Bootstrap and variance conditions require a note | Integration tests: (a) no predecessor → note required, (b) variance → note required, (c) `requires_reconciliation` → note required, (d) match + no flags → note optional. |
| **G6**: Orphan-OPEN sessions cancellable | `rpc_close_table_session` accepts OPEN status with `close_reason = 'cancelled'`. Integration test: close OPEN session → succeeds with no artifact requirements. |

### 2.3 Non-Goals

- Denomination-level chipset entry in the activation drawer (full FIB scope)
- Automated variance thresholds or policy-driven tolerance decisioning (full FIB scope)
- Supervisor override as a system authorization concept (full FIB scope)
- Broken-chain as a separate activation mode / UI state family (one drawer, two conditions)
- Close snapshot sealing (`is_sealed` enforcement) (full FIB scope)
- Unified `custody_handoff` table or new bounded context (FIB §H)
- Close-side operator workflow or UI redesign
- Widening the pit dashboard active-only filter to show OPEN tables (separate decision)
- Analytics or reporting dashboards for custody exceptions

---

## 3. Users & Use Cases

- **Primary users:** Pit boss / floor supervisor (incoming shift)
- **Secondary users:** Admin (table management), auditors (custody chain review)

**Top Jobs:**

- As a **pit boss opening a table**, I need to see the prior closing slip total and closing pit boss name, enter my counted tray total, confirm a dealer is present, and attest the handoff — so the system records a custody chain rather than silently jumping to gameplay.
- As a **pit boss opening a new/cutover table**, I need to see the par target when no predecessor exists, acknowledge the bootstrap condition with a note, and activate the table — so the system records why this opening has no predecessor chain.
- As a **pit boss abandoning an open**, I need to cancel an OPEN session that I started but don't want to activate — so the table returns to closed state without a dangling OPEN session.
- As an **auditor**, I need to query all opening attestations independently, filter by provenance source, and trace custody chains across shifts — so I can verify handoff compliance without parsing session rows.

---

## 4. Detailed Requirements

### 4.1 Schema Changes

**New table: `table_opening_attestation`**

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | NO | `gen_random_uuid()` | Primary key |
| `casino_id` | uuid FK→casino | NO | — | Casino scoping (RLS) |
| `session_id` | uuid FK→table_session, UNIQUE | NO | — | Session this attestation activates |
| `opening_total_cents` | integer | NO | — | Pit boss entered opening tray total |
| `attested_by` | uuid FK→staff | NO | — | Authoritative from `app.actor_id` (ADR-024) |
| `attested_at` | timestamptz | NO | `now()` | When attestation was recorded |
| `dealer_confirmed` | boolean NOT NULL CHECK (true) | NO | — | Required dealer participation (FIB §F) |
| `note` | text | YES | NULL | Required when bootstrap/variance/reconciliation |
| `predecessor_snapshot_id` | uuid FK→table_inventory_snapshot | YES | NULL | Closing snapshot from predecessor (NULL = bootstrap) |
| `predecessor_close_total_cents` | integer | YES | NULL | Denormalized close total for display |
| `provenance_source` | text NOT NULL | NO | — | `'predecessor'` or `'par_bootstrap'` — server-derived |
| `created_at` | timestamptz | NO | `now()` | Row creation timestamp |

**New columns on `table_session`:**

| Column | Type | Purpose |
|--------|------|---------|
| `predecessor_session_id` | uuid FK→table_session, NULLABLE | Previous CLOSED session this opening chains from |

**New columns on `table_inventory_snapshot`:**

| Column | Type | Purpose |
|--------|------|---------|
| `consumed_by_session_id` | uuid FK→table_session, NULLABLE | Session that consumed this snapshot as predecessor |
| `consumed_at` | timestamptz, NULLABLE | When consumption occurred |

**Enum amendment:**

- `close_reason_type`: add `'cancelled'`

**RLS on `table_opening_attestation`:**

- SELECT: Pattern C hybrid, authenticated, same casino
- INSERT / UPDATE / DELETE: DENIED to authenticated (RPC-only writes)
- REVOKE INSERT, UPDATE, DELETE FROM authenticated, anon, PUBLIC

### 4.2 RPC Changes

**Modified: `rpc_open_table_session(p_gaming_table_id uuid)`**

- Change INSERT status from `'ACTIVE'` to `'OPEN'`
- After INSERT, lookup most recent CLOSED session for this table:
  ```sql
  SELECT id, closing_inventory_snapshot_id
  FROM table_session
  WHERE gaming_table_id = p_gaming_table_id
    AND casino_id = v_casino_id
    AND status = 'CLOSED'
  ORDER BY closed_at DESC NULLS LAST
  LIMIT 1;
  ```
- If predecessor found: set `predecessor_session_id` on new session, set `opening_inventory_snapshot_id` to predecessor's closing snapshot
- Return OPEN session row

**New: `rpc_activate_table_session(p_table_session_id uuid, p_opening_total_cents integer, p_dealer_confirmed boolean, p_opening_note text DEFAULT NULL)`**

- SECURITY DEFINER, `SET search_path = pg_catalog, public`
- `set_rls_context_from_staff()` (ADR-024)
- Role gate: `pit_boss`, `admin`
- Validate session exists, belongs to casino, status = 'OPEN' (FOR UPDATE lock)
- Validate `p_dealer_confirmed = true`
- Validate `p_opening_total_cents >= 0`
- Derive provenance and note requirement:
  - `predecessor_session_id IS NULL` OR predecessor's closing snapshot missing/NULL total → `provenance_source = 'par_bootstrap'`, note required
  - Else `provenance_source = 'predecessor'`:
    - Predecessor close total ≠ `p_opening_total_cents` → variance, note required
    - Predecessor session `requires_reconciliation = true` → note required
    - Match + no flags → note optional
- If note required and `p_opening_note` is NULL or empty → raise exception
- INSERT `table_opening_attestation` row
- UPDATE `table_session`: `status = 'ACTIVE'`, `activated_by_staff_id = v_actor_id`
- If predecessor snapshot exists: `UPDATE table_inventory_snapshot SET consumed_by_session_id = ?, consumed_at = now() WHERE id = ? AND consumed_by_session_id IS NULL` — zero rows affected → raise exception (chain fork)
- RETURN updated session row
- REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated

**Modified: `rpc_close_table_session` — OPEN-cancellation path (ADR-048 D2)**

- Widen status check to accept `'OPEN'` in addition to `'ACTIVE'`, `'RUNDOWN'`
- When entry status = `'OPEN'`:
  - Skip closing artifact requirement
  - Skip `has_unresolved_items` check
  - Skip inline rundown persistence
  - Require `close_reason` (use `'cancelled'`)
- This is OPEN-cancellation semantics piggybacking on close infrastructure, not a broadening of gameplay-close semantics (ADR-048 D2 boundary rule)

### 4.3 Service Layer

**New DTO:**
```typescript
interface OpeningAttestationDTO {
  id: string;
  sessionId: string;
  openingTotalCents: number;
  attestedBy: string;
  attestedAt: string;
  dealerConfirmed: boolean;
  note: string | null;
  predecessorSnapshotId: string | null;
  predecessorCloseTotalCents: number | null;
  provenanceSource: 'predecessor' | 'par_bootstrap';
}

interface ActivateTableSessionParams {
  tableSessionId: string;
  openingTotalCents: number;
  dealerConfirmed: boolean;
  openingNote?: string | null;
}
```

**Extended `TableSessionDTO`:** add `predecessorSessionId: string | null`

### 4.4 UI: Activation Drawer

Embedded in the existing table detail view (not a new route, not on the pit dashboard).

**Flow:**
1. Pit boss navigates to a closed table on the table detail view → taps "Open Table" → client calls `rpc_open_table_session`
2. Session created in OPEN state → `derivePitDisplayBadge()` returns blue "Open" badge
3. Activation drawer slides open showing:

   **Condition A — predecessor present + valid close snapshot:**
   - "Prior closing slip: $X,XXX.XX by [Pit Boss Name]"
   - If predecessor `requires_reconciliation`: warning banner "Prior session flagged for reconciliation"
   - After entry: if amounts differ → variance warning banner

   **Condition B — predecessor absent OR broken:**
   - "No prior closing slip — bootstrap from par: $X,XXX.XX"
   - Warning banner: "No predecessor custody chain — note required"

   **Common fields:**
   - Opening total input (single amount, total cents)
   - Dealer confirmation checkbox ("I confirm a dealer is present at this table")
   - Note field (visually required when any warning banner shown)
   - "Activate Table for Play" button (disabled until dealer confirmed + note filled when required)

4. Pit boss fills in fields → taps "Activate" → client calls `rpc_activate_table_session`
5. Attestation created, session transitions OPEN→ACTIVE → table shows "In Play" (green)

**Cancellation:** If pit boss navigates away or taps "Cancel" on an OPEN session, client calls `rpc_close_table_session` with `close_reason = 'cancelled'`.

---

## 5. Acceptance Criteria

| ID | Criterion | Test Type |
|----|-----------|-----------|
| AC-1 | `rpc_open_table_session` creates session with status `'OPEN'`, not `'ACTIVE'` | Integration |
| AC-2 | `rpc_open_table_session` links `predecessor_session_id` from most recent CLOSED session for the same table | Integration |
| AC-3 | OPEN session rejects rating slips via `rpc_start_rating_slip` (inherits PRD-057 non-ACTIVE guard) | Integration |
| AC-4 | OPEN session rejects seating via `rpc_check_table_seat_availability` (inherits PRD-057 guard) | Integration |
| AC-5 | `rpc_activate_table_session` creates `table_opening_attestation` row with all required fields | Integration |
| AC-6 | `rpc_activate_table_session` transitions session from OPEN→ACTIVE | Integration |
| AC-7 | `rpc_activate_table_session` rejects when session status ≠ OPEN | Integration |
| AC-8 | `rpc_activate_table_session` rejects when `dealer_confirmed = false` | Integration |
| AC-9 | `rpc_activate_table_session` rejects when note required but missing (bootstrap) | Integration |
| AC-10 | `rpc_activate_table_session` rejects when note required but missing (variance) | Integration |
| AC-11 | `rpc_activate_table_session` rejects when note required but missing (`requires_reconciliation`) | Integration |
| AC-12 | `rpc_activate_table_session` allows null note when predecessor matches and no flags | Integration |
| AC-13 | `rpc_activate_table_session` sets `provenance_source = 'par_bootstrap'` when no predecessor | Integration |
| AC-14 | `rpc_activate_table_session` sets `provenance_source = 'predecessor'` when predecessor exists | Integration |
| AC-15 | `rpc_activate_table_session` consumes predecessor snapshot (`consumed_by_session_id` set) | Integration |
| AC-16 | `rpc_activate_table_session` rejects when predecessor snapshot already consumed | Integration |
| AC-17 | `rpc_activate_table_session` sets `attested_by` from `app.actor_id`, not from client | Integration |
| AC-18 | `rpc_activate_table_session` rejects dealer role | Integration |
| AC-19 | `rpc_close_table_session` accepts OPEN status with `close_reason = 'cancelled'` | Integration |
| AC-20 | `rpc_close_table_session` skips artifact requirement for OPEN-cancellation | Integration |
| AC-21 | Cancelled OPEN session does not create attestation, does not consume predecessor | Integration |
| AC-22 | `table_opening_attestation` RLS denies direct INSERT from authenticated role | Integration |
| AC-23 | `table_opening_attestation` RLS denies cross-casino SELECT | Integration |
| AC-24 | Activation drawer shows predecessor close total and pit boss name when predecessor exists | E2E |
| AC-25 | Activation drawer shows par bootstrap with warning when no predecessor | E2E |
| AC-26 | Activation drawer shows variance warning when amounts differ | E2E |
| AC-27 | Activation drawer requires note when warning banner shown | E2E |
| AC-28 | Activation drawer disabled until dealer confirmed | E2E |

---

## 6. Definition of Done

- [ ] Migration deployed: `table_opening_attestation` table, `table_session.predecessor_session_id`, `table_inventory_snapshot.consumed_by_session_id`/`consumed_at`, `close_reason_type` + `'cancelled'`
- [ ] `rpc_open_table_session` inserts OPEN, links predecessor
- [ ] `rpc_activate_table_session` implemented with all validation rules
- [ ] `rpc_close_table_session` widened for OPEN-cancellation
- [ ] RLS policies on `table_opening_attestation` (Pattern C hybrid, RPC-only writes)
- [ ] Service layer: `OpeningAttestationDTO`, `ActivateTableSessionParams`, mappers
- [ ] Activation drawer UI: predecessor/bootstrap display, variance warning, note rules, dealer checkbox
- [ ] `db:types-local` regenerated
- [ ] Type-check passes
- [ ] Integration tests for AC-1 through AC-23
- [ ] E2E tests for AC-24 through AC-28
- [ ] SRM updated to v4.21.0 (add `table_opening_attestation` to TableContextService)

---

## 7. Dependencies

| Dependency | Status |
|------------|--------|
| ADR-048 (architecture decisions) | Frozen |
| ADR-047 Phase 1–2 / PRD-058 (`derivePitDisplayBadge`, active-only filter) | Implemented |
| PRD-057 (session-gated seating) | Implemented |
| `table_session_status` enum includes `OPEN` | Implemented (never written) |
| `table_inventory_snapshot.session_id`, `total_cents` | Implemented (ADR-027) |
| `gaming_table.par_total_cents` | Implemented (ADR-027) |
| `activated_by_staff_id` on `table_session` | Implemented (PRD-038A, nullable) |

---

## 8. References

- FIB: `docs/issues/gaps/table-inventory-lifecycle/OPEN-CUSTODIAL-CHAIN/FIB-OPEN-CUSTODIAL-CHAIN-PILOT-LITE.md`
- Feature Boundary: `docs/20-architecture/specs/open-custody-lite/FEATURE_BOUNDARY.md`
- Scaffold: `docs/01-scaffolds/SCAFFOLD-OPEN-CUSTODY-LITE.md`
- RFC: `docs/02-design/RFC-OPEN-CUSTODY-LITE.md`
- SEC Note: `docs/20-architecture/specs/open-custody-lite/SEC_NOTE.md`
- ADR-048: `docs/80-adrs/ADR-048-open-table-custody-gate.md`

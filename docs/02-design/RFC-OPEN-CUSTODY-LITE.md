---
id: RFC-OPEN-CUSTODY-LITE
title: "Design Brief: OPEN Table Custody Gate — Pilot Lite"
owner: diepulp
status: Draft
date: 2026-03-26
affects: [TableContextService, table_session, table_opening_attestation, table_inventory_snapshot]
---

# Design Brief / RFC: OPEN Table Custody Gate — Pilot Lite

> Purpose: propose direction and alternatives with tradeoffs before anyone writes a PRD.
> Structure: funnel style (context -> scope -> overview -> details -> cross-cutting -> alternatives).

## 1) Context

- **Problem:** When a pit boss opens a table at shift start, `rpc_open_table_session` creates a session with status `'ACTIVE'` in one click. The real-world custody handoff — reviewing the prior closing slip, counting the tray, verifying the amount matches, attesting the handoff — is skipped entirely. The system has no digital custody chain between shifts, no opening attestation, and no provenance record linking the opening balance to the prior close.

- **Forces/constraints:**
  - The `OPEN` status already exists in `table_session_status` enum but is never written
  - PRD-057 session-gated guards already reject non-ACTIVE sessions for rating slips and seating — OPEN inherits this for free
  - `derivePitDisplayBadge()` (ADR-047) handles OPEN defensively (blue badge), but the pit dashboard pre-filters to active tables (D2) — OPEN tables are not visible on the pit dashboard unless the filter is explicitly widened
  - `table_session` already has `opening_inventory_snapshot_id` (nullable, FK deferred) — never populated today
  - `table_inventory_snapshot` has `session_id`, `total_cents`, `snapshot_type`, `counted_by` — the closing slip artifact exists
  - `gaming_table.par_total_cents` exists for bootstrap baseline (ADR-027)
  - FIB §F establishes a two-act custody model: "Opening attestation is a separate record from the closing snapshot (two acts: handing forward vs accepting)"
  - Pilot-lite scope: total-cents only, visual comparison, no automated variance, no supervisor override
  - `rpc_close_table_session` currently requires status IN ('RUNDOWN', 'ACTIVE') — OPEN is excluded, so orphan-OPEN recovery needs a dedicated path

- **Prior art:** The close session flow (`rpc_close_table_session`) already requires at least one closing artifact. The open flow has no symmetrical requirement. This design adds the opening-side symmetry — but as a separate attestation record, not as a closing-artifact mirror.

## 2) Scope & Goals

- **In scope:**
  - Two-step session activation: `rpc_open_table_session` creates OPEN session → `rpc_activate_table_session` transitions OPEN→ACTIVE with attestation
  - `table_opening_attestation` as a new table — the opening custody record (FIB §F two-act model)
  - Predecessor close snapshot linkage at OPEN time with consumption tracking on `table_inventory_snapshot`
  - Variance detection: visual comparison of predecessor close total vs entered opening total
  - Note-rule enforcement: note required when no predecessor (bootstrap), variance, or `requires_reconciliation`
  - Orphan-OPEN cancellation path (OPEN sessions that are never activated)
  - Activation drawer UI embedded in existing table detail view (not a new route, not on the pit dashboard)

- **Out of scope:**
  - Denomination-level chipset entry
  - Automated variance thresholds / policy decisioning
  - Supervisor override workflow
  - Close snapshot sealing (`is_sealed`)
  - Close-side UX redesign
  - Unified `custody_handoff` table or new bounded context (FIB §H — the opening attestation table within TableContextService is sufficient)
  - Widening the pit dashboard active-only filter to show OPEN tables (separate decision if wanted)

- **Success criteria:** Every ACTIVE session has a linked `table_opening_attestation` record with provenance source (prior close total or par bootstrap). No table reaches ACTIVE without an attestation record.

## 3) Proposed Direction (overview)

Split table activation into two RPCs matching the two distinct operational acts:

1. **`rpc_open_table_session`** (modified) — creates session with status `'OPEN'` instead of `'ACTIVE'`. Looks up the most recent CLOSED session for this table and records predecessor linkage (predecessor session ID, closing snapshot ID, denormalized close total) on the session row for read-path display.

2. **`rpc_activate_table_session`** (new) — accepts the pit boss's attestation payload. Creates a `table_opening_attestation` row as a first-class record, links it to the session via FK, marks the predecessor snapshot as consumed on `table_inventory_snapshot`, and transitions the session from OPEN→ACTIVE.

The attestation is a separate record from both the session row and the closing snapshot — three artifacts, two acts, one custody chain.

The UI presents an "activation drawer" on the table detail view after OPEN — showing predecessor data (prior close total + closing pit boss) or bootstrap data (par target) — where the pit boss fills in attestation fields and confirms.

## 4) Detailed Design

### 4.1 Data model changes

**`table_opening_attestation` — NEW TABLE:**

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid PK | NO | `gen_random_uuid()` | Primary key |
| `casino_id` | uuid FK→casino | NO | — | Casino scoping (RLS) |
| `session_id` | uuid FK→table_session | NO | — | Session this attestation activates |
| `opening_total_cents` | integer | NO | — | Pit boss entered opening tray total |
| `attested_by` | uuid FK→staff | NO | — | Staff who attested (authoritative from ADR-024 `app.actor_id`) |
| `attested_at` | timestamptz | NO | `now()` | When attestation was recorded |
| `dealer_confirmed` | boolean | NO | — | Pit boss confirmed dealer presence (required true) |
| `note` | text | YES | NULL | Free-text (required when bootstrap/variance/reconciliation) |
| `predecessor_snapshot_id` | uuid FK→table_inventory_snapshot | YES | NULL | Closing snapshot from predecessor session (NULL = bootstrap) |
| `predecessor_close_total_cents` | integer | YES | NULL | Denormalized predecessor close total for display |
| `provenance_source` | text | NO | — | `'predecessor'` or `'par_bootstrap'` — explicit lineage type |
| `created_at` | timestamptz | NO | `now()` | Row creation timestamp |

**Invariants:**
- One attestation per session (UNIQUE on `session_id`)
- `dealer_confirmed = true` always (CHECK constraint — FIB §F: "Column is required, not nullable")
- `predecessor_snapshot_id` is NOT NULL when `provenance_source = 'predecessor'`, NULL when `provenance_source = 'par_bootstrap'`
- `note` is NOT NULL when `provenance_source = 'par_bootstrap'` (CHECK constraint — bootstrap always requires note per FIB §F)

**`table_session` — new/modified columns:**

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `predecessor_session_id` | uuid FK→table_session | YES | NULL | Previous session this opening chains from (set at OPEN time) |

Note: No reverse FK (`opening_attestation_id`) on `table_session`. The attestation references the session via `table_opening_attestation.session_id` (UNIQUE). Session finds its attestation via `WHERE session_id = ?`. See ADR-048 D1 FK direction rationale.

Note: `activated_by_staff_id` already exists (PRD-038A Gap C, nullable). Populated on activation.

**`table_inventory_snapshot` — new columns:**

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `consumed_by_session_id` | uuid FK→table_session | YES | NULL | Session that consumed this snapshot as opening predecessor |
| `consumed_at` | timestamptz | YES | NULL | When the snapshot was consumed |

**Consumption invariant:** A snapshot can be consumed at most once. The predecessor row carries exactly one nullable `consumed_by_session_id` column. The activate RPC uses `UPDATE ... WHERE consumed_by_session_id IS NULL` — if the snapshot is already consumed, zero rows are affected, and the RPC raises an exception. No silent chain fork.

### 4.2 Service layer

**TableContextService extensions:**

```typescript
// New DTO — attestation as first-class artifact
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

// Activation params
interface ActivateTableSessionParams {
  tableSessionId: string;
  openingTotalCents: number;
  dealerConfirmed: boolean;
  openingNote?: string | null;
}

// Extended TableSessionDTO (existing, add FK fields)
interface TableSessionDTO {
  // ... existing fields ...
  predecessorSessionId: string | null;
}
```

**Read path — activation drawer data:**
- When a session is OPEN, the UI queries `table_session` to get `predecessor_session_id`
- If predecessor exists: join through predecessor session's `closing_inventory_snapshot_id` → `table_inventory_snapshot` → `total_cents` + `counted_by` → `staff.display_name` for closing pit boss name
- If no predecessor: read `gaming_table.par_total_cents` for bootstrap baseline
- This read path serves the activation drawer, which appears on the **table detail view** — not on the pit dashboard (ADR-047 D2 active-only filter)

### 4.3 API surface

**Modified RPC: `rpc_open_table_session(p_gaming_table_id uuid)`**

Changes from current behavior:
- INSERT status changes from `'ACTIVE'` to `'OPEN'`
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
- If predecessor found: set `predecessor_session_id` on the new session
- Set `opening_inventory_snapshot_id` = predecessor's closing snapshot (existing column, now populated)
- Return the OPEN session row

**New RPC: `rpc_activate_table_session(p_table_session_id uuid, p_opening_total_cents integer, p_dealer_confirmed boolean, p_opening_note text DEFAULT NULL)`**

- SECURITY DEFINER, ADR-024 (`set_rls_context_from_staff()`)
- `SET search_path = pg_catalog, public`
- Role gate: `pit_boss`, `admin`
- Validate session exists, belongs to casino, is in OPEN state (FOR UPDATE lock)
- Validate `p_dealer_confirmed = true` (hard requirement per FIB §F)
- Validate `p_opening_total_cents >= 0`
- Determine provenance source and note requirement:
  - If `predecessor_session_id IS NULL` → `provenance_source = 'par_bootstrap'`, note required
  - Else → `provenance_source = 'predecessor'`
    - Look up predecessor's closing snapshot `total_cents`
    - If `total_cents != p_opening_total_cents` → variance, note required
    - If predecessor session `requires_reconciliation = true` → note required
    - If `total_cents = p_opening_total_cents` AND `requires_reconciliation = false` → note optional
- If note required and `p_opening_note` is NULL or empty → raise exception
- INSERT `table_opening_attestation` row with all fields
- UPDATE `table_session`:
  - `status = 'ACTIVE'`
  - `activated_by_staff_id = v_actor_id` (existing column, now populated)
  - No reverse FK update — attestation references session, not the other way around (ADR-048 D1)
- If predecessor snapshot exists: UPDATE `table_inventory_snapshot` SET `consumed_by_session_id = p_table_session_id`, `consumed_at = now()` WHERE `id = <predecessor_snapshot_id>` AND `consumed_by_session_id IS NULL`
  - If already consumed by a different session → log warning, do not block, do not overwrite (pilot tolerance)
- RETURN updated session row
- REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated

**Orphan-OPEN cancellation path:**

`rpc_close_table_session` currently requires status IN ('RUNDOWN', 'ACTIVE'). OPEN sessions need cancellation — semantically distinct from closing a gameplay session (there is nothing to run down, no closing artifacts to require).

Two options (decision required at ADR phase):
- **Option X:** Widen `rpc_close_table_session` to accept OPEN status — skip closing artifact requirement, skip rundown, skip unresolved items check. Set `close_reason` (e.g., `'other'` with required note, or add `'cancelled'` to `close_reason_type`).
- **Option Y:** Dedicated `rpc_cancel_table_session` — explicit semantics, narrower blast radius, but another RPC to maintain.

Either way: cancelling an OPEN session does NOT create an attestation record, does NOT consume a predecessor snapshot, and does NOT set `requires_reconciliation` (no gameplay occurred).

### 4.4 UI/UX flow

**Activation drawer** (embedded in table detail view, not the pit dashboard):

1. Pit boss navigates to a closed table on the **table detail view** (the pit dashboard pre-filters to active tables per ADR-047 D2 and does not show closed tables) → taps "Open Table" → client calls `rpc_open_table_session`
2. Session created in OPEN state. `derivePitDisplayBadge()` returns blue "Open" badge if rendered on this view.
3. Activation drawer slides open, showing:
   - **Predecessor section** (if predecessor session exists):
     - "Prior closing slip: $X,XXX.XX by [Pit Boss Name]"
     - If `requires_reconciliation = true` on predecessor: warning banner "Prior session flagged for reconciliation"
   - **Bootstrap section** (if no predecessor):
     - "No prior closing slip — bootstrap from par: $X,XXX.XX"
     - Warning banner: "No predecessor custody chain — note required"
   - **Opening total input:** single amount field (total cents)
   - **Variance indicator** (if predecessor exists and amounts differ after entry):
     - Side-by-side: "Prior close: $5,000 | Opening: $4,800 | Variance: -$200"
     - Warning banner: "Variance detected — note required"
   - **Dealer confirmation:** checkbox "I confirm a dealer is present at this table" (must be checked to activate)
   - **Note field:** text area, visually required (asterisk/border) when any warning banner is shown
   - **Activate button:** "Activate Table for Play" (disabled until dealer confirmed + note filled when required)

4. Pit boss fills in fields → taps "Activate" → client calls `rpc_activate_table_session`
5. `table_opening_attestation` row created, session transitions OPEN→ACTIVE → table shows "In Play" (green)

### 4.5 Security considerations

- **RLS impact:** `table_opening_attestation` needs Pattern C hybrid RLS policies (same as all TableContextService tables). SELECT for authenticated users scoped to `casino_id`. INSERT/UPDATE via SECURITY DEFINER RPC only.
- **RBAC requirements:** `rpc_activate_table_session` uses same role gate as `rpc_open_table_session` — `pit_boss` or `admin`. No new roles.
- **Audit trail:**
  - `table_opening_attestation.attested_by` provides identity provenance (Category A per ADR-040 — derived from JWT, not user-supplied)
  - `table_opening_attestation.attested_at` provides temporal provenance
  - `table_opening_attestation.predecessor_snapshot_id` provides custody chain linkage
  - `table_opening_attestation.provenance_source` provides explicit lineage classification
  - `table_inventory_snapshot.consumed_by_session_id` provides consumption traceability
  - The attestation is queryable independently of the session — an auditor can list all attestations, filter by provenance source, etc.
- **ADR-018 compliance:** New RPC is SECURITY DEFINER with `set_rls_context_from_staff()` and `SET search_path = pg_catalog, public`. REVOKE ALL + GRANT EXECUTE to authenticated.

## 5) Cross-Cutting Concerns

- **Performance implications:** Predecessor lookup is a single-row query on `table_session` ordered by `closed_at DESC LIMIT 1`. Index on `(gaming_table_id, casino_id, status)` already exists. Attestation INSERT is a single row. Snapshot consumption UPDATE is a single-row PK update. No performance concern.
- **Migration strategy:** New table (`table_opening_attestation`) + additive nullable columns on `table_session` and `table_inventory_snapshot`. Existing ACTIVE sessions remain valid (no attestation record exists for legacy sessions). No backfill needed.
- **Observability:** `table_opening_attestation.attested_at` and `consumed_at` timestamps provide operational telemetry. Attestation records are independently queryable for audit. No new monitoring surfaces needed for pilot.
- **Rollback plan:** Drop `table_opening_attestation` table + drop new columns on `table_session` and `table_inventory_snapshot` + revert `rpc_open_table_session` to insert ACTIVE directly. No data loss for pre-feature sessions.

## 6) Alternatives Considered

### Alternative A: Single-RPC atomic open-and-activate

- **Description:** Add attestation parameters to `rpc_open_table_session` and keep inserting as ACTIVE in one call.
- **Tradeoffs:** Simpler (one roundtrip), but OPEN state is never persisted, predecessor data can't be loaded from server before attestation, and exit ramp to full FIB is poor (RPC overloading banned per CLAUDE.md migration standard).
- **Why not chosen:** Conflates two distinct operational acts. Poor extensibility for full FIB scope.

### Alternative B: Attestation as columns on `table_session`

- **Description:** Add opening_total_cents, opening_attested_by, opening_dealer_confirmed, etc. directly to `table_session` instead of creating a separate table.
- **Tradeoffs:** No extra join for session reads. Simpler migration. But violates FIB §F two-act model ("Opening attestation is a separate record from the closing snapshot"). Muddies the session row with attestation-specific fields. Makes the attestation non-queryable as a first-class artifact. Auditors would need to query `table_session` and filter for non-null attestation columns rather than querying an attestation table directly.
- **Why not chosen:** FIB §F explicitly requires the attestation to be a separate record. The two-act boundary is the architectural invariant this feature exists to establish. Collapsing it into the session row defeats the purpose.

## 7) Decisions Required

1. **Decision:** Attestation persistence shape — separate table vs session columns
   **Options:** `table_opening_attestation` table | Columns on `table_session`
   **Recommendation:** Separate table — FIB §F mandates separate records for the two acts. **→ ADR-048 D1**

2. **Decision:** Orphan-OPEN cancellation path — widen close RPC vs dedicated cancel RPC
   **Options:** Widen `rpc_close_table_session` to accept OPEN | New `rpc_cancel_table_session`
   **Recommendation:** Defer to ADR phase — both have tradeoffs (blast radius vs RPC proliferation). **→ ADR-048 D2**

3. **Decision:** `close_reason_type` amendment for cancellation
   **Options:** Add `'cancelled'` enum value | Use `'other'` with required note
   **Recommendation:** Add `'cancelled'` — semantically precise, avoids conflating abandonment with miscellaneous closures. **→ ADR-048 D3**

## 8) Open Questions

| Question | Impact | Resolution Path |
|----------|--------|-----------------|
| Should the pit dashboard filter (ADR-047 D2) be widened to show OPEN tables? | Low for pilot | Separate decision. Pit boss sees OPEN state on the table detail view. Dashboard widening is cosmetic for pilot. |
| Should consumption idempotency be a hard block or a warning? | Med | Pilot: warning + log. Full FIB: revisit. If the same close snapshot is consumed by two sessions, something is wrong, but hard-blocking pilot activation over it is disproportionate. |

## Links

- Feature Boundary: `docs/20-architecture/specs/open-custody-lite/FEATURE_BOUNDARY.md`
- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-OPEN-CUSTODY-LITE.md`
- Source FIB: `docs/issues/gaps/table-inventory-lifecycle/OPEN-CUSTODIAL-CHAIN/FIB-OPEN-CUSTODIAL-CHAIN-PILOT-LITE.md`
- ADR(s): ADR-048 (pending Phase 4)
- PRD: (pending Phase 5)
- Exec Spec: (post-pipeline)

## References

- ADR-024: Authoritative context derivation
- ADR-027: Table bank mode schema (par_total_cents, session_id on snapshot)
- ADR-028: Table status standardization (OPEN label/color)
- ADR-040: Identity provenance rule (Category A attestation)
- ADR-047: Operator–admin surface separation (D2: pit dashboard active-only filter)
- PRD-057: Session-gated seating / close lifecycle hardening
- PRD-038A: Table lifecycle audit patch (close guardrails, close_reason_type enum)

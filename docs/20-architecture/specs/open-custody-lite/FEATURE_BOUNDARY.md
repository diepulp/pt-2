# Feature Boundary: OPEN Table Custody Gate — Pilot Lite

> **Ownership Sentence:** This feature belongs to **TableContextService** and may only touch **`table_session`** (state transitions + predecessor linkage), **`table_opening_attestation`** (new table — the opening custody record, references session via `session_id`), and **`table_inventory_snapshot`** (consumption tracking); **`gaming_table`** is read-only for `par_total_cents`. No cross-context writes are required — all artifacts live within the Operational Telemetry bounded context.

---

## Bounded Context

- **Owner service(s):**
  - **TableContextService** — table lifecycle, session state machine (OPEN→ACTIVE→RUNDOWN→CLOSED), chip custody posture, and inventory snapshots

- **Writes:**
  - `table_opening_attestation` (NEW TABLE) — separate record per FIB §F: "Opening attestation is a separate record from the closing snapshot (two acts: handing forward vs accepting)." Contains opening total, attesting staff, dealer confirmation, note, predecessor snapshot linkage. One row per activation. This is NOT a `custody_handoff` table (FIB §H rejection applies to a unified custody lifecycle entity, not to the opening-side attestation record).
  - `table_session` — status transition OPEN→ACTIVE, `predecessor_session_id` for custody chain traversal. No reverse FK to attestation — attestation references session via `session_id` (UNIQUE).
  - `table_inventory_snapshot` — consumption tracking columns: `consumed_by_session_id`, `consumed_at` (close-side artifact contract change per FIB §G scope clarification)

- **Reads:**
  - `table_inventory_snapshot` — prior closing slip (type='close', total_cents, counted_by) for predecessor custody artifact
  - `gaming_table` — `par_total_cents` for bootstrap baseline when no predecessor exists
  - `table_session` — prior session lookup to locate predecessor closing snapshot

- **New RPCs (anticipated):**
  - `rpc_activate_table_session` — transitions OPEN→ACTIVE, creates `table_opening_attestation` row, marks predecessor snapshot consumed; SECURITY DEFINER, ADR-024

- **Modified RPCs (anticipated):**
  - `rpc_open_table_session` — inserts `'OPEN'` instead of `'ACTIVE'`, links predecessor session/snapshot at creation time
  - `rpc_close_table_session` or dedicated cancel path — must accept OPEN status for orphan-OPEN cancellation (currently rejects anything not ACTIVE/RUNDOWN)

- **Cross-context contracts:**
  - None — this feature is entirely within TableContextService's bounded context
  - Downstream consumers (RatingSlipService, VisitService) already treat non-ACTIVE sessions as gameplay-blocked via PRD-057 session-gated guards; OPEN inherits this behavior with no contract changes

---

## Persistence Shape Constraint (FIB §F)

The FIB establishes a two-act custody model:
1. **Closing act** — prior shift pit boss records closing snapshot (`table_inventory_snapshot`, type='close')
2. **Opening act** — incoming pit boss attests the handoff (`table_opening_attestation`)

These are separate records representing separate operational moments by separate actors. The attestation MUST NOT be collapsed into columns on `table_session` — doing so muddies the two-act boundary and makes the attestation non-queryable as a first-class artifact.

---

## SRM References

- **SRM v4.20.0** — TableContextService owns: `gaming_table`, `gaming_table_settings`, `dealer_rotation`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event`, `table_session`, `table_rundown_report`, `shift_checkpoint`
- **ADR-028 D3** — Availability gate: `rpc_open_table_session` requires `gaming_table.status = 'active'`
- **PRD-057** — Session-gated seating: `rpc_start_rating_slip` and `rpc_check_table_seat_availability` reject when no ACTIVE session
- **ADR-047 D2** — Pit dashboard pre-filters to active tables. OPEN tables are NOT visible on the pit dashboard unless the filter is widened. The activation drawer is shown to the opening pit boss on the table detail view, not the dashboard.

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.

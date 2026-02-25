# Feature Boundary Statement: Shift Rundown Persistence & Mid-Shift Deltas

> **Ownership Sentence:** This feature belongs to **TableContextService** and may only touch **`table_rundown_report` (new), `shift_checkpoint` (new), `table_session` (existing — totals denormalization)**; cross-context reads go through **`casino_settings.gaming_day_start_time`** (CasinoService, read-only temporal authority).

---

## Feature Boundary Statement

- **Owner service(s):**
  - **TableContextService** — rundown persistence, checkpoint CRUD, session totals triggers, shift dashboard delta pipeline

- **Writes:**
  - `table_rundown_report` (new — persisted rundown computation at session close)
  - `shift_checkpoint` (new — point-in-time metrics snapshot for delta computation)
  - `table_session` (existing — `fills_total_cents`, `credits_total_cents` denormalization triggers)

- **Reads:**
  - `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event` (via existing RPCs)
  - `gaming_table.par_total_cents` (opening baseline source C)
  - `table_buyin_telemetry` (estimated drop contribution)
  - `casino_settings.gaming_day_start_time` (CasinoService — temporal authority, read-only)

- **Cross-context contracts:**
  - `CasinoService.gaming_day_start_time` — read-only for gaming day boundary derivation
  - `ShiftDashboardSummaryDTO` — extended with delta fields for UI consumption
  - `TableRundownReportDTO` — new published DTO for rundown history queries
  - `ShiftCheckpointDTO` — new published DTO for checkpoint reads

- **Non-goals (top 5):**
  1. **Monetary ledger integration** — `player_financial_transaction` is PlayerFinancialService; rundown uses operational chip custody data only
  2. **Soft count evidence manifest** — no `soft_count_table_result` table; drop_total posting is the workaround for MVP
  3. **Reconciliation exception framework** — no `reconciliation_exception` table or variance tolerance engine in this scope
  4. **RECONCILED / FINALIZED session states** — session lifecycle stays 4-state (OPEN/ACTIVE/RUNDOWN/CLOSED); finalization is post-MVP
  5. **Auto-scheduled checkpoints** — checkpoints are manual (pit boss initiated) in this scope; timer-based auto-checkpoint deferred
  6. **Cross-shift comparison views** — displaying "this shift vs last shift" is deferred; this scope delivers checkpoint-to-checkpoint deltas within a single shift

- **DoD gates:** Functional / Security / Integrity / Operability (see DOD-shift-rundown-deltas)

---

## Goal

Persist table rundown computations at session close for audit accountability, and provide mid-shift delta checkpoints so pit bosses can track "what changed since I last looked" on the shift dashboard.

## Primary Actor

**Pit Boss** (floor supervisor responsible for table accountability and shift handoff)

## Primary Scenario

Pit boss closes a table session; system auto-persists the rundown report with provenance metadata. During the shift, pit boss taps "Checkpoint" to snapshot current metrics, and the dashboard shows deltas since the last checkpoint.

## Success Metric

- 100% of closed sessions have a `table_rundown_report` row within 1 second of `rpc_close_table_session` completion
- Delta badges in the shift dashboard show accurate "+/-$X since last check" values after checkpoint creation

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **FEATURE_BOUNDARY** | Scope definition (this file) | `docs/20-architecture/specs/shift-rundown-deltas/FEATURE_BOUNDARY.md` |
| **FEATURE_BRIEF** | 1-page alignment | `docs/20-architecture/specs/shift-rundown-deltas/FEATURE_BRIEF.md` |
| **PRD** | Product requirements | TBD (Phase 2) |
| **SEC Note** | Security review | TBD (Phase 3) |
| **ADR** | Durable decisions (if needed) | TBD (Phase 4) |
| **EXEC-SPEC** | Implementation details | TBD (Phase 5) |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.

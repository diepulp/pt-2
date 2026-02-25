# Feature Brief: Shift Rundown Persistence & Mid-Shift Deltas

**ID:** shift-rundown-deltas
**Date:** 2026-02-24
**Author:** Lead Architect
**Status:** Proposed

---

## Goal

Persist table rundown computations at session close for audit accountability, and provide mid-shift delta checkpoints so pit bosses can see "what changed since I last looked" on the shift dashboard.

---

## Primary Actor

**Pit Boss** — Floor supervisor responsible for table chip accountability, session close procedures, and shift handoff to the incoming supervisor.

---

## Primary Scenario

When a pit boss closes a table session, the system automatically computes and persists the rundown report (win/loss, fills, credits, drop, opening/closing bankroll, provenance). During the shift, the pit boss taps a "Checkpoint" button to freeze the current dashboard state, and subsequent views show deltas from that checkpoint.

---

## Success Metric

- Every closed `table_session` has exactly one `table_rundown_report` row created within 1s of close
- After creating a checkpoint, the shift dashboard hero card and metrics table display accurate "+/-$X" delta values relative to the checkpoint
- `table_session.fills_total_cents` and `credits_total_cents` are kept in sync with actual fills/credits (< 1s lag)

---

## Bounded Context

| Aspect | Details |
|--------|---------|
| **Owner Service(s)** | TableContextService |
| **Writes** | `table_rundown_report` (new), `shift_checkpoint` (new), `table_session` (totals triggers) |
| **Reads** | `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event`, `table_buyin_telemetry`, `gaming_table.par_total_cents`, `casino_settings.gaming_day_start_time` |
| **Cross-Context Contracts** | `CasinoService.gaming_day_start_time` (read), `ShiftDashboardSummaryDTO` (extended), `TableRundownReportDTO` (new), `ShiftCheckpointDTO` (new) |

---

## Non-Goals (5+ Explicit Exclusions)

1. **Soft count evidence manifest** — No `soft_count_table_result` table; `drop_total_cents` posting via `rpc_post_table_drop_total` is the MVP workaround
2. **Reconciliation exception framework** — No variance tolerance engine, no `reconciliation_exception` table; gap #11 from parent doc
3. **RECONCILED / FINALIZED session lifecycle states** — Session stays at 4 states; finalization gate is post-MVP
4. **Auto-scheduled checkpoints** — No timer-based checkpoint creation; pit boss must manually trigger
5. **Cross-shift comparison** — No "this shift vs last shift" comparison view; only checkpoint-to-checkpoint within a single shift
6. **Legacy RPC ADR-024 migration** — The 4 legacy chip custody RPCs (gap #4) are a separate security scope
7. **Rundown report editing after finalization** — Once `finalized_at` is stamped, the report is immutable

---

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `rpc_compute_table_rundown` (ADR-027) | Required | Implemented (ephemeral) |
| `rpc_close_table_session` (session lifecycle) | Required | Implemented |
| `rpc_shift_table_metrics` (shift dashboard RPC) | Required | Implemented (PRD-036 version) |
| PRD-036 Opening Baseline | Required | Partially implemented |
| `table_session.fills_total_cents` / `credits_total_cents` columns | Required | Schema exists, never updated |
| `formatCents(null)` fix | Recommended | Open (shows $0 for null) |

---

## Risks / Open Questions

| Risk / Question | Impact | Mitigation / Answer Needed |
|-----------------|--------|---------------------------|
| `rpc_compute_table_rundown` has chipset JSON parsing bug (gap #2) | Medium | Must fix before persisting results; wrong JSON format assumed |
| `total_cents` never populated on `table_inventory_snapshot` (gap #1) | Low | Shift RPC uses `chipset_total_cents()` directly; rundown RPC needs fix |
| `session_id` not linked on inventory snapshots (gap #3) | Medium | Rundown persistence needs session-snapshot linkage |
| Checkpoint granularity — per-table vs per-pit vs per-casino | Medium | Start with casino-level only; per-pit is Phase 2 extension |
| Retention policy for `table_rundown_report` and `shift_checkpoint` | Low | Default to no TTL; regulatory may require 5+ years |
| Re-computation after late fill/credit arrival | Medium | Allow UPDATE before `finalized_at`; reject after finalization |

---

## Next Steps

1. [x] Feature Boundary Statement created
2. [x] Feature Brief drafted
3. [ ] PRD drafted (Phase 2)
4. [ ] SEC note reviewed (Phase 3)
5. [ ] ADR created if durable decisions exist (Phase 4)
6. [ ] EXEC-SPEC + DoD generated (Phase 5)

---

**Gate:** If you can't list 5+ non-goals, you're about to overbuild.

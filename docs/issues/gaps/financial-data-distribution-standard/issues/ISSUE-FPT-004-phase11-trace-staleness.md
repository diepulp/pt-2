# ISSUE FPT-004: FINANCIAL-PROVENANCE-TRACE Staleness Post Phase 1.1

**Severity:** MEDIUM — trace is a live reference document cited by rollout governance. Stale findings can cause misalignment between what specs describe as "open gaps" and what has already shipped.
**Discovered:** 2026-04-29 (cross-reference audit against `ROLLOUT-PROGRESS.md` Phase 1.1 exit gate 2026-04-25)
**Status:** INTERIM — filed pending full documentation analysis via GitNexus knowledge graph. Phase 1.1 is confirmed deployed; this issue catalogs the delta only.
**Affects:** `docs/issues/gaps/financial-data-distribution-standard/FINANCIAL-PROVENANCE-TRACE.md` multiple sections

---

## Context

`FINANCIAL-PROVENANCE-TRACE.md` was authored 2026-04-22. Phase 1.1 (Service DTO Envelope) passed its exit gate 2026-04-25. Several trace findings describe conditions that Phase 1.1 was explicitly designed to address. Those findings are now stale.

Phase 1.1 should **not** be reverted to restore trace accuracy. The trace must be amended.

---

## Stale Findings Inventory

### S1 — `totalChipsOut` field references

**Trace state:** References `totalChipsOut` as the canonical field name on visit/session DTOs.
**Current state:** Renamed to `totalCashOut` across all affected DTOs in WS4 (Phase 1.1). Grep of `totalChipsOut` returns zero hits in application code.
**Impact:** Any spec that derives a field name from the trace will reference a non-existent field.

### S2 — `RecentSessionDTO` / `VisitLiveViewDTO` bare float fields

**Trace state:** Describes currency fields on these DTOs as bare `number` (dollars or cents, untagged).
**Current state:** Both DTOs now emit `FinancialValue` envelope objects (PRD-072, Phase 1.1). The envelope carries `{ value, type, source, completeness }` — the "bare float" concern is structurally addressed at the service layer.
**Impact:** Trace still describes the pre-envelope state as an open gap.

### S3 — Shift-intelligence authority routing absent

**Trace state:** Describes the shift metric authority routing as an open gap — no function to determine whether PFT or pit_cash_observation is authoritative for a given surface.
**Current state:** `resolveShiftMetricAuthority` is now live (PRD-073, Phase 1.1, WS7B). Authority routing is explicit.
**Impact:** Trace implies this architectural question is unresolved when it has been answered.

### S4 — `table-buyin-telemetry` service reference

**Trace state:** Mentions `table-buyin-telemetry` as a named service context.
**Current state:** This service does not exist (delta noted in ROLLOUT-PROGRESS.md Phase 1.0 known deltas). Class B (TBT/grind) data lives in `services/table-context/` via `table_session.drop_total_cents`.
**Impact:** Minor naming mismatch but can cause misrouted refactor work.

---

## New Gap Opened by Phase 1.1 (not in trace)

### N1 — API wire still emits bare float (Phase 1.2 not started)

Phase 1.1 wrapped the service DTO layer in `FinancialValue`. However, API route handlers at `app/api/v1/**` that serialize these DTOs to JSON wire format have **not** been updated. The envelope is present inside the service but is stripped or passed through as raw fields at the API boundary.

Phase 1.2 (API Envelope at Wire) is drafted as PRD-071 but EXEC-SPEC is not started. This gap is the **direct successor** to the bare-float findings the trace documented — the problem shifted one layer up.

**This gap is not in the trace at all.** The trace predates Phase 1.1 and therefore predates Phase 1.2's opening.

---

## Required Actions

### Amendment document
- [ ] Create `FINANCIAL-PROVENANCE-TRACE-AMENDMENT-001.md` in the `actions/` directory covering all four stale findings (S1–S4) and the new gap (N1).
- [ ] Add pointer to the amendment in the trace header (one line: `see FINANCIAL-PROVENANCE-TRACE-AMENDMENT-001.md for Phase 1.1 supersessions`).

### Trace inline markers (optional, lower priority)
- [ ] Add `[STALE — see AMENDMENT-001]` inline markers at each stale section to prevent silent misreads.

### Phase 1.2 PRD
- [ ] Confirm PRD-071 explicitly covers N1 (API wire bare float). If not, add gap N1 as a required deliverable before EXEC-SPEC is scaffolded.

---

## Interim Caveat

This issue was built from targeted grep and ROLLOUT-PROGRESS.md review. The full scope of Phase 1.1 changes — and whether any additional trace sections are now stale — has **not been exhaustively verified**. GitNexus-assisted impact analysis (pending re-index) of `types/financial.ts` and `FinancialValue` adoption breadth may surface additional stale findings not captured here.

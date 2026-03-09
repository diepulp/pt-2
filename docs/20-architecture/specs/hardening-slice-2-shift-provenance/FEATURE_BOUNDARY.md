# Feature Boundary Statement: Shift Dashboard Provenance Alignment (Hardening Slice 2)

> **Ownership Sentence:** This feature belongs to **TableContextService** (shift-metrics submodule) and the **Measurement Layer** (cross-cutting governance); it performs **zero writes** — no table mutations, no new RPCs, no schema changes. Cross-context reads are already established via existing BFF Summary Endpoint and shift-metrics service. The deliverables are governance artifacts (provenance matrix rows, surface classification declaration, consistency audit).

---

## Feature Boundary Statement

- **Owner service(s):**
  - **TableContextService** (shift-metrics submodule) — owns the operational metrics, provenance derivation functions, and trust UI components being audited
  - **Measurement Layer** (SRM cross-cutting section) — owns the governance framework being expanded (METRIC_PROVENANCE_MATRIX, Surface Classification Standard)

- **Writes:**
  - None. This is a governance/audit exercise. No table mutations, no new migrations, no new RPCs.

- **Reads (audited, not new):**
  - `gaming_table`, `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event`, `table_session`, `shift_checkpoint` (via existing shift-metrics RPCs)
  - `rating_slip` (via existing cross-context read for telemetry coverage)
  - `pit_cash_observation` (via existing cash-obs service)

- **Cross-context contracts (existing, not new):**
  - `ShiftDashboardSummaryDTO` — BFF summary endpoint response
  - `CashObsSummaryDTO` — Cash observations BFF response
  - `ProvenanceMetadata` — Trust metadata attached to every metric
  - `ShiftTableMetricsDTO`, `ShiftPitMetricsDTO`, `ShiftCasinoMetricsDTO` — metric DTOs

- **Non-goals (top 5):**
  1. No code changes to shift dashboard components, services, or API routes
  2. No new database migrations or schema modifications
  3. No expansion of provenance framework beyond shift dashboard metrics (Slice 3 scope)
  4. No new trust UI components — existing coverage-bar, metric-grade-badge, etc. are sufficient
  5. No changes to BFF Summary Endpoint shape or shift-metrics RPCs

- **DoD gates:** Governance / Audit / Documentation (see EXEC-SPEC when produced)

---

## Goal

Bring the Shift Dashboard V3's existing provenance primitives under the formal governance framework (Metric Provenance Matrix + Surface Classification Standard), proving the framework scales beyond ADR-039's 4 measurement rows to operational dashboard metrics.

## Primary Actor

**System Architect** (governance alignment — no end-user workflow change)

## Primary Scenario

Architect audits shift dashboard metrics against the provenance framework, populates MEAS-005+ rows in the Metric Provenance Matrix, creates the shift dashboard Surface Classification Declaration, and documents any gaps or inconsistencies between code reality and governance expectations.

## Success Metric

METRIC_PROVENANCE_MATRIX expanded with shift dashboard metrics (MEAS-005+), shift dashboard Surface Classification Declaration passes the §5 mandatory declaration checklist, and consistency audit confirms single-derivation-path compliance for all truth-bearing shift metrics.

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **Feature Boundary** | Scope definition (this file) | `docs/20-architecture/specs/hardening-slice-2-shift-provenance/FEATURE_BOUNDARY.md` |
| **EXEC-SPEC** | Implementation details (mutable) | TBD |
| **Surface Classification Declaration** | Shift Dashboard governance declaration | TBD (likely `docs/70-governance/examples/`) |
| **Provenance Matrix Update** | MEAS-005+ rows | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.

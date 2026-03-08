---
id: SCAFFOLD-002
title: "Feature Scaffold: Hardening Slice 1 — ADR-039 Measurement UI"
owner: architect
status: Draft
date: 2026-03-07
---

# Feature Scaffold: Hardening Slice 1 — ADR-039 Measurement UI

**Feature name:** ADR-039 Measurement Reports Dashboard
**Owner / driver:** Architect
**Stakeholders (reviewers):** Pit boss users, compliance team
**Status:** Draft
**Last updated:** 2026-03-07

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss, I want to view theo discrepancy, audit correlation, rating coverage, and loyalty liability metrics on a reports dashboard so I can identify operational gaps, verify financial lineage, and track liability exposure during my shift.
- **Success looks like:** A server-rendered reports dashboard at `/admin/reports` displays 4 measurement widgets with fresh data, casino-scoped via RLS, within 2 seconds (p95).

## 2) Constraints (hard walls)

- **Surface Classification Standard** (Slice 0): Rendering must be RSC Prefetch + Hydration; aggregation must be BFF Summary Endpoint. Declaration with all 4 mandatory fields required.
- **Metric Provenance Matrix** (Slice 0): Each widget maps to a declared MEAS-* row. MEAS-001–003 are Request-time (compute fresh). MEAS-004 is Periodic/daily (serve latest snapshot).
- **Security / tenancy**: All data casino-scoped via RLS. SECURITY INVOKER views (MEAS-002, MEAS-003) apply caller's RLS automatically. MEAS-004 snapshot RPC is SECURITY DEFINER (ADR-018 governed).
- **Zero planned migrations**: All database infrastructure shipped in ADR-039. This slice builds UI + service layer + API only. Migration exception permitted only through formal benchmark-backed escalation (e.g., MEAS-002 index required to meet p95 budget) — not speculative concern.
- **Authorization (dual-layer)**: `pit_boss` and `admin` staff roles only (measurement data is operational, not dealer-facing). Enforced at **both** layers: (1) page-level route guard for navigation access, (2) handler-level API guard for direct endpoint protection. Neither layer is optional — a protected page with an unguarded endpoint is a security hole.
- **Scope ceiling**: Exactly 4 widgets, exactly 4 provenance declarations, no framework expansion.

## 3) Non-goals (what we refuse to do in this iteration)

- New database migrations, views, tables, or RPCs
- Expanding the Provenance Matrix beyond 4 rows
- Real-time streaming / WebSocket delivery
- Retroactive governance of existing surfaces (Slices 2-3)
- Runtime enforcement tooling or governance linters
- Export/download functionality
- Comparative time-series analysis (day-over-day trends)

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - `rating_slip` columns (`computed_theo_cents`, `legacy_theo_cents`) for MEAS-001
  - `measurement_audit_event_correlation_v` view for MEAS-002
  - `measurement_rating_coverage_v` view for MEAS-003
  - `loyalty_liability_snapshot` + `loyalty_valuation_policy` tables for MEAS-004
  - Casino/pit/table filter parameters from user
- **Outputs:**
  - Server-rendered measurement reports page with 4 metric widgets
  - BFF Summary Endpoint returning aggregated metric data (summary totals + constrained grouped breakdowns only — no raw-data dumping, no unbounded widget-specific contract growth)
  - Casino/pit/table drill-down breakdowns (per-widget, only where metric supports the dimension)
- **Canonical contract(s):**
  - `MeasurementSummaryResponse` — BFF endpoint response DTO (summary totals + optional breakdown arrays)
  - Per-widget DTOs: `TheoDiscrepancyDto`, `AuditCorrelationDto`, `RatingCoverageDto`, `LoyaltyLiabilityDto`
  - Each widget DTO declares `supported_dimensions` (e.g., casino-only vs. casino/pit/table) so UI is contract-driven, not assumption-driven

## 5) Options (2 max — rendering and aggregation are decided by Slice 0 standard)

The Surface Classification Standard constrains the primary architectural choices. The remaining decision is **how to structure the BFF Summary Endpoint internally**.

### Option A: Single Aggregated Endpoint

One Route Handler (`/api/v1/measurement/summary`) that queries all 4 metrics in parallel and returns a unified response.

- **Pros:** Single HTTP round-trip, consistent loading state, simpler client code, matches BFF Summary pattern exemplar (Shift Dashboard)
- **Cons / risks:** Slower p95 if one metric is slow (MEAS-002 4-table JOIN); all-or-nothing error handling
- **Cost / complexity:** Medium — one handler, 4 parallel queries, one response shape
- **Security posture impact:** Neutral — all queries run under caller's RLS context
- **Exit ramp:** Can split into per-metric endpoints later without client changes if widgets use independent React Query keys

### Option B: Per-Metric Endpoints with Client Orchestration

Four Route Handlers (`/api/v1/measurement/theo`, `/audit`, `/coverage`, `/liability`), each returning one metric. RSC page fetches all 4 in parallel.

- **Pros:** Independent loading/error states per widget, one slow metric doesn't block others, easier to test individually
- **Cons / risks:** 4 HTTP round-trips per page load, more client orchestration code, arguably violates BFF Summary pattern (which aggregates into one response), more Route Handler boilerplate
- **Cost / complexity:** Medium-high — 4 handlers, 4 DTOs, 4 query key factories, but simpler per-handler logic
- **Security posture impact:** Neutral — same RLS context per request
- **Exit ramp:** Can consolidate into single endpoint later if performance requires

## 6) Decision to make (explicit)

- **Decision:** **Option A (Single Aggregated Endpoint)** — locked as the chosen path.
- **Rationale:** Aligns with the BFF Summary Endpoint pattern selected in the Surface Classification Standard, matches the Shift Dashboard exemplar, minimizes HTTP round-trips. The p95 risk from slow queries is mitigated by parallel execution within the handler.
- **Fallback:** Option B (Per-Metric Endpoints) is a fallback only if benchmark evidence forces deviation. Endpoint splitting requires measured evidence that MEAS-002 or another query breaks the 2s p95 budget — not speculative concern.
- **Decision drivers:** Surface Classification Standard compliance, pattern consistency with proven exemplar, minimal HTTP overhead for an operational dashboard accessed >100 times/day.

## 7) Open questions / unknowns

All resolved at scaffold audit:

- **MEAS-002 query performance** — *Resolved*: Do not pre-emptively split the endpoint. Benchmark each metric query independently and the aggregate endpoint as a whole. Remediate with query shaping and index review first. Migration exception only if measured evidence shows MEAS-002 breaks the p95 budget.
- **MEAS-004 snapshot staleness display** — *Resolved*: Yes, prominently. "As of [date]" visible near the metric value, not buried in tooltip. Mandatory acceptance criterion — MEAS-004 (Periodic/daily) must not be presented as equivalent to MEAS-001–003 (Request-time).
- **Casino/pit/table filtering** — *Resolved*: No forced symmetry. Filtering is metric-specific, declared via `supported_dimensions` in the DTO contract. Unsupported dimensions shown as unavailable/disabled. The endpoint declares per-widget supported dimensions so UI is contract-driven.
- **ADR amendment needed?** — *Resolved*: No new ADR required at scaffold stage. ADR-039 + ADR-041 cover the architectural decisions. A new ADR becomes warranted only if: (1) zero-migration rule is formally broken, (2) endorsed pattern changes to split endpoints, or (3) a broader cross-surface rule is introduced beyond this slice.

## 8) Definition of Done (thin)

- [ ] Decision recorded — Option A locked (single aggregated BFF endpoint)
- [ ] Acceptance criteria agreed (4 widgets, surface classification declaration, provenance compliance)
- [ ] MEAS-004 freshness labeling ("As of [date]") included as mandatory acceptance criterion
- [ ] Per-widget `supported_dimensions` declared in DTO contract
- [ ] Benchmark gate added: measure each widget query + aggregate endpoint against 2s p95 target
- [ ] Dual-layer authorization verified (page guard + handler guard)
- [ ] Implementation plan delegated to build-pipeline via PRD

## Links

- Feature Boundary: `docs/20-architecture/specs/hardening-slice-1-measurement-ui/FEATURE_BOUNDARY.md`
- Slice 0 Standard: `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`
- Provenance Matrix: `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`
- Mock Declaration: `docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md`
- ADR-039: `docs/80-adrs/ADR-039-measurement-layer.md`
- ADR-041: `docs/80-adrs/ADR-041-surface-governance-standard.md`
- Alignment Assessment: `docs/00-vision/PT-ARCH-MAP/pt-initial-slice-alignment-assessment.md`
- Design Brief/RFC: `docs/02-design/RFC-002-measurement-ui.md` (Phase 2)
- PRD: `docs/10-prd/PRD-046-measurement-ui.md` (Phase 5)

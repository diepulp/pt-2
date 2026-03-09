# Surface Classification Declaration: Slice 3 — Pit Dashboard RSC Refactor

**Surface:** Pit Dashboard
**Slice:** Hardening Slice 3
**Date:** 2026-03-09
**Status:** Active
**Standard:** `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` v1.0.0
**PRD:** PRD-048

> This declaration applies the Surface Classification Standard to the pit dashboard surface, refactored from a client shell to RSC prefetch + hydration. This is a hardening refactor of an existing surface — not a new surface build — proving the standard works for both greenfield and retrofit.

---

## Surface Classification

### Rendering Delivery: RSC Prefetch + Hydration

**Rationale:** The pit dashboard is a read-heavy operational surface. It displays table status, aggregate stats (active tables, open slips, checked-in players), and the current gaming day above the fold. Primary interaction is monitoring table state and navigating to rating slips, not data entry.

**Selection criteria met (§4 Q1):**
- Read-heavy: primary interaction is viewing table status and operational stats
- >=2 independent queries: 3 independent prefetch queries (tables, stats, gaming day)
- Visible above the fold: table grid and stats bar render on initial paint without scrolling

**Pre-refactor state:** Client shell with 5-6 sequential round trips on mount. No server-side data seeding. Users saw loading spinners for all primary data.

**Post-refactor state:** Server prefetches 3 primary queries via `Promise.allSettled`, dehydrates to client via `HydrationBoundary`. Client hooks hydrate from server cache — no loading state on first render for primary queries.

**Coverage data note:** MEAS-003 Rating Coverage is client-fetched only (not RSC-prefetched). This is an intentional architectural choice — coverage is secondary information in the analytics panel, not above-the-fold critical path. Including it in the prefetch set would add latency to the primary queries without visual benefit.

### Data Aggregation: Simple Query

**Rationale:** The pit dashboard consumes data from existing RPCs (`rpc_get_dashboard_tables_with_counts`, `rpc_get_dashboard_stats`, `rpc_current_gaming_day`) that each query 1-2 tables within a single bounded context. The RPCs are already optimized (PERF-002, ISSUE-DD2C45CA). No cross-context joins required at the prefetch layer.

**Selection criteria met (§4 Q2):**
- 1-2 tables per query: each RPC operates within its bounded context
- Single bounded context per query: tables RPC from TableContextService, stats RPC aggregates within dashboard scope, gaming day from CasinoService
- No multi-level rollup: flat results, no hierarchy needed

### Rejected Patterns

| Pattern | Axis | Rejection Rationale |
|---------|------|-------------------|
| **Client Shell** | Rendering Delivery | Previous pattern — caused 5-6 sequential round trips and loading spinners for all above-fold content. Violates RSC selection criterion: ">=2 independent queries visible above the fold" (§4 Q1). Refactored away in this slice. |
| **Hybrid** | Rendering Delivery | No heavy client mutation above the fold — dashboard is primarily read-only with filter/panel navigation. RSC Prefetch + client hooks for interactive panels suffices. Hybrid adds orchestration complexity without benefit. |
| **BFF Summary Endpoint** | Data Aggregation | Existing RPCs already optimize each query individually (PERF-002 consolidated 4 HTTP calls into 1 RPC per domain). No cross-context join needed at prefetch layer. A BFF would add an unnecessary aggregation layer over already-optimized RPCs (§4 Q2). |
| **BFF RPC Aggregation** | Data Aggregation | Same rationale as BFF Summary — RPCs are already per-domain optimized. No cross-context aggregation required at the data layer (§4 Q2). |
| **Client-side Fetch** | Data Aggregation | Client-side orchestration was the pre-refactor pattern that caused the round-trip waterfall. Rejected in favor of server prefetch (§4 Q2). |

### Metric Provenance

| Truth ID | Metric | Truth Class | Freshness | Rendering Implication | Source |
|----------|--------|-------------|-----------|----------------------|--------|
| MEAS-003 | Rating Coverage | Derived Operational | Request-time | Client-fetched per gaming day; not RSC-prefetched. Analytics panel displays per-table `rated_ratio`, `untracked_seconds`, `coverage_tier`. | `measurement_rating_coverage_v` (SECURITY INVOKER) |

**Non-governed metrics:** The analytics panel retains 4 placeholder metrics (Win/Loss, Handle, Avg Session, Active Players) explicitly labeled as "Placeholder" in the UI. These are mock data with no provenance declaration — they are not authoritative and are visually distinguished from governed MEAS-003 coverage data.

---

## Validation Assessment

This declaration demonstrates the Surface Classification Standard works for **refactoring existing surfaces**:

1. **Both axes answered:** Rendering Delivery (RSC Prefetch + Hydration) and Data Aggregation (Simple Query) selected with measurable criteria
2. **Rejected patterns documented:** 5 alternatives rejected with specific §4 clause citations
3. **Metric provenance declared:** MEAS-003 cited for the one governed metric surfaced in this slice
4. **Non-governed placeholders disclosed:** Mock metrics explicitly labeled, not falsely declared as governed
5. **Retrofit validated:** Standard is actionable for hardening existing surfaces, not just greenfield builds

---

## References

| Document | Path |
|----------|------|
| Surface Classification Standard | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` |
| Metric Provenance Matrix | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |
| ADR-041 (Surface Governance Standard) | `docs/80-adrs/ADR-041-surface-governance-standard.md` |
| PRD-048 (Pit Dashboard RSC Refactor) | `docs/10-prd/PRD-048-pit-dashboard-rsc-refactor.md` |
| EXEC-048 (Execution Spec) | `docs/21-exec-spec/EXEC-048-pit-dashboard-rsc-refactor.md` |

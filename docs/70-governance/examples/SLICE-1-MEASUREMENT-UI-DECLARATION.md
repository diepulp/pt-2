# Surface Classification Declaration: Slice 1 — ADR-039 Measurement UI

**Surface:** Measurement Reports Dashboard
**Slice:** Hardening Slice 1
**Date:** 2026-03-07
**Status:** Draft (readiness validation artifact for Slice 0)
**Standard:** `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` v1.0.0

> This declaration applies the Surface Classification Standard to the Slice 1 ADR-039 measurement UI surface. It serves as a readiness validation artifact proving the standard is actionable — not as a binding implementation commitment. The actual Slice 1 EXEC-SPEC will contain the final declaration.

---

## Surface Classification

### Rendering Delivery: RSC Prefetch + Hydration

**Rationale:** The measurement reports dashboard is a read-heavy operational surface. It displays 4 independent metric widgets (theo discrepancy, audit correlation, rating coverage, loyalty liability) above the fold. Users primarily view and compare data, not enter it.

**Selection criteria met (§4 Q1):**
- Read-heavy: primary interaction is viewing metric data, not data entry
- ≥2 independent queries: 4 independent metric queries (one per MEAS-* widget)
- Visible above the fold: all 4 metric summaries should render without scrolling

### Data Aggregation: BFF Summary Endpoint

**Rationale:** The measurement dashboard aggregates data from 6+ bounded contexts across multiple metric levels (casino-level summaries, pit-level breakdowns, table-level detail). The multi-level rollup pattern (casino → pit → table) matches the BFF Summary Endpoint selection criteria. Expected access frequency >100 calls/day during shift operations.

**Selection criteria met (§4 Q2):**
- 3+ bounded contexts: RatingSlipService, FinanceService, MTLService, LoyaltyService, TableContextService, Measurement Layer (6 total)
- Multi-level rollup: casino/pit/table hierarchy for rating coverage and theo discrepancy
- >100 calls/day: operational dashboard accessed throughout shift operations

### Rejected Patterns

| Pattern | Axis | Rejection Rationale |
|---------|------|-------------------|
| **Client Shell** | Rendering Delivery | Read-heavy dashboard needs server-seeded paint for fast initial render. Users see 4 metric widgets above the fold — waiting for client-side fetch would degrade perceived performance. Violates RSC selection criterion: "≥2 independent queries visible above the fold" (§4 Q1). |
| **Hybrid** | Rendering Delivery | No heavy client interaction required — dashboard is read-only with filter controls. RSC Prefetch alone suffices. Adding a client mutation layer would be unnecessary complexity. |
| **BFF RPC Aggregation** | Data Aggregation | Multi-level rollup (casino/pit/table) fits Summary Endpoint pattern better than flat cross-context join. BFF RPC is optimized for single-level cross-context reads, not hierarchical rollups (§4 Q2). |
| **Simple Query / View** | Data Aggregation | 6+ bounded contexts violates "1-2 tables, single bounded context" criterion. Would require N+1 client-side fetches to assemble the dashboard (§4 Q2). |
| **Client-side Fetch** | Data Aggregation | Cross-context aggregation required for all 4 metrics. "No cross-context join" criterion is not met. Client-side orchestration of 6+ service calls would be fragile and slow (§4 Q2). |

### Metric Provenance

All metrics sourced from the Metric Provenance Matrix (`docs/70-governance/METRIC_PROVENANCE_MATRIX.md`):

| Truth ID | Metric | Truth Class | Freshness | Rendering Implication | Reconciliation Summary |
|----------|--------|-------------|-----------|----------------------|----------------------|
| MEAS-001 | Theo Discrepancy | Derived Operational | Request-time | Fresh on each dashboard load; no caching required | Materialized theo vs. `theo.ts` recalculation |
| MEAS-002 | Audit Event Correlation | Compliance-Interpreted | Request-time | Fresh on each load; SECURITY INVOKER view applies caller's RLS | Row-count parity across financial chain |
| MEAS-003 | Rating Coverage | Derived Operational | Request-time | Fresh on each load; SECURITY INVOKER view applies caller's RLS | Time accounting identity: `rated + untracked ≈ open` |
| MEAS-004 | Loyalty Liability | Snapshot-Historical | Periodic (daily) | Snapshot date displayed; dashboard shows latest snapshot, not live total | Snapshot `total_points` vs. live `SUM(current_balance)` |

**Freshness constraint for Slice 1:** Three of four metrics are Request-time, meaning the BFF Summary Endpoint must compute them fresh on each request (no response caching). MEAS-004 is Periodic (daily) and can be served from the most recent snapshot without staleness concern within the same day.

**Reconciliation constraint for Slice 1:** Each metric has a declared reconciliation path. The Slice 1 implementation must support verification against these paths — whether as automated tests, admin tooling, or manual audit queries is an implementation decision for the EXEC-SPEC.

---

## Validation Assessment

This declaration demonstrates that the Surface Classification Standard can classify a real surface:

1. **Both axes answered:** Rendering Delivery (RSC Prefetch) and Data Aggregation (BFF Summary) selected with measurable criteria
2. **Rejected patterns documented:** 5 alternatives rejected with specific clause citations from §4
3. **Metric provenance declared:** All 4 MEAS-* rows cited with truth class + freshness from the Provenance Matrix
4. **Provenance constraints actionable:** Freshness categories (Request-time vs. Periodic) directly constrain the BFF endpoint's caching and computation strategy
5. **No-fit clause not triggered:** Proven patterns from the palette fit the surface requirements — no escalation needed

**Conclusion:** The Surface Classification Standard and Metric Provenance Matrix provide sufficient constraint for Slice 1 rendering, freshness, and reconciliation decisions. The standard is actionable.

---

## References

| Document | Path |
|----------|------|
| Surface Classification Standard | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` |
| Metric Provenance Matrix | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |
| ADR-041 (Surface Governance Standard) | `docs/80-adrs/ADR-041-surface-governance-standard.md` |
| ADR-039 (Measurement Layer) | `docs/80-adrs/ADR-039-measurement-layer.md` |

# Surface Classification Declaration: Coverage Widget

**Surface**: Shift Dashboard Coverage Widget
**PRD**: PRD-049 WS1
**Date**: 2026-03-09
**Author**: build-pipeline (automated)

## Classification

| Field | Value | Rationale |
|-------|-------|-----------|
| **Rendering Delivery** | Hybrid | Parent RSC Prefetch; widget is client-fetched within hydrated boundary. Coverage data not critical for first paint (ADR-041 §4 Q1). |
| **Data Aggregation** | Simple Query | Single pre-aggregated view (`measurement_rating_coverage_v`), single bounded context. Client-side weighted average is trivial (ADR-041 §4 Q2). |

## Rejected Patterns

| Pattern | Rejection Rationale |
|---------|---------------------|
| RSC Prefetch | Coverage is supplementary; adding to prefetch increases server render time for non-critical metric. Widget is below the fold in center panel. |
| BFF Summary Endpoint | Single view, no multi-context joins, <50 table sessions typical per casino per gaming day. |

## Metric Provenance

| Truth ID | Metric | Truth Class | Freshness | Reconciliation |
|----------|--------|-------------|-----------|----------------|
| MEAS-003 | Rating Coverage | Derived Operational | Cached (30s) | `staleTime: 30_000`, `refetchOnWindowFocus: true` |

## Implementation

- **Hook**: `hooks/measurement/use-shift-coverage.ts`
- **Component**: `components/shift-dashboard-v3/coverage-widget.tsx`
- **Query**: `queryRatingCoverage()` in `services/measurement/queries.ts`
- **Integration**: Fills `data-slot="utilization-timeline"` in `shift-dashboard-v3.tsx`
- **Data sources**: `casinoId` from `useAuth().casinoId`, `gamingDay` from `useGamingDay()`

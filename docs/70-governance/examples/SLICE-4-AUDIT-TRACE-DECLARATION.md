# Surface Classification Declaration: Audit Trace Section

**Surface**: Rating Slip Modal — Audit Trace Panel
**PRD**: PRD-049 WS2
**Date**: 2026-03-09
**Author**: build-pipeline (automated)

## Classification

| Field | Value | Rationale |
|-------|-------|-----------|
| **Rendering Delivery** | Client Shell | Modal is fully client-rendered; no RSC boundary (ADR-041 §4 Q1). |
| **Data Aggregation** | Simple Query | Single view (`measurement_audit_event_correlation_v`) filtered by `rating_slip_id`, no cross-context joins (ADR-041 §4 Q2). |

## Rejected Patterns

| Pattern | Rejection Rationale |
|---------|---------------------|
| RSC Prefetch | Modal has no RSC context. Rating slip modal is entirely client-rendered with Zustand state management. |
| BFF RPC | Single-slip query, no aggregation needed. `LIMIT 50` keeps payload small. |

## Metric Provenance

| Truth ID | Metric | Truth Class | Freshness | Reconciliation |
|----------|--------|-------------|-----------|----------------|
| MEAS-002 | Audit Event Correlation | Compliance-Interpreted | Request-time | `staleTime: 60_000`, `refetchOnWindowFocus: false`, lazy fetch on expand |

## Isolation Guarantees

- AuditTraceSection has **NO form state** — does not touch Zustand store
- AuditTraceSection has **NO useTransition** — read-only, no mutations
- AuditTraceSection has **NO dirty tracking** interaction
- Collapsible animation CSS-only — no layout shift when collapsed
- Component within scrollable content area — does not affect fixed action buttons

## Implementation

- **Query**: `queryAuditCorrelationForSlip()` in `services/measurement/queries.ts`
- **Hook**: `hooks/measurement/use-audit-event-correlation.ts`
- **Component**: `components/modals/rating-slip/audit-trace-section.tsx`
- **Integration**: Inserted in `rating-slip-modal.tsx` after Loyalty Points panel, before action buttons
- **Condition**: Only renders when `modalData.slip.status === 'closed'`

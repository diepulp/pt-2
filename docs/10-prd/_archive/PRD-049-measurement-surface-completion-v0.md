---
id: PRD-049
title: "Measurement Surface Completion — Shift Dashboard Coverage Widget + Slip Detail Audit Trace"
owner: Lead Architect
status: Draft
affects: [ADR-039, ADR-041, SEC-001, PRD-046, PRD-048]
created: 2026-03-09
last_review: 2026-03-09
phase: "Hardening — Surface Completion"
pattern: A
http_boundary: false
scaffold_ref: null
adr_refs: [ADR-039, ADR-041]
---

# PRD-049 — Measurement Surface Completion

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** Close the two remaining UI surface gaps identified in the Hardening Report (2026-03-09) and prescribed by `PT2_Measurement_Surface_Guidance.md`. The Shift Dashboard needs a compact Coverage widget consuming `measurement_rating_coverage_v` (MEAS-003) in existing expansion slots. The Rating Slip Modal needs a collapsible Audit Trace panel consuming `measurement_audit_event_correlation_v` (MEAS-002) for per-slip lineage drill-down. All backend infrastructure exists — this is purely frontend wiring. No new routes, migrations, or API endpoints required.

**Context:** Four measurement surfaces were prescribed by the Guidance doc. Two are complete: Admin Reports (EXEC-046/Slice 1) and Pit Terminal coverage (PRD-048/Slice 3). This PRD closes the remaining two.

---

## 2. Problem & Goals

### 2.1 Problem

The Shift Dashboard displays provenance metadata (CoverageBar, MetricGradeBadge, ProvenanceTooltip) using shift-metrics context but does NOT consume the dedicated `measurement_rating_coverage_v` view. Supervisors cannot see casino-level `accounted_ratio` or identify which tables have the worst `untracked_ratio` — the exact signals needed for mid-shift intervention. Four `data-slot` expansion divs sit empty.

The Rating Slip Modal provides no investigative lineage. When a supervisor or auditor asks "what happened after this slip closed?", they must manually query across 4 tables. The `measurement_audit_event_correlation_v` view answers this in one query, but no UI consumes it. The Guidance doc explicitly prescribes a Slip Detail Audit Trace panel for this — not a separate console.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Shift supervisors see casino-level coverage health at a glance | Coverage widget rendered in shift dashboard with health indicator (Healthy/Warning/Critical) |
| **G2**: Shift supervisors identify worst-coverage tables without drilling into reports | Ranked table list by `untracked_ratio` visible in coverage widget |
| **G3**: Per-slip financial lineage accessible from rating slip modal | Collapsible "Audit Trace" section shows slip → PFT → MTL → loyalty chain |
| **G4**: Surface Classification Standard compliance for both surfaces | Declarations produced with all 4 mandatory fields per ADR-041 |

### 2.3 Non-Goals

- Visual redesign of Shift Dashboard or Rating Slip Modal
- New database views, tables, or migrations (all backend exists)
- New API routes or BFF endpoints (widget uses direct Supabase query; audit trace uses direct query)
- Shift Dashboard `data-slot="theo-kpi"` or `data-slot="theo-sidebar"` population (Phase 5, blocked on legacy theo data)
- Audit log append-only enforcement (ADR-039 Approval Condition 1 — separate scope)
- Enriched audit trace variant with `audit_log` JOIN (ships when append-only enforcement lands)
- Historical trend charts on operational surfaces (Guidance §1 explicitly forbids this)
- Wedge C baseline service or alert persistence (separate PRDs)

---

## 3. Users & Use Cases

### Primary Users

**Shift Supervisor / Pit Boss** (`pit_boss` role)
- J1: Glance at shift dashboard to assess whether rating coverage is healthy or degrading across the floor
- J2: Identify which tables have the worst untracked time to dispatch floor staff
- J3: Investigate a specific rating slip's downstream financial impact (slip → transaction → MTL → loyalty)

**Admin** (`admin` role)
- J4: Audit a specific slip's financial lineage for compliance or dispute investigation

### Secondary Users

**Auditor** (via admin access)
- J5: Trace regulatory event chain for a specific slip without querying the database directly

---

## 4. Scope & Feature List

### WS1: Shift Dashboard — Coverage Widget

- [ ] New `CoverageWidget` component fills `data-slot="utilization-timeline"` in shift dashboard center panel (line ~222)
- [ ] Displays casino-level aggregate `accounted_ratio` as a prominent percentage with health indicator
- [ ] Health tiers: `≥ 0.75` = Healthy (green), `≥ 0.50` = Warning (amber), `< 0.50` = Critical (red)
- [ ] Lists up to 5 tables ranked by worst `untracked_ratio` (highest untracked time first)
- [ ] Each table row shows: table name, `rated_ratio`, `untracked_seconds` (formatted as duration)
- [ ] Skeleton loading state during data fetch
- [ ] Empty state when no table sessions exist for current shift window
- [ ] New `useShiftCoverage` hook querying `measurement_rating_coverage_v` with casino_id + gaming_day filter
- [ ] React Query integration: 30s staleTime, refetchOnWindowFocus
- [ ] Coverage widget visually consistent with existing shift dashboard trust-layer aesthetic (mono font, uppercase labels, accent borders)

### WS2: Slip Detail — Audit Trace Panel

- [ ] New collapsible `AuditTraceSection` inserted in rating slip modal after Loyalty Points panel (after line ~762), before action buttons
- [ ] Collapsed by default — expands on click to show lineage chain
- [ ] Displays vertical event chain: Slip Closed → Financial Transaction(s) → MTL Entry/Entries → Loyalty Ledger Entry/Entries
- [ ] Each chain link shows: event type, timestamp, actor (if available), key identifiers (slip_id, transaction_id, mtl_entry_id, ledger_id)
- [ ] Graceful degradation: shows available chain links; placeholder for audit_log entries with note "Audit trail enrichment pending"
- [ ] Empty state when slip has no downstream financial events (e.g., slip still open)
- [ ] Only renders for closed slips (status = `closed`)
- [ ] New `useAuditEventCorrelation(slipId)` hook querying `measurement_audit_event_correlation_v`
- [ ] Read-only presentation — no mutations, no form state interaction
- [ ] Does not interfere with existing modal form state, dirty tracking, or `useTransition` patterns

---

## 5. Requirements

### 5.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Coverage widget displays aggregate `accounted_ratio` for casino-level shift scope | Must |
| FR-2 | Coverage widget ranks tables by `untracked_ratio` descending (worst first) | Must |
| FR-3 | Coverage widget uses health tier thresholds for visual indicator | Must |
| FR-4 | Audit trace section is collapsible and collapsed by default | Must |
| FR-5 | Audit trace shows slip → PFT → MTL → loyalty chain with timestamps | Must |
| FR-6 | Audit trace gracefully handles missing chain links (partial chain) | Must |
| FR-7 | Audit trace only renders for closed slips | Must |
| FR-8 | Coverage widget shows "no data" empty state when shift has no table sessions | Should |
| FR-9 | Table ranking in coverage widget is limited to 5 worst tables | Should |

### 5.2 Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | Coverage widget query completes in < 500ms for typical casino (≤ 50 tables) | Must |
| NFR-2 | Audit trace query completes in < 300ms for a single slip | Must |
| NFR-3 | Neither component introduces layout shift in its parent surface | Must |
| NFR-4 | Both components use skeleton loading (no spinners) per existing convention | Must |
| NFR-5 | Both queries include `.eq('casino_id', casinoId)` as defense-in-depth with RLS | Must |

---

## 6. UX / Flow Overview

### Coverage Widget Flow

1. Supervisor navigates to shift dashboard → page loads with server-prefetched data
2. Coverage widget appears in center panel `data-slot="utilization-timeline"` area
3. Widget shows casino-level `accounted_ratio` (e.g., "87.3%") with green Healthy badge
4. Below the ratio: ranked list of worst-coverage tables (e.g., "BJ-04: 45.2% rated, 2h 15m untracked")
5. Widget refreshes every 30s via React Query staleTime
6. If coverage drops below 50%, badge turns red "Critical" — supervisor dispatches floor staff

### Audit Trace Flow

1. Supervisor opens rating slip modal for a closed slip
2. Below Loyalty Points panel, a collapsed "Audit Trace" header appears with a chevron
3. Supervisor clicks to expand → skeleton loading → lineage chain renders
4. Chain shows: "Slip Closed (14:32:05) → Financial Txn #F-1234 (14:32:06) → MTL Entry #M-5678 (14:32:06) → Loyalty +125 pts (14:32:07)"
5. If audit_log enrichment is not yet available, a muted note appears: "Audit trail enrichment pending"
6. Section collapses on click; data is cached for re-expansion

---

## 7. Dependencies & Risks

### Prerequisites (all met)

| Dependency | Status |
|------------|--------|
| `measurement_rating_coverage_v` view deployed | **DONE** (EXEC-045, migration `20260307115131`) |
| `measurement_audit_event_correlation_v` view deployed | **DONE** (EXEC-045, migration `20260307115131`) |
| Shift Dashboard expansion slots (`data-slot` divs) | **DONE** (4 slots available) |
| Rating Slip Modal structure with scrollable content | **DONE** (853 lines, insertion point at line ~762) |
| `queryRatingCoverage` service function | **DONE** (PRD-048 extended `services/measurement/queries.ts`) |
| Admin role guard for shift dashboard | **N/A** (shift dashboard is `(protected)` route, all authenticated staff) |

### Risks

| Risk | Probability | Mitigation |
|------|------------|------------|
| Coverage widget query slow on large casinos | LOW | View has index on `casino_id`; 30s cache prevents repeated hits |
| Audit trace fan-out (N PFTs × M MTLs × K ledger) produces large result for complex slips | LOW | Typical slip has 1 PFT, 1 MTL, 1-2 ledger entries; add LIMIT 50 as safety |
| Modal scroll length increase from audit trace section | LOW | Collapsed by default; only visible when explicitly expanded |
| Audit trace data inconsistency during slip close race | LOW | View is read-only; eventual consistency acceptable for investigative tooling |

### Open Questions

1. Should the coverage widget also populate `data-slot="trending-charts"` with a mini coverage-over-time sparkline, or is that Phase 3 scope? **Recommendation:** Defer to separate scope per Guidance §1 ("Do NOT place historical trend charts here").

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Coverage widget renders in shift dashboard center panel with casino-level `accounted_ratio`
- [ ] Coverage widget shows ranked worst-coverage tables (up to 5)
- [ ] Coverage widget shows health tier badge (Healthy/Warning/Critical)
- [ ] Audit trace section renders as collapsed section in rating slip modal for closed slips
- [ ] Audit trace shows slip → PFT → MTL → loyalty chain with timestamps
- [ ] Audit trace handles partial chains gracefully (missing links shown as placeholder)

**Data & Integrity**
- [ ] Both components query with `.eq('casino_id', casinoId)` defense-in-depth
- [ ] Coverage widget aggregates correctly across multiple table sessions
- [ ] Audit trace correctly correlates across 4 bounded contexts

**Security & Access**
- [ ] No new RLS policies required (views use `security_invoker=true`)
- [ ] No new SECURITY DEFINER functions required
- [ ] Coverage widget accessible to all authenticated staff (shift dashboard is `(protected)`)
- [ ] Audit trace accessible to all users who can open rating slip modal

**Testing**
- [ ] Unit tests for `useShiftCoverage` hook (loading, success, empty, error states)
- [ ] Unit tests for `useAuditEventCorrelation` hook (loading, success, partial chain, empty states)
- [ ] Component test for `CoverageWidget` rendering with mock data
- [ ] Component test for `AuditTraceSection` rendering with mock chain data

**Operational Readiness**
- [ ] Skeleton loading states for both components (no spinners)
- [ ] Empty states for no-data scenarios
- [ ] React Query error boundary handling (widget shows error state, doesn't crash parent)

**Documentation**
- [ ] Surface Classification Declarations updated for both surfaces
- [ ] Hardening Report updated to reflect gap closure
- [ ] HARDENING-SLICE-MANIFEST.md updated if this ships as a numbered slice

**Surface Governance**
- [ ] Coverage widget: Rendering Delivery = Hybrid (parent is RSC Prefetch, widget is client-fetched)
- [ ] Coverage widget: Data Aggregation = Simple Query (direct Supabase via `queryRatingCoverage`)
- [ ] Audit trace: Rendering Delivery = Client Shell (modal is fully client-side)
- [ ] Audit trace: Data Aggregation = Simple Query (direct Supabase query on view)
- [ ] Both surfaces cite MEAS-IDs from Metric Provenance Matrix (MEAS-003, MEAS-002)

---

## 9. Related Documents

| Category | Document | Relevance |
|----------|----------|-----------|
| **V&S** | `docs/00-vision/strategic-hardening/PT2_Measurement_Surface_Guidance.md` | Operative guidance for surface placement — §1 (coverage widget), §2 (audit trace) |
| **V&S** | `docs/00-vision/strategic-hardening/HARDENING_REPORT_2026-03-09.md` | Gap analysis identifying these two remaining surfaces |
| **V&S** | `docs/00-vision/strategic-hardening/MEASUREMENT_SURFACE_ALLOCATION_SUITABILITY.md` | Infrastructure audit (§3.1 shift slots, §3.4 modal structure) |
| **GOV** | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` | 4 mandatory declaration fields (ADR-041) |
| **GOV** | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` | MEAS-002 (Audit Event Correlation), MEAS-003 (Rating Coverage) |
| **GOV** | `docs/70-governance/examples/SLICE-2-SHIFT-DASHBOARD-DECLARATION.md` | Template for shift dashboard surface declaration |
| **ARCH** | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Measurement Layer bounded context ownership |
| **PRD** | `docs/10-prd/PRD-048-pit-dashboard-rsc-refactor.md` | Closed Pit Terminal gap; shares `queryRatingCoverage` |
| **PRD** | `docs/21-exec-spec/EXEC-046-measurement-ui.md` | Closed Admin Reports gap; established measurement service layer |
| **SEC** | `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS policies for measurement views |

---

## Appendix A: Workstream Summary

| WS | Name | Effort | Dependencies |
|----|------|--------|-------------|
| WS1 | Shift Dashboard Coverage Widget | Small (1 component, 1 hook, slot-fill) | None — all backend ready |
| WS2 | Slip Detail Audit Trace Panel | Medium (1 component, 1 hook, modal insertion) | None — all backend ready |

**Total estimated effort:** Small-to-medium. Both workstreams are independently shippable.

## Appendix B: Surface Classification Pre-Declaration

### WS1: Coverage Widget (Shift Dashboard)

| Field | Value | Rationale |
|-------|-------|-----------|
| **Rendering Delivery** | Hybrid | Parent shift dashboard uses RSC Prefetch + HydrationBoundary; coverage widget is client-fetched within hydrated boundary (separate query, 30s stale) |
| **Data Aggregation** | Simple Query | Direct Supabase query on `measurement_rating_coverage_v` via `queryRatingCoverage`. No BFF endpoint needed — view is pre-aggregated per table session. |
| **Rejected: BFF Summary Endpoint** | Widget consumes a single view with simple aggregation; BFF overhead unjustified per §4 Q2 ("If your aggregation needs are simple, prefer Simple Query") |
| **Rejected: RSC Prefetch** | Coverage data is secondary to the core shift metrics prefetched server-side; adding it to the prefetch set increases server render time for a supplementary widget per §4 Q1 ("If the data is not critical for first paint, prefer Client Shell or Hybrid") |
| **Metric Provenance** | MEAS-003 (Rating Coverage): Derived Operational truth class, Cached (30s) freshness |

### WS2: Audit Trace (Slip Detail)

| Field | Value | Rationale |
|-------|-------|-----------|
| **Rendering Delivery** | Client Shell | Rating slip modal is fully client-rendered; no RSC boundary available. Audit trace is lazily fetched on section expand. |
| **Data Aggregation** | Simple Query | Direct Supabase query on `measurement_audit_event_correlation_v` filtered by `rating_slip_id`. Single-slip scope, no aggregation needed. |
| **Rejected: BFF RPC** | Single-slip query with no cross-context aggregation beyond the view itself; RPC wrapper adds complexity without value per §4 Q2 |
| **Rejected: RSC Prefetch** | Modal is client-side; no RSC rendering context exists per §4 Q1 ("If the parent component is client-rendered, Client Shell is the only viable option") |
| **Metric Provenance** | MEAS-002 (Audit Event Correlation): Compliance-Interpreted truth class, Request-time freshness |

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-03-09 | Lead Architect | Initial draft |

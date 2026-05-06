---
id: PRD-046
title: "Hardening Slice 1 — ADR-039 Measurement UI"
owner: Lead Architect
status: Draft
affects: [RFC-002, SCAFFOLD-002, ADR-039, ADR-041, SEC-NOTE-SLICE-1]
created: 2026-03-08
last_review: 2026-03-08
phase: "Hardening Slice 1"
pattern: A
http_boundary: true
scaffold_ref: docs/01-scaffolds/SCAFFOLD-002-hardening-slice-1-measurement-ui.md
adr_refs: [ADR-039, ADR-041]
---

# PRD-046 — ADR-039 Measurement UI

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** Build a read-only measurement reports dashboard at `/admin/reports` that surfaces 4 ADR-039 metrics (theo discrepancy, audit correlation, rating coverage, loyalty liability) to pit bosses and admins. Follows the Shift Dashboard exemplar: RSC Prefetch + BFF Summary Endpoint. All database infrastructure is shipped — this PRD covers service layer, API, UI, and authorization only. Zero migrations.
- **Source-of-truth relationship:** RFC-002 remains the locked design baseline for architectural patterns, contracts, and constraints. This PRD translates that baseline into workstreams, acceptance criteria, sequencing, and validation. Any deviation from RFC-002 must be recorded as a delta in this PRD's version history, not silently introduced in implementation.

---

## 2. Problem & Goals

### 2.1 Problem

ADR-039 shipped measurement views and tables but no user-facing surface. Pit bosses have no way to view theo discrepancies, audit correlation gaps, rating coverage ratios, or loyalty liability exposure. The measurement infrastructure sits unused, and the Slice 0 governance standards (Surface Classification, Provenance Matrix) remain unvalidated against a real surface.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Pit bosses can view all 4 measurement metrics | Dashboard renders 4 widgets with data at `/admin/reports` |
| **G2**: Dashboard meets p95 performance target | Full page load < 2 seconds (p95) under casino-scoped RLS |
| **G3**: MEAS-004 freshness is transparent | "As of [date]" label visible near loyalty liability value |
| **G4**: Slice 0 governance standards are validated | Surface classification declaration + provenance compliance pass review |

### 2.3 Non-Goals

- New database migrations, views, tables, or RPCs
- Expanding Provenance Matrix beyond 4 rows
- Real-time streaming / WebSocket delivery
- Export/download functionality
- Day-over-day trend analysis
- Retroactive governance of existing surfaces (Slices 2-3)

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Admin (staff roles: `pit_boss`, `admin`)
- **Future stakeholders:** Floor Supervisor access may be considered in a future slice if a canonical role definition and business justification are established. Floor Supervisor is not an authorized user in Slice 1.

**Top Jobs:**

- As a **pit boss**, I need to view theo discrepancy rates across my tables so I can identify slips where computed and legacy theo diverge.
- As a **pit boss**, I need to see audit event correlation so I can verify the full financial chain (slip → PFT → MTL → loyalty) is intact.
- As a **pit boss**, I need to check rating coverage ratios so I can find tables with untracked player time.
- As an **admin**, I need to view loyalty liability exposure so I can understand outstanding point balances and dollar value for my casino.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Service Layer:**
- MeasurementService (cross-cutting aggregator, no table ownership)
- 4 per-metric query functions
- Row → DTO mappers
- Partial-success aggregation via `Promise.allSettled`

**API:**
- BFF Summary Endpoint at `GET /api/v1/measurement/summary`
- Handler-level role guard (pit_boss, admin)
- Query param validation (optional `pit_id`, `table_id`)

**UI:**
- RSC page at `/admin/reports` with server-side prefetch
- 4 metric widgets with summary totals
- Per-widget breakdowns (where `supported_dimensions` allows)
- Freshness badges (Live vs. "As of [date]")
- Filter bar (casino read-only, pit/table dropdowns)
- Page-level role guard

**React Query:**
- Key factory with `.scope` pattern
- HTTP fetcher
- `useMeasurementSummary` hook

### 4.2 Out of Scope

- Widget drill-down to individual records
- Configurable refresh intervals
- Comparison views (previous shift, previous day)
- Notification/alerting on threshold breaches

---

## 5. Requirements

### 5.1 Functional Requirements

- FR-1: Dashboard displays 4 widgets: Theo Discrepancy, Audit Correlation, Rating Coverage, Loyalty Liability
- FR-2: Each widget shows summary totals appropriate to its metric
- FR-3: MEAS-001 and MEAS-003 support pit and table drill-down breakdowns
- FR-4: MEAS-002 and MEAS-004 display casino-level only (no pit/table breakdown)
- FR-5: MEAS-004 displays "As of [date]" prominently near the metric value
- FR-6: Filter bar allows optional pit and table selection; unsupported widgets show "Casino-level only"
- FR-7: If one metric query fails, other widgets render normally (partial success)
- FR-8: Only `pit_boss` and `admin` roles can access the page and endpoint
- FR-9: `table_id` without `pit_id` — allowed if table identity is globally unique within casino scope; handler derives pit context internally if needed
- FR-10: `pit_id` + `table_id` mismatch (table does not belong to pit) — reject with `400 Bad Request`
- FR-11: `pit_id` or `table_id` outside current casino scope — reject with `400 Bad Request`
- FR-12: Filters supplied for metrics that do not support those dimensions — ignored at widget computation level; `supported_dimensions` in DTO makes behavior explicit to UI

### 5.2 Non-Functional Requirements

- NFR-1: Page load < 2 seconds (p95) under casino-scoped RLS
- NFR-2: Zero cross-tenant data leakage (casino scope via RLS, never user-provided)
- NFR-3: Zero new database migrations
- NFR-4: Follows Surface Classification Standard (RSC Prefetch + BFF Summary)
- NFR-5: Each widget maps to declared MEAS-* row in Provenance Matrix

> Architecture: See RFC-002, Surface Classification Standard, Metric Provenance Matrix

---

## 6. UX / Flow Overview

**Flow 1: View Measurement Dashboard**
1. Pit boss navigates to `/admin/reports` (protected route)
2. Page guard validates `pit_boss` or `admin` role; unauthorized roles redirected
3. RSC server component prefetches BFF endpoint (single HTTP call)
4. Page renders with 4 widgets showing casino-level summaries
5. MEAS-004 widget shows amber "As of [date]" badge; MEAS-001–003 show green "Live" badge

**Flow 2: Drill Down by Pit/Table**
1. User selects a pit from the filter dropdown
2. React Query refetches with `pit_id` parameter
3. MEAS-001 and MEAS-003 update with pit-level breakdowns
4. MEAS-002 and MEAS-004 remain unchanged, showing "Casino-level only" indicator

**Flow 3: Partial Failure**
1. BFF endpoint executes 4 queries in parallel
2. MEAS-002 query times out
3. Response returns `audit_correlation: null` with error in `errors` map
4. Three widgets render normally; MEAS-002 widget shows "Metric unavailable — Retry"

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **ADR-039 infrastructure** — All measurement views, tables, and RPCs must exist (shipped in EXEC-045)
- **Existing middleware** — `withServerAction`, `createRequestContext`, `successResponse`/`errorResponse` (all exist)
- **Existing auth** — `set_rls_context_from_staff()` (ADR-024), `(protected)` layout group (exists)

### 7.2 Risks & Open Questions

- **MEAS-002 query performance** — 4-table JOIN view may exceed p95 budget. Mitigation: benchmark independently; query shaping → index review → migration exception (last resort with evidence).

All design questions are resolved. Known implementation risks remain, chiefly MEAS-002 query performance against the 2s p95 budget, and are addressed through benchmark validation and escalation policy (see WS6).

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] All 4 metric widgets render with data from casino-scoped queries
- [ ] MEAS-001 and MEAS-003 show pit/table breakdowns when filtered
- [ ] MEAS-002 and MEAS-004 show casino-level only, regardless of filter
- [ ] MEAS-004 displays "As of [date]" prominently
- [ ] Partial success: one metric failure does not block other widgets

**Data & Integrity**
- [ ] Each widget returns data consistent with its Provenance Matrix formula
- [ ] No cross-tenant data leakage under any filter combination

**Security & Access**
- [ ] Page guard: dealer/cashier roles redirected from `/admin/reports`
- [ ] Handler guard: dealer/cashier roles receive 403 from `/api/v1/measurement/summary`
- [ ] Both guards enforced — removing one does not expose data via the other

**Testing**
- [ ] Unit tests for each query function in `services/measurement/`
- [ ] Unit tests for mappers (row → DTO transformations)
- [ ] Route Handler test: auth (401), forbidden role (403), success (200), partial failure
- [ ] E2E test: pit boss navigates to dashboard, sees 4 widgets

**Performance**
- [ ] Each metric query benchmarked independently
- [ ] Aggregate endpoint benchmarked against 2s p95 target
- [ ] MEAS-002 query plan reviewed (`EXPLAIN ANALYZE`)

**Governance & Provenance**
- [ ] Surface declaration for `/admin/reports` committed
- [ ] Provenance declaration for all 4 widgets committed
- [ ] Freshness classification for each metric declared
- [ ] `supported_dimensions` declaration per metric committed
- [ ] Benchmark evidence for aggregate page and MEAS-002 risk point recorded

**Operational Readiness**
- [ ] Correlation ID flows from request to all 4 queries
- [ ] Failed metrics surface in `errors` map with structured `WidgetError` codes
- [ ] Rollback path: revert PR (no migrations to unwind)

---

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/PT-ARCH-MAP/HARDENING-SLICE-MANIFEST.md`
- **Feature Boundary:** `docs/20-architecture/specs/hardening-slice-1-measurement-ui/FEATURE_BOUNDARY.md`
- **Scaffold:** `docs/01-scaffolds/SCAFFOLD-002-hardening-slice-1-measurement-ui.md`
- **RFC:** `docs/02-design/RFC-002-measurement-ui.md`
- **SEC Note:** `docs/20-architecture/specs/hardening-slice-1-measurement-ui/SEC_NOTE.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` §Measurement Layer
- **Surface Classification:** `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`
- **Provenance Matrix:** `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`
- **Surface Declaration:** `docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md`
- **ADR-039:** `docs/80-adrs/ADR-039-measurement-layer.md`
- **ADR-041:** `docs/80-adrs/ADR-041-surface-governance-standard.md`
- **Schema / Types:** `types/database.types.ts`
- **Shift Dashboard BFF (exemplar):** `app/api/v1/shift-dashboards/summary/route.ts`
- **Shift Dashboard RSC (exemplar):** `app/(protected)/shift-dashboard/page.tsx`

---

## Appendix A: DTO Specifications

### A.1 Top-Level Response

```typescript
type MeasurementWidgetId =
  | 'theo_discrepancy'
  | 'audit_correlation'
  | 'rating_coverage'
  | 'loyalty_liability';

type FilterDimension = 'casino' | 'pit' | 'table';

type WidgetErrorCode =
  | 'unauthorized'
  | 'invalid_filter'
  | 'query_failed'
  | 'timeout'
  | 'snapshot_unavailable'
  | 'unknown';

type WidgetError = {
  code: WidgetErrorCode;
  message?: string;
};

// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- Pattern A: BFF aggregate response
interface MeasurementSummaryResponse {
  theo_discrepancy: TheoDiscrepancyDto | null;
  audit_correlation: AuditCorrelationDto | null;
  rating_coverage: RatingCoverageDto | null;
  loyalty_liability: LoyaltyLiabilityDto | null;
  errors?: Partial<Record<MeasurementWidgetId, WidgetError>>;
  meta: {
    request_id: string;
    timestamp: string;
    casino_id: string;
  };
}
```

### A.2 MEAS-001: Theo Discrepancy

```typescript
interface TheoDiscrepancyDto {
  supported_dimensions: FilterDimension[]; // ['casino', 'pit', 'table']
  freshness: 'request-time';
  summary: {
    total_slips: number;
    discrepant_slips: number;
    discrepancy_rate: number;        // 0.0–1.0
    total_discrepancy_cents: number; // ABS sum
    avg_discrepancy_pct: number;     // 0.0–1.0
  };
  breakdown: TheoDiscrepancyBreakdownRow[] | null;
}

interface TheoDiscrepancyBreakdownRow {
  group_id: string;    // pit_id or table_id
  group_name: string;
  group_type: FilterDimension;
  slip_count: number;
  discrepant_count: number;
  discrepancy_rate: number;
  total_discrepancy_cents: number;
}
```

**Source:** `rating_slip.computed_theo_cents`, `rating_slip.legacy_theo_cents`
**Formula:** `ABS(computed_theo_cents - legacy_theo_cents) / NULLIF(legacy_theo_cents, 0)`
**Filter:** WHERE `legacy_theo_cents IS NOT NULL` (only slips with both values)

### A.3 MEAS-002: Audit Event Correlation

```typescript
interface AuditCorrelationDto {
  supported_dimensions: FilterDimension[]; // ['casino']
  freshness: 'request-time';
  summary: {
    total_slips: number;
    slips_with_pft: number;
    slips_with_mtl: number;
    slips_with_loyalty: number;
    full_chain_count: number;  // all 4 stages present
    full_chain_rate: number;   // 0.0–1.0
  };
  breakdown: null; // Casino-level only
}
```

**Source:** `measurement_audit_event_correlation_v` (SECURITY INVOKER)
**Formula:** 4-table JOIN: rating_slip → PFT → MTL → loyalty_ledger
**Note:** No pit/table breakdown — JOIN is already expensive at casino level

### A.4 MEAS-003: Rating Coverage

```typescript
interface RatingCoverageDto {
  supported_dimensions: FilterDimension[]; // ['casino', 'pit', 'table']
  freshness: 'request-time';
  summary: {
    total_sessions: number;
    avg_coverage_ratio: number;      // 0.0–1.0
    total_rated_seconds: number;
    total_open_seconds: number;
    total_untracked_seconds: number;
  };
  breakdown: RatingCoverageBreakdownRow[] | null;
}

interface RatingCoverageBreakdownRow {
  group_id: string;
  group_name: string;
  group_type: FilterDimension;
  session_count: number;
  avg_coverage_ratio: number;
  rated_seconds: number;
  open_seconds: number;
}
```

**Source:** `measurement_rating_coverage_v` (SECURITY INVOKER)
**Formula:** `rated_seconds / open_seconds`; aggregate as `AVG(rated_ratio)`
**Reconciliation:** `rated_seconds + untracked_seconds ≈ open_seconds`

### A.5 MEAS-004: Loyalty Liability

```typescript
interface LoyaltyLiabilityDto {
  supported_dimensions: FilterDimension[]; // ['casino']
  freshness: 'periodic';
  snapshot_date: string; // ISO date (YYYY-MM-DD) — MANDATORY
  summary: {
    total_points: number;
    dollar_value_cents: number;    // total_points × valuation rate
    valuation_rate_cents: number;  // cents per point from policy
    active_players: number;
  };
  breakdown: null; // Casino-level only
}
```

**Source:** `loyalty_liability_snapshot` + `loyalty_valuation_policy`
**Formula:** `SUM(current_balance)` × versioned valuation policy rate
**Read-only:** Endpoint reads latest snapshot row. Does NOT invoke `rpc_snapshot_loyalty_liability`.

---

## Appendix B: Implementation Plan

### WS1: Service Layer (P0)

**Output:** `services/measurement/`

```
services/measurement/
├── dtos.ts          # All DTOs from Appendix A
├── queries.ts       # 4 per-metric query functions
├── mappers.ts       # Row → DTO transformations
└── index.ts         # createMeasurementService factory + MeasurementService interface
```

**Tasks:**
- [ ] Create `dtos.ts` — `MeasurementSummaryResponse`, 4 widget DTOs, breakdown row types, `FilterDimension`, `MeasurementWidgetId`
- [ ] Create `queries.ts` — `queryTheoDiscrepancy()`, `queryAuditCorrelation()`, `queryRatingCoverage()`, `queryLoyaltyLiability()`
- [ ] Create `mappers.ts` — row-to-DTO mappers for each metric (handle null/missing columns)
- [ ] Create `index.ts` — `MeasurementService` interface with `getSummary()`, `createMeasurementService()` factory
- [ ] Implement `getSummary()` — `Promise.allSettled` for 4 queries, `buildErrorMap()` for failures
- [ ] Unit tests for each query function (mock Supabase client)
- [ ] Unit tests for mappers

**Dependencies:** None (WS1 is foundation)

### WS2: Route Handler (P0)

**Output:** `app/api/v1/measurement/summary/route.ts`

**Tasks:**
- [ ] Create Route Handler following shift dashboard exemplar pattern
- [ ] Inline Zod schema: `z.object({ pit_id: z.string().uuid().optional(), table_id: z.string().uuid().optional() })`
- [ ] `withServerAction` middleware integration (domain: `'measurement'`, action: `'summary.fetch'`)
- [ ] Handler-level role guard: check `mwCtx.rlsContext.staffRole` against `['pit_boss', 'admin']`, return 403 for others
- [ ] `export const dynamic = 'force-dynamic'`
- [ ] Route Handler tests: 401 (unauthenticated), 403 (wrong role), 200 (success), partial failure scenario

**Dependencies:** WS1 (service layer)

### WS3: React Query Integration (P0)

**Output:** `hooks/measurement/`

```
hooks/measurement/
├── keys.ts                      # measurementKeys factory
├── http.ts                      # fetchMeasurementSummary()
└── use-measurement-summary.ts   # useMeasurementSummary() hook
```

**Tasks:**
- [ ] Create `keys.ts` — `measurementKeys` with root `['measurement']`, `summary` with `.scope` pattern, `all()` invalidation helper
- [ ] Create `http.ts` — `fetchMeasurementSummary(pitId?, tableId?)` using `fetchJSON<MeasurementSummaryResponse>`
- [ ] Create `use-measurement-summary.ts` — `useMeasurementSummary(filters?)` with `staleTime: 30_000`, `refetchOnWindowFocus: true`

**Dependencies:** WS1 (DTO types)

### WS4: RSC Page + Authorization (P1)

**Output:** `app/(protected)/admin/reports/page.tsx`

**Tasks:**
- [ ] Create RSC page following shift dashboard pattern: `QueryClient` → `Promise.allSettled` prefetch → `HydrationBoundary`
- [ ] Page metadata: `title: 'Measurement Reports | PT-2'`
- [ ] Page-level role guard: check staff role from session, redirect unauthorized roles
- [ ] Verify `(protected)` layout group provides base authentication

**Dependencies:** WS2 (endpoint must exist for prefetch), WS3 (key factory + fetcher)

### WS5: Widget Components (P1)

**Output:** `components/measurement/`

```
components/measurement/
├── measurement-reports-dashboard.tsx   # Layout + filter state
├── measurement-filter-bar.tsx          # Pit/table dropdowns
├── freshness-badge.tsx                 # "Live" (green) or "As of [date]" (amber)
├── metric-widget.tsx                   # Shared widget shell (header, summary, breakdown, footer)
├── theo-discrepancy-widget.tsx         # MEAS-001
├── audit-correlation-widget.tsx        # MEAS-002
├── rating-coverage-widget.tsx          # MEAS-003
└── loyalty-liability-widget.tsx        # MEAS-004
```

**Tasks:**
- [ ] Create `metric-widget.tsx` — shared shell: header (name + freshness badge), summary area, breakdown table, provenance footer
- [ ] Create `freshness-badge.tsx` — green "Live" for request-time, amber "As of [date]" for periodic
- [ ] Create `measurement-filter-bar.tsx` — casino (read-only), pit dropdown, table dropdown (filtered by pit)
- [ ] Create `measurement-reports-dashboard.tsx` — 2×2 grid, filter state management, passes `useMeasurementSummary` data to widgets
- [ ] Create 4 widget components — each reads its slot from the summary response, renders summary totals + breakdown (if supported)
- [ ] Each widget: if `supported_dimensions` doesn't include current filter, show "Casino-level only"
- [ ] Error widget state: when DTO slot is `null` and error exists, show "Metric unavailable — Retry"
- [ ] E2E test: pit boss navigates to `/admin/reports`, 4 widgets visible

**Dependencies:** WS3 (hook), WS4 (page)

### WS6: Benchmark Gate (P2)

**Tasks:**
- [ ] Benchmark each widget query independently with `EXPLAIN ANALYZE` — record per-query p95 latency
- [ ] Benchmark the aggregate BFF response (`GET /api/v1/measurement/summary`) end-to-end
- [ ] Benchmark full page load (RSC prefetch → hydration → render) against the stated 2s p95 target
- [ ] Record all benchmark results as evidence in the PR description (query plans + latency numbers)
- [ ] If MEAS-002 exceeds budget: follow RFC-002 §5 mitigation sequence (column pruning → aggregate pushdown → index review → migration exception as last resort with measured evidence)
- [ ] Define escalation path: if MEAS-002 cannot meet p95 after mitigation, file migration exception with benchmark evidence and notify lead architect

**Dependencies:** WS1–WS5 complete

### Execution Order

```
Phase 1: [WS1] Service Layer (foundation — no dependencies)
Phase 2: [WS2, WS3] Route Handler + React Query (parallel — both depend on WS1)
Phase 3: [WS4, WS5] RSC Page + Widgets (parallel — depend on WS2/WS3)
Phase 4: [WS6] Benchmark Gate (depends on all above)
```

---

## Appendix C: Error Codes

**Measurement Domain:**
- `FORBIDDEN` (403) — Staff role not in `['pit_boss', 'admin']`
- `UNAUTHORIZED` (401) — No authenticated session / RLS context missing
- `INTERNAL_ERROR` (500) — Database query failure (per-metric, in `errors` map)
- `VALIDATION_ERROR` (400) — Invalid `pit_id` or `table_id` format (not UUID)

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-03-08 | Architect | Initial draft from RFC-002 + scaffold audit |
| 0.2.0 | 2026-03-08 | Architect | Screw torque audit: 7 corrections applied — Floor Supervisor scoped out, risk wording fixed, invalid filter contract defined, structured WidgetError codes, governance artifacts in DoD, PRD-to-RFC relationship stated, benchmark gate tightened |

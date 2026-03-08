---
id: RFC-002
title: "Design Brief: Hardening Slice 1 — ADR-039 Measurement UI"
owner: architect
status: Draft
date: 2026-03-08
affects:
  - services/measurement/
  - app/api/v1/measurement/
  - app/(protected)/admin/reports/
---

# Design Brief / RFC: ADR-039 Measurement UI

> Purpose: Establish architectural direction, contract boundaries, and locked decisions for the Slice 1 measurement dashboard. Implementation shape, file layout, and work breakdown belong in the PRD.

## 1) Context

### What exists

ADR-039 shipped 4 measurement artifacts. All database infrastructure is deployed:

| Truth ID | Artifact | Security Mode | Freshness |
|----------|----------|---------------|-----------|
| MEAS-001 | `rating_slip` columns (`computed_theo_cents`, `legacy_theo_cents`) | Row-level (RLS) | Request-time |
| MEAS-002 | `measurement_audit_event_correlation_v` (4-table JOIN) | SECURITY INVOKER | Request-time |
| MEAS-003 | `measurement_rating_coverage_v` | SECURITY INVOKER | Request-time |
| MEAS-004 | `loyalty_liability_snapshot` + `loyalty_valuation_policy` | SECURITY DEFINER RPC (ADR-018) | Periodic (daily) |

Slice 0 governance standards constrain this surface:

- **Surface Classification Standard** — mandates pattern selection from proven palette with declaration requirement
- **Metric Provenance Matrix** — declares truth class, freshness, computation layer, and reconciliation path per metric

### What is missing

A read-only dashboard at `/admin/reports` that surfaces these 4 metrics to pit bosses, proving ADR-039 infrastructure delivers operational value and that Slice 0 governance standards are actionable.

### Prior art

The **Shift Dashboard** is the proven exemplar for this exact pattern combination (RSC Prefetch + BFF Summary Endpoint). This RFC adopts the same architecture.

---

## 2) Scope & Goals

**In scope:** Single BFF endpoint, cross-cutting aggregation service, server-rendered reports page, 4 metric widgets, dual-layer authorization, per-widget filtering.

**Out of scope:** New migrations/views/RPCs, provenance matrix expansion, real-time streaming, export/download, time-series trends, retroactive governance (Slices 2-3).

**Success criteria:**
- Dashboard loads all 4 widgets in < 2 seconds (p95) under casino-scoped RLS
- Zero cross-tenant data leakage
- MEAS-004 displays snapshot date prominently ("As of [date]")

---

## 3) Proposed Direction

A single BFF Summary Endpoint aggregates 4 parallel metric queries into one response. A cross-cutting MeasurementService orchestrates the reads — it owns no tables, only query composition across existing bounded contexts. The RSC page prefetches this endpoint server-side with graceful degradation (`Promise.allSettled`), and renders 4 independent widgets.

Error handling follows **partial success**: if one metric query fails, the endpoint returns `null` for that widget with an error code. The page degrades gracefully — working widgets render, failed widgets show error state.

---

## 4) Detailed Design

### 4.1 Data Model Changes

**None.** Zero-migration rule applies. Migration exception only through formal benchmark-backed escalation with measured evidence (e.g., MEAS-002 index required to meet p95 budget).

### 4.2 BFF Summary Endpoint Contract

**Route:** `GET /api/v1/measurement/summary?pit_id={optional}&table_id={optional}`

Casino scope derived from RLS context (ADR-024) — never a query parameter.

**Response shape:** The BFF response is a flat object with one nullable slot per metric, a partial error map, and request metadata.

```typescript
interface MeasurementSummaryResponse {
  theo_discrepancy:  TheoDiscrepancyDto  | null;
  audit_correlation: AuditCorrelationDto | null;
  rating_coverage:   RatingCoverageDto   | null;
  loyalty_liability: LoyaltyLiabilityDto | null;
  errors: Partial<Record<MeasurementWidgetId, string>>;
  meta: { request_id: string; timestamp: string; casino_id: string };
}
```

**Per-widget DTO contract model:** Each widget DTO follows the same structural pattern:

```typescript
interface WidgetDto {
  supported_dimensions: FilterDimension[];  // declares which filters apply
  freshness: 'request-time' | 'periodic';  // from Provenance Matrix
  summary: { /* metric-specific summary totals */ };
  breakdown: BreakdownRow[] | null;         // null when dimension not supported
}
```

- `supported_dimensions` is contract-driven — the UI renders filter controls based on what the DTO declares, not assumption
- `breakdown` is constrained to grouped aggregates only — no raw-data dumping, no unbounded payload growth
- MEAS-004 adds a mandatory `snapshot_date: string` field (ISO date) for freshness labeling

**Contract boundaries (scaffold audit):**
- **Allowed:** Summary totals + constrained grouped breakdown arrays
- **Forbidden:** Raw-data dumping, unbounded widget-specific contract growth, arbitrary new payload shapes
- **Evolution rule:** Additive-only — new fields may be added; existing fields must not change type or be removed without versioning

### 4.3 Service Layer Architecture

A new cross-cutting **MeasurementService** orchestrates 4 independent query functions in parallel via `Promise.allSettled`. It does not own any tables — it reads from existing infrastructure under the caller's RLS context.

| Metric | Data Source | Query Pattern | RLS Model |
|--------|------------|---------------|-----------|
| MEAS-001 | `rating_slip` table | Direct SELECT + GROUP BY | Caller's RLS |
| MEAS-002 | `measurement_audit_event_correlation_v` | SELECT from INVOKER view | Caller's RLS |
| MEAS-003 | `measurement_rating_coverage_v` | SELECT from INVOKER view | Caller's RLS |
| MEAS-004 | `loyalty_liability_snapshot` + `loyalty_valuation_policy` | SELECT latest snapshot + JOIN policy | RLS on snapshot table |

**MEAS-004 read-only constraint:** The endpoint reads the most recent snapshot row. It does NOT invoke `rpc_snapshot_loyalty_liability` — that is a write operation (SECURITY DEFINER, ADR-018), called by a separate daily job.

**Aggregation semantics:** Following the Shift Dashboard exemplar — parallel query execution, per-metric error isolation, unified response assembly. The service is the single code path for all measurement reads.

### 4.4 Rendering Architecture

**Pattern:** RSC Prefetch + HydrationBoundary (per Surface Classification Standard §4 Q1).

- Server Component prefetches BFF endpoint
- `Promise.allSettled` for graceful degradation — if prefetch fails, client hook fetches on mount
- Single BFF call eliminates client loading waterfall
- Client components hydrate for interactivity (filter controls, refresh)

### 4.5 Security Model

**Dual-layer authorization** — both layers mandatory, neither optional (scaffold audit correction #3).

| Layer | Enforcement Point | Mechanism |
|-------|------------------|-----------|
| **Page guard** | Route/layout | Role check against `pit_boss`, `admin` allowlist from auth session |
| **Handler guard** | Route Handler | `staffRole` check from `mwCtx.rlsContext` before query execution |

**Why both:** A protected page with an unguarded endpoint is a security hole. A dealer-role user who knows the API URL must get 403, not measurement data.

**Tenancy:** Casino scope is authoritative via `set_rls_context_from_staff()` (ADR-024). All 4 queries inherit the caller's `casino_id` — MEAS-002 and MEAS-003 via SECURITY INVOKER views, MEAS-001 and MEAS-004 via RLS on their source tables.

### 4.6 Filtering Model

**Casino scope:** Mandatory, automatic, never user-provided. Derived from RLS context (ADR-024).

**Pit / Table filters:** Optional query parameters applied per-widget based on `supported_dimensions`:

| Metric | Casino | Pit | Table | Rationale |
|--------|--------|-----|-------|-----------|
| MEAS-001 Theo Discrepancy | Always (RLS) | Yes | Yes | `rating_slip` has `pit_id` and `table_id` |
| MEAS-002 Audit Correlation | Always (RLS) | No | No | 4-table JOIN is casino-scoped; sub-casino adds prohibitive complexity |
| MEAS-003 Rating Coverage | Always (RLS) | Yes | Yes | View includes `pit_id` and `table_id` |
| MEAS-004 Loyalty Liability | Always (RLS) | No | No | Snapshot is casino-level aggregate |

**UI contract:** Widgets read `supported_dimensions` from the DTO. Unsupported dimensions render as disabled/unavailable — the UI does not assume universal filter support.

### 4.7 Freshness Treatment

Two freshness classes coexist in one endpoint:

| Class | Metrics | Behavior | UI Treatment |
|-------|---------|----------|-------------|
| **Request-time** | MEAS-001, 002, 003 | Computed fresh on each request | Live indicator |
| **Periodic (daily)** | MEAS-004 | Serve latest snapshot | **Mandatory** "As of [date]" label, prominently displayed near metric value — not buried in tooltip |

The freshness distinction is structural, not cosmetic. MEAS-004's `snapshot_date` in the DTO contract ensures the UI cannot present stale data as live. This is a mandatory acceptance criterion per scaffold audit.

---

## 5) Cross-Cutting Concerns

### Performance

- **p95 target:** < 2 seconds for full page load
- **MEAS-002 risk:** 4-table JOIN view is the most expensive query
- **Mitigation sequence (ordered by preference):**
  1. `EXPLAIN ANALYZE` + query plan review
  2. Column pruning + aggregate pushdown
  3. Index review on join columns
  4. Migration exception (last resort — requires measured evidence that MEAS-002 breaks p95 budget)
- **Parallel execution:** All 4 queries via `Promise.allSettled` — no serial waterfall

### Observability

- Correlation ID propagated from request through middleware to all 4 queries
- Per-metric query timing for performance tracking
- Failed metrics surface in `errors` map for alerting on partial failures

### Error Handling

**Partial success** (not all-or-nothing):
- Each metric query is independent
- Failure → `null` in response slot + error code in `errors` map
- UI renders working widgets normally; failed widgets show error state with retry
- Same graceful degradation pattern as Shift Dashboard RSC page

### Rollback

Standard code rollback — revert PR. No database state to unwind. Pure read-only surface against existing infrastructure.

---

## 6) Alternatives Considered

### Alternative A: Per-Metric Endpoints (Scaffold Option B)

Four separate Route Handlers, each returning one metric. RSC page fetches all 4 in parallel.

- (+) Independent loading per widget, simpler per-handler logic
- (−) 4 HTTP round-trips, more handler boilerplate, violates BFF Summary pattern
- **Rejected:** Surface Classification Standard selected BFF Summary. Partial success inside one handler achieves per-widget error isolation without the HTTP overhead. Fallback only if benchmark evidence forces splitting.

### Alternative B: BFF RPC Aggregation (Database Function)

Single PostgreSQL function `rpc_measurement_summary()` running all 4 queries in one DB call.

- (+) Single DB round-trip, strongest consistency
- (−) Violates zero-migration scope, SECURITY DEFINER governance burden (ADR-018), loses INVOKER safety on MEAS-002/003, harder to profile per-metric
- **Rejected:** Zero-migration rule. BFF Summary Endpoint (HTTP-level aggregation) is the correct fit per Surface Classification Standard §4 Q2.

### Alternative C: No Service — Inline in Route Handler

All 4 queries directly in the route handler file.

- (+) Fewer files
- (−) 200+ line god-file, queries not unit-testable, violates service layer pattern (SLAD §308)
- **Rejected:** Queries are complex enough (especially MEAS-002 mapping) to warrant a lean service.

---

## 7) Decisions Required

No new ADR-worthy decisions. All architectural choices are already locked:

| Decision | Source | Status |
|----------|--------|--------|
| Rendering: RSC Prefetch + Hydration | Surface Classification Standard §4 Q1 | Locked |
| Aggregation: BFF Summary Endpoint | Surface Classification Standard §4 Q2 + Scaffold audit | Locked (Option A) |
| Zero-migration scope | Scaffold §2 | Locked |
| Dual-layer authorization | Scaffold audit correction #3 | Locked |
| MEAS-004 freshness labeling | Scaffold audit correction #4 | Locked |
| Per-widget supported_dimensions | Scaffold audit correction #5 | Locked |
| Partial success error handling | This RFC (follows Shift Dashboard exemplar) | Proposed |
| MeasurementService as cross-cutting aggregator | This RFC | Proposed |

---

## 8) Open Questions

All scaffold open questions resolved at scaffold audit. No new open questions introduced.

| Question | Resolution |
|----------|------------|
| Who owns aggregation logic? | Cross-cutting MeasurementService — no table ownership, orchestrates reads |
| MEAS-004 freshness in same endpoint? | Read-only (no RPC invocation); `snapshot_date` in DTO contract |
| Filter contract? | Global query params applied per-widget via `supported_dimensions` |
| Error handling? | Partial success via `Promise.allSettled` |

---

## Links

- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-002-hardening-slice-1-measurement-ui.md`
- Feature Boundary: `docs/20-architecture/specs/hardening-slice-1-measurement-ui/FEATURE_BOUNDARY.md`
- Surface Declaration: `docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md`
- ADR-039: `docs/80-adrs/ADR-039-measurement-layer.md`
- ADR-041: `docs/80-adrs/ADR-041-surface-governance-standard.md`
- PRD (Phase 5): `docs/10-prd/PRD-046-measurement-ui.md`

## References

- Surface Classification Standard: `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`
- Metric Provenance Matrix: `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`
- Shift Dashboard BFF (exemplar): `app/api/v1/shift-dashboards/summary/route.ts`
- Shift Dashboard RSC (exemplar): `app/(protected)/shift-dashboard/page.tsx`
- Edge Transport Policy: `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- SRM §Measurement Layer: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- SLAD: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`

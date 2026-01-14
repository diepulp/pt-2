# PRD— Shift Dashboards Implementation v0.2 (Telemetry + Core Metrics)

---
title: "PRD - Shift Dashboards Implementation (v0.2)"
status: ready_for_implementation
owner: TableContext / CasinoService
created: 2026-01-14
last_updated: 2026-01-14
---

## 1. Overview
- **Owner:** CasinoService / TableContext (SRM-aligned)
- **Status:** Ready for Implementation
- **Summary:** This release implements the Shift Dashboards and Shift Reports experience as a single, authoritative operational view for supervisors and management. **The backend is complete** (all RPCs, tables, RLS policies, and integration tests). This PRD defines the remaining work: HTTP route handlers and React UI components to expose the functionality to users.

## 2. Problem & Goals
### 2.1 Problem
Shift reporting today is fragmented across operational telemetry and financial facts, making it hard for supervisors, finance, and compliance to answer basic shift questions quickly and consistently. **The backend infrastructure is now complete** - all RPCs for shift metrics (table/pit/casino), cash observations, and alerts are implemented and tested. However, **no HTTP routes or UI exist** to expose this functionality to users. Pit supervisors cannot access shift metrics through the application.

### 2.2 Goals
- Expose existing shift metrics RPCs via REST API endpoints following PT-2 route handler patterns.
- Build a shift dashboard surface for casino, pit, and table lenses with clear separation of authoritative KPIs vs telemetry.
- Enable a reproducible shift report payload for export and auditability.
- Deliver baseline Admin/Shift UI and Alerts/Reports scaffolding that teams can iterate on in parallel.

### 2.3 Non-Goals
- Predictive analytics, anomaly detection beyond simple baselines, or AI summaries.
- Automated actions (e.g., executing operational changes from the dashboard).
- Cross-property enterprise reporting.

## 3. Users & Use Cases
- **Primary users:** pit_supervisor, pit_boss, shift_manager, compliance_officer, finance_controller, executive_summary_consumer.

**Top Jobs:**
- As a pit supervisor, I need to see which tables are underperforming or idle so that I can adjust staffing and openings.
- As a finance controller, I need authoritative drop/win/hold per table and pit for the shift so that I can reconcile results.
- As a compliance officer, I need to see threshold alerts and evidence links so that I can document review actions.
- As an executive, I need a concise summary of shift KPIs and exceptions so that I can assess performance quickly.

## 4. Scope & Feature List
- Admin/Shift dashboard route with casino, pit, and table lenses (basic navigation + filters).
- Cash observations telemetry rollups and spike alerts surfaced in a dedicated “Cash Observations (Telemetry)” section.
- Promo exposure lens surfaced separately from cash KPIs.
- Core shift metrics RPCs: table, pit, casino rollups and alerts.
- Shift report payload RPC and export scaffold.
- Alert thresholds read from casino settings and displayed in the UI where relevant.

## 5. Requirements
### 5.1 Functional Requirements
- A user can select a time window and view rollups for casino, pit, and table lenses.
- Telemetry-only cash observations are displayed in a distinct section and never blended into authoritative KPIs.
- Promo exposure metrics are displayed in a distinct section separate from cash KPIs.
- Core shift metrics and alerts are retrieved from RPCs (table/pit/casino and alert list).
- Shift report payload can be fetched and exported as JSON (CSV optional in this phase).

### 5.2 Non-Functional Requirements
- Casino/pit view loads in <2 seconds for a small casino footprint; table view may be up to 5 seconds.
- All RPCs used by the UI are SECURITY INVOKER and enforce casino RLS context.
- UI meets baseline accessibility (keyboard nav, focus order, ARIA labels for alert lists).

> Details of architecture, schema, and API live in ARCH/SRM/schema docs and are not repeated here.

## 6. UX / Flow Overview
- Open Admin → Shift Dashboard → select time window → view casino KPIs and alerts → drill into pit and table views.
- Open Admin → Alerts → view alerts grouped by severity and type.
- Open Admin → Reports → generate or fetch shift report payload for export.

## 7. Dependencies & Risks
### 7.1 Dependencies
- Cash observations telemetry RPCs (already implemented): `rpc_shift_cash_obs_table`, `rpc_shift_cash_obs_pit`, `rpc_shift_cash_obs_casino`, `rpc_shift_cash_obs_alerts`.
- Promo exposure rollup RPC (already implemented): `rpc_promo_exposure_rollup`.
- Core shift metrics catalog and SP contracts: `SHIFT_METRICS_CATALOG_v0_PATH_B_PATCH_cash-observations.md`.
- Fact/event tables for Path B metrics (drop/fill/credit/inventory/status/rotations) must exist and be populated.

### 7.2 Risks & Open Questions
- ~~**Risk:** Core shift metrics RPCs are not yet implemented~~ → **RESOLVED** (all RPCs complete and tested)
- **Risk:** Data completeness for inventory snapshots and drop events may lag, impacting win/hold accuracy.
  - **Mitigation:** Surface evidence fields and missing-data alerts; document gaps explicitly in UI.
- **Risk:** RPC types may need regeneration before service layer can be implemented.
  - **Mitigation:** Run `npm run db:types` before starting WS1.
- **Open question:** Does v0 require CSV export or is JSON-only sufficient for initial release?
- **Open question:** Default time window - should dashboard default to "current shift" (8h) or "today"?
- **Open question:** Auto-refresh interval - every 5 minutes, or manual only?

## 8. Implementation Status (as of 2026-01-14)

### 8.1 COMPLETE - Database Layer

| Workstream | Migration | Status |
|------------|-----------|--------|
| WS1 - table_buyin_telemetry | `20260114003530_table_buyin_telemetry.sql` | ✅ Complete |
| WS2 - rpc_log_table_buyin_telemetry | `20260114004141_rpc_log_table_buyin_telemetry.sql` | ✅ Complete |
| WS3 - chipset_total_cents | `20260114003537_chipset_total_cents_helper.sql` | ✅ Complete |
| WS4 - rpc_shift_table_metrics | `20260114004336_rpc_shift_table_metrics.sql` | ✅ Complete |
| WS5 - rpc_shift_pit/casino_metrics | `20260114004455_rpc_shift_rollups.sql` | ✅ Complete |
| Cash Obs Rollups | `20260107015907_shift_cash_obs_rollup_rpcs.sql` | ✅ Complete |
| Cash Obs Alerts | `20260107020746_shift_cash_obs_alerts.sql` | ✅ Complete |

**RPC Signatures Available:**
- `rpc_shift_table_metrics(p_window_start, p_window_end)` - Per-table metrics with dual-stream win/loss
- `rpc_shift_pit_metrics(p_window_start, p_window_end, p_pit_id?)` - Pit-level aggregation
- `rpc_shift_casino_metrics(p_window_start, p_window_end)` - Casino-level summary
- `rpc_shift_cash_obs_table/pit/casino(...)` - Cash observation rollups
- `rpc_shift_cash_obs_alerts(...)` - Threshold-based alerts

### 8.2 COMPLETE - Integration Tests

**File:** `__tests__/services/table-context/shift-metrics.int.test.ts`
- 25+ test cases covering all RPCs
- Idempotency, validation, telemetry quality grading
- All tests passing

### 8.3 PARTIAL - Service Layer

| Item | Status | Notes |
|------|--------|-------|
| Cash Obs DTOs | ✅ Complete | `services/table-context/dtos.ts` |
| Cash Obs Service | ✅ Complete | `services/table-context/shift-cash-obs.ts` |
| Shift Metrics DTOs | ❌ Missing | Need DTOs for table/pit/casino metrics |
| Shift Metrics Service | ❌ Missing | Need service functions for table/pit/casino RPCs |
| Zod Schemas | ❌ Missing | Need request validation schemas |

### 8.4 NOT STARTED - API Routes

No route handlers exist. Required:
- `app/api/v1/shift-dashboards/metrics/tables/route.ts`
- `app/api/v1/shift-dashboards/metrics/pits/route.ts`
- `app/api/v1/shift-dashboards/metrics/casino/route.ts`
- `app/api/v1/shift-dashboards/cash-observations/*/route.ts`
- `app/api/v1/shift-dashboards/report/route.ts`

### 8.5 NOT STARTED - UI Components

No components exist. Required:
- `components/shift-dashboard/*.tsx` - Dashboard components
- `hooks/shift-dashboard/*.ts` - TanStack Query hooks
- `app/(protected)/shift-dashboard/page.tsx` - Dashboard page

---

## 9. EXECUTION-SPEC Workstream Outline

```yaml
workstreams:
  WS1:
    name: Service Layer - Shift Metrics DTOs & Service
    description: DTOs, Zod schemas, and service functions for shift table/pit/casino metrics
    executor: backend-service-builder
    depends_on: []
    outputs:
      - services/table-context/shift-metrics/dtos.ts
      - services/table-context/shift-metrics/service.ts
      - services/table-context/shift-metrics/schemas.ts
    gate: type-check
    estimated_complexity: medium

  WS2:
    name: API Routes - Shift Metrics
    description: Route handlers for shift metrics endpoints (table/pit/casino)
    executor: api-builder
    depends_on: [WS1]
    outputs:
      - app/api/v1/shift-dashboards/metrics/tables/route.ts
      - app/api/v1/shift-dashboards/metrics/pits/route.ts
      - app/api/v1/shift-dashboards/metrics/casino/route.ts
    gate: type-check
    estimated_complexity: medium

  WS3:
    name: API Routes - Cash Observations & Alerts
    description: Route handlers for cash observation rollups and alerts
    executor: api-builder
    depends_on: []
    outputs:
      - app/api/v1/shift-dashboards/cash-observations/tables/route.ts
      - app/api/v1/shift-dashboards/cash-observations/pits/route.ts
      - app/api/v1/shift-dashboards/cash-observations/casino/route.ts
      - app/api/v1/shift-dashboards/cash-observations/alerts/route.ts
    gate: type-check
    estimated_complexity: medium

  WS4:
    name: React Hooks - Shift Dashboard
    description: TanStack Query hooks for shift metrics data fetching
    executor: frontend-design
    depends_on: [WS2, WS3]
    outputs:
      - hooks/shift-dashboard/use-shift-table-metrics.ts
      - hooks/shift-dashboard/use-shift-pit-metrics.ts
      - hooks/shift-dashboard/use-shift-casino-metrics.ts
      - hooks/shift-dashboard/use-shift-alerts.ts
    gate: type-check
    estimated_complexity: low

  WS5:
    name: UI Components - Shift Dashboard
    description: Dashboard page and component scaffolding
    executor: frontend-design
    depends_on: [WS4]
    outputs:
      - components/shift-dashboard/shift-dashboard-page.tsx
      - components/shift-dashboard/time-window-selector.tsx
      - components/shift-dashboard/casino-summary-card.tsx
      - components/shift-dashboard/pit-metrics-table.tsx
      - components/shift-dashboard/table-metrics-table.tsx
      - components/shift-dashboard/alerts-panel.tsx
      - app/(protected)/shift-dashboard/page.tsx
    gate: build-pass
    estimated_complexity: high

  WS6:
    name: E2E Tests - Shift Dashboard API
    description: API integration tests for shift dashboard endpoints
    executor: qa-specialist
    depends_on: [WS2, WS3]
    outputs:
      - __tests__/api/shift-dashboards/metrics.test.ts
      - __tests__/api/shift-dashboards/cash-observations.test.ts
    gate: test-pass
    estimated_complexity: medium

execution_phases:
  - name: Phase 1 - Service Layer
    parallel: [WS1]
    gates: [type-check]

  - name: Phase 2 - API Routes
    parallel: [WS2, WS3]
    gates: [type-check]

  - name: Phase 3 - Frontend
    parallel: [WS4, WS5]
    gates: [build-pass]

  - name: Phase 4 - Quality
    parallel: [WS6]
    gates: [test-pass]

gates:
  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0, no type errors"

  build-pass:
    command: npm run build
    success_criteria: "Exit code 0, production build succeeds"

  test-pass:
    command: npm test __tests__/api/shift-dashboards
    success_criteria: "All tests pass"
```

---

## 10. Definition of Done (DoD)
The release is considered **Done** when:

**Functionality**
- Admin/Shift dashboard renders casino, pit, and table rollups for a chosen time window.
- Telemetry cash observations and promo exposure panels appear as separate sections with explicit labeling.
- Alerts view renders spike alerts (telemetry) and core alerts from shift metrics RPCs.
- Shift report payload can be fetched and exported via the Reports page scaffold.

**Data & Integrity**
- Core shift metrics RPCs return deterministic results for a fixed window on fixture data.
- Telemetry fields are not used in authoritative drop/win/hold calculations.

**Security & Access**
- All shift dashboard RPCs are SECURITY INVOKER and respect casino-scoped RLS.
- Role visibility aligns with SEC-003 for operational vs compliance views (documented if partial).

**Testing**
- Integration tests cover at least one happy path per shift RPC group (cash obs, promo, core metrics).
- UI smoke test confirms dashboard renders with mock data for the main flow.

**Operational Readiness**
- Basic logging for dashboard/report access exists (or tracked as a follow-up if not yet wired).
- Known limitations (missing data sources, delayed baselines) are documented in the PRD or UI notes.

**Documentation**
- Shift dashboard user notes and known limitations are documented.
- Links to the metrics catalog and alert thresholds are provided for reference.

## 11. Related Documents
- Vision / Strategy: `VIS-001_Vision_and_Scope_v2.md`
- Architecture / SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- Metrics Catalog: `docs/00-vision/shift-dashboards/SHIFT_METRICS_CATALOG_v0_PATH_B_PATCH_cash-observations.md`
- Alert Thresholds: `docs/00-vision/loyalty-service-extension/SHIFT_DASHBOARDS_V0_ALERT_THRESHOLDS_BASELINES_PATCH.md`
- Admin UI Style: `docs/00-vision/shift-dashboards/ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md`
- QA / Test Plan: `docs/40-quality/QA-001-service-testing-strategy.md`
- Security / RLS: `docs/30-security/README.md`

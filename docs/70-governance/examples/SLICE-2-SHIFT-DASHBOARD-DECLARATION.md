# Surface Classification Declaration: Slice 2 — Shift Dashboard V3

**Surface:** Shift Dashboard V3 (`components/shift-dashboard-v3/`)
**Slice:** Hardening Slice 2
**Date:** 2026-03-09
**Status:** Accepted (retroactive governance certification)
**Standard:** `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` v1.0.0

> This declaration applies the Surface Classification Standard retroactively to the production Shift Dashboard V3. Unlike Slice 1 (greenfield), this certifies a mature operational surface with pre-existing provenance primitives. Zero code changes — governance certification only.

---

## Surface Classification

### Rendering Delivery: RSC Prefetch + Hydration

**Rationale:** The shift dashboard is a read-heavy operational surface. It displays 6+ metric groups (win/loss, drop, fills/credits, coverage, cash observations, active visitors) across left rail, center panel, and right rail — all above the fold. Users primarily view and compare data during shift operations. The main page (`app/(protected)/shift-dashboard/page.tsx`) uses RSC server component prefetch with client-side hydration via React Query.

**Selection criteria met (§4 Q1):**
- Read-heavy: primary interaction is viewing shift financial/operational metrics, not data entry
- ≥2 independent queries: 3 independent queries above the fold (`useShiftDashboardSummary`, `useCashObsSummary`, `useActiveVisitorsSummary`)
- Visible above the fold: hero win/loss, secondary KPIs, coverage bar, alerts strip all render without scrolling

### Data Aggregation: BFF Summary Endpoint

**Rationale:** The shift dashboard consolidates multi-level rollups (casino → pits → tables) across multiple data domains into 3 BFF summary endpoints. Each endpoint reduces multiple individual HTTP calls to one:

| BFF Endpoint | Route | Consolidates |
|-------------|-------|-------------|
| Shift Metrics Summary | `GET /api/v1/shift-dashboards/summary` | Single RPC (`rpc_shift_table_metrics`) + client-side aggregation (table → pit → casino) |
| Cash Observations Summary | `GET /api/v1/shift-dashboards/cash-observations/summary` | 4 parallel RPCs (`rpc_shift_cash_obs_casino`, `_pit`, `_table`, `_alerts`) + severity guardrail enrichment |
| Active Visitors Summary | `GET /api/v1/shift-dashboards/visitors-summary` | Single RPC (`rpc_shift_active_visitors_summary`) |

**Selection criteria met (§4 Q2):**
- 3+ bounded contexts: TableContextService, VisitService, CasinoService (via casino_settings for thresholds)
- Multi-level rollup: casino/pit/table hierarchy for win/loss, fills/credits, coverage, cash observations
- >100 calls/day: operational dashboard accessed throughout shift operations (30s auto-refresh)

### Rejected Patterns

| Pattern | Axis | Rejection Rationale |
|---------|------|-------------------|
| **Client Shell** | Rendering Delivery | Read-heavy dashboard with 3 independent queries above the fold. Users need immediate data visibility on load — server-seeded paint is critical for operational responsiveness during shift operations. Violates RSC selection criterion: "≥2 independent queries visible above the fold" (§4 Q1). |
| **Hybrid** | Rendering Delivery | No heavy client mutation interaction required — dashboard is read-only with drill-down controls. RSC Prefetch + Hydration alone suffices. Adding a client mutation layer would be unnecessary complexity. |
| **BFF RPC Aggregation** | Data Aggregation | Multi-level hierarchical rollup (casino/pit/table) fits Summary Endpoint better than flat cross-context join. BFF RPC (GOV-PAT-003) is optimized for single-level cross-context reads with SECURITY DEFINER collapsing — not hierarchical aggregation across 3 BFF endpoints (§4 Q2). |
| **Simple Query / View** | Data Aggregation | Multiple bounded contexts (TableContextService, VisitService, CasinoService) violates "1-2 tables, single bounded context" criterion. Would require N+1 client-side fetches (§4 Q2). |
| **Client-side Fetch** | Data Aggregation | 3+ cross-context aggregations needed. "No cross-context join" criterion is not met. Client-side orchestration of 6+ RPCs would be fragile and slow (§4 Q2). |

### Metric Provenance

All metrics sourced from the Metric Provenance Matrix (`docs/70-governance/METRIC_PROVENANCE_MATRIX.md` v2.0.0):

| Truth ID | Metric | Truth Class | Freshness | Rendering Implication | Reconciliation Summary |
|----------|--------|-------------|-----------|----------------------|----------------------|
| MEAS-005 | Shift Win/Loss (Estimated) | Derived Operational | Cached (30s) | Auto-refresh every 30s; hero card updates in-place | Per-table: `win_loss_estimated = inventory + drop`. Casino: `nullAwareSum(tables)`. |
| MEAS-006 | Shift Win/Loss (Inventory) | Derived Operational | Cached (30s) | Table-level display; null when snapshots missing | `(closing - opening) + fills - credits`. Null check: missing snapshot → null. |
| MEAS-007 | Shift Estimated Drop | Derived Operational | Cached (30s) | Secondary KPI; always ESTIMATE grade badge | `SUM(amount_cents)` from telemetry. `rated + grind = total`. |
| MEAS-008 | Shift Fills & Credits | Raw Record (aggregated) | Cached (30s) | Secondary KPIs; direct financial record | `SUM(amount_cents)` from fill/credit tables. Casino = SUM(tables). |
| MEAS-009 | Snapshot Coverage & Metric Grade | Derived Operational | Cached (30s) | Coverage bar + grade badge + quality indicators | Coverage = `min(opening,closing)/total`. Grade = worst-of. Quality = tier count. |
| MEAS-010 | Cash Observation Rollups | Derived Operational (telemetry-only) | Cached (30s) | TELEMETRY badge displayed; amber UI treatment | `SUM(amount)` with direction/kind filters. Casino = SUM(pits) = SUM(tables). |
| MEAS-011 | Cash Observation Alerts | Derived Operational (telemetry-only) | Cached (30s) | Alert strip with severity; no-false-critical guardrail | `observed > threshold`. Critical requires GOOD_COVERAGE. |
| MEAS-012 | Active Visitors Summary | Derived Operational | Cached (30s) | Floor activity radar; rated percentage callout | `COUNT(*)` with visit_kind/status filters. `total = rated + unrated`. |

**Freshness constraint for Slice 2:** All 8 metrics use Cached (30s) freshness via React Query configuration (`staleTime: 30_000`, `refetchInterval: 30_000`). The BFF Summary Endpoints compute fresh on each request — the 30s cache is client-side only (TanStack Query stale-while-revalidate). No server-side response caching.

**Reconciliation constraint for Slice 2:** Each metric has a declared reconciliation path in the Metric Provenance Matrix. The consistency audit (`docs/70-governance/audits/SLICE-2-CONSISTENCY-AUDIT.md`) verified all reconciliation paths against actual code derivation.

---

## Validation Assessment

This declaration demonstrates that the Surface Classification Standard scales from a 4-metric greenfield surface (Slice 1) to an 8-metric production surface with pre-existing provenance:

1. **Both axes answered:** Rendering Delivery (RSC Prefetch + Hydration) and Data Aggregation (BFF Summary Endpoint) selected with measurable criteria from §4
2. **Rejected patterns documented:** 5 alternatives rejected with specific clause citations from §4
3. **Metric provenance declared:** All 8 MEAS-005–012 rows cited with truth class + freshness from the Provenance Matrix v2.0.0
4. **Provenance constraints actionable:** Freshness categories (Cached 30s) directly align with React Query configuration. Telemetry-only truth class (MEAS-010, MEAS-011) drives amber UI treatment.
5. **No-fit clause not triggered:** Proven patterns from the palette fit the surface requirements — no escalation needed
6. **Retroactive certification successful:** The declaration format accommodated a production surface without modification to the standard

**Conclusion:** The Surface Classification Standard and Metric Provenance Matrix successfully govern a mature operational surface retroactively. The standard scales from 4 curated metrics (Slice 1) to 8 production metrics (Slice 2) without column expansion or structural changes.

---

## References

| Document | Path |
|----------|------|
| Surface Classification Standard | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` |
| Metric Provenance Matrix v2.0.0 | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |
| Slice 2 Metric Inventory | `docs/70-governance/audits/SLICE-2-SHIFT-METRIC-INVENTORY.md` |
| Slice 2 Consistency Audit | `docs/70-governance/audits/SLICE-2-CONSISTENCY-AUDIT.md` |
| ADR-041 (Surface Governance Standard) | `docs/80-adrs/ADR-041-surface-governance-standard.md` |
| PRD-047 (Slice 2) | `docs/10-prd/PRD-047-shift-provenance-alignment-v0.md` |
| Slice 1 Declaration (template) | `docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md` |
| SRM v4.18.0 | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |

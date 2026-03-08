# Feature Boundary Statement: Hardening Slice 1 — ADR-039 Measurement UI

> **Ownership Sentence:** This feature belongs to the **Measurement Layer** (cross-cutting read models, ADR-039) with read-only consumption from **RatingSlipService**, **LoyaltyService**, **FinanceService**, **MTLService**, and **TableContextService**. It writes zero new tables — all database infrastructure is already shipped. Cross-context reads go through **SRM-registered SECURITY INVOKER views** and **existing service DTOs**.

---

## Feature Boundary Statement

- **Owner service(s):**
  - **Measurement Layer** (cross-cutting) — owns the measurement views, governs truth semantics via Metric Provenance Matrix
  - **Platform/Governance** — owns the Surface Classification Standard constraining this surface

- **Writes:**
  - None. All measurement database infrastructure shipped in ADR-039 (EXEC-045). This slice builds read-only UI against existing artifacts.

- **Reads:**
  - `rating_slip` columns: `computed_theo_cents`, `legacy_theo_cents` (MEAS-001, via RatingSlipService)
  - `measurement_audit_event_correlation_v` (MEAS-002, SECURITY INVOKER view)
  - `measurement_rating_coverage_v` (MEAS-003, SECURITY INVOKER view)
  - `loyalty_liability_snapshot`, `loyalty_valuation_policy` (MEAS-004, via LoyaltyService)

- **Cross-context contracts:**
  - `measurement_audit_event_correlation_v` — 4-table JOIN across RatingSlipService, FinanceService, MTLService, LoyaltyService (caller's RLS)
  - `measurement_rating_coverage_v` — JOIN across TableContextService, RatingSlipService (caller's RLS)
  - `rpc_snapshot_loyalty_liability` — SECURITY DEFINER RPC (ADR-018 governed), idempotent daily snapshot
  - BFF Summary Endpoint — new Route Handler aggregating all 4 metrics (rendering + transport per Surface Classification Standard)

- **Non-goals (top 5):**
  1. New database migrations, views, or RPCs — all infrastructure is shipped
  2. Expanding provenance matrix beyond 4 ADR-039 rows (MEAS-001 through MEAS-004)
  3. Runtime enforcement tooling or governance linters
  4. Real-time streaming / WebSocket delivery of measurement data
  5. Retroactive governance of existing surfaces (Slices 2-3)

- **DoD gates:** Functional / Security / Integrity / Operability

---

## Goal

Pit bosses and floor supervisors can view 4 measurement metrics (theo discrepancy, audit correlation, rating coverage, loyalty liability) on a reports dashboard, proving that ADR-039 infrastructure delivers operational value and that Slice 0 governance standards are actionable.

## Primary Actor

**Pit Boss / Floor Supervisor** (operational role with `pit_boss` or `admin` staff_role, accessing measurement reports during shift operations)

## Primary Scenario

Pit boss navigates to the measurement reports dashboard, sees 4 metric widgets rendered server-side with fresh data (request-time for MEAS-001–003, daily snapshot for MEAS-004), can drill into casino/pit/table breakdowns, and uses the data to identify rating gaps, theo discrepancies, and compliance lineage issues.

## Success Metric

Dashboard loads with all 4 metric widgets populated in < 2 seconds (p95) under casino-scoped RLS, with zero cross-tenant data leakage.

---

## Governance Constraints (from Slice 0)

| Constraint | Source | Implication |
|-----------|--------|-------------|
| Rendering Delivery: RSC Prefetch + Hydration | Surface Classification Standard §4 Q1 | Server-seeded dashboard, 4 queries above fold |
| Data Aggregation: BFF Summary Endpoint | Surface Classification Standard §4 Q2 | Single HTTP endpoint aggregating 6+ bounded contexts |
| Truth semantics: 4 MEAS-* declarations | Metric Provenance Matrix §3 | Each widget maps to declared truth class + freshness |
| MEAS-001–003: Request-time freshness | Provenance Matrix | No response caching for 3 of 4 widgets |
| MEAS-004: Periodic (daily) freshness | Provenance Matrix | Serve latest snapshot, no staleness concern within day |
| Reconciliation paths declared | Provenance Matrix §3 | Implementation must support verification per declared path |

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **Feature Boundary** | Scope definition (this file) | `docs/20-architecture/specs/hardening-slice-1-measurement-ui/FEATURE_BOUNDARY.md` |
| **Scaffold** | Options and tradeoffs | `docs/01-scaffolds/SCAFFOLD-002-hardening-slice-1-measurement-ui.md` |
| **RFC** | Design brief | `docs/02-design/RFC-002-measurement-ui.md` |
| **SEC Note** | Security assessment | `docs/20-architecture/specs/hardening-slice-1-measurement-ui/SEC_NOTE.md` |
| **ADR(s)** | Durable decisions (if any beyond ADR-039/041) | TBD |
| **PRD** | Product requirements | `docs/10-prd/PRD-046-measurement-ui.md` |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.

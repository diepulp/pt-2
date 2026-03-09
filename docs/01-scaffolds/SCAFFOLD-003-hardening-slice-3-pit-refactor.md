---
id: SCAFFOLD-003
title: "Feature Scaffold: Hardening Slice 3 — Pit Dashboard Refactor"
owner: architect
status: Draft
date: 2026-03-09
---

# Feature Scaffold: Hardening Slice 3 — Pit Dashboard Refactor

**Feature name:** hardening-slice-3-pit-refactor
**Owner / driver:** architect
**Stakeholders (reviewers):** product, engineering leads
**Status:** Draft
**Last updated:** 2026-03-09

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss navigating to the pit dashboard, the page renders hydrated **primary initial-load data** on first paint rather than a client-side loading waterfall. The analytics panel shows governed per-table rating coverage data from the measurement layer instead of mock hardcoded metrics.
- **Success looks like:** The pit dashboard's initial load is governed by the Surface Classification Standard (Slice 0). Server prefetches **tables + stats + gaming day** in parallel. Client hooks hydrate from server cache for those primary queries. Analytics panel renders live `rated_ratio` / `untracked_seconds` per table from `measurement_rating_coverage_v`. Secondary or interaction-dependent data (realtime, promo exposure, per-table slip detail) may remain client-resolved unless explicitly expanded in scope. A Surface Classification Declaration exists and can be validated against the standard.

## 2) Constraints (hard walls)

- **Zero schema changes.** No new tables, RPCs, migrations, or database functions. All data sources already exist.
- **Surface Classification compliance.** Must produce a governance declaration with all 4 mandatory fields (rendering delivery, data aggregation, rejected patterns, metric provenance) per the Surface Classification Standard.
- **Proven pattern palette only.** Rendering and aggregation selections must come from the 7 recognized patterns (ADR-041 D2). No pattern invention.
- **Existing mutation paths unchanged.** Slip pause/resume/close, player move, table close — all existing RPCs remain as-is. This refactor touches data *delivery*, not data *mutation*.
- **Realtime subscriptions stay client-side.** Supabase realtime channels cannot be prefetched server-side; they must remain in the client component. RSC prefetch applies only to initial query data.
- **Active render path verified.** `page.tsx` currently renders `PitPanelsDashboardLayout` → `PitPanelsClient`. This is the implementation target. Legacy `pit-dashboard-client.tsx` is out of scope for cleanup unless required to eliminate implementation ambiguity.
- **OE-01 guardrail.** No event bus, no Redis, no new infra. Direct service invocation only.

## 3) Non-goals (what we refuse to do in this iteration)

- Visual/UI redesign of the pit dashboard — layout, components, and interactions stay the same
- New BFF RPCs or summary endpoints (unless Option B is chosen and justified)
- Observability improvements (Hardening Area 2)
- E2E test infrastructure (Hardening Area 3)
- Provenance framework expansion beyond what the pit dashboard displays — Slice 2 handles shift metrics
- Slip Detail audit trace panel — separate scope (see Hardening Report §Remaining UI Surface Gaps)
- Performance benchmarking harness (defer to live DB — same as EXEC-046 WS6)

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Current pit dashboard code (`app/(dashboard)/pit/page.tsx`, `components/pit-panels/`, `hooks/dashboard/`)
  - Surface Classification Standard (`docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`)
  - Metric Provenance Matrix (`docs/70-governance/METRIC_PROVENANCE_MATRIX.md`)
  - Shift Dashboard V3 RSC pattern (reference exemplar: `app/(protected)/shift-dashboard/page.tsx`)
  - EXEC-046 measurement reports pattern (reference exemplar: `app/(dashboard)/admin/reports/page.tsx`)
  - `measurement_rating_coverage_v` view (existing, `security_invoker=true`)
  - Hardening Report §Pit Terminal and §Remaining UI Surface Gaps
- **Outputs:**
  - Refactored `app/(dashboard)/pit/page.tsx` with RSC prefetch + HydrationBoundary
  - Analytics panel wired to `measurement_rating_coverage_v` (replaces mock data)
  - Surface Classification Declaration for the pit dashboard
  - Provenance Matrix amendment if pit-specific metrics need new MEAS-* rows
  - Hardening Slice Manifest update (Slice 3 → Complete)
- **Canonical contract(s):** No new backend aggregation contracts, RPCs, or summary endpoints are introduced in this slice. Existing query contracts remain authoritative. UI composition may change where mock analytics are replaced with governed measurement-backed data.
- **Boundary statement:** Slice 3 orchestrates delivery across already-existing query surfaces and does **not** introduce a new cross-context aggregation contract.

## 5) Options (2 — rendering refactor strategy)

### Option A: RSC Prefetch over Existing Queries (Minimal)

Keep all existing hooks, RPCs, and query functions unchanged. Add server-side prefetch in `page.tsx` using the same query functions the client hooks already use. Wrap the client component with `HydrationBoundary`.

```
page.tsx (server):
  const queryClient = new QueryClient()
  await Promise.allSettled([
    queryClient.prefetchQuery({ queryKey: dashboardKeys.tables(...), queryFn: ... }),
    queryClient.prefetchQuery({ queryKey: dashboardKeys.stats(...), queryFn: ... }),
    queryClient.prefetchQuery({ queryKey: casinoKeys.gamingDay(...), queryFn: ... }),
  ])
  return <HydrationBoundary state={dehydrate(queryClient)}>
    <PitPanelsClient casinoId={casinoId} />
  </HydrationBoundary>
```

Client hooks (`useDashboardTables`, `useDashboardStats`, `useGamingDay`) hydrate from the server cache on first render — no loading state. Realtime, promo exposure, and per-table slips remain client-fetched (they're interaction-dependent or subscription-based).

For the analytics panel: add a new hook `useTableCoverage` that queries `measurement_rating_coverage_v` via existing Supabase client. Wire into `AnalyticsPanel` replacing mock data.

- **Pros:** Minimal diff. No new RPCs or endpoints. Same pattern as Shift Dashboard V3 — proven and reviewed. Each query remains independently cacheable and invalidatable. Preserves existing targeted cache invalidation strategy (PERF-002).
- **Cons / risks:** Still 3 separate server-side queries (not 1). But `Promise.allSettled` runs them in parallel so wall-clock time is max(3) not sum(3). Promo exposure still loads client-side (not prefetched) — acceptable since it's a secondary panel with 30s stale time.
- **Cost / complexity:** Low. ~2-3 files changed in page.tsx + analytics panel. Hook additions for coverage data.
- **Security posture impact:** None. Server-side Supabase client uses same auth context. `measurement_rating_coverage_v` is `security_invoker=true` — caller's RLS applies.
- **Exit ramp:** If a BFF endpoint is later needed (e.g., pit dashboard call volume exceeds threshold), the prefetch calls in page.tsx can be swapped to a single fetch without touching client hooks — HydrationBoundary is agnostic to how the cache was populated.

### Option B: BFF Summary Endpoint + RSC Prefetch (Consolidated)

Create a new `GET /api/v1/pit-dashboard/summary` route handler that consolidates tables + stats + gaming day into one HTTP response. Prefetch that single endpoint server-side.

- **Pros:** Single round trip from server to database. Clean BFF pattern — one contract for initial load.
- **Cons / risks:** New route handler + new DTO = more code to maintain. Violates OE-01 ("don't create abstractions for one-time operations" — the pit dashboard is the only consumer). Breaks independent cache invalidation — can't invalidate just tables without also invalidating stats. Adds complexity without proven need — the 3 parallel queries are already fast (<100ms each for single-casino scope).
- **Cost / complexity:** Medium. New route handler, DTO, schema, tests. More code than Option A for no proven latency benefit.
- **Security posture impact:** Same — route handler uses `withServerAction` middleware.
- **Exit ramp:** Same as A — HydrationBoundary doesn't care about the source.

## 6) Decision to make (explicit)

- **Decision:** Option A (RSC Prefetch over Existing Queries) or Option B (BFF Summary Endpoint)?
- **Decision drivers:**
  - YAGNI: The pit dashboard is single-casino scoped. 3 parallel queries on Supabase are fast. A BFF endpoint consolidation is premature.
  - OE-01: "Don't create helpers or abstractions for one-time operations." The pit dashboard is the only consumer of this aggregation shape.
  - Proven pattern: Shift Dashboard V3 uses exactly Option A and it's production-proven.
  - Cache granularity: Option A preserves independent invalidation per query scope (tables, stats, gaming day). Option B loses this.
- **Recommendation:** Option A. The Shift Dashboard V3 proves this pattern works. 3 parallel prefetches are simpler, preserve cache granularity, and add no new code surface. A BFF endpoint earns its way in later *only if* call volume or latency data justifies consolidation (GOV-PAT-003 §4 Q2 threshold: >100 calls/day + 3+ contexts + latency-sensitive).

## 7) Open questions / unknowns

- **Metric provenance rule:** Any truth-bearing metric shown on the pit dashboard must map to an existing MEAS-* row or trigger a governed matrix amendment before implementation. If the analytics panel is limited to `rated_ratio` / `untracked_seconds` from `measurement_rating_coverage_v`, MEAS-003 is sufficient. If additional metrics such as Win/Loss, Handle, Avg Session, or Active Players remain visible as operational truth, provenance coverage must be explicitly resolved before approval.
- **Promo exposure prefetch:** Defer. It is secondary to the first-paint objective and may remain client-fetched unless later user evidence justifies inclusion.
- **Active client root verification:** `page.tsx` currently renders `PitPanelsDashboardLayout` → `PitPanelsClient`. Treat this as the implementation target. `pit-dashboard-client.tsx` is presumed legacy and out of scope unless required to eliminate ambiguity.

## 8) Definition of Done (thin)

- [ ] Decision recorded: Option A approved
- [ ] Active pit dashboard client root verified before implementation
- [ ] Surface Classification Declaration produced with all 4 mandatory fields
- [ ] `page.tsx` refactored with RSC prefetch + `HydrationBoundary` for **tables, stats, and gaming day**
- [ ] Client hooks for primary initial-load queries hydrate from server cache on first render
- [ ] Analytics panel mock data replaced only with governed measurement-backed metrics, or provenance matrix amended before ship
- [ ] Realtime subscriptions, promo exposure, and interaction-driven slip detail remain behaviorally unchanged unless explicitly pulled into scope
- [ ] No new BFF endpoint, DTO contract, RPC, schema object, or infra component introduced
- [ ] Hardening Slice Manifest updated (Slice 3 → Complete)

## Links

- Feature Boundary: `docs/20-architecture/specs/hardening-slice-3/FEATURE_BOUNDARY.md`
- Context Summary: `docs/00-vision/PT-ARCH-MAP/SLICE-3-CONTEXT-SUMMARY.md`
- Design Brief/RFC: (Phase 2)
- ADR(s): (Phase 4 — likely no new ADR; governed by existing ADR-041)
- PRD: (Phase 5)
- Parent: `docs/00-vision/PT-ARCH-MAP/STANDARDS-FOUNDATION.md` §Slice 3
- Surface Classification Standard: `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`
- Metric Provenance Matrix: `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`
- Reference Exemplar: `app/(protected)/shift-dashboard/page.tsx` (Shift Dashboard V3 RSC pattern)
- Hardening Report: `docs/00-vision/strategic-hardening/HARDENING_REPORT_2026-03-08 .md`

> **Administrative note:** This scaffold and all supporting artifacts are **Slice 3** artifacts. Slice 2 (Shift Dashboard Provenance Alignment) remains independently schedulable and is underway on a parallel worktree.

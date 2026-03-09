---
id: RFC-003
title: "Design Brief: Pit Dashboard RSC Refactor (Hardening Slice 3)"
owner: architect
status: Draft
date: 2026-03-09
affects:
  - app/(dashboard)/pit/page.tsx
  - hooks/dashboard/use-dashboard-tables.ts
  - hooks/dashboard/use-dashboard-stats.ts
  - components/pit-panels/pit-panels-client.tsx
  - components/pit-panels/analytics-panel.tsx
---

# Design Brief / RFC: Pit Dashboard RSC Refactor

## 1) Context

- **Problem:** The pit dashboard is a client shell. Server component does auth only, then delegates everything to `PitPanelsClient`. All data (tables, stats, gaming day) fetches client-side, producing a loading waterfall on every navigation. The analytics panel shows hardcoded mock metrics.
- **Forces/constraints:**
  - Surface Classification Standard (ADR-041) requires governed surfaces to declare rendering delivery + data aggregation patterns
  - Shift Dashboard V3 and EXEC-046 Reports page both prove the RSC Prefetch + Hydration pattern at production quality
  - The pit dashboard already has optimized RPCs (PERF-002: stats 4->1, ISSUE-DD2C45CA: tables 8->1) — the remaining problem is *delivery*, not *query efficiency*
  - `measurement_rating_coverage_v` is live and queryable but no pit UI consumes it
- **Prior art:**
  - Shift Dashboard V3 (`app/(protected)/shift-dashboard/page.tsx`) — 3-query `Promise.allSettled` + `dehydrate` + `HydrationBoundary`
  - EXEC-046 Reports page (`app/(dashboard)/admin/reports/page.tsx`) — single BFF prefetch + `HydrationBoundary`

## 2) Scope & Goals

- **In scope:**
  - RSC prefetch for tables, stats, gaming day in `pit/page.tsx`
  - HydrationBoundary wrapping `PitPanelsClient`
  - Extract inline fetch functions from hooks to importable service functions
  - Wire `measurement_rating_coverage_v` into analytics panel (replace mock data)
  - Surface Classification Declaration (governance artifact)
- **Out of scope:**
  - UI layout changes, visual redesign
  - New BFF endpoints or RPCs
  - Mutation path changes (slip pause/resume/close, player move)
  - Promo exposure prefetch (secondary, deferred)
  - Realtime subscription changes (inherently client-side)
  - Legacy `pit-dashboard-client.tsx` cleanup
- **Success criteria:**
  - Primary queries (tables, stats, gaming day) hydrate from server cache on first render
  - Analytics panel renders live `rated_ratio` / `untracked_seconds` per table
  - Surface Classification Declaration passes all 4 mandatory fields

## 3) Proposed Direction (overview)

Apply the Shift Dashboard V3 pattern to the pit dashboard. Extract inline fetch functions from `useDashboardTables` and `useDashboardStats` hooks into importable service functions. Use the authenticated server-side Supabase client (already created in `page.tsx` for auth context) to call these RPCs server-side. Wrap `PitPanelsDashboardLayout` with `HydrationBoundary` so client hooks hydrate from server-seeded cache. Add a `useTableCoverage` hook consuming `measurement_rating_coverage_v` and wire it into the analytics panel.

## 4) Detailed Design

### 4.1 Data model changes

None. Zero schema changes.

### 4.2 Service layer

**Extraction required.** Two fetch functions are currently inline in hooks and must be extracted:

| Current Location | Current Pattern | Extraction Target | Signature |
|-----------------|----------------|-------------------|-----------|
| `hooks/dashboard/use-dashboard-tables.ts` (inline) | `createBrowserComponentClient().rpc(...)` | `hooks/dashboard/http.ts` | `fetchDashboardTables(supabase: SupabaseClient, casinoId: string): Promise<DashboardTableDTO[]>` |
| `hooks/dashboard/use-dashboard-stats.ts` (inline) | `createBrowserComponentClient().rpc(...)` | `hooks/dashboard/http.ts` | `fetchDashboardStats(supabase: SupabaseClient): Promise<DashboardStats>` |

**Already exported (no extraction needed):**
- `getGamingDay()` from `services/casino/http.ts` — uses HTTP endpoint, works server-side

**New hook for coverage data:**
- `useTableCoverage(casinoId)` — queries `measurement_rating_coverage_v` via Supabase client, returns per-table `rated_ratio`, `untracked_seconds`, `coverage_tier`

**Extraction pattern:** The extracted functions accept a `SupabaseClient` parameter rather than creating their own. This allows both:
- Client hooks to pass `createBrowserComponentClient()` (existing behavior)
- RSC prefetch to pass `await createClient()` (server-side, authenticated)

### 4.3 API surface

No new API routes. Existing RPCs called server-side via authenticated Supabase client.

### 4.4 UI/UX flow

**Before (current):**
```
Server: auth context → casinoId
Client: PitPanelsClient mounts → 5 parallel hooks fire → loading skeletons → data renders
```

**After:**
```
Server: auth context → casinoId → prefetch tables + stats + gaming day → dehydrate
Client: PitPanelsClient mounts → hooks hydrate from cache → data renders immediately
        → realtime subscription starts → promo exposure fetches (secondary)
        → table selection → slips fetch (interaction-driven)
```

**Analytics panel change:**
- Current: hardcoded mock metrics (Win/Loss, Handle, Avg Session, Active Players)
- After: live per-table coverage from `measurement_rating_coverage_v` (rated seconds, untracked seconds, coverage tier)
- Mock metrics that are not backed by governed measurement data are either removed or explicitly labeled as placeholders

### 4.5 Security considerations

- **RLS impact:** None. Server-side Supabase client inherits the authenticated user's RLS context. RPCs call `set_rls_context_from_staff()` per ADR-024 — same execution path as client-side.
- **RBAC requirements:** No change. Pit dashboard is accessible to `pit_boss` and `admin` roles (existing).
- **Audit trail:** No change. RPCs produce same audit trail regardless of client-side or server-side invocation.
- **`measurement_rating_coverage_v`:** Uses `security_invoker=true` — caller's casino-scoped RLS applies to all source tables. No new security surface.

## 5) Cross-Cutting Concerns

- **Performance implications:**
  - Initial paint improves: 3 queries run server-side in parallel before first render
  - No additional round trips — same queries, different execution location
  - `Promise.allSettled` prevents one failure from blocking the page
  - Client hooks still have `staleTime: 30_000` — background refetch unchanged
- **Migration strategy:** None needed. No database or schema changes.
- **Observability / monitoring:** No change. Server-side RPC calls produce same Supabase logs.
- **Rollback plan:** Revert `page.tsx` to current version (remove `QueryClient`, `dehydrate`, `HydrationBoundary` wrapper). Client hooks fall back to self-fetching with loading states. Zero data path changes.

## 6) Alternatives Considered

### Alternative A: BFF Summary Endpoint

- **Description:** Create `GET /api/v1/pit-dashboard/summary` that consolidates tables + stats + gaming day into one response
- **Tradeoffs:** Single round trip vs. 3 parallel queries. But adds new route handler, DTO, schema, tests. Only one consumer (pit dashboard).
- **Why not chosen:** Violates OE-01 (no abstractions for one-time operations). Breaks independent cache invalidation. 3 parallel RPCs on single-casino scope are fast (<100ms each). BFF consolidation earns its way in when call volume exceeds GOV-PAT-003 §4 Q2 threshold.

### Alternative B: Server Action Data Fetching

- **Description:** Use Next.js Server Actions instead of RSC prefetch + TanStack Query dehydration
- **Tradeoffs:** Server Actions are designed for mutations, not initial data loading. Would not integrate with existing TanStack Query cache without manual hydration. No precedent in codebase.
- **Why not chosen:** RSC prefetch + HydrationBoundary is the established pattern (Shift Dashboard V3, EXEC-046). Server Actions are for mutations (per Edge Transport Policy).

## 7) Decisions Required

1. **Decision:** Fetch function extraction approach
   **Options:** A) Extract to `hooks/dashboard/http.ts` (co-located with hooks) | B) Extract to `services/dashboard/` (new service directory)
   **Recommendation:** A — co-locate with hooks. There is no "dashboard service" in the SRM. These are query-side functions, not service-layer operations. Follows the pattern of `hooks/shift-dashboard/http.ts` and `hooks/measurement/http.ts`.

2. **Decision:** Analytics panel metric scope
   **Options:** A) Replace all mock metrics with measurement-backed data | B) Replace only what MEAS-003 covers, label remaining as placeholders
   **Recommendation:** B — wire `rated_ratio` / `untracked_seconds` from `measurement_rating_coverage_v` (MEAS-003) as governed operational truth. Win/Loss, Handle, Avg Session, and Active Players must remain explicitly labeled as placeholders / non-authoritative in this slice. If a future slice promotes any of them to operational truth on this surface, the Metric Provenance Matrix must be amended with new MEAS-* rows before that promotion — regardless of whether the metric is single-context or cross-context. The governance standard governs truth *presentation*, not source topology.

## 8) Implementation Prerequisites

- **Active client root verified:** `page.tsx` renders `PitPanelsDashboardLayout` → `PitPanelsClient`. This is the confirmed implementation target. Legacy `pit-dashboard-client.tsx` is out of scope. This must be re-verified against HEAD before any code changes begin.

## 9) Open Questions

- **Auth context in RSC prefetch:** The pit `page.tsx` already creates a server Supabase client and resolves auth context. The extracted fetch functions receive this client. Should the `QueryClient` prefetch calls share the same Supabase instance, or create fresh ones? **Recommendation:** Share the authenticated instance — avoids multiple auth lookups.

## Links

- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-003-hardening-slice-3-pit-refactor.md`
- Feature Boundary: `docs/20-architecture/specs/hardening-slice-3/FEATURE_BOUNDARY.md`
- ADR(s): ADR-041 (Surface Governance Standard — governing), no new ADR expected
- PRD: (Phase 5)

## References

- Shift Dashboard V3 RSC: `app/(protected)/shift-dashboard/page.tsx`
- EXEC-046 Reports RSC: `app/(dashboard)/admin/reports/page.tsx`
- Surface Classification Standard: `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`
- Metric Provenance Matrix: `docs/70-governance/METRIC_PROVENANCE_MATRIX.md`
- Over-Engineering Guardrail: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- Hardening Report: `docs/00-vision/strategic-hardening/HARDENING_REPORT_2026-03-08 .md`

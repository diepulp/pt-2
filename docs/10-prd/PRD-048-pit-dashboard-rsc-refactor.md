---
id: PRD-048
title: "Hardening Slice 3 — Pit Dashboard RSC Refactor"
owner: Lead Architect
status: Approved
affects: [RFC-003, SCAFFOLD-003, ADR-041, SEC-NOTE-SLICE-3]
created: 2026-03-09
last_review: 2026-03-09
phase: "Hardening Slice 3"
pattern: A
http_boundary: false
scaffold_ref: docs/01-scaffolds/SCAFFOLD-003-hardening-slice-3-pit-refactor.md
adr_refs: [ADR-041, ADR-024, ADR-015]
---

# PRD-048 — Pit Dashboard RSC Refactor

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Approved
- **Summary:** Convert the pit dashboard from a client shell (5-6 round trips, no server prefetch) to a governed surface with RSC prefetch + HydrationBoundary for primary initial-load queries, and wire live measurement coverage data into the analytics panel. Zero schema changes. This is Hardening Slice 3 — proving the Surface Classification Standard works for refactoring existing surfaces, not just building new ones.
- **Source-of-truth relationship:** RFC-003 remains the locked design baseline. This PRD translates that baseline into workstreams, acceptance criteria, and sequencing. Any deviation from RFC-003 must be recorded as a delta in version history.

---

## 2. Problem & Goals

### 2.1 Problem

The pit dashboard is the primary operational interface for pit bosses, but its data delivery is ungoverned. The server component performs auth only, then delegates all data fetching to client-side hooks — producing a loading waterfall on every navigation. The analytics panel shows hardcoded mock metrics with no connection to the measurement layer. Despite prior RPC consolidation (PERF-002, ISSUE-DD2C45CA), the rendering delivery pattern has never been formalized under the Surface Classification Standard.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Eliminate client loading waterfall for primary queries | Tables, stats, and gaming day render on first paint from server-prefetched cache |
| **G2**: Analytics panel shows governed measurement data | `rated_ratio` and `untracked_seconds` per table from `measurement_rating_coverage_v` (MEAS-003) replace mock data |
| **G3**: Surface Classification compliance | Declaration produced with all 4 mandatory fields per ADR-041; passes review |
| **G4**: Existing behavior preserved | Mutations, realtime subscriptions, and interaction-driven fetches remain functionally unchanged |

### 2.3 Non-Goals

- Visual/UI redesign of the pit dashboard
- New BFF RPCs, summary endpoints, or route handlers
- New database tables, views, or migrations
- Promo exposure prefetch (secondary panel, deferred)
- Slip Detail audit trace panel (separate scope)
- No planned provenance framework expansion beyond **MEAS-003** in this slice. If any additional metric is promoted to operational truth beyond the coverage data, the Metric Provenance Matrix must be amended before ship.
- Observability or E2E improvements (Hardening Areas 2-3)
- Legacy `pit-dashboard-client.tsx` cleanup
- Performance benchmarking harness (defer to live DB)

---

## 3. Users & Use Cases

- **Primary user:** Pit Boss (`pit_boss` role) — monitors table operations, player activity, and rating coverage in real time
- **Secondary user:** Admin (`admin` role) — same access, typically reviewing operational metrics

**Top Jobs:**

- As a **pit boss**, I navigate to the pit dashboard and see hydrated **primary initial-load data** (tables, stats, gaming day) immediately on first render, so I can act on operational state without waiting for a client-side loading waterfall.
- As a **pit boss**, I view the analytics panel to see live per-table rating coverage (`rated_ratio`, `untracked_seconds`) so I can identify tables with untracked player time.
- As a **pit boss**, I select a table and see active slips load on demand while the rest of the dashboard remains populated.

---

## 4. Scope & Feature List

### 4.0 Implementation Precondition

> **Implementation precondition:** Verify that `app/(dashboard)/pit/page.tsx` renders `PitPanelsDashboardLayout` → `PitPanelsClient` as the active path before WS1 begins. Legacy `pit-dashboard-client.tsx` cleanup remains out of scope unless required to remove implementation ambiguity.

### 4.1 In Scope

**Fetch Function Extraction (prerequisite):**
- Extract inline `queryFn` from `useDashboardTables` to importable function in `hooks/dashboard/http.ts`
- Extract inline `queryFn` from `useDashboardStats` to importable function in `hooks/dashboard/http.ts`
- Both extracted functions accept `SupabaseClient` parameter (server/client agnostic)
- Existing hooks refactored to call extracted functions (no behavioral change)

**RSC Prefetch + HydrationBoundary:**
- Refactor `app/(dashboard)/pit/page.tsx` to create `QueryClient`, prefetch 3 primary queries via `Promise.allSettled`, wrap client component with `HydrationBoundary`
- Prefetched queries: `dashboardKeys.tables(casinoId)`, `dashboardKeys.stats(casinoId)`, `casinoKeys.gamingDay()`
- Client hooks hydrate from dehydrated server cache on first render
- Graceful degradation: failed prefetch falls back to client-side fetch (same as Shift Dashboard V3)

**Coverage Data Wiring:**
- New `useTableCoverage(casinoId)` hook querying `measurement_rating_coverage_v`
- Wire into analytics panel, replacing mock metrics with live `rated_ratio`, `untracked_seconds`, `coverage_tier` per table
- Remaining non-coverage mock metrics (Win/Loss, Handle, Avg Session, Active Players) explicitly marked as placeholders
- Placeholder metrics retain their current visual slots but must be clearly non-authoritative in copy/treatment (e.g. "Placeholder" or "Coming Soon") so they are not interpreted as operational truth
- Coverage data is wired into the analytics panel in this slice, but `useTableCoverage(casinoId)` is **not** part of the WS2 primary-query prefetch set unless later approved by explicit scope change

**Governance:**
- Surface Classification Declaration for pit dashboard (all 4 mandatory fields)
- Hardening Slice Manifest update (Slice 3 -> Complete)

### 4.2 Out of Scope

See §2.3 Non-Goals.

---

## 5. Workstreams

### WS1: Fetch Function Extraction

**Goal:** Make dashboard query functions callable from both client hooks and RSC prefetch.

**Deliverables:**
- `hooks/dashboard/http.ts` with `fetchDashboardTables(supabase, casinoId)` and `fetchDashboardStats(supabase)`
- `useDashboardTables` refactored to call extracted function
- `useDashboardStats` refactored to call extracted function
- Existing hook behavior unchanged (unit test parity)

**Acceptance Criteria:**
- AC-1: `fetchDashboardTables` accepts `SupabaseClient` and returns `DashboardTableDTO[]`
- AC-2: `fetchDashboardStats` accepts `SupabaseClient` and returns `DashboardStats`
- AC-3: Both functions work with server-side Supabase client (`createClient()`)
- AC-4: Extracted functions preserve query-key compatibility, return-shape compatibility, and current error/null/fallback semantics of the inline originals; existing hook tests pass without modification

### WS2: RSC Prefetch + HydrationBoundary

**Goal:** Server-side prefetch of primary queries with hydration handoff to client hooks.

**Deliverables:**
- Refactored `app/(dashboard)/pit/page.tsx`
- `QueryClient` with `staleTime: 30_000`
- `Promise.allSettled` for 3 prefetch calls
- `HydrationBoundary` wrapping `PitPanelsDashboardLayout`

**Acceptance Criteria:**
- AC-5: `page.tsx` prefetches tables, stats, and gaming day server-side
- AC-6: `Promise.allSettled` prevents single query failure from blocking page
- AC-7: Dynamic rendering is enabled for `page.tsx`, and the prefetch path uses per-request auth resolution, per-request Supabase client creation, and per-request `QueryClient` to avoid cross-request or cross-casino cache contamination
- AC-8: Client hooks hydrate from server cache (no loading state on first render for primary queries)
- AC-9: Auth guard executes before any prefetch call (existing redirect behavior preserved)

### WS3: Coverage Data Wiring

**Goal:** Replace mock analytics with governed measurement data.

**Deliverables:**
- `hooks/dashboard/use-table-coverage.ts` — queries `measurement_rating_coverage_v`
- Analytics panel component updated to render live coverage data
- Remaining mock metrics visually labeled as placeholders

**Acceptance Criteria:**
- AC-10: `useTableCoverage(casinoId)` returns per-table `rated_ratio`, `untracked_seconds`, `coverage_tier`
- AC-11: Analytics panel renders live coverage data from `measurement_rating_coverage_v`
- AC-12: Non-coverage mock metrics explicitly labeled as "Placeholder" or equivalent
- AC-13: Coverage data governed by MEAS-003 provenance declaration

### WS4: Surface Classification Declaration + Manifest

**Goal:** Governance compliance artifact proving the standard works for refactored surfaces.

**Deliverables:**
- Surface Classification Declaration (markdown, in spec directory or governance examples)
- Hardening Slice Manifest updated (Slice 3 -> Complete with artifacts)

**Acceptance Criteria:**
- AC-14: Declaration includes Rendering Delivery (RSC Prefetch + Hydration)
- AC-15: Declaration includes Data Aggregation (Simple Query — existing RPCs, no BFF)
- AC-16: Declaration includes Rejected Patterns with rationale citing §4 clauses
- AC-17: Declaration includes Metric Provenance (MEAS-003 for coverage data)
- AC-18: Hardening Slice Manifest Slice 3 row updated to Complete

---

## 6. Workstream Sequencing

```
WS1 (Fetch Extraction)  ──────►  WS2 (RSC Prefetch)
                                      │
WS3 (Coverage Wiring)   ──────►──────┤  (independent of WS1/WS2)
                                      │
                                  WS4 (Governance)  ──► done
```

- WS1 is prerequisite for WS2 (extracted functions needed for server-side calls)
- WS3 is independent — can run in parallel with WS1/WS2
- WS4 runs after WS2 and WS3 complete (declaration references implemented patterns)

---

## 7. Definition of Done

### Functional
- [ ] Primary queries (tables, stats, gaming day) hydrate from server cache on first render
- [ ] Analytics panel renders live `rated_ratio` / `untracked_seconds` from `measurement_rating_coverage_v`
- [ ] Non-coverage mock metrics explicitly labeled as placeholders
- [ ] Existing mutations (slip pause/resume/close, player move, table close) unchanged
- [ ] Realtime subscriptions unchanged
- [ ] Promo exposure, interaction-driven slips load client-side as before

### Security
- [ ] Auth guard executes before prefetch (no data without authentication)
- [ ] Dynamic rendering, together with per-request auth resolution, per-request Supabase client creation, and per-request `QueryClient`, prevents cross-request or cross-casino cache contamination
- [ ] Per-request `QueryClient` prevents cross-request state bleed
- [ ] `measurement_rating_coverage_v` accessed via `security_invoker=true` (caller's RLS applies)

### Governance
- [ ] Surface Classification Declaration produced with all 4 mandatory fields
- [ ] Rejected patterns documented with §4 clause citations
- [ ] MEAS-003 cited for coverage metric provenance
- [ ] Hardening Slice Manifest updated (Slice 3 -> Complete)

### Integrity
- [ ] No new BFF endpoint, RPC, migration, or schema object introduced
- [ ] Extracted fetch functions maintain query-key compatibility, return-shape compatibility, and current error/null/fallback semantics of the inline originals
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Server-prefetched data and client refetches diverge because server and browser Supabase clients resolve auth/session context differently | Low | Medium | Reuse the same authenticated request context on the server path, preserve query keys exactly, and validate parity with existing hook tests plus one implementation smoke path |
| HydrationBoundary mismatch between server and client cache keys | Medium | Low | Use identical query key shapes. Extract keys from `dashboardKeys` factory (already shared). |
| Analytics panel coverage data unavailable (empty view) | Low | Low | Graceful fallback — show "No coverage data" state. View exists and is queryable. |
| `Promise.allSettled` masks errors silently | Low | Low | Client hooks refetch on mount if server prefetch failed. Same pattern as Shift Dashboard V3. |

---

## 9. References

| Document | Path |
|----------|------|
| Feature Boundary | `docs/20-architecture/specs/hardening-slice-3/FEATURE_BOUNDARY.md` |
| Feature Scaffold | `docs/01-scaffolds/SCAFFOLD-003-hardening-slice-3-pit-refactor.md` |
| Design Brief (RFC-003) | `docs/02-design/RFC-003-pit-dashboard-rsc-refactor.md` |
| SEC Note | `docs/20-architecture/specs/hardening-slice-3/SEC_NOTE.md` |
| Context Summary | `docs/00-vision/PT-ARCH-MAP/SLICE-3-CONTEXT-SUMMARY.md` |
| Surface Classification Standard | `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` |
| Metric Provenance Matrix | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |
| Shift Dashboard V3 (exemplar) | `app/(protected)/shift-dashboard/page.tsx` |
| EXEC-046 Reports (exemplar) | `app/(dashboard)/admin/reports/page.tsx` |
| Hardening Slice Manifest | `docs/00-vision/PT-ARCH-MAP/HARDENING-SLICE-MANIFEST.md` |
| Hardening Report | `docs/00-vision/strategic-hardening/HARDENING_REPORT_2026-03-08.md` |

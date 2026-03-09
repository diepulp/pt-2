Here's the full context picture for **Slice 3 — Pit Dashboard Refactor**.

---

## Slice 3 Context Summary

### Mission

Apply the Surface Classification Standard to convert the Pit Dashboard from a **client shell** to a **governed surface**. This is the Hardening Area 1 payoff — proving the standard works for *refactoring existing surfaces*, not just building new ones.

### Prerequisites

| Slice | Status | Notes |
|-------|--------|-------|
| 0 — Standards Foundation | **Complete** | Surface Classification Standard + Metric Provenance Matrix shipped |
| 1 — Measurement UI | **Complete** | 4 widgets against 4 provenance rows |
| 2 — Shift Provenance | **In progress** | Parallel worktree (`trees/hardening-slice-0` on `hardening-slice-2`) |
| 3 — Pit Refactor | **This slice** | Independently schedulable after Slice 1 |

Slices 2 and 3 are independently schedulable after Slice 1. Slice 2 is underway in parallel.

---

### Current Pit Dashboard State (the problem)

**Route**: `app/(dashboard)/pit/page.tsx`
**Pattern**: Server component does auth only → delegates everything to client component

**5-6 client-side round trips on initial load:**

| # | Hook | Target | Pattern |
|---|------|--------|---------|
| 1 | `useDashboardTables` | `rpc_get_dashboard_tables_with_counts` | RPC |
| 2 | `useDashboardStats` | `rpc_get_dashboard_stats` | RPC |
| 3 | `useGamingDay` | `getGamingDay()` | HTTP |
| 4 | `useDashboardRealtime` | Supabase channel | Realtime subscription |
| 5 | `useDashboardPromoExposure` | `getPromoExposureRollup()` | HTTP |
| 6 | `useActiveSlipsForDashboard` | `listActiveForTableWithPlayer()` | RPC (on table select) |

**Already optimized** (PERF-002 + ISSUE-DD2C45CA): Stats 4→1 RPC, tables 8→1 RPC, player names embedded in slip DTO. The remaining problem is **no server prefetch** — pure client waterfall.

**Key files:**
- `app/(dashboard)/pit/page.tsx` — Server entry (auth only, no prefetch)
- `components/pit-panels/pit-panels-client.tsx` — Main client component
- `components/dashboard/pit-dashboard-client.tsx` — Alternative client view
- `hooks/dashboard/` — All query hooks (tables, stats, slips, realtime, promo)
- `store/pit-dashboard-store.ts` — Zustand UI state

---

### Governance Constraints (from Slice 0)

**Surface Classification Standard** (`docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`) requires 4 mandatory EXEC-SPEC fields:

1. **Rendering Delivery** — must select from: RSC Prefetch + Hydration, Client Shell, or Hybrid
2. **Data Aggregation** — must select from: BFF RPC, BFF Summary Endpoint, Simple Query, or Client-side Fetch
3. **Rejected Patterns** — ≥1 alternative per axis with rejection rationale citing §4 clauses
4. **Metric Provenance** — cite Truth IDs from Provenance Matrix with truth class + freshness

Missing any field = hard rejection.

**Metric Provenance Matrix** (`docs/70-governance/METRIC_PROVENANCE_MATRIX.md`) currently has MEAS-001 through MEAS-004. If Slice 3 displays truth-bearing metrics not in the matrix, new rows (MEAS-005+) must be added via governed amendment.

---

### Proven Pattern Exemplars

| Pattern | Reference Implementation | Relevance to Pit |
|---------|------------------------|-------------------|
| **RSC Prefetch + Hydration** | Shift Dashboard V3 (`app/(protected)/shift-dashboard/page.tsx`) — `Promise.allSettled` + `dehydrate` + `HydrationBoundary` | Primary refactor target — apply this to pit dashboard |
| **BFF RPC Aggregation** | Rating Slip Modal (`rpc_get_rating_slip_modal_data`) — 5 bounded contexts in 1 call | Consider if pit initial load warrants a combined RPC |
| **BFF Summary Endpoint** | Shift Dashboard Summary (`/api/v1/shift-dashboards/summary/`) | Alternative if HTTP route better fits |

---

### Bounded Contexts Involved (from SRM v4.18.0)

| Context | Tables | Pit Dashboard Use |
|---------|--------|-------------------|
| TableContextService | `table_session`, `table_fill`, `table_credit` | Table list, status, cash observations |
| RatingSlipService | `rating_slip`, `rating_slip_pause` | Active slips, player counts |
| CasinoService | `casino`, `staff`, `floor_pit` | Casino scope, pit metadata, gaming day |
| LoyaltyService | `player_loyalty`, `promo_program` | Promo exposure rollup |
| PlayerFinancialService | `player_financial_transaction` | Cash-in totals (via modal) |

---

### What Slice 3 Needs to Deliver

1. **Surface Classification Declaration** for the refactored pit dashboard (likely: RSC Prefetch + Hydration rendering, BFF RPC or Summary Endpoint aggregation)
2. **Server-side prefetch** in `page.tsx` — eliminate client waterfall for tables + stats + gaming day
3. **HydrationBoundary** wrapper — client hooks hydrate from server cache
4. **Provenance declarations** for any truth-bearing metrics the pit dashboard displays (extend matrix if needed)
5. **Manifest update** — Slice 3 → Complete with artifacts listed

### What It Does NOT Need to Do

- No new rendering or aggregation patterns (use proven palette)
- No observability or E2E improvements (those are Areas 2-3)
- No event bus or generic dispatcher (OE-01 guardrail)
- No pit dashboard redesign — this is a **refactor** of data delivery, not UI

---

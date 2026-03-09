# Feature Boundary Statement: Pit Dashboard Refactor (Hardening Slice 3)

> **Ownership Sentence:** This feature belongs to **Platform / Frontend** (rendering delivery) and **Measurement Layer** (coverage data wiring); it reads from **TableContextService**, **RatingSlipService**, **CasinoService**, **LoyaltyService**, and **measurement_rating_coverage_v**. No new tables or RPCs are introduced. Cross-context needs go through **existing DTOs and RPCs** already consumed by the pit dashboard.

---

## Feature Boundary Statement

- **Owner service(s):**
  - **Platform / Frontend** (ADR-035) — rendering delivery refactor: RSC prefetch, HydrationBoundary, server-side data seeding
  - **Measurement Layer** (ADR-039) — wiring `measurement_rating_coverage_v` into pit panels analytics (replacing mock data)

- **Writes:**
  - None new. Existing mutation RPCs remain unchanged:
    - `rpc_close_rating_slip`, `rpc_pause_rating_slip`, `rpc_resume_rating_slip` (RatingSlipService)
    - `rpc_move_player` (RatingSlipService)
    - `rpc_close_table_session`, `rpc_force_close_table_session` (TableContextService)

- **Reads:**
  - `gaming_table`, `table_session` (via `rpc_get_dashboard_tables_with_counts`)
  - `rating_slip` (via `rpc_get_dashboard_stats`, `listActiveForTableWithPlayer`)
  - `casino` (via `getGamingDay()`)
  - `player_loyalty`, `promo_program` (via `getPromoExposureRollup()`)
  - `measurement_rating_coverage_v` (new read — per-table coverage wiring)

- **Cross-context contracts:**
  - `DashboardTableDTO` — table list with slip counts (existing)
  - `DashboardStatsDTO` — aggregated KPIs (existing)
  - `ActiveSlipDTO` — slips with embedded player name (existing)
  - `MeasurementRatingCoverageDTO` — per-table rated/untracked seconds (new consumption of existing view)
  - `PromoExposureRollupDTO` — loyalty promo data (existing)

- **Non-goals (top 5):**
  1. New database tables, RPCs, or migrations — zero schema changes
  2. Pit dashboard UI redesign — this is a data delivery refactor, not a visual redesign
  3. New aggregation patterns — use proven palette only (RSC Prefetch, BFF RPC, Simple Query)
  4. Observability or E2E improvements — those are Hardening Areas 2-3
  5. Provenance framework expansion beyond ADR-039 metrics — Slice 2 handles shift metrics

- **DoD gates:** Functional / Security / Integrity / Operability

---

## Goal

Convert the pit dashboard from a client shell (5-6 round trips, no server prefetch) to a governed surface with RSC prefetch + HydrationBoundary, and wire live measurement coverage data into the analytics panel — proving the Surface Classification Standard works for refactoring existing surfaces.

## Primary Actor

**Pit Boss** (floor supervisor monitoring table operations, player activity, and rating coverage in real time)

## Primary Scenario

Pit boss navigates to the pit dashboard. Server prefetches tables, stats, and gaming day data in parallel. Page renders with populated data on first paint — no client loading waterfall. Analytics panel shows live per-table rating coverage from `measurement_rating_coverage_v` instead of mock data.

## Success Metric

Pit dashboard initial load eliminates client-side data waterfall: server prefetches 3+ queries via `Promise.allSettled` + `dehydrate`, client hydrates from cache. Analytics panel renders real `rated_ratio` / `untracked_seconds` per table from the measurement coverage view.

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **Feature Boundary** | Scope definition (this file) | `docs/20-architecture/specs/hardening-slice-3/FEATURE_BOUNDARY.md` |
| **Surface Classification Declaration** | Governance compliance (Slice 0 standard) | TBD (Phase 2/5) |
| **Hardening Slice Manifest** | Cross-slice status tracker | `docs/00-vision/PT-ARCH-MAP/HARDENING-SLICE-MANIFEST.md` |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.

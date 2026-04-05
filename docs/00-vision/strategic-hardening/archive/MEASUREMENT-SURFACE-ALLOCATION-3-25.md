The investigation reveals the March 2 doc is **massively stale** — most of its gaps have been filled. Here's the corrected picture:

---

## Measurement Surface Allocation — Current State (Mar 25)

The original doc identified 4 surfaces with varying readiness. Here's what actually exists now:

### Surface Status Matrix (Corrected)

| Surface | Doc Claim (Mar 2) | **Actual (Mar 25)** | Delta |
|---------|-------------------|---------------------|-------|
| **Shift Dashboard** — coverage widget | "READY — fill the slots" | **Slots exist** (`data-slot="theo-kpi"`, `"trending-charts"`, `"theo-sidebar"`). `CoverageWidget` (210 lines) already wired. Trust components (6 files, 474 lines) operational. | Partially filled |
| **Pit Terminal** — per-table metrics | "READY — add badge to tiles" | PendingSection markers exist. Per-table coverage not yet wired into grid tiles. | Unchanged |
| **Reports page** — loyalty liability | "GHOST NAV ONLY — everything must be built" | **FULLY FUNCTIONAL.** `MeasurementReportsDashboard` renders 4 metric widgets (Theo Discrepancy, Audit Correlation, Rating Coverage, Loyalty Liability). RSC with BFF prefetch. `services/measurement/` complete. | **Completely built** |
| **Slip Detail** — audit trace panel | "Modal extension needed — no tab infrastructure" | **BUILT.** `audit-trace-section.tsx` (287 lines) — collapsible section with lazy-fetch via `useAuditEventCorrelation()`. Displays slip → PFT → MTL → loyalty chain. | **Completely built** |

### Infrastructure Matrix (Corrected)

| Infrastructure | Doc Claim | **Actual** |
|---------------|-----------|-----------|
| Admin route group + layout | "Does not exist" | **EXISTS** — `app/(dashboard)/admin/layout.tsx` with RSC role guard (admin/pit_boss) |
| Admin role gating | "Not yet established" | **EXISTS** — direct staff table lookup, redirect to `/shift-dashboard?toast=admin_required` |
| `/admin/reports` route | "No route, no page, no components, no data layer" | **ALL EXIST** — RSC page + `MeasurementReportsDashboard` + 4 widgets + `services/measurement/` + hooks |
| `/admin/alerts` page | Existed | **Enhanced** — now dual-section (baseline + cash obs), acknowledge dialog, persist-on-mount |
| `/admin/settings/*` | Existed (thresholds + shifts) | **Enhanced** — added `/valuation` tab (PRD-053) |
| Measurement service layer | "Does not exist" | **EXISTS** — `services/measurement/` (dtos, mappers, queries, schemas, index) |
| Measurement hooks | "Does not exist" | **EXISTS** — `hooks/measurement/` (3 hooks + http + keys) |
| Sidebar nav | Ghost nav only | **FULLY WIRED** — alerts, reports, settings all functional |
| `measurement_audit_event_correlation_v` | Blocked (ADR-039 Phase 1) | **DEPLOYED** — `20260307115131` migration, `security_invoker=true` |
| `measurement_rating_coverage_v` | Blocked (ADR-038) | **DEPLOYED** — same migration, ghost/idle seconds = 0 (MVP placeholder) |
| Rating slip audit trace | "Must be built" | **BUILT** — collapsible section approach (287 lines) |

### What's Actually Still Missing

Only **3 genuine UI gaps** remain from the original allocation:

| Gap | Surface | Effort | Blocker |
|-----|---------|--------|---------|
| **Pit terminal per-table coverage overlay** | Table grid tiles in `/pit` | Small (badge/indicator on tiles) | None — `measurement_rating_coverage_v` deployed |
| **Shift dashboard slot fill** (theo-kpi, trending-charts) | Data-slot divs in ShiftDashboardV3 | Small (component + hook per slot) | None — slots + view exist |
| **Ghost/idle time accounting** | Coverage view | Small (populate placeholders) | ADR-038 table lifecycle finalization |

### Bottom Line for Admin Route Refactoring

The doc's §8 ("The `/admin` Route Was Never Built") and §9 (Open Questions about route paths, role gating) are **completely resolved**. For an admin route refactoring effort:

```
What exists and is STABLE:
  /admin/layout.tsx          — RSC role guard (admin/pit_boss)
  /admin/alerts/             — Dual-section alert management
  /admin/reports/            — 4-widget measurement dashboard
  /admin/settings/           — Tabbed (thresholds, shifts, valuation)
  /admin/loyalty/rewards/    — Reward catalog CRUD
  /admin/loyalty/promo-programs/  — Program catalog CRUD

What needs wiring (small):
  Pit terminal coverage badges
  Shift dashboard slot fills (theo-kpi, trending-charts, theo-sidebar)
  
What's architectural debt:
  ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md — §2, §4, §8-§11 stale
  MEASUREMENT_SURFACE_ALLOCATION_SUITABILITY.md — 80%+ stale
```

The original doc should be superseded. Want me to write a replacement that reflects ground truth, or mark it archived with a pointer to the hardening report?
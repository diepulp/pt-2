Good. Here's the verified dead code inventory:

## Dead Code Remediation Plan

### Verified Dead Code — 9,833 lines across 4 categories

**Category 1: Dead Dashboard Surface (1,571 LOC)**

Superseded by `pit-panels/`. No route imports these.

| File | Lines | Status |
|------|-------|--------|
| `components/dashboard/pit-dashboard-client.tsx` | 647 | DEAD — root |
| `components/dashboard/active-slips-panel.tsx` | 394 | DEAD — only imported by above |
| `components/dashboard/promo-exposure-panel.tsx` | 264 | DEAD — only imported by above |
| `components/dashboard/stats-bar.tsx` | 134 | DEAD — only imported by above |
| `components/dashboard/table-grid.tsx` | 132 | DEAD — only imported by above |

**KEEP**: `new-slip-modal.tsx` and `seat-context-menu.tsx` — shared with live `pit-panels-client.tsx`.

---

**Category 2: Duplicate/Legacy API Routes (717 LOC)**

| Directory | Lines | Status |
|-----------|-------|--------|
| `app/api/v1/casinos/` (3 routes + 3 tests) | 286 | DEAD — superseded by `/api/v1/casino/` (singular). No service layer calls the plural form. |
| `app/api/v1/finance/transactions/` (2 routes + 2 tests) | 431 | DEAD — labeled "Legacy" in tests. Superseded by `/api/v1/financial-transactions/`. |

---

**Category 3: Dev/Review/Prototype Pages (7,126 LOC) still required for reviews,largest but lowest urgency, dev-only pages - preserve**

No production navigation links to any of these. 11 pages across 4 directories:

| Directory | Pages | Lines | Notes |
|-----------|-------|-------|-------|
| `app/review/` | 7 pages + components | 6,504 | UI explorations (drawer patterns, shift dashboards, pit map, MTL form) |
| `app/prototype/` | 2 pages | 307 | TableLayoutTerminal demos |
| `app/(dev)/` | 1 page | 145 | Rating slip preview |
| `app/react-query-test/` | 1 page | 39 | Test harness |

---

**Category 4: Dead Lib Utilities (266 LOC)**

| File | Lines | Status |
|------|-------|--------|
| `lib/idempotency.ts` | 107 | DEAD — zero imports anywhere |
| `lib/rate-limiter.ts` | 159 | DEAD — zero imports (distinct from `lib/errors/rate-limiter.ts` which IS live) |

---

**Category 5: Example File (153 LOC)**

| File | Lines | Status |
|------|-------|--------|
| `components/table/table-layout-terminal.example.tsx` | 153 | Not imported — dev reference only |

---

### Agent Findings Corrected

The Explore agent incorrectly flagged these as dead — they are **all LIVE**:
- `services/rating-slip-modal/` — used by 2 API routes + hooks + pit-panels-client
- `services/player360-dashboard/` — used by `app/(dashboard)/players/` route
- `services/player-timeline/` — used by `app/(dashboard)/players/[playerId]/timeline/` route

---

### Recommended Execution Order

1. **Category 1** (dashboard) — highest signal, directly triggered by this session
2. **Category 2** (duplicate APIs) — confusing surface, easy cleanup
3. **Category 4** (dead libs) — trivial, 2 files
4. **Category 5** (example) — optional, useful for dev reference
# GAP-API-CATALOGUE-STALENESS

**Severity**: P1
**Domain**: API/DATA, Governance
**Discovered**: 2026-02-20
**Status**: Open
**Affects**: ADR-007, `docs/25-api-data/API_SURFACE_MVP.md`, `docs/25-api-data/api-surface.openapi.yaml`

---

## Summary

The canonical API catalogue (`API_SURFACE_MVP.md`) and its lockstep OpenAPI spec (`api-surface.openapi.yaml`) are significantly stale. Of ~90 route handler files in `app/api/v1/`, only ~34 endpoints are documented. Eight documented endpoints have no corresponding route handler (ghost entries). Six entire domains are undocumented.

ADR-007 requires catalogue updates in the same PR as route changes. This invariant has been violated across multiple feature deliveries.

## Metrics

| Category | Count |
|----------|-------|
| Route files in code | 90 |
| Documented endpoints | ~42 |
| Routes missing from catalogue | ~65 endpoints (50+ route files) |
| Ghost entries (documented, not implemented) | 8 endpoints |
| Entirely undocumented domains | 6 |

## Ghost Entries (Documented but NOT implemented)

Remove or mark as planned/deferred:

| Documented Route | Notes |
|---|---|
| `POST /api/v1/visits/reward` | EXEC-VSE-001 typed creation — not implemented |
| `POST /api/v1/visits/gaming` | EXEC-VSE-001 typed creation — not implemented |
| `POST /api/v1/visits/ghost` | EXEC-VSE-001 typed creation — not implemented |
| `POST /api/v1/visits/{id}/convert-to-gaming` | EXEC-VSE-001 conversion — not implemented |
| `POST /api/v1/visits/{id}/end` | Code uses `PATCH .../close` instead — verb mismatch |
| `POST /api/v1/table-context/dealer-rotations` | Not implemented |
| `POST /api/v1/floor-layouts/{id}/submit` | Not implemented |
| `POST /api/v1/floor-layouts/{id}/approve` | Not implemented |

## Undocumented Domains (entire API surface missing)

### 1. Casino Singular Context (`/api/v1/casino`)

5 route files. Parallel namespace to documented `/api/v1/casinos/{id}` — represents current-context casino operations.

| Route | Methods |
|---|---|
| `/api/v1/casino` | GET, POST |
| `/api/v1/casino/[id]` | GET, PATCH, DELETE |
| `/api/v1/casino/settings` | GET, PATCH |
| `/api/v1/casino/gaming-day` | GET |
| `/api/v1/casino/staff` | GET, POST |

### 2. Tables (`/api/v1/tables`)

8 route files. Separate from `/api/v1/table-context/tables` documented in catalogue.

| Route | Methods |
|---|---|
| `/api/v1/tables` | GET |
| `/api/v1/tables/[tableId]` | GET |
| `/api/v1/tables/[tableId]/activate` | POST |
| `/api/v1/tables/[tableId]/deactivate` | POST |
| `/api/v1/tables/[tableId]/close` | POST |
| `/api/v1/tables/[tableId]/current-session` | GET |
| `/api/v1/tables/[tableId]/dealer` | POST, DELETE |
| `/api/v1/tables/[tableId]/settings` | GET, PATCH |

### 3. Table Sessions (`/api/v1/table-sessions`)

3 route files.

| Route | Methods |
|---|---|
| `/api/v1/table-sessions` | POST |
| `/api/v1/table-sessions/[id]/close` | PATCH |
| `/api/v1/table-sessions/[id]/rundown` | PATCH |

### 4. Rewards (`/api/v1/rewards`)

4 route files.

| Route | Methods |
|---|---|
| `/api/v1/rewards` | GET, POST |
| `/api/v1/rewards/[id]` | GET, PATCH |
| `/api/v1/rewards/earn-config` | GET, PUT |
| `/api/v1/rewards/eligible` | GET |

### 5. Promo Programs (`/api/v1/promo-programs`)

2 route files.

| Route | Methods |
|---|---|
| `/api/v1/promo-programs` | GET, POST |
| `/api/v1/promo-programs/[id]` | GET, PATCH |

### 6. Promo Coupons (`/api/v1/promo-coupons`)

4 route files.

| Route | Methods |
|---|---|
| `/api/v1/promo-coupons` | GET, POST |
| `/api/v1/promo-coupons/[id]` | GET |
| `/api/v1/promo-coupons/[id]/void` | POST |
| `/api/v1/promo-coupons/[id]/replace` | POST |

### 7. Shift Dashboards (`/api/v1/shift-dashboards`)

10 route files.

| Route | Methods |
|---|---|
| `/api/v1/shift-dashboards/summary` | GET |
| `/api/v1/shift-dashboards/visitors-summary` | GET |
| `/api/v1/shift-dashboards/metrics/casino` | GET |
| `/api/v1/shift-dashboards/metrics/pits` | GET |
| `/api/v1/shift-dashboards/metrics/tables` | GET |
| `/api/v1/shift-dashboards/cash-observations/casino` | GET |
| `/api/v1/shift-dashboards/cash-observations/pits` | GET |
| `/api/v1/shift-dashboards/cash-observations/tables` | GET |
| `/api/v1/shift-dashboards/cash-observations/alerts` | GET |
| `/api/v1/shift-dashboards/cash-observations/summary` | GET |

### 8. Financial Transactions (`/api/v1/financial-transactions`)

2 route files. Parallel namespace to documented `/api/v1/finance/transactions`.

| Route | Methods |
|---|---|
| `/api/v1/financial-transactions` | GET, POST |
| `/api/v1/financial-transactions/[id]` | GET |

## Undocumented Sub-routes on Existing Domains

### Players (5 missing sub-routes)

| Route | Methods |
|---|---|
| `/api/v1/players/[playerId]/enrollment` | GET |
| `/api/v1/players/[playerId]/enroll` | POST |
| `/api/v1/players/[playerId]/identity` | GET, POST |
| `/api/v1/players/[playerId]/loyalty` | GET |
| `/api/v1/players/[playerId]/recent-sessions` | GET |

### Visits (5 missing)

| Route | Methods | Notes |
|---|---|---|
| `/api/v1/visits/active` | GET | |
| `/api/v1/visits/start-from-previous` | POST | |
| `/api/v1/visits/[visitId]/close` | PATCH | Replaces documented `POST .../end` |
| `/api/v1/visits/[visitId]/live-view` | GET | |
| `/api/v1/visits/[visitId]/financial-summary` | GET | |

### Rating Slips (9 missing)

| Route | Methods |
|---|---|
| `/api/v1/rating-slips` | GET |
| `/api/v1/rating-slips/[id]` | GET |
| `/api/v1/rating-slips/active-players` | GET |
| `/api/v1/rating-slips/closed-today` | GET |
| `/api/v1/rating-slips/[id]/average-bet` | PATCH |
| `/api/v1/rating-slips/[id]/duration` | GET |
| `/api/v1/rating-slips/[id]/modal-data` | GET |
| `/api/v1/rating-slips/[id]/move` | POST |
| `/api/v1/rating-slips/[id]/pause` | POST |
| `/api/v1/rating-slips/[id]/resume` | POST |

### Table Context (6 missing — GET + confirm/acknowledge actions)

| Route | Methods |
|---|---|
| `/api/v1/table-context/fills` | GET |
| `/api/v1/table-context/fills/[id]/confirm` | PATCH |
| `/api/v1/table-context/credits` | GET |
| `/api/v1/table-context/credits/[id]/confirm` | PATCH |
| `/api/v1/table-context/drop-events` | GET |
| `/api/v1/table-context/drop-events/[id]/acknowledge` | PATCH |

### Loyalty (5 missing)

| Route | Methods |
|---|---|
| `/api/v1/loyalty/accrue` | POST |
| `/api/v1/loyalty/redeem` | POST |
| `/api/v1/loyalty/manual-credit` | POST |
| `/api/v1/loyalty/promotion` | POST |
| `/api/v1/loyalty/suggestion` | GET |

### MTL (1 missing)

| Route | Methods |
|---|---|
| `/api/v1/mtl/gaming-day-summary` | GET |

## Structural Issues

1. **Dual casino namespace**: `/api/v1/casino` (singular, current-context) vs `/api/v1/casinos` (plural, by-ID). Catalogue only documents the plural form. Decision needed: document both, or consolidate.
2. **Dual finance namespace**: `/api/v1/finance/transactions` vs `/api/v1/financial-transactions`. Likely one supersedes the other. Decision needed: which is canonical, deprecate the other.
3. **Visit close verb mismatch**: Catalogue says `POST /visits/{id}/end`, code uses `PATCH /visits/{id}/close`. Update catalogue to match implementation.

## Patch Delta (Minimal Remediation)

1. **Remove 8 ghost entries** from catalogue or mark as `status: planned` with target PRD reference.
2. **Fix visit close verb**: Update `POST .../end` to `PATCH .../close` in catalogue and OpenAPI.
3. **Add 6 undocumented domains**: Tables, Table Sessions, Rewards, Promo Programs, Promo Coupons, Shift Dashboards.
4. **Add casino singular context** with a note explaining the dual-namespace pattern.
5. **Add missing sub-routes** for Players (5), Visits (5), Rating Slips (9), Table Context (6), Loyalty (5), MTL (1).
6. **Resolve dual finance namespace**: Decide canonical path, document it, deprecate the other.
7. **Update OpenAPI spec** to match all catalogue changes (ADR-007 lockstep requirement).
8. **Run `npm run openapi:validate`** after OpenAPI updates to confirm spec integrity.

## Recommended Execution

This is a documentation-only task (no code changes). Recommend batching by domain:

- **Batch 1**: Ghost entry cleanup + visit verb fix + structural decisions (casino, finance namespaces)
- **Batch 2**: Add undocumented domains (Tables, Table Sessions, Shift Dashboards, Rewards, Promos)
- **Batch 3**: Add missing sub-routes on existing domains (Players, Visits, Rating Slips, Table Context, Loyalty, MTL)
- **Batch 4**: OpenAPI spec sync + validation

Each batch should be a single PR per ADR-007 governance.

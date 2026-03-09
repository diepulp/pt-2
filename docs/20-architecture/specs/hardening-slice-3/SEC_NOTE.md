# SEC Note: Pit Dashboard RSC Refactor (Hardening Slice 3)

**Feature:** hardening-slice-3
**Date:** 2026-03-09
**Author:** Architect
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Table operational state (counts, status) | Operational | Casino-scoped business intelligence; competitor exposure risk |
| Rating slip aggregates (active counts, stats) | Financial | Derived from rating slip data containing player financial activity |
| Player names (embedded in slip DTOs) | PII | Visible in active slips panel; casino-scoped |
| Gaming day configuration | Operational | Shift boundaries affect financial reporting periods |
| Rating coverage metrics (`rated_ratio`, `untracked_seconds`) | Operational | Measurement layer data revealing operational telemetry quality |
| Promo exposure rollup | Financial | Loyalty program cost data; casino-scoped |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino data leakage via RSC prefetch | High | Low | P1 |
| T2: Dehydrated state exposure in HTML payload | Medium | Low | P2 |
| T3: Server-side auth bypass in prefetch path | High | Low | P1 |
| T4: Stale prefetch cache serving wrong casino's data | High | Very Low | P2 |

### Threat Details

**T1: Cross-casino data leakage via RSC prefetch**
- **Description:** Server prefetch queries return data for Casino B while rendering for a Casino A staff member
- **Attack vector:** Auth context mismatch between Supabase client creation and RPC execution; or casinoId derivation error in `getAuthContext()`
- **Impact:** Casino operational data exposed to unauthorized staff

**T2: Dehydrated state exposure in HTML payload**
- **Description:** `dehydrate(queryClient)` serializes query results into the HTML response as `__NEXT_DATA__` / RSC payload. This data is visible in page source.
- **Attack vector:** View page source or intercept HTTP response
- **Impact:** Same data that renders on-screen — no additional exposure beyond what the authenticated user already sees. Risk is informational, not escalation.

**T3: Server-side auth bypass in prefetch path**
- **Description:** RSC prefetch executes queries without proper auth validation, returning data to unauthenticated requests
- **Attack vector:** Direct navigation to `/pit` without valid session
- **Impact:** Dashboard data exposed without authentication

**T4: Stale prefetch cache serving wrong casino's data**
- **Description:** Next.js caches the RSC output and serves Casino A's prefetched data to Casino B's staff
- **Attack vector:** RSC caching at CDN or Next.js level
- **Impact:** Cross-casino data leakage

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | RLS casino scoping (ADR-024) | RPCs call `set_rls_context_from_staff()` — casino_id derived from JWT, not user-supplied |
| T1 | Authenticated Supabase client | `createClient()` server-side creates per-request authenticated client bound to user's JWT |
| T2 | No additional data exposure | Dehydrated state contains only what the authenticated user's RLS permits — same data rendered on screen |
| T3 | Auth guard in page.tsx | Existing `getAuthContext()` + `redirect('/signin')` executes before any prefetch. No auth = no queries. |
| T3 | `force-dynamic` export | Page cannot be statically generated; every request requires auth evaluation |
| T4 | `force-dynamic` + per-request QueryClient | `export const dynamic = 'force-dynamic'` prevents Next.js RSC caching. Fresh `new QueryClient()` per request prevents cross-request state bleed. |

### Control Details

**C1: RLS Casino Scoping (ADR-024)**
- **Type:** Preventive
- **Location:** Database (RLS policies + RPC context injection)
- **Enforcement:** Database
- **Tested by:** Existing RLS integration tests; SEC-007 security gates

**C2: Auth Guard Before Prefetch**
- **Type:** Preventive
- **Location:** Application (RSC page.tsx)
- **Enforcement:** Application — auth check executes before `QueryClient` is created
- **Tested by:** Manual verification; redirect behavior on unauthenticated access

**C3: Per-Request Isolation**
- **Type:** Preventive
- **Location:** Application (RSC page.tsx)
- **Enforcement:** Application — `new QueryClient()` + `force-dynamic` prevent cross-request contamination
- **Tested by:** Architectural pattern — same as Shift Dashboard V3 and EXEC-046 Reports page

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| No server-side request logging for prefetch queries | Supabase logs RPC calls regardless of client origin; no additional observability needed for MVP | If operational debugging requires distinguishing server-prefetch from client-fetch origin |
| Dehydrated payload visible in page source | Informational only — contains same data user sees on screen. No PII escalation. | If regulatory audit requires payload minimization |

---

## Data Storage Justification

No new data storage. This slice changes data *delivery* (server-side prefetch), not data *persistence*. All data sources are existing tables/views with established RLS policies.

---

## RLS Summary

No RLS changes. All existing policies remain in force. The refactor changes *where* queries execute (server vs. client), not *what* data they access. RLS enforcement is database-side and applies identically regardless of query origin.

| Surface | Query Target | RLS Mechanism |
|---------|-------------|---------------|
| Tables | `rpc_get_dashboard_tables_with_counts` | `set_rls_context_from_staff()` (ADR-024) |
| Stats | `rpc_get_dashboard_stats` | `set_rls_context_from_staff()` (ADR-024) |
| Gaming Day | `/api/v1/casino/gaming-day` | `withServerAction` middleware (ADR-024) |
| Coverage | `measurement_rating_coverage_v` | `security_invoker=true` — caller's Pattern C RLS (ADR-015) |

---

## Validation Gate

- [x] All assets classified
- [x] All threats have controls or explicit deferral
- [x] No new sensitive fields or data storage
- [x] RLS coverage unchanged — all CRUD operations governed by existing policies
- [x] No plaintext storage of secrets
- [x] `force-dynamic` prevents RSC caching (cross-casino contamination)
- [x] Auth guard executes before prefetch queries

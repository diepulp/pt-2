---
id: PRD-027
title: System Time & Gaming Day Standardization
owner: Lead Architect
status: Draft
version: v0.1
supersedes: PRD-027-temporal-standardization-v0
affects: [TEMP-001, TEMP-002, TEMP-003, ARCH-SRM, ADR-024]
created: 2026-02-02
last_review: 2026-02-02
phase: Phase 0 (Foundation Hardening)
pattern: B
http_boundary: true
---

# PRD-027 — System Time & Gaming Day Standardization

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** A P0 incident revealed that the Player 360 dashboard bypassed the canonical `compute_gaming_day` DB authority path and computed gaming day using UTC date math in JavaScript. After UTC midnight the UI queried a future gaming day with no data, showing $0 across all financial panels. The hotfix hardcoded the correct timezone and start hour, but the codebase still contains non-canonical temporal paths. This PRD standardizes all gaming day resolution to flow through the database, implements the RPCs specified in TEMP-003, adds CI enforcement gates, and delivers boundary/DST tests to prevent regression.

---

## 2. Problem & Goals

### 2.1 Problem

PT-2 defines a canonical temporal authority pattern (TEMP-001/TEMP-002): gaming day is computed exclusively by `compute_gaming_day()` in Postgres, parameterized by `casino_settings.timezone` and `casino_settings.gaming_day_start_time`. This contract was violated when a PERF-006 optimization replaced the RPC-backed `useGamingDay()` hook with a pure-JS `getCurrentGamingDay()` function in the Player 360 RSC page. The function used `new Date().toISOString().slice(0, 10)` — a UTC calendar date — which diverged from the casino-local gaming day after UTC midnight.

The P0 hotfix corrected the immediate output by using `Intl.DateTimeFormat` with hardcoded `America/Los_Angeles` and `06:00`, but three structural problems remain:

1. **Hardcoded config** — `getCurrentGamingDay()` and `getWeeksAgoDate()` still use JS date math with hardcoded values instead of the DB RPC. Any change to `casino_settings` will silently break Player 360.
2. **Missing RPCs** — `rpc_current_gaming_day()` and `rpc_gaming_day_range()` are specified in TEMP-003 but do not exist in the database.
3. **No enforcement** — No lint rule or CI gate prevents engineers from reintroducing UTC date slicing in query paths.

Additionally, the MTL trigger `trg_mtl_entry_set_gaming_day()` reimplements gaming day boundary logic inline instead of calling `compute_gaming_day()`, and two components import `useGamingDay` from the deprecated `hooks/use-casino.ts` path.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Eliminate all JS gaming day derivations in query paths | Zero calls to `getCurrentGamingDay()` or `getWeeksAgoDate()` from service/page code; functions deleted or marked `@deprecated` |
| **G2**: All RSC surfaces resolve gaming day via DB RPC | `page.tsx` files call `getServerGamingDay()` helper which invokes `rpc_current_gaming_day()`; no JS fallback |
| **G3**: CI gate prevents reintroduction of banned temporal patterns | ESLint rule flags `toISOString().slice(0, 10)` and `new Date()` arithmetic in `services/` and `app/` paths |
| **G4**: Boundary and DST tests verify temporal contract | Tests pass for pre-boundary, post-boundary, UTC-midnight, spring-forward, and fall-back scenarios |
| **G5**: All triggers call `compute_gaming_day()` | No inline gaming day boundary logic in any trigger function |

### 2.3 Non-Goals

- Changing the gaming day start time or timezone for existing casinos (admin UI is PRD-021 Phase 2)
- Multi-casino timezone support beyond what `casino_settings` already supports
- Replacing the existing `GET /api/v1/casino/gaming-day` route handler (it already calls `compute_gaming_day` correctly)
- Refactoring the `useGamingDay` client hook internals (it already calls the correct API)
- Performance optimization of the gaming day RPC (sub-5ms, already acceptable)

---

## 3. Users & Use Cases

### 3.1 Primary Users

| User | Role |
|------|------|
| **Pit Boss / Floor Supervisor** | Views Player 360 dashboard, pit dashboard, pit panels — all must show correct gaming day data |
| **Compliance Officer** | Relies on MTL data aggregated by gaming day for CTR reporting |
| **Engineer** | Writes features that touch gaming day; needs guardrails to prevent temporal bypass |

### 3.2 Use Cases

| ID | User | Job |
|----|------|-----|
| UC-1 | Pit Boss | Views Player 360 summary panels and sees correct financial data for the current gaming day, including after UTC midnight |
| UC-2 | Pit Boss | Views weekly trend charts with correct gaming-day-aligned period boundaries |
| UC-3 | Compliance Officer | MTL entries have `gaming_day` computed by the canonical function, not an inline reimplementation |
| UC-4 | Engineer | Attempts to use `toISOString().slice(0, 10)` in a service file and receives a lint error with a link to TEMP-003 |

---

## 4. Scope & Feature List

### 4.1 In Scope

1. **DB migration: `rpc_current_gaming_day()`** — RLS-context-scoped RPC that derives `casino_id` from session vars and calls `compute_gaming_day()` internally
2. **DB migration: `rpc_gaming_day_range()`** — Returns `{start_gd, end_gd}` for a given number of weeks, replacing all JS "weeks ago" date math
3. **DB migration: Fix MTL trigger** — Replace inline boundary logic in `trg_mtl_entry_set_gaming_day()` with a call to `compute_gaming_day()`
4. **Server helper: `lib/gaming-day/server.ts`** — Canonical `getServerGamingDay(supabase)` function for RSC pages
5. **Player 360 RSC migration** — Replace `getCurrentGamingDay()` in `page.tsx` with `getServerGamingDay()`
6. **Player 360 crud.ts migration** — Replace `getCurrentGamingDay()` and `getWeeksAgoDate()` fallbacks with RPC calls
7. **Player 360 mappers.ts cleanup** — Delete or deprecate `getCurrentGamingDay()` and `getWeeksAgoDate()`, update `mapToWeeklySeries()`
8. **Import path cleanup** — Migrate `pit-panels-client.tsx` and `pit-dashboard-client.tsx` from `hooks/use-casino` to `hooks/casino/use-gaming-day`
9. **ESLint rule: `no-temporal-bypass`** — Flags `toISOString().slice(0, 10)` and `new Date()` arithmetic in `services/`, `app/`, `hooks/` paths
10. **Boundary tests** — Automated tests for pre-boundary (05:50), post-boundary (06:10), UTC-midnight (00:10 UTC), DST spring-forward, DST fall-back
11. **Observability tripwire** — Dev/staging invariant that compares server helper result against direct RPC call

### 4.2 Out of Scope

- Admin UI for changing timezone/start time (PRD-021 Phase 2)
- `getWeekStart()` utility (used only for display formatting, not query construction)
- Deprecated `hooks/use-casino.ts` file deletion (will be removed when no consumers remain)

---

## 5. Requirements

### 5.0 Canonical Function Contract

This PRD standardizes a **two-layer** contract to remove ambiguity between “pure computation” and “casino-scoped derivation”.

**Layer 1 — Pure function (immutable math):**
- `compute_gaming_day(p_ts timestamptz, p_gaming_day_start interval) -> date`
- **IMMUTABLE**
- Contains **no** timezone or casino lookups.
- Safe to use anywhere *once inputs are already canonical*.

**Layer 2 — Casino-scoped wrapper (authoritative derivation):**
- `compute_gaming_day_for_casino(p_ts timestamptz default now()) -> date`
- **STABLE, SECURITY DEFINER**
- Derives `casino_id` from `current_setting('app.casino_id', true)`
- Reads `casino_settings.timezone` and `casino_settings.gaming_day_start_time`
- Converts `p_ts` to casino-local time and applies the gaming-day boundary
- Delegates final date math to `compute_gaming_day(...)`

**Consumption rules:**
- `rpc_current_gaming_day()` and `rpc_gaming_day_range()` **must call** `compute_gaming_day_for_casino(...)`
- Triggers that set `gaming_day` (e.g., MTL) **must call** `compute_gaming_day_for_casino(...)` (or call Layer 1 using inputs pulled from `casino_settings`)
- Client/server code must **never** pass `casino_id` to temporal RPCs (no spoofable parameters)
- The wrapper must **fail closed** if `app.casino_id` is missing (explicit error)

---

### 5.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | `rpc_current_gaming_day(p_timestamp)` derives `casino_id` from `current_setting('app.casino_id', true)` (**no casino_id parameter**) and returns a `date` | Must |
| FR-1a | `rpc_current_gaming_day()` **fails closed** when `app.casino_id` is missing (explicit error; no silent fallback) | Must |
| FR-1b | `rpc_current_gaming_day()` calls `compute_gaming_day_for_casino(p_timestamp)` (Layer 2 wrapper) | Must |
| FR-2 | `rpc_gaming_day_range(p_weeks, p_end_timestamp)` returns `{start_gd date, end_gd date}` using `compute_gaming_day_for_casino()` + date arithmetic | Must |
| FR-3 | `getServerGamingDay(supabase)` calls `rpc_current_gaming_day()` and returns date string | Must |
| FR-4 | Player 360 `page.tsx` uses `getServerGamingDay()` instead of `getCurrentGamingDay()` | Must |
| FR-5 | Player 360 `crud.ts` uses `rpc_gaming_day_range()` instead of `getWeeksAgoDate()` | Must |
| FR-6 | `trg_mtl_entry_set_gaming_day()` calls `compute_gaming_day_for_casino()` (or Layer 1 + settings) instead of inline logic | Must |
| FR-7 | `pit-panels-client.tsx` and `pit-dashboard-client.tsx` import from `hooks/casino/use-gaming-day` | Should |
| FR-8 | ESLint rule `no-temporal-bypass` blocks `toISOString().slice(0, 10)` (and equivalent UTC-slice patterns) in **query paths**: `services/`, `app/`, `hooks/` | Should |
| FR-8a | ESLint rule excludes display-only code (e.g., `components/**`) **unless** it performs data fetching/query construction | Should |
| FR-9 | Observability tripwire logs mismatch in dev/staging environments | Could |

### 5.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | `rpc_current_gaming_day()` latency | < 5ms p95 |
| NFR-2 | `rpc_gaming_day_range()` latency | < 5ms p95 |
| NFR-3 | No regression in Player 360 page load time | Baseline or better |
| NFR-4 | All 66 existing mapper tests continue to pass | 100% |

---

## 6. UX / Flow Overview

### 6.1 RSC Gaming Day Resolution (new canonical flow)

1. User navigates to Player 360 page
2. RSC `page.tsx` creates server Supabase client and sets RLS context via `withServerAction` middleware
3. RSC calls `getServerGamingDay(supabase)` which invokes `rpc_current_gaming_day()`
4. `gaming_day` (e.g., `2026-02-02`) returned by DB and passed as prop to client components
5. Client components use `gaming_day` prop for data fetching — no client-side gaming day computation

### 6.2 Client Component Gaming Day (unchanged canonical flow)

1. Pit Dashboard / Pit Panels client components call `useGamingDay()` from `hooks/casino/use-gaming-day`
2. Hook calls `GET /api/v1/casino/gaming-day` which invokes `compute_gaming_day` via RPC
3. Response includes `gaming_day`, `casino_id`, `timezone`

### 6.3 Weekly Trend Query (new canonical flow)

1. Player 360 requests weekly trend data
2. `crud.ts` calls `rpc_gaming_day_range(p_weeks)` to get `{start_gd, end_gd}`
3. Query uses DB-computed date range instead of JS `getWeeksAgoDate()`

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `compute_gaming_day(...)` function in database (Layer 1) | Prerequisite | Exists (since PRD-000) |
| `compute_gaming_day_for_casino(...)` wrapper (Layer 2) | Work item | To be added in this PRD |
| `set_rls_context_from_staff()` middleware | Prerequisite | Exists (ADR-024) |
| `withServerAction` middleware in RSC | Prerequisite | Exists |
| `casino_settings` table with `timezone` and `gaming_day_start_time` | Prerequisite | Exists |
| `GET /api/v1/casino/gaming-day` route handler | Prerequisite | Exists |

### 7.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `rpc_current_gaming_day()` introduces additional latency in RSC path | Low | Low | RPC is a single `SELECT` + function call; < 5ms baseline |
| ESLint rule produces false positives in display-only code | Medium | Low | Scope rule to query paths (`services/`, `app/`, `hooks/`); exclude `components/**` unless it constructs queries/fetches |
| Mapper test suite needs updates after removing `getCurrentGamingDay()` | High | Low | Tests will need to mock `rpc_current_gaming_day()` instead of `getCurrentGamingDay()` |
| MTL trigger migration alters behavior for edge-case timestamps | Low | High | Run EXPLAIN + regression test against existing `mtl_entry` data before/after |

### 7.3 Decisions

1. **Testing:** `rpc_current_gaming_day(p_timestamp)` remains supported explicitly for deterministic tests; `getServerGamingDay()` may accept an optional timestamp only in test harnesses (never in production call sites).
2. **Enforcement severity:** ESLint gate ships as **error** immediately for `services/`, `app/`, `hooks/`. If noise emerges, fix call sites—do not downgrade the gate.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `compute_gaming_day_for_casino(...)` exists (Layer 2 wrapper) and is used by canonical RPCs/triggers
- [ ] `rpc_current_gaming_day()` exists, **fails closed** without `app.casino_id`, and returns correct gaming day using RLS-derived scope
- [ ] `rpc_gaming_day_range()` exists and returns correct `{start_gd, end_gd}`
- [ ] Player 360 `page.tsx` calls `getServerGamingDay()` — no JS gaming day derivation
- [ ] Player 360 `crud.ts` uses `rpc_gaming_day_range()` for weekly trend queries
- [ ] `getCurrentGamingDay()` and `getWeeksAgoDate()` deleted from production code paths
- [ ] `pit-panels-client.tsx` and `pit-dashboard-client.tsx` import `useGamingDay` from `hooks/casino/use-gaming-day`

**Data & Integrity**
- [ ] `trg_mtl_entry_set_gaming_day()` calls `compute_gaming_day_for_casino()` (or Layer 1 + settings) — no inline boundary logic
- [ ] Existing `mtl_entry` rows unaffected by trigger migration (audit query returns 0 mismatches)
- [ ] `gaming_day` values returned by `rpc_current_gaming_day()` match `compute_gaming_day_for_casino()` for all test cases

**Security & Access**
- [ ] `rpc_current_gaming_day()` and `rpc_gaming_day_range()` are `SECURITY DEFINER`, derive casino scope from RLS context, and **reject missing scope** — no spoofable parameters
- [ ] No new routes or client-exposed surfaces

**Testing**
- [ ] Boundary tests pass: 05:50 local, 06:10 local, 00:10 UTC, DST spring-forward, DST fall-back
- [ ] All 66 existing mapper tests pass (updated to use new code paths)
- [ ] Integration test: `rpc_current_gaming_day()` reflects `casino_settings` change immediately

**Operational Readiness**
- [ ] ESLint rule `no-temporal-bypass` blocks banned patterns in `services/`, `app/`, `hooks/`
- [ ] Observability tripwire deployed in dev/staging (compares helper vs direct RPC)
- [ ] `npm run db:types` regenerated after migrations

**Documentation**
- [ ] TEMP-003 remediation checklist items marked complete for delivered scope (enforcement standard file present and linked)
- [ ] TEMP-003 consumer compliance map updated to reflect migration status

---

## 9. Related Documents

| Document | Relationship |
|----------|-------------|
| [TEMP-001: Gaming Day Specification](../20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md) | Canonical computation spec — defines `compute_gaming_day()` |
| [TEMP-002: Temporal Authority Pattern](../20-architecture/temporal-patterns/TEMP-002-temporal-authority-pattern.md) | Ownership model — CasinoService temporal authority |
| [TEMP-003: Timezone & Gaming Day Enforcement Standard](../20-architecture/temporal-patterns/TEMP-003-timezone-gaming-day-enforcement-standard.md) | Enforcement standard — banned patterns, RSC safe path, remediation checklist |
| [Temporal Patterns INDEX](../20-architecture/temporal-patterns/INDEX.md) | Registry — decision matrix, invariants, compliance checklist |
| [ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION](../issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md) | P0 incident root cause — antipattern case study |
| [ADR-024](../80-adrs/ADR-024-authoritative-context-derivation.md) | Authoritative context derivation — RLS session var pattern |
| [PRD-000: Casino Foundation](PRD-000-casino-foundation.md) | Introduced `compute_gaming_day()` and `casino_settings` |
| [PRD-005: MTL Service](PRD-005-mtl-service.md) | Introduced `trg_mtl_entry_set_gaming_day()` (inline — to be fixed) |

---

## Appendix A: Affected Code Inventory

### Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `supabase/migrations/` (new) | `rpc_current_gaming_day()`, `rpc_gaming_day_range()`, MTL trigger fix | P1 |
| `lib/gaming-day/server.ts` (new) | `getServerGamingDay()` canonical helper | P1 |
| `app/(dashboard)/players/[[...playerId]]/page.tsx:41` | Replace `getCurrentGamingDay()` with `getServerGamingDay()` | P1 |
| `services/player360-dashboard/crud.ts:87,325` | Replace `getCurrentGamingDay()` / `getWeeksAgoDate()` with RPC calls | P1 |
| `services/player360-dashboard/mappers.ts:143,182` | Delete `getCurrentGamingDay()` and `getWeeksAgoDate()` | P1 |
| `services/player360-dashboard/index.ts:60-61` | Remove re-exports | P1 |
| `components/pit-panels/pit-panels-client.tsx:41` | Change import path to `hooks/casino/use-gaming-day` | P2 |
| `components/dashboard/pit-dashboard-client.tsx:46` | Change import path to `hooks/casino/use-gaming-day` | P2 |
| `.eslintrc.*` or `eslint.config.*` (new rule) | `no-temporal-bypass` rule | P2 |

### Database Objects to Create/Modify

| Object | Action |
|--------|--------|
| `rpc_current_gaming_day(p_timestamp timestamptz)` | Create — SECURITY DEFINER, derives casino from RLS context |
| `rpc_gaming_day_range(p_weeks int, p_end_timestamp timestamptz)` | Create — SECURITY DEFINER, returns `{start_gd, end_gd}` |
| `trg_mtl_entry_set_gaming_day()` | Modify — replace inline logic with `compute_gaming_day()` call |

---

## Appendix B: Implementation Workstreams

| WS | Name | Type | Dependencies | Bounded Context |
|----|------|------|-------------|-----------------|
| WS1 | Database RPCs + MTL trigger fix | database | None | CasinoService (authority), MTL |
| WS2 | Server helper + Player 360 migration | frontend/service | WS1 | Player360DashboardService |
| WS3 | Import path cleanup | frontend | None | PitDashboard, PitPanels |
| WS4 | ESLint rule | tooling | None | Cross-cutting |
| WS5 | Boundary + DST tests | testing | WS1, WS2 | CasinoService, Player360 |
| WS6 | Observability tripwire | observability | WS1, WS2 | Cross-cutting |

**Execution order:** WS1 → WS2 → WS5 (serial dependency). WS3, WS4, WS6 can run in parallel with WS2.

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-02-02 | Lead Architect | Initial draft from TEMP-003 remediation plan and ISSUE analysis |
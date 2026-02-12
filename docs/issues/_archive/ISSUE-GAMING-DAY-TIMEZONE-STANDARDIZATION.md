# ISSUE: Gaming Day Timezone Mismatch & Standardization Gap

**Status:** Open (P0 hotfix applied, P1-P3 pending)
**Severity:** Critical (data display regression), High (systemic standardization gap)
**Category:** Temporal / Data Flow / Configuration
**Created:** 2026-02-02
**Related Spec:** TEMP-001 Gaming Day Specification
**Related Service:** Player360DashboardService, CasinoService
**Tags:** gaming-day, timezone, temporal-authority, config, TEMP-001

---

## Executive Summary

`getCurrentGamingDay()` in `services/player360-dashboard/mappers.ts` computed gaming day using UTC calendar date (`new Date().toISOString().slice(0, 10)`), while the database's canonical `compute_gaming_day()` RPC uses the casino's configured timezone (`America/Los_Angeles`) and gaming day start boundary (`06:00`). After UTC midnight (4 PM PST), the two diverge — JavaScript returns tomorrow's date while the database still considers today the current gaming day. This causes the Player 360 dashboard to query for a gaming day with no data, displaying $0 across all financial panels for every player.

Beyond the immediate bug, a broader standardization gap exists: the Player 360 dashboard bypasses the canonical `compute_gaming_day` RPC path entirely, using a hardcoded JS function instead. Other surfaces (Pit Dashboard, Pit Panels, Rating Slip Modal) correctly use the `useGamingDay()` hook which calls the RPC.

**Related:** ISSUE-580A8D81 Root Cause #2 (previously identified, same underlying bug).

---

## Root Cause

### The Mismatch

| Component | Gaming Day Returned | Method |
|---|---|---|
| **DB** `compute_gaming_day()` | `2026-02-02` | Casino TZ (`America/Los_Angeles`) + `gaming_day_start_time` (`06:00`) from `casino_settings` |
| **JS** `getCurrentGamingDay()` (before fix) | `2026-02-03` | `new Date().toISOString().slice(0, 10)` — **UTC date** |

At the time of investigation:
- UTC: `2026-02-03 06:22:57`
- Pacific: `2026-02-02 22:22:57`

The financial transaction query `.eq("gaming_day", "2026-02-03")` returned 0 rows. All transaction data has `gaming_day = "2026-02-02"` or earlier.

### Why the Bypass Exists

PERF-006 WS5 identified a client-side waterfall cascade:

```
useAuth → useGamingDay() → usePlayerSummary (key depends on gamingDay) → useGamingDaySummary
```

To eliminate it, gaming day was computed server-side in the RSC (`page.tsx:41`) via `getCurrentGamingDay()` and passed as a prop. The optimization was correct in principle (eliminate waterfall) but used the wrong function — a naive JS date function instead of the canonical `compute_gaming_day` RPC.

### TEMP-001 Violation

TEMP-001 Section 2 Rule 2 states:

> Downstream services MUST consume via database triggers that auto-populate gaming_day columns, RPC functions that query casino_settings internally, or published CasinoSettingsDTO for application-layer logic.

`getCurrentGamingDay()` violates this rule by computing gaming day independently of `casino_settings`.

---

## Affected Code

### Tier 1: Direct Bug (P0 — Hotfixed)

| File | Line | Issue |
|---|---|---|
| `services/player360-dashboard/mappers.ts` | 143 | `getCurrentGamingDay()` used UTC instead of casino TZ |
| `services/player360-dashboard/crud.ts` | 87 | Falls back to `getCurrentGamingDay()` when no gamingDay param |
| `app/(dashboard)/players/[[...playerId]]/page.tsx` | 41 | Server-side computation via `getCurrentGamingDay()` |

**Hotfix applied:** `getCurrentGamingDay()` now uses `Intl.DateTimeFormat` with `America/Los_Angeles` timezone and 6 AM boundary. Hardcoded values match current `casino_settings` defaults and all existing casino records.

### Tier 2: Hardcoded Values (P1 — Standardization)

The hotfix hardcodes `America/Los_Angeles` and `GAMING_START_HOUR = 6`. These values are correct for the MVP single-casino deployment but will break if:
- A casino changes their timezone via `PATCH /api/v1/casino/settings`
- A casino changes their `gaming_day_start_time`
- Multi-casino support lands with different timezones

### Tier 3: Related Inconsistencies (P2)

| File | Line | Issue |
|---|---|---|
| `services/player360-dashboard/mappers.ts` | 182 | `getWeeksAgoDate()` uses `.toISOString().slice(0, 10)` (UTC) |
| `trg_mtl_entry_set_gaming_day()` (DB trigger) | — | Reimplements gaming day logic inline instead of calling `compute_gaming_day()` |
| `hooks/use-casino.ts` | 72 | Deprecated `useGamingDay(casinoId)` still used by PitDashboard and PitPanels |

---

## System-Wide Gaming Day Map

### Canonical Path (Correct)

```
casino_settings
  ├─ gaming_day_start_time: '06:00' (configurable per-casino)
  └─ timezone: 'America/Los_Angeles' (configurable per-casino)
        ↓ READ by
compute_gaming_day(casino_id, timestamp)  [PL/pgSQL, STABLE, SECURITY DEFINER]
        ↓ CALLED by
        ├─ TRIGGERS (5 tables):
        │   ├─ set_visit_gaming_day()              → visit
        │   ├─ set_fin_txn_gaming_day()             → player_financial_transaction
        │   ├─ set_table_session_gaming_day()        → table_session
        │   ├─ trg_pit_cash_observation_set_gaming_day() → pit_cash_observation
        │   └─ trg_mtl_entry_set_gaming_day()        → mtl_entry  ⚠️ INLINE (not calling compute_gaming_day)
        │
        ├─ RPCs:
        │   ├─ rpc_start_or_resume_visit()
        │   ├─ rpc_resolve_current_slip_context()
        │   ├─ rpc_log_table_buyin_telemetry() (2 overloads)
        │   ├─ rpc_log_table_drop()
        │   └─ rpc_promo_exposure_rollup()
        │
        └─ API: GET /api/v1/casino/gaming-day
              ↓
            useGamingDay() hook
              ↓ CONSUMED by
              ├─ PitDashboardClient       ✅
              ├─ PitPanelsClient           ✅
              ├─ GamingDayIndicator        ✅
              └─ RatingSlipModal           ✅
```

### Rogue Bypass (Player 360)

```
getCurrentGamingDay()  [Pure JS, hardcoded TZ + hour]
        ↓
  page.tsx (RSC) → gamingDay prop
        ↓
  ├─ usePlayerSummary(playerId, { gamingDay })
  │     → getPlayerSummary() → .eq("gaming_day", gamingDay) on player_financial_transaction
  │     → SummaryPanel: session value, cash velocity, engagement, rewards
  │     → FilterPanel: session, financial, gaming, loyalty tiles
  │
  └─ mapToWeeklySeries() → periodEnd = getCurrentGamingDay()
```

### Tables with gaming_day Column (8)

| Table | Trigger | Calls `compute_gaming_day`? |
|---|---|---|
| `visit` | `trg_visit_gaming_day` | Yes |
| `player_financial_transaction` | `trg_fin_gaming_day` + `trg_guard_stale_gaming_day` | Yes |
| `table_session` | `trg_table_session_gaming_day` | Yes |
| `pit_cash_observation` | `trg_pit_cash_observation_gaming_day` | Yes |
| `mtl_entry` | `trg_mtl_entry_gaming_day` | **No** — inline reimplementation |
| `table_drop_event` | None (set by RPC) | Via `rpc_log_table_drop` |
| `table_buyin_telemetry` | None (set by RPC/bridge) | Via `rpc_log_table_buyin_telemetry` / `fn_bridge_finance_to_telemetry` |
| `mtl_gaming_day_summary` | View (derived from `mtl_entry`) | N/A |

### Consumer Surface Audit

| Surface | Gaming Day Source | Canonical? | Status |
|---|---|---|---|
| Player 360 summary panels | `getCurrentGamingDay()` | **No** | P0 hotfixed (hardcoded) |
| Player 360 filter tiles | Same `usePlayerSummary` | **No** | P0 hotfixed |
| Player 360 engagement | Timeline `lastActivityAt` | Indirect | Degraded (shows "dormant") |
| Player 360 weekly series | `getWeeksAgoDate()` (UTC) | **No** | Minor (wide range absorbs error) |
| Pit Dashboard | `useGamingDay(casinoId)` via API | Yes | OK |
| Pit Panels | `useGamingDay(casinoId)` via API | Yes | OK |
| Gaming Day Indicator | `useGamingDay()` via API | Yes | OK |
| Rating Slip Modal | `useGamingDay()` via API | Yes | OK |
| MTL Compliance panels | `useGamingDaySummary` | Yes | OK |
| Finance write path | DB triggers | Yes | OK |
| Visit write path | DB triggers | Yes | OK |

---

## Remediation Plan

### P0: Hotfix (DONE)

**File:** `services/player360-dashboard/mappers.ts`

Replaced `new Date().toISOString().slice(0, 10)` with timezone-aware computation using `Intl.DateTimeFormat` with `America/Los_Angeles` and 6 AM boundary. Matches DB `compute_gaming_day()` output. All 66 mapper tests pass.

**Limitation:** Hardcoded to single casino defaults. Acceptable for MVP.

### P1: Server-Side RPC in RSC

Replace `getCurrentGamingDay()` in `page.tsx` with a server-side call to `compute_gaming_day` RPC:

```typescript
// page.tsx (RSC)
const supabase = await createClient();
const { data: gamingDay } = await supabase.rpc('compute_gaming_day', {
  p_casino_id: casinoId,  // derived from server auth context
  p_timestamp: new Date().toISOString(),
});
```

**Prerequisite:** Server component needs `casino_id` from the auth session. Currently extracted client-side by `useAuth()`. Requires either:
- Server-side session helper that reads `casino_id` from JWT claims
- Or a lightweight server action that returns the gaming day

**Aligns with:** Admin config implementation (both need server-side casino context in RSC).

### P2: Fix Related Inconsistencies

1. **Fix `getWeeksAgoDate()`** — Use casino TZ for period start calculation
2. **Fix MTL trigger** — `trg_mtl_entry_set_gaming_day()` should call `compute_gaming_day()` instead of inline logic (DB migration)
3. **Deprecation cleanup** — Migrate `PitDashboardClient` and `PitPanelsClient` from `hooks/use-casino.ts` to `hooks/casino/use-gaming-day.ts`

### P3: Admin Config UI

When `gaming_day_start_time` and `timezone` become editable via admin UI (PRD-021 Phase 2):
- `getCurrentGamingDay()` MUST be replaced with RPC path (P1)
- Cache invalidation for `useGamingDay()` must propagate to all consumers
- TEMP-001 FM-3 (timezone change mid-day) warnings must be surfaced in UI

---

## Verification

```sql
-- Confirm DB and JS now agree
SELECT compute_gaming_day('ca000000-0000-0000-0000-000000000001'::uuid, now()) AS db_gaming_day;
-- Returns: 2026-02-02

-- JS getCurrentGamingDay() after fix:
-- Returns: 2026-02-02  ✅ (verified via npx tsx)
```

---

## References

- **TEMP-001**: `docs/20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md`
- **ISSUE-580A8D81**: `docs/issues/ISSUE-580A8D81-PLAYER-DASHBOARD-DATA-FLOW-GAPS.md` (Root Cause #2)
- **PERF-006 WS5**: Server-side gaming day computation (introduced the bypass)
- **casino_settings schema**: `gaming_day_start_time` (time, default `06:00`), `timezone` (text, default `America/Los_Angeles`)
- **compute_gaming_day()**: `supabase/migrations/20251129161956_prd000_casino_foundation.sql`
- **API endpoint**: `app/api/v1/casino/gaming-day/route.ts`
- **Canonical hook**: `hooks/casino/use-gaming-day.ts`

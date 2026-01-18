# ADR-026/ADR-027 Rating Slip Workflow Audit

**Date:** 2026-01-18
**Issue Reference:** ISSUE-EB50A05F
**Status:** RESOLVED (original bugs) | NEW ISSUES IDENTIFIED

## Context

Comprehensive review of rating slip workflows following ADR-026 (gaming-day-scoped visits) and ADR-027 (table bank mode visibility) implementation. Original issue reported multiple bugs in rating slip creation and gaming day rollover workflows.

## Original Issues (RESOLVED)

| Issue | Location | Fix Migration | Status |
|-------|----------|---------------|--------|
| `rpc_resolve_current_slip_context` missing `policy_snapshot` | RPC function | `20260117170000_fix_resolve_slip_context_policy_snapshot.sql` | FIXED |
| `bridge_rated_buyin_to_telemetry` wrong column reference (`rs.gaming_day`) | Trigger | `20260117171000_fix_telemetry_bridge_gaming_day.sql` | FIXED |
| ON CONFLICT clause mismatch in telemetry bridge | Trigger | `20260117180000_fix_telemetry_bridge_on_conflict.sql` | FIXED |

## Audit Scope

1. ADR-026 and ADR-027 architectural changes
2. All rating slip RPC functions
3. Telemetry bridge triggers
4. Service layer implementations
5. Visit-rating slip relationship
6. UI components with gaming day assumptions

## Verified Correct Implementations

### RPC Functions

All RPCs correctly source `gaming_day` from `visit` table:

| RPC | Gaming Day Source | Verification |
|-----|-------------------|--------------|
| `rpc_resolve_current_slip_context` | `v.gaming_day` via JOIN | Line 49 |
| `rpc_get_rating_slip_modal_data` | `v.gaming_day AS visit_gaming_day` | Line 143 |
| `rpc_start_or_resume_visit` | `compute_gaming_day(v_casino_id, now())` | Line 67 |
| `bridge_rated_buyin_to_telemetry` | `v.gaming_day` via JOIN | Line 31 |

### Database Guards

- `guard_stale_gaming_day_write()` trigger on `player_financial_transaction` - Rejects writes for stale gaming days with `STALE_GAMING_DAY_CONTEXT` error
- Unique partial index `uq_visit_player_gaming_day_active` - Enforces one active visit per `(casino_id, player_id, gaming_day)`

### Service Layer

- `VisitService.startVisit()` returns `{ visit, isNew, resumed, gamingDay }`
- `RatingSlipService.listClosedForGamingDay()` filters via `visit.gaming_day`
- `useSaveWithBuyIn` hook handles `STALE_GAMING_DAY_CONTEXT` errors

### Invariants Enforced

| ID | Invariant | Mechanism | Status |
|----|-----------|-----------|--------|
| INV-1 | Visit `gaming_day` computed via `compute_gaming_day(casino_id, started_at)` | BEFORE INSERT trigger | ENFORCED |
| INV-2 | At most one active visit per `(casino_id, player_id, gaming_day)` | Unique partial index | ENFORCED |
| INV-3 | Financial aggregations filter by `gaming_day` | BFF RPC WHERE clause | ENFORCED |
| INV-4 | Stale visit closure automatic on new gaming day seat action | `rpc_start_or_resume_visit` | ENFORCED |
| INV-5 | `visit_group_id` preserves multi-day player history | Inherited on new visit | ENFORCED |
| INV-6 | Rating slips don't span gaming days | Auto-closed at rollover | ENFORCED |

## New Issues Identified

### ISSUE-CLIENT-GD-001: Legacy Modal Data Path Uses Incorrect Gaming Day

**Severity:** LOW
**Location:** `app/api/v1/rating-slips/[id]/modal-data/route.ts:421-425`

```typescript
function extractGamingDay(timestamp: string): string {
  // For now, just extract the date portion
  // In a real implementation, this would account for gaming day cutoff (e.g., 6 AM)
  return timestamp.split("T")[0];
}
```

**Problem:** When `NEXT_PUBLIC_USE_MODAL_BFF_RPC=false` (legacy path), gaming day is computed by extracting date portion from `start_time`, ignoring casino's gaming day cutoff.

**Impact:** Low - RPC path is default in production and correctly sources `gaming_day` from `visit` table.

**Recommendation:** Remove legacy path or fix to fetch `visit.gaming_day` via join.

---

### ISSUE-CLIENT-GD-002: GamingDayIndicator Uses Client-Side Date

**Severity:** MEDIUM
**Location:** `components/shared/gaming-day-indicator.tsx:7-22`

```typescript
export function GamingDayIndicator() {
  // TODO: Replace with actual gaming day from CasinoService (TEMP-001)
  const today = new Date();
  const gamingDay = today.toLocaleDateString("en-US", {...});
```

**Problem:** Header indicator shows client's local date, not casino's actual gaming day from `compute_gaming_day` RPC.

**Impact:** Could confuse users operating across gaming day boundaries (e.g., at 4 AM user sees "Jan 18" but casino is still on "Jan 17" gaming day).

**Recommendation:** Use `useGamingDay()` hook to fetch canonical gaming day from server.

---

### ISSUE-CLIENT-GD-003: usePatronDailyTotal Defaults to Client Date

**Severity:** MEDIUM
**Location:** `hooks/mtl/use-patron-daily-total.ts:94-95`

```typescript
const effectiveGamingDay =
  gamingDay ?? new Date().toISOString().split("T")[0];
```

**Problem:** When `gamingDay` prop not provided, defaults to client-side date without considering casino timezone or gaming day cutoff.

**Impact:** MTL threshold calculations could use wrong gaming day for users operating near cutoff time.

**Recommendation:** Remove client-side default; require explicit gaming day parameter or fetch via `useGamingDay()`.

## Low-Priority Observations

| Location | Observation | Risk |
|----------|-------------|------|
| `components/pit-panels/pit-panels-static.tsx:114` | Mock data uses `new Date()` | LOW - Mock/demo only |
| `app/review/start-from-previous/page.tsx:27` | Review page uses local date | LOW - Review/demo only |
| `e2e/fixtures/mtl-fixtures.ts:100` | E2E fixture uses local date | LOW - Test only |

## Recommendations

### Immediate (Before Next Release)

1. Fix `GamingDayIndicator` to use `useGamingDay()` hook (ISSUE-CLIENT-GD-002)
2. Update `usePatronDailyTotal` to require explicit gaming day parameter (ISSUE-CLIENT-GD-003)

### Short-term

1. Deprecate/remove legacy modal-data path (ISSUE-CLIENT-GD-001)
2. Add integration tests for cross-midnight gaming day rollover scenarios

### Monitoring

1. Query `audit_log` for `visit_rollover` events to confirm behavior in production
2. Monitor for `STALE_GAMING_DAY_CONTEXT` errors in error logs

## Conclusion

ADR-026/ADR-027 implementation is **fundamentally sound** at database and RPC layers. All critical invariants enforced via database constraints and RPC logic. Remaining issues are **client-side convenience defaults** protected by server-side guards.

**Original ISSUE-EB50A05F:** RESOLVED
**New client-side issues:** Tracked above for future work

## Related Documents

- ADR-026: Gaming-Day-Scoped Visits
- ADR-027: Table Bank Mode Visibility
- ADR-028: Table Status Standardization
- `docs/issues/rating-slip/GAMING-DAY-CARRYOVER-ISSUE.md`
- `docs/issues/rating-slip/OPTION-A-GAMING-DAY-VISITS.md`

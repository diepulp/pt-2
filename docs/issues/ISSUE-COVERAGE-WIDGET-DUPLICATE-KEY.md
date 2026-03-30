# ISSUE: CoverageWidget Duplicate React Key

**Reported:** 2026-03-25
**Status:** Fixed (pending review)
**Severity:** Low (console warning, no data corruption)
**Component:** `components/shift-dashboard-v3/coverage-widget.tsx`

## Symptom

Console error on the shift dashboard page:

```
Encountered two children with the same key, `6a000000-0000-0000-0000-000000000001`.
Keys should be unique so that components maintain their identity across updates.
```

## Root Cause

Two independent issues combine to produce the error:

### 1. Unfiltered query on initial mount

`useShiftCoverage` was gated only on `casinoId`, not `gamingDay`. On mount, `useGamingDay()` hasn't resolved yet, so the query fires against `measurement_rating_coverage_v` **without** a `gaming_day` filter. This returns all table sessions across all gaming days — including multiple sessions for the same `gaming_table_id` (e.g., BJ-01 has an ACTIVE session today and a CLOSED session yesterday).

**File:** `hooks/measurement/use-shift-coverage.ts:39`
**Was:** `enabled: Boolean(casinoId)`

### 2. No per-table deduplication in rankWorstTables

`rankWorstTables` mapped each view row directly to a `RankedTable` using `gaming_table_id` as the key. The `measurement_rating_coverage_v` view is keyed by `table_session_id`, not `gaming_table_id` — so a table with multiple sessions produces duplicate keys.

**File:** `components/shift-dashboard-v3/coverage-widget.tsx:84-98`

## Fix Applied

1. **Gate query on `gamingDay`** — `enabled: Boolean(casinoId && gamingDay)` prevents the unfiltered cross-day query.
2. **Aggregate sessions per table** — `rankWorstTables` now groups by `gaming_table_id` and sums `open_seconds`, `rated_seconds`, and `untracked_seconds` before ranking. This handles both the cross-day case and the same-day re-open case.

## Files Changed

- `hooks/measurement/use-shift-coverage.ts` — enabled gate
- `components/shift-dashboard-v3/coverage-widget.tsx` — rankWorstTables aggregation

## Verification

- `npx tsc --noEmit` passes
- Manual: load shift dashboard, confirm no duplicate key warning in console
- Edge case: table re-opened same day should appear once in "worst tables" with combined metrics

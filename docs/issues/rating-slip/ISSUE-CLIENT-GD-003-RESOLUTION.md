# ISSUE-CLIENT-GD-003: usePatronDailyTotal Gaming Day Default - RESOLUTION

**Issue**: `usePatronDailyTotal` hook defaulted to client-side date when `gamingDay` parameter was not provided, ignoring casino timezone and gaming day cutoff.

**Severity**: MEDIUM - MTL threshold calculations could use wrong gaming day for users operating near cutoff time.

**Root Cause**: Hook had a fallback to `new Date().toISOString().split("T")[0]` which:
1. Uses client device timezone (not casino timezone)
2. Ignores gaming day cutoff time (e.g., 6am cutoff)
3. Could lead to threshold calculations on wrong gaming day

## Resolution

### Changes Made

#### 1. `/home/diepulp/projects/pt-2/hooks/mtl/use-patron-daily-total.ts`

**Before**:
```typescript
export function usePatronDailyTotal(
  casinoId: string | undefined,
  patronUuid: string | undefined,
  gamingDay?: string,  // Optional parameter
) {
  // Default to today if no gaming day provided
  const effectiveGamingDay =
    gamingDay ?? new Date().toISOString().split("T")[0];  // CLIENT-SIDE DEFAULT ❌

  const hasRequiredParams = !!casinoId && !!patronUuid;
  // ...
}
```

**After**:
```typescript
export function usePatronDailyTotal(
  casinoId: string | undefined,
  patronUuid: string | undefined,
  gamingDay: string | undefined,  // Still optional for type compatibility
) {
  // No client-side default - gamingDay is required ✅
  const hasRequiredParams = !!casinoId && !!patronUuid && !!gamingDay;

  // Query uses gamingDay directly
  queryFn: async () => {
    if (!casinoId || !patronUuid || !gamingDay) {
      return { totalIn: 0, totalOut: 0, entryCount: 0 };
    }
    // Use server-provided gaming day
    const result = await getGamingDaySummary({
      casino_id: casinoId,
      gaming_day: gamingDay,  // Server-side gaming day ✅
      patron_uuid: patronUuid,
      limit: 1,
    });
    // ...
  }
}
```

**Key Changes**:
- Removed `effectiveGamingDay` variable and client-side default
- Updated `hasRequiredParams` to require `gamingDay` (query disabled without it)
- Updated `queryFn` guard clause to check `gamingDay`
- Updated JSDoc to emphasize that `gamingDay` is required and must come from server

#### 2. `/home/diepulp/projects/pt-2/components/modals/rating-slip/rating-slip-modal.tsx`

**Before**:
```typescript
const { data: patronDailyTotal } = usePatronDailyTotal(
  modalData?.slip.casinoId,
  modalData?.player?.id,
  // Missing gaming day parameter - defaulted to client date ❌
);
```

**After**:
```typescript
// Add import
import { useGamingDay } from "@/hooks/use-casino";

// Fetch canonical gaming day from server
const { data: gamingDay } = useGamingDay(modalData?.slip.casinoId ?? "");

// Pass server-side gaming day to hook
const { data: patronDailyTotal } = usePatronDailyTotal(
  modalData?.slip.casinoId,
  modalData?.player?.id,
  gamingDay,  // Server-side gaming day ✅
);
```

#### 3. `/home/diepulp/projects/pt-2/components/mtl/mtl-entry-form.tsx`

**Before**:
```typescript
interface MtlEntryFormProps {
  // ...
  gamingDay?: string;  // Optional with client-side default ❌
}

export function MtlEntryForm({ gamingDay, ...props }: MtlEntryFormProps) {
  // Default to today
  const effectiveGamingDay = gamingDay ?? format(new Date(), "yyyy-MM-dd");  // CLIENT-SIDE DEFAULT ❌

  const { data: dailyTotal } = usePatronDailyTotal(
    casinoId,
    patron?.id,
    effectiveGamingDay,  // Could be client-side date ❌
  );
}
```

**After**:
```typescript
interface MtlEntryFormProps {
  // ...
  /**
   * Gaming day in YYYY-MM-DD format (REQUIRED)
   * Must be fetched from server using useGamingDay() hook to respect casino timezone.
   * Do not use client-side date defaults.
   */
  gamingDay: string;  // Required ✅
}

export function MtlEntryForm({ gamingDay, ...props }: MtlEntryFormProps) {
  // No client-side default - parent must provide ✅

  const { data: dailyTotal } = usePatronDailyTotal(
    casinoId,
    patron?.id,
    gamingDay,  // Always server-side gaming day ✅
  );
}
```

**Note**: The parent component (`ComplianceDashboard`) already passes `gamingDay` prop, so no changes needed there. The component uses a local state with date picker, allowing user to select any gaming day.

## Technical Details

### Why Server-Side Gaming Day?

Gaming day calculation must respect:
1. **Casino timezone**: Different casinos operate in different timezones
2. **Gaming day cutoff**: Most casinos use 6am cutoff (not midnight)
3. **DST transitions**: Timezone offsets change with daylight saving time

The `useGamingDay()` hook:
- Calls `GET /api/v1/casino/gaming-day` endpoint
- Uses server-side `compute_gaming_day` RPC function
- Returns canonical gaming day based on casino settings

### Query Behavior

With the fix:
- If `gamingDay` is `undefined`, query is **disabled** (returns empty result without fetching)
- If `gamingDay` is provided, query fetches MTL summary for that specific gaming day
- No risk of using incorrect client-side date for threshold calculations

### Backward Compatibility

The parameter is still typed as `gamingDay: string | undefined` to maintain type compatibility with React Query patterns, but:
- The hook's `enabled` flag requires it to be present
- The JSDoc clearly states it's required
- All call sites updated to provide it

## Testing

### Manual Testing Checklist

- [ ] Open rating slip modal near gaming day cutoff time (e.g., 5:55am)
- [ ] Verify MTL threshold uses correct gaming day (not rolled over yet)
- [ ] Wait until after cutoff (e.g., 6:05am)
- [ ] Verify MTL threshold uses new gaming day (rolled over)
- [ ] Test in multiple timezones (use browser DevTools timezone override)
- [ ] Verify no client-side date fallbacks in browser console

### Unit Tests

Existing tests in `/home/diepulp/projects/pt-2/__tests__/hooks/mtl/use-patron-daily-total.test.ts` still pass (they test query key generation, not the hook logic).

## Related Issues

- ISSUE-CLIENT-GD-002: Similar issue in `GamingDayIndicator` component
- ADR-026: Gaming day scoped visits
- ADR-027: Table bank mode visibility slice

## Rollout

No database migrations required. Changes are backward compatible at API level, but require all call sites to explicitly provide `gamingDay`.

## Audit Trail

- **Fixed**: 2026-01-18
- **Files Modified**: 3
  - `hooks/mtl/use-patron-daily-total.ts`
  - `components/modals/rating-slip/rating-slip-modal.tsx`
  - `components/mtl/mtl-entry-form.tsx`
- **Risk**: LOW - Hook is new (from PRD-MTL-UI-GAPS), limited usage
- **Scope**: MTL threshold calculation only (does not affect rating slip gaming day logic)

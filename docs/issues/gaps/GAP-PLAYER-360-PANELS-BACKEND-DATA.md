# GAP-PLAYER-360-PANELS-BACKEND-DATA

**Created:** 2026-01-28
**Status:** Open
**Related PRD:** PRD-023 (Player 360 Panels v0)
**Severity:** High
**Category:** Backend/Data Integration

---

## Summary

The Player 360 dashboard panels have backend data gaps where service functions exist but aren't wired to the UI, or where critical calculations are stubbed with TODO comments. Six distinct gaps require backend implementation work.

**User-Reported Symptoms:**
1. Compliance/MTL panel shows placeholder text
2. Player financial data missing (theo estimate always 0)
3. Engagement status shows "dormant" for actively playing players

---

## Gap Details

### 1. Engagement Status — Always Shows "Dormant"

**Severity:** High
**Location:** `services/player360-dashboard/mappers.ts:213-243`

**Root Cause:** Engagement status uses financial transaction timestamp instead of actual player activity:

```typescript
// crud.ts:166-184
const engagement = mapToEngagement(
  activeVisit ? { /* visit */ } : null,
  lastTxn?.created_at ?? null,  // ← Uses financial txn, not activity
);
```

**Mapper Logic:**
- `minutesAgo <= 15` → "active"
- `minutesAgo <= 60` → "cooling"
- `else` → "dormant"

**Why It Fails:**
- If player made a buy-in 16+ minutes ago but is still actively playing (cards being dealt, ratings being updated), status shows "dormant"
- Financial transactions are sparse during active play
- Active visit IS fetched but underutilized in status calculation

**Required Fix:**
- Query last activity from `rpc_get_player_timeline()` (any event type: rating, visit, financial, note)
- Alternative: Add dedicated RPC `rpc_get_player_last_activity_timestamp(player_id)`
- Update `mapToEngagement()` to use actual last activity, not just financial txn

---

### 2. Compliance/MTL Panel — Not Wired

**Severity:** High
**Location:** `app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx:442-458`

**Current State:** Static placeholder component

```tsx
function CompliancePlaceholder() {
  return (
    <div className="space-y-4">
      <PanelHeader icon={<Shield />} title="Compliance Status" />
      <PanelContent padding={false}>
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">CTR & MTL data will appear here</p>
          <p className="text-xs mt-1">Coming in Phase 4</p>
        </div>
      </PanelContent>
    </div>
  );
}
```

**Available but Unused:**
- Hook: `useGamingDaySummary()` in `hooks/mtl/`
- Hook: `useMtlEntries()` in `hooks/mtl/`
- Service: `getGamingDaySummary()` in MTL service
- Component: `CompliancePanel` in `components/player-360/compliance/panel.tsx`

**Required Fix:**
- Wire `useGamingDaySummary({ casinoId, gamingDay, patronId: playerId })` to Player 360
- Replace `CompliancePlaceholder` with actual `CompliancePanel` component
- Pass MTL data to component

---

### 3. Financial Data — Missing Theo Estimate

**Severity:** Medium
**Location:** `services/player360-dashboard/crud.ts:156`

```typescript
theoEstimate: 0, // TODO: Calculate from rating slips when available
```

**Required Fix:**
- Create RPC: `rpc_get_session_theo_estimate(player_id, gaming_day)`
- Sum `rating_slip.theo_win` for player's current gaming day
- Or sum across all open rating slips for active visit

---

### 4. Financial Data — Missing Trend Comparison

**Severity:** Low
**Location:** `services/player360-dashboard/crud.ts:161`

```typescript
const sessionValue = mapToSessionValue(financialSummary, null); // null = no trend
```

**Required Fix:**
- Query previous visit/session financial summary for comparison
- Calculate trend: current net W/L vs previous net W/L
- Pass trend delta to mapper

---

### 5. Reward Cooldown — Always Null

**Severity:** Medium
**Location:** `services/player360-dashboard/crud.ts:191`

```typescript
const rewardsEligibility = mapToRewardsEligibility(
  loyaltyBalance,
  null, // TODO: fetch most recent reward timestamp
);
```

**Impact:** Cooldown detection bypassed — eligibility always shows "available" even if cooldown should be active.

**Required Fix:**
- Query `loyalty_ledger` for most recent reward issuance timestamp:
  ```sql
  SELECT created_at FROM loyalty_ledger
  WHERE player_id = $1 AND transaction_type = 'redeem'
  ORDER BY created_at DESC LIMIT 1
  ```
- Pass timestamp to `mapToRewardsEligibility()` for cooldown calculation

---

### 6. Recent Events Strip — Service Exists, No Hook

**Severity:** Medium
**Location:** `app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx:171-190`

**Current State:** Mocked data

```typescript
const mockRecentEvents: RecentEventsDTO = React.useMemo(
  () => ({
    lastBuyIn: /* derived from summary */,
    lastReward: /* artificially generated */,
    lastNote: null, // Always null
  }),
  [summaryData],
);
```

**Available but Unused:**
- Service function `getRecentEvents()` exists at `crud.ts:345-384`

**Required Fix:**
- Create hook: `useRecentEvents(playerId)` wrapping `getRecentEvents()`
- Replace mock data with hook call
- Ensure notes query is properly wired

---

### 7. Rewards History — Service Exists, No Hook

**Severity:** Medium
**Location:** `app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx:190`

**Current State:** Always empty

```typescript
const mockRewardsHistory: RewardHistoryItemDTO[] = [];
```

**Available but Unused:**
- Service function `getRewardHistory()` exists at `crud.ts:284-332`

**Required Fix:**
- Create hook: `useRewardHistory(playerId)` wrapping `getRewardHistory()`
- Wire to `RewardsHistoryList` component

---

## Implementation Priority Matrix

| Gap | Severity | Complexity | Effort |
|-----|----------|------------|--------|
| **Engagement "Dormant"** | High | Medium | 2-3h |
| **Compliance/MTL** | High | Low | 1-2h |
| **Reward Cooldown** | Medium | Low | 30m |
| **Recent Events Hook** | Medium | Low | 1h |
| **Rewards History Hook** | Medium | Low | 1h |
| **Theo Estimate** | Medium | Medium | 2h |
| **Financial Trends** | Low | Medium | 2h |

---

## Recommended Implementation Order

### Phase 1: Critical Fixes (High Impact)

1. **Fix Engagement Status**
   - File: `services/player360-dashboard/crud.ts`
   - Add timeline query for last activity timestamp
   - Update `mapToEngagement()` call with actual activity time

2. **Wire Compliance Panel**
   - File: `app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx`
   - Import `useGamingDaySummary` from `hooks/mtl/`
   - Replace `CompliancePlaceholder` with `CompliancePanel`

### Phase 2: Quick Wins (Low Effort)

3. **Fix Reward Cooldown**
   - File: `services/player360-dashboard/crud.ts`
   - Add loyalty_ledger query before `mapToRewardsEligibility()`

4. **Create Missing Hooks**
   - File: `hooks/player-360/use-recent-events.ts` (new)
   - File: `hooks/player-360/use-reward-history.ts` (new, defer, pending rewards pipeline implementation)
   - Wire to timeline-content.tsx

### Phase 3: Enhancements (New RPCs)

5. **Add Theo Estimate RPC**
   - Migration: Add `rpc_get_session_theo_estimate`
   - Update `getPlayerDashboardSummary()` to call RPC

6. **Add Financial Trends**
   - Query previous visit financial summary
   - Calculate and pass trend to mapper

---

## Files Requiring Changes

| File | Change Type |
|------|-------------|
| `services/player360-dashboard/crud.ts` | Add queries for last activity, reward cooldown, theo estimate |
| `services/player360-dashboard/mappers.ts` | Update engagement mapper signature |
| `app/(dashboard)/players/[playerId]/timeline/_components/timeline-content.tsx` | Wire hooks, replace placeholders |
| `hooks/player-360/use-recent-events.ts` | New file |
| `hooks/player-360/use-reward-history.ts` | New file |
| `supabase/migrations/` | New RPC for theo estimate (optional) |

---

## Acceptance Criteria

- [ ] Engagement status reflects actual player activity (not just financial txns)
- [ ] Compliance panel displays CTR/MTL data for player
- [ ] Reward eligibility shows accurate cooldown status
- [ ] Recent events strip shows real data (last buy-in, reward, note)
- [ ] Rewards history list populated from service
- [ ] Theo estimate calculated from rating slips (or marked N/A)

---

## Related Documents

- PRD-023: Player 360 Panels v0
- ADR-029: Player 360 Timeline Dashboard
- `services/player360-dashboard/` - Current implementation
- `hooks/mtl/` - Available MTL hooks

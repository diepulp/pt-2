# Player Dashboard - Data Availability Report

**Date:** 2025-12-20
**Status:** Partial Implementation (Backend Services Wired)

## Summary

The player dashboard backend integration is complete for all **currently implemented services**. Three panel components require new services that are deferred pending architecture review.

## Available Data (Wired & Ready)

### 1. Player Profile Panel ✓
**Hook:** `usePlayer(playerId)`
**Service:** `services/player/`
**Data Available:**
- `id` - Player UUID
- `first_name` - First name
- `last_name` - Last name
- `birth_date` - Birth date (for age calculation)
- `created_at` - Account creation timestamp

**Missing Fields (Not in Current Schema):**
- ❌ `email` - Not stored in player table
- ❌ `phone` - Not stored in player table
- ❌ `address` - Not stored in player table
- ❌ `gender` - Not stored in player table
- ❌ `tier` - Available from loyalty service (see below)
- ❌ `member_since` - Use `created_at` or enrollment date
- ❌ `status` - Derived from enrollment status
- ❌ `current_table` - Available from active visit/rating slip

**Workarounds:**
- **Tier:** Use `usePlayerLoyalty(playerId, casinoId).data.tier`
- **Current Table:** Use `usePlayerSessionActivity` to get `currentTableId` from active rating slip
- **Member Since:** Use `player.created_at` or fetch enrollment record
- **Status:** Derive from `useActiveVisit` - active visit = "active", no visit = "inactive"

---

### 2. Session Control Panel ✓
**Hooks:**
- `useActiveVisit(playerId)` - For check-in/out status
- `useRatingSlipList({ visit_id })` - For active slip data

**Service:** `services/visit/` + `services/rating-slip/`
**Data Available:**
- Visit status (active/closed)
- Session start/end times
- Visit kind (gaming/reward/ghost)
- Rating slip status (open/paused/closed)
- Table ID from active slip
- Average bet from rating slip
- Seat number

**Missing Fields:**
- ❌ `duration` - **Calculate from visit.started_at to now**
- ❌ `isPaused` - Check if active slip has `status === 'paused'`
- ❌ `handsPlayed` - **NOT AVAILABLE** (requires game event tracking - future enhancement)
- ❌ `timeLimit` / `spendLimit` - **NOT AVAILABLE** (requires player-compliance service)

**Workarounds:**
```typescript
// Duration calculation
const startTime = new Date(activeVisit.visit.started_at);
const now = new Date();
const durationMinutes = Math.floor((now - startTime) / (1000 * 60));

// Pause status
const isPaused = ratingSlips.items.some(slip => slip.status === 'paused');
```

---

### 3. Loyalty Panel ✓
**Hook:** `usePlayerLoyalty(playerId, casinoId)`
**Service:** `services/loyalty/`
**Data Available:**
- `currentBalance` - Available points
- `tier` - Player tier (bronze/silver/gold/platinum/diamond)
- `preferences` - Loyalty preferences (JSONB field)
- `updatedAt` - Last balance update

**Additional Queries:**
- `useLoyaltyLedger({ playerId, casinoId })` - For points history
- `useLoyaltySuggestion(ratingSlipId)` - For live points preview

**Missing Fields:**
- ❌ `pointsTotal` - **NOT AVAILABLE** (would need to sum all positive ledger entries)
- ❌ `nextTier` / `nextTierPoints` - **NOT AVAILABLE** (requires tier progression config)
- ❌ `benefits` - **NOT AVAILABLE** (requires tier benefits config)
- ❌ `achievements` - **NOT AVAILABLE** (requires player-achievement service)
- ❌ `offers` - **NOT AVAILABLE** (requires campaign/promotion service)

**Workarounds:**
- **Points Total:** Sum ledger entries with `reason: 'base_accrual' | 'promotion' | 'manual_reward'`
- **Next Tier:** Hardcode tier progression thresholds in frontend (or wait for config service)
- **Benefits/Offers:** Mock data until campaign service is implemented

---

### 4. Activity Visualization Panel ✓ (PARTIAL)
**Hooks:**
- `usePlayerSessionActivity({ activeVisit, ratingSlips })` - Custom composite hook
- `useRatingSlipList({ visit_id })` - For slip timeline

**Data Available:**
- Session start/end times
- Rating slip start/end times
- Table transitions (when player moves tables)
- Pause/resume events
- Current table location
- Session duration

**Missing Fields:**
- ❌ Hourly activity metrics (bets/hour, hands/hour) - **Requires game event tracking**
- ❌ Win/loss data - **Requires transaction/ledger integration**
- ❌ Real-time bet amounts - **Only average bet available on slip close**

**Workarounds:**
- Use rating slip timeline for activity visualization
- Show session duration and table transitions
- Display pause intervals (when `RatingSlipWithPausesDTO` is fetched)

---

## Unavailable Data (Requires New Services)

### 5. Performance Metrics Panel ❌
**Required Service:** `player-analytics` (DEFERRED)
**Missing Data:**
- Average session duration (historical)
- Win rate percentage
- Total hands played (historical)
- Average bet (historical aggregate)
- Daily/weekly performance trends

**Status:** Architecture review required before implementation.
**Recommendation:** Use mock data in frontend until service is designed.

---

### 6. Compliance & Risk Panel ❌
**Required Service:** `player-compliance` (DEFERRED)
**Missing Data:**
- Risk score calculation
- Age/identity verification status
- Play limit tracking (time/spend)
- Payment method verification
- Responsible gaming alerts
- Compliance status items

**Status:** Architecture review required before implementation.
**Recommendation:** Use mock data in frontend until service is designed.

---

### 7. Notes Panel ❌
**Required Service:** `player-note` (DEFERRED)
**Missing Data:**
- Player notes (create/read/update/delete)
- Note categories (preference/behavioral/incident/vip)
- Note priority levels
- Note flagging
- Author/timestamp tracking

**Status:** Architecture review required before implementation.
**Recommendation:** Use mock data in frontend until service is designed.

---

## Integration Guide for Frontend Developer

### Step 1: Import Dashboard Hooks

```typescript
import { usePlayerDashboard, usePlayerSessionActivity } from '@/hooks/player-dashboard';
```

### Step 2: Get Casino Context

```typescript
// Assuming you have a casino context provider
const casinoId = 'your-casino-id'; // From context/auth
```

### Step 3: Use Composite Hook

```typescript
function PlayerDashboard({ selectedPlayerId }: { selectedPlayerId: string | null }) {
  const dashboard = usePlayerDashboard({
    playerId: selectedPlayerId,
    casinoId,
    enableRealtime: true, // Enable polling for active sessions
  });

  // Session activity data (for activity panel)
  const sessionActivity = usePlayerSessionActivity({
    activeVisit: dashboard.activeVisit.data,
    ratingSlips: dashboard.ratingSlips.data,
  });

  if (dashboard.isLoading) return <LoadingSpinner />;
  if (dashboard.hasError) return <ErrorMessage />;

  return (
    <div>
      {/* 1. Player Profile Panel */}
      <PlayerProfilePanel
        player={dashboard.player.data}
        tier={dashboard.loyalty.data?.tier}
        currentTable={sessionActivity.currentTableId}
      />

      {/* 2. Session Control Panel */}
      <SessionControlPanel
        activeVisit={dashboard.activeVisit.data}
        ratingSlips={dashboard.ratingSlips.data?.items}
        sessionActivity={sessionActivity}
      />

      {/* 3. Loyalty Panel */}
      <LoyaltyPanel loyalty={dashboard.loyalty.data} />

      {/* 4. Activity Visualization Panel */}
      <ActivityVisualizationPanel sessionActivity={sessionActivity} />

      {/* 5-7: Use mock data for now */}
      <MetricsPanel playerId={selectedPlayerId} useMockData />
      <CompliancePanel playerId={selectedPlayerId} useMockData />
      <NotesPanel playerId={selectedPlayerId} useMockData />
    </div>
  );
}
```

### Step 4: Handling Missing Fields

For fields not in the backend (email, phone, etc.), either:
1. **Remove from UI** - Simplify the profile panel to only show available data
2. **Use mock data** - Display placeholder data with a visual indicator
3. **Wait for schema update** - These fields may be added to player table later

### Step 5: Derived Calculations

```typescript
// Example: Calculate session duration
function useSessionDuration(startedAt: string | undefined) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!startedAt) return;

    const interval = setInterval(() => {
      const start = new Date(startedAt);
      const now = new Date();
      const minutes = Math.floor((now.getTime() - start.getTime()) / (1000 * 60));
      setDuration(minutes);
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [startedAt]);

  return duration;
}

// Example: Format duration
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
```

---

## Type Definitions Reference

All DTOs are re-exported from service hooks for convenience:

```typescript
// Player data
import type { PlayerDTO } from '@/hooks/player';

// Visit data
import type { ActiveVisitDTO, VisitDTO } from '@/hooks/visit';

// Rating slip data
import type { RatingSlipDTO } from '@/hooks/rating-slip';

// Loyalty data
import type { PlayerLoyaltyDTO, LoyaltyLedgerEntryDTO } from '@/hooks/loyalty';
```

---

## Next Steps

1. **Frontend Team:**
   - Wire up available data to dashboard panels (1, 2, 3, 4)
   - Keep mock data for unavailable panels (5, 6, 7)
   - Test with real player IDs from database

2. **Backend Team (Future):**
   - Design `player-analytics` service for metrics panel
   - Design `player-compliance` service for risk panel
   - Design `player-note` service for notes panel

3. **Product Team:**
   - Review which missing fields are critical (email, phone, etc.)
   - Decide if player schema should be extended
   - Prioritize deferred services (analytics vs compliance vs notes)

---

## Questions?

Contact the backend team if you need:
- Additional fields from existing services
- Clarification on DTO structures
- Help with data transformations
- Performance optimization for dashboard queries

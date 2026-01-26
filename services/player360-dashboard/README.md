# Player360DashboardService - ReadOnlyAggregation

> **Bounded Context**: Read-only aggregation layer for Player 360 dashboard
> **SRM Reference**: N/A (aggregation-only, no table ownership)
> **Pattern**: A (Contract-First)

## Purpose

Provides summary metrics, eligibility status, and activity series for the Player 360 dashboard panels. This service does NOT own any tables - it reads from existing bounded contexts.

## Ownership

**Tables**: None (read-only aggregation)

**DTOs Published**:
- `PlayerSummaryDTO` - Combined summary for Snapshot Band tiles
- `PlayerSessionValueDTO` - Session value metrics
- `PlayerCashVelocityDTO` - Cash velocity metrics
- `PlayerEngagementDTO` - Engagement status
- `RewardsEligibilityDTO` - Rewards eligibility status
- `WeeklySeriesDTO` - Weekly activity for charts
- `RewardHistoryItemDTO` - Reward history items
- `RecentEventsDTO` - Recent events for timeline strip

**RPCs**: None (uses existing RPCs from other services)

## Dependencies

**Consumes (read-only)**:
- `VisitContext` - Active visits, session duration
- `PlayerFinancialContext` - Transaction summaries
- `LoyaltyContext` - Rewards eligibility, history
- `PlayerTimelineContext` - Recent events via `rpc_get_player_timeline`

**Consumed By**:
- Player 360 Dashboard UI components
- Player 360 API routes

## API

### Functions

```typescript
// Get player summary for Snapshot Band tiles
getPlayerSummary(supabase, playerId, gamingDay?) -> PlayerSummaryDTO

// Get weekly activity series for Activity chart
getWeeklySeries(supabase, playerId, weeks?) -> WeeklySeriesDTO

// Get recent reward history
getRewardHistory(supabase, playerId, limit?) -> RewardHistoryItemDTO[]

// Get recent events for timeline strip
getRecentEvents(supabase, playerId) -> RecentEventsDTO
```

### Query Keys

```typescript
player360DashboardKeys.summary({ playerId, gamingDay? })
player360DashboardKeys.activity({ playerId, weeks? })
player360DashboardKeys.rewardHistory({ playerId, limit? })
player360DashboardKeys.recentEvents(playerId)
```

## References

- PRD-023: Player 360 Panels v0
- EXECUTION-SPEC-PRD-023.md: Workstream WS1
- ADR-029: Player 360 Timeline Dashboard (event taxonomy)

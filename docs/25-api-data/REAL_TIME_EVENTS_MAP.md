# Real-time Events Map — From SRM
**Date**: 2025-10-24

## Channels & Events
- `rating_slip.updated` → payload: rating_slip_id, player_id, casino_id, average_bet, minutes_played, game_type, at
- `loyalty.ledger_appended` → payload: ledger_id, player_id, points_earned, reason, rating_slip_id?, at

## Client Cache Actions (React Query)
- On `rating_slip.updated`
  - `setQueryData(['rating-slip','detail', rating_slip_id], payloadOrRefetch)`
  - Invalidate `['rating-slip','by-visit', visitId]` (batched, 250–500ms, `refetchType:'active'`)
- On `loyalty.ledger_appended`
  - Invalidate `['loyalty','ledger','by-player', player_id]` (batched)
  - `setQueryData(['player','loyalty','balance', player_id, casino_id], updater)` if cached

## Batching Policy
- Coalesce list invalidations every 250–500ms.
- Use `refetchType: 'active'` to avoid background refetch storms.

## Infinite Queries
- Maintain `{ pages, pageParams }` shape when merging.

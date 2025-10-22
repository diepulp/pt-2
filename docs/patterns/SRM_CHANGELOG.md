# SRM Changelog

## v3.0.2
- Documented casino ownership for Loyalty (`player_loyalty`, `loyalty_ledger`) and TableContext tables, adding triggers that enforce casino alignment on inserts/updates.
- Updated the mid-session reward RPC contract to require `casino_id` across validation, idempotency checks, and balance updates.
- Synced CI catalog sections by naming the canonical indexes and enumerating finance RLS/trigger expectations alongside the schema excerpts.
- Refreshed Supabase code samples to use lower_snake_case parameters and include casino-scoped filters.
- Added explicit finance RLS checklist coverage and surfaced the finance/MTL index definitions in the canonical SQL blocks.
- Embedded per-domain **RLS (excerpt)** sections so ownership policies travel with the contract.

## v3.0.0
- Standardized naming to lower_snake_case; removed quoted CamelCase.
- Unified identifier strategy to uuid for all PKs/FKs.
- Clarified JSON usage (extensions only).
- Loyalty is SoT; removed `rating_slip.points` cache in contract. (If you keep cache, record opposite here.)
- Reinstated casino ownership (`casino_id`) across TableContext, Finance, MTL.
- Added gaming_day computation contract for financial transactions.
- Added unique constraints (e.g., `game_settings` unique (casino_id, game_type)) and bet range checks.

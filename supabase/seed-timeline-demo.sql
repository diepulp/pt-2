  -- =====================================================
-- Timeline Demo Seed Data
-- Purpose: Create a player with full timeline events for UI preview
-- Run: npx supabase db execute --file supabase/seed-timeline-demo.sql
-- Player ID: a1000000-0000-0000-0000-000000000099
-- =====================================================

BEGIN;

-- Use Casino 1 and existing staff
-- Casino: ca000000-0000-0000-0000-000000000001
-- Staff (pit_boss): 5a000000-0000-0000-0000-000000000002

-- ============================================================================
-- 1. CREATE DEMO PLAYER
-- ============================================================================

INSERT INTO player (id, first_name, last_name, birth_date, email, phone_number)
VALUES (
  'a1000000-0000-0000-0000-000000000099',
  'Timeline',
  'Demo',
  '1985-06-15',
  'timeline.demo@example.com',
  '555-0199'
) ON CONFLICT (id) DO NOTHING;

-- Enroll at Casino 1
INSERT INTO player_casino (player_id, casino_id, status)
VALUES (
  'a1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  'active'
) ON CONFLICT (player_id, casino_id) DO NOTHING;

-- Create loyalty record
INSERT INTO player_loyalty (player_id, casino_id, current_balance, tier)
VALUES (
  'a1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  2500,
  'gold'
) ON CONFLICT (player_id, casino_id) DO NOTHING;

-- ============================================================================
-- 2. CREATE VISITS (Today and Yesterday)
-- ============================================================================

-- Today's active visit
INSERT INTO visit (id, player_id, casino_id, gaming_day, started_at, ended_at, visit_kind, visit_group_id)
VALUES (
  'b1000000-0000-0000-0000-000000000099',
  'a1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  CURRENT_DATE::text,
  NOW() - INTERVAL '3 hours',
  NULL,  -- Still active
  'gaming_identified_rated',
  'b9000000-0000-0000-0000-000000000099'
) ON CONFLICT (id) DO NOTHING;

-- Yesterday's closed visit
INSERT INTO visit (id, player_id, casino_id, gaming_day, started_at, ended_at, visit_kind, visit_group_id)
VALUES (
  'b1000000-0000-0000-0000-000000000098',
  'a1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  (CURRENT_DATE - 1)::text,
  NOW() - INTERVAL '1 day' - INTERVAL '5 hours',
  NOW() - INTERVAL '1 day' - INTERVAL '1 hour',
  'gaming_identified_rated',
  'b9000000-0000-0000-0000-000000000099'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. CREATE RATING SLIPS
-- ============================================================================

-- Active rating slip (today)
INSERT INTO rating_slip (
  id, casino_id, visit_id, table_id, seat_number,
  start_time, end_time, status, average_bet, accrual_kind,
  game_settings, policy_snapshot
)
VALUES (
  'd1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000099',
  'e1000000-0000-0000-0000-000000000001',  -- BJ-01
  '3',
  NOW() - INTERVAL '2 hours',
  NULL,  -- Still open
  'open',
  75.00,
  'loyalty',
  '{"game": "blackjack", "variant": "6deck"}',
  '{"base_rate": 0.1, "tier_multiplier": 1.5}'
) ON CONFLICT (id) DO NOTHING;

-- Closed rating slip (yesterday)
INSERT INTO rating_slip (
  id, casino_id, visit_id, table_id, seat_number,
  start_time, end_time, status, average_bet, final_duration_seconds, final_average_bet, accrual_kind,
  game_settings, policy_snapshot
)
VALUES (
  'd1000000-0000-0000-0000-000000000098',
  'ca000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000098',
  'e1000000-0000-0000-0000-000000000002',  -- BJ-02
  '5',
  NOW() - INTERVAL '1 day' - INTERVAL '4 hours',
  NOW() - INTERVAL '1 day' - INTERVAL '2 hours',
  'closed',
  100.00,
  7200,  -- 2 hours
  100.00,
  'loyalty',
  '{"game": "blackjack", "variant": "6deck"}',
  '{"base_rate": 0.1, "tier_multiplier": 1.5}'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. CREATE FINANCIAL TRANSACTIONS (with direction and source)
-- ============================================================================

-- Disable gaming day guard for historical data
ALTER TABLE player_financial_transaction DISABLE TRIGGER trg_guard_stale_gaming_day;

-- Today's buy-in
INSERT INTO player_financial_transaction (
  id, player_id, casino_id, visit_id, rating_slip_id,
  amount, direction, source, tender_type, txn_kind, gaming_day,
  created_by_staff_id, created_at
)
VALUES (
  'f1000000-0000-0000-0000-000000000099',
  'a1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000099',
  'd1000000-0000-0000-0000-000000000099',
  1500.00,
  'in',
  'pit',
  'cash',
  'original',
  CURRENT_DATE::text,
  '5a000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '2 hours 30 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Yesterday's buy-in
INSERT INTO player_financial_transaction (
  id, player_id, casino_id, visit_id, rating_slip_id,
  amount, direction, source, tender_type, txn_kind, gaming_day,
  created_by_staff_id, created_at
)
VALUES (
  'f1000000-0000-0000-0000-000000000098',
  'a1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000098',
  'd1000000-0000-0000-0000-000000000098',
  2000.00,
  'in',
  'pit',
  'cash',
  'original',
  (CURRENT_DATE - 1)::text,
  '5a000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '1 day' - INTERVAL '4 hours'
) ON CONFLICT (id) DO NOTHING;

-- Yesterday's cash-out
INSERT INTO player_financial_transaction (
  id, player_id, casino_id, visit_id, rating_slip_id,
  amount, direction, source, tender_type, txn_kind, gaming_day,
  created_by_staff_id, created_at
)
VALUES (
  'f1000000-0000-0000-0000-000000000097',
  'a1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000098',
  'd1000000-0000-0000-0000-000000000098',
  2800.00,
  'out',
  'cage',
  'cash',
  'original',
  (CURRENT_DATE - 1)::text,
  '5a000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '1 day' - INTERVAL '1 hour 30 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Re-enable trigger
ALTER TABLE player_financial_transaction ENABLE TRIGGER trg_guard_stale_gaming_day;

-- ============================================================================
-- 5. CREATE LOYALTY LEDGER ENTRIES
-- ============================================================================

-- Points earned from yesterday's play
INSERT INTO loyalty_ledger (
  id, casino_id, player_id, rating_slip_id, visit_id, staff_id,
  points_delta, reason, source_kind, source_id, created_at
)
VALUES (
  'e1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000099',
  'd1000000-0000-0000-0000-000000000098',
  'b1000000-0000-0000-0000-000000000098',
  '5a000000-0000-0000-0000-000000000002',
  150,
  'base_accrual',
  'rating_slip',
  'd1000000-0000-0000-0000-000000000098',
  NOW() - INTERVAL '1 day' - INTERVAL '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- Points redeemed yesterday
INSERT INTO loyalty_ledger (
  id, casino_id, player_id, visit_id, staff_id,
  points_delta, reason, note, created_at
)
VALUES (
  'e1000000-0000-0000-0000-000000000098',
  'ca000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000099',
  'b1000000-0000-0000-0000-000000000098',
  '5a000000-0000-0000-0000-000000000002',
  -50,
  'redeem',
  'Comp: Dinner at Steakhouse',
  NOW() - INTERVAL '1 day' - INTERVAL '1 hour 45 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Promotional bonus today
INSERT INTO loyalty_ledger (
  id, casino_id, player_id, visit_id, staff_id,
  points_delta, reason, note, created_at
)
VALUES (
  'e1000000-0000-0000-0000-000000000097',
  'ca000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000099',
  'b1000000-0000-0000-0000-000000000099',
  '5a000000-0000-0000-0000-000000000002',
  200,
  'promotion',
  'Tuesday Double Points promo',
  NOW() - INTERVAL '1 hour'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. CREATE MTL ENTRIES
-- ============================================================================

-- Large buy-in triggered MTL yesterday
INSERT INTO mtl_entry (
  id, patron_uuid, casino_id, staff_id, rating_slip_id, visit_id,
  amount, direction, area, txn_type, source, gaming_day, occurred_at,
  idempotency_key
)
VALUES (
  'c1000000-0000-0000-0000-000000000099',
  'a1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  '5a000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000098',
  'b1000000-0000-0000-0000-000000000098',
  2000.00,
  'in',
  'pit',
  'buy_in',
  'table',
  (CURRENT_DATE - 1)::text,
  NOW() - INTERVAL '1 day' - INTERVAL '4 hours',
  'mtl-demo-001'
) ON CONFLICT (id) DO NOTHING;

-- Cash-out MTL yesterday
INSERT INTO mtl_entry (
  id, patron_uuid, casino_id, staff_id, rating_slip_id, visit_id,
  amount, direction, area, txn_type, source, gaming_day, occurred_at,
  idempotency_key
)
VALUES (
  'c1000000-0000-0000-0000-000000000098',
  'a1000000-0000-0000-0000-000000000099',
  'ca000000-0000-0000-0000-000000000001',
  '5a000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000098',
  'b1000000-0000-0000-0000-000000000098',
  2800.00,
  'out',
  'cage',
  'redemption',
  'cage',
  (CURRENT_DATE - 1)::text,
  NOW() - INTERVAL '1 day' - INTERVAL '1 hour 30 minutes',
  'mtl-demo-002'
) ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================================
-- USAGE:
-- Player ID: a1000000-0000-0000-0000-000000000099
-- Timeline URL: /players/a1000000-0000-0000-0000-000000000099/timeline
--
-- Expected Timeline Events:
-- - visit_start (today, yesterday)
-- - visit_end (yesterday)
-- - rating_start (today, yesterday)
-- - rating_close (yesterday)
-- - cash_in (today, yesterday)
-- - cash_out (yesterday)
-- - points_earned (today, yesterday)
-- - points_redeemed (yesterday)
-- - mtl_recorded (yesterday - 2 entries)
-- ============================================================================

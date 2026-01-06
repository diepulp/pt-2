  -- PT-2 Seed Data
-- Purpose: Populate database with realistic test data for all rating slip workflows
-- Coverage: 2 casinos, 6 players, 3 tables, all rating slip states
-- Created: 2025-12-02
-- NOTE: All UUIDs use valid hex characters (0-9, a-f) only

-- ============================================================================
-- SEED SETUP: Temporarily relax constraints for development data
-- ============================================================================
-- Drop the staff role constraint (requires user_id for pit_boss/admin)
-- This is re-added at the end of the seed file
ALTER TABLE staff DROP CONSTRAINT IF EXISTS chk_staff_role_user_id;

-- ============================================================================
-- CLEANUP (for re-seeding)
-- ============================================================================
-- Note: Cascade deletes will clean up dependent records

TRUNCATE company CASCADE;

-- ============================================================================
-- 1. COMPANY (Parent entity)
-- ============================================================================

INSERT INTO company (id, name, legal_name) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Lucky Star Gaming Group', 'Lucky Star Gaming Holdings, LLC');

-- ============================================================================
-- 2. CASINOS (2 casinos)
-- ============================================================================

INSERT INTO casino (id, company_id, name, location, address, status) VALUES
  (
    'ca000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'Lucky Star Downtown',
    'Las Vegas, NV',
    '{"street": "123 Casino Blvd", "city": "Las Vegas", "state": "NV", "zip": "89101"}',
    'active'
  ),
  (
    'ca000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000001',
    'Lucky Star Resort',
    'Henderson, NV',
    '{"street": "456 Resort Way", "city": "Henderson", "state": "NV", "zip": "89002"}',
    'active'
  );

-- ============================================================================
-- 3. CASINO SETTINGS
-- ============================================================================

INSERT INTO casino_settings (id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold) VALUES
  (
    'c5000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000001',
    '06:00:00',
    'America/Los_Angeles',
    3000.00,
    10000.00
  ),
  (
    'c5000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000002',
    '06:00:00',
    'America/Los_Angeles',
    5000.00,
    10000.00
  );

-- ============================================================================
-- 4. STAFF (Dealers, Pit Bosses, Admins)
-- ============================================================================

-- Casino 1 Staff
INSERT INTO staff (id, casino_id, employee_id, first_name, last_name, email, role, status) VALUES
  -- Pit Bosses
  ('5a000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'PB001', 'Marcus', 'Thompson', 'marcus.thompson@luckystar.com', 'pit_boss', 'active'),
  ('5a000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'PB002', 'Sarah', 'Chen', 'sarah.chen@luckystar.com', 'pit_boss', 'active'),
  -- Dealers
  ('5a000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'DL001', 'James', 'Rodriguez', 'james.rodriguez@luckystar.com', 'dealer', 'active'),
  ('5a000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', 'DL002', 'Emily', 'Watson', 'emily.watson@luckystar.com', 'dealer', 'active'),
  ('5a000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', 'DL003', 'Michael', 'Lee', 'michael.lee@luckystar.com', 'dealer', 'active'),
  -- Admin
  ('5a000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000001', 'AD001', 'Jennifer', 'Martinez', 'jennifer.martinez@luckystar.com', 'admin', 'active');

-- Casino 2 Staff
INSERT INTO staff (id, casino_id, employee_id, first_name, last_name, email, role, status) VALUES
  -- Pit Bosses
  ('5a000000-0000-0000-0000-000000000007', 'ca000000-0000-0000-0000-000000000002', 'PB003', 'David', 'Kim', 'david.kim@luckystar.com', 'pit_boss', 'active'),
  -- Dealers
  ('5a000000-0000-0000-0000-000000000008', 'ca000000-0000-0000-0000-000000000002', 'DL004', 'Amanda', 'Johnson', 'amanda.johnson@luckystar.com', 'dealer', 'active'),
  ('5a000000-0000-0000-0000-000000000009', 'ca000000-0000-0000-0000-000000000002', 'DL005', 'Robert', 'Garcia', 'robert.garcia@luckystar.com', 'dealer', 'active'),
  -- Admin
  ('5a000000-0000-0000-0000-000000000010', 'ca000000-0000-0000-0000-000000000002', 'AD002', 'Linda', 'Brown', 'linda.brown@luckystar.com', 'admin', 'active');

-- ============================================================================
-- 5. GAMING TABLES (3 tables - one per game type at Casino 1)
-- ============================================================================

INSERT INTO gaming_table (id, casino_id, label, pit, type, status) VALUES
  -- Casino 1: Active tables
  ('6a000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'BJ-01', 'Pit A', 'blackjack', 'active'),
  ('6a000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'PK-01', 'Pit B', 'poker', 'active'),
  ('6a000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'RL-01', 'Pit A', 'roulette', 'active'),
  -- Casino 1: Inactive table (for testing state transitions)
  ('6a000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', 'BJ-02', 'Pit A', 'blackjack', 'inactive'),
  -- Casino 2: Tables
  ('6a000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000002', 'BJ-01', 'Main Pit', 'blackjack', 'active'),
  ('6a000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000002', 'BA-01', 'Main Pit', 'baccarat', 'active');

-- ============================================================================
-- 6. GAME SETTINGS (Per casino, per game type)
-- ============================================================================

-- NOTE: house_edge is stored as PERCENTAGE (e.g., 0.5 = 0.5%, not 0.005)
-- The calculate_theo_from_snapshot function divides by 100, so:
--   0.5% house edge → store as 0.5 → formula uses 0.5/100 = 0.005
INSERT INTO game_settings (id, casino_id, game_type, name, min_bet, max_bet, house_edge, decisions_per_hour, seats_available, rotation_interval_minutes, points_conversion_rate, point_multiplier) VALUES
  -- Casino 1
  ('65000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'blackjack', 'Standard Blackjack', 25.00, 5000.00, 0.5, 60, 7, 30, 10.0, 1.0),
  ('65000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'poker', 'Texas Hold''em', 50.00, 10000.00, 2.5, 30, 9, 60, 8.0, 1.0),
  ('65000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'roulette', 'American Roulette', 10.00, 2000.00, 5.3, 40, 8, 30, 12.0, 1.0),
  ('65000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', 'baccarat', 'Mini Baccarat', 100.00, 25000.00, 1.1, 80, 7, 30, 10.0, 1.5),
  -- Casino 2
  ('65000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000002', 'blackjack', 'High Limit Blackjack', 100.00, 25000.00, 0.4, 50, 6, 45, 15.0, 2.0),
  ('65000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000002', 'baccarat', 'VIP Baccarat', 500.00, 100000.00, 1.0, 70, 7, 60, 20.0, 2.5);

-- ============================================================================
-- 7. PLAYERS (6 players)
-- ============================================================================

INSERT INTO player (id, first_name, last_name, birth_date) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'John', 'Smith', '1980-05-15'),
  ('a1000000-0000-0000-0000-000000000002', 'Maria', 'Garcia', '1975-11-22'),
  ('a1000000-0000-0000-0000-000000000003', 'William', 'Johnson', '1988-03-10'),
  ('a1000000-0000-0000-0000-000000000004', 'Olivia', 'Williams', '1992-08-05'),
  ('a1000000-0000-0000-0000-000000000005', 'James', 'Brown', '1965-12-30'),
  ('a1000000-0000-0000-0000-000000000006', 'Sophia', 'Davis', '1995-07-18');

-- ============================================================================
-- 8. PLAYER-CASINO ENROLLMENTS
-- ============================================================================

-- All players enrolled at Casino 1
INSERT INTO player_casino (player_id, casino_id, status) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'active'),
  ('a1000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'active'),
  ('a1000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'active'),
  ('a1000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', 'active'),
  ('a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', 'active'),
  ('a1000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000001', 'active');

-- Some players also enrolled at Casino 2 (VIP cross-property)
INSERT INTO player_casino (player_id, casino_id, status) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'active'),
  ('a1000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000002', 'active'),
  ('a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000002', 'active');

-- ============================================================================
-- 9. PLAYER LOYALTY (Derived from enrollments)
-- ============================================================================
-- ISSUE-B5894ED8 P1 FIX: Instead of direct inserts that mask the production bug,
-- we derive player_loyalty records from player_casino enrollments.
-- This mimics the production path where rpc_create_player atomically creates both.
--
-- Step 1: Auto-create player_loyalty for all enrolled players (like rpc_create_player does)
-- Step 2: Update with seed-specific balances/tiers for test scenarios
-- ============================================================================

-- Step 1: Create player_loyalty for all enrollments (mimics rpc_create_player behavior)
INSERT INTO player_loyalty (player_id, casino_id, current_balance, tier, preferences, updated_at)
SELECT
  pc.player_id,
  pc.casino_id,
  0,              -- Initial balance (ADR-019: ledger-based, starts at 0)
  NULL,           -- No tier yet (assigned after earning thresholds)
  '{}'::jsonb,    -- Empty preferences
  NOW()
FROM player_casino pc
ON CONFLICT (player_id, casino_id) DO NOTHING;

-- Step 2: Update with seed-specific test data (tiers, balances, preferences)
-- Casino 1 loyalty
UPDATE player_loyalty SET current_balance = 15000, tier = 'Gold', preferences = '{"comps": true, "email_offers": true}'
WHERE player_id = 'a1000000-0000-0000-0000-000000000001' AND casino_id = 'ca000000-0000-0000-0000-000000000001';

UPDATE player_loyalty SET current_balance = 50000, tier = 'Platinum', preferences = '{"comps": true, "email_offers": true, "host_assigned": true}'
WHERE player_id = 'a1000000-0000-0000-0000-000000000002' AND casino_id = 'ca000000-0000-0000-0000-000000000001';

UPDATE player_loyalty SET current_balance = 2500, tier = 'Silver', preferences = '{"comps": true}'
WHERE player_id = 'a1000000-0000-0000-0000-000000000003' AND casino_id = 'ca000000-0000-0000-0000-000000000001';

UPDATE player_loyalty SET current_balance = 500, tier = 'Bronze', preferences = '{}'
WHERE player_id = 'a1000000-0000-0000-0000-000000000004' AND casino_id = 'ca000000-0000-0000-0000-000000000001';

UPDATE player_loyalty SET current_balance = 120000, tier = 'Diamond', preferences = '{"comps": true, "email_offers": true, "host_assigned": true, "vip_lounge": true}'
WHERE player_id = 'a1000000-0000-0000-0000-000000000005' AND casino_id = 'ca000000-0000-0000-0000-000000000001';

UPDATE player_loyalty SET current_balance = 100, tier = 'Bronze', preferences = '{}'
WHERE player_id = 'a1000000-0000-0000-0000-000000000006' AND casino_id = 'ca000000-0000-0000-0000-000000000001';

-- Casino 2 loyalty (cross-property players)
UPDATE player_loyalty SET current_balance = 8000, tier = 'Gold', preferences = '{"comps": true}'
WHERE player_id = 'a1000000-0000-0000-0000-000000000001' AND casino_id = 'ca000000-0000-0000-0000-000000000002';

UPDATE player_loyalty SET current_balance = 25000, tier = 'Platinum', preferences = '{"comps": true, "host_assigned": true}'
WHERE player_id = 'a1000000-0000-0000-0000-000000000002' AND casino_id = 'ca000000-0000-0000-0000-000000000002';

UPDATE player_loyalty SET current_balance = 75000, tier = 'Diamond', preferences = '{"comps": true, "vip_lounge": true}'
WHERE player_id = 'a1000000-0000-0000-0000-000000000005' AND casino_id = 'ca000000-0000-0000-0000-000000000002';

-- ============================================================================
-- 10. VISITS
-- ============================================================================

-- Active visits at Casino 1 (players currently on floor)
INSERT INTO visit (id, player_id, casino_id, started_at, ended_at) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 hours', NULL),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', NOW() - INTERVAL '4 hours', NULL),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', NOW() - INTERVAL '1 hour', NULL),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', NOW() - INTERVAL '30 minutes', NULL);

-- Closed visits (historical data)
INSERT INTO visit (id, player_id, casino_id, started_at, ended_at) VALUES
  -- Yesterday's visits
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', NOW() - INTERVAL '1 day' - INTERVAL '5 hours', NOW() - INTERVAL '1 day' - INTERVAL '1 hour'),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', NOW() - INTERVAL '1 day' - INTERVAL '8 hours', NOW() - INTERVAL '1 day' - INTERVAL '2 hours'),
  ('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000001', NOW() - INTERVAL '1 day' - INTERVAL '3 hours', NOW() - INTERVAL '1 day'),
  -- Last week visits
  ('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days' - INTERVAL '6 hours', NOW() - INTERVAL '3 days'),
  ('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', NOW() - INTERVAL '5 days' - INTERVAL '10 hours', NOW() - INTERVAL '5 days' - INTERVAL '2 hours');

-- Active visit at Casino 2
INSERT INTO visit (id, player_id, casino_id, started_at, ended_at) VALUES
  ('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000002', NOW() - INTERVAL '3 hours', NULL);

-- ============================================================================
-- 11. RATING SLIPS (All workflow states)
-- ============================================================================

-- --------------------------------
-- OPEN RATING SLIPS (Active play)
-- --------------------------------
-- NOTE: policy_snapshot populated per ADR-019 D2 with loyalty accrual parameters
-- accrual_kind defaults to 'loyalty' for normal rated gameplay

-- Player 1: Currently playing blackjack (open slip)
-- Note: player_id derived from visit.player_id per SRM v4.0.0
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    '6a000000-0000-0000-0000-000000000001',
    '3',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.5}',
    '{"loyalty": {"house_edge": 0.5, "decisions_per_hour": 60, "points_conversion_rate": 10.0, "point_multiplier": 1.0, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    150.00,
    NOW() - INTERVAL '90 minutes',
    NULL,
    'open'
  );

-- Player 3: Currently playing poker (open slip)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000003',
    '6a000000-0000-0000-0000-000000000002',
    '5',
    '{"game_type": "poker", "min_bet": 50, "max_bet": 10000, "house_edge": 2.5}',
    '{"loyalty": {"house_edge": 2.5, "decisions_per_hour": 30, "points_conversion_rate": 8.0, "point_multiplier": 1.0, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    200.00,
    NOW() - INTERVAL '45 minutes',
    NULL,
    'open'
  );

-- Player 4: Just sat down at roulette (open slip, no average_bet yet)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000003',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000004',
    '6a000000-0000-0000-0000-000000000003',
    '1',
    '{"game_type": "roulette", "min_bet": 10, "max_bet": 2000, "house_edge": 5.3}',
    '{"loyalty": {"house_edge": 5.3, "decisions_per_hour": 40, "points_conversion_rate": 12.0, "point_multiplier": 1.0, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    NULL,
    NOW() - INTERVAL '15 minutes',
    NULL,
    'open'
  );

-- --------------------------------
-- PAUSED RATING SLIPS (Player on break)
-- --------------------------------
-- NEW ARCHITECTURE: pause_intervals tstzrange[] column on rating_slip
-- No longer using separate rating_slip_pause table

-- Player 2: On break from blackjack (paused slip)
-- pause_intervals contains open-ended range (current pause, no end time)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status, pause_intervals) VALUES
  (
    'd1000000-0000-0000-0000-000000000004',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002',
    '6a000000-0000-0000-0000-000000000001',
    '6',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.5}',
    '{"loyalty": {"house_edge": 0.5, "decisions_per_hour": 60, "points_conversion_rate": 10.0, "point_multiplier": 1.0, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    500.00,
    NOW() - INTERVAL '3 hours',
    NULL,
    'paused',
    ARRAY[tstzrange(NOW() - INTERVAL '30 minutes', NULL)]  -- Active pause (open-ended)
  );

-- --------------------------------
-- CLOSED RATING SLIPS (Completed sessions)
-- --------------------------------

-- Player 1: Yesterday's blackjack session (closed)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000005',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000005',
    '6a000000-0000-0000-0000-000000000001',
    '4',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.5}',
    '{"loyalty": {"house_edge": 0.5, "decisions_per_hour": 60, "points_conversion_rate": 10.0, "point_multiplier": 1.0, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    175.00,
    NOW() - INTERVAL '1 day' - INTERVAL '4 hours',
    NOW() - INTERVAL '1 day' - INTERVAL '2 hours',
    'closed'
  );

-- Player 5: Yesterday's long session with pauses (closed)
-- pause_intervals contains two completed pause ranges (both have end times)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status, pause_intervals) VALUES
  (
    'd1000000-0000-0000-0000-000000000006',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000006',
    '6a000000-0000-0000-0000-000000000001',
    '1',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.5}',
    '{"loyalty": {"house_edge": 0.5, "decisions_per_hour": 60, "points_conversion_rate": 10.0, "point_multiplier": 1.0, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    1000.00,
    NOW() - INTERVAL '1 day' - INTERVAL '7 hours',
    NOW() - INTERVAL '1 day' - INTERVAL '3 hours',
    'closed',
    ARRAY[
      tstzrange(NOW() - INTERVAL '1 day' - INTERVAL '6 hours', NOW() - INTERVAL '1 day' - INTERVAL '5 hours' - INTERVAL '30 minutes'),
      tstzrange(NOW() - INTERVAL '1 day' - INTERVAL '4 hours' - INTERVAL '30 minutes', NOW() - INTERVAL '1 day' - INTERVAL '4 hours')
    ]  -- Two completed pauses
  );

-- Player 6: Yesterday's roulette session (closed)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000007',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000007',
    '6a000000-0000-0000-0000-000000000003',
    '7',
    '{"game_type": "roulette", "min_bet": 10, "max_bet": 2000, "house_edge": 5.3}',
    '{"loyalty": {"house_edge": 5.3, "decisions_per_hour": 40, "points_conversion_rate": 12.0, "point_multiplier": 1.0, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    50.00,
    NOW() - INTERVAL '1 day' - INTERVAL '2 hours',
    NOW() - INTERVAL '1 day' - INTERVAL '1 hour',
    'closed'
  );

-- Player 2: Last week's session at Casino 1 (closed)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000008',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000008',
    '6a000000-0000-0000-0000-000000000002',
    '2',
    '{"game_type": "poker", "min_bet": 50, "max_bet": 10000, "house_edge": 2.5}',
    '{"loyalty": {"house_edge": 2.5, "decisions_per_hour": 30, "points_conversion_rate": 8.0, "point_multiplier": 1.0, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    750.00,
    NOW() - INTERVAL '3 days' - INTERVAL '5 hours',
    NOW() - INTERVAL '3 days' - INTERVAL '1 hour',
    'closed'
  );

-- Player 5: Historical high-roller session (closed)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000009',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000009',
    '6a000000-0000-0000-0000-000000000001',
    '1',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.5}',
    '{"loyalty": {"house_edge": 0.5, "decisions_per_hour": 60, "points_conversion_rate": 10.0, "point_multiplier": 1.0, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    2500.00,
    NOW() - INTERVAL '5 days' - INTERVAL '8 hours',
    NOW() - INTERVAL '5 days' - INTERVAL '3 hours',
    'closed'
  );

-- --------------------------------
-- Casino 2: Rating slips
-- --------------------------------

-- Player 5: Currently playing at Casino 2 (open slip) - VIP baccarat with higher multipliers
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, policy_snapshot, accrual_kind, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000010',
    'ca000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000010',
    '6a000000-0000-0000-0000-000000000006',
    '3',
    '{"game_type": "baccarat", "min_bet": 500, "max_bet": 100000, "house_edge": 1.0}',
    '{"loyalty": {"house_edge": 1.0, "decisions_per_hour": 70, "points_conversion_rate": 20.0, "point_multiplier": 2.5, "policy_version": "loyalty_points_v1"}, "_source": {"house_edge": "game_settings", "decisions_per_hour": "game_settings", "points_conversion_rate": "game_settings", "point_multiplier": "game_settings"}}',
    'loyalty',
    5000.00,
    NOW() - INTERVAL '2 hours',
    NULL,
    'open'
  );

-- ============================================================================
-- 12. LOYALTY LEDGER (Points earned from sessions)
-- ============================================================================
-- NEW ARCHITECTURE (PRD-004/ADR-019 v2):
--   - points_delta (signed int, was points_earned)
--   - reason enum: base_accrual, promotion, redeem, manual_reward, adjustment, reversal
--   - metadata jsonb: holds theo_cents, average_bet, duration_seconds, game_type, etc.
--   - source_kind/source_id for provenance tracking

-- Points from yesterday's sessions
INSERT INTO loyalty_ledger (id, casino_id, player_id, rating_slip_id, visit_id, staff_id, points_delta, reason, source_kind, source_id, metadata) VALUES
  -- Player 1's session (base_accrual on slip close)
  (
    '11000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000005',
    'b1000000-0000-0000-0000-000000000005',
    '5a000000-0000-0000-0000-000000000001',
    350,
    'base_accrual',
    'rating_slip',
    'd1000000-0000-0000-0000-000000000005',
    '{"theo_cents": 3500, "average_bet": 175.00, "duration_seconds": 7200, "game_type": "blackjack", "house_edge": 0.5}'
  ),
  -- Player 5's long session (base_accrual on slip close)
  (
    '11000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000005',
    'd1000000-0000-0000-0000-000000000006',
    'b1000000-0000-0000-0000-000000000006',
    '5a000000-0000-0000-0000-000000000002',
    2000,
    'base_accrual',
    'rating_slip',
    'd1000000-0000-0000-0000-000000000006',
    '{"theo_cents": 20000, "average_bet": 1000.00, "duration_seconds": 12600, "game_type": "blackjack", "house_edge": 0.5}'
  ),
  -- Player 6's roulette session (base_accrual)
  (
    '11000000-0000-0000-0000-000000000003',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000006',
    'd1000000-0000-0000-0000-000000000007',
    'b1000000-0000-0000-0000-000000000007',
    '5a000000-0000-0000-0000-000000000002',
    100,
    'base_accrual',
    'rating_slip',
    'd1000000-0000-0000-0000-000000000007',
    '{"theo_cents": 1000, "average_bet": 50.00, "duration_seconds": 3600, "game_type": "roulette", "house_edge": 5.3}'
  );

-- Historical points
INSERT INTO loyalty_ledger (id, casino_id, player_id, rating_slip_id, visit_id, staff_id, points_delta, reason, source_kind, source_id, metadata, created_at) VALUES
  -- Player 2's poker session
  (
    '11000000-0000-0000-0000-000000000004',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000008',
    'b1000000-0000-0000-0000-000000000008',
    '5a000000-0000-0000-0000-000000000001',
    1500,
    'base_accrual',
    'rating_slip',
    'd1000000-0000-0000-0000-000000000008',
    '{"theo_cents": 15000, "average_bet": 750.00, "duration_seconds": 14400, "game_type": "poker", "house_edge": 2.5}',
    NOW() - INTERVAL '3 days'
  ),
  -- Player 5's high-roller session
  (
    '11000000-0000-0000-0000-000000000005',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000005',
    'd1000000-0000-0000-0000-000000000009',
    'b1000000-0000-0000-0000-000000000009',
    '5a000000-0000-0000-0000-000000000001',
    5000,
    'base_accrual',
    'rating_slip',
    'd1000000-0000-0000-0000-000000000009',
    '{"theo_cents": 50000, "average_bet": 2500.00, "duration_seconds": 18000, "game_type": "blackjack", "house_edge": 0.5}',
    NOW() - INTERVAL '5 days'
  ),
  -- Promotion credit for Player 2
  (
    '11000000-0000-0000-0000-000000000006',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    NULL,
    NULL,
    '5a000000-0000-0000-0000-000000000006',
    10000,
    'promotion',
    'campaign',
    NULL,
    '{"campaign_name": "Welcome Bonus", "description": "New player signup bonus"}',
    NOW() - INTERVAL '7 days'
  );

-- ============================================================================
-- 13. FINANCIAL TRANSACTIONS (Buy-ins and cash-outs)
-- ============================================================================

-- Current session buy-ins
INSERT INTO player_financial_transaction (id, player_id, casino_id, visit_id, rating_slip_id, amount, tender_type) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 1000.00, 'cash'),
  ('f1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', 5000.00, 'cash'),
  ('f1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002', 2000.00, 'marker'),
  ('f1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000003', 500.00, 'cash');

-- Yesterday's transactions (closed slips)
INSERT INTO player_financial_transaction (id, player_id, casino_id, visit_id, rating_slip_id, amount, tender_type, created_at) VALUES
  -- Player 1 buy-in and cash-out
  ('f1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005', 1000.00, 'cash', NOW() - INTERVAL '1 day' - INTERVAL '4 hours'),
  ('f1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005', -1250.00, 'cash', NOW() - INTERVAL '1 day' - INTERVAL '2 hours'),
  -- Player 5 high-roller session
  ('f1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000006', 10000.00, 'cash', NOW() - INTERVAL '1 day' - INTERVAL '7 hours'),
  ('f1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000006', 5000.00, 'marker', NOW() - INTERVAL '1 day' - INTERVAL '5 hours'),
  ('f1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000006', -18000.00, 'cash', NOW() - INTERVAL '1 day' - INTERVAL '3 hours'),
  -- Player 6 small session
  ('f1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000007', 200.00, 'cash', NOW() - INTERVAL '1 day' - INTERVAL '2 hours'),
  ('f1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000007', -150.00, 'cash', NOW() - INTERVAL '1 day' - INTERVAL '1 hour');

-- Casino 2 transactions
INSERT INTO player_financial_transaction (id, player_id, casino_id, visit_id, rating_slip_id, amount, tender_type) VALUES
  ('f1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000010', 50000.00, 'cash');

-- ============================================================================
-- 14. DEALER ROTATIONS
-- ============================================================================

-- Current dealer assignments
INSERT INTO dealer_rotation (id, casino_id, table_id, staff_id, started_at, ended_at) VALUES
  ('d2000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000003', NOW() - INTERVAL '30 minutes', NULL),
  ('d2000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000004', NOW() - INTERVAL '45 minutes', NULL),
  ('d2000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000005', NOW() - INTERVAL '20 minutes', NULL);

-- Historical rotations (ended)
INSERT INTO dealer_rotation (id, casino_id, table_id, staff_id, started_at, ended_at) VALUES
  ('d2000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000004', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes'),
  ('d2000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000005', NOW() - INTERVAL '1 hour' - INTERVAL '30 minutes', NOW() - INTERVAL '1 hour');

-- Casino 2 dealer assignments
INSERT INTO dealer_rotation (id, casino_id, table_id, staff_id, started_at, ended_at) VALUES
  ('d2000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000002', '6a000000-0000-0000-0000-000000000005', '5a000000-0000-0000-0000-000000000008', NOW() - INTERVAL '1 hour', NULL),
  ('d2000000-0000-0000-0000-000000000007', 'ca000000-0000-0000-0000-000000000002', '6a000000-0000-0000-0000-000000000006', '5a000000-0000-0000-0000-000000000009', NOW() - INTERVAL '2 hours', NULL);

-- ============================================================================
-- 15. AUDIT LOG ENTRIES (Sample compliance records)
-- ============================================================================

INSERT INTO audit_log (id, casino_id, domain, actor_id, action, details) VALUES
  -- Rating slip lifecycle events
  ('a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'rating-slip', '5a000000-0000-0000-0000-000000000001', 'start_rating_slip', '{"rating_slip_id": "d1000000-0000-0000-0000-000000000001", "player_id": "a1000000-0000-0000-0000-000000000001", "table_id": "6a000000-0000-0000-0000-000000000001"}'),
  ('a0000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'rating-slip', '5a000000-0000-0000-0000-000000000001', 'pause_rating_slip', '{"rating_slip_id": "d1000000-0000-0000-0000-000000000004"}'),
  ('a0000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'rating-slip', '5a000000-0000-0000-0000-000000000002', 'close_rating_slip', '{"rating_slip_id": "d1000000-0000-0000-0000-000000000005", "duration_seconds": 7200, "average_bet": 175}'),
  -- Table status changes
  ('a0000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', 'table-context', '5a000000-0000-0000-0000-000000000001', 'update_table_status', '{"table_id": "6a000000-0000-0000-0000-000000000001", "from_status": "inactive", "to_status": "active"}'),
  ('a0000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', 'table-context', '5a000000-0000-0000-0000-000000000001', 'update_table_status', '{"table_id": "6a000000-0000-0000-0000-000000000002", "from_status": "inactive", "to_status": "active"}');

-- ============================================================================
-- 16. MTL ENTRIES (Compliance tracking)
-- ============================================================================

INSERT INTO mtl_entry (id, patron_uuid, casino_id, staff_id, rating_slip_id, visit_id, amount, direction, area, txn_type) VALUES
  -- Player 5's large buy-in yesterday (over CTR threshold)
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000006', 10000.00, 'in', 'table', 'buy_in'),
  -- Player 5's additional marker (credit taken at cage)
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000006', 5000.00, 'in', 'cage', 'marker'),
  -- Player 5's cash-out (chips to cash at cage)
  ('a5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000006', 18000.00, 'out', 'cage', 'cash_out'),
  -- Casino 2 high-roller current session
  ('a5000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000010', 50000.00, 'in', 'table', 'buy_in');

-- MTL audit notes
INSERT INTO mtl_audit_note (id, mtl_entry_id, staff_id, note) VALUES
  ('a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'Regular patron, verified ID on file. Cash buy-in at table.'),
  ('a6000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000007', 'VIP cross-property player. Verified Diamond status. Cash transaction documented.');

-- ============================================================================
-- 17. DEVELOPMENT AUTH USER
-- ============================================================================
-- Creates a test auth user for local development and integration testing.
-- This user is linked to Marcus Thompson (pit boss) at Casino 1.
--
-- Credentials:
--   Email: pitboss@dev.local
--   Password: devpass123
--
-- WARNING: This user should ONLY exist in development/test databases.
-- ============================================================================

-- Create dev auth user
-- Note: encrypted_password is bcrypt hash of 'devpass123'
-- Generated with: SELECT crypt('devpass123', gen_salt('bf'));
-- IMPORTANT: GoTrue cannot handle NULL for string columns - must use empty strings
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  -- GoTrue requires these to be non-NULL (empty string, not NULL)
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone,
  phone_change,
  phone_change_token
) VALUES (
  'a0000000-0000-0000-0000-000000000de0', -- Using valid hex UUID
  '00000000-0000-0000-0000-000000000000',
  'pitboss@dev.local',
  crypt('devpass123', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"name": "Marcus Thompson (Dev)", "role": "pit_boss"}',
  'authenticated',
  'authenticated',
  NOW(),
  NOW(),
  '',
  '',
  -- Empty strings for GoTrue compatibility
  '',
  '',
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Link dev auth user to Marcus Thompson staff record
UPDATE staff
SET user_id = 'a0000000-0000-0000-0000-000000000de0'
WHERE id = '5a000000-0000-0000-0000-000000000001';

-- Create identity for email login
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000de0',
  'a0000000-0000-0000-0000-000000000de0',
  '{"sub": "a0000000-0000-0000-0000-000000000de0", "email": "pitboss@dev.local"}',
  'email',
  'pitboss@dev.local',
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- ============================================================================
-- SEED COMPLETE
-- ============================================================================
--
-- NOTE: The chk_staff_role_user_id constraint is DISABLED for this seed data.
-- In production, pit_boss and admin staff would require linked auth.users.
-- For local development/testing, we use mock staff without auth integration.
--
-- DEV USER CREDENTIALS (for integration testing):
--   Email: pitboss@dev.local
--   Password: devpass123
--   Staff: Marcus Thompson (Pit Boss, Casino 1)
--
-- Summary:
-- - 1 Company
-- - 2 Casinos with settings
-- - 10 Staff members (pit bosses, dealers, admins)
-- - 6 Gaming tables (3 active at Casino 1, 1 inactive, 2 at Casino 2)
-- - 6 Game settings (per casino, per game type)
--     - Includes points_conversion_rate and point_multiplier (ISSUE-752833A6)
-- - 6 Players with casino enrollments
-- - 9 Player loyalty records (with tiers)
-- - 10 Visits (4 active, 6 closed)
-- - 10 Rating slips:
--     - 4 Open (active gameplay)
--     - 1 Paused (player on break, with pause_intervals)
--     - 5 Closed (completed sessions, 1 with pause_intervals history)
--     - All slips include policy_snapshot.loyalty (ADR-019 D2)
--     - All slips include accrual_kind='loyalty' (ADR-014)
-- - pause_intervals stored inline on rating_slip (NEW ARCHITECTURE)
-- - policy_snapshot JSONB with loyalty accrual parameters (ISSUE-752833A6)
-- - accrual_kind discriminator for loyalty vs compliance_only (ADR-014)
-- - 6 Loyalty ledger entries (NEW ARCHITECTURE: points_delta, metadata jsonb)
-- - 12 Financial transactions
-- - 7 Dealer rotations
-- - 5 Audit log entries
-- - 4 MTL entries with 2 audit notes
-- ============================================================================

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

INSERT INTO game_settings (id, casino_id, game_type, name, min_bet, max_bet, house_edge, decisions_per_hour, seats_available, rotation_interval_minutes) VALUES
  -- Casino 1
  ('65000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'blackjack', 'Standard Blackjack', 25.00, 5000.00, 0.005, 60, 7, 30),
  ('65000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'poker', 'Texas Hold''em', 50.00, 10000.00, 0.025, 30, 9, 60),
  ('65000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'roulette', 'American Roulette', 10.00, 2000.00, 0.053, 40, 8, 30),
  ('65000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', 'baccarat', 'Mini Baccarat', 100.00, 25000.00, 0.011, 80, 7, 30),
  -- Casino 2
  ('65000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000002', 'blackjack', 'High Limit Blackjack', 100.00, 25000.00, 0.004, 50, 6, 45),
  ('65000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000002', 'baccarat', 'VIP Baccarat', 500.00, 100000.00, 0.010, 70, 7, 60);

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
-- 9. PLAYER LOYALTY (Initial balances and tiers)
-- ============================================================================

INSERT INTO player_loyalty (player_id, casino_id, balance, tier, preferences) VALUES
  -- Casino 1 loyalty
  ('a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 15000, 'Gold', '{"comps": true, "email_offers": true}'),
  ('a1000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 50000, 'Platinum', '{"comps": true, "email_offers": true, "host_assigned": true}'),
  ('a1000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 2500, 'Silver', '{"comps": true}'),
  ('a1000000-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', 500, 'Bronze', '{}'),
  ('a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', 120000, 'Diamond', '{"comps": true, "email_offers": true, "host_assigned": true, "vip_lounge": true}'),
  ('a1000000-0000-0000-0000-000000000006', 'ca000000-0000-0000-0000-000000000001', 100, 'Bronze', '{}'),
  -- Casino 2 loyalty (cross-property players)
  ('a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 8000, 'Gold', '{"comps": true}'),
  ('a1000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000002', 25000, 'Platinum', '{"comps": true, "host_assigned": true}'),
  ('a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000002', 75000, 'Diamond', '{"comps": true, "vip_lounge": true}');

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

-- Player 1: Currently playing blackjack (open slip)
-- Note: player_id derived from visit.player_id per SRM v4.0.0
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    '6a000000-0000-0000-0000-000000000001',
    '3',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.005}',
    150.00,
    NOW() - INTERVAL '90 minutes',
    NULL,
    'open'
  );

-- Player 3: Currently playing poker (open slip)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000003',
    '6a000000-0000-0000-0000-000000000002',
    '5',
    '{"game_type": "poker", "min_bet": 50, "max_bet": 10000, "house_edge": 0.025}',
    200.00,
    NOW() - INTERVAL '45 minutes',
    NULL,
    'open'
  );

-- Player 4: Just sat down at roulette (open slip, no average_bet yet)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000003',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000004',
    '6a000000-0000-0000-0000-000000000003',
    '1',
    '{"game_type": "roulette", "min_bet": 10, "max_bet": 2000, "house_edge": 0.053}',
    NULL,
    NOW() - INTERVAL '15 minutes',
    NULL,
    'open'
  );

-- --------------------------------
-- PAUSED RATING SLIPS (Player on break)
-- --------------------------------

-- Player 2: On break from blackjack (paused slip)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000004',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002',
    '6a000000-0000-0000-0000-000000000001',
    '6',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.005}',
    500.00,
    NOW() - INTERVAL '3 hours',
    NULL,
    'paused'
  );

-- Pause record for Player 2
INSERT INTO rating_slip_pause (id, rating_slip_id, casino_id, started_at, ended_at, created_by) VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000004',
    'ca000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '30 minutes',
    NULL,  -- Still paused
    '5a000000-0000-0000-0000-000000000001'
  );

-- --------------------------------
-- CLOSED RATING SLIPS (Completed sessions)
-- --------------------------------

-- Player 1: Yesterday's blackjack session (closed)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000005',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000005',
    '6a000000-0000-0000-0000-000000000001',
    '4',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.005}',
    175.00,
    NOW() - INTERVAL '1 day' - INTERVAL '4 hours',
    NOW() - INTERVAL '1 day' - INTERVAL '2 hours',
    'closed'
  );

-- Player 5: Yesterday's long session with pauses (closed)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000006',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000006',
    '6a000000-0000-0000-0000-000000000001',
    '1',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.005}',
    1000.00,
    NOW() - INTERVAL '1 day' - INTERVAL '7 hours',
    NOW() - INTERVAL '1 day' - INTERVAL '3 hours',
    'closed'
  );

-- Pause records for Player 5's closed session (two breaks)
INSERT INTO rating_slip_pause (id, rating_slip_id, casino_id, started_at, ended_at, created_by) VALUES
  (
    'e1000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000006',
    'ca000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '1 day' - INTERVAL '6 hours',
    NOW() - INTERVAL '1 day' - INTERVAL '5 hours' - INTERVAL '30 minutes',
    '5a000000-0000-0000-0000-000000000001'
  ),
  (
    'e1000000-0000-0000-0000-000000000003',
    'd1000000-0000-0000-0000-000000000006',
    'ca000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '1 day' - INTERVAL '4 hours' - INTERVAL '30 minutes',
    NOW() - INTERVAL '1 day' - INTERVAL '4 hours',
    '5a000000-0000-0000-0000-000000000002'
  );

-- Player 6: Yesterday's roulette session (closed)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000007',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000007',
    '6a000000-0000-0000-0000-000000000003',
    '7',
    '{"game_type": "roulette", "min_bet": 10, "max_bet": 2000, "house_edge": 0.053}',
    50.00,
    NOW() - INTERVAL '1 day' - INTERVAL '2 hours',
    NOW() - INTERVAL '1 day' - INTERVAL '1 hour',
    'closed'
  );

-- Player 2: Last week's session at Casino 1 (closed)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000008',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000008',
    '6a000000-0000-0000-0000-000000000002',
    '2',
    '{"game_type": "poker", "min_bet": 50, "max_bet": 10000, "house_edge": 0.025}',
    750.00,
    NOW() - INTERVAL '3 days' - INTERVAL '5 hours',
    NOW() - INTERVAL '3 days' - INTERVAL '1 hour',
    'closed'
  );

-- Player 5: Historical high-roller session (closed)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000009',
    'ca000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000009',
    '6a000000-0000-0000-0000-000000000001',
    '1',
    '{"game_type": "blackjack", "min_bet": 25, "max_bet": 5000, "house_edge": 0.005}',
    2500.00,
    NOW() - INTERVAL '5 days' - INTERVAL '8 hours',
    NOW() - INTERVAL '5 days' - INTERVAL '3 hours',
    'closed'
  );

-- --------------------------------
-- Casino 2: Rating slips
-- --------------------------------

-- Player 5: Currently playing at Casino 2 (open slip)
INSERT INTO rating_slip (id, casino_id, visit_id, table_id, seat_number, game_settings, average_bet, start_time, end_time, status) VALUES
  (
    'd1000000-0000-0000-0000-000000000010',
    'ca000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000010',
    '6a000000-0000-0000-0000-000000000006',
    '3',
    '{"game_type": "baccarat", "min_bet": 500, "max_bet": 100000, "house_edge": 0.010}',
    5000.00,
    NOW() - INTERVAL '2 hours',
    NULL,
    'open'
  );

-- ============================================================================
-- 12. LOYALTY LEDGER (Points earned from sessions)
-- ============================================================================

-- Points from yesterday's sessions
INSERT INTO loyalty_ledger (id, casino_id, player_id, rating_slip_id, visit_id, staff_id, points_earned, reason, average_bet, duration_seconds, game_type) VALUES
  -- Player 1's session
  (
    '11000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000005',
    'b1000000-0000-0000-0000-000000000005',
    '5a000000-0000-0000-0000-000000000001',
    350,
    'session_end',
    175.00,
    7200,
    'blackjack'
  ),
  -- Player 5's long session (mid-session + end)
  (
    '11000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000005',
    'd1000000-0000-0000-0000-000000000006',
    'b1000000-0000-0000-0000-000000000006',
    '5a000000-0000-0000-0000-000000000001',
    500,
    'mid_session',
    1000.00,
    3600,
    'blackjack'
  ),
  (
    '11000000-0000-0000-0000-000000000003',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000005',
    'd1000000-0000-0000-0000-000000000006',
    'b1000000-0000-0000-0000-000000000006',
    '5a000000-0000-0000-0000-000000000002',
    2000,
    'session_end',
    1000.00,
    12600,
    'blackjack'
  ),
  -- Player 6's roulette session
  (
    '11000000-0000-0000-0000-000000000004',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000006',
    'd1000000-0000-0000-0000-000000000007',
    'b1000000-0000-0000-0000-000000000007',
    '5a000000-0000-0000-0000-000000000002',
    100,
    'session_end',
    50.00,
    3600,
    'roulette'
  );

-- Historical points
INSERT INTO loyalty_ledger (id, casino_id, player_id, rating_slip_id, visit_id, staff_id, points_earned, reason, average_bet, duration_seconds, game_type, created_at) VALUES
  -- Player 2's poker session
  (
    '11000000-0000-0000-0000-000000000005',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000008',
    'b1000000-0000-0000-0000-000000000008',
    '5a000000-0000-0000-0000-000000000001',
    1500,
    'session_end',
    750.00,
    14400,
    'poker',
    NOW() - INTERVAL '3 days'
  ),
  -- Player 5's high-roller session
  (
    '11000000-0000-0000-0000-000000000006',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000005',
    'd1000000-0000-0000-0000-000000000009',
    'b1000000-0000-0000-0000-000000000009',
    '5a000000-0000-0000-0000-000000000001',
    5000,
    'session_end',
    2500.00,
    18000,
    'blackjack',
    NOW() - INTERVAL '5 days'
  ),
  -- Manual adjustment for Player 2 (promotion)
  (
    '11000000-0000-0000-0000-000000000007',
    'ca000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    NULL,
    NULL,
    '5a000000-0000-0000-0000-000000000006',
    10000,
    'promotion',
    NULL,
    NULL,
    NULL,
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

INSERT INTO mtl_entry (id, patron_uuid, casino_id, staff_id, rating_slip_id, visit_id, amount, direction, area) VALUES
  -- Player 5's large buy-in yesterday (over CTR threshold)
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000006', 10000.00, 'in', 'table'),
  -- Player 5's additional marker
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000006', 5000.00, 'in', 'cage'),
  -- Player 5's cash-out
  ('a5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000006', 18000.00, 'out', 'cage'),
  -- Casino 2 high-roller current session
  ('a5000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000005', 'ca000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000010', 50000.00, 'in', 'table');

-- MTL audit notes
INSERT INTO mtl_audit_note (id, mtl_entry_id, staff_id, note) VALUES
  ('a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'Regular patron, verified ID on file. Cash buy-in at table.'),
  ('a6000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000007', 'VIP cross-property player. Verified Diamond status. Cash transaction documented.');

-- ============================================================================
-- SEED COMPLETE
-- ============================================================================
--
-- NOTE: The chk_staff_role_user_id constraint is DISABLED for this seed data.
-- In production, pit_boss and admin staff would require linked auth.users.
-- For local development/testing, we use mock staff without auth integration.
--
-- Summary:
-- - 1 Company
-- - 2 Casinos with settings
-- - 10 Staff members (pit bosses, dealers, admins)
-- - 6 Gaming tables (3 active at Casino 1, 1 inactive, 2 at Casino 2)
-- - 6 Game settings (per casino, per game type)
-- - 6 Players with casino enrollments
-- - 9 Player loyalty records (with tiers)
-- - 10 Visits (4 active, 6 closed)
-- - 10 Rating slips:
--     - 4 Open (active gameplay)
--     - 1 Paused (player on break)
--     - 5 Closed (completed sessions)
-- - 3 Rating slip pause records
-- - 7 Loyalty ledger entries
-- - 12 Financial transactions
-- - 7 Dealer rotations
-- - 5 Audit log entries
-- - 4 MTL entries with 2 audit notes
-- ============================================================================

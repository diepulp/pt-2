  -- Visit Service Transaction Functions
  -- 
  -- PostgreSQL stored procedures for complex Visit service transactions
  -- Migrating from Prisma $transaction to database-level transaction integrity
  --
  -- @fileoverview Database functions for Visit service transaction migration

  -- Enable UUID extension if not already enabled
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  -- =============================================================================
  -- 1. START_UNRATED_VISIT: Create unrated visit with audit logging
  -- =============================================================================

  CREATE OR REPLACE FUNCTION start_unrated_visit(
    p_player_id UUID,
    p_casino_id UUID,
    p_staff_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
  ) RETURNS JSON AS $$
  DECLARE
    v_visit_id UUID;
    v_existing_visit RECORD;
    v_is_valid_staff_uuid BOOLEAN;
  BEGIN
    -- Step 1: Check for existing active visit
    SELECT * INTO v_existing_visit
    FROM visit 
    WHERE player_id = p_player_id 
      AND casino_id = p_casino_id 
      AND status = 'ONGOING';

    IF FOUND THEN
      RAISE EXCEPTION 'Player already has an ONGOING visit at this casino.';
    END IF;

    -- Step 2: Create unrated visit
    INSERT INTO visit (player_id, casino_id, status, mode, check_in_date, check_out_date)
    VALUES (p_player_id, p_casino_id, 'ONGOING', 'UNRATED', NOW(), NULL)
    RETURNING id INTO v_visit_id;

    -- Step 3: Create audit log entry (only if valid staff ID provided)
    v_is_valid_staff_uuid := (
      p_staff_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );
    
    IF v_is_valid_staff_uuid THEN
      INSERT INTO "AuditLog" (entity, "entityId", action, "userId", details)
      VALUES (
        'visit',
        v_visit_id::TEXT,
        'START_UNRATED_VISIT',
        p_staff_id,
        json_build_object(
          'playerId', p_player_id,
          'casinoId', p_casino_id,
          'mode', 'UNRATED',
          'idempotencyKey', p_idempotency_key
        )
      );
    END IF;

    -- Step 4: Return visit data as JSON
    RETURN json_build_object(
      'success', true,
      'data', json_build_object(
        'id', v_visit_id,
        'player_id', p_player_id,
        'casino_id', p_casino_id,
        'status', 'ONGOING',
        'mode', 'UNRATED',
        'check_in_date', EXTRACT(EPOCH FROM NOW()) * 1000,
        'check_out_date', NULL
      ),
      'status', 201
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- Return error as JSON
      RETURN json_build_object(
        'success', false,
        'error', json_build_object(
          'code', 'START_UNRATED_VISIT_FAILED',
          'message', SQLERRM,
          'details', json_build_object(
            'playerId', p_player_id,
            'casinoId', p_casino_id
          )
        ),
        'status', 500
      );
  END;
  $$ LANGUAGE plpgsql;

  -- =============================================================================
  -- 2. START_RATED_VISIT: Create rated visit with rating slip and comprehensive validation
  -- =============================================================================

  CREATE OR REPLACE FUNCTION start_rated_visit(
    p_player_id UUID,
    p_casino_id UUID,
    p_table_id UUID,
    p_staff_id UUID,
    p_seat_number INTEGER DEFAULT 1,
    p_game_settings_id UUID DEFAULT NULL,
    p_average_bet DECIMAL DEFAULT 0,
    p_idempotency_key TEXT DEFAULT NULL
  ) RETURNS JSON AS $$
  DECLARE
    v_visit_id UUID;
    v_rating_slip_id UUID;
    v_existing_visit RECORD;
    v_existing_slips TEXT[];
    v_paused_slips TEXT[];
    v_table_data RECORD;
    v_max_seats INTEGER;
    v_occupied_seats INTEGER[];
    v_available_seats INTEGER[];
    v_game_settings RECORD;
    v_table_settings RECORD;
    v_is_valid_staff_uuid BOOLEAN;
    v_seat_occupied BOOLEAN := FALSE;
    v_seat_occupier TEXT;
    i INTEGER;
  BEGIN
    -- Step 1: Check for existing active visit
    SELECT * INTO v_existing_visit
    FROM visit 
    WHERE player_id = p_player_id 
      AND casino_id = p_casino_id 
      AND status = 'ONGOING';

    IF FOUND THEN
      RAISE EXCEPTION 'Player already has an ONGOING visit at this casino.';
    END IF;

    -- Step 2: Enhanced rating slip status validation
    SELECT array_agg(ROW(r.id, gt.name, r.seat_number)::TEXT) INTO v_existing_slips
    FROM ratingslip r
    JOIN gamingtable gt ON r.gaming_table_id = gt.id
    WHERE r."playerId" = p_player_id AND r.status = 'OPEN';

    IF array_length(v_existing_slips, 1) > 0 THEN
      RAISE EXCEPTION 'Player has % active rating slip(s). All rating slips must be closed before starting a new rated visit.', 
        array_length(v_existing_slips, 1);
    END IF;

    -- Check for paused rating slips (warning only)
    SELECT array_agg(ROW(r.id, gt.name, r.seat_number)::TEXT) INTO v_paused_slips
    FROM ratingslip r
    JOIN gamingtable gt ON r.gaming_table_id = gt.id
    WHERE r."playerId" = p_player_id AND r.status = 'PAUSED';

    -- Step 3: Enhanced seat validation
    SELECT seats_available INTO v_max_seats
    FROM gamingtable 
    WHERE id = p_table_id;
    
    v_max_seats := COALESCE(v_max_seats, 8);

    -- Validate seat number is within table limits
    IF p_seat_number < 1 OR p_seat_number > v_max_seats THEN
      RAISE EXCEPTION 'Invalid seat number %. Table has seats 1-%.', p_seat_number, v_max_seats;
    END IF;

    -- Get occupied seats
    SELECT array_agg(r.seat_number) INTO v_occupied_seats
    FROM ratingslip r
    WHERE r.gaming_table_id = p_table_id AND r.status = 'OPEN';

    -- Check if requested seat is occupied
    IF p_seat_number = ANY(v_occupied_seats) THEN
      -- Get occupier name
      SELECT CONCAT(p.first_name, ' ', p.last_name) INTO v_seat_occupier
      FROM ratingslip r
      JOIN visit v ON r.visit_id = v.id
      JOIN player p ON v.player_id = p.id
      WHERE r.gaming_table_id = p_table_id 
        AND r.seat_number = p_seat_number 
        AND r.status = 'OPEN';
      
      -- Generate available seats for suggestion
      SELECT array_agg(seat_num) INTO v_available_seats
      FROM generate_series(1, v_max_seats) seat_num
      WHERE seat_num != ALL(v_occupied_seats);
      
      RAISE EXCEPTION 'Seat % is occupied by %. Available seats: %', 
        p_seat_number, COALESCE(v_seat_occupier, 'Unknown Player'), 
        array_to_string(v_available_seats[1:3], ', ');
    END IF;

    -- Step 4: Get active game settings
    IF p_game_settings_id IS NOT NULL THEN
      SELECT * INTO v_game_settings
      FROM gamesettings 
      WHERE id = p_game_settings_id;
      
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Specified game settings not found.';
      END IF;
    ELSE
      -- Find active game settings for table
      SELECT gs.* INTO v_game_settings
      FROM gamingtablesettings gts
      JOIN gamesettings gs ON gts.game_settings_id = gs.id
      WHERE gts.gaming_table_id = p_table_id
        AND gts.is_active = true
        AND gts.active_from <= NOW()
        AND (gts.active_until IS NULL OR gts.active_until >= NOW());
      
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No active game settings for table.';
      END IF;
    END IF;

    -- Step 5: Create rated visit
    INSERT INTO visit (player_id, casino_id, status, mode, check_in_date, check_out_date)
    VALUES (p_player_id, p_casino_id, 'ONGOING', 'RATED', NOW(), NULL)
    RETURNING id INTO v_visit_id;

    -- Step 6: Create rating slip
    INSERT INTO ratingslip (
      visit_id, "playerId", gaming_table_id, seat_number, 
      game_settings_id, game_settings, status, start_time, 
      average_bet, points, version
    )
    VALUES (
      v_visit_id, p_player_id, p_table_id, p_seat_number,
      v_game_settings.id, to_jsonb(v_game_settings), 'OPEN', NOW(),
      p_average_bet, 0, 1
    )
    RETURNING id INTO v_rating_slip_id;

    -- Step 7: Create audit log entries (only if valid staff ID provided)
    v_is_valid_staff_uuid := (
      p_staff_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );
    
    IF v_is_valid_staff_uuid THEN
      INSERT INTO "AuditLog" (entity, "entityId", action, "userId", details)
      VALUES 
        (
          'visit',
          v_visit_id::TEXT,
          'START_RATED_VISIT',
          p_staff_id,
          json_build_object(
            'playerId', p_player_id,
            'casinoId', p_casino_id,
            'tableId', p_table_id,
            'seatNumber', p_seat_number,
            'mode', 'RATED',
            'idempotencyKey', p_idempotency_key
          )
        ),
        (
          'ratingslips',
          v_rating_slip_id::TEXT,
          'CREATE_RATING_SLIP',
          p_staff_id,
          json_build_object(
            'visitId', v_visit_id,
            'tableId', p_table_id,
            'seatNumber', p_seat_number,
            'gameSettingsId', v_game_settings.id,
            'idempotencyKey', p_idempotency_key
          )
        );
    END IF;

    -- Step 8: Return visit data as JSON
    RETURN json_build_object(
      'success', true,
      'data', json_build_object(
        'id', v_visit_id,
        'player_id', p_player_id,
        'casino_id', p_casino_id,
        'status', 'ONGOING',
        'mode', 'RATED',
        'check_in_date', EXTRACT(EPOCH FROM NOW()) * 1000,
        'check_out_date', NULL,
        'activeRatingSlip', json_build_object(
          'id', v_rating_slip_id,
          'status', 'OPEN',
          'averageBet', p_average_bet,
          'points', 0,
          'seatNumber', p_seat_number
        )
      ),
      'status', 201
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- Return error as JSON
      RETURN json_build_object(
        'success', false,
        'error', json_build_object(
          'code', 'START_RATED_VISIT_FAILED',
          'message', SQLERRM,
          'details', json_build_object(
            'playerId', p_player_id,
            'tableId', p_table_id,
            'seatNumber', p_seat_number
          )
        ),
        'status', 500
      );
  END;
  $$ LANGUAGE plpgsql;

  -- =============================================================================
  -- 3. CONVERT_UNRATED_TO_RATED: Convert existing unrated visit to rated
  -- =============================================================================

  CREATE OR REPLACE FUNCTION convert_unrated_to_rated(
    p_visit_id UUID,
    p_table_id UUID,
    p_staff_id UUID,
    p_seat_number INTEGER DEFAULT 1,
    p_idempotency_key TEXT DEFAULT NULL
  ) RETURNS JSON AS $$
  DECLARE
    v_visit RECORD;
    v_rating_slip_id UUID;
    v_active_slips INTEGER;
    v_paused_slips INTEGER;
    v_other_active_slips INTEGER;
    v_max_seats INTEGER;
    v_occupied_seats INTEGER[];
    v_available_seats INTEGER[];
    v_game_settings RECORD;
    v_is_valid_staff_uuid BOOLEAN;
    v_seat_occupier TEXT;
  BEGIN
    -- Step 1: Get the visit and validate
    SELECT v.*, p.first_name, p.last_name INTO v_visit
    FROM visit v
    JOIN player p ON v.player_id = p.id
    WHERE v.id = p_visit_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Visit with ID % not found', p_visit_id;
    END IF;

    IF v_visit.status != 'ONGOING' THEN
      RAISE EXCEPTION 'Cannot convert visit with status: %', v_visit.status;
    END IF;

    IF v_visit.mode = 'RATED' THEN
      RAISE EXCEPTION 'Visit is already rated';
    END IF;

    -- Step 2: Enhanced rating slip status validation
    SELECT COUNT(*) INTO v_active_slips
    FROM ratingslip 
    WHERE visit_id = p_visit_id AND status = 'OPEN';

    IF v_active_slips > 0 THEN
      RAISE EXCEPTION 'Visit already has % active rating slip(s). Cannot convert UNRATED visit that has active rating slips.', v_active_slips;
    END IF;

    -- Check for paused slips (warning only)
    SELECT COUNT(*) INTO v_paused_slips
    FROM ratingslip 
    WHERE visit_id = p_visit_id AND status = 'PAUSED';

    -- Validate player doesn't have other active rating slips at different tables
    SELECT COUNT(*) INTO v_other_active_slips
    FROM ratingslip 
    WHERE "playerId" = v_visit.player_id 
      AND status = 'OPEN' 
      AND visit_id != p_visit_id;

    IF v_other_active_slips > 0 THEN
      RAISE EXCEPTION 'Player has active rating slips at other tables. Close these slips before converting visit to rated.';
    END IF;

    -- Step 3: Enhanced seat validation (same logic as start_rated_visit)
    SELECT seats_available INTO v_max_seats
    FROM gamingtable 
    WHERE id = p_table_id;
    
    v_max_seats := COALESCE(v_max_seats, 8);

    IF p_seat_number < 1 OR p_seat_number > v_max_seats THEN
      RAISE EXCEPTION 'Invalid seat number %. Table has seats 1-%.', p_seat_number, v_max_seats;
    END IF;

    -- Check seat occupancy
    SELECT array_agg(r.seat_number) INTO v_occupied_seats
    FROM ratingslip r
    WHERE r.gaming_table_id = p_table_id AND r.status = 'OPEN';

    IF p_seat_number = ANY(v_occupied_seats) THEN
      SELECT CONCAT(p.first_name, ' ', p.last_name) INTO v_seat_occupier
      FROM ratingslip r
      JOIN visit v ON r.visit_id = v.id
      JOIN player p ON v.player_id = p.id
      WHERE r.gaming_table_id = p_table_id 
        AND r.seat_number = p_seat_number 
        AND r.status = 'OPEN';
      
      SELECT array_agg(seat_num) INTO v_available_seats
      FROM generate_series(1, v_max_seats) seat_num
      WHERE seat_num != ALL(v_occupied_seats);
      
      RAISE EXCEPTION 'Seat % is occupied by %. Available seats: %', 
        p_seat_number, COALESCE(v_seat_occupier, 'Unknown Player'), 
        array_to_string(v_available_seats[1:3], ', ');
    END IF;

    -- Step 4: Get active game settings for table
    SELECT gs.* INTO v_game_settings
    FROM gamingtablesettings gts
    JOIN gamesettings gs ON gts.game_settings_id = gs.id
    WHERE gts.gaming_table_id = p_table_id
      AND gts.is_active = true
      AND gts.active_from <= NOW()
      AND (gts.active_until IS NULL OR gts.active_until >= NOW());
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active game settings for table.';
    END IF;

    -- Step 5: Update visit to RATED mode
    UPDATE visit 
    SET mode = 'RATED' 
    WHERE id = p_visit_id;

    -- Step 6: Create rating slip
    INSERT INTO ratingslip (
      visit_id, "playerId", gaming_table_id, seat_number, 
      game_settings_id, game_settings, status, start_time, 
      average_bet, points, version
    )
    VALUES (
      p_visit_id, v_visit.player_id, p_table_id, p_seat_number,
      v_game_settings.id, to_jsonb(v_game_settings), 'OPEN', NOW(),
      0, 0, 1
    )
    RETURNING id INTO v_rating_slip_id;

    -- Step 7: Create audit log entries (only if valid staff ID provided)
    v_is_valid_staff_uuid := (
      p_staff_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );
    
    IF v_is_valid_staff_uuid THEN
      INSERT INTO "AuditLog" (entity, "entityId", action, "userId", details)
      VALUES 
        (
          'visit',
          p_visit_id::TEXT,
          'CONVERT_TO_RATED',
          p_staff_id,
          json_build_object(
            'tableId', p_table_id,
            'seatNumber', p_seat_number,
            'originalMode', 'UNRATED',
            'newMode', 'RATED',
            'idempotencyKey', p_idempotency_key
          )
        ),
        (
          'ratingslips',
          v_rating_slip_id::TEXT,
          'CREATE_RATING_SLIP',
          p_staff_id,
          json_build_object(
            'visitId', p_visit_id,
            'tableId', p_table_id,
            'seatNumber', p_seat_number,
            'gameSettingsId', v_game_settings.id,
            'convertedFromUnrated', true,
            'idempotencyKey', p_idempotency_key
          )
        );
    END IF;

    -- Step 8: Return updated visit data as JSON
    RETURN json_build_object(
      'success', true,
      'data', json_build_object(
        'id', p_visit_id,
        'player_id', v_visit.player_id,
        'casino_id', v_visit.casino_id,
        'status', 'ONGOING',
        'mode', 'RATED',
        'check_in_date', EXTRACT(EPOCH FROM v_visit.check_in_date) * 1000,
        'check_out_date', NULL,
        'activeRatingSlip', json_build_object(
          'id', v_rating_slip_id,
          'status', 'OPEN',
          'averageBet', 0,
          'points', 0,
          'seatNumber', p_seat_number
        )
      ),
      'status', 200
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object(
        'success', false,
        'error', json_build_object(
          'code', 'CONVERT_TO_RATED_FAILED',
          'message', SQLERRM,
          'details', json_build_object(
            'visitId', p_visit_id,
            'tableId', p_table_id
          )
        ),
        'status', 500
      );
  END;
  $$ LANGUAGE plpgsql;

  -- =============================================================================
  -- 4. CLOSE_VISIT: Close visit with optional rating slip closure and points calculation
  -- =============================================================================

  CREATE OR REPLACE FUNCTION close_visit(
    p_visit_id UUID,
    p_staff_id UUID,
    p_auto_close_slips BOOLEAN DEFAULT FALSE,
    p_idempotency_key TEXT DEFAULT NULL
  ) RETURNS JSON AS $$
  DECLARE
    v_visit RECORD;
    v_open_slips UUID[];
    v_paused_slips INTEGER;
    v_rating_slip RECORD;
    v_duration_minutes INTEGER;
    v_calculated_points INTEGER;
    v_total_points_awarded INTEGER := 0;
    v_last_ledger_entry RECORD;
    v_current_balance INTEGER := 0;
    v_new_balance INTEGER := 0;
    v_is_valid_staff_uuid BOOLEAN;
    v_audit_entries JSON[] := '{}';
  BEGIN
    -- Step 1: Get the visit with all related data
    SELECT v.*, p.first_name, p.last_name INTO v_visit
    FROM visit v
    JOIN player p ON v.player_id = p.id
    WHERE v.id = p_visit_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Visit with ID % not found', p_visit_id;
    END IF;

    IF v_visit.status != 'ONGOING' THEN
      RAISE EXCEPTION 'Cannot close visit with status: %', v_visit.status;
    END IF;

    -- Step 2: Enhanced rating slip status validation
    SELECT array_agg(r.id) INTO v_open_slips
    FROM ratingslip r
    WHERE r.visit_id = p_visit_id AND r.status = 'OPEN';

    SELECT COUNT(*) INTO v_paused_slips
    FROM ratingslip 
    WHERE visit_id = p_visit_id AND status = 'PAUSED';

    IF NOT p_auto_close_slips AND array_length(v_open_slips, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot close visit with % open rating slip(s). Either enable auto-close or manually close all rating slips first.', 
        array_length(v_open_slips, 1);
    END IF;

    -- Step 2a: Handle rating slips if auto-close is enabled
    IF p_auto_close_slips AND array_length(v_open_slips, 1) > 0 THEN
      FOR i IN 1..array_length(v_open_slips, 1) LOOP
        SELECT * INTO v_rating_slip FROM ratingslip WHERE id = v_open_slips[i];
        
        -- Calculate session duration in minutes
        v_duration_minutes := EXTRACT(EPOCH FROM (NOW() - v_rating_slip.start_time)) / 60;
        
        -- Calculate points using game settings
        v_calculated_points := 0;
        IF v_rating_slip.game_settings IS NOT NULL 
          AND (v_rating_slip.average_bet)::numeric > 0 
          AND v_duration_minutes > 0 THEN
          v_calculated_points := FLOOR(
            ((v_rating_slip.average_bet)::numeric * 
            COALESCE((v_rating_slip.game_settings->>'average_rounds_per_hour')::numeric, 60) *
            COALESCE((v_rating_slip.game_settings->>'point_multiplier')::numeric, 1) *
            v_duration_minutes) / 60
          )::integer;
        END IF;

        -- Close the rating slip
        UPDATE ratingslip 
        SET status = 'CLOSED',
            end_time = NOW(),
            points = v_calculated_points,
            version = version + 1
        WHERE id = v_rating_slip.id;

        v_total_points_awarded := v_total_points_awarded + v_calculated_points;

        -- Add to audit entries array
        v_audit_entries := v_audit_entries || json_build_object(
          'entity', 'ratingslips',
          'entityId', v_rating_slip.id::TEXT,
          'action', 'AUTO_CLOSE_RATING_SLIP',
          'userId', p_staff_id,
          'details', json_build_object(
            'visitId', p_visit_id,
            'calculatedPoints', v_calculated_points,
            'durationMinutes', v_duration_minutes,
            'averageBet', (v_rating_slip.average_bet)::numeric,
            'autoClosedByVisitClosure', true,
            'idempotencyKey', p_idempotency_key
          )
        )::JSON;
      END LOOP;

      -- Step 3: Create loyalty ledger entry if points were awarded
      IF v_total_points_awarded > 0 THEN
        -- Get current balance
        SELECT * INTO v_last_ledger_entry
        FROM "LoyaltyLedger" 
        WHERE player_id = v_visit.player_id 
        ORDER BY transaction_date DESC 
        LIMIT 1;

        v_current_balance := COALESCE(v_last_ledger_entry.balance_after, 0);
        v_new_balance := v_current_balance + v_total_points_awarded;

        INSERT INTO "LoyaltyLedger" (
          player_id, visit_id, direction, points, balance_after, 
          description, metadata
        )
        VALUES (
          v_visit.player_id, p_visit_id, 'CREDIT', v_total_points_awarded, v_new_balance,
          'Points earned from visit rating slips - Visit ' || p_visit_id::TEXT,
          json_build_object(
            'visitId', p_visit_id,
            'ratingSlipCount', array_length(v_open_slips, 1),
            'autoAwarded', true,
            'idempotencyKey', p_idempotency_key
          )
        );

        -- Add loyalty ledger audit entry
        v_audit_entries := v_audit_entries || json_build_object(
          'entity', 'loyaltyLedger',
          'entityId', v_visit.player_id::TEXT,
          'action', 'AWARD_VISIT_POINTS',
          'userId', p_staff_id,
          'details', json_build_object(
            'visitId', p_visit_id,
            'pointsAwarded', v_total_points_awarded,
            'previousBalance', v_current_balance,
            'newBalance', v_new_balance,
            'ratingSlipCount', array_length(v_open_slips, 1),
            'idempotencyKey', p_idempotency_key
          )
        )::JSON;
      END IF;
    END IF;

    -- Step 4: Close the visit
    UPDATE visit 
    SET status = 'COMPLETED',
        check_out_date = NOW()
    WHERE id = p_visit_id;

    -- Step 5: Add visit closure audit entry
    v_audit_entries := v_audit_entries || json_build_object(
      'entity', 'visit',
      'entityId', p_visit_id::TEXT,
      'action', 'CLOSE_VISIT',
      'userId', p_staff_id,
      'details', json_build_object(
        'autoCloseSlips', p_auto_close_slips,
        'totalPointsAwarded', v_total_points_awarded,
        'ratingSlipsProcessed', COALESCE(array_length(v_open_slips, 1), 0),
        'idempotencyKey', p_idempotency_key
      )
    )::JSON;

    -- Step 6: Create all audit entries (only if valid staff ID provided)
    v_is_valid_staff_uuid := (
      p_staff_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );
    
    IF v_is_valid_staff_uuid AND array_length(v_audit_entries, 1) > 0 THEN
      FOR i IN 1..array_length(v_audit_entries, 1) LOOP
        INSERT INTO "AuditLog" (entity, "entityId", action, "userId", details)
        VALUES (
          (v_audit_entries[i]->>'entity')::TEXT,
          (v_audit_entries[i]->>'entityId')::TEXT,
          (v_audit_entries[i]->>'action')::TEXT,
          ((v_audit_entries[i]->>'userId')::TEXT)::UUID,
          (v_audit_entries[i]->'details')::JSON
        );
      END LOOP;
    END IF;

    -- Step 7: Return closed visit data as JSON
    RETURN json_build_object(
      'success', true,
      'data', json_build_object(
        'id', p_visit_id,
        'player_id', v_visit.player_id,
        'casino_id', v_visit.casino_id,
        'status', 'COMPLETED',
        'mode', v_visit.mode,
        'check_in_date', EXTRACT(EPOCH FROM v_visit.check_in_date) * 1000,
        'check_out_date', EXTRACT(EPOCH FROM NOW()) * 1000,
        'totalPointsAwarded', v_total_points_awarded
      ),
      'status', 200
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object(
        'success', false,
        'error', json_build_object(
          'code', 'CLOSE_VISIT_FAILED',
          'message', SQLERRM,
          'details', json_build_object(
            'visitId', p_visit_id,
            'autoCloseSlips', p_auto_close_slips
          )
        ),
        'status', 500
      );
  END;
  $$ LANGUAGE plpgsql;

  -- =============================================================================
  -- 5. VALIDATE_VISIT_SEAT_AVAILABILITY: Seat availability validation helper
  -- =============================================================================

  CREATE OR REPLACE FUNCTION validate_visit_seat_availability(
    p_table_id UUID,
    p_seat_number INTEGER,
    p_exclude_player_id UUID DEFAULT NULL
  ) RETURNS JSON AS $$
  DECLARE
    v_max_seats INTEGER;
    v_occupied_seats INTEGER[];
    v_available_seats INTEGER[];
    v_seat_occupier RECORD;
    v_suggestions TEXT[];
  BEGIN
    -- Get table capacity
    SELECT seats_available INTO v_max_seats
    FROM gamingtable 
    WHERE id = p_table_id;
    
    v_max_seats := COALESCE(v_max_seats, 8);

    -- Get occupied seats with player information
    SELECT array_agg(
      ROW(r.seat_number, r."playerId", CONCAT(p.first_name, ' ', p.last_name), r.id, v.id)
    ) INTO v_occupied_seats
    FROM ratingslip r
    JOIN visit v ON r.visit_id = v.id
    JOIN player p ON v.player_id = p.id
    WHERE r.gaming_table_id = p_table_id 
      AND r.status = 'OPEN'
    ORDER BY r.seat_number;

    -- Calculate available seats
    SELECT array_agg(seat_num) INTO v_available_seats
    FROM generate_series(1, v_max_seats) seat_num
    WHERE seat_num NOT IN (
      SELECT (unnest(v_occupied_seats)).f1 
      WHERE v_occupied_seats IS NOT NULL
    );

    -- Check if requested seat is occupied (excluding specified player if provided)
    SELECT * INTO v_seat_occupier
    FROM unnest(v_occupied_seats) AS occ(seat_number, player_id, player_name, rating_slip_id, visit_id)
    WHERE occ.seat_number = p_seat_number 
      AND (p_exclude_player_id IS NULL OR occ.player_id != p_exclude_player_id);

    -- Generate suggestions
    SELECT array_agg('Seat ' || seat_num) INTO v_suggestions
    FROM unnest(v_available_seats[1:3]) AS seat_num;

    RETURN json_build_object(
      'success', true,
      'data', json_build_object(
        'isAvailable', v_seat_occupier IS NULL,
        'occupiedBy', CASE 
          WHEN v_seat_occupier IS NOT NULL THEN
            json_build_object(
              'playerId', v_seat_occupier.player_id,
              'playerName', v_seat_occupier.player_name,
              'visitId', v_seat_occupier.visit_id,
              'ratingSlipId', v_seat_occupier.rating_slip_id
            )
          ELSE NULL
        END,
        'tableInfo', json_build_object(
          'maxSeats', v_max_seats,
          'occupiedSeats', COALESCE(array_length(v_occupied_seats, 1), 0),
          'availableSeats', COALESCE(v_available_seats, '{}')
        ),
        'suggestions', COALESCE(v_suggestions, '{}')
      ),
      'status', 200
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object(
        'success', false,
        'error', json_build_object(
          'code', 'SEAT_VALIDATION_FAILED',
          'message', SQLERRM
        ),
        'status', 500
      );
  END;
  $$ LANGUAGE plpgsql;

  -- =============================================================================
  -- Performance and Security Indexes for Visit Transaction Functions
  -- =============================================================================

  -- Ensure optimal indexes exist for visit transaction queries
  CREATE INDEX IF NOT EXISTS idx_visit_player_casino_status
  ON visit(player_id, casino_id, status);

  CREATE INDEX IF NOT EXISTS idx_ratingslip_player_status
  ON ratingslip("playerId", status);

  CREATE INDEX IF NOT EXISTS idx_ratingslip_table_status_seat
  ON ratingslip(gaming_table_id, status, seat_number);

  CREATE INDEX IF NOT EXISTS idx_loyaltyledger_player_date
  ON "LoyaltyLedger"(player_id, transaction_date DESC);

  -- Grant execution permissions to the application user
  -- GRANT EXECUTE ON FUNCTION start_unrated_visit TO your_app_user;
  -- GRANT EXECUTE ON FUNCTION start_rated_visit TO your_app_user;
  -- GRANT EXECUTE ON FUNCTION convert_unrated_to_rated TO your_app_user;
  -- GRANT EXECUTE ON FUNCTION close_visit TO your_app_user;
  -- GRANT EXECUTE ON FUNCTION validate_visit_seat_availability TO your_app_user;
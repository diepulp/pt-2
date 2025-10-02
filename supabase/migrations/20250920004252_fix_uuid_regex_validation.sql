-- Fix UUID regex validation in start_rated_visit function
-- The error occurs because we're using regex operator ~ on UUID type without casting to TEXT

CREATE OR REPLACE FUNCTION start_rated_visit(
  p_player_id UUID,
  p_casino_id UUID,
  p_table_id UUID,
  p_staff_id UUID,
  p_seat_number INTEGER DEFAULT 1,
  p_game_settings_id UUID DEFAULT NULL,
  p_average_bet NUMERIC DEFAULT 0.00,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSON AS $$
  DECLARE
    v_visit_id UUID;
    v_rating_slip_id TEXT;
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

    -- Step 3: Get active game settings FIRST (moved up from step 4)
    -- This is required to get seats_available for seat validation
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

    -- Step 4: Enhanced seat validation using seats_available from game settings
    v_max_seats := COALESCE(v_game_settings.seats_available, 8);

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
      SELECT CONCAT(p."firstName", ' ', p."lastName") INTO v_seat_occupier
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

    -- Step 5: Create rated visit
    INSERT INTO visit (player_id, casino_id, status, mode, check_in_date, check_out_date)
    VALUES (p_player_id, p_casino_id, 'ONGOING', 'RATED', NOW(), NULL)
    RETURNING id INTO v_visit_id;

    -- Step 6: Generate rating slip ID and create rating slip
    v_rating_slip_id := 'RS-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || LEFT(p_player_id::TEXT, 8);

    INSERT INTO ratingslip (
      id,
      visit_id, "playerId", gaming_table_id, seat_number,
      game_settings_id, game_settings, status, start_time,
      average_bet, points, version
    )
    VALUES (
      v_rating_slip_id,
      v_visit_id, p_player_id, p_table_id, p_seat_number,
      v_game_settings.id, to_jsonb(v_game_settings), 'OPEN', NOW(),
      p_average_bet, 0, 1
    );

    -- Step 7: Create audit log entries (only if valid staff ID provided)
    -- FIXED: Cast UUID to TEXT before regex validation
    v_is_valid_staff_uuid := (
      p_staff_id::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
          v_rating_slip_id,
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
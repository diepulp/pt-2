-- Drop the old close_player_session function with p_points parameter
DROP FUNCTION IF EXISTS close_player_session(UUID, UUID, NUMERIC, TIMESTAMPTZ, NUMERIC);

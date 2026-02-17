-- ============================================================================
-- Migration: PRD-029 Seed RPC — rpc_seed_game_settings_defaults
-- Description: SECURITY DEFINER function to bulk-insert template game settings
--              and side bets for a casino. Used by Setup Wizard B Step 2.
-- Created: 2026-02-10
-- Reference: ADR-015, ADR-018, ADR-024, PRD-029
-- VERIFIED_SAFE: SECURITY DEFINER RPC with set_rls_context_from_staff() (ADR-024)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_seed_game_settings_defaults(
  p_template text DEFAULT 'small_pit_starter'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', pg_temp
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
  v_gs_inserted integer := 0;
  v_sb_inserted integer := 0;
BEGIN
  -- STEP 1: Context injection (ADR-024, ADR-018 Template 5)
  PERFORM set_rls_context_from_staff();

  -- STEP 2: Derive context from session variables (NOT from parameters)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- STEP 3: Validate context
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: actor context not set';
  END IF;

  -- STEP 4: Role allow-list enforcement
  IF v_staff_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'FORBIDDEN: role "%" not allowed to seed game settings (requires admin or manager)', v_staff_role;
  END IF;

  -- STEP 5: Template validation
  IF p_template != 'small_pit_starter' THEN
    RAISE EXCEPTION 'INVALID_TEMPLATE: unknown template "%"', p_template;
  END IF;

  -- STEP 6: Insert game settings (ON CONFLICT DO NOTHING for idempotency)
  WITH seed_data (code, game_type, name, variant_name, shoe_decks, deck_profile, house_edge, rating_edge_for_comp, decisions_per_hour, seats_available, notes) AS (
    VALUES
      ('bj_6d'::text,                    'blackjack'::game_type, 'Blackjack — 6-Deck Shoe'::text,                    '6-deck shoe'::text,                                  6::smallint,    'standard_52'::text,  0.280::numeric, 0.750::numeric, 70::int, 7::int, NULL::text),
      ('bj_dd',                           'blackjack',           'Blackjack — Double Deck',                           'Double deck',                                         2::smallint,    'standard_52',        1.500,          0.750,          70,      7,      'Compute from exact rules (H17/S17, DAS, RSA, etc.).'),
      ('spanish_21',                      'blackjack',           'Spanish 21',                                        'H17, no re-doubling (baseline)',                       6::smallint,    'spanish_48',         0.760,          2.200,          75,      7,      NULL),
      ('players_edge_21',                 'blackjack',           'Player''s Edge 21 Progressive',                     'with progressive package',                             6::smallint,    'spanish_48',         0.270,          2.200,          75,      7,      'Progressive side bets are paytable-dependent; store separately.'),
      ('mini_baccarat',                   'baccarat',            'Mini Baccarat',                                     'standard',                                             8::smallint,    'standard_52',        1.060,          1.200,          72,      7,      'Banker 1.06%, Player 1.24%.'),
      ('rising_phoenix_comm',             'baccarat',            'Rising Phoenix Baccarat — Commission',              'commission',                                           8::smallint,    'standard_52',        1.060,          1.200,          72,      7,      NULL),
      ('rising_phoenix_comm_free',        'baccarat',            'Rising Phoenix Baccarat — Commission-Free',         'commission-free (Banker 3-card 7 push)',                8::smallint,    'standard_52',        1.020,          1.200,          72,      7,      NULL),
      ('pai_gow',                         'pai_gow',             'Pai Gow Poker',                                     'standard',                                             NULL::smallint, 'with_joker_53',      1.460,          1.960,          30,      6,      NULL),
      ('emperor_challenge_exposed',       'pai_gow',             'Emperor''s Challenge Exposed',                      'commission-free exposed',                              NULL::smallint, 'with_joker_53',      1.460,          1.960,          30,      6,      'Placeholder edge; model exact rules later.'),
      ('uth',                             'carnival',            'Ultimate Texas Hold ''Em',                          'standard',                                             NULL::smallint, 'standard_52',        2.190,          NULL::numeric,  30,      7,      NULL),
      ('high_card_flush',                 'carnival',            'High Card Flush',                                   'optimal baseline',                                     NULL::smallint, 'standard_52',        2.640,          NULL::numeric,  50,      7,      NULL)
  ),
  inserted AS (
    INSERT INTO game_settings (casino_id, code, game_type, name, variant_name, shoe_decks, deck_profile, house_edge, rating_edge_for_comp, decisions_per_hour, seats_available, notes)
    SELECT v_casino_id, sd.code, sd.game_type, sd.name, sd.variant_name, sd.shoe_decks, sd.deck_profile, sd.house_edge, sd.rating_edge_for_comp, sd.decisions_per_hour, sd.seats_available, sd.notes
    FROM seed_data sd
    ON CONFLICT (casino_id, code) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_gs_inserted FROM inserted;

  -- STEP 7: Insert side bets (NOT EXISTS guard for idempotency)
  -- casino_id is trigger-derived from parent game_settings row
  WITH side_bet_data (parent_code, side_bet_name, house_edge, paytable_id, enabled_by_default) AS (
    VALUES
      ('bj_6d'::text,                    'Lucky Ladies (Pay Table D)'::text, 13.340::numeric(6,3), 'D'::text,    false::boolean),
      ('emperor_challenge_exposed',       'Emperor''s Challenge',             4.171::numeric(6,3),  NULL::text,   false),
      ('emperor_challenge_exposed',       'Pai Gow Insurance',                7.350::numeric(6,3),  NULL::text,   false)
  ),
  sb_inserted AS (
    INSERT INTO game_settings_side_bet (game_settings_id, side_bet_name, house_edge, paytable_id, enabled_by_default)
    SELECT gs.id, sbd.side_bet_name, sbd.house_edge, sbd.paytable_id, sbd.enabled_by_default
    FROM side_bet_data sbd
    JOIN game_settings gs ON gs.casino_id = v_casino_id AND gs.code = sbd.parent_code
    WHERE NOT EXISTS (
      SELECT 1 FROM game_settings_side_bet existing
      WHERE existing.game_settings_id = gs.id
        AND existing.side_bet_name = sbd.side_bet_name
        AND COALESCE(existing.paytable_id, 'default') = COALESCE(sbd.paytable_id, 'default')
    )
    RETURNING id
  )
  SELECT count(*) INTO v_sb_inserted FROM sb_inserted;

  RETURN v_gs_inserted + v_sb_inserted;
END;
$$;

-- GRANT: broad grant; authorization enforced inside function via actor role
-- from set_rls_context_from_staff() — do NOT tighten without updating internal checks
GRANT EXECUTE ON FUNCTION rpc_seed_game_settings_defaults(text) TO authenticated;

-- PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

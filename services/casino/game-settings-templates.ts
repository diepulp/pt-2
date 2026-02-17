/**
 * Default Game Settings Template Catalog — PRD-030
 *
 * Client-accessible template data mirroring the `small_pit_starter` seed RPC.
 * Used by the setup wizard to display a selectable list of default games.
 * The user picks which games to add; only selected games are created.
 *
 * Source of truth: supabase/migrations/20260212210815_fix_seed_rating_edge_for_comp.sql
 */

export interface GameSettingsTemplate {
  code: string;
  game_type:
    | 'blackjack'
    | 'baccarat'
    | 'pai_gow'
    | 'carnival'
    | 'poker'
    | 'roulette';
  name: string;
  variant_name: string | null;
  shoe_decks: number | null;
  deck_profile: string | null;
  house_edge: number;
  rating_edge_for_comp: number | null;
  decisions_per_hour: number;
  seats_available: number;
  min_bet: number | null;
  max_bet: number | null;
  notes: string | null;
}

/**
 * The `small_pit_starter` template — 11 default games covering
 * blackjack, baccarat, pai gow, and carnival categories.
 */
export const DEFAULT_GAME_TEMPLATES: GameSettingsTemplate[] = [
  // Blackjack (4 variants)
  {
    code: 'bj_6d',
    game_type: 'blackjack',
    name: 'Blackjack \u2014 6-Deck Shoe',
    variant_name: '6-deck shoe',
    shoe_decks: 6,
    deck_profile: 'standard_52',
    house_edge: 0.28,
    rating_edge_for_comp: 0.75,
    decisions_per_hour: 70,
    seats_available: 7,
    min_bet: null,
    max_bet: null,
    notes: null,
  },
  {
    code: 'bj_dd',
    game_type: 'blackjack',
    name: 'Blackjack \u2014 Double Deck',
    variant_name: 'Double deck',
    shoe_decks: 2,
    deck_profile: 'standard_52',
    house_edge: 1.5,
    rating_edge_for_comp: 0.75,
    decisions_per_hour: 70,
    seats_available: 7,
    min_bet: null,
    max_bet: null,
    notes: 'Compute from exact rules (H17/S17, DAS, RSA, etc.).',
  },
  {
    code: 'spanish_21',
    game_type: 'blackjack',
    name: 'Spanish 21',
    variant_name: 'H17, no re-doubling (baseline)',
    shoe_decks: 6,
    deck_profile: 'spanish_48',
    house_edge: 0.76,
    rating_edge_for_comp: 2.2,
    decisions_per_hour: 75,
    seats_available: 7,
    min_bet: null,
    max_bet: null,
    notes: null,
  },
  {
    code: 'players_edge_21',
    game_type: 'blackjack',
    name: "Player's Edge 21 Progressive",
    variant_name: 'with progressive package',
    shoe_decks: 6,
    deck_profile: 'spanish_48',
    house_edge: 0.27,
    rating_edge_for_comp: 2.2,
    decisions_per_hour: 75,
    seats_available: 7,
    min_bet: null,
    max_bet: null,
    notes: 'Progressive side bets are paytable-dependent; store separately.',
  },

  // Baccarat (3 variants)
  {
    code: 'mini_baccarat',
    game_type: 'baccarat',
    name: 'Mini Baccarat',
    variant_name: 'standard',
    shoe_decks: 8,
    deck_profile: 'standard_52',
    house_edge: 1.06,
    rating_edge_for_comp: 1.2,
    decisions_per_hour: 72,
    seats_available: 7,
    min_bet: null,
    max_bet: null,
    notes: 'Banker 1.06%, Player 1.24%.',
  },
  {
    code: 'rising_phoenix_comm',
    game_type: 'baccarat',
    name: 'Rising Phoenix Baccarat \u2014 Commission',
    variant_name: 'commission',
    shoe_decks: 8,
    deck_profile: 'standard_52',
    house_edge: 1.06,
    rating_edge_for_comp: 1.2,
    decisions_per_hour: 72,
    seats_available: 7,
    min_bet: null,
    max_bet: null,
    notes: null,
  },
  {
    code: 'rising_phoenix_comm_free',
    game_type: 'baccarat',
    name: 'Rising Phoenix Baccarat \u2014 Commission-Free',
    variant_name: 'commission-free (Banker 3-card 7 push)',
    shoe_decks: 8,
    deck_profile: 'standard_52',
    house_edge: 1.02,
    rating_edge_for_comp: 1.2,
    decisions_per_hour: 72,
    seats_available: 7,
    min_bet: null,
    max_bet: null,
    notes: null,
  },

  // Pai Gow (2 variants)
  {
    code: 'pai_gow',
    game_type: 'pai_gow',
    name: 'Pai Gow Poker',
    variant_name: 'standard',
    shoe_decks: null,
    deck_profile: 'with_joker_53',
    house_edge: 1.46,
    rating_edge_for_comp: 1.96,
    decisions_per_hour: 30,
    seats_available: 6,
    min_bet: null,
    max_bet: null,
    notes: null,
  },
  {
    code: 'emperor_challenge_exposed',
    game_type: 'pai_gow',
    name: "Emperor's Challenge Exposed",
    variant_name: 'commission-free exposed',
    shoe_decks: null,
    deck_profile: 'with_joker_53',
    house_edge: 1.46,
    rating_edge_for_comp: 1.96,
    decisions_per_hour: 30,
    seats_available: 6,
    min_bet: null,
    max_bet: null,
    notes: 'Placeholder edge; model exact rules later.',
  },

  // Carnival (2 variants)
  {
    code: 'uth',
    game_type: 'carnival',
    name: "Ultimate Texas Hold 'Em",
    variant_name: 'standard',
    shoe_decks: null,
    deck_profile: 'standard_52',
    house_edge: 2.19,
    rating_edge_for_comp: 2.19,
    decisions_per_hour: 30,
    seats_available: 7,
    min_bet: null,
    max_bet: null,
    notes: null,
  },
  {
    code: 'high_card_flush',
    game_type: 'carnival',
    name: 'High Card Flush',
    variant_name: 'optimal baseline',
    shoe_decks: null,
    deck_profile: 'standard_52',
    house_edge: 2.64,
    rating_edge_for_comp: 2.64,
    decisions_per_hour: 50,
    seats_available: 7,
    min_bet: null,
    max_bet: null,
    notes: null,
  },
];

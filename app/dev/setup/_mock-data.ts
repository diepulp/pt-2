/**
 * Mock data factory for dev wizard route.
 * Returns Database row shapes with deterministic dev context IDs.
 */

import type { Database } from '@/types/database.types';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

const DEV_CASINO_ID = 'ca000000-0000-0000-0000-000000000001';
const DEV_ACTOR_ID = '5a000000-0000-0000-0000-000000000001';

export function mockCasinoSettingsRow(
  overrides?: Partial<CasinoSettingsRow>,
): CasinoSettingsRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    casino_id: DEV_CASINO_ID,
    timezone: 'America/Los_Angeles',
    gaming_day_start_time: '06:00:00',
    table_bank_mode: 'INVENTORY_COUNT',
    setup_status: 'not_started',
    setup_completed_at: null,
    setup_completed_by: null,
    alert_thresholds: {},
    ctr_threshold: 3,
    promo_allow_anonymous_issuance: false,
    promo_require_exact_match: true,
    watchlist_floor: 500,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function mockGamingTableRow(
  overrides?: Partial<GamingTableRow>,
): GamingTableRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    casino_id: DEV_CASINO_ID,
    label: 'BJ-01',
    label_normalized: 'bj-01',
    type: 'blackjack',
    pit: null,
    game_settings_id: null,
    status: 'active',
    par_total_cents: null,
    par_updated_at: null,
    par_updated_by: null,
    created_at: now,
    ...overrides,
  };
}

// === Game Settings Mocks ===

type GameSettingsRow = Database['public']['Tables']['game_settings']['Row'];

export function mockGameSettingsRow(
  overrides?: Partial<GameSettingsRow>,
): GameSettingsRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    casino_id: DEV_CASINO_ID,
    game_type: 'blackjack',
    code: 'bj_6d',
    name: 'Blackjack — 6-Deck Shoe',
    variant_name: '6-deck shoe',
    shoe_decks: 6,
    deck_profile: 'standard_52',
    house_edge: 0.28,
    rating_edge_for_comp: 0.75,
    point_multiplier: null,
    points_conversion_rate: null,
    rotation_interval_minutes: null,
    decisions_per_hour: 70,
    seats_available: 7,
    min_bet: 25,
    max_bet: 5000,
    notes: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/** Pre-built seed games for dev presentation */
export function mockSeededGames(): GameSettingsRow[] {
  return [
    mockGameSettingsRow({
      game_type: 'blackjack',
      code: 'bj_6d',
      name: 'Blackjack — 6-Deck Shoe',
      variant_name: '6-deck shoe',
      shoe_decks: 6,
      house_edge: 0.28,
      decisions_per_hour: 70,
      seats_available: 7,
    }),
    mockGameSettingsRow({
      game_type: 'blackjack',
      code: 'bj_2d',
      name: 'Blackjack — Double Deck',
      variant_name: 'double deck',
      shoe_decks: 2,
      house_edge: 0.46,
      decisions_per_hour: 80,
      seats_available: 6,
    }),
    mockGameSettingsRow({
      game_type: 'roulette',
      code: 'rl_dbl',
      name: 'Roulette — Double Zero',
      variant_name: 'American',
      shoe_decks: null,
      deck_profile: null,
      house_edge: 5.26,
      decisions_per_hour: 38,
      seats_available: 8,
    }),
    mockGameSettingsRow({
      game_type: 'baccarat',
      code: 'bac_std',
      name: 'Baccarat — Standard',
      variant_name: null,
      shoe_decks: 8,
      house_edge: 1.06,
      decisions_per_hour: 72,
      seats_available: 14,
    }),
    mockGameSettingsRow({
      game_type: 'pai_gow',
      code: 'pg_std',
      name: 'Pai Gow Poker',
      variant_name: null,
      shoe_decks: null,
      deck_profile: 'with_joker_53',
      house_edge: 1.46,
      decisions_per_hour: 30,
      seats_available: 6,
    }),
    mockGameSettingsRow({
      game_type: 'carnival',
      code: 'uth_std',
      name: "Ultimate Texas Hold'em",
      variant_name: null,
      shoe_decks: null,
      deck_profile: 'standard_52',
      house_edge: 2.19,
      decisions_per_hour: 52,
      seats_available: 7,
    }),
  ];
}

export function mockCompleteSetupResult() {
  return {
    ok: true,
    casino_id: DEV_CASINO_ID,
    setup_status: 'ready',
    setup_completed_at: new Date().toISOString(),
    setup_completed_by: DEV_ACTOR_ID,
  };
}

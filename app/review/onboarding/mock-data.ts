/**
 * Mock data for Onboarding UI Review
 *
 * Provides realistic fixtures for all onboarding flows without
 * requiring Supabase or server actions.
 */

import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import type { Database } from '@/types/database.types';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];
type StaffInviteRow = Database['public']['Tables']['staff_invite']['Row'];

// === Casino Settings ===

export const MOCK_CASINO_SETTINGS: CasinoSettingsRow = {
  id: 'cs-001',
  casino_id: 'mock-casino-001',
  timezone: 'America/Los_Angeles',
  gaming_day_start_time: '06:00:00',
  table_bank_mode: 'IMPREST_TO_PAR',
  setup_status: 'in_progress',
  setup_completed_at: null,
  setup_completed_by: null,
  alert_thresholds: {},
  ctr_threshold: 10000,
  promo_allow_anonymous_issuance: false,
  promo_require_exact_match: true,
  watchlist_floor: 5000,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

export const MOCK_CASINO_SETTINGS_EMPTY: CasinoSettingsRow | null = null;

// === Game Settings ===

export const MOCK_GAME_SETTINGS: GameSettingsDTO[] = [
  {
    id: 'gs-001',
    casino_id: 'mock-casino-001',
    game_type: 'blackjack',
    code: 'bj_6d_s17',
    name: 'Blackjack 6-Deck',
    variant_name: '6-deck shoe, S17',
    shoe_decks: 6,
    deck_profile: 'standard_52',
    house_edge: 0.5,
    rating_edge_for_comp: 1.0,
    decisions_per_hour: 70,
    seats_available: 7,
    min_bet: 15,
    max_bet: 5000,
    notes: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'gs-002',
    casino_id: 'mock-casino-001',
    game_type: 'blackjack',
    code: 'bj_dd_h17',
    name: 'Blackjack Double Deck',
    variant_name: 'Double deck, H17',
    shoe_decks: 2,
    deck_profile: 'standard_52',
    house_edge: 0.4,
    rating_edge_for_comp: 0.8,
    decisions_per_hour: 80,
    seats_available: 6,
    min_bet: 25,
    max_bet: 10000,
    notes: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'gs-003',
    casino_id: 'mock-casino-001',
    game_type: 'baccarat',
    code: 'bac_std',
    name: 'Baccarat',
    variant_name: 'Standard',
    shoe_decks: 8,
    deck_profile: 'standard_52',
    house_edge: 1.06,
    rating_edge_for_comp: 1.5,
    decisions_per_hour: 72,
    seats_available: 14,
    min_bet: 25,
    max_bet: 25000,
    notes: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'gs-004',
    casino_id: 'mock-casino-001',
    game_type: 'pai_gow',
    code: 'pg_std',
    name: 'Pai Gow Poker',
    variant_name: 'Standard',
    shoe_decks: null,
    deck_profile: 'with_joker_53',
    house_edge: 2.5,
    rating_edge_for_comp: 2.0,
    decisions_per_hour: 30,
    seats_available: 6,
    min_bet: 15,
    max_bet: 5000,
    notes: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
];

// === Gaming Tables ===

export const MOCK_GAMING_TABLES: GamingTableRow[] = [
  {
    id: 'tbl-001',
    casino_id: 'mock-casino-001',
    label: 'BJ-01',
    label_normalized: 'bj-01',
    type: 'blackjack',
    pit: 'Main',
    status: 'active',
    game_settings_id: 'gs-001',
    par_total_cents: 1000000,
    par_updated_at: '2026-04-01T00:00:00Z',
    par_updated_by: null,
    created_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'tbl-002',
    casino_id: 'mock-casino-001',
    label: 'BJ-02',
    label_normalized: 'bj-02',
    type: 'blackjack',
    pit: 'Main',
    status: 'active',
    game_settings_id: 'gs-002',
    par_total_cents: 500000,
    par_updated_at: '2026-04-01T00:00:00Z',
    par_updated_by: null,
    created_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'tbl-003',
    casino_id: 'mock-casino-001',
    label: 'BC-01',
    label_normalized: 'bc-01',
    type: 'baccarat',
    pit: 'VIP',
    status: 'active',
    game_settings_id: 'gs-003',
    par_total_cents: 2500000,
    par_updated_at: '2026-04-01T00:00:00Z',
    par_updated_by: null,
    created_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'tbl-004',
    casino_id: 'mock-casino-001',
    label: 'PG-01',
    label_normalized: 'pg-01',
    type: 'pai_gow',
    pit: 'Main',
    status: 'active',
    game_settings_id: 'gs-004',
    par_total_cents: null,
    par_updated_at: null,
    par_updated_by: null,
    created_at: '2026-04-01T00:00:00Z',
  },
];

// === Staff Invites ===

export const MOCK_INVITES: Pick<
  StaffInviteRow,
  'id' | 'email' | 'staff_role' | 'expires_at' | 'accepted_at'
>[] = [
  {
    id: 'inv-001',
    email: 'sarah.jones@goldpalace.com',
    staff_role: 'pit_boss',
    expires_at: '2026-04-14T00:00:00Z',
    accepted_at: null,
  },
  {
    id: 'inv-002',
    email: 'mike.chen@goldpalace.com',
    staff_role: 'dealer',
    expires_at: '2026-04-14T00:00:00Z',
    accepted_at: '2026-04-03T14:30:00Z',
  },
  {
    id: 'inv-003',
    email: 'lisa.park@goldpalace.com',
    staff_role: 'cashier',
    expires_at: '2026-03-20T00:00:00Z',
    accepted_at: null,
  },
  {
    id: 'inv-004',
    email: 'james.w@goldpalace.com',
    staff_role: 'admin',
    expires_at: '2026-04-14T00:00:00Z',
    accepted_at: null,
  },
];

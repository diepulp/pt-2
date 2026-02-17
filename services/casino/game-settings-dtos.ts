/**
 * Game Settings DTOs — PRD-029
 *
 * Pattern B (Pick/Omit from Database types).
 * CasinoService bounded context owns game_settings table.
 */

import type { Database } from '@/types/database.types';

// === Base Row Type ===

type GameSettingsRow = Database['public']['Tables']['game_settings']['Row'];

// === DTOs ===

/** Game settings public DTO */
export type GameSettingsDTO = Pick<
  GameSettingsRow,
  | 'id'
  | 'casino_id'
  | 'game_type'
  | 'code'
  | 'name'
  | 'variant_name'
  | 'shoe_decks'
  | 'deck_profile'
  | 'house_edge'
  | 'rating_edge_for_comp'
  | 'decisions_per_hour'
  | 'seats_available'
  | 'min_bet'
  | 'max_bet'
  | 'notes'
  | 'created_at'
  | 'updated_at'
>;

/** Game settings creation input */
export type CreateGameSettingsDTO = Omit<
  GameSettingsDTO,
  'id' | 'created_at' | 'updated_at'
>;

/** Game settings update input (immutable: id, casino_id, code) */
export type UpdateGameSettingsDTO = Partial<
  Omit<
    GameSettingsDTO,
    'id' | 'casino_id' | 'code' | 'created_at' | 'updated_at'
  >
>;

// === Filter Types ===

/** Filters for game settings list queries */
export type GameSettingsListFilters = {
  game_type?: Database['public']['Enums']['game_type'];
  cursor?: string;
  limit?: number;
};

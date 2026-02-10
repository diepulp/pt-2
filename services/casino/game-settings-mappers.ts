/**
 * Game Settings Mappers — PRD-029
 *
 * Row-to-DTO transformations for game_settings and game_settings_side_bet.
 */

import type { GameSettingsDTO } from './game-settings-dtos';
import type { GameSettingsSideBetDTO } from './game-settings-side-bet-dtos';

// === Selected Row Types (match Supabase query returns) ===

type GameSettingsSelectedRow = {
  id: string;
  casino_id: string;
  game_type:
    | 'blackjack'
    | 'poker'
    | 'roulette'
    | 'baccarat'
    | 'pai_gow'
    | 'carnival';
  code: string;
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
  created_at: string;
  updated_at: string;
};

type GameSettingsSideBetSelectedRow = {
  id: string;
  game_settings_id: string;
  casino_id: string;
  side_bet_name: string;
  house_edge: number;
  paytable_id: string | null;
  enabled_by_default: boolean;
  created_at: string;
  updated_at: string;
};

// === Game Settings Mappers ===

export function toGameSettingsDTO(
  row: GameSettingsSelectedRow,
): GameSettingsDTO {
  return {
    id: row.id,
    casino_id: row.casino_id,
    game_type: row.game_type,
    code: row.code,
    name: row.name,
    variant_name: row.variant_name,
    shoe_decks: row.shoe_decks,
    deck_profile: row.deck_profile,
    house_edge: row.house_edge,
    rating_edge_for_comp: row.rating_edge_for_comp,
    decisions_per_hour: row.decisions_per_hour,
    seats_available: row.seats_available,
    min_bet: row.min_bet,
    max_bet: row.max_bet,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toGameSettingsDTOList(
  rows: GameSettingsSelectedRow[],
): GameSettingsDTO[] {
  return rows.map(toGameSettingsDTO);
}

export function toGameSettingsDTOOrNull(
  row: GameSettingsSelectedRow | null,
): GameSettingsDTO | null {
  return row ? toGameSettingsDTO(row) : null;
}

// === Side Bet Mappers ===

export function toGameSettingsSideBetDTO(
  row: GameSettingsSideBetSelectedRow,
): GameSettingsSideBetDTO {
  return {
    id: row.id,
    game_settings_id: row.game_settings_id,
    casino_id: row.casino_id,
    side_bet_name: row.side_bet_name,
    house_edge: row.house_edge,
    paytable_id: row.paytable_id,
    enabled_by_default: row.enabled_by_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toGameSettingsSideBetDTOList(
  rows: GameSettingsSideBetSelectedRow[],
): GameSettingsSideBetDTO[] {
  return rows.map(toGameSettingsSideBetDTO);
}

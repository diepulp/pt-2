/**
 * Game Settings Side Bet DTOs — PRD-029
 *
 * Pattern B (Pick/Omit from Database types).
 * casino_id is trigger-derived — omitted from Create DTO.
 */

import type { Database } from '@/types/database.types';

// === Base Row Type ===

type GameSettingsSideBetRow =
  Database['public']['Tables']['game_settings_side_bet']['Row'];

// === DTOs ===

/** Side bet public DTO */
export type GameSettingsSideBetDTO = Pick<
  GameSettingsSideBetRow,
  | 'id'
  | 'game_settings_id'
  | 'casino_id'
  | 'side_bet_name'
  | 'house_edge'
  | 'paytable_id'
  | 'enabled_by_default'
  | 'created_at'
  | 'updated_at'
>;

/** Side bet creation input — casino_id omitted (trigger-derived) */
export type CreateGameSettingsSideBetDTO = Omit<
  GameSettingsSideBetDTO,
  'id' | 'casino_id' | 'created_at' | 'updated_at'
>;

/** Side bet update input (immutable: id, casino_id, game_settings_id) */
export type UpdateGameSettingsSideBetDTO = Partial<
  Omit<
    GameSettingsSideBetDTO,
    'id' | 'casino_id' | 'game_settings_id' | 'created_at' | 'updated_at'
  >
>;

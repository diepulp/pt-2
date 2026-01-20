/**
 * Pit Map Navigation Types
 * Local types for the pit map UI components
 */

import type { Database } from '@/types/database.types';

export type GameType = Database['public']['Enums']['game_type'];
export type TableStatus = Database['public']['Enums']['table_status'];

export interface PitData {
  id: string;
  label: string;
  capacity: number | null;
  sequence: number;
  tables: TableData[];
  isPinned?: boolean;
  isRecent?: boolean;
}

export interface TableData {
  id: string;
  label: string;
  status: TableStatus;
  gameType: GameType;
  pitId: string;
  seatNumber?: string;
  minBet?: number;
  maxBet?: number;
  dealerName?: string;
  occupancy?: number;
  maxOccupancy?: number;
  alerts?: TableAlert[];
}

export interface TableAlert {
  id: string;
  type: 'fill' | 'drop' | 'mtl' | 'limit' | 'high_action';
  label: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: Date;
}

export type ViewMode = 'grid' | 'list';

export interface PitMapState {
  selectedPitId: string | null;
  viewMode: ViewMode;
  searchQuery: string;
  commandPaletteOpen: boolean;
  pinnedPitIds: string[];
  recentPitIds: string[];
}

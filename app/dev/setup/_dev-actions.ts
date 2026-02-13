'use server';

/**
 * Stubbed server actions for dev wizard route.
 * Mirror production _actions.ts signatures but return mock data.
 * Zod validation is preserved — no RLS, no auth, no Supabase calls.
 */

import { z } from 'zod';

import type { ServiceResult } from '@/lib/http/service-response';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import {
  createGameSettingsSchema,
  updateGameSettingsSchema,
} from '@/services/casino/game-settings-schemas';
import type { GameSettingsTemplate } from '@/services/casino/game-settings-templates';
import {
  completeSetupSchema,
  setupCasinoSettingsSchema,
} from '@/services/casino/schemas';
import {
  createGamingTableSchema,
  updateTableParSchema,
} from '@/services/table-context/schemas';
import type { Database } from '@/types/database.types';

import {
  mockCasinoSettingsRow,
  mockCompleteSetupResult,
  mockGameSettingsRow,
  mockGamingTableRow,
} from './_mock-data';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

interface CompleteSetupResult {
  ok: boolean;
  casino_id: string;
  setup_status: string;
  setup_completed_at: string;
  setup_completed_by: string;
}

interface UpdateTableParResult {
  id: string;
  par_total_cents: number | null;
}

function devRequestId(): string {
  return `dev-${crypto.randomUUID().slice(0, 8)}`;
}

function devResult<T>(data: T): ServiceResult<T> {
  return {
    ok: true,
    code: 'OK' as const,
    data,
    requestId: devRequestId(),
    durationMs: 1,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 1. completeSetupAction
// ---------------------------------------------------------------------------

export async function completeSetupAction(input: {
  skip?: boolean;
}): Promise<ServiceResult<CompleteSetupResult>> {
  completeSetupSchema.parse(input);
  return devResult(mockCompleteSetupResult());
}

// ---------------------------------------------------------------------------
// 2. updateCasinoSettingsAction
// ---------------------------------------------------------------------------

export async function updateCasinoSettingsAction(
  formData: FormData,
): Promise<ServiceResult<CasinoSettingsRow>> {
  const raw = {
    timezone: formData.get('timezone') || undefined,
    gaming_day_start_time: formData.get('gaming_day_start_time') || undefined,
    table_bank_mode: formData.get('table_bank_mode') || undefined,
  };

  const validated = setupCasinoSettingsSchema.parse(raw);
  return devResult(mockCasinoSettingsRow(validated));
}

// ---------------------------------------------------------------------------
// 3. seedSelectedGamesAction
// ---------------------------------------------------------------------------

export async function seedSelectedGamesAction(input: {
  games: GameSettingsTemplate[];
}): Promise<ServiceResult<{ created: GameSettingsDTO[]; skipped: number }>> {
  const created: GameSettingsDTO[] = [];
  for (const game of input.games) {
    const validated = createGameSettingsSchema.parse({
      ...game,
      casino_id: 'ca000000-0000-4000-a000-000000000001',
    });
    const row = mockGameSettingsRow({
      game_type: validated.game_type,
      code: validated.code,
      name: validated.name,
      variant_name: validated.variant_name ?? null,
      shoe_decks: validated.shoe_decks ?? null,
      deck_profile: validated.deck_profile ?? null,
      house_edge: validated.house_edge,
      rating_edge_for_comp: validated.rating_edge_for_comp ?? null,
      decisions_per_hour: validated.decisions_per_hour,
      seats_available: validated.seats_available,
      min_bet: validated.min_bet ?? null,
      max_bet: validated.max_bet ?? null,
      notes: validated.notes ?? null,
    });
    created.push(row as unknown as GameSettingsDTO);
  }
  return devResult({ created, skipped: 0 });
}

// ---------------------------------------------------------------------------
// 4. createGamingTableAction
// ---------------------------------------------------------------------------

export async function createGamingTableAction(input: {
  label: string;
  type: string;
  pit?: string;
  game_settings_id?: string;
}): Promise<ServiceResult<GamingTableRow>> {
  const validated = createGamingTableSchema.parse(input);
  return devResult(
    mockGamingTableRow({
      label: validated.label,
      type: validated.type,
      pit: validated.pit ?? null,
      game_settings_id: validated.game_settings_id ?? null,
      label_normalized: validated.label
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' '),
    }),
  );
}

// ---------------------------------------------------------------------------
// 5. updateTableParAction
// ---------------------------------------------------------------------------

export async function updateTableParAction(input: {
  tableId: string;
  parTotalCents: number | null;
}): Promise<ServiceResult<UpdateTableParResult>> {
  const validated = updateTableParSchema.parse(input);
  return devResult({
    id: validated.tableId,
    par_total_cents: validated.parTotalCents,
  });
}

// ---------------------------------------------------------------------------
// 6. createCustomGameSettingsAction
// ---------------------------------------------------------------------------

export async function createCustomGameSettingsAction(input: {
  game_type: string;
  code: string;
  name: string;
  variant_name?: string | null;
  shoe_decks?: number | null;
  deck_profile?: string | null;
  house_edge: number;
  rating_edge_for_comp?: number | null;
  decisions_per_hour: number;
  seats_available: number;
  min_bet?: number | null;
  max_bet?: number | null;
  notes?: string | null;
}): Promise<ServiceResult<GameSettingsDTO>> {
  const validated = createGameSettingsSchema.parse({
    ...input,
    casino_id: 'ca000000-0000-4000-a000-000000000001',
  });
  const row = mockGameSettingsRow({
    game_type: validated.game_type,
    code: validated.code,
    name: validated.name,
    variant_name: validated.variant_name ?? null,
    shoe_decks: validated.shoe_decks ?? null,
    deck_profile: validated.deck_profile ?? null,
    house_edge: validated.house_edge,
    rating_edge_for_comp: validated.rating_edge_for_comp ?? null,
    decisions_per_hour: validated.decisions_per_hour,
    seats_available: validated.seats_available,
    min_bet: validated.min_bet ?? null,
    max_bet: validated.max_bet ?? null,
    notes: validated.notes ?? null,
  });
  return devResult(row as unknown as GameSettingsDTO);
}

// ---------------------------------------------------------------------------
// 7. updateGameSettingsAction
// ---------------------------------------------------------------------------

const updateGameSettingsIdSchema = z.string().uuid();

export async function updateGameSettingsAction(input: {
  id: string;
  game_type?: string;
  name?: string;
  variant_name?: string | null;
  shoe_decks?: number | null;
  deck_profile?: string | null;
  house_edge?: number;
  rating_edge_for_comp?: number | null;
  decisions_per_hour?: number;
  seats_available?: number;
  min_bet?: number | null;
  max_bet?: number | null;
  notes?: string | null;
}): Promise<ServiceResult<GameSettingsDTO>> {
  const id = updateGameSettingsIdSchema.parse(input.id);
  const { id: _, ...updateFields } = input;
  const validated = updateGameSettingsSchema.parse(updateFields);

  if (Object.keys(validated).length === 0) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      error: 'At least one field must be provided for update',
      requestId: devRequestId(),
      durationMs: 1,
      timestamp: new Date().toISOString(),
    };
  }

  // Return a mock row with the updates applied
  const row = mockGameSettingsRow({ id, ...validated });
  return devResult(row as unknown as GameSettingsDTO);
}

// ---------------------------------------------------------------------------
// 8. deleteGameSettingsAction
// ---------------------------------------------------------------------------

export async function deleteGameSettingsAction(input: {
  id: string;
}): Promise<ServiceResult<{ deleted: true }>> {
  z.object({ id: z.string().uuid() }).parse(input);
  return devResult({ deleted: true as const });
}

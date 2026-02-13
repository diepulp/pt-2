'use server';

/**
 * Setup Wizard Server Actions (PRD-030 WS2)
 *
 * Five server actions providing the backend glue between the wizard UI
 * and the database. Each step persists on "Next" (FR-9 persistence model).
 *
 * Authorization: All actions require admin role (enforced via middleware + explicit check).
 * Context: casino_id derived from RLS context (ADR-024), never from user input.
 */

import { z } from 'zod';

import { DomainError } from '@/lib/errors/domain-errors';
import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import {
  createGameSettings,
  updateGameSettings,
  deleteGameSettings,
} from '@/services/casino/game-settings-crud';
import type { GameSettingsDTO } from '@/services/casino/game-settings-dtos';
import {
  createGameSettingsSchema,
  updateGameSettingsSchema,
} from '@/services/casino/game-settings-schemas';
import type { GameSettingsTemplate } from '@/services/casino/game-settings-templates';
import {
  completeSetupSchema,
  setupCasinoSettingsSchema,
  seedGameSettingsSchema,
} from '@/services/casino/schemas';
import {
  createGamingTableSchema,
  updateTableParSchema,
} from '@/services/table-context/schemas';
import type { Database } from '@/types/database.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type GamingTableRow = Database['public']['Tables']['gaming_table']['Row'];

interface CompleteSetupResult {
  ok: boolean;
  casino_id: string;
  setup_status: string;
  setup_completed_at: string;
  setup_completed_by: string;
}

interface SeedGameSettingsResult {
  seeded_count: number;
}

interface UpdateTableParResult {
  id: string;
  par_total_cents: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function forbidden(
  correlationId: string,
  startedAt: number,
  message = 'Only admin role can perform this action',
): ServiceResult<never> {
  return {
    ok: false,
    code: 'FORBIDDEN',
    error: message,
    requestId: correlationId,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Map DomainError to ServiceResult.
 */
function mapDomainError(
  error: DomainError,
  correlationId: string,
  startedAt: number,
): ServiceResult<never> {
  return {
    ok: false,
    code: error.code,
    error: error.message,
    requestId: correlationId,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Map Postgres RPC error messages to ServiceResult error codes.
 * The RPC raises exceptions with prefixed messages like "FORBIDDEN: role not allowed".
 */
function mapRpcError(
  errorMessage: string,
  correlationId: string,
  startedAt: number,
): ServiceResult<never> {
  const msg = errorMessage ?? 'Unknown error';
  let code: string = 'INTERNAL_ERROR';

  if (msg.includes('UNAUTHORIZED')) code = 'UNAUTHORIZED';
  else if (msg.includes('FORBIDDEN')) code = 'FORBIDDEN';
  else if (msg.includes('NOT_FOUND')) code = 'NOT_FOUND';
  else if (msg.includes('PRECONDITION_FAILED')) code = 'PRECONDITION_FAILED';

  return {
    ok: false,
    code,
    error: msg,
    requestId: correlationId,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 1. completeSetupAction
// ---------------------------------------------------------------------------

/**
 * Complete casino setup (Step 5 / Skip).
 * Wraps rpc_complete_casino_setup. Idempotent — returns success if already ready.
 */
export async function completeSetupAction(input: {
  skip?: boolean;
}): Promise<ServiceResult<CompleteSetupResult>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      if (ctx.rlsContext?.staffRole !== 'admin') {
        return forbidden(ctx.correlationId, ctx.startedAt);
      }

      const validated = completeSetupSchema.parse(input);

      const { data, error } = await supabase.rpc('rpc_complete_casino_setup', {
        p_skip: validated.skip ?? false,
      });

      if (error) {
        return mapRpcError(error.message, ctx.correlationId, ctx.startedAt);
      }

      // RPC returns jsonb — extract typed fields from the JSON envelope
      const row =
        typeof data === 'object' && data !== null && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : null;

      if (!row) {
        return {
          ok: false,
          code: 'INTERNAL_ERROR',
          error: 'RPC returned unexpected data format',
          requestId: ctx.correlationId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      const result: CompleteSetupResult = {
        ok: Boolean(row.ok),
        casino_id: String(row.casino_id),
        setup_status: String(row.setup_status),
        setup_completed_at: String(row.setup_completed_at),
        setup_completed_by: String(row.setup_completed_by),
      };

      return {
        ok: true,
        code: 'OK' as const,
        data: result,
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    { domain: 'casino', action: 'complete-setup' },
  );
}

// ---------------------------------------------------------------------------
// 2. updateCasinoSettingsAction
// ---------------------------------------------------------------------------

/**
 * Update casino settings (Step 1 — Casino Basics).
 * Persists timezone, gaming_day_start_time, and table_bank_mode.
 */
export async function updateCasinoSettingsAction(
  formData: FormData,
): Promise<ServiceResult<CasinoSettingsRow>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      if (ctx.rlsContext?.staffRole !== 'admin') {
        return forbidden(ctx.correlationId, ctx.startedAt);
      }

      const raw = {
        timezone: formData.get('timezone') || undefined,
        gaming_day_start_time:
          formData.get('gaming_day_start_time') || undefined,
        table_bank_mode: formData.get('table_bank_mode') || undefined,
      };

      const validated = setupCasinoSettingsSchema.parse(raw);

      const { data, error } = await supabase
        .from('casino_settings')
        .update(validated)
        .eq('casino_id', ctx.rlsContext!.casinoId)
        .select()
        .single();

      if (error) {
        return {
          ok: false,
          code: error.code === 'PGRST116' ? 'NOT_FOUND' : 'INTERNAL_ERROR',
          error: error.message,
          requestId: ctx.correlationId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        ok: true,
        code: 'OK' as const,
        data,
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    { domain: 'casino', action: 'update-settings' },
  );
}

// ---------------------------------------------------------------------------
// 3. seedGameSettingsAction
// ---------------------------------------------------------------------------

/**
 * Seed game settings defaults (Step 2).
 * Wraps rpc_seed_game_settings_defaults. Idempotent — re-run does not duplicate.
 * After seeding, queries game_settings to verify rows exist and return count.
 */
export async function seedGameSettingsAction(input: {
  template: string;
}): Promise<ServiceResult<SeedGameSettingsResult>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      if (ctx.rlsContext?.staffRole !== 'admin') {
        return forbidden(ctx.correlationId, ctx.startedAt);
      }

      const validated = seedGameSettingsSchema.parse(input);

      const { error } = await supabase.rpc('rpc_seed_game_settings_defaults', {
        p_template: validated.template,
      });

      if (error) {
        return mapRpcError(error.message, ctx.correlationId, ctx.startedAt);
      }

      // Verify seeded rows exist (mitigates void-return RPC risk)
      const { count } = await supabase
        .from('game_settings')
        .select('id', { count: 'exact', head: true })
        .eq('casino_id', ctx.rlsContext!.casinoId);

      return {
        ok: true,
        code: 'OK' as const,
        data: { seeded_count: count ?? 0 },
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    { domain: 'casino', action: 'seed-game-settings' },
  );
}

// ---------------------------------------------------------------------------
// 3b. seedSelectedGamesAction
// ---------------------------------------------------------------------------

/**
 * Seed selected games from the template catalog (Step 2).
 * Unlike seedGameSettingsAction which bulk-inserts all 11 defaults via RPC,
 * this action creates only the user-selected games via the CRUD layer.
 * ON CONFLICT-safe: skips games whose code already exists for this casino.
 */
export async function seedSelectedGamesAction(input: {
  games: GameSettingsTemplate[];
}): Promise<ServiceResult<{ created: GameSettingsDTO[]; skipped: number }>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      if (ctx.rlsContext?.staffRole !== 'admin') {
        return forbidden(ctx.correlationId, ctx.startedAt);
      }

      if (!input.games || input.games.length === 0) {
        return {
          ok: false,
          code: 'VALIDATION_ERROR',
          error: 'At least one game must be selected',
          requestId: ctx.correlationId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      const casinoId = ctx.rlsContext!.casinoId;
      const created: GameSettingsDTO[] = [];
      let skipped = 0;

      for (const game of input.games) {
        const validated = createGameSettingsSchema.parse({
          ...game,
          casino_id: casinoId,
        });

        try {
          const result = await createGameSettings(ctx.supabase, {
            casino_id: validated.casino_id,
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
          created.push(result);
        } catch (err) {
          // Skip duplicates gracefully (code already exists for this casino)
          if (err instanceof DomainError && err.code === 'UNIQUE_VIOLATION') {
            skipped++;
            continue;
          }
          throw err;
        }
      }

      return {
        ok: true,
        code: 'OK' as const,
        data: { created, skipped },
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    { domain: 'casino', action: 'seed-selected-games' },
  );
}

// ---------------------------------------------------------------------------
// 4. createGamingTableAction
// ---------------------------------------------------------------------------

/**
 * Create/upsert a gaming table (Step 3).
 * Upserts on (casino_id, label_normalized) — no duplicates on re-run.
 * casino_id derived from middleware context (ADR-024).
 */
export async function createGamingTableAction(input: {
  label: string;
  type: string;
  pit?: string;
  game_settings_id?: string;
}): Promise<ServiceResult<GamingTableRow>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      if (ctx.rlsContext?.staffRole !== 'admin') {
        return forbidden(ctx.correlationId, ctx.startedAt);
      }

      const validated = createGamingTableSchema.parse(input);

      const { data, error } = await supabase
        .from('gaming_table')
        .upsert(
          {
            casino_id: ctx.rlsContext!.casinoId,
            label: validated.label,
            type: validated.type,
            pit: validated.pit ?? null,
            game_settings_id: validated.game_settings_id ?? null,
            status: 'active',
          },
          { onConflict: 'casino_id,label_normalized' },
        )
        .select()
        .single();

      if (error) {
        return {
          ok: false,
          code: error.code === '23505' ? 'UNIQUE_VIOLATION' : 'INTERNAL_ERROR',
          error: error.message,
          requestId: ctx.correlationId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        ok: true,
        code: 'OK' as const,
        data,
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    { domain: 'table-context', action: 'create-table' },
  );
}

// ---------------------------------------------------------------------------
// 5. updateTableParAction
// ---------------------------------------------------------------------------

/**
 * Update gaming table par target (Step 4).
 * Sets par_total_cents with actor and timestamp stamps.
 * Casino-scoped: only updates tables belonging to the authenticated casino.
 */
export async function updateTableParAction(input: {
  tableId: string;
  parTotalCents: number | null;
}): Promise<ServiceResult<UpdateTableParResult>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      if (ctx.rlsContext?.staffRole !== 'admin') {
        return forbidden(ctx.correlationId, ctx.startedAt);
      }

      const validated = updateTableParSchema.parse(input);

      const { data, error } = await supabase
        .from('gaming_table')
        .update({
          par_total_cents: validated.parTotalCents,
          par_updated_at: new Date().toISOString(),
          par_updated_by: ctx.rlsContext!.actorId,
        })
        .eq('id', validated.tableId)
        .eq('casino_id', ctx.rlsContext!.casinoId)
        .select('id, par_total_cents')
        .single();

      if (error) {
        return {
          ok: false,
          code: error.code === 'PGRST116' ? 'NOT_FOUND' : 'INTERNAL_ERROR',
          error: error.message,
          requestId: ctx.correlationId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        ok: true,
        code: 'OK' as const,
        data,
        requestId: ctx.correlationId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    { domain: 'table-context', action: 'update-par' },
  );
}

// ---------------------------------------------------------------------------
// 6. createCustomGameSettingsAction
// ---------------------------------------------------------------------------

/**
 * Create a custom game setting (Step 2 — Game Management).
 * casino_id is injected from RLS context (ADR-024), never from user input.
 */
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
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      if (ctx.rlsContext?.staffRole !== 'admin') {
        return forbidden(ctx.correlationId, ctx.startedAt);
      }

      // Inject casino_id from context — client must NOT supply it
      const validated = createGameSettingsSchema.parse({
        ...input,
        casino_id: ctx.rlsContext!.casinoId,
      });

      try {
        const result = await createGameSettings(ctx.supabase, {
          casino_id: validated.casino_id,
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

        return {
          ok: true,
          code: 'OK' as const,
          data: result,
          requestId: ctx.correlationId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        if (err instanceof DomainError) {
          return mapDomainError(err, ctx.correlationId, ctx.startedAt);
        }
        throw err;
      }
    },
    { domain: 'casino', action: 'create-game-settings' },
  );
}

// ---------------------------------------------------------------------------
// 7. updateGameSettingsAction
// ---------------------------------------------------------------------------

const updateGameSettingsIdSchema = z.string().uuid('Invalid game settings ID');

/**
 * Update a game setting (Step 2 — Game Management).
 * id passed separately from update fields. RLS scopes to casino.
 */
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
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      if (ctx.rlsContext?.staffRole !== 'admin') {
        return forbidden(ctx.correlationId, ctx.startedAt);
      }

      const id = updateGameSettingsIdSchema.parse(input.id);
      const { id: _, ...updateFields } = input;
      const validated = updateGameSettingsSchema.parse(updateFields);

      // Reject no-op updates (at least one mutable field required)
      if (Object.keys(validated).length === 0) {
        return {
          ok: false,
          code: 'VALIDATION_ERROR',
          error: 'At least one field must be provided for update',
          requestId: ctx.correlationId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      try {
        const result = await updateGameSettings(ctx.supabase, id, validated);

        return {
          ok: true,
          code: 'OK' as const,
          data: result,
          requestId: ctx.correlationId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        if (err instanceof DomainError) {
          return mapDomainError(err, ctx.correlationId, ctx.startedAt);
        }
        throw err;
      }
    },
    { domain: 'casino', action: 'update-game-settings' },
  );
}

// ---------------------------------------------------------------------------
// 8. deleteGameSettingsAction
// ---------------------------------------------------------------------------

const deleteGameSettingsIdSchema = z.object({
  id: z.string().uuid('Invalid game settings ID'),
});

/**
 * Delete a game setting (Step 2 — Game Management).
 * Hard delete — cascades to side bets. RLS scopes to casino.
 */
export async function deleteGameSettingsAction(input: {
  id: string;
}): Promise<ServiceResult<{ deleted: true }>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (ctx) => {
      if (ctx.rlsContext?.staffRole !== 'admin') {
        return forbidden(ctx.correlationId, ctx.startedAt);
      }

      const validated = deleteGameSettingsIdSchema.parse(input);

      try {
        await deleteGameSettings(ctx.supabase, validated.id);

        return {
          ok: true,
          code: 'OK' as const,
          data: { deleted: true as const },
          requestId: ctx.correlationId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        if (err instanceof DomainError) {
          return mapDomainError(err, ctx.correlationId, ctx.startedAt);
        }
        throw err;
      }
    },
    { domain: 'casino', action: 'delete-game-settings' },
  );
}

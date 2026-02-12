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

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
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

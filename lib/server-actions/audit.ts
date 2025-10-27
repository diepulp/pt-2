import type { SupabaseClient } from '@supabase/supabase-js';

import type { ServiceResult } from '@/lib/http/service-response';
import type { Database, Json } from '@/types/database.types';

import type { ServerActionContext } from './types';

function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value as Json;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJson(item)) as Json;
  }

  if (typeof value === 'object') {
    const result: Record<string, Json> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = toJson(val);
    }
    return result;
  }

  return String(value);
}

export async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  context: ServerActionContext,
  result: ServiceResult<unknown>,
): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const details: Json = toJson({
    action: context.action,
    entity: context.entity ?? null,
    idempotencyKey: context.idempotencyKey ?? null,
    requestId: result.requestId,
    durationMs: result.durationMs,
    ok: result.ok,
    code: result.code,
    error: result.error ?? null,
    metadata: context.metadata ?? {},
  });

  const payload = {
    casino_id: context.casinoId ?? null,
    domain: context.entity ?? context.action,
    actor_id: context.userId ?? null,
    action: context.action,
    details,
  } satisfies Database['public']['Tables']['audit_log']['Insert'];

  const { error } = await supabase.from('audit_log').insert(payload);
  if (error) {
    console.error('[audit] Failed to write audit log', error);
  }
}

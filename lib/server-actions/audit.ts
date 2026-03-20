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

/**
 * Write audit log via append_audit_log RPC
 *
 * Uses SECURITY DEFINER RPC that derives casino_id/actor_id from
 * session vars set by set_rls_context_from_staff(). Direct INSERT
 * on audit_log is revoked from authenticated (SEC-007 P0 hardening).
 */
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

  const { error } = await supabase.rpc('append_audit_log', {
    p_domain: context.entity ?? context.action,
    p_action: context.action,
    p_details: details,
  });
  if (error) {
    console.error('[audit] Failed to write audit log', error);
  }
}

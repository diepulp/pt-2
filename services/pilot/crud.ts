import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { Database } from '@/types/database.types';

import type {
  AllowlistGateResult,
  CreatePilotAccessRequestInput,
  PilotAccessRequestDTO,
} from './dtos';
import { mapToPilotAccessRequestDTO } from './mappers';

// Defense-in-depth email normalization. DB CHECK constraint is authoritative (DEC-7).
export function canonicalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Server-only allowlist gate read. Caller MUST pass a service-role client — this
// table has no SELECT policy for anon or authenticated roles (all checks are
// server-side only per RULE-1). Returns only the binary gate result; never
// exposes row details to callers. Fail closed on any error (missing, revoked,
// or query failure → 'not_approved').
export async function checkAllowlistGate(
  serviceClient: SupabaseClient<Database>,
  email: string,
): Promise<AllowlistGateResult> {
  const canonical = canonicalizeEmail(email);

  try {
    const { data, error } = await serviceClient
      .from('approved_email_allowlist')
      .select('status')
      .eq('email', canonical)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      return 'not_approved';
    }

    return data ? 'approved' : 'not_approved';
  } catch {
    return 'not_approved';
  }
}

// Insert a pending pilot access request. The pilot_access_requests table
// allows anon INSERT (RLS policy). Uses a partial unique index on (email)
// WHERE status='pending' to enforce duplicate safety at the DB layer.
// On 23505 unique violation → treat as safe duplicate and return success.
// Returns the canonical row shape for callers that need it (admin service).
export async function submitAccessRequest(
  client: SupabaseClient<Database>,
  input: CreatePilotAccessRequestInput,
): Promise<void> {
  const canonical = canonicalizeEmail(input.email);

  const { error } = await client.from('pilot_access_requests').insert({
    email: canonical,
    name: input.name.trim(),
    casino_name: input.casino_name.trim(),
    role: input.role.trim(),
    estimated_table_count: input.estimated_table_count ?? null,
    message: input.message?.trim() ?? null,
  });

  if (error) {
    // 23505 = unique_violation on pilot_access_requests_pending_email_unique
    // A pending request already exists for this email. Safe response: treat as success.
    if (error.code === '23505') return;

    throw new DomainError(
      'INTERNAL_ERROR',
      'Access request submission failed',
      {
        details: safeErrorDetails(error),
      },
    );
  }
}

// Fetch all pending pilot access requests. Caller MUST pass a service-role client.
// Used by the admin review surface (WS8).
export async function listPendingRequests(
  serviceClient: SupabaseClient<Database>,
): Promise<PilotAccessRequestDTO[]> {
  const { data, error } = await serviceClient
    .from('pilot_access_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'Failed to fetch pending requests',
      {
        details: safeErrorDetails(error),
      },
    );
  }

  return (data ?? []).map(mapToPilotAccessRequestDTO);
}

// scripts/outbox-proof/helpers.ts
// PRD-082 Integration Proof Harness — Shared utilities

import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';

dotenv.config({ path: '.env.local' });

export { PROOF } from './seed';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export async function createAuthenticatedClient(): Promise<
  SupabaseClient<Database>
> {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const { PROOF } = await import('./seed');

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({
    email: PROOF.STAFF_EMAIL,
    password: PROOF.STAFF_PASSWORD,
  });

  if (error) throw new Error(`Auth sign-in failed: ${error.message}`);
  return client;
}

export function createServiceClient(): SupabaseClient<Database> {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function runRelayBatch(
  serviceClient: SupabaseClient<Database>,
  batchSize = 50,
): Promise<{ processed: number; duplicate: number; failed: number }> {
  const { data: batch, error: claimErr } = await serviceClient.rpc(
    'rpc_claim_outbox_batch',
    { p_batch_size: batchSize },
  );

  if (claimErr)
    throw new Error(`rpc_claim_outbox_batch failed: ${claimErr.message}`);

  const rows = (batch ??
    []) as Database['public']['Tables']['finance_outbox']['Row'][];
  let processed = 0;
  let duplicate = 0;
  let failed = 0;

  for (const row of rows) {
    const { data: result, error: receiptErr } = await serviceClient.rpc(
      'rpc_commit_consumer_receipt',
      { p_message_id: row.event_id, p_casino_id: row.casino_id },
    );

    if (receiptErr) {
      failed++;
      continue;
    }

    if (result === 'processed') processed++;
    else if (result === 'duplicate') duplicate++;

    if (result === 'processed' || result === 'duplicate') {
      await serviceClient
        .from('finance_outbox')
        .update({ processed_at: new Date().toISOString() })
        .eq('event_id', row.event_id);
    }
  }

  return { processed, duplicate, failed };
}

export function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

export function printResult(
  label: string,
  pass: boolean,
  detail?: string,
): void {
  const status = pass ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${label}${detail ? `: ${detail}` : ''}`);
}

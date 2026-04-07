import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type { InsertSendAttemptInput, EmailSendAttemptDto } from './dtos';
import { mapSendAttemptRow } from './mappers';

/** Insert a send attempt row */
export async function insertSendAttempt(
  supabase: SupabaseClient<Database>,
  input: InsertSendAttemptInput,
): Promise<EmailSendAttemptDto> {
  const { data, error } = await supabase
    .from('email_send_attempt')
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return mapSendAttemptRow(data);
}

/** Get send attempts for a casino, ordered by most recent */
export async function getSendAttemptsByCasino(
  supabase: SupabaseClient<Database>,
): Promise<EmailSendAttemptDto[]> {
  const { data, error } = await supabase
    .from('email_send_attempt')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapSendAttemptRow);
}

/** Get failed attempts that are still actionable (latest in chain is 'failed') */
export async function getFailedAttempts(
  supabase: SupabaseClient<Database>,
): Promise<EmailSendAttemptDto[]> {
  const { data, error } = await supabase
    .from('email_send_attempt')
    .select()
    .eq('status', 'failed')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapSendAttemptRow);
}

/** Get a single attempt by ID */
export async function getSendAttemptById(
  supabase: SupabaseClient<Database>,
  attemptId: string,
): Promise<EmailSendAttemptDto | null> {
  const { data, error } = await supabase
    .from('email_send_attempt')
    .select()
    .eq('id', attemptId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return mapSendAttemptRow(data);
}

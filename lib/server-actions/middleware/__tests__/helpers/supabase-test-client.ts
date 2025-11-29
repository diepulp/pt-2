import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

/**
 * Get test Supabase client connected to local instance
 *
 * Requires local Supabase to be running: `npx supabase start`
 */
export function getTestSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const supabaseKey =
    process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

  return createClient<Database>(supabaseUrl, supabaseKey);
}

/**
 * Get test Supabase client with service role (bypasses RLS)
 */
export function getTestSupabaseServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  return createClient<Database>(supabaseUrl, serviceKey);
}

/**
 * Test data setup helpers
 */
export const testData = {
  casino: {
    id: 'test-casino-uuid',
    name: 'Test Casino',
  },
  staff: {
    id: 'test-staff-uuid',
    user_id: 'test-user-uuid',
    casino_id: 'test-casino-uuid',
    role: 'admin',
    status: 'active',
  },
};

/**
 * Setup test data in local Supabase
 */
export async function setupTestData() {
  const supabase = getTestSupabaseServiceClient();

  // Insert test casino
  await supabase.from('casinos').upsert({
    id: testData.casino.id,
    name: testData.casino.name,
  });

  // Insert test staff
  await supabase.from('staff').upsert({
    id: testData.staff.id,
    user_id: testData.staff.user_id,
    casino_id: testData.staff.casino_id,
    role: testData.staff.role,
    status: testData.staff.status,
  });
}

/**
 * Cleanup test data from local Supabase
 */
export async function cleanupTestData() {
  const supabase = getTestSupabaseServiceClient();

  // Clean up in reverse dependency order
  await supabase.from('audit_log').delete().eq('casino_id', testData.casino.id);
  await supabase.from('staff').delete().eq('id', testData.staff.id);
  await supabase.from('casinos').delete().eq('id', testData.casino.id);
}

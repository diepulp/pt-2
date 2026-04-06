// eslint-disable-next-line no-restricted-imports -- Integration test helpers require direct Supabase client
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
 * Return shape for getTestAuthenticatedClient.
 * Callers must invoke cleanup() in afterAll to remove test fixtures.
 */
export interface TestAuthenticatedClientResult {
  client: SupabaseClient<Database>;
  staffId: string;
  casinoId: string;
  companyId: string;
  userId: string;
  email: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a Mode C authenticated anon client for integration tests (ADR-024).
 *
 * Two-phase setup:
 *   1. Create auth user (email_confirm: true)
 *   2. Create company → casino → casino_settings → staff fixtures
 *   3. Stamp staff_id + casino_id into app_metadata
 *   4. Sign in via throwaway client to obtain JWT
 *   5. Return authenticated anon client carrying JWT in Authorization header
 *
 * The returned cleanup() deletes the auth user; cascading deletes handle
 * staff rows. Company/casino/casino_settings are deleted explicitly.
 *
 * Requires local Supabase to be running with NEXT_PUBLIC_SUPABASE_ANON_KEY set.
 */
export async function getTestAuthenticatedClient(options?: {
  role?: string;
  emailPrefix?: string;
}): Promise<TestAuthenticatedClientResult> {
  const role = options?.role ?? 'pit_boss';
  const prefix = options?.emailPrefix ?? 'test-mw-t3';

  const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  const serviceClient = createClient<Database>(supabaseUrl, serviceKey);

  const email = `${prefix}-${role}-${Date.now()}@example.com`;
  const password = 'test-password-12345';

  // Phase 1: Create auth user (without staff_id — two-phase ADR-024 setup)
  const { data: authUserData, error: authError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { staff_role: role },
    });
  if (authError || !authUserData?.user) {
    throw authError ?? new Error('Failed to create test auth user');
  }
  const userId = authUserData.user.id;

  // Phase 2: Create fixtures (company → casino → casino_settings → staff)
  const { data: company, error: companyError } = await serviceClient
    .from('company')
    .insert({ name: `MW T3 Test Company ${Date.now()}` })
    .select()
    .single();
  if (companyError || !company) {
    await serviceClient.auth.admin.deleteUser(userId);
    throw companyError ?? new Error('Failed to create test company');
  }

  const { data: casino, error: casinoError } = await serviceClient
    .from('casino')
    .insert({
      name: `MW T3 Test Casino ${Date.now()}`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();
  if (casinoError || !casino) {
    await serviceClient.from('company').delete().eq('id', company.id);
    await serviceClient.auth.admin.deleteUser(userId);
    throw casinoError ?? new Error('Failed to create test casino');
  }

  const { error: settingsError } = await serviceClient
    .from('casino_settings')
    .insert({
      casino_id: casino.id,
      gaming_day_start_time: '06:00:00',
      timezone: 'America/Los_Angeles',
      watchlist_floor: 3000,
      ctr_threshold: 10000,
    });
  if (settingsError) {
    await serviceClient.from('casino').delete().eq('id', casino.id);
    await serviceClient.from('company').delete().eq('id', company.id);
    await serviceClient.auth.admin.deleteUser(userId);
    throw settingsError;
  }

  const { data: staff, error: staffError } = await serviceClient
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: userId,
      employee_id: `MW-T3-${Date.now()}`,
      first_name: 'Test',
      last_name: 'Middleware',
      role: role,
      status: 'active',
    })
    .select()
    .single();
  if (staffError || !staff) {
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casino.id);
    await serviceClient.from('casino').delete().eq('id', casino.id);
    await serviceClient.from('company').delete().eq('id', company.id);
    await serviceClient.auth.admin.deleteUser(userId);
    throw staffError ?? new Error('Failed to create test staff');
  }

  // Phase 3: Stamp staff_id into app_metadata (ADR-024 two-phase)
  const { error: stampError } = await serviceClient.auth.admin.updateUserById(
    userId,
    {
      app_metadata: {
        staff_id: staff.id,
        casino_id: casino.id,
        staff_role: role,
      },
    },
  );
  if (stampError) {
    await serviceClient.from('staff').delete().eq('id', staff.id);
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casino.id);
    await serviceClient.from('casino').delete().eq('id', casino.id);
    await serviceClient.from('company').delete().eq('id', company.id);
    await serviceClient.auth.admin.deleteUser(userId);
    throw stampError;
  }

  // Phase 4: Sign in via throwaway client to get JWT with stamped claims
  const throwaway = createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessionData, error: signInError } =
    await throwaway.auth.signInWithPassword({ email, password });
  if (signInError || !sessionData.session) {
    await serviceClient.from('staff').delete().eq('id', staff.id);
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casino.id);
    await serviceClient.from('casino').delete().eq('id', casino.id);
    await serviceClient.from('company').delete().eq('id', company.id);
    await serviceClient.auth.admin.deleteUser(userId);
    throw signInError ?? new Error('Sign-in returned no session');
  }

  // Phase 5: Create Mode C authenticated anon client (ADR-024)
  const client = createClient<Database>(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Cleanup removes auth user (cascades to staff); company/casino must be deleted explicitly
  const cleanup = async () => {
    await serviceClient.from('staff').delete().eq('id', staff.id);
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casino.id);
    await serviceClient.from('casino').delete().eq('id', casino.id);
    await serviceClient.from('company').delete().eq('id', company.id);
    await serviceClient.auth.admin.deleteUser(userId);
  };

  return {
    client,
    staffId: staff.id,
    casinoId: casino.id,
    companyId: company.id,
    userId,
    email,
    cleanup,
  };
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

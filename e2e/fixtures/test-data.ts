/**
 * E2E Test Data Fixtures
 *
 * Provides utilities for creating and cleaning up test data in Supabase.
 * Uses service role client to bypass RLS for test setup/teardown.
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
  );
}

/**
 * Creates a service role client for test data setup/teardown
 * WARNING: Bypasses RLS - use only in tests
 */
export function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Test data structure for a complete rating slip scenario
 */
export interface TestScenario {
  casinoId: string;
  staffId: string;
  staffUserId: string;
  playerId: string;
  tableId: string;
  visitId: string;
  authToken: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a complete test scenario with casino, staff, player, table, and visit
 */
export async function createTestScenario(): Promise<TestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_${timestamp}`;

  // Create test casino
  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({
      name: `${testPrefix}_casino`,
      status: 'active',
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create test casino: ${casinoError?.message}`);
  }

  // Create test auth user
  const testEmail = `${testPrefix}_staff@test.com`;
  const testPassword = 'TestPassword123!';

  const { data: authData, error: authCreateError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

  if (authCreateError || !authData.user) {
    throw new Error(
      `Failed to create test auth user: ${authCreateError?.message}`,
    );
  }

  // Create test staff user (linked to auth user)
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: `${testPrefix}`,
      last_name: 'Staff',
      email: testEmail,
      role: 'admin',
      status: 'active',
    })
    .select()
    .single();

  if (staffError || !staff) {
    throw new Error(`Failed to create test staff: ${staffError?.message}`);
  }

  // Sign in to get auth token
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  // Create test player
  const { data: player, error: playerError } = await supabase
    .from('player')
    .insert({
      casino_id: casino.id,
      first_name: `${testPrefix}_player_first`,
      last_name: `${testPrefix}_player_last`,
      external_id: `${testPrefix}_player_ext`,
    })
    .select()
    .single();

  if (playerError || !player) {
    throw new Error(`Failed to create test player: ${playerError?.message}`);
  }

  // Create test table
  const { data: table, error: tableError } = await supabase
    .from('gaming_table')
    .insert({
      casino_id: casino.id,
      label: `${testPrefix}_table`,
      type: 'blackjack',
      status: 'inactive',
    })
    .select()
    .single();

  if (tableError || !table) {
    throw new Error(`Failed to create test table: ${tableError?.message}`);
  }

  // Create test visit
  const { data: visit, error: visitError } = await supabase
    .from('visit')
    .insert({
      casino_id: casino.id,
      player_id: player.id,
      visit_start_utc: new Date().toISOString(),
      status: 'active',
    })
    .select()
    .single();

  if (visitError || !visit) {
    throw new Error(`Failed to create test visit: ${visitError?.message}`);
  }

  // Cleanup function to remove all test data
  const cleanup = async () => {
    // Delete in reverse dependency order
    await supabase.from('rating_slip').delete().eq('casino_id', casino.id);
    await supabase.from('visit').delete().eq('id', visit.id);
    await supabase.from('gaming_table').delete().eq('id', table.id);
    await supabase.from('player').delete().eq('id', player.id);
    await supabase.from('staff').delete().eq('id', staff.id);
    await supabase.from('casino').delete().eq('id', casino.id);
    // Delete auth user
    await supabase.auth.admin.deleteUser(authData.user.id);
  };

  return {
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    playerId: player.id,
    tableId: table.id,
    visitId: visit.id,
    authToken: signInData.session.access_token,
    cleanup,
  };
}

/**
 * Player Exclusion E2E Fixtures
 *
 * Provides scenario factories for exclusion compliance panel tests (Mode B)
 * and auto-close verification tests (Mode C).
 *
 * Follows admin-helpers.ts pattern: role-parameterized, ADR-043 company-first,
 * ADR-024 app_metadata stamping with staff_id.
 *
 * @see QA-006 §3 — Fixture factory requirements
 * @see e2e/fixtures/admin-helpers.ts — Base pattern
 */

import { randomUUID } from 'crypto';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ExclusionPanelScenario {
  casinoId: string;
  staffId: string;
  staffUserId: string;
  playerId: string;
  testEmail: string;
  testPassword: string;
  staffRole: string;
  authToken: string;
  cleanup: () => Promise<void>;
}

export interface ExclusionEnforcementScenario extends ExclusionPanelScenario {
  tableId: string;
  visitId: string;
  slipId: string;
}

// ---------------------------------------------------------------------------
// Panel Scenario — for Mode B compliance panel tests
// ---------------------------------------------------------------------------

/**
 * Creates company → casino → auth user (role) → staff → player → player_casino.
 * Returns credentials for Mode B browser login and Mode C authenticated client.
 *
 * No gaming table, visit, or slip — minimal fixture per QA-006 §3.
 */
export async function createExclusionPanelScenario(
  role: 'admin' | 'pit_boss' | 'dealer',
): Promise<ExclusionPanelScenario> {
  const supabase = createServiceClient();
  const uniqueId = randomUUID().slice(0, 8);
  const testPrefix = `e2e_excl_${role}_${uniqueId}`;

  // ADR-043: company before casino
  const { data: company, error: companyError } = await supabase
    .from('company')
    .insert({ name: `${testPrefix}_company` })
    .select()
    .single();
  if (companyError || !company) {
    throw new Error(`Failed to create company: ${companyError?.message}`);
  }

  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({
      name: `${testPrefix}_casino`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();
  if (casinoError || !casino) {
    throw new Error(`Failed to create casino: ${casinoError?.message}`);
  }

  // Casino settings required for gaming_day trigger on visit insert
  const { error: settingsError } = await supabase
    .from('casino_settings')
    .insert({
      casino_id: casino.id,
      gaming_day_start_time: '06:00:00',
      timezone: 'America/Los_Angeles',
    });
  if (settingsError) {
    throw new Error(
      `Failed to create casino settings: ${settingsError.message}`,
    );
  }

  const testEmail = `${testPrefix}@test.com`;
  const testPassword = 'TestPassword123!';

  // Phase 1: create auth user with casino_id + staff_role
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: { casino_id: casino.id, staff_role: role },
    });
  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user: ${authError?.message}`);
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: 'Test',
      last_name: role,
      email: testEmail,
      role,
      status: 'active',
    })
    .select()
    .single();
  if (staffError || !staff) {
    throw new Error(`Failed to create staff: ${staffError?.message}`);
  }

  // Phase 2: stamp staff_id into app_metadata (ADR-024)
  await supabase.auth.admin.updateUserById(authData.user.id, {
    app_metadata: {
      casino_id: casino.id,
      staff_id: staff.id,
      staff_role: role,
    },
  });

  // Create player (global) + link to casino
  const { data: player, error: playerError } = await supabase
    .from('player')
    .insert({
      first_name: `${testPrefix}_player`,
      last_name: 'Exclusion',
    })
    .select()
    .single();
  if (playerError || !player) {
    throw new Error(`Failed to create player: ${playerError?.message}`);
  }

  const { error: linkError } = await supabase
    .from('player_casino')
    .insert({ player_id: player.id, casino_id: casino.id, status: 'active' });
  if (linkError) {
    throw new Error(`Failed to link player to casino: ${linkError.message}`);
  }

  // Sign in for auth token (Mode C fallback)
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in: ${signInError?.message}`);
  }

  const cleanup = async () => {
    const c = createServiceClient();
    // Reverse FK order — exclusions first (may be created during test)
    await c.from('player_exclusion').delete().eq('casino_id', casino.id);
    await c.from('player_casino').delete().eq('player_id', player.id);
    await c.from('player').delete().eq('id', player.id);
    await c.from('staff').delete().eq('id', staff.id);
    await c.from('casino_settings').delete().eq('casino_id', casino.id);
    await c.from('casino').delete().eq('id', casino.id);
    await c.from('company').delete().eq('id', company.id);
    await c.auth.admin.deleteUser(authData.user.id);
  };

  return {
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    playerId: player.id,
    testEmail,
    testPassword,
    staffRole: role,
    authToken: signInData.session.access_token,
    cleanup,
  };
}

// ---------------------------------------------------------------------------
// Enforcement Scenario — for Mode C auto-close tests
// ---------------------------------------------------------------------------

/**
 * Extends panel scenario with gaming_table + visit + open rating_slip.
 * Used for Mode C verification: create hard_block → verify auto-close.
 *
 * Always creates admin role (needs permission to create exclusions via RPC).
 */
export async function createExclusionWithActiveSlip(): Promise<ExclusionEnforcementScenario> {
  const base = await createExclusionPanelScenario('admin');
  const supabase = createServiceClient();

  // Gaming table
  const { data: table, error: tableError } = await supabase
    .from('gaming_table')
    .insert({
      casino_id: base.casinoId,
      label: `e2e_excl_table_${randomUUID().slice(0, 8)}`,
      type: 'blackjack',
      status: 'active',
    })
    .select()
    .single();
  if (tableError || !table) {
    throw new Error(`Failed to create gaming table: ${tableError?.message}`);
  }

  // Visit (gaming_day overwritten by trigger)
  const visitId = randomUUID();
  const { data: visit, error: visitError } = await supabase
    .from('visit')
    .insert({
      id: visitId,
      casino_id: base.casinoId,
      player_id: base.playerId,
      started_at: new Date().toISOString(),
      visit_kind: 'gaming_identified_rated',
      visit_group_id: visitId,
      gaming_day: '1970-01-01',
    })
    .select()
    .single();
  if (visitError || !visit) {
    throw new Error(`Failed to create visit: ${visitError?.message}`);
  }

  // Open rating slip at seat 1
  const { data: slip, error: slipError } = await supabase
    .from('rating_slip')
    .insert({
      casino_id: base.casinoId,
      visit_id: visit.id,
      table_id: table.id,
      seat_number: '1',
      status: 'open',
      average_bet: 2500,
      accrual_kind: 'compliance_only',
    })
    .select()
    .single();
  if (slipError || !slip) {
    throw new Error(`Failed to create rating slip: ${slipError?.message}`);
  }

  // Extend cleanup to cover new entities
  const originalCleanup = base.cleanup;
  const cleanup = async () => {
    const c = createServiceClient();
    await c.from('audit_log').delete().eq('casino_id', base.casinoId);
    await c.from('rating_slip').delete().eq('id', slip.id);
    await c.from('visit').delete().eq('id', visit.id);
    await c.from('gaming_table').delete().eq('id', table.id);
    await originalCleanup();
  };

  return {
    ...base,
    tableId: table.id,
    visitId: visit.id,
    slipId: slip.id,
    cleanup,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seeds an exclusion via service-role direct insert (bypasses RLS).
 * Use for pre-populating exclusions in role-gating tests where the
 * test user may not have permission to create exclusions via RPC.
 */
export async function seedExclusion(
  casinoId: string,
  playerId: string,
  staffId: string,
  enforcement: 'hard_block' | 'soft_alert' | 'monitor' = 'hard_block',
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('player_exclusion')
    .insert({
      casino_id: casinoId,
      player_id: playerId,
      exclusion_type: 'internal_ban',
      enforcement,
      reason: `E2E seed exclusion (${enforcement})`,
      effective_from: new Date().toISOString().slice(0, 10),
      created_by: staffId,
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Failed to seed exclusion: ${error?.message}`);
  }
  return data.id;
}

/**
 * Creates an authenticated Supabase client with a real JWT (Mode C).
 * Used for RPC calls in system verification tests.
 */
export function createAuthenticatedClient(authToken: string) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${authToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Browser login via /auth/login form (Mode B).
 * Replicates admin-helpers.ts authenticateAdmin pattern.
 */
export async function authenticateAndNavigate(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  targetUrl: string,
): Promise<void> {
  await page.goto('/auth/login', { waitUntil: 'networkidle' });
  await page
    .locator('button[type="submit"]:has-text("Login")')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes('/auth/v1/token') && resp.status() === 200,
    ),
    page.locator('button[type="submit"]').click(),
  ]);
  // Hard navigate to target (avoids RSC stream interruption)
  await page.goto(targetUrl, {
    waitUntil: 'load',
    timeout: 30_000,
  });
  if (page.url().includes('/auth/login')) {
    throw new Error('Authentication failed: redirected back to login');
  }
  // Wait for React hydration — scripts must finish executing before events work
  await page.waitForFunction(() => document.readyState === 'complete', {
    timeout: 15_000,
  });
}

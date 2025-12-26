/**
 * Rating Slip Modal E2E Test Fixtures
 *
 * Extended fixtures for testing the rating slip modal workflows (PRD-008).
 * Builds on the base test-data.ts with rating slip specific data.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see e2e/workflows/rating-slip-modal.spec.ts
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

/**
 * Creates a service role client for test data setup/teardown
 * WARNING: Bypasses RLS - use only in tests
 */
function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Extended test scenario with rating slip data for modal testing
 */
export interface RatingSlipTestScenario {
  // Base entities
  casinoId: string;
  staffId: string;
  staffUserId: string;
  playerId: string;
  tableId: string;
  visitId: string;
  authToken: string;

  // Rating slip specific
  ratingSlipId: string;
  seatNumber: string;

  // Secondary table for move tests
  secondaryTableId: string;

  // Test credentials for browser auth
  testEmail: string;
  testPassword: string;

  // Cleanup function
  cleanup: () => Promise<void>;
}

/**
 * Creates a complete test scenario for rating slip modal testing.
 *
 * Includes:
 * - Casino with gaming day settings
 * - Staff user with admin role
 * - Player with loyalty account
 * - Primary table (active)
 * - Secondary table (active, for move tests)
 * - Active visit
 * - Open rating slip at seat 1
 */
export async function createRatingSlipTestScenario(): Promise<RatingSlipTestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_modal_${timestamp}`;

  // Create test casino
  const { data: casino, error: casinoError } = await supabase
    .from("casino")
    .insert({
      name: `${testPrefix}_casino`,
      status: "active",
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create test casino: ${casinoError?.message}`);
  }

  // Create casino settings for gaming day
  const { error: settingsError } = await supabase
    .from("casino_settings")
    .insert({
      casino_id: casino.id,
      gaming_day_start_time: "06:00:00",
      timezone: "America/Los_Angeles",
    });

  if (settingsError) {
    throw new Error(
      `Failed to create casino settings: ${settingsError.message}`,
    );
  }

  // Create test auth user
  const testEmail = `${testPrefix}_staff@test.com`;
  const testPassword = "TestPassword123!";

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

  // Create test staff user (admin role for full access)
  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: "Test",
      last_name: "PitBoss",
      email: testEmail,
      role: "admin",
      status: "active",
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

  // Create test player (global entity, no casino_id)
  const { data: player, error: playerError } = await supabase
    .from("player")
    .insert({
      first_name: "John",
      last_name: "TestPlayer",
    })
    .select()
    .single();

  if (playerError || !player) {
    throw new Error(`Failed to create test player: ${playerError?.message}`);
  }

  // Link player to casino via player_casino junction table
  const { error: playerCasinoError } = await supabase
    .from("player_casino")
    .insert({
      player_id: player.id,
      casino_id: casino.id,
      status: "active",
    });

  if (playerCasinoError) {
    throw new Error(
      `Failed to link player to casino: ${playerCasinoError.message}`,
    );
  }

  // Create player loyalty account
  const { error: loyaltyError } = await supabase.from("player_loyalty").insert({
    player_id: player.id,
    casino_id: casino.id,
    current_balance: 500, // Start with some points
    tier: "gold",
  });

  if (loyaltyError) {
    // Loyalty table may not exist yet, non-blocking for basic tests
    console.warn(`Could not create loyalty account: ${loyaltyError.message}`);
  }

  // Create primary test table (active)
  const { data: table, error: tableError } = await supabase
    .from("gaming_table")
    .insert({
      casino_id: casino.id,
      label: "BJ-01",
      type: "blackjack",
      status: "active",
      min_bet: 1000, // $10.00 in cents
      max_bet: 50000, // $500.00 in cents
    })
    .select()
    .single();

  if (tableError || !table) {
    throw new Error(`Failed to create test table: ${tableError?.message}`);
  }

  // Create secondary table (active, for move tests)
  const { data: secondaryTable, error: secondaryTableError } = await supabase
    .from("gaming_table")
    .insert({
      casino_id: casino.id,
      label: "BJ-02",
      type: "blackjack",
      status: "active",
      min_bet: 2500, // $25.00 in cents
      max_bet: 100000, // $1000.00 in cents
    })
    .select()
    .single();

  if (secondaryTableError || !secondaryTable) {
    throw new Error(
      `Failed to create secondary table: ${secondaryTableError?.message}`,
    );
  }

  // Create test visit (active)
  const visitId = crypto.randomUUID();
  const { data: visit, error: visitError } = await supabase
    .from("visit")
    .insert({
      id: visitId,
      casino_id: casino.id,
      player_id: player.id,
      started_at: new Date().toISOString(),
      visit_kind: "gaming_identified_rated",
      visit_group_id: visitId, // Self-reference for new visit group
    })
    .select()
    .single();

  if (visitError || !visit) {
    throw new Error(`Failed to create test visit: ${visitError?.message}`);
  }

  // Create rating slip (open status, at seat 1)
  const seatNumber = "1";
  const { data: ratingSlip, error: slipError } = await supabase
    .from("rating_slip")
    .insert({
      casino_id: casino.id,
      visit_id: visit.id,
      table_id: table.id,
      seat_number: seatNumber,
      average_bet: 2500, // $25.00 in cents
      status: "open",
      start_time: new Date().toISOString(),
    })
    .select()
    .single();

  if (slipError || !ratingSlip) {
    throw new Error(`Failed to create test rating slip: ${slipError?.message}`);
  }

  // Cleanup function to remove all test data
  const cleanup = async () => {
    const cleanupClient = createServiceClient();

    // Delete in reverse dependency order
    await cleanupClient
      .from("rating_slip_pause")
      .delete()
      .eq("slip_id", ratingSlip.id);
    await cleanupClient.from("rating_slip").delete().eq("casino_id", casino.id);
    await cleanupClient
      .from("player_financial_transaction")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient
      .from("loyalty_ledger")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient
      .from("player_loyalty")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient.from("visit").delete().eq("id", visit.id);
    await cleanupClient
      .from("gaming_table")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient
      .from("player_casino")
      .delete()
      .eq("player_id", player.id);
    await cleanupClient.from("player").delete().eq("id", player.id);
    await cleanupClient.from("staff").delete().eq("id", staff.id);
    await cleanupClient
      .from("casino_settings")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient.from("casino").delete().eq("id", casino.id);

    // Delete auth user
    await cleanupClient.auth.admin.deleteUser(authData.user.id);
  };

  return {
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    playerId: player.id,
    tableId: table.id,
    visitId: visit.id,
    authToken: signInData.session.access_token,
    ratingSlipId: ratingSlip.id,
    seatNumber,
    secondaryTableId: secondaryTable.id,
    testEmail,
    testPassword,
    cleanup,
  };
}

/**
 * Creates a financial transaction for testing financial summary display.
 */
export async function createTestTransaction(
  casinoId: string,
  visitId: string,
  playerId: string,
  staffId: string,
  direction: "in" | "out",
  amount: number, // in cents
  tenderType: "cash" | "chips" | "marker" = "cash",
) {
  const supabase = createServiceClient();
  const timestamp = Date.now();

  const { data, error } = await supabase
    .from("player_financial_transaction")
    .insert({
      casino_id: casinoId,
      visit_id: visitId,
      player_id: playerId,
      staff_id: staffId,
      direction,
      amount,
      tender_type: tenderType,
      source: "pit",
      idempotency_key: `e2e_txn_${timestamp}`,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test transaction: ${error.message}`);
  }

  return data;
}

/**
 * Gets the current status of a rating slip.
 */
export async function getRatingSlipStatus(slipId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("rating_slip")
    .select("id, status, average_bet, seat_number, table_id, visit_id")
    .eq("id", slipId)
    .single();

  if (error) {
    throw new Error(`Failed to get rating slip: ${error.message}`);
  }

  return data;
}

/**
 * Gets all rating slips for a visit (for move tests).
 */
export async function getRatingSlipsForVisit(visitId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("rating_slip")
    .select("id, status, average_bet, seat_number, table_id, visit_id")
    .eq("visit_id", visitId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get rating slips: ${error.message}`);
  }

  return data;
}

/**
 * Gets financial transactions for a visit (for verification).
 */
export async function getTransactionsForVisit(visitId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("player_financial_transaction")
    .select("id, direction, amount, tender_type, source")
    .eq("visit_id", visitId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get transactions: ${error.message}`);
  }

  return data;
}

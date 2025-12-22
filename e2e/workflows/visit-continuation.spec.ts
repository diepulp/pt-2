/**
 * Visit Continuation (Start From Previous) E2E Tests
 *
 * Tests PRD-017 functionality:
 * 1. Recent sessions API - paginated closed sessions with aggregates
 * 2. Start from previous - continue from closed session at new table/seat
 * 3. visit_group_id - session continuity tracking
 * 4. Constraint enforcement - max 1 open visit per player
 *
 * @see PRD-017 Start From Previous Session
 * @see EXECUTION-SPEC-PRD-017.md
 */

import { test, expect } from "@playwright/test";
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

// Extended test scenario for visit continuation tests
interface VisitContinuationScenario {
  casinoId: string;
  staffId: string;
  staffUserId: string;
  playerId: string;
  tableId: string;
  secondaryTableId: string;
  visitId: string;
  closedVisitId: string;
  closedVisitGroupId: string;
  authToken: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a complete test scenario with a closed visit for continuation testing.
 * Uses the correct schema with player_casino junction table.
 */
async function createVisitContinuationScenario(): Promise<VisitContinuationScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_cont_${timestamp}`;

  // 1. Create test casino
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

  // 2. Create casino settings
  await supabase.from("casino_settings").insert({
    casino_id: casino.id,
    gaming_day_start_time: "06:00:00",
    timezone: "America/Los_Angeles",
  });

  // 3. Create test auth user
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

  // 4. Create test staff user
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

  // 5. Sign in to get auth token
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  // 6. Create test player (player table doesn't have casino_id)
  const { data: player, error: playerError } = await supabase
    .from("player")
    .insert({
      first_name: "Test",
      last_name: "ContinuationPlayer",
    })
    .select()
    .single();

  if (playerError || !player) {
    throw new Error(`Failed to create test player: ${playerError?.message}`);
  }

  // 7. Link player to casino via player_casino junction table
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

  // 8. Create primary test table (active)
  const { data: table, error: tableError } = await supabase
    .from("gaming_table")
    .insert({
      casino_id: casino.id,
      label: `${testPrefix}_BJ01`,
      type: "blackjack",
      status: "active",
      min_bet: 1000,
      max_bet: 50000,
    })
    .select()
    .single();

  if (tableError || !table) {
    throw new Error(`Failed to create test table: ${tableError?.message}`);
  }

  // 9. Create secondary table (for continuation destination)
  const { data: secondaryTable, error: secondaryTableError } = await supabase
    .from("gaming_table")
    .insert({
      casino_id: casino.id,
      label: `${testPrefix}_BJ02`,
      type: "blackjack",
      status: "active",
      min_bet: 2500,
      max_bet: 100000,
    })
    .select()
    .single();

  if (secondaryTableError || !secondaryTable) {
    throw new Error(
      `Failed to create secondary table: ${secondaryTableError?.message}`,
    );
  }

  // 10. Create test visit (this will be the closed visit for continuation)
  const { data: visit, error: visitError } = await supabase
    .from("visit")
    .insert({
      casino_id: casino.id,
      player_id: player.id,
      started_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      visit_kind: "gaming_identified_rated",
    })
    .select("id, visit_group_id")
    .single();

  if (visitError || !visit) {
    throw new Error(`Failed to create test visit: ${visitError?.message}`);
  }

  // 11. Create rating slip (to establish segment context)
  const { data: ratingSlip, error: slipError } = await supabase
    .from("rating_slip")
    .insert({
      casino_id: casino.id,
      visit_id: visit.id,
      table_id: table.id,
      seat_number: "1",
      status: "closed",
      start_time: new Date(Date.now() - 7200000).toISOString(),
      end_time: new Date(Date.now() - 3600000).toISOString(),
      average_bet: 2500,
    })
    .select()
    .single();

  if (slipError) {
    throw new Error(`Failed to create rating slip: ${slipError.message}`);
  }

  // 12. Close the visit (required for continuation)
  const { data: closedVisit, error: closeError } = await supabase
    .from("visit")
    .update({ ended_at: new Date(Date.now() - 1800000).toISOString() })
    .eq("id", visit.id)
    .select("id, visit_group_id")
    .single();

  if (closeError || !closedVisit) {
    throw new Error(`Failed to close visit: ${closeError?.message}`);
  }

  // Cleanup function
  const cleanup = async () => {
    const cleanupClient = createServiceClient();

    // Delete in reverse dependency order
    await cleanupClient.from("rating_slip").delete().eq("casino_id", casino.id);
    await cleanupClient.from("visit").delete().eq("casino_id", casino.id);
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
    await cleanupClient.auth.admin.deleteUser(authData.user.id);
  };

  return {
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    playerId: player.id,
    tableId: table.id,
    secondaryTableId: secondaryTable.id,
    visitId: visit.id,
    closedVisitId: closedVisit.id,
    closedVisitGroupId: closedVisit.visit_group_id,
    authToken: signInData.session.access_token,
    cleanup,
  };
}

test.describe("PRD-017: Visit Continuation API Tests", () => {
  let scenario: VisitContinuationScenario;

  test.beforeAll(async () => {
    scenario = await createVisitContinuationScenario();
  });

  test.afterAll(async () => {
    if (scenario) {
      await scenario.cleanup();
    }
  });

  test.describe("GET /api/v1/players/[playerId]/recent-sessions", () => {
    test("returns paginated closed sessions with aggregates", async ({
      request,
    }) => {
      const response = await request.get(
        `/api/v1/players/${scenario.playerId}/recent-sessions`,
        {
          headers: {
            Authorization: `Bearer ${scenario.authToken}`,
          },
        },
      );

      expect(response.ok()).toBeTruthy();
      const body = await response.json();

      expect(body.ok).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.sessions).toBeDefined();
      expect(Array.isArray(body.data.sessions)).toBe(true);

      // Should have the closed visit in sessions
      const closedSession = body.data.sessions.find(
        (s: { visit_id: string }) => s.visit_id === scenario.closedVisitId,
      );
      expect(closedSession).toBeDefined();
      expect(closedSession.visit_group_id).toBe(scenario.closedVisitGroupId);
      expect(closedSession.ended_at).toBeDefined();

      // open_visit should be null since we closed the only visit
      expect(body.data.open_visit).toBeNull();
    });

    test("respects limit parameter", async ({ request }) => {
      const response = await request.get(
        `/api/v1/players/${scenario.playerId}/recent-sessions?limit=1`,
        {
          headers: {
            Authorization: `Bearer ${scenario.authToken}`,
          },
        },
      );

      expect(response.ok()).toBeTruthy();
      const body = await response.json();

      expect(body.data.sessions.length).toBeLessThanOrEqual(1);
    });

    test("returns 401 without authentication", async ({ request }) => {
      const response = await request.get(
        `/api/v1/players/${scenario.playerId}/recent-sessions`,
      );

      expect(response.status()).toBe(401);
    });

    test("returns empty sessions for player with no visits", async ({
      request,
    }) => {
      // Create a new player with no visits
      const supabase = createServiceClient();
      const { data: newPlayer } = await supabase
        .from("player")
        .insert({
          first_name: "NoVisits",
          last_name: "Player",
        })
        .select()
        .single();

      // Link to casino via junction table
      await supabase.from("player_casino").insert({
        player_id: newPlayer!.id,
        casino_id: scenario.casinoId,
        status: "active",
      });

      try {
        const response = await request.get(
          `/api/v1/players/${newPlayer!.id}/recent-sessions`,
          {
            headers: {
              Authorization: `Bearer ${scenario.authToken}`,
            },
          },
        );

        expect(response.ok()).toBeTruthy();
        const body = await response.json();

        expect(body.data.sessions).toEqual([]);
        expect(body.data.open_visit).toBeNull();
      } finally {
        await supabase
          .from("player_casino")
          .delete()
          .eq("player_id", newPlayer!.id);
        await supabase.from("player").delete().eq("id", newPlayer!.id);
      }
    });
  });

  test.describe("POST /api/v1/visits/start-from-previous", () => {
    test("creates continuation visit with inherited visit_group_id", async ({
      request,
    }) => {
      // Create fresh scenario for this test (since we'll create a new visit)
      const freshScenario = await createVisitContinuationScenario();

      try {
        const response = await request.post(
          "/api/v1/visits/start-from-previous",
          {
            headers: {
              Authorization: `Bearer ${freshScenario.authToken}`,
              "Idempotency-Key": `e2e_continuation_${Date.now()}`,
              "Content-Type": "application/json",
            },
            data: {
              player_id: freshScenario.playerId,
              source_visit_id: freshScenario.closedVisitId,
              destination_table_id: freshScenario.secondaryTableId,
              destination_seat_number: 5,
            },
          },
        );

        expect(response.status()).toBe(201);
        const body = await response.json();

        expect(body.ok).toBe(true);
        expect(body.data.visit_id).toBeDefined();
        expect(body.data.active_slip_id).toBeDefined();
        expect(body.data.started_at).toBeDefined();

        // CRITICAL: visit_group_id should be inherited from source
        expect(body.data.visit_group_id).toBe(freshScenario.closedVisitGroupId);

        // Verify in database
        const supabase = createServiceClient();
        const { data: newVisit } = await supabase
          .from("visit")
          .select("id, visit_group_id, player_id")
          .eq("id", body.data.visit_id)
          .single();

        expect(newVisit?.visit_group_id).toBe(freshScenario.closedVisitGroupId);
        expect(newVisit?.player_id).toBe(freshScenario.playerId);

        // Cleanup: delete the new visit
        await supabase
          .from("rating_slip")
          .delete()
          .eq("visit_id", body.data.visit_id);
        await supabase.from("visit").delete().eq("id", body.data.visit_id);
      } finally {
        await freshScenario.cleanup();
      }
    });

    test("returns 400 when source visit is not closed", async ({ request }) => {
      // Create scenario with an open visit
      const supabase = createServiceClient();
      const baseScenario = await createTestScenario();

      // The base scenario creates an open visit by default
      try {
        const response = await request.post(
          "/api/v1/visits/start-from-previous",
          {
            headers: {
              Authorization: `Bearer ${baseScenario.authToken}`,
              "Idempotency-Key": `e2e_open_source_${Date.now()}`,
              "Content-Type": "application/json",
            },
            data: {
              player_id: baseScenario.playerId,
              source_visit_id: baseScenario.visitId, // This visit is OPEN
              destination_table_id: baseScenario.tableId,
              destination_seat_number: 3,
            },
          },
        );

        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.code).toBe("SOURCE_VISIT_NOT_CLOSED");
      } finally {
        await baseScenario.cleanup();
      }
    });

    test("returns 400 when player_id mismatch", async ({ request }) => {
      const supabase = createServiceClient();

      // Create a different player
      const { data: otherPlayer } = await supabase
        .from("player")
        .insert({
          first_name: "Other",
          last_name: "Player",
        })
        .select()
        .single();

      // Link to casino
      await supabase.from("player_casino").insert({
        player_id: otherPlayer!.id,
        casino_id: scenario.casinoId,
        status: "active",
      });

      try {
        const response = await request.post(
          "/api/v1/visits/start-from-previous",
          {
            headers: {
              Authorization: `Bearer ${scenario.authToken}`,
              "Idempotency-Key": `e2e_mismatch_${Date.now()}`,
              "Content-Type": "application/json",
            },
            data: {
              player_id: otherPlayer!.id, // Different player than source visit
              source_visit_id: scenario.closedVisitId,
              destination_table_id: scenario.secondaryTableId,
              destination_seat_number: 2,
            },
          },
        );

        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.code).toBe("PLAYER_MISMATCH");
      } finally {
        await supabase
          .from("player_casino")
          .delete()
          .eq("player_id", otherPlayer!.id);
        await supabase.from("player").delete().eq("id", otherPlayer!.id);
      }
    });

    test("returns 404 when source visit not found", async ({ request }) => {
      const fakeVisitId = "00000000-0000-0000-0000-000000000000";

      const response = await request.post(
        "/api/v1/visits/start-from-previous",
        {
          headers: {
            Authorization: `Bearer ${scenario.authToken}`,
            "Idempotency-Key": `e2e_not_found_${Date.now()}`,
            "Content-Type": "application/json",
          },
          data: {
            player_id: scenario.playerId,
            source_visit_id: fakeVisitId,
            destination_table_id: scenario.secondaryTableId,
            destination_seat_number: 4,
          },
        },
      );

      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body.code).toBe("VISIT_NOT_FOUND");
    });

    test("returns 409 when player already has open visit", async ({
      request,
    }) => {
      const supabase = createServiceClient();
      const freshScenario = await createVisitContinuationScenario();

      // Create an open visit for the player
      const { data: openVisit } = await supabase
        .from("visit")
        .insert({
          casino_id: freshScenario.casinoId,
          player_id: freshScenario.playerId,
          visit_kind: "gaming_identified_rated",
        })
        .select()
        .single();

      try {
        const response = await request.post(
          "/api/v1/visits/start-from-previous",
          {
            headers: {
              Authorization: `Bearer ${freshScenario.authToken}`,
              "Idempotency-Key": `e2e_already_open_${Date.now()}`,
              "Content-Type": "application/json",
            },
            data: {
              player_id: freshScenario.playerId,
              source_visit_id: freshScenario.closedVisitId,
              destination_table_id: freshScenario.secondaryTableId,
              destination_seat_number: 6,
            },
          },
        );

        expect(response.status()).toBe(409);
        const body = await response.json();
        expect(body.code).toBe("VISIT_ALREADY_OPEN");
      } finally {
        await supabase.from("visit").delete().eq("id", openVisit!.id);
        await freshScenario.cleanup();
      }
    });

    test("returns 422 when destination table not active", async ({
      request,
    }) => {
      const supabase = createServiceClient();
      const freshScenario = await createVisitContinuationScenario();

      // Create an inactive table
      const { data: inactiveTable } = await supabase
        .from("gaming_table")
        .insert({
          casino_id: freshScenario.casinoId,
          label: `inactive_table_${Date.now()}`,
          type: "blackjack",
          status: "inactive",
        })
        .select()
        .single();

      try {
        const response = await request.post(
          "/api/v1/visits/start-from-previous",
          {
            headers: {
              Authorization: `Bearer ${freshScenario.authToken}`,
              "Idempotency-Key": `e2e_inactive_table_${Date.now()}`,
              "Content-Type": "application/json",
            },
            data: {
              player_id: freshScenario.playerId,
              source_visit_id: freshScenario.closedVisitId,
              destination_table_id: inactiveTable!.id,
              destination_seat_number: 1,
            },
          },
        );

        expect(response.status()).toBe(422);
        const body = await response.json();
        expect(["TABLE_NOT_AVAILABLE", "SEAT_OCCUPIED"]).toContain(body.code);
      } finally {
        await supabase
          .from("gaming_table")
          .delete()
          .eq("id", inactiveTable!.id);
        await freshScenario.cleanup();
      }
    });

    test("requires Idempotency-Key header", async ({ request }) => {
      const response = await request.post(
        "/api/v1/visits/start-from-previous",
        {
          headers: {
            Authorization: `Bearer ${scenario.authToken}`,
            "Content-Type": "application/json",
            // No Idempotency-Key
          },
          data: {
            player_id: scenario.playerId,
            source_visit_id: scenario.closedVisitId,
            destination_table_id: scenario.secondaryTableId,
            destination_seat_number: 7,
          },
        },
      );

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    test("returns 401 without authentication", async ({ request }) => {
      const response = await request.post(
        "/api/v1/visits/start-from-previous",
        {
          headers: {
            "Idempotency-Key": `e2e_no_auth_${Date.now()}`,
            "Content-Type": "application/json",
          },
          data: {
            player_id: scenario.playerId,
            source_visit_id: scenario.closedVisitId,
            destination_table_id: scenario.secondaryTableId,
            destination_seat_number: 8,
          },
        },
      );

      expect(response.status()).toBe(401);
    });
  });

  test.describe("visit_group_id Database Behavior", () => {
    test("trigger sets visit_group_id = id when NULL on INSERT", async () => {
      const supabase = createServiceClient();

      // Insert a visit without visit_group_id
      const { data: visit, error } = await supabase
        .from("visit")
        .insert({
          casino_id: scenario.casinoId,
          player_id: null, // Ghost visit to avoid unique constraint
          visit_kind: "gaming_ghost_unrated",
          // visit_group_id intentionally omitted
        })
        .select("id, visit_group_id")
        .single();

      expect(error).toBeNull();
      expect(visit).toBeDefined();

      // Trigger should have set visit_group_id = id
      expect(visit!.visit_group_id).toBe(visit!.id);

      // Cleanup
      await supabase.from("visit").delete().eq("id", visit!.id);
    });

    test("preserves visit_group_id when explicitly provided", async () => {
      const supabase = createServiceClient();
      const customGroupId = scenario.closedVisitGroupId;

      // Insert a visit with explicit visit_group_id
      const { data: visit, error } = await supabase
        .from("visit")
        .insert({
          casino_id: scenario.casinoId,
          player_id: null, // Ghost visit
          visit_kind: "gaming_ghost_unrated",
          visit_group_id: customGroupId,
        })
        .select("id, visit_group_id")
        .single();

      expect(error).toBeNull();
      expect(visit).toBeDefined();

      // Should preserve the explicit value
      expect(visit!.visit_group_id).toBe(customGroupId);
      expect(visit!.visit_group_id).not.toBe(visit!.id);

      // Cleanup
      await supabase.from("visit").delete().eq("id", visit!.id);
    });

    test("partial unique index allows only one open visit per identified player", async () => {
      const supabase = createServiceClient();

      // Create a new player for this test
      const { data: testPlayer } = await supabase
        .from("player")
        .insert({
          first_name: "UniqueTest",
          last_name: "Player",
        })
        .select()
        .single();

      // Link to casino
      await supabase.from("player_casino").insert({
        player_id: testPlayer!.id,
        casino_id: scenario.casinoId,
        status: "active",
      });

      // First open visit should succeed
      const { data: firstVisit, error: firstError } = await supabase
        .from("visit")
        .insert({
          casino_id: scenario.casinoId,
          player_id: testPlayer!.id,
          visit_kind: "gaming_identified_rated",
        })
        .select()
        .single();

      expect(firstError).toBeNull();
      expect(firstVisit).toBeDefined();

      // Second open visit for same player should fail (unique constraint)
      const { data: secondVisit, error: secondError } = await supabase
        .from("visit")
        .insert({
          casino_id: scenario.casinoId,
          player_id: testPlayer!.id,
          visit_kind: "gaming_identified_rated",
        })
        .select()
        .single();

      expect(secondError).toBeDefined();
      expect(secondError!.code).toBe("23505"); // Unique violation

      // Cleanup
      await supabase.from("visit").delete().eq("id", firstVisit!.id);
      await supabase
        .from("player_casino")
        .delete()
        .eq("player_id", testPlayer!.id);
      await supabase.from("player").delete().eq("id", testPlayer!.id);
    });

    test("allows new open visit after previous is closed", async () => {
      const supabase = createServiceClient();

      // Create a new player for this test
      const { data: testPlayer } = await supabase
        .from("player")
        .insert({
          first_name: "CloseReopen",
          last_name: "Player",
        })
        .select()
        .single();

      // Link to casino
      await supabase.from("player_casino").insert({
        player_id: testPlayer!.id,
        casino_id: scenario.casinoId,
        status: "active",
      });

      // Create and close first visit
      const { data: firstVisit } = await supabase
        .from("visit")
        .insert({
          casino_id: scenario.casinoId,
          player_id: testPlayer!.id,
          visit_kind: "gaming_identified_rated",
        })
        .select()
        .single();

      await supabase
        .from("visit")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", firstVisit!.id);

      // Second open visit should now succeed
      const { data: secondVisit, error: secondError } = await supabase
        .from("visit")
        .insert({
          casino_id: scenario.casinoId,
          player_id: testPlayer!.id,
          visit_kind: "gaming_identified_rated",
        })
        .select()
        .single();

      expect(secondError).toBeNull();
      expect(secondVisit).toBeDefined();

      // Cleanup
      await supabase.from("visit").delete().eq("id", secondVisit!.id);
      await supabase.from("visit").delete().eq("id", firstVisit!.id);
      await supabase
        .from("player_casino")
        .delete()
        .eq("player_id", testPlayer!.id);
      await supabase.from("player").delete().eq("id", testPlayer!.id);
    });

    test("allows multiple ghost visits (player_id NULL)", async () => {
      const supabase = createServiceClient();

      // Create first ghost visit
      const { data: firstGhost } = await supabase
        .from("visit")
        .insert({
          casino_id: scenario.casinoId,
          player_id: null,
          visit_kind: "gaming_ghost_unrated",
        })
        .select()
        .single();

      // Create second ghost visit (should succeed - no unique constraint for NULL player_id)
      const { data: secondGhost, error: secondError } = await supabase
        .from("visit")
        .insert({
          casino_id: scenario.casinoId,
          player_id: null,
          visit_kind: "gaming_ghost_unrated",
        })
        .select()
        .single();

      expect(secondError).toBeNull();
      expect(secondGhost).toBeDefined();

      // Cleanup
      await supabase.from("visit").delete().eq("id", firstGhost!.id);
      await supabase.from("visit").delete().eq("id", secondGhost!.id);
    });
  });
});

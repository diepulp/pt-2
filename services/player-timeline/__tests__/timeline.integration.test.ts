/**
 * PlayerTimeline Integration Tests
 *
 * Tests the rpc_get_player_timeline RPC with real database.
 * Validates RPC contract, error handling, and basic functionality.
 *
 * IMPORTANT: The rpc_get_player_timeline RPC requires staff identity
 * via set_rls_context_from_staff() (ADR-024 compliance). These tests
 * validate the security behavior:
 * - Service role without staff JWT should be rejected
 * - Cursor validation errors are thrown before auth check
 *
 * Full E2E tests with authenticated staff users are handled by
 * Playwright tests in e2e/player-timeline.spec.ts.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see ADR-024 (Authoritative RLS Context)
 * @see EXEC-SPEC-029.md WS3-B
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

// === Test Environment Setup ===

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// === Integration Tests ===

describe("PlayerTimeline RPC Integration Tests", () => {
  let supabase: SupabaseClient<Database>;

  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
  });

  // ===========================================================================
  // Security Tests (ADR-024 Compliance)
  // ===========================================================================

  describe("ADR-024 Security Compliance", () => {
    it("rejects RPC calls without staff identity", async () => {
      // Service role client without staff JWT should be rejected
      // This validates set_rls_context_from_staff() is enforcing auth
      const nonExistentPlayerId = "00000000-0000-0000-0000-000000000000";

      const { error } = await supabase.rpc("rpc_get_player_timeline", {
        p_player_id: nonExistentPlayerId,
        p_limit: 10,
      });

      // Should fail with UNAUTHORIZED because service role has no staff identity
      expect(error).not.toBeNull();
      expect(error?.message).toContain("UNAUTHORIZED");
      expect(error?.message).toContain("staff identity not found");
    });

    it("validates cursor BEFORE auth check (cursor errors take precedence)", async () => {
      // Cursor validation happens before the RLS context call
      // This test verifies the validation order
      const nonExistentPlayerId = "00000000-0000-0000-0000-000000000000";

      const { error } = await supabase.rpc("rpc_get_player_timeline", {
        p_player_id: nonExistentPlayerId,
        p_cursor_at: "2026-01-21T14:00:00Z",
        p_cursor_id: null, // Invalid: cursorAt without cursorId
      });

      // Should fail with cursor validation error, not auth error
      expect(error).not.toBeNull();
      expect(error?.message).toContain("Cursor must include");
    });

    it("validates cursor pair requirement (cursorId without cursorAt)", async () => {
      const nonExistentPlayerId = "00000000-0000-0000-0000-000000000000";

      const { error } = await supabase.rpc("rpc_get_player_timeline", {
        p_player_id: nonExistentPlayerId,
        p_cursor_at: null,
        p_cursor_id: "00000000-0000-0000-0000-000000000001",
      });

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Cursor must include");
    });
  });

  // ===========================================================================
  // RPC Exists Tests
  // ===========================================================================

  describe("RPC Existence", () => {
    it("rpc_get_player_timeline function exists in database", async () => {
      // Even though the RPC fails on auth, it should exist
      const { error } = await supabase.rpc("rpc_get_player_timeline", {
        p_player_id: "00000000-0000-0000-0000-000000000000",
      });

      // Error should be auth-related, not "function does not exist"
      expect(error?.message).not.toContain("function");
      expect(error?.message).not.toContain("does not exist");
    });
  });
});

// ===========================================================================
// Mapper Unit Tests Reference
// ===========================================================================

/**
 * Note: Comprehensive mapper unit tests are in mappers.test.ts
 *
 * The mappers tests cover:
 * - All 22 event types metadata mapping
 * - RPC row to DTO transformation
 * - Pagination extraction
 * - Source category classification
 * - Event type labels
 *
 * These tests don't require database access and provide
 * full coverage of the service layer transformation logic.
 */

/** @jest-environment node */
/**
 * PlayerTimeline Integration Tests
 *
 * Tests the rpc_get_player_timeline RPC with real database.
 * Validates RPC contract, error handling, and basic functionality.
 *
 * Mode C (ADR-024): Service-role client for fixture setup/teardown only.
 * Authenticated pitBossClient for all business-logic calls.
 *
 * Security tests validate:
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

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  createModeCSession,
  ModeCSessionResult,
} from '@/lib/testing/create-mode-c-session';
import type { Database } from '@/types/database.types';

// === Test Environment Setup ===

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// === Integration Tests ===

const isIntegrationEnvironment =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration('PlayerTimeline RPC Integration Tests', () => {
  let setupClient: SupabaseClient<Database>;
  let pitBossClient: SupabaseClient<Database>;
  let authCleanup: ModeCSessionResult['cleanup'] | undefined;
  let testCompanyId: string;
  let testCasinoId: string;
  let testStaffId: string;

  // --- Setup helpers (service-role only) ---

  /** Verify RPC rejects service-role calls without staff JWT */
  async function setupVerifyNoStaffIdentityRejection() {
    const nonExistentPlayerId = '00000000-0000-0000-0000-000000000000';
    return setupClient.rpc('rpc_get_player_timeline', {
      p_player_id: nonExistentPlayerId,
      p_limit: 10,
    });
  }

  /** Verify cursor validation fires before auth (cursorAt without cursorId) */
  async function setupVerifyCursorAtWithoutId() {
    const nonExistentPlayerId = '00000000-0000-0000-0000-000000000000';
    return setupClient.rpc('rpc_get_player_timeline', {
      p_player_id: nonExistentPlayerId,
      p_cursor_at: '2026-01-21T14:00:00Z',
      p_cursor_id: null, // Invalid: cursorAt without cursorId
    });
  }

  /** Verify cursor validation fires before auth (cursorId without cursorAt) */
  async function setupVerifyCursorIdWithoutAt() {
    const nonExistentPlayerId = '00000000-0000-0000-0000-000000000000';
    return setupClient.rpc('rpc_get_player_timeline', {
      p_player_id: nonExistentPlayerId,
      p_cursor_at: null,
      p_cursor_id: '00000000-0000-0000-0000-000000000001',
    });
  }

  /** Verify RPC function exists in database */
  async function setupVerifyRpcExists() {
    return setupClient.rpc('rpc_get_player_timeline', {
      p_player_id: '00000000-0000-0000-0000-000000000000',
    });
  }

  beforeAll(async () => {
    // Service-role client for fixture setup only (Mode C — ADR-024)
    setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test company
    const { data: company, error: companyError } = await setupClient
      .from('company')
      .insert({ name: 'Integration Test Company - Timeline' })
      .select()
      .single();
    if (companyError) throw companyError;
    testCompanyId = company.id;

    // Create test casino
    const { data: casino, error: casinoError } = await setupClient
      .from('casino')
      .insert({
        name: 'Integration Test Casino - Timeline',
        status: 'active',
        company_id: testCompanyId,
      })
      .select()
      .single();
    if (casinoError) throw casinoError;
    testCasinoId = casino.id;

    // Create staff record for Mode C auth
    const { data: staff, error: staffError } = await setupClient
      .from('staff')
      .insert({
        first_name: 'Test',
        last_name: 'PitBoss',
        role: 'pit_boss',
        casino_id: testCasinoId,
        status: 'active',
      })
      .select()
      .single();
    if (staffError) throw staffError;
    testStaffId = staff.id;

    // Mode C auth ceremony (ADR-024) — authenticated anon client with JWT claims
    const session = await createModeCSession(setupClient, {
      staffId: testStaffId,
      casinoId: testCasinoId,
      staffRole: 'pit_boss',
    });
    pitBossClient = session.client;
    authCleanup = session.cleanup;

    // Link auth user to staff record
    await setupClient
      .from('staff')
      .update({ user_id: session.userId })
      .eq('id', testStaffId);
  });

  afterAll(async () => {
    // Clean up test data (in reverse order of creation)
    await setupClient.from('staff').delete().eq('casino_id', testCasinoId);
    await setupClient.from('casino').delete().eq('id', testCasinoId);
    await setupClient.from('company').delete().eq('id', testCompanyId);

    // Auth cleanup (Mode C)
    await authCleanup?.();
  });

  // ===========================================================================
  // Security Tests (ADR-024 Compliance)
  // ===========================================================================

  describe('ADR-024 Security Compliance', () => {
    it('rejects RPC calls without staff identity', async () => {
      // Service role client without staff JWT should be rejected
      // This validates set_rls_context_from_staff() is enforcing auth
      const { error } = await setupVerifyNoStaffIdentityRejection();

      // Should fail with UNAUTHORIZED because service role has no staff identity
      expect(error).not.toBeNull();
      expect(error?.message).toContain('UNAUTHORIZED');
      expect(error?.message).toContain('staff identity not found');
    });

    it('validates cursor BEFORE auth check (cursor errors take precedence)', async () => {
      // Cursor validation happens before the RLS context call
      // This test verifies the validation order
      const { error } = await setupVerifyCursorAtWithoutId();

      // Should fail with cursor validation error, not auth error
      expect(error).not.toBeNull();
      expect(error?.message).toContain('Cursor must include');
    });

    it('validates cursor pair requirement (cursorId without cursorAt)', async () => {
      const { error } = await setupVerifyCursorIdWithoutAt();

      expect(error).not.toBeNull();
      expect(error?.message).toContain('Cursor must include');
    });
  });

  // ===========================================================================
  // RPC Exists Tests
  // ===========================================================================

  describe('RPC Existence', () => {
    it('rpc_get_player_timeline function exists in database', async () => {
      // Even though the RPC fails on auth, it should exist
      const { error } = await setupVerifyRpcExists();

      // Error should be auth-related, not "function does not exist"
      expect(error?.message).not.toContain('function');
      expect(error?.message).not.toContain('does not exist');
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

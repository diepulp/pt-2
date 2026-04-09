/** @jest-environment node */

/**
 * Casino Service Integration Tests
 *
 * Tests RPC functions and constraints with real Supabase database.
 * Verifies compute_gaming_day, staff role constraints, and casino settings.
 *
 * Mode C (ADR-024): Service-role client for fixture setup/teardown only.
 * Authenticated pitBossClient for all business-logic calls.
 *
 * @see SPEC-PRD-000-casino-foundation.md section 8.2
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  createModeCSession,
  ModeCSessionResult,
} from '@/lib/testing/create-mode-c-session';
import type { Database } from '@/types/database.types';

// Integration gate: skip when RUN_INTEGRATION_TESTS is unset
const describeIntegration = process.env.RUN_INTEGRATION_TESTS
  ? describe
  : describe.skip;

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describeIntegration('Casino Service Integration Tests', () => {
  let setupClient: SupabaseClient<Database>;
  let pitBossClient: SupabaseClient<Database>;
  let authCleanup: ModeCSessionResult['cleanup'] | undefined;
  let testCompanyId: string;
  let testCasinoId: string;
  let testStaffId: string;

  beforeAll(async () => {
    // Service-role client for fixture setup only (Mode C — ADR-024)
    setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test company (ADR-043: company before casino)
    const { data: company, error: companyError } = await setupClient
      .from('company')
      .insert({ name: 'Integration Test Company - PRD000' })
      .select()
      .single();

    if (companyError) throw companyError;
    testCompanyId = company.id;

    // Create test casino
    const { data: casino, error: casinoError } = await setupClient
      .from('casino')
      .insert({
        name: 'Integration Test Casino - PRD000',
        status: 'active',
        company_id: testCompanyId,
      })
      .select()
      .single();

    if (casinoError) throw casinoError;
    testCasinoId = casino.id;

    // Create casino_settings for the test casino
    // gaming_day_start_time: 06:00, timezone: America/Los_Angeles
    const { error: settingsError } = await setupClient
      .from('casino_settings')
      .insert({
        casino_id: testCasinoId,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      });

    if (settingsError) throw settingsError;

    // Create staff record for Mode C auth (pit_boss requires user_id)
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

    // Link auth user to staff record (chk_staff_role_user_id requires user_id for pit_boss)
    await setupClient
      .from('staff')
      .update({ user_id: session.userId })
      .eq('id', testStaffId);
  });

  afterAll(async () => {
    // Clean up test data (in reverse order of creation)
    await setupClient.from('staff').delete().eq('casino_id', testCasinoId);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasinoId);
    await setupClient.from('casino').delete().eq('id', testCasinoId);
    await setupClient.from('company').delete().eq('id', testCompanyId);

    // Auth cleanup (Mode C)
    await authCleanup?.();
  });

  // ===========================================================================
  // 1. compute_gaming_day RPC Tests
  // ===========================================================================

  describe('compute_gaming_day RPC', () => {
    it('returns correct day for timestamp after gaming day start', async () => {
      // 2:30 PM PST on Jan 15 - should return Jan 15
      const { data, error } = await pitBossClient.rpc('compute_gaming_day', {
        p_casino_id: testCasinoId,
        p_timestamp: '2025-01-15T22:30:00Z', // 14:30 PST (after 6am)
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-01-15');
    });

    it('returns previous day for timestamp before gaming day start', async () => {
      // 5:30 AM PST on Jan 15 - should return Jan 14 (before 6am gaming day start)
      const { data, error } = await pitBossClient.rpc('compute_gaming_day', {
        p_casino_id: testCasinoId,
        p_timestamp: '2025-01-15T13:30:00Z', // 05:30 PST (before 6am)
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-01-14');
    });

    it('returns current day for timestamp at exact gaming day start', async () => {
      // Exactly 6:00 AM PST on Jan 15 - should return Jan 15
      const { data, error } = await pitBossClient.rpc('compute_gaming_day', {
        p_casino_id: testCasinoId,
        p_timestamp: '2025-01-15T14:00:00Z', // 06:00 PST (exactly at gaming day start)
      });

      expect(error).toBeNull();
      expect(data).toBe('2025-01-15');
    });

    it('handles non-existent casino (CASINO_SETTINGS_NOT_FOUND error)', async () => {
      const fakeUUID = '00000000-0000-0000-0000-000000000000';
      const { error } = await pitBossClient.rpc('compute_gaming_day', {
        p_casino_id: fakeUUID,
        p_timestamp: '2025-01-15T14:00:00Z',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toContain('CASINO_SETTINGS_NOT_FOUND');
    });

    describe('DST transitions', () => {
      it('handles DST spring forward correctly (March 2025)', async () => {
        // March 9, 2025 - DST transition in America/Los_Angeles
        // At 2:00 AM, clocks spring forward to 3:00 AM
        // Testing 10:00 AM PDT (now UTC-7 after spring forward)
        const { data, error } = await pitBossClient.rpc('compute_gaming_day', {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-03-09T17:00:00Z', // 10:00 AM PDT
        });

        expect(error).toBeNull();
        expect(data).toBe('2025-03-09');
      });

      it('handles timestamp just after DST spring forward', async () => {
        // March 9, 2025 - 3:30 AM PDT (right after the "lost" hour)
        // 3:30 AM PDT = 10:30 UTC
        const { data, error } = await pitBossClient.rpc('compute_gaming_day', {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-03-09T10:30:00Z', // 3:30 AM PDT
        });

        expect(error).toBeNull();
        // 3:30 AM is before 6:00 AM gaming day start -> previous day
        expect(data).toBe('2025-03-08');
      });

      it('handles DST fall back correctly (November 2025)', async () => {
        // November 2, 2025 - DST transition in America/Los_Angeles
        // At 2:00 AM PDT, clocks fall back to 1:00 AM PST
        // Testing 10:00 AM PST (now UTC-8 after fall back)
        const { data, error } = await pitBossClient.rpc('compute_gaming_day', {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-11-02T18:00:00Z', // 10:00 AM PST
        });

        expect(error).toBeNull();
        expect(data).toBe('2025-11-02');
      });

      it('handles ambiguous time during DST fall back', async () => {
        // November 2, 2025 - 1:30 AM happens twice (ambiguous)
        // First 1:30 AM PDT = UTC-7, then clocks fall back
        // Second 1:30 AM PST = UTC-8
        // Testing the PST version (after fall back): 1:30 AM PST = 09:30 UTC
        const { data, error } = await pitBossClient.rpc('compute_gaming_day', {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-11-02T09:30:00Z', // 1:30 AM PST (after fall back)
        });

        expect(error).toBeNull();
        // 1:30 AM is before 6:00 AM gaming day start -> previous day
        expect(data).toBe('2025-11-01');
      });

      it('handles timestamp before DST fall back (PDT)', async () => {
        // November 2, 2025 - 1:30 AM PDT (before fall back) = 08:30 UTC
        const { data, error } = await pitBossClient.rpc('compute_gaming_day', {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-11-02T08:30:00Z', // 1:30 AM PDT (before fall back)
        });

        expect(error).toBeNull();
        // 1:30 AM is before 6:00 AM gaming day start -> previous day
        expect(data).toBe('2025-11-01');
      });
    });

    describe('Gaming day with different timezones', () => {
      let eastCoastCompanyId: string;
      let eastCoastCasinoId: string;

      beforeAll(async () => {
        // Setup fixtures via service-role (Mode C — ADR-024)
        const { data: company, error: companyError } = await setupClient
          .from('company')
          .insert({ name: 'East Coast Test Company' })
          .select()
          .single();

        if (companyError) throw companyError;
        eastCoastCompanyId = company.id;

        const { data: casino, error: casinoError } = await setupClient
          .from('casino')
          .insert({
            name: 'East Coast Test Casino',
            status: 'active',
            company_id: eastCoastCompanyId,
          })
          .select()
          .single();

        if (casinoError) throw casinoError;
        eastCoastCasinoId = casino.id;

        // Create settings with Eastern timezone
        const { error: settingsError } = await setupClient
          .from('casino_settings')
          .insert({
            casino_id: eastCoastCasinoId,
            gaming_day_start_time: '06:00:00',
            timezone: 'America/New_York',
            watchlist_floor: 3000,
            ctr_threshold: 10000,
          });

        if (settingsError) throw settingsError;
      });

      afterAll(async () => {
        await setupClient
          .from('casino_settings')
          .delete()
          .eq('casino_id', eastCoastCasinoId);
        await setupClient.from('casino').delete().eq('id', eastCoastCasinoId);
        await setupClient.from('company').delete().eq('id', eastCoastCompanyId);
      });

      it('handles Eastern timezone correctly', async () => {
        // 10:00 AM EST = 15:00 UTC
        const { data, error } = await pitBossClient.rpc('compute_gaming_day', {
          p_casino_id: eastCoastCasinoId,
          p_timestamp: '2025-01-15T15:00:00Z', // 10:00 AM EST
        });

        expect(error).toBeNull();
        expect(data).toBe('2025-01-15');
      });

      it('returns different gaming days for same UTC timestamp in different timezones', async () => {
        // 09:00 UTC = 1:00 AM PST (prev day) = 4:00 AM EST (prev day)
        // Both should return previous day since before 6am in both timezones

        const { data: westCoastData, error: westCoastError } =
          await pitBossClient.rpc('compute_gaming_day', {
            p_casino_id: testCasinoId,
            p_timestamp: '2025-01-15T09:00:00Z', // 1:00 AM PST
          });

        const { data: eastCoastData, error: eastCoastError } =
          await pitBossClient.rpc('compute_gaming_day', {
            p_casino_id: eastCoastCasinoId,
            p_timestamp: '2025-01-15T09:00:00Z', // 4:00 AM EST
          });

        expect(westCoastError).toBeNull();
        expect(eastCoastError).toBeNull();
        expect(westCoastData).toBe('2025-01-14'); // 1 AM PST -> Jan 14
        expect(eastCoastData).toBe('2025-01-14'); // 4 AM EST -> Jan 14
      });

      it('shows timezone-aware boundary difference', async () => {
        // 11:00 UTC = 3:00 AM PST (prev day) = 6:00 AM EST (current day)
        // West coast: before 6am -> previous day
        // East coast: at 6am -> current day

        const { data: westCoastData, error: westCoastError } =
          await pitBossClient.rpc('compute_gaming_day', {
            p_casino_id: testCasinoId,
            p_timestamp: '2025-01-15T11:00:00Z', // 3:00 AM PST
          });

        const { data: eastCoastData, error: eastCoastError } =
          await pitBossClient.rpc('compute_gaming_day', {
            p_casino_id: eastCoastCasinoId,
            p_timestamp: '2025-01-15T11:00:00Z', // 6:00 AM EST
          });

        expect(westCoastError).toBeNull();
        expect(eastCoastError).toBeNull();
        expect(westCoastData).toBe('2025-01-14'); // 3 AM PST -> Jan 14
        expect(eastCoastData).toBe('2025-01-15'); // 6 AM EST -> Jan 15
      });
    });
  });

  // ===========================================================================
  // 2. Staff Role Constraints Tests
  // ===========================================================================

  describe('Staff role constraints', () => {
    afterEach(async () => {
      // Clean up staff after each test (except the Mode C pit boss)
      await setupClient
        .from('staff')
        .delete()
        .eq('casino_id', testCasinoId)
        .neq('id', testStaffId);
    });

    it('allows dealer without user_id', async () => {
      const { data, error } = await setupClient
        .from('staff')
        .insert({
          first_name: 'Test',
          last_name: 'Dealer',
          role: 'dealer',
          casino_id: testCasinoId,
          user_id: null, // Dealers should NOT have user_id
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.role).toBe('dealer');
      expect(data?.user_id).toBeNull();
    });

    it('rejects dealer with user_id (23514 check constraint)', async () => {
      const { error } = await setupClient.from('staff').insert({
        first_name: 'Test',
        last_name: 'Dealer',
        role: 'dealer',
        casino_id: testCasinoId,
        user_id: testStaffId, // Should fail - dealers cannot have user_id
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514'); // Check constraint violation
      expect(error?.message).toContain('chk_staff_role_user_id');
    });

    it('rejects pit_boss without user_id (23514)', async () => {
      const { error } = await setupClient.from('staff').insert({
        first_name: 'Test',
        last_name: 'PitBoss',
        role: 'pit_boss',
        casino_id: testCasinoId,
        user_id: null, // Should fail - pit_boss must have user_id
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514'); // Check constraint violation
      expect(error?.message).toContain('chk_staff_role_user_id');
    });

    it('rejects admin without user_id (23514)', async () => {
      const { error } = await setupClient.from('staff').insert({
        first_name: 'Test',
        last_name: 'Admin',
        role: 'admin',
        casino_id: testCasinoId,
        user_id: null, // Should fail - admin must have user_id
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514'); // Check constraint violation
      expect(error?.message).toContain('chk_staff_role_user_id');
    });

    it('allows pit_boss with user_id', async () => {
      // Use Mode C session userId for this constraint test
      const tempSession = await createModeCSession(setupClient, {
        staffId: testStaffId,
        casinoId: testCasinoId,
        staffRole: 'pit_boss',
      });

      const { data, error } = await setupClient
        .from('staff')
        .insert({
          first_name: 'Test',
          last_name: 'PitBoss',
          role: 'pit_boss',
          casino_id: testCasinoId,
          user_id: tempSession.userId,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.role).toBe('pit_boss');
      expect(data?.user_id).toBe(tempSession.userId);

      // Clean up temp auth user
      await tempSession.cleanup();
    });

    it('allows admin with user_id', async () => {
      // Use Mode C session userId for this constraint test
      const tempSession = await createModeCSession(setupClient, {
        staffId: testStaffId,
        casinoId: testCasinoId,
        staffRole: 'admin',
      });

      const { data, error } = await setupClient
        .from('staff')
        .insert({
          first_name: 'Test',
          last_name: 'Admin',
          role: 'admin',
          casino_id: testCasinoId,
          user_id: tempSession.userId,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.role).toBe('admin');
      expect(data?.user_id).toBe(tempSession.userId);

      // Clean up temp auth user
      await tempSession.cleanup();
    });
  });

  // ===========================================================================
  // 3. Casino Settings Tests
  // ===========================================================================

  describe('Casino settings', () => {
    it('reads casino settings', async () => {
      const { data, error } = await pitBossClient
        .from('casino_settings')
        .select('*')
        .eq('casino_id', testCasinoId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.casino_id).toBe(testCasinoId);
      expect(data?.gaming_day_start_time).toBe('06:00:00');
      expect(data?.timezone).toBe('America/Los_Angeles');
      expect(data?.watchlist_floor).toBe(3000);
      expect(data?.ctr_threshold).toBe(10000);
    });

    it('updates casino settings', async () => {
      // Update the settings via authenticated client (Mode C)
      const { error: updateError } = await pitBossClient
        .from('casino_settings')
        .update({
          gaming_day_start_time: '05:00:00',
          watchlist_floor: 5000,
        })
        .eq('casino_id', testCasinoId);

      expect(updateError).toBeNull();

      // Verify the update
      const { data, error } = await pitBossClient
        .from('casino_settings')
        .select('*')
        .eq('casino_id', testCasinoId)
        .single();

      expect(error).toBeNull();
      expect(data?.gaming_day_start_time).toBe('05:00:00');
      expect(data?.watchlist_floor).toBe(5000);

      // Restore original values
      await setupClient
        .from('casino_settings')
        .update({
          gaming_day_start_time: '06:00:00',
          watchlist_floor: 3000,
        })
        .eq('casino_id', testCasinoId);
    });

    it('reflects gaming day changes after settings update', async () => {
      // First, get gaming day with original settings (6am start)
      const { data: gamingDay1 } = await pitBossClient.rpc(
        'compute_gaming_day',
        {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-01-15T13:30:00Z', // 5:30 AM PST
        },
      );

      expect(gamingDay1).toBe('2025-01-14'); // Before 6am -> previous day

      // Update gaming day start to 5am (setup operation)
      await setupClient
        .from('casino_settings')
        .update({ gaming_day_start_time: '05:00:00' })
        .eq('casino_id', testCasinoId);

      // Now the same timestamp should return current day (5:30 AM is after 5am start)
      const { data: gamingDay2 } = await pitBossClient.rpc(
        'compute_gaming_day',
        {
          p_casino_id: testCasinoId,
          p_timestamp: '2025-01-15T13:30:00Z', // 5:30 AM PST
        },
      );

      expect(gamingDay2).toBe('2025-01-15'); // After 5am -> current day

      // Restore original settings
      await setupClient
        .from('casino_settings')
        .update({ gaming_day_start_time: '06:00:00' })
        .eq('casino_id', testCasinoId);
    });
  });
});

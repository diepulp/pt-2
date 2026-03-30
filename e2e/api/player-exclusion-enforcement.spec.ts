/**
 * Player Exclusion Enforcement — System Verification — Mode C (authenticated client)
 *
 * Verifies that creating a hard_block exclusion via RPC auto-closes
 * active visits and open rating slips, with audit trail.
 *
 * Auth: Mode C — signInWithPassword → Bearer token → Supabase client.
 * Verification class: System Verification (real JWT/RPC/RLS, no browser surface).
 *
 * @see QA-006 §1 — Mode C for SECURITY DEFINER RPCs
 * @see QA-006 §5 — SECURITY DEFINER RPC testing pattern
 * @see EXEC-055 — Exclusion enforcement wiring spec
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type { ExclusionEnforcementScenario } from '../fixtures/exclusion-fixtures';
import {
  createAuthenticatedClient,
  createExclusionWithActiveSlip,
} from '../fixtures/exclusion-fixtures';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe('Exclusion Auto-Close — System Verification — Mode C (authenticated client)', () => {
  let scenario: ExclusionEnforcementScenario;

  test.beforeAll(async () => {
    scenario = await createExclusionWithActiveSlip();
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('hard_block exclusion should auto-close active visit and open slip', async () => {
    // Pre-condition: visit is open, slip is open
    const serviceClient = createServiceClient();

    const { data: visitBefore } = await serviceClient
      .from('visit')
      .select('ended_at')
      .eq('id', scenario.visitId)
      .single();
    expect(visitBefore?.ended_at).toBeNull();

    const { data: slipBefore } = await serviceClient
      .from('rating_slip')
      .select('status')
      .eq('id', scenario.slipId)
      .single();
    expect(slipBefore?.status).toBe('open');

    // Act: create hard_block exclusion via authenticated RPC
    const authedClient = createAuthenticatedClient(scenario.authToken);
    const { error: rpcError } = await authedClient.rpc(
      'rpc_create_player_exclusion',
      {
        p_player_id: scenario.playerId,
        p_exclusion_type: 'internal_ban',
        p_enforcement: 'hard_block',
        p_reason: 'E2E auto-close verification',
        p_effective_from: new Date().toISOString().slice(0, 10),
        p_effective_until: null,
        p_review_date: null,
        p_external_ref: null,
        p_jurisdiction: null,
      },
    );
    expect(rpcError).toBeNull();

    // Assert: visit auto-closed (ended_at set)
    const { data: visitAfter } = await serviceClient
      .from('visit')
      .select('ended_at')
      .eq('id', scenario.visitId)
      .single();
    expect(visitAfter?.ended_at).not.toBeNull();

    // Assert: slip auto-closed with theo=0
    const { data: slipAfter } = await serviceClient
      .from('rating_slip')
      .select('status, computed_theo_cents')
      .eq('id', scenario.slipId)
      .single();
    expect(slipAfter?.status).toBe('closed');
    expect(slipAfter?.computed_theo_cents).toBe(0);

    // Assert: audit_log entry for auto-close
    const { data: auditEntries } = await serviceClient
      .from('audit_log')
      .select('action, domain, details')
      .eq('casino_id', scenario.casinoId)
      .eq('action', 'exclusion_auto_close')
      .order('created_at', { ascending: false })
      .limit(1);
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries![0].domain).toBe('player_exclusion');
  });
});

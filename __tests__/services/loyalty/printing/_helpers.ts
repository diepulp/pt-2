/** @jest-environment node */

/**
 * Shared fixtures + builders for the InstrumentPrinting integration suite (PRD-092 WS8).
 *
 * NOT a test file (no `.test.ts` suffix) — it is imported by the `*.int.test.ts`
 * specs so each one stays lean and DRY. It provides:
 *
 *   - `printingIntegrationGuard()` — the Mode C / RUN_INTEGRATION_TESTS gate.
 *   - `setupPrintingFixtures()`    — real auth users / casinos / staff / a
 *     resolvable promo_coupon (casino A), a cross-casino coupon (casino B), and a
 *     loyalty_ledger entry (comp family), plus authenticated Mode C clients.
 *   - `entitlementPayload()` / `compPayload()` — valid `FulfillmentPayload`s wired
 *     to the seeded instruments.
 *   - `makeInProcessAgentClient()` / `makeTransportErrorClient()` — programmable
 *     `LoopbackAgentClient`s with jest spies so a test can assert the real
 *     physical-print boundary (agent `submitJob` / spooler `submit`) and drive the
 *     transport-fault outcomes deterministically.
 *
 * Real-DB, NO Supabase client-constructor mock (Gate A non-waivable). Auth model:
 * ADR-024 Mode C (authenticated anon client carrying a staff_id JWT;
 * set_rls_context_from_staff derives context server-side).
 *
 * @see PRD-092 / EXEC-092 WS8
 * @see __tests__/services/loyalty/printing/print-attempt-rls.int.test.ts (WS2 exemplar)
 */

import { jest } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type {
  CompFulfillmentPayload,
  EntitlementFulfillmentPayload,
} from '@/services/loyalty/dtos';
import {
  AgentTransportError,
  type AgentPrintJobRequest,
  type AgentPrintJobResponse,
  type AgentTransportErrorCode,
  type LoopbackAgentClient,
  type SpoolerOutcome,
  createLoopbackAgent,
  createSimulatedCupsSpooler,
} from '@/services/loyalty/printing/agent/loopback-agent';
import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** A uuid guaranteed NOT to resolve to any seeded instrument. */
export const UNRESOLVABLE_REF = '99999999-9999-4999-8999-999999999999';

/** Gate: real env present AND RUN_INTEGRATION_TESTS enabled (accepts 'true'|'1'). */
export function printingIntegrationGuard(): {
  isIntegrationEnvironment: boolean;
} {
  const isIntegrationEnvironment = Boolean(
    supabaseUrl &&
    SERVICE_ROLE_KEY &&
    ANON_KEY &&
    (process.env.RUN_INTEGRATION_TESTS === 'true' ||
      process.env.RUN_INTEGRATION_TESTS === '1'),
  );
  return { isIntegrationEnvironment };
}

/** The fully-seeded fixture context returned by `setupPrintingFixtures`. */
export interface PrintingFixtures {
  setupClient: SupabaseClient<Database>;
  /** Mode C client for casino A pit boss (the controlled-write actor). */
  pitBossClient: SupabaseClient<Database>;
  /** Mode C client for casino B pit boss (cross-casino negatives). */
  otherCasinoClient: SupabaseClient<Database>;
  casinoId: string;
  otherCasinoId: string;
  pitBossId: string;
  otherPitBossId: string;
  /** Resolvable promo_coupon in casino A (entitlement family). */
  couponRefA: string;
  /** Its validation_number (entitlement barcode token). */
  couponValidationA: string;
  /** A promo_coupon in casino B (cross-casino negative). */
  couponRefB: string;
  /** Resolvable loyalty_ledger entry in casino A (points_comp family). */
  ledgerRefA: string;
  playerId: string;
  /** Tear down every seeded row + auth user. */
  cleanup(): Promise<void>;
}

/**
 * Seed the full real-DB fixture graph for the printing integration suite.
 * `label` keeps emails / names unique across concurrently-developed specs.
 */
export async function setupPrintingFixtures(
  label: string,
): Promise<PrintingFixtures> {
  const setupClient = createClient<Database>(supabaseUrl, SERVICE_ROLE_KEY);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pitBossEmail = `test-pa-${label}-pb-${stamp}@example.com`;
  const otherPitBossEmail = `test-pa-${label}-other-${stamp}@example.com`;
  const testPassword = 'test-password';

  // 1. Auth users (two-phase ADR-024)
  const { data: u1, error: u1e } = await setupClient.auth.admin.createUser({
    email: pitBossEmail,
    password: testPassword,
    email_confirm: true,
    app_metadata: { staff_role: 'pit_boss' },
  });
  if (u1e) throw u1e;
  const userId1 = u1.user.id;

  const { data: u2, error: u2e } = await setupClient.auth.admin.createUser({
    email: otherPitBossEmail,
    password: testPassword,
    email_confirm: true,
    app_metadata: { staff_role: 'pit_boss' },
  });
  if (u2e) throw u2e;
  const userId2 = u2.user.id;

  // 2. Companies (ADR-043: company before casino)
  const { data: c1, error: c1e } = await setupClient
    .from('company')
    .insert({ name: `PA Co 1 ${stamp}` })
    .select('id')
    .single();
  if (c1e) throw c1e;
  const { data: c2, error: c2e } = await setupClient
    .from('company')
    .insert({ name: `PA Co 2 ${stamp}` })
    .select('id')
    .single();
  if (c2e) throw c2e;

  // 3. Casinos + settings
  const { data: cas1, error: cas1e } = await setupClient
    .from('casino')
    .insert({ name: `PA Casino A ${stamp}`, company_id: c1.id })
    .select('id')
    .single();
  if (cas1e) throw cas1e;
  const casinoId = cas1.id;

  const { data: cas2, error: cas2e } = await setupClient
    .from('casino')
    .insert({ name: `PA Casino B ${stamp}`, company_id: c2.id })
    .select('id')
    .single();
  if (cas2e) throw cas2e;
  const otherCasinoId = cas2.id;

  await setupClient.from('casino_settings').insert({ casino_id: casinoId });
  await setupClient
    .from('casino_settings')
    .insert({ casino_id: otherCasinoId });

  // 4. Staff
  const { data: pb, error: pbe } = await setupClient
    .from('staff')
    .insert({
      user_id: userId1,
      casino_id: casinoId,
      role: 'pit_boss',
      first_name: 'Print',
      last_name: 'PitBoss',
      status: 'active',
    })
    .select('id')
    .single();
  if (pbe) throw pbe;
  const pitBossId = pb.id;

  const { data: opb, error: opbe } = await setupClient
    .from('staff')
    .insert({
      user_id: userId2,
      casino_id: otherCasinoId,
      role: 'pit_boss',
      first_name: 'Other',
      last_name: 'PitBoss',
      status: 'active',
    })
    .select('id')
    .single();
  if (opbe) throw opbe;
  const otherPitBossId = opb.id;

  // 5. Instruments — instrument_ref MUST resolve same-casino (P0-2).
  const { data: progA, error: progAe } = await setupClient
    .from('promo_program')
    .insert({
      casino_id: casinoId,
      name: `PA Match Play A ${stamp}`,
      promo_type: 'match_play',
      face_value_amount: 25,
      required_match_wager_amount: 25,
    })
    .select('id')
    .single();
  if (progAe) throw progAe;

  const couponValidationA = `PA-A-${stamp}`;
  const { data: couponA, error: couponAe } = await setupClient
    .from('promo_coupon')
    .insert({
      casino_id: casinoId,
      promo_program_id: progA.id,
      validation_number: couponValidationA,
      face_value_amount: 25,
      required_match_wager_amount: 25,
      issued_by_staff_id: pitBossId,
    })
    .select('id')
    .single();
  if (couponAe) throw couponAe;
  const couponRefA = couponA.id;

  const { data: progB, error: progBe } = await setupClient
    .from('promo_program')
    .insert({
      casino_id: otherCasinoId,
      name: `PA Match Play B ${stamp}`,
      promo_type: 'match_play',
      face_value_amount: 25,
      required_match_wager_amount: 25,
    })
    .select('id')
    .single();
  if (progBe) throw progBe;

  const { data: couponB, error: couponBe } = await setupClient
    .from('promo_coupon')
    .insert({
      casino_id: otherCasinoId,
      promo_program_id: progB.id,
      validation_number: `PA-B-${stamp}`,
      face_value_amount: 25,
      required_match_wager_amount: 25,
      issued_by_staff_id: otherPitBossId,
    })
    .select('id')
    .single();
  if (couponBe) throw couponBe;
  const couponRefB = couponB.id;

  const { data: player, error: playerE } = await setupClient
    .from('player')
    .insert({
      first_name: 'Comp',
      last_name: 'Player',
      birth_date: '1980-01-01',
    })
    .select('id')
    .single();
  if (playerE) throw playerE;
  const playerId = player.id;

  const { data: ledgerA, error: ledgerAe } = await setupClient
    .from('loyalty_ledger')
    .insert({
      casino_id: casinoId,
      player_id: playerId,
      points_delta: -100,
      reason: 'redeem',
    })
    .select('id')
    .single();
  if (ledgerAe) throw ledgerAe;
  const ledgerRefA = ledgerA.id;

  // 6. Stamp staff_id into app_metadata (ADR-024 two-phase)
  await setupClient.auth.admin.updateUserById(userId1, {
    app_metadata: {
      staff_id: pitBossId,
      casino_id: casinoId,
      staff_role: 'pit_boss',
    },
  });
  await setupClient.auth.admin.updateUserById(userId2, {
    app_metadata: {
      staff_id: otherPitBossId,
      casino_id: otherCasinoId,
      staff_role: 'pit_boss',
    },
  });

  // 7. Sign in for JWTs + Mode C clients
  const throwaway1 = createClient<Database>(supabaseUrl, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: s1, error: s1e } = await throwaway1.auth.signInWithPassword({
    email: pitBossEmail,
    password: testPassword,
  });
  if (s1e || !s1.session)
    throw s1e ?? new Error('sign-in 1 returned no session');

  const throwaway2 = createClient<Database>(supabaseUrl, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: s2, error: s2e } = await throwaway2.auth.signInWithPassword({
    email: otherPitBossEmail,
    password: testPassword,
  });
  if (s2e || !s2.session)
    throw s2e ?? new Error('sign-in 2 returned no session');

  const pitBossClient = createClient<Database>(supabaseUrl, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${s1.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const otherCasinoClient = createClient<Database>(supabaseUrl, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${s2.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  async function cleanup(): Promise<void> {
    for (const cid of [casinoId, otherCasinoId]) {
      if (!cid) continue;
      await setupClient.from('print_attempt').delete().eq('casino_id', cid);
      await setupClient.from('promo_coupon').delete().eq('casino_id', cid);
      await setupClient.from('promo_program').delete().eq('casino_id', cid);
      await setupClient.from('loyalty_ledger').delete().eq('casino_id', cid);
      await setupClient.from('staff').delete().eq('casino_id', cid);
      await setupClient.from('casino_settings').delete().eq('casino_id', cid);
      await setupClient.from('casino').delete().eq('id', cid);
    }
    if (playerId) await setupClient.from('player').delete().eq('id', playerId);
    if (userId1) await setupClient.auth.admin.deleteUser(userId1);
    if (userId2) await setupClient.auth.admin.deleteUser(userId2);
  }

  return {
    setupClient,
    pitBossClient,
    otherCasinoClient,
    casinoId,
    otherCasinoId,
    pitBossId,
    otherPitBossId,
    couponRefA,
    couponValidationA,
    couponRefB,
    ledgerRefA,
    playerId,
    cleanup,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FulfillmentPayload builders (wired to the seeded instruments)
// ─────────────────────────────────────────────────────────────────────────────

/** A valid entitlement payload pointing at the seeded casino-A coupon. */
export function entitlementPayload(
  fx: Pick<PrintingFixtures, 'couponRefA' | 'couponValidationA'>,
  overrides: Partial<EntitlementFulfillmentPayload> = {},
): EntitlementFulfillmentPayload {
  return {
    family: 'entitlement',
    coupon_id: fx.couponRefA,
    validation_number: fx.couponValidationA,
    reward_id: 'reward-ent-1',
    reward_code: 'MATCH25',
    reward_name: 'Match Play $25',
    face_value_cents: 2500,
    required_match_wager_cents: 2500,
    expires_at: '2026-12-31T23:59:59Z',
    player_name: 'Comp Player',
    player_id: 'player-ext-1',
    player_tier: 'gold',
    casino_name: 'PA Casino A',
    staff_name: 'Print PitBoss',
    issued_at: '2026-06-21T12:00:00Z',
    ...overrides,
  };
}

/** A valid points_comp payload pointing at the seeded casino-A ledger entry. */
export function compPayload(
  fx: Pick<PrintingFixtures, 'ledgerRefA'>,
  overrides: Partial<CompFulfillmentPayload> = {},
): CompFulfillmentPayload {
  return {
    family: 'points_comp',
    ledger_id: fx.ledgerRefA,
    reward_id: 'reward-comp-1',
    reward_code: 'COMP10',
    reward_name: 'Buffet Comp',
    face_value_cents: 1000,
    points_redeemed: 100,
    balance_after: 400,
    player_name: 'Comp Player',
    player_id: 'player-ext-1',
    casino_name: 'PA Casino A',
    staff_name: 'Print PitBoss',
    issued_at: '2026-06-21T12:00:00Z',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Programmable agent clients (spied at the real physical-print boundary)
// ─────────────────────────────────────────────────────────────────────────────

/** A jest mock type for `submitJob` (avoids inferring the jest generic verbosely). */
type SubmitJobMock = jest.Mock<
  (request: AgentPrintJobRequest) => Promise<AgentPrintJobResponse>
>;
type SpoolerSubmitMock = jest.Mock<
  (input: { queue: string; contentType: string; body: string }) => Promise<{
    outcome: 'accepted' | 'completed' | 'rejected';
    jobId?: string;
    reason?: string;
  }>
>;

/** An in-process agent client wired to a simulated spooler, with spies. */
export interface SpiedAgentClient {
  client: LoopbackAgentClient;
  /** Spy on the agent's `submitJob` — the adapter→agent call boundary. */
  submitJobSpy: SubmitJobMock;
  /** Spy on the spooler's `submit` — the true physical-spool boundary. */
  spoolerSpy: SpoolerSubmitMock;
}

/**
 * Build an in-process `LoopbackAgentClient` over a real `createLoopbackAgent`
 * (D5 jobKey dedupe preserved) backed by a deterministic simulated spooler.
 * Both the agent's `submitJob` and the spooler's `submit` are jest spies, so a
 * test can assert physical-once at the real boundaries (exactly_once_nuance).
 */
export function makeInProcessAgentClient(spoolerConfig?: {
  outcome?: 'accepted' | 'completed';
  rejectAll?: boolean;
  rejectReason?: string;
}): SpiedAgentClient {
  const baseSpooler = createSimulatedCupsSpooler(spoolerConfig);
  const spoolerSpy = jest.fn(
    baseSpooler.submit,
  ) as unknown as SpoolerSubmitMock;
  const agent = createLoopbackAgent({ spooler: { submit: spoolerSpy } });
  const submitJobSpy = jest.fn(agent.submitJob) as unknown as SubmitJobMock;

  return {
    client: {
      health: () => agent.health(),
      submitJob: (request: AgentPrintJobRequest) => submitJobSpy(request),
    },
    submitJobSpy,
    spoolerSpy,
  };
}

/** An agent client whose `submitJob` always raises a transport fault (DEC-006). */
export function makeTransportErrorClient(code: AgentTransportErrorCode): {
  client: LoopbackAgentClient;
  submitJobSpy: SubmitJobMock;
} {
  const submitJobSpy = jest.fn(async (_request: AgentPrintJobRequest) => {
    throw new AgentTransportError(code, `simulated ${code}`);
  }) as unknown as SubmitJobMock;

  return {
    client: {
      health: async () => ({ ok: true, host: '127.0.0.1' }),
      submitJob: (request: AgentPrintJobRequest) => submitJobSpy(request),
    },
    submitJobSpy,
  };
}

/** Re-export for specs that need to drive a `rejected` spooler outcome inline. */
export type { SpoolerOutcome };

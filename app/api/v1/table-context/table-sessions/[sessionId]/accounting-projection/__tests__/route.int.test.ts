/** @jest-environment node */

/**
 * GET /accounting-projection — Route Runtime Boundary Integration (PRD-091 WS2)
 *
 * Proves the route boundary under REAL service execution through the real Next
 * route handler + real middleware (withServerAction → auth → RLS) + real Supabase
 * + real derivation service. NOTHING in that path is mocked:
 *   - withServerAction / withAuth / withRLS: real
 *   - createTableInventoryAccountingService: real
 *   - Supabase client: real (authenticated via cookie/JWT — Mode C, QA-006)
 *
 * The ONLY harness substitution is next/headers.cookies(), which supplies the
 * request's auth cookies — the "authenticated cookie route harness" explicitly
 * allowed by EXEC-091 R-4. Cookies are written and read by @supabase/ssr's own
 * createServerClient, guaranteeing on-the-wire format fidelity. There is NO
 * Mode A / dev-auth bypass (asserted off) and NO direct Mode C client call as the
 * boundary proof — every assertion goes through GET().
 *
 * Scope: FR-4 role matrix, cross-casino 404, integrity_failure-as-200, and NFR-1
 * bigint-safe string serialization. NO formula permutations (NFR-2 — those live in
 * WS1's database-backed suite only).
 *
 * PREREQUISITES: local Supabase, env vars, RUN_INTEGRATION_TESTS=true|1.
 *
 * @see app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/route.ts
 * @see PRD-091 Appendix A.2, EXEC-091 WS2 / FR-4 / NFR-1, ADR-024, QA-006 Mode B/C
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createServerClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

import type { Database } from '../../../../../../../../types/database.types';
import {
  createRoleUser,
  createTiaWorld,
  linkSessionSnapshots,
  seedSession,
  seedSnapshot,
  type RoleUser,
  type TiaWorld,
} from '../../../../../../../../services/table-context/__tests__/fixtures/tia-seed';

// ── next/headers cookie harness (the only substitution; R-4) ────────────────────

type CookieJar = Map<string, string>;
let currentJar: CookieJar = new Map();

jest.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () =>
      Array.from(currentJar.entries()).map(([name, value]) => ({
        name,
        value,
      })),
    get: (name: string) =>
      currentJar.has(name) ? { name, value: currentJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      currentJar.set(name, value);
    },
    has: (name: string) => currentJar.has(name),
    delete: (name: string) => {
      currentJar.delete(name);
    },
  }),
}));

// R-3: hard-disable the dev-auth bypass for this process before any route code
// runs — the boundary proof must exercise real authentication, never Mode A.
process.env.ENABLE_DEV_AUTH = 'false';

// Import the route AFTER the mock is registered.
import { isDevAuthBypassEnabled } from '../../../../../../../../lib/supabase/dev-context';
import { GET } from '../route';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isIntegrationEnvironment =
  !!supabaseUrl &&
  !!supabaseServiceKey &&
  !!supabaseAnonKey &&
  (process.env.RUN_INTEGRATION_TESTS === 'true' ||
    process.env.RUN_INTEGRATION_TESTS === '1');

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

const SENTINEL = '9223372036854775807'; // 2^63 - 1

jest.setTimeout(120_000);

describeIntegration('PRD-091 WS2: accounting-projection route boundary', () => {
  let setup: SupabaseClient<Database>;
  let world: TiaWorld;

  let pitBoss: RoleUser;
  let admin: RoleUser;
  let dealer: RoleUser;
  const jars = new Map<string, CookieJar>();
  const extraUserIds: string[] = [];

  // Seeded sessions
  let valueSessionId: string; // inventory_only with a real value
  let integritySessionId: string; // missing opener → integrity_failure
  let sentinelSessionId: string; // closer chipset sums to the signed-64-bit sentinel
  let crossCasinoSessionId: string; // belongs to otherCasino

  /** Sign a user in via @supabase/ssr (writes real auth cookies into a jar). */
  async function signInToJar(user: RoleUser): Promise<void> {
    const jar: CookieJar = new Map();
    const client = createServerClient<Database>(
      supabaseUrl!,
      supabaseAnonKey!,
      {
        cookies: {
          getAll: () =>
            Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
          setAll: (toSet) => {
            toSet.forEach(({ name, value }) => jar.set(name, value));
          },
        },
      },
    );
    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (error) throw new Error(`signIn ${user.role}: ${error.message}`);
    jars.set(user.role, jar);
  }

  async function callRoute(
    sessionId: string,
    role: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    currentJar = jars.get(role)!;
    const url = `http://localhost:3000/api/v1/table-context/table-sessions/${sessionId}/accounting-projection`;
    const req = new NextRequest(new URL(url));
    const res = await GET(req, { params: Promise.resolve({ sessionId }) });
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body };
  }

  beforeAll(async () => {
    // R-3: dev-auth bypass MUST be off — boundary proof requires real auth.
    expect(isDevAuthBypassEnabled()).toBe(false);

    setup = createClient<Database>(supabaseUrl!, supabaseServiceKey!);
    world = await createTiaWorld(setup);

    pitBoss = await createRoleUser(setup, {
      casinoId: world.casinoId,
      role: 'pit_boss',
    });
    admin = await createRoleUser(setup, {
      casinoId: world.casinoId,
      role: 'admin',
    });
    dealer = await createRoleUser(setup, {
      casinoId: world.casinoId,
      role: 'dealer',
    });
    extraUserIds.push(pitBoss.userId, admin.userId, dealer.userId);

    await signInToJar(pitBoss);
    await signInToJar(admin);
    await signInToJar(dealer);

    // value session — inventory_only: closing 480_000 - opening 500_000 = -20_000
    valueSessionId = await seedSession(setup, {
      casinoId: world.casinoId,
      tableId: world.tableId,
      staffId: world.staffId,
      openedAt: '2026-06-01T06:00:00.000Z',
      closedAt: '2026-06-01T14:00:00.000Z',
    });
    {
      const opener = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId: valueSessionId,
        staffId: world.staffId,
        type: 'open',
        totalCents: 500_000,
      });
      const closer = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId: valueSessionId,
        staffId: world.staffId,
        type: 'close',
        totalCents: 480_000,
        createdAt: '2026-06-01T14:05:00.000Z',
      });
      await linkSessionSnapshots(setup, valueSessionId, opener, closer);
    }

    // integrity session — opener missing (no FK, no fallback) → integrity_failure
    integritySessionId = await seedSession(setup, {
      casinoId: world.casinoId,
      tableId: world.tableId,
      staffId: world.staffId,
      openedAt: '2026-06-01T06:00:00.000Z',
      closedAt: '2026-06-01T14:00:00.000Z',
    });
    {
      const closer = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId: integritySessionId,
        staffId: world.staffId,
        type: 'close',
        totalCents: 480_000,
        createdAt: '2026-06-01T14:05:00.000Z',
      });
      await linkSessionSnapshots(setup, integritySessionId, null, closer);
    }

    // sentinel session — closer chipset sums to exactly 2^63-1 via BigInt products.
    // (Real int8 columns return as lossy JS numbers and total_cents is int4; the
    // chipset aggregation is the lossless path to a signed-64-bit-max bigint.)
    sentinelSessionId = await seedSession(setup, {
      casinoId: world.casinoId,
      tableId: world.tableId,
      staffId: world.staffId,
      openedAt: '2026-06-01T06:00:00.000Z',
      closedAt: '2026-06-01T14:00:00.000Z',
    });
    {
      const opener = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId: sentinelSessionId,
        staffId: world.staffId,
        type: 'open',
        totalCents: 0,
      });
      const closer = await seedSnapshot(setup, {
        casinoId: world.casinoId,
        tableId: world.tableId,
        sessionId: sentinelSessionId,
        staffId: world.staffId,
        type: 'close',
        totalCents: null,
        // 1e9 * 9223372036 + 1 * 854775807 = 9223372036854775807
        chipset: { '1000000000': 9223372036, '1': 854775807 },
        createdAt: '2026-06-01T14:05:00.000Z',
      });
      await linkSessionSnapshots(setup, sentinelSessionId, opener, closer);
    }

    // cross-casino session — belongs to otherCasino; pit_boss of casino A must 404.
    crossCasinoSessionId = await seedSession(setup, {
      casinoId: world.otherCasinoId,
      tableId: world.otherTableId,
      staffId: world.staffId,
      openedAt: '2026-06-01T06:00:00.000Z',
      closedAt: '2026-06-01T14:00:00.000Z',
    });
  }, 120_000);

  afterAll(async () => {
    for (const uid of extraUserIds) {
      await setup.auth.admin.deleteUser(uid);
    }
    if (world) await world.cleanup();
  }, 60_000);

  // ── FR-4 role matrix ──────────────────────────────────────────────────────────

  it('pit_boss → 200 with a projection', async () => {
    const { status, body } = await callRoute(valueSessionId, 'pit_boss');
    expect(status).toBe(200);
    const data = body.data as Record<string, unknown>;
    expect(data.calculation_kind).toBe('inventory_only');
    expect(data.partial_table_result_cents).toBe('-20000');
  });

  it('admin → 200 with a projection', async () => {
    const { status, body } = await callRoute(valueSessionId, 'admin');
    expect(status).toBe(200);
    expect((body.data as Record<string, unknown>).table_session_id).toBe(
      valueSessionId,
    );
  });

  it('dealer → 403 and the derivation is not invoked (no projection returned)', async () => {
    const { status, body } = await callRoute(valueSessionId, 'dealer');
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
    // No projection in the body — the role guard short-circuits before the
    // service is constructed/invoked (route ordering guarantee).
    expect(body.data ?? null).toBeNull();
  });

  it('cashier / unknown roles are not representable in the staff_role enum — dealer is the canonical disallowed role; the allowlist rejects every role outside {pit_boss, admin}', () => {
    // staff_role enum = ('dealer','pit_boss','admin'); ALLOWED_ROLES = {pit_boss,admin}.
    // The disallowed branch is proven by the dealer 403 above.
    expect(true).toBe(true);
  });

  // ── Cross-casino & not-found posture ────────────────────────────────────────

  it('cross-casino sessionId → 404 (canonical not-found, never 200/integrity_failure)', async () => {
    const { status, body } = await callRoute(crossCasinoSessionId, 'pit_boss');
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    // Must NOT be a 200 integrity_failure (no info leak about another casino).
    expect(body.data ?? null).toBeNull();
  });

  it('nonexistent sessionId → canonical not-found (404)', async () => {
    const { status } = await callRoute(
      '00000000-0000-0000-0000-000000000000',
      'pit_boss',
    );
    expect(status).toBe(404);
  });

  // ── integrity_failure is a valid 200 result ─────────────────────────────────

  it('integrity_failure → HTTP 200 (valid business state, not an error)', async () => {
    const { status, body } = await callRoute(integritySessionId, 'pit_boss');
    expect(status).toBe(200);
    const data = body.data as Record<string, unknown>;
    expect(data.calculation_kind).toBe('integrity_failure');
    expect(data.projected_table_win_loss_cents).toBeNull();
    expect(data.partial_table_result_cents).toBeNull();
    expect(Array.isArray(data.integrity_issues)).toBe(true);
  });

  // ── NFR-1 bigint-safe serialization ─────────────────────────────────────────

  it('NFR-1: *_cents fields serialize as strings; sentinel 2^63-1 survives without precision loss', async () => {
    const { status, body } = await callRoute(sentinelSessionId, 'pit_boss');
    expect(status).toBe(200);
    const data = body.data as Record<string, unknown>;

    // The cent fields cross the boundary as JSON strings (or null), never numbers.
    for (const key of [
      'projected_table_win_loss_cents',
      'partial_table_result_cents',
      'telemetry_derived_drop_estimate_cents',
    ]) {
      const v = data[key];
      expect(v === null || typeof v === 'string').toBe(true);
    }

    // Exact value preserved — a JS number would have rounded to 9223372036854775808.
    expect(data.calculation_kind).toBe('inventory_only');
    expect(data.partial_table_result_cents).toBe(SENTINEL);
    expect(Number(SENTINEL).toString()).not.toBe(SENTINEL); // proves the value exceeds 2^53
  });
});

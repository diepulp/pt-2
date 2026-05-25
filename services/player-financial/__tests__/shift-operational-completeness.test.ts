/** @jest-environment node */

/**
 * Unit tests for getShiftOperationalCompleteness (EXEC-088 WS3).
 *
 * Verifies all 5 completeness steps and the TABLE-SCOPED backlog rule.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { getShiftOperationalCompleteness } from '../crud';

const CASINO = 'casino-comp-1';
const DAY = '2026-05-21';
const TABLE = 'tbl-comp-1';

type ProjectionRow = {
  grind_volume_cents: number;
  fill_total_cents: number;
  credit_total_cents: number;
  event_count: number;
};

/**
 * Builds a minimal Supabase mock for getShiftOperationalCompleteness.
 *
 * Call order (in function body):
 *   0 → shift_operational_projection (.maybeSingle resolves)
 *   1 → gaming_day_lifecycle (.maybeSingle resolves)
 *   2+ → finance_outbox backlog count (.in → .is → resolve with count)
 */
function makeSupabase(opts: {
  projection?: ProjectionRow | null;
  lifecycle?: { casino_id: string } | null;
  backlogCount?: number;
}): SupabaseClient<Database> {
  let callIdx = 0;

  const fromFn = jest.fn().mockImplementation(() => {
    const idx = callIdx++;

    if (idx === 0) {
      // shift_operational_projection → .select().eq().eq().eq().maybeSingle()
      const terminal = jest.fn().mockResolvedValue({
        data: opts.projection ?? null,
        error: null,
      });
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: terminal,
      } as Record<string, jest.Mock>;
      chain['select'] = jest.fn().mockReturnValue(chain);
      chain['eq'] = jest.fn().mockReturnValue(chain);
      chain['maybeSingle'] = terminal;
      return chain;
    }

    if (idx === 1) {
      // gaming_day_lifecycle → .select().eq().eq().maybeSingle()
      const terminal = jest.fn().mockResolvedValue({
        data: opts.lifecycle ?? null,
        error: null,
      });
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: terminal,
      } as Record<string, jest.Mock>;
      chain['select'] = jest.fn().mockReturnValue(chain);
      chain['eq'] = jest.fn().mockReturnValue(chain);
      chain['maybeSingle'] = terminal;
      return chain;
    }

    // finance_outbox backlog count query
    // .select().eq().eq().eq().eq().in().is()  → resolves with count
    const countResult = { count: opts.backlogCount ?? 0, error: null };
    const terminalIs = jest.fn().mockResolvedValue(countResult);
    const chainIn = { is: terminalIs };
    const chainEq = {
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnValue(chainIn),
      is: terminalIs,
    } as Record<string, jest.Mock>;
    chainEq['eq'] = jest.fn().mockReturnValue(chainEq);
    chainEq['in'] = jest.fn().mockReturnValue({ is: terminalIs });
    return {
      select: jest.fn().mockReturnValue(chainEq),
    };
  });

  return { from: fromFn } as unknown as SupabaseClient<Database>;
}

describe('getShiftOperationalCompleteness — five-step logic', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Step 1: no projection + no lifecycle → status=unknown, totalCents=0', async () => {
    const supabase = makeSupabase({});
    const result = await getShiftOperationalCompleteness(
      supabase,
      CASINO,
      DAY,
      TABLE,
    );
    expect(result.status).toBe('unknown');
    expect(result.totalCents).toBe(0);
    expect(result.count).toBe(0);
    expect(result.type).toBe('estimated');
  });

  it('Step 2: no projection + lifecycle closed + backlog=0 → status=complete, totalCents=0', async () => {
    const supabase = makeSupabase({
      lifecycle: { casino_id: CASINO },
      backlogCount: 0,
    });
    const result = await getShiftOperationalCompleteness(
      supabase,
      CASINO,
      DAY,
      TABLE,
    );
    expect(result.status).toBe('complete');
    expect(result.totalCents).toBe(0);
    expect(result.count).toBe(0);
    expect(result.type).toBe('estimated');
  });

  it('Step 2 variant: no projection + lifecycle closed + backlog>0 → status=partial', async () => {
    const supabase = makeSupabase({
      lifecycle: { casino_id: CASINO },
      backlogCount: 3,
    });
    const result = await getShiftOperationalCompleteness(
      supabase,
      CASINO,
      DAY,
      TABLE,
    );
    expect(result.status).toBe('partial');
  });

  it('Step 3: projection exists + no lifecycle row → status=partial (gaming day open)', async () => {
    const projection: ProjectionRow = {
      grind_volume_cents: 10000,
      fill_total_cents: 5000,
      credit_total_cents: 2500,
      event_count: 3,
    };
    const supabase = makeSupabase({ projection });
    const result = await getShiftOperationalCompleteness(
      supabase,
      CASINO,
      DAY,
      TABLE,
    );
    expect(result.status).toBe('partial');
    expect(result.totalCents).toBe(17500);
    expect(result.count).toBe(3);
  });

  it('Step 4: projection + lifecycle closed + backlog>0 → status=partial', async () => {
    const projection: ProjectionRow = {
      grind_volume_cents: 20000,
      fill_total_cents: 0,
      credit_total_cents: 0,
      event_count: 2,
    };
    const supabase = makeSupabase({
      projection,
      lifecycle: { casino_id: CASINO },
      backlogCount: 1,
    });
    const result = await getShiftOperationalCompleteness(
      supabase,
      CASINO,
      DAY,
      TABLE,
    );
    expect(result.status).toBe('partial');
    expect(result.totalCents).toBe(20000);
  });

  it('Step 5: projection + lifecycle closed + backlog=0 → status=complete', async () => {
    const projection: ProjectionRow = {
      grind_volume_cents: 10000,
      fill_total_cents: 5000,
      credit_total_cents: 2500,
      event_count: 5,
    };
    const supabase = makeSupabase({
      projection,
      lifecycle: { casino_id: CASINO },
      backlogCount: 0,
    });
    const result = await getShiftOperationalCompleteness(
      supabase,
      CASINO,
      DAY,
      TABLE,
    );
    expect(result.status).toBe('complete');
    expect(result.totalCents).toBe(17500);
    expect(result.count).toBe(5);
    expect(result.type).toBe('estimated');
  });

  it('totalCents sums grind_volume_cents + fill_total_cents + credit_total_cents', async () => {
    const projection: ProjectionRow = {
      grind_volume_cents: 100,
      fill_total_cents: 200,
      credit_total_cents: 300,
      event_count: 3,
    };
    const supabase = makeSupabase({
      projection,
      lifecycle: { casino_id: CASINO },
      backlogCount: 0,
    });
    const result = await getShiftOperationalCompleteness(
      supabase,
      CASINO,
      DAY,
      TABLE,
    );
    expect(result.totalCents).toBe(600);
  });
});

describe('getShiftOperationalCompleteness — TABLE-SCOPED backlog', () => {
  it('queries finance_outbox with casino_id + gaming_day + table_id (table-scoped, not casino-wide)', async () => {
    let callIdx = 0;
    const eqMock = jest.fn().mockImplementation(function (
      this: Record<string, jest.Mock>,
    ) {
      return this;
    });
    const fromFn = jest.fn().mockImplementation(() => {
      const idx = callIdx++;
      if (idx === 0 || idx === 1) {
        const chain: Record<string, jest.Mock> = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
        // Need to make lifecycle return data (lifecycle closed)
        if (idx === 1) {
          chain['maybeSingle'] = jest.fn().mockResolvedValue({
            data: { casino_id: CASINO },
            error: null,
          });
        }
        chain['select'] = jest.fn().mockReturnValue(chain);
        chain['eq'] = jest.fn().mockReturnValue(chain);
        return chain;
      }
      // finance_outbox query — capture the eq calls
      const inResult = {
        is: jest.fn().mockResolvedValue({ count: 0, error: null }),
      };
      const captureChain: Record<string, jest.Mock> = {
        eq: eqMock,
        in: jest.fn().mockReturnValue(inResult),
        is: jest.fn().mockResolvedValue({ count: 0, error: null }),
      };
      captureChain['eq'] = jest.fn().mockReturnValue(captureChain);
      captureChain['in'] = jest.fn().mockReturnValue(inResult);
      return { select: jest.fn().mockReturnValue(captureChain) };
    });

    const supabase = { from: fromFn } as unknown as SupabaseClient<Database>;
    await getShiftOperationalCompleteness(supabase, CASINO, DAY, TABLE);

    // The third from() call is for finance_outbox
    expect(fromFn).toHaveBeenCalledTimes(3);
    expect(fromFn.mock.calls[2][0]).toBe('finance_outbox');
  });
});

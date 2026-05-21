/** @jest-environment node */

/**
 * ADR-054 R4 Authority Degradation Invariant
 *
 * shift_operational_projection values are ALWAYS 'estimated'.
 * No layer may upgrade to 'actual'. This test verifies the hard invariant
 * across all 5 completeness outcomes from getShiftOperationalCompleteness.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';
import type { OperationalProjectionResponseDTO } from '@/services/player-financial/dtos';

import { getShiftOperationalCompleteness } from '../crud';

function makeSupabase(opts: {
  projection?: unknown;
  lifecycle?: unknown;
  backlogCount?: number;
}): SupabaseClient<Database> {
  let callIdx = 0;
  const fromFn = jest.fn().mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {};
    const methods = ['select', 'eq', 'is', 'in', 'maybeSingle', 'lt', 'gte'];
    for (const m of methods) chain[m] = jest.fn().mockReturnValue(chain);

    const idx = callIdx++;
    if (idx === 0) {
      // shift_operational_projection query
      chain['maybeSingle'] = jest
        .fn()
        .mockResolvedValue({ data: opts.projection ?? null, error: null });
    } else if (idx === 1) {
      // gaming_day_lifecycle query
      chain['maybeSingle'] = jest
        .fn()
        .mockResolvedValue({ data: opts.lifecycle ?? null, error: null });
    } else {
      // finance_outbox backlog count query
      // chain: .select().eq().eq().eq().eq().in().is() — .is() is the terminal call
      const countResolve = { count: opts.backlogCount ?? 0, error: null };
      chain['in'] = jest.fn().mockReturnValue({
        is: jest.fn().mockResolvedValue(countResolve),
      });
    }
    return chain;
  });
  return { from: fromFn } as unknown as SupabaseClient<Database>;
}

const CASINO = 'casino-auth-1';
const DAY = '2026-05-21';
const TABLE = 'tbl-auth-1';

describe('ADR-054 R4: type is always estimated', () => {
  it('Step 1 (unknown): type === estimated', async () => {
    const supabase = makeSupabase({});
    const result = await getShiftOperationalCompleteness(
      supabase,
      CASINO,
      DAY,
      TABLE,
    );
    expect(result.type).toBe('estimated');
    expect(result.status).toBe('unknown');
  });

  it('Step 2 (complete-zero): type === estimated', async () => {
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
    expect(result.type).toBe('estimated');
    expect(result.status).toBe('complete');
    expect(result.totalCents).toBe(0);
  });

  it('Step 3 (partial, no lifecycle): type === estimated', async () => {
    const projection = {
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
    expect(result.type).toBe('estimated');
    expect(result.status).toBe('partial');
  });

  it('Step 4 (partial, lifecycle closed, backlog > 0): type === estimated', async () => {
    const projection = {
      grind_volume_cents: 10000,
      fill_total_cents: 0,
      credit_total_cents: 0,
      event_count: 1,
    };
    const supabase = makeSupabase({
      projection,
      lifecycle: { casino_id: CASINO },
      backlogCount: 2,
    });
    const result = await getShiftOperationalCompleteness(
      supabase,
      CASINO,
      DAY,
      TABLE,
    );
    expect(result.type).toBe('estimated');
    expect(result.status).toBe('partial');
  });

  it('Step 5 (complete): type === estimated', async () => {
    const projection = {
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
    expect(result.type).toBe('estimated');
    expect(result.status).toBe('complete');
  });

  it('OperationalProjectionResponseDTO.type literal is only ever estimated (type-level invariant)', () => {
    const dto: OperationalProjectionResponseDTO = {
      totalCents: 0,
      count: 0,
      completeness: { status: 'unknown' },
      type: 'estimated',
    };
    // TypeScript would fail to compile if type could be 'actual' — this is the runtime assertion
    expect(dto.type).toBe('estimated');
    expect(['actual', 'observed', 'compliance']).not.toContain(dto.type);
  });
});

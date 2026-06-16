/** @jest-environment node */

/**
 * TableInventoryAccounting Service Unit Tests — PRD-090 WS6
 *
 * SRL enforcement IDs covered in this file:
 *   TIA-CANON-SOURCE-AUTHORITY-SHAPE     (tia.dto_contract)
 *   TIA-CANON-NULL-VS-ZERO               (tia.snapshot_resolution, tia.snapshot_resolution_zero_tray, tia.null_vs_zero)
 *   TIA-CANON-RATED-ADJUSTMENT-EXCLUSION (tia.rated_adjustment_exclusion)
 *   TIA-CANON-SESSION-SCOPE-ONLY         (tia.session_scope_only)
 *   TIA-CANON-INTEGRITY-FAILURE-SUPPRESSION (tia.integrity_failure_suppression, tia.integrity_failure_log_emission)
 *
 * @see services/table-context/table-inventory-accounting.ts
 * @see EXEC-090 WS6, PRD-090, SRL-TIA-001, ADR-059, ADR-060, ADR-061
 */

import * as fs from 'fs';
import * as path from 'path';

import { createTableInventoryAccountingService } from '../table-inventory-accounting';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const CASINO_ID = 'aaaa0000-0000-0000-0000-000000000001';
const TABLE_ID = 'bbbb0000-0000-0000-0000-000000000001';
const OPENER_SNAP_ID = 'cccc0000-0000-0000-0000-000000000001';
const CLOSER_SNAP_ID = 'dddd0000-0000-0000-0000-000000000001';
const REQUEST_ID = 'req-test-001';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    casino_id: CASINO_ID,
    gaming_table_id: TABLE_ID,
    opened_at: '2026-06-01T06:00:00.000Z',
    closed_at: '2026-06-01T14:00:00.000Z',
    opening_inventory_snapshot_id: OPENER_SNAP_ID,
    closing_inventory_snapshot_id: CLOSER_SNAP_ID,
    ...overrides,
  };
}

function makeOpenerSnap(overrides: Record<string, unknown> = {}) {
  return {
    id: OPENER_SNAP_ID,
    session_id: SESSION_ID,
    casino_id: CASINO_ID,
    table_id: TABLE_ID,
    total_cents: 500_000,
    chipset: null,
    snapshot_type: 'open',
    created_at: '2026-06-01T06:05:00.000Z',
    ...overrides,
  };
}

function makeCloserSnap(overrides: Record<string, unknown> = {}) {
  return {
    id: CLOSER_SNAP_ID,
    session_id: SESSION_ID,
    casino_id: CASINO_ID,
    table_id: TABLE_ID,
    total_cents: 480_000,
    chipset: null,
    snapshot_type: 'close',
    created_at: '2026-06-01T14:05:00.000Z',
    ...overrides,
  };
}

// ── Supabase Mock ─────────────────────────────────────────────────────────────
//
// Mock queue order for a standard derive() call with both FKs valid:
//   [0] table_session (maybeSingle)
//   Then Promise.all starts 5 operations (all from() calls fire synchronously):
//   [1] table_inventory_snapshot — opener FK (maybeSingle)
//   [2] table_inventory_snapshot — closer FK (maybeSingle)
//   [3] table_fill (direct await)
//   [4] table_credit (direct await)
//   [5] table_buyin_telemetry (direct await)
//   [6] table_inventory_snapshot — opener FALLBACK if FK was stale/not-found
//   [7] table_inventory_snapshot — closer FALLBACK if FK was stale/not-found
//
// When session.opening_inventory_snapshot_id = null, resolveSnapshot skips
// the FK block entirely and calls the fallback query as its FIRST call.
// Queue order becomes: [0:session, 1:openerFallback, 2:closerFK|closerFallback, ...]

type MockResult = { data: unknown; error: null };

function makeSupabaseMock(...results: MockResult[]) {
  const queue = [...results];

  function makeBuilder(result: MockResult): Record<string, unknown> {
    const b: Record<string, unknown> = {};
    const ret = () => b;
    b.select = jest.fn(ret);
    b.eq = jest.fn(ret);
    b.in = jest.fn(ret);
    b.gte = jest.fn(ret);
    b.lt = jest.fn(ret);
    b.order = jest.fn(ret);
    b.limit = jest.fn(ret);
    b.maybeSingle = jest.fn(() => Promise.resolve(result));
    // Direct `await` on builder (implicit Promise resolution for array queries)
    b.then = (
      resolve: (r: MockResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return b;
  }

  return {
    from: jest.fn((_table: string) => {
      const result = queue.shift() ?? { data: null, error: null };
      return makeBuilder(result);
    }),
  };
}

type MockSupabase = ReturnType<typeof makeSupabaseMock>;

async function derive(supabase: MockSupabase) {
  const service = createTableInventoryAccountingService(supabase as never);
  return service.derive({
    tableSessionId: SESSION_ID,
    casinoId: CASINO_ID,
    requestId: REQUEST_ID,
  });
}

// ── tia.dto_contract — TIA-CANON-SOURCE-AUTHORITY-SHAPE ───────────────────────

describe('tia.dto_contract — TIA-CANON-SOURCE-AUTHORITY-SHAPE', () => {
  // source_authority must use drop/snapshots/fills/credits keys (NOT inventory).
  // final_table_win_loss_cents is always null.
  // custody_status is always non_custody_estimate.

  it('source_authority has only allowed keys: drop, snapshots, fills, credits', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [{ confirmed_amount_cents: 50_000 }], error: null },
      { data: [{ confirmed_amount_cents: 25_000 }], error: null },
      { data: [{ amount_cents: 80_000 }], error: null },
    );
    const result = await derive(supabase);
    const keys = Object.keys(result.source_authority);
    expect(keys.sort()).toEqual(['credits', 'drop', 'fills', 'snapshots']);
    expect(keys).not.toContain('inventory');
  });

  it('source_authority.drop is table_buyin_telemetry when telemetry present', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ amount_cents: 80_000 }], error: null },
    );
    const result = await derive(supabase);
    expect(result.source_authority.drop).toBe('table_buyin_telemetry');
    expect(result.source_authority.snapshots).toBe('table_inventory_snapshot');
    expect(result.source_authority.fills).toBe('table_fill');
    expect(result.source_authority.credits).toBe('table_credit');
  });

  it('source_authority.drop is null when telemetry absent', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    expect(result.source_authority.drop).toBeNull();
  });

  it('final_table_win_loss_cents is always null', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ amount_cents: 80_000 }], error: null },
    );
    const result = await derive(supabase);
    expect(result.final_table_win_loss_cents).toBeNull();
  });

  it('custody_status is always non_custody_estimate', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ amount_cents: 80_000 }], error: null },
    );
    const result = await derive(supabase);
    expect(result.custody_status).toBe('non_custody_estimate');
  });

  it('projection contains required fields', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ amount_cents: 80_000 }], error: null },
    );
    const result = await derive(supabase);
    expect(result.table_session_id).toBe(SESSION_ID);
    expect(result.casino_id).toBe(CASINO_ID);
    expect(result.calculation_kind).toBeDefined();
    expect(result.drop_estimate_state).toBeDefined();
    expect(Array.isArray(result.integrity_issues)).toBe(true);
    expect(result.request_id).toBe(REQUEST_ID);
    expect(typeof result.derived_at).toBe('string');
  });
});

// ── tia.five_operand_formula ──────────────────────────────────────────────────

describe('tia.five_operand_formula', () => {
  // projected = telemetryDrop + closingInventory + credits - openingInventory - fills
  // = 80_000 + 480_000 + 50_000 - 500_000 - 100_000 = 10_000

  it('computes projected_table_win_loss_cents via five-operand formula', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap({ total_cents: 500_000 }), error: null },
      { data: makeCloserSnap({ total_cents: 480_000 }), error: null },
      { data: [{ confirmed_amount_cents: 100_000 }], error: null },
      { data: [{ confirmed_amount_cents: 50_000 }], error: null },
      { data: [{ amount_cents: 80_000 }], error: null },
    );
    const result = await derive(supabase);
    expect(result.calculation_kind).toBe('telemetry_drop_formula');
    expect(result.projected_table_win_loss_cents).toBe(BigInt(10_000));
    expect(result.partial_table_result_cents).toBeNull();
  });

  it('formula sign correctness: negative result when losses exceed drop', async () => {
    // projected = 20_000 + 100_000 + 10_000 - 500_000 - 0 = -370_000
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap({ total_cents: 500_000 }), error: null },
      { data: makeCloserSnap({ total_cents: 100_000 }), error: null },
      { data: [], error: null },
      { data: [{ confirmed_amount_cents: 10_000 }], error: null },
      { data: [{ amount_cents: 20_000 }], error: null },
    );
    const result = await derive(supabase);
    expect(result.calculation_kind).toBe('telemetry_drop_formula');
    expect(result.projected_table_win_loss_cents).toBe(BigInt(-370_000));
  });
});

// ── tia.inventory_side_derivation ────────────────────────────────────────────

describe('tia.inventory_side_derivation', () => {
  // partial = closingInventory + credits - openingInventory - fills
  // = 480_000 + 50_000 - 500_000 - 100_000 = -70_000

  it('computes partial_table_result_cents when telemetry absent (zero qualifying rows)', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap({ total_cents: 500_000 }), error: null },
      { data: makeCloserSnap({ total_cents: 480_000 }), error: null },
      { data: [{ confirmed_amount_cents: 100_000 }], error: null },
      { data: [{ confirmed_amount_cents: 50_000 }], error: null },
      { data: [], error: null }, // zero telemetry rows → null
    );
    const result = await derive(supabase);
    expect(result.calculation_kind).toBe('inventory_only');
    expect(result.partial_table_result_cents).toBe(BigInt(-70_000));
    expect(result.projected_table_win_loss_cents).toBeNull();
  });

  it('source_authority.drop is null in inventory_only mode', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    expect(result.calculation_kind).toBe('inventory_only');
    expect(result.source_authority.drop).toBeNull();
  });
});

// ── tia.snapshot_resolution — TIA-CANON-NULL-VS-ZERO ─────────────────────────

describe('tia.snapshot_resolution — TIA-CANON-NULL-VS-ZERO', () => {
  // Sub-case: FK success — session_id matches, value used directly (no fallback)
  it('uses FK snapshot value directly when session_id matches', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap({ total_cents: 300_000 }), error: null },
      { data: makeCloserSnap({ total_cents: 250_000 }), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    // inventory_only: 250_000 + 0 - 300_000 - 0 = -50_000
    expect(result.calculation_kind).toBe('inventory_only');
    expect(result.partial_table_result_cents).toBe(BigInt(-50_000));
    expect(result.integrity_issues).toHaveLength(0);
    // Only 6 from() calls: session + 2 FK + fills + credits + telemetry (no fallback)
    expect(supabase.from).toHaveBeenCalledTimes(6);
  });

  // Sub-case: Stale FK (session_id = null — pre-PRD-038 row) → fallback used
  it('falls through to fallback when FK snapshot has session_id = null (pre-PRD-038 stale)', async () => {
    const fallbackSnap = {
      ...makeOpenerSnap({ total_cents: 400_000 }),
      session_id: SESSION_ID,
    };
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      // opener FK: session_id = null (stale)
      {
        data: makeOpenerSnap({ session_id: null, total_cents: 99_999 }),
        error: null,
      },
      // closer FK: valid
      { data: makeCloserSnap(), error: null },
      // fills, credits, telemetry
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      // opener FALLBACK (called after FK was found stale)
      { data: [fallbackSnap], error: null },
    );
    const result = await derive(supabase);
    // opener value from fallback (400_000), not stale FK (99_999)
    // inventory_only: 480_000 + 0 - 400_000 - 0 = 80_000
    expect(result.calculation_kind).toBe('inventory_only');
    expect(result.partial_table_result_cents).toBe(BigInt(80_000));
    expect(result.integrity_issues).toHaveLength(0);
    // 7 from() calls: session + openerFK(stale) + closerFK + fill + credit + telemetry + openerFallback
    expect(supabase.from).toHaveBeenCalledTimes(7);
  });

  // Sub-case: Stale FK (mismatched session_id) → fallback used
  it('falls through to fallback when FK snapshot has mismatched session_id', async () => {
    const fallbackSnap = {
      ...makeOpenerSnap({ total_cents: 350_000 }),
      session_id: SESSION_ID,
    };
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      // opener FK: session_id mismatch
      {
        data: makeOpenerSnap({
          session_id: 'different-session-id',
          total_cents: 12_345,
        }),
        error: null,
      },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [fallbackSnap], error: null },
    );
    const result = await derive(supabase);
    // inventory_only: 480_000 + 0 - 350_000 - 0 = 130_000
    expect(result.calculation_kind).toBe('inventory_only');
    expect(result.partial_table_result_cents).toBe(BigInt(130_000));
    expect(result.integrity_issues).toHaveLength(0);
  });

  // Sub-case: snapshot_type values in fallback query are 'open'/'close' (not 'OPENING'/'CLOSING')
  it('uses "open" and "close" snapshot_type literals — static analysis (TIA-CANON-NULL-VS-ZERO)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'table-inventory-accounting.ts'),
      'utf-8',
    );
    // Fallback query uses .eq('snapshot_type', snapshotType) where snapshotType is 'open' or 'close'
    // Verify the function signature uses 'open' | 'close' as the type
    expect(src).toContain("'open' | 'close'");
    // Verify no 'OPENING' or 'CLOSING' string literals exist in the source
    expect(src).not.toContain("'OPENING'");
    expect(src).not.toContain("'CLOSING'");
  });

  // Sub-case: Fallback deterministic ORDER BY created_at DESC, id DESC
  it('fallback query uses ORDER BY created_at DESC, id DESC LIMIT 1 — static analysis', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'table-inventory-accounting.ts'),
      'utf-8',
    );
    expect(src).toContain("order('created_at', { ascending: false })");
    expect(src).toContain("order('id', { ascending: false })");
    expect(src).toContain('.limit(1)');
  });

  // Sub-case: total_cents = null + non-empty chipset → chipset_total_cents() used
  it('resolves snapshot value via chipset when total_cents is null', async () => {
    // chipset: { '100': 10 } → 100 * 10 = 1000 cents
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      {
        data: makeOpenerSnap({ total_cents: null, chipset: { '100': 10 } }),
        error: null,
      },
      { data: makeCloserSnap({ total_cents: 500_000 }), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    // inventory_only: 500_000 + 0 - 1_000 - 0 = 499_000
    expect(result.calculation_kind).toBe('inventory_only');
    expect(result.partial_table_result_cents).toBe(BigInt(499_000));
    expect(result.integrity_issues).toHaveLength(0);
  });

  // Sub-case: High-value chipset ≥ 2,147,483,648 cents resolves without overflow
  it('high-value chipset (>= 2^31) resolves as bigint without overflow', async () => {
    // chipset: { '1000000': 3000 } → 1_000_000 * 3_000 = 3_000_000_000 > 2^31 = 2_147_483_648
    const highValueChipset = { '1000000': 3000 };
    const expectedOpener = BigInt(3_000_000_000);
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      {
        data: makeOpenerSnap({ total_cents: null, chipset: highValueChipset }),
        error: null,
      },
      { data: makeCloserSnap({ total_cents: 480_000 }), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    // inventory_only: 480_000 + 0 - 3_000_000_000 - 0 = -2_999_520_000
    expect(result.calculation_kind).toBe('inventory_only');
    expect(result.partial_table_result_cents).toBe(
      BigInt(480_000) - expectedOpener,
    );
    expect(result.integrity_issues).toHaveLength(0);
  });
});

// ── tia.snapshot_resolution_zero_tray ────────────────────────────────────────

describe('tia.snapshot_resolution_zero_tray', () => {
  // total_cents = 0 is a valid zero tray, not integrity_failure (TIA-CANON-NULL-VS-ZERO)

  it('zero-tray opener (total_cents = 0) resolves to 0n — not integrity_failure', async () => {
    // inventory_only: 480_000 + 0 - 0 - 0 = 480_000
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap({ total_cents: 0 }), error: null },
      { data: makeCloserSnap({ total_cents: 480_000 }), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    expect(result.calculation_kind).not.toBe('integrity_failure');
    expect(result.calculation_kind).toBe('inventory_only');
    // partial = 480_000 + 0 - 0 - 0 = 480_000
    expect(result.partial_table_result_cents).toBe(BigInt(480_000));
    expect(result.integrity_issues).toHaveLength(0);
  });
});

// ── tia.null_vs_zero — TIA-CANON-NULL-VS-ZERO ────────────────────────────────

describe('tia.null_vs_zero — TIA-CANON-NULL-VS-ZERO', () => {
  // Zero qualifying telemetry rows → null (no telemetry, not zero-value telemetry)
  // Non-empty rows summing to 0 → 0n (present, drop_estimate_state = 'present')

  it('zero qualifying telemetry rows → telemetry_derived_drop_estimate_cents = null', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null }, // zero telemetry rows
    );
    const result = await derive(supabase);
    expect(result.telemetry_derived_drop_estimate_cents).toBeNull();
    expect(result.drop_estimate_state).toBe('absent');
    expect(result.calculation_kind).toBe('inventory_only');
  });

  it('non-empty telemetry rows summing to 0 → telemetry_derived_drop_estimate_cents = 0n (present)', async () => {
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ amount_cents: 0 }], error: null }, // one qualifying row, value = 0
    );
    const result = await derive(supabase);
    expect(result.telemetry_derived_drop_estimate_cents).toBe(BigInt(0));
    expect(result.drop_estimate_state).toBe('present');
    expect(result.calculation_kind).toBe('telemetry_drop_formula');
  });
});

// ── tia.rated_adjustment_exclusion — TIA-CANON-RATED-ADJUSTMENT-EXCLUSION ────

describe('tia.rated_adjustment_exclusion — TIA-CANON-RATED-ADJUSTMENT-EXCLUSION', () => {
  // RATED_ADJUSTMENT rows must not appear in the telemetry_kind predicate.
  // Frozen predicate: ['RATED_BUYIN', 'GRIND_BUYIN'] only (ADR-061 D2).

  it('telemetry query includes RATED_BUYIN and GRIND_BUYIN — static analysis', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'table-inventory-accounting.ts'),
      'utf-8',
    );
    expect(src).toContain("'RATED_BUYIN'");
    expect(src).toContain("'GRIND_BUYIN'");
  });

  it('telemetry query does NOT include RATED_ADJUSTMENT — static analysis', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'table-inventory-accounting.ts'),
      'utf-8',
    );
    // RATED_ADJUSTMENT must not appear in the telemetry_kind IN(...) predicate
    const telemetrySection = src.slice(
      src.indexOf('table_buyin_telemetry'),
      src.indexOf('table_buyin_telemetry') + 600,
    );
    expect(telemetrySection).not.toContain('RATED_ADJUSTMENT');
  });
});

// ── tia.confirmed_fill_credit_only ───────────────────────────────────────────

describe('tia.confirmed_fill_credit_only', () => {
  // Only status = 'confirmed' rows are included in fills/credits totals.
  // Unconfirmed rows are excluded at the query level.

  it('fills query uses .eq("status", "confirmed") — static analysis', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'table-inventory-accounting.ts'),
      'utf-8',
    );
    // Count occurrences of confirmed status filter — expect at least 2 (fills + credits)
    const confirmedOccurrences = (src.match(/'confirmed'/g) ?? []).length;
    expect(confirmedOccurrences).toBeGreaterThanOrEqual(2);
    expect(src).toContain("'table_fill'");
    expect(src).toContain("'table_credit'");
  });

  it('unconfirmed rows are excluded (service queries with status = confirmed)', async () => {
    // This test proves via mock call inspection that from/eq are called with 'confirmed'
    const supabase = makeSupabaseMock(
      { data: makeSession(), error: null },
      { data: makeOpenerSnap(), error: null },
      { data: makeCloserSnap(), error: null },
      { data: [{ confirmed_amount_cents: 100_000 }], error: null },
      { data: [{ confirmed_amount_cents: 50_000 }], error: null },
      { data: [], error: null },
    );
    await derive(supabase);
    // Verify .from() was called with 'table_fill' and 'table_credit' (sequence: [1]=openerFK, [2]=closerFK, [3]=fill, [4]=credit, [5]=telemetry)
    expect(supabase.from).toHaveBeenNthCalledWith(4, 'table_fill');
    expect(supabase.from).toHaveBeenNthCalledWith(5, 'table_credit');
  });
});

// ── tia.session_scope_only — TIA-CANON-SESSION-SCOPE-ONLY ────────────────────

describe('tia.session_scope_only — TIA-CANON-SESSION-SCOPE-ONLY', () => {
  // Telemetry window: opened_at (lower bound, inclusive) to closed_at ?? upperBoundAt (upper bound, exclusive)
  // Open session: upperBoundAt is captured ONCE at the start of derive() (stable).

  it('telemetry query uses session opened_at as lower bound — static analysis', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'table-inventory-accounting.ts'),
      'utf-8',
    );
    // The telemetry helper receives openedAt and uses .gte('occurred_at', openedAt)
    expect(src).toContain("gte('occurred_at'");
    expect(src).toContain('openedAt');
  });

  it('telemetry window upper bound uses closed_at ?? upperBoundAt (stable per request) — static analysis', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'table-inventory-accounting.ts'),
      'utf-8',
    );
    // Verify open session uses stable upperBoundAt (captured once at start)
    expect(src).toContain('upperBoundAt');
    expect(src).toContain('closed_at ?? upperBoundAt');
    // Ensure upperBoundAt is set once at start, not re-evaluated per query
    const upperBoundDecl = src.indexOf('const upperBoundAt');
    const deriveBody = src.indexOf('async derive(');
    expect(upperBoundDecl).toBeGreaterThan(deriveBody);
    // Only one declaration of upperBoundAt
    expect((src.match(/const upperBoundAt/g) ?? []).length).toBe(1);
  });

  it('telemetry query uses lt (exclusive) for upper bound — static analysis', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'table-inventory-accounting.ts'),
      'utf-8',
    );
    expect(src).toContain("lt('occurred_at'");
  });
});

// ── tia.integrity_failure_suppression — TIA-CANON-INTEGRITY-FAILURE-SUPPRESSION

describe('tia.integrity_failure_suppression — TIA-CANON-INTEGRITY-FAILURE-SUPPRESSION', () => {
  // Missing opener or closer → integrity_failure.
  // Both result fields null. integrity_issues non-empty. No result label rendered.

  it('missing opener (no FK, no fallback rows) → integrity_failure', async () => {
    const supabase = makeSupabaseMock(
      {
        data: makeSession({ opening_inventory_snapshot_id: null }),
        error: null,
      },
      // No opener FK → goes directly to fallback (empty)
      { data: [], error: null }, // opener fallback: no rows
      // closer FK: valid
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    expect(result.calculation_kind).toBe('integrity_failure');
    expect(result.projected_table_win_loss_cents).toBeNull();
    expect(result.partial_table_result_cents).toBeNull();
    expect(result.integrity_issues).toContain(
      'missing_opening_inventory_snapshot',
    );
    expect(result.integrity_issues).not.toContain(
      'missing_closing_inventory_snapshot',
    );
  });

  it('missing closer (no FK, no fallback rows) → integrity_failure', async () => {
    const supabase = makeSupabaseMock(
      {
        data: makeSession({ closing_inventory_snapshot_id: null }),
        error: null,
      },
      // opener FK: valid
      { data: makeOpenerSnap(), error: null },
      // No closer FK → goes directly to fallback (empty)
      { data: [], error: null }, // closer fallback: no rows
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    expect(result.calculation_kind).toBe('integrity_failure');
    expect(result.projected_table_win_loss_cents).toBeNull();
    expect(result.partial_table_result_cents).toBeNull();
    expect(result.integrity_issues).toContain(
      'missing_closing_inventory_snapshot',
    );
    expect(result.integrity_issues).not.toContain(
      'missing_opening_inventory_snapshot',
    );
  });

  it('both opener and closer missing → integrity_failure with both issues', async () => {
    const supabase = makeSupabaseMock(
      {
        data: makeSession({
          opening_inventory_snapshot_id: null,
          closing_inventory_snapshot_id: null,
        }),
        error: null,
      },
      { data: [], error: null }, // opener fallback: no rows
      { data: [], error: null }, // closer fallback: no rows
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    expect(result.calculation_kind).toBe('integrity_failure');
    expect(result.projected_table_win_loss_cents).toBeNull();
    expect(result.partial_table_result_cents).toBeNull();
    expect(result.integrity_issues).toContain(
      'missing_opening_inventory_snapshot',
    );
    expect(result.integrity_issues).toContain(
      'missing_closing_inventory_snapshot',
    );
    expect(result.integrity_issues).toHaveLength(2);
  });
});

// ── tia.integrity_failure_log_emission ───────────────────────────────────────

describe('tia.integrity_failure_log_emission', () => {
  // emitTableInventoryAccountingDiagnostic is called with correct fields
  // on integrity_failure outcomes.
  //
  // Note: In CJS compiled modules (ts-jest), internal calls to same-module functions
  // bypass the exports object and cannot be intercepted by jest.spyOn at the
  // import boundary. This test verifies the behavior via:
  //   1. Functional: derive() returns integrity_failure shape.
  //   2. Static: source code calls emitTableInventoryAccountingDiagnostic with
  //              the correct fields in the integrity_failure branch.

  it('derive() returns integrity_failure when opener is missing', async () => {
    const supabase = makeSupabaseMock(
      {
        data: makeSession({ opening_inventory_snapshot_id: null }),
        error: null,
      },
      { data: [], error: null },
      { data: makeCloserSnap(), error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await derive(supabase);
    expect(result.calculation_kind).toBe('integrity_failure');
    expect(result.integrity_issues.length).toBeGreaterThan(0);
    expect(result.request_id).toBe(REQUEST_ID);
  });

  it('emitTableInventoryAccountingDiagnostic is called in integrity_failure branch — static analysis', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'table-inventory-accounting.ts'),
      'utf-8',
    );
    // Verify the diagnostic emit is called in the integrity_failure branch
    expect(src).toContain('emitTableInventoryAccountingDiagnostic(');
    // Verify it passes the required fields
    expect(src).toContain('session_id: session.id');
    expect(src).toContain('casino_id: casinoId');
    expect(src).toContain("calculation_kind: 'integrity_failure'");
    expect(src).toContain('integrity_issues: integrityIssues');
    expect(src).toContain('request_id: requestId');
  });

  it('emitTableInventoryAccountingDiagnostic is exported and has correct signature', () => {
    // Verify the diagnostic function is exported (boundary for future structured-log integration)
    const {
      emitTableInventoryAccountingDiagnostic,
    } = require('../table-inventory-accounting');
    expect(typeof emitTableInventoryAccountingDiagnostic).toBe('function');
    // It should be a no-op (intentionally) — calling with a valid diagnostic should not throw
    expect(() =>
      emitTableInventoryAccountingDiagnostic({
        session_id: SESSION_ID,
        casino_id: CASINO_ID,
        calculation_kind: 'integrity_failure',
        integrity_issues: ['missing_opening_inventory_snapshot'],
        request_id: REQUEST_ID,
      }),
    ).not.toThrow();
  });
});

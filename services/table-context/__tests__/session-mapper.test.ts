/**
 * Session Mapper Tests (PRD-038A)
 *
 * Tests that toTableSessionDTO correctly maps all PRD-038A fields
 * from RPC response to DTO. Tests via public API with mocked Supabase.
 *
 * @see services/table-context/table-session.ts
 * @see PRD-038A §Gap C — Actor Attribution, §Gap E — Gaming Day Alignment
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { openTableSession } from '../table-session';

// === Mock Supabase Client ===

function createMockSupabase(
  rpcResponse: { data: unknown; error: null } | { data: null; error: unknown },
) {
  return {
    rpc: jest.fn().mockResolvedValue(rpcResponse),
  } as unknown as SupabaseClient<Database>;
}

// === Test Fixtures ===

/** Full table_session row with all PRD-038A fields */
function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    casino_id: '00000000-0000-0000-0000-000000000002',
    gaming_table_id: '00000000-0000-0000-0000-000000000003',
    gaming_day: '2026-02-25',
    shift_id: null,
    status: 'ACTIVE',
    opened_at: '2026-02-25T10:00:00Z',
    opened_by_staff_id: '00000000-0000-0000-0000-000000000004',
    rundown_started_at: null,
    rundown_started_by_staff_id: null,
    closed_at: null,
    closed_by_staff_id: null,
    opening_inventory_snapshot_id: null,
    closing_inventory_snapshot_id: null,
    drop_event_id: null,
    notes: null,
    metadata: null,
    created_at: '2026-02-25T10:00:00Z',
    updated_at: '2026-02-25T10:00:00Z',
    // ADR-027 fields
    table_bank_mode: 'INVENTORY_COUNT',
    need_total_cents: null,
    fills_total_cents: 0,
    credits_total_cents: 0,
    drop_total_cents: null,
    drop_posted_at: null,
    // PRD-038A: Close governance fields
    close_reason: null,
    close_note: null,
    has_unresolved_items: false,
    requires_reconciliation: false,
    // PRD-038A: Actor attribution fields
    activated_by_staff_id: null,
    paused_by_staff_id: null,
    resumed_by_staff_id: null,
    rolled_over_by_staff_id: null,
    // PRD-038A: Gaming day alignment
    crossed_gaming_day: false,
    ...overrides,
  };
}

// === Test 12: toTableSessionDTO maps all PRD-038A fields ===

describe('toTableSessionDTO mapper', () => {
  it('maps all PRD-038A fields from RPC response', async () => {
    const row = makeSessionRow({
      close_reason: 'maintenance',
      close_note: 'Scheduled maintenance',
      has_unresolved_items: true,
      requires_reconciliation: true,
      activated_by_staff_id: '00000000-0000-0000-0000-000000000010',
      paused_by_staff_id: '00000000-0000-0000-0000-000000000011',
      resumed_by_staff_id: '00000000-0000-0000-0000-000000000012',
      rolled_over_by_staff_id: '00000000-0000-0000-0000-000000000013',
      crossed_gaming_day: true,
    });

    const supabase = createMockSupabase({ data: row, error: null });
    const dto = await openTableSession(supabase, row.gaming_table_id);

    // PRD-038A: Close governance fields
    expect(dto.close_reason).toBe('maintenance');
    expect(dto.close_note).toBe('Scheduled maintenance');
    expect(dto.has_unresolved_items).toBe(true);
    expect(dto.requires_reconciliation).toBe(true);

    // PRD-038A: Actor attribution fields
    expect(dto.activated_by_staff_id).toBe(
      '00000000-0000-0000-0000-000000000010',
    );
    expect(dto.paused_by_staff_id).toBe('00000000-0000-0000-0000-000000000011');
    expect(dto.resumed_by_staff_id).toBe(
      '00000000-0000-0000-0000-000000000012',
    );
    expect(dto.rolled_over_by_staff_id).toBe(
      '00000000-0000-0000-0000-000000000013',
    );

    // PRD-038A: Gaming day alignment
    expect(dto.crossed_gaming_day).toBe(true);
  });

  // === Test 13: activated_by_staff_id is NULL on open (deferred) ===

  it('returns activated_by_staff_id as null on open (no activate RPC yet)', async () => {
    const row = makeSessionRow({
      activated_by_staff_id: null,
    });

    const supabase = createMockSupabase({ data: row, error: null });
    const dto = await openTableSession(supabase, row.gaming_table_id);

    // open ≠ activate: activated_by_staff_id remains null until
    // a future rpc_activate_table_session is implemented
    expect(dto.activated_by_staff_id).toBeNull();
    expect(dto.opened_by_staff_id).toBe(row.opened_by_staff_id);
  });
});

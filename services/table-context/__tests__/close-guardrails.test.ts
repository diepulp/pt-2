/**
 * Close Guardrail Tests (PRD-038A Gap A)
 *
 * Tests close guardrail behavior: unresolved liabilities rejection,
 * force close privileges, audit log emission, and close reason persistence.
 *
 * Tests via public service API with mocked Supabase client.
 *
 * @see services/table-context/table-session.ts
 * @see PRD-038A §Gap A — Close Guardrails
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import { closeTableSession, forceCloseTableSession } from '../table-session';

// === Mock Supabase Client ===

function createMockSupabase(
  rpcResponse: { data: unknown; error: null } | { data: null; error: unknown },
) {
  return {
    rpc: jest.fn().mockResolvedValue(rpcResponse),
  } as unknown as SupabaseClient<Database>;
}

/** Full table_session row fixture */
function makeClosedSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    casino_id: '00000000-0000-0000-0000-000000000002',
    gaming_table_id: '00000000-0000-0000-0000-000000000003',
    gaming_day: '2026-02-25',
    shift_id: null,
    status: 'CLOSED',
    opened_at: '2026-02-25T10:00:00Z',
    opened_by_staff_id: '00000000-0000-0000-0000-000000000004',
    rundown_started_at: '2026-02-25T18:00:00Z',
    rundown_started_by_staff_id: '00000000-0000-0000-0000-000000000004',
    closed_at: '2026-02-25T19:00:00Z',
    closed_by_staff_id: '00000000-0000-0000-0000-000000000004',
    opening_inventory_snapshot_id: null,
    closing_inventory_snapshot_id: '00000000-0000-0000-0000-000000000005',
    drop_event_id: '00000000-0000-0000-0000-000000000006',
    notes: null,
    metadata: null,
    created_at: '2026-02-25T10:00:00Z',
    updated_at: '2026-02-25T19:00:00Z',
    table_bank_mode: 'INVENTORY_COUNT',
    need_total_cents: null,
    fills_total_cents: 0,
    credits_total_cents: 0,
    drop_total_cents: null,
    drop_posted_at: null,
    close_reason: 'end_of_shift',
    close_note: null,
    has_unresolved_items: false,
    requires_reconciliation: false,
    activated_by_staff_id: null,
    paused_by_staff_id: null,
    resumed_by_staff_id: null,
    rolled_over_by_staff_id: null,
    crossed_gaming_day: false,
    ...overrides,
  };
}

// === Test 1: Reject close when has_unresolved_items=true ===

describe('closeTableSession guardrails', () => {
  it('throws UNRESOLVED_LIABILITIES when RPC returns P0005', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { code: 'P0005', message: 'unresolved_liabilities' },
    });

    await expect(
      closeTableSession(supabase, {
        sessionId: '00000000-0000-0000-0000-000000000001',
        dropEventId: '00000000-0000-0000-0000-000000000006',
        closeReason: 'end_of_shift',
      }),
    ).rejects.toThrow(DomainError);

    try {
      await closeTableSession(supabase, {
        sessionId: '00000000-0000-0000-0000-000000000001',
        dropEventId: '00000000-0000-0000-0000-000000000006',
        closeReason: 'end_of_shift',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('UNRESOLVED_LIABILITIES');
    }
  });

  // === Test 2: Allow close when has_unresolved_items=false ===

  it('succeeds when RPC returns a valid closed session', async () => {
    const row = makeClosedSessionRow();
    const supabase = createMockSupabase({ data: row, error: null });

    const result = await closeTableSession(supabase, {
      sessionId: row.id,
      dropEventId: row.drop_event_id!,
      closeReason: 'end_of_shift',
    });

    expect(result.status).toBe('CLOSED');
    expect(result.id).toBe(row.id);
  });

  // === Test 6: Close reason persisted on session ===

  it('passes close_reason and close_note to the RPC', async () => {
    const row = makeClosedSessionRow({
      close_reason: 'maintenance',
      close_note: 'Scheduled maintenance window',
    });
    const supabase = createMockSupabase({ data: row, error: null });

    const result = await closeTableSession(supabase, {
      sessionId: row.id,
      dropEventId: row.drop_event_id!,
      closeReason: 'maintenance',
      closeNote: 'Scheduled maintenance window',
    });

    expect(result.close_reason).toBe('maintenance');
    expect(result.close_note).toBe('Scheduled maintenance window');

    // Verify the RPC was called with correct parameters
    expect(supabase.rpc).toHaveBeenCalledWith('rpc_close_table_session', {
      p_table_session_id: row.id,
      p_drop_event_id: row.drop_event_id,
      p_closing_inventory_snapshot_id: null,
      p_notes: null,
      p_close_reason: 'maintenance',
      p_close_note: 'Scheduled maintenance window',
    });
  });
});

// === Test 3: Force close succeeds for pit_boss ===

describe('forceCloseTableSession', () => {
  it('returns session with requires_reconciliation=true on success', async () => {
    const row = makeClosedSessionRow({ requires_reconciliation: true });
    const supabase = createMockSupabase({ data: row, error: null });

    const result = await forceCloseTableSession(supabase, {
      sessionId: row.id,
      closeReason: 'emergency',
    });

    expect(result.status).toBe('CLOSED');
    expect(result.requires_reconciliation).toBe(true);
  });

  // === Test 4: Force close rejected for dealer role ===

  it('throws UNAUTHORIZED when RPC returns forbidden', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'forbidden: requires pit_boss or admin',
      },
    });

    await expect(
      forceCloseTableSession(supabase, {
        sessionId: '00000000-0000-0000-0000-000000000001',
        closeReason: 'emergency',
      }),
    ).rejects.toThrow(DomainError);

    try {
      await forceCloseTableSession(supabase, {
        sessionId: '00000000-0000-0000-0000-000000000001',
        closeReason: 'emergency',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('UNAUTHORIZED');
    }
  });

  // === Test 5: Force close emits audit_log entry ===
  // NOTE: Audit log emission happens inside the RPC (database layer).
  // This test verifies the RPC is called with correct parameters;
  // actual audit_log insertion is tested in integration tests against the DB.

  it('calls rpc_force_close_table_session with correct parameters', async () => {
    const row = makeClosedSessionRow({ requires_reconciliation: true });
    const supabase = createMockSupabase({ data: row, error: null });

    await forceCloseTableSession(supabase, {
      sessionId: row.id,
      closeReason: 'security_hold',
      closeNote: 'Security incident',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('rpc_force_close_table_session', {
      p_table_session_id: row.id,
      p_close_reason: 'security_hold',
      p_close_note: 'Security incident',
    });
  });

  it('throws CLOSE_NOTE_REQUIRED when RPC returns P0006', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { code: 'P0006', message: 'close_note_required' },
    });

    try {
      await forceCloseTableSession(supabase, {
        sessionId: '00000000-0000-0000-0000-000000000001',
        closeReason: 'other',
        // closeNote omitted — RPC should reject
      });
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('CLOSE_NOTE_REQUIRED');
    }
  });
});

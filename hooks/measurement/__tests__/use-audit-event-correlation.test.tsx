/**
 * useAuditEventCorrelation Hook Tests
 *
 * Tests for the audit trace panel React Query hook.
 * Validates lazy fetch, loading/success/error states, and disabled conditions.
 *
 * @see PRD-049 WS3 — Hook & Component Tests
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { AuditCorrelationQueryResult } from '@/services/measurement/queries';

// Mock the query function
const mockQueryAuditCorrelationForSlip = jest.fn();
jest.mock('@/services/measurement/queries', () => ({
  queryAuditCorrelationForSlip: (...args: unknown[]) =>
    mockQueryAuditCorrelationForSlip(...args),
}));

jest.mock('@/lib/supabase/client', () => ({
  createBrowserComponentClient: () => ({}),
}));

import { useAuditEventCorrelation } from '../use-audit-event-correlation';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mockRows: AuditCorrelationQueryResult = {
  rows: [
    {
      casino_id: 'casino-1',
      rating_slip_id: 'slip-1',
      player_id: 'player-1',
      start_time: '2026-03-09T08:00:00Z',
      end_time: '2026-03-09T09:00:00Z',
      slip_status: 'closed',
      buy_in_amount: 500,
      cash_out_amount: 300,
      pft_id: 'pft-1',
      pft_created_at: '2026-03-09T09:01:00Z',
      pft_direction: 'debit',
      pft_txn_kind: 'buy_in',
      pft_amount: 500,
      mtl_entry_id: 'mtl-1',
      mtl_occurred_at: '2026-03-09T09:02:00Z',
      mtl_txn_type: 'table_drop',
      mtl_direction: 'in',
      mtl_amount: 500,
      loyalty_ledger_id: 'loyalty-1',
      loyalty_created_at: '2026-03-09T09:03:00Z',
      loyalty_points_delta: 25,
      gaming_table_id: 'table-1',
      table_session_id: 'session-1',
      gaming_day: '2026-03-09',
    },
  ],
};

describe('useAuditEventCorrelation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does NOT fetch when enabled is false (collapsed)', () => {
    const { result } = renderHook(
      () => useAuditEventCorrelation('slip-1', 'casino-1', false),
      { wrapper: createWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockQueryAuditCorrelationForSlip).not.toHaveBeenCalled();
  });

  it('does NOT fetch when slipId is null', () => {
    const { result } = renderHook(
      () => useAuditEventCorrelation(null, 'casino-1', true),
      { wrapper: createWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockQueryAuditCorrelationForSlip).not.toHaveBeenCalled();
  });

  it('fetches when enabled is true (expanded)', async () => {
    mockQueryAuditCorrelationForSlip.mockResolvedValue(mockRows);
    const { result } = renderHook(
      () => useAuditEventCorrelation('slip-1', 'casino-1', true),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockQueryAuditCorrelationForSlip).toHaveBeenCalledTimes(1);
    expect(result.current.data?.rows).toHaveLength(1);
  });

  it('returns full chain data on success', async () => {
    mockQueryAuditCorrelationForSlip.mockResolvedValue(mockRows);
    const { result } = renderHook(
      () => useAuditEventCorrelation('slip-1', 'casino-1', true),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const row = result.current.data?.rows[0];
    expect(row?.pft_id).toBe('pft-1');
    expect(row?.mtl_entry_id).toBe('mtl-1');
    expect(row?.loyalty_ledger_id).toBe('loyalty-1');
  });

  it('returns empty array when no correlation events', async () => {
    mockQueryAuditCorrelationForSlip.mockResolvedValue({ rows: [] });
    const { result } = renderHook(
      () => useAuditEventCorrelation('slip-1', 'casino-1', true),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.rows).toHaveLength(0);
  });

  it('returns error on query failure', async () => {
    mockQueryAuditCorrelationForSlip.mockRejectedValue(
      new Error('query_failed'),
    );
    const { result } = renderHook(
      () => useAuditEventCorrelation('slip-1', 'casino-1', true),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('returns loading state initially when enabled', () => {
    mockQueryAuditCorrelationForSlip.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(
      () => useAuditEventCorrelation('slip-1', 'casino-1', true),
      { wrapper: createWrapper() },
    );
    expect(result.current.isLoading).toBe(true);
  });
});

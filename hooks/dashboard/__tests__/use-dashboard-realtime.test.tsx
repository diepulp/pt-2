/**
 * useDashboardRealtime Hook Tests
 *
 * Verifies that the dashboard realtime channel subscribes to the correct
 * tables, fires the correct cache invalidations, and cleans up on unmount.
 *
 * FIB-RT-EXC-001: Approvals-path realtime wiring — these tests verify
 * that table_fill and table_credit subscriptions were added to the existing
 * channel alongside the pre-existing gaming_table and rating_slip ones.
 *
 * @see FIB-RT-EXC-001 Exceptions Panel Realtime Wiring
 * @see EXEC-065 WS2
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

// === Channel mock ===

type ChannelCallback = (...args: unknown[]) => void;

interface OnRegistration {
  listenType: string;
  opts: { event: string; schema: string; table: string; filter: string };
  callback: ChannelCallback;
}

const onRegistrations: OnRegistration[] = [];
let subscribeCallback: ((status: string) => void) | null = null;

const mockChannel = {
  on: jest.fn(
    (
      listenType: string,
      opts: OnRegistration['opts'],
      callback: ChannelCallback,
    ) => {
      onRegistrations.push({ listenType, opts, callback });
      return mockChannel; // chainable
    },
  ),
  subscribe: jest.fn((cb: (status: string) => void) => {
    subscribeCallback = cb;
    return mockChannel;
  }),
};

const mockRemoveChannel = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createBrowserComponentClient: () => ({
    channel: jest.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  }),
}));

// === QueryClient mock ===

let testQueryClient: QueryClient;

function createWrapper() {
  testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={testQueryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

// Import after mocks
import { useDashboardRealtime } from '../use-dashboard-realtime';

// === Helpers ===

const TEST_CASINO_ID = 'casino-aaa-bbb';

function findRegistrations(table: string, event?: string): OnRegistration[] {
  return onRegistrations.filter(
    (r) =>
      r.opts.table === table && (event === undefined || r.opts.event === event),
  );
}

// === Tests ===

beforeEach(() => {
  jest.clearAllMocks();
  onRegistrations.length = 0;
  subscribeCallback = null;
});

describe('useDashboardRealtime — channel subscriptions', () => {
  it('registers INSERT and UPDATE listeners for table_fill', () => {
    renderHook(
      () => useDashboardRealtime({ casinoId: TEST_CASINO_ID, enabled: true }),
      { wrapper: createWrapper() },
    );

    const fillInsert = findRegistrations('table_fill', 'INSERT');
    const fillUpdate = findRegistrations('table_fill', 'UPDATE');

    expect(fillInsert).toHaveLength(1);
    expect(fillUpdate).toHaveLength(1);
    expect(fillInsert[0].opts.filter).toBe(`casino_id=eq.${TEST_CASINO_ID}`);
    expect(fillUpdate[0].opts.filter).toBe(`casino_id=eq.${TEST_CASINO_ID}`);
  });

  it('registers INSERT and UPDATE listeners for table_credit', () => {
    renderHook(
      () => useDashboardRealtime({ casinoId: TEST_CASINO_ID, enabled: true }),
      { wrapper: createWrapper() },
    );

    const creditInsert = findRegistrations('table_credit', 'INSERT');
    const creditUpdate = findRegistrations('table_credit', 'UPDATE');

    expect(creditInsert).toHaveLength(1);
    expect(creditUpdate).toHaveLength(1);
    expect(creditInsert[0].opts.filter).toBe(`casino_id=eq.${TEST_CASINO_ID}`);
  });

  it('does NOT register DELETE listeners for table_fill or table_credit', () => {
    renderHook(
      () => useDashboardRealtime({ casinoId: TEST_CASINO_ID, enabled: true }),
      { wrapper: createWrapper() },
    );

    const fillDelete = findRegistrations('table_fill', 'DELETE');
    const creditDelete = findRegistrations('table_credit', 'DELETE');

    expect(fillDelete).toHaveLength(0);
    expect(creditDelete).toHaveLength(0);
  });

  it('preserves existing gaming_table and rating_slip subscriptions', () => {
    renderHook(
      () => useDashboardRealtime({ casinoId: TEST_CASINO_ID, enabled: true }),
      { wrapper: createWrapper() },
    );

    const tableRegs = findRegistrations('gaming_table');
    const slipRegs = findRegistrations('rating_slip');

    expect(tableRegs.length).toBeGreaterThanOrEqual(1);
    expect(slipRegs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('useDashboardRealtime — cache invalidation', () => {
  it('invalidates pendingFillsCredits on table_fill INSERT', () => {
    renderHook(
      () => useDashboardRealtime({ casinoId: TEST_CASINO_ID, enabled: true }),
      { wrapper: createWrapper() },
    );

    const spy = jest.spyOn(testQueryClient, 'invalidateQueries');

    const fillInsert = findRegistrations('table_fill', 'INSERT')[0];
    act(() => {
      fillInsert.callback({});
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(['pending-fills-credits']),
      }),
    );
  });

  it('invalidates pendingFillsCredits on table_credit UPDATE', () => {
    renderHook(
      () => useDashboardRealtime({ casinoId: TEST_CASINO_ID, enabled: true }),
      { wrapper: createWrapper() },
    );

    const spy = jest.spyOn(testQueryClient, 'invalidateQueries');

    const creditUpdate = findRegistrations('table_credit', 'UPDATE')[0];
    act(() => {
      creditUpdate.callback({});
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(['pending-fills-credits']),
      }),
    );
  });
});

describe('useDashboardRealtime — cleanup', () => {
  it('removes the channel on unmount', () => {
    const { unmount } = renderHook(
      () => useDashboardRealtime({ casinoId: TEST_CASINO_ID, enabled: true }),
      { wrapper: createWrapper() },
    );

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });
});

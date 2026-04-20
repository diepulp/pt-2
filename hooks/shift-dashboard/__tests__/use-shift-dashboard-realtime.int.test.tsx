/**
 * useShiftDashboardRealtime — integration test (§4 E1 compliance)
 *
 * Uses a real QueryClient with a seeded summary query; fires a WAL event
 * through the mocked Supabase subscription emitter; asserts the matching
 * query entry transitions to isInvalidated.
 *
 * This test proves that the hook's WAL-arrival path invalidates via the
 * registered shiftDashboardKeys factory (NOT via ad-hoc array literals),
 * satisfying §4 E1.
 *
 * @see PRD-068 / EXEC-068 W2
 * @see ADR-050 §4 E1
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

// === Channel mock =========================================================

type ChannelCallback = (...args: unknown[]) => void;

interface OnRegistration {
  callback: ChannelCallback;
}

const registrations: OnRegistration[] = [];

const mockChannel = {
  on: jest.fn(
    (_listenType: string, _opts: unknown, callback: ChannelCallback) => {
      registrations.push({ callback });
      return mockChannel;
    },
  ),
  subscribe: jest.fn(() => mockChannel),
};

const mockRemoveChannel = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createBrowserComponentClient: () => ({
    channel: () => mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

// Import after mocks
import { shiftDashboardKeys, type ShiftTimeWindow } from '../keys';
import { useShiftDashboardRealtime } from '../use-shift-dashboard-realtime';

// === Helpers ==============================================================

const TEST_CASINO_ID = 'casino-int-test';

const TEST_WINDOW: ShiftTimeWindow = {
  start: '2026-04-20T00:00:00.000Z',
  end: '2026-04-20T08:00:00.000Z',
};

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// === Tests ================================================================

beforeEach(() => {
  jest.clearAllMocks();
  registrations.length = 0;
});

describe('useShiftDashboardRealtime — §4 E1 factory-driven invalidation (integration)', () => {
  it('transitions seeded summary(window) query to isInvalidated on WAL event', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    // Seed the cache with a concrete summary(window) query entry.
    client.setQueryData(shiftDashboardKeys.summary(TEST_WINDOW), {
      sentinel: 'seeded-value',
    });

    const seededKey = shiftDashboardKeys.summary(TEST_WINDOW);
    const queryBefore = client.getQueryCache().find({ queryKey: seededKey });
    expect(queryBefore).toBeDefined();
    expect(queryBefore?.state.isInvalidated).toBe(false);

    // Mount the hook
    renderHook(() => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }), {
      wrapper: createWrapper(client),
    });

    // Fire WAL event through the subscription callback
    const [reg] = registrations;
    act(() => {
      reg.callback({ eventType: 'INSERT' });
    });

    // Seeded query must now be invalidated — proving the factory-driven
    // invalidation path reached the surgical .scope prefix correctly.
    const queryAfter = client.getQueryCache().find({ queryKey: seededKey });
    expect(queryAfter?.state.isInvalidated).toBe(true);
  });

  it('also invalidates tableMetrics(window) queries via the scoped prefix', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    client.setQueryData(shiftDashboardKeys.tableMetrics(TEST_WINDOW), {
      sentinel: 'seeded-table-metrics',
    });

    const seededKey = shiftDashboardKeys.tableMetrics(TEST_WINDOW);
    expect(client.getQueryCache().find({ queryKey: seededKey })).toBeDefined();

    renderHook(() => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }), {
      wrapper: createWrapper(client),
    });

    const [reg] = registrations;
    act(() => {
      reg.callback({ eventType: 'INSERT' });
    });

    const queryAfter = client.getQueryCache().find({ queryKey: seededKey });
    expect(queryAfter?.state.isInvalidated).toBe(true);
  });

  it('does NOT invalidate unrelated queries (non-shift-dashboard roots)', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const unrelatedKey = ['some-other-root', 'ignore-me'] as const;
    client.setQueryData(unrelatedKey, { sentinel: 'untouched' });

    renderHook(() => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }), {
      wrapper: createWrapper(client),
    });

    const [reg] = registrations;
    act(() => {
      reg.callback({ eventType: 'INSERT' });
    });

    const unrelated = client.getQueryCache().find({ queryKey: unrelatedKey });
    expect(unrelated?.state.isInvalidated).toBe(false);
  });
});

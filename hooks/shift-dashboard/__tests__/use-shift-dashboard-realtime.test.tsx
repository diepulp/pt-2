/**
 * useShiftDashboardRealtime — unit tests
 *
 * Covers:
 *  - WAL event triggers shiftDashboardKeys.summary.scope + tableMetrics.scope invalidation
 *  - DEC-DD1 debounce: mutation-side invalidation within 500ms suppresses WAL invalidation
 *  - Debounce window expiry: WAL fires again after 500ms+
 *  - Channel name pattern + RLS filter
 *  - Cleanup on unmount
 *
 * @see PRD-068 / EXEC-068 W2
 * @see ADR-050 §4 E1/E3
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

// === Channel mock (chainable) =============================================

type ChannelCallback = (...args: unknown[]) => void;

interface OnRegistration {
  listenType: string;
  opts: { event: string; schema: string; table: string; filter: string };
  callback: ChannelCallback;
}

const onRegistrations: OnRegistration[] = [];
let subscribeCallback: ((status: string) => void) | null = null;
const channelFactorySpy = jest.fn<unknown, [string]>(
  (_name: string) => mockChannel,
);

const mockChannel = {
  on: jest.fn(
    (
      listenType: string,
      opts: OnRegistration['opts'],
      callback: ChannelCallback,
    ) => {
      onRegistrations.push({ listenType, opts, callback });
      return mockChannel;
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
    channel: (name: string) => channelFactorySpy(name),
    removeChannel: mockRemoveChannel,
  }),
}));

// === Wrapper ==============================================================

let testQueryClient: QueryClient;

function createWrapper() {
  testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
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
import { shiftDashboardKeys } from '../keys';
import { useShiftDashboardRealtime } from '../use-shift-dashboard-realtime';

// === Helpers ==============================================================

const TEST_CASINO_ID = 'casino-aaa-bbb';

function findTelemetryRegistration(): OnRegistration {
  const reg = onRegistrations.find(
    (r) => r.opts.table === 'table_buyin_telemetry',
  );
  if (!reg) throw new Error('no telemetry registration recorded');
  return reg;
}

// === Tests ================================================================

beforeEach(() => {
  jest.clearAllMocks();
  onRegistrations.length = 0;
  subscribeCallback = null;
});

describe('useShiftDashboardRealtime — subscription wiring', () => {
  it('creates a channel named shift-dashboard-rated-buyin-${casinoId}', () => {
    renderHook(() => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }), {
      wrapper: createWrapper(),
    });

    expect(channelFactorySpy).toHaveBeenCalledWith(
      `shift-dashboard-rated-buyin-${TEST_CASINO_ID}`,
    );
  });

  it('registers a postgres_changes listener on table_buyin_telemetry with casino_id filter', () => {
    renderHook(() => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }), {
      wrapper: createWrapper(),
    });

    const reg = findTelemetryRegistration();
    expect(reg.listenType).toBe('postgres_changes');
    expect(reg.opts.event).toBe('*');
    expect(reg.opts.schema).toBe('public');
    expect(reg.opts.filter).toBe(`casino_id=eq.${TEST_CASINO_ID}`);
  });

  it('does not subscribe when enabled=false', () => {
    renderHook(
      () =>
        useShiftDashboardRealtime({
          casinoId: TEST_CASINO_ID,
          enabled: false,
        }),
      { wrapper: createWrapper() },
    );

    expect(channelFactorySpy).not.toHaveBeenCalled();
  });

  it('does not subscribe when casinoId is null', () => {
    renderHook(() => useShiftDashboardRealtime({ casinoId: null }), {
      wrapper: createWrapper(),
    });

    expect(channelFactorySpy).not.toHaveBeenCalled();
  });
});

describe('useShiftDashboardRealtime — WAL invalidation (§4 E1)', () => {
  it('invalidates summary.scope AND tableMetrics.scope on WAL event via the factory', () => {
    renderHook(() => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }), {
      wrapper: createWrapper(),
    });

    const spy = jest.spyOn(testQueryClient, 'invalidateQueries');
    const reg = findTelemetryRegistration();

    act(() => {
      reg.callback({});
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: shiftDashboardKeys.summary.scope,
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: shiftDashboardKeys.tableMetrics.scope,
    });
  });
});

describe('useShiftDashboardRealtime — DEC-DD1 debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('suppresses WAL invalidation within 500ms of a mutation-side shift-dashboard invalidation', () => {
    renderHook(() => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }), {
      wrapper: createWrapper(),
    });

    const reg = findTelemetryRegistration();

    // Seed a matching query so invalidateQueries emits the observer event.
    testQueryClient.setQueryData(
      shiftDashboardKeys.summary({
        start: '2026-04-20T00:00:00.000Z',
        end: '2026-04-20T01:00:00.000Z',
      }),
      { sentinel: 'seeded' },
    );

    // Mutation-side invalidation (what use-financial-mutations would do)
    act(() => {
      testQueryClient.invalidateQueries({
        queryKey: shiftDashboardKeys.summary.scope,
      });
    });

    const spy = jest.spyOn(testQueryClient, 'invalidateQueries');

    // Within 500ms: fire a WAL event.
    act(() => {
      jest.setSystemTime(new Date(Date.parse('2026-04-20T00:00:00Z') + 100));
      reg.callback({});
    });

    // Spy captures only calls AFTER it was attached — the mutation-side
    // invalidation is not counted. If the WAL handler suppressed itself,
    // the spy is untouched.
    expect(spy).not.toHaveBeenCalled();
  });

  it('fires WAL invalidation after the 500ms debounce window has elapsed', () => {
    renderHook(() => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }), {
      wrapper: createWrapper(),
    });

    const reg = findTelemetryRegistration();

    testQueryClient.setQueryData(
      shiftDashboardKeys.summary({
        start: '2026-04-20T00:00:00.000Z',
        end: '2026-04-20T01:00:00.000Z',
      }),
      { sentinel: 'seeded' },
    );

    act(() => {
      testQueryClient.invalidateQueries({
        queryKey: shiftDashboardKeys.summary.scope,
      });
    });

    const spy = jest.spyOn(testQueryClient, 'invalidateQueries');

    // Advance past 500ms, then fire WAL event.
    act(() => {
      jest.setSystemTime(new Date(Date.parse('2026-04-20T00:00:00Z') + 600));
      reg.callback({});
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: shiftDashboardKeys.summary.scope,
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: shiftDashboardKeys.tableMetrics.scope,
    });
  });

  it('does NOT suppress WAL when the preceding invalidation is for a non-shift-dashboard key', () => {
    renderHook(() => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }), {
      wrapper: createWrapper(),
    });

    const reg = findTelemetryRegistration();

    // Seed a non-shift-dashboard query so invalidate emits the observer event.
    testQueryClient.setQueryData(['some-other-surface', 'item'], {
      sentinel: 'unrelated',
    });

    // Invalidate an unrelated key — must NOT start the debounce.
    act(() => {
      testQueryClient.invalidateQueries({
        queryKey: ['some-other-surface'],
      });
    });

    const spy = jest.spyOn(testQueryClient, 'invalidateQueries');

    act(() => {
      jest.setSystemTime(new Date(Date.parse('2026-04-20T00:00:00Z') + 100));
      reg.callback({});
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: shiftDashboardKeys.summary.scope,
    });
  });
});

describe('useShiftDashboardRealtime — cleanup', () => {
  it('removes the channel on unmount', () => {
    const { unmount } = renderHook(
      () => useShiftDashboardRealtime({ casinoId: TEST_CASINO_ID }),
      { wrapper: createWrapper() },
    );

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });
});

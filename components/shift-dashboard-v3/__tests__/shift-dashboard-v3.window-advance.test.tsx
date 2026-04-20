/**
 * ADR-050 §4 E2 — Rolling-window correctness probe.
 *
 * Covers PRD-068 W1 (EXEC-068 workstream 1).
 *
 * Two kinds of assertion:
 *  (a) The pure `computeRollingWindow(anchorMs, spanMs)` helper produces a
 *      window whose `end` equals the anchor and whose `start` equals
 *      anchor − span.
 *  (b) At the component integration level: while no operator override is set,
 *      the window's `end` advances on each rolling tick (ROLLING_TICK_MS).
 *      Once the operator commits an explicit window, rolling is bypassed and
 *      the chosen window is retained verbatim across subsequent ticks.
 *
 * The integration-level assertions mock all query hooks and capture the
 * `window` passed to `useShiftDashboardSummary` between fake-timer advances.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';

import type { ShiftTimeWindow } from '@/hooks/shift-dashboard';

import {
  DEFAULT_ROLLING_SPAN_MS,
  ROLLING_TICK_MS,
  ShiftDashboardV3,
  computeRollingWindow,
} from '../shift-dashboard-v3';

// --- Hook mocks (capture per-call args) -----------------------------------

const mockUseShiftDashboardSummary = jest.fn();
const mockUseCashObsSummary = jest.fn();
const mockUseActiveVisitorsSummary = jest.fn();

jest.mock('@/hooks/shift-dashboard', () => ({
  useShiftDashboardSummary: (...args: unknown[]) =>
    mockUseShiftDashboardSummary(...args),
  useCashObsSummary: (...args: unknown[]) => mockUseCashObsSummary(...args),
  useActiveVisitorsSummary: (...args: unknown[]) =>
    mockUseActiveVisitorsSummary(...args),
  useShiftDashboardRealtime: jest.fn(() => ({
    isConnected: false,
    error: null,
    lastUpdate: null,
  })),
  shiftDashboardKeys: { root: ['shift-dashboard'] },
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ casinoId: 'casino-test' }),
}));

jest.mock('@/hooks/casino/use-gaming-day', () => ({
  useGamingDay: () => ({ data: { gaming_day: '2026-04-20' } }),
}));

// --- Child / layout mocks --------------------------------------------------

jest.mock('@/components/shift-dashboard-v3/center/alerts-strip', () => ({
  AlertsStrip: () => <div data-testid="alerts-strip" />,
}));

jest.mock('@/components/shift-dashboard-v3/center/metrics-table', () => ({
  MetricsTable: () => <div data-testid="metrics-table" />,
}));

jest.mock('@/components/shift-dashboard-v3/charts', () => ({
  FloorActivityRadar: () => <div data-testid="floor-radar" />,
}));

jest.mock(
  '@/components/shift-dashboard-v3/charts/win-loss-trend-chart',
  () => ({
    WinLossTrendChart: () => <div data-testid="win-loss-chart" />,
  }),
);

jest.mock('@/components/shift-dashboard-v3/layout', () => ({
  ShiftDashboardLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
  ShiftDashboardHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="header">{children}</div>
  ),
  ShiftLeftRail: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="left-rail">{children}</div>
  ),
  ShiftCenterPanel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="center-panel">{children}</div>
  ),
  ShiftRightRail: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="right-rail">{children}</div>
  ),
}));

jest.mock('@/components/shift-dashboard-v3/left-rail', () => ({
  HeroWinLossCompact: () => <div data-testid="hero-win-loss" />,
  SecondaryKpiStack: () => <div data-testid="kpi-stack" />,
  QualitySummaryCard: () => <div data-testid="quality-summary" />,
}));

jest.mock('@/components/shift-dashboard-v3/right-rail', () => ({
  TelemetryRailPanel: () => <div data-testid="telemetry-panel" />,
  QualityDetailCard: () => <div data-testid="quality-detail" />,
  RailCollapseToggle: () => <div data-testid="rail-toggle" />,
  CollapsedIconStrip: () => <div data-testid="collapsed-icons" />,
}));

jest.mock('@/components/shift-dashboard-v3/trust', () => ({
  CoverageBar: () => <div data-testid="coverage-bar" />,
}));

jest.mock('@/components/error-boundary', () => ({
  PanelErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Header-side children that pull their own data via useQuery — mock to avoid
// needing a real QueryClient for each one.
jest.mock('@/components/shift-dashboard/checkpoint-button', () => ({
  CheckpointButton: () => <div data-testid="checkpoint-button" />,
}));

jest.mock('@/components/shift-dashboard/delta-badge', () => ({
  DeltaBadge: () => <div data-testid="delta-badge" />,
}));

jest.mock('@/components/shift-dashboard-v3/coverage-widget', () => ({
  CoverageWidget: () => <div data-testid="coverage-widget" />,
}));

// Capture the `onChange` handler from TimeWindowSelector so tests can simulate
// an operator committing an explicit window.
let capturedOnChange: ((win: ShiftTimeWindow) => void) | null = null;
jest.mock('@/components/shift-dashboard/time-window-selector', () => ({
  TimeWindowSelector: ({
    onChange,
  }: {
    onChange: (win: ShiftTimeWindow) => void;
  }) => {
    capturedOnChange = onChange;
    return <div data-testid="time-window-selector" />;
  },
}));

// --- Helpers ---------------------------------------------------------------

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ShiftDashboardV3 />
    </QueryClientProvider>,
  );
}

function setupHooks() {
  mockUseShiftDashboardSummary.mockReturnValue({
    data: undefined,
    isLoading: true,
    error: null,
    dataUpdatedAt: 0,
  });
  mockUseCashObsSummary.mockReturnValue({
    data: undefined,
    isLoading: true,
    error: null,
  });
  mockUseActiveVisitorsSummary.mockReturnValue({
    data: undefined,
    isLoading: true,
    error: null,
  });
}

/**
 * Extract the `window` passed to the Nth call of `useShiftDashboardSummary`.
 * The component invokes the hook with `{ window: ShiftTimeWindow }`.
 */
function getWindowFromCall(n: number): ShiftTimeWindow {
  const call = mockUseShiftDashboardSummary.mock.calls[n];
  if (!call) throw new Error(`no call #${n} recorded`);
  const [opts] = call as [{ window: ShiftTimeWindow }];
  return opts.window;
}

// --- Tests -----------------------------------------------------------------

describe('computeRollingWindow (pure helper)', () => {
  it('maps anchor → end, anchor−span → start at the default span', () => {
    const anchor = Date.UTC(2026, 3, 20, 12, 0, 0);
    const window = computeRollingWindow(anchor);

    expect(new Date(window.end).getTime()).toBe(anchor);
    expect(new Date(window.start).getTime()).toBe(
      anchor - DEFAULT_ROLLING_SPAN_MS,
    );
  });

  it('respects an explicit spanMs argument', () => {
    const anchor = Date.UTC(2026, 3, 20, 12, 0, 0);
    const customSpan = 60 * 60 * 1000; // 1h
    const window = computeRollingWindow(anchor, customSpan);

    expect(new Date(window.end).getTime()).toBe(anchor);
    expect(new Date(window.start).getTime()).toBe(anchor - customSpan);
  });
});

describe('ShiftDashboardV3 — rolling window behaviour (ADR-050 §4 E2)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T00:00:00Z'));
    jest.clearAllMocks();
    capturedOnChange = null;
    setupHooks();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('advances window.end across a rolling tick when no operator override is set', () => {
    renderDashboard();

    const firstWindow = getWindowFromCall(0);
    const firstEndMs = new Date(firstWindow.end).getTime();

    // Tick: advance past one rolling interval. The setInterval callback fires,
    // setRollingAnchorMs updates state, React re-renders, the summary hook is
    // called again with the advanced window.
    act(() => {
      jest.setSystemTime(
        new Date(Date.parse('2026-04-20T00:00:00Z') + ROLLING_TICK_MS + 100),
      );
      jest.advanceTimersByTime(ROLLING_TICK_MS + 100);
    });

    const lastWindow = getWindowFromCall(
      mockUseShiftDashboardSummary.mock.calls.length - 1,
    );
    const lastEndMs = new Date(lastWindow.end).getTime();

    expect(lastEndMs).toBeGreaterThan(firstEndMs);
    expect(lastEndMs - firstEndMs).toBeGreaterThanOrEqual(ROLLING_TICK_MS);
    // Span is preserved — start advances by the same delta as end.
    const firstStartMs = new Date(firstWindow.start).getTime();
    const lastStartMs = new Date(lastWindow.start).getTime();
    expect(lastEndMs - lastStartMs).toBe(DEFAULT_ROLLING_SPAN_MS);
    expect(lastEndMs - lastStartMs).toBe(firstEndMs - firstStartMs);
  });

  it('freezes on operator override: subsequent rolling ticks do not advance the window', () => {
    renderDashboard();

    // Operator commits an explicit window via TimeWindowSelector.
    const operatorWindow: ShiftTimeWindow = {
      start: '2026-04-19T08:00:00.000Z',
      end: '2026-04-19T16:00:00.000Z',
    };
    act(() => {
      capturedOnChange?.(operatorWindow);
    });

    const callsAfterOverride = mockUseShiftDashboardSummary.mock.calls.length;
    const windowAfterOverride = getWindowFromCall(callsAfterOverride - 1);
    expect(windowAfterOverride).toEqual(operatorWindow);

    // A full rolling tick passes — operator override must win.
    act(() => {
      jest.setSystemTime(
        new Date(Date.parse('2026-04-20T00:00:00Z') + ROLLING_TICK_MS + 100),
      );
      jest.advanceTimersByTime(ROLLING_TICK_MS + 100);
    });

    const latestWindow = getWindowFromCall(
      mockUseShiftDashboardSummary.mock.calls.length - 1,
    );
    expect(latestWindow).toEqual(operatorWindow);
  });

  it('initial render uses Date.now() as the rolling anchor (not a frozen value)', () => {
    const systemNow = Date.parse('2026-04-20T00:00:00Z');
    jest.setSystemTime(new Date(systemNow));

    renderDashboard();

    const initial = getWindowFromCall(0);
    expect(new Date(initial.end).getTime()).toBe(systemNow);
    expect(new Date(initial.start).getTime()).toBe(
      systemNow - DEFAULT_ROLLING_SPAN_MS,
    );
  });
});

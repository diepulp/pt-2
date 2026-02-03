import { render, screen } from '@testing-library/react';

import { ShiftDashboardV3 } from '../shift-dashboard-v3';

// Mock all query hooks
const mockUseShiftDashboardSummary = jest.fn();
const mockUseCashObsSummary = jest.fn();
const mockUseActiveVisitorsSummary = jest.fn();

jest.mock('@/hooks/shift-dashboard', () => ({
  useShiftDashboardSummary: (...args: unknown[]) => mockUseShiftDashboardSummary(...args),
  useCashObsSummary: (...args: unknown[]) => mockUseCashObsSummary(...args),
  useActiveVisitorsSummary: (...args: unknown[]) => mockUseActiveVisitorsSummary(...args),
  shiftDashboardKeys: {
    root: ['shift-dashboard'],
  },
}));

// Mock child components to isolate orchestrator tests
jest.mock('@/components/shift-dashboard-v3/center/alerts-strip', () => ({
  AlertsStrip: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="alerts-strip">{isLoading ? 'loading' : 'loaded'}</div>
  ),
}));

jest.mock('@/components/shift-dashboard-v3/center/metrics-table', () => ({
  MetricsTable: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="metrics-table">{isLoading ? 'loading' : 'loaded'}</div>
  ),
}));

jest.mock('@/components/shift-dashboard-v3/charts', () => ({
  FloorActivityRadar: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="floor-radar">{isLoading ? 'loading' : 'loaded'}</div>
  ),
}));

jest.mock('@/components/shift-dashboard-v3/charts/win-loss-trend-chart', () => ({
  WinLossTrendChart: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="win-loss-chart">{isLoading ? 'loading' : 'loaded'}</div>
  ),
}));

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
  HeroWinLossCompact: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="hero-win-loss">{isLoading ? 'loading' : 'loaded'}</div>
  ),
  SecondaryKpiStack: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="kpi-stack">{isLoading ? 'loading' : 'loaded'}</div>
  ),
  QualitySummaryCard: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="quality-summary">{isLoading ? 'loading' : 'loaded'}</div>
  ),
}));

jest.mock('@/components/shift-dashboard-v3/right-rail', () => ({
  TelemetryRailPanel: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="telemetry-panel">{isLoading ? 'loading' : 'loaded'}</div>
  ),
  QualityDetailCard: () => <div data-testid="quality-detail" />,
  RailCollapseToggle: () => <div data-testid="rail-toggle" />,
  CollapsedIconStrip: () => <div data-testid="collapsed-icons" />,
}));

jest.mock('@/components/shift-dashboard-v3/trust', () => ({
  CoverageBar: () => <div data-testid="coverage-bar" />,
}));

jest.mock('@/components/shift-dashboard/time-window-selector', () => ({
  TimeWindowSelector: () => <div data-testid="time-window-selector" />,
}));

jest.mock('@/components/error-boundary', () => ({
  PanelErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockSummary = {
  casino: {
    win_loss_estimated_total_cents: 150000,
    tables_count: 20,
    pits_count: 4,
    snapshot_coverage_ratio: 0.85,
    coverage_tier: 'HIGH' as const,
    tables_with_opening_snapshot: 17,
    tables_with_closing_snapshot: 15,
    provenance: { grade: 'AUTHORITATIVE' as const },
  },
  pits: [
    {
      pit_id: 'PIT-1',
      win_loss_estimated_total_cents: 50000,
      telemetry_quality: 'GOOD_COVERAGE' as const,
    },
  ],
  tables: [
    { table_id: 'T1', telemetry_quality: 'GOOD_COVERAGE' as const },
    { table_id: 'T2', telemetry_quality: 'LOW_COVERAGE' as const },
    { table_id: 'T3', telemetry_quality: 'NONE' as const },
  ],
};

const mockCashObs = {
  casino: { cash_out_observed_estimate_total: 50000, cash_out_observation_count: 12 },
  pits: [],
  tables: [],
  alerts: [],
};

const mockVisitors = { rated_count: 45, unrated_count: 12, rated_percentage: 78.9 };

function setupHooks({
  summaryData = undefined as typeof mockSummary | undefined,
  summaryLoading = false,
  summaryError = null as Error | null,
  cashObsData = undefined as typeof mockCashObs | undefined,
  cashObsLoading = false,
  cashObsError = null as Error | null,
  visitorsData = undefined as typeof mockVisitors | undefined,
  visitorsLoading = false,
  visitorsError = null as Error | null,
} = {}) {
  mockUseShiftDashboardSummary.mockReturnValue({
    data: summaryData,
    isLoading: summaryLoading,
    error: summaryError,
    dataUpdatedAt: summaryData ? Date.now() : 0,
  });
  mockUseCashObsSummary.mockReturnValue({
    data: cashObsData,
    isLoading: cashObsLoading,
    error: cashObsError,
  });
  mockUseActiveVisitorsSummary.mockReturnValue({
    data: visitorsData,
    isLoading: visitorsLoading,
    error: visitorsError,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ShiftDashboardV3', () => {
  it('renders layout structure', () => {
    setupHooks({ summaryLoading: true, cashObsLoading: true, visitorsLoading: true });

    render(<ShiftDashboardV3 />);

    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('left-rail')).toBeInTheDocument();
    expect(screen.getByTestId('center-panel')).toBeInTheDocument();
    expect(screen.getByTestId('right-rail')).toBeInTheDocument();
  });

  it('passes loading state to child components', () => {
    setupHooks({ summaryLoading: true, cashObsLoading: true, visitorsLoading: true });

    render(<ShiftDashboardV3 />);

    expect(screen.getByTestId('hero-win-loss')).toHaveTextContent('loading');
    expect(screen.getByTestId('kpi-stack')).toHaveTextContent('loading');
    expect(screen.getByTestId('quality-summary')).toHaveTextContent('loading');
    expect(screen.getByTestId('alerts-strip')).toHaveTextContent('loading');
    expect(screen.getByTestId('metrics-table')).toHaveTextContent('loading');
    expect(screen.getByTestId('telemetry-panel')).toHaveTextContent('loading');
  });

  it('renders data state when queries succeed', () => {
    setupHooks({
      summaryData: mockSummary,
      cashObsData: mockCashObs,
      visitorsData: mockVisitors,
    });

    render(<ShiftDashboardV3 />);

    expect(screen.getByTestId('hero-win-loss')).toHaveTextContent('loaded');
    expect(screen.getByTestId('metrics-table')).toHaveTextContent('loaded');
    expect(screen.getByTestId('telemetry-panel')).toHaveTextContent('loaded');
  });

  it('renders dashboard title', () => {
    setupHooks({ summaryLoading: true, cashObsLoading: true, visitorsLoading: true });

    render(<ShiftDashboardV3 />);

    expect(screen.getByText('Shift Dashboard')).toBeInTheDocument();
  });

  it('renders time window selector', () => {
    setupHooks({ summaryLoading: true, cashObsLoading: true, visitorsLoading: true });

    render(<ShiftDashboardV3 />);

    expect(screen.getByTestId('time-window-selector')).toBeInTheDocument();
  });

  it('renders coverage bar when casino data available', () => {
    setupHooks({
      summaryData: mockSummary,
      cashObsData: mockCashObs,
      visitorsData: mockVisitors,
    });

    render(<ShiftDashboardV3 />);

    expect(screen.getByTestId('coverage-bar')).toBeInTheDocument();
  });

  it('does not render coverage bar when no casino data', () => {
    setupHooks({ summaryLoading: true, cashObsLoading: true, visitorsLoading: true });

    render(<ShiftDashboardV3 />);

    expect(screen.queryByTestId('coverage-bar')).not.toBeInTheDocument();
  });

  it('survives partial query errors (dashboard still renders)', () => {
    setupHooks({
      summaryData: mockSummary,
      cashObsError: new Error('Cash obs failed'),
      visitorsData: mockVisitors,
    });

    render(<ShiftDashboardV3 />);

    // Dashboard should still render with available data
    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(screen.getByTestId('hero-win-loss')).toHaveTextContent('loaded');
  });

  it('throws when all queries fail', () => {
    setupHooks({
      summaryError: new Error('Metrics failed'),
      cashObsError: new Error('Cash obs failed'),
      visitorsError: new Error('Visitors failed'),
    });

    // ShiftDashboardV3 throws when all 3 queries error
    expect(() => render(<ShiftDashboardV3 />)).toThrow('Metrics failed');
  });

  it('shows last update time when data available', () => {
    setupHooks({
      summaryData: mockSummary,
      cashObsData: mockCashObs,
      visitorsData: mockVisitors,
    });

    render(<ShiftDashboardV3 />);

    // The "ago" text should appear when dataUpdatedAt > 0
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  ShiftPitMetricsDTO,
  ShiftTableMetricsDTO,
} from '@/services/table-context/shift-metrics/dtos';

import { MetricsTable } from '../center/metrics-table';

// Mock CoverageBar — it's a trust primitive with its own test suite
jest.mock('@/components/shift-dashboard-v3/trust', () => ({
  MetricGradeBadge: ({ grade }: { grade: string }) => (
    <span data-testid="metric-grade-badge">{grade}</span>
  ),
  TelemetryQualityIndicator: ({ quality }: { quality: string }) => (
    <span data-testid="telemetry-quality-indicator">{quality}</span>
  ),
  CoverageBar: ({ ratio }: { ratio: number }) => (
    <div data-testid="coverage-bar">{Math.round(ratio * 100)}%</div>
  ),
  OpeningSourceBadge: ({ source }: { source: string | null }) =>
    source && source !== 'snapshot:prior_count' ? (
      <span data-testid="opening-source-badge">{source}</span>
    ) : null,
}));

const mockPits: ShiftPitMetricsDTO[] = [
  {
    pit_id: 'PIT-1',
    pit_label: 'Pit 1',
    win_loss_estimated_total_cents: 50000,
    fills_total_cents: 20000,
    credits_total_cents: 10000,
    tables_count: 5,
    snapshot_coverage_ratio: 0.9,
    coverage_tier: 'HIGH' as const,
    telemetry_quality: 'GOOD_COVERAGE' as const,
    metric_grade: 'AUTHORITATIVE' as const,
  } as ShiftPitMetricsDTO,
  {
    pit_id: 'PIT-2',
    pit_label: 'Pit 2',
    win_loss_estimated_total_cents: 30000,
    fills_total_cents: 15000,
    credits_total_cents: 8000,
    tables_count: 5,
    snapshot_coverage_ratio: 0.5,
    coverage_tier: 'MEDIUM' as const,
    telemetry_quality: 'LOW_COVERAGE' as const,
    metric_grade: 'ESTIMATE' as const,
  } as ShiftPitMetricsDTO,
];

const mockTables: ShiftTableMetricsDTO[] = [
  {
    table_id: 'T1',
    table_label: 'BJ-01',
    pit_id: 'PIT-1',
    win_loss_estimated_cents: 10000,
    fills_total_cents: 5000,
    credits_total_cents: 2000,
    telemetry_quality: 'GOOD_COVERAGE' as const,
    metric_grade: 'AUTHORITATIVE' as const,
    missing_opening_snapshot: false,
    missing_closing_snapshot: false,
  } as ShiftTableMetricsDTO,
  {
    table_id: 'T2',
    table_label: 'BJ-02',
    pit_id: 'PIT-2',
    win_loss_estimated_cents: 8000,
    fills_total_cents: 3000,
    credits_total_cents: 1500,
    telemetry_quality: 'LOW_COVERAGE' as const,
    metric_grade: 'ESTIMATE' as const,
    missing_opening_snapshot: true,
    missing_closing_snapshot: false,
  } as ShiftTableMetricsDTO,
];

describe('MetricsTable', () => {
  it('renders loading skeleton when isLoading', () => {
    const { container } = render(
      <MetricsTable pitsData={undefined} tablesData={undefined} isLoading />,
    );
    // Casino tab is default active — loading state should not show table data
    expect(screen.queryByText('PIT-1')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="animate"]')).toBeTruthy();
  });

  it('renders pit data in default casino tab', () => {
    render(
      <MetricsTable
        casinoData={{ pits_count: 2, tables_count: 10 }}
        pitsData={mockPits}
        tablesData={mockTables}
      />,
    );

    // Pit IDs should be visible in the casino tab
    expect(screen.getByText('PIT-1')).toBeInTheDocument();
    expect(screen.getByText('PIT-2')).toBeInTheDocument();
  });

  it('shows empty state when no pit data', () => {
    render(<MetricsTable pitsData={[]} tablesData={[]} />);

    expect(screen.getByText('No pit data available')).toBeInTheDocument();
  });

  it('switches to By Pit tab', async () => {
    const user = userEvent.setup();

    render(<MetricsTable pitsData={mockPits} tablesData={mockTables} />);

    await user.click(screen.getByRole('tab', { name: /By Pit/i }));
    // Pit data should still be shown (same view)
    expect(screen.getByText('PIT-1')).toBeInTheDocument();
  });

  it('switches to By Table tab and shows tables', async () => {
    const user = userEvent.setup();

    render(<MetricsTable pitsData={mockPits} tablesData={mockTables} />);

    await user.click(screen.getByRole('tab', { name: /By Table/i }));
    expect(screen.getByText('BJ-01')).toBeInTheDocument();
    expect(screen.getByText('BJ-02')).toBeInTheDocument();
  });

  it('shows empty state in table tab when no tables', async () => {
    const user = userEvent.setup();

    render(<MetricsTable pitsData={mockPits} tablesData={[]} />);

    await user.click(screen.getByRole('tab', { name: /By Table/i }));
    expect(screen.getByText('No table data available')).toBeInTheDocument();
  });

  it('drills down to table view when pit is clicked', async () => {
    const user = userEvent.setup();
    const handlePitSelect = jest.fn();

    render(
      <MetricsTable
        pitsData={mockPits}
        tablesData={mockTables}
        onPitSelect={handlePitSelect}
      />,
    );

    // Click on PIT-1 to drill down
    await user.click(screen.getByText('PIT-1'));

    // Should call pit select callback
    expect(handlePitSelect).toHaveBeenCalledWith('PIT-1');

    // Should switch to table tab and show only PIT-1 tables
    expect(screen.getByText('BJ-01')).toBeInTheDocument();
    // BJ-02 belongs to PIT-2, should be filtered out
    expect(screen.queryByText('BJ-02')).not.toBeInTheDocument();
  });

  it('shows "All Pits" back button during drill-down', async () => {
    const user = userEvent.setup();

    render(<MetricsTable pitsData={mockPits} tablesData={mockTables} />);

    // Drill down to PIT-1
    await user.click(screen.getByText('PIT-1'));

    // Back button should appear
    const backButton = screen.getByText('← All Pits');
    expect(backButton).toBeInTheDocument();

    // Click back button to return to casino view
    await user.click(backButton);
    expect(screen.getByText('PIT-1')).toBeInTheDocument();
    expect(screen.getByText('PIT-2')).toBeInTheDocument();
  });

  it('shows casino pits count in tab label', () => {
    render(
      <MetricsTable
        casinoData={{ pits_count: 4, tables_count: 20 }}
        pitsData={mockPits}
        tablesData={mockTables}
      />,
    );

    expect(screen.getByText('(4)')).toBeInTheDocument();
  });

  it('calls onTableSelect when table row is clicked', async () => {
    const user = userEvent.setup();
    const handleTableSelect = jest.fn();

    render(
      <MetricsTable
        pitsData={mockPits}
        tablesData={mockTables}
        onTableSelect={handleTableSelect}
      />,
    );

    // Switch to table tab
    await user.click(screen.getByRole('tab', { name: /By Table/i }));
    await user.click(screen.getByText('BJ-01'));

    expect(handleTableSelect).toHaveBeenCalledWith('T1', 'PIT-1');
  });
});

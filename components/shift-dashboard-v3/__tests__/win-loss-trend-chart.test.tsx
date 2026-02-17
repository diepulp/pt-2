import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ShiftPitMetricsDTO } from '@/services/table-context/shift-metrics/dtos';

// Mock recharts
jest.mock('recharts', () => {
  const React = require('react');
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    LineChart: ({
      children,
      data,
    }: {
      children: React.ReactNode;
      data: unknown[];
    }) => (
      <div data-testid="line-chart" data-points={data.length}>
        {children}
      </div>
    ),
    Line: ({ dataKey, name }: { dataKey: string; name: string }) => (
      <div data-testid={`line-${name || dataKey}`} data-key={dataKey} />
    ),
    CartesianGrid: () => <div data-testid="cartesian-grid" />,
    XAxis: () => <div data-testid="x-axis" />,
    LabelList: () => <div data-testid="label-list" />,
    Tooltip: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Legend: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

import { WinLossTrendChart } from '../charts/win-loss-trend-chart';

function createMockPitData(count: number): ShiftPitMetricsDTO[] {
  return Array.from({ length: count }, (_, i) => ({
    pit_id: `Pit ${String.fromCharCode(65 + i)}`,
    tables_count: 5,
    tables_with_telemetry_count: 3,
    tables_good_coverage_count: 2,
    fills_total_cents: 100000 * (i + 1),
    credits_total_cents: 50000 * (i + 1),
    estimated_drop_rated_total_cents: 200000,
    estimated_drop_grind_total_cents: 50000,
    estimated_drop_buyins_total_cents: 250000, // invariant: rated (200000) + grind (50000)
    win_loss_inventory_total_cents: 150000 * (i + 1),
    win_loss_estimated_total_cents: 175000 * (i + 1),
  }));
}

describe('WinLossTrendChart', () => {
  it('renders loading skeleton', () => {
    render(<WinLossTrendChart pitsData={undefined} isLoading />);
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  it('renders empty state for undefined pitsData', () => {
    render(<WinLossTrendChart pitsData={undefined} />);
    expect(
      screen.getByText('Pit data unavailable for trend visualization'),
    ).toBeInTheDocument();
  });

  it('renders empty state for <2 pits', () => {
    render(<WinLossTrendChart pitsData={createMockPitData(1)} />);
    expect(
      screen.getByText('Pit data unavailable for trend visualization'),
    ).toBeInTheDocument();
  });

  it('renders chart with pitsData', () => {
    render(<WinLossTrendChart pitsData={createMockPitData(3)} />);
    expect(screen.getByTestId('line-chart')).toHaveAttribute(
      'data-points',
      '3',
    );
    expect(screen.getByTestId('line-winLoss')).toBeInTheDocument();
  });

  it('shows only winLoss series by default', () => {
    render(<WinLossTrendChart pitsData={createMockPitData(3)} />);
    expect(screen.getByTestId('line-winLoss')).toBeInTheDocument();
    expect(screen.queryByTestId('line-fills')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-credits')).not.toBeInTheDocument();
  });

  it('toggles fills series on click', async () => {
    const user = userEvent.setup();
    render(<WinLossTrendChart pitsData={createMockPitData(3)} />);

    const fillsButton = screen.getByRole('button', { name: 'Fills' });
    await user.click(fillsButton);

    expect(screen.getByTestId('line-winLoss')).toBeInTheDocument();
    expect(screen.getByTestId('line-fills')).toBeInTheDocument();
  });

  it('toggles credits series on click', async () => {
    const user = userEvent.setup();
    render(<WinLossTrendChart pitsData={createMockPitData(3)} />);

    const creditsButton = screen.getByRole('button', { name: 'Credits' });
    await user.click(creditsButton);

    expect(screen.getByTestId('line-winLoss')).toBeInTheDocument();
    expect(screen.getByTestId('line-credits')).toBeInTheDocument();
  });

  it('does not allow removing all series', async () => {
    const user = userEvent.setup();
    render(<WinLossTrendChart pitsData={createMockPitData(3)} />);

    // winLoss is the only active series, clicking it should keep it
    const winLossButton = screen.getByRole('button', { name: 'Win/Loss' });
    await user.click(winLossButton);

    expect(screen.getByTestId('line-winLoss')).toBeInTheDocument();
  });

  it('uses controlled series when provided', () => {
    render(
      <WinLossTrendChart
        pitsData={createMockPitData(3)}
        visibleSeries={['fills', 'credits']}
      />,
    );
    expect(screen.queryByTestId('line-winLoss')).not.toBeInTheDocument();
    expect(screen.getByTestId('line-fills')).toBeInTheDocument();
    expect(screen.getByTestId('line-credits')).toBeInTheDocument();
  });

  it('renders series toggle pills', () => {
    render(<WinLossTrendChart pitsData={createMockPitData(3)} />);
    expect(
      screen.getByRole('button', { name: 'Win/Loss' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fills' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Credits' })).toBeInTheDocument();
  });
});

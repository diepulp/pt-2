import { render, screen } from '@testing-library/react';

// Mock recharts to avoid SVG rendering issues in jsdom
jest.mock('recharts', () => {
  const React = require('react');
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    RadarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
      <div data-testid="radar-chart" data-points={data.length}>
        {children}
      </div>
    ),
    Radar: ({ dataKey, name }: { dataKey: string; name: string }) => (
      <div data-testid={`radar-${name}`} data-key={dataKey} />
    ),
    PolarGrid: () => <div data-testid="polar-grid" />,
    PolarAngleAxis: ({ dataKey }: { dataKey: string }) => (
      <div data-testid="polar-angle-axis" data-key={dataKey} />
    ),
    Tooltip: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Legend: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  };
});

import { FloorActivityRadar } from '../charts/floor-activity-radar';

describe('FloorActivityRadar', () => {
  it('renders loading skeleton', () => {
    render(
      <FloorActivityRadar
        ratedCount={0}
        unratedCount={0}
        isLoading
      />,
    );
    // Should show skeleton, not chart
    expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
  });

  it('renders without pitBreakdown (2-axis fallback)', () => {
    render(
      <FloorActivityRadar
        ratedCount={42}
        unratedCount={18}
        ratedPercentage={70}
      />,
    );
    expect(screen.getByTestId('radar-chart')).toHaveAttribute('data-points', '2');
    expect(screen.getByTestId('radar-rated')).toBeInTheDocument();
    expect(screen.getByTestId('radar-unrated')).toBeInTheDocument();
  });

  it('renders with pitBreakdown (multi-axis)', () => {
    const breakdown = [
      { pitLabel: 'Pit A', pitId: 'p1', ratedCount: 10, unratedCount: 5 },
      { pitLabel: 'Pit B', pitId: 'p2', ratedCount: 20, unratedCount: 8 },
      { pitLabel: 'Pit C', pitId: 'p3', ratedCount: 12, unratedCount: 5 },
    ];
    render(
      <FloorActivityRadar
        ratedCount={42}
        unratedCount={18}
        pitBreakdown={breakdown}
      />,
    );
    expect(screen.getByTestId('radar-chart')).toHaveAttribute('data-points', '3');
  });

  it('shows value-generating callout with percentage', () => {
    render(
      <FloorActivityRadar
        ratedCount={42}
        unratedCount={18}
        ratedPercentage={70}
      />,
    );
    expect(screen.getByText('70% of floor generating value')).toBeInTheDocument();
  });

  it('computes percentage when not provided', () => {
    render(
      <FloorActivityRadar
        ratedCount={75}
        unratedCount={25}
      />,
    );
    expect(screen.getByText('75% of floor generating value')).toBeInTheDocument();
  });

  it('shows total active count', () => {
    render(
      <FloorActivityRadar
        ratedCount={42}
        unratedCount={18}
      />,
    );
    expect(screen.getByText('60 active')).toBeInTheDocument();
  });
});

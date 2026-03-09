/**
 * CoverageWidget Component Tests
 *
 * Tests for the coverage widget rendering, health tiers, table ranking, and states.
 *
 * @see PRD-049 WS3 — Hook & Component Tests
 */

import { render, screen } from '@testing-library/react';

import type { RatingCoverageQueryResult } from '@/services/measurement/queries';

// Mock the hook
const mockUseShiftCoverage = jest.fn();
jest.mock('@/hooks/measurement/use-shift-coverage', () => ({
  useShiftCoverage: (...args: unknown[]) => mockUseShiftCoverage(...args),
}));

import { CoverageWidget } from '../coverage-widget';

function buildRows(
  overrides: Partial<RatingCoverageQueryResult['rows'][0]>[],
): RatingCoverageQueryResult {
  return {
    rows: overrides.map((o, i) => ({
      casino_id: 'casino-1',
      gaming_table_id: `table-${i + 1}`,
      table_session_id: `session-${i + 1}`,
      gaming_day: '2026-03-09',
      session_status: 'active',
      opened_at: '2026-03-09T08:00:00Z',
      closed_at: null,
      rated_seconds: 3600,
      open_seconds: 4800,
      untracked_seconds: 600,
      ghost_seconds: 0,
      idle_seconds: 600,
      rated_ratio: 0.75,
      slip_count: 3,
      ...o,
    })),
  };
}

describe('CoverageWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows skeleton during loading', () => {
    mockUseShiftCoverage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = render(
      <CoverageWidget casinoId="casino-1" gamingDay="2026-03-09" />,
    );
    expect(screen.getByText('Rating Coverage')).toBeInTheDocument();
    // Skeleton elements present (data-slot="skeleton" or role)
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no table sessions', () => {
    mockUseShiftCoverage.mockReturnValue({
      data: { rows: [] },
      isLoading: false,
      isError: false,
    });
    render(<CoverageWidget casinoId="casino-1" gamingDay="2026-03-09" />);
    expect(
      screen.getByText('No table sessions for current shift'),
    ).toBeInTheDocument();
  });

  it('throws error on query failure (for ErrorBoundary)', () => {
    mockUseShiftCoverage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    expect(() =>
      render(<CoverageWidget casinoId="casino-1" gamingDay="2026-03-09" />),
    ).toThrow('Coverage data unavailable');
  });

  it('displays HEALTHY badge when ratio >= 0.75', () => {
    mockUseShiftCoverage.mockReturnValue({
      data: buildRows([{ rated_seconds: 75, open_seconds: 100 }]),
      isLoading: false,
      isError: false,
    });
    render(<CoverageWidget casinoId="casino-1" gamingDay="2026-03-09" />);
    expect(screen.getByText('HEALTHY')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
  });

  it('displays WARNING badge when 0.50 <= ratio < 0.75', () => {
    mockUseShiftCoverage.mockReturnValue({
      data: buildRows([{ rated_seconds: 60, open_seconds: 100 }]),
      isLoading: false,
      isError: false,
    });
    render(<CoverageWidget casinoId="casino-1" gamingDay="2026-03-09" />);
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
  });

  it('displays CRITICAL badge when ratio < 0.50', () => {
    mockUseShiftCoverage.mockReturnValue({
      data: buildRows([{ rated_seconds: 30, open_seconds: 100 }]),
      isLoading: false,
      isError: false,
    });
    render(<CoverageWidget casinoId="casino-1" gamingDay="2026-03-09" />);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('30.0%')).toBeInTheDocument();
  });

  it('shows worst tables ranked by untracked ratio', () => {
    const rows = buildRows([
      {
        gaming_table_id: 'aaaa1111-0000-0000-0000-000000000001',
        untracked_seconds: 100,
        open_seconds: 200,
        rated_ratio: 0.5,
        rated_seconds: 100,
      },
      {
        gaming_table_id: 'bbbb2222-0000-0000-0000-000000000002',
        untracked_seconds: 180,
        open_seconds: 200,
        rated_ratio: 0.1,
        rated_seconds: 20,
      },
    ]);
    mockUseShiftCoverage.mockReturnValue({
      data: rows,
      isLoading: false,
      isError: false,
    });
    render(<CoverageWidget casinoId="casino-1" gamingDay="2026-03-09" />);

    // Worst table (higher untracked ratio) should appear first
    const tableLabels = screen.getAllByTitle(/^(aaaa1111|bbbb2222)/);
    expect(tableLabels[0]).toHaveAttribute(
      'title',
      'bbbb2222-0000-0000-0000-000000000002',
    );
    expect(tableLabels[1]).toHaveAttribute(
      'title',
      'aaaa1111-0000-0000-0000-000000000001',
    );
  });

  it('limits table ranking to 5 tables', () => {
    const rows = buildRows(
      Array.from({ length: 8 }, (_, i) => ({
        gaming_table_id: `table-${String(i).padStart(4, '0')}-0000-0000-0000-000000000000`,
        untracked_seconds: (i + 1) * 10,
        open_seconds: 200,
        rated_seconds: 150,
        rated_ratio: 0.75,
      })),
    );
    mockUseShiftCoverage.mockReturnValue({
      data: rows,
      isLoading: false,
      isError: false,
    });
    render(<CoverageWidget casinoId="casino-1" gamingDay="2026-03-09" />);

    // Only 5 table entries should be visible
    const tableEntries = screen.getAllByTitle(/^table-\d{4}/);
    expect(tableEntries).toHaveLength(5);
  });
});

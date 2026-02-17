import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  CashObsCasinoRollupDTO,
  CashObsPitRollupDTO,
  CashObsTableRollupDTO,
} from '@/services/table-context/dtos';

import { TelemetryRailPanel } from '../right-rail/telemetry-rail-panel';

const mockCasino: CashObsCasinoRollupDTO = {
  cash_out_observed_estimate_total: 50000,
  cash_out_observed_confirmed_total: 40000,
  cash_out_observation_count: 12,
};

const mockPits: CashObsPitRollupDTO[] = [
  {
    pit: 'PIT-1',
    cash_out_observed_estimate_total: 25000,
    cash_out_observation_count: 6,
  },
  {
    pit: 'PIT-2',
    cash_out_observed_estimate_total: 15000,
    cash_out_observation_count: 4,
  },
];

const mockTables: CashObsTableRollupDTO[] = [
  {
    table_id: 'T1',
    table_label: 'BJ-01',
    cash_out_observed_estimate_total: 10000,
    cash_out_observation_count: 5,
  },
  {
    table_id: 'T2',
    table_label: 'BJ-02',
    cash_out_observed_estimate_total: 8000,
    cash_out_observation_count: 4,
  },
  {
    table_id: 'T3',
    table_label: 'BJ-03',
    cash_out_observed_estimate_total: 6000,
    cash_out_observation_count: 3,
  },
  {
    table_id: 'T4',
    table_label: 'BJ-04',
    cash_out_observed_estimate_total: 4000,
    cash_out_observation_count: 2,
  },
  {
    table_id: 'T5',
    table_label: 'BJ-05',
    cash_out_observed_estimate_total: 2000,
    cash_out_observation_count: 1,
  },
  {
    table_id: 'T6',
    table_label: 'BJ-06',
    cash_out_observed_estimate_total: 1000,
    cash_out_observation_count: 1,
  },
];

describe('TelemetryRailPanel', () => {
  it('renders loading skeleton when isLoading', () => {
    const { container } = render(
      <TelemetryRailPanel
        casinoData={undefined}
        pitsData={undefined}
        tablesData={undefined}
        isLoading
      />,
    );

    // Should show skeleton elements
    expect(container.querySelector('[class*="animate"]')).toBeTruthy();
    expect(screen.queryByText('Casino Totals')).not.toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(
      <TelemetryRailPanel
        casinoData={undefined}
        pitsData={undefined}
        tablesData={undefined}
      />,
    );

    expect(screen.getByText('No observations')).toBeInTheDocument();
  });

  it('renders casino totals', () => {
    render(
      <TelemetryRailPanel
        casinoData={mockCasino}
        pitsData={undefined}
        tablesData={undefined}
      />,
    );

    expect(screen.getByText('Casino Totals')).toBeInTheDocument();
    expect(screen.getByText('12 observations')).toBeInTheDocument();
  });

  it('renders Telemetry header badge', () => {
    render(
      <TelemetryRailPanel
        casinoData={mockCasino}
        pitsData={undefined}
        tablesData={undefined}
      />,
    );

    expect(screen.getByText('TELEMETRY')).toBeInTheDocument();
  });

  it('renders pit breakdown collapsed by default', () => {
    render(
      <TelemetryRailPanel
        casinoData={mockCasino}
        pitsData={mockPits}
        tablesData={undefined}
      />,
    );

    // Pit section header should be visible
    expect(screen.getByText(/By Pit/)).toBeInTheDocument();
    // But individual pit data should not be (collapsed)
    expect(screen.queryByText('PIT-1')).not.toBeInTheDocument();
  });

  it('expands pit breakdown on click', async () => {
    const user = userEvent.setup();

    render(
      <TelemetryRailPanel
        casinoData={mockCasino}
        pitsData={mockPits}
        tablesData={undefined}
      />,
    );

    await user.click(screen.getByText(/By Pit/));

    // Pits should now be visible
    expect(screen.getByText('PIT-1')).toBeInTheDocument();
    expect(screen.getByText('PIT-2')).toBeInTheDocument();
  });

  it('collapses pit breakdown on second click', async () => {
    const user = userEvent.setup();

    render(
      <TelemetryRailPanel
        casinoData={mockCasino}
        pitsData={mockPits}
        tablesData={undefined}
      />,
    );

    // Expand
    await user.click(screen.getByText(/By Pit/));
    expect(screen.getByText('PIT-1')).toBeInTheDocument();

    // Collapse
    await user.click(screen.getByText(/By Pit/));
    expect(screen.queryByText('PIT-1')).not.toBeInTheDocument();
  });

  it('shows pit count in section header', () => {
    render(
      <TelemetryRailPanel
        casinoData={mockCasino}
        pitsData={mockPits}
        tablesData={undefined}
      />,
    );

    expect(screen.getByText(/By Pit \(2\)/)).toBeInTheDocument();
  });

  it('renders top 5 tables sorted by observation count', () => {
    render(
      <TelemetryRailPanel
        casinoData={mockCasino}
        pitsData={undefined}
        tablesData={mockTables}
      />,
    );

    expect(screen.getByText('Top Tables')).toBeInTheDocument();

    // Should show top 5 (BJ-01 through BJ-05), not BJ-06
    expect(screen.getByText('BJ-01')).toBeInTheDocument();
    expect(screen.getByText('BJ-05')).toBeInTheDocument();
    expect(screen.queryByText('BJ-06')).not.toBeInTheDocument();
  });

  it('displays observation count for tables', () => {
    render(
      <TelemetryRailPanel
        casinoData={mockCasino}
        pitsData={undefined}
        tablesData={mockTables}
      />,
    );

    expect(screen.getByText('5 obs')).toBeInTheDocument();
    expect(screen.getByText('4 obs')).toBeInTheDocument();
  });

  it('renders all sections together', () => {
    render(
      <TelemetryRailPanel
        casinoData={mockCasino}
        pitsData={mockPits}
        tablesData={mockTables}
      />,
    );

    expect(screen.getByText('Casino Totals')).toBeInTheDocument();
    expect(screen.getByText(/By Pit/)).toBeInTheDocument();
    expect(screen.getByText('Top Tables')).toBeInTheDocument();
  });
});

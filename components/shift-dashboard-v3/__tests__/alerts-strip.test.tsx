import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CashObsSpikeAlertDTO } from '@/services/table-context/dtos';

import { AlertsStrip } from '../center/alerts-strip';

const criticalAlert: CashObsSpikeAlertDTO = {
  entity_id: 'T1',
  entity_label: 'BJ-01',
  severity: 'critical',
  alert_type: 'cash_out_observed_spike_telemetry',
  observed_value: 5000,
  threshold: 3000,
  message: 'Cash out spike',
  downgraded: false,
  original_severity: 'critical',
  downgrade_reason: null,
};

const warnAlert: CashObsSpikeAlertDTO = {
  entity_id: 'T2',
  entity_label: 'BJ-02',
  severity: 'warn',
  alert_type: 'cash_out_observed_spike_telemetry',
  observed_value: 3500,
  threshold: 3000,
  message: 'Cash out spike',
  downgraded: true,
  original_severity: 'critical',
  downgrade_reason: 'low_coverage',
};

const infoAlert: CashObsSpikeAlertDTO = {
  entity_id: 'T3',
  entity_label: 'BJ-03',
  severity: 'info',
  alert_type: 'cash_out_observed_spike_telemetry',
  observed_value: 2800,
  threshold: 3000,
  message: 'Minor spike detected',
  downgraded: false,
  original_severity: 'info',
  downgrade_reason: null,
};

describe('AlertsStrip', () => {
  it('renders loading skeleton when isLoading is true', () => {
    render(<AlertsStrip alerts={undefined} isLoading />);
    // Loading state should not show alert content
    expect(screen.queryByText('Alerts')).not.toBeInTheDocument();
  });

  it('renders empty state when no alerts', () => {
    render(<AlertsStrip alerts={[]} />);
    expect(
      screen.getByText('No spike alerts in current time window'),
    ).toBeInTheDocument();
  });

  it('renders empty state when alerts is undefined', () => {
    render(<AlertsStrip alerts={undefined} />);
    expect(
      screen.getByText('No spike alerts in current time window'),
    ).toBeInTheDocument();
  });

  it('renders alerts sorted by severity (critical first)', () => {
    render(
      <AlertsStrip
        alerts={[infoAlert, criticalAlert, warnAlert]}
        maxDisplay={3}
      />,
    );

    const alertButtons = screen.getAllByRole('button');
    // First alert should be critical (BJ-01), second should be warn (BJ-02)
    expect(alertButtons[0]).toHaveTextContent('BJ-01');
    expect(alertButtons[1]).toHaveTextContent('BJ-02');
    expect(alertButtons[2]).toHaveTextContent('BJ-03');
  });

  it('limits displayed alerts to maxDisplay', () => {
    render(
      <AlertsStrip
        alerts={[criticalAlert, warnAlert, infoAlert]}
        maxDisplay={2}
      />,
    );

    // Should only show 2 alerts
    expect(screen.getByText('BJ-01')).toBeInTheDocument();
    expect(screen.getByText('BJ-02')).toBeInTheDocument();
    expect(screen.queryByText('BJ-03')).not.toBeInTheDocument();
  });

  it('shows severity badge counts', () => {
    render(<AlertsStrip alerts={[criticalAlert, warnAlert]} maxDisplay={3} />);

    expect(screen.getByText('1 critical')).toBeInTheDocument();
    expect(screen.getByText('1 warn')).toBeInTheDocument();
  });

  it('shows total count in header', () => {
    render(<AlertsStrip alerts={[criticalAlert, warnAlert]} maxDisplay={3} />);

    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('calls onAlertClick when alert is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

    render(
      <AlertsStrip
        alerts={[criticalAlert]}
        maxDisplay={3}
        onAlertClick={handleClick}
      />,
    );

    await user.click(screen.getByText('BJ-01'));
    expect(handleClick).toHaveBeenCalledWith(criticalAlert);
  });

  it('displays cash-out threshold message for spike alerts', () => {
    render(<AlertsStrip alerts={[criticalAlert]} maxDisplay={3} />);

    expect(screen.getByText(/exceeds/)).toBeInTheDocument();
    expect(screen.getByText(/threshold/)).toBeInTheDocument();
  });

  it('shows downgrade indicator for downgraded alerts', () => {
    render(<AlertsStrip alerts={[warnAlert]} maxDisplay={3} />);

    expect(screen.getByText(/Downgraded from critical/)).toBeInTheDocument();
    expect(screen.getByText(/low telemetry coverage/)).toBeInTheDocument();
  });

  it('shows View All button when alerts exceed maxDisplay', async () => {
    const user = userEvent.setup();
    const handleViewAll = jest.fn();

    render(
      <AlertsStrip
        alerts={[criticalAlert, warnAlert, infoAlert]}
        maxDisplay={2}
        onViewAll={handleViewAll}
      />,
    );

    const viewAllButton = screen.getByText('View All');
    expect(viewAllButton).toBeInTheDocument();

    await user.click(viewAllButton);
    expect(handleViewAll).toHaveBeenCalled();
  });

  it('does not show View All when alerts fit within maxDisplay', () => {
    render(<AlertsStrip alerts={[criticalAlert]} maxDisplay={3} />);

    expect(screen.queryByText('View All')).not.toBeInTheDocument();
  });
});

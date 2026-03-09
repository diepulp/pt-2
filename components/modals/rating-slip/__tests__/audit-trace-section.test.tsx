/**
 * AuditTraceSection Component Tests
 *
 * Tests for the collapsible audit trace panel inside rating slip modal.
 * Validates lazy fetch, chain display, partial chains, and states.
 *
 * @see PRD-049 WS3 — Hook & Component Tests
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AuditCorrelationQueryResult } from '@/services/measurement/queries';

// Mock the hook
const mockUseAuditEventCorrelation = jest.fn();
jest.mock('@/hooks/measurement/use-audit-event-correlation', () => ({
  useAuditEventCorrelation: (...args: unknown[]) =>
    mockUseAuditEventCorrelation(...args),
}));

import { AuditTraceSection } from '../audit-trace-section';

const fullChainRow: AuditCorrelationQueryResult['rows'][0] = {
  casino_id: 'casino-1',
  rating_slip_id: 'slip-1',
  player_id: 'player-1',
  start_time: '2026-03-09T08:00:00Z',
  end_time: '2026-03-09T09:00:00Z',
  slip_status: 'closed',
  buy_in_amount: 500,
  cash_out_amount: 300,
  pft_id: 'pft-1',
  pft_created_at: '2026-03-09T09:01:00Z',
  pft_direction: 'debit',
  pft_txn_kind: 'buy_in',
  pft_amount: 500,
  mtl_entry_id: 'mtl-1',
  mtl_occurred_at: '2026-03-09T09:02:00Z',
  mtl_txn_type: 'table_drop',
  mtl_direction: 'in',
  mtl_amount: 500,
  loyalty_ledger_id: 'loyalty-1',
  loyalty_created_at: '2026-03-09T09:03:00Z',
  loyalty_points_delta: 25,
  gaming_table_id: 'table-1',
  table_session_id: 'session-1',
  gaming_day: '2026-03-09',
};

const partialChainRow: AuditCorrelationQueryResult['rows'][0] = {
  ...fullChainRow,
  mtl_entry_id: null,
  mtl_occurred_at: null,
  mtl_txn_type: null,
  mtl_direction: null,
  mtl_amount: null,
  loyalty_ledger_id: null,
  loyalty_created_at: null,
  loyalty_points_delta: null,
};

describe('AuditTraceSection', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: idle state (collapsed, no fetch)
    mockUseAuditEventCorrelation.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
  });

  it('renders collapsed by default with trigger text', () => {
    render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    expect(screen.getByText('Audit Trace')).toBeInTheDocument();
    // Content should NOT be visible yet
    expect(screen.queryByText('Slip Closed')).not.toBeInTheDocument();
  });

  it('does not fetch until expanded', () => {
    render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    // Hook called with enabled=false (collapsed)
    expect(mockUseAuditEventCorrelation).toHaveBeenCalledWith(
      'slip-1',
      'casino-1',
      false,
    );
  });

  it('calls hook with enabled=true after expanding', async () => {
    render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    const trigger = screen.getByText('Audit Trace');
    await user.click(trigger);

    // After expand, hook should be called with enabled=true
    const lastCall =
      mockUseAuditEventCorrelation.mock.calls[
        mockUseAuditEventCorrelation.mock.calls.length - 1
      ];
    expect(lastCall[2]).toBe(true);
  });

  it('shows loading skeleton when fetching', async () => {
    mockUseAuditEventCorrelation.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    // Expand the collapsible
    await user.click(screen.getByText('Audit Trace'));
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows full chain with all 4 event nodes', async () => {
    mockUseAuditEventCorrelation.mockReturnValue({
      data: { rows: [fullChainRow] },
      isLoading: false,
      isError: false,
    });
    render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    await user.click(screen.getByText('Audit Trace'));

    expect(screen.getByText('Slip Closed')).toBeInTheDocument();
    expect(screen.getByText('Financial Transaction')).toBeInTheDocument();
    expect(screen.getByText('MTL Entry')).toBeInTheDocument();
    expect(screen.getByText('Loyalty Ledger')).toBeInTheDocument();
  });

  it('shows partial chain with "not recorded" for missing links', async () => {
    mockUseAuditEventCorrelation.mockReturnValue({
      data: { rows: [partialChainRow] },
      isLoading: false,
      isError: false,
    });
    render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    await user.click(screen.getByText('Audit Trace'));

    expect(screen.getByText('Slip Closed')).toBeInTheDocument();
    expect(screen.getByText('Financial Transaction')).toBeInTheDocument();
    // MTL and Loyalty are missing — should show "not recorded"
    const notRecorded = screen.getAllByText('not recorded');
    expect(notRecorded.length).toBe(2); // MTL + Loyalty
  });

  it('shows empty state when no downstream events', async () => {
    mockUseAuditEventCorrelation.mockReturnValue({
      data: { rows: [] },
      isLoading: false,
      isError: false,
    });
    render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    await user.click(screen.getByText('Audit Trace'));

    expect(
      screen.getByText('No downstream financial events'),
    ).toBeInTheDocument();
  });

  it('shows error message on query failure', async () => {
    mockUseAuditEventCorrelation.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    await user.click(screen.getByText('Audit Trace'));

    expect(screen.getByText('Failed to load audit trace')).toBeInTheDocument();
  });

  it('shows audit enrichment note after chain', async () => {
    mockUseAuditEventCorrelation.mockReturnValue({
      data: { rows: [fullChainRow] },
      isLoading: false,
      isError: false,
    });
    render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    await user.click(screen.getByText('Audit Trace'));

    expect(
      screen.getByText('Audit trail enrichment pending'),
    ).toBeInTheDocument();
  });

  it('shows loyalty points delta with sign', async () => {
    mockUseAuditEventCorrelation.mockReturnValue({
      data: { rows: [fullChainRow] },
      isLoading: false,
      isError: false,
    });
    render(
      <AuditTraceSection
        slipId="slip-1"
        casinoId="casino-1"
        slipStatus="closed"
      />,
    );
    await user.click(screen.getByText('Audit Trace'));

    expect(screen.getByText('+25 pts')).toBeInTheDocument();
  });
});

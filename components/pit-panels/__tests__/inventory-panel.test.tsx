/**
 * InventoryPanel — Mount + Legacy Placeholder Supersession (PRD-091 WS3b)
 *
 * Proves PRD Appendix A.3 cases #12–#14 plus refresh invalidation:
 *   - #12 RundownSummaryPanel is mounted on the Inventory/Rundown surface
 *   - #13 it consumes the canonical accounting projection seam (renders the
 *         SRL-TIA-001 label for the projection's declared calculation_kind)
 *   - #14 it is the SOLE operator-visible table-result statement — the legacy
 *         "win/loss unavailable" placeholder is absent and RundownReportCard
 *         carries only Fills/Credits/Drop telemetry (FR-1 / FR-3 / FIB F.4-A)
 *   - refresh also invalidates the accounting projection query key (FR-1)
 *
 * @see components/pit-panels/inventory-panel.tsx
 * @see PRD-091 Appendix A.3 #12–#14, EXEC-091 WS3b, FR-1/FR-2/FR-3
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AccountingProjectionApiResponse } from '@/hooks/table-context/use-table-rundown';
import { tableContextKeys } from '@/services/table-context/keys';

// ResizeObserver / matchMedia shims (not in jsdom)
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// === Hook mocks ===

// Inventory snapshots — preserve real helpers (calculateChipsetTotal,
// STANDARD_DENOMINATIONS) used by the panel; override only the data hook.
const mockUseInventorySnapshots = jest.fn();
jest.mock('@/hooks/table-context/use-inventory-snapshots', () => {
  const actual = jest.requireActual(
    '@/hooks/table-context/use-inventory-snapshots',
  );
  return {
    ...actual,
    useInventorySnapshots: (...args: unknown[]) =>
      mockUseInventorySnapshots(...args),
  };
});

const mockUseDropEvents = jest.fn();
jest.mock('@/hooks/table-context/use-drop-events', () => ({
  useDropEvents: (...args: unknown[]) => mockUseDropEvents(...args),
}));

const mockUseCurrentTableSession = jest.fn();
jest.mock('@/hooks/table-context/use-table-session', () => ({
  useCurrentTableSession: (...args: unknown[]) =>
    mockUseCurrentTableSession(...args),
}));

// Accounting projection seam — preserve real tableRundownKeys (the panel
// imports it for refresh invalidation); override only the query hook so the
// real RundownSummaryPanel renders deterministically.
const mockUseTableAccountingProjection = jest.fn();
jest.mock('@/hooks/table-context/use-table-rundown', () => {
  const actual = jest.requireActual('@/hooks/table-context/use-table-rundown');
  return {
    ...actual,
    useTableAccountingProjection: (...args: unknown[]) =>
      mockUseTableAccountingProjection(...args),
  };
});

// RundownReportCard data hooks — render the REAL card so we can assert it no
// longer states a table result and still shows Fills/Credits/Drop telemetry.
const mockUseRundownReport = jest.fn();
jest.mock('@/hooks/table-context/use-rundown-report', () => ({
  useRundownReport: (...args: unknown[]) => mockUseRundownReport(...args),
}));

jest.mock('@/hooks/table-context/use-persist-rundown', () => ({
  usePersistRundown: () => ({ mutate: jest.fn(), isPending: false }),
}));

// Chip count dialog pulls in the Supabase browser client — stub it out.
jest.mock('@/components/table/chip-count-capture-dialog', () => ({
  ChipCountCaptureDialog: () => null,
}));

// eslint-disable-next-line import/first
import { tableRundownKeys } from '@/hooks/table-context/use-table-rundown';
// eslint-disable-next-line import/first
import { InventoryPanel } from '../inventory-panel';

// === Fixtures ===

function baseProjection(
  overrides: Partial<AccountingProjectionApiResponse>,
): AccountingProjectionApiResponse {
  return {
    table_session_id: 'session-1',
    casino_id: 'casino-1',
    calculation_kind: 'inventory_only',
    projected_table_win_loss_cents: null,
    partial_table_result_cents: null,
    final_table_win_loss_cents: null,
    telemetry_derived_drop_estimate_cents: null,
    drop_estimate_state: 'absent',
    custody_status: 'non_custody_estimate',
    completeness: { status: 'partial' },
    source_authority: {
      drop: null,
      snapshots: null,
      fills: null,
      credits: null,
    },
    integrity_issues: [],
    request_id: 'req-1',
    derived_at: '2026-06-01T14:00:00.000Z',
    ...overrides,
  };
}

const activeSession = {
  id: 'session-1',
  status: 'ACTIVE' as const,
};

const rundownReport = {
  id: 'report-1',
  fills_total_cents: 50000,
  credits_total_cents: 20000,
  drop_total_cents: 30000,
  finalized_at: null,
  has_late_events: false,
};

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <InventoryPanel
        tableName="Blackjack 1"
        tableId="table-1"
        casinoId="casino-1"
        gamingDay="2026-06-14"
      />
    </QueryClientProvider>,
  );
  return { ...utils, invalidateSpy };
}

beforeEach(() => {
  jest.clearAllMocks();

  // Default: snapshots/drops loaded (not loading → Refresh enabled).
  mockUseInventorySnapshots.mockReturnValue({
    data: [],
    isLoading: false,
    dataUpdatedAt: 0,
  });
  mockUseDropEvents.mockReturnValue({ data: [], isLoading: false });
  mockUseCurrentTableSession.mockReturnValue({ data: activeSession });
  mockUseRundownReport.mockReturnValue({
    data: rundownReport,
    isLoading: false,
  });
  mockUseTableAccountingProjection.mockReturnValue({
    data: baseProjection({
      calculation_kind: 'inventory_only',
      partial_table_result_cents: '-70000',
    }),
    isLoading: false,
    error: null,
  });
});

describe('InventoryPanel — rundown surface mount (A.3 #12–#14)', () => {
  // #12
  it('mounts RundownSummaryPanel on the Inventory/Rundown surface', () => {
    renderPanel();
    expect(screen.getByText('Session Rundown')).toBeInTheDocument();
  });

  it('does NOT mount the rundown surface when there is no current session', () => {
    mockUseCurrentTableSession.mockReturnValue({ data: undefined });
    renderPanel();
    expect(screen.queryByText('Session Rundown')).not.toBeInTheDocument();
    expect(screen.queryByText('Partial Table Result')).not.toBeInTheDocument();
  });

  // #13
  it('consumes the projection seam — renders the canonical label for the declared kind', () => {
    renderPanel();
    expect(screen.getByText('Partial Table Result')).toBeInTheDocument();
    expect(screen.getByText('-$700')).toBeInTheDocument();
  });

  it('renders the Projected Win/Loss label when the projection is telemetry_drop_formula', () => {
    mockUseTableAccountingProjection.mockReturnValue({
      data: baseProjection({
        calculation_kind: 'telemetry_drop_formula',
        projected_table_win_loss_cents: '1000000',
      }),
      isLoading: false,
      error: null,
    });
    renderPanel();
    expect(screen.getByText('Projected Win/Loss')).toBeInTheDocument();
    expect(screen.getByText('$10,000')).toBeInTheDocument();
  });

  // #14 — sole table-result statement; legacy placeholder superseded
  it('is the SOLE operator-visible table-result statement; legacy placeholder absent', () => {
    renderPanel();

    // Exactly one canonical result statement.
    expect(screen.getAllByText('Partial Table Result')).toHaveLength(1);

    // Legacy placeholder / competing result language absent.
    expect(
      screen.queryByText(/win\/loss unavailable/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Win/Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('Final Win/Loss')).not.toBeInTheDocument();
    // No competing telemetry-result label when the projection is inventory_only.
    expect(screen.queryByText('Projected Win/Loss')).not.toBeInTheDocument();
  });

  it('keeps RundownReportCard as Fills/Credits/Drop telemetry only (no result language)', () => {
    renderPanel();
    expect(screen.getByText('Rundown Report')).toBeInTheDocument();
    expect(screen.getByText('Fills')).toBeInTheDocument();
    expect(screen.getByText('Credits')).toBeInTheDocument();
    expect(screen.getByText('Drop')).toBeInTheDocument();
  });
});

describe('InventoryPanel — refresh invalidation (FR-1)', () => {
  it('refresh invalidates inventory, drops, AND the accounting projection query', async () => {
    const user = userEvent.setup();
    const { invalidateSpy } = renderPanel();

    await user.click(screen.getByRole('button', { name: /refresh/i }));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: tableContextKeys.inventoryHistory('table-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: tableContextKeys.drops('table-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: tableRundownKeys.detail('session-1'),
    });
  });
});

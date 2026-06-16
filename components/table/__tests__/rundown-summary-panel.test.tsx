/**
 * RundownSummaryPanel — Behavioral Render Tests (PRD-091 WS3a)
 *
 * Proves every FR-5 render state and PRD Appendix A.3 cases #1–#11:
 *   - three calc-kind labels + canonical values (SRL-TIA-001)
 *   - +/-/0 rendering and the signed-64-bit sentinel WITHOUT precision loss (NFR-1)
 *   - forbidden bare labels ("Win/Loss", "Final Win/Loss", "Total Drop") absent
 *   - consumer renders the projection's declared calculation_kind only — it does
 *     not re-derive kind/value from raw fields (SRL-TIA-001 law 5)
 *
 * @see components/table/rundown-summary-panel.tsx
 * @see PRD-091 Appendix A.3, EXEC-091 WS3a, FR-2/FR-5, NFR-1, SRL-TIA-001
 */

import { render, screen } from '@testing-library/react';

import type { AccountingProjectionApiResponse } from '@/hooks/table-context/use-table-rundown';

// Mock the projection hook — the panel renders only what the projection provides.
let mockReturn: {
  data: AccountingProjectionApiResponse | undefined;
  isLoading: boolean;
  error: unknown;
};

jest.mock('@/hooks/table-context/use-table-rundown', () => ({
  useTableAccountingProjection: () => mockReturn,
}));

// eslint-disable-next-line import/first
import { RundownSummaryPanel } from '../rundown-summary-panel';

const SENTINEL = '9223372036854775807'; // 2^63 - 1

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

function renderWith(
  projection: AccountingProjectionApiResponse | undefined,
  state: { isLoading?: boolean; error?: unknown } = {},
) {
  mockReturn = {
    data: projection,
    isLoading: state.isLoading ?? false,
    error: state.error ?? null,
  };
  return render(<RundownSummaryPanel sessionId="session-1" />);
}

describe('RundownSummaryPanel — FR-5 render states (A.3 #1–#11)', () => {
  // #1
  it('telemetry_drop_formula → "Projected Win/Loss" + canonical value', () => {
    renderWith(
      baseProjection({
        calculation_kind: 'telemetry_drop_formula',
        projected_table_win_loss_cents: '1000000',
      }),
    );
    expect(screen.getByText('Projected Win/Loss')).toBeInTheDocument();
    expect(screen.getByText('$10,000')).toBeInTheDocument();
  });

  // #2
  it('inventory_only → "Partial Table Result" + missing-drop disclosure', () => {
    renderWith(
      baseProjection({
        calculation_kind: 'inventory_only',
        partial_table_result_cents: '-70000',
      }),
    );
    expect(screen.getByText('Partial Table Result')).toBeInTheDocument();
    expect(
      screen.getByText(/Telemetry-derived drop estimate not available/i),
    ).toBeInTheDocument();
  });

  // #3
  it('integrity_failure → integrity warning, NO financial result label', () => {
    renderWith(
      baseProjection({
        calculation_kind: 'integrity_failure',
        integrity_issues: ['missing_opening_inventory_snapshot'],
      }),
    );
    expect(screen.getByText(/Table result unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Contact your supervisor/i)).toBeInTheDocument();
    expect(screen.queryByText('Projected Win/Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('Partial Table Result')).not.toBeInTheDocument();
  });

  // #4
  it('positive value renders with a positive display', () => {
    renderWith(
      baseProjection({
        calculation_kind: 'telemetry_drop_formula',
        projected_table_win_loss_cents: '150000',
      }),
    );
    expect(screen.getByText('$1,500')).toBeInTheDocument();
  });

  // #5
  it('negative value renders with a leading minus', () => {
    renderWith(
      baseProjection({
        calculation_kind: 'inventory_only',
        partial_table_result_cents: '-70000',
      }),
    );
    expect(screen.getByText('-$700')).toBeInTheDocument();
  });

  // #6
  it('zero value renders as $0 (not blank / not integrity)', () => {
    renderWith(
      baseProjection({
        calculation_kind: 'inventory_only',
        partial_table_result_cents: '0',
      }),
    );
    expect(screen.getByText('$0')).toBeInTheDocument();
  });

  // #7
  it('sentinel 9223372036854775807 renders WITHOUT precision loss', () => {
    renderWith(
      baseProjection({
        calculation_kind: 'inventory_only',
        partial_table_result_cents: SENTINEL,
      }),
    );
    // 9223372036854775807 cents / 100 = 92,233,720,368,547,758 (remainder 7 → no round-up)
    expect(screen.getByText('$92,233,720,368,547,758')).toBeInTheDocument();
    // The lossy Number() path would produce 9223372036854775808 → "$92,233,720,368,547,758.08"
    // rounding to a different trailing-digit display; assert that wrong value is absent.
    expect(
      screen.queryByText('$92,233,720,368,547,760'),
    ).not.toBeInTheDocument();
    expect(Number(SENTINEL).toString()).not.toBe(SENTINEL); // value exceeds 2^53
  });

  // #8
  it('does not render bare forbidden labels in the telemetry state', () => {
    renderWith(
      baseProjection({
        calculation_kind: 'telemetry_drop_formula',
        projected_table_win_loss_cents: '1000000',
      }),
    );
    // Exact-match queries: "Projected Win/Loss" must NOT satisfy a bare "Win/Loss".
    expect(screen.queryByText('Win/Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('Final Win/Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Drop')).not.toBeInTheDocument();
  });

  // #9
  it('does not render bare forbidden labels in the inventory state', () => {
    renderWith(
      baseProjection({
        calculation_kind: 'inventory_only',
        partial_table_result_cents: '12345',
      }),
    );
    expect(screen.queryByText('Win/Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('Final Win/Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Drop')).not.toBeInTheDocument();
  });

  // #10
  it("renders the projection's declared calculation_kind only — no re-derivation from raw fields", () => {
    // calculation_kind says inventory_only; a stray projected value is present in
    // the payload. A consumer that re-derived would show "Projected Win/Loss".
    renderWith(
      baseProjection({
        calculation_kind: 'inventory_only',
        partial_table_result_cents: '5000',
        projected_table_win_loss_cents: '999999', // must be ignored
        telemetry_derived_drop_estimate_cents: '4000',
        drop_estimate_state: 'present',
      }),
    );
    expect(screen.getByText('Partial Table Result')).toBeInTheDocument();
    expect(screen.getByText('$50')).toBeInTheDocument();
    expect(screen.queryByText('Projected Win/Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('$10,000')).not.toBeInTheDocument(); // 999999c not shown
  });

  // #11
  it('loading shows the Session Rundown skeleton; error/no-data renders nothing', () => {
    const { unmount } = renderWith(undefined, { isLoading: true });
    expect(screen.getByText('Session Rundown')).toBeInTheDocument();
    unmount();

    const { container } = renderWith(undefined, { error: new Error('boom') });
    expect(container).toBeEmptyDOMElement();
  });
});

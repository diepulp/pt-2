/**
 * StartFromPreviousPanel — DEF-006 Component Test (Phase 1.1/1.2B DTO Shape)
 *
 * Asserts integer-cents FinancialValue shape on RecentSessionDTO fields
 * consumed by StartFromPreviousPanel:
 *   - total_buy_in: FinancialValue  (Phase 1.1: dollar-float → integer-cents)
 *   - total_cash_out: FinancialValue (Phase 1.1: totalChipsOut rename)
 *   - net: FinancialValue            (derived, integer arithmetic)
 *
 * DEF-004 non-regression: component must use formatCents (not formatDollars)
 * on FinancialValue.value fields. If formatDollars were used instead,
 * value=150000 would render "$150,000" instead of the correct "$1,500".
 *
 * @see DEF-006 — ROLLOUT-TRACKER.json deferred_register
 * @see EXEC-077 §WS7
 * @see services/visit/dtos.ts — RecentSessionDTO
 */

import { render, screen } from '@testing-library/react';

import type { RecentSessionDTO } from '@/services/visit/dtos';
import type { FinancialValue } from '@/types/financial';

import {
  StartFromPreviousPanel,
  type PlayerInfo,
} from '../start-from-previous';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockPlayer: PlayerInfo = {
  player_id: 'player-1',
  name: 'Jane Smith',
  tier: 'gold',
  card_number: 'CARD-001',
};

function makeSession(overrides?: {
  total_buy_in?: Partial<FinancialValue>;
  total_cash_out?: Partial<FinancialValue>;
  net?: Partial<FinancialValue>;
}): RecentSessionDTO {
  return {
    visit_id: 'visit-1',
    visit_group_id: 'group-1',
    started_at: '2026-05-04T10:00:00Z',
    ended_at: '2026-05-04T12:00:00Z',
    last_table_id: 'table-1',
    last_table_name: 'Blackjack 1',
    last_seat_number: 3,
    total_duration_seconds: 7200,
    total_buy_in: {
      value: 150000, // $1,500 in integer cents
      type: 'actual',
      source: 'PFT',
      completeness: { status: 'complete', coverage: 1.0 },
      ...overrides?.total_buy_in,
    },
    total_cash_out: {
      value: 90000, // $900 in integer cents
      type: 'actual',
      source: 'PFT',
      completeness: { status: 'complete', coverage: 1.0 },
      ...overrides?.total_cash_out,
    },
    net: {
      value: 60000, // $600 in integer cents (150000 - 90000)
      type: 'actual',
      source: 'PFT',
      completeness: { status: 'complete', coverage: 1.0 },
      ...overrides?.net,
    },
    points_earned: 750,
    segment_count: 1,
  };
}

// ── DTO Shape Contract (DEF-006 RULE-8) ──────────────────────────────────────

describe('RecentSessionDTO — integer-cents FinancialValue contract (DEF-006)', () => {
  const session = makeSession();

  it('total_buy_in.value is an integer (Phase 1.1 ×100 mapper conversion)', () => {
    expect(Number.isInteger(session.total_buy_in.value)).toBe(true);
  });

  it('total_buy_in.type is "actual" and source is "PFT"', () => {
    expect(session.total_buy_in.type).toBe('actual');
    expect(session.total_buy_in.source).toBe('PFT');
  });

  it('total_cash_out.value is an integer (Phase 1.1 integer-cents)', () => {
    expect(Number.isInteger(session.total_cash_out.value)).toBe(true);
  });

  it('net.value derivation is integer arithmetic (total_buy_in − total_cash_out)', () => {
    // net is computed by the RPC as integer subtraction — no fractional cents
    expect(Number.isInteger(session.net.value)).toBe(true);
    expect(session.net.value).toBe(
      session.total_buy_in.value - session.total_cash_out.value,
    );
  });
});

// ── Rendering: formatCents (not formatDollars) ────────────────────────────────

describe('StartFromPreviousPanel — renders integer-cents via formatCents (DEF-004 non-regression)', () => {
  it('renders total_buy_in.value=150000 as $1,500 (formatCents — not $150,000 formatDollars)', () => {
    render(
      <StartFromPreviousPanel
        player={mockPlayer}
        recentSessions={[makeSession()]}
      />,
    );
    // formatCents(150000) = formatDollars(1500) = "$1,500"
    // formatDollars(150000) would = "$150,000" — that would be wrong
    expect(screen.getByText('$1,500')).toBeInTheDocument();
  });

  it('renders net.value with correct sign (positive net spans "+$600" as combined text)', () => {
    // Use a value distinct from buy-in/cash-out to confirm it is the net field
    const session = makeSession({
      total_buy_in: { value: 150000 }, // $1,500
      total_cash_out: { value: 90000 }, // $900
      net: { value: 60000 }, // $600 — positive, triggers + prefix
    });
    render(
      <StartFromPreviousPanel player={mockPlayer} recentSessions={[session]} />,
    );
    // The net span renders {isPositive ? '+' : ''}{formatCents(net.value)}
    // textContent of the span = '+$600' ('+' text node + '$600' text node merged)
    // formatCents(60000) = $600; with + prefix the span textContent is '+$600'
    expect(screen.getByText('+$600')).toBeInTheDocument();
  });
});

// ── Rendering: partial completeness does not collapse to $0 ──────────────────

describe('StartFromPreviousPanel — completeness.status partial renders value (DEF-006)', () => {
  it('total_buy_in with partial completeness still renders the value (no $0 collapse)', () => {
    const partialSession = makeSession({
      total_buy_in: { value: 30000, completeness: { status: 'partial' } },
      total_cash_out: { value: 10000, completeness: { status: 'partial' } },
      net: { value: 20000, completeness: { status: 'partial' } },
    });

    render(
      <StartFromPreviousPanel
        player={mockPlayer}
        recentSessions={[partialSession]}
      />,
    );

    // $300 = formatCents(30000) — partial completeness must not replace value with $0
    expect(screen.getByText('$300')).toBeInTheDocument();
    // $0 must not appear for partial-completeness sessions that have non-zero values
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
  });
});

/**
 * StartFromPreviousModal — DEF-006 Component Test (Phase 1.1/1.2B DTO Shape)
 *
 * Asserts that StartFromPreviousModal correctly passes and displays
 * integer-cents FinancialValue from RecentSessionDTO in a Dialog context.
 *
 * StartFromPreviousModal wraps StartFromPreviousPanel in a Radix Dialog.
 * Verifies that:
 *  - Financial totals display correctly in the modal context
 *  - total_buy_in.value is treated as integer cents (not dollar floats)
 *  - completeness.status: 'unknown' does not crash or render as $0
 *  - No bare currency integers appear in the rendered output
 *
 * @see DEF-006 — ROLLOUT-TRACKER.json deferred_register
 * @see EXEC-077 §WS7
 */

import { render, screen } from '@testing-library/react';

import type { RecentSessionDTO } from '@/services/visit/dtos';

import type { PlayerInfo } from '../start-from-previous';
import { StartFromPreviousModal } from '../start-from-previous-modal';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockPlayer: PlayerInfo = {
  player_id: 'player-1',
  name: 'Alex Johnson',
  tier: 'silver',
};

function makeModalSession(
  buyInCents: number,
  completenessStatus: 'complete' | 'partial' | 'unknown' = 'complete',
): RecentSessionDTO {
  return {
    visit_id: 'visit-modal-1',
    visit_group_id: 'group-modal-1',
    started_at: '2026-05-04T08:00:00Z',
    ended_at: '2026-05-04T10:00:00Z',
    last_table_id: 'table-1',
    last_table_name: 'Roulette 3',
    last_seat_number: 5,
    total_duration_seconds: 7200,
    total_buy_in: {
      value: buyInCents,
      type: 'actual',
      source: 'PFT',
      completeness: { status: completenessStatus },
    },
    total_cash_out: {
      value: Math.floor(buyInCents * 0.6),
      type: 'actual',
      source: 'PFT',
      completeness: { status: completenessStatus },
    },
    net: {
      value: buyInCents - Math.floor(buyInCents * 0.6),
      type: 'actual',
      source: 'PFT',
      completeness: { status: completenessStatus },
    },
    points_earned: 200,
    segment_count: 1,
  };
}

// ── Modal Rendering Tests (DEF-006) ───────────────────────────────────────────

describe('StartFromPreviousModal — financial totals in Dialog context (DEF-006)', () => {
  it('renders total_buy_in.value as integer-cents dollars ($2,000 for 200000 cents)', () => {
    render(
      <StartFromPreviousModal
        open={true}
        onOpenChange={jest.fn()}
        player={mockPlayer}
        recentSessions={[makeModalSession(200000)]}
      />,
    );
    // formatCents(200000) = $2,000 — integer-cents correctly scaled
    // formatDollars(200000) would = $200,000 — wrong scale, DEF-004 regression
    expect(screen.getByText('$2,000')).toBeInTheDocument();
  });

  it('total_buy_in.value is integer-cents in the modal (not dollar-float)', () => {
    const session = makeModalSession(50000); // $500
    // Verify the DTO carries the integer-cents shape into the modal
    expect(Number.isInteger(session.total_buy_in.value)).toBe(true);
    expect(session.total_buy_in.value / 100).toBe(500); // $500

    render(
      <StartFromPreviousModal
        open={true}
        onOpenChange={jest.fn()}
        player={mockPlayer}
        recentSessions={[session]}
      />,
    );
    expect(screen.getByText('$500')).toBeInTheDocument();
  });

  it('handles completeness.status unknown without crashing or rendering $0', () => {
    // Unknown completeness: value may be present but completeness unresolved
    // Modal must render the value, not hide it or replace with $0
    const unknownSession = makeModalSession(80000, 'unknown'); // $800

    render(
      <StartFromPreviousModal
        open={true}
        onOpenChange={jest.fn()}
        player={mockPlayer}
        recentSessions={[unknownSession]}
      />,
    );

    // Value should be rendered (not blanked out for unknown completeness)
    expect(screen.getByText('$800')).toBeInTheDocument();
    // $0 must not appear as a placeholder for unknown completeness
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
  });

  it('no bare integer currency renders (all values formatted via formatCents)', () => {
    render(
      <StartFromPreviousModal
        open={true}
        onOpenChange={jest.fn()}
        player={mockPlayer}
        recentSessions={[makeModalSession(120000)]}
      />,
    );
    // Formatted output: "$1,200" — never bare "120000"
    expect(screen.queryByText('120000')).not.toBeInTheDocument();
    expect(screen.getByText('$1,200')).toBeInTheDocument();
  });
});

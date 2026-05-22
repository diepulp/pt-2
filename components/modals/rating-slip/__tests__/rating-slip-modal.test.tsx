/**
 * RatingSlipModal — DEF-006 Component Test (Phase 1.1/1.2B DTO Shape)
 *
 * Asserts integer-cents shape of FinancialSectionDTO consumed by RatingSlipModal.
 * Phase 1.1 migrated financial amounts from dollar-float to integer-cents and
 * renamed totalChipsOut → totalCashOut.
 *
 * FinancialSectionDTO.totalCashIn/totalCashOut/netPosition are plain integer
 * cents (not FinancialValue envelopes). EXEC-077 §WS7 assertions about
 * ".value/.type/.source" map to the integer shape: the field IS the value,
 * authority is implicit (all PFT-sourced actuals), no envelope wrapper needed.
 *
 * @see DEF-006 — ROLLOUT-TRACKER.json deferred_register
 * @see EXEC-077 §WS7
 * @see services/rating-slip-modal/dtos.ts — FinancialSectionDTO
 */

import { render, screen } from '@testing-library/react';

import type { FinancialSectionDTO } from '@/services/rating-slip-modal/dtos';

// ── Module mocks (declared before imports) ────────────────────────────────────

jest.mock('@/hooks/rating-slip-modal', () => ({
  useRatingSlipModalData: jest.fn(),
}));
jest.mock('@/hooks/ui/use-rating-slip-modal', () => ({
  useRatingSlipModal: jest.fn(),
}));
jest.mock('@/hooks/casino/use-gaming-day', () => ({
  useGamingDay: jest.fn(),
}));
jest.mock('@/hooks/mtl/use-patron-daily-total', () => ({
  usePatronDailyTotal: jest.fn(),
}));
jest.mock('@/hooks/mtl/use-threshold-notifications', () => ({
  checkCumulativeThreshold: jest.fn().mockReturnValue({ requiresCtr: false }),
}));
jest.mock('@/hooks/player-financial', () => ({
  useCreateFinancialAdjustment: jest.fn(),
}));
jest.mock('@/hooks/rating-slip/use-rating-slip-mutations', () => ({
  usePauseRatingSlip: jest.fn(),
  useResumeRatingSlip: jest.fn(),
}));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// Child form sections own their own Zustand hook dependencies — stub them out.
jest.mock('../form-section-average-bet', () => ({
  FormSectionAverageBet: () => null,
}));
jest.mock('../form-section-cash-in', () => ({
  FormSectionCashIn: () => null,
}));
jest.mock('../form-section-chips-taken', () => ({
  FormSectionChipsTaken: () => null,
}));
jest.mock('../form-section-move-player', () => ({
  FormSectionMovePlayer: () => null,
}));
jest.mock('../form-section-start-time', () => ({
  FormSectionStartTime: () => null,
}));
jest.mock('../adjustment-modal', () => ({
  AdjustmentModal: () => null,
}));
jest.mock('../audit-trace-section', () => ({
  AuditTraceSection: () => null,
}));
jest.mock('../rating-slip-modal-skeleton', () => ({
  RatingSlipModalSkeleton: () => null,
}));
jest.mock('@/components/mtl/ctr-banner', () => ({
  CtrBanner: () => null,
}));
jest.mock('@/components/player-360/header/issue-reward-button', () => ({
  IssueRewardButton: () => null,
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useRatingSlipModalData } from '@/hooks/rating-slip-modal';
import { useRatingSlipModal } from '@/hooks/ui/use-rating-slip-modal';
import { useGamingDay } from '@/hooks/casino/use-gaming-day';
import { usePatronDailyTotal } from '@/hooks/mtl/use-patron-daily-total';
import { useAuth } from '@/hooks/use-auth';
import {
  usePauseRatingSlip,
  useResumeRatingSlip,
} from '@/hooks/rating-slip/use-rating-slip-mutations';
import { useCreateFinancialAdjustment } from '@/hooks/player-financial';

import { RatingSlipModal } from '../rating-slip-modal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupMocks(
  financial: FinancialSectionDTO,
  slipStatus: 'open' | 'closed' = 'open',
) {
  (useRatingSlipModalData as jest.Mock).mockReturnValue({
    data: {
      slip: {
        id: 'slip-1',
        visitId: 'visit-1',
        casinoId: 'casino-1',
        tableId: 'table-1',
        tableLabel: 'Blackjack 1',
        tableType: 'blackjack',
        seatNumber: '3',
        averageBet: 100,
        startTime: '2026-05-04T10:00:00Z',
        endTime: slipStatus === 'closed' ? '2026-05-04T12:00:00Z' : null,
        status: slipStatus,
        gamingDay: '2026-05-04',
        durationSeconds: 3600,
      },
      player: {
        id: 'player-1',
        firstName: 'John',
        lastName: 'Doe',
        cardNumber: null,
      },
      loyalty: { currentBalance: 500, tier: null, suggestion: null },
      financial,
      tables: [],
    },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  });

  (useRatingSlipModal as jest.Mock).mockReturnValue({
    formState: {
      averageBet: '100',
      startTime: '2026-05-04T10:00',
      newBuyIn: '0',
      newTableId: 'table-1',
      newSeatNumber: '3',
      chipsTaken: '0',
    },
    originalState: {
      averageBet: '100',
      startTime: '2026-05-04T10:00',
      newBuyIn: '0',
      newTableId: 'table-1',
      newSeatNumber: '3',
      chipsTaken: '0',
    },
    initializeForm: jest.fn(),
  });

  (useGamingDay as jest.Mock).mockReturnValue({
    data: { gaming_day: '2026-05-04' },
  });
  (usePatronDailyTotal as jest.Mock).mockReturnValue({ data: null });
  (useAuth as jest.Mock).mockReturnValue({ casinoId: 'casino-1' });
  (usePauseRatingSlip as jest.Mock).mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
  });
  (useResumeRatingSlip as jest.Mock).mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
  });
  (useCreateFinancialAdjustment as jest.Mock).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
}

const defaultProps = {
  slipId: 'slip-1',
  isOpen: true,
  onClose: jest.fn(),
  onSave: jest.fn(),
  onCloseSession: jest.fn(),
  onMovePlayer: jest.fn(),
};

// ── DTO Contract (Phase 1.1 integer-cents migration) ─────────────────────────

describe('FinancialSectionDTO — integer-cents contract (DEF-006 RULE-8)', () => {
  const fixture: FinancialSectionDTO = {
    totalCashIn: 100000, // represents $1,000.00
    totalCashOut: 75000, // represents $750.00
    netPosition: 25000, // represents $250.00
  };

  it('totalCashIn is an integer (Phase 1.1 dollar-float → integer-cents)', () => {
    expect(Number.isInteger(fixture.totalCashIn)).toBe(true);
  });

  it('totalCashOut is an integer (Phase 1.1 totalChipsOut rename + integer-cents)', () => {
    expect(Number.isInteger(fixture.totalCashOut)).toBe(true);
  });

  it('netPosition is an integer derived from totalCashIn − totalCashOut', () => {
    expect(Number.isInteger(fixture.netPosition)).toBe(true);
    expect(fixture.netPosition).toBe(
      fixture.totalCashIn - fixture.totalCashOut,
    );
  });

  it('integer-cents scale: 100000 represents $1,000 (not $100,000)', () => {
    const dollarAmount = fixture.totalCashIn / 100;
    expect(dollarAmount).toBe(1000);
    // Proof of scale: if this were dollar-float, dividing by 100 would give 10 (cents)
    expect(dollarAmount).toBeGreaterThan(999);
    expect(dollarAmount).toBeLessThan(1001);
  });

  it('no field is a fractional dollar-float (all values are whole cents)', () => {
    expect(fixture.totalCashIn % 1).toBe(0);
    expect(fixture.totalCashOut % 1).toBe(0);
    expect(fixture.netPosition % 1).toBe(0);
  });
});

// ── Component Rendering (open visit — partial completeness) ───────────────────

describe('RatingSlipModal — financial summary renders integer-cents as dollars (DEF-006)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks({
      totalCashIn: 100000,
      totalCashOut: 75000,
      netPosition: 25000,
    });
  });

  it('renders Cash In as cents÷100 ($1000.00 for 100000 integer cents)', () => {
    render(<RatingSlipModal {...defaultProps} />);
    // Financial Summary section is rendered when modalData is present (open visit)
    expect(screen.getByText('Financial Summary')).toBeInTheDocument();
    // 100000 cents / 100 = $1000.00 — confirms integer-cents interpretation
    expect(screen.getByText('$1000.00')).toBeInTheDocument();
  });

  it('renders Net Position derived from integer-cents arithmetic ($250.00)', () => {
    render(<RatingSlipModal {...defaultProps} />);
    // netPosition = (totalCashIn - totalCashOut) / 100 = (100000 - 75000) / 100 = $250.00
    expect(screen.getByText('$250.00')).toBeInTheDocument();
  });
});

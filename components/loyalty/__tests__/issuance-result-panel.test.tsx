/** @jest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';

import type { CompIssuanceResult, IssuanceResultDTO } from '@/services/loyalty';

import { IssuanceResultPanel } from '../issuance-result-panel';

/**
 * PRD-092 WS7 retired the legacy window.print()/usePrintReward contract on the
 * loyalty redemption surface. Printing is now MANUAL-FIRST (DEC-004) and routes
 * through the controlled action via useControlledPrint. These tests cover the
 * panel's manual-first rendering + the (decoupled) onFulfillmentReady
 * notification. Exhaustive controlled-print outcome/reprint coverage (submitted/
 * failed/unknown badges, nonce reprint, unknown duplicate-risk ack) is owned by
 * WS8's controlled-print test suite.
 */

const COMP_RESULT: CompIssuanceResult = {
  family: 'points_comp',
  ledgerId: '550e8400-e29b-41d4-a716-446655440000',
  pointsDebited: 500,
  balanceBefore: 2000,
  balanceAfter: 1500,
  rewardId: 'r-001',
  rewardCode: 'MEAL_25',
  rewardName: 'Meal Comp $25',
  faceValueCents: 2500,
  isExisting: false,
  issuedAt: '2026-03-20T15:30:00Z',
};

const BASE_PROPS = {
  result: COMP_RESULT as IssuanceResultDTO,
  error: null,
  playerName: 'John Smith',
  playerId: 'p-001',
  playerTier: 'Gold',
  casinoName: 'Grand Casino',
  staffName: 'Jane Doe',
  onClose: jest.fn(),
};

describe('IssuanceResultPanel', () => {
  describe('manual-first print (DEC-004 / GATE-UX-1)', () => {
    it('renders a manual "Print" button on a fresh issuance', () => {
      render(<IssuanceResultPanel {...BASE_PROPS} />);
      const btn = screen.getByRole('button', { name: /^print$/i });
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
    });

    it('renders no print outcome on a fresh issuance (no auto-print)', () => {
      render(<IssuanceResultPanel {...BASE_PROPS} />);
      // Manual-first: until the operator clicks Print there is no in-flight
      // "Sending…" state and no terminal outcome badge.
      expect(screen.queryByText(/sending/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/sent to printer/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/status unknown/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/not sent/i)).not.toBeInTheDocument();
    });

    it('does not surface a legacy re-drive "Print again" / "try again" affordance', () => {
      render(<IssuanceResultPanel {...BASE_PROPS} />);
      expect(
        screen.queryByRole('button', { name: /print again/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /try again/i }),
      ).not.toBeInTheDocument();
    });

    it('wires the Done button to onClose', () => {
      const onClose = jest.fn();
      render(<IssuanceResultPanel {...BASE_PROPS} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /done/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('fulfillment notification (decoupled from printing)', () => {
    it('fires onFulfillmentReady exactly once on fresh issuance', () => {
      const onFulfillmentReady = jest.fn();
      const { rerender } = render(
        <IssuanceResultPanel
          {...BASE_PROPS}
          onFulfillmentReady={onFulfillmentReady}
        />,
      );

      // Re-render with same props — should NOT fire again
      rerender(
        <IssuanceResultPanel
          {...BASE_PROPS}
          onFulfillmentReady={onFulfillmentReady}
        />,
      );

      // queueMicrotask fires async — flush
      return new Promise<void>((resolve) => {
        queueMicrotask(() => {
          expect(onFulfillmentReady).toHaveBeenCalledTimes(1);
          resolve();
        });
      });
    });

    it('does not fire onFulfillmentReady for duplicate issuances', () => {
      const onFulfillmentReady = jest.fn();
      const duplicateResult = { ...COMP_RESULT, isExisting: true };
      render(
        <IssuanceResultPanel
          {...BASE_PROPS}
          result={duplicateResult as IssuanceResultDTO}
          onFulfillmentReady={onFulfillmentReady}
        />,
      );

      return new Promise<void>((resolve) => {
        queueMicrotask(() => {
          expect(onFulfillmentReady).not.toHaveBeenCalled();
          resolve();
        });
      });
    });
  });
});

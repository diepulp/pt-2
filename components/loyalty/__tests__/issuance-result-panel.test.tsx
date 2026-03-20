/** @jest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';

import type { CompIssuanceResult, IssuanceResultDTO } from '@/services/loyalty';
import type { PrintInvocationMode } from '@/lib/print/types';

import { IssuanceResultPanel } from '../issuance-result-panel';

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
  describe('print button states', () => {
    it('shows "Print" when printState is idle', () => {
      render(<IssuanceResultPanel {...BASE_PROPS} printState="idle" />);
      expect(screen.getByRole('button', { name: /print/i })).toHaveTextContent(
        'Print',
      );
    });

    it('shows "Printing..." when printState is printing (disabled)', () => {
      render(<IssuanceResultPanel {...BASE_PROPS} printState="printing" />);
      const btn = screen.getByRole('button', { name: /printing/i });
      expect(btn).toHaveTextContent('Printing...');
      expect(btn).toBeDisabled();
    });

    it('shows "Print again" when printState is success (re-clickable)', () => {
      render(<IssuanceResultPanel {...BASE_PROPS} printState="success" />);
      const btn = screen.getByRole('button', { name: /print again/i });
      expect(btn).toHaveTextContent('Print again');
      expect(btn).not.toBeDisabled();
    });

    it('shows error text when printState is error (re-clickable)', () => {
      render(<IssuanceResultPanel {...BASE_PROPS} printState="error" />);
      const btn = screen.getByRole('button', { name: /try again/i });
      expect(btn).toHaveTextContent('Print failed — try again');
      expect(btn).not.toBeDisabled();
    });
  });

  describe('print button availability (AC10)', () => {
    it('Print button is clickable when printState is error', () => {
      const onPrint = jest.fn();
      render(
        <IssuanceResultPanel
          {...BASE_PROPS}
          printState="error"
          onPrint={onPrint}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(onPrint).toHaveBeenCalled();
    });

    it('Print button is clickable when printState is success (AC5 reprint)', () => {
      const onPrint = jest.fn();
      render(
        <IssuanceResultPanel
          {...BASE_PROPS}
          printState="success"
          onPrint={onPrint}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /print again/i }));
      expect(onPrint).toHaveBeenCalled();
    });
  });

  describe('onPrint callback', () => {
    it('fires onPrint with payload and manual_print mode from idle', () => {
      const onPrint = jest.fn();
      render(
        <IssuanceResultPanel
          {...BASE_PROPS}
          printState="idle"
          onPrint={onPrint}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /print/i }));

      expect(onPrint).toHaveBeenCalledTimes(1);
      const [payload, mode] = onPrint.mock.calls[0] as [
        unknown,
        PrintInvocationMode,
      ];
      expect((payload as { family: string }).family).toBe('points_comp');
      expect(mode).toBe('manual_print');
    });

    it('fires onPrint with manual_reprint mode from success state', () => {
      const onPrint = jest.fn();
      render(
        <IssuanceResultPanel
          {...BASE_PROPS}
          printState="success"
          onPrint={onPrint}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /print again/i }));

      const mode = onPrint.mock.calls[0][1] as PrintInvocationMode;
      expect(mode).toBe('manual_reprint');
    });
  });

  describe('auto-fire guard (DA P0-1)', () => {
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

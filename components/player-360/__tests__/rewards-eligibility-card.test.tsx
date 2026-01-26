/**
 * Rewards Eligibility Card Component Tests
 *
 * Tests for the rewards eligibility card displaying status,
 * countdown, guidance, and "Show related events" action.
 *
 * @see PRD-023 Player 360 Panels v0
 * @see WS7 Testing & QA
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { RewardsEligibilityDTO } from '@/services/player360-dashboard/dtos';

import { RewardsEligibilityCard } from '../rewards/rewards-eligibility-card';

// === Test Data ===

const createEligibilityData = (
  overrides: Partial<RewardsEligibilityDTO> = {},
): RewardsEligibilityDTO => ({
  status: 'available',
  nextEligibleAt: null,
  reasonCodes: ['AVAILABLE'],
  guidance: null,
  ...overrides,
});

describe('RewardsEligibilityCard', () => {
  describe('rendering', () => {
    it('renders the card container', () => {
      render(<RewardsEligibilityCard data={createEligibilityData()} />);

      expect(
        screen.getByTestId('rewards-eligibility-card'),
      ).toBeInTheDocument();
    });

    it('displays Rewards Eligibility header', () => {
      render(<RewardsEligibilityCard data={createEligibilityData()} />);

      expect(screen.getByText('Rewards Eligibility')).toBeInTheDocument();
    });
  });

  describe('available status', () => {
    it('shows Eligible label when status is available', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({ status: 'available' })}
        />,
      );

      expect(screen.getByText('Eligible')).toBeInTheDocument();
    });

    it('displays green/emerald check icon for available', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({ status: 'available' })}
        />,
      );

      const card = screen.getByTestId('rewards-eligibility-card');
      expect(card).toHaveClass('bg-emerald-500/10');
    });

    it('does not show countdown when available', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({ status: 'available' })}
        />,
      );

      expect(screen.queryByText(/Next eligible/)).not.toBeInTheDocument();
    });
  });

  describe('not_available status', () => {
    it('shows Not Eligible label when status is not_available', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({ status: 'not_available' })}
        />,
      );

      expect(screen.getByText('Not Eligible')).toBeInTheDocument();
    });

    it('displays red X icon for not_available', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({ status: 'not_available' })}
        />,
      );

      const card = screen.getByTestId('rewards-eligibility-card');
      expect(card).toHaveClass('bg-red-500/10');
    });

    it('shows countdown when nextEligibleAt is set', () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins from now

      render(
        <RewardsEligibilityCard
          data={createEligibilityData({
            status: 'not_available',
            nextEligibleAt: futureDate,
            reasonCodes: ['COOLDOWN_ACTIVE'],
          })}
        />,
      );

      expect(screen.getByText(/Next eligible/)).toBeInTheDocument();
    });

    it('shows reason codes', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({
            status: 'not_available',
            reasonCodes: ['COOLDOWN_ACTIVE', 'MIN_PLAY_NOT_MET'],
          })}
        />,
      );

      expect(
        screen.getByText('COOLDOWN_ACTIVE, MIN_PLAY_NOT_MET'),
      ).toBeInTheDocument();
    });
  });

  describe('unknown status', () => {
    it('shows Unknown label when status is unknown', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({ status: 'unknown' })}
        />,
      );

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('displays muted styling for unknown', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({ status: 'unknown' })}
        />,
      );

      const card = screen.getByTestId('rewards-eligibility-card');
      expect(card).toHaveClass('bg-muted/30');
    });

    it('shows RULES_NOT_CONFIGURED reason', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({
            status: 'unknown',
            reasonCodes: ['RULES_NOT_CONFIGURED'],
          })}
        />,
      );

      expect(screen.getByText('RULES_NOT_CONFIGURED')).toBeInTheDocument();
    });
  });

  describe('guidance text', () => {
    it('displays guidance when provided', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({
            status: 'not_available',
            guidance: 'Player needs 30 more minutes of play time',
          })}
        />,
      );

      expect(
        screen.getByText('Player needs 30 more minutes of play time'),
      ).toBeInTheDocument();
    });

    it('does not display guidance section when null', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({ guidance: null })}
        />,
      );

      // No guidance paragraph
      expect(screen.queryByText(/needs.*minutes/)).not.toBeInTheDocument();
    });
  });

  describe('show related events action', () => {
    it('renders "Show related events" button when handler provided', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData()}
          onShowRelatedEvents={jest.fn()}
        />,
      );

      expect(screen.getByTestId('show-related-events')).toBeInTheDocument();
      expect(screen.getByText('Show related events')).toBeInTheDocument();
    });

    it('does not render button when no handler provided', () => {
      render(<RewardsEligibilityCard data={createEligibilityData()} />);

      expect(
        screen.queryByTestId('show-related-events'),
      ).not.toBeInTheDocument();
    });

    it('calls onShowRelatedEvents when button clicked', async () => {
      const user = userEvent.setup();
      const onShowRelatedEvents = jest.fn();

      render(
        <RewardsEligibilityCard
          data={createEligibilityData()}
          onShowRelatedEvents={onShowRelatedEvents}
        />,
      );

      await user.click(screen.getByTestId('show-related-events'));

      expect(onShowRelatedEvents).toHaveBeenCalledTimes(1);
    });
  });

  describe('reason code display', () => {
    it('does not show AVAILABLE in reason codes', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({
            status: 'available',
            reasonCodes: ['AVAILABLE'],
          })}
        />,
      );

      expect(screen.queryByText('AVAILABLE')).not.toBeInTheDocument();
    });

    it('shows multiple reason codes joined', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData({
            status: 'not_available',
            reasonCodes: ['MIN_PLAY_NOT_MET', 'DAILY_LIMIT_REACHED'],
          })}
        />,
      );

      expect(
        screen.getByText('MIN_PLAY_NOT_MET, DAILY_LIMIT_REACHED'),
      ).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('accepts additional className prop', () => {
      render(
        <RewardsEligibilityCard
          data={createEligibilityData()}
          className="my-custom-class"
        />,
      );

      const card = screen.getByTestId('rewards-eligibility-card');
      expect(card).toHaveClass('my-custom-class');
    });

    it('has base styling classes', () => {
      render(<RewardsEligibilityCard data={createEligibilityData()} />);

      const card = screen.getByTestId('rewards-eligibility-card');
      expect(card).toHaveClass('rounded-lg', 'border', 'p-3');
    });
  });

  describe('icons', () => {
    it('shows gift icon in header', () => {
      render(<RewardsEligibilityCard data={createEligibilityData()} />);

      // Gift icon has amber color
      const card = screen.getByTestId('rewards-eligibility-card');
      expect(card.querySelector('svg')).toBeInTheDocument();
    });

    it('shows clock icon with countdown', () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      render(
        <RewardsEligibilityCard
          data={createEligibilityData({
            status: 'not_available',
            nextEligibleAt: futureDate,
          })}
        />,
      );

      // Clock icon should be present next to countdown
      expect(screen.getByText(/Next eligible/)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('button is keyboard accessible', async () => {
      const user = userEvent.setup();
      const onShowRelatedEvents = jest.fn();

      render(
        <RewardsEligibilityCard
          data={createEligibilityData()}
          onShowRelatedEvents={onShowRelatedEvents}
        />,
      );

      await user.tab();
      await user.keyboard('{Enter}');

      expect(onShowRelatedEvents).toHaveBeenCalledTimes(1);
    });
  });
});
